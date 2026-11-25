"use client";

import { MONO } from "@/components/kit/palette";
import type { Pal } from "@/components/kit/palette";

/**
 * Two small pieces the waiting pages share, so numbers and progress read as part of the page rather than stand
 * apart from it: a number set in a sentence, and a fine ruler that fills.
 */

/** A number in a sentence: the ink's own colour, figures of even width, lifting a little as it changes. */
export function N({ P, v }: { P: Pal; v: number | string }) {
  return (
    <span key={v} className="w-num inline-block tabular-nums" style={{ color: P.ink, fontFamily: MONO, fontSize: "0.95em" }}>
      {v}
    </span>
  );
}

/**
 * A fine ruler, `part` of it lit (warm, brighter toward its head); the tick at the head breathes while it runs. Every
 * eighth tick a little taller, like the chart's own graduations.
 */
export function Ruler({ P, part, ticks = 64, running = true, height = 14, dim = false }: { P: Pal; part: number; ticks?: number; running?: boolean; height?: number; dim?: boolean }) {
  const lit = Math.max(0, Math.min(ticks, Math.round(part * ticks)));
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {Array.from({ length: ticks }, (_, i) => {
        const on = i < lit;
        const head = running && i === lit && lit < ticks;
        return (
          <span
            key={i}
            className={head ? "w-tick" : ""}
            style={{
              flex: 1,
              height: head ? height : i % 8 === 0 ? height * 0.64 : height * 0.43,
              background: on || head ? (dim ? `rgb(${P.inkRgb} / 0.55)` : P.warm) : `rgb(${P.inkRgb} / ${i % 8 === 0 ? 0.22 : 0.12})`,
              opacity: on ? 0.35 + 0.65 * ((i + 1) / Math.max(1, lit)) : 1,
              transition: "background .4s, opacity .4s",
            }}
          />
        );
      })}
    </div>
  );
}

/** The motion the pieces above need. */
export const BITS_CSS = `@keyframes w-tick { 0%, 100% { opacity: 1; } 50% { opacity: .35; } } .w-tick { animation: w-tick 1.1s ease-in-out infinite; }
@keyframes w-num { from { opacity: .2; transform: translateY(.3em); } to { opacity: 1; transform: none; } } .w-num { animation: w-num .45s ease-out both; }
@keyframes w-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } } .w-up { animation: w-up .55s cubic-bezier(.2,.7,.2,1) both; }`;

/** A side's heading: small, quiet, with its count. */
export function Head({ P, text, n }: { P: Pal; text: string; n?: number | string }) {
  return (
    <div className="mb-4 flex items-baseline gap-2.5 text-[12px] tracking-[0.1em]" style={{ color: P.mute }}>
      {text}
      {n != null && (
        <span className="tabular-nums tracking-normal" style={{ fontFamily: MONO, color: P.faint }}>
          {n}
        </span>
      )}
    </div>
  );
}

/**
 * Names that flow on like a line of text, each as large and as bright as it weighs (how much a site gave, how much is
 * known about a person): the big ones read first, the small ones are there for whoever looks. `hot` ones warm.
 */
export function Cloud({ P, items, mono = false }: { P: Pal; items: { key: string; label: string; weight: number; hot?: boolean; note?: string }[]; mono?: boolean }) {
  const max = Math.max(1, ...items.map((x) => x.weight));
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 leading-[1.25]">
      {items.map((x) => {
        const k = Math.sqrt(x.weight / max);
        return (
          <span key={x.key} className="whitespace-nowrap" style={{ fontSize: 12.5 + 9 * k, color: x.hot ? P.warm : k > 0.6 ? P.ink : P.mute, opacity: x.hot ? 1 : 0.45 + 0.55 * k, fontFamily: mono ? MONO : undefined, transition: "font-size .6s ease, color .6s, opacity .6s" }}>
            {x.label}
            {x.note && (
              <sup className="ml-0.5 text-[10px] tabular-nums" style={{ fontFamily: MONO, color: P.faint }}>
                {x.note}
              </sup>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * What is coming in, newest first: the newest set large with where it came from, the few before it smaller and
 * quieter, the oldest a single fading line. Depth, not a list of equals.
 */
export function Stream({ P, items }: { P: Pal; items: { key: string; title: string; meta?: string; warm?: boolean }[] }) {
  return (
    <div>
      {items.slice(0, 6).map((x, k) => (
        <div key={x.key} className={k === 0 ? "w-in" : ""} style={{ marginTop: k === 0 ? 0 : k === 1 ? 18 : 10, opacity: k === 0 ? 1 : Math.max(0.25, 0.85 - k * 0.14) }}>
          <div className={k >= 3 ? "truncate" : ""} style={{ fontSize: k === 0 ? 17 : k < 3 ? 14 : 13, lineHeight: k === 0 ? 1.5 : 1.55, color: k === 0 ? P.ink : P.mute }}>
            {x.title}
          </div>
          {k === 0 && x.meta && (
            <div className="mt-1.5 text-[11.5px]" style={{ fontFamily: MONO, color: x.warm ? P.warm : P.faint }}>
              {x.meta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
