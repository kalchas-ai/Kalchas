import type { BranchState } from "../db/schema.js";
import { view } from "./items.js";

/**
 * The people of a play as an engine before engine 12 kept them, as far as the page still reads them: their age, an
 * item of theirs that followed the calendar from their date of birth.
 */

/** The item a person's age was kept as. */
const AGE = "age";

export function personAge(state: BranchState, owner: string, at: string, viewer: string | null = owner) {
  const value = view(state, null, { owner, viewer, at }).find((i) => i.key === AGE)?.value;
  return value?.type === "number" ? value.n : null;
}
