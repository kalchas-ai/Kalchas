/**
 * A face-to-face talk as the play page once showed it. Talks are no longer a thing of their own (a talk is a step like
 * any other), so nothing produces one; the type stays only because flow-lab/flow.tsx, which may not be edited here,
 * still names it.
 */
export type DesignMeeting = {
  id: string;
  form: string;
  kind: string;
  title: string;
  stakes: string;
  youKnow: string;
  simTime: string;
  people: { id: string; name: string }[];
  blocks: { id: string; title: string; instructions: string }[];
  turns: { who: string; name: string; mine: boolean; text: string }[];
  result: Record<string, unknown> | null;
  /** Held and kept, or only set up. */
  held: boolean;
};
