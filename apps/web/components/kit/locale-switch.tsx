"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/product/shell";
import { useLocale, useSetLocale, useT } from "@/lib/i18n/client";
import { LOCALES, nativeName } from "@/lib/i18n/locales";

/**
 * The interface language, at the top right: the name of the one in use, which opens the list of all of them, each
 * in its own name. It sits with the words beside it and takes their size and colour.
 */
export function LocaleSwitch() {
  const { P } = useApp();
  const t = useT("kit.locale-switch");
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={t("label")} onClick={() => setOpen((o) => !o)} className="transition-colors duration-300 hover:opacity-100" style={{ color: open ? P.ink : undefined }}>
        {nativeName(locale)}
      </button>
      <ul
        role="listbox"
        aria-hidden={!open}
        aria-label={t("label")}
        className="absolute right-0 top-full z-50 mt-3 min-w-[168px] rounded-[10px] py-1.5"
        style={{
          background: P.page,
          boxShadow: `0 0 0 1px ${P.rule}, 0 12px 32px rgb(0 0 0 / 0.28)`,
          opacity: open ? 1 : 0,
          transform: open ? "none" : "translateY(-4px)",
          pointerEvents: open ? "auto" : "none",
          visibility: open ? "visible" : "hidden",
          transition: `opacity .22s ease, transform .22s ease, visibility 0s linear ${open ? "0s" : ".22s"}`,
        }}
      >
        {LOCALES.map((l) => (
          <li key={l} role="option" aria-selected={l === locale}>
            <button
              type="button"
              lang={l}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className="k-line block w-full px-4 py-1.5 text-left text-[13px]"
              style={l === locale ? { color: P.ink } : undefined}
            >
              {nativeName(l)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
