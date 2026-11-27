import { TELL } from '../../../combat/rules.js';
import { lookOf } from './lookSwitch.js';

// HELD TELLS (ADR-223): a blue or red blow stops at its cock and HOLDS it before the strike, so the colour
// is read from a still pose at the game camera, and the pose itself is coloured: blue stands tall and
// drawn back (come and meet it), red sinks low and coils, the feet wide (get out of its way). The owner
// asked for "a readable held windup pose" on every blue and red attack (2026-11-26). The audit
// (tests/integration/motionAudit.mjs) measured Lu Wusheng's and Wen Yao's blue / red blows moving all
// the way from the guard to the strike: held 0.00 - 0.10 s.
//
// The way to the cock is the author's (a first try played it faster to make room for the hold: the
// raise snapped at 18 m/s); the hold is HELD.hold s MORE of the cocked pose, the realiser's bait hold
// (realise.js: the cocked pose repeated as the hold ends, so the strike leaves it from rest). The blow's
// windup is that much longer: the strike from the cock to the impact, the cue (the flash flashLead before
// the impact) and every window are as before. A boss opts in through its realiser (`keysOf`):
// makeHeldKeys(switch, guard) returns the hook; the switch is read live each time a move is realised:
// '0' as authored, 'a' held and coloured, 'b' held only.
//
// Left alone: draws (their own long still settle, ADR-144), casts, packs, feints, a beat wound up >=
// HELD.longer s (a transition, a charged blow: they already hold), and any beat its boss marks `held: false`.
export const HELD = Object.freeze({
  hold: 0.16, // s of the cocked pose added before the strike
  longer: 0.9, // s: a beat wound up this long is left as it is
  floor: -0.6, // m: red sinks a cock by C.bY down to this at most (a sweep's crouch is already near it) ...
  sinkMin: 0.04, // ... and by this at least
  // the colours, added to the cock pose (bY m, the rest rad; `wide` m to each foot's side)
  blue: Object.freeze({ bY: 0.035, pitch: -0.09, spX: -0.08, hdX: -0.1 }),
  red: Object.freeze({ bY: -0.1, pitch: 0.1, spX: 0.1, hdX: 0.12, wide: 0.07 }),
});

/** The motion pass's fixes that ride the same switch (ADR-223): a planted foot the clip lifts eases off
 *  its spot over `liftEase` s (anim.js HeroAnimator opts.liftEase). */
export const MOTION_FIX = Object.freeze({ liftEase: 0.12 });

const SCAL = ['bY', 'pitch', 'spX', 'hdX'];

/** What `def` plays held ({ keys, hold }: its keys with the cock coloured in mode 'a'), or null: as authored. */
export function heldKeys(def, mode, guard, H = HELD) {
  if (mode !== 'a' && mode !== 'b') return null;
  const tell = def?.tell;
  if (tell !== TELL.BLUE && tell !== TELL.RED) return null;
  if (def.draw || def.cast || def.pack || def.feint || def.held === false || !(def.windup < H.longer)) return null;
  const keys = def.keys;
  if (!Array.isArray(keys) || !keys.length) return null;
  const cock = def.cock ?? 0.8;
  // the cock: the last pose at or before the beat's mark `cock` (0.8 by default) that is not the gather;
  // with none there (The Walking Staff keys its cock at 0.84, after the mark), the first pose after the
  // mark that is not the strike itself (an 'i' key), moved onto the mark: the realiser holds at the mark
  let ci = -1;
  keys.forEach(([u, p], i) => { if (u <= cock + 1e-6 && !p.gather) ci = i; });
  if (ci < 0) ci = keys.findIndex(([u, p]) => u > cock && u < 1 - 1e-6 && p.e !== 'i');
  if (ci < 0 || !(keys[ci][0] > 0.05)) return null;
  const u0 = Math.min(keys[ci][0], cock);
  // (a key between the mark and the cock is dropped with it: the cock moves onto the mark)
  const out = keys.filter(([u], i) => i === ci || !(u > u0 + 1e-6 && u < keys[ci][0] - 1e-6));
  const pose = keys[ci][1], held = { ...pose };
  if (mode === 'a') {
    const C = tell === TELL.BLUE ? H.blue : H.red;
    for (const f of SCAL) if (C[f]) held[f] = (pose[f] ?? guard?.[f] ?? 0) + C[f];
    if (C.bY < 0) {
      // red always sinks some (H.sinkMin), the full C.bY above H.floor
      const b0 = pose.bY ?? guard?.bY ?? 0;
      held.bY = Math.max(b0 + C.bY, Math.min(b0 - H.sinkMin, H.floor));
    }
    if (C.wide) {
      if (Array.isArray(pose.rF)) held.rF = [pose.rF[0] - C.wide, ...pose.rF.slice(1)];
      if (Array.isArray(pose.lF)) held.lF = [pose.lF[0] + C.wide, ...pose.lF.slice(1)];
    }
  }
  return { keys: out.map((k) => (k === keys[ci] ? [u0, held] : k)), hold: H.hold };
}

/** The realiser's `keysOf` hook for a boss: the switch `name` ('0' | 'a' | 'b'), read live. */
export function makeHeldKeys(name, guard, H = HELD) {
  const cache = { a: new WeakMap(), b: new WeakMap() };
  return (def) => {
    const mode = lookOf(name, '0');
    const C = cache[mode];
    if (!C || !def) return null;
    if (!C.has(def)) C.set(def, heldKeys(def, mode, guard, H));
    return C.get(def);
  };
}
