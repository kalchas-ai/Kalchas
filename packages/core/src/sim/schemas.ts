import { z } from "zod";
import type { MilestoneCard } from "../db/schema.js";

/**
 * What a play shows the person and keeps of each stop (the same shapes for a stop of an engine before engine 12, which
 * are still read), what a stop being written shows while it is, and the review.
 */

/** What the person sees and decides in: the moment as written, and the ways open from it. */
/** (`body` and `blocks` are never set any more: names kept only because the design page of the flow, which is not to be touched, still reads them.) */
/** (`passed`, `stop` and `thread`: what whoever directed set down of the stretch up to this moment, of what it stops on and of the thread that belongs to; kept so that later steps are given the play so far in brief.) */
/** (`messages`: the new mail, messages, notices and calls that reached the protagonist in the stretch, shown with the stop as a list; a moment written before they were kept has none.) */
/** (`happened`: engine 12, what each side did in the stretch as the protagonist could see it or come to know it, in order; a stop written before it was kept has none.) */
/** (`milestones`: the main questions of what they asked to see that were settled in the stretch up to this stop, each with the day, whether it came about, and the card written for it, shown one at a time once the stop is read; the play goes on after them.) */
export type Situation = { headline: string; scene: string; why: string; day: string; recommendations: { id: string; title: string; detail: string }[]; passed?: { day: string; what: string }[]; stop?: string; thread?: string; messages?: Message[]; happened?: Happening[]; milestones?: MilestoneShown[]; body?: string; blocks?: { title: string; content: string }[] };
/** A milestone reached, as a stop shows it: its question, the day, whether it came about, and its card. */
export type MilestoneShown = { question: string; day: string; came: boolean; card: MilestoneCard };

/** A message that reached the protagonist in a stretch: who it is from, the day, what it says. */
export type Message = { from: string; day: string; gist: string };
/** Engine 12: something one side did in a stretch, as the protagonist could see it or come to know it: the day, who (a name as the notes have it), what they did. */
export type Happening = { day: string; who: string; what: string };
/** Engine 12: a roll whose outcome the protagonist can see: what was rolled, how it fell, and whom it was about (a name as the notes have it), when it was about anyone. */
export type SeenRoll = { question: string; chosen: string; about: string | null };
/** Engine 12: what a stop being written has shown so far besides its scene (rolls the protagonist cannot see are never in it). */
export type StopLive = { happened: Happening[]; rolls: SeenRoll[] };
/** What the person reads and chooses from: written as soon as the stop is, so that it is before them while its record is set down. */
export type Shown = { day: string; headline: string; options: { title: string; detail: string }[] };

export const ReportSchema = z.object({
  health: z.unknown().optional().describe("Not yours to fill: the program attaches it"),
  title: z.string(),
  verdict: z.string().describe("An overall verdict, one paragraph"),
  comparison: z.object({ yourWorld: z.string(), history: z.string(), divergence: z.string() }),
  blindSpots: z.array(z.object({ factId: z.string(), whatYouMissed: z.string(), whenAvailable: z.string(), howToGet: z.string(), consequence: z.string() })).default([]),
  decisions: z.array(z.object({ step: z.number(), assessment: z.string(), category: z.enum(["blind_spot", "reasoning_error", "luck", "sound_decision"]), lesson: z.string() })).default([]),
  causalChains: z.array(z.object({ title: z.string(), chain: z.array(z.string()) })).default([]),
  lessons: z
    .array(
      z.object({
        text: z.string().describe("The lesson, specific enough to follow"),
        step: z.number().int().nullable().describe("The number of the decision it was learned at; null when it is of the play as a whole"),
      }),
    )
    .describe("What carries over: ways of doing things learned in this play that would serve elsewhere"),
  retry: z
    .array(
      z.object({
        step: z.number().int().describe("The number of a decision in this play"),
        instead: z.string().describe("What to do differently there, concrete enough to carry out"),
        why: z.string().describe("What doing so would test: what it would show about how the matter works"),
      }),
    )
    .describe("The steps most worth going back to, to start a new line from there: each with what to do differently and what that would test; only steps that exist in this play"),
  pitfalls: z.array(z.object({ text: z.string().describe("The pit fallen into"), basis: z.string().describe("How people like them commonly fall into it in reality, and what it costs") })).default([]).describe("Empty when none"),
  luck: z.array(z.object({ what: z.string(), odds: z.string().describe("The chance it had"), effect: z.string().describe("How it changed the course") })).default([]).describe("Where luck played a part (what was rolled), told apart from what the decisions did"),
  place: z.string().describe("Where the result of this play sits among the results of matters of its kind, in terms of how such things usually come out; where you know of no comparable figures, say so plainly, and never draw a rank from one play"),
  reveals: z.array(z.object({ who: z.string(), truth: z.string().describe("What they were really after, or what was kept from the protagonist; for a body that decided something put to it, how it was argued inside (who said what, where it turned) and what its answer really rested on"), signals: z.string().describe("Where the signs were at the time (for a body, what of it showed outside), and at which step it could have been seen through"), check: z.string().describe("How to check for the like in reality") })).default([]).describe("Empty when none"),
  nextSteps: z.array(z.string()).default([]).describe("Brought down to reality: things they could do tomorrow, specific enough to follow; may be empty when the one played is not themselves"),
  assumptions: z.array(z.string()).default([]).describe("What they relied on in the play that needs checking in reality"),
  practice: z.array(z.string()).default([]).describe("The weak points their talks with others showed up, and what to prepare; empty when there were none"),
});
export type Report = z.infer<typeof ReportSchema>;
