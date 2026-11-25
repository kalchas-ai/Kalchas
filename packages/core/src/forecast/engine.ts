import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { forecasts, jobs, worlds, type ClarifyItem, type PaceAsk } from "../db/schema.js";
import { config } from "../config.js";
import { setLanguage } from "../language.js";
import { generate } from "../llm/generate.js";
import { enqueue, requeue, runJobNow } from "../jobs/queue.js";
import { normDate, newId, nowIso } from "../util.js";
import { ClarifySchema, PaceSchema, type QuestionOut } from "./schemas.js";
import { answeredLines, insightText, type Insight } from "./insight.js";
import { momentOf, today, type MomentHint } from "./moment.js";
import { cleanSetup, momentFields, setupText } from "../world/setup.js";
import { ENGINE_NARRATE } from "../narrate/play.js";
// the job that builds a project's world is registered by this module
import { refuseEarlier } from "../world/build.js";

/**
 * A project, from the person's first words to a world that can be played. The product is the play: there is no page
 * of conclusions. The matter is understood as they put it and what only they can say is asked, all at once; with the
 * answers in, one job builds the world (see world/build.ts), and the project's id is the world's. What they try first
 * is simply their first move in the play.
 */

// (the unit given as an example below, escaped, is "wan yuan": ten thousand yuan)
const CLARIFY_BRIEF = `Settle the scale first: how many questions to ask, and which, follows from the matter. If it needs nothing that only they know (for example whether it will rain tomorrow), ask no question at all; only the more complex it is, and the more it depends on their own circumstances, the more you ask.

You are helping a person play out a matter they named, in a simulated world built for it. Before the world is built, first understand what they said, as they said it, then ask.

This is a world simulator; anything can be played out. First, in setup, read out five slots from first principles, without presuming that there are only a few kinds of play:
- world: when and where;
- premise: what they set that differs from the real world (empty when there is nothing); outside the premise everything follows the real world;
- who they play: themselves, a real person or organisation, a person or thing generated in the play (a newborn, a fictional person, a stray cat, an open-source project), or nobody (they only want to see how it goes). When they did not say whom they want to be, it is themselves: the one who decides and gets things done in this matter ("simulate the dog falling ill and treating the dog": they are the owner treating the dog, not the dog). Only when they say outright that they want to be someone or something else ("suppose I were …", "play …", "from the point of view of …", "be reborn as …") is it not themselves;
- start: the day the matter they named itself begins, and the circumstances then. What they said they would do to get there (go there, leave their post, take up the new one, land) is done by that day, so it may lie after today; it is today when they said so, when the matter is already under way or is what they face now, and when what they asked to see is the run-up itself; a day they named for it is that day, and a moment of the past they named is that moment;
- goal: only when they said what specifically they want to reach; a random rebirth, or just seeing what happens, has none: do not make one up for them.
What they said is taken as they said it; what they said is "random", or did not say but has to be settled and can only be drawn from the real distribution (where they are born, into what family), mark random: the program draws it from the real distribution, you do not settle it for them; what can be inferred from their words, infer, and mark assumed.
When they stand in the place of a real person at some moment in the past, the understanding and the questions below all go by that moment and that person: the decision to be made is the one that person faced then; the questions ask how they want to set things, not about their own circumstances. When they play a generated person or thing, likewise do not ask about their own circumstances; ask how they want to set things (only what changes the play and only they can settle).

Step one: write your understanding in insight: what the matter they named actually is, in their own words, without extending it and without guessing what else they want behind it. Do not speculate about their "real purpose", do not judge whether their way is the best way, and do not propose other ways. In the insight's premises write only what they take for granted about the real world that may not hold and would change how it goes. What they set for the play that differs from the real world belongs to the setup's premise: it is given, and is never listed as something to test. When the words they named could be read as different things (different kinds of thing to make or do, not only different details of one), the insight does not pick a reading: it says the words can mean either, and the first question asks which they mean, its options the real readings, in plain words.

Step two: from the gaps in that understanding, write at once all the questions to ask them before the world is built. There is no follow-up afterwards. The questions ask only what, guessed wrong, would make it a different matter, and only these:
1. what exactly the thing is: what they are going to do, for whom or with whom, and where (what product, and for whom; which degree, in which field; what they mean to tell whom). Where it is (the country, the city, the place) is asked whenever it changes the rules and customs the matter goes by and their words do not say it: the language they write in is no sign of where they are;
2. how far along it is: what of the thing itself is already made, done, running or tried, who is already using, trying, waiting on or committed to what they have, and where any dealing already begun stands (a promise already made, terms already agreed). This is asked whenever their words do not say: it is never supposed to be nothing;
3. what of their own the play will turn on: the money that is for it, the time they have for it (a date they are bound to), and the trade, standing or skill of theirs it rests on, as far as a wrong guess would change the shape of the matter. Where the matter has to pass someone else's judgment of them before it can go on, what that judgment weighs of theirs is part of this and is asked, in figures where it is weighed in figures.
The people around them in the matter (those they work beside, lead or answer to, their family where the matter involves it, rivals, and which of them are close to them) are not asked: the world draws them as such matters commonly go, and the play shows them. Their private life (where they live, what they live on, what their family or anyone outside the matter thinks of it, whether they are ready for it, how they feel) is not asked, unless the matter is that very thing. Do not ask why they want to do this or what they are after either: ask only how the matter itself stands.
Before you write the questions, think the matter through in two slots. In basis, write what this matter turns on inside the span they asked to see, whatever kind of thing that is (a rule or a sum; a person and what they hold to; a body and how it decides; a condition of body, place or season), and what each needs to know about them. In uses, write what of theirs THIS MATTER will use inside that span (the thing itself as it now stands, how far along it is, the money and the time for it, the trade or skill it rests on), each with their own words where they have already said it. What bears only after that span is no part of either. Then ask for what is decisive and not yet said. What is not decisive is not asked: the world takes the common case for it and says so at the opening, where they can correct it. What the world itself settles (what things cost in a place, how a body usually decides, what such a post pays) is not theirs to answer and is not asked; what the web can establish is looked up when the world is built.
- ask about a premise only when it is crucial and only they know it;
- do not ask among the questions up to which year the play runs, when it ends, how fast it goes or whether it stops at each step: a play has no set end, it unfolds naturally to the outcome of the matter or of the person, and how closely they watch it is asked separately, once these are answered;
- what needs asking only after they pick a certain answer goes into that question's follow (there may be several), not into a separate question; follow-ups do not repeat other questions;
- do not ask what they have already said: read their words again before you write each question, and where they gave the figure, the name or the fact, it is known and is not asked again, not even to confirm it;
- do not lecture, and do not hint that their idea is wrong; do not ask empty questions such as "would you consider other ways".
How many to ask is decided by need, usually three to five, never padded. People answer the first few questions with care and then start answering carelessly, so every question has to earn its place: several parallel "do you have …" questions merge into one many; what is of use only after a certain answer goes into that question's follow; what would not change how the play goes is not asked; what can be taken as the common case is not asked. Write them in the order they are to be asked: the easy ones first, then those that take some thought. Rules:
- ask first what the matter itself is. When they gave only a rough idea ("open a shop abroad", "go back to school", "write a novel"), this is the first question, ahead of every question about how far along it is or what of their own it turns on; getting only as far as "which industry" or "which subject" does not count as having it clear;
- these questions are put in front of them all together; when they answer one you cannot see what they answered to another. So: where the answer to one question would make another superfluous or absurd (nationality and visa; whether it is running yet and how many already use it), do not make them two questions side by side: merge them into one and list the combined cases directly as the options, or write the second as a follow under a certain answer of the first;
- options list the cases that make a whole class of questions disappear (a citizen, a local, already have it, not needed): once they pick such an option, the related matters are no longer a question afterwards;
- one question asks one thing only; never merge two questions into one;
- kinds: a key circumstance uses one (single choice); several parallel circumstances that can hold at the same time use many, asked in one question; a figure they would give as a number (an amount, a count, a length of time) uses number: they fill it in directly, and its unit is given in unit (the options are bare numbers in that unit, so the unit must be one they think in, e.g. \u4e07\u5143 for a sum asked in Chinese; the unit is written in their language); a short answer only they know, such as a name or a place, uses text;
- options are specific, mutually exclusive and cover the common cases, including "not sure" when needed;
- do not make them judge priorities for you; questions are in plain words.`;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function loadForecast(id: string) {
  const w = db().select().from(worlds).where(eq(worlds.id, id)).get();
  const f = db().select().from(forecasts).where(eq(forecasts.id, id)).get();
  if (!w || !f) throw new Error(`No such project: ${id}`);
  return { w, f };
}

function setProject(id: string, patch: Partial<typeof worlds.$inferInsert>): void {
  db().update(worlds).set({ ...patch, updatedAt: nowIso() }).where(eq(worlds.id, id)).run();
}

/** Starts a project from what you wrote (a failure is kept on the project, not thrown); `hint` is the moment as you set it yourself on the home page. */
export async function createProject(text: string, opts: { hint?: MomentHint } = {}): Promise<{ id: string }> {
  const q = text.trim();
  if (!q) throw new Error("Write what is on your mind");
  const id = newId("fc");
  const now = nowIso();
  db().insert(worlds).values({ id, prompt: q, title: null, status: "clarifying", scope: null, profile: null, completeness: null, endings: null, error: null, engine: ENGINE_NARRATE, createdAt: now, updatedAt: now }).run();
  db().insert(forecasts).values({ id, question: q, clarify: [], asOf: today(), createdAt: now }).run();
  // understood in the background: the project's page opens at once and shows the understanding as it happens
  void clarifyForecast(id, undefined, opts.hint);
  return { id };
}

/**
 * The questions as kept, in the order the model wrote them: each follow-up right after the question it hangs under.
 * Answers are matched to questions by their words, so a question written twice is kept once; a follow-up is asked
 * after certain options of its question, so one that names none of them can never come up and is not kept.
 */
function toClarify(qs: QuestionOut[]): ClarifyItem[] {
  const one = (x: { q: string; why: string; kind: ClarifyItem["kind"]; unit: string | null; options: string[] }) => ({ q: x.q, why: x.why, kind: x.kind, unit: x.unit, options: x.options, answer: null, round: 1 });
  const seen = new Set<string>();
  return qs
    .filter((x) => x.q.trim() && !seen.has(x.q) && !!seen.add(x.q))
    .flatMap((x): ClarifyItem[] => {
      const top: ClarifyItem = { ...one(x), about: x.about };
      const follows = x.follow.flatMap((f): ClarifyItem[] => {
        const after = f.on.filter((o) => top.options.includes(o));
        return f.q.trim() && after.length && !seen.has(f.q) && !!seen.add(f.q) ? [{ ...one(f), about: x.about, parent: top.q, on: after }] : [];
      });
      return [top, ...follows];
    });
}

/** How long a play may take and still be one somebody plays through: beyond it a way of watching is not offered. */
const PLAYABLE_MINUTES = 240;

const PACE_BRIEF = `A person is about to play out a matter in a simulated world, one step at a time: each step shows them one moment of the world, and they then do something or carry on. How closely they watch is theirs to choose, once, before the play. Write that choice for THIS world, now that their answers are in.
Write the ways of watching that are really different for this matter, from the closest to the widest: as many as it really has, between two and five. Each is named in this world's own terms and described by what is weighty enough for the play to stop at it, with examples taken from this very matter, so that they see at a glance how fine it is (each thing they have to decide; each turn that changes where they stand; only the great junctures); and the description says too that whatever is lighter than that is carried out along the line they set at their last stop, without stopping. A pace is never a length of time, in its name or in its description (not "a week a step", not "month by month").
Every way offered is one a person would really play through. A step takes them about a minute and a half, so even the closest way is one that can be played in a few hours at most: a way of watching that would take days of play (every single exchange of a whole life) is not offered; the closest way is then the finest that still can be played.
First say where the main line of what they asked to see is over: the day their span has passed when they named one (\`until\`), otherwise what settles the matter (\`settled\`). Then, for each way, estimate honestly how many stops the main line of the matter takes at that way's weight from its start to there: the things of that weight it really holds, as many as this matter really holds, and never a share of the days or months it lasts (a matter of a few days may hold as many as one of years, or more, and a long one may hold few). The count is a guide shown to them, never a target: the play stops wherever such a thing comes, however many that makes, and may go on past the main line. Suggest none: they choose.`;

/**
 * Writes what is asked about pace for a project, from the matter and the answers, and keeps it in the setup. A failure
 * is not the project's: with nothing asked, no pace is chosen and whoever writes the moments decides where to stop.
 */
export function paceForecast(id: string): Promise<PaceAsk | null> {
  // (asked for from two sides, the start of the build and the page: written once)
  const under = pacing.get(id);
  if (under) return under;
  const p = writePace(id).finally(() => pacing.delete(id));
  pacing.set(id, p);
  return p;
}
const pacing = new Map<string, Promise<PaceAsk | null>>();

async function writePace(id: string): Promise<PaceAsk | null> {
  const { f } = loadForecast(id);
  if (!f.setup) return null;
  if (f.setup.paceAsk) return f.setup.paceAsk;
  try {
    const said = answeredLines(f.clarify);
    const prompt = `The matter they named: ${f.question}\n${insightText(f.insight)}\n\n${setupText(f.setup)}\n\nTheir answers:\n${said.map((x) => `- ${x}`).join("\n") || "(nothing was asked)"}`;
    const call = { role: "forecaster" as const, purpose: "pace", worldId: id };
    const tooLong = (o: { steps: number }) => o.steps * config().sim.minutesPerStep > PLAYABLE_MINUTES;
    let out = await generate(call, { schema: PaceSchema, system: PACE_BRIEF, temperature: 0.4, prompt });
    // (the one thing the program counts: a way that would take longer to play than anyone would give it goes back, once)
    if (out.options.some(tooLong))
      out = await generate(call, {
        schema: PaceSchema,
        system: PACE_BRIEF,
        temperature: 0.4,
        prompt: `${prompt}\n\n[Your last answer could not be used as it stands]\n${out.options.filter(tooLong).map((o) => `- "${o.name}" at about ${Math.round(o.steps)} steps would take about ${Math.round((o.steps * config().sim.minutesPerStep) / 60)} hours to play: nobody plays that. The closest way offered is the finest one that can still be played in a few hours.`).join("\n")}\nAnswer again in full.\n\n[Your last answer]\n${JSON.stringify(out)}`,
      });
    const seen = new Set<string>();
    const options = out.options
      .filter((o) => o.name.trim() && !seen.has(o.name.trim()) && !!seen.add(o.name.trim()))
      .map((o) => ({ name: o.name.trim(), step: o.step.trim(), steps: Math.round(o.steps), minutes: Math.round(o.steps * config().sim.minutesPerStep) }));
    if (!out.q.trim() || !options.length) return null;
    // (where what they asked to see is over: the day their span has passed, or else what settles the matter)
    const until = normDate(out.until ?? "");
    const ends = until && until === out.until ? `the span they named has passed, on ${until}` : out.settled.trim();
    const paceAsk: PaceAsk = { q: out.q.trim(), options, ...(ends ? { ends } : {}) };
    // (the setup may have been filled by the build meanwhile: only this one field is written)
    const now = loadForecast(id).f.setup;
    if (now) db().update(forecasts).set({ setup: { ...now, paceAsk } }).where(eq(forecasts.id, id)).run();
    return paceAsk;
  } catch {
    return null;
  }
}

/**
 * The pace they chose: one of the ways offered (by its name), their own words, or nothing (they passed it over: no
 * pace, and whoever writes the moments decides where to stop). It can be chosen while the world is being built, and
 * again at any time before or during a play.
 */
export function choosePace(id: string, answer: string | null): void {
  const { f } = loadForecast(id);
  if (!f.setup) return;
  const said = answer?.trim() || null;
  const way = f.setup.paceAsk?.options.find((o) => o.name === said);
  const { pace: _was, ...rest } = f.setup;
  const pace = way ? { name: way.name, step: way.step, steps: way.steps } : said ? { name: said, step: "" } : undefined;
  db().update(forecasts).set({ setup: pace ? { ...rest, pace } : rest }).where(eq(forecasts.id, id)).run();
}

/**
 * (Re)generates the understanding and the questions. With a correction (you said the understanding was off), it
 * understands you again with what you said, and asks again.
 */
export async function clarifyForecast(id: string, correction?: string, hint?: MomentHint): Promise<void> {
  const { f } = loadForecast(id);
  const fix = correction?.trim() || f.insight?.correction || "";
  // understood again: the moment it already stands at holds, unless you said otherwise
  const keep: MomentHint | undefined = hint ?? (f.insight ? (momentOf(f).past ? "past" : "today") : undefined);
  try {
    const out = await generate(
      { role: "forecaster", purpose: "clarify", worldId: id },
      {
        schema: ClarifySchema,
        system: CLARIFY_BRIEF,
        temperature: 0.4,
        prompt: `The real today is ${today()}.${keep === "past" ? "\nThey confirmed it themselves: this is a moment in the past that really happened." : keep === "today" ? "\nThey confirmed it themselves: this is about what comes from today onward." : ""}\nThe matter they named: ${f.question}${fix ? `\n\nThey read your earlier understanding and corrected it: ${fix}\nUnderstand them again with their correction as the authority, and do not ask again what they have made clear.` : ""}`,
      },
    );
    // the project is in the language he wrote in, from here on
    setLanguage(id, out.insight.language);
    const insight: Insight = { ...out.insight, ...(fix ? { correction: fix } : {}) };
    const read = cleanSetup(out.setup, undefined, id);
    // what he said on the home page outweighs any reading: a matter from today on does not open in the past (it opens
    // today, or on the later day the matter itself begins)
    const setup = keep === "today" && read.start.date < today() ? { ...read, start: { ...read.start, date: today() } } : read;
    const moment = { ...momentFields(setup), horizon: null };
    const clarify = toClarify(out.questions);
    db().update(forecasts).set({ clarify, insight, setup, ...moment }).where(eq(forecasts.id, id)).run();
    setProject(id, { title: out.decision.trim() || f.question.trim(), error: null });
    // nothing to ask (a simple matter): the world is built at once
    if (!clarify.length) await startForecast(id, []);
  } catch (err) {
    setProject(id, { error: message(err) });
  }
}

/** Saves the answers and starts building the world in the background. All the questions were asked at once. */
export async function startForecast(id: string, answers: { q: string; answer: string | null }[]): Promise<void> {
  const { w, f } = loadForecast(id);
  if (w.status !== "clarifying") throw new Error("This project has already begun building its world");
  const clarify = f.clarify.map((c) => ({ ...c, answer: answers.find((a) => a.q === c.q)?.answer?.trim() || c.answer || null }));
  db().update(forecasts).set({ clarify }).where(eq(forecasts.id, id)).run();
  // How closely they want to watch is asked now that their answers are in (they settle how large the matter is), by a
  // call of its own, while the world is built: the pace bears on the play, not on the world, so nothing waits for it.
  void paceForecast(id);
  // With the answers in, the matter is named as it now stands, while the world is built: nothing waits for the name
  // (the build reads the question and the answers, not the name), and the world takes it once it has one.
  const said = answeredLines(clarify);
  if (said.length)
    void generate({ role: "forecaster", purpose: "project_title", worldId: id }, {
      schema: z.object({ title: z.string().describe("The name of this matter, ≤24 CJK characters / ≤12 words: what is being done, plus the one or two conditions that matter most in their answers (where, how much money, how long); no full stop, and no words such as \"about\" or \"simulation\"") }),
      temperature: 0.2,
      system: "Give a matter that is to be played out a specific name. Use only what is in their own words; add nothing they did not say.",
      prompt: `What they are going to do: ${f.question}\nThe name so far: ${w.title ?? ""}\nTheir answers:\n${said.map((x) => `- ${x}`).join("\n")}`,
    })
      .then((out) => {
        if (out.title.trim()) setProject(id, { title: out.title.trim() });
      })
      // the name it already has stands; nothing else depends on this one (money spent stops the build itself)
      .catch(() => {});
  // (a project begun before engine 12 and never built has no world yet: it is built as every new one is)
  setProject(id, { status: "building", error: null, engine: ENGINE_NARRATE });
  const jobId = enqueue("build_world", { worldId: id }, id);
  void runJobNow(jobId);
}

/**
 * A new project with the same question, answers and setup, built again from the start (to compare, or after the build
 * changed). The original is left as it was.
 */
export function rerunForecast(id: string): { id: string } {
  const { w, f } = loadForecast(id);
  if (w.status === "clarifying") throw new Error("This project has not begun building its world yet");
  const nid = newId("fc");
  const now = nowIso();
  db()
    .insert(worlds)
    .values({ id: nid, prompt: w.prompt, title: w.title, language: w.language, status: "building", scope: null, profile: null, completeness: null, endings: null, error: null, engine: ENGINE_NARRATE, createdAt: now, updatedAt: now })
    .run();
  // the same moment: the same day for one in the past; for a matter ahead, the day the matter itself begins while it
  // is still to come, else today (the world has moved on)
  const m = momentOf(f);
  const asOf = m.past || m.at > today() ? m.at : today();
  const setup = f.setup ? structuredClone(f.setup) : null;
  if (setup) {
    setup.start.date = asOf;
    // (a start that lay ahead and has since come is no longer a start in the future)
    if (asOf <= today()) delete setup.start.note;
  }
  db().insert(forecasts).values({ id: nid, question: f.question, clarify: f.clarify, setup, asOf, seat: m.seat, horizon: m.horizon, insight: f.insight, lookups: null, createdAt: now }).run();
  const jobId = enqueue("build_world", { worldId: nid }, nid);
  void runJobNow(jobId);
  return { id: nid };
}

/** Picks a stopped build up where it stopped, optionally with a higher spending limit (not one of a world made by an earlier engine). */
export function resumeForecast(id: string): { jobId: string } {
  loadForecast(id);
  refuseEarlier(id);
  const job = db().select().from(jobs).where(eq(jobs.worldId, id)).orderBy(desc(jobs.createdAt)).get();
  if (!job) throw new Error("There is no build job");
  setProject(id, { status: "building", error: null });
  requeue(job.id);
  void runJobNow(job.id);
  return { jobId: job.id };
}
