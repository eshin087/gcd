// Quaternion and vector helpers for the hero2 engine, on flat arrays with offsets (x y z w), the same
// conventions as skeleton.js (world = parent * local). Pure, no allocations, never throws.

/** o[oi..] = a * b */
export function qmul(o, oi, a, ai, b, bi) {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3];
  const bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by;
  o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** o[oi..] = conj(a) * b  (a unit: the rotation that takes a's frame to b's) */
export function qconjmul(o, oi, a, ai, b, bi) {
  const ax = -a[ai], ay = -a[ai + 1], az = -a[ai + 2], aw = a[ai + 3];
  const bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by;
  o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

export function qnorm(o, oi) {
  const x = o[oi], y = o[oi + 1], z = o[oi + 2], w = o[oi + 3];
  const l = Math.sqrt(x * x + y * y + z * z + w * w);
  if (!(l > 1e-9)) {
    o[oi] = o[oi + 1] = o[oi + 2] = 0;
    o[oi + 3] = 1;
    return;
  }
  const k = 1 / l;
  o[oi] = x * k;
  o[oi + 1] = y * k;
  o[oi + 2] = z * k;
  o[oi + 3] = w * k;
}

export function qcopy(o, oi, a, ai) {
  o[oi] = a[ai];
  o[oi + 1] = a[ai + 1];
  o[oi + 2] = a[ai + 2];
  o[oi + 3] = a[ai + 3];
}

/** Slerp the short way from a to b by t into o (o may alias a or b). */
export function qslerp(o, oi, a, ai, b, bi, t) {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3];
  let bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  let d = ax * bx + ay * by + az * bz + aw * bw;
  if (d < 0) {
    d = -d;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let ka, kb;
  if (d > 0.9995) {
    ka = 1 - t;
    kb = t;
  } else {
    const th = Math.acos(Math.min(1, d)), s = Math.sin(th);
    ka = Math.sin((1 - t) * th) / s;
    kb = Math.sin(t * th) / s;
  }
  o[oi] = ax * ka + bx * kb;
  o[oi + 1] = ay * ka + by * kb;
  o[oi + 2] = az * ka + bz * kb;
  o[oi + 3] = aw * ka + bw * kb;
  qnorm(o, oi);
}

/** The angle (rad) between two unit quaternions, the short way. */
export function qangle(a, ai, b, bi) {
  const d = Math.abs(a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2] + a[ai + 3] * b[bi + 3]);
  return 2 * Math.acos(Math.min(1, d));
}

/** v (3 floats at vo) = q * (x, y, z) */
export function qrot(v, vo, q, qi, x, y, z) {
  const px = q[qi], py = q[qi + 1], pz = q[qi + 2], pw = q[qi + 3];
  const tx = 2 * (py * z - pz * y), ty = 2 * (pz * x - px * z), tz = 2 * (px * y - py * x);
  v[vo] = x + pw * tx + (py * tz - pz * ty);
  v[vo + 1] = y + pw * ty + (pz * tx - px * tz);
  v[vo + 2] = z + pw * tz + (px * ty - py * tx);
}

/** o = the shortest rotation taking unit vector u to unit vector v. */
export function qfromTo(o, oi, ux, uy, uz, vx, vy, vz) {
  const d = ux * vx + uy * vy + uz * vz;
  if (d < -0.999999) {
    // opposite: any axis perpendicular to u
    let ax = 0, ay = -uz, az = uy;
    if (ay * ay + az * az < 1e-6) {
      ax = uz;
      ay = 0;
      az = -ux;
    }
    const l = Math.hypot(ax, ay, az) || 1;
    o[oi] = ax / l;
    o[oi + 1] = ay / l;
    o[oi + 2] = az / l;
    o[oi + 3] = 0;
    return;
  }
  o[oi] = uy * vz - uz * vy;
  o[oi + 1] = uz * vx - ux * vz;
  o[oi + 2] = ux * vy - uy * vx;
  o[oi + 3] = 1 + d;
  qnorm(o, oi);
}

/** o = rotation of `ang` rad about the unit axis (x, y, z) */
export function qaxis(o, oi, x, y, z, ang) {
  const h = ang * 0.5, s = Math.sin(h);
  o[oi] = x * s;
  o[oi + 1] = y * s;
  o[oi + 2] = z * s;
  o[oi + 3] = Math.cos(h);
}

export const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
