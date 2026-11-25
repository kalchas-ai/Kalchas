import { MONO, SANS } from "./fonts";

/** The product's two palettes (graphite and bone) and its type: the same as the homepage's. */

export { MONO, SANS };

export type PaletteName = "graphite" | "bone";
export type Pal = {
  name: PaletteName;
  page: string;
  ink: string;
  mute: string;
  warm: string;
  /** "r g b" of the page, the ink and the warm accent, for translucent fills: `rgb(${P.inkRgb} / 0.1)`. */
  pageRgb: string;
  inkRgb: string;
  warmRgb: string;
  rule: string;
  faint: string;
  panel: string;
  /** Four steps from the page to the ink, and four from the page to the brightest warm: the dither's colours. */
  ramp: string[];
  accent: string[];
};

// the same colours as the homepage (components/stage/dither.ts), repeated here so these pages don't load three.js
const BASE = {
  graphite: { page: "#101113", ink: "#ecebe6", mute: "#9a9ea6", warm: "#f0b060", pageRgb: "16 17 19", inkRgb: "236 235 230", warmRgb: "240 176 96", ramp: ["#101113", "#34373c", "#8d9198", "#ecebe6"], accent: ["#101113", "#5b3a14", "#c9852c", "#ffd9a3"] },
  bone: { page: "#ebe7de", ink: "#151515", mute: "#5d5a55", warm: "#b8601a", pageRgb: "235 231 222", inkRgb: "21 21 21", warmRgb: "184 96 26", ramp: ["#ebe7de", "#b8b3a9", "#5d5a55", "#151515"], accent: ["#ebe7de", "#e4b98a", "#b8601a", "#5a2b06"] },
};

export function palette(name: PaletteName): Pal {
  const b = BASE[name];
  return { name, ...b, rule: `rgb(${b.inkRgb} / 0.13)`, faint: `rgb(${b.inkRgb} / 0.42)`, panel: `rgb(${b.inkRgb} / 0.035)` };
}
