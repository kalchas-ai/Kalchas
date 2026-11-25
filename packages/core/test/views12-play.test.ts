/**
 * The pages of an engine-12 play, offline: every view reads the notes (the known side only), the stops and the rolls
 * (only those the protagonist saw, where they are shown to them), never the tables of the engines before it; the
 * adviser is given the play as the protagonist knows it and passes changes on as instructions; the review, a matched
 * fork's comparison and a comparison of two lines read the story. Stand-ins write what the models would.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

const { db } = await import("../src/db/client.ts");
const { worlds, forecasts, decisions, judgments, entities, branches } = await import("../src/db/schema.ts");
const { eq, and } = await import("drizzle-orm");
const { standInForNarrate } = await import("../src/narrate/call.ts");
const { standInForSearch } = await import("../src/forecast/search.ts");
const { standInForGenerate } = await import("../src/llm/generate.ts");
const { standInForChat } = await import("../src/chat/agent.ts");
const { enqueue, runJobNow } = await import("../src/jobs/queue.ts");
const engine = await import("../src/sim/engine.ts");
const { noteInstruction } = await import("../src/narrate/play.ts");
const views = await import("../src/views.ts");
const { adviseBranch } = await import("../src/sim/advise.ts");
const { generateReport } = await import("../src/sim/report.ts");
const { compareBranches } = await import("../src/sim/compare.ts");
const { getBranch } = await import("../src/sim/world.ts");
const { REPORT } = await import("./fixture.ts");

type Use = (t: string, i: Record<string, unknown>) => Promise<unknown>;
const queue: Record<string, ((use: Use) => string | Promise<string>)[]> = {};
const answer = (purpose: string, fn: (use: Use) => string | Promise<string>) => (queue[purpose] ??= []).push(fn);
standInForNarrate(async (c, use) => {
  const next = queue[c.purpose]?.shift();
  if (!next) throw new Error(`nothing to answer ${c.purpose}`);
  return next(use);
});
standInForSearch((_ctx, query) => [{ url: `https://example.org/${encodeURIComponent(query)}`, title: `About ${query}`, content: `What the page says about ${query}.` }]);
/** What the generate stand-in was given last, by purpose. */
const given: Record<string, string> = {};
standInForGenerate((ctx, opts) => {
  given[ctx.purpose] = `${(opts as { system?: string }).system ?? ""}\n${(opts as { prompt?: string }).prompt ?? ""}`;
  if (ctx.purpose === "narrate_report") return { ...REPORT, title: "The review", blindSpots: [{ factId: "person | Claire Martin", whatYouMissed: "She meant to sell.", whenAvailable: "April", howToGet: "Ask the notary", consequence: "The lease" }] };
  if (ctx.purpose === "narrate_compare") return { title: "Two Junes", parted: { a: "kept at it", b: "changed course" }, differences: [{ about: "numbers", what: "Cash", a: "about 71,000", b: "about 60,000", cause: "decision", why: "stop 3" }], lesson: "Keep the cash." };
  throw new Error(`no stand-in for ${ctx.purpose}`);
});

/** What must never reach a page or the adviser while the play goes on. */
const HIDDEN = ["Would sell the building", "Plans to undercut you", "Is the inspector's cousin", "Does the landlord meet the chain"];
const clean = (what: string, x: unknown) => {
  const s = JSON.stringify(x);
  for (const h of HIDDEN) assert.ok(!s.includes(h), `${what} shows the hidden "${h}"`);
};

const WORLD_ID = "fc_views12";
const OPEN = "2026-04-06";

function stop(o: { day: string; headline: string; happened?: string[]; notes?: string[]; messages?: string[]; milestone?: string }): string {
  return [
    "<kind>move</kind>",
    `<day>${o.day}</day>`,
    `<passed>\n- ${o.day}: things went on\n</passed>`,
    `<headline>${o.headline}</headline>`,
    o.happened ? `<happened>\n${o.happened.join("\n")}\n</happened>` : "",
    `<scene>\nThe scene of ${o.day}. Claire Martin calls about the rent.\n</scene>`,
    `<messages>\n${(o.messages ?? []).join("\n")}\n</messages>`,
    "<options>\n- Go on :: Keep at it\n- Change course :: Try the other way\n</options>",
    `<notes_patch>\n${(o.notes ?? []).join("\n")}\n</notes_patch>`,
    o.milestone ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

let branchId = "";

test("an engine-12 world: its numbers, its people and what is known come from the known side of its notes", async () => {
  const now = new Date().toISOString();
  const setup = {
    world: { value: "Lyon, 2026", source: "said" },
    premises: [],
    role: { value: "A baker opening her first shop", source: "said", kind: "self", name: null },
    start: { value: "The day the bakery opens", source: "said", date: OPEN },
    goal: { value: "Break even within the year", source: "said" },
    filled: true,
    pace: { name: "Each real decision", step: "Every choice that changes where you stand" },
  };
  db().insert(worlds).values({ id: WORLD_ID, prompt: "open a bakery", title: "A bakery in Lyon", language: "en-US", status: "building", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 5, error: null, engine: 12, createdAt: now, updatedAt: now }).run();
  db().insert(forecasts).values({ id: WORLD_ID, question: "open a bakery in Lyon", clarify: [], asOf: OPEN, setup: setup as never, createdAt: now }).run();
  answer("narrate_world", async (use) => {
    await use("web_search", { query: "bakery rents Lyon" });
    return [
      "<situation>You have the keys.</situation>",
      "<notes>",
      "- person | known | Claire Martin | The landlord; wants the rent on the first of each month.",
      "- person | hidden | Claire Martin | Would sell the building to a chain for the right price.",
      "- person | known | Hugo | Your apprentice, 19, eager.",
      "- person | hidden | Marc | Plans to undercut you with a bakery next door.",
      "- force | known | Flour prices | Rising this spring, about 60% likely to go up again.",
      "- figure | known | Cash | about 80,000 euros",
      "- figure | known | Customers | a few dozen a day, maybe",
      "- road | known | late April | The oven inspection.",
      "- assumption | known | Hours | You can work six days a week.",
      "</notes>",
      "<milestones>\n- Does the bakery pass its inspection?\n</milestones>",
      "<found>\n- Rents near Croix-Rousse run 30 euros a square metre\n</found>",
    ].join("\n");
  });
  const job = await runJobNow(enqueue("build_world", { worldId: WORLD_ID }, WORLD_ID));
  assert.equal(job?.status, "done", job?.error ?? "");

  const w = views.worldView(WORLD_ID);
  clean("the world page", w);
  assert.deepEqual(w.metrics.map((m) => [m.key, m.unit]), [["Cash", "euros"]], "a figure in words stays words");
  assert.equal(w.counts.people, 2, "a person known only from the hidden side is not counted");
  assert.equal(w.counts.edges, 0);
  assert.ok(w.counts.facts >= 7);
  assert.equal(w.startPoints[0]!.metrics.Cash, 80000);
  const claire = w.graph.nodes.find((n) => n.name === "Claire Martin")!;
  assert.equal(claire.summary, "The landlord; wants the rent on the first of each month.");
  assert.equal(w.graph.nodes.find((n) => n.name === "Marc"), undefined, "someone known only from the hidden side is not shown");
  assert.ok(w.build!.stages.every((s) => s.state === "done"), "the stages are read from the build's log");
  const f = views.forecastView(WORLD_ID);
  assert.equal(f.lookups.length, 1);
  assert.deepEqual(f.lookups[0]!.searches, ["bakery rents Lyon"]);
  assert.equal(f.lookups[0]!.facts.length, 1);
});

test("the replay page of an engine-12 play: the stop, the numbers before and after it, the rolls the protagonist saw, who is in it, what is known; nothing hidden", async () => {
  answer("narrate_stop", async (use) => {
    await use("roll_dice", { question: "Does the flour come on time?", outcomes: [{ label: "on time", probability: 1 }], external: true, seen: true });
    return stop({ day: OPEN, headline: "Opening day" });
  });
  branchId = (await engine.startSession(WORLD_ID, 1)).branchId;
  const opened = views.playView(branchId);
  clean("the opening", opened);
  assert.equal(opened.situation!.headline, "Opening day");
  assert.equal(opened.lastStep, null);
  assert.deepEqual(opened.branch.metrics, { Cash: 80000 });
  assert.deepEqual(opened.situation!.blocks!.map((x) => x.title), ["Cash", "Customers", "Flour prices", "late April"], "how things stand, from the known side");

  answer("narrate_stop", async (use) => {
    await use("roll_dice", { question: "Does the landlord meet the chain?", outcomes: [{ label: "yes", probability: 1 }], external: false, seen: false });
    await use("roll_dice", { question: "Does the inspector come early?", outcomes: [{ label: "yes", probability: 1 }], external: true, seen: true, about: "Inspector Roux" });
    return stop({
      day: "2026-04-20",
      headline: "The inspector is here",
      happened: ["- 2026-04-19 | Claire Martin | Came by to look at the oven.", "- 2026-04-20 | Inspector Roux | Arrived a day early."],
      messages: ["- 2026-04-18 | Claire Martin | The rent is due on Friday."],
      notes: ["- person | known | Inspector Roux | Tough but fair.", "- person | hidden | Nadia | Is the inspector's cousin and will report you.", "- figure | known | Cash | about 71,000 euros"],
      milestone: "<milestone>\nquestion: 1\ncame: yes\nresult: Passed the inspection.\nturn: The oven passed.\nfigures: Days = 14\n</milestone>",
    });
  });
  await engine.submitAction(branchId, { kind: "option", id: "r1" });
  noteInstruction(branchId, "What I am after now: Open a second shop");
  const p = views.playView(branchId);
  clean("the replay page", p);
  assert.deepEqual([p.branch.step, p.branch.simTime, p.branch.ended], [2, "2026-04-20", null]);
  assert.deepEqual(p.decisions.map((d) => d.restatement), ["Go on. Keep at it", null]);
  assert.deepEqual(p.branch.metrics, { Cash: 71000 });
  assert.deepEqual(p.branch.startMetrics, { Cash: 80000 });
  assert.deepEqual(p.world.metrics.map((m) => [m.label, m.unit, m.description]), [["Cash", "euros", "about 71,000 euros"]]);
  const s = p.lastStep!.settlement!;
  assert.deepEqual(s.metrics, { before: { Cash: 80000 }, after: { Cash: 71000 } });
  assert.deepEqual(s.drawn.map((d) => d.title), ["Does the inspector come early? → yes"], "a roll out of their sight is not in the settlement");
  assert.deepEqual(s.newcomers, ["Inspector Roux"], "someone who came in on the hidden side alone came in out of sight");
  assert.ok(p.graph.nodes.some((n) => n.name === "Inspector Roux" && n.summary === "Tough but fair."));
  assert.equal(p.graph.nodes.find((n) => n.name === "Nadia"), undefined);
  assert.deepEqual(p.graph.edges, []);
  assert.ok(p.intel.every((i) => i.status === "known"));
  assert.ok(p.intel.some((i) => i.status === "known" && i.text === "Tough but fair." && i.lane === "Inspector Roux"));
  assert.ok(p.intel.some((i) => i.status === "known" && i.lane === "Looked up"));
  assert.ok(p.ledger.some((l) => l.owner === "Claire Martin" && l.active));
  assert.equal(p.goal!.text, "Break even within the year");
  assert.deepEqual(p.policy.map((x) => x.text), ["What I am after now: Open a second shop"], "what they said in the box stands in their words");
  assert.deepEqual([p.feed, p.upcoming, p.fog], [[], [], {}]);
  assert.equal(p.situation!.milestones![0]!.card.result, "Passed the inspection.");
  assert.deepEqual(p.situation!.happened!.map((x) => x.who), ["Claire Martin", "Inspector Roux"]);
  // the line's stops, oldest first, the one it stands at last: what each side did, what reached them, the rolls they saw
  assert.deepEqual(p.stops, [
    { step: 1, day: OPEN, headline: "Opening day", happened: [], messages: [], rolls: [{ question: "Does the flour come on time?", chosen: "on time", about: null }] },
    {
      step: 2,
      day: "2026-04-20",
      headline: "The inspector is here",
      happened: [
        { day: "2026-04-19", who: "Claire Martin", what: "Came by to look at the oven." },
        { day: "2026-04-20", who: "Inspector Roux", what: "Arrived a day early." },
      ],
      messages: [{ day: "2026-04-18", from: "Claire Martin", gist: "The rent is due on Friday." }],
      rolls: [{ question: "Does the inspector come early?", chosen: "yes", about: "Inspector Roux" }],
    },
  ]);

  const roux = db().select().from(entities).where(and(eq(entities.branchId, branchId), eq(entities.name, "Inspector Roux"))).get()!;
  const claire = db().select().from(entities).where(and(eq(entities.worldId, WORLD_ID), eq(entities.name, "Claire Martin"))).get()!;
  const pc = views.personView(branchId, claire.id);
  clean("a person's card", pc);
  assert.deepEqual(pc.known.map((k) => k.text), ["The landlord; wants the rent on the first of each month."]);
  assert.deepEqual(pc.lastSeen, { simTime: "2026-04-18", title: "The rent is due on Friday." });
  assert.equal(pc.fog, 0);
  assert.equal(views.personView(branchId, roux.id).summary, "Tough but fair.");
});

test("the chat box under an engine-12 play: it is given what the protagonist knows and lived, and passes a change on as an instruction", async () => {
  let context = "";
  standInForChat(async (c, use) => {
    context = c.context;
    await use("record_instruction", { text: "A second bakery opens across the street.", correction: false });
    await use("earlier_stops", { from: 1 });
    return "Noted: it goes into the story with your next move.";
  });
  try {
    const ask = await adviseBranch(branchId, "Suppose a second bakery opens across the street.");
    assert.equal(ask.a, "Noted: it goes into the story with your next move.");
    // one step for each tool it called, each said in words of its own, not by the tool's name
    const labels = ask.steps!.map((x) => x.label);
    assert.deepEqual(labels, ["Noting what you want changed", "Looking back at earlier stops"]);
  } finally {
    standInForChat(null);
  }
  for (const part of ["[What the person typed]\nopen a bakery in Lyon", "person | known | Claire Martin | The landlord", "figure | known | Cash | about 71,000 euros", "[Stop 1, 2026-04-06 (Monday)] Opening day", "What they did: Go on. Keep at it", "Does the flour come on time? → on time", "[The moment right now] The inspector is here", "Claire Martin: The rent is due on Friday.", "What I am after now: Open a second shop"])
    assert.ok(context.includes(part), part);
  for (const h of HIDDEN) assert.ok(!context.includes(h), `the chat box is given the hidden "${h}"`);
  const story = getBranch(branchId).state.story!;
  assert.deepEqual(story.instructions!.filter((x) => x.step == null).map((x) => x.text), ["What I am after now: Open a second shop", "A second bakery opens across the street."]);
  const dec = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, 2))).get()!;
  assert.equal((dec.asks as unknown[]).length, 1);
});

test("the review of an engine-12 play is written from its story; its blind spots read the hidden lines they rest on once it is reviewed", async () => {
  const r = await generateReport(branchId, "manual");
  assert.ok(given.narrate_report!.includes("Would sell the building"), "the review reads both sides");
  const v = views.reportView(r.id);
  assert.deepEqual(v.facts["person | Claire Martin"], { date: OPEN, text: "Claire Martin: Would sell the building to a chain for the right price.", published: null });
  assert.deepEqual(v.metrics.map((m) => m.key), ["Cash"]);
  assert.deepEqual(v.curve.map((c) => c.metrics.Cash), [80000, 71000]);
  assert.deepEqual(v.decisions.map((d) => d.step), [1, 2]);
  assert.equal(v.comparison, null);
});

test("a matched fork set beside its line: the choices, the figures on a day both reached, the outside rolls it met again; two lines compared from what the protagonist lived", async () => {
  answer("narrate_stop", async (use) => {
    await use("roll_dice", { question: "Does the heatwave hit in June?", outcomes: [{ label: "yes", probability: 1 }], external: true, seen: true });
    return stop({ day: "2026-06-01", headline: "June", notes: ["- figure | known | Cash | about 60,000 euros"] });
  });
  await engine.submitAction(branchId, { kind: "option", id: "r2" });
  const fork = await engine.forkBranch(branchId, 2, "matched");
  assert.equal(getBranch(fork.branchId).state.comparison!.parentSeq, 3, "the stop the original had reached");
  answer("narrate_stop", async (use) => {
    await use("roll_dice", { question: "Heatwave in June?", outcomes: [{ label: "no", probability: 1 }], external: true, seen: true, same_as: "x1" });
    return stop({ day: "2026-05-20", headline: "May", notes: ["- figure | known | Cash | about 66,000 euros"] });
  });
  await engine.submitAction(fork.branchId, { kind: "option", id: "r1" });
  // the rolls a fork took over with the story up to its stop are its own, beside those it made since
  const fp = views.playView(fork.branchId);
  clean("a fork's page", fp);
  assert.deepEqual(fp.stops!.map((x) => [x.step, x.rolls.map((y) => y.question)]), [[1, ["Does the flour come on time?"]], [2, ["Does the inspector come early?"]], [3, ["Heatwave in June?"]]]);
  const c = views.comparisonAt(fork.branchId, "2026-12-31")!;
  assert.deepEqual([c.step, c.from, c.until, c.date], [2, "2026-04-20", "2026-06-01", "2026-05-20"]);
  assert.equal(c.originalChoice, "Change course. Try the other way");
  assert.equal(c.newChoice, "Go on. Keep at it");
  assert.deepEqual([c.original, c.current], [{ Cash: 71000 }, { Cash: 66000 }], "each line's figures as its notes held them on that day");
  assert.deepEqual(c.signals, [{ date: "2026-04-20", title: "Heatwave in June? → yes" }], "the outside roll met again, as it came out on the original");
  assert.deepEqual(c.originalJournal, []);

  const out = await compareBranches(fork.branchId, branchId);
  assert.equal(out.data.parted.step, 2);
  assert.equal(out.data.day, "2026-05-20");
  assert.equal(out.data.lesson, "Keep the cash.");
  for (const h of HIDDEN.slice(0, 3)) assert.ok(!given.narrate_compare!.includes(h), `the comparison is given the hidden "${h}"`);
  assert.ok(given.narrate_compare!.includes("about 66,000 euros"));
  assert.ok(given.narrate_compare!.includes("Heatwave in June? → yes"));
  const again = await compareBranches(fork.branchId, branchId);
  assert.equal(again.id, out.id, "kept while neither line has moved");
  assert.equal(db().select().from(branches).all().length, 2);
  assert.ok(db().select().from(judgments).where(eq(judgments.branchId, fork.branchId)).all().length >= 1);
});
