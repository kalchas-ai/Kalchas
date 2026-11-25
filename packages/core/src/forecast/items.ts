/**
 * What a world's build looked up before its play, and why, as an engine before engine 12 listed it and kept it on the
 * project (`forecasts.lookups`, still read by the page of a project). Engine 12 lists nothing beforehand: what its one
 * call looked up is shown as one lookup (see `forecastView`).
 */

export const LOOKUP_FOR = ["party", "rule", "calendar", "history", "hinge", "other"] as const;
export type LookupFor = (typeof LOOKUP_FOR)[number];

/** Where a lookup stands: still being searched, answered (the model said so), or closed without an answer. */
export const LOOKUP_STATES = ["open", "answered", "unanswered"] as const;
export type LookupState = (typeof LOOKUP_STATES)[number];

/** One thing a build sets out to find, and how that went. */
export type LookupItem = {
  /** q1, q2…: how the prompts and the facts refer to it. */
  id: string;
  for: LookupFor;
  /** Whom it is about: a party by its name in the world, `protagonist`, or `world`. */
  about: string;
  what: string;
  /** What would count as enough, as the model said before searching. */
  enough: string;
  /** For a hinge item: the value as the model believed it before it was checked. */
  believed: string | null;
  state: LookupState;
  /** What the reader of its pages said when it last read them: what was established, or what is still missing. */
  note: string;
  /** How many rounds of searching it has had. */
  rounds: number;
};
