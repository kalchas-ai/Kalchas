import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { decisions, worlds, type Notice } from "../db/schema.js";
import type { Ask } from "./advise.js";
import { restoreStep, stepRunningHere } from "./checkpoint.js";
import { endOf } from "./relations.js";
import type { Shown, Situation, StopLive } from "./schemas.js";
import { getBranch, madeEarlier, updateBranch, worldIdOf, type EventRow } from "./world.js";
import { ENGINE_NARRATE, askNarrate, endNarrate, forkNarrate, isNarrated, startNarrate, submitNarrate } from "../narrate/play.js";

/**
 * The ways into a play. A play is one model writing it straight on, one stop at a time (engine 12, see narrate/). A
 * world or a line made by an engine before it keeps its records and can be read (views.ts), and nothing runs on it:
 * opening, moving, asking, forking or ending one is refused, in a sentence.
 */

export function currentDecision(branchId: string) {
  const b = getBranch(branchId);
  return db().select().from(decisions).where(and(eq(decisions.branchId, branchId), eq(decisions.step, b.step))).get();
}

/** Opens a play on a world: its first stop, written after the world's setting up. */
export async function startSession(worldId: string, startOrdinal = 1, onProgress?: Progress) {
  const w = db().select({ engine: worlds.engine }).from(worlds).where(eq(worlds.id, worldId)).get();
  if (!w) throw new Error(`No such world: ${worldId}`);
  if (w.engine !== ENGINE_NARRATE) throw madeEarlier(worldId);
  return startNarrate(worldId, startOrdinal, onProgress);
}

/** A decision: one of the moment's options (as drafted or edited), several of them with words of one's own, free text, or carrying on as things are. */
export type ActionInput = { kind: "option"; id: string; text?: string } | { kind: "plan"; picks: string[]; text?: string } | { kind: "command"; text: string } | { kind: "carry_on" };

/**
 * How a step tells the page how it is going: a line on what is under way, and, while the moment is being written, its
 * scene as written so far (the whole of it each time, growing; an empty one means what was shown is to be cleared);
 * and, once what the person reads stands, what they now face and the ways open, while its record is still being set
 * down: it can be read and thought over, and acted on when the step is done. Engine 12 also gives, as it comes, what
 * each side did in the stretch and the rolls the protagonist can see (`live`, the whole of it each time).
 */
export type Progress = (msg: string, scene?: string, shown?: Shown, live?: StopLive) => void;

/** What the person did at a step and what came of it, kept with the step (a step of an earlier engine kept more of it). */
export type ChosenAction = {
  input: ActionInput;
  restatement: string;
  /** What the protagonist stated as holding from now on, as it was read from their words. */
  settings: string[];
  /** Parts that could not be taken as stated, and why. */
  rejected: { text: string; why: string }[];
  /** Who was asked to decide for themselves in the step (names). */
  asked: string[];
  settlement?: Settlement;
  notices?: Notice[];
  calls?: number;
  /** Why the step stopped on the moment it did. */
  stopReason?: string;
  /** How many batches whoever directs took to reach the stop. */
  batches?: number;
};

/** A question asked at a step: it moves no clock and nobody in the world learns of it. */
export type { Ask };

/** What a step brought, for the settlement shown after it. */
export type Settlement = {
  from: string;
  to: string;
  /** What the next decision is about. */
  moment: string;
  /** What was rolled and came to pass in the step, with the odds it was rolled at. */
  drawn: { title: string; probability: number; estimated: boolean; basis: string; date: string }[];
  newcomers: string[];
  metrics: { before: Record<string, number>; after: Record<string, number> };
};

export type StepResult = {
  events: EventRow[];
  metrics: { before: Record<string, number>; after: Record<string, number> };
  reports: { id: string; kind: string; title: string }[];
  ended: { reason: string; at: string } | null;
  situation: Situation | null;
  restatement: string;
  stopReason: string;
  calls: number;
  /** What the page says about how the step went: one plain sentence for each kind of thing the program noted. */
  warnings: string[];
  settlement: Settlement;
};

/** Something asked where the story stands: answered, and the clock does not move. */
export async function askQuestion(branchId: string, question: string): Promise<Ask> {
  if (!isNarrated(getBranch(branchId).state)) throw madeEarlier(worldIdOf(branchId));
  return askNarrate(branchId, question);
}

/**
 * Submits a decision and writes the next stop, as one atomic write: a failure anywhere leaves the timeline as it was.
 * A question comes back answered without moving the clock. `onProgress` is told what is under way, and is given the
 * scene of the stop as it is written.
 */
export async function submitAction(branchId: string, input: ActionInput, onProgress?: Progress) {
  if (!isNarrated(getBranch(branchId).state)) throw madeEarlier(worldIdOf(branchId));
  return submitNarrate(branchId, input, onProgress);
}

/** Ends the play by the protagonist's choice: the review is written, and nothing more happens on this timeline. */
export async function endPlay(branchId: string): Promise<{ reportId: string }> {
  if (!isNarrated(getBranch(branchId).state)) throw madeEarlier(worldIdOf(branchId));
  return endNarrate(branchId);
}

/**
 * Recovers a branch after the server restarted mid-step: the step is undone whole, and the moment it was waiting on is
 * the one it waits on again.
 */
export async function ensureSituation(branchId: string): Promise<Situation | null> {
  if (stepRunningHere(branchId)) throw new Error("This step is already running");
  restoreStep(branchId);
  const b = getBranch(branchId);
  if (b.status === "ended" || endOf(b.state)) return null;
  const existing = currentDecision(branchId);
  if (b.status === "running") updateBranch(branchId, { status: "awaiting_decision", pendingAction: null });
  return (existing?.situation as Situation | undefined) ?? null;
}

/**
 * A new line that goes on from the start of stop `step` of an existing one: the story up to there, and nothing the
 * line it came from went through afterwards. A free fork rolls its own dice; a matched fork meets the rolls outside
 * the protagonist's reach as the line it came from did.
 */
export async function forkBranch(branchId: string, step: number, mode: "free" | "matched" = "free") {
  if (mode !== "free" && mode !== "matched") throw new Error("Not a way to branch");
  if (!isNarrated(getBranch(branchId).state)) throw madeEarlier(worldIdOf(branchId));
  return forkNarrate(branchId, step, mode);
}
