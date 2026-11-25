import { requireEnv } from "../env.js";
import { config, modelFor } from "../config.js";
import { languageRule } from "../language.js";
import { recordCall, type CallContext } from "./trace.js";
import { jobScope } from "../jobs/queue.js";
import { newId } from "../util.js";

export type Citation = { url: string; title: string; excerpt: string };
export type ResearchResult = { notes: string; citations: Citation[] };

type ChatResponse = {
  error?: { message?: string };
  provider?: string;
  choices?: {
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      reasoning?: string | null;
      annotations?: { type?: string; url_citation?: { url?: string; title?: string; content?: string } }[];
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    cost?: number;
    server_tool_use_details?: { web_search_requests?: number };
  };
};

/**
 * A reply cut off on the way (a body that does not parse, whatever the status said). It passes on its own, so the call
 * is tried again: known by its class, not by the words of its message.
 */
export class CutReply extends Error {
  constructor(status: number) {
    super(`The reply was cut off on the way (HTTP ${status})`);
    this.name = "CutReply";
  }
}
/** Whether a failed request is one that passes on its own (the connection, the upstream, a rate limit) and is worth sending again. */
export function passes(err: unknown): boolean {
  if (err instanceof CutReply) return true;
  const status = (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : String(err);
  return status === undefined ? /fetch failed|network|socket|ECONNRESET|ETIMEDOUT|timeout|aborted/i.test(message) : status === 429 || status >= 500 || /upstream/i.test(message);
}

const RESEARCH_SYSTEM = `You are a rigorous investigative researcher of history and business. For the task, search the web first, fetch the original pages or PDFs and read them in full where necessary, then write detailed research notes.
What the notes need:
- list the specific facts one by one: who, did what, when (as exact as possible, to the year, month and day), numbers and amounts;
- distinguish what was "publicly reported at the time" from what was "disclosed only afterwards (investigations, lawsuits, memoirs)", and say when and through what channel it was disclosed;
- keep the key original words, or the original text of documents, where you can (short quotations);
- mark each fact with the address of its source;
- say where the material is insufficient or contradicts itself.
Do not make anything up; when something cannot be found, write "not found".`;

/** What answers in place of a live lookup, in a test (never set in a run). */
export type ResearchStandIn = (ctx: CallContext, task: string) => ResearchResult | Promise<ResearchResult>;
let standIn: ResearchStandIn | null = null;
/** Tests only: every research call is answered by `fn` (null puts the live lookup back). */
export function standInForResearch(fn: ResearchStandIn | null): void {
  standIn = fn;
}

/** One research call: the model searches and fetches server-side, then writes cited notes. */
export async function research(
  ctx: CallContext,
  task: string,
  limits?: { searches?: number; fetches?: number; system?: string },
): Promise<ResearchResult> {
  if (standIn) return standIn(ctx, task);
  if(process.env.KALCHAS_TEST_OFFLINE==="1")throw new Error(`Offline test without a stand-in for the research: ${ctx.purpose}`);
  const cfg = config();
  const modelId = modelFor(ctx.purpose);
  const searches = limits?.searches ?? cfg.build.maxSearchesPerTask;
  const fetches = limits?.fetches ?? cfg.build.maxFetchesPerTask;
  const started = Date.now();
  const body = {
    model: modelId,
    messages: [
      { role: "system", content: `${limits?.system ?? RESEARCH_SYSTEM}\n${languageRule(ctx.worldId)}` },
      { role: "user", content: task },
    ],
    tools: [
      {
        type: "openrouter:web_search",
        parameters: { engine: cfg.search.engine, max_results: cfg.search.maxResults, max_uses: searches },
      },
      // reading whole pages only when asked for (a reader with no uses is refused)
      ...(fetches > 0 ? [{ type: "openrouter:web_fetch", parameters: { engine: cfg.fetch.engine, max_uses: fetches } }] : []),
    ],
    max_tool_calls: searches + fetches + 2,
    usage: { include: true },
    provider: config().providers[modelId]?.length ? { order: config().providers[modelId], allow_fallbacks: true } : { sort: "throughput" },
  };
  let data: ChatResponse | null = null;
  const run = newId("run");
  let tries = 0;
  // Network drops and upstream 5xx/429 are common and pass on their own: retry those, give up on anything else.
  for (let attempt = 1; ; attempt++) {
    const tried = Date.now();
    tries = attempt;
    let raw = "";
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Title": "Kalchas",
        },
        body: JSON.stringify(body),
        // stops with its job; a reply cut off at the time limit is a failure that passes, tried again below
        signal: AbortSignal.any([AbortSignal.timeout(300_000), ...(jobScope() ? [jobScope()!.signal] : [])]),
      });
      // a body that does not parse was cut off on the way (status 200 notwithstanding): treated as a dropped connection
      raw = await res.text().catch(() => "");
      const json = (() => {
        try {
          return JSON.parse(raw) as ChatResponse;
        } catch {
          throw new CutReply(res.status);
        }
      })();
      if (!res.ok || json.error) throw Object.assign(new Error(json.error?.message ?? `HTTP ${res.status}`), { status: res.status });
      data = json;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordCall(ctx, { model: modelId, run, attempt, lane: "main", startedAt: new Date(tried).toISOString(), inputTokens: 0, outputTokens: 0, costUsd: 0, ms: Date.now() - tried, ok: false, error: message, output: raw });
      if (jobScope()?.signal.aborted) throw err;
      if (!passes(err) || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }
  const msg = data!.choices?.[0]?.message;
  const notes = msg?.content ?? "";
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const a of msg?.annotations ?? []) {
    const c = a.url_citation;
    if (!c?.url || seen.has(c.url)) continue;
    seen.add(c.url);
    citations.push({ url: c.url, title: c.title ?? "", excerpt: (c.content ?? "").slice(0, 4000) });
  }
  recordCall(ctx, {
    model: data!.provider ? `${modelId} @${data!.provider}` : modelId,
    run,
    attempt: tries,
    lane: "main",
    provider: data!.provider ?? null,
    startedAt: new Date(started).toISOString(),
    finishReason: data!.choices?.[0]?.finish_reason ?? null,
    reasoningTokens: data!.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    cachedTokens: data!.usage?.prompt_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens: data!.usage?.prompt_tokens_details?.cache_write_tokens ?? null,
    thinking: msg?.reasoning ?? null,
    inputTokens: data!.usage?.prompt_tokens ?? 0,
    outputTokens: data!.usage?.completion_tokens ?? 0,
    costUsd: data!.usage?.cost ?? 0,
    searches: data!.usage?.server_tool_use_details?.web_search_requests ?? 0,
    ms: Date.now() - started,
    ok: true,
    output: notes,
  });
  return { notes, citations };
}
