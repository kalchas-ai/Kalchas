import { join } from "node:path";
import type { T } from "@/lib/i18n/locales";

/**
 * A play as one stream of plain acts, for the motion test page (/design/viz-3). Everything the engine did while the
 * world was built and while it was played is turned into one of seven acts, never into anything particular to one
 * play, so the page draws any play with the same few pictures:
 *
 * - appear: someone or something comes into the world (a person, an organisation, a crowd, a newcomer);
 * - link: something passes from one to another (a tie found, a move reaching someone, news passed on);
 * - write: words are written somewhere (a fact, a persona, a decision, a memory, an outcome);
 * - draw: a spread of possibilities settles on one (a setup draw, a trait of a persona, odds, a chance);
 * - lookup: something is fetched from the real world, with where it came from;
 * - change: a number moves;
 * - advance: the world moves on (a stage done, a day reached, a step).
 *
 * Read-only. `t` gives the few words written here that are shown as they are (a tie with no label, the levels of a
 * trait, what a look-up was for); everything else is the world's own.
 */

/**
 * What kind of thing an act is, as its `head` says (the part before " · " where a name follows: a drawn variable, a
 * trait, a crowd). These are identifiers that the pages match on (flow-lab/score.ts, who.tsx, flow.tsx,
 * product/live/flow.tsx), not words shown as they are: each page shows its own words for them. They are the Chinese
 * words they were first written as, kept as escapes so that every page that matches on them still does.
 */
const HEAD = {
  draw: "\u62bd\u7b7e", // a setup draw ("drawing lots")
  stageDone: "\u9636\u6bb5\u5b8c\u6210", // a stage of the build done
  begin: "\u5f00\u59cb", // a stage of the build begun
  person: "\u4eba\u7269", // a person comes in
  org: "\u673a\u6784", // an organisation comes in
  fact: "\u4e8b\u5b9e", // a fact
  tie: "\u5173\u7cfb", // a tie
  persona: "\u4eba\u8bbe", // a persona (profile), or a variable drawn for one
  crowd: "\u7fa4\u4f53", // a crowd's segment
  risk: "\u5fc5\u63b7\u98ce\u9669", // a risk that must be rolled
  milestone: "\u91cc\u7a0b\u7891", // a milestone
  lookNewcomer: "\u67e5\uff1a\u8c01\u4f1a\u767b\u573a", // looked up: who may come in
  lookOdds: "\u67e5\uff1a\u771f\u5b9e\u6982\u7387", // looked up: the real odds
  search: "\u8054\u7f51\u641c\u7d22", // a web search
  thinking: "\u5728\u60f3", // someone thinking
  newcomer: "\u65b0\u767b\u573a", // (after persona) someone new in a play
  trait: "\u6027\u683c", // a trait drawn by the population norm
  time: "\u65f6\u95f4", // time moves on
  yourMove: "\u4f60\u7684\u884c\u52a8", // your move
  move: "\u884c\u52a8", // someone else's move
  entrant: "\u767b\u573a", // someone comes in during a play
  chance: "\u610f\u5916", // the unexpected
  stage: "\u9636\u6bb5", // a stage of the play
  world: "\u4e16\u754c", // the world itself
  reach: "\u6ce2\u53ca", // a move reaching someone (knock-on effects)
  roll: "\u63b7\u4e00\u6b21", // (after chance) rolled once
  odds: "\u6309\u6982\u7387\u5b9a", // settled by the odds
  memory: "\u8bb0\u4f4f", // what someone took away
  newTie: "\u65b0\u5173\u7cfb", // a tie made during a play
} as const;

export type Act = "appear" | "link" | "write" | "draw" | "lookup" | "change" | "advance";
export type Ev = {
  t: number;
  act: Act;
  /** Where it happens: an entity, or null for the world itself. */
  who: string | null;
  to?: string | null;
  head: string;
  text: string;
  /** 0 … 1: how much it matters (the page holds the heavy ones in the middle, lets the light ones stream past). */
  w: number;
  options?: { label: string; p: number }[];
  picked?: string | null;
  source?: string | null;
  phase: "build" | "play";
  sim?: string | null;
};
export type StreamNode = { id: string; name: string; kind: string; tier: string; crowd?: boolean; /** What the world says of them, in a line. */ summary?: string };
export type Segment = {
  id: string;
  crowd: string;
  name: string;
  size: number;
  cares: string;
  basis: string;
  /** A force in motion round the world (a world written whole has these where an older world had crowds): it is not a number of people. */
  force?: boolean;
};
export type CrowdStep = { step: number; at: number; state: Record<string, { reach: number; share: number }> };
export type Stream = {
  id: string;
  segments: Segment[];
  crowdSteps: CrowdStep[];
  title: string;
  seat: string | null;
  start: string | null;
  nodes: StreamNode[];
  metrics: { key: string; label: string; unit: string }[];
  events: Ev[];
};

type Row = Record<string, unknown>;
type Q = { prepare: (s: string) => { all: (...a: unknown[]) => Row[]; get: (...a: unknown[]) => Row | undefined } };
const parse = (x: unknown): unknown => {
  try {
    return JSON.parse(String(x));
  } catch {
    return null;
  }
};
const obj = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Row) : {});
const arr = (x: unknown) => (Array.isArray(x) ? (x as Row[]) : []);
const str = (x: unknown) => (typeof x === "string" ? x : x == null ? "" : String(x));
const ms = (x: unknown) => Date.parse(str(x));
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
/** An address named in running text ("ycombinator.com/apply" gives "ycombinator.com"). */
const DOMAIN = /(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;
/** Where a clause ends: a comma, full stop or semicolon, full-width (\uff0c \u3002 \uff1b) or not. */
const CLAUSE_END = /[\uff0c\u3002\uff1b,;]|\.\s/g;
/** The clause of a text that the place `i` is in. */
const clauseAt = (text: string, i: number) => {
  let s = 0;
  for (const m of text.matchAll(CLAUSE_END)) {
    if (m.index >= i) return text.slice(s, m.index).trim();
    s = m.index + m[0].length;
  }
  return text.slice(s).trim();
};

export async function readStream(worldId: string, t: T): Promise<Stream> {
  const { DatabaseSync } = await import("node:sqlite");
  const file = process.env.KALCHAS_DB ?? join(process.cwd(), "..", "..", "data", "kalchas.db");
  const q = new DatabaseSync(file, { readOnly: true }) as unknown as Q;
  const w = q.prepare("select id, title, scope, profile, created_at, engine, notes from worlds where id = ?").get(worldId);
  if (!w) throw new Error(t("noSuchWorld"));
  const ev: Ev[] = [];
  const ents = q.prepare("select id, name, kind, tier, aliases, summary, created_at, branch_id from entities where world_id = ? order by created_at").all(worldId);
  const byName = new Map<string, string>();
  // (a name's note in full-width brackets is left out)
  const note = /\uff08.*?\uff09/g;
  for (const e of ents) {
    byName.set(str(e.name).replace(note, ""), str(e.id));
    for (const a of arr(parse(e.aliases)) as unknown as string[]) if (typeof a === "string" && a.length >= 2) byName.set(a, str(e.id));
  }
  const idOf = (name: string) => byName.get(name.replace(note, "")) ?? [...byName.entries()].find(([n]) => n.length >= 2 && name.includes(n))?.[1] ?? null;
  const named = (text: string, not?: string | null) => [...new Set([...byName.entries()].filter(([n, id]) => n.length >= 2 && id !== not && text.includes(n)).map(([, id]) => id))];

  // ---------------------------------------------------------------- building

  const job = q.prepare("select id, created_at, updated_at from jobs where world_id = ? and type = 'build_world' order by rowid limit 1").get(worldId);
  const t0 = job ? ms(job.created_at) : ms(w.created_at);
  // the setup's draws, made before the world was built
  const fc = q.prepare("select setup from forecasts where id = ?").get(worldId);
  const setup = obj(parse(fc?.setup));
  let k = 0;
  for (const slot of ["world", "role", "goal"]) {
    for (const d of arr(obj(setup[slot]).draws)) {
      const buckets = arr(d.buckets).map((b) => ({ label: str(b.label), p: Number(b.weight) || 0 }));
      ev.push({ t: t0 - 4000 + k++ * 400, act: "draw", who: null, head: `${HEAD.draw} · ${str(d.variable)}`, text: str(d.conditions), w: 0.9, options: buckets, picked: str(d.picked), source: cut(str(d.source), 40), phase: "build" });
    }
  }
  if (job) {
    for (const l of q.prepare("select at, message from job_logs where job_id = ? order by at").all(job.id)) {
      const m = str(l.message);
      if (m.startsWith("✓ ")) ev.push({ t: ms(l.at), act: "advance", who: null, head: HEAD.stageDone, text: m.slice(2), w: 0.75, phase: "build" });
      else if (m.startsWith("▶ ")) ev.push({ t: ms(l.at), act: "advance", who: null, head: HEAD.begin, text: m.slice(2).split(" ‖ ").join(" · "), w: 0.3, phase: "build" });
    }
  }
  // people and organisations
  for (const e of ents)
    if (!e.branch_id) ev.push({ t: ms(e.created_at), act: "appear", who: str(e.id), head: str(e.kind) === "person" ? HEAD.person : HEAD.org, text: str(e.name), w: 0.6, phase: "build" });
  // facts, filed under whoever they are about, with where they came from
  const facts = q.prepare("select f.content, f.entity_ids, f.created_at, s.url from facts f left join sources s on s.id = f.source_id where f.world_id = ? order by f.created_at").all(worldId);
  for (const f of facts) {
    const who = str(arr(parse(f.entity_ids))[0] ?? "") || null;
    ev.push({ t: ms(f.created_at), act: "write", who, head: HEAD.fact, text: cut(str(f.content), 70), w: 0.15, source: f.url ? host(str(f.url)) : null, phase: "build" });
  }
  // ties
  for (const e of q.prepare("select from_id, to_id, label, created_at, branch_id from edges where world_id = ? order by created_at").all(worldId))
    if (!e.branch_id) ev.push({ t: ms(e.created_at), act: "link", who: str(e.from_id), to: str(e.to_id), head: HEAD.tie, text: str(e.label) || t("related"), w: 0.35, phase: "build" });
  // the calls: what each persona was drawn from, crowds, risks, the arc, look-ups
  const segments: Segment[] = [];
  const crowdSteps: CrowdStep[] = [];
  const calls = q.prepare("select purpose, actor_id, branch_id, output, created_at, ms from llm_calls where (world_id = ? or job_id = ?) and ok = 1 order by created_at").all(worldId, job?.id ?? "-");
  const actors = q.prepare("select id, persona, created_at, branch_id from actors where world_id = ?").all(worldId);
  const drawnOf = new Map<string, Row[]>(actors.map((a) => [str(a.id), arr(obj(parse(a.persona)).drawn)]));
  for (const c of calls) {
    const at = ms(c.created_at);
    const phase = c.branch_id ? "play" : "build";
    const out = obj(parse(c.output));
    const p = str(c.purpose);
    if (p === "persona_variables") {
      arr(out.people).forEach((pp, i) => {
        const who = idOf(str(pp.name));
        const drawn = who ? (drawnOf.get(who) ?? []) : [];
        arr(pp.variables).forEach((v, j) => {
          const picked = str(drawn.find((d) => str(d.name) === str(v.name))?.value) || null;
          ev.push({ t: at + i * 220 + j * 60, act: "draw", who, head: `${HEAD.persona} · ${str(v.name)}`, text: str(pp.group), w: 0.4, options: arr(v.buckets).map((b) => ({ label: str(b.label), p: Number(b.weight) || 0 })), picked, phase });
        });
      });
    } else if (p === "future_structure") {
      for (const cr of arr(out.crowds)) for (const sg of arr(cr.segments)) segments.push({ id: str(sg.id), crowd: str(cr.name), name: str(sg.name), size: Number(sg.size) || 0, cares: str(sg.cares), basis: cut(str(sg.basis), 60) });
      arr(out.crowds).forEach((cr, i) =>
        arr(cr.segments).forEach((s, j) => ev.push({ t: at + i * 300 + j * 120, act: "appear", who: `crowd:${str(s.id)}`, head: `${HEAD.crowd} · ${cut(str(cr.name), 14)}`, text: `${str(s.name)}${s.size ? ` · ${Number(s.size).toLocaleString("en-US")}` : ""}`, w: 0.65, source: cut(str(s.basis), 40), phase })),
      );
    } else if (p === "risks") {
      arr(out.risks).forEach((r, i) => ev.push({ t: at + i * 150, act: "write", who: null, head: HEAD.risk, text: `${str(r.event)} · ${str(r.conditions)}`, w: 0.5, phase }));
    } else if (p === "risk_lookup" || p === "setup_lookup" || p === "persona_lookup" || p === "newcomer_lookup") {
      const rate = Number(out.annual ?? out.rate ?? out.p);
      const txt = str(out.per ?? out.summary ?? out.note ?? "");
      ev.push({ t: at, act: "lookup", who: c.actor_id ? str(c.actor_id) : null, head: p === "newcomer_lookup" ? HEAD.lookNewcomer : HEAD.lookOdds, text: cut(`${Number.isFinite(rate) && rate > 0 ? `${(rate * 100).toFixed(rate < 0.01 ? 2 : 1)}% · ` : ""}${txt}`, 80), w: 0.3, source: out.url ? host(str(out.url)) : cut(str(out.source), 30) || null, phase });
    } else if (p.endsWith("_search")) {
      const what: Record<string, string> = { persona_lookup: t("lookPersona"), risk_lookup: t("lookRisk"), setup_lookup: t("lookSetup"), newcomer_lookup: t("lookNewcomer") };
      ev.push({ t: at, act: "lookup", who: c.actor_id ? str(c.actor_id) : null, head: HEAD.search, text: cut(str(out.query ?? out.q ?? "") || what[p.replace(/_search$/, "")] || t("lookAny"), 50), w: 0.08, phase });
    } else if (p === "person" && c.actor_id) {
      ev.push({ t: at - Number(c.ms || 0), act: "write", who: str(c.actor_id), head: HEAD.thinking, text: "", w: 0.05, phase });
    }
  }
  // personas written
  for (const a of actors) {
    const raw = parse(a.persona);
    const per = obj(raw);
    // (a persona is being rewritten as plain text: read whichever line it has)
    ev.push({ t: ms(a.created_at), act: "write", who: str(a.id), head: a.branch_id ? `${HEAD.persona} · ${HEAD.newcomer}` : HEAD.persona, text: cut(typeof raw === "string" ? raw : raw == null ? str(a.persona) : str(per.public) || str(per.identity), 90), w: 0.7, phase: a.branch_id ? "play" : "build" });
    // the traits drawn by the population norm (the engine said so in its basis, as "\u5e38\u6a21", "norm"), each low,
    // middle or high (which it wrote as "\u4f4e", "\u4e2d", "\u9ad8")
    for (const d of arr(per.drawn))
      if (/\u5e38\u6a21/.test(str(d.basis))) {
        const level: Record<string, string> = { "\u4f4e": t("low"), "\u4e2d": t("middle"), "\u9ad8": t("high") };
        const picked = str(d.value);
        ev.push({ t: ms(a.created_at) - 600, act: "draw", who: str(a.id), head: `${HEAD.trait} · ${str(d.name)}`, text: t("byPopulationNorm"), w: 0.25, options: [{ label: t("low"), p: 0.25 }, { label: t("middle"), p: 0.5 }, { label: t("high"), p: 0.25 }], picked: level[picked] ?? picked, phase: a.branch_id ? "play" : "build" });
      }
  }

  // whose place the protagonist's is, as the world was opened (before any play is: a play's own seat comes first below)
  const opening = str(q.prepare("select seat_entity_id from start_points where world_id = ? order by ordinal limit 1").get(worldId)?.seat_entity_id) || null;

  // ---------------------------------------------------------------- a world written whole, as one story (engine 12)

  // Such a world keeps none of the rows the acts above are read from (facts, ties, crowds, personas): what it found
  // is the pages it read and a list of findings, and who is in it, the forces in motion and its main questions are
  // its notes. They are read into the same acts, from the side the protagonist knows only, so that it is drawn as any
  // world is and not as a few people on bare ground.
  if (Number(w.engine) === 12) {
    const notes = obj(parse(w.notes));
    const known = arr(notes.entries).filter((e) => str(e.side) === "known" && str(e.name).trim());
    const lines = (x: unknown) => (Array.isArray(x) ? x.map(str).filter((s) => s.trim()) : []);
    const own = ents.filter((e) => !e.branch_id);
    // (what is looked up in a play belongs to the play, not to the world's making)
    const playFrom = ms(q.prepare("select min(created_at) as at from sessions where world_id = ?").get(worldId)?.at) || Infinity;
    // (the notes and the world's own people are written at once, as the world is set up)
    const born = own.map((e) => ms(e.created_at)).filter(Number.isFinite);
    const at = born.length ? Math.min(...born) : t0;
    // whom a text is about: of the world's own people, the one it names first (the protagonist aside, who is in all of it)
    const names = own
      .filter((e) => str(e.id) !== opening)
      .flatMap((e) => [str(e.name).replace(note, "").trim(), ...(arr(parse(e.aliases)) as unknown as string[]).filter((a) => typeof a === "string")].filter((n) => n.length >= 2).map((n) => [n, str(e.id)] as const));
    const about = (text: string) => {
      let best: string | null = null;
      let first = Infinity;
      for (const [n, id] of names) {
        const i = text.indexOf(n);
        if (i >= 0 && i < first) [best, first] = [id, i];
      }
      return best;
    };
    // the pages read while it was looked into, each a fact from where it was found
    for (const s of q.prepare("select url, title, excerpt, created_at from sources where world_id = ? order by created_at").all(worldId)) {
      const t1 = ms(s.created_at);
      if (!(t1 < playFrom)) continue;
      const title = str(s.title).trim();
      ev.push({ t: t1, act: "write", who: about(`${title} ${str(s.excerpt).slice(0, 800)}`), head: HEAD.fact, text: cut(title || host(str(s.url)), 70), w: 0.15, source: host(str(s.url)) || null, phase: "build" });
    }
    // what it found, each from the last place the line names
    lines(notes.found).forEach((line, i) => {
      const from = [...line.matchAll(DOMAIN)].map((m) => host(`https://${m[0]}`)).filter(Boolean).at(-1) ?? null;
      ev.push({ t: at - 2000 + i, act: "write", who: about(line), head: HEAD.fact, text: cut(line, 70), w: 0.15, source: from, phase: "build" });
    });
    // each person as the protagonist knows them; and the ties: everyone in the notes is someone the protagonist knows
    // of (the tie says who they are, as the note begins), and whoever a note names is someone its person deals with
    const pairs = new Set<string>();
    const tie = (a: string, b2: string, text: string, t1: number) => {
      const key = [a, b2].sort().join("|");
      if (a === b2 || pairs.has(key)) return;
      pairs.add(key);
      ev.push({ t: t1, act: "link", who: a, to: b2, head: HEAD.tie, text: cut(text, 28) || t("related"), w: 0.35, phase: "build" });
    };
    known
      .filter((e) => str(e.kind) === "person")
      .forEach((e, i) => {
        const id = idOf(str(e.name).trim());
        if (!id) return;
        const text = str(e.text);
        ev.push({ t: at + i * 10, act: "write", who: id, head: HEAD.persona, text: cut(text, 90), w: 0.7, phase: "build" });
        if (opening && id !== opening) tie(opening, id, clauseAt(text, 0), at + 600 + i * 10);
        for (const [n, other] of names) {
          const j = text.indexOf(n);
          if (j >= 0 && other !== id) tie(id, other, clauseAt(text, j), at + 700 + i * 10);
        }
      });
    // the forces in motion round it, where an older world had its crowds
    known
      .filter((e) => str(e.kind) === "force")
      .slice(0, 8)
      .forEach((e, i) => {
        const id = `force${i}`;
        const name = str(e.name).trim();
        segments.push({ id, crowd: "", name, size: 0, cares: str(e.text), basis: "", force: true });
        ev.push({ t: at + 900 + i * 120, act: "appear", who: `crowd:${id}`, head: HEAD.crowd, text: name, w: 0.65, phase: "build" });
      });
    // the main questions, on the line of time
    lines(notes.milestones).forEach((m, i) => ev.push({ t: at + 1500 + i * 60, act: "advance", who: null, head: HEAD.milestone, text: m, w: 0.6, phase: "build" }));
  }

  // ---------------------------------------------------------------- playing: the newest timeline

  const b = q.prepare("select b.id, s.seat_entity_id from branches b join sessions s on s.id = b.session_id where s.world_id = ? order by b.created_at desc limit 1").get(worldId);
  const seat = (b ? str(b.seat_entity_id) : "") || opening;
  const metrics = arr(obj(parse(w.profile)).metrics).map((m) => ({ key: str(m.key), label: str(m.label), unit: str(m.unit) }));
  if (b) {
    let lastSim = "";
    for (const e of q.prepare("select seq, sim_time, kind, actor_id, title, audience, payload, created_at from sim_events where branch_id = ? order by created_at, seq").all(b.id)) {
      const at = ms(e.created_at);
      const sim = str(e.sim_time);
      const who = e.actor_id ? str(e.actor_id) : null;
      const aud = (arr(parse(e.audience)) as unknown as string[]).filter((x) => typeof x === "string" && x !== who);
      const kind = str(e.kind);
      const title = cut(str(e.title), 80);
      if (kind === "user_action" && sim !== lastSim) {
        ev.push({ t: at - 1, act: "advance", who: null, head: HEAD.time, text: sim, w: 0.8, phase: "play", sim });
        lastSim = sim;
      }
      const base = { t: at, phase: "play" as const, sim };
      if (kind === "user_action") ev.push({ ...base, act: "write", who: seat, head: HEAD.yourMove, text: title, w: 1 });
      else if (kind === "actor_action") ev.push({ ...base, act: "write", who, head: HEAD.move, text: title, w: 0.7 });
      else if (kind === "entrant") ev.push({ ...base, act: "appear", who, head: HEAD.entrant, text: title, w: 0.9 });
      else if (kind === "chance") ev.push({ ...base, act: "write", who: aud[0] ?? null, head: HEAD.chance, text: title, w: 0.85 });
      else if (kind === "world" || kind === "exogenous" || kind === "stage") ev.push({ ...base, act: "write", who: null, head: kind === "stage" ? HEAD.stage : HEAD.world, text: title, w: 0.45 });
      // whoever it reached
      if ((kind === "user_action" || kind === "actor_action") && aud.length) aud.slice(0, 5).forEach((to, i) => ev.push({ ...base, t: at + 200 + i * 120, act: "link", who: kind === "user_action" ? seat : who, to, head: HEAD.reach, text: cut(str(e.title), 24), w: 0.3 }));
      // metric changes
      for (const mc of arr(obj(obj(parse(e.payload)).deferred).metricChanges)) {
        const m = metrics.find((x) => x.key === str(mc.key));
        const d = Number(mc.delta);
        if (m && d) ev.push({ ...base, t: at + 300, act: "change", who, head: m.label, text: `${d > 0 ? "+" : ""}${d.toLocaleString("en-US")}${m.unit && m.unit.length <= 2 ? ` ${m.unit}` : ""}`, w: 0.5 });
      }
    }
    // odds
    for (const j of q.prepare("select question, options, chosen, created_at, sim_time from judgments where branch_id = ? order by created_at").all(b.id)) {
      // the engine's notes after a question are left out: "(base rate …" and "(in this stretch …", in full-width
      // brackets; a question about the unexpected opens "\u610f\u5916(when):" ("the unexpected"), and one that came
      // about was chosen as "\u53d1\u751f" ("happened")
      const question = str(j.question).replace(/[\uff08(]\u57fa\u51c6\u7387[\s\S]*$/, "").replace(/\uff08\u8fd9\u6bb5\u65f6\u95f4[\s\S]*$/, "");
      const chance = question.startsWith("\u610f\u5916");
      ev.push({ t: ms(j.created_at), act: "draw", who: named(question)[0] ?? null, head: chance ? `${HEAD.chance} · ${HEAD.roll}` : HEAD.odds, text: cut(question.replace(/^\u610f\u5916\uff08[^\uff09]*\uff09\uff1a/, ""), 60), w: chance ? (j.chosen === "\u53d1\u751f" ? 0.85 : 0.2) : 0.75, options: arr(parse(j.options)).map((o) => ({ label: str(o.label), p: Number(o.probability) || 0 })), picked: str(j.chosen), phase: "play", sim: str(j.sim_time) });
    }
    // what each of them took away
    for (const m of q.prepare("select actor_id, text, created_at, sim_time from memories where branch_id = ? order by created_at").all(b.id))
      ev.push({ t: ms(m.created_at), act: "write", who: str(m.actor_id), head: HEAD.memory, text: cut(str(m.text), 60), w: 0.1, phase: "play", sim: str(m.sim_time) });
    // the crowds at each step
    for (const sn of q.prepare("select step, data, created_at from snapshots where branch_id = ? order by step").all(b.id)) {
      const st = obj(obj(parse(sn.data)).state).crowds;
      const state: CrowdStep["state"] = {};
      for (const [k2, v] of Object.entries(obj(st))) state[k2] = { reach: Number(obj(v).reach) || 0, share: Number(obj(v).share) || 0 };
      crowdSteps.push({ step: Number(sn.step), at: ms(sn.created_at), state });
    }
    // newcomers' ties
    for (const e of q.prepare("select from_id, to_id, label, created_at from edges where branch_id = ? order by created_at").all(b.id)) ev.push({ t: ms(e.created_at), act: "link", who: str(e.from_id), to: str(e.to_id), head: HEAD.newTie, text: str(e.label) || t("related"), w: 0.5, phase: "play" });
  }

  ev.sort((a, b2) => a.t - b2.t);
  const crowdNodes: StreamNode[] = ev.filter((e) => e.act === "appear" && e.who?.startsWith("crowd:")).map((e) => ({ id: e.who!, name: e.text.split(" · ")[0]!, kind: "crowd", tier: "crowd", crowd: true }));
  return {
    id: worldId,
    segments,
    crowdSteps,
    title: str(w.title),
    seat,
    start: str(obj(parse(w.scope)).timeStart) || null,
    nodes: [...ents.map((e) => ({ id: str(e.id), name: str(e.name), kind: str(e.kind), tier: str(e.tier), summary: str(e.summary) })), ...crowdNodes],
    metrics,
    events: ev.filter((e) => Number.isFinite(e.t)),
  };
}
