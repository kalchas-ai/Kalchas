"use client";

import { useEffect, useMemo, useState } from "react";
import { MONO } from "@/components/kit/palette";
import { api, useApp } from "@/components/product/shell";
import type { Play } from "@/components/product/replay/stage/data";
import { fmtMetric, worse } from "@/components/product/replay/metrics";
import { rich, useLocale, useT } from "@/lib/i18n/client";
import { Go, Head, Kick, Pager, clampLines, usePages } from "./rest";

/**
 * The report on a play that is over, on the axis (/design/matter). At the top, what kind of report it is and when,
 * its title, and the verdict in a sentence. Under that, its parts along one line, one of them on the page at a
 * time: how it compares (with what was predicted, or with what really happened); the decisions one by one, each
 * with what kind of thing it was and its lesson; what you did not know; the chains of cause; what to take away;
 * luck; what is revealed of others; what to do in the real world. A part with much in it is gone through a page
 * at a time. Nothing scrolls. A line that ran under the same outside conditions as another has the two compared.
 */

const SWIFT = "cubic-bezier(.2,.7,.2,1)";
const BAR = 54;

type Metric = Play["world"]["metrics"][number];
type Report = {
  id: string;
  kind: string;
  title: string;
  simTime: string;
  branchId: string;
  future: boolean;
  metrics: Metric[];
  curve: { step: number; simTime: string; metrics: Record<string, number> }[];
  decisions: { step: number; simTime: string; headline: string; restatement: string | null }[];
  facts: Record<string, { date: string; text: string; published: string | null }>;
  comparison?: { from: string; until: string; date: string | null; step: number; originalChoice: string | null; newChoice: string | null; original: Record<string, number>; current: Record<string, number>; signals: { date: string; title: string }[] } | null;
  data: {
    title: string;
    verdict: string;
    place?: string;
    comparison: { yourWorld: string; history: string; divergence: string };
    blindSpots: { factId: string; whatYouMissed: string; whenAvailable: string; howToGet: string; consequence: string }[];
    decisions: { step: number; assessment: string; category: string; lesson: string }[];
    causalChains: { title: string; chain: string[] }[];
    lessons: { text: string; step: number | null }[];
    pitfalls?: { text: string; basis: string }[];
    luck: { what: string; odds: string; effect: string }[];
    reveals?: { who: string; truth: string; signals: string; check: string }[];
    nextSteps?: string[];
    assumptions?: string[];
    practice?: string[];
  };
};
/** The kinds of report that have a name of their own (the text is kind.<name>); any other is a "report". */
const KIND = new Set(["final", "manual", "checkpoint"]);
/** A report's parts, in the order they are along the line (the text of each is tab.<name>). */
type Tab = "compare" | "matched" | "steps" | "blind" | "chains" | "lessons" | "luck" | "reveals" | "real";
/** How the report's own judgement names a decision that went wrong (in Chinese: a blind spot, an error of reasoning). */
const BAD = ["\u4fe1\u606f\u76f2\u533a", "\u63a8\u7406\u9519\u8bef"];

export function ReportPage({ play, onEnd }: { play: Play; onEnd: () => void }) {
  const { P } = useApp();
  const t = useT("flow-lab.report");
  const kindOf = (k: string) => (KIND.has(k) ? t(`kind.${k}`) : t("report"));
  const all = useMemo(() => play.branches.flatMap((b) => b.reports.map((r) => ({ ...r, label: b.label }))), [play.branches]);
  const mine = play.branch.reports;
  const [id, setId] = useState<string | null>(mine[mine.length - 1]?.id ?? all[all.length - 1]?.id ?? null);
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("compare");
  useEffect(() => {
    if (!id) return;
    let live = true;
    setR(null);
    setErr(null);
    api<Report>(`/reports/${id}`)
      .then((x) => live && setR(x))
      .catch((e) => live && setErr(String(e instanceof Error ? e.message : e)));
    return () => {
      live = false;
    };
  }, [id]);
  if (!id)
    return (
      <div className="absolute inset-x-0 flex flex-col items-center px-6 text-center" style={{ top: "30%" }}>
        <Kick>
          {t("decisionKick", { date: play.branch.simTime, step: play.branch.step })}
        </Kick>
        <h2 className="mt-4 text-[26px] font-medium">{t("notEnded")}</h2>
        <p className="mt-3 max-w-[520px] text-[14px] leading-[1.8]" style={{ color: P.mute }}>
          {t("notEndedBody")}
        </p>
        <div className="mt-7">
          <Go onClick={onEnd}>{t("endHere")}</Go>
        </div>
      </div>
    );
  if (!r)
    return (
      <div className="absolute inset-x-0 top-[38%] text-center text-[14px]" style={{ color: P.mute }}>
        {err ?? t("loading")}
      </div>
    );
  const d = r.data;
  const tabs: [Tab, number][] = (
    [
      ["compare", 1],
      ["matched", r.comparison ? 1 : 0],
      ["steps", d.decisions.length],
      ["blind", d.blindSpots.length],
      ["chains", d.causalChains.length],
      ["lessons", d.lessons.length + (d.pitfalls?.length ?? 0)],
      ["luck", d.luck.length],
      ["reveals", d.reveals?.length ?? 0],
      ["real", (d.nextSteps?.length ?? 0) + (d.assumptions?.length ?? 0) + (d.practice?.length ?? 0)],
    ] as [Tab, number][]
  ).filter(([, n]) => n > 0);
  const at = tabs.some(([k]) => k === tab) ? tab : tabs[0]![0];
  return (
    <div className="absolute inset-x-0 flex flex-col items-center px-6" style={{ top: 78, bottom: BAR + 22 }}>
      <Kick>
        {kindOf(r.kind)} · {r.simTime}
        {all.length > 1 ? ` · ${all.findIndex((x) => x.id === id) + 1} / ${all.length}` : ""}
      </Kick>
      <h1 className="mt-3 max-w-[900px] text-center text-[27px] leading-[1.4] font-medium" style={clampLines(2)}>
        {d.title || r.title}
      </h1>
      <p className="mt-3 max-w-[820px] text-center text-[14.5px] leading-[1.75]" style={{ color: `rgb(${P.inkRgb} / 0.86)`, ...clampLines(3) }}>
        {d.verdict}
      </p>
      {all.length > 1 && (
        <div className="mt-3 flex items-center gap-[7px]">
          {all.map((x) => (
            <button key={x.id} type="button" onClick={() => setId(x.id)} title={`${x.label} · ${kindOf(x.kind)} · ${x.simTime}`} className="flex h-5 items-center">
              <span className="block h-[3px] rounded-full transition-all duration-500" style={{ width: x.id === id ? 22 : 7, background: x.id === id ? P.ink : `rgb(${P.inkRgb} / 0.22)` }} />
            </button>
          ))}
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1 text-[13px]">
        {tabs.map(([k, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="transition-colors duration-300" style={{ color: k === at ? P.ink : P.faint }}>
            {t(`tab.${k}`)}
            {n > 1 && <span style={{ fontFamily: MONO, fontSize: 10.5, marginLeft: 5 }}>{n}</span>}
          </button>
        ))}
      </div>
      <div key={at} className="mt-6 w-[min(960px,92vw)] flex-1" style={{ animation: `flow-rise .55s ${SWIFT} both`, minHeight: 0 }}>
        <Part r={r} at={at} />
      </div>
    </div>
  );
}

function Part({ r, at }: { r: Report; at: Tab }) {
  const { P } = useApp();
  const t = useT("flow-lab.report");
  const locale = useLocale();
  const d = r.data;
  const body = { color: `rgb(${P.inkRgb} / 0.86)` } as const;
  const steps = usePages(d.decisions, 3);
  const blind = usePages(d.blindSpots, 2);
  const chains = usePages(d.causalChains, 3);
  const luck = usePages(d.luck, 3);
  const reveals = usePages(d.reveals ?? [], 2);
  const foot = (pg: { at: number; pages: number; setPage: (n: number) => void }) => (
    <div className="mt-4 flex justify-center">
      <Pager at={pg.at} pages={pg.pages} setPage={pg.setPage} />
    </div>
  );
  if (at === "compare")
    return (
      <div>
        <div className="grid grid-cols-2 gap-x-12">
          {(
            [
              [t("yourTimeline"), d.comparison.yourWorld],
              [r.future ? t("forecast") : t("history"), d.comparison.history],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="min-w-0 pt-4" style={{ boxShadow: `inset 0 1px 0 rgb(${P.inkRgb} / 0.2)` }}>
              <Head>{k}</Head>
              <p className="mt-2 text-[14px] leading-[1.8]" style={{ ...body, ...clampLines(6) }}>
                {v}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Head>{t("whereTheyPart")}</Head>
          <p className="mx-auto mt-2 max-w-[760px] text-[15px] leading-[1.8]" style={clampLines(4)}>
            {d.comparison.divergence}
          </p>
          {d.place && (
            <p className="mx-auto mt-3 max-w-[760px] text-[12.5px] leading-[1.7]" style={{ color: P.mute, ...clampLines(2) }}>
              {t("place", { place: d.place })}
            </p>
          )}
        </div>
      </div>
    );
  if (at === "matched" && r.comparison) {
    const c = r.comparison;
    const ms = r.metrics.filter((m) => c.original[m.key] != null || c.current[m.key] != null).slice(0, 5);
    return (
      <div>
        <div className="text-center">
          <Kick>
            {t("matchedKick", { step: c.step, from: c.from, until: c.until })}
          </Kick>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-12">
          {(
            [
              [t("originalChoice"), c.originalChoice],
              [t("newChoice"), c.newChoice],
            ] as [string, string | null][]
          ).map(([k, v]) => (
            <div key={k} className="min-w-0 pt-4" style={{ boxShadow: `inset 0 1px 0 rgb(${P.inkRgb} / 0.2)` }}>
              <Head>{k}</Head>
              <p className="mt-2 text-[14px] leading-[1.75]" style={{ ...body, ...clampLines(3) }}>
                {v ?? t("notDecided")}
              </p>
            </div>
          ))}
        </div>
        {c.date ? (
          <div className="mt-6">
            <Head>{t("numbersAsOf", { date: c.date })}</Head>
            {ms.map((m) => {
              const a = c.original[m.key];
              const b = c.current[m.key];
              const diff = a != null && b != null ? b - a : null;
              return (
                <div key={m.key} className="flex items-baseline gap-4 py-[8px] text-[13.5px]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className="w-[120px] text-right" style={{ fontFamily: MONO, fontSize: 12, color: P.mute }}>
                    {a != null ? fmtMetric(m, a, locale) : "—"}
                  </span>
                  <span className="w-[120px] text-right" style={{ fontFamily: MONO, fontSize: 12 }}>
                    {b != null ? fmtMetric(m, b, locale) : "—"}
                  </span>
                  <span className="w-[120px] text-right" style={{ fontFamily: MONO, fontSize: 12, color: a != null && b != null && worse(m, a, b) ? P.warm : P.ink }}>
                    {diff == null ? "" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtMetric(m, Math.abs(diff), locale)}`}
                  </span>
                </div>
              );
            })}
            {!ms.length && (
              <div className="mt-2 text-[13px]" style={{ color: P.mute }}>
                {t("noNumbers")}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-6 text-center text-[13px]" style={{ color: P.mute }}>
            {t("numbersLater")}
          </p>
        )}
        <p className="mt-4 text-[12.5px] leading-[1.7]" style={{ color: P.mute, ...clampLines(2) }}>
          {c.signals.length ? t("sharedEvents", { list: c.signals.slice(0, 4).map((s) => `${s.date} ${s.title}`).join(t("sep")) }) : t("noSharedEvents")}
        </p>
      </div>
    );
  }
  if (at === "steps")
    return (
      <div>
        <div key={steps.at}>
          {steps.rows.map((x) => {
            const dec = r.decisions.find((y) => y.step === x.step);
            const bad = BAD.includes(x.category);
            return (
              <div key={x.step} className="py-[12px]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
                <div className="flex items-baseline gap-4">
                  <span className="w-[56px] shrink-0" style={{ fontFamily: MONO, fontSize: 11, color: P.mute }}>
                    {t("step", { step: x.step })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px]">{dec ? t("stepYou", { headline: dec.headline, move: dec.restatement ?? "—" }) : x.assessment}</span>
                  <span className="shrink-0 text-[12px]" style={{ color: bad ? P.warm : P.mute }}>
                    {x.category}
                  </span>
                </div>
                <p className="mt-1.5 pl-[72px] text-[13px] leading-[1.7]" style={{ ...body, ...clampLines(2) }}>
                  {x.assessment}
                </p>
                <p className="mt-1 pl-[72px] text-[12.5px] leading-[1.6]" style={{ color: P.mute, ...clampLines(1) }}>
                  {t("lesson", { text: x.lesson })}
                </p>
              </div>
            );
          })}
        </div>
        {foot(steps)}
      </div>
    );
  if (at === "blind")
    return (
      <div>
        <div key={blind.at}>
          {blind.rows.map((x) => {
            const f = r.facts[x.factId];
            return (
              <div key={x.factId + x.whatYouMissed} className="py-[12px]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
                <div className="flex items-baseline gap-4">
                  <span className="shrink-0" style={{ fontFamily: MONO, fontSize: 11, color: P.mute }}>
                    {f ? t("happened", { date: f.date }) : t("revealed")}
                  </span>
                  <span className="min-w-0 flex-1 text-[14.5px] leading-[1.6]" style={clampLines(2)}>
                    {x.whatYouMissed}
                  </span>
                </div>
                {f && (
                  <p className="mt-1.5 text-[12.5px] leading-[1.65]" style={{ color: P.mute, ...clampLines(2) }}>
                    {t("original", { text: f.text })}
                  </p>
                )}
                <p className="mt-1 text-[12.5px] leading-[1.65]" style={{ color: P.mute, ...clampLines(2) }}>
                  {t("whenHow", { when: x.whenAvailable, how: x.howToGet })}
                </p>
                <p className="mt-1 text-[13px] leading-[1.65]" style={{ ...body, ...clampLines(2) }}>
                  {t("consequence", { text: x.consequence })}
                </p>
              </div>
            );
          })}
        </div>
        {foot(blind)}
      </div>
    );
  if (at === "chains")
    return (
      <div>
        <div key={chains.at}>
          {chains.rows.map((x) => (
            <div key={x.title} className="py-[12px]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
              <div className="text-[14.5px]">{x.title}</div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] leading-[1.6]" style={{ color: P.mute }}>
                {x.chain.slice(0, 6).map((c, i) => (
                  <span key={i} className="flex items-baseline gap-2">
                    {i > 0 && <span style={{ color: P.faint }}>→</span>}
                    <span style={{ color: i === Math.min(5, x.chain.length - 1) ? P.ink : P.mute }}>{c}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {foot(chains)}
      </div>
    );
  if (at === "lessons")
    return (
      <div className="grid grid-cols-2 gap-x-12">
        <div className="min-w-0">
          <Head>{t("takeAway")}</Head>
          {d.lessons.slice(0, 5).map((x) => (
            <p key={x.text} className="mt-3 text-[13.5px] leading-[1.7]" style={{ ...body, ...clampLines(3) }}>
              {x.text}
            </p>
          ))}
        </div>
        <div className="min-w-0">
          <Head>{t("pitfalls")}</Head>
          {(d.pitfalls ?? []).slice(0, 4).map((x) => (
            <div key={x.text} className="mt-3">
              <p className="text-[13.5px] leading-[1.7]" style={{ color: P.warm, ...clampLines(2) }}>
                {x.text}
              </p>
              <p className="mt-1 text-[12px] leading-[1.6]" style={{ color: P.mute, ...clampLines(2) }}>
                {x.basis}
              </p>
            </div>
          ))}
          {!d.pitfalls?.length && (
            <p className="mt-3 text-[13px]" style={{ color: P.mute }}>
              {t("noPitfalls")}
            </p>
          )}
        </div>
      </div>
    );
  if (at === "luck")
    return (
      <div>
        <div key={luck.at}>
          {luck.rows.map((x) => (
            <div key={x.what} className="flex items-baseline gap-5 py-[12px]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] leading-[1.6]" style={clampLines(2)}>
                  {x.what}
                </span>
                <span className="mt-1 block text-[12.5px] leading-[1.65]" style={{ color: P.mute, ...clampLines(2) }}>
                  {x.effect}
                </span>
              </span>
              <span className="w-[200px] shrink-0 text-right text-[12px] leading-[1.6]" style={{ fontFamily: MONO, color: P.mute, ...clampLines(2) }}>
                {t("odds", { odds: x.odds })}
              </span>
            </div>
          ))}
        </div>
        {foot(luck)}
      </div>
    );
  if (at === "reveals")
    return (
      <div>
        <div key={reveals.at}>
          {reveals.rows.map((x) => (
            <div key={x.who} className="py-[12px]" style={{ boxShadow: `inset 0 -1px 0 rgb(${P.inkRgb} / 0.07)` }}>
              <p className="text-[14.5px] leading-[1.7]" style={clampLines(3)}>
                {rich(t("truth", { who: x.who, truth: x.truth }), { w: (s) => <span style={{ color: P.mute }}>{s}</span> })}
              </p>
              <p className="mt-1.5 text-[12.5px] leading-[1.65]" style={{ color: P.mute, ...clampLines(2) }}>
                {t("signals", { signals: x.signals, check: x.check })}
              </p>
            </div>
          ))}
        </div>
        {foot(reveals)}
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-x-12">
      <div className="min-w-0">
        <Head>{t("nextSteps")}</Head>
        {(d.nextSteps ?? []).slice(0, 5).map((x) => (
          <p key={x} className="mt-3 flex gap-3 text-[13.5px] leading-[1.7]" style={body}>
            <span style={{ color: P.warm }}>→</span>
            <span style={clampLines(2)}>{x}</span>
          </p>
        ))}
      </div>
      <div className="min-w-0">
        <Head>{t("assumptions")}</Head>
        {(d.assumptions ?? []).slice(0, 3).map((x) => (
          <p key={x} className="mt-3 flex gap-3 text-[13.5px] leading-[1.7]" style={body}>
            <span style={{ color: P.faint }}>?</span>
            <span style={clampLines(2)}>{x}</span>
          </p>
        ))}
        {!!d.practice?.length && (
          <div className="mt-5">
            <Head>{t("practice")}</Head>
            {d.practice.slice(0, 2).map((x) => (
              <p key={x} className="mt-2 text-[13px] leading-[1.7]" style={{ color: P.mute, ...clampLines(2) }}>
                {x}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
