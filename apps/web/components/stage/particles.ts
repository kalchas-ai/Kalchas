import * as THREE from "three";
import { landMask } from "@/components/stage/land";

/**
 * The dotted world shared by the dithered homepages: stars, a terrain of dots, dust along the line,
 * streams of facts converging on a moment, a living map (day, night, cities, waves), a fog that lifts,
 * and a wall of dots that sharpens. Drawn additively in white (warm where it matters) and dithered after.
 */


/* value noise, for terrain and patterns */
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = x - xi;
  const v = y - yi;
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
};
export const field = (x: number, y: number, seed = 0) => vnoise(x * 2.1 + seed * 13.7, y * 2.1 + seed * 7.3) * 0.65 + vnoise(x * 5.3 + 7 + seed, y * 5.3 + 3) * 0.35;

export const pointsVertex = `
  attribute float aSize; attribute vec4 aSeed; attribute float aWarm;
  uniform float uTime; uniform float uPx;
  varying float vA; varying float vWarm;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vA = 1.0; vWarm = aWarm;
    gl_PointSize = aSize * uPx * (60.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
export const pointsFragment = `
  varying float vA; varying float vWarm; uniform float uShow; uniform float uGain;
  void main(){
    float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
    vec3 c = mix(vec3(1.0), vec3(1.0, 0.62, 0.25), vWarm);
    gl_FragColor = vec4(c * uGain * uShow * vA * smoothstep(0.5, 0.15, d), 1.0);
  }`;

export function pointsMaterial(extraVertex = "", extraUniforms: Record<string, THREE.IUniform> = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uShow: { value: 1 }, uGain: { value: 1 }, ...extraUniforms },
    vertexShader: extraVertex || pointsVertex,
    fragmentShader: pointsFragment,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

export function geo(pos: number[], size: number[], seed: number[], warm?: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
  g.setAttribute("aWarm", new THREE.Float32BufferAttribute(warm ?? size.map(() => 0), 1));
  return g;
}

export const rnd = (() => {
  let s = 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
})();


const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export type WorldPieces = {
  mats: THREE.ShaderMaterial[];
  streams: THREE.ShaderMaterial;
  map: THREE.ShaderMaterial;
  fog: THREE.ShaderMaterial;
  wall: THREE.ShaderMaterial;
};

/** Builds the dotted world into `world`, with each beat's piece placed at its stop on the line (`Z`). */
export function buildWorld(world: THREE.Scene, Z: number[]): WorldPieces {
  const out = { mats: [] as THREE.ShaderMaterial[] } as WorldPieces;
  const add = (points: THREE.Points) => {
    world.add(points);
    out.mats.push(points.material as THREE.ShaderMaterial);
    points.frustumCulled = false;
    return points;
  };

    // stars
    {
      const pos: number[] = [];
      const size: number[] = [];
      const seed: number[] = [];
      for (let i = 0; i < 5000; i++) {
        const u = rnd() * 2 - 1;
        const th = rnd() * Math.PI * 2;
        const rr = 260 + rnd() * 160;
        const s = Math.sqrt(1 - u * u);
        pos.push(Math.cos(th) * s * rr, Math.abs(u) * rr * 0.7 + 10, Math.sin(th) * s * rr - 200);
        size.push(0.6 + rnd() * 2.2);
        seed.push(rnd(), rnd(), rnd(), rnd());
      }
      add(new THREE.Points(geo(pos, size, seed), pointsMaterial()));
    }
    // terrain: a field of dots under the line, rising into ridges at the sides
    {
      const pos: number[] = [];
      const size: number[] = [];
      const seed: number[] = [];
      for (let z = 40; z > -470; z -= 0.95) {
        for (let x = -70; x <= 70; x += 0.95) {
          // leave room for the living map at the ripple beat
          if (Math.abs(x) < 27 && z < Z[5]! + 9 && z > Z[5]! - 14) continue;
          const ridge = Math.pow(Math.min(1, Math.abs(x) / 70), 2.2) * 22;
          const n = field(x * 0.02, z * 0.02, 2) * 6 + field(x * 0.06, z * 0.06, 5) * 2;
          const y = -4.2 + ridge * (0.4 + 0.6 * field(x * 0.01, z * 0.01, 9)) + n * (0.15 + Math.abs(x) / 70);
          // keep the valley near the line low and quiet
          pos.push(x + (rnd() - 0.5) * 0.3, y, z + (rnd() - 0.5) * 0.3);
          size.push(0.8 + rnd() * 0.7);
          seed.push(rnd(), rnd(), rnd(), rnd());
        }
      }
      const m = pointsMaterial();
      m.uniforms.uGain!.value = 1.5;
      add(new THREE.Points(geo(pos, size, seed), m));
    }
    // dust along the line
    {
      const pos: number[] = [];
      const size: number[] = [];
      const seed: number[] = [];
      for (let i = 0; i < 4000; i++) {
        pos.push((rnd() - 0.5) * 40, (rnd() - 0.2) * 14, 40 - rnd() * 520);
        size.push(0.4 + rnd() * 1.2);
        seed.push(rnd(), rnd(), rnd(), rnd());
      }
      const m = pointsMaterial();
      m.uniforms.uGain!.value = 0.6;
      add(new THREE.Points(geo(pos, size, seed), m));
    }
    // read: streams of facts converging on the moment
    {
      const pos: number[] = [];
      const size: number[] = [];
      const seed: number[] = [];
      for (let i = 0; i < 3500; i++) {
        pos.push(0, 0, 0);
        size.push(0.8 + rnd() * 1.6);
        const th = rnd() * Math.PI * 2;
        const ph = Math.acos(rnd() * 2 - 1);
        seed.push(th, ph, rnd(), rnd());
      }
      out.streams = pointsMaterial(
        `attribute float aSize; attribute vec4 aSeed; attribute float aWarm;
         uniform float uTime; uniform float uPx; uniform vec3 uAt; uniform float uPull;
         varying float vA; varying float vWarm;
         void main(){
           float k = fract(uTime * (0.05 + aSeed.w * 0.07) + aSeed.z);
           vec3 dir = vec3(sin(aSeed.y) * cos(aSeed.x), cos(aSeed.y) * 0.6, sin(aSeed.y) * sin(aSeed.x));
           float rr = mix(26.0, 0.6, pow(k, 0.7 + uPull));
           vec3 p = uAt + dir * rr;
           vec4 mv = modelViewMatrix * vec4(p, 1.0);
           vA = smoothstep(0.0, 0.15, k) * smoothstep(1.0, 0.85, k); vWarm = 0.0;
           gl_PointSize = aSize * uPx * (60.0 / -mv.z);
           gl_Position = projectionMatrix * mv;
         }`,
        { uAt: { value: V(0, 0, Z[2]!) }, uPull: { value: 0 } },
      );
      add(new THREE.Points(geo(pos, size, seed), out.streams));
    }
    // ripple: a living map laid out below the line — day and night, cities, waves from one decision
    {
      const land = landMask();
      const pos: number[] = [];
      const size: number[] = [];
      const seed: number[] = [];
      const warm: number[] = [];
      const Wm = 46;
      const Hm = 23;
      for (let lat = 80; lat > -60; lat -= 1.1) {
        for (let lon = -180; lon < 180; lon += 1.1) {
          const isLand = land(lon, lat);
          if (!isLand && rnd() > 0.12) continue;
          pos.push((lon / 360) * Wm, -5.2, Z[5]! - 2 - (lat / 180) * Hm * 1.0);
          size.push(isLand ? 1.15 : 0.5);
          seed.push(lon, lat, rnd(), isLand ? 1 : 0);
          warm.push(0);
        }
      }
      out.map = pointsMaterial(
        `attribute float aSize; attribute vec4 aSeed; attribute float aWarm;
         uniform float uTime; uniform float uPx; uniform float uSun; uniform float uWave; uniform vec2 uOrigin;
         varying float vA; varying float vWarm;
         void main(){
           vec4 mv = modelViewMatrix * vec4(position, 1.0);
           float lon = aSeed.x, lat = aSeed.y;
           float day = cos(radians(lon - uSun)) * cos(radians(lat));
           float lit = smoothstep(-0.1, 0.25, day);
           float city = step(0.93, aSeed.z) * aSeed.w * (1.0 - lit);
           float d = distance(vec2(lon, lat * 1.4), uOrigin) / 220.0;
           float ring = 0.0;
           for (int k = 0; k < 3; k++){ float R = fract(uTime * 0.09 + float(k) / 3.0); float dd = (d - R) * 18.0; ring += exp(-dd * dd) * (1.0 - R); }
           ring *= uWave * aSeed.w;
           vA = (aSeed.w > 0.5 ? (0.25 + 0.75 * lit) : 0.18) + city * 1.6 + ring * 1.8;
           vWarm = clamp(city * 2.0 + ring * 1.4, 0.0, 1.0);
           gl_PointSize = aSize * uPx * (1.0 + city + ring) * (60.0 / -mv.z);
           gl_Position = projectionMatrix * mv;
         }`,
        { uSun: { value: 0 }, uWave: { value: 0 }, uOrigin: { value: new THREE.Vector2(10, 48 * 1.4) } },
      );
      add(new THREE.Points(geo(pos, size, seed, warm), out.map));
    }
    // hindsight: a fog of dots around the layers that lifts as they align
    {
      const pos: number[] = [];
      const size: number[] = [];
      const seed: number[] = [];
      for (let i = 0; i < 5000; i++) {
        pos.push((rnd() - 0.5) * 22, (rnd() - 0.5) * 9, Z[7]! - 2 - rnd() * 12);
        size.push(0.6 + rnd() * 1.8);
        seed.push(rnd(), rnd(), rnd(), rnd());
      }
      out.fog = pointsMaterial(
        `attribute float aSize; attribute vec4 aSeed; attribute float aWarm;
         uniform float uTime; uniform float uPx; uniform float uClear;
         varying float vA; varying float vWarm;
         void main(){
           vec3 p = position + vec3(sin(uTime * 0.2 + aSeed.x * 6.28), cos(uTime * 0.17 + aSeed.y * 6.28), 0.0) * 0.6;
           p.x += sign(p.x) * uClear * (6.0 + aSeed.z * 10.0);
           vec4 mv = modelViewMatrix * vec4(p, 1.0);
           vA = (1.0 - uClear * 0.85) * 0.8; vWarm = 0.0;
           gl_PointSize = aSize * uPx * (60.0 / -mv.z);
           gl_Position = projectionMatrix * mv;
         }`,
        { uClear: { value: 0 } },
      );
      add(new THREE.Points(geo(pos, size, seed), out.fog));
    }
    // evolve: a wall of dots that sharpens into a clear map as runs accumulate
    {
      const pos: number[] = [];
      const size: number[] = [];
      const seed: number[] = [];
      const cols = 170;
      const rows = 90;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = (i / cols - 0.5) * 17;
          const y = (j / rows - 0.5) * 9;
          const n = field(i / cols * 1.6, j / cols * 1.6, 9.3);
          const contour = Math.abs(((n * 14) % 1) - 0.5) > 0.42 ? 1 : 0;
          const high = n > 0.55 ? 1 : 0;
          if (!contour && !high && rnd() > 0.18) continue;
          pos.push(x, y - 0.2, Z[8]! - 6);
          size.push(contour ? 1.3 : high ? 0.9 : 0.5);
          seed.push(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, contour);
        }
      }
      out.wall = pointsMaterial(
        `attribute float aSize; attribute vec4 aSeed; attribute float aWarm;
         uniform float uTime; uniform float uPx; uniform float uSharp;
         varying float vA; varying float vWarm;
         void main(){
           float j = 1.0 - uSharp;
           vec3 p = position + aSeed.xyz * vec3(5.0, 4.0, 4.0) * j * j + vec3(sin(uTime + aSeed.x * 9.0), cos(uTime * 0.8 + aSeed.y * 9.0), 0.0) * 0.12 * j;
           vec4 mv = modelViewMatrix * vec4(p, 1.0);
           vA = mix(0.35, aSeed.w > 0.5 ? 1.2 : 0.6, uSharp); vWarm = 0.0;
           gl_PointSize = aSize * uPx * (60.0 / -mv.z);
           gl_Position = projectionMatrix * mv;
         }`,
        { uSharp: { value: 0 } },
      );
      add(new THREE.Points(geo(pos, size, seed), out.wall));
    }
  
  return out;
}
