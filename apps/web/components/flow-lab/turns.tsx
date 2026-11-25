"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Happening, Message, SeenRoll, StopLive } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { rich, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";
import { useApp } from "@/components/product/shell";
import { excerpt, md } from "@/components/product/replay/stage/data";
import type { Beat } from "@/components/product/replay/stage/engine";
import type { FaceKind } from "./faces";
import type { Row } from "./play";
import { FaceIcon } from "./who";

/**
 * A step of a play, told as it would be while it is really being worked out, not as a finished thing read back
 * (/design/matter). Every party's part is its own inference and comes when it comes. So: nothing is told before it
 * has come; whoever is still being worked out is shown as being worked out; a party is on the page only once the
 * world has turned to them; how many things there will be is not known, and so is not said; and there is no going
 * to the end before there is one. What has come and not yet been told can be gone on to; nothing else is skipped.
 *
 * The page (flow.tsx) has the world in the middle with what is told under it, like a caption, and a column to
 * either side. The parts of that are here: everyone in the step, as a dock (Dock: whoever is being told about is
 * large, with what they did; the rest are a face and a name, smaller the further off; whoever the pointer is on is
 * large too); what is told, in a line and a sentence, with the first of what more there is to say under it (Main);
 * what happens in the step that is no one's doing (Events); and where the step is, in a line (LiveLine). And, for
 * when a decision is to be made: everyone and what they did in the step before (Board), and how things stand
 * (Stand).
 *
 * Anything that has come can be read again: pressing someone, or something that happened, puts it where what is
 * told is, until it is let go. Nothing opens in a column so far that the column no longer fits the page.
 */

export type LBeat = Beat & { came: number };
export type Side = { name: string; body: number; kind: FaceKind; you: boolean; ks: number[]; /** When the world first turned to them, in the step's own time. */ from: number };

/** A step as it stands at this moment of its being worked out. */
export type Live = {
  rows: Row[];
  beats: LBeat[];
  /** What is being told (-1: nothing has come yet). */
  bi: number;
  /** The step is over. */
  done: boolean;
  /** Where the telling is, and where the step itself is (its own time), in ms. */
  pt: number;
  real: number;
  people: Side[];
  /** What you did, as you put it (known from the start). */
  did: string;
  /** Whose part is being worked out now. */
  busy: Set<string>;
  /** What else is being worked out now, in a few words ("" when nothing is). */
  working: string;
  /** On to what has come and not been told. */
  next: () => void;
  pick: (body: number) => void;
  /** What has been taken up to be read again (-1: nothing), and taking one up or letting it go. */
  peek: number;
  onPeek: (k: number) => void;
};

const SWIFT = "cubic-bezier(.2,.7,.2,1)";
const said = (t: T, g: string) => (/^[a-z_]+$/.test(g) ? t("checkingReality") : g);
/**
 * What kind of thing happened, where it is no one's doing, by a row's `sec` (play.tsx, rowsOf): left to chance, the
 * world moving of itself, the next step, looking into the real world. Each has a short word of its own here.
 */
const SEC = new Set(["chance", "world", "next", "lookup"]);
/** How the engine's names say the protagonist in a Chinese project ("you", "the protagonist"): either is you. */
const YOU = "\u4f60";
const LEAD = "\u4e3b\u89d2";

export const TURN_CSS = `
@property --cut { syntax: "<percentage>"; inherits: false; initial-value: 100%; }
.turn-clip { -webkit-mask-image: linear-gradient(#000, #000), linear-gradient(90deg, #000 var(--cut), transparent calc(var(--cut) + 36%)); -webkit-mask-size: 100% calc(100% - var(--lh)), 100% var(--lh); -webkit-mask-position: top, bottom; -webkit-mask-repeat: no-repeat; mask-image: linear-gradient(#000, #000), linear-gradient(90deg, #000 var(--cut), transparent calc(var(--cut) + 36%)); mask-size: 100% calc(100% - var(--lh)), 100% var(--lh); mask-position: top, bottom; mask-repeat: no-repeat; }
.turn-soft { position: relative; opacity: 0.74; transition: opacity .45s ease; }
.turn-soft::after { content: ""; position: absolute; inset: -14px; pointer-events: none; -webkit-backdrop-filter: blur(4.5px); backdrop-filter: blur(4.5px); -webkit-mask-image: linear-gradient(var(--soft), transparent 6%, #000 100%); mask-image: linear-gradient(var(--soft), transparent 6%, #000 100%); transition: opacity .45s ease; }
.turn-soft:hover, .turn-soft:focus-within { opacity: 1; }
.turn-soft:hover::after, .turn-soft:focus-within::after { opacity: 0; }
.turn-row { transition: opacity .3s ease; }
.turn-row:hover { opacity: 1 !important; }
.turn-side { transition: opacity .45s ease; }
.turn-side:hover, .turn-side:focus-within { opacity: 1 !important; }`;

/** Something that folds away to nothing, and opens again, by its own height. */
function Fold({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transition: `grid-template-rows .55s ${SWIFT}, opacity .5s ease` }}>
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}

/** Words kept to a few lines until opened: where they are cut short the last line fades out, to say there is more. */
function Clip({ open, n, lh, max = 22, children }: { open: boolean; n: number; lh: number; /** How many lines it may open to. */ max?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    const inner = el?.firstElementChild;
    if (!el || !inner) return;
    const read = () => setMore(inner.scrollHeight > n * lh + 2);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [n, lh]);
  return (
    <div ref={ref} className="turn-clip" style={{ maxHeight: open ? max * lh : n * lh, overflow: "hidden", lineHeight: `${lh}px`, ["--cut" as string]: more && !open && n > 0 ? "56%" : "100%", ["--lh" as string]: `${lh}px`, transition: `max-height .55s ${SWIFT}, --cut .4s ease` }}>
      <div>{children}</div>
    </div>
  );
}

/** One thing in a place gives way to the next: the one before goes first, and only then does the next come in. */
function Change({ id, children }: { id: string; children: React.ReactNode }) {
  const [shown, setShown] = useState(id);
  const [out, setOut] = useState(false);
  const keep = useRef<React.ReactNode>(children);
  const live = shown === id;
  if (live) keep.current = children;
  useEffect(() => {
    if (shown === id) return;
    setOut(true);
    const t = window.setTimeout(() => {
      setShown(id);
      setOut(false);
    }, 210);
    return () => window.clearTimeout(t);
  }, [id, shown]);
  return (
    <div style={{ opacity: out ? 0 : 1, transform: out ? "translateY(-8px)" : "none", transition: out ? `opacity .2s ease, transform .2s ${SWIFT}` : "none" }}>
      <div key={shown} style={{ animation: `flow-rise .5s ${SWIFT} both` }}>
        {live ? children : keep.current}
      </div>
    </div>
  );
}

const Head = ({ children }: { children: React.ReactNode }) => {
  const { P } = useApp();
  return <div style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, letterSpacing: "0.1em" }}>{children}</div>;
};

// ------------------------------------------------------------------------------------------- everyone in the step

/**
 * Everyone, each with their face and under their name what they did: two lines until pressed, then all of it, and
 * while one is open the others are names only, so that the column is never longer for it. (Beside a decision: who
 * did what in the step before.)
 */
export function Board({ L, title }: { L: Live; title: string }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="pointer-events-auto flex flex-col">
      <Head>
        {title} · {L.people.length}
      </Head>
      <div className="mt-1.5 flex flex-col">
        {L.people.map((p) => {
          const k = p.ks[p.ks.length - 1];
          const wide = open === p.name;
          return (
            <div key={p.name} className="flex items-start gap-2.5 py-[6px]">
              <button type="button" onClick={() => p.body >= 0 && L.pick(p.body)} className="mt-[1px] shrink-0" title={t("whoIsThis")}>
                <FaceIcon kind={p.kind} size={17} />
              </button>
              <button type="button" onClick={() => setOpen(wide ? null : p.name)} className="min-w-0 flex-1 text-left" title={wide ? t("hide") : t("readAll")}>
                <span className="block text-[12.5px] leading-[20px]" style={{ color: p.you ? P.warm : P.ink }}>
                  {p.name}
                </span>
                <span className="mt-[3px] block text-[12px]" style={{ color: wide ? `rgb(${P.inkRgb} / 0.9)` : P.mute, transition: "color .4s ease" }}>
                  <Clip open={wide} n={open && !wide ? 0 : 2} lh={18} max={12}>
                    {p.you ? L.did : k != null ? said(t, L.rows[k]!.gist) : ""}
                  </Clip>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- everyone in the step

/**
 * Everyone in the step, as a dock. Each is on the page once the world has turned to them, marked while their part is
 * being worked out, and marked as new once it has come and until it has been told. Whoever is being told about (or
 * read again) is large, with what they did under their name, and is in the middle of the column; those next to them
 * are smaller, with a line of it; the rest are a face and a name, smaller and quieter the further off, and go out
 * at the top and the foot. So as the telling goes on the column climbs, and what has been told grows small above.
 * Whoever the pointer is on is large where they are: their top is held where it was when the pointer came onto them,
 * as they grow and those around them change, so nothing moves out from under the pointer (and the pointer is not
 * carried onto the next one by it). Pressing someone puts what they did where what is told is; their face opens who
 * they are.
 */
export function Dock({ L }: { L: Live }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const [over, setOver] = useState(-1);
  const col = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const came = (k: number) => L.done || L.beats[k]!.came <= L.pt;
  const here = L.people.filter((p) => L.done || p.from <= L.real).length;
  // who the column is about: whoever is being told about or read again; failing that, whoever it last was
  const told = L.people.findIndex((p) => p.ks.includes(L.peek >= 0 ? L.peek : L.bi));
  const last = useRef(0);
  if (told >= 0) last.current = told;
  const focus = told >= 0 ? told : Math.min(last.current, Math.max(0, here - 1));
  // the column is kept with whoever it is about in its middle, eased; while the pointer is in it, with whoever the
  // pointer is on where they were
  const live = useRef({ focus, over });
  live.current = { focus, over };
  useEffect(() => {
    let id = 0;
    let was = performance.now();
    let y = 0;
    let ready = false;
    /** Who the pointer is on, and where their top was in the column when it came onto them. */
    let held: { i: number; top: number } | null = null;
    const tick = (now: number) => {
      id = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - was) / 1000);
      was = now;
      const c = col.current;
      const l = list.current;
      const row = l?.children[live.current.focus] as HTMLElement | undefined;
      if (!c || !l || !row) return;
      const want = c.clientHeight / 2 - (row.offsetTop + row.offsetHeight / 2);
      const on = live.current.over >= 0 ? (l.children[live.current.over] as HTMLElement | undefined) : undefined;
      if (!on) held = null;
      if (!ready) {
        y = want;
        ready = true;
      } else if (on) {
        const h = held?.i === live.current.over ? held : (held = { i: live.current.over, top: y + on.offsetTop });
        y = h.top - on.offsetTop;
      } else y += (want - y) * (1 - Math.exp(-dt * 6));
      l.style.transform = `translateY(${y.toFixed(2)}px)`;
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="pointer-events-auto flex h-full flex-col">
      <Head>
        {t("sidesHere")} · {here}
      </Head>
      <div ref={col} className="relative mt-2 min-h-0 flex-1 overflow-hidden" onMouseLeave={() => setOver(-1)} style={{ WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%)", maskImage: "linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%)" }}>
        <div ref={list} className="absolute inset-x-0 top-0 flex flex-col" style={{ willChange: "transform" }}>
          {L.people.map((p, i) => {
            const known = L.done || p.from <= L.real;
            const got = p.ks.filter(came);
            const lastK = got[got.length - 1];
            const now = !L.done && L.peek < 0 && L.bi >= 0 && p.ks.includes(L.bi);
            const held = L.peek >= 0 && p.ks.includes(L.peek);
            const k = held ? L.peek : now ? L.bi : lastK;
            const fresh = !L.done && lastK != null && lastK > L.bi;
            const busy = !L.done && L.busy.has(p.name);
            // how large: 1 whoever it is about or the pointer is on; less, next to them; least, further off
            const far = Math.abs(i - focus);
            const w = i === over ? 1 : Math.max(far === 0 ? (over >= 0 ? 0.5 : 1) : far === 1 ? 0.5 : far === 2 ? 0.2 : 0, 0);
            const text = p.you ? L.did : k != null ? said(t, L.rows[k]!.gist) : "";
            return (
              <Fold key={p.name} open={known}>
                <div onMouseEnter={() => setOver(i)} className="flex items-start gap-2.5" style={{ paddingTop: 4 + 6 * w, paddingBottom: 4 + 6 * w, opacity: 0.5 + 0.5 * Math.min(1, w * 2.4 + (busy || fresh ? 0.5 : 0)), transition: `padding .4s ${SWIFT}, opacity .4s ease` }}>
                  <button type="button" onClick={() => p.body >= 0 && L.pick(p.body)} className="shrink-0" title={t("whoIsThis")} style={{ transform: `scale(${(0.8 + 0.42 * w).toFixed(3)})`, transformOrigin: "left top", marginRight: 6 * w, transition: `transform .4s ${SWIFT}, margin .4s ${SWIFT}` }}>
                    <FaceIcon kind={p.kind} size={18} />
                  </button>
                  <button type="button" onClick={() => lastK != null && L.onPeek(held ? -1 : lastK)} className="min-w-0 flex-1 text-left" title={lastK == null ? "" : held ? t("backToNow") : t("readAgainBelow")} style={{ cursor: lastK == null ? "default" : "pointer" }}>
                    <span className="flex items-baseline gap-2.5">
                      <span className="min-w-0" style={{ fontSize: 12 + 2.5 * w, lineHeight: "20px", fontWeight: w > 0.9 ? 500 : 400, color: p.you || now || held ? P.warm : P.ink, transition: "font-size .4s ease, color .4s ease" }}>
                        {p.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px]" style={{ color: P.mute, opacity: busy ? 1 : 0, transition: "opacity .5s ease" }}>
                        <span className="k-pulse h-[5px] w-[5px] rounded-full" style={{ background: P.warm }} />
                        {t("thinking")}
                      </span>
                      <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.ink, opacity: fresh && !busy ? 0.9 : 0, transition: "opacity .5s ease" }} title={t("cameNotTold")} />
                    </span>
                    <span className="block text-[12.5px]" style={{ marginTop: text && w >= 0.45 ? 3 : 0, color: w > 0.9 ? `rgb(${P.inkRgb} / 0.9)` : P.mute, transition: "color .4s ease, margin .4s ease" }}>
                      <Clip open={w > 0.9} n={w >= 0.45 && text ? 1 : 0} lh={19} max={7}>
                        {text}
                      </Clip>
                    </span>
                  </button>
                </div>
              </Fold>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- what is no one's doing

/**
 * What happens in the step that is no one's doing: what is left to odds and how it fell, what the world does of
 * itself, what comes next. Each is on the page once it has come, a line each; pressing one puts it where what is
 * told is.
 */
export function Events({ L, title }: { L: Live; title?: string }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const ks = L.rows.map((r, k) => (r.sec === "reaction" || r.sec === "move" ? -1 : k)).filter((k) => k >= 0);
  const here = ks.filter((k) => L.done || L.beats[k]!.came <= L.pt);
  return (
    <div className="pointer-events-auto flex flex-col">
      <Head>
        {title ?? t("happenedHere")}
        {here.length ? ` · ${here.length}` : ""}
      </Head>
      <div className="mt-1.5 flex flex-col">
        {ks.map((k) => {
          const b = L.beats[k]!;
          const r = L.rows[k]!;
          const known = L.done || b.came <= L.pt;
          const now = !L.done && L.peek < 0 && k === L.bi;
          const held = L.peek === k;
          const fresh = !L.done && k > L.bi;
          const it = b.c.purpose === "resolve_uncertain" ? b.c.detail.items?.[b.item ?? 0] : null;
          return (
            <Fold key={`${k}${b.key}`} open={known}>
              <button type="button" onClick={() => L.onPeek(held ? -1 : k)} className="turn-row flex w-full items-baseline gap-2.5 py-[6px] text-left" title={held ? t("backToNow") : t("readThis")}>
                <span className="w-[34px] shrink-0 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: 10.5, color: now || held ? P.warm : P.faint, transition: "color .4s ease" }}>
                  {SEC.has(r.sec) ? t(`sec.${r.sec}`) : r.sec}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[20px]" style={{ color: now || held ? P.ink : P.mute, transition: "color .4s ease" }}>
                  {it ? (it.chosen ?? it.question) : said(t, r.gist)}
                </span>
                <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.ink, opacity: fresh ? 0.9 : 0, transition: "opacity .5s ease" }} />
              </button>
            </Fold>
          );
        })}
      </div>
      <div className="text-[12px]" style={{ color: P.faint, opacity: here.length ? 0 : 1, height: here.length ? 0 : 18, overflow: "hidden", transition: "opacity .5s ease" }}>
        {t("noneYet")}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- what is told

type Part = [string, string, boolean?];

/** What there is to say of one thing told: who, what kind of thing, the sentence itself, and what more. */
function partsOf(t: T, b: Beat, gist: string) {
  const c = b.c;
  const D = c.detail;
  const some = (xs: (Part | false | null | undefined | "")[]) => xs.filter((x): x is Part => !!x);
  if (c.purpose === "person") {
    const quiet = D.quiet || !D.action;
    const act = quiet ? t("hold") : excerpt(D.action ?? "", 110);
    return { head: c.actor?.name ?? t("aSide"), tag: D.said ? t("says") : quiet ? t("holds") : t("does"), main: D.said ? excerpt(D.said, 110) : act, quote: !!D.said, parts: some([D.thinking && [t("thinks"), excerpt(D.thinking, 120)], D.said && [t("does"), act]]), outs: null };
  }
  if (c.purpose === "rule")
    return {
      head: t("yourMove"),
      tag: t("howItWasRead"),
      main: excerpt(D.restatement ?? "", 130),
      quote: false,
      parts: some([
        !!D.targets?.length && [t("sidesToDecide", { count: D.targets.length }), D.targets.join(t("listSep"))],
        !!D.settings?.length && [t("youSet"), D.settings[0]!.text],
        !!D.uncertain?.length && [t("leftToChance", { count: D.uncertain.length }), D.uncertain[0]!.question, true],
      ]),
      outs: null,
    };
  if (c.purpose === "resolve_uncertain") {
    const it = D.items?.[b.item ?? 0];
    const outs = (it?.outcomes ?? []).filter((o) => o.p > 0).slice(0, 4);
    const sum = outs.reduce((a, o) => a + o.p, 0) || 1;
    return { head: t("settledByOdds"), tag: (D.items?.length ?? 0) > 1 ? `${(b.item ?? 0) + 1} / ${D.items!.length}` : "", main: it?.question ?? "", quote: false, parts: some([it?.base && [t("basis"), excerpt(it.base, 110)]]), outs: outs.map((o) => ({ label: o.label, pct: Math.round((o.p / sum) * 100) as number | null, on: o.label === it?.chosen })) };
  }
  if (c.purpose === "moment") return { head: t("nextStep"), tag: t("worldWaits"), main: D.headline ?? "", quote: false, parts: some([D.why && [t("whyHere"), excerpt(D.why, 120)]]), outs: null };
  // (engine 12, told as it comes: what one side did in the stretch, on its day; a roll the protagonist can see, and only
  // which way it fell, never its odds; something looked up)
  if (c.purpose === TOLD12.happened) return { head: c.actor?.name ?? t("aSide"), tag: D.day ? md(D.day) : "", main: excerpt(D.action ?? "", 110), quote: false, parts: [] as Part[], outs: null };
  if (c.purpose === TOLD12.roll) {
    const it = D.items?.[0];
    return { head: t("settledByOdds"), tag: "", main: it?.question ?? "", quote: false, parts: [] as Part[], outs: it?.chosen ? [{ label: it.chosen, pct: null as number | null, on: true }] : null };
  }
  if (c.purpose === TOLD12.search) return { head: t("lookingUp"), tag: "", main: excerpt(gist, 110), quote: false, parts: [] as Part[], outs: null };
  // (something else the engine does on the way: said as the record says it)
  return { head: t("thisWorld"), tag: "", main: said(t, gist), quote: false, parts: [] as Part[], outs: null };
}

/**
 * What is being told, in a line and a sentence, set in the middle under the world: who, and to whom; then what they
 * said or did; and under that the first of what more there is to say of it, in a line or two (what went on in their
 * head; which way what was left to odds fell, and how likely that was). Before anything has come: what you did, and
 * that it is being read. `back`: this is something taken up to be read again, and the way back from it.
 */
export function Main({ L, k, to, fell = true, back }: { L: Live; /** Which thing told (-1: nothing has come). */ k: number; to: string | null; /** What was left to odds has fallen (which way it went is shown). */ fell?: boolean; back?: { label: string; go: () => void } | null }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const beat = L.beats[k] ?? null;
  const d = beat ? partsOf(t, beat, L.rows[k]?.gist ?? "") : null;
  const hit = d?.outs?.find((o) => o.on);
  return (
    <div className="pointer-events-auto">
      <Change id={beat ? beat.key : "first"}>
        <div className="flex flex-col items-center text-center">
          <div className="flex items-baseline gap-3">
            {back && (
              <button type="button" onClick={back.go} className="rounded-full px-2.5 py-[1px] text-[11px]" style={{ color: P.warm, boxShadow: `inset 0 0 0 1px rgb(${P.warmRgb} / 0.45)` }}>
                {t("lookingBack", { label: back.label })}
              </button>
            )}
            <span className="text-[13.5px] font-medium">
              {d ? d.head : t("yourMove")}
              {d && to && (
                <>
                  <span style={{ color: P.faint }}> → </span>
                  {to}
                </>
              )}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: P.warm }}>{d ? d.tag : L.working || t("reading")}</span>
          </div>
          <div className="mt-2.5 text-[19.5px] leading-[31px] font-medium">
            {d?.quote && "“"}
            {d ? d.main : excerpt(L.did, 110)}
            {d?.quote && "”"}
          </div>
          {d && (hit || d.parts[0]) && (
            <div className="mt-2.5 max-w-[560px] text-[12.5px] leading-[20px]" style={{ color: P.mute, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {hit ? (
                <span style={{ opacity: fell ? 1 : 0, transition: "opacity .7s ease" }}>
                  <span style={{ color: P.warm }}>{hit.label}</span>
                  {hit.pct != null && <span style={{ fontFamily: MONO, fontSize: 11.5 }}>{t("wasLikely", { pct: hit.pct })}</span>}
                </span>
              ) : (
                <>
                  <span style={{ color: d.parts[0]![2] ? P.warm : P.faint }}>{d.parts[0]![0]}
                    {"\u3000"}
                  </span>
                  {d.parts[0]![1]}
                </>
              )}
            </div>
          )}
        </div>
      </Change>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- how things stand

/** Lines of something, each a name and what there is to say of it: two lines of that until pressed, then all of it (and then the others are names only). */
export function Stand({ title, items }: { title: string; items: { name: string; text: string; warm?: boolean }[] }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const [open, setOpen] = useState(-1);
  return (
    <div className="pointer-events-auto flex flex-col">
      <Head>
        {title} · {items.length}
      </Head>
      <div className="mt-1.5 flex flex-col">
        {items.map((x, i) => (
          <button key={`${i}${x.name}`} type="button" onClick={() => setOpen(open === i ? -1 : i)} className="py-[6px] text-left" title={open === i ? t("hide") : t("readAll")}>
            <span className="block text-[12.5px] leading-[20px]" style={{ color: x.warm ? P.warm : P.ink }}>
              {x.name}
            </span>
            {x.text && (
              <span className="mt-[3px] block text-[12px]" style={{ color: open === i ? `rgb(${P.inkRgb} / 0.9)` : P.mute, transition: "color .4s ease" }}>
                <Clip open={open === i} n={open >= 0 && open !== i ? 0 : 2} lh={18} max={12}>
                  {x.text}
                </Clip>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- where the step is

/** Where the step is: what is being worked out now; and, when more has come than has been told, a way on to it. */
export function LiveLine({ L, centre = false }: { L: Live; /** Set in the middle (under the world). */ centre?: boolean }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const names = [...L.busy].filter((n) => n !== YOU);
  const behind = L.beats.filter((b, k) => k > L.bi && b.came <= L.pt).length;
  const shown = names.slice(0, 3).join(t("listSep"));
  const what = L.working || (names.length ? (names.length > 3 ? t("inferringMore", { names: shown, count: names.length }) : t("inferring", { names: shown })) : "");
  // (what was last said stays while it fades, so that the words do not go before the line does)
  const last = useRef(what);
  if (what) last.current = what;
  return (
    <div className={`pointer-events-auto flex h-6 items-center text-[12px] ${centre ? "justify-center" : ""}`}>
      <button type="button" onClick={L.next} className="flex shrink-0 items-baseline gap-2.5 overflow-hidden whitespace-nowrap" style={{ opacity: behind ? 1 : 0, maxWidth: behind ? 240 : 0, paddingRight: behind ? 28 : 0, pointerEvents: behind ? "auto" : "none", transition: "opacity .5s ease, max-width .5s ease, padding .5s ease" }}>
        <span style={{ color: P.ink }}>{t("next")}</span>
        <span style={{ color: P.mute }}>{rich(t("behind", { count: Math.max(1, behind) }), { n: (x) => <span style={{ fontFamily: MONO }}>{x}</span> })}</span>
      </button>
      <span className="flex min-w-0 items-center gap-2.5" style={{ color: P.mute, opacity: what ? 1 : 0, transition: "opacity .5s ease" }}>
        <span className="k-pulse h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.warm }} />
        <span className="min-w-0 truncate">{last.current}</span>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- engine twelve

/**
 * A play written by engine 12 (one model writing each stop) has none of the calls a step was told by: while a stop is
 * written it gives instead, as they come, what it looks up, the rolls the protagonist can see and what each side did in
 * the stretch. These are told in the middle the same way, one at a time and in the order they came, from a buffer at an
 * even pace (so that something new comes every second or two when there is a backlog, and nothing flashes past); and
 * the two columns keep the whole line: down the left the parties, down the right what happened, this stop's prominent
 * at the foot of each and the stops before it above, smaller and dimmer. Only the product has these (flow.tsx).
 */

/** The names the page gives the beats it makes of what engine 12 gives (no call of the engine has them). */
export const TOLD12 = { search: "told12_search", roll: "told12_roll", happened: "told12_happened" } as const;

/** One thing engine 12 has given while a stop is written: something looked up, a roll the protagonist can see, what one side did. */
export type Told12 = { key: string; kind: "search" | "roll" | "happened"; who: string; text: string; chosen: string; day: string; about: string | null };

/** What a stop being written has given so far: the lines on what is under way, and what each side did and the rolls. */
export type Coming = { msgs: string[]; live: StopLive | null };

/** A line on what is under way that says something is being looked up, and what. */
// (the Chinese form is the character for "look up", U+67E5, then a full-width or plain colon)
export const LOOKED = /^(?:\u67e5[\uff1a:]|Looking up:)\s*/;

/** How long one thing is held, with `behind` more waiting after it: long enough to be read, less while many wait, never so short it flashes past. */
function holdFor(x: Told12, behind: number) {
  const n = x.text.length;
  const base = x.kind === "search" ? 2200 : x.kind === "roll" ? Math.min(5200, 3000 + n * 28) : Math.min(5600, Math.max(2800, 1600 + n * 55));
  return Math.max(1600, base / (1 + 0.35 * behind));
}

/**
 * What a stop being written has given, told one at a time: each thing is taken in once, in the order it came (of
 * what came together, what was looked up, then the rolls, then what was done), and held for as long as it takes to
 * read before the next that has come takes its place. `run` begins it again (a new move); `held`, while someone is
 * looked at, stops it where it is.
 */
export function useTold12(run: number, coming: Coming | null, held: boolean) {
  type At = { run: number; items: Told12[]; seen: { msgs: number; rolls: number; happened: number }; cur: number; at: number; dur: number; shown: number[]; durs: number[]; last: number };
  const m = useRef<At | null>(null);
  if (!m.current || m.current.run !== run) m.current = { run, items: [], seen: { msgs: 0, rolls: 0, happened: 0 }, cur: -1, at: 0, dur: 0, shown: [], durs: [], last: Date.now() };
  const s = m.current;
  if (coming) {
    const { msgs, live } = coming;
    for (; s.seen.msgs < msgs.length; s.seen.msgs++) {
      const x = msgs[s.seen.msgs]!;
      if (LOOKED.test(x) && x.replace(LOOKED, "").trim()) s.items.push({ key: `s${s.seen.msgs}`, kind: "search", who: "", text: x.replace(LOOKED, "").trim(), chosen: "", day: "", about: null });
    }
    // (a stop asked for again starts its lists again: what was told of them stays told)
    const rolls = live?.rolls ?? [];
    s.seen.rolls = Math.min(s.seen.rolls, rolls.length);
    for (; s.seen.rolls < rolls.length; s.seen.rolls++) {
      const r = rolls[s.seen.rolls]!;
      s.items.push({ key: `r${s.items.length}`, kind: "roll", who: "", text: r.question ?? "", chosen: r.chosen ?? "", day: "", about: r.about ?? null });
    }
    const did = live?.happened ?? [];
    s.seen.happened = Math.min(s.seen.happened, did.length);
    for (; s.seen.happened < did.length; s.seen.happened++) {
      const h = did[s.seen.happened]!;
      s.items.push({ key: `h${s.items.length}`, kind: "happened", who: h.who ?? "", text: h.what ?? "", chosen: "", day: h.day ?? "", about: null });
    }
  }
  const now = Date.now();
  if (held) s.at += now - s.last;
  s.last = now;
  const step = () => {
    s.cur++;
    s.at = Date.now();
    s.dur = holdFor(s.items[s.cur]!, s.items.length - 1 - s.cur);
    s.shown.push(s.at);
    s.durs.push(s.dur);
  };
  if (!held && s.cur < s.items.length - 1 && (s.cur < 0 || now - s.at >= s.dur)) step();
  return { items: s.items, cur: s.cur, at: s.at, dur: s.dur, shown: s.shown, durs: s.durs, behind: s.items.length - 1 - s.cur, next: () => s.cur < s.items.length - 1 && step() };
}

/** A stop as the side columns read it: its day, what each side did in its stretch, who wrote to the protagonist, the rolls they can see. */
export type Leg = { day: string; happened: Happening[]; messages: Message[]; rolls: SeenRoll[] };

const keyOf = (x: string) => x.trim().toLowerCase();

/** A roll as a line: only which way it fell (after what was rolled, where that alone says little), never its odds. */
export const rollLine = (r: SeenRoll) => {
  // (what is in brackets, full-width or plain, is dropped, and a closing question mark or full stop, full-width or plain)
  const q = r.question.replace(/[\uff08(][^\uff09)]*[\uff09)]?/g, "").trim().replace(/[\uff1f?\u3002]$/, "");
  return r.chosen.length < 8 && q ? `${q} → ${r.chosen}` : r.chosen || q;
};

/** Something that grows into its place when it comes and folds away when it goes; where it was before, it glides from (see Column). */
function Grow({ k, gone, children }: { k: string; gone: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setOpen(true))));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div data-glide={k}>
      <Fold open={open && !gone}>{children}</Fold>
    </div>
  );
}

const EDGE = "linear-gradient(180deg, transparent 0, #000 22px, #000 calc(100% - 10px), transparent 100%)";

/**
 * A side column's list, in the room it has: what comes grows into its place, what goes folds away where it was, and
 * whatever changes place glides there; what does not fit scrolls within it, and what is newest (at the foot) is kept
 * in view as it comes unless it has been scrolled away from. Short, it stands in the middle of its room.
 */
function Column({ items }: { items: { k: string; node: React.ReactNode }[] }) {
  const kept = useRef<{ k: string; node: React.ReactNode; gone: number }[]>([]);
  const now = performance.now();
  const here = new Set(items.map((x) => x.k));
  const out = items.map((x) => ({ ...x, gone: 0 }));
  const prev = kept.current;
  prev.forEach((p, j) => {
    if (here.has(p.k)) return;
    const gone = p.gone || now;
    if (now - gone > 700) return;
    // (it goes where it was: after whichever of those before it is still there)
    let at = 0;
    for (let q = j - 1; q >= 0; q--) {
      const i = out.findIndex((y) => y.k === prev[q]!.k);
      if (i >= 0) {
        at = i + 1;
        break;
      }
    }
    out.splice(at, 0, { k: p.k, node: p.node, gone });
  });
  kept.current = out;
  // (what is folding away is let go once it has gone, whether or not anything else has changed by then)
  const [, drop] = useState(0);
  const going = out.some((x) => x.gone > 0);
  useEffect(() => {
    if (!going) return;
    const id = window.setTimeout(() => drop((n) => n + 1), 760);
    return () => window.clearTimeout(id);
  });
  const order = out.map((x) => x.k).join("|");
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = box.current;
    const c = inner.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(c);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const was = useRef<{ order: string; tops: Map<string, number> } | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const xs = [...el.querySelectorAll<HTMLElement>("[data-glide]")];
    const tops = new Map(xs.map((x) => [x.dataset.glide ?? "", x.offsetTop]));
    const w = was.current;
    if (w && w.order !== order)
      for (const x of xs) {
        const a = w.tops.get(x.dataset.glide ?? "");
        const b = tops.get(x.dataset.glide ?? "")!;
        if (a == null || Math.abs(a - b) < 1) continue;
        x.style.transition = "none";
        x.style.transform = `translateY(${a - b}px)`;
        void x.offsetHeight;
        x.style.transition = `transform .6s ${SWIFT}`;
        x.style.transform = "";
      }
    was.current = { order, tops };
  });
  return (
    <div ref={box} onScroll={(e) => (stick.current = e.currentTarget.scrollTop + e.currentTarget.clientHeight >= e.currentTarget.scrollHeight - 24)} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain", WebkitMaskImage: EDGE, maskImage: EDGE }}>
      <div ref={inner} className="relative flex min-h-full flex-col justify-center py-3">
        {out.map((x) => (
          <Grow key={x.k} k={x.k} gone={x.gone > 0}>
            {x.node}
          </Grow>
        ))}
      </div>
    </div>
  );
}

/** What the side columns need to know of the line: who the protagonist is (named as the notes name them), what kind of thing someone is, and their card. */
export type Sides = { you: string; kindOf: (name: string) => FaceKind; open: (name: string, at: DOMRect) => void };

/**
 * Down the left, the parties: of this stop (whoever did something in its stretch, wrote to the protagonist or was what
 * a roll was about), each with their face and under their name what they did, two lines until pressed; above them,
 * smaller and dimmer, a name each, those of the stops before who are not in this one, the longest gone at the top.
 * As a stop is written its parties come in as it gives them, and those of the stop it went on from step up above.
 * A name opens their card. `cast`: who is in the world, where nothing yet has anyone in it.
 */
export const Parties = memo(function Parties({ legs, cur, sides, cast = NONE }: { /** The stops before this one, oldest first. */ legs: Leg[]; /** This stop, as far as it has come (null: nothing of it yet). */ cur: Leg | null; sides: Sides; cast?: { name: string; text: string }[] }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const [wide, setWide] = useState<string | null>(null);
  const { you, kindOf, open } = sides;
  const rows = useMemo(() => {
    const mine = (n: string) => n === YOU || n === LEAD || (!!you && keyOf(n) === keyOf(you));
    const norm = (n: string) => (mine(n.trim()) ? YOU : n.trim());
    const same = (a: string, b: string) => keyOf(norm(a)) === keyOf(norm(b));
    const all = cur ? [...legs, cur] : legs;
    const at = new Map<string, { name: string; leg: number; pos: number; deed: string }>();
    all.forEach((l, i) => {
      const names: string[] = [];
      for (const n of [...l.happened.map((h) => h.who), ...l.messages.map((x) => x.from), ...l.rolls.map((r) => r.about ?? "")]) {
        const x = norm(n);
        if (x && !names.some((y) => keyOf(y) === keyOf(x))) names.push(x);
      }
      names.forEach((n, pos) => {
        const did = l.happened.filter((h) => same(h.who, n)).map((h) => h.what.trim()).filter(Boolean);
        const wrote = l.messages.find((x) => same(x.from, n));
        const rolled = l.rolls.find((r) => !!r.about && same(r.about, n));
        at.set(keyOf(n), { name: n, leg: i, pos, deed: did.length ? did.join(t("deedSep")) : wrote ? t("wrote", { gist: wrote.gist }) : rolled ? rollLine(rolled) : "" });
      });
    });
    const xs = [...at.values()].sort((a, b) => a.leg - b.leg || a.pos - b.pos).map((x) => ({ ...x, now: !!cur && x.leg === legs.length, you: x.name === YOU }));
    if (!xs.length) return cast.map((c, pos) => ({ name: c.name, leg: 0, pos, deed: c.text, now: true, you: false }));
    return xs;
  }, [legs, cur, you, cast, t]);
  const empty = !legs.length && !cur?.happened.length && !cur?.messages.length && !cur?.rolls.length;
  const n = rows.filter((r) => r.now).length;
  const row = (r: (typeof rows)[number]) => {
    const w = r.now && wide === r.name;
    return (
      <div className="flex items-start gap-2.5" style={{ paddingTop: r.now ? 6 : 2, paddingBottom: r.now ? 6 : 2, opacity: r.now ? 1 : 0.62, transition: `padding .5s ${SWIFT}, opacity .5s ease` }}>
        <button type="button" onClick={(e) => !r.you && open(r.name, e.currentTarget.getBoundingClientRect())} className="mt-[1px] shrink-0" title={r.you ? undefined : t("seePerson")} style={{ cursor: r.you ? "default" : "pointer", transform: `scale(${r.now ? 1 : 0.76})`, transformOrigin: "left top", marginRight: r.now ? 0 : -4, transition: `transform .5s ${SWIFT}, margin .5s ${SWIFT}` }}>
          <FaceIcon kind={r.you ? "self" : kindOf(r.name)} size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={(e) => !r.you && open(r.name, e.currentTarget.getBoundingClientRect())} className="block max-w-full truncate text-left" title={r.you ? undefined : t("seePerson")} style={{ cursor: r.you ? "default" : "pointer", fontSize: r.now ? 12.5 : 11.5, lineHeight: r.now ? "20px" : "18px", color: r.you ? P.warm : r.now ? P.ink : P.mute, transition: "font-size .5s ease, line-height .5s ease, color .5s ease" }}>
            {r.you ? t("you") : r.name}
          </button>
          <Fold open={r.now && !!r.deed}>
            <button type="button" onClick={() => setWide(w ? null : r.name)} className="mt-[3px] block w-full text-left text-[12px]" title={w ? t("hide") : t("readAll")} style={{ color: w ? `rgb(${P.inkRgb} / 0.9)` : P.mute, transition: "color .4s ease" }}>
              <Clip open={w} n={wide && !w ? 1 : 2} lh={18} max={12}>
                {r.deed}
              </Clip>
            </button>
          </Fold>
        </div>
      </div>
    );
  };
  const head = (
    <div className="pt-3 pb-1">
      <Head>
        {empty && rows.length ? t("sidesInWorld") : t("sidesHere")} · {n}
      </Head>
    </div>
  );
  const items = [
    ...rows.filter((r) => !r.now).map((r) => ({ k: `p:${keyOf(r.name)}`, node: row(r) })),
    { k: "head", node: head },
    ...rows.filter((r) => r.now).map((r) => ({ k: `p:${keyOf(r.name)}`, node: row(r) })),
    ...(n ? [] : [{ k: "none", node: <Nothing /> }]),
  ];
  return (
    <div className="pointer-events-auto flex h-full min-h-0 flex-col">
      <Column items={items} />
    </div>
  );
});

const NONE: { name: string; text: string }[] = [];

const Nothing = () => {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  return (
    <div className="py-1 text-[12px]" style={{ color: P.faint }}>
      {t("noneYet")}
    </div>
  );
};

/**
 * Down the right, what happened: of this stop, what each side did in its stretch (who, the day, what: two lines until
 * pressed) and which way each roll the protagonist can see fell (never its odds), in order; above them, smaller and
 * dimmer, those of the stops before, each under its day. As a stop is written its lines come in as it gives them.
 */
export const Happenings = memo(function Happenings({ legs, cur, sides }: { legs: Leg[]; cur: Leg | null; sides: Sides }) {
  const { P } = useApp();
  const t = useT("flow-lab.turns");
  const [wide, setWide] = useState<string | null>(null);
  const { you, open } = sides;
  const mine = (n: string) => n === YOU || n === LEAD || (!!you && keyOf(n) === keyOf(you));
  const line = (k: string, now: boolean, who: string, day: string, text: string, roll: boolean) => {
    const w = now && wide === k;
    const me = !!who && mine(who);
    const name = who ? (me ? t("you") : who.trim()) : "";
    // (of this stop: who, on a line of their own with the day, and what, on two lines until pressed; of a stop before,
    // one line: who, quietly, then what. The one folds into the other)
    return (
      <div style={{ paddingTop: now ? 5 : 1.5, paddingBottom: now ? 5 : 1.5, opacity: now ? 1 : 0.6, transition: `padding .5s ${SWIFT}, opacity .5s ease` }}>
        {!roll && (
          <Fold open={now}>
            <div className="flex min-w-0 items-baseline gap-2">
              <button type="button" onClick={(e) => !me && open(who, e.currentTarget.getBoundingClientRect())} className="min-w-0 truncate text-left text-[12.5px] leading-[20px]" title={me ? undefined : t("seePerson")} style={{ color: me ? P.warm : P.ink, cursor: me ? "default" : "pointer" }}>
                {name}
              </button>
              {day && (
                <span className="ml-auto shrink-0" style={{ fontFamily: MONO, fontSize: 10, color: P.faint }}>
                  {md(day)}
                </span>
              )}
            </div>
          </Fold>
        )}
        <button type="button" onClick={() => now && setWide(w ? null : k)} className="block w-full text-left" title={now ? (w ? t("hide") : t("readAll")) : undefined} style={{ marginTop: now && !roll ? 2 : 0, fontSize: now ? 12 : 11, color: w ? `rgb(${P.inkRgb} / 0.9)` : now ? `rgb(${P.inkRgb} / 0.72)` : P.mute, transition: "font-size .5s ease, color .4s ease, margin .5s ease", cursor: now ? "pointer" : "default" }}>
          <Clip open={w} n={now ? 2 : 1} lh={now ? 18 : 16} max={12}>
            {roll ? (
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint }}>
                {t("chance")}
                {"\u3000"}
              </span>
            ) : (
              <span className="inline-block overflow-hidden align-top whitespace-nowrap" style={{ maxWidth: now ? 0 : 120, opacity: now ? 0 : 1, textOverflow: "ellipsis", color: me ? P.warm : P.faint, transition: `max-width .5s ${SWIFT}, opacity .5s ease` }}>
                {name}
                {"\u3000"}
              </span>
            )}
            {text}
          </Clip>
        </button>
      </div>
    );
  };
  const all = cur ? [...legs, cur] : legs;
  const items: { k: string; node: React.ReactNode }[] = [];
  let count = 0;
  all.forEach((l, i) => {
    const now = !!cur && i === legs.length;
    const lines = [
      ...l.happened.filter((h) => h.what.trim()).map((h, j) => ({ k: `${i}:h${j}`, node: line(`${i}:h${j}`, now, h.who, h.day, h.what.trim(), false) })),
      ...l.rolls.map((r, j) => ({ k: `${i}:r${j}`, node: line(`${i}:r${j}`, now, "", "", rollLine(r), true) })),
    ];
    if (now) {
      count = lines.length;
      items.push({ k: "head", node: <Heading n={lines.length} /> });
    } else if (lines.length && l.day)
      items.push({
        k: `${i}:day`,
        node: (
          <div className="pt-2.5 pb-0.5" style={{ fontFamily: MONO, fontSize: 10, color: P.faint }}>
            {md(l.day)}
          </div>
        ),
      });
    items.push(...lines);
  });
  if (!cur) items.push({ k: "head", node: <Heading n={0} /> });
  if (!count) items.push({ k: "none", node: <Nothing /> });
  return (
    <div className="pointer-events-auto flex h-full min-h-0 flex-col">
      <Column items={items} />
    </div>
  );
});

const Heading = ({ n }: { n: number }) => {
  const t = useT("flow-lab.turns");
  return (
    <div className="pt-3 pb-1">
      <Head>
        {t("happenedHere")}
        {n ? ` · ${n}` : ""}
      </Head>
    </div>
  );
};
