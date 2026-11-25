import { and, eq, isNull } from "drizzle-orm";
import type { ModelMessage } from "ai";
import { db } from "../db/client.js";
import { entities, forecasts, startPoints, type NoteEntry, type WorldNotes } from "../db/schema.js";
import { config } from "../config.js";
import type { JobContext } from "../jobs/queue.js";
import { languageRule } from "../language.js";
import { momentOf, momentText } from "../forecast/moment.js";
import { BUILD_STAGE_LABEL, type BuildStage } from "../world/build.js";
import type { Scope, WorldProfile } from "../world/schemas.js";
import { heroYou } from "../world/setup.js";
import { loadWorld, setWorld } from "../world/store.js";
import { newId, nowIso } from "../util.js";
import { narrate } from "./call.js";
import { headOf, settingUpTurn } from "./context.js";
import { notesOf, peopleCards, readNotes } from "./notes.js";
import { SETTING_UP, SYSTEM } from "./rules.js";
import { listLines, tagOf } from "./tags.js";
import { emptyUsed, playTools } from "./tools.js";

/**
 * Building an engine-12 world: the setup's random slots drawn (as before), then the play's first call: the main model,
 * with the play's own instructions and tools, sets the world up (where things stand on the opening day, who is in it
 * and what each wants and means to do, what the protagonist knows of them and what is out of their sight, the forces
 * in motion, the key figures, the road ahead, what was assumed of the protagonist, the main questions, and what was
 * found). The whole exchange is kept: every play on the world opens with it, word for word. What the pages around a
 * world read is written beside it as they read it: a scope, a profile, the protagonist and each person the protagonist
 * knows of as entities, and the opening point.
 */

/** The kind of entity a person is (a fixed value the pages read, the same in every language). */
const PERSON = "person";

/** Whom the person plays, by name: a real person they stand in for, or themself. */
export function heroOf(worldId: string): string {
  const f = db().select().from(forecasts).where(eq(forecasts.id, worldId)).get();
  if (!f) throw new Error(`No such project: ${worldId}`);
  const m = momentOf(f);
  const setup = f.setup ?? null;
  return setup?.role.kind === "real" && setup.role.name ? setup.role.name : m.past && m.seat ? m.seat : heroYou(worldId);
}

/**
 * The people of the notes the protagonist knows of and who are not yet on the roster, written as entities (of the
 * world, or of one line when `branchId` is given), as the protagonist knows them: a page names, shows and opens a
 * person by such a row, and reads it directly. Someone in the notes only on their hidden side is not on it: they come
 * in once a line the protagonist knows of them is written. The protagonist is one already.
 */
export function admitPeople(worldId: string, branchId: string | null, entries: NoteEntry[], known: string[]): string[] {
  const have = new Set(known.map((n) => n.trim().toLowerCase()));
  const added: string[] = [];
  for (const c of peopleCards(entries)) {
    const k = c.name.trim().toLowerCase();
    if (!k || have.has(k) || !c.known.trim()) continue;
    have.add(k);
    db().insert(entities).values({ id: newId("ent"), worldId, name: c.name.trim(), kind: PERSON, aliases: [], summary: c.known.trim(), person: true, tier: "cast", branchId, existence: null, createdAt: nowIso() }).run();
    added.push(c.name.trim());
  }
  return added;
}

/** The stages the build page shows, marked in the job's log as the one call gets to each. */
function stages(ctx: JobContext) {
  const open: BuildStage[] = [];
  const done = new Set<BuildStage>();
  const begin = (s: BuildStage) => {
    if (done.has(s) || open.includes(s)) return;
    // what came before it is finished
    for (const x of open.splice(0)) {
      done.add(x);
      ctx.log(`✓ ${BUILD_STAGE_LABEL[x]}`);
    }
    open.push(s);
    ctx.log(`▶ ${BUILD_STAGE_LABEL[s]}`);
  };
  const finish = () => {
    for (const s of ["skeleton", "research", "people", "opening"] as BuildStage[]) begin(s);
    for (const x of open.splice(0)) {
      done.add(x);
      ctx.log(`✓ ${BUILD_STAGE_LABEL[x]}`);
    }
  };
  return { begin, finish };
}

export async function buildNarrateWorld(ctx: JobContext, worldId: string, drawSetup: (ctx: JobContext, worldId: string) => Promise<void>): Promise<void> {
  const st = stages(ctx);
  st.begin("skeleton");
  // a build taken up again after its notes were kept has only what is beside them left to write
  const w0 = loadWorld(worldId);
  if (w0.notes && db().select().from(startPoints).where(eq(startPoints.worldId, worldId)).get()) return st.finish();
  await drawSetup(ctx, worldId);
  const f = db().select().from(forecasts).where(eq(forecasts.id, worldId)).get();
  if (!f) throw new Error(`No such project: ${worldId}`);
  const m = momentOf(f);
  const day = f.setup?.start.date ?? f.asOf;
  const hero = heroOf(worldId);
  const used = emptyUsed();
  const call = { role: "builder" as const, purpose: "narrate_world", worldId, jobId: ctx.job.id };
  // the play's first turn: the person's own part (the pace is chosen later, and given with the opening), and the request
  const ask = settingUpTurn(headOf(worldId, { pace: false }), day, momentText(m), hero, SETTING_UP);
  const system = `${SYSTEM}\n\n${languageRule(worldId)}`;
  const tools = playTools({ ...call, worldId }, used, { round: 0, log: (line, level) => ctx.log(line, level) }, null);
  const onText = (t: string) => {
    if (t.includes("<milestones>")) st.begin("opening");
    else if (t.includes("<notes>")) st.begin("people");
  };
  const onTool = (name: string) => {
    if (name === "web_search" || name === "read_page") st.begin("research");
  };
  const first: ModelMessage[] = [{ role: "user", content: ask }];
  let r = await narrate({ ctx: call, system, messages: first, tools, rounds: config().narrate.buildRounds, onText, onTool, timeoutMs: 25 * 60_000 });
  if (r.runaway) ctx.log(`The world looked things up for ${r.rounds} rounds without being written, and was made to write from what it had: a fault to look into`, "warn");
  let exchange: ModelMessage[] = [...first, ...r.messages];
  // the notes are what a play cannot do without: asked for once more when they did not come (what came first stays)
  if (!tagOf(r.text, "notes")?.trim()) {
    r.close("narrate_world");
    ctx.log("The world's notes were not written; asking for them once more", "warn");
    const again: ModelMessage[] = [...exchange, { role: "user", content: "Your answer had no <notes>. Write the whole answer again, every tag, in order." }];
    r = await narrate({ ctx: call, system, messages: again, tools, rounds: config().narrate.buildRounds, onText, onTool, timeoutMs: 25 * 60_000 });
    exchange = [...again, ...r.messages];
  }
  r.close("narrate_world");
  const situation = tagOf(r.text, "situation")?.trim() ?? "";
  const entries = readNotes(tagOf(r.text, "notes"), 0, day);
  if (!entries.length) throw new Error("The world's notes were not written");
  const milestones = listLines(tagOf(r.text, "milestones"));
  const found = listLines(tagOf(r.text, "found"));
  const notes: WorldNotes = { text: r.text.trim(), situation, entries, milestones, found, day, hero, exchange };
  const title = loadWorld(worldId).title?.trim() || f.question.trim();
  const setup = f.setup ?? undefined;
  const assumptions = notesOf(entries, "assumption").map((e) => e.text);
  const scope: Scope = {
    title,
    summary: situation,
    protagonist: { name: hero, role: setup?.role.value ?? hero, kind: PERSON, person: true },
    timeStart: day,
    timeEnd: null,
    historyEnd: day,
    past: m.past,
    region: setup?.world.value ?? "",
    domain: "",
    circles: [],
    real: [],
    people: { spread: "", placing: "" },
    ...(setup ? { setup } : {}),
    assumptions,
    sides: [],
  };
  const profile: WorldProfile = { metrics: [], opening: [], road: { forks: notesOf(entries, "road", "known").map((e) => ({ what: e.text, when: e.name, weight: "" })), remains: "" } };
  // the notes and everything written beside them are kept together: a build taken up again finds all or none
  db().$client.transaction(() => {
    const seat = newId("ent");
    db().delete(entities).where(and(eq(entities.worldId, worldId), isNull(entities.branchId))).run();
    db().insert(entities).values({ id: seat, worldId, name: hero, kind: PERSON, aliases: [], summary: setup?.role.value ?? hero, person: true, tier: "cast", branchId: null, existence: "person", createdAt: nowIso() }).run();
    admitPeople(worldId, null, entries, [hero]);
    db().insert(startPoints).values({ id: newId("start"), worldId, ordinal: 1, date: day, title, rationale: situation, difficulty: "", seatEntityId: seat, initialMetrics: {}, createdAt: nowIso() }).run();
    setWorld(worldId, { notes, scope, profile, title });
  })();
  st.finish();
  const people = peopleCards(entries).length;
  ctx.log(`Opening: ${day}; people ${people}; outside forces ${notesOf(entries, "force").length}; key figures ${notesOf(entries, "figure").length}; the road ahead ${notesOf(entries, "road").length}; assumptions ${assumptions.length}; milestones ${milestones.length}; ${used.searches.length} searches, ${used.reads.length} pages read`);
}
