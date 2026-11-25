import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.ts";

useTempDb();

const row = (id: string, name: string, aliases: string[] = []) => ({ id, worldId: "w", name, kind: "person", aliases, summary: "", person: true, tier: "cast" as const, branchId: null, createdAt: "" });

test("a name resolves only as written: the name or an alias exactly (width, case and outer spaces aside), never a part of another", async () => {
  const { EntityIndex } = await import("../src/world/store.ts");
  const ix = new EntityIndex([row("a", "IBM Corp", ["IBM"]), row("b", "You"), row("c", "Mother")]);
  assert.equal(ix.resolve("IBM"), "a");
  assert.equal(ix.resolve(" ibm corp "), "a");
  // "IBM" in fullwidth letters
  assert.equal(ix.resolve("\uFF29\uFF22\uFF2D"), "a");
  assert.equal(ix.resolve("YouTube"), null);
  assert.equal(ix.resolve("IBM Corporation"), null);
  assert.equal(ix.resolve("Mother (Aisha)"), null);
});
