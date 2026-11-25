import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BACK_F, CAT_F, CAT_V, DISC_F, DISC_V, MILKY_F, TRI_V, cloudOf, noiseCube } from "./glsl";

/**
 * The matter of a world: a quarter of a million grains whose places live in a texture and are moved on the GPU every
 * frame, so the picture flows by itself whether or not the camera moves.
 *
 * Every grain belongs to one body and has a rank inside it. A body is a few numbers in a small texture (where it is,
 * how full it is, how settled its form is, how much is happening to it); the page only ever changes those numbers. A
 * grain whose rank is under its body's fullness heads for its place in the body's form (which itself turns and
 * flows), carried on a divergence-free flow so nothing ever sits still; a grain not yet called waits out in the cloud
 * of the source it will come from. Growth is fullness rising: grains leave their source and stream in.
 *
 * Kinds of body: 0 a person or an organisation (a cloud that settles into rings), 1 a tie (a braided arc, matter
 * running along it), 2 a crowd (a stretch of the outer belt), 3 the ground of the world (the disc), 4 the line of
 * time (the outer ring), 5 the dust of deep space.
 */

export const BODIES = 256;
const ROWS = 5;
export const SOURCES = 16;

const HASH = /* glsl */ `
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
vec4 hash4(uint n){ uint a = pcg(n); uint b = pcg(a); uint c = pcg(b); uint d = pcg(c); return vec4(float(a), float(b), float(c), float(d)) / 4294967295.0; }
`;

const SIM = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tPos;
uniform sampler2D tSeat;
uniform sampler2D tBody;
uniform vec3 uSrc[${SOURCES}];
uniform float uTime;
uniform float uDt;
uniform float uSpin;
uniform float uSnap;
uniform float uSize;
uniform int uForm;
uniform int uOpen;
uniform vec3 uGal;
uniform vec3 uGalU;
uniform vec3 uGalV;
uniform sampler2D tGal;
uniform float uReal;
uniform int uTrans;
uniform float uSqueeze;
uniform int uNet;
uniform float uBodyN;
uniform float uSrcU[${SOURCES}];
uniform float uSrcOn[${SOURCES}];
uniform float uSrcRead[${SOURCES}];
uniform float uType;
uniform float uKeep;
uniform float uSrcN;
${HASH}
const float TAU = 6.28318530718;

// a divergence-free flow: three Arnold–Beltrami–Childress fields at different scales, each drifting in time
vec3 abc(vec3 p){ return vec3(sin(p.z) + cos(p.y), sin(p.x) + cos(p.z), sin(p.y) + cos(p.x)); }
vec3 flow(vec3 p, float t){
  vec3 v = abc(p * 0.5 + vec3(0.0, t * 0.07, 1.7));
  v += 0.6 * abc(p.yzx * 1.1 + vec3(t * 0.11, 2.3, 0.0)).zxy;
  v += 0.35 * abc(p.zxy * 2.6 + vec3(4.1, 0.0, t * 0.19)).yzx;
  return v;
}
float gauss(vec4 g){ return g.x + g.y + g.z - 1.5; }

// Where a grain is before it is called into the world. Matter no one has named lies in a far band. Matter that will
// come from a source is first scattered everywhere; once its source is found it draws into that source's own form
// (a spiral, a barred spiral, a ring, a ragged cloud, a shell of strands); once it has been read it leaves for the
// cloud in the middle, where everything gathered waits, turning, not yet a world.
vec3 scattered(vec4 h, vec4 g, float t){
  float a = h.x * TAU + t * 0.004;
  float r = 3.0 + 25.0 * sqrt(h.y);
  vec3 p = vec3(r * cos(a), gauss(g) * 7.5, r * sin(a));
  return p + 2.6 * abc(p * 0.19 + 3.1);
}
vec3 gathered(vec4 h, vec4 g, float t){
  float r = 0.5 + 4.7 * pow(h.y, 0.8);
  float a = h.x * TAU + t * 0.11 / (0.6 + r * 0.35);
  vec3 p = vec3(r * cos(a), gauss(g) * (1.9 - 0.26 * r), r * sin(a));
  // other ways it gathers (uTrans): 1, a thin disc turning fast round a well, as matter falling in does; 2, it can be
  // drawn in to almost nothing (uSqueeze) before it is let go
  if (uTrans == 1) {
    // most of it is close in, so the middle is bright and there is no hole in it; it turns as anything in orbit does, far
    // faster inside than out; and it winds, in two arms that trail
    float rr = 0.14 + 5.4 * pow(h.y, 1.8);
    float w = h.x * TAU + t * 1.15 / (0.3 + 0.55 * pow(rr, 1.5));
    w -= 0.42 * sin(2.0 * (w - t * 0.06) + 2.6 * log(rr + 0.25));
    p = vec3(rr * cos(w), gauss(g) * (0.05 + 0.045 * rr), rr * sin(w));
    return p + 0.12 * abc(p * 0.45 + vec3(0.0, t * 0.03, 2.0));
  }
  return (p + 0.85 * abc(p * 0.45 + vec3(0.0, t * 0.03, 2.0))) * (1.0 - 0.86 * uSqueeze);
}
// everything that could be known, as the galaxy is seen from inside it (uOpen 1): the band of the Milky Way across
// the sky, laid out as it really lies (l along the band from the middle of the galaxy, b across it): the bulge
// toward the middle, the band thinner and fainter the further round, the great rift of dark dust down it from
// Cygnus to the middle, the Coalsack, and the two Magellanic Clouds off to one side. Every source has its own
// stretch near the middle; so the band is whole while nothing has been read and thins as the world is drawn out
// of it. xyz: where; w: how far this grain is its source's own (only those draw together when it is found)
vec4 galaxy(float src, vec4 h, vec4 g){
  float fi = floor(src + 0.5);
  float l0 = (fract(fi * 0.61803 + 0.37) - 0.5) * 1.5;
  float tx = g.x + h.x - 1.0;
  float ty = g.y + h.y - 1.0;
  float l, b, own = 1.0;
  if (uReal > 0.5) {
    // as it was measured: a place drawn from the glow of the real galaxy (more where it is brighter); places are kept
    // in order along the galaxy, so a source's own grains are the ones near its place in that order
    float u = h.z < 0.6 ? uSrcU[int(fi)] + tx * 0.035 : g.z;
    float idx = floor(clamp(u, 0.0, 0.99998) * 65536.0);
    vec2 lb = texelFetch(tGal, ivec2(int(mod(idx, 256.0)), int(idx / 256.0)), 0).xy / 2.2 + (vec2(g.y, g.w) - 0.5) * 0.008;
    vec3 nr = cross(uGalU, uGalV);
    return vec4(uGal + (cos(lb.y) * (cos(lb.x) * uGalU + sin(lb.x) * uGalV) + sin(lb.y) * nr) * (56.0 + 10.0 * h.w), h.z < 0.6 ? 1.0 : 0.0);
  }
  if (h.z > 0.986) {
    l = -1.39 + tx * 0.10;
    b = -0.574 + ty * 0.08;
    own = 0.0;
  } else if (h.z > 0.979) {
    l = -1.0 + tx * 0.05;
    b = -0.773 + ty * 0.04;
    own = 0.0;
  } else if (h.z < 0.2) {
    l = tx * 0.40;
    b = ty * 0.21 * (1.0 - 0.45 * abs(tx));
    own = 0.5;
  } else if (h.z < 0.6) {
    l = l0 + tx * 0.36;
    b = (g.y + h.y + g.z - 1.5) * (0.05 + 0.10 * exp(-abs(l) / 0.6));
  } else {
    float u = g.z * 2.0 - 1.0;
    l = sign(u) * pow(abs(u), 1.5) * 3.14159265;
    b = (g.y + h.y + g.w - 1.5) * (0.04 + 0.09 * exp(-abs(l) / 0.7));
    own = 0.0;
  }
  // star clouds: thicker in places along the band
  l += 0.05 * sin(l * 9.0 + 1.0);
  // the great rift: grains are off the lane of dust
  float along = smoothstep(-0.4, -0.15, l) * (1.0 - smoothstep(1.2, 1.5, l));
  float d = b - (0.035 + 0.05 * sin(l * 2.3 + 0.4));
  b += along * sign(d) * max(0.0, 0.026 + 0.018 * sin(l * 5.1 + 1.0) - abs(d)) * 1.15;
  // the Coalsack
  vec2 cs = vec2(l + 1.0, b + 0.005);
  float cd = length(cs);
  if (cd < 0.07) {
    cs *= 0.07 / max(cd, 0.001);
    l = -1.0 + cs.x;
    b = -0.005 + cs.y;
  }
  vec3 n = cross(uGalU, uGalV);
  return vec4(uGal + (cos(b) * (cos(l) * uGalU + sin(l) * uGalV) + sin(b) * n) * (56.0 + 10.0 * h.w), own);
}
vec3 sourceForm(float src, vec4 h, vec4 g, float t){
  // in the galaxy a source is not a thing of its own: its grains stay where the galaxy has them, along its stretch of the band
  if (uOpen >= 1) return galaxy(src, h, g).xyz;
  float ty = mod(src, 6.0);
  float turn = t * 0.03;
  vec3 q;
  if (ty < 2.5 && h.z < 0.13) {
    // the bright middle of a galaxy
    q = normalize(g.xyz * 2.0 - 1.0 + 1e-4) * 0.42 * pow(g.w, 0.7) * vec3(1.0, 0.6, 1.0);
  } else if (ty < 0.5) {
    // two long arms
    float r = 0.25 + 2.7 * pow(h.y, 0.75);
    float a = floor(h.x * 2.0) * 3.14159 + 2.3 * log(1.0 + r * 1.4) + gauss(g) * 0.42 / (0.5 + r) + turn;
    q = vec3(r * cos(a), gauss(g.yzwx) * 0.1, r * sin(a));
  } else if (ty < 1.5) {
    // four ragged arms
    float r = 0.25 + 2.5 * pow(h.y, 0.7);
    float a = floor(h.x * 4.0) * 1.5708 + 1.5 * log(1.0 + r * 1.6) + gauss(g) * 0.95 / (0.6 + r) + turn;
    q = vec3(r * cos(a), gauss(g.yzwx) * 0.14, r * sin(a));
  } else if (ty < 2.5) {
    // a bar, an arm from each end
    if (h.w < 0.34) {
      q = vec3((h.x * 2.0 - 1.0) * 1.15, gauss(g.yzwx) * 0.09, gauss(g) * 0.17);
    } else {
      float r = 1.15 + 1.8 * pow(h.y, 0.8);
      float a = floor(h.x * 2.0) * 3.14159 + 1.25 * (r - 1.15) + gauss(g) * 0.3 / r;
      q = vec3(r * cos(a), gauss(g.yzwx) * 0.1, r * sin(a));
    }
    q.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * q.xz;
  } else if (ty < 3.5) {
    // a ring, faint inside and a thin halo
    float a = h.x * TAU;
    float r = h.z < 0.16 ? 1.4 * h.y : h.z < 0.3 ? 2.2 + gauss(g) * 0.35 : 1.45 + gauss(g) * 0.24;
    q = vec3(r * cos(a) * 1.15, gauss(g.yzwx) * 0.24, r * sin(a));
  } else if (ty < 4.5) {
    // ragged: three lumps
    float k = floor(h.x * 3.0);
    vec3 o = vec3(sin(k * 2.4 + src) * 1.25, 0.25 * sin(k * 5.1), cos(k * 1.7 + src * 2.0) * 1.05);
    q = o + vec3(gauss(g), gauss(g.yzwx) * 0.5, gauss(g.zwxy)) * (0.78 - 0.16 * k);
  } else {
    // a shell of strands
    float j = floor(h.x * 9.0);
    float u = h.y;
    float a = j * 0.698 + u * 2.4 + sin(j * 1.3) * 0.5;
    float rr = 1.5 + 0.55 * sin(u * TAU + j * 1.9);
    q = vec3(rr * cos(a), (u - 0.5) * 2.6 + 0.3 * sin(a * 3.0 + j), rr * sin(a)) + vec3(gauss(g), gauss(g.yzwx), gauss(g.zwxy)) * 0.07;
  }
  float tl = 0.5 + src * 1.7;
  q.yz = mat2(cos(tl), -sin(tl), sin(tl), cos(tl)) * q.yz;
  float tz = 0.4 * sin(src * 2.1);
  q.xy = mat2(cos(tz), -sin(tz), sin(tz), cos(tz)) * q.xy;
  return uSrc[int(src + 0.5)] + q * (1.38 + 0.5 * fract(src * 0.37));
}
bool readIn(float src, float pick){
  return src > -0.5 && pick < max(uSrcRead[int(src + 0.5)], uType * 0.36);
}
// (11, the lie of a land, which was chosen: the same sheet as the deep wells of 6, less like a fountain and less
// round; the numbers are land.ts's, where they are said)
float landDeep(){ return uNet == 11 ? 0.62 : 1.0; }
float landWide(){ return uNet == 11 ? 1.3 : 1.0; }
// how much wider than round the well of body i is in a direction
float lobeAt(int i, float a){
  if (uNet != 11) return 1.0;
  float f = float(i) * 1.7;
  return 1.0 + 0.3 * (0.6 * sin(2.0 * a + f) + 0.4 * sin(3.0 * a + f * 2.3 + 1.0));
}
// how far the ground itself is above or below level, where no one is
float swell(vec2 xz){
  if (uNet != 11) return 0.0;
  return 0.32 * (sin(xz.x * 0.71 + 1.3) * sin(xz.y * 0.53 - 0.7) + 0.6 * sin(xz.x * 0.31 - xz.y * 0.47 + 2.1));
}
// how far out the edge of things is in a direction (an angle that does not turn with the world), as a share of round
float edge(float a){
  if (uNet != 11) return 1.0;
  return 1.0 + 0.13 * (0.55 * sin(2.0 * a + 0.8) + 0.3 * sin(3.0 * a + 2.4) + 0.15 * sin(5.0 * a + 0.3));
}
// the ground as a sheet (uNet 1 and 4 and up, which are ways of showing that sheet more plainly): how far down it is
// here, under the weight of everyone who is on it (the heavier, the deeper and the wider); from 4 what ties two
// is a valley between their wells; from 6 a well is a funnel, deeper and with long shallow sides, where it is a bowl otherwise;
// in 7 only you, whoever deals with you directly and whoever is being told about make a funnel, the rest a dent;
// in 9 there is one well, the deeper the more there is in it, with you at the bottom and everyone else in a pocket of their own in its side
float sheet(vec2 xz){
  float d = 0.0;
  float tot = 0.0;
  for (int i = 0; i < 160; i++) {
    if (float(i) >= uBodyN) break;
    vec4 b1 = texelFetch(tBody, ivec2(i, 1), 0);
    vec4 b0 = texelFetch(tBody, ivec2(i, 0), 0);
    if (b1.w < 0.5) {
      if (b1.x < 0.02) continue;
      vec2 v = xz - b0.xz;
      float sg = 0.5 + 0.95 * b0.w;
      float w = b1.x * (0.3 + 1.5 * b0.w);
      if (uNet == 7 && dot(b0.xz, b0.xz) > 13.7) w *= 0.2 + 0.8 * smoothstep(0.1, 0.6, texelFetch(tBody, ivec2(i, 3), 0).y);
      if (uNet == 9) {
        tot += b1.x;
        d += 0.45 * w * exp(-dot(v, v) / (0.55 * sg * sg));
        continue;
      }
      if (uNet == 11) {
        // (shallower, wider, and not round)
        float sw = sg * landWide() * (dot(v, v) > 1e-8 ? lobeAt(i, atan(v.y, v.x)) : 1.0);
        d += landDeep() * w * 1.7 / (1.0 + 2.2 * dot(v, v) / (sw * sw));
        continue;
      }
      d += uNet >= 6 ? w * 1.7 / (1.0 + 2.2 * dot(v, v) / (sg * sg)) : w * exp(-dot(v, v) / (sg * sg));
    } else if (b1.w < 1.5 && uNet >= 4 && b1.x > 0.5) {
      vec2 a = b0.xz;
      vec2 ab = texelFetch(tBody, ivec2(i, 2), 0).xz - a;
      // (7: only what ties someone to you is a valley)
      if (uNet == 7 && min(dot(a, a), dot(a + ab, a + ab)) > 0.6) continue;
      float tt = clamp(dot(xz - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
      vec2 v = xz - (a + ab * tt);
      d += (uNet == 11 ? 0.3 * (0.35 + 0.65 * landDeep()) : 0.3) * exp(-dot(v, v) / 0.07) * smoothstep(0.0, 0.2, tt) * smoothstep(1.0, 0.8, tt) * texelFetch(tBody, ivec2(i, 3), 0).x;
    }
  }
  if (uNet == 9) d += 3.6 * (1.0 - exp(-0.3 * tot)) / (1.0 + dot(xz, xz) / 11.0);
  return -d + swell(xz);
}
vec3 waiting(float src, vec4 h, vec4 g, float t, float pick){
  if (src < -0.5) {
    float a = h.x * TAU + t * 0.006;
    float r = 12.5 + 13.0 * h.y;
    return vec3(r * cos(a), gauss(g) * 3.2, r * sin(a));
  }
  if (readIn(src, pick)) return gathered(h, g, t);
  if (uOpen >= 1) {
    // found, a source's stretch of the band lights and its own grains draw a little together round its knot
    vec4 at = galaxy(src, h, g);
    return mix(at.xyz, mix(at.xyz, sourceForm(src, h, g, t), 0.3 * at.w), smoothstep(0.0, 1.0, uSrcOn[int(src + 0.5)]));
  }
  return mix(scattered(h, g, t), sourceForm(src, h, g, t), smoothstep(0.0, 1.0, uSrcOn[int(src + 0.5)]));
}

void main(){
  ivec2 fc = ivec2(gl_FragCoord.xy);
  uint id = uint(fc.x) + uint(fc.y) * uint(uSize);
  vec4 P = texelFetch(tPos, fc, 0);
  vec4 S = texelFetch(tSeat, fc, 0);
  int bi = int(S.x + 0.5);
  vec4 B0 = texelFetch(tBody, ivec2(bi, 0), 0);
  vec4 B1 = texelFetch(tBody, ivec2(bi, 1), 0);
  vec4 B2 = texelFetch(tBody, ivec2(bi, 2), 0);
  vec4 B3 = texelFetch(tBody, ivec2(bi, 3), 0);
  float kind = B1.w;
  vec4 h = hash4(id * 2u + 11u);
  vec4 g = hash4(id * 2u + 12u);
  float pick = hash4(id * 2u + 13u).x;
  float t = uTime;
  bool on = S.y < B1.x;
  vec3 tg;
  float glow = 0.0;
  bool jump = false;
  float calm = 1.0;

  if (kind > 4.5) {
    // deep dust: a wide slow volume
    on = true;
    vec3 dir = normalize(vec3(h.x, h.y, h.z) * 2.0 - 1.0 + 1e-4);
    float r = 6.0 + 32.0 * pow(h.w, 0.7);
    float a = t * 0.004;
    dir.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * dir.xz;
    tg = dir * r * vec3(1.0, 0.5, 1.0);
    // part of the dust belongs to the sources for good: once a source is found it gathers into that source's form
    // and stays there, so where everything came from is always in the sky
    if (g.z < uKeep * 0.5) {
      float ds = floor(g.x * uSrcN);
      tg = mix(tg, sourceForm(ds, h, g, t), smoothstep(0.0, 1.0, uSrcOn[int(ds + 0.5)]));
    }
  } else if (!on) {
    tg = waiting(S.z, h, g, t, pick);
  } else if (kind < 0.5) {
    // someone: a cloud round a small core; as their form settles the cloud draws into rings
    vec3 c = B0.xyz;
    float R = B0.w;
    vec3 n = normalize(B2.xyz);
    vec3 e1 = normalize(cross(n, vec3(1.0, 0.0, 0.31)));
    vec3 e2 = cross(n, e1);
    float form = B1.y;
    float K = max(1.0, B3.z);
    float phase = B2.w;
    if (h.z < 0.2) {
      vec3 dir = normalize(g.xyz * 2.0 - 1.0 + 1e-4);
      float a = phase * 1.4 + g.w * TAU;
      dir.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * dir.xz;
      // an organisation is many: three cores close together where a person has one
      if (B3.w > 0.5 && B3.w < 1.5) {
        float an = floor(g.x * 3.0) * 2.094 + phase * 0.3;
        tg = c + R * (0.2 * (cos(an) * e1 + sin(an) * e2) + 0.12 * pow(g.w, 0.55) * dir);
      } else tg = c + R * 0.21 * pow(g.w, 0.55) * dir;
    } else {
      float u = h.x;
      float rc = 0.26 + 0.96 * pow(u, 0.72);
      float yc = gauss(g) * 0.44 * (1.18 - u);
      float k = floor(h.w * K);
      bool org = B3.w > 0.5 && B3.w < 1.5;
      float rk = 0.44 + 0.74 * (k + 1.0) / K + (g.w - 0.5) * (org ? 0.17 : 0.03);
      float yk = (g.x - 0.5) * 0.018;
      float r = mix(rc, rk, form);
      float y = mix(yc, yk, form);
      float th = h.y * TAU + phase * (0.45 + 0.5 / (0.3 + r));
      vec3 at = r * (cos(th) * e1 + sin(th) * e2) + y * n;
      // the same matter settling another way: only where each grain ends up differs
      // (the whole network shown another way, uNet, has its own way for someone to be: in a well, a knot of stars, a star)
      int shape = uNet == 1 || uNet >= 4 ? 4 : uNet == 2 ? 2 : uNet == 3 ? 5 : uForm;
      // (7: only you, whoever deals with you directly and whoever is being told about have anything round them; 8: no one has)
      if (uNet == 8 || (uNet == 7 && length(c.xz) > 3.7 && B3.y < 0.3)) shape = 5;
      if (shape == 1) {
        // one thick disc: bands with gaps between, the grains drawn into fine rings
        float rd = 0.40 + 0.80 * (k + 0.1 + 0.78 * fract(h.w * K)) / K;
        rd += 0.011 * sin(rd * 118.0 + phase * 0.2);
        float yd = gauss(g) * 0.022 * (0.5 + rd) * (org ? 0.5 : 1.0);
        float rr = mix(rc, rd, form);
        float td = h.y * TAU + phase * (0.45 + 0.5 / (0.3 + rr));
        at = rr * (cos(td) * e1 + sin(td) * e2) + mix(yc, yd, form) * n;
      } else if (shape == 2) {
        // a cluster: shells round the core, no rings
        vec3 dir = normalize(g.xyz * 2.0 - 1.0 + 1e-4);
        float a = phase * (0.3 + 0.5 / (0.5 + k)) + h.y * TAU;
        dir.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * dir.xz;
        float rs = (0.34 + 0.72 * (k + 1.0) / K) * (0.8 + 0.4 * g.w);
        vec3 ball = rs * (dir.x * e1 + dir.z * e2 + dir.y * (org ? 0.38 : 0.7) * n);
        at = mix(rc * (cos(th) * e1 + sin(th) * e2) + yc * n, ball, form);
      } else if (shape == 3) {
        // each ring gathered into a head with a long tail behind it
        float behind = pow(h.y, 2.3) * TAU;
        float tt = k * 2.4 + phase * (0.45 + 0.5 / (0.3 + rk)) - behind;
        float rt = rk + (g.w - 0.5) * 0.05 * behind / TAU;
        vec3 comet = rt * (cos(tt) * e1 + sin(tt) * e2) + yk * n;
        at = mix(rc * (cos(th) * e1 + sin(th) * e2) + yc * n, comet, form);
      } else if (shape == 5) {
        // a star and nothing round it: everything it has, close in to its middle
        vec3 dr = normalize(g.xyz * 2.0 - 1.0 + 1e-4);
        at = mix(rc * (cos(th) * e1 + sin(th) * e2) + yc * n, dr * 0.3 * pow(g.w, 0.6), form);
      }
      tg = c + R * at;
      if (shape == 4) {
        // in a well: what it has circles the inside of the well it has made, faster the further down
        float rw = uNet == 9 ? 0.4 + 1.0 * pow(u, 0.7) : 0.55 + 2.0 * pow(u, 0.7);
        float tw = h.y * TAU + phase * (0.4 + 0.9 / (0.3 + rw * rw));
        if (uNet == 11) rw *= landWide() * 0.8 * lobeAt(bi, tw);
        vec2 xz = c.xz + R * rw * vec2(cos(tw), sin(tw));
        tg = mix(tg, vec3(xz.x, sheet(xz) + 0.05 + (g.x - 0.5) * 0.05, xz.y), form);
      }
      calm = mix(1.0, 0.28, form);
    }
  } else if (kind < 1.5) {
    // a tie: an arc lifted over the plane, grains running along it in a braid
    vec3 A = B0.xyz;
    vec3 Bp = B2.xyz;
    float front = B3.x;
    float u0 = fract(h.x + t * 0.05 * (0.6 + 0.8 * h.y));
    float u = u0 * front;
    vec3 ctrl = 0.5 * (A + Bp) + vec3(0.0, B2.w, 0.0);
    vec3 p = mix(mix(A, ctrl, u), mix(ctrl, Bp, u), u);
    vec3 tn = normalize(mix(ctrl - A, Bp - ctrl, u) + 1e-5);
    vec3 s1 = normalize(cross(tn, vec3(0.0, 1.0, 0.13)));
    vec3 s2 = cross(tn, s1);
    float pulse = B3.z * exp(-pow((u - B3.y) / 0.07, 2.0));
    float head = (1.0 - step(0.999, front)) * exp(-pow((u - front) / 0.06, 2.0));
    float ang = h.z * TAU + t * 0.5 + u * 10.0;
    float rad = B0.w * (0.2 + 0.8 * sqrt(h.w)) * (1.0 + 2.4 * pulse);
    tg = p + rad * (cos(ang) * s1 + sin(ang) * s2);
    // (4, 5, 6: it does not arch over the ground; it runs along the floor of the valley between the two)
    if (uNet >= 4) tg.y = sheet(tg.xz) + 0.03 + 0.5 * rad;
    glow = max(pulse, head * 0.8);
    jump = true;
    calm = 0.35;
  } else if (kind < 2.5) {
    // a crowd: a stretch of the outer belt, gathered in small clumps; those reached glow
    float a = mix(B0.x, B0.y, h.x);
    float m = floor(h.x * B3.x);
    float ac = mix(B0.x, B0.y, (m + 0.5) / max(1.0, B3.x));
    a = mix(a, ac + gauss(g) * 0.5 * (B0.y - B0.x) / max(1.0, B3.x), step(h.z, 0.62));
    a += uSpin + 0.02 * sin(t * 0.13 + h.y * TAU);
    float rr = (B0.z + B0.w * gauss(g.yzwx) * 0.9) * edge(a - uSpin);
    float y = B2.x + B2.y * gauss(g.zwxy);
    tg = vec3(rr * cos(a), y, rr * sin(a));
    glow = step(h.y, B2.z) * 0.42;
  } else if (kind < 3.5) {
    // the ground of the world: a disc turning faster inside, with lanes cleared where people orbit
    float rr = mix(1.2, 7.9, pow(S.w, 0.78)) + (g.w - 0.5) * 0.12;
    vec3 lanes = vec3(B3.x, B3.y, B3.z);
    for (int i = 0; i < 3; i++) { float dd = rr - lanes[i]; rr += 0.2 * sign(dd) * exp(-dd * dd / 0.1); }
    float fi = floor(max(0.0, S.y - B0.y) / max(1e-4, 1.0 - B0.y) * B0.x);
    float fa = float(pcg(uint(fi) + 913u) % 6283u) / 1000.0;
    // (each fact's share lies round the angle of its own; a ground with no facts on it has all of it lying all the way
    // round, as the rest does, not on the one angle that a count of nothing would give every grain)
    float th0 = S.y < B0.y || B0.x < 0.5 ? h.y * TAU : fa + (h.y - 0.5) * 1.1;
    float th = th0 + t * 0.22 / pow(rr, 1.3) + uSpin;
    // two arms: matter bunches along a spiral that turns slowly with the world
    th -= (uNet == 7 || uNet == 8 ? 0.0 : 0.36) * sin(2.0 * (th - uSpin - t * 0.03) - 3.3 * log(rr));
    float y = gauss(g) * (0.045 * (1.0 + 0.1 * rr) + 0.2 * smoothstep(2.4, 1.2, rr));
    if (uNet == 11) {
      // (it lies in uneven bands, not in even rings, and its edge is not a circle)
      rr += 0.3 * sin(3.0 * (th - uSpin) + rr * 1.7) * smoothstep(1.6, 3.2, rr);
      rr *= mix(1.0, edge(th - uSpin), smoothstep(2.5, 7.9, rr));
    }
    tg = vec3(rr * cos(th), y, rr * sin(th));
    if (uNet == 8) {
      // (8) the sheet is a net: its grains lie in rings round the middle and in spokes out from it, so the way it is pulled down shows
      float a8, r8;
      if (h.z < 0.52) {
        r8 = 0.8 + 0.52 * floor(h.x * 18.0);
        a8 = h.y * TAU;
      } else {
        a8 = floor(h.x * 40.0) * TAU / 40.0;
        r8 = 0.8 + 9.0 * h.y;
      }
      a8 += uSpin * 0.5;
      tg = vec3(r8 * cos(a8), 0.0, r8 * sin(a8));
    }
    // (uNet 1: the ground is a sheet that whoever is on it weighs down; 2: it has depth of its own)
    if (uNet == 1 || uNet >= 4) {
      if (uNet == 5 && h.z < 0.78) {
        // (5) most of the sheet's grains lie along lines of equal depth, closer together where it is steeper: the shape of the ground can be read off them
        float d0 = -sheet(tg.xz);
        vec2 gr = vec2(-sheet(tg.xz + vec2(0.06, 0.0)) - d0, -sheet(tg.xz + vec2(0.0, 0.06)) - d0) / 0.06;
        float g2 = dot(gr, gr);
        if (g2 > 0.0004) tg.xz -= gr * clamp((d0 - (floor(d0 / 0.2) + 0.5) * 0.2) / g2, -0.45, 0.45);
      }
      tg.y += sheet(tg.xz);
    } else if (uNet == 2) tg.y = gauss(g) * (0.2 + 0.03 * rr);
  } else {
    // the line of time: a fine ring; the part already lived glows
    float th = S.y * TAU + B0.x;
    float rr = B0.w + (g.x - 0.5) * 0.045;
    if (uNet == 11) rr *= 1.04 + 0.4 * (edge(th) - 1.0);
    tg = vec3(rr * cos(th), (g.y - 0.5) * 0.03, rr * sin(th));
    glow = step(S.y, B3.x) * 0.5 + exp(-pow((S.y - B3.x) / 0.006, 2.0)) * B3.y;
    calm = 0.2;
  }

  vec3 p = P.xyz;
  float heat = P.w;
  vec3 d = tg - p;
  float L = length(d) + 1e-6;
  if (uSnap > 0.5 || (jump && L > 0.9)) {
    p = tg;
    heat = glow;
  } else {
    vec3 dir = d / L;
    float sp;
    bool called = on || (kind < 4.5 && readIn(S.z, pick));
    if (called) {
      // from far away, fall in on a slow spiral at a speed of one's own; close by, settle
      float far = smoothstep(1.2, 8.0, L);
      // (into a well, uTrans 1, what is not yet anyone's winds in on a long tight spiral, faster the nearer it comes)
      // (from far off it falls almost straight, as a shooting star does, and fast; nearer, it is caught and winds in, faster still)
      float well = uTrans == 1 && !on ? 1.0 : 0.0;
      float swirl = mix(0.6, mix(2.4, 0.3, smoothstep(9.0, 24.0, L)), well) * far;
      dir = normalize(dir + swirl * normalize(cross(vec3(0.0, 1.0, 0.0), dir) + 1e-4));
      sp = min(L * 6.0, (4.0 + 5.0 * h.x) * (1.0 + well * (0.9 + 1.6 * exp(-L / 10.0))));
    } else {
      float fnd = kind < 4.5 && S.z > -0.5 ? uSrcOn[int(S.z + 0.5)] : 0.0;
      sp = kind < 4.5 && S.z > -0.5 ? min(L * 1.6, 3.0 + 4.0 * h.x + fnd * (5.0 + 7.0 * h.y)) : min(L * 0.7, 2.0);
    }
    p += dir * min(L, sp * uDt);
    float amp = kind > 4.5 ? 0.05 : on ? (0.1 + 0.3 * smoothstep(0.5, 6.0, L)) * calm : called ? 0.12 : 0.14;
    p += flow(p, t) * amp * uDt;
    heat = max(heat - uDt * 0.55, 0.0);
    if (called && kind < 4.5) heat = max(heat, smoothstep(0.7, 3.0, L) * (on ? 0.9 : 0.6));
    heat = max(heat, glow);
  }
  gl_FragColor = vec4(p, heat);
}
`;

const DRAW_V = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tPos;
uniform sampler2D tSeat;
uniform sampler2D tBody;
uniform float uPx;
uniform float uFocus;
uniform float uAper;
uniform float uTime;
uniform float uSize;
uniform vec3 uWave;
uniform vec2 uSpot;
uniform float uGain;
uniform float uSrcRead[${SOURCES}];
uniform float uSrcOn[${SOURCES}];
uniform float uType;
uniform float uKeep;
uniform float uSrcN;
uniform vec2 uSpotB;
uniform float uLift;
uniform float uBack;
uniform float uVol;
uniform float uSky;
uniform int uNet;
uniform float uFine;
uniform float uExpo;
varying float vA;
varying vec3 vC;
varying float vBlur;
${HASH}
// the colour of where something came from, one of three: amber, teal, violet; in the settled way, where the galaxy
// keeps the colours it was measured in, amber and two whites, a cold one and a warm one
vec3 srcTint(float hue){
  if (uFine > 0.5) return hue < 0.5 ? vec3(1.0, 0.74, 0.5) : hue < 1.5 ? vec3(0.80, 0.86, 1.0) : vec3(1.0, 0.90, 0.78);
  return hue < 0.5 ? vec3(1.0, 0.74, 0.42) : hue < 1.5 ? vec3(0.42, 0.86, 0.8) : vec3(0.74, 0.66, 1.0);
}
void main(){
  int i = gl_VertexID;
  ivec2 fc = ivec2(i % int(uSize), i / int(uSize));
  vec4 P = texelFetch(tPos, fc, 0);
  vec4 S = texelFetch(tSeat, fc, 0);
  int bi = int(S.x + 0.5);
  vec4 B1 = texelFetch(tBody, ivec2(bi, 1), 0);
  vec4 B3 = texelFetch(tBody, ivec2(bi, 3), 0);
  float kind = B1.w;
  bool on = S.y < B1.x || kind > 4.5;
  vec4 h = hash4(uint(i) * 2u + 91u);
  vec4 mv = modelViewMatrix * vec4(P.xyz, 1.0);
  float dist = -mv.z;
  gl_Position = projectionMatrix * mv;
  float heat = P.w;

  // mostly fine dim dust, a middle grain, and a few glints that come and go
  float glint = pow(h.z, 16.0);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + 3.0 * h.w) + h.x * 40.0);
  float b = 0.1 + 0.34 * h.y * h.y * h.y + glint * 1.7 * tw;
  float gain = kind < 0.5 ? 1.25 : kind < 1.5 ? 1.05 : kind < 2.5 ? 0.9 : kind < 3.5 ? 0.8 : kind < 4.5 ? 1.1 : 0.5;
  b *= gain;
  float energy = B1.z;
  bool inCloud = !on && S.z > -0.5 && hash4(uint(i) * 2u + 13u).x < max(uSrcRead[int(S.z + 0.5)], uType * 0.36);
  float fnd = S.z > -0.5 ? uSrcOn[int(S.z + 0.5)] : 0.0;
  // the same numbers the grain was moved by, to know what it is part of
  vec4 hs = hash4(uint(i) * 2u + 11u);
  vec4 gs = hash4(uint(i) * 2u + 12u);
  float dsrc = floor(gs.x * uSrcN);
  float kept = kind > 4.5 && gs.z < uKeep * 0.5 ? uSrcOn[int(dsrc + 0.5)] : 0.0;
  // matter gathered into the form of where it was found is the brightest thing there is before a world is made
  float neb = kind > 4.5 ? kept : !on && !inCloud ? fnd : 0.0;
  // once a world has been made of them, what is left of the sources is its sky: there, behind, and quieter still while someone is being read
  if (kind > 4.5) b *= (1.0 + mix(3.2, 0.7, uSky) * kept) * (1.0 - 0.5 * uBack * kept) * (1.0 - 0.55 * uSpot.y * kept);
  else if (!on) b *= S.z < -0.5 ? 0.14 : inCloud ? 0.9 : mix(0.34, mix(1.7, 0.7, uSky), fnd); else b += energy * 0.22;
  // (all but out of sight: no rings of grains behind a cloud; they show again as they leave for the middle)
  b *= 1.0 - 0.97 * uVol * neb * (1.0 - clamp(heat * 2.5, 0.0, 1.0));
  b += heat * 0.75;
  // the network shown another way: in a sheet, the inside of a well is lit by whoever is at the bottom of it; as stars, there is no ground and what ties them is quiet
  if ((uNet == 1 || uNet >= 4) && kind > 2.5 && kind < 3.5) {
    // (4: the sheet is almost dark and only the wells show; 5: its lines of equal depth; 6: lit deep into the funnels)
    float deep = smoothstep(-0.12, -1.6, P.y);
    b *= uNet == 1 ? 1.0 + 1.2 * deep : uNet == 4 ? 0.2 + 2.3 * deep : uNet == 5 ? 0.32 + 2.0 * deep : uNet == 7 ? 0.14 + 2.2 * deep : uNet == 8 ? 0.5 + 1.3 * deep : uNet == 9 ? 0.3 + 1.9 * smoothstep(-0.25, -3.0, P.y) : uNet == 11 ? 0.82 + 0.9 * smoothstep(-0.08, -0.9, P.y) : 0.5 + 1.8 * deep;
  }
  // (4, 5, 6: what ties two is quieter, and the belt of crowds and the line of time step back, so the wells are what is seen)
  if (uNet >= 4 && kind > 0.5 && kind < 1.5) b *= uNet == 8 ? 0.3 : uNet >= 6 ? 0.85 : 0.5;
  if (uNet == 7) {
    // (7) first things first: whoever is neither you, nor deals with you directly, nor is being told about is dim; and only what ties someone to you is seen, the rest when something passes along it
    vec4 q0 = texelFetch(tBody, ivec2(bi, 0), 0);
    if (kind < 0.5 && length(q0.xz) > 3.7 && B3.y < 0.3) b *= 0.4;
    if (kind > 0.5 && kind < 1.5) {
      vec4 q2 = texelFetch(tBody, ivec2(bi, 2), 0);
      if (min(dot(q0.xz, q0.xz), dot(q2.xz, q2.xz)) > 0.6) b *= 0.07 + 0.93 * clamp(heat * 2.2, 0.0, 1.0);
    }
  }
  if (uNet >= 4 && ((kind > 1.5 && kind < 2.5) || (kind > 3.5 && kind < 4.5))) b *= 0.5;
  if (uNet == 3 && kind > 2.5 && kind < 3.5) b *= 0.1;
  if (uNet == 3 && kind > 0.5 && kind < 1.5) b *= 0.45;
  // where the cloud carries a source's form, its grains step back to be the glints in it
  // when one body is being read, the rest of the world steps back
  // (in the settled way, how far each is looked at is its own number, eased: no one is lit or put out at once)
  if (uFine > 0.5) {
    if (kind < 4.5) b *= 1.0 - 0.9 * uSpot.y * (1.0 - texelFetch(tBody, ivec2(bi, 4), 0).x);
  } else if (kind < 4.5 && abs(float(bi) - uSpot.x) > 0.5 && abs(float(bi) - uSpotB.x) > 0.5 && abs(float(bi) - uSpotB.y) > 0.5) b *= 1.0 - 0.9 * uSpot.y;
  // (and the world is as bright from far off as from near: the same grains on fewer pixels would add up to white)
  if (kind < 4.5 && (on || inCloud)) b *= uExpo;
  // the whole picture turned down while there is reading to do, all but those who matter now
  b *= mix(uGain, 1.0, kind < 0.5 ? B3.y : 0.0);
  float rr = length(P.xz);
  b += uWave.y * exp(-pow((rr - uWave.x) / 0.7, 2.0)) * 0.42 * step(abs(P.y), 3.0);

  b *= uLift;
  float size = (1.15 + 0.5 * h.y * h.y + 1.3 * glint + 0.7 * heat) * uPx * clamp(20.0 / dist, 0.62, 1.45) * (1.0 + 0.45 * neb * (1.0 - uSky));
  float coc = abs(dist - uFocus) / max(uFocus, 0.1);
  float blur = clamp((coc - 0.1) * uAper, 0.0, 1.0);
  // (what lies on the sky is as sharp as the stars are: it is part of the sky, not something nearer and out of focus)
  if (kind > 4.5 || (!on && !inCloud && S.z > -0.5)) blur *= 1.0 - 0.92 * uSky;
  // (under that sky what is on its way somewhere is a spark, not a soft disc in front of everything; and what has
  // gathered in the middle is seen grain by grain)
  if (kind < 4.5) blur *= 1.0 - uSky * max(0.78 * smoothstep(0.15, 0.5, heat), inCloud ? 0.6 : 0.0);
  float s2 = size * (1.0 + 6.0 * blur * blur);
  b *= (size * size) / (s2 * s2) * (1.0 + 3.2 * blur);
  if (s2 < 1.0) { b *= s2 * s2; s2 = 1.0; }
  gl_PointSize = min(s2, 30.0);
  vBlur = blur;
  vA = b;

  vec3 bone = vec3(0.93, 0.92, 0.9);
  vec3 cool = vec3(0.7, 0.74, 1.0);
  vec3 warm = vec3(1.0, 0.7, 0.36);
  vec3 c = mix(bone, cool, step(0.955, h.x) * 0.8);
  float mine = B3.w > 1.5 ? 1.0 : 0.0;
  if (!on && S.z > -0.5 && kind < 4.5) {
    // what has not yet been made into the world keeps the colour of where it came from: amber, teal, violet
    float hue = mod(S.z, 3.0);
    vec3 tint = srcTint(hue);
    c = mix(c, tint, inCloud ? 0.6 : mix(0.22, mix(0.9, 0.26, uSky), fnd));
    c = mix(c, warm, clamp(heat * 0.12, 0.0, 0.2));
  } else if (kept > 0.0) {
    float hue = mod(dsrc, 3.0);
    vec3 tint = srcTint(hue);
    c = mix(c, tint, mix(0.88, 0.26, uSky) * kept);
  } else {
    // someone's middle keeps the colour of where most of what is known of them came from
    bool core = kind < 0.5 && B3.x > 0.5 && B3.w < 1.5 && hs.z < 0.2;
    if (core) c = mix(c, srcTint(B3.x - 1.0), 0.62);
    // matter on its way in still has the colour of where it came from, and loses it once it has arrived
    float way = S.z > -0.5 && kind < 4.5 ? clamp(heat * 1.6, 0.0, 0.88) : 0.0;
    if (way > 0.0) {
      float hue = mod(S.z, 3.0);
      c = mix(c, srcTint(hue), way);
    }
    c = mix(c, warm, clamp(heat * 0.85 * (1.0 - way) * (core ? 0.55 : 1.0) + mine * 0.55 + energy * 0.25, 0.0, 0.92));
  }
  vC = c;
}
`;

const DRAW_F = /* glsl */ `
precision highp float;
varying float vA;
varying vec3 vC;
varying float vBlur;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float sharp = smoothstep(1.0, 0.62, d);
  float disc = smoothstep(1.0, 0.82, d) * (0.75 + 0.25 * smoothstep(0.5, 0.95, d));
  float a = mix(sharp, disc, smoothstep(0.05, 0.5, vBlur)) * vA;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vC * a, 1.0);
}
`;

const MIST_V = /* glsl */ `
precision highp float;
attribute vec3 offset;
attribute float aSrc;
attribute float aSize;
attribute float aSeed;
uniform vec3 uSrc[${SOURCES}];
uniform float uSrcOn[${SOURCES}];
uniform float uSrcLeft[${SOURCES}];
uniform float uSrcHaze[${SOURCES}];
uniform float uKeep;
uniform float uCloud;
uniform float uTime;
uniform float uGain;
varying vec2 vQ;
varying vec3 vC;
varying float vA;
varying float vSeed;
void main(){
  vec3 at;
  float a;
  float hue;
  if (aSrc < 50.0) {
    int si = int(aSrc + 0.5);
    at = uSrc[si];
    a = uSrcHaze[si] * max(uKeep * 0.8, uSrcLeft[si]);
    hue = mod(aSrc, 3.0);
  } else {
    at = vec3(0.0);
    a = uCloud;
    hue = aSrc - 100.0;
  }
  vec3 p = at + offset + 0.25 * vec3(sin(uTime * 0.11 + aSeed * 6.0), sin(uTime * 0.07 + aSeed * 9.0) * 0.4, cos(uTime * 0.09 + aSeed * 4.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
  vQ = position.xy * 2.0;
  vSeed = aSeed;
  vA = a * mix(uGain, 1.0, 0.35) * 0.058 * smoothstep(1.0, 6.0, -mv.z);
  vC = hue < 0.5 ? vec3(1.0, 0.66, 0.3) : hue < 1.5 ? vec3(0.25, 0.8, 0.74) : vec3(0.62, 0.52, 1.0);
}
`;
const MIST_F = /* glsl */ `
precision highp float;
varying vec2 vQ;
varying vec3 vC;
varying float vA;
varying float vSeed;
void main(){
  float d = length(vQ);
  if (d > 1.0) discard;
  float ang = atan(vQ.y, vQ.x);
  float f = exp(-d * d * 3.0) * (1.0 - smoothstep(0.8, 1.0, d));
  f *= 0.72 + 0.28 * sin(ang * 3.0 + vSeed * 20.0 + d * 5.0);
  gl_FragColor = vec4(vC * vA * f, 1.0);
}
`;

const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uAspect: { value: 1 }, uOval: { value: new THREE.Vector4(0.5, 0.5, 0.6, 0.6) }, uFloor: { value: 0.12 }, uPool: { value: new THREE.Vector4(0.5, 0.5, 0.2, 0.2) }, uLens: { value: new THREE.Vector3(0.5, 0.5, 0) }, uLens2: { value: new THREE.Vector3(0.5, 0.5, 0) }, uRing: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, uFlash: { value: 0 }, uPoolK: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; uniform vec4 uOval; uniform float uFloor; uniform vec4 uPool; uniform float uPoolK; uniform vec3 uLens; uniform vec3 uLens2; uniform vec4 uRing; uniform float uFlash; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uLens.z > 0.002) {
        // light bent round a mass, with nothing to be seen of the mass itself: what is near is drawn from a little
        // further out, most strongly close by, falling away smoothly; nothing turns inside out and there is no edge
        vec2 d = (vUv - uLens.xy) * vec2(uAspect, 1.0);
        float r2 = dot(d, d);
        float re = 0.1;
        float k = uLens.z * smoothstep(0.62, 0.0, sqrt(r2));
        uv = uLens.xy + d * (1.0 + 0.85 * k * re * re / (r2 + re * re * 0.9)) / vec2(uAspect, 1.0);
      }
      if (uLens2.z > 0.002) {
        // (the same round what has gathered in the middle, which has weight of its own)
        vec2 d = (uv - uLens2.xy) * vec2(uAspect, 1.0);
        float r2 = dot(d, d);
        float re = 0.085;
        float k = uLens2.z * smoothstep(0.55, 0.0, sqrt(r2));
        uv = uLens2.xy + d * (1.0 + 0.85 * k * re * re / (r2 + re * re * 0.9)) / vec2(uAspect, 1.0);
      }
      // a ring going out from where a world was lit: it pushes the picture outward as it passes, and is bright
      vec2 dw = (vUv - uRing.xy) * vec2(uAspect, 1.0);
      float shock = 0.0;
      if (uRing.w > 0.002) {
        float wr = length(dw) + 0.0001;
        float e = (wr - uRing.z) / 0.045;
        shock = exp(-e * e) * uRing.w;
        uv -= dw / wr * shock * 0.035 / vec2(uAspect, 1.0);
      }
      // Bent toward the edge of the page, the picture would be drawn from beyond it, where there is nothing: the last
      // row was drawn again and again instead, as a fringe of streaks along the edge. What lies beyond an edge is taken
      // to be the picture folded back at it (sky into sky), so the edge bends and moves with the rest. (Leaving the
      // edge unbent instead made a band along it that stood still while everything inside it moved.)
      uv = 1.0 - abs(1.0 - abs(uv));
      vec3 c = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
      c = c * (1.0 + shock * 1.3) + vec3(1.0, 0.94, 0.84) * (shock * 0.09 + uFlash * 1.5 * exp(-dot(dw, dw) / 0.035) + uFlash * 0.12);
      c = 1.0 - exp(-c * 1.25);
      // the page's own colour behind; the picture steps back under the columns at the sides and the rows at top and bottom
      vec3 bg = vec3(0.0627, 0.0667, 0.0745);
      // the picture is whole in the room the page leaves it and falls away round that room in an oval, with no edge
      vec2 o = (vUv - uOval.xy) / uOval.zw;
      float open = smoothstep(1.3, 0.78, length(o));
      c = bg + c * (uFloor + (1.0 - uFloor) * open) * (1.0 - uPoolK * smoothstep(1.3, 0.4, length((vUv - uPool.xy) / uPool.zw)));
      c += (rnd(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Field {
  size: number;
  count: number;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  /** Four rows of numbers per body; the page writes here, then calls step. */
  bodies = new Float32Array(BODIES * ROWS * 4);
  sources: THREE.Vector3[] = Array.from({ length: SOURCES }, () => new THREE.Vector3(0, 0, -30));
  focus = 20;
  aperture = 1.6;
  wave = new THREE.Vector3(0, 0, 0);
  /** The body being read (its index) and how far the rest has stepped back (0 … 1). */
  spot = new THREE.Vector2(-1, 0);
  /** How loud the whole picture is (1: full; lower while there is reading to do). */
  gain = 1;
  /** How much of the picture is left outside the room the page leaves it (0 … 1). */
  floor = 0.12;
  /** Each source: found (0 … 1, its matter drawn out of the scatter into its own form) and read (0 … 1, gone to the cloud in the middle). */
  found = new Float32Array(SOURCES).fill(1);
  read = new Float32Array(SOURCES);
  /** How far something written has drawn the scatter into the cloud (0 … 1). */
  typed = 0;
  /** How much of each source is still where it was found (1 … 0): its mist thins as it is used up. */
  left = new Float32Array(SOURCES).fill(1);
  /** How far the mist of each source has come up (it follows the matter gathering there, a little behind). */
  haze = new Float32Array(SOURCES);
  /** Two more bodies left at full while one is being read: whoever it acts on, and the tie between them (-1: none). */
  spotB = new THREE.Vector2(-1, -1);
  /** How much of the dust stays with the sources for good (0: none), and how many sources there are. */
  keep = 0;
  sourceCount = SOURCES;
  /** How much mist the cloud in the middle has (0 … 1). */
  cloud = 0;
  /** How far what is left of the sources has become the sky behind a world (0 … 1). */
  back = 0;
  /** 2: everything; 1: a lighter picture; 0: lightest (no bloom). Set by whoever watches the frame rate. */
  quality = 2;
  private mist!: THREE.ShaderMaterial;
  private mistMesh!: THREE.Mesh;
  /** Where what is not yet read lies: 0 scattered, each source a form of its own made of grains once found (as it has been); 1 one galaxy of grains, each source a knot on one of its arms, and what is read drawn out of it. */
  open = 0;
  /** Where the galaxy is and the plane it lies in (set by whoever directs, so it stays ahead of the journey). */
  gal = new THREE.Vector3(0, 0, 0);
  galU = new THREE.Vector3(1, 0, 0);
  galV = new THREE.Vector3(0, 0.7, -0.71).normalize();
  /** How someone's matter settles: 0 rings (as it has been), 1 a thick disc, 2 a cluster, 3 heads with tails. */
  form = 0;
  /** What the sources are made of, in place of the mist and most of the grains: 1 clouds with depth (lit from inside, dust in front), 2 ink in water, 3 veils of light, 4 fibres. 0: as it has been. */
  volume = 0;
  /** How many of the page's pixels are drawn (a picture shown at half size needs half). */
  pixels = 1;
  private volRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
  private volScene = new THREE.Scene();
  private volCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private vol!: THREE.ShaderMaterial;
  private vols: THREE.ShaderMaterial[] = [];
  private volMesh!: THREE.Mesh;
  private volBack!: THREE.Mesh;
  private volOn = new Float32Array(SOURCES);
  private milky!: THREE.Mesh;
  private skyOn = new Float32Array(SOURCES);
  private openK = 0;
  private asked = false;
  private real: { map: THREE.Texture; lb: Float32Array; cat: THREE.Points } | null = null;
  private srcU = new Float32Array(SOURCES);
  /** The brightest stars by name, where the catalogue has them (radians along and across the galaxy); and a count that moves when the measured sky has come. */
  named: { l: number; b: number; name: string }[] = [];
  skyCame = 0;
  /** Where the picture is bent round a mass (0…1 of the page), and how much. */
  /** The settled way of doing things (see Stage.fine). */
  fine = false;
  /** How bright the world's grains are drawn, against how small it is on the page (1: as it is). */
  expo = 1;
  private lampPts!: THREE.Points;
  private ringPts!: THREE.Points;
  lens = { x: 0.5, y: 0.5, k: 0 };
  /** The picture bent round what has gathered in the middle (where on the page, 0…1 from the foot; how much). */
  lens2 = { x: 0.5, y: 0.5, k: 0 };
  /** How what is read goes from the galaxy to the world (set by whoever directs): 0 as shooting stars; 1 into a well; 2 it is lit; 3 the eye comes down with it. */
  trans = 0;
  /** How the network of who is in a world is shown: 0 rings on a flat ground (as it has been); 1 a sheet that everyone weighs down, each at the bottom of their own well; 2 a small galaxy with depth, each a knot of stars; 3 stars and no ground. Set, with how many bodies there are, who lights the ground (x, z, how much, which colour) and whether there is a world yet, by whoever directs. */
  net = 0;
  bodyN = 0;
  nodes = Array.from({ length: 32 }, () => new THREE.Vector4());
  nodeN = 0;
  worldOn = 0;
  private worldK = 0;
  private ground!: THREE.Mesh;
  /** How far what has gathered is drawn in to a point; a ring going out across the picture (where, how far out, how strong); and a flash at its middle. */
  squeeze = 0;
  ring = { x: 0.5, y: 0.5, r: 0, k: 0 };
  flash = 0;
  private lensAt = { x: 0.5, y: 0.5 };
  private lensK = 0;

  private volPow = new Float32Array(SOURCES);
  /** A pool of dark behind words set straight on the picture (pixels; k: how dark, 0 … 1). */
  pool = { x: 0, y: 0, rx: 100, ry: 100, k: 0 };
  /** Where the picture gives way to what is laid over it, in pixels: columns left and right, rows top and bottom. */
  margins = { l: 0, r: 0, t: 0, b: 0 };
  /** Where on the page the camera's aim should fall (pixels). */
  aim = { x: 0, y: 0 };
  spin = 0;
  private bodyTex: THREE.DataTexture;
  private seatTex: THREE.DataTexture;
  private rt: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private simScene = new THREE.Scene();
  private simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private sim: THREE.ShaderMaterial;
  private draw: THREE.ShaderMaterial;
  private composer: EffectComposer;
  private grade: ShaderPass;
  private bloom: UnrealBloomPass;
  private snap = 2;
  w = 1;
  h = 1;

  constructor(canvas: HTMLCanvasElement, seats: Float32Array, size = 512) {
    this.size = size;
    this.count = size * size;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = true;
    const opts = { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false } as const;
    this.rt = [new THREE.WebGLRenderTarget(size, size, opts), new THREE.WebGLRenderTarget(size, size, opts)];
    this.seatTex = new THREE.DataTexture(seats, size, size, THREE.RGBAFormat, THREE.FloatType);
    this.seatTex.needsUpdate = true;
    this.bodyTex = new THREE.DataTexture(this.bodies, BODIES, ROWS, THREE.RGBAFormat, THREE.FloatType);
    this.bodyTex.needsUpdate = true;

    this.sim = new THREE.ShaderMaterial({
      uniforms: { tPos: { value: null }, tSeat: { value: this.seatTex }, tBody: { value: this.bodyTex }, uSrc: { value: this.sources }, uTime: { value: 0 }, uDt: { value: 0.016 }, uSpin: { value: 0 }, uSnap: { value: 1 }, uSize: { value: size }, uSrcOn: { value: this.found }, uSrcRead: { value: this.read }, uType: { value: 0 }, uKeep: { value: 0 }, uSrcN: { value: SOURCES }, uForm: { value: 0 }, uOpen: { value: 0 }, uGal: { value: this.gal }, uGalU: { value: this.galU }, uGalV: { value: this.galV }, tGal: { value: null }, uReal: { value: 0 }, uSrcU: { value: this.srcU }, uTrans: { value: 0 }, uSqueeze: { value: 0 }, uNet: { value: 0 }, uBodyN: { value: 0 } },
      vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: SIM,
      depthTest: false,
      depthWrite: false,
    });
    this.simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sim));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    this.draw = new THREE.ShaderMaterial({
      uniforms: { tPos: { value: null }, tSeat: { value: this.seatTex }, tBody: { value: this.bodyTex }, uPx: { value: 1 }, uFocus: { value: 20 }, uAper: { value: 1.6 }, uTime: { value: 0 }, uSize: { value: size }, uWave: { value: this.wave }, uSpot: { value: this.spot }, uGain: { value: 1 }, uSrcRead: { value: this.read }, uSrcOn: { value: this.found }, uType: { value: 0 }, uKeep: { value: 0 }, uSrcN: { value: SOURCES }, uSpotB: { value: this.spotB }, uBack: { value: 0 }, uVol: { value: 0 }, uSky: { value: 0 }, uNet: { value: 0 }, uFine: { value: 0 }, uExpo: { value: 1 }, uLift: { value: Math.pow(262144 / this.count, 0.6) } },
      vertexShader: DRAW_V,
      fragmentShader: DRAW_F,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    // the mist goes in first, behind the grains
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const per = 11;
    const cloudN = 18;
    const count = SOURCES * per + cloudN;
    const off = new Float32Array(count * 3);
    const src = new Float32Array(count);
    const siz = new Float32Array(count);
    const sed = new Float32Array(count);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < count; k++) {
      const cl = k >= SOURCES * per;
      const a = rnd() * Math.PI * 2;
      const r = (cl ? 4.6 : 2.7) * Math.sqrt(rnd());
      off.set([Math.cos(a) * r, (rnd() - 0.5) * (cl ? 1.6 : 1.5), Math.sin(a) * r], k * 3);
      src[k] = cl ? 100 + (k % 3) : Math.floor(k / per);
      siz[k] = cl ? 5.5 + rnd() * 4.5 : 2.6 + rnd() * rnd() * 5.2;
      sed[k] = rnd();
    }
    quad.setAttribute("offset", new THREE.InstancedBufferAttribute(off, 3));
    quad.setAttribute("aSrc", new THREE.InstancedBufferAttribute(src, 1));
    quad.setAttribute("aSize", new THREE.InstancedBufferAttribute(siz, 1));
    quad.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sed, 1));
    quad.instanceCount = count;
    this.mist = new THREE.ShaderMaterial({
      uniforms: { uSrc: { value: this.sources }, uSrcOn: { value: this.found }, uSrcLeft: { value: this.left }, uSrcHaze: { value: this.haze }, uKeep: { value: 0 }, uCloud: { value: 0 }, uTime: { value: 0 }, uGain: { value: 1 } },
      vertexShader: MIST_V,
      fragmentShader: MIST_F,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    const fog = new THREE.Mesh(quad, this.mist);
    fog.frustumCulled = false;
    this.scene.add(fog);
    this.mistMesh = fog;

    // the cloud with depth: made small, laid down behind everything
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const tint = [
      [1, 0.51, 0.15],
      [0.15, 0.71, 0.6],
      [0.51, 0.39, 1],
    ];
    const volU = { tNoise: { value: noiseCube() }, uInvPV: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSteps: { value: 30 }, uSrcPos: { value: this.sources }, uSrcCol: { value: Array.from({ length: SOURCES }, (_, i) => new THREE.Vector3(...tint[i % 3]!)) }, uSrcOn: { value: this.volOn }, uSrcPow: { value: this.volPow }, uSrcR: { value: new Float32Array(SOURCES).fill(2.4) }, uMidCol: { value: new THREE.Vector3(1, 0.93, 0.82) }, uGather: { value: 0 }, uBand: { value: 0 }, uAmb: { value: new THREE.Vector3(0.004, 0.005, 0.006) } };
    this.vols = [0, 1, 2, 3].map((k) => new THREE.ShaderMaterial({ vertexShader: TRI_V, fragmentShader: cloudOf(SOURCES, k), uniforms: volU, depthTest: false, depthWrite: false }));
    this.vol = this.vols[0]!;
    const vm = new THREE.Mesh(tri, this.vol);
    vm.frustumCulled = false;
    this.volScene.add(vm);
    this.volMesh = vm;
    this.volBack = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: TRI_V, fragmentShader: BACK_F, uniforms: { tFog: { value: this.volRT.texture }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) }, uGain: { value: 1 } }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
    this.volBack.frustumCulled = false;
    this.volBack.renderOrder = -5;
    this.scene.add(this.volBack);

    // the ground of a world as a small galaxy with depth (net 2), under its grains
    const gq = new THREE.PlaneGeometry(2, 2);
    this.ground = new THREE.Mesh(gq, new THREE.ShaderMaterial({ vertexShader: DISC_V, fragmentShader: DISC_F, uniforms: { tNoise: volU.tNoise, uNode: { value: this.nodes }, uNodeN: { value: 0 }, uOn: { value: 0 }, uTurn: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.06;
    this.ground.scale.setScalar(11);
    this.ground.frustumCulled = false;
    this.ground.renderOrder = -3;
    this.scene.add(this.ground);

    // the night sky from inside the galaxy, behind everything, while the galaxy is what is drawn from
    this.milky = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: TRI_V, fragmentShader: MILKY_F, uniforms: { tNoise: volU.tNoise, uInvPV: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uGalU: { value: this.galU }, uGalV: { value: this.galV }, uGas: { value: new THREE.Vector3(...tint[2]!) }, uOn: { value: 0 }, tMap: { value: null }, uReal: { value: 0 }, uFine: { value: 0 }, uSrcPos: { value: this.sources }, uSrcCol: volU.uSrcCol, uSrcOn: { value: this.skyOn } }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
    this.milky.frustumCulled = false;
    this.milky.renderOrder = -7;
    this.scene.add(this.milky);

    const pts = new THREE.Points(geo, this.draw);
    pts.frustumCulled = false;
    this.scene.add(pts);

    // the lights faces are seen against: of the picture itself, so they glow and bend with everything else
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LAMPS * 3), 3));
    lg.setAttribute("aLook", new THREE.BufferAttribute(new Float32Array(LAMPS * 3), 3));
    lg.setDrawRange(0, 0);
    this.lampPts = new THREE.Points(
      lg,
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 1 } },
        vertexShader: /* glsl */ `attribute vec3 aLook; uniform float uPx; varying vec2 vL; void main(){ vL = aLook.yz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aLook.x * uPx; }`,
        fragmentShader: /* glsl */ `precision highp float; varying vec2 vL; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.56, d); vec3 c = mix(vec3(0.97, 0.96, 0.92), vec3(1.0, 0.8, 0.56), vL.y); gl_FragColor = vec4(c * a * a * vL.x, 1.0); }`,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.lampPts.frustumCulled = false;
    this.lampPts.renderOrder = 4;
    this.scene.add(this.lampPts);

    // grains that are not of anyone: what is left to odds, round whoever it is about
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    rg.setAttribute("aLook", new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    rg.setDrawRange(0, 0);
    this.ringPts = new THREE.Points(
      rg,
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 1 } },
        vertexShader: /* glsl */ `attribute vec3 aLook; uniform float uPx; varying vec2 vL; void main(){ vL = aLook.yz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, aLook.x * uPx); }`,
        fragmentShader: /* glsl */ `precision highp float; varying vec2 vL; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.3, d); vec3 c = mix(vec3(0.93, 0.92, 0.9), vec3(1.0, 0.72, 0.4), vL.y); gl_FragColor = vec4(c * a * vL.x, 1.0); }`,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.ringPts.frustumCulled = false;
    this.ringPts.renderOrder = 3;
    this.scene.add(this.ringPts);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.7, 0.7);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality >= 2 ? 2 : this.quality === 1 ? 1.5 : 1) * this.pixels;
    this.bloom.enabled = this.quality > 0;
    this.volRT.setSize(Math.max(2, Math.floor(w * dpr * 0.66)), Math.max(2, Math.floor(h * dpr * 0.66)));
    (this.volBack.material as THREE.ShaderMaterial).uniforms.uRes!.value.set(w * dpr, h * dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.draw.uniforms.uPx!.value = dpr * Math.max(0.8, Math.min(1.25, h / 900)) * Math.pow(262144 / this.count, 0.2);
    this.grade.uniforms.uAspect!.value = w / h;
  }

  /** Put every grain straight where it belongs on the next step (after a jump in time). */
  settle() {
    this.snap = 2;
  }

  step(dt: number, t: number) {
    this.bodyTex.needsUpdate = true;
    const u = this.sim.uniforms;
    u.tPos!.value = this.rt[0].texture;
    u.uTime!.value = t;
    u.uDt!.value = dt;
    u.uSpin!.value = this.spin;
    u.uSnap!.value = this.snap > 0 ? 1 : 0;
    u.uType!.value = this.typed;
    u.uKeep!.value = this.keep;
    u.uSrcN!.value = this.sourceCount;
    u.uForm!.value = this.form;
    u.uOpen!.value = this.open;
    this.openK += ((this.open >= 1 ? 1 : 0) - this.openK) * (this.snap > 0 ? 1 : 1 - Math.exp(-dt * 1.4));
    // the sky as it was measured is fetched the first time it is wanted; until it has come the galaxy is the one worked out
    if (this.open === 2 && !this.asked) {
      this.asked = true;
      void this.fetchSky();
    }
    u.uReal!.value = this.open === 2 && this.real ? 1 : 0;
    u.uTrans!.value = this.trans;
    u.uNet!.value = this.net;
    u.uBodyN!.value = this.bodyN;
    this.worldK += (this.worldOn - this.worldK) * (this.snap > 0 ? 1 : 1 - Math.exp(-dt * 0.6));
    u.uSqueeze!.value = this.squeeze;
    if (this.snap > 0) this.snap--;
    this.renderer.setRenderTarget(this.rt[1]);
    this.renderer.render(this.simScene, this.simCam);
    this.renderer.setRenderTarget(null);
    this.rt.reverse();
    const d = this.draw.uniforms;
    d.tPos!.value = this.rt[0].texture;
    d.uTime!.value = t;
    d.uFocus!.value = this.focus;
    d.uAper!.value = this.aperture;
    d.uGain!.value = this.gain;
    d.uType!.value = this.typed;
    d.uKeep!.value = this.keep;
    d.uSrcN!.value = this.sourceCount;
    d.uBack!.value = this.back;
    d.uVol!.value = this.volume > 1.5 ? 1 : 0;
    d.uSky!.value = this.open >= 1 ? 1 : 0;
    d.uNet!.value = this.net;
    d.uFine!.value = this.fine ? 1 : 0;
    d.uExpo!.value = this.expo;
    const m0 = this.mist.uniforms;
    m0.uKeep!.value = this.keep;
    m0.uCloud!.value = this.cloud;
    m0.uTime!.value = t;
    m0.uGain!.value = this.gain * (1 - 0.4 * this.back);
    const m = this.margins;
    const g = this.grade.uniforms;
    g.uFloor!.value = this.floor;
    (g.uPool!.value as THREE.Vector4).set(this.pool.x / this.w, 1 - this.pool.y / this.h, Math.max(0.01, this.pool.rx / this.w), Math.max(0.01, this.pool.ry / this.h));
    g.uPoolK!.value = this.pool.k;
    this.lensK += (this.lens.k - this.lensK) * (1 - Math.exp(-dt * 4));
    const lk = this.lensK < 0.02 ? 1 : 1 - Math.exp(-dt * 12);
    this.lensAt.x += (this.lens.x - this.lensAt.x) * lk;
    this.lensAt.y += (this.lens.y - this.lensAt.y) * lk;
    (g.uLens!.value as THREE.Vector3).set(this.lensAt.x, this.lensAt.y, this.lensK);
    (g.uLens2!.value as THREE.Vector3).set(this.lens2.x, this.lens2.y, this.lens2.k);
    (g.uRing!.value as THREE.Vector4).set(this.ring.x, this.ring.y, this.ring.r, this.ring.k);
    g.uFlash!.value = this.flash;

    (g.uOval!.value as THREE.Vector4).set((m.l + (this.w - m.r)) / 2 / this.w, 1 - (m.t + (this.h - m.b)) / 2 / this.h, Math.max(0.12, (this.w - m.l - m.r) / 2 / this.w), Math.max(0.12, ((this.h - m.t - m.b) / 2 / this.h) * 1.06));
    if (this.aim.x || this.aim.y) this.camera.setViewOffset(this.w, this.h, this.w / 2 - this.aim.x, this.h / 2 - this.aim.y, this.w, this.h);
    else this.camera.clearViewOffset();
    this.grade.uniforms.uTime!.value = t;
  }

  /**
   * The sky as it was measured (public/sky): the glow of the Milky Way from Gaia, and the Yale catalogue's stars.
   * From the glow, places for the grains are drawn (more where it is brighter) and kept in order along the galaxy.
   */
  private async fetchSky() {
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("milkyway.jpg"));
        i.src = "/sky/milkyway.jpg";
      });
      const cat = (await (await fetch("/sky/bsc5.json")).json()) as { stars: [number, number, number, number][]; names: Record<string, string> };
      const map = new THREE.Texture(img);
      map.wrapS = THREE.RepeatWrapping;
      map.minFilter = map.magFilter = THREE.LinearFilter;
      map.generateMipmaps = false;
      map.needsUpdate = true;
      // places for the grains
      const W = 1024;
      const H = 512;
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const cx = cv.getContext("2d")!;
      cx.drawImage(img, 0, 0, W, H);
      const px = cx.getImageData(0, 0, W, H).data;
      let seed = 7;
      const rnd = () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const N = 65536;
      const ls = new Float32Array(N);
      const bs = new Float32Array(N);
      let k = 0;
      for (let tries = 0; k < N && tries < N * 400; tries++) {
        const x = rnd() * W;
        const y = (0.27 + rnd() * 0.46) * H;
        const o = (Math.floor(y) * W + Math.floor(x)) * 4;
        const lum = (px[o]! + px[o + 1]! + px[o + 2]!) / 765;
        if (rnd() * 0.62 > Math.pow(Math.max(0, lum - 0.27), 1.5)) continue;
        ls[k] = (0.5 - x / W) * Math.PI * 2;
        bs[k] = (0.5 - y / H) * Math.PI;
        k++;
      }
      const order = Array.from({ length: k }, (_, i) => i).sort((a, b) => ls[a]! - ls[b]!);
      const lb = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) {
        const j = order[Math.min(k - 1, Math.floor((i / N) * k))]!;
        lb[i * 4] = ls[j]!;
        lb[i * 4 + 1] = bs[j]!;
      }
      const table = new THREE.DataTexture(lb, 256, 256, THREE.RGBAFormat, THREE.FloatType);
      table.minFilter = table.magFilter = THREE.NearestFilter;
      table.needsUpdate = true;
      // each source's place in that order: where its stretch of the band is
      for (let i = 0; i < SOURCES; i++) {
        // (spread further along the real band than along the worked-out one: seen through the wide lens they would crowd)
        const l0 = (((i * 0.61803 + 0.37) % 1) - 0.5) * 3.4;
        let lo = 0;
        let hi = N - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (lb[mid * 4]! < l0) lo = mid + 1;
          else hi = mid;
        }
        this.srcU[i] = lo / N;
      }
      // the catalogue's stars
      const st = new Float32Array(cat.stars.length * 4);
      cat.stars.forEach(([l, b, v, bv], i) => st.set([((l > 180 ? l - 360 : l) * Math.PI) / 180, (b * Math.PI) / 180, v, bv], i * 4));
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cat.stars.length * 3), 3));
      sg.setAttribute("aStar", new THREE.BufferAttribute(st, 4));
      const pts = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: CAT_V, fragmentShader: CAT_F, uniforms: { uGal: { value: this.gal }, uGalU: { value: this.galU }, uGalV: { value: this.galV }, uOn: { value: 0 }, uPx: { value: 1 }, uTime: { value: 0 } }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
      pts.frustumCulled = false;
      pts.renderOrder = -6;
      pts.visible = false;
      this.scene.add(pts);
      this.named = Object.entries(cat.names).map(([i, name]) => ({ l: st[Number(i) * 4]! / 2.2, b: st[Number(i) * 4 + 1]! / 2.2, name }));
      this.sim.uniforms.tGal!.value = table;
      (this.milky.material as THREE.ShaderMaterial).uniforms.tMap!.value = map;
      this.real = { map, lb, cat: pts };
      this.skyCame++;
    } catch {
      // without it the galaxy stays the one worked out
    }
  }

  /** Where a source's knot is on the measured band (radians along and across), once the measured sky has come. */
  sourcePlace(i: number): [number, number] | null {
    if (!this.real) return null;
    const lb = this.real.lb;
    const at = Math.floor(this.srcU[i]! * 65536);
    let l = 0;
    let b = 0;
    let n = 0;
    for (let j = Math.max(0, at - 160); j < Math.min(65536, at + 160); j++) {
      l += lb[j * 4]!;
      b += lb[j * 4 + 1]!;
      n++;
    }
    // (through the same wide lens as the picture)
    return n ? [l / n / 2.2, b / n / 2.2] : null;
  }

  render() {
    const gu = (this.ground.material as THREE.ShaderMaterial).uniforms;
    gu.uOn!.value = this.net === 2 ? this.worldK * (0.55 + 0.45 * this.gain) : 0;
    this.ground.visible = (gu.uOn!.value as number) > 0.004;
    gu.uNodeN!.value = this.nodeN;
    gu.uTime!.value = this.grade.uniforms.uTime!.value;
    gu.uTurn!.value = this.spin + (this.grade.uniforms.uTime!.value as number) * 0.03;
    this.milky.visible = this.openK > 0.004;
    if (this.milky.visible) {
      const m = (this.milky.material as THREE.ShaderMaterial).uniforms;
      this.camera.updateMatrixWorld();
      (m.uInvPV!.value as THREE.Matrix4).multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).invert();
      (m.uCam!.value as THREE.Vector3).setFromMatrixPosition(this.camera.matrixWorld);
      m.uOn!.value = this.openK * (0.5 + 0.5 * this.gain) * (1 - 0.35 * this.back);
      m.uReal!.value = this.open === 2 && this.real ? 1 : 0;
      m.uFine!.value = this.fine ? 1 : 0;
      for (let i = 0; i < SOURCES; i++) this.skyOn[i] = i < this.sourceCount ? this.found[i]! * Math.max(this.keep * 0.6, this.left[i]!) * (1 - 0.35 * this.back) : 0;
      if (this.real) {
        const c = (this.real.cat.material as THREE.ShaderMaterial).uniforms;
        this.real.cat.visible = this.open === 2;
        c.uOn!.value = m.uOn!.value;
        c.uPx!.value = this.renderer.getPixelRatio();
        c.uTime!.value = this.grade.uniforms.uTime!.value;
      }
    } else if (this.real) this.real.cat.visible = false;
    // (1, once things painted in the sky, is no longer anything: as it has been)
    const on = this.volume > 1.5;
    this.mistMesh.visible = !on;
    this.volBack.visible = on;
    if (on) {
      // each source a cloud of its own colour, lit from inside while there is still something to read in it; the
      // middle a paler one while what was read is gathered there; nothing between them
      const kind = Math.min(3, Math.max(0, Math.round(this.volume) - 1));
      this.volMesh.material = this.vols[kind]!;
      // the thin ones (ink, veils) are given more so they can be seen at this size
      (this.volBack.material as THREE.ShaderMaterial).uniforms.uGain!.value = [1, 2.3, 2.8, 1.1][kind]!;
      const v = this.vol.uniforms;
      for (let i = 0; i < SOURCES; i++) {
        const here = i < this.sourceCount ? this.found[i]! * Math.max(this.keep * 0.75, this.left[i]!) * (1 - 0.45 * this.back) : 0;
        this.volOn[i] = here;
        this.volPow[i] = here * (kind === 0 ? 0.75 + 0.75 * this.left[i]! : 0.55 + 0.9 * this.left[i]!) * (kind === 0 ? 1 : 0.8);
      }
      v.uGather!.value = this.cloud * 0.3;
      v.uSteps!.value = kind === 0 ? 64 : 30;
      v.uTime!.value = this.grade.uniforms.uTime!.value;
      this.camera.updateMatrixWorld();
      (v.uInvPV!.value as THREE.Matrix4).multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).invert();
      (v.uCam!.value as THREE.Vector3).setFromMatrixPosition(this.camera.matrixWorld);
      this.renderer.setRenderTarget(this.volRT);
      this.renderer.render(this.volScene, this.volCam);
      this.renderer.setRenderTarget(null);
    }
    this.composer.render();
  }

  /** A place in the world as a place on the page (pixels), with how far it is; null behind the camera. */
  project(v: THREE.Vector3, out = { x: 0, y: 0, d: 0 }) {
    const p = _v.copy(v).applyMatrix4(this.camera.matrixWorldInverse);
    if (p.z > -0.2) return null;
    out.d = -p.z;
    p.applyMatrix4(this.camera.projectionMatrix);
    out.x = (p.x * 0.5 + 0.5) * this.w;
    out.y = (-p.y * 0.5 + 0.5) * this.h;
    return out;
  }

  /** The lights faces are seen against: where each is in the world, how wide on the page (pixels), how bright, and how warm (0…1). */
  lamps(list: { at: THREE.Vector3; px: number; glow: number; warm: number }[]) {
    const g = this.lampPts.geometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const look = g.getAttribute("aLook") as THREE.BufferAttribute;
    const n = Math.min(LAMPS, list.length);
    for (let i = 0; i < n; i++) {
      const l = list[i]!;
      pos.setXYZ(i, l.at.x, l.at.y, l.at.z);
      look.setXYZ(i, l.px, l.glow, l.warm);
    }
    pos.needsUpdate = true;
    look.needsUpdate = true;
    g.setDrawRange(0, n);
    (this.lampPts.material as THREE.ShaderMaterial).uniforms.uPx!.value = this.renderer.getPixelRatio();
  }

  /** Grains that are not of anyone (what is left to odds): n of them, each where it is in the world, and how wide (pixels), how bright, how warm. */
  motes(pos: Float32Array, look: Float32Array, n: number) {
    const g = this.ringPts.geometry;
    const count = Math.min(MOTES, n);
    if (count > 0) {
      const P = g.getAttribute("position") as THREE.BufferAttribute;
      const L = g.getAttribute("aLook") as THREE.BufferAttribute;
      (P.array as Float32Array).set(pos.subarray(0, count * 3));
      (L.array as Float32Array).set(look.subarray(0, count * 3));
      P.needsUpdate = true;
      L.needsUpdate = true;
      (this.ringPts.material as THREE.ShaderMaterial).uniforms.uPx!.value = this.renderer.getPixelRatio();
    }
    g.setDrawRange(0, count);
  }

  /** Where a place on the page is seen once the picture has been bent round the pointer and round the well (see the grade): moved in place. */
  bend(p: { x: number; y: number }) {
    if (this.lensK < 0.002 && this.lens2.k < 0.002) return p;
    const asp = this.w / Math.max(1, this.h);
    let u = p.x / this.w;
    let v = 1 - p.y / this.h;
    // the grade draws each place from L2(L1(place)): so a thing is seen at L1⁻¹(L2⁻¹(where it is))
    const back = (cx: number, cy: number, K: number, re: number, reach: number) => {
      if (K < 0.002) return;
      const sx = (u - cx) * asp;
      const sy = v - cy;
      const sig = Math.hypot(sx, sy);
      if (sig < 1e-6) return;
      const f = (rho: number) => {
        const t = Math.min(1, Math.max(0, 1 - rho / reach));
        return rho * (1 + (0.85 * K * t * t * (3 - 2 * t) * re * re) / (rho * rho + re * re * 0.9));
      };
      let lo = 0;
      let hi = sig;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (f(mid) < sig) lo = mid;
        else hi = mid;
      }
      const k = (lo + hi) / 2 / sig;
      u = cx + (sx * k) / asp;
      v = cy + sy * k;
    };
    back(this.lens2.x, this.lens2.y, this.lens2.k, 0.085, 0.55);
    back(this.lensAt.x, this.lensAt.y, this.lensK, 0.1, 0.62);
    p.x = u * this.w;
    p.y = (1 - v) * this.h;
    return p;
  }

  /** How many pixels one unit of the world covers at that distance. */
  pxPer(dist: number) {
    return this.h / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * dist);
  }

  dispose() {
    this.rt[0].dispose();
    this.rt[1].dispose();
    this.seatTex.dispose();
    this.bodyTex.dispose();
    this.sim.dispose();
    this.mist.dispose();
    this.draw.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
const _v = new THREE.Vector3();
/** How many faces can have a light at once. */
const LAMPS = 64;
/** How many grains there can be that are not of anyone. */
export const MOTES = 3600;
