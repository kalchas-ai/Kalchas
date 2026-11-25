"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WorldView } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { api, usd, useApp } from "@/components/product/shell";
import { projectHref } from "@/components/product/projects";
import type { HomeData } from "@/components/product/start/shared";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";
import { clock, sec, why, type Tape } from "@/components/product/wait/tape";

/**
 * The rest of the product, on the same page and in the same hand (/design/matter): everything the real flow has
 * that the one take did not yet show. Before a world: your words being understood; the opening being written. And,
 * from the home page, all your worlds and the settings. (What the research came to is not a page of the flow: it is
 * had only from the home page, by whoever asks for the answer alone.)
 * (What can be opened while a play is on is in sheets.tsx; the report in report.tsx.)
 *
 * The same rules as the rest of the page: the picture is always behind and steps back where there is reading; one
 * thing said per screen, on the axis; what state something is in is a word or two; numbers are in the fixed-width
 * face; nothing that is not pressed has a plate behind it; warm is for the one thing to act on; nothing is there or
 * gone at once; nothing scrolls. Everything shown is what the product's own views hold; nothing here writes or
 * spends.
 */

const SWIFT = "cubic-bezier(.2,.7,.2,1)";
export const clampLines = (n: number) => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical" as const, overflow: "hidden" });
const BAR = 54;

/** A small line in the fixed-width face: when, how many, what state. */
export function Kick({ children, warm = false, className = "" }: { children: React.ReactNode; warm?: boolean; className?: string }) {
  const { P } = useApp();
  return (
    <div className={className} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", color: warm ? P.warm : P.mute }}>
      {children}
    </div>
  );
}

/** A heading over a list in a column: the same as the columns of a step. */
export function Head({ children }: { children: React.ReactNode }) {
  const { P } = useApp();
  return <div style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{children}</div>;
}

/** The one thing to act on. */
export function Go({ children, onClick, off = false, quiet = false }: { children: React.ReactNode; onClick?: () => void; off?: boolean; /** A way out that is not the thing to act on. */ quiet?: boolean }) {
  const { P } = useApp();
  if (quiet)
    return (
      <button type="button" onClick={onClick} disabled={off} className="rounded-full px-5 py-[9px] text-[13.5px] transition-opacity duration-300" style={{ color: P.ink, boxShadow: `inset 0 0 0 1px rgb(${P.inkRgb} / 0.2)`, opacity: off ? 0.35 : 1 }}>
        {children}
      </button>
    );
  return (
    <button type="button" onClick={onClick} disabled={off} className="rounded-full px-6 py-2.5 text-[14.5px] transition-opacity duration-300" style={{ background: P.warm, color: P.page, opacity: off ? 0.35 : 1 }}>
      {children}
    </button>
  );
}

/** A long list a page at a time: nothing scrolls. */
export function usePages<T>(items: T[], per: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const at = Math.min(page, pages - 1);
  return { rows: items.slice(at * per, at * per + per), at, pages, setPage, from: at * per };
}
export function Pager({ at, pages, setPage }: { at: number; pages: number; setPage: (n: number) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.rest");
  if (pages < 2) return null;
  return (
    <div className="flex items-center gap-3" style={{ fontFamily: MONO, fontSize: 11, color: P.mute }}>
      <button type="button" onClick={() => setPage(Math.max(0, at - 1))} style={{ opacity: at > 0 ? 1 : 0.3 }} aria-label={t("prevPage")}>
        ‹
      </button>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {at + 1} / {pages}
      </span>
      <button type="button" onClick={() => setPage(Math.min(pages - 1, at + 1))} style={{ opacity: at < pages - 1 ? 1 : 0.3 }} aria-label={t("nextPage")}>
        ›
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- your words being understood

/**
 * Right after something is written, before anything is asked: the field is looked over and the questions written.
 * On the axis: what you wrote; under it what is being done, and what has been read so far in a line; under that,
 * what has just been read, a line each, the newest in ink. How long it takes is not known, and is not drawn.
 */
export function Know({ tape, said, speed, onDone, live = false }: { tape: Tape | null; said: string; speed: number; onDone: () => void; /** As it really happens: the time is the time since it began, and it is over when the questions have really been written. */ live?: boolean }) {
  const { P } = useApp();
  const tr = useT("flow-lab.rest");
  /** The texts of why() (tape.ts). */
  const tw = useT("product.wait.tape");
  const [t, setT] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  const U = tape?.understand;
  const wrote = U ? U.calls.filter((c) => c.p === "clarify" && c.ok).map((c) => sec(c.e, U.t0)) : [];
  const end = wrote.length ? Math.max(1, ...wrote) : live || !U ? (live ? Infinity : 6) : 1;
  const t0 = U?.t0;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let gone = false;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      setT((x) => {
        const y = live && t0 ? (Date.now() - t0) / 1000 : x + dt;
        if (y > end + 2.2 && !gone) {
          gone = true;
          window.setTimeout(() => done.current(), 0);
        }
        return y;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [end, speed, live, t0]);
  // everything read, each when it came: the sites of each search as it returned, then the words of the field
  const pieces = useMemo(() => {
    if (!U) return [];
    // (`word`: something learned of the field, how insiders put it or who the key players are, and not a site)
    const out: { at: number; tag: string; text: string; word?: boolean }[] = [];
    for (const q of U.queries) q.hosts.forEach((h, j) => out.push({ at: sec(q.at, U.t0) + j * 0.22, tag: h.replace(/^(www|m|wap|pdf|research|home)\./, "").split(".")[0] ?? h, text: q.titles?.[j] || q.q }));
    if (U.vocab) {
      const at = sec(U.vocab.at, U.t0);
      U.vocab.terms.forEach((x, j) => out.push({ at: at + j * 0.16, tag: tr("insiderTerms"), text: x, word: true }));
      // (what is in brackets, full-width \uFF08\uFF09 or plain, is dropped)
      U.vocab.players.forEach((x, j) => out.push({ at: at + 0.08 + j * 0.16, tag: tr("keyPlayers"), text: x.replace(/\uFF08.*?\uFF09|\(.*?\)/g, ""), word: true }));
    }
    return out.sort((a, b) => a.at - b.at);
  }, [U, tr]);
  const out = pieces.filter((p) => p.at <= t);
  const sites = new Set(U?.queries.filter((q) => sec(q.at, U.t0) <= t).flatMap((q) => q.hosts) ?? []).size;
  const words = out.filter((p) => p.word).length;
  const answered = t >= end;
  const failed = U?.calls.filter((c) => c.p === "clarify" && !c.ok && sec(c.e, U.t0) <= t) ?? [];
  const planEnd = U ? Math.max(0, ...U.calls.filter((c) => c.p === "survey_plan").map((c) => sec(c.e, U.t0))) : 0;
  const now = answered ? tr("ready") : failed.length ? tr("rewriting", { n: failed.length, reason: why(failed[failed.length - 1]!.err, tw) }) : t < planEnd ? tr("readingWhatYouWrote") : U?.vocab && t < sec(U.vocab.at, U.t0) ? tr("learningField") : tr("workingOutQuestions");
  const shown = out.slice(-5);
  return (
    <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6 text-center" style={{ top: "19%" }}>
      <Kick>
        {tr("understanding")} · <span style={{ fontVariantNumeric: "tabular-nums" }}>{clock(Math.min(t, end))}</span>
      </Kick>
      <h1 className="mt-4 max-w-[860px] text-[28px] leading-[1.45] font-medium" style={clampLines(2)}>
        {tape?.question || said}
      </h1>
      <div className="mt-5 text-[15px] transition-colors duration-700" style={{ color: answered ? P.warm : P.ink }}>
        {now}
      </div>
      <div className="mt-2 text-[13px]" style={{ color: P.mute }}>
        {answered ? tr("wroteQuestions", { count: U?.questions.length ?? 0, sites, words }) : sites === 0 ? tr("findingField") : words ? tr("readSitesWords", { count: sites, words }) : tr("readSites", { count: sites })}
      </div>
      <div className="mt-9 flex h-[150px] w-[min(640px,80vw)] flex-col justify-end">
        {answered && U?.insight?.understood ? (
          <div className="text-left text-[13.5px] leading-[1.75]" style={{ color: `rgb(${P.inkRgb} / 0.86)`, animation: `flow-rise .7s ${SWIFT} both`, ...clampLines(5) }}>
            {U.insight.understood}
          </div>
        ) : (
          shown.map((p, i) => (
            <div key={`${p.at}${p.text}`} className="flex items-baseline gap-4 py-[5px] text-left text-[13px]" style={{ opacity: 0.3 + 0.7 * ((i + 1 + 5 - shown.length) / 5) ** 1.6, animation: `flow-rise .5s ${SWIFT} both`, transition: "opacity .5s ease" }}>
              <span className="w-[104px] shrink-0 truncate text-right" style={{ fontFamily: MONO, fontSize: 10.5, color: p.word ? P.warm : P.faint }}>
                {p.tag}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ color: i === shown.length - 1 ? P.ink : P.mute }}>
                {p.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- the opening being written

/**
 * The world is made; before the first decision, where you stand in it is written (about half a minute). On the
 * axis under the world: the day it opens on and whose place you are in, what the opening is, and that it is being
 * written. Nothing is chosen here: a world made from what you said opens where you said.
 */
export function Start({ world, speed, onDone, live = false }: { world: WorldView; speed: number; onDone: () => void; /** As the product has it: the day only, not whose place you are in (the play page does not say it either). */ live?: boolean }) {
  const { P } = useApp();
  const tr = useT("flow-lab.rest");
  const sp = world.startPoints[0] ?? null;
  const [t, setT] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // (by the clock: a page in the background is given few ticks, and the count stood still while it was there)
    const t0 = Date.now();
    const id = window.setInterval(() => setT(((Date.now() - t0) / 1000) * speed), 250);
    return () => window.clearInterval(id);
  }, [speed]);
  useEffect(() => {
    if (t >= 7) done.current();
  }, [t]);
  return (
    <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6 text-center" style={{ bottom: BAR + 46 }}>
      <Kick>
        {sp ? (live ? sp.date : tr("startKick", { date: sp.date, name: world.scope?.protagonist.role ?? sp.seat })) : world.title}
      </Kick>
      <h2 className="mt-3 max-w-[820px] text-[24px] leading-[1.45] font-medium" style={clampLines(2)}>
        {sp ? sp.title : tr("noStart")}
      </h2>
      {sp && (
        <p className="mt-3 max-w-[720px] text-[13.5px] leading-[1.75]" style={{ color: `rgb(${P.inkRgb} / 0.8)`, ...clampLines(3) }}>
          {sp.rationale}
        </p>
      )}
      <div className="mt-5 text-[12.5px]" style={{ color: P.mute }}>
        {sp ? (
          <>
            {tr("writingStart")} · <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{clock(t)}</span>
          </>
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- all your worlds; the settings

type Proj = HomeData["projects"][number];

/** Where a project stands, in a word or two; warm when it waits on you. */
const stands = (t: T, p: Proj): [string, boolean] => {
  if (p.status === "clarifying") return [t("waitingForAnswer"), true];
  if (p.status === "paused") return [t("reachedLimit"), true];
  if (p.status === "failed" || p.status === "stalled") return [t("stoppedCanContinue"), true];
  if (p.status === "building") return [t("building"), false];
  if (p.latest?.ended) return [t("ended"), false];
  if (p.latest) return [t("atStep", { step: p.latest.step }), false];
  return [t("notPlayed"), false];
};

/** How many lines of a list the window has room for. */
function useRoom(line: number, taken: number, least = 5, most = 14) {
  const [n, setN] = useState(9);
  useEffect(() => {
    const fit = () => setN(Math.max(least, Math.min(most, Math.floor((window.innerHeight - taken) / line))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [line, taken, least, most]);
  return n;
}

/**
 * Everything you have made, a line each, a page at a time: when it stands, what it is, where it has got to, what it
 * has cost. No plates and no rules between them: a line is lit when it is pointed at, and opens.
 */
export function Projects({ home, onClose }: { home: HomeData; /** Where it is laid over the home page and not a page of its own. */ onClose?: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.rest");
  const [only, setOnly] = useState<"all" | "today" | "past">("all");
  const list = useMemo(() => [...home.projects].filter((p) => only === "all" || (only === "past") === !!p.moment?.past).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [home.projects, only]);
  const pg = usePages(list, useRoom(46, 330));
  const count = (k: "all" | "today" | "past") => (k === "all" ? home.projects.length : home.projects.filter((p) => (k === "past") === !!p.moment?.past).length);
  return (
    <div className="absolute inset-x-0 flex flex-col items-center px-6" style={{ top: 64, bottom: 40 }}>
      <h1 className="text-[26px] leading-none font-medium tracking-tight" style={{ animation: `k-rise .6s ${SWIFT} both` }}>
        {t("allProjects")}
      </h1>
      <div className="mt-6 flex items-baseline gap-7 text-[13px]" style={{ animation: `k-rise .6s ${SWIFT} .06s both` }}>
        {(["all", "today", "past"] as const).map((k) => (
          <button key={k} type="button" onClick={() => (setOnly(k), pg.setPage(0))} className="flex items-baseline gap-1.5 transition-colors duration-300" style={{ color: only === k ? P.ink : P.faint }}>
            {t(`filter.${k}`)}
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{count(k)}</span>
          </button>
        ))}
      </div>
      <div key={`${only}${pg.at}`} className="mt-7 flex w-[min(900px,92vw)] flex-col" style={{ animation: `k-rise .5s ${SWIFT} .1s both` }}>
        {pg.rows.map((p) => {
          const [word, you] = stands(t, p);
          return (
            <a key={p.id} href={projectHref(p)} className="k-line group flex items-baseline gap-6 py-[11px]">
              <span className="w-[76px] shrink-0 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {p.moment?.past ? p.moment.at.slice(0, 4) : t("filter.today")}
              </span>
              <span className="k-line-main min-w-0 flex-1 truncate text-[15.5px]">{p.title || p.prompt}</span>
              <span className="w-[150px] shrink-0 truncate text-right text-[12.5px]" style={{ color: you ? P.warm : undefined }}>
                {word}
              </span>
              <span className="w-[52px] shrink-0 text-right" style={{ fontFamily: MONO, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {p.updatedAt.slice(5, 10).replace("-", "/")}
              </span>
              <span className="w-[52px] shrink-0 text-right" style={{ fontFamily: MONO, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {usd(p.spentUsd)}
              </span>
            </a>
          );
        })}
        {!list.length && (
          <div className="py-10 text-center text-[13.5px]" style={{ color: P.mute }}>
            {home.loaded ? t("noProjects") : ""}
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-8">
        <Pager at={pg.at} pages={pg.pages} setPage={pg.setPage} />
        {onClose && (
          <button type="button" onClick={onClose} className="text-[12.5px]" style={{ color: P.mute }}>
            {t("backHome")}
          </button>
        )}
      </div>
    </div>
  );
}

type Choice = { id: string; name: string; maker: string; usdPerStep: number };
type Settings = { defaultModel: string; builtinModel: string; choices: Choice[]; search: string; keyConfigured: boolean; dataPath: string; monthUsd: number; totalUsd: number };

/**
 * The one model, as a list that opens under it: the models offered by name, grouped by who makes them, each with about
 * what a step costs on it, and at its foot a line to write in any other model's id (taken on Enter). It comes and goes
 * by fading, and closes on a press outside it or on Escape.
 */
function ModelPicker({ choices, builtin, value, onChange }: { choices: Choice[]; builtin: string; value: string; onChange: (id: string) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.rest");
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const picked = choices.find((c) => c.id === value);
  useEffect(() => {
    if (!open) return;
    // (a model written in before is there to change when the list opens)
    setCustom(picked ? "" : value);
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const cost = (c: Choice) => t("perStep", { cost: `$${c.usdPerStep}` });
  const makers = [...new Set(choices.map((c) => c.maker))];
  const take = () => {
    if (!custom.trim()) return;
    onChange(custom.trim());
    setOpen(false);
  };
  return (
    <div ref={box} className="relative mt-3">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-baseline gap-4 py-[9px] text-left" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / ${open ? 0.45 : 0.18})`, transition: "box-shadow .3s ease" }}>
        <span className="min-w-0 flex-1 truncate text-[15px]" style={picked ? undefined : { fontFamily: MONO, fontSize: 13 }}>
          {picked?.name ?? value}
        </span>
        {picked && (
          <span className="shrink-0 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 12, color: P.mute, fontVariantNumeric: "tabular-nums" }}>
            {cost(picked)}
          </span>
        )}
        <span className="shrink-0 text-[10px] transition-transform duration-300" style={{ color: P.faint, transform: open ? "rotate(180deg)" : "none" }}>
          ▾
        </span>
      </button>
      <div
        role="listbox"
        aria-hidden={!open}
        className="absolute inset-x-0 top-full z-50 mt-2 rounded-[12px] py-2"
        style={{
          background: P.page,
          boxShadow: `0 0 0 1px ${P.rule}, 0 16px 40px rgb(0 0 0 / 0.32)`,
          opacity: open ? 1 : 0,
          transform: open ? "none" : "translateY(-4px)",
          pointerEvents: open ? "auto" : "none",
          visibility: open ? "visible" : "hidden",
          transition: `opacity .22s ease, transform .22s ease, visibility 0s linear ${open ? "0s" : ".22s"}`,
        }}
      >
        {makers.map((m) => (
          <div key={m}>
            <div className="px-4 pt-2 pb-1 text-[11px]" style={{ color: P.faint }}>
              {m}
            </div>
            {choices
              .filter((c) => c.maker === m)
              .map((c) => (
                <button key={c.id} type="button" role="option" aria-selected={c.id === value} tabIndex={open ? 0 : -1} onClick={() => (onChange(c.id), setOpen(false))} className="k-line flex w-full items-baseline gap-4 px-4 py-1.5 text-left text-[13.5px]" style={c.id === value ? { color: P.ink } : undefined}>
                  <span className="min-w-0 flex-1 truncate">
                    {c.name}
                    {c.id === builtin && (
                      <span className="ml-2 text-[11px]" style={{ color: P.faint }}>
                        {t("builtIn")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                    {cost(c)}
                  </span>
                </button>
              ))}
          </div>
        ))}
        <div className="mx-4 mt-2 flex items-baseline gap-3 pt-3" style={{ boxShadow: `inset 0 1px 0 ${P.rule}` }}>
          <span className="shrink-0 text-[12.5px]" style={{ color: picked ? P.mute : P.ink }}>
            {t("customModel")}
          </span>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && take()} placeholder={t("customHint")} tabIndex={open ? 0 : -1} spellCheck={false} className="k-write min-w-0 flex-1" style={{ fontFamily: MONO, fontSize: 12, color: P.ink }} />
        </div>
      </div>
    </div>
  );
}
const LIGHT = { fontFamily: `"MiSans", system-ui, sans-serif`, fontWeight: 300, fontVariantNumeric: "tabular-nums" } as const;

/**
 * The settings, on one screen: the one model that does all the work (chosen from a list of those offered by name, each
 * with about what a step costs on it, or any other written in), what has been spent, the key and the search, where everything is kept.
 * What can be changed is written straight into its place (no boxes round anything), and the one thing to press is
 * there once something has changed.
 */
export function SettingsPage({ onClose }: { onClose?: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.rest");
  const savedNote = t("saved");
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const take = (x: Settings) => {
    setS(x);
    setModel(x.defaultModel);
  };
  useEffect(() => {
    let live = true;
    api<Settings>("/settings")
      .then((x) => live && take(x))
      .catch((e) => live && setErr(String(e instanceof Error ? e.message : e)));
    return () => {
      live = false;
    };
  }, []);
  const chosen = model.trim();
  const changed = !!s && !!chosen && chosen !== s.defaultModel;
  const save = () => {
    if (!s || saving || !chosen) return;
    setSaving(true);
    setNote(null);
    // (the built-in model is saved as none chosen, so that a later built-in one takes its place)
    api<Settings>("/settings", { defaultModel: chosen === s.builtinModel ? "" : chosen })
      .then((x) => (take(x), setNote(savedNote)))
      .catch((e) => setNote(String(e instanceof Error ? e.message : e)))
      .finally(() => setSaving(false));
  };
  const big = (k: string, v: React.ReactNode) => (
    <div key={k}>
      <div className="flex items-baseline text-[28px] leading-[36px]" style={LIGHT}>
        {v}
      </div>
      <div className="mt-0.5 text-[12px]" style={{ color: P.mute }}>
        {k}
      </div>
    </div>
  );
  return (
    <div className="absolute inset-x-0 flex flex-col items-center px-6" style={{ top: 64, bottom: 40 }}>
      <h1 className="text-[26px] leading-none font-medium tracking-tight" style={{ animation: `k-rise .6s ${SWIFT} both` }}>
        {t("settings")}
      </h1>
      {!s ? (
        <div className="mt-10 text-[13.5px]" style={{ color: P.mute }}>
          {err ? t("loadFailed", { error: err }) : ""}
        </div>
      ) : (
        <div className="mt-10 grid w-[min(1000px,92vw)] grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-20" style={{ animation: `k-rise .6s ${SWIFT} .08s both` }}>
          <div>
            <Head>{t("model")}</Head>
            <ModelPicker choices={s.choices} builtin={s.builtinModel} value={model} onChange={setModel} />
            <p className="mt-3 max-w-[460px] text-[12px] leading-[1.65]" style={{ color: P.faint }}>
              {t("perStepNote")}
            </p>
          </div>
          <div className="flex flex-col gap-9">
            <div>
              <Head>{t("spentSoFar")}</Head>
              <div className="mt-3 flex gap-12">
                {big(t("thisMonth"), usd(s.monthUsd))}
                {big(t("inAll"), usd(s.totalUsd))}
              </div>
            </div>
            <div>
              <Head>{t("connections")}</Head>
              <div className="mt-3 flex flex-col gap-[8px] text-[13px]">
                {(
                  [
                    ["key", s.keyConfigured ? t("keySet") : t("keyNotSet"), !s.keyConfigured],
                    ["search", s.search, false],
                    ["data", s.dataPath.replace(/^.*\/(?=[^/]+\/[^/]+$)/, "…/"), false],
                  ] as const
                ).map(([k, v, bad]) => (
                  <div key={k} className="flex items-baseline justify-between gap-6">
                    <span className="shrink-0" style={{ color: P.mute }}>
                      {t(`conn.${k}`)}
                    </span>
                    <span className="min-w-0 truncate" style={{ color: bad ? P.warm : P.ink }} title={k === "data" ? s.dataPath : undefined}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mt-auto flex h-10 items-center gap-6">
        <span className="transition-opacity duration-500" style={{ opacity: changed ? 1 : 0, pointerEvents: changed ? "auto" : "none" }}>
          <Go onClick={save} off={saving}>
            {t("save")}
          </Go>
        </span>
        <span className="text-[12.5px] transition-opacity duration-500" style={{ color: note === savedNote ? P.mute : P.warm, opacity: note && !(changed && note === savedNote) ? 1 : 0 }}>
          {note ?? ""}
        </span>
        {onClose && (
          <button type="button" onClick={onClose} className="text-[12.5px]" style={{ color: P.mute }}>
            {t("backHome")}
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- stopped

/**
 * Something being made has stopped (the research, or a world): it failed, or whatever was running it is gone. On a
 * plate in the middle of the page, over the picture as it stood: what happened in a line, what is kept, and the one
 * thing to press: go on from there. ("paused" was a stop at a spending limit, when projects had one: it is told as a
 * failure.)
 */
export function Stopped({ what, status, error, onResume }: { what: "research" | "build"; status: "paused" | "failed" | "stalled"; error: string | null; onResume: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.rest");
  const title = status === "stalled" ? t(`stalled.${what}`) : t(`interrupted.${what}`);
  const kept = t(`kept.${what}`);
  const body = status === "stalled" ? t("stalledBody", { kept }) : error ? t("failedBodyWhy", { error, kept }) : t("failedBody", { kept });
  return (
    <div className="absolute inset-x-0 top-0 flex items-center justify-center px-6" style={{ bottom: BAR }}>
      <div className="w-[min(560px,90vw)] rounded-[26px] px-10 py-8 text-center backdrop-blur-xl" style={{ background: `rgb(${P.pageRgb} / 0.88)`, boxShadow: `0 40px 110px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)`, animation: `flow-rise .6s ${SWIFT} both` }}>
        <Kick warm>{title}</Kick>
        <p className="mt-4 text-[15px] leading-[1.75]" style={clampLines(5)}>
          {body}
        </p>
        <div className="mt-6 flex items-center justify-center gap-6">
          <Go onClick={onResume}>{t("resume")}</Go>
        </div>
      </div>
    </div>
  );
}
