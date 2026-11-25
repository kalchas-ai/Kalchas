/**
 * What is kept with a fact besides its text: what it is (something that happened, something set for a date, what the
 * person said of themself), how solid its page is as the one who read it judged, the lookup it was found for, and the
 * timeline it was found on when it was found during a play.
 */
export type Evidence = {
  status?: "happened" | "scheduled" | "said";
  /** As whoever read its page judged it: primary | reported | anecdotal. */
  solid?: string;
  /** The lookup item it was read for. */
  item?: string;
  branchId?: string;
};
