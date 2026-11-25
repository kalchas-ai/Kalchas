import type { BranchState, Change } from "../db/schema.js";
import { history, view, WORLD } from "./items.js";

/**
 * The protagonist's own numbers, as the page's board shows them: the number items they own that are marked for it.
 * Nothing here is a kind of item of its own; these are ways of reading the items.
 */

/** A number a world opens with: what it is called, its unit, and where it has one the value below which the matter cannot go on. */
export type MetricDef = { key: string; label: string; unit: string; description?: string; criticalBelow?: number | null };
export type MetricEntry = { id: string; operation: string; at: string; eventId: string | null; key: string; from: number; to: number; delta: number; why: string; unit: string };

const seat = (state: BranchState) => state.seatId ?? WORLD;
function board(state: BranchState, at?: string) {
  const owner = seat(state);
  return view(state, null, { owner, viewer: owner, at }).filter((i) => i.headline && i.value.type === "number");
}
export function metricValues(state: BranchState, at?: string): Record<string, number> {
  return Object.fromEntries(board(state, at).flatMap((i) => (i.value.type === "number" ? [[i.key, i.value.n]] : [])));
}
export function metricDefinitions(state: BranchState): MetricDef[] {
  return board(state).flatMap((i) => (i.value.type === "number" ? [{ key: i.key, label: i.label, unit: i.value.unit, description: i.basis ?? "", criticalBelow: i.floor?.below ?? null }] : []));
}
export function metricEntries(state: BranchState, changes?: Change[]): MetricEntry[] {
  return history(state, changes).flatMap(({ item, change: c }) =>
    item.owner === seat(state) && item.headline && c.from?.type === "number" && c.to?.type === "number"
      ? [{ id: c.id, operation: c.operation, at: c.at, eventId: c.eventId, key: item.key, from: c.from.n, to: c.to.n, delta: c.to.n - c.from.n, why: c.why, unit: c.to.unit }]
      : [],
  );
}
