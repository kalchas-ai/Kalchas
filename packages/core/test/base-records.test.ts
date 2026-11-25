import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

/** For whom a distribution is, as whoever asks gives it in parts: here only the rest, and a year where the test is about one. */
const C = (rest: string, year: number | null = null) => ({ year, ageFrom: null, ageTo: null, group: null, rest });

/**
 * What the base keeps says truthfully where it came from (the program decides what is an estimate and which address
 * counts), the question says which year it is for, and the same quantity written two ways is one record.
 */

const CITE = { url: "https://stats.example/table", title: "Statistical table", excerpt: "Verbatim: 0, 5, 11, 50 per 1000 people; urban 0.4, rural 0.6; Asia 0.5, Africa 0.5, India 0.5, Nigeria 0.5" };
const META = { source: "A statistics bureau, Yearbook", url: CITE.url, year: 2024, estimated: false };
const ctxOf = (worldId: string) => ({ role: "builder" as const, purpose: "t", worldId });

async function lib() {
  const lookup = await import("../src/base/lookup.ts");
  const { standInForGenerate } = await import("../src/llm/generate.ts");
  const { standInForResearch } = await import("../src/llm/research.ts");
  const { db } = await import("../src/db/client.ts");
  const { baseRecords } = await import("../src/db/schema.ts");
  standInForResearch(() => ({ notes: "Notes", citations: [CITE] }));
  return { ...lookup, standInForGenerate, standInForResearch, db, baseRecords };
}

test("a distribution that came back citing nothing is an estimate, and stays in its world", async () => {
  const { lookUpDistribution, standInForGenerate, standInForResearch } = await lib();
  standInForResearch(() => ({ notes: "As far as I know", citations: [] }));
  standInForGenerate(() => ({ buckets: [{ label: "urban", weight: 0.4, rest: false }, { label: "rural", weight: 0.6, rest: false }], ...META }));
  const rec = await lookUpDistribution(ctxOf("w1"), "urban or rural", C("newborns in a country"), "urban, rural");
  assert.equal(rec.estimated, true);
  assert.equal(rec.url, null);
  assert.equal(rec.data.only, "w1");
});

test("the question names the year the conditions give, not the latest", async () => {
  const { lookUpDistribution, standInForGenerate, standInForResearch } = await lib();
  const tasks: string[] = [];
  standInForResearch((_c, task) => (tasks.push(task), { notes: "Notes", citations: [CITE] }));
  standInForGenerate(() => ({ buckets: [{ label: "urban", weight: 0.4, rest: false }, { label: "rural", weight: 0.6, rest: false }], ...META }));
  await lookUpDistribution(ctxOf("w1"), "urban or rural", C("newborns in China", 1977), "urban, rural");
  assert.ok(tasks[0]!.includes("1977") && !tasks[0]!.includes("newest"), tasks[0]);
  // without a year the newest is what is wanted
  await lookUpDistribution(ctxOf("w1"), "urban or rural", C("newborns in another country"), "urban, rural");
  assert.ok(tasks[1]!.includes("newest"), tasks[1]);
});

test("a record is found again by the parts it was asked for with; how it is bucketed is one of them", async () => {
  const { baseKey, lookUpDistribution, standInForGenerate, standInForResearch } = await lib();
  const men = { year: 2026, ageFrom: 30, ageTo: 34, group: "men", rest: "China" };
  // spacing, width and punctuation in how a part was written do not make another record (\uFF0C is a fullwidth comma)
  assert.equal(baseKey("deaths", men), baseKey(" deaths", { ...men, rest: "Chi na\uFF0C", group: "men " }));
  assert.notEqual(baseKey("deaths", men), baseKey("deaths", { ...men, group: "women" }));
  assert.notEqual(baseKey("deaths", men), baseKey("deaths", { ...men, year: 1985 }));
  assert.notEqual(baseKey("deaths", men), baseKey("deaths", { ...men, ageFrom: 35, ageTo: 39 }));
  // no word of a condition is read: an age written into the rest is only part of the rest
  assert.notEqual(baseKey("deaths", men), baseKey("deaths", { year: 2026, ageFrom: null, ageTo: null, group: null, rest: "China men aged 30–34" }));
  assert.notEqual(baseKey("birthplace", C("newborns worldwide", 2026), "by country"), baseKey("birthplace", C("newborns worldwide", 2026), "by continent"));
  let looked = 0;
  standInForResearch(() => (looked++, { notes: "Notes", citations: [CITE] }));
  standInForGenerate(() => ({ buckets: [{ label: "Asia", weight: 0.5, rest: false }, { label: "Africa", weight: 0.5, rest: false }], ...META }));
  await lookUpDistribution(ctxOf("w1"), "birthplace", C("newborns worldwide", 2026), "by continent");
  standInForGenerate(() => ({ buckets: [{ label: "India", weight: 0.5, rest: false }, { label: "Nigeria", weight: 0.5, rest: false }], ...META }));
  const byCountry = await lookUpDistribution(ctxOf("w1"), "birthplace", C("newborns worldwide", 2026), "by country");
  assert.equal(looked, 2, "a table bucketed another way is not the cached one");
  if (byCountry.data.kind === "distribution") assert.deepEqual(byCountry.data.buckets.map((b) => b.label), ["India", "Nigeria"]);
});

test("a record from before these fields is read as it was", async () => {
  const { cite, db, baseRecords } = await lib();
  const { eq } = await import("drizzle-orm");
  const at = new Date().toISOString();
  db()
    .insert(baseRecords)
    .values({ id: "base_legacy", kind: "distribution", variable: "sex", conditions: "newborns worldwide in 2026", key: "sex|newbornsworldwidein2026", data: { kind: "distribution", buckets: [{ label: "male", weight: 0.51 }, { label: "female", weight: 0.49 }] }, source: "United Nations", url: null, year: 2024, estimated: false, lookedUpAt: at, createdAt: at })
    .run();
  const r = db().select().from(baseRecords).where(eq(baseRecords.id, "base_legacy")).get()!;
  assert.equal(r.data.kind, "distribution");
  // cited for no project in particular: the program's own punctuation is English
  assert.equal(cite(r), "United Nations, 2024");
});
