// A chained heavy carries the previous cut into its coil. The shared clips also
// contain a low gather for an attack from rest; replaying that waypoint after a
// high light finish makes the arm drop, reverse and rise in a few frames.
import { P, dirLerp } from '../../entities/player/anim.js';
import { SWINGS } from '../../entities/player/swings.js';
import { clamp, smoothstep } from '../../core/math.js';

const rad = Math.PI / 180;
// Keep the source vertical weight transfer and hop coupled to its feet.
const channels = [[P.bodyX, 'bx'], [P.bodyZ, 'bz'],
  [P.pelvY, 'hip'], [P.spX, 'sx'], [P.spY, 'sy'], [P.spZ, 'sz']];
const hermite = (a, b, va, vb, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * va
    + (-2 * u3 + 3 * u2) * b + (u3 - u2) * vb;
};
const coils = new Map();
for (const name of ['heavyRise', 'heavySpin', 'heavyCrush', 'slam']) {
  const keys = SWINGS[name].keys, coil = keys.find(k => k.u === 1);
  const next = keys.find(k => k.u > 1 && k.h);
  coils.set(name, { coil, next });
}

export function createHeavyTransition() {
  const temp = new Float32Array(3), way = { ok: false, d: 0 };
  return (p, A) => {
    const E = A.temperedEntry, d = A.def, t = A.t;
    if (!E?.chainedHeavy || !d || t >= d.windup - 1 / 120) return;
    const clip = (A.atkDef === d ? A.atkAnim : d.anim)?.clip, data = coils.get(clip);
    if (!data) return;
    const { coil: C, next } = data, F = A.from, W = d.windup;
    const u = clamp(t / W, 0, 1);
    // Return to the source coil before active frames. Its hips lead the cut and
    // the active blade path / contact timing retain their original choreography.
    const weight = 1 - smoothstep(W * 0.65, W - 1 / 120, t);
    const arc = Math.sin(Math.PI * u) ** 2;
    for (const [i, field] of channels) {
      if (C[field] == null) continue;
      const target = C[field] * (field === 'bx' && A.stepL === false ? -1 : 1);
      const v = clamp(E.velocity[i], i <= P.bodyZ ? -1.5 : -6, i <= P.bodyZ ? 1.5 : 6);
      const guide = hermite(F[i], target, v * W, 0, u);
      p[i] += (guide - p[i]) * weight;
    }
    for (let c = 0; c < 3; c++) {
      const i = P.rH + c;
      const tangent = next ? (next.h[c] - C.h[c]) / ((next.u - 1) * d.active) : 0;
      const guide = hermite(F[i], C.h[c], clamp(E.velocity[i], -6, 6) * W,
        clamp(tangent * 0.2, -1.3, 1.3) * W, u) + (c === 2 ? 0.12 * arc : 0);
      p[i] += (guide - p[i]) * weight;
    }
    // Choose a safe route to the FINAL coil, not the source clip's low interim
    // waypoint. A raised bridge keeps a cross-shoulder backswing above the arm.
    const a0 = E.bladeAngles[0], e0 = E.bladeAngles[1], a1 = C.a[0] * rad, e1 = C.a[1] * rad;
    way.ok = false;
    dirLerp(temp, 0, Math.sin(a0) * Math.cos(e0), Math.sin(e0), Math.cos(a0) * Math.cos(e0),
      Math.sin(a1) * Math.cos(e1), Math.sin(e1), Math.cos(a1) * Math.cos(e1), 0.5, way);
    // A late press can arrive while the light is already returning quickly.
    // Carry that velocity into a decelerating arc instead of braking on entry.
    const az = hermite(a0, a0 + way.d, clamp(E.bladeVelocity[0], -24, 24) * W, 0, u);
    const el = hermite(e0, e1, clamp(E.bladeVelocity[1], -12, 12) * W, 0, u)
      + (C.h[1] > 0 ? 0.3 * arc : 0);
    const gx = Math.sin(az) * Math.cos(el), gy = Math.sin(el), gz = Math.cos(az) * Math.cos(el);
    p[P.swD] += (gx - p[P.swD]) * weight;
    p[P.swD + 1] += (gy - p[P.swD + 1]) * weight;
    p[P.swD + 2] += (gz - p[P.swD + 2]) * weight;
    const len = Math.hypot(p[P.swD], p[P.swD + 1], p[P.swD + 2]) || 1;
    for (let c = 0; c < 3; c++) p[P.swD + c] /= len;
    // The elbow follows the continuous hand path rather than an already-passed
    // low waypoint. The original pole is fully restored at the coil.
    const up = smoothstep(-0.1, 0.18, p[P.rH + 1]);
    const across = smoothstep(0.05, 0.32, p[P.rH]);
    const px = -(0.72 + 0.23 * up) * (1 - across) - 0.3 * across;
    const py = (-0.68 + 0.63 * up) * (1 - across * (1 - 0.6 * up)) - 0.95 * across * (1 - 0.6 * up);
    const pz = -0.2 - 0.45 * (1 - smoothstep(-0.1, 0.12, p[P.rH + 2]));
    const settle = smoothstep(0, W * 0.45, t);
    for (let c = 0; c < 3; c++) {
      const i = P.rP + c, target = c === 0 ? px : c === 1 ? py : pz;
      const guide = F[i] + (target - F[i]) * settle;
      p[i] += (guide - p[i]) * weight;
    }
  };
}
