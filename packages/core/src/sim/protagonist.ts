import type { BranchState } from "../db/schema.js";
import { find, WORLD } from "./items.js";

/**
 * What the protagonist was after on a line of an engine before engine 12: an item of theirs like any other they set
 * (a line of engine 12 keeps it in the setup and in what they said in the box beside the story).
 */

/** The key of the item that holds what the protagonist is after. */
const GOAL = "goal";

const seat = (state: BranchState) => state.seatId ?? WORLD;

/** What the protagonist is after now, as they put it; null when they are after nothing in particular. */
export function goalOf(state: BranchState): { text: string; since: string } | null {
  const i = find(state, seat(state), GOAL);
  return i?.value.type === "text" ? { text: i.value.text, since: i.since } : null;
}
