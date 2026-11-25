import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { reports } from "../db/schema.js";
import { branchHealth } from "./health.js";
import type { Report } from "./schemas.js";
import { getBranch, madeEarlier, worldIdOf } from "./world.js";
import { isNarrated } from "../narrate/play.js";
import { narrateReport } from "../narrate/report.js";

export type ReportKind = "checkpoint" | "manual" | "final";

/**
 * The review of a play, written from its whole story in one call (narrate/report.ts). A line made by an engine before
 * engine 12 keeps the reviews it had, and no new one is written for it.
 */
export async function generateReport(branchId: string, kind: ReportKind): Promise<{ id: string; title: string; data: Report }> {
  if (!isNarrated(getBranch(branchId).state)) throw madeEarlier(worldIdOf(branchId));
  return narrateReport(branchId, kind);
}

export function getReport(id: string) {
  const row = db().select().from(reports).where(eq(reports.id, id)).get();
  return row ? { ...row, data: { ...(row.data as Report), health: branchHealth(row.branchId) } } : undefined;
}

/** The reviews of a line (its comparisons with other lines are kept in the same table, and are not among them). */
export function listReports(branchId: string) {
  return db().select().from(reports).where(and(eq(reports.branchId, branchId), ne(reports.kind, "compare"))).orderBy(asc(reports.createdAt)).all();
}
