import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { entities, worlds } from "../db/schema.js";
import { nowIso } from "../util.js";

/** A world as it is kept, and who is in it. */

type EntityRow = typeof entities.$inferSelect;

/** Width, case and the spaces around a name aside, a name is the same name only when it is written the same. */
const key = (s: string) => s.normalize("NFKC").trim().toLowerCase();

/** Resolves names to entity ids: a name or an alias exactly as listed, and nothing else. */
export class EntityIndex {
  private byKey = new Map<string, string>();
  constructor(public rows: EntityRow[]) {
    for (const e of rows) for (const n of [e.name, ...e.aliases]) if (n.trim()) this.byKey.set(key(n), e.id);
  }
  /** The world's people; with `entrants`, also those who entered a timeline during a play (only these ids). */
  static load(worldId: string, entrants?: ReadonlySet<string>): EntityIndex {
    return new EntityIndex(
      db()
        .select()
        .from(entities)
        .where(eq(entities.worldId, worldId))
        .all()
        .filter((e) => !e.branchId || !!entrants?.has(e.id)),
    );
  }
  resolve(name: string): string | null {
    return this.byKey.get(key(name)) ?? null;
  }
  resolveMany(names: string[]): string[] {
    return [...new Set(names.map((n) => this.resolve(n)).filter((x): x is string => !!x))];
  }
  name(id: string): string {
    return this.rows.find((e) => e.id === id)?.name ?? id;
  }
}

export function loadWorld(worldId: string) {
  const w = db().select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!w) throw new Error(`No such world: ${worldId}`);
  return w;
}

export function setWorld(worldId: string, patch: Partial<typeof worlds.$inferInsert>): void {
  db().update(worlds).set({ ...patch, updatedAt: nowIso() }).where(eq(worlds.id, worldId)).run();
}
