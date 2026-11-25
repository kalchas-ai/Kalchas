import { localeOf, tx } from "../language.js";
import { nowIso } from "../util.js";

/**
 * Where a project stands in time. There is one kind of project: a thing on your mind, at a moment. Most stand at
 * today (a decision ahead); some at a day in the past that really happened, in someone's place, to be walked again
 * from there. The moment decides only three things: what the world is built as of, whose place you take in it, and
 * what the end is compared with (the real history after it, when there is one). Everything else — understanding you,
 * the build, the play — is the same.
 */

export type Moment = {
  /** YYYY-MM-DD: the day the project stands at. */
  at: string;
  /** A day that has passed (a moment that really happened), not today. */
  past: boolean;
  /** Whose place you stand in; null is your own. */
  seat: string | null;
  /** YYYY-MM-DD: how far on it looks (null: decided when a world is built). */
  horizon: string | null;
};

export const today = () => nowIso().slice(0, 10);

/** A project's moment: past when it stands at a day before the one it was made on. */
export function momentOf(f: { asOf: string; seat?: string | null; horizon?: string | null; createdAt: string }): Moment {
  return { at: f.asOf, past: f.asOf < f.createdAt.slice(0, 10), seat: f.seat ?? null, horizon: f.horizon ?? null };
}

/** What the person said about the moment themselves (on the home page), which outweighs any reading of it. */
export type MomentHint = "today" | "past";

/** The moment as every prompt sees it. */
export function momentText(m: Moment): string {
  if (!m.past) return m.at > today() ? `The play starts in the future, on ${m.at} (today in reality is ${today()}); the future setting is conjecture and is not taken as fact that has happened.` : `Today is ${m.at}.`;
  return [
    `They stand at a real moment in the past: ${m.at}${m.seat ? `, in the place of ${m.seat}` : ""} (the real today is ${today()}).`,
    `Every judgment goes by the day ${m.at}: "has happened", "scheduled" and "future" are all relative to that day; the decision they have to make is the one ${m.seat ?? "that person"} faced then.`,
    `What really happened after this moment may be looked up too; write the dates clearly, for comparison in the review.`,
  ].join("\n");
}

/** A short name for the moment, for people, in the project's language: "Today", or "September 8, 2008". */
export function momentLabel(m: Moment, worldId?: string | null): string {
  if (!m.past && m.at <= today()) return tx(worldId, "moment.today");
  return new Intl.DateTimeFormat(localeOf(worldId), { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${m.at}T00:00:00Z`));
}
