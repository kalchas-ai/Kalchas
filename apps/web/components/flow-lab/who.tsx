"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { WorldView } from "@kalchas/core";
import { MONO } from "@/components/kit/fonts";
import { api, useApp } from "@/components/product/shell";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Stream } from "@/lib/stream";
import { drawBadge, faceKind, type FaceKind } from "./faces";
import { CROWD, type Body, type Score } from "./score";

/**
 * Who someone in the world is, on a card beside them, when their face is taken hold of: what kind of thing they
 * are, what the world says of them in a line or two, how they were drawn (each trait and what it came out as),
 * the weightiest things known of them and where from, and who they are tied to (each of whom can be gone to from
 * here). Everything on it is what the world already holds; nothing is asked for. It fits without scrolling.
 */

/** What kind of thing someone is, in a word ("Person", "Institution"), in the interface language. */
export function useKindName(): (k: FaceKind) => string {
  const t = useT("flow-lab.who");
  return useMemo(() => (k: FaceKind) => t(`kind.${k}`), [t]);
}

// How the engine marks what it wrote of someone while building the world (Chinese markers, matched as written):
// a trait drawn for them starts with "\u4eba\u8bbe" (profile) or "\u6027\u683c" (character); a fact is headed "\u4e8b\u5b9e" (fact),
// and the setup of the play, kept as a fact too, starts with "\u5173\u4e8e\u8fd9\u6b21\u63a8\u6f14\u7684\u8bbe\u5b9a" (about the setup of this play).
const TRAIT = /^(\u4eba\u8bbe|\u6027\u683c)/;
const FACT = "\u4e8b\u5b9e";
const SETUP = /^(\u5173\u4e8e\u8fd9\u6b21\u63a8\u6f14\u7684\u8bbe\u5b9a|About the setup of this play)/;

/** How faces are drawn, here and in the picture (see faces.ts): set by whoever shows the flow. */
export const FaceStyle = createContext(1);

/** A face, drawn small on the page (the same drawing as in the picture). */
export function FaceIcon({ kind, size = 34 }: { kind: FaceKind; size?: number }) {
  const style = useContext(FaceStyle);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const box = size * 1.5;
    c.width = Math.round(box * d);
    c.height = Math.round(box * d);
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, box, box);
    drawBadge(g, kind, box / 2, box / 2, size / 2, style);
  }, [kind, size, style]);
  const box = size * 1.5;
  return <canvas ref={ref} className="shrink-0" style={{ width: box, height: box, margin: -size * 0.25 }} />;
}

type Person = { known: { id: string; date: string; text: string }[]; lastSeen: { simTime: string; title: string } | null; fog: number };

export function Who({ innerRef, body, world, stream, score, onPick, onClose, branch }: { innerRef: React.RefObject<HTMLDivElement | null>; body: Body; world: WorldView; stream: Stream; score: Score; onPick: (i: number) => void; onClose: () => void; /** In a play: what you know of them on this line of time, what they last did, and whether they know what you do not. */ branch?: string }) {
  const { P } = useApp();
  const t = useT("flow-lab.who");
  const locale = useLocale();
  const kindName = useKindName();
  const [person, setPerson] = useState<Person | null>(null);
  useEffect(() => {
    if (!branch || body.kind === CROWD || body.seat || body.risk || body.seed) return;
    let live = true;
    api<Person>(`/branches/${branch}/people/${body.id}`).then((x) => live && setPerson(x)).catch(() => {});
    return () => {
      live = false;
    };
  }, [branch, body]);
  const crowd = body.kind === CROWD;
  const kind = faceKind({ seat: body.seat, ent: body.ent, crowd });
  const d = useMemo(() => {
    const node = world.graph.nodes.find((n) => n.id === body.id);
    const seg = crowd ? stream.segments.find((s) => `crowd:${s.id}` === body.id) : undefined;
    const traits = stream.events
      .filter((e) => e.act === "draw" && e.who === body.id && e.phase === "build" && TRAIT.test(e.head) && e.picked)
      .map((e) => ({ name: e.head.split(" · ").slice(1).join(" · ") || e.head, value: e.picked ?? "" }))
      .slice(0, 5);
    const facts = stream.events
      // (how the play was set up is kept as facts too: those say nothing of who someone is)
      .filter((e) => e.head === FACT && e.who === body.id && !SETUP.test(e.text))
      .sort((a, b) => b.w - a.w)
      .slice(0, 2)
      // (a fact is cut at its first full-width colon, U+FF1A)
      .map((e) => ({ text: e.text.split("\uff1a")[0]!.trim() || e.text, source: e.source ?? "" }));
    const byId = new Map(score.bodies.map((b) => [b.id, b]));
    const ties = world.graph.edges
      .filter((e) => e.from === body.id || e.to === body.id)
      .map((e) => ({ other: byId.get(e.from === body.id ? e.to : e.from), label: e.label }))
      .filter((t, i, xs): t is { other: Body; label: string } => !!t.other && xs.findIndex((x) => x.other === t.other) === i)
      .slice(0, 4);
    const nameOf = (b: Body) => world.graph.nodes.find((n) => n.id === b.id)?.name ?? b.name;
    return { name: seg?.name ?? node?.name ?? body.name, summary: seg ? seg.cares : (node?.summary ?? ""), basis: seg?.basis ?? "", traits, facts, ties, nameOf };
  }, [body, crowd, world, stream, score]);
  const label = { fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", color: P.faint } as const;
  // the card says a little of each thing until it is asked for all of it: then nothing on it is cut short
  const [full, setFull] = useState(false);
  useEffect(() => setFull(false), [body.id]);
  const clamp = (n: number) => (full ? {} : { display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical" as const, overflow: "hidden" });
  return (
    <div
      ref={innerRef}
      className="absolute top-0 left-0 z-[40] w-[316px] rounded-[18px] px-[18px] pt-4 pb-[14px] backdrop-blur-xl"
      style={{ background: `rgb(${P.pageRgb} / 0.9)`, boxShadow: `0 30px 80px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(${P.inkRgb} / 0.1)`, opacity: 0, transition: "opacity .35s ease", cursor: "default" }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        <FaceIcon kind={kind} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] leading-[1.35] font-medium" style={{ color: body.seat ? P.warm : P.ink, ...clamp(2) }}>
            {d.name}
          </div>
          <div className="mt-[3px] truncate text-[11.5px]" style={{ color: P.mute }}>
            {body.seat ? t("seatLine") : body.force ? t("forceLine") : crowd ? t("crowdLine", { kind: kindName(kind), count: body.size ?? 0, n: (body.size ?? 0).toLocaleString(locale) }) : body.facts ? t("factsLine", { kind: kindName(kind), count: body.facts }) : kindName(kind)}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={t("close")} className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px]" style={{ color: P.mute }}>
          ×
        </button>
      </div>

      {d.summary && (
        <div className="mt-3 text-[12.5px] leading-[1.6]" style={{ color: P.ink, opacity: 0.86, ...clamp(3) }}>
          {d.summary}
        </div>
      )}
      {d.basis && (
        <div className="mt-2 text-[11px] leading-[1.5]" style={{ color: P.mute, ...clamp(2) }}>
          {d.basis}
        </div>
      )}

      {(d.summary.length > 60 || d.basis.length > 40 || d.name.length > 14 || d.facts.length > 0) && (
        <button type="button" onClick={() => setFull((x) => !x)} className="mt-2 text-[11px]" style={{ color: P.mute, cursor: "pointer" }}>
          {full ? t("hide") : t("showAll")}
        </button>
      )}

      {d.traits.length > 0 && (
        <div className="mt-[14px]">
          <div style={label}>{t("profile")}</div>
          <div className="mt-[7px] flex flex-col gap-[5px]">
            {d.traits.map((x) => (
              <div key={x.name} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="shrink-0" style={{ color: P.mute }}>
                  {x.name}
                </span>
                <span className="truncate text-right" style={{ color: P.ink }}>
                  {x.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.facts.length > 0 && (
        <div className="mt-[14px]">
          <div style={label}>{t("known")}</div>
          <div className="mt-[7px] flex flex-col gap-[7px]">
            {d.facts.map((f) => (
              <div key={f.text} className="text-[12px] leading-[1.5]" style={{ color: P.ink, opacity: 0.86 }}>
                <span style={clamp(2)}>{f.text}</span>
                {f.source && <span style={{ fontFamily: MONO, fontSize: 9.5, color: P.faint }}>{f.source}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {person && (person.lastSeen || person.fog > 0 || person.known.length > 0) && (
        <div className="mt-[14px]" style={{ animation: "flow-rise .5s cubic-bezier(.2,.7,.2,1) both" }}>
          <div style={label}>{t("inThisPlay")}</div>
          <div className="mt-[7px] flex flex-col gap-[6px] text-[12px] leading-[1.5]">
            {person.lastSeen && (
              <div style={{ color: P.ink, opacity: 0.86 }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: P.faint }}>{person.lastSeen.simTime.slice(5)} </span>
                <span style={clamp(2)}>{person.lastSeen.title}</span>
              </div>
            )}
            {!d.facts.length &&
              person.known.slice(0, 2).map((k) => (
                <div key={k.id} style={{ color: P.ink, opacity: 0.86, ...clamp(2) }}>
                  {k.text}
                </div>
              ))}
            {person.fog > 0 && <div style={{ color: P.warm }}>{t("fog", { count: person.fog })}</div>}
          </div>
        </div>
      )}

      {d.ties.length > 0 && (
        <div className="mt-[14px]">
          <div style={label}>{t("ties")}</div>
          <div className="mt-[5px] flex flex-col">
            {d.ties.map((x) => (
              <button key={x.other.i} type="button" onClick={() => onPick(x.other.i)} className="-mx-2 flex items-center gap-[9px] rounded-[10px] px-2 py-[5px] text-left transition-colors duration-200 hover:bg-white/[0.05]">
                <FaceIcon kind={faceKind({ seat: x.other.seat, ent: x.other.ent, crowd: x.other.kind === CROWD })} size={18} />
                <span className="max-w-[112px] shrink-0 truncate text-[12px]" style={{ color: x.other.seat ? P.warm : P.ink }}>
                  {x.other.seat ? t("you") : d.nameOf(x.other)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: P.mute }}>
                  {x.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
