"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/product/shell";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Score } from "./score";
import { Stage } from "./stage";

/**
 * How much picture a machine is given: how many grains (size × size) and how fine (2: everything; 1: fewer pixels;
 * 0: fewer pixels still, no glow). Read once from what the machine says of itself; a machine that then cannot keep up
 * is stepped down while it runs.
 */
export type Tier = { size: number; quality: number };
export const TIERS: Tier[] = [
  { size: 256, quality: 0 },
  { size: 384, quality: 1 },
  { size: 512, quality: 2 },
];

/** What this machine can be given, or null if it cannot draw the picture at all (the page then stands on a still ground). */
export function tierOf(): Tier | null {
  let name = "";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return null;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const phone = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent);
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(name) || phone || mem <= 2 || cores <= 2) return TIERS[0]!;
  // graphics built into a processor (other than Apple's own and the newest ones) get the middle picture
  const builtIn = /Intel|Iris|UHD|HD Graphics|Mali|Adreno|PowerVR|Radeon\(TM\) Graphics|Radeon (R[2-7]|HD|Vega)/i.test(name) && !/Apple|Arc|RTX|GTX/i.test(name);
  if (builtIn) return mem <= 4 || cores <= 4 ? TIERS[0]! : TIERS[1]!;
  if (mem <= 4 || cores <= 4) return TIERS[1]!;
  return TIERS[2]!;
}

/**
 * The living world, filling whatever it is put in; `drive` tells it each frame where things have got to. It stops
 * while the page is hidden, takes half as many frames while there is only reading to do, and steps itself down on a
 * machine that cannot keep up (`onSlow` is asked for fewer grains once nothing else is left to give up).
 */
export function Galaxy({ score, drive, quality = 2, off = false, onSlow, form = 0, volume = 0, pixels = 1, open = 0, trans = 0, net = 0 }: { score: Score; drive: (st: Stage) => void; quality?: number; off?: boolean; onSlow?: () => void; form?: number; volume?: number; pixels?: number; open?: number; trans?: number; net?: number }) {
  const look = useRef({ form, volume, open, trans, net });
  look.current = { form, volume, open, trans, net };
  const box = useRef<HTMLDivElement>(null);
  const gl = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const driveRef = useRef(drive);
  driveRef.current = drive;
  const slowRef = useRef(onSlow);
  slowRef.current = onSlow;
  // the words drawn on the picture, in the interface language
  const tStage = useT("flow-lab.stage");
  const locale = useLocale();
  const said = useRef({ t: tStage, locale: locale as string });
  said.current = { t: tStage, locale };
  const [bad, setBad] = useState(off);
  useEffect(() => {
    if (off) return setBad(true);
    let st: Stage;
    try {
      st = new Stage(gl.current!, over.current!, score);
    } catch {
      setBad(true);
      return;
    }
    setBad(false);
    st.field.quality = quality;
    st.field.pixels = pixels;
    st.t = said.current.t;
    st.locale = said.current.locale;
    const win = window as unknown as { __flow: Stage; __flowDrive: () => void; __flows?: { st: Stage; drive: () => void }[] };
    win.__flow = st;
    win.__flowDrive = () => driveRef.current(st);
    // every picture on the page, for looking at them frame by frame
    const me = { st, drive: () => ((st.field.form = look.current.form), (st.field.volume = look.current.volume), (st.open = look.current.open), (st.trans = look.current.trans), (st.net = look.current.net), driveRef.current(st)) };
    (win.__flows ??= []).push(me);
    const size = () => {
      // as laid out, not as shown: a page shown smaller than it is laid out keeps its own measures
      st.resize(Math.max(1, box.current!.clientWidth), Math.max(1, box.current!.clientHeight));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box.current!);
    let raf = 0;
    let last = performance.now();
    let odd = false;
    let carry = 0;
    let warm = 0;
    let avg = 1 / 60;
    let slow = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const raw = (now - last) / 1000;
      last = now;
      if (document.hidden) return;
      const dt = Math.min(0.1, raw);
      st.field.form = look.current.form;
      st.field.volume = look.current.volume;
      st.open = look.current.open;
      st.trans = look.current.trans;
      st.net = look.current.net;
      st.t = said.current.t;
      st.locale = said.current.locale;
      driveRef.current(st);
      // while there is only reading to do the picture is nearly still: every other frame is enough
      odd = !odd;
      if (st.reading && odd) {
        carry += dt;
        return;
      }
      st.frame(Math.min(0.1, dt + carry));
      carry = 0;
      // a frame much longer than the rest is the page being held back, not the machine being slow
      if (raw > 0.25 || st.reading) return;
      warm += raw;
      if (warm < 2.5) return;
      avg += (raw - avg) * 0.06;
      slow = avg > 1 / 27 ? slow + raw : 0;
      if (slow < 3) return;
      // it cannot keep up: fewer pixels, then no glow, then (asked of the page) fewer grains
      slow = 0;
      warm = 0;
      avg = 1 / 60;
      if (st.field.quality > 0) {
        st.field.quality -= 1;
        size();
      } else slowRef.current?.();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      win.__flows = (win.__flows ?? []).filter((x) => x !== me);
      st.dispose();
    };
  }, [score, quality, off, pixels]);
  const { P } = useApp();
  const t = useT("flow-lab.galaxy");
  return (
    <div ref={box} className="absolute inset-0" style={{ background: P.page }}>
      {!off && <canvas ref={gl} className="absolute inset-0 h-full w-full" style={{ opacity: bad ? 0 : 1 }} />}
      {!off && <canvas ref={over} className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: bad ? 0 : 1 }} />}
      {bad && (
        // a machine that cannot draw the picture still gets the page, on a still ground of the same three colours
        <div className="absolute inset-0" style={{ background: "radial-gradient(52% 44% at 50% 58%, rgb(240 176 96 / 0.075), transparent 72%), radial-gradient(38% 34% at 26% 30%, rgb(107 219 204 / 0.05), transparent 72%), radial-gradient(34% 32% at 76% 26%, rgb(189 168 255 / 0.055), transparent 72%)" }}>
          <div className="absolute right-9 text-[11px]" style={{ top: 14, color: P.faint }}>
            {t("stillGround")}
          </div>
        </div>
      )}
    </div>
  );
}
