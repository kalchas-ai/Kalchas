"use client";

import type { BuildView, GraphView } from "@kalchas/core";
import { type SkyBuilder } from "@/components/sky/build";

/**
 * How a world taking shape is drawn while it is built: the ring of time and where its people stand on it (used by the
 * page that waits for a world).
 */

export type BuildWorld = {
  graph: GraphView;
  seatId: string | null;
  scope: { timeStart: string; timeEnd: string | null; protagonist: { name: string } } | null;
  startPoints: { date: string; title: string }[];
  completeness: { overall: number; blindSpots: string[] } | null;
  events: number;
};

/* ---------------------------------------------------------------- a world taking shape */

type Stages = BuildView["stages"];

/** The ring of time sits between the panels on the left and right, above the log. */
export function ring(w: number, h: number) {
  const wide = w > 1100;
  const cx = wide ? (360 + (w - 310)) / 2 : w / 2;
  const cy = Math.max(160, (h - 200) / 2 + 20);
  const rx = Math.max(130, Math.min(wide ? (w - 720) / 2 : w * 0.36, 430));
  const ry = Math.min(rx * 0.66, (h - 250) / 2);
  return { cx, cy, rx, ry };
}

type Placed = { id: string; name: string; x: number; y: number; r: number };

/** You in the middle; everyone else spiralling out, the cast before the background. */
export function placeNodes(world: BuildWorld, c: ReturnType<typeof ring>): Placed[] {
  const nodes = [...world.graph.nodes].sort((a, b) => Number(b.id === world.seatId) - Number(a.id === world.seatId) || Number(b.tier === "cast") - Number(a.tier === "cast")).slice(0, 60);
  return nodes.map((n, i) => {
    const seat = n.id === world.seatId || (!world.seatId && i === 0);
    const a = i * 2.399963 + 0.6;
    const k = seat ? 0 : 0.28 + 0.62 * Math.sqrt(i / Math.max(1, nodes.length));
    return { id: n.id, name: n.name, x: c.cx + Math.cos(a) * k * c.rx, y: c.cy + Math.sin(a) * k * c.ry, r: 5.5 + (seat ? 2 : 0) };
  });
}

/**
 * The building of a world, one real stage at a time: a ring of time (its span), the people found (cell bodies, sized
 * by importance), information flowing into them while they are researched, their ties growing as axons, outside
 * events as satellites round the ring, each person's inner detail as dendrites, the years as ticks, a scan for what is
 * still unclear (fog), and the moments you can start from lighting up on the ring.
 */
export function construction(s: SkyBuilder, w: number, h: number, world: BuildWorld, stages: Stages, first: (k: string, i?: number) => number, c: ReturnType<typeof ring> = ring(w, h)) {
  const state = (k: string) => stages.find((x) => x.key === k)?.state ?? "waiting";
  const on = (k: string) => state(k) !== "waiting" || stages.length === 0;
  const t0 = world.scope ? Date.parse(world.scope.timeStart) : NaN;
  const t1 = world.scope?.timeEnd ? Date.parse(world.scope.timeEnd) : NaN;
  const angleOf = (d: string) => {
    const f = Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0 ? 0.5 : Math.max(0, Math.min(1, (Date.parse(d) - t0) / (t1 - t0)));
    return -Math.PI / 2 + f * Math.PI * 2;
  };
  if (on("scope")) {
    const born = first("stage:scope");
    s.ring({ x: c.cx, y: c.cy, r: c.rx, squash: c.ry / c.rx, b: 0.3, born, size: 1.2 });
    s.ring({ x: c.cx, y: c.cy, r: c.rx * 1.16, squash: c.ry / c.rx, b: 0.08, dotted: true, born: born + 0.4 });
  }
  // the years, as ticks on the ring
  if (on("markers") && world.scope) {
    const born = first("stage:markers");
    const y0 = Number(world.scope.timeStart.slice(0, 4));
    const y1 = Number((world.scope.timeEnd ?? "").slice(0, 4));
    for (let y = y0 + 1; y <= y1 && y - y0 < 60; y++) {
      const a = angleOf(`${y}-01-01`);
      s.line({ ax: c.cx + Math.cos(a) * c.rx * 0.965, ay: c.cy + Math.sin(a) * c.ry * 0.965, bx: c.cx + Math.cos(a) * c.rx * 1.045, by: c.cy + Math.sin(a) * c.ry * 1.045, b: 0.4, gap: 2, born: born + (y - y0) * 0.08 });
    }
  }
  // outside events: satellites round the ring
  if (on("exogenous")) {
    const born = first("stage:exogenous");
    const n = Math.min(48, world.events);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + ((k + 0.5) / n) * Math.PI * 2;
      s.star({ x: c.cx + Math.cos(a) * c.rx * 1.16, y: c.cy + Math.sin(a) * c.ry * 1.16, size: 1.8, b: 0.55, halo: 2.4, born: born + k * 0.05 });
    }
  }
  const nodes = placeNodes(world, c);
  const at = new Map(nodes.map((n) => [n.id, n]));
  // ties, as axons
  world.graph.edges.forEach((e, i) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b || a === b) return;
    s.link({ from: `n:${e.from}`, to: `n:${e.to}`, ax: a.x, ay: a.y, bx: b.x, by: b.y, bow: 0.14 * (i % 2 ? 1 : -1), b: 0.16, w: 0.55, rate: 0.12, born: first(`edge:${e.id}`, i) });
  });
  const researching = state("research") === "running";
  const personas = on("personas");
  nodes.forEach((n, i) => {
    const born = first(`node:${n.id}`, i);
    s.neuron({ id: `n:${n.id}`, x: n.x, y: n.y, r: n.r, parts: "soma", born, flare: 1.2, seed: i + 1 });
    if (personas) s.neuron({ move: `n:${n.id}`, x: n.x, y: n.y, r: n.r, parts: "branches", dendrites: 5, reach: n.r * 3.4, born: Math.max(first("stage:personas"), born) + 0.2, seed: i + 1 });
    // what is being found out about them, flowing in from outside
    if (researching && i < 14) {
      const a = Math.atan2(n.y - c.cy, n.x - c.cx) + 0.3;
      s.stream({ move: `n:${n.id}`, ax: c.cx + Math.cos(a) * c.rx * 1.5, ay: c.cy + Math.sin(a) * c.ry * 1.5, bx: n.x, by: n.y, n: 4, rate: 0.3, wobble: 18, b: 0.45 });
    }
  });
  // what is still unclear
  if (on("completeness")) {
    const born = first("stage:completeness");
    if (state("completeness") === "running") s.pulse({ x: c.cx, y: c.cy, r0: 10, r1: c.rx * 1.2, period: 3.2, squash: c.ry / c.rx, b: 0.25 });
    const blind = world.completeness?.blindSpots ?? [];
    const thick = 1 - (world.completeness?.overall ?? 0.6);
    blind.slice(0, 8).forEach((_, k) => {
      const a = (k / Math.max(1, Math.min(8, blind.length))) * Math.PI * 2 + 0.4;
      s.fog({ x: c.cx + Math.cos(a) * c.rx * 0.78, y: c.cy + Math.sin(a) * c.ry * 0.78, r: 50 + 60 * thick, b: 0.5 + thick * 0.4, drift: 10, born: born + k * 0.3, seed: 70 + k });
    });
  }
  // where you can start: the moments on the ring, warm (they wait for you to choose)
  world.startPoints.forEach((p, k) => {
    const a = angleOf(p.date);
    const x = c.cx + Math.cos(a) * c.rx;
    const y = c.cy + Math.sin(a) * c.ry;
    const born = first(`start:${p.date}:${k}`, k);
    s.star({ x, y, size: 3.4, warm: 1, b: 1, halo: 3.4, born, flare: 1.5 });
    s.pulse({ x, y, r0: 3, r1: 20, period: 2.6, phase: k * 0.2, warm: 1, b: 0.3, born });
  });
}
