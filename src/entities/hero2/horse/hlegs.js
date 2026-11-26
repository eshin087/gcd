// The horse's legs, solved in their own plane. Shared by the clip generator (offline) and the hoof pin
// (hengine.js). Pure, no allocations per call, never throws.
//
// A leg hangs from its parent joint (the withers for a fore leg, the pelvis for a hind one) and swings in
// the parent's Y-Z plane: every leg joint turns about the parent's X axis only. An angle here is a bone's
// FORWARD ANGLE in the parent's frame: 0 = straight down, positive = its lower end toward +Z (forward).
// A local rotation about X by r turns a down-pointing bone's forward angle by -r.
//
//   fore: shoulder -> elbow (humerus, a1) -> knee (forearm, a2) -> fetlock (cannon, a3) -> ground (pastern, a4)
//         the elbow folds BACK (it sits behind the shoulder -> fetlock line); the knee (carpus) folds the
//         cannon back by `flex` (0 = straight, as on the ground)
//   hind: hip -> stifle (femur, a1) -> hock (tibia, a2) -> fetlock (cannon, a3) -> ground (pastern, a4)
//         the stifle folds FORWARD; the cannon's angle `flex` is given (the hock follows from it)
// The pastern's angle a4 is given (on the ground about +35 degrees: the hoof ahead of the fetlock).
import { LEG, LEGS } from './hskeleton.js';
import { qrot } from '../qmath.js';

/** a bone of forward angle a: its direction (z, y) */
const dz = (a) => Math.sin(a);
const dy = (a) => -Math.cos(a);

/** The forward angle of the direction (z, y). */
export const fwdAngle = (z, y) => Math.atan2(z, -y);

/**
 * Planar two-bone reach from (rz, ry) to (tz, ty), bone lengths a then b, the middle joint bent toward
 * +Z (s = +1) or -Z (s = -1). out[o] = the first bone's angle, out[o + 1] the second's; returns the miss
 * (m) when the target is out of reach.
 */
export function twoBone(rz, ry, tz, ty, a, b, s, out, o = 0) {
  const vz = tz - rz, vy = ty - ry;
  let d = Math.hypot(vz, vy);
  const th = fwdAngle(vz, vy);
  const lo = Math.abs(a - b) + 1e-4, hi = (a + b) * 0.9995;
  let miss = 0;
  if (d > hi) {
    miss = d - hi;
    d = hi;
  } else if (d < lo) d = lo;
  const c = (a * a + d * d - b * b) / (2 * a * d);
  const phi = Math.acos(c < -1 ? -1 : c > 1 ? 1 : c);
  const a1 = th + s * phi;
  const mz = rz + a * dz(a1), my = ry + a * dy(a1);
  const ez = rz + d * dz(th), ey = ry + d * dy(th);
  out[o] = a1;
  out[o + 1] = fwdAngle(ez - mz, ey - my);
  return miss;
}

const _t = new Float64Array(2);

/**
 * Solve leg `leg` (an entry of LEGS) in its parent's frame: its top joint at (sx, sy, sz), the hoof's
 * ground point at (hx, hy, hz), the pastern at angle `ap`, `flex` (fore: the knee's fold >= 0; hind: the
 * cannon's angle). The leg's plane tilts about Z to reach a hoof off to the side (a turn, the trunk's
 * roll): out[o + 4] = that tilt. out[o .. o + 3] = a1 .. a4 in the tilted plane. Returns the miss (m).
 */
export function solveLeg(leg, sx, sy, sz, hx, hy, hz, ap, flex, out, o = 0) {
  const L = leg.len;
  const ex = hx - sx, ey = hy - sy;
  let ab = Math.atan2(ex, -ey);
  if (ab > MAX_TILT) ab = MAX_TILT;
  else if (ab < -MAX_TILT) ab = -MAX_TILT;
  // the target in the tilted plane (the top joint keeps its place; down the plane is its -Y)
  const hyp = sy - (ex * Math.sin(ab) - ey * Math.cos(ab));
  // the fetlock, from the hoof back up the pastern
  const fz = hz - L[3] * dz(ap), fy = hyp - L[3] * dy(ap);
  let miss;
  if (leg.fore) {
    // elbow -> fetlock as one link: the forearm straight down its own axis, the cannon folded back by flex
    const k = flex > 0 ? flex : 0;
    const vz = -L[2] * Math.sin(k), vy = -L[1] - L[2] * Math.cos(k);
    const le = Math.hypot(vz, vy), del = fwdAngle(vz, vy);
    miss = twoBone(sz, sy, fz, fy, L[0], le, -1, _t);
    out[o] = _t[0];
    out[o + 1] = _t[1] - del;
    out[o + 2] = out[o + 1] - k;
  } else {
    // the hock, from the fetlock back up the cannon
    const kz = fz - L[2] * dz(flex), ky = fy - L[2] * dy(flex);
    miss = twoBone(sz, sy, kz, ky, L[0], L[1], 1, _t);
    out[o] = _t[0];
    out[o + 1] = _t[1];
    out[o + 2] = flex;
  }
  out[o + 3] = ap;
  out[o + 4] = ab;
  return miss;
}

/** rad: the most a leg's plane tilts sideways */
export const MAX_TILT = 0.6;

/** A local rotation of r rad about X into q at qi. */
export function qx(q, qi, r) {
  q[qi] = Math.sin(r * 0.5);
  q[qi + 1] = 0;
  q[qi + 2] = 0;
  q[qi + 3] = Math.cos(r * 0.5);
}

/** The angle of a (nearly pure) X rotation. */
export const xAngle = (q, qi) => 2 * Math.atan2(q[qi], q[qi + 3]);

/**
 * Write leg `leg`'s five local rotations: bone angles a[o .. o + 3] and the plane's tilt a[o + 4] (forward angles in the parent's
 * frame) and the hoof capsule's angle `ah` (its own forward angle in the parent's frame: on the ground,
 * minus the parent's pitch keeps the sole flat).
 */
export function writeLeg(q, leg, a, o, ah) {
  const j = leg.j;
  // the top joint: qz(tilt) * qx(-a1)
  const h = -a[o] * 0.5, b = (a[o + 4] || 0) * 0.5, sa = Math.sin(h), ca = Math.cos(h), sb = Math.sin(b), cb = Math.cos(b);
  const t = j[0] * 4;
  q[t] = cb * sa;
  q[t + 1] = sb * sa;
  q[t + 2] = sb * ca;
  q[t + 3] = cb * ca;
  qx(q, j[1] * 4, -(a[o + 1] - a[o]));
  qx(q, j[2] * 4, -(a[o + 2] - a[o + 1]));
  qx(q, j[3] * 4, -(a[o + 3] - a[o + 2]));
  qx(q, j[4] * 4, -(ah - a[o + 3]));
}

/** Read leg `leg`'s bone angles back from a pose (a[o .. o + 4], the tilt last) and return the capsule's angle. */
export function readLeg(q, leg, a, o) {
  const j = leg.j;
  a[o] = -xAngle(q, j[0] * 4);
  a[o + 4] = 2 * Math.atan2(q[j[0] * 4 + 2], q[j[0] * 4 + 3]);
  a[o + 1] = a[o] - xAngle(q, j[1] * 4);
  a[o + 2] = a[o + 1] - xAngle(q, j[2] * 4);
  a[o + 3] = a[o + 2] - xAngle(q, j[3] * 4);
  return a[o + 3] - xAngle(q, j[4] * 4);
}

const _v = new Float64Array(3);

/**
 * A world point (the FK frame) in leg `leg`'s plane: out[0] = z, out[1] = y in its parent's frame,
 * out[2] = x (off the plane). W: hSolveFK's output.
 */
export function toLegPlane(W, leg, x, y, z, out) {
  const p = leg.parent;
  _v[0] = x - W.p[p * 3];
  _v[1] = y - W.p[p * 3 + 1];
  _v[2] = z - W.p[p * 3 + 2];
  // conj(R) * v
  const r = W.r, i = p * 4;
  _q[0] = -r[i];
  _q[1] = -r[i + 1];
  _q[2] = -r[i + 2];
  _q[3] = r[i + 3];
  qrot(out, 0, _q, 0, _v[0], _v[1], _v[2]);
  const lx = out[0];
  out[0] = out[2];
  out[2] = lx;
  return out;
}
const _q = new Float64Array(4);

export { LEG, LEGS };
