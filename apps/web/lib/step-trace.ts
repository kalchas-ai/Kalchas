import "server-only";
import { join } from "node:path";
import type { Trace } from "@/components/product/replay/stage/trace";
import type { T } from "@/lib/i18n/locales";

/**
 * What the engine actually did in a step of a timeline, from its own records (read-only): every model call in order —
 * who it spoke for, how long it took, what came out of it (RULE's reading of your move, each person's private thinking
 * and what they did, the odds of what was uncertain and which came up, the moment written) — and the events of the
 * step. Calls are written as each one finishes, so a step still running can be read as far as it has got. A step ends
 * with the one call that writes its moment (the opening of a play is a moment with no move before it).
 *
 * Asking (a question in the decision box) is left out: it does not move time. `tr` gives the words of the interface
 * written here (what someone with no name is called).
 */

type Row = { id: string; actor_id: string | null; role: string; purpose: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; ms: number; output: string | null; created_at: string };
type Ev = { id: string; seq: number; kind: string; actor_id: string | null; title: string; description: string; created_at: string };
type Q = { prepare: (sql: string) => { all: (...a: unknown[]) => unknown[]; get: (...a: unknown[]) => unknown } ; close: () => void };

const parse = (s: string | null): Record<string, unknown> | null => {
  try {
    return s ? (JSON.parse(s) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const str = (x: unknown) => (typeof x === "string" ? x : "");
const arr = (x: unknown) => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
/**
 * A question without the note the engine writes after it, in brackets full-width or not: "(roll …)" and "(base
 * rate: …)", which it writes as "\u70b9\u6570" and "\u57fa\u51c6\u7387".
 */
const bare = (q: string) => q.replace(/[\uff08(]\u70b9\u6570[^\uff09)]*[\uff09)]?/g, "").replace(/[\uff08(]\u57fa\u51c6\u7387[^\uff09)]*[\uff09)]?/g, "").trim();
const said = (x: unknown) => (typeof x === "string" ? x : typeof x === "number" || typeof x === "boolean" ? String(x) : "");
/** What was set down, in a line: "Diesel used a month, as booked → 800 litres/month". */
const changed = (x: Record<string, unknown>) => [str(x.what), [said(x.to), str(x.unit)].filter(Boolean).join(" ")].filter(Boolean).join(" → ");
/** Calls that work out a step: not the adviser answering a question, nor RULE reading what was not a move after all. */
const working = (c: Row) => c.purpose !== "advise" && !(c.purpose === "rule" && parse(c.output)?.kind !== "move");

async function open(): Promise<Q> {
  const { DatabaseSync } = await import("node:sqlite");
  const file = process.env.KALCHAS_DB ?? join(process.cwd(), "..", "..", "data", "kalchas.db");
  return new DatabaseSync(file, { readOnly: true }) as unknown as Q;
}

/** The calls of step `step` (counted as the timeline counts them), or null when it has no record. */
export async function traceOfStep(branchId: string, step: number, tr: T): Promise<Trace | null> {
  const q = await open();
  try {
    const b = q.prepare("select fork_step from branches where id = ?").get(branchId) as { fork_step: number | null } | undefined;
    if (!b) return null;
    const calls = q.prepare("select id, actor_id, role, purpose, model, input_tokens, output_tokens, cost_usd, ms, output, created_at from llm_calls where branch_id = ? and ok = 1 order by created_at").all(branchId) as Row[];
    // a step is the calls up to and including the writing of its moment; a timeline of its own opens with a moment
    // written before any step (its first), while one forked off starts at the step it was forked at
    const segs: Row[][] = [];
    let cur: Row[] = [];
    for (const c of calls.filter(working)) {
      cur.push(c);
      if (c.purpose === "moment") {
        segs.push(cur);
        cur = [];
      }
    }
    const seg = segs[step - (b.fork_step ?? 0)];
    if (!seg) return null;
    return build(q, branchId, step, seg, Math.min(...seg.map((c) => Date.parse(c.created_at) - c.ms)), true, tr);
  } finally {
    q.close();
  }
}

/** Everything worked out since `since` (ms): the step you just took, as far as it has got, or all of it once done. */
export async function traceSince(branchId: string, since: number, step: number, tr: T): Promise<Trace> {
  const q = await open();
  try {
    const calls = (q.prepare("select id, actor_id, role, purpose, model, input_tokens, output_tokens, cost_usd, ms, output, created_at from llm_calls where branch_id = ? and ok = 1 and created_at >= ? order by created_at").all(branchId, new Date(since - 1000).toISOString()) as Row[]).filter(working);
    // stop at the first moment: anything after it belongs to the next step
    const end = calls.findIndex((c) => c.purpose === "moment");
    const work = end >= 0 ? calls.slice(0, end + 1) : calls;
    return build(q, branchId, step, work, since, end >= 0, tr);
  } finally {
    q.close();
  }
}

function build(q: Q, branchId: string, step: number, work: Row[], start: number, complete: boolean, tr: T): Trace {
  const t = (c: Row) => Date.parse(c.created_at);
  const end = work.length ? Math.max(...work.map(t)) : start;
  const names = new Map((q.prepare("select e.id, e.name from entities e join branches br on br.id = ? join sessions s on s.id = br.session_id where e.world_id = s.world_id").all(branchId) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const all = q.prepare("select id, seq, kind, actor_id, title, description, created_at from sim_events where branch_id = ? order by seq").all(branchId) as Ev[];
  const inStep = all.filter((e) => Date.parse(e.created_at) >= start - 1000 && Date.parse(e.created_at) <= end + 3000);
  // everything left to odds in the step: the program rolls each one and keeps it as a judgment, with no call of its own
  const took = (q.prepare("select question, options, chosen, note, created_at from judgments where branch_id = ? order by created_at").all(branchId) as { question: string; options: string; chosen: string; note: string | null; created_at: string }[]).filter((j) => Date.parse(j.created_at) >= start - 1000 && Date.parse(j.created_at) <= end + 3000);

  // each event goes to the call it came out of: the last call that finished just before it was written
  const byCall = new Map<string, string[]>();
  for (const e of inStep) {
    const at = Date.parse(e.created_at);
    const from = [...work].reverse().find((c) => t(c) <= at + 5 && at - t(c) < 2500);
    if (from) byCall.set(from.id, [...(byCall.get(from.id) ?? []), e.id]);
  }

  const calls = work.map((c) => {
    const o = parse(c.output) ?? {};
    const actor = c.actor_id ? { id: c.actor_id, name: names.get(c.actor_id) ?? tr("aSide") } : null;
    let detail: Record<string, unknown> = {};
    if (c.purpose === "rule") {
      detail = {
        restatement: str(o.restatement),
        targets: arr(o.decide).map((x) => str(x.who)).filter(Boolean),
        settings: arr(o.holds).map((x) => ({ text: changed(x) })),
        rejected: arr(o.rejected).map((r) => str(r.text)),
        uncertain: arr(o.uncertain).map((x) => ({ question: bare(str(x.question)), base: str(x.basis) })),
      };
    } else if (c.purpose === "person") {
      const does = str(o.does);
      detail = { thinking: str(o.thinking), action: does || null, quiet: o.wait === true || !does, said: str(o.says) || null, open: o.public === true };
    } else if (c.purpose === "moment") {
      detail = { headline: str(o.headline), scene: str(o.scene), why: str(o.why), day: str(o.day), options: arr(o.options).length };
    }
    const produced = byCall.get(c.id) ?? [];
    return {
      id: c.id,
      role: c.role,
      purpose: c.purpose,
      model: c.model.replace(/\s*@.*$/, "").replace(/^.*\//, ""),
      from: Math.max(0, t(c) - c.ms - start),
      to: t(c) - start,
      inTok: c.input_tokens,
      outTok: c.output_tokens,
      cost: c.cost_usd,
      actor,
      wave: null,
      events: produced,
      detail,
    };
  });
  if (took.length) {
    const at = Math.max(0, Date.parse(took[0]!.created_at) - start);
    // the note is "roll …; what the chances rest on" (with the stretch first, for what may strike at any time), its
    // parts parted by semicolons full-width or not, the roll written "\u70b9\u6570" or "roll"; what is left is joined
    // again by the full-width one
    const basis = (note: string | null) => (note ?? "").split(/[\uff1b;]\s*/).filter((x) => !/^(\u70b9\u6570|roll\b|\d{4}-\d\d-\d\d\s*→)/.test(x.trim())).join("\uff1b");
    (calls as unknown[]).push({
      id: `took:${took[0]!.created_at}`,
      role: "adjudicator",
      purpose: "resolve_uncertain",
      model: "",
      from: at,
      to: at + 1,
      inTok: 0,
      outTok: 0,
      cost: 0,
      actor: null,
      wave: null,
      events: [],
      detail: {
        items: took.map((j) => ({
          // (without its note; and where the engine asks "whether they take this on", it is said as "whether they
          // take on what you came to them about")
          question: j.question.replace(/[\uff08(][\s\S]*$/, "").replace("\u63a5\u4e0d\u63a5\u8fd9\u4ef6\u4e8b", " \u63a5\u4e0d\u63a5\u4f60\u627e\u4ed6\u7684\u8fd9\u4ef6\u4e8b"),
          base: basis(j.note),
          outcomes: arr((() => { try { return JSON.parse(j.options); } catch { return []; } })()).map((o) => ({ label: str(o.label), p: typeof o.probability === "number" ? o.probability : 0 })),
          chosen: j.chosen,
        })),
      },
    });
  }
  return {
    step,
    start,
    ms: Math.max(1, end - start),
    complete,
    calls: calls as Trace["calls"],
    events: inStep.map((e) => ({ id: e.id, seq: e.seq, kind: e.kind, actor: e.actor_id ? (names.get(e.actor_id) ?? null) : null, actorId: e.actor_id, title: e.title })),
    totals: {
      calls: calls.length,
      inTok: calls.reduce((s, c) => s + c.inTok, 0),
      outTok: calls.reduce((s, c) => s + c.outTok, 0),
      cost: calls.reduce((s, c) => s + c.cost, 0),
      actors: new Set(calls.filter((c) => c.purpose === "person").map((c) => c.actor?.id ?? c.id)).size,
    },
  };
}
