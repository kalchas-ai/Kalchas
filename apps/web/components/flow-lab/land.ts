/**
 * The world's sheet as the lie of a land (Field.net 11), which was chosen over the deep wells (6) it was before.
 * Seen from the side, deep narrow wells with everything circling their walls were cups, and the ridges between
 * them arched like jets of water: a fountain; and everyone was on rings round you, inside a round disc, inside a
 * round belt, inside a round line of time. So now: a well is shallower and wider; it is not round (it is wider one
 * way than another, each in its own way); the ground rises and falls where no one is, and lies in uneven bands;
 * and the edge of the ground, the belt of crowds and the line of time are not circles.
 *
 * The numbers here are the ones the picture's own program goes by (field.ts, the same formulas there), so that
 * whoever is set down on the sheet by hand (faces, names, marks on the belt and on the line of time) is where the
 * grains are.
 */

/** The way of drawing the sheet that was chosen. */
export const LAND = 11;

const DEEP = 0.62;
const WIDE = 1.3;
const LOBE = 0.3;
const SWELL = 0.32;
const EDGE = 0.13;

/** How much shallower and wider a well is than it was as a deep well. */
export const landOf = (net: number) => (net === LAND ? { deep: DEEP, wide: WIDE } : { deep: 1, wide: 1 });

/** How much wider than round the well of body `i` is toward (dx, dz). */
export function lobeOf(net: number, i: number, dx: number, dz: number) {
  if (net !== LAND || dx * dx + dz * dz < 1e-9) return 1;
  const a = Math.atan2(dz, dx);
  const f = i * 1.7;
  return 1 + LOBE * (0.6 * Math.sin(2 * a + f) + 0.4 * Math.sin(3 * a + f * 2.3 + 1));
}

/** How far the ground itself is above or below level at a place, where no one is. */
export function swellOf(net: number, x: number, z: number) {
  return net === LAND ? SWELL * (Math.sin(x * 0.71 + 1.3) * Math.sin(z * 0.53 - 0.7) + 0.6 * Math.sin(x * 0.31 - z * 0.47 + 2.1)) : 0;
}

/** How far out the edge of things is in a direction (an angle that does not turn with the world), as a share of round. */
export function edgeOf(net: number, a: number) {
  return net === LAND ? 1 + EDGE * (0.55 * Math.sin(2 * a + 0.8) + 0.3 * Math.sin(3 * a + 2.4) + 0.15 * Math.sin(5 * a + 0.3)) : 1;
}

/** The same for the line of time, which is outside everything and less out of round, so that it never crosses the belt. */
export const ringOf = (net: number, a: number) => (net === LAND ? 1.04 + 0.4 * (edgeOf(net, a) - 1) : 1);
