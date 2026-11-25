import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { llmCalls } from "../db/schema.js";
import { newId, nowIso } from "../util.js";
import type { Role } from "../config.js";

export type CallContext = {
  role: Role;
  purpose: string;
  worldId?: string | null;
  branchId?: string | null;
  jobId?: string | null;
  /** The party a call decides for, in a play (who it was is then known, not guessed from what they did). */
  actorId?: string | null;
};

export function worldSpend(worldId: string): number {
  const row = db()
    .select({ total: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)` })
    .from(llmCalls)
    .where(eq(llmCalls.worldId, worldId))
    .get();
  return row?.total ?? 0;
}

export function recordCall(
  ctx: CallContext,
  data: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    searches?: number;
    ms: number;
    ok: boolean;
    error?: string;
    output?: string;
    run?: string;
    attempt?: number;
    lane?: "main" | "hedge";
    provider?: string | null;
    startedAt?: string;
    finishReason?: string | null;
    reasoningTokens?: number | null;
    cachedTokens?: number | null;
    cacheWriteTokens?: number | null;
    thinking?: string | null;
  },
): void {
  db()
    .insert(llmCalls)
    .values({
      id: newId("call"),
      worldId: ctx.worldId ?? null,
      branchId: ctx.branchId ?? null,
      jobId: ctx.jobId ?? null,
      actorId: ctx.actorId ?? null,
      role: ctx.role,
      purpose: ctx.purpose,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      costUsd: data.costUsd,
      searches: data.searches ?? 0,
      ms: data.ms,
      ok: data.ok,
      error: data.error ?? null,
      // kept whole: what came back is the evidence when a step goes wrong
      output: data.output || null,
      run: data.run ?? null,
      attempt: data.attempt ?? null,
      lane: data.lane ?? null,
      provider: data.provider || null,
      startedAt: data.startedAt ?? null,
      finishReason: data.finishReason ?? null,
      reasoningTokens: data.reasoningTokens ?? null,
      cachedTokens: data.cachedTokens ?? null,
      cacheWriteTokens: data.cacheWriteTokens ?? null,
      thinking: data.thinking || null,
      createdAt: nowIso(),
    })
    .run();
}

/**
 * The model calls running right now, by project or world: a call is only written down when it ends, so a page that
 * shows a wait as it happens asks here what is under way (which step, since when). Kept on the process, not in the
 * database; a call running in another process is not seen.
 */
type Running = { worldId: string; purpose: string; startedAt: number };
const running: Map<string, Running> = ((globalThis as { __kalchasRunning?: Map<string, Running> }).__kalchasRunning ??= new Map());

/** Marks a call as under way; the function it returns marks it done. */
export function callStarted(ctx: CallContext): () => void {
  if (!ctx.worldId) return () => {};
  const id = newId("live");
  running.set(id, { worldId: ctx.worldId, purpose: ctx.purpose, startedAt: Date.now() });
  return () => running.delete(id);
}

/** What is under way for a project or world: each step and when it started (epoch ms). */
export function runningCalls(worldId: string): { purpose: string; startedAt: number }[] {
  return [...running.values()].filter((x) => x.worldId === worldId).map(({ purpose, startedAt }) => ({ purpose, startedAt }));
}
