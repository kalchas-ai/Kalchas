"use client";

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WorldView } from "@kalchas/core";
import { useApp } from "@/components/product/shell";
import { MONO } from "@/components/kit/palette";
import { scale } from "@/components/product/replay/metrics";
import { between, lines, numsOf, reachOf, short, stepsOf, type Data, type Option, type Play } from "@/components/product/replay/stage/data";
import { beatsOf, type Beat as Told } from "@/components/product/replay/stage/engine";
import { BranchPick, Spend, TimeTrack } from "@/components/product/replay/stage/parts";
import { Hard, STAGE_CSS } from "@/components/product/replay/stage/stage";
import { AskDock } from "@/components/product/replay/stage/dock";
import { GoalPill } from "@/components/product/replay/stage/turn";
import { NamedText, NamesPlay } from "@/components/product/replay/stage/names";
import { callName, useTraceClock, useTraces, type Call, type Trace } from "@/components/product/replay/stage/trace";
import { useLocale, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";
import type { Ev, Stream } from "@/lib/stream";
import { Galaxy } from "./galaxy";
import { NODE, playActs, type Score } from "./score";
import type { Phase, Stage } from "./stage";

/**
 * The play page, made again on the living world. The world is the whole page; what there is to read or to do is one
 * card in the middle of it, always in the same place, and the world steps back behind it while there is reading to
 * do.
 *
 * - The moment: the card holds the question, what makes it hard, the ways to go side by side with what the one you
 *   point at means, and your own words; whoever that way would reach is lit in the world behind.
 * - You act: for a moment the page is all the world's, at full, your move going out across it as a wave.
 * - The world working: the card does not move. Its left side is a window onto the world, and whoever is being told
 *   about is brought into it; its right side says, large, what they say, do, think, take to be so. It goes on by
 *   itself in the order and at the pace it really happened. To the left of the card, the step as a line of cause,
 *   each thing told a point; to the right, how much the engine has worked out.
 * - Where it stops: the same card, the whole world in its window, what the step came to and what is asked next.
 *
 * It replays a real step of a real play; nothing here writes or spends.
 */

export const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
export const WORLDLY = new Set(["moment"]);
/**
 * How the engine opens what you did, when it writes it of you ("\u4eca\u5929\u4e3b\u89d2\u51b3\u5b9a", Chinese for "today the
 * protagonist decided", with "today" and "decided" each optional): taken off before it is shown as yours.
 */
export const DID_LEAD = /^(\u4eca\u5929)?\u4e3b\u89d2(\u51b3\u5b9a|\u4eca\u5929)?/;
/**
 * The engine's calls that tell of no one (they look into the real world, or work beside a play), each said in a few
 * words in the interface language (`call.<purpose>` of flow-lab.play).
 */
export const OTHER = new Set([
  "risks",
  "risk_lookup_search",
  "risk_lookup",
  "persona_variables",
  "persona_write",
  "persona_lookup",
  "persona_lookup_search",
  "newcomer_lookup",
  // (what the engine has come to do on the way since)
  "body_variables",
  "newcomer_personas",
  "chance_rate",
  "outcome_rate",
  "handbook_rate",
  "estimate_odds",
  "duration",
  "actor_duration",
  "actor_schedule",
  "macro",
  "delegated_reply",
  // (what is done beside a play, while the person reads)
  "memory_digest",
  "persona",
  "lookup_queries",
  "lookup_read",
  // (engine 12, one model writing the play stop by stop: the rounds before a stop is written, and what is done beside it)
  "narrate_stop",
  "narrate_answer",
  "narrate_world",
  "narrate_compress",
  "narrate_report",
  "narrate_compare",
]);
/** What one of the engine's calls is doing, in a few words: `t` is the texts of flow-lab.play, `tc` those of product.replay.stage.trace. */
export const otherName = (t: T, tc: T, c: Call) => (OTHER.has(c.purpose) ? t(`call.${c.purpose}`) : callName(c, tc));

/** A day of the world ("2026-03-05"), as the interface language writes a date; anything else as it is. */
export const dayOf = (d: string, locale: string) => {
  if (!/^\d+-\d+-\d+$/.test(d)) return d;
  const at = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(at.getTime()) ? d : new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(at);
};
const told = new WeakMap<Stage, unknown>();
const NONE = new Map<number, string>();
const LENS = 300;
const CARD_H = 444;
/** Where the card is on a page of this size: in the middle, the same for every thing told. */
const frameOf = (w: number, h: number) => {
  const cw = Math.max(700, Math.min(880, w - 600));
  return { x: Math.round((w - cw) / 2), y: Math.max(176, Math.round((h - CARD_H) / 2 + 20)), w: cw, h: CARD_H };
};

export function PlayNext({ world, play, stream, score, stepN }: { world: WorldView; play: Play; stream: Stream; score: Score; stepN: number | null }) {
  const { P } = useApp();
  // (`t` is the step's own time here: the texts are `tx`)
  const tx = useT("flow-lab.play");
  const tc = useT("product.replay.stage.trace");
  const locale = useLocale();
  const d: Data = { world, play };
  const s = play.situation;
  const opts = s?.recommendations ?? [];
  const steps = useMemo(() => stepsOf(play), [play]);
  const done = steps.filter((x) => x.did);
  const tr = useTraces(play.branch.id, done.map((x) => x.n));
  const trace = (stepN != null ? tr.all?.find((x) => x.step === stepN) : null) ?? tr.best;
  const beats = useMemo(() => (trace ? beatsOf(trace) : []), [trace]);
  const total = beats.reduce((a, b) => a + b.dur, 0) || 1;
  const [phase, setPhase] = useState<Phase>("decide");
  const [intro, setIntro] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clock = useTraceClock(total, phase === "run" && !intro, speed, () => setPhase("result"));
  const [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1440, h: 852 });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const f = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const F = frameOf(box.w, box.h);
  const side = F.x - 36 - 30;

  // where the telling is: which thing, how far into it, and the step's own time that corresponds
  const pt = phase === "decide" ? 0 : clock.t;
  const bi = phase === "result" ? beats.length - 1 : Math.max(0, beats.findIndex((b) => pt < b.at + b.dur));
  const beat = phase === "run" ? (beats[bi] ?? null) : null;
  const q = beat ? Math.max(0, Math.min(1, (pt - beat.at) / beat.dur)) : 0;
  const t = !trace ? 0 : phase === "result" ? trace.ms : beat ? beat.t0 + (beat.t1 - beat.t0) * (1 - Math.pow(1 - Math.min(1, q / 0.45), 2)) : 0;
  const at = trace ? steps.findIndex((x) => x.n === trace.step) : -1;
  const played = at >= 0 ? steps[at]! : null;
  const after = at >= 0 ? (steps[at + 1] ?? null) : null;
  const kick = useRef(false);
  const act = () => {
    if (!trace) return;
    clock.reset();
    kick.current = true;
    setIntro(true);
    setPhase("run");
  };
  useEffect(() => {
    if (!intro) return;
    const id = window.setTimeout(() => setIntro(false), 2700);
    return () => window.clearTimeout(id);
  }, [intro]);

  // the picture: what happens in this step, each thing at the moment it is told
  const acts = useMemo(() => {
    if (!trace || !beats.length) return null;
    const start = trace.start ?? 0;
    const when = (e: Ev) => {
      const te = e.t - start;
      const b = beats.find((y) => te <= y.t1) ?? beats[beats.length - 1]!;
      return (b.at + Math.max(0, Math.min(1, (te - b.t0) / Math.max(1, b.t1 - b.t0))) * b.dur * 0.7) / 1000;
    };
    return playActs(stream, score, start, start + trace.ms + 2000, when);
  }, [stream, score, trace, beats]);
  // who each thing told is about
  const bodies = useMemo(
    () =>
      beats.map((b) => {
        const c = b.c;
        if (c.actor) return score.index.get(c.actor.id) ?? -1;
        if (c.purpose === "rule") return score.seat;
        if (c.purpose === "resolve_uncertain") {
          const text = c.detail.items?.[b.item ?? 0]?.question ?? "";
          const hit = score.bodies.filter((y) => y.kind === NODE && !y.risk && !y.seat && !y.seed && y.name.length >= 2 && text.includes(y.name)).sort((a, z) => text.indexOf(a.name) - text.indexOf(z.name))[0];
          return hit ? hit.i : score.seat;
        }
        return -1;
      }),
    [beats, score],
  );
  const rows = useMemo(() => rowsOf(beats, tx, tc), [beats, tx, tc]);
  const acted = useMemo(() => new Set<number>([...(score.seat >= 0 ? [score.seat] : []), ...bodies.filter((i) => i >= 0)]), [bodies, score]);
  // while you decide: whoever the way you point at would reach
  const reach = useMemo(() => (opts[focus] ? reachOf(opts[focus]!, play.graph.nodes, play.seatId) : []), [opts, focus, play]);
  const reached = useMemo(() => new Set<number>([...(score.seat >= 0 ? [score.seat] : []), ...reach.map((n) => score.index.get(n.id) ?? -1).filter((i) => i >= 0)]), [reach, score]);

  const worldly = !!beat && WORLDLY.has(beat.c.purpose);
  const body = beat ? bodies[bi]! : -1;
  const item = beat?.c.purpose === "resolve_uncertain" ? beat.c.detail.items?.[beat.item ?? 0] : undefined;
  const thinking = trace && beat ? trace.calls.filter((c) => c.purpose === "person" && t >= c.from && t < c.to && c.id !== beat.c.id).map((c) => c.actor?.name ?? tx("aSide")) : [];
  const live = useRef({ phase, intro, pt, body, worldly, item, q });
  live.current = { phase, intro, pt, body, worldly, item, q };
  const dayN = Math.max(1, Math.round((Date.parse(play.branch.simTime) - Date.parse(world.scope?.timeStart ?? play.branch.simTime)) / 864e5));
  const who = beat && body >= 0 && !worldly ? score.bodies[body]! : null;
  const seen = phase === "result" || worldly || (beat && body < 0) ? tx("wholeWorld") : who ? (who.seat ? tx("you") : who.org ? tx("institution") : tx("person")) : "";

  return (
    <div ref={root} className="fixed inset-x-0 top-12 bottom-0 overflow-hidden" style={{ background: P.page }}>
      <style>{`${STAGE_CSS}
@keyframes flow-halo { 0%, 100% { box-shadow: 0 0 0 0 rgb(${P.warmRgb} / 0.5); } 50% { box-shadow: 0 0 0 6px rgb(${P.warmRgb} / 0); } }
@keyframes flow-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.flow-rise { animation: flow-rise .5s cubic-bezier(.2,.7,.2,1) both; }`}</style>
      <Galaxy
        score={score}
        drive={(st) => {
          const c = live.current;
          st.mode = "play";
          if (acts && told.get(st) !== acts) {
            told.set(st, acts);
            st.setPlay(acts.before, acts.now);
          }
          st.phase = c.phase;
          st.T = c.pt / 1000;
          st.full = c.intro;
          if (kick.current) {
            kick.current = false;
            st.kick();
          }
          const telling = c.phase === "run" && !c.intro;
          const whole = c.worldly || c.body < 0;
          st.subject = telling && !whole ? c.body : -1;
          st.wide = telling && whole;
          st.framed = telling;
          st.lit = c.phase === "result" ? acted : reached;
          st.notes = NONE;
          st.odds = c.item && telling ? { body: c.body, options: c.item.outcomes, picked: c.item.chosen, k: c.q } : null;
          const w = st.field.w;
          const h = st.field.h;
          if (c.phase === "decide" || c.intro) {
            // the card is in the middle, or the page is all the world's: the world is whole, behind
            st.margins = { l: 0, r: 0, t: 84, b: 56 };
            st.centre = null;
            return;
          }
          // the world is seen at full through the window of the card, and faintly everywhere else
          const f = frameOf(w, h);
          st.margins = { l: f.x + 24, r: w - (f.x + LENS) + 24, t: f.y + 40, b: h - (f.y + f.h) + 40 };
          st.centre = { x: f.x + LENS / 2, y: f.y + f.h / 2 - 2 };
        }}
      />

      {/* the main line's numbers, and what the page always has at hand */}
      <div className="absolute top-6 right-9 left-9 flex items-start gap-10 transition-opacity duration-500" style={{ opacity: intro ? 0.25 : 1 }}>
        <div className="min-w-0 flex-1">
          <Vitals play={play} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Spend d={d} P={P} />
          <BranchPick d={d} P={P} go={() => {}} />
          <Tools d={d} />
        </div>
      </div>

      {/* ------------------------------------------------ the moment */}
      {phase === "decide" && (
        <>
          <div className="absolute inset-x-0 top-[92px] bottom-[84px] flex items-center justify-center">
            <div className="flow-rise rounded-[28px] backdrop-blur-xl" style={{ width: "min(900px, calc(100vw - 80px))", background: `rgb(${P.pageRgb} / 0.86)`, boxShadow: `0 40px 110px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)` }}>
              <div className="px-10 pt-7 pb-5">
                <div className="flex items-baseline justify-between gap-4" style={{ fontFamily: MONO, fontSize: 11 }}>
                  <span style={{ color: P.warm }}>{tx("dayLine", { date: dayOf(play.branch.simTime, locale), day: dayN, step: play.branch.step })}</span>
                  <span style={{ color: P.faint }}>{tx("timeStopped")}</span>
                </div>
                <h1 className="mt-3 text-[27px] leading-[1.42] font-medium" title={s?.scene}>
                  {s?.headline}
                </h1>
                <div className="mt-4">
                  <Hard P={P} d={d} n={3} size={14.5} />
                </div>
              </div>
              <Ways opts={opts} focus={focus} setFocus={setFocus} reach={(o) => reachOf(o, play.graph.nodes, play.seatId).map((n) => n.name)} onAct={act} note={trace ? tx("sampleNote", { step: trace.step }) : tr.loading ? tx("traceLoading") : tx("noTrace")} ready={!!trace} />
            </div>
          </div>
          <div className="absolute bottom-3 left-9 flex h-12 items-center" style={{ width: "min(340px, 24vw)" }}>
            <div className="min-w-0 flex-1">
              <TimeTrack d={d} P={P} steps={steps} warmTo />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
            <AskDock P={P} d={d} ideas={[opts[focus] ? tx("askWhoFirst", { way: short(opts[focus]!.title, 14) }) : null, tx("askBiggestRisk")].filter((x): x is string => !!x)} />
          </div>
        </>
      )}

      {/* ------------------------------------------------ your move going out: the page is all the world's */}
      {intro && played && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%] text-center">
          <div className="flow-rise mx-auto inline-flex max-w-[min(760px,80vw)] items-center gap-3 rounded-full px-6 py-2.5 text-[16px] backdrop-blur-md" style={{ background: `rgb(${P.pageRgb} / 0.6)`, boxShadow: `inset 0 0 0 1px rgb(${P.warmRgb} / 0.35)` }}>
            <span style={{ color: P.warm }}>{tx("you")}</span>
            <span className="truncate">{short(played.did!.replace(DID_LEAD, ""), 44)}</span>
          </div>
          <div className="mt-3 text-[12px]" style={{ color: P.mute }}>
            {tx("moveGoingOut")}
          </div>
        </div>
      )}

      {/* ------------------------------------------------ the world working, and where it stops */}
      {phase !== "decide" && !intro && trace && played && (
        <>
          {/* your move and the world's clock */}
          <div className="pointer-events-none absolute inset-x-0 text-center" style={{ top: Math.max(92, F.y - 96) }}>
            <div className="mx-auto inline-flex max-w-[min(620px,60vw)] items-center gap-2 rounded-full px-4 py-1.5 text-[13px]" style={{ background: `rgb(${P.warmRgb} / 0.11)` }}>
              <span style={{ color: P.warm }}>{tx("you")}</span>
              <span className="truncate">{short(played.did!.replace(DID_LEAD, ""), 34)}</span>
            </div>
            <div className="mt-2.5 leading-none" style={{ fontFamily: MONO, fontSize: 22, fontWeight: 300, color: phase === "run" ? P.ink : P.mute, letterSpacing: "0.04em" }}>
              {between(played.at, after?.at ?? play.branch.simTime, t / trace.ms)}
            </div>
          </div>

          {side >= 190 && (
            <>
              <div className="flow-rise absolute left-9" style={{ top: F.y + 6, width: Math.min(248, side) }}>
                <Rail rows={rows} bi={phase === "result" ? beats.length : bi} done={phase === "result"} seek={(i) => (clock.reset(beats[i]?.at ?? 0), setPhase("run"))} />
              </div>
              <div className="flow-rise absolute right-9" style={{ top: F.y + 6, width: Math.min(232, side) }}>
                <Engine trace={trace} t={t} />
              </div>
            </>
          )}

          {/* the card: always here, always this size; its left side a window onto the world */}
          <div className="flow-rise absolute" style={{ left: F.x, top: F.y, width: F.w, height: F.h }}>
            <div className="pointer-events-none absolute inset-0 rounded-[26px]" style={{ boxShadow: `0 44px 120px rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(${P.inkRgb} / 0.1)` }} />
            <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: LENS }}>
              <div className="absolute top-5 left-6" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>
                {seen}
              </div>
              {phase === "run" && thinking.length > 0 && (
                <div className="absolute inset-x-6 bottom-5 truncate text-[11px]" style={{ color: P.faint }}>
                  {tx("alsoThinking", { names: thinking.join(tx("listSep")) })}
                </div>
              )}
            </div>
            <div className="absolute inset-y-0 right-0 flex flex-col rounded-r-[26px] backdrop-blur-xl" style={{ left: LENS, background: `rgb(${P.pageRgb} / 0.9)`, boxShadow: `inset 1px 0 0 rgb(${P.inkRgb} / 0.08)` }}>
              <div className="min-h-0 flex-1 overflow-hidden px-9 pt-7">
                {phase === "run" && beat ? (
                  <div key={beat.key} className="sim-in">
                    <Scene beat={beat} q={q} />
                  </div>
                ) : phase === "result" ? (
                  <Stop play={play} trace={trace} beats={beats} headline={after?.q ?? s?.headline ?? ""} from={played.at} to={after?.at ?? play.branch.simTime} onNext={() => setPhase("decide")} />
                ) : null}
              </div>
              {phase === "run" && (
                <div className="flex h-[52px] shrink-0 items-center gap-5 px-9 text-[12px]" style={{ color: P.mute, boxShadow: `inset 0 1px 0 rgb(${P.inkRgb} / 0.07)` }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>
                    {bi + 1} / {beats.length}
                  </span>
                  <button type="button" onClick={() => beat && clock.reset(Math.min(total, beat.at + beat.dur))}>
                    {tx("nextLineArrow")}
                  </button>
                  <button type="button" onClick={() => clock.end()}>
                    {tx("skipToResult")}
                  </button>
                  <span className="flex-1" />
                  {[1, 2].map((x) => (
                    <button key={x} type="button" onClick={() => setSpeed(x)} style={{ fontFamily: MONO, fontSize: 11, color: speed === x ? P.ink : P.faint }}>
                      ×{x}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- the top row

/** The numbers the main line turns on: each with where it started, where it is, and which way it has gone. */
export function Vitals({ play, hot, max, onMore }: { play: Play; hot?: Map<string, string>; /** No more than this many (what has moved, first): the rest are a press away. */ max?: number; onMore?: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.play");
  const locale = useLocale();
  const every = numsOf(play, locale);
  const nums = max && every.length > max ? [...every].sort((a, b) => Number(!!hot?.get(b.m.label)) - Number(!!hot?.get(a.m.label)) || Number(!!b.d) - Number(!!a.d)).slice(0, max) : every;
  return (
    <div className="grid items-start gap-x-7" style={{ gridTemplateColumns: `repeat(${Math.min(7, Math.max(1, nums.length))}, minmax(0, 1fr))${nums.length < every.length ? " auto" : ""}` }}>
      {nums.map((n) => {
        const v = play.branch.metrics[n.m.key];
        const v0 = play.branch.startMetrics[n.m.key];
        const s1 = scale(n.m, v);
        const s0 = scale(n.m, v0);
        const rel = v != null && v0 != null ? Math.max(-1, Math.min(1, (v - v0) / Math.max(Math.abs(v0), Math.abs(v), 1e-9))) : 0;
        const tone = n.bad ? P.warm : P.ink;
        // this number has just been moved by something in the step being told
        const moved = hot?.get(n.m.label);
        return (
          <div key={n.m.key} data-metric={n.m.label} className="min-w-0 overflow-hidden" title={`${n.m.label}\n${t("startToNow", { start: n.start, now: n.now })}\n${n.m.description ?? ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[11.5px]" style={{ color: P.mute }}>
                {n.m.label}
              </span>
              {(moved || n.d) && <span className="shrink-0" style={{ fontFamily: MONO, fontSize: 10.5, color: moved || n.bad ? P.warm : P.mute, transition: "color .6s" }}>{moved ?? n.d}</span>}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
              <span style={{ fontFamily: MONO, fontSize: 19, fontVariantNumeric: "tabular-nums", color: moved ? P.warm : undefined, transition: "color .6s" }}>{n.value}</span>
              {n.unit && (
                <span className="text-[11px]" style={{ color: P.mute }}>
                  {n.unit}
                </span>
              )}
            </div>
            <div className="relative mt-1.5 h-[9px]">
              <div className="absolute inset-x-0 top-[4px] h-px" style={{ background: P.rule }} />
              {s1 != null ? (
                <>
                  <div className="absolute top-[3px] left-0 h-[3px] rounded-full" style={{ width: `${s1 * 100}%`, background: tone, opacity: 0.85 }} />
                  {s0 != null && <div className="absolute top-0 h-[9px] w-px" style={{ left: `${s0 * 100}%`, background: P.mute }} />}
                </>
              ) : (
                <>
                  <div className="absolute top-0 left-1/2 h-[9px] w-px" style={{ background: P.mute }} />
                  <div className="absolute top-[3px] h-[3px] rounded-full" style={{ left: rel >= 0 ? "50%" : `${50 + rel * 50}%`, width: `${Math.abs(rel) * 50}%`, background: tone, opacity: 0.85 }} />
                </>
              )}
            </div>
          </div>
        );
      })}
      {nums.length < every.length && (
        <button type="button" onClick={onMore} className="pointer-events-auto mt-[3px] whitespace-nowrap text-[11.5px]" style={{ color: P.mute }} title={t("allNumbers")}>
          {t("moreNumbers", { count: every.length - nums.length })}
        </button>
      )}
    </div>
  );
}

/** What the page has at the top right besides the timelines: intel, the world's stage, the main line, ending. */
export function Tools({ d }: { d: Data }) {
  const { P } = useApp();
  const t = useT("flow-lab.play");
  const pill = "rounded-full px-3 py-1 text-[12.5px] whitespace-nowrap";
  const bg = { background: `rgb(${P.inkRgb} / 0.06)` };
  return (
    <>
      <span className={pill} style={bg}>
        {t("findings")}
      </span>
      <span className={pill} style={bg}>
        {t("world")}
      </span>
      <GoalPill P={P} d={d} />
      <span className={pill} style={{ ...bg, color: P.faint }}>
        {t("end")}
      </span>
    </>
  );
}

// ------------------------------------------------------------------------------------------- the moment: ways to go

/** How long the pointer rests on a way, while it was on its way to the side, before that way is the one told. */
const REST = 200;

/**
 * Pointing across a list on the way to what it tells at its side, as a menu does it: a row the pointer passes over
 * while it is going toward that side (inside the triangle from where it was to the side's near edge) is not taken up
 * at once, only once the pointer rests on it or turns away; leaving the list for the side keeps the one told.
 */
function useAim(side: React.RefObject<HTMLElement | null>, focus: number, setFocus: (i: number) => void) {
  const trail = useRef<{ x: number; y: number }[]>([]);
  const want = useRef(-1);
  const rest = useRef(0);
  useEffect(() => () => window.clearTimeout(rest.current), []);
  const note = (e: React.PointerEvent) => (trail.current = [...trail.current.slice(-3), { x: e.clientX, y: e.clientY }]);
  /** Whether the pointer is going toward the side: where it is now, inside the triangle from where it was a few moves ago to the side's near edge. */
  const toward = () => {
    const r = side.current?.getBoundingClientRect();
    const t = trail.current;
    if (!r || t.length < 2) return false;
    const a = t[0]!;
    const p = t[t.length - 1]!;
    if (p.x <= a.x || p.x >= r.left) return false;
    const u = { x: r.left, y: r.top - 24 };
    const l = { x: r.left, y: r.bottom + 24 };
    const turn = (o: typeof a, b: typeof a, c: typeof a) => (b.x - o.x) * (c.y - o.y) - (b.y - o.y) * (c.x - o.x);
    const s = [turn(a, u, p), turn(u, l, p), turn(l, a, p)];
    return s.every((v) => v >= 0) || s.every((v) => v <= 0);
  };
  const take = () => {
    window.clearTimeout(rest.current);
    if (want.current >= 0) setFocus(want.current);
    want.current = -1;
  };
  const wait = () => {
    window.clearTimeout(rest.current);
    rest.current = window.setTimeout(take, REST);
  };
  return {
    // (a touch does nothing here: the press itself shows the way first, see Ways)
    enter: (i: number) => (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      note(e);
      want.current = i;
      if (i === focus || !toward()) take();
      else wait();
    },
    move: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      note(e);
      if (want.current < 0) return;
      if (toward()) wait();
      else take();
    },
    leave: () => {
      window.clearTimeout(rest.current);
      want.current = -1;
      trail.current = [];
    },
  };
}

const EASE = "cubic-bezier(.2,.7,.2,1)";

/**
 * Words that give way to others in place: the old go out as the new come in, never at once. With `fit`, what holds
 * them goes over to the new words' width as well (for a button whose words change).
 */
function SwapText({ text, fit = false, className = "" }: { text: string; fit?: boolean; className?: string }) {
  const [all, setAll] = useState([{ text, k: 0 }]);
  const top = all[all.length - 1]!;
  if (top.text !== text) setAll([...all.slice(-2), { text, k: top.k + 1 }]);
  const [lit, setLit] = useState(0);
  const [w, setW] = useState<number>();
  const cur = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = cur.current;
    if (!el) return;
    // (reading its width also has the new words laid down unseen first, so that they come in rather than appear)
    const width = el.offsetWidth;
    if (fit) setW(width);
    setLit(top.k);
  }, [top.k, fit]);
  return (
    <span className={`grid min-w-0 ${fit ? "justify-items-center" : ""} ${className}`} style={fit ? { width: w, transition: `width .32s ${EASE}` } : undefined}>
      {all.map((x) => {
        const on = x.k === top.k && x.k === lit;
        return (
          <span key={x.k} ref={x.k === top.k ? cur : undefined} aria-hidden={x.k !== top.k} className={`min-w-0 [grid-area:1/1] ${fit ? "whitespace-nowrap" : "truncate"}`} style={{ opacity: on ? 1 : 0, transition: `opacity ${on ? ".26s" : ".16s"} ease` }}>
            {x.text}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The ways to go on the left, what the one you point at means on the right (always there, so nothing moves under the
 * pointer; and going over to it, the ways passed on the way are not taken up, see useAim). What each way means is
 * laid in the same place, so going from one to the next the one goes out as the other comes in, and the side is as
 * tall as the longest of them whichever is shown. Any number of ways can be taken at once, with words of your own; all
 * of it is done together. As a menu, it can be gone through with the keys: up and down go from way to way, space
 * takes or leaves one, return does what is taken. On a touch screen the first touch shows a way, the second takes it.
 */
export function Ways({ opts, focus, setFocus, reach, onAct, note, ready, whole = false }: { opts: Option[]; focus: number; setFocus: (i: number) => void; /** Whom a way would reach, by name. */ reach: (o: Option) => string[]; onAct: (picks: string[], text: string) => void; note: string; ready: boolean; /** Each way to go is read in full, on as many lines as it takes (where there is less room across). */ whole?: boolean }) {
  const { P } = useApp();
  // (the names in a way to go open what is known of them, where the play they are in is at hand; pressing one does
  // not take the way)
  const play = useContext(NamesPlay);
  const t = useT("flow-lab.play");
  const named = (x: string) => (play ? <NamedText text={x} play={play} /> : x);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const touched = useRef(0);
  const aim = useAim(side, focus, setFocus);
  const n = picks.size + (text.trim() ? 1 : 0);
  const toggle = (id: string) =>
    setPicks((x) => {
      const y = new Set(x);
      if (y.has(id)) y.delete(id);
      else y.add(id);
      return y;
    });
  const act = () => ready && onAct([...picks], text.trim());
  /** Goes to the way at i (the last place being your own words). */
  const go = (i: number) => rows.current[Math.max(0, Math.min(opts.length, i))]?.focus();
  /** Whether a press was a touch, just now. */
  const touch = () => performance.now() - touched.current < 900;
  // (up or down with nothing else in hand goes into the ways, as it would into an open menu; not while words are being
  // written elsewhere, nor while something else is over the ways)
  const at = useRef(focus);
  at.current = focus;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement;
      if (a && a !== document.body) return;
      const el = rows.current[Math.min(at.current, opts.length)];
      const r = el?.getBoundingClientRect();
      if (!el || !r || !root.current?.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) return;
      e.preventDefault();
      el.focus();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [opts.length]);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      go(focus + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === " " && opts[focus]) {
      e.preventDefault();
      toggle(opts[focus]!.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      act();
    }
  };
  const ring = (lit: boolean) => ({ background: lit ? P.warm : "transparent", boxShadow: lit ? `inset 0 0 0 1.5px ${P.warm}` : `inset 0 0 0 1.5px rgb(${P.inkRgb} / 0.32)`, transition: "background-color .2s ease, box-shadow .2s ease" });
  const wrote = !!text.trim();
  return (
    <div ref={root} style={{ boxShadow: `inset 0 1px 0 rgb(${P.inkRgb} / 0.08)` }}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        <div className="py-3 pr-2 pl-6" onPointerMove={aim.move} onPointerLeave={aim.leave}>
          {opts.map((x, i) => {
            const on = i === focus;
            const picked = picks.has(x.id);
            return (
              <button
                key={x.id}
                ref={(el) => void (rows.current[i] = el)}
                type="button"
                onPointerDown={(e) => (touched.current = e.pointerType === "touch" ? performance.now() : 0)}
                onPointerEnter={aim.enter(i)}
                onFocus={() => !touch() && setFocus(i)}
                onKeyDown={keys}
                onClick={() => {
                  if (touch() && !on) return setFocus(i);
                  setFocus(i);
                  toggle(x.id);
                }}
                className={`flex w-full items-center gap-3 rounded-[13px] px-4 text-left outline-none ${whole ? "min-h-[42px] py-[9px]" : "h-[42px]"}`}
                style={{ background: on ? `rgb(${P.inkRgb} / 0.055)` : "transparent", transition: "background-color .15s" }}
              >
                <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full" style={ring(picked)}>
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none" style={{ opacity: picked ? 1 : 0, transform: picked ? "none" : "scale(0.6)", transition: `opacity .2s ease, transform .26s ${EASE}` }}>
                    <path d="M1 3.4l2.3 2.3L8 1" stroke={P.page} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className={`min-w-0 flex-1 text-[15.5px] ${whole ? "leading-[1.45]" : "truncate"}`} style={{ color: on || picked ? P.ink : `rgb(${P.inkRgb} / 0.78)`, transition: "color .2s ease" }}>
                  {named(x.title)}
                </span>
              </button>
            );
          })}
          {/* (the whole row is a place to write: anywhere on it goes into the words) */}
          <label className="flex h-[42px] cursor-text items-center gap-3 rounded-[13px] px-4" onPointerEnter={aim.enter(opts.length)} style={{ background: focus === opts.length ? `rgb(${P.inkRgb} / 0.055)` : "transparent", transition: "background-color .15s" }}>
            <span className="h-[17px] w-[17px] shrink-0 rounded-full" style={ring(wrote)} />
            <input
              ref={(el) => void (rows.current[opts.length] = el)}
              value={text}
              onFocus={() => setFocus(opts.length)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter" && n > 0) act();
                else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  go(opts.length - 1);
                }
              }}
              placeholder={t("writeYourOwn")}
              className="min-w-0 flex-1 bg-transparent text-[15.5px] outline-none"
              style={{ color: P.ink }}
            />
          </label>
        </div>
        <div ref={side} className="my-4 mr-10 grid pl-7" style={{ boxShadow: `inset 1px 0 0 rgb(${P.inkRgb} / 0.08)`, minHeight: 196 }}>
          {[...opts, null].map((o, i) => {
            const on = i === Math.min(focus, opts.length);
            const who = o ? reach(o) : [];
            return (
              <div key={o?.id ?? "\0"} aria-hidden={!on} className="[grid-area:1/1]" style={{ opacity: on ? 1 : 0, transition: `opacity ${on ? ".22s" : ".14s"} ease`, pointerEvents: on ? undefined : "none" }}>
                {o ? (
                  <>
                    <div className="text-[14.5px] leading-[1.7]" style={{ color: `rgb(${P.inkRgb} / 0.9)` }}>
                      {lines(o.detail, 5).map((l, j) => (
                        <span key={j}>
                          {j > 0 && <br />}
                          {named(l)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: P.mute }}>
                      {who.length ? t("reaches") : t("reachesOnlyYou")}
                      {who.slice(0, 5).map((r) => (
                        <span key={r} className="rounded-full px-2.5 py-[2px]" style={{ background: `rgb(${P.warmRgb} / 0.12)`, color: P.warm }}>
                          {cut(r, 10)}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-[14.5px] leading-[1.7]" style={{ color: `rgb(${P.inkRgb} / 0.9)` }}>
                    {t("writeHint")}
                    <br />
                    {t("writeHint2")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-6 px-10 py-4" style={{ boxShadow: `inset 0 1px 0 rgb(${P.inkRgb} / 0.08)` }}>
        <span className="min-w-0 truncate text-[11.5px]" style={{ color: P.faint }}>
          {note}
        </span>
        {/* (with nothing picked or written, the world carries on as things are) */}
        <button type="button" disabled={!ready} onClick={act} className="shrink-0 overflow-hidden rounded-full px-6 py-2.5 text-[14.5px] transition-opacity" style={{ background: P.warm, color: P.page, opacity: ready ? 1 : 0.35 }}>
          <SwapText fit text={n > 1 ? t("doTogether", { count: n }) : n === 1 ? t("actArrow") : t("continueArrow")} />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- the world working

/**
 * What part a line belongs to, as a word of the program (said in the interface language by `useSecName`). In a step:
 * "move" (your move), "reaction" (what one side does), "chance" (left to chance), "world" (the world moving on its
 * own), "next" (the next step), "lookup" (looking into the real world); before a world: "search"; while a world is
 * made: "appear", "fact", "profile", "tie", "crowd", "risk", "milestone", "start".
 */
export type Row = { i: number; sec: string; who: string; gist: string };

/** What a part of a step (a Row's `sec`) is called. */
export function useSecName(): (sec: string) => string {
  const t = useT("flow-lab.play");
  return useMemo(() => (sec: string) => t(`sec.${sec}`), [t]);
}

/** The lines of a step: `t` is the texts of flow-lab.play, `tc` those of product.replay.stage.trace. */
export function rowsOf(beats: Told[], t: T, tc: T): Row[] {
  return beats.map((b, i) => {
    const c = b.c;
    const D = c.detail;
    if (c.purpose === "rule") return { i, sec: "move", who: t("settle"), gist: D.targets?.length ? t("sidesToDecide", { count: D.targets.length }) : t("readingYourMove") };
    if (c.purpose === "person") return { i, sec: "reaction", who: c.actor?.name ?? t("aSide"), gist: D.quiet || !D.action ? t("hold") : D.action };
    if (c.purpose === "resolve_uncertain") {
      const it = D.items?.[b.item ?? 0];
      return { i, sec: "chance", who: "", gist: it?.chosen ?? it?.question ?? t("settlingUncertain") };
    }
    if (c.purpose === "moment") return { i, sec: "next", who: "", gist: D.headline ?? t("writingMoment") };
    return { i, sec: "lookup", who: "", gist: otherName(t, tc, c) };
  });
}

/**
 * The step as a line of cause: its parts down a rail, each thing told a point on its part (lit once told, the one
 * being told now warm). Under the part being told, who it is and what; any point is a way back to that moment.
 */
export function Rail({ rows, bi, done, seek }: { rows: Row[]; bi: number; done: boolean; seek: (i: number) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.play");
  const secName = useSecName();
  const secs = useMemo(() => {
    const out: { name: string; rows: Row[] }[] = [];
    for (const r of rows) {
      const s = out.find((y) => y.name === r.sec);
      if (s) s.rows.push(r);
      else out.push({ name: r.sec, rows: [r] });
    }
    return out;
  }, [rows]);
  const cur = done ? null : (rows[Math.min(bi, rows.length - 1)] ?? null);
  const [hover, setHover] = useState<Row | null>(null);
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{t("thisStep")}</div>
      <div className="relative mt-4">
        <div className="absolute top-[6px] bottom-[10px] left-[5px] w-px" style={{ background: `rgb(${P.inkRgb} / 0.12)` }} />
        {secs.map((s) => {
          const n = s.rows.filter((r) => r.i < bi).length;
          const here = cur?.sec === s.name;
          const full = n === s.rows.length;
          const shown = hover && hover.sec === s.name ? hover : here ? cur : n ? s.rows.filter((r) => r.i < bi).at(-1)! : null;
          return (
            <div key={s.name} className="relative pb-[18px] pl-[26px]" style={{ opacity: n || here ? 1 : 0.42, transition: "opacity .5s" }}>
              <span className="absolute top-[4px] left-0 h-[11px] w-[11px] rounded-full" style={{ background: here ? P.warm : full ? P.ink : P.page, boxShadow: here ? undefined : `inset 0 0 0 1.5px rgb(${P.inkRgb} / ${n ? 0.7 : 0.3})`, animation: here ? "flow-halo 1.8s ease-in-out infinite" : undefined }} />
              <div className="flex items-baseline justify-between">
                <span className="text-[13.5px]" style={{ color: here ? P.ink : `rgb(${P.inkRgb} / 0.86)`, fontWeight: here ? 500 : 400 }}>
                  {secName(s.name)}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: P.faint }}>
                  {n}/{s.rows.length}
                </span>
              </div>
              {/* (each point is pressed on a square around it, larger than it looks, and the squares meet: going along
                  them, what is under the part stays with the last one pointed at until the pointer leaves them all) */}
              <div className="-mx-[2.5px] mt-[4.5px] -mb-[2.5px] flex flex-wrap" onMouseLeave={() => setHover(null)}>
                {s.rows.map((r) => {
                  const now = cur?.i === r.i;
                  const was = r.i < bi;
                  return (
                    <button key={r.i} type="button" aria-label={r.gist} disabled={!was && !now} onMouseEnter={() => (was || now) && setHover(r)} onClick={() => seek(r.i)} className="flex h-[12px] w-[12px] items-center justify-center" style={{ cursor: was || now ? "pointer" : "default" }}>
                      <span className="h-[7px] w-[7px] rounded-full transition-colors duration-500" style={{ background: now ? P.warm : was ? `rgb(${P.inkRgb} / 0.72)` : `rgb(${P.inkRgb} / 0.14)` }} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-[6px] h-[17px] text-[11.5px]" style={{ color: here || hover?.sec === s.name ? P.mute : P.faint, transition: "color .3s ease" }}>
                <SwapText text={shown ? `${shown.who ? `${cut(shown.who, 8)} · ` : ""}${shown.gist}` : ""} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** How much the engine has worked out, counted as it happens; every call a bar in time; who is being worked out now. */
function Engine({ trace, t }: { trace: Trace; t: number }) {
  const { P } = useApp();
  // (`t` is the step's own time here: the texts are `tx`)
  const tx = useT("flow-lab.play");
  const tc = useT("product.replay.stage.trace");
  const cs = trace.calls;
  const lanes = useMemo(() => {
    const ends: number[] = [];
    return [...cs]
      .sort((a, b) => a.from - b.from)
      .map((c) => {
        let k = ends.findIndex((e) => e <= c.from);
        if (k < 0) k = ends.length;
        ends[k] = c.to;
        return { c, k };
      });
  }, [cs]);
  const rowsN = Math.min(10, Math.max(1, ...lanes.map((x) => x.k + 1)));
  const fin = cs.filter((c) => t >= c.to);
  const busy = cs.filter((c) => t >= c.from && t < c.to);
  const cost = fin.reduce((a, c) => a + c.cost, 0);
  const secs = Math.round(t / 1000);
  const stat = (value: string, label: string, sub?: string) => (
    <div>
      <div className="flex items-baseline gap-1" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
        <span className="text-[20px]" style={{ fontWeight: 300 }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: 10.5, color: P.faint }}>{sub}</span>}
      </div>
      <div className="mt-0.5 text-[11px]" style={{ color: P.mute }}>
        {label}
      </div>
    </div>
  );
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{tx("engine")}</div>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
        {stat(String(fin.length), tx("modelCalls"), `/ ${cs.length}`)}
        {stat(String(busy.length), tx("runningAtOnce"))}
        {stat(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, tx("time"))}
        {stat(`$${cost.toFixed(3)}`, tx("cost"))}
      </div>
      <div className="relative mt-5" style={{ height: rowsN * 6 + 2 }}>
        {lanes
          .filter((x) => x.k < rowsN)
          .map(({ c, k }) => (
            <span key={c.id} className="absolute h-[3px] rounded-full" style={{ top: k * 6, left: `${(c.from / trace.ms) * 100}%`, width: `${Math.max(1, ((c.to - c.from) / trace.ms) * 100)}%`, background: t >= c.to ? `rgb(${P.inkRgb} / 0.5)` : t >= c.from ? P.warm : `rgb(${P.inkRgb} / 0.12)`, transition: "background-color .4s" }} />
          ))}
        <span className="absolute top-[-3px] bottom-[-3px] w-px" style={{ left: `${Math.min(100, (t / trace.ms) * 100)}%`, background: `rgb(${P.warmRgb} / 0.7)` }} />
      </div>
      <div className="mt-2 text-[10.5px]" style={{ color: P.faint }}>
        {tx("callsLegend")}
      </div>
      <div className="mt-4 grid gap-[6px]">
        {busy.slice(0, 5).map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-[12px]" style={{ color: P.mute }}>
            <span className="k-pulse h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.warm }} />
            <span className="truncate">{c.actor?.name ?? otherName(tx, tc, c)}</span>
          </div>
        ))}
        {busy.length > 5 && (
          <div className="pl-[13px] text-[11px]" style={{ color: P.faint }}>
            {tx("moreCalls", { count: busy.length - 5 })}
          </div>
        )}
      </div>
    </div>
  );
}

/** One thing told: who, their words large, then what there is to know about it in a grid that never changes size. */
function Scene({ beat, q }: { beat: Told; q: number }) {
  const { P } = useApp();
  const t = useT("flow-lab.play");
  const tc = useT("product.replay.stage.trace");
  const c = beat.c;
  const D = c.detail;
  const typed = (x: string) => x.slice(0, Math.ceil(x.length * Math.min(1, q / 0.28)));
  const clamp = (n: number): React.CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" });
  const head = (who: string, what: string) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-[17px] font-medium">
        {who}
        <span className="ml-2.5 font-normal" style={{ fontFamily: MONO, fontSize: 11, color: P.warm }}>
          {what}
        </span>
      </span>
    </div>
  );
  const big = (x: string, n: number, quote = false) => (
    <div className="mt-3.5 h-[99px] text-[21px] leading-[33px] font-medium" style={clamp(3)}>
      {quote && "“"}
      {typed(cut(x, n))}
      {quote && q >= 0.28 && "”"}
    </div>
  );
  const cell = (label: string, x: string, warm = false) => (
    <div key={label} className="min-w-0">
      <div className="text-[11.5px]" style={{ color: warm ? P.warm : P.faint }}>
        {label}
      </div>
      <div className="mt-1 text-[13.5px] leading-[21px]" style={{ ...clamp(3), color: `rgb(${P.inkRgb} / 0.84)` }}>
        {x}
      </div>
    </div>
  );
  const grid = (cells: (React.ReactNode | false | null | undefined)[]) => <div className="mt-[18px] grid grid-cols-2 gap-x-8 gap-y-[14px]">{cells.filter(Boolean).slice(0, 4)}</div>;
  if (c.purpose === "person") {
    const quiet = D.quiet || !D.action;
    return (
      <>
        {head(c.actor?.name ?? t("aSide"), t("deciding"))}
        {D.said ? big(D.said, 70, true) : big(quiet ? t("hold") : (D.action ?? ""), 70)}
        {grid([D.said && cell(t("does"), quiet ? t("hold") : (D.action ?? "")), D.thinking && cell(t("thinks"), D.thinking)])}
      </>
    );
  }
  if (c.purpose === "rule")
    return (
      <>
        {head(t("settle"), t("readingThisStep"))}
        {big(D.restatement ?? "", 70)}
        {grid([
          !!D.targets?.length && cell(t("sidesToDecide", { count: D.targets.length }), D.targets.join(t("listSep"))),
          !!D.settings?.length && cell(t("yourSettings"), D.settings[0]!.text),
          !!D.uncertain?.length && cell(t("leftToChanceN", { count: D.uncertain.length }), D.uncertain[0]!.question, true),
        ])}
      </>
    );
  if (c.purpose === "resolve_uncertain") {
    const it = D.items?.[beat.item ?? 0];
    const sum = (it?.outcomes ?? []).reduce((a, o) => a + o.p, 0) || 1;
    return (
      <>
        {head(t("sec.chance"), (D.items?.length ?? 0) > 1 ? `${(beat.item ?? 0) + 1} / ${D.items!.length}` : t("oneRoll"))}
        {big(it?.question ?? "", 70)}
        <div className="mt-[18px] grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-x-8">
          <div className="grid content-start gap-[9px]">
            {(it?.outcomes ?? []).slice(0, 4).map((o) => {
              const hit = q > 0.6 && o.label === it?.chosen;
              return (
                <div key={o.label} style={{ color: hit ? P.warm : q > 0.6 ? P.faint : P.mute, transition: "color .4s" }}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-[34px] shrink-0" style={{ fontFamily: MONO, fontSize: 11.5 }}>
                      {Math.round((o.p / sum) * 100)}%
                    </span>
                    <span className="h-[3px] rounded-full" style={{ width: `${Math.max(3, (o.p / sum) * 100)}%`, maxWidth: 150, background: hit ? P.warm : `rgb(${P.inkRgb} / 0.28)` }} />
                  </div>
                  <div className="mt-[2px] truncate pl-[44px] text-[13px]" style={{ fontWeight: hit ? 500 : 400 }}>
                    {o.label}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="min-w-0">
            <div className="text-[11.5px]" style={{ color: P.faint }}>
              {t("basis")}
            </div>
            <div className="mt-1 text-[13px] leading-[21px]" style={{ ...clamp(7), color: `rgb(${P.inkRgb} / 0.8)` }}>
              {it?.base}
            </div>
          </div>
        </div>
      </>
    );
  }
  if (c.purpose === "moment")
    return (
      <>
        {head(t("writingMoment"), t("sec.next"))}
        {big(D.headline ?? "", 70)}
        <div className="mt-[18px] text-[13.5px] leading-[21px]" style={{ color: P.mute }}>
          {t("waysReady", { count: D.options ?? 0 })}
        </div>
      </>
    );
  return (
    <>
      {head(t("engine"), t("sec.lookup"))}
      {big(otherName(t, tc, c), 60)}
      <div className="mt-[18px] text-[13.5px] leading-[21px]" style={{ color: P.mute }}>
        {t("lookupExplain")}
      </div>
    </>
  );
}

/** Where the step stops: how long it ran, what moved on the main line, what each of them did, and what is asked next. */
function Stop({ play, trace, beats, headline, from, to, onNext }: { play: Play; trace: Trace; beats: Told[]; headline: string; from: string; to: string; onNext: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.play");
  const locale = useLocale();
  const nums = numsOf(play, locale).filter((n) => n.d);
  const did = beats.filter((b) => b.c.purpose === "person" && b.c.actor);
  const last = new Map(did.map((b) => [b.c.actor!.id, b]));
  const parties = [...last.values()];
  const odds = beats.filter((b) => b.c.purpose === "resolve_uncertain").length;
  return (
    <div className="sim-in flex h-full flex-col pb-7">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-medium">{t("stepDone")}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>
          {from} → {to}
        </span>
      </div>
      <div className="mt-2 text-[12.5px]" style={{ color: P.mute }}>
        {[t("sidesActed", { count: parties.length }), t("oddsLeft", { count: odds }), t("engineRan", { count: Math.round(trace.ms / 1000) })].join(" · ")}
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-x-8">
        <div>
          <div className="text-[11.5px]" style={{ color: P.faint }}>
            {t("changedSinceStart")}
          </div>
          <div className="mt-2 grid gap-[7px]">
            {nums.slice(0, 6).map((n) => (
              <div key={n.m.key} className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate" style={{ color: P.mute }}>
                  {n.m.label}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: n.bad ? P.warm : P.ink }}>{n.d}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11.5px]" style={{ color: P.faint }}>
            {t("whatEachDid")}
          </div>
          <div className="mt-2 grid gap-[7px]">
            {parties.slice(0, 6).map((b) => (
              <div key={b.key} className="flex gap-2 text-[13px] whitespace-nowrap">
                <span className="shrink-0" style={{ color: P.ink }}>
                  {cut(b.c.actor!.name, 7)}
                </span>
                <span className="min-w-0 truncate" style={{ color: P.mute }}>
                  {b.c.detail.quiet || !b.c.detail.action ? t("hold") : b.c.detail.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div style={{ fontFamily: MONO, fontSize: 11, color: P.warm }}>{t("stoppedHere")}</div>
          <div className="mt-1.5 text-[18px] leading-[28px] font-medium" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {headline}
          </div>
        </div>
        <button type="button" onClick={onNext} className="shrink-0 rounded-full px-5 py-2.5 text-[14px]" style={{ background: P.warm, color: P.page }}>
          {t("seeNextStep")}
        </button>
      </div>
    </div>
  );
}
