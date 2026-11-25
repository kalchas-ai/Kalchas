"use client";

import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StopRecord } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { useApp } from "@/components/product/shell";
import { useT } from "@/lib/i18n/client";
import { md, type Play } from "./data";

/**
 * The people and bodies the protagonist knows, wherever their names come up in what is read on the play page: each
 * name a little brighter than the words round it and finely underlined, and pressing it opens what the protagonist
 * knows of them. Without it a name met while deciding is only a name, and who it is has to be remembered.
 *
 * Only what the protagonist knows is ever shown: the roster as the play gives it (each with what they know of them),
 * and what each did or sent in the stops so far, as the protagonist saw it.
 */

/** The play whose names are marked, for what is drawn by a page that is not handed it (the ways to go, under FlowV2). */
export const NamesPlay = createContext<Play | null>(null);

/** The names a play's text can say, each to the one it names (null: the protagonist's own, never marked, and never found inside). */
type Names = { re: RegExp | null; of: Map<string, string | null> };

/** A name as it is said: without what is in brackets (plain or full-width \uff08 \uff09), and the first of several. */
const bare = (n: string) => n.replace(/[\uff08(][^\uff09)]*[\uff09)]/g, "").split("/")[0]!.trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDY = /[A-Za-z0-9]/;
/** What a stop may write for the protagonist where a name would be (in Chinese: "you", "I", "the protagonist"). */
const SELF = new Set(["\u4f60", "\u6211", "\u4e3b\u89d2", "you", "me"]);

/**
 * The stops so far, oldest first. A play from before stops were kept has only the one it stands at, as its situation
 * holds it.
 */
export function stopsOf(play: Play): StopRecord[] {
  const kept = play.stops ?? [];
  const s = play.situation;
  if (kept.length || !s || (!s.happened?.length && !s.messages?.length)) return kept;
  return [{ step: play.branch.step, day: s.day, headline: s.headline, happened: s.happened ?? [], messages: s.messages ?? [], rolls: [] }];
}

// (one reading of a play's names for every piece of text on the page that marks them: a play comes again as a new
// object each time it is read, so this is never stale)
const read = new WeakMap<Play, Names>();

function namesOf(play: Play): Names {
  const had = read.get(play);
  if (had) return had;
  const of = new Map<string, string | null>();
  const put = (said: string, who: string | null) => {
    const k = said.trim();
    if (k.length < 2 || SELF.has(k.toLowerCase()) || of.get(k) === null) return;
    if (who === null || !of.has(k)) of.set(k, who);
  };
  const seat = play.graph.nodes.find((n) => n.id === play.seatId);
  if (seat) for (const s of [seat.name, bare(seat.name), ...seat.aliases]) put(s, null);
  for (const n of play.graph.nodes) if (n !== seat) for (const s of [n.name, bare(n.name), ...n.aliases]) put(s, n.name.trim());
  // (whoever a stop says did something or sent something, by the name it gives them: the one on the roster where it is
  // one of theirs, otherwise as it is given)
  const said = stopsOf(play).flatMap((r) => [...r.happened.map((h) => h.who), ...r.messages.map((m) => m.from)]);
  for (const s of [...said, ...(play.situation?.happened ?? []).map((h) => h.who), ...(play.situation?.messages ?? []).map((m) => m.from)]) {
    const k = s.trim();
    const own: string | null = of.has(k) ? (of.get(k) ?? null) : of.has(bare(k)) ? (of.get(bare(k)) ?? null) : k;
    put(k, own);
    put(bare(k), own);
  }
  // longest first, so that a name is never found inside a longer one; a name in letters only as a whole word
  const keys = [...of.keys()].sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(keys.map((k) => `${WORDY.test(k[0]!) ? "(?<![A-Za-z0-9])" : ""}${esc(k)}${WORDY.test(k.at(-1)!) ? "(?![A-Za-z0-9])" : ""}`).join("|"), "g") : null;
  const out = { re, of };
  read.set(play, out);
  return out;
}

type Piece = string | { said: string; who: string };

function piecesOf(text: string, N: Names): Piece[] {
  if (!N.re || !text) return [text];
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(N.re)) {
    const who = N.of.get(m[0]);
    if (!who) continue;
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push({ said: m[0], who });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** Where text that is still coming can be cut, at `k` or just before it, without cutting a name in two. */
export function cutBefore(play: Play, text: string, k: number): number {
  const N = namesOf(play);
  if (!N.re || k <= 0 || k >= text.length) return k;
  for (const m of text.matchAll(N.re)) {
    if (m.index >= k) break;
    if (m.index + m[0].length > k) return m.index;
  }
  return k;
}

/** Whom a piece of text names (the one each name it holds is of). */
function whoIn(text: string, N: Names): Set<string> {
  return new Set(piecesOf(text, N).flatMap((p) => (typeof p === "string" ? [] : [p.who])));
}

// (what is pressed, typed or scrolled on a card is the card's own: a card is drawn elsewhere in the page, but what is
// done on it would otherwise reach whatever holds the name it was opened from, such as a way to go, which it would pick)
const own = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Text with the names of those the protagonist knows marked, each opening its card when pressed (pressing it does
 * nothing else: in a way to go, it does not pick the way).
 */
export function NamedText({ text, play }: { text: string; play: Play }) {
  const { P } = useApp();
  const pieces = useMemo(() => piecesOf(text, namesOf(play)), [text, play]);
  const [open, setOpen] = useState<{ id: number; who: string; at: DOMRect }[]>([]);
  const n = useRef(0);
  const press = (e: React.SyntheticEvent<HTMLElement>, who: string) => {
    e.stopPropagation();
    e.preventDefault();
    const at = e.currentTarget.getBoundingClientRect();
    // (pressed again while its card is up: the card has already begun to go, as on any press outside it)
    setOpen((o) => (o.some((c) => c.who === who) ? o : [...o, { id: ++n.current, who, at }]));
  };
  if (pieces.length === 1 && typeof pieces[0] === "string") return <>{text}</>;
  return (
    <>
      {pieces.map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={(e) => press(e, p.who)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && press(e, p.who)}
            className="cursor-pointer underline decoration-1 underline-offset-[0.28em] transition-[text-decoration-color] duration-200 decoration-[color:rgb(var(--k-ink)/0.3)] hover:decoration-[color:rgb(var(--k-ink)/0.75)]"
            style={{ color: P.ink }}
          >
            {p.said}
          </span>
        ),
      )}
      {open.map((c) => (
        <PersonCard key={c.id} play={play} name={c.who} at={c.at} onClose={() => setOpen((o) => o.filter((x) => x.id !== c.id))} />
      ))}
    </>
  );
}

/**
 * What the protagonist knows of someone: the name, what they know of them, and what they did or sent in the stops so
 * far, the latest first. It comes and goes by fading, and goes on a press outside it, on Esc, or when the page under
 * it is scrolled; `onClose` is called once it has gone.
 */
export function PersonCard({ play, name, onClose, at = null }: { play: Play; name: string; onClose: () => void; /** The name it was opened from, to stand beside; without it, the card stands in the middle of the window. */ at?: DOMRect | null }) {
  const { P } = useApp();
  const t = useT("product.replay.stage.names");
  const box = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [seen, setSeen] = useState(false);
  const done = useRef(onClose);
  done.current = onClose;
  const going = useRef(0);
  const close = () => {
    if (going.current) return;
    setSeen(false);
    going.current = window.setTimeout(() => done.current(), 260);
  };

  const N = namesOf(play);
  const node = play.graph.nodes.find((x) => x.id !== play.seatId && [x.name, bare(x.name), ...x.aliases].some((k) => k.trim() === name.trim()));
  // (as the names in text are read: whoever a stop's line names is the one on the roster where it is one of theirs)
  const who = node ? node.name.trim() : (N.of.get(name.trim()) ?? name.trim());
  const rows = useMemo(() => {
    const out: { day: string; text: string; sent: boolean; i: number }[] = [];
    for (const r of stopsOf(play)) {
      for (const h of r.happened) if (whoIn(h.who, N).has(who)) out.push({ day: h.day || r.day, text: h.what, sent: false, i: out.length });
      for (const m of r.messages) if (whoIn(m.from, N).has(who)) out.push({ day: m.day || r.day, text: m.gist, sent: true, i: out.length });
    }
    return out.sort((a, b) => b.day.localeCompare(a.day) || b.i - a.i);
  }, [play, who, N]);

  // (drawn in the product's own frame, so that it has its type and colours, above everything on the page)
  useEffect(() => setHost(document.querySelector(".kprod") ?? document.body), []);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!at) return setPos({ left: Math.round((W - w) / 2), top: Math.max(16, Math.round((H - h) / 2 - H * 0.06)) });
    const left = Math.max(16, Math.min(W - w - 16, at.left - 18));
    const top = at.bottom + 10 + h <= H - 16 ? at.bottom + 10 : Math.max(16, at.top - 10 - h);
    setPos({ left: Math.round(left), top: Math.round(top) });
  }, [host, at]);
  useEffect(() => {
    if (!pos) return;
    const id = window.setTimeout(() => setSeen(true), 20);
    return () => window.clearTimeout(id);
  }, [pos]);

  useEffect(() => {
    if (!host) return;
    const inside = (t: EventTarget | null) => t instanceof Node && !!box.current?.contains(t);
    const down = (e: PointerEvent) => !inside(e.target) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    // (scrolled by hand under it: what it stood beside has moved. A page following what is being written as it
    // comes does not take it away)
    const wheel = (e: Event) => !inside(e.target) && close();
    // (both before the page has them: what is done on the card is kept from the page, see `own`)
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: true });
    window.addEventListener("touchmove", wheel, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", wheel, true);
      window.removeEventListener("touchmove", wheel, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);
  useEffect(() => () => window.clearTimeout(going.current), []);

  if (!host) return null;
  const known = node?.summary.trim() ?? "";
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={node?.name ?? name}
      className="fixed z-[70] flex w-[344px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[18px]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: "min(460px, 72vh)", background: `rgb(${P.pageRgb} / 0.97)`, boxShadow: `0 24px 70px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(${P.inkRgb} / 0.1)`, color: P.ink, opacity: seen ? 1 : 0, transform: seen ? "none" : "translateY(4px)", transition: "opacity .26s ease, transform .3s cubic-bezier(.2,.7,.2,1)", pointerEvents: seen ? "auto" : "none" }}
      onClick={own}
      onPointerDown={own}
      onPointerUp={own}
      onMouseDown={own}
      onDoubleClick={own}
      onKeyDown={own}
      onFocus={own}
      onWheel={own}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0 text-[17px] leading-[1.4] font-medium">{node?.name ?? name}</div>
        <button type="button" aria-label={t("hide")} onClick={close} className="-mt-0.5 -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px]" style={{ color: P.mute }}>
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-5">
        {known && (
          <>
            <div className="text-[11.5px]" style={{ color: P.faint }}>
              {t("known")}
            </div>
            <p className="mt-1 text-[13.5px] leading-[1.7]" style={{ color: `rgb(${P.inkRgb} / 0.88)` }}>
              {known}
            </p>
          </>
        )}
        {rows.length > 0 && (
          <div className={known ? "mt-4" : ""}>
            <div className="flex items-baseline justify-between text-[11.5px]" style={{ color: P.faint }}>
              <span>{t("inThisPlay")}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5 }}>{rows.length}</span>
            </div>
            <div className="mt-1">
              {rows.map((r) => (
                <div key={r.i} className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-2.5 py-[5px]">
                  <span className="pt-[3px]" style={{ fontFamily: MONO, fontSize: 10.5, color: P.faint, fontVariantNumeric: "tabular-nums" }}>
                    {r.day ? md(r.day) : ""}
                  </span>
                  <span className="text-[13px] leading-[1.65]" style={{ color: `rgb(${P.inkRgb} / 0.84)` }}>
                    {r.sent && <span style={{ color: P.mute }}>{t("sent")}</span>}
                    {r.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!known && !rows.length && (
          <p className="text-[13px] leading-[1.7]" style={{ color: P.mute }}>
            {t("nothingKnown")}
          </p>
        )}
      </div>
    </div>,
    host,
  );
}
