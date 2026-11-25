import { stepCountIs, streamText, tool, type ToolSet } from "ai";
import { z } from "zod";
import { chatModel } from "../llm/generate.js";
import { callStarted, recordCall, type CallContext } from "../llm/trace.js";
import { webSearch, type Hit } from "../forecast/search.js";
import { config } from "../config.js";
import { languageRule, tx } from "../language.js";
import { newId, truncate } from "../util.js";
import { readPage } from "../net.js";

/**
 * The adviser: the chat box under a play. It looks things up as it needs (the play's own records through the play's
 * tools, the web through the shared ones), as many rounds as it takes, then writes its answer, streamed as it is
 * written. The play gives it what is its own: a brief, what it always knows, its tools, and where the answer is kept.
 */

/** One thing it looked up, as the conversation shows it. */
export type ChatStep = { label: string; note?: string; failed?: boolean };

export type ChatEvent =
  | { type: "step"; id: string; label: string; state: "run" | "done" | "fail"; note?: string }
  /** What it wrote before looking something up is not the answer: the text so far is put aside. */
  | { type: "reset" }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type ChatTurn = { role: "user" | "assistant"; text: string };

/** What it found on the web in one answer, and what it drew or proposed through the place's tools. */
export type ChatRun = { pages: Map<string, Hit>; extras: Record<string, unknown> };

export type ChatScope = {
  ctx: CallContext;
  /** Who it is here and what it must not do (in addition to the shared rules). */
  brief: string;
  /** What it always has in front of it: the situation, briefly. */
  context: string;
  history: ChatTurn[];
  /** The place's own tools; they may put things into `run.extras` (a picture, moves to suggest). */
  tools: (run: ChatRun) => ToolSet;
  /** Keeps the question and the answer where this place keeps its conversation. */
  save: (question: string, answer: string, steps: ChatStep[], run: ChatRun) => Promise<void> | void;
};

const MAX_STEPS = 12;
/** Tools that are part of the answer (a picture, moves to suggest), not something looked up. */
const OUTPUT = new Set(["draw", "suggest_moves"]);
const MAX_SEARCHES = 6;
const MAX_READS = 4;

const SHARED = `You are the adviser of Kalchas, in conversation with a person who is making a decision. You have tools: find out first, then answer.
How you work:
- first think through what they really want to know and what information that takes; look in what you have been given and the play's own records first (cheap, reliable), and search the web only when that is not enough, is out of date or needs checking; read the page itself when necessary;
- you may look things up over several rounds: when a result raises a new question, go on looking, until there is enough to answer; a simple question that needs no looking up is answered directly;
- before a tool call that looks something up, write no text meant for them; when the looking up is done, write the answer in one go (the tools that draw a picture or propose moves may be called before or after the answer);
- answer in Markdown: the conclusion in one sentence first, then a few points as needed; plain words, few technical terms;
- the usual length is 200–500 CJK characters (about 100–250 words in other languages); write only what is useful to their decision, do not pile up data; expand only when they ask in detail or ask for more;
- specific facts, numbers and dates need a source: for what comes from the play, say so; for what you have just looked up, name the source and attach the link; when something cannot be found, say so plainly, do not make it up;
- a guess is said to be a guess, and what it rests on; do not flatter, do not make the decision for them;
- never write any internal identifier in the answer (the ids of facts, events, items).`;

/** How a tool call reads in the conversation, in the project's language. */
function label(worldId: string | null | undefined, name: string, input: Record<string, unknown>): string {
  const q = (k: string) => truncate(String(input[k] ?? ""), 40);
  switch (name) {
    case "web_search":
      return tx(worldId, "chat.search", { query: q("query") });
    case "read_page":
      return tx(worldId, "chat.read", { url: truncate(String(input.url ?? "").replace(/^https?:\/\/(www\.)?/, ""), 48) });
    case "known_facts":
      return tx(worldId, "chat.known", { query: q("query") });
    case "recent_events":
      return tx(worldId, "chat.recent");
    case "draw":
      return tx(worldId, "chat.draw");
    case "suggest_moves":
      return tx(worldId, "chat.moves");
    case "earlier_stops":
      return tx(worldId, "chat.earlier");
    case "record_instruction":
      return tx(worldId, "chat.instruction");
    default:
      return name;
  }
}

/** A result's one-line gist: how many it found, or nothing. */
function gist(output: unknown): string | undefined {
  if (output && typeof output === "object" && "note" in output && typeof (output as { note: unknown }).note === "string") return (output as { note: string }).note;
  return undefined;
}

/**
 * The web: searching, and reading a page in full. What it found is kept in `run.pages`.
 * A result's `note` is the line the conversation shows under the step (interface text); what went wrong is said to the
 * model in `problem`.
 */
export function webTools(ctx: CallContext, run: ChatRun): ToolSet {
  let searches = 0;
  let reads = 0;
  return {
    web_search: tool({
      description: "Search the web. For the latest state of things, for what the project's material does not have, for claims that need checking. Use short, specific search terms (in English or the local language where necessary). Returns page titles, links and excerpts.",
      inputSchema: z.object({ query: z.string().describe("The search terms") }),
      execute: async ({ query }) => {
        if (++searches > MAX_SEARCHES) return { note: tx(ctx.worldId, "chat.noSearches"), problem: "no searches left for this answer", results: [] };
        const hits = await webSearch(ctx, query, undefined, 6);
        for (const h of hits) if (!run.pages.has(h.url)) run.pages.set(h.url, h);
        return { note: tx(ctx.worldId, "chat.results", { count: hits.length }), results: hits.map((h) => ({ title: h.title, url: h.url, excerpt: truncate(h.content.replace(/\s+/g, " "), 700) })) };
      },
    }),
    read_page: tool({
      description: "Read the body text of a web page (one from the search results, or a link they gave). Read only when the excerpt is not enough.",
      inputSchema: z.object({ url: z.string().describe("The address of the page") }),
      execute: async ({ url }) => {
        if (++reads > MAX_READS) return { note: tx(ctx.worldId, "chat.noReads"), problem: "no page reads left for this answer", text: "" };
        const known = run.pages.get(url);
        if (known && known.content.length > 1500) return { note: tx(ctx.worldId, "chat.pageRead"), text: known.content };
        const text = await readPage(url);
        if (!text) return { note: tx(ctx.worldId, "chat.pageUnread"), problem: "the page could not be read", text: known?.content ?? "" };
        run.pages.set(url, { url, title: known?.title ?? url, content: text.slice(0, 4000) });
        return { note: tx(ctx.worldId, "chat.pageRead"), text: text.slice(0, 8000) };
      },
    }),
  };
}

type Usage = { inputTokens?: number; outputTokens?: number; outputTokenDetails?: { reasoningTokens?: number }; inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number } };
type Meta = { openrouter?: { provider?: string; usage?: { cost?: number } } };

/** What answers in place of the model in a test: given what the adviser is given, it may use the tools (`use`), and writes the answer. */
export type ChatStandIn = (call: { brief: string; context: string; history: ChatTurn[]; question: string }, use: (tool: string, input: Record<string, unknown>) => Promise<unknown>) => string | Promise<string>;
let standIn: ChatStandIn | null = null;
/** Tests only: every adviser call is answered by `fn` (null puts the model back). */
export function standInForChat(fn: ChatStandIn | null): void {
  standIn = fn;
}

/** A test's stand-in answering: the tools it uses are run as the model's would be, shown as steps; the answer is kept the same way. */
async function standInChat(fn: ChatStandIn, scope: ChatScope, question: string, tools: ToolSet, run: ChatRun, emit: (e: ChatEvent) => void) {
  const steps: ChatStep[] = [];
  const use = async (name: string, input: Record<string, unknown>) => {
    const t = tools[name] as { execute?: (input: unknown, o: unknown) => unknown } | undefined;
    if (!t?.execute) throw new Error(`no tool ${name}`);
    const id = newId("call");
    const out = await t.execute(input, { toolCallId: id, messages: [] });
    if (!OUTPUT.has(name)) {
      const l = label(scope.ctx.worldId, name, input);
      steps.push({ label: l, note: gist(out) });
      emit({ type: "step", id, label: l, state: "done", note: gist(out) });
    }
    return out;
  };
  const text = (await fn({ brief: scope.brief, context: scope.context, history: scope.history, question }, use)).trim();
  if (!text) throw new Error(tx(scope.ctx.worldId, "chat.noAnswer"));
  emit({ type: "text", delta: text });
  await scope.save(question, text, steps, run);
  emit({ type: "done" });
  return { text, steps, run };
}

/**
 * Asks the adviser. `emit` gets what happens as it happens (what it looks up, the answer as it is written); the answer
 * is kept by the place once it is done, whether or not anyone is still listening.
 */
export async function runChat(scope: ChatScope, question: string, emit: (e: ChatEvent) => void = () => {}): Promise<{ text: string; steps: ChatStep[]; run: ChatRun }> {
  const { ctx } = scope;
  const run: ChatRun = { pages: new Map(), extras: {} };
  const tools = { ...webTools(ctx, run), ...scope.tools(run) };
  if (standIn) return standInChat(standIn, scope, question, tools, run, emit);
  if (process.env.KALCHAS_TEST_OFFLINE === "1") throw new Error(`Offline test without a stand-in for the model: ${ctx.purpose}`);
  const { model, modelId } = await chatModel(ctx.purpose);
  const runId = newId("run");
  const steps: ChatStep[] = [];
  const open = new Map<string, number>();
  let kept = "";
  let stepText = "";
  let attempt = 0;
  let stepStarted = Date.now();
  const done = callStarted(ctx);
  try {
    const result = streamText({
      model,
      system: `${SHARED}\n\n${scope.brief}\n\n${languageRule(ctx.worldId)}\n\n[Background]\n${scope.context}`,
      messages: [
        ...scope.history.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: question },
      ],
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      // the last round only writes: whatever it has found by then is what it answers from
      prepareStep: ({ stepNumber }) => (stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" as const } : undefined),
      temperature: 0.4,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(300_000),
      onStepFinish: (s) => {
        const usage = s.usage as Usage;
        const md = (s.providerMetadata as Meta | undefined)?.openrouter;
        recordCall(ctx, {
          run: runId,
          attempt: ++attempt,
          lane: "main",
          model: md?.provider ? `${modelId} @${md.provider}` : modelId,
          provider: md?.provider ?? null,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? null,
          cachedTokens: (md as { usage?: { promptTokensDetails?: { cachedTokens?: number } } } | undefined)?.usage?.promptTokensDetails?.cachedTokens ?? usage.inputTokenDetails?.cacheReadTokens ?? null,
          cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? null,
          costUsd: md?.usage?.cost ?? 0,
          ms: Date.now() - stepStarted,
          startedAt: new Date(stepStarted).toISOString(),
          ok: true,
          finishReason: s.finishReason,
          thinking: s.reasoningText ?? null,
          output: JSON.stringify({ text: s.text, tools: s.toolCalls.map((c) => ({ name: c.toolName, input: c.input })) }),
        });
        stepStarted = Date.now();
      },
    });
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "start-step":
          stepText = "";
          break;
        case "text-delta": {
          // a later round's writing continues the answer, as a new paragraph
          const delta = !stepText && kept.trim() ? `\n\n${part.text}` : part.text;
          stepText += delta;
          emit({ type: "text", delta });
          break;
        }
        case "tool-call": {
          if (OUTPUT.has(part.toolName)) {
            // drawing or proposing moves is part of answering: what it wrote stays
            kept += stepText;
          } else {
            // what it wrote before deciding to look something up was not the answer
            if ((kept + stepText).trim()) emit({ type: "reset" });
            kept = "";
          }
          stepText = "";
          if (OUTPUT.has(part.toolName)) break;
          const l = label(ctx.worldId, part.toolName, (part.input ?? {}) as Record<string, unknown>);
          open.set(part.toolCallId, steps.push({ label: l }) - 1);
          emit({ type: "step", id: part.toolCallId, label: l, state: "run" });
          break;
        }
        case "tool-result": {
          const i = open.get(part.toolCallId);
          if (i === undefined) break;
          const note = gist(part.output);
          steps[i] = { ...steps[i]!, note };
          emit({ type: "step", id: part.toolCallId, label: steps[i]!.label, state: "done", note });
          break;
        }
        case "tool-error": {
          const i = open.get(part.toolCallId);
          if (i === undefined) break;
          const failed = tx(ctx.worldId, "chat.failed");
          steps[i] = { ...steps[i]!, failed: true, note: failed };
          emit({ type: "step", id: part.toolCallId, label: steps[i]!.label, state: "fail", note: failed });
          break;
        }
        case "finish-step":
          kept += stepText;
          stepText = "";
          break;
        case "error":
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
      }
    }
    const text = kept.trim();
    if (!text) throw new Error(tx(scope.ctx.worldId, "chat.noAnswer"));
    await scope.save(question, text, steps, run);
    emit({ type: "done" });
    return { text, steps, run };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordCall(ctx, { run: runId, attempt: attempt + 1, lane: "main", model: modelId, inputTokens: 0, outputTokens: 0, costUsd: 0, ms: Date.now() - stepStarted, ok: false, error: message });
    emit({ type: "error", message });
    throw err;
  } finally {
    done();
  }
}
