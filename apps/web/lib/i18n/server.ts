import "server-only";
import { cookies, headers } from "next/headers";
import { en, load } from "@/messages";
import { acceptLanguages, isLocale, LOCALE_COOKIE, pickLocale, translator, type Catalog, type Locale, type T } from "./locales";

/** The interface language a request asks for: the one set with the switch, else the browser's own. */
export async function requestLocale(): Promise<Locale> {
  const set = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(set)) return set;
  return pickLocale(acceptLanguages((await headers()).get("accept-language")));
}

export const catalogFor = (l: Locale): Promise<Catalog> => load(l);

/** The texts of one namespace for this request, in server code (a route, a server component). */
export async function getT(ns: string): Promise<T> {
  const l = await requestLocale();
  return translator(l, await catalogFor(l), ns, en);
}
