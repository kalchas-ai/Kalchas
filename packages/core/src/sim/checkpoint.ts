import { withoutWeb } from "../base/lookup.js";
import { db } from "../db/client.js";

/** No SQLite transaction is held across a model call. The durable undo record is branch-local;
 * restoring it never deletes another timeline's work or the record of paid model calls. */
const TABLES = ["sim_events", "memories", "known_facts", "decisions", "snapshots", "judgments", "reports", "entities", "actors", "edges"] as const;
type Row = Record<string, string | number | null>;
type Backup = { tag: "step-undo-v1"; branch: Row; tables: Record<string, Row[]>; sessionStatus: string };
const active = new Set<string>();
const committed = new Map<string, (() => void)[]>();

export function stepRunningHere(id: string): boolean { return active.has(id); }
export function afterStep(id: string, fn: () => void): void {
  const queue = committed.get(id);
  if (queue) queue.push(fn); else fn();
}

function readBackup(id: string): Backup | null {
  const row = db().$client.prepare("SELECT pending_action FROM branches WHERE id = ?").get(id) as { pending_action: string | null } | undefined;
  if (!row?.pending_action) return null;
  const value = JSON.parse(row.pending_action) as Partial<Backup>;
  return value.tag === "step-undo-v1" ? value as Backup : null;
}

function insert(table: string, row: Row): void {
  const keys = Object.keys(row);
  db().$client.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((k) => row[k]));
}

/** Recovery after a restart, or after a failed operation. Callers must exclude a live writer. */
export function restoreStep(id: string): boolean {
  if (active.has(id)) throw new Error("This step is still running and cannot be restored");
  const saved = readBackup(id);
  if (!saved) return false;
  const sql = db().$client;
  sql.transaction(() => {
    for (const table of TABLES) {
      sql.prepare(`DELETE FROM ${table} WHERE branch_id = ?`).run(id);
      for (const row of saved.tables[table] ?? []) insert(table, row);
    }
    const keys = Object.keys(saved.branch).filter((k) => k !== "id");
    sql.prepare(`UPDATE branches SET ${keys.map((k) => `${k} = ?`).join(",")} WHERE id = ?`).run(...keys.map((k) => saved.branch[k]), id);
    sql.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(saved.sessionStatus, saved.branch.session_id);
  })();
  return true;
}

/** The only wrapper for a step, the opening, and state-changing adviser tools. */
export async function atomicStep<T>(id: string, work: () => Promise<T>): Promise<T> {
  if (active.has(id)) throw new Error("This step is already running");
  restoreStep(id);
  const sql = db().$client;
  const branch = sql.prepare("SELECT * FROM branches WHERE id = ?").get(id) as Row | undefined;
  if (!branch) throw new Error("No such play");
  const session = sql.prepare("SELECT status FROM sessions WHERE id = ?").get(branch.session_id) as { status: string };
  const saved: Backup = { tag: "step-undo-v1", branch, tables: {}, sessionStatus: session.status };
  sql.transaction(() => {
    for (const table of TABLES) saved.tables[table] = sql.prepare(`SELECT * FROM ${table} WHERE branch_id = ?`).all(id) as Row[];
    sql.prepare("UPDATE branches SET pending_action = ? WHERE id = ?").run(JSON.stringify(saved), id);
  })();
  active.add(id);
  committed.set(id, []);
  try {
    // a play in progress does not go to the web (see withoutWeb); what is started for after the step runs outside it
    const result = await withoutWeb(work);
    sql.prepare("UPDATE branches SET pending_action = NULL WHERE id = ?").run(id);
    const callbacks = committed.get(id) ?? [];
    committed.delete(id);
    active.delete(id);
    // Background work cannot turn a committed turn into a failed one.
    for (const fn of callbacks) {
      try { fn(); } catch (err) { console.error("A background task after the commit failed to start", err); }
    }
    return result;
  } catch (err) {
    committed.delete(id);
    active.delete(id);
    restoreStep(id);
    throw err;
  }
}
