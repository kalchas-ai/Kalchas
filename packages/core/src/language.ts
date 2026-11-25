import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { worlds } from "./db/schema.js";
import { en, type Key, type Messages } from "./i18n/en.js";
import { zhCN } from "./i18n/zh-CN.js";
import { zhTW } from "./i18n/zh-TW.js";
import { ja } from "./i18n/ja.js";
import { ko } from "./i18n/ko.js";
import { es } from "./i18n/es.js";
import { ptBR } from "./i18n/pt-BR.js";
import { de } from "./i18n/de.js";
import { fr } from "./i18n/fr.js";

/**
 * The language of a project. Every instruction to a model is written in English; what a model writes for people to
 * read (questions, findings, the people of a world, what happens in it) is in the language of the project, and so
 * are the few sentences the program writes into a world itself.
 *
 * A project's language is read from the person's own words when they are first understood (or is the one fixed in
 * the settings), kept on the project as a BCP-47 tag, and handed on to whatever is made out of it. Nothing else in
 * the program names a language: the instruction is added in the three places every call goes through. The program's
 * own sentences come in nine languages (i18n/), the one closest to the project's chosen by matchLocale.
 */

const known = new Map<string, string>();

/** A tag as the settings or a model gave it, tidied ("zh_cn" → "zh-CN"); null when it is not one. */
export function cleanTag(tag: string | null | undefined): string | null {
  const t = (tag ?? "").trim().replace(/_/g, "-");
  if (!t || t.toLowerCase() === "auto") return null;
  try {
    return Intl.getCanonicalLocales(t)[0] ?? null;
  } catch {
    return null;
  }
}

/** The language of a project, as a tag: the language it was written to in; null while that has not been read yet. */
export function languageOf(worldId?: string | null): string | null {
  if (!worldId) return null;
  const had = known.get(worldId);
  if (had) return had;
  const row = db().select({ language: worlds.language }).from(worlds).where(eq(worlds.id, worldId)).get();
  const tag = cleanTag(row?.language);
  if (tag) known.set(worldId, tag);
  return tag;
}

/** Keeps the language read from someone's words on their project (a project keeps the first it was given). */
export function setLanguage(worldId: string, tag: string | null | undefined): void {
  const next = cleanTag(tag);
  if (!next || known.get(worldId) === next) return;
  const row = db().select({ language: worlds.language }).from(worlds).where(eq(worlds.id, worldId)).get();
  if (!row || cleanTag(row.language)) return;
  db().update(worlds).set({ language: next }).where(eq(worlds.id, worldId)).run();
  known.set(worldId, next);
}

/** What a new project made out of another starts with. */
export function languageFor(worldId?: string | null): string | null {
  return languageOf(worldId);
}

const NAMES = new Intl.DisplayNames(["en"], { type: "language" });
/** "Simplified Chinese (zh-Hans)": the name a model is told. */
export function languageName(tag: string): string {
  let name: string | undefined;
  try {
    name = NAMES.of(tag);
  } catch {
    name = undefined;
  }
  return name && name !== tag ? `${name} (${tag})` : tag;
}

/**
 * The one instruction on language, added to every call where it is sent (structured answers, the conversation, the
 * research notes). Field names and the fixed values of an enum are part of the program, not of what people read.
 */
export function languageRule(worldId?: string | null): string {
  const tag = languageOf(worldId);
  // not read yet (the first call, which is the one that reads it): the model settles it before writing anything else.
  // Said plainly, because the first fields of that answer were otherwise written in the language of these instructions.
  const which = tag
    ? languageName(tag)
    : "the language the person's own words are written in (settle which it is before you write anything; that these instructions are in English is no reason to write English: every sentence of yours, in every field, from the first one, is in their language)";
  return `Language: everything you write that a person will read is in ${which}, whatever language these instructions and the material are in. Names of people, organisations, products and documents stay as the material writes them. JSON field names, and values chosen from a fixed list (an enum), are copied exactly as given and never translated. And it is written the way people of this world's own place and time really write and speak: that country's spelling, everyday words and turns of phrase, and its own way of writing dates, times, money and measures (in American English: "organize", "color", "November 23, 2026", "9:10 a.m.", "one-on-one", "résumé", "apartment", "fall"), people talking as they do there. These instructions are written in another English and in another manner: they are no model for the spelling, the wording or the sound of anything you write, which are no model for how anything should sound. The instructions' own words for how this works are not words of that world either: nobody in it says or reads "the protagonist", "the play", "a moment", "a stop", "the pace", "weight", "a roll", "the record", "the stretch", "the road ahead", an item's or a fact's id; the person is "you", and the people of the world call them what they really would.`;
}

/** The languages the program writes its own sentences in; a project in any other gets them in English. */
export const LOCALES = ["en", "zh-CN", "zh-TW", "ja", "ko", "es", "pt-BR", "de", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

const TEXTS: Record<Locale, Messages> = { en, "zh-CN": zhCN, "zh-TW": zhTW, ja, ko, es, "pt-BR": ptBR, de, fr };

/** The language here closest to a tag: the tag itself, Chinese by its script ("zh-HK" → zh-TW, "zh" → zh-CN), any Portuguese → pt-BR, else the base language ("en-GB" → en); null for none. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  const t = cleanTag(tag);
  if (!t) return null;
  if (isLocale(t)) return t;
  const loc = new Intl.Locale(t);
  if (loc.language === "zh") return loc.maximize().script === "Hant" ? "zh-TW" : "zh-CN";
  if (loc.language === "pt") return "pt-BR";
  return isLocale(loc.language) ? loc.language : null;
}

/** The language the program writes its own sentences into a project in. */
export const localeOf = (worldId?: string | null): Locale => matchLocale(languageOf(worldId)) ?? "en";

type PluralBase<K> = K extends `${infer B}_other` ? B : never;
/** A sentence's key: one of the language files' keys, or for a counted one, the key without its plural ending. */
export type TextKey = Exclude<Key, `${string}_one` | `${string}_other`> | PluralBase<Key>;
export type TextVars = Record<string, string | number>;

/**
 * A sentence the program writes into a world itself (not a model), in the project's language (i18n/<locale>.ts,
 * English key by key where a language has no sentence of its own). `{name}` is filled from `vars`; with a numeric
 * `count`, the language's plural form of the key is used.
 */
export function tx(worldId: string | null | undefined, key: TextKey, vars?: TextVars): string {
  const locale = localeOf(worldId);
  const own = TEXTS[locale] as Record<string, string | undefined>;
  const base = TEXTS.en as Record<string, string | undefined>;
  const look = (k: string) => own[k] ?? base[k];
  let text: string | undefined;
  if (vars && typeof vars.count === "number") text = look(`${key}_${new Intl.PluralRules(locale).select(vars.count)}`) ?? look(`${key}_other`);
  text ??= look(key) ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Tests only: forget what was read. */
export function forgetLanguages(): void {
  known.clear();
}
