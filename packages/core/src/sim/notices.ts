import type { Notice, NoticeKind } from "../db/schema.js";
import { tx, type TextKey } from "../language.js";

/**
 * What the program has to tell the person about how a step went. A notice says what kind of thing it is about where
 * it is raised; the page shows one plain sentence for each kind (never the notice's own words, which may name people
 * and things the protagonist does not know of), in the project's language, and the words are kept for the review.
 */
const SAID: Record<NoticeKind, TextKey> = {
  answer: "notice.answer",
  lookup: "notice.lookup",
  persona: "notice.persona",
  memory: "notice.memory",
  premise: "notice.premise",
  review: "notice.review",
  runaway: "notice.runaway",
  rounds: "notice.rounds",
  fold: "notice.fold",
};

export const notice = (kind: NoticeKind, text: string): Notice => ({ kind, text });

/** A step says each thing once. */
export function saidOnce(notices: Notice[]): Notice[] {
  return notices.filter((n, i) => notices.findIndex((x) => x.kind === n.kind && x.text === n.text) === i);
}
export function publicNotices(notices: Notice[], worldId?: string | null): string[] {
  return [...new Set(notices.map((n) => tx(worldId, SAID[n.kind])))];
}
