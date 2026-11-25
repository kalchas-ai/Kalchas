import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "../env.js";
import * as schema from "./schema.js";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

let instance: DB | null = null;

export function dbPath(): string {
  return process.env.KALCHAS_DB ?? join(repoRoot, "data", "kalchas.db");
}

export function db(): DB {
  if (instance) return instance;
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const d = drizzle(sqlite, { schema }) as DB;
  migrate(d, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../../drizzle") });
  sqlite.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(fact_id UNINDEXED, world_id UNINDEXED, text, tokenize='trigram')",
  );
  instance = d;
  return d;
}

/** Full-text search helper over facts (trigram tokenizer handles Chinese and English). */
export function ftsIndexFact(factId: string, worldId: string, text: string): void {
  db().$client.prepare("INSERT INTO facts_fts (fact_id, world_id, text) VALUES (?, ?, ?)").run(factId, worldId, text);
}

/**
 * Splits a query into FTS5 trigram terms. Latin words are kept whole; CJK runs are cut into
 * overlapping 4-character windows (stride 2) so that sentences without spaces still match.
 */
export function ftsTerms(query: string, max = 28): string[] {
  const terms = new Set<string>();
  // (split at spaces and punctuation, ASCII or CJK: the CJK marks escaped)
  for (const raw of query.split(/[\s,\uff0c\u3002\uff1b;\u3001:\uff1a()\uff08\uff09"'“”\u300a\u300b!?\uff01\uff1f\[\]\u3010\u3011]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const runs = part.match(/[\p{Script=Han}]+|[^\p{Script=Han}]+/gu) ?? [];
    for (const run of runs) {
      const chars = [...run];
      if (/\p{Script=Han}/u.test(run)) {
        if (chars.length <= 4) {
          if (chars.length >= 3) terms.add(run);
        } else for (let i = 0; i + 3 <= chars.length; i += 2) terms.add(chars.slice(i, i + 4).join(""));
      } else if (chars.length >= 3) terms.add(run);

    }

  }
  const all=[...terms];if(all.length<=max)return all;if(max<=0)return [];if(max===1)return [all[0]!];
  return Array.from({length:max},(_,i)=>all[Math.round(i*(all.length-1)/(max-1))]!);
}

/** Returns fact ids ranked by BM25 over any of the query terms. */
export function ftsSearch(worldId: string, query: string, limit: number): string[] {
  const terms = ftsTerms(query).map((t) => `"${t.replace(/"/g, "")}"`);
  if (terms.length === 0) return [];
  const rows = db()
    .$client.prepare(
      `SELECT fact_id FROM facts_fts WHERE world_id = ? AND facts_fts MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all(worldId, terms.join(" OR "), limit) as { fact_id: string }[];
  return rows.map((r) => r.fact_id);
}
