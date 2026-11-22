import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { GlyphParticles } from '../render/particles.js';
import { mulberry32, range, fbm2, hash2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, carve, slabGeometry, mul, SLAB_LOOK, buildDeadTree, buildFlagstone, buildBonfire, buildRubble, geosHeight } from './forest.js';
import { buildSpike, buildFallenStar, starCleft, facetCol, STAR_GLASS, STAR_COLLIDERS } from './landmarks.js';
import { breakableFloor } from './floor.js';
import { STONE } from './forest.js';
import { OUTSKIRTS, kindBag, buildOutskirt } from './starfallProps.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// The Obsidian Throne: STARFALL (the Starless Lord's level; the owner's pick "A" of three rendered
// open arenas, 2026-11-15, ADR-112; before it a walled hall, ADR-069). The crater where he fell out
// of the night sky. South to north (the player walks north, -z): the bonfire, a path of flagstones
// through a forest thrown flat (every trunk points away from the impact), the low south lip of the
// crater, then its floor: rings of fused black plates round the red seal (the origin: the duel's
// centre), cracked and heaved toward the rim; shards of the star's glass standing in it, stones the
// Void still holds in the air, pits where the star burns under the floor; and at the north end the
// star itself, split open, his seat cut in front of its cleft under a crown of glass splinters.
// Round it a broken crown of slabs thrown up and outward: low to the south, tall behind him, with
// gaps everywhere. There are no walls, and nothing tall stands south of the seal.
// (The file and the builder keep their names from the hall: levels, tests and the glyph check know them.)
//
// Same output shape as createForest / createCourtyard (world.js reads it), plus
//   breakables the shards, the rim's slabs and the hanging stones (ARCHITECTURE.md "Destruction"):
//              world/destructibles.js builds and draws them, they are not in the static meshes. Since
//              2026-11-16 everything but the landmarks breaks: the floor's plates and the path
//              (world/floor.js), the rim's low slabs and its rubble, the vents' stonework (a vent whose
//              rim breaks flares up), the stones of the south lip, the trunks thrown down near the
//              crater. The throne and its dais, the fallen star, the seal's glow and the bonfire stay
//              whole; the six hanging stones stay as they were (they only chip)
//   scarInk    cracks in the black floor glow like embers
//   sky        the crater's own night: world.js writes it into the shared uniforms
//   ambience   { setup(game), update(dt, game), flare(k), setVisible(on) }: atmosphere.js runs it instead of the
//              fireflies / mist / leaves: the vents' flames and their lights, red motes, the glowing
//              inlay; flare(k) brightens the seal (the boss calls it as each blade form ignites)
// Everything is drawn through the glyph systems (STYLE.md): prop art for the stone and the glass,
// carved glyphs for the floor, the screen grid for trees and the bonfire, glyph particles for the
// flames and the inlay.

// a vent flame's reused fire-field record (no allocation per spawn)
const ventBlob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 0.8, sizeEnd: 0.25, heat: 0.5, heatEnd: 0, drag: 1.2, gravity: 0, kind: 'fire' };

/** Layout numbers (world metres). The level's CONFIG.world overrides match these (levels/starless.js). */
export const THRONE = {
  R: 15, // the crater's floor: a disc round the seal
  seal: { x: 0, z: 0, r: 6.2 }, // the inlaid seal: the centre of the duel
  throne: { x: 0, z: -16, seatY: 1.27 }, // the seat (he sits here until the hero steps onto the floor)
  daisZ: -11.8, // the dais's front edge (not walkable beyond it)
  star: { x: 0, z: -21.4 }, // the fallen star's centre, behind the seat
  entryZ: 14.8, // the south lip: where the path meets the floor
  // where the lord may stand (levels/starless.js → CONFIG.world.dragonBound, bossFloor): a circle
  // round the seal, south of the dais. A hero backed against the rim is still in his reach
  floor: { r: 13.6, zN: -10.6 },
  bonfire: { x: 0, z: 30 },
  // the vents: pits where the star still burns under the floor ([x, z]; the Lord's effects read them)
  vents: [[-8.6, -1.6], [8.8, 0.2], [-7.0, 10.2], [8.4, 6.4]],
};

const SIN_PITCH = Math.sin(CONFIG.camera.pitch);
/** The trunks thrown down this close to the seal are breakables (2026-11-16): the hero reaches them. */
const NEAR_LOGS = 32;
/** What lies round the crater (world/starfallProps.js): how many pieces, how far apart at least, and
 *  out to where they break (the hero's ground ends 40 m from the seal). */
const OUT_N = 125, OUT_GAP = 3.8, OUT_REACH = 43, OUT_NEAR_H = 3;
/** The path's flagstones (forest.js buildFlagstone's colour). */
const flagCol = (px, py, pz) => mul(STONE, 0.6 + 0.4 * fbm2(px * 2, pz * 2, 2));
const OBS = [0.075, 0.078, 0.105]; // obsidian
const edgeBand = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0);
const obs = (k) => (px, py, pz) => mul(OBS, k * (0.72 + 0.5 * fbm2(px * 0.55 + 3, pz * 0.55 + py, 2)));
/** The on-screen angle of a ground direction (dx, dz) at the fixed camera (north up). */
const groundRot = (dx, dz) => Math.atan2(-dz * SIN_PITCH, dx);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- pieces
/** A box with its base at y, carved. */
function box(w, h, d, x, y, z, { col, seg = 1 }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, seg, 1));
  g.translate(x, y + h / 2, z);
  carve(g, { col, ao: (px, py) => 0.55 + 0.45 * Math.min(1, (py - y) / 1.4) });
  return g;
}

/** A shard of the star's glass: a five-sided prism with a long point, leaning toward (sin yaw, cos yaw). */
function crystal(rng, x, z, { h, r, lean = 0, yaw = 0, col = STAR_GLASS, k = 1.5, sides = 5 }) {
  const body = prep(new THREE.CylinderGeometry(r * 0.82, r, h * 0.56, sides, 1));
  body.translate(0, h * 0.28, 0);
  const tip = prep(new THREE.ConeGeometry(r * 0.82, h * 0.44, sides, 1));
  tip.translate(0, h * 0.78, 0);
  const g = mergeGeometries([body, tip]);
  g.rotateY(rng() * TAU);
  g.rotateX(lean);
  g.rotateY(yaw);
  g.translate(x, -0.12, z);
  carve(g, { col: facetCol(col, k), ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.4) });
  return g;
}

/** A scatter of broken stone round (x, z). */
function rubble(rng, x, z, R, n, { col = OBS, k = 1.35, size = [0.16, 0.42], y = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * R, s = range(rng, size[0], size[1]);
    const g = prep(new THREE.IcosahedronGeometry(s, 0));
    lumpy(g, s * 0.4, 2 / s, rng() * 50);
    g.scale(1, range(rng, 0.5, 0.8), 1);
    g.rotateY(rng() * TAU);
    g.translate(x + Math.cos(a) * r, y + s * 0.25, z + Math.sin(a) * r);
    carve(g, { col: facetCol(col, k), ao: 0.9 });
    out.push(g);
  }
  return out;
}

/** A stone the Void holds off the ground at height y, a few splinters hanging under it. */
function hoverRock(rng, x, y, z, r) {
  const g = prep(new THREE.IcosahedronGeometry(r, 0));
  lumpy(g, r * 0.7, 0.9 / r, rng() * 60);
  g.scale(1.15, range(rng, 0.7, 0.9), range(rng, 0.8, 1.1));
  g.rotateY(rng() * TAU);
  g.translate(x, y, z);
  carve(g, { col: facetCol(OBS, 2.0), ao: (px, py) => 0.55 + 0.45 * Math.min(1, (py - y + r) / (2 * r)) });
  return [g, ...rubble(rng, x, z, r * 0.9, 3, { size: [0.1, 0.22], y: y - r * 1.5 })];
}

/** A dead tree lying where the blast threw it, its top toward (sin yaw, cos yaw). */
function fallenTree(rng, x, z, s, yaw) {
  const parts = buildDeadTree(rng, 0, 0, s);
  for (const g of parts) {
    g.rotateX(Math.PI / 2 - 0.05);
    g.rotateY(yaw);
    g.translate(x, 0.22 * s, z);
  }
  return parts;
}

const acc = (o, key, dt, rate, fn) => {
  o[key] = (o[key] ?? 0) + dt * rate;
  while (o[key] >= 1) {
    o[key] -= 1;
    fn();
  }
};

export function createThroneHall(U, colliders) {
  const L = THRONE, S = L.seal, T = L.throne, R = L.R, BF = L.bonfire;
  // three streams: the layout (its sequence is the picked render's: add nothing to it), the rubble
  // broken pieces leave (ADR-107), and whatever was added after the pick
  const rng = mulberry32(CONFIG.seed + 1311), br = mulberry32(CONFIG.seed + 8312), xr = mulberry32(CONFIG.seed + 10312);
  // (and a fourth for the floor's remains, world/floor.js: 2026-11-16)
  const fr = mulberry32(CONFIG.seed + 12312);
  /** the floor's slabs: { geo, outline, x, z, r, col } (world/floor.js makes them breakable) */
  const floor = [];
  const stoneGeos = [], slabGeos = [], propGeos = [], treeGeos = [], slabs = [], bare = [], treeSpots = [];
  /** the glowing inlay: { x, y, z, glyph, size, color, rot, flicker, seal } */
  const glow = [];
  /** flames: { x, y, z, kind: 'vent' | 'wisp', r, of } (`of`: the breakable kind it sits under) */
  const fires = [];
  const breakables = [];

  /**
   * A free-standing piece that can be chipped, toppled, lifted and thrown: one entry of the set's
   * `breakables` (ARCHITECTURE.md "Destruction"). Its geometry is NOT merged into the static meshes.
   * extra: any field of the contract, plus `stub: false` (nothing is left standing when it breaks).
   */
  const piece = (kind, x, z, r, geos, extra = {}) => {
    const { stub = true, ...rest } = extra;
    // (a piece made breakable after 2026-11-16 has no stub: its stone becomes the wreckage's rubble)
    const cs = r > 0 ? [colliders.add(x, z, r, 'stone')] : [];
    const rr = r > 0 ? r : 0.6;
    breakables.push({
      kind, mat: 'stone', look: 'prop', x, z, r: rr, h: geosHeight(geos), geos, colliders: cs,
      ...(stub ? { broken: { geos: buildRubble(br, x, z, rr * 0.85, { col: mul(OBS, 1.4), h: range(br, 0.35, 0.65) }), look: 'prop', r: rr * 0.7 } } : {}),
      lift: 2, ...rest,
    });
  };

  /** A polygon slab (pts round its own centre), tilted a little, carved: a plate of the floor. */
  const floorSlab = (pts, x, z, { top = 0.035, inset = 0.05, drop = 0.03, tilt = 0.004, col, walk = true }) => {
    const g = slabGeometry(pts, { top, inset, drop });
    if (tilt) {
      const ax = new THREE.Vector3(range(rng, -1, 1), 0, range(rng, -1, 1) + 1e-3).normalize();
      g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, range(rng, 0.2, 1) * tilt));
    }
    g.translate(x, 0, z);
    carve(g, { col, ao: 0.85, edge: edgeBand });
    slabGeos.push(g);
    if (!walk) return;
    let r = 0;
    for (const [px, pz] of pts) r = Math.max(r, Math.hypot(px, pz));
    const outline = pts.map(([px, pz]) => [x + px, z + pz]);
    slabs.push({ x, z, r, outline });
    floor.push({ geo: g, outline, x, z, r: r * 0.8, col });
  };

  // ---- the floor: rings of fused plates round the seal ([r0, r1, plates]; the first is one disc),
  // heaved and broken toward the rim. The seal's rings lie on the seams at 1.6, 4.3 and 6.2 m
  const gap = 0.045;
  const skip = (x, z, r) => (z < L.daisZ - 0.2 && Math.abs(x) < 6) || (r > 11 && rng() < 0.24) || (r > 8 && r < 11 && rng() < 0.05);
  const tilt = (r) => 0.004 + 0.05 * Math.pow(Math.max(0, (r - 8) / 7), 2);
  const plate = (r) => obs(r < 1.6 ? 1.45 : 1.25 - 0.3 * smooth(6, 15, r));
  for (const [r0, r1, n] of [[0, 1.6, 8], [1.6, 4.3, 8], [4.3, 6.2, 12], [6.2, 8.6, 16], [8.6, 11, 20], [11, 13.1, 24], [13.1, R, 28]]) {
    if (r0 === 0) {
      const pts = [];
      for (let i = 0; i < n; i++) pts.push([Math.cos((i / n) * TAU) * (r1 - gap), Math.sin((i / n) * TAU) * (r1 - gap)]);
      floorSlab(pts, S.x, S.z, { col: plate(0), tilt: 0 });
      continue;
    }
    const off = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const rm = (r0 + r1) / 2, da = gap / rm;
      const a0 = off + (i / n) * TAU + da, a1 = off + ((i + 1) / n) * TAU - da, am = (a0 + a1) / 2;
      const mx = S.x + Math.cos(am) * rm, mz = S.z + Math.sin(am) * rm;
      if (skip(mx, mz, rm)) continue;
      const pts = [];
      const so = Math.max(1, Math.ceil(((a1 - a0) * r1) / 1.5)), si = Math.max(1, Math.ceil(((a1 - a0) * r0) / 1.5));
      for (let k = 0; k <= so; k++) {
        const a = a0 + ((a1 - a0) * k) / so;
        pts.push([S.x + Math.cos(a) * (r1 - gap) - mx, S.z + Math.sin(a) * (r1 - gap) - mz]);
      }
      for (let k = si; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / si;
        pts.push([S.x + Math.cos(a) * (r0 + gap) - mx, S.z + Math.sin(a) * (r0 + gap) - mz]);
      }
      floorSlab(pts, mx, mz, { col: plate(rm), tilt: tilt(rm) });
    }
  }

  // ---- the seal in the floor (glowing inlay): the centre of the duel
  const ring = (r, n, glyphs, size, col) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      glow.push({ x: S.x + Math.cos(a) * r, y: 0.08, z: S.z + Math.sin(a) * r, glyph: glyphs[i % glyphs.length], size, color: col, rot: groundRot(-Math.sin(a), Math.cos(a)), flicker: 0.18, seal: true });
    }
  };
  ring(S.r, 128, '-', 0.74, [1.7, 0.11, 0.07]);
  ring(S.r - 0.42, 128, '-', 0.5, [0.9, 0.06, 0.04]);
  ring(S.r - 1.05, 30, 'X+ZTHKY7', 0.5, [1.25, 0.09, 0.055]);
  ring(4.3, 92, '-', 0.66, [1.5, 0.1, 0.065]);
  ring(1.6, 36, '-', 0.6, [1.6, 0.11, 0.07]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + TAU / 16;
    for (let r = 1.85; r < 4.2; r += 0.3) {
      glow.push({ x: S.x + Math.cos(a) * r, y: 0.08, z: S.z + Math.sin(a) * r, glyph: '-', size: 0.62, color: [1.25, 0.085, 0.055], rot: groundRot(Math.cos(a), Math.sin(a)), flicker: 0.18, seal: true });
    }
  }
  // ---- cracks of red light from the seal out toward the rim (the star's heat still leaks): dashes
  // laid along a jagged line
  const crack = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.3));
    const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
    let px = x0, pz = z0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, j = i === n ? 0 : range(rng, -0.7, 0.7);
      const qx = x0 + (x1 - x0) * t + nx * j, qz = z0 + (z1 - z0) * t + nz * j;
      const m = Math.max(1, Math.round(Math.hypot(qx - px, qz - pz) / 0.34));
      for (let k = 0; k < m; k++) {
        const u = (k + 0.5) / m;
        glow.push({ x: px + (qx - px) * u, y: 0.08, z: pz + (qz - pz) * u, glyph: '-', size: 0.46, color: [0.8, 0.055, 0.04], rot: groundRot(qx - px, qz - pz), flicker: 0.14 });
      }
      px = qx;
      pz = qz;
    }
  };
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + 0.35 + range(rng, -0.12, 0.12);
    if (Math.sin(a) < -0.86) continue; // not under the dais
    const r1 = range(rng, 11, R - 0.5);
    crack(S.x + Math.cos(a) * (S.r + 0.5), S.z + Math.sin(a) * (S.r + 0.5), S.x + Math.cos(a + range(rng, -0.1, 0.1)) * r1, S.z + Math.sin(a) * r1);
  }

  // ---- the dais: three tiers up to the seat (not walkable: a row of colliders along its edge)
  const zBack = T.z - 2.4;
  for (const [hx, z0, top] of [[5.4, L.daisZ, 0.16], [4.2, L.daisZ - 1.2, 0.34], [3.0, L.daisZ - 2.4, 0.52]]) {
    const zc = (z0 + zBack) / 2, hd = (z0 - zBack) / 2;
    floorSlab([[-hx, -hd], [hx, -hd], [hx, hd], [-hx, hd]], 0, zc, { top, inset: 0.09, drop: 0.06, tilt: 0, col: obs(1.5), walk: false });
  }
  for (let x = -5; x <= 5 + 1e-6; x += 1.3) colliders.add(x, L.daisZ - 0.75, 0.75, 'stone');
  for (const sx of [-1, 1]) for (let z = L.daisZ - 2; z > zBack; z -= 1.4) colliders.add(sx * 5.1, z, 0.75, 'stone');
  // ---- the throne: a seat cut in front of the star's cleft
  const dark = obs(1.55);
  stoneGeos.push(box(1.7, 0.75, 1.4, T.x, 0.52, T.z + 0.5, { col: dark }));
  for (const sx of [-1, 1]) stoneGeos.push(box(0.34, 0.5, 1.3, T.x + sx * 1.02, 1.27, T.z + 0.5, { col: dark }));
  // ---- the star itself, split open, under its crown of splinters (landmarks.js); the light in its cleft
  stoneGeos.push(...buildFallenStar(rng, L.star.x, L.star.z));
  for (const [lx, lz, r] of STAR_COLLIDERS) colliders.add(L.star.x + lx, L.star.z + lz, r, 'stone');
  glow.push(...starCleft(rng, L.star.x, L.star.z));
  fires.push({ x: T.x, y: 1.2, z: T.z - 2.2, kind: 'wisp', r: 0.5 });

  // ---- the rim: plates thrown up and outward, a broken crown: low to the south, tall behind him,
  // gaps all round (it is not a wall), the way in left open. A third of them are the star's glass
  for (let i = 0; i < 74; i++) {
    const a = -Math.PI + ((i + rng() * 0.7) / 74) * TAU, sth = Math.abs(a) / Math.PI; // 0 due north .. 1 due south
    const r = R + range(rng, 0.8, 2.8), x = Math.sin(a) * r, z = -Math.cos(a) * r;
    const keep = hash2(i * 3.7 + 1, 9.1) > 0.3;
    const h = (0.8 + 6.2 * (1 - smooth(0.1, 0.72, sth))) * range(rng, 0.5, 1);
    const w = range(rng, 1.2, 2.4), dd = range(rng, 0.45, 0.85), lean = range(rng, 0.15, 0.48), yaw = Math.atan2(x, z) + range(rng, -0.35, 0.35);
    const glass = rng() < 0.3;
    if (!keep || sth > 0.9 || (Math.abs(x) < 8.5 && z < L.daisZ)) continue;
    const g = glass
      ? crystal(rng, x, z, { h: h * 1.1 + 0.6, r: 0.3 + h * 0.1, lean, yaw })
      : buildSpike(rng, x, -0.2, z, { h, w, d: dd, tip: range(rng, 0.1, 0.36), lean, yaw, col: facetCol(OBS, 1.3), lump: 0.1 });
    if (h > 1.3) piece(glass ? 'shard' : 'slab', x, z, 0.85, [g]);
    // the rim's low pieces and its rubble break too (2026-11-16; scenery before): no collider, as before,
    // and nothing the Void lifts (lift 0: his choices among the tall pieces stay as they were)
    else piece(glass ? 'shard' : 'slab', x, z, 0, [g], { stub: false, lift: 0, cover: false, r: 0.5 });
    if (rng() < 0.5) {
      const rx = x - Math.sin(a) * 1.2, rz = z + Math.cos(a) * 1.2;
      piece('rubble', rx, rz, 0, rubble(rng, rx, rz, 1.1, 3), { stub: false, lift: 0, cover: false, r: 1.1 });
    }
  }

  // ---- shards of the star standing in the floor: cover, and what he tears loose and throws.
  // [x, z, height]: a tall crystal, two to four smaller ones leaning out of its foot
  for (const [x, z, h] of [[-7.2, -5.8, 3.6], [7.9, -4.2, 3.1], [-9.9, 1.9, 2.7], [10.2, 3.3, 3.8], [-5.2, 8.3, 2.3], [6.2, 9.2, 2.8], [-11.2, -8.2, 4.2], [11.4, -8.4, 3.5], [3.2, -9.2, 2.1], [-11.8, 7.2, 2.9], [12.6, -2.0, 2.5], [-2.6, 11.8, 1.9]]) {
    const yaw = rng() * TAU, geos = [crystal(rng, x, z, { h, r: h * 0.16, lean: range(rng, 0.05, 0.22), yaw })];
    const n = 2 + Math.floor(rng() * 2.6), a0 = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + range(rng, -0.4, 0.4), d = h * range(rng, 0.16, 0.24), hh = h * range(rng, 0.4, 0.68);
      geos.push(crystal(rng, x + Math.cos(a) * d, z + Math.sin(a) * d, { h: hh, r: hh * 0.15, lean: range(rng, 0.45, 0.85), yaw: Math.atan2(Math.cos(a), Math.sin(a)) }));
    }
    geos.push(...rubble(rng, x, z, h * 0.5, 4, { col: STAR_GLASS, k: 1.6, size: [0.1, 0.24] }));
    piece('shard', x, z, h * 0.24 + 0.2, geos);
  }
  // ---- stones the Void still holds off the ground ([x, height, z, radius]): no collider, no
  // cover, they only chip. They are there for him to throw (starlessLord/terrain.js). A wisp of red
  // rises under each. A stone is BUILT on the floor and hung `hover` m up by its body's own offset
  // (the ambience below keeps it there while it is whole), so that taken and thrown it comes down to
  // the floor: destructibles.js lands a piece where its pivot meets the ground
  for (const [x, y, z, r] of [[-12.6, 3.4, -3.0, 1.0], [13.4, 4.2, -5.8, 1.25], [-8.8, 5.2, -10.4, 0.9], [9.2, 4.6, -11.0, 1.1], [14.2, 2.8, 4.8, 0.8], [-14.0, 2.5, 4.2, 0.7]]) {
    const y0 = r * 1.5 + 0.25; // (its centre when it lies on the floor, its splinters under it)
    piece('hover', x, z, 0, hoverRock(rng, x, y0, z, r), { hp: Infinity, cover: false, topples: false, stub: false, hover: y - y0, cy: y, r: 0.3 });
    fires.push({ x, y: 0.1, z, kind: 'wisp', r: r * 0.8, of: 'hover' });
  }
  // ---- vents: pits where the star still burns under the floor (the crater's light)
  // (its ring of stones breaks: the vent burns on, and flares as its rim goes; 2026-11-16)
  for (const [x, z] of THRONE.vents) {
    piece('vent', x, z, 0, rubble(rng, x, z, 0.85, 7, { size: [0.14, 0.3], k: 1.2 }), { stub: false, lift: 0, cover: false, topples: false, r: 1.0 });
    fires.push({ x, y: 0.12, z, kind: 'vent', rim: 'vent' });
    bare.push({ x, z, r: 1 });
  }

  // ---- outside: the path up from the bonfire to the south lip
  for (let z = R + 1.2; z < BF.z - 1.6; z += range(rng, 0.9, 1.3)) {
    const x = range(rng, -0.9, 0.9), w = range(rng, 0.9, 1.5), d = range(rng, 0.7, 1.2);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    slabGeos.push(s.geo);
    slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
    floor.push({ geo: s.geo, outline: s.outline, x, z, r: Math.max(w, d) * 0.5, col: flagCol });
  }
  propGeos.push(...buildBonfire(rng, BF.x, BF.z));
  colliders.add(BF.x, BF.z, 0.75, 'bonfire');
  bare.push({ x: BF.x, z: BF.z, r: 2.4 });
  const clear = (x, z) => Math.hypot(x, z) > R + 4.5 && !(z > 0 && z < BF.z + 4 && Math.abs(x) < 4.4) && !(Math.abs(x) < 9 && z < L.daisZ && z > T.z - 12);
  const outskirts = lookOf('outskirts', '0', 'c');
  if (OUTSKIRTS[outskirts]) {
    // ---- what the star's fall left lying round the crater (world/starfallProps.js), on a stream of its
    // own: spots first (none on the path, none behind the throne), then a shuffled bag of kinds
    const or = mulberry32(CONFIG.seed + 14312), spots = [];
    for (let i = 0; i < 9000 && spots.length < OUT_N; i++) {
      const a = or() * TAU, r = R + 4.8 + Math.pow(or(), 1.1) * 38, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z) || spots.some((t) => Math.hypot(t.x - x, t.z - z) < OUT_GAP)) continue;
      spots.push({ x, z, r });
    }
    const bag = kindBag(or, OUTSKIRTS[outskirts], spots.length);
    spots.forEach((p, i) => {
      let b = buildOutskirt(bag[i], or, p.x, p.z, Math.atan2(p.x, p.z), range(or, 0.85, 1.2));
      // nothing tall on the near side, between the camera and the duel: a banner there is a grave instead
      if (p.z > 6 && geosHeight(b.geos) > OUT_NEAR_H) b = buildOutskirt('cairn', or, p.x, p.z, Math.atan2(p.x, p.z), range(or, 0.85, 1.1));
      if (p.r < OUT_REACH) {
        // within the hero's reach it breaks where it stands: stone leaves its rubble, wood and steel
        // nothing standing. It never topples (a grave of swords or a cart is no trunk to fell; and the
        // Lord's fight keeps the pieces it was tuned with to bring down on the hero: the rim's shards)
        const stone = b.mat === 'stone';
        breakables.push({
          kind: b.kind, mat: b.mat, look: 'prop', x: p.x, z: p.z, r: b.r, h: geosHeight(b.geos), geos: b.geos, topples: false,
          colliders: b.cr > 0 ? [colliders.add(p.x, p.z, b.cr, 'stone')] : [], lift: b.lift ?? 0,
          ...(stone ? { broken: { geos: buildRubble(br, p.x, p.z, Math.min(1, b.r * 0.6), { col: mul(STONE, 0.9), h: range(br, 0.25, 0.5) }), look: 'prop', r: 0 } } : {}),
        });
      } else {
        stoneGeos.push(...b.geos);
        if (p.r < 46) colliders.add(p.x, p.z, b.cr, 'stone');
      }
    });
  } else {
    // ---- the forest thrown flat: every trunk points away from the crater; far out some still stand
    for (let i = 0, n = 0; i < 8000 && n < 110; i++) {
      const a = rng() * TAU, r = R + 5 + Math.pow(rng(), 1.2) * 34, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z) || treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 3.4)) continue;
      const s = range(rng, 0.85, 1.35), flat = r < R + 24 || rng() < 0.3;
      if (flat) {
        const yaw = Math.atan2(x, z) + range(rng, -0.22, 0.22);
        const g = fallenTree(rng, x, z, s, yaw);
        // (a log is not walked through: two circles along it, where the hero can get to)
        const cs = r < 38 ? [1.1, 3.3].map((f) => colliders.add(x + Math.sin(yaw) * f * s, z + Math.cos(yaw) * f * s, 0.36 * s, 'trunk')) : [];
        // the trunks thrown down nearest the crater break and burn (2026-11-16): it lies, it does not fall
        if (r < NEAR_LOGS) {
          const mx = x + Math.sin(yaw) * 2.2 * s, mz = z + Math.cos(yaw) * 2.2 * s;
          breakables.push({ kind: 'log', mat: 'wood', look: 'grid', x: mx, z: mz, r: 1.6 * s, h: 0.7 * s, geos: g, colliders: cs, topples: false, cover: false, lift: 1, wreck: false });
        } else treeGeos.push(...g);
      } else {
        treeGeos.push(...buildDeadTree(rng, x, z, s));
        if (r < 46) colliders.add(x, z, 0.42 * s, 'trunk');
      }
      treeSpots.push({ x, z, r: 2.4 * s });
      n++;
    }
  }
  // ---- the south lip: two knee-high stones either side of the path mark where the floor begins
  for (const sx of [-1, 1]) {
    const x = sx * range(xr, 3.4, 3.9), z = L.entryZ + range(xr, 0.5, 1.1);
    // (a breakable since 2026-11-16: its collider is the one it always had)
    piece('slab', x, z, 0.6, [buildSpike(xr, x, -0.15, z, { h: range(xr, 0.8, 1.1), w: 1.3, d: 0.6, tip: 0.45, lean: 0.3, yaw: sx * 1.2, col: facetCol(OBS, 1.3), lump: 0.1 }), ...rubble(xr, x + sx * 0.9, z + 0.4, 0.8, 3)], { stub: false, lift: 0 });
  }

  // ---- meshes
  const group = new THREE.Group();
  group.name = 'throneHall';
  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  // the star, the rim's rubble and the throne are printed like the wyrm (prop art, ADR-100); the
  // floor's plates stay carved. The crater's own night is dark: a higher source gain
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 1.5 });
  // a whole floor under the duel must stay calm: sparse, dim glyphs
  const slabMat = createCarvedGlyphMaterial(U, {
    ...SLAB_LOOK, gain: 1.55, lumScale: 2.2, edge: 0.42, inkFloor: 0.03, crackAmount: 0.3, topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'], viewPitch: CONFIG.camera.pitch,
  });
  const add = (geos, m, name) => {
    if (!geos.length) return; // (no trees round the crater but under ?outskirts=0)
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = name;
    group.add(mesh);
  };
  add(treeGeos, mat, 'trees');
  add(propGeos, mat, 'props');
  add(stoneGeos, stoneMat, 'stones');
  add(slabGeos, slabMat, 'paving');
  markCaster(group);
  // the floor breaks (world/floor.js): each plate a breakable 'range' piece of the paving mesh (the dais
  // is not one of them); the cracked and broken looks in two more meshes, hidden until first used
  {
    const slabMesh = group.children[group.children.length - 1];
    breakables.push(...breakableFloor({ slabs: floor, slabGeos, slabMesh, mat: slabMat, rng: fr, group, earth: [0.12, 0.068, 0.062] }).defs); // (the star's scorched ground: a dark ember brown)
  }

  // ---- the crater's life: the vents' flames and lights, wisps, motes, the inlay
  const st = { flare: 0, shown: -1 };
  let glowSys = null;
  /** (Re)fill the inlay batch; the seal's glyphs at brightness 1 + 2.2 × flare. */
  const fillGlow = () => {
    if (!glowSys) return;
    glowSys.clear();
    const k = 1 + 2.2 * st.flare;
    for (const g of glow) {
      const c = g.seal ? [g.color[0] * k, g.color[1] * k + 0.25 * st.flare, g.color[2] * k + 0.12 * st.flare] : g.color;
      glowSys.spawn({ x: g.x, y: g.y, z: g.z, life: 1e9, size: g.size, sizeEnd: g.size, glyph: g.glyph, color: c, colorEnd: c, alpha: 1, alphaEnd: 1, rot: g.rot ?? 0, flicker: g.flicker ?? 0 });
    }
    st.shown = st.flare;
  };
  const ambience = {
    setup(game) {
      // the inlay: glyphs that stay where they are, in one additive batch of their own
      glowSys = new GlyphParticles(game.U, { max: glow.length, additive: true });
      game.pipeline?.registerParticles?.(glowSys);
      fillGlow();
      for (const b of fires) {
        if (b.kind === 'vent') b.light = game.lights?.add?.({ x: b.x, y: b.y + 0.5, z: b.z, color: [1.0, 0.15, 0.07], intensity: 2.1, radius: 10, flicker: 0.5 }) ?? null;
      }
    },
    /** Lab (world.debug.setVisible): the inlay goes with the rest of the set. */
    setVisible(on) {
      if (glowSys?.mesh) glowSys.mesh.visible = !!on;
    },
    /** The seal flares (k 0..1) and settles again over ~1.5 s. */
    flare(k = 1) {
      st.flare = Math.max(st.flare, Math.min(1, Math.max(0, Number(k) || 0)));
    },
    update(dt, game) {
      if (st.flare > 0) st.flare = Math.max(0, st.flare - dt * 0.7);
      if (Math.abs(st.flare - st.shown) > 0.03 || (st.flare === 0 && st.shown !== 0)) fillGlow();
      glowSys?.update(dt, game.time);
      const fx = game.fx?.add, fire = game.fx?.fire;
      if (!fx) return;
      const D = game.world?.destructibles;
      for (const b of fires) {
        const vent = b.kind === 'vent';
        if (b.rim && D?.list) {
          // a vent burns on when its ring of stones breaks, and flares up as it goes (a burst of flame)
          if (b.rimPiece === undefined) b.rimPiece = D.list.find((o) => o.kind === b.rim && Math.hypot(o.x - b.x, o.z - b.z) < 0.2) ?? null;
          const open = !!b.rimPiece && b.rimPiece.state !== 0;
          if (open && !b.flared) {
            b.flared = true;
            b.flare = 1.6;
          } else if (!open) b.flared = false;
        }
        if (b.flare > 0) b.flare = Math.max(0, b.flare - dt);
        if (b.of && D?.list) {
          // a wisp rises under its stone only while the stone hangs there (bound once)
          if (b.piece === undefined) b.piece = D.list.find((o) => o.kind === b.of && Math.hypot(o.x - b.x, o.z - b.z) < 0.2) ?? null;
          const pc = b.piece;
          if (pc && pc.state !== 0) continue;
          // ... and a whole stone hangs: its body lifted to its place (again after a reset: the
          // Lord's grip takes the offset off when it takes the stone), drifting slowly up and down
          const up = pc?.def?.hover;
          if (up > 0 && pc.body) {
            pc.body.position.y = up + 0.14 * Math.sin(game.time * 0.8 + pc.id * 1.7);
            pc.body.updateMatrix();
            pc.body.updateMatrixWorld(); // (its node does not auto-update: destructibles.js _place)
          }
        }
        acc(b, 'fire', dt, vent ? 20 * (1 + 2.5 * Math.min(1, b.flare ?? 0)) : 5, () => {
          const a = Math.random() * TAU, r = Math.random() * (vent ? 0.55 : b.r ?? 0.6), hot = Math.random();
          if (vent && fire) {
            // a vent's flame: heat in the fire field (render/fireField.js, ADR-113), cool blobs that
            // sum to an orange body with red tongues (born 0.7 m up: lower, the depth fade eats them)
            const q = ventBlob;
            q.x = b.x + Math.cos(a) * r;
            q.y = Math.max(0.7, b.y + 0.5 + Math.random() * 0.2);
            q.z = b.z + Math.sin(a) * r;
            q.vx = (Math.random() - 0.5) * 0.25;
            q.vy = 0.6 + Math.random() * 0.8 + 2.2 * Math.min(1, b.flare ?? 0);
            q.vz = (Math.random() - 0.5) * 0.25;
            q.life = 0.4 + Math.random() * 0.5;
            q.size = 0.7 + hot * 0.36;
            q.heat = 0.46 + hot * 0.12;
            fire.spawn(q);
            return;
          }
          fx.spawn({
            x: b.x + Math.cos(a) * r, y: b.y + Math.random() * 0.12, z: b.z + Math.sin(a) * r,
            vx: (Math.random() - 0.5) * 0.25, vy: vent ? 0.6 + Math.random() * 0.8 : 0.5 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.25,
            life: vent ? 0.4 + Math.random() * 0.5 : 1.6 + Math.random() * 1.6, size: vent ? 0.3 + hot * 0.16 : 0.13, sizeEnd: 0.05, glyph: vent ? "*^'`\"~%" : ".'`:",
            color: vent ? [3.4, 0.5 + hot * 0.4, 0.28] : [2.0, 0.2, 0.12], colorEnd: [0.8, 0.03, 0.03], alpha: 1, alphaEnd: 0,
            drag: 1.2, flicker: 0.25, spin: (Math.random() - 0.5) * 2,
          });
        });
      }
      // red motes rising slowly over the crater's floor
      const f = game.U.uFocus.value;
      acc(st, 'motes', dt, 9, () => {
        const x = f.x + (Math.random() - 0.5) * 30, z = f.z + (Math.random() - 0.5) * 24 - 3;
        if (Math.hypot(x, z) > R + 1) return;
        fx.spawn({
          x, y: 0.2 + Math.random() * 1.5, z, vx: (Math.random() - 0.5) * 0.15, vy: 0.25 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.15,
          life: 4 + Math.random() * 4, size: 0.11, sizeEnd: 0.04, glyph: ".'·", color: [1.8, 0.16, 0.08], colorEnd: [0.4, 0.02, 0.02],
          alpha: 1, alphaEnd: 0, drag: 0.2, flicker: 0.5,
        });
      });
    },
  };

  return {
    group, treeSpots, bare, slabs, nest: { x: T.x, z: T.z }, bonfire: { x: BF.x, z: BF.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat,
    breakables,
    // cracks in the black floor glow like embers: the default dark ink does not show on it, and 0.5 in
    // the red channel was lost at the game camera (the marks are alpha glyphs, not additive)
    scarInk: [1.4, 0.12, 0.075],
    // no grass on the plates; thin grey tufts between the fallen trunks, none past where the fog
    // closes (the blades nobody sees were most of this level's triangles)
    grass: {
      ash: 0.7,
      height: 0.55,
      density: (x, z) => {
        const r = Math.hypot(x, z);
        return r < R + 3.2 ? 0 : 0.15 * (1 - smooth(42, 54, r));
      },
    },
    floorCarry: mul(OBS, 1.8), // (a plate torn out of the floor, in a boss's hands: destructibles.js)
    sky: { moonColor: [0.2, 0.23, 0.37], ambient: [0.03, 0.021, 0.029], fogColor: [0.007, 0.003, 0.0045], fogNear: 30, fogFar: 60 },
    ambience,
  };
}
