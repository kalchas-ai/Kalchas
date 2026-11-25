"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MomentHint, ProjectCard } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { projectHref, useProjectLine, type Projects } from "../projects";
import { A, useApp, useLive, usd } from "../shell";
import { hashStr } from "@/components/sky/build";
import { rich, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";

/**
 * What the home is made of besides its picture: the data (projects, this month's spend), how a start is
 * handed over (the designs page only says what would happen), and the shelf of projects under the picture.
 */

/** Which way a moment faces, for the words: today, or a day in the past. */
export type Mode = "today" | "past";
/**
 * Starts a project from what you wrote (and the moment, where a design lets you set it; otherwise it is read). The
 * spending limit is not asked: it follows the moment that is read (Settings has the defaults).
 */
export type StartFn = (text: string, hint?: MomentHint) => void;

export const RUNNING = new Set(["building", "failed", "paused", "stalled"]);
export const needsYou = (p: ProjectCard) => p.status === "clarifying" || ["failed", "paused", "stalled"].includes(p.status);

export function useHomeData() {
  const { data } = useLive<Projects>("/projects", (d) => d.projects.some((p) => p.status === "building"), 4000);
  const projects = useMemo(() => data?.projects ?? [], [data]);
  // (there is nothing to revisit any more: the list stays, always empty, for the pages that still count it)
  return { loaded: !!data, projects, revisits: [] as { due: boolean }[], monthUsd: data?.monthUsd ?? 0 };
}

export type HomeData = ReturnType<typeof useHomeData>;

/**
 * The question each side asks, and what to write (the earlier designs, which still had two sides). `t` is the texts
 * of "product.start.shared".
 */
export const askOf = (t: T): Record<Mode, { q: string; hint: string; examples: string[] }> => ({
  today: {
    q: t("today.q"),
    hint: t("today.hint"),
    examples: [t("today.example1"), t("today.example2"), t("today.example3"), t("today.example4")],
  },
  past: {
    q: t("past.q"),
    hint: t("past.hint"),
    examples: [t("past.example1"), t("past.example2"), t("past.example3"), t("past.example4")],
  },
});

/** A placeholder that types out one example after another. */
export function useTyping(lines: string[], on = true) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!on) return;
    let i = 0;
    let k = 0;
    let back = false;
    let id = 0;
    const tick = () => {
      const line = lines[i % lines.length]!;
      if (!back) {
        k++;
        setText(line.slice(0, k));
        if (k >= line.length) {
          back = true;
          id = window.setTimeout(tick, 1600);
          return;
        }
      } else {
        k--;
        setText(line.slice(0, k));
        if (k <= 0) {
          back = false;
          i++;
        }
      }
      id = window.setTimeout(tick, back ? 28 : 70);
    };
    id = window.setTimeout(tick, 400);
    return () => window.clearTimeout(id);
  }, [lines, on]);
  return text;
}

/** A tiny galaxy for a project, drawn from its id (so it is always the same): its badge on the shelf. */
export function Glyph({ p, size = 34 }: { p: ProjectCard; size?: number }) {
  const { P } = useApp();
  const dots = useMemo(() => {
    const out: [number, number, number][] = [];
    const n = 26;
    const turn = (hashStr(p.id) % 628) / 100;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const arm = i % 2 ? Math.PI : 0;
      const a = turn + arm + t * 3.2;
      const r = 2 + t * (size * 0.42);
      out.push([size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r * 0.55, 0.35 + (1 - t) * 0.65]);
    }
    return out;
  }, [p.id, size]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={2.4} fill={P.ink} />
      {dots.map(([x, y, o], i) => (
        <circle key={i} cx={x} cy={y} r={0.9} fill={P.ink} opacity={o * 0.8} />
      ))}
      {needsYou(p) && <circle cx={size - 5} cy={5} r={2.6} fill={P.warm} className="k-pulse" />}
    </svg>
  );
}

/** The projects under the picture: where you left off, what is running. */
export function Shelf({ d }: { d: HomeData }) {
  const { P } = useApp();
  const tr = useT("product.start.shared");
  const projectLine = useProjectLine();
  const ready = d.projects.filter((p) => !RUNNING.has(p.status));
  const pending = d.projects.filter((p) => RUNNING.has(p.status));
  const head = (t: string, n: number) => (
    <div className="mb-2 flex items-baseline gap-2 px-1 text-[11px] tracking-[0.18em]" style={{ fontFamily: MONO, color: P.mute }}>
      {t}
      <span style={{ color: P.faint }}>{n || ""}</span>
    </div>
  );
  const row = (p: ProjectCard, extra?: ReactNode) => (
    <A key={p.id} href={projectHref(p)} className="group flex items-center gap-3 rounded-[14px] px-2.5 py-2 transition-colors hover:bg-[rgb(var(--k-ink)/0.05)]">
      <Glyph p={p} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{p.title}</span>
        <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: needsYou(p) ? P.warm : P.mute }}>
          {projectLine(p)}
        </span>
        {extra}
      </span>
      <span className="text-[12px] opacity-0 transition-opacity group-hover:opacity-100" style={{ color: P.mute }}>
        →
      </span>
    </A>
  );
  return (
    <section className="mx-auto grid max-w-[1180px] grid-cols-12 gap-x-8 gap-y-6 px-6 pt-8 pb-16">
      <div className="col-span-12 lg:col-span-5">
        {head(tr("continue"), ready.length)}
        {ready.slice(0, 6).map((p) => row(p))}
        {d.loaded && !ready.length && (
          <p className="px-1 text-[12.5px]" style={{ color: P.mute }}>
            {tr("noneToContinue")}
          </p>
        )}
      </div>
      <div className="col-span-12 md:col-span-6 lg:col-span-4">
        {head(tr("inProgress"), pending.length)}
        {pending.map((p) =>
          row(
            p,
            <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full" style={{ background: `rgb(${P.inkRgb} / 0.08)` }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.round((p.build?.progress ?? 0) * 100)}%`, background: p.status === "building" ? P.ink : P.warm }} />
            </span>,
          ),
        )}
        {d.loaded && !pending.length && (
          <p className="px-1 text-[12.5px]" style={{ color: P.mute }}>
            {tr("noneInProgress")}
          </p>
        )}
      </div>
      <div className="col-span-12 md:col-span-6 lg:col-span-3">
        <div className="mt-4 px-1 text-[12px]" style={{ color: P.mute }}>
          {rich(tr("monthSpend", { amount: usd(d.monthUsd) }), { b: (s) => <span style={{ fontFamily: MONO, color: P.ink }}>{s}</span> })}
        </div>
      </div>
    </section>
  );
}
