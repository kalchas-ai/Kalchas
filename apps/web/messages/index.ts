import type { Catalog, Locale } from "@/lib/i18n/locales";
import english from "./en";

/** English is always loaded: every other language falls back to it key by key. The rest load when they are chosen. */
export const en: Catalog = english;

const others: Record<Exclude<Locale, "en">, () => Promise<{ default: Catalog }>> = {
  "zh-CN": () => import("./zh-CN"),
  "zh-TW": () => import("./zh-TW"),
  ja: () => import("./ja"),
  ko: () => import("./ko"),
  es: () => import("./es"),
  "pt-BR": () => import("./pt-BR"),
  de: () => import("./de"),
  fr: () => import("./fr"),
};

export async function load(l: Locale): Promise<Catalog> {
  return l === "en" ? en : (await others[l]()).default;
}
