/**
 * The play page's three columns in the product, shared by the page itself (flow.tsx) and by what is laid over it
 * (product/live/flow.tsx): down the left, the parties; down the right, what happened; between them, what is being read
 * or decided (the world working, the stop as it is written and read, the ways open). The two side columns stay in
 * every phase of a stop; what is laid over the page covers only the middle.
 */
export const COLS = { edge: 36, side: 264, gap: 26, top: 92, bar: 54 } as const;

/** How far the middle column stands in from either edge of the window. */
export const MIDDLE_INSET = COLS.edge + COLS.side + COLS.gap;
