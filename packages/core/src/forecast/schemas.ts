import { z } from "zod";
import { InsightSchema } from "./insight.js";
import { SetupSchema } from "../world/setup.js";

// Same conventions as the world schemas: no optional fields, no numeric bounds. What may rightly be empty (a unit,
// options, follow-ups) has its empty value as its default, so that leaving it out does not fail the whole answer.

const KIND = z.enum(["one", "many", "number", "text"]).describe("How it is answered: one = pick one; many = pick several (parallel cases, several of which can hold at once); number = fill in a number (an amount, a count, a number of years); text = write a short answer (a name, a place and the like that only they know)");
const OPTIONS = "one, many: as many specific, mutually exclusive common answers as needed (list specific types, stages or ranges, not generalities), including \"not sure\" when needed, and for many \"none of these\" when needed; number: as many common values as needed, digits only, for their reference; text: as many common ways of writing it as needed, for them to tap";
// (the Chinese examples, escaped: ten thousand yuan, yuan a month, months)
const UNIT = "For number, required: the unit the number they type is counted in, exactly as they would read it, written in the language they wrote in (for someone writing in Chinese: \u4e07\u5143, \u5143/\u6708, \u4e2a\u6708; never an English gloss of it), matching the options; the answer is a bare number and means nothing without it. null for the other kinds";

const FollowUp = z.object({
  on: z.array(z.string()).describe("Asked only when they chose any one of these options (copy the option text exactly)"),
  q: z.string().describe("One question to ask next, ≤30 CJK characters / ≤15 words"),
  why: z.string().describe("One sentence on what this answer would change"),
  kind: KIND,
  unit: z.string().nullable().default(null).describe(UNIT),
  options: z.array(z.string()).default([]).describe(OPTIONS),
});

const Question = z.object({
  about: z.enum(["purpose", "premise", "situation"]).describe("What this question is clearing up: purpose (such as the standard of success they stated), premise (whether something they take for granted holds), situation (their specific circumstances)"),
  q: z.string().describe("One question, ≤30 CJK characters / ≤15 words: ask one thing only, never put two questions together"),
  why: z.string().describe("One sentence on what the answer to this question would change"),
  kind: KIND,
  unit: z.string().nullable().default(null).describe(UNIT),
  options: z.array(z.string()).default([]).describe(OPTIONS),
  follow: z.array(FollowUp).default([]).describe("Follow-up questions that need asking only after they chose certain answers, as many as needed (there may be none) (only for one and many); an empty array when there are none"),
});
export type QuestionOut = z.infer<typeof Question>;

/** How closely the world can be watched: asked once the questions are answered, by a call of its own (see paceForecast). */
export const PaceSchema = z.object({
  q: z.string().describe("The question, in the terms of this very world: how closely they want to watch it. ≤30 CJK characters / ≤15 words"),
  until: z.string().nullable().default(null).describe("When they named a span of time (\"the next year\", \"the first two years\", \"six months\"): the day that span has passed, counted from the start, YYYY-MM-DD. null when they named none"),
  settled: z.string().default("").describe("Only when they named no span: what settles the matter one way or the other, said as the event and with no day (\"the verdict given, or the case dropped\"; \"the city taken, or the siege lifted\"). Empty when they named a span: what happens after the first question in it is answered is part of what they asked to see"),
  options: z
    .array(
      z.object({
        name: z.string().describe("A few words naming this way of watching, in this world's own terms; never a length of time"),
        step: z.string().describe("In one or two sentences, what is weighty enough for the play to stop at, at this pace, said by the kind of event and shown with examples from this very matter (\"each exchange: the franchisees' spokesman asking how the subsidy is counted is one\", \"only the turns: the day the queue forms, the day the papers pick it up\"); and then that whatever is lighter than that is carried out along the line they set at their last stop, said in this world's terms. Never said as a length of time (not \"a week a step\", not \"month by month\")"),
        steps: z.number().describe("Your honest estimate of how many stops the main line of this matter takes at this pace, from its start to where its main line would naturally be over: the things of this way's weight it really holds, not a share of the days it lasts. It is shown to them as a guide, never a target the play keeps to"),
      }),
    )
    .describe("The ways of watching this world that are really different for it, from the closest to the widest: between two and five"),
});

export const ClarifySchema = z.object({
  setup: SetupSchema.describe("First read out the setup of the play: the world, the premises, who is played, the starting point, the goal"),
  insight: InsightSchema.describe("Then write your understanding of the matter, and ask the questions from it"),
  decision: z.string().describe("The project's name: the very thing they mean to do, one phrase, ≤16 CJK characters / ≤8 words, e.g. \"quit to do an MBA\", \"tell my parents I am leaving medical school\"; write only the thing itself, not a question, \"whether\", a problem, information or preparatory work"),
  basis: z
    .array(z.object({ rule: z.string().describe("One thing it turns on: a rule, a formula, a condition of judgment, or how someone in it stands, ≤30 CJK characters / ≤15 words"), needs: z.string().describe("What of their situation has to be known to use it, ≤20 CJK characters / ≤10 words; an empty string when everything can be found on the web") }))
    .describe("Think this through before asking: what this matter turns on inside the span they asked to see, as many as needed and of whatever kind they are (a rule or a sum; a person and what they hold to; a condition of body, place or season). Not what bears only after that span"),
  uses: z
    .array(
      z.object({
        what: z.string().describe("One thing of theirs that this matter will use inside the span they asked to see, ≤20 CJK characters / ≤12 words"),
        said: z.string().describe("Their own words that give it, copied from what they wrote; an empty string when they have not said it"),
      }),
    )
    .describe("Think this through before asking, too: what of theirs THIS MATTER will use inside the span they asked to see and no further: the thing itself as it now stands, how far along it is (who is already using, trying, waiting on or committed to it, where any dealing already begun stands), the money that is for it, the time they have for it, and the trade, standing or skill of theirs it rests on. Not the people around them in it (they are drawn by the world), and nothing of their life outside the matter. Empty when they play someone else or something generated, and when the matter uses nothing of their own"),
  questions: z.array(Question).describe("All the questions to ask them before the world is built, written in one go and in the order they are to be asked (there is no asking again afterwards): only what, guessed wrong, would make it a different matter: what exactly the thing is (and where, when that changes the rules), how far along it is, and what of their own the play will turn on (the money and the time for it, the trade or skill it rests on), as far as each is decisive and not yet said; as many as needed (usually three to five), no padding; what is not decisive is not asked (the world takes the common case and says so), nor the people around them in it (the world draws them), nor what they have already said"),
});
