import type { BranchState, Item } from "../db/schema.js";
import { newId } from "../util.js";
import { tx } from "../language.js";
import { change, ENDED, find, view, WORLD } from "./items.js";

/**
 * A relation between two parties is an item like any other (a link from its owner to the other party: kept by the
 * engines before engine 12, still read), and so is whether the play is over (`ended`), which the program writes once
 * when the story cannot go on or the person ends it.
 */

export type Relation = { id: string; fromId: string; toId: string; label: string; validFrom: string | null; validTo: string | null; simulated: boolean };

export function relationsAt(state: BranchState, at: string, viewer: string | null): Relation[] {
  return view(state, null, { viewer, at }).flatMap((i) =>
    i.value.type === "link" ? [{ id: i.id, fromId: i.owner, toId: i.value.to, label: i.value.label, validFrom: i.since, validTo: i.until, simulated: i.setBy !== "build" }] : [],
  );
}
/** The play is over: written once, by the program, when whoever rules says so or the person ends it. */
export function endPlayAt(state: BranchState, at: string, reason: string, by: Item["setBy"], eventId: string | null = null, worldId: string | null = null) {
  if (endOf(state)) return;
  change(state, null, [{ whose: WORLD, what: ENDED, to: true, why: reason, known: "public", details: { label: tx(worldId, "play.over"), basis: reason } }], { operation: newId("end"), at, by, reason, eventId });
}
/** Whether the play is over, and how: read off the one item that says so, whoever wrote it. */
export function endOf(state: BranchState): { reason: string; at: string } | null {
  const i = find(state, WORLD, ENDED);
  if (i?.value.type !== "flag" || !i.value.on) return null;
  // (why it ended is why the item was last changed, whoever changed it)
  return { reason: [...(state.changes ?? [])].reverse().find((c) => c.itemId === i.id)?.why ?? "", at: i.touched ?? i.since };
}
