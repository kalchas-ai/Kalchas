"use client";

import { useEffect, useRef, useState } from "react";
import { MONO } from "@/components/kit/fonts";
import { api, useApp } from "@/components/product/shell";
import { useT } from "@/lib/i18n/client";

/**
 * Where the making has got to, at the top left under the name and the counts: one bar from the first word to the
 * opening of a world, cut into its stages, each as wide as it usually takes (measured from this installation's own
 * runs). The stages done are filled; the one being done fills as its usual time goes by and never quite to its end
 * (how long it will really take is not known); under it, which stage of how many, and its name.
 */
export type StageKey = "know" | "ask" | "world" | "start";
const ORDER: StageKey[] = ["know", "ask", "world", "start"];
/** Each stage's name is the text `stage.<key>` of this namespace. */
/** What a stage takes when nothing has been measured yet (seconds); answering is yours, and is given a short stretch. */
const USUAL: Record<StageKey, number> = { know: 20, ask: 0, world: 415, start: 25 };
const W = 340;
const GAP = 3;

export function Stages({ at, detail, upTo }: { at: StageKey | null; /** What is being done within the stage, when it says. */ detail?: string | null; /** The last stage this project goes to. */ upTo: StageKey }) {
  const { P } = useApp();
  const t = useT("product.live.stages");
  const [usual, setUsual] = useState<Partial<Record<StageKey, number>>>({});
  useEffect(() => {
    let live = true;
    api<Record<string, number>>("/stages")
      .then((r) => {
        // (the world is built in parts, each measured on its own: it takes them all)
        const parts = ["skeleton", "research", "opening"].filter((k) => r[k] != null);
        if (live) setUsual({ know: r.know, start: r.start, world: parts.length ? parts.reduce((a, k) => a + r[k]!, 0) : undefined });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // (for looking at it without making anything: ?stage=research shows the bar as it stands at that stage)
  const [forced, setForced] = useState<StageKey | null>(null);
  useEffect(() => {
    const look = () => {
      const q = new URLSearchParams(window.location.search).get("stage") as StageKey | null;
      setForced(q && ORDER.includes(q) ? q : null);
    };
    look();
    window.addEventListener("popstate", look);
    return () => window.removeEventListener("popstate", look);
  }, []);
  if (forced) at = forced;
  // (kept a little after the last stage, so that it goes out rather than vanishes)
  const [seen, setSeen] = useState<StageKey | null>(at);
  // when the stage being done began, as far as this page saw it: the bar fills by the clock from then
  const since = useRef<{ key: StageKey | null; t: number }>({ key: null, t: 0 });
  const [, tick] = useState(0);
  useEffect(() => {
    if (at) setSeen(at);
    if (at !== since.current.key) since.current = { key: at, t: Date.now() };
    if (!at) return;
    const id = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [at]);
  const cur = at ?? seen;
  if (!cur) return null;
  const keys = ORDER.slice(0, ORDER.indexOf(upTo) + 1);
  const secs = keys.map((k) => Math.max(1, usual[k] ?? USUAL[k]));
  const total = secs.reduce((a, b) => a + b, 0);
  // answering takes no machine time: it is given a fourteenth of the bar, so that it can be seen as a stage
  const span = keys.map((k, i) => (k === "ask" ? total / 14 : secs[i]!));
  const whole = span.reduce((a, b) => a + b, 0);
  const room = W - GAP * (keys.length - 1);
  const i = Math.max(0, keys.indexOf(cur));
  // (how far through its usual time; never to the end, which is only reached when the stage is really over)
  const part = cur === "ask" ? 0.5 : Math.min(0.94, (Date.now() - since.current.t) / 1000 / Math.max(1, secs[i]!));
  return (
    <div className="pointer-events-none fixed z-[4]" style={{ left: 44, top: 190, width: W, opacity: at ? 1 : 0, transition: "opacity 1200ms ease" }} aria-label={t("now", { stage: t(`stage.${cur}`) })}>
      <div className="flex" style={{ gap: GAP }}>
        {keys.map((k, n) => (
          <span key={k} className="relative block overflow-hidden rounded-full" style={{ width: (span[n]! / whole) * room, height: 3, background: `rgb(${P.inkRgb} / 0.14)` }}>
            <span
              className={n === i ? "kstage-on" : undefined}
              style={{ position: "absolute", inset: 0, transformOrigin: "left", transform: `scaleX(${n < i ? 1 : n === i ? Math.max(0.06, part) : 0})`, background: n === i ? P.warm : `rgb(${P.inkRgb} / 0.78)`, transition: "transform 1000ms linear, background 900ms ease" }}
            />
          </span>
        ))}
      </div>
      <div className="mt-[10px] flex items-baseline gap-[10px] whitespace-nowrap">
        <span style={{ fontFamily: MONO, fontSize: 11, color: P.mute, fontVariantNumeric: "tabular-nums" }}>
          {i + 1} / {keys.length}
        </span>
        <span className="text-[13px]" style={{ color: P.ink }}>
          {t(`stage.${cur}`)}
        </span>
        {detail ? (
          <span className="text-[12px]" style={{ color: P.mute }}>
            {detail}
          </span>
        ) : null}
      </div>
      <style>{`@keyframes kstage{0%,100%{opacity:1}50%{opacity:.6}}.kstage-on{animation:kstage 2.6s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.kstage-on{animation:none}}`}</style>
    </div>
  );
}
