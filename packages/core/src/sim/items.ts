import { createHash } from "node:crypto";
import type { BranchState, Change, Item, Rule, Value } from "../db/schema.js";
import { calendarDistance, daysBetween, newId, normDate } from "../util.js";
import type { WorldBundle } from "./world.js";

/**
 * Everything that held in the world of a play of an engine before engine 12 is an item, and this file is the only way
 * to them: `view` reads them as someone would have seen them, `change` writes (engine 12 keeps its world in notes, and
 * writes one item only: that the play is over, see relations.ts). Nothing here judges or reckons anything: a quantity
 * is what whoever wrote it last said it now is, and time passing moves nothing. A line that cannot be written is an
 * error; a number is kept exactly as it was given, never bounded, rounded or corrected.
 */

export const WORLD = "world";
/** The two keys the program itself reads (see `Item.key`). */
export const IN_PLAY = "in_play";
export const ENDED = "ended";

// Simulation code already holding entity ids can omit the name directory.
type Directory = (Pick<WorldBundle, "index"> & { circles?: WorldBundle["circles"]; id?: string }) | null;

/**
 * The circles someone is in: those the world declared them in (copied into a play's state when it opens, so this
 * holds with no world at hand) and those they were put in on this timeline.
 */
export function inCircles(state: BranchState, world: Directory, id: string): string[] {
  return [...new Set([...(world?.circles ?? []).filter((c) => c.members.includes(id)).map((c) => c.id), ...(state.circles?.[id] ?? [])])];
}
/** Whether something known within circles is known to this viewer: they are in one of them, as things stand now. */
export function knownInCircle(state: BranchState, world: Directory, item: { knownCircles?: string[] }, viewer: string): boolean {
  return !!item.knownCircles?.length && inCircles(state, world, viewer).some((c) => item.knownCircles!.includes(c));
}

type Primitive = string | boolean | number;
type Context = { operation: string; at: string; reason: string; by: Change["by"]; eventId?: string | null };
type Details = Partial<Pick<Item, "ownerKnows" | "period" | "basis" | "until" | "label" | "tag" | "floor" | "headline" | "estimated" | "cause" | "truthKnownBy" | "untilDone" | "intent" | "matter">>;
/** One line of state: what an item now is (`to`), or that it no longer holds (`ends`). Nothing is added to what it was. */
export type ChangeLine = {
  whose: string;
  what: string;
  why: string;
  known: "public" | "involved" | "self";
  to?: Primitive | Value | null;
  ends?: boolean;
  unit?: string | null;
  from?: string | null;
  about?: string[];
  shownAs?: string | null;
  /** What was asked for, as it was handed in: the same request handed in twice takes effect once. */
  request?: unknown;
  itemId?: string;
  knownBy?: string[];
  /** Circles it goes round in (ids); undefined leaves what the item had. */
  knownCircles?: string[];
  /** The truth of it comes out to this viewer; nothing else about it changes. */
  reveal?: string;
  details?: Details;
  evidence?: string[];
  /** For a value read off the calendar (an age): written by the program, never by a model. */
  rule?: Rule;
};

const elapsed = (a: string, b: string) => daysBetween(a, b);
function date(day: string): string {
  if (normDate(day) !== day) throw new Error(`Not a valid date: ${day}`);
  return day;
}
function entity(world: Directory, who: string): string {
  if (who === WORLD) return WORLD;
  if (!world) return who;
  const id = world.index.rows.find((e) => e.id === who)?.id ?? world.index.resolve(who);
  if (!id) throw new Error(`No such entity: ${who}`);
  return id;
}
function active(item: Item, at: string) {
  return elapsed(item.since, at) >= 0 && (!item.until || elapsed(at, item.until) > 0);
}
export function find(state: BranchState, owner: string, key: string): Item | undefined {
  return Object.values(state.items ?? {}).find((i) => i.owner === owner && i.key === key && !i.until);
}
function primitive(v: Value): Primitive {
  switch (v.type) {
    case "number":
      return v.n;
    case "text":
      return v.text;
    case "date":
      return v.date;
    case "flag":
      return v.on;
    case "link":
      return v.to;
  }
}
function number(v: Value): number {
  if (v.type !== "number" || !Number.isFinite(v.n)) throw new Error("A finite number is needed");
  return v.n;
}
/** A value that follows the calendar is read off the day it is read on. */
function computedValue(item: Item, at: string): Value {
  const rule = item.rules.find((r) => r.active && r.how === "calendar");
  if (!rule || rule.how !== "calendar" || item.value.type !== "number") return item.value;
  return { ...item.value, n: calendarDistance(rule.anchor, at, rule.unit) * rule.direction };
}
const kind = (v: Value) => (v.type === "number" || v.type === "link" ? v.type : "statement");
function convert(raw: NonNullable<ChangeLine["to"]>, old?: Value, unit?: string | null): Value {
  if (typeof raw === "object") return structuredClone(raw);
  if (old?.type === "date" && typeof raw === "string" && normDate(raw) === raw) return { type: "date", date: raw };
  if (typeof raw === "number") return { type: "number", n: raw, unit: unit ?? (old?.type === "number" ? old.unit : "") };
  if (typeof raw === "boolean") return { type: "flag", on: raw };
  return { type: "text", text: raw };
}
function validateRule(rule: Rule) {
  if (!rule.id || !rule.label) throw new Error("The rule has no name");
  date(rule.anchor);
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
function previousFields(before: Item, after: Item): Partial<Item> | undefined {
  const fields = Object.keys(after) as (keyof Item)[];
  const previous = Object.fromEntries(
    fields.filter((k) => k !== "value" && canonical(before[k]) !== canonical(after[k])).map((k) => [k, before[k] ?? null]),
  );
  return Object.keys(previous).length ? previous : undefined;
}
/** Undo only changes newer than the requested date. The common present-time projection needs no copy. */
function atDate(state: BranchState, at: string): BranchState {
  const later = (state.changes ?? []).filter((c) => c.at > at);
  if (!later.length) return state;
  const items = { ...state.items };
  for (const c of later.reverse()) {
    const current = items[c.itemId];
    if (!current) continue;
    if (c.mode === "open") {
      delete items[c.itemId];
      continue;
    }
    items[c.itemId] = { ...current, ...c.previous, value: c.from ?? current.value };
  }
  return { ...state, items };
}
function signature(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
/** What only the protagonist may change: a statement they set. (A quantity they set is where it started, exactly as they gave it; as it moves it is rewritten like any other.) */
export const standsAsSet = (item: Item) => item.setBy === "you" && item.value.type !== "number";
/**
 * Whether a line by someone other than the protagonist goes against what the protagonist set. Changing it always
 * does. Ending it does too, unless they set it as something to do (`untilDone`): once done it is over, and whoever
 * writes what happened says so.
 */
export const overturns = (item: Item, line: { ends?: boolean | null }) => standsAsSet(item) && !(item.untilDone && line.ends);

function edit(state: BranchState, world: Directory, line: ChangeLine, ctx: Context, index: number): Change {
  const owner = entity(world, line.whose);
  const what = line.what.trim(),
    at = date(line.from ?? ctx.at);
  if (!what || elapsed(at, ctx.at) < 0) throw new Error(`the line has no name in \`what\`, or takes effect on a day after ${ctx.at}: what has not yet come about is not written as so`);
  const owned = Object.values(state.items ?? {}).filter((i) => i.owner === owner && active(i, at));
  const old = line.itemId ? owned.find((i) => i.id === line.itemId) : (owned.find((i) => i.key === what) ?? (line.request ? undefined : owned.find((i) => i.label === what)));
  if (old && elapsed(old.since, at) < 0) throw new Error(`"${what}" has stood only since ${old.since}: a change to it takes effect on that day or later`);
  if (line.reveal && old) {
    const viewer = line.reveal;
    const next = { ...old, knownBy: [...new Set([...old.knownBy, viewer])], truthKnownBy: [...new Set([...(old.truthKnownBy ?? []), viewer])], revealedAt: at };
    state.items = { ...state.items, [old.id]: next };
    return { id: `${ctx.operation}:${index}:${old.id}`, operation: ctx.operation, itemId: old.id, at, by: ctx.by, mode: "set", previous: previousFields(old, next), eventId: ctx.eventId ?? null, from: old.value, to: old.value, why: line.why };
  }
  if (old && ctx.by !== "you" && overturns(old, line)) throw new Error(`"${what}" was set by the protagonist: only they change it`);
  if (line.ends && (!old || line.to != null)) throw new Error(`"${what}" cannot be ended by this line: a line that ends an item names an item that stands and gives no \`to\``);
  if (line.details?.period && elapsed(date(line.details.period.from), date(line.details.period.to)) < 0) throw new Error("the period ends before it begins");
  const oldValue = old?.value;
  if (!old && line.itemId && state.items?.[line.itemId]) throw new Error(`"${what}" has already ended: what holds now is a new item under its own name`);
  const raw = line.to ?? oldValue;
  if (raw == null) throw new Error(`"${what}" is new and has no value: give what it is in \`to\``);
  const value = convert(raw, oldValue, line.unit);
  // a quantity stays a quantity and a tie to someone stays a tie; a statement may be put another way (said yes or no, given its day, spelled out in words), or given its figure, and is then a quantity
  if (oldValue && kind(value) !== kind(oldValue) && !(kind(oldValue) === "statement" && kind(value) === "number")) throw new Error(`"${what}" holds ${kind(oldValue) === "number" ? "a number" : kind(oldValue) === "link" ? "a tie to someone" : "a statement"}, and \`to\` gives ${kind(value) === "number" ? "a number" : kind(value) === "link" ? "a tie to someone" : "a statement"}: what has become a different thing is a new item under its own name, and this one is ended`);
  if (value.type === "date") date(value.date);
  if (value.type === "link") entity(world, value.to);
  const about = line.about?.map((name) => (state.items?.[name] ? name : entity(world, name))) ?? old?.about ?? [];
  const item: Item = {
    id: old?.id ?? line.itemId ?? newId("item"),
    owner,
    key: old?.key ?? what,
    label: what,
    tag: "",
    since: at,
    until: null,
    cause: { eventId: ctx.eventId },
    setBy: ctx.by,
    ...old,
    ...line.details,
    about,
    value,
    touched: at,
    visibility: line.known === "public" ? "public" : "private",
    knownBy: line.knownBy ?? (line.known === "involved" ? [...about] : []),
    rules: [...(old?.rules ?? [])],
  };
  if (line.knownCircles) item.knownCircles = [...new Set([...(old?.knownCircles ?? []), ...line.knownCircles])];
  if (line.shownAs !== undefined) item.shown = line.shownAs === null ? null : { type: "text", text: line.shownAs };
  if (line.to != null && old?.rules.some((r) => r.active && r.how === "calendar")) throw new Error(`"${what}" follows the calendar by itself and is not written by hand`);
  if (value.type === "number") {
    number(value);
    if (oldValue?.type === "number" && oldValue.unit !== value.unit) throw new Error(`"${what}" is counted in ${oldValue.unit || "bare numbers"}: give the new figure in that unit, or leave \`unit\` out`);
  }
  if (line.rule) {
    number(value);
    validateRule(line.rule);
    if (item.rules.some((r) => r.active)) throw new Error(`"${what}" follows the calendar by itself and takes no other rule`);
    item.rules.push(structuredClone(line.rule));
  }
  if (line.ends) {
    item.until = at;
    item.endedWhy = line.why || ctx.reason;
  }
  if (!old && Object.hasOwn(state.items ?? {}, item.id)) throw new Error("An item with this id exists already");
  state.items = { ...state.items, [item.id]: item };
  const result: Change = {
    id: `${ctx.operation}:${index}:${item.id}`,
    operation: ctx.operation,
    itemId: item.id,
    at,
    eventId: ctx.eventId ?? null,
    from: oldValue ?? null,
    to: line.ends ? null : value,
    why: line.why || ctx.reason,
    by: ctx.by,
    mode: line.ends ? "close" : !old ? "open" : "set",
  };
  if (old) result.previous = previousFields(old, item);
  if (line.evidence) result.evidence = [...line.evidence];
  return result;
}
/** Writes the lines, all or none: a line that cannot be written throws and nothing of the batch is kept. */
export function change(state: BranchState, world: Directory, lines: ChangeLine[], ctx: Context): Change[] {
  date(ctx.at);
  const draft = { ...state, items: { ...state.items } },
    pending: Change[] = [];
  const prior = (state.changes ?? []).filter((c) => c.operation === ctx.operation);
  lines.forEach((line, index) => {
    const fingerprint = signature([line.request ?? line, ctx.at, ctx.by, ctx.eventId ?? null, ctx.reason]);
    const same = prior.find((c) => c.id === `${ctx.operation}:${index}:${c.itemId}`);
    if (same) {
      if (same.fingerprint !== fingerprint) throw new Error(`the write ${same.id} was already made with different content`);
      return;
    }
    pending.push({ ...edit(draft, world, line, ctx, index), fingerprint });
  });
  if (pending.length) {
    state.items = draft.items;
    state.changes = [...(state.changes ?? []), ...pending];
  }
  return pending;
}
/** `tag` is for showing things in their groups only: the program does not ask by it. */
type Query = { includeEnded?: boolean; viewer: string | null; at?: string; about?: string[]; owner?: string };
/**
 * The items as one viewer sees them (null: whoever sees everything): what is public, their own, known to them or gone
 * round a circle they are in; and of something shown one way and true another, the side they are on. All of it: there
 * is no ranking and nothing is left out.
 */
export function view(state: BranchState, world: Directory, q: Query): Item[] {
  if (q.at) state = atDate(state, q.at);
  const related = (i: Item) => q.about?.some((id) => id === i.owner || i.about.includes(id)) ?? false;
  const current = q.at ?? (state.changes ?? []).reduce((last, c) => (last > c.at ? last : c.at), "");
  return Object.values(state.items ?? {})
    .filter(
      (i) =>
        (q.includeEnded ? !q.at || elapsed(i.since, q.at) >= 0 : q.at ? active(i, q.at) : !i.until) &&
        (!q.owner || i.owner === q.owner) &&
        (!q.about?.length || related(i)) &&
        (q.viewer === null || i.visibility === "public" || (i.owner === q.viewer && i.ownerKnows !== false) || i.knownBy.includes(q.viewer) || knownInCircle(state, world, i, q.viewer)),
    )
    .map((i) => {
      const { shown, truthKnownBy, ...seen } = structuredClone(i);
      const value = structuredClone(computedValue(i, current || i.touched || i.since));
      if (q.viewer === null) return { ...seen, shown, truthKnownBy, value };
      if (shown && (q.viewer !== i.owner || i.ownerKnows === false) && !truthKnownBy?.includes(q.viewer))
        return { id: i.id, owner: i.owner, about: [], key: i.id, label: i.label, value: shown, tag: i.tag, since: i.since, until: i.until, period: i.period, touched: i.touched, setBy: i.setBy, visibility: i.visibility, knownBy: [], rules: [], cause: {} };
      return { ...seen, value };
    });
}
/** A value in words, as material for a prompt or beside a label on a page: no word of any language is added to it. */
export function describe(v: Value): string {
  if (v.type === "number") return `${v.n} ${v.unit}`.trim();
  if (v.type === "flag") return v.on ? "true" : "false";
  if (v.type === "link") return v.label;
  return String(primitive(v));
}
/** Changes paired with their item, including items that subsequently ended. */
export function history(state: BranchState, changes = state.changes ?? []): { item: Item; change: Change }[] {
  return changes.flatMap((change) => {
    const item = state.items?.[change.itemId];
    return item ? [{ item, change }] : [];
  });
}
