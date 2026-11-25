import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { decisions } from "../db/schema.js";
import { runChat, type ChatEvent, type ChatRun, type ChatStep, type ChatTurn } from "../chat/agent.js";
import { nowIso, truncate } from "../util.js";
import { atomicStep } from "./checkpoint.js";
import { dated } from "./days.js";
import { getBranch, madeEarlier, saveSnapshot, worldIdOf } from "./world.js";
import { isNarrated, noteInstruction } from "../narrate/play.js";
import { milestonesText } from "../narrate/context.js";
import { notesText } from "../narrate/notes.js";
import { knownNotes } from "./ledger.js";
import { seenStops, seenStopText } from "../facts/query.js";
import { tx } from "../language.js";

/** A question asked at one step of a play, and the adviser's answer. */
export type Ask = {
  q: string;
  a: string;
  views: { who: string; likely: string }[];
  checks: { title: string; action: string }[];
  at: string;
  /** (Set on a question an earlier engine took from the decision box and answered instead of moving.) */
  redirected?: boolean;
  /** What the adviser looked up before answering. */
  steps?: ChatStep[];
};

/**
 * The adviser in a play: the chat box under it. Inside the world it knows only what the protagonist knows (never the
 * whole truth); outside it, it may look at the web. Asking moves no clock and nobody in the world learns of it; what
 * the person asks to change is passed on, in their words, to be carried into the story with their next move. A line
 * made by an engine before engine 12 has no chat box any more.
 */
export async function adviseBranch(branchId: string, question: string, emit?: (e: ChatEvent) => void): Promise<Ask> {
  if (!isNarrated(getBranch(branchId).state)) throw madeEarlier(worldIdOf(branchId));
  return atomicStep(branchId, async () => {
    const result = await adviseNarrated(branchId, question, emit);
    saveSnapshot(branchId);
    return result;
  });
}

const NONE = "(none)";

/** The chat box under an engine-12 play: what it may say, and the one way it passes on a change. */
const BRIEF_NARRATED = `You are the chat box under a play. You are given only what the protagonist knows right now: their own part of the play, the notes on their side, the story as they lived it, and the moment they are in.
- Answer about things in the play from what the protagonist knows and nothing else. What goes on behind the scenes (who is deceiving them, what anyone is really after, consequences that have not shown yet, what will happen) is never told and never hinted at, and you neither confirm nor deny that there is anything hidden: when asked, say that this is theirs to find out. You may, like a friend who knows the field, point out the warning signs common to this kind of thing in reality and how one might check.
- Asked how others would react, reason from each party's position and interests as the protagonist knows them, and say that it is your reasoning.
- The real world may be looked up on the web (market conditions, rules, like cases, how the trade does things). What you find that happened only after the date of the play is what came later in reality, and does not mean this play will go that way: say so.
- Do not decide for the protagonist. When something is worth doing or checking first, use suggest_moves to offer ways that can be written straight into an action.
- The earlier stops of the story are given in brief; earlier_stops gives any of them back whole.
Only when the protagonist plainly asks to change something, pass it on with record_instruction, in their own words and figures, adding no condition they did not state: the world itself ("a financial crisis breaks out this year", "suppose I won the lottery"), what they hold to from now on and how time is to run ("bring every investor talk to me, skip the rest", "stop once a month"), what they are after in this play, or something assumed of them at the opening that is not so (with correction set: it puts right the opening, and is not a change of theirs). It is carried into the story with their next move, as they said it, and nothing changes before then: say so. When they are only asking, record nothing.`;

/** How many of the latest stops the chat box is given whole; the ones before, in a line each. */
const WHOLE_STOPS = 4;

/**
 * Engine 12: what the chat box is given of the play: the person's own part of it (what they typed, how it was
 * understood, the setup, their answers, the pace), the notes on the protagonist's side as they now stand, the main
 * questions, the story as the protagonist lived it (the latest stops whole), what they said in this box before, and
 * the stop they are at. Never the hidden side of the notes, a roll out of their sight, or the stops as the model keeps
 * them (those hold both).
 */
export function narratedAdviceContext(branchId: string): string {
  const b = getBranch(branchId);
  const story = b.state.story;
  if (!story) throw new Error("This play is not written by one model (engine 12)");
  const stops = seenStops(branchId);
  const now = stops.find((x) => x.step === b.step);
  const before = stops.filter((x) => x.step < b.step);
  const cut = Math.max(0, before.length - WHOLE_STOPS);
  const said = story.instructions ?? [];
  const sit = now?.situation;
  return [
    `[The person's own part of the play: what they typed, how it was understood, the setup, their answers, the pace]\n${story.head}`,
    `[What the protagonist knows now: the notes on their side (who each person is and what they want and mean to do, the forces in motion, the key figures, the road ahead, what was assumed of them)]\n${notesText(knownNotes(story.notes)) || NONE}`,
    milestonesText(b.state.milestones ?? []),
    `[Date in the play] ${dated(b.simTime)} (today in reality: ${dated(new Date().toISOString().slice(0, 10))})`,
    `[The story so far, as the protagonist lived it]\n${before.map((x, i) => seenStopText(x, i >= cut)).join("\n\n") || NONE}`,
    said.length ? `[What they said in this box to change something]\n${said.map((x) => `- ${dated(x.at)}: ${x.text}${x.step == null ? " (not yet in the story: it goes with their next move)" : ""}`).join("\n")}` : "",
    `[The moment right now] ${now && sit ? `${seenStopText(now, true).replace(/^\[[^\]]*\]\s*/, "")}${sit.recommendations.length ? `\nPaths open: ${sit.recommendations.map((r) => `${r.title} (${r.detail})`).join("; ")}` : ""}` : NONE}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Engine 12: the chat box's own tools: the earlier stops whole, ways to suggest, and passing on a change the person asks for. */
export function narratedAdviceTools(branchId: string, run: ChatRun): ToolSet {
  const wid = worldIdOf(branchId);
  return {
    earlier_stops: tool({
      description: "Read stops of the story so far in full, as the protagonist lived them (the context gives the earlier ones in a line each).",
      inputSchema: z.object({ from: z.number().int().describe("The first stop to read, by its number"), to: z.number().int().optional().describe("The last stop to read; leave out for the same as from") }),
      execute: async ({ from, to }) => {
        const list = seenStops(branchId).filter((x) => x.step >= from && x.step <= (to ?? from));
        return { note: tx(wid, "advise.stops", { count: list.length }), stops: list.map((x) => seenStopText(x, true)).join("\n\n") };
      },
    }),
    record_instruction: tool({
      description: "Only when the protagonist plainly asks to change something (the world, what they hold to or how time is to run, what they are after, something assumed of them at the opening): pass it on in their own words. It is carried into the story with their next move.",
      inputSchema: z.object({ text: z.string().describe("What they want changed, in their own words and figures"), correction: z.boolean().describe("true when it puts right something assumed of them at the opening (not a change of theirs)") }),
      execute: async ({ text, correction }) => {
        if (!text.trim()) return { note: tx(wid, "advise.empty") };
        noteInstruction(branchId, correction ? tx(wid, "advise.correction", { text: text.trim() }) : text.trim());
        return { note: tx(wid, "advise.noted") };
      },
    }),
    suggest_moves: tool({
      description: "Offer things worth doing or checking first, each one sentence that can be written straight into an action; the protagonist can put one into the action box with a click.",
      inputSchema: z.object({ items: z.array(z.object({ title: z.string().describe("A few words"), action: z.string().describe("One sentence that can be carried out as it stands") })) }),
      execute: async ({ items }) => {
        run.extras.checks = items;
        return { note: tx(wid, "advise.suggestions", { count: items.length }) };
      },
    }),
  };
}

/** Engine 12: the chat box under the play answers from what the protagonist knows; the answer is kept with the stop. */
async function adviseNarrated(branchId: string, question: string, emit?: (e: ChatEvent) => void): Promise<Ask> {
  const b = getBranch(branchId);
  const wid = worldIdOf(branchId)!;
  const dec = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, b.step))).get();
  const history: ChatTurn[] = ((dec?.asks as Ask[] | null) ?? []).slice(-6).flatMap((x) => [
    { role: "user" as const, text: x.q },
    { role: "assistant" as const, text: truncate(x.a, 1500) },
  ]);
  let ask: Ask | null = null;
  await runChat(
    {
      ctx: { role: "advisor", purpose: "advise", worldId: wid, branchId },
      brief: BRIEF_NARRATED,
      context: narratedAdviceContext(branchId),
      history,
      tools: (run) => narratedAdviceTools(branchId, run),
      save: (asked, answer, steps, run) => {
        ask = { q: asked, a: answer, views: [], checks: (run.extras.checks as Ask["checks"] | undefined) ?? [], at: nowIso(), ...(steps.length ? { steps } : {}) };
        const now = db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, b.step))).get();
        if (now) db().update(decisions).set({ asks: [...((now.asks as Ask[] | null) ?? []), ask] }).where(eq(decisions.id, now.id)).run();
      },
    },
    question.trim(),
    emit,
  );
  return ask!;
}
