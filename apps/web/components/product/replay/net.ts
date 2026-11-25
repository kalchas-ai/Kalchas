import type { GraphView } from "@kalchas/core";
import { hash } from "@/components/kit/dither";
import { sky, type Level } from "@/components/sky/build";

/**
 * The web of people in a real world, laid out once per size: you in the middle, everyone else pulled toward
 * the people they are tied to and pushed apart until no two labels overlap. Drawn as soft glows joined by
 * gently bowing lines, like the rest of the product.
 */

export type Node = GraphView["nodes"][number];
export type Placed = { id: string; x: number; y: number; r: number; node: Node };
export type Box = { x0: number; x1: number; y0: number; y1: number };

/** How many people the picture shows at most; the rest are reachable from the lists. */
export const MAX_NODES = 16;

const labelW = (n: Node, seat: string) => Math.min(170, 22 + (n.id === seat ? 6 : n.name.length) * 7.2);

/** Picks who is drawn: you, then the cast, always keeping anyone the caller insists on. */
export function pick(graph: GraphView, seat: string, keep: Set<string>): Node[] {
  const byImp = [...graph.nodes].sort((a, b) => Number(b.id === seat) - Number(a.id === seat) || Number(b.tier === "cast") - Number(a.tier === "cast"));
  const out = byImp.slice(0, MAX_NODES);
  for (const n of byImp.slice(MAX_NODES)) if (keep.has(n.id)) out.push(n);
  return out;
}

export function layout(nodes: Node[], edges: GraphView["edges"], seat: string, box: Box): Map<string, Placed> {
  const W = box.x1 - box.x0;
  const H = box.y1 - box.y0;
  const cx = box.x0 + W / 2;
  const cy = box.y0 + H / 2;
  if (W <= 0 || H <= 0) return new Map();
  const ids = new Set(nodes.map((n) => n.id));
  const links = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const P = nodes.map((n, i) => {
    const a = i * 2.399963 + hash(i) * 0.4;
    const rad = n.id === seat ? 0 : 0.25 + 0.75 * Math.sqrt(i / Math.max(1, nodes.length));
    return { n, x: cx + Math.cos(a) * rad * W * 0.42, y: cy + Math.sin(a) * rad * H * 0.42, vx: 0, vy: 0, hw: labelW(n, seat) / 2 + 8, hh: 30 };
  });
  const at = new Map(P.map((p) => [p.n.id, p]));
  const rest = Math.min(W, H) * 0.28;
  for (let it = 0; it < 360; it++) {
    const cool = 1 - it / 360;
    for (const p of P) {
      p.vx = (cx - p.x) * 0.004;
      p.vy = (cy - p.y) * 0.006;
    }
    for (const l of links) {
      const a = at.get(l.from)!;
      const b = at.get(l.to)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = ((d - rest) / d) * 0.015;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
    for (let i = 0; i < P.length; i++)
      for (let j = i + 1; j < P.length; j++) {
        const a = P[i]!;
        const b = P[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        // labels are wide, so overlap is judged on boxes; far apart, a weak push keeps the web open
        const ox = a.hw + b.hw - Math.abs(dx);
        const oy = a.hh + b.hh - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox / (a.hw + b.hw) < oy / (a.hh + b.hh)) {
            const s = (dx >= 0 ? 1 : -1) * ox * 0.25;
            a.vx -= s;
            b.vx += s;
          } else {
            const s = (dy >= 0 ? 1 : -1) * oy * 0.25;
            a.vy -= s;
            b.vy += s;
          }
        } else {
          const d2 = Math.max(400, dx * dx + dy * dy);
          const f = (rest * rest * 0.06) / d2;
          a.vx -= dx * f;
          a.vy -= dy * f;
          b.vx += dx * f;
          b.vy += dy * f;
        }
      }
    for (const p of P) {
      if (p.n.id === seat) {
        p.x = cx;
        p.y = cy;
        continue;
      }
      p.x = Math.max(box.x0 + p.hw, Math.min(box.x1 - p.hw, p.x + p.vx * (0.4 + cool)));
      p.y = Math.max(box.y0 + 24, Math.min(box.y1 - 40, p.y + p.vy * (0.4 + cool)));
    }
  }
  // Then settle what is still overlapping, judged on where the labels really are: under each node, two lines deep.
  const rOf = (p: (typeof P)[number]) => 29 + (p.n.id === seat ? 8 : 0);
  const top = (p: (typeof P)[number]) => p.y - 22;
  const bottom = (p: (typeof P)[number]) => p.y + rOf(p) * 0.55 + 40;
  const clampP = (p: (typeof P)[number]) => {
    if (p.n.id === seat) return;
    p.x = Math.max(box.x0 + p.hw, Math.min(box.x1 - p.hw, p.x));
    p.y = Math.max(box.y0 + 22, Math.min(box.y1 - rOf(p) * 0.55 - 40, p.y));
  };
  for (let pass = 0; pass < 240; pass++) {
    let moved = false;
    for (let i = 0; i < P.length; i++)
      for (let j = i + 1; j < P.length; j++) {
        const a = P[i]!;
        const b = P[j]!;
        const ox = Math.min(a.x + a.hw, b.x + b.hw) - Math.max(a.x - a.hw, b.x - b.hw);
        const oy = Math.min(bottom(a), bottom(b)) - Math.max(top(a), top(b));
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // move along the cheaper axis; you stay put in the middle
        const share = a.n.id === seat ? [0, 1] : b.n.id === seat ? [1, 0] : [0.5, 0.5];
        if (ox / (a.hw + b.hw) < oy / 80) {
          const d = (a.x <= b.x ? 1 : -1) * (ox + 2);
          a.x -= d * share[0]!;
          b.x += d * share[1]!;
        } else {
          const d = (a.y <= b.y ? 1 : -1) * (oy + 2);
          a.y -= d * share[0]!;
          b.y += d * share[1]!;
        }
        clampP(a);
        clampP(b);
      }
    if (!moved) break;
  }
  return new Map(P.map((p) => [p.n.id, { id: p.n.id, x: p.x, y: p.y, r: rOf(p), node: p.n }]));
}

/** How many ties away from you each person is. */
function depths(placed: Map<string, Placed>, edges: GraphView["edges"], seat: string) {
  const depth = new Map<string, number>([[seat, 0]]);
  let front = [seat];
  while (front.length) {
    const next: string[] = [];
    for (const id of front)
      for (const e of edges) {
        const o = e.from === id ? e.to : e.to === id ? e.from : null;
        if (o && placed.has(o) && !depth.has(o)) {
          depth.set(o, depth.get(id)! + 1);
          next.push(o);
        }
      }
    front = next;
  }
  return depth;
}

/**
 * The web as neurons: each person a cell body with dendrites (bigger the more they matter), you in the middle and
 * warm; every tie an axon, fuller the closer the tie, with a slow swell running along it; whoever hides something from
 * you sits in a small patch of fog.
 */
export function netScene(placed: Map<string, Placed>, edges: GraphView["edges"], seat: string, fog: Record<string, unknown>, w: number, h: number) {
  const s = sky().dust({ w, h, n: Math.round((w * h) / 420), b: 0.75 });
  const depth = depths(placed, edges, seat);
  for (const e of edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b || a === b) continue;
    s.link({ id: `e:${e.id}`, ax: a.x, ay: a.y, bx: b.x, by: b.y, bow: 0.12 * (hash(e.id.length + a.x) > 0.5 ? 1 : -1), b: 0.15, w: 0.75, rate: 0.075, size: e.simulated ? 0.9 : 1.1, density: e.simulated ? 0.5 : 1, back: (depth.get(e.to) ?? 99) < (depth.get(e.from) ?? 99) });
  }
  let i = 0;
  for (const [id, p] of placed) {
    const you = id === seat;
    const r = 6 + (you ? 3 : 0);
    if (fog[id]) s.fog({ id: `f:${id}`, x: p.x, y: p.y - 4, r: 30 + r * 1.5, b: 0.28, drift: 7 });
    s.neuron({ id: `n:${id}`, x: p.x, y: p.y, r, dendrites: 6, reach: r * 3 + 8, warm: you ? 1 : 0, b: you ? 1.1 : 0.8, seed: ++i });
    s.ring({ id: `sel:${id}`, x: p.x, y: p.y, r: r + 14, b: 0.55, size: 1.1 });
    if (you) s.pulse({ id: "run", x: p.x, y: p.y, r0: r, r1: Math.min(w, h) * 0.45, period: 1.8, b: 0.35, warm: 1 });
  }
  return s.done();
}

/**
 * How the web looks now: who a choice would reach (lit warm), who you picked (a ring), and a signal spreading from
 * you along the ties, one step further every beat, while a step runs.
 */
export function netLevels(
  placed: Map<string, Placed>,
  edges: GraphView["edges"],
  seat: string,
  { hot, picked, fog, wave, dim }: { hot: Set<string>; picked: string | null; fog: Record<string, unknown>; wave: number | null; dim: number },
) {
  const L: Record<string, Level> = {};
  const depth = depths(placed, edges, seat);
  const beat = 0.9;
  for (const [id] of placed) {
    const on = hot.has(id);
    const d = depth.get(id);
    L[`n:${id}`] = { lit: (on ? 1.8 : 1) * (id === seat ? 1 : dim), warm: on || id === seat ? 1 : 0, size: on ? 1.25 : 1, fire: wave != null && d != null && d > 0 ? wave + d * beat - 0.05 : undefined };
    L[`sel:${id}`] = { lit: picked === id ? 1 : 0 };
    L[`f:${id}`] = { lit: fog[id] ? dim : 0 };
  }
  for (const e of edges) {
    const a = depth.get(e.from);
    const b = depth.get(e.to);
    const on = (hot.has(e.from) || e.from === seat) && (hot.has(e.to) || e.to === seat) && (hot.has(e.from) || hot.has(e.to));
    // the signal runs from whoever is nearer to you
    const fire = wave != null && a != null && b != null && a !== b ? wave + Math.min(a, b) * beat : undefined;
    L[`e:${e.id}`] = { lit: on ? 3.5 : dim, warm: on ? 1 : 0, fire };
  }
  L.run = { lit: wave != null ? 1 : 0 };
  return L;
}

/** People a piece of text mentions, by name or alias (for lighting up whom a choice would reach). */
export function mentioned(text: string, nodes: Node[], seat: string): Set<string> {
  const out = new Set<string>();
  const low = text.toLowerCase();
  for (const n of nodes) {
    if (n.id === seat) continue;
    for (const name of [n.name, ...n.aliases]) {
      const k = name.trim().toLowerCase();
      if (k.length >= 2 && low.includes(k)) {
        out.add(n.id);
        break;
      }
    }
  }
  return out;
}
