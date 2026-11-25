"use client";

import { useCallback, useRef, useState } from "react";
import type { Pal } from "@/components/kit/palette";
import Md from "@/components/product/forecast/md";
import { useT } from "@/lib/i18n/client";

/**
 * The adviser's conversation in the play: asking (`useAdvisor`), what it looks up as
 * it goes and the answer as it is written (`LiveAnswer`), and what it looked up, kept with a saved answer (`Steps`).
 * Each page keeps its own thread and its own bar; these are the parts they have in common.
 */

export type StepLine = { id?: string; label: string; note?: string; state?: "run" | "done" | "fail"; failed?: boolean };
export type LiveTurn = { q: string; about?: string; quote?: string; steps: StepLine[]; text: string; error?: string };

type Event =
  | { type: "step"; id: string; label: string; state: "run" | "done" | "fail"; note?: string }
  | { type: "reset" }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Asks the adviser and follows its answer as it comes. `onSaved` runs once the answer is kept (the page reloads its
 * thread); the live answer stays on screen until then, so nothing jumps.
 */
export function useAdvisor(scope: "play", id: string, onSaved: () => Promise<unknown> | void) {
  const t = useT("product.advisor");
  const [live, setLive] = useState<LiveTurn | null>(null);
  const busy = !!live && !live.error;
  const saved = useRef(onSaved);
  saved.current = onSaved;

  const ask = useCallback(
    async (text: string, extra: { about?: string; quote?: string } = {}): Promise<boolean> => {
      const q = text.trim();
      if (!q) return false;
      setLive({ q, ...extra, steps: [], text: "" });
      const fail = (message: string) => setLive((l) => (l ? { ...l, error: message } : l));
      try {
        const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, id, text: q, ...extra }) });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          fail(j?.error ?? `HTTP ${res.status}`);
          return false;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let ended: "done" | "error" | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const raw = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!raw) continue;
            const e = JSON.parse(raw) as Event;
            if (e.type === "text") setLive((l) => (l ? { ...l, text: l.text + e.delta } : l));
            else if (e.type === "reset") setLive((l) => (l ? { ...l, text: "" } : l));
            else if (e.type === "step")
              setLive((l) => {
                if (!l) return l;
                const i = l.steps.findIndex((s) => s.id === e.id);
                const s: StepLine = { id: e.id, label: e.label, note: e.note, state: e.state };
                return { ...l, steps: i < 0 ? [...l.steps, s] : l.steps.map((x, k) => (k === i ? s : x)) };
              });
            else if (e.type === "error") {
              ended = "error";
              fail(e.message);
            } else if (e.type === "done") ended = "done";
          }
        }
        if (ended !== "done") {
          if (!ended) fail(t("connectionLost"));
          return false;
        }
        await saved.current();
        setLive(null);
        return true;
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [scope, id, t],
  );
  return { live, busy, ask, dismiss: () => setLive(null) };
}

/** What it looked up. Live, every line shows; kept with an answer, it folds into one line you can open. */
export function Steps({ P, steps, live = false }: { P: Pal; steps: StepLine[]; live?: boolean }) {
  const t = useT("product.advisor");
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const shown = live || open;
  return (
    <div className="mb-2 text-[12.5px] leading-[1.65]" style={{ color: P.mute }}>
      {!live && (
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5" style={{ color: P.mute }}>
          <span className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
            ›
          </span>
          {t("sourcesChecked", { count: steps.length })}
        </button>
      )}
      {shown && (
        <div className={`grid gap-[2px] ${live ? "" : "mt-1 border-l pl-3"}`} style={{ borderColor: P.rule }}>
          {steps.map((s, i) => (
            <div key={s.id ?? i} className="k-fade flex min-w-0 items-baseline gap-2">
              <span className={`inline-block h-[6px] w-[6px] shrink-0 translate-y-[-1px] rounded-full ${s.state === "run" ? "k-pulse" : ""}`} style={{ background: s.state === "fail" || s.failed ? P.faint : s.state === "run" ? P.warm : `rgb(${P.inkRgb} / 0.35)` }} />
              <span className="min-w-0 truncate" style={{ color: s.state === "run" ? P.ink : P.mute }}>
                {s.label}
              </span>
              {s.note && <span className="shrink-0" style={{ color: P.faint }}>· {s.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The answer being worked out: your question, what it is looking up, the answer as it is written. `bubble` draws the
 * question the page's own way.
 */
export function LiveAnswer({ P, live, size = 15, bubble, onDismiss }: { P: Pal; live: LiveTurn; size?: number; bubble?: (l: LiveTurn) => React.ReactNode; onDismiss?: () => void }) {
  const t = useT("product.advisor");
  return (
    <div className="k-fade min-w-0">
      {bubble ? (
        bubble(live)
      ) : (
        <div className="ml-auto w-fit max-w-[85%] rounded-[16px] px-3.5 py-2 text-[14px] [overflow-wrap:anywhere]" style={{ background: `rgb(${P.inkRgb} / 0.08)` }}>
          {live.q}
        </div>
      )}
      <div className="mt-2.5 min-w-0">
        <Steps P={P} steps={live.steps} live />
        {live.text ? (
          <Md text={live.text} size={size} pal={P} />
        ) : (
          !live.error && (
            <div className="flex items-center gap-2 text-[13.5px]" style={{ color: P.mute }}>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="k-pulse inline-block h-[6px] w-[6px] rounded-full" style={{ background: P.warm, animationDelay: `${i * 0.2}s` }} />
                ))}
              </span>
              {live.steps.some((s) => s.state === "run") ? t("lookingUp") : live.steps.length ? t("writingAnswer") : t("thinking")}
            </div>
          )
        )}
        {live.error && (
          <div className="mt-2 text-[13px]" style={{ color: P.warm }}>
            {t("askFailed", { error: live.error })}
            {onDismiss && (
              <button type="button" onClick={onDismiss} className="ml-2 underline underline-offset-[3px]" style={{ color: P.mute }}>
                {t("dismiss")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
