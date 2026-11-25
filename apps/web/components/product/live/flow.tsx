"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ForecastView, WorldView } from "@kalchas/core";
import { api, useApp, useLive } from "@/components/product/shell";
import { useHomeData } from "@/components/product/start/shared";
import { clock, type Tape } from "@/components/product/wait/tape";
import { GRAINY } from "@/components/flow-lab/faces";
import { ResultCard, StopPage, type Result } from "@/components/product/replay/stage/turn";
import { NamesPlay } from "@/components/product/replay/stage/names";
import { COLS, MIDDLE_INSET } from "@/components/flow-lab/columns";
import { FlowV2, type LiveFlow as Run, type PlayRun, type Step } from "@/components/flow-lab/flow";
import type { SheetKey } from "@/components/flow-lab/sheets";
import type { Play, PlayProgress } from "@/components/product/replay/stage/data";
import type { Trace } from "@/components/product/replay/stage/trace";
import { TIERS, tierOf, type Tier } from "@/components/flow-lab/galaxy";
import { LAND } from "@/components/flow-lab/land";
import { Go, Kick, clampLines } from "@/components/flow-lab/rest";
import { NOTHING, UNFOUND, castOnly, compose } from "@/components/flow-lab/score";
import type { Stream } from "@/lib/stream";
import { Stages, type StageKey } from "@/components/product/live/stages";
import { PaceSourceContext, type PaceAsk, type PaceSource } from "@/components/flow-lab/pace";
import { useT } from "@/lib/i18n/client";

/**
 * The product as it really runs, from the first word to the opening of a world, on the one page that was settled
 * (flow-lab): this says where things have really got to, and hands what is done on the page to the engine.
 *
 * One thing is mounted from the home page to the world, whatever the address says, so that the picture is never
 * cut: something written starts a project; its words are understood; what must be known is asked, and the answers
 * given; its world (the project's own, of the same id) is made, looking up what it needs as it goes; its opening is
 * written; and it is played: what you do is handed to the engine, the step is told as it is really worked out, and
 * everything that can be opened in a play does what it says.
 *
 * Nothing is drawn that has not really happened. The picture cannot be laid out before it is known who is in the
 * world and how much there is, so it is half a beat behind: each stretch of the making (who is in it; the facts;
 * ties and personas; crowds and risks; the main line) is shown once it has really been done, and between them the
 * picture stays where it is, alive. How much longer anything will take is not known and not drawn.
 *
 * A project is one world: the address names the project, and it is asked, built or played as it stands.
 */

type Live = ForecastView & { progress: { running: boolean; messages: string[]; error: string | null } | null };
type Progress = PlayProgress;
type PlayLive = Play & { progress: Progress | null };
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));
const STOPPED = new Set(["failed", "paused", "stalled"]);
const every = (ms: number) => ms;

/**
 * The stretches of the making as the picture shows them, each done once the engine says these of its own are (the
 * build's stages as its log names them, in Chinese: "list the people in the world"; "verify online" and "write the
 * profiles"; "set the start").
 */
const STRETCHES: [string[], RegExp[]][] = [
  [["who"], [/\u5217\u51fa\u4e16\u754c\u91cc\u7684\u4eba/]],
  [["fact", "persona", "tie"], [/\u8054\u7f51\u67e5\u8bc1/, /\u5199\u4eba\u8bbe/]],
  [["crowd", "risk", "mile"], [/\u8bbe\u5b9a\u5f00\u5c40/]],
];
/** The head of the stream's event for a stage of the build done ("stage done" in Chinese, as lib/stream.ts writes it). */
const STAGE_DONE = "\u9636\u6bb5\u5b8c\u6210";

/**
 * Everyone the world holds is in the picture, those the protagonist has not dealt with yet too: a world of twenty
 * drawn as two looked like a world of two, and its making showed almost nothing being made.
 */
const everyone = (s: Stream) => new Set(s.nodes.map((n) => n.id));

/** A world that is not made yet, for a page that is laid out round one. */
function unmade(fc: ForecastView | null): WorldView {
  return { id: "", prompt: fc?.question ?? "", title: fc?.title || fc?.question || "", forward: !fc?.moment.past, status: "building", error: null, createdAt: fc?.createdAt ?? "", scope: null, metrics: [], completeness: null, counts: { entities: 0, people: 0, facts: 0, insider: 0, sources: 0, edges: 0, events: 0 }, spentUsd: fc?.spentUsd ?? 0, build: null, seatId: null, startPoints: [], graph: { nodes: [], edges: [] }, sessions: [] } as unknown as WorldView;
}

/** How far down the window the page begins (the product's own bar is above it). */
const PAGE_TOP = 48;

/**
 * What is laid over the play (the stop as it is read), in the middle column of the page, so that the parties and what
 * happened stay in sight beside it. It comes and goes by fading: when it is let go it is kept as it last was for as
 * long as the fade takes, and nothing on it can be pressed meanwhile. Going is quicker than coming, as it is what a
 * press does.
 */
function Fading({ on, children }: { on: boolean; children: React.ReactNode }) {
  const last = useRef<React.ReactNode>(null);
  const [here, setHere] = useState(on);
  const [seen, setSeen] = useState(false);
  if (on) last.current = children;
  useEffect(() => {
    if (on) {
      setHere(true);
      const id = window.setTimeout(() => setSeen(true), 30);
      return () => window.clearTimeout(id);
    }
    setSeen(false);
    const id = window.setTimeout(() => setHere(false), 320);
    return () => window.clearTimeout(id);
  }, [on]);
  if (!on && !here) return null;
  const shown = on && seen;
  return (
    <div className="fixed z-[5]" style={{ left: MIDDLE_INSET, right: MIDDLE_INSET, top: PAGE_TOP + COLS.top, bottom: COLS.bar + 20, opacity: shown ? 1 : 0, transition: `opacity ${on ? ".5s" : ".3s"} ease`, pointerEvents: shown ? "auto" : "none" }}>
      {on ? children : last.current}
    </div>
  );
}

/** The stops gone on from, by line and by when their step began (the opening's, by line): each is read once. */
const READ = new Set<string>();

/**
 * The stop as it is read: as it is written, once it is, and the opening once, before the first decision. Going on
 * from it draws only this, and so answers at once: the page under it, the world and everything on it, does not depend
 * on whether it has been read and is not drawn again for it.
 */
function StopLayer({ w, p, running, result, outcome }: { w: WorldView | null; p: PlayLive | null; running: boolean; result: Progress | null; /** What was done was not a step after all (a question, something to say plainly, something gone wrong). */ outcome: boolean }) {
  const { P } = useApp();
  const [, drawn] = useState(0);
  const read = (key: string) => (READ.add(key), drawn((n) => n + 1));
  // the stop is read as it is written: once its scene has begun to come, it is shown as it comes, and when the step is
  // done the same page has the rest of it, until it is gone on from
  const writing = running && !!p?.progress?.scene;
  const stopKey = p && result ? `${p.branch.id}:${result.startedAt}` : "";
  const written = !!p && !running && !!result?.result && "done" in result.result && !READ.has(stopKey) && !!p.lastStep?.settlement && !p.branch.ended;
  // the opening is read the same way, once, before the first decision: a play of its own at its first stop, with
  // nothing yet done or asked at it (the opening is written before the play is there to watch, so it is not shown as
  // it comes)
  const openKey = p ? `${p.branch.id}:opening` : "";
  const firstStop = !!p && !running && !outcome && !result?.result && !result?.error && !!p.situation && !p.lastStep && p.decisions.length === 1 && !p.branch.ended && !p.branch.parentBranchId && !READ.has(openKey);
  const d = p && w ? { world: w, play: p } : null;
  // the main questions the stop settled: each its own result, once the stop is gone on from, one after another
  const after = !!p && !running && !!result?.result && "done" in result.result && READ.has(stopKey) && !!p.lastStep?.settlement && !p.branch.ended;
  const results = after ? (p.situation?.milestones ?? []).map((m, i) => ({ key: `${stopKey}:result:${i}`, m })).filter((x) => !READ.has(x.key)) : [];
  return (
    <>
      <Fading on={(writing || written || firstStop) && !!d}>
        {d && p ? (
          writing ? (
            <StopPage P={P} d={d} settlement={null} scene={p.progress!.scene} note={p.progress!.messages.at(-1)} />
          ) : written ? (
            <StopPage P={P} d={d} settlement={p.lastStep!.settlement} onNext={() => read(stopKey)} />
          ) : (
            <StopPage P={P} d={d} settlement={null} onNext={() => read(openKey)} />
          )
        ) : null}
      </Fading>
      {p && <Results play={p} items={results} read={read} />}
    </>
  );
}

/**
 * The results of the stop just read, each on its own over the whole page, one after another. Each comes and goes by
 * fading, the next only once the one before has gone, so that nothing is swapped in place; the page stays dimmed
 * between two of them.
 */
function Results({ play, items, read }: { play: PlayLive; items: { key: string; m: Result }[]; read: (key: string) => void }) {
  const { P } = useApp();
  const [lit, setLit] = useState(false);
  const [going, setGoing] = useState(false);
  const held = useRef<{ key: string; m: Result } | null>(null);
  const timer = useRef(0);
  const now = going ? held.current : (items[0] ?? null);
  if (now) held.current = now;
  useEffect(() => {
    if (!now || going) return;
    const id = window.setTimeout(() => setLit(true), 30);
    return () => window.clearTimeout(id);
  }, [now?.key, going]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!now) return null;
  const go = () => {
    if (going) return;
    setGoing(true);
    setLit(false);
    timer.current = window.setTimeout(() => {
      read(now.key);
      setGoing(false);
    }, 520);
  };
  const dim = lit || (going && items.length > 1);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10">
      <div className="pointer-events-none absolute inset-0" style={{ background: `rgb(${P.pageRgb} / 0.62)`, backdropFilter: "blur(5px)", opacity: dim ? 1 : 0, transition: "opacity .5s ease" }} />
      <div className="relative flex max-h-full w-full justify-center" style={{ opacity: lit ? 1 : 0, transform: lit ? "none" : "translateY(10px)", transition: "opacity .5s ease, transform .55s cubic-bezier(.2,.7,.2,1)" }}>
        <ResultCard P={P} play={play} result={now.m} onNext={go} />
      </div>
    </div>
  );
}

export default function LiveFlow({ forecastId, worldId, branchId }: { forecastId?: string; worldId?: string; branchId?: string }) {
  const { P } = useApp();
  const t = useT("product.live.flow");
  const trScore = useT("flow-lab.score");
  const home = useHomeData();
  // (a project and its world are one id: the world is there to be shown once its build has begun)
  const [fid, setFid] = useState<string | null>(forecastId ?? worldId ?? null);
  const [tier, setTier] = useState<Tier | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [bid, setBid] = useState<string | null>(branchId ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("tier");
    setTier(forced === "none" ? null : forced != null && TIERS[Number(forced)] ? TIERS[Number(forced)]! : tierOf());
  }, []);

  // ---------------------------------------------------------------- what there really is so far

  const fc = useLive<Live>(fid ? `/forecasts/${fid}` : null, (d) => d.status === "building" || !!d.progress?.running || (d.status === "clarifying" && !d.insight && !d.clarify.length && !d.error), every(2000));
  const f = fc.data;
  // (the answers have been given, but the pace is still being asked: the page stays on the questions, and the world
  // already being made is not yet shown, until the asking is over and what was answered has gone into the picture)
  const [holdAsk, setHoldAsk] = useState(false);
  const wid = f && f.status !== "clarifying" && !holdAsk ? f.id : null;
  const world = useLive<WorldView>(wid ? `/worlds/${wid}` : null, (d) => d.status === "building", every(3000));
  const w = world.data;
  const making = (!!f && (f.status === "building" || (f.status === "clarifying" && !f.clarify.length))) || (!!w && w.status === "building");
  const [tape, setTape] = useState<Tape | null>(null);
  useEffect(() => {
    if (!fid) return setTape(null);
    let live = true;
    let id = 0;
    const load = () =>
      api<Tape>(`/forecasts/${fid}/tape`)
        .then((t) => live && setTape(t))
        .catch(() => {})
        .finally(() => {
          if (live && making) id = window.setTimeout(load, 2500);
        });
    load();
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [fid, making]);
  const building = !!w && w.status === "building";
  // ---------------------------------------------------------------- the play
  const branch = bid ?? w?.sessions.flatMap((x) => x.branches).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? null;
  const pl = useLive<PlayLive>(branch && w?.status === "ready" ? `/branches/${branch}` : null, (d) => !!d.progress?.running || d.branch.status === "running", every(1500));
  const p = pl.data;
  const running = !!p && (!!p.progress?.running || p.branch.status === "running");
  const stepping = useRef(false);
  stepping.current = running;
  // (how many times a step has begun or ended: what happened in it is read again each time)
  const [runs, setRuns] = useState(0);
  useEffect(() => setRuns((x) => x + 1), [running]);
  const [stream, setStream] = useState<Stream | null>(null);
  useEffect(() => {
    if (!wid) return setStream(null);
    let live = true;
    let id = 0;
    const load = () =>
      api<Stream>(`/worlds/${wid}/stream`)
        .then((s) => live && setStream(s))
        .catch(() => {})
        .finally(() => {
          if (live && (building || stepping.current)) id = window.setTimeout(load, building ? 4000 : 5000);
        });
    load();
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [wid, building, w?.status, runs]);

  // ---------------------------------------------------------------- the record as the picture is laid out from it

  // how many stretches of the making are really done (each is shown only once it is)
  const stretches = useMemo(() => {
    if (!stream) return 0;
    const done = stream.events.filter((e) => e.phase === "build" && e.act === "advance" && e.head === STAGE_DONE).map((e) => e.text);
    let n = 0;
    for (const [, marks] of STRETCHES) {
      if (!marks.every((re) => done.some((x) => re.test(x)))) break;
      n++;
    }
    return n;
  }, [stream]);
  const ready = !!w && w.status === "ready";
  const R = tape?.research ?? null;
  // (what the things looked up have found so far, and where it came from)
  const found = useMemo(() => (f?.lookups ?? []).flatMap((x) => x.facts), [f?.lookups]);
  const hosts = new Set(found.flatMap((x) => (x.source?.host ? [x.source.host] : []))).size;
  // (whoever has come out of the background on this line of time is in the picture from then on)
  const joined = useMemo(() => new Set(p?.graph.nodes.map((n) => n.id) ?? []), [p?.graph.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef<{ stream: Stream | null; joined: Set<string> }>({ stream, joined });
  latest.current = { stream, joined };
  const score = useMemo(() => {
    if (tier === undefined) return null;
    const size = tier?.size ?? 256;
    const L = latest.current;
    if (wid && L.stream) return compose(castOnly(L.stream, everyone(L.stream)), size, trScore);
    return compose(UNFOUND, size, trScore);
    // (laid out again only when a stretch has been done, never for every line that comes, and in a new language)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, wid, !!stream, stretches, ready, joined.size, trScore]);
  const cast = useMemo(() => (stream ? castOnly(stream, everyone(stream)) : NOTHING), [stream]);

  // ---------------------------------------------------------------- where the product is

  const [built, setBuilt] = useState(false);
  // (a world come to already made is not shown being made again)
  const sawMaking = useRef(false);
  if (building) sawMaking.current = true;
  useEffect(() => {
    if (ready && !sawMaking.current) setBuilt(true);
  }, [ready]);
  // the questions could not be written (it failed, or whatever was writing them is gone): they can be asked for again
  const stuck = !!f && f.status === "clarifying" && !f.insight && !f.clarify.length && (!!f.error || now - Date.parse(f.createdAt) > 6 * 60000);
  const rewrite = () => f && void api(`/forecasts/${f.id}/clarify`, {}).then(() => fc.reload()).catch((e) => setErr(said(e)));
  // where a play stands when it is come to: being worked out, or to be decided (after that the page moves itself)
  const playAt = useRef<Step | null>(null);
  if (p && !playAt.current) playAt.current = running ? "run" : "decide";
  const step: Step = holdAsk && f ? "ask" : !fid && !wid ? "home" : wid ? (ready && p ? playAt.current! : ready && (built || !!branch) ? "start" : "build") : !f ? "home" : f.status === "clarifying" ? (!f.insight && !f.clarify.length ? "know" : "ask") : "build";
  // (the clock is read only while the world is made, for how long it has taken, and while its questions are awaited,
  // for whether they have stopped coming: in a play nothing runs by it, and the whole page, the world and all, was
  // drawn again every second for nothing)
  const ticking = step === "build" || step === "know";
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  const LEAD = score?.build.lead ?? 13;
  // where the building has really got to, on the picture's own clock
  let T: number | null = null;
  if (step === "build" && score) {
    if (ready) T = score.build.end + 3;
    else {
      const keys = STRETCHES.slice(0, stretches).flatMap(([k]) => k);
      const ends = score.build.stages.filter((s) => keys.includes(s.key)).map((s) => s.e);
      T = ends.length ? Math.max(...ends) : -0.55;
    }
  }

  // ---------------------------------------------------------------- what is done on the page

  const go = (path: string) => window.history.replaceState(null, "", path);
  const start = (text: string) => {
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    api<{ id: string }>("/projects", { text })
      .then((r) => {
        setFid(r.id);
        go(`/app/forecast/${r.id}`);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  /** The start of the build, once the answers have been sent: the question about pace is asked for only after it. */
  const started = useRef<Promise<unknown> | null>(null);
  const answer = (answers: { q: string; answer: string | null }[]) => {
    if (!f) return;
    // (the page is held on the questions until the pace has been asked: see pacing below)
    setHoldAsk(true);
    const s = api(`/forecasts/${f.id}/start`, { answers });
    started.current = s;
    s.then(() => fc.reload()).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  // the question about pace is written for the world once the answers are in (while the world is being made): it is
  // asked for after the start has gone, what is chosen is kept, and when the asking is over the page is let go
  const pid = f?.id ?? null;
  const pacing = useMemo<PaceSource | null>(
    () =>
      pid
        ? {
            ask: () =>
              (started.current ?? Promise.resolve())
                .then(() => api<{ ask: PaceAsk | null }>(`/forecasts/${pid}/pace`))
                .then((r) => (r.ask && r.ask.options.length ? r.ask : null))
                .catch(() => null),
            choose: (answer) => void api(`/forecasts/${pid}/pace`, { answer }).catch(() => {}),
            done: () => setHoldAsk(false),
          }
        : null,
    [pid],
  );
  // the world is made and has been seen made: where you stand in it is written, and then it is played
  const opening = useRef(false);
  useEffect(() => {
    if (step !== "start" || !w || branch || opening.current) return;
    const first = w.startPoints[0]?.ordinal;
    if (first == null) return;
    opening.current = true;
    api<{ branchId: string }>("/sessions", { worldId: w.id, start: first })
      .then((r) => (setBid(r.branchId), go(`/app/forecast/${w.id}?b=${r.branchId}`)))
      .catch((e) => {
        opening.current = false;
        setErr(e instanceof Error ? e.message : String(e));
      });
  }, [step, w, branch]);

  // ---------------------------------------------------------------- a step, as it is really worked out

  const [trace, setTrace] = useState<Trace | null>(null);
  const [mine, setMine] = useState("");
  const [acting, setActing] = useState(false);
  const [seen, setSeen] = useState(0);
  const [fault, setFault] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ q: string; text: string; doing: string } | null>(null);
  const began = p?.progress?.startedAt ?? 0;
  const stepNo = p?.branch.step ?? 0;
  const at = useRef({ since: 0, step: 0 });
  if (running && began && at.current.since !== began) at.current = { since: began, step: stepNo };
  useEffect(() => {
    if (!branch || !running || !began) return;
    let live = true;
    let id = 0;
    const { since, step: n } = at.current;
    setTrace((t) => (t && t.start === since ? t : { step: n, start: since, ms: 1, complete: false, calls: [], events: [], totals: { calls: 0, inTok: 0, outTok: 0, cost: 0, actors: 0 } }));
    const load = () =>
      api<Trace>(`/branches/${branch}/trace?since=${since}&step=${n}`)
        .then((t) => live && setTrace({ ...t, start: t.start ?? since }))
        .catch(() => {})
        .finally(() => {
          if (live) id = window.setTimeout(load, 1800);
        });
    load();
    return () => {
      live = false;
      window.clearTimeout(id);
      // (once more when it is over: the whole of it)
      api<Trace>(`/branches/${branch}/trace?since=${since}&step=${n}`).then((t) => setTrace((was) => (was && was.start === since ? { ...t, start: t.start ?? since } : was))).catch(() => {});
    };
  }, [branch, running, began]);
  const call = (path: string, body: unknown, after?: (r: unknown) => void) => {
    setActing(true);
    setFault(null);
    return api<unknown>(path, body)
      .then((r) => (after?.(r), pl.reload()))
      .catch((e) => setFault(said(e)))
      .finally(() => setActing(false));
  };
  const result = p?.progress && !running ? p.progress : null;
  const outcome: { sheet: SheetKey; note: string } | null = fault
    ? { sheet: "error", note: fault }
    : result && seen !== result.startedAt
      ? result.error
        ? { sheet: "error", note: result.error }
        : result.result && "clarification" in result.result
          ? { sheet: "clarify", note: result.result.clarification }
          : result.result && "asked" in result.result
            ? { sheet: "ask", note: "" }
            : null
      : null;
  const sheet: SheetKey | null = !p ? null : outcome ? outcome.sheet : p.branch.ended ? "ended" : !p.situation && !running ? "reading" : null;
  const playRun: PlayRun | null = !p || !w
    ? null
    : {
        trace,
        running,
        back: !!outcome,
        working: p.progress?.messages[p.progress.messages.length - 1] ?? "",
        said: mine,
        sheet,
        note: outcome?.note ?? "",
        // (a talk is a step like any other: what you type is what you say)
        meeting: null,
        busy: acting,
        asking,
        onAct: (picks, text) => {
          const titles = (p.situation?.recommendations ?? []).filter((o) => picks.includes(o.id)).map((o) => o.title);
          setMine([...titles, text].filter(Boolean).join(t("sep")));
          setSeen(result?.startedAt ?? seen);
          setFault(null);
          setTrace(null);
          // (nothing picked and nothing written: the world carries on as things are)
          void call(`/branches/${p.branch.id}/act`, { input: picks.length || text ? { kind: "plan", picks, text: text || undefined } : { kind: "carry_on" } });
        },
        onAsk: (text) => {
          setActing(true);
          setAsking({ q: text, text: "", doing: "" });
          // (the answer is shown as it is written: what is being looked up, a line; then the words as they come)
          void (async () => {
            try {
              const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "play", id: p.branch.id, text }) });
              if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
              const reader = res.body.getReader();
              const dec = new TextDecoder();
              let buf = "";
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.trim()) continue;
                  const ev = JSON.parse(line) as { type: string; delta?: string; label?: string; state?: string; message?: string };
                  if (ev.type === "text") setAsking((a) => (a ? { ...a, text: a.text + (ev.delta ?? ""), doing: "" } : a));
                  else if (ev.type === "reset") setAsking((a) => (a ? { ...a, text: "" } : a));
                  else if (ev.type === "step" && ev.state === "run") setAsking((a) => (a ? { ...a, doing: ev.label ?? "" } : a));
                  else if (ev.type === "error") throw new Error(ev.message ?? t("askFailed"));
                }
              }
              await pl.reload();
            } catch (e) {
              setFault(said(e));
            } finally {
              setAsking(null);
              setActing(false);
            }
          })();
        },
        // (there are no talks of their own any more, nor a goal reached to go on from: flow.tsx still asks for these)
        onSay: () => {},
        onLeave: () => {},
        onBranch: (id) => (setBid(id), setTrace(null), (playAt.current = "decide"), go(`/app/forecast/${w.id}?b=${id}`)),
        onFork: (n, mode) => void call(`/branches/${p.branch.id}/fork`, { step: n, mode }, (r) => (world.reload(), setBid((r as { branchId: string }).branchId), setTrace(null), go(`/app/forecast/${w.id}?b=${(r as { branchId: string }).branchId}`))),
        onEnd: () => void call(`/branches/${p.branch.id}/end`, {}, () => world.reload()),
        onContinue: () => {},
        onDismiss: () => (setFault(null), setSeen(result?.startedAt ?? seen)),
      };

  const halted = step === "build" && !!w && (STOPPED.has(w.status) || STOPPED.has(w.build?.status ?? ""));
  const stopped: Run["stopped"] = !halted
    ? null
    : w
        ? {
            what: "build",
            status: (STOPPED.has(w.status) ? w.status : (w.build?.status ?? "failed")) as "paused",
            error: w.build?.error ?? w.error,
            onResume: () =>
              void api(`/worlds/${w.id}/resume`, {})
                .then(() => world.reload())
                .catch((e) => setErr(String(e instanceof Error ? e.message : e))),
          }
        : null;

  const since = wid ? (tape?.world?.t0 ?? R?.t0 ?? (w ? Date.parse(w.createdAt) : null)) : null;
  const counts: [number, string][] | undefined =
    step !== "build"
      ? undefined
      : wid && w && (w.graph.nodes.length || stretches > 0)
        ? [
            [w.graph.nodes.length, t("people", { count: w.graph.nodes.length })],
            [w.counts.facts, t("facts", { count: w.counts.facts })],
            [w.counts.edges, t("ties", { count: w.counts.edges })],
          ]
        : [
            [hosts, t("sources", { count: hosts })],
            [found.length, t("facts", { count: found.length })],
          ];
  const run: Run = { step, T, counts, elapsed: since && !halted ? clock((now - since) / 1000) : "", onStart: start, onAnswers: answer, busy, err: step === "home" ? err : null, tape, fc: f, onBuilt: () => setBuilt(true), stopped, play: playRun };

  if (tier === undefined || !score || (fid && !f && !fc.error) || (wid && !w && !world.error && f?.status !== "building") || (ready && branch && !p && !pl.error))
    return (
      <div className="fixed inset-x-0 top-12 bottom-0 flex items-center justify-center text-[13px]" style={{ color: P.mute, background: P.page }}>
        {fc.error ?? world.error ?? ""}
      </div>
    );
  const shown = w ?? unmade(f);
  // which stage of the making this is, for the points at the top right (none once a world is being played)
  const stage: StageKey | null = step === "know" ? "know" : step === "ask" ? "ask" : step === "start" ? "start" : step !== "build" || halted || ready ? null : "world";
  return (
    <>
      <Stages at={stage} detail={stage === "world" ? (w?.build?.stage ?? null) : null} upTo="start" />
      <PaceSourceContext.Provider value={pacing}>
        {/* (the names in the ways open are marked as on the stop: the page under it is not handed the play for that) */}
        <NamesPlay.Provider value={p ?? null}>
          <FlowV2 world={shown} play={p ?? null} stream={cast} score={score} home={home} only={null} stepN={null} tier={tier ?? null} onSlow={() => setTier((t) => (t && t.size > 256 ? { size: t.size > 384 ? 384 : 256, quality: 0 } : t))} open={2} trans={1} net={LAND} face={GRAINY} fine lay={1} scene={4} head={1} more live={run} ask={1} />
        </NamesPlay.Provider>
      </PaceSourceContext.Provider>
      <StopLayer w={w} p={p} running={running} result={result} outcome={!!outcome} />
      {stuck && f && (
        <div className="fixed inset-x-0 bottom-[92px] z-[5] flex flex-col items-center px-6 text-center">
          <Kick warm>{t("questionsFailed")}</Kick>
          <p className="mt-3 max-w-[560px] text-[13.5px] leading-[1.7]" style={{ color: P.mute, ...clampLines(3) }}>
            {f.error ?? t("stalled")}
          </p>
          <div className="mt-5">
            <Go onClick={rewrite}>{t("rewrite")}</Go>
          </div>
        </div>
      )}
      {err && step !== "home" && (
        <div className="fixed inset-x-0 bottom-9 z-[6] text-center text-[13px]" style={{ color: P.warm }}>
          {err}
        </div>
      )}
    </>
  );
}
