import type { BranchState, Item, NoteEntry } from "../db/schema.js";
import { describe, ENDED, IN_PLAY, standsAsSet, view } from "./items.js";
import { tx } from "../language.js";
import type { MetricDef } from "./metrics.js";

/** One thing that holds on a timeline, as the page's list of them shows it. */
export type LedgerItem = { id: string; text: string; since: string; source: "you" | "sim"; owner: string; about: string[]; visibility: "public" | "private"; knownBy: string[]; active: boolean; endedAt?: string; endedWhy?: string };

/** Shown elsewhere on the page: the protagonist's board of numbers, relations, and the two flags the program keeps. */
const elsewhere = (i: Item) => i.value.type === "link" || !!i.headline || i.key === IN_PLAY || i.key === ENDED;

/**
 * Everything that holds, as a viewer sees it, for the page: whatever a world comes up with, under whatever name, is
 * shown here unless the page has a place of its own for it.
 */
export function ledgerFor(state: BranchState, viewer: string | null, includeEnded = false, worldId: string | null = null): LedgerItem[] {
  return view(state, null, { viewer, includeEnded })
    .filter((i) => !elsewhere(i))
    .map((i) => ({
      id: i.id,
      text: i.value.type === "text" ? i.value.text : tx(worldId, "join.labeled", { label: i.label, text: describe(i.value) }),
      source: i.setBy === "you" ? "you" : "sim",
      owner: i.owner,
      about: i.about,
      visibility: i.visibility,
      knownBy: i.knownBy,
      since: i.since,
      active: !i.until,
      endedAt: i.until ?? undefined,
      endedWhy: i.endedWhy,
    }));
}

// ---------------------------------------------------------------- engine 12: the notes are what holds

/**
 * Engine 12: the notes as the protagonist knows them. The hidden side, and a line that could not be read (kept hidden),
 * never reach a page or the adviser.
 */
export const knownNotes = (entries: NoteEntry[]): NoteEntry[] => entries.filter((e) => e.side === "known" && e.kind !== "note");

/**
 * Words a figure may open with that only say it is rough ("about 80,000 euros", or the same in Chinese). The Chinese
 * ones, escaped: about, about, roughly, nearly, close to, near, over, under, short of, more than, about.
 */
const ROUGHLY = /^(?:about|around|roughly|approximately|approx\.?|some|nearly|almost|over|under|more than|less than|at least|at most|~|≈|\u7ea6|\u5927\u7ea6|\u5927\u6982|\u5c06\u8fd1|\u63a5\u8fd1|\u8fd1|\u8d85\u8fc7|\u4e0d\u5230|\u4e0d\u8db3|\u903e|\u7ea6\u4e3a)\s*/i;

/**
 * A key figure as one number for the board of numbers: only when its words are one number, perhaps said to be rough,
 * with its unit after it and nothing else; otherwise null, and it stays words (a figure is the model's own rough
 * reckoning, and the program reckons nothing with it: this only reads it).
 */
export function figureNumber(text: string): { n: number; unit: string } | null {
  // (thousands are set off by a comma, ASCII or full-width)
  const m = text.trim().replace(ROUGHLY, "").match(/^([-−]?\d[\d,\uff0c]*(?:\.\d+)?)\s*([^\d\s|][^\d|]{0,15})?$/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/[,\uff0c]/g, "").replace("−", "-"));
  return Number.isFinite(n) ? { n, unit: (m[2] ?? "").trim() } : null;
}

/** Engine 12: the key figures the protagonist knows, as the page's board of numbers reads them (by the figure's name). */
export function figureBoard(entries: NoteEntry[]): { defs: MetricDef[]; values: Record<string, number> } {
  const defs: MetricDef[] = [];
  const values: Record<string, number> = {};
  for (const e of knownNotes(entries)) {
    const key = e.name.trim();
    const v = e.kind === "figure" && key ? figureNumber(e.text) : null;
    if (!v || Object.hasOwn(values, key)) continue;
    defs.push({ key, label: key, unit: v.unit, description: e.text, criticalBelow: null });
    values[key] = v.n;
  }
  return { defs, values };
}

/** What the protagonist has set and only they can change: their premises and the intentions they hold to. */
export function policies(state: BranchState): { id: string; text: string; since: string }[] {
  if (!state.seatId) return [];
  return view(state, null, { viewer: state.seatId }).flatMap((i) => (standsAsSet(i) ? [{ id: i.id, text: i.value.type === "text" ? i.value.text : `${i.label}: ${describe(i.value)}`, since: i.since }] : []));
}
