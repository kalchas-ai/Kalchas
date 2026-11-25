import type { Brewing } from "../db/schema.js";
import type { Setup } from "./setup.js";

/** A circle news goes round in: its members by their names in the world (the protagonist under their own name). */
export type Circle = { id: string; name: string; members: string[] };

/** Where a world stands and who is at its centre. */
export type Scope = {
  title: string;
  summary: string;
  protagonist: { name: string; role: string; kind: string; person: boolean };
  timeStart: string;
  /** From a day in the past: the day the matter was settled in real history, to compare with. Null from today: no set end. */
  timeEnd: string | null;
  /** The last day of real history the world holds: from the past, facts after the start up to it are what really happened; from today it is the start. */
  historyEnd: string;
  past: boolean;
  region: string;
  domain: string;
  circles: Circle[];
  /** The names of the people and bodies that really exist (they can be looked up). */
  real: string[];
  /**
   * How the made people of this world are spread in real life (by role, place and time), and how those written so far
   * were placed in that spread: given again whenever someone new is written, so the group keeps matching it.
   */
  people: { spread: string; placing: string };
  setup?: Setup;
  /** Where the protagonist stands in the matter, from what they said: what they already have for it, and who they are for it. */
  standing?: { has: string; is: string };
  /**
   * What the matter needs of the protagonist that they did not say, taken as the common case for someone doing it: a
   * sentence each, said to them as assumed at the opening (they can correct it), never as something they stated.
   */
  assumptions?: string[];
  /** The sides of the matter: what each wants of it, and who of the world (by name) stands on it. */
  sides?: { name: string; stake: string; members: string[] }[];
};

/**
 * One of the protagonist's own numbers, shown on the board, as the builder gave it (its opening value is on the start
 * point): `criticalBelow` is the value below which the matter cannot go on, when the builder said there is one.
 */
export type Metric = { key: string; label: string; unit: string; description: string; criticalBelow: number | null };

/**
 * What a world opens with besides its people and facts: the protagonist's numbers (their opening values are on the
 * start point), what held at the opening as an engine before engine 12 wrote it (its change lines, kept as written;
 * engine 12 writes none: what holds is in its notes), and the road ahead as it looks from the opening.
 */
export type WorldProfile = { metrics: Metric[]; opening: Record<string, unknown>[]; road?: Brewing };
