"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectCard } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { rich, useLocale, useT } from "@/lib/i18n/client";
import { A, BASE, useApp } from "@/components/product/shell";
import { projectHref, useProjectLine } from "@/components/product/projects";
import { RUNNING, needsYou, useTyping, type HomeData } from "@/components/product/start/shared";
import { cut } from "./play";
import { SideList, type Item } from "./scenes";

/**
 * The words of the flow, set three other ways (/design/matter, beside the way they are). Everything else is the
 * same: the picture, the steps, what is said. What changes is how much is said and where it is put.
 *
 * The same rules hold in all three: one thing said per screen, in as few words as it takes, and nothing that only
 * explains; what state something is in is a word or two; numbers are in the fixed-width face and are not dressed
 * as sentences; nothing that is not pressed has a plate behind it; warm is for the one thing to act on.
 *
 * - 1 · the axis: everything on one line down the middle of the page. Who and what at the top, what to do in the
 *   middle, where things stand at the foot. The corners are empty.
 * - 2 · the column: everything flush to one margin on the left, as a page of a book is; the picture has the rest.
 * - 3 · the bands: a line across the top and a line across the foot hold every word; between them is the picture.
 */
export const LAYS = [
  { name: "Now", say: "The layout as it is now" },
  { name: "Axis", say: "All the words on one vertical line down the middle of the page; the four corners are empty" },
  { name: "Column", say: "All the words set flush to one line on the left, like a book page; the rest is the picture's" },
  { name: "Bands", say: "Words only in a line at the top and a line at the foot; everything between is picture" },
];

const BAR = 54;
const SWIFT = "cubic-bezier(.2,.7,.2,1)";
const LEFT = 72;
type Phrase = [string, number, number];

function Arrow() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
      <path d="M1 7h13M9 1.5L14.5 7 9 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ------------------------------------------------------------------------------------------- home

/**
 * Where what is being thought of is written. Nothing is said there. As it is (`kind` 0): nothing on the page but
 * light and type, no box; written just under where the light gathers as you write (the picture's own doing, see
 * flow.tsx), one thing someone might write there, faint, until something is.
 *
 * In the product (1): an ordinary box to write in, in the middle of the page, and nothing drawn round it. It has
 * weight (flow.tsx, stage.ts): the sky sinks toward it from the first; more when it is gone to, when its edge also
 * lights; and more with each thing written. Begun, it falls away into the picture. One line is said
 * over it: what this is, and the same in English under it, small.
 */
function Bare({ kind = 0, q, setQ, start, onHold, leaving = false }: { leaving?: boolean; onHold?: (on: boolean) => void; kind?: number; q: string; setQ: (s: string) => void; start: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const locale = useLocale();
  const on = !!q.trim();
  const [focus, setFocus] = useState(false);
  const shade = `0 0 26px ${P.page}, 0 0 10px ${P.page}, 0 0 3px ${P.page}`;
  const input = (style: React.CSSProperties, cls = "") => (
    <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && start()} onFocus={() => (setFocus(true), onHold?.(true))} onBlur={() => (setFocus(false), onHold?.(false))} placeholder={t("example")} autoFocus={kind === 0} spellCheck={false} className={`k-bare pointer-events-auto bg-transparent outline-none ${cls}`} style={{ color: P.ink, caretColor: P.warm, ...style }} />
  );
  if (kind === 0)
    return (
      <div className="flow-rise pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: `calc((100% - ${BAR}px) * 0.61 + 16px)`, animationDelay: ".12s" }}>
        {input({ fontSize: 30, lineHeight: "44px", fontWeight: 300, letterSpacing: "0.02em", width: "min(860px, 84vw)", textShadow: shade }, "relative text-center")}
        <button type="button" onClick={start} aria-label={t("start")} className="pointer-events-auto relative mt-4 shrink-0 text-[17px] leading-none transition-opacity duration-700" style={{ color: P.warm, opacity: on ? 1 : 0, pointerEvents: on ? "auto" : "none" }}>
          ↵
        </button>
      </div>
    );
  const H = 62;
  const lit = focus || on;
  const slow = `1s ${SWIFT}`;
  return (
    <div key={kind} className="flow-rise pointer-events-none absolute inset-x-0 flex justify-center px-6" style={{ top: `calc((100% - ${BAR}px) * 0.5 - ${H / 2}px)` }}>
      {/* (begun: it falls away into the picture it stands on, smaller and out of focus, and is gone) */}
      <div className="relative" style={{ width: "min(640px, 86vw)", height: H, opacity: leaving ? 0 : 1, transform: leaving ? "scale(0.72)" : "none", filter: leaving ? "blur(7px)" : "none", pointerEvents: leaving ? "none" : undefined, transition: "opacity .7s ease-in, transform .9s cubic-bezier(.5,0,.9,.4), filter .9s ease-in" }}>
        {/* (what this is, in one line, and the same in the other language under it, small) */}
        <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center whitespace-nowrap" style={{ bottom: "100%", marginBottom: 34, textShadow: shade }}>
          <div style={{ fontSize: 27, lineHeight: 1.3, fontWeight: 300, letterSpacing: "0.24em", marginRight: "-0.24em", color: P.ink }}>{t("tagline")}</div>
          {!locale.startsWith("en") && <div className="mt-4" style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.46em", marginRight: "-0.46em", color: P.mute }}>MORE THAN ONE FUTURE</div>}
        </div>
        <label className="pointer-events-auto absolute inset-0 flex items-center gap-3 rounded-full pr-[9px] pl-8" style={{ background: `rgb(${P.pageRgb} / ${lit ? 0.62 : 0.5})`, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: lit ? `inset 0 0 0 1px rgb(${P.warmRgb} / 0.55), 0 0 22px rgb(${P.warmRgb} / 0.22), 0 0 90px rgb(${P.warmRgb} / 0.14)` : `inset 0 0 0 1px rgb(${P.inkRgb} / 0.2), 0 0 0 rgb(${P.warmRgb} / 0), 0 0 0 rgb(${P.warmRgb} / 0)`, transition: `box-shadow ${slow}, background ${slow}` }}>
          {input({ fontSize: 17, fontWeight: 400, letterSpacing: "0.01em" }, "min-w-0 flex-1")}
          <button type="button" onClick={start} disabled={!on} aria-label={t("start")} className="flex shrink-0 items-center justify-center rounded-full" style={{ width: H - 18, height: H - 18, color: on ? P.page : P.mute, background: on ? P.warm : `rgb(${P.inkRgb} / 0.06)`, transition: "background .6s ease, color .6s ease" }}>
            <Arrow />
          </button>
        </label>
      </div>
    </div>
  );
}

export function HomeWords({ v, scene = 0, q, setQ, onStart, canStart, home, phrases, ask = 0, onHold, leaving = false }: { /** What was written has been begun: everything here goes, into the picture. */ leaving?: boolean; /** Told when where it is written is gone to and left. */ onHold?: (on: boolean) => void; /** What is said over where it is written, where that is being compared (see Bare). */ ask?: number; v: number; /** On the axis: how the whole flow is done (see scenes.tsx). */ scene?: number; q: string; setQ: (s: string) => void; onStart: () => void; canStart: boolean; home: HomeData; phrases: Phrase[] }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const typing = useTyping(phrases.map((p) => p[0]), !q);
  const start = () => q.trim() && canStart && onStart();
  const field = (w: string, h = 60) => (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full pr-[9px] pl-7" style={{ width: w, height: h, background: `rgb(${P.pageRgb} / 0.72)`, boxShadow: `0 24px 70px rgb(0 0 0 / 0.38), inset 0 0 0 1px rgb(${q ? P.warmRgb : P.inkRgb} / ${q ? 0.45 : 0.16})`, backdropFilter: "blur(16px)", transition: "box-shadow .5s" }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && start()} placeholder={typing} autoFocus className="min-w-0 flex-1 bg-transparent text-[16.5px] outline-none" style={{ color: P.ink }} />
      <button type="button" onClick={start} disabled={!q.trim()} aria-label={t("start")} className="flex shrink-0 items-center justify-center rounded-full transition-opacity duration-500" style={{ width: h - 18, height: h - 18, background: P.warm, color: P.page, opacity: q.trim() ? 1 : 0.3 }}>
        <Arrow />
      </button>
    </div>
  );
  // (one thing is done from here; how, in two words, once something is written)
  const hint = (cls: string, _side?: "left" | "right") => (
    <div className={`flex h-5 items-center text-[12px] ${cls}`}>
      <span className="transition-opacity duration-500" style={{ color: P.warm, opacity: q.trim() ? 1 : 0 }}>
        {t("pressEnter")}
      </span>
    </div>
  );
  // (the name is at the top left of every page; here only its place is kept, so nothing under it moves)
  const brand = <div className="h-4" aria-hidden />;
  return (
    <>
      {v === 1 && scene !== 3 && (
        <>
          <Bare kind={ask} leaving={leaving} onHold={onHold} q={q} setQ={setQ} start={start} />
          <div className="pointer-events-none absolute inset-x-0 top-[13%] flex flex-col items-center px-6 text-center">
            {brand}
            {/* (the record: the worlds you were last in, a line each, under where the next is written) */}
            {scene === 2 && (
              <div className="flow-rise pointer-events-auto mt-12 w-[min(520px,88vw)] text-left" style={{ animationDelay: ".32s" }}>
                <RecentList home={home} />
              </div>
            )}
          </div>
          {scene === 0 && (
            <div className="absolute inset-x-0 flex justify-center px-10" style={{ bottom: BAR + 26, opacity: leaving ? 0 : 1, transition: "opacity .6s ease" }}>
              <div className="flow-rise" style={{ animationDelay: ".32s" }}>
                <RecentLine home={home} />
              </div>
            </div>
          )}
          {/* (the roll: the worlds you were last in, down the right) */}
          {scene === 1 && (
            <div className="flow-rise pointer-events-auto absolute right-9 w-[300px]" style={{ top: "20%", animationDelay: ".32s" }}>
              <RecentList home={home} />
            </div>
          )}
        </>
      )}

      {/* (the caption: the sky has the page; the question and where to write are under it) */}
      {v === 1 && scene === 3 && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-7 flex justify-center">{brand}</div>
          <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6 text-center" style={{ bottom: BAR + 30 }}>
            <h1 className="flow-rise text-[30px] leading-none font-medium tracking-tight" style={{ animationDelay: ".08s" }}>
              {t("whatMatter")}
            </h1>
            <div className="flow-rise mt-7" style={{ animationDelay: ".16s" }}>
              {field("min(680px, 88vw)")}
            </div>
            <div className="flow-rise mt-4" style={{ animationDelay: ".24s" }}>
              {hint("justify-center")}
            </div>
            <div className="flow-rise mt-6" style={{ animationDelay: ".32s" }}>
              <RecentLine home={home} bare />
            </div>
          </div>
        </>
      )}

      {v === 2 && (
        <div className="pointer-events-none absolute flex flex-col" style={{ left: LEFT, top: "17%", width: "min(580px, 46vw)" }}>
          {brand}
          <h1 className="flow-rise mt-6 text-[40px] leading-none font-medium tracking-tight" style={{ animationDelay: ".08s" }}>
            {t("whatMatter")}
          </h1>
          <div className="flow-rise mt-9" style={{ animationDelay: ".16s" }}>
            {field("100%")}
          </div>
          <div className="flow-rise mt-4 pl-7" style={{ animationDelay: ".24s" }}>
            {hint("")}
          </div>
          <div className="flow-rise pointer-events-auto mt-14 w-[min(440px,100%)]" style={{ animationDelay: ".32s" }}>
            <RecentList home={home} />
          </div>
        </div>
      )}

      {v === 3 && (
        <>
          <div className="pointer-events-none absolute top-7 right-9 left-9 flex items-baseline justify-between">
            {brand}
            <div className="flow-rise pointer-events-auto" style={{ animationDelay: ".1s" }}>
              <RecentCount home={home} />
            </div>
          </div>
          <h1 className="flow-rise pointer-events-none absolute inset-x-0 top-[36%] text-center text-[44px] leading-none font-medium tracking-tight" style={{ animationDelay: ".08s" }}>
            {t("whatMatter")}
          </h1>
          <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6" style={{ bottom: BAR + 30 }}>
            <div className="flow-rise mb-3 w-[min(680px,88vw)] px-7" style={{ animationDelay: ".16s" }}>
              {hint("justify-end", "left")}
            </div>
            <div className="flow-rise" style={{ animationDelay: ".2s" }}>
              {field("min(680px, 88vw)")}
            </div>
            <div className="flow-rise mt-6" style={{ animationDelay: ".28s" }}>
              <RecentLine home={home} bare />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function useRecent(home: HomeData) {
  return useMemo(() => {
    const xs = [...home.projects].filter((p) => !RUNNING.has(p.status) || needsYou(p));
    return { worlds: xs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), waiting: home.projects.filter(needsYou).length + home.revisits.filter((r) => r.due).length, all: home.projects.length };
  }, [home.projects, home.revisits]);
}

/** The worlds you were last in, as one line of their names: those waiting for you are warm. */
function RecentLine({ home, bare = false }: { home: HomeData; bare?: boolean }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const { worlds, all } = useRecent(home);
  if (!worlds.length) return null;
  return (
    <div className="pointer-events-auto flex max-w-[min(1180px,94vw)] items-center gap-7 text-[12.5px] whitespace-nowrap">
      {!bare && <span style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{t("recent")}</span>}
      {worlds.map((p: ProjectCard) => (
        <A key={p.id} href={projectHref(p)} className="flex min-w-0 items-center gap-2 transition-colors hover:text-[rgb(var(--k-ink))]" style={{ color: needsYou(p) ? P.warm : `rgb(${P.inkRgb} / 0.7)` }}>
          {needsYou(p) && <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.warm }} />}
          <span className="truncate">{cut(p.title, 12)}</span>
        </A>
      ))}
      {!bare && (
        <A href={`${BASE}/all`} className="transition-colors hover:text-[rgb(var(--k-ink))]" style={{ color: P.mute }}>
          {t("all", { count: all })}
        </A>
      )}
    </div>
  );
}

/** The same, down the page: a name and where it stands on each line. */
function RecentList({ home }: { home: HomeData }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const projectLine = useProjectLine();
  const { worlds, all } = useRecent(home);
  if (!worlds.length) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{t("recent")}</span>
        <A href={`${BASE}/all`} className="text-[12px] transition-colors hover:text-[rgb(var(--k-ink))]" style={{ color: P.mute }}>
          {t("all", { count: all })}
        </A>
      </div>
      <div className="mt-3 flex flex-col">
        {worlds.map((p: ProjectCard) => (
          <A key={p.id} href={projectHref(p)} className="group flex items-baseline gap-4 py-[7px]">
            <span className="min-w-0 flex-1 truncate text-[13.5px] transition-colors group-hover:text-[rgb(var(--k-ink))]" style={{ color: needsYou(p) ? P.warm : `rgb(${P.inkRgb} / 0.84)` }}>
              {p.title}
            </span>
            <span className="max-w-[45%] shrink-0 truncate text-[11.5px]" style={{ color: P.mute }}>
              {projectLine(p)}
            </span>
          </A>
        ))}
      </div>
    </div>
  );
}

/** How many are waiting, and how many there are. */
function RecentCount({ home }: { home: HomeData }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const { waiting, all } = useRecent(home);
  return (
    <A href={`${BASE}/all`} className="flex items-center gap-4 text-[12px]">
      {waiting > 0 && (
        <span className="flex items-center gap-2" style={{ color: P.warm }}>
          <span className="h-[5px] w-[5px] rounded-full" style={{ background: P.warm }} />
          {t("waiting", { count: waiting })}
        </span>
      )}
      <span className="transition-colors hover:text-[rgb(var(--k-ink))]" style={{ color: P.mute }}>
        {t("all", { count: all })}
      </span>
    </A>
  );
}

// ------------------------------------------------------------------------------------------- asked

type Clarify = { q: string; why?: string; options?: string[]; answer?: string | null };

/**
 * What has to be known first, one thing at a time. Pressing an answer is seen: it turns warm and the others step
 * back, and then the next thing asked comes in its place.
 */
export function AskWords({ v, scene = 0, items, onDone }: { v: number; scene?: number; items: Clarify[]; onDone: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  /** What was answered to each thing asked so far (for the roll and the record). */
  const [given, setGiven] = useState<string[]>([]);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const it = items[i];
  const go = (said = t("skip")) => {
    setChosen(null);
    setGiven((g) => [...g.slice(0, i), said]);
    if (i < items.length - 1) setI(i + 1);
    else onDone();
  };
  const pick = (o: string) => {
    if (chosen) return;
    setChosen(o);
    timer.current = window.setTimeout(() => go(o), 560);
  };
  if (!it)
    return (
      <div className="absolute inset-x-0 top-[34%] flex flex-col items-center text-center">
        <button type="button" onClick={onDone} className="flow-rise rounded-full px-6 py-2.5 text-[14px]" style={{ background: P.warm, color: P.page }}>
          {t("start")}
        </button>
      </div>
    );
  const opts = (it.options ?? []).slice(0, 6);
  const count = (
    <div style={{ fontFamily: MONO, fontSize: 11, color: P.faint, letterSpacing: "0.1em" }}>
      {i + 1} / {items.length}
    </div>
  );
  const skip = (
    <button type="button" onClick={() => go()} className="text-[12.5px] transition-colors hover:text-[rgb(var(--k-ink))]" style={{ color: P.mute }}>
      {t("skip")}
    </button>
  );
  const pill = (o: string) => {
    const on = chosen === o;
    const was = !chosen && o === it.answer;
    return (
      <button key={o} type="button" onClick={() => pick(o)} className="rounded-full px-5 py-[9px] text-[14.5px]" style={{ background: on ? P.warm : "transparent", color: on ? P.page : P.ink, boxShadow: on ? `0 0 0 6px rgb(${P.warmRgb} / 0.14)` : `inset 0 0 0 1px rgb(${P.inkRgb} / ${was ? 0.5 : 0.2})`, opacity: chosen && !on ? 0.22 : 1, transform: on ? "scale(1.04)" : "none", transition: "background-color .22s ease, color .22s ease, opacity .3s ease, transform .3s cubic-bezier(.2,.7,.2,1), box-shadow .3s ease" }}>
        {cut(o, 16)}
      </button>
    );
  };
  return (
    <div key={i} className="absolute inset-0" style={{ animation: "flow-in .45s ease both" }}>
      {v === 1 && scene !== 3 && (
        <div className="absolute inset-x-0 flex flex-col items-center px-6 text-center" style={{ top: scene === 2 ? "16%" : "24%" }}>
          {/* (the record: what was asked and answered stays above what is asked now) */}
          {scene === 2 && (
            <div className="mb-9 flex min-h-[52px] flex-col items-center justify-end gap-2">
              {items.slice(0, i).map((x, k) => (
                <div key={x.q} className="flex max-w-[760px] items-baseline gap-4 text-[13px]">
                  <span className="truncate" style={{ color: P.mute }}>
                    {cut(x.q, 30)}
                  </span>
                  <span className="shrink-0" style={{ color: P.ink }}>
                    {given[k] ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {count}
          <h2 className="mt-5 max-w-[760px] text-[28px] leading-[1.45] font-medium">{it.q}</h2>
          <div className="mt-9 flex max-w-[820px] flex-wrap justify-center gap-2.5">{opts.map(pill)}</div>
          <div className="mt-8">{skip}</div>
        </div>
      )}
      {/* (the roll: everything that is to be asked, down the right, and what was answered) */}
      {v === 1 && scene === 1 && (
        <div className="absolute right-9 w-[300px]" style={{ top: "22%" }}>
          <SideList title={t("toAsk", { count: items.length })} items={items.map((x, k): Item => ({ key: x.q, name: cut(x.q, 20), line: given[k] ?? "", state: k < i ? "done" : k === i ? "now" : "todo" }))} />
        </div>
      )}
      {/* (the caption: what is asked, and its answers, under the sky) */}
      {v === 1 && scene === 3 && (
        <div className="absolute inset-x-0 flex flex-col items-center px-6 text-center" style={{ bottom: BAR + 40 }}>
          {count}
          <h2 className="mt-4 max-w-[860px] text-[25px] leading-[1.45] font-medium">{it.q}</h2>
          <div className="mt-7 flex max-w-[1080px] flex-wrap justify-center gap-2.5">{opts.map(pill)}</div>
          <div className="mt-6">{skip}</div>
        </div>
      )}
      {v === 2 && (
        <div className="absolute flex flex-col" style={{ left: LEFT, top: "20%", width: "min(620px, 50vw)" }}>
          {count}
          <h2 className="mt-5 text-[28px] leading-[1.45] font-medium">{it.q}</h2>
          <div className="mt-8 flex flex-col">
            {opts.map((o) => {
              const on = chosen === o;
              const was = !chosen && o === it.answer;
              return (
                <button key={o} type="button" onClick={() => pick(o)} className="flex h-[46px] items-center gap-4 text-left text-[15px]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.08)`, opacity: chosen && !on ? 0.22 : 1, transition: "opacity .3s ease" }}>
                  <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: on ? P.warm : "transparent", boxShadow: on ? `0 0 0 5px rgb(${P.warmRgb} / 0.16)` : `inset 0 0 0 1.5px rgb(${P.inkRgb} / ${was ? 0.7 : 0.3})`, transition: "background-color .22s ease, box-shadow .3s ease" }} />
                  <span style={{ color: on ? P.warm : P.ink, transition: "color .22s ease" }}>{cut(o, 24)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6">{skip}</div>
        </div>
      )}
      {v === 3 && (
        <>
          <div className="absolute inset-x-0 top-[12%] flex flex-col items-center px-6 text-center">
            {count}
            <h2 className="mt-5 max-w-[820px] text-[30px] leading-[1.45] font-medium">{it.q}</h2>
          </div>
          <div className="absolute inset-x-0 flex flex-col items-center gap-6 px-6" style={{ bottom: BAR + 40 }}>
            <div className="flex max-w-[1080px] flex-wrap justify-center gap-2.5">{opts.map(pill)}</div>
            {skip}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- the sources found; the world built

/** While the sources are found and read: what is going on in two words, and how much. */
export function OpeningWords({ v, scene = 0, head, now, sources, read, list = [], asked = [] }: { v: number; scene?: number; head: string; now: string; sources: number; read: number; /** Each source, as far as it has been found and read (the roll). */ list?: Item[]; /** What has been searched for so far (the record). */ asked?: string[] }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const ink = (s: string) => <span style={{ color: P.ink }}>{s}</span>;
  const nums = (
    <span className="flex items-baseline gap-5" style={{ fontFamily: MONO, fontSize: 12, fontVariantNumeric: "tabular-nums", color: P.mute }}>
      <span>{rich(t("sources", { count: sources }), { n: ink })}</span>
      <span>{rich(t("read", { count: read }), { n: ink })}</span>
    </span>
  );
  const what = <span className="truncate text-[12.5px]" style={{ color: P.faint }}>{cut(now, 40)}</span>;
  if (v === 2)
    return (
      <div className="pointer-events-none absolute flex flex-col gap-2" style={{ left: 36, bottom: BAR + 30, width: 420 }}>
        <div className="text-[20px] leading-none font-medium">{head}</div>
        <div className="mt-1">{nums}</div>
        {what}
      </div>
    );
  if (v === 3)
    return (
      <div className="pointer-events-none absolute right-9 left-9 flex items-baseline gap-8" style={{ bottom: BAR + 22 }}>
        <div className="shrink-0 text-[15px] font-medium">{head}</div>
        <div className="min-w-0 flex-1 truncate text-center">{what}</div>
        <div className="shrink-0">{nums}</div>
      </div>
    );
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-2.5 px-6 text-center" style={{ bottom: BAR + 30 }}>
        {/* (the record: what has been searched for, a line each, the newest last) */}
        {scene === 2 && (
          <div className="mb-4 flex flex-col items-center gap-[5px]">
            {asked.slice(-5).map((x, k, xs) => (
              <div key={`${x}${k}`} className="max-w-[560px] truncate text-[12.5px]" style={{ color: k === xs.length - 1 ? P.ink : P.mute, opacity: k === xs.length - 1 ? 1 : 0.3 + 0.14 * k }}>
                {cut(x, 44)}
              </div>
            ))}
          </div>
        )}
        <div className="text-[20px] leading-none font-medium">{head}</div>
        {nums}
        {scene === 3 && what}
      </div>
      {/* (the roll: the sources, down the right, as each is found and read) */}
      {scene === 1 && (
        <div className="pointer-events-none absolute right-9 w-[300px]" style={{ top: "16%" }}>
          <SideList title={t("sourcesHead", { count: list.length })} items={list} />
        </div>
      )}
    </>
  );
}

/** While a world is built: what it is, what is being done to it in a word, how long it has taken, and how much there is. */
export function BuildHead({ v, title, state, elapsed, counts, left, right }: { v: number; title: string; state: string; elapsed: string; counts: [number, string][]; left: number; right: number }) {
  const { P } = useApp();
  const now = (
    <span className="flex items-center gap-2 text-[12.5px]" style={{ color: P.ink }}>
      <span className="k-pulse h-[5px] w-[5px] rounded-full" style={{ background: P.warm }} />
      {state}
    </span>
  );
  const time = <span style={{ fontFamily: MONO, fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: P.mute }}>{elapsed}</span>;
  const nums = (
    <span className="flex items-baseline gap-4" style={{ fontFamily: MONO, fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: P.mute }}>
      {counts.map(([n, label]) => (
        <span key={label}>
          <span style={{ color: P.ink }}>{n}</span> {label}
        </span>
      ))}
    </span>
  );
  if (v === 2)
    return (
      <div className="pointer-events-none absolute top-7 flex flex-col gap-[9px]" style={{ left: 32, width: Math.max(240, left - 48) }}>
        <div className="truncate text-[16px] leading-none font-medium">{title}</div>
        <div className="flex items-center gap-4">
          {now}
          {time}
        </div>
        {nums}
      </div>
    );
  if (v === 3)
    return (
      <div className="pointer-events-none absolute top-7 right-9 left-9 flex items-baseline gap-8">
        <div className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{title}</div>
        <div className="shrink-0">{now}</div>
        <div className="flex min-w-0 flex-1 items-baseline justify-end gap-5">
          {nums}
          {time}
        </div>
      </div>
    );
  return (
    <div className="pointer-events-none absolute top-7 flex flex-col items-center gap-[10px] text-center" style={{ left, right }}>
      <div className="max-w-full truncate text-[19px] leading-none font-medium">{title}</div>
      <div className="flex items-center gap-4">
        {now}
        {time}
      </div>
      {nums}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- a play

/** What this play is and what is always at hand, in a line: no plates, nothing that is not needed to know where one is. */
export function PlayHead({ v, title, you, date, step, spent, children, tools: given }: { v: number; title: string; /** Whose place you are in (null: not said, as the product has it: the date and which decision only). */ you: string | null; date: string; step: number; spent: string; children?: React.ReactNode; /** What is at hand, where it can be pressed (given by whoever shows the whole flow). */ tools?: React.ReactNode }) {
  const { P } = useApp();
  const t = useT("flow-lab.words");
  const tools = given ?? (
    <div className="flex shrink-0 items-baseline gap-5 text-[12px] whitespace-nowrap" style={{ color: P.mute }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>{spent}</span>
      <span>{t("findings")}</span>
      <span>{t("world")}</span>
      <span style={{ color: P.faint }}>{t("end")}</span>
    </div>
  );
  const when = (
    <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>
      {t("when", { date, step })}
    </span>
  );
  if (v === 2)
    return (
      <>
        <div className="flex w-[280px] shrink-0 flex-col gap-[6px]">
          <div className="truncate text-[15px] leading-none font-medium">{title}</div>
          <div className="flex items-baseline gap-3 truncate text-[12px]" style={{ color: P.mute }}>
            {you != null && t("youAre", { name: you })}
            {when}
          </div>
        </div>
        <div className="min-w-0 flex-1">{children}</div>
        {tools}
      </>
    );
  if (v === 3)
    return (
      <>
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{title}</div>
        <div className="flex shrink-0 items-baseline gap-3 text-[12px]" style={{ color: P.mute }}>
          {you != null && t("youAre", { name: you })}
          {when}
        </div>
        <div className="flex min-w-0 flex-1 justify-end">{tools}</div>
      </>
    );
  return (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 flex-col items-center gap-[6px] text-center">
        <div className="max-w-[520px] truncate text-[14px] leading-none font-medium">{title}</div>
        <div className="flex items-baseline gap-3 text-[12px]" style={{ color: P.mute }}>
          {you != null && t("youAre", { name: you })}
          {when}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 justify-end">{tools}</div>
    </>
  );
}
