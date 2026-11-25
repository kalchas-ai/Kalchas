"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LocaleSwitch } from "@/components/kit/locale-switch";
import type { ProjectCard, WorldView } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { BASE, A, api, usd, useApp } from "@/components/product/shell";
import { projectHref, useProjectLine } from "@/components/product/projects";
import { between, excerpt, numsOf, reachOf, short, stepsOf, type Data, type Play } from "@/components/product/replay/stage/data";
import { beatsOf, type Beat as TBeat } from "@/components/product/replay/stage/engine";
import { BranchPick, Spend } from "@/components/product/replay/stage/parts";
import { Hard, STAGE_CSS } from "@/components/product/replay/stage/stage";
import { useTraceClock, useTraces, type Call, type Trace } from "@/components/product/replay/stage/trace";
import { PersonCard, stopsOf } from "@/components/product/replay/stage/names";
import { askOf, Glyph, RUNNING, needsYou, useTyping, type HomeData } from "@/components/product/start/shared";
import NewWorld from "@/components/product/wait/world";
import { WAIT_CSS, sec, type Tape } from "@/components/product/wait/tape";
import { rich, useLocale, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";
import type { Ev, Stream } from "@/lib/stream";
import { Galaxy, type Tier } from "./galaxy";
import { DID_LEAD, OTHER, Rail, Tools, Vitals, WORLDLY, Ways, cut, dayOf, rowsOf } from "./play";
import { NODE, playActs, type Beat as SBeat, type Score } from "./score";
import { COLS } from "./columns";
import type { Stage } from "./stage";
import { faceKind, type FaceKind } from "./faces";
import { FaceStyle, Who, useKindName } from "./who";
import { BuildScene, Caption, Log, Onward, Roster, SideList, Ticks, type Item, type Party } from "./scenes";
import { AskWords, BuildHead, HomeWords, OpeningWords, PlayHead } from "./words";
import { Ask, type Asked } from "./asks";
import { BuildWords } from "./builds";
import { designAsked } from "./design-asks";
import { Board, Dock, Events, Happenings, LOOKED, LiveLine, Main, Parties, Stand, TOLD12, TURN_CSS, useTold12, type Leg, type Live, type Side, type Sides, type Told12 } from "./turns";
import type { DesignMeeting } from "@/lib/design-meeting";
import { Know, Projects, SettingsPage, Start, Stopped } from "./rest";
import { NotesSheet, ArcSheet, AskLine, AskSheet, ClarifySheet, EndSheet, EndedSheet, GoalSheet, IntelSheet, LinesSheet, MeetingSheet, ReadingSheet, SHEETS, Sheet, ToolsLine, TroubleSheet, WorldSheet, type SheetKey } from "./sheets";
import { ReportPage } from "./report";

/**
 * The whole of it as one take, on one page that is never left: the same matter from the first word to the last step.
 *
 * - Home: information lies scattered everywhere. As you write, some
 *   of it draws together under your words into a cloud, turning, not yet anything.
 * - Asked: what has to be known first, one thing at a time, over the cloud.
 * - The world built: first the sources are found (each takes its own form and colour, by name) and read, part of each
 *   leaving for the cloud; then the cloud becomes a world (the page as it is while a world is built), the rest of each
 *   source coming in as it is made into something.
 * - The moment, the world working, where it stops: a step of the play. Whoever is being told about stays at full, with
 *   whoever they act on, while the rest steps back; the words are set straight on the picture, a pool of dark behind
 *   them, always in one place, in the order things happen: what they think, what they say or do as it leaves for
 *   whoever it reaches, where that leaves them.
 *
 * Nothing is cut: from one part to the next the picture flows and the page's words fade. Along the foot, the steps:
 * any of them can be gone to (the picture is covered for a moment while it is put there). Real records throughout;
 * nothing here writes or spends.
 */

/** The parts of the flow; each is named along the foot as `step.<step>` of flow-lab.flow. */
export type Step = "home" | "know" | "ask" | "build" | "start" | "decide" | "run" | "result" | "report";
const ALL: Step[] = ["home", "ask", "build", "decide", "run", "result"];
/**
 * The whole of the product's flow (see `more`): what the one take left out is in its place among the rest. What the
 * research came to is not a page of the flow: from the questions it is one take to the world, as it was settled.
 */
const WHOLE: Step[] = ["home", "know", "ask", "build", "start", "decide", "run", "result", "report"];
/** Before there is a world: nothing to go round, and the picture holds still. */
const flat = (s: Step) => s === "home" || s === "know" || s === "ask";
const PLAYED: Step[] = ["decide", "run", "result"];
const BAR = 54;
const sat = (x: number) => Math.max(0, Math.min(1, x));
const NONE = new Map<number, string>();
const ZEROS = Array.from({ length: 16 }, () => 0);
const ONES = Array.from({ length: 16 }, () => 1);
const fed = new WeakMap<Stage, unknown>();
// How the engine names you in a Chinese project: "\u4f60" ("you") or "\u4e3b\u89d2" ("the protagonist"). The first is also
// how you are named among the sides of a step, as turns.tsx reads them.
const YOU = "\u4f60";
const LEAD_NAME = "\u4e3b\u89d2";
/** The examples typed out on the home page, and where (`t` is the texts of "product.start.shared"). */
const phrasesOf = (t: T): [string, number, number][] => {
  const ASK = askOf(t);
  return [
    [ASK.today.examples[0]!, 8, 19],
    [ASK.past.examples[1]!, 77, 15],
    [ASK.today.examples[3]!, 5, 46],
    [ASK.past.examples[0]!, 80, 43],
    [ASK.today.examples[2]!, 13, 71],
    [ASK.past.examples[2]!, 74, 73],
  ];
};

type Clarify = { q: string; why?: string; options?: string[]; answer?: string | null; about?: string; kind?: "one" | "many" | "number" | "text"; unit?: string | null };
type Forecast = {
  question: string;
  clarify: Clarify[];
  intel: unknown[];
  page: { lead: string; top: string[]; considerations: { id: string; title: string; summary: string }[]; premises: { text: string; verdict: string; why: string }[] } | null;
};
/**
 * The flow as it really runs (the product), where it is otherwise a record played back: whoever shows it says where
 * things have got to, and is told what is done on the page. Nothing here knows how much longer anything will take.
 */
export type LiveFlow = {
  /** Where the product is. */
  step: Step;
  /** Where the building has got to on the picture's own clock (null: not being built). */
  T: number | null;
  /** How much there is so far and how long it has taken, as they really are. */
  counts?: [number, string][];
  elapsed?: string;
  /** What is written on the home page is begun; what is answered is given. */
  onStart: (text: string) => void;
  onAnswers: (answers: { q: string; answer: string | null }[]) => void;
  busy?: boolean;
  err?: string | null;
  /** What has been waited on so far, and the project as it stands, kept up to date by whoever shows this. */
  tape?: Tape | null;
  fc?: unknown;
  /** A play as it really runs: the step being worked out as far as it has got, and what is done in it handed on. */
  play?: PlayRun | null;
  /** The world has been seen made, to its end. */
  onBuilt?: () => void;
  /** What is being made has stopped, and how to go on. */
  stopped?: { what: "research" | "build"; status: "paused" | "failed" | "stalled"; error: string | null; onResume: () => void } | null;
};

export type PlayRun = {
  /** The step being worked out, or the last one worked out, as far as its record goes. */
  trace: Trace | null;
  running: boolean;
  /** What was done was not a step after all (a question, something to say more plainly, something gone wrong): back to where it was to be decided. */
  back: boolean;
  /** What is being done now, in the engine's own words. */
  working: string;
  /** What you did, as you put it, until the referee has said it back. */
  said: string;
  onAct: (picks: string[], text: string) => void;
  /** A sheet that what happened calls for (to say plainly what you mean, something gone wrong, a talk, where you stand being written). */
  sheet: SheetKey | null;
  note: string;
  meeting: DesignMeeting | null;
  busy: boolean;
  onAsk: (text: string) => void;
  /** What is being asked now, and its answer as far as it has been written. */
  asking?: { q: string; text: string; doing: string } | null;
  onSay: (text: string) => void;
  onLeave: (skip: boolean) => void;
  onBranch: (id: string) => void;
  onFork: (step: number, mode: "free" | "matched") => void;
  onEnd: () => void;
  onContinue: (goal: string) => void;
  onDismiss: () => void;
};

/** What a step of the play hands the picture each frame. */
type PlayFeed = (st: Stage, w: number, h: number) => void;

/** Something on the page that comes and goes by fading; it stays in the page until it has gone. */
function Fade({ on, ms = 650, rise = false, className, style, children }: { on: boolean; ms?: number; rise?: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const [here, setHere] = useState(on);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (on) {
      setHere(true);
      const id = window.setTimeout(() => setSeen(true), 30);
      return () => window.clearTimeout(id);
    }
    setSeen(false);
    const id = window.setTimeout(() => setHere(false), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  if (!here) return null;
  return (
    <div className={className} style={{ ...style, opacity: seen ? 1 : 0, transform: rise ? (seen ? "none" : "translateY(10px)") : style?.transform, transition: `opacity ${ms}ms ease, transform ${ms}ms cubic-bezier(.2,.7,.2,1)`, pointerEvents: seen ? style?.pointerEvents : "none" }}>
      {children}
    </div>
  );
}

/** One thing in a place gives way to the next: the one before fades where it stands as the next arrives. */
function Swap({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const last = useRef<{ id: string; node: React.ReactNode }>({ id, node: children });
  const [old, setOld] = useState<{ id: string; node: React.ReactNode } | null>(null);
  if (last.current.id !== id) {
    const was = last.current;
    last.current = { id, node: children };
    setOld(was);
  } else last.current.node = children;
  useEffect(() => {
    if (!old) return;
    const t = window.setTimeout(() => setOld(null), 400);
    return () => window.clearTimeout(t);
  }, [old]);
  return (
    <div className={className}>
      {old && old.id !== id && (
        <div key={old.id} className="flow-out absolute inset-0">
          {old.node}
        </div>
      )}
      <div key={id} className="flow-in h-full">
        {children}
      </div>
    </div>
  );
}

export function FlowV2({ world, play, stream, home, only, stepN, tier, onSlow, form = 0, volume = 0, pixels = 1, open = 0, trans = 0, net = 0, face = 0, fine = false, lay = 0, scene = 0, head = 0, more = false, ask = 0, live: run, at, clock, view, score: given }: { /** Where it is written on the home page (see words.tsx, Bare): 0 on the picture itself, as these pages have it; 1 in a box in the middle, which has weight, as the product has it. */ ask?: number; /** As it really runs (see LiveFlow): the steps along the foot, which are for looking at a record, are not there. */ live?: LiveFlow; /** The whole of the product's flow and everything that can be opened in it, not only the one take (rest.tsx, sheets.tsx, report.tsx). */ more?: boolean; world: WorldView; play: Play | null; stream: Stream; score: Score; home: HomeData; only: "home" | "build" | "play" | null; stepN: number | null; tier: Tier | null; onSlow: () => void; /** How someone's matter settles, and whether sources are clouds with depth (see Field). */ form?: number; volume?: number; pixels?: number; /** How a source is shown while it is found and read (see Field.open). */ open?: number; /** How what is read goes from the galaxy to the world (see Field.trans). */ trans?: number; /** How the network of who is in a world is shown (see Field.net). */ net?: number; /** How everyone in a world is shown so that they can be told apart and taken hold of (see Stage.face): 0 as light only. */ face?: number; /** The settled way of doing things, where V2 as it was is left alone (see Stage.fine). */ fine?: boolean; /** How the words are set: 0 as they are; 1 on the axis, 2 in a column, 3 in two bands (see words.tsx). */ lay?: number; /** How the flow is done, where the words are on the axis: 0 as it is; 1 the roll, 2 the record, 3 the caption (see scenes.tsx); 4 what was chosen of them: the record while a world is found and made, the roll while a step is told and at its end, and as it is everywhere else. */ scene?: number; /** How what is said while a world is found and made is set: 0 in the middle, at the top and the foot, as it is; 1 at the top left, one block from the first source found to the world being ready (see builds.tsx). */ head?: number; /** The step to be at, where whoever shows several of these side by side says so (each can still be taken elsewhere by its own foot). */ at?: Step; /** Where the building is, kept by whoever shows several of these side by side. */ clock?: { current: number | null }; /** Where the eye has been turned to by hand, kept by whoever shows several of these side by side so they all turn together. */ view?: { current: { az: number; el: number; zoom: number; hot: boolean } } }) {
  // (a record that has grown is laid out again: the picture is covered while the new one is put where the old one was)
  const [score, setScore] = useState(given);
  const t = useT("flow-lab.flow");
  const locale = useLocale();
  const kindName = useKindName();
  const tStart = useT("product.start.shared");
  const PHRASES = useMemo(() => phrasesOf(tStart), [tStart]);
  const swapAt = useRef(0);
  const ownView = useRef({ az: 0, el: 0, zoom: 1, hot: false });
  const eye = view ?? ownView;
  const dragAt = useRef<{ x: number; y: number; held: boolean } | null>(null);
  // whoever in the world has been chosen to be looked at (a body of the score), and the card that says who they are
  const [picked, setPicked] = useState(-1);
  const stage = useRef<Stage | null>(null);
  const card = useRef<HTMLDivElement>(null);
  // how each part of the flow is done (see `scene`)
  const sceneAt = (part: "home" | "ask" | "build") => (lay !== 1 ? 0 : scene === 4 ? (part === "build" ? 2 : 0) : scene);
  // who each body is, in a line: what kind of thing, and the first of what the world says of them
  const says = useMemo(() => {
    const of = new Map(world.graph.nodes.map((n) => [n.id, n.summary]));
    return score.bodies.map((b) => {
      if (b.kind !== NODE && b.size == null) return "";
      if (b.seat) return "";
      // (an outside force is no number of people: what it is, and the first of what is said of it)
      const kind = b.force ? t("force") : kindName(faceKind({ seat: b.seat, ent: b.ent, crowd: b.kind !== NODE }));
      // (the first clause: up to a comma, full stop or semicolon, full-width U+FF0C, U+3002, U+FF1B or plain)
      const first = (s: string) => s.split(/[\uff0c\u3002\uff1b,;]/)[0]!.trim();
      const said = (line: string) => (line ? `${kind} · ${line.length > 16 ? `${line.slice(0, 15)}…` : line}` : kind);
      if (b.force) return said(first(b.cares ?? ""));
      if (b.kind !== NODE) return t("crowdLine", { kind, count: b.size ?? 0, n: (b.size ?? 0).toLocaleString(locale) });
      if (b.risk || b.seed) return "";
      return said(first(of.get(b.id) ?? ""));
    });
  }, [world, score, kindName, t, locale]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && (setPicked(-1), setSheet(null), setMenu(false));
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const { P } = useApp();
  const steps = useMemo<Step[]>(() => {
    const xs: Step[] = only === "home" ? ["home"] : only === "build" ? ["build"] : only === "play" ? PLAYED : more ? WHOLE : ALL;
    return xs.filter((s) => play || !(PLAYED.includes(s) || s === "report"));
  }, [only, play, more]);
  // (the whole flow: what is open over a play, the two pages that are gone to from the home page, something being made that has stopped, and the talk this line last had)
  const [sheet0, setSheet0] = useState<SheetKey | null>(null);
  // (as it really runs, what has happened can call for a sheet: it is there until it is dealt with)
  const R = run?.play ?? null;
  const setSheet = (k: SheetKey | null) => {
    if (k === null) R?.onDismiss();
    setSheet0(k);
  };
  const [sub, setSub] = useState<"all" | "settings" | null>(null);
  const [halt, setHalt] = useState<"paused" | "failed" | null>(null);
  const [menu, setMenu] = useState(false);
  const [meeting, setMeeting] = useState<DesignMeeting | null>(null);
  useEffect(() => {
    if (!more || !play) return;
    let live = true;
    api<DesignMeeting | null>(`/design/meeting?branch=${play.branch.id}`).then((m) => live && setMeeting(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [more, play]);
  const [step, setStep] = useState<Step>(run?.step ?? steps[0]!);
  /** How many times the questions have been gone to (each time they begin again). */
  const [askAgain, setAskAgain] = useState(0);
  const sheet = (R && PLAYED.includes(step) ? R.sheet : null) ?? sheet0;

  const [q, setQ] = useState("");
  const [keep, setKeep] = useState(true);
  const [veil, setVeil] = useState(!!tier);
  const [tape0, setTape] = useState<Tape | null>(null);
  const [fc0, setFc] = useState<Forecast | null>(null);
  /** Whether what was asked has been looked for (it may be that there is none: a world made without being asked anything). */
  const [fcRead, setFcRead] = useState(false);
  const tape = run ? (run.tape ?? null) : tape0;
  const fc = run ? ((run.fc as Forecast | null | undefined) ?? null) : fc0;
  const [, setTick] = useState(0);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!world.forecastId || run) return;
    let live = true;
    api<Tape>(`/design/waits/${world.forecastId}`).then((t) => live && setTape(t)).catch(() => {});
    api<Forecast>(`/forecasts/${world.forecastId}`)
      .then((f) => live && setFc(f))
      .catch(() => {})
      .finally(() => live && setFcRead(true));
    return () => {
      live = false;
    };
  }, [world.forecastId]);
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

  // the clock of the stretch that runs by itself: the world built, from before anything is found (-lead) to the opening
  const LEAD = score.build.lead;
  const tB = useRef(-LEAD);
  const mouse = useRef({ x: 0, y: 0, on: false });
  const jump = useRef(true);
  const cover = useRef(0);
  const born = useRef<{ st: Stage; t: number } | null>(null);
  const leaping = useRef(0);
  const feed = useRef<PlayFeed | null>(null);
  const prog = useRef(0);
  useEffect(() => {
    if (given === score) return;
    if (!tier) return setScore(given);
    setVeil(true);
    window.clearTimeout(swapAt.current);
    swapAt.current = window.setTimeout(() => {
      setScore(given);
      jump.current = true;
    }, 340);
    return () => window.clearTimeout(swapAt.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given]);
  // while someone is being looked at the world is held: time does not go on (the building, the telling), only what it is made of moves
  const held = face > 0 && picked >= 0;
  const pace = held ? 0 : speed;
  /** How much of what was answered has gone into what is gathering in the picture (0, then 1): it is that much more. */
  const gathered = useRef(0);
  // (whether where you write on the home page has been gone to: what is there draws the sky in more)
  const [gone, setGone] = useState(false);
  // (what was written has been begun, and the page is being left: when, so the picture can go in after it)
  const [left, setLeft] = useState(false);
  const leftAt = useRef(0);
  // (where a record is being looked at, nothing has to be waited for: the next page comes after about as long as it really takes)
  const begin = (fn: () => void) => () => {
    leftAt.current = performance.now();
    setLeft(true);
    fn();
  };
  useEffect(() => {
    // (it could not be begun: the page is as it was)
    if (run?.err) setLeft(false);
  }, [run?.err]);
  useEffect(() => {
    // (the page has been left: it is whole again for whenever it is come back to)
    if (step !== "home") setLeft(false);
  }, [step]);
  const live = useRef({ step, typed: 0, held: gone, left, speed: pace, ask, keep, face, picked, fine, lay, scene, head, halt: false });
  live.current = { step, typed: Math.min(1, q.trim().length / 14), held: gone, left, speed: pace, ask, keep, face, picked, fine, lay, scene, head, halt: false };
  const enter = (s: Step) => {
    // (the questions gone to again, even from where they are, are asked again from the first)
    if (s === "ask") setAskAgain((n) => n + 1);
    if (s === "build") tB.current = run?.T != null ? Math.min(run.T, -LEAD + 0.01) : -LEAD;
    if (s !== "home" && !q) setQ(world.title);
    setPicked(-1);
    setSheet(null);
    setSub(null);
    setHalt(null);
    if (flat(s)) Object.assign(eye.current, { az: 0, el: 0, zoom: 1, hot: false });
    setStep(s);
  };
  // going on by itself: nothing is cut, the picture flows there
  const next = () => {
    if (run) return;
    const i = steps.indexOf(step);
    if (i >= 0 && i < steps.length - 1) enter(steps[i + 1]!);
  };
  // a leap made by hand along the foot: the picture is covered while everything is put where it belongs
  const leap = (s: Step) => {
    // with no living picture there is nothing to cover
    if (!tier) return enter(s);
    if (leaping.current) return;
    setVeil(true);
    leaping.current = window.setTimeout(() => {
      leaping.current = 0;
      enter(s);
      jump.current = true;
    }, 320);
  };
  useEffect(
    () => () => {
      window.clearTimeout(leaping.current);
      leaping.current = 0;
    },
    [],
  );
  const leapRef = useRef(leap);
  leapRef.current = leap;
  const atWas = useRef(at);
  useEffect(() => {
    // (only when whoever is outside says another step: not at first, and not when this one is taken elsewhere by its own foot)
    if (at === atWas.current) return;
    atWas.current = at;
    if (at && steps.includes(at)) leapRef.current(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  const enterRef = useRef(enter);
  enterRef.current = enter;
  const runStep = run?.step;
  useEffect(() => {
    if (runStep && runStep !== step) enterRef.current(runStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStep]);
  const builtRef = useRef(run?.onBuilt);
  builtRef.current = run?.onBuilt;
  const runT = useRef<number | null>(null);
  runT.current = run ? run.T : null;
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    // for looking at any moment of the stretch that runs by itself
    (window as unknown as { __flowAt: (b: number) => void }).__flowAt = (b) => {
      tB.current = b;
    };
    let raf = 0;
    let last = performance.now();
    let shown = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * live.current.speed;
      last = now;
      const at = live.current.step;
      if (at === "build" && !document.hidden && !live.current.halt) {
        if (clock && clock.current != null) tB.current = clock.current;
        else if (runT.current != null) {
          // (as it really runs: no further than what has really been made, and never back)
          tB.current = Math.max(Math.min(tB.current + dt, runT.current), Math.min(tB.current, runT.current));
          if (tB.current > score.build.end + 1.5) builtRef.current?.();
        } else {
          tB.current += dt;
          if (tB.current > score.build.end + 1.5) nextRef.current();
        }
      }
      if (now - shown > 90) {
        shown = now;
        setTick((x) => x + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const N = score.sources.length;
  const pageTime = useMemo(() => pageTimeOf(tape, stream, score), [tape, stream, score]);
  const making = step === "build";
  const opening = making && tB.current < -0.5;
  live.current.halt = !!halt;
  const played = PLAYED.includes(step);
  const phase = useRef<"decide" | "run" | "result">("decide");
  if (played) phase.current = step as "decide" | "run" | "result";
  const done = step === "build" ? sat((tB.current + LEAD) / (score.build.end + LEAD)) : step === "run" ? prog.current : 0;

  return (
    <FaceStyle.Provider value={face > 0 ? face : 1}>
    <div
      ref={root}
      className="fixed inset-x-0 top-12 bottom-0 overflow-hidden"
      style={{ background: P.page }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const k = r.width / Math.max(1, e.currentTarget.clientWidth);
        mouse.current = { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, on: true };
        // the picture is taken hold of and turned: round with a pull sideways, over and under with a pull up or down
        const d = dragAt.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.held) {
          // (a press that does not move is a click, and is left alone)
          if (dx * dx + dy * dy < 16) return;
          d.held = true;
          eye.current.hot = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.style.userSelect = "none";
        }
        eye.current.az -= dx * 0.0055;
        eye.current.el = Math.min(0.95, Math.max(-0.7, eye.current.el + dy * 0.004));
        d.x = e.clientX;
        d.y = e.clientY;
      }}
      onPointerDown={(e) => {
        // (before there is a world there is nothing to go round: the home page and the questions hold still)
        if (flat(step)) return;
        if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
        dragAt.current = { x: e.clientX, y: e.clientY, held: false };
      }}
      onPointerUp={(e) => {
        if (dragAt.current?.held) {
          e.currentTarget.releasePointerCapture(e.pointerId);
          e.currentTarget.style.userSelect = "";
        } else if (dragAt.current && face > 0) {
          // a press that did not move: whoever's face it was on is chosen (again: let go; on nothing: let go)
          const r = e.currentTarget.getBoundingClientRect();
          const k = r.width / Math.max(1, e.currentTarget.clientWidth);
          const i = stage.current?.pick((e.clientX - r.left) / k, (e.clientY - r.top) / k) ?? -1;
          setPicked((was) => (i === was ? -1 : i));
        }
        dragAt.current = null;
        eye.current.hot = false;
      }}
      onPointerCancel={(e) => {
        e.currentTarget.style.userSelect = "";
        dragAt.current = null;
        eye.current.hot = false;
      }}
      onPointerLeave={() => {
        mouse.current.on = false;
        if (!dragAt.current?.held) dragAt.current = null;
      }}
      onWheel={(e) => {
        if (flat(step)) return;
        // (what scrolls of its own keeps the wheel)
        for (let n = e.target as HTMLElement | null; n && n !== e.currentTarget; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return;
        eye.current.zoom = Math.min(1.9, Math.max(0.42, eye.current.zoom * Math.exp(e.deltaY * 0.0011)));
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
        eye.current.az = 0;
        eye.current.el = 0;
        eye.current.zoom = 1;
      }}
    >
      <style>{`${STAGE_CSS}
@keyframes flow-rise { from { opacity: 0; transform: translateY(12px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
.flow-rise { animation: flow-rise .7s cubic-bezier(.2,.7,.2,1) both; }
@keyframes flow-out { to { opacity: 0; filter: blur(3px); } }
.flow-out { animation: flow-out .36s ease both; pointer-events: none; }
@keyframes flow-in { from { opacity: 0; } to { opacity: 1; } }
.flow-in { animation: flow-in .5s ease .16s both; }
@keyframes flow-drift { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
@keyframes flow-halo { 0%, 100% { box-shadow: 0 0 0 0 rgb(${P.warmRgb} / 0.5); } 50% { box-shadow: 0 0 0 6px rgb(${P.warmRgb} / 0); } }`}</style>
      <Galaxy
        score={score}
        quality={tier?.quality ?? 0}
        form={form}
        volume={volume}
        pixels={pixels}
        open={open}
        trans={trans}
        net={net}
        off={!tier}
        onSlow={onSlow}
        drive={(st) => {
          const L = live.current;
          if (clock && clock.current != null && L.step === "build") tB.current = clock.current;
          const w = st.field.w;
          const h = st.field.h;
          // (the picture is not uncovered on the galaxy that is worked out, to change under the eye to the one that was
          // measured when that comes: it stays covered until it has come, or has plainly not)
          if (born.current?.st !== st) born.current = { st, t: performance.now() };
          const coming = open === 2 && st.field.skyCame === 0 && performance.now() - born.current.t < 6000;
          if (coming) {
            // waited for
          } else if (jump.current) {
            jump.current = false;
            st.jump();
            cover.current = 3;
          } else if (cover.current > 0 && --cover.current === 0) setVeil(false);
          st.bare = true;
          st.named = false;
          st.full = false;
          st.led = true;
          st.keep = L.keep ? 1 : 0;
          st.target = -1;
          st.view = eye.current;
          // everyone's face, who the pointer is over, and who has been chosen
          stage.current = st;
          st.face = L.face;
          st.fine = L.fine;
          st.taken = gathered.current;
          // (set another way, the home page and the questions have no names of stars under their words)
          st.starNames = !(L.lay > 0 && (L.step === "home" || L.step === "ask"));
          st.says = says;
          st.picked = L.face > 0 ? L.picked : -1;
          st.still = st.picked >= 0;
          st.pointer = mouse.current.on && !eye.current.hot ? { x: mouse.current.x, y: mouse.current.y } : null;
          if (root.current) root.current.style.cursor = eye.current.hot ? "grabbing" : st.hoverI >= 0 ? "pointer" : "";
          // (their card is put at once beside where they will be when the eye has come to them, the middle of the room
          // the page leaves the picture, and does not move: to the right where there is room, else to the left)
          const cd = card.current;
          if (cd && L.picked >= 0) {
            const at = st.centre ?? { x: st.field.w / 2, y: st.field.h / 2 };
            const gap = 54;
            const cx = at.x + gap + cd.offsetWidth <= st.field.w - 16 ? at.x + gap : Math.max(16, at.x - gap - cd.offsetWidth);
            const cy = Math.min(st.field.h - BAR - cd.offsetHeight - 12, Math.max(12, at.y - cd.offsetHeight * 0.36));
            cd.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
            cd.style.opacity = "1";
          }
          // on the home page, and while a world is being built, the picture bends round wherever the pointer is, as light does round a mass
          st.lens = (L.step === "home" || L.step === "build") && mouse.current.on && !eye.current.hot ? { x: mouse.current.x, y: mouse.current.y, k: 1 } : null;
          const s = L.step;
          // going in after what was written: the eye goes into the sky from the moment it is begun and comes to rest
          // where what was written is understood, whenever that page comes; one movement across both pages
          const since = leftAt.current ? (performance.now() - leftAt.current) / 1000 : 99;
          const dive = since < 3.2 ? Math.pow(Math.sin(Math.PI * Math.min(1, since / 3.2)), 2) : 0;
          if (s === "know") {
            // (what was written is being understood: the cloud it drew into, as it is while things are asked)
            st.mode = "pre";
            st.found = ZEROS;
            st.read = ZEROS;
            st.typed = 1;
            st.margins = { l: 0, r: 0, t: 0, b: 0 };
            st.shot = { look: [0, 0, 0], dist: 35.5 - 13 * dive, elev: 0.46 };
            st.centre = { x: w / 2, y: (h - BAR) * 0.66 };
            st.pool = { x: w / 2, y: h * 0.34, rx: 520, ry: 230, k: 0.62 };
            st.starNames = false;
            return;
          }
          if (s === "home" || s === "ask") {
            // before there is a world: what is scattered, and the cloud it has drawn into under what was written
            st.mode = "pre";
            st.found = ZEROS;
            st.read = ZEROS;
            // (where there is a box to write in, it has weight before anything is written: the sky sinks toward it and winds in, more once it is gone to, and more with each thing written)
            const base = L.ask > 0 ? (L.held ? 0.56 : 0.34) : 0;
            st.typed = s === "home" ? (L.left ? 1 : base + (1 - base) * L.typed) : 1 + 0.35 * gathered.current;
            st.margins = { l: 0, r: 0, t: 0, b: 0 };
            st.shot = s === "home" ? (L.left ? { look: [0, 0, 0], dist: 35.5 - 13 * dive, elev: 0.46 } : { look: [0, 0, 0], dist: 38, elev: 0.42 }) : { look: [0, 0, 0], dist: 35.5, elev: 0.46 };
            st.centre = { x: w / 2, y: (h - BAR) * (s === "home" && !L.left ? (L.ask > 0 ? 0.5 : 0.61) : 0.66) };
            // (what is written is written where the light gathers: the picture steps back a little just under the words)
            st.pool = s === "ask" ? { x: w / 2, y: h * 0.36, rx: 470, ry: 210, k: 0.62 } : L.ask > 0 ? { x: w / 2, y: (h - BAR) * 0.5, rx: 400, ry: 54, k: 0.22 } : L.lay > 0 ? { x: w / 2, y: (h - BAR) * 0.61 + 40, rx: 470, ry: 70, k: 0.5 } : { x: w / 2, y: h - BAR - 46, rx: w * 0.6, ry: 104, k: 0.7 };
            return;
          }
          // (what was answered has gone into what is gathering, and is still in it)
          st.typed = 1 + 0.35 * gathered.current;
          if (s === "start" || s === "report") {
            // (the world as it was made: over what is said of the opening; or all but gone behind a report)
            st.mode = "build";
            st.T = score.build.end + 1;
            st.margins = s === "start" ? { l: 60, r: 60, t: 70, b: BAR + 250 } : { l: 0, r: 0, t: 84, b: 56 + BAR };
            st.centre = null;
            st.pool = s === "start" ? { x: w / 2, y: h - BAR - 130, rx: 600, ry: 170, k: 0.72 } : { x: w / 2, y: (h - BAR) * 0.5, rx: 780, ry: 480, k: 0.88 };
            return;
          }
          if (s === "build") {
            st.mode = "build";
            st.T = tB.current;
            // while the sources are found and read the picture has the whole page, a few words at its foot; once the
            // world is being made, the page as it is while a world is built is laid round it
            const open = tB.current < -0.5;
            const side = Math.min(290, Math.max(0, (w - 860) / 2));
            // (done another way, the world has the room the page of the product would have taken: all but a column on the right, or all of it above a caption)
            const sn = L.lay !== 1 ? 0 : L.scene === 4 ? 2 : L.scene;
            if (L.lay > 0 && L.head > 0) {
              // (said at the top left: the picture has the same room from the first source found to the world being ready, all
              // but the record down the right; it steps back under what is said)
              const m = { l: 40, r: 496, t: 130, b: BAR + 30 };
              st.margins = m;
              st.centre = open ? { x: (m.l + w - m.r) / 2, y: (m.t + h - m.b) / 2 } : null;
              st.pool = { x: 300, y: 116, rx: 420, ry: 164, k: 0.6 };
              return;
            }
            st.margins = open ? { l: 0, r: 0, t: 26, b: BAR + 168 } : sn === 1 ? { l: 40, r: 356, t: 120, b: BAR + 30 } : sn === 2 ? { l: 40, r: 496, t: 120, b: BAR + 30 } : sn === 3 ? { l: 60, r: 60, t: 120, b: BAR + 190 } : { l: side, r: side, t: 196, b: 96 + BAR };
            st.centre = open ? { x: w / 2, y: (h - BAR) * 0.45 } : null;
            st.pool = open ? { x: w / 2, y: h - BAR - 86, rx: 430, ry: 112, k: 0.6 } : sn === 3 ? { x: w / 2, y: h - BAR - 104, rx: 560, ry: 140, k: 0.72 } : { x: w / 2, y: 70, rx: 400, ry: 120, k: 0.78 };
            return;
          }
          feed.current?.(st, w, h);
        }}
      />
      {/* (the picture has no top edge: it comes out of the page, under the name and the two words above it) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28" style={{ background: `linear-gradient(${P.page}, rgb(${P.pageRgb} / 0))` }} />
      {/* over the picture while it is put somewhere by hand */}
      <div className="pointer-events-none absolute inset-0" style={{ background: P.page, opacity: veil ? 1 : 0, transition: `opacity ${veil ? 0.28 : 0.6}s ease` }} />

      <Fade on={step === "home" && !sub} className="absolute inset-0">
        {lay > 0 ? (
          <HomeWords v={lay} scene={sceneAt("home")} q={q} setQ={setQ} onStart={begin(run ? () => run.onStart(q.trim()) : () => void window.setTimeout(next, 900))} leaving={left} canStart={run ? !run.busy : steps.length > 1} home={home} phrases={PHRASES} ask={ask} onHold={setGone} />
        ) : (
          <HomeStage q={q} setQ={setQ} onStart={next} canStart={steps.length > 1} home={home} />
        )}
      </Fade>
      {run && (
        <Fade on={!!run.stopped} className="absolute inset-0" style={{ background: `rgb(${P.pageRgb} / 0.5)`, backdropFilter: "blur(4px)" }}>
          {run.stopped && <Stopped {...run.stopped} />}
        </Fade>
      )}
      {run && (
        <Fade on={step === "home" && (!!run.busy || !!run.err)} className="pointer-events-none absolute inset-x-0 text-center text-[13px]" style={{ bottom: 150, color: run.err ? P.warm : P.mute }}>
          {run.err ? t("startFailed", { error: run.err }) : t("understanding")}
        </Fade>
      )}
      {more && (
        <>
          {/* (from the home page: everything you have made, and the settings; and what the one take left out, each in its place) */}
          <Fade on={!run && step === "home" && !sub} className="absolute top-6 right-9 flex gap-5 text-[12px]" style={{ color: P.mute }}>
            <button type="button" onClick={() => setSub("all")}>
              {t("allProjects")}
            </button>
            <button type="button" onClick={() => setSub("settings")}>
              {t("settings")}
            </button>
            <LocaleSwitch />
          </Fade>
          <Fade on={step === "home" && sub === "all"} className="absolute inset-0" style={{ background: `rgb(${P.pageRgb} / 0.6)`, backdropFilter: "blur(5px)" }}>
            <Projects home={home} onClose={() => setSub(null)} />
          </Fade>
          <Fade on={step === "home" && sub === "settings"} className="absolute inset-0" style={{ background: `rgb(${P.pageRgb} / 0.6)`, backdropFilter: "blur(5px)" }}>
            <SettingsPage onClose={() => setSub(null)} />
          </Fade>
          <Fade on={step === "know"} className="absolute inset-0">
            {step === "know" && <Know tape={tape} said={q || world.title} speed={pace} onDone={next} live={!!run} />}
          </Fade>
          <Fade on={step === "start"} ms={800} className="absolute inset-0">
            {step === "start" && <Start world={world} speed={pace} onDone={next} live={!!run} />}
          </Fade>
          {play && (
            <Fade on={step === "report"} ms={800} className="absolute inset-0">
              <ReportPage play={play} onEnd={() => setSheet("end")} />
              {run && (
                <button type="button" onClick={() => enter("decide")} className="absolute bottom-7 left-1/2 -translate-x-1/2 text-[12.5px]" style={{ color: P.mute }}>
                  {t("backToPlay")}
                </button>
              )}
            </Fade>
          )}
          <Fade on={making && !!halt} className="absolute inset-0" style={{ background: `rgb(${P.pageRgb} / 0.5)`, backdropFilter: "blur(4px)" }}>
            <Stopped what={opening ? "research" : "build"} status={halt ?? "paused"} error={halt === "failed" ? t("noResponse") : null} onResume={() => setHalt(null)} />
          </Fade>
        </>
      )}
      <Fade on={step === "ask"} className="absolute inset-0">
        {lay === 1 && scene === 4 ? (
          // (in what was chosen: everything that is asked, an answer of your own to any of it; what is answered is kept at the top as one
          // line, and at the end goes as light into what is gathering in the picture, which is where the middle of it is kept here: see asks.tsx)
          // (not before what is asked has been read: with nothing yet, it would be taken for there being nothing to ask)
          (fc || fcRead || !world.forecastId || run) && <Ask key={askAgain} items={run ? (fc?.clarify ?? []) : designAsked(world.id, fc?.clarify as Asked[] | undefined)} title={q || world.title} onDone={next} onAnswers={run?.onAnswers} to={{ x: box.w / 2, y: (box.h - BAR) * 0.66 }} onGather={(k) => (gathered.current = k)} />
        ) : lay > 0 ? (
          <AskWords v={lay} scene={sceneAt("ask")} items={(fc?.clarify ?? []).slice(0, 3)} onDone={next} />
        ) : (
          <AskStage items={(fc?.clarify ?? []).slice(0, 3)} onDone={next} />
        )}
      </Fade>
      <Fade on={opening} className="absolute inset-0">
        <Opening v={lay} scene={sceneAt("build")} bare={lay > 0 && head > 0} t={tB.current + LEAD} lead={LEAD} tape={tape} score={score} said={q || world.title} />
      </Fade>
      {tape && sceneAt("build") === 0 && (
        <Fade on={step === "build" && !opening} ms={900} className="absolute inset-x-0" style={{ top: -48, bottom: BAR, transform: "translateZ(0)" }}>
          <style>{`${WAIT_CSS} .flow-wait > div { background: transparent !important; } .flow-bare [class*="top-[4%]"] { display: none !important; }`}</style>
          <div className={`flow-wait${lay > 0 ? " flow-bare" : ""}`}>
            <NewWorld tape={tape} real={world} t={pageTime(Math.max(0, Math.min(tB.current, score.build.end)))} hideSky />
          </div>
        </Fade>
      )}
      {/* (set another way, what is said at the top while a world is built is said here, not by the page under it) */}
      {lay > 0 && head > 0 && (
        // (set at the top left, it is one thing from the first source found to the world being ready)
        <Fade on={making} ms={900} className="pointer-events-none absolute inset-0">
          <BuildWords title={world.title} {...buildWords(t, score, tB.current, LEAD, tape, pageTime)} {...(run?.counts ? { counts: run.counts, elapsed: run.elapsed ?? "", timed: !!run.elapsed } : {})} />
        </Fade>
      )}
      {lay > 0 && !head && (
        <Fade on={step === "build" && !opening} ms={900} className="pointer-events-none absolute inset-0">
          <BuildHead v={lay} title={world.title} {...buildSays(t, score, tB.current, pageTime)} left={Math.min(290, Math.max(0, (box.w - 860) / 2))} right={Math.min(290, Math.max(0, (box.w - 860) / 2))} />
        </Fade>
      )}
      {sceneAt("build") > 0 && (
        <Fade on={step === "build" && !opening} ms={900} className="pointer-events-none absolute inset-0">
          <BuildScene scene={sceneAt("build")} score={score} T={tB.current} pick={setPicked} />
        </Fade>
      )}
      {play && (
        <Fade on={played} className="absolute inset-0">
          <PlayStage key={`${stepN}`} live={run?.play} onMore={more ? () => setSheet("world") : undefined} tools={more ? <ToolsLine play={play} open={setSheet} /> : undefined} world={world} play={play} stream={stream} score={score} stepN={stepN} phase={phase.current} setPhase={setStep} feed={feed} prog={prog} box={box} speed={pace} root={root} fine={fine} lay={lay} scene={scene} pick={setPicked} />
        </Fade>
      )}

      {more && play && (
        <>
          <Fade on={step === "decide" && !sheet} className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: BAR + 22 }}>
            <div className="flex items-center gap-5">
              <AskLine play={play} open={() => setSheet("ask")} />
              {!!play.notices?.length && (
                <button type="button" onClick={() => setSheet("notes")} className="pointer-events-auto text-[12px]" style={{ color: P.mute }}>
                  {t("notices", { count: play.notices.length })}
                </button>
              )}
            </div>
          </Fade>
          <Sheet on={sheet === "ask"} onClose={() => setSheet(null)} w={900}>
            <AskSheet play={play} onUse={() => setSheet(null)} onAsk={R?.onAsk} busy={R?.busy} asking={R?.asking} />
          </Sheet>
          <Sheet on={sheet === "clarify"} onClose={() => setSheet(null)} w={760}>
            <ClarifySheet key={R?.note ?? ""} play={play} note={R ? R.note : t("sampleClarify")} said={R ? R.said : (play.decisions.filter((d) => d.restatement).at(-1)?.restatement ?? "")} onAct={(text) => (setSheet(null), R?.onAct([], text))} />
          </Sheet>
          <Sheet on={sheet === "meet"} onClose={() => setSheet(null)}>
            <MeetingSheet key={(R?.meeting ?? meeting)?.id ?? ""} m={R ? R.meeting : meeting} world={world} onDone={() => setSheet(null)} onSay={R?.onSay} onLeave={R?.onLeave} busy={R?.busy} />
          </Sheet>
          <Sheet on={sheet === "lines"} onClose={() => setSheet(null)}>
            <LinesSheet play={play} onGo={(id) => (setSheet(null), R?.onBranch(id))} onFork={R ? (n, mode) => (setSheet(null), R.onFork(n, mode)) : undefined} />
          </Sheet>
          <Sheet on={sheet === "notes"} onClose={() => setSheet(null)} w={640}>
            <NotesSheet play={play} />
          </Sheet>
          <Sheet on={sheet === "arc"} onClose={() => setSheet(null)}>
            <ArcSheet play={play} />
          </Sheet>
          <Sheet on={sheet === "intel"} onClose={() => setSheet(null)} w={980}>
            <IntelSheet play={play} world={world} />
          </Sheet>
          <Sheet on={sheet === "world"} onClose={() => setSheet(null)} w={900}>
            <WorldSheet play={play} world={world} />
          </Sheet>
          <Sheet on={sheet === "goal"} onClose={() => setSheet(null)} w={680}>
            <GoalSheet play={play} world={world} onEnd={() => setSheet("end")} onContinue={(goal) => (setSheet(null), R?.onContinue(goal))} />
          </Sheet>
          <Sheet on={sheet === "end"} onClose={() => setSheet(null)} w={680}>
            <EndSheet world={world} onEnd={() => (R ? (setSheet(null), R.onEnd()) : leap("report"))} onClose={() => setSheet(null)} />
          </Sheet>
          <Sheet on={sheet === "ended"} onClose={() => setSheet(null)}>
            <EndedSheet play={play} onReport={() => (setSheet0(null), enter("report"))} onFork={() => setSheet("lines")} />
          </Sheet>
          <Sheet on={sheet === "reading"} onClose={() => setSheet(null)} w={680}>
            {sheet === "reading" && <ReadingSheet play={play} world={world} speed={pace || 1} />}
          </Sheet>
          <Sheet on={sheet === "error"} onClose={() => setSheet(null)} w={620}>
            <TroubleSheet play={play} onClose={() => setSheet(null)} said={R?.note || undefined} />
          </Sheet>
        </>
      )}

      {face > 0 && picked >= 0 && score.bodies[picked] && (
        <Who key={picked} innerRef={card} body={score.bodies[picked]!} world={world} stream={stream} score={score} onPick={setPicked} onClose={() => setPicked(-1)} branch={play && PLAYED.includes(step) ? play.branch.id : undefined} />
      )}

      {lay === 0 ? (
        <Fade on={step === "ask" || opening} className="pointer-events-none absolute top-6 left-9 max-w-[300px]">
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{t("youreThinking")}</div>
          <div className="mt-1.5 text-[14px] leading-[22px]">{cut(q || world.title, 44)}</div>
        </Fade>
      ) : (
        <Fade on={(step === "ask" && scene !== 4) || (opening && !head)} className={`pointer-events-none absolute top-7 truncate text-[13.5px] ${lay === 1 ? "inset-x-0 text-center" : lay === 2 ? "left-[72px] max-w-[520px]" : "left-9 max-w-[520px]"}`} style={{ color: P.mute }}>
          {cut(q || world.title, 40)}
        </Fade>
      )}

      {/* the steps, along the foot: any of them can be gone to (a record played back: not there as it really runs) */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-6 px-9" style={{ display: run ? "none" : undefined, height: BAR, background: `rgb(${P.pageRgb} / 0.72)`, backdropFilter: "blur(10px)", boxShadow: `inset 0 1px 0 rgb(${P.inkRgb} / 0.07)` }}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {steps.map((s) => {
            const i = steps.indexOf(s);
            const at = steps.indexOf(step);
            const on = s === step;
            return (
              <button key={s} type="button" onClick={() => leap(s)} className="group min-w-0 text-left" style={{ flex: s === "build" ? 2.2 : 1 }}>
                <div className="relative h-[3px] overflow-hidden rounded-full" style={{ background: `rgb(${P.inkRgb} / ${i < at ? 0.55 : 0.13})`, transition: "background-color .6s" }}>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${on ? Math.max(4, (s === "build" || s === "run" ? done : 1) * 100) : 0}%`, background: P.warm, opacity: on ? 1 : 0, transition: "opacity .6s" }} />
                </div>
                <div className="mt-[7px] truncate text-[11.5px] transition-colors duration-500" style={{ color: on ? P.ink : i < at ? P.mute : P.faint }}>
                  {t(`step.${s}`)}
                </div>
              </button>
            );
          })}
        </div>
        {more && (
          <div className="relative shrink-0">
            {/* (only for looking at this page: every state there is no other way to come to in a play that is read back) */}
            <button type="button" onClick={() => setMenu((x) => !x)} className="rounded-full px-3 py-[5px] text-[11.5px] transition-colors duration-300" style={{ boxShadow: `inset 0 0 0 1px rgb(${P.inkRgb} / 0.14)`, color: menu ? P.ink : P.mute }}>
              {t("otherStates")}
            </button>
            <div className="absolute right-0 bottom-[38px] w-[176px] rounded-[14px] py-2 backdrop-blur-xl" style={{ background: `rgb(${P.pageRgb} / 0.94)`, boxShadow: `0 20px 60px rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(${P.inkRgb} / 0.1)`, opacity: menu ? 1 : 0, transform: menu ? "none" : "translateY(6px)", pointerEvents: menu ? "auto" : "none", transition: "opacity .3s ease, transform .35s cubic-bezier(.2,.7,.2,1)" }}>
              {(
                [
                  [t("researchStopped"), () => (enter("build"), (tB.current = -5), setHalt("failed"))],
                  [t("buildAtLimit"), () => (enter("build"), (tB.current = score.build.end * 0.5), setHalt("paused"))],
                  ...(play ? SHEETS.map(([k, name]): [string, () => void] => [name, () => (step !== "decide" && enter("decide"), setSheet(k))]) : []),
                ] as [string, () => void][]
              ).map(([name, go]) => (
                <button key={name} type="button" onClick={() => (setMenu(false), go())} className="block w-full px-4 py-[5px] text-left text-[12px] transition-colors duration-200 hover:bg-white/[0.06]" style={{ color: P.ink }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
{open < 1 && (
          <button type="button" onClick={() => setKeep((k) => !k)} title={t("keepTitle")} className="flex shrink-0 items-center gap-2 rounded-full px-3 py-[5px] text-[11.5px] transition-colors duration-500" style={{ boxShadow: `inset 0 0 0 1px rgb(${P.inkRgb} / 0.14)`, color: keep ? P.ink : P.faint }}>
          <span className="h-[6px] w-[6px] rounded-full transition-colors duration-500" style={{ background: keep ? "rgb(107 219 204)" : `rgb(${P.inkRgb} / 0.22)` }} />
          {t("keepNebula")}
        </button>
        )}
        <div className="flex shrink-0 items-center gap-2" style={{ fontFamily: MONO, fontSize: 11 }}>
          {[1, 2, 4].map((x) => (
            <button key={x} type="button" onClick={() => setSpeed(x)} style={{ color: speed === x ? P.ink : P.faint }}>
              ×{x}
            </button>
          ))}
        </div>
      </div>
    </div>
    </FaceStyle.Provider>
  );
}

/** The stages of a world being built that are said in a word of ours (`state.<key>` of flow-lab.flow). */
const STATE = new Set(["who", "fact", "persona", "tie", "crowd", "risk", "mile", "open"]);

/** While a world is built: what is being done to it now in a word, how long it has taken, and how much of it there is (`t` is flow-lab.flow). */
function buildSays(t: T, score: Score, T: number, pageTime: (t: number) => number) {
  const stage = [...score.build.stages].filter((x) => T >= x.s).sort((a, b) => b.s - a.s)[0];
  const secs = Math.max(0, Math.round(pageTime(Math.max(0, Math.min(T, score.build.end)))));
  const count = (k: string) => score.build.beats.reduce((n, b) => n + (b.k === k && b.s <= T ? 1 : 0), 0);
  return {
    state: T >= score.build.end - 0.5 ? t("built") : stage ? (STATE.has(stage.key) ? t(`state.${stage.key}`) : stage.name) : t("state.who"),
    elapsed: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
    counts: [
      [count("appear"), t("countPeople", { count: count("appear") })],
      [count("fact"), t("countFacts", { count: count("fact") })],
      [count("tie"), t("countTies", { count: count("tie") })],
    ] as [number, string][],
  };
}

/** What is said at the top left from the first source found to the world being ready: how long it has taken and how much there is. */
function buildWords(tx: T, score: Score, tB: number, lead: number, tape: Tape | null, pageTime: (t: number) => number) {
  const t = tB + lead;
  const pre = tB < -0.5;
  const R = tape?.research;
  const n = score.sources.length;
  const k = sat((t - 5.4) / Math.max(1, lead - 6.6));
  const found = score.sources.filter((_, i) => t > 0.6 + i * 0.24 + 0.9).length;
  const hosts = R ? new Set(R.intel.map((x) => x.host)).size : n;
  const intel = R ? R.intel.length : score.sources.reduce((a, s) => a + s.n, 0);
  const src = pre ? Math.round(hosts * sat(found / Math.max(1, n))) : hosts;
  const read = pre ? Math.round(intel * k) : intel;
  const says = buildSays(tx, score, tB, pageTime);
  const counts: [number, string][] = pre
    ? [
        [src, tx("countSources", { count: src })],
        [read, tx("countRead", { count: read })],
      ]
    : says.counts;
  return { elapsed: says.elapsed, timed: !pre, counts };
}

// How the engine marks a stage of the build as done (Chinese "\u9636\u6bb5\u5b8c\u6210", "stage done"); the stage is told by the words
// in its text: "\u754c\u5b9a" (defining who), "\u4e8b\u5b9e" (facts), "\u5173\u7cfb\u7f51" (the web of ties) or "\u4eba\u8bbe" (profiles),
// "\u7fa4\u4f53" (groups), "\u91cc\u7a0b\u7891" (milestones).
const STAGE_DONE = "\u9636\u6bb5\u5b8c\u6210";

/** The page's clock while a world is built, matched to the picture's stage by stage. */
function pageTimeOf(tape: Tape | null, stream: Stream, score: Score) {
  if (!tape?.world) return (t: number) => t;
  const W = tape.world;
  const end = score.build.end;
  const done = (re: RegExp) => {
    const xs = stream.events.filter((e) => e.phase === "build" && e.act === "advance" && e.head === STAGE_DONE && re.test(e.text)).map((e) => sec(e.t, W.t0));
    return xs.length ? Math.max(...xs) : null;
  };
  const st = (k: string) => score.build.stages.find((s) => s.key === k);
  const last = sec(W.t1, W.t0);
  const raw: [number | undefined, number | null][] = [
    [0, 0],
    [st("who")?.e, done(/\u754c\u5b9a/)],
    [st("fact")?.e, done(/\u4e8b\u5b9e/)],
    [Math.max(st("persona")?.e ?? 0, st("tie")?.e ?? 0) || undefined, done(/\u5173\u7cfb\u7f51|\u4eba\u8bbe/)],
    [Math.max(st("crowd")?.e ?? 0, st("risk")?.e ?? 0) || undefined, done(/\u7fa4\u4f53/)],
    [st("mile")?.e, done(/\u91cc\u7a0b\u7891/)],
    [st("open")?.s, last],
    [end, last + 6],
  ];
  const pts: [number, number][] = [];
  for (const [a, b] of raw) if (a != null && b != null && (!pts.length || (a > pts[pts.length - 1]![0] && b >= pts[pts.length - 1]![1]))) pts.push([a, b]);
  return (t: number) => {
    const j = pts.findIndex((p) => p[0] >= t);
    if (j <= 0) return j === 0 ? pts[0]![1] : pts[pts.length - 1]![1];
    const [a0, b0] = pts[j - 1]!;
    const [a1, b1] = pts[j]!;
    return b0 + ((t - a0) / Math.max(1e-6, a1 - a0)) * (b1 - b0);
  };
}

// ------------------------------------------------------------------------------------------- home

function HomeStage({ q, setQ, onStart, canStart, home }: { q: string; setQ: (s: string) => void; onStart: () => void; canStart: boolean; home: HomeData }) {
  const { P } = useApp();
  const t = useT("flow-lab.flow");
  const tStart = useT("product.start.shared");
  const phrases = useMemo(() => phrasesOf(tStart).map((p) => p[0]), [tStart]);
  const typing = useTyping(phrases, !q);
  const start = () => q.trim() && canStart && onStart();
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[9%] flex flex-col items-center px-6 text-center">
        <div className="flow-rise text-[10.5px] tracking-[0.46em]" style={{ fontFamily: MONO, color: P.faint }}>
          KALCHAS
        </div>
        <h1 className="flow-rise mt-5 text-[44px] leading-none font-medium tracking-tight" style={{ animationDelay: ".08s" }}>
          {t("homeQuestion")}
        </h1>
        <p className="flow-rise mt-4 max-w-[560px] text-[14.5px] leading-[1.7]" style={{ color: P.mute, animationDelay: ".16s" }}>
          {t("homeLead")}
        </p>
        <div className="flow-rise pointer-events-auto mt-8 flex h-[64px] w-[min(720px,90vw)] items-center gap-3 rounded-full pr-3 pl-8" style={{ animationDelay: ".24s", background: `rgb(${P.pageRgb} / 0.7)`, boxShadow: `0 24px 70px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(${q ? P.warmRgb : P.inkRgb} / ${q ? 0.45 : 0.16})`, backdropFilter: "blur(16px)", transition: "box-shadow .5s" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && start()} placeholder={typing} autoFocus className="min-w-0 flex-1 bg-transparent text-[17px] outline-none" style={{ color: P.ink }} />
          <button type="button" onClick={start} disabled={!q.trim()} aria-label={t("start")} className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full transition-opacity duration-500" style={{ background: P.warm, color: P.page, opacity: q.trim() ? 1 : 0.3 }}>
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
              <path d="M1 7h13M9 1.5L14.5 7 9 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="flow-rise mt-3.5 flex h-5 items-center text-[11.5px]" style={{ animationDelay: ".32s" }}>
          <span className="transition-colors duration-500" style={{ color: q ? P.warm : P.faint }}>
            {q ? t("homeTyping") : t("homeHint")}
          </span>
        </div>
      </div>

      <Recent home={home} />
    </>
  );
}

/**
 * The worlds you were last in, on the same screen as the question: the latest five along one hairline, the ones
 * waiting for you warm; the rest are a step away.
 */
function Recent({ home }: { home: HomeData }) {
  const { P } = useApp();
  const t = useT("flow-lab.flow");
  const projectLine = useProjectLine();
  const worlds = useMemo(() => {
    const xs = [...home.projects].filter((p) => !RUNNING.has(p.status) || needsYou(p));
    return xs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  }, [home.projects]);
  const waiting = home.projects.filter(needsYou).length + home.revisits.filter((r) => r.due).length;
  if (!worlds.length) return null;
  return (
    <div className="flow-rise absolute inset-x-0 flex justify-center px-8" style={{ bottom: BAR + 16, animationDelay: ".4s" }}>
      <div className="w-[min(1180px,100%)]">
        <div className="flex items-center gap-4">
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{t("recent")}</span>
          {waiting > 0 && (
            <span className="flex items-center gap-2 text-[12px]" style={{ color: P.warm }}>
              <span className="k-pulse h-[6px] w-[6px] rounded-full" style={{ background: P.warm }} />
              {t("waiting", { count: waiting })}
            </span>
          )}
          <span className="h-px flex-1" style={{ background: `rgb(${P.inkRgb} / 0.14)` }} />
          <A href={`${BASE}/all`} className="text-[12px] transition-colors hover:text-[rgb(var(--k-ink))]" style={{ color: P.mute }}>
            {t("allN", { count: home.projects.length })}
          </A>
        </div>
        <div className="mt-3 grid gap-x-7" style={{ gridTemplateColumns: `repeat(${worlds.length}, minmax(0, 1fr))` }}>
          {worlds.map((p: ProjectCard) => {
            const warm = needsYou(p);
            return (
              <A key={p.id} href={projectHref(p)} className="group flex min-w-0 items-center gap-3 py-1">
                <span className="shrink-0">
                  <Glyph p={p} size={32} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] transition-colors group-hover:text-[rgb(var(--k-ink))]" style={{ color: warm ? P.warm : `rgb(${P.inkRgb} / 0.86)` }}>
                    {p.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px]" style={{ color: P.mute }}>
                    {projectLine(p)}
                  </span>
                </span>
              </A>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- asked; the answer alone; the sources found

/** What has to be known first: one thing at a time over the cloud, the answer that was really given already chosen. */
function AskStage({ items, onDone }: { items: Clarify[]; onDone: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.flow");
  const [i, setI] = useState(0);
  const it = items[i];
  const step = () => (i < items.length - 1 ? setI(i + 1) : onDone());
  if (!it)
    return (
      <div className="absolute inset-x-0 top-[30%] flex flex-col items-center text-center">
        <div className="flow-rise text-[26px] font-medium">{t("nothingToAsk")}</div>
        <button type="button" onClick={onDone} className="flow-rise mt-7 rounded-full px-6 py-2.5 text-[14px]" style={{ background: P.warm, color: P.page }}>
          {t("buildItsWorld")}
        </button>
      </div>
    );
  return (
    <Swap id={String(i)} className="absolute inset-x-0 top-[21%] h-[440px]">
      <div className="flex flex-col items-center px-6 text-center">
        <div className="flow-rise" style={{ fontFamily: MONO, fontSize: 11, color: P.warm, letterSpacing: "0.08em" }}>
          {t("askFirst", { n: i + 1, total: items.length })}
        </div>
        <h2 className="flow-rise mt-4 max-w-[760px] text-[30px] leading-[1.45] font-medium" style={{ animationDelay: ".06s" }}>
          {it.q}
        </h2>
        {it.why && (
          <div className="flow-rise mt-3 max-w-[560px] text-[13.5px]" style={{ color: P.mute, animationDelay: ".12s" }}>
            {it.why}
          </div>
        )}
        <div className="flow-rise mt-7 flex max-w-[820px] flex-wrap justify-center gap-2.5" style={{ animationDelay: ".18s" }}>
          {(it.options ?? []).slice(0, 6).map((o) => {
            const on = o === it.answer;
            return (
              <button key={o} type="button" onClick={step} className="rounded-full px-5 py-2.5 text-[14.5px] backdrop-blur-md transition-colors" style={{ background: on ? P.warm : `rgb(${P.pageRgb} / 0.6)`, color: on ? P.page : P.ink, boxShadow: on ? "none" : `inset 0 0 0 1px rgb(${P.inkRgb} / 0.18)` }}>
                {cut(o, 16)}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={step} className="flow-rise mt-7 text-[13px]" style={{ color: P.mute, animationDelay: ".24s" }}>
          {i < items.length - 1 ? t("nextQuestion") : t("buildItsWorld")}
        </button>
      </div>
    </Swap>
  );
}

/**
 * The first of the world being built, before anything is made: where the information is, found and then read. A few
 * words at the foot of the picture, which has the whole page.
 */
function Opening({ v = 0, scene = 0, bare = false, t, lead, tape, score, said }: { v?: number; scene?: number; /** Only the record of what is searched for, down the right: the rest is said at the top left. */ bare?: boolean; t: number; lead: number; tape: Tape | null; score: Score; said: string }) {
  const { P } = useApp();
  // (`t` is the time here: the texts are `tx`)
  const tx = useT("flow-lab.flow");
  const R = tape?.research;
  const n = score.sources.length;
  const k = sat((t - 5.4) / Math.max(1, lead - 6.6));
  const found = score.sources.filter((_, i) => t > 0.6 + i * 0.24 + 0.9).length;
  const hosts = R ? new Set(R.intel.map((x) => x.host)).size : n;
  const intel = R ? R.intel.length : score.sources.reduce((a, s) => a + s.n, 0);
  const qs = R?.searches ?? [];
  const cur = qs.length ? qs[Math.min(qs.length - 1, Math.floor(sat(t / lead) * qs.length))]!.q : said;
  const head = t < 5 ? tx("findingSources") : k < 1 ? tx("readingIn") : tx("buildingFromThem");
  if (v > 0) {
    // (each source as far as it has been found and read, for the roll; what has been searched for so far, for the record)
    const list: Item[] = score.sources.slice(0, 11).map((x, i) => {
      const got = t > 0.6 + i * 0.24 + 0.9;
      return { key: x.host, name: x.host, line: got ? `${Math.round(x.n * k)} / ${x.n}` : "", state: !got ? "todo" : k < 1 ? "now" : "done" };
    });
    const asked = qs.slice(0, Math.min(qs.length, Math.floor(sat(t / lead) * qs.length) + 1)).map((x) => x.q);
    if (bare)
      // (where the record of what is made will be: what is searched for, a line each, coming as it came)
      return (
        <div className="pointer-events-none absolute right-9 w-[440px]" style={{ top: 110, bottom: BAR + 34 }}>
          <Log rows={asked.map((x, i) => ({ i, sec: "search", who: "", gist: x }))} bi={asked.length - 1} done={false} kinds={asked.map(() => null)} more={() => ""} seek={() => {}} lines={9} hold={1000} />
        </div>
      );
    return <OpeningWords v={v} scene={scene} head={t < 5 ? tx("phaseFind") : k < 1 ? tx("phaseRead") : tx("phaseBuild")} now={cur} sources={Math.round(hosts * sat(found / Math.max(1, n)))} read={Math.round(intel * k)} list={list} asked={asked} />;
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6 text-center" style={{ bottom: BAR + 24 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: P.warm, letterSpacing: "0.08em" }}>{tx("buildingWorld")}</div>
      <Swap id={head} className="relative mt-2 h-[32px] w-full">
        <div className="text-[22px] leading-[32px] font-medium">{head}</div>
      </Swap>
      <div className="mt-1.5 flex h-[22px] w-full max-w-[720px] items-center justify-center gap-2 text-[13px]" style={{ color: P.mute }}>
        <span className="k-pulse h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.warm }} />
        <Swap id={cur} className="relative h-[22px] min-w-0 flex-1">
          <div className="truncate leading-[22px]">{cut(cur, 46)}</div>
        </Swap>
      </div>
      <div className="mt-3 flex gap-8" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
        {[
          [Math.round(hosts * sat(found / Math.max(1, n))), tx("sourcesFound", { count: Math.round(hosts * sat(found / Math.max(1, n))) })],
          [Math.round(intel * k), tx("findingsRead", { count: Math.round(intel * k) })],
        ].map(([v, label]) => (
          <span key={label as string} className="flex items-baseline gap-1.5">
            <span className="text-[21px]" style={{ fontWeight: 300 }}>
              {v}
            </span>
            <span className="text-[11.5px]" style={{ color: P.mute, fontFamily: "inherit" }}>
              {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- a step of the play

/** How what is told goes out from whoever it is about: something said, something done, or nothing. */
/** What there is something to say of, in a step. */
/** A call with nothing to tell of it. */
const hollow = (c: Trace["calls"][number]) => (c.purpose === "resolve_uncertain" ? !(c.detail.items?.length ?? 0) : c.purpose === "settle_stretch" || c.purpose === "world_tick" ? !c.detail.summary && !(c.detail.chances?.length ?? 0) && !(c.detail.newcomers?.length ?? 0) : false);
const TOLD = new Set(["adjudicate_move", "actor_decision", "resolve_uncertain", "settle_stretch", "world_tick", "plan_jump", "situation"]);
const kindOf = (b: TBeat | null): "say" | "do" | "none" => {
  if (!b) return "none";
  const D = b.c.detail;
  if (b.c.purpose === "adjudicate_move") return "do";
  if (b.c.purpose !== "actor_decision") return "none";
  return D.said ? "say" : D.action && !D.quiet ? "do" : "none";
};
/** When, in the telling of it (ms), it leaves them: after what they think, which comes first. */
const actAt = (b: TBeat) => (b.c.purpose === "adjudicate_move" ? 700 : b.c.detail.thinking ? Math.max(900, Math.min(2200, b.dur * 0.28)) : 300);

function PlayStage({ world, play, stream, score, stepN, phase, setPhase, feed, prog, box, speed, root, fine, lay, scene, pick, tools, live, onMore }: { /** To all of the numbers, where only some are at the head. */ onMore?: () => void; /** As it really runs: the step as far as it has been worked out, and what is done handed on. */ live?: PlayRun | null; /** What a play has at hand, where it is more than words (the whole flow). */ tools?: React.ReactNode; fine: boolean; lay: number; scene: number; pick: (body: number) => void; world: WorldView; play: Play; stream: Stream; score: Score; stepN: number | null; phase: "decide" | "run" | "result"; setPhase: (p: "decide" | "run" | "result") => void; feed: React.MutableRefObject<PlayFeed | null>; prog: React.MutableRefObject<number>; box: { w: number; h: number }; speed: number; root: React.RefObject<HTMLDivElement | null> }) {
  const { P } = useApp();
  // (`t` is the step's own time here: the texts are `tx`, with `tp` and `tc` for what play.tsx and trace.ts write)
  const tx = useT("flow-lab.flow");
  const tp = useT("flow-lab.play");
  const tc = useT("product.replay.stage.trace");
  const locale = useLocale();
  // (in what was chosen: told as it is worked out, not as a finished thing read back (see turns.tsx). The world is
  // in the middle of the page with what is told under it, like a caption, where the eye already is, with the first
  // of what more there is to say of it in a line under that. Everyone in the step is down the left, as a dock; what
  // happened that was no one's doing is down the right, a line each. Anything that has come can be read again
  // where what is told is, by pressing it in a column.)
  const sx = lay === 1 && scene === 4 ? 4 : 0;
  // (a play written by engine 12, as the product plays it: none of the calls a step was told by. What the stop being
  // written gives as it comes is told in the middle, one thing at a time from a buffer, and the two columns hold the
  // whole line, this stop at the foot of each (see turns.tsx). The design pages never have it)
  const n12 = !!live && !!play.narrated && sx > 0;
  const pg = n12 ? (play.progress ?? null) : null;
  const line12 = useMemo(() => (n12 ? stopsOf(play) : []), [n12, play]);
  /** Where the move being worked out began (how many stops the line had), and whether its being worked out has been seen. */
  const runAt = useRef<{ n: number; seen: boolean } | null>(null);
  const [runN, setRunN] = useState(0);
  if (!n12 || phase === "decide") runAt.current = null;
  else if (phase === "run" && !runAt.current) runAt.current = { n: line12.length, seen: false };
  // (what the progress holds is this move's only once it is under way: until then it is the last one's)
  const fresh = n12 && phase === "run" && !!live?.running && !!pg?.running;
  if (fresh && runAt.current) runAt.current.seen = true;
  /** The picture's own clock for what engine 12 gives, in ms. */
  const epoch = useRef(Date.now());
  /** What has been taken up to be read again, in a step told this way (-1: nothing). */
  const [peek, setPeek] = useState(-1);
  /** The words under the world, as far as they go (for the picture to step back under them and no further). */
  const said = useRef<HTMLDivElement>(null);
  const d: Data = { world, play };
  const s = play.situation;
  const opts = s?.recommendations ?? [];
  const steps = useMemo(() => stepsOf(play), [play]);
  const tr = useTraces(play.branch.id, n12 ? [] : steps.filter((x) => x.did).map((x) => x.n));
  const trace = live ? live.trace : ((stepN != null ? tr.all?.find((x) => x.step === stepN) : null) ?? tr.best);
  // what is told: each party, each thing left to odds, the world's own motion, the next moment. What the engine looks
  // up on the way is not a thing told of its own: it is counted.
  // (in what was chosen, only what there is something to say of is told: what the engine does on the way that has no
  // name of its own, such as checking what really happened outside, is counted and not told)
  // (and nothing is told that has nothing in it: a ruling in which everything waits on someone's own decision, a stretch in which nothing happened)
  const tellable = useMemo(() => (trace ? beatsOf(trace) : []).filter((b) => !OTHER.has(b.c.purpose) && (!sx || (TOLD.has(b.c.purpose) && !hollow(b.c)))), [trace, sx]);
  // (told as it is worked out: how much of the telling's time a moment of the step's own time is given. The world is
  // run about twice as fast as it takes to tell, so that there is both waiting for it and being behind it)
  // (as it really runs, the step's own time is the time: a thing is told when it has really come)
  const per = live ? 1 : trace ? (tellable.reduce((a, b) => a + b.dur, 0) / Math.max(1, trace.ms)) * 0.55 : 1;
  const beats = useMemo(() => {
    let at = 0;
    if (!sx) return tellable.map((b) => ({ ...b, at: (at += b.dur) - b.dur, came: 0 }));
    // nothing is told before it has come: each thing when it came, or when what was being told before it is done
    let end = 0;
    return tellable.map((b) => {
      const came = b.t1 * per;
      const at = Math.max(end, came);
      end = at + b.dur;
      return { ...b, at, came };
    });
  }, [tellable, sx, per]);
  const looked = trace ? trace.calls.filter((c) => OTHER.has(c.purpose)).length : 0;
  const total = (beats.length ? beats[beats.length - 1]!.at + beats[beats.length - 1]!.dur : 0) || 1;
  const [intro, setIntro] = useState(false);
  // (nothing is told while your move goes out, nor while someone is being looked at: it waits, and is told after)
  const t12 = useTold12(runN, fresh ? { msgs: pg?.messages ?? [], live: pg?.live ?? null } : null, speed === 0 || intro);
  // (in the settled way the telling does not start before there is anything to tell: gone to from the foot of the
  // page while the record was still being read, a step was over at once)
  // (and the step is over only when it really is, and all of it has been told)
  // (engine 12 is told by its own buffer, not by this clock: see useTold12)
  const clock = useTraceClock(live && !(trace?.complete && !live.running) ? 1e12 : total, !n12 && phase === "run" && !intro && (!!live || !fine || beats.length > 0), live ? 1 : speed, () => setPhase("result"));
  const [focus, setFocus] = useState(0);
  const back = !!live && live.back && !live.running;
  useEffect(() => {
    if (back && phase === "run") setPhase("decide");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back, phase]);
  // (come to while a step is already being worked out: the telling is as far along as the step really is)
  const began = live?.trace?.start;
  useEffect(() => {
    if (live && began && phase === "run" && Date.now() - began > 4000) clock.reset(Date.now() - began);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [began]);
  const pt = phase === "decide" ? 0 : clock.t;
  // once everything has been told, the last thing told stays until the step is over (never back to the first)
  const told = beats.findIndex((b) => pt < b.at + b.dur);
  // (told as it is worked out: what is being told is the last thing that has come, and before anything has, nothing)
  let come = -1;
  if (sx) for (let k = 0; k < beats.length; k++) if (beats[k]!.at <= pt) come = k;
  const bi = phase === "result" || (!sx && told < 0) ? beats.length - 1 : sx ? come : told;
  const beat = phase === "run" ? (beats[bi] ?? null) : null;
  const q = beat ? sat((pt - beat.at) / beat.dur) : 0;
  const t = !trace ? 0 : phase === "result" ? trace.ms : beat ? beat.t0 + (beat.t1 - beat.t0) * (1 - Math.pow(1 - Math.min(1, q / 0.45), 2)) : 0;
  prog.current = pt / total;
  const at = trace ? steps.findIndex((x) => x.n === trace.step) : -1;
  const played = at >= 0 ? steps[at]! : null;
  const after = at >= 0 ? (steps[at + 1] ?? null) : null;
  const kick = useRef(false);
  const act = (picks: string[] = [], text = "") => {
    if (live) live.onAct(picks, text);
    else if (!trace) return;
    if (n12) {
      runAt.current = { n: line12.length, seen: false };
      setRunN((x) => x + 1);
    }
    clock.reset();
    kick.current = true;
    setIntro(true);
    setPhase("run");
  };
  // gone to from the foot of the page: the telling starts from its beginning, without the opening wave
  const was = useRef(phase);
  useEffect(() => {
    if (phase === "run" && was.current !== "run" && !kick.current && !intro) clock.reset();
    was.current = phase;
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!intro) return;
    const id = window.setTimeout(() => setIntro(false), 2700);
    return () => window.clearTimeout(id);
  }, [intro]);

  const acts = useMemo(() => {
    if (!trace || !beats.length) return null;
    const start = trace.start ?? 0;
    const when = (e: Ev) => {
      const te = e.t - start;
      const b = beats.find((y) => te <= y.t1) ?? beats[beats.length - 1]!;
      return (b.at + sat((te - b.t0) / Math.max(1, b.t1 - b.t0)) * b.dur * 0.7) / 1000;
    };
    return playActs(stream, score, start, start + trace.ms + 2000, when);
  }, [stream, score, trace, beats]);
  const missed = acts ? acts.now.filter((b) => b.k === "chance" && !b.feat).length : 0;
  const named = useMemo(() => {
    const known = score.bodies.filter((y) => y.kind === NODE && !y.risk && !y.seat && !y.seed && y.name.length >= 2);
    return (text: string, not: number) => known.filter((y) => y.i !== not && text.includes(y.name)).sort((a, z) => text.indexOf(a.name) - text.indexOf(z.name))[0]?.i ?? -1;
  }, [score]);
  // (engine 12: who in the picture a name given by the stop is, as the roster has them or by the name itself)
  const seatName = play.graph.nodes.find((n) => n.id === play.seatId)?.name ?? "";
  const bodyOf = useMemo(() => {
    // (a note in brackets, full-width U+FF08 U+FF09 or plain, is not part of a name)
    const strip = (x: string) => x.replace(/[\uff08(][^\uff09)]*[\uff09)]/g, "").trim().toLowerCase();
    const by = new Map<string, number>();
    const put = (k: string, i: number) => {
      for (const x of [k.trim().toLowerCase(), strip(k)]) if (x && i >= 0 && !by.has(x)) by.set(x, i);
    };
    for (const n of play.graph.nodes) for (const k of [n.name, ...n.aliases]) put(k, n.id === play.seatId ? score.seat : (score.index.get(n.id) ?? -1));
    for (const b of score.bodies) if (b.kind === NODE && !b.risk && !b.seed) put(b.name, b.i);
    return (name: string | null | undefined): number => {
      const k = (name ?? "").trim().toLowerCase();
      if (!k) return -1;
      if (k === YOU || k === LEAD_NAME) return score.seat;
      const hit = by.get(k) ?? by.get(strip(k));
      if (hit != null) return hit;
      // (a name said another way: the longest known one it holds, or that holds it)
      let best = -1;
      let len = 1;
      if (k.length >= 2) for (const [x, i] of by) if (x.length > len && (k.includes(x) || x.includes(k))) [best, len] = [i, x.length];
      return best;
    };
  }, [play.graph.nodes, play.seatId, score]);
  /** Whom a roll is drawn round: whom it was about; else, as before, whoever it names, or you. */
  const rollAt = (x: Told12) => {
    const i = bodyOf(x.about);
    if (i >= 0) return i;
    const w = named(x.text, -1);
    return w >= 0 ? w : score.seat;
  };
  // what is being told now, whom it is at in the picture, and whom it reaches
  const it12 = n12 && phase === "run" && !intro ? (t12.items[t12.cur] ?? null) : null;
  const me12 = !it12 ? score.seat : it12.kind === "search" ? -1 : it12.kind === "roll" ? rollAt(it12) : bodyOf(it12.who);
  const to12 =
    it12?.kind === "happened" && me12 >= 0
      ? (() => {
          const w = named(it12.text, me12);
          return w >= 0 ? w : me12 !== score.seat && ((seatName.trim().length >= 2 && it12.text.includes(seatName.trim())) || it12.text.includes(LEAD_NAME)) ? score.seat : -1;
        })()
      : -1;
  // (each thing told stirs whoever it is at in the picture: what one side did, as it is told; a roll, as it falls)
  const acts12 = useMemo(() => {
    if (!n12) return null;
    const out: SBeat[] = [];
    t12.items.slice(0, t12.cur + 1).forEach((x, k) => {
      const i = x.kind === "roll" ? rollAt(x) : x.kind === "happened" ? bodyOf(x.who) : -1;
      if (i < 0) return;
      const at = (t12.shown[k] ?? epoch.current) - epoch.current + (x.kind === "roll" ? 0.42 * (t12.durs[k] ?? 3000) : 0);
      // (headed as the engine heads a roll and a move: Chinese "\u6309\u6982\u7387\u5b9a", settled by the odds, and "\u884c\u52a8", a move)
      const ev = { t: 0, act: "draw", who: score.bodies[i]?.id ?? null, head: x.kind === "roll" ? "\u6309\u6982\u7387\u5b9a" : "\u884c\u52a8", text: x.text, w: 1, phase: "play", picked: x.chosen || null } as Ev;
      out.push({ s: at / 1000, d: x.kind === "roll" ? 3.6 : 2.2, k: x.kind === "roll" ? "odds" : "move", ev, body: i, to: -1, tie: -1, dir: 1, feat: x.kind === "roll", n: 0, src: -1 });
    });
    return { before: [] as SBeat[], now: out.sort((a, z) => a.s - z.s) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n12, t12.cur, runN, bodyOf, named, score]);
  // what the middle tells, as the parts of a step are told (see turns.tsx, Main)
  const last12 = (pg?.messages ?? []).at(-1) ?? "";
  const L12: Live = {
    rows: t12.items.map((x, i) => ({ i, sec: x.kind === "roll" ? "chance" : x.kind === "search" ? "lookup" : "reaction", who: x.who, gist: x.text })),
    beats: t12.items.map((x) => {
      const c: Call = {
        id: x.key,
        role: "",
        purpose: x.kind === "roll" ? TOLD12.roll : x.kind === "search" ? TOLD12.search : TOLD12.happened,
        model: "",
        from: 0,
        to: 0,
        inTok: 0,
        outTok: 0,
        cost: 0,
        actor: x.kind === "happened" ? { id: "", name: x.who.trim() === seatName.trim() || x.who.trim() === LEAD_NAME ? YOU : x.who.trim() } : null,
        wave: null,
        events: [],
        detail: x.kind === "roll" ? { items: [{ question: x.text, base: "", outcomes: [], chosen: x.chosen }] } : x.kind === "happened" ? { action: x.text, day: x.day } : {},
      };
      return { key: x.key, c, t0: 0, t1: 0, at: 0, dur: 0, item: null, came: 0 };
    }),
    bi: t12.cur,
    done: false,
    pt: 1,
    real: 0,
    people: [],
    // (nothing picked and nothing written: the world carries on as things are, as the button said)
    did: live?.said || tx("continue"),
    busy: new Set(),
    // (what is under way, while it is: a roll is not said before it is told, since not every roll is seen)
    // (the engine's word for rolling the dice opens what it says while it rolls: Chinese "\u63b7\u9ab0", or "Rolling")
    working: !fresh ? "" : /^(\u63b7\u9ab0|Rolling)/.test(last12) ? tx("settlingByOdds") : LOOKED.test(last12) && it12?.kind === "search" && last12.replace(LOOKED, "").trim() === it12.text ? tx("lookingUp") : last12,
    next: () => void t12.next(),
    pick,
    peek: -1,
    onPeek: () => {},
  };
  // the line down either side: the stops before, and this one (while it is written, as much of it as has been told)
  const legs12 = useMemo<{ legs: Leg[]; cur: Leg | null } | null>(() => {
    if (!n12) return null;
    // (read leniently: a stop kept before any of these were has none of them)
    const all: Leg[] = line12.map((r) => ({
      day: r.day ?? "",
      happened: (r.happened ?? []).map((h) => ({ day: h.day ?? "", who: h.who ?? "", what: h.what ?? "" })),
      messages: (r.messages ?? []).map((m) => ({ from: m.from ?? "", day: m.day ?? "", gist: m.gist ?? "" })),
      rolls: (r.rolls ?? []).map((x) => ({ question: x.question ?? "", chosen: x.chosen ?? "", about: x.about ?? null })),
    }));
    if (phase !== "run") return { legs: all.slice(0, -1), cur: all.at(-1) ?? null };
    const n0 = runAt.current?.n ?? all.length;
    if (all.length > n0) return { legs: all.slice(0, n0), cur: all[n0]! };
    const got = t12.items.slice(0, t12.cur + 1);
    const happened = got.filter((x) => x.kind === "happened").map((x) => ({ day: x.day, who: x.who, what: x.text }));
    const rolls = got.filter((x) => x.kind === "roll").map((x) => ({ question: x.text, chosen: x.chosen, about: x.about }));
    return { legs: all, cur: happened.length || rolls.length ? { day: happened.at(-1)?.day ?? "", happened, messages: [], rolls } : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n12, line12, phase, t12.cur, runN]);
  /** The day the move has come to, as far as it has been told. */
  const day12 = [...t12.items.slice(0, t12.cur + 1)].reverse().find((x) => x.kind === "happened" && x.day)?.day ?? play.branch.simTime;
  // (who is in the world, for a line that has no stop yet with anyone in it)
  const cast12 = useMemo(() => (n12 && !line12.length ? play.graph.nodes.filter((n) => n.id !== play.seatId).map((n) => ({ name: n.name, text: n.summary })) : undefined), [n12, line12.length, play.graph.nodes, play.seatId]);
  // the cards of those whose names are pressed in the columns (each goes by fading, and only then is let go)
  const [cards, setCards] = useState<{ id: number; name: string; at: DOMRect }[]>([]);
  const cardN = useRef(0);
  const sides12 = useMemo<Sides>(
    () => ({
      you: seatName,
      kindOf: (name) => {
        const i = bodyOf(name);
        const b = i >= 0 ? score.bodies[i] : undefined;
        if (b) return faceKind({ seat: b.seat, ent: b.ent, crowd: b.kind !== NODE });
        const n = play.graph.nodes.find((x) => x.name.trim() === name.trim());
        return n ? faceKind({ ent: n.kind }) : "other";
      },
      open: (name, at) => setCards((o) => (o.some((c) => c.name === name) ? o : [...o, { id: ++cardN.current, name, at }])),
    }),
    [seatName, bodyOf, score, play.graph.nodes],
  );
  // (the move has been worked out: what is to be decided next, under the stop as it is read)
  useEffect(() => {
    if (n12 && phase === "run" && !live?.running && runAt.current?.seen) setPhase("decide");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n12, phase, live?.running]);
  const bodies = useMemo(
    () =>
      beats.map((b) => {
        const c = b.c;
        if (c.actor) return score.index.get(c.actor.id) ?? -1;
        if (c.purpose === "adjudicate_move") return score.seat;
        if (c.purpose === "resolve_uncertain") {
          const hit = named(c.detail.items?.[b.item ?? 0]?.question ?? "", -1);
          return hit >= 0 ? hit : score.seat;
        }
        return -1;
      }),
    [beats, score, named],
  );
  // whom each thing told is done to: whoever the record says it reached first, or whoever is named in it
  const targets = useMemo(() => {
    if (!trace) return beats.map(() => -1);
    const start = trace.start ?? 0;
    // (a move reaching someone is headed "\u6ce2\u53ca", Chinese for knock-on effects)
    const reached = stream.events.filter((e) => e.phase === "play" && e.act === "link" && e.head === "\u6ce2\u53ca" && e.t >= start - 500 && e.t <= start + trace.ms + 4000);
    const first = (who: string | null | undefined, near: number, not: number) =>
      reached
        .filter((e) => e.who === who)
        .sort((x, y) => Math.abs(x.t - near) - Math.abs(y.t - near))
        .map((e) => score.index.get(e.to ?? "") ?? -1)
        .find((i) => i >= 0 && i !== not) ?? -1;
    return beats.map((b, k) => {
      const c = b.c;
      const me = bodies[k]!;
      if (kindOf(b) === "none" || me < 0) return -1;
      if (c.purpose === "adjudicate_move") {
        const hit = first(stream.seat, start, me);
        return hit >= 0 ? hit : named((c.detail.targets ?? []).join("\u3001"), me);
      }
      const hit = first(c.actor?.id, start + c.to, me);
      if (hit >= 0) return hit;
      // nothing on record: whoever their words are spoken to (you, when they say "you"), or whoever is named in what they do
      const D = c.detail;
      const you = me !== score.seat ? score.seat : -1;
      if (D.said) {
        if (D.said.includes(YOU) || D.said.includes(LEAD_NAME)) return you;
        const w = named(D.said, me);
        if (w >= 0) return w;
      }
      const w = named(D.action ?? "", me);
      return w >= 0 ? w : (D.action ?? "").includes(LEAD_NAME) ? you : -1;
    });
  }, [beats, bodies, stream, score, trace, named]);
  const rows = useMemo(() => rowsOf(beats, tp, tc), [beats, tp, tc]);
  const acted = useMemo(() => new Set<number>([...(score.seat >= 0 ? [score.seat] : []), ...bodies.filter((i) => i >= 0)]), [bodies, score]);
  const reach = useMemo(() => (opts[focus] ? reachOf(opts[focus]!, play.graph.nodes, play.seatId) : []), [opts, focus, play]);
  const reached = useMemo(() => new Set<number>([...(score.seat >= 0 ? [score.seat] : []), ...reach.map((n) => score.index.get(n.id) ?? -1).filter((i) => i >= 0)]), [reach, score]);
  const worldly = !!beat && WORLDLY.has(beat.c.purpose);
  // (told as it is worked out: before anything has come, the world is turned to you, whose move is being read)
  const body = beat ? bodies[bi]! : sx && phase === "run" ? score.seat : -1;
  const kind = kindOf(beat);
  const ms = beat ? pt - beat.at : 0;
  const tAct = beat ? actAt(beat) : 0;
  const target = beat && kind !== "none" ? targets[bi]! : -1;
  const ek = kind === "none" ? 0 : (ms - tAct) / 1000;
  const thinking = trace && beat ? trace.calls.filter((c) => c.purpose === "actor_decision" && t >= c.from && t < c.to && c.id !== beat.c.id).map((c) => c.actor?.name ?? tx("aSide")) : [];

  // where things are on the page: whoever is told about on the left of the middle, the words to their right
  const H = box.h - BAR;
  // (in the settled way the words are given more of a wide page, so that less of them is cut short; and what is still
  // left over is shared between the two sides, where it was all left empty on the right)
  // (a step told another way, where the words are on the axis: who is in it down the right (1); everything told so
  // far, a line each (2); the world in the middle and what is told a caption under it (3). See scenes.tsx)
  const sc = lay !== 1 ? 0 : scene === 4 ? (phase === "decide" ? 0 : 1) : scene;
  const cap = sc === 3 && phase !== "decide";
  const RW = sx ? 264 : 300;
  /** The column on the right, and the room what is told is given under the world. */
  const DW = 216;
  const MH = 172;
  const gapX = sc === 1 ? 220 : 230;
  const ax0 = cap ? box.w / 2 : sc === 1 ? Math.max(400, box.w * 0.28) : Math.max(430, box.w * 0.34);
  const TW = sc === 1 ? Math.max(340, Math.min(520, box.w - (ax0 + gapX) - 300 - 36 - 56)) : Math.max(380, Math.min(fine ? 820 : 620, box.w - (ax0 + gapX) - 64));
  const spare = cap || sc === 1 ? 0 : fine ? Math.max(0, box.w - (ax0 + gapX + TW) - 64) / 2 : 0;
  const TX = ax0 + spare + gapX;
  const freeL = 36 + RW + 24;
  const freeR = box.w - 36 - (n12 ? COLS.side : DW) - 24;
  const MW = Math.min(700, freeR - freeL);
  const AX = sx ? (freeL + freeR) / 2 : ax0 + spare;
  const AY = sx ? (140 + H - 64 - MH) / 2 : cap ? H * 0.43 : H * 0.52;
  // who is in this step, and for each thing told: whose face goes with it, and what more there is to say of it
  const people = useMemo(() => {
    const out: Party[] = [];
    beats.forEach((b, k) => {
      const you = b.c.purpose === "adjudicate_move";
      if (!you && b.c.purpose !== "actor_decision") return;
      const i = bodies[k]!;
      const name = you ? YOU : (b.c.actor?.name ?? tx("aSide"));
      const had = out.find((x) => x.name === name);
      if (had) had.ks.push(k);
      else out.push({ name, body: i, you, kind: i >= 0 ? faceKind({ seat: score.bodies[i]!.seat, ent: score.bodies[i]!.ent, crowd: score.bodies[i]!.kind !== NODE }) : "person", ks: [k] });
    });
    return out;
  }, [beats, bodies, score, tx]);
  const kinds = useMemo<(FaceKind | null)[]>(() => beats.map((b, k) => (b.c.purpose === "actor_decision" && bodies[k]! >= 0 ? faceKind({ seat: score.bodies[bodies[k]!]!.seat, ent: score.bodies[bodies[k]!]!.ent, crowd: score.bodies[bodies[k]!]!.kind !== NODE }) : null)), [beats, bodies, score]);
  const more = (k: number) => {
    const b = beats[k];
    if (!b) return "";
    const D = b.c.detail;
    return b.c.purpose === "actor_decision" ? (D.thinking ?? "") : b.c.purpose === "resolve_uncertain" ? (D.items?.[b.item ?? 0]?.question ?? "") : b.c.purpose === "adjudicate_move" ? (D.restatement ?? "") : "";
  };
  const seek = (i: number) => (clock.reset(beats[i]?.at ?? 0), setPhase("run"));
  // (what is left to odds, for the picture to draw round whoever it is about, where what is told is a caption)
  const item = beat && beat.c.purpose === "resolve_uncertain" ? beat.c.detail.items?.[beat.item ?? 0] : null;
  const odds = cap && item && body >= 0 ? { body, options: item.outcomes, picked: item.chosen, k: q } : null;
  // the step as it stands at this moment of its being worked out (see turns.tsx)
  const real = sx && trace ? Math.min(trace.ms, pt / per) : 0;
  const flying = sx && trace && phase === "run" && !intro ? trace.calls.filter((c) => real >= c.from && real < c.to) : [];
  const busy = new Set(flying.filter((c) => c.purpose === "actor_decision").map((c) => c.actor?.name ?? tx("aSide")));
  const reading = flying.some((c) => c.purpose === "adjudicate_move");
  if (reading) busy.add(YOU);
  const working = reading ? tx("readingYourMove") : busy.size ? "" : flying.some((c) => c.purpose === "resolve_uncertain") ? tx("settlingByOdds") : flying.some((c) => c.purpose === "settle_stretch" || c.purpose === "world_tick") ? tx("worldMovingOn") : flying.some((c) => WORLDLY.has(c.purpose)) ? tx("preparingNext") : flying.length ? tx("checkingReality") : "";
  const sides = useMemo<Side[]>(
    () =>
      people
        .map((p) => ({ ...p, from: p.you || !trace ? 0 : Math.min(...trace.calls.filter((c) => c.purpose === "actor_decision" && (c.actor?.name ?? tx("aSide")) === p.name).map((c) => c.from), trace.ms) }))
        .sort((a, b) => a.from - b.from),
    [people, trace, tx],
  );
  // where the page keeps the main line's numbers, for what leaves the picture for them
  const bar = useRef<HTMLDivElement>(null);
  const sinks = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const base = root.current?.getBoundingClientRect();
    if (!bar.current || !base) return;
    const m = new Map<string, { x: number; y: number }>();
    bar.current.querySelectorAll<HTMLElement>("[data-metric]").forEach((x) => {
      const r = x.getBoundingClientRect();
      m.set(x.dataset.metric ?? "", { x: r.left - base.left + 16, y: r.top - base.top + 30 });
    });
    sinks.current = m;
  }, [box, play, root]);
  // a number that something in this step has just moved
  const hot = new Map<string, string>();
  if (phase !== "decide" && acts) for (const b of acts.now) if (b.k === "delta" && pt / 1000 >= b.s + 1.1 && pt / 1000 < b.s + 5.5) hot.set(b.ev.head, b.ev.text);
  const now = useRef({ phase, intro, pt, body, worldly, target, kind, ek, odds });
  now.current = { phase, intro, pt, body, worldly, target, kind, ek, odds };
  // (engine 12: whoever what is being told is at, and whom it reaches; before anything has come, you)
  const at12 = useRef(0);
  at12.current = t12.at;
  if (n12) now.current = { phase, intro, pt: 0, body: phase === "run" && !intro ? me12 : -1, worldly: false, target: to12, kind: it12?.kind === "happened" ? "do" : "none", ek: 0, odds: null };
  feed.current = (st) => {
    const c = now.current;
    st.mode = "play";
    const A = n12 ? acts12 : acts;
    if (A && fed.get(st) !== A) {
      fed.set(st, A);
      st.setPlay(A.before, A.now);
    }
    st.phase = c.phase;
    // (engine 12 has no clock of the step's own to be told by: the picture keeps its own time, frame by frame)
    st.T = n12 ? (Date.now() - epoch.current) / 1000 : c.pt / 1000;
    st.full = c.intro;
    if (kick.current) {
      kick.current = false;
      st.kick();
    }
    const telling = c.phase === "run" && !c.intro;
    const whole = c.worldly || c.body < 0;
    st.subject = telling && !whole ? c.body : -1;
    st.target = telling && !whole ? c.target : -1;
    st.emit.kind = telling && !whole ? c.kind : "none";
    st.emit.k = n12 && c.kind !== "none" ? (Date.now() - at12.current - 700) / 1000 : c.ek;
    st.sinks = sinks.current;
    st.wide = telling && whole;
    st.framed = false;
    st.lit = c.phase === "result" ? acted : reached;
    st.notes = NONE;
    st.odds = c.phase === "run" && !c.intro ? c.odds : null;
    if (c.phase === "decide" || c.intro) {
      // (where what is to be decided is set to one side, or in two bands, the world is where the words are not, and
      // so is every name written on the picture)
      const L = c.intro ? 0 : sc === 3 ? 3 : layRef.current;
      st.margins = L === 2 ? { l: Math.min(st.field.w * 0.66, 960), r: 0, t: 84, b: 56 + BAR } : L === 3 ? { l: 0, r: 0, t: 196, b: BAR + 336 } : { l: 0, r: 0, t: 84, b: 56 + BAR };
      st.centre = L === 2 ? { x: st.field.w * 0.8, y: (st.field.h - BAR) * 0.5 } : L === 3 ? { x: st.field.w / 2, y: (st.field.h - BAR) * 0.4 } : null;
      st.pool = L === 2 ? { x: 520, y: (st.field.h - BAR) * 0.5 + 20, rx: 700, ry: 440, k: 0.8 } : null;
      if (!c.intro && sc === 2) {
        // (the record: what is to be decided is set straight on the picture, which steps back under it and has no names on it)
        st.full = true;
        st.pool = { x: st.field.w / 2, y: (st.field.h - BAR) * 0.5 + 20, rx: 660, ry: 440, k: 0.86 };
      }
      return;
    }
    if (sx) {
      // (a column to either side; the world between them, over what is told)
      st.margins = { l: freeL, r: 36 + (n12 ? COLS.side : DW) + 24, t: 140, b: BAR + 64 + MH };
      st.centre = { x: AX, y: AY };
      // (the picture steps back only under the words themselves, as far as they go, and gives way gradually: not
      // a dark block the size of the room they are given)
      const el = said.current;
      const base = root.current;
      if (el && base && el.offsetWidth > 0) {
        const r = el.getBoundingClientRect();
        const b0 = base.getBoundingClientRect();
        const k = r.width / el.offsetWidth || 1;
        st.pool = { x: (r.left + r.width / 2 - b0.left) / k, y: (r.top + r.height / 2 - b0.top) / k, rx: el.offsetWidth * 0.62 + 90, ry: el.offsetHeight * 0.72 + 46, k: 0.56 };
      } else st.pool = null;
      return;
    }
    if (cap) {
      // (the world has the middle of the page; under it, where the caption is, the picture steps back)
      st.margins = { l: 60, r: 60, t: 132, b: BAR + 214 };
      st.centre = { x: AX, y: AY };
      st.pool = { x: st.field.w / 2, y: st.field.h - BAR - 116, rx: 580, ry: 150, k: 0.74 };
      return;
    }
    st.margins = { l: sc === 0 ? 250 : 40, r: Math.max(0, st.field.w - TX + 34), t: 150, b: BAR + 10 };
    st.centre = { x: AX, y: AY };
    st.pool = { x: TX + TW / 2, y: AY, rx: TW * 0.7, ry: 270, k: 0.74 };
  };
  useEffect(() => () => void (feed.current = null), [feed]);
  const layRef = useRef(lay);
  layRef.current = lay;
  const dayN = Math.max(1, Math.round((Date.parse(play.branch.simTime) - Date.parse(world.scope?.timeStart ?? play.branch.simTime)) / 864e5));
  const did = played?.did ? short(played.did.replace(DID_LEAD, ""), 44) : live?.said ? short(live.said, 44) : "";
  // everyone, and what they did in the step before this decision (or, where nothing has been played yet, who is in the world)
  const before = useMemo<{ L: Live; title: string }>(() => {
    const none: Live = { rows: [], beats: [], bi: -1, done: true, pt: 0, real: 0, people: [], did: "", busy: new Set(), working: "", next: () => {}, pick, peek: -1, onPeek: () => {} };
    const kindAt = (i: number): FaceKind => (i >= 0 && score.bodies[i] ? faceKind({ seat: score.bodies[i]!.seat, ent: score.bodies[i]!.ent, crowd: score.bodies[i]!.kind !== NODE }) : "person");
    const lastT = tr.all?.length ? [...tr.all].sort((a, b) => b.step - a.step)[0]! : null;
    if (lastT) {
      const bs = beatsOf(lastT).filter((b) => !OTHER.has(b.c.purpose));
      const sides: Side[] = [];
      bs.forEach((b, k) => {
        const you = b.c.purpose === "adjudicate_move";
        if (!you && b.c.purpose !== "actor_decision") return;
        const name = you ? YOU : (b.c.actor?.name ?? tx("aSide"));
        const i = you ? score.seat : (score.index.get(b.c.actor?.id ?? "") ?? -1);
        const had = sides.find((x) => x.name === name);
        if (had) had.ks.push(k);
        else sides.push({ name, body: i, you, kind: kindAt(i), ks: [k], from: 0 });
      });
      const said = steps.find((x) => x.n === lastT.step)?.did ?? "";
      // (as many as the column has room for: whoever came first)
      return { L: { ...none, rows: rowsOf(bs, tp, tc), beats: bs.map((b) => ({ ...b, came: 0 })), people: sides.slice(0, 8), did: said.replace(DID_LEAD, "") }, title: tx("lastStepSides") };
    }
    const of = new Map(world.graph.nodes.map((x) => [x.id, x.summary]));
    const cast = score.bodies
      .filter((b) => b.kind === NODE && !b.risk && !b.seed && !b.seat)
      .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
      .slice(0, 8);
    return { L: { ...none, rows: cast.map((b, i) => ({ i, sec: "reaction", who: b.name, gist: of.get(b.id) ?? "" })), people: cast.map((b, i) => ({ name: b.name, body: b.i, you: false, kind: kindAt(b.i), ks: [i], from: 0 })) }, title: tx("worldSides") };
  }, [tr.all, score, steps, world, pick, tx, tp, tc]);
  const turn: Live = {
    rows,
    beats,
    bi,
    done: phase === "result",
    pt,
    real,
    people: sides,
    did: played?.did ? played.did.replace(DID_LEAD, "") : (live?.said ?? ""),
    busy,
    working: live ? (live.running && !beat ? live.working : "") : working,
    next: () => {
      const nx = beats[bi + 1];
      if (nx && nx.came <= pt) clock.reset(nx.at);
    },
    pick,
    peek,
    onPeek: setPeek,
  };
  // (what was taken up to be read again is let go when the step is begun again or left)
  useEffect(() => setPeek(-1), [phase === "decide", trace]);
  /** The step is over, in a line: how many sides moved and how much was settled by the odds. */
  const stepOver = [tx("stepDone"), tx("sidesMoved", { count: people.length }), tx("settledByOddsN", { count: rows.filter((r) => r.sec === "chance").length })].join(" · ");

  return (
    <>
      {/* what this play is, the main line's numbers, and what the page always has at hand */}
      <div ref={bar} className={`absolute top-6 right-9 left-9 flex gap-9 transition-opacity duration-500 ${lay === 3 ? "items-baseline" : "items-start"}`} style={{ opacity: intro ? 0.25 : 1 }}>
        {lay > 0 ? (
          <PlayHead v={lay} title={world.title} you={live ? null : (play.graph.nodes.find((n) => n.id === play.seatId)?.name ?? tx("you"))} date={play.branch.simTime} step={play.branch.step} spent={usd(play.world.spentUsd)} tools={tools}>
            {lay !== 3 && <Vitals play={play} hot={hot} max={sx ? 3 : undefined} onMore={onMore} />}
          </PlayHead>
        ) : (
          <>
            <About world={world} play={play} />
            <div className="min-w-0 flex-1">
              <Vitals play={play} hot={hot} />
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Spend d={d} P={P} />
              <BranchPick d={d} P={P} go={() => {}} />
              <Tools d={d} />
            </div>
          </>
        )}
      </div>

      {lay === 0 && (
        <Fade on={phase === "decide"} rise className="absolute inset-x-0 top-[92px] flex items-center justify-center" style={{ bottom: BAR + 20 }}>
          <div className="rounded-[28px] backdrop-blur-xl" style={{ width: "min(900px, calc(100vw - 80px))", background: `rgb(${P.pageRgb} / 0.86)`, boxShadow: `0 40px 110px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)` }}>
            <div className="px-10 pt-7 pb-5">
              <div className="flex items-baseline justify-between gap-4" style={{ fontFamily: MONO, fontSize: 11 }}>
                <span style={{ color: P.warm }}>{tx("dayLine", { date: dayOf(play.branch.simTime, locale), day: dayN, step: play.branch.step })}</span>
                <span style={{ color: P.faint }}>{tx("timeStopped")}</span>
              </div>
              <h1 className="mt-3 text-[27px] leading-[1.42] font-medium" title={s?.body}>
                {s?.headline}
              </h1>
              <div className="mt-4">
                <Hard P={P} d={d} n={3} size={14.5} />
              </div>
            </div>
            <Ways opts={opts} focus={focus} setFocus={setFocus} reach={(o) => reachOf(o, play.graph.nodes, play.seatId).map((n) => n.name)} onAct={() => act()} note={trace ? tx("sampleNote", { step: trace.step }) : tr.loading ? tx("traceLoading") : tx("noTrace")} ready={!!trace} />
          </div>
        </Fade>
      )}
      {lay > 0 &&
        (() => {
          // (set another way: when it is and which decision in one quiet line, what it is, what is hard and known; nothing that only explains)
          const when = (
            <div style={{ fontFamily: MONO, fontSize: 11, color: P.mute }}>
              {tx("decisionN", { date: play.branch.simTime, step: play.branch.step })}
            </div>
          );
          const ways = <Ways opts={opts} focus={focus} setFocus={setFocus} reach={(o) => reachOf(o, play.graph.nodes, play.seatId).map((n) => n.name)} onAct={act} note="" ready={live ? !live.running && !live.busy : !!trace} whole={sx > 0} />;
          const plate = { background: `rgb(${P.pageRgb} / 0.86)`, boxShadow: `0 40px 110px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)` };
          if (sx) {
            // (what is to be decided is not alone on the page. Beside it, on the side they are on while a step is
            // told, everyone and what they did in the step before; on the other, how things stand. The two can be
            // read, but step back so that they do not pull at the eye while it decides: a little dimmer, and out of
            // focus by degrees toward what is being decided; in full once the pointer is on them)
            const CW = 264;
            const veil = (at: string) => <div className="absolute inset-y-0" style={{ [at]: 0, width: CW + 170, background: `linear-gradient(${at === "left" ? 90 : 270}deg, rgb(${P.pageRgb} / 0.84) 0%, rgb(${P.pageRgb} / 0.66) 55%, rgb(${P.pageRgb} / 0) 100%)` }} />;
            return (
              <>
                <Fade on={phase === "decide"} rise className="absolute top-[92px] flex items-center justify-center" style={{ left: 36 + CW + 26, right: 36 + CW + 26, bottom: BAR + 20 }}>
                  <div className="rounded-[26px] backdrop-blur-xl" style={{ width: "min(880px, 100%)", ...plate }}>
                    <div className="flex flex-col items-center px-10 pt-8 pb-6 text-center">
                      {/* (engine 12: the date and which decision are in the line at the top, and are not said again) */}
                      {!n12 && when}
                      <h1 className={`${n12 ? "" : "mt-3 "}text-[24px] leading-[1.42] font-medium`} title={s?.body}>
                        {s?.headline}
                      </h1>
                    </div>
                    {ways}
                  </div>
                </Fade>
                <Fade on={phase === "decide" && !n12} className="pointer-events-none absolute inset-0">
                  <style>{TURN_CSS}</style>
                  {veil("left")}
                  {veil("right")}
                  <div className="absolute flex flex-col justify-center" style={{ left: 36, width: CW, top: 100, bottom: BAR + 30 }}>
                    <div className="turn-soft pointer-events-auto" style={{ ["--soft" as string]: "to right" }}>
                      <Board L={before.L} title={before.title} />
                    </div>
                  </div>
                  <div className="absolute flex flex-col justify-center" style={{ right: 36, width: CW, top: 100, bottom: BAR + 30 }}>
                    <div className="turn-soft pointer-events-auto" style={{ ["--soft" as string]: "to left" }}>
                      <Stand title={tx("howThingsStand")} items={(s?.blocks ?? []).slice(0, 6).map((b) => ({ name: b.title, text: b.content }))} />
                    </div>
                  </div>
                </Fade>
              </>
            );
          }
          if (lay === 2)
            return (
              <Fade on={phase === "decide"} rise className="absolute top-[92px] flex items-center" style={{ left: 32, bottom: BAR + 20, width: "min(920px, calc(100vw - 96px))" }}>
                <div className="w-full">
                  <div className="px-10 pb-6">
                    {when}
                    <h1 className="mt-3 text-[26px] leading-[1.42] font-medium" title={s?.body}>
                      {s?.headline}
                    </h1>
                    <div className="mt-4">
                      <Hard P={P} d={d} n={3} size={14} />
                    </div>
                  </div>
                  {ways}
                </div>
              </Fade>
            );
          if (sc === 1)
            return (
              <>
                {/* (the roll: whom the way pointed at would reach, down the right; what is to be decided beside it) */}
                <Fade on={phase === "decide"} rise className="absolute top-[92px] flex items-center justify-center" style={{ left: 40, right: 372, bottom: BAR + 20 }}>
                  <div className="rounded-[26px] backdrop-blur-xl" style={{ width: "min(860px, 100%)", ...plate }}>
                    <div className="flex flex-col items-center px-10 pt-8 pb-6 text-center">
                      {when}
                      <h1 className="mt-3 text-[25px] leading-[1.42] font-medium" title={s?.body}>
                        {s?.headline}
                      </h1>
                    </div>
                    {ways}
                  </div>
                </Fade>
                <Fade on={phase === "decide"} className="absolute right-9 w-[300px]" style={{ top: 112 }}>
                  <SideList
                    title={tx("whoItReaches")}
                    items={score.bodies
                      .filter((b) => b.kind === NODE && !b.risk && !b.seed && !b.seat)
                      .sort((a, b) => (reached.has(b.i) ? 1 : 0) - (reached.has(a.i) ? 1 : 0) || (b.importance ?? 0) - (a.importance ?? 0))
                      .slice(0, 11)
                      .map((b): Item => ({ key: String(b.i), kind: faceKind({ seat: b.seat, ent: b.ent, crowd: false }), name: cut(b.name, 18), state: reached.has(b.i) ? "now" : "todo", go: () => pick(b.i) }))}
                  />
                </Fade>
              </>
            );
          if (sc === 2)
            return (
              <Fade on={phase === "decide"} rise className="absolute inset-x-0 top-[92px] flex items-center justify-center" style={{ bottom: BAR + 20 }}>
                <div style={{ width: "min(900px, calc(100vw - 120px))" }}>
                  <div className="px-10 pb-6">
                    {when}
                    <h1 className="mt-3 text-[26px] leading-[1.42] font-medium" title={s?.body}>
                      {s?.headline}
                    </h1>
                    <div className="mt-4">
                      <Hard P={P} d={d} n={3} size={14} />
                    </div>
                  </div>
                  {ways}
                </div>
              </Fade>
            );
          if (lay === 3 || sc === 3)
            return (
              <Fade on={phase === "decide"} rise className="absolute inset-0">
                <div className="absolute inset-x-0 top-[84px] flex flex-col items-center px-10 text-center">
                  {when}
                  <h1 className="mt-3 max-w-[900px] text-[27px] leading-[1.42] font-medium" title={s?.body}>
                    {s?.headline}
                  </h1>
                </div>
                <div className="absolute inset-x-0 flex justify-center" style={{ bottom: BAR + 18 }}>
                  <div className="rounded-[24px] backdrop-blur-xl" style={{ width: "min(1100px, calc(100vw - 72px))", ...plate }}>
                    {ways}
                  </div>
                </div>
              </Fade>
            );
          return (
            <Fade on={phase === "decide"} rise className="absolute inset-x-0 top-[92px] flex items-center justify-center" style={{ bottom: BAR + 20 }}>
              <div className="rounded-[26px] backdrop-blur-xl" style={{ width: "min(880px, calc(100vw - 80px))", ...plate }}>
                <div className="flex flex-col items-center px-10 pt-8 pb-6 text-center">
                  {when}
                  <h1 className="mt-3 text-[25px] leading-[1.42] font-medium" title={s?.body}>
                    {s?.headline}
                  </h1>
                </div>
                {ways}
              </div>
            </Fade>
          );
        })()}

      <Fade on={intro && (!!played || !!live)} ms={500} rise className="pointer-events-none absolute inset-x-0 text-center" style={{ bottom: BAR + 90 }}>
        {lay > 0 ? (
          <div className="mx-auto flex max-w-[min(760px,80vw)] items-baseline justify-center gap-3 text-[17px]">
            <span className="shrink-0 text-[13px]" style={{ color: P.warm }}>
              {tx("you")}
            </span>
            <span className="truncate">{did}</span>
          </div>
        ) : (
          <>
            <div className="mx-auto inline-flex max-w-[min(760px,80vw)] items-center gap-3 rounded-full px-6 py-2.5 text-[16px] backdrop-blur-md" style={{ background: `rgb(${P.pageRgb} / 0.6)`, boxShadow: `inset 0 0 0 1px rgb(${P.warmRgb} / 0.35)` }}>
              <span style={{ color: P.warm }}>{tx("you")}</span>
              <span className="truncate">{did}</span>
            </div>
            <div className="mt-3 text-[12px]" style={{ color: P.mute }}>
              {tx("moveGoingOut")}
            </div>
          </>
        )}
      </Fade>

      <Fade on={!n12 && phase !== "decide" && !intro && !!trace && !!played} className="absolute inset-0" style={{ pointerEvents: "none" }}>
        {trace && played && sx > 0 && (
          <>
            {/* (told another way: the day it is, and the step as it is worked out, the world in the middle) */}
            <div className="pointer-events-none absolute inset-x-0 top-[84px] text-center leading-none transition-colors duration-700" style={{ fontFamily: MONO, fontSize: 19, fontWeight: 300, color: phase === "run" ? P.ink : P.mute, letterSpacing: "0.04em" }}>
              {between(played.at, after?.at ?? play.branch.simTime, t / trace.ms)}
            </div>
            {/* (everyone in the step down the left; the world; what is told, under the world; what else there is to say, on the right) */}
            <style>{TURN_CSS}</style>
            <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: RW + 170, background: `linear-gradient(90deg, rgb(${P.pageRgb} / 0.8) 0%, rgb(${P.pageRgb} / 0.6) 55%, rgb(${P.pageRgb} / 0) 100%)` }} />
            <div className="pointer-events-none absolute inset-y-0 right-0" style={{ width: DW + 170, background: `linear-gradient(270deg, rgb(${P.pageRgb} / 0.8) 0%, rgb(${P.pageRgb} / 0.6) 55%, rgb(${P.pageRgb} / 0) 100%)` }} />
            <div className="pointer-events-none absolute" style={{ left: 36, width: RW, top: 110, bottom: BAR + 40 }}>
              <Dock L={turn} />
            </div>
            <div className="absolute" style={{ left: AX - MW / 2, width: MW, top: H - 64 - MH + 6 }}>
              <div ref={said} className="mx-auto w-fit max-w-full">
                {phase === "result" && peek < 0 ? (
                  <div style={{ animation: "flow-rise .6s cubic-bezier(.2,.7,.2,1) both" }}>
                    <Onward centre go={tx("goDecide")} small={stepOver} headline={after?.q ?? s?.headline ?? ""} onNext={() => setPhase("decide")} />
                  </div>
                ) : (
                  <Main L={turn} k={peek >= 0 ? peek : bi} to={(targets[peek >= 0 ? peek : bi] ?? -1) >= 0 ? score.bodies[targets[peek >= 0 ? peek : bi]!]!.name : null} fell={peek >= 0 || q > 0.5} back={peek >= 0 ? { label: phase === "result" ? tx("backToResult") : tx("backToNow"), go: () => setPeek(-1) } : null} />
                )}
              </div>
            </div>
            <div className="pointer-events-none absolute flex flex-col justify-center" style={{ right: 36, width: DW, top: 110, bottom: BAR + 40 }}>
              <Events L={turn} />
            </div>
            <Fade on={phase === "run"} ms={450} className="absolute" style={{ left: AX - MW / 2, width: MW, bottom: BAR + 22 }}>
              <LiveLine L={turn} centre />
            </Fade>
          </>
        )}
        {trace && played && !sx && (
          <>
            {lay === 0 ? (
              <div className="pointer-events-none absolute inset-x-0 top-[96px] text-center">
                <div className="mx-auto inline-flex max-w-[min(600px,56vw)] items-center gap-2 rounded-full px-4 py-1.5 text-[13px]" style={{ background: `rgb(${P.warmRgb} / 0.11)` }}>
                  <span style={{ color: P.warm }}>{tx("you")}</span>
                  <span className="truncate">{short(did, 34)}</span>
                </div>
                <div className="mt-2 leading-none transition-colors duration-700" style={{ fontFamily: MONO, fontSize: 20, fontWeight: 300, color: phase === "run" ? P.ink : P.mute, letterSpacing: "0.04em" }}>
                  {between(played.at, after?.at ?? play.branch.simTime, t / trace.ms)}
                </div>
              </div>
            ) : (
              (() => {
                // (set another way: the day it is, and under or beside it what you did, as a line and not on a plate)
                const day = (
                  <div className="leading-none transition-colors duration-700" style={{ fontFamily: MONO, fontSize: lay === 1 ? 19 : 16, fontWeight: 300, color: phase === "run" ? P.ink : P.mute, letterSpacing: "0.04em" }}>
                    {between(played.at, after?.at ?? play.branch.simTime, t / trace.ms)}
                  </div>
                );
                const move = (
                  <div className="flex min-w-0 items-baseline gap-2.5 text-[12.5px]" style={{ color: P.mute }}>
                    <span className="shrink-0 text-[11.5px]" style={{ color: P.warm }}>
                      {tx("you")}
                    </span>
                    <span className="truncate">{short(did, 30)}</span>
                  </div>
                );
                if (lay === 2)
                  return (
                    <div className="pointer-events-none absolute flex w-[300px] flex-col gap-2.5" style={{ left: 36, top: 92 }}>
                      {day}
                      {move}
                    </div>
                  );
                if (lay === 3)
                  return (
                    <>
                      <div className="pointer-events-none absolute inset-x-0 top-[64px] text-center">{day}</div>
                      <div className="pointer-events-none absolute w-[420px]" style={{ left: 36, bottom: BAR + 16 }}>
                        {move}
                      </div>
                    </>
                  );
                return (
                  <div className="pointer-events-none absolute inset-x-0 top-[84px] flex flex-col items-center gap-2.5 text-center">
                    {day}
                    <div className="max-w-[min(520px,50vw)]">{move}</div>
                  </div>
                );
              })()
            )}

            {sc === 0 && AX - 150 >= 230 && (
              <div className="pointer-events-auto absolute left-9" style={{ top: AY - 196, width: Math.min(236, AX - 190) }}>
                <Rail rows={rows} bi={phase === "result" ? beats.length : bi} done={phase === "result"} seek={(i) => (clock.reset(beats[i]?.at ?? 0), setPhase("run"))} />
              </div>
            )}

            {/* the words, set on the picture: always here */}
            {sc === 2 ? (
              // (the record: everything told so far in the step, a line each, the newest at the foot; and, the step over, what comes next under it)
              <>
                <div className="absolute" style={{ left: TX, top: AY - 246, width: TW, height: phase === "result" ? 300 : 452 }}>
                  <Log rows={rows} bi={bi} done={phase === "result"} kinds={kinds} more={more} seek={seek} lines={phase === "result" ? 6 : 7} />
                </div>
                {phase === "result" && (
                  <div className="absolute" style={{ left: TX + 34, top: AY + 82, width: TW - 34 }}>
                    <Onward small={stepOver} headline={after?.q ?? s?.headline ?? ""} onNext={() => setPhase("decide")} />
                  </div>
                )}
              </>
            ) : cap ? (
              // (the caption: under the world, who in a line and what in a line or two; the step over, what comes next)
              <div className="pointer-events-none absolute inset-x-0" style={{ bottom: phase === "result" ? BAR + 44 : BAR + 78 }}>
                {phase === "result" ? (
                  <Onward centre small={stepOver} headline={after?.q ?? s?.headline ?? ""} onNext={() => setPhase("decide")} />
                ) : (
                  beat && rows[bi] && <Caption row={rows[bi]!} kind={kinds[bi] ?? null} to={target >= 0 ? cut(score.bodies[target]!.name, 10) : null} more={more(bi)} />
                )}
              </div>
            ) : (
              <div className="pointer-events-auto absolute" style={{ left: TX, top: AY - 206, width: TW, height: 412 }}>
                {sc === 0 && <span className="absolute h-px" style={{ left: -96, top: 206, width: 76, background: `rgb(${P.warmRgb} / ${phase === "run" && body >= 0 && !worldly && target < 0 ? 0.5 : 0})`, transition: "background-color .6s" }} />}
                <Swap id={phase === "run" && beat ? beat.key : phase} className="relative h-full">
                  {phase === "run" && beat ? (
                    <Told beat={beat} ms={ms} tAct={tAct} missed={missed} to={target >= 0 ? cut(score.bodies[target]!.name, 10) : null} arrived={ek >= 1} />
                  ) : phase === "result" ? (
                    <End play={play} trace={trace} beats={beats} looked={looked} headline={after?.q ?? s?.headline ?? ""} from={played.at} to={after?.at ?? play.branch.simTime} onNext={() => setPhase("decide")} />
                  ) : null}
                </Swap>
              </div>
            )}
            {cap ? (
              <Fade on={phase === "run"} ms={450} className="pointer-events-auto absolute inset-x-0 flex items-center justify-center gap-7 text-[12px]" style={{ bottom: BAR + 26, color: P.mute }}>
                <Ticks rows={rows} bi={bi} done={false} seek={seek} />
                <button type="button" onClick={() => beat && clock.reset(Math.min(total, beat.at + beat.dur))}>
                  {tx("nextLine")}
                </button>
                <button type="button" onClick={() => clock.end()}>
                  {tx("skipToResult")}
                </button>
              </Fade>
            ) : (
              <Fade on={phase === "run"} ms={450} className="pointer-events-auto absolute flex items-center gap-5 text-[12px]" style={{ left: TX, top: AY + 222, width: TW, color: P.mute }}>
                {sc === 1 ? (
                  <Ticks rows={rows} bi={bi} done={false} seek={seek} />
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>
                    {bi + 1} / {beats.length}
                  </span>
                )}
                <button type="button" onClick={() => beat && clock.reset(Math.min(total, beat.at + beat.dur))}>
                  {sc > 0 ? tx("nextLine") : tx("nextLineArrow")}
                </button>
                <button type="button" onClick={() => clock.end()}>
                  {tx("skipToResult")}
                </button>
                {sc === 0 && (
                  <span className="min-w-0 flex-1 truncate text-right transition-opacity duration-500" style={{ color: P.faint, opacity: thinking.length ? 1 : 0 }}>
                    {thinking.length ? tx("alsoThinking", { names: thinking.join(tx("listSep")) }) : ""}
                  </span>
                )}
              </Fade>
            )}
            {/* (the roll: who is in this step, always on the page, down the right) */}
            {sc === 1 && (
              <div className="absolute" style={{ right: 36, top: AY - 200, width: RW }}>
                <Roster people={people} rows={rows} bi={bi} done={phase === "result"} seek={seek} pick={pick} />
              </div>
            )}

            {(sc === 0 || sc === 2) && (
              <div className="absolute right-9" style={{ bottom: BAR + 18, width: 300 }}>
                <Work trace={trace} t={t} looked={looked} />
              </div>
            )}
          </>
        )}
      </Fade>

      {n12 && legs12 && (
        <>
          {/* (engine 12: the move as it is worked out, told in the middle under the world, the day it has come to above it,
          and under it what is under way) */}
          <Fade on={phase === "run" && !intro} className="pointer-events-none absolute inset-0">
            <div className="pointer-events-none absolute inset-x-0 top-[84px] h-[20px] text-center leading-none" style={{ fontFamily: MONO, fontSize: 19, fontWeight: 300, letterSpacing: "0.04em" }}>
              <Swap id={day12} className="relative h-full">
                <div>{day12}</div>
              </Swap>
            </div>
            <div className="absolute" style={{ left: AX - MW / 2, width: MW, top: H - 64 - MH + 6 }}>
              <div ref={said} className="mx-auto w-fit max-w-full">
                <Main L={L12} k={t12.cur} to={to12 >= 0 ? (score.bodies[to12]?.name ?? null) : null} fell={it12?.kind !== "roll" || Date.now() - t12.at > t12.dur * 0.42} />
              </div>
            </div>
            <div className="absolute" style={{ left: AX - MW / 2, width: MW, bottom: BAR + 22 }}>
              <LiveLine L={L12} centre />
            </div>
          </Fade>
          {/* (down either side, in every phase of a stop: the parties, and what happened; this stop's at the foot of each) */}
          <div className="pointer-events-none absolute inset-0" style={{ opacity: intro ? 0.25 : 1, transition: "opacity .5s ease" }}>
            <style>{TURN_CSS}</style>
            <div className="absolute inset-y-0 left-0" style={{ width: COLS.side + 170, background: `linear-gradient(90deg, rgb(${P.pageRgb} / 0.8) 0%, rgb(${P.pageRgb} / 0.6) 55%, rgb(${P.pageRgb} / 0) 100%)` }} />
            <div className="absolute inset-y-0 right-0" style={{ width: COLS.side + 170, background: `linear-gradient(270deg, rgb(${P.pageRgb} / 0.8) 0%, rgb(${P.pageRgb} / 0.6) 55%, rgb(${P.pageRgb} / 0) 100%)` }} />
            <div className="turn-side absolute flex flex-col" style={{ left: COLS.edge, width: COLS.side, top: 110, bottom: BAR + 30, opacity: phase === "decide" ? 0.84 : 1 }}>
              <Parties legs={legs12.legs} cur={legs12.cur} sides={sides12} cast={cast12} />
            </div>
            <div className="turn-side absolute flex flex-col" style={{ right: COLS.edge, width: COLS.side, top: 110, bottom: BAR + 30, opacity: phase === "decide" ? 0.84 : 1 }}>
              <Happenings legs={legs12.legs} cur={legs12.cur} sides={sides12} />
            </div>
          </div>
          {cards.map((c) => (
            <PersonCard key={c.id} play={play} name={c.name} at={c.at} onClose={() => setCards((o) => o.filter((x) => x.id !== c.id))} />
          ))}
        </>
      )}
    </>
  );
}

/** What this play is: whose place you are in, what you are after, where in time it has got to. */
function About({ world, play }: { world: WorldView; play: Play }) {
  const { P } = useApp();
  const t = useT("flow-lab.flow");
  const seat = play.graph.nodes.find((n) => n.id === play.seatId);
  const arc = play.arc;
  const reached = arc ? arc.milestones.filter((m) => m.reachedAt).length : 0;
  return (
    <div className="w-[236px] shrink-0">
      <div className="truncate text-[13.5px] font-medium">{world.title}</div>
      <div className="mt-[3px] truncate text-[11.5px]" style={{ color: P.mute }}>
        {arc?.goal ? t("youAreAfter", { name: seat?.name ?? t("you"), goal: arc.goal }) : t("youAre", { name: seat?.name ?? t("you") })}
      </div>
      <div className="mt-[3px] truncate" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>
        {arc ? t("decisionNMain", { date: play.branch.simTime, step: play.branch.step, reached, total: arc.milestones.length }) : t("decisionN", { date: play.branch.simTime, step: play.branch.step })}
      </div>
    </div>
  );
}

/**
 * One thing told, set straight on the picture, in the order it happens: who (and, once it has left them, whom it
 * reaches); what goes on in their head, quietly, first; then what they say or do, large, as it leaves them in the
 * picture; then where that leaves them. Everything has its place and comes into it; nothing moves once it is there.
 */
function Told({ beat, ms, tAct, missed, to, arrived, plain = false }: { beat: TBeat; ms: number; tAct: number; missed: number; to: string | null; arrived: boolean; /** The moment the world stops for you is called the next step. */ plain?: boolean }) {
  const { P } = useApp();
  // (`t` is a moment here: the texts are `tx`)
  const tx = useT("flow-lab.flow");
  const c = beat.c;
  const D = c.detail;
  const q = sat(ms / beat.dur);
  const clamp = (n: number): React.CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" });
  const at = (t: number): React.CSSProperties => ({ opacity: ms >= t ? 1 : 0, transform: ms >= t ? "none" : "translateY(8px)", transition: "opacity .6s ease, transform .6s cubic-bezier(.2,.7,.2,1)" });
  const head = (who: string, what: string) => (
    <div className="flex h-[26px] items-baseline gap-3">
      <span className="min-w-0 truncate text-[17px] font-medium">
        {who}
        {to && (
          <span style={{ opacity: ms >= tAct ? 1 : 0, transition: "opacity .6s ease" }}>
            <span style={{ color: P.faint }}> → </span>
            <span style={{ color: arrived ? P.warm : P.ink, transition: "color .6s" }}>{to}</span>
          </span>
        )}
      </span>
      {what && (
        <span className="shrink-0" style={{ fontFamily: MONO, fontSize: 11, color: P.warm }}>
          {what}
        </span>
      )}
      {c.wave ? (
        <span className="ml-auto shrink-0" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>
          {tx("wave", { n: c.wave })}
        </span>
      ) : null}
    </div>
  );
  // (in the settled way what is said or done is not cut off in the middle: whole sentences of it, on a line more)
  const big = (x0: string, quote: boolean, t: number, lines0 = 3) => {
    const x = plain ? excerpt(x0, 78) : x0;
    const lines = plain ? Math.max(lines0, 4) : lines0;
    return (
      <div className="mt-3.5 text-[24px] leading-[38px] font-medium" style={{ height: 38 * lines, ...clamp(lines), ...at(t) }}>
        {quote && "“"}
        {x}
        {quote && "”"}
      </div>
    );
  };
  const grid = (cells: ([string, string, boolean?] | false | null | undefined | "")[], t: number) => {
    const xs = cells.filter((x): x is [string, string, boolean?] => !!x).slice(0, 4);
    const lines = xs.length > 2 ? 2 : 3;
    return (
      <div className="mt-[18px] grid grid-cols-2 gap-x-9 gap-y-4">
        {xs.map(([label, x, warm], i) => (
          <div key={label} className="min-w-0" style={at(t + i * 170)}>
            <div className="text-[11.5px]" style={{ color: warm ? P.warm : P.faint }}>
              {label}
            </div>
            <div className="mt-1 text-[14px] leading-[22px]" style={{ ...clamp(lines), color: `rgb(${P.inkRgb} / 0.86)` }}>
              {x}
            </div>
          </div>
        ))}
      </div>
    );
  };
  if (c.purpose === "actor_decision") {
    const quiet = D.quiet || !D.action;
    return (
      <>
        {head(c.actor?.name ?? tx("aSide"), D.said ? tx("says") : quiet ? tx("holds") : tx("does"))}
        <div className="mt-3 h-[58px]" style={at(150)}>
          {D.thinking ? (
            <>
              <div className="text-[11.5px]" style={{ color: P.faint }}>
                {tx("thinks")}
              </div>
              <div className="mt-0.5 text-[13.5px] leading-[20px]" style={{ ...clamp(2), color: P.mute }}>
                {D.thinking}
              </div>
            </>
          ) : null}
        </div>
        {D.said ? big(D.said, true, tAct) : big(quiet ? tx("hold") : (D.action ?? ""), false, tAct)}
        {grid([D.said && [tx("does"), quiet ? tx("hold") : (D.action ?? "")], D.beliefs && [tx("believes"), D.beliefs], D.stance?.length ? [tx("stance"), D.stance[0]!, true] : D.unsure && [tx("unsure"), D.unsure]], tAct + 800)}
      </>
    );
  }
  if (c.purpose === "adjudicate_move")
    return (
      <>
        {head(tx("yourMove"), tx("howItIsRead"))}
        {big(D.restatement ?? "", false, 150)}
        {grid(
          [
            !!D.targets?.length && [tx("actsOn", { count: D.targets.length }), D.targets.join(tx("listSep"))],
            [tx("howItGoes"), D.days != null ? tx(D.open ? "overDaysOpen" : "overDaysClosed", { count: D.days }) : D.open ? tx("inTheOpen") : tx("notInPublic")],
            !!D.certain?.length && [tx("certainN", { count: D.certain.length }), D.certain[0]!],
            !!D.uncertain?.length && [tx("uncertainN", { count: D.uncertain.length }), D.uncertain[0]!.question, true],
          ],
          tAct + 600,
        )}
      </>
    );
  if (c.purpose === "resolve_uncertain") {
    const it = D.items?.[beat.item ?? 0];
    const outs = (it?.outcomes ?? []).filter((o) => o.p > 0).slice(0, 4);
    const sum = outs.reduce((a, o) => a + o.p, 0) || 1;
    const shown = q > 0.5;
    const hit = outs.find((o) => o.label === it?.chosen);
    return (
      <>
        {head(tx("settledByOdds"), (D.items?.length ?? 0) > 1 ? `${(beat.item ?? 0) + 1} / ${D.items!.length}` : "")}
        <div className="mt-4 text-[23px] leading-[38px] font-medium" style={{ height: plain ? 114 : 76, ...clamp(plain ? 3 : 2), ...at(150) }}>
          {it?.question}
        </div>
        {/* how likely each way was: one line, each stretch as long as its odds */}
        <div className="mt-5 grid gap-[6px]" style={{ ...at(650), gridTemplateColumns: outs.map((o) => `minmax(0, ${Math.max(0.12, o.p / sum)}fr)`).join(" ") }}>
          {outs.map((o) => {
            const on = shown && o === hit;
            return (
              <div key={o.label} className="min-w-0">
                <div className="h-[4px] rounded-full transition-colors duration-700" style={{ background: on ? P.warm : `rgb(${P.inkRgb} / ${shown ? 0.16 : 0.34})` }} />
                <div className="mt-2 transition-colors duration-700" style={{ fontFamily: MONO, fontSize: 12, color: on ? P.warm : P.mute }}>
                  {Math.round((o.p / sum) * 100)}%
                </div>
                <div className="mt-0.5 text-[13px] leading-[20px] transition-colors duration-700" style={{ ...clamp(3), color: on ? P.ink : shown ? P.faint : P.mute }}>
                  {o.label}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 h-[26px] text-[16px] transition-opacity duration-700" style={{ opacity: shown && hit ? 1 : 0 }}>
          {rich(tx("landedHere", { p: hit ? Math.round((hit.p / sum) * 100) : 0 }), { m: (x) => <span style={{ color: P.mute }}>{x}</span> })}
        </div>
        {it?.base && (
          <div className="mt-4 flex gap-3 pt-4 text-[13px] leading-[21px]" style={{ ...at(1000), boxShadow: `inset 0 1px 0 rgb(${P.inkRgb} / 0.12)` }}>
            <span className="w-[32px] shrink-0 text-[11.5px] leading-[21px]" style={{ color: P.faint }}>
              {tx("basis")}
            </span>
            <span style={{ ...clamp(3), color: `rgb(${P.inkRgb} / 0.78)` }}>{it.base}</span>
          </div>
        )}
      </>
    );
  }
  if (c.purpose === "settle_stretch" || c.purpose === "world_tick")
    return (
      <>
        {head(tx("thisWorld"), tx("movesOnItsOwn"))}
        {big(D.summary ?? tx("timePassed"), false, 150)}
        {grid(
          [
            ...(D.chances ?? []).slice(0, 2).map((x, i): [string, string, boolean] => [i ? tx("anotherUnexpected") : tx("unexpectedHappened"), x, true]),
            missed > 0 && [tx("didNotHappen"), tx("missedN", { count: missed })],
            ...(D.voices ?? []).slice(0, 1).map((x): [string, string] => [tx("crowdSays"), x]),
            !!D.newcomers?.length && [tx("newcomers"), D.newcomers.join(tx("listSep"))],
          ],
          900,
        )}
      </>
    );
  if (c.purpose === "plan_jump")
    return (
      <>
        {head(tx("timeHead"), tx("movesOn"))}
        {big(tx("jumpTo", { to: D.jumpTo ?? "" }), false, 150)}
        {D.moment && grid([[tx("thenYouDecide"), D.moment]], 900)}
      </>
    );
  return (
    <>
      {head(plain ? tx("nextStepPlain") : tx("nextStep"), plain ? tx("waitingForYouToDecide") : tx("waitingForYou"))}
      {big(D.headline ?? "", false, 150)}
    </>
  );
}

/** Where the step stops, set on the picture: what it came to, and what is asked next. */
function End({ play, trace, beats, looked, headline, from, to, onNext, go, lean = false }: { play: Play; trace: Trace; beats: TBeat[]; looked: number; headline: string; from: string; to: string; onNext: () => void; /** What the way on is called. */ go?: string; /** Everyone in the step is on the page beside this: what they did is not said again here, and what is asked next is read in full. */ lean?: boolean }) {
  const { P } = useApp();
  const locale = useLocale();
  const nums = numsOf(play, locale).filter((n) => n.d);
  const last = new Map(beats.filter((b) => b.c.purpose === "actor_decision" && b.c.actor).map((b) => [b.c.actor!.id, b]));
  const parties = [...last.values()];
  const odds = beats.filter((b) => b.c.purpose === "resolve_uncertain").length;
  const t = useT("flow-lab.flow");
  return (
    <div className="flex h-full flex-col">
      <div className="flow-rise flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-medium">{t("stepDone")}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: P.faint }}>
          {from} → {to}
        </span>
      </div>
      <div className="flow-rise mt-2 text-[12.5px]" style={{ color: P.mute, animationDelay: ".06s" }}>
        {[t("sidesActed", { count: parties.length }), t("settledByOddsN", { count: odds }), looked ? t("lookedUpN", { count: looked }) : ""].filter(Boolean).join(" · ")}
      </div>
      <div className={`flow-rise mt-6 ${lean ? "" : "grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-x-9"}`} style={{ animationDelay: ".14s", display: lean && !nums.length ? "none" : undefined }}>
        <div className="min-w-0">
          <div className="text-[11.5px]" style={{ color: P.faint }}>
            {nums.length ? t("changedSinceStart") : t("noNumbers")}
          </div>
          <div className="mt-2 grid gap-[7px]">
            {nums.slice(0, 6).map((n) => (
              <div key={n.m.key} className="flex items-baseline justify-between gap-2 text-[13.5px]">
                <span className="min-w-0 truncate" style={{ color: P.mute }}>
                  {n.m.label}
                </span>
                <span className="shrink-0" style={{ fontFamily: MONO, fontSize: 12.5, color: n.bad ? P.warm : P.ink }}>
                  {n.d}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0" style={{ display: lean ? "none" : undefined }}>
          <div className="text-[11.5px]" style={{ color: P.faint }}>
            {t("whatEachDid")}
          </div>
          <div className="mt-2 grid gap-[7px]">
            {parties.slice(0, 6).map((b) => (
              <div key={b.key} className="flex min-w-0 gap-2 text-[13.5px] whitespace-nowrap">
                <span className="shrink-0">{cut(b.c.actor!.name, 7)}</span>
                <span className="min-w-0 truncate" style={{ color: P.mute }}>
                  {b.c.detail.quiet || !b.c.detail.action ? t("hold") : b.c.detail.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`flow-rise flex pt-5 ${lean ? "mt-7 flex-col items-start gap-5" : "mt-auto items-end justify-between gap-6"}`} style={{ animationDelay: ".24s", boxShadow: lean ? "none" : `inset 0 1px 0 rgb(${P.inkRgb} / 0.12)` }}>
        <div className="min-w-0">
          <div style={{ fontFamily: MONO, fontSize: 11, color: P.warm }}>{t("stoppedHere")}</div>
          <div className="mt-1.5 text-[19px] leading-[29px] font-medium" style={{ display: "-webkit-box", WebkitLineClamp: lean ? 6 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {headline}
          </div>
        </div>
        <button type="button" onClick={onNext} className="shrink-0 rounded-full px-5 py-2.5 text-[14px]" style={{ background: P.warm, color: P.page }}>
          {go ?? t("seeNextStepArrow")}
        </button>
      </div>
    </div>
  );
}

/** How much the engine has worked out, in a line, and every call as a bar in time. */
function Work({ trace, t, looked }: { trace: Trace; t: number; looked: number }) {
  const { P } = useApp();
  // (`t` is the step's own time here: the texts are `tx`)
  const tx = useT("flow-lab.flow");
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
  const rowsN = Math.min(8, Math.max(1, ...lanes.map((x) => x.k + 1)));
  const fin = cs.filter((c) => t >= c.to);
  const secs = Math.round(t / 1000);
  const stat = (label: string, value: string) => (
    <span className="whitespace-nowrap">
      <span style={{ color: P.faint }}>{label} </span>
      <span style={{ fontFamily: MONO, color: P.mute }}>{value}</span>
    </span>
  );
  return (
    <div>
      <div className="relative" style={{ height: rowsN * 5 + 2 }}>
        {lanes
          .filter((x) => x.k < rowsN)
          .map(({ c, k }) => (
            <span key={c.id} className="absolute h-[3px] rounded-full" style={{ top: k * 5, left: `${(c.from / trace.ms) * 100}%`, width: `${Math.max(1, ((c.to - c.from) / trace.ms) * 100)}%`, background: t >= c.to ? `rgb(${P.inkRgb} / 0.45)` : t >= c.from ? P.warm : `rgb(${P.inkRgb} / 0.12)` }} />
          ))}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[11px]">
        {stat(tx("engineCalls"), `${fin.length}/${cs.length}`)}
        {stat(tx("runningAtOnce"), String(cs.filter((c) => t >= c.from && t < c.to).length))}
        {stat(tx("elapsed"), `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`)}
        {looked > 0 && stat(tx("verified"), String(looked))}
      </div>
    </div>
  );
}
