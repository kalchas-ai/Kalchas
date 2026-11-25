import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";
useTempDb();
const { db } = await import("../src/db/client.ts");
const { branches, decisions, entities, judgments, sessions, startPoints, worlds } = await import("../src/db/schema.ts");
const { getBranch, updateBranch, saveSnapshot } = await import("../src/sim/world.ts");
const { atomicStep, afterStep, restoreStep } = await import("../src/sim/checkpoint.ts");
const { mapLimit, newId, nowIso } = await import("../src/util.ts");
const tables = ["branches", "sim_events", "memories", "known_facts", "decisions", "snapshots", "judgments", "reports", "entities", "actors", "edges"];
function saved(id: string) {
  return tables.map(t => db().$client.prepare(`SELECT * FROM ${t} WHERE ${t === "branches" ? "id" : "branch_id"} = ? ORDER BY rowid`).all(id).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
/** A line waiting at its first stop, as a play leaves it: its world, session and branch, the stop's decision and its snapshot. */
function seed(): { branchId: string; worldId: string } {
  const now = nowIso(), worldId = newId("world"), sessionId = newId("sess"), branchId = newId("br"), seat = newId("ent"), start = newId("start");
  db().insert(worlds).values({ id: worldId, prompt: "Open a shop", title: "Open a shop", status: "ready", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 3, error: null, engine: 12, createdAt: now, updatedAt: now }).run();
  db().insert(entities).values({ id: seat, worldId, name: "Lin Xia", kind: "person", aliases: [], summary: "Someone who wants to open a shop", person: true, tier: "cast", branchId: null, createdAt: now }).run();
  db().insert(startPoints).values({ id: start, worldId, ordinal: 1, date: "2026-03-01", title: "Opening the shop", rationale: "", difficulty: "", seatEntityId: seat, initialMetrics: {}, createdAt: now }).run();
  db().insert(sessions).values({ id: sessionId, worldId, startPointId: start, seatEntityId: seat, status: "active", createdAt: now }).run();
  db().insert(branches).values({ id: branchId, sessionId, parentBranchId: null, forkStep: null, simTime: "2026-03-01", step: 1, seq: 0, state: { engine: 12 }, rngSeed: 7, rngCounter: 0, status: "awaiting_decision", pendingAction: null, createdAt: now }).run();
  db().insert(decisions).values({ id: newId("dec"), branchId, step: 1, simTime: "2026-03-01", situation: { headline: "Whether to open the shop", scene: "Halfway through talks on the shopfront.", why: "The start", day: "2026-03-01", recommendations: [] }, chosen: null, restatement: null, eventSeqBefore: 0, createdAt: now }).run();
  saveSnapshot(branchId);
  return { branchId, worldId };
}
test("a step that fails part-way is undone whole, the dice and the chosen action included; the next try starts clean", async () => {
  const p = seed(); const before = saved(p.branchId);
  await assert.rejects(atomicStep(p.branchId, async () => {
    db().insert(judgments).values({ id: newId("jdg"), worldId: p.worldId, branchId: p.branchId, simTime: "2026-03-02", question: "Does the landlord reply?", options: [{ label: "Replied", probability: 0.5 }, { label: "No reply", probability: 0.5 }], chosen: "Replied", step: 1, createdAt: nowIso() }).run();
    db().update(decisions).set({ restatement: "Contact the landlord" }).run();
    updateBranch(p.branchId, { step: 2, simTime: "2026-03-02", rngCounter: 1 });
    throw new Error("stop offline");
  }), /stop offline/);
  assert.deepEqual(saved(p.branchId), before);
  await atomicStep(p.branchId, async () => updateBranch(p.branchId, { step: 2 }));
  assert.equal(getBranch(p.branchId).step, 2);
  assert.equal(getBranch(p.branchId).pendingAction, null);
});
test("all in-flight workers drain before rollback; failed work never starts a background task", async () => {
  const p = seed(); const before = saved(p.branchId); let started = false;
  await assert.rejects(atomicStep(p.branchId, async () => {
    afterStep(p.branchId, () => { started = true; });
    await mapLimit([1, 2], 2, async (n) => {
      if (n === 1) throw new Error("worker failed");
      await new Promise(r => setTimeout(r, 15));
      updateBranch(p.branchId, { rngCounter: 999 });
    });
  }), /worker failed/);
  assert.deepEqual(saved(p.branchId), before); assert.equal(started, false);
});
test("a persisted interrupted turn restores on recovery, without touching another branch", async () => {
  const p = seed(); const other = seed(); const before = saved(p.branchId);
  let undo: unknown;
  await atomicStep(p.branchId, async () => { undo = getBranch(p.branchId).pendingAction; });
  updateBranch(p.branchId, { pendingAction: undo, status: "running", rngCounter: 80 });
  const otherBefore = saved(other.branchId);
  assert.equal(restoreStep(p.branchId), true);
  assert.deepEqual(saved(p.branchId), before); assert.deepEqual(saved(other.branchId), otherBefore);
  assert.equal(restoreStep(p.branchId), false);
});
