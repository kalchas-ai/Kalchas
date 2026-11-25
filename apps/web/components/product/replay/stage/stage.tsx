"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Pal } from "@/components/kit/palette";
import { skyNow } from "@/components/sky/build";
import type { Placed } from "@/components/product/replay/net";
import { between, lines as toLines, md, numsOf, whoOf, type Data, type Option, type Replay, type Shown } from "./data";
import { mono } from "./parts";
import { rich, useLocale, useT } from "@/lib/i18n/client";

/**
 * What the three C drafts share: the round of a step (the moment → you choose → the world moves → where it stops),
 * notes placed beside people on the web without covering anyone, and the numbers strip.
 */

/** Whether the window is short (a laptop at 800 high): the drafts set a notch smaller there. */
export function useShort(limit = 860) {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const f = () => setShort(window.innerHeight < limit);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [limit]);
  return short;
}

/* ---------------------------------------------------------------- the round */

export type Phase = { k: "decide" } | { k: "run"; i: number; chose: string } | { k: "result"; chose: string };

/**
 * After you choose, the world plays out what came of it one event at a time while the clock runs, then stops and
 * says where. In the drafts the events are a real step already walked on this timeline.
 */
export function usePlayback(r: Replay | null, seat: string) {
  const [phase, setPhase] = useState<Phase>({ k: "decide" });
  const [wave, setWave] = useState<number | null>(null);
  const n = r?.events.length ?? 0;
  useEffect(() => {
    if (phase.k !== "run") return;
    const t = window.setTimeout(
      () => setPhase(phase.i < n ? { ...phase, i: phase.i + 1 } : { k: "result", chose: phase.chose }),
      phase.i === 0 ? 1100 : phase.i < n ? 1900 : 1500,
    );
    return () => window.clearTimeout(t);
  }, [phase, n]);
  useEffect(() => {
    if (phase.k !== "run") {
      setWave(null);
      return;
    }
    setWave(skyNow());
    const id = window.setInterval(() => setWave(skyNow()), 4200);
    return () => window.clearInterval(id);
  }, [phase.k]);
  const shown: Shown[] = phase.k === "run" ? (r?.events.slice(0, phase.i) ?? []) : phase.k === "result" ? (r?.events ?? []) : [];
  const latest = phase.k === "run" ? (shown.at(-1) ?? null) : null;
  const clock = !r ? null : phase.k === "run" ? between(r.from, r.to, n ? phase.i / n : 1) : phase.k === "result" ? r.to : null;
  const who = (e: Shown) => (e.mine ? seat : e.actorId);
  const lit = useMemo(() => new Set(shown.map(who).filter((x): x is string => !!x)), [shown.map((e) => e.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    phase,
    shown,
    latest,
    clock,
    lit,
    wave,
    who,
    choose: (chose: string) => setPhase({ k: "run", i: 0, chose }),
    skip: () => phase.k === "run" && setPhase({ k: "result", chose: phase.chose }),
    back: () => setPhase({ k: "decide" }),
  };
}
export type Playback = ReturnType<typeof usePlayback>;

/* ---------------------------------------------------------------- notes beside people */

export type Rect = { x: number; y: number; w: number; h: number };
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Places a note beside each person (their near side first, then the other, then up and down), never over another
 * note, anyone else on the web or their name, and inside `area`. Notes that cannot be placed are left out.
 */
export function placeNotes<T extends { node: string }>(items: T[], placed: Map<string, Placed>, area: Rect, size: { w: number; h: number }, avoid: Rect[] = []): (T & { x: number; y: number })[] {
  const out: (T & { x: number; y: number })[] = [];
  const boxes: Rect[] = [...avoid];
  const cx = area.x + area.w / 2;
  const people = (except: string) => [...placed.values()].filter((p) => p.id !== except).map((p) => ({ x: p.x - 56, y: p.y - 14, w: 112, h: p.r * 0.55 + 40 }));
  for (const it of items) {
    const p = placed.get(it.node);
    if (!p) continue;
    const others = people(it.node);
    const near = p.x < cx ? "l" : "r";
    let best: { x: number; y: number } | null = null;
    search: for (const dy of [0, -44, 44, -88, 88, -140, 140, -200, 200]) {
      for (const side of near === "r" ? ["r", "l"] : ["l", "r"]) {
        const x = Math.max(area.x, Math.min(area.x + area.w - size.w, side === "r" ? p.x + 62 : p.x - 62 - size.w));
        const y = Math.max(area.y, Math.min(area.y + area.h - size.h, p.y - size.h / 2 + dy));
        const box = { x, y, w: size.w, h: size.h };
        if (!boxes.some((b) => hits(b, box)) && !others.some((b) => hits(b, box))) {
          best = { x, y };
          break search;
        }
      }
    }
    if (!best) continue;
    boxes.push({ ...best, w: size.w, h: size.h });
    out.push({ ...it, ...best });
  }
  return out;
}

/** One note per person: the latest thing they did in this step, and how many more. Newest first. */
export function perPerson(shown: Shown[], who: (e: Shown) => string | null): { e: Shown; node: string; more: number }[] {
  const by = new Map<string, Shown[]>();
  for (const e of shown) {
    const n = who(e);
    if (n) by.set(n, [...(by.get(n) ?? []), e]);
  }
  return [...by.entries()].map(([node, es]) => ({ e: es.at(-1)!, node, more: es.length - 1 })).sort((a, b) => b.e.seq - a.e.seq);
}

/** An event on the web: who did what, beside them. */
export function EventNote({ P, e, x, y, w, fresh, more = 0 }: { P: Pal; e: Shown; x: number; y: number; w: number; fresh: boolean; more?: number }) {
  const t = useT("product.replay.stage.stage");
  const td = useT("product.replay.stage.data");
  return (
    <div className="sim-note-in absolute rounded-[14px] px-3.5 py-2.5 backdrop-blur-md" style={{ left: x, top: y, width: w, background: fresh ? `rgb(${P.warmRgb} / 0.13)` : `rgb(${P.pageRgb} / 0.78)`, boxShadow: `inset 0 0 0 1px ${fresh ? `rgb(${P.warmRgb} / 0.45)` : `rgb(${P.inkRgb} / 0.08)`}`, transition: "background .8s, box-shadow .8s" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12.5px] font-medium" style={{ color: fresh ? P.warm : P.ink }}>
          {whoOf(e, td)}
        </span>
        <span style={mono(11, P.faint)}>{md(e.at)}</span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-[13.5px] leading-[1.5]">{e.what}</div>
      {(e.p != null || more > 0) && (
        <div className="flex justify-between" style={mono(11, P.mute)}>
          <span>{e.p != null ? t("odds", { pct: Math.round(e.p * 100) }) : ""}</span>
          {more > 0 && <span style={{ color: P.faint }}>{t("moreInStep", { count: more })}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- the numbers */

/** The world's numbers in one quiet row; while a step plays they dim, since they only settle at the end. */
export function Numbers({ d, P, cols = 7, quiet = false }: { d: Data; P: Pal; cols?: number; quiet?: boolean }) {
  const t = useT("product.replay.stage.stage");
  const locale = useLocale();
  const nums = numsOf(d.play, locale);
  return (
    <div className="grid gap-x-7 gap-y-3 transition-opacity duration-500" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, opacity: quiet ? 0.45 : 1 }}>
      {nums.map((x) => (
        <div key={x.m.key} className="min-w-0" title={`${x.m.label}\n${t("sinceStart", { start: x.start, now: x.now })}\n${x.m.description}`}>
          <div className="truncate text-[12px]" style={{ color: P.mute }}>
            {x.m.label}
          </div>
          <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-[19px] leading-none font-light" style={mono(19)}>
              {x.value}
            </span>
            {x.unit && <span className="text-[11px]" style={{ color: P.mute }}>{x.unit}</span>}
            {x.d && <span className="ml-1" style={mono(11, x.bad ? P.warm : P.faint)}>{x.d}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Keeps the latest value of something for a moment after it is gone (for fading out). */
export function useLinger<T>(v: T | null, ms = 600): T | null {
  const [x, setX] = useState(v);
  const t = useRef<number | null>(null);
  useEffect(() => {
    if (v != null) {
      if (t.current) window.clearTimeout(t.current);
      setX(v);
    } else t.current = window.setTimeout(() => setX(null), ms);
  }, [v, ms]);
  return x;
}

export const STAGE_CSS = `@keyframes sim-note-in { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
.sim-note-in { animation: sim-note-in .6s cubic-bezier(.2,.7,.2,1) both; }
@keyframes sim-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.sim-up { animation: sim-up .7s cubic-bezier(.2,.7,.2,1) both; }
@keyframes sim-blur-in { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: none; } }
.sim-blur-in { animation: sim-blur-in .8s ease both; }`;

/* ---------------------------------------------------------------- the moment's question and its options */


/** What makes the moment worth deciding in: why the world stopped here, in a line (the scene in full on hover). */
export function Hard({ P, d, size = 15 }: { P: Pal; d: Data; /** (no longer used: the moment says why it stops in one line) */ n?: number; size?: number }) {
  const s = d.play.situation;
  if (!s?.why) return null;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline gap-2.5 leading-[1.5]" style={{ fontSize: size }} title={s.scene}>
        <span className="h-[5px] w-[5px] shrink-0 -translate-y-[3px] rounded-full" style={{ background: P.mute }} />
        <span style={{ color: `rgb(${P.inkRgb} / 0.86)` }}>{s.why}</span>
      </div>
    </div>
  );
}

/**
 * The ways to go: names only, so they can be compared at a glance; the one you point at opens in place, its long
 * text read as a few short lines in full size, with whom it would reach.
 */
export function OptionList({ P, opts, focus, setFocus, reach, onChoose, title = 17, body = 14.5, onWrite }: { P: Pal; opts: Option[]; focus: number; setFocus: (i: number) => void; reach: string[]; onChoose: (o: Option) => void; title?: number; body?: number; /** Your own move, written: a way to go like the others. */ onWrite?: (text: string) => void }) {
  const t = useT("product.replay.stage.stage");
  return (
    <div className="grid gap-1">
      {opts.map((o, i) => {
        const on = i === focus;
        return (
          <div key={o.id} onMouseEnter={() => setFocus(i)} className={`rounded-[16px] px-4 transition-colors duration-300 ${title < 16 ? "py-1.5" : "py-2.5"}`} style={{ background: on ? `rgb(${P.warmRgb} / 0.09)` : "transparent" }}>
            <button type="button" onClick={() => onChoose(o)} className="flex w-full items-center gap-3 text-left">
              <span className="h-[9px] w-[9px] shrink-0 rounded-full transition-all" style={{ background: on ? P.warm : "transparent", boxShadow: on ? `0 0 0 4px rgb(${P.warmRgb} / 0.16)` : `inset 0 0 0 1.5px rgb(${P.inkRgb} / 0.35)` }} />
              <span className="min-w-0 flex-1 leading-[1.4]" style={{ fontSize: title, fontWeight: on ? 500 : 400, color: on ? P.ink : `rgb(${P.inkRgb} / 0.8)` }}>
                {o.title}
              </span>
            </button>
            {on && (
              <div className="sim-up pl-[21px]">
                <div className="mt-2 grid gap-1">
                  {toLines(o.detail, 3).map((l, j) => (
                    <div key={j} className="leading-[1.6]" style={{ fontSize: body, color: P.mute }}>
                      {l}
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <span className="truncate text-[12.5px]" style={{ color: P.faint }}>
                    {reach.length ? rich(t("reaches", { names: reach.join(t("sep")) }), { b: (s) => <span style={{ color: P.warm }}>{s}</span> }) : t("reachesOnlyYou")}
                  </span>
                  <button type="button" onClick={() => onChoose(o)} className="shrink-0 rounded-full px-3.5 py-1 text-[13px]" style={{ background: P.warm, color: P.page }}>
                    {t("doThis")}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {onWrite && <WriteRow P={P} on={focus === opts.length} onFocus={() => setFocus(opts.length)} onRun={onWrite} title={title} body={body} />}
    </div>
  );
}

/** The last way: your own, written in place; it acts on the world like the others (asking is the bar below). */
function WriteRow({ P, on, onFocus, onRun, title, body }: { P: Pal; on: boolean; onFocus: () => void; onRun: (t: string) => void; title: number; body: number }) {
  const t = useT("product.replay.stage.stage");
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div onMouseEnter={onFocus} onClick={() => ref.current?.focus()} className={`cursor-text rounded-[16px] px-4 transition-colors duration-300 ${title < 16 ? "py-1.5" : "py-2.5"}`} style={{ background: on ? `rgb(${P.warmRgb} / 0.09)` : "transparent" }}>
      <div className="flex items-start gap-3">
        <span className="mt-[7px] h-[9px] w-[9px] shrink-0 rounded-full" style={{ boxShadow: on ? `0 0 0 4px rgb(${P.warmRgb} / 0.16), inset 0 0 0 1.5px ${P.warm}` : `inset 0 0 0 1.5px rgb(${P.inkRgb} / 0.35)`, border: "none" }} />
        <textarea
          ref={ref}
          value={text}
          rows={on || text ? 2 : 1}
          onFocus={onFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && !e.shiftKey && text.trim()) {
              e.preventDefault();
              onRun(text.trim());
            }
          }}
          placeholder={t("writeOwn")}
          className="min-w-0 flex-1 resize-none bg-transparent leading-[1.45] outline-none"
          style={{ fontSize: title, color: P.ink }}
        />
      </div>
      {on && (
        <div className="sim-up mt-1.5 flex items-center justify-between gap-3 pl-[21px]">
          <span className="leading-[1.5]" style={{ fontSize: body - 1.5, color: P.faint }}>
            {t("addFact")}
          </span>
          <button type="button" disabled={!text.trim()} onClick={() => onRun(text.trim())} className="shrink-0 rounded-full px-3.5 py-1 text-[13px] transition-opacity" style={{ background: P.warm, color: P.page, opacity: text.trim() ? 1 : 0.35 }}>
            {t("doThis")}
          </button>
        </div>
      )}
    </div>
  );
}
