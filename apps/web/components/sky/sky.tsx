"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { PALETTES, ditherMaterial, setPalette } from "@/components/stage/dither";
import type { Pal } from "@/components/kit/palette";
import { skyNow, type Level, type SkyScene } from "./build";

/**
 * The product's pictures on the GPU: a page describes what is there (sky/build.ts) in its own pixels, this draws it
 * as points with a soft bloom and the homepage's dither, in the page's palette. The whole picture is a function of
 * the clock, so it moves without React; what changes with the user (hover, selection, a signal sent) goes through
 * `levels`, which eases in without rebuilding anything.
 */

const GROUPS = 1024;

const VS = /* glsl */ `
  attribute vec3 aCtr; attribute float aSize; attribute vec4 aSeed; attribute float aWarm; attribute float aGroup; attribute vec4 aExt; attribute vec2 aAnchor;
  uniform sampler2D uM;
  uniform float uTime; uniform float uPx; uniform float uMin; uniform sampler2D uG; uniform vec4 uMask[4]; uniform vec4 uHole; uniform float uHoleK; uniform vec2 uDrift; uniform vec4 uView; uniform vec4 uLens; uniform float uLensA; uniform float uLensP;
  uniform float uLag; uniform float uTrail; uniform float uScale; uniform float uSpinK; uniform float uLineK;
  varying float vA; varying float vWarm;
  float sat(float x){ return clamp(x, 0.0, 1.0); }
  float ease(float x){ x = sat(x); return x * x * (3.0 - 2.0 * x); }
  vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  void main(){
    float kind = aSeed.x; float born = aSeed.y; float rnd = aSeed.z; float prm = aSeed.w;
    // a trail is the same picture a moment ago (only what moves leaves one)
    float T = uTime - uLag;
    bool trail = uTrail > 0.5;
    vec4 G = texture2D(uG, vec2((aGroup + 0.5) / ${GROUPS}.0, 0.5));
    float fire = G.b;
    float age = T - born;
    float on = born <= 0.0 ? 1.0 : ease(age / 0.9);
    vec2 p = position.xy;
    float a = 0.0; float warm = max(aWarm, G.g); float size = aSize;
    float tw = 0.8 + 0.2 * sin(T * (0.5 + rnd * 1.3) + rnd * 40.0);
    if (kind < 0.5) {
      // far dust: barely there, drifting; dust laid in depth also slides past, the nearer the faster, wrapping round
      p.x += sin(T * 0.03 + rnd * 6.28) * 3.0;
      if (aExt.x > 0.0) p = mod(p + uDrift * T * aExt.x, aExt.yz);
      a = trail ? 0.0 : prm * tw;
    } else if (kind < 1.5) {
      // a body (galaxy, neuron, star, ring): turned and slanted round its centre, flaring as it is born
      vec2 d = rot(p - aCtr.xy, T * aExt.x * uSpinK);
      d.y *= aExt.y;
      p = aCtr.xy + rot(d, aExt.z);
      float fl = aExt.w > 0.0 ? step(0.0, age) * pow(1.0 - sat(age / aExt.w), 2.0) : 0.0;
      float fa = T - fire;
      float hit = step(0.0, fa) * exp(-fa * 1.4);
      a = prm * tw * on * step(0.0, age) + fl * 0.6 + hit * prm * 1.6;
      warm = max(warm, max(fl, hit));
      size *= 1.0 + fl * 1.2 + hit * 0.6;
      if (trail && aExt.x == 0.0) a = 0.0;
    } else if (kind < 2.5) {
      // a line: it grows from a to b when born, carries pulses, and runs a signal when fired
      float u = prm;
      float grow = born <= 0.0 ? 1.0 : sat(age / 1.3);
      float vis = step(u, grow) * step(0.0, age);
      float head = born <= 0.0 ? 0.0 : exp(-pow((u - grow) * 12.0, 2.0)) * (1.0 - step(0.999, grow));
      float pulse = 0.0;
      if (aExt.x > 0.0) {
        float ph = fract(T * aExt.x + aExt.y);
        pulse = exp(-pow((u - ph) * 18.0, 2.0));
      }
      float uu = aExt.w > 0.5 ? 1.0 - u : u;
      float fa = (T - fire) / 0.85;
      float sig = step(0.0, fa) * (exp(-pow((uu - fa) * 9.0, 2.0)) * (1.0 - step(1.12, fa)) + 0.45 * step(uu, fa) * exp(-max(0.0, fa - 1.0) * 1.2));
      a = trail ? vis * pulse * (0.25 + aExt.z) + sig * 0.95 : vis * (aExt.z * tw + head * 0.55 + pulse * (0.25 + aExt.z)) + sig * 0.95;
      warm = max(warm, sat(sig * 1.4));
      size *= (1.0 + sig * 0.6) * mix(1.0, uLineK, 0.35);
      a *= uLineK;
    } else if (kind < 3.5) {
      // a stream: light running from a to b, again and again
      float pr = fract(T * aExt.x + rnd) - aExt.w;
      vec2 ab = aCtr.xy - position.xy;
      vec2 n = normalize(vec2(-ab.y, ab.x) + 1e-5);
      p = position.xy + ab * sat(pr) + n * sin(sat(pr) * 3.14159) * aExt.y * (fract(rnd * 7.31) - 0.5) * 2.0;
      a = aExt.z * sin(sat(pr) * 3.14159) * step(0.0, pr) * on;
    } else if (kind < 4.5) {
      // fog: soft, drifting, breathing
      p += vec2(sin(T * 0.13 + rnd * 6.28), cos(T * 0.11 + rnd * 4.0)) * aExt.x;
      a = trail ? 0.0 : prm * (0.7 + 0.3 * sin(T * 0.4 + rnd * 9.0)) * (born <= 0.0 ? 1.0 : ease(age / 1.6));
    } else {
      // a ring spreading out: over and over, or once when fired
      float f = aExt.z > 0.0 ? fract((T - born) / aExt.z + prm) : (T - fire) / (-aExt.z);
      float r = mix(aExt.x, aExt.y, 1.0 - pow(1.0 - sat(f), 2.0));
      p = position.xy + vec2(aCtr.x, aCtr.y * aCtr.z) * r;
      a = aExt.w * (1.0 - f) * step(0.0, f) * step(f, 1.0) * (born <= 0.0 || aExt.z > 0.0 ? 1.0 : 1.0) * step(0.0, age);
    }
    a *= G.r;
    size *= G.a;
    // laid out again: glide from the old place (a line's ends each with what they are tied to)
    {
      vec2 oA = texture2D(uM, vec2((aAnchor.x + 0.5) / ${GROUPS}.0, 0.5)).rg;
      vec2 oB = texture2D(uM, vec2((aAnchor.y + 0.5) / ${GROUPS}.0, 0.5)).rg;
      p += (kind > 1.5 && kind < 2.5) ? mix(oA, oB, prm) : oA;
    }
    // the whole picture (not the dust behind it) turned round a centre, as a disc seen at a slant (w: how flat)
    if (uView.w > 0.0 && kind > 0.5) {
      vec2 d = p - uView.xy;
      d.y /= uView.w;
      d = rot(d, uView.z);
      d.y *= uView.w;
      p = uView.xy + d;
    }
    // a magnifier: only what is right under the pointer grows (nothing moves)
    if (uLens.w > 0.001 || uLensA > 0.001 || uLensP > 0.01) {
      vec2 dv = p - uLens.xy;
      float u = length(dv) / uLens.z;
      if (u < 1.0) {
        float g = (1.0 - u) * (1.0 - u);
        // pushed aside, as if being looked at bent it
        p += dv / max(length(dv), 1.0) * uLensP * g;
        size *= 1.0 + uLens.w * g;
        a *= 1.0 + 0.5 * uLens.w * g + uLensA * g;
      }
    }
    // keep the places of the words dark
    for (int i = 0; i < 4; i++) {
      vec4 m = uMask[i];
      if (m.z > m.x) {
        float ix = smoothstep(m.x - 30.0, m.x + 6.0, p.x) * smoothstep(m.z + 30.0, m.z - 6.0, p.x);
        float iy = smoothstep(m.y - 30.0, m.y + 6.0, p.y) * smoothstep(m.w + 30.0, m.w - 6.0, p.y);
        a *= 1.0 - 0.88 * ix * iy;
      }
    }
    // a soft oval where the light thins out towards the middle (words sit there), with no edge anywhere
    if (uHole.z > 0.0) {
      float d = length((p - uHole.xy) / uHole.zw);
      a *= 1.0 - uHoleK * (1.0 - smoothstep(0.35, 1.0, d));
    }
    float ps = size * uScale * uPx;
    vA = a * clamp(ps / uMin, 0.0, 1.0); vWarm = warm;
    gl_PointSize = max(uMin, ps);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, -p.y, 0.0, 1.0);
  }`;

const FS = /* glsl */ `
  varying float vA; varying float vWarm; uniform float uSharp; uniform float uFade;
  void main(){
    float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.15, d);
    float core = smoothstep(0.24, 0.0, d);
    float f = mix(soft, core * 0.9 + soft * 0.22, uSharp);
    vec3 c = mix(vec3(1.0), vec3(1.0, 0.62, 0.25), vWarm);
    gl_FragColor = vec4(c * vA * f * uFade, 1.0);
  }`;

/** Dot finishes: the picture read cell by cell and printed as clean round dots (see Look). */
const DOTS = /* glsl */ `
  uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uCell; uniform float uMode; uniform float uFloor; uniform float uGain;
  uniform vec3 uPage; uniform vec3 uInk; uniform vec3 uWarm; uniform vec3 uDim;
  varying vec2 vUv;
  float bayer(vec2 p){
    int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0)); int i = x + y * 4;
    int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
    return (float(m[i]) + 0.5) / 16.0;
  }
  void main(){
    vec2 cell = floor(gl_FragCoord.xy / uCell);
    vec2 ctr = (cell + 0.5) * uCell;
    vec2 q = uCell / uRes * 0.3;
    vec2 uv = ctr / uRes;
    vec3 c = (texture2D(tDiffuse, uv).rgb * 2.0 + texture2D(tDiffuse, uv + vec2(q.x, q.y)).rgb + texture2D(tDiffuse, uv - vec2(q.x, q.y)).rgb + texture2D(tDiffuse, uv + vec2(q.x, -q.y)).rgb + texture2D(tDiffuse, uv + vec2(-q.x, q.y)).rgb) / 6.0;
    c = max(c, texture2D(tDiffuse, uv).rgb * 0.8);
    if (uMode > 3.5) {
      // read the cell at its brightest, so a thin line or a small star is never averaged away
      vec3 m0 = texture2D(tDiffuse, uv).rgb;
      vec3 m1 = texture2D(tDiffuse, uv + vec2(q.x, q.y)).rgb;
      vec3 m2 = texture2D(tDiffuse, uv - vec2(q.x, q.y)).rgb;
      vec3 m3 = texture2D(tDiffuse, uv + vec2(q.x, -q.y)).rgb;
      vec3 m4 = texture2D(tDiffuse, uv + vec2(-q.x, q.y)).rgb;
      c = mix((m0 + m1 + m2 + m3 + m4) / 5.0, max(max(max(m1, m2), max(m3, m4)), m0), 0.7);
    }
    c *= uGain;
    float l0 = dot(c, vec3(0.299, 0.587, 0.114));
    float l = clamp(max(0.0, l0 - uFloor) / (1.0 - uFloor), 0.0, 1.0);
    float warm = clamp((c.r - c.b) * 2.2, 0.0, 1.0);
    vec3 tint = mix(uInk, uWarm, step(0.35, warm));
    float d = length(gl_FragCoord.xy - ctr) / uCell;
    vec3 col = uPage;
    if (uMode < 1.5) {
      // clean ordered dots: each cell one round dot, on or off, never a grey speckle
      float on = step(bayer(cell), pow(l, 0.55) * 1.1);
      col = mix(uPage, tint, on * smoothstep(0.5, 0.36, d));
    } else if (uMode < 2.5) {
      // halftone: the dot's size carries the brightness
      float r = sqrt(l) * 0.64;
      col = mix(uPage, tint, smoothstep(r + 0.07, r - 0.07, d) * step(0.015, l));
    } else if (uMode < 4.5) {
      // the dither, four levels, but the lowest is only a breath above the page: no grey mould
      float q4 = floor(pow(l, 0.72) * 3.0 + bayer(cell)) / 3.0;
      float k = q4 < 0.2 ? 0.0 : q4 < 0.5 ? 0.16 : q4 < 0.8 ? 0.62 : 1.0;
      col = mix(uPage, tint, k);
    } else {
      // dither × halftone: the dither's level picks one of three round dot sizes
      float lv = floor(pow(l, 0.7) * 3.0 + bayer(cell));
      float r = lv < 0.5 ? 0.0 : lv < 1.5 ? 0.2 : lv < 2.5 ? 0.32 : 0.47;
      float k = lv < 1.5 ? 0.6 : lv < 2.5 ? 0.85 : 1.0;
      col = mix(uPage, tint, smoothstep(r + 0.07, r - 0.07, d) * k * step(0.01, r));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

/** A smooth finish instead of the dither: light mapped onto the palette's page, ink and warm, with a soft curve. */
const GRADE = /* glsl */ `
  uniform sampler2D tDiffuse; uniform vec3 uPage; uniform vec3 uInk; uniform vec3 uWarm; uniform vec3 uHi; uniform float uGain; uniform float uLight;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb * uGain;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float w = clamp((c.r - c.b) * 2.2, 0.0, 1.0);
    float v = 1.0 - exp(-l * 2.0);
    vec3 tint = mix(uInk, uWarm, smoothstep(0.18, 0.6, w));
    vec3 col = mix(uPage, tint, v);
    col = mix(col, uHi, clamp((l - 1.1) * 0.35, 0.0, 0.5) * (1.0 - uLight));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

/**
 * How the pictures are finished. dot: the homepage's dither, every light a cluster of print dots. flow: smooth, fine
 * points with a soft glow. silk: flow, with what moves leaving a trail, so galaxies swirl and signals streak. neon:
 * sharp points and bright lines.
 */
export type Look = "dot" | "refined" | "fine" | "hybrid" | "halftone" | "flow" | "silk" | "neon";
type LookSpec = { dither: boolean; dots?: number; cell?: number; floor?: number; scale: number; sharp: number; trails: number; lag: number; spin: number; line: number; bloom: number };
const LOOKS: Record<Look, LookSpec> = {
  dot: { dither: true, scale: 1, sharp: 0, trails: 0, lag: 0, spin: 1, line: 1, bloom: 1 },
  // the dither, kept, without its mould: the faint grey speckle in the dark is lifted out (only clear dots stay),
  // small things are read at their brightest so lines and stars stay whole
  refined: { dither: false, dots: 4, cell: 1.5, floor: 0.045, scale: 1, sharp: 0.2, trails: 0, lag: 0, spin: 1, line: 1.25, bloom: 1 },
  // the same, at half the grain: finer, like a good print
  fine: { dither: false, dots: 4, cell: 1, floor: 0.045, scale: 0.9, sharp: 0.3, trails: 0, lag: 0, spin: 1, line: 1.3, bloom: 1 },
  // dither × halftone: the dither's pattern decides, each cell prints a round dot in one of three sizes
  hybrid: { dither: false, dots: 5, cell: 2.5, floor: 0.03, scale: 1, sharp: 0.25, trails: 0, lag: 0, spin: 1, line: 1.35, bloom: 1 },
  // a printed halftone: one round dot per cell, bigger where it is brighter
  halftone: { dither: false, dots: 2, cell: 3.5, floor: 0.02, scale: 1, sharp: 0.3, trails: 0, lag: 0, spin: 1, line: 1.4, bloom: 1 },
  flow: { dither: false, scale: 0.85, sharp: 0.4, trails: 0, lag: 0, spin: 1, line: 1.2, bloom: 1.25 },
  silk: { dither: false, scale: 0.72, sharp: 0.55, trails: 9, lag: 0.38, spin: 6, line: 1.5, bloom: 1.4 },
  neon: { dither: false, scale: 0.6, sharp: 0.92, trails: 3, lag: 0.12, spin: 1.5, line: 3, bloom: 2.2 },
};

export type Mask = [number, number, number, number];

type Props = {
  P: Pal;
  scene: SkyScene | null;
  levels?: Record<string, Level>;
  /** Up to four rectangles (x0, y0, x1, y1 in the canvas's pixels) kept dark for words. */
  masks?: Mask[];
  /** A soft oval (centre, radii in the canvas's pixels) where the light thins out towards the middle, by up to `k`. */
  hole?: Hole | null;
  /** How fast dust laid in depth slides past (pixels a second, at the nearest depth). */
  drift?: [number, number] | null;
  /** The whole picture turned by `angle` round (x, y), as a disc seen at a slant (`squash` 1: face on). */
  view?: View | null;
  /** How strongly bright things bloom. */
  bloom?: number;
  /** The whole picture's brightness (dims it behind a dialog, say). */
  gain?: number;
  /** Sitting on a panel rather than the page: let the panel's own colour show through the dark. */
  blend?: boolean;
  /** How it is finished (see Look); fixed for the life of the picture. */
  look?: Look;
  /** A magnifier at (x, y): what lies within `r` of it grows, by up to `k`, and brightens by up to `a` (a lantern). */
  lens?: { x: number; y: number; r: number; k: number; a?: number; push?: number } | null;
  className?: string;
  style?: CSSProperties;
};

type Engine = {
  set: (s: SkyScene | null) => void;
  levels: (l: Record<string, Level>) => void;
  masks: (m: Mask[]) => void;
  hole: (o: Hole | null) => void;
  drift: (v: [number, number] | null) => void;
  view: (v: View | null) => void;
  gain: (g: number) => void;
  lens: (l: Props["lens"]) => void;
  palette: (n: Pal["name"]) => void;
  dispose: () => void;
};

export type Hole = { x: number; y: number; rx: number; ry: number; k: number };
export type View = { x: number; y: number; angle: number; squash: number };

export function Sky({ P, scene, levels, masks, hole = null, drift = null, view = null, bloom = 0.32, gain = 1, blend = false, lens = null, look, className = "", style }: Props) {
  const lookNow = look ?? defaultLook;
  const ref = useRef<HTMLDivElement>(null);
  const eng = useRef<Engine | null>(null);
  const latest = useRef({ scene, levels, masks, gain, hole, drift, view });
  latest.current = { scene, levels, masks, gain, hole, drift, view };

  useEffect(() => {
    // a canvas of its own each time: a context once released can't be used again
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated";
    ref.current!.appendChild(canvas);
    const e = start(canvas, P.name, bloom, lookNow);
    eng.current = e;
    const l = latest.current;
    e.set(l.scene);
    e.levels(l.levels ?? {});
    e.masks(l.masks ?? []);
    e.hole(l.hole);
    e.drift(l.drift);
    e.view(l.view);
    e.gain(l.gain);
    return () => {
      e.dispose();
      canvas.remove();
      eng.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => eng.current?.palette(P.name), [P.name]);
  useEffect(() => eng.current?.set(scene), [scene]);
  useEffect(() => eng.current?.levels(levels ?? {}), [levels, scene]);
  useEffect(() => eng.current?.masks(masks ?? []), [masks]);
  useEffect(() => eng.current?.hole(hole), [hole?.x, hole?.y, hole?.rx, hole?.ry, hole?.k]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => eng.current?.drift(drift), [drift?.[0], drift?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => eng.current?.view(view), [view?.x, view?.y, view?.angle, view?.squash]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => eng.current?.gain(gain), [gain]);
  useEffect(() => eng.current?.lens(lens), [lens?.x, lens?.y, lens?.r, lens?.k, lens?.a, lens?.push]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} className={className} style={{ position: "absolute", overflow: "hidden", mixBlendMode: blend ? (P.name === "graphite" ? "screen" : "multiply") : undefined, ...style }} />;
}

/** The look every picture takes unless it says otherwise. */
let defaultLook: Look = "dot";
export function setDefaultLook(l: Look) {
  defaultLook = l;
}

function start(canvas: HTMLCanvasElement, pal: Pal["name"], bloomK: number, lookName: Look): Engine {
  const look = LOOKS[lookName];
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  const dpr = Math.min(1.75, window.devicePixelRatio || 1);
  r.setPixelRatio(dpr);
  r.toneMapping = THREE.NoToneMapping;
  const cell = look.dither ? Math.max(2, Math.round(1.5 * dpr)) : look.dots ? Math.max(2, Math.round((look.cell ?? 3) * dpr)) : Math.max(1, Math.round(dpr));
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  const tex = new THREE.DataTexture(new Float32Array(GROUPS * 4), GROUPS, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  const cur = new Float32Array(GROUPS * 4);
  const target = new Float32Array(GROUPS * 4);
  for (let i = 0; i < GROUPS; i++) {
    cur.set([1, 0, -1e4, 1], i * 4);
    target.set([1, 0, -1e4, 1], i * 4);
  }
  (tex.image.data as Float32Array).set(cur);
  tex.needsUpdate = true;
  // how far each moving thing still is from its new place (eases to nothing)
  const moveTex = new THREE.DataTexture(new Float32Array(GROUPS * 4), GROUPS, 1, THREE.RGBAFormat, THREE.FloatType);
  moveTex.magFilter = moveTex.minFilter = THREE.NearestFilter;
  moveTex.needsUpdate = true;
  const off = new Float32Array(GROUPS * 2);
  let moving = false;
  let lastCenters = new Map<string, [number, number]>();
  let lastGroups = new Map<string, number>();
  const maskV = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0));
  // the uniforms every pass shares; each trail adds how far behind it is and how faint
  const U = { uTime: { value: 0 }, uPx: { value: dpr }, uMin: { value: look.dots ? Math.max(1, Math.round(dpr)) : cell }, uG: { value: tex }, uM: { value: moveTex }, uMask: { value: maskV }, uHole: { value: new THREE.Vector4(0, 0, 0, 0) }, uHoleK: { value: 0 }, uDrift: { value: new THREE.Vector2(0, 0) }, uView: { value: new THREE.Vector4(0, 0, 0, 0) }, uLens: { value: new THREE.Vector4(0, 0, 1, 0) }, uLensA: { value: 0 }, uLensP: { value: 0 }, uScale: { value: look.scale }, uSpinK: { value: look.spin }, uLineK: { value: look.line }, uSharp: { value: look.sharp } };
  const makeMat = (i: number) =>
    new THREE.ShaderMaterial({
      uniforms: { ...U, uLag: { value: i * look.lag }, uTrail: { value: i ? 1 : 0 }, uFade: { value: i ? 0.5 * Math.pow(1 - i / (look.trails + 1), 1.6) : 1 } },
      vertexShader: VS,
      fragmentShader: FS,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    });
  const mats = Array.from({ length: look.trails + 1 }, (_, i) => makeMat(i));
  const mat = mats[0]!;
  let points: THREE.Points[] = [];
  let groups = new Map<string, number>();
  const composer = new EffectComposer(r, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, cam, undefined, new THREE.Color(0x000000), 1));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), bloomK * look.bloom, look.dither ? 0.5 : 0.65, look.dither ? 0.62 : 0.55);
  composer.addPass(bloom);
  const colors = (n: Pal["name"]) => PALETTES[n];
  const finish = look.dither
    ? new ShaderPass(ditherMaterial(pal, cell))
    : look.dots
      ? new ShaderPass(
          new THREE.ShaderMaterial({
            uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uCell: { value: cell }, uMode: { value: look.dots }, uFloor: { value: look.floor ?? 0.05 }, uGain: { value: 1 }, uPage: { value: new THREE.Color() }, uInk: { value: new THREE.Color() }, uWarm: { value: new THREE.Color() }, uDim: { value: new THREE.Color() } },
            vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
            fragmentShader: DOTS,
            depthTest: false,
            depthWrite: false,
          }),
        )
      : new ShaderPass(
        new THREE.ShaderMaterial({
          uniforms: { tDiffuse: { value: null }, uPage: { value: new THREE.Color() }, uInk: { value: new THREE.Color() }, uWarm: { value: new THREE.Color() }, uHi: { value: new THREE.Color() }, uGain: { value: 1 }, uLight: { value: 0 }, uRes: { value: new THREE.Vector2() } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
          fragmentShader: GRADE,
          depthTest: false,
          depthWrite: false,
        }),
      );
  const du = (finish.material as THREE.ShaderMaterial).uniforms;
  const paint = (n: Pal["name"]) => {
    if (look.dither) return setPalette(finish.material as THREE.ShaderMaterial, n);
    const c = colors(n);
    (du.uPage!.value as THREE.Color).set(c.page);
    (du.uInk!.value as THREE.Color).set(c.ink);
    (du.uWarm!.value as THREE.Color).set(c.warm);
    if (look.dots) {
      (du.uDim!.value as THREE.Color).set(c.page).lerp(new THREE.Color(c.ink), n === "graphite" ? 0.028 : 0.04);
      return;
    }
    (du.uHi!.value as THREE.Color).set(n === "graphite" ? "#ffffff" : c.ink);
    du.uLight!.value = n === "bone" ? 1 : 0;
  };
  paint(pal);
  if (look.dither) {
    du.uFloor!.value = 0.02;
    du.uAvg!.value = 1;
  }
  composer.addPass(finish);

  let W = 0;
  let H = 0;
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === W && h === H) return;
    W = w;
    H = h;
    r.setSize(w, h, false);
    composer.setSize(w, h);
    du.uRes!.value.set(Math.round(w * dpr), Math.round(h * dpr));
    cam.left = 0;
    cam.right = w;
    cam.top = 0;
    cam.bottom = -h;
    cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // only draw while it can be seen
  let visible = true;
  const io = new IntersectionObserver((es) => (visible = es.some((x) => x.isIntersecting)));
  io.observe(canvas);

  const lensTarget = { x: 0, y: 0, r: 1, k: 0, a: 0, push: 0 };
  let last = performance.now();
  let raf = 0;
  let dirty = true;
  const loop = (ms: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const dt = Math.min(0.1, (ms - last) / 1000);
    last = ms;
    // ease what the page asked for (fire is a moment, not a level: it is set at once)
    const k = 1 - Math.exp(-dt * 7);
    let moved = false;
    for (let i = 0; i < GROUPS * 4; i++) {
      if ((i & 3) === 2) {
        if (cur[i] !== target[i]) {
          cur[i] = target[i]!;
          moved = true;
        }
        continue;
      }
      const d = target[i]! - cur[i]!;
      if (Math.abs(d) > 1e-4) {
        cur[i]! += d * k;
        moved = true;
      } else if (d !== 0) {
        cur[i] = target[i]!;
        moved = true;
      }
    }
    if (moved || dirty) {
      (tex.image.data as Float32Array).set(cur);
      tex.needsUpdate = true;
      dirty = false;
    }
    if (moving) {
      const km = Math.exp(-dt * 3.2);
      const d = moveTex.image.data as Float32Array;
      let any = false;
      for (let i = 0; i < GROUPS; i++) {
        off[i * 2] *= km;
        off[i * 2 + 1] *= km;
        if (Math.abs(off[i * 2]!) < 0.05 && Math.abs(off[i * 2 + 1]!) < 0.05) off[i * 2] = off[i * 2 + 1] = 0;
        else any = true;
        d[i * 4] = off[i * 2]!;
        d[i * 4 + 1] = off[i * 2 + 1]!;
      }
      moveTex.needsUpdate = true;
      moving = any;
    }
    resize();
    // the magnifier eases in and out; it follows the pointer at once
    const L = U.uLens.value;
    const ek = 1 - Math.exp(-dt * 6);
    L.w += (lensTarget.k - L.w) * ek;
    U.uLensA.value += (lensTarget.a - U.uLensA.value) * ek;
    U.uLensP.value += (lensTarget.push - U.uLensP.value) * ek;
    // the light follows the pointer softly
    if (lensTarget.k > 0 || lensTarget.a > 0 || lensTarget.push > 0) {
      // from nothing it starts where the pointer is; after that it follows softly
      const f = L.w < 0.01 && U.uLensA.value < 0.02 && U.uLensP.value < 0.2 ? 1 : 1 - Math.exp(-dt * 9);
      L.set(L.x + (lensTarget.x - L.x) * f, L.y + (lensTarget.y - L.y) * f, lensTarget.r, L.w);
    }
    U.uTime.value = skyNow();
    composer.render();
  };
  raf = requestAnimationFrame(loop);

  const fired = new Map<string, number>();
  return {
    lens(l) {
      if (l) Object.assign(lensTarget, { a: 0, push: 0, ...l });
      else {
        lensTarget.k = 0;
        lensTarget.a = 0;
        lensTarget.push = 0;
      }
    },
    set(s) {
      if (points.length) {
        points[0]!.geometry.dispose();
        for (const x of points) scene.remove(x);
        points = [];
      }
      // whatever moved since the last picture starts from where it was and glides to its new place
      const next = new Float32Array(GROUPS * 2);
      if (s)
        for (const [id, [x, y]] of s.centers) {
          const was = lastCenters.get(id);
          const gi = s.groups.get(id);
          if (!was || gi == null) continue;
          const oi = lastGroups.get(id);
          const dx = was[0] + (oi != null ? off[oi * 2]! : 0) - x;
          const dy = was[1] + (oi != null ? off[oi * 2 + 1]! : 0) - y;
          if (Math.abs(dx) + Math.abs(dy) < 0.5 || Math.abs(dx) + Math.abs(dy) > 600) continue;
          next[gi * 2] = dx;
          next[gi * 2 + 1] = dy;
          moving = true;
        }
      off.set(next);
      lastCenters = s?.centers ?? new Map();
      lastGroups = s?.groups ?? new Map();
      groups = s?.groups ?? new Map();
      if (!s || !s.count) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(s.pos, 3));
      g.setAttribute("aCtr", new THREE.BufferAttribute(s.ctr, 3));
      g.setAttribute("aSize", new THREE.BufferAttribute(s.size, 1));
      g.setAttribute("aSeed", new THREE.BufferAttribute(s.seed, 4));
      g.setAttribute("aWarm", new THREE.BufferAttribute(s.warm, 1));
      g.setAttribute("aGroup", new THREE.BufferAttribute(s.group, 1));
      g.setAttribute("aExt", new THREE.BufferAttribute(s.ext, 4));
      g.setAttribute("aAnchor", new THREE.BufferAttribute(s.anchor, 2));
      // the trails first (furthest behind first), the picture itself on top
      points = [...mats].reverse().map((m) => {
        const x = new THREE.Points(g, m);
        x.frustumCulled = false;
        scene.add(x);
        return x;
      });
    },
    levels(l) {
      for (let i = 1; i < GROUPS; i++) {
        target[i * 4] = 1;
        target[i * 4 + 1] = 0;
        target[i * 4 + 3] = 1;
      }
      for (const [id, v] of Object.entries(l)) {
        const i = groups.get(id);
        if (i == null) continue;
        target[i * 4] = v.lit ?? 1;
        target[i * 4 + 1] = v.warm ?? 0;
        target[i * 4 + 3] = v.size ?? 1;
        if (v.fire != null && fired.get(id) !== v.fire) {
          fired.set(id, v.fire);
          target[i * 4 + 2] = v.fire;
        }
      }
      dirty = true;
    },
    drift(v) {
      U.uDrift.value.set(v?.[0] ?? 0, v?.[1] ?? 0);
    },
    view(v) {
      U.uView.value.set(v?.x ?? 0, v?.y ?? 0, v?.angle ?? 0, v?.squash ?? 0);
    },
    hole(o) {
      U.uHole.value.set(o?.x ?? 0, o?.y ?? 0, o?.rx ?? 0, o?.ry ?? 0);
      U.uHoleK.value = o?.k ?? 0;
    },
    masks(m) {
      maskV.forEach((v, i) => {
        const x = m[i];
        if (x) v.set(x[0], x[1], x[2], x[3]);
        else v.set(0, 0, 0, 0);
      });
    },
    gain(g) {
      du.uGain!.value = g;
    },
    palette(n) {
      paint(n);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      points[0]?.geometry.dispose();
      for (const m of mats) m.dispose();
      tex.dispose();
      moveTex.dispose();
      composer.dispose();
      r.dispose();
      r.forceContextLoss();
      canvas.width = canvas.height = 1;
    },
  };
}

/** The magnifier moves nothing: a point stays where it is (kept so callers can ask). */
export function lensAt(x: number, _lens: { x: number; r: number; k: number } | null): { x: number; scale: number } {
  return { x, scale: 1 };
}
