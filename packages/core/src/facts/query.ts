import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { branches, decisions, entities, facts, judgments, knownFacts, sessions, startPoints, worlds, type NoteEntry } from "../db/schema.js";
import { mergeNotes } from "../narrate/notes.js";
import type { Situation } from "../sim/schemas.js";
import { dated } from "../sim/days.js";

export type FactRow = typeof facts.$inferSelect & { viewedAt?: string };

export type FactQuery = {
  worldId: string;
  asOf: string; // simulated date YYYY-MM-DD
  viewerId: string | null; // null = only public knowledge
  branchId?: string | null;
};

/**
 * The day a branch's world was frozen: its start point. A branch starts from what was true that day and then goes its
 * own way, so what really happened afterwards never reaches it; only the reports compare the branch with it.
 */
export function frozenAt(branchId: string | null | undefined): string | null {
  if (!branchId) return null;
  return (
    db()
      .select({ date: startPoints.date })
      .from(branches)
      .innerJoin(sessions, eq(sessions.id, branches.sessionId))
      .innerJoin(startPoints, eq(startPoints.id, sessions.startPointId))
      .where(eq(branches.id, branchId))
      .get()?.date ?? null
  );
}

/** The last day whose facts belong to a branch at `asOf`: the day it was frozen, or `asOf` if that is earlier. */
export function factCutoff(asOf: string, frozen: string | null): string {
  return frozen && frozen < asOf ? frozen : asOf;
}

/**
 * The only way characters learn facts. A fact is visible when it was public by the cutoff; or it had occurred by the
 * cutoff and the viewer knew it, by name or by being in a circle it went round in; or the viewer acquired it in this
 * branch. Something that was true but secret when the world was frozen stays secret until someone in the branch finds
 * it out: it is not published on its real date.
 */
export function isVisible(f: FactRow, asOf: string, viewerId: string | null, acquired: Set<string>, frozen: string | null, viewerCircles: ReadonlySet<string> = new Set()): boolean {
  if (acquired.has(f.id)) return true;
  const cut = factCutoff(asOf, frozen);
  if (f.publishedAt && f.publishedAt <= cut) return true;
  if (viewerId && f.occurredAt <= cut && (f.knownBy.includes(viewerId) || f.circles.some((c) => viewerCircles.has(c)))) return true;
  return false;
}

export function acquiredFactIds(branchId: string | null | undefined, viewerId: string | null): Set<string> {
  if (!branchId || !viewerId) return new Set();
  return new Set(
    db()
      .select({ id: knownFacts.factId })
      .from(knownFacts)
      .where(and(eq(knownFacts.branchId, branchId), eq(knownFacts.actorId, viewerId)))
      .all()
      .map((r) => r.id),
  );
}

/**
 * The circles a viewer is in: those the world declared them in (members by name or alias, exactly), and those a
 * timeline put them in since.
 */
export function circlesOf(worldId: string, viewerId: string | null, branchId?: string | null): Set<string> {
  if (!viewerId) return new Set();
  const w = db().select({ scope: worlds.scope }).from(worlds).where(eq(worlds.id, worldId)).get();
  const declared = (w?.scope as { circles?: { id: string; members: string[] }[] } | null)?.circles ?? [];
  const me = db().select().from(entities).where(eq(entities.id, viewerId)).get();
  const names = new Set(me ? [me.name, ...me.aliases] : []);
  const out = new Set(declared.filter((c) => c.members.some((m) => names.has(m))).map((c) => c.id));
  if (branchId) {
    const state = db().select({ state: branches.state }).from(branches).where(eq(branches.id, branchId)).get()?.state;
    for (const id of state?.circles?.[viewerId] ?? []) out.add(id);
  }
  return out;
}

/** Every fact the viewer can see on that day (the whole of what they know, oldest first). */
export function queryFacts(q: FactQuery): FactRow[] {
  const acquired = acquiredFactIds(q.branchId, q.viewerId);
  const frozen = frozenAt(q.branchId);
  const circles = circlesOf(q.worldId, q.viewerId, q.branchId);
  return db()
    .select()
    .from(facts)
    .where(eq(facts.worldId, q.worldId))
    .all()
    .filter((f) => f.occurredAt <= factCutoff(q.asOf, frozen) || (f.evidence?.branchId === q.branchId && f.occurredAt <= q.asOf) || acquired.has(f.id))
    .filter((f) => isVisible(f, q.asOf, q.viewerId, acquired, f.evidence?.branchId === q.branchId ? null : frozen, circles))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((f) => ({ ...f, viewedAt: q.asOf }));
}

// ---------------------------------------------------------------- engine 12: what the protagonist has lived through

/**
 * Engine 12: the notes of a line as they stood at stop `step` (0: the world's own, at the opening): the world's notes
 * with every stop's changes up to it merged in, in order, as the play merged them.
 */
export function notesAt(branchId: string, step: number): NoteEntry[] {
  const worldId = db()
    .select({ worldId: sessions.worldId })
    .from(branches)
    .innerJoin(sessions, eq(sessions.id, branches.sessionId))
    .where(eq(branches.id, branchId))
    .get()?.worldId;
  const base = (worldId && db().select({ notes: worlds.notes }).from(worlds).where(eq(worlds.id, worldId)).get()?.notes?.entries) || [];
  return db()
    .select({ patch: decisions.patch })
    .from(decisions)
    .where(and(eq(decisions.branchId, branchId), lte(decisions.step, step)))
    .orderBy(asc(decisions.step))
    .all()
    .reduce((n, r) => mergeNotes(n, r.patch ?? []), base);
}

/** One stop of an engine-12 line as the protagonist lived it: what they were shown, the rolls they saw come out, what they did there. */
export type SeenStop = { step: number; day: string; situation: Situation; did: string | null; rolls: { day: string; question: string; chosen: string }[] };

/**
 * Engine 12: the stops of a line up to `upTo` (its present stop when not given), each as the protagonist lived it: the
 * stop as the page showed it (its scene, its messages, the ways offered, a main question settled), the rolls whose
 * outcome reached them, and what they did there in their own words. Nothing from the hidden side of the notes, and no
 * roll that happened out of their sight.
 */
export function seenStops(branchId: string, upTo?: number): SeenStop[] {
  const at = upTo ?? db().select({ step: branches.step }).from(branches).where(eq(branches.id, branchId)).get()?.step ?? 0;
  const rolls = db().select().from(judgments).where(and(eq(judgments.branchId, branchId), eq(judgments.seen, true))).orderBy(asc(judgments.createdAt)).all();
  return db()
    .select()
    .from(decisions)
    .where(and(eq(decisions.branchId, branchId), lte(decisions.step, at)))
    .orderBy(asc(decisions.step))
    .all()
    .map((d) => ({
      step: d.step,
      day: d.simTime,
      situation: d.situation as Situation,
      did: d.restatement,
      rolls: rolls.filter((j) => j.step === d.step).map((j) => ({ day: j.simTime ?? d.simTime, question: j.question, chosen: j.chosen })),
    }));
}

/** A stop as the protagonist lived it, as text for a call that must know no more than they do. `whole`: with its scene. */
export function seenStopText(s: SeenStop, whole: boolean): string {
  const x = s.situation;
  return [
    `[Stop ${s.step}, ${dated(s.day)}] ${x.headline}`,
    whole && x.passed?.length ? `On the way:\n${x.passed.map((p) => `- ${dated(p.day)}: ${p.what}`).join("\n")}` : "",
    whole && x.happened?.length ? `What each side did that they saw or learned of:\n${x.happened.map((h) => `- ${dated(h.day)} | ${h.who}: ${h.what}`).join("\n")}` : "",
    whole && x.scene ? x.scene : "",
    whole && x.messages?.length ? `Messages that reached them:\n${x.messages.map((m) => `- ${dated(m.day)} | ${m.from}: ${m.gist}`).join("\n")}` : "",
    s.rolls.length ? `How things fell that they saw:\n${s.rolls.map((r) => `- ${dated(r.day)}: ${r.question} → ${r.chosen}`).join("\n")}` : "",
    ...(x.milestones ?? []).map((m) => `A main question settled: ${m.question} (${m.came ? "it came about" : "it failed"}): ${m.card.result}`),
    s.did ? `What they did: ${s.did}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
