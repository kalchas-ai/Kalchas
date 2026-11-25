import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { baseRecords, type BaseData } from "../db/schema.js";
import { generate } from "../llm/generate.js";
import { research, type Citation } from "../llm/research.js";
import type { CallContext } from "../llm/trace.js";
import { jobScope } from "../jobs/queue.js";
import { daysBetween, newId, nowIso, truncate } from "../util.js";
import { tx } from "../language.js";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The world base: real distributions with their source, for the setup's random slots (where someone is born, into what
 * kind of family): the program draws from them. What is kept is reused while it is fresh.
 *
 * What a record says of itself is the program's to say, not the model's: a distribution looked up that came back
 * citing nothing, or whose shares are not on the page it cites, is an estimate whatever the model says, and stays in
 * the world that asked.
 *
 * For whom a distribution is, is given in parts by whoever asks for it (the year, an age band, a grouping such as sex,
 * and the rest): the program reads none of it out of words.
 */

export type BaseRecord = typeof baseRecords.$inferSelect;
export type Bucket = { label: string; weight: number; lower?:number|null;upper?:number|null;unit?:string; /** The table's own catch-all: everything it does not list by name. */ rest?: boolean };
type Log = (message: string) => void;

/** How long a looked-up distribution is used before it is looked up again. */
const FRESH_DAYS = 180;
/**
 * How far the shares of a table may add up from 1 and still be one table (rounding in the source, a bucket of a few
 * tenths of a percent left out). Beyond it the table is short of part of the whole, or is not a split of one whole.
 */
const SUM_TOLERANCE = 0.05;
/** Where a record kept for one world is said to belong when the call named no world: nowhere, so it is never reused. */
const NOWHERE = "-";

const sayInJob: Log = (m) => jobScope()?.log(m, "warn");

// ---------------------------------------------------------------- the key a record is found by

/** A wording made comparable: its form normalised, spacing and punctuation dropped. No word in it is read. */
const strip = (x: string) => x.normalize("NFKC").replace(/[\s\p{P}]/gu, "").toLowerCase();

/** For whom, where and when a distribution is, in parts, as whoever asks for it gives them. */
export const ConditionsSchema = z.object({
  year: z.number().nullable().describe("The year the figure is wanted for; null for the newest there is"),
  ageFrom: z.number().nullable().describe("The lower end of the age band, in years; null when age does not come into it"),
  ageTo: z.number().nullable().describe("The upper end of the age band; the same as ageFrom for a single age; null when age does not come into it"),
  group: z.string().nullable().describe("The grouping the figure is split by, when there is one (a sex, an income band, a kind of firm); otherwise null"),
  rest: z.string().describe("Everything else that says for whom and where: the country or region, the population, the field, the stage"),
});
export type Conditions = z.infer<typeof ConditionsSchema>;

/** The conditions in a line, for a prompt and for the record. */
export const conditionsText = (c: Conditions) =>
  [c.rest.trim(), c.group?.trim() ? `group: ${c.group.trim()}` : "", c.ageFrom != null ? `ages ${c.ageFrom}${c.ageTo != null && c.ageTo !== c.ageFrom ? `–${c.ageTo}` : ""}` : "", c.year != null ? `year ${c.year}` : ""].filter(Boolean).join("; ");

/**
 * What a record is, in parts, so the same thing asked for again finds the same record: the variable, the year, the age
 * band, the grouping, the rest of the conditions, and how it is bucketed.
 */
export function baseKey(variable: string, c: Conditions, hint = ""): string {
  return ["evidence-v4", strip(variable), c.year ?? "", c.ageFrom != null ? `${c.ageFrom}-${c.ageTo ?? c.ageFrom}` : "", strip(c.group ?? ""), strip(c.rest), strip(hint)].join("|");
}

/** The record this world may use for a key: the newest it is allowed (fresh or not), and whether it is fresh. */
function find(key: string, worldId: string | null | undefined): { row: BaseRecord; fresh: boolean } | null {
  const rows = db().select().from(baseRecords).where(and(eq(baseRecords.kind, "distribution"), eq(baseRecords.key, key))).orderBy(desc(baseRecords.lookedUpAt)).all();
  const row = rows.find((r) => !r.data.only || r.data.only === worldId);
  return row ? { row, fresh: daysBetween(row.lookedUpAt.slice(0, 10), nowIso().slice(0, 10)) <= FRESH_DAYS } : null;
}

type Meta = { source: string; url: string | null; year: number | null; estimated: boolean };

function keep(variable: string, key: string, conditions: Conditions, data: BaseData, meta: Meta): BaseRecord {
  const now = nowIso();
  const row: BaseRecord = { id: newId("base"), kind: "distribution", variable, conditions: conditionsText(conditions), key, data, source: meta.source, url: meta.url, year: meta.year, estimated: meta.estimated, lookedUpAt: now, createdAt: now };
  db().insert(baseRecords).values(row).run();
  return row;
}

// ---------------------------------------------------------------- looking it up

const MetaOut = {
  source: z.string().describe('Where it comes from: the publishing body and the name of the material, e.g. "United Nations, World Population Prospects 2024"; when nothing was found and it is an estimate, write "estimate, unverified" and say what the estimate is based on'),
  url: z.string().nullable().describe('The address of the page the figure is on; it must be one listed under "Sources" in the research notes; null when there is none'),
  year: z.number().nullable().describe("The year the data is for, or was published"),
  estimated: z.boolean().describe("true when the notes hold no data that can be used directly and this is your own estimate"),
};

const DistributionOut = z.object({
  buckets: z
    .array(z.object({ lower:z.number().nullable().optional().describe("The lower bound of a numeric bucket as the source gives it; null for negative infinity; leave it out for a bucket that is not numeric"),upper:z.number().nullable().optional().describe("The upper bound (exclusive); null for positive infinity; leave it out for a bucket that is not numeric"),unit:z.string().optional().describe("The original unit of the numeric range; do not convert it"),label: z.string().describe('One bucket, written so that it can be used as it stands, e.g. "India", "rural", "bachelor\'s degree", "wants a return on the investment"'), rest: z.boolean().describe("true for the table's own catch-all bucket (everything it does not list by name); false for every other bucket"), weight: z.number().describe("The share of this bucket, as the material gives it (a 0–1 fraction or a percentage, either will do; the same one for the whole table)") }))
    .describe("The buckets and their shares, covering the whole (list the main buckets and merge everything else into one catch-all bucket, marked `rest`); the shares should add up to 1 (or 100%)"),
  ...MetaOut,
});

const LOOKUP_SYSTEM = `You are looking up real statistics for a world simulator: only authoritative, citable figures (official statistics, international organisations, academic research, industry reports), with the source, the year and the raw number written out; when nothing can be found write "not found", do not make anything up.`;

type Found = { notes: string; citations: Citation[]; failed: string | null };

const web = new AsyncLocalStorage<boolean>();
/**
 * A play in progress does not go to the web: once it has begun, what happens comes from what the world already holds
 * and from what its people choose. Inside `fn`, a distribution already kept is used as it is, and one that is not kept
 * is estimated and marked as an estimate. Building a world is outside it and looks things up.
 */
export const withoutWeb = <T>(fn: () => Promise<T>): Promise<T> => web.run(false, fn);
const offline = () => web.getStore() === false;
/** Why nothing was looked up, when it is a play in progress: a mark the program compares, never shown. */
const NO_WEB = "no_web";

async function lookOnline(ctx: CallContext, task: string): Promise<Found> {
  if (offline()) return { notes: "", citations: [], failed: NO_WEB };
  try {
    const r = await research({ ...ctx, role: "researcher", purpose: `${ctx.purpose}_search` }, task, { searches: 2, fetches: 1, system: LOOKUP_SYSTEM });
    return { notes: r.notes, citations: r.citations, failed: null };
  } catch (err) {
    return { notes: "", citations: [], failed: err instanceof Error ? err.message : String(err) };
  }
}

/** The notes as the model reads them: what was found and what it cites, or that nothing could be looked up. */
const notesText = (f: Found) =>
  f.failed === NO_WEB ? "(This one is not looked up on the web: there is no material; estimate from the most reliable picture you know of, and set estimated to true)" : f.failed ? `(The web lookup failed: ${f.failed}. There is no material at all; you can only estimate)` : `${f.notes}\n\nSources:\n${f.citations.slice(0, 6).map((c) => `- ${c.title} ${c.url}`).join("\n") || "(none)"}`;

/** What year the figure should be for: the one the conditions give, else the newest. */
const whenText = (c: Conditions) => (c.year != null ? `The figure for ${c.year} is wanted (when there is none, the one nearest to ${c.year}; say which year the data is for)` : "The newest figure is wanted");

const sameUrl = (u: string) => u.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[/#?]+$/, "").toLowerCase();

/**
 * The record's own account of where it came from, as the program can vouch for it: an estimate when nothing could be
 * looked up or nothing was cited (whatever the model says), and an address only when this lookup cited it.
 */
function honest(out: { source: string; url: string | null; year: number | null; estimated: boolean }, found: Found, worldId: string | null | undefined): Meta {
  const cited = out.url ? found.citations.find((c) => sameUrl(c.url) === sameUrl(out.url!)) : undefined;
  const unread = !!found.failed || !found.citations.length;
  return { source: out.source.trim() || tx(worldId, "source.estimate"), url: cited?.url ?? null, year: out.year, estimated: out.estimated || unread || !cited };
}

/** Check literal source evidence before a distribution may enter the shared base. Research prose alone is not the source. */
function supported(found:Found,url:string|null,values:number[]):boolean {
  const cited=url?found.citations.find(c=>sameUrl(c.url)===sameUrl(url)):undefined;
  const text=cited?.excerpt?.normalize("NFKC")??"";
  // (thousands set off by a comma, ASCII or full-width)
  const numbers=new Set((text.replace(/(?<=\d)[,\uff0c](?=\d{3}(?:\D|$))/g,"").match(/-?\d+(?:\.\d+)?/g)??[]).map(Number));
  return !!text&&values.every(v=>numbers.has(v));
}

/**
 * A table's shares on one scale, empty or broken buckets dropped, and what they add up to. Whether the table is in
 * percent is judged for the whole table (a share above 1 anywhere means all are percent): bucket by bucket, a 0.8%
 * bucket would be read as 80%.
 */
export function scaleBuckets(b: Bucket[]): { buckets: Bucket[]; total: number } {
  const ok = b.filter((x) => x.label.trim() && Number.isFinite(x.weight) && x.weight > 0).map((x) => ({ ...x,label: x.label.trim(), weight: x.weight }));
  const percent = ok.some((x) => x.weight > 1);
  const buckets = percent ? ok.map((x) => ({ ...x, weight: x.weight / 100 })) : ok;
  return { buckets, total: buckets.reduce((s, x) => s + x.weight, 0) };
}

/** Whether a bucket is its table's catch-all, as whoever set the table out marked it. */
export const isRest = (b: Pick<Bucket, "rest">) => b.rest === true;

// ---------------------------------------------------------------- distributions

/**
 * How a trait is spread over a group ("country of birth" over "newborns worldwide in 2026"): from the base when fresh,
 * else looked up live. `hint`: what the buckets should be (so a draw gives something usable), e.g. "by country". A table whose shares fall
 * short of the whole is looked up once more; still short, the rest is put in an explicit "other" bucket (with what the table
 * added up to kept on the record), never spread over the buckets it has. Shares that add up to more than the whole are
 * not a split of one group, and are not used.
 */
export async function lookUpDistribution(ctx: CallContext, variable: string, conditions: Conditions, hint = "", log: Log = sayInJob): Promise<BaseRecord> {
  const whom = conditionsText(conditions);
  const key = baseKey(variable, conditions, hint);
  const hit = find(key, ctx.worldId);
  if (hit?.fresh) return hit.row;
  let short: { buckets: Bucket[]; total: number; meta: Meta } | null = null;
  let over = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const again = attempt ? `\nThe buckets found last time add up to ${Math.round((short?.total ?? over) * 1000) / 10}%, which is not the whole of one group: list all the buckets; they should add up to 100%.` : "";
    const found = await lookOnline(ctx, `Look up the distribution of "${variable}" among "${whom}": what share each bucket has${hint ? ` (${hint})` : ""}. ${whenText(conditions)}; give the source and the year.${again}`);
    const out = await generate(
      { ...ctx, role: "builder", think: false },
      {
        schema: DistributionOut,
        temperature: 0.1,
        system: `From the research notes, set out the distribution of "${variable}" among "${whom}". The shares must come from numbers in the notes; when the notes hold no usable numbers, estimate from the most reliable picture you know of, set estimated to true, and say in source what the estimate is based on.${hint ? ` Buckets: ${hint}.` : ""}`,
        prompt: truncate(notesText(found), 9000),
      },
    );
    const { buckets, total } = scaleBuckets(out.buckets);
    if (!buckets.length) throw new Error(`No distribution of "${variable}" among "${whom}" was found`);
    const meta = honest(out, found, ctx.worldId);
    if(!supported(found,out.url,out.buckets.flatMap(b=>[b.weight,...[b.lower,b.upper].filter((v):v is number=>v!=null)])))meta.estimated=true;
    const only = meta.estimated ? (ctx.worldId ?? NOWHERE) : undefined;
    if (Math.abs(total - 1) <= SUM_TOLERANCE) return keep(variable, key, conditions, { kind: "distribution", buckets: buckets.map((b) => ({ ...b, weight: b.weight / total })), ...(only ? { only } : {}) }, meta);
    if (total > 1) {
      over = total;
      short = null;
    } else short = { buckets, total, meta };
  }
  if (!short) {
    log(`"${variable}" among "${whom}": the buckets add up to ${Math.round(over * 1000) / 10}%, more than the whole; not a split of one group, so not used`);
    throw new Error(`The buckets of "${variable}" among "${whom}" add up to over 100%: not a split of one group`);
  }
  // still short of the whole: the rest goes into a bucket of its own, so a draw can land in it (and be settled there)
  const rest = 1 - short.total;
  const other = tx(ctx.worldId, "other");
  const there = short.buckets.find(isRest);
  const buckets = there ? short.buckets.map((b) => (b === there ? { ...b, weight: b.weight + rest } : b)) : [...short.buckets, { label: other, weight: rest, rest: true }];
  const label = there?.label ?? other;
  log(`"${variable}" among "${whom}": looked up twice, the buckets add up to only ${Math.round(short.total * 1000) / 10}%; the remaining ${Math.round(rest * 1000) / 10}% is put under "${label}"`);
  const only = short.meta.estimated ? (ctx.worldId ?? NOWHERE) : undefined;
  return keep(variable, key, conditions, { kind: "distribution", buckets, rest: { label, total: short.total }, ...(only ? { only } : {}) }, short.meta);
}

/** The program's draw from a distribution: the bucket a uniform roll in [0,1) lands in. */
export function drawBucket(buckets: Bucket[], roll: number): Bucket {
  let acc = 0;
  for (const b of buckets) {
    acc += b.weight;
    if (roll < acc) return b;
  }
  return buckets[buckets.length - 1]!;
}

/** A record as a short citation for prompts and pages, in the language of the world it is cited in. */
export function cite(r: Pick<BaseRecord, "source" | "year" | "estimated">, worldId?: string | null): string {
  const at = r.year ? tx(worldId, "cite.year", { source: r.source, year: r.year }) : r.source;
  return r.estimated ? tx(worldId, "cite.estimated", { cite: at }) : at;
}
