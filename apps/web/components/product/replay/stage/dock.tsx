"use client";

import { useEffect, useRef, useState } from "react";
import type { Pal } from "@/components/kit/palette";
import { DockShell, Kbd } from "@/components/product/dock-shell";
import Md from "@/components/product/forecast/md";
import { LiveAnswer, Steps, type LiveTurn, type StepLine } from "@/components/product/advisor";
import { rich, useT } from "@/lib/i18n/client";
import type { Data } from "./data";

/**
 * Asking, apart from acting: the product's floating bar at the bottom middle, the same as on the research page
 * (DockShell). Summoned — a click, "/" or ⌘K — it rises with a ring of light to near the top of the screen. What you ask goes to the adviser, who
 * knows only what you know; asking never moves time and never changes the world. Everything you choose or write in
 * the card is a move.
 */

type Turn = { q: string; a: string; views?: { who: string; likely: string }[]; checks?: { title: string; action: string }[]; redirected?: boolean; steps?: StepLine[] };

/**
 * `onAsk`: really ask (the product); without it the drafts answer locally. `live`: the answer being worked out (what
 * the adviser looks up, the answer as it is written). `onUse`: put an action the adviser suggests into the move you are
 * writing. `summon`: a new value opens it (a question typed as a move was answered here).
 */
export function AskDock({ P, d, ideas, busy = false, live = null, onDismiss, onAsk, onUse, summon = 0 }: { P: Pal; d: Data; ideas: string[]; busy?: boolean; live?: LiveTurn | null; onDismiss?: () => void; onAsk?: (q: string) => Promise<void>; onUse?: (action: string) => void; summon?: number }) {
  const t = useT("product.replay.stage.dock");
  const [on, setOn] = useState(false);
  const [text, setText] = useState("");
  const [local, setLocal] = useState<Turn[]>([]);
  const real: Turn[] = d.play.asks.map((a) => ({ q: a.q, a: a.a, views: a.views, checks: a.checks, redirected: a.redirected, steps: a.steps }));
  const thread = onAsk ? real : [...real, ...local];
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (summon) setOn(true);
  }, [summon]);
  const shell = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (e.key === "Escape" && on) {
        setOn(false);
        input.current?.blur();
      } else if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOn(true);
        window.setTimeout(() => input.current?.focus(), 30);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [on]);
  useEffect(() => {
    if (!on) return;
    const down = (e: MouseEvent) => !shell.current?.contains(e.target as Node) && setOn(false);
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [on]);
  useEffect(() => {
    if (on) box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [on, thread.length, busy, live?.steps.length, live?.text.length]);

  const send = (q: string) => {
    const x = q.trim();
    if (!x || busy) return;
    setOn(true);
    setErr(null);
    if (!onAsk) {
      setLocal((l) => [...l, { q: x, a: t("draftAnswer") }]);
      setText("");
      return;
    }
    setText("");
    onAsk(x).catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  };
  const lit = on || busy;

  return (
    <DockShell
      P={P}
      on={on}
      lit={lit}
      title={t("title")}
      note={t("note")}
      onClose={() => setOn(false)}
      shellRef={shell}
      boxRef={box}
      onBarDown={() => setOn(true)}
      bar={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <Orb P={P} busy={busy} />
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setOn(true)} placeholder={busy ? t("busy") : t("placeholder")} className="min-w-0 flex-1 bg-transparent py-1.5 text-[14.5px] outline-none" style={{ color: P.ink }} />
          {on ? (
            <button type="submit" disabled={!text.trim()} aria-label={t("send")} title={t("sendHint")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-opacity" style={{ background: P.ink, color: P.page, opacity: text.trim() ? 1 : 0.3 }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 13V3.5M3.8 7.5 8 3.3l4.2 4.2" />
              </svg>
            </button>
          ) : (
            <Kbd P={P} k="/" />
          )}
        </form>
      }
    >
      {thread.length === 0 && !live && <div className="text-[13.5px] leading-[1.7]" style={{ color: P.mute }}>{t("empty")}</div>}
      {thread.map((x, i) => (
        <div key={i} className="mb-4">
          <div className="ml-auto w-fit max-w-[80%] rounded-[16px] px-3.5 py-2 text-[14px]" style={{ background: `rgb(${P.inkRgb} / 0.08)` }}>
            {x.q}
          </div>
          <div className="mt-2 text-[14px]">
            {!!x.steps?.length && <Steps P={P} steps={x.steps} />}
            <Md text={x.a} size={14} pal={P} />
          </div>
          {x.redirected && (
            <div className="mt-1 text-[12px]" style={{ color: P.faint }}>
              {t("redirected")}
            </div>
          )}
          {!!x.checks?.length && onUse && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {x.checks.map((c, j) => (
                <button key={j} type="button" onClick={() => { onUse(c.action); setOn(false); }} className="rounded-full px-3 py-1 text-[12.5px]" style={{ background: `rgb(${P.warmRgb} / 0.1)`, color: P.warm }} title={c.action}>
                  {t("useCheck", { title: c.title })}
                </button>
              ))}
            </div>
          )}
          {!!x.views?.length && (
            <div className="mt-1.5 grid gap-0.5 text-[12.5px] leading-[1.6]" style={{ color: P.mute }}>
              {x.views.map((v, j) => (
                <div key={j}>
                  {rich(t("view", { who: v.who, likely: v.likely }), { b: (s) => <span style={{ color: P.ink }}>{s}</span> })}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {live && (
        <div className="mb-4">
          <LiveAnswer P={P} live={live} size={14} onDismiss={onDismiss} />
        </div>
      )}
      {err && (
        <div className="mb-3 text-[13px]" style={{ color: P.warm }}>
          {t("askFailed", { error: err })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {ideas.map((x) => (
          <button key={x} type="button" onClick={() => send(x)} className="rounded-full px-3 py-1 text-[12.5px] transition-colors" style={{ background: `rgb(${P.inkRgb} / 0.06)`, color: P.mute }}>
            {x}
          </button>
        ))}
      </div>
    </DockShell>
  );
}

/** The product's small orb of light: still when idle, turning while something is worked out. */
export function Orb({ P, busy, size = 26 }: { P: Pal; busy: boolean; size?: number }) {
  return (
    <span className="relative inline-block shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, background: `rgb(${P.inkRgb} / 0.08)` }}>
      <span aria-hidden className="k-spin absolute top-1/2 left-1/2 aspect-square w-[140%]" style={{ animationDuration: busy ? "1.6s" : "5s", opacity: busy ? 1 : 0.75, background: `conic-gradient(from 0deg, rgb(${P.warmRgb} / 0.95), rgb(${P.inkRgb} / 0.15) 120deg, rgb(${P.warmRgb} / 0.35) 220deg, rgb(${P.inkRgb} / 0.6) 300deg, rgb(${P.warmRgb} / 0.95))`, filter: "blur(3px)" }} />
      <span className="absolute rounded-full" style={{ inset: size * 0.19, background: P.page }} />
      <span className="absolute rounded-full" style={{ inset: size * 0.35, background: busy ? P.warm : P.ink, opacity: 0.8 }} />
    </span>
  );
}
