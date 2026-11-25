"use client";

import type { Ref } from "react";
import { useApp } from "@/components/product/shell";
import { useT } from "@/lib/i18n/client";

/**
 * The parts the questions are made of (asks.tsx): an answer offered, a soft pane that is plainly there to be pressed;
 * the answer of one's own, plainly a place to write; and going on (warm) and passing over, in the middle below.
 */

const SWIFT = "cubic-bezier(.2,.7,.2,1)";

/** How an answer stands in each way: at rest, gone to (hot), taken among several (kept), pressed (on), or fallen back because another was (away). */
function useStand() {
  const { P } = useApp();
  const ink = (a: number) => `rgb(${P.inkRgb} / ${a})`;
  const warm = (a: number) => `rgb(${P.warmRgb} / ${a})`;
  return (on: boolean, hot: boolean, kept: boolean, away: boolean): React.CSSProperties => {
    const lit = on || hot;
    const base: React.CSSProperties = {
      position: "relative",
      opacity: away ? 0 : 1,
      filter: away ? "blur(3px)" : "none",
      transform: lit ? "translateY(-1px)" : "none",
      transition: on ? "none" : `color .3s ease, background .3s ease, box-shadow .3s ease, opacity .34s ease, filter .34s ease, transform .3s ${SWIFT}, width .42s ${SWIFT}, padding .42s ${SWIFT}`,
    };
    const color = lit || kept ? P.ink : ink(0.86);
    return { ...base, color, background: kept ? warm(0.2) : ink(lit ? 0.13 : 0.06), boxShadow: kept ? `0 0 26px ${warm(0.16)}` : hot ? `0 0 26px ${ink(0.1)}` : "none", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" };
  };
}

/** One answer offered. */
export function Answer({ label, on = false, hot = false, kept = false, away = false, several = false, onClick, onEnter, onLeave }: { label: string; on?: boolean; hot?: boolean; kept?: boolean; away?: boolean; several?: boolean; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; onEnter?: () => void; onLeave?: () => void }) {
  const { P } = useApp();
  const stand = useStand();
  const inner = (
    <>
      {/* (taken among several: a warm point before it) */}
      {several && <span aria-hidden className="shrink-0 rounded-full" style={{ width: kept ? 6 : 0, height: 6, marginRight: kept ? 9 : 0, background: P.warm, boxShadow: `0 0 8px rgb(${P.warmRgb} / 0.7)`, transition: `width .3s ${SWIFT}, margin .3s ${SWIFT}` }} />}
      {label}
    </>
  );
  const cls = "flex items-center whitespace-nowrap outline-none rounded-full px-5 py-[10px] text-[15px]";
  const st = { ...stand(on, hot, kept, away), cursor: away ? "default" : "pointer" };
  return (
    <button type="button" onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} className={cls} style={st}>
      {inner}
    </button>
  );
}

/** One's own answer: one more among those offered, plainly a place to write, which opens when gone to. */
export function Own({ boxRef, text, number = false, unit = "", wide, mine = false, hot = false, done = false, onText, onFocus, onBlur, onEnter, onLeave, onGive }: { boxRef?: Ref<HTMLLabelElement>; text: string; number?: boolean; unit?: string; wide: boolean; mine?: boolean; hot?: boolean; done?: boolean; onText?: (s: string) => void; onFocus?: () => void; onBlur?: () => void; onEnter?: () => void; onLeave?: () => void; onGive?: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.ask-parts");
  const stand = useStand();
  const typed = text.trim();
  const ring = wide && !done ? `inset 0 0 0 1px rgb(${P.inkRgb} / 0.28)` : null;
  const st: React.CSSProperties = { ...stand(mine, hot || wide, false, done && !mine), ...(ring ? { boxShadow: ring } : {}), width: wide ? 340 : number ? 132 : 116, paddingLeft: 20, paddingRight: wide ? 6 : 16, cursor: done ? "default" : "text" };
  return (
    <label style={st} ref={boxRef} onMouseEnter={onEnter} onMouseLeave={onLeave} className="relative flex h-[43px] items-center rounded-full text-[15px]">
      <input className="ask-own min-w-0 flex-1 bg-transparent outline-none" value={text} readOnly={done} inputMode={number ? "decimal" : "text"} onFocus={onFocus} onBlur={onBlur} onChange={(e) => onText?.(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && onGive?.()} placeholder={number ? t("enterNumber") : t("writeOwn")} style={{ color: P.ink }} />
      {unit && (
        <span className="shrink-0 overflow-hidden pr-2 text-[12.5px] whitespace-nowrap" style={{ color: P.mute, opacity: wide ? 1 : 0, maxWidth: wide ? 80 : 0, transition: "opacity .3s ease, max-width .42s ease" }}>
          {unit}
        </span>
      )}
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onGive} className="flex h-[31px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] whitespace-nowrap" style={{ background: P.warm, color: P.page, opacity: typed && !done ? 1 : 0, width: typed ? 56 : 0, pointerEvents: typed && !done ? "auto" : "none", transition: "opacity .2s ease, width .3s ease" }}>
        {t("ok")}
      </button>
    </label>
  );
}

/** Going on (any of several: what is taken is given together) and passing over, in the middle below. */
export function Going({ several, count, hidden = false, onGo, onSkip }: { several: boolean; count: number; hidden?: boolean; onGo?: () => void; onSkip?: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.ask-parts");
  const ready = count > 0;
  const go: React.CSSProperties = { background: P.warm, color: P.page, boxShadow: ready ? `0 0 30px rgb(${P.warmRgb} / 0.35)` : "none" };
  return (
    <div className="flex flex-col items-center" style={{ opacity: hidden ? 0 : 1, transition: "opacity .3s ease" }}>
      <button type="button" disabled={!several || !ready || hidden} onClick={onGo} className="flex h-[42px] items-center rounded-full px-8 text-[14.5px] tracking-[0.04em] whitespace-nowrap" style={{ ...go, opacity: several ? (ready ? 1 : 0.4) : 0, pointerEvents: several ? "auto" : "none", cursor: ready ? "pointer" : "default", transition: "opacity .3s ease, box-shadow .3s ease, background .3s ease, text-shadow .3s ease" }}>
        {ready ? t("doneCount", { count }) : t("done")}
      </button>
      <button type="button" onClick={onSkip} className="mt-4 text-[13px] tracking-[0.04em]" style={{ color: P.mute }}>
        {t("skip")}
      </button>
    </div>
  );
}
