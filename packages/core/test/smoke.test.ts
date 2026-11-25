import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { useTempDb } from "./helpers.ts";

useTempDb();

test("the stand-in answers in place of the model, checked against the schema", async () => {
  const { generate, standInForGenerate } = await import("../src/llm/generate.ts");
  standInForGenerate(() => ({ n: 3 }));
  const out = await generate({ role: "director", purpose: "test" }, { schema: z.object({ n: z.number() }), system: "", prompt: "" });
  assert.equal(out.n, 3);
  standInForGenerate(() => ({ n: "three" }));
  await assert.rejects(() => generate({ role: "director", purpose: "test" }, { schema: z.object({ n: z.number() }), system: "", prompt: "" }));
  standInForGenerate(null);
});

test("a test runs on its own database, never the project's", async () => {
  const { dbPath } = await import("../src/db/client.ts");
  assert.ok(!dbPath().endsWith("data/kalchas.db"));
});
