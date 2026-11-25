import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAG, createDragonObjectMaterial, createCarvedGlyphMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { addSlabRims } from '../render/dragonFloor.js';
import { GlyphParticles } from '../render/particles.js';
import { mulberry32 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { prep, carve, paint, slabGeometry, SLAB_LOOK, buildBonfire } from './forest.js';

// The Training Room (ADR-099): the lab stage, a fighting game's training stage for any boss
// (`?stage=lab`, levels/index.js withStage). A dark dojo of light: a square floor of great black
// tiles with a cyan measuring grid on it (a line every 2 m, a brighter one every 10 m), magenta
// rings round the duel's centre at 3, 6, 9 and 12 m with their numbers, low walls of panels with
// cyan light in their seams and a pylon of light at each corner. (Three looks were built; the owner
// picked this one, "Holo", over a pale "Grid" and a starry "Void".)
// Same output shape as createForest / createThroneHall (world.js reads it). Everything is drawn
// through the glyph systems (STYLE.md): carved glyphs for the floor tiles, prop art for the walls
// and the pylons (the house style), the screen grid for the bonfire, glyph particles for the lines,
// the numbers and the motes.

export const ROOM = {
  half: 32, // the floor: |x|, |z| <= half
  cell: 2, // tile pitch, and the grid's
  gridHalf: 22, // the lit grid covers |x|, |z| <= this
  rings: [3, 6, 9, 12],
  center: { x: 0, z: -4 }, // where the boss stands (the rings' centre)
  bonfire: { x: 0, z: 27 },
};

/** The room's look (the owner's pick of three, 2026-11-15: "Holo"). Colours linear HDR. */
export const LOOK = Object.freeze({
  tile: [0.05, 0.065, 0.085], tileB: [0.035, 0.045, 0.06], line: [0.18, 1.05, 1.35], major: [0.4, 2.2, 2.8], ring: [2.3, 0.35, 1.9], num: [0.6, 2.6, 3.1],
  wall: [0.05, 0.07, 0.09], seam: [0.3, 2.2, 2.8], pylon: [0.3, 1.8, 2.4], motes: [0.4, 1.8, 2.4],
  sky: { moonColor: [0.22, 0.4, 0.55], ambient: [0.02, 0.04, 0.05], fogColor: [0.003, 0.009, 0.013], fogNear: 34, fogFar: 72 },
});

const SIN_PITCH = Math.sin(CONFIG.camera.pitch);
/** The on-screen angle of a ground direction (dx, dz) at the fixed camera (north up). */
const groundRot = (dx, dz) => Math.atan2(-dz * SIN_PITCH, dx);

/** A box with its base at y, carved. */
function box(w, h, d, x, y, z, col) {
  const g = prep(new THREE.BoxGeometry(w, h, d, 1, 2, 1));
  g.translate(x, y + h / 2, z);
  carve(g, { col, ao: (px, py) => 0.6 + 0.4 * Math.min(1, (py - y) / 1.5) });
  return g;
}

export function createTrainingRoom(U, colliders) {
  const L = LOOK;
  const rng = mulberry32(CONFIG.seed + 977);
  const R = ROOM, C = R.center;
  const slabGeos = [], wallGeos = [], propGeos = [], slabs = [];
  const glow = []; // { x, y, z, glyph, size, color, rot, flicker }

  // ---- the floor: great square tiles, a checker of two shades
  for (let z = -R.half + R.cell / 2; z < R.half; z += R.cell) {
    for (let x = -R.half + R.cell / 2; x < R.half; x += R.cell) {
      const w = R.cell - 0.06, pts = [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]];
      const g = slabGeometry(pts, { top: 0.03, inset: 0.04, drop: 0.02 });
      g.translate(x, 0, z);
      const shade = ((Math.round((x + R.half) / R.cell) + Math.round((z + R.half) / R.cell)) & 1) ? L.tile : L.tileB;
      carve(g, { col: () => shade, ao: 0.95, edge: (px, py, pz, nx, ny) => (ny > 0.5 && ny < 0.95 ? 1 : 0) });
      slabGeos.push(g);
      slabs.push({ x, z, r: w * 0.71, outline: pts.map(([a, b]) => [x + a, z + b]) });
    }
  }

  // ---- the measuring grid: lines every 2 m, brighter every 10 m
  const G = R.gridHalf, step = 0.55;
  for (let k = -G; k <= G; k += R.cell) {
    const major = Math.abs(k % 10) < 1e-6;
    const col = major ? L.major : L.line, size = major ? 0.42 : 0.32;
    for (let t = -G; t <= G; t += step) {
      glow.push({ x: t, y: 0.05, z: k, glyph: '-', size, color: col, rot: groundRot(1, 0), flicker: 0.04 });
      glow.push({ x: k, y: 0.05, z: t, glyph: '|', size: size * 0.9, color: col, rot: 0, flicker: 0.04 });
    }
  }
  // ---- the rings round the duel's centre, each with its number at four points
  for (const r of R.rings) {
    const n = Math.round((TAU * r) / 0.42);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      glow.push({ x: C.x + Math.cos(a) * r, y: 0.07, z: C.z + Math.sin(a) * r, glyph: '-', size: 0.46, color: L.ring, rot: groundRot(-Math.sin(a), Math.cos(a)), flicker: 0.12 });
    }
    const label = String(r);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const cx = C.x + Math.cos(a) * (r + 0.55), cz = C.z + Math.sin(a) * (r + 0.55);
      for (let c = 0; c < label.length; c++) glow.push({ x: cx + (c - (label.length - 1) / 2) * 0.42, y: 0.08, z: cz, glyph: label[c], size: 0.62, color: L.num, rot: 0, flicker: 0 });
      glow.push({ x: cx + label.length * 0.21 + 0.3, y: 0.08, z: cz, glyph: 'm', size: 0.42, color: L.num, rot: 0, flicker: 0 });
    }
  }
  // the centre cross
  for (let t = -1.2; t <= 1.2; t += 0.3) {
    glow.push({ x: C.x + t, y: 0.08, z: C.z, glyph: '-', size: 0.5, color: L.ring, rot: groundRot(1, 0), flicker: 0.1 });
    glow.push({ x: C.x, y: 0.08, z: C.z + t, glyph: '|', size: 0.46, color: L.ring, rot: 0, flicker: 0.1 });
  }

  // ---- the walls: low panels round the floor, light in every seam, a pylon at each corner
  const pylons = [];
  {
    const W = R.half + 0.6, panel = 4;
    for (const [ax, az, horiz] of [[0, -W, true], [0, W, true], [-W, 0, false], [W, 0, false]]) {
      for (let t = -R.half; t < R.half; t += panel) {
        const x = horiz ? t + panel / 2 : ax, z = horiz ? az : t + panel / 2;
        const h = 1.6 + 0.4 * rng();
        wallGeos.push(box(horiz ? panel - 0.12 : 0.6, h, horiz ? 0.6 : panel - 0.12, x, 0, z, () => L.wall));
        const sx = horiz ? t : ax, sz = horiz ? az : t;
        for (let y = 0.3; y < h; y += 0.42) glow.push({ x: sx, y, z: sz, glyph: '|', size: 0.44, color: L.seam, rot: 0, flicker: 0.1 });
      }
      for (let t = -R.half; t <= R.half; t += 1.5) colliders.add(horiz ? t : ax, horiz ? az : t, 0.8, 'stone');
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (W - 0.2), z = sz * (W - 0.2);
        const g = prep(new THREE.CylinderGeometry(0.35, 0.45, 4.2, 6));
        g.translate(x, 2.1, z);
        paint(g, { col: L.wall, flag: FLAG.ART_PROP, ao: 0.85 });
        propGeos.push(g);
        pylons.push({ x, y: 4.4, z });
        for (let y = 0.4; y < 4.2; y += 0.45) glow.push({ x, y, z: z + 0.36 * -sz, glyph: '|', size: 0.5, color: L.pylon, rot: 0, flicker: 0.15 });
      }
    }
  }

  // ---- the bonfire, by the south wall (the flow's rest and respawn)
  const BF = R.bonfire;
  propGeos.push(...buildBonfire(rng, BF.x, BF.z));
  colliders.add(BF.x, BF.z, 0.75, 'bonfire');

  // ---- meshes
  const group = new THREE.Group();
  group.name = 'trainingRoom';
  // (?dpProps / ?dpTrees: the dragon print's relief, render/dragonProps.js; both off: createAsciiObjectMaterial itself)
  const mat = createDragonObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide });
  const pitch = CONFIG.camera.pitch;
  const slabMat = createCarvedGlyphMaterial(U, {
    ...SLAB_LOOK, gain: 1.4, lumScale: 2.0, edge: 0.55, inkFloor: 0.03, crackAmount: 0.08, topGlyphs: ['.   ', '. . ', '.:. ', ':.:.', ':;:.', ';:;:'], viewPitch: pitch,
    dp: { k: 0.6, top: 0.04 }, // (the dragon print, `?dpFloor=`: the room's floor stays dim under its lit grid)
  });
  // the walls and the pylons are printed like the wyrm (prop art, the house style: ADR-100); the
  // floor stays carved, as every level's does. A dark room: a higher source gain
  const wallMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: 1.6 });
  const addMesh = (geos, m, name) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.name = name;
    group.add(mesh);
  };
  addMesh(slabGeos, slabMat, 'floor');
  addMesh(wallGeos, wallMat, 'walls');
  addMesh(propGeos, mat, 'props');
  markCaster(group);
  addSlabRims(group, slabMat); // (the dragon print's rims: only under ?dpFloor)

  // ---- the room's life: the lit grid, the pylons' lights, motes
  let glowSys = null;
  const st = { motes: 0 };
  const ambience = {
    setup(game) {
      glowSys = new GlyphParticles(game.U, { max: glow.length + 8, additive: true });
      game.pipeline?.registerParticles?.(glowSys);
      for (const g of glow) {
        glowSys.spawn({ x: g.x, y: g.y, z: g.z, life: 1e9, size: g.size, sizeEnd: g.size, glyph: g.glyph, color: g.color, colorEnd: g.color, alpha: 1, alphaEnd: 1, rot: g.rot ?? 0, flicker: g.flicker ?? 0 });
      }
      for (const p of pylons) p.light = game.lights?.add?.({ x: p.x, y: p.y, z: p.z, color: L.pylon.map((c) => c * 0.6), intensity: 2.2, radius: 14, flicker: 0.05 }) ?? null;
    },
    setVisible(on) {
      if (glowSys?.mesh) glowSys.mesh.visible = !!on;
    },
    update(dt, game) {
      glowSys?.update(dt, game.time);
      const fx = game.fx?.add;
      if (!fx) return;
      const f = game.U.uFocus.value;
      st.motes += dt * 6;
      while (st.motes >= 1) {
        st.motes -= 1;
        const x = f.x + (Math.random() - 0.5) * 30, z = f.z + (Math.random() - 0.5) * 24;
        if (Math.abs(x) > R.half || Math.abs(z) > R.half) continue;
        fx.spawn({
          x, y: 0.1 + Math.random() * 0.6, z, vx: 0, vy: 0.3 + Math.random() * 0.4, vz: 0,
          life: 3 + Math.random() * 3, size: 0.1, sizeEnd: 0.03, glyph: ".'·", color: L.motes, colorEnd: L.motes.map((c) => c * 0.2), alpha: 0.9, alphaEnd: 0, flicker: 0.4,
        });
      }
    },
  };

  return {
    group, treeSpots: [], bare: [{ x: BF.x, z: BF.z, r: 2.4 }], slabs, nest: { x: C.x, z: C.z }, bonfire: { x: BF.x, z: BF.z },
    material: mat, stoneMaterial: wallMat, slabMaterial: slabMat,
    grass: { ash: 0, height: 0.5, density: () => 0 },
    sky: L.sky,
    ambience,
  };
}

/** The world overrides for the training room (levels/index.js withStage). */
export const ROOM_WORLD = Object.freeze({
  arenaRadius: 30,
  playerBound: 31,
  dragonBound: 24,
  bonfire: { x: ROOM.bonfire.x, z: ROOM.bonfire.z },
  playerSpawn: { x: ROOM.bonfire.x + 0.6, z: ROOM.bonfire.z - 1.7 },
  dragonSleep: { x: ROOM.center.x, z: ROOM.center.z, yaw: 0 },
  bossTriggerZ: 16,
  wakeRadius: 12,
});
