import * as THREE from 'three';
import { dragonLook, DP_CELL } from '../render/dragonPrint.js';
import { DP_FX_U } from '../render/dragonPrintFx.js';
import { gis } from '../render/glyphs.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { GRASS } from './grassTuning.js';
import { TRAIL_BEND_GLSL } from './grassTrail.js';

// THE DRAGON GROUND'S GRASS. The owner (2026-11-24): "how can we make 3d looking grass with this style and
// still incorporate the player walking around and the grass bending as they go and the player cutting".
// Round 2's pick (2026-11-25): a, "A design and layers look much better ... is it possible to make grass A
// be more 3d while still feeling the same and the grass cuts actually look like the ground is cutting".
// Switch `dgGrass` (on the dragon ground; default 'a' with the dragon print):
//   '0'  the dragon ground as first shown (no grass of its own; the 3D blades hidden)
//   'a'  printed tufts (the pick): one little fan of blades may root at any ground cell, its image rising
//        north of its root on the print's own lattice (a dark digit root, its tips '\ | /' lit by their
//        lean); the nearest the eye wins where two overlap. The hero's wake (world/grassTrail.js, the
//        blades' own trailBend) lays it flat ('=' '~', a sheen) and the wake's spring raises it; mown it is
//        pale stubble dots, torn out (a blow's mark) bare earth, burnt it chars as the ground does.
//   'a3d1' .. 'a3d3'  a, more 3D by steps (DG.step): 1 each tuft lit on its moon side and shaded on the
//        other, a short shadow on the soil beside it, the tuft behind a taller one's tips in its shade, the
//        clumps a soft rise; 2 the same, stronger, the tufts taller (four rows), overlapping row over row;
//        3 as 2, and the tufts stand: a layer of billboards (world/dragonTufts.js) prints the very same
//        fans standing on the print's lattice, so a tuft in front of the hero hides his feet and the wake
//        bends it for real; the ground keeps the soil, its shade and the stubble
//   'a2' the meadow as a relief of laid tussocks; 'b' standing digit blades; 'c' a2 + sparse b (round 2's
//        other builds, not taken)
// Switch `dgCut` (the sword's cut IN the printed grass; default '0', round 2's: the arc mows the scorch
// map's coarse A channel):
//   'a'  the arc's exact path (world/mowFx.js cutArc) is cut into a fine map of its own (uDgCut, ~0.16 m):
//        every tuft rooted under it is shorn on that frame (its image gone, its tips thrown as chips of its
//        own letters in the grass's colour), and a crisp swath stays: a darker band of stubble, its cut
//        ends pale
//   'b'  a, and the line the blade cut prints bright for a moment (a stroke along the arc, ~0.15 s)
//
// dgGrass(...) is called once per cell by world/ground.js's look b (after the base relief is lit, before
// the print) with the cell's centre and hash, the meadow's density there, burn / torn, and may change the
// normal, the body colour, the tone, or pick the cell's glyph itself (idx >= 0). Needs COMMON_GLSL,
// DRAGON_PRINT_GLSL and the wake's uniforms (declared by ground.js) before it; the cut's uniforms (DG_U)
// ride in DP_FX_U, the one object every dragon-printed material spreads in.
//
// dgGrassLook() is what world.js / ground.js switch on ('a': printed, no 3D blades; 'b': the 3D blades
// stay); dgGrassOpt() the full option; dgCutOpt() the cut's.

const OPTS = ['a', 'a3d1', 'a3d2', 'a3d3', 'a2', 'b', 'c'];
/** The full option: '0' | 'a' | 'a3d1' | 'a3d2' | 'a3d3' | 'a2' | 'b' | 'c' (read once per build). */
export const dgGrassOpt = () => {
  const v = dragonLook('dgGrass');
  return OPTS.includes(v) ? v : '0';
};

/** What world.js / ground.js switch on: 'a' the grass printed in the ground (no 3D blades), 'b' the 3D
 *  blades stay (printed as digits), '0' off. */
export const dgGrassLook = () => {
  const v = dgGrassOpt();
  return v === 'a' || v === 'a2' || v.startsWith('a3d') ? 'a' : v === 'b' || v === 'c' ? 'b' : '0';
};

/** Is option `o` the printed tufts (a or one of its 3D steps)? */
export const dgTufted = (o = dgGrassOpt()) => o === 'a' || o.startsWith('a3d');

/** The cut in the printed grass: '0' (round 2: the coarse A), 'a' the fine swath, 'b' + the bright line. */
export const dgCutOpt = () => {
  const v = lookOf('dgCut', '0');
  return v === 'a' || v === 'b' ? v : '0';
};

/** The dragon grass's numbers (the printed tufts, the standing digit blades). */
export const DG = Object.freeze({
  /**
   * a, the printed tufts: one tuft a ground cell, its image rising north of its root `rows` cells at most:
   * `h` [base, x clump] cells tall in the thick of the meadow (x the meadow's density, +-25 % by its hash),
   * `show` [base, x density] the share of the cells that grow one; clumps a slow field at `clump` /m.
   * Lit: its tip `tip` brighter than its root (tone), the clumps `clumpTone`, the floor between tufts
   * `floor` darker; it leans `lean` (normal units) with the comb. The wake: laid `laid` along his way,
   * `drop` of its height gone, a `sheen` where it lies away from the eye.
   */
  tuft: Object.freeze({ rows: 3, h: [1.4, 1.8], show: [0.1, 0.35], clump: 0.9, tip: 0.4, clumpTone: 0.2, floor: 0.22, lean: 0.4, laid: 0.15, lit: 0.3, layAt: [0.1, 0.3], sheen: 0.16 }),
  /**
   * The 3D steps of a (dgGrass a3d1 .. a3d3; 'a' is step 0): `rows` the tallest tuft's image (cells), `h`
   * its height [base, x clump] (as tuft.h), `clumpTone` the clumps' rise (tone), `tip` root-to-tip tone;
   * `side` how much brighter a tuft's moon side than its far side (tone, across the fan), `cast` the shade
   * on the soil a tuft throws away from the moon (tone, a cell or two), `ao` the shade on a tuft just behind
   * a taller one's upper part (tone); `stand`: the tufts stand as billboards (world/dragonTufts.js).
   */
  step: Object.freeze({
    a: Object.freeze({ rows: 3, h: [1.4, 1.8], clumpTone: 0.2, tip: 0.4, side: 0, cast: 0, ao: 0, stand: false }),
    a3d1: Object.freeze({ rows: 3, h: [1.4, 1.9], clumpTone: 0.26, tip: 0.65, side: 0.22, cast: 0.2, ao: 0.16, stand: false }),
    a3d2: Object.freeze({ rows: 4, h: [1.6, 2.6], clumpTone: 0.32, tip: 0.9, side: 0.32, cast: 0.3, ao: 0.26, stand: false }),
    a3d3: Object.freeze({ rows: 4, h: [1.6, 2.6], clumpTone: 0.32, tip: 0.9, side: 0.32, cast: 0.3, ao: 0.26, stand: true }),
  }),
  /**
   * The cut (dgCut a / b): the map's `size` texels over the scorch map's extent; the swath `w` m wide round
   * the arc's edge stroke; its floor `dark` darker (tone), `stubs` of its cells a pale stub mark (`pale`
   * brighter, `fresh` the share of straw in it); the line's glow (b) fades over `flash` s from `bright`
   * (tone) in `glow` (its body; the drawn arc covers it its first moments); the tips thrown: `chips` a cut tuft (x the quality),
   * at most `maxChips` a stroke, each the print's `cell` (m), along the swing `fling` m/s, `up` m/s.
   */
  cut: Object.freeze({ size: 1024, w: 0.6, dark: 0.55, stubs: 0.85, pale: 0.5, fresh: 0.85, flash: 0.55, bright: 0.6, glow: [0.2, 0.3, 0.13], chips: 1.6, maxChips: 40, cell: [0.135, 0.229], fling: [1.2, 3.2], up: [1.6, 3.2] }),
  /**
   * b, the standing digit blades (world/grass.js): rooted on a checkerboard `lattice` [x, z] m of the print's
   * cells (alternate rows a cell over), where `keep` x the meadow's density lets one grow; each a column of
   * 1 .. `rows` digits by its height, a digit `cell` [w, h] m (the wyrm's 5 x 8 px at 720p along the blade's
   * billboard); the wind sways it `sway` x as much as a blade; lit as the print is, its root `root` x its
   * tip's light. c: the same blades, `sparse` over the relief.
   */
  blades: Object.freeze({ lattice: [0.135, 0.5], keep: 1.15, cell: [0.135, 0.229], rows: 3, sway: 0.6, root: 0.45 }),
  sparse: Object.freeze({ lattice: [0.27, 0.5], keep: 0.4, cell: [0.135, 0.229], rows: 3, sway: 0.6, root: 0.45 }),
  /** b: the ground under the blades this much darker (tone, x the meadow's density) */
  under: 0.3,
  /** the tussocks: a jittered lattice `ts` m apart, each `r` x ts across (by its hash) */
  ts: 1.0,
  r: [0.55, 0.35],
  /** the comb: the meadow's blades lie in slow swathes (rad: how far the field turns) */
  comb: Object.freeze({ scale: 0.07, rad: 5.0, k: 0.55 }),
  /** how far a clump's face tilts toward its blades' lay (normal units), the floor between clumps (tone) */
  tilt: 1.15,
  floor: 0.2,
  /** the wake: a laid cell's tilt along its lay, the sheen where it lies away from the eye (tone) */
  laid: 0.5,
  sheen: 0.18,
  /** stubble: the stub's tilt left, its paleness (tone), the share of the fresh straw in its body */
  stub: Object.freeze({ tilt: 0.12, tone: 0.12, fresh: 0.6 }),
  /** torn out (a blow's mark): the bare earth's body, its tone */
  soil: [0.055, 0.047, 0.04],
  soilTone: -0.06,
});

/**
 * The cut's uniforms (dgCut): the fine cut map world/mowFx.js writes (R8: 0 standing; 255 cut; 1 .. 250 cut
 * on frame (value - 1) of a 250-frame clock, floor(uTime x 60) mod 250, while the line still glows: the map
 * settles it to 255 after DG.cut.flash s) and its box (min x, min z, extent m, texels). They ride in DP_FX_U, so world/ground.js's material (which spreads it in when it is
 * built) has them; world/dragonTufts.js spreads them itself.
 */
export const DG_U = {
  uDgCut: { value: null },
  uDgCutBox: { value: new THREE.Vector4(-80, -80, 160, DG.cut.size) },
};
Object.assign(DP_FX_U, DG_U);

const g1 = (s) => gis(s).map((v) => v.toFixed(1)).join(', ');
const STUB = '.:·.:';
const LAY = '=~';
const TIPS = '\\|/';
const SLASH = '=/|\\';
const B = GRASS.blade;
const v3 = (a) => a.map((v) => v.toFixed(3)).join(', ');

/**
 * The tufts' shared GLSL (the ground's print and the standing layer, world/dragonTufts.js, must agree):
 * DG_SIZE, dgFresh, dgComb, the cut (dgCutAt, dgCutFlash), dgTuftN (the tuft rooted at a cell: how many cells
 * tall). Needs COMMON_GLSL, DRAGON_PRINT_GLSL and (for dgFresh) uDry before it.
 */
export function dgTuftGlsl(opt = dgGrassOpt(), cut = dgCutOpt()) {
  const S = DG.step[opt] ?? DG.step.a;
  const T = DG.tuft;
  const C = DG.cut;
  return /* glsl */ `
#define DG_CUT ${dgTufted(opt) ? { 0: 0, a: 1, b: 2 }[cut] : 0}
const vec2 DG_SIZE = vec2(${DP_CELL[0]}, ${DP_CELL[1]});
// the fresh cut's straw (world/grass.js's stubs)
vec3 dgFresh() { return mix(vec3(${v3(B.fresh)}), vec3(${v3(B.freshAsh)}), uDry) * 0.42; }
// the slow comb the meadow lies in (world xz, unit)
vec2 dgComb(vec2 p) {
  float ang = 0.6 + (dpFbm(p * ${DG.comb.scale.toFixed(3)} + 3.1) - 0.5) * ${DG.comb.rad.toFixed(2)};
  return vec2(cos(ang), sin(ang));
}
#if DG_CUT > 0
uniform sampler2D uDgCut;
uniform vec4 uDgCutBox;
// the sword cut the grass here (the fine map world/mowFx.js writes along the arc): 0 / 1
float dgCutAt(vec2 p) {
  vec2 uv = (p - uDgCutBox.xy) / uDgCutBox.z;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;
  return texelFetch(uDgCut, ivec2(uv * uDgCutBox.w), 0).r > 0.002 ? 1.0 : 0.0;
}
#else
float dgCutAt(vec2 p) { return 0.0; }
#endif
#if DG_CUT == 2
// the line the blade just cut, glowing a moment and fading (dgCut b): 0..1 at p; k its way on screen (0 '=',
// 1 '/', 2 '|', 3 '\\')
float dgCutFlash(vec2 p, out float k) {
  k = 0.0;
  vec2 uv = (p - uDgCutBox.xy) / uDgCutBox.z;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;
  ivec2 t = ivec2(uv * uDgCutBox.w);
  float v = floor(texelFetch(uDgCut, t, 0).r * 255.0 + 0.5);
  if (v < 0.5 || v > 250.5) return 0.0;
  float age = mod(mod(floor(uTime * 60.0), 250.0) - (v - 1.0), 250.0) / 60.0;
  if (age >= ${C.flash.toFixed(3)}) return 0.0;
  // its way: across the band's edge (the map's slope), turned along it, as the eye sees it
  float l = texelFetch(uDgCut, t - ivec2(1, 0), 0).r, r = texelFetch(uDgCut, t + ivec2(1, 0), 0).r;
  float dn = texelFetch(uDgCut, t - ivec2(0, 1), 0).r, up = texelFetch(uDgCut, t + ivec2(0, 1), 0).r;
  vec2 gr = vec2(step(0.002, r) - step(0.002, l), step(0.002, up) - step(0.002, dn));
  vec2 dir = length(gr) > 0.1 ? vec2(-gr.y, gr.x) : vec2(1.0, 0.0);
  float a = atan(-dir.y * 0.85, dir.x);
  if (a < 0.0) a += 3.14159265;
  k = mod(floor(a / 0.78539816 + 0.5), 4.0);
  return 1.0 - age / ${C.flash.toFixed(3)};
}
#endif
// THE TUFT rooted at ground cell 'cell' (one may root at any cell, more in the thick of the meadow): how many
// cells its image stands (0 none); hk the meadow's height there (cells), show the share of cells that grow
// one; hr its hash. A tuft the sword cut (dgCut) keeps its root, a stub, at most.
float dgTuftN(vec2 cell, float hk, float show, out float hr) {
  hr = hash12(cell);
  if (hr >= show) return 0.0;
  float n = floor(hk * (0.7 + 0.6 * fract(hr * 7.31 + 0.19)) + 0.5);
#if DG_CUT > 0
  if (n > 1.0 && dgCutAt(dpCellCenter(cell, DG_SIZE)) > 0.5) n = 1.0;
#endif
  return n;
}
// the meadow's tuft height (cells) and the share of cells with one, at density d and clump c (0..1)
float dgHk(float d, float c) { return d * (${S.h[0].toFixed(2)} + ${S.h[1].toFixed(2)} * c); }
float dgShow(float d) { return ${T.show[0].toFixed(2)} + ${T.show[1].toFixed(2)} * d; }
float dgClump(vec2 p) { return dpFbm(p * ${T.clump.toFixed(2)} + 11.7); }
`;
}

/** The GLSL for ground.js's look b (its [grass] hook): the option is baked in (the page's URL is fixed). */
export function dgGrassGlsl(opt, cut = dgCutOpt()) {
  // 1: standing tufts printed (a and its 3D steps); 2: the relief of laid tussocks (a2, c); 3: the floor
  // under the blades (b)
  const mode = dgTufted(opt) ? 1 : opt === 'a2' || opt === 'c' ? 2 : opt === 'b' ? 3 : 0;
  const T = DG.tuft;
  const S = DG.step[opt] ?? DG.step.a;
  const C = DG.cut;
  const depth = S.side > 0 || S.cast > 0 || S.ao > 0;
  return /* glsl */ `
${TRAIL_BEND_GLSL}
${dgTuftGlsl(opt, cut)}
#define DG_MODE ${mode}
#define DG_DEPTH ${depth ? 1 : 0}
#define DG_STAND ${S.stand && mode === 1 ? 1 : 0}
const float DG_STUB[${STUB.length}] = float[${STUB.length}](${g1(STUB)});
#if DG_MODE == 1
const float DG_LAY[2] = float[2](${g1(LAY)});
const float DG_TIP[3] = float[3](${g1(TIPS)});
const float DG_SLASH[4] = float[4](${g1(SLASH)});
// blades lying flat along d (world xz, unit): low marks, not the standing tufts' strokes ('-' where they
// lie across the view, '~' where they lie along it: foreshortened, combed)
float dgLaid(vec2 d) {
  vec2 s = vec2(d.x, -d.y * 0.45);
  return DG_LAY[abs(s.x) > 0.9 * length(s) ? 0 : 1];
}
// the tuft whose image covers the cell centred at cw (the nearest the eye wins: rooted furthest south, its
// image rising over the cells north of it): its segment (0 its root; -1 none), dx (cells from its middle),
// its height n (cells), its hash
float dgCover(vec2 cw, float hk, float show, out float dxb, out float nb, out float hb) {
  float j = floor(-cw.y / DG_SIZE.y);
  float seg = -1.0;
  dxb = 0.0;
  nb = 0.0;
  hb = 0.0;
  for (int k = ${S.rows - 1}; k >= 0; k--) {
    float r = j - float(k);
    float gx = cw.x / DG_SIZE.x + hash12(vec2(r, 3.7));
    float c0 = floor(gx);
    float best = 9.0;
    for (int m = -1; m <= 1; m++) {
      float cc = c0 + float(m);
      float hr;
      float n = dgTuftN(vec2(cc, r), hk, show, hr);
      if (n <= float(k)) continue;
      float dx = gx - (cc + 0.5);
      float hw = k == 0 ? 0.5 : float(k) >= n - 1.0 ? 1.5 : 1.0;
      if (abs(dx) > hw || abs(dx) >= best) continue;
      best = abs(dx); seg = float(k); dxb = dx; nb = n; hb = hr;
    }
    if (seg >= 0.0) break;
  }
  return seg;
}
#if DG_DEPTH == 1
// the soil's shade from the tufts beside it toward the moon (a tuft throws a short shadow away from it):
// 0..1
float dgCast(vec2 cw, float hk, float show) {
  vec2 md = normalize(uMoonDir.xz + vec2(1e-4, 0.0));
  float s = 0.0;
  for (int i = 1; i <= 2; i++) {
    vec2 q = cw + md * (0.15 * float(i));
    float r = floor(-q.y / DG_SIZE.y);
    vec2 cell = vec2(floor(q.x / DG_SIZE.x + hash12(vec2(r, 3.7))), r);
    float hr;
    float n = dgTuftN(cell, hk, show, hr);
    if (n >= float(i) + 1.0) s = max(s, 1.0 / float(i));
  }
  return s;
}
#endif
#endif
#if DG_MODE == 2
// the nearest tussock to p (the bigger one wins where two meet): its centre xy, radius z, hash w; q = the
// distance over its radius
vec4 dgTussock(vec2 p, out float q) {
  vec2 b = floor(p / ${DG.ts.toFixed(3)});
  vec4 best = vec4(p, 1.0, 0.0);
  q = 9.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = b + vec2(float(i), float(j));
      float hc = hash12(c * 1.37 + 17.3);
      vec2 o = (c + 0.15 + 0.7 * vec2(hc, hash12(c * 0.71 + 41.7))) * ${DG.ts.toFixed(3)};
      float R = ${DG.ts.toFixed(3)} * (${DG.r[0].toFixed(3)} + ${DG.r[1].toFixed(3)} * hash12(c + 7.9));
      float qq = distance(p, o) / R;
      if (qq < q) { q = qq; best = vec4(o, R, hc); }
    }
  }
  return best;
}
#endif
void dgGrass(vec2 cw, float h, float d, float burn, float torn, inout vec3 N, inout vec3 body, inout float tone, inout float idx) {
#if DG_MODE == 1
  if (d < 0.02 && torn < 0.004) return;
  // THE TUFTS: little fans of blades (dgTuftN), their images over the print (dgCover); clumps stand taller
  float clump = dgClump(cw);
  float show = dgShow(d);
  float hk = dgHk(d, clump);
  float dxb, nb, hb;
  float seg = dgCover(cw, hk, show, dxb, nb, hb);
#if DG_STAND == 1
  // (a3d3: the tufts stand as billboards, world/dragonTufts.js; the ground keeps the soil, its shade, the
  // stubble and the laid grass under them)
  seg = -1.0;
#endif
  // this cell's own state: mown / torn out (the scorch map's A), laid by the wake (or trodden, ?bend=0)
  float h3 = fract(h * 3.17 + 0.37);
  float mown = step(h3 * 0.92 + 0.04, torn * ${B.gain.toFixed(3)});
  float bare = smoothstep(${B.bare[0].toFixed(3)}, ${B.bare[1].toFixed(3)}, torn);
  vec4 tb = trailBend(cw, fract(h * 5.71 + 0.11));
  float bk = clamp(max(tb.w, scorch4At(cw).z * 0.8), 0.0, 1.0);
  vec2 P = length(tb.xy) > 1e-4 ? normalize(tb.xy) : dgComb(cw);
  tone += (clump - 0.5) * ${S.clumpTone.toFixed(2)} * d;
  if (bare > 0.5) {
    // torn out: bare earth
    body = vec3(${v3(DG.soil)});
    tone += ${DG.soilTone.toFixed(2)};
    return;
  }
  if (mown > 0.5) {
    // mown (the coarse A: a blow's mark, or the sword with dgCut 0): short pale stubble where grass grew
    if (burn < 0.35 && fract(h * 4.7) < 0.35 + 0.65 * d) {
      body = mix(body, dgFresh(), ${DG.stub.fresh.toFixed(2)});
      tone += ${DG.stub.tone.toFixed(2)};
      idx = DG_STUB[int(fract(h * 11.3) * ${STUB.length}.0)];
    } else tone -= ${T.floor.toFixed(2)} * d;
    return;
  }
#if DG_CUT > 0
  // the swath the sword cut (the fine map): a darker band of stubble, its cut ends pale, printed over the
  // tufts' images (the ground itself is cut along the arc, as the eye sees it)
  if (dgCutAt(cw) > 0.5) {
    tone -= ${C.dark.toFixed(2)} * d;
    body *= 0.8;
    if (burn < 0.35 && fract(h * 4.7) < ${C.stubs.toFixed(2)} * (0.4 + 0.6 * d)) {
      body = mix(body / 0.8, dgFresh(), ${C.fresh.toFixed(2)});
      tone += ${C.pale.toFixed(2)} + ${C.dark.toFixed(2)} * d;
      idx = DG_STUB[int(fract(h * 11.3) * ${STUB.length}.0)];
    }
#if DG_CUT == 2
    // the line the blade just cut: bright a moment, a stroke along the arc
    float fk;
    float fl = dgCutFlash(cw, fk);
    if (fl > 0.02 && burn < 0.35) {
      idx = DG_SLASH[int(clamp(fk, 0.0, 3.0))];
      body = mix(body, vec3(${v3(C.glow)}), fl);
      tone += (${C.dark.toFixed(2)} * d + ${C.bright.toFixed(2)}) * fl;
    }
#endif
    return;
  }
#endif
  if (bk > ${T.layAt[0].toFixed(2)} + ${T.layAt[1].toFixed(2)} * fract(h * 7.9)) {
    // laid by the wake: the blades lie along his way and out from his path, catching the moon by their lay
    // (toward it brighter, away darker) and a sheen where they lie away from the eye; the spring raises them
    vec2 away = normalize(cw - uCamPos.xz + vec2(0.0, 1e-3));
    vec2 t2 = P * ${T.laid.toFixed(2)} * bk;
    N = normalize(vec3(N.x + t2.x, N.y, N.z + t2.y));
    tone += (${T.lit.toFixed(2)} + ${T.sheen.toFixed(2)} * dot(P, away)) * bk;
    if (burn < 0.35) idx = dgLaid(P);
    return;
  }
  if (seg < 0.0) {
    // the floor between the tufts, in their shade (and in the short shadow a tuft throws beside it)
    tone -= ${T.floor.toFixed(2)} * d;
    body *= 0.8;
#if DG_DEPTH == 1
    tone -= ${S.cast.toFixed(2)} * d * dgCast(cw, hk, show);
#endif
    return;
  }
  // a tuft: dark at the root, its tips catch the light (leaning out: the side toward the moon brighter)
  float top = nb - 1.0;
  float s = top > 0.0 ? seg / top : 1.0;
  vec2 lean = seg >= top && nb >= 2.0 ? vec2(clamp(dxb, -1.0, 1.0) * ${T.lean.toFixed(2)}, -0.2) : vec2(0.0, -0.1 * s);
  lean = mix(lean, P * ${T.laid.toFixed(2)}, bk);
  N = normalize(vec3(N.x + lean.x, N.y, N.z + lean.y));
  tone += (s - 0.5) * ${S.tip.toFixed(2)};
#if DG_DEPTH == 1
  // its moon side lit, its far side in its own shade; just behind a taller tuft in front, in that one's
  float mx = uMoonDir.x / max(length(uMoonDir.xz), 1e-3);
  tone += ${S.side.toFixed(2)} * clamp(dxb / 1.2, -1.0, 1.0) * mx;
  float dx2, n2, h2;
  float s2 = dgCover(cw + vec2(0.0, DG_SIZE.y), hk, show, dx2, n2, h2);
  if (s2 >= 1.0 && s2 >= seg) tone -= ${S.ao.toFixed(2)} * (0.6 + 0.4 * min(s2 - seg, 1.0));
#endif
  body *= 0.85 + 0.3 * fract(hb * 5.3);
  if (seg >= top && nb >= 2.0 && burn < 0.35) idx = DG_TIP[dxb < -0.5 ? 0 : dxb > 0.5 ? 2 : 1];
#elif DG_MODE == 2
  if (d < 0.02 && torn < 0.004) return;
  // mown or standing: each cell is cut or stands (the blades' own test, world/grass.js); torn past
  // GRASS.blade.bare, torn OUT (a blow's mark: bare earth)
  float h3 = fract(h * 3.17 + 0.37);
  float mown = step(h3 * 0.92 + 0.04, torn * ${B.gain.toFixed(3)});
  float bare = smoothstep(${B.bare[0].toFixed(3)}, ${B.bare[1].toFixed(3)}, torn);
  // the clump this cell is part of; the slow comb the meadow lies in
  float q;
  vec4 T = dgTussock(cw, q);
  vec2 rv = cw - T.xy;
  float r = length(rv);
  vec2 rad = r > 1e-4 ? rv / r : vec2(1.0, 0.0);
  vec2 comb = dgComb(cw);
  float g = d * (0.7 + 0.3 * T.w);
  float qc = clamp(q, 0.0, 1.0);
  float inT = 1.0 - smoothstep(0.8, 1.0, q);
  // the blades fountain out of the clump (a dome: its face tilts out, most at 0.6 of its radius) and lie
  // with the comb; the floor between clumps lies in their shade
  vec2 D = normalize(rad + comb * ${DG.comb.k.toFixed(2)} + vec2(1e-4, 0.0));
  vec2 tilt = D * (2.6 * qc * (1.0 - qc * qc)) * ${DG.tilt.toFixed(2)} * g;
  float tn = -${DG.floor.toFixed(2)} * g * smoothstep(0.7, 1.0, q) + 0.05 * g * (1.0 - qc);
  // the wake lays it: the blades lie along his way and out from his path (the wake's spring raises them)
  vec4 tb = trailBend(cw, fract(h * 5.71 + 0.11));
  float tr = scorch4At(cw).z;
  float bk = clamp(max(tb.w, tr * 0.8), 0.0, 1.0);
  vec2 P = length(tb.xy) > 1e-4 ? normalize(tb.xy) : D;
  if (bk > 0.0) {
    vec2 away = normalize(cw - uCamPos.xz + vec2(0.0, 1e-3));
    tilt = mix(tilt, P * ${DG.laid.toFixed(2)} * g, bk);
    tn = mix(tn, ${DG.sheen.toFixed(2)} * g * dot(P, away), bk);
  }
  // mown: short pale stubble, flat; torn out: bare earth
  tilt = mix(tilt, D * ${DG.stub.tilt.toFixed(2)} * g, mown);
  tn = mix(tn, ${DG.stub.tone.toFixed(2)} * g, mown);
  tilt *= 1.0 - bare;
  N = normalize(vec3(N.x + tilt.x, N.y, N.z + tilt.y));
  body *= 0.9 + 0.2 * T.w * inT;
  body = mix(body, dgFresh(), ${DG.stub.fresh.toFixed(2)} * mown * (1.0 - burn));
  body = mix(body, vec3(${v3(DG.soil)}), bare);
  tone += mix(tn, ${DG.soilTone.toFixed(2)}, bare);
  if (mown > 0.5 && bare < 0.5 && burn < 0.35) idx = DG_STUB[int(fract(h * 11.3) * ${STUB.length}.0)];
#elif DG_MODE == 3
  // b: the floor under the standing blades (seen where they are cut, laid or thin), in their shade
  tone -= ${DG.under.toFixed(2)} * d;
  body *= 1.0 - 0.25 * d;
#endif
}
`;
}

export const DG_GRASS_GLSL = dgGrassGlsl(dgGrassOpt());
