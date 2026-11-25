import { randomInt } from "node:crypto";
import { z } from "zod";
import { generate } from "../llm/generate.js";
import type { CallContext } from "../llm/trace.js";
import { ConditionsSchema, cite, conditionsText, drawBucket, isRest, lookUpDistribution, type BaseRecord, type Conditions } from "../base/lookup.js";
import { jobStopped } from "../jobs/queue.js";
import { rngAt } from "../util.js";
import { randomSlots, setupText, type Draw, type FillPending, type PlannedDraw, type Setup } from "./setup.js";

/**
 * Filling in the setup before anything is researched: a slot the person left to chance (or did not say, and only a
 * real distribution can settle) is drawn by the program from real figures, looked up live. The model only says what
 * has to be drawn, in what order and from which group; the program looks the figures up and draws; the model then
 * writes the slots from what came out, and the program checks that it did.
 *
 * Nothing is passed on half settled: a draw that could not be made (and every draw that leans on it) is reported, the
 * setup is not marked as filled, and what was settled is kept so the fill goes on from there. Otherwise the model
 * downstream would settle the slot itself, which is the model drawing instead of the program.
 */

const PlanSchema = z.object({
  draws: z
    .array(
      z.object({
        slot: z.enum(["world", "role", "goal"]).describe("Which slot this draw settles (the start day is not drawn: a random birth is a birth on the start day)"),
        variable: z.string().describe("What is drawn, e.g. \"country of birth\", \"urban or rural\", \"sex\", \"household income band\""),
        conditions: ConditionsSchema.describe("Which group it is drawn from. In rest and group, what an earlier draw came out as may be used, written {1}, {2} (the result of draw number so-and-so), e.g. rest \"newborns born in {1}\""),
        hint: z.string().describe("How to cut it into buckets so that what comes out can be used as it stands, e.g. \"by country, the countries with small populations merged into other\""),
      }),
    )
    .describe("The draws to make, in order: a later draw may depend on the result of an earlier one. Draw only what really has to be random and has to be settled before the play can open; what they said is not drawn"),
});

const WriteSchema = z.object({
  world: z.string().describe("A natural phrase: when and where, e.g. \"2026, rural Uttar Pradesh, India\""),
  role: z.string().describe("A natural phrase: who is played, e.g. \"a newborn baby girl\""),
  start: z.string().describe("A natural phrase: the situation on the start day, e.g. \"the day of birth\""),
  goal: z.string().nullable(),
});

/** A draw that could not be made: its number in the plan (0: a slot left to chance that the plan drew nothing for). */
export type FillFailure = { n: number; variable: string; why: string };

/**
 * Draws the random slots of a setup. Returns the setup with the draws and the slots written from them, or, when a
 * draw could not be made, the setup as far as it got (`pending`, not `filled`) and what failed.
 */
export async function fillSetup(ctx: CallContext, setup: Setup, question: string, log: (m: string) => void = () => {}, save: (setup: Setup) => void = () => {}): Promise<{ setup: Setup; failed: FillFailure[] }> {
  if (!randomSlots(setup).length) return { setup: { ...setup, filled: true }, failed: [] };
  const todo = randomSlots(setup).filter((k): k is PlannedDraw["slot"] => k !== "start");
  // every roll from the setup's own seed, counted on from where an earlier attempt stopped
  const seed = setup.seed ?? randomInt(2 ** 31);
  let k = setup.pending?.k ?? 0;
  const roll = () => rngAt(seed, k++);
  const previous = setup.pending?.plan ?? [];
  const missingSlots = todo.filter((slot) => !previous.some((d) => d.slot === slot));
  const plan: PlannedDraw[] = [...previous];
  if (!setup.pending || missingSlots.length) {
    const extra = await generate(
        { ...ctx, role: "builder", purpose: "setup_draws", think: false },
        {
          schema: PlanSchema,
          temperature: 0.2,
          system: `You are completing the setup of a world to be played. These slots are to be drawn at random by the program from real distributions: ${missingSlots.join(", ")}. List the draws to make, in order: each draw is a distribution for which real statistics can be found, and a later draw takes the result of an earlier one as its condition.
- The place is drawn all the way down to the level that decides daily life: country → province or state → town or countryside (e.g. the country of birth of "newborns worldwide in 2026" → the state of birth of "newborns born in {1} in 2026" → urban or rural for "newborns of {2}");
- each random attribute of the person themself (sex and so on) is one draw;
- the start day is not drawn (a random birth is a birth on the start day);
- list only what has to be settled for the opening: what comes later in the life (which school, which work) will happen in the play by its real probability; the family, and who the parents are, are drawn from their distributions when the characters are made after the opening; none of that is drawn here.`,
          prompt: `Their own words: ${question}\n\n${setupText(setup)}${previous.length ? `\n\nDraws already there (do not list them again; only add the draws for the slots still missing; {n} still refers to the number in the whole list):\n${previous.map((p, i) => `${i + 1}. ${p.slot} ${p.variable}: ${setup.pending?.done[i]?.at(-1)?.picked ?? "not done"}`).join("\n")}` : ""}`,
        },
    );
    plan.push(...extra.draws);
  }
  const done: FillPending["done"] = plan.map((_, i) => structuredClone(setup.pending?.done[i] ?? null));
  const failed: FillFailure[] = [];
  const checkpoint = () => {
    const { filled: _f, ...rest } = setup;
    const pending: Setup = { ...rest, seed, pending: { plan, done, k } };
    save(structuredClone(pending));
    return pending;
  };
  checkpoint();
  const outcome = (n: number) => {
    const last = done[n - 1]?.at(-1);
    return last && !isRest(last) ? last.picked : undefined;
  };
  for (const [i, d] of plan.entries()) {
    if (outcome(i + 1)) continue;
    const n = i + 1;
    if (!todo.includes(d.slot)) {
      // a draw planned for a slot the person settled themself is not made: what they said stands, and nothing is lost
      log(`Draw "${d.variable}" not made: they settled this slot themself`);
      continue;
    }
    // a draw from a group named by an earlier draw is made only once that one is settled
    const refs = [...`${d.conditions.rest} ${d.conditions.group ?? ""}`.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
    const missing = refs.find((r) => r >= n || !outcome(r));
    if (missing !== undefined) {
      failed.push({ n, variable: d.variable, why: missing >= n ? `it leans on draw ${missing}, which is not drawn yet` : `it needs what draw ${missing} gives, and that draw was not made` });
      log(`Draw "${d.variable}" not made: ${failed.at(-1)!.why}`);
      continue;
    }
    const fill = (t: string) => t.replace(/\{(\d+)\}/g, (_, r: string) => outcome(Number(r))!);
    const conditions: Conditions = { ...d.conditions, rest: fill(d.conditions.rest), group: d.conditions.group === null ? null : fill(d.conditions.group) };
    try {
      let made = done[i];
      if (!made) {
        const rec = await lookUpDistribution({ ...ctx, purpose: "setup_lookup" }, d.variable, conditions, d.hint, log);
        made = [drawFrom(rec, roll, d.slot, d.variable, conditions, ctx.worldId)];
        done[i] = made;
        checkpoint();
      }
      const first = made[0]!;
      // landed in "the rest": what it is, is drawn inside it, from a table of what the first one left out
      if (isRest(first)) {
        const named = first.buckets.filter((b) => !isRest(b)).map((b) => b.label);
        const inner = await lookUpDistribution({ ...ctx, purpose: "setup_lookup" }, d.variable, conditions, `${d.hint ? `${d.hint}; ` : ""}list only ${named.length ? `those other than ${named.map((n) => `"${n}"`).join(", ")}` : "the rest"}, with no "other" bucket this time`, log);
        const second = drawFrom(inner, roll, d.slot, d.variable, conditions, ctx.worldId);
        checkpoint();
        if (isRest(second)) throw new Error(`within "${first.picked}" the draw landed on "${second.picked}" again, which says nothing of what it is`);
        if (named.includes(second.picked)) throw new Error(`the table of what "other" holds lists "${second.picked}", which was listed already: it cannot be used`);
        made.push(second);
      }
      done[i] = made;
      checkpoint();
      log(`Draw: ${d.variable} among ${conditionsText(conditions)} → ${made.map((x) => `${x.picked} (${pct(x)})`).join(" → ")}, ${made.at(-1)!.source}`);
    } catch (err) {
      // a stopped job stops the drawing too, with what was drawn kept to go on from
      if (jobStopped()) throw err;
      failed.push({ n, variable: d.variable, why: err instanceof Error ? err.message : String(err) });
      log(`Draw "${d.variable}" not made: ${failed.at(-1)!.why}`);
    }
  }
  // a slot left to chance needs at least one draw: without one, the model downstream would decide it
  for (const slot of todo) if (!plan.some((p) => p.slot === slot)) failed.push({ n: 0, variable: slot, why: "this slot is to be drawn at random, but no draw for it was planned" });
  const { filled: _f, pending: _p, ...rest } = setup;
  if (failed.length) return { setup: { ...rest, seed, pending: { plan, done, k } }, failed };

  const finals = plan.map((_, i) => done[i]!.at(-1)!);
  const of = (slot: PlannedDraw["slot"]) => plan.flatMap((p, i) => (p.slot === slot ? done[i]!.map(({ slot: _s, ...x }) => x) : []));
  const lastOf = (slot: PlannedDraw["slot"]) => plan.flatMap((p, i) => (p.slot === slot ? [finals[i]!] : []));
  // A slot as written must hold, word for word, every draw it was settled by: an answer that leaves one out is sent
  // back once, saying which; left out again, the setup is not settled (the draws are kept for the retry).
  const missingIn = (o: z.infer<typeof WriteSchema>) =>
    (["world", "role", "goal"] as const).flatMap((slot) => {
      const text = (o[slot] ?? "").trim();
      const lost = lastOf(slot).filter((d) => !text.includes(d.picked));
      return lost.length ? [`${slot} does not hold what was drawn: ${lost.map((d) => `"${d.picked}"`).join(", ")}`] : [];
    });
  const ask = (again: string) =>
    generate(
      { ...ctx, role: "builder", purpose: "setup_write", think: false },
      {
        schema: WriteSchema,
        temperature: 0.2,
        system: "Write the setup of the play out in full from what the program drew: each slot as a natural phrase, the way a person would say it (not in the form of a field, such as \"sex of so-and-so: female\"). What was drawn goes in exactly as it came out, in the same words, and cannot be changed; what they said is kept; with no goal, goal is null.",
        prompt: `The start day is set to ${setup.start.date} (a random birth is a birth on this day; write no other date in start)\n\n${setupText(setup)}\n\nWhat was drawn:\n${plan.map((p, i) => `- ${p.slot} | ${finals[i]!.conditions} | ${p.variable}: ${finals[i]!.picked}`).join("\n")}${again}`,
      },
    );
  let out: z.infer<typeof WriteSchema> | null = null;
  try {
    out = await ask("");
    const lost = missingIn(out);
    if (lost.length) {
      log(`The setup as written left out what was drawn; asking once more: ${lost.join("; ")}`);
      out = await ask(`\n\nYour previous answer could not be used as it stood:\n${lost.map((x) => `- ${x}`).join("\n")}\nAnswer again in full, with these put right.`);
      const still = missingIn(out);
      if (still.length) throw new Error(`what was drawn was left out of the setup twice: ${still.join("; ")}`);
    }
  } catch (err) {
    if (jobStopped()) throw err;
    failed.push({ n: 0, variable: "setup text", why: err instanceof Error ? err.message : String(err) });
    log(`The setup was not written; the draws are kept: ${failed.at(-1)!.why}`);
    return { setup: checkpoint(), failed };
  }
  const next: Setup = { ...rest, seed, filled: true };
  for (const slot of ["world", "role"] as const) if (of(slot).length) next[slot] = { ...next[slot], value: out[slot].trim(), source: "drawn", draws: of(slot) } as never;
  // the start day is never drawn: a random birth is born on the start day; its slot is written as a situation
  if (setup.start.random) next.start = { ...next.start, value: out.start.trim() || next.start.value, random: false };
  if (next.goal && of("goal").length) next.goal = { ...next.goal, value: (out.goal ?? "").trim(), source: "drawn", draws: of("goal") };
  return { setup: next, failed: [] };
}

/** One roll on a looked-up table, kept as a draw. */
function drawFrom(rec: BaseRecord, roll: () => number, slot: PlannedDraw["slot"], variable: string, conditions: Conditions, worldId?: string | null): Draw & { slot: PlannedDraw["slot"] } {
  if (rec.data.kind !== "distribution") throw new Error(`what was looked up for "${variable}" is not a distribution`);
  const r = roll();
  const b = drawBucket(rec.data.buckets, r);
  return { slot, variable, conditions: conditionsText(conditions), buckets: rec.data.buckets, picked: b.label, ...(b.rest ? { rest: true } : {}), roll: r, source: cite(rec, worldId), recordId: rec.id };
}

const pct = (d: Draw) => `${Math.round((d.buckets.find((b) => b.label === d.picked)?.weight ?? 0) * 1000) / 10}%`;
