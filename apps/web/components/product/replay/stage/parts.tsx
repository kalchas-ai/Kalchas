"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MONO, type Pal } from "@/components/kit/palette";
import { useSize } from "@/components/kit/dither";
import { Sky } from "@/components/sky/sky";
import { layout, netLevels, netScene, pick, type Box, type Placed } from "@/components/product/replay/net";
import { day, ending, usd } from "@/components/product/shell";
import { lastEvents, md, numsOf, short, whoOf, type Data, type Play } from "./data";
import { useLocale, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";

/** Pieces the three drafts share: the web behind, the box you act in, the time track, what happened in a step. */

export type SimProps = {
  d: Data;
  P: Pal;
  /** Say something instead of doing it (nothing is played in the drafts). */
  demo: (msg: string) => void;
  /** Show what came of the last step, as the page would after a step. */
  outcome: () => void;
  /** Switch to another timeline. */
  go: (branchId: string) => void;
};

/* ---------------------------------------------------------------- the web of people */

export function useWeb(play: Play, box: (w: number, h: number) => Box, hot: Set<string>, opt: { picked?: string | null; dim?: number; wave?: number | null } = {}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const seat = play.seatId;
  const nodes = useMemo(() => pick(play.graph, seat, new Set(Object.keys(play.fog))), [play.graph, seat, play.fog]);
  const b = w ? box(w, h) : null;
  const key = b ? `${b.x0}|${b.x1}|${b.y0}|${b.y1}` : "";
  const placed = useMemo<Map<string, Placed>>(() => (b ? layout(nodes, play.graph.edges, seat, b) : new Map()), [nodes, play.graph.edges, seat, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useMemo(() => (w ? netScene(placed, play.graph.edges, seat, play.fog, w, h) : null), [placed, play.graph.edges, seat, play.fog, w, h]);
  const levels = netLevels(placed, play.graph.edges, seat, { hot, picked: opt.picked ?? null, fog: play.fog, wave: opt.wave ?? null, dim: opt.dim ?? 1 });
  return { ref, w, h, placed, scene, levels, nodes };
}

export function WebPicture({ P, scene, levels, style }: { P: Pal; scene: ReturnType<typeof netScene> | null; levels: ReturnType<typeof netLevels>; style?: CSSProperties }) {
  return <Sky P={P} scene={scene} levels={levels} bloom={0.28} className="absolute inset-0 h-full w-full" style={style} />;
}

/* ---------------------------------------------------------------- small type */

export function Label({ P, children, warm = false, style }: { P: Pal; children: ReactNode; warm?: boolean; style?: CSSProperties }) {
  return (
    <div className="text-[12.5px] tracking-[0.02em]" style={{ color: warm ? P.warm : P.mute, ...style }}>
      {children}
    </div>
  );
}

export const mono = (size: number, color?: string): CSSProperties => ({ fontFamily: MONO, fontSize: size, color, fontVariantNumeric: "tabular-nums" });

/* ---------------------------------------------------------------- acting: do something, or ask without moving time */

export function Composer({ P, demo, hint = true, size = "md" }: { P: Pal; demo: (msg: string) => void; hint?: boolean; size?: "md" | "lg" }) {
  const t = useT("product.replay.stage.parts");
  const [mode, setMode] = useState<"do" | "ask">("do");
  const [text, setText] = useState("");
  const big = size === "lg";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        demo(mode === "do" ? t("demoDo", { text: short(text.trim(), 18) }) : t("demoAsk", { text: short(text.trim(), 18) }));
        setText("");
      }}
    >
      <div className="flex items-center gap-2 rounded-[16px] p-1.5 pl-1.5" style={{ background: `rgb(${P.inkRgb} / 0.055)`, boxShadow: `inset 0 0 0 1px rgb(${P.inkRgb} / 0.06)` }}>
        <div className="flex shrink-0 rounded-[11px] p-[3px] text-[12.5px]" style={{ background: `rgb(${P.pageRgb} / 0.6)` }}>
          {(["do", "ask"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setMode(k)} className="rounded-[8px] px-2.5 py-1 transition-colors" style={{ background: mode === k ? `rgb(${P.inkRgb} / 0.12)` : "transparent", color: mode === k ? P.ink : P.mute }}>
              {t(`mode.${k}`)}
            </button>
          ))}
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "do" ? t("placeholderDo") : t("placeholderAsk")}
          className={`min-w-0 flex-1 bg-transparent outline-none ${big ? "text-[15px]" : "text-[14px]"}`}
          style={{ color: P.ink }}
        />
        <button type="submit" disabled={!text.trim()} className="shrink-0 rounded-[11px] px-3.5 py-1.5 text-[13px] transition-opacity" style={{ background: mode === "do" ? P.warm : P.ink, color: P.page, opacity: text.trim() ? 1 : 0.35 }}>
          {mode === "do" ? t("submitDo") : t("submitAsk")}
        </button>
      </div>
      {hint && (
        <div className="mt-1.5 pl-2 text-[11.5px]" style={{ color: P.faint }}>
          {mode === "do" ? t("hintDo") : t("hintAsk")}
        </div>
      )}
    </form>
  );
}

/* ---------------------------------------------------------------- timelines */

export function BranchPick({ d, P, go, align = "right", up = false, nameW = 190 }: { d: Data; P: Pal; go: (id: string) => void; align?: "left" | "right"; up?: boolean; nameW?: number }) {
  const t = useT("product.replay.stage.parts");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as globalThis.Node) && setOpen(false);
    window.addEventListener("mousedown", off);
    return () => window.removeEventListener("mousedown", off);
  }, [open]);
  const cur = d.play.branch;
  // (the engine labels a timeline forked at a step "\u7b2c N \u6b65\u6539\u4e3a\uff1a…", "step N changed to: …" in Chinese)
  const name = (l: string) => short(l.replace(/^\u7b2c (\d+) \u6b65\u6539\u4e3a\uff1a/, (_, n: string) => t("forkedAt", { step: n })), 26);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-[12.5px] whitespace-nowrap" style={{ background: `rgb(${P.inkRgb} / 0.06)` }}>
        <span className="shrink-0" style={{ color: P.mute }}>
          {t("timeline")}
        </span>
        <span className="min-w-0 truncate" style={{ maxWidth: nameW }}>
          {name(cur.label)}
        </span>
        <span style={mono(11, P.faint)}>{d.play.branches.length}</span>
      </button>
      {open && (
        <div className={`k-rise absolute z-50 w-[340px] rounded-[16px] p-1.5 ${align === "right" ? "right-0" : "left-0"} ${up ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`} style={{ background: `rgb(${P.pageRgb} / 0.97)`, boxShadow: `0 20px 60px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)` }}>
          {d.play.branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setOpen(false);
                if (b.id !== cur.id) go(b.id);
              }}
              className="flex w-full items-baseline gap-3 rounded-[10px] px-3 py-2 text-left text-[13px]"
              style={{ background: b.id === cur.id ? `rgb(${P.warmRgb} / 0.1)` : "transparent", color: b.id === cur.id ? P.warm : P.ink }}
            >
              <span className="min-w-0 flex-1 truncate" title={b.label}>
                {name(b.label)}
              </span>
              <span className="shrink-0" style={mono(11, P.mute)}>
                {b.ended ? t("ended") : t("stepAt", { step: b.step, date: b.simTime })}
              </span>
            </button>
          ))}
          <div className="px-3 pt-1.5 pb-1 text-[11.5px]" style={{ color: P.faint }}>
            {t("forkHint")}
          </div>
        </div>
      )}
    </div>
  );
}

/** Where you are between the start and the end: each step a tick, scheduled events hollow, now a bright dot. */
export function TimeTrack({ d, P, steps, onStep, warmTo }: { d: Data; P: Pal; steps: { n: number; at: string; did: string | null }[]; onStep?: (n: number) => void; warmTo?: boolean }) {
  const t = useT("product.replay.stage.parts");
  const [hover, setHover] = useState<number | null>(null);
  const t0 = Date.parse(d.world.scope?.timeStart ?? steps[0]?.at ?? "2000-01-01");
  const now = d.play.branch.simTime;
  const t1 = Math.max(t0 + 864e5, Date.parse(d.world.scope?.timeEnd ?? now), Date.parse(now));
  const x = (s: string) => `${Math.max(0, Math.min(1, (Date.parse(s) - t0) / (t1 - t0))) * 100}%`;
  const hs = hover != null ? steps.find((s) => s.n === hover) : null;
  return (
    <div className="flex items-center gap-4">
      <span style={mono(11, P.faint)}>{d.world.scope?.timeStart.slice(0, 7)}</span>
      <div className="relative h-6 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: P.rule }} />
        <div className="absolute top-1/2 left-0 h-px" style={{ width: x(now), background: warmTo ? `rgb(${P.warmRgb} / 0.6)` : `rgb(${P.inkRgb} / 0.4)` }} />
        {d.play.upcoming.map((u) => (
          <span key={u.id} className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(u.dueAt), boxShadow: `inset 0 0 0 1px ${P.mute}` }} title={`${u.dueAt} ${u.title}`} />
        ))}
        {steps
          .filter((s) => s.did)
          .map((s) => (
            <button key={s.n} type="button" onMouseEnter={() => setHover(s.n)} onMouseLeave={() => setHover(null)} onClick={() => onStep?.(s.n)} className="absolute top-0 h-6 w-3 -translate-x-1/2" style={{ left: x(s.at) }}>
              <span className="absolute top-1/2 left-1/2 h-[9px] w-px -translate-x-1/2 -translate-y-1/2" style={{ background: hover === s.n ? P.warm : P.ink, opacity: hover === s.n ? 1 : 0.7 }} />
            </button>
          ))}
        <span className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(now), background: P.warm, boxShadow: `0 0 0 4px rgb(${P.warmRgb} / 0.16)` }} />
        {hs && (
          <div className="k-rise pointer-events-none absolute bottom-[calc(100%+8px)] w-[300px] -translate-x-1/2 rounded-[12px] px-3 py-2 text-[12.5px] leading-[1.55]" style={{ left: x(hs.at), background: `rgb(${P.pageRgb} / 0.97)`, boxShadow: `0 12px 40px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)` }}>
            <div style={mono(11, P.mute)}>
              {t("stepAt", { step: hs.n, date: hs.at })}
            </div>
            <div className="mt-0.5">{hs.did}</div>
          </div>
        )}
      </div>
      <span style={mono(11, P.faint)}>{d.world.scope?.timeEnd?.slice(0, 7)}</span>
    </div>
  );
}

/** The cost line: where you are and what this world has spent. */
export function Spend({ d, P }: { d: Data; P: Pal }) {
  return (
    <span style={mono(11.5, P.faint)}>{usd(d.play.world.spentUsd)}</span>
  );
}

/* ---------------------------------------------------------------- what happened in a step */

export function OutcomeSheet({ d, P, onClose }: { d: Data; P: Pal; onClose: () => void }) {
  const t = useT("product.replay.stage.parts");
  const td = useT("product.replay.stage.data");
  const locale = useLocale();
  const last = d.play.lastStep;
  const evs = lastEvents(d.play);
  const prev = [...d.play.decisions].filter((x) => x.restatement).sort((a, b) => a.step - b.step).at(-1);
  const nums = numsOf(d.play, locale).filter((n) => n.d);
  return (
    <div className="k-fade absolute inset-0 z-40 flex items-center justify-center p-6" style={{ background: `rgb(${P.pageRgb} / 0.55)`, backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="k-rise w-[min(680px,100%)] rounded-[24px] p-8" style={{ background: `rgb(${P.pageRgb} / 0.96)`, boxShadow: `0 30px 90px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(${P.inkRgb} / 0.08)` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-4">
          <Label P={P} warm>
            {t("whatHappened")}
          </Label>
          <span style={mono(12, P.mute)}>
            {prev?.simTime ?? "—"} → {d.play.branch.simTime}
          </span>
        </div>
        <h2 className="mt-3 text-[22px] leading-[1.5] font-medium">{last?.restatement ?? prev?.restatement ?? t("noRecord")}</h2>
        {!!last?.rejected.length && (
          <div className="mt-2 space-y-1 text-[13px] leading-[1.6]" style={{ color: P.mute }}>
            {last.rejected.map((r, i) => (
              <div key={i}>
                <span style={{ color: P.warm }}>{t("notTaken")}</span>
                {r.text}
                <span style={{ color: P.faint }}> — {r.why}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 grid gap-0">
          {evs.length === 0 && (
            <div className="text-[14px]" style={{ color: P.mute }}>
              {t("nothingReached")}
            </div>
          )}
          {evs.map((e, i) => (
            <div key={e.id} className="grid grid-cols-[64px_14px_1fr] items-start gap-3">
              <span className="pt-[3px]" style={mono(12, e.mine ? P.warm : P.mute)}>
                {md(e.at)}
              </span>
              <span className="relative flex h-full justify-center">
                <span className="mt-[7px] h-[7px] w-[7px] rounded-full" style={{ background: e.mine ? P.warm : P.ink, opacity: e.mine ? 1 : 0.6 }} />
                {i < evs.length - 1 && <span className="absolute top-[18px] bottom-[-4px] w-px" style={{ background: P.rule }} />}
              </span>
              <div className="pb-4 text-[15px] leading-[1.55]">
                <span className="font-medium">{whoOf(e, td)}</span>
                <span style={{ color: P.mute }}> · </span>
                {e.what}
                {e.p != null && (
                  <span className="ml-2 rounded-full px-2 py-[1px] text-[11.5px]" style={{ ...mono(11.5, P.mute), background: `rgb(${P.inkRgb} / 0.06)` }} title={t("oddsTitle")}>
                    {t("odds", { pct: Math.round(e.p * 100) })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {nums.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4" style={{ borderColor: P.rule }}>
            {nums.map((n) => (
              <div key={n.m.key} className="text-[13px]">
                <span style={{ color: P.mute }}>{n.m.label} </span>
                <span style={mono(13, n.bad ? P.warm : P.ink)}>
                  {n.start} → {n.now}
                </span>
              </div>
            ))}
            <span className="text-[11.5px]" style={{ color: P.faint }}>
              {t("sinceStart")}
            </span>
          </div>
        )}
        {d.play.situation?.why && (
          <div className="mt-5 rounded-[14px] px-4 py-3 text-[14px] leading-[1.6]" style={{ background: `rgb(${P.warmRgb} / 0.09)` }}>
            <span style={{ color: P.warm }}>{t("stoppedHere")}</span>
            {d.play.situation.why}
          </div>
        )}
        <div className="mt-6 flex items-center justify-between gap-3">
          <span className="text-[12px]" style={{ color: P.faint }}>
            {t("draftNote")}
          </span>
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2 text-[14px]" style={{ background: P.warm, color: P.page }}>
            {t("seeNext")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** How it ended, when it has. `t` is the texts of "product.replay.stage.parts"; `locale` the interface language. */
export const endedLine = (d: Data, t: T, locale: string) => (d.play.branch.ended ? t("endedLine", { date: day(d.play.branch.ended.at, locale), ending: ending(d.play.branch.ended.reason) }) : null);
