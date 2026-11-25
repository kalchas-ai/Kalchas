import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

/**
 * A world and a line made by an engine before engine 12: kept, and read as they were, and nothing runs on them.
 * Building, opening, moving, asking, forking, ending, reviewing and comparing each refuse, in a sentence of their own.
 */

const { db } = await import("../src/db/client.ts");
const { branches, decisions, entities, forecasts, jobs, sessions, startPoints, worlds } = await import("../src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const { newId, nowIso } = await import("../src/util.ts");
const engine = await import("../src/sim/engine.ts");
const views = await import("../src/views.ts");
const { adviseBranch } = await import("../src/sim/advise.ts");
const { generateReport } = await import("../src/sim/report.ts");
const { compareBranches } = await import("../src/sim/compare.ts");
const { resumeForecast } = await import("../src/forecast/engine.ts");
const { enqueue, runJobNow } = await import("../src/jobs/queue.ts");

const EARLIER = /This play was made by an earlier engine: it can be read, not played on\./;
const DAY = "2026-03-01";

/** A world built under an earlier engine (`engine` null), and a line on it waiting at its second stop, a fork of it beside it. */
function seed() {
  const now = nowIso(), worldId = newId("fc"), seat = newId("ent"), start = newId("start"), sessionId = newId("sess"), branchId = newId("br"), forkId = newId("br");
  const scope = { title: "Open a shop", summary: "", protagonist: { name: "Lin Xia", role: "Someone who wants to open a shop", kind: "person", person: true }, timeStart: DAY, timeEnd: null, historyEnd: DAY, past: false, region: "Shanghai", domain: "", circles: [], real: [], people: { spread: "", placing: "" } };
  db().insert(worlds).values({ id: worldId, prompt: "Open a shop", title: "Open a shop", language: "en", status: "ready", scope, profile: { metrics: [], opening: [] }, completeness: null, endings: [], budgetUsd: 3, error: null, createdAt: now, updatedAt: now }).run();
  db().insert(forecasts).values({ id: worldId, question: "Open a shop", clarify: [], asOf: DAY, createdAt: now }).run();
  db().insert(entities).values({ id: seat, worldId, name: "Lin Xia", kind: "person", aliases: [], summary: "Someone who wants to open a shop", person: true, tier: "cast", branchId: null, createdAt: now }).run();
  db().insert(startPoints).values({ id: start, worldId, ordinal: 1, date: DAY, title: "Opening the shop", rationale: "", difficulty: "", seatEntityId: seat, initialMetrics: {}, createdAt: now }).run();
  db().insert(sessions).values({ id: sessionId, worldId, startPointId: start, seatEntityId: seat, status: "active", createdAt: now }).run();
  for (const [id, parent] of [[branchId, null], [forkId, branchId]] as const) {
    db().insert(branches).values({ id, sessionId, parentBranchId: parent, forkStep: parent ? 1 : null, simTime: DAY, step: 2, seq: 0, state: { engine: 11, seatId: seat }, rngSeed: 7, rngCounter: 0, status: "awaiting_decision", pendingAction: null, createdAt: now }).run();
    for (const step of [1, 2])
      db().insert(decisions).values({ id: newId("dec"), branchId: id, step, simTime: DAY, situation: { headline: `Step ${step}`, scene: "Halfway through talks on the shopfront.", why: "", day: DAY, recommendations: [{ id: "r1", title: "Talk about the shopfront first", detail: "Find the landlord" }] }, chosen: null, restatement: step === 1 ? "Go and talk about the shopfront" : null, eventSeqBefore: 0, createdAt: now }).run();
  }
  return { worldId, branchId, forkId };
}

test("a line of an earlier engine is read as it was, and nothing plays on it", async () => {
  const p = seed();
  const v = views.playView(p.branchId);
  assert.equal(v.situation!.headline, "Step 2");
  assert.deepEqual(v.decisions.map((d) => d.restatement), ["Go and talk about the shopfront", null]);
  assert.equal(views.worldView(p.worldId).title, "Open a shop");
  await assert.rejects(engine.startSession(p.worldId), EARLIER);
  await assert.rejects(engine.submitAction(p.branchId, { kind: "option", id: "r1" }), EARLIER);
  await assert.rejects(engine.askQuestion(p.branchId, "Is the landlord easy to deal with?"), EARLIER);
  await assert.rejects(engine.forkBranch(p.branchId, 1), EARLIER);
  await assert.rejects(engine.endPlay(p.branchId), EARLIER);
  await assert.rejects(adviseBranch(p.branchId, "Is the landlord easy to deal with?"), EARLIER);
  await assert.rejects(generateReport(p.branchId, "manual"), EARLIER);
  await assert.rejects(compareBranches(p.forkId, p.branchId), EARLIER);
  // nothing of it was touched
  assert.equal(db().select().from(branches).all().length, 2, "no fork was made");
  assert.equal(db().select().from(decisions).where(eq(decisions.branchId, p.branchId)).all().length, 2);
  assert.equal(views.playView(p.branchId).branch.status, "awaiting_decision");
});

test("a world of an earlier engine is not built again: its build is refused before it is touched", async () => {
  const p = seed();
  db().update(worlds).set({ status: "paused" }).where(eq(worlds.id, p.worldId)).run();
  const jobId = enqueue("build_world", { worldId: p.worldId }, p.worldId);
  db().update(jobs).set({ status: "paused" }).where(eq(jobs.id, jobId)).run();
  assert.throws(() => resumeForecast(p.worldId), EARLIER);
  assert.equal(db().select().from(jobs).where(eq(jobs.id, jobId)).get()!.status, "paused");
  // a build of one that runs all the same (left queued, say) fails with the same sentence, and leaves the world as it stood
  db().update(jobs).set({ status: "queued" }).where(eq(jobs.id, jobId)).run();
  const job = await runJobNow(jobId);
  assert.equal(job!.status, "failed");
  assert.match(job!.error ?? "", EARLIER);
  assert.equal(db().select().from(worlds).where(eq(worlds.id, p.worldId)).get()!.status, "paused");
});
