import { and, eq, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { judgments, llmCalls, sessions } from "../db/schema.js";
import { getBranch } from "./world.js";

/**
 * How a play is going as a machine: what it has cost, how much of what was rolled stood on an estimate, what is still
 * waiting. Counted from the record; nothing here reads a word of it.
 */
export type StepPerformance = { step: number; startedAt: string; finishedAt: string; wallMs: number; calls: number; costUsd: number; lookupUsd: number; modelUsd: number };
export function recordPerformance(branchId: string, step: number, startedAt: string, wallMs: number): StepPerformance {
  const calls = db().select().from(llmCalls).where(and(eq(llmCalls.branchId, branchId), gte(llmCalls.createdAt, startedAt))).all();
  const costUsd = calls.reduce((s, c) => s + c.costUsd, 0), lookupUsd = calls.filter((c) => c.searches > 0).reduce((s, c) => s + c.costUsd, 0);
  return { step, startedAt, finishedAt: new Date().toISOString(), wallMs, calls: calls.length, costUsd, lookupUsd, modelUsd: costUsd - lookupUsd };
}
export function branchHealth(branchId: string) {
  const b = getBranch(branchId), session = db().select().from(sessions).where(eq(sessions.id, b.sessionId)).get();
  if (!session) throw new Error("No such play");
  const allCalls = db().select().from(llmCalls).where(eq(llmCalls.branchId, branchId)).all();
  const total = allCalls.reduce((s, c) => s + c.costUsd, 0), steps = b.state.performance ?? [];
  const judged = db().select().from(judgments).where(eq(judgments.branchId, branchId)).all();
  const estimated = judged.filter((j) => j.estimated).length;
  return {
    pending: { fates: b.state.fates?.length ?? 0, background: b.state.background?.length ?? 0, notices: b.state.notices?.length ?? 0 },
    odds: { judged: judged.length, estimated, share: judged.length ? estimated / judged.length : null },
    cost: { totalUsd: total, unassignedUsd: Math.max(0, total - steps.reduce((s, x) => s + x.costUsd, 0)), failedCalls: allCalls.filter((c) => !c.ok).length, steps },
  };
}
export type Health = ReturnType<typeof branchHealth>;
