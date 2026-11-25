import * as THREE from "three";

/**
 * Ordered (Bayer 4×4) dithering into a printed palette. Brightness becomes dot density; warm light keeps
 * its own accent ramp. Palettes avoid the usual tech blue: graphite (silver on dark graphite) and
 * bone (ink on warm paper-white, like a halftone print).
 */

export type PaletteName = "graphite" | "bone";

type Palette = { ramp: string[]; accent: string[]; page: string; ink: string; mute: string; rule: string; warm: string };

export const PALETTES: Record<PaletteName, Palette> = {
  graphite: {
    ramp: ["#101113", "#34373c", "#8d9198", "#ecebe6"],
    accent: ["#101113", "#5b3a14", "#c9852c", "#ffd9a3"],
    page: "#101113",
    ink: "#ecebe6",
    mute: "#9a9ea6",
    rule: "rgb(236 235 230 / 0.16)",
    warm: "#f0b060",
  },
  bone: {
    ramp: ["#ebe7de", "#b8b3a9", "#5d5a55", "#151515"],
    accent: ["#ebe7de", "#e4b98a", "#b8601a", "#5a2b06"],
    page: "#ebe7de",
    ink: "#151515",
    mute: "#5d5a55",
    rule: "rgb(21 21 21 / 0.16)",
    warm: "#b8601a",
  },
};

const lin = (h: string) => new THREE.Color(h); // THREE.Color stores linear values (colour management on)

export function ditherMaterial(name: PaletteName, pixel = 2) {
  const p = PALETTES[name];
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPx: { value: pixel },
      uRamp: { value: p.ramp.map(lin) },
      uAcc: { value: p.accent.map(lin) },
      uGain: { value: 1.0 },
      uFloor: { value: 0.0 },
      uVig: { value: 0.0 },
      uAvg: { value: 0.0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uPx; uniform vec3 uRamp[4]; uniform vec3 uAcc[4]; uniform float uGain; uniform float uFloor; uniform float uVig; uniform float uAvg;
      varying vec2 vUv;
      float bayer(vec2 p){
        int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0)); int i = x + y * 4;
        int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
        return (float(m[i]) + 0.5) / 16.0;
      }
      vec3 ramp(vec3 r[4], float l){
        float x = clamp(l, 0.0, 1.0) * 3.0;
        if (x < 1.0) return mix(r[0], r[1], x);
        if (x < 2.0) return mix(r[1], r[2], x - 1.0);
        return mix(r[2], r[3], x - 2.0);
      }
      void main(){
        vec2 cell = floor(gl_FragCoord.xy / uPx);
        vec2 uv = (cell * uPx + 0.5 * uPx) / uRes;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        if (uAvg > 0.5) {
          // look at the whole cell, not just its centre, so things moving by less than a cell don't flicker
          vec2 b0 = cell * uPx;
          vec3 s0 = texture2D(tDiffuse, (b0 + vec2(0.25, 0.25) * uPx) / uRes).rgb;
          vec3 s1 = texture2D(tDiffuse, (b0 + vec2(0.75, 0.25) * uPx) / uRes).rgb;
          vec3 s2 = texture2D(tDiffuse, (b0 + vec2(0.25, 0.75) * uPx) / uRes).rgb;
          vec3 s3 = texture2D(tDiffuse, (b0 + vec2(0.75, 0.75) * uPx) / uRes).rgb;
          c = mix((s0 + s1 + s2 + s3 + c) * 0.2, max(max(s0, s1), max(max(s2, s3), c)), 0.6);
        }
        c *= uGain;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        // a floor: faint glow stays dark instead of turning into a field of dots
        float l0 = l; l = max(0.0, l - uFloor) / (1.0 - uFloor); c *= l / max(l0, 1e-5);
        // an optional vignette, so the eye settles on the middle
        vec2 vq = uv - 0.5; vq.x *= uRes.x / uRes.y;
        float vig = 1.0 - uVig * smoothstep(0.42, 1.05, length(vq));
        l *= vig; c *= vig;
        float warm = clamp((c.r - c.b) * 2.2, 0.0, 1.0);
        // four levels, thresholded by the Bayer matrix
        float lv = pow(clamp(l, 0.0, 1.0), 0.72) * 3.0;
        float q = floor(lv + bayer(cell)) / 3.0;
        vec3 col = mix(ramp(uRamp, q), ramp(uAcc, q), step(0.35, warm));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });
}

/** A full-screen pass: draws `material` (which samples tDiffuse) into `target` (or the screen). */
export class FullScreen {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mesh: THREE.Mesh;
  constructor(public material: THREE.ShaderMaterial) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
}

export function setPalette(m: THREE.ShaderMaterial, name: PaletteName) {
  const p = PALETTES[name];
  (m.uniforms.uRamp!.value as THREE.Color[]).forEach((c, i) => c.set(p.ramp[i]!));
  (m.uniforms.uAcc!.value as THREE.Color[]).forEach((c, i) => c.set(p.accent[i]!));
}
