import * as THREE from 'three';
import { DIM } from '../../player/model.js';
import { lookOf } from '../duelist/lookSwitch.js';

// THE LIMBS AT THE CONTACT (ADR-249, `?foxLimbs=0|a`; the boss motion audit, 2026-11-26). The owner: "a lot
// of the melee fighting bosses their kicks aren't straight during the attack and still bended". Measured on
// the rig (fox.mjs `anatomy`): every straight punch and palm of his landed with the elbow at 123 - 139 deg
// (a boss without `armSoft` reaches at most ~145 deg: anim.js ARM_SOFT) and 0.25 - 0.36 m off the line
// from his shoulder to the hero; his roundhouse landed with the knee at 107 - 111 deg, the sweep at 82 -
// 124 deg, the paper selves' rising kick at 126 deg. His blows are Tian Lei's builders (ascendant/moves.js
// X), which this pass does not touch: it rewrites the CONTACT key of his own realised beats, as Xin Yi's
// rebuild did for his (ADR-221, wokenOne/moves.js longLeg), and opens his animator's reach:
//   - a straight blow (jab, cross, palm, both palms, the Pearl's drive): the striking hand put REACH x the
//     arm's length from its shoulder, along the line from the shoulder to a target before him at chest
//     height (AIM): the punch extends from the shoulder along one line and the elbow opens (~165 deg);
//   - a kick (front, round, flying, axe, the sweep's turn along the floor): the striking foot LEG x the
//     leg's length from its hip along the same line (never under the ankle: along the floor instead);
//     with `kickStretch` round it the leg is a straight line at the extension, not a triangle;
//   - the hook, the uppercut, the hammer fists, the knee and the elbow keep their bend: they are bent blows.
// '0' plays everything as before (the realiser, the animators, the paper selves).

/** The pass's numbers. */
export const LIMBS = Object.freeze({
  reach: 1.08, // x the arm's length: a straight blow's hand at the contact (the soft reach opens it to ~0.99)
  leg: 1.05, // x the leg's length: a kick's foot at the contact
  sweepLeg: 1.02, // ... the sweep's along the floor
  // m over the ankle's height: the sweeping foot skims the floor through the turn. On the floor the animator
  // takes a foot for a planted one (anim.js _feetClip: within CLIP_STEP.air of it) and walks it after the
  // clip in steps: it stalled a frame and drifted in toward him, the leg folding to ~110 deg
  skim: 0.05,
  aim: Object.freeze({ y: 1.18, z: 1.5 }), // m: the point a straight blow drives at (model space, before him)
  bent: Object.freeze({ hook: 0.78, uppercut: 0.8 }), // x the arm's length: a bent blow's hand (its elbow ~100 deg)
  fling: 1.02, // x the arm's length: Pearl Rain's flung hands
  leapStop: Object.freeze({ axe: 0.7, hammer: 0.45 }), // m short of the hero a leap down comes (brain.js leap.stop)
  // the animator (anim.js armSoft / legSoft / kickStretch: Xin Yi's rebuild's, ADR-221)
  armSoft: Object.freeze([0.95, 0.996]),
  legSoft: Object.freeze([0.95, 0.998]),
  kickStretch: Object.freeze([0.62, 0.86, 0.3, 0.28, 0.5]),
});

/** Whether the pass is on (read live: the realiser and the animators). */
export const limbsOn = () => lookOf('foxLimbs', '0') !== '0';

/** His animator (or a paper self's) with the pass's reach, or as before. Cheap: three field writes. */
export function applyLimbs(anim, on = limbsOn()) {
  if (!anim) return;
  anim.armSoft = on ? LIMBS.armSoft : null;
  anim.legSoft = on ? LIMBS.legSoft : null;
  anim.kickStretch = on ? LIMBS.kickStretch : null;
}

const STRAIGHT = new Set(['jab', 'cross', 'palm', 'double']);
const KICKS = new Set(['front', 'round', 'flying', 'axe', 'sweep']);
const ARM = DIM.upperArm + DIM.foreArm, LEG = DIM.thigh + DIM.shin;
// (build time only: scratch for the pose's joints, as the rig chains them: body → pelvis → spine → chest)
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** The body joint's rotation and the shoulder (side -1 his right, +1 his left) of pose p in model space. */
function shoulderOf(p, side) {
  _b.makeRotationFromEuler(_e.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0));
  _b.setPosition(p.bX ?? 0, DIM.pivot + (p.bY ?? 0), p.bZ ?? 0);
  const M = _m.copy(_b);
  M.multiply(new THREE.Matrix4().makeRotationFromEuler(_e.set(p.hipX ?? 0, p.hip ?? 0, p.hipZ ?? 0)).setPosition(...DIM.pelvis));
  M.multiply(new THREE.Matrix4().makeRotationFromEuler(_e.set(p.spX ?? 0, p.spY ?? 0, p.spZ ?? 0)).setPosition(...DIM.spine));
  M.multiply(new THREE.Matrix4().makeTranslation(...DIM.chest));
  return _v.set(side * DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]).applyMatrix4(M).clone();
}
/** A hand offset (body axes, from its shoulder) for a straight blow from pose p: toward AIM, REACH x the arm. */
function aimHand(p, side, h) {
  const S = shoulderOf(p, side);
  // the aim in body axes from the shoulder (the body joint's rotation only: hand offsets are body axes)
  const d = _w.set(0, LIMBS.aim.y, LIMBS.aim.z).sub(S).applyMatrix4(new THREE.Matrix4().extractRotation(_b).invert()).normalize();
  // (the authored hand's sideways lean is kept a little: a cross still crosses toward the centre line)
  const len = Math.hypot(h[0], h[1], h[2]) || 1;
  const k = LIMBS.reach * ARM;
  const x = d.x * 0.8 + (h[0] / len) * 0.2, y = d.y * 0.8 + (h[1] / len) * 0.2, z = d.z * 0.8 + (h[2] / len) * 0.2, n = Math.hypot(x, y, z) || 1;
  return [(x / n) * k, (y / n) * k, (z / n) * k];
}
/** The hip of pose p in model space (side -1 his right), the waist pivot's turn as wokenOne/moves.js hipOf. */
function hipOf(p, side) {
  _b.makeRotationFromEuler(_e.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0));
  _b.setPosition(p.bX ?? 0, DIM.pivot + (p.bY ?? 0), p.bZ ?? 0);
  return _v.set(side * DIM.hip[0], DIM.pelvis[1] + DIM.hip[1], 0).applyMatrix4(_b).clone();
}
/** A foot target from pose p, LEG x the leg's length from its hip along the authored line. */
function longFoot(p, side, v, k0 = LIMBS.leg, floor = DIM.ankle) {
  const h = hipOf(p, side), d = [v[0] - h.x, v[1] - h.y, v[2] - h.z], l = Math.hypot(...d), want = k0 * LEG;
  if (!(l > 0.45 * LEG) || l >= want) return v;
  const k = want / l;
  let y = h.y + d[1] * k, hz = k;
  if (y < floor) {
    // (on the floor: the length goes out along it)
    y = floor;
    const dy = y - h.y, hd = Math.hypot(d[0], d[2]);
    hz = hd > 1e-3 ? Math.sqrt(Math.max(0, want * want - dy * dy)) / hd : k;
  }
  return [h.x + d[0] * hz, y, h.z + d[2] * hz];
}

/** The sweep's turn (u 1 - 2) keyed every SWEEP_STEP of it: the builder keys it a third of a turn apart,
 *  and between keys 120 deg apart the foot cut the chord, half way in toward him: the leg folded to 50 -
 *  90 deg through the turn and was straight for one frame. Each new key is the contact key turned by its
 *  share of the turn (the body's yaw, the feet round the root, the feet's own heading). */
const SWEEP_STEPS = 12;
const rotXZ = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
function roundSweep(keys) {
  const i1 = keys.findIndex(([u]) => Math.abs(u - 1) < 1e-6), i2 = keys.findIndex(([u]) => Math.abs(u - 2) < 1e-6);
  if (i1 < 0 || i2 < 0) return keys;
  const P1 = keys[i1][1], P2 = keys[i2][1], turn = (P2.yaw ?? 0) - (P1.yaw ?? 0);
  if (!(Math.abs(turn) > 1)) return keys;
  const mid = [];
  for (let j = 1; j < SWEEP_STEPS; j++) {
    const a = (turn * j) / SWEEP_STEPS, o = { ...P1, yaw: (P1.yaw ?? 0) + a, hdY: (P1.hdY ?? 0) - a * 0.82, e: 'l' };
    for (const f of ['rF', 'lF']) if (Array.isArray(P1[f]) && P1[f].length === 3) o[f] = rotXZ(P1[f], a);
    if (typeof P1.rFy === 'number') o.rFy = P1.rFy + a;
    if (typeof P1.lFy === 'number') o.lFy = P1.lFy + a;
    mid.push([1 + j / SWEEP_STEPS, o]);
  }
  return [...keys.slice(0, i1 + 1), ...mid, ...keys.slice(i2)];
}

/** Which hand fields a straight blow strikes with: [field, side]. */
function handsOf(kind, left) {
  const R = ['rH', -1], L = ['lH', 1];
  if (kind === 'double') return [R, L];
  if (kind === 'jab') return [left ? R : L];
  return [left ? L : R];
}

/**
 * The beat with its contact key's limbs long (or the beat itself: a feint, a bent blow, a beat without
 * keys). `kind` for a beat with no `mo` (the Pearl's drive): 'palm'.
 */
export function limbBeat(b0) {
  if (!b0 || b0.feint || !Array.isArray(b0.keys)) return b0;
  // a leap down onto the hero comes down short of him by what strikes ahead of him (the heel, the fists:
  // brain.js `leap.stop`): he landed ON the hero, his heel 0.8 m past him
  const stop = b0.leap ? LIMBS.leapStop[b0.mo?.kind] ?? 0 : 0;
  const b = stop > 0 ? { ...b0, leap: { ...b0.leap, stop } } : b0;
  const fam = b.mo?.fam ?? (b.pearl === 'drive' ? 'punch' : null), kind = b.mo?.kind ?? (b.pearl === 'drive' ? 'palm' : null), left = !!b.mo?.left;
  if (fam === 'punch' && STRAIGHT.has(kind)) {
    const hands = handsOf(kind, left);
    const keys = b.keys.map(([u, p]) => {
      if (Math.abs(u - 1) > 1e-6) return [u, p];
      const o = { ...p };
      for (const [f, s] of hands) if (Array.isArray(p[f])) o[f] = aimHand(p, s, p[f]);
      return [u, o];
    });
    return { ...b, keys };
  }
  // a bent blow keeps its bend under the opened reach (a hook at ~100 deg, an uppercut at ~105: the hand
  // that far from its shoulder along its authored line); the volley's flung hands go out long
  const bent = fam === 'punch' ? LIMBS.bent[kind] : b.pearl === 'charge' ? LIMBS.fling : null;
  if (bent) {
    const fs = b.pearl === 'charge' ? ['rH', 'lH'] : [left ? 'lH' : 'rH'];
    const keys = b.keys.map(([u, p]) => {
      if (Math.abs(u - 1) > 1e-6) return [u, p];
      const o = { ...p };
      for (const f of fs) {
        const h = p[f], l = Array.isArray(h) ? Math.hypot(h[0], h[1], h[2]) : 0;
        if (l > 1e-3) o[f] = h.map((x) => (x / l) * bent * ARM);
      }
      return [u, o];
    });
    return { ...b, keys };
  }
  if (fam === 'kick' && KICKS.has(kind)) {
    const f = b.part === 'footL' ? 'lF' : 'rF', s = f === 'lF' ? 1 : -1;
    const keys = (kind === 'sweep' ? roundSweep(b.keys) : b.keys).map(([u, p]) => {
      const at = kind === 'sweep' ? u >= 1 - 1e-6 && u <= 2 + 1e-6 : Math.abs(u - 1) < 1e-6;
      const v = p[f];
      if (!at || !Array.isArray(v) || v.length !== 3) return [u, p];
      return [u, { ...p, [f]: kind === 'sweep' ? longFoot(p, s, v, LIMBS.sweepLeg, DIM.ankle + LIMBS.skim) : longFoot(p, s, v) }];
    });
    return { ...b, keys };
  }
  return b;
}

/** Every beat of every move through limbBeat (a `pick` list's choices too). */
export function limbMoves(MOVES) {
  const out = {};
  for (const [name, def] of Object.entries(MOVES)) {
    out[name] = { ...def, beats: def.beats.map((b) => (Array.isArray(b.pick) ? { ...b, pick: b.pick.map(limbBeat) } : limbBeat(b))) };
    // (getters on a move, e.g. the quick blows' weight, read live: carried over as getters)
    for (const k of Object.keys(def)) {
      const g = Object.getOwnPropertyDescriptor(def, k);
      if (g?.get) Object.defineProperty(out[name], k, g);
    }
  }
  return out;
}
