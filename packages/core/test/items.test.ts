import { test } from "node:test";
import assert from "node:assert/strict";
import type { BranchState } from "../src/db/schema.ts";
import { change, view } from "../src/sim/items.ts";

const state = (): BranchState => ({ seatId: "me", circles: { ann: ["office"] } });
const ctx = (at: string, by: "you" | "sim" | "program" = "sim", operation = `op:${Math.random()}`) => ({ at, by, operation, reason: "test" });

test("a number is kept exactly as given: no bound, no clamp, no rounding, and it may fall below nothing", () => {
  const s = state();
  change(s, null, [{ whose: "me", what: "score", to: 50, unit: "points", known: "self", why: "start" }], ctx("2026-01-01"));
  change(s, null, [{ whose: "me", what: "score", to: 4000.123456789, known: "self", why: "a great leap" }], ctx("2026-01-02"));
  assert.deepEqual(view(s, null, { viewer: "me" })[0]!.value, { type: "number", n: 4000.123456789, unit: "points" });
  change(s, null, [{ whose: "me", what: "score", to: -100, known: "self", why: "and a fall" }], ctx("2026-01-03"));
  assert.deepEqual(view(s, null, { viewer: "me" })[0]!.value, { type: "number", n: -100, unit: "points" });
  // a change is recorded as what it was and what it now is, with nothing worked out beside them
  const last = s.changes!.at(-1)!;
  assert.deepEqual([last.mode, last.from, last.to], ["set", { type: "number", n: 4000.123456789, unit: "points" }, { type: "number", n: -100, unit: "points" }]);
  assert.ok(!("delta" in last) && !("input" in last) && !("calculation" in last));
});

test("nothing moves by itself as days pass: a quantity read later is what was last written; only an age is read off the calendar", () => {
  const s = state();
  change(s, null, [{ whose: "me", what: "cash", to: 42000, unit: "yuan", known: "self", why: "start", details: { floor: { below: 0, meaning: "out of money" } } }], ctx("2026-01-01"));
  change(s, null, [{ whose: "me", what: "age", to: 0, unit: "years", known: "public", why: "born", rule: { how: "calendar", id: "b", label: "by birthday", active: true, because: null, anchor: "1996-03-15", unit: "years", direction: 1 } }], ctx("2026-01-01"));
  const value = (key: string, at: string) => { const v = view(s, null, { viewer: "me", at }).find((i) => i.key === key)!.value; return v.type === "number" ? v.n : NaN; };
  assert.equal(value("cash", "2026-01-01"), 42000);
  assert.equal(value("cash", "2027-06-30"), 42000);
  assert.equal(value("age", "2026-03-14"), 29);
  assert.equal(value("age", "2026-03-15"), 30);
  // rewritten as what it now is, with what it was and why in its basis
  change(s, null, [{ whose: "me", what: "cash", to: 25000, known: "self", why: "four months on", details: { basis: "was about 42,000; four months at about 5,000 a month out and a first order of about 3,000 in; now about 25,000" } }], ctx("2026-05-01"));
  assert.equal(value("cash", "2026-04-30"), 42000);
  assert.equal(value("cash", "2026-05-01"), 25000);
  // an age is not written by hand
  assert.throws(() => change(s, null, [{ whose: "me", what: "age", to: 31, known: "public", why: "x" }], ctx("2026-05-01")), /follows the calendar/);
});

test("who can see an item is enforced here: its owner, those it names, a circle it went round, or everyone; and of two faces, the one they are shown", () => {
  const s = state();
  change(s, null, [{ whose: "bob", what: "debt", to: "three months behind on the rent", shownAs: "all paid up", about: ["me"], known: "involved", why: "x" }], ctx("2026-01-01"));
  change(s, null, [{ whose: "bob", what: "plan", to: "sell the shop in spring", known: "self", why: "x" }], ctx("2026-01-01"));
  change(s, null, [{ whose: "bob", what: "rumour", to: "the shop is for sale", known: "self", knownCircles: ["office"], why: "x" }], ctx("2026-01-01"));
  change(s, null, [{ whose: "me", what: "marked", to: "is being watched", known: "self", knownBy: [], why: "x", details: { ownerKnows: false } }], ctx("2026-01-01"));
  const seen = (viewer: string | null) => view(s, null, { viewer }).map((i) => (i.value.type === "text" ? i.value.text : ""));
  assert.deepEqual(seen("bob").sort(), ["sell the shop in spring", "the shop is for sale", "three months behind on the rent"].sort());
  assert.deepEqual(seen("me"), ["all paid up"]);
  assert.deepEqual(seen("ann"), ["the shop is for sale"]);
  assert.deepEqual(seen("zed"), []);
  assert.equal(seen(null).length, 4);
  // the truth comes out to one viewer and to nobody else
  const debt = view(s, null, { viewer: null }).find((i) => i.key === "debt")!;
  change(s, null, [{ whose: "bob", what: "debt", itemId: debt.id, reveal: "me", known: "self", why: "the landlord called" }], ctx("2026-01-05", "program"));
  assert.deepEqual(seen("me"), ["three months behind on the rent"]);
});

test("a statement the protagonist set stands until they change it; a quantity they set is where it started, and is rewritten as it moves", () => {
  const s = state();
  change(s, null, [{ whose: "me", what: "rule", to: "takeaway only", known: "self", why: "said so" }, { whose: "me", what: "stars", to: 50000, unit: "stars", known: "public", why: "said so" }], ctx("2026-01-01", "you"));
  assert.throws(() => change(s, null, [{ whose: "me", what: "rule", ends: true, known: "self", why: "dine-in pays better" }], ctx("2026-01-02", "sim")));
  change(s, null, [{ whose: "me", what: "stars", to: 50120, known: "public", why: "a week went by" }], ctx("2026-01-08", "sim"));
  change(s, null, [{ whose: "me", what: "rule", ends: true, known: "self", why: "changed my mind" }], ctx("2026-01-09", "you"));
  const now = view(s, null, { viewer: "me" });
  assert.deepEqual(now.map((i) => i.key), ["stars"]);
  assert.equal(now[0]!.value.type === "number" && now[0]!.value.n, 50120);
});

test("the same change handed in twice takes effect once; a batch is written whole or not at all", () => {
  const s = state();
  const line = { whose: "me", what: "cash", to: 100, unit: "yuan", known: "self" as const, why: "x" };
  change(s, null, [line], ctx("2026-01-01", "sim", "same"));
  change(s, null, [line], ctx("2026-01-01", "sim", "same"));
  assert.equal(s.changes!.length, 1);
  assert.throws(() => change(s, null, [{ ...line, to: 200 }, { ...line, what: "ghost", ends: true, to: undefined }], ctx("2026-01-02")));
  assert.equal(view(s, null, { viewer: "me" })[0]!.value.type === "number" && (view(s, null, { viewer: "me" })[0]!.value as { n: number }).n, 100);
});
