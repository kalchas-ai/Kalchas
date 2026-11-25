"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WorldView } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { usd, useApp } from "@/components/product/shell";
import { numsOf, type Play } from "@/components/product/replay/stage/data";
import type { DesignMeeting } from "@/lib/design-meeting";
import { clock } from "@/components/product/wait/tape";
import { rich, useLocale, useT } from "@/lib/i18n/client";
import { entOf, faceKind } from "./faces";
import { FaceIcon } from "./who";
import { Go, Head, Kick, Pager, clampLines, usePages } from "./rest";

/**
 * What can be opened while a play is on, each on one sheet in the middle of the page (/design/matter): asking
 * without moving time; being asked to say more plainly what you mean; the lines of time and leaving one for another;
 * what you are after; what is known and what is hidden; how the world moves; the end, a play that is over; and what
 * has gone wrong, or is still being made.
 *
 * One sheet at a time, in the place where what is to be decided is, on the same plate; the world and the columns
 * step back behind it. A sheet says what it is in a small line, then the one thing it is for; what is long is gone
 * through a page at a time and never scrolls; the one thing to press is warm. Everything on them is what the
 * product's own view of the play holds.
 */

const SWIFT = "cubic-bezier(.2,.7,.2,1)";
const BAR = 54;
/** A name as it is said: without what is in brackets (full-width or plain), and the first of several. */
export const nick = (n: string) => n.replace(/[\uff08(].*?[\uff09)]/g, "").split("/")[0]!.trim() || n;
/** A day ("2025-03-14…") as its month and day, in the interface language. */
const md = (locale: string, d: string) => {
  if (!d) return "";
  const [y, m, day] = [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
  if (!(m >= 1 && day >= 1)) return d;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number.isFinite(y) ? y : 2000, m - 1, day)));
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

// ("meet" and "goal" are opened by nothing any more: flow.tsx, which may not be edited here, still names them)
export type SheetKey = "notes" | "ask" | "clarify" | "meet" | "lines" | "arc" | "intel" | "world" | "goal" | "end" | "ended" | "error" | "reading";
/** Every sheet, by name (only for the menu of states on the design page: flow.tsx). */
export const SHEETS: [SheetKey, string][] = [
  ["ask", "Ask"],
  ["clarify", "Say it plainly"],
  ["lines", "Timeline"],
  ["arc", "Goal"],
  ["intel", "Findings"],
  ["world", "World"],
  ["end", "End"],
  ["ended", "Ended"],
  ["reading", "Writing the situation"],
  ["error", "Error"],
];

/** The plate a sheet is on, and behind it the page stepping back. It comes and goes by fading; pressing beside it lets it go. */
export function Sheet({ on, onClose, w = 760, children }: { on: boolean; onClose: () => void; w?: number; children: React.ReactNode }) {
  const { P } = useApp();
  const [here, setHere] = useState(on);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (on) {
      setHere(true);
      const id = window.setTimeout(() => setSeen(true), 30);
      return () => window.clearTimeout(id);
    }
    setSeen(false);
    const id = window.setTimeout(() => setHere(false), 520);
    return () => window.clearTimeout(id);
  }, [on]);
  if (!here) return null;
  return (
    <div className="absolute inset-x-0 top-0 z-[30] flex items-center justify-center px-6" style={{ bottom: BAR, opacity: seen ? 1 : 0, transition: "opacity .5s ease", pointerEvents: seen ? "auto" : "none" }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pointer-events-none absolute inset-0" style={{ background: `rgb(${P.pageRgb} / 0.62)`, backdropFilter: "blur(5px)" }} />
      <SheetCard w={w} seen={seen} onClose={onClose}>
        {children}
      </SheetCard>
    </div>
  );
}

const Rule = () => {
  const { P } = useApp();
  return <div className="h-px w-full" style={{ background: `rgb(${P.inkRgb} / 0.08)` }} />;
};

// ------------------------------------------------------------------------------------------- at hand, in the head and at the foot

/** What a play always has at hand, in a line at the top right: what it has cost, and the ways into each sheet. */
/** The card a sheet is, by itself (what is laid over the page is Sheet's): also for looking at sheets side by side. */
export function SheetCard({ w = 760, seen = true, onClose, children }: { w?: number; seen?: boolean; onClose: () => void; children: React.ReactNode }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  return (
    <div className="relative rounded-[26px] backdrop-blur-xl" style={{ width: `min(${w}px, 100%)`, background: `rgb(${P.pageRgb} / 0.9)`, boxShadow: `0 40px 110px rgb(0 0 0 / 0.42), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)`, transform: seen ? "none" : "translateY(10px)", transition: `transform .55s ${SWIFT}` }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={onClose} aria-label={t("hide")} className="absolute top-4 right-5 flex h-7 w-7 items-center justify-center rounded-full text-[15px]" style={{ color: P.mute }}>
        ×
      </button>
      {children}
    </div>
  );
}

export function ToolsLine({ play, open }: { play: Play; open: (k: SheetKey) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const item = (k: SheetKey, text: string, faint = false) => (
    <button type="button" onClick={() => open(k)} className="transition-colors duration-300 hover:text-[rgb(var(--k-ink))]" style={{ color: faint ? P.faint : P.mute }}>
      {text}
    </button>
  );
  return (
    <div className="pointer-events-auto flex shrink-0 items-baseline gap-5 text-[12px] whitespace-nowrap" style={{ color: P.mute }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>{usd(play.world.spentUsd)}</span>
      {item("lines", play.branches.length > 1 ? t("timelines", { count: play.branches.length }) : t("timeline"))}
      {play.goal && item("arc", t("goal"))}
      {item("intel", t("findings"))}
      {item("world", t("world"))}
      {item(play.branch.ended ? "ended" : "end", t("end"), true)}
    </div>
  );
}

/** Under what is to be decided, one quiet line: something can be asked first, and time does not move for it. */
export function AskLine({ play, open }: { play: Play; open: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement).closest("input, textarea")) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);
  return (
    <button type="button" onClick={open} className="pointer-events-auto flex items-center gap-3 rounded-full px-5 py-[9px] text-[13px] backdrop-blur-md transition-colors duration-300" style={{ background: `rgb(${P.pageRgb} / 0.6)`, boxShadow: `inset 0 0 0 1px rgb(${P.inkRgb} / 0.12)`, color: P.mute }}>
      <span>{t("askFirstHint")}</span>
      {play.asks.length > 0 && <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>{t("asked", { count: play.asks.length })}</span>}
      <span className="rounded-[5px] px-[6px]" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, boxShadow: `inset 0 0 0 1px rgb(${P.inkRgb} / 0.16)` }}>
        /
      </span>
    </button>
  );
}

// ------------------------------------------------------------------------------------------- asking, without moving time

/**
 * Something asked before deciding. What was asked last and its answer (earlier ones along a line of marks); where
 * nothing has been asked, what could be. An answer's suggestions can be written into the move; what it supposes of
 * others is said to be supposed.
 */
export function AskSheet({ play, onUse, onAsk, busy = false, asking }: { play: Play; onUse: (action: string) => void; /** Asked for real: the answer comes into what was asked, when it has been found. */ onAsk?: (text: string) => void; busy?: boolean; /** What is being asked now, with its answer as far as it has been written. */ asking?: { q: string; text: string; doing: string } | null }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const [at, setAt] = useState(Math.max(0, play.asks.length - 1));
  const [text, setText] = useState("");
  // (an answer that has just come is the one looked at)
  useEffect(() => setAt(Math.max(0, play.asks.length - 1)), [play.asks.length]);
  const send = () => {
    if (!text.trim() || busy || !onAsk) return;
    onAsk(text.trim());
    setText("");
  };
  const x = play.asks[at];
  const opts = play.situation?.recommendations ?? [];
  // (someone else whose stake is open: not you, and not the world itself, which is no one to ask about; the engine
  // names them in the project's language, so the Chinese "you" and "world" are matched too)
  const other = play.ledger.find((l) => l.active && !l.mine && l.owner !== "\u4f60" && !/^(world|\u4e16\u754c)$/i.test(l.owner.trim()));
  // (what could be asked first, in full: of the ways open, of whoever matters most now, and of the risk)
  const ideas = [...opts.slice(0, 2).map((o) => t("ideaIf", { move: o.title })), other ? t("ideaWho", { name: nick(other.owner) }) : "", t("ideaRisk"), t("ideaUnknown")].filter(Boolean);
  const blocks = (play.situation?.blocks ?? []).slice(0, 4);
  const label = { fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", color: P.faint } as const;
  return (
    <div className="px-10 pt-8 pb-6 text-left">
      <div className="flex items-baseline justify-between gap-6 pr-8">
        <Kick>{t("askFirst")}</Kick>
        <span className="text-[12px]" style={{ color: P.faint }}>
          {t("askNote")}
        </span>
      </div>
      <div className="mt-5 grid gap-9" style={{ gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)" }}>
        {/* what is asked and its answer; or, before anything is, what could be asked */}
        <div className="min-h-[300px]">
          {asking ? (
            <div>
              <div className="text-[18px] leading-[1.5] font-medium">{asking.q}</div>
              <div className="mt-1 text-[11.5px]" style={{ color: P.faint }}>
                {asking.doing || (asking.text ? t("puttingAnswer") : t("thinking"))}
              </div>
              <div className="mt-3 text-[14.5px] leading-[1.8] whitespace-pre-line" style={{ color: `rgb(${P.inkRgb} / 0.9)`, ...clampLines(11) }}>
                {asking.text}
              </div>
            </div>
          ) : x ? (
            <div key={at} style={{ animation: `flow-rise .5s ${SWIFT} both` }}>
              <div className="text-[18px] leading-[1.5] font-medium">{x.q}</div>
              {x.redirected && (
                <div className="mt-1 text-[11.5px]" style={{ color: P.faint }}>
                  {t("redirected")}
                </div>
              )}
              <div className="mt-3 text-[14.5px] leading-[1.8] whitespace-pre-line" style={{ color: `rgb(${P.inkRgb} / 0.9)`, ...clampLines(9) }}>
                {x.a}
              </div>
              {x.views.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  {x.views.slice(0, 3).map((v) => (
                    <div key={v.who} className="text-[13px] leading-[1.65]" style={{ color: P.mute, ...clampLines(2) }}>
                      {rich(t("guess", { who: nick(v.who), likely: v.likely }), { b: (s) => <span style={{ color: `rgb(${P.inkRgb} / 0.82)` }}>{s}</span> })}
                    </div>
                  ))}
                </div>
              )}
              {x.checks.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {x.checks.slice(0, 3).map((c) => (
                    <button key={c.title} type="button" title={c.action} onClick={() => onUse(c.action)} className="rounded-full px-3.5 py-[5px] text-[12.5px]" style={{ color: P.warm, boxShadow: `inset 0 0 0 1px rgb(${P.warmRgb} / 0.45)` }}>
                      {t("useInMove", { title: c.title })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[15px] leading-[1.8]" style={{ color: `rgb(${P.inkRgb} / 0.88)` }}>
                {t("askIntro")}
              </p>
              <div className="mt-5" style={label}>
                {t("couldAsk")}
              </div>
              <div className="mt-2 flex flex-col">
                {ideas.map((q) => (
                  <button key={q} type="button" onClick={() => setText(q)} className="group flex items-baseline gap-3 py-[10px] text-left text-[14px] leading-[1.6]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)`, color: `rgb(${P.inkRgb} / 0.86)` }}>
                    <span className="shrink-0 transition-transform duration-300 group-hover:translate-x-[2px]" style={{ color: P.faint }}>
                      →
                    </span>
                    <span className="transition-colors duration-300 group-hover:text-[rgb(var(--k-ink))]">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* what the counsel has at hand: how things stand, and what has been asked before */}
        <div className="min-w-0">
          <div style={label}>{t("whereThingsStand")}</div>
          <div className="mt-2 flex flex-col gap-3">
            {blocks.map((b) => (
              <div key={b.title}>
                <div className="text-[13px] font-medium" style={{ color: `rgb(${P.inkRgb} / 0.86)` }}>
                  {b.title}
                </div>
                <div className="mt-0.5 text-[12.5px] leading-[1.6]" style={{ color: P.mute, ...clampLines(2) }}>
                  {b.content}
                </div>
              </div>
            ))}
            {!blocks.length && (
              <div className="text-[12.5px]" style={{ color: P.faint }}>
                {t("noneYet")}
              </div>
            )}
          </div>
          {play.asks.length > 0 && (
            <>
              <div className="mt-6" style={label}>
                {t("askedBefore")} · {play.asks.length}
              </div>
              <div className="mt-2 flex flex-col">
                {play.asks.slice(-5).map((a) => {
                  const i = play.asks.indexOf(a);
                  return (
                    <button key={i} type="button" onClick={() => setAt(i)} className="py-[6px] text-left text-[12.5px] leading-[1.55]" style={{ color: i === at && !asking ? P.ink : P.mute, ...clampLines(1) }}>
                      {a.q}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-full py-[7px] pr-[7px] pl-6" style={{ boxShadow: `inset 0 0 0 1px rgb(${text ? P.warmRgb : P.inkRgb} / ${text ? 0.45 : 0.16})`, transition: "box-shadow .4s" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && send()} placeholder={busy ? t("advisorBusy") : t("askAdvisor")} autoFocus className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: P.ink }} />
        <button type="button" disabled={!text.trim() || busy} onClick={send} aria-label={t("send")} className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-opacity duration-300" style={{ background: P.warm, color: P.page, opacity: text.trim() ? 1 : 0.3 }}>
          <svg width="14" height="12" viewBox="0 0 16 14" fill="none">
            <path d="M1 7h13M9 1.5L14.5 7 9 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** What the engine set down of how this step was handled, and what is still owed: a line each. */
export function NotesSheet({ play }: { play: Play }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const notes = play.notices ?? [];
  return (
    <div className="px-10 pt-8 pb-8">
      <div className="text-center">
        <Kick>
          {t("notes")} · {notes.length}
        </Kick>
      </div>
      <div className="mt-5 flex flex-col">
        {notes.slice(0, 8).map((x) => (
          <div key={x} className="py-[9px] text-[14px] leading-[1.65]" style={{ color: `rgb(${P.inkRgb} / 0.88)`, boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
            {x}
          </div>
        ))}
        {!notes.length && (
          <div className="py-6 text-center text-[13.5px]" style={{ color: P.mute }}>
            {t("nothingToNote")}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- say it more plainly

/**
 * What you wrote could not be carried out as it stands: what is asked of you, and your words back, all of them, to be
 * put right where they are. Read from the left, as a page is: what was asked, then your words with the part asked
 * about lit where it stands (the words in quotation marks in what is asked), then what happens once it is said.
 */
export function ClarifySheet({ play, note, said, onAct }: { play: Play; note: string; said: string; onAct: (text: string) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const [text, setText] = useState(said);
  const box = useRef<HTMLTextAreaElement>(null);
  // (the words asked about: what is quoted in what is asked, where it is in your words; quoted in curly or straight
  // quotation marks, or in Chinese corner brackets, single or double)
  const asked = useMemo(() => [...note.matchAll(/[“"\u300c\u300e]([^”"\u300d\u300f]{1,40})[”"\u300d\u300f]/g)].map((m) => m[1]!.trim()).filter((q) => q && text.includes(q)), [note, text]);
  // (the box is as tall as what is in it: nothing of your words is hidden behind a scroll)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const lit = (() => {
    if (!asked.length) return [text];
    const re = new RegExp(`(${asked.map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return text.split(re);
  })();
  const type = { fontSize: 15, lineHeight: 1.8, letterSpacing: "0.01em" } as const;
  return (
    <div className="px-10 pt-8 pb-7 text-left">
      <Kick>
        {t("clarifyKick", { date: play.branch.simTime, step: play.branch.step })}
      </Kick>
      <div className="mt-4 flex items-start gap-3">
        <span className="mt-[11px] size-[6px] shrink-0 rounded-full" style={{ background: P.warm, boxShadow: `0 0 10px rgb(${P.warmRgb} / 0.7)` }} />
        <div className="min-w-0">
          <h2 className="text-[21px] leading-[1.5] font-medium">{note}</h2>
          <p className="mt-1.5 text-[13px] leading-[1.7]" style={{ color: P.mute }}>
            {t("clarifyWhy")}
          </p>
        </div>
      </div>
      <div className="mt-6 flex items-baseline justify-between" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", color: P.faint }}>
        <span>{asked.length ? t("yourMoveLit") : t("yourMove")}</span>
        <span>{t("chars", { count: text.trim().length })}</span>
      </div>
      {/* your words, all of them; the part asked about lit behind the words where it stands */}
      <div className="relative mt-2 max-h-[46vh] overflow-y-auto rounded-[16px]" style={{ boxShadow: `inset 0 0 0 1px rgb(${P.inkRgb} / 0.16)`, background: `rgb(${P.inkRgb} / 0.03)` }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 px-5 py-4 break-words whitespace-pre-wrap" style={{ ...type, color: "transparent" }}>
          {lit.map((part, i) =>
            asked.includes(part) ? (
              <mark key={i} className="rounded-[4px]" style={{ color: "transparent", background: `rgb(${P.warmRgb} / 0.26)`, boxShadow: `0 0 0 2px rgb(${P.warmRgb} / 0.26)` }}>
                {part}
              </mark>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </div>
        <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={1} spellCheck={false} className="relative block w-full resize-none overflow-hidden bg-transparent px-5 py-4 break-words whitespace-pre-wrap outline-none" style={{ ...type, color: P.ink }} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-6">
        <span className="text-[12.5px] leading-[1.6]" style={{ color: P.faint }}>
          {t("clarifyAfter")}
        </span>
        <Go onClick={() => onAct(text.trim())} off={!text.trim()}>
          {t("doThis")}
        </Go>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- face to face

/** Talks face to face are no longer a thing of their own (a talk is a step like any other): nothing to show. Kept only because flow.tsx, which may not be edited here, still mounts it. */
export function MeetingSheet(_: { m: DesignMeeting | null; world: WorldView; onDone: () => void; onSay?: (text: string) => void; onLeave?: (skip: boolean) => void; busy?: boolean }) {
  return null;
}

// ------------------------------------------------------------------------------------------- the lines of time, and leaving one for another

/**
 * Every line of time of this play, and going back to a decision to take it another way. The lines, a line each:
 * which it is, how far it has got, its report if it has one. Under them, the decisions of the line you are on: one
 * is picked to go back to; then how the new line is to run, freely or under the same outside conditions so that
 * the two can be compared.
 */
export function LinesSheet({ play, onGo, onFork }: { play: Play; onGo: (branch: string) => void; onFork?: (step: number, mode: "free" | "matched") => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const done = play.decisions.filter((d) => d.restatement && d.step >= (play.branch.forkStep ?? 1));
  const [step, setStep] = useState<number | null>(null);
  const [mode, setMode] = useState<"free" | "matched">("free");
  const sel = done.find((d) => d.step === step) ?? null;
  const from = play.branch.externalHistoryFrom;
  const can = !!sel && !!from && sel.simTime >= from && sel.simTime < play.branch.simTime;
  // (a timeline's label as the engine writes it: "step N changed to: …" in Chinese, shown as where it went another way)
  const name = (l: string) => l.replace(/^\u7b2c (\d+) \u6b65\u6539\u4e3a\uff1a/, (_, n: string) => t("forkedFrom", { step: n }));
  const pg = usePages(done, 4);
  return (
    <div className="px-10 pt-8 pb-7">
      <div className="text-center">
        <Kick>
          {t("timelinesHead")} · {play.branches.length}
        </Kick>
      </div>
      <div className="mt-4 flex flex-col">
        {play.branches.slice(0, 4).map((b) => {
          const on = b.id === play.branch.id;
          return (
            <button key={b.id} type="button" disabled={on} onClick={() => onGo(b.id)} className="flex items-baseline gap-4 py-[9px] text-left" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
              <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: on ? P.warm : P.ink }}>
                {name(b.label)}
              </span>
              {b.reports.length > 0 && (
                <span className="text-[12px]" style={{ color: P.mute }}>
                  {t("report")}
                </span>
              )}
              <span style={{ fontFamily: MONO, fontSize: 11, color: P.mute }}>{b.ended ? t("settled") : t("stepAt", { step: b.step, date: b.simTime })}</span>
            </button>
          );
        })}
      </div>
      {/* (a timeline run under the same conditions as another; plays from before the flag say so only by the Chinese start of their label) */}
      {play.branches.some((b) => b.comparison || b.label.startsWith("\u540c\u6761\u4ef6")) && (
        <p className="mt-3 text-[12px]" style={{ color: P.mute }}>
          {t("matchedNote")}
        </p>
      )}
      <div className="mt-6">
        <Head>
          {t("chooseAgain")}
          {done.length ? ` · ${done.length}` : ""}
        </Head>
        {!done.length && (
          <div className="mt-3 text-[13px]" style={{ color: P.mute }}>
            {t("noDecisions")}
          </div>
        )}
        <div key={pg.at} className="mt-1.5 flex flex-col" style={{ animation: `flow-rise .45s ${SWIFT} both` }}>
          {pg.rows.map((d) => {
            const on = d.step === step;
            return (
              <button key={d.step} type="button" onClick={() => setStep(on ? null : d.step)} className="flex items-baseline gap-3 rounded-[12px] px-3 py-[8px] text-left transition-colors duration-200" style={{ background: on ? `rgb(${P.inkRgb} / 0.055)` : "transparent", marginLeft: -12, marginRight: -12 }}>
                <span className="h-[15px] w-[15px] shrink-0 translate-y-[2px] rounded-full" style={{ background: on ? P.warm : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1.5px rgb(${P.inkRgb} / 0.32)` }} />
                <span className="w-[104px] shrink-0 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 11, color: P.mute }}>
                  {t("stepAt", { step: d.step, date: d.simTime.slice(5) })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{d.headline}</span>
                  <span className="mt-[2px] block truncate text-[12px]" style={{ color: P.mute }}>
                    {t("chosenThen", { text: d.restatement ?? "" })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-center">
          <Pager at={pg.at} pages={pg.pages} setPage={pg.setPage} />
        </div>
      </div>
      <div className="overflow-hidden" style={{ maxHeight: sel ? 150 : 0, opacity: sel ? 1 : 0, transition: `max-height .55s ${SWIFT}, opacity .45s ease` }}>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(
            [
              ["free", t("free"), t("freeText"), true],
              ["matched", t("matched"), can ? (play.narrated ? t("matchedNarrated") : t("matchedText", { date: play.branch.simTime })) : sel && sel.simTime === play.branch.simTime ? t("matchedLater") : t("matchedMissing"), can],
            ] as [typeof mode, string, string, boolean][]
          ).map(([k, title, text, ok]) => (
            <button key={k} type="button" disabled={!ok} onClick={() => setMode(k)} className="rounded-[14px] px-4 py-3 text-left transition-opacity duration-300" style={{ boxShadow: `inset 0 0 0 1px rgb(${mode === k && ok ? P.warmRgb : P.inkRgb} / ${mode === k && ok ? 0.5 : 0.13})`, opacity: ok ? 1 : 0.45 }}>
              <span className="block text-[14px]">{title}</span>
              <span className="mt-1 block text-[12px] leading-[1.55]" style={{ color: P.mute }}>
                {text}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Go onClick={() => step != null && onFork?.(step, mode === "matched" && can ? "matched" : "free")}>
            {mode === "matched" && can ? t("forkMatched", { step: step ?? "" }) : t("forkFree", { step: step ?? "" })}
          </Go>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- what you are after

/** What you are after, as you put it, and what you have laid down for good. */
export function ArcSheet({ play }: { play: Play }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const locale = useLocale();
  return (
    <div className="px-10 pt-8 pb-8">
      <div className="text-center">
        <Kick>{t("goal")}</Kick>
        <h2 className="mt-3 text-[22px] leading-[1.5] font-medium" style={clampLines(2)}>
          {play.goal?.text ?? t("noGoal")}
        </h2>
      </div>
      <div className="mt-5">
        {/* (engine 12 keeps no standing intentions of its own: what is listed is what was asked for in the box beside the story, in the words it was said) */}
        <Head>
          {play.narrated ? t("askedInChat") : t("policy")}
          {play.policy.length ? ` · ${play.policy.length}` : ""}
        </Head>
        {play.policy.length ? (
          play.policy.slice(0, 4).map((p) => (
            <div key={p.id} className="mt-2 flex items-baseline gap-3 text-[13.5px] leading-[1.6]">
              <span className="shrink-0" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>
                {md(locale, p.since)}
              </span>
              <span style={clampLines(2)}>{p.text}</span>
            </div>
          ))
        ) : (
          <div className="mt-2 text-[13px] leading-[1.7]" style={{ color: P.mute }}>
            {play.narrated ? t("noPolicyChat") : t("noPolicy")}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- what is known, and what is hidden

type Intel = Play["intel"][number];

/**
 * What you know and what is under the fog. Along the top, how much of it you know and the kinds there are; on the
 * left, a page of it at a time, a line each, the hidden ones as a bar of fog with only their day; on the right the
 * one that is picked, in full, with where it came from; of a hidden one, only that it happened and who knows.
 */
export function IntelSheet({ play, world }: { play: Play; world: WorldView }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const lanes = useMemo(() => [...new Set(play.intel.map((i) => i.lane))], [play.intel]);
  const [lane, setLane] = useState<string | null>(null);
  const [show, setShow] = useState<"known" | "all">("known");
  const list = useMemo(() => play.intel.filter((i) => (!lane || i.lane === lane) && (show === "all" || i.status !== "hidden")).sort((a, b) => b.date.localeCompare(a.date)), [play.intel, lane, show]);
  const pg = usePages(list, 8);
  const [pick, setPick] = useState<string | null>(null);
  const x: Intel | undefined = list.find((i) => i.id === pick) ?? pg.rows[0];
  const known = play.intel.filter((i) => i.status !== "hidden").length;
  const names = new Map(world.graph.nodes.map((n) => [n.id, n.name]));
  return (
    <div className="px-10 pt-8 pb-6">
      <div className="text-center">
        <Kick>
          {t("intelKick", { known, total: play.intel.length, date: play.branch.simTime })}
        </Kick>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12.5px]">
        {[null, ...lanes.slice(0, 7)].map((l) => (
          <button key={l ?? "all"} type="button" onClick={() => (setLane(l), pg.setPage(0), setPick(null))} className="transition-colors duration-300" style={{ color: lane === l ? P.ink : P.faint }}>
            {l ?? t("all")}
          </button>
        ))}
        <span className="h-3 w-px" style={{ background: `rgb(${P.inkRgb} / 0.16)` }} />
        <button type="button" onClick={() => (setShow(show === "all" ? "known" : "all"), pg.setPage(0), setPick(null))} style={{ color: show === "all" ? P.ink : P.faint }}>
          {t("withFog")}
        </button>
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] gap-x-9">
        <div>
          <div key={`${lane}${show}${pg.at}`} className="flex h-[296px] flex-col" style={{ animation: `flow-rise .45s ${SWIFT} both` }}>
            {pg.rows.map((i) => {
              const on = i.id === x?.id;
              return (
                <button key={i.id} type="button" onClick={() => setPick(i.id)} className="flex h-[37px] items-center gap-3 rounded-[10px] px-3 text-left transition-colors duration-200" style={{ background: on ? `rgb(${P.inkRgb} / 0.055)` : "transparent", marginLeft: -12 }}>
                  <span className="w-[78px] shrink-0 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>
                    {i.date.slice(0, 10)}
                  </span>
                  {i.status === "hidden" ? (
                    <span className="h-[7px] flex-1 rounded-full" style={{ background: `repeating-linear-gradient(90deg, rgb(${P.inkRgb} / 0.2) 0 5px, transparent 5px 9px)` }} />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: i.status === "acquired" ? P.warm : on ? P.ink : `rgb(${P.inkRgb} / 0.8)` }}>
                      {i.text}
                    </span>
                  )}
                </button>
              );
            })}
            {!list.length && (
              <div className="py-6 text-[13px]" style={{ color: P.mute }}>
                {t("noIntel")}
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-center">
            <Pager at={pg.at} pages={pg.pages} setPage={(n) => (pg.setPage(n), setPick(null))} />
          </div>
        </div>
        <div className="min-w-0 pl-8" style={{ boxShadow: `inset 1px 0 0 rgb(${P.inkRgb} / 0.08)` }}>
          {x && (
            <div key={x.id} style={{ animation: `flow-rise .45s ${SWIFT} both` }}>
              <Kick>
                {t(`status.${x.status}`)} · {x.lane}
              </Kick>
              {x.status === "hidden" ? (
                <>
                  <p className="mt-3 text-[15px] leading-[1.7]">{t("hiddenHappened", { date: x.date.slice(0, 10) })}</p>
                  <p className="mt-3 text-[13px] leading-[1.7]" style={{ color: P.mute }}>
                    {x.knownBy.length ? t("knownBy", { names: x.knownBy.map((id) => nick(names.get(id) ?? t("someone"))).join(t("listSep")) }) : t("noOneSpoke")}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-[15px] leading-[1.7]" style={clampLines(5)}>
                    {x.text}
                  </p>
                  {x.quote && (
                    <p className="mt-3 text-[13px] leading-[1.7]" style={{ color: P.mute, ...clampLines(3) }}>
                      “{x.quote}”
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-[6px] text-[12.5px]">
                    {(
                      [
                        [t("field.date"), x.date.slice(0, 10)],
                        // (engine 12's notes are what the protagonist knows, not told apart as public or inside: no line for it)
                        [t("field.kind"), play.narrated ? "" : x.insider ? (x.published ? t("insiderPublished", { date: x.published }) : t("insiderNever")) : t("public")],
                        [t("field.involves"), x.people.slice(0, 4).map((id) => nick(names.get(id) ?? id)).join(t("listSep"))],
                        [t("field.source"), x.source?.host ?? t("noSingleSource")],
                      ] as [string, string][]
                    )
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className="flex items-baseline gap-4">
                          <span className="w-[48px] shrink-0" style={{ color: P.faint }}>
                            {k}
                          </span>
                          <span className="min-w-0 flex-1 truncate" style={{ color: P.mute }}>
                            {v}
                          </span>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- how the world moves

/**
 * What this world is: the protagonist's numbers, whose place you are in, when, where, how complete it is.
 */
export function WorldSheet({ play, world }: { play: Play; world: WorldView }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const locale = useLocale();
  const c = world.completeness;
  return (
    <div className="px-10 pt-8 pb-7">
      <div className="text-center">
        <Kick>
          {t("world")} · {world.scope ? `${world.scope.region} · ${world.scope.domain}` : world.title}
        </Kick>
        <p className="mx-auto mt-3 max-w-[640px] text-[13.5px] leading-[1.7]" style={{ color: `rgb(${P.inkRgb} / 0.86)`, ...clampLines(3) }}>
          {world.scope?.summary}
        </p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-10">
        <div className="min-w-0">
          <Head>
            {t("numbers")} · {numsOf(play, locale).length}
          </Head>
          <div className="mt-2 mb-4 flex flex-col gap-[5px] text-[12.5px]">
            {numsOf(play, locale)
              .slice(0, 8)
              .map((n) => (
                <div key={n.m.key} className="flex items-baseline gap-3" title={n.m.description ?? ""}>
                  <span className="min-w-0 flex-1 truncate" style={{ color: P.mute }}>
                    {n.m.label}
                  </span>
                  <span style={{ fontFamily: MONO, color: n.bad ? P.warm : P.ink }}>
                    {n.value}
                    {n.unit ? ` ${n.unit}` : ""}
                  </span>
                  <span className="w-[54px] text-right" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>
                    {n.d ?? ""}
                  </span>
                </div>
              ))}
          </div>
          <Head>{t("thisWorld")}</Head>
          <div className="mt-2 flex flex-col gap-[6px] text-[12.5px]">
            {(
              [
                [t("field.you"), world.scope ? `${world.scope.protagonist.name} · ${world.scope.protagonist.role}` : ""],
                [t("field.start"), world.scope?.timeStart ?? ""],
                [t("field.now"), play.branch.simTime],
                // (engine 12 counts the lines of its notes, and keeps no ties of their own)
                [t("field.known"), [t("entities", { count: world.counts.entities }), play.narrated ? t("notesCount", { count: world.counts.facts }) : t("facts", { count: world.counts.facts }), ...(!play.narrated || world.counts.edges ? [t("ties", { count: world.counts.edges })] : [])].join(" · ")],
                [t("field.cost"), usd(play.world.spentUsd)],
              ] as [string, string][]
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-4">
                  <span className="w-[36px] shrink-0" style={{ color: P.faint }}>
                    {k}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: P.mute }}>
                    {v}
                  </span>
                </div>
              ))}
          </div>
          {c && (
            <div className="mt-4">
              <Head>
                {t("completeness")} · {pct(c.overall)}
              </Head>
              {c.questions.slice(0, 2).map((q) => (
                <div key={q.question} className="mt-[8px]" title={q.note}>
                  <div className="flex items-baseline justify-between gap-3 text-[12px]">
                    <span className="min-w-0 flex-1 truncate" style={{ color: P.mute }}>
                      {q.question}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>{pct(q.coverage)}</span>
                  </div>
                  <div className="mt-[4px] h-px" style={{ background: `rgb(${P.inkRgb} / 0.13)` }}>
                    <div className="h-px" style={{ width: `${Math.min(1, q.coverage) * 100}%`, background: `rgb(${P.inkRgb} / 0.6)` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- the end; a play that is over

/** Nothing reaches a goal any more (what you are after is an item like any other): nothing to show. Kept only because flow.tsx, which may not be edited here, still mounts it. */
export function GoalSheet(_: { play: Play; world: WorldView; onEnd: () => void; onContinue: (goal: string) => void }) {
  return null;
}

/** Ending a play here: what the report will say, and that the line stops but can still be left from any step. */
export function EndSheet({ world, onEnd, onClose }: { world: WorldView; onEnd: () => void; onClose: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  return (
    <div className="px-10 pt-8 pb-7 text-center">
      <Kick>{t("endPlay")}</Kick>
      <h2 className="mt-3 text-[24px] leading-[1.5] font-medium">{t("endHere")}</h2>
      <p className="mx-auto mt-4 max-w-[540px] text-[14px] leading-[1.8]" style={{ color: `rgb(${P.inkRgb} / 0.86)` }}>
        {world.forward ? t("endBodyForecast") : t("endBodyHistory")}
      </p>
      <div className="mt-6 flex items-center justify-center gap-4">
        <Go quiet onClick={onClose}>
          {t("keepPlaying")}
        </Go>
        <Go onClick={onEnd}>{t("endAndReview")}</Go>
      </div>
      <p className="mt-4 text-[11.5px]" style={{ color: P.faint }}>
        {t("reviewTakes")}
      </p>
    </div>
  );
}

/** A play that is over: how it ended, what moved since it opened, and your decisions, any of which can be gone back to. */
export function EndedSheet({ play, onReport, onFork }: { play: Play; onReport: () => void; onFork: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  const locale = useLocale();
  const nums = numsOf(play, locale).filter((n) => n.d);
  const done = play.decisions.filter((d) => d.restatement);
  const pg = usePages(done, 4);
  // (an ending's kind, as the engine prefixes it, is dropped with its colon, full-width or plain)
  const why = (play.branch.ended?.reason ?? t("youEnded")).replace(/^ending_\w+[\uff1a:]/, "");
  return (
    <div className="px-10 pt-8 pb-7">
      <div className="text-center">
        <Kick>
          {t("playEnded")} · {play.branch.ended?.at ?? play.branch.simTime}
        </Kick>
        <h2 className="mt-3 text-[24px] leading-[1.5] font-medium" style={clampLines(2)}>
          {why}
        </h2>
        {nums.length > 0 && (
          <div className="mt-4 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2">
            {nums.slice(0, 4).map((n) => (
              <span key={n.m.key} className="flex items-baseline gap-2 text-[12.5px]" style={{ color: P.mute }}>
                {n.m.label}
                <span className="text-[17px]" style={{ fontFamily: MONO, color: n.bad ? P.warm : P.ink }}>
                  {n.now}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11 }}>{n.d}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6">
        <Head>{t("yourChoices")}</Head>
        <div key={pg.at} className="mt-1.5 flex flex-col">
          {pg.rows.map((d) => (
            <button key={d.step} type="button" onClick={onFork} className="flex items-baseline gap-4 py-[8px] text-left" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
              <span className="w-[60px] shrink-0" style={{ fontFamily: MONO, fontSize: 11, color: P.mute }}>
                {md(locale, d.simTime)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{d.restatement}</span>
              <span className="shrink-0 text-[12px]" style={{ color: P.mute }}>
                {t("goBackHere")}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Pager at={pg.at} pages={pg.pages} setPage={pg.setPage} />
        <Go onClick={onReport}>{play.branch.reports.length ? t("seeReview") : t("writeReview")}</Go>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- still being made; gone wrong

/**
 * Where you stand is still being written (the opening, or after something was interrupted): that it is, how long it
 * has been, and what is being read for it, a line at a time. How much longer is not known and is not drawn.
 */
export function ReadingSheet({ play, world, speed }: { play: Play; world: WorldView; speed: number }) {
  const { P } = useApp();
  const tr = useT("flow-lab.sheets");
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 0.25 * speed), 250);
    return () => window.clearInterval(id);
  }, [speed]);
  const lines = useMemo(() => {
    const people = world.graph.nodes.filter((n) => n.id !== world.seatId).slice(0, 14).map((n) => tr("standsAndIntends", { name: nick(n.name) }));
    const intel = play.intel.filter((i) => i.status !== "hidden").slice(0, 14).map((i) => (i as { text: string }).text);
    return people.flatMap((p, i) => (intel[i] ? [p, intel[i]!] : [p]));
  }, [world, play.intel, tr]);
  const k = lines.length ? Math.floor(t / 1.6) % lines.length : 0;
  return (
    <div className="px-10 py-10 text-center">
      <Kick>
        {tr("decisionKick", { date: play.branch.simTime, step: play.branch.step })}
      </Kick>
      <h2 className="mt-4 text-[22px] font-medium">{tr("writingSituation")}</h2>
      <p className="mt-3 text-[13px]" style={{ color: P.mute }}>
        {rich(tr("readingLine", { time: clock(t), people: tr("peopleCount", { count: world.graph.nodes.length }), intel: tr("findingsCount", { count: play.intel.filter((i) => i.status !== "hidden").length }) }), { c: (s) => <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{s}</span> })}
      </p>
      <div className="relative mx-auto mt-6 h-[22px] max-w-[560px] overflow-hidden">
        <div key={k} className="truncate text-[13.5px]" style={{ color: `rgb(${P.inkRgb} / 0.86)`, animation: `flow-rise .5s ${SWIFT} both` }}>
          {lines[k] ?? ""}
        </div>
      </div>
    </div>
  );
}

/** Something went wrong in a step: what, in its own words; the step was not taken, and where you stood is where you stand. */
export function TroubleSheet({ play, onClose, said }: { play: Play; onClose: () => void; /** What went wrong, in its own words. */ said?: string }) {
  const { P } = useApp();
  const t = useT("flow-lab.sheets");
  return (
    <div className="px-10 pt-8 pb-7 text-center">
      <Kick warm>{t("somethingWrong")}</Kick>
      <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.75]">{said || t("stepUnfinished")}</p>
      <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-[1.7]" style={{ color: P.mute }}>
        {t("notCounted", { date: play.branch.simTime })}
      </p>
      <div className="mt-6 flex items-center justify-center gap-6">
        <Go onClick={onClose}>{t("ok")}</Go>
      </div>
    </div>
  );
}
