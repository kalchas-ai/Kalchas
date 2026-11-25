"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Pal } from "@/components/kit/palette";
import { Label, mono } from "./parts";
import { excerpt, short } from "./data";
import { Orb } from "./dock";
import { callName, progressOf, type Call, type Trace } from "./trace";
import { useT } from "@/lib/i18n/client";

/**
 * How the engine's work in a step is told on the play page, one thing at a time: each model call (or each thing a
 * ruling settles) is a beat, held long enough to be read; a one-line record of what has been told; and how much was
 * worked out. Used by the product's play page and the drafts in /design/sim.
 */

/** One thing told: a call, the stretch of the step's own time it covers, and how long it stays on screen. */
export type Beat = { key: string; c: Call; t0: number; t1: number; at: number; dur: number; /** For a ruling on several things: which one this beat tells. */ item: number | null };

export const THINK = 110;
export const ACT = 90;

/** How long a call stays on screen: long enough to read what is shown of it. */
export function readMs(c: Call, item: number | null): number {
  const D = c.detail;
  if (item != null) {
    const it = D.items?.[item];
    return Math.max(3800, Math.min(7000, 1600 + ((it?.question.length ?? 40) + 40) * 45));
  }
  // (a person who holds, with no action, is told in a word of four characters)
  const n =
    c.purpose === "person"
      ? excerpt(D.thinking ?? "", THINK).length + (D.action != null ? excerpt(D.action, ACT).length : 4)
      : c.purpose === "rule"
        ? excerpt(D.restatement ?? "", 120).length + 24
        : c.purpose === "resolve_uncertain"
          ? (D.items ?? []).slice(0, 2).reduce((s, x) => s + Math.min(60, x.question.length) + 30, 0)
          : 60;
  return Math.max(3800, Math.min(8000, 1400 + n * 55));
}

/** The calls in the order they finished, each a beat; together they cover the step's time without a gap. */
export function beatsOf(tr: Trace): Beat[] {
  let prev = 0;
  let at = 0;
  // a ruling on several uncertain things is told one thing at a time
  return [...tr.calls]
    .sort((a, b) => a.to - b.to)
    .flatMap((c) => (c.purpose === "resolve_uncertain" && (c.detail.items?.length ?? 0) > 0 ? c.detail.items!.map((_, i) => i) : [null]).map((item) => ({ c, item })))
    .map(({ c, item }) => {
      const b: Beat = { key: `${c.id}:${item ?? ""}`, c, item, t0: prev, t1: c.to, at, dur: readMs(c, item) };
      prev = c.to;
      at += b.dur;
      return b;
    });
}


/** Text appearing as it is written. */
export function Typed({ text, p, P }: { text: string; p: number; P: Pal }) {
  const n = Math.round(text.length * Math.max(0, Math.min(1, p)));
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && (
        <span className="sim-caret" style={{ color: P.warm }}>
          ▍
        </span>
      )}
    </>
  );
}

/**
 * The thing being told: whole sentences, written out quickly at the start of its beat and then left still to be
 * read. What else is being worked out at the same time is named in one line, not shown.
 */
export function Focus({ P, beat, q, others }: { P: Pal; beat: Beat; q: number; others: Call[] }) {
  const t = useT("product.replay.stage.engine");
  const tc = useT("product.replay.stage.trace");
  const c = beat.c;
  const D = c.detail;
  const write = Math.min(1, q / 0.32);
  const shown = q > 0.38;
  const secs = ((c.to - c.from) / 1000).toFixed(1);
  return (
    <div className="sim-in rounded-[24px] px-7 pt-5 pb-5 backdrop-blur-xl" style={{ background: `rgb(${P.pageRgb} / 0.9)`, boxShadow: `0 24px 70px rgb(0 0 0 / 0.3), inset 0 0 0 1px rgb(${P.warmRgb} / 0.28)` }}>
      <div className="flex items-center gap-2.5">
        <Orb P={P} busy={!shown} size={20} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {callName(c, tc)}
          {beat.item != null && (c.detail.items?.length ?? 0) > 1 && <span style={mono(12, P.faint)}> {beat.item + 1}/{c.detail.items!.length}</span>}
        </span>
        <span style={mono(11.5, P.faint)}>{t("took", { secs })}</span>
      </div>
      {others.length > 0 && (
        <div className="mt-1 pl-[30px] text-[12px]" style={{ color: P.faint }}>
          {t("alsoThinking", { names: others.map((o) => o.actor?.name ?? t("aSide")).join(t("sep")) })}
        </div>
      )}
      <div className="mt-3 text-[15.5px] leading-[1.7]">
        {c.purpose === "person" && (
          <>
            <div style={{ color: P.mute }}>
              “<Typed P={P} text={excerpt(D.thinking ?? "", THINK)} p={write} />
              {write >= 1 && "”"}
            </div>
            <div className="mt-2 transition-opacity duration-500" style={{ opacity: shown ? 1 : 0 }}>
              <span style={{ color: P.warm }}>{t("decision")}</span>
              {D.quiet || !D.action ? t("hold") : excerpt(D.action, ACT)}
            </div>
          </>
        )}
        {c.purpose === "rule" && (
          <>
            <div>
              <Typed P={P} text={excerpt(D.restatement ?? "", 120)} p={write} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12.5px] transition-opacity duration-500" style={{ opacity: shown ? 1 : 0 }}>
              {!!D.targets?.length && <Chip P={P}>{t("actsOn", { names: D.targets.slice(0, 3).join(t("sep")) })}</Chip>}
              {D.settings?.slice(0, 1).map((x, i) => (
                <Chip key={i} P={P} warm>
                  {t("setDown", { text: short(x.text, 20) })}
                </Chip>
              ))}
              <Chip P={P}>{t("leftToChance", { count: D.uncertain?.length ?? 0 })}</Chip>
            </div>
          </>
        )}
        {c.purpose === "resolve_uncertain" && (
          <div className="grid gap-3">
            {(D.items ?? []).filter((_, k) => beat.item == null || k === beat.item).map((it, k) => (
              <div key={k}>
                <div className="line-clamp-2 text-[14px] leading-[1.55]" title={it.question}>
                  {it.question}
                </div>
                <div className="mt-1.5 grid gap-1">
                  {it.outcomes.slice(0, 3).map((o) => {
                    const hit = shown && o.label === it.chosen;
                    return (
                      <div key={o.label} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: "minmax(0,1fr) 120px 36px" }}>
                        <span className="truncate" style={{ color: hit ? P.warm : P.mute }} title={o.label}>
                          {o.label}
                        </span>
                        <span className="h-[6px] rounded-full" style={{ background: `rgb(${P.inkRgb} / 0.08)` }}>
                          <span className="block h-full rounded-full" style={{ width: `${o.p * 100 * write}%`, background: hit ? P.warm : `rgb(${P.inkRgb} / 0.35)`, transition: "background .4s" }} />
                        </span>
                        <span className="text-right" style={mono(12, hit ? P.warm : P.faint)}>
                          {Math.round(o.p * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {c.purpose === "moment" && (
          <>
            <div style={{ color: P.mute }}>{t("nextForYou")}</div>
            <div className="mt-1 font-medium">
              <Typed P={P} text={D.headline ?? ""} p={write} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Chip({ P, children, warm = false }: { P: Pal; children: ReactNode; warm?: boolean }) {
  return (
    <span className="rounded-full px-2.5 py-[2px]" style={{ background: warm ? `rgb(${P.warmRgb} / 0.12)` : `rgb(${P.inkRgb} / 0.07)`, color: warm ? P.warm : P.mute }}>
      {children}
    </span>
  );
}

/** How many of the newest lines are open by default. */
const OPEN_NEWEST = 1;

/**
 * What has been told, newest at the bottom; a line never changes once it is there. The newest few are open, read in
 * full with what else the call decided; any other opens with a click. Older lines scroll up out of the way.
 */
export function Record({ P, beats, upTo, width }: { P: Pal; beats: Beat[]; upTo: number; width: number }) {
  const t = useT("product.replay.stage.engine");
  const tc = useT("product.replay.stage.trace");
  const shown = beats.slice(0, upTo);
  const [flip, setFlip] = useState<{ [key: string]: boolean }>({});
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown.length]);
  const line = (b: Beat) => {
    const D = b.c.detail;
    if (b.c.purpose === "person") return D.quiet || !D.action ? t("hold") : D.action;
    if (b.c.purpose === "resolve_uncertain") return b.item != null ? (D.items?.[b.item]?.chosen ?? "") : (D.items ?? []).map((x) => x.chosen).filter(Boolean).join(t("sepClause"));
    if (b.c.purpose === "rule") return D.restatement;
    return D.headline;
  };
  // what else the call decided, under its line once it is open
  const more = (b: Beat): string[] => {
    const D = b.c.detail;
    if (b.c.purpose === "person") return [D.said ? t("says", { said: D.said }) : "", D.quiet || !D.action ? (D.thinking ? t("thinks", { thinking: D.thinking }) : "") : ""].filter(Boolean);
    if (b.c.purpose === "rule") return [...(D.targets ?? []).map((x) => t("toDecide", { name: x })), ...(D.uncertain ?? []).map((x) => t("toSettle", { question: x.question }))];
    if (b.c.purpose === "resolve_uncertain")
      return (b.item != null ? [D.items?.[b.item]].filter(Boolean) : (D.items ?? [])).map((x) => `${x!.question}${x!.chosen ? ` → ${x!.chosen}` : ""}`);
    return [];
  };
  return (
    <div className="absolute top-[86px] bottom-[64px] left-6 flex flex-col" style={{ width }}>
      <Label P={P}>{t("record")}</Label>
      <div ref={scroller} className="sim-fade-top scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto pr-1" style={{ overscrollBehavior: "contain" }}>
        <div className="flex min-h-full flex-col justify-end gap-1">
          {shown.map((b, k) => {
            const open = flip[b.key] ?? k >= shown.length - OPEN_NEWEST;
            const text = line(b) ?? "";
            const extra = open ? more(b) : [];
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setFlip((f) => ({ ...f, [b.key]: !open }))}
                className="sim-in shrink-0 rounded-[12px] px-3 py-2 text-left transition-colors"
                style={{ background: `rgb(${P.inkRgb} / ${open ? 0.06 : 0.035})` }}
                title={open ? t("hide") : t("readAll")}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px]" style={{ color: P.mute }}>
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{callName(b.c, tc)}</span>
                  <span style={mono(10.5, P.faint)}>{((b.c.to - b.c.from) / 1000).toFixed(1)}s</span>
                </div>
                <div className={`mt-0.5 pl-[17px] text-[12px] leading-[1.6] ${open ? "" : "truncate"}`} style={{ color: open ? `rgb(${P.inkRgb} / 0.78)` : P.faint }}>
                  {text}
                </div>
                {extra.length > 0 && (
                  <div className="mt-1 grid gap-0.5 pl-[17px] text-[11.5px] leading-[1.6]" style={{ color: P.mute }}>
                    {extra.map((x, i) => (
                      <div key={i}>{x}</div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
          {upTo === 0 && (
            <div className="text-[12.5px]" style={{ color: P.faint }}>
              {t("recordEmpty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** How much was worked out, counted as it happens, and the calls laid out in time (bars side by side ran together). */
export function Workload({ P, trace, t, width }: { P: Pal; trace: Trace; t: number; width: number }) {
  const tx = useT("product.replay.stage.engine");
  const cs = trace.calls;
  const finished = cs.filter((c) => t >= c.to);
  const woken = new Set(cs.filter((c) => t >= c.from && c.purpose === "person").map((c) => c.actor?.id ?? c.id)).size;
  const judged = finished.filter((c) => c.purpose === "resolve_uncertain").reduce((s, c) => s + (c.detail.items?.length ?? 0), 0);
  const cost = cs.reduce((s, c) => s + c.cost * progressOf(c, t), 0);
  const sec = Math.floor(t / 1000);
  const stat = (k: string, v: string, sub?: string) => (
    <div className="min-w-0">
      <div className="text-[11.5px]" style={{ color: P.mute }}>
        {k}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[21px] leading-none font-light" style={mono(21)}>
          {v}
        </span>
        {sub && <span style={mono(11, P.faint)}>{sub}</span>}
      </div>
    </div>
  );
  const W = width - 8;
  const lab = 64;
  const x = (ms: number) => lab + (ms / trace.ms) * (W - lab);
  return (
    <div className="absolute top-[86px] right-6 bottom-[64px] flex flex-col" style={{ width }}>
      <Label P={P}>{tx("workload")}</Label>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5">
        {stat(tx("modelCalls"), `${finished.length}`, trace.complete ? `/ ${cs.length}` : tx("unitCalls"))}
        {stat(tx("sidesWoken"), `${woken}`, tx("unitSides"))}
        {stat(tx("judged"), `${judged}`, tx("unitThings"))}
        {stat(tx("time"), `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`)}
        {stat(tx("cost"), `$${cost.toFixed(3)}`)}
      </div>
      <Label P={P} style={{ marginTop: 22 }}>
        {tx("callsOverTime")}
      </Label>
      <svg className="mt-2 overflow-visible" width={W} height={cs.length * 17 + 14}>
        {cs.map((c, i) => {
          const p = progressOf(c, t);
          const y = i * 17 + 4;
          return (
            <g key={c.id} opacity={t >= c.from ? 1 : 0.3}>
              <text x={0} y={y + 8} fontSize={10.5} fill={t >= c.from ? P.mute : P.faint}>
                {c.purpose === "person" ? short(c.actor?.name ?? tx("aSide"), 6) : c.purpose === "moment" ? tx("barMoment") : tx("barSettle")}
              </text>
              <rect x={x(c.from)} y={y + 1} width={Math.max(1, x(c.to) - x(c.from))} height={9} rx={4.5} fill={`rgb(${P.inkRgb} / 0.07)`} />
              <rect x={x(c.from)} y={y + 1} width={Math.max(0, (x(c.to) - x(c.from)) * p)} height={9} rx={4.5} fill={c.purpose === "person" ? P.ink : c.purpose === "moment" ? P.mute : P.warm} opacity={c.purpose === "person" ? 0.55 : 0.85} />
            </g>
          );
        })}
        <line x1={x(t)} x2={x(t)} y1={0} y2={cs.length * 17 + 6} stroke={P.warm} strokeWidth={1} opacity={0.7} />
        <text x={lab} y={cs.length * 17 + 14} fontSize={10} fill={P.faint}>
          0s
        </text>
        <text x={W} y={cs.length * 17 + 14} fontSize={10} fill={P.faint} textAnchor="end">
          {(trace.ms / 1000).toFixed(0)}s
        </text>
      </svg>
      <div className="mt-auto text-[11.5px] leading-[1.6]" style={{ color: P.faint }}>
        {tx("sideBySide")}
      </div>
    </div>
  );
}
