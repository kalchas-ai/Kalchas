"use client";

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MONO } from "@/components/kit/palette";
import { useApp } from "@/components/product/shell";
import { Answer, Going, Own } from "@/components/flow-lab/ask-parts";
import { PaceChoice, PaceSourceContext, SAMPLE_PACE, paceAsked, type Pace } from "@/components/flow-lab/pace";
import { useT } from "@/lib/i18n/client";

/**
 * What has to be known first, one thing at a time, on the axis (/design/matter): what is asked, and under it the
 * answers offered, side by side, each read in full. This is the way it was, with two things added.
 *
 * An answer of your own. Beside the answers offered there is always one more, to write in: it is the size of one of
 * them until it is gone to, then opens; what is written is given like any other answer. Where what is asked for is
 * a number, it says its unit. So every kind of question the engine writes can be answered here (one of several, any
 * of several, a number, a few words).
 *
 * What is answered is kept, and at the end all of it goes into the picture together. The answer pressed goes up,
 * whole, to the top of the page and is set down there at the end of one line of words, what was answered before,
 * and stays while the rest is asked: nothing that is said is lost sight of. When the last thing has been answered
 * the line is seen whole for a moment; then its words give way, where they are, to a line of light (points like
 * the galaxy's own stars, most of them faint and small, a few bright; they lie along the line and are not the
 * shapes of its letters), and the light goes down into what is gathering in the middle of the galaxy, which grows
 * with it and is brighter for a moment: what was said is the first of what a world is made from. The light goes
 * down as one thread: the middle of the line lets go first and the rest after, drawn in toward the middle of the
 * page and then straight down it, faster as it falls. Nothing is there or gone at once.
 *
 * The last thing asked is how closely the world is to be watched (its paces): it is not answered from a row like the
 * rest but from the grain of time, a strand of light (pace.tsx); what is chosen goes up like any answer. As it really
 * runs it is not among the others: it is written for the world from their answers. So when the last of the others is
 * answered, the answers are told at once (the world begins to be made), and the question about pace is asked for
 * (PaceSourceContext); meanwhile the page is held as it is, the line kept at the top, and only if it takes a while
 * does a quiet word come into the middle, and go again. When it comes it is asked like the others, and what is chosen
 * (or written, or nothing, when it is passed over) is told; then the line goes in as light. With no such question
 * (it could not be written), the line goes in at once. Where a record is played back, a sample of it is asked last.
 */

export type Asked = { q: string; why?: string; options?: string[]; answer?: string | string[] | null; kind?: "one" | "many" | "number" | "text"; unit?: string | null; /** Asked only after the thing it follows (its words) was answered one of these ways. */ parent?: string; on?: string[]; /** How closely the world is to be watched, one for each answer offered, in the same order (the last thing asked). */ pace?: Pace[] };

const SWIFT = "cubic-bezier(.2,.7,.2,1)";
const sat = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
/** How long an answer takes to go up to where it is kept, and how long the line is seen whole at the end (ms). */
const UP = 560;
const SEEN = 460;
/** How long all of the light takes to be in the galaxy, and when what is gathering there begins to answer it (ms). */
const OVER = 2150;
const TAKEN = 520;

/** A point of the light what was answered becomes: where on the line it starts, when it is seen and when it lets go (ms), how long it takes, how bright and how large it is. */
type Mote = { x: number; y: number; born: number; go: number; dur: number; lum: number; size: number; seed: number };
type Flight = { motes: Mote[]; t0: number; T: { x: number; y: number } };

export function Ask({ items: given, title, onDone, onAnswers, to, onGather }: { items: Asked[]; /** What the whole thing is about, set at the top left as the title is while the world is made. */ title?: string; onDone: () => void; /** Told what was answered to each thing asked, in order, once all of it has been (as it really runs). */ onAnswers?: (answers: { q: string; answer: string | null }[]) => void; /** Where what is gathering in the galaxy is, on the page. */ to?: { x: number; y: number }; /** Told how much of what was answered has gone into the galaxy (0, then 1). */ onGather?: (k: number) => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.asks");
  const source = useContext(PaceSourceContext);
  /** The question about pace, once it has come from the source (as it really runs, it is asked after the others). */
  const [later, setLater] = useState<Asked | null>(null);
  /** Waiting for it: since when, and whether the quiet word in the middle is to be seen. */
  const [waiting, setWaiting] = useState(false);
  const [waitSeen, setWaitSeen] = useState(false);
  // (a record played back, where no one is told the answers, was made before the pace was asked: a sample of it is put last)
  const items = useMemo(() => {
    const base = !onAnswers && !source && given.length && !given.some((x) => x.pace?.length) ? [...given, SAMPLE_PACE] : given;
    return later ? [...base, later] : base;
  }, [given, onAnswers, source, later]);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  /** Where any of several can be answered: those taken so far (they are given together). */
  const [many, setMany] = useState<string[]>([]);
  /** What was answered to each thing asked (nothing where it was passed over, or not yet come to). */
  const [said, setSaid] = useState<(string | null)[]>([]);
  const saidRef = useRef(said);
  saidRef.current = said;
  const tell = useRef(onAnswers);
  tell.current = onAnswers;
  const src = useRef(source);
  src.current = source;
  /** Whether the answers have been told already (as it really runs, before the pace is asked). */
  const told = useRef(false);
  /** What was said to each thing asked (nothing, for what was not come to) is given, once: the question about pace is not among them. */
  const tellAll = () => {
    if (told.current) return;
    told.current = true;
    tell.current?.(items.flatMap((x, n) => (x.pace?.length ? [] : [{ q: x.q, answer: saidRef.current[n] ?? null }])));
  };
  /** Everything is answered and has gone in: the rest goes on. */
  const finish = () => {
    tellAll();
    onDone();
    src.current?.done?.();
  };
  /** Whether a thing is asked at all: something that follows another is asked only after the answer that calls for it. */
  const asked = (n: number) => {
    const x = items[n];
    if (!x?.parent) return true;
    const p = items.findIndex((y) => y.q === x.parent);
    const a = p >= 0 ? saidRef.current[p] : null;
    return !!a && (!x.on?.length || x.on.some((o) => a === o || a.startsWith(o)));
  };
  const mineEl = useRef<HTMLLabelElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const shelf = useRef<HTMLDivElement>(null);
  /** The answer just pressed, where it is on the page; and where each answer kept was when last looked at. */
  const pressed = useRef<HTMLElement | null>(null);
  const places = useRef(new Map<number, DOMRect>());
  const timers = useRef<number[]>([]);
  const gather = useRef(onGather);
  gather.current = onGather;
  // the light on its way down is drawn on a sheet of its own over the page
  const sheet = useRef<HTMLCanvasElement>(null);
  const flight = useRef<Flight | null>(null);
  const frame = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    gather.current?.(0);
    return () => {
      alive.current = false;
      timers.current.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(frame.current);
    };
  }, []);
  /** How much smaller than it is laid out the page is shown. */
  const shown = () => {
    const el = root.current;
    return el ? el.getBoundingClientRect().width / Math.max(1, el.offsetWidth) || 1 : 1;
  };
  // an answer is kept: the one pressed goes up to its place, and those already there make room
  useLayoutEffect(() => {
    const host = shelf.current;
    if (!host) return;
    const k = shown();
    const now = new Map<number, DOMRect>();
    host.querySelectorAll<HTMLElement>("[data-kept]").forEach((el) => {
      const n = Number(el.dataset.kept);
      const r = el.getBoundingClientRect();
      now.set(n, r);
      const old = places.current.get(n);
      if (old) {
        const dx = (old.left - r.left) / k;
        const dy = (old.top - r.top) / k;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) el.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: "none" }], { duration: 420, easing: SWIFT });
        return;
      }
      // (new here: it is seen as the answer pressed arrives, which is the same words the same size by then)
      el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.62 }, { opacity: 1 }], { duration: UP, easing: "linear", fill: "backwards" });
      const src = pressed.current;
      pressed.current = null;
      if (!src) return;
      const a = src.getBoundingClientRect();
      // where its words are, and where they are to be: the words go to the words
      const wordsOf = (e: HTMLElement) => {
        const node = Array.from(e.childNodes).find((c) => c.nodeType === 3 && (c.nodeValue ?? "").trim());
        if (!node) return null;
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect();
      };
      const there = el.querySelector<HTMLElement>("[data-words]") ?? el;
      const w0 = wordsOf(src) ?? a;
      const w1 = wordsOf(there) ?? r;
      const s = parseFloat(getComputedStyle(there).fontSize) / Math.max(1, parseFloat(getComputedStyle(src).fontSize));
      const cx = a.left + a.width / 2;
      const cy = a.top + a.height / 2;
      const tx = (w1.left + w1.width / 2 - cx - (w0.left + w0.width / 2 - cx) * s) / k;
      const ty = (w1.top + w1.height / 2 - cy - (w0.top + w0.height / 2 - cy) * s) / k;
      const tint = getComputedStyle(there).color;
      const line = getComputedStyle(src).boxShadow;
      src.style.zIndex = "2";
      src.animate(
        [
          { transform: getComputedStyle(src).transform === "none" ? "none" : getComputedStyle(src).transform, opacity: 1, boxShadow: line },
          { boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0)", offset: 0.42 },
          { opacity: 1, offset: 0.66 },
          { transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s.toFixed(4)})`, opacity: 0, color: tint, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0)" },
        ],
        { duration: UP, easing: "cubic-bezier(.3,0,.15,1)", fill: "forwards" },
      );
      // (what there was to press inside it goes first)
      src.querySelectorAll<HTMLElement>("button").forEach((b) => b.animate([{ opacity: getComputedStyle(b).opacity }, { opacity: 0 }], { duration: 140, fill: "forwards" }));
    });
    places.current = now;
  }, [said]);
  const paint = (now: number) => {
    const cv = sheet.current;
    const g = cv?.getContext("2d");
    const f = flight.current;
    if (!cv || !g || !f) return;
    const w = cv.offsetWidth;
    const h = cv.offsetHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    const [wr, wg, wb] = P.warmRgb.split(" ").map(Number) as [number, number, number];
    const [ir, ig, ib] = P.inkRgb.split(" ").map(Number) as [number, number, number];
    const t = now - f.t0;
    const T = f.T;
    let left = 0;
    for (const m of f.motes) {
      const seen = sat((t - m.born) / 200);
      if (seen <= 0) {
        left++;
        continue;
      }
      // one thread down the middle of the page: drawn in toward the middle first and then down, faster as it falls
      const u = sat((t - m.go) / m.dur);
      const e = u * u * (0.55 + 0.45 * u);
      const cx = T.x + (m.x - T.x) * 0.08;
      const cy = m.y + (T.y - m.y) * 0.2;
      const x = (1 - e) * (1 - e) * m.x + 2 * (1 - e) * e * cx + e * e * T.x + 2.4 * Math.sin(Math.PI * e) * Math.sin(m.seed * 40 + t * 0.004);
      const y = (1 - e) * (1 - e) * m.y + 2 * (1 - e) * e * cy + e * e * T.y;
      if (u >= 1) continue;
      left++;
      // as the stars are: each flickers a little; warmer as it goes down, and gone into the light as it arrives
      const flick = 0.8 + 0.2 * Math.sin(m.seed * 97 + t * 0.009);
      const al = seen * (1 - ease(sat((u - 0.86) / 0.14))) * m.lum * flick;
      if (al < 0.012) continue;
      const c = 0.5 * u;
      const d = m.size * (1 - 0.3 * u);
      g.fillStyle = `rgba(${Math.round(ir + (wr - ir) * c)}, ${Math.round(ig + (wg - ig) * c)}, ${Math.round(ib + (wb - ib) * c)}, ${Math.min(1, al).toFixed(3)})`;
      g.beginPath();
      g.arc(x, y, d / 2, 0, 6.2832);
      g.fill();
      // (the few bright ones have a little light round them, as a bright star has)
      if (m.lum > 0.9) {
        g.fillStyle = `rgba(${ir}, ${ig}, ${ib}, ${(al * 0.14).toFixed(3)})`;
        g.beginPath();
        g.arc(x, y, d * 1.9, 0, 6.2832);
        g.fill();
      }
    }
    if (left) frame.current = requestAnimationFrame(paint);
    else {
      flight.current = null;
      frame.current = 0;
      g.clearRect(0, 0, w, h);
    }
  };
  /** Everything kept goes into the galaxy, together; then the world is made. */
  const pour = () => {
    const host = shelf.current;
    const cv = sheet.current;
    const base = root.current?.getBoundingClientRect();
    const line = host?.querySelector<HTMLElement>("[data-all]");
    const words = host ? Array.from(host.querySelectorAll<HTMLElement>("[data-words]")) : [];
    if (!cv || !base || !line || !words.length) {
      finish();
      return;
    }
    const k = shown();
    const T = to ?? { x: base.width / k / 2, y: (base.height / k) * 0.62 };
    // the words give way to light where they are: softly, and not made smaller or sent anywhere
    line.animate(
      [
        { opacity: 1, filter: "blur(0px)" },
        { opacity: 0, filter: "blur(3px)" },
      ],
      { duration: 560, easing: "ease-in", fill: "forwards" },
    );
    const boxes = words.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: (r.left - base.left) / k, y: (r.top - base.top) / k, w: r.width / k, h: r.height / k };
    });
    const l = Math.min(...boxes.map((b) => b.x));
    const r = Math.max(...boxes.map((b) => b.x + b.w));
    const reach = Math.max(1, r - T.x, T.x - l);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const motes: Mote[] = [];
    for (const b of boxes) {
      // (as much light as there are words; it lies along the line, thickest at its middle, and is not the shapes of the letters)
      for (let n = Math.round(b.w * 2.3); n > 0; n--) {
        const x = b.x + Math.random() * b.w;
        const lum = 0.38 + 0.62 * Math.pow(Math.random(), 2.4);
        // (the middle of the line lets go first, and the rest after, out to its ends)
        motes.push({ x, y: b.y + b.h / 2 + gauss() * b.h * 0.2, born: 360 * Math.random(), go: 200 + 700 * Math.pow(Math.abs(x - T.x) / reach, 0.9) + 150 * Math.random(), dur: 820 + 220 * Math.random(), lum, size: 0.8 + 0.5 * lum + 0.5 * Math.pow(Math.random(), 5), seed: Math.random() });
      }
    }
    flight.current = { motes, t0: performance.now(), T };
    if (!frame.current) frame.current = requestAnimationFrame(paint);
    timers.current.push(
      window.setTimeout(() => gather.current?.(1), TAKEN),
      window.setTimeout(finish, OVER - 260),
    );
  };
  /** Where what is gathering in the galaxy is, on the screen (what the strand of the pace goes down into). */
  const into = () => {
    const b = root.current?.getBoundingClientRect();
    if (!b) return null;
    const k = shown();
    const T = to ?? { x: b.width / k / 2, y: (b.height / k) * 0.62 };
    return { x: b.left + T.x * k, y: b.top + T.y * k };
  };
  const it = items[i];
  if (!it)
    return (
      <div className="absolute inset-x-0 top-[34%] flex flex-col items-center text-center">
        {onAnswers || source ? (
          <button type="button" onClick={onDone} className="flow-rise rounded-full px-6 py-2.5 text-[14px]" style={{ background: P.warm, color: P.page }}>
            {t("start")}
          </button>
        ) : (
          // (a record played back that was made without anything being asked: it says so, quietly, and the foot goes on)
          <p className="flow-rise text-[13.5px] tracking-[0.04em]" style={{ color: P.faint }}>
            {t("noQuestions")}
          </p>
        )}
      </div>
    );
  const unit = it.kind === "number" ? (it.unit ?? "") : "";
  /** An answer offered, as it is said once given (a number has its unit). */
  const word = (o: string) => (unit ? `${o} ${unit}` : o);
  const opts = (it.options ?? []).slice(0, 7).map(word);
  const digits = text.replace(/[^\d.]/g, "");
  const typed = it.kind === "number" ? (digits ? word(digits) : "") : text.trim();
  const fresh = () => {
    setChosen(null);
    setLeaving(false);
    setText("");
    setWriting(false);
    setOver(null);
    setMany([]);
  };
  /** The others are all answered, as it really runs: they are told, and the question about pace is waited for. */
  const awaitPace = (from: NonNullable<typeof source>) => {
    tellAll();
    setWaiting(true);
    // (the quiet word comes only if it takes a while)
    let seen = false;
    const quiet = window.setTimeout(() => ((seen = true), setWaitSeen(true)), 600);
    timers.current.push(quiet);
    const base = items.length;
    const late = new Promise<null>((res) => timers.current.push(window.setTimeout(() => res(null), 45000)));
    Promise.race([from.ask().catch(() => null), late]).then((p) => {
      if (!alive.current) return;
      window.clearTimeout(quiet);
      setWaitSeen(false);
      // (the quiet word, if it was seen, goes before anything comes in its place)
      const after = seen ? 420 : 0;
      if (!p || !p.options.length) {
        timers.current.push(window.setTimeout(() => (setWaiting(false), pour()), Math.max(after, SEEN)));
        return;
      }
      timers.current.push(
        window.setTimeout(() => {
          setWaiting(false);
          setLater(paceAsked(p));
          fresh();
          setI(base);
        }, after),
      );
    });
  };
  const next = () => {
    // (what was chosen for the pace, as it really runs, is told: a name, words of one's own, or nothing)
    if (items[i]?.pace?.length && later && items[i] === later) src.current?.choose(saidRef.current[i] ?? null);
    // (on to the next thing that is asked: what follows an answer that was not given is passed over)
    let to = i + 1;
    while (to < items.length && !asked(to)) to++;
    if (to >= items.length) {
      // (as it really runs, the pace is asked after everything else, once it has been written for these answers)
      if (src.current && !later && !items.some((x) => x.pace?.length)) return awaitPace(src.current);
      // (what was asked last has gone; the line is looked at a moment, whole, and then goes in)
      timers.current.push(window.setTimeout(pour, SEEN));
      return;
    }
    fresh();
    setI(to);
  };
  // (it leaves upward, and only then is the next asked)
  const leave = (after: number) => timers.current.push(window.setTimeout(() => setLeaving(true), after), window.setTimeout(next, after + 280));
  const pick = (o: string, el: HTMLElement | null) => {
    if (chosen || leaving || !o) return;
    // (the pace chosen does not go up to the line: the strand itself goes down into the galaxy, see pace.tsx)
    pressed.current = items[i]?.pace?.length ? null : el;
    setChosen(o);
    setSaid((was) => {
      const now = was.slice();
      for (let n = now.length; n <= i; n++) now[n] = null;
      now[i] = o;
      return now;
    });
    // (what was asked stays until its answer has been set down where it is kept)
    leave(UP - 30);
  };
  const several = it.kind === "many";
  const mine = !!chosen && !opts.includes(chosen) && !many.length;
  const wide = writing || !!text || mine;
  const first = said.findIndex((a) => a != null);
  return (
    <div ref={root} className="absolute inset-0">
      {/* at the top left, where the title is while the world is made (builds.tsx): what the whole thing is about, and
          under it what has been answered, kept as one line of words, until all of it goes in */}
      <div className="pointer-events-none absolute" style={{ left: 44, top: 34, width: "min(680px, calc(100% - 88px))" }}>
        {title && (
          <div className="text-[26px] leading-[1.3] font-medium" style={{ letterSpacing: "0.01em" }}>
            {title}
          </div>
        )}
        <div ref={shelf} className={title ? "mt-[16px]" : ""}>
        <div data-all className="text-[13px] leading-[1.8]" style={{ color: `rgb(${P.inkRgb} / 0.8)` }}>
          {said.map(
            (a, n) =>
              a != null &&
              !items[n]?.pace?.length && (
                <span key={n} data-kept={n} className="inline-block whitespace-nowrap">
                  {n !== first && (
                    <span className="mx-2.5" style={{ color: P.faint }}>
                      ·
                    </span>
                  )}
                  <span data-words>{a}</span>
                </span>
              ),
          )}
        </div>
        </div>
      </div>
      <div key={i} className="absolute inset-0" style={{ animation: `flow-rise .55s ${SWIFT} both` }}>
        <style>{`.ask-own::placeholder { color: rgb(${P.inkRgb} / 0.62); }
.ask-range { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
.ask-range::-webkit-slider-runnable-track { height: 1px; background: linear-gradient(90deg, rgb(${P.inkRgb} / 0.8) var(--at), rgb(${P.inkRgb} / 0.2) var(--at)); }
.ask-range::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; margin-top: -6px; border-radius: 50%; background: ${P.warm}; }
@keyframes ask-star { 0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); } 50% { opacity: 0.55; transform: translateY(-50%) scale(0.72); } }
.ask-range::-moz-range-track { height: 1px; background: rgb(${P.inkRgb} / 0.2); }
.ask-range::-moz-range-thumb { width: 13px; height: 13px; border: 0; border-radius: 50%; background: ${P.warm}; }`}</style>
        {/* (the pace does not leave upward with the rest: its strand is on its way down into the galaxy, and its words go by themselves) */}
        <div className="absolute inset-x-0 top-[24%] flex flex-col items-center px-6 text-center" style={{ opacity: leaving && !it.pace?.length ? 0 : 1, transform: leaving && !it.pace?.length ? "translateY(-14px)" : "none", transition: `opacity .26s ease, transform .26s ${SWIFT}` }}>
          {/* (what is asked and its answers take at least this much room, so that going on is in one place for every
              question, about two rows of answers below what is asked; where the answers run longer it is under them) */}
          <div className="flex w-full flex-col items-center" style={{ minHeight: 210 }}>
          {/* (how far through the questions; the pace is asked after them, and is not counted among them) */}
          <div aria-hidden={!!it.pace?.length} style={{ fontFamily: MONO, fontSize: 11, color: P.faint, letterSpacing: "0.1em", opacity: it.pace?.length ? 0 : 1 }}>
            {said.filter((a, n) => n < i && a != null && !items[n]?.pace?.length).length + 1} / {items.filter((x) => !x.parent && !x.pace?.length).length}
          </div>
          <h2 className="mt-5 max-w-[760px] text-[28px] leading-[1.45] font-medium" style={{ opacity: chosen && it.pace?.length ? 0 : 1, filter: chosen && it.pace?.length ? "blur(3px)" : "none", transition: "opacity .5s ease, filter .5s ease" }}>
            {it.q}
          </h2>
          {it.pace?.length ? (
            <PaceChoice pace={it.pace} names={opts} chosen={chosen} onPick={pick} into={into} />
          ) : (
            <div className="mt-9 flex max-w-[900px] flex-wrap items-center justify-center gap-3">
              {opts.map((o) => (
                <Answer key={o} label={o} several={several} on={chosen === o} hot={over === o && !chosen} kept={several && many.includes(o) && !chosen} away={!!chosen && chosen !== o} onClick={(e) => (several ? !chosen && setMany((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o])) : pick(o, e.currentTarget))} onEnter={() => setOver(o)} onLeave={() => setOver(null)} />
              ))}
              {/* your own answer: one more among those offered, plainly a place to write, which opens when gone to */}
              <Own boxRef={mineEl} text={text} number={it.kind === "number"} unit={unit} wide={wide} mine={mine} hot={over === "\0" && !chosen} done={!!chosen} onText={(v) => !chosen && setText(v)} onFocus={() => setWriting(true)} onBlur={() => setWriting(false)} onEnter={() => setOver("\0")} onLeave={() => setOver(null)} onGive={() => pick(typed, mineEl.current)} />
            </div>
          )}
          {it.kind === "number" &&
            (() => {
              // (from nothing to well past the largest of what is offered, in round steps)
              const nums = (it.options ?? []).map((o) => Number(o.replace(/[^\d.]/g, ""))).filter((x) => Number.isFinite(x) && x > 0);
              const nice = (x: number) => {
                if (!(x > 0)) return 1;
                const e = 10 ** Math.floor(Math.log10(x));
                const m = x / e;
                return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
              };
              const max = nice((nums.length ? Math.max(...nums) : 100) * 1.8);
              const now = Number(digits) || 0;
              return (
                <div className="mt-7 flex w-[min(460px,70vw)] items-center gap-4" style={{ opacity: chosen ? 0 : 1, transition: "opacity .34s ease" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>0</span>
                  <input type="range" min={0} max={max} step={nice(max / 60)} value={Math.min(max, now)} onChange={(e) => (setText(e.target.value), setWriting(true))} className="ask-range h-[18px] min-w-0 flex-1" style={{ ["--at" as string]: `${(Math.min(max, now) / max) * 100}%` }} />
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>
                    {max.toLocaleString("en-US")} {unit}
                  </span>
                </div>
              );
            })()}
          </div>
          {/* going on and passing over: in the same place for every question, never over the answers */}
          {!it.pace?.length && (
            <div className="mt-10 w-full">
              <Going several={several} count={many.length} hidden={!!chosen || leaving} onGo={() => pick(many.join(t("listSeparator")), null)} onSkip={() => !chosen && !leaving && leave(0)} />
            </div>
          )}
        </div>
      </div>
      {/* (waiting for the question about pace to be written: a quiet word, only if it takes a while) */}
      {waiting && (
        <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-[24%] flex justify-center px-6 text-center">
          <span className="text-[13px] tracking-[0.04em]" style={{ color: P.faint, opacity: waitSeen ? 1 : 0, transition: "opacity .42s ease" }}>
            {t("oneMore")}
          </span>
        </div>
      )}
      <canvas ref={sheet} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
