import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { forecasts } from "../db/schema.js";
import { registerJob, type JobContext } from "../jobs/queue.js";
import { ENGINE_NARRATE } from "../narrate/play.js";
import { madeEarlier } from "../sim/world.js";
import { momentFields, type Setup } from "./setup.js";
import { fillSetup } from "./fill.js";
import { loadWorld, setWorld } from "./store.js";

/**
 * From the person's answers to a world that can be played: the setup's random slots drawn by the program, then the
 * world written by the play's own model in the play's first call (narrate/world.ts). The job keeps its log in four
 * stages, marked as that call gets to each. A world made by an engine before engine 12 is not built again.
 */

export const BUILD_STAGES = ["skeleton", "research", "people", "opening"] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];
/**
 * How the job's log marks each stage, after "▶ " as it begins and "✓ " once it is done. These are markers, not words
 * for people: the pages and the build's own timings match on them byte for byte, so they stay as they were first
 * written (in Chinese, escaped here) whatever the project's language. The page names a stage in the project's
 * language (views.ts).
 */
export const BUILD_STAGE_LABEL: Record<BuildStage, string> = {
  // listing the people of the world and what to look up
  skeleton: "\u5217\u51fa\u4e16\u754c\u91cc\u7684\u4eba\u548c\u8981\u67e5\u7684\u4e8b",
  // researching on the web
  research: "\u8054\u7f51\u67e5\u8bc1",
  // writing the people
  people: "\u5199\u4eba\u8bbe",
  // setting up the opening
  opening: "\u8bbe\u5b9a\u5f00\u5c40",
};

/** The log's last line once a world is built: a marker the pages match on (by its start), kept as first written. */
export const WORLD_BUILT = "✓ \u4e16\u754c\u6784\u5efa\u5b8c\u6210\uff0c\u53ef\u4ee5\u5f00\u59cb\u63a8\u6f14";

/** Refuses to build again, or take up the build of, a world made by an engine before engine 12. */
export function refuseEarlier(worldId: string | null | undefined): void {
  if (worldId && loadWorld(worldId).engine !== ENGINE_NARRATE) throw madeEarlier(worldId);
}

type ForecastRow = typeof forecasts.$inferSelect;

function loadProject(id: string): ForecastRow {
  const f = db().select().from(forecasts).where(eq(forecasts.id, id)).get();
  if (!f) throw new Error(`No such project: ${id}`);
  return f;
}

/** The setup as the build writes it, with what was asked and chosen about pace meanwhile (by a call of its own, and by the person) kept as it now is. */
function withPace(worldId: string, setup: Setup): Setup {
  const now = loadProject(worldId).setup;
  const { pace: _p, paceAsk: _a, ...rest } = setup;
  return { ...rest, ...(now?.paceAsk ? { paceAsk: now.paceAsk } : {}), ...(now?.pace ? { pace: now.pace } : {}) };
}

/** The setup's random slots, drawn by the program before anything is built (nothing is built on a slot unsettled). */
async function drawSetup(ctx: JobContext, worldId: string): Promise<void> {
  const f = loadProject(worldId);
  const st = f.setup;
  if (!st || st.filled) return;
  const { setup: filled, failed } = await fillSetup({ role: "builder", purpose: "setup", worldId, jobId: ctx.job.id }, st, f.question, (m) => ctx.log(m), (pending) => {
    db().update(forecasts).set({ setup: withPace(worldId, pending) }).where(eq(forecasts.id, worldId)).run();
  });
  // what was settled is kept either way: a retry goes on from the draw that failed, nothing is drawn twice
  db().update(forecasts).set({ setup: withPace(worldId, filled), ...(failed.length ? {} : momentFields(filled)) }).where(eq(forecasts.id, worldId)).run();
  if (failed.length) {
    const what = failed.map((x) => `${x.n ? `draw ${x.n}, ` : ""}"${x.variable}" (${x.why})`).join("; ");
    ctx.log(`Draws not made: ${what}`, "warn");
    throw new Error(`Draws not made, so the world was not built: ${what}. A retry goes on from the draw that was not made`);
  }
  ctx.log(`Setup: ${filled.world.value}; playing: ${filled.role.value}; start: ${filled.start.date}${filled.goal ? `; goal: ${filled.goal.value}` : "; no goal"}`);
}

registerJob("build_world", async (ctx) => {
  const { worldId } = ctx.job.payload as { worldId: string };
  // (a world of an earlier engine keeps what it has: its build is refused, and the world left as it stood)
  refuseEarlier(worldId);
  setWorld(worldId, { status: "building", error: null });
  try {
    // the world is written by one model in one call (see narrate/world.ts)
    const { buildNarrateWorld } = await import("../narrate/world.js");
    await buildNarrateWorld(ctx, worldId, drawSetup);
    setWorld(worldId, { status: "ready" });
    // a marker the pages match on, kept as first written: "the world is built, the play can begin"
    ctx.log(WORLD_BUILT);
  } catch (err) {
    setWorld(worldId, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
});
