/**
 * A finished project's waits, as /api/design/waits/<id> gives them: what ran, when, and what came of it. The test
 * page plays one stretch of it (understanding, research, world, play) on its own clock, in seconds from that
 * stretch's start, and every picture (old and new) is drawn from the same moment of it.
 */

import type { T } from "@/lib/i18n/locales";

export type Call = {
  p: string;
  s: number;
  e: number;
  ok: boolean;
  err: string | null;
  usd: number;
  label?: string;
};
export type Log = { at: number; level: string; m: string };

export type Tape = {
  id: string;
  title: string;
  question: string;
  understand: {
    t0: number;
    t1: number;
    calls: Call[];
    planQueries: string[];
    queries: { at: number; s: number; q: string; hosts: string[]; titles?: string[] }[];
    vocab: {
      at: number;
      terms: string[];
      players: string[];
      segments: string[];
    } | null;
    insight: {
      said: string;
      understood: string;
      premises: string[];
    } | null;
    questions: { q: string; about: string; answer: string | null }[];
  };
  research: {
    t0: number;
    t1: number;
    logs: Log[];
    calls: Call[];
    searches: {
      at: number;
      q: string;
      item: string | null;
      round: number;
      fresh: number;
    }[];
    intel: {
      id: string;
      at: number;
      title: string;
      item: string | null;
      host: string;
    }[];
    items: { id: string; for: string; what: string; state: string }[];
    answers: { q: string; a: string }[];
  } | null;
  world: {
    id: string;
    title: string;
    t0: number;
    t1: number;
    logs: Log[];
    calls: Call[];
    entities: {
      id: string;
      name: string;
      kind: string;
      at: number;
    }[];
    edges: { from: string; to: string; label: string; at: number }[];
    personas: { id: string; at: number; identity: string }[];
    facts: number[];
    /** Each fact's words (cut short), in the same order as `facts`. */
    factText: string[];
    /** Who each fact is about (its first person or organisation), or null. */
    factWho: (string | null)[];
  } | null;
  sim: {
    branch: string;
    t0: number;
    t1: number;
    calls: Call[];
    headline: string;
    scene: string;
    people: string[];
    facts: number;
  } | null;
};

export type SceneKey = "understand" | "research" | "world" | "sim";

/** Seconds from a stretch's start. */
export const sec = (at: number, t0: number) => (at - t0) / 1000;

/** "48 sec", "3 min 12 sec". `t` is the texts of "product.wait.tape". */
export function dur(s: number, t: T) {
  const x = Math.max(0, Math.floor(s));
  if (x < 60) return t("seconds", { s: x });
  const m = Math.floor(x / 60);
  const r = x % 60;
  return r ? t("minSec", { m, s: String(r).padStart(2, "0") }) : t("minutes", { m });
}

/** "48s", "3m12s", "3m": the same in every language. */
export function durShort(s: number) {
  const x = Math.max(0, Math.floor(s));
  if (x < 60) return `${x}s`;
  const m = Math.floor(x / 60);
  const r = x % 60;
  return r ? `${m}m${String(r).padStart(2, "0")}s` : `${m}m`;
}

/** "1:23". */
export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/** Calls running at second `t` (of a stretch starting at `t0`), and those done by then. */
export function inFlight(calls: Call[], t0: number, t: number, p?: string | string[]) {
  const want = p == null ? null : Array.isArray(p) ? p : [p];
  return calls.filter((c) => (!want || want.includes(c.p)) && sec(c.s, t0) <= t && sec(c.e, t0) > t);
}
export function doneBy(calls: Call[], t0: number, t: number, p?: string | string[]) {
  const want = p == null ? null : Array.isArray(p) ? p : [p];
  return calls.filter((c) => (!want || want.includes(c.p)) && sec(c.e, t0) <= t);
}

/**
 * Stretches where nothing ran and nothing was logged for a long while (a server restart, not a real wait): the
 * player jumps over them. Each is [from, to] in seconds.
 */
export function deadGaps(spans: [number, number][], points: number[], end: number, min = 60): [number, number][] {
  const marks = [...spans.flatMap(([a, b]) => [[a, 1] as const, [b, -1] as const]), ...points.flatMap((p) => [[p, 1] as const, [p + 0.001, -1] as const])].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let open = 0;
  let quiet = 0;
  for (const [at, d] of marks) {
    if (open === 0 && at - quiet >= min && quiet > 0) out.push([quiet + 3, at - 3]);
    open += d;
    if (open === 0) quiet = at;
  }
  if (open === 0 && end - quiet >= min && quiet > 0) out.push([quiet + 3, end - 3]);
  return out;
}

/**
 * What a failed call's error means, in words for the person waiting. `t` is the texts of "product.wait.tape". The
 * engine's errors may be in Chinese: "\u622a\u65ad" (cut off), "\u6ca1\u6709\u56de\u5e94" (no response),
 * "\u91cd\u590d" (repeated).
 */
export function why(err: string | null, t: T) {
  if (!err) return t("unusable");
  if (/length|\u622a\u65ad|max_tokens/i.test(err)) return t("tooLong");
  if (/parse|No object|JSON/i.test(err)) return t("badFormat");
  if (/timeout|timed out|\u6ca1\u6709\u56de\u5e94|abort/i.test(err)) return t("noResponse");
  if (/\u91cd\u590d/.test(err)) return t("repeated");
  return t("unusable");
}

/** How long a step usually takes, from the projects run so far (for "usually …" beside the timer). */
export const TYPICAL: Record<string, [number, number]> = {
  clarify: [20, 120],
  survey_vocab: [5, 60],
  search_plan: [20, 80],
  thesis: [30, 50],
  outline: [40, 160],
  future_frame: [30, 60],
  future_actor: [20, 60],
  relations: [40, 130],
  personas: [15, 40],
  completeness: [10, 30],
  situation: [5, 30],
};
/** `t` is the texts of "product.wait.tape". */
export const typicalText = (p: string, t: T) => {
  const r = TYPICAL[p];
  if (!r) return null;
  const f = (x: number) => (x >= 60 ? t("minutes", { m: Math.round(x / 60) }) : t("seconds", { s: x }));
  return t("typical", { from: f(r[0]), to: f(r[1]) });
};
/** A wait of unknown length, as a line that keeps creeping on: quick at first, never quite full. */
export const creep = (elapsed: number, p: string) => {
  const mid = TYPICAL[p] ? (TYPICAL[p]![0] + TYPICAL[p]![1]) / 2 : 30;
  return Math.min(0.95, 1 - Math.exp(-elapsed / mid));
};

/**
 * When to show things that really arrived in batches (seconds, any order; the result in the same order): each batch
 * is let out one at a time, evenly, until the next batch arrives (or `cap` seconds), so something new shows every
 * second or so instead of a hundred at once and then nothing. Never earlier than it really arrived; never two at
 * once closer than `gap`; a batch that has not finished going out when the next one comes simply goes on first.
 */
export function drip(arrivals: number[], { cap = 30, gap = 0.18, batch = 0.8 } = {}): number[] {
  const order = arrivals.map((a, i) => [a, i] as const).sort((x, y) => x[0] - y[0]);
  const groups: { at: number; idx: number[] }[] = [];
  for (const [a, i] of order) {
    const g = groups.at(-1);
    if (g && a - g.at <= batch) g.idx.push(i);
    else groups.push({ at: a, idx: [i] });
  }
  const out = new Array<number>(arrivals.length);
  let last = -Infinity;
  groups.forEach((g, k) => {
    const next = groups[k + 1]?.at ?? g.at + cap;
    const from = Math.max(g.at, last + gap);
    const to = Math.max(from + g.idx.length * gap, Math.min(next, g.at + cap));
    const step = (to - from) / g.idx.length;
    g.idx.forEach((i, j) => {
      out[i] = from + j * step;
      last = out[i]!;
    });
  });
  return out;
}

/** One of `list` at second `t`, moving on every `every` seconds from `from` (round again at the end). */
export const cycle = <T>(list: T[], from: number, t: number, every = 1.6): T | null => (list.length ? list[Math.floor(Math.max(0, t - from) / every) % list.length]! : null);

/** The one bit of motion the waiting pages share: a new line or number fading up into place. */
export const WAIT_CSS = `
@keyframes w-in { from { opacity: 0; transform: translateY(4px); filter: blur(2px); } to { opacity: 1; transform: none; filter: none; } }
.w-in { animation: w-in .5s cubic-bezier(.2,.7,.2,1) both; }
`;
