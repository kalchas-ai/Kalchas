/** Seeded random numbers, so every build of the sky is identical. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (R: () => number) => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R());

/**
 * What a page wants drawn, described in its own CSS pixels: galaxies, neurons, stars, the lines between them, fog,
 * streams of light, rings. The builder turns each into many small points (all on the GPU afterwards, see sky.tsx),
 * so a page only says "here is a galaxy of 40 finds" and gets a galaxy, not a dot.
 *
 * Everything with an `id` can be lit, warmed, enlarged or fired later without rebuilding (see `Level`).
 * `born` is a time on the sky's clock (`skyNow()`, seconds): the thing appears then (a find flares in, a line grows).
 */

export const DUST = 0, BODY = 1, LINK = 2, STREAM = 3, FOG = 4, PULSE = 5;

export const skyNow = () => (typeof performance === "undefined" ? 0 : performance.now() / 1000);

/** How a thing looks right now: brightness ×, warm (0…1), size ×; `fire` sends a signal through it (once per new value). */
export type Level = { lit?: number; warm?: number; size?: number; fire?: number };

/**
 * `move`: the thing it travels with when the picture is laid out again (default: its own id). A thing that moves
 * glides from where it was to where it is now instead of jumping; so do the parts that travel with it.
 */
type Common = { id?: string; born?: number; warm?: number; b?: number; seed?: number; move?: string };

export type SkyScene = {
  pos: Float32Array;
  ctr: Float32Array;
  size: Float32Array;
  seed: Float32Array;
  warm: Float32Array;
  group: Float32Array;
  ext: Float32Array;
  anchor: Float32Array;
  count: number;
  groups: Map<string, number>;
  /** Where each thing that can move sits (by id), to glide it from its old place when the picture is rebuilt. */
  centers: Map<string, [number, number]>;
};

const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export class SkyBuilder {
  private pos: number[] = [];
  private ctr: number[] = [];
  private size: number[] = [];
  private seed: number[] = [];
  private warm: number[] = [];
  private group: number[] = [];
  private ext: number[] = [];
  private anchor: number[] = [];
  private anchorNow: [number, number] = [0, 0];
  readonly groups = new Map<string, number>();
  readonly centers = new Map<string, [number, number]>();
  private R = rng(11);
  private ox = 0;
  private oy = 0;

  /** Moves everything added after this by (dx, dy): for a canvas that reaches past the box it is laid out in. */
  offset(dx: number, dy: number) {
    this.ox = dx;
    this.oy = dy;
    return this;
  }

  private g(id?: string) {
    if (!id) return 0;
    let n = this.groups.get(id);
    if (n == null) {
      n = Math.min(1023, this.groups.size + 1);
      this.groups.set(id, n);
    }
    return n;
  }
  /** A fixed random sequence for a thing, so it looks the same every time it is built. */
  private seq(c: Common, salt: string) {
    this.R = rng(1 + ((c.seed ?? hashStr(`${salt}:${c.id ?? ""}`)) % 2147483000));
    return this.R;
  }

  private add(kind: number, x: number, y: number, size: number, prm: number, o: { cx?: number; cy?: number; cz?: number; born?: number; warm?: number; group?: number; ext?: [number, number, number, number] } = {}) {
    this.pos.push(x + this.ox, y + this.oy, 0);
    // a pulse keeps its direction in ctr, not a place
    if (kind === PULSE) this.ctr.push(o.cx ?? 0, o.cy ?? 0, o.cz ?? 0);
    else this.ctr.push((o.cx ?? x) + this.ox, (o.cy ?? y) + this.oy, o.cz ?? 0);
    this.size.push(size);
    this.seed.push(kind, o.born ?? 0, this.R(), prm);
    this.warm.push(o.warm ?? 0);
    this.group.push(o.group ?? 0);
    this.ext.push(...(o.ext ?? [0, 1, 0, 0]));
    this.anchor.push(this.anchorNow[0], this.anchorNow[1]);
  }

  /** What the points added next travel with (a line: one end with `a`, the other with `b`). */
  private travel(a?: string, b?: string, at?: [number, number]) {
    const ia = a ? this.g(a) : 0;
    this.anchorNow = [ia, b ? this.g(b) : ia];
    if (a && at && !this.centers.has(a)) this.centers.set(a, [at[0] + this.ox, at[1] + this.oy]);
  }

  /** Faint far stars over the whole picture. */
  dust({ w, h, n, b = 1, seed = 3 }: { w: number; h: number; n: number; b?: number; seed?: number }) {
    const R = (this.R = rng(seed));
    this.anchorNow = [0, 0];
    for (let k = 0; k < n; k++) this.add(DUST, R() * w, R() * h, 1 + R() * 1.6, (0.05 + Math.pow(R(), 9) * 0.6) * b);
    return this;
  }

  /**
   * Dust laid at a depth (0 far … 1 near): it slides past as the picture drifts, the nearer the faster, and wraps
   * round the w × h it was laid over. Nearer dust is fewer, larger and brighter.
   */
  depth({ w, h, n, depth, b = 1, size = 1, seed = 5 }: { w: number; h: number; n: number; depth: number; b?: number; size?: number; seed?: number }) {
    const R = (this.R = rng(seed));
    this.anchorNow = [0, 0];
    for (let k = 0; k < n; k++) this.add(DUST, R() * w, R() * h, (1 + R() * 1.4) * size, (0.06 + Math.pow(R(), 7) * 0.7) * b, { ext: [Math.max(0.001, depth), w, h, 0] });
    return this;
  }

  /**
   * A milky way: a long soft band of fine dust across the picture at `angle`, fuller and brighter in clumps along its
   * length, with a darker lane down the middle; laid at `depth`, so it drifts with the far dust.
   */
  milky({ w, h, n, angle, spread, depth = 0.15, b = 1, seed = 9 }: { w: number; h: number; n: number; angle: number; spread: number; depth?: number; b?: number; seed?: number }) {
    const R = (this.R = rng(seed));
    this.anchorNow = [0, 0];
    const L = Math.hypot(w, h) * 1.1;
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
    const ph = R() * 6.28;
    for (let k = 0; k < n; k++) {
      const t = (R() - 0.5) * L;
      // clumps along the band, and its width breathing
      const clump = 0.55 + 0.45 * Math.sin(t * 0.008 + ph) * Math.sin(t * 0.0031 + ph * 2);
      if (R() > 0.35 + 0.65 * clump) continue;
      const g = gauss(R);
      const wide = spread * (0.7 + 0.3 * Math.sin(t * 0.004 + ph));
      const off = g * wide;
      // the dark lane: fewer and dimmer near the middle line
      const lane = Math.exp(-Math.pow(off / (wide * 0.22), 2));
      if (R() < lane * 0.55) continue;
      const x = w / 2 + ux * t - uy * off;
      const y = h / 2 + uy * t + ux * off;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const v = (0.05 + 0.2 * Math.exp(-g * g * 0.8) * clump + Math.pow(R(), 16) * 0.8) * b;
      this.add(DUST, (x + w) % w, (y + h) % h, 0.8 + R() * 1.2, v, { ext: [Math.max(0.001, depth), w, h, 0] });
    }
    return this;
  }

  /**
   * A galaxy: a bright bulge and spiral arms, seen at a slant (`squash` 1 = face on), slowly turning.
   * `n` sets how full it is; `flare` makes it flash warm when it is born.
   */
  galaxy(c: Common & { x: number; y: number; r: number; n: number; squash?: number; turn?: number; arms?: number; spin?: number; flare?: number }) {
    const R = this.seq(c, "galaxy");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, [c.x, c.y]);
    const b = c.b ?? 1;
    const arms = c.arms ?? 2;
    const turn = c.turn ?? (R() - 0.5) * 1.2;
    const ext: [number, number, number, number] = [c.spin ?? 0.05, c.squash ?? 0.45, turn, c.flare ?? 0];
    const n = Math.max(60, Math.round(c.n));
    for (let k = 0; k < n; k++) {
      const bulge = k < n * 0.28;
      let x: number, y: number, s: number, v: number;
      if (bulge) {
        const rr = Math.abs(gauss(R)) * c.r * 0.16;
        const a = R() * Math.PI * 2;
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
        s = 1.1 + R() * 1.6;
        v = 0.22 + 0.5 * Math.exp(-rr / (c.r * 0.08));
      } else {
        const t = Math.pow(R(), 0.75);
        const arm = (k % arms) / arms;
        const a = arm * Math.PI * 2 + t * 2.6 + gauss(R) * (0.18 + 0.1 * t);
        const rr = c.r * (0.1 + 0.9 * t) + gauss(R) * c.r * 0.04;
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
        s = 0.8 + R() * 1.1 + (R() < 0.03 ? 1.8 : 0);
        v = (0.07 + 0.2 * (1 - t) + Math.pow(R(), 12) * 0.7) * (R() < 0.5 ? 1 : 0.6);
      }
      this.add(BODY, c.x + x, c.y + y, s, v * b, { cx: c.x, cy: c.y, born: c.born, warm: c.warm, group, ext });
    }
    // a faint halo round it
    for (let k = 0; k < n * 0.15; k++) {
      const a = R() * Math.PI * 2;
      const rr = c.r * (0.9 + R() * 0.7);
      this.add(BODY, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, 0.9, 0.035 * b, { cx: c.x, cy: c.y, born: c.born, group, ext });
    }
    return this;
  }

  /**
   * A neuron: a dense body and branching dendrites; `axon` (an angle) gives it one longer branch. Dendrites grow out
   * from the body when it is born.
   */
  neuron(c: Common & { x: number; y: number; r: number; dendrites?: number; reach?: number; axon?: number; flare?: number; parts?: "all" | "soma" | "branches" }) {
    const R = this.seq(c, "neuron");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, [c.x, c.y]);
    const b = c.b ?? 1;
    const born = c.born ?? 0;
    const ext: [number, number, number, number] = [0, 1, 0, c.flare ?? 0];
    const parts = c.parts ?? "all";
    const soma = parts === "branches" ? 0 : Math.round(40 + c.r * 7);
    for (let k = 0; k < soma; k++) {
      const rr = Math.abs(gauss(R)) * c.r * 0.42;
      const a = R() * Math.PI * 2;
      this.add(BODY, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr * 0.9, 1 + R() * 1.4, (0.18 + 0.55 * Math.exp(-rr / (c.r * 0.22))) * b, { born, warm: c.warm, group, ext });
    }
    // the glow of the body
    if (parts !== "branches") this.add(BODY, c.x, c.y, c.r * 2.4, 0.16 * b, { born, warm: c.warm, group, ext });
    if (parts === "soma") return this;
    const reach = c.reach ?? c.r * 3.2;
    const branch = (x0: number, y0: number, a0: number, len: number, depth: number, delay: number) => {
      const steps = Math.max(6, Math.round(len / 2.2));
      let x = x0;
      let y = y0;
      let a = a0;
      const bend = (R() - 0.5) * 0.06;
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        a += bend + gauss(R) * 0.05;
        x += Math.cos(a) * (len / steps);
        y += Math.sin(a) * (len / steps);
        const v = (0.32 - 0.22 * u) * (depth ? 0.7 : 1) * b;
        this.add(BODY, x + gauss(R) * 0.5, y + gauss(R) * 0.5, depth ? 0.85 : 1.05, v, { born: born ? born + delay + u * 0.7 : 0, warm: c.warm, group, ext });
        if (depth < 2 && i === Math.round(steps * (0.45 + R() * 0.2))) {
          branch(x, y, a + 0.5 + R() * 0.3, len * (0.45 + R() * 0.15), depth + 1, delay + u * 0.7);
          branch(x, y, a - 0.5 - R() * 0.3, len * (0.4 + R() * 0.15), depth + 1, delay + u * 0.7);
          return;
        }
      }
    };
    const n = c.dendrites ?? 5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R() * 0.8;
      branch(c.x + Math.cos(a) * c.r * 0.35, c.y + Math.sin(a) * c.r * 0.35, a, reach * (0.55 + R() * 0.5), 0, 0);
    }
    if (c.axon != null) branch(c.x, c.y, c.axon, reach * 2.2, 1, 0.2);
    return this;
  }

  /** One star: a hard core and a soft halo; `flare` (seconds) flashes it warm as it is born. */
  star(c: Common & { x: number; y: number; size?: number; flare?: number; halo?: number }) {
    this.seq(c, "star");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, [c.x, c.y]);
    const b = c.b ?? 1;
    const s = c.size ?? 3;
    const ext: [number, number, number, number] = [0, 1, 0, c.flare ?? 0];
    this.add(BODY, c.x, c.y, s, 0.95 * b, { born: c.born, warm: c.warm, group, ext });
    this.add(BODY, c.x, c.y, s * (c.halo ?? 3.6), 0.13 * b, { born: c.born, warm: c.warm, group, ext });
    return this;
  }

  /**
   * A line from a to b, bowed to one side: points scattered round a curve, thicker and fuller with `w`. `rate` sends
   * pulses of light along it (per second); firing its id sends one signal from a to b (or b to a with `back`).
   */
  link(c: Common & { ax: number; ay: number; bx: number; by: number; bow?: number; w?: number; rate?: number; back?: boolean; size?: number; density?: number; from?: string; to?: string }) {
    const R = this.seq(c, "link");
    const group = this.g(c.id);
    this.travel(c.from ?? c.move ?? c.id, c.to ?? c.from ?? c.move ?? c.id);
    const dx = c.bx - c.ax;
    const dy = c.by - c.ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bow = (c.bow ?? 0.12) * len;
    const mx = (c.ax + c.bx) / 2 + nx * bow;
    const my = (c.ay + c.by) / 2 + ny * bow;
    const w = c.w ?? 1;
    const n = Math.round((len / 2.4) * (c.density ?? 1) * (0.8 + 0.6 * w));
    const ph = R();
    for (let k = 0; k < n; k++) {
      const u = (k + R() * 0.8) / n;
      const x = (1 - u) * (1 - u) * c.ax + 2 * (1 - u) * u * mx + u * u * c.bx;
      const y = (1 - u) * (1 - u) * c.ay + 2 * (1 - u) * u * my + u * u * c.by;
      const sp = gauss(R) * (0.3 + 0.7 * w) * (0.4 + Math.sin(Math.PI * u));
      this.add(LINK, x + nx * sp, y + ny * sp, c.size ?? 1.1, u, { born: c.born, warm: c.warm, group, ext: [c.rate ?? 0, ph, (c.b ?? 0.3) * (0.7 + 0.3 * R()), c.back ? 1 : 0] });
    }
    return this;
  }

  /** A circle (or ellipse) of points; dotted leaves gaps. Born, it is drawn round from the top. */
  ring(c: Common & { x: number; y: number; r: number; squash?: number; dotted?: boolean; size?: number; from?: number; to?: number }) {
    const R = this.seq(c, "ring");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, [c.x, c.y]);
    const a0 = c.from ?? 0;
    const a1 = c.to ?? Math.PI * 2;
    const n = Math.max(12, Math.round((Math.abs(a1 - a0) * c.r) / (c.dotted ? 4 : 2.2)));
    for (let k = 0; k < n; k++) {
      if (c.dotted && k % 3 === 2) continue;
      const u = k / n;
      const a = a0 + (a1 - a0) * u - Math.PI / 2;
      this.add(BODY, c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r * (c.squash ?? 1), c.size ?? 1.2, (c.b ?? 0.25) * (0.85 + 0.15 * R()), { born: c.born ? c.born + u * 1.2 : 0, warm: c.warm, group });
    }
    return this;
  }

  /** A straight line of points. */
  line(c: Common & { ax: number; ay: number; bx: number; by: number; dotted?: boolean; size?: number; gap?: number }) {
    const R = this.seq(c, "line");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, undefined);
    const len = Math.hypot(c.bx - c.ax, c.by - c.ay);
    const n = Math.max(2, Math.round(len / (c.gap ?? (c.dotted ? 5 : 2.4))));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      this.add(BODY, c.ax + (c.bx - c.ax) * u, c.ay + (c.by - c.ay) * u, c.size ?? 1.1, (c.b ?? 0.25) * (0.85 + 0.15 * R()), { born: c.born ? c.born + u * 0.8 : 0, warm: c.warm, group });
    }
    return this;
  }

  /** A long soft band of stars (a river of time, a strip of sky): `spread` is how far it fans out from its line. */
  band(c: Common & { x0: number; x1: number; y: number; spread: number; n: number; flow?: number }) {
    const R = this.seq(c, "band");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, undefined);
    for (let k = 0; k < c.n; k++) {
      const x = c.x0 + R() * (c.x1 - c.x0);
      const g = gauss(R);
      const y = c.y + g * c.spread * (0.6 + 0.4 * Math.sin(x * 0.011 + 1.3) * Math.sin(x * 0.004));
      const v = (0.05 + 0.16 * Math.exp(-g * g) + Math.pow(R(), 14) * 0.7) * (c.b ?? 1);
      this.add(BODY, x, y, 0.8 + R() * 1.3, v, { born: c.born, warm: c.warm, group });
    }
    // light running along it, left to right
    if (c.flow)
      for (let k = 0; k < c.flow; k++) {
        const y = c.y + gauss(R) * c.spread * 0.5;
        this.add(STREAM, c.x0, y, 1.3 + R(), 0, { cx: c.x1, cy: y + gauss(R) * 6, group, ext: [0.02 + R() * 0.03, 4, 0.3 * (c.b ?? 1), 0] });
      }
    return this;
  }

  /** A drifting patch of fog: what is not known yet. */
  fog(c: Common & { x: number; y: number; r: number; n?: number; drift?: number; squash?: number }) {
    const R = this.seq(c, "fog");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, [c.x, c.y]);
    const n = c.n ?? Math.round(30 + c.r * 2.2);
    for (let k = 0; k < n; k++) {
      const rr = Math.abs(gauss(R)) * c.r * 0.5;
      const a = R() * Math.PI * 2;
      this.add(FOG, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr * (c.squash ?? 0.7), 3 + R() * 7, (c.b ?? 0.12) * (0.5 + R() * 0.5) * 0.4, { born: c.born, warm: c.warm, group, ext: [c.drift ?? 6, 0, 0, 0] });
    }
    return this;
  }

  /** Light flowing from a to b, over and over: probes going out, information coming in. */
  stream(c: Common & { ax: number; ay: number; bx: number; by: number; n?: number; rate?: number; wobble?: number; size?: number; tail?: number; from?: string; to?: string }) {
    const R = this.seq(c, "stream");
    const group = this.g(c.id);
    this.travel(c.from ?? c.move, c.to ?? c.from ?? c.move);
    const n = c.n ?? 10;
    const tail = c.tail ?? 4;
    for (let k = 0; k < n; k++) {
      const r0 = R();
      for (let j = 0; j < tail; j++) {
        this.add(STREAM, c.ax, c.ay, (c.size ?? 1.6) * (1 - j * 0.16), 0, { cx: c.bx, cy: c.by, born: c.born, warm: c.warm, group, ext: [c.rate ?? 0.25, c.wobble ?? 10, (c.b ?? 0.5) * (1 - j * 0.2), j * 0.012] });
        this.seed[this.seed.length - 2] = r0;
      }
    }
    return this;
  }

  /**
   * A ring of light spreading out from a point: over and over every `period` seconds, or (period < 0) once, for
   * -period seconds, each time its id is fired.
   */
  pulse(c: Common & { x: number; y: number; r0?: number; r1: number; period: number; squash?: number; n?: number; phase?: number; size?: number }) {
    this.seq(c, "pulse");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, [c.x, c.y]);
    const n = c.n ?? Math.round(40 + c.r1 * 0.8);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.add(PULSE, c.x, c.y, c.size ?? 1.3, c.phase ?? 0, { cx: Math.cos(a), cy: Math.sin(a), cz: c.squash ?? 1, born: c.born, warm: c.warm, group, ext: [c.r0 ?? 0, c.r1, c.period, c.b ?? 0.4] });
    }
    return this;
  }

  /**
   * A brain seen from the side, `w` pixels long: a fine shell of folds, brightest along its outline, with the
   * cerebellum low at the back and the stem. `slice` [from, to) keeps only the wedge between those angles (radians,
   * on screen, from the right going clockwise, round its own centre): a brain in pieces, the same brain put together.
   */
  brain(c: Common & { x: number; y: number; w: number; n?: number; slice?: [number, number] }) {
    const R = this.seq(c, "brain");
    const group = this.g(c.id);
    this.travel(c.move ?? c.id, undefined, [c.x, c.y]);
    const s = c.w / 170;
    const n = c.n ?? 9000;
    for (let k = 0; k < n; k++) {
      const d = [gauss(R), gauss(R), gauss(R)];
      const l = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
      const [x, y, z] = [d[0]! / l, d[1]! / l, d[2]! / l];
      let px: number, py: number, rim: number;
      if (k < n * 0.86) {
        const ridge = Math.abs(Math.sin(x * 13 + Math.sin(y * 7 + z * 5) * 2.2) * Math.sin(z * 11 - y * 6 + Math.sin(x * 4)));
        if (ridge > 0.3 && R() < 0.8) {
          k--;
          continue;
        }
        const fold = 1 + 0.045 * Math.sin(x * 23 + y * 17) * Math.sin(z * 19 - y * 11);
        px = x * 82 * fold;
        py = y * 60 * fold;
        if (py < -28) py = -28 - (py + 28) * 0.35;
        rim = 1 - Math.abs(z);
      } else if (k < n * 0.95) {
        px = -50 + x * 24;
        py = -38 + y * 13;
        rim = 1 - Math.abs(z) * 0.8;
      } else {
        px = -16 + x * 6;
        py = -50 - R() * 30;
        rim = 0.5;
      }
      if (c.slice) {
        const a = (Math.atan2(-py, px) + Math.PI * 2) % (Math.PI * 2);
        if (a < c.slice[0] || a >= c.slice[1]) continue;
      }
      this.add(BODY, c.x + px * s, c.y - py * s, 1 + R() * 0.4, (c.b ?? 1) * (0.05 + 0.3 * rim * rim * rim) * (0.7 + 0.6 * R()), { born: c.born, warm: c.warm, group });
    }
    return this;
  }

  done(): SkyScene {
    const f = (a: number[]) => new Float32Array(a);
    return { pos: f(this.pos), ctr: f(this.ctr), size: f(this.size), seed: f(this.seed), warm: f(this.warm), group: f(this.group), ext: f(this.ext), anchor: f(this.anchor), count: this.size.length, groups: this.groups, centers: this.centers };
  }
}

export const sky = () => new SkyBuilder();
export { hashStr };
