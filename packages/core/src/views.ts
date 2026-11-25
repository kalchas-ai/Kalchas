import { goalOf } from "./sim/protagonist.js";
import { endOf, relationsAt } from "./sim/relations.js";
import { ledgerFor, policies, type LedgerItem } from "./sim/ledger.js";
import { metricValues, metricEntries, metricDefinitions, type MetricDef } from "./sim/metrics.js";
import {publicNotices} from "./sim/notices.js";
import {personAge} from "./sim/cast.js";
import {branchHealth,type Health} from "./sim/health.js";
import { and, asc, desc, eq, gt, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { db, dbPath } from "./db/client.js";
import {
  actors,
  branches,
  decisions,
  edges,
  entities,
  exoEvents,
  facts,
  forecasts,
  jobLogs,
  judgments,
  jobs,
  llmCalls,
  reports,
  searches,
  sessions,
  simEvents,
  snapshots,
  sources,
  startPoints,
  worlds,
  type BranchState,
  type ClarifyItem,
} from "./db/schema.js";
import { MODEL_CHOICES, config, defaultConfig } from "./config.js";
import { isRunningHere } from "./jobs/queue.js";
import type { Insight } from "./forecast/insight.js";
import { momentOf, type Moment } from "./forecast/moment.js";
import type { Setup } from "./world/setup.js";
import type { LookupItem } from "./forecast/items.js";
import { BUILD_STAGES, BUILD_STAGE_LABEL, type BuildStage } from "./world/build.js";
import { acquiredFactIds, circlesOf, factCutoff, frozenAt, isVisible, type FactRow } from "./facts/query.js";
import { worldSpend } from "./llm/trace.js";
import type { Scope, WorldProfile } from "./world/schemas.js";
import type { Happening, Message, Report, SeenRoll, Situation } from "./sim/schemas.js";
import type { Ask, ChosenAction, Settlement } from "./sim/engine.js";
import { getBranch, forwardOf, loadWorldBundle, personaText, publicPersona, putRight, seenAs, worldIdOf } from "./sim/world.js";
import type { BranchRow } from "./sim/world.js";
import { ENGINE_NARRATE, isNarrated } from "./narrate/play.js";
import { mergeNotes, peopleCards, type PersonCard } from "./narrate/notes.js";
import { figureBoard, knownNotes } from "./sim/ledger.js";
import { notesAt, seenStops } from "./facts/query.js";
import type { NoteEntry } from "./db/schema.js";
import { tx } from "./language.js";

/**
 * Read-only views for the product's pages. Each one is shaped for a screen, and none of them hands the browser
 * anything the protagonist could not know at that moment: hidden facts go out as "something happened here, these
 * people know", never as their content.
 */

type Completeness = { overall: number; questions: { question: string; coverage: number; note: string }[]; blindSpots: string[] };
type Checkpoint = { done?: string[]; tasks?: string[]; tasksDone?: number[] };

const names = (worldId: string) => new Map(db().select({ id: entities.id, name: entities.name }).from(entities).where(eq(entities.worldId, worldId)).all().map((e) => [e.id, e.name]));
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- building a world

export type BuildView = {
  jobId: string;
  /** queued | running | done | failed | paused, or "stalled": marked running, but nothing has run it for a while. */
  status: string;
  error: string | null;
  progress: number;
  stage: string | null;
  stages: { key: string; label: string; state: "done" | "running" | "waiting" }[];
  research: { done: number; total: number; unit: string } | null;
  logs: { at: string; level: string; message: string }[];
};

/**
 * How long each part of the making usually takes here, in seconds: the median over the last builds that finished,
 * read from what the jobs logged as they began and ended each stage (and, for understanding what was said and opening
 * a play, from the calls themselves). A part never measured is left out; the page has a figure of its own for it.
 */
export function stageSeconds(): Record<string, number> {
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null);
  const out: Record<string, number> = {};
  const put = (key: string, xs: number[]) => { const m = median(xs.filter((x) => x > 0 && x < 3600)); if (m != null) out[key] = Math.round(m); };
  const done = db().select().from(jobs).where(and(eq(jobs.status, "done"), eq(jobs.type, "build_world"))).orderBy(desc(jobs.createdAt)).limit(40).all();
  const spans: Record<string, number[]> = { skeleton: [], research: [], opening: [] };
  // the research and the people are one step, logged under both labels
  const LABEL: Record<string, string> = { [BUILD_STAGE_LABEL.skeleton]: "skeleton", [`${BUILD_STAGE_LABEL.research} ‖ ${BUILD_STAGE_LABEL.people}`]: "research", [BUILD_STAGE_LABEL.opening]: "opening" };
  for (const job of done) {
    const began = new Map<string, number>();
    for (const l of db().select().from(jobLogs).where(eq(jobLogs.jobId, job.id)).orderBy(jobLogs.id).all()) {
      const m = l.message.match(/^([▶✓])\s*(.+)$/);
      const key = m ? LABEL[m[2]!.trim()] : undefined;
      if (!key) continue;
      if (m![1] === "▶") began.set(key, Date.parse(l.at));
      else if (began.has(key)) spans[key]!.push((Date.parse(l.at) - began.get(key)!) / 1000);
    }
  }
  for (const [k, xs] of Object.entries(spans)) put(k, xs);
  const calls = (purpose: string) => db().select({ ms: llmCalls.ms }).from(llmCalls).where(and(eq(llmCalls.purpose, purpose), eq(llmCalls.ok, true))).orderBy(desc(llmCalls.createdAt)).limit(20).all().map((c) => c.ms / 1000);
  put("know", calls("clarify"));
  const sit = median(calls("moment"));
  if (sit != null) out.start = Math.round(sit);
  return out;
}

/** A stage of the build as the page names it, in the project's language (the job's log marks it in words of its own, BUILD_STAGE_LABEL). */
const stageLabel = (worldId: string, s: BuildStage) => tx(worldId, `build.${s}`);

/** A job counts as stalled when it is "running" but not in this process and has logged nothing for this long. */
const STALL_MS = 5 * 60_000;

function buildView(worldId: string, logLimit = 60): BuildView | null {
  const job = db().select().from(jobs).where(eq(jobs.worldId, worldId)).orderBy(desc(jobs.createdAt)).get();
  if (!job) return null;
  const cp = (job.checkpoint as { done?: string[] } | null) ?? {};
  const done = new Set(cp.done ?? []);
  // engine 12 builds the world in one call and keeps no stages of its own: a stage is done once its log says so
  if (db().select({ engine: worlds.engine }).from(worlds).where(eq(worlds.id, worldId)).get()?.engine === ENGINE_NARRATE) {
    const said = new Set(db().select({ m: jobLogs.message }).from(jobLogs).where(eq(jobLogs.jobId, job.id)).all().flatMap((l) => (l.m.startsWith("✓ ") ? [l.m.slice(2).trim()] : [])));
    for (const s of BUILD_STAGES) if (said.has(BUILD_STAGE_LABEL[s])) done.add(s);
  }
  const stalled = job.status === "running" && !isRunningHere(job.id) && Date.now() - Date.parse(job.heartbeatAt ?? job.updatedAt) > STALL_MS;
  const running = job.status === "running" && !stalled;
  const firstOpen = BUILD_STAGES.findIndex((s) => !done.has(s));
  // the research and the people run side by side: both are under way once the skeleton is done
  const now = (key: BuildStage) => running && !done.has(key) && (BUILD_STAGES.indexOf(key) === firstOpen || (key === "people" && BUILD_STAGES[firstOpen] === "research"));
  const lookups = db().select({ l: forecasts.lookups }).from(forecasts).where(eq(forecasts.id, worldId)).get()?.l ?? [];
  const research = lookups.length ? { done: lookups.filter((x) => x.state !== "open").length, total: lookups.length, unit: tx(worldId, "research.unit") } : null;
  const partial = !done.has("research") && research ? research.done / research.total : 0;
  const logs = db()
    .select()
    .from(jobLogs)
    .where(eq(jobLogs.jobId, job.id))
    .orderBy(desc(jobLogs.id))
    .limit(logLimit)
    .all()
    .map((l) => ({ at: l.at, level: l.level, message: l.message }));
  return {
    jobId: job.id,
    status: stalled ? "stalled" : job.status,
    error: stalled ? tx(worldId, "build.stalled") : job.error,
    progress: job.status === "done" ? 1 : Math.min(0.99, (done.size + partial) / BUILD_STAGES.length),
    stage: firstOpen >= 0 ? stageLabel(worldId, BUILD_STAGES[firstOpen]!) : null,
    stages: BUILD_STAGES.map((key) => ({ key, label: stageLabel(worldId, key), state: done.has(key) ? "done" : now(key) ? "running" : "waiting" })),
    research,
    logs,
  };
}

// ---------------------------------------------------------------- branches

export type BranchCard = {
  id: string;
  sessionId: string;
  label: string;
  /** Set beside its line under the same conditions (the label says so in words). */
  comparison: boolean;
  externalHistoryFrom?: string;
  parentBranchId: string | null;
  forkStep: number | null;
  step: number;
  simTime: string;
  status: string;
  ended: { reason: string; at: string } | null;
  createdAt: string;
  reports: { id: string; kind: string; title: string; simTime: string }[];
};

function branchCards(sessionId: string): BranchCard[] {
  const rows = db().select().from(branches).where(eq(branches.sessionId, sessionId)).orderBy(asc(branches.createdAt)).all();
  const wid = db().select({ worldId: sessions.worldId }).from(sessions).where(eq(sessions.id, sessionId)).get()?.worldId;
  return rows.map((b) => {
    let label = tx(wid, "branch.main");
    if (b.parentBranchId && b.forkStep != null) {
      const d = db()
        .select({ restatement: decisions.restatement })
        .from(decisions)
        .where(and(eq(decisions.branchId, b.id), eq(decisions.step, b.forkStep)))
        .get();
      label = d?.restatement ? tx(wid, "branch.changed", { step: b.forkStep, what: d.restatement.slice(0, 18) }) : tx(wid, "branch.again", { step: b.forkStep });
    }
    return {
      id: b.id,
      sessionId: b.sessionId,
      label: b.state.comparison ? tx(wid, "branch.matched", { label }) : label,
      comparison: !!b.state.comparison,
      externalHistoryFrom: b.state.externalHistoryFrom,
      parentBranchId: b.parentBranchId,
      forkStep: b.forkStep,
      step: b.step,
      simTime: b.simTime,
      status: b.status,
      ended: endOf(b.state as BranchState),
      createdAt: b.createdAt,
      reports: db()
        .select({ id: reports.id, kind: reports.kind, title: reports.title, simTime: reports.simTime })
        .from(reports)
        // (a comparison of two lines is kept among the reports but is not a review)
        .where(and(eq(reports.branchId, b.id), ne(reports.kind, "compare")))
        .orderBy(asc(reports.createdAt))
        .all(),
    };
  });
}

// ---------------------------------------------------------------- projects

export type ProjectCard = {
  id: string;
  title: string;
  prompt: string;
  /** The project's own status (clarifying, building, ready, …), or "stalled" when its job stopped without saying so. */
  status: string;
  createdAt: string;
  updatedAt: string;
  spentUsd: number;
  build: { progress: number; stage: string | null } | null;
  latest: { branchId: string; simTime: string; step: number; ended: string | null; running: boolean } | null;
  /** The moment it stands at: today, or a day in the past, and whose place you take there. */
  moment: Moment;
};

/** Everything you have made, newest first, with where each one has got to. */
export function projectList(): ProjectCard[] {
  return db()
    .select()
    .from(worlds)
    .orderBy(desc(worlds.updatedAt))
    .all()
    .map((w) => {
      const build = w.status === "building" || w.status === "failed" || w.status === "paused" ? buildView(w.id, 0) : null;
      const stalled = w.status === "building" && build?.status === "stalled";
      const scope = w.scope as Scope | null;
      const row = db().select().from(forecasts).where(eq(forecasts.id, w.id)).get();
      const moment: Moment = row ? momentOf(row) : { at: scope?.timeStart ?? w.createdAt.slice(0, 10), past: !!scope?.past, seat: scope?.protagonist.name ?? null, horizon: scope?.timeEnd ?? null };
      // where its play has got to: the newest line of its newest session
      const s = db().select().from(sessions).where(eq(sessions.worldId, w.id)).orderBy(desc(sessions.createdAt)).get();
      const b = s ? db().select().from(branches).where(eq(branches.sessionId, s.id)).orderBy(desc(branches.createdAt)).get() : undefined;
      return {
        id: w.id,
        title: w.title ?? w.prompt,
        prompt: w.prompt,
        status: stalled ? "stalled" : w.status,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        spentUsd: worldSpend(w.id),
        build: build ? { progress: build.progress, stage: build.stage } : null,
        latest: b ? { branchId: b.id, simTime: b.simTime, step: b.step, ended: endOf(b.state as BranchState)?.reason ?? null, running: b.status === "running" } : null,
        moment,
      };
    });
}

/** Spend since the first of this month (UTC), across everything. */
export function monthSpend(): number {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return db().select({ total: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)` }).from(llmCalls).where(gte(llmCalls.createdAt, from)).get()?.total ?? 0;
}

// ---------------------------------------------------------------- a world

export type GraphView = {
  nodes: { id: string; name: string; aliases: string[]; kind: string; tier: string; summary: string }[];
  edges: { id: string; from: string; to: string; label: string; simulated: boolean }[];
};

function graph(worldId: string, branchId?: string): GraphView {
  // on a timeline: its own newcomers and the relations as they stand there (formed and ended during the play)
  const here = branchId ? loadWorldBundle(worldId, branchId) : null;
  const nodes = db()
    .select()
    .from(entities)
    .where(eq(entities.worldId, worldId))
    .all()
    // the cast as it stands on a timeline (someone from the background who came into it there included); the world's
    // own cast without one
    .filter((e) => (!e.branchId && e.tier !== "background") || !!here?.actors.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, kind: e.kind, tier: e.tier, summary: e.summary }));
  const ids = new Set(nodes.map((n) => n.id));
  const branch = branchId ? getBranch(branchId) : null;
  const rels = (branch ? relationsAt(branch.state, branch.simTime, branch.state.seatId!) : db().select().from(edges).where(eq(edges.worldId, worldId)).all().filter((e) => e.origin === "built").map((e) => ({ ...e, simulated: false })))
    .filter((e) => ids.has(e.fromId) && ids.has(e.toId))
    .map((e) => ({ id: e.id, from: e.fromId, to: e.toId, label: e.label, simulated: e.simulated }));
  return { nodes, edges: rels };
}

// ---------------------------------------------------------------- engine 12: read from the notes and the story

/** A name as cards and the roster are matched on. */
const nameKey = (n: string) => n.trim().toLowerCase();

/** Engine 12: each person's card, by name. */
const cardsByName = (entries: NoteEntry[]): Map<string, PersonCard> => new Map(peopleCards(entries).map((c) => [nameKey(c.name), c]));

/** Engine 12: whether the protagonist knows of someone on the roster: they have no card, or their card has a known side. */
const knownOf = (cards: Map<string, PersonCard>, name: string) => { const c = cards.get(nameKey(name)); return !c || !!c.known.trim(); };

/**
 * Engine 12: who is in the world, as the roster has them (the world's own, and those who came in on this line), each
 * with what the protagonist knows of them from their card as it now stands: never the hidden side, and nobody whose
 * card is all on the hidden side (the protagonist does not know they are there). No ties: the notes keep none.
 */
function graphOfNotes(worldId: string, branchId: string | null, entries: NoteEntry[], seat: string | null): GraphView {
  const cards = cardsByName(entries);
  const nodes = db()
    .select()
    .from(entities)
    .where(eq(entities.worldId, worldId))
    .all()
    .filter((e) => (!e.branchId || e.branchId === branchId) && e.tier !== "background" && (e.id === seat || knownOf(cards, e.name)))
    .map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, kind: e.kind, tier: e.tier, summary: e.id === seat ? e.summary : (cards.get(nameKey(e.name))?.known ?? "") }));
  return { nodes, edges: [] };
}

/** Engine 12: the lane a line of the notes is filed under on the page of what is known. */
function laneOf(e: NoteEntry, wid: string): string {
  if (e.kind === "person") return e.name.trim();
  if (e.kind === "force") return tx(wid, "lane.outside");
  if (e.kind === "figure") return tx(wid, "lane.figures");
  if (e.kind === "road") return tx(wid, "lane.road");
  return tx(wid, "you");
}

/** Engine 12: a line of the notes in words, with what it is about where its text does not say. */
const noteWords = (e: NoteEntry, wid: string) => (e.kind === "person" || e.kind === "assumption" || !e.name.trim() ? e.text : tx(wid, "join.labeled", { label: e.name.trim(), text: e.text }));

/** Engine 12: what is known, as the page of what is known lists it: each known line of the notes, and what the build found. */
function intelOfNotes(entries: NoteEntry[], found: string[], opened: string, wid: string): IntelItem[] {
  const known: IntelItem[] = knownNotes(entries).map((e, i) => ({
    id: `${e.kind}:${i}`,
    status: "known",
    date: e.since,
    lane: laneOf(e, wid),
    text: noteWords(e, wid),
    quote: null,
    published: null,
    insider: false,
    source: null,
    people: e.kind === "person" ? [e.name.trim()] : [],
  }));
  return [...known, ...found.map((text, i): IntelItem => ({ id: `found:${i}`, status: "known", date: opened, lane: tx(wid, "lane.lookedUp"), text, quote: null, published: null, insider: false, source: null, people: [] }))];
}

/**
 * Who holds a line that is the protagonist's own, on the list of what stands: "\u4f60" ("you" in Chinese), whatever the
 * project's language. The pages match on it to tell the protagonist's lines from the others' (it is never shown).
 */
const YOU_OWNER = "\u4f60";

/** Engine 12: what stands as the protagonist knows it, as the page's list of it reads: each person as they see them, and what was assumed of them. */
function ledgerOfNotes(entries: NoteEntry[]): LedgerView[] {
  const known = knownNotes(entries);
  return [
    ...known.filter((e) => e.kind === "assumption").map((e, i) => ({ id: `assumption:${i}`, text: e.text, since: e.since, mine: false, owner: YOU_OWNER, public: false, active: true, endedAt: null, endedWhy: null })),
    ...known.filter((e) => e.kind === "person" && e.text.trim()).map((e, i) => ({ id: `person:${i}`, text: e.text, since: e.since, mine: false, owner: e.name.trim(), public: false, active: true, endedAt: null, endedWhy: null })),
  ];
}

/**
 * Engine 12: how things stand as the protagonist knows it, for the page's column of it beside what is to be decided (a
 * stop writes none of its own): the key figures, the forces in motion and the road ahead, from the known side.
 */
function standingOf(entries: NoteEntry[], wid: string): { title: string; content: string }[] {
  const known = knownNotes(entries);
  return (["figure", "force", "road"] as const).flatMap((k) => known.filter((e) => e.kind === k).map((e) => ({ title: e.name.trim() || laneOf(e, wid), content: e.text })));
}

export type WorldView = {
  /** The project whose questions and answers this world was built from: its own id (a project is its world); null for a world that has none. */
  forecastId?: string | null;
  id: string;
  prompt: string;
  title: string;
  /** Played forward from today: no real history after the start (a world from a past moment has one). */
  forward: boolean;
  status: string;
  error: string | null;
  createdAt: string;
  scope: Scope | null;
  metrics: WorldProfile["metrics"];
  completeness: Completeness | null;
  counts: { entities: number; people: number; facts: number; insider: number; sources: number; edges: number; events: number };
  spentUsd: number;
  build: BuildView | null;
  seatId: string | null;
  startPoints: { ordinal: number; date: string; title: string; rationale: string; difficulty: string; seat: string; metrics: Record<string, number> }[];
  graph: GraphView;
  sessions: { id: string; start: { ordinal: number; title: string; date: string } | null; status: string; createdAt: string; branches: BranchCard[] }[];
};

const countOf = (table: typeof facts | typeof entities | typeof edges | typeof sources | typeof actors, worldId: string) =>
  db().select({ n: sql<number>`count(*)` }).from(table).where(eq(table.worldId, worldId)).get()?.n ?? 0;

export function worldView(worldId: string): WorldView {
  const w = db().select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!w) throw new Error(`No such world: ${worldId}`);
  const nm = names(worldId);
  const starts = db().select().from(startPoints).where(eq(startPoints.worldId, worldId)).orderBy(asc(startPoints.ordinal)).all();
  const profile = w.profile as WorldProfile | null;
  const view: WorldView = {
    forecastId: db().select({ id: forecasts.id }).from(forecasts).where(eq(forecasts.id, worldId)).get()?.id ?? null,
    id: w.id,
    prompt: w.prompt,
    title: w.title ?? (w.scope as Scope | null)?.title ?? w.prompt,
    forward: forwardOf(w),
    status: w.status,
    error: w.error,
    createdAt: w.createdAt,
    scope: w.scope as Scope | null,
    metrics: profile?.metrics ?? [],
    completeness: w.completeness as Completeness | null,
    counts: {
      entities: countOf(entities, worldId),
      people: countOf(actors, worldId),
      facts: countOf(facts, worldId),
      insider: db().select({ n: sql<number>`count(*)` }).from(facts).where(and(eq(facts.worldId, worldId), isNull(facts.publishedAt))).get()?.n ?? 0,
      sources: countOf(sources, worldId),
      edges: countOf(edges, worldId),
      events: db().select({ n: sql<number>`count(*)` }).from(exoEvents).where(eq(exoEvents.worldId, worldId)).get()?.n ?? 0,
    },
    spentUsd: worldSpend(worldId),
    build: buildView(worldId),
    seatId: starts[0]?.seatEntityId ?? null,
    startPoints: starts.map((s) => ({
      ordinal: s.ordinal,
      date: s.date,
      title: s.title,
      rationale: s.rationale,
      difficulty: s.difficulty,
      seat: nm.get(s.seatEntityId) ?? s.seatEntityId,
      metrics: s.initialMetrics,
    })),
    graph: graph(worldId),
    sessions: db()
      .select()
      .from(sessions)
      .where(eq(sessions.worldId, worldId))
      .orderBy(desc(sessions.createdAt))
      .all()
      .map((s) => {
        const sp = starts.find((x) => x.id === s.startPointId);
        return { id: s.id, start: sp ? { ordinal: sp.ordinal, title: sp.title, date: sp.date } : null, status: s.status, createdAt: s.createdAt, branches: branchCards(s.id) };
      }),
  };
  if (w.engine !== ENGINE_NARRATE) return view;
  // engine 12: what the world holds is its notes (the known side of them), and who is in it is the roster of their cards
  const notes = w.notes;
  if (!notes) return view;
  const known = knownNotes(notes.entries);
  const board = figureBoard(notes.entries);
  return {
    ...view,
    metrics: board.defs.map((m) => ({ key: m.key, label: m.label, unit: m.unit, description: m.description ?? "", criticalBelow: null })),
    counts: { ...view.counts, people: peopleCards(known).length, facts: known.length + notes.found.length, insider: 0, edges: 0, events: 0 },
    startPoints: view.startPoints.map((s) => ({ ...s, metrics: Object.keys(s.metrics).length ? s.metrics : board.values })),
    graph: graphOfNotes(worldId, null, notes.entries, view.seatId),
  };
}


// ---------------------------------------------------------------- play

export type IntelItem =
  | {
      id: string;
      status: "known" | "acquired";
      date: string;
      lane: string;
      text: string;
      quote: string | null;
      published: string | null;
      insider: boolean;
      source: { title: string; url: string; host: string } | null;
      people: string[];
    }
  | { id: string; status: "hidden"; date: string; lane: string; knownBy: string[] };

/** How a result came out when it was drawn: the question, the judge's base rate, the odds, the one drawn. */
export type Odds = { question: string; options: { label: string; probability: number }[]; chosen: string };

export type FeedItem = { id: string; seq: number; simTime: string; kind: string; title: string; description: string; actorId: string | null; actor: string | null; mine: boolean; odds: Odds | null };

/** A line of the ledger as the protagonist knows it. */
export type LedgerView = { id: string; text: string; since: string; mine: boolean; owner: string; public: boolean; active: boolean; endedAt: string | null; endedWhy: string | null };

/** What the protagonist chose at the previous step and how the system read it. */
export type LastStep = {
  restatement: string | null;
  /** Who was asked to decide for themselves in that step. */
  asked: string[];
  /** What the step brought (absent on steps from before settlements). */
  settlement: Settlement | null;
  settings: string[];
  rejected: { text: string; why: string }[];
  stopReason: string | null;
  warnings: string[];
  calls: number | null;
};

/** Engine 12: an earlier stop of a line, as the page lists it: its day and headline, what each side did in its stretch, what reached the protagonist, and the rolls they could see. */
export type StopRecord = { step: number; day: string; headline: string; happened: Happening[]; messages: Message[]; rolls: SeenRoll[] };

export type PlayView = {
  notices?:string[];
  health:Health;
  branch: BranchCard & { worldId: string; metrics: Record<string, number>; startMetrics: Record<string, number> };
  /** `metrics`: the protagonist's own numbers as they stand on this timeline (what each is called, its unit, what it is, and its floor where it has one). */
  world: { id: string; title: string; scope: Scope; metrics: MetricDef[]; spentUsd: number };
  seatId: string;
  situation: Situation | null;
  decisions: { step: number; simTime: string; headline: string; restatement: string | null }[];
  graph: GraphView;
  fog: Record<string, number>;
  intel: IntelItem[];
  upcoming: { id: string; title: string; dueAt: string }[];
  feed: FeedItem[];
  branches: BranchCard[];
  /** What is true on this timeline now, as far as you know: premises you set first, then everything else. */
  ledger: LedgerView[];
  /** Questions asked at this step (they don't move the clock). */
  asks: Ask[];
  lastStep: LastStep | null;
  /** What the protagonist is after, as they put it; null when nothing in particular. */
  goal: { text: string; since: string } | null;
  /** Never set any more: a name kept only because the design page of the flow, which is not to be touched, still reads it. */
  arc?: { goal: string; milestones: { reachedAt?: string | null }[] } | null;
  /** The protagonist's standing intentions. */
  policy: { id: string; text: string; since: string }[];
  /** Ended by the protagonist's choice, and the review written then. */
  ended: { reason: string; at: string; reportId: string | null } | null;
  /** Engine 12: the line's stops so far, oldest first, the one it now stands at last (the opening, written at the setting up, is not one). */
  stops?: StopRecord[];
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function visibleEvents(branchId: string, seat: string, nm: Map<string, string>, limit: number): FeedItem[] {
  return db()
    .select()
    .from(simEvents)
    .where(eq(simEvents.branchId, branchId))
    .orderBy(desc(simEvents.seq))
    .all()
    .filter((e) => e.visibility === "public" || e.audience.includes(seat) || (e.actorId === seat && e.kind === "user_action"))
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      seq: e.seq,
      simTime: e.simTime,
      kind: e.kind,
      // what you were shown, until you find out
      ...(({ title, description }) => ({ title, description }))(seenAs(e,seat)),
      actorId: e.actorId,
      actor: e.actorId ? (nm.get(e.actorId) ?? null) : null,
      mine: e.actorId === seat,
      odds: null,
    }));
}

/** Everything the replay page needs for one timeline at its present moment. */
export function playView(branchId: string): PlayView {
  const b = db().select().from(branches).where(eq(branches.id, branchId)).get();
  if (!b) throw new Error(`No such timeline: ${branchId}`);
  const s = db().select().from(sessions).where(eq(sessions.id, b.sessionId)).get()!;
  const w = db().select().from(worlds).where(eq(worlds.id, s.worldId)).get()!;
  const scope = w.scope as Scope;
  const profile = w.profile as WorldProfile;
  const seat = s.seatEntityId;
  const nm = names(w.id);
  const now = b.simTime;
  const state = b.state as BranchState;
  const sp = db().select().from(startPoints).where(eq(startPoints.id, s.startPointId)).get();
  const cards = branchCards(s.id);
  const card = cards.find((c) => c.id === b.id)!;

  const dec = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, b.step))).get();
  const decs = db()
    .select()
    .from(decisions)
    .where(eq(decisions.branchId, branchId))
    .orderBy(asc(decisions.step))
    .all()
    .map((d) => ({ step: d.step, simTime: d.simTime, headline: (d.situation as Situation).headline, restatement: d.restatement }));
  // engine 12: what holds is read from the notes and the story, never from the tables of the engines before it
  if (isNarrated(state)) return narratedPlay({ b, w, seat, cards, card, dec, decs });

  // Intel: everything that has happened by now, split into what you can see and what lies under fog.
  // Only what was true when the world was frozen, plus what this branch has turned up: not the real history after it.
  const acquired = acquiredFactIds(branchId, seat);
  const frozen = frozenAt(branchId);
  const mine = circlesOf(w.id, seat, branchId);
  const happened = db().select().from(facts).where(and(eq(facts.worldId, w.id), lte(facts.occurredAt, factCutoff(now, frozen)))).orderBy(asc(facts.occurredAt)).all();
  const srcs = new Map(db().select().from(sources).where(eq(sources.worldId, w.id)).all().map((x) => [x.id, x]));
  const involvement = new Map<string, number>();
  for (const f of happened) for (const id of f.entityIds) if (id !== seat) involvement.set(id, (involvement.get(id) ?? 0) + 1);
  const top = [...involvement.entries()].sort((a, c) => c[1] - a[1]).slice(0, 5).map(([id]) => id);
  const laneOf = (f: FactRow) => {
    const id = top.find((t) => f.entityIds.includes(t));
    if (id) return nm.get(id) ?? tx(w.id, "other");
    return f.entityIds.includes(seat) ? tx(w.id, "you") : tx(w.id, "other");
  };
  const fog: Record<string, number> = {};
  const intel: IntelItem[] = happened.map((f) => {
    const seen = isVisible(f, now, seat, acquired, frozen, mine);
    if (!seen) {
      for (const id of f.knownBy) if (id !== seat) fog[id] = (fog[id] ?? 0) + 1;
      return { id: f.id, status: "hidden", date: f.occurredAt, lane: laneOf(f), knownBy: f.knownBy.filter((id) => id !== seat) };
    }
    const src = f.sourceId ? srcs.get(f.sourceId) : undefined;
    return {
      id: f.id,
      status: acquired.has(f.id) && !(f.publishedAt && f.publishedAt <= now) && !f.knownBy.includes(seat) ? "acquired" : "known",
      date: f.occurredAt,
      lane: laneOf(f),
      text: f.content,
      quote: f.quote,
      published: f.publishedAt,
      insider: !f.publishedAt,
      source: src ? { title: src.title ?? host(src.url), url: src.url, host: host(src.url) } : null,
      people: f.entityIds.map((id) => nm.get(id) ?? id),
    };
  });

  // What you know is coming: the calendar known from today on a timeline played forward (deadlines, batch dates).
  // Scheduled results and replies are not shown: they are news only when they arrive.
  const upcoming = forwardOf(w)
    ? db()
        .select()
        .from(exoEvents)
        .where(eq(exoEvents.worldId, w.id))
        .orderBy(asc(exoEvents.date))
        .all()
        // (a date that falls today is still to come: it has not been played yet)
        .filter((x) => x.date >= now)
        .slice(0, 6)
        .map((x) => ({ id: x.id, title: x.title, dueAt: x.date }))
    : [];

  return {
    health:branchHealth(branchId),
    notices:[...new Set([...publicNotices(state.notices??[],w.id),...(lastStepOf(branchId,b.step)?.warnings??[])])],
    branch: { ...card, worldId: w.id, metrics: metricValues(state,b.simTime), startMetrics: sp?.initialMetrics ?? metricValues(state,b.simTime) },
    world: { id: w.id, title: w.title ?? scope.title, scope, metrics: metricDefinitions(state), spentUsd: worldSpend(w.id) },
    seatId: seat,
    situation: (dec?.situation as Situation | undefined) ?? null,
    decisions: decs,
    graph: graph(w.id, branchId),
    fog,
    intel,
    upcoming,
    feed: visibleEvents(branchId, seat, nm, 60),
    branches: cards,
    ledger: ledgerView(ledgerFor(state,seat,true,w.id), seat, nm, now),
    asks: (dec?.asks as Ask[] | null) ?? [],
    lastStep: lastStepOf(branchId, b.step),
    goal: goalOf(state),
    policy: policies(state),
    ended: endOf(state)
      ? { ...endOf(state)!, reportId: db().select({ id: reports.id }).from(reports).where(and(eq(reports.branchId, branchId), eq(reports.kind, "final"))).orderBy(desc(reports.createdAt)).get()?.id ?? null }
      : null,
  };
}

/**
 * Engine 12: the replay page's view of a line, read from the notes (the known side only), the stops and the rolls. The
 * page's shape is the same as for any play; what the notes do not keep (ties, fog, the record of events, the calendar
 * ahead) is empty.
 */
function narratedPlay(o: { b: BranchRow; w: typeof worlds.$inferSelect; seat: string; cards: BranchCard[]; card: BranchCard; dec: typeof decisions.$inferSelect | undefined; decs: PlayView["decisions"] }): PlayView {
  const { b, w, seat } = o;
  const state = b.state;
  const story = state.story!;
  const wid = w.id;
  const scope = w.scope as Scope;
  const notes = story.notes;
  const opening = w.notes?.entries ?? notesAt(b.id, 0);
  const board = figureBoard(notes);
  const lastStep = narratedLastStep(b.id, b.step, notes);
  const situation = o.dec ? (o.dec.situation as Situation) : null;
  const goal = db().select({ setup: forecasts.setup }).from(forecasts).where(eq(forecasts.id, wid)).get()?.setup?.goal?.value?.trim();
  return {
    health: branchHealth(b.id),
    notices: [...new Set([...publicNotices(state.notices ?? [], wid), ...(lastStep?.warnings ?? [])])],
    branch: { ...o.card, worldId: wid, metrics: board.values, startMetrics: figureBoard(opening).values },
    world: { id: wid, title: w.title ?? scope?.title ?? w.prompt, scope, metrics: board.defs, spentUsd: worldSpend(wid) },
    seatId: seat,
    // (a stop writes no column of how things stand: the known side of the notes is it)
    situation: situation ? { ...situation, blocks: situation.blocks ?? standingOf(notes, wid) } : null,
    decisions: o.decs,
    graph: graphOfNotes(wid, b.id, notes, seat),
    fog: {},
    intel: intelOfNotes(notes, w.notes?.found ?? [], story.opened, wid),
    upcoming: [],
    feed: [],
    branches: o.cards,
    ledger: ledgerOfNotes(notes),
    asks: (o.dec?.asks as Ask[] | null) ?? [],
    lastStep,
    goal: goal ? { text: goal, since: story.opened } : null,
    // (what they said in the box beside the story to change something, in their words: it stands as they said it)
    policy: (story.instructions ?? []).map((x, i) => ({ id: `said:${i + 1}`, text: x.text, since: x.at })),
    ended: endOf(state)
      ? { ...endOf(state)!, reportId: db().select({ id: reports.id }).from(reports).where(and(eq(reports.branchId, b.id), eq(reports.kind, "final"))).orderBy(desc(reports.createdAt)).get()?.id ?? null }
      : null,
    stops: narratedStops(b.id, b.step),
  };
}

/**
 * Engine 12: the stops of a line up to the one it stands at, oldest first, each as its kept situation has it (what
 * each side did in its stretch: none on a stop written before that was kept) with the rolls of that stop the
 * protagonist could see. A forked line's rolls up to its stop were copied to it when it was made: they are its own.
 */
function narratedStops(branchId: string, upTo: number): StopRecord[] {
  const seen = db().select().from(judgments).where(and(eq(judgments.branchId, branchId), eq(judgments.seen, true))).orderBy(asc(judgments.createdAt), sql`rowid`).all();
  return db()
    .select({ step: decisions.step, day: decisions.simTime, situation: decisions.situation })
    .from(decisions)
    .where(and(eq(decisions.branchId, branchId), lte(decisions.step, upTo)))
    .orderBy(asc(decisions.step))
    .all()
    .map((d) => {
      const x = d.situation as Situation;
      return { step: d.step, day: d.day, headline: x.headline, happened: x.happened ?? [], messages: x.messages ?? [], rolls: seen.filter((j) => j.step === d.step).map((j) => ({ question: j.question, chosen: j.chosen, about: j.about ?? null })) };
    });
}

/**
 * Engine 12: what the person did at the stop before and what came of it, as kept on that stop; the key figures before
 * and after it are read from the notes as they stood at each of the two stops (a stop keeps no numbers of its own).
 */
function narratedLastStep(branchId: string, step: number, now: NoteEntry[]): LastStep | null {
  const last = lastStepOf(branchId, step);
  if (!last?.settlement) return last;
  const m = last.settlement.metrics;
  const cards = cardsByName(now);
  // (someone who came in all on the hidden side came in out of the protagonist's sight)
  const newcomers = last.settlement.newcomers.filter((n) => knownOf(cards, n));
  const metrics = Object.keys(m.before).length || Object.keys(m.after).length ? m : { before: figureBoard(notesAt(branchId, step - 1)).values, after: figureBoard(now).values };
  return { ...last, settlement: { ...last.settlement, newcomers, metrics } };
}

/** The ledger as the protagonist knows it: what stands now, and what stopped standing at the last step. */
function ledgerView(ledger: LedgerItem[], seat: string, nm: Map<string, string>, now: string): LedgerView[] {
  return ledger
    // (the list was drawn up for the protagonist already: only what they know is in it, each as they see it)
    .filter((l) => l.active || (l.endedAt && l.endedAt >= now))
    .map((l) => ({ id: l.id, text: l.text, since: l.since, mine: l.source === "you", owner: l.owner === seat ? YOU_OWNER : (nm.get(l.owner) ?? l.owner), public: l.visibility === "public", active: l.active, endedAt: l.endedAt ?? null, endedWhy: l.endedWhy ?? null }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.active) - Number(a.active) || b.since.localeCompare(a.since));
}

function lastStepOf(branchId: string, step: number): LastStep | null {
  const d = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, step - 1))).get();
  const c = d?.chosen as Partial<ChosenAction> | null | undefined;
  if (!d || !c) return null;
  return {
    restatement: d.restatement,
    asked: c.asked ?? [],
    settlement: c.settlement ?? null,
    settings: c.settings ?? [],
    rejected: c.rejected ?? [],
    stopReason: c.stopReason ?? null,
    warnings: publicNotices(c.notices ?? [], worldIdOf(branchId)),
    calls: c.calls ?? null,
  };
}

// ---------------------------------------------------------------- a person

export type PersonView = {
  id: string;
  name: string;
  kind: string;
  tier: string;
  summary: string;
  aliases: string[];
  /** What they show of themselves (for the protagonist: all of it), as one passage. */
  persona: { identity: string } | null;
  relations: { other: string; otherId: string; label: string; outgoing: boolean; simulated: boolean }[];
  known: { id: string; date: string; text: string }[];
  lastSeen: { simTime: string; title: string } | null;
  fog: number;
};

/** A person as the protagonist can see them: who they are, their ties, what you know about them. */
export function personView(branchId: string, entityId: string): PersonView {
  const b = db().select().from(branches).where(eq(branches.id, branchId)).get();
  if (!b) throw new Error(`No such timeline: ${branchId}`);
  const s = db().select().from(sessions).where(eq(sessions.id, b.sessionId)).get()!;
  const e = db().select().from(entities).where(eq(entities.id, entityId)).get();
  if (!e || e.worldId !== s.worldId || e.branchId && e.branchId !== branchId) throw new Error("No such person");
  const seat = s.seatEntityId;
  if (isNarrated(b.state)) return narratedPerson(b, e, seat);
  const nm = names(s.worldId);
  // someone who came into the cast on this timeline is written in the timeline itself
  const joined = b.state.cast?.[entityId];
  const actor = db().select().from(actors).where(eq(actors.id, entityId)).get() ?? (joined ? { persona: joined.persona } : undefined);
  const acquired = acquiredFactIds(branchId, seat);
  const frozen = frozenAt(branchId);
  const mine = circlesOf(s.worldId, seat, branchId);
  const happened = db().select().from(facts).where(and(eq(facts.worldId, s.worldId), lte(facts.occurredAt, factCutoff(b.simTime, frozen)))).orderBy(desc(facts.occurredAt)).all();
  const about = happened.filter((f) => f.entityIds.includes(entityId));
  const rels = relationsAt(b.state, b.simTime, seat).filter(x=>x.fromId === entityId || x.toId === entityId);
  const last = visibleEvents(branchId, seat, nm, 400).find((f) => f.actorId === entityId);
  const opened=db().select().from(startPoints).where(eq(startPoints.id,s.startPointId)).get()?.date??b.simTime;
  const age=personAge(b.state,entityId,b.simTime,seat);
  const nowText=age==null?"":tx(s.worldId,"person.ageAt",{date:b.simTime,age});
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    tier: e.tier,
    summary: `${tx(s.worldId, "person.firstKnown", { date: opened, summary: e.summary })}${nowText?`\n${nowText}`:""}`,
    aliases: e.aliases,
    // what they show of themselves, not what they really want
    persona: actor ? { identity: `${entityId===seat?personaText(putRight(actor.persona,b.state,s.worldId)):publicPersona(actor.persona)}${nowText?`\n${nowText}`:""}` } : null,
    relations: rels
      .map((x) => {
        const outgoing = x.fromId === entityId;
        const otherId = outgoing ? x.toId : x.fromId;
        return { other: otherId === seat ? tx(s.worldId, "you") : (nm.get(otherId) ?? otherId), otherId, label: x.label, outgoing, simulated: x.simulated };
      })
      .sort((a, c) => Number(c.otherId === seat) - Number(a.otherId === seat)),
    known: about
      .filter((f) => isVisible(f, b.simTime, seat, acquired, frozen, mine))
      .slice(0, 6)
      .map((f) => ({ id: f.id, date: f.occurredAt, text: f.content })),
    lastSeen: last ? { simTime: last.simTime, title: last.title } : null,
    fog: happened.filter((f) => f.knownBy.includes(entityId) && !isVisible(f, b.simTime, seat, acquired, frozen, mine)).length,
  };
}

/**
 * Engine 12: a person as the protagonist can see them, from their card as it now stands (the known side only): who they
 * are and what they want and mean to do, as far as the protagonist knows, and the last stop that showed them. What is
 * out of the protagonist's sight is not counted either.
 */
function narratedPerson(b: BranchRow, e: typeof entities.$inferSelect, seat: string): PersonView {
  const card = cardsByName(b.state.story?.notes ?? []).get(nameKey(e.name));
  const known = e.id === seat ? e.summary : (card?.known ?? "");
  // (what a name says in brackets, ASCII or full-width, is not part of it)
  const key = nameKey(e.name.replace(/[\uff08(].*?[\uff09)]/g, ""));
  const named = (t: string | undefined) => !!key && !!t && t.toLowerCase().includes(key);
  let lastSeen: PersonView["lastSeen"] = null;
  for (const x of seenStops(b.id).reverse()) {
    const m = [...(x.situation.messages ?? [])].reverse().find((y) => named(y.from));
    if (m) lastSeen = { simTime: m.day || x.day, title: m.gist };
    else if (named(x.situation.headline) || named(x.situation.scene)) lastSeen = { simTime: x.day, title: x.situation.headline };
    if (lastSeen) break;
  }
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    tier: e.tier,
    summary: known,
    aliases: e.aliases,
    persona: known ? { identity: known } : null,
    relations: [],
    known: card?.known ? [{ id: `person:${nameKey(card.name)}`, date: card.since, text: card.known }] : [],
    lastSeen,
    fog: 0,
  };
}

// ---------------------------------------------------------------- a report

type Journal = { at: string; key: string; delta: number; reason: string }[];
/** Two lines of a matched fork set side by side on a day both reached: the choices, the numbers, what came from outside. */
export type MatchedComparison = { from: string; until: string; date: string | null; step: number; originalChoice: string | null; newChoice: string | null; original: Record<string, number>; current: Record<string, number>; originalJournal: Journal; currentJournal: Journal; signals: { date: string; title: string }[] };

/** Compare snapshots only on dates both branches actually reached. */
export function comparisonAt(branchId: string, asOf: string): MatchedComparison | null {
  const branch = db().select().from(branches).where(eq(branches.id, branchId)).get();
  const ref = branch?.state.comparison;
  if (!ref) return null;
  if (isNarrated(branch.state)) return narratedComparison(branchId, ref, asOf);
  const { step, from, until, parentId, parentSeq } = ref;
  const cutoff = asOf < until ? asOf : until;
  function timeline(id: string) {
    const points = new Map<string, BranchState>();
    const baseline = new Set<string>();
    const rows = db().select().from(snapshots).where(and(eq(snapshots.branchId, id), gte(snapshots.step, step)))
      .orderBy(asc(snapshots.step)).all();
    for (const row of rows) {
      const snap = row.data as { simTime:string; state:BranchState; seq:number };
      if (snap.simTime > cutoff || (id === parentId && snap.seq > parentSeq)) continue;
      if (row.step === step) for (const entry of metricEntries(snap.state)) baseline.add(entry.id);
      points.set(snap.simTime, snap.state);
    }
    const choice = db().select({text:decisions.restatement}).from(decisions)
      .where(and(eq(decisions.branchId,id), eq(decisions.step,step))).get()?.text ?? null;
    return {points, baseline, choice};
  }

  const parent = timeline(parentId);
  const child = timeline(branchId);
  const date = [...child.points.keys()].filter(d => d > from && parent.points.has(d)).sort().at(-1) ?? null;
  const signals = db().select().from(simEvents).where(and(
    eq(simEvents.branchId,branchId), eq(simEvents.kind,"exogenous"), gt(simEvents.simTime,from), lte(simEvents.simTime,cutoff),
  )).orderBy(asc(simEvents.simTime)).all();
  const seat = db().select({id:sessions.seatEntityId}).from(sessions).where(eq(sessions.id,branch!.sessionId)).get()!.id;
  function ledger(line: ReturnType<typeof timeline>, id:string) {
    if (!date) return [];
    const events = new Map(db().select().from(simEvents).where(eq(simEvents.branchId,id)).all().map(e => [e.id,e]));
    return metricEntries(line.points.get(date)!).filter(x => !line.baseline.has(x.id) && x.delta !== 0).map(x => {
      const event = x.eventId ? events.get(x.eventId) : undefined;
      const visible = event && (event.visibility === "public" || event.audience.includes(seat) || event.actorId === seat);
      const reason = visible ? seenAs(event,seat).title : !x.eventId ? x.why : "";
      return {at:x.at, key:x.key, delta:x.delta, reason};
    });
  }
  return {
    from, until, date, step, originalChoice:parent.choice, newChoice:child.choice,
    original:date ? metricValues(parent.points.get(date)!,date) : {}, current:date ? metricValues(child.points.get(date)!,date) : {},
    originalJournal:ledger(parent,parentId), currentJournal:ledger(child,branchId),
    signals:signals.map(e => ({date:e.simTime, title:e.title})),
  };
}

/**
 * Engine 12: a matched fork beside the line it came from, on the last day the fork has reached after they parted that
 * the original had reached too: what was chosen at the stop they parted on, the key figures each line's notes held on
 * that day (the known side), and what from outside the protagonist's reach came out on the fork as it had on the
 * original (the rolls it carried over, that the protagonist saw). Nothing else is reckoned.
 */
function narratedComparison(branchId: string, ref: NonNullable<BranchState["comparison"]>, asOf: string): MatchedComparison {
  const { step, from, until, parentId, parentSeq } = ref;
  const cutoff = asOf < until ? asOf : until;
  const stops = (id: string, last: number) => db().select({ step: decisions.step, simTime: decisions.simTime, restatement: decisions.restatement }).from(decisions).where(and(eq(decisions.branchId, id), gte(decisions.step, step), lte(decisions.step, last))).orderBy(asc(decisions.step)).all().filter((d) => d.simTime <= cutoff);
  // (on the original, only the stops it had made when the fork was made: `parentSeq` is that stop's number)
  const parent = stops(parentId, parentSeq);
  const child = stops(branchId, Number.MAX_SAFE_INTEGER);
  const reached = parent.at(-1)?.simTime ?? "";
  const date = child.filter((d) => d.simTime > from && d.simTime <= reached).at(-1)?.simTime ?? null;
  const figuresOn = (id: string, rows: typeof parent) => {
    const at = date ? rows.filter((d) => d.simTime <= date).at(-1) : undefined;
    return at ? figureBoard(notesAt(id, at.step)).values : {};
  };
  const choice = (rows: typeof parent) => rows.find((d) => d.step === step)?.restatement ?? null;
  const carried = db()
    .select()
    .from(judgments)
    .where(and(eq(judgments.branchId, branchId), eq(judgments.external, true), eq(judgments.seen, true), gt(judgments.step, step)))
    .orderBy(asc(judgments.createdAt))
    .all()
    .filter((j) => (j.note ?? "").startsWith("carried") && !!j.simTime && j.simTime <= cutoff);
  return {
    from,
    until,
    date,
    step,
    originalChoice: choice(parent),
    newChoice: choice(child),
    original: figuresOn(parentId, parent),
    current: figuresOn(branchId, child),
    originalJournal: [],
    currentJournal: [],
    signals: carried.map((j) => ({ date: j.simTime!, title: `${j.question} → ${j.chosen}` })),
  };
}

export type ReportView = {
  comparison?: ReturnType<typeof comparisonAt>;
  externalHistoryFrom?: string;
  id: string;
  kind: string;
  title: string;
  simTime: string;
  createdAt: string;
  branchId: string;
  data: Report;
  facts: Record<string, { date: string; text: string; published: string | null }>;
  metrics: WorldProfile["metrics"];
  curve: { step: number; simTime: string; metrics: Record<string, number> }[];
  decisions: { step: number; simTime: string; headline: string; restatement: string | null }[];
  /** Played forward from today out of a prediction: compared with its predictions, not with real history. */
  future: boolean;
};

/** A report with what it needs to be read: the hidden facts it names, and the timeline's metrics step by step. */
export function reportView(reportId: string): ReportView {
  const r = db().select().from(reports).where(eq(reports.id, reportId)).get();
  if (!r) throw new Error(`No such report: ${reportId}`);
  const b = db().select().from(branches).where(eq(branches.id, r.branchId)).get()!;
  const s = db().select().from(sessions).where(eq(sessions.id, b.sessionId)).get()!;
  const w = db().select().from(worlds).where(eq(worlds.id, s.worldId)).get()!;
  const data = r.data as Report;
  if (isNarrated(b.state)) return narratedReportView(r, b, w, data);
  const ids = new Set(data.blindSpots.map((x) => x.factId));
  const named = db()
    .select()
    .from(facts)
    .where(eq(facts.worldId, w.id))
    .all()
    .filter((f) => ids.has(f.id));
  const snaps = db()
    .select()
    .from(snapshots)
    .where(eq(snapshots.branchId, b.id))
    .orderBy(asc(snapshots.step))
    .all()
    .map((x) => {
      const d = x.data as { state: BranchState; simTime: string };
      return { step: x.step, simTime: d.simTime, metrics: metricValues(d.state,d.simTime) };
    });
  const state = b.state as BranchState;
  if (!snaps.some((x) => x.simTime === b.simTime)) snaps.push({ step: b.step, simTime: b.simTime, metrics: metricValues(state,b.simTime) });
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    simTime: r.simTime,
    createdAt: r.createdAt,
    branchId: r.branchId,
    comparison: comparisonAt(r.branchId,r.simTime),
    externalHistoryFrom:b.state.externalHistoryFrom,
    data,
    facts: Object.fromEntries(named.map((f) => [f.id, { date: f.occurredAt, text: f.content, published: f.publishedAt }])),
    metrics: (w.profile as WorldProfile).metrics,
    curve: snaps,
    future: forwardOf(w),
    decisions: db()
      .select()
      .from(decisions)
      .where(eq(decisions.branchId, b.id))
      .orderBy(asc(decisions.step))
      .all()
      .map((d) => ({ step: d.step, simTime: d.simTime, headline: (d.situation as Situation).headline, restatement: d.restatement })),
  };
}

/**
 * Engine 12: a review with what it needs to be read. Each blind spot names the hidden line of the notes it rests on as
 * "kind | name" (now that the play is reviewed, it may be read); the key figures stop by stop are read from the notes.
 */
function narratedReportView(r: typeof reports.$inferSelect, b: BranchRow, w: typeof worlds.$inferSelect, data: Report): ReportView {
  const notes = b.state.story?.notes ?? [];
  const lineOf = (id: string) => {
    const [kind = "", ...rest] = id.split("|").map((x) => x.trim());
    const name = nameKey(rest.join("|"));
    const same = notes.filter((e) => e.kind === kind.toLowerCase() && nameKey(e.name) === name);
    return same.find((e) => e.side === "hidden") ?? same[0];
  };
  const facts: ReportView["facts"] = {};
  for (const x of data.blindSpots ?? []) {
    const e = lineOf(x.factId);
    if (e) facts[x.factId] = { date: e.since, text: e.name.trim() ? tx(w.id, "join.labeled", { label: e.name.trim(), text: e.text }) : e.text, published: null };
  }
  const rows = db().select().from(decisions).where(eq(decisions.branchId, b.id)).orderBy(asc(decisions.step)).all();
  let merged = w.notes?.entries ?? [];
  const curve = rows.map((d) => {
    merged = mergeNotes(merged, d.patch ?? []);
    return { step: d.step, simTime: d.simTime, metrics: figureBoard(merged).values };
  });
  const board = figureBoard(notes);
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    simTime: r.simTime,
    createdAt: r.createdAt,
    branchId: r.branchId,
    comparison: comparisonAt(r.branchId, r.simTime),
    externalHistoryFrom: b.state.externalHistoryFrom,
    data: { ...data, blindSpots: data.blindSpots ?? [], decisions: data.decisions ?? [], causalChains: data.causalChains ?? [], lessons: data.lessons ?? [], luck: data.luck ?? [] },
    facts,
    metrics: board.defs.map((m) => ({ key: m.key, label: m.label, unit: m.unit, description: m.description ?? "", criticalBelow: null })),
    curve,
    future: forwardOf(w),
    decisions: rows.map((d) => ({ step: d.step, simTime: d.simTime, headline: (d.situation as Situation).headline, restatement: d.restatement })),
  };
}

// ---------------------------------------------------------------- settings

export type SettingsView = {
  /** The one model that does all the work, and the built-in one it falls back to. */
  defaultModel: string;
  builtinModel: string;
  /** The models offered by name, each with about what a play costs on it. */
  choices: typeof MODEL_CHOICES;
  search: string;
  keyConfigured: boolean;
  dataPath: string;
  monthUsd: number;
  totalUsd: number;
};



export function settingsView(): SettingsView {
  const cfg = config();
  return {
    defaultModel: cfg.defaultModel,
    builtinModel: defaultConfig.defaultModel,
    choices: MODEL_CHOICES,
    search: cfg.search.engine,
    keyConfigured: !!process.env.OPENROUTER_API_KEY,
    dataPath: dbPath(),
    monthUsd: monthSpend(),
    totalUsd: db().select({ total: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)` }).from(llmCalls).get()?.total ?? 0,
  };
}

// ---------------------------------------------------------------- a project, before its world is played

/** One thing the build looked up, and what came back: the facts it established and the searches sent. */
export type LookupView = LookupItem & {
  facts: { id: string; content: string; date: string; quote: string | null; source: { title: string; url: string; host: string } | null }[];
  searches: string[];
};

export type ForecastView = {
  id: string;
  title: string;
  question: string;
  /** clarifying | building | ready | paused | failed, or "stalled" when its job stopped without saying so. */
  status: string;
  error: string | null;
  createdAt: string;
  asOf: string;
  /** The moment the play opens on (today, or a day in the past), and whose place you take there. */
  moment: Moment;
  setup: Setup | null;
  spentUsd: number;
  clarify: ClarifyItem[];
  /** How the matter was understood before the questions (null until it has been). */
  insight: Insight | null;
  build: BuildView | null;
  /** What the build set out to look up, each with where it stands and what came back (empty until the skeleton is written). */
  lookups: LookupView[];
  /** The world to play, once it is ready (the project's own id); null before. */
  worldId: string | null;
};

/** A project as the asking and building screens show it: the question and answers, the progress, what was looked up. */
export function forecastView(id: string): ForecastView {
  const w = db().select().from(worlds).where(eq(worlds.id, id)).get();
  const f = db().select().from(forecasts).where(eq(forecasts.id, id)).get();
  if (!w || !f) throw new Error(`No such project: ${id}`);
  const build = buildView(id);
  const srcs = new Map(db().select().from(sources).where(eq(sources.worldId, id)).all().map((x) => [x.id, x]));
  const found = db().select().from(facts).where(eq(facts.worldId, id)).all();
  const sent = db().select().from(searches).where(eq(searches.projectId, id)).all();
  const lookups: LookupView[] = (f.lookups ?? []).map((x) => ({
    ...x,
    facts: found
      .filter((r) => r.evidence?.item === x.id)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((r) => {
        const src = r.sourceId ? srcs.get(r.sourceId) : undefined;
        return { id: r.id, content: r.content, date: r.occurredAt, quote: r.quote, source: src ? { title: src.title ?? host(src.url), url: src.url, host: host(src.url) } : null };
      }),
    searches: sent.filter((q) => q.item === x.id).map((q) => q.query),
  }));
  // engine 12 sets out no list of things to look up: what its one call looked up is one lookup, the pages it kept its findings
  if (w.engine === ENGINE_NARRATE && !lookups.length) {
    const pages = [...srcs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const asked = sent.filter((q) => q.item === "narrate");
    if (pages.length || asked.length)
      lookups.push({
        id: "narrate",
        for: "other",
        about: "world",
        what: tx(id, "research.what"),
        enough: "",
        believed: null,
        state: w.status === "building" ? "open" : "answered",
        note: "",
        rounds: asked.length,
        facts: pages.map((p) => ({ id: p.id, content: p.title || host(p.url), date: p.createdAt.slice(0, 10), quote: null, source: { title: p.title ?? host(p.url), url: p.url, host: host(p.url) } })),
        searches: asked.map((q) => q.query),
      });
  }
  return {
    id,
    title: w.title ?? f.question,
    question: f.question,
    status: w.status === "building" && build?.status === "stalled" ? "stalled" : w.status,
    error: w.error,
    createdAt: w.createdAt,
    asOf: f.asOf,
    moment: momentOf(f),
    setup: f.setup ?? null,
    spentUsd: worldSpend(id),
    clarify: f.clarify,
    insight: f.insight ?? null,
    build,
    lookups,
    worldId: w.status === "ready" ? id : null,
  };
}
