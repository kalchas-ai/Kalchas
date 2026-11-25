"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MONO } from "@/components/kit/palette";
import { useApp } from "@/components/product/shell";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";
import type { Asked } from "@/components/flow-lab/asks";

/**
 * The last thing asked, after everything else: how closely the world is to be watched (asks.tsx). It is not a row of
 * answers to press but the grain of time. Across the middle, under what is asked, lies a strand of light made of
 * points like the galaxy's stars: it is the course of the matter, and each bright point on it is one moment that
 * would be shown. Each pace is a grain of its own: the coarsest a few bright points far apart with faint dust between,
 * the finest many small points close together; and the coarser it is, the faster time goes along it, since each of
 * its moments holds more. The paces are named side by side under the strand, as words.
 *
 * Nothing is chosen for anyone. At rest the strand is undecided: an even, faint thread with no moments standing out of
 * it, drifting slowly, and under the names there is nothing. The name the pointer is on (or that is gone to by the
 * keyboard, or touched) grains the strand its way, the points coming together into moments or splitting apart, never
 * there or gone at once, and under the names it says what one step is at that pace, and about how many steps and how
 * long that is; leaving the names, the strand goes back to undecided. Pressing a name chooses it: the strand settles
 * into that grain, warms a little, is held a moment, and then gathers in toward the middle as the answer goes up to
 * the line at the top like any other. Only the paces offered are answered here: nothing is written in, nothing passed
 * over.
 *
 * The question is written for the world after the other answers are in (it is not among them): it comes from a
 * source given round the page (PaceSource), which asks for it and is told what was chosen.
 */

export type Pace = { name: string; step: string; steps: number; minutes: number };
/** What is asked about pace for one world: the question, and the ways offered (two to five). */
export type PaceAsk = { q: string; options: Pace[] };
/**
 * Where the question about pace comes from as it really runs, and where the choice goes. `ask` is called once the
 * other answers have been told, and gives nothing when there is no such question; `choose` is told the name of a way
 * offered (or nothing, where it was not come to); `done` is told when the asking is over and
 * the answers have gone into the picture (so whatever held the page on the questions can let it go).
 */
export type PaceSource = { ask: () => Promise<PaceAsk | null>; choose: (answer: string | null) => void; done?: () => void };
export const PaceSourceContext = createContext<PaceSource | null>(null);

/** The question as it is asked on the page, after the others. */
export const paceAsked = (p: PaceAsk): Asked => ({ q: p.q, kind: "one", options: p.options.map((o) => o.name), pace: p.options });

/** How many points the moments are drawn from (the finest grain has this many apart), the fewest a grain has, and how much dust lies between them. */
const POOL = 56;
const FEW = 3;
const DUST = 240;
/** How long the strand is held in the grain chosen before the answer goes up, and how long it takes to gather (ms). */
const HOLD = 620;
const GONE = 560;
const SWIFT = "cubic-bezier(.2,.7,.2,1)";
const sat = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

/**
 * How many moments each pace has on the strand. Steps run from a handful to several hundred, so they are taken on a
 * log scale: where the paces lie on it (from 3 to 500 steps) sets roughly where they sit between the fewest moments
 * and the pool, but they are always spread over a good part of it, so that paces close in number are still plainly
 * different grains; and between the fewest and the most the moments grow by even ratios.
 */
function momentsOf(steps: number[]): number[] {
  const at = (s: number) => sat(Math.log(Math.max(1, s) / 3) / Math.log(500 / 3));
  const a = steps.map(at);
  const lo0 = Math.min(...a);
  const hi0 = Math.max(...a);
  const want = steps.length > 1 ? 0.75 : 0;
  const grow = Math.max(0, want - (hi0 - lo0)) / 2;
  let lo = lo0 - grow;
  let hi = hi0 + grow;
  if (lo < 0) (hi = Math.min(1, hi - lo), (lo = 0));
  if (hi > 1) (lo = Math.max(0, lo - (hi - 1)), (hi = 1));
  return a.map((x) => {
    const r = hi0 > lo0 ? (x - lo0) / (hi0 - lo0) : 0.5;
    const pos = steps.length > 1 ? lo + r * (hi - lo) : x;
    return Math.round(FEW * Math.pow(POOL / FEW, pos));
  });
}

type Grain = { x: Float32Array; lum: Float32Array; size: Float32Array; /** How coarse it is (1 the coarsest): time goes along it that much faster. */ coarse: number };
/** A grain of n moments: every point of the pool belongs to one of them; the first of each is its light, the rest lie on it unseen, and come apart from it when the grain is finer. */
function grainOf(n: number): Grain {
  const x = new Float32Array(POOL);
  const lum = new Float32Array(POOL);
  const size = new Float32Array(POOL);
  const coarse = sat(1 - (n - FEW) / (POOL - FEW));
  const big = 2.0 + 3.8 * Math.pow(coarse, 1.3);
  const bright = 0.88 + 0.12 * coarse;
  let last = -1;
  for (let j = 0; j < POOL; j++) {
    const a = Math.floor((j * n) / POOL);
    // (spread along the course, not evenly: things do not come at even intervals)
    x[j] = (a + 0.5 + 0.28 * hash(n, a)) / n;
    lum[j] = a !== last ? bright * (0.82 + 0.09 * (hash(a, n + 7) + 1)) : 0;
    size[j] = big * (0.85 + 0.15 * (hash(n + 3, a) + 1));
    last = a;
  }
  return { x, lum, size, coarse };
}
/** Undecided: every point of the pool lies on its own along the course, all as faint as the dust, none of them a moment. */
function undecided(): Grain {
  const x = new Float32Array(POOL);
  const lum = new Float32Array(POOL);
  const size = new Float32Array(POOL);
  for (let j = 0; j < POOL; j++) {
    x[j] = (j + 0.5 + 0.4 * hash(j, 91)) / POOL;
    lum[j] = 0.3 + 0.1 * (hash(j, 17) + 1);
    size[j] = 0.85 + 0.15 * (hash(j, 23) + 1);
  }
  return { x, lum, size, coarse: 0.3 };
}

/** About how long a play is, said as a person would: minutes while it is under an hour, then hours (halves while short). */
function howLong(t: T, minutes: number) {
  const m = Math.max(1, Math.round(minutes || 0));
  if (m < 60) return t("minutes", { count: m });
  const h = m / 60;
  const said = h < 10 ? Math.round(h * 2) / 2 : Math.round(h);
  return t("hours", { count: said });
}

/** The steps and how long, said short. */
const brief = (t: T, p: Pace) => `${t("steps", { count: Math.max(1, Math.round(p.steps)) })} · ${howLong(t, p.minutes)}`;

/**
 * A strand of light drawn in the grain of one pace (or undecided, with none): every point goes on its way to where
 * that grain has it, never there or gone at once; time goes along it faster the coarser it is, until a pace is chosen;
 * chosen, it warms and is held, and then gathers in toward the middle. `lit` is how bright it is as a whole.
 */
function Strand({ grains, at, held, gone, lit = 1, dust: nDust = DUST, wave = 6, into, focus = null, className, style }: { /** Where along it (0 to 1) it is looked at closely, as through a lens: there its points stand apart, larger and brighter, and it swells a little (see put). */ focus?: number | null; grains: Grain[]; at: number | null; held: boolean; gone: boolean; lit?: number; dust?: number; wave?: number; /** Where, on the screen, the strand goes down to once chosen (what is gathering in the galaxy): given, it does not gather where it is but goes there (see fall). */ into?: () => { x: number; y: number } | null; className?: string; style?: React.CSSProperties }) {
  const { P } = useApp();
  const sheet = useRef<HTMLCanvasElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const now = useRef({ at, held, gone: 0, lit, into, focus });
  now.current.at = at;
  now.current.held = held;
  now.current.lit = lit;
  now.current.into = into;
  now.current.focus = focus;
  if (gone && !now.current.gone) now.current.gone = performance.now();
  useEffect(() => {
    const cv = sheet.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const rest = undecided();
    const cur = { x: Float32Array.from(rest.x), lum: new Float32Array(POOL), size: Float32Array.from(rest.size) };
    const seeds = Array.from({ length: POOL }, () => Math.random());
    const lift = Array.from({ length: POOL }, () => gauss());
    const dust = Array.from({ length: nDust }, () => ({ x: Math.random(), y: gauss(), lum: 0.14 + 0.42 * Math.pow(Math.random(), 2), size: 0.7 + 0.9 * Math.random(), seed: Math.random() }));
    const [ir, ig, ib] = P.inkRgb.split(" ").map(Number) as [number, number, number];
    const [wr, wg, wb] = P.warmRgb.split(" ").map(Number) as [number, number, number];
    // (light adds to a dark page; on a light one it is laid over)
    const light = P.pageRgb.split(" ").map(Number).reduce((s, v) => s + v, 0) / 3 > 128;
    const t0 = performance.now();
    let last = t0;
    let drift = Math.random();
    let speed = 0.008;
    let warm = 0;
    let shine = now.current.lit;
    /** Where the lens is and how much it is there (it glides from one place to the next, and comes and goes softly). */
    let lens = now.current.focus ?? 0.5;
    let lensOn = 0;
    let frame = 0;
    /** Once chosen with somewhere to go: the light the strand becomes on its way down (see fall). */
    let motes: Mote[] | null = null;
    let T = { x: 0, y: 0 };
    const draw = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      const w = cv.offsetWidth;
      // (the strand lies along the middle of its band; the sheet may reach further down, for it to go down)
      const h = band.current?.offsetHeight ?? cv.offsetHeight;
      const ch = cv.offsetHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(ch * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(ch * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, ch);
      const s = now.current;
      // chosen, with somewhere to go: the strand goes down into the galaxy as one stream (and is not drawn as a strand again)
      if (s.gone && s.into && !motes) {
        const p = s.into();
        const box = cv.getBoundingClientRect();
        const kk = box.width / Math.max(1, cv.offsetWidth) || 1;
        if (p) {
          T = { x: (p.x - box.left) / kk, y: (p.y - box.top) / kk };
          motes = [];
          const reach = Math.max(1, T.x, w - T.x);
          const c0 = 0.4 * warm;
          for (let j = 0; j < POOL; j++) {
            if (cur.lum[j]! < 0.12) continue;
            const bx = (cur.x[j]! + drift) % 1;
            const env = ease(sat(bx / 0.14)) * ease(sat((1 - bx) / 0.14));
            const x0 = w * bx;
            const y0 = h / 2 + wave * Math.sin(6.2832 * bx * 1.15 + 0.8) + lift[j]! * 1.2;
            // (the middle of the strand lets go first, and the rest after, out to its ends)
            const d = 60 + 560 * Math.pow(Math.abs(x0 - T.x) / reach, 0.9);
            const lum = cur.lum[j]! * env * shine;
            motes.push({ x0, y0, d: d + 80 * Math.random(), dur: 1050 + 250 * Math.random(), lum, size: cur.size[j]!, seed: seeds[j]!, c: c0 });
            // (each moment brings a little of the dust about it, so that it falls as a stream and not as beads)
            for (let q = 0; q < 4; q++) motes.push({ x0: x0 + gauss() * 10, y0: y0 + gauss() * 3, d: d + 40 + 160 * Math.random(), dur: 1000 + 350 * Math.random(), lum: lum * (0.18 + 0.25 * Math.random()), size: 0.8 + 0.6 * Math.random(), seed: Math.random(), c: c0 });
          }
        }
      }
      if (motes) return fall(t, w, h);
      const out = s.gone ? ease(sat((t - s.gone) / GONE)) : 0;
      if (out >= 1) return;
      const to = (s.at != null && s.at >= 0 ? grains[s.at] : null) ?? rest;
      const k = 1 - Math.exp(-dt / 230);
      for (let j = 0; j < POOL; j++) {
        cur.x[j] += (to.x[j]! - cur.x[j]!) * k;
        cur.lum[j] += (to.lum[j]! - cur.lum[j]!) * k;
        cur.size[j] += (to.size[j]! - cur.size[j]!) * k;
      }
      speed += ((s.held ? 0 : 0.005 + 0.02 * to.coarse) - speed) * (1 - Math.exp(-dt / 500));
      drift = (drift + (speed * dt) / 1000) % 1;
      warm += ((s.held ? 1 : 0) - warm) * (1 - Math.exp(-dt / 420));
      shine += (s.lit - shine) * (1 - Math.exp(-dt / 260));
      if (s.focus != null) lens += (s.focus - lens) * (1 - Math.exp(-dt / (lensOn < 0.05 ? 1 : 170)));
      lensOn += ((s.focus != null && !s.held ? 1 : 0) - lensOn) * (1 - Math.exp(-dt / 300));
      const born = ease(sat((t - t0) / 800));
      const cy = h / 2;
      g.globalCompositeOperation = light ? "source-over" : "lighter";
      const c = 0.4 * warm;
      const r = Math.round(ir + (wr - ir) * c);
      const gg = Math.round(ig + (wg - ig) * c);
      const b = Math.round(ib + (wb - ib) * c);
      const put = (bx: number, dy: number, lum: number, size: number, seed: number) => {
        let x = (bx + drift) % 1;
        const env = ease(sat(x / 0.14)) * ease(sat((1 - x) / 0.14));
        const flick = 0.82 + 0.18 * Math.sin(seed * 97 + t * 0.0021 * (0.6 + seed));
        // (under the lens: what is near where it is looked at stands apart from its middle, larger, brighter, and the strand swells there)
        const off = x - lens;
        const near = lensOn * Math.exp(-(off * off) / (2 * 0.05 * 0.05));
        x += off * 0.9 * near;
        lum *= 1 + 1.1 * near;
        size *= 1 + 0.7 * near;
        const al = lum * env * flick * born * (1 - out) * shine;
        if (al < 0.01) return;
        x += (0.5 - x) * out * 0.55;
        const px = w * x;
        const py = cy + (wave * Math.sin(6.2832 * x * 1.15 + 0.8) + dy) * (1 + 1.6 * near) * (1 - 0.7 * out);
        g.fillStyle = `rgba(${r}, ${gg}, ${b}, ${Math.min(1, al).toFixed(3)})`;
        g.beginPath();
        g.arc(px, py, size / 2, 0, 6.2832);
        g.fill();
        if (size > 1.8 && lum > 0.5) {
          const reach = size * 4.4;
          const halo = g.createRadialGradient(px, py, 0, px, py, reach);
          halo.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${(al * 0.45).toFixed(3)})`);
          halo.addColorStop(0.35, `rgba(${r}, ${gg}, ${b}, ${(al * 0.11).toFixed(3)})`);
          halo.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
          g.fillStyle = halo;
          g.beginPath();
          g.arc(px, py, reach, 0, 6.2832);
          g.fill();
        }
      };
      for (const d of dust) put(d.x, d.y * wave * 0.75, d.lum, d.size, d.seed);
      for (let j = 0; j < POOL; j++) put(cur.x[j]!, lift[j]! * 1.2, cur.lum[j]!, cur.size[j]!, seeds[j]!);
      frame = requestAnimationFrame(draw);
    };
    /**
     * The strand going down: each of its points is drawn in along it toward the middle first (the strand closes into
     * one bright knot), and then falls straight down the middle, slow at first and faster as it goes, with a short
     * trail behind it; it is gone into the light as it arrives, and where it arrives the light gathering there is lit
     * for a moment. The dust it lay in fades where it was.
     */
    const fall = (t: number, w: number, h: number) => {
      const s = now.current;
      const since = t - s.gone;
      g.globalCompositeOperation = light ? "source-over" : "lighter";
      const col = (c: number, a: number) => `rgba(${Math.round(ir + (wr - ir) * c)}, ${Math.round(ig + (wg - ig) * c)}, ${Math.round(ib + (wb - ib) * c)}, ${Math.min(1, a).toFixed(3)})`;
      // (the dust fades where it lies)
      const left = 1 - ease(sat(since / 520));
      if (left > 0)
        for (const d of dust) {
          const x = (d.x + drift) % 1;
          const env = ease(sat(x / 0.14)) * ease(sat((1 - x) / 0.14));
          const al = d.lum * env * left * shine * 0.9;
          if (al < 0.01) continue;
          g.fillStyle = col(0.4 * warm, al);
          g.beginPath();
          g.arc(w * x, h / 2 + wave * Math.sin(6.2832 * x * 1.15 + 0.8) + d.y * wave * 0.75, d.size / 2, 0, 6.2832);
          g.fill();
        }
      let going = left > 0;
      let landed = 0;
      for (const m of motes!) {
        const u = sat((since - m.d) / m.dur);
        if (u < 1) going = true;
        // (where it is at a moment of its way: drawn in along the strand over the first half, falling all the way)
        const at = (v: number) => {
          const a = ease(sat(v / 0.5));
          return { x: m.x0 + (T.x - m.x0) * a, y: m.y0 + (T.y - m.y0) * Math.pow(v, 2.4) };
        };
        const end = 1 - ease(sat((u - 0.86) / 0.14));
        const flick = 0.85 + 0.15 * Math.sin(m.seed * 97 + t * 0.003);
        // (a little brighter as it closes in, warmer as it goes down)
        const al = m.lum * flick * end * (1 + 0.5 * Math.sin(Math.PI * sat(u / 0.6)));
        landed += u > 0.8 ? Math.sin(Math.PI * sat((u - 0.8) / 0.4)) * m.lum : 0;
        if (al < 0.01) continue;
        const c = m.c + (0.75 - m.c) * u;
        for (let q = 3; q >= 0; q--) {
          const v = Math.max(0, u - q * 0.028 * u);
          const p = at(v);
          const a = al * (q ? 0.32 / q : 1);
          const r = (m.size / 2) * (q ? 0.8 : 1);
          g.fillStyle = col(c, a);
          g.beginPath();
          g.arc(p.x, p.y, r, 0, 6.2832);
          g.fill();
          if (!q && m.size > 1.8 && m.lum > 0.4) {
            const reach = m.size * 4;
            const halo = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, reach);
            halo.addColorStop(0, col(c, a * 0.4));
            halo.addColorStop(1, col(c, 0));
            g.fillStyle = halo;
            g.beginPath();
            g.arc(p.x, p.y, reach, 0, 6.2832);
            g.fill();
          }
        }
      }
      // (where it arrives, the light there is lit for a moment, as much as is arriving)
      const glow = Math.min(0.55, landed * 0.05);
      if (glow > 0.01) {
        const R = 70;
        const halo = g.createRadialGradient(T.x, T.y, 0, T.x, T.y, R);
        halo.addColorStop(0, col(0.75, glow));
        halo.addColorStop(0.3, col(0.75, glow * 0.3));
        halo.addColorStop(1, col(0.75, 0));
        g.fillStyle = halo;
        g.beginPath();
        g.arc(T.x, T.y, R, 0, 6.2832);
        g.fill();
        going = true;
      }
      if (going) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grains]);
  // (with somewhere to go, the sheet it is drawn on reaches down past it, to where it goes)
  return (
    <div ref={band} aria-hidden className={`pointer-events-none relative ${className ?? ""}`} style={style}>
      <canvas ref={sheet} className="absolute inset-x-0 top-0 w-full" style={{ height: into ? "calc(100% + 80vh)" : "100%" }} />
    </div>
  );
}
type Mote = { x0: number; y0: number; d: number; dur: number; lum: number; size: number; seed: number; c: number };

export function PaceChoice({ pace, names, chosen, onPick, into }: { /** Where, on the screen, the strand goes down to once chosen (what is gathering in the galaxy). */ into?: () => { x: number; y: number } | null; pace: Pace[]; /** The answer each pace is given as (the options, in the same order). */ names: string[]; /** What has been answered here, once it has gone up (from asks.tsx). */ chosen: string | null; onPick: (answer: string, el: HTMLElement | null) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.pace");
  const [shown, setShown] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const at = held ?? shown;
  const done = held != null || !!chosen;
  const touched = useRef(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // (the paces of one thing asked do not change while it is asked)
  const grains = useMemo(() => momentsOf(pace.map((p) => p.steps)).map(grainOf), [pace]);

  const choose = (n: number, el: HTMLElement) => {
    if (done) return;
    setShown(n);
    setHeld(n);
    timer.current = window.setTimeout(() => onPick(names[n] ?? pace[n]!.name, el), HOLD);
  };
  /** What each pace does when it is gone to, left, or pressed (on a touch screen the first touch shows it, the second chooses it). */
  const handle = (n: number) => ({
    type: "button" as const,
    onPointerDown: (e: React.PointerEvent) => (touched.current = e.pointerType === "touch"),
    onMouseEnter: () => !done && setShown(n),
    onFocus: () => !done && !touched.current && setShown(n),
    onBlur: () => !done && setShown((s) => (s === n ? null : s)),
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (touched.current && shown !== n && !done) return setShown(n);
      choose(n, e.currentTarget);
    },
  });
  const leave = () => !done && setShown(null);
  /** How a pace not chosen goes, once another is. */
  const away = (n: number): React.CSSProperties => ((done && held !== n) || chosen ? { opacity: 0, filter: "blur(3px)" } : { opacity: 1, filter: "none" });
  const fade = `color .45s ease, opacity .34s ease, filter .34s ease, transform .34s ${SWIFT}, box-shadow .3s ease, background-color .3s ease`;
  const label = (n: number) => names[n] ?? pace[n]!.name;

  /** What one step is at the pace shown; nothing while none is. */
  const told = (
    <div className={`mt-7 grid min-h-[60px] w-[min(560px,84vw)] text-center`}>
      {pace.map((p, n) => (
        <div key={n} aria-hidden={at !== n} style={{ gridArea: "1 / 1", opacity: at === n && !chosen ? 1 : 0, transform: at === n ? "none" : "translateY(4px)", transition: `opacity .45s ease, transform .45s ${SWIFT}` }}>
          <p className="text-[14px] leading-[1.75]" style={{ color: P.mute }}>
            {p.step}
          </p>
        </div>
      ))}
    </div>
  );

  // the strand is the scale: the paces are stops along it, from the finest to the coarsest, each a star; under each
  // star its name, as words; the one gone to is joined to its star by a soft column of light, the strand is looked at
  // closely there, as through a lens (its points stand apart, larger and brighter), and the strand takes its grain
  const N = pace.length;
  const H = 112;
  const x = (n: number) => `${((n + 0.5) / N) * 100}%`;
  const tone = done ? P.warmRgb : P.inkRgb;
  const pointed = at != null && at >= 0;
  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative mt-4 w-[min(900px,90vw)]" onMouseLeave={leave}>
        {/* the column of light from the star gone to down to its name */}
        <div aria-hidden className="pointer-events-none absolute top-[6px] h-[170px] w-[150px] -translate-x-1/2" style={{ left: pointed ? x(at!) : "50%", opacity: pointed && !chosen ? 1 : 0, background: `radial-gradient(ellipse closest-side, rgb(${tone} / 0.11), rgb(${tone} / 0.035) 60%, transparent)`, transition: `left .6s ${SWIFT}, opacity .5s ease` }} />
        <Strand grains={grains} at={at} held={done} gone={!!chosen} into={into} focus={pointed ? (at! + 0.5) / N : null} dust={420} wave={7} className="w-full" style={{ height: H }} />
        {/* a star at each stop: small and still at rest; gone to, brighter */}
        {pace.map((_, n) => {
          const on = at === n;
          return (
            <span key={n} aria-hidden className="pointer-events-none absolute" style={{ left: x(n), top: H / 2, opacity: away(n).opacity, transition: "opacity .34s ease" }}>
              <span className="absolute size-[5px] rounded-full" style={{ left: -2.5, top: -2.5, background: on ? `rgb(${tone})` : `rgb(${P.inkRgb} / 0.7)`, boxShadow: on ? `0 0 10px 2px rgb(${tone} / 0.7), 0 0 34px 8px rgb(${tone} / 0.22)` : `0 0 6px 1px rgb(${P.inkRgb} / 0.25)`, transform: `scale(${on ? 1.35 : 1})`, transition: `background .4s ease, box-shadow .45s ease, transform .45s ${SWIFT}` }} />
            </span>
          );
        })}
        <div aria-hidden className="pointer-events-none absolute flex w-full justify-between px-1" style={{ top: H / 2 - 30, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: P.faint, opacity: done ? 0 : 0.8, transition: "opacity .34s ease" }}>
          <span>{t("fine")}</span>
          <span>{t("coarse")}</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}>
          {pace.map((p, n) => {
            const on = at === n;
            return (
              <button key={n} {...handle(n)} className="group relative flex flex-col items-center pb-1 outline-none" style={{ ...away(n), marginTop: -H, paddingTop: H + 18, cursor: done ? "default" : "pointer", transition: fade }}>
                <span className="text-[16px] tracking-[0.02em] whitespace-nowrap" style={{ color: on ? P.ink : `rgb(${P.inkRgb} / ${at == null ? 0.72 : 0.42})`, transform: on && !done ? "translateY(-2px)" : "none", textShadow: on ? `0 0 18px rgb(${tone} / 0.35)` : "none", transition: `color .4s ease, transform .35s ${SWIFT}, text-shadow .4s ease` }}>
                  {label(n)}
                </span>
                <span className="mt-2.5 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.05em", color: on ? P.mute : P.faint, transition: "color .4s ease" }}>
                  {brief(t, p)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {told}
    </div>
  );
}

/**
 * Where a record is played back (the design pages), it was made before the pace was asked: this is put after its
 * questions, written for the world those pages open on (going alone to Silicon Valley to start an AI company, six
 * months of money).
 */
export const SAMPLE_PACE: Asked = paceAsked({
  q: "How closely do you want to watch this world?",
  options: [
    { name: "Every exchange", step: "Each conversation, each reply, each decision is a step: an investor writing back to ask you for coffee in Palo Alto on Thursday is one step.", steps: 140, minutes: 150 },
    { name: "Every turn", step: "A step is when things change direction: the first paying customer, an angel agreeing to lead the round, a co-founder saying they want to leave.", steps: 36, minutes: 32 },
    { name: "Every stretch of time", step: "A step is when a stretch of days comes to a close: the visa coming through, moving into the first office, the end of the first round of pitches.", steps: 14, minutes: 12 },
    { name: "Only the big moments", step: "Only what changes everything is a step: whether the round closes as the money is about to run out.", steps: 5, minutes: 4 },
  ],
});
