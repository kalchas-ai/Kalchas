"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Pal } from "./palette";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;

export type DitherDraw = (ink: CanvasRenderingContext2D, warm: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/**
 * Draw in grey (into `ink`) and in grey for the accent (into `warm`); it comes out as the homepage's ordered
 * dither, in the palette's four steps, on square cells `cell` CSS pixels wide.
 */
export function DitherCanvas({ draw, P, cell = 2, animate = true, className = "", style }: { draw: DitherDraw; P: Pal; cell?: number; animate?: boolean; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const frameRef = useRef<((t: number) => void) | null>(null);
  // redraw at once whenever the picture's inputs change (a hover, a selection), without waiting for the next frame
  useEffect(() => {
    frameRef.current?.(performance.now());
  });
  useEffect(() => {
    const canvas = ref.current!;
    const out = canvas.getContext("2d")!;
    const a = document.createElement("canvas");
    const b = document.createElement("canvas");
    const ia = a.getContext("2d", { willReadFrequently: true })!;
    const ib = b.getContext("2d", { willReadFrequently: true })!;
    const ramp = P.ramp.map(hex);
    const acc = P.accent.map(hex);
    let gw = 1;
    let gh = 1;
    let W = 1;
    let H = 1;
    let img = out.createImageData(1, 1);
    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      gw = Math.max(1, Math.ceil(W / cell));
      gh = Math.max(1, Math.ceil(H / cell));
      for (const c of [canvas, a, b]) {
        c.width = gw;
        c.height = gh;
      }
      img = out.createImageData(gw, gh);
    };
    const frame = (t: number) => {
      for (const c of [ia, ib]) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = "#000";
        c.fillRect(0, 0, gw, gh);
        c.setTransform(1 / cell, 0, 0, 1 / cell, 0, 0);
      }
      try {
        drawRef.current(ia, ib, W, H, t / 1000);
      } catch (e) {
        // a picture that can't be drawn this frame (say, before its size is known) shouldn't take the page down
        if (process.env.NODE_ENV !== "production") console.warn("DitherCanvas draw", e);
      }
      const da = ia.getImageData(0, 0, gw, gh).data;
      const db = ib.getImageData(0, 0, gw, gh).data;
      const d = img.data;
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const i = (y * gw + x) * 4;
          const th = BAYER[(y & 3) * 4 + (x & 3)]!;
          const wv = (db[i]! / 255) * 3;
          const wl = Math.min(3, Math.floor(wv) + (wv - Math.floor(wv) > th ? 1 : 0));
          let c: readonly number[];
          if (wl > 0) c = acc[wl]!;
          else {
            const v = (da[i]! / 255) * 3;
            c = ramp[Math.min(3, Math.floor(v) + (v - Math.floor(v) > th ? 1 : 0))]!;
          }
          d[i] = c[0]!;
          d[i + 1] = c[1]!;
          d[i + 2] = c[2]!;
          d[i + 3] = 255;
        }
      out.putImageData(img, 0, 0);
    };
    size();
    frameRef.current = frame;
    // the first frame now, so the picture is there even before the first animation frame (or in a hidden tab)
    frame(performance.now());
    let raf = 0;
    const loop = (t: number) => {
      frame(t);
      raf = requestAnimationFrame(loop);
    };
    if (animate) raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      size();
      if (!animate) frame(performance.now());
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      frameRef.current = null;
    };
  }, [P, cell, animate]);
  return <canvas ref={ref} className={className} style={{ imageRendering: "pixelated", display: "block", ...style }} />;
}

/**
 * The size of an element, kept up to date. Returns a callback ref, so it also works for an element that only
 * appears later (after data loads, say).
 */
export function useSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    // measure now, then whenever it changes (the observer alone can be late in a background tab)
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [el]);
  const ref = useCallback((node: HTMLElement | null) => setEl(node as T | null), []);
  return [ref, size] as const;
}

/** A fixed pseudo-random number in [0, 1) for an index: the same every frame, scattered from one index to the next. */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A soft round glow, for drawing into a dither canvas. */
export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, v: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  const k = Math.round(255 * Math.max(0, Math.min(1, v)));
  g.addColorStop(0, `rgb(${k},${k},${k})`);
  g.addColorStop(1, "rgb(0,0,0)");
  c.globalCompositeOperation = "lighter";
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = "source-over";
}
