import { metricValues } from "./sim/metrics.js";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import {
  actors,
  branches,
  edges,
  entities,
  exoEvents,
  facts,
  jobs,
  llmCalls,
  sessions,
  sources,
  startPoints,
  worlds,
} from "./db/schema.js";
import { loadEnv } from "./env.js";
import { loadSettings } from "./settings.js";
import { getJob, jobLogTail, onJobLog, requeue, runJobNow, workLoop } from "./jobs/queue.js";
import { worldSpend } from "./llm/trace.js";
export { runningCalls } from "./llm/trace.js";
import type { Scope, WorldProfile } from "./world/schemas.js";
import { getBranch } from "./sim/world.js";
import { currentDecision } from "./sim/engine.js";
import { refuseEarlier } from "./world/build.js";

loadEnv();
loadSettings();

export { config, setConfig, defaultConfig, type KalchasConfig, type Role } from "./config.js";
export { startSession, submitAction, askQuestion, forkBranch, currentDecision, ensureSituation, endPlay } from "./sim/engine.js";
/** Whether a step of this line (its opening included) is being written in this process right now. */
export { stepRunningHere } from "./sim/checkpoint.js";
export type { Setup } from "./world/setup.js";
export type { ActionInput, Ask, ChosenAction, StepResult, Settlement, Progress } from "./sim/engine.js";
export { generateReport, getReport, listReports } from "./sim/report.js";

// engine 12: one model writing the play straight on (see narrate/ and the appendix of docs/plan-single-model.md)
export { ENGINE_NARRATE, isNarrated, noteInstruction } from "./narrate/play.js";
export { peopleCards, notesOf, mergeNotes, type PersonCard } from "./narrate/notes.js";
export { storyText, playMessages } from "./narrate/context.js";
export { narrateReport } from "./narrate/report.js";
export type { NoteEntry, NoteKind, NoteSide, WorldNotes, StoryState, Instruction, CarriedRoll } from "./db/schema.js";
export { compareBranches, type Comparison } from "./sim/compare.js";
export type { Situation, Message, MilestoneShown, Report, Happening, SeenRoll, StopLive } from "./sim/schemas.js";
export type { Milestone, MilestoneCard } from "./db/schema.js";
export type { Scope, WorldProfile } from "./world/schemas.js";
export { onJobLog, getJob, jobLogTail, workLoop, isRunningHere } from "./jobs/queue.js";
export { saveSettings, savedSettings, settingsPath, type SavedSettings } from "./settings.js";
export { queryFacts } from "./facts/query.js";
export { hasOpenRouterKey } from "./env.js";
export { stageSeconds, projectList, monthSpend, worldView, playView, personView, reportView, settingsView, forecastView } from "./views.js";
export type { ProjectCard, BuildView, BranchCard, GraphView, WorldView, IntelItem, FeedItem, PlayView, StopRecord, PersonView, ReportView, SettingsView, ForecastView, LookupView, LedgerView, LastStep, Odds } from "./views.js";
export { createProject, clarifyForecast, startForecast, resumeForecast, rerunForecast, paceForecast, choosePace } from "./forecast/engine.js";
export type { Insight } from "./forecast/insight.js";
export { momentOf, momentLabel, type Moment, type MomentHint } from "./forecast/moment.js";
export type { LookupItem, LookupFor, LookupState } from "./forecast/items.js";
export { heroYou } from "./world/setup.js";
export type { ClarifyItem } from "./db/schema.js";


/** Re-runs a failed build from its last checkpoint (not one of a world made by an earlier engine). */
export async function resumeBuild(jobId: string) {
  const job = getJob(jobId);
  if (!job) throw new Error(`No such job: ${jobId}`);
  refuseEarlier(job.worldId);
  requeue(jobId);
  const done = await runJobNow(jobId);
  return { worldId: job.worldId, jobId, status: done?.status ?? "unknown" };
}

export function listWorlds() {
  return db()
    .select()
    .from(worlds)
    .orderBy(desc(worlds.createdAt))
    .all()
    .map((w) => ({ id: w.id, title: w.title ?? w.prompt, status: w.status, spentUsd: worldSpend(w.id), createdAt: w.createdAt }));
}

export function buildJobFor(worldId: string) {
  return db().select().from(jobs).where(eq(jobs.worldId, worldId)).orderBy(desc(jobs.createdAt)).get();
}

const count = (table: typeof facts | typeof entities | typeof edges | typeof sources | typeof exoEvents | typeof actors, worldId: string) =>
  db().select({ n: sql<number>`count(*)` }).from(table).where(eq(table.worldId, worldId)).get()?.n ?? 0;

export function worldSummary(worldId: string) {
  const w = db().select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!w) throw new Error(`No such world: ${worldId}`);
  return {
    id: w.id,
    prompt: w.prompt,
    title: w.title,
    status: w.status,
    error: w.error,
    scope: w.scope as Scope | null,
    profile: w.profile as WorldProfile | null,
    completeness: w.completeness as { overall: number; questions: { question: string; coverage: number; note: string }[]; blindSpots: string[] } | null,
    endings: w.endings as { id: string; description: string }[] | null,
    counts: {
      entities: count(entities, worldId),
      actors: count(actors, worldId),
      facts: count(facts, worldId),
      insiderFacts: db().select({ n: sql<number>`count(*)` }).from(facts).where(and(eq(facts.worldId, worldId), isNull(facts.publishedAt))).get()?.n ?? 0,
      sources: count(sources, worldId),
      edges: count(edges, worldId),
      exoEvents: count(exoEvents, worldId),
    },
    entities: db().select().from(entities).where(eq(entities.worldId, worldId)).all(),
    startPoints: db().select().from(startPoints).where(eq(startPoints.worldId, worldId)).orderBy(asc(startPoints.ordinal)).all(),
    spentUsd: worldSpend(worldId),
    job: buildJobFor(worldId),
  };
}

export function listSessions(worldId?: string) {
  const rows = worldId
    ? db().select().from(sessions).where(eq(sessions.worldId, worldId)).orderBy(desc(sessions.createdAt)).all()
    : db().select().from(sessions).orderBy(desc(sessions.createdAt)).all();
  return rows.map((s) => ({
    ...s,
    branches: db().select().from(branches).where(eq(branches.sessionId, s.id)).orderBy(asc(branches.createdAt)).all(),
  }));
}

/** Everything a front end needs to render the current step of a branch. */
export function branchView(branchId: string) {
  const b = getBranch(branchId);
  const s = db().select().from(sessions).where(eq(sessions.id, b.sessionId)).get()!;
  const w = db().select().from(worlds).where(eq(worlds.id, s.worldId)).get()!;
  const decision = currentDecision(branchId);
  return {
    branch: { ...b, state: { ...b.state, metrics: metricValues(b.state,b.simTime) } },
    session: s,
    world: { id: w.id, title: w.title, profile: w.profile as WorldProfile, scope: w.scope as Scope },
    situation: decision?.situation ?? null,
  };
}

export function latestBranch(sessionId: string) {
  return db().select().from(branches).where(eq(branches.sessionId, sessionId)).orderBy(desc(branches.createdAt)).get();
}

export function costs(worldId?: string) {
  const where = worldId ? eq(llmCalls.worldId, worldId) : undefined;
  return db()
    .select({
      role: llmCalls.role,
      purpose: llmCalls.purpose,
      calls: sql<number>`count(*)`,
      failed: sql<number>`sum(case when ${llmCalls.ok} then 0 else 1 end)`,
      searches: sql<number>`sum(${llmCalls.searches})`,
      costUsd: sql<number>`sum(${llmCalls.costUsd})`,
    })
    .from(llmCalls)
    .where(where)
    .groupBy(llmCalls.role, llmCalls.purpose)
    .all();
}

export { onJobLog as subscribeJobLog, jobLogTail as tailJobLog };
export const runWorker = workLoop;

// ---------------------------------------------------------------- views for front ends


/** Resumes a failed build in the background (not one of a world made by an earlier engine). */
export function resumeBuildInBackground(jobId: string) {
  const job = getJob(jobId);
  if (!job) throw new Error(`No such job: ${jobId}`);
  refuseEarlier(job.worldId);
  requeue(jobId);
  void runJobNow(jobId);
  return { worldId: job.worldId, jobId };
}

export { adviseBranch } from "./sim/advise.js";
export type { ChatEvent, ChatStep } from "./chat/agent.js";

export {branchHealth,type Health} from "./sim/health.js";
export {publicStepTrace} from "./sim/public-trace.js";
export { languageOf, setLanguage, languageRule, tx } from "./language.js";
