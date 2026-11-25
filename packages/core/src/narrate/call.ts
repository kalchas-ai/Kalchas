import { stepCountIs, streamText, type ModelMessage, type ToolSet } from "ai";
import { effortFor } from "../config.js";
import { cacheUse, chatModel } from "../llm/generate.js";
import { callStarted, recordCall, type CallContext } from "../llm/trace.js";
import { newId } from "../util.js";

/**
 * One call of engine 12: the model reads the play (the messages, as context.ts puts them together), looks things up
 * and rolls as it needs, round after round (the tool loop of the AI SDK, as the adviser's), and writes its answer in
 * tags, streamed as it is written. What it wrote, every tool it called and what each gave back come back with the
 * answer, to be kept in the play's history as they happened (its thinking is not: no provider takes it back). Every
 * round is kept in the call records with what it cost, what it thought and how much of it the provider read from its
 * cache. A guard, not a rule: past `rounds` rounds the last one may only write (a fault, kept).
 */

/** The marker for the provider's cache, as OpenRouter takes it (Anthropic's `cache_control`). */
export const CACHE = { openrouter: { cacheControl: { type: "ephemeral" as const } } };

type Usage = { inputTokens?: number; outputTokens?: number; outputTokenDetails?: { reasoningTokens?: number }; inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number } };
type Meta = { openrouter?: { provider?: string; usage?: { cost?: number; completionTokensDetails?: { reasoningTokens?: number }; promptTokensDetails?: { cachedTokens?: number; cacheWriteTokens?: number } } } };

export type NarrateCall = {
  ctx: CallContext;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  /** The guard on rounds of looking up and rolling. */
  rounds: number;
  /** Given the whole text written so far, each time it grows. */
  onText?: (soFar: string) => void;
  /** Told of each tool the model calls, as it calls it. */
  onTool?: (name: string, input: Record<string, unknown>) => void;
  /** How long the whole call may take. */
  timeoutMs?: number;
};

/**
 * What a call wrote. `close` keeps the record of its closing round (the one that wrote the answer) under the purpose
 * the caller gives it once it has read the answer: the page knows a stop is done from a closing round kept as
 * `moment`, and an answer to a question from one kept as `advise`; every round before it, that looked something up or
 * rolled, is kept at once under the call's own purpose, in the same run. A caller always closes, once.
 */
export type NarrateResult = {
  text: string;
  /** The call's exchange after the messages it was given, as the history keeps it: what the model wrote and the tools it called, and what each gave back. */
  messages: ModelMessage[];
  rounds: number;
  runaway: boolean;
  costUsd: number;
  close: (purpose: string) => void;
};

/** What answers in place of the model in a test: the text it writes, after using the tools it likes (`use`). */
export type NarrateStandIn = (call: { purpose: string; system: string; messages: ModelMessage[] }, use: (tool: string, input: Record<string, unknown>) => Promise<unknown>) => string | Promise<string>;
let standIn: NarrateStandIn | null = null;
/** Tests only: every engine-12 call is answered by `fn` (null puts the model back). */
export function standInForNarrate(fn: NarrateStandIn | null): void {
  standIn = fn;
}

/**
 * An exchange as the history keeps it: without the model's thinking (no provider takes earlier thinking back) and
 * without anything said to the provider alone (cache marks, routing details); a message left with nothing is dropped.
 */
export function keptMessages(messages: ModelMessage[]): ModelMessage[] {
  const bare = <T extends object>(x: T): T => {
    const { providerOptions: _p, ...rest } = x as T & { providerOptions?: unknown };
    return rest as T;
  };
  return messages.flatMap((m): ModelMessage[] => {
    if (!Array.isArray(m.content)) return typeof m.content === "string" && !m.content.trim() ? [] : [bare(m)];
    const parts = (m.content as { type: string; text?: string }[]).filter((p) => p.type !== "reasoning" && p.type !== "reasoning-file" && !(p.type === "text" && !p.text?.trim())).map(bare);
    return parts.length ? [{ ...bare(m), content: parts } as ModelMessage] : [];
  });
}

/** A copy of a message with the cache marker taken off it and off each of its parts. */
function unmarked(m: ModelMessage): ModelMessage {
  const strip = <T extends { providerOptions?: unknown }>(x: T): T => {
    const po = x.providerOptions as { openrouter?: Record<string, unknown> } | undefined;
    if (!po?.openrouter || !("cacheControl" in po.openrouter)) return x;
    const { cacheControl: _c, ...rest } = po.openrouter;
    const next = { ...(po as object), openrouter: rest } as Record<string, unknown>;
    if (!Object.keys(rest).length) delete next.openrouter;
    return { ...x, providerOptions: Object.keys(next).length ? next : undefined };
  };
  const out = strip(m as ModelMessage & { providerOptions?: unknown }) as ModelMessage;
  if (Array.isArray(out.content)) (out as { content: unknown[] }).content = out.content.map((p) => strip(p as { providerOptions?: unknown }));
  return out;
}

/**
 * A message with the cache marker on it. A user message carries it on itself (the provider puts it on its one text).
 * What came back from the tools carries it on its last result alone: the provider gives every result of a message its
 * own copy of a mark set on the message, and a round that looked several things up at once would carry more marks than
 * a request may.
 */
function marked(m: ModelMessage): ModelMessage {
  const on = (po: unknown) => ({ ...((po as Record<string, unknown> | undefined) ?? {}), openrouter: { ...((po as { openrouter?: Record<string, unknown> } | undefined)?.openrouter ?? {}), ...CACHE.openrouter } });
  if (m.role === "tool") {
    if (!Array.isArray(m.content) || !m.content.length) return m;
    const parts = [...m.content];
    const lastPart = parts[parts.length - 1]! as { providerOptions?: unknown };
    parts[parts.length - 1] = { ...lastPart, providerOptions: on(lastPart.providerOptions) } as unknown as (typeof parts)[number];
    return { ...m, content: parts };
  }
  return { ...m, providerOptions: on(m.providerOptions) } as ModelMessage;
}

/**
 * The messages of one round, marked for the cache at no more than three places (the system makes four, the most a
 * request may carry): the person's turn before this one (the previous move, or the setting up's request: what the call
 * before wrote to the cache ends there, so it is read whatever came after it), the end of the turn now given, and, once
 * the round has looked something up, the end of what came back, so that the next round reads all of it from the cache.
 */
export function markRound(messages: ModelMessage[], given: number): ModelMessage[] {
  const out = messages.map(unmarked);
  const at = new Set([given - 1]);
  for (let i = given - 2; i >= 0; i--)
    if (out[i]!.role === "user") {
      at.add(i);
      break;
    }
  if (out.length > given && out[out.length - 1]!.role === "tool") at.add(out.length - 1);
  return out.map((m, i) => (at.has(i) ? marked(m) : m));
}

export async function narrate(call: NarrateCall): Promise<NarrateResult> {
  const { ctx } = call;
  if (standIn) {
    const exchange: ModelMessage[] = [];
    const use = async (name: string, input: Record<string, unknown>) => {
      const t = call.tools[name] as { execute?: (input: unknown, opts: unknown) => unknown } | undefined;
      if (!t?.execute) throw new Error(`No such tool: ${name}`);
      call.onTool?.(name, input);
      const toolCallId = newId("tc");
      const output = await t.execute(input, { toolCallId, messages: [] });
      exchange.push({ role: "assistant", content: [{ type: "tool-call", toolCallId, toolName: name, input }] }, { role: "tool", content: [{ type: "tool-result", toolCallId, toolName: name, output: { type: "json", value: output as never } }] });
      return output;
    };
    const text = await standIn({ purpose: ctx.purpose, system: call.system, messages: call.messages }, use);
    if (text) exchange.push({ role: "assistant", content: [{ type: "text", text }] });
    call.onText?.(text);
    let closed = false;
    const close = (purpose: string) => {
      if (closed) return;
      closed = true;
      recordCall({ ...ctx, purpose }, { model: "stand-in", inputTokens: 0, outputTokens: 0, costUsd: 0, ms: 0, ok: true, output: text });
    };
    return { text, messages: exchange, rounds: 1, runaway: false, costUsd: 0, close };
  }
  if (process.env.KALCHAS_TEST_OFFLINE === "1") throw new Error(`Offline test without a stand-in for the model: ${ctx.purpose}`);
  const { model, modelId } = await chatModel(ctx.purpose);
  const effort = effortFor(ctx.purpose);
  const runId = newId("run");
  const given = call.messages.length;
  let attempt = 0;
  let stepStarted = Date.now();
  let text = "";
  let rounds = 0;
  let runaway = false;
  let costUsd = 0;
  // the closing round's record, kept until the caller has read the answer and says what it was
  let closing: Parameters<typeof recordCall>[1] | null = null;
  const done = callStarted(ctx);
  try {
    const result = streamText({
      model,
      system: [{ role: "system", content: call.system, providerOptions: CACHE }],
      messages: markRound(call.messages, given),
      tools: call.tools,
      stopWhen: stepCountIs(call.rounds),
      // the cache markers move with the rounds; the last round may only write: what it has by then is what it writes from
      prepareStep: ({ stepNumber, messages }) => ({ messages: markRound(messages, given), ...(stepNumber >= call.rounds - 1 ? { toolChoice: "none" as const } : {}) }),
      ...(effort ? { providerOptions: { openrouter: { reasoning: { effort } } } } : {}),
      maxOutputTokens: 32_000,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(call.timeoutMs ?? 15 * 60_000),
      onStepFinish: (s) => {
        rounds++;
        if (rounds >= call.rounds && s.toolCalls.length) runaway = true;
        const usage = s.usage as Usage;
        const md = (s.providerMetadata as Meta | undefined)?.openrouter;
        costUsd += md?.usage?.cost ?? 0;
        const record: Parameters<typeof recordCall>[1] = {
          run: runId,
          attempt: ++attempt,
          lane: "main",
          model: md?.provider ? `${modelId} @${md.provider}` : modelId,
          provider: md?.provider ?? null,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          reasoningTokens: md?.usage?.completionTokensDetails?.reasoningTokens ?? usage.outputTokenDetails?.reasoningTokens ?? null,
          ...cacheUse(usage, md),
          costUsd: md?.usage?.cost ?? 0,
          ms: Date.now() - stepStarted,
          startedAt: new Date(stepStarted).toISOString(),
          ok: true,
          finishReason: s.finishReason,
          thinking: s.reasoningText ?? null,
          output: JSON.stringify({ text: s.text, tools: s.toolCalls.map((c) => ({ name: c.toolName, input: c.input })) }),
        };
        if (s.toolCalls.length) recordCall(ctx, record);
        else {
          // (a round that wrote and looked nothing up is the closing one; one before it that did the same is kept now)
          if (closing) recordCall(ctx, closing);
          closing = record;
        }
        stepStarted = Date.now();
      },
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text;
        call.onText?.(text);
      } else if (part.type === "tool-call") call.onTool?.(part.toolName, (part.input ?? {}) as Record<string, unknown>);
      else if (part.type === "error") throw part.error instanceof Error ? part.error : new Error(String(part.error));
    }
    const messages = keptMessages(await result.responseMessages);
    let closed = false;
    const close = (purpose: string) => {
      if (closed) return;
      closed = true;
      if (closing) recordCall({ ...ctx, purpose }, closing);
    };
    return { text, messages, rounds, runaway, costUsd, close };
  } catch (err) {
    if (closing) recordCall(ctx, closing);
    const message = err instanceof Error ? err.message : String(err);
    recordCall(ctx, { run: runId, attempt: attempt + 1, lane: "main", model: modelId, inputTokens: 0, outputTokens: 0, costUsd: 0, ms: Date.now() - stepStarted, ok: false, error: message, output: text || undefined });
    throw err;
  } finally {
    done();
  }
}
