import { z } from "zod";
import { tx } from "../language.js";
import { normDate, nowIso } from "../util.js";

/**
 * What a play is set up as: five slots read from what the person wrote. Nothing is assumed about the kind of play
 * (today's you, a real person in the past, a newborn drawn at random, a stray cat): the slots say it.
 * - world: when and where;
 * - premises: where it differs from the real world (everything else is as the real world is);
 * - role: whom you play (yourself, a real person or organisation, someone or something made for the play, or no one);
 * - start: the day the matter itself begins (which may lie after today: what they said they would do to get there is
 *   done by then) and the situation then;
 * - goal: what you are after, if anything (no goal: you watch where it goes).
 * Each slot says where its value came from: said, found by the research, drawn by the program from a real
 * distribution, or assumed (marked as such).
 */

export const SLOT_SOURCES = ["said", "found", "drawn", "assumed"] as const;
export type SlotSource = (typeof SLOT_SOURCES)[number];

/** One draw the program made: what was drawn from, the buckets and their weights, the source, what came out. */
export type Draw = {
  variable: string;
  conditions: string;
  buckets: { label: string; weight: number; rest?: boolean }[];
  picked: string;
  /** What came out is the table's catch-all ("everything else"), as the table marked it. */
  rest?: boolean;
  roll: number;
  source: string;
  recordId: string | null;
};

export type Slot = {
  value: string;
  source: SlotSource;
  /** Left to the program to draw (the person said "random", or did not say and it has to be settled). */
  random?: boolean;
  /** Draws that settled it, in order. */
  draws?: Draw[];
  note?: string;
};

export const ROLE_KINDS = ["self", "real", "made", "none"] as const;
export type RoleKind = (typeof ROLE_KINDS)[number];

export type Premise = { text: string; source: "said" | "chat"; at?: string };

export type Setup = {
  world: Slot;
  premises: Premise[];
  role: Slot & { kind: RoleKind; name: string | null };
  start: Slot & { date: string };
  goal: Slot | null;
  /** What was asked about pace once the questions were answered (absent until it is written). */
  paceAsk?: import("../db/schema.js").PaceAsk;
  /** How closely they chose to watch: what is a step of its own at that pace (absent: not chosen, and left to whoever writes the moments). */
  pace?: { name: string; step: string; steps?: number | null };
  /** The program settled the random slots (once). */
  filled?: boolean;
  /** Where every roll that settles the slots comes from: the same seed gives the same draws. */
  seed?: number;
  /** A fill that stopped with a draw missing: what it planned, what it had settled, and how many rolls it had used. */
  pending?: FillPending;
};

/** One draw as planned: which slot it settles, what is drawn, from which group ({n}: what draw n came out as). */
export type PlannedDraw = { slot: "world" | "role" | "goal"; variable: string; conditions: import("../base/lookup.js").Conditions; hint: string };

/**
 * A fill part done. `done[i]` is what draw i+1 settled (null: not yet): one draw, or two when the first landed in a
 * table's "other" and the second was drawn inside it; an outer "other" alone is still pending.
 */
export type FillPending = { plan: PlannedDraw[]; done: ((Draw & { slot: PlannedDraw["slot"] })[] | null)[]; k: number };

const SlotOut = z.object({
  value: z.string().describe("What this slot holds, in one sentence that is shown to the person (so it is written for them to read, not as a note to the program); where the program is to draw it at random, say what is drawn, e.g. \"random: the birthplace of a newborn of 2026, worldwide\""),
  source: z.enum(["said", "assumed"]).describe("said = they said it; assumed = they did not, and you assume the most common case"),
  random: z.boolean().describe("true when they said random, or did not say but it has to be settled and can only be drawn from a real distribution (birthplace, family, sex); what can be inferred from their words is not random"),
});

/** What understanding the question reads about the play: the five slots. */
export const SetupSchema = z.object({
  world: SlotOut.describe("The world: when and where. E.g. \"Shanghai in 2026\", \"Silicon Valley in 1985\", \"random: the place of a birth in 2026\""),
  premises: z.array(z.string()).default([]).describe("Premises: where they set the world to differ from the real one, one sentence each (e.g. \"the college entrance exam was not restored in 1977\", \"I can read minds\"); an empty array when they changed nothing. Everything outside the premises is as in the real world"),
  role: SlotOut.extend({
    kind: z.enum(ROLE_KINDS).describe("self = they play themself; real = a person or organisation that really exists (Steve Jobs, a certain company); made = someone or something made for the play (a newborn, an invented person, a stray cat, an open-source project); none = they play no one and only want to know the outcome"),
    name: z.string().nullable().default(null).describe("For real: the name as written; otherwise null"),
  }).describe("Who is played"),
  start: SlotOut.extend({
    date: z.string().nullable().describe("The day the play opens, YYYY-MM-DD: the day the matter they named itself begins. What they said they would do to get there (go there, leave their post, take up the new one, land) is done by then, so a matter that begins only once that is done opens after today: on the day they named for it, or else on the earliest day it would ordinarily begin from where they stand now. A day they named for the start (\"from tomorrow\", \"on the first of next month\") is that day. null when it begins today: when they said so (\"starting today\"), when it is already under way or is what they face now, and when what they asked to see is the run-up itself (getting ready for it, deciding whether to do it). For a moment of the past, that moment (a day they named in history is the opening; when only the year or the month is known, a day in that period before the key decision); for a birth, the day of birth"),
  }).describe("The opening: the day the matter they named itself begins, and their situation on it, with what they said they would do to get there already done"),
  goal: SlotOut.nullable().default(null).describe("The goal: filled only when they said what exactly they want to reach; a random birth, or seeing how a life turns out, has no goal: null, and do not make one up for them"),
});
export type SetupOut = z.infer<typeof SetupSchema>;

export const today = () => nowIso().slice(0, 10);

/** The setup as kept, from what understanding read. */
export function cleanSetup(o: SetupOut, now = today(), worldId?: string | null): Setup {
  const slot = (s: { value: string; source: "said" | "assumed"; random: boolean }): Slot => ({ value: s.value.trim(), source: s.source, ...(s.random ? { random: true } : {}) });
  const date = o.start.date ? normDate(o.start.date) : null;
  return {
    world: slot(o.world),
    premises: o.premises.map((t) => t.trim()).filter(Boolean).map((text) => ({ text, source: "said" as const })),
    role: { ...slot(o.role), kind: o.role.kind, name: o.role.kind === "real" ? o.role.name?.trim() || null : null },
    // A future starting world is allowed; its environment must be labeled as projected.
    start: { ...slot(o.start), date: date ?? now, ...(date && date > now ? { note: tx(worldId, "setup.futureStart") } : {}) },
    goal: o.goal && o.goal.value.trim() ? slot(o.goal) : null,
  };
}

/** The slots still to be drawn by the program. */
export const randomSlots = (s: Setup): ("world" | "role" | "start" | "goal")[] =>
  (["world", "role", "start", "goal"] as const).filter((k) => {
    const x = s[k];
    return !!x && x.random && !x.draws?.length;
  });

/** Whether the play starts in the past (a day before the one it was made on). */
export const isPast = (s: Setup, made: string) => s.start.date < made.slice(0, 10);

const SOURCE_LABEL: Record<SlotSource, string> = { said: "they said it", found: "found by looking it up", drawn: "drawn by the program from the real distribution", assumed: "assumed" };

/** The heading the setup stands under in a prompt (prompts that point at it name it by this). */
export const SETUP_HEADING = "[Setup of the play]";

/** The setup as every prompt sees it. */
export function setupText(s: Setup | null | undefined): string {
  if (!s) return "";
  const line = (name: string, x: Slot | null) => (x ? `- ${name}: ${x.value} (${SOURCE_LABEL[x.source]}${x.draws?.length ? `: ${x.draws.map((d) => `${d.variable}→${d.picked}`).join(", ")}` : ""})` : `- ${name}: none`);
  return [
    SETUP_HEADING,
    line("World", s.world),
    `- Premises (where it differs from the real world; everything else is as in the real world): ${s.premises.length ? s.premises.map((p) => `${p.text}${p.source === "chat" ? ` (changed during the play${p.at ? `, from ${p.at}` : ""})` : ""}`).join("; ") : "none"}`,
    line(`Who is played (${{ self: "themself", real: "a real person or organisation", made: "made for the play", none: "no one" }[s.role.kind]})`, s.role),
    line(`Start (${s.start.date})`, s.start),
    s.start.date > today() ? "- This is a start in the future: the surroundings and the figures of that time are all projections, and must keep their basis and their marks of uncertainty" : "",
    s.goal ? line("Goal", s.goal) : "- Goal: none (no story line; it goes where chance takes it)",
    s.start.date < new Date().toISOString().slice(0, 10)
      ? `- This is a start in the past: everyone knows only what happened before ${s.start.date}; every figure is in the nominal value of that time (a share price as quoted then, not as adjusted for later splits; prices, wages and exchange rates as of that year)`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The protagonist's name in a world played from today as oneself (from the past, it is the person whose place is
 * taken): the one name the program gives, in the project's language.
 */
export const heroYou = (worldId?: string | null) => tx(worldId, "you");

/**
 * How the facts only the protagonist knows are opened when the program writes them into a world: what they said of
 * themself (a play from today), or of how the play is set (from the past). Whoever looks these facts up again looks
 * for the same opening.
 */
export const aboutYou = (worldId?: string | null) => tx(worldId, "setup.aboutYou");
export const aboutSetup = (worldId?: string | null) => tx(worldId, "setup.aboutSetup");

/** Where the project stands in time, from the setup: the start day, and whose place you take (a real person). */
export function momentFields(s: Setup): { asOf: string; seat: string | null } {
  return { asOf: s.start.date, seat: s.role.kind === "real" ? s.role.name : null };
}
