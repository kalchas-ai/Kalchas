/**
 * The interface languages. The interface opens in the browser's own language (the first of its languages that is
 * here, English when none is) and can be set to any of them from the switch at the top right, which is remembered
 * in a cookie. This is only the language of the interface: what a world says is written in the language of its
 * project (packages/core/src/language.ts).
 *
 * Every text of the interface lives in apps/web/messages/<locale>/<namespace>.json, one namespace per source file:
 * its path with "/" as "." and no extension, under components/ without that word ("flow-lab.flow" for
 * components/flow-lab/flow.tsx), under lib/ and app/ with it ("lib.stream", "app.api.chat.route"; "[id]" as "id").
 * English is complete and is what any other language falls back to, key by key. messages/GLOSSARY.md holds the
 * product's own words, so that every language says each of them one way.
 */

export const LOCALES = ["en", "zh-CN", "zh-TW", "ja", "ko", "es", "pt-BR", "de", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "kalchas-locale";

/** Every text of one language: namespace → key → text. */
export type Catalog = Record<string, Record<string, string>>;
export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** The language here closest to one tag ("zh-HK" → zh-TW, "zh" → zh-CN, "pt-PT" → pt-BR, "en-GB" → en); null for none. */
export function matchLocale(tag: string): Locale | null {
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(tag.trim())[0] ?? "";
  } catch {
    return null;
  }
  if (!canonical) return null;
  if (isLocale(canonical)) return canonical;
  const loc = new Intl.Locale(canonical);
  if (loc.language === "zh") return loc.maximize().script === "Hant" ? "zh-TW" : "zh-CN";
  if (loc.language === "pt") return "pt-BR";
  return isLocale(loc.language) ? loc.language : null;
}

/** The first of someone's languages that is here, in their own order; English when none is. */
export function pickLocale(prefs: readonly string[]): Locale {
  for (const p of prefs) {
    const m = matchLocale(p);
    if (m) return m;
  }
  return DEFAULT_LOCALE;
}

/** An Accept-Language header as a list of tags, the most wanted first ("fr-CH, fr;q=0.9, en;q=0.8" → fr-CH, fr, en). */
export function acceptLanguages(header: string | null | undefined): string[] {
  return (header ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);
      return { tag: (tag ?? "").trim(), q: q ? Number(q) : 1, i };
    })
    .filter((x) => x.tag && x.tag !== "*" && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.tag);
}

/** A language's name in itself, as the switch shows it ("Deutsch", "Français", "Português (Brasil)"). */
export function nativeName(l: Locale): string {
  const tag = l === "zh-CN" ? "zh-Hans" : l === "zh-TW" ? "zh-Hant" : l;
  let name = tag;
  try {
    name = new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? tag;
  } catch {}
  return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
}

/**
 * The texts of one namespace in one language, with English under it key by key. `{name}` is filled from vars; when
 * vars has a numeric `count`, `key_one` / `key_few` / `key_other` (the plural forms of the language) are tried first.
 * A key found nowhere comes back as itself, so a missing text shows and is not silently blank.
 */
export function translator(locale: Locale, catalog: Catalog, ns: string, english: Catalog): T {
  const own = catalog[ns] ?? {};
  const base = english[ns] ?? {};
  const look = (k: string) => own[k] ?? base[k];
  const plural = new Intl.PluralRules(locale);
  return (key, vars) => {
    let text: string | undefined;
    if (vars && typeof vars.count === "number") text = look(`${key}_${plural.select(vars.count)}`) ?? look(`${key}_other`);
    text ??= look(key) ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
  };
}
