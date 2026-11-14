import { ellipsoidGeometry, limbGeometry } from '../../../render/glyphGeometry.js';
import { gridGeometry, tatterStrip, starGeometry, mergeGeometries, sub, spike, boxGeometry } from '../heroGeo.js';
import { SWORD_DIMS, swordHilt } from './wanderer.js';

// The moon looks: the longsword rebuilt true to the owner's sheet, for the owner's pick (?sword=, the
// Lab's 'sword' row). The longsword in heroParts.js is a beaded sawtooth with an arrowhead point at
// the game camera; these blades are built here, in code, from a profile: a broad forte flaring at
// the guard, one long straight taper, a short swept point, four small notches staggered up the
// lower edges, a ridge between dark flats and bright edge bands, a silver cage of scallops up the
// forte. Every look keeps the longsword's dims (SWORD_DIMS: the hit segment, the anim clamps, REACH
// are untouched) and its materials (M.armor forte, M.blade core, M.bladeTip edge: part 17 flares).
//   sheet     the sheet's blade on the longsword's swept guard, a silver rim round the kite pommel
//   ribbon    the same with an unforked strip of his own cloak hem hanging off the pommel (NOT a
//             tassel: the Ash Disciple's is a cord and a forked fringe; this echoes it all the same)
//   crescent  a silver crescent moon cradling the star gem in place of the swept quillons (it echoes
//             the Starless Lord's crescents)
// After the pick the winner becomes 'wanderer.sword' and the others go (gear/README.md).

/** The ribbon off the pommel: knot `at` (sword z), two segments `len` long and `w` wide, its spring
 *  (`out`, `lag`, `max`: anim.js streamers), a violet `bead` at the knot. */
const RIBBON = { at: -0.2, len: [0.2, 0.24], w: [0.05, 0.03], out: 0.04, lag: 0.75, max: 2.4, bead: 0.012, seed: 707 };
/** The crescent guard (sword space, x / z): the outer circle [x, z, r] minus the inner one, `th`
 *  thick in y; horns at (±0.061, 0.254); gunmetal quillon stubs `stubs` long off the guard block. */
const CRESCENT = { outer: [0, 0.19, 0.088], inner: [0, 0.215, 0.072], th: 0.013, stubs: 0.06 };

const SHEET = {
  blade: {
    // [z, half width] (sword space, m): the forte flares at the guard, one long taper, the point
    profile: [[0.11, 0.034], [0.132, 0.058], [0.15, 0.048], [0.2, 0.0445], [0.79, 0.034], [0.84, 0.028], [0.885, 0.017], [0.93, 0]],
    // [z, side]: a notch cut into that edge (−1 the −X edge): `depth` deep, its deepest point `lead`
    // m up from z, closing at z + `len`
    notches: [[0.31, -1], [0.37, 1], [0.44, -1], [0.5, 1]], notch: { depth: 0.01, lead: 0.006, len: 0.022 },
    ridge: 0.012, // m the ridge stands proud of the flats (tapering to 0 at the point)
    core: 0.66, // the dark flats end at this share of the notchless half width (the rest is bright edge)
    fuller: null,
  },
  cage: {
    rail: { x: 0.047, z: [0.11, 0.3], w: 0.006, th: 0.014 },
    scallops: [[0.14, 0.024, 0.008], [0.2, 0.019, 0.007], [0.26, 0.014, 0.006]], // [z, length, radius]
    dir: [0.8, 0, 0.6], curl: 0.3,
  },
  guard: 'swept', pommel: { rim: true, ring: false }, grip: { bands: 7 }, gem: 0.116, ribbon: null,
};
export const SWORD_LOOKS = {
  sheet: SHEET,
  ribbon: { ...SHEET, pommel: { rim: true, ring: true }, ribbon: RIBBON },
  crescent: { ...SHEET, guard: CRESCENT, gem: 0.19 },
};

/** ?sword= value → the weapon item id (gear/index.js swordFromUrl; the Lab's 'sword' row). */
export const SWORD_PARAM = { today: 'wanderer.sword', sheet: 'moon.sheet', ribbon: 'moon.ribbon', crescent: 'moon.crescent' };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
/** Piecewise-linear lookup in [[z, v], ...] (held flat past the ends). */
function poly(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) {
      const [z0, v0] = pts[i - 1], [z1, v1] = pts[i];
      return z1 > z0 ? v0 + ((v1 - v0) * (z - z0)) / (z1 - z0) : v1;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * The blade from `spec` (SWORD_LOOKS[*].blade) as three geometries { forte, core, edge } (sword
 * space, the blade along +Z, its width on X, the flats facing ±Y): a JS port of hero_parts.py
 * build_blade. Across each half, fr 0 = the ridge … 0.5 = where the dark core ends … 1 = the cutting
 * edge. aGUV = (x, z) exactly as hero_parts.py (the blade's glyph columns are tied to it); the two
 * halves carry ink sub-ids 0 / 1 (the ridge prints as a line). Each grid computes its own normals
 * (hard facets).
 */
export function bladeGeometry(spec) {
  const tip = SWORD_DIMS.drawnTip, forteZ = SWORD_DIMS.forte, P = spec.profile, N = spec.notch;
  const z0 = P[0][0];
  const hw0 = (z) => poly(P, z);
  const hw = (z, side) => {
    let w = hw0(z);
    for (const [zn, s] of spec.notches) {
      if (s !== side || z <= zn || z >= zn + N.len) continue;
      const t = z < zn + N.lead ? (z - zn) / N.lead : 1 - (z - zn - N.lead) / (N.len - N.lead);
      w -= N.depth * clamp01(t);
    }
    return Math.max(0, w);
  };
  const pt = (fr, z, top, side, o) => {
    const h = hw(z, side);
    const th = spec.ridge * Math.pow(clamp01((tip - z) / 0.2), 0.7);
    const inner = Math.min(h, hw0(z)) * spec.core * clamp01((tip - z) / 0.12);
    const x = fr <= 0.5 ? lerp(0, inner, fr / 0.5) : lerp(inner, h, (fr - 0.5) / 0.5);
    const y = h > 1e-6 ? th * (1 - x / h) : 0;
    o[0] = side * x;
    o[1] = top ? y : -y;
    o[2] = z;
    o[3] = side * x;
    o[4] = z;
  };
  // rows: the profile's and the notches' heights, the point, every 0.04 m over its last 0.2 m
  const uniq = (zs) => [...new Set(zs.map((z) => Math.round(z * 1e6) / 1e6))].sort((a, b) => a - b);
  const Z = uniq([
    ...P.map(([z]) => z).filter((z) => z >= forteZ && z <= tip),
    ...spec.notches.flatMap(([zn]) => [zn, zn + N.lead, zn + N.len]),
    forteZ, tip,
    ...Array.from({ length: 6 }, (_, i) => tip - 0.2 + i * 0.04),
  ]).filter((z) => z >= forteZ && z <= tip);
  const Zf = uniq([...P.map(([z]) => z).filter((z) => z >= z0 && z <= forteZ), z0, forteZ]);
  const row = (rows, t) => rows[Math.round(t * (rows.length - 1))];
  const forte = [], core = [], edge = [];
  for (const side of [-1, 1]) {
    const k0 = side < 0 ? 0 : 1, k1 = 1 - k0;
    // the gunmetal forte: plain halves, the ridge (top) → the edge → the ridge (bottom)
    forte.push(sub(gridGeometry(2, Zf.length - 1, (u, t, o) => pt(1 - Math.abs(2 * u - 1), row(Zf, t), u < 0.5, side, o), side > 0), k0));
    // the steel: a dark core either side of the ridge (top and bottom faces) …
    core.push(sub(gridGeometry(1, Z.length - 1, (u, t, o) => pt(0.5 * u, row(Z, t), true, side, o), side > 0), k0));
    core.push(sub(gridGeometry(1, Z.length - 1, (u, t, o) => pt(0.5 * u, row(Z, t), false, side, o), side < 0), k0));
    // … and a bright band out to the edge
    edge.push(sub(gridGeometry(2, Z.length - 1, (u, t, o) => pt(1 - 0.5 * Math.abs(2 * u - 1), row(Z, t), u < 0.5, side, o), side > 0), k1));
  }
  return { forte: mergeGeometries(forte), core: mergeGeometries(core), edge: mergeGeometries(edge) };
}

/** The crescent guard (CRESCENT) as a ±Y plate and its side walls (sword space; aGUV x / z). */
function crescentGeometry(C) {
  const [, oz, ro] = C.outer, [, iz, ri] = C.inner, h = C.th / 2;
  // the horns: where the two circles meet
  const hz = (ro * ro - ri * ri + iz * iz - oz * oz) / (2 * (iz - oz)), hx = Math.sqrt(Math.max(0, ro * ro - (hz - oz) * (hz - oz)));
  const aO = Math.atan2(hx, -(hz - oz)), aI = Math.atan2(hx, -(hz - iz)); // angles from −Z (the bottom)
  const N = 16;
  const at = (u, v, o, y) => {
    const a = (2 * u - 1), po = a * aO, pi = a * aI; // horn → bottom → horn
    const xo = ro * Math.sin(po), zo = oz - ro * Math.cos(po), xi = ri * Math.sin(pi), zi = iz - ri * Math.cos(pi);
    o[0] = lerp(xi, xo, v);
    o[1] = y;
    o[2] = lerp(zi, zo, v);
    o[3] = o[0];
    o[4] = o[2];
  };
  const parts = [
    gridGeometry(N, 1, (u, t, o) => at(u, t, o, h), false),
    gridGeometry(N, 1, (u, t, o) => at(u, t, o, -h), true),
    // the side walls: the outer rim and the inner one, top to bottom
    gridGeometry(N, 1, (u, t, o) => at(u, 1, o, lerp(h, -h, t)), false),
    gridGeometry(N, 1, (u, t, o) => at(u, 0, o, lerp(h, -h, t)), true),
  ];
  return mergeGeometries(parts);
}

/** One moon look `L` (SWORD_LOOKS) on the sword joint. Returns the gem's marker joint and, for the
 *  ribbon, its streamer (flagged `weapon`: the weapon's own, not a sheet of the cloak). */
function buildMoonblade({ sword, M, mesh, joint }, L) {
  const D = SWORD_DIMS;
  const B = bladeGeometry(L.blade);
  mesh(sword, B.forte, M.armor);
  mesh(sword, B.core, M.blade);
  mesh(sword, B.edge, M.bladeTip);
  // the grip: leather bands (alternate ink sub-ids: a wrapped grip) over the longsword's 0.16 m
  {
    const n = Math.max(1, L.grip?.bands ?? 7), len = 0.16 / n, bands = [];
    for (let i = 0; i < n; i++) {
      const r0 = lerp(0.016, 0.017, i / n), r1 = lerp(0.016, 0.017, (i + 1) / n);
      bands.push(sub(limbGeometry({ length: len, r0, r1, radial: 6, rings: 1, capSegs: 1 }).translate(0, 0, -D.gripBack + i * len), i & 1));
    }
    mesh(sword, mergeGeometries(bands), M.leather);
  }
  // the hilt: the longsword's (swept guard), or its block and pommel round a crescent
  const swept = L.guard === 'swept';
  const H = swordHilt(D, { swept, gem: L.gem, rim: !!L.pommel?.rim, ring: !!L.pommel?.ring });
  if (!swept) {
    const C = L.guard;
    for (const s of [-1, 1]) H.armor.push(spike(C.stubs, 0.012, [s * 0.026, 0, D.guard], [s, 0, 0.2], [0, 0, 1]));
    H.trim.push(crescentGeometry(C));
  }
  // the cage: a silver rail up each side of the forte with scallops curling off it
  if (L.cage) {
    const K = L.cage, Rl = K.rail, zl = Rl.z[1] - Rl.z[0];
    for (const s of [-1, 1]) {
      H.trim.push(boxGeometry(Rl.w, Rl.th, zl, s * Rl.x, 0, (Rl.z[0] + Rl.z[1]) / 2));
      for (const [z, len, r] of K.scallops) H.trim.push(spike(len, r, [s * Rl.x, 0, z], [s * K.dir[0], 0, K.dir[2]], [0, 0, 1], K.curl));
    }
  }
  mesh(sword, mergeGeometries(H.armor), M.armor);
  mesh(sword, mergeGeometries(H.trim), M.trim);
  mesh(sword, starGeometry(0.023, 0.033, 0.008, 0.031, 0.005), M.gem, 0, 0, L.gem);
  const gem = joint(sword, 0, 0, L.gem);
  const streamers = [];
  if (L.ribbon) {
    const R = L.ribbon;
    const knot = joint(sword, 0, 0, R.at);
    mesh(knot, ellipsoidGeometry(R.bead, R.bead, R.bead, { widthSegs: 6, heightSegs: 4 }), M.gem);
    const s0 = joint(knot);
    mesh(s0, sub(tatterStrip(R.len[0], R.w[0], { tip: false, curl: 0.05, seed: R.seed }), 0), M.hem);
    const s1 = joint(s0, 0, -R.len[0], 0);
    mesh(s1, sub(tatterStrip(R.len[1], R.w[1], { fork: false, curl: 0.12, seed: R.seed + 1 }), 1), M.hem);
    streamers.push({ segs: [s0, s1], len: R.len, out: R.out, lag: R.lag, max: R.max, weapon: true });
  }
  return { gem, streamers };
}

/** The three looks as weapon-slot items (gear/index.js registers them). */
export const MOON_ITEMS = Object.entries({ sheet: 'Moonlit Longsword', ribbon: 'Moonlit Longsword, hem ribbon', crescent: 'Crescent Moonblade' }).map(([k, name]) => ({
  id: `moon.${k}`, slot: 'weapon', name, dims: SWORD_DIMS, build: (ctx) => buildMoonblade(ctx, SWORD_LOOKS[k]),
}));
