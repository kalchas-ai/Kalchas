"use client";

import type { Pal } from "@/components/kit/palette";
import { MONO } from "@/components/kit/palette";
import { useT } from "@/lib/i18n/client";

/**
 * Motion over the world being built: what arrives, at the moment it arrives, where it lands. Every world is built the
 * same way (its people and organisations, the facts about them, the ties between them, a persona for each, the stages
 * done), so this reads only those, never anything particular to one world.
 *
 * - someone new: a ring where they appear;
 * - a tie found: a spark running along it, its word at the middle;
 * - a fact filed: a spark flying in from the stream on the right to whoever it is about;
 * - a persona written: rings closing round the person one layer at a time (who, wants, holds back, voice, and a
 *   dashed one for what they keep to themselves), its first line beside them;
 * - a stage done: a ring sweeping out over the whole picture, the stage named.
 */

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

type Node = { id: string; x: number; y: number; r: number; name: string };

/** One ring per layer a persona is written in; only rings, no names (the names would read as content). */
const LAYERS = [0, 1, 2, 3];

export function BuildMotion({
  P,
  t,
  w,
  h,
  placed,
  bornAt,
  edges,
  facts,
  personas,
  done,
  from,
  center,
  style = "fly",
}: {
  P: Pal;
  t: number;
  w: number;
  h: number;
  placed: Map<string, Node>;
  bornAt: Map<string, number>;
  edges: { from: string; to: string; label: string; show: number }[];
  facts: { i: number; show: number; who: string | null }[];
  personas: { id: string; identity: string; show: number }[];
  done: { label: string; at: number }[];
  /** Where filed facts fly in from. */
  from: { x: number; y: number };
  center: { cx: number; cy: number; rx: number; ry: number };
  /**
   * How facts and personas arrive. fly: a speck flies in, the persona as a card beside them (the first draft).
   * link (A): a line from the stream to the person, the persona under their name. count (B): their count of facts
   * ticks up, the persona in one place at the foot, tied to them. gather (C): facts settle round them and stay, the
   * persona as a subtitle.
   */
  style?: "fly" | "link" | "count" | "gather";
}) {
  const tr = useT("product.wait.build-motion");
  if (!w) return null;
  const born = [...placed.values()].filter((n) => {
    const a = bornAt.get(n.id);
    return a != null && t >= a && t - a < 1.8;
  });
  const ties = edges.filter((e) => t >= e.show && t - e.show < 1.8 && placed.has(e.from) && placed.has(e.to)).slice(-5);
  const filed = facts.filter((f) => f.who && placed.has(f.who) && t >= f.show && t - f.show < 0.9).slice(-8);
  const written = personas.filter((p) => placed.has(p.id) && t >= p.show && t - p.show < 3.6);
  const newest = written[written.length - 1] ?? null;
  const stage = [...done].reverse().find((d) => t >= d.at && t - d.at < 2.2) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      <svg width={w} height={h} className="absolute inset-0">
        {/* a stage done: a ring sweeping out */}
        {stage && (
          <ellipse cx={center.cx} cy={center.cy} rx={center.rx * (0.4 + easeOut(seg(t, stage.at, stage.at + 2)) * 0.9)} ry={center.ry * (0.4 + easeOut(seg(t, stage.at, stage.at + 2)) * 0.9)} fill="none" stroke={P.warm} strokeWidth={1.2} strokeOpacity={0.55 * (1 - seg(t, stage.at + 0.3, stage.at + 2.2))} />
        )}
        {/* someone new */}
        {born.map((n) => {
          const p = seg(t, bornAt.get(n.id)!, bornAt.get(n.id)! + 1.8);
          return <circle key={n.id} cx={n.x} cy={n.y} r={n.r + 4 + easeOut(p) * 30} fill="none" stroke={P.ink} strokeWidth={1.2} strokeOpacity={0.7 * (1 - p)} />;
        })}
        {/* a tie found */}
        {ties.map((e) => {
          const a = placed.get(e.from)!;
          const b = placed.get(e.to)!;
          const p = easeOut(seg(t, e.show, e.show + 0.8));
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.16;
          const s = p;
          const sx = (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * mx + s * s * b.x;
          const sy = (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * my + s * s * b.y;
          const fade = 1 - seg(t, e.show + 1.2, e.show + 1.8);
          return (
            <g key={`${e.from}${e.to}${e.show}`} opacity={fade}>
              <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} pathLength={100} fill="none" stroke={P.warm} strokeWidth={1.4} strokeDasharray={`${p * 100} 100`} />
              {p < 1 && <circle cx={sx} cy={sy} r={3} fill={P.warm} />}
              {p >= 1 && e.label && (
                <text x={mx} y={my + 4} textAnchor="middle" fontSize={11} fill={P.warm} style={{ paintOrder: "stroke", stroke: P.page, strokeWidth: 4 }}>
                  {e.label.length > 10 ? `${e.label.slice(0, 9)}…` : e.label}
                </text>
              )}
            </g>
          );
        })}
        {/* a fact filed */}
        {style === "fly" &&
          filed.map((f) => {
            const n = placed.get(f.who!)!;
            const p = easeOut(seg(t, f.show, f.show + 0.8));
            const y0 = from.y + (f.i % 7) * 26;
            return <circle key={f.i} cx={from.x + (n.x - from.x) * p} cy={y0 + (n.y - y0) * p - Math.sin(p * Math.PI) * 40} r={2.2} fill={P.warm} fillOpacity={1 - seg(t, f.show + 0.7, f.show + 0.9)} />;
          })}
        {style === "link" &&
          facts
            .filter((f) => f.who && placed.has(f.who) && t >= f.show && t - f.show < 1.4)
            .slice(-3)
            .map((f) => {
              const n = placed.get(f.who!)!;
              const p = easeOut(seg(t, f.show, f.show + 0.6));
              const fade = 1 - seg(t, f.show + 0.8, f.show + 1.4);
              const y0 = from.y + 8;
              const mx = (from.x + n.x) / 2;
              return <path key={f.i} d={`M ${from.x} ${y0} C ${mx} ${y0}, ${mx} ${n.y}, ${n.x} ${n.y}`} pathLength={100} fill="none" stroke={P.warm} strokeWidth={1} strokeOpacity={0.55 * fade} strokeDasharray={`${p * 100} 100`} />;
            })}
        {style === "gather" &&
          [...placed.values()].flatMap((n) =>
            facts
              .filter((f) => f.who === n.id && t >= f.show)
              .slice(-28)
              .map((f, k) => {
                const a0 = ((f.i * 2.399) % (Math.PI * 2)) + t * (k % 2 ? 0.25 : -0.18);
                const r = n.r + 8 + ((f.i * 7) % 13);
                const p = easeOut(seg(t, f.show, f.show + 1.1));
                const sx = n.x + Math.cos(a0) * (r + 70 * (1 - p));
                const sy = n.y + Math.sin(a0) * (r + 70 * (1 - p)) * 0.8;
                return <circle key={`${n.id}${f.i}`} cx={sx} cy={sy} r={p < 1 ? 1.8 : 1.1} fill={p < 1 ? P.warm : P.ink} fillOpacity={p < 1 ? 0.9 : 0.5} />;
              }),
          )}
        {/* a persona written: a ring per layer */}
        {written.map((pp) => {
          const n = placed.get(pp.id)!;
          const fade = 1 - seg(t, pp.show + 2.8, pp.show + 3.6);
          return (
            <g key={pp.id} opacity={fade}>
              {LAYERS.map((l, i) => {
                const a = seg(t, pp.show + i * 0.35, pp.show + i * 0.35 + 0.45);
                if (a <= 0) return null;
                const r = n.r + 6 + i * 5;
                const fog = false;
                return <circle key={l} cx={n.x} cy={n.y} r={r} fill="none" stroke={fog ? P.mute : P.warm} strokeWidth={1} strokeOpacity={fog ? 0.6 : 0.7} strokeDasharray={fog ? "2 4" : `${2 * Math.PI * r * a} 999`} transform={`rotate(-90 ${n.x} ${n.y})`} />;
              })}
            </g>
          );
        })}
      </svg>
      {/* the newest persona: where it shows depends on the style */}
      {newest &&
        (() => {
          const n = placed.get(newest.id)!;
          const a = Math.min(seg(t, newest.show, newest.show + 0.4), 1 - seg(t, newest.show + 2.8, newest.show + 3.6));
          const k = Math.round(newest.identity.length * seg(t, newest.show + 0.2, newest.show + 1.6));
          // (without what is in full-width brackets)
          const name = n.name.replace(/\uff08.*?\uff09/g, "");
          if (style === "link")
            return (
              <div className="absolute z-[3] w-[220px] -translate-x-1/2 text-center text-[11.5px] leading-[1.55]" style={{ left: n.x, top: n.y + n.r + 30, opacity: a, color: P.ink, textShadow: `0 0 10px ${P.page}, 0 0 4px ${P.page}` }}>
                <div className="line-clamp-2">{newest.identity.slice(0, k)}</div>
              </div>
            );
          if (style === "count") {
            const bx = center.cx;
            const by = h - 190;
            return (
              <>
                <svg width={w} height={h} className="absolute inset-0">
                  <path d={`M ${bx} ${by - 6} C ${bx} ${(by + n.y) / 2}, ${n.x} ${(by + n.y) / 2}, ${n.x} ${n.y + n.r + 6}`} fill="none" stroke={P.warm} strokeOpacity={0.45 * a} strokeWidth={1} />
                </svg>
                <div className="absolute z-[3] w-[420px] -translate-x-1/2 rounded-[14px] px-4 py-3" style={{ left: bx, top: by, opacity: a, background: `rgb(${P.pageRgb} / 0.82)`, boxShadow: `0 18px 50px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(${P.warmRgb} / 0.3)`, backdropFilter: "blur(14px)" }}>
                  <div className="text-[10.5px]" style={{ fontFamily: MONO, color: P.warm }}>
                    {tr("profileWritten", { name })}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[13px] leading-[1.55]">{newest.identity.slice(0, k)}</div>
                </div>
              </>
            );
          }
          if (style === "gather")
            return (
              <div className="absolute z-[3] w-[760px] -translate-x-1/2 text-center" style={{ left: center.cx, top: h - 170, opacity: a, textShadow: "0 2px 16px rgb(0 0 0 / 0.8)" }}>
                <div className="text-[11px]" style={{ fontFamily: MONO, color: P.warm }}>
                  {tr("profileWritten", { name })}
                </div>
                <div className="mt-1 line-clamp-2 text-[17px] leading-[1.55] font-light">{newest.identity.slice(0, k)}</div>
              </div>
            );
          const right = n.x < center.cx + center.rx * 0.3;
          return (
            <div className="absolute z-[3] w-[250px] rounded-[12px] px-3 py-2 backdrop-blur-md" style={{ top: n.y + n.r + 30, ...(right ? { left: n.x - 20 } : { right: w - n.x - 20 }), opacity: a, background: `rgb(${P.pageRgb} / 0.85)`, boxShadow: `inset 0 0 0 1px rgb(${P.warmRgb} / 0.35)` }}>
              <div className="text-[10.5px]" style={{ fontFamily: MONO, color: P.warm }}>
                {tr("profile", { name })}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5]">{newest.identity.slice(0, k)}</div>
            </div>
          );
        })()}
      {/* B: each person's count of facts, ticking up as they come */}
      {style === "count" &&
        [...placed.values()].map((n) => {
          const mine = facts.filter((f) => f.who === n.id && t >= f.show);
          if (!mine.length) return null;
          const fresh = t - mine[mine.length - 1]!.show < 0.7;
          return (
            <div key={n.id} className="absolute z-[2] rounded-full px-1.5 text-[10px]" style={{ left: n.x + n.r + 4, top: n.y - n.r - 14, fontFamily: MONO, color: fresh ? P.page : P.mute, background: fresh ? P.warm : `rgb(${P.inkRgb} / 0.08)`, transform: `scale(${fresh ? 1.15 : 1})`, transition: "transform .25s, background .4s, color .4s" }}>
              {mine.length}
            </div>
          );
        })}
      {stage && (
        <div className="absolute -translate-x-1/2 rounded-full px-3 py-1 text-[12px]" style={{ left: center.cx, top: center.cy - center.ry - 56, opacity: Math.min(seg(t, stage.at, stage.at + 0.3), 1 - seg(t, stage.at + 1.6, stage.at + 2.2)), background: `rgb(${P.warmRgb} / 0.16)`, color: P.warm }}>
          ✓ {stage.label}
        </div>
      )}
    </div>
  );
}
