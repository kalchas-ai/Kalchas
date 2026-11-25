"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/logo-lab/mark";
import { SANS, palette, type Pal, type PaletteName } from "@/components/kit/palette";
import { LocaleSwitch } from "@/components/kit/locale-switch";
import { useLocale, useT } from "@/lib/i18n/client";

/**
 * The product's frame: the palette (a setting, remembered in this browser), the top bar with where you are, and
 * small helpers every page uses — links, buttons, talking to the engine, polling while it works.
 */

export const BASE = "/app";

type Back = { href: string; label: string } | null;
type Ctx = { P: Pal; setPalette: (n: PaletteName) => void; crumb: string | null; setCrumb: (c: string | null) => void; back: Back; setBack: (b: Back) => void };
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

/** Names the current page in the top bar (a project's title, say) while it is shown, with a way back if it has one. */
export function useCrumb(title: string | null | undefined, back?: Back) {
  const { setCrumb, setBack } = useApp();
  useEffect(() => {
    setCrumb(title ?? null);
    return () => setCrumb(null);
  }, [title, setCrumb]);
  const href = back?.href ?? null;
  const label = back?.label ?? null;
  useEffect(() => {
    setBack(href && label ? { href, label } : null);
    return () => setBack(null);
  }, [href, label, setBack]);
}

export function ProductRoot({ children }: { children: ReactNode }) {
  const [name, setName] = useState<PaletteName>("graphite");
  const [crumb, setCrumb] = useState<string | null>(null);
  const [back, setBack] = useState<Back>(null);
  useEffect(() => {
    try {
      const p = localStorage.getItem("kalchas-palette");
      if (p === "bone" || p === "graphite") setName(p);
    } catch {}
  }, []);
  const setPalette = (n: PaletteName) => {
    setName(n);
    try {
      localStorage.setItem("kalchas-palette", n);
    } catch {}
  };
  const P = palette(name);
  const locale = useLocale();
  return (
    <AppCtx.Provider value={{ P, setPalette, crumb, setCrumb, back, setBack }}>
      <main lang={locale} className="kprod relative min-h-screen" style={{ background: P.page, color: P.ink, fontFamily: SANS, colorScheme: name === "graphite" ? "dark" : "light", ["--k-ink" as string]: P.inkRgb, ["--k-warm" as string]: P.warmRgb }}>
        {/* our own thin scrollbars, in the palette's colours, instead of the browser's */}
        <style>{`.kprod, .kprod * { scrollbar-width: thin; scrollbar-color: rgb(var(--k-ink) / 0.18) transparent; }
.kprod ::-webkit-scrollbar { width: 8px; height: 8px; }
.kprod ::-webkit-scrollbar-track { background: transparent; }
.kprod ::-webkit-scrollbar-thumb { background: rgb(var(--k-ink) / 0.16); border-radius: 99px; border: 2px solid transparent; background-clip: content-box; }
.kprod ::-webkit-scrollbar-thumb:hover { background: rgb(var(--k-ink) / 0.3); background-clip: content-box; }
.k-nav { color: rgb(var(--k-ink) / 0.5); } .k-nav:hover { color: rgb(var(--k-ink)); }
/* a line of a list: quiet until it is pointed at; no plate and no rule */
.k-line { color: rgb(var(--k-ink) / 0.42); transition: color .3s; } .k-line .k-line-main { color: rgb(var(--k-ink) / 0.86); transition: color .3s; }
.k-line:hover { color: rgb(var(--k-ink) / 0.8); } .k-line:hover .k-line-main { color: rgb(var(--k-ink)); }
/* somewhere to write with nothing round it: a line comes under it while it is written in */
.k-write { background: transparent; outline: none; box-shadow: inset 0 -1px 0 rgb(var(--k-ink) / 0); transition: box-shadow .3s; padding: 2px 0; }
.k-write:hover { box-shadow: inset 0 -1px 0 rgb(var(--k-ink) / 0.14); } .k-write:focus { box-shadow: inset 0 -1px 0 rgb(var(--k-warm) / 0.6); }
.k-write::placeholder { color: rgb(var(--k-ink) / 0.3); }
.k-bare::placeholder { color: rgb(var(--k-ink) / 0.38); }
@keyframes k-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes k-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes k-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes k-pop { 0% { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
.k-rise { animation: k-rise .45s cubic-bezier(.2,.7,.2,1) both; }
.k-fade { animation: k-fade .35s ease both; }
.k-pulse { animation: k-pulse 1.6s ease-in-out infinite; }
.k-pop { animation: k-pop .45s cubic-bezier(.2,.7,.2,1) both; }
@keyframes k-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.k-grow { transform-origin: left center; animation: k-grow .7s cubic-bezier(.2,.8,.2,1) both; }
@keyframes k-flash { 0%, 100% { background-color: transparent; } 18%, 55% { background-color: rgb(var(--k-warm) / 0.2); } }
.k-flash { animation: k-flash 1.7s ease 2; }
@keyframes k-sweep { from { background-position: -80% 0; } to { background-position: 180% 0; } }
.k-sweep { background-image: linear-gradient(100deg, transparent 0%, rgb(var(--k-warm) / 0.3) 50%, transparent 100%); background-size: 42% 100%; background-repeat: no-repeat; animation: k-sweep 1.6s cubic-bezier(.3,.6,.3,1) .35s 2 both; border-radius: 6px; }
@keyframes k-tick { 0% { transform: scale(0.3); } 60% { transform: scale(1.3); } 100% { transform: scale(1); } }
.k-tick { animation: k-tick .5s cubic-bezier(.2,.7,.2,1) both; }
html.k-vt::view-transition-old(root), html.k-vt::view-transition-new(root) { animation: none; }
html.k-vt::view-transition-group(k-card) { animation-duration: .5s; }
html.k-vt::view-transition-old(k-card) { animation: k-card-out .42s cubic-bezier(.45,0,.7,1) both; transform-origin: left center; }
html.k-vt::view-transition-new(k-card) { animation: k-card-in .5s cubic-bezier(.2,.7,.2,1) .08s both; }
@keyframes k-card-out { to { transform: translateX(-42%) scale(0.82); opacity: 0; } }
@keyframes k-card-in { from { transform: translateX(26%); opacity: 0; } }
/* loops that never stop: they start where they end, at an even speed. k-spin keeps the element centred on its own
   (top/left 50%), so nothing else may move it */
@keyframes k-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
.k-spin { transform: translate(-50%, -50%); translate: none; animation: k-spin 6s linear infinite; }
/* a dash running along a path drawn with pathLength 100 and a dash pattern 100 long: one period per loop */
@keyframes k-flow { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
.k-flow { animation: k-flow 1.8s linear infinite; }
@keyframes k-scan { from { left: 0; } to { left: calc(100% - 6rem); } }
.k-scan { animation: k-scan 2.6s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .k-flash, .k-sweep, .k-tick, .k-spin, .k-flow, .k-scan { animation: none; } }`}</style>
        <TopBar />
        {children}
      </main>
    </AppCtx.Provider>
  );
}

function TopBar() {
  const { P } = useApp();
  const t = useT("product.shell");
  const path = usePathname();
  const rest = path.replace(BASE, "").split("/").filter(Boolean);
  // (no bar and no line under it: the mark at the left, two words at the right, and the page behind them)
  const link = (href: string, label: string, on: boolean, icon: ReactNode) => (
    <A href={href} className="k-nav flex items-center gap-2 transition-colors duration-300" style={{ color: on ? P.ink : undefined }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {icon}
      </svg>
      {label}
    </A>
  );
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-11" style={{ background: `linear-gradient(rgb(${P.pageRgb} / 0.9), rgb(${P.pageRgb} / 0))` }}>
      <A href={BASE} className="k-nav pointer-events-auto transition-colors duration-300" style={{ color: P.ink }}>
        <Wordmark cap={20} />
      </A>
      <nav className="pointer-events-auto flex items-center gap-9 text-[14px]">
        {link(
          `${BASE}/all`,
          t("allProjects"),
          rest[0] === "all",
          <>
            <rect x="2" y="2" width="5" height="5" rx="1.2" />
            <rect x="9" y="2" width="5" height="5" rx="1.2" />
            <rect x="2" y="9" width="5" height="5" rx="1.2" />
            <rect x="9" y="9" width="5" height="5" rx="1.2" />
          </>,
        )}
        {link(
          `${BASE}/settings`,
          t("settings"),
          rest[0] === "settings",
          <>
            <path d="M2 4.5h6.2M11.8 4.5H14M2 11.5h2.2M7.8 11.5H14" />
            <circle cx="10" cy="4.5" r="1.8" />
            <circle cx="6" cy="11.5" r="1.8" />
          </>,
        )}
        <LocaleSwitch />
      </nav>
    </header>
  );
}

/* ---------------------------------------------------------------- links and buttons */

export function A({ href, children, className = "", style, onClick }: { href: string; children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void }) {
  return (
    <Link href={href} className={className} style={style} onClick={onClick}>
      {children}
    </Link>
  );
}

export function Button({ children, href, solid = false, warm = false, className = "", onClick, disabled = false, type = "button" }: { children: ReactNode; href?: string; solid?: boolean; warm?: boolean; className?: string; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  const { P } = useApp();
  const style: CSSProperties = solid ? { background: warm ? P.warm : P.ink, color: P.page, opacity: disabled ? 0.4 : 1 } : { border: `1px solid ${P.rule}`, color: P.ink, opacity: disabled ? 0.4 : 1 };
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] whitespace-nowrap transition-opacity ${className}`;
  return href && !disabled ? (
    <A href={href} className={cls} style={style} onClick={onClick}>
      {children}
    </A>
  ) : (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={style}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- the engine */

/** Calls the engine's API; a failure comes back as an Error with the engine's own message. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  // a failed request answers with a non-2xx status; an `error` field on a 2xx is data (e.g. why a project stopped)
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/**
 * Loads `path` and keeps it fresh: again every `every` ms while `keepGoing(data)` says so, and whenever `reload`
 * is called. Errors are kept, not thrown.
 */
export function useLive<T>(path: string | null, keepGoing: (d: T) => boolean = () => false, every = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keep = useRef(keepGoing);
  keep.current = keepGoing;
  const tick = useRef(0);
  const load = useCallback(async () => {
    if (!path) return null;
    const mine = ++tick.current;
    try {
      const d = await api<T>(path);
      if (mine !== tick.current) return d;
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      if (mine === tick.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  useEffect(() => {
    if (!data || !keep.current(data)) return;
    const id = window.setTimeout(() => void load(), every);
    return () => window.clearTimeout(id);
  }, [data, load, every]);
  return { data, error, reload: load, setData };
}

/* ---------------------------------------------------------------- small formats */

/** "2015-03-01" → "March 1, 2015" in the interface language (`useLocale()`); partial or odd dates pass through. */
export function day(d: string | null | undefined, locale: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : d;
}

/** An ending as the engine records it ("ending_1: …", with a full-width or plain colon) reads as plain text, without the internal id. */
export const ending = (reason: string) => reason.replace(/^\s*ending[_-]?\w*\s*[\uff1a:]\s*/i, "");

export const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`;

/** A centred note for a page that has nothing to show yet (loading, missing, failed). */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  const { P } = useApp();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-[18px]">{title}</div>
      {children && (
        <div className="max-w-[460px] text-[13px] leading-relaxed" style={{ color: P.mute }}>
          {children}
        </div>
      )}
    </div>
  );
}
