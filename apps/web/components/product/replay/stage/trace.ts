"use client";

import { useEffect, useRef, useState } from "react";
import type { T } from "@/lib/i18n/locales";

/**
 * What the engine really did in one step (from /api/branches/[id]/trace), and a clock that plays it back faster than it
 * ran: every call starts and ends at its own moment, so the calls that ran side by side are seen side by side.
 */

export type Call = {
  id: string;
  role: "adjudicator" | "actor" | "director" | string;
  /** rule, person, moment, or "resolve_uncertain" for what the program rolled in the step (no call of its own). */
  purpose: "rule" | "person" | "moment" | "resolve_uncertain" | string;
  model: string;
  from: number;
  to: number;
  inTok: number;
  outTok: number;
  cost: number;
  actor: { id: string; name: string } | null;
  /** Always null now (flow-lab/flow.tsx, which may not be edited here, still reads it). */
  wave: number | null;
  events: string[];
  detail: {
    // RULE reading your move: what it takes you to be doing, who is to decide for themselves, what you set down
    restatement?: string;
    targets?: string[];
    settings?: { text: string }[];
    rejected?: string[];
    uncertain?: { question: string; base: string }[];
    // a person deciding for themselves
    thinking?: string;
    action?: string | null;
    quiet?: boolean;
    said?: string | null;
    open?: boolean;
    // what was left to odds, and how each came out
    items?: { question: string; base: string; outcomes: { label: string; p: number }[]; chosen: string | null }[];
    // the moment written: what you now face, the scene, why it stops there, and on what day
    headline?: string;
    scene?: string;
    why?: string;
    day?: string;
    options?: number;
    // no longer written (flow-lab/flow.tsx, which may not be edited here, still reads them)
    days?: number | null;
    certain?: string[];
    unsure?: string;
    stance?: string[];
    beliefs?: string;
    summary?: string;
    voices?: string[];
    chances?: string[];
    newcomers?: string[];
    jumpTo?: string;
    moment?: string;
  };
};

export type Trace = {
  step: number;
  /** When the step began (epoch ms). */
  start?: number;
  ms: number;
  /** The step has finished (its next moment is set); otherwise it is still being worked out. */
  complete: boolean;
  calls: Call[];
  events: { id: string; seq: number; kind: string; actor: string | null; actorId: string | null; title: string }[];
  totals: { calls: number; inTok: number; outTok: number; cost: number; actors: number };
};

/** The traces of the steps walked, and the one with the most going on (most parties, then most calls). */
export function useTraces(branchId: string, steps: number[]) {
  const [all, setAll] = useState<Trace[] | null>(null);
  const key = `${branchId}:${steps.join(",")}`;
  useEffect(() => {
    let live = true;
    setAll(null);
    Promise.all(steps.map((n) => fetch(`/api/branches/${branchId}/trace?step=${n}`).then((r) => (r.ok ? (r.json() as Promise<Trace>) : null)).catch(() => null))).then((xs) => {
      if (live) setAll(xs.filter((x): x is Trace => !!x && Array.isArray(x.calls)));
    });
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = all?.length ? [...all].sort((a, b) => b.totals.actors * 3 + b.totals.calls - (a.totals.actors * 3 + a.totals.calls))[0]! : null;
  return { all, best, loading: all === null };
}

/** How fast the playback runs: the whole step in about `target` ms, never slower than a third of real time. */
export const speedFor = (ms: number, target = 26000) => Math.max(3, ms / target);

/**
 * A clock in the trace's own time: runs from 0 to the end of the step while `on`, `speed` times faster than real.
 * Stops at the end and calls `done` once.
 */
export function useTraceClock(total: number, on: boolean, speed: number, done: () => void) {
  const [t, setT] = useState(0);
  const last = useRef<number | null>(null);
  const fired = useRef(false);
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    if (!on) {
      last.current = null;
      return;
    }
    fired.current = false;
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current == null ? 0 : now - last.current;
      last.current = now;
      setT((x) => {
        const y = Math.min(total, x + dt * speed);
        if (y >= total && !fired.current) {
          fired.current = true;
          window.setTimeout(() => doneRef.current(), 900);
        }
        return y;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, total, speed]);
  return { t, reset: (to = 0) => setT(to), end: () => setT(total) };
}

/** 0…1: how far a call has got at trace time `t`. */
export const progressOf = (c: Call, t: number) => (t <= c.from ? 0 : t >= c.to ? 1 : (t - c.from) / Math.max(1, c.to - c.from));

/** "45K" for big counts, as people read them in the interface language (`locale`). */
export const count = (n: number, locale: string) => (n >= 1e4 ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString(locale));

/** What a call is, in a few words. `t` is the texts of "product.replay.stage.trace". */
export function callName(c: Call, t: T): string {
  if (c.purpose === "rule") return t("rule");
  if (c.purpose === "person") return t("person", { name: c.actor?.name ?? t("aSide") });
  if (c.purpose === "resolve_uncertain") return t("odds");
  if (c.purpose === "moment") return t("moment");
  return c.purpose;
}
