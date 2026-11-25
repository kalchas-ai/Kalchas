/**
 * Engine 12's roster (the entities a page names, shows and opens people by): only those the protagonist knows of, as
 * they know them; someone known only on the hidden side comes in once a line the protagonist knows of them is written;
 * each line writes its own newcomers, a fork included. Offline: a stand-in writes what the model would.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

const { db } = await import("../src/db/client.ts");
const { worlds, forecasts, entities } = await import("../src/db/schema.ts");
const { eq, and, isNull } = await import("drizzle-orm");
const { standInForNarrate } = await import("../src/narrate/call.ts");
const { standInForSearch } = await import("../src/forecast/search.ts");
const { enqueue, runJobNow } = await import("../src/jobs/queue.ts");
const engine = await import("../src/sim/engine.ts");
type StepResult = import("../src/sim/engine.ts").StepResult;

const queue: Record<string, (() => string)[]> = {};
const answer = (purpose: string, fn: () => string) => (queue[purpose] ??= []).push(fn);
standInForNarrate((c) => {
  const next = queue[c.purpose]?.shift();
  if (!next) throw new Error(`nothing to answer ${c.purpose}`);
  return next();
});
standInForSearch(() => []);

const W = "fc_harbour";
const OPEN = "2026-05-04";
const stop = (day: string, notes: string[]) =>
  `<kind>move</kind>\n<day>${day}</day>\n<headline>Stop on ${day}</headline>\n<scene>\nThe scene of ${day}.\n</scene>\n<options>\n- Go on :: Keep at it\n- Turn back :: Try the other way\n</options>\n<notes_patch>\n${notes.join("\n")}\n</notes_patch>`;

/** The people on a line's roster (the world's and its own), by name, with what each row says of them. */
const roster = (branchId: string | null) =>
  Object.fromEntries(
    db()
      .select()
      .from(entities)
      .where(and(eq(entities.worldId, W), branchId ? eq(entities.branchId, branchId) : isNull(entities.branchId)))
      .all()
      .map((e) => [e.name, e.summary]),
  );

let line = "";

test("the world's roster holds the people the protagonist knows of, as they know them; one known only on the hidden side is not on it", async () => {
  const now = new Date().toISOString();
  const setup = { world: { value: "A harbour town, 2026", source: "said" }, premises: [], role: { value: "Yourself", source: "said", kind: "self", name: null }, start: { value: "The day the boat is yours", source: "said", date: OPEN }, goal: null, filled: true };
  db().insert(worlds).values({ id: W, prompt: "run a ferry", title: "A ferry", language: "en-US", status: "building", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 5, error: null, engine: 12, createdAt: now, updatedAt: now }).run();
  db().insert(forecasts).values({ id: W, question: "run a ferry across the bay", clarify: [], asOf: OPEN, setup: setup as never, createdAt: now }).run();
  answer("narrate_world", () =>
    [
      "<situation>The boat is yours from today.</situation>",
      "<notes>",
      "- person | known | Lena | The harbour master; strict about timetables.",
      "- person | hidden | Lena | Owes the rival operator a favour.",
      "- person | hidden | Victor | The rival operator's money man; means to buy the pier.",
      "</notes>",
      "<milestones>\n- Does the ferry run a full season?\n</milestones>",
    ].join("\n"),
  );
  const job = await runJobNow(enqueue("build_world", { worldId: W }, W));
  assert.equal(job?.status, "done", job?.error ?? "");
  assert.deepEqual(Object.keys(roster(null)).sort(), ["Lena", "You"]);
  assert.equal(roster(null).Lena, "The harbour master; strict about timetables.", "what the protagonist knows of her, not her secret");
});

test("someone known only on the hidden side comes in once a line the protagonist knows of them is written, on that line, as they know them", async () => {
  answer("narrate_stop", () => stop(OPEN, ["- person | hidden | Zed | A smuggler who uses the night crossings."]));
  line = (await engine.startSession(W)).branchId;
  assert.deepEqual(roster(line), {}, "a hidden line alone brings nobody in");
  answer("narrate_stop", () => stop("2026-05-10", ["- person | known | Victor | A polite man in a grey coat who asked about the pier."]));
  const r = (await engine.submitAction(line, { kind: "option", id: "r1" })) as StepResult;
  assert.deepEqual(roster(line), { Victor: "A polite man in a grey coat who asked about the pier." });
  assert.deepEqual(r.settlement.newcomers, ["Victor"]);
  // what changes on someone's hidden side brings nobody new
  answer("narrate_stop", () => stop("2026-05-12", ["- person | hidden | Victor | Has bought the pier's lease through a cousin."]));
  const again = (await engine.submitAction(line, { kind: "option", id: "r1" })) as StepResult;
  assert.deepEqual(again.settlement.newcomers, []);
  assert.equal(roster(line).Victor, "A polite man in a grey coat who asked about the pier.");
});

test("each line writes its own newcomers: one who came in on the line after the fork comes in on the fork when they first appear there", async () => {
  answer("narrate_stop", () => stop("2026-05-20", ["- person | known | Nora | A deckhand looking for work."]));
  await engine.submitAction(line, { kind: "option", id: "r2" });
  assert.ok(roster(line).Nora);
  const fork = (await engine.forkBranch(line, 2, "free")).branchId;
  assert.deepEqual(Object.keys(roster(fork)), ["Victor"], "who came in by the fork's stop comes along; who came in after it does not");
  answer("narrate_stop", () => stop("2026-05-14", ["- person | known | Nora | A deckhand looking for work."]));
  const r = (await engine.submitAction(fork, { kind: "option", id: "r2" })) as StepResult;
  assert.deepEqual(r.settlement.newcomers, ["Nora"]);
  assert.deepEqual(Object.keys(roster(fork)).sort(), ["Nora", "Victor"]);
  assert.equal(Object.keys(roster(line)).filter((n) => n === "Nora").length, 1, "the line it came from keeps its own");
});

test("a stop that looked things up past its guard says so in words of its own", async () => {
  const { publicNotices, notice } = await import("../src/sim/notices.ts");
  const [said] = publicNotices([notice("rounds", "x")]);
  assert.ok(said && !said.includes("batch"), said);
  assert.notEqual(said, publicNotices([notice("runaway", "x")])[0]);
});
