"use client";

import type { ReactNode, RefObject } from "react";
import { MONO, type Pal } from "@/components/kit/palette";
import { useT } from "@/lib/i18n/client";

/**
 * The floating bar at the bottom of a page that grows into a conversation, shared by the research page (asking about
 * the analysis) and the play page (asking the adviser). Summoned it rises with a ring of light, like Siri, to near the
 * top of the screen whatever its length; at rest it is one slim line. What goes in it is the page's own: `children` is
 * the conversation, `bar` the line you type in, `above` anything that rises over it (a question waiting for you).
 * `greet`: once the page has come in, the edge lights up for a moment, so you see you can ask here.
 */
export function DockShell({
  P,
  on,
  lit,
  title,
  note,
  onClose,
  shellRef,
  boxRef,
  bar,
  onBarDown,
  above,
  greet = false,
  children,
}: {
  P: Pal;
  on: boolean;
  lit: boolean;
  title: string;
  note?: ReactNode;
  onClose: () => void;
  shellRef: RefObject<HTMLDivElement | null>;
  boxRef: RefObject<HTMLDivElement | null>;
  bar: ReactNode;
  onBarDown?: () => void;
  above?: ReactNode;
  greet?: boolean;
  children: ReactNode;
}) {
  const t = useT("product.dock-shell");
  return (
    <div ref={shellRef} className="pointer-events-auto relative w-full transition-[max-width] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]" style={{ maxWidth: on ? 720 : 540 }}>
      {above}
      {/* a soft glow behind it, only while it is summoned */}
      <div aria-hidden className="pointer-events-none absolute -inset-8 rounded-[48px] blur-2xl transition-opacity duration-500" style={{ background: `radial-gradient(60% 70% at 50% 100%, rgb(${P.warmRgb} / 0.32), transparent 70%)`, opacity: lit ? 1 : 0 }} />
      {/* the edge: a ring of light turning, brighter while summoned */}
      <div aria-hidden className="absolute -inset-[1.5px] overflow-hidden rounded-[26px] transition-opacity duration-500" style={{ opacity: lit ? 1 : 0.4 }}>
        <span
          className="k-spin absolute top-1/2 left-1/2 aspect-square w-[160%]"
          style={{ animationDuration: "6s", background: `conic-gradient(from 0deg, transparent 0deg, rgb(${P.warmRgb} / 0.95) 50deg, transparent 120deg, transparent 180deg, rgb(${P.inkRgb} / 0.45) 230deg, rgb(${P.warmRgb} / 0.6) 270deg, transparent 320deg)` }}
        />
      </div>
      {/* the greeting: the edge lights up warm once, and dies down */}
      {greet && (
        <>
          <span aria-hidden className="pointer-events-none absolute -inset-[1.5px] rounded-[26px]" style={{ ["--w" as string]: P.warmRgb, animation: "dock-greet 2.2s ease-in-out 1.4s both" }} />
          <style>{`@keyframes dock-greet { 0%, 100% { box-shadow: 0 0 0 1.5px rgb(var(--w) / 0), 0 0 0 0 rgb(var(--w) / 0); } 30%, 55% { box-shadow: 0 0 0 1.5px rgb(var(--w) / 0.95), 0 0 36px 6px rgb(var(--w) / 0.4); } }`}</style>
        </>
      )}
      <div className="relative overflow-hidden rounded-[25px] shadow-2xl backdrop-blur-xl" style={{ background: `rgb(${P.pageRgb} / 0.95)` }}>
        <div className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]" style={{ gridTemplateRows: on ? "1fr" : "0fr" }}>
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pt-3.5 text-[12px]" style={{ color: P.mute }}>
              <span className="min-w-0 truncate">
                <span style={{ fontFamily: MONO, letterSpacing: "0.18em" }}>{title}</span>
                {note && (
                  <span className="ml-3" style={{ color: P.faint }}>
                    {note}
                  </span>
                )}
              </span>
              <button type="button" onClick={onClose} className="flex shrink-0 items-center gap-1.5">
                {t("hide")} <Kbd P={P} k="Esc" />
              </button>
            </div>
            <div ref={boxRef} className="overflow-x-hidden overflow-y-auto px-5 pt-3 pb-4" style={{ height: "calc(100dvh - 190px)", overscrollBehavior: "contain" }}>
              {children}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2" style={{ borderTop: on ? `1px solid ${P.rule}` : "1px solid transparent" }} onMouseDown={() => !on && onBarDown?.()}>
          {bar}
        </div>
      </div>
    </div>
  );
}

export const Kbd = ({ P, k }: { P: Pal; k: string }) => (
  <span className="shrink-0 rounded-[6px] border px-1.5 py-[1px] text-[11px]" style={{ fontFamily: MONO, borderColor: P.rule, color: P.faint }}>
    {k}
  </span>
);
