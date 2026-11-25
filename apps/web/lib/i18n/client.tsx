"use client";

import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en, load } from "@/messages";
import { LOCALE_COOKIE, translator, type Catalog, type Locale, type T, type Vars } from "./locales";

/**
 * The interface language on the page: the provider (set up once, in the root layout, with the language the request
 * asked for and its texts), `useT(namespace)` for the texts of one source file, `useLocale()` for dates and numbers,
 * and `useSetLocale()` for the switch. See locales.ts.
 */

type Ctx = { locale: Locale; catalog: Catalog; setLocale: (l: Locale) => void };
const I18n = createContext<Ctx>({ locale: "en", catalog: en, setLocale: () => {} });

export function I18nProvider({ locale, catalog, children }: { locale: Locale; catalog: Catalog; children: ReactNode }) {
  const [state, setState] = useState({ locale, catalog });
  const setLocale = useCallback((l: Locale) => {
    void load(l).then((c) => {
      try {
        document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      } catch {}
      document.documentElement.lang = l;
      setState({ locale: l, catalog: c });
    });
  }, []);
  const value = useMemo(() => ({ ...state, setLocale }), [state, setLocale]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

/** The interface language now (for Intl: dates, numbers, lists). */
export const useLocale = () => useContext(I18n).locale;
export const useSetLocale = () => useContext(I18n).setLocale;

/** The texts of one namespace (one source file): t("key") or t("key", { name: "…", count: 3 }). */
export function useT(ns: string): T {
  const { locale, catalog } = useContext(I18n);
  return useMemo(() => translator(locale, catalog, ns, en), [locale, catalog, ns]);
}

/**
 * A text with marked parts, for words inside a sentence that are drawn differently: "Ask <b>{name}</b> first" with
 * { b: (s) => <b>{s}</b> }. Tags are plain names and do not nest; anything unmarked is kept as text.
 */
export function rich(text: string, tags: Record<string, (chunk: string) => ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const tag = tags[m[1]!];
    out.push(<Fragment key={m.index}>{tag ? tag(m[2]!) : m[2]}</Fragment>);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out.length === 1 ? out[0] : <>{out}</>;
}

export type { T, Vars, Locale };
