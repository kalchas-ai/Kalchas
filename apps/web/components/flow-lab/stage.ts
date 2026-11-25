import * as THREE from "three";
import { Field, MOTES } from "./field";
import { LAMP, drawFace, lampOf, faceKind, type FaceKind } from "./faces";
import { BELT, CROWD, DISC, DUST, LANES, NODE, RING, RING_R, TIE, type Beat, type Body, type Score } from "./score";
import { LAND, edgeOf, landOf, lobeOf, ringOf, swellOf } from "./land";
import type { T } from "@/lib/i18n/locales";

/**
 * The director of the picture in the middle of a real page. The page says where things have got to (how far the
 * build is; in a play: whether you are deciding, the world is working, or the step is over, and who is being told
 * about now); from that it sets what every body is, lets the matter move, and takes the camera.
 *
 * Two rules it keeps:
 * - The picture and the words take turns. While there is reading to do (you are deciding; the step is over) the
 *   picture is turned down and nearly still, only those who matter now left bright; while the world is working it is
 *   at full. Whole sentences are never written on it: only names and a few words. Under the columns and rows the
 *   page lays over it, it steps back.
 * - The camera moves in two ways only: nearly in place, drifting (while there is reading to do), or as one journey
 *   that only goes on: in from outside, from one who acts to the next, round the world, and out once at the end. It
 *   never goes somewhere and comes back. It is carried on a spring, so it gathers speed and comes to rest.
 * - Nothing is ever put somewhere at once. Going from one part to the next (nothing yet, the sources found, a world
 *   forming, a play) the matter flows there and the camera travels there; what is written on the picture comes and
 *   goes by fading. Only a leap made by hand (jump) starts afresh.
 */

const INK = "236, 235, 230";
const WARM = "240, 176, 96";
const SANS = `"MiSans", "Familjen Grotesk", "PingFang SC", system-ui, sans-serif`;
const MONO = `"Martian Mono", "MiSans", ui-monospace, monospace`;
const ORIGIN = new THREE.Vector3();
const _n = new THREE.Vector3();
const _star = new THREE.Vector3();
const _zp = new THREE.Vector3();
const _zv = new THREE.Vector3();
const _zt = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _up = new THREE.Vector3();
/** A number of its own for each grain, the same every time it is asked. */
const rnd = (j: number, k: number) => {
  const x = Math.sin(j * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
/** The brightest stars, where they really are along the band and across it (degrees), how bright, and by name. */
const STARS: [number, number, number, string][] = [
  [227.2, -8.9, -1.46, "Sirius"], [261.2, -25.3, -0.74, "Canopus"], [315.7, -0.7, -0.27, "α Cen"], [15.1, 69.1, -0.05, "Arcturus"], [67.4, 19.2, 0.03, "Vega"],
  [162.6, 4.6, 0.08, "Capella"], [209.2, -25.2, 0.13, "Rigel"], [213.7, 13.0, 0.34, "Procyon"], [290.8, -58.8, 0.46, "Achernar"], [199.8, -9.0, 0.5, "Betelgeuse"],
  [311.8, 1.3, 0.61, "Hadar"], [47.7, -8.9, 0.77, "Altair"], [300.1, -0.4, 0.76, "Acrux"], [181.0, -20.2, 0.86, "Aldebaran"], [351.9, 15.1, 0.96, "Antares"],
  [316.1, 50.8, 0.97, "Spica"], [192.2, 23.4, 1.14, "Pollux"], [20.5, -64.9, 1.16, "Fomalhaut"], [84.3, 2.0, 1.25, "Deneb"], [302.5, 3.2, 1.25, "Mimosa"],
  [226.4, 48.9, 1.35, "Regulus"], [239.8, -11.3, 1.5, "Adhara"], [351.7, -2.2, 1.62, "Shaula"], [300.2, 5.7, 1.63, "Gacrux"], [196.9, -16.0, 1.64, "Bellatrix"],
  [178.0, -3.7, 1.65, "Elnath"], [286.0, -14.4, 1.67, "Miaplacidus"], [205.2, -17.2, 1.69, "Alnilam"], [350.0, -52.5, 1.74, "Alnair"], [359.9, -11.0, 1.85, "Kaus Australis"],
];
const sat = (x: number) => Math.max(0, Math.min(1, x));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const out3 = (k: number) => 1 - Math.pow(1 - sat(k), 3);
const pulse = (age: number, tau = 0.9) => (age < 0 ? 0 : Math.exp(-age / tau));
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type Phase = "decide" | "run" | "result";
/** rack: how far the eye has gone out from what the camera is aimed at to where things were found (0 … 1). */
type Pose = { look: THREE.Vector3; dist: number; elev: number; az: number; aper: number; w: number; spot: number; rack: number };
const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const TINT = ["255, 189, 107", "107, 219, 204", "189, 168, 255"];
type Key = { T: number; az: number; dist: number; elev: number; look: [number, number, number] };

/** A critically damped spring, stepped implicitly so it never overshoots however long the frame. */
function spring(x: THREE.Vector3, v: THREE.Vector3, to: THREE.Vector3, w: number, dt: number) {
  const f = 1 + 2 * dt * w;
  const hoo = dt * w * w;
  const hhoo = dt * hoo;
  const inv = 1 / (f + hhoo);
  for (const k of ["x", "y", "z"] as const) {
    const nx = (f * x[k] + dt * v[k] + hhoo * to[k]) * inv;
    const nv = (v[k] + hoo * (to[k] - x[k])) * inv;
    x[k] = nx;
    v[k] = nv;
  }
}

export class Stage {
  field: Field;
  ctx: CanvasRenderingContext2D;
  /** The words drawn on the picture, in the interface language (flow-lab.stage), and that language, for numbers: set by the page. */
  t: T = (k) => k;
  locale = "en";
  /** build: a world forming; play: a step of a play; home: the earlier home; pre: before there is a world (nothing is built: matter scattered, found in its sources, gathered). */
  mode: "build" | "play" | "home" | "pre" = "build";
  /** Before there is a world: where the camera stands. */
  shot: { look: [number, number, number]; dist: number; elev: number } | null = null;
  /** Each source: found (0 … 1) and read (0 … 1); how far something written has drawn the scatter together (0 … 1). */
  found: number[] = [];
  read: number[] = [];
  typed = 0;
  /** Whether sources are named on the picture. */
  named = false;
  /** In a play: nothing is drawn on the picture but names (the page tells the rest). */
  bare = false;
  /** A pool of dark behind words set straight on the picture (pixels), or none. */
  pool: { x: number; y: number; rx: number; ry: number; k: number } | null = null;
  /** Where on the page the picture is bent as light is round a mass (pixels), and how much; null: nowhere. */
  lens: { x: number; y: number; k: number } | null = null;
  /** Where what is not yet read lies (see Field.open): 1 one galaxy, each source a knot on it with a star, its name, the lines read from it, and a hairline to the middle while it is read. */
  open = 0;
  /** How what is read goes from the galaxy to the world (see Field.trans). */
  trans = 0;
  /** How the network of who is in a world is shown (see Field.net). */
  net = 0;
  /** Where whoever is looking has turned the eye to, over what the telling does with it: round, up or down, nearer or further; and whether they are turning it now. */
  view = { az: 0, el: 0, zoom: 1, hot: false };
  /**
   * The settled way of doing things (/design/matter), where V2 as it was is left alone: nothing is lit, put out or
   * resized at once; a play runs a little slower; the eye, turned by hand, goes back when the telling moves on; the
   * world is as bright from far off as from near; what is left to odds is of grains, not of strokes.
   */
  fine = false;
  /** How much of what was answered at the start has gone into what is gathering in the middle (0, then 1): as it arrives there is a little more light there for a moment, coming and going slowly. */
  taken = 0;
  private takeA = 0;
  private takeB = 0;
  /** Whether the stars are named at all (where the page has words of its own all over it, they are not). */
  starNames = true;
  /** Whether everyone in the world has a face, by which they can be told apart and taken hold of (faces.ts): 0 light only, as it was; 1 a dark shape against their light. */
  face = 0;
  /** A line that says who each body is (by its index), written under their name while the pointer is on them. */
  says: string[] = [];
  /** Where the pointer is on the page, if it is over it. */
  pointer: { x: number; y: number } | null = null;
  /** Whoever has been chosen to be looked at (a body), or -1: the eye goes to them and stays while they are. */
  picked = -1;
  /** Whoever the pointer is over, or -1. */
  hoverI = -1;
  /** The world holds still (no turning, the eye not going round): only what it is made of moves. So that what is read beside someone stays beside them. */
  still = false;
  private sway = 0;
  private hits: { i: number; x: number; y: number; r: number }[] = [];
  private faceR = new Map<number, number>();
  private fl: number[] = [];
  /** How lately the eye was turned by hand (1 as it is turned, falling off after): the eye keeps close to the hand then, and is unhurried otherwise. */
  private viewK = 0;
  /** What the telling has the eye on (so that it can be known when it moves on), and whether the eye, turned by hand, is on its way back. */
  private sigWas = "";
  private homing = false;
  private homeAt: { az: number; el: number; zoom: number } | null = null;
  /** How far each body is looked at now (1: it is what is being told about), eased. */
  private heed: number[] = [];
  private expoK = 1;
  private zoomAt = 1;
  private zoomV = 0;
  /** Grains that are not of anyone (what is left to odds), as they are handed to the picture each frame. */
  private motePos = new Float32Array(MOTES * 3);
  private moteLook = new Float32Array(MOTES * 3);
  private moteN = 0;
  /** What was last written under each name, kept while it goes. */
  private unders = new Map<number, { text: string; small: boolean; warm: boolean }>();
  /** How far the eye has come down to where the wells are seen from the side. */
  private lowK = 0;
  /** How plainly the stars are named: they are while the sky is what is looked at, and not once there is a world in front of it. */
  private nameK = 1;
  private viewWas = { az: 0, el: 0, zoom: 1 };
  private openWas = 0;
  private skyY = -0.34;
  private skyWas = 0;
  private facts: string[][] | null = null;
  phase: Phase = "run";
  /** Where the telling has got to, in seconds (set by the page). */
  T = 0;
  /** Who is being told about now (a body), or -1. */
  subject = -1;
  /** Those who matter while you decide, and after the step. */
  lit = new Set<number>();
  /** What the page lays over the picture (pixels), and where the middle of what is left is. */
  margins = { l: 0, r: 0, t: 0, b: 0 };
  centre: { x: number; y: number } | null = null;
  /** In a play: what is being left to odds right now (told by the page), drawn round whoever it is about. */
  odds: { body: number; options: { label: string; p: number }[]; picked: string | null; k: number } | null = null;
  /** In a play: a line left beside each one already told about. */
  notes = new Map<number, string>();
  /** In a play: what is being told is about the whole world, not one of them. */
  wide = false;
  /** In a play: whoever is being told about is seen through the window of the card that names them. */
  framed = false;
  /** In a play: the whole page is the world's for a moment (your move going out), at full. */
  full = false;
  /** While building: the opening is part of it (before 0 the sources are found and read). */
  led = false;
  /** Whether the sources stay in the sky once everything has been made from them (0 or 1). */
  keep = 0;
  /** In a play: whom the one being told about acts on (a body), or -1; and how their act goes out (k: 0 as it leaves, 1 as it arrives, on from there). */
  target = -1;
  emit: { kind: "say" | "do" | "none"; k: number } = { kind: "none", k: 0 };
  /** Where the page keeps each of the main line's numbers (pixels), by its name. */
  sinks = new Map<string, { x: number; y: number }>();
  /** On the home page: how far a new world has gathered (0 … 1), and where on the page (pixels). */
  seed = 0;
  seedAt: { x: number; y: number } | null = null;
  private seedK = 0;
  private kickAt = -99;
  clock = 0;
  private screen = new Map<number, { x: number; y: number; r: number }>();
  private before: Beat[] = [];
  private now: Beat[] = [];
  private pos: THREE.Vector3[];
  private ap: Float32Array;
  private fw: Float32Array;
  private dr: Float32Array;
  private pe: Float32Array;
  private en: Float32Array;
  private th: Float32Array;
  private fr: Float32Array;
  private pu: Float32Array;
  private pa: Float32Array;
  private spinAt: Float32Array;
  private rad: Float32Array;
  private litK: Float32Array;
  private srcRead: number[];
  private srcHot: number[];
  private discFacts: number;
  private milesDone = 0;
  private ringProg = 0;
  private ringHead = 0;
  private opened = 0;
  private wave = { r: 0, a: 0 };
  private turn = 0;
  private tempo = 1;
  private gain = 1;
  private after = 0;
  private az = 0.2;
  private last = -1;
  private cam = { p: new THREE.Vector3(), v: new THREE.Vector3(), l: new THREE.Vector3(), lv: new THREE.Vector3(), set: false };
  private aimK = { x: 0, y: 0, set: false };
  private live: Beat[] = [];
  private keys: Key[] = [];
  private spans: { s: number; e: number; body: number }[] = [];
  private dpr = 1;
  private started = false;
  private azOff = 0;
  private azLast = 0.2;
  private azWant: number | null = null;
  private modeWas: Stage["mode"] = "build";
  private pair = { key: "", flip: 0 };
  private fades = new Map<string, number>();
  private fdt = 0.016;
  private cloudK = 0;
  private keepK = 0;
  private srcMid = new THREE.Vector3(0, 2, -16);
  private links = new Map<string, { a: number; b: number; say: boolean; k: number; al: number }>();

  constructor(
    gl: HTMLCanvasElement,
    private over: HTMLCanvasElement,
    public score: Score,
  ) {
    this.field = new Field(gl, score.seats, Math.round(Math.sqrt(score.seats.length / 4)));
    this.ctx = over.getContext("2d")!;
    const n = score.bodies.length;
    this.pos = score.bodies.map(() => new THREE.Vector3());
    const f = () => new Float32Array(n);
    this.ap = f();
    this.fw = f();
    this.dr = f();
    this.pe = f();
    this.en = f();
    this.th = f();
    this.fr = f();
    this.pu = f();
    this.pa = f();
    this.spinAt = f();
    this.rad = f();
    this.litK = f();
    this.srcRead = score.sources.map(() => 0);
    this.srcHot = score.sources.map(() => 0);
    this.discFacts = score.build.beats.reduce((k, x) => k + (x.k === "fact" && x.body === score.disc ? 1 : 0), 0);
    score.sources.forEach((s, i) => this.field.sources[i]!.set(...s.pos));
    this.last = score.seat;
    // the journey of the build: in from outside while the world is set and facts fall in, round it while people are
    // written and tied, out once as the crowds and the line of time are laid, and down to where it will be watched
    const st = (k: string) => score.build.stages.find((s) => s.key === k);
    const key = (T: number, az: number, dist: number, elev: number, look: [number, number, number] = [0, 0, 0]) => this.keys.push({ T, az, dist, elev, look });
    // before anything is built: toward where things are found, and back with them
    const lead = score.build.lead;
    key(-lead, -0.55, 35, 0.46, [0, 0.4, -1.5]);
    key(-lead * 0.62, -0.52, 34.6, 0.37, [0, 2.1, -7.4]);
    key(-lead * 0.3, -0.49, 34.2, 0.39, [0, 2.0, -6.6]);
    key(0, -0.44, 33.4, 0.58, [0, 1.0, -2.8]);
    if (st("who")) key(st("who")!.e, -0.3, 30.5, 0.64, [0, 0.9, -2.0]);
    if (st("fact")) key(st("fact")!.e, 0.15, 21, 0.54, [0, 0.3, -0.6]);
    const web = Math.max(st("persona")?.e ?? 0, st("tie")?.e ?? 0);
    if (web) key(web, 1.25, 15.5, 0.74);
    if (st("crowd")) key(st("crowd")!.e, 1.6, 25, 0.84);
    if (st("risk")) key(st("risk")!.e, 1.8, 30, 0.9);
    if (st("mile")) key(st("mile")!.e, 2.0, 32, 0.96);
    const open = st("open");
    if (open) key(open.e, 2.35, 27, 0.56);
    key((open?.e ?? score.build.end) + 12, 2.5, 27, 0.56);
    // whoever is held to be read is stayed with until the next one, never left and come back to
    const holds = score.build.holds;
    for (const b of score.build.beats) {
      if (!b.feat || b.body < 0 || (b.k !== "draw" && b.k !== "persona") || holds.some((x) => b.s >= x.s && b.s < x.e)) continue;
      const lastSpan = this.spans[this.spans.length - 1];
      if (lastSpan && lastSpan.body === b.body && b.s - lastSpan.e < 3.5) lastSpan.e = b.s + b.d;
      else this.spans.push({ s: b.s - 0.8, e: b.s + b.d, body: b.body });
    }
    for (const x of holds) this.spans.push({ s: x.s, e: x.e, body: x.body });
    this.spans.sort((a, b) => a.s - b.s);
    this.spans.forEach((sp, i) => {
      const next = this.spans[i + 1];
      if (next && next.s - sp.e < 3.5) sp.e = next.s;
    });
    this.place(0);
  }

  resize(w: number, h: number) {
    this.field.resize(w, h);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.over.width = Math.round(w * this.dpr);
    this.over.height = Math.round(h * this.dpr);
  }

  /** The step of the play being told: what had happened before it, and what happens in it. */
  setPlay(before: Beat[], now: Beat[]) {
    this.before = before;
    this.now = now;
  }

  /** Whose face is at a place on the page, if anyone's (-1 otherwise). */
  pick(x: number, y: number) {
    for (const h of this.hits) if (Math.hypot(x - h.x, y - h.y) <= Math.max(h.r, 14) + 5) return h.i;
    return -1;
  }

  /** Where a body is on the page, and how large (pixels), as last drawn. */
  screenOf(i: number) {
    return this.screen.get(i) ?? null;
  }

  /** Your move goes out: a wave from the middle across the whole world. */
  kick() {
    this.kickAt = this.clock;
  }

  /** After a leap made by hand: everything straight to where it belongs, the camera too (the page covers the picture while it does). */
  jump() {
    this.field.settle();
    this.cam.set = false;
    this.started = false;
    this.aimK.set = false;
    this.fades.clear();
    this.links.clear();
  }

  /** While there is reading to do the picture is nearly still: half as many frames are enough. */
  get reading() {
    return this.mode === "play" && this.phase !== "run" && !this.full;
  }

  /** Where a body is in the world: someone where they stand, a crowd in the middle of its stretch of the belt. */
  private where(i: number) {
    const b = this.score.bodies[i];
    if (b && b.kind === CROWD) {
      const a = (b.a0! + b.a1!) / 2 + this.turn;
      const r = BELT * edgeOf(this.net, a - this.turn);
      return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    return this.pos[i] ?? new THREE.Vector3();
  }

  /** Which way the journey of the build faces at a moment. */
  private azAt(T: number) {
    const ks = this.keys;
    let j = ks.findIndex((k) => k.T > T);
    if (j < 0) j = ks.length - 1;
    const a = ks[Math.max(0, j - 1)]!;
    const b = ks[j]!;
    return a.az + (b.az - a.az) * (b.T > a.T ? sat((T - a.T) / (b.T - a.T)) : 1);
  }

  /** A place on the sky by where it is along the band and across it (radians), as far off as r. */
  private skyAt(l: number, b: number, r: number, out: THREE.Vector3) {
    const F = this.field;
    const n = _n.crossVectors(F.galU, F.galV);
    return out.copy(F.gal).addScaledVector(F.galU, r * Math.cos(b) * Math.cos(l)).addScaledVector(F.galV, r * Math.cos(b) * Math.sin(l)).addScaledVector(n, r * Math.sin(b));
  }

  /** The first few things that were read from each source, in their own words. */
  private factsOf(i: number) {
    if (!this.facts) {
      this.facts = this.score.sources.map(() => [] as string[]);
      for (const b of this.score.build.beats) {
        const at = this.facts[b.src];
        if (b.k !== "fact" || !at || at.length >= 4) continue;
        const t = b.ev.text.replace(/\s+/g, " ").trim();
        if (t) at.push(t.length > 30 ? `${t.slice(0, 29)}…` : t);
      }
    }
    return this.facts[i] ?? [];
  }

  /** The sources lie ahead of wherever the journey of the build starts from. */
  private turnSources() {
    // (the galaxy is the sky: it keeps its place in the picture however the eye goes round, a little to one side of straight ahead)
    const off = this.open >= 1 ? this.azLast + 0.26 : this.azOff;
    const c = Math.cos(off);
    const sn = Math.sin(off);
    this.srcMid.set(0, 0, 0);
    // the galaxy lies ahead too, leaning back so it is seen at a slant
    const turn = (v: THREE.Vector3, x: number, y: number, z: number) => v.set(x * c + z * sn, y, -x * sn + z * c);
    // (one stands inside it: the middle of the galaxy lies ahead and a little down, where the eye is looking, and
    // the band rises to one side and falls to the other, as it does across a night sky)
    this.field.gal.set(0, 0, 0);
    turn(this.field.galU, 0, this.skyY, -1).normalize();
    turn(this.field.galV, 1, 0.35, 0);
    this.field.galV.addScaledVector(this.field.galU, -this.field.galV.dot(this.field.galU)).normalize();
    // (it is not still: the whole sky leans a very little one way and then the other)
    const lean = 0.022 * Math.sin(this.clock * 0.045);
    this.field.galV.multiplyScalar(Math.cos(lean)).addScaledVector(_n.crossVectors(this.field.galU, this.field.galV), Math.sin(lean)).normalize();
    this.score.sources.forEach((src, i) => {
      const [x, y, z] = src.pos;
      if (this.open >= 1) {
        // a knot of light on the band, near the middle of the galaxy, a little to one side of the band's middle line or the other
        // (on the measured sky, where its own grains really lie)
        const real = this.open === 2 ? this.field.sourcePlace(i) : null;
        this.skyAt(real ? real[0] : (((i * 0.61803 + 0.37) % 1) - 0.5) * 1.5, real ? real[1] + (i % 2 ? 0.05 : -0.05) : (i % 2 ? 1 : -1) * 0.075 + 0.02, 60, this.field.sources[i]!);
      } else this.field.sources[i]!.set(x * c + z * sn, y, -x * sn + z * c);
      this.srcMid.add(this.field.sources[i]!);
    });
    this.srcMid.multiplyScalar(1 / Math.max(1, this.score.sources.length));
    // (the band is far off; the eye does not go all that way out to it, or what is near would be lost)
    if (this.open >= 1) this.srcMid.copy(this.field.galU).multiplyScalar(30);
  }

  /** Something written on the picture comes and goes by fading: where `key` has got to on its way to `to`. */
  private fd(key: string, to: number, up = 5, down = 8) {
    const was = this.fades.get(key) ?? 0;
    const v = was + (to - was) * (1 - Math.exp(-this.fdt * (to > was ? up : down)));
    this.fades.set(key, v);
    return v;
  }

  /** A number on its way to `to` (any number, not only 0…1); the first time it is asked for it is already there. */
  private glide(key: string, to: number, rate = 8) {
    const was = this.fades.get(key);
    const v = was == null ? to : was + (to - was) * (1 - Math.exp(-this.fdt * rate));
    this.fades.set(key, v);
    return v;
  }

  // ------------------------------------------------------------------ the state of the world at this moment

  private apply(beats: Beat[], T: number) {
    const S = this.score;
    for (const b of beats) {
      if (b.s > T) break;
      const age = T - b.s;
      const i = b.body;
      switch (b.k) {
        case "appear":
        case "risk":
          if (i >= 0) {
            this.ap[i] = Math.max(this.ap[i]!, sat(age / 1.6));
            this.en[i]! += pulse(age);
          }
          break;
        case "fact":
          if (i >= 0) {
            this.fw[i]! += sat(age / 0.5);
            this.en[i]! += 0.07 * pulse(age, 1.4);
          }
          if (b.src >= 0) {
            this.srcRead[b.src]! += 1;
            if (age < 2.2) this.srcHot[b.src] = Math.max(this.srcHot[b.src]!, 1 - age / 2.2);
          }
          break;
        case "draw":
          if (i >= 0) {
            this.dr[i]! += sat(age / Math.max(0.2, b.d * 0.7));
            this.en[i]! += 0.3 * pulse(age - b.d * 0.6);
          }
          break;
        case "persona":
          if (i >= 0) {
            this.pe[i] = Math.max(this.pe[i]!, sat(age / 1.3));
            this.en[i]! += pulse(age);
          }
          break;
        case "tie":
          if (b.tie >= 0) this.fr[b.tie] = Math.max(this.fr[b.tie]!, ease(sat(age / 1.4)));
          break;
        case "crowd":
          if (i >= 0) {
            this.ap[i] = Math.max(this.ap[i]!, ease(sat(age / 2.4)));
            this.en[i]! += 0.8 * pulse(age, 1.6);
          }
          break;
        case "lookup":
          if (i >= 0) this.en[i]! += 0.9 * pulse(age);
          break;
        case "mile":
          this.milesDone += out3(age / 0.9);
          break;
        case "open":
          this.opened = Math.max(this.opened, sat(age / 5));
          if (age < 6) this.wave = { r: age * 3.1, a: sat(1.15 - age / 5.2) };
          if (S.seat >= 0) this.en[S.seat]! += 1.4 * pulse(age, 1.6);
          break;
        case "act":
          if (i >= 0) this.en[i]! += 1.3 * pulse(age, 1.2);
          if (age < 2.6) this.wave = { r: age * 3.2, a: 0.5 * sat(1 - age / 2.6) };
          break;
        case "reach":
          if (b.tie >= 0) {
            this.fr[b.tie] = Math.max(this.fr[b.tie]!, out3(age / 0.5));
            const k = age / b.d;
            if (k >= 0 && k <= 1) {
              const amp = Math.sin(Math.PI * k);
              if (amp > this.pa[b.tie]!) {
                this.pa[b.tie] = amp;
                this.pu[b.tie] = b.dir > 0 ? ease(k) : 1 - ease(k);
              }
            } else if (b.to >= 0) this.en[b.to]! += 0.7 * pulse(age - b.d);
          }
          break;
        case "think":
          if (i >= 0 && age < b.d) this.th[i] = Math.max(this.th[i]!, Math.min(sat(age / 0.6), sat((b.d - age) / 0.6)));
          break;
        case "move":
        case "hit":
          if (i >= 0) this.en[i]! += 1.1 * pulse(age);
          break;
        case "odds":
        case "chance":
        case "result":
        case "world":
          if (i >= 0) this.en[i]! += 0.6 * pulse(age);
          break;
        case "memo":
          if (i >= 0) this.en[i]! += 0.14 * pulse(age, 0.6);
          break;
        case "time":
          this.ringHead = Math.max(this.ringHead, age < 3 ? Math.sin((Math.PI * age) / 3) : 0);
          this.ringProg += ease(sat(age / 2.6));
          break;
        default:
          break;
      }
    }
  }

  private state() {
    const S = this.score;
    for (const a of [this.ap, this.fw, this.dr, this.pe, this.en, this.th, this.fr, this.pu, this.pa]) a.fill(0);
    this.srcRead.fill(0);
    this.srcHot.fill(0);
    this.milesDone = 0;
    this.ringProg = 0;
    this.ringHead = 0;
    this.opened = 0;
    this.wave = { r: 0, a: 0 };
    if (this.mode === "build") {
      this.apply(S.build.beats, this.T);
      this.live = S.build.beats.filter((b) => b.s <= this.T && this.T < b.s + b.d);
    } else if (this.mode === "pre") {
      this.live = [];
    } else if (this.mode === "home") {
      this.apply(S.build.beats, 1e6);
      this.apply(this.before, 1e6);
      this.live = [];
    } else {
      this.apply(S.build.beats, 1e6);
      this.apply(this.before, 1e6);
      // while you decide, the step has not happened; once it is over, what it left goes on settling
      const T = this.phase === "decide" ? -1 : this.phase === "result" ? this.T + this.after : this.T;
      this.apply(this.now, T);
      this.live = this.phase === "run" ? this.now.filter((b) => b.s <= T && T < b.s + b.d) : [];
      // whoever is being told about, or has been, is there to be seen, whenever the record first names them
      if (this.phase !== "decide") {
        if (this.subject >= 0) this.ap[this.subject] = 1;
        for (const i of this.notes.keys()) this.ap[i] = 1;
      }
      const kicked = this.clock - this.kickAt;
      if (kicked >= 0 && kicked < 3.4) {
        this.wave = { r: kicked * 3.6, a: sat(1.1 - kicked / 3.2) };
        if (S.seat >= 0) this.en[S.seat]! += 1.5 * pulse(kicked, 1.4);
      }
    }
  }

  private place(dt: number) {
    const S = this.score;
    const F = this.field;
    const D = F.bodies;
    const W = 256 * 4;
    if (!this.still) this.turn += dt * (0.012 + 0.03 * this.opened + 0.12 * this.ringHead);
    F.spin = this.turn;
    const dim = this.mode === "play" && this.phase !== "run";
    S.bodies.forEach((b, i) => {
      const o = i * 4;
      if (b.kind !== NODE) return;
      if (b.seed) {
        // a world not yet made, gathering where something is being written
        this.seedK += ((this.mode === "home" ? this.seed : 0) - this.seedK) * 0.04;
        if (this.seedAt && this.mode === "home") {
          const v = new THREE.Vector3((this.seedAt.x / F.w) * 2 - 1, -(this.seedAt.y / F.h) * 2 + 1, 0.5).unproject(F.camera);
          this.pos[i]!.copy(F.camera.position).addScaledVector(v.sub(F.camera.position).normalize(), 17);
        }
        this.spinAt[i]! += dt * 0.9;
        const k = this.seedK;
        const sp = this.pos[i]!;
        D.set([sp.x, sp.y, sp.z, 0.78 * (0.55 + 0.45 * Math.sqrt(k))], o);
        D.set([k < 0.004 ? 0 : k, ease(sat((k - 0.3) / 0.55)), 0.5 * k, 0], W + o);
        D.set([0.12, 0.985, 0.1, this.spinAt[i]!], W * 2 + o);
        D.set([0, 1, 3, 2], W * 3 + o);
        return;
      }
      const a = (b.ang ?? 0) + (b.risk ? this.clock * 0.035 : this.turn);
      const y = b.risk ? Math.sin(a * 2 + i) * 1.6 + 0.8 : (b.y ?? 0);
      this.pos[i]!.set(Math.cos(a) * (b.orbit ?? 0), y, Math.sin(a) * (b.orbit ?? 0));
      const facts = b.facts ?? 0;
      const fill = b.risk ? this.ap[i]! : facts ? 0.4 * this.ap[i]! + 0.6 * sat(this.fw[i]! / facts) * Math.ceil(this.ap[i]!) : this.ap[i]!;
      const draws = b.draws ?? 0;
      const drawn = draws ? sat(this.dr[i]! / draws) : 0;
      const form = b.risk ? 0 : b.seat ? 1 : Math.max(drawn * 0.5, ease(this.pe[i]!));
      const en = Math.min(1.6, this.en[i]! + 0.55 * this.th[i]!);
      this.spinAt[i]! += dt * (this.net >= 4 ? Math.abs(b.spin ?? 0.6) : (b.spin ?? 0.6)) * (1 + (this.fine ? 1.0 : 2.2) * this.th[i]! + (this.fine ? 0.5 : 1.2) * Math.min(1, this.en[i]!));
      const R = (b.R ?? 0.5) * (0.6 + 0.4 * Math.sqrt(fill)) * (1 + 0.05 * this.th[i]! * Math.sin(this.clock * 5));
      this.rad[i] = R;
      this.fl[i] = fill;
      // (on a sheet, each is at the bottom of the well they and those near them have made)
      if ((this.net === 1 || this.net >= 4) && !b.risk) {
        let down = 0;
        let tot = 0;
        S.bodies.forEach((o2, j) => {
          const f2 = this.fl[j] ?? 0;
          if (o2.kind !== NODE || f2 < 0.02) return;
          const q = this.pos[j]!;
          const sg = 0.5 + 0.95 * (this.rad[j] ?? 0.5);
          const d2 = (q.x - this.pos[i]!.x) ** 2 + (q.z - this.pos[i]!.z) ** 2;
          let wt = f2 * (0.3 + 1.5 * (this.rad[j] ?? 0.5));
          if (this.net === 7 && q.x * q.x + q.z * q.z > 13.7) {
            const k = sat(((this.litK[j] ?? 0) - 0.1) / 0.5);
            wt *= 0.2 + 0.8 * k * k * (3 - 2 * k);
          }
          if (this.net === 9) {
            tot += f2;
            down += 0.45 * wt * Math.exp(-d2 / (0.55 * sg * sg));
            return;
          }
          if (this.net === LAND) {
            // (the sheet less deep, wider and not round: the same as the picture's own program, see land.ts)
            const L = landOf(this.net);
            const sw = sg * L.wide * lobeOf(this.net, j, this.pos[i]!.x - q.x, this.pos[i]!.z - q.z);
            down += (L.deep * wt * 1.7) / (1 + (2.2 * d2) / (sw * sw));
            return;
          }
          down += this.net >= 6 ? (wt * 1.7) / (1 + (2.2 * d2) / (sg * sg)) : wt * Math.exp(-d2 / (sg * sg));
        });
        if (this.net === 9) down += (3.6 * (1 - Math.exp(-0.3 * tot))) / (1 + (this.pos[i]!.x ** 2 + this.pos[i]!.z ** 2) / 11);
        this.pos[i]!.y -= down - swellOf(this.net, this.pos[i]!.x, this.pos[i]!.z);
      }
      this.litK[i]! += ((dim && this.lit.has(i) ? 1 : 0) - this.litK[i]!) * 0.06;
      const p = this.pos[i]!;
      const t = b.tilt ?? [0, 1, 0];
      D.set([p.x, p.y, p.z, R], o);
      D.set([fill, form, en, 0], W + o);
      D.set([t[0], t[1], t[2], this.spinAt[i]!], W * 2 + o);
      D.set([b.hue ?? 0, this.litK[i]!, b.risk ? 1 : Math.max(2, Math.min(5, draws || 3)), b.seat ? 2 : b.org ? 1 : 0], W * 3 + o);
    });
    S.bodies.forEach((b, i) => {
      const o = i * 4;
      if (b.kind === TIE) {
        const A = this.pos[b.a!]!;
        const B = this.pos[b.b!]!;
        const len = A.distanceTo(B);
        D.set([A.x, A.y, A.z, b.thin ? 0.028 : 0.05], o);
        D.set([this.fr[i]! > 0.001 ? 1 : 0, 0, 0, 1], W + o);
        D.set([B.x, B.y, B.z, b.thin ? 0.25 + 0.1 * len : 0.5 + 0.2 * len], W * 2 + o);
        D.set([this.fr[i]!, this.pu[i]!, this.pa[i]!, 0], W * 3 + o);
      } else if (b.kind === CROWD) {
        D.set([b.a0!, b.a1!, BELT, 0.42], o);
        D.set([this.ap[i]!, 0, Math.min(1, this.en[i]!), 2], W + o);
        D.set([0, 0.2, 0, 0], W * 2 + o);
        D.set([Math.max(3, Math.round((b.a1! - b.a0!) * 7)), 0, 0, 0], W * 3 + o);
      } else if (b.kind === DISC) {
        const who = S.build.stages.find((s) => s.key === "who");
        const k = this.mode === "pre" ? 0 : this.mode === "build" && who ? sat((this.T - who.s) / Math.max(1, who.e - who.s)) : 1;
        const facts = this.discFacts;
        D.set([facts, 0.3, 0, 0], o);
        D.set([facts ? 0.3 * ease(k) + 0.7 * sat(this.fw[i]! / facts) : ease(k), 0, 0, 3], W + o);
        D.set([LANES[0], LANES[1], LANES[2], 0], W * 3 + o);
      } else if (b.kind === RING) {
        const total = S.miles.length;
        D.set([-Math.PI / 2, 0, 0, RING_R], o);
        D.set([total ? sat(this.milesDone / total) : this.opened, 0, 0, 4], W + o);
        D.set([S.timeBeats ? (this.ringProg / (S.timeBeats + 1)) * 0.92 : 0, this.ringHead, 0, 0], W * 3 + o);
      } else if (b.kind === DUST) {
        D.set([1, 0, 0, 5], W + o);
      }
    });
    F.wave.set(this.wave.r, this.wave.a, 0);
  }

  // ------------------------------------------------------------------ the camera

  private focus(): Beat | null {
    let best: Beat | null = null;
    for (const b of this.live) if (b.feat && (!best || b.s >= best.s)) best = b;
    return best;
  }

  private pose(): Pose {
    const S = this.score;
    const at = (i: number) => this.pos[i]!.clone().add(new THREE.Vector3(0, 0.1, 0));
    if (this.mode === "build") {
      const T = this.T;
      const ks = this.keys;
      let j = ks.findIndex((k) => k.T > T);
      if (j < 0) j = ks.length - 1;
      const a = ks[Math.max(0, j - 1)]!;
      const b = ks[j]!;
      const k = b.T > a.T ? sat((T - a.T) / (b.T - a.T)) : 1;
      const mix = (x: number, y: number) => x + (y - x) * k;
      const az = mix(a.az, b.az) + this.azOff;
      const sp = this.spans.find((x) => T >= x.s && T < x.e);
      if (this.picked >= 0 && S.bodies[this.picked]) return this.near(this.picked, az);
      if (sp) return { look: at(sp.body), dist: 7.6 + 4.2 * (S.bodies[sp.body]!.R ?? 0.6), elev: 0.86, az, aper: 1.1, w: 0.95, spot: sp.body, rack: 0 };
      // the opening: the eye goes out from the cloud to where things are found, and comes back as they are read
      const lead = S.build.lead;
      const opening = this.led && T < 0;
      const rack = opening ? ease(sat((T + lead - 1.0) / 2.8)) * (1 - ease(sat((T + 5.2) / 3.6))) : 0;
      const sh = { look: new THREE.Vector3(mix(a.look[0], b.look[0]), mix(a.look[1], b.look[1]), mix(a.look[2], b.look[2])), dist: mix(a.dist, b.dist), elev: mix(a.elev, b.elev), az, aper: opening ? 1.5 : 0.5 + 0.9 * sat(1 - T / 6) * (this.led ? 1 : 0), w: 0.8, spot: -1, rack };
      // (the eye comes down with it, trans 3: it begins level, looking out at the galaxy, and comes down and in to where the world will be as what is read falls there)
      const dive = this.trans === 3 && opening ? ease(sat(-T / lead)) : 0;
      if (dive > 0) {
        sh.elev = sh.elev * (1 - dive) + 0.07 * dive;
        sh.dist = sh.dist * (1 - dive) + 47 * dive;
        sh.look.lerp(_n.copy(this.field.galU).multiplyScalar(15).setY(3), dive);
      }
      return sh;
    }
    this.azWant = null;
    if (this.mode === "pre") {
      const v = this.shot ?? { look: [0, 0, 0] as [number, number, number], dist: 34, elev: 0.45 };
      return { look: new THREE.Vector3(...v.look), dist: v.dist, elev: v.elev, az: this.az, aper: 0.85, w: 0.55, spot: -1, rack: 0 };
    }
    if (this.mode === "home") return { look: new THREE.Vector3(), dist: 35, elev: 0.5, az: this.az, aper: 0.45, w: 0.6, spot: -1, rack: 0 };
    if (this.picked >= 0 && S.bodies[this.picked]) return this.near(this.picked, this.az);
    if (this.phase === "decide" || this.full) return { look: new THREE.Vector3(), dist: 27, elev: 0.62, az: this.az, aper: 0.5, w: 0.7, spot: -1, rack: 0 };
    if (this.phase === "result") return { look: new THREE.Vector3(), dist: this.bare ? 52 : 86, elev: this.bare ? 0.7 : 0.86, az: this.az, aper: 0.5, w: 0.55, spot: -1, rack: 0 };
    if (this.wide) return { look: new THREE.Vector3(), dist: this.bare ? 52 : 86, elev: this.bare ? 0.7 : 0.86, az: this.az, aper: 0.5, w: 0.7, spot: -1, rack: 0 };
    if (this.subject >= 0) this.last = this.subject;
    const i = this.last >= 0 ? this.last : S.seat;
    if (i < 0) return { look: new THREE.Vector3(), dist: 18, elev: 0.7, az: this.az, aper: 0.6, w: 0.8, spot: -1, rack: 0 };
    const base = 10.5 + 3.5 * (S.bodies[i]!.R ?? 0.6);
    const j = this.subject >= 0 && this.target >= 0 && this.target !== i ? this.target : -1;
    if (j >= 0) {
      // whoever acts and whoever it reaches, both in the room the page leaves: the camera stands in line with them, so
      // one is above the other, and steps back as far as it takes
      const A = this.where(i);
      const B = this.where(j);
      const sep = Math.hypot(A.x - B.x, A.z - B.z);
      const th = Math.atan2(A.x - B.x, A.z - B.z);
      const key = `${i}:${j}`;
      // of the two ways to stand in line with them, the nearer to where the camera is; kept for as long as it is these two
      if (this.pair.key !== key) this.pair = { key, flip: Math.abs(wrap(th - this.az)) <= Math.PI / 2 ? 0 : Math.PI };
      this.azWant = th + this.pair.flip;
      const F = this.field;
      const cy = this.centre?.y ?? F.h / 2;
      const room = Math.max(180, 2 * Math.min(cy - this.margins.t, F.h - this.margins.b - cy) - 120);
      const el = 0.86;
      const need = F.h / (2 * Math.tan((F.camera.fov * Math.PI) / 360) * (room / (sep * Math.sin(el) + 1.8)));
      return { look: new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.1, 0)), dist: Math.min(46, Math.max(base, need)), elev: el, az: this.az, aper: 0.7, w: 0.85, spot: i, rack: 0 };
    }
    return { look: at(i), dist: base, elev: 0.82, az: this.az, aper: 0.9, w: 0.85, spot: i, rack: 0 };
  }

  /** The eye beside whoever has been chosen: near enough to see what is round them, the rest of the world stepped back. */
  private near(i: number, az: number): Pose {
    return { look: this.where(i).clone().add(new THREE.Vector3(0, 0.1, 0)), dist: 11.5 + 4 * (this.score.bodies[i]!.R ?? 0.5), elev: 0.8, az, aper: 0.85, w: 0.9, spot: i, rack: 0 };
  }

  private aim(dt: number) {
    const F = this.field;
    const s = this.pose();
    // (6: the world is looked at from lower down, so the wells are seen from the side as the funnels they are)
    const low = this.net >= 6 && this.mode !== "pre" && !(this.mode === "build" && this.led && this.T < 0) ? 1 : 0;
    this.lowK += (low - this.lowK) * (this.cam.set ? 1 - Math.exp(-dt * 0.55) : 1);
    s.elev *= 1 - 0.38 * this.lowK;
    this.azLast = s.az;
    if (this.still) {
      // (held: the eye does not go round)
    } else if (this.mode === "play") {
      if (this.azWant != null) {
        // round to where the two of them are in line, at a pace
        const d = wrap(this.azWant - this.az);
        this.az += Math.sign(d) * Math.min(Math.abs(d), dt * 0.85);
      } else this.az += dt * (this.phase === "run" && !this.full ? 0.035 : this.phase === "decide" ? 0.004 : 0.008);
    }
    if (!this.still && (this.mode === "home" || this.mode === "pre")) this.az += dt * 0.012;
    if (!this.still) this.sway = 0.02 * Math.sin(this.clock * 0.07);
    if (this.fine) {
      // (turned by hand, the eye is where it was put only until the telling moves on: a new step, someone else told
      // about, another close look; then it goes back, unhurried, unless it is being held)
      const v = this.view;
      const sig = `${this.mode}|${this.mode === "play" ? this.phase : ""}|${s.spot}|${this.subject}|${this.target}|${this.wide ? 1 : 0}|${this.full ? 1 : 0}`;
      if (sig !== this.sigWas) {
        if (this.sigWas && (v.az !== 0 || v.el !== 0 || v.zoom !== 1)) {
          this.homing = true;
          this.homeAt = null;
        }
        this.sigWas = sig;
      }
      // (taken hold of again, or the wheel turned, while it is on its way back: it is left where it is put)
      if (v.hot || (this.homing && this.homeAt && (v.az !== this.homeAt.az || v.el !== this.homeAt.el || v.zoom !== this.homeAt.zoom))) this.homing = false;
      if (this.homing) {
        const k = 1 - Math.exp(-dt * 2.4);
        v.az = wrap(v.az);
        v.az -= v.az * k;
        v.el -= v.el * k;
        v.zoom += (1 - v.zoom) * k;
        if (Math.abs(v.az) < 0.003 && Math.abs(v.el) < 0.003 && Math.abs(v.zoom - 1) < 0.003) {
          v.az = 0;
          v.el = 0;
          v.zoom = 1;
          this.homing = false;
        }
        this.homeAt = { az: v.az, el: v.el, zoom: v.zoom };
      }
    } else this.expoK = 1;
    F.fine = this.fine;
    F.expo = this.expoK;
    // (whoever is looking can turn the eye: that is added to where the telling has it; the sky does not turn with it, so it is the eye that is felt to move)
    const vw = this.viewWas;
    if (this.view.hot || vw.az !== this.view.az || vw.el !== this.view.el || vw.zoom !== this.view.zoom) this.viewK = 1;
    else this.viewK *= Math.exp(-dt / 0.9);
    vw.az = this.view.az;
    vw.el = this.view.el;
    vw.zoom = this.view.zoom;
    const el = Math.min(1.45, Math.max(0.05, s.elev + this.view.el + this.sway));
    const va = s.az + this.view.az;
    const eye = new THREE.Vector3(Math.sin(va) * Math.cos(el), Math.sin(el), Math.cos(va) * Math.cos(el)).multiplyScalar(s.dist * this.view.zoom).add(s.look);
    const c = this.cam;
    if (!c.set) {
      c.p.copy(eye);
      c.l.copy(s.look);
      c.v.set(0, 0, 0);
      c.lv.set(0, 0, 0);
      c.set = true;
      this.zoomAt = this.view.zoom;
      this.zoomV = 0;
    } else {
      spring(c.p, c.v, eye, s.w + (7 - s.w) * this.viewK, dt);
      if (this.fine) {
        // (further off the world is on fewer pixels, and its grains would add up to white: they are turned down by
        // how far off the eye has been put. That number is moved exactly as the eye is, by the same spring, so the
        // brightness is never a moment behind where the eye has got to; nearer, nothing is added)
        _zp.set(this.zoomAt, 0, 0);
        _zv.set(this.zoomV, 0, 0);
        spring(_zp, _zv, _zt.set(this.view.zoom, 0, 0), s.w + (7 - s.w) * this.viewK, dt);
        this.zoomAt = _zp.x;
        this.zoomV = _zv.x;
        this.expoK = this.zoomAt > 1 ? Math.pow(this.zoomAt, -1.7) : 1;
      }
      spring(c.l, c.lv, s.look, s.w * 1.25, dt);
    }
    F.camera.position.copy(c.p);
    F.camera.lookAt(c.l);
    F.camera.updateMatrixWorld();
    const k = this.started ? 1 - Math.exp(-dt * 1.8) : 1;
    if (s.spot >= 0) F.spot.x = s.spot;
    F.spot.y += ((s.spot >= 0 ? (this.mode === "build" ? 0.82 : this.subject >= 0 ? 0.96 : 0.7) : 0) - F.spot.y) * k;
    // whoever it acts on, and the tie between them, are left at full beside the one being read
    const S = this.score;
    let other = -1;
    let via = -1;
    if (this.mode === "play" && this.phase === "run" && this.subject >= 0 && this.target >= 0) {
      other = this.target;
      via = S.tieOf.get(`${Math.min(this.subject, other)}:${Math.max(this.subject, other)}`) ?? -1;
    } else if (this.mode === "build" && s.spot >= 0) {
      for (const b of this.live) if (b.k === "tie" && b.feat && b.body === s.spot) [other, via] = [b.to, b.tie];
    }
    F.spotB.set(other, via);
    // (how far each is looked at, eased, for the picture: whoever the eye is on, whoever they act on, and what ties them)
    const D = F.bodies;
    for (let i = 0; i < S.bodies.length; i++) {
      const to = i === s.spot || i === other || i === via ? 1 : 0;
      const was = this.heed[i] ?? to;
      const now = this.started ? was + (to - was) * (1 - Math.exp(-dt * (to > was ? 3.4 : 2.2))) : to;
      this.heed[i] = now;
      D[256 * 4 * 4 + i * 4] = now;
    }
    const near = c.p.distanceTo(c.l);
    F.focus += (near + (c.p.distanceTo(this.srcMid) - near) * s.rack - F.focus) * (this.started ? 1 - Math.exp(-dt * 1.3) : 1);
    F.aperture += (s.aper - F.aperture) * k;
    // the picture's middle, where the page leaves room for it
    const want = this.centre ?? { x: F.w / 2, y: F.h / 2 };
    if (!this.aimK.set) this.aimK = { ...want, set: true };
    this.aimK.x += (want.x - this.aimK.x) * (1 - Math.exp(-dt * 1.4));
    this.aimK.y += (want.y - this.aimK.y) * (1 - Math.exp(-dt * 1.4));
    F.aim.x = this.aimK.x;
    F.aim.y = this.aimK.y;
    const m = F.margins;
    // the room closes in quickly and opens slowly, so the picture is never loud over the page on the way
    const close = this.mode === "play" ? 5 : 2.2;
    for (const key of ["l", "r", "t", "b"] as const) m[key] += (this.margins[key] - m[key]) * (this.started ? 1 - Math.exp(-dt * (this.margins[key] > m[key] ? close : 1.2)) : 1);
    this.started = true;
  }

  // ------------------------------------------------------------------ one frame

  frame(dt: number) {
    const play = this.mode === "play";
    const home = this.mode === "home";
    this.fdt = dt;
    if (this.mode !== this.modeWas) {
      if (this.mode === "build") {
        // the journey of the build starts from wherever the camera stands, the sources ahead of it
        this.azOff = this.started ? this.azLast - this.azAt(this.T) : 0;
        this.turnSources();
      } else this.az = this.azLast;
      this.modeWas = this.mode;
    }
    // the first frame starts where it should be, not on its way there
    const k = this.started ? 1 - Math.exp(-dt * 1.6) : 1;
    this.tempo += ((play ? (this.phase === "run" ? (this.fine ? 0.62 : 1) : this.phase === "decide" ? 0.22 : 0.45) : home ? 0.7 : 1) - this.tempo) * k;
    // (a step being worked out is seen from close by: at full strength its ties and its ground burnt out to white)
    const loud = play ? (this.phase === "run" ? 0.68 : this.phase === "decide" ? 0.3 : this.bare ? 0.8 : 0.5) : home ? 0.92 : 1;
    this.gain += (loud - this.gain) * (this.started ? 1 - Math.exp(-dt * (loud > this.gain ? 0.7 : 2.4)) : 1);
    this.after = play && this.phase === "result" ? this.after + dt : 0;
    this.clock += dt * this.tempo;
    this.field.gain = this.gain;
    // what has been found and read, and how far writing has drawn things together
    const F0 = this.field;
    const S0 = this.score;
    const lead = S0.build.lead;
    const opening = this.mode === "build" && this.led && this.T < -0.4;
    const kk = this.started ? 1 - Math.exp(-dt * 2.4) : 1;
    let readSum = 0;
    for (let i = 0; i < F0.found.length; i++) {
      let f = 1;
      let r = 0;
      let l = 0;
      if (this.mode === "build") {
        // found one after another, then read: part of each leaves for the cloud in the middle, the rest stays until it is made into something
        const Tg = this.led ? this.T + lead : 1e3;
        f = ease(sat((Tg - 0.6 - i * 0.24) / 1.5));
        r = this.led ? 0.62 * ease(sat((Tg - 5.4 - i * 0.2) / Math.max(1, lead - 8.6))) : 0;
        const n = S0.sources[i]?.n ?? 0;
        l = n ? 1 - 0.85 * sat(this.srcRead[i]! / n) : 0;
      } else if (this.mode === "pre") {
        f = this.found[i] ?? 0;
        r = this.read[i] ?? 0;
        l = 1;
      }
      F0.found[i] += (f - F0.found[i]!) * kk;
      F0.read[i] += (r - F0.read[i]!) * kk;
      F0.left[i] += (l - F0.left[i]!) * kk;
      // (in the settled way, on the measured sky, a source has no haze of its own laid over it: the sky keeps its own colours)
      F0.haze[i] += ((this.fine && this.open === 2 ? 0 : f) - F0.haze[i]!) * (this.started ? 1 - Math.exp(-dt * 0.55) : 1);
      readSum += F0.read[i]!;
    }
    F0.sourceCount = Math.max(1, S0.sources.length);
    F0.open = this.open;
    // (before there is a world the band lies lower, clear of what is written at the top of the page; it glides to its place)
    this.skyY += ((this.mode === "pre" ? -0.6 : -0.34) - this.skyY) * (this.started ? 1 - Math.exp(-dt * 0.7) : 1);
    if (this.open >= 1) this.turnSources();
    if (this.open !== this.openWas || this.field.skyCame !== this.skyWas) {
      this.openWas = this.open;
      this.skyWas = this.field.skyCame;
      this.turnSources();
    }
    // the ways it goes from the galaxy to the world
    F0.trans = this.trans;
    F0.net = this.net;
    F0.bodyN = Math.min(160, S0.bodies.length);
    F0.worldOn = this.mode === "play" || (this.mode === "build" && this.T > 3) ? 1 : 0;
    // who lights the ground round them (for the ground that is a small galaxy)
    let nn = 0;
    S0.bodies.forEach((b, i) => {
      const f2 = this.fl[i] ?? 0;
      if (b.kind !== NODE || b.risk || f2 < 0.02 || nn >= 32) return;
      F0.nodes[nn++]!.set(this.pos[i]!.x, -this.pos[i]!.z, f2 * (this.rad[i] ?? 0.5) * (b.seat ? 1.6 : 1), b.seat ? 0 : (b.hue ?? 0));
    });
    F0.nodeN = nn;
    const T0 = this.T;
    const mid = (this.mode === "build" || this.mode === "pre") && this.open >= 1 ? F0.project(ORIGIN) : null;
    const got = sat(readSum / Math.max(1, S0.sources.length));
    F0.squeeze = 0;
    F0.flash = 0;
    F0.ring.k = 0;
    if (mid && this.trans === 2) {
      // it is lit: what has gathered is drawn in to a point, and at the instant the world begins there is a flash and a ring goes out across the sky
      F0.squeeze = T0 < 0 ? ease(sat((T0 + 1.8) / 1.5)) : Math.exp(-T0 * 5);
      F0.flash = T0 < 0 ? 0.22 * F0.squeeze * F0.squeeze : Math.exp(-T0 * 3.2);
      F0.ring.x = mid.x / Math.max(1, F0.w);
      F0.ring.y = 1 - mid.y / Math.max(1, F0.h);
      F0.ring.r = 0.02 + Math.max(0, T0) * 0.46;
      F0.ring.k = T0 >= 0 && T0 < 3.4 ? Math.pow(1 - T0 / 3.4, 1.3) : 0;
    }
    // what was answered arriving in what has gathered: it is answered by a little more light there, for a moment
    this.takeA += (this.taken - this.takeA) * (1 - Math.exp(-dt * 1.3));
    this.takeB += (this.takeA - this.takeB) * (1 - Math.exp(-dt * 1.3));
    if (mid && this.fine && this.takeA - this.takeB > 0.004) {
      F0.flash = Math.max(F0.flash, 0.3 * (this.takeA - this.takeB));
      F0.ring.x = mid.x / Math.max(1, F0.w);
      F0.ring.y = 1 - mid.y / Math.max(1, F0.h);
    }
    // a well: what gathers has weight, and bends the sky round itself more the more of it there is; it lets go as the world is made of it
    // (it is there from the moment something is written, round what that has drawn together; and it is its own bending, whatever the pointer does)
    const wk = mid && this.trans === 1 ? (this.mode === "pre" ? 1.25 * F0.typed : Math.max(1.25 * F0.typed, 1.7 * ease(got)) * (1 - ease(sat(T0 / 5)))) : 0;
    F0.lens2.k += (wk - F0.lens2.k) * (this.started ? 1 - Math.exp(-dt * 2.5) : 1);
    if (mid) {
      F0.lens2.x = mid.x / Math.max(1, F0.w);
      F0.lens2.y = 1 - mid.y / Math.max(1, F0.h);
    }
    F0.lens.k = this.lens ? this.lens.k : 0;
    if (this.lens) {
      F0.lens.x = this.lens.x / Math.max(1, F0.w);
      F0.lens.y = 1 - this.lens.y / Math.max(1, F0.h);
    }
    this.keepK += (this.keep - this.keepK) * (this.started ? 1 - Math.exp(-dt * 0.9) : 1);
    F0.keep = this.keepK;
    F0.back += ((play || home ? 1 : 0) - F0.back) * (this.started ? 1 - Math.exp(-dt * 0.8) : 1);
    // the cloud in the middle has a mist of its own until a world has been made of it
    const fact = S0.build.stages.find((x) => x.key === "fact");
    const cloud = this.mode === "pre" ? 0.8 * Math.max(F0.typed * 0.75, readSum / Math.max(1, S0.sources.length)) : this.mode === "build" ? 0.8 * (1 - ease(sat(this.T / Math.max(1, fact?.e ?? 20)))) * (this.led ? 1 : 0) : 0;
    this.cloudK += (cloud - this.cloudK) * (this.started ? 1 - Math.exp(-dt * 0.9) : 1);
    F0.cloud = this.cloudK;
    F0.typed += (this.typed - F0.typed) * (this.started ? 1 - Math.exp(-dt * 1.2) : 1);
    // the pool of dark behind words never moves while it can be seen: it goes, and comes again in its new place
    const pl = this.pool;
    const P0 = F0.pool;
    const there = !!pl && (!this.started || P0.k < 0.02 || Math.abs(pl.x - P0.x) + Math.abs(pl.y - P0.y) + Math.abs(pl.rx - P0.rx) + Math.abs(pl.ry - P0.ry) < 48);
    if (pl && there) {
      P0.x = pl.x;
      P0.y = pl.y;
      P0.rx = pl.rx;
      P0.ry = pl.ry;
    }
    P0.k += ((pl && there ? pl.k : 0) - P0.k) * (this.started ? 1 - Math.exp(-dt * (pl && there ? 2.2 : 4.5)) : 1);
    // while building, what comes in from outside the room is part of the story: leave more of it
    // in a play the world outside the card's window is faint but there; when the page is all the world's, none of it is held back
    this.field.floor += ((play ? (this.full ? 1 : this.phase === "decide" ? 0.12 : 0.2) : home ? 0.3 : this.mode === "pre" || opening ? 1 : 0.26) - this.field.floor) * (this.started ? 1 - Math.exp(-dt * (this.full ? 3 : 1.4)) : 1);
    this.state();
    this.place(dt * this.tempo);
    this.aim(dt);
    this.field.step(Math.min(dt, 0.05) * Math.max(0.4, this.tempo), this.clock);
    this.field.render();
    this.moteN = 0;
    this.annotate();
    this.field.motes(this.motePos, this.moteLook, this.moteN);
  }

  // ------------------------------------------------------------------ what is written over the picture: names, and a few words

  private annotate() {
    const g = this.ctx;
    const F = this.field;
    const S = this.score;
    const w = F.w;
    const h = F.h;
    const M = this.margins;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // nothing written here is put up or taken down at once: all of it comes and goes with this
    const all = this.fd("all", this.mode === "home" || this.full ? 0 : 1, 3, 6);
    if (all < 0.01) {
      F.lamps([]);
      return;
    }
    g.globalAlpha = all;
    g.textBaseline = "middle";
    g.shadowColor = "rgba(12, 13, 15, 0.95)";
    g.shadowBlur = 7;
    g.setLineDash([]);
    const P = (v: THREE.Vector3) => F.project(v, { x: 0, y: 0, d: 0 });
    const build = this.mode === "build";
    const quiet = !build && this.phase !== "run";
    const vol = this.fd("vol", quiet ? 0.5 : 1, 3, 3);
    const span = build ? this.spans.find((x) => this.T >= x.s && this.T < x.e) : undefined;
    const closeUp = this.picked >= 0 ? this.picked : span ? span.body : !build && this.phase === "run" ? this.subject : -1;
    const f = this.focus();
    const taken: [number, number, number, number][] = [];
    const free = (x: number, y: number, tw: number, th: number) => {
      const r: [number, number, number, number] = [x - 4, y - th / 2 - 3, x + tw + 4, y + th / 2 + 3];
      if (taken.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return false;
      taken.push(r);
      return true;
    };
    const x0 = M.l + 16;
    const x1 = w - M.r - 16;
    const inside = (x: number, y: number) => x > x0 && x < x1 && y > M.t + 8 && y < h - M.b - 8;

    // where things come from, by name: while they are being found and read, and while facts are written from them
    const fact = S.build.stages.find((s) => s.key === "fact");
    const pre = this.mode === "pre";
    const lead = S.build.lead;
    const opening = build && this.led && this.T < 0;
    const srcA = pre ? (this.named ? 1 : 0) : opening ? sat((this.T + lead - 1.2) / 1.2) * sat((-0.6 - this.T) / 1.2) : build && fact ? sat((this.T - (fact.s - 6)) / 3) * sat((fact.e + 5 - this.T) / 3) : 0;
    S.sources
      .map((s, i) => {
        const rd = sat(F.read[i]! / 0.62);
        return { s, i, hot: pre || opening ? (rd > 0.02 && rd < 0.98 ? 1 : 0) : this.srcHot[i]!, rd };
      })
      .sort((a, b) => b.hot - a.hot)
      .forEach(({ s, i, hot, rd }) => {
        const key = `s${i}`;
        if (srcA <= 0.01 && !this.fades.get(key)) return;
        const p = P(F.sources[i]!);
        if (p && this.open && srcA > 0.01) {
          const px = p.x;
          const py = p.y;
          const tintS = TINT[i % 3]!;
          const lit = srcA * sat(F.found[i]! * 1.4) * (0.35 + 0.65 * F.left[i]!);
          if (lit > 0.02) {
            // a star where it is: a point too bright to look at, the dark round it lit
            // (small and without colour: one more star of the sky, a little brighter than its neighbours)
            const R = 5 + 4 * hot;
            const gr = g.createRadialGradient(px, py, 0, px, py, R);
            gr.addColorStop(0, `rgba(255, 250, 240, ${lit * 0.9})`);
            gr.addColorStop(0.25, `rgba(${INK}, ${lit * 0.3})`);
            gr.addColorStop(1, `rgba(${INK}, 0)`);
            g.fillStyle = gr;
            g.beginPath();
            g.arc(px, py, R, 0, Math.PI * 2);
            g.fill();
          }
          if (this.open >= 1 && hot > 0.03 && this.trans !== 1) {
            // what is being read falls to the middle as shooting stars: a bright head, a short tail fading out behind it
            const m = P(ORIGIN);
            if (m) {
              const mx = m.x;
              const my = m.y;
              const cx = (px + mx) / 2 + (my - py) * 0.16;
              const cy = (py + my) / 2 - (mx - px) * 0.16;
              for (let k = 0; k < 3; k++) {
                const ph = (this.clock * (0.3 + 0.06 * ((i * 3 + k) % 4)) + k / 3 + i * 0.37) % 1;
                // it gathers speed as it falls
                const t1 = ph * ph;
                const t0 = Math.max(0, t1 - 0.035 - 0.11 * ph);
                const ax = (1 - t1) * (1 - t1) * px + 2 * (1 - t1) * t1 * cx + t1 * t1 * mx;
                const ay = (1 - t1) * (1 - t1) * py + 2 * (1 - t1) * t1 * cy + t1 * t1 * my;
                const bx = (1 - t0) * (1 - t0) * px + 2 * (1 - t0) * t0 * cx + t0 * t0 * mx;
                const by = (1 - t0) * (1 - t0) * py + 2 * (1 - t0) * t0 * cy + t0 * t0 * my;
                const al = hot * srcA * Math.min(1, ph * 7) * Math.min(1, (1 - ph) * 4);
                if (al < 0.02) continue;
                const tail = g.createLinearGradient(bx, by, ax, ay);
                tail.addColorStop(0, "rgba(236, 235, 230, 0)");
                tail.addColorStop(1, `rgba(255, 250, 240, ${0.8 * al})`);
                g.strokeStyle = tail;
                g.lineWidth = 1.5;
                g.lineCap = "round";
                g.beginPath();
                g.moveTo(bx, by);
                g.lineTo(ax, ay);
                g.stroke();
                const hd = g.createRadialGradient(ax, ay, 0, ax, ay, 6);
                hd.addColorStop(0, `rgba(255, 252, 246, ${al})`);
                hd.addColorStop(0.3, `rgba(255, 246, 228, ${0.4 * al})`);
                hd.addColorStop(1, "rgba(255, 246, 228, 0)");
                g.fillStyle = hd;
                g.beginPath();
                g.arc(ax, ay, 6, 0, Math.PI * 2);
                g.fill();
              }
            }
            p.x = px;
            p.y = py;
          }
        }
        g.font = `10.5px ${MONO}`;
        const tw = g.measureText(s.host).width;
        const x = p ? p.x - tw / 2 : 0;
        const y = p ? p.y - (this.open ? 56 : 38) : 0;
        // on a page that tells the rest itself, only the ones being read from are named
        const want = srcA * (opening ? (this.open ? 0.82 + 0.18 * hot : 0.5 + 0.5 * hot) : this.bare && build ? hot * (closeUp >= 0 ? 0 : 1) : 0.4 + 0.6 * hot) * sat((F.found[i]! - 0.5) * 2);
        const ok = !!p && want > 0.02 && inside(p.x, y) && x > x0 && x + tw < x1 && (this.open >= 1 && opening ? free(p.x - 100, y - 6, 200, 46) : free(x, y + 6, tw, 28));
        const a = this.fd(key, ok ? want : 0, 4, 6);
        if (!p || a < 0.02) return;
        const tint = TINT[i % 3]!;
        // (where the galaxy is what is drawn from, names are plain: no colour, nothing behind them but a soft shadow of the dark)
        if (this.open) {
          g.shadowColor = "rgba(8, 9, 10, 0.92)";
          g.shadowBlur = 7;
        }
        g.fillStyle = `rgba(${hot > 0.3 && !this.open ? tint : INK}, ${a})`;
        g.fillText(s.host, x, y);
        g.font = `9.5px ${MONO}`;
        const c = opening || pre ? this.t("sourceRead", { read: Math.round(rd * s.n), total: s.n }) : `${Math.round(this.srcRead[i]!)} / ${s.n}`;
        g.fillStyle = `rgba(${INK}, ${a * 0.7})`;
        g.fillText(c, p.x - g.measureText(c).width / 2, y + 13);
        if (this.open >= 1 && opening) {
          // what was read from it, in its own words: a line comes, is there to be read, and goes down into the source as it turns to grains
          const list = this.factsOf(i);
          const n = Math.min(4, list.length);
          const u = sat(rd / 0.6) * n;
          const k = Math.floor(u);
          if (n && rd > 0.004 && k < n) {
            const ph = u - k;
            g.font = `11px ${SANS}`;
            const fw = g.measureText(list[k]!).width;
            g.fillStyle = `rgba(${INK}, ${a * Math.min(1, ph * 5) * Math.min(1, (1 - ph) * 3) * 0.92})`;
            g.fillText(list[k]!, p.x - fw / 2, y - 16 - 5 * (1 - Math.min(1, ph * 4)) + 14 * Math.max(0, ph - 0.75) * 4);
          }
        }
        g.shadowBlur = 0;
        g.strokeStyle = `rgba(${this.open ? INK : tint}, ${a * (this.open ? 0.28 : 0.4)})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(p.x, y + 22);
        g.lineTo(p.x, p.y - 8);
        g.stroke();
      });

    // the stars that are really there, where they really are
    if (this.open >= 1) {
      // (on the measured sky the catalogue's stars are in the picture itself: only their names are written)
      const cat = this.open === 2 && this.field.named.length > 0;
      this.nameK += ((this.mode === "pre" || (this.mode === "build" && this.T < 0.5) ? 1 : 0) - this.nameK) * (this.started ? 1 - Math.exp(-this.fdt * 1.4) : 1);
      if (cat && this.starNames && this.nameK > 0.02)
        for (const st of this.field.named) {
          const p = P(this.skyAt(st.l, st.b, 61, _star));
          if (!p || !inside(p.x, p.y) || !free(p.x + 8, p.y + 3, 70, 12)) continue;
          g.font = `9.5px ${MONO}`;
          g.fillStyle = `rgba(${INK}, ${0.5 * this.nameK})`;
          g.fillText(st.name, p.x + 8, p.y + 3);
        }
      for (const [ld, bd, mag, name] of cat ? [] : STARS) {
        const p = P(this.skyAt(((ld > 180 ? ld - 360 : ld) * Math.PI) / 180, (bd * Math.PI) / 180, 61, _star));
        if (!p || !inside(p.x, p.y)) continue;
        const R = 7.5 - mag * 2.2;
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        gr.addColorStop(0, "rgba(255, 252, 244, 0.95)");
        gr.addColorStop(0.2, "rgba(236, 235, 230, 0.4)");
        gr.addColorStop(1, "rgba(236, 235, 230, 0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(p.x, p.y, R, 0, Math.PI * 2);
        g.fill();
        if (mag < 1.3 && free(p.x + 8, p.y + 3, 70, 12)) {
          g.font = `9.5px ${MONO}`;
          g.fillStyle = `rgba(${INK}, 0.5)`;
          g.fillText(name, p.x + 8, p.y + 3);
        }
      }
    }
    if (pre) {
      // (before there is a world there is no one: no face, no light of theirs left on from a world that was there before)
      F.lamps([]);
      this.hits.length = 0;
      this.hoverI = -1;
      g.globalAlpha = 1;
      return;
    }
    // the line of time: milestones on it
    if (this.milesDone > 0.01 || !build) {
      const done = build ? this.milesDone : S.miles.length;
      const showAll = this.live.some((b) => b.k === "mile" || b.k === "open");
      S.miles.forEach((m, j) => {
        const k = sat(done - j);
        if (k <= 0) return;
        const a = -Math.PI / 2 + m.at * Math.PI * 2;
        const rr = RING_R * ringOf(this.net, a);
        const p = P(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr));
        const q = P(new THREE.Vector3(Math.cos(a) * (rr + 0.4), 0, Math.sin(a) * (rr + 0.4)));
        if (!p || !q || !inside(p.x, p.y)) return;
        g.strokeStyle = `rgba(${INK}, ${0.4 * k * vol})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(q.x, q.y);
        g.stroke();
        g.beginPath();
        g.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
        g.fillStyle = `rgba(${INK}, ${0.6 * k * vol})`;
        g.fill();
        const fresh = this.live.find((b) => b.k === "mile" && b.n === j);
        g.font = `12px ${SANS}`;
        const txt = cut(m.text, 14);
        const tw = g.measureText(txt).width;
        const x = q.x < p.x ? q.x - tw - 8 : q.x + 8;
        const ok = !!(showAll || fresh) && inside(q.x, q.y) && x > x0 && x + tw < x1 && free(x, q.y, tw, 16);
        const al = this.fd(`m${j}`, ok ? (fresh ? 0.95 : 0.6) * k : 0);
        if (al > 0.02) {
          g.fillStyle = `rgba(${fresh ? WARM : INK}, ${al})`;
          g.fillText(txt, x, q.y);
        }
      });
    }

    // someone being stayed with while building: how much is known of them has come in, and from how many places; each
    // trait as it is drawn, in a row under them
    const hold = build ? S.build.holds.find((x) => this.T >= x.s && this.T < x.e + 0.8) : undefined;
    if (hold) {
      const p = P(this.pos[hold.body]!);
      if (p) {
        const r = this.rad[hold.body]! * F.pxPer(p.d) * 0.9;
        const R = Math.max(96, Math.min(176, r * 1.55 + 30));
        const al = Math.min(sat((this.T - hold.s - 0.7) / 0.6), sat((hold.e + 0.8 - this.T) / 0.8));
        // room for what is drawn round them while a trait is being drawn
        if (this.live.some((b) => b.k === "draw" && b.feat && b.body === hold.body)) taken.push([p.x - R - 190, p.y - R - 80, p.x + R + 190, p.y + R + 30]);
        let y = Math.min(p.y + R + 42, h - M.b - 54);
        if (hold.facts && al > 0.01) {
          const k = sat((this.T - hold.inS) / Math.max(0.1, hold.inE - hold.inS));
          const coming = k > 0 && k < 1;
          const txt = `${this.t("factsKnown", { count: Math.round(hold.facts * k) })} · ${this.t("fromSources", { count: hold.srcs })}`;
          g.font = `10.5px ${MONO}`;
          const tw = g.measureText(txt).width;
          g.fillStyle = `rgba(${coming ? WARM : INK}, ${al * (coming ? 0.95 : 0.6)})`;
          g.fillText(txt, p.x - tw / 2, y);
          taken.push([p.x - tw / 2 - 6, y - 10, p.x + tw / 2 + 6, y + 10]);
          y += 21;
        }
        const shown = hold.traits.filter((tr) => this.T >= tr.s);
        if (shown.length && al > 0.01) {
          const gap = 22;
          const parts = shown.map((tr) => {
            const label = cut(tr.label, 6);
            const value = cut(tr.value, 9);
            g.font = `11px ${SANS}`;
            const lw = g.measureText(label).width;
            g.font = `500 12.5px ${SANS}`;
            const vw = g.measureText(value).width;
            return { tr, label, value, lw, vw, w: lw + 6 + vw };
          });
          while (parts.length > 1 && parts.reduce((a, b) => a + b.w, 0) + gap * (parts.length - 1) > x1 - x0 - 40) parts.shift();
          const total = parts.reduce((a, b) => a + b.w, 0) + gap * (parts.length - 1);
          let x = p.x - total / 2;
          taken.push([x - 6, y - 11, x + total + 6, y + 11]);
          for (const q of parts) {
            const a = al * sat((this.T - q.tr.s) / 0.5);
            const fresh = this.T - q.tr.s < 1.8;
            g.font = `11px ${SANS}`;
            g.fillStyle = `rgba(${INK}, ${a * 0.5})`;
            g.fillText(q.label, x, y + 0.5);
            g.font = `500 12.5px ${SANS}`;
            g.fillStyle = `rgba(${fresh ? WARM : INK}, ${a * 0.95})`;
            g.fillText(q.value, x + q.lw + 6, y);
            x += q.w + gap;
          }
          y += 22;
        }
        // who they are, in a line, as it is written
        if (this.T >= hold.saidS && al > 0.01 && y < h - M.b - 6) {
          g.font = `13px ${SANS}`;
          let txt = hold.said.replace(/\s+/g, "");
          while (txt.length > 8 && g.measureText(txt).width > Math.min(460, x1 - x0 - 60)) txt = `${txt.slice(0, -2)}…`;
          const tw = g.measureText(txt).width;
          const k = sat((this.T - hold.saidS) / 1.4);
          taken.push([p.x - tw / 2 - 6, y - 11, p.x + tw / 2 + 6, y + 11]);
          g.fillStyle = `rgba(${INK}, ${al * 0.86})`;
          g.fillText(txt.slice(0, Math.ceil(txt.length * k)), p.x - tw / 2, y);
        }
      }
    }

    // crowds
    this.screen.clear();
    for (const b of S.bodies) {
      if (b.kind !== CROWD || this.ap[b.i]! < 0.05) continue;
      const a = (b.a0! + b.a1!) / 2 + this.turn;
      const out = BELT * (edgeOf(this.net, a - this.turn) - 1);
      const p = P(new THREE.Vector3(Math.cos(a) * (BELT + 0.2 + out), 0.1, Math.sin(a) * (BELT + 0.2 + out)));
      const q = P(new THREE.Vector3(Math.cos(a) * (BELT + 1.25 + out), 0.5, Math.sin(a) * (BELT + 1.25 + out)));
      if (!p || !q) continue;
      const fresh = this.live.find((x) => x.k === "crowd" && x.body === b.i);
      const aimed = !build && this.phase === "run" && this.subject >= 0 && b.i === this.target;
      g.font = `12.5px ${SANS}`;
      const name = cut(b.name, 9);
      const tw = g.measureText(name).width;
      const left = q.x < p.x;
      const x = left ? q.x - tw - 6 : q.x + 6;
      const ok = inside(q.x, q.y) && x > x0 && x + tw < x1 && free(x, q.y, Math.max(tw, 70), 30);
      const al = this.fd(`c${b.i}`, ok && !(this.face > 0 && b.i === this.picked) ? this.ap[b.i]! * (fresh || aimed ? 1 : closeUp >= 0 ? 0.2 : 0.55) * vol : 0);
      if (al < 0.02) continue;
      if (aimed) this.screen.set(b.i, { x: p.x, y: p.y, r: 10 });
      g.strokeStyle = `rgba(${INK}, ${al * 0.4})`;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(q.x, q.y);
      g.stroke();
      g.fillStyle = `rgba(${fresh || (aimed && this.emit.k >= 1) ? WARM : INK}, ${al})`;
      g.fillText(name, x, q.y - 6);
      g.font = `9.5px ${MONO}`;
      g.fillStyle = `rgba(${INK}, ${al * 0.65})`;
      // (an outside force has a name only: it is no number of people)
      if (b.force) continue;
      const c = this.t("people", { count: b.size ?? 0, n: (b.size ?? 0).toLocaleString(this.locale) });
      g.fillText(c, left ? q.x - g.measureText(c).width - 6 : q.x + 6, q.y + 9);
    }

    // everyone, by name, where they are
    const pairOn = !build && this.phase === "run" && this.subject >= 0 && this.target >= 0;
    const tiedTo = build && closeUp >= 0 ? this.live.filter((x) => x.k === "tie" && x.feat && x.body === closeUp) : [];

    // a face for everyone (faces.ts): told apart at a glance, and taken hold of. One rule for all of them: whoever is
    // large enough on the page to be seen for what they are has a face, and from further off they are all light.
    // Whoever is being told about is not marked by having a face where others have none, but by a brighter light and
    // a name. Nothing about a face changes at once: how plain it is, how large, how bright all go there over a moment
    this.hits.length = 0;
    this.faceR.clear();
    let hov = -1;
    const lamps: { at: THREE.Vector3; px: number; glow: number; warm: number }[] = [];
    // (not while a decision is being made: what is to be decided lies over the world, and no one under it can be seen or pressed)
    // (and not before there is a world: on the home page and while questions are asked there is no one)
    if (this.face > 0 && (this.mode === "build" || this.mode === "play") && !(this.mode === "play" && this.phase === "decide")) {
      type Mark = { b: Body; at: THREE.Vector3; x: number; y: number; d: number; r: number; pri: number; kind: FaceKind; main: boolean; big: number };
      const ms: Mark[] = [];
      const pt = this.pointer;
      const smooth = (x: number) => {
        const t = sat(x);
        return t * t * (3 - 2 * t);
      };
      for (const b of S.bodies) {
        const someone = b.kind === NODE && !b.risk && !b.seed;
        if ((!someone && b.kind !== CROWD) || this.ap[b.i]! < 0.05) continue;
        const mid = someone ? 0 : (b.a0! + b.a1!) / 2 + this.turn;
        const far = BELT * edgeOf(this.net, mid - this.turn) + 0.2;
        const at = someone ? this.pos[b.i]! : new THREE.Vector3(Math.cos(mid) * far, 0.1, Math.sin(mid) * far);
        const p = P(at);
        if (!p) continue;
        F.bend(p);
        if (!inside(p.x, p.y)) continue;
        const imp = b.seat ? 1 : someone ? 0.3 : 0.25;
        const nat = F.pxPer(p.d) * (0.14 + 0.13 * imp);
        const main = !!b.seat || b.i === closeUp || (pairOn && b.i === this.target) || (quiet && this.lit.has(b.i)) || this.th[b.i]! > 0.2;
        ms.push({ b, at, x: p.x, y: p.y, d: p.d, r: Math.min(15, nat), pri: (main ? 4 : 0) + (b.seat ? 2 : 0) + imp, kind: faceKind({ seat: b.seat, ent: b.ent, crowd: !someone }), main, big: smooth((nat - 5.5) / 3) });
      }
      // where two would lie over each other, whoever is more to the point keeps their size and the other is a small one
      ms.sort((a, b) => b.pri - a.pri);
      ms.forEach((m, j) => {
        if (ms.slice(0, j).some((q) => Math.hypot(q.x - m.x, q.y - m.y) < 0.8 * LAMP * (q.r + m.r))) m.r = Math.max(5.5, m.r * 0.62);
      });
      if (pt) {
        let best = 1e9;
        for (const m of ms) {
          const dd = Math.hypot(pt.x - m.x, pt.y - m.y);
          if (dd <= Math.max(m.r * LAMP, 13) + 4 && dd < best) {
            best = dd;
            hov = m.b.i;
          }
        }
      }
      // the far ones first; whoever is under the pointer, or chosen, over the rest
      const top = (m: Mark) => (m.b.i === hov || m.b.i === this.picked ? 1 : 0);
      ms.sort((a, b) => top(a) - top(b) || b.d - a.d);
      // (the whole world stepping back, while there is reading to do or while one of them is looked at closely)
      const back = this.fd("fback", quiet ? 0.45 : closeUp >= 0 ? 0.4 : 0, 4, 3);
      for (const m of ms) {
        const i = m.b.i;
        const held = i === hov || i === this.picked;
        const over = this.fd(`fo${i}`, i === hov ? 1 : 0, 12, 9);
        const a = this.fd(`fa${i}`, Math.min(1, this.ap[i]! * 2) * (held ? 1 : m.big), 6, 5);
        // (kept going while it fades, so that it does not go out at once)
        const r = this.glide(`fr${i}`, (held ? Math.max(m.r, 11) : m.r) * (i === hov ? 1.14 : 1), 9);
        if (a < 0.02) continue;
        const heed = this.fd(`fh${i}`, held || m.main ? 1 : 0, 5, 3.5);
        const ring = this.fd(`fp${i}`, i === this.picked ? 1 : 0, 8, 6);
        const busy = this.fd(`fb${i}`, this.th[i]! > 0.2 ? 1 : 0, 6, 4);
        const rr = r * (0.7 + 0.3 * a);
        // (drawn another way, less or none of the picture's own light is left behind it, and it is as plain as it is heeded)
        const lamp = lampOf(this.face);
        if (lamp > 0) lamps.push({ at: m.at, px: 2 * rr * LAMP, glow: lamp * all * a * (0.9 + 0.6 * heed + 0.2 * over) * (1 - back * (1 - heed)) * Math.min(1, Math.sqrt(F.expo)), warm: m.b.seat ? 1 : 0 });
        drawFace(g, m.kind, m.x, m.y, rr, { a: this.face > 1 ? a * (0.62 + 0.38 * Math.max(heed, over)) * (1 - 0.5 * back * (1 - heed)) : a, ring, busy: busy > 0.02 ? this.clock * 3.2 : null, busyA: busy }, this.face);
        if (a > 0.3) {
          this.faceR.set(i, rr * LAMP);
          // (no name is written over a face)
          taken.push([m.x - rr * LAMP - 2, m.y - rr * LAMP - 2, m.x + rr * LAMP + 2, m.y + rr * LAMP + 2]);
        }
        if (m.b.kind === CROWD && i === this.picked) this.screen.set(i, { x: m.x, y: m.y, r: rr });
      }
      for (let j = ms.length - 1; j >= 0; j--) this.hits.push({ i: ms[j]!.b.i, x: ms[j]!.x, y: ms[j]!.y, r: ms[j]!.r * LAMP });
    }
    F.lamps(lamps);
    this.hoverI = hov;
    const rank = (i: number) => (i === closeUp ? 4 : 0) + (pairOn && i === this.target ? 3 : 0) + (tiedTo.some((x) => x.to === i) ? 3 : 0) + (this.lit.has(i) && quiet ? 2 : 0) + (this.th[i]! > 0.2 ? 1 : 0);
    const nodes = S.bodies.filter((b) => b.kind === NODE && this.ap[b.i]! > 0.05).sort((a, b) => rank(b.i) - rank(a.i));
    const screen = this.screen;
    const beats = build ? S.build.beats : this.now;
    const carded = !build && this.phase === "run" && this.framed && !this.wide ? this.subject : -1;
    for (const b of nodes) {
      const p = P(this.pos[b.i]!);
      if (!p) continue;
      if (this.face > 0) F.bend(p);
      const r = this.rad[b.i]! * F.pxPer(p.d) * 0.9;
      screen.set(b.i, { x: p.x, y: p.y, r });
      const on = b.i === closeUp;
      const aimed = pairOn && b.i === this.target;
      const tied = tiedTo.find((x) => x.to === b.i);
      const lit = quiet && this.lit.has(b.i);
      const hot = Math.min(1, this.en[b.i]!);
      const al = this.ap[b.i]! * (on || lit || aimed || tied || b.i === hov ? 1 : quiet ? 0.32 : closeUp >= 0 ? 0.3 : b.risk ? 0.5 : 0.5 + 0.3 * hot);
      const strong = on || aimed;
      const size0 = strong ? 15 : b.seat || lit ? 13.5 : b.risk ? 11 : 12;
      const size = this.fine ? this.glide(`nz${b.i}`, size0, 9) : size0;
      const heavy = strong || b.seat || lit || !!tied || b.i === hov;
      g.font = `${heavy ? 500 : 400} ${size}px ${SANS}`;
      const name = cut(b.name, strong || b.i === hov ? 16 : 8);
      const tw = g.measureText(name).width;
      const note = (!build ? this.notes.get(b.i) : undefined) ?? (b.i === hov ? this.says[b.i] : undefined);
      let sub = "";
      let moving = false;
      if (this.th[b.i]! > 0.2) sub = this.t("thinking", { dots: ".".repeat(1 + (Math.floor(this.clock * 2.5) % 3)) });
      else if (tied) sub = cut(tied.ev.text, 10);
      else if (build && fact && this.T > fact.s && this.T < fact.e + 2 && (b.facts ?? 0) > 0 && this.fw[b.i]! >= 1) sub = this.t("facts", { count: Math.round(this.fw[b.i]!) });
      else if (!build && this.live.some((x2) => x2.k === "move" && x2.body === b.i)) (sub = this.t("move")), (moving = true);
      else if (on && build && !b.risk && !b.seat) sub = b.org ? this.t("institution") : this.t("person");
      g.font = `11px ${SANS}`;
      const nw = note ? g.measureText(note).width : sub ? sub.length * 11 : 0;
      const wide = Math.max(tw, nw);
      // to the right of them, or to the left where there is no room on the right
      // (beside their face, where they have one)
      const fr = this.faceR.get(b.i);
      const off = fr != null ? fr + 8 : r + 9;
      let x = p.x + off;
      let flip = false;
      if (x + wide > x1 && p.x - off - wide > x0) {
        x = p.x - off - wide;
        flip = true;
      }
      const y = p.y;
      const hidden =
        !inside(p.x, p.y) ||
        // (4, 5, 6: only those who matter now are named: you, whoever deals with you directly, and whoever is being told about)
        (this.net >= 4 && !(b.seat || (b.orbit ?? 99) <= LANES[0] + 0.01 || b.i === this.subject || b.i === this.target || b.i === closeUp || b.i === hov || this.lit.has(b.i))) ||
        // the whole world seen small: no names, the page says what is happening
        (!build && !this.bare && (this.wide || this.phase === "result")) ||
        // seen through the window of their card, which says who they are
        b.i === carded ||
        // the words beside them already say who they are
        (this.bare && !build && this.phase === "run" && b.i === this.subject && !pairOn) ||
        // (the card beside them says who they are)
        (this.face > 0 && b.i === this.picked);
      const ok = !hidden && x + wide <= x1 && (strong || free(x, note || sub ? y + 8 : y, wide, note || sub ? 32 : 15));
      if (ok && strong) taken.push([x - 4, y - 12, x + wide + 4, y + (note || sub ? 26 : 12)]);
      const a = this.fd(`n${b.i}`, ok ? Math.min(1, al) : 0);
      if (a < 0.02) continue;
      const born = quiet ? undefined : beats.find((x2) => (x2.k === "appear" || x2.k === "risk") && x2.body === b.i && this.T >= x2.s && this.T < x2.s + 1.5);
      if (born) {
        const k = (this.T - born.s) / 1.5;
        g.strokeStyle = `rgba(${INK}, ${0.5 * (1 - k)})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(p.x, p.y, r * (0.9 + 0.9 * out3(k)) + 6, 0, Math.PI * 2);
        g.stroke();
      }
      if (fr == null) {
        g.strokeStyle = `rgba(${INK}, ${a * 0.3})`;
        g.lineWidth = 1;
        g.beginPath();
        if (flip) {
          g.moveTo(p.x - r * 0.75 - 2, y);
          g.lineTo(x + wide + 4, y);
        } else {
          g.moveTo(p.x + r * 0.75 + 2, y);
          g.lineTo(x - 4, y);
        }
        g.stroke();
      }
      const tx = flip ? x + wide - tw : x;
      const reached = (aimed && this.emit.k >= 1) || !!tied;
      g.font = `${heavy ? 500 : 400} ${size}px ${SANS}`;
      const warmName = b.seat || lit || reached || this.th[b.i]! > 0.3;
      if (this.fine) {
        // (from the colour of ink to warm and back over a moment, not at once)
        const wk = this.glide(`nw${b.i}`, warmName ? 1 : 0, 6);
        g.fillStyle = `rgba(${Math.round(236 + 4 * wk)}, ${Math.round(235 - 59 * wk)}, ${Math.round(230 - 134 * wk)}, ${a})`;
      } else g.fillStyle = `rgba(${warmName ? WARM : INK}, ${a})`;
      g.fillText(name, tx, y);
      // (what is written under a name comes and goes over a moment: what it last said is kept while it goes)
      const under = sub || note || "";
      const held = this.unders.get(b.i);
      const ua = this.fine ? this.fd(`nu${b.i}`, under ? 1 : 0, 7, 5) : under ? 1 : 0;
      if (under) this.unders.set(b.i, { text: under, small: !!sub, warm: moving || (!!sub && !!tied) });
      const u = under ? this.unders.get(b.i)! : held;
      if (u && ua > 0.02) {
        if (u.small) {
          g.font = `9.5px ${MONO}`;
          g.fillStyle = `rgba(${u.warm ? WARM : INK}, ${a * ua * (u.warm ? 0.95 : 0.6)})`;
          g.fillText(u.text, flip ? x + wide - g.measureText(u.text).width : x, y + size * 0.5 + 8);
        } else {
          g.font = `11px ${SANS}`;
          g.fillStyle = `rgba(${INK}, ${a * ua * 0.66})`;
          g.fillText(u.text, flip ? x + wide - g.measureText(u.text).width : x, y + size * 0.5 + 9);
        }
      }
    }

    // ties being drawn, by name
    for (const b of this.live) {
      if (b.k !== "tie" || b.tie < 0 || closeUp >= 0) continue;
      const A = this.pos[b.body]!;
      const B = this.pos[b.to]!;
      const tb = S.bodies[b.tie]!;
      const lift = tb.thin ? 0.25 + 0.1 * A.distanceTo(B) : 0.5 + 0.2 * A.distanceTo(B);
      const p = P(new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5).add(new THREE.Vector3(0, lift * 0.5, 0)));
      if (!p || !inside(p.x, p.y)) continue;
      const k = (this.T - b.s) / b.d;
      const al = Math.min(sat(k * 5), sat((1 - k) * 3)) * 0.85;
      g.font = `11px ${SANS}`;
      const txt = cut(b.ev.text, 8);
      const tw = g.measureText(txt).width;
      if (!free(p.x - tw / 2, p.y - 14, tw, 14)) continue;
      g.fillStyle = `rgba(${INK}, ${al})`;
      g.fillText(txt, p.x - tw / 2, p.y - 14);
    }

    if (!build) this.reach();
    // (in the settled way, where the page asks for it: what is left to odds is drawn in the world)
    if (!this.bare || (this.fine && this.odds)) this.told();
    // what the picture itself says: a draw, a roll, the opening; and, while building, who someone is, on a card
    for (const b of this.live) {
      const sc = b.body >= 0 ? screen.get(b.body) : undefined;
      const k = (this.T - b.s) / b.d;
      const al = Math.min(sat(k * 6), sat((1 - k) * 4));
      if (!build && (b.k === "odds" || b.k === "draw")) continue;
      if (b.k === "draw" && b.feat) {
        if (sc && b === f && (b.ev.options ?? []).filter((o) => o.p > 0).length >= 2) this.wheel(sc, b, k, al, 13);
      } else if (b.k === "chance" && sc && inside(sc.x, sc.y) && !this.bare) {
        // (the engine labels the option that something happens "\u53d1\u751f", Chinese for "happens")
        const p0 = (b.ev.options ?? []).find((o) => o.label === "\u53d1\u751f")?.p;
        const txt = p0 != null ? this.t("rollOdds", { p: Math.round(p0 * 100), picked: b.ev.picked ?? "" }) : this.t("roll", { picked: b.ev.picked ?? "" });
        g.font = `10px ${MONO}`;
        g.fillStyle = `rgba(${INK}, ${al * 0.7})`;
        g.fillText(txt, sc.x - g.measureText(txt).width / 2, sc.y + sc.r + 22 + (b.n % 2) * 13);
      } else if (b.k === "persona" && b.feat && build && sc && b === f && !this.bare) {
        this.card(sc, this.t("profile"), b.ev.text, k, al);
      } else if (b.k === "lookup" && build && sc && inside(sc.x, sc.y)) {
        g.font = `10.5px ${MONO}`;
        g.fillStyle = `rgba(${WARM}, ${al * 0.9})`;
        g.fillText(cut(b.ev.text, 22), sc.x + sc.r + 9, sc.y + 16);
      } else if (b.k === "open" && !this.bare) {
        const p = P(new THREE.Vector3(0, 0, 0));
        if (p) {
          g.font = `500 17px ${SANS}`;
          const txt = this.t("worldStarts");
          const y = p.y - Math.min(170, h * 0.2);
          g.fillStyle = `rgba(${INK}, ${al * 0.95})`;
          g.fillText(txt, p.x - g.measureText(txt).width / 2, y);
          const sub = S.start ? this.t("startsFrom", { start: S.start }) : this.t("startsHere");
          g.font = `10.5px ${MONO}`;
          g.fillStyle = `rgba(${WARM}, ${al * 0.85})`;
          g.fillText(sub, p.x - g.measureText(sub).width / 2, y + 22);
        }
      }
    }
    g.globalAlpha = 1;
  }

  /**
   * In a play: what is done goes out to whom it is done to. A line leaves whoever acts as they speak or act and comes
   * to whoever it reaches (dotted, with ripples, for something said; whole, with one head, for something done); when it
   * arrives they are marked. And when a number of the main line moves, a spark leaves for where the page keeps it.
   */
  private reach() {
    const g = this.ctx;
    const run = this.phase === "run";
    const key = run && this.subject >= 0 && this.target >= 0 && this.emit.kind !== "none" ? `${this.subject}:${this.target}` : "";
    if (key) this.links.set(key, { a: this.subject, b: this.target, say: this.emit.kind === "say", k: this.emit.k, al: this.links.get(key)?.al ?? 0 });
    for (const [id, L] of this.links) {
      const cur = id === key;
      L.al += ((cur ? 1 : 0) - L.al) * (1 - Math.exp(-this.fdt * (cur ? 5 : 4)));
      if (!cur && L.al < 0.02) {
        this.links.delete(id);
        continue;
      }
      const a = this.screen.get(L.a);
      const b = this.screen.get(L.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < a.r + b.r + 26) continue;
      const ux = dx / len;
      const uy = dy / len;
      // it bends away from the words, which are to the right
      let nx = uy;
      let ny = -ux;
      if (nx > 0) [nx, ny] = [-nx, -ny];
      const bend = Math.min(54, len * 0.15);
      const p0 = { x: a.x + ux * (a.r + 9), y: a.y + uy * (a.r + 9) };
      const p2 = { x: b.x - ux * (b.r + 9), y: b.y - uy * (b.r + 9) };
      const c = { x: (p0.x + p2.x) / 2 + nx * bend, y: (p0.y + p2.y) / 2 + ny * bend };
      const at = (u: number) => ({ x: (1 - u) * (1 - u) * p0.x + 2 * u * (1 - u) * c.x + u * u * p2.x, y: (1 - u) * (1 - u) * p0.y + 2 * u * (1 - u) * c.y + u * u * p2.y });
      const k = ease(sat(L.k));
      if (k <= 0.001) continue;
      const q1 = { x: p0.x + (c.x - p0.x) * k, y: p0.y + (c.y - p0.y) * k };
      const q2 = at(k);
      g.save();
      g.shadowBlur = 0;
      g.lineCap = "round";
      g.strokeStyle = `rgba(${INK}, ${0.5 * L.al})`;
      g.lineWidth = 1;
      g.setLineDash(L.say ? [1.5, 5] : []);
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.quadraticCurveTo(q1.x, q1.y, q2.x, q2.y);
      g.stroke();
      g.setLineDash([]);
      if (L.k < 1) {
        if (L.say) {
          // something said: a few ripples travelling with it
          for (let j = 0; j < 3; j++) {
            const u = k - j * 0.07;
            if (u <= 0.02) continue;
            const m = at(u);
            const m2 = at(Math.min(1, u + 0.01));
            const tx = m2.x - m.x;
            const ty = m2.y - m.y;
            const tl = Math.hypot(tx, ty) || 1;
            const half = 7 - j * 1.6;
            g.strokeStyle = `rgba(${WARM}, ${(0.9 - j * 0.26) * L.al})`;
            g.lineWidth = 1.4;
            g.beginPath();
            g.moveTo(m.x - (ty / tl) * half, m.y + (tx / tl) * half);
            g.lineTo(m.x + (ty / tl) * half, m.y - (tx / tl) * half);
            g.stroke();
          }
        } else {
          // something done: one head, with what it leaves behind it
          for (let j = 0; j < 8; j++) {
            const u = k - j * 0.018;
            if (u <= 0) break;
            const m = at(u);
            g.fillStyle = `rgba(${WARM}, ${(1 - j / 8) * (j ? 0.5 : 1) * L.al})`;
            g.beginPath();
            g.arc(m.x, m.y, j ? 1.6 : 3, 0, Math.PI * 2);
            g.fill();
          }
        }
      } else {
        // it has arrived: whoever it reached is marked, once
        const e = sat((L.k - 1) / 1.1);
        if (e < 1) {
          g.strokeStyle = `rgba(${WARM}, ${(1 - e) * 0.8 * L.al})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(b.x, b.y, b.r + 7 + 20 * out3(e), 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.restore();
    }
    // something said to no one in particular goes out all round
    if (run && this.subject >= 0 && this.target < 0 && this.emit.kind === "say" && this.emit.k < 1.6) {
      const a = this.screen.get(this.subject);
      if (a) {
        g.save();
        g.shadowBlur = 0;
        for (let j = 0; j < 3; j++) {
          const e = this.emit.k - j * 0.22;
          if (e <= 0 || e >= 1) continue;
          g.strokeStyle = `rgba(${WARM}, ${(1 - e) * 0.55})`;
          g.lineWidth = 1.1;
          g.beginPath();
          g.arc(a.x, a.y, a.r + 10 + 46 * out3(e), 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }
    }
    // a number of the main line moves
    if (!run) return;
    for (const b of this.live) {
      if (b.k !== "delta") continue;
      const sink = this.sinks.get(b.ev.head);
      if (!sink) continue;
      const from = (b.body >= 0 ? this.screen.get(b.body) : null) ?? { x: this.centre?.x ?? this.field.w / 2, y: this.centre?.y ?? this.field.h / 2, r: 0 };
      const k = sat((this.T - b.s) / 1.2);
      if (k >= 1) continue;
      const c = { x: (from.x + sink.x) / 2 - 40, y: Math.min(from.y, sink.y) + 30 };
      const at = (u: number) => ({ x: (1 - u) * (1 - u) * from.x + 2 * u * (1 - u) * c.x + u * u * sink.x, y: (1 - u) * (1 - u) * from.y + 2 * u * (1 - u) * c.y + u * u * sink.y });
      g.save();
      g.shadowBlur = 0;
      for (let j = 0; j < 10; j++) {
        const u = ease(k) - j * 0.014;
        if (u <= 0) break;
        const m = at(u);
        g.fillStyle = `rgba(${WARM}, ${(1 - j / 10) * (j ? 0.45 : 1) * Math.min(1, k * 6)})`;
        g.beginPath();
        g.arc(m.x, m.y, j ? 1.5 : 2.8, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  /** In a play, the thing the page is telling now that was left to odds. */
  private told() {
    const o = this.odds;
    if (!o || this.mode === "build" || this.phase !== "run" || o.options.filter((x) => x.p > 0).length < 2) return;
    const sc = this.screen.get(o.body);
    if (!sc) return;
    this.wheel(sc, { body: o.body, ev: { options: o.options, picked: o.picked, head: "", text: "" } } as unknown as Beat, o.k, Math.min(sat(o.k * 6), sat((1 - o.k) * 5)), 0);
  }

  /** A draw: the options round whoever it is for, each as long as its odds; a light goes round and stops on one. */
  private wheel(sc: { x: number; y: number; r: number }, b: Beat, k: number, al: number, chars: number) {
    const g = this.ctx;
    const opts = (b.ev.options ?? []).filter((o) => o.p > 0).slice(0, 6);
    const sum = opts.reduce((s, o) => s + o.p, 0);
    const bare = chars <= 0;
    const R = bare ? Math.max(64, Math.min(112, sc.r * 1.3 + 16)) : Math.max(96, Math.min(176, sc.r * 1.55 + 30));
    const gap = 0.07;
    const full = Math.PI * 2 - gap * opts.length;
    let a = -Math.PI / 2 + gap / 2;
    const arcs = opts.map((o) => {
      const s = a;
      const e = a + (o.p / sum) * full;
      a = e + gap;
      return { o, s, e };
    });
    const picked = Math.max(0, arcs.findIndex((x) => x.o.label === b.ev.picked || (b.ev.picked ? x.o.label.includes(b.ev.picked) || b.ev.picked.includes(x.o.label) : false)));
    const settle = 0.52;
    const done = sat((k - settle) / 0.1);
    const grow = out3(k / 0.14);
    const target = (arcs[picked]!.s + arcs[picked]!.e) / 2;
    const bead = target - Math.PI * 2 * 1.75 * Math.pow(1 - sat(k / settle), 2.4);
    g.lineCap = "butt";
    // (in the settled way it is of the world's own stuff: grains round whoever it is about, see odd())
    if (this.fine) this.odd(b.body, R, arcs, picked, k, al, bead, done, grow);
    arcs.forEach((x, j) => {
      const mine = j === picked;
      const dim = mine ? 1 : 1 - 0.5 * done;
      if (!this.fine) {
        g.strokeStyle = `rgba(${mine && done > 0 ? WARM : INK}, ${al * dim * (mine ? 0.55 + 0.45 * done : 0.5)})`;
        g.lineWidth = mine ? 1.5 + 1.5 * done : 1.5;
        g.beginPath();
        g.arc(sc.x, sc.y, R, x.s, x.s + (x.e - x.s) * grow);
        g.stroke();
      }
      if (bare) return;
      const m = (x.s + x.e) / 2;
      const lx = sc.x + Math.cos(m) * (R + 14);
      const ly = sc.y + Math.sin(m) * (R + 14);
      const leftSide = Math.cos(m) < -0.15;
      const mid = Math.abs(Math.cos(m)) <= 0.15;
      const pct = `${Math.round((x.o.p / sum) * 100)}%`;
      const name = cut(x.o.label, chars);
      g.font = `${mine && done > 0 ? 500 : 400} 12.5px ${SANS}`;
      const tw = g.measureText(name).width;
      g.font = `10px ${MONO}`;
      const pw = g.measureText(pct).width;
      const tx = mid ? lx - (tw + pw + 7) / 2 : leftSide ? lx - tw - pw - 7 : lx;
      const ty = ly + (mid ? (Math.sin(m) > 0 ? 9 : -9) : 0);
      const la = al * grow * dim;
      g.font = `${mine && done > 0 ? 500 : 400} 12.5px ${SANS}`;
      g.fillStyle = `rgba(${mine && done > 0 ? WARM : INK}, ${la * (mine ? 1 : 0.78)})`;
      g.fillText(name, tx, ty);
      g.font = `10px ${MONO}`;
      g.fillStyle = `rgba(${INK}, ${la * 0.55})`;
      g.fillText(pct, tx + tw + 7, ty + 0.5);
    });
    if (!this.fine) {
      const bx = sc.x + Math.cos(bead) * R;
      const by = sc.y + Math.sin(bead) * R;
      for (let j = 1; j <= 9; j++) {
        const t = bead - j * 0.05 * (1 - done);
        g.fillStyle = `rgba(${WARM}, ${al * 0.5 * (1 - j / 10) * (1 - done)})`;
        g.beginPath();
        g.arc(sc.x + Math.cos(t) * R, sc.y + Math.sin(t) * R, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = `rgba(${WARM}, ${al})`;
      g.beginPath();
      g.arc(bx, by, 3 + 1.2 * done, 0, Math.PI * 2);
      g.fill();
    }
    if (this.mode !== "build") return;
    // while building, what is being drawn and from whom (in a play the page's own card says it)
    const head = this.t("draw", { what: b.ev.head.replace(/^.*?· /, "") });
    g.font = `500 13px ${SANS}`;
    const top = sc.y - R - 58;
    g.fillStyle = `rgba(${INK}, ${al * grow})`;
    g.fillText(head, sc.x - g.measureText(head).width / 2, top);
    if (b.ev.text) {
      g.font = `11px ${SANS}`;
      const sub = cut(this.t("realDistribution", { text: b.ev.text }), 32);
      g.fillStyle = `rgba(${INK}, ${al * grow * 0.5})`;
      g.fillText(sub, sc.x - g.measureText(sub).width / 2, top + 19);
    }
  }

  /**
   * What is left to odds, of the world's own stuff (the settled way): a ring of grains round whoever it is about,
   * facing the eye, each way it could go a stretch of it as long as its odds, the grains flowing along their stretch.
   * A brighter, warm clump runs round, slower and slower, and is caught by one stretch; that one turns warm and winds
   * in to whoever it is about, and the rest drift out and go.
   */
  private odd(body: number, R: number, arcs: { s: number; e: number }[], picked: number, k: number, al: number, bead: number, done: number, grow: number) {
    const F = this.field;
    const at = this.where(body);
    const p = F.project(at);
    if (!p || al < 0.01) return;
    const per = F.pxPer(p.d);
    _rt.setFromMatrixColumn(F.camera.matrixWorld, 0);
    _up.setFromMatrixColumn(F.camera.matrixWorld, 1);
    const N = Math.min(1500, Math.round(R * 8));
    const sum = arcs.reduce((x, a) => x + (a.e - a.s), 0);
    const fall = ease(sat((k - 0.66) / 0.26));
    const t = this.clock;
    const pos = this.motePos;
    const look = this.moteLook;
    let n = this.moteN;
    let acc = 0;
    let ai = 0;
    for (let j = 0; j < N && n < MOTES; j++) {
      // (as many grains to a stretch as its share of the ring)
      const q = ((j + 0.5) / N) * sum;
      while (ai < arcs.length - 1 && q > acc + (arcs[ai]!.e - arcs[ai]!.s)) {
        acc += arcs[ai]!.e - arcs[ai]!.s;
        ai++;
      }
      const x = arcs[ai]!;
      const h1 = rnd(j, 1);
      const h2 = rnd(j, 2);
      const h3 = rnd(j, 3);
      // it flows along its stretch, and comes and goes at the ends of it
      const u = (h1 + t * 0.03 * (0.5 + h3)) % 1;
      const edge = Math.min(1, Math.min(u, 1 - u) / 0.07);
      let th = x.s + (x.e - x.s) * u * grow;
      let rad = R + (h2 - 0.5) * 7 * (0.35 + 0.65 * h3);
      // the light that goes round: brightest where it is, with a tail behind it
      const dth = wrap(bead - th);
      const run = (1 - done) * (Math.exp(-(dth * dth) / 0.018) + (dth > 0 && dth < 1.2 ? 0.5 * Math.exp(-dth / 0.3) : 0));
      let bright = (0.3 + 0.5 * h3) * edge * grow;
      let warm = Math.min(1, run);
      if (ai === picked) {
        // (caught: it turns warm, and winds in)
        bright *= (1 + 1.4 * done) * (1 - 0.45 * fall);
        warm = Math.max(warm, done);
        rad *= 1 - 0.9 * fall;
        th += 2.6 * fall * (0.5 + h3);
      } else {
        bright *= (1 - 0.6 * done) * (1 - 0.85 * fall);
        rad += 14 * fall * (0.3 + h2);
      }
      bright = (bright + 1.5 * run) * al;
      if (bright < 0.012) continue;
      const cx = (Math.cos(th) * rad) / per;
      const cy = (-Math.sin(th) * rad) / per;
      pos[n * 3] = at.x + _rt.x * cx + _up.x * cy;
      pos[n * 3 + 1] = at.y + _rt.y * cx + _up.y * cy;
      pos[n * 3 + 2] = at.z + _rt.z * cx + _up.z * cy;
      look[n * 3] = 1.5 + 1.7 * h3 + 1.6 * Math.min(1, run);
      look[n * 3 + 1] = bright;
      look[n * 3 + 2] = warm;
      n++;
    }
    this.moteN = n;
  }

  /** A few lines on a card of their own beside whoever they are about, appearing as they are written. */
  private card(sc: { x: number; y: number; r: number }, head: string, text: string, k: number, al: number) {
    const g = this.ctx;
    const w = this.field.w;
    const maxW = 292;
    g.font = `14px ${SANS}`;
    const full = cut(text, 66);
    const lines: string[] = [];
    let line = "";
    for (const ch of full) {
      if (g.measureText(line + ch).width > maxW) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    if (line) lines.push(line);
    const H = 44 + lines.length * 22;
    const off = sc.r * 1.4 + 30;
    const right = sc.x + off + maxW + 36 < w - this.margins.r;
    const x = right ? sc.x + off : Math.max(this.margins.l + 20, sc.x - off - maxW - 36);
    const y = sc.y - H / 2;
    g.save();
    g.shadowColor = "rgba(0, 0, 0, 0.35)";
    g.shadowBlur = 30;
    g.fillStyle = `rgba(16, 17, 19, ${0.9 * al})`;
    g.beginPath();
    g.roundRect(x, y, maxW + 36, H, 14);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = `rgba(${INK}, ${0.08 * al})`;
    g.lineWidth = 1;
    g.stroke();
    g.font = `10.5px ${MONO}`;
    g.fillStyle = `rgba(${WARM}, ${al * 0.95})`;
    g.fillText(head, x + 18, y + 20);
    g.font = `14px ${SANS}`;
    let left = Math.ceil(full.length * sat(k / 0.3));
    lines.forEach((ln, j) => {
      g.fillStyle = `rgba(${INK}, ${al * 0.96})`;
      g.fillText(ln.slice(0, Math.max(0, left)), x + 18, y + 44 + j * 22);
      left -= ln.length;
    });
    g.restore();
  }

  dispose() {
    this.field.dispose();
  }
}
