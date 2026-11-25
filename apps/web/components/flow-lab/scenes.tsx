"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MONO } from "@/components/kit/palette";
import { useApp } from "@/components/product/shell";
import { useT } from "@/lib/i18n/client";
import { faceKind, type FaceKind } from "./faces";
import { cut, useSecName, type Row } from "./play";
import { NODE, type Score } from "./score";
import { FaceIcon } from "./who";

/**
 * The flow done three other ways, on the axis (/design/matter, beside the way it is). What happens is the same, and
 * so is the picture's part in it; what differs is what every page is made of, from the first to the last.
 *
 * - 1 · the roll: what there is, is always on the page, down the right. Your worlds on the home page; what is to
 *   be asked while it is asked; the sources as they are found and read; everyone in the world as they are made,
 *   with their face; whom a way to go would reach, as it is weighed; who is in a step and what they did, as it is
 *   told. The rail of a step's parts is gone: where a step has got to is a line of marks.
 * - 2 · the record: what has happened stays on the page, a line each, the newest at the foot and in full. What was
 *   asked and answered; what was searched for; every fact, draw and tie as a world is made; everything told in a
 *   step. Any line of a step goes back to its moment.
 * - 3 · the caption: the picture has the page. What is said is a caption under it, a line or two: the question and
 *   where to write; what is asked and its answers; what is being made now; what is to be decided, above, and the
 *   ways to go on a sheet below; what is told in a step; and what is left to odds is drawn in the world itself.
 */
export const SCENES = [
  { name: "Axis", say: "As it is now" },
  { name: "Roll", say: "Every page keeps a column down the right of what is here: recent worlds, what is to be asked, sources, people, whom a move reaches, the sides in this step" },
  { name: "Record", say: "What has happened stays on every page, a line each, the newest at the foot and open in full" },
  { name: "Caption", say: "The picture fills every page and the words are a line or two at the foot; the ways to choose are a block at the bottom, and what is settled by the odds is drawn in the world" },
];

/** The parts of a step that have a short word of their own (`mark.<sec>`; what the sides do has none). */
const SHORT = new Set(["move", "reaction", "chance", "world", "next", "lookup"]);
/** What kind of thing was told, in a word (for what was not said by anyone): a part of a step by its short word, anything else by its name. */
function useMark(): (sec: string) => string {
  const t = useT("flow-lab.scenes");
  const secName = useSecName();
  return useMemo(() => (sec: string) => (SHORT.has(sec) ? t(`mark.${sec}`) : secName(sec)), [t, secName]);
}

export type Item = { key: string; kind?: FaceKind | null; tag?: string; name: string; line?: string; state: "todo" | "now" | "done"; warm?: boolean; go?: () => void };

/** What there is, down the right of a page: a name each, a face or a word before it, a line under it, dim until its turn and warm while it is at it. */
export function SideList({ title, items, foot }: { title: string; items: Item[]; foot?: React.ReactNode }) {
  const { P } = useApp();
  return (
    <div className="pointer-events-auto flex flex-col">
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{title}</div>
      <div className="mt-3 flex flex-col">
        {items.map((x) => (
          <button key={x.key} type="button" onClick={x.go} disabled={!x.go} className="flex items-start gap-3 py-[7px] text-left" style={{ opacity: x.state === "todo" ? 0.42 : 1, transition: "opacity .5s ease", cursor: x.go ? "pointer" : "default" }}>
            <span className="mt-[1px] flex w-[22px] shrink-0 justify-center">
              {x.kind ? <FaceIcon kind={x.kind} size={20} /> : <span className="mt-[7px] h-[5px] w-[5px] rounded-full" style={{ background: x.state === "now" ? P.warm : `rgb(${P.inkRgb} / ${x.state === "done" ? 0.6 : 0.3})`, transition: "background-color .4s ease" }} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]" style={{ color: x.warm || x.state === "now" ? P.warm : P.ink, transition: "color .4s ease" }}>
                {x.name}
              </span>
              {x.line != null && (
                <span className="mt-[2px] block truncate text-[11.5px]" style={{ color: P.mute }}>
                  {x.line || "\u00a0"}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      {foot}
    </div>
  );
}

/** A step is over: what comes next in a line, and the way on. */
export function Onward({ small, headline, onNext, centre = false, go }: { small: string; headline: string; onNext: () => void; centre?: boolean; /** What the way on is called. */ go?: string }) {
  const { P } = useApp();
  const t = useT("flow-lab.scenes");
  return (
    <div className={`pointer-events-auto flex flex-col ${centre ? "items-center text-center" : ""}`}>
      <div className="text-[12.5px]" style={{ color: P.mute }}>
        {small}
      </div>
      <div className="mt-3 max-w-[860px] text-[21px] leading-[1.5] font-medium">{headline}</div>
      <button type="button" onClick={onNext} className="mt-5 self-start rounded-full px-5 py-2.5 text-[14px]" style={{ background: P.warm, color: P.page, alignSelf: centre ? "center" : "flex-start" }}>
        {go ?? t("seeNextStep")}
      </button>
    </div>
  );
}

/** What was told, as it is written: where the record only has the engine's own name for it, a word of ours (`t` is flow-lab.scenes). */
const said = (t: (key: string) => string, g: string) => (/^[a-z_]+$/.test(g) ? t("checkingReality") : g);

/** Where the step has got to: a mark for each thing told, lit once told, the one being told warm; any of them goes there. */
export function Ticks({ rows, bi, done, seek }: { rows: Row[]; bi: number; done: boolean; seek: (i: number) => void }) {
  const { P } = useApp();
  const secName = useSecName();
  return (
    <div className="pointer-events-auto flex items-center">
      {rows.map((r, k) => {
        const now = !done && k === bi;
        const told = done || k < bi;
        const gap = k > 0 && rows[k - 1]!.sec !== r.sec;
        return (
          <button key={r.i} type="button" onClick={() => seek(k)} title={`${secName(r.sec)}${r.who ? ` · ${r.who}` : ""}`} className="flex h-4 items-center" style={{ paddingLeft: gap ? 9 : 2, paddingRight: 2 }}>
            <span className="block rounded-full" style={{ width: now ? 14 : 5, height: 3, background: now ? P.warm : `rgb(${P.inkRgb} / ${told ? 0.62 : 0.18})`, transition: "width .35s cubic-bezier(.2,.7,.2,1), background-color .35s ease" }} />
          </button>
        );
      })}
    </div>
  );
}

export type Party = { name: string; body: number; kind: FaceKind; you: boolean; ks: number[] };

/** Who is in this step, always on the page: each with their face, what they did once it is told, and who is at it now. */
export function Roster({ people, rows, bi, done, seek, pick }: { people: Party[]; rows: Row[]; bi: number; done: boolean; seek: (i: number) => void; pick: (body: number) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.scenes");
  const mark = useMark();
  // what was not done by anyone, counted: how much of each has been told
  const rest = ["chance", "world", "next"].map((sec) => {
    const ks = rows.map((r, k) => (r.sec === sec ? k : -1)).filter((k) => k >= 0);
    return { sec, n: ks.length, told: ks.filter((k) => done || k < bi).length, now: !done && ks.includes(bi) };
  });
  return (
    <div className="pointer-events-auto flex flex-col">
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{t("sidesInStep", { count: people.length })}</div>
      <div className="mt-3 flex flex-col">
        {people.slice(0, 9).map((p) => {
          const last = [...p.ks].reverse().find((k) => done || k <= bi);
          const now = !done && last === bi;
          const told = last != null && !now;
          return (
            <div key={p.name} className="flex items-start gap-3 py-[7px]" style={{ opacity: last == null ? 0.42 : 1, transition: "opacity .5s ease" }}>
              <button type="button" onClick={() => p.body >= 0 && pick(p.body)} className="mt-[1px] shrink-0" title={t("seePerson")}>
                <FaceIcon kind={p.kind} size={20} />
              </button>
              <button type="button" onClick={() => seek(p.ks[0]!)} className="min-w-0 flex-1 text-left">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[13px]" style={{ color: p.you || now ? P.warm : P.ink, transition: "color .4s ease" }}>
                    {p.you ? t("you") : cut(p.name, 16)}
                  </span>
                  {now && (
                    <span className="k-pulse h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.warm }} />
                  )}
                </span>
                <span className="mt-[2px] block truncate text-[11.5px]" style={{ color: P.mute, opacity: told || now ? 1 : 0, transition: "opacity .5s ease" }}>
                  {last != null ? said(t, rows[last]!.gist) : " "}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1" style={{ fontFamily: MONO, fontSize: 10.5 }}>
        {rest
          .filter((x) => x.n > 0)
          .map((x) => (
            <span key={x.sec} style={{ color: x.now ? P.warm : P.faint, transition: "color .4s ease" }}>
              {mark(x.sec)} {x.told}/{x.n}
            </span>
          ))}
      </div>
    </div>
  );
}

/** A line of the record, in pixels. */
const LINE = 32;
const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Everything told so far, a line each, and one of them at the foot in full. Nothing in it jumps and nothing in it
 * waits, however fast things come: where every line is, and how plainly, is one number (how many lines there are),
 * and that number follows what has come on a spring. So a line comes up from behind what is shown in full, takes its
 * place above it, climbs as more come and goes out at the top, at the pace they come; many at once are a rush, not a
 * leap, and a steady run of them is a steady climb with no stop between one and the next.
 *
 * What is shown in full keeps its own time (`hold`): it stays long enough to be read, and then the next thing that
 * comes takes its place, the one going first (up, toward the lines) and the other then coming in from under, never
 * the one over the other; the room it takes eases from the one's height to the other's. While it stays, what else
 * comes goes straight into the lines. When it gives way it joins the lines only if nothing newer is already there
 * (so the lines are always in the order things came); otherwise it has been read, and goes.
 */
export function Log({ rows, bi, done, kinds, more, seek, lines = 7, hold = 0 }: { rows: Row[]; bi: number; done: boolean; kinds: (FaceKind | null)[]; more: (k: number) => string; seek: (i: number) => void; lines?: number; hold?: number }) {
  const { P } = useApp();
  const t = useT("flow-lab.scenes");
  const markOf = useMark();
  const upto = done ? rows.length - 1 : bi;
  const box = useRef<HTMLDivElement>(null);
  type At = { seen: number; list: number[]; base: number; feat: number; featAt: number; fulls: number[]; h: number; v: number; tall: number; tv: number; on: number; ready: boolean; full: Map<number, number> };
  const at = useRef<At | null>(null);
  if (!at.current || upto < at.current.seen) {
    // (at first, or gone back to an earlier moment: what came before is already in its lines)
    const list = Array.from({ length: Math.max(0, upto) }, (_, k) => k).slice(-60);
    at.current = { seen: upto, list, base: Math.max(0, upto) - list.length, feat: upto, featAt: 0, fulls: [upto], h: Math.max(0, upto), v: 0, tall: 0, tv: 0, on: 0, ready: false, full: new Map() };
  }
  const m = at.current;
  if (upto > m.seen) {
    // (what has just come, taken in once: the newest of it is shown in full if what is there has had its time)
    const now = performance.now();
    const lead = hold <= 0 || now - m.featAt >= hold ? upto : -1;
    if (lead >= 0 && m.feat >= 0 && (m.list.length === 0 || m.list[m.list.length - 1]! < m.feat)) m.list.push(m.feat);
    for (let k = m.seen + 1; k <= upto; k++) if (k !== lead) m.list.push(k);
    if (lead >= 0) {
      m.feat = lead;
      m.featAt = now;
      m.fulls = [...m.fulls.filter((k) => k !== lead).slice(-2), lead];
    }
    m.seen = upto;
    if (m.list.length > 240) {
      const gone = m.list.length - 120;
      m.list.splice(0, gone);
      m.base += gone;
    }
  }
  const feat = m.feat;
  const count = m.base + m.list.length;
  const paint = useRef<(dt: number) => void>(() => {});
  paint.current = (dt) => {
    const el = box.current;
    if (!el) return;
    const cur = el.querySelector<HTMLElement>(`[data-full="${feat}"]`);
    const want = cur ? cur.offsetHeight : m.tall;
    if (!m.ready) {
      m.h = count;
      m.tall = want;
      m.ready = true;
    }
    let left = Math.min(dt, 0.5);
    while (left > 1e-4) {
      const d = Math.min(left, 1 / 60);
      // (a spring, and a soft one: a run of lines is one climb, and many at once are gone through fast, a rush and
      // not a leap, since where it is never skips)
      m.v += (36 * (count - m.h) - 12 * m.v) * d;
      m.h += m.v * d;
      m.tv += Math.max(-1500, Math.min(1500, 144 * (want - m.tall) - 24 * m.tv)) * d;
      m.tall += m.tv * d;
      left -= d;
    }
    m.on = Math.min(1, m.on + dt / 0.5);
    const base = el.clientHeight - m.tall;
    const seen = new Set<number>();
    // (one after the other, not one over the other: the next does not come in until the last has all but gone,
    // so two sentences are never read through each other)
    let going = 0;
    for (const [k, p] of m.full) if (k !== feat) going = Math.max(going, p);
    el.querySelectorAll<HTMLElement>("[data-full]").forEach((f) => {
      const k = Number(f.dataset.full);
      seen.add(k);
      const is = k === feat;
      const p = Math.min(1, Math.max(0, (m.full.get(k) ?? 0) + (is ? (going > 0.3 ? 0 : dt / 0.26) : -dt / 0.16)));
      m.full.set(k, p);
      const a = ease(p);
      f.style.opacity = String(a);
      f.style.transform = `translateY(${(base + (is ? (1 - a) * 10 : -(1 - a) * 10)).toFixed(2)}px)`;
      f.style.pointerEvents = is ? "auto" : "none";
    });
    for (const k of [...m.full.keys()]) if (!seen.has(k)) m.full.delete(k);
    const all = ease(m.on);
    el.querySelectorAll<HTMLElement>("[data-r]").forEach((r) => {
      // how many lines above what is shown in full it is: under 0 it is still behind it, at 1 it is the line next above
      const q = m.h - Number(r.dataset.r);
      const y = base - q * LINE;
      const a = (q < 1 ? 0.72 * ease((q - 0.45) / 0.55) : Math.max(0.18, 0.72 - (q - 1) * 0.1)) * Math.min(1, Math.max(0, lines - q)) * Math.min(1, Math.max(0, y / 18)) * all;
      r.style.opacity = a.toFixed(3);
      r.style.transform = `translateY(${y.toFixed(2)}px)`;
      r.style.pointerEvents = a > 0.1 ? "auto" : "none";
    });
  };
  // (after every render, before it is seen: what has just been put on the page is where it belongs)
  useLayoutEffect(() => paint.current(0));
  useEffect(() => {
    let id = 0;
    let was = performance.now();
    const tick = (now: number) => {
      paint.current(Math.max(0, (now - was) / 1000));
      was = now;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  const mark = (r: Row, k: number) => (
    <span className="mt-[1px] flex w-[34px] shrink-0 justify-center">
      {kinds[k] ? <FaceIcon kind={kinds[k]!} size={18} /> : <span className="whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 9.5, color: r.sec === "move" ? P.warm : P.faint, lineHeight: "18px" }}>{markOf(r.sec)}</span>}
    </span>
  );
  // (the lines there are to see, and those still on their way up from behind what is shown in full)
  const from = Math.max(m.base, Math.min(count, Math.floor(m.h)) - lines - 1);
  return (
    <div ref={box} className="pointer-events-auto relative h-full overflow-hidden">
      {m.list.slice(from - m.base).map((k, j) => {
        const r = rows[k];
        if (!r) return null;
        return (
          <button key={`l${r.i}`} data-r={from + j} type="button" onClick={() => seek(k)} className="absolute inset-x-0 top-0 flex items-center gap-3 text-left" style={{ height: LINE, opacity: 0, willChange: "transform, opacity" }}>
            {mark(r, k)}
            <span className="flex min-w-0 flex-1 items-baseline gap-3">
              {r.who && (
                <span className="max-w-[40%] shrink-0 truncate text-[12.5px]" style={{ color: P.mute }}>
                  {cut(r.who, 14)}
                </span>
              )}
              <span className="truncate text-[13px]" style={{ color: `rgb(${P.inkRgb} / 0.82)` }}>
                {said(t, r.gist)}
              </span>
            </span>
          </button>
        );
      })}
      {m.fulls.map((k) => {
        const r = rows[k];
        if (!r) return null;
        const extra = more(k);
        return (
          <button key={`f${r.i}`} data-full={k} type="button" onClick={() => seek(k)} className="absolute inset-x-0 top-0 flex items-start gap-3 pt-3 pb-[7px] text-left" style={{ opacity: 0, willChange: "transform, opacity" }}>
            {mark(r, k)}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-3">
                {r.who && (
                  <span className="max-w-[40%] shrink-0 truncate text-[12.5px]" style={{ color: P.warm }}>
                    {cut(r.who, 14)}
                  </span>
                )}
                <span className="text-[16.5px] leading-[1.5]" style={{ color: P.ink }}>
                  {cut(said(t, r.gist), 96)}
                </span>
              </span>
              {extra && (
                <span className="mt-1.5 block text-[12.5px] leading-[1.6]" style={{ color: P.mute }}>
                  {cut(extra, 84)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** What is being told, as a caption under the picture: who (and to whom) in a line, what in a line or two. */
export function Caption({ row, kind, to, more }: { row: Row; kind: FaceKind | null; to: string | null; more: string }) {
  const { P } = useApp();
  const t = useT("flow-lab.scenes");
  const mark = useMark();
  const secName = useSecName();
  const who = row.sec === "move" ? t("you") : row.who ? `${row.who}${row.sec !== "reaction" ? ` · ${secName(row.sec)}` : ""}` : mark(row.sec);
  return (
    <div key={row.i} className="flex flex-col items-center px-8 text-center" style={{ animation: "flow-rise .5s cubic-bezier(.2,.7,.2,1) both" }}>
      <div className="flex items-center gap-2.5 text-[12.5px]" style={{ color: P.mute }}>
        {kind && <FaceIcon kind={kind} size={18} />}
        <span style={{ color: row.sec === "move" ? P.warm : P.ink }}>{cut(who, 20)}</span>
        {to && (
          <>
            <span style={{ color: P.faint }}>→</span>
            <span>{to}</span>
          </>
        )}
      </div>
      <div className="mt-3 max-w-[860px] text-[21px] leading-[1.5] font-medium" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {said(t, row.gist)}
      </div>
      {more && (
        <div className="mt-2.5 max-w-[720px] truncate text-[13px]" style={{ color: P.mute }}>
          {cut(more, 60)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- a world being made

/** What part of a world being made each kind of thing is (a Row's `sec`, see play.tsx). */
const MADE: Record<string, string> = { appear: "appear", fact: "fact", draw: "profile", persona: "profile", tie: "tie", crowd: "crowd", risk: "risk", mile: "milestone", open: "start" };

/**
 * While a world is made, the three other ways: everyone in it down the right as they come, with their face and how
 * much is known of them (1); every fact, draw and tie, a line each, the newest in full (2); what is being made now
 * as a caption under the world (3).
 */
export function BuildScene({ scene, score, T, pick }: { scene: number; score: Score; T: number; pick: (body: number) => void }) {
  const t = useT("flow-lab.scenes");
  const made = useMemo(() => {
    const kindOf = (i: number) => (i >= 0 && score.bodies[i] ? faceKind({ seat: score.bodies[i]!.seat, ent: score.bodies[i]!.ent, crowd: score.bodies[i]!.kind !== NODE }) : null);
    const beats = score.build.beats.filter((b) => MADE[b.k] && (b.ev.text || b.ev.head)).sort((a, b) => a.s - b.s);
    const rows: Row[] = beats.map((b, i) => ({ i, sec: b.k === "crowd" && score.bodies[b.body]?.force ? "force" : MADE[b.k]!, who: b.body >= 0 && !score.bodies[b.body]?.seed ? (score.bodies[b.body]?.name ?? "") : "", gist: b.k === "draw" ? t("drawn", { trait: b.ev.head.replace(/^.*?· /, ""), value: b.ev.picked ?? b.ev.text }) : b.ev.text || b.ev.head }));
    return { beats, rows, kinds: beats.map((b) => (b.k === "tie" || b.k === "crowd" ? null : kindOf(b.body))), kindOf };
  }, [score, t]);
  let n = 0;
  while (n < made.beats.length && made.beats[n]!.s <= T) n++;
  if (n === 0) return null;
  if (scene === 2)
    // (a world is written far faster than it can be read, some six things a second and twenty at once: the lines
    // come at that pace; one of them is shown in full, long enough to be read, while the rest go by above it)
    return (
      <div className="absolute right-9 w-[440px]" style={{ top: 110, bottom: 54 + 34 }}>
        <Log rows={made.rows} bi={n - 1} done={false} kinds={made.kinds} more={() => ""} seek={() => {}} lines={9} hold={1000} />
      </div>
    );
  if (scene === 3)
    return (
      <div className="absolute inset-x-0" style={{ bottom: 54 + 44 }}>
        <Caption row={made.rows[n - 1]!} kind={made.kinds[n - 1] ?? null} to={null} more="" />
      </div>
    );
  // everyone who has come so far, in the order they came: how much is known of each, and who is being written now
  const seen = new Map<number, { at: number; facts: number; now: boolean }>();
  for (let k = 0; k < n; k++) {
    const b = made.beats[k]!;
    const i = b.body;
    const body = score.bodies[i];
    if (i < 0 || !body || body.kind !== NODE || body.risk || body.seed) continue;
    const had = seen.get(i) ?? { at: b.s, facts: 0, now: false };
    if (b.k === "fact") had.facts++;
    if (T < b.s + b.d + 0.6) had.now = true;
    seen.set(i, had);
  }
  const items: Item[] = [...seen.entries()]
    .sort((a, b) => a[1].at - b[1].at)
    .slice(0, 12)
    .map(([i, x]) => ({ key: String(i), kind: made.kindOf(i), name: cut(score.bodies[i]!.name, 18), line: x.facts ? t("facts", { count: x.facts }) : "", state: x.now ? "now" : "done", warm: !!score.bodies[i]!.seat, go: () => pick(i) }));
  return (
    <div className="absolute right-9 w-[300px]" style={{ top: 110 }}>
      <SideList title={t("peopleAndInstitutions", { count: seen.size })} items={items} />
    </div>
  );
}
