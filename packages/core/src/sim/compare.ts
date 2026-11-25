import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { decisions, entities, judgments, reports, sessions, worlds } from "../db/schema.js";
import { generate } from "../llm/generate.js";
import { newId, nowIso } from "../util.js";
import { getBranch, madeEarlier, type BranchRow } from "./world.js";
import { isNarrated } from "../narrate/play.js";
import { notesAt, seenStops, seenStopText } from "../facts/query.js";
import { knownNotes } from "./ledger.js";
import type { Scope } from "../world/schemas.js";

/**
 * Two timelines of one play set side by side, on demand: where they parted, how they stand apart on the last day both
 * have reached, and whether each difference came from what the person did or from how a roll fell. One call, given
 * only what the protagonist knows on each line from the step they parted on; kept among the branch's reports (kind
 * `compare`) and given back as it was while neither line has moved.
 */

const NONE = "(none)";

const CompareSchema = z.object({
  title: z.string().describe("A few words naming what the comparison shows"),
  parted: z.object({
    a: z.string().describe("What the person did on line A at the step where the lines parted, in a sentence, from their own words as restated"),
    b: z.string().describe("The same for line B"),
  }),
  differences: z
    .array(
      z.object({
        about: z.enum(["numbers", "people", "situation"]).describe("numbers: the protagonist's numbers; people: who is in or out of the matter; situation: where things stand"),
        what: z.string().describe("What differs, in a few words"),
        a: z.string().describe("How it stands on line A on the day compared, with its number where there is one"),
        b: z.string().describe("How it stands on line B on the same day"),
        cause: z.enum(["decision", "chance", "both", "unclear"]).describe("decision: it follows from what the person did differently; chance: from a roll that fell differently on the two lines; both; unclear: the record does not show"),
        why: z.string().describe("Why, in a sentence, resting on the decisions and rolls listed: the step or the roll it goes back to"),
      }),
    )
    .describe("How the two lines stand apart on the day compared, the ones that matter most first"),
  lesson: z.string().describe("What setting the two lines side by side teaches, in a sentence or two, concrete to this play"),
});
type CompareOut = z.infer<typeof CompareSchema>;

/** Where a line stood when a comparison was written: it is written again only once one of the two has moved. */
type Mark = { step: number; seq: number; simTime: string; decision: string | null };

export type Comparison = CompareOut & {
  other: string;
  /** The day both lines have reached, on which they are set side by side. */
  day: string;
  parted: CompareOut["parted"] & { step: number; day: string };
  marks: { a: Mark; b: Mark };
};

const markOf = (b: BranchRow): Mark => ({
  step: b.step,
  seq: b.seq,
  simTime: b.simTime,
  decision: db().select({ id: decisions.id }).from(decisions).where(eq(decisions.branchId, b.id)).orderBy(desc(decisions.step)).get()?.id ?? null,
});
const sameMark = (x: Mark, y: Mark) => x.step === y.step && x.seq === y.seq && x.simTime === y.simTime && x.decision === y.decision;

/** Each branch up a line's ancestry, with the step up to which this line's history is that branch's own. */
function ancestry(b: BranchRow): { id: string; until: number }[] {
  const path: { id: string; until: number }[] = [];
  let cur: BranchRow | undefined = b;
  let until = Infinity;
  while (cur) {
    path.push({ id: cur.id, until });
    if (!cur.parentBranchId || cur.forkStep == null) break;
    until = Math.min(until, cur.forkStep);
    cur = getBranch(cur.parentBranchId);
  }
  return path;
}

/** The step two lines parted on: the earlier of the two steps at which each left the branch they last share. */
function partingStep(a: BranchRow, b: BranchRow): number {
  const up = ancestry(b);
  for (const x of ancestry(a)) {
    const y = up.find((p) => p.id === x.id);
    if (!y) continue;
    const step = Math.min(x.until, y.until);
    if (!Number.isFinite(step)) throw new Error("This is the same timeline: there is nothing to compare");
    return step;
  }
  throw new Error("These two timelines have no common origin and cannot be compared");
}

/**
 * Engine 12: what the comparison is given of one line, from the stop the lines parted at up to the day compared: the
 * stops as the protagonist lived them (the scenes, the messages, the rolls they saw, what they did), the key figures
 * they knew on that day, and every roll made after the lines parted with its odds (those out of their sight marked).
 * Nothing from the hidden side of the notes.
 */
function narratedLineText(b: BranchRow, from: number, day: string): string {
  const stops = seenStops(b.id).filter((x) => x.step >= from && x.day <= day);
  const now = stops.at(-1);
  const figures = now ? knownNotes(notesAt(b.id, now.step)).filter((e) => e.kind === "figure").map((e) => `- ${e.name}: ${e.text}`).join("\n") : "";
  const rolls = db()
    .select()
    .from(judgments)
    .where(and(eq(judgments.branchId, b.id), gt(judgments.step, from), lte(judgments.simTime, day)))
    .orderBy(asc(judgments.createdAt))
    .all()
    .map((j) => `- ${j.simTime}: ${j.question} → ${j.chosen} (${j.options.map((o) => `${o.label} ${Math.round(o.probability * 10000) / 100}%`).join("; ")})${j.external ? ", outside the protagonist's reach" : ""}${j.seen ? "" : ", out of the protagonist's sight"}`)
    .join("\n");
  return [
    `[Where things stand on that day] ${now ? now.situation.headline : NONE}`,
    `[The protagonist's key figures on that day, as they knew them (rough)]\n${figures || NONE}`,
    `[The stops from the one the lines parted at, as the protagonist lived them]\n${stops.map((x) => seenStopText(x, x.step > from)).join("\n\n") || NONE}`,
    `[What was rolled after the lines parted, with its odds]\n${rolls || NONE}`,
  ].join("\n\n");
}

/**
 * Sets line `branchId` (A) beside line `otherId` (B). Both are of one play and share where they came from: one forked
 * from the other, or both from a common line.
 */
export async function compareBranches(branchId: string, otherId: string): Promise<{ id: string; title: string; data: Comparison }> {
  const a = getBranch(branchId);
  const b = getBranch(otherId);
  if (a.sessionId !== b.sessionId) throw new Error("The two timelines are not of the same play and cannot be compared");
  const from = partingStep(a, b);
  const marks = { a: markOf(a), b: markOf(b) };

  const kept = db().select().from(reports).where(and(eq(reports.branchId, branchId), eq(reports.kind, "compare"))).orderBy(desc(reports.createdAt)).all();
  for (const r of kept) {
    const d = r.data as Comparison;
    if (d.other === otherId && sameMark(d.marks.a, marks.a) && sameMark(d.marks.b, marks.b)) return { id: r.id, title: r.title, data: d };
  }

  const s = db().select().from(sessions).where(eq(sessions.id, a.sessionId)).get();
  if (!s) throw new Error("No such play");
  const seat = s.seatEntityId;
  const day = a.simTime < b.simTime ? a.simTime : b.simTime;
  const partedOn = db().select({ simTime: decisions.simTime }).from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, from))).get();
  if (!partedOn) throw new Error(`Step ${from} has no record and cannot be compared`);
  // (two lines of an earlier engine keep the comparisons they had, and none is written anew)
  if (!isNarrated(a.state) || !isNarrated(b.state)) throw madeEarlier(s.worldId);
  return compareNarrated({ a, b, otherId, from, day, partedOn: partedOn.simTime, marks, worldId: s.worldId, seat });
}

/**
 * Engine 12: the same comparison, in one call of the main model reading both lines as the protagonist lived them (see
 * `narratedLineText`), kept and given back the same way.
 */
async function compareNarrated(o: { a: BranchRow; b: BranchRow; otherId: string; from: number; day: string; partedOn: string; marks: { a: Mark; b: Mark }; worldId: string; seat: string }): Promise<{ id: string; title: string; data: Comparison }> {
  const w = db().select({ title: worlds.title, scope: worlds.scope, prompt: worlds.prompt }).from(worlds).where(eq(worlds.id, o.worldId)).get();
  const hero = db().select({ name: entities.name }).from(entities).where(eq(entities.id, o.seat)).get()?.name ?? "";
  const out = await generate(
    { role: "reporter", purpose: "narrate_compare", worldId: o.worldId, branchId: o.a.id },
    {
      schema: CompareSchema,
      temperature: 0.3,
      system: `You set two lines of one play side by side for the person who played them. Up to stop ${o.from} they are one line; there the person did one thing on line A and another on line B, and each went its own way. Below is each line from that stop up to ${o.day}, the last day both have reached, as the protagonist lived it, with every roll made after they parted and its odds.
- parted: what the person did at stop ${o.from} on each line.
- differences: how the two lines stand apart on ${o.day}: the protagonist's key figures, who is in or out of the matter, and where things stand. Leave out what is the same on both.
- For each, whether it came from the decision (what the person did differently) or from chance (a roll that fell differently, at the odds it was rolled at), and why. A cause is named only where the stops and rolls listed show it; where they do not, say it is unclear. A roll out of the protagonist's sight may be named as a cause, as what they could not see.
- lesson: what the comparison teaches, concrete to this play: no general advice.
Write it plainly, for the person, as one who knows how such matters go.`,
      prompt: [
        `[World] ${w?.title ?? (w?.scope as Scope | null)?.title ?? w?.prompt ?? ""}`,
        `[The protagonist] ${hero}`,
        `[The lines parted at] stop ${o.from} (${o.partedOn})`,
        `[The day compared] ${o.day}`,
        `# Line A\n\n${narratedLineText(o.a, o.from, o.day)}`,
        `# Line B\n\n${narratedLineText(o.b, o.from, o.day)}`,
      ].join("\n\n"),
    },
  );
  const data: Comparison = { ...out, other: o.otherId, day: o.day, parted: { ...out.parted, step: o.from, day: o.partedOn }, marks: o.marks };
  const id = newId("rep");
  db().insert(reports).values({ id, branchId: o.a.id, kind: "compare", simTime: o.day, title: out.title, data, createdAt: nowIso() }).run();
  return { id, title: out.title, data };
}
