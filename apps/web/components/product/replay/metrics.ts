import type { PlayView } from "@kalchas/core";

/** A world's own metrics (each world picks its own: cash runway, board trust…), formatted. */

export type Metric = Pick<PlayView["world"]["metrics"][number], "key" | "label" | "unit"> & { description?: string; criticalBelow?: number | null };

/** Ten thousand and up in the interface language's short form ("12K", "1.2M"), with at most one decimal; below it as is. */
function compact(n: number, locale: string): string {
  if (Math.abs(n) >= 1e4) return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** `locale` is the interface language (`useLocale()`). */
export function fmtMetric(m: Metric, v: number | undefined, locale: string): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  if (m.unit === "%") return `${compact(v, locale)}%`;
  return `${compact(v, locale)}${m.unit ? ` ${m.unit}` : ""}`;
}

/** Metrics no longer say what scale they live on, so none is drawn as a share of one. */
export function scale(_m: Metric, _v: number | undefined): number | null {
  return null;
}

/** A metric says which way is bad only through its floor: one with a floor gets worse as it falls. */
export const worse = (m: Metric, from: number | undefined, to: number | undefined) => m.criticalBelow != null && from !== undefined && to !== undefined && to < from;

export function delta(_m: Metric, from: number | undefined, to: number | undefined, locale: string): string | null {
  if (from === undefined || to === undefined || from === to) return null;
  const d = to - from;
  return `${d > 0 ? "+" : "−"}${compact(Math.abs(d), locale)}`;
}
