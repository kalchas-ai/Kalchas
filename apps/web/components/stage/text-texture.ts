import * as THREE from "three";

/**
 * Text drawn into a canvas and used as a texture, so words can be engraved on glass or placed in a 3D scene
 * with real typography. Redraws itself once the web fonts for its glyphs have loaded.
 */

export type Run = {
  text: string;
  size: number; // px at 1x
  weight?: number;
  font?: "sans" | "mono";
  color?: string;
  tracking?: number; // em
  gap?: number; // px above this run
  maxWidth?: number; // wrap width in px (sans only)
  lineHeight?: number;
  upper?: boolean;
};

const FAMILY = {
  sans: `"Familjen Grotesk", "MiSans", system-ui, sans-serif`,
  mono: `"Martian Mono", "MiSans", ui-monospace, monospace`,
};

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  // CJK breaks anywhere; Latin breaks at spaces
  // (any character from the CJK punctuation block, \u3000, to the end of the unified ideographs, \u9fff)
  const cjk = /[\u3000-\u9fff]/.test(text);
  const tokens = cjk ? Array.from(text) : text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    const next = cur ? (cjk ? cur + t : `${cur} ${t}`) : t;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = t;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function textTexture(runs: Run[], opts: { width: number; height: number; align?: "left" | "center" | "right"; pad?: number; valign?: "top" | "middle" | "bottom"; blur?: number; scale?: number }) {
  const scale = opts.scale ?? 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(opts.width * scale);
  canvas.height = Math.round(opts.height * scale);
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const draw = () => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, opts.width, opts.height);
    if (opts.blur) ctx.filter = `blur(${opts.blur}px)`;
    const pad = opts.pad ?? 0;
    const align = opts.align ?? "left";
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    // lay out first to measure height
    const laid: { run: Run; lines: string[]; lh: number }[] = [];
    let total = 0;
    for (const run of runs) {
      ctx.font = `${run.weight ?? 400} ${run.size}px ${FAMILY[run.font ?? "sans"]}`;
      const text = run.upper ? run.text.toUpperCase() : run.text;
      const lines = run.maxWidth ? wrap(ctx, text, run.maxWidth) : [text];
      const lh = run.size * (run.lineHeight ?? 1.18);
      total += (run.gap ?? 0) + lines.length * lh;
      laid.push({ run, lines, lh });
    }
    let y = opts.valign === "middle" ? (opts.height - total) / 2 : opts.valign === "bottom" ? opts.height - pad - total : pad;
    const x = align === "left" ? pad : align === "right" ? opts.width - pad : opts.width / 2;
    for (const { run, lines, lh } of laid) {
      y += run.gap ?? 0;
      ctx.font = `${run.weight ?? 400} ${run.size}px ${FAMILY[run.font ?? "sans"]}`;
      ctx.fillStyle = run.color ?? "#fff";
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(run.tracking ?? 0) * run.size}px`;
      for (const l of lines) {
        y += lh;
        ctx.fillText(l, x, y - lh * 0.22);
      }
    }
    ctx.filter = "none";
    tex.needsUpdate = true;
  };
  draw();
  if (typeof document !== "undefined" && document.fonts) {
    const loads = runs.map((r) => document.fonts.load(`${r.weight ?? 400} ${r.size}px ${FAMILY[r.font ?? "sans"]}`, r.text));
    Promise.all(loads).then(draw, draw);
  }
  return tex;
}

/** A flat plane carrying a text texture. Size in world units; the texture keeps its aspect. */
export function textPlane(tex: THREE.Texture, width: number, aspect: number, opts: { additive?: boolean; opacity?: number } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), mat);
  mesh.renderOrder = 10;
  return mesh;
}
