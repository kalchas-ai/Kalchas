import { APICallError, generateText, NoObjectGeneratedError, Output, streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { requireEnv } from "../env.js";
import { and, desc, eq, gte, like } from "drizzle-orm";
import { db } from "../db/client.js";
import { llmCalls } from "../db/schema.js";
import { jobScope } from "../jobs/queue.js";
import { classOf, config, effortFor, modelFor } from "../config.js";
import { languageRule } from "../language.js";
import { callStarted, recordCall, type CallContext } from "./trace.js";
import { newId } from "../util.js";

let provider: ReturnType<typeof createOpenRouter> | null = null;

function openrouter() {
  if (!provider) {
    provider = createOpenRouter({
      apiKey: requireEnv("OPENROUTER_API_KEY"),
      compatibility: "strict",
      appName: "Kalchas",
    });
  }
  return provider;
}

type Usage = { inputTokens?: number; outputTokens?: number; outputTokenDetails?: { reasoningTokens?: number }; inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number } };
type Meta = { openrouter?: { provider?: string; usage?: { cost?: number; completionTokensDetails?: { reasoningTokens?: number }; promptTokensDetails?: { cachedTokens?: number; cacheWriteTokens?: number } } } };

/** How much of a call's input the provider read from its cache and wrote to it, as it reported them (null: not said). */
export function cacheUse(usage: Usage | undefined, md?: Meta["openrouter"]): { cachedTokens: number | null; cacheWriteTokens: number | null } {
  return {
    cachedTokens: md?.usage?.promptTokensDetails?.cachedTokens ?? usage?.inputTokenDetails?.cacheReadTokens ?? null,
    cacheWriteTokens: md?.usage?.promptTokensDetails?.cacheWriteTokens ?? usage?.inputTokenDetails?.cacheWriteTokens ?? null,
  };
}

const slugs = new Map<string, Promise<Map<string, string>>>();

function providerSlugs(model: string): Promise<Map<string, string>> {
  let p = slugs.get(model);
  if (!p) {
    p = fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json() as Promise<{ data?: { endpoints?: { provider_name?: string; tag?: string }[] } }>)
      .then((j) => new Map((j.data?.endpoints ?? []).filter((e) => e.provider_name && e.tag).map((e) => [e.provider_name!, e.tag!.split("/")[0]!])))
      .catch(() => {
        slugs.delete(model);
        return new Map<string, string>();
      });
    slugs.set(model, p);
  }
  return p;
}

/** What a step is called in the job's log, when it has to say it is waiting or trying again. */
const STEP: Record<string, string> = {
  clarify: "Understanding what you said",
  pace: "Asking about the pace",
  record: "Setting down the moment",
  project_title: "Naming the project",
  world_skeleton: "Listing the people and what to look up",
  lookup_queries: "Writing search terms",
  lookup_read: "Reading a page",
  world_people: "Writing the people",
  world_opening: "Setting up the opening",
  rule: "Reading your move",
  person: "Each side deciding",
  moment: "Writing the moment",
  milestone: "Writing a milestone",
  persona: "Writing a profile",
  memory_digest: "Condensing a memory",
  compare: "Comparing two timelines",
};

/**
 * How long a step usually takes (median of its recent successful calls), to know when it is taking too long. A kind
 * of call with no history yet (a new one, a fresh database) goes by what the same role's calls usually take: without
 * that it had no usual length at all, and a hung provider was waited on for a full minute before another was tried
 * (one person of eight setting out their week held a whole step for 66 seconds).
 */
const typical = new Map<string, { at: number; ms: number | null }>();
function typicalMs(purpose: string, role?: string): number | null {
  const hit = typical.get(purpose);
  if (hit && Date.now() - hit.at < (hit.ms == null ? 60_000 : 10 * 60_000)) return hit.ms;
  const median = (where: ReturnType<typeof eq>) => {
    const rows = db()
      .select({ ms: llmCalls.ms })
      .from(llmCalls)
      .where(and(where, eq(llmCalls.ok, true)))
      .orderBy(desc(llmCalls.createdAt))
      .limit(40)
      .all()
      .map((r) => r.ms)
      .sort((a, b) => a - b);
    return rows.length >= 5 ? rows[Math.floor(rows.length / 2)]! : null;
  };
  let ms: number | null = null;
  try {
    ms = median(eq(llmCalls.purpose, purpose)) ?? (role ? median(eq(llmCalls.role, role)) : null);
  } catch {
    ms = null;
  }
  typical.set(purpose, { at: Date.now(), ms });
  return ms;
}

/**
 * The providers that have actually been fastest for a model, measured from our own calls (output tokens per second,
 * last week): the same model runs three times faster at some providers than at others, and the providers' own
 * published throughput does not say which. Fastest first.
 */
const fastest = new Map<string, { at: number; slugs: string[] }>();
const tempOk = new Map<string, Promise<boolean>>();
/** Models that will not answer without thinking: a step that would rather skip it thinks after all. */
const mustThink = new Set<string>();

/**
 * Whether any provider of the model takes a temperature (some, like Claude with thinking, take none): routing asks every
 * parameter to be supported, so one that no provider takes would leave no provider at all.
 */
function takesTemperature(model: string): Promise<boolean> {
  let p = tempOk.get(model);
  if (!p) {
    p = fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json() as Promise<{ data?: { endpoints?: { supported_parameters?: string[] }[] } }>)
      .then((j) => {
        const eps = j.data?.endpoints ?? [];
        return !eps.length || eps.some((e) => e.supported_parameters?.includes("temperature"));
      })
      .catch(() => {
        tempOk.delete(model);
        return true;
      });
    tempOk.set(model, p);
  }
  return p;
}

async function fastProviders(model: string): Promise<string[]> {
  // the endpoints chosen in the settings come first (e.g. a cheaper tier), then the measured fastest
  const chosen = config().providers[model] ?? [];
  const fast = await measuredFastest(model);
  return [...chosen, ...fast.filter((x) => !chosen.includes(x))];
}

async function measuredFastest(model: string): Promise<string[]> {
  const hit = fastest.get(model);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.slugs;
  let slugs: string[] = [];
  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const rows = db()
      .select({ model: llmCalls.model, out: llmCalls.outputTokens, ms: llmCalls.ms })
      .from(llmCalls)
      .where(and(eq(llmCalls.ok, true), gte(llmCalls.createdAt, since), like(llmCalls.model, `${model} @%`)))
      .all()
      .filter((r) => r.out > 500 && r.ms > 0);
    const by = new Map<string, { out: number; ms: number; n: number }>();
    for (const r of rows) {
      const name = r.model.slice(r.model.indexOf("@") + 1);
      const v = by.get(name) ?? { out: 0, ms: 0, n: 0 };
      by.set(name, { out: v.out + r.out, ms: v.ms + r.ms, n: v.n + 1 });
    }
    const names = await providerSlugs(model);
    slugs = [...by.entries()]
      .filter(([, v]) => v.n >= 5)
      .sort((a, b) => b[1].out / b[1].ms - a[1].out / a[1].ms)
      .map(([name]) => names.get(name))
      .filter((x): x is string => !!x)
      .slice(0, 5);
  } catch {
    slugs = [];
  }
  fastest.set(model, { at: Date.now(), slugs });
  return slugs;
}

type RunResult<T> = { ok: true; out: T } | { ok: false; error: unknown; problem?: string; cancelled?: boolean };

/** The first run that comes back usable; if none does, the last failure. */
function firstUsable<T>(runs: Promise<RunResult<T>>[]): Promise<RunResult<T>> {
  return new Promise((resolve) => {
    let left = runs.length;
    for (const p of runs)
      void p.then((r) => {
        if (r.ok) resolve(r);
        else if (--left === 0) resolve(r);
      });
  });
}

/**
 * The model for a conversation that calls tools and streams its answer (the adviser): its class's model as anywhere
 * (see `classOf`), thinking as long as it wants, at the fastest provider that takes tools.
 */
export async function chatModel(purpose: string): Promise<{ model: ReturnType<ReturnType<typeof openrouter>["chat"]>; modelId: string }> {
  const modelId = modelFor(purpose);
  const order = await fastProviders(modelId);
  const model = openrouter().chat(modelId, {
    usage: { include: true },
    // (not `require_parameters`: with tools and a temperature both asked for, it left no endpoint at all for some
    // models; a request with tools is routed only to providers that take tools in any case)
    extraBody: { provider: { ...(order.length ? { order, allow_fallbacks: true } : { sort: "throughput" }) } },
  });
  return { model, modelId };
}

/**
 * Everything a failed call left behind, for the log: what the model sent back even when it would not parse (with why it
 * would not: the parser's or the schema's own words), how it ended, what it used; for a refused request, the status
 * and the provider's reply.
 */
function failure(err: unknown): { error: string; output?: string; finishReason?: string | null; inputTokens: number; outputTokens: number; reasoningTokens?: number | null; provider?: string | null } {
  const message = err instanceof Error ? err.message : String(err);
  if (NoObjectGeneratedError.isInstance(err)) {
    const cause = err.cause instanceof Error ? err.cause.message : err.cause ? String(err.cause) : "";
    const u = err.usage as Usage | undefined;
    return {
      error: cause ? `${message}\n${cause}` : message,
      output: err.text,
      finishReason: err.finishReason ?? null,
      inputTokens: u?.inputTokens ?? 0,
      outputTokens: u?.outputTokens ?? 0,
      reasoningTokens: u?.outputTokenDetails?.reasoningTokens ?? null,
      ...cacheUse(u),
    };
  }
  if (APICallError.isInstance(err)) {
    return { error: `${message}${err.statusCode ? ` (HTTP ${err.statusCode})` : ""}`, output: err.responseBody, inputTokens: 0, outputTokens: 0 };
  }
  return { error: message, inputTokens: 0, outputTokens: 0 };
}

/**
 * The shape an answer is to have, written out for the model to read (JSON Schema, with the notes on each field that
 * say what goes in it). It is part of the instructions, not a constraint the provider enforces: a provider that
 * compiles the shape into a grammar has a limit on its size (Claude's refused the questions, at 58 fields, and the
 * ruling has 281), and which model runs is the user's to choose. So every model is asked the same way, for JSON, and
 * what comes back is checked here.
 */
const shapes = new WeakMap<z.ZodType, string>();
const shapeOf = new WeakMap<z.ZodType, Shape>();
function shapeText(schema: z.ZodType): string {
  let text = shapes.get(schema);
  if (text === undefined) {
    try {
      const strip = (n: unknown): unknown => {
        if (Array.isArray(n)) return n.map(strip);
        if (!n || typeof n !== "object") return n;
        const out: Record<string, unknown> = {};
        // (what only a validator reads is left out: it is so many tokens on every call)
        for (const [k, v] of Object.entries(n)) if (k !== "$schema" && k !== "additionalProperties") out[k] = strip(v);
        return out;
      };
      const shape = strip(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }));
      shapeOf.set(schema, shape as Shape);
      text = JSON.stringify(shape);
    } catch {
      text = "";
    }
    shapes.set(schema, text);
  }
  return text;
}

/**
 * The object in what a model wrote: the text itself when it is JSON, else what stands between the first brace and the
 * last (a model asked for JSON sometimes wraps it in a code fence or a sentence). Undefined when there is none.
 */
/**
 * The first whole object in a text: from its first `{` to the brace that closes it, strings read as strings. A long
 * answer sometimes ends with a brace too many, or has a word after it; what was meant is the object that is complete.
 */
function firstObject(t: string): string {
  const start = t.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return t.slice(start, i + 1);
  }
  return "";
}

export function readObject(text: string): unknown {
  const t = text.trim();
  if (!t) return undefined;
  for (const candidate of [t, t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""), t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1), firstObject(t)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* the next reading */
    }
  }
  return undefined;
}

/**
 * A JSON string read from `start` (its opening quote) as far as it has arrived: the decoded text so far, where it
 * ended, and whether its closing quote has come. An escape cut off at the end (a lone backslash, `\u` with fewer
 * than four digits, half of a surrogate pair) is left out until the rest arrives, so what is read only ever grows.
 */
function readJsonString(text: string, start: number): { value: string; end: number; complete: boolean } {
  let out = "";
  let i = start + 1;
  const ESC: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
  const hex4 = (at: number) => (/^[0-9a-fA-F]{4}$/.test(text.slice(at, at + 4)) ? parseInt(text.slice(at, at + 4), 16) : null);
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') return { value: out, end: i + 1, complete: true };
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    const e = text[i + 1];
    if (e === undefined) break;
    if (e !== "u") {
      out += ESC[e] ?? e;
      i += 2;
      continue;
    }
    const code = hex4(i + 2);
    if (code === null) break;
    // the first half of a pair is held back until its second half has arrived (a lone half shows as a broken glyph)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 12 > text.length) break;
      const low = text.slice(i + 6, i + 8) === "\\u" ? hex4(i + 8) : null;
      if (low !== null && low >= 0xdc00 && low <= 0xdfff) {
        out += String.fromCharCode(code, low);
        i += 12;
        continue;
      }
    }
    out += String.fromCharCode(code);
    i += 6;
  }
  return { value: out, end: text.length, complete: false };
}

/** Where a JSON value starting at `i` ends, or -1 when it has not all arrived yet. */
function skipJsonValue(text: string, i: number): number {
  const c = text[i];
  if (c === '"') {
    const s = readJsonString(text, i);
    return s.complete ? s.end : -1;
  }
  if (c === "{" || c === "[") {
    let depth = 0;
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '"') {
        const s = readJsonString(text, i);
        if (!s.complete) return -1;
        i = s.end;
        continue;
      }
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
    }
    return -1;
  }
  // a number, true, false or null: it ends where something else begins (and may still be arriving at the very end)
  while (i < text.length && !/[\s,}\]]/.test(text[i]!)) i++;
  return i < text.length ? i : -1;
}

/**
 * The value so far of the string field `field` at the top level of a JSON object that is still being written: what
 * a page can show of an answer while the model writes it. Undefined while the field has not begun (or is not a
 * string, or the text is not an object); otherwise the decoded text up to where it has arrived, which only ever
 * grows as more of the same text arrives. Keys of the same name inside nested values are not it.
 */
export function partialField(text: string, field: string): string | undefined {
  // (a model asked for JSON sometimes opens with a code fence: the object starts at its first brace)
  let i = text.indexOf("{");
  if (i < 0) return undefined;
  i++;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i]!)) i++;
  };
  for (;;) {
    ws();
    if (i >= text.length || text[i] === "}") return undefined;
    if (text[i] === ",") {
      i++;
      continue;
    }
    if (text[i] !== '"') return undefined;
    const key = readJsonString(text, i);
    if (!key.complete) return undefined;
    i = key.end;
    ws();
    if (text[i] !== ":") return undefined;
    i++;
    ws();
    if (i >= text.length) return undefined;
    if (key.value === field) return text[i] === '"' ? readJsonString(text, i).value : undefined;
    i = skipJsonValue(text, i);
    if (i < 0) return undefined;
  }
}

type Shape ={ type?: string | string[]; properties?: Record<string, Shape>; required?: string[]; items?: Shape; anyOf?: Shape[]; $ref?: string; $defs?: Record<string, Shape> };
/**
 * An answer put right where what was meant is plain from the shape asked for: a bare list where an object holding
 * exactly one list was asked for is that object; null in a field that may be left out, and does not take null, is
 * the field left out. Nothing else is touched: what is still wrong is the check's to say.
 */
export function mend(value: unknown, shape: Shape | undefined, root: Shape | undefined = shape): unknown {
  if (!shape) return value;
  if (shape.$ref) return mend(value, root?.$defs?.[shape.$ref.split("/").pop() ?? ""], root);
  const types = Array.isArray(shape.type) ? shape.type : shape.type ? [shape.type] : [];
  if (types.includes("object") && shape.properties) {
    const keys = Object.keys(shape.properties);
    const lists = keys.filter((k) => shape.properties![k]!.type === "array");
    if (Array.isArray(value) && lists.length === 1 && (shape.required ?? []).every((k) => k === lists[0])) value = { [lists[0]!]: value };
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const p = shape.properties[k];
        const takesNull = !!p && ((Array.isArray(p.type) && p.type.includes("null")) || p.type === "null" || !!p.anyOf?.some((x) => x.type === "null"));
        if (v === null && p && !takesNull && !(shape.required ?? []).includes(k)) continue;
        out[k] = p ? mend(v, p, root) : v;
      }
      return out;
    }
    return value;
  }
  if (types.includes("array") && shape.items && Array.isArray(value)) return value.map((v) => mend(v, shape.items, root));
  return value;
}

/**
 * What is wrong with an answer, in a few lines the model can act on: where, and what was expected there. Said twice:
 * `told` is what the model is sent, `shown` is the same for the log and the page.
 */
function shapeProblem(error: z.ZodError): { shown: string; told: string } {
  const n = error.issues.length;
  const at = (whole: string) => error.issues.slice(0, 8).map((i) => `${i.path.length ? i.path.join(".") : whole}: ${i.message}`);
  return {
    shown: `Not in the required structure (${n} ${n === 1 ? "place" : "places"}): ${at("(the whole object)").join("; ")}`,
    told: `it does not have the required structure (${n} ${n === 1 ? "place" : "places"}): ${at("(the whole object)").join("; ")}`,
  };
}

/** Models no provider serves with a JSON reply format: asked in the instructions alone, and read the same way. */
const plainOnly = new Set<string>();

/**
 * Structured generation: the model must return an object matching `schema`.
 *
 * The shape is given in the instructions and the answer is checked here (see `shapeText`); nothing asks the provider
 * to enforce it.
 *
 * Retries when the call fails or the output does not conform to the schema. After a failure the next try is spread across providers instead of going to the
 * fastest one again, since the same provider tends to fail the same way.
 *
 * A call that runs much longer than its step usually takes is not waited out: the same request goes to another
 * provider at the same time and whichever answers usably first is used, the other is cancelled. Inside a job, the
 * job's cancel signal stops it, and the job's log says when it is waiting or trying again.
 */
/** What answers in place of the model, in a test (never set in a run). */
export type GenerateStandIn = (ctx: CallContext, opts: { schema: z.ZodType; system: string; prompt: string; temperature?: number }) => unknown;
let standIn: GenerateStandIn | null = null;
/** Tests only: every structured call is answered by `fn` (null puts the model back). */
export function standInForGenerate(fn: GenerateStandIn | null): void {
  standIn = fn;
}

export async function generate<S extends z.ZodType>(
  ctx: CallContext & { modelOverride?: string | null; think?: boolean },
  opts: Parameters<typeof generateOnce<S>>[1],
): Promise<z.infer<S>> {
  // in a test, the answer comes from the stand-in, checked against the schema as a real answer is
  // (the stand-in reads one prompt: the shared part and the rest, as the model reads them, one after the other)
  // (a call that streams is shown the stand-in's field whole, once, so a caller's own tests see what it would show)
  if (standIn) {
    const out = opts.schema.parse(await standIn(ctx, opts.shared ? { ...opts, prompt: `${opts.shared}\n\n${opts.prompt}` } : opts)) as z.infer<S>;
    const value = opts.stream ? (out as Record<string, unknown> | null)?.[opts.stream.field] : undefined;
    if (opts.stream && typeof value === "string") opts.stream.onDelta(value);
    return out;
  }
  if(process.env.KALCHAS_TEST_OFFLINE==="1")throw new Error(`Offline test without a stand-in for the model: ${ctx.purpose}`);
  // under way until it ends, however it ends: a page showing the wait can say which step is running
  const done = callStarted(ctx);
  try {
    return await generateOnce(ctx, opts);
  } finally {
    done();
  }
}

async function generateOnce<S extends z.ZodType>(
  ctx: CallContext & { modelOverride?: string | null; think?: boolean },
  opts: {
    schema: S;
    system: string;
    prompt: string;
    shared?: string;
    temperature?: number;
    /** How long one attempt may take before it is abandoned and tried again elsewhere. */
    timeoutMs?: number;
    /**
     * Show the answer while it is being written: the call streams, and `onDelta` is given the value so far of the
     * top-level string field `field` (decoded text, not JSON), each time it has grown. One lane is shown at a time
     * (the first to write any of the field, which is the main one unless it has written nothing when the second
     * starts) and what is shown only grows, with two exceptions: when another lane's answer, or a final text that
     * reads differently, is the one used, `onDelta` is called once more with that answer's whole field (which may
     * replace what was shown, shorter or not); and before a retry it is called with "" so the page can clear. What
     * the call returns is read and checked exactly as without streaming; a model or provider that will not stream
     * is asked the ordinary way instead, without a word.
     */
    stream?: { field: string; onDelta: (soFar: string) => void };
  },
): Promise<z.infer<S>> {
  const modelId = modelFor(ctx.purpose, ctx.modelOverride);
  const shape = shapeText(opts.schema);
  const system = `${opts.system}\n\n${languageRule(ctx.worldId)}\nAnswer with one JSON object and nothing else: no text before or after it, no code fence. ${
    shape ? `It must conform to the JSON Schema below: field names exactly as written, every field listed in "required" present, an enum only ever one of its listed values, and the right types (a number is a bare number, never text with a unit).\n${shape}` : "It must have the structure described above."
  }`;
  const job = jobScope();
  const step = STEP[ctx.purpose] ?? "This step";
  const usual = typicalMs(ctx.purpose, ctx.role);
  // an attempt is given up on at four times its usual length (a minute at least, four at most): when both sends hang,
  // waiting the full four minutes before trying again costs more than the retry
  // The limit follows how long this kind of call usually takes, six times over: one that thinks for half a minute is
  // left three minutes to finish (cut at one minute it only began the same thinking again), while one that usually
  // answers in four seconds is given up on after forty-five (in the second real run three such calls hung for two
  // minutes each under a flat two-minute limit, and the whole step waited on them).
  // (ninety seconds at the least: with no call asked not to think, one that used to answer in four seconds may now
  // think for half a minute, and what it "usually" takes is a figure from before, until enough new calls replace it)
  const timeoutMs = opts.timeoutMs ?? (usual ? Math.min(240_000, Math.max(90_000, usual * 6)) : 240_000);
  // the second request goes out once the first has taken clearly longer than usual (never before 10 seconds; a minute
  // when there is no history yet): a provider that hangs is common, and waiting three times the usual cost minutes.
  // The floor was 25 seconds, which only bound the short calls: of eight people answering side by side in three or
  // four seconds, one hung in nearly every round, and the whole step waited those 25 seconds for it each time.
  // With nothing to go by at all (not even the role's other calls), 20 seconds: longer than most calls take, and a
  // third of the minute it used to be.
  const hedgeAfter = usual ? Math.min(timeoutMs * 0.5, Math.max(10_000, usual * 1.8)) : 20_000;
  // Only a call of the light class is sent a second time when it is slow: both sends are billed, and for the main
  // class (the dear models: the questions, the pace, the review) a second bill for one answer costs more than the wait.
  const hedges = classOf(ctx.purpose) === "light";
  const [order, temperatureOk] = await Promise.all([fastProviders(modelId), takesTemperature(modelId)]);
  let prompt = opts.prompt;
  let lastError: unknown;
  let spread = false;

  // every send of this one request is logged under the same run, with its attempt and lane
  const runId = newId("run");

  /**
   * The same request, streamed: `show` is given the whole text written so far at every piece, and what comes back
   * has the fields the rest of `run` reads from an unstreamed call (usage and the provider's figures arrive at the
   * end of the stream). A stream that fails before writing anything is sent again the ordinary way, so a model or
   * provider that cannot stream costs nothing but the first refusal; one that fails part way through is a failed
   * attempt like any other.
   */
  const streamed = async (
    request: Parameters<typeof generateText>[0],
    signal: AbortSignal,
    show: (written: string) => void,
  ): Promise<{ text: string; usage: unknown; providerMetadata: unknown; finishReason: string; reasoningText: string | undefined }> => {
    let written = "";
    let failed: { error: unknown } | null = null;
    // (the library's default for a stream error is to print it; here it is read from the stream instead)
    const result = streamText({ ...(request as Parameters<typeof streamText>[0]), onError: () => {} });
    try {
      for await (const part of result.stream) {
        if (part.type === "text-delta") {
          written += part.text;
          show(written);
        } else if (part.type === "error") {
          failed = { error: part.error };
          break;
        }
      }
    } catch (err) {
      failed = { error: err };
    }
    // an abort (the race lost, the time limit, the job stopped) ends a stream quietly: it is the abort that is reported
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
    if (failed) {
      if (!written) return generateText(request);
      throw failed.error;
    }
    const [usage, finishReason, step] = await Promise.all([result.usage, result.finishReason, result.finalStep]);
    return { text: step.text ?? written, usage, providerMetadata: step.providerMetadata, finishReason, reasoningText: step.reasoningText };
  };
  const run = (
    text: string,
    spreadRouting: boolean,
    attempt: number,
    lane: "main" | "hedge",
    show?: (written: string) => void,
  ): { promise: Promise<RunResult<z.infer<S>>>; cancel: () => void } => {
    const own = new AbortController();
    const started = Date.now();
    const base = { run: runId, attempt: attempt + 1, lane, startedAt: new Date(started).toISOString() };
    const promise = (async (): Promise<RunResult<z.infer<S>>> => {
      try {
        const signal = AbortSignal.any([own.signal, AbortSignal.timeout(timeoutMs), ...(job ? [job.signal] : [])]);
        const request = {
          model: openrouter().chat(modelId, {
            usage: { include: true },
            // a quick step is asked not to think; otherwise a call thinks as its class is set to, and with nothing set as
            // long as the model wants (how long is the user's to choose, as the model is: a few calls of the research
            // ask not to think of themselves, with `think: false`)
            ...(ctx.think === false && !mustThink.has(modelId)
              ? { reasoning: { effort: "none" as const } }
              : effortFor(ctx.purpose)
                ? { reasoning: { effort: effortFor(ctx.purpose)! } }
                : {}),
            // Many providers serve the same model: the fastest one that supports structured output, unless it just failed.
            // the measured fastest first (a second request starts one further down the list); anyone else if they fail
            extraBody: {
              provider: {
                require_parameters: true,
                ...(order.length ? { order: spreadRouting ? [...order.slice(1), order[0]!] : order, allow_fallbacks: true } : spreadRouting ? {} : { sort: "throughput" }),
              },
            },
          }),
          // What many calls read alike (a world, its facts, its roster) goes first, ahead even of the instructions, and
          // is marked for the provider's cache: the calls of one step, and of the steps after it, then pay a tenth for it
          // and start sooner. It stays the same bytes from call to call or nothing is shared: whoever passes `shared`
          // keeps everything that varies in `prompt`.
          ...(opts.shared
            ? {
                // (two system messages, the shared one first and marked: the library takes system text only here,
                // never among the messages)
                system: [
                  { role: "system" as const, content: opts.shared, providerOptions: { openrouter: { cacheControl: { type: "ephemeral" as const } } } },
                  { role: "system" as const, content: system },
                ],
                prompt: text,
              }
            : { system, prompt: text }),
          ...(temperatureOk ? { temperature: opts.temperature ?? 0.7 } : {}),
          abortSignal: signal,
          // JSON is asked for, nothing more: the shape is in the instructions and is checked below
          ...(plainOnly.has(modelId) ? {} : { output: Output.json() }),
          maxRetries: 2,
        };
        const result = show ? await streamed(request, signal, show) : await generateText(request);
        const usage = result.usage as Usage;
        const md = (result.providerMetadata as Meta | undefined)?.openrouter;
        // read from the text as written (a reply that is all thinking, or empty, has none)
        const raw = readObject(result.text ?? "");
        const checked = raw === undefined ? null : opts.schema.safeParse(mend(raw, shapeOf.get(opts.schema)));
        const out = checked?.success ? (checked.data as z.infer<S>) : undefined;
        const call = {
          ...base,
          // the provider is kept with the model: the same model behaves differently from one provider to the next
          model: md?.provider ? `${modelId} @${md.provider}` : modelId,
          provider: md?.provider ?? null,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          reasoningTokens: md?.usage?.completionTokensDetails?.reasoningTokens ?? usage.outputTokenDetails?.reasoningTokens ?? null,
          ...cacheUse(usage, md),
          costUsd: md?.usage?.cost ?? 0,
          ms: Date.now() - started,
          finishReason: result.finishReason,
          thinking: result.reasoningText ?? null,
          output: out === undefined ? result.text : JSON.stringify(out),
        };
        if (out === undefined) {
          // said twice: `shown` is for the log and the page (and is what tells a job the failure will pass), `problem` is what the model is told
          const bad = raw === undefined ? null : shapeProblem(checked!.error!);
          const shown = bad ? bad.shown : (result.text ?? "").trim() ? "What came back was not JSON" : `Nothing came back (finish reason ${result.finishReason})`;
          const problem = bad ? bad.told : (result.text ?? "").trim() ? "what came back was not JSON" : `nothing came back (finish reason ${result.finishReason})`;
          recordCall(ctx, { ...call, ok: false, error: shown });
          return { ok: false, error: new Error(shown), problem };
        }
        recordCall(ctx, { ...call, ok: true });
        return { ok: true, out };
      } catch (err) {
        const ms = Date.now() - started;
        // the one that lost the race was cancelled on purpose: logged, not a failure
        if (own.signal.aborted && !job?.signal.aborted) {
          recordCall(ctx, { ...base, model: modelId, inputTokens: 0, outputTokens: 0, costUsd: 0, ms, ok: false, error: "The other lane answered first with a usable result; this one was cancelled" });
          return { ok: false, error: err, cancelled: true };
        }
        const message = err instanceof Error ? err.message : String(err);
        // the next attempt thinks
        if (/reasoning is mandatory/i.test(message)) mustThink.add(modelId);
        // no provider of this model takes a JSON reply format: the next attempt asks in the instructions alone
        if (/response_format|json_object|No endpoints found/i.test(message)) plainOnly.add(modelId);
        recordCall(ctx, { ...base, model: modelId, costUsd: 0, ms, ok: false, ...failure(err) });
        return { ok: false, error: err };
      }
    })();
    return { promise, cancel: () => own.abort() };
  };

  // what the caller has been shown of the field (a display that fails must not lose an answer already paid for)
  let shown = "";
  const tell = (value: string) => {
    shown = value;
    try {
      opts.stream?.onDelta(value);
    } catch {
      /* the caller's display, not this call */
    }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    if (job?.signal.aborted) throw job.signal.reason instanceof Error ? job.signal.reason : new Error("The job was stopped");
    // a retry writes its answer from the start: the caller clears what the failed attempt showed
    if (shown) tell("");
    // One lane is shown at a time: the first to write any of the field keeps it for the attempt, so two answers
    // written side by side never interleave and what is shown never goes back. Once the attempt is settled, nothing
    // more is shown from it (a cancelled lane may still be finishing a piece).
    const view: { lane: "main" | "hedge" | null; open: boolean } = { lane: null, open: true };
    const shower = (lane: "main" | "hedge") =>
      opts.stream
        ? (written: string) => {
            if (!view.open || (view.lane && view.lane !== lane)) return;
            const value = partialField(written, opts.stream!.field);
            if (value === undefined || value.length <= shown.length || !value.startsWith(shown)) return;
            view.lane = lane;
            tell(value);
          }
        : undefined;
    const first = run(prompt, spread, attempt, "main", shower("main"));
    let second: ReturnType<typeof run> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), hedgeAfter)));
    let res = await Promise.race([first.promise, late]);
    if (res === "late") {
      if (hedges) {
        job?.log(`${step}: the provider did not answer for ${Math.round(hedgeAfter / 1000)} seconds; sending it to another one as well`, "warn");
        second = run(prompt, true, attempt, "hedge", shower("hedge"));
      }
      // a connection that hangs below the abort (it happens on a bad network) must not hold the attempt past its limit
      let cap: ReturnType<typeof setTimeout> | undefined;
      const capped = new Promise<RunResult<z.infer<S>>>((resolve) => (cap = setTimeout(() => resolve({ ok: false, error: new Error(`${step}: no result after ${Math.round(timeoutMs / 1000)} seconds`) }), timeoutMs + 5_000)));
      res = await Promise.race([second ? firstUsable([first.promise, second.promise]) : first.promise, capped]);
      clearTimeout(cap);
    }
    clearTimeout(timer);
    view.open = false;
    first.cancel();
    second?.cancel();
    if (res.ok) {
      // the answer used may be the other lane's, or read differently from the text as streamed: shown whole, once
      const value = opts.stream ? (res.out as Record<string, unknown> | null)?.[opts.stream.field] : undefined;
      if (typeof value === "string" && value !== shown) tell(value);
      return res.out;
    }
    lastError = res.error;
    if (job?.signal.aborted) throw res.error;
    spread = true;
    if (attempt < 2) job?.log(`${step}: what the provider returned could not be used; trying another one`, "warn");
    prompt = res.problem
      ? `${opts.prompt}\n\n(The previous result could not be used: ${res.problem}. Give the complete JSON object again, in the required structure.)`
      : `${opts.prompt}\n\n(The previous output was invalid: ${(res.error instanceof Error ? res.error.message : String(res.error)).slice(0, 400)}. Output it again, strictly following the schema.)`;
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
