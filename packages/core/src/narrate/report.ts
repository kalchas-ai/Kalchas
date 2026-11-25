import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { judgments, reports } from "../db/schema.js";
import { generate } from "../llm/generate.js";
import { branchHealth } from "../sim/health.js";
import { endOf } from "../sim/relations.js";
import { ReportSchema, type Report } from "../sim/schemas.js";
import { getBranch, worldIdOf } from "../sim/world.js";
import { newId, nowIso } from "../util.js";
import { milestonesText, stopsOf, storyText } from "./context.js";
import { notesText } from "./notes.js";

/**
 * The review of an engine-12 play: the main model reads the whole story once (the opening, every stop as kept, every
 * move, the notes on both sides as they now stand, every roll with its chances, the main questions, what the person
 * changed in the box) and writes the review in the shape every review has, kept with the line.
 */

const REVIEW = `You write the review of a play: a simulated world in which a person tried out a matter of their own, one stop at a time, as the protagonist ("you"). You are given the whole of it: the opening, every stop as it was written, what the person did at each, the notes as they now stand on both sides (what the protagonist knew, and what was hidden from them), every roll with its chances, and the main questions.
Keep two things apart. What they decided is judged from what they knew when they decided: the stops, the messages and the notes' known side as they stood then; nothing hidden from them is held against them. What lay behind the scenes (the notes' hidden side, the rolls, what others were after) is told as what they could not see.
What they asked to see (the thing they said they would do, and the way they said they would do it) is the given of the play, not one of its decisions. What they said in the box beside the story to change something is their own doing; their correcting what was assumed of them at the opening is neither a change of theirs nor a decision. A move where they did not choose for themselves was taken the way they would most naturally have taken it: it is never called their mistake.
- decisions, lessons and retry name only the stops listed, by their number (the stop at which they made the move);
- blindSpots: what really bore on their decisions and could have been found out at the time; factId is the hidden line it rests on, as "kind | name";
- luck: what the rolls really changed, and how likely it had been, said as people say it ("about one chance in three");
- comparison: where the play rests on real history, their line against what really happened; where it started from today, against how things stood and what one could expect at the outset.
Written to them, cool and specific, in the words of their world: no word of how the play works (rolls, odds tables, ids, "the protagonist"). Nothing is told as having happened that the story did not show or keep.`;

export async function narrateReport(branchId: string, kind: "final" | "manual" | "checkpoint" = "final"): Promise<{ id: string; title: string; data: Report }> {
  const b = getBranch(branchId);
  const wid = worldIdOf(branchId)!;
  const story = b.state.story;
  if (!story) throw new Error("This play is not written by one model (engine 12)");
  const steps = new Set(stopsOf(branchId, b.step).filter((d) => d.restatement).map((d) => d.step));
  const rolls = db().select().from(judgments).where(eq(judgments.branchId, branchId)).orderBy(asc(judgments.createdAt)).all();
  const ended = endOf(b.state);
  const said = (story.instructions ?? []).filter((x) => x.step != null);
  const shared = [
    storyText(branchId),
    `[The notes as they now stand, both sides]\n${notesText(story.notes)}`,
    milestonesText(b.state.milestones ?? []),
    `[Every roll, with its chances]\n${rolls.map((j) => `- stop ${j.step ?? "?"}, ${j.simTime}: ${j.question} → ${j.chosen} (${j.options.map((o) => `${o.label} ${Math.round(o.probability * 100)}%`).join(" / ")})${j.external ? ", outside their reach" : ""}${j.seen ? "" : ", out of their sight"}`).join("\n") || "(none)"}`,
    `[What they said in the box beside the story]\n${said.map((x) => `- ${x.at}: ${x.text}`).join("\n") || "(nothing)"}`,
  ].join("\n\n");
  const out = await generate(
    { role: "reporter", purpose: "narrate_report", worldId: wid, branchId },
    {
      schema: ReportSchema.omit({ health: true }),
      temperature: 0.4,
      system: REVIEW,
      shared,
      prompt: `[The day the play has reached] ${b.simTime}${ended ? ` (it ended: ${ended.reason})` : ""}\n[The stops at which they made a move] ${[...steps].join(", ") || "(none)"}\n\nWrite the ${kind === "final" ? "final review" : "review in mid-course"}.`,
    },
  );
  // a step named that the play does not have is left out
  const data: Report = {
    ...out,
    decisions: out.decisions.filter((d) => steps.has(d.step)),
    lessons: out.lessons.map((l) => (l.step != null && !steps.has(l.step) ? { ...l, step: null } : l)),
    retry: out.retry.filter((x) => steps.has(x.step)),
    health: branchHealth(branchId),
  };
  const id = newId("rep");
  db().insert(reports).values({ id, branchId, kind, simTime: b.simTime, title: data.title, data, createdAt: nowIso() }).run();
  return { id, title: data.title, data };
}
