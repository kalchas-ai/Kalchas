import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

/** For whom a distribution is, as whoever asks gives it in parts: here only the rest, and a year where the test is about one. */
const C = (rest: string, year: number | null = null) => ({ year, ageFrom: null, ageTo: null, group: null, rest });

/**
 * The shares of a distribution are put on one scale by the program, for the whole table at once; a table short of the
 * whole is looked up again and then given an explicit catch-all; one over the whole is not used.
 */

const CITE = { url: "https://stats.example/table", title: "Statistical table", excerpt: "A 0.5, B 1.5, C 98; India 0.4, China 0.2; urban 30 or 36, rural 40 or 64; speaks English 0.8, speaks French 0.7" };

async function lib() {
  const lookup = await import("../src/base/lookup.ts");
  const { standInForGenerate } = await import("../src/llm/generate.ts");
  const { standInForResearch } = await import("../src/llm/research.ts");
  standInForResearch(() => ({ notes: "Notes", citations: [CITE] }));
  return { ...lookup, standInForGenerate, standInForResearch };
}

const META = { source: "A statistics bureau, Yearbook", url: CITE.url, year: 2024, estimated: false };
const ctx = { role: "builder" as const, purpose: "t", worldId: "w1" };
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("whether a table is in percent is judged for the whole table, not bucket by bucket", async () => {
  const { scaleBuckets } = await lib();
  const { buckets: b } = scaleBuckets([
    { label: "A", weight: 0.5, rest: false },
    { label: "B", weight: 1.5, rest: false },
    { label: "C", weight: 98, rest: false },
  ]);
  near(b.find((x) => x.label === "A")!.weight, 0.005);
  near(b.find((x) => x.label === "C")!.weight, 0.98);
});

test("shares that fall well short of 1 are looked up again, then given an explicit Other with the sum they came with", async () => {
  const { lookUpDistribution, standInForGenerate, standInForResearch } = await lib();
  let looked = 0;
  standInForResearch(() => (looked++, { notes: "Notes", citations: [CITE] }));
  standInForGenerate(() => ({ buckets: [{ label: "India", weight: 0.4, rest: false }, { label: "China", weight: 0.2, rest: false }], ...META }));
  const logs: string[] = [];
  const rec = await lookUpDistribution(ctx, "country of birth", C("newborns on a continent in 2024"), "by country", (m: string) => logs.push(m));
  assert.equal(looked, 2, "looked up once more before giving up on the table");
  assert.equal(rec.data.kind, "distribution");
  if (rec.data.kind !== "distribution") return;
  // the world of this test has no language of its own: the program names the bucket in English
  const other = rec.data.buckets.find((x) => x.label === "Other");
  assert.ok(other, "an explicit bucket for what the table left out");
  near(other!.weight, 0.4);
  near(rec.data.buckets.find((x) => x.label === "India")!.weight, 0.4);
  near(rec.data.rest!.total, 0.6);
  // the log says what the table added up to
  assert.ok(logs.some((m) => m.includes("60%")), logs.join("\n"));
});

test("a table that is right the second time is used as it is", async () => {
  const { lookUpDistribution, standInForGenerate } = await lib();
  let n = 0;
  standInForGenerate(() => ({ buckets: n++ === 0 ? [{ label: "urban", weight: 30, rest: false }, { label: "rural", weight: 40, rest: false }] : [{ label: "urban", weight: 36, rest: false }, { label: "rural", weight: 64, rest: false }], ...META }));
  const rec = await lookUpDistribution(ctx, "urban or rural", C("newborns in a state in 2024"), "urban, rural");
  if (rec.data.kind !== "distribution") return assert.fail("not a distribution");
  assert.deepEqual(rec.data.buckets.map((b) => b.label), ["urban", "rural"]);
  near(rec.data.buckets[0]!.weight, 0.36);
  assert.equal(rec.data.rest, undefined);
});

test("shares that add up to more than the whole are not a distribution", async () => {
  const { lookUpDistribution, standInForGenerate } = await lib();
  standInForGenerate(() => ({ buckets: [{ label: "speaks English", weight: 0.8, rest: false }, { label: "speaks French", weight: 0.7, rest: false }], ...META }));
  await assert.rejects(() => lookUpDistribution(ctx, "language", C("adults in a country in 2024"), "by language"));
});
