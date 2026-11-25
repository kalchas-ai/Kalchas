"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Pal } from "@/components/kit/palette";
import type { Data } from "./data";
import { Label, mono } from "./parts";
import { md } from "./data";
import { NamedText, cutBefore } from "./names";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";

/**
 * The turn as you live it: the stop as it is written and read, what you are after and your standing intentions, and
 * ending a play.
 */

type Settlement = NonNullable<NonNullable<Data["play"]["lastStep"]>["settlement"]>;

/** What the program noted of how the play was worked out, folded away at the foot of what is read. */
export function ProcessingNotices({ P, notices = [] }: { P: Pal; notices?: string[] }) {
  const t = useT("product.replay.stage.turn");
  return notices.length ? (
    <details className="mt-8 rounded-[14px] px-4 py-3 text-[12.5px]" style={{ background: `rgb(${P.inkRgb} / 0.04)`, color: P.mute }}>
      <summary className="cursor-pointer">{t("notices", { count: notices.length })}</summary>
      <ul className="mt-2 space-y-1 leading-[1.6]">
        {notices.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  ) : null;
}

/** A sheet over the page: dims what is behind, closes on Esc or a click outside (when it may be closed). */
function Sheet({ P, onClose, width = 680, children }: { P: Pal; onClose?: () => void; width?: number; children: React.ReactNode }) {
  useEffect(() => {
    if (!onClose) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6" style={{ background: `rgb(${P.pageRgb} / 0.55)`, backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="sim-up scroll-thin flex max-h-full flex-col overflow-y-auto rounded-[28px] px-9 py-7" style={{ width: `min(${width}px, 100%)`, background: `rgb(${P.pageRgb} / 0.97)`, boxShadow: `0 30px 90px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)` }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const days = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5));
/** A stretch of days, said in years, months or days. `t` is the texts of "product.replay.stage.turn". */
const span = (n: number, t: T) => (n >= 365 ? t("years", { count: Math.round((n / 365) * 10) / 10 }) : n >= 60 ? t("months", { count: Math.round(n / 30) }) : t("days", { count: n }));
/** How much two texts begin alike. */
const alike = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

const STOP_CSS = `@keyframes stop-in { from { opacity: 0; } to { opacity: 1; } }
.stop-in { animation: stop-in .7s ease both; }`;

/**
 * A stop as it is read, in the middle column of the play page (the parties and what happened stay beside it): its
 * scene, as it is written and once it is; and what reached the protagonist in the stretch, each a message of its own.
 * Its foot is what is to be decided now, and the one way on, to the ways open. The opening is read on the same page,
 * with nothing settled before it. A main question settled in the stretch is not on this page: its result comes on its
 * own once the page is gone on from (ResultCard).
 *
 * The page is the height of the column, its head and foot always where they are: only what is between them scrolls,
 * and only when there is more than fits, so that the way on is never off the page. No odds are given: how the rolls
 * fell is down the right with what happened, and not said again here.
 */
export function StopPage({ P, d, settlement, scene, note, onNext }: { P: Pal; d: Data; /** What the stretch came to; null at the opening and while the stop is being written. */ settlement: Settlement | null; /** While the stop is being written: its scene, as written so far. */ scene?: string; /** While the stop is being written: what is being done now, in the engine's own words. */ note?: string; /** Absent while there is nothing to go on to yet (the stop is still being written). */ onNext?: () => void }) {
  const t = useT("product.replay.stage.turn");
  const play = d.play;
  const s = play.situation;
  // (while the stop is being written the play still holds the one before it: of the new one only its scene, as it
  // comes, is shown; what reached the protagonist comes with the stop once it is written)
  const writing = scene != null;
  const text = scene ?? s?.scene ?? "";
  const opening = !writing && !settlement;
  const said = writing ? [] : (s?.messages ?? []);
  const ask = writing ? "" : (s?.headline ?? settlement?.moment ?? "");
  const from = settlement?.from ?? s?.day ?? play.branch.simTime;
  const when = settlement ? t("passed", { from: md(settlement.from), to: md(settlement.to), span: span(days(settlement.from, settlement.to), t) }) : opening ? t("opening", { date: md(s?.day ?? play.branch.simTime) }) : t("since", { date: md(from) });

  // what has come since the scene was last drawn is a piece of its own, which fades in where it is; what was there
  // stays as it was, never drawn again (a name it holds keeps its card open). A piece never begins inside a name, so
  // that a name that came in two goes is still one
  const cuts = useRef({ text: "", at: [0] });
  if (cuts.current.text !== text) {
    const k = cutBefore(play, text, alike(cuts.current.text, text));
    const keep = cuts.current.at.filter((c) => c < k);
    cuts.current = { text, at: k < text.length || !keep.length ? [...keep, k] : keep };
  }
  const at = cuts.current.at;
  const paras: { text: string; at: number }[] = [];
  for (const m of text.matchAll(/[^\n]+/g)) if (m[0].trim()) paras.push({ text: m[0], at: m.index });

  // while it is written, the page keeps what has just come in sight, unless it has been scrolled back to read
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const moving = useRef(0);
  useLayoutEffect(() => {
    const el = body.current;
    if (!writing || !follow.current || !el || el.scrollHeight <= el.clientHeight) return;
    window.clearTimeout(moving.current);
    moving.current = window.setTimeout(() => (moving.current = 0), 700);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [text, writing]);
  useEffect(() => () => window.clearTimeout(moving.current), []);
  const scrolled = () => {
    const el = body.current;
    if (el && !moving.current) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
  };

  // (the line on what is being done stays as it last was while it fades, once the stop is written)
  const doing = useRef("");
  if (note) doing.current = note;

  const ink = (a: number) => `rgb(${P.inkRgb} / ${a})`;
  return (
    <div className="flex h-full justify-center">
      <style>{STOP_CSS}</style>
      <div className="flex h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-[26px]" style={{ background: `rgb(${P.pageRgb})`, boxShadow: `0 40px 110px rgb(0 0 0 / 0.4), inset 0 0 0 1px ${ink(0.08)}` }}>
        <div className="flex shrink-0 items-baseline justify-between gap-4 px-10 pt-6 pb-4">
          <span style={{ ...mono(11.5, P.mute), letterSpacing: "0.02em" }}>{when}</span>
        </div>

        <div ref={body} onScroll={scrolled} className="@container min-h-0 flex-1 overflow-y-auto px-10 pb-8">
          <div className="grid gap-x-10 gap-y-8 @min-[620px]:grid-cols-[minmax(0,1fr)_clamp(236px,34%,316px)]">
            <div className="min-w-0">
              {/* the scene: the page's reading column, a paragraph at a time */}
              <div className="text-[16px] leading-[1.95] tracking-[0.01em]" style={{ color: ink(0.86) }}>
                {paras.map((p, i) => (
                  <p key={i} className={i ? "mt-[0.85em]" : ""}>
                    {at.map((c, j) => {
                      const a = Math.max(c, p.at);
                      const b = Math.min(at[j + 1] ?? text.length, p.at + p.text.length);
                      return b > a ? (
                        <span key={c} className="stop-in">
                          <NamedText text={text.slice(a, b)} play={play} />
                        </span>
                      ) : null;
                    })}
                  </p>
                ))}
              </div>
            </div>

            {/* what reached the protagonist in the stretch, each as the message it was */}
            <aside className="min-w-0">
              {said.length > 0 && (
                <div className="stop-in">
                  <div className="flex items-baseline justify-between text-[12px]" style={{ color: P.mute }}>
                    <span>{t("newMessages")}</span>
                    <span style={mono(10.5, P.faint)}>{said.length}</span>
                  </div>
                  <div className="mt-3 grid gap-2.5">
                    {said.map((m, i) => (
                      <article key={i} className="rounded-[14px] px-4 pt-3 pb-3.5" style={{ background: ink(0.05) }}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-[13px] font-medium">
                            <NamedText text={m.from} play={play} />
                          </span>
                          <span className="shrink-0" style={mono(10.5, P.faint)}>
                            {md(m.day)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[13.5px] leading-[1.7]" style={{ color: ink(0.82) }}>
                          <NamedText text={m.gist} play={play} />
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
          {!writing && <ProcessingNotices P={P} notices={play.notices} />}
        </div>

        {/* what is to be decided now, and the way on: always here, lit once the stop is written */}
        <div className="flex shrink-0 items-center gap-6 px-10 py-4" style={{ boxShadow: `inset 0 1px 0 ${ink(0.08)}` }}>
          <div className="min-w-0 flex-1" style={{ opacity: ask ? 1 : 0, transition: "opacity .5s ease" }}>
            <div className="text-[12px]" style={{ color: P.mute }}>
              {t("yoursNow")}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[16px] leading-[1.5] font-medium">{ask && <NamedText text={ask} play={play} />}</div>
          </div>
          <div className="relative flex shrink-0 items-center">
            <span className="pointer-events-none absolute right-full mr-4 whitespace-nowrap text-[12.5px]" style={{ color: P.faint, opacity: writing ? 1 : 0, transition: "opacity .5s ease" }}>
              {doing.current || t("writingStop")}
            </span>
            <button type="button" onClick={onNext} disabled={!onNext} className="rounded-full px-8 py-2.5 text-[14.5px] font-medium" style={{ background: P.warm, color: P.page, opacity: onNext ? 1 : 0.3, cursor: onNext ? "pointer" : "default", transition: "opacity .5s ease" }}>
              {t("continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One of the main questions settled in a stop, with its card. */
export type Result = NonNullable<NonNullable<Data["play"]["situation"]>["milestones"]>[number];

/**
 * One of the main questions settled, on its own over the page once the stop it was settled in has been read: the
 * result as it came, what happened that settled it, and the few figures that show it. The result itself says whether it
 * came about; nothing else marks it.
 */
export function ResultCard({ P, play, result, onNext }: { P: Pal; play: Data["play"]; result: Result; onNext: () => void }) {
  const t = useT("product.replay.stage.turn");
  const ink = (a: number) => `rgb(${P.inkRgb} / ${a})`;
  const c = result.card;
  return (
    <div className="scroll-thin flex max-h-full flex-col overflow-y-auto rounded-[26px] px-10 pt-8 pb-7 backdrop-blur-xl" style={{ width: "min(620px, 100%)", background: `rgb(${P.pageRgb} / 0.9)`, boxShadow: `0 40px 110px rgb(0 0 0 / 0.42), inset 0 0 0 1px ${ink(0.08)}` }}>
      <div className="flex items-baseline justify-between gap-4 text-[12.5px]" style={{ color: P.mute }}>
        <span>{t("yourResult")}</span>
        <span style={mono(11, P.faint)}>{md(result.day)}</span>
      </div>
      <h2 className="mt-3 text-[26px] leading-[1.42] font-medium">
        <NamedText text={c.result} play={play} />
      </h2>
      {c.turn && (
        <p className="mt-3 text-[15px] leading-[1.85]" style={{ color: ink(0.86) }}>
          <NamedText text={c.turn} play={play} />
        </p>
      )}
      {c.figures.length > 0 && (
        <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {c.figures.map((f, i) => (
            <div key={i} className="min-w-0">
              <div className="truncate text-[12px]" style={{ color: P.mute }} title={f.label}>
                {f.label}
              </div>
              <div className="mt-1 text-[18px] leading-[1.35]" style={{ fontVariantNumeric: "tabular-nums" }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8 flex justify-end">
        <button type="button" onClick={onNext} className="rounded-full px-8 py-2.5 text-[14.5px] font-medium" style={{ background: P.warm, color: P.page }}>
          {t("continue")}
        </button>
      </div>
    </div>
  );
}

/** Ending here by choice: the review is written; the timeline stops. */
export function EndSheet({ P, d, busy, onEnd, onClose }: { P: Pal; d: Data; busy: boolean; onEnd: () => void; onClose: () => void }) {
  const t = useT("product.replay.stage.turn");
  return (
    <Sheet P={P} onClose={busy ? undefined : onClose} width={540}>
      <Label P={P} warm>
        {t("endTitle")}
      </Label>
      <h2 className="mt-3 text-[24px] leading-snug font-medium">{t("endAsk")}</h2>
      <p className="mt-2 text-[14.5px] leading-[1.75]" style={{ color: P.mute }}>
        {d.world.forward ? t("endBodyForecast") : t("endBodyHistory")}
      </p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-5 py-2.5 text-[14px]" style={{ boxShadow: `inset 0 0 0 1px ${P.rule}`, color: P.ink }}>
          {t("keepPlaying")}
        </button>
        <button type="button" onClick={onEnd} disabled={busy} className="flex-1 rounded-full px-5 py-2.5 text-[14px] font-medium" style={{ background: P.warm, color: P.page }}>
          {busy ? t("writingReview") : t("endAndReview")}
        </button>
      </div>
    </Sheet>
  );
}

/** What you are after, in the top bar: open, the goal as you put it and your standing intentions. */
export function GoalPill({ P, d }: { P: Pal; d: Data }) {
  const t = useT("product.replay.stage.turn");
  const [open, setOpen] = useState(false);
  const goal = d.play.goal;
  if (!goal) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] whitespace-nowrap" style={{ background: `rgb(${P.warmRgb} / 0.12)`, color: P.warm }}>
        {t("goal")}
      </button>
      {open && (
        <div className="sim-in absolute top-full right-0 z-50 mt-2 w-[360px] rounded-[18px] p-5 backdrop-blur-xl" style={{ background: `rgb(${P.pageRgb} / 0.97)`, boxShadow: `0 20px 60px rgb(0 0 0 / 0.4), inset 0 0 0 1px ${P.rule}` }}>
          <div className="text-[12px]" style={{ color: P.mute }}>
            {t("goal")}
          </div>
          <div className="mt-0.5 text-[15px] leading-[1.5] font-medium">{goal.text}</div>
          <div className="mt-4 border-t pt-3" style={{ borderColor: P.rule }}>
            <div className="text-[12px]" style={{ color: P.mute }}>
              {t("policy")}
            </div>
            {d.play.policy.length ? (
              d.play.policy.map((p) => (
                <div key={p.id} className="mt-1 text-[13.5px] leading-[1.55]">
                  {p.text}
                </div>
              ))
            ) : (
              <div className="mt-1 text-[13px]" style={{ color: P.faint }}>
                {t("policyEmpty")}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="mt-3 text-[12px]" style={{ color: P.faint }}>
            {t("hide")}
          </button>
        </div>
      )}
    </div>
  );
}
