import { NOTE_KINDS, type NoteEntry, type NoteKind, type NoteSide } from "../db/schema.js";
import { listLines } from "./tags.js";

/**
 * The notes of an engine-12 play: what the model keeps beside the story about the world (who each person is and what
 * they want and mean to do, the forces in motion, the key figures, the road ahead, what was assumed of the
 * protagonist), each line on one side of what the protagonist knows. The world's build writes them whole; each stop
 * writes only what changed. A line is `- kind | side | name | text`: one that cannot be read so is kept as a plain note,
 * and the rest of the stop goes on (a stop is never written again over one line).
 */

/** Words a model may write for removing a line (and the Chinese ones, escaped: deleted, delete, gone). */
const GONE = /^(gone|removed|deleted|none|—|-|\u5df2\u5220\u9664|\u5220\u9664|\u6ca1\u6709\u4e86)$/i;

/** The sides a line may be said to be on (and the Chinese words, escaped: the protagonist knows; in the dark; hidden). */
const SIDES: Record<string, NoteSide> = { known: "known", hidden: "hidden", public: "known", secret: "hidden", "\u4e3b\u89d2\u77e5\u9053": "known", "\u6697\u5904": "hidden", "\u6697\u5904\u7684": "hidden" };

/** One line of notes as written, read; a line that cannot be read is a plain note with its words as they were. */
export function noteLine(line: string, step: number, since: string): NoteEntry {
  const parts = line.split("|").map((x) => x.trim());
  const kind = parts[0]?.toLowerCase() as NoteKind | undefined;
  const side = SIDES[parts[1]?.toLowerCase() ?? ""];
  if (parts.length >= 4 && kind && (NOTE_KINDS as readonly string[]).includes(kind) && side && parts[2]) return { kind, side, name: parts[2], text: parts.slice(3).join(" | "), step, since };
  // (three parts with no name: a road line or a figure written without one keeps what it says)
  if (parts.length === 3 && kind && (NOTE_KINDS as readonly string[]).includes(kind) && side) return { kind, side, name: "", text: parts[2]!, step, since };
  return { kind: "note", side: "hidden", name: "", text: line.trim(), step, since };
}

/** The lines of a notes tag, read. */
export function readNotes(body: string | undefined, step: number, since: string): NoteEntry[] {
  return listLines(body).map((l) => noteLine(l, step, since));
}

const keyOf = (e: Pick<NoteEntry, "kind" | "side" | "name">) => `${e.kind}|${e.side}|${e.name.trim().toLowerCase()}`;

/**
 * The notes with a stop's changes merged in: a line takes the place of the one with the same kind, side and name; a
 * line whose text says it is gone removes it; road lines, when a stop writes any, are the whole road ahead as it now
 * looks; a plain note is added.
 */
export function mergeNotes(base: NoteEntry[], patch: NoteEntry[]): NoteEntry[] {
  let out = patch.some((p) => p.kind === "road") ? base.filter((e) => e.kind !== "road") : [...base];
  for (const p of patch) {
    if (p.kind === "note") {
      out.push(p);
      continue;
    }
    const k = keyOf(p);
    const at = out.findIndex((e) => keyOf(e) === k);
    if (GONE.test(p.text.trim())) {
      if (at >= 0) out = out.filter((_, i) => i !== at);
      continue;
    }
    if (at >= 0 && p.kind !== "road") out[at] = p;
    else out.push(p);
  }
  return out;
}

/** The notes as the model is given them again (a fold's notes): the same line form it writes them in. */
export function notesText(entries: NoteEntry[]): string {
  return entries.map((e) => (e.kind === "note" ? `- ${e.text}` : `- ${e.kind} | ${e.side} | ${e.name} | ${e.text}`)).join("\n");
}

/** A person's card: what the protagonist knows of them, and what is out of their sight. */
export type PersonCard = { name: string; known: string; hidden: string; step: number; since: string };

/** The people of the notes, one card each, in the order they first appear. */
export function peopleCards(entries: NoteEntry[]): PersonCard[] {
  const cards = new Map<string, PersonCard>();
  for (const e of entries) {
    if (e.kind !== "person") continue;
    const k = e.name.trim().toLowerCase();
    const c = cards.get(k) ?? { name: e.name.trim(), known: "", hidden: "", step: e.step, since: e.since };
    c[e.side] = e.text;
    if (e.step >= c.step) Object.assign(c, { step: e.step, since: e.since });
    cards.set(k, c);
  }
  return [...cards.values()];
}

/** The lines of one kind (forces, figures, the road, what was assumed), on one side or both. */
export const notesOf = (entries: NoteEntry[], kind: NoteKind, side?: NoteSide) => entries.filter((e) => e.kind === kind && (!side || e.side === side));
