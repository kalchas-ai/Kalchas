/**
 * A call can show its answer while the model writes it (src/llm/generate.ts, the `stream` option): what is shown is
 * one field's text read out of the JSON as far as it has arrived, and it only ever grows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
const { partialField, generate, standInForGenerate } = await import("../src/llm/generate.ts");

/** What is read at every length the text could have been cut at, in order. */
const atEveryCut = (text: string, field: string) => Array.from({ length: text.length + 1 }, (_, n) => partialField(text.slice(0, n), field));

test("the field is read as far as it has arrived, whatever the cut, and what is read only grows", () => {
  const text = '{"title":"T","story":"He said \\"go\\" \\\\ then\\nleft \\u00e9\\ud83d\\ude00 end","n":3}';
  const whole = 'He said "go" \\ then\nleft é😀 end';
  assert.equal(partialField(text, "story"), whole);
  let last = "";
  for (const v of atEveryCut(text, "story")) {
    if (v === undefined) {
      assert.equal(last, "", "once begun, the field is never lost");
      continue;
    }
    assert.ok(v.startsWith(last), `${JSON.stringify(v)} goes on from ${JSON.stringify(last)}`);
    // an escape cut in half, or half of a surrogate pair, is never shown
    assert.ok(!/[\ud800-\udbff]$/.test(v), "no lone first half of a pair at the end");
    last = v;
  }
  assert.equal(last, whole);
});

test("before the field begins nothing is read; an escape cut off at the end waits for the rest", () => {
  assert.equal(partialField("", "story"), undefined);
  assert.equal(partialField('{"title":"T"', "story"), undefined);
  assert.equal(partialField('{"story"', "story"), undefined);
  assert.equal(partialField('{"story":', "story"), undefined);
  assert.equal(partialField('{"story": "', "story"), "");
  assert.equal(partialField('{"story":"ab\\', "story"), "ab");
  assert.equal(partialField('{"story":"ab\\u00', "story"), "ab");
  assert.equal(partialField('{"story":"ab\\u00e9', "story"), "abé");
  assert.equal(partialField('{"story":"ab\\ud83d', "story"), "ab");
  assert.equal(partialField('{"story":"ab\\ud83d\\ude', "story"), "ab");
  assert.equal(partialField('{"story":"ab\\ud83d\\ude00', "story"), "ab😀");
  // characters outside ASCII, written as they are rather than escaped: Chinese for "Chinese, written directly"
  assert.equal(partialField('{"story":"\u4e2d\u6587\u76f4\u63a5\u5199', "story"), "\u4e2d\u6587\u76f4\u63a5\u5199");
});

test("a field that is complete reads whole while others follow it; a code fence before the object is passed over", () => {
  assert.equal(partialField('{"story":"done","after":"x', "story"), "done");
  assert.equal(partialField('{"story":"done","after":{"story":"no"}}', "story"), "done");
  assert.equal(partialField('```json\n{ "story" : "in a fence', "story"), "in a fence");
});

test("a key of the same name inside a nested value is not the field", () => {
  const text = '{"world":{"story":"inner","list":[{"story":"deeper"},"]}"]},"notes":["{\\"story\\":\\"x\\"}"],"n":-1.5e3,"ok":true,"nil":null,"story":"outer';
  assert.equal(partialField(text, "story"), "outer");
  // while the nested value is still arriving, its inner key is not read as the field
  assert.equal(partialField('{"world":{"story":"inner', "story"), undefined);
  assert.equal(partialField('{"world":{"story":"inner"}', "story"), undefined);
  // a number still arriving at the very end may go on: nothing after it is read yet
  assert.equal(partialField('{"n":12', "story"), undefined);
});

test("a field that is absent, not a string, or text that is not an object reads as nothing", () => {
  assert.equal(partialField('{"title":"T","n":1}', "story"), undefined);
  assert.equal(partialField('{"story":12}', "story"), undefined);
  assert.equal(partialField('{"story":{"text":"x"}}', "story"), undefined);
  assert.equal(partialField("no object here", "story"), undefined);
  assert.equal(partialField('["story","x"]', "story"), undefined);
});

test("in a test, a call that streams is shown the stand-in's field whole, once, and returns as without streaming", async () => {
  const schema = z.object({ title: z.string(), story: z.string() });
  standInForGenerate(() => ({ title: "T", story: "the whole story" }));
  try {
    const seen: string[] = [];
    const out = await generate({ role: "builder", purpose: "t" }, { schema, system: "s", prompt: "p", stream: { field: "story", onDelta: (v) => seen.push(v) } });
    assert.deepEqual(out, { title: "T", story: "the whole story" });
    assert.deepEqual(seen, ["the whole story"]);
    // a field the answer does not have as text is not shown at all
    const none: string[] = [];
    await generate({ role: "builder", purpose: "t" }, { schema, system: "s", prompt: "p", stream: { field: "missing", onDelta: (v) => none.push(v) } });
    assert.deepEqual(none, []);
  } finally {
    standInForGenerate(null);
  }
});
