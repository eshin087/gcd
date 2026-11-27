import * as THREE from 'three';
import { DIM } from '../../player/model.js';
import { X as ASC } from '../ascendant/moves.js';
import { TUNING } from './tuning.js';

// THE FLIER'S LIMBS (ADR-254, `?halMotion=b`: ADR-225's `a` and this on top; the boss motion audit,
// 2026-11-27). The owner: "weird looking arm angles ... kicks aren't straight during the attack and still
// bended". What the audit measured on `a` (city.mjs AUDIT, GCD_AUDIT_IMPACT=1):
//   - his straight blows landed 31 - 56° off the line from his shoulder to the hero's chest (the cross, the
//     back-fist, the palm: the builders' sideways lines, made for a fighter on the floor, not one hovering
//     over the hero);
//   - his legs sat folded under him in every blow, the right knee at 67 - 99°, the left at 99 - 135°:
//     a man kneeling on air, not a flier (ADR-225's LEGS_COIL / LEGS_HIT: the knee drawn up);
//   - the round kick landed with the knee at 105° and 0.69 of the leg's reach, the side kick at 130°;
//   - the pass (Fly-By, Through the Tower) flew pitched only 54°, the knees at 54°, its fist 2.56 m up:
//     over the hero's head while "through him at chest height".
// Under `b` (moves.js realise → motion.js halKeys → here; nothing of a beat's gameplay moves):
//   - a STRAIGHT blow (jab, cross, palm, both palms, the back-fist): at the contact key the striking hand
//     is put REACH x the arm's length from its shoulder, on the line to the hero's chest (AIM, his own
//     frame at the dip): the punch extends from the shoulder along one line; the keys after it move with
//     it (the follow-through keeps its draw-back);
//   - a KICK (round, side, front): the striking foot LEG x the leg's length from its hip along its own
//     line; the animator's kickStretch / legSoft (halcyon.js) land the leg straight;
//   - the bent blows (hook, uppercut) keep their bend, the hand BENT x the arm out on its own line;
//   - THE FLIER'S LEGS: long, the knees soft (never folded), the feet behind the hips along a line a
//     little steeper than the body's, the toes pointed; gathered a little through the windup, trailing
//     through the strike; one leg a little more bent than the other (no twinning). The hover (poses.js)
//     hangs them the same way;
//   - THE PASS: a level flier's line (FLY): the body near horizontal, the lead fist straight out along
//     the line, the other arm along his side, the legs long behind; his root lower through it
//     (`passY`), so the fist meets the hero's chest.

const { F } = ASC;
const ANK = DIM.ankle;
const ARM = DIM.upperArm + DIM.foreArm, LEG = DIM.thigh + DIM.shin;
/** The pass's numbers (TUNING.motion.b). */
export const LIMBS = TUNING.motion.b;

const STRAIGHT = new Set(['jab', 'cross', 'palm', 'double', 'backfist']);
const KICKS = new Set(['front', 'round', 'side']);
// (build time only: scratch; the body joint turns YXZ as the rig's joints, model.js joint)
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const bodyQ = (p) => _q.setFromEuler(_e.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0, 'YXZ'));
const pivot = (p) => new THREE.Vector3(p.bX ?? 0, DIM.pivot + (p.bY ?? 0), p.bZ ?? 0);

/** The hip (side -1 his right, +1 his left) of pose p, model space (the pelvis's own turn left out: small). */
export function hipOf(p, side) {
  return _v.set(side * DIM.hip[0], DIM.pelvis[1] + DIM.hip[1], 0).applyQuaternion(bodyQ(p)).add(pivot(p)).clone();
}
const _m = new THREE.Matrix4(), _n = new THREE.Matrix4();
/** The shoulder of pose p, model space, down the rig's chain: body → pelvis (its turn) → spine (its
 *  turn) → chest → the shoulder joint. */
function shoulderOf(p, side) {
  const M = _m.compose(pivot(p), bodyQ(p).clone(), _w.set(1, 1, 1));
  M.multiply(_n.makeRotationFromEuler(_e.set(p.hipX ?? 0, p.hip ?? 0, p.hipZ ?? 0, 'YXZ')).setPosition(...DIM.pelvis));
  M.multiply(_n.makeRotationFromEuler(_e.set(p.spX ?? 0, p.spY ?? 0, p.spZ ?? 0, 'YXZ')).setPosition(...DIM.spine));
  M.multiply(_n.makeTranslation(...DIM.chest));
  return new THREE.Vector3(side * DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]).applyMatrix4(M);
}

/** A hand offset (body axes, from its shoulder) on the line from the shoulder to `aim` (model space),
 *  `len` long: the punch along one line. */
function aimHand(p, side, aim, len) {
  const S = shoulderOf(p, side);
  const d = new THREE.Vector3().subVectors(aim, S).normalize().applyQuaternion(bodyQ(p).clone().invert());
  return [d.x * len, d.y * len, d.z * len];
}
/** A foot carried out to `k` x the leg from its hip along the key's own line (not under the ankle). */
function longFoot(p, f, k) {
  const v = p[f];
  if (!Array.isArray(v) || v.length !== 3) return v;
  const h = hipOf(p, f === 'lF' ? 1 : -1), d = [v[0] - h.x, v[1] - h.y, v[2] - h.z], l = Math.hypot(...d), want = k * LEG;
  if (!(l > 0.4 * LEG)) return v;
  const s = want / l;
  return [h.x + d[0] * s, Math.max(ANK, h.y + d[1] * s), h.z + d[2] * s];
}

/**
 * The flier's legs on pose p: each foot `k` x the leg from its hip, `trail` rad back from straight down
 * (+ behind him), a little out to its side; the knees pointing forward and down, the toes pointed.
 * `[kR, kL]`, `[tR, tL]`: the right and the left (one bent a little more, a little further forward).
 */
export function flierLegs(p, [kR, kL], [tR, tL], only = null) {
  const o = { ...p };
  for (const [f, kn, side, k, t] of [['rF', 'rK', -1, kR, tR], ['lF', 'lK', 1, kL, tL]]) {
    if (only && f[0] !== only.toLowerCase()) continue;
    // (the animator holds a foot over his root's floor (anim.js FOOT_FLOOR): a hip sunk low takes its
    // leg further back, never shorter)
    const h = hipOf(p, side), d = k * LEG, tt = Math.max(t, Math.acos(Math.min(1, Math.max(-1, (h.y - ANK - 0.04) / d))));
    o[f] = [h.x + side * 0.03, Math.max(ANK + 0.02, h.y - Math.cos(tt) * d), h.z - Math.sin(tt) * d];
    o[kn] = [side * 0.1, -0.35, 1];
  }
  if (only) return o;
  o.flat = 0.05;
  o.rFy = -0.08;
  o.lFy = 0.08;
  return o;
}

/** The legs of a key of a builder's blow: gathered through the windup, trailing through the strike
 *  (`only` 'R' / 'L': that leg alone, a kick's hanging one). */
export function legsFor(p, strike, only = null) {
  const L = LIMBS.legs, s = strike ? L.hit : L.coil;
  // (the trail follows the body's lean: a pitched body takes its legs back with it)
  const lean = p.pitch ?? 0;
  return flierLegs(p, s.k, [s.trail[0] + lean, s.trail[1] + lean], only);
}

/** The point a straight blow drives at (his model space, at the dip): the hero's chest before him. */
const AIM = new THREE.Vector3(0, LIMBS.aim.y, LIMBS.aim.z);

/**
 * A builder's beat's keys (motion.js `a`'s, the flier's legs on already) with the limbs of `b`: the
 * straight blows on the line, the kicks long, the bent blows their bend. `beat.part` is the striking limb
 * (mirrored already for a left blow).
 */
export function limbKeys(beat, keys) {
  const mo = beat.mo ?? {}, kind = mo.kind, part = beat.part ?? 'fistR';
  const hitAt = keys.findIndex(([u]) => Math.abs(u - 1) < 1e-6);
  if (hitAt < 0) return keys;
  const out = keys.map(([u, p]) => [u, p]);
  const hit = out[hitAt][1];
  if (mo.fam === 'punch' && STRAIGHT.has(kind)) {
    const sides = part === 'palms' && kind === 'double' ? [['rH', -1], ['lH', 1]] : part === 'fistL' ? [['lH', 1]] : [['rH', -1]];
    for (const [h, s] of sides) {
      const o = hit[h];
      if (!Array.isArray(o)) continue;
      const aim = kind === 'double' ? AIM.clone().setX(-s * 0.1) : AIM;
      const n = aimHand(hit, s, aim, LIMBS.reach * ARM), d = [n[0] - o[0], n[1] - o[1], n[2] - o[2]];
      for (const k of out) if (k[0] >= 1 - 1e-6 && Array.isArray(k[1][h])) k[1] = { ...k[1], [h]: k[1][h].map((x, i) => x + d[i] * (k[0] > 1.2 ? 0.5 : 1)) };
    }
  } else if (mo.fam === 'punch' && LIMBS.bent[kind]) {
    const h = part === 'fistL' ? 'lH' : 'rH', v = hit[h], l = Array.isArray(v) ? Math.hypot(...v) : 0;
    if (l > 1e-3) out[hitAt][1] = { ...hit, [h]: v.map((x) => (x / l) * LIMBS.bent[kind] * ARM) };
  } else if (mo.fam === 'kick' && KICKS.has(kind)) {
    const f = part === 'footL' ? 'lF' : 'rF';
    out[hitAt][1] = { ...hit, [f]: longFoot(hit, f, LIMBS.leg) };
  }
  return out;
}

// ---------------------------------------------------------------- the pass (Fly-By, Through the Tower)
/** Flying: the body near level along the line, the lead fist straight out ahead, the other arm along his
 *  side, the legs long behind, the toes pointed. */
export const FLY_B = (() => {
  const base = F({
    yaw: 0, bY: -0.05, pitch: LIMBS.fly.pitch, hdX: -LIMBS.fly.pitch + 0.25, hdY: 0,
    rP: [-0.8, 0.2, -0.3], lP: [0.8, -0.5, -0.3], lH: [0.0, -0.5, -0.14],
  });
  // the lead fist: straight out from the shoulder along the line (body axes: up the body is ahead of him)
  const legs = flierLegs(base, LIMBS.fly.k, [LIMBS.fly.pitch - 0.08, LIMBS.fly.pitch + 0.04]);
  return { ...legs, rH: [0.02, LIMBS.reach * ARM * 0.97, 0.18] };
})();
/** Gathered to launch: the fist drawn back, the knees drawn up under him (the coil: a held anticipation). */
export const LAUNCH_B = (() => {
  const base = F({ yaw: -0.3, bY: -0.2, pitch: 0.35, hdX: -0.25, rH: [0.1, -0.04, -0.12], rP: [-0.8, -0.4, -0.5], lH: [0.02, 0.08, 0.36], lP: [0.8, -0.6, -0.1] });
  return flierLegs(base, LIMBS.launch.k, LIMBS.launch.trail);
})();

const holdKeys = (a, b, cock = 0.7) => [[cock * 0.5, a], [cock, a], [1.0, { ...b, e: 'i' }], [2.0, b]];
const cache = new WeakMap();
/** The keys of his flying beats under `b` (null: not one): the pass, the tower's run and burst. */
export function flyKeys(beat) {
  if (cache.has(beat)) return cache.get(beat);
  let k = null;
  if (beat.halPass === 'go') k = [[0.35, LAUNCH_B], [0.75, LAUNCH_B], [1.0, { ...FLY_B, e: 'i' }], [2.0, FLY_B]];
  else if (beat.halPass === 'back') k = holdKeys(LAUNCH_B, LAUNCH_B, 0.6);
  else if (beat.halTower === 'out') k = holdKeys(LAUNCH_B, FLY_B, 0.4);
  else if (beat.halTower === 'burst') k = [[0.4, FLY_B], [0.8, FLY_B], [1.0, { ...FLY_B, e: 'i' }], [2.0, F({ ...LAUNCH_B, pitch: 0.2 })]];
  // every other beat of his own (the eyes, the car, the clap, the grab, the statue's arm, the falling sky):
  // its keys with the flier's legs, not feet planted on air; the transitions' kneel and the dive's landing
  // (on the floor) keep theirs
  else if (Array.isArray(beat.keys) && !beat.halMoment && !beat.halDive) {
    const cock = beat.cock ?? 0.7;
    k = beat.keys.map(([u, p]) => [u, legsFor(p, u >= cock - 1e-6)]);
  }
  cache.set(beat, k);
  return k;
}
