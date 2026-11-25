import { dragonLook, DP_CELL } from '../render/dragonPrint.js';
import { gis } from '../render/glyphs.js';
import { GRASS } from './grassTuning.js';
import { TRAIL_BEND_GLSL } from './grassTrail.js';

// THE DRAGON GROUND'S GRASS. The owner (2026-11-24): "how can we make 3d looking grass with this style and
// still incorporate the player walking around and the grass bending as they go and the player cutting".
// Builds to compare, switch `dgGrass` (on the dragon ground, `?ground=b`):
//   '0'  the dragon ground as first shown (no grass of its own; the 3D blades hidden)
//   'a'  printed tufts: the grass is part of the lit relief the ground prints. The meadow is a field of
//        tussocks (clumps whose blades fountain out and lie with a slow comb), each a little dome of laid
//        blades: its face toward the moon prints bright digits, its far face and the floor between clumps
//        dark ones, so the meadow reads as a 3D surface of grass under the moon, the hero's and the stones'
//        shadows falling on it. The hero's wake (world/grassTrail.js, the blades' own trailBend) LAYS it:
//        the clumps flatten, the blades lie along his way and out from his path, so the light on them
//        changes (the side laid toward the moon brighter, the side laid away darker, a sheen where they lie
//        away from the eye, like flattened grass in a field); it rises back by the wake's spring. Mown (the
//        scorch map's torn channel A: the sword's arc writes it for this look, world/mowFx.js) a cell is
//        short pale stubble (flat, a stub mark); torn out (a blow's mark, past GRASS.blade.bare) bare
//        earth; burnt it chars as the ground does.
//   'a2' a, and the laid blades print as strokes along their lay ('- / | \') while they are down (the wake
//        reads as a combed swath), the lit rims of the clumps a few blade strokes
//   'b'  standing digit blades: the 3D blades (world/grass.js) kept, on an even lattice, each printed as a
//        short column of lit digits (dark at the root, brighter where the moon catches the tip); they bend
//        and are cut as today's grass is (a cut blade keeps its root digit, a pale stub)
//   'c'  a and b at once: the printed tufts, and over them a sparse lattice of standing digit blades
//
// dgGrass(...) is called once per cell by world/ground.js's look b (after the base relief is lit, before
// the print) with the cell's centre and hash, the meadow's density there, burn / torn, and may change the
// normal, the body colour, the tone, or pick the cell's glyph itself (idx >= 0). Needs COMMON_GLSL,
// DRAGON_PRINT_GLSL and the wake's uniforms (declared by ground.js) before it.
//
// dgGrassLook() is what world.js / ground.js switch on ('a': printed, no 3D blades; 'b': the 3D blades
// stay); dgGrassOpt() the full option.

const OPTS = ['a', 'a2', 'b', 'c'];
/** The full option: '0' | 'a' | 'a2' | 'b' | 'c' (read once per build). */
export const dgGrassOpt = () => {
  const v = dragonLook('dgGrass');
  return OPTS.includes(v) ? v : '0';
};

/** What world.js / ground.js switch on: 'a' the grass printed in the ground (no 3D blades), 'b' the 3D
 *  blades stay (printed as digits), '0' off. */
export const dgGrassLook = () => {
  const v = dgGrassOpt();
  return v === 'a' || v === 'a2' ? 'a' : v === 'b' || v === 'c' ? 'b' : '0';
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

const g1 = (s) => gis(s).map((v) => v.toFixed(1)).join(', ');
const STUB = '.:·.:';
const LAY = '=~';
const TIPS = '\\|/';
const B = GRASS.blade;

/** The GLSL for ground.js's look b (its [grass] hook): the option is baked in (the page's URL is fixed). */
export function dgGrassGlsl(opt) {
  // 1: standing tufts printed (a); 2: the relief of laid tussocks (a2, c); 3: the floor under the blades (b)
  const mode = opt === 'a' ? 1 : opt === 'a2' || opt === 'c' ? 2 : opt === 'b' ? 3 : 0;
  const v3 = (a) => a.map((v) => v.toFixed(3)).join(', ');
  const T = DG.tuft;
  return /* glsl */ `
${TRAIL_BEND_GLSL}
#define DG_MODE ${mode}
const float DG_STUB[${STUB.length}] = float[${STUB.length}](${g1(STUB)});
const vec2 DG_SIZE = vec2(${DP_CELL[0]}, ${DP_CELL[1]});
// the fresh cut's straw (world/grass.js's stubs)
vec3 dgFresh() { return mix(vec3(${v3(B.fresh)}), vec3(${v3(B.freshAsh)}), uDry) * 0.42; }
// the slow comb the meadow lies in (world xz, unit)
vec2 dgComb(vec2 p) {
  float ang = 0.6 + (dpFbm(p * ${DG.comb.scale.toFixed(3)} + 3.1) - 0.5) * ${DG.comb.rad.toFixed(2)};
  return vec2(cos(ang), sin(ang));
}
#if DG_MODE == 1
const float DG_LAY[2] = float[2](${g1(LAY)});
const float DG_TIP[3] = float[3](${g1(TIPS)});
// blades lying flat along d (world xz, unit): low marks, not the standing tufts' strokes ('-' where they
// lie across the view, '~' where they lie along it: foreshortened, combed)
float dgLaid(vec2 d) {
  vec2 s = vec2(d.x, -d.y * 0.45);
  return DG_LAY[abs(s.x) > 0.9 * length(s) ? 0 : 1];
}
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
  // THE TUFTS: one may root at any ground cell (more in the thick of the meadow), a little fan of blades
  // whose image rises north of its root (its root one cell, its tips three: '\ | /'); the nearest the eye
  // wins where two overlap (rooted furthest south); clumps stand taller
  float j = floor(-cw.y / DG_SIZE.y);
  float clump = dpFbm(cw * ${T.clump.toFixed(2)} + 11.7);
  float show = ${T.show[0].toFixed(2)} + ${T.show[1].toFixed(2)} * d;
  float hk = d * (${T.h[0].toFixed(2)} + ${T.h[1].toFixed(2)} * clump);
  float seg = -1.0, dxb = 0.0, nb = 0.0, hb = 0.0;
  for (int k = ${T.rows - 1}; k >= 0; k--) {
    float r = j - float(k);
    float gx = cw.x / DG_SIZE.x + hash12(vec2(r, 3.7));
    float c0 = floor(gx);
    float best = 9.0;
    for (int m = -1; m <= 1; m++) {
      float cc = c0 + float(m);
      float hr = hash12(vec2(cc, r));
      if (hr >= show) continue;
      float n = floor(hk * (0.7 + 0.6 * fract(hr * 7.31 + 0.19)) + 0.5);
      if (n <= float(k)) continue;
      float dx = gx - (cc + 0.5);
      float hw = k == 0 ? 0.5 : float(k) >= n - 1.0 ? 1.5 : 1.0;
      if (abs(dx) > hw || abs(dx) >= best) continue;
      best = abs(dx); seg = float(k); dxb = dx; nb = n; hb = hr;
    }
    if (seg >= 0.0) break;
  }
  // this cell's own state: mown / torn out (the scorch map's A), laid by the wake (or trodden, ?bend=0)
  float h3 = fract(h * 3.17 + 0.37);
  float mown = step(h3 * 0.92 + 0.04, torn * ${B.gain.toFixed(3)});
  float bare = smoothstep(${B.bare[0].toFixed(3)}, ${B.bare[1].toFixed(3)}, torn);
  vec4 tb = trailBend(cw, fract(h * 5.71 + 0.11));
  float bk = clamp(max(tb.w, scorch4At(cw).z * 0.8), 0.0, 1.0);
  vec2 P = length(tb.xy) > 1e-4 ? normalize(tb.xy) : dgComb(cw);
  tone += (clump - 0.5) * ${T.clumpTone.toFixed(2)} * d;
  if (bare > 0.5) {
    // torn out: bare earth
    body = vec3(${v3(DG.soil)});
    tone += ${DG.soilTone.toFixed(2)};
    return;
  }
  if (mown > 0.5) {
    // mown: short pale stubble where grass grew
    if (burn < 0.35 && fract(h * 4.7) < 0.35 + 0.65 * d) {
      body = mix(body, dgFresh(), ${DG.stub.fresh.toFixed(2)});
      tone += ${DG.stub.tone.toFixed(2)};
      idx = DG_STUB[int(fract(h * 11.3) * ${STUB.length}.0)];
    } else tone -= ${T.floor.toFixed(2)} * d;
    return;
  }
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
    // the floor between the tufts, in their shade
    tone -= ${T.floor.toFixed(2)} * d;
    body *= 0.8;
    return;
  }
  // a tuft: dark at the root, its tips catch the light (leaning out: the side toward the moon brighter)
  float top = nb - 1.0;
  float s = top > 0.0 ? seg / top : 1.0;
  vec2 lean = seg >= top && nb >= 2.0 ? vec2(clamp(dxb, -1.0, 1.0) * ${T.lean.toFixed(2)}, -0.2) : vec2(0.0, -0.1 * s);
  lean = mix(lean, P * ${T.laid.toFixed(2)}, bk);
  N = normalize(vec3(N.x + lean.x, N.y, N.z + lean.y));
  tone += (s - 0.5) * ${T.tip.toFixed(2)};
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
