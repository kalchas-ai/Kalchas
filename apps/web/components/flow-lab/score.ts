import { translator, type T } from "@/lib/i18n/locales";
import type { Ev, Stream } from "@/lib/stream";
import { en } from "@/messages";
import { entOf } from "./faces";

/**
 * A world's real record laid out as a score: where everything stands, which grains belong to what, and when each
 * thing the engine did is shown. Nothing here is particular to one world; it only reads what every world has
 * (people and organisations, facts and where they came from, draws, personas, ties, crowds, risks, milestones; and
 * for each step of a play: what you did, who it reached, who thought and acted, what was left to odds, what came of
 * it, time moving on).
 *
 * The record saves things in bursts (hundreds of facts in one second); here they are let out evenly, the heavy ones
 * (a persona, a draw worth reading, an action) given time to be read and the light ones streaming past.
 */

/**
 * The heads of the acts read here, as lib/stream.ts writes them (see HEAD there; a milestone and the main line are
 * only read, from records written before): identifiers, not words shown, kept in the Chinese they were first written
 * as, as escapes. HAPPENED is the engine's own: what is chosen when the unexpected comes about.
 */
const HEAD = {
  person: "\u4eba\u7269", // a person comes in
  fact: "\u4e8b\u5b9e", // a fact
  persona: "\u4eba\u8bbe", // a persona (profile), or a variable drawn for one
  trait: "\u6027\u683c", // a trait drawn by the population norm
  risk: "\u5fc5\u63b7\u98ce\u9669", // a risk that must be rolled
  look: "\u67e5", // looked up (the start of each look-up's head)
  milestone: "\u91cc\u7a0b\u7891", // a milestone
  mainLine: "\u4e3b\u7ebf", // the main line
  open: "\u5f00\u5c40", // the start
  time: "\u65f6\u95f4", // time moves on
  yourMove: "\u4f60\u7684\u884c\u52a8", // your move
  move: "\u884c\u52a8", // someone else's move
  reach: "\u6ce2\u53ca", // a move reaching someone (knock-on effects)
  thinking: "\u5728\u60f3", // someone thinking
  odds: "\u6309\u6982\u7387\u5b9a", // settled by the odds
  chance: "\u610f\u5916", // the unexpected
  result: "\u7ed3\u679c", // what came of something
  memory: "\u8bb0\u4f4f", // what someone took away
} as const;
const HAPPENED = "\u53d1\u751f"; // "happened"
const ENGLISH = translator("en", en, "flow-lab.score", en);

export const NODE = 0;
export const TIE = 1;
export const CROWD = 2;
export const DISC = 3;
export const RING = 4;
export const DUST = 5;

export const LANES = [2.9, 4.7, 6.5] as const;
export const BELT = 8.9;
export const RING_R = 10.5;

export type Body = {
  i: number;
  kind: number;
  id: string;
  name: string;
  grains: number;
  // someone
  org?: boolean;
  /** What kind of thing they are, as the world has it (person, organization, institution, group, other). */
  ent?: string;
  seat?: boolean;
  risk?: boolean;
  late?: boolean;
  /** A world not yet made: matter gathers here as something is written on the home page. */
  seed?: boolean;
  orbit?: number;
  ang?: number;
  y?: number;
  R?: number;
  tilt?: [number, number, number];
  spin?: number;
  facts?: number;
  draws?: number;
  /** No longer known (flow.tsx, which may not be edited here, still reads it): only the risk and seed bodies set it. */
  importance?: number;
  /** The colour of where most of what is known of them came from (1 amber, 2 teal, 3 violet; 0: none). */
  hue?: number;
  // a tie
  a?: number;
  b?: number;
  thin?: boolean;
  text?: string;
  // a crowd
  a0?: number;
  a1?: number;
  size?: number;
  cares?: string;
  /** A force in motion round the world, not a crowd of people: it has no number of people. */
  force?: boolean;
};

export type BeatKind =
  | "appear" | "fact" | "draw" | "persona" | "tie" | "crowd" | "risk" | "lookup" | "mile" | "open"
  | "act" | "reach" | "think" | "move" | "odds" | "chance" | "result" | "world" | "hit" | "delta" | "memo" | "time";

/** Someone the building stays with to be read: what is known of them comes in, each trait is drawn, they are written, their ties go out. */
export type Hold = { s: number; e: number; body: number; facts: number; srcs: number; inS: number; inE: number; traits: { s: number; label: string; value: string }[]; /** Who they are, in a line, and when it is written. */ said: string; saidS: number };

export type Beat = {
  s: number;
  /** How long it is shown. */
  d: number;
  k: BeatKind;
  ev: Ev;
  /** The body it happens at (-1: the world itself) and the one it goes to. */
  body: number;
  to: number;
  /** The tie it runs along, and which way. */
  tie: number;
  dir: number;
  /** Held in the middle to be read (the camera goes there). */
  feat: boolean;
  /** Its place among its kind (the nth fact of its body, the nth draw of its person …). */
  n: number;
  src: number;
};

export type StageRow = { key: string; name: string; s: number; e: number; total: number };
export type Act = { beats: Beat[]; end: number; stages: StageRow[]; date: string; title: string; holds: Hold[]; /** How long the opening is, before anything is built: the sources found and read (it runs before 0). */ lead: number };
export type Score = {
  title: string;
  start: string | null;
  bodies: Body[];
  seat: number;
  disc: number;
  ring: number;
  seats: Float32Array;
  sources: { host: string; n: number; pos: [number, number, number] }[];
  build: Act;
  miles: { text: string; at: number }[];
  /** Who is which body, which tie joins which two, and how many times the clock moves in the whole play. */
  index: Map<string, number>;
  tieOf: Map<string, number>;
  timeBeats: number;
  seedBody: number;
};

const rnd = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// (a note in brackets, full-width or not, is left out of a name)
const short = (s: string) => s.replace(/\uff08.*?\uff09/g, "").replace(/\(.*?\)/g, "").trim();
const bareHost = (h: string) => {
  const p = h.split(".");
  const tail = p.slice(-2).join(".");
  const two = /^(com|gov|org|net|edu)\.[a-z]{2}$/.test(tail) ? p.slice(-3).join(".") : p.length > 3 ? p.slice(-3).join(".") : h;
  return two.length > 26 ? `${two.slice(0, 25)}…` : two;
};

/**
 * A world's record with only those who are played in it: whoever is in the background (a line in the roster, played
 * by no one) is not drawn, and what is known of them lies on the ground of the world. `joined`: those who came out
 * of the background on a line of time. Each is said to be a person or a body where the world does not say.
 */
export function castOnly(S: Stream, joined?: Set<string>): Stream {
  const out = new Set(S.nodes.filter((n) => n.tier === "background" && !n.crowd && !joined?.has(n.id)).map((n) => n.id));
  const nodes = S.nodes.filter((n) => !out.has(n.id)).map((n) => (n.crowd ? n : { ...n, kind: n.id === S.seat ? "person" : entOf(n.kind, n.name) }));
  if (!out.size) return { ...S, nodes };
  const events = S.events
    .filter((e) => !(e.who && out.has(e.who) && (e.act === "appear" || e.act === "link" || e.act === "draw" || e.head.startsWith(HEAD.persona))) && !(e.to && out.has(e.to) && e.act === "link"))
    .map((e) => (e.who && out.has(e.who) ? { ...e, who: null } : e.to && out.has(e.to) ? { ...e, to: null } : e));
  return { ...S, nodes, events };
}

/** A record with nothing in it yet: the page before any world, which still has its sky. */
export const NOTHING: Stream = { id: "", segments: [], crowdSteps: [], title: "", seat: null, start: null, nodes: [], metrics: [], events: [] };

/**
 * Before anything has been found: the same sky, with some of what lies scattered in it already able to be drawn
 * together (as it is when something is written, and when what is asked is answered), though none of it is yet from
 * anywhere that has a name (twelve places along the galaxy, each a name of nothing but spaces, so that it does not
 * all lie in one knot).
 */
export const UNFOUND: Stream = { ...NOTHING, events: Array.from({ length: 36 }, (_, i) => ({ t: 0, act: "write" as const, who: null, head: HEAD.fact, text: "", w: 0.15, source: " ".repeat(1 + (i % 12)), phase: "build" as const })) };

/** `tr`: the words of the interface it writes (the names of the stages, "you"), English where none is given. */
export function compose(S: Stream, size = 512, tr: T = ENGLISH): Score {
  const N = size * size;
  const R = rnd(7);
  const bodies: Body[] = [];
  const add = (b: Omit<Body, "i">) => {
    const x = { ...b, i: bodies.length } as Body;
    bodies.push(x);
    return x;
  };
  const disc = add({ kind: DISC, id: "disc", name: tr("world"), grains: 0 });
  const dust = add({ kind: DUST, id: "dust", name: "", grains: 0 });
  const ring = add({ kind: RING, id: "ring", name: tr("time"), grains: 0 });

  // ---------------------------------------------------------------- who is in the world, and where they stand

  const build = S.events.filter((e) => e.phase === "build");
  const play = S.events.filter((e) => e.phase === "play");
  const firstAct = play.findIndex((e) => e.head === HEAD.yourMove);
  const before = firstAct < 0 ? play : play.slice(0, firstAct);
  const bornInBuild = new Set(build.filter((e) => e.act === "appear" && e.who && !e.who.startsWith("crowd:")).map((e) => e.who!));
  const used = new Set<string>();
  for (const e of S.events) {
    if (e.who) used.add(e.who);
    if (e.to) used.add(e.to);
  }
  const people = S.nodes.filter((n) => !n.crowd);
  const seatNode = people.find((p) => p.id === S.seat) ?? people[0];
  const early = people.filter((p) => p !== seatNode && bornInBuild.has(p.id)).slice(0, 30);
  const late = people.filter((p) => p !== seatNode && !bornInBuild.has(p.id) && used.has(p.id)).slice(0, 14);
  const factsOf = new Map<string, number>();
  for (const e of build) if (e.head === HEAD.fact && e.who) factsOf.set(e.who, (factsOf.get(e.who) ?? 0) + 1);
  const drawsOf = new Map<string, number>();
  for (const e of S.events) if (e.act === "draw" && e.who && (e.head.startsWith(HEAD.persona) || e.head.startsWith(HEAD.trait))) drawsOf.set(e.who, (drawsOf.get(e.who) ?? 0) + 1);
  // an organisation's bands lie nearly flat; a person's rings are tipped, each their own way
  const tiltOf = (org = false): [number, number, number] => {
    const a = R() * Math.PI * 2;
    const t = org ? 0.03 + R() * 0.07 : 0.16 + R() * 0.3;
    return [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)];
  };
  const index = new Map<string, number>();
  const node = (n: (typeof people)[number], orbit: number, ang: number, extra: Partial<Body>) => {
    const facts = factsOf.get(n.id) ?? 0;
    const b = add({
      kind: NODE,
      id: n.id,
      name: n.id === S.seat ? tr("you") : short(n.name),
      grains: 0,
      org: n.kind !== "person",
      ent: n.kind,
      orbit,
      ang,
      y: (R() - 0.5) * 0.36,
      R: 0.56 + Math.min(0.24, Math.sqrt(facts) * 0.045),
      tilt: tiltOf(n.kind !== "person"),
      spin: (0.5 + R() * 0.5) * (R() < 0.5 ? -1 : 1),
      facts,
      draws: drawsOf.get(n.id) ?? 0,
      ...extra,
    });
    index.set(n.id, b.i);
    return b;
  };
  const seat = seatNode ? node(seatNode, 0, 0, { seat: true, R: 0.82, y: 0, tilt: [0.16, 0.98, 0.1], spin: 0.7 }) : null;
  const caps = [6, 10, 14];
  let from = 0;
  caps.forEach((cap, lane) => {
    const xs = early.slice(from, from + cap);
    from += cap;
    const off = R() * Math.PI * 2;
    xs.forEach((n, j) => {
      // the weightier ones spread round the lane first, the rest between them
      const slot = j % 2 === 0 ? j / 2 : Math.ceil(xs.length / 2) + (j - 1) / 2;
      node(n, LANES[lane]!, off + (slot / xs.length) * Math.PI * 2 + (R() - 0.5) * 0.12, {});
    });
  });
  late.forEach((n, j) => node(n, 7.75, 0.4 + (j / Math.max(1, late.length)) * Math.PI * 2, { late: true, R: 0.49 }));

  // ---------------------------------------------------------------- ties

  const tieOf = new Map<string, number>();
  const tie = (a: number, b: number, text: string, thin: boolean) => {
    if (a === b) return -1;
    const k = `${Math.min(a, b)}:${Math.max(a, b)}`;
    const had = tieOf.get(k);
    if (had != null) return had;
    if (bodies.filter((x) => x.kind === TIE).length >= 110) return -1;
    const t = add({ kind: TIE, id: `tie:${k}`, name: "", grains: 0, a, b, text, thin });
    tieOf.set(k, t.i);
    return t.i;
  };
  for (const e of S.events) {
    if (e.act !== "link" || !e.who || !e.to) continue;
    const a = index.get(e.who);
    const b = index.get(e.to);
    if (a == null || b == null) continue;
    tie(a, b, e.text, e.head === HEAD.reach);
  }

  // ---------------------------------------------------------------- crowds, risks

  const segs = S.segments.slice(0, 8);
  const wsum = segs.reduce((s, x) => s + Math.sqrt(Math.max(1, x.size)), 0) || 1;
  const gap = 0.16;
  let a0 = 0.9;
  for (const sg of segs) {
    const span = (Math.sqrt(Math.max(1, sg.size)) / wsum) * (Math.PI * 2 - gap * segs.length);
    const b = add({ kind: CROWD, id: `crowd:${sg.id}`, name: sg.name, grains: 0, a0, a1: a0 + span, size: sg.size, cares: sg.cares, force: sg.force });
    index.set(b.id, b.i);
    a0 += span + gap;
  }
  const riskEvs = [...build, ...before].filter((e) => e.head === HEAD.risk).slice(0, 8);
  const riskBody = new Map<Ev, number>();
  riskEvs.forEach((e, j) => {
    const b = add({ kind: NODE, id: `risk:${j}`, name: e.text.split(" · ")[0]!, grains: 0, risk: true, orbit: 12.3 + (j % 3) * 0.7, ang: 0.7 + (j / riskEvs.length) * Math.PI * 2, y: 0, R: 0.13, tilt: tiltOf(), spin: 1.4, importance: 0, facts: 0, draws: 0 });
    riskBody.set(e, b.i);
  });

  const seedBody = add({ kind: NODE, id: "seed", name: "", grains: 0, seed: true, orbit: 0, ang: 0, y: 0, R: 0.95, tilt: [0.12, 0.985, 0.1], spin: 0.9, importance: 0, facts: 0, draws: 0 });

  // ---------------------------------------------------------------- where facts come from

  const hostN = new Map<string, number>();
  for (const e of build) if (e.head === HEAD.fact) hostN.set(e.source ?? "", (hostN.get(e.source ?? "") ?? 0) + 1);
  const ranked = [...hostN.entries()].filter(([h]) => h).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 12);
  // the long tail of small sources is gathered into a few clouds of its own
  const tail = [...ranked.slice(12).map(([h]) => h), ...(hostN.has("") ? [""] : [])];
  const tailClouds = Math.min(4, tail.length);
  const hosts: { host: string; n: number; many: number }[] = top.map(([host, n]) => ({ host, n, many: 0 }));
  const srcOf = new Map(hosts.map((h, i) => [h.host, i]));
  for (let c = 0; c < tailClouds; c++) hosts.push({ host: "", n: 0, many: 0 });
  tail.forEach((h, j) => {
    const c = top.length + (j % tailClouds);
    srcOf.set(h, c);
    hosts[c]!.n += hostN.get(h) ?? 0;
    hosts[c]!.many += 1;
  });
  const srcIx = (h: string | null | undefined) => srcOf.get(h ?? "") ?? 0;
  // a far arc of clouds, away from where the camera stands
  const sources = hosts.map((h, i) => {
    // the named ones and the gathered ones alternate along the arc
    // a far bank of clouds beyond the world, in two rows
    const slot = (i * 7) % hosts.length;
    const k = hosts.length > 1 ? slot / (hosts.length - 1) : 0.5;
    const a = Math.PI * (0.5 + 0.31 * (k * 2 - 1));
    const far = slot % 2;
    const r = 15 + far * 5.2;
    return { host: h.host ? bareHost(h.host) : tr("otherSources", { count: h.many }), n: h.n, pos: [Math.cos(a) * r, 1.2 + far * 2.5 + ((slot * 5) % 3) * 0.5, -Math.sin(a) * r] as [number, number, number] };
  });

  // ---------------------------------------------------------------- the build, as it is shown

  const B = (s: number, d: number, k: BeatKind, ev: Ev, o: Partial<Beat> = {}): Beat => ({ s, d, k, ev, body: -1, to: -1, tie: -1, dir: 1, feat: false, n: 0, src: -1, ...o });
  const beats: Beat[] = [];
  const stages: StageRow[] = [];
  const stage = (key: string, name: string, s: number, e: number, total: number) => total > 0 && stages.push({ key, name, s, e, total });
  let t = 1.2;

  // who
  let s0 = t;
  const appears = build.filter((e) => e.act === "appear" && e.who && index.has(e.who) && !e.who.startsWith("crowd:"));
  const seatAppear = appears.find((e) => e.who === S.seat);
  const order = [...(seatAppear ? [seatAppear] : []), ...appears.filter((e) => e !== seatAppear)];
  if (seat && !seatAppear) beats.push(B(t, 1.6, "appear", { t: 0, act: "appear", who: seat.id, head: HEAD.person, text: tr("you"), w: 1, phase: "build" }, { body: seat.i, feat: true }));
  // what this play was set to before anything was built: each setting drawn from how the real world is spread
  const setups = build.filter((e) => e.act === "draw" && !e.who && (e.options?.length ?? 0) >= 2 && e.picked).slice(0, 3);
  order.forEach((e, j) => {
    beats.push(B(t, 1.6, "appear", e, { body: index.get(e.who!)!, feat: j === 0, n: j }));
    t += j === 0 ? 1.8 : 0.44;
    if (j === 0 && seat && e.who === seat.id && setups.length) {
      t += 1.4;
      setups.forEach((d, n) => {
        beats.push(B(t, 2.6, "draw", d, { body: seat.i, feat: true, n }));
        t += 2.6;
      });
      t += 0.6;
    }
  });
  stage("who", tr("stageWho"), s0, t, order.length || 1);
  t += 1.0;

  // who will be stayed with to be read: the first few that matter most, of those whose traits were drawn from a real
  // spread or of whom something is known
  const personas = build.filter((e) => e.act === "write" && e.head.startsWith(HEAD.persona) && e.who && index.has(e.who));
  const drawsBy = new Map<string, Ev[]>();
  for (const e of build) if (e.act === "draw" && e.who && index.has(e.who)) drawsBy.set(e.who, [...(drawsBy.get(e.who) ?? []), e]);
  const drawn = (e: Ev) => drawsBy.get(e.who!)?.some((d) => (d.options?.length ?? 0) >= 2) ?? false;
  const known = (e: Ev) => (factsOf.get(e.who!) ?? 0) > 0;
  const others = personas.filter((e) => e.who !== S.seat);
  const held = new Set([...others.filter((e) => drawn(e) && known(e)), ...others.filter((e) => drawn(e) && !known(e)), ...others.filter((e) => !drawn(e) && known(e))].slice(0, 3).map((e) => e.who!));
  const heldFacts = new Map<number, { e: Ev; n: number; src: number }[]>();

  // facts: each to whoever it is about, or to the ground of the world
  s0 = t;
  const facts = build.filter((e) => e.head === HEAD.fact);
  const span = Math.max(12, Math.min(26, facts.length * 0.055));
  const nth = new Map<number, number>();
  const factBody: number[] = [];
  facts.forEach((e, j) => {
    const body = (e.who && index.get(e.who)) || disc.i;
    const n = nth.get(body) ?? 0;
    nth.set(body, n + 1);
    factBody.push(body);
    if (e.who && held.has(e.who) && body !== disc.i) {
      heldFacts.set(body, [...(heldFacts.get(body) ?? []), { e, n, src: srcIx(e.source) }]);
      return;
    }
    beats.push(B(t + (j / Math.max(1, facts.length)) * span, 1.2, "fact", e, { body, n, src: srcIx(e.source) }));
  });
  if (facts.length) t += span;
  stage("fact", tr("stageFact"), s0, t, facts.length);
  t += 1.6;

  // personas: the draws each was made from, then the persona written; the first few held to be read
  s0 = t;
  const holds: Hold[] = [];
  const done = new Set<number>();
  const pending = build.filter((e) => e.act === "link" && e.who && e.to && index.has(e.who) && index.has(e.to));
  const tieSpan: [number, number] = [Infinity, 0];
  const emitTies = (all: boolean) => {
    for (let j = 0; j < pending.length; ) {
      const e = pending[j]!;
      const a = index.get(e.who!)!;
      const b = index.get(e.to!)!;
      if (all || (done.has(a) && done.has(b))) {
        const id = tie(a, b, e.text, false);
        if (id >= 0 && !beats.some((x) => x.k === "tie" && x.tie === id)) {
          beats.push(B(t, 2.4, "tie", e, { body: a, to: b, tie: id }));
          tieSpan[0] = Math.min(tieSpan[0], t);
          t += 0.4;
          tieSpan[1] = t;
        }
        pending.splice(j, 1);
      } else j++;
    }
  };
  const personaSpan: [number, number] = [t, t];
  for (const e of personas) {
    const body = index.get(e.who!)!;
    const feat = held.has(e.who!);
    const ds = drawsBy.get(e.who!) ?? [];
    const read = feat ? ds.filter((d) => (d.options?.length ?? 0) >= 2 && d.picked).slice(0, 3) : [];
    const hold: Hold | null = feat ? { s: t, e: t, body, facts: 0, srcs: 0, inS: t, inE: t, traits: [], said: e.text, saidS: t } : null;
    if (hold) {
      t += 0.9;
      // what is known of them comes in from where it was found, while they are being looked at
      const fs = heldFacts.get(body) ?? [];
      if (fs.length) {
        const len = Math.min(3.4, 1.3 + fs.length * 0.1);
        fs.forEach((f, j) => beats.push(B(t + (j / fs.length) * len, 1.2, "fact", f.e, { body, n: f.n, src: f.src })));
        hold.facts = fs.length;
        hold.srcs = new Set(fs.map((f) => f.src)).size;
        hold.inS = t;
        hold.inE = t + len;
        t += len + 0.7;
      }
    }
    ds.forEach((d, j) => {
      const on = read.includes(d);
      beats.push(B(t, on ? 2.5 : 0.5, "draw", d, { body, feat: on, n: j }));
      if (hold && d.picked && hold.traits.length < 5) hold.traits.push({ s: t + (on ? 1.55 : 0.3), label: d.head.replace(/^.*?· /, ""), value: d.picked });
      t += on ? 2.5 : feat ? 0.12 : 0.05;
    });
    beats.push(B(t, feat ? 3.6 : 1.4, "persona", e, { body, feat, n: ds.length }));
    if (hold) hold.saidS = t;
    t += feat ? 3.6 : 0.62;
    done.add(body);
    if (hold) {
      // once written, their ties go out to whoever they are tied to
      const mine = pending.filter((x) => index.get(x.who!) === body || index.get(x.to!) === body).slice(0, 3);
      for (const x of mine) {
        const a = index.get(x.who!)!;
        const b = index.get(x.to!)!;
        const id = tie(a, b, x.text, false);
        if (id >= 0 && !beats.some((y) => y.k === "tie" && y.tie === id)) {
          beats.push(B(t, 2.8, "tie", x, { body: body, to: a === body ? b : a, tie: id, feat: true }));
          tieSpan[0] = Math.min(tieSpan[0], t);
          t += 0.7;
          tieSpan[1] = t;
        }
        pending.splice(pending.indexOf(x), 1);
      }
      if (mine.length) t += 1.5;
      hold.e = t;
      holds.push(hold);
    }
    personaSpan[1] = t;
    if (!feat) emitTies(false);
  }
  for (const b of bodies) if (b.kind === NODE) done.add(b.i);
  emitTies(true);
  stage("persona", tr("stagePersona"), personaSpan[0], personaSpan[1], personas.length);
  if (tieSpan[1] > 0) stage("tie", tr("stageTie"), tieSpan[0], tieSpan[1], beats.filter((x) => x.k === "tie").length);
  t += 1.2;

  // crowds
  s0 = t;
  const crowds = build.filter((e) => e.act === "appear" && e.who?.startsWith("crowd:") && index.has(e.who));
  crowds.forEach((e, j) => {
    beats.push(B(t, 2.6, "crowd", e, { body: index.get(e.who!)!, feat: true, n: j }));
    t += 1.7;
  });
  stage("crowd", tr("stageCrowd"), s0, t, crowds.length);

  // risks, each looked up in the real world
  s0 = t;
  const looks = [...build, ...before].filter((e) => e.act === "lookup" && e.head.startsWith(HEAD.look));
  riskEvs.forEach((e, j) => {
    beats.push(B(t, 2.2, "risk", e, { body: riskBody.get(e)!, n: j }));
    t += 0.7;
    const l = looks[j];
    if (l) {
      beats.push(B(t, 2.2, "lookup", l, { body: riskBody.get(e)!, n: j }));
      t += 0.7;
    }
  });
  stage("risk", tr("stageRisk"), s0, t, riskEvs.length);
  if (crowds.length || riskEvs.length) t += 1.0;

  // the main line
  s0 = t;
  const miles = build.filter((e) => e.act === "advance" && (e.head === HEAD.milestone || e.head === HEAD.mainLine));
  miles.forEach((e, j) => {
    beats.push(B(t, 3.0, "mile", e, { n: j }));
    t += 0.95;
  });
  stage("mile", tr("stageMile"), s0, t, miles.length);
  t += 1.0;

  // the opening
  const open: Ev = { t: 0, act: "advance", who: null, head: HEAD.open, text: S.start ?? "", w: 1, phase: "build" };
  beats.push(B(t, 7, "open", open, { feat: true }));
  stages.push({ key: "open", name: tr("stageOpen"), s: t, e: t + 7, total: 1 });
  t += 9;
  beats.sort((a, b) => a.s - b.s);
  const buildAct: Act = { beats, end: t, stages, date: S.start ?? "", title: tr("buildTitle"), holds, lead: 13 };

  // ---------------------------------------------------------------- hand out the grains

  const nodes = bodies.filter((b) => b.kind === NODE && !b.risk && !b.seed);
  const ties = bodies.filter((b) => b.kind === TIE);
  const crowdBs = bodies.filter((b) => b.kind === CROWD);
  const risks = bodies.filter((b) => b.risk);
  const share = (xs: Body[], total: number, w: (b: Body) => number) => {
    const sum = xs.reduce((s, b) => s + w(b), 0) || 1;
    for (const b of xs) b.grains = Math.floor((total * w(b)) / sum);
  };
  share(nodes, N * 0.3, (b) => (b.seat ? 7 : Math.pow(0.55, 1.4) + 0.1 * Math.sqrt(b.facts ?? 0)));
  // a lighter picture has fewer grains of everything, in the same proportions
  const lite = N / 262144;
  share(ties, Math.min(N * 0.12, ties.length * 800 * lite), (b) => (b.thin ? 0.45 : 1));
  share(crowdBs, crowdBs.length ? N * 0.1 : 0, (b) => Math.sqrt(Math.max(1, b.size ?? 1)));
  for (const b of risks) b.grains = Math.floor(260 * lite);
  seedBody.grains = Math.floor(9000 * lite);
  ring.grains = Math.floor(N * 0.028);
  dust.grains = Math.floor(N * 0.11);
  disc.grains = N - bodies.reduce((s, b) => s + b.grains, 0);

  const srcOfFact = new Map<number, number[]>();
  facts.forEach((e, j) => {
    const b = factBody[j]!;
    srcOfFact.set(b, [...(srcOfFact.get(b) ?? []), srcIx(e.source)]);
  });
  for (const b of bodies) {
    if (b.kind !== NODE || b.seat || b.risk || b.seed) continue;
    const fs = srcOfFact.get(b.i) ?? [];
    if (!fs.length) continue;
    const n = [0, 0, 0];
    for (const x of fs) n[x % 3]! += 1;
    b.hue = 1 + n.indexOf(Math.max(...n));
  }
  const seats = new Float32Array(N * 4);
  let p = 0;
  for (const b of bodies) {
    const fs = srcOfFact.get(b.i) ?? [];
    const base = b.kind === DISC ? 0.3 : 0.4;
    for (let j = 0; j < b.grains && p < N; j++, p++) {
      let rank = R();
      let src = -1;
      let aux = R();
      if ((b.kind === NODE || b.kind === DISC) && fs.length) {
        const k = j / b.grains;
        if (k < base) rank = (k / base) * base;
        else {
          const f = Math.min(fs.length - 1, Math.floor(((k - base) / (1 - base)) * fs.length));
          rank = base + (1 - base) * ((f + R() * 0.98) / fs.length);
          src = fs[f]!;
        }
        // the ground fills from the middle out, loosely
        if (b.kind === DISC) aux = Math.min(1, Math.max(0, rank * 0.7 + R() * 0.34));
      } else if (b.kind === RING) rank = j / b.grains;
      seats[p * 4] = b.i;
      seats[p * 4 + 1] = rank;
      seats[p * 4 + 2] = src;
      seats[p * 4 + 3] = aux;
    }
  }

  return {
    title: S.title,
    start: S.start,
    bodies,
    seat: seat?.i ?? -1,
    disc: disc.i,
    ring: ring.i,
    seats,
    sources,
    build: buildAct,
    index,
    tieOf,
    seedBody: seedBody.i,
    timeBeats: play.filter((e) => e.act === "advance" && e.head === HEAD.time).length,
    miles: miles.map((e, j) => ({ text: e.text, at: (j + 1) / (miles.length + 1) })),
  };
}

/**
 * A step of the play for the picture: everything that had already happened in the play before it (taken as done), and
 * what happens in it, each thing at the moment the page tells it (`at`, in seconds of the telling). Only what a
 * picture can say: who is thinking, who acts and whom it reaches, what is left to odds, who comes in, time moving;
 * the words themselves are told by the page.
 */
export function playActs(S: Stream, sc: Score, start: number, end: number, at: (e: Ev) => number): { before: Beat[]; now: Beat[] } {
  const play = S.events.filter((e) => e.phase === "play");
  const first = play.findIndex((e) => e.head === HEAD.yourMove);
  const after = first < 0 ? [] : play.slice(first);
  const B = (s: number, d: number, k: BeatKind, ev: Ev, o: Partial<Beat> = {}): Beat => ({ s, d, k, ev, body: -1, to: -1, tie: -1, dir: 1, feat: false, n: 0, src: -1, ...o });
  const tie = (a: number, b: number) => sc.tieOf.get(`${Math.min(a, b)}:${Math.max(a, b)}`) ?? -1;
  const conv = (e: Ev, s: number, live: boolean, rest: Ev[]): Beat | null => {
    const body = e.who ? (sc.index.get(e.who) ?? -1) : -1;
    const to = e.to ? (sc.index.get(e.to) ?? -1) : -1;
    const h = e.head;
    if (e.act === "advance" && h === HEAD.time) return B(s, 3, "time", e);
    if (h === HEAD.yourMove) return B(s, 3, "act", e, { body: sc.seat });
    if (e.act === "link") {
      const id = body >= 0 && to >= 0 ? tie(body, to) : -1;
      if (id < 0) return null;
      return h === HEAD.reach ? B(s + 0.3, 1.6, "reach", e, { body, to, tie: id, dir: sc.bodies[id]!.a === body ? 1 : -1 }) : B(s, 2.4, "tie", e, { body, to, tie: id });
    }
    if (h === HEAD.thinking) {
      if (body < 0) return null;
      const next = live ? rest.find((x) => x.who === e.who && x.head === HEAD.move) : undefined;
      return B(s, next ? Math.max(0.8, at(next) - s) : 4, "think", e, { body });
    }
    if (h === HEAD.move) return body >= 0 ? B(s, 2.2, "move", e, { body }) : null;
    if (e.act === "draw" && h === HEAD.odds) return B(s, 3.6, "odds", e, { body: body >= 0 ? body : sc.seat, feat: true });
    if (e.act === "draw" && h.startsWith(HEAD.chance)) return B(s, e.picked === HAPPENED ? 3 : 1.1, "chance", e, { body: body >= 0 ? body : sc.seat, feat: e.picked === HAPPENED });
    if (e.act === "draw") return body >= 0 ? B(s, 0.5, "draw", e, { body }) : null;
    if (h === HEAD.result) return B(s, 1.6, "result", e, { body });
    if (h === HEAD.chance) return B(s, 2.6, "hit", e, { body: body >= 0 ? body : sc.seat });
    if (h === HEAD.memory) return body >= 0 ? B(s, 0.8, "memo", e, { body }) : null;
    if (e.act === "appear") return body >= 0 ? B(s, 3, "appear", e, { body }) : null;
    if (e.act === "write" && h.startsWith(HEAD.persona)) return body >= 0 ? B(s, 1.6, "persona", e, { body }) : null;
    // a number of the main line moves: it leaves whoever moved it for where the page keeps that number
    if (e.act === "change") return B(s + 0.5, 2.6, "delta", e, { body });
    return null;
  };
  const before: Beat[] = [];
  const now: Beat[] = [];
  after.forEach((e, j) => {
    if (e.t < start) {
      const b = conv(e, -1e5, false, []);
      if (b) before.push(b);
    } else if (e.t <= end) {
      const b = conv(e, at(e), true, after.slice(j + 1, j + 80));
      if (b) now.push(b);
    }
  });
  now.sort((a, b) => a.s - b.s);
  return { before, now };
}
