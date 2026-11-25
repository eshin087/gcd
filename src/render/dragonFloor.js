import * as THREE from 'three';
import { gi, gis } from './glyphs.js';
import { DRAGON_PRINT_GLSL, DP_CELL, dragonPrintUniforms, dragonLook } from './dragonPrint.js';
import { DRAGON_PRINT_FX_GLSL, DP_FX_U } from './dragonPrintFx.js';
import { DRAGON_STEP_GLSL, DP_STEP_U } from './dragonStep.js';

// THE DRAGON-PRINTED FLOOR (switch `dpFloor`; the owner, 2026-11-24: "can we try this art style on not just
// the ground and things like the stone and other textures?"). Every floor drawn with the carved material
// (render/materials.js createCarvedGlyphMaterial: flagstones, paving, plates, tiles, asphalt, the broken
// floor's earth and shards) prints as the dragon ground does (world/ground.js look b): a LIT SOURCE printed
// in the wyrm's fine digits on the ground's own world-anchored lattice, a dark body with brighter digits only
// where light catches, every cell filled.
//
//   the lattice   the GROUND'S (DP_CELL, dpLattice), seen along the camera's view: a point raised y above the
//                 ground prints in the ground cell it covers on screen (z - y cot(pitch)), so a slab's top, its
//                 chamfer and its wall run on one lattice with the ground round them, the same size on every
//                 facet and nothing swims (the lattice is fixed in the world).
//   the source    per cell, at the cell's centre ON the facet (the view ray through the cell's ground centre,
//                 met with the facet's plane): the facet's own normal (a slab's top, its moonlit chamfer, its
//                 wall), bent by a fine relief: broad worn hollows and the stone's grain, cracks as GROOVES
//                 (one wall catches the moon, the other and the bottom fall dark), chips broken out of the
//                 chamfer, moss as a soft green cushion. Lit as the ground: the moon (its shadow map, the
//                 upgrades' cloud), the point lights; the tone picks the digit (dpGlyph) and its brightness.
//   the rim       a lip one cell wide at every edge of a slab's top (aRim, addSlabRim: the distance to the
//                 edge, made when the set is built, or on the first draw), its normal turned outward: lit on
//                 the side that faces the moon, dark on the others, so the slab reads raised off the ground
//                 and the joints between slabs read as dark seams. Chips are broken out of it.
//   the body      the stone's own carved colour (aCol: each level's palette kept), pulled toward grey (`sat`)
//                 and a touch cooler (`tint`), times the material's `gain` (live: the ring's floor by form)
//                 and `k`; seen by the ground's light plus the material's `inkFloor` (a slab still prints in
//                 a deep shadow; its top keeps the `sky`'s tone there).
//   also          the scorch (ash digits where it burnt, embers), the script wave (a re-rolled cell prints lit
//                 in its green), the flash prints (?prints=a), the four upgrades' hooks (dragonPrintFx.js:
//                 dpCloud, dpContact, dpRipple, dpRidge; the ridge's neighbours carry the slab's drop past
//                 its edge, so an outline can follow a slab).
//
// Looks (dragonLook('dpFloor'); read when a material is built):
//   '0'  the carved glyphs as they ship (nothing here runs)
//   'a'  the author's pick: a calm relief (the facets, a soft wear, shallow cracks, a few chips)
//   'b'  a stronger relief: deeper wear and grain, wider cracks, more chips, a brighter rim
// A set may give its own numbers (`o.dp` in createCarvedGlyphMaterial: any key of DP_FLOOR.a).

/** The looks' numbers (a set overrides the palette's, not the relief's: `dp` in createCarvedGlyphMaterial).
 *  The palette: k body brightness (x the material's gain; a: tuned for Cinderwood's flagstones, which give
 *  none); sat how much of the stone's own hue is kept (0 grey); tint cooler; top a slab's top a tone over
 *  the flat ground where the moon reaches it (stone is smoother than soil); sky the tone a top keeps in
 *  the moon's shadow; moss how much of the carved moss shows; wet a sheen of the moon and the lights in
 *  puddles (wet asphalt). The relief: wear / grain the broad hollows and the fine grain (slope); crack the
 *  grooves' depth (x the material's crackAmount); chip the share of rim cells broken out; rim the lit lip's
 *  lift; rimW the lip's width (m; 0 none: tarmac); lip how far the lip's normal turns outward. */
export const DP_FLOOR = Object.freeze({
  a: Object.freeze({ k: 1.5, sat: 0.35, tint: [0.95, 0.99, 1.06], top: 0.3, sky: 0.22, wear: 0.35, grain: 0.2, crack: 0.8, chip: 0.25, rim: 0.6, rimW: 0.18, lip: 1.2, moss: 0.35, wet: 0 }),
  b: Object.freeze({ k: 1.5, sat: 0.35, tint: [0.95, 0.99, 1.06], top: 0.3, sky: 0.22, wear: 0.9, grain: 0.5, crack: 1.4, chip: 0.45, rim: 0.7, rimW: 0.24, lip: 1.6, moss: 0.5, wet: 0 }),
});

/** The floor's look: 0 off ('0'), 1 'a', 2 'b'. */
export function dpFloorLook() {
  const v = dragonLook('dpFloor');
  return v === 'a' ? 1 : v === 'b' ? 2 : 0;
}

/** The uniforms DP_FLOOR_GLSL reads (a fresh object per material; the upgrades' and the prints' shared). */
export function dpFloorUniforms(look, o = {}, pitch = (58 * Math.PI) / 180) {
  const d = { ...(look === 2 ? DP_FLOOR.b : DP_FLOOR.a), ...(o ?? {}) };
  const t = d.tint ?? [1, 1, 1];
  return {
    ...dragonPrintUniforms(),
    ...DP_FX_U,
    ...DP_STEP_U,
    uDpView: { value: new THREE.Vector3(Math.cos(pitch) / Math.sin(pitch), Math.sin(pitch), Math.cos(pitch)) },
    uDpBody: { value: new THREE.Vector4(t[0], t[1], t[2], d.k) },
    uDpSat: { value: d.sat },
    uDpRelief: { value: new THREE.Vector4(d.wear, d.grain, d.crack, d.chip) },
    uDpLift: { value: new THREE.Vector4(d.rim, d.moss, d.wet, d.rimW) },
    uDpRim: { value: new THREE.Vector4(d.lip, 0, d.top, d.sky) },
    uDpAsh: { value: gis('.,:;~') },
    // a crack's stroke by its way on screen: dash, slash, bar, backslash
    uDpStroke: { value: new THREE.Vector4(gi('-'), gi('/'), gi('|'), gi('\\')) },
  };
}

// ---------------------------------------------------------------- the rim
/** How far the rim's search for the nearest edge reaches (m; the print's lip is a little over a cell): a
 *  top triangle with no edge of its own takes at most this. One standing on an edge takes the distance to
 *  its line uncapped (at most RIM_MAX), so the distance stays linear across it and the lip keeps its width. */
export const RIM_CAP = 0.6;
export const RIM_MAX = 8;
/** A cracked slab's pieces (world/floor.js 'pavingCracked', forest.js 'flagstoneShards'): their rim starts
 *  at CRACK_RIM instead of 1, so the print draws every edge of a piece as a crack, a dark seam (a crack
 *  of a few cm is narrower than a cell: it can only print as its pieces' edges). */
export const CRACK_RIM = 10;
const CRACKED = /Cracked$|^flagstoneShards$/;
const crackMesh = (o) => CRACKED.test(o?.name ?? '');

/**
 * THE RIM (`aRim`): per vertex, 1 + how far the point lies inside its slab's top from the top's edge (m;
 * RIM_CAP, RIM_MAX), so the print can turn a lip at every edge (lit on the side facing the moon, dark on the
 * other: the slab reads raised) one cell wide whatever the slab's shape. A slab's top is its up-facing
 * triangles (n.y > 0.93); its edge, the edges of those used by one of them only. A top triangle with an
 * edge on the rim takes the distance to that edge's line (exact near it: linear in the triangle); one with
 * none the nearest edge's distance at each corner. Every other triangle (a chamfer, a wall, a shard heaved
 * steep) is all rim (1). 0 (no attribute) = unknown: the print leaves the rim alone.
 * Non-indexed geometry, in place; idempotent. Cost: linear (a grid of the edges); ~10 ms for a paving.
 */
export function addSlabRim(geo, crack = false) {
  if (!geo?.attributes?.position || geo.index || geo.attributes.aRim) return geo;
  const rim = slabRimArray(geo, crack);
  if (rim) geo.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
  return geo;
}

/** addSlabRim's values for `geo` (non-indexed), or null. `crack`: its pieces are a broken slab's (CRACK_RIM). */
export function slabRimArray(geo, crack = false) {
  const P = geo?.attributes?.position?.array;
  if (!P || geo.index) return null;
  const nv = P.length / 3, T = Math.floor(nv / 3);
  const base = crack ? CRACK_RIM : 1;
  const rim = new Float32Array(nv).fill(base);
  // the corners as ids (positions met within 2 mm are one corner)
  const ids = new Int32Array(nv);
  const seen = new Map();
  for (let i = 0; i < nv; i++) {
    const q = (v) => Math.max(0, Math.min(131071, Math.round(v * 500) + 65536));
    const k = q(P[i * 3]) * 17179869184 + q(P[i * 3 + 1]) * 131072 + q(P[i * 3 + 2]);
    let id = seen.get(k);
    if (id === undefined) seen.set(k, (id = seen.size));
    ids[i] = id;
  }
  const NID = seen.size + 1;
  // the tops
  const top = new Uint8Array(T);
  for (let t = 0; t < T; t++) {
    const a = t * 9;
    const ux = P[a + 3] - P[a], uy = P[a + 4] - P[a + 1], uz = P[a + 5] - P[a + 2];
    const vx = P[a + 6] - P[a], vy = P[a + 7] - P[a + 1], vz = P[a + 8] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    top[t] = l > 1e-9 && Math.abs(ny) / l > 0.93 ? 1 : 0;
  }
  // their edges: used once = the rim
  const ek = (i, j) => (ids[i] < ids[j] ? ids[i] * NID + ids[j] : ids[j] * NID + ids[i]);
  const uses = new Map();
  for (let t = 0; t < T; t++) {
    if (!top[t]) continue;
    for (let e = 0; e < 3; e++) {
      const k = ek(t * 3 + e, t * 3 + ((e + 1) % 3));
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  // the rim's segments on a grid (0.5 m) for the corners of tops with no edge on it
  const G = 0.5, grid = new Map(), segs = [];
  // (each top triangle's own rim edges: their segments' start in `segs`, -1 none)
  const own3 = new Int32Array(T * 3).fill(-1);
  const gk = (gx, gz) => (gx + 32768) * 65536 + (gz + 32768);
  for (let t = 0; t < T; t++) {
    if (!top[t]) continue;
    for (let e = 0; e < 3; e++) {
      const i = t * 3 + e, j = t * 3 + ((e + 1) % 3);
      if (uses.get(ek(i, j)) !== 1) continue;
      const s = segs.length;
      own3[t * 3 + e] = s;
      segs.push(P[i * 3], P[i * 3 + 2], P[j * 3], P[j * 3 + 2]);
      const x0 = Math.floor(Math.min(P[i * 3], P[j * 3]) / G), x1 = Math.floor(Math.max(P[i * 3], P[j * 3]) / G);
      const z0 = Math.floor(Math.min(P[i * 3 + 2], P[j * 3 + 2]) / G), z1 = Math.floor(Math.max(P[i * 3 + 2], P[j * 3 + 2]) / G);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const k = gk(gx, gz);
          let l = grid.get(k);
          if (!l) grid.set(k, (l = []));
          l.push(s);
        }
      }
    }
  }
  const segDist = (s, x, z) => {
    const ax = segs[s], az = segs[s + 1], bx = segs[s + 2], bz = segs[s + 3];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const u = L2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
    return Math.hypot(x - ax - dx * u, z - az - dz * u);
  };
  const lineDist = (s, x, z) => {
    const ax = segs[s], az = segs[s + 1], dx = segs[s + 2] - ax, dz = segs[s + 3] - az, L = Math.hypot(dx, dz);
    return L > 1e-6 ? Math.abs((x - ax) * dz - (z - az) * dx) / L : Math.hypot(x - ax, z - az);
  };
  const nearest = (x, z) => {
    let d = RIM_CAP;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const l = grid.get(gk(gx + ox, gz + oz));
        if (l) for (const s of l) d = Math.min(d, segDist(s, x, z));
      }
    }
    return d;
  };
  for (let t = 0; t < T; t++) {
    if (!top[t]) continue;
    const ownN = (own3[t * 3] >= 0) + (own3[t * 3 + 1] >= 0) + (own3[t * 3 + 2] >= 0);
    for (let e = 0; e < 3; e++) {
      const v = t * 3 + e, x = P[v * 3], z = P[v * 3 + 2];
      let d;
      if (ownN) {
        d = RIM_MAX;
        for (let k = 0; k < 3; k++) if (own3[t * 3 + k] >= 0) d = Math.min(d, lineDist(own3[t * 3 + k], x, z));
      } else d = nearest(x, z);
      rim[v] = base + Math.min(RIM_MAX, d);
    }
  }
  return rim;
}

// a geometry met on its first draw (a set that did not give its meshes their rim): its rim is made then
// and goes in at the start of the next frame (scene.onBeforeRender: before the renderer uploads the frame's
// attributes, so the draw binds it; added during a draw it would never be bound)
const PENDING = [];
/** The carved material's first draw of `geometry` with no rim (materials.js onBeforeRender). Never throws. */
export function lazySlabRim(scene, geometry, object = null) {
  if (!geometry || geometry.attributes?.aRim || geometry.userData.dpRimTried) return;
  geometry.userData.dpRimTried = true;
  let rim = null;
  try {
    rim = slabRimArray(geometry, crackMesh(object));
  } catch {
    rim = null;
  }
  if (!rim || !scene?.isScene) return;
  PENDING.push(geometry, rim);
  if (scene.userData.dpRimHook) return;
  scene.userData.dpRimHook = true;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (...args) {
    while (PENDING.length) {
      const r = PENDING.pop(), g = PENDING.pop();
      if (!g.attributes.aRim) g.setAttribute('aRim', new THREE.BufferAttribute(r, 1));
    }
    return prev.apply(this, args);
  };
}

/** Every mesh of `group` drawn with `mat` (a set's paving and its cracked / broken looks): its rim, now
 *  (at build: no first-draw hitch). Nothing when `mat` does not print (dpFloor '0'). */
export function addSlabRims(group, mat) {
  if (!(mat?.defines?.DP_FLOOR > 0)) return;
  group?.traverse?.((o) => {
    if (o.isMesh && o.material === mat) addSlabRim(o.geometry, crackMesh(o));
  });
}

/** GLSL (after COMMON_GLSL): the dragon print, its upgrades, the prints and the floor's relief. */
export const DP_FLOOR_GLSL = /* glsl */ `
${DRAGON_PRINT_GLSL}
${DRAGON_STEP_GLSL}
uniform vec3 uDpView;   // cot(pitch), sin(pitch), cos(pitch)
uniform vec4 uDpBody;   // tint, k
uniform float uDpSat;
uniform vec4 uDpRelief; // wear, grain, crack, chip
uniform vec4 uDpLift;   // rim (the lit lip's lift), moss, wet, the rim's width (m)
uniform vec4 uDpRim;    // the lip's turn (the normal's outward lean at the edge), -, the top's lift, the sky's floor
uniform float uDpAsh[5];
uniform vec4 uDpStroke; // dash, slash, bar, backslash (a crack's seam)
varying float vRim;     // 1 + the distance to the slab's edge (m; addSlabRim), 0 unknown; a cracked piece's from ${CRACK_RIM}
float dpAshAt(int i) { float r = uDpAsh[0]; for (int k = 0; k < 5; k++) if (k == i) r = uDpAsh[k]; return r; }
// the floor's relief (height, m-ish): broad worn hollows and the stone's grain; d (0..1) roughens it (moss, a rim)
float floorRelief(vec2 p, float d) {
  return (dpFbm(p * 0.85 + 3.1) - 0.5) * 0.16 * uDpRelief.x + (dpFbm(p * 2.4 - 1.7) - 0.5) * 0.07 * uDpRelief.y * (0.7 + d);
}
#define DP_RELIEF floorRelief
${DRAGON_PRINT_FX_GLSL}
`;

/**
 * GLSL for the carved material's main() (render/materials.js), after `n` (the facet's normal toward the
 * viewer) is known. Declares: idx, ink (the body), m, col, cell, f, g, h, cw, dpT (the tone), dpRip. Uses
 * the carved material's varyings (vW, vCol, vAO, vMoss, vEdge) and uniforms (uGain, uCrack, uMossInk).
 */
export const DP_FLOOR_MAIN = /* glsl */ `
        // ---- THE DRAGON PRINT (render/dragonFloor.js): the ground's lattice, seen along the view
        vec2 dpSize = vec2(${DP_CELL[0]}, ${DP_CELL[1]});
        vec2 f, g;
        vec2 cell = dpLattice(vec2(vW.x, vW.z - vW.y * uDpView.x), dpSize, f, g);
        float h = hash12(cell);
        vec2 cxz = dpCellCenter(cell, dpSize);
        // the cell's centre on this facet: back along the view ray from its ground centre to the facet's plane
        vec3 vr = vec3(0.0, uDpView.y, uDpView.z);
        vec3 P0 = vec3(cxz.x, 0.0, cxz.y);
        float den = dot(n, vr);
        float t0 = vW.y / max(uDpView.y, 0.1);
        float tr = abs(den) > 0.08 ? dot(n, vW - P0) / den : t0;
        vec3 cw = P0 + vr * clamp(tr, t0 - 0.5, t0 + 0.5);
        vec2 sc0 = scorchAt(cw.xz);
        float burn = sc0.x;
        // moss: clumps on the low, up-facing parts (a cushion: rougher, green, a touch lifted)
        float mossN = dpVnoise(cw.xz * 2.3 + 3.1) * 0.8 + hash12(cell + 7.7) * 0.2;
        float moss = step(1.0 - vMoss * 0.42 * uDpLift.y, mossN) * (1.0 - burn);
        // THE RIM (aRim): the distance from the CELL'S centre to its slab's edge (the vertex distance is
        // linear in a triangle: its slope from the screen derivatives); a lip one cell wide turns outward
        float rimK = 0.0, rimD = 9.0, crack = 0.0;
        vec2 rimO = vec2(0.0), rimG = vec2(0.0);
        if (vRim > 0.5 && uDpLift.w > 0.0) {
          crack = step(${CRACK_RIM - 0.5}, vRim);
          vec2 dRx = dFdx(vW.xz), dRy = dFdy(vW.xz);
          float rx = dFdx(vRim), ry = dFdy(vRim);
          float det = dRx.x * dRy.y - dRx.y * dRy.x;
          vec2 G = abs(det) > 1e-12 ? vec2(rx * dRy.y - ry * dRx.y, ry * dRx.x - rx * dRy.x) / det : vec2(0.0);
          float gl = length(G);
          rimD = vRim - mix(1.0, ${CRACK_RIM.toFixed(1)}, crack) + dot(G, cw.xz - vW.xz);
          rimG = G;
          rimO = gl > 0.3 ? -G / gl : vec2(0.0);
          // (a crack's seam at least 0.2 m: the cell's centre, a row apart in z, must not step over it)
          rimK = 1.0 - smoothstep(0.02, max(mix(uDpLift.w, 0.2, crack), 0.04), rimD);
        }
        // the relief bends the facet's normal (only where the facet faces up: a wall keeps its own)
        float up = smoothstep(0.35, 0.8, n.y);
        float rough = clamp(moss + rimK * 0.6, 0.0, 1.0);
        float e = 0.09;
        float hc = floorRelief(cw.xz, rough);
        vec2 dh = vec2(floorRelief(cw.xz + vec2(e, 0.0), rough) - hc, floorRelief(cw.xz + vec2(0.0, e), rough) - hc) / e;
        vec3 N = normalize(n - vec3(dh.x, 0.0, dh.y) * (1.4 * up) + vec3(rimO.x, 0.0, rimO.y) * (rimK * uDpRim.x));
        // cracks: meandering iso-lines of a world-fixed noise, only in some regions, cut as GROOVES
        float groove = 0.0;
        float region = smoothstep(0.5, 0.7, dpVnoise(cw.xz * 0.42 + 11.0)) * uCrack * up;
        if (region > 0.0 && uDpRelief.z > 0.0) {
          vec2 cp = cw.xz * 1.5 + 5.0;
          float c0 = dpVnoise(cp);
          vec2 gr = vec2(dpVnoise(cp + vec2(0.03, 0.0)) - c0, dpVnoise(cp + vec2(0.0, 0.03)) - c0) / 0.03 * 1.5;
          float gl = max(length(gr), 1e-3);
          float dist = abs(c0 - 0.5) / gl;
          float w = (0.06 + 0.06 * region) * min(uDpRelief.z, 2.0);
          if (dist < w) {
            groove = (1.0 - dist / w) * region;
            // a wall of the groove leans toward its middle: the one facing the moon catches it
            N = normalize(N - vec3(gr.x, 0.0, gr.y) / gl * sign(c0 - 0.5) * (1.1 * groove * uDpRelief.z));
          }
        }
        // chips broken out of the chamfer: the bit's face turned off the light, a tone lower
        float chip = step(hash12(cell + 3.3), uDpRelief.w) * step(0.5, max(rimK, vEdge));
        if (chip > 0.0) N = normalize(N + vec3(hash12(cell + 5.1) - 0.5, 0.0, hash12(cell + 6.9) - 0.5) * 1.2);
        // the body: the stone's own colour, toward grey, a touch cooler; moss green on its cushions
        vec3 ink = mix(vec3(luma(vCol)), vCol, uDpSat) * uDpBody.xyz * (uGain * uDpBody.w);
        ink = mix(ink, uMossInk * uGain * uDpBody.w * 2.2, moss);
        // [fx] drifting cloud shadows dim the moon; contact shadows darken the feet of things
        float shc = shadowAt(cw + n * 0.06) * dpCloud(cw.xz);
        float lam = max(dot(N, uMoonDir), 0.0);
        vec3 PL = pointLights(cw + n * 0.06, N, 0.0);
        // the tone: how the facet and its relief face the moon, the fire's light on top
        float dpT = smoothstep(uMoonDir.y - 0.3, uMoonDir.y + 0.25, lam) * shc;
        dpT = clamp(dpT * 0.85 + luma(PL) * 2.0, 0.0, 1.0);
        // a wet floor: a sheen where the moon and the lights glance off it toward the eye
        if (uDpLift.z > 0.0) {
          // (puddles: a slow world-fixed field; a puddle is darker but gives back the moon and the lights)
          float pud = smoothstep(0.42, 0.68, dpFbm(cw.xz * 0.22 + 9.0));
          vec3 V = normalize(uCamPos - cw);
          float sp = pow(max(dot(N, normalize(V + uMoonDir)), 0.0), 24.0) * shc;
          dpT = clamp(dpT * (1.0 - 0.3 * pud * min(uDpLift.z, 1.0)) + uDpLift.z * pud * (sp * 1.5 + luma(PL) * 4.0), 0.0, 1.0);
        }
        // the moonlit rim (a chamfer that faces the light), not where it is chipped; the moss's cushion
        dpT = clamp(dpT + uDpLift.x * max(rimK, vEdge) * (1.0 - chip) * (1.0 - crack) * smoothstep(0.55, 0.95, dot(N, uMoonDir)) * shc + uDpRim.z * up * (1.0 - rimK) * shc, 0.0, 1.0);
        // the sky: a face open to it keeps a little light in the moon's shadow (a slab's top still reads there)
        dpT = max(dpT, uDpRim.w * smoothstep(0.7, 0.98, N.y));
        // a cracked piece's edges fall into the crack, dark
        dpT *= 1.0 - 0.85 * crack * rimK;
        // the groove's bottom and a chip fall dark; occlusion (aAO)
        dpT *= (1.0 - 0.75 * groove * groove) * (1.0 - 0.35 * chip) * mix(1.0, vAO, 0.6);
        dpT *= 1.0 - dpContact(cw.xz);
        // [fx] a ripple re-prints the cell (another digit, a flash brighter)
        float dpRip = dpRipple(cw.xz, h);
        float idx = dpGlyph(clamp(dpT + dpRip * 0.35, 0.0, 1.0), fract(h + dpRip * 0.37));
        // [fx] a lit crest prints an outline stroke (nb: the facet's slope plus the relief at the neighbours,
        // and the slab's drop to the ground for a neighbour past its edge: the ridge can outline a slab)
        if (uDpFxOn[3] > 0.5) {
          vec2 sl = -n.xz / max(n.y, 0.2);
          vec2 ox = vec2(dpSize.x, 0.0), oz = vec2(0.0, dpSize.y);
          float drop = rimD < 8.0 ? max(cw.y, 0.03) : 0.0;
          vec4 nb = vec4(dot(sl, ox) + floorRelief(cw.xz + ox, rough) - (rimD + dot(rimG, ox) < 0.0 ? drop : 0.0),
                         dot(sl, -ox) + floorRelief(cw.xz - ox, rough) - (rimD - dot(rimG, ox) < 0.0 ? drop : 0.0),
                         dot(sl, -oz) + floorRelief(cw.xz - oz, rough) - (rimD - dot(rimG, oz) < 0.0 ? drop : 0.0),
                         dot(sl, oz) + floorRelief(cw.xz + oz, rough) - (rimD + dot(rimG, oz) < 0.0 ? drop : 0.0)) - hc;
          float ridx;
          if (dpRidge(cw.xz, N, dpT, nb, h, ridx)) idx = ridx;
        }
        // a cracked piece's edge, the seam of the crack: a dim stroke along it (the house style's inner step),
        // so a crack narrower than a cell still reads as a line
        if (crack * rimK > 0.5 && dot(rimO, rimO) > 0.5) {
          vec2 tg = vec2(-rimO.y, rimO.x);
          float ka = mod(floor(mod(atan(-tg.y * uDpView.y, tg.x), 3.14159265) / 0.7853982 + 0.5), 4.0);
          idx = ka < 0.5 ? uDpStroke.x : ka < 1.5 ? uDpStroke.y : ka < 2.5 ? uDpStroke.z : uDpStroke.w;
          dpT = 0.35;
        }
        if (burn > 0.35) idx = dpAshAt(int(fract(h * 7.1) * 5.0));
`;

/**
 * GLSL for the end of the carved material's dragon print, after the script wave (`ink`, `idx` final):
 * the print itself, then a fresh footprint's flash. Declares `L`, writes `m` and `col`.
 */
export const DP_FLOOR_PRINT = /* glsl */ `
        // the script wave on the print (materials.js SCRIPT_GLSL): a cell a head re-rolled prints lit, in its green
        if (sk > 0.0 && sw.x > 1.0 - 0.75 * min(sk, 1.0)) {
          dpT = max(dpT, 0.55 + 0.45 * sw.x);
          ink = mix(ink, SCRIPT_GREEN * (luma(ink) + 0.03), 0.5) * (1.3 + 1.7 * sw.y);
        }
        m = glyphGrad(idx, f, dFdx(g), dFdy(g));
        // the light the print is seen by (the ground's: flat, the shadow per pixel so its edge stays crisp),
        // with the material's ink floor (its carved look's: the slab still prints in a deep shadow)
        float shp = shadowAt(vW + n * 0.06);
        vec3 L = (ambientAt(vec3(0.0, 1.0, 0.0)) + uMoonColor * uMoonDir.y * shp * 0.85 + pointLights(vW + n * 0.06, vec3(0.0, 1.0, 0.0), 0.0) + vec3(uInkFloor)) * mix(1.0, vAO, 0.5);
        col = vec3(0.008, 0.01, 0.01) * L + ink * (0.2 + 1.5 * dpT + dpRip * 0.8) * L * m * 1.15;
        // [prints] a fresh footprint: the cells under the foot turn to code, flash and fade (render/dragonStep.js)
        vec3 st = dpStep(cw.xz, h);
        if (st.x > 0.0) {
          float sm = glyphGrad(st.z, f, dFdx(g), dFdy(g));
          vec3 code = mix(vec3(0.14, 0.5, 0.22), vec3(0.75, 1.35, 0.8), st.y);
          col = mix(col, vec3(0.008, 0.01, 0.01) * L + code * sm, st.x);
        }
`;
