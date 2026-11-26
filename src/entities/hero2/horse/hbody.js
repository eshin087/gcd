// The horse's drawn body: an ordinary dark riding horse in the CREATURE look (the wyrm's art path,
// FLAG.ART with a `wyrm` art source; docs/STYLE.md "The house style"): fine digits, a dark body with
// brighter digits only where the camera's key light catches it, an outline of stroke characters along
// the parts, no blank cell inside a shape. Its own colours, kept low: a near-black brown hide, a black
// mane and tail, pale-grey hooves, dark red-brown leather, a dull red saddle cloth, dull steel.
//
// Built once on the horse's skeleton (hskeleton.js): one group per joint, moved from the FK each step
// (`update(world, dt)`), every rigid part batched into one draw call per material (render/rigidBatch.js).
// The mane, the forelock and the tail's hair are SPRING CHAINS (verlet points in the world, hanging under
// their own weight, swung by the body's motion and the level's wind: `game.world?.life?.wind`), drawn as
// rigid ribbons re-aimed every step. The reins run from the bit to the `rein` socket.
//
// Drawn at scale 1: the skeleton's metres are the drawn metres (the hero is drawn 1.08x; the horse is
// built 1.6 m at the withers for the 1.85 m gameplay hero, so the drawn rider sits a little large on it,
// like a tall man on a 16-hand horse). `look('solid')` shows the art source without the letters (the
// Lab's solid look), `look('ascii')` the game's.
//
//   buildHorseBody(game, opts) -> { object3d, update(world, dt), reset(), look(mode), dispose(), mats }
import * as THREE from 'three';
import { createSurfaceGlyphMaterial, FLAG } from '../../../render/materials.js';
import { limbGeometry, ellipsoidGeometry, hornGeometry, cylindricalGUV } from '../../../render/glyphGeometry.js';
import { batchRigid } from '../../../render/rigidBatch.js';
import { markCaster } from '../../../render/pipeline.js';
import { HJ, HJI } from './hskeleton.js';
import { HORSE } from './hdims.js';

// ------------------------------------------------------------------ the art sources (materials.js wyrmFeatures)
const LIT = { key: [-0.5, 0.9, 1.0], envSat: 0.3 };
export const HORSE_ART = {
  hide: { ...LIT, ink: [0.11, 0.09, 0.08], light: [1.0, 0.8, 1.0, 0.025], strokes: 'axis', strokeEdge: 0.35, vary: 0.5 },
  // the mane and tail: strands, so strokes along the hair everywhere
  hair: { ...LIT, ink: [0.1, 0.09, 0.085], light: [1.0, 0.8, 0.9, 0.04], strokes: 'axis', strokeEdge: 0, vary: 0.4 },
  hoof: { ...LIT, ink: [0.22, 0.21, 0.2], light: [1.0, 0.8, 1.0, 0.03], strokes: 'axis', strokeEdge: 0.3 },
  leather: { ...LIT, ink: [0.2, 0.1, 0.065], light: [1.0, 0.8, 0.9, 0.03], strokes: 'axis', strokeEdge: 0.35 },
  cloth: { ...LIT, ink: [0.14, 0.055, 0.045], light: [1.0, 0.75, 0.7, 0.03], strokes: 'axis', strokeEdge: 0.4 },
  steel: { ...LIT, ink: [0.36, 0.36, 0.37], light: [1.0, 1.0, 1.4, 0.03], strokes: 'axis', strokeEdge: 0.3 },
  eye: { ...LIT, ink: [0.03, 0.03, 0.03], light: [0.6, 0.4, 0.4, 0.0], strokes: 'none' },
};

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const D = HORSE;

/** a limb along -Y from the joint (limbGeometry builds along +Z) */
const down = (o) => limbGeometry(o).rotateX(Math.PI / 2);
/** ... along +Y */
const up = (o) => limbGeometry(o).rotateX(-Math.PI / 2);
/** ... along -Z */
const back = (o) => limbGeometry(o).rotateY(Math.PI);

// the hair's spring chains: [joint, crest offset in the joint's frame, segments, segment length, width,
// side lean (+X his left)]
const MANE = [
  ['withers', [0, 0.31, 0.12], 2, 0.1, 0.05, -1],
  ['neck1', [0, 0.18, 0.05], 2, 0.13, 0.06, -1],
  ['neck1', [0, 0.17, 0.22], 2, 0.14, 0.06, -1],
  ['neck2', [0, 0.15, 0.08], 2, 0.14, 0.06, -1],
  ['neck2', [0, 0.14, 0.24], 2, 0.13, 0.055, -1],
  ['neck3', [0, 0.12, 0.1], 2, 0.12, 0.05, -1],
  ['neck3', [0, 0.11, 0.26], 2, 0.1, 0.045, -1],
  ['head', [0, 0.11, 0.03], 2, 0.09, 0.04, 0], // the forelock
];
const TAIL_SEGS = 6, TAIL_SEG = 0.115;

export function buildHorseBody(game, { castShadow = true } = {}) {
  const U = game?.U;
  const object3d = new THREE.Group();
  object3d.name = 'hero2:horse';
  const joints = [];
  for (let j = 0; j < HJ; j++) {
    const g = new THREE.Group();
    g.name = 'hj' + j;
    object3d.add(g);
    joints.push(g);
  }
  const J = (n) => joints[HJI[n]];
  let seed = 11.7;
  const mats = {};
  for (const [name, spec] of Object.entries(HORSE_ART)) {
    const m = createSurfaceGlyphMaterial(U, { flag: FLAG.ART, wyrm: spec, seed: (seed += 5.3), glowMask: 0, ink: spec.ink });
    m.name = 'horse:' + name;
    mats[name] = m;
  }
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mats[mat]);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  // ---- the trunk: haunches, loins, barrel, chest, withers
  add(J('pelvis'), ellipsoidGeometry(0.27, 0.3, 0.4, { widthSegs: 14, heightSegs: 10 }), 'hide', 0, 0.06, -0.1); // the quarters
  add(J('pelvis'), ellipsoidGeometry(0.2, 0.16, 0.22, { widthSegs: 10, heightSegs: 6 }), 'hide', 0, 0.2, -0.05); // the croup
  add(J('spine1'), ellipsoidGeometry(0.27, 0.3, 0.36, { widthSegs: 14, heightSegs: 10 }), 'hide', 0, -0.08, 0.02); // the loins / flank
  add(J('spine2'), ellipsoidGeometry(0.31, 0.37, 0.5, { widthSegs: 16, heightSegs: 12 }), 'hide', 0, -0.13, 0.02); // the barrel
  add(J('withers'), ellipsoidGeometry(0.28, 0.37, 0.36, { widthSegs: 14, heightSegs: 10 }), 'hide', 0, -0.1, 0.1); // the chest
  add(J('withers'), ellipsoidGeometry(0.13, 0.17, 0.32, { widthSegs: 10, heightSegs: 6 }), 'hide', 0, 0.15, -0.04); // the withers' ridge
  add(J('withers'), ellipsoidGeometry(0.22, 0.24, 0.16, { widthSegs: 10, heightSegs: 8 }), 'hide', 0, -0.08, 0.36); // the breast
  // ---- the neck (deep and narrow, thick at its root) and the head
  add(J('neck1'), limbGeometry({ length: 0.36, r0: 0.29, r1: 0.19, radial: 12, rings: 3, capSegs: 2, sx: 0.62 }), 'hide', 0, -0.02, -0.12);
  add(J('neck2'), limbGeometry({ length: 0.34, r0: 0.18, r1: 0.15, radial: 12, rings: 3, capSegs: 2, sx: 0.6 }), 'hide', 0, 0, -0.03);
  add(J('neck3'), limbGeometry({ length: 0.34, r0: 0.15, r1: 0.12, radial: 12, rings: 3, capSegs: 2, sx: 0.65 }), 'hide', 0, 0, -0.03);
  add(J('head'), ellipsoidGeometry(0.1, 0.12, 0.15, { widthSegs: 12, heightSegs: 8 }), 'hide', 0, 0.0, 0.08); // the skull
  add(J('head'), limbGeometry({ length: 0.42, r0: 0.105, r1: 0.075, radial: 12, rings: 3, capSegs: 2, sx: 0.78, sy: 1.15 }), 'hide', 0, -0.02, 0.12, 0.08); // the face to the muzzle
  add(J('head'), ellipsoidGeometry(0.075, 0.07, 0.08, { widthSegs: 10, heightSegs: 6 }), 'hide', 0, -0.075, 0.52); // the muzzle
  add(J('jaw'), ellipsoidGeometry(0.085, 0.1, 0.12, { widthSegs: 10, heightSegs: 6 }), 'hide', 0, -0.02, -0.02); // the jowl
  add(J('jaw'), limbGeometry({ length: 0.34, r0: 0.06, r1: 0.045, radial: 8, rings: 2, capSegs: 1, sx: 0.85, sy: 0.7 }), 'hide', 0, -0.04, 0.02, 0.1);
  for (const s of [1, -1]) {
    add(J('head'), ellipsoidGeometry(0.02, 0.026, 0.034, { widthSegs: 8, heightSegs: 5 }), 'eye', s * 0.094, 0.035, 0.12);
    // the ears: pointed, a little cupped (flattened front to back)
    const ear = add(s > 0 ? J('earL') : J('earR'), up({ length: D.earLen, r0: 0.04, r1: 0.008, radial: 7, rings: 2, capSegs: 1, sy: 0.55 }), 'hide');
    ear.userData.ear = true;
  }
  // ---- the tail's dock (the hair is a chain below)
  for (const [n, r0, r1] of [['tail1', 0.07, 0.06], ['tail2', 0.06, 0.055], ['tail3', 0.055, 0.05], ['tail4', 0.05, 0.045]])
    add(J(n), back({ length: D.tailSeg, r0, r1, radial: 8, rings: 2, capSegs: 1 }), 'hair');
  // ---- the legs
  for (const s of ['L', 'R']) {
    const k = s === 'L' ? 1 : -1;
    // fore: the shoulder and arm (flat, muscled), the forearm, knee, cannon, fetlock, pastern, hoof
    add(J('shoulderF' + s), down({ length: D.humerus, r0: 0.15, r1: 0.11, radial: 10, rings: 4, capSegs: 2, sx: 0.62, bulge: 0.04 }), 'hide', 0, 0, 0.06);
    add(J('elbowF' + s), down({ length: D.forearm, r0: 0.11, r1: 0.055, radial: 9, rings: 3, capSegs: 2, sx: 0.8 }), 'hide');
    add(J('kneeF' + s), ellipsoidGeometry(0.052, 0.06, 0.058, { widthSegs: 8, heightSegs: 6 }), 'hide');
    add(J('kneeF' + s), down({ length: D.cannonF, r0: 0.045, r1: 0.04, radial: 8, rings: 2, capSegs: 1, sx: 0.75 }), 'hide');
    add(J('fetlockF' + s), ellipsoidGeometry(0.05, 0.052, 0.058, { widthSegs: 8, heightSegs: 6 }), 'hide');
    add(J('fetlockF' + s), down({ length: D.pasternF - 0.06, r0: 0.042, r1: 0.046, radial: 8, rings: 2, capSegs: 1 }), 'hide');
    // hind: the thigh and quarter (wide), the gaskin, the hock and its point, the cannon, fetlock, pastern, hoof
    add(J('hipH' + s), down({ length: D.femur, r0: 0.2, r1: 0.13, radial: 10, rings: 4, capSegs: 2, sx: 0.72, bulge: 0.03 }), 'hide', -k * 0.01, 0.02, -0.04);
    add(J('stifleH' + s), down({ length: D.tibia, r0: 0.12, r1: 0.055, radial: 9, rings: 3, capSegs: 2, sx: 0.65 }), 'hide');
    add(J('hockH' + s), ellipsoidGeometry(0.05, 0.065, 0.075, { widthSegs: 8, heightSegs: 6 }), 'hide', 0, 0, -0.01);
    add(J('hockH' + s), hornGeometry(0.09, 0.035, { radial: 6 }), 'hide', 0, 0.02, -0.03, 0, Math.PI, 0); // the point of the hock
    add(J('hockH' + s), down({ length: D.cannonH, r0: 0.048, r1: 0.04, radial: 8, rings: 2, capSegs: 1, sx: 0.75 }), 'hide');
    add(J('fetlockH' + s), ellipsoidGeometry(0.05, 0.052, 0.058, { widthSegs: 8, heightSegs: 6 }), 'hide');
    add(J('fetlockH' + s), down({ length: D.pasternH - 0.06, r0: 0.042, r1: 0.046, radial: 8, rings: 2, capSegs: 1 }), 'hide');
    for (const n of ['hoofF' + s, 'hoofH' + s]) {
      // the hoof: from the ground up to the coronet, broad at the ground, the toe forward
      add(J(n), up({ length: 0.075, r0: 0.064, r1: 0.05, radial: 10, rings: 2, capSegs: 1, sy: 1.15 }), 'hoof', 0, 0.0, 0.015);
    }
  }
  // ---- the tack: the saddle cloth, the saddle, the girth, the stirrup leathers and irons; the bridle
  {
    const cloth = new THREE.CylinderGeometry(0.34, 0.34, 0.66, 18, 1, true, -1.25, 2.5);
    cloth.rotateX(Math.PI / 2); // its axis along Z, the arc over the top
    cloth.rotateZ(Math.PI / 2);
    cylindricalGUV(cloth);
    add(J('spine2'), cloth, 'cloth', 0, -0.1, -0.02);
    add(J('spine2'), ellipsoidGeometry(0.19, 0.06, 0.27, { widthSegs: 12, heightSegs: 6 }), 'leather', 0, 0.25, -0.03); // the seat
    add(J('spine2'), ellipsoidGeometry(0.1, 0.07, 0.07, { widthSegs: 8, heightSegs: 5 }), 'leather', 0, 0.29, 0.21); // the pommel
    add(J('spine2'), ellipsoidGeometry(0.15, 0.08, 0.06, { widthSegs: 8, heightSegs: 5 }), 'leather', 0, 0.31, -0.27); // the cantle
    const girth = new THREE.TorusGeometry(0.335, 0.025, 6, 22);
    cylindricalGUV(girth.rotateY(Math.PI / 2));
    add(J('spine2'), girth, 'leather', 0, -0.13, 0.22);
    for (const s of [1, -1]) {
      const sad = J('saddle');
      const a = new THREE.Vector3(s * 0.2, -0.16, 0.06), b = new THREE.Vector3(s * D.stirrup[0], D.stirrup[1] + 0.06, D.stirrup[2]);
      const L = a.distanceTo(b);
      const strap = limbGeometry({ length: L, r0: 0.018, r1: 0.018, radial: 5, rings: 1, capSegs: 1, sx: 1.8, sy: 0.4 });
      const m = add(sad, strap, 'leather', a.x, a.y, a.z);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
      const iron = new THREE.TorusGeometry(0.06, 0.012, 5, 10);
      cylindricalGUV(iron.rotateY(Math.PI / 2));
      add(J(s > 0 ? 'stirrupL' : 'stirrupR'), iron, 'steel', 0, 0.05, 0);
    }
    // the bridle: the noseband, the brow band, the cheek pieces; the bit's rings
    const band = (r, x, y, z, ry = 0) => {
      const g = new THREE.TorusGeometry(r, 0.013, 5, 16);
      cylindricalGUV(g);
      add(J('head'), g, 'leather', x, y, z, 0, ry);
    };
    band(0.1, 0, -0.04, 0.37); // the noseband round the face
    band(0.115, 0, 0.03, 0.02); // the headpiece behind the ears
    for (const s of [1, -1]) {
      const g = limbGeometry({ length: 0.4, r0: 0.012, r1: 0.012, radial: 4, rings: 1, capSegs: 1 });
      const m = add(J('head'), g, 'leather', s * 0.1, 0.03, 0.02);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -0.2, 0.37).normalize());
      const ring = new THREE.TorusGeometry(0.03, 0.008, 4, 8);
      cylindricalGUV(ring.rotateY(Math.PI / 2));
      add(J('bit'), ring, 'steel', s * 0.075, 0, 0);
    }
  }
  // ---- the reins: one ribbon per side from the bit to the rider's hands (re-aimed every step)
  const reins = [];
  for (const s of [1, -1]) {
    const g = limbGeometry({ length: 1, r0: 0.012, r1: 0.012, radial: 4, rings: 1, capSegs: 1, sx: 1.6, sy: 0.5 });
    const m = new THREE.Mesh(g, mats.leather);
    object3d.add(m);
    reins.push({ m, s });
  }
  // ---- the hair: spring chains (world points), drawn as ribbons
  const chains = [];
  const ribbon = (len, w) => limbGeometry({ length: len, r0: w, r1: w * 0.8, radial: 6, rings: 2, capSegs: 1, sx: 1, sy: 0.35 });
  for (const [jn, off, n, len, w, lean] of MANE) {
    const segs = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(ribbon(len, w * 1.7 * (1 - i * 0.25)), mats.hair);
      object3d.add(m);
      segs.push(m);
    }
    chains.push({ joint: HJI[jn], off, n, len, segs, lean, stiff: 0.55, drag: 1.2, hang: 0.6, p: null });
  }
  {
    const segs = [];
    for (let i = 0; i < TAIL_SEGS; i++) {
      const w = 0.07 + 0.05 * Math.sin((Math.PI * (i + 0.5)) / TAIL_SEGS);
      const m = new THREE.Mesh(limbGeometry({ length: TAIL_SEG, r0: w, r1: w * 0.95, radial: 8, rings: 2, capSegs: 1, sx: 1, sy: 0.45 }), mats.hair);
      object3d.add(m);
      segs.push(m);
    }
    chains.push({ joint: HJI.tail4, off: [0, 0, -D.tailSeg], n: TAIL_SEGS, len: TAIL_SEG, segs, lean: 0, stiff: 0.3, drag: 1.6, hang: 1, tail: true, p: null });
  }
  for (const C of chains) {
    C.p = new Float32Array((C.n + 1) * 3); // world points (0 = the root)
    C.d = new Float32Array(C.n * 3); // each segment's direction (world, unit)
    C.v = new Float32Array(C.n * 3); // ... and how fast it turns
    C.ok = false;
  }

  if (castShadow) markCaster(object3d);
  object3d.updateMatrixWorld(true);
  const batch = U ? batchRigid(U, object3d) : null;

  // ---- per-step state (no allocations below)
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();
  const _z = new THREE.Vector3(0, 0, 1), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const wind = { x: 0, z: 0, k: 0 };
  let lookMode = 'ascii';

  function jointWorldPoint(world, j, ox, oy, oz, out) {
    // joint j's local point (ox, oy, oz) in object3d's frame
    const r = world.r, i = j * 4;
    const x = r[i], y = r[i + 1], z = r[i + 2], w = r[i + 3];
    const tx = 2 * (y * oz - z * oy), ty = 2 * (z * ox - x * oz), tz = 2 * (x * oy - y * ox);
    out.set(world.p[j * 3] + ox + w * tx + (y * tz - z * ty), world.p[j * 3 + 1] + oy + w * ty + (z * tx - x * tz), world.p[j * 3 + 2] + oz + w * tz + (x * ty - y * tx));
    return out;
  }

  /** Aim a ribbon mesh (built along +Z) from a to b (object3d's frame), its length scaled to fit. */
  function aim(m, a, b, scaleLen = true, len0 = 1) {
    _v.subVectors(b, a);
    const L = _v.length();
    m.position.copy(a);
    if (L > 1e-5) m.quaternion.setFromUnitVectors(_z, _v.multiplyScalar(1 / L));
    if (scaleLen) m.scale.set(1, 1, L / len0);
  }

  // The hair: each segment's DIRECTION is a damped spring toward where it would hang now: down under its
  // weight, along its root's line near the root (the tail's dock carries it), pushed by the air (the wind
  // minus the horse's own speed) and swung against the body's acceleration. The tip segments are softer
  // than the root's, so a toss runs out along the hair. Stable at any step (no position integration).
  const vel = { x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0, px: 0, py: 0, pz: 0, ok: false };
  function stepChains(world, dt) {
    const obj = object3d;
    obj.updateMatrixWorld(true);
    _m.copy(obj.matrixWorld);
    _mi.copy(_m).invert();
    const W = game?.world?.life?.wind;
    wind.x = wind.z = 0;
    if (W?.at) {
      try {
        W.at(obj.position.x, obj.position.z, wind);
      } catch {
        wind.x = wind.z = 0;
      }
    }
    const h = Math.min(0.05, Math.max(0, dt));
    // the body's velocity and acceleration (world, smoothed), from its middle
    jointWorldPoint(world, HJI.spine2, 0, 0, 0, _a).applyMatrix4(_m);
    if (!vel.ok) {
      vel.px = _a.x;
      vel.py = _a.y;
      vel.pz = _a.z;
      vel.x = vel.y = vel.z = vel.ax = vel.ay = vel.az = 0;
      vel.ok = true;
    } else if (h > 0) {
      const k = 1 - Math.exp(-h / 0.08);
      const nx = (_a.x - vel.px) / h, ny = (_a.y - vel.py) / h, nz = (_a.z - vel.pz) / h;
      vel.ax += ((nx - vel.x) / h - vel.ax) * k;
      vel.ay += ((ny - vel.y) / h - vel.ay) * k;
      vel.az += ((nz - vel.z) / h - vel.az) * k;
      vel.x += (nx - vel.x) * k;
      vel.y += (ny - vel.y) * k;
      vel.z += (nz - vel.z) * k;
      vel.px = _a.x;
      vel.py = _a.y;
      vel.pz = _a.z;
    }
    const airX = (wind.x - vel.x) * 0.06, airY = -vel.y * 0.04, airZ = (wind.z - vel.z) * 0.06;
    const accX = -vel.ax * 0.012, accY = -vel.ay * 0.012, accZ = -vel.az * 0.012;
    // his left (world) for the mane's side lean
    const yaw = obj.rotation.y, lx = Math.cos(yaw), lz = -Math.sin(yaw);
    for (const C of chains) {
      const P = C.p, Dd = C.d, V = C.v;
      jointWorldPoint(world, C.joint, C.off[0], C.off[1], C.off[2], _a).applyMatrix4(_m);
      // the root's own line (the tail: along the dock; the mane: none)
      if (C.tail) {
        jointWorldPoint(world, C.joint, 0, 0, 0, _b).applyMatrix4(_m);
        _w.subVectors(_a, _b).normalize();
      } else _w.set(lx * C.lean * 1.1, 0, lz * C.lean * 1.1);
      P[0] = _a.x;
      P[1] = _a.y;
      P[2] = _a.z;
      for (let i = 0; i < C.n; i++) {
        const f = C.n > 1 ? i / (C.n - 1) : 0;
        // where this segment would hang: the root's line (strong near the root), down, the air, the swing
        const keep = C.tail ? 1.6 * (1 - f) ** 2 : 0.6;
        let tx = _w.x * keep + (airX + accX) * (0.6 + f), ty = -1 + _w.y * keep + (airY + accY) * (0.6 + f), tz = _w.z * keep + (airZ + accZ) * (0.6 + f);
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        const a = i * 3;
        if (!C.ok) {
          Dd[a] = tx;
          Dd[a + 1] = ty;
          Dd[a + 2] = tz;
          V[a] = V[a + 1] = V[a + 2] = 0;
        } else if (h > 0) {
          // a damped spring per segment (softer toward the tip)
          const k = (C.tail ? 90 : 120) * (1 - 0.6 * f), c = 2 * Math.sqrt(k) * 0.55;
          for (let q = 0; q < 3; q++) {
            const tq = q === 0 ? tx : q === 1 ? ty : tz;
            V[a + q] += ((tq - Dd[a + q]) * k - V[a + q] * c) * h;
            Dd[a + q] += V[a + q] * h;
          }
          const dl = Math.hypot(Dd[a], Dd[a + 1], Dd[a + 2]) || 1;
          Dd[a] /= dl;
          Dd[a + 1] /= dl;
          Dd[a + 2] /= dl;
        }
        P[a + 3] = P[a] + Dd[a] * C.len;
        P[a + 4] = Math.max(obj.position.y + 0.02, P[a + 1] + Dd[a + 1] * C.len);
        P[a + 5] = P[a + 2] + Dd[a + 2] * C.len;
      }
      C.ok = true;
      // draw: each segment from point i to i + 1, in object3d's frame
      for (let i = 0; i < C.n; i++) {
        _a.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(_mi);
        _b.set(P[i * 3 + 3], P[i * 3 + 4], P[i * 3 + 5]).applyMatrix4(_mi);
        aim(C.segs[i], _a, _b, false);
      }
    }
  }

  const body = {
    object3d, mats, batch, chains, drawn: true,
    update(world, dt = 1 / 60) {
      const P = world.p, R = world.r;
      for (let j = 0; j < HJ; j++) {
        const g = joints[j];
        g.position.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
        g.quaternion.set(R[j * 4], R[j * 4 + 1], R[j * 4 + 2], R[j * 4 + 3]);
      }
      // the reins: bit ring -> the hands (the rein socket, a hand's width apart)
      for (const r of reins) {
        jointWorldPoint(world, HJI.bit, r.s * 0.075, 0, 0, _a);
        jointWorldPoint(world, HJI.rein, r.s * 0.06, 0, 0, _b);
        aim(r.m, _a, _b, true, 1);
      }
      object3d.updateMatrixWorld(true);
      stepChains(world, fin(dt, 1 / 60));
      object3d.updateMatrixWorld(true);
    },
    reset() {
      for (const C of chains) C.ok = false;
      vel.ok = false;
    },
    /** 'ascii' (the game's letters) | 'solid' (the art source, no letters) */
    look(mode) {
      lookMode = mode === 'solid' ? 'solid' : 'ascii';
      for (const m of Object.values(mats)) m.uniforms.uFlag.value = lookMode === 'solid' ? FLAG.NONE : FLAG.ART;
      return lookMode;
    },
    dispose() {
      batch?.dispose?.();
      object3d.removeFromParent();
      object3d.traverse((o) => o.geometry?.dispose?.());
      for (const m of Object.values(mats)) m.dispose();
    },
  };
  return body;
}

