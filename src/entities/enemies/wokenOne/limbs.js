import { DIM } from '../../player/model.js';
import { TUNING } from './tuning.js';

// Xin Yi's limbs on the line (ADR-253, `?oneMoves=b`: the rebuild `a` and these passes on top; moves.js
// beatB). What the motion audit measured on `a` (woke.mjs AUDIT / PROBE / GUNS, the hero still in front of
// him):
//   - a straight punch landed 25 degrees off the line from its shoulder to the hero, the fist 0.17 m ACROSS
//     his centre line (the cross); the back-fist 63 degrees off, 0.6 m to the side and 0.6 m short of the
//     hero; the palm 22 degrees off and 0.33 m short;
//   - a kick reached straight for two or three frames and folded at once: in Sky Turns' first tornado the
//     leg was folding (118 degrees at the knee) on the frame the hit-stop froze; a spin kick's leg went from
//     straight to 91 degrees in two frames after contact;
//   - the elbow struck 0.73 m short of the hero, the spin back kick 0.45, the flying knee 0.44, the hook
//     0.37: the zone hit from where the limb never reached (its stand-off is the zone's, brain._ideal);
//   - the low sweep's foot was 94 degrees round from the hero and 1 m short at its impact (its leg came
//     round to him later), the knee at 106 - 134 degrees.
// The passes, on each beat's keys as moves.js builds them (before the held tell's re-timing, which keeps
// every key past the contact where it is):
//   onLine     a STRAIGHT blow's hand (jab, cross, palm, double, back-fist) put on the line from its shoulder
//              to a point on his centre line `aim.z` m ahead (the double palms `aim.half` either side),
//              `armReach` x the arm out along it; the keys after the contact move with it
//   holdKick   a kick's leg held long through the contact: a key `kickHold` of the follow-through after it
//              repeats the contact pose (the leg straight there, then it draws back), and the striking foot
//              of every key up to it is carried out to the contact's length
//   sweepOn    the sweep turned so its leg crosses the hero's line at the impact, the sweeping knee up and out
//   fitZone    a short blow's zone fitted to what is drawn (`fit`: its reach in metres): he steps in until
//              the limb meets the hero, and the hit reaches no further than the limb does
// Hooks, uppercuts, elbows and knees keep their bend (it is the blow); the guns' aim is gunAim.js's.

const L_ARM = DIM.upperArm + DIM.foreArm, L_LEG = DIM.thigh + DIM.shin, ANK = DIM.ankle;
const STRAIGHT = new Set(['jab', 'cross', 'palm', 'double', 'backfist']);
const KICKS = new Set(['front', 'side', 'round', 'axe', 'flying', 'spinBack', 'tornado', 'butterfly', 'flash', 'aerial', 'bicycle', 'dropHeel']);

/** A point of pose p round his waist pivot (strikes.js toModel's turn: roll, pitch, then the turn `ya`). */
function bodyPoint(p, x0, y0, ya) {
  const pi = p.pitch ?? 0, ro = p.roll ?? 0;
  const x = x0 * Math.cos(ro) - y0 * Math.sin(ro), y = x0 * Math.sin(ro) + y0 * Math.cos(ro), z = 0;
  const y1 = y * Math.cos(pi) - z * Math.sin(pi), z1 = y * Math.sin(pi) + z * Math.cos(pi);
  return [x * Math.cos(ya) + z1 * Math.sin(ya) + (p.bX ?? 0), y1 + DIM.pivot + (p.bY ?? 0), -x * Math.sin(ya) + z1 * Math.cos(ya) + (p.bZ ?? 0)];
}
/** The hip joint (s +1 his left) and the shoulder (the chest's turn: the hips' yaw and the spine's). */
const hipOf = (p, s) => bodyPoint(p, s * DIM.hip[0], DIM.pelvis[1] + DIM.hip[1], p.yaw ?? 0);
const shoulderOf = (p, s) => bodyPoint(p, s * DIM.shoulder[0], DIM.spine[1] + DIM.chest[1] + DIM.shoulder[1], (p.yaw ?? 0) + (p.spY ?? 0));
/** A hand offset `o` (the chest's frame) re-aimed through the shoulder at the point (tx, tz) of his own
 *  frame, `len` m long, its height kept. */
function aimHand(p, s, o, tx, tz, len) {
  const S = shoulderOf(p, s), th = (p.yaw ?? 0) + (p.spY ?? 0), c = Math.cos(th), n = Math.sin(th);
  let dx = tx - S[0], dz = tz - S[2];
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const h = Math.hypot(o[0], o[2]), y = o[1], k = len / (Math.hypot(h, y) || 1);
  const xr = dx * h * k, zr = dz * h * k;
  // (his frame to the chest's: the inverse of x' = x cos + z sin, z' = -x sin + z cos)
  return [xr * c - zr * n, y * k, xr * n + zr * c];
}
/** Foot `f` of pose p carried out to `want` m from its hip along the same line (along the floor where the
 *  line would go under it). A foot near the hip (a tuck) is left. */
function longFoot(p, f, want) {
  const v = p[f];
  if (!Array.isArray(v) || v.length !== 3) return v;
  const h = hipOf(p, f === 'lF' ? 1 : -1), d = [v[0] - h[0], v[1] - h[1], v[2] - h[2]], l = Math.hypot(...d);
  if (!(l > 0.45 * L_LEG) || l >= want) return v;
  const k = want / l;
  let y = h[1] + d[1] * k, hz = k;
  if (y < ANK) {
    y = ANK;
    const dy = y - h[1], hd = Math.hypot(d[0], d[2]);
    hz = hd > 1e-3 ? Math.sqrt(Math.max(0, want * want - dy * dy)) / hd : k;
  }
  return [h[0] + d[0] * hz, y, h[2] + d[2] * hz];
}
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const rotXZ = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
const isHit = (u) => Math.abs(u - 1) < 1e-6;

/** The striking hand(s) of a straight blow on the line (see the header). */
function onLine(b) {
  if (!STRAIGHT.has(b.blow) || !Array.isArray(b.keys)) return b;
  const M = TUNING.motion, hit = b.keys.find(([u]) => isHit(u))?.[1];
  if (!hit) return b;
  const dbl = b.blow === 'double';
  // (a one-handed palm is the part 'palms' of Tian Lei's builder, drawn on the RIGHT hand: mirrored, the
  // left hand struck while the glint, the trail and the parry's contact stayed on the right, hanging at the
  // hip (41 degrees at the elbow): its part is the left fist here)
  const left = b.part === 'fistL' || (b.part === 'palms' && !dbl && !!b.mo?.left);
  const part = left ? 'fistL' : b.part;
  const sides = dbl ? [['rH', -1], ['lH', 1]] : left ? [['lH', 1]] : [['rH', -1]];
  const out = b.keys.map(([u, p]) => [u, p]);
  for (const [h, s] of sides) {
    const o = hit[h];
    if (!Array.isArray(o)) continue;
    // (the point-blank shot, a cross with a gun in the fist: the arm aimed at a point `aim.shot` m out, where
    // the hero stands for it; down the punch's line it crossed to the centre and the shot left 39 degrees
    // off the arm)
    const d = sub(aimHand(hit, s, o, dbl ? s * M.aim.half : 0, b.iron === 'point' ? M.aim.shot : M.aim.z, M.armReach * L_ARM), o);
    for (const k of out) if (k[0] >= 1 - 1e-6 && Array.isArray(k[1][h])) k[1] = { ...k[1], [h]: add(k[1][h], d) };
  }
  return { ...b, part, keys: out };
}

/** A kick's leg held long through the contact (see the header). */
function holdKick(b) {
  if (!KICKS.has(b.blow) || !Array.isArray(b.keys)) return b;
  const f = b.part === 'footL' ? 'lF' : b.part === 'footR' ? 'rF' : null;
  const i = b.keys.findIndex(([u]) => isHit(u));
  if (!f || i < 0) return b;
  const M = TUNING.motion, hit = b.keys[i][1], v = hit[f];
  if (!Array.isArray(v) || v.length !== 3) return b;
  const h = hipOf(hit, f === 'lF' ? 1 : -1), want = Math.hypot(v[0] - h[0], v[1] - h[1], v[2] - h[2]);
  if (!(want > 0.8 * L_LEG)) return b;
  const at = 1 + M.kickHold;
  const out = b.keys.filter(([u]) => !(u > 1 + 1e-6 && u < at - 1e-6)).map(([u, p]) => [u, p]);
  // the hold: the contact pose again (its own ease dropped: it is a pose he passes through, still)
  const { e, ...still } = hit;
  out.push([at, still]);
  out.sort((x, y) => x[0] - y[0]);
  return { ...b, keys: out.map(([u, p]) => [u, u >= 1 - 1e-6 && u <= at + 1e-6 && Array.isArray(p[f]) ? { ...p, [f]: longFoot(p, f, want) } : p]) };
}

/** The sweep turned so its leg crosses the hero's line at the impact, the knee up and out. */
function sweepOn(b) {
  if (b.blow !== 'sweep' || !Array.isArray(b.keys)) return b;
  const f = b.part === 'footL' ? 'lF' : 'rF', g = f === 'rF' ? 'lF' : 'rF', kn = f === 'rF' ? 'rK' : 'lK', s = f === 'rF' ? -1 : 1;
  const hit = b.keys.find(([u]) => isHit(u))?.[1], v = hit?.[f];
  if (!Array.isArray(v)) return b;
  const z = v.length === 3 ? v[2] : v[1];
  // (the turn that puts the contact foot straight ahead: x cos a + z sin a = 0, ahead of him)
  let a = Math.atan2(-v[0], z);
  if (-v[0] * Math.sin(a) + z * Math.cos(a) < 0) a += Math.PI;
  const M = TUNING.motion;
  const turn = (p, a) => {
    const o = { ...p, yaw: (p.yaw ?? 0) + a };
    for (const k of ['rF', 'lF']) {
      const w = p[k];
      if (!Array.isArray(w)) continue;
      const wz = w.length === 3 ? w[2] : w[1], q = rotXZ(w[0], wz, a);
      o[k] = w.length === 3 ? [q[0], w[1], q[1]] : [q[0], q[1]];
    }
    if (Number.isFinite(p.rFy)) o.rFy = p.rFy + a;
    if (Number.isFinite(p.lFy)) o.lFy = p.lFy + a;
    return o;
  };
  // (the whole turn from the contact on, keyed every `sweepStep` rad: its feet keys were a third of a turn
  // apart, and a foot interpolated straight across the circle between them came in to half its reach, the
  // knee folding to 85 - 113 degrees through the turn)
  const cock = b.cock ?? 0.62, k2 = b.keys.find(([u]) => Math.abs(u - 2) < 1e-6)?.[1];
  const spin = k2 ? (k2.yaw ?? 0) - (hit.yaw ?? 0) : 0, n = Math.max(1, Math.ceil(Math.abs(spin) / M.sweepStep));
  const src = b.keys.filter(([u]) => !(u > 1 + 1e-6 && u <= 2 + 1e-6));
  for (let i = 1; i <= n; i++) src.push([1 + i / n, { ...turn(hit, (spin * i) / n), e: 'l' }]);
  src.sort((x, y) => x[0] - y[0]);
  const keys = src.map(([u, p]) => {
    let q = turn(p, a);
    // (the planted foot near his pivot: he turns ON it, it does not go round a metre of floor with him)
    const w = q[g];
    if (u >= cock - 1e-6 && Array.isArray(w)) {
      const wz = w.length === 3 ? w[2] : w[1], r = Math.hypot(w[0], wz) || 1, k = Math.min(1, M.sweepPivot / r);
      q = { ...q, [g]: w.length === 3 ? [w[0] * k, w[1], wz * k] : [w[0] * k, wz * k] };
    }
    if (u >= cock * 0.5 - 1e-6) q = { ...q, [kn]: [s * M.sweepKnee[0], M.sweepKnee[1], M.sweepKnee[2]] };
    // (out of the tuck the leg shoots out long before it reaches the hero: keyed at 0.8 of its length there,
    // it was still opening at the contact, 111 degrees)
    if (u > cock + 1e-6 && u < 1 - 1e-6 && Array.isArray(q[f])) q = { ...q, [f]: longFoot(q, f, TUNING.legReach * L_LEG) };
    // (... and skims `sweepLift` m off the floor from the tuck on: a foot keyed within 3.5 cm of the floor is
    // the feet planner's (anim.js _feetClip), held where it stood until its key is 14 cm away, so the leg
    // reached the hero at 0.8 of its length, folded to 111 degrees, and caught up a tenth of a second late)
    const w2 = q[f];
    if (u > cock + 1e-6 && u <= 2 + 1e-6 && Array.isArray(w2) && w2.length === 3) q = { ...q, [f]: [w2[0], Math.max(w2[1], ANK + M.sweepLift), w2[2]] };
    return [u, q];
  });
  return { ...b, keys };
}

/** A short blow's zone fitted to what is drawn: its reach `fit[blow]` m from his root (see the header). */
function fitZone(b) {
  const M = TUNING.motion, r = M.fit[b.blow ?? b.part];
  // (a gun's blow, the point-blank shot, keeps its own reach: it is a shot)
  if (!Number.isFinite(r) || b.iron || !b.zone || (b.zone.kind !== 'line' && b.zone.kind !== 'sector')) return b;
  // (brain._ideal: he closes to 0.72 r of a line, 0.66 r of a sector: there the limb meets the hero's
  // body circle; the dash of a flying knee stops where its knee lands)
  const pr = M.heroR, want = r + pr - M.fitIn;
  const zr = want / (b.zone.kind === 'line' ? 0.72 : 0.66);
  const o = { ...b, zone: { ...b.zone, r: +zr.toFixed(2) } };
  if (b.dash) o.dash = { ...b.dash, stop: Math.min(b.dash.stop, +(r + pr - M.fitIn).toFixed(2)) };
  return o;
}

/** Iron Rain's aim (`iron: 'rain'`; Iron in the Air's leap keeps its own) reached by `aimBy` of its windup and held to
 *  the impact: its first slugs leave a flight early, while the arms were still coming up (the barrel 46 - 55
 *  degrees off, the elbow at 79 - 119). */
function aimEarly(b) {
  if (b.iron !== 'rain' || b.bursts || !Array.isArray(b.keys)) return b;
  const by = TUNING.motion.aimBy, hit = b.keys.find(([u]) => isHit(u))?.[1];
  if (!hit) return b;
  const { e, ...aim } = hit;
  const keys = b.keys.filter(([u]) => !(u > by - 1e-6 && u < 1 - 1e-6) && !(u < by && u > by * 0.75));
  keys.push([by, { ...aim, e: 'o' }]);
  keys.sort((x, y) => x[0] - y[0]);
  return { ...b, keys, cock: Math.min(b.cock ?? 0.7, by) };
}

/** A beat as `?oneMoves=b` plays it on top of `a`'s (moves.js beatB): `sweepOn` before `a`'s long legs
 *  (they carry the sweep's foot out along the floor through its turn), the rest after them. */
export { sweepOn };
export function limbsB(b) {
  return aimEarly(fitZone(holdKick(onLine(b))));
}

/** The passes' sets (tests: woke LINE). */
export const LIMBS = Object.freeze({ STRAIGHT, KICKS, L_ARM, L_LEG, hipOf, shoulderOf });
