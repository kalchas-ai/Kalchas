import { requireEnv } from "../env.js";
import { config } from "../config.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { recordCall, type CallContext } from "../llm/trace.js";
import { CutReply, passes } from "../llm/research.js";
import { jobScope } from "../jobs/queue.js";
import { newId } from "../util.js";

/**
 * One web search, sent exactly as it was written and kept with what it found. What to search for, and whether what
 * came back is enough, is never decided here (see narrate/tools.ts and chat/agent.ts): this only carries a query to
 * the engine.
 */

export type Hit = { url: string; title: string; content: string };
export type Engine = "exa" | "parallel";

export const engineOf = (): Engine => (config().search.engine === "parallel" ? "parallel" : "exa");
/** URLs compared loosely: scheme, www., trailing slash, case. */
export const normUrl = (u: string) => u.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[/#?]+$/, "").toLowerCase();

/** One search, exactly as written: the web plugin searches for the message it is given and returns the pages. */
/**
 * The model a search is sent through. It writes nothing (the pages are the answer, one token at most), so it is only
 * the carrier for the search: the cheapest that carries it, whatever model reads and judges the pages.
 */
const CARRIER = "deepseek/deepseek-v4.1-flash-1017";

/**
 * For the exams: KALCHAS_SEARCH_CACHE=<folder> keeps every search's results there, so runs that compare ways of
 * working send the same query once and read the same pages (the differences are then the method's, and the search
 * fee is paid once). Never on in the product.
 */
function cached(query: string, engine: Engine, maxResults: number): { read: () => Hit[] | null; write: (h: Hit[]) => void } {
  const dir = process.env.KALCHAS_SEARCH_CACHE?.trim();
  if (!dir) return { read: () => null, write: () => {} };
  const file = join(dir, `${createHash("sha1").update(`${engine}|${maxResults}|${query}`).digest("hex")}.json`);
  return {
    read: () => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Hit[]) : null),
    write: (h) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(h));
    },
  };
}

/** What answers in place of a live search, in a test (never set in a run); it may throw, as a search that failed does. */
export type SearchStandIn = (ctx: CallContext, query: string) => Hit[] | Promise<Hit[]>;
let standIn: SearchStandIn | null = null;
/** Tests only: every search is answered by `fn` (null puts the live search back). */
export function standInForSearch(fn: SearchStandIn | null): void {
  standIn = fn;
}

export async function webSearch(ctx: CallContext, query: string, engine: Engine = engineOf(), maxResults = 8): Promise<Hit[]> {
  if (standIn) return standIn(ctx, query);
  const model = CARRIER;
  const cache = cached(query, engine, maxResults);
  const hit = cache.read();
  if (hit) {
    recordCall(ctx, { model: `${model} · ${engine} · cached`, inputTokens: 0, outputTokens: 0, costUsd: 0, ms: 0, ok: true, output: JSON.stringify({ query, engine, urls: hit.map((h) => h.url), cached: true }) });
    return hit;
  }
  const run = newId("run");
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    const log = { run, attempt, lane: "main" as const, startedAt: new Date(started).toISOString() };
    let raw = "";
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Kalchas" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: query }],
          plugins: [{ id: "web", engine, max_results: maxResults }],
          // nothing is written: the pages are the answer
          max_tokens: 1,
          reasoning: { effort: "none" },
          usage: { include: true },
        }),
        signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(jobScope() ? [jobScope()!.signal] : [])]),
      });
      type R = {
        error?: { message?: string };
        choices?: { message?: { annotations?: { url_citation?: { url?: string; title?: string; content?: string } }[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      raw = await res.text().catch(() => "");
      const j = (() => {
        try {
          return JSON.parse(raw) as R;
        } catch {
          throw new CutReply(res.status);
        }
      })();
      if (!res.ok || j.error) throw Object.assign(new Error(j.error?.message ?? `HTTP ${res.status}`), { status: res.status });
      const seen = new Set<string>();
      const hits: Hit[] = [];
      for (const a of j.choices?.[0]?.message?.annotations ?? []) {
        const c = a.url_citation;
        if (!c?.url || seen.has(c.url)) continue;
        seen.add(c.url);
        hits.push({ url: c.url, title: c.title ?? "", content: (c.content ?? "").slice(0, 4000) });
      }
      recordCall(ctx, {
        ...log,
        model: `${model} · ${engine}`,
        inputTokens: j.usage?.prompt_tokens ?? 0,
        outputTokens: j.usage?.completion_tokens ?? 0,
        costUsd: j.usage?.cost ?? 0,
        searches: 1,
        ms: Date.now() - started,
        ok: true,
        output: JSON.stringify({ query, engine, hits: hits.map((h) => ({ url: h.url, title: h.title })) }),
      });
      cache.write(hits);
      return hits;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordCall(ctx, { ...log, model: `${model} · ${engine}`, inputTokens: 0, outputTokens: 0, costUsd: 0, ms: Date.now() - started, ok: false, error: message, output: raw || JSON.stringify({ query, engine }) });
      if (jobScope()?.signal.aborted) throw err;
      if (!passes(err) || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
}
