"use client";

import { useMemo, useRef } from "react";
import type { WorldView } from "@kalchas/core";
import { MONO } from "@/components/kit/palette";
import { useSize } from "@/components/kit/dither";
import { sky, skyNow, type Level } from "@/components/sky/build";
import { Sky } from "@/components/sky/sky";
import { useApp } from "@/components/product/shell";
import { rich, useT } from "@/lib/i18n/client";
import { construction, placeNodes, type BuildWorld } from "../building";
import { BITS_CSS, Cloud, Head, N, Ruler, Stream } from "./bits";
import { BuildMotion } from "./build-motion";
import { WAIT_CSS, creep, cycle, drip, dur, durShort, sec, type Tape } from "./tape";

/**
 * A world being built, the whole page given to it. In the middle, the world taking shape as the building page draws
 * it (the ring of its time, the people as cells, the ties as axons), each person and tie arriving one by one, each
 * new fact surfacing beside the person it is about. Round it, what is in hand: at the top the time taken, what is
 * being done now and the counts; on the left everyone in the world with how much is known about them (whoever is
 * being looked into lit); on the right what is coming in this minute — the research being read, the facts filed,
 * the ties weighed and found, the personas written, the checks — and along the foot every stage by how far it has
 * got. Something changes every second.
 */

/**
 * The stages of building a world from a prediction, in order, each with the name the engine logs it under ("✓ <name>"
 * once done, "▶ … <name>" once begun). The engine logs in Chinese: set the scope and the people, turn the findings
 * into the world's facts, sort out what is scheduled, build the ties, write the profiles, set the stages and the
 * endings, weigh how complete it is, pick the key numbers, set the start. What the page says of each is the texts
 * `short.<key>` and `now.<key>` of "product.wait.world".
 */
export const W_STAGES = [
  ["frame", "\u754c\u5b9a\u8303\u56f4\u548c\u89d2\u8272"],
  ["facts", "\u628a\u60c5\u62a5\u53d8\u6210\u4e16\u754c\u91cc\u7684\u4e8b\u5b9e"],
  ["outside", "\u6574\u7406\u5df2\u6392\u671f\u7684\u4e8b"],
  ["relations", "\u6784\u5efa\u5173\u7cfb\u7f51"],
  ["personas", "\u751f\u6210\u89d2\u8272\u4eba\u8bbe"],
  ["markers", "\u8bbe\u5b9a\u9636\u6bb5\u8282\u70b9\u548c\u7ec8\u5c40"],
  ["completeness", "\u8bc4\u4f30\u5b8c\u6574\u5ea6"],
  ["profile", "\u751f\u6210\u5173\u952e\u6307\u6807"],
  ["startpoints", "\u8bbe\u5b9a\u5f00\u5c40"],
] as const;
/** Each stage's name in the engine's log, by its key. */
const LOGGED = Object.fromEntries(W_STAGES) as Record<(typeof W_STAGES)[number][0], string>;
/** The engine's name for you ("you" in Chinese). */
const YOU = "\u4f60";
/** Without what is in full-width brackets. */
const unbracket = (s: string) => s.replace(/\uff08.*?\uff09/g, "");

const P_OF: Record<string, string> = {
  frame: "future_frame",
  facts: "future_actor",
  outside: "future_outside",
  relations: "relations",
  personas: "personas",
  markers: "future_markers",
  completeness: "completeness",
  profile: "profile",
  startpoints: "future_start",
};

export default function NewWorld({
  tape,
  real,
  t,
  motion = false,
  motionStyle,
  overlay,
  hideSky = false,
}: {
  tape: Tape;
  real: WorldView;
  t: number;
  /** The motion layer (on in the /design/viz drafts only, for now). */
  motion?: boolean;
  /** How facts and personas arrive in the motion layer (see BuildMotion). */
  motionStyle?: "fly" | "link" | "count" | "gather";
  /** Leave out the picture and the names on it (another picture is drawn in its place by `overlay`). */
  hideSky?: boolean;
  /** More drawn over the picture, where its people stand (the /design/viz drafts). */
  overlay?: (x: { placed: Map<string, { x: number; y: number; r: number; name: string }>; w: number; h: number; c: { cx: number; cy: number; rx: number; ry: number } }) => React.ReactNode;
}) {
  const { P } = useApp();
  const tr = useT("product.wait.world");
  const tt = useT("product.wait.tape");
  const W = tape.world!;
  const T = (ms: number) => sec(ms, W.t0);
  const [ref, { w, h }] = useSize<HTMLDivElement>();

  // everything that comes in, let out one at a time until the next batch
  const base = useMemo(() => {
    const ents = drip(
      W.entities.map((e) => T(e.at)),
      { cap: 14, gap: 0.35 },
    );
    const entAt = new Map(W.entities.map((e, i) => [e.id, ents[i]!]));
    const eds = drip(
      W.edges.map((e) => T(e.at)),
      { cap: 14, gap: 0.15 },
    );
    const edges = W.edges.map((e, i) => ({ ...e, show: eds[i]! })).sort((a, b) => a.show - b.show);
    const facts = drip(W.facts.map(T), { cap: 60, gap: 0.03 });
    const factList = W.facts
      .map((_, i) => ({
        i,
        show: facts[i]!,
        text: W.factText[i]!,
        who: W.factWho[i] ?? null,
      }))
      .sort((a, b) => a.show - b.show);
    const pers = drip(
      W.personas.map((p) => T(p.at)),
      { cap: 12, gap: 0.4 },
    );
    const personas = W.personas.map((p, i) => ({ ...p, show: pers[i]! })).sort((a, b) => a.show - b.show);
    // who each look-up was for: the earliest look-up that ended before the person's line (the engine logs a look-up
    // as "\u8865\u67e5 <name>\uff1a…", "looked into <name>: …" in Chinese)
    const ends = W.logs
      .filter((l) => l.m.startsWith("\u8865\u67e5 "))
      .map((l) => ({
        at: l.at,
        name: l.m.replace(/^\u8865\u67e5 /, "").replace(/\uff1a.*$/, ""),
      }));
    const actor = W.calls.filter((c) => c.p === "future_actor").sort((a, b) => a.e - b.e);
    const taken = new Map<number, string>();
    for (const e of ends) {
      const k = actor.findIndex((c, i) => !taken.has(i) && c.e <= e.at + 500);
      if (k >= 0) taken.set(k, e.name);
    }
    const looks = actor.map((c, i) => ({
      s: T(c.s),
      e: T(ends.find((x) => x.name === taken.get(i))?.at ?? c.e),
      name: taken.get(i) ?? null,
    }));
    const names = new Map(W.entities.map((e) => [e.id, e.name]));
    const people = W.entities.filter((e) => e.name !== YOU);
    const pairs = people.slice(0, 10).flatMap((a, i) => people.slice(i + 1, 10).map((b) => [a.name, b.name] as const));
    const intel = tape.research?.intel ?? [];
    return {
      entAt,
      edges,
      factList,
      personas,
      looks,
      names,
      people,
      pairs,
      intel,
    };
  }, [tape]); // eslint-disable-line react-hooks/exhaustive-deps

  // where everything stands at this second
  const logs = W.logs.filter((l) => T(l.at) <= t);
  const has = (m: string) => logs.some((l) => l.m === m);
  const begun = (label: string) => logs.some((l) => l.m.startsWith("▶") && l.m.includes(label));
  const startOf = (label: string) => T([...logs].reverse().find((l) => l.m.startsWith("▶") && l.m.includes(label))?.at ?? W.t0);
  const of = (p: string) => W.calls.filter((c) => c.p === p);
  const frac = (p: string) => (of(p).length ? of(p).filter((c) => T(c.e) <= t).length / of(p).length : 0);
  const stages = W_STAGES.map(([key, label]) => {
    const done = has(`✓ ${label}`);
    const running = !done && begun(label);
    const el = t - startOf(label);
    let part = done ? 1 : running ? creep(el, P_OF[key]!) : 0;
    if (running && key === "facts") part = 0.85 * ((frac("compile_facts") + frac("future_actor")) / 2) + 0.15 * creep(el, "future_actor");
    if (running && key === "personas") part = 0.8 * frac("personas") + 0.2 * creep(el, "personas");
    return { key, label, done, running, el, part };
  });
  const running = stages.filter((s) => s.running);
  const lead = running.sort((a, b) => b.el - a.el)[0] ?? null;
  const allDone = has(`✓ ${LOGGED.startpoints}`);
  const facts = base.factList.filter((f) => f.show <= t);
  const nodesIn = new Set(W.entities.filter((e) => (base.entAt.get(e.id) ?? Infinity) <= t).map((e) => e.id));
  const edgesIn = base.edges.filter((e) => e.show <= t);
  const looking = base.looks.filter((x) => x.s <= t && x.e > t && x.name).map((x) => x.name!);
  const scheduled = Number(
    [...logs]
      .reverse()
      // (the engine logs the count as "\u5df2\u6392\u671f\u7684\u4e8b\uff1a<n>", "scheduled: <n>" in Chinese)
      .find((l) => l.m.startsWith("\u5df2\u6392\u671f\u7684\u4e8b\uff1a"))
      ?.m.match(/(\d+)/)?.[1] ?? 0,
  );
  const perPerson = new Map<string, number>();
  for (const f of facts) if (f.who) perPerson.set(f.who, (perPerson.get(f.who) ?? 0) + 1);

  // the world as the picture draws it, a piece at a time
  const world: BuildWorld = useMemo(() => {
    const nodes = real.graph.nodes.filter((n) => nodesIn.has(n.id));
    const ok = (e: { from: string; to: string }) => edgesIn.some((x) => (x.from === e.from && x.to === e.to) || (x.from === e.to && x.to === e.from));
    return {
      graph: {
        ...real.graph,
        nodes,
        edges: real.graph.edges.filter((e) => nodesIn.has(e.from) && nodesIn.has(e.to) && ok(e)),
      },
      seatId: real.seatId,
      scope: has(`✓ ${LOGGED.frame}`) ? real.scope : null,
      startPoints: allDone ? real.startPoints : [],
      completeness: has(`✓ ${LOGGED.completeness}`) ? real.completeness : null,
      events: scheduled,
    };
  }, [nodesIn.size, edgesIn.length, allDone, has(`✓ ${LOGGED.completeness}`), has(`✓ ${LOGGED.frame}`), scheduled]); // eslint-disable-line react-hooks/exhaustive-deps
  // the two sides, as wide as the screen allows (none on a narrow one)
  const lw = w >= 1380 ? 340 : w >= 1080 ? 260 : 0;
  const rw = w >= 1380 ? 380 : w >= 1080 ? 290 : 0;
  const c = {
    cx: (lw + w - rw) / 2,
    cy: 250 + (h - 250 - 110) / 2,
    rx: Math.max(150, Math.min((w - lw - rw - 80) / 2, 400)),
    ry: 0,
  };
  c.ry = Math.max(90, Math.min(c.rx * 0.62, (h - 250 - 110) / 2 - 16));
  const seen = useRef(new Map<string, number>());
  const first = (k: string, i = 0) => {
    let v = seen.current.get(k);
    if (v == null) {
      v = skyNow() + Math.min(0.6, i * 0.01);
      seen.current.set(k, v);
    }
    return v;
  };
  const stKey = stages.map((s) => `${s.key}:${s.done ? "d" : s.running ? "r" : "w"}`).join();
  const scene = useMemo(() => {
    if (!w || !h) return null;
    const s = sky().dust({ w, h, n: Math.round((w * h) / 520), b: 0.6 });
    const as = (k: string) => stages.find((x) => x.key === k)!;
    const map = (k: string, as2: string) => ({
      key: as2,
      label: "",
      state: (as(k).done ? "done" : as(k).running ? "running" : "waiting") as "done" | "running" | "waiting",
    });
    construction(
      s,
      w,
      h,
      world,
      [map("frame", "scope"), map("facts", "research"), map("outside", "exogenous"), map("personas", "personas"), map("markers", "markers"), map("completeness", "completeness")],
      first,
      c,
    );
    return s.done();
  }, [w, h, world, stKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const placed = useMemo(() => new Map(placeNodes(world, c).map((n) => [n.id, n])), [world, w, h]); // eslint-disable-line react-hooks/exhaustive-deps
  const byName = new Map([...placed.values()].map((n) => [n.name, n]));
  const levels = useMemo<Record<string, Level>>(() => {
    const out: Record<string, Level> = {};
    for (const n of looking) {
      const p = byName.get(n);
      if (p) out[`n:${p.id}`] = { lit: 1.9, warm: 0.9, size: 1.25 };
    }
    return out;
  }, [looking.join(), placed]); // eslint-disable-line react-hooks/exhaustive-deps

  // the newest fact beside the person it is about
  const beside = [...facts].reverse().find((f) => f.who && placed.has(f.who) && t - f.show < 2.2);

  // the line under the title, and the stream on the right
  const nowText = allDone ? tr("ready") : lead ? (lead.key === "facts" && looking.length ? tr("lookingUp", { names: looking.join(tr("sep")) }) : tr(`now.${lead.key}`)) : tr("preparingNext");
  const others = running.filter((s) => s !== lead).map((s) => tr(`short.${s.key}`));
  type Row = { k: string; a: string; b?: string; warm?: boolean };
  let streamHead = "";
  let rows: Row[] = [];
  const tick = (every: number, from: number, n: number) => {
    const k = Math.floor((t - from) / every);
    return Array.from({ length: n }, (_, j) => k - j).filter((x) => x >= 0);
  };
  if (lead?.key === "frame") {
    streamHead = tr("streamResearch");
    rows = tick(1.2, startOf(LOGGED.frame), 7).map((k) => {
      const i = cycle(base.intel, 0, k * 1.2, 1.2);
      return { k: `i${k}`, a: i?.title ?? "", b: i?.host };
    });
  } else if (lead?.key === "facts" || (facts.length && !has(`✓ ${LOGGED.facts}`))) {
    streamHead = `${tr("streamFacts")} · ${facts.length}`;
    rows = facts
      .slice(-7)
      .reverse()
      .map((f) => ({
        k: `f${f.i}`,
        a: f.text,
        b: f.who ? base.names.get(f.who) : undefined,
      }));
  } else if (running.some((s) => s.key === "relations") || edgesIn.length) {
    if (edgesIn.length) {
      streamHead = `${tr("streamTies")} · ${edgesIn.length}`;
      rows = edgesIn
        .slice(-7)
        .reverse()
        .map((e) => ({
          k: `e${e.from}${e.to}`,
          a: e.label || tr("related"),
          b: `${base.names.get(e.from)} → ${base.names.get(e.to)}`,
        }));
    } else {
      streamHead = tr("streamWeighing");
      rows = tick(1.1, startOf(LOGGED.relations), 7).map((k) => {
        const p = cycle(base.pairs, 0, k * 1.1, 1.1);
        return { k: `p${k}`, a: p ? tr("pair", { a: p[0], b: p[1] }) : "" };
      });
    }
    const ps = base.personas.filter((p) => p.show <= t);
    if (ps.length && !edgesIn.length) {
      streamHead = `${tr("streamProfiles")} · ${ps.length}`;
      rows = ps
        .slice(-7)
        .reverse()
        .map((p) => ({
          k: p.id,
          a: p.identity,
          b: base.names.get(p.id),
          warm: true,
        }));
    }
  }
  if (allDone || (has(`✓ ${LOGGED.relations}`) && !running.length)) {
    streamHead = tr("streamWorld");
    // (the engine's summary lines, in Chinese: stages, completeness, key numbers, profiles, ties, the start, each
    // before a full-width colon)
    rows = [/^\u9636\u6bb5\u8282\u70b9\uff1a/, /^\u5b8c\u6574\u5ea6\uff1a/, /^\u5173\u952e\u6307\u6807\uff1a/, /^\u89d2\u8272\u4eba\u8bbe\uff1a/, /^\u5173\u7cfb\u7f51\uff1a/, /^\u5f00\u5c40\uff1a/]
      .map((re) => [...logs].reverse().find((l) => re.test(l.m))?.m)
      .filter(Boolean)
      .map((m) => ({ k: m!, a: m!.replace(/\uff1a/, " · ") }));
  }

  const roster = base.people.filter((p) => nodesIn.has(p.id)).slice(0, 16);
  const maxFacts = Math.max(1, ...roster.map((p) => perPerson.get(p.id) ?? 0));
  // (where the page is laid over a picture of its own, hideSky, the columns have nothing dark behind them)
  const fade = (side: "left" | "right") => (hideSky ? "none" : `linear-gradient(to ${side === "left" ? "right" : "left"}, rgb(${P.pageRgb} / 0.92) 60%, rgb(${P.pageRgb} / 0))`);
  const headCls = "mb-3 flex items-baseline gap-2 text-[11px] tracking-[0.14em]";
  const progress = stages.reduce((a, s) => a + s.part, 0) / stages.length;

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 overflow-hidden" style={{ background: P.page }}>
      <style>{WAIT_CSS + BITS_CSS}</style>
      <div ref={ref} className="absolute inset-0">
        {!hideSky && <Sky P={P} scene={scene} levels={levels} className="absolute inset-0 h-full w-full" />}
        {motion && (
          <BuildMotion
            P={P}
            t={t}
            w={w}
            h={h}
            placed={placed}
            bornAt={base.entAt}
            edges={base.edges}
            facts={base.factList}
            personas={base.personas}
            done={logs.filter((l) => l.m.startsWith("✓ ")).map((l) => ({ label: l.m.slice(2), at: T(l.at) }))}
            from={{ x: w - rw + 40, y: 170 }}
            center={c}
            style={motionStyle}
          />
        )}
        {overlay?.({ placed, w, h, c })}
      </div>

      {/* the people's names (the dozen that matter most, and whoever is looked into) */}
      {w > 0 &&
        !hideSky &&
        [...placed.values()].slice(0, 12).map((n) => {
          const hot = looking.includes(n.name);
          return (
            <span
              key={n.id}
              className="w-in pointer-events-none absolute -translate-x-1/2 text-[11.5px] whitespace-nowrap"
              style={{
                left: n.x,
                top: n.y + n.r + 9,
                color: hot ? P.warm : n.id === real.seatId ? P.ink : P.mute,
                transition: "left 1s, top 1s, color .6s",
              }}
            >
              {n.name === YOU ? tr("you") : n.id === real.seatId ? tr("youAs", { name: n.name }) : unbracket(n.name)}
            </span>
          );
        })}
      {w > 0 && world.scope && !hideSky && (
        <>
          <span
            className="w-in absolute -translate-x-full text-[10.5px]"
            style={{
              left: c.cx - 8,
              top: c.cy - c.ry - 26,
              fontFamily: MONO,
              color: P.mute,
            }}
          >
            {world.scope.timeStart}
          </span>
          <span
            className="w-in absolute text-[10.5px]"
            style={{
              left: c.cx + 8,
              top: c.cy - c.ry - 26,
              fontFamily: MONO,
              color: P.mute,
            }}
          >
            → {world.scope.timeEnd}
          </span>
        </>
      )}
      {/* the newest fact, beside the person it is about */}
      {beside &&
        !hideSky &&
        (() => {
          const n = placed.get(beside.who!)!;
          const right = n.x < c.cx + c.rx * 0.4;
          return (
            <div
              key={beside.i}
              className="w-in pointer-events-none absolute z-[2] max-w-[260px] text-[12px] leading-[1.5]"
              style={{
                top: n.y - 10,
                ...(right ? { left: n.x + n.r + 14 } : { right: w - n.x + n.r + 14, textAlign: "right" }),
                color: P.ink,
                textShadow: `0 0 10px ${P.page}, 0 0 4px ${P.page}`,
              }}
            >
              <div className="text-[10.5px]" style={{ fontFamily: MONO, color: P.warm }}>
                {tr("newFact", { name: unbracket(base.names.get(beside.who!) ?? "") })}
              </div>
              {beside.text}
            </div>
          );
        })()}

      {/* the top: the time taken, what is going on, and the counts */}
      <div className="pointer-events-none absolute top-[4%] flex flex-col items-center px-4 text-center" style={{ left: lw, right: rw }}>
        <div className="text-[12px] tracking-[0.2em]" style={{ fontFamily: MONO, color: P.mute }}>
          {tr("building", { time: dur(t, tt) })}
        </div>
        <div key={nowText} className="w-in mt-1.5 h-[20px] max-w-[640px] truncate text-[12.5px]" style={{ color: P.mute }}>
          {nowText}
          {others.length ? <span style={{ color: P.faint }}>{tr("alsoRunning", { names: others.join(tr("sep")) })}</span> : null}
        </div>
        <h1 className="mt-2 max-w-[640px] text-[22px] leading-[1.35] font-medium">{real.title}</h1>
        <div className="mt-3 text-[14px] leading-[1.7]" style={{ color: P.mute }}>
          {nodesIn.size ? (
            <>
              {rich(tr("countPeople", { count: nodesIn.size }), { n: (s) => <N P={P} v={s} /> })}
              {tr("countSep")}
              {rich(tr("countFacts", { count: facts.length }), { n: (s) => <N P={P} v={s} /> })}
              {tr("countSep")}
              {rich(tr("countTies", { count: edgesIn.length }), { n: (s) => <N P={P} v={s} /> })}
              {scheduled > 0 && (
                <>
                  {tr("countSep")}
                  {rich(tr("countScheduled", { count: scheduled }), { n: (s) => <N P={P} v={s} /> })}
                </>
              )}
            </>
          ) : (
            <>{tr("firstFrame")}</>
          )}
        </div>
      </div>

      {/* the left: everyone in the world, as large as how much is known about them */}
      <div className="pointer-events-none absolute top-[120px] bottom-[96px] left-0 overflow-hidden pr-16 pl-8" style={{ width: lw, display: lw ? undefined : "none", background: fade("left") }}>
        <Head P={P} text={tr("peopleHead")} n={nodesIn.size} />
        <Cloud
          P={P}
          items={roster.map((p) => {
            const n = perPerson.get(p.id) ?? 0;
            return { key: p.id, label: unbracket(p.name), weight: 1 + n, hot: looking.includes(p.name), note: n ? String(n) : undefined };
          })}
        />
        {looking.length > 0 && (
          <div className="w-in mt-5 text-[12px]" style={{ color: P.warm }}>
            {tr("lookingInto", { names: looking.map(unbracket).join(tr("sep")) })}
          </div>
        )}
      </div>

      {/* the right: what is coming in now */}
      <div className="pointer-events-none absolute top-[120px] right-0 bottom-[96px] overflow-hidden pr-8 pl-16" style={{ width: rw, display: rw ? undefined : "none", background: fade("right") }}>
        {streamHead && <Head P={P} text={streamHead.replace(/ · \d+$/, "")} n={streamHead.match(/ · (\d+)$/)?.[1]} />}
        <Stream P={P} items={rows.map((r) => ({ key: r.k, title: r.a, meta: r.b, warm: r.warm }))} />
      </div>

      {/* every stage along the foot, each by how far it has got */}
      <div className="absolute inset-x-0 bottom-0 px-6 pb-4">
        <div className="flex items-end gap-1.5">
          {stages.map((s) => (
            <div key={s.key} className="min-w-0 flex-1">
              <div className="mb-1.5 flex justify-between gap-1 truncate text-[11px]" style={{ color: s.running ? P.ink : s.done ? P.mute : P.faint }}>
                <span className="truncate">{tr(`short.${s.key}`)}</span>
                {s.running && <span style={{ fontFamily: MONO, color: P.mute }}>{durShort(s.el)}</span>}
              </div>
              <Ruler P={P} part={s.part} ticks={18} running={s.running} height={10} dim={!s.running} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[12px]" style={{ fontFamily: MONO, color: P.mute }}>
          <span>
            $
            {W.calls
              .filter((x) => T(x.e) <= t)
              .reduce((a, x) => a + x.usd, 0)
              .toFixed(2)}
          </span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
