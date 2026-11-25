/**
 * A face for everyone in a world: something that can be told apart at a glance and taken hold of, where there was
 * only light. It is a dark shape against that light, as someone is seen with the light behind them, and what the
 * shape is says what kind of thing they are: a head and shoulders for a person, a building for an organisation, a
 * pediment on columns for an institution, three together for a group. Who they are is written beside them. In the
 * picture the light is the picture's own (see Field.lamps); on the page, where there is none, it is drawn here.
 *
 * What was chosen out of comparing (`style` 3) is the same shapes made of grains of light, as everything in the
 * picture is, with no lamp and nothing else behind them.
 */

export type FaceKind = "self" | "person" | "org" | "inst" | "group" | "other";

const INK = "236, 235, 230";
const WARM = "240, 176, 96";
const PAGE = "16, 17, 19";

/** What kind of face a body has. */
/**
 * What kind of thing someone is, where the world says only what part they play ("approver", "investor"): a person or
 * a body, told from the name. A name that says a body (a company, a fund, a committee, an office) is one; a name
 * that says a person (an officer, a lawyer, a founder, "you") is one; what cannot be told is taken for a body.
 */
export function entOf(kind: string | undefined, name: string): string {
  if (kind === "person" || kind === "organization" || kind === "institution" || kind === "group") return kind;
  if (kind === "government") return "institution";
  if (kind === "crowd") return "group";
  // Chinese words for a body: company, group, agency, committee, meeting, fund, bank, university, college, department,
  // office, centre, team, platform, association, court, government, consulate; and names ending in bureau, ministry,
  // administration, section, institute, station. A committee, court, government, bureau, ministry or administration
  // is an institution.
  if (/\u516c\u53f8|\u96c6\u56e2|\u673a\u6784|\u59d4\u5458\u4f1a|\u4f1a\u8bae|\u57fa\u91d1|\u94f6\u884c|\u5927\u5b66|\u5b66\u9662|\u90e8\u95e8|\u529e\u516c\u5ba4|\u4e2d\u5fc3|\u56e2\u961f|\u5e73\u53f0|\u534f\u4f1a|\u6cd5\u9662|\u653f\u5e9c|\u4f7f\u9886\u9986$|\u5c40$|\u90e8$|\u7f72$|\u5904$|\u6240$|\u7ad9$|Inc\.?|LLC|Ltd|Capital|Ventures|Partners|Fund|Bank|Labs?$/i.test(name)) return /\u59d4\u5458\u4f1a|\u6cd5\u9662|\u653f\u5e9c|\u5c40$|\u90e8$|\u7f72$/.test(name) ? "institution" : "organization";
  // Chinese words for a person: officer, -er/master, staff; names ending in head, -er, -ist; adviser, manager, director,
  // supervisor, founder, person in charge, partner, investor, landlord, client, doctor, captain (of a team), captain
  // (of a ship), head of office, representative, assistant.
  if (/\u5b98|\u5e08|\u5458|\u957f$|\u8005$|\u5bb6$|\u987e\u95ee|\u7ecf\u7406|\u603b\u76d1|\u4e3b\u7ba1|\u521b\u59cb\u4eba|\u8d1f\u8d23\u4eba|\u5408\u4f19\u4eba$|\u6295\u8d44\u4eba$|\u623f\u4e1c|\u5ba2\u6237$|\u533b\u751f|\u961f\u957f|\u8239\u957f|\u4e3b\u4efb|\u4ee3\u8868|\u52a9\u7406|CEO|CTO|CFO/i.test(name)) return "person";
  return "organization";
}

export function faceKind(b: { seat?: boolean; ent?: string; crowd?: boolean }): FaceKind {
  if (b.crowd) return "group";
  if (b.seat) return "self";
  return b.ent === "person" ? "person" : b.ent === "organization" ? "org" : b.ent === "institution" ? "inst" : b.ent === "group" ? "group" : "other";
}

// ---------------------------------------------------------------- the shapes (each within one unit round the middle)

function bust(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.arc(x, y - 0.36 * s, 0.29 * s, 0, Math.PI * 2);
  g.fill();
  // shoulders: narrow at the neck, falling away to either side
  g.beginPath();
  g.moveTo(x - 0.66 * s, y + 0.74 * s);
  g.bezierCurveTo(x - 0.66 * s, y + 0.3 * s, x - 0.42 * s, y + 0.06 * s, x, y + 0.06 * s);
  g.bezierCurveTo(x + 0.42 * s, y + 0.06 * s, x + 0.66 * s, y + 0.3 * s, x + 0.66 * s, y + 0.74 * s);
  g.closePath();
  g.fill();
}

function shape(g: CanvasRenderingContext2D, kind: FaceKind, x: number, y: number, s: number, light: string) {
  if (kind === "person" || kind === "self") {
    bust(g, x, y, s);
  } else if (kind === "org") {
    // a building: a tall block and a lower wing; its windows are lit when there is room to see them
    g.fillRect(x - 0.58 * s, y - 0.7 * s, 0.6 * s, 1.4 * s);
    g.fillRect(x + 0.08 * s, y - 0.16 * s, 0.5 * s, 0.86 * s);
    if (s >= 8.5) {
      const dark = g.fillStyle;
      g.fillStyle = light;
      const u = Math.max(1, Math.round(0.13 * s));
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) g.fillRect(Math.round(x - 0.47 * s + i * 0.25 * s), Math.round(y - 0.52 * s + j * 0.34 * s), u, u);
      for (let j = 0; j < 2; j++) g.fillRect(Math.round(x + 0.25 * s), Math.round(y + 0.02 * s + j * 0.32 * s), u, u);
      g.fillStyle = dark;
    }
  } else if (kind === "inst") {
    // a pediment on columns, on a step
    g.beginPath();
    g.moveTo(x - 0.74 * s, y - 0.26 * s);
    g.lineTo(x, y - 0.72 * s);
    g.lineTo(x + 0.74 * s, y - 0.26 * s);
    g.closePath();
    g.fill();
    g.fillRect(x - 0.66 * s, y - 0.2 * s, 1.32 * s, 0.1 * s);
    for (let i = 0; i < 3; i++) g.fillRect(x - 0.56 * s + i * 0.45 * s, y - 0.04 * s, 0.22 * s, 0.5 * s);
    g.fillRect(x - 0.74 * s, y + 0.52 * s, 1.48 * s, 0.16 * s);
  } else if (kind === "group") {
    // three of them, the middle one in front
    const a = g.globalAlpha;
    g.globalAlpha = a * 0.6;
    bust(g, x - 0.46 * s, y - 0.08 * s, 0.56 * s);
    bust(g, x + 0.46 * s, y - 0.08 * s, 0.56 * s);
    g.globalAlpha = a;
    bust(g, x, y + 0.12 * s, 0.72 * s);
  } else {
    g.beginPath();
    g.arc(x, y, 0.34 * s, 0, Math.PI * 2);
    g.fill();
  }
}

// ---------------------------------------------------------------- of grains (see the head of the file)

/** A face of grains of light: the way that was chosen. */
export const GRAINY = 3;

/** How much of the picture's own light is left behind a face drawn this way. */
export const lampOf = (style: number) => (style === GRAINY ? 0 : 1);

// seven by seven, a grain wherever there is a mark
const GRAINS: Record<FaceKind, string[]> = {
  person: ["..###..", "..###..", "..###..", ".......", ".#####.", "#######", "#######"],
  self: ["..###..", "..###..", "..###..", ".......", ".#####.", "#######", "#######"],
  org: [".###...", ".###...", ".###...", ".######", ".######", ".######", ".######"],
  inst: ["...#...", "..###..", ".#####.", "#######", "#.#.#.#", "#.#.#.#", "#######"],
  group: [".......", "..#.#..", ".......", ".#.#.#.", ".......", "..#.#..", "......."],
  other: [".......", ".......", "..###..", "..###..", "..###..", ".......", "......."],
};

function grains(g: CanvasRenderingContext2D, kind: FaceKind, x: number, y: number, s: number) {
  const map = GRAINS[kind];
  const pitch = (2 * s) / 7;
  // (a group is fewer, larger grains: a handful of people, not a drawing of one)
  const rad = pitch * (kind === "group" ? 0.62 : 0.4);
  g.beginPath();
  for (let j = 0; j < 7; j++)
    for (let i = 0; i < 7; i++) {
      if (map[j]![i] !== "#") continue;
      const cx = x - s + (i + 0.5) * pitch;
      const cy = y - s + (j + 0.5) * pitch;
      g.moveTo(cx + rad, cy);
      g.arc(cx, cy, rad, 0, Math.PI * 2);
    }
  g.fill();
}

// ---------------------------------------------------------------- a face

export type FaceLook = {
  /** How plainly it is there, 0…1. */
  a: number;
  /** How far it has been chosen (0…1): a ring round it. */
  ring?: number;
  /** It is thinking: a short arc goes round it (where round it, in radians), as plainly as `busyA` (0…1). */
  busy?: number | null;
  busyA?: number;
};

/** The light a face is seen against, in pixels round its middle. */
export const LAMP = 1.42;

/** Someone's shape, dark, at a place where there is a light of radius r·LAMP behind it. */
export function drawFace(g: CanvasRenderingContext2D, kind: FaceKind, x: number, y: number, r: number, look: FaceLook, style = 1) {
  const a = look.a;
  if (a < 0.02) return;
  const edge = kind === "self" ? WARM : INK;
  const lit = kind === "self" ? "255, 214, 160" : "246, 243, 234";
  g.save();
  g.shadowBlur = 0;
  g.setLineDash([]);
  if (style === GRAINY) {
    // the grains: each a small light of its own, and nothing behind them
    g.shadowColor = `rgba(${lit}, ${0.55 * a})`;
    g.shadowBlur = r * 0.3;
    g.fillStyle = `rgba(${lit}, ${0.97 * a})`;
    grains(g, kind, x, y, r * 0.96);
    g.shadowBlur = 0;
  } else {
    g.fillStyle = `rgba(${PAGE}, ${0.95 * a})`;
    shape(g, kind, x, y + r * 0.05, r * 0.8, `rgba(252, 249, 240, ${0.92 * a})`);
  }
  if ((look.ring ?? 0) > 0.02) {
    g.lineWidth = 1;
    g.strokeStyle = `rgba(${edge}, ${0.85 * a * look.ring!})`;
    g.beginPath();
    g.arc(x, y, r * LAMP + 5, 0, Math.PI * 2);
    g.stroke();
  }
  if (look.busy != null && (look.busyA ?? 1) > 0.02) {
    g.lineWidth = 1.2;
    g.strokeStyle = `rgba(${WARM}, ${0.9 * a * (look.busyA ?? 1)})`;
    g.beginPath();
    g.arc(x, y, r * LAMP + 3, look.busy, look.busy + 1.3);
    g.stroke();
  }
  g.restore();
}

/** The same face on the page, where there is no light of the picture's to see it against: its light is drawn too. */
export function drawBadge(g: CanvasRenderingContext2D, kind: FaceKind, x: number, y: number, r: number, style = 1) {
  const c = kind === "self" ? "255, 216, 164" : "250, 247, 238";
  const k = lampOf(style);
  if (k > 0) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r * LAMP);
    gr.addColorStop(0, `rgba(${c}, ${0.98 * k})`);
    gr.addColorStop(0.6, `rgba(${c}, ${0.82 * k})`);
    gr.addColorStop(0.82, `rgba(${c}, ${0.26 * k})`);
    gr.addColorStop(1, `rgba(${c}, 0)`);
    g.save();
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r * LAMP, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  drawFace(g, kind, x, y, r, { a: 1 }, style);
}
