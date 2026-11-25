import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

/** Building a project again keeps what the play was set up as; what was drawn is not drawn again. */

const drawn = (date: string) => ({
  world: { value: "Rural Uttar Pradesh, India, in 2026", source: "drawn" as const, draws: [{ variable: "country of birth", conditions: "newborns worldwide in 2026", buckets: [{ label: "India", weight: 0.17 }, { label: "Other countries", weight: 0.83 }], picked: "India", roll: 0.05, source: "United Nations, 2024", recordId: null }] },
  premises: [{ text: "I am born again", source: "said" as const }],
  role: { value: "A newborn baby girl", source: "drawn" as const, kind: "made" as const, name: null, draws: [{ variable: "sex", conditions: "newborns born in India in 2026", buckets: [{ label: "girl", weight: 0.48 }, { label: "boy", weight: 0.52 }], picked: "girl", roll: 0.2, source: "United Nations, 2024", recordId: null }] },
  start: { value: "The day of birth", source: "said" as const, date },
  goal: null,
  filled: true,
  seed: 12345,
});

async function stage() {
  const { db } = await import("../src/db/client.ts");
  const { worlds, forecasts } = await import("../src/db/schema.ts");
  const { eq } = await import("drizzle-orm");
  const { rerunForecast } = await import("../src/forecast/engine.ts");
  const { getJob } = await import("../src/jobs/queue.ts");
  const { standInForGenerate } = await import("../src/llm/generate.ts");
  const { standInForResearch } = await import("../src/llm/research.ts");
  const { standInForSearch } = await import("../src/forecast/search.ts");
  const calls: string[] = [];
  // nothing answers: the build started by the rerun stops at its first call, which is all this test needs
  standInForGenerate((c) => {
    calls.push(c.purpose);
    throw new Error("not part of this test");
  });
  standInForResearch(() => {
    throw new Error("not part of this test");
  });
  standInForSearch(() => {
    throw new Error("not part of this test");
  });
  const make = (id: string, setup: unknown, asOf: string, createdAt: string) => {
    db().insert(worlds).values({ id, prompt: "Born at random", title: "Born at random", status: "ready", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 5, error: null, createdAt, updatedAt: createdAt }).run();
    db().insert(forecasts).values({ id, question: "Born at random", clarify: [], asOf, setup: setup as never, createdAt }).run();
  };
  /** The rerun's own build, waited for until it has stopped (it runs by itself after the call returns). */
  const settled = async (id: string) => {
    const { jobs } = await import("../src/db/schema.ts");
    for (let i = 0; i < 200; i++) {
      const j = db().select().from(jobs).where(eq(jobs.worldId, id)).get();
      if (j && getJob(j.id)!.status !== "queued" && getJob(j.id)!.status !== "running") return;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail("the rerun's build did not stop");
  };
  const setupOf = (id: string) => db().select().from(forecasts).where(eq(forecasts.id, id)).get()!.setup as Record<string, any> | null;
  return { make, rerunForecast, settled, setupOf, calls };
}

test("a play in the past is set up again exactly as it was", async () => {
  const s = await stage();
  const setup = drawn("1985-09-17");
  s.make("fc_past", setup, "1985-09-17", "2026-11-01T00:00:00.000Z");
  const { id } = s.rerunForecast("fc_past");
  await s.settled(id);
  assert.deepEqual(s.setupOf(id), setup);
  assert.ok(!s.calls.includes("setup_draws"), "what was drawn is not drawn again");
});

test("a play from today starts today again, with the same draws", async () => {
  const s = await stage();
  const today = new Date().toISOString().slice(0, 10);
  const setup = drawn("2026-11-01");
  s.make("fc_today", setup, "2026-11-01", "2026-11-01T00:00:00.000Z");
  const { id } = s.rerunForecast("fc_today");
  await s.settled(id);
  const got = s.setupOf(id)!;
  assert.ok(got, "the setup was carried over");
  assert.deepEqual(got.world, setup.world);
  assert.deepEqual(got.role, setup.role);
  assert.deepEqual(got.premises, setup.premises);
  assert.equal(got.filled, true);
  assert.equal(got.seed, 12345);
  // the setup's start and the project's moment agree
  assert.equal(got.start.date, today);
  assert.ok(!s.calls.includes("setup_draws"));
});
