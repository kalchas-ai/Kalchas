import * as THREE from "three";

/**
 * Shaders that the engine of the picture (field.ts) draws its sky and its grounds with, kept apart from it because they
 * are long: the galaxy as it is seen from inside it (worked out, or as it is measured), the stars of the catalogue,
 * the ground that has a light of its own, and the clouds with depth that a source can be made of.
 */

export const NOISE = /* glsl */ `
precision highp sampler3D;
uniform sampler3D tNoise;
// smooth noise, four of it at once, from a small cube of random numbers
vec4 n4(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return texture(tNoise, (i + f + 0.5) / 64.0);
}
float n1(vec3 p) { return n4(p).r; }
`;

export const TRI_V = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ------------------------------------------------------------------------------------------- the cloud, four ways

const FOG_HEAD = /* glsl */ `
varying vec2 vUv;
uniform mat4 uInvPV;
uniform vec3 uCam;
uniform float uTime;
uniform int uSteps;
uniform vec3 uSrcPos[6];
uniform vec3 uSrcCol[6];
uniform float uSrcOn[6];
uniform float uSrcPow[6];
uniform float uSrcR[6];
uniform vec3 uMidCol;
uniform float uGather;
uniform float uBand;
uniform vec3 uAmb;
${NOISE}

// how much of anything there is here: round each source that has been found, in the middle as it gathers, and a thin
// layer lying across the whole place
float pres(vec3 p) {
  float s = 0.0;
  for (int i = 0; i < 6; i++) {
    vec3 v = p - uSrcPos[i];
    s += uSrcOn[i] * exp(-dot(v, v) / (uSrcR[i] * uSrcR[i]));
  }
  s += uGather * exp(-dot(p * vec3(1.0, 1.5, 1.0), p * vec3(1.0, 1.5, 1.0)) / 58.0);
  s += uBand * exp(-p.y * p.y / 70.0) * exp(-dot(p.xz, p.xz) / 2400.0);
  return s;
}

// the light that reaches here from every source and from the middle, and where most of it comes from
vec3 lights(vec3 p, out vec3 ld, out float far) {
  vec3 L = vec3(0.0), dir = vec3(0.0);
  float ds = 0.0, ws = 0.0001;
  for (int i = 0; i < 6; i++) {
    vec3 v = uSrcPos[i] - p;
    float d2 = dot(v, v);
    float a = uSrcPow[i] / (1.0 + d2 * 0.085);
    L += uSrcCol[i] * a;
    dir += v * inversesqrt(d2 + 0.01) * a;
    ds += sqrt(d2) * a;
    ws += a;
  }
  float d2 = dot(p, p);
  float a = uGather * 3.0 / (1.0 + d2 * 0.065);
  L += uMidCol * a;
  dir += -p * inversesqrt(d2 + 0.01) * a;
  ds += sqrt(d2) * a;
  ws += a;
  ld = normalize(dir + vec3(0.0, 0.001, 0.0));
  far = ds / ws;
  return L;
}

// whose colour this place is, with no light in it
vec3 hueAt(vec3 p) {
  vec3 c = vec3(0.0);
  float w = 0.0001;
  for (int i = 0; i < 6; i++) {
    vec3 v = p - uSrcPos[i];
    float k = uSrcOn[i] * exp(-dot(v, v) / (uSrcR[i] * uSrcR[i] * 2.4));
    c += uSrcCol[i] * k;
    w += k;
  }
  float k = uGather * exp(-dot(p, p) / 90.0);
  c += uMidCol * k;
  w += k;
  return c / w;
}
`;

/** A: a cloud with depth. Lit from inside by what it holds, shadowed by itself, with dark dust in front that gives nothing back. */
const FOG_A = /* glsl */ `
vec4 fog(vec3 ro, vec3 rd, float j) {
  float t = 7.0 + j * 1.5;
  vec3 C = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 44; i++) {
    if (i >= uSteps || t > 96.0 || T < 0.025) break;
    vec3 p = ro + rd * t;
    float dt = 0.8 + t * 0.03;
    float pr = pres(p);
    if (pr > 0.012) {
      float k = min(pr, 1.25);
      vec4 w = n4(p * 0.05 + vec3(0.0, uTime * 0.005, 0.0));
      vec3 q = p * 0.115 + (w.xyz - 0.5) * 1.9;
      float n = n1(q) * 0.47 + n1(q * 2.03 + 11.7) * 0.25 + n1(q * 4.01 + 3.1) * 0.15 + n1(q * 8.1 + 7.0) * 0.09;
      float lo = 0.53 - 0.23 * k;
      float d = smoothstep(lo, lo + 0.10, n) * min(1.0, pr * 1.7);
      // dust: takes light and gives none
      float nd = n1(q * 0.72 + 31.3) * 0.62 + n1(q * 1.61 + 5.5) * 0.38;
      float du = smoothstep(0.54, 0.66, nd) * smoothstep(0.03, 0.35, pr);
      if (d > 0.002) {
        vec3 ld;
        float far;
        vec3 L = lights(p, ld, far);
        vec3 qs = q + ld * 0.2;
        float ns = n1(qs) * 0.66 + n1(qs * 2.03 + 11.7) * 0.34;
        float sh = exp(-smoothstep(lo + 0.02, lo + 0.2, ns * 0.94) * min(far, 9.0) * 0.36);
        // thin places glow more than their share: light coming through the edge of a cloud
        float edge = 1.0 + 1.6 * (1.0 - smoothstep(0.0, 0.45, d));
        C += T * (L * (0.07 + 0.93 * sh) * edge + uAmb) * d * dt * 0.17;
        T *= exp(-d * dt * 0.26);
      }
      T *= exp(-du * dt * 0.62);
    }
    t += dt;
  }
  return vec4(C, T);
}
`;

/** B: ink let into water. No light and no shadow: thin skins that curl where ink meets water, a faint body inside them, each in its own colour. */
const FOG_B = /* glsl */ `
vec4 fog(vec3 ro, vec3 rd, float j) {
  float t = 8.0 + j * 1.2;
  vec3 C = vec3(0.0);
  float A = 0.0;
  for (int i = 0; i < 58; i++) {
    if (t > 94.0) break;
    vec3 p = ro + rd * t;
    float dt = 0.7 + t * 0.02;
    float pr = pres(p);
    if (pr > 0.012) {
      vec4 w1 = n4(p * 0.028 + vec3(0.0, 0.0, uTime * 0.004));
      vec4 w2 = n4(p * 0.058 + (w1.xyz - 0.5) * 2.4 + 9.0);
      float n = n1(p * 0.075 + (w2.xyz - 0.5) * 3.4);
      float skin = exp(-pow((n - 0.5) / 0.028, 2.0)) + 0.6 * exp(-pow((n - 0.64) / 0.02, 2.0));
      float body = smoothstep(0.5, 0.68, n) * 0.09;
      float d = (skin + body) * smoothstep(0.02, 0.5, pr);
      C += hueAt(p) * d * dt;
      A += d * dt;
    }
    t += dt;
  }
  float ink = 1.0 - exp(-A * 0.10);
  vec3 hue = C / max(A, 0.001);
  vec3 col = hue * ink * 0.30 + vec3(0.93, 0.92, 0.88) * pow(ink, 4.0) * 0.16;
  return vec4(col, 1.0 - 0.4 * ink);
}
`;

/** C: veils of light hanging in sheets, thin, with fine rays running up them; lit where something is. */
const FOG_C = /* glsl */ `
vec4 fog(vec3 ro, vec3 rd, float j) {
  float t = 7.0 + j * 1.3;
  vec3 C = vec3(0.0);
  for (int i = 0; i < 62; i++) {
    if (t > 96.0) break;
    vec3 p = ro + rd * t;
    float dt = 0.55 + t * 0.023;
    // a veil stands taller than what lights it
    float pr = pres(vec3(p.x, p.y * 0.45 + 1.5, p.z));
    if (pr > 0.01) {
      vec2 xz = p.xz * 0.085;
      vec4 w = n4(vec3(xz * 0.45, uTime * 0.008));
      vec2 u = xz + (w.xy - 0.5) * 1.5;
      float n = n1(vec3(u, 3.3));
      float sheet = pow(1.0 - abs(2.0 * n - 1.0), 24.0);
      float y0 = -5.0 + 6.0 * (w.z - 0.5);
      float h = p.y - y0;
      float prof = smoothstep(0.0, 6.5, h) * exp(-max(h - 4.0, 0.0) * 0.12);
      float ray = 0.3 + 0.7 * pow(n1(vec3(u * 14.0, 7.7)), 1.5);
      float d = sheet * prof * ray * smoothstep(0.02, 0.6, pr);
      if (d > 0.0015) {
        vec3 ld;
        float far;
        vec3 L = lights(p, ld, far) + uAmb * 1.6;
        // white-hot along the foot of the veil, its own colour higher up
        vec3 c = mix(vec3(dot(L, vec3(0.34))) * vec3(1.0, 0.98, 0.94), L, 0.5 + 0.5 * smoothstep(2.0, 8.0, h));
        C += c * d * dt * 0.42;
      }
    }
    t += dt;
  }
  return vec4(C, 1.0);
}
`;

/** D: fibres. Thin strands drawn out along the way things flow, winding in toward the middle. */
const FOG_D = /* glsl */ `
vec4 fog(vec3 ro, vec3 rd, float j) {
  float t = 7.0 + j * 1.4;
  vec3 C = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 42; i++) {
    if (t > 96.0 || T < 0.04) break;
    vec3 p = ro + rd * t;
    float dt = 0.8 + t * 0.032;
    float pr = pres(p);
    if (pr > 0.012) {
      float rl = length(p);
      vec3 dn = p / max(rl, 0.001);
      // turned further the further out: what comes in comes in along a spiral
      float tw = 0.95 * log(1.0 + rl * 0.22) + uTime * 0.01;
      float ct = cos(tw), st = sin(tw);
      dn.xz = mat2(ct, -st, st, ct) * dn.xz;
      vec4 w = n4(p * 0.04 + vec3(uTime * 0.004));
      vec3 q = dn * (6.6 + rl * 0.05) + (w.xyz - 0.5) * 0.8;
      float a = n1(q), b = n1(q * 2.1 + 17.3);
      float r1 = 1.0 - abs(2.0 * a - 1.0), r2 = 1.0 - abs(2.0 * b - 1.0);
      float fil = pow(r1, 30.0) * 0.45 + pow(r1 * r2, 14.0) * 2.4;
      float haze = smoothstep(0.5, 0.9, n1(p * 0.06 + 3.0)) * 0.012;
      float d = (fil + haze) * min(1.0, pr * 1.5) * (0.3 + 0.7 * smoothstep(0.0, 10.0, rl));
      if (d > 0.002) {
        vec3 ld;
        float far;
        vec3 L = lights(p, ld, far);
        C += T * (L + uAmb * 0.8) * d * dt * 0.135;
        T *= exp(-d * dt * 0.05);
      }
    }
    t += dt;
  }
  return vec4(C, T);
}
`;

const FOG_MAIN = /* glsl */ `
void main() {
  vec4 f = uInvPV * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(f.xyz / f.w - uCam);
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = fog(uCam, rd, j);
}
`;

/**
 * The night sky from inside the galaxy, worked out for every pixel from where it looks: stars everywhere, more of
 * them toward the band; along the band the light of stars too many and too far to be told apart, gathered into
 * clouds, warm toward the middle of the galaxy and cooler away from it; the great rift of dust down the middle of
 * it and finer lanes branching off, which hide both the glow and the stars and let a warmer light through at
 * their edges; and gas glowing here and there along the plane. The grains of the band lie over this.
 */
export const MILKY_F = /* glsl */ `
varying vec2 vUv;
uniform mat4 uInvPV;
uniform vec3 uCam;
uniform vec3 uGalU;
uniform vec3 uGalV;
uniform vec3 uGas;
uniform float uOn;
uniform sampler2D tMap;
uniform float uReal;
uniform float uFine;
uniform vec3 uSrcPos[16];
uniform vec3 uSrcCol[16];
uniform float uSrcOn[16];
${NOISE}
float fb(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * n1(p); p = p * 2.03 + vec3(7.1, 3.3, 5.7); a *= 0.5; }
  return s;
}
float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float stars(vec2 sp, float s, float dens, float seed) {
  vec2 c = floor(sp * s);
  float h = h21(c + seed);
  if (h > dens) return 0.0;
  vec2 fr = fract(sp * s) - 0.5;
  vec2 o = vec2(h21(c + seed + 7.1), h21(c + seed + 13.7)) - 0.5;
  float r = length(fr - o * 0.6);
  return smoothstep(0.34, 0.0, r) * (0.22 + 2.4 * pow(h21(c + seed + 3.3), 6.0));
}
void main() {
  if (uOn < 0.004) discard;
  vec4 f = uInvPV * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(f.xyz / f.w - uCam);
  // the sky is as far off as the grains of the band are, round the same middle, so the two lie on one another
  float bq = dot(uCam, rd);
  vec3 at = normalize(uCam + rd * (-bq + sqrt(max(bq * bq - dot(uCam, uCam) + 61.0 * 61.0, 0.0))));
  // where a source is, the galaxy's own light there takes its colour (so its dust still runs through the colour, and
  // the colour is of the galaxy and not laid over it)
  vec3 hue = vec3(0.0);
  for (int i = 0; i < 16; i++) hue += uSrcCol[i] * (uSrcOn[i] * exp(-(1.0 - dot(at, normalize(uSrcPos[i]))) / 0.0030));
  vec3 gd = vec3(dot(at, uGalU), dot(at, uGalV), dot(at, cross(uGalU, uGalV)));
  float l = atan(gd.y, gd.x);
  float b = asin(clamp(gd.z, -1.0, 1.0));
  float al = abs(l);
  float disc = exp(-abs(b) / (0.085 + 0.07 * exp(-al / 0.8))) * (0.16 + 0.84 * exp(-al / 1.15));
  float bulge = exp(-(l * l / 0.105 + b * b / 0.036)) * 1.25;
  if (uReal > 0.5) {
    // as it was measured: the glow of the galaxy made from Gaia's stars, with its own dust and its own colours;
    // under it only the faintest stars are made up (the ones that can be seen by eye are the catalogue's, drawn apart)
    // (seen as through a wide lens, 2.2 times as much sky to the degree, so the band crosses the picture as it does in
    // a photograph of the night sky and does not fill it)
    float lw = l * 2.2, bw = b * 2.2;
    float within = (1.0 - smoothstep(2.9, 3.14, abs(lw))) * (1.0 - smoothstep(1.35, 1.57, abs(bw)));
    vec3 m = pow(texture2D(tMap, vec2(0.5 - lw / 6.2831853, 0.5 - bw / 3.14159265)).rgb, vec3(2.2));
    m = max(m - 0.06, 0.0) * 0.55 * within;
    if (uFine > 0.5) {
      // (the settled way) the galaxy keeps the colours it was measured in, everywhere and on every page: nothing is
      // laid over it and none of it is tinted. Where a source has been found its light is a little brighter, and
      // that is all; how far that reaches is ragged, further where the sky's own grain lets it, so it has no round edge
      vec3 q = at * 7.0;
      float w2 = fb(q * 3.7 + 9.7);
      float reach = 0.0014 + 0.0110 * smoothstep(0.30, 0.70, fb(q + 3.1)) * (0.4 + 1.2 * w2);
      float amt = 0.0;
      for (int i = 0; i < 16; i++) amt += uSrcOn[i] * exp(-(1.0 - dot(at, normalize(uSrcPos[i]))) / reach);
      m *= 1.0 + 0.18 * (1.0 - exp(-amt * 2.0)) * (0.45 + 0.55 * smoothstep(0.25, 0.75, w2));
    } else m += (m * 0.9 + 0.006 * within) * min(hue, vec3(1.0));
    vec2 sq = vec2(l, b);
    float dn = clamp(0.06 + 2.4 * dot(m, vec3(0.3, 0.6, 0.1)), 0.0, 0.9);
    float fs = stars(sq, 620.0, dn, 2.0) * 0.4 + stars(sq, 1040.0, dn, 3.0) * 0.3;
    gl_FragColor = vec4(clamp(m + mix(vec3(1.0, 0.86, 0.66), vec3(0.80, 0.90, 1.0), h21(floor(sq * 620.0) + 5.0)) * fs * 0.4, 0.0, 6.0) * uOn, 1.0);
    return;
  }
  vec3 q = gd * vec3(6.0, 6.0, 10.0);
  float c1 = fb(q + 3.1);
  float c2 = fb(q * 2.6 + 9.7);
  float glow = (disc + bulge) * (0.4 + 1.2 * c1) * (0.55 + 0.9 * c2);
  float lane = b - (0.03 + 0.05 * sin(l * 2.3 + 0.4)) - 0.12 * (fb(q * 0.8 + 21.0) - 0.48);
  float rift = (1.0 - smoothstep(0.0, 0.05 + 0.035 * c2, abs(lane))) * smoothstep(-0.5, -0.15, l) * (1.0 - smoothstep(1.25, 1.6, l));
  float web = pow(clamp(1.0 - abs(2.0 * fb(q * 1.7 + 40.0) - 0.96), 0.0, 1.0), 5.0) * exp(-abs(b) / 0.11) * (0.45 + 0.55 * exp(-al / 0.9));
  float dust = clamp(rift * 0.95 + web * 0.9, 0.0, 1.0);
  float core = exp(-(l * l / 0.5 + b * b / 0.08));
  vec3 warm = vec3(1.0, 0.86, 0.66);
  vec3 cool = vec3(0.80, 0.90, 1.0);
  vec3 col = mix(cool, warm, clamp(core * 1.3, 0.0, 1.0)) * glow;
  float gas = smoothstep(0.6, 0.78, fb(q * 1.3 + 70.0)) * exp(-abs(b) / 0.07) * (0.3 + 0.7 * exp(-al / 1.4));
  col += uGas * gas * 0.4 * (disc * 2.0 + 0.2);
  col *= 1.0 - 0.9 * dust;
  col += vec3(0.6, 0.38, 0.22) * dust * (1.0 - dust) * glow * 1.1;
  col += (col * 0.9 + 0.04) * min(hue, vec3(1.0));
  vec2 sp = vec2(l, b);
  float dens = clamp(0.10 + 0.6 * disc + 0.3 * bulge, 0.0, 0.92);
  float st = stars(sp, 240.0, dens * 0.5, 1.0) + stars(sp, 520.0, dens, 2.0) * 0.6 + stars(sp, 980.0, dens, 3.0) * 0.36;
  st *= 1.0 - 0.8 * dust;
  vec3 sc = mix(warm, cool, h21(floor(sp * 520.0) + 5.0));
  gl_FragColor = vec4(clamp(col * 0.13 + sc * st * 0.5, 0.0, 6.0) * uOn, 1.0);
}
`;

/**
 * The ground of a world as a small galaxy with depth to it (uNet 2), under its grains: its own light, brightest at the
 * middle and along two arms; everyone on it lighting it round them in their colour; and dust, in lanes between the
 * arms and finer threads, which hides both the light and a little of the sky behind.
 */
export const DISC_V = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
export const DISC_F = /* glsl */ `
varying vec2 vP;
uniform vec4 uNode[32];
uniform float uNodeN;
uniform float uOn;
uniform float uTurn;
uniform float uTime;
${NOISE}
float fb(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * n1(p); p = p * 2.03 + vec3(7.1, 3.3, 5.7); a *= 0.5; }
  return s;
}
void main() {
  vec2 p = vP * 11.0;
  float r = length(p);
  if (r > 11.0 || uOn < 0.004) discard;
  float th = atan(p.y, p.x);
  float ph = 2.0 * (th - uTurn) - 3.3 * log(r + 0.3);
  float arm = pow(0.5 + 0.5 * cos(ph), 2.0);
  float disc = exp(-r / 3.4) * (0.45 + 0.95 * arm) + exp(-r * r / 2.4) * 0.8;
  vec3 q = vec3(p * 0.42, uTime * 0.01);
  float n = fb(q + 3.0);
  float n2 = fb(q * 2.4 + 9.0);
  vec3 lit = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (float(i) >= uNodeN) break;
    vec2 v = p - uNode[i].xy;
    float w = uNode[i].z;
    vec3 hue = uNode[i].w < 0.5 ? vec3(1.0, 0.93, 0.82) : uNode[i].w < 1.5 ? vec3(1.0, 0.74, 0.42) : uNode[i].w < 2.5 ? vec3(0.42, 0.86, 0.8) : vec3(0.74, 0.66, 1.0);
    lit += hue * w * exp(-dot(v, v) / (0.5 + 2.4 * w));
  }
  float lane = pow(0.5 + 0.5 * cos(ph + 1.9), 4.0) * smoothstep(1.0, 3.0, r);
  float web = pow(clamp(1.0 - abs(2.0 * n2 - 0.96), 0.0, 1.0), 5.0);
  float edge = 1.0 - smoothstep(8.0, 11.0, r);
  float dust = clamp(lane * (0.4 + 1.1 * n) * 0.9 + web * 0.65, 0.0, 1.0) * edge;
  vec3 col = (vec3(1.0, 0.9, 0.74) * disc * (0.45 + 1.1 * n) * 0.11 + lit * 0.3 * (0.55 + 0.9 * n)) * (1.0 - 0.86 * dust);
  gl_FragColor = vec4(col * edge * uOn, clamp(dust * 0.5 * (0.35 + disc), 0.0, 0.65) * edge * uOn);
}
`;

/** The stars that can be seen by eye, from the catalogue: each where it is, as bright as it is, in its own colour. */
export const CAT_V = /* glsl */ `
attribute vec4 aStar;
uniform vec3 uGal;
uniform vec3 uGalU;
uniform vec3 uGalV;
uniform float uOn;
uniform float uPx;
uniform float uTime;
varying vec3 vC;
varying float vA;
void main() {
  // (through the same wide lens as the glow)
  float l = aStar.x / 2.2, b = aStar.y / 2.2;
  vec3 dir = cos(b) * (cos(l) * uGalU + sin(l) * uGalV) + sin(b) * cross(uGalU, uGalV);
  gl_Position = projectionMatrix * viewMatrix * vec4(uGal + dir * 61.0, 1.0);
  // its light, with a star of the first magnitude as one
  float f = pow(10.0, -0.4 * (aStar.z - 1.0));
  // (they are not still: each flickers a little in its own time)
  vA = clamp(0.35 + 1.1 * pow(f, 0.45), 0.0, 3.0) * uOn * (0.8 + 0.2 * sin(uTime * (0.7 + 1.9 * fract(aStar.x * 91.7)) + aStar.y * 157.0));
  float t = clamp((aStar.w + 0.3) / 1.9, 0.0, 1.0);
  vC = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.74, 0.5), t);
  gl_PointSize = clamp(1.4 + 2.6 * pow(f, 0.33), 1.2, 9.0) * uPx;
}
`;
export const CAT_F = /* glsl */ `
varying vec3 vC;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(vC * vA * (exp(-d * d * 5.0) + exp(-d * d * 40.0) * 1.2), 1.0);
}
`;

export const FOGS = [FOG_A, FOG_B, FOG_C, FOG_D].map((f) => FOG_HEAD + f + FOG_MAIN);
/** The cloud with depth, for however many sources there are. */
// (with many sources close together each is lit by its own light and little else, so each keeps its own colour)
export const cloudOf = (n: number, k = 0) => FOGS[k]!.split("[6]").join(`[${n}]`).split("i < 6;").join(`i < ${n};`).split("d2 * 0.085").join("d2 * 0.42");

/** The small cube of random numbers every cloud is made from, the same every time. */
export function noiseCube() {
  const n = 64;
  let a = 11;
  const data = new Uint8Array(n * n * n * 4);
  for (let i = 0; i < data.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    data[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
  }
  const tex = new THREE.Data3DTexture(data, n, n, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------------------------------- what is common

/** The cloud, made at half size, laid down first. */
export const BACK_F = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tFog;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uGain;
void main() {
  // through a small blur, so the grain of how it was made does not show
  vec2 px = 1.0 / uRes;
  vec2 lo = uRect.xy + px, hi = uRect.xy + uRect.zw - px;
  vec2 u = uRect.xy + vUv * uRect.zw;
  vec3 c = texture2D(tFog, clamp(u, lo, hi)).rgb * 0.25;
  c += (texture2D(tFog, clamp(u + vec2(px.x, 0.0), lo, hi)).rgb + texture2D(tFog, clamp(u - vec2(px.x, 0.0), lo, hi)).rgb + texture2D(tFog, clamp(u + vec2(0.0, px.y), lo, hi)).rgb + texture2D(tFog, clamp(u - vec2(0.0, px.y), lo, hi)).rgb) * 0.125;
  c += (texture2D(tFog, clamp(u + px, lo, hi)).rgb + texture2D(tFog, clamp(u - px, lo, hi)).rgb + texture2D(tFog, clamp(u + vec2(px.x, -px.y), lo, hi)).rgb + texture2D(tFog, clamp(u + vec2(-px.x, px.y), lo, hi)).rgb) * 0.0625;
  gl_FragColor = vec4(c * uGain, 1.0);
}
`;
