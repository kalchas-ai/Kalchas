import { join } from "node:path";
import { runningCalls } from "@kalchas/core";
import { getT } from "@/lib/i18n/server";

/**
 * Everything a project has waited on so far, with real times: understanding what was written (the questions), the
 * build (its log, every model call, every search and each fact the things looked up established), the world being
 * made, and the first moment of its play. The pages that show a wait as it happens read it over and
 * over; the /design/waits test page plays finished ones back from it. Times are epoch ms; a model call's start is
 * its end less its length, and a call still running is given an end some minutes off. Read-only. The few words of the
 * interface written here are in the language the request asks for (lib.tape).
 */

type Row = Record<string, unknown>;
export type TapeCall = {
  p: string;
  s: number;
  e: number;
  ok: boolean;
  err: string | null;
  usd: number;
  label?: string;
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const parse = (x: unknown): Row | null => {
  try {
    return JSON.parse(String(x)) as Row;
  } catch {
    return null;
  }
};
/** A field from a JSON text that may have been cut short when it was logged. */
const field = (x: unknown, k: string) =>
  String(x ?? "")
    .match(new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.)*)"`))?.[1]
    ?.replace(/\\"/g, '"') ?? null;

export async function readTape(id: string) {
  const words = await getT("lib.tape");
  const t = (x: unknown) => Date.parse(String(x));
  const { DatabaseSync } = await import("node:sqlite");
  const file = process.env.KALCHAS_DB ?? join(process.cwd(), "..", "..", "data", "kalchas.db");
  const q = new DatabaseSync(file, { readOnly: true });
  try {
    const all = (sql: string, ...a: (string | number)[]) => q.prepare(sql).all(...a) as Row[];
    const one = (sql: string, ...a: (string | number)[]) => q.prepare(sql).get(...a) as Row | undefined;
    const calls = (world: string) =>
      all("select purpose, created_at, ms, ok, error, output, cost_usd from llm_calls where world_id = ? order by created_at", world)
        .map((r): TapeCall & { out: unknown } => ({
          p: String(r.purpose),
          s: t(r.created_at) - Number(r.ms),
          e: t(r.created_at),
          ok: !!r.ok,
          err: r.error ? String(r.error).slice(0, 160) : null,
          usd: Number(r.cost_usd ?? 0),
          out: r.output,
        }))
        // and the ones still running (written down only when they end): to end some time from now
        .concat(
          runningCalls(world).map((r) => ({
            p: r.purpose,
            s: r.startedAt,
            e: Date.now() + 600_000,
            ok: true,
            err: null,
            usd: 0,
            out: null,
          })),
        );
    const strip = (c: TapeCall & { out: unknown }, label?: string): TapeCall => ({
      p: c.p,
      s: c.s,
      e: c.e,
      ok: c.ok,
      err: c.err,
      usd: c.usd,
      ...(label ? { label } : {}),
    });

    const w = one("select id, title, prompt, created_at from worlds where id = ?", id);
    const f = one("select question, clarify, lookups from forecasts where id = ?", id);
    if (!w || !f) throw new Error(words("noSuchProject"));
    const fc = calls(id);

    // understanding what was written: the field survey and the questions, run side by side from the start
    const t0 = t(w.created_at);
    const before = fc.filter((c) => ["survey_plan", "survey", "survey_vocab", "clarify"].includes(c.p) && c.e < t0 + 15 * 60_000);
    const vocab = before.find((c) => c.p === "survey_vocab" && c.ok);
    const v = vocab ? parse(vocab.out) : null;
    const clar = before.filter((c) => c.p === "clarify");
    const okClar = clar.find((c) => c.ok);
    const ins = okClar ? (parse(okClar.out)?.insight as Row | undefined) : undefined;
    const clarify = (JSON.parse(String(f.clarify ?? "[]")) as Row[]).filter((x) => !x.parent);
    const understand = {
      t0,
      t1: Math.max(...before.map((c) => c.e), t0 + 1000),
      calls: before.map((c) => strip(c)),
      planQueries: (parse(before.find((c) => c.p === "survey_plan")?.out)?.queries as string[] | undefined) ?? [],
      queries: before
        .filter((c) => c.p === "survey")
        .map((c) => {
          const o = parse(c.out);
          // older logs kept the pages' addresses; newer ones each page's address and title
          const hits = ((o?.hits as { url?: string; title?: string }[] | undefined) ?? ((o?.urls as string[] | undefined) ?? []).map((url) => ({ url, title: "" }))).filter((h) => h.url);
          return {
            at: c.e,
            s: c.s,
            q: String(o?.query ?? ""),
            hosts: [...new Set(hits.map((h) => host(h.url!)).filter(Boolean))],
            titles: hits.map((h) => String(h.title ?? "")).filter(Boolean),
          };
        }),
      vocab: v
        ? {
            at: vocab!.e,
            terms: (v.terms as string[]) ?? [],
            players: (v.players as string[]) ?? [],
            segments: (v.segments as string[]) ?? [],
          }
        : null,
      insight: ins
        ? {
            said: String(ins.said ?? ""),
            understood: String(ins.understood ?? ""),
            premises: ((ins.premises as Row[]) ?? []).map((p) => String(p.text)),
          }
        : null,
      questions: clarify.map((x) => ({
        q: String(x.q),
        about: String(x.about ?? ""),
        answer: x.answer == null ? null : String(Array.isArray(x.answer) ? x.answer.join(words("listSeparator")) : x.answer),
      })),
    };

    // the build: one job, which looks things up (the research) and makes the world of the same id side by side
    const job = one("select id, created_at, updated_at from jobs where world_id = ? and type = 'build_world' order by created_at desc limit 1", id);
    let research = null;
    if (job) {
      const r0 = t(job.created_at);
      const logs = all("select at, level, message from job_logs where job_id = ? order by id", String(job.id)).map((l) => ({
        at: t(l.at),
        level: String(l.level),
        m: String(l.message),
      }));
      const rc = fc.filter((c) => c.e >= r0 - 1000);
      const r1 = Math.max(logs.at(-1)?.at ?? r0, ...rc.map((c) => c.e));
      // what was found: the facts each thing looked up established; a world written whole (engine 12) keeps no facts,
      // and what it found is the pages it read while it was built
      const established = all(
        "select f.id, f.created_at, f.content, json_extract(f.evidence, '$.item') as item, s.url from facts f left join sources s on s.id = f.source_id where f.world_id = ? and json_extract(f.evidence, '$.item') is not null order by f.created_at",
        id,
      ).map((i) => ({
        id: String(i.id),
        at: t(i.created_at),
        title: String(i.content),
        item: i.item ? String(i.item) : null,
        host: i.url ? host(String(i.url)) : "",
      }));
      const pages = () =>
        all("select id, created_at, title, url from sources where world_id = ? order by created_at", id)
          .map((s) => ({ id: String(s.id), at: t(s.created_at), title: String(s.title ?? s.url), item: null, host: host(String(s.url)) }))
          .filter((s) => s.at >= r0 - 1000 && s.at <= r1);
      research = {
        t0: r0,
        t1: r1,
        logs,
        calls: rc.map((c) => strip(c)),
        searches: all("select created_at, query, item, round, fresh from searches where project_id = ? order by created_at", id)
          .map((s) => ({
            at: t(s.created_at),
            q: String(s.query),
            item: s.item ? String(s.item) : null,
            round: Number(s.round),
            fresh: Number(s.fresh),
          }))
          .filter((s) => s.at >= r0 - 1000),
        intel: established.length ? established : pages(),
        items: ((JSON.parse(String(f.lookups ?? "null")) as Row[] | null) ?? []).map((x) => ({
          id: String(x.id),
          for: String(x.for),
          what: String(x.what),
          state: String(x.state),
        })),
        answers: understand.questions.filter((x) => x.answer).map((x) => ({ q: x.q, a: x.answer! })),
      };
    }

    // the world (the project's own, once its build has begun), and the first moment of its play
    const wd = job ? w : undefined;
    let world = null;
    let sim = null;
    if (wd) {
      const wid = String(wd.id);
      const bj = job;
      const wc = calls(wid);
      const logs = bj
        ? all("select at, level, message from job_logs where job_id = ? order by id", String(bj.id)).map((l) => ({
            at: t(l.at),
            level: String(l.level),
            m: String(l.message),
          }))
        : [];
      const w0 = bj ? t(bj.created_at) : t(wd.created_at);
      // (the engine logs the world as built in Chinese: "\u4e16\u754c\u6784\u5efa\u5b8c\u6210", "the world is built")
      const built = logs.find((l) => l.m.startsWith("✓ \u4e16\u754c\u6784\u5efa\u5b8c\u6210"))?.at ?? logs.at(-1)?.at ?? w0;
      world = {
        id: wid,
        title: String(wd.title ?? ""),
        t0: w0,
        t1: built,
        logs,
        calls: wc.filter((c) => c.e <= built + 1000).map((c) => strip(c)),
        entities: all("select id, name, kind, created_at from entities where world_id = ? order by created_at", wid).map((e) => ({
          id: String(e.id),
          name: String(e.name),
          kind: String(e.kind),
          at: t(e.created_at),
        })),
        edges: all("select from_id, to_id, label, created_at from edges where world_id = ? and branch_id is null", wid).map((e) => ({
          from: String(e.from_id),
          to: String(e.to_id),
          label: String(e.label ?? "").slice(0, 40),
          at: t(e.created_at),
        })),
        personas: all("select id, persona, created_at from actors where world_id = ? order by created_at", wid).map((a) => {
          // a persona is plain text, or a public and a private part: what is shown is the public one
          const raw = parse(a.persona) as unknown;
          const per = raw && typeof raw === "object" ? (raw as Row) : null;
          return {
            id: String(a.id),
            at: t(a.created_at),
            identity: String(typeof raw === "string" ? raw : per ? (per.public ?? per.identity ?? "") : (a.persona ?? "")).slice(0, 60),
          };
        }),
        ...(() => {
          const rows = all("select created_at, content, entity_ids from facts where world_id = ? order by created_at", wid);
          return {
            facts: rows.map((x) => t(x.created_at)),
            factText: rows.map((x) =>
              String(x.content ?? "")
                .replace(/\s+/g, " ")
                .slice(0, 80),
            ),
            factWho: rows.map((x) => (JSON.parse(String(x.entity_ids ?? "[]")) as string[])[0] ?? null),
          };
        })(),
      };
      // the play's opening: the session and its first branch, then the first moment written
      const br = one("select b.id, b.created_at from branches b join sessions s on s.id = b.session_id where s.world_id = ? order by b.created_at limit 1", wid);
      const sit = wc.find((c) => c.p === "moment" && c.e > built);
      if (br && sit) {
        const o = parse(sit.out);
        sim = {
          branch: String(br.id),
          t0: Math.min(t(br.created_at), sit.s),
          t1: sit.e,
          calls: [strip(sit)],
          headline: String(o?.headline ?? field(sit.out, "headline") ?? ""),
          scene: String(o?.scene ?? field(sit.out, "scene") ?? ""),
          people: world.entities.slice(0, 14).map((e) => e.name),
          facts: world.facts.length,
        };
      }
    }

    return {
      id,
      title: String(w.title ?? w.prompt),
      question: String(f.question),
      understand,
      research,
      world,
      sim,
    };
  } finally {
    q.close();
  }
}
