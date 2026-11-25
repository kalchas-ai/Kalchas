import type { MilestoneCard, NoteEntry } from "../db/schema.js";
import type { Happening, Message } from "../sim/schemas.js";
import { readNotes } from "./notes.js";
import { dayIn, fieldsOf, happenedLine, listLines, messageLine, optionLine, tagOf, tagsOf } from "./tags.js";

/**
 * One stop as the model wrote it, read into the parts the program and the page need. Reading is lenient: a line of
 * notes that is not in the form is kept as a plain note, a day that goes back stays where it was, a day before what it
 * says reached the protagonist or happened moves on to it, a missing headline is the scene's first line, what each side
 * did is none when it is not there; a stop is asked for again only when its scene is missing, or its ways when the
 * story has not ended. What it wrote is kept in the history as it wrote it (its undercurrents with it), never
 * rewritten.
 */

export type StopOut =
  | { kind: "question"; answer: string }
  | {
      kind: "move";
      day: string;
      headline: string;
      /** What each side did in the stretch, as the protagonist saw it or came to know it, in order. */
      happened: Happening[];
      scene: string;
      messages: Message[];
      options: { title: string; detail: string }[];
      patch: NoteEntry[];
      milestones: { question: string; came: boolean; card: MilestoneCard }[];
      ended: string | null;
    };

/** What a stop as written lacks that it cannot do without (it is asked for again, once), or null. */
export function missing(text: string): string | null {
  const kind = tagOf(text, "kind")?.toLowerCase();
  if (kind === "question" || (!kind && tagOf(text, "answer") !== undefined && tagOf(text, "scene") === undefined)) return tagOf(text, "answer")?.trim() ? null : "the <answer>";
  if (!tagOf(text, "scene")?.trim()) return "the <scene>";
  if (!tagOf(text, "ended")?.trim() && !listLines(tagOf(text, "options")).length) return "the <options> (the story has not ended)";
  return null;
}

/**
 * The stop read into its parts, mended where it can be: a day missing or before `notBefore` is `notBefore`; a day
 * before the latest of its messages and of what happened is that day (the stop cannot come before what it tells of); a
 * missing headline is the scene's first line. `problems`: what was mended, for the notices.
 */
export function readStop(text: string, o: { step: number; notBefore: string }): { out: StopOut; problems: string[] } {
  const problems: string[] = [];
  const kind = tagOf(text, "kind")?.toLowerCase();
  const scene = tagOf(text, "scene") ?? "";
  if (kind === "question" || (kind !== "move" && !scene.trim() && tagOf(text, "answer") !== undefined)) return { out: { kind: "question", answer: tagOf(text, "answer") ?? "" }, problems };
  let day = dayIn(tagOf(text, "day")) ?? "";
  if (!day) {
    problems.push(`the stop gave no day: it is kept on ${o.notBefore}`);
    day = o.notBefore;
  } else if (day < o.notBefore) {
    problems.push(`the stop's day ${day} went back before ${o.notBefore}: it is kept on ${o.notBefore}`);
    day = o.notBefore;
  }
  const messages = listLines(tagOf(text, "messages")).map(messageLine);
  const happened = listLines(tagOf(text, "happened")).map(happenedLine).filter((x) => x.what);
  const latest = [...messages, ...happened].map((x) => x.day).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
  if (latest && latest > day) {
    problems.push(`a message or something that happened in the stop is dated ${latest}, after its day ${day}: the stop is kept on ${latest}`);
    day = latest;
  }
  let headline = (tagOf(text, "headline") ?? "").replace(/\s+/g, " ").trim();
  if (!headline) {
    problems.push("the stop gave no headline: its scene's first line stands for it");
    headline = scene.trim().split("\n")[0]!.slice(0, 80);
  }
  const ended = tagOf(text, "ended")?.trim() || null;
  const options = listLines(tagOf(text, "options")).map(optionLine).filter((x) => x.title);
  if (!options.length && !ended) problems.push("the stop left no ways open, and the story has not ended");
  const milestones = tagsOf(text, "milestone").flatMap((body) => {
    const f = fieldsOf(body);
    if (!f.question?.trim()) return [];
    const figures = (f.figures ?? "")
      // (figures are set apart by semicolons, ASCII or full-width, or by lines)
      .split(/[;\uff1b\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        // (a figure is "label = value" or "label: value", the mark ASCII or full-width)
        const at = x.search(/[=\uff1d:\uff1a]/);
        return at < 0 ? { label: x, value: "" } : { label: x.slice(0, at).trim(), value: x.slice(at + 1).trim() };
      });
    // (whether it came about: yes, in English or Chinese, the Chinese escaped: yes, done)
    return [{ question: f.question.trim(), came: /^(yes|true|y|\u662f|\u6210|came)/i.test(f.came?.trim() ?? ""), card: { result: f.result?.trim() || f.turn?.trim() || f.question.trim(), turn: f.turn?.trim() ?? "", figures } }];
  });
  return {
    out: { kind: "move", day, headline, happened, scene: scene.trim(), messages, options, patch: readNotes(tagOf(text, "notes_patch"), o.step, day), milestones, ended },
    problems,
  };
}
