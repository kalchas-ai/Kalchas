import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { ModelMessage } from "ai";
import { db } from "../db/client.js";
import { branches, decisions, entities, forecasts, judgments, llmCalls, sessions, snapshots, startPoints, worlds, type BranchState, type Milestone, type Notice, type StoryState } from "../db/schema.js";
import { config, modelFor } from "../config.js";
import { isTransient } from "../jobs/queue.js";
import { languageRule, tx } from "../language.js";
import type { Ask } from "../sim/advise.js";
import { atomicStep, stepRunningHere } from "../sim/checkpoint.js";
import { recordPerformance } from "../sim/health.js";
import { notice, publicNotices, saidOnce } from "../sim/notices.js";
import { endOf, endPlayAt } from "../sim/relations.js";
import type { MilestoneShown, Situation, StopLive } from "../sim/schemas.js";
import { getBranch, saveSnapshot, updateBranch, worldIdOf } from "../sim/world.js";
import { newId, nowIso } from "../util.js";
import { narrate, type NarrateResult } from "./call.js";
import { beginTurn, dayHead, headOf, milestonesText, paceLine, playMessages, stopsOf } from "./context.js";
import { mergeNotes, notesText } from "./notes.js";
import { FOLD_RULES, SYSTEM } from "./rules.js";
import { missing, readStop, type StopOut } from "./stop.js";
import { arrivedLines, happenedLine, partialTag, tagOf } from "./tags.js";
import { emptyUsed, playTools, type Used } from "./tools.js";
import { narrateReport } from "./report.js";
import { admitPeople } from "./world.js";
import type { ActionInput, ChosenAction, Progress, Settlement, StepResult } from "../sim/engine.js";

/**
 * Engine 12: the play written straight on by one model, in one conversation from the world's setting up to the last
 * stop. Each time the person acts, the program puts the play together from the database (context.ts), adds the move
 * with its day, and the model writes what comes of it up to the next stop, looking things up and rolling as it goes,
 * in tags (or, when the person only asked something, the answer). The program reads the stop, checks the little it
 * must, keeps it (the stop as the page shows it, its whole exchange as it happened, the notes it changed, its rolls),
 * and shows it. Between stops nothing runs, and nothing is kept anywhere but in the database.
 */

export const ENGINE_NARRATE = 12;

/** Whether a play is written straight on by one model. */
export const isNarrated = (state: BranchState | null | undefined) => state?.engine === ENGINE_NARRATE;

type Move = Extract<StopOut, { kind: "move" }>;


// ---------------------------------------------------------------- one stop, written

/**
 * One stop written by the model from the play as given, with the tools of a play: the web, and the dice of this line.
 * The scene is shown as it is written, and beside it, as they come, what each side did in the stretch (its lines as
 * each is finished) and the rolls the protagonist can see. A stop with no scene (or an answer where none could be) is
 * asked for once more; a call that fails for the network is sent once more, its rolls taken back. Whenever what was
 * shown is taken back, all of it is cleared. `question`: the person may only have asked something.
 */
async function writeStop(o: { worldId: string; branchId: string; step: number; notBefore: string; messages: ModelMessage[]; say: Progress; question: boolean }): Promise<{ r: NarrateResult; used: Used; out: StopOut; problems: string[]; exchange: ModelMessage[] }> {
  const wid = o.worldId;
  const state = getBranch(o.branchId).state;
  let used = emptyUsed();
  const writing = tx(wid, "play.writingStop");
  let shown = "";
  // what was shown beside the scene, and the line last said (a roll's own line stays while its outcome is shown)
  const none = (): StopLive => ({ happened: [], rolls: [] });
  let live = none();
  let line = writing;
  let text = "";
  const showLive = (msg: string) => {
    const happened = (arrivedLines(text, "happened") ?? []).map(happenedLine).filter((x) => x.what);
    const rolls = used.rolls.filter((x) => x.seen).map((x) => ({ question: x.question, chosen: x.chosen, about: x.about }));
    const next = { happened, rolls };
    if (JSON.stringify(next) === JSON.stringify(live)) return;
    live = next;
    o.say((line = msg), undefined, undefined, live);
  };
  const clear = () => {
    if (!shown && !live.happened.length && !live.rolls.length) return;
    o.say((line = writing), (shown = ""), undefined, (live = none()));
  };
  const onText = (t: string) => {
    text = t;
    showLive(writing);
    const s = partialTag(t, "scene");
    if (s !== undefined && s !== shown) {
      shown = s;
      o.say((line = writing), s);
    }
  };
  const onTool = (name: string, input: Record<string, unknown>) => {
    if (name === "web_search") o.say((line = tx(wid, "play.lookingUp", { query: String(input.query ?? "") })));
    else if (name === "read_page") o.say((line = tx(wid, "play.readingPage")));
    // (what is rolled out of the protagonist's sight is not named to them, not even as a question)
    else if (name === "roll_dice") o.say((line = input.seen === true ? tx(wid, "play.rollingSeen", { question: String(input.question ?? "") }) : tx(wid, "play.rolling")));
  };
  const call = { role: "director" as const, purpose: "narrate_stop", worldId: wid, branchId: o.branchId };
  const system = `${SYSTEM}\n\n${languageRule(wid)}`;
  const once = async (messages: ModelMessage[]) => {
    for (let attempt = 0; ; attempt++) {
      const tools = playTools({ ...call, worldId: wid }, used, { round: o.step }, { worldId: wid, branchId: o.branchId, step: o.step, day: o.notBefore, carried: state.story?.carried ?? [], used, onRoll: () => showLive(line) });
      try {
        return await narrate({ ctx: call, system, messages, tools, rounds: config().narrate.rounds, onText, onTool, timeoutMs: 15 * 60_000 });
      } catch (err) {
        if (attempt >= 1 || !isTransient(err)) throw err;
        // what the failed call rolled is taken back, and what it showed cleared
        if (used.rolls.length) db().delete(judgments).where(inArray(judgments.id, used.rolls.map((x) => x.id))).run();
        used = emptyUsed();
        text = "";
        clear();
      }
    }
  };
  let r = await once(o.messages);
  // the stop's whole exchange as it happened, kept in the history (a stop asked for again keeps both answers)
  let exchange = r.messages;
  const lacking = missing(r.text) ?? (!o.question && tagOf(r.text, "kind")?.toLowerCase() === "question" ? "a stop (the person made a move: this is no question)" : null);
  if (lacking) {
    r.close(call.purpose);
    text = "";
    clear();
    const rolled = used.rolls.map((x) => `- ${x.question} → ${x.chosen}`).join("\n");
    const again: ModelMessage = { role: "user", content: `${dayHead(o.notBefore)} Your answer lacked ${lacking}. Write the whole stop again, every tag, in order.${rolled ? `\nAlready rolled in this stop, as it came out (do not roll it again):\n${rolled}` : ""}` };
    const before = exchange.length ? exchange : [{ role: "assistant", content: r.text.trim() || "(no answer)" } as ModelMessage];
    r = await once([...o.messages, ...before, again]);
    exchange = [...before, again, ...r.messages];
  }
  const read = readStop(r.text, { step: o.step, notBefore: o.notBefore });
  if (read.out.kind === "question" && !o.question) {
    r.close(call.purpose);
    throw new Error(tx(wid, "play.stopNotWritten"));
  }
  if (read.out.kind === "move" && !read.out.scene) {
    r.close(call.purpose);
    throw new Error(tx(wid, "play.stopNoScene"));
  }
  return { r, used, out: read.out, problems: read.problems, exchange };
}

// ---------------------------------------------------------------- what a stop leaves

/** The stop as the page shows it, its ways numbered r1, r2…; and the card of each milestone settled in it. */
function situationOf(out: Move, milestones: MilestoneShown[]): Situation {
  return {
    headline: out.headline,
    scene: out.scene,
    why: "",
    day: out.day,
    recommendations: out.options.map((x, i) => ({ id: `r${i + 1}`, title: x.title, detail: x.detail })),
    passed: [],
    messages: out.messages,
    happened: out.happened,
    ...(milestones.length ? { milestones } : {}),
  };
}

/**
 * The main questions the stop says were settled, marked on the line (one not listed is a new one, set by the turn that
 * settled it), and the cards the stop shows, one for each.
 */
function markMilestones(state: BranchState, out: Move): MilestoneShown[] {
  const list = (state.milestones ??= []);
  const settled: Milestone[] = [];
  for (const m of out.milestones) {
    const n = Number(m.question.match(/^#?\s*(\d+)\b/)?.[1] ?? NaN);
    // (a question may open with its number, then a point, a bracket, a colon or the Chinese enumeration comma)
    const q = m.question.replace(/^#?\s*\d+[.)\u3001:\uff1a]?\s*/, "").trim().toLowerCase();
    let x = Number.isInteger(n) && n >= 1 && n <= list.length && !list[n - 1]!.reached ? list[n - 1] : list.find((y) => !y.reached && q && (y.question.trim().toLowerCase() === q || y.question.toLowerCase().includes(q) || q.includes(y.question.toLowerCase())));
    if (!x) {
      if (!q) continue;
      x = { id: newId("ms"), question: m.question.replace(/^#?\s*\d+[.)\u3001:\uff1a]?\s*/, "").trim(), set: out.day, turn: true };
      list.push(x);
    }
    Object.assign(x, { reached: { at: out.day, came: m.came, how: m.card.turn }, shown: out.day, card: m.card });
    settled.push(x);
  }
  return settled.map((x) => ({ question: x.question, day: out.day, came: x.reached!.came, card: x.card! }));
}

/**
 * The names on the roster of a line: the world's people, and those who came in on this line. A fork has its own copies
 * of those who came in on the line it came from up to its stop, so each line writes its own newcomers.
 */
function rosterNames(worldId: string, branchId: string): string[] {
  return db()
    .select({ name: entities.name })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), or(isNull(entities.branchId), eq(entities.branchId, branchId))))
    .all()
    .map((e) => e.name);
}

/**
 * Keeps a stop on the line: its row of `decisions` (the stop as shown, as given to later calls, the notes it changed),
 * the notes merged, the milestones marked, whoever came in written on the roster, the day and the step moved on, and
 * the end written when the story cannot go on. Returns the situation, who came in, and whether the play is over.
 */
function keepStop(o: { worldId: string; branchId: string; step: number; out: Move; text: string; exchange: ModelMessage[]; seqBefore: number; notices: Notice[] }): { situation: Situation; newcomers: string[]; ended: boolean } {
  const { worldId: wid, branchId, out } = o;
  const b = getBranch(branchId);
  const state = structuredClone(b.state);
  const story = state.story!;
  story.notes = mergeNotes(story.notes, out.patch);
  const milestones = markMilestones(state, out);
  // (from the notes as they now stand: someone known to the world only on its hidden side comes in once the protagonist knows of them)
  const newcomers = admitPeople(wid, branchId, story.notes, rosterNames(wid, branchId));
  if (out.ended) endPlayAt(state, out.day, out.ended, "sim", null, wid);
  if (o.notices.length) state.notices = saidOnce([...(state.notices ?? []), ...o.notices]);
  const situation = situationOf(out, milestones);
  db().delete(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, o.step))).run();
  db().insert(decisions).values({ id: newId("dec"), branchId, step: o.step, simTime: out.day, situation, chosen: null, restatement: null, story: o.text.trim(), exchange: o.exchange, move: null, patch: out.patch, eventSeqBefore: o.seqBefore, createdAt: nowIso() }).run();
  const ended = !!endOf(state);
  updateBranch(branchId, { state, simTime: out.day, step: o.step, status: ended ? "ended" : "awaiting_decision" });
  saveSnapshot(branchId);
  return { situation, newcomers, ended };
}

// ---------------------------------------------------------------- the start

/** The play's state at its start: what every call of it opens with, written once, the notes as the world has them. */
function openingState(worldId: string, seatId: string): BranchState {
  const w = db().select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const notes = w.notes!;
  const setup = db().select().from(forecasts).where(eq(forecasts.id, worldId)).get()?.setup;
  const pace = paceLine(setup);
  const story: StoryState = { opened: notes.day, head: headOf(worldId), begin: beginTurn(notes.day, pace, notes.milestones), notes: notes.entries, instructions: [], pace };
  return {
    engine: ENGINE_NARRATE,
    seatId,
    // a fork from any stop of this line can meet what came from wholly outside it again
    externalHistoryFrom: notes.day,
    story,
    milestones: notes.milestones.map((question) => ({ id: newId("ms"), question, set: notes.day, turn: false })),
  };
}

/** Everything a line wrote, taken away (a play whose opening failed was never anyone's). */
function dropLine(branchId: string, sessionId: string): void {
  db().$client.transaction(() => {
    for (const table of ["sim_events", "memories", "known_facts", "decisions", "snapshots", "judgments", "reports", "entities", "actors", "edges"]) db().$client.prepare(`DELETE FROM ${table} WHERE branch_id = ?`).run(branchId);
    db().delete(branches).where(eq(branches.id, branchId)).run();
    db().delete(sessions).where(eq(sessions.id, sessionId)).run();
  })();
}

/** Opens a play on an engine-12 world: the opening stop, on the day the matter itself begins. */
export async function startNarrate(worldId: string, startOrdinal = 1, onProgress?: Progress): Promise<{ sessionId: string; branchId: string; situation: Situation }> {
  const w = db().select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!w) throw new Error(`No such world: ${worldId}`);
  if (w.status !== "ready" || !w.notes) throw new Error(`The world is not built yet (status: ${w.status})`);
  const start = db().select().from(startPoints).where(and(eq(startPoints.worldId, worldId), eq(startPoints.ordinal, startOrdinal))).get();
  if (!start) throw new Error(`No starting point ${startOrdinal}`);
  // an opening cut off part way (the server went down) is started again from nothing
  for (const s of db().select().from(sessions).where(and(eq(sessions.worldId, worldId), eq(sessions.startPointId, start.id), eq(sessions.status, "starting"))).all()) {
    const pending = db().select().from(branches).where(eq(branches.sessionId, s.id)).all();
    if (pending.some((p) => stepRunningHere(p.id))) throw new Error("The opening is still being made; please wait for it");
    for (const p of pending) dropLine(p.id, s.id);
    db().delete(sessions).where(eq(sessions.id, s.id)).run();
  }
  const sessionId = newId("sess");
  const branchId = newId("br");
  const now = nowIso();
  db().insert(sessions).values({ id: sessionId, worldId, startPointId: start.id, seatEntityId: start.seatEntityId, status: "starting", createdAt: now }).run();
  db().insert(branches).values({ id: branchId, sessionId, parentBranchId: null, forkStep: null, simTime: start.date, step: 0, seq: 0, state: openingState(worldId, start.seatEntityId), rngSeed: randomInt(2 ** 31), rngCounter: 0, status: "running", pendingAction: null, createdAt: now }).run();
  const say: Progress = (m, scene, shown, live) => onProgress?.(m, scene, shown, live);
  try {
    return await atomicStep(branchId, async () => {
      say(tx(worldId, "play.writingOpening"));
      const notices: Notice[] = [];
      const { r, out, problems, exchange } = await writeStop({ worldId, branchId, step: 1, notBefore: start.date, messages: playMessages(branchId, 0), say, question: false });
      const move = out as Move;
      notices.push(...problems.map((p) => notice("answer", p)));
      if (r.runaway) notices.push(notice("rounds", tx(worldId, "play.openingRounds", { rounds: r.rounds })));
      say(tx(worldId, "play.settingOpening"), undefined, { day: move.day, headline: move.headline, options: move.options });
      const kept = keepStop({ worldId, branchId, step: 1, out: move, text: r.text, exchange, seqBefore: 0, notices });
      r.close("moment");
      db().update(sessions).set({ status: kept.ended ? "ended" : "active" }).where(eq(sessions.id, sessionId)).run();
      return { sessionId, branchId, situation: kept.situation };
    });
  } catch (err) {
    dropLine(branchId, sessionId);
    throw err;
  }
}

// ---------------------------------------------------------------- a move

/** What the person did, in their own words as the page keeps them (the restatement), and as the model is told it. */
function moveOf(current: Situation, input: ActionInput, wid: string): { words: string; told: string; question: boolean } {
  if (input.kind === "carry_on") return { words: tx(wid, "play.noneChosen"), told: "The person did not choose: they carry on the way they would most naturally go from here.", question: false };
  if (input.kind === "command") {
    if (!input.text.trim()) throw new Error(tx(wid, "play.chooseOrWrite"));
    return { words: input.text.trim(), told: `The person wrote:\n${input.text.trim()}`, question: true };
  }
  if (input.kind === "option") {
    const r = current.recommendations.find((x) => x.id === input.id);
    if (!r) throw new Error(`No such option: ${input.id}`);
    const own = input.text?.trim();
    return { words: own || tx(wid, "join.titleDetail", { title: r.title, detail: r.detail }), told: own ? `The person chose "${r.title}" and put it in their own words:\n${own}` : `The person chose: ${r.title}${r.detail ? `: ${r.detail}` : ""}`, question: false };
  }
  const picked = input.picks.map((id) => current.recommendations.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const own = input.text?.trim() ?? "";
  if (!picked.length && !own) throw new Error(tx(wid, "play.chooseOrWrite"));
  if (!picked.length) return { words: own, told: `The person wrote:\n${own}`, question: true };
  const words = [...picked.map((r, i) => `${i + 1}. ${tx(wid, "join.labeled", { label: r.title, text: r.detail })}`), own].filter(Boolean).join("\n");
  return { words, told: `The person chose ${picked.length > 1 ? "these ways together" : "this way"}:\n${picked.map((r) => `- ${r.title}${r.detail ? `: ${r.detail}` : ""}`).join("\n")}${own ? `\nand wrote:\n${own}` : ""}`, question: false };
}

/**
 * The move as the model is given it, word for word as it is then kept: the day, what the person changed through the
 * chat box since the last move, on a matched fork the rolls of the line it came from, a pace chosen anew, and the move.
 */
function moveText(day: string, told: string, story: StoryState, pace: string): string {
  const said = (story.instructions ?? []).filter((x) => x.step == null);
  return [
    dayHead(day),
    said.length ? `[What the person said in the box beside the story since the last stop: instructions, to carry out in the story and in the notes as they put them]\n${said.map((x) => `- ${x.at}: ${x.text}`).join("\n")}` : "",
    story.carried?.length
      ? `[This line was forked from another at this stop. There, these things outside the protagonist's reach were rolled after this point, as listed. Where the same thing comes up here, roll it with same_as set to its id: it comes out as it did there]\n${story.carried.map((c) => `- ${c.id} | ${c.day} | ${c.question} → ${c.chosen}`).join("\n")}`
      : "",
    pace !== story.pace ? `[They now watch at another pace]\n${pace}` : "",
    told,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The context window of the model that writes the stops, in tokens. */
export function windowOf(purpose = "narrate_stop"): number {
  const { windows, defaultWindow } = config().narrate;
  return windows[modelFor(purpose)] ?? defaultWindow;
}

/**
 * About how many tokens the next call will read: what the last stop's closing round read and wrote (the provider's
 * own count) and what comes after it; with no such count on this line (a fork's first move), the characters, at two
 * a token (the dense end of what a token holds across the languages of a play).
 */
export function tokensAhead(branchId: string, messages: ModelMessage[], newest: string): number {
  const chars = (x: unknown) => (typeof x === "string" ? x.length : JSON.stringify(x).length);
  const last = db().select().from(llmCalls).where(and(eq(llmCalls.branchId, branchId), eq(llmCalls.purpose, "moment"), eq(llmCalls.ok, true))).orderBy(desc(llmCalls.createdAt)).get();
  if (last && last.inputTokens > 0) return last.inputTokens + last.outputTokens + Math.ceil(chars(newest) / 2);
  return Math.ceil((messages.reduce((n, m) => n + chars(m.content), 0) + chars(newest)) / 2);
}

/**
 * A long play folded, only when its history comes near the model's context window (`foldRatio` of it): all its stops
 * after the last fold but the last `keep` are written, with what came before them (the last fold, or the world's
 * setting up), into the story so far (one call of the light model), with the notes and the main questions as they
 * stood at the last of them; that then opens the play in their place. A failed fold leaves the play as it was: it is
 * tried again at the next move.
 */
async function foldIfNear(branchId: string, wid: string, newest: string, say: Progress, notices: Notice[]): Promise<void> {
  const b = getBranch(branchId);
  const story = b.state.story!;
  const { foldRatio, keep } = config().narrate;
  if (tokensAhead(branchId, playMessages(branchId), newest) < foldRatio * windowOf()) return;
  const last = story.folds?.[story.folds.length - 1];
  const rows = stopsOf(branchId, b.step).filter((r) => r.step > (last?.upTo ?? 0));
  if (rows.length <= keep) return;
  const folded = rows.slice(0, rows.length - keep);
  const upTo = folded[folded.length - 1]!.step;
  say(tx(wid, "play.folding"));
  try {
    const setUp = db().select({ notes: worlds.notes }).from(worlds).where(eq(worlds.id, wid)).get()?.notes;
    const material = [last ? `[The story so far, as last kept]\n${last.text}` : `[The world's setting up]\n${setUp?.text ?? story.world ?? ""}`, ...folded.map((r) => `[Stop, ${r.simTime}]\n${r.story ?? ""}${r.move ? `\n\n[What the person did there]\n${r.move}` : ""}`)].join("\n\n");
    const r = await narrate({ ctx: { role: "reporter", purpose: "narrate_compress", worldId: wid, branchId }, system: `${FOLD_RULES}\n\n${languageRule(wid)}`, messages: [{ role: "user", content: `${material}\n\nWrite the story so far, up to the end of the last stop above.` }], tools: {}, rounds: 1, timeoutMs: 10 * 60_000 });
    r.close("narrate_compress");
    if (!r.text.trim()) throw new Error("The story so far came back empty");
    const notesThen = stopsOf(branchId, upTo).reduce((n, row) => mergeNotes(n, row.patch ?? []), setUp?.entries ?? []);
    const dayThen = folded[folded.length - 1]!.simTime;
    const msThen = (b.state.milestones ?? []).map((m) => (m.reached && m.reached.at > dayThen ? { ...m, reached: null } : m));
    const state = structuredClone(getBranch(branchId).state);
    (state.story!.folds ??= []).push({ upTo, text: r.text.trim(), notes: notesText(notesThen), milestones: milestonesText(msThen), at: nowIso() });
    updateBranch(branchId, { state });
  } catch (err) {
    notices.push(notice("fold", tx(wid, "play.foldFailed", { error: err instanceof Error ? err.message : String(err) })));
  }
}

/** A step of an engine-12 play: the move, and what the model wrote of it (or its answer, when it was only a question). */
export function submitNarrate(branchId: string, input: ActionInput, onProgress?: Progress): Promise<{ question: Ask } | StepResult> {
  return atomicStep(branchId, async () => {
    const startedAt = nowIso(), clock = Date.now();
    const say: Progress = onProgress ?? (() => {});
    const b = getBranch(branchId);
    const wid = worldIdOf(branchId)!;
    if (b.status === "ended" || endOf(b.state)) throw new Error("This play has already ended");
    if (b.status === "running") throw new Error("This step is already running");
    const dec = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, b.step))).get();
    if (!dec) throw new Error("There is no stop waiting for a decision");
    const current = dec.situation as Situation;
    const m = moveOf(current, input, wid);
    updateBranch(branchId, { status: "running" });
    const notices: Notice[] = [];
    const pace = paceLine(db().select().from(forecasts).where(eq(forecasts.id, wid)).get()?.setup);
    await foldIfNear(branchId, wid, moveText(b.simTime, m.told, b.state.story!, pace), say, notices);
    const told = moveText(b.simTime, m.told, getBranch(branchId).state.story!, pace);
    say(tx(wid, "play.readingMove"));
    const { r, used, out, problems, exchange } = await writeStop({ worldId: wid, branchId, step: b.step + 1, notBefore: b.simTime, messages: [...playMessages(branchId), { role: "user", content: told }], say, question: m.question });
    // something asked, not done: answered where it stands, the story does not move
    if (out.kind === "question") {
      r.close("advise");
      const ask: Ask = { q: m.words, a: out.answer, views: [], checks: [], at: b.simTime, redirected: true };
      db().update(decisions).set({ asks: [...((dec.asks as Ask[] | null) ?? []), ask] }).where(eq(decisions.id, dec.id)).run();
      updateBranch(branchId, { status: "awaiting_decision" });
      return { question: ask };
    }
    notices.push(...problems.map((p) => notice("answer", p)));
    if (r.runaway) notices.push(notice("rounds", tx(wid, "play.stopRounds", { rounds: r.rounds })));
    say(tx(wid, "play.settingStop"), undefined, { day: out.day, headline: out.headline, options: out.options });
    // the move is the line's from now on: given to the model as it was, with what went with it
    {
      const state = structuredClone(getBranch(branchId).state);
      for (const x of state.story!.instructions ?? []) if (x.step == null) x.step = b.step;
      delete state.story!.carried;
      state.story!.pace = pace;
      updateBranch(branchId, { state });
    }
    const kept = keepStop({ worldId: wid, branchId, step: b.step + 1, out, text: r.text, exchange, seqBefore: b.seq, notices });
    const said = saidOnce(notices);
    const settlement: Settlement = {
      from: b.simTime,
      to: out.day,
      moment: out.headline,
      drawn: used.rolls.filter((x) => x.seen).map((x) => ({ title: `${x.question} → ${x.chosen}`, probability: x.options.find((y) => y.label === x.chosen)?.probability ?? 0, estimated: true, basis: x.external ? tx(wid, "play.outsideReach") : "", date: x.day })),
      newcomers: kept.newcomers,
      metrics: { before: {}, after: {} },
    };
    const chosen: ChosenAction = { input, restatement: m.words, settings: [], rejected: [], asked: [], settlement, notices: said, calls: r.rounds, stopReason: "" };
    db().update(decisions).set({ chosen, restatement: m.words, move: told }).where(eq(decisions.id, dec.id)).run();
    r.close("moment");
    const result: StepResult = { events: [], metrics: settlement.metrics, reports: [], ended: endOf(getBranch(branchId).state), situation: kept.situation, restatement: m.words, stopReason: "", calls: r.rounds, warnings: publicNotices(said, wid), settlement };
    if (kept.ended) {
      say(tx(wid, "play.writingReview"));
      db().update(sessions).set({ status: "ended" }).where(eq(sessions.id, b.sessionId)).run();
      const rep = await narrateReport(branchId, "final").catch((err: unknown) => {
        const state = structuredClone(getBranch(branchId).state);
        state.notices = saidOnce([...(state.notices ?? []), notice("review", err instanceof Error ? err.message : String(err))]);
        updateBranch(branchId, { state });
        return null;
      });
      if (rep) result.reports = [{ id: rep.id, kind: "final", title: rep.title }];
    }
    const state = structuredClone(getBranch(branchId).state);
    (state.performance ??= []).push(recordPerformance(branchId, b.step, startedAt, Date.now() - clock));
    updateBranch(branchId, { state });
    saveSnapshot(branchId);
    return result;
  });
}

// ---------------------------------------------------------------- beside the story

/** A question asked beside the story (not a move): answered from the play as it stands; the story does not move. */
export async function askNarrate(branchId: string, question: string): Promise<Ask> {
  const b = getBranch(branchId);
  const wid = worldIdOf(branchId)!;
  const dec = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, b.step))).get();
  if (!dec) throw new Error("There is no stop waiting for a decision");
  const used = emptyUsed();
  const call = { role: "advisor" as const, purpose: "narrate_answer", worldId: wid, branchId };
  const r = await narrate({
    ctx: call,
    system: `${SYSTEM}\n\n${languageRule(wid)}`,
    messages: [...playMessages(branchId), { role: "user", content: `${dayHead(b.simTime)} The person only asks, beside the story (the story does not move; answer with <kind>question</kind>):\n${question.trim()}` }],
    // (the same tools as a stop's, in the same order: they are the head of what the provider caches)
    tools: playTools({ ...call, worldId: wid }, used, { round: b.step }, { worldId: wid, branchId, step: b.step, day: b.simTime, carried: [], used }),
    rounds: config().narrate.rounds,
  });
  r.close("advise");
  const answer = tagOf(r.text, "answer") ?? r.text.replace(/<[^>]+>/g, "").trim();
  const ask: Ask = { q: question.trim(), a: answer, views: [], checks: [], at: b.simTime };
  const now = db().select().from(decisions).where(eq(decisions.id, dec.id)).get();
  db().update(decisions).set({ asks: [...((now?.asks as Ask[] | null) ?? []), ask] }).where(eq(decisions.id, dec.id)).run();
  return ask;
}

/**
 * What the person said in the chat box to change something (the world, an assumption, what they are after, how they
 * go about it): kept in their words, and given to the model with their next move, to carry out.
 */
export function noteInstruction(branchId: string, text: string): void {
  const said = text.trim();
  if (!said) return;
  const b = getBranch(branchId);
  if (b.status === "running") throw new Error("This step is already running");
  const state = structuredClone(b.state);
  (state.story!.instructions ??= []).push({ at: b.simTime, text: said, step: null });
  updateBranch(branchId, { state });
}

/** Ends the play by the person's choice: the review is written from the whole story, and nothing more happens on the line. */
export async function endNarrate(branchId: string): Promise<{ reportId: string }> {
  const b = getBranch(branchId);
  if (b.status === "running") throw new Error("This step is already running");
  const wid = worldIdOf(branchId);
  const r = await narrateReport(branchId, "final");
  const cur = getBranch(branchId);
  const state = structuredClone(cur.state);
  endPlayAt(state, cur.simTime, tx(wid, "play.endedByYou"), "you", null, wid);
  updateBranch(branchId, { status: "ended", state });
  db().update(sessions).set({ status: "ended" }).where(eq(sessions.id, b.sessionId)).run();
  return { reportId: r.id };
}

/**
 * A new line from stop `step` of a line: the story up to that stop (its rows of `decisions`, the move made there
 * cleared), the rolls made up to it, the people who came in by then, and the line's state as it stood there; a fold
 * that reaches past it is not taken. A matched fork also takes, to be met again, the rolls the line it came from made
 * after that stop for what was outside the protagonist's reach.
 */
export async function forkNarrate(branchId: string, step: number, mode: "free" | "matched" = "free"): Promise<{ branchId: string; situation: Situation }> {
  const src = getBranch(branchId);
  const snap = db().select().from(snapshots).where(and(eq(snapshots.branchId, branchId), eq(snapshots.step, step))).get();
  const dec = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, step))).get();
  if (!snap || !dec) throw new Error(`No snapshot of step ${step}`);
  const data = snap.data as { state: BranchState; simTime: string; seq: number; rngCounter: number };
  const state = structuredClone(data.state);
  delete state.comparison;
  state.background = [];
  const story = state.story!;
  story.folds = (story.folds ?? []).filter((f) => f.upTo < step);
  // what the person said in the box while at that stop was said before the move there: on the new line it goes with
  // the move made there instead
  const atStop = (src.state.story?.instructions ?? []).filter((x) => x.step === step || (x.step == null && src.step === step));
  story.instructions = [...(story.instructions ?? []).filter((x) => x.step != null && x.step < step), ...atStop.map((x) => ({ ...x, step: null }))];
  delete story.carried;
  if (mode === "matched") {
    if (src.status === "running" || stepRunningHere(branchId)) throw new Error("Wait for the step running on the original timeline to finish");
    if (!src.state.externalHistoryFrom || data.simTime < src.state.externalHistoryFrom || src.step <= step) throw new Error("There is not yet a whole record of outside events after this step to compare with");
    state.comparison = { from: data.simTime, until: src.simTime, parentId: branchId, parentSeq: src.step, step };
    const after = db().select().from(judgments).where(and(eq(judgments.branchId, branchId), eq(judgments.external, true), gt(judgments.step, step))).orderBy(asc(judgments.createdAt)).all();
    story.carried = after.map((j, i) => ({ id: `x${i + 1}`, day: j.simTime ?? "", question: j.question, options: j.options, chosen: j.chosen }));
  }
  const id = newId("br");
  const d = db();
  d.$client.transaction(() => {
    d.insert(branches).values({ id, sessionId: src.sessionId, parentBranchId: branchId, forkStep: step, simTime: data.simTime, step, seq: data.seq, state, rngSeed: randomInt(2 ** 31), rngCounter: 0, status: "awaiting_decision", pendingAction: null, createdAt: nowIso() }).run();
    for (const x of d.select().from(decisions).where(and(eq(decisions.branchId, branchId), lte(decisions.step, step))).all())
      d.insert(decisions).values({ ...x, id: newId("dec"), branchId: id, ...(x.step === step ? { chosen: null, restatement: null, move: null } : {}) }).run();
    for (const j of d.select().from(judgments).where(and(eq(judgments.branchId, branchId), lte(judgments.step, step))).all()) d.insert(judgments).values({ ...j, id: newId("jdg"), branchId: id }).run();
    // whoever came in on the line by that stop is on the new one's roster too
    for (const e of d.select().from(entities).where(eq(entities.branchId, branchId)).all()) if (e.createdAt <= snap.createdAt) d.insert(entities).values({ ...e, id: newId("ent"), branchId: id }).run();
    d.insert(snapshots).values({ branchId: id, step, data: { ...data, state }, createdAt: nowIso() }).run();
  })();
  return { branchId: id, situation: dec.situation as Situation };
}
