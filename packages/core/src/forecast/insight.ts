import { z } from "zod";
import type { ClarifyItem } from "../db/schema.js";

/**
 * How the matter the person named is understood, before any question is asked: the thing itself in a phrase, and what
 * they take for granted that may not hold. It is understood in their own words: nothing is guessed about what they are "really after", their way is not
 * judged against others, and what they set as a premise of the play is given, not something to test. The questions
 * then go where this understanding has gaps: no fixed set, and none at all where nothing is unclear.
 */

export const InsightSchema = z.object({
  language: z.string().describe("The language the person wrote in, as a BCP-47 tag: zh-Hans, zh-Hant, ja, ko, es, fr, de … Where the language is written differently from country to country, the tag says which country's usage: the one of the place the matter is set in, or, when that says nothing, the one their own spelling shows (en-US for a matter in the United States, en-GB, en-AU, pt-BR, es-MX …)"),
  said: z.string().describe("What they said, cut down to one phrase, ≤16 CJK characters / ≤8 words, e.g. \"quit to do an MBA\"; do not write \"the user says\""),
  premises: z
    .array(z.object({ text: z.string().describe("Something about the real world that they take for granted and that may not hold (never a premise they set for the play: those are given), ≤20 CJK characters / ≤10 words"), why: z.string().describe("Why it is worth testing, one sentence") }))
    .describe("What they take for granted about the real world that may not hold and that would change how it goes, as many as there are; an empty array when there are none"),
  understood: z.string().describe("One sentence said directly to them, opening with \"You want\", ≤45 CJK characters / ≤22 words, saying the matter as they put it, e.g. \"You want to quit next spring and do a one-year MBA abroad\"; add nothing they did not say; do not write \"the user\""),
});
export type InsightOut = z.infer<typeof InsightSchema>;

/** Kept on the project: the understanding, and a correction the person gave to it. */
export type Insight = InsightOut & { correction?: string };

/**
 * The answers given before the world is built, one line each; a follow-up says what it follows on from. A number is shown
 * with the unit it was asked in: typed as a bare number ("30"), it is otherwise read as anything from 30 yuan to
 * 300,000.
 */
export function answeredLines(clarify: ClarifyItem[]): string[] {
  return clarify
    .filter((c) => c.answer)
    .map((c) => {
      const answer = c.kind === "number" && c.unit ? `${c.answer} (unit: ${c.unit})` : c.answer;
      return c.parent ? `${c.q} (asked after "${c.parent}"): ${answer}` : `${c.q}: ${answer}`;
    });
}

/** The understanding as the prompts see it. */
export function insightText(i: Insight | null | undefined): string {
  if (!i) return "";
  const lines = [`How their words were understood: ${i.understood}`];
  if (i.premises.length) lines.push(`What they take for granted about the real world, which may not hold (the world goes by what is so): ${i.premises.map((p) => p.text).join("; ")}`);
  if (i.correction) lines.push(`Their correction to that understanding (it is the authority): ${i.correction}`);
  return lines.join("\n");
}
