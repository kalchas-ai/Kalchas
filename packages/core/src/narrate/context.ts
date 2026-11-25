import { and, asc, eq, lte } from "drizzle-orm";
import type { ModelMessage } from "ai";
import { db } from "../db/client.js";
import { decisions, forecasts, worlds, type Milestone, type StoryState, type WorldNotes } from "../db/schema.js";
import { answeredLines, insightText } from "../forecast/insight.js";
import { dated } from "../sim/days.js";
import { getBranch } from "../sim/world.js";
import { setupText, type Setup } from "../world/setup.js";

/**
 * What the one model reads at every call of a play: one conversation from the world's setting up to the stop now
 * being written, put together by the program from the database the same way every time, so that all of it but the
 * newest part is the same as the call before and is read from the provider's cache. In order: the setting up as it
 * happened (the request with the person's own part, and everything the model wrote, looked up and was given back),
 * the turn asking for the opening stop, then, stop by stop, the stop's whole exchange as it happened and the move the
 * person made there (with its day), and last the move now made. Nothing of it is condensed while it fits: only when
 * a long play comes near the model's context window are its earlier stops folded, a segment at a time, into the story
 * so far, which then opens the play in their place.
 */

const NONE = "(none)";

/** The pace as the model is given it. */
export function paceLine(setup: Setup | null | undefined): string {
  const p = setup?.pace;
  if (!p) return "Not chosen: stop wherever someone in their place would want to decide for themselves.";
  return `${p.name}${p.step ? `: ${p.step}` : ""}`;
}

/**
 * The person's own part of the play, from the project as it stands: what they typed, how it was understood, the
 * setup, their answers, and (unless `pace` is false: the setting up comes before it is chosen) the pace.
 */
export function headOf(worldId: string, o: { pace?: boolean } = {}): string {
  const f = db().select().from(forecasts).where(eq(forecasts.id, worldId)).get();
  if (!f) throw new Error(`No such project: ${worldId}`);
  const answers = answeredLines(f.clarify);
  return [
    `[What the person typed]\n${f.question}`,
    insightText(f.insight),
    setupText(f.setup),
    `[What they answered before the play]\n${answers.map((a) => `- ${a}`).join("\n") || NONE}`,
    o.pace === false ? "" : `[How closely they watch: the pace]\n${paceLine(f.setup)}`,
    f.setup?.paceAsk?.ends ? `[Where what they asked to see is over]\n${f.setup.paceAsk.ends} (the play does not end there: it goes on while the story can)` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The main questions, numbered as the stops name them. */
export const questionsText = (questions: string[]) => `[The main questions of what they asked to see (milestones), numbered]\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n") || NONE}`;

/** The main questions with where each stands, for a fold. */
export const milestonesText = (list: Milestone[]) =>
  `[The main questions of what they asked to see (milestones), and where each stands]\n${list.map((m, i) => `${i + 1}. ${m.question}${m.reached ? ` (settled ${m.reached.at}: ${m.reached.came ? "it came about" : "it failed"})` : " (open)"}`).join("\n") || NONE}`;

/** The day as each turn of the person's opens: the day with its day of the week, which the program says. */
export const dayHead = (day: string) => `[${dated(day)}]`;

/** The turn asking for the opening stop, after the setting up: the day, the pace they chose, the main questions numbered. */
export const beginTurn = (day: string, pace: string, questions: string[]) =>
  `${dayHead(day)} The play opens today, on the day the matter itself begins.\n\n[How closely they watch: the pace]\n${pace}\n\n${questionsText(questions)}\n\nWrite the opening stop.`;

/** The setting up's request: the person's own part, the opening day, whom they play, and what is asked. */
export const settingUpTurn = (head: string, day: string, moment: string, hero: string, ask: string) => `${head}\n\n[The opening day] ${dated(day)}. ${moment}\n[Whom the person plays] ${hero}\n\n${ask}`;

type Row = typeof decisions.$inferSelect;

/** The stops of a line up to `step`, in order. */
export const stopsOf = (branchId: string, step: number): Row[] =>
  db().select().from(decisions).where(and(eq(decisions.branchId, branchId), lte(decisions.step, step))).orderBy(asc(decisions.step)).all();

/** A stop's exchange as the history gives it (one kept before whole exchanges were: what it wrote). */
const exchangeOf = (r: Row): ModelMessage[] => (r.exchange?.length ? (r.exchange as ModelMessage[]) : [{ role: "assistant", content: r.story || "(nothing was written)" }]);

/** The world's setting up as every play on it opens with it (a play begun before it was kept: its notes, as given then). */
function settingUp(notes: WorldNotes | null | undefined, story: StoryState): ModelMessage[] {
  if (notes?.exchange?.length && story.begin) return [...(notes.exchange as ModelMessage[]), { role: "user", content: story.begin }];
  return [{ role: "user", content: `${story.head}\n\n${story.world ?? ""}\n\n${dayHead(story.opened)} The play opens today, on the day the matter itself begins. Write the opening stop.` }];
}

/**
 * The play as the next call reads it, up to the stop the line now waits at: the setting up and the turn asking for the
 * opening (or the last fold in place of what it folds), and every stop since, whole, with the move made there; the move
 * now made is the caller's to add. `cut`: read as of an earlier stop (the stop itself included, its move not).
 */
export function playMessages(branchId: string, cut?: number): ModelMessage[] {
  const b = getBranch(branchId);
  const story = b.state.story;
  if (!story) throw new Error("This play is not written by one model (engine 12)");
  const at = cut ?? b.step;
  const rows = stopsOf(branchId, at);
  const fold = [...(story.folds ?? [])].reverse().find((f) => f.upTo < at);
  const messages: ModelMessage[] = [];
  if (fold) {
    const last = rows.find((r) => r.step === fold.upTo);
    messages.push({ role: "user", content: `${story.head}\n\n[The story so far, up to the stop of ${last ? dated(last.simTime) : "an earlier day"}]\n${fold.text}\n\n[The notes as they stood there]\n${fold.notes || NONE}\n\n${fold.milestones}\n\n${last?.move ?? `${dayHead(last?.simTime ?? story.opened)} Go on from there.`}` });
  } else {
    const notes = db().select({ notes: worlds.notes }).from(worlds).where(eq(worlds.id, worldOf(b.sessionId))).get()?.notes;
    messages.push(...settingUp(notes, story));
  }
  for (const r of rows) {
    if (fold && r.step <= fold.upTo) continue;
    messages.push(...exchangeOf(r));
    if (r.step < at && r.move) messages.push({ role: "user", content: r.move });
  }
  return messages;
}

/** The world a line's session plays on. */
function worldOf(sessionId: string): string {
  const row = db().$client.prepare("SELECT world_id FROM sessions WHERE id = ?").get(sessionId) as { world_id: string } | undefined;
  if (!row) throw new Error("No such play");
  return row.world_id;
}

/**
 * The whole story of a line as plain text, unfolded, for a call that reads it at once (the review, a comparison): the
 * person's part, what the setting up wrote, then each stop as the model wrote it with the move made there.
 */
export function storyText(branchId: string): string {
  const b = getBranch(branchId);
  const story = b.state.story;
  if (!story) throw new Error("This play is not written by one model (engine 12)");
  const notes = db().select({ notes: worlds.notes }).from(worlds).where(eq(worlds.id, worldOf(b.sessionId))).get()?.notes;
  const rows = stopsOf(branchId, b.step);
  return [
    story.head,
    notes?.text ? `[The world's setting up]\n${notes.text}` : (story.world ?? ""),
    ...rows.flatMap((r) => [`[Stop ${r.step}, ${dated(r.simTime)}]\n${r.story ?? ""}`, r.move ? `[What the person did at stop ${r.step}]\n${r.move}` : ""]),
  ]
    .filter(Boolean)
    .join("\n\n");
}
