import { customAlphabet } from "nanoid";

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
export const newId = (prefix: string) => `${prefix}_${nano()}`;
export const nowIso = () => new Date().toISOString();

/** Normalizes partial dates ("2010", "2010-03") to YYYY-MM-DD; returns null when unparseable. */
export function normDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?(?:T[\d:.+Z-]+)?$/);
  if (!m?.[1]) return null;
  const year = Number(m[1]), month = Number(m[2] ?? 1), day = Number(m[3] ?? 1);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month-1]!) return null;
  return `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}

/** Deterministic PRNG (mulberry32) so a branch replays the same draws. */
export function rngAt(seed: number, counter: number): number {
  let t = (seed + counter * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Picks an option by probability using a uniform draw in [0,1). Probabilities are renormalized. */
export function pickByProbability<T extends { probability: number }>(options: T[], draw: number): T {
  const total = options.reduce((s, o) => s + Math.max(0, o.probability), 0) || 1;
  let acc = 0;
  for (const o of options) {
    acc += Math.max(0, o.probability) / total;
    if (draw < acc) return o;
  }
  return options[options.length - 1]!;
}

/** Runs async tasks with a concurrency cap, preserving result order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i]!, i); }
      catch (err) { failed = true; throw err; }
    }
  });
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((r) => r.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return out;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Two names for the same thing, by the pairs of characters they share (a word added, one character put for another). */
export function alike(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  const pairs = (x: string) => { const m = new Map<string, number>(); for (let i = 0; i < x.length - 1; i++) { const p = x.slice(i, i + 2); m.set(p, (m.get(p) ?? 0) + 1); } return m; };
  const pa = pairs(a), pb = pairs(b);
  let shared = 0;
  for (const [p, n] of pa) shared += Math.min(n, pb.get(p) ?? 0);
  return (2 * shared) / (a.length - 1 + b.length - 1) >= 0.7;
}


/** Whole calendar periods between dates, with anniversaries measured on the original day. */
export function calendarDistance(anchor: string, at: string, unit: "years" | "months" | "days"): number {
  if (unit === "days") return daysBetween(anchor, at);
  if (daysBetween(anchor, at) < 0) return -calendarDistance(at, anchor, unit);
  const [year, month, day] = anchor.split("-").map(Number) as [number, number, number];
  const [y, m, d] = at.split("-").map(Number) as [number, number, number];
  const months = (y - year) * 12 + m - month - Number(d < day);
  return unit === "years" ? Math.floor(months / 12) : months;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** The day of the week a date falls on. */
export const weekday = (day: string) => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
