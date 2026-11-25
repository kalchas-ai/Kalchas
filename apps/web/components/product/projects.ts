import { useCallback } from "react";
import type { Moment, ProjectCard } from "@kalchas/core";
import { useLocale, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/locales";
import { BASE, day, ending } from "./shell";

/** What every page needs to show a project: where it opens, one line on where it has got to, and its moment. */

export type Projects = { projects: ProjectCard[]; monthUsd: number };

/** A project is one world: it opens on its own page, asking, building or playing as it stands. */
export const projectHref = (p: { id: string }) => `${BASE}/forecast/${p.id}`;

/** `t` is the texts of "product.projects"; `locale` the interface language, for the date. */
export function projectLine(p: ProjectCard, t: T, locale: string): string {
  if (p.status === "building") return t("building", { stage: p.build?.stage ?? t("preparing") });
  if (p.status === "failed") return t("failed");
  if (p.status === "stalled") return t("stalled");
  if (p.status === "paused") return t("paused");
  if (p.status === "clarifying") return t("clarifying");
  if (!p.latest) return t("ready");
  if (p.latest.ended) return t("ended", { ending: ending(p.latest.ended) });
  return t("playing", { date: day(p.latest.simTime, locale), step: p.latest.step });
}

/** projectLine for a component: (p) => its line in the interface language. */
export function useProjectLine(): (p: ProjectCard) => string {
  const t = useT("product.projects");
  const locale = useLocale();
  return useCallback((p: ProjectCard) => projectLine(p, t, locale), [t, locale]);
}

/** The moment, short: "Today", or the year of a day in the past. `t` is the texts of "product.projects". */
export const momentShort = (m: Moment, t: T, locale: string) => (m.past ? new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(Date.UTC(Number(m.at.slice(0, 4)), 0, 1)) : t("today"));

/** The moment, in full: "Today", or "September 8, 2008 · in someone's place". `t` is the texts of "product.projects". */
export const momentLong = (m: Moment, t: T, locale: string) => (m.past ? (m.seat ? t("momentSeat", { date: day(m.at, locale), seat: m.seat }) : day(m.at, locale)) : t("today"));
