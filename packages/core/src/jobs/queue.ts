import { AsyncLocalStorage } from "node:async_hooks";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobLogs, jobs, worlds } from "../db/schema.js";
import { newId, nowIso } from "../util.js";

export type JobRow = typeof jobs.$inferSelect;
/** "source": a source that was read; "insider": a fact that outsiders did not know at the time (shown as a teaser). */
export type LogLevel = "info" | "warn" | "error" | "source" | "insider";
export type JobContext = {
  job: JobRow;
  log: (message: string, level?: LogLevel) => void;
  /** Persists stage progress so a resumed job skips finished stages. */
  saveCheckpoint: (checkpoint: unknown) => void;
};
export type JobHandler = (ctx: JobContext) => Promise<void>;

const handlers = new Map<string, JobHandler>();

/**
 * The job the current code runs for: its cancel signal and its log. Model calls and searches made anywhere inside a
 * job pick these up, so a job that fails stops everything it still has in flight (nothing keeps running and costing
 * after it), and a slow step can say what it is doing in the job's log.
 */
type Scope = { jobId: string; signal: AbortSignal; log: (message: string, level?: LogLevel) => void };
const scope = new AsyncLocalStorage<Scope>();
export function jobScope(): Scope | undefined {
  return scope.getStore();
}

/** Whether the job the current code runs for has been stopped: what fails then is the stop, not a failure to go past. */
export function jobStopped(): boolean {
  return !!scope.getStore()?.signal.aborted;
}

/** Runs `fn` as code inside a job with this signal: for a test that stops a job partway. */
export function inJobScope<T>(signal: AbortSignal, fn: () => T): T {
  return scope.run({ jobId: "test", signal, log: () => {} }, fn);
}

/** Failures a job can simply run again after, from its checkpoint: dropped connections, timeouts, provider errors. */
export function isTransient(err: unknown): boolean {
  const m = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /fetch failed|network|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|timeout|timed out|aborted|terminated|HTTP 200|HTTP 5\d\d|\b5\d\d\b|upstream|overloaded|rate.?limit|429|Unexpected end of JSON|nothing came back|cut off on the way/i.test(m);
}

/** How many times in a row a job is picked up again by itself after a failure that passes. */
const AUTO_RESUMES = 3;
const resumed = new Map<string, number>();
/** Jobs running in this process right now; a "running" job that isn't here and has gone quiet has stalled. */
const here = new Set<string>();

export function isRunningHere(id: string): boolean {
  return here.has(id);
}
const listeners = new Set<(jobId: string, message: string, level: string) => void>();

export function registerJob(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function onJobLog(fn: (jobId: string, message: string, level: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function enqueue(type: string, payload: unknown, worldId: string | null = null): string {
  const id = newId("job");
  const now = nowIso();
  db()
    .insert(jobs)
    .values({ id, type, worldId, payload, status: "queued", checkpoint: null, error: null, attempts: 0, heartbeatAt: null, createdAt: now, updatedAt: now })
    .run();
  return id;
}

export function getJob(id: string): JobRow | undefined {
  return db().select().from(jobs).where(eq(jobs.id, id)).get();
}

export function jobLogTail(id: string, limit = 50) {
  return db().select().from(jobLogs).where(eq(jobLogs.jobId, id)).orderBy(asc(jobLogs.id)).all().slice(-limit);
}

export function requeue(id: string): void {
  db().update(jobs).set({ status: "queued", error: null, updatedAt: nowIso() }).where(eq(jobs.id, id)).run();
}

function claim(id?: string): JobRow | undefined {
  const d = db();
  const row = id
    ? d.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.status, "queued"))).get()
    : d.select().from(jobs).where(eq(jobs.status, "queued")).orderBy(asc(jobs.createdAt)).get();
  if (!row) return undefined;
  const res = d
    .update(jobs)
    .set({ status: "running", attempts: row.attempts + 1, heartbeatAt: nowIso(), updatedAt: nowIso() })
    .where(and(eq(jobs.id, row.id), eq(jobs.status, "queued")))
    .run();
  return res.changes === 1 ? { ...row, status: "running" } : undefined;
}

/** Runs one job to completion (or failure / pause). */
export async function runJob(row: JobRow): Promise<JobRow> {
  const d = db();
  const handler = handlers.get(row.type);
  const log = (message: string, level: LogLevel = "info") => {
    d.insert(jobLogs).values({ jobId: row.id, at: nowIso(), level, message }).run();
    d.update(jobs).set({ heartbeatAt: nowIso() }).where(eq(jobs.id, row.id)).run();
    for (const fn of listeners) fn(row.id, message, level);
  };
  const ctx: JobContext = {
    job: row,
    log,
    saveCheckpoint: (checkpoint) => {
      row.checkpoint = checkpoint;
      d.update(jobs).set({ checkpoint, updatedAt: nowIso() }).where(eq(jobs.id, row.id)).run();
    },
  };
  here.add(row.id);
  const controller = new AbortController();
  try {
    if (!handler) throw new Error(`Unknown kind of job: ${row.type}`);
    await scope.run({ jobId: row.id, signal: controller.signal, log }, () => handler(ctx));
    d.update(jobs).set({ status: "done", updatedAt: nowIso() }).where(eq(jobs.id, row.id)).run();
    resumed.delete(row.id);
  } catch (err) {
    // whatever the job still has in flight stops with it
    controller.abort(err);
    const message = err instanceof Error ? err.message : String(err);
    const times = resumed.get(row.id) ?? 0;
    if (isTransient(err) && times < AUTO_RESUMES) {
      // a dropped connection or a provider failing: picked up again from the checkpoint by itself, nobody has to click
      resumed.set(row.id, times + 1);
      const wait = 5_000 * (times + 1);
      log(`The network or a provider failed (${message.slice(0, 120)}); going on from the checkpoint by itself in ${wait / 1000} seconds (time ${times + 1})`, "warn");
      d.update(jobs).set({ status: "queued", error: null, updatedAt: nowIso() }).where(eq(jobs.id, row.id)).run();
      if (row.worldId) d.update(worlds).set({ status: "building", error: null, updatedAt: nowIso() }).where(eq(worlds.id, row.worldId)).run();
      setTimeout(() => void runJobNow(row.id), wait);
    } else {
      resumed.delete(row.id);
      log(`Failed: ${message}`, "error");
      d.update(jobs)
        .set({ status: "failed", error: message, updatedAt: nowIso() })
        .where(eq(jobs.id, row.id))
        .run();
    }
  } finally {
    here.delete(row.id);
  }
  return getJob(row.id)!;
}

/** Claims and runs a specific queued job in this process. */
export async function runJobNow(id: string): Promise<JobRow | undefined> {
  const row = claim(id);
  return row ? runJob(row) : getJob(id);
}

/** Long-running worker loop: polls the queue until stopped. */
export async function workLoop(opts: { pollMs?: number; signal?: AbortSignal } = {}): Promise<void> {
  // Jobs left "running" by a crashed process are requeued.
  db().update(jobs).set({ status: "queued" }).where(inArray(jobs.status, ["running"])).run();
  while (!opts.signal?.aborted) {
    const row = claim();
    if (row) await runJob(row);
    else await new Promise((r) => setTimeout(r, opts.pollMs ?? 1500));
  }
}
