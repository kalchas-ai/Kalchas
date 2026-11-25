import { LOWER, ROUND } from "./skeletons";

/**
 * Two faces made into one. A letter is a skeleton (the middle line of each of its strokes) with a stroke laid on it, and
 * the two are kept apart here so that the skeleton can be one face's and the stroke the other's:
 *
 * - the skeleton is Syne's (every letter wide, and about as wide as the next), Marcellus's (the widths of Roman
 *   inscriptions: L and S narrow, C round and wide), or anywhere between;
 * - the stroke is Syne's (one thickness, ends cut flat), Marcellus's (ends that open a little, as a chisel leaves them,
 *   and thick and thin as a broad pen makes them), or anywhere between.
 *
 * The straight letters' skeletons are measured off the faces' outlines; the round ones (C, S) are found by a script
 * (skeletons.ts). The capital's height is 1000 and y goes up; paths come out with y going down, for SVG.
 */

type V = [number, number];

export type Fuse = {
  /** whose skeleton: 0 Syne's, 1 Marcellus's */
  skel: number;
  /** how thick a stem is */
  weight: number;
  /** how thick a stroke lying flat is, next to a stem */
  thin: number;
  /** the angle of the pen, in degrees: 0 thins only what lies flat; more, and what rises to the right thins too */
  nib: number;
  /** how much a stroke's end opens on each side, as a share of the stem */
  flare: number;
  /** where strokes turn: 0 a corner, else the radius of the turn as a share of the stem */
  round: number;
  /** the white between two letters: what two stems side by side stand apart */
  gap: number;
  /** how far every letter is brought to one width (0 each as wide as its face has it, 1 all the same), by redrawing it wider or narrower */
  even: number;
  /** how far the one width is as the eye has it and not as a ruler does (a round letter a little wider, an L a little narrower): 0 the ruler's, 1 the eye's, 2 twice that */
  eye: number;
  /** the other way to one width: the letters as they are, each in the middle of a box, all boxes as wide (as a typewriter sets them) */
  cells: boolean;
  /**
   * How far the drawing is finished, each step with those before it. 1 the ends: an opening is shorter, opens as much
   * along an end cut aslant as along one cut across, and a round letter's end is cut exactly as its face cuts it.
   * 2 the joints: the K's arm and leg go into the stem and do not only touch it, the pointed A stands a little above
   * the capitals, and a stroke that slants is a little thinner than a stem, as it looks heavier. 3 the spacing: no
   * two letters come as near as they did.
   */
  fine: number;
};

/** Syne Medium's own stroke on its own skeleton. */
export const FUSE: Fuse = { skel: 0, weight: 148, thin: 0.894, nib: 0, flare: 0, round: 0, gap: 300, even: 0, eye: 0, cells: false, fine: 0 };

const CAP = 1000;
/** How tall a small letter is, and how tall the small letters that rise (l, h) are: Syne's. */
const XH = LOWER.xh;
const ASC = LOWER.asc;
const FLAT: V = [1, 0];
/** No round letter's end is cut further from straight across than this (Marcellus's own are, into a beak). */
const SLANT = 0.42;

/** Measured off the faces: distances from the (first) stem's middle, or for A from its left foot's. */
const STRAIGHT = {
  syne: { K: { arm: 660.6, leg: 726, j: 523.8 }, L: { bar: 662 }, H: { w: 800.2, bar: 499.9 }, A: { w: 817.4, apex: 407.6, bar: 314.5 } },
  marcellus: { K: { arm: 639.3, leg: 656.6, j: 578.6 }, L: { bar: 434.5 }, H: { w: 671.6, bar: 514.6 }, A: { w: 850.1, apex: 427.5, bar: 359.8 } },
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];
const cross = (a: V, b: V) => a[0] * b[1] - a[1] * b[0];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1];
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
const left = (d: V): V => [-d[1], d[0]];

/**
 * How thick a stroke going in a direction is: as a broad pen held at an angle would leave it, thinnest along the pen
 * and thickest across it, and changing smoothly between (a kink in the thickness is a corner in the outline). A stem
 * is the weight, and what lies flat is `thin` of it.
 */
function thick(S: Fuse, d: V) {
  const phi = (S.nib * Math.PI) / 180;
  const c2 = Math.cos(phi) ** 2;
  const s2 = 1 - c2;
  const r = Math.min(1, (S.thin * c2 - s2) / (c2 * (1 + S.thin) - S.thin));
  const th = Math.atan2(d[1], d[0]);
  const slanting = S.fine >= 2 ? 1 - 0.035 * Math.sin(2 * th) ** 2 : 1;
  return (S.weight * slanting * (r + (1 - r) * Math.sin(th - phi) ** 2)) / (r + (1 - r) * c2);
}

/** A line with each of its corners made a turn of radius R. */
function turned(line: V[], R: number): V[] {
  if (!(R > 0)) return line;
  const out: V[] = [line[0]];
  for (let i = 1; i < line.length - 1; i++) {
    const d1 = unit(sub(line[i], line[i - 1]));
    const d2 = unit(sub(line[i + 1], line[i]));
    const c = cross(d1, d2);
    const turn = Math.atan2(Math.abs(c), dot(d1, d2));
    if (turn < 0.05) {
      out.push(line[i]);
      continue;
    }
    const room = 0.46 * Math.min(Math.hypot(...sub(line[i], line[i - 1])), Math.hypot(...sub(line[i + 1], line[i])));
    const r = Math.min(R, room / Math.tan(turn / 2));
    const tl = r * Math.tan(turn / 2);
    const s = Math.sign(c);
    const a = add(line[i], d1, -tl);
    const o = add(a, left(d1), s * r);
    const a0 = Math.atan2(a[1] - o[1], a[0] - o[0]);
    const n = Math.max(4, Math.ceil(turn / 0.06));
    for (let k = 0; k <= n; k++) {
      const ang = a0 + (s * turn * k) / n;
      out.push([o[0] + r * Math.cos(ang), o[1] + r * Math.sin(ang)]);
    }
  }
  out.push(line[line.length - 1]);
  return out;
}

type End = {
  /** the end is a stroke's own end and not a joint: it opens */
  free?: boolean;
  /** the direction the end is cut along; across the stroke if not given */
  cut?: V;
  /** it opens on one side only: 1 the left of the way the line runs, -1 the right */
  side?: 1 | -1;
  /** a round stroke's end, which opens less than a straight one's */
  less?: boolean;
  /** the end is a joint the stroke thins into (a shoulder leaving a stem): how thick it is there, as a share of what it is elsewhere */
  thins?: number;
};

/** The shape of a stroke laid on a middle line. */
function stroke(S: Fuse, line: V[], a: End = {}, b: End = {}): V[] {
  const w = S.weight;
  const f = S.flare * w;
  let pts = line.slice();
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(...sub(pts[i], pts[i - 1]));
  const D = Math.min((S.fine >= 1 ? 1.35 : 2) * w, 0.48 * total);

  // points along a straight first stretch, for the end's opening to be drawn through
  const dense = (p: V[]) => {
    const l = Math.hypot(...sub(p[1], p[0]));
    if (l < 60) return p;
    const d = unit(sub(p[1], p[0]));
    const more: V[] = [];
    for (let k = 1; k <= 14; k++) {
      const s = (D * k) / 14;
      if (s < l - 1) more.push(add(p[0], d, s));
    }
    return [p[0], ...more, ...p.slice(1)];
  };
  if (f > 0 && a.free) pts = dense(pts);
  if (f > 0 && b.free) pts = dense(pts.reverse()).reverse();

  // an end that is cut aslant is first drawn past where it ends, then cut back
  const E = 1.8 * (w / 2 + f * 1.5);
  const endA = pts[0];
  const endB = pts[pts.length - 1];
  const outA = unit(sub(pts[0], pts[1]));
  const outB = unit(sub(pts[pts.length - 1], pts[pts.length - 2]));
  if (a.cut) pts = [add(endA, outA, E), ...pts];
  if (b.cut) pts = [...pts, add(endB, outB, E)];

  const s: number[] = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
  const sA = a.cut ? E : 0;
  const sB = s[s.length - 1] - (b.cut ? E : 0);
  // an end cut aslant is longer than the stroke is thick, and what it opens by is measured along it
  const along = (out: V, e: End) => (e.less ? 0.6 : 1) * (S.fine >= 1 && e.cut ? Math.abs(cross(out, unit(e.cut))) : 1);
  const fA = f * along(outA, a);
  const fB = f * along(outB, b);
  const one = S.fine >= 1 ? 1 : 1.5;
  const open = (d: number, by: number) => (d < D ? by * (1 - d / D) ** 2 : 0);

  let L: V[] = [];
  let R: V[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const d1 = unit(sub(pts[Math.max(i, 1)], pts[Math.max(i, 1) - 1]));
    const d2 = unit(sub(pts[Math.min(i, n - 2) + 1], pts[Math.min(i, n - 2)]));
    const oa = a.free ? open(Math.max(0, s[i] - sA), fA) : 0;
    const ob = b.free ? open(Math.max(0, sB - s[i]), fB) : 0;
    const fl = [oa * (a.side === -1 ? 0 : a.side === 1 ? one : 1) + ob * (b.side === -1 ? 0 : b.side === 1 ? one : 1), oa * (a.side === 1 ? 0 : a.side === -1 ? one : 1) + ob * (b.side === 1 ? 0 : b.side === -1 ? one : 1)];
    const thinned = (e: End, d: number) => {
      if (!e.thins) return 1;
      const u = Math.min(1, d / Math.min(2.6 * w, 0.4 * total));
      return e.thins + (1 - e.thins) * u * u * (3 - 2 * u);
    };
    const thin = thinned(a, Math.max(0, s[i] - sA)) * thinned(b, Math.max(0, sB - s[i]));
    const h1 = (thick(S, d1) / 2) * thin;
    const h2 = (thick(S, d2) / 2) * thin;
    const c = cross(d1, d2);
    [1, -1].forEach((side, j) => {
      const p1 = add(pts[i], left(d1), side * (h1 + fl[j]));
      const p2 = add(pts[i], left(d2), side * (h2 + fl[j]));
      let q: V;
      if (Math.abs(c) < 1e-4) q = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      else q = add(p1, d1, cross(sub(p2, p1), d2) / c);
      (j ? R : L).push(q);
    });
  }

  const trim = (side: V[], P: V, out: V, u: V): V[] => {
    let c = left(unit(u));
    if (dot(c, out) < 0) c = [-c[0], -c[1]];
    const g = (q: V) => dot(sub(q, P), c);
    let j = 0;
    while (j < side.length - 1 && j < 32 && g(side[j]) > 0) j++;
    if (j === 0 || g(side[j]) > 0) return side;
    const g0 = g(side[j - 1]);
    const g1 = g(side[j]);
    const t = g0 / (g0 - g1 || 1);
    return [add(side[j - 1], sub(side[j], side[j - 1]), t), ...side.slice(j)];
  };
  if (a.cut) {
    L = trim(L, endA, outA, a.cut);
    R = trim(R, endA, outA, a.cut);
  }
  if (b.cut) {
    L = trim(L.reverse(), endB, outB, b.cut).reverse();
    R = trim(R.reverse(), endB, outB, b.cut).reverse();
  }
  return [...L, ...R.reverse()];
}

type Glyph = { shapes: V[][] };

function measures(S: Fuse) {
  const a = STRAIGHT.syne;
  const b = STRAIGHT.marcellus;
  const t = S.skel;
  return {
    K: { arm: mix(a.K.arm, b.K.arm, t), leg: mix(a.K.leg, b.K.leg, t), j: mix(a.K.j, b.K.j, t) },
    L: { bar: mix(a.L.bar, b.L.bar, t) },
    H: { w: mix(a.H.w, b.H.w, t), bar: mix(a.H.bar, b.H.bar, t) },
    A: { w: mix(a.A.w, b.A.w, t), apex: mix(a.A.apex, b.A.apex, t), bar: mix(a.A.bar, b.A.bar, t) },
  };
}

const stemEnds: [End, End] = [{ free: true }, { free: true }];

function K(S: Fuse, k: number): Glyph {
  const m0 = measures(S).K;
  const m = { arm: m0.arm * k, leg: m0.leg * k, j: m0.j };
  const w = S.weight;
  const stem = stroke(S, [[0, 0], [0, CAP]], ...stemEnds);
  // the arm and the leg are one line, bent where it meets the stem
  const bent = (jx: number) => stroke(S, turned([[m.arm, CAP], [jx, m.j], [m.leg, 0]], S.round * w), { free: true, cut: FLAT }, { free: true, cut: FLAT });
  const reach = (shape: V[]) => Math.min(...shape.map((p) => p[0]));
  const into = w / 2 - (S.round ? 0.5 : S.fine >= 2 ? 0.14 : 0.01) * w;
  let jx = w;
  for (let i = 0; i < 3; i++) jx += into - reach(bent(jx));
  return { shapes: [stem, bent(jx)] };
}

function L(S: Fuse, k: number): Glyph {
  const m = { bar: measures(S).L.bar * k };
  const w = S.weight;
  const y = thick(S, FLAT) / 2;
  if (S.round) return { shapes: [stroke(S, turned([[0, CAP], [0, y], [m.bar, y]], S.round * w), { free: true }, { free: true, side: 1 })] };
  return { shapes: [stroke(S, [[0, 0], [0, CAP]], {}, { free: true }), stroke(S, [[-w / 2, y], [m.bar, y]], {}, { free: true, side: 1 })] };
}

function H(S: Fuse, k: number): Glyph {
  const m0 = measures(S).H;
  const m = { w: m0.w * k, bar: m0.bar };
  return { shapes: [stroke(S, [[0, 0], [0, CAP]], ...stemEnds), stroke(S, [[m.w, 0], [m.w, CAP]], ...stemEnds), stroke(S, [[0, m.bar], [m.w, m.bar]])] };
}

/** A, with its bar or (the Greek way) without. */
function A(S: Fuse, bar: boolean, k: number, tall = CAP): Glyph {
  const m0 = measures(S).A;
  const m = { w: m0.w * k, apex: m0.apex * k, bar: (m0.bar * tall) / CAP };
  const w = S.weight;
  const shapes: V[][] = [];
  let lx = m.apex;
  let rx = m.apex;
  if (S.round) {
    // one line over the top; the top is lifted until the turn stands a little above the capitals
    const over = (top: number) => stroke(S, turned([[0, 0], [m.apex, top], [m.w, 0]], S.round * w), { free: true, cut: FLAT }, { free: true, cut: FLAT });
    let top = tall;
    for (let i = 0; i < 4; i++) top += tall + 12 - Math.max(...over(top).map((p) => p[1]));
    shapes.push(over(top));
  } else {
    // two strokes cut flat at the top; the thinner one's outer edge meets the thicker one's
    const dl = unit([m.apex, tall]);
    const dr = unit([m.apex - m.w, tall]);
    const hl = thick(S, dl) / 2 / Math.abs(dl[1]);
    const hr = thick(S, dr) / 2 / Math.abs(dr[1]);
    lx = m.apex - Math.max(0, hr - hl);
    rx = m.apex + Math.max(0, hl - hr);
    const top = tall + (S.fine >= 2 ? 10 : 0);
    shapes.push(stroke(S, [[0, 0], [lx, top]], { free: true, cut: FLAT }, { cut: FLAT }));
    shapes.push(stroke(S, [[m.w, 0], [rx, top]], { free: true, cut: FLAT }, { cut: FLAT }));
  }
  if (bar) shapes.push(stroke(S, [[(lx * m.bar) / tall, m.bar], [m.w + ((rx - m.w) * m.bar) / tall, m.bar]]));
  return { shapes };
}

type Curve = { box: readonly number[]; cuts: readonly (readonly [number, number])[]; pts: readonly (readonly [number, number])[] };

/** A letter that is one round stroke (C, S, c, s): `a`'s middle line, or some of the way to `b`'s. */
function round(S: Fuse, a: Curve, b: Curve, t: number, k: number): Glyph {
  const pts: V[] = a.pts.map((p, i) => [mix(p[0], b.pts[i][0], t), mix(p[1], b.pts[i][1], t)]);
  // the stroke's thickness is not the face's own, so the line is moved until the letter is as tall as the face's
  const th = thick(S, FLAT);
  const lo = mix(a.box[1], b.box[1], t) + th / 2;
  const hi = mix(a.box[3], b.box[3], t) - th / 2;
  const y0 = Math.min(...pts.map((p) => p[1]));
  const y1 = Math.max(...pts.map((p) => p[1]));
  const x0 = Math.min(...pts.map((p) => p[0]));
  for (const p of pts) {
    p[1] = lo + ((p[1] - y0) / (y1 - y0)) * (hi - lo);
    p[0] = x0 + (p[0] - x0) * k;
  }
  // how far from straight across each face cuts an end, taken over to this line's own end
  const out = (line: readonly (readonly [number, number])[], i: number): V => {
    const n = line.length;
    return unit(i ? [line[n - 1][0] - line[n - 4][0], line[n - 1][1] - line[n - 4][1]] : [line[0][0] - line[3][0], line[0][1] - line[3][1]]);
  };
  const slant = (g: Curve, i: number) => {
    const n = left(out(g.pts, i));
    const u: V = [g.cuts[i][0], g.cuts[i][1]];
    let ang = Math.atan2(cross(n, u), dot(n, u));
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang <= -Math.PI / 2) ang += Math.PI;
    return Math.max(-SLANT, Math.min(SLANT, ang));
  };
  // each face's own line, moved as this one was, so that what its cut is measured against is what it will be put on:
  // on a face's own skeleton the cut is then exactly the face's, and between two it is between theirs
  const moved = (g: Curve): Curve => {
    const gy0 = Math.min(...g.pts.map((p) => p[1]));
    const gy1 = Math.max(...g.pts.map((p) => p[1]));
    const gx0 = Math.min(...g.pts.map((p) => p[0]));
    return { ...g, pts: g.pts.map((p) => [gx0 + (p[0] - gx0) * k, lo + ((p[1] - gy0) / (gy1 - gy0)) * (hi - lo)] as const) };
  };
  const [fa, fb] = S.fine >= 1 ? [moved(a), moved(b)] : [a, b];
  const cut = (i: number): V => {
    const n = left(out(pts, i));
    const ang = mix(slant(fa, i), slant(fb, i), t);
    return [n[0] * Math.cos(ang) - n[1] * Math.sin(ang), n[0] * Math.sin(ang) + n[1] * Math.cos(ang)];
  };
  return { shapes: [stroke(S, pts, { free: true, less: true, cut: cut(0) }, { free: true, less: true, cut: cut(1) })] };
}

/** Syne's small h: a stem, and a shoulder that leaves it and comes down as a leg. */
function h(S: Fuse): Glyph {
  const g = LOWER.h;
  const pts: V[] = g.pts.map((p) => [p[0], p[1]]);
  // back into the stem, the way the shoulder is going where it leaves it
  const d = unit(sub(pts[0], pts[2]));
  const line: V[] = [add(pts[0], d, S.weight * 0.3), ...pts, [g.leg, 0]];
  return { shapes: [stroke(S, [[g.stem, 0], [g.stem, ASC]], ...stemEnds), stroke(S, line, { thins: 0.3 }, { free: true })] };
}

/** Syne's small a: a ring and a stem. The ring is laid around the white inside it, so that the white stays the face's. */
function a(S: Fuse): Glyph {
  const g = LOWER.a;
  const n = g.ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += cross(g.ring[i] as unknown as V, g.ring[(i + 1) % n] as unknown as V);
  const way = area > 0 ? -1 : 1;
  // the middle of the ring's stroke: outside the white by half of what Syne's own stroke is
  const mid: V[] = [];
  const dirs: V[] = [];
  for (let i = 0; i < n; i++) {
    const p = g.ring[i];
    const q0 = g.ring[(i + n - 1) % n];
    const q1 = g.ring[(i + 1) % n];
    const d = unit([q1[0] - q0[0], q1[1] - q0[1]]);
    dirs.push(d);
    mid.push(add([p[0], p[1]], left(d), (way * thick(FUSE, d)) / 2));
  }
  // as tall as the face's, whatever the stroke
  const th = thick(S, FLAT);
  const lo = g.box[1] + th / 2;
  const hi = g.box[3] - th / 2;
  const y0 = Math.min(...mid.map((p) => p[1]));
  const y1 = Math.max(...mid.map((p) => p[1]));
  for (const p of mid) p[1] = lo + ((p[1] - y0) / (y1 - y0)) * (hi - lo);
  const outer = mid.map((p, i) => add(p, left(dirs[i]), (way * thick(S, dirs[i])) / 2));
  const inner = mid.map((p, i) => add(p, left(dirs[i]), (-way * thick(S, dirs[i])) / 2));
  // one shape with a hole: round the outside, across, and back round the inside the other way
  const ring: V[] = [...outer, outer[0], inner[0], ...inner.slice(1).reverse(), inner[0]];
  return { shapes: [ring, stroke(S, [[g.stem, 0], [g.stem, XH]], ...stemEnds)] };
}

/** A letter, its skeleton `k` times as wide as the face has it (the stroke on it no thicker and no thinner). */
function drawn(S: Fuse, ch: string, k: number): Glyph | null {
  if (ch === "K") return K(S, k);
  if (ch === "A") return A(S, true, k);
  if (ch === "Λ") return A(S, false, k);
  if (ch === "L") return L(S, k);
  if (ch === "C" || ch === "S") return round(S, ROUND.syne[ch], ROUND.marcellus[ch], S.skel, k);
  if (ch === "H") return H(S, k);
  // the small letters are Syne's, whatever the skeleton, and are as wide as Syne has them
  if (ch === "c" || ch === "s") return round(S, LOWER[ch], LOWER[ch], 0, 1);
  if (ch === "l") return { shapes: [stroke(S, [[0, 0], [0, ASC]], ...stemEnds)] };
  if (ch === "h") return h(S);
  if (ch === "a") return a(S);
  // the pointed A, as tall as a small letter
  if (ch === "ʌ") return A(S, false, XH / CAP, XH);
  return null;
}

const LETTERS = ["K", "Λ", "L", "C", "H", "S"];
/** What the eye asks of each letter for all to look one width: a round one is wider than it looks, an L narrower. */
const EYE: Record<string, number> = { K: 1, A: 1.05, Λ: 1.05, L: 0.92, C: 1.04, H: 0.97, S: 0.95 };
const EYES = LETTERS.reduce((sum, c) => sum + EYE[c], 0) / LETTERS.length;

/** How wide a letter's ink is, its ends not opened (so that opening them does not change how wide the letter is made). */
function inkWidth(S: Fuse, ch: string, k: number) {
  const g = drawn({ ...S, flare: 0 }, ch, k);
  if (!g) return 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const sh of g.shapes) for (const p of sh) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
  }
  return x1 - x0;
}

const scales = new WeakMap<Fuse, Record<string, number>>();

/** How much wider or narrower a letter's skeleton is made, for every letter to be one width: the mean of what they were. */
function scale(S: Fuse, ch: string) {
  if (!S.even || !(ch in EYE)) return 1;
  let known = scales.get(S);
  if (!known) scales.set(S, (known = {}));
  if (known[ch]) return known[ch];
  const mean = LETTERS.reduce((sum, c) => sum + inkWidth(S, c, 1), 0) / LETTERS.length;
  const want = mix(inkWidth(S, ch, 1), mean * (1 + (EYE[ch] / EYES - 1) * S.eye), S.even);
  let a = 0.4;
  let b = 2.5;
  for (let i = 0; i < 24; i++) {
    const mid = (a + b) / 2;
    if (inkWidth(S, ch, mid) < want) a = mid;
    else b = mid;
  }
  // a round letter pulled much wider is no longer that letter (Marcellus's narrow S goes flat), so it is pulled only so far
  const k = (a + b) / 2;
  return (known[ch] = ch === "C" || ch === "S" ? Math.min(k, 1.2) : k);
}

function glyph(S: Fuse, ch: string): Glyph | null {
  return drawn(S, ch, scale(S, ch));
}

const BANDS = 40;

/** Where a letter's ink begins and ends at each height, for setting letters by the white between them. */
function edges(shapes: V[][]) {
  const lo = new Array<number>(BANDS).fill(Infinity);
  const hi = new Array<number>(BANDS).fill(-Infinity);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const sh of shapes) {
    for (let i = 0; i < sh.length; i++) {
      const p = sh[i];
      const q = sh[(i + 1) % sh.length];
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      for (let k = 0; k < BANDS; k++) {
        const y = ((k + 0.5) * CAP) / BANDS;
        if (p[1] > y === q[1] > y) continue;
        const x = p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]);
        lo[k] = Math.min(lo[k], x);
        hi[k] = Math.max(hi[k], x);
      }
    }
  }
  return { lo, hi, x0, x1 };
}

const fmt = (v: number) => String(Math.round(v * 10) / 10);

function path(shapes: V[][], dx: number) {
  return shapes
    .map((sh) => {
      // every shape the same way round, so that where two lie over each other they add and do not cancel
      let area = 0;
      for (let i = 0; i < sh.length; i++) area += cross(sh[i], sh[(i + 1) % sh.length]);
      const pts = area < 0 ? sh.slice().reverse() : sh;
      return "M" + pts.map((p) => `${fmt(p[0] + dx)} ${fmt(-p[1])}`).join("L") + "Z";
    })
    .join("");
}

export type Set = { d: string; x0: number; x1: number; top: number; bottom: number };

/**
 * A word, set. Letters are put so that the white between each two is the same: at every height the gap is measured,
 * no gap counting for more than a certain depth (the open side of an L or a Λ is not all white that the eye gives to
 * the pair), and no two letters coming nearer than a part of that anywhere.
 */
export function set(S: Fuse, text: string): Set {
  const depth = S.gap * 1.25 + 40;
  const least = S.gap * (S.fine >= 3 ? 0.56 : 0.42);
  // as a typewriter sets: every letter in the middle of a box as wide as the widest
  const box = S.cells ? Math.max(...LETTERS.map((c) => inkWidth(S, c, 1))) + S.gap * 0.45 : 0;
  let n = 0;
  let pen = 0;
  let d = "";
  let prev: ReturnType<typeof edges> | null = null;
  let prevAt = 0;
  let top = CAP;
  let bottom = 0;
  for (const ch of text) {
    const g = glyph(S, ch);
    if (!g) continue;
    const e = edges(g.shapes);
    let at = -e.x0;
    if (S.cells) at = n * box + (box - (e.x1 - e.x0)) / 2 - e.x0;
    else if (prev) {
      const p = prev;
      // the white between the two, were their boxes to touch
      // (only at the heights where both have ink: above a small letter there is nothing to measure to)
      const open = p.hi.map((x, k) => (x === -Infinity || e.lo[k] === Infinity ? Infinity : p.x1 - x + (e.lo[k] - e.x0))).filter((o) => o !== Infinity);
      const white = (gap: number) => open.reduce((sum, o) => sum + Math.min(depth, Math.max(0, o + gap)), 0) / (open.length || 1);
      let a = -depth * 2;
      let b = depth * 2;
      for (let k = 0; k < 40; k++) {
        const mid = (a + b) / 2;
        if (white(mid) < S.gap) a = mid;
        else b = mid;
      }
      const gap = Math.max((a + b) / 2, least - Math.min(...open));
      at = prevAt + p.x1 + gap - e.x0;
    }
    d += path(g.shapes, at);
    for (const sh of g.shapes) for (const q of sh) {
      top = Math.max(top, q[1]);
      bottom = Math.min(bottom, q[1]);
    }
    prev = e;
    prevAt = at;
    pen = at + e.x1;
    n++;
  }
  return { d, x0: 0, x1: pen, top, bottom };
}

/** The word as an SVG of its own. */
export function svg(S: Fuse, text: string, fill: string, pad = 60) {
  const W = set(S, text);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${W.x0 - pad} ${-W.top - pad} ${W.x1 - W.x0 + pad * 2} ${W.top - W.bottom + pad * 2}"><path fill="${fill}" d="${W.d}"/></svg>`;
}
