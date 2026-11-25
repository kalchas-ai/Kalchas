import { relationsAt, type Relation } from "./relations.js";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { actors, branches, decisions, edges, sessions, simEvents, snapshots, worlds, type BranchState, type Persona } from "../db/schema.js";
import { EntityIndex } from "../world/store.js";
import type { Circle, Scope, WorldProfile } from "../world/schemas.js";
import { nowIso, rngAt, truncate } from "../util.js";
import { tx } from "../language.js";

export type ActorRow = typeof actors.$inferSelect;
export type EventRow = typeof simEvents.$inferSelect;
export type BranchRow = typeof branches.$inferSelect;

/** Everything about a world that the simulation reads repeatedly. */
export type WorldBundle = {
  id: string;
  /** Played forward from today: there is no real history after the start (a world opening in the past has one). */
  forward: boolean;
  scope: Scope;
  profile: WorldProfile;
  endings: { id: string; description: string }[];
  index: EntityIndex;
  actors: Map<string, ActorRow>;
  /** The relations that hold now: the world's own at its opening, and on a timeline what has become of them. */
  edges: Relation[];
  /** The circles news goes round in, declared when the world was built (none for a world built before them). */
  circles: Circle[];
};

/**
 * This timeline and the ones it was forked from, each with the simulated day up to which what happened there carries
 * over (null for the timeline itself): someone who entered the parent before the fork is here too, later ones aren't.
 */
export function lineage(branchId: string): { id: string; until: string | null }[] {
  const out: { id: string; until: string | null }[] = [];
  let b = db().select().from(branches).where(eq(branches.id, branchId)).get();
  let until = null as string | null;
  while (b) {
    out.push({ id: b.id, until });
    if (!b.parentBranchId || b.forkStep == null) break;
    const at = db().select({ simTime: decisions.simTime }).from(decisions).where(and(eq(decisions.branchId, b.parentBranchId), eq(decisions.step, b.forkStep))).get()?.simTime ?? null;
    until = until && at ? (until < at ? until : at) : (at ?? until);
    b = db().select().from(branches).where(eq(branches.id, b.parentBranchId)).get();
  }
  return out;
}

/** Those who entered this timeline (or the ones it came from, before the fork) during a play. */
export function entrantRows(worldId: string, branchId: string): ActorRow[] {
  const line = lineage(branchId);
  return db()
    .select()
    .from(actors)
    .where(eq(actors.worldId, worldId))
    .all()
    .filter((a) => a.branchId && line.some((l) => l.id === a.branchId && (l.until == null || (a.enteredAt ?? "") <= l.until)));
}

/** A world played forward from today (no real history after its start), as against one with real history to compare. */
export function forwardOf(world: { scope: unknown }): boolean {
  return !(world.scope as { past?: boolean } | null)?.past;
}

/** `building`: the build itself reads the world it is making (to try the opening's lines as a play will write them). */
export function loadWorldBundle(worldId: string, branchId?: string, opts: { building?: boolean } = {}): WorldBundle {
  const w = db().select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!w) throw new Error(`No such world: ${worldId}`);
  if (w.status !== "ready" && !opts.building) throw new Error(`The world is not built yet (status: ${w.status})`);
  const entrants = branchId ? entrantRows(worldId, branchId) : [];
  const ids = new Set(entrants.map(a => a.id));
  const branch = branchId ? getBranch(branchId) : null;
  // those who came into the world on this timeline (newcomers, in the background) and those who came into the cast
  if(branch)for(const id of [...(branch.state.known ?? []).map(k=>k.id),...Object.keys(branch.state.cast ?? {})])ids.add(id);
  // someone from the background who came into the cast on this timeline is played from what this timeline wrote of them
  const joined: ActorRow[] = branch ? Object.entries(branch.state.cast ?? {}).map(([id, c]) => ({ id, worldId, persona: c.persona, tier: "secondary", model: null, branchId: branch.id, enteredAt: c.since, createdAt: c.since })) : [];
  const index = EntityIndex.load(worldId, ids);
  const declared = ((w.scope as { circles?: { id: string; name: string; members: string[] }[] } | null)?.circles ?? []);
  const circles = declared.map((c) => ({ id: c.id, name: c.name, members: index.resolveMany(c.members) }));
  const liveEdges = branch ? relationsAt(branch.state, branch.simTime, null) : builtRelations(worldId);
  return {
    id: worldId,
    forward: forwardOf(w),
    scope: w.scope as Scope,
    profile: w.profile as WorldProfile,
    endings: (w.endings as { id: string; description: string }[] | null) ?? [],
    index,
    // (the protagonist as this timeline holds them: what they put right of what was assumed of them reads as they put it)
    actors: new Map([...db().select().from(actors).where(eq(actors.worldId, worldId)).all().filter((a) => !a.branchId), ...entrants, ...joined].map((a) => [a.id, branch && a.id === branch.state.seatId ? { ...a, persona: putRight(a.persona, branch.state, worldId) } : a])),
    edges: liveEdges,
    circles,
  };
}

/**
 * A persona whole, as its owner (and whoever sees everything) knows it. It is read as text and nothing else: no field
 * of it means anything to the program.
 */
export function personaText(p: Persona): string {
  return `What others can see of them: ${p.public}\nWhat only they know: ${p.private}`;
}
/**
 * The protagonist's persona on a timeline: what was assumed of them at the opening, written into it as assumed, reads as
 * they put it right where they have (see `BranchState.assumptions`). Nothing else of it changes.
 */
export function putRight(p: Persona, state: BranchState, worldId: string | null): Persona {
  let pub = p.public, priv = p.private;
  for (const a of state.assumptions ?? []) {
    if (!a.was || a.was === a.text) continue;
    const now = tx(worldId, "persona.putRight", { text: a.text });
    pub = pub.split(a.was).join(now);
    priv = priv.split(a.was).join(now);
  }
  return pub === p.public && priv === p.private ? p : { ...p, public: pub, private: priv };
}

/** What of a persona others can see. */
export function publicPersona(p: Persona): string {
  return p.public;
}

/**
 * An event as the protagonist sees it: what they were shown, until they find out the truth (the event row keeps the
 * truth; `payload.shown` is the cover, `payload.revealed` set once it is found out).
 */
export function seenAs(e: Pick<EventRow, "title" | "description" | "payload">, viewer?: string): { title: string; description: string; covered: boolean } {
  const p = e.payload as { shown?: string; revealed?: boolean; revealedTo?: string[] } | null;
  const revealed = viewer ? p?.revealedTo?.includes(viewer) : p?.revealed;
  if (p?.shown && !revealed) return { title: truncate(p.shown, 80), description: p.shown, covered: true };
  return { title: e.title, description: e.description, covered: false };
}

export function getBranch(branchId: string): BranchRow {
  const b = db().select().from(branches).where(eq(branches.id, branchId)).get();
  if (!b) throw new Error(`No such timeline: ${branchId}`);
  return b;
}

/**
 * What is said when something would build, play on, fork or review a world or line made by an engine before engine 12
 * (one model writing the play straight on, see narrate/): its records are kept and can be read, and nothing runs on them.
 */
export const madeEarlier = (worldId: string | null | undefined) => new Error(tx(worldId, "play.madeEarlier"));

/** The world a timeline belongs to (whose language the program's own sentences on it are in). */
export function worldIdOf(branchId: string): string | null {
  const b = db().select({ sessionId: branches.sessionId }).from(branches).where(eq(branches.id, branchId)).get();
  return (b && db().select({ worldId: sessions.worldId }).from(sessions).where(eq(sessions.id, b.sessionId)).get()?.worldId) ?? null;
}

export function updateBranch(branchId: string, patch: Partial<typeof branches.$inferInsert>): void {
  db().update(branches).set(patch).where(eq(branches.id, branchId)).run();
}

/** Draws the next deterministic random number for this branch. */
export function draw(branchId: string): number {
  const b = getBranch(branchId);
  updateBranch(branchId, { rngCounter: b.rngCounter + 1 });
  return rngAt(b.rngSeed, b.rngCounter);
}

export function saveSnapshot(branchId: string): void {
  const b = getBranch(branchId);
  const data = { state: b.state, simTime: b.simTime, seq: b.seq, rngCounter: b.rngCounter };
  db().insert(snapshots).values({ branchId, step: b.step, data, createdAt: nowIso() }).onConflictDoUpdate({ target: [snapshots.branchId, snapshots.step], set: { data, createdAt: nowIso() } }).run();
}

/** The relations a world was built with, before any play has changed them. */
function builtRelations(worldId: string): Relation[] {
  return db()
    .select({ id: edges.id, fromId: edges.fromId, toId: edges.toId, label: edges.label, validFrom: edges.validFrom, validTo: edges.validTo })
    .from(edges)
    .where(and(eq(edges.worldId, worldId), eq(edges.origin, "built")))
    .all()
    .map((e) => ({ ...e, simulated: false }));
}
