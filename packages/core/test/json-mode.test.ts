/**
 * Every model is asked for JSON with the shape written into the instructions, and what comes back is read and checked
 * here (src/llm/generate.ts): a model wraps its JSON in other things often enough.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
const { readObject } = await import("../src/llm/generate.ts");

test("the object in what a model wrote is read whether it stands alone, in a code fence, or inside a sentence", () => {
  assert.deepEqual(readObject('{"a":1}'), { a: 1 });
  assert.deepEqual(readObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(readObject('Sure, here is the result:\n{"a":{"b":[1,2]}}\nThat is all.'), { a: { b: [1, 2] } });
  assert.equal(readObject(""), undefined);
  assert.equal(readObject("There is no object here"), undefined);
  assert.equal(readObject('{"a":'), undefined);
});

test("an answer is put right where what was meant is plain from the shape: a bare list for an object holding one list, null for a field left out", async () => {
  const { mend } = await import("../src/llm/generate.ts");
  const shape = {
    type: "object",
    properties: { items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, note: { type: "string" }, when: { type: ["string", "null"] }, ids: { type: "array", items: { type: "string" } } }, required: ["name", "when"] } } },
    required: ["items"],
  };
  // a bare list, and inside it a null where a field may be left out (and one where null is a value)
  assert.deepEqual(mend([{ name: "a", note: null, when: null }], shape), { items: [{ name: "a", when: null }] });
  // a list where an object holding exactly that one list was asked for, one level down
  const groups = { type: "object", properties: { groups: { type: "array", items: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] } } }, required: ["groups"] };
  assert.deepEqual(mend({ groups: [["a", "b"], ["c"]] }, groups), { groups: [{ ids: ["a", "b"] }, { ids: ["c"] }] });
  // what is wrong in other ways is left as it is, for the check to say
  assert.deepEqual(mend({ items: "none" }, shape), { items: "none" });
});
