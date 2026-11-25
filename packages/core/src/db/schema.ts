import type { Evidence } from "../facts/evidence.js";
import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import type { Insight } from "../forecast/insight.js";
import type { LookupItem } from "../forecast/items.js";
import type { Setup } from "../world/setup.js";
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
const createdAt = () => text("created_at").notNull();

/**
 * A project and the world it becomes: one row from the person's first words to the play. Its question and answers are
 * in `forecasts` under the same id; once built, its people, facts and plays hang off this id.
 */
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  title: text("title"),
  status: text("status").notNull(), // clarifying | building | ready | paused | failed
  scope: json<unknown>("scope"),
  profile: json<unknown>("profile"),
  completeness: json<unknown>("completeness"),
  endings: json<unknown>("endings"),
  /** No longer read: spending has no limit. Kept for the worlds that hold one; a new world is given 0. */
  budgetUsd: real("budget_usd").notNull().$defaultFn(() => 0),
  error: text("error"),
  // the language of the project, a BCP-47 tag: read from the person's own words, or fixed in the settings (see language.ts)
  language: text("language"),
  /** The engine the world is built and played under: 12 for one model writing the play straight on (see narrate/); null for the engines before it. */
  engine: integer("engine"),
  /** Engine 12: the world notes the build wrote (null otherwise). */
  notes: json<WorldNotes>("notes"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull(),
});

// ---------------------------------------------------------------- engine 12: one model writes the play straight on

/** The kinds of line in the notes of an engine-12 world; `note` is a line that could not be read as one of the others, kept as it was written. */
export const NOTE_KINDS = ["person", "force", "figure", "road", "assumption"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number] | "note";
/** known: the protagonist knows it; hidden: only the world does. */
export type NoteSide = "known" | "hidden";
/**
 * One line of the notes: a person's card (a person or a body that decides: who they are, what they want, what they
 * mean to do), a force moving of itself (with how likely it is to be felt), a key figure (roughly, with its unit), a
 * stretch of the road ahead (`name`: about when), or something assumed of the protagonist. Keyed by kind, side and
 * name: a later line with the same key takes its place. `step`: the stop that last wrote it (0: the world's opening);
 * `since`: that stop's day.
 */
export type NoteEntry = { kind: NoteKind; side: NoteSide; name: string; text: string; step: number; since: string };

/**
 * One message of an engine-12 play's history, kept as it was exchanged (the AI SDK's model message: the person's turn,
 * what the model wrote and the tools it called, what the tools gave back), without the model's thinking.
 */
export type StoredMessage = import("ai").ModelMessage;

/**
 * What the build of an engine-12 world wrote, kept on the world. `exchange`: the build as it happened, the request (with
 * the person's own part) and everything the model wrote, looked up and was given back: every play on the world opens
 * with it, word for word. `text`: what the model wrote; the rest is the same read into parts (`found`: what it said it
 * found, for the intel page). `day`: the day the play opens on (the day the matter itself begins); `hero`: whom the
 * person plays, by name.
 */
export type WorldNotes = { text: string; situation: string; entries: NoteEntry[]; milestones: string[]; found: string[]; day: string; hero: string; exchange?: StoredMessage[] };

/** Something the person said in the chat box to change, kept in their words: given to the model with the next move (`step`: that move's stop; null until then). */
export type Instruction = { at: string; text: string; step: number | null };

/** A roll of the line a matched fork came from, carried to it: the same question comes out the same on the fork. */
export type CarriedRoll = { id: string; day: string; question: string; options: { label: string; probability: number }[]; chosen: string };

/**
 * An engine-12 play as the program keeps it between stops (the stops themselves are rows of `decisions`). `opened`: the
 * day it opened on. `head`: the person's own part of the play (what they typed, how it was understood, the setup, the
 * answers, the pace as it was at the start), for whatever reads it beside the story and for a fold. `begin`: the turn
 * that asks for the opening stop, after the world's setting up (the day, the pace, the main questions), written once.
 * (`world`: only on a play begun before the setting up was part of its history.) `notes`: the notes as they now stand
 * (the world's, with every stop's changes merged in). `folds`: the story so far, folded segment by segment once a long play has piled up stops: each
 * stands in for the stops up to `upTo` (with the notes and main questions as they stood there). `instructions`: what
 * the person said in the chat box to change (the world, an assumption, what they are after, how they go about it), in
 * their words, each with the day it was said and the stop whose move gave it to the model (null: not given yet, it goes
 * with the next move). `carried`: on a matched fork, the rolls of the line it came from, given once with the next
 * move. `pace`: the pace as last given.
 */
export type StoryState = {
  /** The day the play opened on (the opening's own turn names it). */
  opened: string;
  head: string;
  begin?: string;
  world?: string;
  notes: NoteEntry[];
  folds?: { upTo: number; text: string; notes: string; milestones: string; at: string }[];
  instructions?: Instruction[];
  carried?: CarriedRoll[];
  pace?: string;
};

/**
 * The kinds of existence in a world, by how what it does comes about: a person decides for themself; a body that
 * decides (a fund, a buyer's company, an admissions committee) answers out of several people inside it and a way
 * through it; a crowd is many people who each decide for themselves. What only processes by its rules is nothing in
 * the world: what passes through it goes through as such things ordinarily do.
 */
export const EXISTENCES = ["person", "body", "crowd"] as const;
export type Existence = (typeof EXISTENCES)[number];

/** One stage a thing goes through inside a body that decides: what happens there, who decides it, about how long it takes. */
export type BodyStage = { stage: string; decides: string; takes: string };

/**
 * A body that decides, opened (see world/org.ts): the particular people in it whom the protagonist would come up
 * against (entity ids, each a person of the world in the body's circle), the circle news goes round in inside it, and
 * the way a thing like the protagonist's goes through it, stage by stage. `at`: the day it was opened as of.
 */
export type BodyInside = { members: string[]; circle: string | null; way: BodyStage[]; at: string };

export const entities = sqliteTable(
  "entities",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // what it is, in the builder's own word (a person, a fund, a school…); read by people, never by the program
    aliases: json<string[]>("aliases").notNull(),
    summary: text("summary").notNull(),
    person: integer("person", { mode: "boolean" }).notNull(), // a person, as against anything else, as whoever listed them said
    tier: text("tier").$type<"cast" | "background">().notNull(), // cast: deals with the protagonist from the start; background: until they first do
    /** Someone who entered one timeline during a play (null: in the world from the start). */
    branchId: text("branch_id"),
    /** Which kind of existence it is, as whoever brought it into the world said (null: not said, as of the protagonist). */
    existence: text("existence").$type<Existence>(),
    /** A body that decides, opened while the world was built (one opened during a play is kept on that timeline: `BranchState.bodies`). */
    inside: json<BodyInside>("inside"),
    createdAt: createdAt(),
  },
  (t) => [index("entities_world").on(t.worldId)],
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    excerpt: text("excerpt"),
    createdAt: createdAt(),
  },
  (t) => [index("sources_world_url").on(t.worldId, t.url)],
);

export const facts = sqliteTable(
  "facts",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    content: text("content").notNull(),
    occurredAt: text("occurred_at").notNull(), // YYYY-MM-DD (unknown day/month → first of period)
    publishedAt: text("published_at"), // the day everyone could know it; null → not public
    knownBy: json<string[]>("known_by").notNull(), // entity ids who knew it when it occurred
    circles: json<string[]>("circles").notNull(), // circle ids it went round in when it occurred: their members know it, those who join later too
    entityIds: json<string[]>("entity_ids").notNull(), // whom it is about, as whoever wrote it named them
    sourceId: text("source_id"),
    quote: text("quote"),
    contentHash: text("content_hash").notNull(),
    evidence: json<Evidence>("evidence"),
    createdAt: createdAt(),
  },
  (t) => [index("facts_world_time").on(t.worldId, t.occurredAt), index("facts_world_hash").on(t.worldId, t.contentHash)],
);

export const edges = sqliteTable(
  "edges",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    label: text("label").notNull(), // what the relation is, in a sentence
    validFrom: text("valid_from"),
    validTo: text("valid_to"),
    origin: text("origin").notNull(), // built | simulated
    branchId: text("branch_id"),
    createdAt: createdAt(),
  },
  (t) => [index("edges_world").on(t.worldId)],
);

export const exoEvents = sqliteTable(
  "exo_events",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    date: text("date").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("exo_world_date").on(t.worldId, t.date)],
);

/**
 * Who someone in a world is, as text. Two parts because who may see what is enforced by the program: `public` is
 * what others can see and know of them; `private` is what only they (and whoever sees the whole world) know. The rest
 * is what the program itself needs as data.
 */
export type Persona = {
  public: string;
  private: string;
  /** YYYY-MM-DD when known (for a person whose age matters); null otherwise. */
  birthDate: string | null;
  /** A person, as against anything else (an organisation, an institution, a group, an animal), as the builder said. */
  person: boolean;
  /** The name a made person goes by in life, when the roster lists them by something else ("Direct manager"): a name of theirs like any other. */
  called?: string | null;
};

export const actors = sqliteTable(
  "actors",
  {
    id: text("id").primaryKey(), // equals entity id
    worldId: text("world_id").notNull(),
    persona: json<Persona>("persona").notNull(),
    model: text("model"),
    /** Entered one timeline during a play, on this simulated day (null: in the world from the start). */
    branchId: text("branch_id"),
    enteredAt: text("entered_at"),
    createdAt: createdAt(),
  },
  (t) => [index("actors_world").on(t.worldId)],
);

export const startPoints = sqliteTable(
  "start_points",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    date: text("date").notNull(),
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    difficulty: text("difficulty").notNull(),
    seatEntityId: text("seat_entity_id").notNull(),
    initialMetrics: json<Record<string, number>>("initial_metrics").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("start_world").on(t.worldId)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  startPointId: text("start_point_id").notNull(),
  seatEntityId: text("seat_entity_id").notNull(),
  status: text("status").notNull(), // active | ended
  createdAt: createdAt(),
});

/** One thing that holds in a world: a number, a statement, a relation, an aim, a date. Whatever a world has is one of these. */
export type Item = {
  id: string;
  /** Whose it is: an entity id; `world` for what belongs to the world itself. */
  owner: string;
  /** Whom else it concerns (the other end of a relation, whom a promise was made to). */
  about: string[];
  /** A stable name under its owner, written by whoever declared it. Two keys mean something to the program: `in_play` (a flag: whether its owner is still in the matter) and, under the world, `ended` (a flag: the play is over). */
  key: string;
  /** Its name as people read it, in the world's language. */
  label: string;
  /** A free word for the group it is shown under; the program never branches on it. */
  tag: string;
  /** False: not even its owner knows it yet (only who sees everything may write such a thing). */
  ownerKnows?: boolean;
  /** The circles it has gone round in (circle ids): whoever is in one of them knows it, those who join later too. */
  knownCircles?: string[];
  /** The stretch of time it is about, when whoever wrote it gave one. */
  period?: { from: string; to: string };
  /** What it rests on, in the words of whoever wrote it. */
  basis?: string;
  revealedAt?: string;
  value: Value;
  /** A number below which the matter cannot go on, and what that means. Only when declared. */
  floor?: { below: number; meaning: string } | null;
  /** A value read off the calendar (an age): the only thing that moves with time by itself. */
  rules: Rule[];
  since: string;
  until: string | null;
  endedWhy?: string;
  /** Who set it. What "you" set, only you can change. */
  setBy: "build" | "you" | "sim" | "program";
  /** Set by the protagonist as something to do, not as how things are: it is over once carried out, and whoever writes what happened then ends it. */
  untilDone?: boolean;
  cause: { eventId?: string | null; sourceId?: string | null; recordId?: string | null };
  /** Said by whoever wrote it to be an estimate with no source. */
  estimated?: boolean;
  visibility: "public" | "private";
  knownBy: string[];
  /** What those who do not know the truth see; absent when what is seen is what is so. */
  shown?: Value | null;
  truthKnownBy?: string[];
  /** One of the protagonist's own numbers, shown on the board. */
  headline?: boolean;
  /** The day it last changed. */
  touched?: string;
  /** Written as its owner's intention (what they mean to do next), or as a force in motion owned by the world: see `Intent`. */
  intent?: Intent;
  /** A thing put to the body that owns it, in progress there: see `Matter`. Always with `intent` (when it comes back). */
  matter?: Matter;
};

/**
 * A thing the protagonist put formally to a body that decides, in progress there (see sim/org.ts). It is an open line
 * like an intention: an item of the body's, whose `intent` says about when the body comes back to the protagonist on it.
 * `put` and `terms` are the protagonist's own line as they set it (what they ask, what they offer, where they give way),
 * and `answers` what they answered on the way: nobody else rewrites them. `stage`: the stage of the body's way it has
 * reached; `waits`: what it waits on there; `question`: a question only the protagonist can decide, on which it now
 * rests (null when none); `since`: the day it was put.
 */
export type Matter = { put: string; terms: string; answers: { question: string; answer: string; at: string }[]; stage: string; waits: string; question: string | null; since: string };

/**
 * How a thing put to a body went inside it at one run (see sim/org.ts), kept apart on the play: shown to nobody while
 * the play goes on, and told in the review. `views`: each member's own view, written before any exchange (`who`: their
 * entity id); `stages`: how it went, stage by stage; `tells` and `how`: what the body told the protagonist and how;
 * `reason`: what it really rested on, where that differs; `showed`: what of it showed outside; `cover`: the item that
 * keeps the real reason from the protagonist (null when there was nothing to keep).
 */
export type Inside = {
  id: string;
  body: string;
  line: string;
  what: string;
  at: string;
  views: { who: string; thinks: string; needs: string }[];
  stages: { stage: string; went: string }[];
  tells: string;
  how: string;
  reason: string | null;
  showed: string;
  ends: boolean;
  question: string | null;
  cover: string | null;
};

/**
 * Something the world assumed of the protagonist at the opening, as the play holds it: as assumed (`text` alone), or as
 * they put it right through the chat box (`was`: what had been assumed; `at`: when; `ops`: the writings that put right
 * what rested on it, which are a correction of the opening and not a change they made to the world).
 */
export type Assumed = { text: string; was?: string; at?: string; ops?: string[] };

/**
 * What makes an item an intention: about when its owner means to act on it, or what it waits on (`when`), the day it is
 * about due when it has one (an estimate, YYYY-MM-DD; null when it waits on something rather than a day), and what it
 * does to the situation when it happens. A force in motion that nobody decides has `chance` too: how likely it is to
 * come within the span the play looks at. `putOff`: how many times whoever directs has given it a new time, and the day
 * it was first put off (shown to whoever directs as it is: information, never a limit).
 */
export type Intent = { when: string; day: string | null; effect: string; chance?: number | null; putOff?: { times: number; since: string } | null };

export type Value =
  | { type: "number"; n: number; unit: string }
  | { type: "text"; text: string }
  | { type: "flag"; on: boolean }
  | { type: "link"; to: string; label: string; kind?: string }
  | { type: "date"; date: string };

/**
 * A value that follows the calendar (an age, from a date of birth): read off the day it is read on, never written by
 * hand. Nothing else about an item moves by itself: whatever changes is written as what it now is.
 */
export type Rule = { id: string; label: string; active: boolean; because: string | null /* an event id */; how: "calendar"; anchor: string; unit: "years" | "months" | "days"; direction: 1 | -1 };

export type Change = {
  id: string;                    // `${operation}:${index}:${itemId}`: the same change handed in twice takes effect once
  operation: string;
  at: string;
  itemId: string;
  eventId: string | null;
  mode: "open" | "set" | "close";
  from: Value | null;
  to: Value | null;
  why: string;
  by: "you" | "sim" | "program" | "build";
  evidence?: string[];
  fingerprint?: string;
  /** Only fields replaced by this change, for a viewer reading an earlier day. Null removes a previously absent field. */
  previous?:Partial<Item>;
};

/** What kind of thing a notice is about: said where it is raised, never read off its words. */
/** `rounds` and `fold` are engine 12's: a stop that looked things up past its guard, and a long play whose story so far could not be kept. */
export type NoticeKind = "answer" | "lookup" | "persona" | "memory" | "premise" | "review" | "runaway" | "rounds" | "fold";
export type Notice = { kind: NoticeKind; text: string };

/** Something uncertain, as whoever ruled on it stated it: its question, its outcomes with their chances, and what they rest on. */
export type Uncertain = {
  question: string;
  outcomes: { label: string; probability: number }[];
  basis: string;
};

/** Something rolled that has not yet come to pass in what was written: the next moment writes it where it falls. */
export type Fate = { id: string; question: string; outcome: string; probability: number; estimated: boolean; basis: string; at: string };

/**
 * The road ahead as it looked from the last stop, written afresh at every stop by whoever directs: the junctures still
 * to come and how heavy each is, and what of what they asked to see still lies beyond. Who means to do what, and what
 * is moving of itself, are not on it: they are the world's open intentions (items with an `intent`).
 */
export type Brewing = {
  forks?: { what: string; when?: string; weight: string }[];
  remains?: string;
};

/**
 * One of the few main questions of the matter they asked to see (a milestone), each settled one way or the other (it
 * comes about, or it fails). Whoever directs sets them at the opening from what they asked to see, and sets a new one
 * when the play takes a turn none foresaw (`turn`); `set` is the day it was set. Whoever settles a stretch marks it
 * reached on the day its question is settled (`reached`: that day, whether it came about, and how). At the stop that
 * ends the stretch it was reached in, a card is written for it (`card`, null when none could be written) and that stop's
 * day is kept (`shown`). The play goes on after it.
 */
export type Milestone = { id: string; question: string; set: string; turn: boolean; reached?: { at: string; came: boolean; how: string } | null; shown?: string | null; card?: MilestoneCard | null };

/**
 * The card written when a milestone is reached, shown on its own after the stop it was reached in and passed on: the
 * result, said plainly as the protagonist would say it; what happened that settled it; and the few figures that show
 * it. In the project's language. How the line compares with real history is not on it: written while the play goes on,
 * it told what was still to come (who would be in a cabinet, where someone would be the next day), which are the
 * protagonist's own decisions still to make; the review gives it once the play is over.
 */
export type MilestoneCard = { result: string; turn: string; figures: { label: string; value: string }[] };

/** Work done beside a play, never on the path of a step: a memory written again, a newcomer written. */
export type BackgroundTask = { id: string; kind: "memory" | "persona"; at: string; actorId?: string };

/**
 * A play's bookkeeping. Everything that holds in its world is an item (`items`, with every change to one in
 * `changes`); the rest is what the program itself has to remember from one call to the next: who was played and up to
 * where they had read, who is in the cast, who is in which circle, what was rolled and not yet told, what the last
 * moment left brewing, what is to be done beside the play, what was spent.
 */
export type BranchState = {
  /** The engine this play was started under; a play from before the present one cannot be played on. */
  engine?: number;
  seatId?: string;
  items?: Record<string, Item>;
  changes?: Change[];
  /** Start of fully recorded external conditions on this line and the frozen reference period of an optional fork. */
  externalHistoryFrom?: string;
  comparison?: { from: string; until: string; parentId: string; parentSeq: number; step: number };
  performance?:import("../sim/health.js").StepPerformance[];
  notices?: Notice[];
  /** When each character was last played, and the event number they had read up to then. */
  played?: Record<string, { at: string; seq: number }>;
  /**
   * Those who came into the cast on this timeline from the background (they dealt with you directly): their persona,
   * which is the one line known of them until it is written beside the play.
   */
  cast?: Record<string, { since: string; why: string; persona: Persona; written: boolean }>;
  /** People and bodies that came into the world on this timeline: in the roster here, played by no one until they deal with you. */
  known?: { id: string; real: boolean }[];
  /** Circles someone was put in on this timeline: circle ids, by person. */
  circles?: Record<string, string[]>;
  /**
   * Collectives as this timeline holds them (by the collective's entity id): a body that decides opened on it (see
   * world/org.ts), and a crowd's standout members once someone has come into the play as one of it (circle null, way
   * empty). Each copies what the world built it with before anything is added.
   */
  bodies?: Record<string, BodyInside>;
  /**
   * Who came into the play during it as one of a body not yet opened into its people (by the body's id): they join its
   * people when it is opened (sim/org.ts), and are listed as in it until then.
   */
  joined?: Record<string, string[]>;
  /** How each thing put to a body went inside it, run by run: kept from everyone during the play, told in the review. */
  insides?: Inside[];
  /** What was assumed of the protagonist at the opening, once they have put any of it right (until then, the world's own list). */
  assumptions?: Assumed[];
  fates?: Fate[];
  brewing?: Brewing;
  /** The main questions of what they asked to see, open and settled, in the order they were set. */
  milestones?: Milestone[];
  /** Why nothing in the world was in motion when the last record was kept, as whoever kept it said; gone once something is. */
  quiet?: { at: string; why: string } | null;
  background?: BackgroundTask[];
  /** Engine 12 only: the play written straight on by one model (see `StoryState`). */
  story?: StoryState;
};

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  parentBranchId: text("parent_branch_id"),
  forkStep: integer("fork_step"),
  simTime: text("sim_time").notNull(),
  step: integer("step").notNull(),
  seq: integer("seq").notNull(), // last event seq
  state: json<BranchState>("state").notNull(),
  rngSeed: integer("rng_seed").notNull(),
  rngCounter: integer("rng_counter").notNull(),
  status: text("status").notNull(), // awaiting_decision | running | ended
  pendingAction: json<unknown>("pending_action"),
  createdAt: createdAt(),
});

export const simEvents = sqliteTable(
  "sim_events",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull(),
    seq: integer("seq").notNull(),
    simTime: text("sim_time").notNull(),
    kind: text("kind").notNull(), // user_action | actor_action | world | exogenous | entrant
    actorId: text("actor_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    visibility: text("visibility").notNull(), // public | private
    audience: json<string[]>("audience").notNull(),
    parentIds: json<string[]>("parent_ids").notNull(),
    payload: json<Record<string, unknown>>("payload"),
    createdAt: createdAt(),
  },
  (t) => [index("events_branch_seq").on(t.branchId, t.seq)],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull(),
    actorId: text("actor_id").notNull(),
    simTime: text("sim_time").notNull(),
    kind: text("kind").notNull(), // what it is a memory of, in a word; `digest` is their own account of everything before it
    text: text("text").notNull(),
    eventId: text("event_id"),
    createdAt: createdAt(),
  },
  (t) => [index("memories_branch_actor").on(t.branchId, t.actorId, t.simTime)],
);

export const knownFacts = sqliteTable(
  "known_facts",
  {
    branchId: text("branch_id").notNull(),
    actorId: text("actor_id").notNull(),
    factId: text("fact_id").notNull(),
    acquiredAt: text("acquired_at").notNull(),
    via: text("via").notNull(), // recon | perception
  },
  (t) => [primaryKey({ columns: [t.branchId, t.actorId, t.factId] })],
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull(),
    step: integer("step").notNull(),
    simTime: text("sim_time").notNull(),
    situation: json<unknown>("situation").notNull(),
    chosen: json<unknown>("chosen"),
    restatement: text("restatement"),
    /** Questions asked at this step (they don't move the clock) and the answers. */
    asks: json<unknown>("asks"),
    /** Engine 12: what the model wrote for this stop, in its tags, as it wrote it. */
    story: text("story"),
    /** Engine 12: this stop's whole exchange as every later call is given it: what the model wrote, every tool it called and what each gave back. */
    exchange: json<StoredMessage[]>("exchange"),
    /** Engine 12: the person's move at this stop as the next call was given it, word for word (with its day); null until made. */
    move: text("move"),
    /** Engine 12: the changes to the notes this stop wrote, read into lines. */
    patch: json<NoteEntry[]>("patch"),
    eventSeqBefore: integer("event_seq_before").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("decisions_branch_step").on(t.branchId, t.step)],
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    branchId: text("branch_id").notNull(),
    step: integer("step").notNull(),
    data: json<unknown>("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.step] })],
);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull(),
  kind: text("kind").notNull(), // checkpoint | manual | final
  simTime: text("sim_time").notNull(),
  title: text("title").notNull(),
  data: json<unknown>("data").notNull(),
  createdAt: createdAt(),
});

export const judgments = sqliteTable("judgments", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  branchId: text("branch_id"),
  simTime: text("sim_time"),
  question: text("question").notNull(),
  options: json<{ label: string; probability: number }[]>("options").notNull(),
  chosen: text("chosen").notNull(),
  /** What was rolled: an uncertain result (`outcome`), whether someone approached takes it up (`takes_up`), a face-to-face moment (`meeting`). */
  kind: text("kind").notNull().default("outcome"),
  /** No sourced figure stood behind the odds: they are the estimate of whoever ruled. */
  estimated: integer("estimated", { mode: "boolean" }).notNull().default(false),
  /** What the program adds to the question: the roll and what the odds rest on. */
  note: text("note"),
  /** The outcome event this judgment produced, so the page can show why it came out this way. */
  eventId: text("event_id"),
  /** Engine 12: rolled for something outside the protagonist's reach (a matched fork meets it again). */
  external: integer("external", { mode: "boolean" }).notNull().default(false),
  /** Engine 12: whether the protagonist can see how it came out (one that is not, is not shown to them while the play goes on). */
  seen: integer("seen", { mode: "boolean" }).notNull().default(true),
  /** Engine 12: whom it was about, a name as the notes have it (null: no one in particular, or rolled before this was kept). */
  about: text("about"),
  /** Engine 12: the stop it was rolled in (its decision step). */
  step: integer("step"),
  createdAt: createdAt(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  worldId: text("world_id"),
  payload: json<unknown>("payload").notNull(),
  status: text("status").notNull(), // queued | running | done | failed | paused
  checkpoint: json<unknown>("checkpoint"),
  error: text("error"),
  attempts: integer("attempts").notNull(),
  heartbeatAt: text("heartbeat_at"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull(),
});

export const jobLogs = sqliteTable(
  "job_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id").notNull(),
    at: text("at").notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
  },
  (t) => [index("job_logs_job").on(t.jobId, t.id)],
);

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id"),
    branchId: text("branch_id"),
    jobId: text("job_id"),
    /** In a play: the party the call decides for. */
    actorId: text("actor_id"),
    role: text("role").notNull(),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: real("cost_usd").notNull(),
    searches: integer("searches").notNull(),
    ms: integer("ms").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
    /** What came back, whole: the parsed object when it was usable, else the raw text (also when it would not parse). */
    output: text("output"),
    /** One request from the code (a generate, a search, a research): its attempts and parallel sends share it. */
    run: text("run"),
    attempt: integer("attempt"),
    /** "main", or "hedge" for the second send that goes out when the first is slow. */
    lane: text("lane"),
    provider: text("provider"),
    startedAt: text("started_at"),
    finishReason: text("finish_reason"),
    reasoningTokens: integer("reasoning_tokens"),
    /**
     * Of the input, how much the provider read from its cache (billed at the cache price) and how much it wrote to it
     * (billed at a premium by some), as the provider reported them; null when it reported neither. `inputTokens`
     * is the whole input, these included.
     */
    cachedTokens: integer("cached_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    /** The model's thinking, when the provider returns it. */
    thinking: text("thinking"),
    createdAt: createdAt(),
  },
  (t) => [index("llm_calls_world").on(t.worldId), index("llm_calls_run").on(t.run)],
);

// ---------------------------------------------------------------- the question a project starts from

/**
 * A question asked before the world is built. `kind` says how it is answered (absent on older ones: pick one); `goal`: asked
 * only when you are after that goal; `parent`/`on`: a follow-up, asked only when the question it hangs under was
 * answered with one of `on`. Every answer is kept as words ("3.5 years", "employment contract, payslips").
 */
export type ClarifyItem = {
  q: string;
  why: string;
  options: string[];
  answer: string | null;
  round?: number;
  about?: "purpose" | "premise" | "situation";
  kind?: "one" | "many" | "number" | "text";
  unit?: string | null;
  parent?: string;
  on?: string[];
};

/**
 * One way of watching a world, written for that world once its questions were answered: what one step is at this pace
 * (said by the kind of event that makes one, never by a length of time), about how many steps the whole matter then
 * takes, and how long that is to play. None is suggested: the person chooses.
 */
export type PaceOption = { name: string; step: string; steps: number; minutes: number };
/** What is asked about pace: the question and the ways of watching. */
export type PaceAsk = { q: string; options: PaceOption[]; /** What marks the end of what they asked to see: the play reaches it and is over. */ ends?: string };

/**
 * What a project was asked and answered, and what its world set out to look up; the project's row (status, budget,
 * title) is the `worlds` row with the same id, which becomes the world.
 */
export const forecasts = sqliteTable("forecasts", {
  id: text("id").primaryKey(), // equals the worlds row id
  question: text("question").notNull(),
  clarify: json<ClarifyItem[]>("clarify").notNull(),
  // YYYY-MM-DD: the day the play opens on — today, or a day in the past (a moment that really happened)
  asOf: text("as_of").notNull(),
  seat: text("seat"), // whose place you stand in at that moment (null: your own)
  horizon: text("horizon"), // YYYY-MM-DD: how far on the play looks (null: decided when the world is built)
  insight: json<Insight>("insight"), // how the matter was understood before the questions
  setup: json<Setup>("setup"), // what the play is set up as: world, premises, whom you play, the start, a goal
  lookups: json<LookupItem[]>("lookups"), // what the build set out to look up, and how each came out (null until the skeleton is written)
  createdAt: createdAt(),
});

/**
 * One web search made for a project, exactly as it was sent: which lookup it was for, what came back, and how much of
 * that was new for it. The research can be read back query by query.
 */
export const searches = sqliteTable(
  "searches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    item: text("item"), // the lookup it searched for (its id among the project's lookups)
    round: integer("round").notNull(),
    query: text("query").notNull(),
    engine: text("engine").notNull(),
    hits: integer("hits").notNull(),
    fresh: integer("fresh").notNull(), // pages not already seen for this lookup
    urls: json<string[]>("urls").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("searches_project").on(t.projectId)],
);

// ---------------------------------------------------------------- the world base

/**
 * Real distributions with their source (how a trait is spread over a group: buckets and weights), kept with the day
 * they were looked up and reused while fresh: the setup's random slots are drawn from them.
 */
export const baseRecords = sqliteTable(
  "base_records",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"distribution">().notNull(),
    /** What it is about ("country of birth", "what the people who come offering money want"). */
    variable: text("variable").notNull(),
    /** For whom, where, when ("newborns worldwide in 2026", "men aged 30–34 in China"). */
    conditions: text("conditions").notNull(),
    /** What it is, in parts, to find it again (base/lookup.ts, baseKey): the variable, the year, the age band and the grouping asked for, the rest of the conditions, and how it is bucketed. */
    key: text("key").notNull(),
    data: json<BaseData>("data").notNull(),
    source: text("source").notNull(),
    url: text("url"),
    /** The year the shares are for or were published. */
    year: integer("year"),
    /** Looked up, or estimated where nothing was found (marked so everywhere it is used). */
    estimated: integer("estimated", { mode: "boolean" }).notNull(),
    lookedUpAt: text("looked_up_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("base_key").on(t.kind, t.key)],
);

export type BaseData = {
  kind: "distribution";
  buckets: { label: string; weight: number; lower?: number | null; upper?: number | null; unit?: string; rest?: boolean }[];
  /** The table as found left part of the whole unaccounted for: the bucket the program put it in, and what the table's shares added up to. */
  rest?: { label: string; total: number };
  /**
   * The one world this record may be used in again: an estimate is good for keeping one play consistent with itself,
   * and is not passed on to any other. Absent: any world may use it.
   */
  only?: string;
};
