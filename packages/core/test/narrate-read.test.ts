/**
 * Engine 12 reads what the one model writes as tagged plain text: the parts of a stop, the notes and their changes,
 * the scene while it is still being written. Nothing here calls a model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
const { tagOf, tagsOf, partialTag, listLines, arrivedLines, happenedLine } = await import("../src/narrate/tags.ts");
const { readNotes, mergeNotes, noteLine, peopleCards } = await import("../src/narrate/notes.ts");
const { readStop, missing } = await import("../src/narrate/stop.ts");
const { markRound, keptMessages } = await import("../src/narrate/call.ts");

const STOP = `<kind>move</kind>
<day>2026-04-02</day>
<headline>You have to pick who runs the kitchen</headline>
<happened>
- 2026-03-30 | Mara | Came in early and ran the lunch service alone.
- 2026-04-01 | Teo | Asked for a word about the head cook's post.
</happened>
<scene>
The morning is cold.

Mara and Teo wait at the counter.
</scene>
<messages>
- 2026-04-01 | The bank | The loan is approved: 200,000.
</messages>
<options>
- Hire Mara :: Offer her 9,000 a month and the morning shift.
Tell Teo the truth.
- Hire Teo :: Offer him 8,000 a month.
</options>
<notes_patch>
- person | known | Mara | Cook, twelve years in hotels; wants a kitchen of her own one day.
- person | hidden | Mara | Has an offer from a rival and will take it if nothing comes by Friday.
- figure | known | Cash | about 260,000
- this line is not in the form
</notes_patch>
<milestone>
question: 1
came: yes
result: The doors opened.
turn: The loan came through.
figures: Loan = 200,000; Rent = 18,000 a month
</milestone>
<undercurrents>Teo will go to the rival if passed over; the bank wants a second guarantor by May.</undercurrents>`;

test("a stop is read into its parts; a detail that ran onto a second line stays with its way; a line of notes not in the form is kept as a note", () => {
  const { out, problems } = readStop(STOP, { step: 2, notBefore: "2026-03-29" });
  assert.equal(out.kind, "move");
  if (out.kind !== "move") return;
  assert.deepEqual(problems, []);
  assert.equal(out.day, "2026-04-02");
  assert.equal(out.scene, "The morning is cold.\n\nMara and Teo wait at the counter.");
  assert.deepEqual(out.happened, [
    { day: "2026-03-30", who: "Mara", what: "Came in early and ran the lunch service alone." },
    { day: "2026-04-01", who: "Teo", what: "Asked for a word about the head cook's post." },
  ]);
  assert.deepEqual(out.messages, [{ day: "2026-04-01", from: "The bank", gist: "The loan is approved: 200,000." }]);
  assert.deepEqual(out.options, [
    { title: "Hire Mara", detail: "Offer her 9,000 a month and the morning shift. Tell Teo the truth." },
    { title: "Hire Teo", detail: "Offer him 8,000 a month." },
  ]);
  assert.equal(out.patch.length, 4);
  assert.deepEqual(out.patch.map((e) => [e.kind, e.side, e.name]), [["person", "known", "Mara"], ["person", "hidden", "Mara"], ["figure", "known", "Cash"], ["note", "hidden", ""]]);
  assert.equal(out.patch[3]!.text, "this line is not in the form");
  assert.equal(out.milestones.length, 1);
  assert.deepEqual(out.milestones[0], { question: "1", came: true, card: { result: "The doors opened.", turn: "The loan came through.", figures: [{ label: "Loan", value: "200,000" }, { label: "Rent", value: "18,000 a month" }] } });
  assert.equal(out.ended, null);
});

test("what is off is mended where it stands: a day that goes back, a missing headline; a stop is asked for again only for its scene, or its ways when the story goes on", () => {
  const { out, problems } = readStop("<kind>move</kind><day>2026-03-01</day><scene>First line of the scene\nmore</scene><options>- Wait :: a week</options>", { step: 3, notBefore: "2026-03-10" });
  assert.equal(out.kind, "move");
  if (out.kind !== "move") return;
  assert.equal(out.day, "2026-03-10");
  assert.equal(out.headline, "First line of the scene");
  assert.deepEqual(out.happened, [], "what happened, left out, is none: the stop is not asked for again for it");
  assert.equal(problems.length, 2);
  assert.equal(missing("<kind>move</kind><day>2026-03-01</day><headline>x</headline>"), "the <scene>");
  assert.equal(missing("<kind>move</kind><scene>s</scene><options></options>"), "the <options> (the story has not ended)");
  assert.equal(missing("<kind>move</kind><scene>s</scene><ended>They died.</ended>"), null, "at the end there are no ways to give");
  assert.equal(missing("<kind>move</kind><scene>s</scene><options>- Go :: on</options>"), null, "nothing else is asked for: no day, no headline, no notes");
  assert.equal(missing(STOP), null);
  assert.equal(missing("<kind>question</kind><answer>About three weeks.</answer>"), null);
  const q = readStop("<kind>question</kind>\n<answer>About three weeks.</answer>", { step: 3, notBefore: "2026-03-10" });
  assert.deepEqual(q.out, { kind: "question", answer: "About three weeks." });
});

test("an exchange is kept as it happened, without the model's thinking and without what was said to the provider alone", () => {
  const kept = keptMessages([
    { role: "assistant", content: [{ type: "reasoning", text: "thinking…" }, { type: "text", text: "Let me look.", providerOptions: { openrouter: { reasoning_details: [] } } }, { type: "tool-call", toolCallId: "a", toolName: "web_search", input: { query: "q" } }], providerOptions: { openrouter: { cacheControl: { type: "ephemeral" } } } },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "a", toolName: "web_search", output: { type: "json", value: { results: [{ title: "T", excerpt: "E" }] } } }] },
    { role: "assistant", content: [{ type: "reasoning", text: "only thinking" }] },
    { role: "assistant", content: [{ type: "text", text: "<kind>move</kind>" }] },
  ] as never);
  assert.deepEqual(kept, [
    { role: "assistant", content: [{ type: "text", text: "Let me look." }, { type: "tool-call", toolCallId: "a", toolName: "web_search", input: { query: "q" } }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "a", toolName: "web_search", output: { type: "json", value: { results: [{ title: "T", excerpt: "E" }] } } }] },
    { role: "assistant", content: [{ type: "text", text: "<kind>move</kind>" }] },
  ]);
});

test("the scene is read while it is written, and what is read only grows; a closing tag cut off at the end waits for the rest", () => {
  let last = "";
  for (let n = 0; n <= STOP.length; n++) {
    const v = partialTag(STOP.slice(0, n), "scene");
    if (v === undefined) {
      assert.equal(last, "");
      continue;
    }
    assert.ok(v.startsWith(last.trimEnd()) || last.startsWith(v), `${JSON.stringify(v)} after ${JSON.stringify(last)}`);
    assert.ok(!v.includes("</"), "no part of the closing tag is shown");
    last = v;
  }
  assert.equal(last, "The morning is cold.\n\nMara and Teo wait at the counter.");
  // a tag written twice is read from its last complete writing
  assert.equal(tagOf("<scene>a</scene> then <scene>b</scene>", "scene"), "b");
  assert.deepEqual(tagsOf("<milestone>a</milestone><milestone>b</milestone>", "milestone"), ["a", "b"]);
  assert.deepEqual(listLines("(none)"), []);
});

test("notes merge: a line takes the place of the one with the same kind, side and name; gone removes it; road lines are the whole road; a note is added", () => {
  const base = readNotes(["- person | known | Ann | Lawyer.", "- person | hidden | Ann | Wants out.", "- road | known | May | The hearing.", "- road | known | June | The ruling.", "- force | known | Rates | Rising, about 60%."].join("\n"), 0, "2026-01-01");
  const patch = readNotes(["- person | known | ann | Lawyer, now on the other side.", "- force | known | Rates | gone", "- road | known | July | The appeal.", "- strange line"].join("\n"), 3, "2026-02-01");
  const merged = mergeNotes(base, patch);
  assert.deepEqual(merged.map((e) => [e.kind, e.side, e.name, e.text]), [
    ["person", "known", "ann", "Lawyer, now on the other side."],
    ["person", "hidden", "Ann", "Wants out."],
    ["road", "known", "July", "The appeal."],
    ["note", "hidden", "", "strange line"],
  ]);
  assert.deepEqual(peopleCards(merged).map((c) => [c.known, c.hidden]), [["Lawyer, now on the other side.", "Wants out."]]);
  assert.equal(noteLine("figure | known | Debt | 3 | 4", 1, "d").text, "3 | 4");
});

test("the cache marks of a round: the person's turn before this one, this turn, and the last of what the last round looked up; never more", () => {
  const msgs = [
    { role: "user" as const, content: "opening" },
    { role: "assistant" as const, content: "stop 1" },
    { role: "user" as const, content: "move 1" },
  ];
  const has = (x: { providerOptions?: unknown }) => !!(x.providerOptions as { openrouter?: { cacheControl?: unknown } } | undefined)?.openrouter?.cacheControl;
  // marks on a message and on each of its parts: what the provider turns into marks
  const marks = (m: { providerOptions?: unknown; content: unknown }) => Number(has(m)) + (Array.isArray(m.content) ? m.content.filter((p) => has(p as never)).length : 0);
  assert.deepEqual(markRound(msgs, 3).map(marks), [1, 0, 1]);
  const result = (id: string) => ({ type: "tool-result" as const, toolCallId: id, toolName: "web_search", output: { type: "json" as const, value: {} } });
  const round = [...markRound(msgs, 3), { role: "assistant" as const, content: [{ type: "tool-call" as const, toolCallId: "a", toolName: "web_search", input: {} }, { type: "tool-call" as const, toolCallId: "b", toolName: "web_search", input: {} }] }, { role: "tool" as const, content: [result("a"), result("b")] }];
  const next = markRound(round as never, 3);
  assert.deepEqual(next.map(marks as never), [1, 0, 1, 0, 1]);
  // (two things looked up at once: the mark is on the last of them alone)
  assert.deepEqual((next[4]!.content as { providerOptions?: unknown }[]).map((p) => has(p)), [false, true]);
  // the marks of the round before are taken off, whatever was marked
  const later = markRound([...next, { role: "assistant", content: "x" }, { role: "tool", content: [result("c")] }] as never, 3);
  assert.deepEqual(later.map(marks as never), [1, 0, 1, 0, 0, 0, 1]);
  // a long play: the setting up, stops with what they looked up, moves; the turn before the move now made is marked,
  // not the first (what the call before wrote to the cache ends there)
  const long = [{ role: "user", content: "setting up" }, { role: "assistant", content: "notes" }, { role: "user", content: "begin" }, { role: "assistant", content: "stop 1" }, { role: "user", content: "move 1" }, { role: "assistant", content: "stop 2" }, { role: "user", content: "move 2" }];
  assert.deepEqual(markRound(long as never, 7).map(marks as never), [0, 0, 0, 0, 1, 0, 1]);
});

test("what each side did is read leniently: a line not in the form keeps its words as what was done, with any day in it", () => {
  assert.deepEqual(happenedLine("2026-05-02 | The council | Put the vote off | again"), { day: "2026-05-02", who: "The council", what: "Put the vote off | again" });
  assert.deepEqual(happenedLine("The rain flooded the cellar on 2026-05-03"), { day: "2026-05-03", who: "", what: "The rain flooded the cellar on 2026-05-03" });
  const { out } = readStop("<kind>move</kind><day>2026-05-04</day><happened>\n(none)\n</happened><scene>s</scene><options>- Go :: on</options>", { step: 2, notBefore: "2026-05-01" });
  assert.equal(out.kind, "move");
  if (out.kind === "move") assert.deepEqual(out.happened, []);
});

test("a stop dated before a message or something that happened in it moves on to the latest of them, said in the problems", () => {
  const text = [
    "<kind>move</kind><day>2026-06-01</day><headline>h</headline>",
    "<happened>\n- 2026-06-03 | Ines | Signed the lease.\n- not a date | Ines | Paid.\n</happened>",
    "<scene>s</scene>",
    "<messages>\n- 2026-06-05 | The bank | The transfer cleared.\n- 2026-05-30 | Ines | See you Monday.\n</messages>",
    "<options>- Go :: on</options>",
    "<notes_patch>\n- figure | known | Cash | about 9,000\n</notes_patch>",
  ].join("\n");
  const { out, problems } = readStop(text, { step: 4, notBefore: "2026-05-28" });
  assert.equal(out.kind, "move");
  if (out.kind !== "move") return;
  assert.equal(out.day, "2026-06-05");
  assert.equal(out.patch[0]!.since, "2026-06-05", "what the stop changed is kept on its day as moved");
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /2026-06-05/);
  // what is dated before or on the stop's day leaves it where it is
  const same = readStop(text.replace("<day>2026-06-01</day>", "<day>2026-06-09</day>"), { step: 4, notBefore: "2026-05-28" });
  assert.deepEqual([same.out.kind === "move" && same.out.day, same.problems], ["2026-06-09", []]);
});

test("what a tool call left in the text is taken out of what is read; the play's own tags and any other < stay", () => {
  const text = [
    "<kind>move</kind>",
    "<headline>Prices fall <5% this week</headline>",
    '<scene>\nThe hall is full.\n<invoke name="web_search">\n<parameter name="query">hall rental</parameter>\n</invoke>\nThe mayor waves.\n</scene>',
    '<options>\n- Wait :: a week</parameter>\n- Go :: now <b>today</b>\n</options>',
  ].join("\n");
  assert.equal(tagOf(text, "headline"), "Prices fall <5% this week");
  assert.equal(tagOf(text, "scene"), "The hall is full.\n\nhall rental\n\nThe mayor waves.");
  assert.deepEqual(listLines(tagOf(text, "options")), ["Wait :: a week", "Go :: now today"]);
  assert.ok(!partialTag(text.slice(0, text.indexOf("The mayor")), "scene")!.includes("<"), "nor is it shown while the scene is written");
  assert.equal(tagOf("<answer>a < b and c > d</answer>", "answer"), "a < b and c > d", "a < that does not make a tag stays");
  // what the model wrote is not touched: only what is read from it
  assert.ok(text.includes("</invoke>"));
});

test("what each side did is shown line by line as it is written: a line still being written waits for the rest", () => {
  let last: string[] = [];
  for (let n = 0; n <= STOP.length; n++) {
    const v = arrivedLines(STOP.slice(0, n), "happened");
    if (v === undefined) continue;
    assert.ok(v.length >= last.length, "what is shown only grows");
    for (const [i, x] of v.entries()) assert.ok(x.endsWith("."), `a line shown whole: ${JSON.stringify(x)} after ${JSON.stringify(last[i])}`);
    last = v;
  }
  assert.deepEqual(last.map(happenedLine).map((x) => x.who), ["Mara", "Teo"]);
});

test("a closing written wrong or left out ends a part where the next begins: nothing after it, hidden notes least of all, is read into it", () => {
  const text = [
    "<kind>move</kind>",
    "<day>2030-05-02</day>",
    "<headline>The gate opens</headline>",
    "<happened>- 2030-05-01 | The mayor | Sent word he would not resist.\n- 2030-05-02 | The garrison | Stood aside.</happend>",
    "<scene>They stand aside as you ride in.</scene>",
    "<messages>- 2030-05-02 | The mayor | The keys are yours.</messages>",
    "<options>- Ride on :: Take the road north tonight.</options>",
    "<notes_patch>- person | hidden | The mayor | Means to write to the king tonight.</notes_patch>",
    "<undercurrents>The mayor is not to be trusted.",
  ].join("\n");
  const { out } = readStop(text, { step: 2, notBefore: "2030-05-01" });
  assert.equal(out.kind, "move");
  if (out.kind !== "move") return;
  assert.deepEqual(out.happened.map((x) => x.who), ["The mayor", "The garrison"]);
  assert.equal(out.happened[1]!.what, "Stood aside.");
  assert.equal(out.scene, "They stand aside as you ride in.");
  assert.equal(out.options.length, 1);
  // as it is written, too: once the scene has begun, what each side did stops where it did
  for (const n of [text.indexOf("<scene>") + 20, text.indexOf("<notes_patch>") + 60, text.length]) {
    const lines = arrivedLines(text.slice(0, n), "happened")!;
    assert.equal(lines.length, 2, `at ${n}`);
    assert.ok(!lines.some((l) => /hidden|Ride on|keys/.test(l)));
  }
  assert.equal(partialTag(text, "happened")!.includes("<scene>"), false);
  // a part whose later writing was cut off is read from the last one finished
  assert.equal(tagOf("<scene>first</scene>\n<scene>second, cut", "scene"), "first");
  // an undercurrents left open at the very end is never closed
  assert.equal(tagOf(text, "undercurrents"), undefined);
});
