import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();
beforeEach(async () => {
  const { db } = await import("../src/db/client.ts");
  const { baseRecords } = await import("../src/db/schema.ts");
  db().delete(baseRecords).run();
});

/**
 * A5: the draws that settle a setup. A draw is kept under its own number; one that leans on a failed draw fails with
 * it; a setup with a draw missing is not passed on as settled (the model downstream would then pick for the program);
 * what was drawn must be in the slot as written; and every roll comes from a seed kept with the setup.
 */

type Plan = { slot: "world" | "role" | "goal"; variable: string; conditions: string; hint: string }[];
/** A plan as the model gives it: the group a draw is made from is the structured conditions, here only their free part. */
const asPlan = (plan: Plan) => plan.map((p) => ({ ...p, conditions: { year: null, ageFrom: null, ageTo: null, group: null, rest: p.conditions } }));
/** A writer that puts what was drawn into the slots, word for word. */
const echo = (prompt: string) => {
  const got = (v: string) => prompt.match(new RegExp(`${v}: (\\S+)`))?.[1] ?? "";
  return { world: `2026, ${got("urban or rural")} ${got("country of birth")}`, role: `a baby ${got("sex")}`, start: "The day of birth", goal: null };
};
type Table = { label: string; weight: number }[];

const CITE = { url: "https://stats.example/table", title: "Statistical table", excerpt: "" };
const META = { source: "A statistics bureau", url: CITE.url, year: 2026, estimated: false };
const COUNTRY: Table = [{ label: "India", weight: 0.5, rest: false }, { label: "Nigeria", weight: 0.5, rest: false }];
const SEX: Table = [{ label: "girl", weight: 0.5, rest: false }, { label: "boy", weight: 0.5, rest: false }];
const AREA: Table = [{ label: "rural", weight: 0.6, rest: false }, { label: "urban", weight: 0.4, rest: false }];

const fresh = () => ({
  world: { value: "At random: where one is born in 2026", source: "said" as const, random: true },
  premises: [],
  role: { value: "At random: a newborn", source: "said" as const, random: true, kind: "made" as const, name: null },
  start: { value: "The day of birth", source: "said" as const, date: "2026-03-01" },
  goal: null,
});

/**
 * The model and the lookups, stood in for: `plan` is what it says to draw, `tables` what each variable's lookup finds
 * (null: nothing usable), `write` what it writes into the slots afterwards.
 */
async function stage(plan: Plan, tables: Record<string, Table | null>, write: (prompt: string) => { world: string; role: string; start: string; goal: string | null }) {
  const { fillSetup } = await import("../src/world/fill.ts");
  const { standInForGenerate } = await import("../src/llm/generate.ts");
  const { standInForResearch } = await import("../src/llm/research.ts");
  const calls: string[] = [];
  const asked: string[] = [];
  standInForResearch(() => ({ notes: "Notes", citations: [CITE] }));
  standInForGenerate((c, o) => {
    calls.push(c.purpose);
    if (c.purpose === "setup_draws") return { draws: asPlan(plan) };
    if (c.purpose === "setup_write") return write(o.prompt);
    // a lookup: which table is asked for is in the instruction, the distribution of "<variable>" among "<conditions>"
    const m = o.system.match(/distribution of "([^"]*)" among "([^"]*)"/);
    asked.push(`${m?.[2]} | ${m?.[1]}`);
    const t = tables[m?.[1] ?? ""];
    return { buckets: t ?? [], ...META };
  });
  const ctx = { role: "builder" as const, purpose: "setup", worldId: "w-fill" };
  /** Whatever the fill returns, as { setup, failed } (before the fix it returned the setup alone). */
  const run = async (s: unknown) => {
    const r = (await (fillSetup as (...a: unknown[]) => Promise<unknown>)(ctx, s, "Born at random")) as Record<string, unknown>;
    return ("failed" in r ? r : { setup: r, failed: [] }) as { setup: Record<string, any>; failed: { n: number; variable: string; why: string }[] };
  };
  return { run, calls, asked };
}

const picks = (setup: Record<string, any>, slot: string): string[] => (setup[slot]?.draws ?? []).map((d: { picked: string }) => d.picked);

test("a draw is kept under its own number: {2} is the second draw even when the first failed", async () => {
  const plan: Plan = [
    { slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" },
    { slot: "role", variable: "sex", conditions: "newborns worldwide in 2026", hint: "boy, girl" },
    { slot: "role", variable: "how common the name is", conditions: "{2}s born in 2026", hint: "common, rare" },
  ];
  const s = await stage(plan, { "country of birth": null, sex: SEX, "how common the name is": [{ label: "common", weight: 0.7, rest: false }, { label: "rare", weight: 0.3, rest: false }] }, () => ({ world: "", role: "", start: "", goal: null }));
  const { setup, failed } = await s.run(fresh());
  const sex = [...picks(setup, "role"), ...(setup.pending?.done?.[1] ?? []).map((d: { picked: string }) => d.picked)][0];
  assert.ok(sex === "girl" || sex === "boy");
  assert.ok(s.asked.includes(`${sex}s born in 2026 | how common the name is`), `the third draw was asked of the wrong group: ${s.asked.join("; ")}`);
  assert.deepEqual(failed.map((f) => f.n), [1]);
});

test("a draw that leans on a failed draw fails with it, and the setup is not passed on as settled", async () => {
  const plan: Plan = [
    { slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" },
    { slot: "world", variable: "urban or rural", conditions: "newborns born in {1} in 2026", hint: "urban, rural" },
    { slot: "role", variable: "sex", conditions: "newborns worldwide in 2026", hint: "boy, girl" },
  ];
  const s = await stage(plan, { "country of birth": null, "urban or rural": AREA, sex: SEX }, () => ({ world: "The countryside, 2026", role: "A baby girl", start: "The day of birth", goal: null }));
  const { setup, failed } = await s.run(fresh());
  assert.deepEqual(failed.map((f) => f.n), [1, 2]);
  assert.ok(!s.asked.some((a) => a.endsWith(" | urban or rural")), "nothing is looked up for a group that was never settled");
  assert.notEqual(setup.filled, true);
  assert.ok(!s.calls.includes("setup_write"), "nothing is written from half the draws");
});

test("when every draw fails the setup is not marked as filled", async () => {
  const plan: Plan = [{ slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" }];
  const s = await stage(plan, { "country of birth": null }, () => ({ world: "", role: "", start: "", goal: null }));
  const { setup, failed } = await s.run(fresh());
  assert.deepEqual(failed.map((f) => f.n), [1, 0]); // the role slot also had no planned draw
  assert.notEqual(setup.filled, true);
});

test("a slot left to chance for which nothing was drawn is not settled either", async () => {
  const s = await stage([], {}, () => ({ world: "", role: "", start: "", goal: null }));
  const { setup, failed } = await s.run(fresh());
  assert.ok(failed.length > 0);
  assert.notEqual(setup.filled, true);
});

test("what was drawn must be in the slot as written: an answer that leaves it out is sent back once; left out twice, the setup is not settled and the draws are kept", async () => {
  const plan: Plan = [
    { slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" },
    { slot: "role", variable: "sex", conditions: "newborns worldwide in 2026", hint: "boy, girl" },
  ];
  // the first answer changes the country; the second puts it right
  let n = 0;
  const s = await stage(plan, { "country of birth": COUNTRY, sex: SEX }, (prompt) => (++n === 1 ? { ...echo(prompt), world: "2026, a small town in southern China" } : echo(prompt)));
  const { setup, failed } = await s.run(fresh());
  assert.equal(failed.length, 0);
  assert.equal(setup.filled, true);
  assert.equal(s.calls.filter((c) => c === "setup_write").length, 2, "sent back once");
  assert.ok(setup.world.value.includes(picks(setup, "world")[0]!));
  // left out both times: not settled, nothing written in its place, the draws kept
  const t = await stage(plan, { "country of birth": COUNTRY, sex: SEX }, (prompt) => ({ ...echo(prompt), world: "2026, a small town in southern China" }));
  const again = await t.run(fresh());
  assert.equal(again.setup.filled, undefined);
  // one failure, numbered 0 with both draws made: it is the writing of the slots, not a draw
  assert.deepEqual(again.failed.map((f) => f.n), [0]);
  assert.ok(!["world", "role", "goal", "country of birth", "sex"].includes(again.failed[0]!.variable), again.failed[0]!.variable);
  assert.equal(again.setup.pending.done.filter(Boolean).length, 2);
});

test("every roll comes from a seed kept with the setup; the same seed gives the same draws", async () => {
  const plan: Plan = [
    { slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" },
    { slot: "world", variable: "urban or rural", conditions: "newborns born in {1} in 2026", hint: "urban, rural" },
    { slot: "role", variable: "sex", conditions: "newborns worldwide in 2026", hint: "boy, girl" },
  ];
  const s = await stage(plan, { "country of birth": COUNTRY, "urban or rural": AREA, sex: SEX }, (prompt) => {
    const got = (v: string) => prompt.match(new RegExp(`${v}: (\\S+)`))?.[1] ?? "";
    return { world: `2026, ${got("urban or rural")} ${got("country of birth")}`, role: `a baby ${got("sex")}`, start: "The day of birth", goal: null };
  });
  const { rngAt } = await import("../src/util.ts");
  const real = Math.random;
  Math.random = () => {
    throw new Error("Math.random is not to be used for a draw");
  };
  try {
    const a = await s.run({ ...fresh(), seed: 20261117 });
    assert.equal(a.failed.length, 0);
    assert.equal(a.setup.seed, 20261117);
    const rolls = [...a.setup.world.draws, ...a.setup.role.draws].map((d: { roll: number }) => d.roll);
    assert.equal(rolls.length, 3);
    for (const r of rolls) assert.ok([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some((k) => rngAt(20261117, k) === r), "a roll that is not the seed's");
    const b = await s.run({ ...fresh(), seed: 20261117 });
    assert.deepEqual(picks(b.setup, "world"), picks(a.setup, "world"));
    assert.deepEqual(picks(b.setup, "role"), picks(a.setup, "role"));
    // no seed given: one is made, and kept
    const c = await s.run(fresh());
    assert.equal(typeof c.setup.seed, "number");
  } finally {
    Math.random = real;
  }
});

test("drawing Other is settled by a second draw inside it; no slot is written with Other in it", async () => {
  // a group of its own: the same table looked up by an earlier test here is in the base, and would be used as it is
  const plan: Plan = [{ slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2025", hint: "by country" }];
  const { fillSetup } = await import("../src/world/fill.ts");
  const { standInForGenerate } = await import("../src/llm/generate.ts");
  const { standInForResearch } = await import("../src/llm/research.ts");
  standInForResearch(() => ({ notes: "Notes", citations: [CITE] }));
  const hints: string[] = [];
  standInForGenerate((c, o) => {
    if (c.purpose === "setup_draws") return { draws: asPlan(plan) };
    if (c.purpose === "setup_write") return { world: `${o.prompt.match(/country of birth: (\S+)/g)?.pop()?.split(": ")[1] ?? ""}, 2026`, role: "A newborn", start: "The day of birth", goal: null };
    hints.push(o.system);
    // the table names one country and puts the rest under Other; inside Other, two countries
    return o.system.includes("other than") ? { buckets: [{ label: "Tanzania", weight: 0.5, rest: false }, { label: "Peru", weight: 0.5, rest: false }], ...META } : { buckets: [{ label: "India", weight: 0.01, rest: false }, { label: "Other", weight: 0.99, rest: true }], ...META };
  });
  const { rngAt } = await import("../src/util.ts");
  assert.ok(rngAt(20261117, 0) >= 0.01, "this seed's first roll lands in Other");
  const r = (await (fillSetup as (...a: unknown[]) => Promise<any>)({ role: "builder", purpose: "setup", worldId: "w-other" }, { ...fresh(), seed: 20261117, role: { value: "A newborn", source: "said", kind: "made", name: null } }, "Born at random")) as { setup: Record<string, any>; failed: unknown[] };
  assert.equal(r.failed?.length, 0);
  const final = r.setup.world.draws.at(-1).picked;
  assert.ok(final === "Tanzania" || final === "Peru", `settled on "${final}"`);
  assert.ok(!r.setup.world.value.includes("Other"), r.setup.world.value);
  assert.ok(r.setup.world.value.includes(final));
  assert.equal(hints.length, 2);
});

test("a fill that stopped goes on from where it stopped: nothing settled is drawn again, the plan is not asked for again", async () => {
  const plan: Plan = [
    { slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" },
    { slot: "role", variable: "sex", conditions: "newborns worldwide in 2026", hint: "boy, girl" },
  ];
  const tables: Record<string, Table | null> = { "country of birth": COUNTRY, sex: null };
  const s = await stage(plan, tables, (prompt) => ({ world: `${prompt.match(/country of birth: (\S+)/)?.[1]}, 2026`, role: `a baby ${prompt.match(/sex: (\S+)/)?.[1]}`, start: "The day of birth", goal: null }));
  const first = await s.run(fresh());
  assert.deepEqual(first.failed.map((f) => f.n), [2]);
  assert.notEqual(first.setup.filled, true);
  tables["sex"] = SEX;
  s.calls.length = 0;
  s.asked.length = 0;
  const second = await s.run(first.setup);
  assert.equal(second.failed.length, 0);
  assert.equal(second.setup.filled, true);
  assert.ok(!s.calls.includes("setup_draws"));
  assert.ok(!s.asked.some((a) => a.endsWith(" | country of birth")), "the country was settled the first time");
  assert.equal(second.setup.world.draws[0].picked, first.setup.pending.done[0][0].picked);
  assert.equal(second.setup.pending, undefined);
});

test("the world is not built on a setup with a draw missing", async () => {
  const { db } = await import("../src/db/client.ts");
  const { worlds, forecasts } = await import("../src/db/schema.ts");
  const { eq } = await import("drizzle-orm");
  await import("../src/forecast/engine.ts");
  const { enqueue, runJobNow, jobLogTail } = await import("../src/jobs/queue.ts");
  const { standInForGenerate } = await import("../src/llm/generate.ts");
  const { standInForResearch } = await import("../src/llm/research.ts");
  const { standInForSearch } = await import("../src/forecast/search.ts");
  standInForResearch(() => ({ notes: "Nothing found", citations: [] }));
  standInForSearch(() => []);
  const calls: string[] = [];
  standInForGenerate((c) => {
    calls.push(c.purpose);
    if (c.purpose === "setup_draws") return { draws: asPlan([{ slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" }]) };
    if (c.purpose === "setup_lookup") return { buckets: [], ...META };
    throw new Error("not part of this test");
  });
  const now = new Date().toISOString();
  db().insert(worlds).values({ id: "fc_fill", prompt: "Born at random", title: null, status: "building", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 5, error: null, engine: 12, createdAt: now, updatedAt: now }).run();
  db().insert(forecasts).values({ id: "fc_fill", question: "Born at random", clarify: [], asOf: "2026-03-01", setup: fresh(), createdAt: now }).run();
  const job = await runJobNow(enqueue("build_world", { worldId: "fc_fill" }, "fc_fill"));
  assert.equal(job?.status, "failed");
  // the error names the draw that failed
  assert.match(job?.error ?? "", /country of birth/);
  const kept = db().select().from(forecasts).where(eq(forecasts.id, "fc_fill")).get()!.setup as Record<string, any>;
  assert.notEqual(kept.filled, true);
  assert.deepEqual([...new Set(calls)], ["setup_draws", "setup_lookup"], "nothing was written or looked up on an unsettled setup");
  // and so does a warning in the job's log
  assert.ok(jobLogTail(job!.id).some((l) => l.level === "warn" && l.message.includes("country of birth")));
});

test("a failed setup writer keeps every completed draw for the retry", async () => {
  const plan: Plan = [
    { slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" },
    { slot: "role", variable: "sex", conditions: "newborns worldwide in 2026", hint: "boy, girl" },
  ];
  let fail = true;
  const s = await stage(plan, { "country of birth": COUNTRY, sex: SEX }, (prompt) => {
    if (fail) throw new Error("writer unavailable");
    return echo(prompt);
  });
  const first = await s.run({ ...fresh(), seed: 17 });
  assert.equal(first.setup.filled, undefined);
  assert.equal(first.setup.pending.done.filter(Boolean).length, 2);
  fail = false;
  s.calls.length = 0;
  const next = await s.run(first.setup);
  assert.equal(next.setup.filled, true);
  assert.deepEqual(s.calls, ["setup_write"]);
  assert.equal(next.setup.world.draws[0].roll, first.setup.pending.done[0][0].roll);
});

test("a lookup inside other stopped with its job keeps the outer draw and the random counter", async () => {
  const { fillSetup } = await import("../src/world/fill.ts");
  const { inJobScope } = await import("../src/jobs/queue.ts");
  const stop = new AbortController();
  const { standInForGenerate } = await import("../src/llm/generate.ts");
  const { standInForResearch } = await import("../src/llm/research.ts");
  const { rngAt } = await import("../src/util.ts");
  standInForResearch(() => ({ notes: "Notes", citations: [CITE] }));
  let fail = true;
  let outer = 0;
  standInForGenerate((c, o) => {
    if (c.purpose === "setup_draws") return { draws: asPlan([{ slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" }]) };
    if (c.purpose === "setup_write") return { world: "Peru", role: "A newborn", start: "The day of birth", goal: null };
    if (o.system.includes("other than")) {
      if (fail) {
        stop.abort();
        throw new Error("stopped");
      }
      return { buckets: [{ label: "Peru", weight: 1, rest: false }], ...META };
    }
    outer++;
    return { buckets: [{ label: "India", weight: 0.01, rest: false }, { label: "Other countries", weight: 0.99, rest: true }], ...META };
  });
  let saved: any;
  const setup = { ...fresh(), seed: 20261117, role: { ...fresh().role, random: false } };
  const ctx = { role: "builder" as const, purpose: "setup", worldId: "w-interrupted" };
  await assert.rejects(() => inJobScope(stop.signal, () => fillSetup(ctx, setup, "Born at random", () => {}, (s) => { saved = s; })), /stopped/);
  assert.equal(saved.pending.done[0][0].picked, "Other countries");
  assert.equal(saved.pending.k, 1);
  fail = false;
  const next = await fillSetup(ctx, saved, "Born at random");
  assert.equal(outer, 1);
  assert.equal(next.setup.filled, true);
  assert.equal(next.setup.world.draws?.[1]?.roll, rngAt(20261117, 1));
});

test("a retry plans a missing slot without replacing the earlier draw", async () => {
  const plan: Plan = [{ slot: "world", variable: "country of birth", conditions: "newborns worldwide in 2026", hint: "by country" }];
  const s = await stage(plan, { "country of birth": COUNTRY, sex: SEX }, echo);
  const first = await s.run(fresh());
  assert.deepEqual(first.failed.map((f) => f.n), [0]);
  const country = first.setup.pending.done[0][0];
  plan.splice(0, 1, { slot: "role", variable: "sex", conditions: "newborns born in {1} in 2026", hint: "boy, girl" });
  const next = await s.run(first.setup);
  assert.equal(next.setup.filled, true);
  assert.equal(next.setup.world.draws[0].picked, country.picked);
  assert.equal(next.setup.world.draws[0].roll, country.roll);
});
