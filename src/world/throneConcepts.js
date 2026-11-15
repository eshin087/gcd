import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAG, createAsciiObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { GlyphParticles } from '../render/particles.js';
import { mulberry32, range, fbm2, hash2 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, lumpy, paint, carve, slabGeometry, mul, SLAB_LOOK, buildDeadTree, buildBoulder, buildFlagstone, buildBonfire } from './forest.js';
import { buildWarden, buildGreatSword, carved } from './landmarks.js';

// TEMPORARY (phase 1 of the open Obsidian Throne): three open arenas for the owner to pick from,
// behind `?level=starless&arena=a|b|c`. The pick moves into throneHall.js; this file is deleted.
//   a  STARFALL        the crater where he fell: a round floor of cracked plates, the star as his throne
//   b  GRAVE OF BLADES a plain of planted swords round a paved duelling ring, under one colossal blade
//   c  THE BROKEN HALL the old hall with its roof and walls gone: pillars, wardens, a broken ring

const SIN_PITCH = Math.sin(CONFIG.camera.pitch);
const COS_PITCH = Math.cos(CONFIG.camera.pitch);
const OBS = [0.075, 0.078, 0.105]; // obsidian
const VOIDGLASS = [0.07, 0.058, 0.13]; // the star's glass: a violet cast
const IRON = [0.1, 0.085, 0.085];
const edgeBand = (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0);
const obs = (k, c = OBS) => (px, py, pz) => mul(c, k * (0.72 + 0.5 * fbm2(px * 0.55 + 3, pz * 0.55 + py, 2)));
/** One tone per facet (keyed by its normal): a spread of tones is what prints as form. */
const facetTone = (nx, ny, nz) => 0.5 + 1.1 * hash2(Math.round(nx * 9) + Math.round(ny * 9) * 31, Math.round(nz * 9) + 7);
const facetCol = (c, k = 1) => (px, py, pz, nx, ny, nz) => mul(c, k * facetTone(nx, ny, nz));
/** The on-screen angle of a ground direction (dx, dz) at the fixed camera (north up). */
const groundRot = (dx, dz) => Math.atan2(-dz * SIN_PITCH, dx);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const SKY = { moonColor: [0.2, 0.23, 0.37], ambient: [0.03, 0.021, 0.029], fogColor: [0.007, 0.003, 0.0045], fogNear: 30, fogFar: 60 };

/** Layouts (the same keys as throneHall.js HALL: levels/starless.js reads them). */
export const CONCEPT_LAYOUT = {
  a: { halfX: 14, zN: -19, zS: 14.8, cell: 2.2, daisZ: -11.8, throne: { x: 0, z: -16, seatY: 1.27 }, seal: { x: 0, z: 0, r: 6.2 }, bonfire: { x: 0, z: 30 }, R: 15 },
  b: { halfX: 16, zN: -19, zS: 16.5, cell: 2.2, daisZ: -11.8, throne: { x: 0, z: -16, seatY: 1.27 }, seal: { x: 0, z: 0, r: 6.2 }, bonfire: { x: 0, z: 31 }, R: 15.8 },
  c: { halfX: 13.2, zN: -19, zS: 16, cell: 2.2, daisZ: -11.8, throne: { x: 0, z: -16, seatY: 1.27 }, seal: { x: 0, z: 0, r: 6.2 }, bonfire: { x: 0, z: 31 }, pillarX: 7.7 },
};

// ---------------------------------------------------------------- shared pieces
function makeKit(seed) {
  return {
    rng: mulberry32(CONFIG.seed + seed), stone: [], slab: [], prop: [], tree: [], slabs: [], bare: [], treeSpots: [],
    glow: [], fires: [], breakables: [],
  };
}

/** A free-standing thing that can later be chipped, toppled, lifted and thrown: its own entry. */
function thing(K, colliders, kind, mat, x, z, r, h, geos, mesh = 'stone') {
  K.breakables.push({ kind, mat, x, z, r, h, geos, mesh });
  if (r > 0) colliders.add(x, z, r, 'stone');
}

/** A polygon slab (pts round its own centre), tilted a little, carved; pushed onto the floor. */
function floorSlab(K, pts, x, z, { top = 0.035, inset = 0.05, drop = 0.03, tilt = 0.004, col, walk = true }) {
  const rng = K.rng;
  const g = slabGeometry(pts, { top, inset, drop });
  if (tilt) {
    const ax = new THREE.Vector3(range(rng, -1, 1), 0, range(rng, -1, 1) + 1e-3).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(ax, range(rng, 0.2, 1) * tilt));
  }
  g.translate(x, 0, z);
  carve(g, { col, ao: 0.85, edge: edgeBand });
  K.slab.push(g);
  if (walk) {
    let r = 0;
    for (const [px, pz] of pts) r = Math.max(r, Math.hypot(px, pz));
    K.slabs.push({ x, z, r, outline: pts.map(([px, pz]) => [x + px, z + pz]) });
  }
}

/** Rings of plates round (cx, cz): rings = [[r0, r1, n], ...] (r0 = 0: one n-gon). */
function ringFloor(K, cx, cz, rings, { skip, tilt = () => 0.004, col = () => obs(1) }) {
  const rng = K.rng, gap = 0.045;
  for (const [r0, r1, n] of rings) {
    if (r0 === 0) {
      const pts = [];
      for (let i = 0; i < n; i++) pts.push([Math.cos((i / n) * TAU) * (r1 - gap), Math.sin((i / n) * TAU) * (r1 - gap)]);
      floorSlab(K, pts, cx, cz, { col: col(0), tilt: 0 });
      continue;
    }
    const off = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const rm = (r0 + r1) / 2, da = gap / rm;
      const a0 = off + (i / n) * TAU + da, a1 = off + ((i + 1) / n) * TAU - da, am = (a0 + a1) / 2;
      const mx = cx + Math.cos(am) * rm, mz = cz + Math.sin(am) * rm;
      if (skip?.(mx, mz, rm)) continue;
      const pts = [];
      const so = Math.max(1, Math.ceil(((a1 - a0) * r1) / 1.5)), si = Math.max(1, Math.ceil(((a1 - a0) * r0) / 1.5));
      for (let k = 0; k <= so; k++) {
        const a = a0 + ((a1 - a0) * k) / so;
        pts.push([cx + Math.cos(a) * (r1 - gap) - mx, cz + Math.sin(a) * (r1 - gap) - mz]);
      }
      for (let k = si; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / si;
        pts.push([cx + Math.cos(a) * (r0 + gap) - mx, cz + Math.sin(a) * (r0 + gap) - mz]);
      }
      floorSlab(K, pts, mx, mz, { col: col(rm), tilt: tilt(rm) });
    }
  }
}

/** A box with its base at y, carved. */
function box(w, h, d, x, y, z, { col, seg = 1 }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, seg, 1));
  g.translate(x, y + h / 2, z);
  carve(g, { col, ao: (px, py) => 0.55 + 0.45 * Math.min(1, (py - y) / 1.4) });
  return g;
}

/**
 * A spike: a box tapering to `tip` of its base. `lean` rad toward (sin yaw, cos yaw); `roll` rad
 * sideways in its own plane (a fan of spikes facing the camera).
 */
function spike(rng, x, y, z, { h, w, d = w, tip = 0.1, lean = 0, yaw = 0, roll = 0, col, lump = 0.04 }) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, 4, 1));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 1 - (1 - tip) * Math.pow(Math.max(0, p.getY(i) / h), 1.2);
    p.setX(i, p.getX(i) * t);
    p.setZ(i, p.getZ(i) * t);
  }
  if (lump) lumpy(g, lump, 1.3, rng() * 99, new THREE.Vector3(0, h / 2, 0));
  if (roll) g.rotateZ(roll);
  g.rotateX(lean);
  g.rotateY(yaw);
  g.translate(x, y, z);
  carve(g, { col, ao: (px, py) => 0.5 + 0.5 * Math.min(1, (py - y) / 1.5) });
  return g;
}

/** A shard of the star's glass: a five-sided prism with a point, leaning. */
function crystal(rng, x, z, { h, r, lean = 0, yaw = 0, col = VOIDGLASS, k = 1.5, sides = 5 }) {
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

/** A heap of broken stone. */
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

/** A stone held off the ground by the Void, a few splinters hanging under it. */
function hoverRock(rng, x, y, z, r) {
  const g = prep(new THREE.IcosahedronGeometry(r, 0));
  lumpy(g, r * 0.7, 0.9 / r, rng() * 60);
  g.scale(1.15, range(rng, 0.7, 0.9), range(rng, 0.8, 1.1));
  g.rotateY(rng() * TAU);
  g.translate(x, y, z);
  carve(g, { col: facetCol(OBS, 2.0), ao: (px, py) => 0.55 + 0.45 * Math.min(1, (py - y + r) / (2 * r)) });
  return [g, ...rubble(rng, x, z, r * 0.9, 3, { size: [0.1, 0.22], y: y - r * 1.5 })];
}

/** An iron brazier; its flame and light come from the ambience. */
function brazier(K, colliders, x, z, y0 = 0) {
  const post = prep(new THREE.CylinderGeometry(0.1, 0.16, 1.15, 5));
  post.translate(x, y0 + 0.58, z);
  const bowl = prep(new THREE.CylinderGeometry(0.52, 0.26, 0.36, 8, 1));
  bowl.translate(x, y0 + 1.3, z);
  for (const g of [post, bowl]) paint(g, { col: IRON, flag: FLAG.ART_PROP, ao: 0.9 });
  thing(K, colliders, 'brazier', 'metal', x, z, 0.45, 1.5, [post, bowl], 'prop');
  K.fires.push({ x, y: y0 + 1.5, z, kind: 'brazier' });
}

/** The seal: the centre of the duel (the hall's inlay, unchanged). */
function seal(K, S) {
  const ring = (r, n, glyphs, size, col) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      K.glow.push({ x: S.x + Math.cos(a) * r, y: 0.08, z: S.z + Math.sin(a) * r, glyph: glyphs[i % glyphs.length], size, color: col, rot: groundRot(-Math.sin(a), Math.cos(a)), flicker: 0.18, seal: true });
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
      K.glow.push({ x: S.x + Math.cos(a) * r, y: 0.08, z: S.z + Math.sin(a) * r, glyph: '-', size: 0.62, color: [1.25, 0.085, 0.055], rot: groundRot(Math.cos(a), Math.sin(a)), flicker: 0.18, seal: true });
    }
  }
}

/** A line of inlay along the ground from a to b: dashes turned to the line, jagged by `jit`. */
function inlayLine(K, x0, z0, x1, z1, { step = 0.34, jit = 0, size = 0.5, color = [0.9, 0.06, 0.04], glyph = '-', flicker = 0.14 } = {}) {
  const rng = K.rng, len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.3));
  let px = x0, pz = z0;
  const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
  for (let i = 1; i <= n; i++) {
    const t = i / n, j = i === n ? 0 : range(rng, -jit, jit);
    const qx = x0 + (x1 - x0) * t + nx * j, qz = z0 + (z1 - z0) * t + nz * j;
    const sl = Math.hypot(qx - px, qz - pz), m = Math.max(1, Math.round(sl / step));
    for (let k = 0; k < m; k++) {
      const u = (k + 0.5) / m;
      K.glow.push({ x: px + (qx - px) * u, y: 0.08, z: pz + (qz - pz) * u, glyph, size, color, rot: groundRot(qx - px, qz - pz), flicker });
    }
    px = qx;
    pz = qz;
  }
}

/** The dais (tiers: [halfWidth, frontZ, top]) and the seat; the lord sits as in the hall. */
function throne(K, colliders, L, tiers) {
  const T = L.throne, zBack = T.z - 2.4, dark = obs(1.55);
  for (const [hx, z0, top] of tiers) {
    const zc = (z0 + zBack) / 2, hd = (z0 - zBack) / 2;
    floorSlab(K, [[-hx, -hd], [hx, -hd], [hx, hd], [-hx, hd]], 0, zc, { top, inset: 0.09, drop: 0.06, tilt: 0, col: obs(1.5), walk: false });
  }
  const hx0 = tiers[0][0];
  for (let x = -hx0 + 0.4; x <= hx0 - 0.4 + 1e-6; x += 1.3) colliders.add(x, L.daisZ - 0.75, 0.75, 'stone');
  for (const sx of [-1, 1]) for (let z = L.daisZ - 2; z > zBack; z -= 1.4) colliders.add(sx * (hx0 - 0.3), z, 0.75, 'stone');
  K.stone.push(box(1.7, 0.75, 1.4, T.x, 0.52, T.z + 0.5, { col: dark }));
  for (const sx of [-1, 1]) K.stone.push(box(0.34, 0.5, 1.3, T.x + sx * 1.02, 1.27, T.z + 0.5, { col: dark }));
}
const TIERS = (L, w = [5.4, 4.2, 3.0]) => [[w[0], L.daisZ, 0.16], [w[1], L.daisZ - 1.2, 0.34], [w[2], L.daisZ - 2.4, 0.52]];

/** The path up from the bonfire to zTo, and the bonfire. */
function approach(K, colliders, BF, zTo) {
  const rng = K.rng;
  for (let z = zTo; z < BF.z - 1.6; z += range(rng, 0.9, 1.3)) {
    const x = range(rng, -0.9, 0.9), w = range(rng, 0.9, 1.5), d = range(rng, 0.7, 1.2);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    K.slab.push(s.geo);
    K.slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
  }
  K.prop.push(...buildBonfire(rng, BF.x, BF.z));
  colliders.add(BF.x, BF.z, 0.75, 'bonfire');
  K.bare.push({ x: BF.x, z: BF.z, r: 2.4 });
}

/** A dead tree lying where it was thrown down, its top toward (sin yaw, cos yaw). */
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

/** Meshes, the ambience and the set's return value. */
function finish(K, U, name, L, { inArena, grass, lights = true }) {
  for (const b of K.breakables) (b.mesh === 'prop' ? K.prop : K.stone).push(...b.geos);
  const group = new THREE.Group();
  group.name = name;
  const mat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const stoneMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 1.5 });
  const slabMat = createCarvedGlyphMaterial(U, {
    ...SLAB_LOOK, gain: 1.55, lumScale: 2.2, edge: 0.42, inkFloor: 0.03, crackAmount: 0.3, topGlyphs: ['.   ', '. . ', '.:. ', ':.;.', ';:=.', '=;%:'], viewPitch: CONFIG.camera.pitch,
  });
  const add = (geos, m, n) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = n;
    group.add(mesh);
  };
  add(K.tree, mat, 'trees');
  add(K.prop, mat, 'props');
  add(K.stone, stoneMat, 'stones');
  add(K.slab, slabMat, 'paving');
  markCaster(group);

  const st = { flare: 0, shown: -1 };
  const glow = K.glow, fires = K.fires;
  let glowSys = null;
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
      glowSys = new GlyphParticles(game.U, { max: glow.length, additive: true });
      game.pipeline?.registerParticles?.(glowSys);
      fillGlow();
      if (!lights) return;
      for (const b of fires) {
        if (b.kind === 'wisp') continue;
        b.light = game.lights?.add?.({ x: b.x, y: b.y + 0.5, z: b.z, color: [1.0, 0.15, 0.07], intensity: b.kind === 'vent' ? 2.1 : 2.5, radius: b.kind === 'vent' ? 10 : 11, flicker: 0.5 }) ?? null;
      }
    },
    setVisible(on) {
      if (glowSys?.mesh) glowSys.mesh.visible = !!on;
    },
    flare(k = 1) {
      st.flare = Math.max(st.flare, Math.min(1, Math.max(0, Number(k) || 0)));
    },
    update(dt, game) {
      if (st.flare > 0) st.flare = Math.max(0, st.flare - dt * 0.7);
      if (Math.abs(st.flare - st.shown) > 0.03 || (st.flare === 0 && st.shown !== 0)) fillGlow();
      glowSys?.update(dt, game.time);
      const fx = game.fx?.add;
      if (!fx) return;
      for (const b of fires) {
        const vent = b.kind === 'vent', wisp = b.kind === 'wisp';
        acc(b, 'fire', dt, wisp ? 5 : vent ? 20 : 24, () => {
          const a = Math.random() * TAU, r = Math.random() * (vent ? 0.55 : wisp ? b.r ?? 0.6 : 0.3), hot = Math.random();
          fx.spawn({
            x: b.x + Math.cos(a) * r, y: b.y + Math.random() * 0.12, z: b.z + Math.sin(a) * r,
            vx: (Math.random() - 0.5) * 0.25, vy: wisp ? 0.5 + Math.random() * 0.5 : vent ? 0.6 + Math.random() * 0.8 : 1.1 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.25,
            life: wisp ? 1.6 + Math.random() * 1.6 : 0.4 + Math.random() * 0.5, size: wisp ? 0.13 : 0.3 + hot * 0.16, sizeEnd: 0.05, glyph: wisp ? ".'`:" : "*^'`\"~%",
            color: wisp ? [2.0, 0.2, 0.12] : [3.4, 0.5 + hot * 0.4, 0.28], colorEnd: [0.8, 0.03, 0.03], alpha: 1, alphaEnd: 0,
            drag: 1.2, flicker: 0.25, spin: (Math.random() - 0.5) * 2,
          });
        });
      }
      const f = game.U.uFocus.value;
      acc(st, 'motes', dt, 9, () => {
        const x = f.x + (Math.random() - 0.5) * 30, z = f.z + (Math.random() - 0.5) * 24 - 3;
        if (!inArena(x, z)) return;
        fx.spawn({
          x, y: 0.2 + Math.random() * 1.5, z, vx: (Math.random() - 0.5) * 0.15, vy: 0.25 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.15,
          life: 4 + Math.random() * 4, size: 0.11, sizeEnd: 0.04, glyph: ".'·", color: [1.8, 0.16, 0.08], colorEnd: [0.4, 0.02, 0.02],
          alpha: 1, alphaEnd: 0, drag: 0.2, flicker: 0.5,
        });
      });
    },
  };
  return {
    group, treeSpots: K.treeSpots, bare: K.bare, slabs: K.slabs, nest: { x: L.throne.x, z: L.throne.z }, bonfire: { x: L.bonfire.x, z: L.bonfire.z },
    material: mat, stoneMaterial: stoneMat, slabMaterial: slabMat, grass, sky: SKY, ambience, breakables: K.breakables,
  };
}

// ---------------------------------------------------------------- A: STARFALL
function createStarfall(U, colliders) {
  const L = CONCEPT_LAYOUT.a, K = makeKit(1311), rng = K.rng, S = L.seal, T = L.throne, R = L.R;

  // ---- the floor: rings of fused plates, heaved and broken toward the rim
  ringFloor(K, S.x, S.z, [[0, 1.6, 8], [1.6, 4.3, 8], [4.3, 6.2, 12], [6.2, 8.6, 16], [8.6, 11, 20], [11, 13.1, 24], [13.1, R, 28]], {
    skip: (x, z, r) => (z < L.daisZ - 0.2 && Math.abs(x) < 6) || (r > 11 && rng() < 0.24) || (r > 8 && r < 11 && rng() < 0.05),
    tilt: (r) => 0.004 + 0.05 * Math.pow(Math.max(0, (r - 8) / 7), 2),
    col: (r) => obs(r < 1.6 ? 1.45 : 1.25 - 0.3 * smooth(6, 15, r)),
  });
  seal(K, S);
  // cracks of red light from the seal out to the rim (where the star's heat still leaks)
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + 0.35 + range(rng, -0.12, 0.12);
    if (Math.sin(a) < -0.86) continue; // not under the dais
    const r1 = range(rng, 11, R - 0.5);
    inlayLine(K, S.x + Math.cos(a) * (S.r + 0.5), S.z + Math.sin(a) * (S.r + 0.5), S.x + Math.cos(a + range(rng, -0.1, 0.1)) * r1, S.z + Math.sin(a) * r1, { jit: 0.7, size: 0.46, color: [0.8, 0.055, 0.04] });
  }

  // ---- the throne: a seat cut in front of the star itself, a crown of splinters behind it
  throne(K, colliders, L, TIERS(L));
  for (const sx of [-1, 1]) {
    const star = prep(new THREE.IcosahedronGeometry(4.6, 1));
    lumpy(star, 2.2, 0.3, 7.3 + sx * 3);
    star.scale(1.0, 0.95, 0.9);
    star.rotateZ(sx * 0.16);
    star.translate(T.x + sx * 4.3, 1.5, T.z - 5.4);
    carve(star, { col: facetCol(OBS, 1.3), ao: (px, py) => 0.45 + 0.55 * Math.min(1, py / 3.2) });
    K.stone.push(star);
  }
  for (let x = -7.5; x <= 7.5; x += 1.6) colliders.add(x, T.z - 4.2, 1.1, 'stone');
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const roll = -i * 0.2 + range(rng, -0.05, 0.05), h = (10.5 - Math.abs(i) * 1.1) * range(rng, 0.85, 1.1);
    K.stone.push(spike(rng, T.x + i * 1.15, 2.6, T.z - 4.8 - Math.abs(i) * 0.12, { h, w: 0.95 - Math.abs(i) * 0.05, d: 0.42, tip: 0.06, roll, lean: -0.1, col: facetCol(VOIDGLASS, 1.7) }));
  }
  // the cleft he climbed out of: a column of red light between the halves, behind the seat
  for (let y = 1.4; y < 7.4; y += 0.36) {
    for (const sx of [-1, 1]) K.glow.push({ x: T.x + sx * (0.1 + y * 0.17) + range(rng, -0.12, 0.12), y, z: T.z - 2.4 - y * 0.25, glyph: sx < 0 ? '\\' : '/', size: 0.5, color: [2.4, 0.12, 0.08], flicker: 0.14 });
  }
  K.fires.push({ x: T.x, y: 1.2, z: T.z - 2.2, kind: 'wisp', r: 0.5 });

  // ---- the rim: plates thrown up and outward, a broken crown: low to the south, tall behind him
  for (let i = 0; i < 74; i++) {
    const a = -Math.PI + ((i + rng() * 0.7) / 74) * TAU, sth = Math.abs(a) / Math.PI;
    const r = R + range(rng, 0.8, 2.8), x = Math.sin(a) * r, z = -Math.cos(a) * r;
    const keep = hash2(i * 3.7 + 1, 9.1) > 0.3;
    const h = (0.8 + 6.2 * (1 - smooth(0.1, 0.72, sth))) * range(rng, 0.5, 1);
    const w = range(rng, 1.2, 2.4), dd = range(rng, 0.45, 0.85), lean = range(rng, 0.15, 0.48), yaw = Math.atan2(x, z) + range(rng, -0.35, 0.35);
    const glass = rng() < 0.3;
    if (!keep || sth > 0.9 || (Math.abs(x) < 8.5 && z < L.daisZ)) continue;
    const g = glass
      ? crystal(rng, x, z, { h: h * 1.1 + 0.6, r: 0.3 + h * 0.1, lean, yaw })
      : spike(rng, x, -0.2, z, { h, w, d: dd, tip: range(rng, 0.1, 0.36), lean, yaw, col: facetCol(OBS, 1.3), lump: 0.1 });
    thing(K, colliders, glass ? 'shard' : 'slab', 'stone', x, z, h > 1.3 ? 0.85 : 0, h, [g]);
    if (rng() < 0.5) K.stone.push(...rubble(rng, x - Math.sin(a) * 1.2, z + Math.cos(a) * 1.2, 1.1, 3));
  }

  // ---- shards of the star standing in the floor: cover, and what he tears loose and throws
  const shards = [[-7.2, -5.8, 3.6], [7.9, -4.2, 3.1], [-9.9, 1.9, 2.7], [10.2, 3.3, 3.8], [-5.2, 8.3, 2.3], [6.2, 9.2, 2.8], [-11.2, -8.2, 4.2], [11.4, -8.4, 3.5], [3.2, -9.2, 2.1], [-11.8, 7.2, 2.9], [12.6, -2.0, 2.5], [-2.6, 11.8, 1.9]];
  for (const [x, z, h] of shards) {
    const yaw = rng() * TAU, geos = [crystal(rng, x, z, { h, r: h * 0.16, lean: range(rng, 0.05, 0.22), yaw })];
    const n = 2 + Math.floor(rng() * 2.6), a0 = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + range(rng, -0.4, 0.4), d = h * range(rng, 0.16, 0.24), hh = h * range(rng, 0.4, 0.68);
      geos.push(crystal(rng, x + Math.cos(a) * d, z + Math.sin(a) * d, { h: hh, r: hh * 0.15, lean: range(rng, 0.45, 0.85), yaw: Math.atan2(Math.cos(a), Math.sin(a)) }));
    }
    geos.push(...rubble(rng, x, z, h * 0.5, 4, { col: VOIDGLASS, k: 1.6, size: [0.1, 0.24] }));
    thing(K, colliders, 'shard', 'stone', x, z, h * 0.24 + 0.2, h, geos);
  }
  // ---- stones the Void still holds off the ground
  for (const [x, y, z, r] of [[-12.6, 3.4, -3.0, 1.0], [13.4, 4.2, -5.8, 1.25], [-8.8, 5.2, -10.4, 0.9], [9.2, 4.6, -11.0, 1.1], [14.2, 2.8, 4.8, 0.8], [-14.0, 2.5, 4.2, 0.7]]) {
    thing(K, colliders, 'hover', 'stone', x, z, 0, y + r, hoverRock(rng, x, y, z, r));
    K.fires.push({ x, y: 0.1, z, kind: 'wisp', r: r * 0.8 });
  }
  // ---- vents: pits where the star still burns under the floor (the arena's light)
  for (const [x, z] of [[-8.6, -1.6], [8.8, 0.2], [-7.0, 10.2], [8.4, 6.4]]) {
    K.stone.push(...rubble(rng, x, z, 0.85, 7, { size: [0.14, 0.3], k: 1.2 }));
    K.fires.push({ x, y: 0.12, z, kind: 'vent' });
    K.bare.push({ x, z, r: 1 });
  }

  // ---- outside: the forest thrown flat, every trunk pointing away from the crater
  approach(K, colliders, L.bonfire, R + 1.2);
  const clear = (x, z) => Math.hypot(x, z) > R + 4.5 && !(z > 0 && z < L.bonfire.z + 4 && Math.abs(x) < 4.4) && !(Math.abs(x) < 9 && z < L.daisZ && z > T.z - 12);
  for (let i = 0, n = 0; i < 8000 && n < 110; i++) {
    const a = rng() * TAU, r = R + 5 + Math.pow(rng(), 1.2) * 34, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clear(x, z) || K.treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 3.4)) continue;
    const s = range(rng, 0.85, 1.35), flat = r < R + 24 || rng() < 0.3;
    if (flat) K.tree.push(...fallenTree(rng, x, z, s, Math.atan2(x, z) + range(rng, -0.22, 0.22)));
    else {
      K.tree.push(...buildDeadTree(rng, x, z, s));
      if (r < 46) colliders.add(x, z, 0.42 * s, 'trunk');
    }
    K.treeSpots.push({ x, z, r: 2.4 * s });
    n++;
  }
  return finish(K, U, 'starfall', L, {
    inArena: (x, z) => Math.hypot(x, z) < R + 1,
    grass: { ash: 0.7, height: 0.55, density: (x, z) => (Math.hypot(x, z) < R + 3.2 ? 0 : 0.15) },
  });
}

// ---------------------------------------------------------------- B: THE GRAVE OF BLADES
function createBladeGrave(U, colliders) {
  const L = CONCEPT_LAYOUT.b, K = makeKit(1423), rng = K.rng, S = L.seal, T = L.throne, R = L.R;
  const lr = mulberry32(CONFIG.seed + 2977);
  const STEEL = mul(OBS, 2.9);
  const sword = (x, z, s, lean, yaw, red = false) => carved(buildGreatSword(lr, x, z, yaw, s, red ? { lean } : { lean, edge: STEEL }));

  // ---- the duelling ring: paved, round the seal; broken flagstones trailing off into the ash
  ringFloor(K, S.x, S.z, [[0, 1.6, 8], [1.6, 4.3, 8], [4.3, 6.2, 12], [6.2, 8.6, 18]], { col: (r) => obs(r < 1.6 ? 1.45 : 1.2) });
  for (let i = 0; i < 150; i++) {
    const a = rng() * TAU, r = 9.4 + Math.pow(rng(), 1.6) * 8.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < L.daisZ + 0.6 && Math.abs(x) < 6.5) continue;
    if (K.slabs.some((s) => s.r < 1.4 && Math.hypot(s.x - x, s.z - z) < 1.5)) continue;
    const w = range(rng, 1.0, 1.9), d = range(rng, 0.8, 1.5);
    const s = buildFlagstone(rng, x, z, w, d, rng() * TAU);
    K.slab.push(s.geo);
    K.slabs.push({ x, z, r: Math.max(w, d) * 0.65, outline: s.outline });
  }
  seal(K, S);

  // ---- the throne at the foot of the blade that fell with him
  throne(K, colliders, L, TIERS(L, [4.6, 3.6, 2.6]));
  K.stone.push(...sword(T.x, T.z - 2.3, 3.2, 0.05, 0, true));
  colliders.add(T.x, T.z - 2.3, 2.4, 'stone');
  for (let y = 3; y < 17; y += 0.55) K.glow.push({ x: T.x - 0.05 * y, y, z: T.z - 1.6, glyph: '|', size: 0.6, color: [2.2, 0.11, 0.07], flicker: 0.12 });

  // ---- the great swords of those who came before, on the flanks and behind him
  for (const [x, z, s, lean, yaw] of [
    [-14.4, -6.2, 1.15, 0.2, 0.3], [-17.8, 1.6, 0.95, -0.14, -0.5], [-11.6, -13.2, 1.3, 0.1, 0.15], [-20.5, -9.5, 1.1, 0.3, 0.8],
    [14.2, -7.4, 1.2, -0.22, -0.25], [17.6, 0.6, 1.0, 0.16, 0.45], [11.8, -13.8, 1.35, -0.08, -0.1], [20.2, -11, 1.05, -0.32, -0.7],
    [-16.2, 9.4, 0.62, 0.34, 0.2], [16.4, 10.2, 0.56, -0.3, -0.3],
  ]) {
    thing(K, colliders, 'greatsword', 'metal', x, z, 0.9 * s, 9 * s, sword(x, z, s, lean, yaw, true));
  }
  // ---- the fallen's own blades, planted through the fighting space (he calls them out and throws them)
  const planted = [];
  const free = (x, z, d) => !planted.some((p) => Math.hypot(p.x - x, p.z - z) < d);
  for (let i = 0; i < 4000 && planted.length < 22; i++) {
    const a = rng() * TAU, r = range(rng, 7.6, R - 1.2), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ((Math.abs(x) < 2.6 && z > 4) || (Math.abs(x) < 5.6 && z < L.daisZ + 1.5) || !free(x, z, 3.4)) continue;
    planted.push({ x, z });
    const s = range(rng, 0.3, 0.46), geos = sword(x, z, s, range(rng, -0.3, 0.3), range(rng, -1.2, 1.2));
    const n = Math.floor(rng() * 2.6);
    for (let k = 0; k < n; k++) {
      const b = rng() * TAU, d = range(rng, 0.7, 1.2);
      geos.push(...sword(x + Math.cos(b) * d, z + Math.sin(b) * d, range(rng, 0.16, 0.24), range(rng, -0.45, 0.45), range(rng, -1.4, 1.4)));
    }
    thing(K, colliders, 'sword', 'metal', x, z, 0.4, 9 * s, geos);
  }
  // ---- the circle of the fallen: one blade for each who came to kill him, the way in left open
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * TAU, x = Math.cos(a) * R, z = Math.sin(a) * R;
    if ((z > 0 && Math.abs(x) < 3.2) || (z < L.daisZ + 1 && Math.abs(x) < 6) || hash2(i * 5.1, 2.3) < 0.1) continue;
    const s = range(rng, 0.19, 0.23);
    thing(K, colliders, 'sword', 'metal', x, z, 0.25, 9 * s, sword(x, z, s, range(rng, -0.07, 0.07), -a + Math.PI / 2));
  }
  // dim inlay between them: the ring is drawn on the ground too
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * TAU, x = Math.cos(a) * R, z = Math.sin(a) * R;
    if (z < L.daisZ + 1 && Math.abs(x) < 6) continue;
    K.glow.push({ x, y: 0.08, z, glyph: '-', size: 0.5, color: [0.7, 0.05, 0.035], rot: groundRot(-Math.sin(a), Math.cos(a)), flicker: 0.14 });
  }
  for (const [x, z] of [[-7.6, -7.2], [7.6, -7.2], [-7.4, 7.4], [7.4, 7.4]]) brazier(K, colliders, x, z);

  // ---- outside: blades as far as the dark shows, a few dead trees, the path
  approach(K, colliders, L.bonfire, R + 1.4);
  for (let i = 0, n = 0; i < 6000 && n < 90; i++) {
    const a = rng() * TAU, r = R + 3 + Math.pow(rng(), 1.3) * 30, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ((z > 0 && Math.abs(x) < 3.6) || (Math.abs(x) < 7 && z < L.daisZ) || !free(x, z, 2.8)) continue;
    planted.push({ x, z });
    const big = rng() < 0.12 && Math.abs(Math.atan2(x, -z)) < 2.2;
    const s = big ? range(rng, 0.7, 1.2) : range(rng, 0.14, 0.32);
    K.stone.push(...sword(x, z, s, range(rng, -0.4, 0.4), range(rng, -1.4, 1.4), big));
    if (r < 40) colliders.add(x, z, big ? 0.9 * s : 0.3, 'stone');
    K.bare.push({ x, z, r: 0.5 });
    n++;
  }
  for (let i = 0, n = 0; i < 4000 && n < 36; i++) {
    const a = rng() * TAU, r = range(rng, 30, 62), x = Math.cos(a) * r, z = Math.sin(a) * r + 4;
    if ((z > 0 && Math.abs(x) < 5) || K.treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
    const s = range(rng, 0.9, 1.4);
    K.tree.push(...buildDeadTree(rng, x, z, s));
    K.treeSpots.push({ x, z, r: 2.4 * s });
    if (r < 46) colliders.add(x, z, 0.42 * s, 'trunk');
    n++;
  }
  return finish(K, U, 'bladeGrave', L, {
    inArena: (x, z) => Math.hypot(x, z) < R + 2,
    grass: { ash: 0.8, height: 0.5, density: (x, z) => (Math.hypot(x, z) < 9 ? 0 : Math.hypot(x, z) < R + 2 ? 0.1 : 0.2) },
  });
}

// ---------------------------------------------------------------- C: THE BROKEN HALL
/** A square pillar; `h` is the shaft. broken: its top snapped off jagged, no capital. */
function pillar(rng, x, z, { h = 5.2, broken = false, w = 1.18 }) {
  const out = [box(w * 1.48, 0.36, w * 1.48, x, 0, z, { col: obs(1.5) })];
  const shaft = prep(new THREE.BoxGeometry(w, h, w, 2, Math.max(2, Math.round(h)), 2));
  shaft.translate(0, 0.36 + h / 2, 0);
  if (broken) {
    const p = shaft.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.36 + h - 0.01) p.setY(i, p.getY(i) - hash2(Math.round(p.getX(i) * 9) + x * 7, Math.round(p.getZ(i) * 9) + z * 3) * Math.min(1.1, h * 0.4));
  }
  shaft.translate(x, 0, z);
  carve(shaft, { col: obs(1.35), ao: (px, py) => 0.55 + 0.45 * Math.min(1, py / 1.4) });
  out.push(shaft);
  if (!broken) out.push(box(w * 1.4, 0.42, w * 1.4, x, 0.36 + h, z, { col: obs(1.6) }));
  return out;
}

/** A pillar lying where it fell from (x, z) toward (sin yaw, cos yaw), broken in two. */
function fallenPillar(rng, x, z, len, yaw, w = 1.18) {
  const out = [];
  for (const [t0, t1, skew] of [[0.08, 0.55, 0], [0.61, 1, range(rng, -0.12, 0.12)]]) {
    const l = (t1 - t0) * len;
    const g = prep(new THREE.BoxGeometry(w, l, w, 1, 3, 1));
    lumpy(g, 0.05, 1.5, rng() * 30);
    g.rotateX(Math.PI / 2);
    g.translate(0, w / 2 - 0.06, t0 * len + l / 2);
    g.rotateY(yaw + skew);
    g.translate(x, 0, z);
    carve(g, { col: obs(1.35), ao: (px, py) => 0.6 + 0.4 * Math.min(1, py / 0.9) });
    out.push(g);
  }
  out.push(...pillar(rng, x, z, { h: 0.7, broken: true }));
  out.push(...rubble(rng, x + Math.sin(yaw) * len * 0.58, z + Math.cos(yaw) * len * 0.58, 0.9, 5));
  return out;
}

function createBrokenHall(U, colliders) {
  const L = CONCEPT_LAYOUT.c, K = makeKit(1531), rng = K.rng, S = L.seal, T = L.throne;
  const lr = mulberry32(CONFIG.seed + 2977);
  // ---- the floor: the hall's great tiles, the edges broken away into the earth
  const edge = (x, z) => Math.min(L.halfX - Math.abs(x), z - (L.zN + 1), L.zS - z); // m inside the old walls
  for (let z = L.zN + L.cell / 2 + 1; z < L.zS; z += L.cell) {
    for (let x = -L.halfX + L.cell / 2; x < L.halfX; x += L.cell) {
      if (z < L.daisZ && Math.abs(x) < 5.6) continue;
      const e = edge(x, z) + 2.6 * (fbm2(x * 0.21 + 9, z * 0.21 + 4, 2) - 0.5);
      if (e < 0.9 && rng() < 0.75 - e * 0.4) continue;
      const w = L.cell - 0.08, pts = [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]];
      floorSlab(K, pts, x, z, { tilt: e < 2.2 ? 0.035 : 0.004, col: obs(Math.abs(x) < L.cell ? 1.3 : 1) });
    }
  }
  seal(K, S);
  for (const sx of [-1, 1]) {
    for (let z = L.zS - 0.6; z > L.daisZ + 0.6; z -= 0.95) {
      if (Math.hypot(sx * 1.1 - S.x, z - S.z) < S.r + 0.5) continue;
      K.glow.push({ x: sx * 1.1, y: 0.08, z, glyph: '|', size: 0.4, color: [0.85, 0.06, 0.045], flicker: 0.1 });
    }
  }
  // ---- the throne under its crown of spikes, and behind it the broken ring
  throne(K, colliders, L, TIERS(L, [5.4, 4.2, 3.0]));
  const dark = obs(1.55);
  K.stone.push(spike(rng, T.x, 0.52, T.z - 0.45, { h: 6.4, w: 1.9, d: 0.5, tip: 0.12, lean: -0.06, col: dark }));
  for (const sx of [-1, 1]) {
    K.stone.push(spike(rng, T.x + sx * 1.25, 0.52, T.z - 0.5, { h: 4.6, w: 0.9, d: 0.45, tip: 0.08, lean: 0.3, yaw: (sx * Math.PI) / 2, col: dark }));
    K.stone.push(spike(rng, T.x + sx * 2.15, 0.52, T.z - 0.4, { h: 3.1, w: 0.7, d: 0.4, tip: 0.08, lean: 0.52, yaw: (sx * Math.PI) / 2, col: dark }));
  }
  const RR = 7.6, cy = 4.4, zc = T.z - 4.4;
  const arc = (a0, a1, o = {}) => {
    const g = prep(new THREE.TorusGeometry(RR, 0.95, 5, Math.max(3, Math.ceil((a1 - a0) / 0.17)), a1 - a0));
    g.rotateZ(a0);
    lumpy(g, 0.25, 0.6, rng() * 40);
    if (o.flat) {
      g.translate(-Math.cos((a0 + a1) / 2) * RR, -Math.sin((a0 + a1) / 2) * RR, 0);
      g.rotateX(-Math.PI / 2 + 0.12);
      g.rotateY(o.yaw ?? 0);
      g.translate(o.x, 0.75, o.z);
    } else g.translate(T.x, cy, zc);
    carve(g, { col: facetCol(OBS, 1.45), ao: (px, py) => 0.5 + 0.5 * Math.min(1, py / 3) });
    return g;
  };
  K.stone.push(arc(-0.45, 1.12), arc(1.72, Math.PI + 0.45));
  thing(K, colliders, 'ringpiece', 'stone', 9.4, T.z + 1.2, 1.5, 1.6, [arc(1.16, 1.66, { flat: true, x: 9.4, z: T.z + 1.2, yaw: 0.5 }), ...rubble(rng, 8.6, T.z + 2.4, 1.6, 6)]);
  for (const sx of [-1, 1]) colliders.add(T.x + sx * RR, zc, 1.3, 'stone');
  for (let a = -0.3; a < Math.PI + 0.3; a += 0.085) {
    if (a > 1.12 && a < 1.72) continue;
    K.glow.push({ x: T.x + Math.cos(a) * (RR - 1.05), y: cy + Math.sin(a) * (RR - 1.05), z: zc + 0.6, glyph: 'X+ZTHKY7'[Math.round(a * 40) % 8], size: 0.5, color: [1.5, 0.09, 0.06], rot: Math.atan2(Math.cos(a) * COS_PITCH, -Math.sin(a)), flicker: 0.15 });
  }

  // ---- the pillars: two rows inside the fighting space; some whole, some snapped, some down
  const PZ = [-9.6, -3.4, 2.8, 9, 14.6];
  const rows = {
    [-1]: [{ h: 5.2 }, { h: 2.7, broken: true }, { fallen: 1.9, len: 4.6 }, { h: 1.6, broken: true }, { h: 0.9, broken: true }],
    [1]: [{ h: 3.5, broken: true }, { h: 5.2 }, { h: 2.1, broken: true }, { fallen: -2.6, len: 4.4 }, { h: 1.2, broken: true }],
  };
  for (const sx of [-1, 1]) {
    rows[sx].forEach((d, i) => {
      const x = sx * L.pillarX, z = PZ[i];
      if (d.fallen !== undefined) {
        thing(K, colliders, 'pillar', 'stone', x, z, 0.9, 1.2, fallenPillar(rng, x, z, d.len, d.fallen));
        for (const f of [0.3, 0.55, 0.85]) colliders.add(x + Math.sin(d.fallen) * d.len * f, z + Math.cos(d.fallen) * d.len * f, 0.62, 'stone');
        return;
      }
      const geos = pillar(rng, x, z, d);
      if (d.broken) geos.push(...rubble(rng, x + sx * 1.1, z + 0.9, 1.0, 4));
      else for (let y = 1.0; y <= 4.7; y += 0.52) K.glow.push({ x: x - sx * 0.66, y, z: z + 0.05, glyph: '|', size: 0.5, color: [2.3, 0.11, 0.07], flicker: 0.12 });
      thing(K, colliders, 'pillar', 'stone', x, z, 0.98, d.h + 0.4, geos);
    });
  }
  // ---- what is left of the walls: heaps along their line, two corners still standing in the north
  for (const sx of [-1, 1]) {
    for (let z = L.zN + 2; z < L.zS; z += range(rng, 3.2, 5.2)) K.stone.push(...rubble(rng, sx * (L.halfX + 1.2 + range(rng, -0.4, 0.6)), z, 1.4, 5, { size: [0.2, 0.55] }));
    K.stone.push(box(1.3, 3.6, 3.4, sx * (L.halfX + 1.1), 0, L.zN + 0.6, { col: obs(1.2), seg: 3 }), box(3.2, 2.2, 1.3, sx * (L.halfX - 0.6), 0, L.zN - 1.2, { col: obs(1.2), seg: 2 }));
    colliders.add(sx * (L.halfX + 1.1), L.zN + 0.6, 1.4, 'stone');
    // the door's stumps: the threshold
    thing(K, colliders, 'stump', 'stone', sx * 3.1, L.zS + 1.1, 0.8, 1.1, [box(1.3, range(rng, 0.8, 1.2), 1.4, sx * 3.1, 0, L.zS + 1.1, { col: obs(1.5) }), ...rubble(rng, sx * 4.4, L.zS + 1.3, 0.9, 4)]);
  }
  // ---- the wardens on the flanks, turned to the seal; the great swords beyond the pillars
  for (const sx of [-1, 1]) {
    const x = sx * 13.6, z = -4.4;
    thing(K, colliders, 'warden', 'stone', x, z, 2.2, 9.5, carved(buildWarden(lr, x, z, -sx * 0.5, 1.15)));
    for (const [i, zz] of [-13.5, 4.6].entries()) {
      const gx = sx * (12.2 + i * 2.6);
      thing(K, colliders, 'greatsword', 'metal', gx, zz, 0.9, 8, carved(buildGreatSword(lr, gx, zz, sx * 0.25, 1.05 - i * 0.2, { lean: sx * (0.14 + 0.1 * i) * (i ? -1 : 1) })));
    }
  }
  for (const [x, z] of [[-4.6, -8.6], [4.6, -8.6], [-11.2, 6.4], [11.2, 6.4]]) brazier(K, colliders, x, z);

  // ---- outside: dead trees and boulders in the dark, the path
  approach(K, colliders, L.bonfire, L.zS + 2.6);
  const outside = (x, z) => !(Math.abs(x) < L.halfX + 5 && z > L.zN - 8 && z < L.zS + 3) && !(z > L.zS && z < L.bonfire.z + 4 && Math.abs(x) < 4.4);
  for (let i = 0, n = 0; i < 6000 && n < 130; i++) {
    const a = rng() * TAU, r = 19 + Math.pow(rng(), 1.3) * 46, x = Math.cos(a) * r, z = Math.sin(a) * r + 4;
    if (!outside(x, z) || K.treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 3.6)) continue;
    const s = range(rng, 0.85, 1.4);
    K.tree.push(...buildDeadTree(rng, x, z, s));
    K.treeSpots.push({ x, z, r: 2.4 * s });
    if (r < 46) colliders.add(x, z, 0.42 * s, 'trunk');
    n++;
  }
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU, r = range(rng, 22, 50), x = Math.cos(a) * r, z = Math.sin(a) * r + 4;
    if (!outside(x, z)) continue;
    const size = range(rng, 0.7, 1.6);
    K.stone.push(buildBoulder(rng, x, z, size));
    colliders.add(x, z, size * 0.85, 'boulder');
  }
  return finish(K, U, 'brokenHall', L, {
    inArena: (x, z) => Math.abs(x) < L.halfX && z > L.zN && z < L.zS,
    grass: { ash: 0.7, height: 0.6, density: (x, z) => (edge(x, z) > -0.5 ? 0.04 : 0.16) },
  });
}

export const CONCEPTS = { a: createStarfall, b: createBladeGrave, c: createBrokenHall };
/** The concept `?arena=` asks for ('a' | 'b' | 'c'), or null. */
export function conceptFromSearch() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('arena');
    return q && CONCEPTS[q.toLowerCase()] ? q.toLowerCase() : null;
  } catch {
    return null;
  }
}
