// Foot contact for the hero2 engine: a two-bone leg IK (thigh / shin / foot) on top of a sampled pose,
// and the pin that holds a planted foot on the ground point where it landed while the body moves.
// Pure (no THREE), no allocations per call.
//
// Frames: the IK works in the FK frame (skeleton.js solveFK with the root at 0: object3d's own frame,
// +Z his front, y = 0 the ground under him). The pin keeps its anchor in the WORLD, given the placement
// of object3d each step (x, z, yaw, and a uniform scale), so a foot stays put however the owner moves him.
import { JI, PARENT, solveFK } from './skeleton.js';
import { HDIM } from './dims.js';
import { qmul, qconjmul, qfromTo, qrot, qnorm } from './qmath.js';

const LEG = {
  L: { thigh: JI.thighL, shin: JI.shinL, foot: JI.footL, toe: JI.toeL },
  R: { thigh: JI.thighR, shin: JI.shinR, foot: JI.footR, toe: JI.toeR },
};
export { LEG };

const _q = new Float64Array(16), _v = new Float64Array(12);
const HEEL_BACK = 0.05; // m behind the ankle: the heel's point on the sole

/**
 * The lowest of the sole's points (the ball of the foot and the heel) for a foot whose ankle is at
 * (ax, ay, az) with world rotation r[ri..] (FK frame). Returns its height.
 */
export function soleLow(ay, r, ri, d = HDIM) {
  // toe point: (0, -ankle, foot); heel: (0, -ankle, -HEEL_BACK)
  qrot(_v, 0, r, ri, 0, -d.ankle, d.foot);
  qrot(_v, 3, r, ri, 0, -d.ankle, -HEEL_BACK);
  return ay + Math.min(_v[1], _v[4]);
}

/**
 * Bend leg `side` so its ankle reaches (tx, ty, tz) (FK frame), the knee keeping the bend plane the
 * pose had, the foot keeping its world rotation (`keepFoot`: true) or the pose's local one. Reads the
 * current `world` (solveFK of `pose`), writes pose.q for thigh / shin / foot. The caller runs solveFK
 * again. Returns the ankle's miss (m) when the target is out of reach (0 otherwise).
 */
export function legIK(pose, world, side, tx, ty, tz, keepFoot = true, d = HDIM) {
  const L = LEG[side], P = world.p, R = world.r, q = pose.q;
  const h = L.thigh * 3, k = L.shin * 3, a = L.foot * 3;
  const hx = P[h], hy = P[h + 1], hz = P[h + 2];
  const kx = P[k] - hx, ky = P[k + 1] - hy, kz = P[k + 2] - hz; // hip -> knee
  const ax = P[a] - hx, ay = P[a + 1] - hy, az = P[a + 2] - hz; // hip -> ankle
  const la = d.thigh, lb = d.shin;
  let vx = tx - hx, vy = ty - hy, vz = tz - hz;
  let dist = Math.hypot(vx, vy, vz);
  if (!(dist > 1e-6) || !Number.isFinite(dist)) return 0;
  const ux = vx / dist, uy = vy / dist, uz = vz / dist;
  const lo = Math.abs(la - lb) + 1e-4, hi = (la + lb) * 0.9995;
  let miss = 0;
  if (dist > hi) {
    miss = dist - hi;
    dist = hi;
  } else if (dist < lo) dist = lo;
  // the bend plane: the knee's offset off the hip -> ankle line, now off the hip -> target line
  const al = Math.hypot(ax, ay, az) || 1;
  const bx = ax / al, by = ay / al, bz = az / al;
  let px = kx - bx * (kx * bx + ky * by + kz * bz);
  let py = ky - by * (kx * bx + ky * by + kz * bz);
  let pz = kz - bz * (kx * bx + ky * by + kz * bz);
  let pd = px * ux + py * uy + pz * uz;
  px -= ux * pd;
  py -= uy * pd;
  pz -= uz * pd;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) {
    // a straight leg: the knee bends toward the thigh's front (+Z)
    qrot(_v, 0, R, L.thigh * 4, 0, 0, 1);
    px = _v[0];
    py = _v[1];
    pz = _v[2];
    pd = px * ux + py * uy + pz * uz;
    px -= ux * pd;
    py -= uy * pd;
    pz -= uz * pd;
    pl = Math.hypot(px, py, pz) || 1;
  }
  px /= pl;
  py /= pl;
  pz /= pl;
  const x = (la * la - lb * lb + dist * dist) / (2 * dist);
  const y = Math.sqrt(Math.max(0, la * la - x * x));
  // the new knee (relative to the hip) and the reached ankle
  const nkx = ux * x + px * y, nky = uy * x + py * y, nkz = uz * x + pz * y;
  const tax = ux * dist, tay = uy * dist, taz = uz * dist;
  // thigh: turn its bone from the old knee direction to the new one
  const kl = Math.hypot(kx, ky, kz) || 1, nkl = Math.hypot(nkx, nky, nkz) || 1;
  qfromTo(_q, 0, kx / kl, ky / kl, kz / kl, nkx / nkl, nky / nkl, nkz / nkl);
  qmul(_q, 4, _q, 0, R, L.thigh * 4); // the thigh's new world rotation
  // the shin's bone after the thigh turned (it rides along), then onto the target
  qrot(_v, 0, _q, 0, P[a] - P[k], P[a + 1] - P[k + 1], P[a + 2] - P[k + 2]);
  const sl = Math.hypot(_v[0], _v[1], _v[2]) || 1;
  const wx = tax - nkx, wy = tay - nky, wz = taz - nkz, wl = Math.hypot(wx, wy, wz) || 1;
  qfromTo(_q, 8, _v[0] / sl, _v[1] / sl, _v[2] / sl, wx / wl, wy / wl, wz / wl);
  qmul(_q, 12, _q, 0, R, L.shin * 4); // the shin's world after the thigh's turn
  qmul(_q, 12, _q, 8, _q, 12); // ... and its own
  // locals: thigh under the hips, shin under the thigh, foot under the shin
  const hp = PARENT[L.thigh] * 4;
  qconjmul(q, L.thigh * 4, R, hp, _q, 4);
  qnorm(q, L.thigh * 4);
  qconjmul(q, L.shin * 4, _q, 4, _q, 12);
  qnorm(q, L.shin * 4);
  if (keepFoot) {
    qconjmul(q, L.foot * 4, _q, 12, R, L.foot * 4);
    qnorm(q, L.foot * 4);
  }
  return miss;
}

/**
 * Per-foot pin state. Each foot keeps an anchor per blended clip ("slots": A the clip playing, B the
 * one it fades from, live or a frozen pose), so two clips that plant the foot in different spots each
 * keep their own, and a blend between them moves the foot from one to the other with the fade instead
 * of dragging it out of the new clip's reach. A released foot carries its last correction into the air.
 */
export function createFeet() {
  const slot = () => ({ pinned: false, x: 0, y: 0, z: 0 });
  const foot = () => ({ A: slot(), B: slot(), k: 0, pinned: false, hold: false, ox: 0, oy: 0, oz: 0, tx: 0, ty: 0, tz: 0, wx: 0, wz: 0, landed: false });
  return { L: foot(), R: foot(), enabled: true, maxCorrect: 0, carry: CARRY_S, serial: -1, drop: 0 };
}

/** s: the time constant a released foot's correction fades over, in the air (so it never slides back
 *  on the ground when its plant ends). */
export const CARRY_S = 0.07;

/** Forget every anchor and carried correction (a teleport, a clip jump). */
export function resetFeet(feet) {
  for (const s of ['L', 'R']) {
    const F = feet[s];
    F.A.pinned = F.B.pinned = F.pinned = F.hold = false;
    F.k = 0;
    F.ox = F.oy = F.oz = 0;
  }
  feet.drop = 0;
}

const _own = new Float64Array(3);

/**
 * Pin the planted feet and keep both feet over the ground.
 *   pl     the clip player (engine.js): fadeW (the playing clip's weight, 1 when no fade), cA / cB
 *          ({ L, R } contact weights of the playing clip and of the one faded from), fadeSerial,
 *          fadeLive (the faded-from clip still runs: false = a frozen pose)
 *   wA, wB solveFK of the playing clip's own pose and of the faded-from one's (null: `world` stands
 *          for it, e.g. no fade)
 *   place  object3d's placement { x, z, yaw, s } in the world; dt the step (s)
 * A clip's plant is anchored, in the world, where that clip's own ankle is when the plant begins; the
 * ankle is drawn to the blend of the anchors by the blended contact weight; when every plant is over
 * the foot keeps its correction and lets it go in the air (CARRY_S); no sole point (the ball of the
 * foot, the heel) goes under y = 0. Runs solveFK again when it changed the pose. Returns true then.
 */
export function pinFeet(feet, pose, world, rest, pl, wA, wB, place, dt = 1 / 60, d = HDIM) {
  if (!feet.enabled) return false;
  const c = Math.cos(place.yaw), s = Math.sin(place.yaw), sc = place.s > 0 ? place.s : 1;
  const decay = dt > 0 ? Math.exp(-dt / Math.max(1e-3, feet.carry)) : 1;
  const fw = pl.fadeW;
  // a fade began: the playing clip's anchors become the faded-from slot (a frozen pose: the feet where
  // they were drawn), the new clip's plants anchor when they begin
  const newFade = feet.serial !== pl.fadeSerial;
  feet.serial = pl.fadeSerial;
  let changed = false, need = 0;
  feet.maxCorrect = 0;
  for (let side = 0; side < 2; side++) {
    const S = side === 0 ? 'L' : 'R', F = feet[S], L = LEG[S];
    const a = L.foot * 3, P = world.p;
    const lx = P[a], ly = P[a + 1], lz = P[a + 2];
    if (newFade) {
      if (pl.fadeLive) Object.assign(F.B, F.A);
      else {
        F.B.pinned = F.k > 0;
        F.B.x = F.wx;
        F.B.z = F.wz;
        F.B.y = F.ty * sc;
      }
      F.A.pinned = false;
      // a foot planted when the fade begins stays where it is drawn: the new clip's plant of it, if
      // that is down too, takes that spot (held there until it lifts) instead of its own ankle's, so a
      // change of clip never slides a planted foot across to the new clip's stance
      F.hold = F.k > 0 && F.B.pinned;
    }
    const cA = pl.cA[S], cB = pl.cB[S];
    if (cA <= 0) F.hold = false;
    if (F.hold && !F.A.pinned && cA > 0) {
      F.A.pinned = true;
      F.A.x = F.B.x;
      F.A.y = F.B.y;
      F.A.z = F.B.z;
    }
    // land each slot's plant where that clip's own ankle is (the playing clip carries the correction
    // a foot still has from its last plant, so a landing never jumps)
    land(F.A, cA, wA ?? world, a, F, true, place, c, s, sc);
    if (pl.fadeLive) land(F.B, cB, wB ?? world, a, F, false, place, c, s, sc);
    else if (cB <= 0) F.B.pinned = false;
    const kA = F.A.pinned ? fw * cA : 0, kB = F.B.pinned ? (1 - fw) * cB : 0, k = kA + kB;
    F.landed = k > 0 && !F.pinned;
    F.pinned = k > 0;
    F.k = k;
    let tx, ty, tz;
    if (k > 0) {
      // the anchors' blend in object3d's frame, drawn to by the blended weight
      let ax = 0, ay = 0, az = 0;
      if (kA > 0) addAnchor(F.A, kA / k, place, c, s, sc);
      if (kB > 0) addAnchor(F.B, kB / k, place, c, s, sc);
      ax = _sum[0];
      ay = _sum[1];
      az = _sum[2];
      _sum[0] = _sum[1] = _sum[2] = 0;
      const w = Math.min(1, k);
      tx = lx + (ax - lx) * w;
      ty = ly + (ay - ly) * w;
      tz = lz + (az - lz) * w;
      F.ox = tx - lx;
      F.oy = ty - ly;
      F.oz = tz - lz;
    } else {
      F.ox *= decay;
      F.oy *= decay;
      F.oz *= decay;
      tx = lx + F.ox;
      ty = ly + F.oy;
      tz = lz + F.oz;
    }
    // never under the ground: lift the ankle by what its sole would sink
    const low = soleLow(ty, world.r, L.foot * 4, d);
    if (low < 0) ty -= low;
    F.tx = tx;
    F.ty = ty;
    F.tz = tz;
    // (and where that is in the world: a fade that begins next step keeps the foot there even if the
    // owner turns object3d meanwhile, as the game's yaw does under a turn drawn against it)
    F.wx = place.x + (c * tx + s * tz) * sc;
    F.wz = place.z + (-s * tx + c * tz) * sc;
    // how far the hips must come down for this foot's leg to reach a planted target
    if (k > 0) {
      const h = L.thigh * 3, dx = tx - P[h], dz = tz - P[h + 2], R = (d.thigh + d.shin) * REACH;
      const xz = dx * dx + dz * dz;
      if (xz < R * R) need = Math.max(need, P[h + 1] - ty - Math.sqrt(R * R - xz));
    }
  }
  // the hips drop (eased back up; never more than HIP_DROP_MAX): a planted foot the clip's hips stand
  // too high for is reached by bending the knees, not by sliding the foot
  need = Math.min(HIP_DROP_MAX, Math.max(0, need));
  const rise = dt > 0 ? Math.exp(-dt / 0.12) : 1;
  feet.drop = Math.max(need, feet.drop * rise);
  if (feet.drop < 1e-5) feet.drop = 0;
  if (feet.drop > 0) {
    pose.hips[1] -= feet.drop;
    solveFK(pose, rest, world);
    changed = true;
  }
  for (let side = 0; side < 2; side++) {
    const S = side === 0 ? 'L' : 'R', F = feet[S], a = LEG[S].foot * 3, P = world.p;
    const moved = Math.hypot(F.tx - P[a], F.ty - P[a + 1], F.tz - P[a + 2]);
    if (moved > 1e-5) {
      legIK(pose, world, S, F.tx, F.ty, F.tz, true, d);
      changed = true;
      if (moved > feet.maxCorrect) feet.maxCorrect = moved;
    }
  }
  if (changed) solveFK(pose, rest, world);
  return changed;
}

/** The share of the leg's full length a planted leg may stretch to (the IK's own limit is 0.9995). */
const REACH = 0.998;
/** m: the most the pin lowers the hips to reach a planted foot. */
export const HIP_DROP_MAX = 0.12;

const _sum = new Float64Array(3);
function addAnchor(A, k, place, c, s, sc) {
  const dx = (A.x - place.x) / sc, dz = (A.z - place.z) / sc;
  _sum[0] += (c * dx - s * dz) * k;
  _sum[1] += (A.y / sc) * k;
  _sum[2] += (s * dx + c * dz) * k;
}

/** A slot's plant begins (weight up from 0): anchor it at that clip's own ankle (world). */
function land(slot, w, W, a, F, carry, place, c, s, sc) {
  if (w <= 0) {
    slot.pinned = false;
    return;
  }
  if (slot.pinned) return;
  slot.pinned = true;
  _own[0] = W.p[a] + (carry ? F.ox : 0);
  _own[1] = W.p[a + 1] + (carry ? F.oy : 0);
  _own[2] = W.p[a + 2] + (carry ? F.oz : 0);
  slot.x = place.x + (c * _own[0] + s * _own[2]) * sc;
  slot.z = place.z + (-s * _own[0] + c * _own[2]) * sc;
  slot.y = _own[1] * sc;
}