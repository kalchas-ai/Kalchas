/**
 * Engine 12 end to end, offline: one conversation from the world's setting up to the end. The world set up by the
 * play's first call, a play opened, moves made, a question asked, the chat box's instructions, the story folded near
 * the context window, free and matched forks, the end. A stand-in writes what the model would, and reads what it is
 * given: every call opens with the same messages as the one before, the setting up first, each stop's whole exchange
 * (what it looked up and rolled included) after it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

const { db } = await import("../src/db/client.ts");
const { worlds, forecasts, decisions, judgments, entities, branches, llmCalls, startPoints, reports, sources, searches } = await import("../src/db/schema.ts");
const { eq, and, asc } = await import("drizzle-orm");
const { standInForNarrate } = await import("../src/narrate/call.ts");
const { SYSTEM, SETTING_UP } = await import("../src/narrate/rules.ts");
const { standInForSearch } = await import("../src/forecast/search.ts");
const { standInForGenerate } = await import("../src/llm/generate.ts");
const { enqueue, runJobNow } = await import("../src/jobs/queue.ts");
const { setConfig, config } = await import("../src/config.ts");
const engine = await import("../src/sim/engine.ts");
const { noteInstruction } = await import("../src/narrate/play.ts");
const { endOf } = await import("../src/sim/relations.ts");
const { getBranch } = await import("../src/sim/world.ts");
const { REPORT } = await import("./fixture.ts");

type Msg = { role: string; content: unknown };
type Seen = { purpose: string; system: string; messages: Msg[] };
const calls: Seen[] = [];
/** What the stand-in writes next, by purpose: each answer is used once, in order. */
const queue: Record<string, ((c: Seen, use: (t: string, i: Record<string, unknown>) => Promise<unknown>) => string | Promise<string>)[]> = {};
const answer = (purpose: string, fn: (c: Seen, use: (t: string, i: Record<string, unknown>) => Promise<unknown>) => string | Promise<string>) => (queue[purpose] ??= []).push(fn);
standInForNarrate(async (c, use) => {
  const seen = { purpose: c.purpose, system: c.system, messages: structuredClone(c.messages) as Msg[] };
  calls.push(seen);
  const next = queue[c.purpose]?.shift();
  if (!next) throw new Error(`nothing to answer ${c.purpose}`);
  return next(seen, use);
});
standInForSearch((_ctx, query) => [{ url: `https://example.org/${encodeURIComponent(query)}`, title: `About ${query}`, content: `What the page says about ${query}.` }]);
standInForGenerate((ctx) => {
  if (ctx.purpose === "narrate_report") return { ...REPORT, title: "The review", decisions: [{ step: 1, assessment: "sound", category: "sound_decision", lesson: "x" }, { step: 99, assessment: "no such stop", category: "luck", lesson: "y" }] };
  throw new Error(`no stand-in for ${ctx.purpose}`);
});

const text = (m: Msg | undefined) => (typeof m?.content === "string" ? m.content : JSON.stringify(m?.content));
const last = (c: Seen) => text(c.messages[c.messages.length - 1]);
/** The messages a call was given, as JSON, to compare one call's opening with another's. */
const json = (ms: Msg[]) => ms.map((m) => JSON.stringify(m));

const WORLD_ID = "fc_bakery";
const OPEN = "2026-04-06";

/** A stop as the model writes it: spread what the test is about over it. */
function stop(o: { day: string; headline?: string; happened?: string[]; scene?: string; options?: string[]; notes?: string[]; milestone?: string; ended?: string }): string {
  return [
    "<kind>move</kind>",
    `<day>${o.day}</day>`,
    `<headline>${o.headline ?? `Stop on ${o.day}`}</headline>`,
    o.happened ? `<happened>\n${o.happened.join("\n")}\n</happened>` : "",
    o.scene === "" ? "" : `<scene>\n${o.scene ?? `The scene of ${o.day}.`}\n</scene>`,
    "<messages>\n</messages>",
    `<options>\n${(o.options ?? ["Go on :: Keep at it", "Change course :: Try the other way"]).map((x) => `- ${x}`).join("\n")}\n</options>`,
    `<notes_patch>\n${(o.notes ?? []).join("\n")}\n</notes_patch>`,
    o.milestone ?? "",
    o.ended ? `<ended>${o.ended}</ended>` : "",
    `<undercurrents>What each side weighs on ${o.day}.</undercurrents>`,
  ]
    .filter(Boolean)
    .join("\n");
}

let setUp: Msg[] = [];
/** How the line's first roll came out. */
const rolledFirst = () => db().select().from(judgments).orderBy(asc(judgments.createdAt)).get()!.chosen;

test("the world is set up by the play's first call, under the play's own instructions and tools: its whole exchange kept, its notes read into lines, what the pages read written beside them", async () => {
  const now = new Date().toISOString();
  const setup = {
    world: { value: "Lyon, 2026", source: "said" },
    premises: [],
    role: { value: "Yourself", source: "said", kind: "self", name: null },
    start: { value: "The day the bakery opens", source: "said", date: OPEN },
    goal: null,
    filled: true,
    pace: { name: "Each real decision", step: "Every choice that changes where you stand" },
    paceAsk: { q: "How closely?", options: [], ends: "the first year has passed" },
  };
  db().insert(worlds).values({ id: WORLD_ID, prompt: "open a bakery", title: "A bakery in Lyon", language: "en-US", status: "building", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 5, error: null, engine: 12, createdAt: now, updatedAt: now }).run();
  db().insert(forecasts).values({ id: WORLD_ID, question: "open a bakery in Lyon", clarify: [{ q: "How much money is set aside?", why: "", options: [], answer: "80000", kind: "number", unit: "euros" }], asOf: OPEN, setup: setup as never, createdAt: now }).run();
  answer("narrate_world", async (c, use) => {
    assert.ok(c.system.startsWith(SYSTEM), "one system prompt for the whole play");
    assert.equal(c.messages.length, 1);
    const ask = text(c.messages[0]);
    assert.ok(ask.includes("[What the person typed]\nopen a bakery in Lyon"));
    assert.ok(ask.includes("How much money is set aside?: 80000 (unit: euros)"));
    assert.ok(!ask.includes("[How closely they watch"), "the pace is given with the opening, once chosen");
    assert.ok(ask.endsWith(SETTING_UP));
    await use("web_search", { query: "bakery rents Lyon" });
    // (no dice while the world is set up)
    assert.match(JSON.stringify(await use("roll_dice", { question: "x", outcomes: [{ label: "a", probability: 1 }], external: true, seen: true })), /nothing is rolled/);
    return [
      "<situation>You have the keys; the oven is not yet certified.</situation>",
      "<notes>",
      "- person | known | Claire Martin | The landlord; wants the rent on the first of each month.",
      "- person | hidden | Claire Martin | Would sell the building to a chain for the right price.",
      "- person | known | Hugo | Your apprentice, 19, eager.",
      "- force | known | Flour prices | Rising this spring, about 60% likely to go up again.",
      "- figure | known | Cash | about 80,000 euros",
      "- road | known | late April | The oven inspection.",
      "- assumption | known | Hours | You can work six days a week.",
      "</notes>",
      "<milestones>\n- Does the bakery pass its inspection?\n- Does it break even within the year?\n</milestones>",
      "<found>\n- Rents near Croix-Rousse run 30 euros a square metre (example.org)\n</found>",
    ].join("\n");
  });
  const job = await runJobNow(enqueue("build_world", { worldId: WORLD_ID }, WORLD_ID));
  assert.equal(job?.status, "done", job?.error ?? "");
  const w = db().select().from(worlds).where(eq(worlds.id, WORLD_ID)).get()!;
  assert.equal(w.status, "ready");
  assert.equal(w.notes!.entries.length, 7);
  assert.deepEqual(w.notes!.milestones, ["Does the bakery pass its inspection?", "Does it break even within the year?"]);
  assert.deepEqual(w.notes!.found, ["Rents near Croix-Rousse run 30 euros a square metre (example.org)"]);
  setUp = w.notes!.exchange as Msg[];
  // the request, then each tool called with what it gave back, then what was written
  assert.deepEqual(setUp.map((m) => m.role), ["user", "assistant", "tool", "assistant", "tool", "assistant"]);
  assert.ok(text(setUp[2]).includes("What the page says about bakery rents Lyon"), "a tool's result is kept as it was given");
  assert.ok(text(setUp[5]).includes("- person | hidden | Claire Martin"));
  assert.equal((w.scope as { title: string }).title, "A bakery in Lyon");
  assert.deepEqual(db().select().from(entities).where(eq(entities.worldId, WORLD_ID)).all().map((e) => e.name).sort(), ["Claire Martin", "Hugo", "You"]);
  assert.equal(db().select().from(startPoints).where(eq(startPoints.worldId, WORLD_ID)).all().length, 1);
  assert.equal(db().select().from(sources).where(eq(sources.worldId, WORLD_ID)).all().length, 1);
  assert.equal(db().select().from(searches).where(eq(searches.projectId, WORLD_ID)).all().length, 1);
});

let branchId = "";
/** What the call for stop 2 of the first line was given: the prefix every later call of the line, and of a fork from stop 2 or after, shares. */
let stop2Call: Seen | null = null;

test("the play opens after the setting up, in the same conversation: one stop, its scene shown as written, its rolls kept in its exchange, the closing round kept as the moment", async () => {
  answer("narrate_stop", async (c, use) => {
    assert.equal(c.system, calls.find((x) => x.purpose === "narrate_world")!.system, "the same instructions as the setting up");
    assert.deepEqual(json(c.messages.slice(0, setUp.length)), json(setUp), "the setting up, whole, as it happened");
    assert.equal(c.messages.length, setUp.length + 1);
    const begin = last(c);
    assert.ok(begin.startsWith("[2026-04-06 (Monday)] The play opens today"));
    assert.ok(begin.includes("[How closely they watch: the pace]\nEach real decision: Every choice that changes where you stand"));
    assert.ok(begin.includes("1. Does the bakery pass its inspection?\n2. Does it break even within the year?"));
    assert.ok(begin.endsWith("Write the opening stop."));
    const r = (await use("roll_dice", { question: "Does the flour delivery come on time?", outcomes: [{ label: "on time", probability: 70 }, { label: "late", probability: 30 }], external: true, seen: true, about: "Hugo" })) as { outcome: string };
    return stop({ day: OPEN, headline: "Opening day", happened: ["- 2026-04-06 | Hugo | Unloaded the flour before dawn."], scene: `The delivery came ${r.outcome}.`, notes: ["- person | known | Hugo | Your apprentice; already late twice."] });
  });
  const shown: string[] = [];
  const lives: import("../src/sim/schemas.ts").StopLive[] = [];
  const r = await engine.startSession(WORLD_ID, 1, (_m, scene, _s, live) => (scene !== undefined && shown.push(scene), live && lives.push(live)));
  branchId = r.branchId;
  assert.equal(r.situation.headline, "Opening day");
  assert.deepEqual(r.situation.passed, []);
  assert.deepEqual(r.situation.recommendations.map((x) => x.id), ["r1", "r2"]);
  assert.ok(shown.some((s) => s.startsWith("The delivery came")));
  // beside the scene, as they come: the roll they can see once it is rolled, then what each side did
  assert.deepEqual(lives[0], { happened: [], rolls: [{ question: "Does the flour delivery come on time?", chosen: rolledFirst(), about: "Hugo" }] });
  assert.deepEqual(lives[lives.length - 1]!.happened, [{ day: OPEN, who: "Hugo", what: "Unloaded the flour before dawn." }]);
  assert.deepEqual(r.situation.happened, [{ day: OPEN, who: "Hugo", what: "Unloaded the flour before dawn." }]);
  const b = getBranch(branchId);
  assert.deepEqual([b.state.engine, b.step, b.status, b.state.externalHistoryFrom], [12, 1, "awaiting_decision", OPEN]);
  assert.equal(b.state.milestones!.length, 2);
  assert.equal(b.state.story!.notes.find((e) => e.name === "Hugo")!.text, "Your apprentice; already late twice.");
  const dec = db().select().from(decisions).where(eq(decisions.branchId, branchId)).get()!;
  assert.ok(dec.story!.startsWith("<kind>move</kind>") && dec.story!.includes("<undercurrents>"), "what the model wrote, as it wrote it");
  assert.ok(!dec.story!.includes("<dice>"), "nothing written in by the program");
  assert.deepEqual((dec.exchange as Msg[]).map((m) => m.role), ["assistant", "tool", "assistant"]);
  assert.ok(text((dec.exchange as Msg[])[1]).includes('"outcome"'), "the roll as the dice gave it back");
  const rolled = db().select().from(judgments).where(eq(judgments.branchId, branchId)).all();
  assert.deepEqual([rolled.length, rolled[0]!.external, rolled[0]!.seen, rolled[0]!.step, rolled[0]!.about], [1, true, true, 1, "Hugo"]);
  assert.deepEqual(rolled[0]!.options.map((o) => o.probability), [0.7, 0.3]);
  assert.equal(db().select().from(llmCalls).where(and(eq(llmCalls.branchId, branchId), eq(llmCalls.purpose, "moment"))).all().length, 1);
});

test("a move: given with its day and weekday after the whole play as it happened; the stop kept, the move kept on the stop it was made at, the notes merged, a newcomer on the roster, two milestones settled, each with its own card", async () => {
  answer("narrate_stop", async (c) => {
    stop2Call = c;
    const kept = db().select().from(decisions).where(eq(decisions.branchId, branchId)).get()!;
    const opening = calls.filter((x) => x.purpose === "narrate_stop")[0]!;
    assert.deepEqual(json(c.messages.slice(0, opening.messages.length)), json(opening.messages), "the call before, word for word");
    assert.deepEqual(json(c.messages.slice(opening.messages.length, -1)), json(kept.exchange as Msg[]), "the opening stop's whole exchange");
    assert.ok(last(c).startsWith("[2026-04-06 (Monday)]"));
    assert.ok(last(c).includes("The person chose: Go on: Keep at it"));
    return stop({
      day: "2026-04-20",
      headline: "The inspector is here",
      notes: ["- person | known | Inspector Roux | Tough but fair.", "- figure | known | Cash | about 71,000 euros"],
      milestone:
        "<milestone>\nquestion: 1\ncame: yes\nresult: Passed the inspection.\nturn: The oven passed.\nfigures: Days = 14\n</milestone>\n" +
        "<milestone>\nquestion: 2\ncame: no\nresult: Did not break even this year.\nturn: The repairs ate the margin.\nfigures: Loss = 9,000 euros\n</milestone>",
    });
  });
  const r = (await engine.submitAction(branchId, { kind: "option", id: "r1" })) as import("../src/sim/engine.ts").StepResult;
  assert.equal(r.situation!.headline, "The inspector is here");
  assert.equal(r.restatement, "Go on. Keep at it");
  // (two settled in one stop: a card each, never one card for both)
  assert.deepEqual(
    r.situation!.milestones!.map((m) => [m.question, m.came, m.card.result]),
    [
      ["Does the bakery pass its inspection?", true, "Passed the inspection."],
      ["Does it break even within the year?", false, "Did not break even this year."],
    ],
  );
  assert.equal(r.settlement.to, "2026-04-20");
  const b = getBranch(branchId);
  assert.deepEqual([b.step, b.simTime], [2, "2026-04-20"]);
  assert.ok(b.state.milestones![0]!.reached?.came);
  const rows = db().select().from(decisions).where(eq(decisions.branchId, branchId)).orderBy(asc(decisions.step)).all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.restatement, "Go on. Keep at it");
  assert.ok((rows[0]!.chosen as { settlement?: unknown }).settlement);
  assert.ok(rows[0]!.move!.startsWith("[2026-04-06 (Monday)]"));
  assert.equal(b.state.story!.notes.find((e) => e.kind === "figure")!.text, "about 71,000 euros");
  assert.ok(db().select().from(entities).where(and(eq(entities.branchId, branchId), eq(entities.name, "Inspector Roux"))).get());
});

test("something only asked is answered where the story stands: kept with the stop, nothing moves, the answer kept as advice", async () => {
  answer("narrate_stop", () => "<kind>question</kind>\n<answer>About two weeks, usually.</answer>");
  const before = getBranch(branchId);
  const r = (await engine.submitAction(branchId, { kind: "command", text: "How long does a reinspection take?" })) as { question: { a: string; redirected?: boolean } };
  assert.equal(r.question.a, "About two weeks, usually.");
  assert.equal(r.question.redirected, true);
  const b = getBranch(branchId);
  assert.deepEqual([b.step, b.simTime, b.status], [before.step, before.simTime, "awaiting_decision"]);
  const dec = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, 2))).get()!;
  assert.equal((dec.asks as unknown[]).length, 1);
  assert.equal(dec.move, null);
  assert.ok(db().select().from(llmCalls).where(and(eq(llmCalls.branchId, branchId), eq(llmCalls.purpose, "advise"))).get());
  // asked beside the story: the same play, the same tools, and the question at the end
  answer("narrate_answer", (c) => {
    assert.deepEqual(json(c.messages.slice(0, stop2Call!.messages.length)), json(stop2Call!.messages), "the play as the stop before was given it, and the stop after it");
    assert.ok(last(c).includes("The person only asks, beside the story"));
    return "<kind>question</kind><answer>Flour is up 4% this month.</answer>";
  });
  const ask = await engine.askQuestion(branchId, "What is flour doing?");
  assert.equal(ask.a, "Flour is up 4% this month.");
  assert.equal((db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, 2))).get()!.asks as unknown[]).length, 2);
  assert.equal(getBranch(branchId).step, 2);
});

test("a stop with no scene, or no ways while the story goes on, is asked for once more, both answers kept, what the first showed cleared; a day that goes back is kept where it was; what the person said in the box goes with the next move", async () => {
  noteInstruction(branchId, "A second bakery opens across the street.");
  answer("narrate_stop", async (c, use) => {
    assert.ok(last(c).includes("[What the person said in the box beside the story since the last stop"));
    assert.ok(last(c).includes("- 2026-04-20: A second bakery opens across the street."));
    await use("roll_dice", { question: "Does the rival undercut on bread?", outcomes: [{ label: "yes", probability: 1 }], external: true, seen: true, about: "none" });
    await use("roll_dice", { question: "Does the landlord call the chain?", outcomes: [{ label: "yes", probability: 1 }], external: false, seen: false, about: "Claire Martin" });
    return stop({ day: "2026-05-01", happened: ["- 2026-04-30 | Hugo | Baked the first rye."], options: [] });
  });
  answer("narrate_stop", (c) => {
    assert.ok(last(c).includes("Your answer lacked the <options>"));
    assert.ok(text(c.messages[c.messages.length - 2]).includes("<undercurrents>"), "the first answer stays in the conversation");
    return stop({ day: "2026-04-01", headline: "The rival opens", happened: ["- 2026-04-20 | The rival | Opened across the street."] });
  });
  const lines: string[] = [];
  const lives: import("../src/sim/schemas.ts").StopLive[] = [];
  const r = (await engine.submitAction(branchId, { kind: "carry_on" }, (m, _scene, _s, live) => (lines.push(m), live && lives.push(live)))) as import("../src/sim/engine.ts").StepResult;
  assert.equal(r.situation!.headline, "The rival opens");
  assert.equal(r.situation!.day, "2026-04-20", "the day does not go back");
  // a roll out of the protagonist's sight is never named to them, nor shown beside the scene
  assert.ok(lines.includes("Rolling: Does the rival undercut on bread?"));
  assert.ok(lines.includes("Rolling…"));
  for (const x of [...lines, JSON.stringify(lives)]) assert.ok(!x.includes("landlord call the chain"), x);
  const seen = { question: "Does the rival undercut on bread?", chosen: "yes", about: null };
  const cleared = lives.findIndex((x) => !x.happened.length && !x.rolls.length);
  assert.ok(cleared > 0, "what the first answer showed is cleared when the stop is asked for again");
  assert.deepEqual(lives[cleared - 1], { happened: [{ day: "2026-04-30", who: "Hugo", what: "Baked the first rye." }], rolls: [seen] });
  assert.deepEqual(lives[lives.length - 1], { happened: [{ day: "2026-04-20", who: "The rival", what: "Opened across the street." }], rolls: [seen] }, "the rolls made stand");
  assert.ok(r.warnings.length);
  const b = getBranch(branchId);
  assert.equal(b.step, 3);
  assert.equal(b.state.story!.instructions![0]!.step, 2);
  const kept = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, 3))).get()!;
  assert.deepEqual((kept.exchange as Msg[]).map((m) => m.role), ["assistant", "tool", "assistant", "tool", "assistant", "user", "assistant"]);
  assert.ok(text((kept.exchange as Msg[])[5]).includes("- Does the rival undercut on bread? → yes"), "asked again, told what was rolled already");
  const moved = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, 2))).get()!;
  assert.ok(moved.restatement!.includes("You did not choose yourself"));
  assert.equal(db().select().from(llmCalls).where(and(eq(llmCalls.branchId, branchId), eq(llmCalls.purpose, "moment"))).all().length, 3, "one moment a stop");
});

test("a play is folded only near the model's context window: the earlier stops, with the setting up, become the story so far, which opens the next call in their place", async () => {
  const was = config().narrate;
  try {
    // far from the window: nothing is folded
    setConfig({ narrate: { ...was, keep: 1, windows: {}, defaultWindow: 10_000_000 } });
    answer("narrate_stop", () => stop({ day: "2026-05-02", headline: "Still whole" }));
    await engine.submitAction(branchId, { kind: "option", id: "r1" });
    assert.equal(getBranch(branchId).state.story!.folds, undefined);
    // near it: all stops but the last are folded
    setConfig({ narrate: { ...was, keep: 1, windows: {}, defaultWindow: 100 } });
    answer("narrate_compress", (c) => {
      assert.ok(text(c.messages[0]).startsWith("[The world's setting up]\n<situation>"));
      assert.ok(text(c.messages[0]).includes("[Stop, 2026-04-06]"));
      return "Story so far: the bakery opened, passed its inspection, and a rival came.";
    });
    answer("narrate_stop", (c) => {
      const first = text(c.messages[0]);
      assert.ok(first.includes("[The story so far, up to the stop of 2026-04-20 (Monday)]\nStory so far: the bakery opened"));
      assert.ok(first.includes("(settled 2026-04-20: it came about)"));
      assert.ok(first.endsWith(db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, 3))).get()!.move!));
      // only the last stop follows it, whole, then the move
      assert.equal(c.messages.length, 3);
      return stop({ day: "2026-05-10", headline: "Summer comes" });
    });
    await engine.submitAction(branchId, { kind: "option", id: "r2" });
    const folds = getBranch(branchId).state.story!.folds!;
    assert.deepEqual(folds.map((f) => f.upTo), [3]);
  } finally {
    setConfig({ narrate: was });
  }
});

test("a free fork takes the story up to its stop and goes on from there; a matched fork meets the rolls outside the protagonist's reach again", async () => {
  // on the line itself, something outside their reach is rolled at stop 6
  answer("narrate_stop", async (_c, use) => {
    await use("roll_dice", { question: "Does the heatwave hit in June?", outcomes: [{ label: "yes", probability: 0.5 }, { label: "no", probability: 0.5 }], external: true, seen: true });
    return stop({ day: "2026-06-01", headline: "June" });
  });
  await engine.submitAction(branchId, { kind: "option", id: "r1" });
  const original = db().select().from(judgments).where(and(eq(judgments.branchId, branchId), eq(judgments.step, 6))).get()!;

  const free = await engine.forkBranch(branchId, 2, "free");
  const fb = getBranch(free.branchId);
  assert.deepEqual([fb.step, fb.simTime, fb.status, fb.state.engine], [2, "2026-04-20", "awaiting_decision", 12]);
  assert.equal(fb.state.story!.folds!.length, 0, "a fold that reaches past the fork's stop is not taken");
  assert.equal(db().select().from(decisions).where(eq(decisions.branchId, free.branchId)).all().length, 2);
  assert.equal(db().select().from(decisions).where(and(eq(decisions.branchId, free.branchId), eq(decisions.step, 2))).get()!.move, null);
  assert.equal(db().select().from(judgments).where(eq(judgments.branchId, free.branchId)).all().length, 1, "the opening's roll comes along");
  assert.equal(fb.state.story!.instructions!.filter((x) => x.step == null).length, 1, "what was said at stop 2 is said again with the move made there");
  answer("narrate_stop", (c) => {
    assert.deepEqual(json(c.messages.slice(0, stop2Call!.messages.length)), json(stop2Call!.messages), "the same play up to the fork's stop: read from the cache");
    assert.equal(c.messages.length, stop2Call!.messages.length + 2, "then stop 2 as it happened, and the new move");
    return stop({ day: "2026-04-25", headline: "Another way" });
  });
  await engine.submitAction(free.branchId, { kind: "option", id: "r2" });
  assert.equal(getBranch(branchId).step, 6, "the line it came from is as it was");

  const matched = await engine.forkBranch(branchId, 3, "matched");
  const mb = getBranch(matched.branchId);
  assert.equal(mb.state.comparison!.parentId, branchId);
  assert.deepEqual(mb.state.story!.carried!.map((x) => [x.question, x.chosen]), [["Does the heatwave hit in June?", original.chosen]]);
  answer("narrate_stop", async (c, use) => {
    assert.ok(last(c).includes("- x1 | 2026-05-10 | Does the heatwave hit in June? →"), last(c));
    const r = (await use("roll_dice", { question: "Heatwave in June?", outcomes: [{ label: "yes", probability: 0.1 }, { label: "no", probability: 0.9 }], external: true, seen: true, same_as: "x1" })) as { outcome: string };
    assert.equal(r.outcome, original.chosen);
    return stop({ day: "2026-06-02", headline: "The same June" });
  });
  await engine.submitAction(matched.branchId, { kind: "option", id: "r1" });
  assert.equal(getBranch(matched.branchId).state.story!.carried, undefined, "given once");
});

test("the story ends only when it cannot go on: the line is over, the review is written from the whole story", async () => {
  answer("narrate_stop", () => stop({ day: "2026-07-01", headline: "The end", options: [], ended: "The bakery burned down and the insurance will not pay." }));
  const r = (await engine.submitAction(branchId, { kind: "option", id: "r2" })) as import("../src/sim/engine.ts").StepResult;
  assert.ok(r.ended);
  assert.equal(r.reports.length, 1);
  const b = getBranch(branchId);
  assert.equal(b.status, "ended");
  assert.equal(endOf(b.state)!.reason, "The bakery burned down and the insurance will not pay.");
  const rep = db().select().from(reports).where(eq(reports.branchId, branchId)).get()!;
  assert.deepEqual((rep.data as { decisions: { step: number }[] }).decisions.map((d) => d.step), [1], "a stop the play does not have is left out");
  // a move on a play that has ended is refused, and the line is left as it stood
  const ended = getBranch(branchId);
  await assert.rejects(engine.submitAction(branchId, { kind: "carry_on" }), /This play has already ended/);
  assert.deepEqual(getBranch(branchId), ended);
  assert.equal(db().select().from(branches).all().length, 3);
});
