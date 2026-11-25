import { and, eq } from "drizzle-orm";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { db } from "../db/client.js";
import { judgments, searches, sources, type CarriedRoll } from "../db/schema.js";
import { engineOf, normUrl, webSearch, type Hit } from "../forecast/search.js";
import type { CallContext } from "../llm/trace.js";
import { draw } from "../sim/world.js";
import { newId, nowIso, pickByProbability, truncate } from "../util.js";
import { readPage } from "../net.js";

/**
 * The tools of engine 12. Looking things up: a search, and reading a page whole; what is found is kept with the
 * project (the pages in `sources`, each search in `searches`), and the same search in the same project is not sent
 * again. Rolling: the model states the question and the chances, the program rolls with the play's own dice and keeps
 * the roll in `judgments`. Neither has a limit of its own: the call's guard on rounds is the only one.
 */

/** What one call looked up and rolled, for the stop it writes. */
export type Used = { searches: { query: string; titles: string[] }[]; reads: { url: string; title: string }[]; rolls: Rolled[] };
export type Rolled = { id: string; question: string; options: { label: string; probability: number }[]; chosen: string; day: string; external: boolean; seen: boolean; carried: boolean; about: string | null };

export const emptyUsed = (): Used => ({ searches: [], reads: [], rolls: [] });

/** A page kept with the project (or the longer excerpt of it, when it is kept already). */
function keepSource(worldId: string, h: Hit): void {
  const had = db().select().from(sources).where(and(eq(sources.worldId, worldId), eq(sources.url, h.url))).get();
  if (!had) db().insert(sources).values({ id: newId("src"), worldId, url: h.url, title: h.title || null, excerpt: h.content, createdAt: nowIso() }).run();
  else if ((h.content?.length ?? 0) > (had.excerpt?.length ?? 0)) db().update(sources).set({ excerpt: h.content }).where(eq(sources.id, had.id)).run();
}

/** The same search sent before in the same project, as it came back then (from the pages kept with it). */
function searchedBefore(worldId: string, query: string): Hit[] | null {
  const row = db().select().from(searches).where(and(eq(searches.projectId, worldId), eq(searches.query, query))).get();
  if (!row) return null;
  const kept = db().select().from(sources).where(eq(sources.worldId, worldId)).all();
  return row.urls.flatMap((u) => {
    const s = kept.find((k) => normUrl(k.url) === normUrl(u));
    return s ? [{ url: s.url, title: s.title ?? "", content: s.excerpt ?? "" }] : [];
  });
}

export function webTools(ctx: CallContext & { worldId: string }, used: Used, o: { round: number; log?: (line: string, level?: "info" | "source") => void }): ToolSet {
  return {
    web_search: tool({
      description: "Search the web. Short, specific search terms, in English or in the language of the place where that finds more. Returns page titles, links and excerpts.",
      inputSchema: z.object({ query: z.string().describe("The search terms") }),
      execute: async ({ query }) => {
        const q = query.trim();
        o.log?.(`Search: ${q}`);
        let hits = searchedBefore(ctx.worldId, q);
        if (!hits) {
          hits = await webSearch(ctx, q, undefined, 6);
          const known = new Set(db().select({ url: sources.url }).from(sources).where(eq(sources.worldId, ctx.worldId)).all().map((s) => normUrl(s.url)));
          for (const h of hits) keepSource(ctx.worldId, h);
          db().insert(searches).values({ id: newId("srch"), projectId: ctx.worldId, item: "narrate", round: o.round, query: q, engine: engineOf(), hits: hits.length, fresh: hits.filter((h) => !known.has(normUrl(h.url))).length, urls: hits.map((h) => h.url), createdAt: nowIso() }).run();
        }
        used.searches.push({ query: q, titles: hits.map((h) => h.title).filter(Boolean).slice(0, 3) });
        return { results: hits.map((h) => ({ title: h.title, url: h.url, excerpt: truncate(h.content.replace(/\s+/g, " "), 700) })) };
      },
    }),
    read_page: tool({
      description: "Read the body text of a web page (one from the search results, or one named in the story). Read it only when the excerpt is not enough.",
      inputSchema: z.object({ url: z.string().describe("The address of the page") }),
      execute: async ({ url }) => {
        const kept = db().select().from(sources).where(eq(sources.worldId, ctx.worldId)).all().find((s) => normUrl(s.url) === normUrl(url));
        let text = kept && (kept.excerpt?.length ?? 0) > 1500 ? kept.excerpt! : await readPage(url);
        if (!text) return { problem: "the page could not be read", text: kept?.excerpt ?? "" };
        if (!kept || (kept.excerpt?.length ?? 0) < Math.min(text.length, 8000)) keepSource(ctx.worldId, { url, title: kept?.title ?? "", content: text.slice(0, 8000) });
        used.reads.push({ url, title: kept?.title ?? url });
        o.log?.(`Read: ${kept?.title || url}`, "source");
        text = text.slice(0, 8000);
        return { text };
      },
    }),
  };
}

const RollInput = z.object({
  question: z.string().describe("What is uncertain, as a question"),
  outcomes: z.array(z.object({ label: z.string().describe("One way it can come out"), probability: z.number().describe("Its chance, 0 to 1") })).min(1).describe("Every way it can come out, with its real chance; the chances add up to 1"),
  external: z.boolean().describe("true when it is outside the protagonist's reach: nothing they did brought it about"),
  seen: z.boolean().describe("true when the protagonist sees or is told how it came out; false when it happens out of their sight"),
  about: z.string().nullable().optional().describe("Whom it is about: a name as the notes have it; empty when it is about no one in particular"),
  day: z.string().nullable().optional().describe("The day it is settled, YYYY-MM-DD; leave out for the day of the move"),
  same_as: z.string().nullable().optional().describe("Only on a line forked from another: the id of a roll listed as carried from the line it came from, when this is that same question; it then comes out as it did there"),
});

/**
 * The dice of a play (null: the world's setting up, which rolls nothing): rolled by the program with the line's own seeded dice, kept as a judgment (with whether it was
 * outside the protagonist's reach, whom it was about, and the stop it was rolled in), and told to the model. A roll
 * carried from the line a matched fork came from comes out as it did there. `onRoll`: told of each roll once it is
 * kept (the page shows those the protagonist can see as they come).
 */
export function diceTool(o: { worldId: string; branchId: string; step: number; day: string; carried: CarriedRoll[]; used: Used; onRoll?: (r: Rolled) => void } | null): ToolSet {
  return {
    roll_dice: tool({
      description: "Roll for something no single person's will decides and that would change how things stand. The program rolls; write it as it came out. A roll the protagonist can see is shown to them as written: its question and its outcomes say only what they could see or be told, never what anyone is thinking or what is still to come.",
      inputSchema: RollInput,
      execute: async (x) => {
        // (while the world is set up there are no dice yet: the tool is offered all the same, so that every call of a
        // play is given the same tools and reads the same cache)
        if (!o) return { problem: "nothing is rolled while the world is set up: the play has not begun" };
        const day = x.day && /^\d{4}-\d{2}-\d{2}$/.test(x.day) ? x.day : o.day;
        const raw = x.outcomes.filter((y) => y.label.trim());
        // chances written as percentages, or not adding up, are read as shares of the whole
        const total = raw.reduce((s, y) => s + Math.max(0, y.probability), 0);
        const options = raw.map((y) => ({ label: y.label.trim(), probability: total > 0 ? Math.max(0, y.probability) / total : 1 / raw.length }));
        const same = x.same_as ? o.carried.find((c) => c.id === x.same_as!.trim()) : undefined;
        let chosen: string;
        let note: string;
        if (same) {
          chosen = same.chosen;
          note = `carried from the line this one was forked from (${same.id})`;
        } else {
          const point = draw(o.branchId);
          chosen = pickByProbability(options, point).label;
          note = `roll ${point.toFixed(4)}`;
        }
        const id = newId("jdg");
        // ("none" and the like, written where it is about no one in particular, is no one)
        // (the Chinese words, escaped: none, there is none, no one)
        const about = x.about?.trim() && !/^(none|no ?one|nobody|null|n\/a|-|\u65e0|\u6ca1\u6709|\u65e0\u4eba)\.?$/i.test(x.about.trim()) ? x.about.trim() : null;
        db().insert(judgments).values({ id, worldId: o.worldId, branchId: o.branchId, simTime: day, question: x.question.trim(), options, chosen, kind: "outcome", estimated: true, note, eventId: null, external: x.external, seen: x.seen, about, step: o.step, createdAt: nowIso() }).run();
        const rolled: Rolled = { id, question: x.question.trim(), options, chosen, day, external: x.external, seen: x.seen, carried: !!same, about };
        o.used.rolls.push(rolled);
        o.onRoll?.(rolled);
        const p = options.find((y) => y.label === chosen)?.probability ?? 0;
        return { outcome: chosen, chance: Math.round(p * 100) / 100 };
      },
    }),
  };
}

/**
 * The tools of every call of a play, in the one order they are always given in (they are the head of what the
 * provider caches): the web, then the dice (`dice` null at the setting up).
 */
export function playTools(ctx: CallContext & { worldId: string }, used: Used, o: { round: number; log?: (line: string, level?: "info" | "source") => void }, dice: Parameters<typeof diceTool>[0]): ToolSet {
  return { ...webTools(ctx, used, o), ...diceTool(dice) };
}
