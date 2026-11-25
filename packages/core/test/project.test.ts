import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

/**
 * A project before its world is built: what was said understood and asked about, the questions kept in order, how
 * closely they want to watch asked once the answers are in, and the answers given to the prompts as they were asked.
 */

const { db } = await import("../src/db/client.ts");
const { forecasts, worlds } = await import("../src/db/schema.ts");
const { eq } = await import("drizzle-orm");
const { standInForGenerate } = await import("../src/llm/generate.ts");

type Call = { purpose: string; system: string; prompt: string };

/** Answers each call by what it is for; a call nobody answers fails the test. Returns the calls made, in order. */
function standIn(answers: Record<string, (call: Call) => unknown>): Call[] {
  const calls: Call[] = [];
  standInForGenerate((c, o) => {
    const call = { purpose: c.purpose, system: o.system, prompt: o.prompt };
    calls.push(call);
    const answer = answers[c.purpose];
    if (!answer) throw new Error(`unexpected call: ${c.purpose}`);
    return answer(call);
  });
  return calls;
}

afterEach(() => standInForGenerate(null));

test("the setup opens on the day the matter itself begins: a day read after today stands, one read before today is today when they said it lies ahead", async () => {
  const { clarifyForecast } = await import("../src/forecast/engine.ts");
  const { SetupSchema } = await import("../src/world/setup.ts");
  assert.match(SetupSchema.shape.start.shape.date.description ?? "", /the day the matter they named itself begins\. What they said they would do to get there \(go there, leave their post, take up the new one, land\) is done by then/);
  const now = new Date().toISOString();
  const ahead = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const slot = { value: "San Francisco Bay Area, 2026", source: "said", random: false };
  const reading = (date: string) => ({
    setup: { world: slot, premises: [], role: { ...slot, value: "Myself", kind: "self", name: null }, start: { ...slot, value: "Just arrived there and starting on it", date }, goal: null },
    insight: { language: "en", said: "Open a shop in another city", premises: [], understood: "You want to open a shop in another city" },
    decision: "Open a shop in another city",
    basis: [],
    uses: [],
    questions: [{ about: "situation", q: "How far along is it?", why: "It changes the course", kind: "one", unit: null, options: ["Not started yet", "Already under way"], follow: [] }],
  });
  for (const [id, read, want] of [["w_begin_ahead", ahead, ahead], ["w_begin_before", "2020-01-01", now.slice(0, 10)]] as const) {
    db().insert(worlds).values({ id, prompt: "Open a shop in another city", title: null, status: "clarifying", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 5, error: null, createdAt: now, updatedAt: now }).run();
    db().insert(forecasts).values({ id, question: "Open a shop in another city", clarify: [], asOf: now.slice(0, 10), createdAt: now }).run();
    standIn({ clarify: () => reading(read) });
    await clarifyForecast(id, undefined, "today");
    const f = db().select().from(forecasts).where(eq(forecasts.id, id)).get()!;
    assert.equal(f.setup!.start.date, want, id);
    assert.equal(f.asOf, want, id);
  }
  // a start ahead is marked as one: its surroundings are projected
  assert.ok(db().select().from(forecasts).where(eq(forecasts.id, "w_begin_ahead")).get()!.setup!.start.note);
});

test("the questions are kept in the order the model wrote them, each follow-up under its question; how closely they watch is asked once the answers are in", async () => {
  const { clarifyForecast } = await import("../src/forecast/engine.ts");
  const now = new Date().toISOString();
  db().insert(worlds).values({ id: "w_ask", prompt: "Open a coffee shop", title: null, status: "clarifying", scope: null, profile: null, completeness: null, endings: null, budgetUsd: 5, error: null, createdAt: now, updatedAt: now }).run();
  db().insert(forecasts).values({ id: "w_ask", question: "Whether to open a coffee shop in Hangzhou", clarify: [], asOf: now.slice(0, 10), createdAt: now }).run();
  const slot = { value: "Hangzhou, 2026", source: "said", random: false };
  const q = (about: string, text: string, follow: unknown[] = []) => ({ about, q: text, why: "It changes the course", kind: "one", unit: null, options: ["Yes", "No"], follow });
  const answer = {
    setup: { world: slot, premises: ["I can read minds"], role: { ...slot, value: "Myself", kind: "self", name: null }, start: { ...slot, value: "Today", date: null }, goal: { ...slot, value: "Earn the money back within a year" } },
    insight: { language: "en", said: "Open a coffee shop", premises: [{ text: "A neighborhood shop never lacks foot traffic", why: "Measured, it may be very low" }], understood: "You want to open a coffee shop in Hangzhou" },
    decision: "Open a coffee shop in Hangzhou",
    basis: [],
    uses: [{ what: "The money on hand for the shop", said: "" }],
    questions: [q("situation", "First, the situation", [{ on: ["Yes"], q: "A follow-up", why: "Narrows it down", kind: "text", unit: null, options: [] }, { on: ["An option that does not exist"], q: "Never asked", why: "", kind: "text", unit: null, options: [] }]), q("purpose", "Then, the measure"), q("premise", "Last, the premise")],
  };
  // the answer as a stand-in gives it is the shape the questions are asked in
  const { ClarifySchema } = await import("../src/forecast/schemas.ts");
  assert.doesNotThrow(() => ClarifySchema.parse(answer));
  const clarified = standIn({ clarify: () => answer });
  await clarifyForecast("w_ask");
  // the questions ask only what, guessed wrong, would make it a different matter: what it is (and where), how far along
  // it is, and what of their own the play turns on; not their life outside it
  const brief = clarified.find((c) => c.purpose === "clarify")!.system;
  for (const part of ["only what, guessed wrong, would make it a different matter", "what exactly the thing is", "how far along it is", "what of their own the play will turn on: the money that is for it, the time they have for it", "Their private life"]) assert.ok(brief.includes(part), part);
  // how far along it is is asked whenever their words do not say; the people around them in it are not asked: the world draws them
  for (const part of ["who is already using, trying, waiting on or committed to what they have", "The people around them in the matter (those they work beside, lead or answer to, their family where the matter involves it, rivals, and which of them are close to them) are not asked: the world draws them as such matters commonly go"]) assert.ok(brief.includes(part), part);
  // the start is the day the matter itself begins
  assert.match(brief, /start: the day the matter they named itself begins/);
  let f = db().select().from(forecasts).where(eq(forecasts.id, "w_ask")).get()!;
  assert.deepEqual(f.clarify.map((c) => [c.q, c.parent ?? null]), [["First, the situation", null], ["A follow-up", "First, the situation"], ["Then, the measure", null], ["Last, the premise", null]]);
  // how closely they want to watch is asked by a call of its own, once the answers are in: the ways the model wrote
  // for this world, none suggested, each with how long it would take to play
  const { paceForecast, choosePace } = await import("../src/forecast/engine.ts");
  db().update(forecasts).set({ clarify: f.clarify.map((c) => ({ ...c, answer: c.q === "First, the situation" ? "Yes" : null })) }).where(eq(forecasts.id, "w_ask")).run();
  const asked = standIn({ pace: () => ({ q: "How closely do you want to watch?", options: [{ name: "Every exchange", step: "A word back from the landlord is a step", steps: 400 }, { name: "Every turn", step: "Signing for the shopfront is a step", steps: 40 }, { name: "Only the big moments", step: "Opening and earning the money back are a step each", steps: 5 }] }) });
  const ask = (await paceForecast("w_ask"))!;
  // each way says what is weighty enough to stop at, and that what is lighter goes on along their last line; its count
  // is an honest estimate of the main line, shown as a guide, never a target
  const paceSystem = asked.find((c) => c.purpose === "pace")!.system;
  assert.match(paceSystem, /never a share of the days or months it lasts/);
  assert.match(paceSystem, /whatever is lighter than that is carried out along the line they set at their last stop/);
  assert.match(paceSystem, /how many stops the main line of the matter takes/);
  assert.match(paceSystem, /never a target/);
  const { PaceSchema } = await import("../src/forecast/schemas.ts");
  assert.match(PaceSchema.shape.options.element.shape.step.description ?? "", /lighter than that is carried out along the line they set at their last stop/);
  assert.match(PaceSchema.shape.options.element.shape.steps.description ?? "", /main line[\s\S]*never a target/);
  assert.match(asked.find((c) => c.purpose === "pace")!.prompt, /First, the situation: Yes/);
  assert.deepEqual(ask.options.map((o) => [o.name, o.steps, o.minutes]), [["Every exchange", 400, 600], ["Every turn", 40, 60], ["Only the big moments", 5, 8]]);
  // what they chose is kept in the setup; passed over, no pace is set
  choosePace("w_ask", "Only the big moments");
  f = db().select().from(forecasts).where(eq(forecasts.id, "w_ask")).get()!;
  assert.deepEqual(f.setup!.pace, { name: "Only the big moments", step: "Opening and earning the money back are a step each", steps: 5 });
  choosePace("w_ask", null);
  f = db().select().from(forecasts).where(eq(forecasts.id, "w_ask")).get()!;
  assert.equal(f.setup!.pace, undefined);
  assert.ok(f.setup!.paceAsk);
  assert.deepEqual(f.setup!.premises.map((p) => p.text), ["I can read minds"]);
});

test("a number answered before the world is built reaches the prompts with the unit it was asked in", async () => {
  const { answeredLines } = await import("../src/forecast/insight.ts");
  const item = { why: "", options: ["20", "40"], round: 1 };
  const lines = answeredLines([
    { ...item, q: "Roughly how much money in all are you ready to put in?", kind: "number", unit: "thousand dollars", answer: "30" },
    { ...item, q: "Which district is the site in?", kind: "text", unit: null, answer: "Xihu District" },
  ] as never);
  assert.deepEqual(lines, ["Roughly how much money in all are you ready to put in?: 30 (unit: thousand dollars)", "Which district is the site in?: Xihu District"]);
});

test("an answer that leaves out what may rightly be empty (a question's follow-ups, its unit, its options) is taken with it empty, not failed", async () => {
  const { ClarifySchema } = await import("../src/forecast/schemas.ts");
  const q = ClarifySchema.shape.questions.element;
  const got = q.parse({ about: "situation", q: "What is it?", why: "It decides the matter", kind: "text" });
  assert.deepEqual([got.follow, got.unit, got.options], [[], null, []]);
});
