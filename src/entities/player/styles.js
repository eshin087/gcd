// PROTOTYPE: hero v2's motion base (`?hero=a|b|c`, heroDims.js HERO_ID; the three letters are three
// reworked MODELS, gear/shroud2.js: the motion below is the same under each). What the owner kept
// from the rounds before it:
//   at ease   the stance he picked (stances.js atEase: the blade down the arm's own line)
//   build     style B's (heroDims.js BUILD)
//   attacks   style B's share of the body in every swing (styleAttack, anim.js attackPose)
//   arms      the blade stays near the forearm's line standing and running (anim.js _wristNatural)
//   guard     square to the foe, no raised free hand (`?guard=1|2|3`, default 2)
// The swings' keys and their hit timing are unchanged.
//
// Pose space: body axes (x = his left, y up, z ahead); hand targets are offsets from each shoulder
// (anim.js).
import { TAU } from '../../core/math.js';
import { DIM, HERO_ID, GUARD_ID } from './heroDims.js';
import { dir, set3, onTheBelt, oscillate, BELT } from './stances.js';

export const HERO_NAMES = { now: 'Today', a: 'A · Lean', b: 'B · Half cloak', c: 'C · Great cloak' };
export const GUARD_NAMES = { 1: 'guard 1 · one hand, low', 2: 'guard 2 · two hands, middle', 3: 'guard 3 · two hands, low' };

/** The guard's life: a combat breath, the weight rocking on the balls of the feet, the arms a beat
 *  behind, the point drawing a slow small circle on the foe. */
function guardLife(p, P, A, az, el) {
  const t = A.time, br = Math.sin((t * TAU) / 2.4);
  const rock = Math.sin((t * TAU) / 1.9), rockL = Math.sin((t * TAU) / 1.9 - 0.8), c = (t * TAU) / 3.3;
  p[P.bodyZ] += 0.014 * rock;
  p[P.bodyY] += 0.006 * br - 0.004 * Math.abs(rock);
  p[P.spX] += 0.012 * br + 0.008 * rockL;
  p[P.rH] += 0.007 * Math.cos(c);
  p[P.rH + 1] += 0.007 * Math.sin(c) + 0.005 * rockL;
  dir(p, P.swD, az + 2.5 * Math.cos(c - 0.5), el + 2.2 * Math.sin(c - 0.5));
}
/** The guards' shared stance: nearly square to the foe (the owner: not side-on), the left foot a
 *  little forward, the knees soft, the chest open to the front, the eyes on the foe. */
function squareStance(p, P, A, sink) {
  p[P.bodyX] = 0.004;
  p[P.bodyY] = -sink;
  p[P.bodyZ] = 0.01;
  p[P.pelvX] = 0.03;
  p[P.pelvY] = -0.16;
  p[P.pelvZ] = 0;
  p[P.spX] = 0.07;
  p[P.spY] = 0.06;
  p[P.spZ] = 0;
  p[P.hdX] = -0.03;
  p[P.hdZ] = 0;
  p[P.hdY] = -(p[P.pelvY] + p[P.spY]) * 0.85;
  set3(p, P.lF, 0.14, DIM.ankle, 0.22);
  set3(p, P.rF, -0.15, DIM.ankle, -0.2);
  set3(p, P.lK, 0.3, 0, 1);
  set3(p, P.rK, -0.4, 0, 1);
  p[P.lFy] = 0.15;
  p[P.rFy] = -0.5;
  p[P.footFlat] = 0.93;
}
const twoHands = (p, P) => {
  p[P.twoHand] = 1;
  p[P.offAt] = 0;
  p[P.hs] = 0;
  p[P.lk] = 0;
};
const GUARDS = {
  /** 1 · LOW, ONE HAND: the sword hand before the right hip, the elbow down by the ribs, the blade
   *  straight off the forearm with its point low at the foe; the free hand at the belt. */
  1: {
    pose(p, P, A) {
      squareStance(p, P, A, 0.1);
      set3(p, P.rH, -0.03, -0.4, 0.27);
      set3(p, P.rP, 0.15, -0.9, -0.4);
      set3(p, P.swF, 0.3, 1, 0);
      onTheBelt(p, P, oscillate(A.time, 2.4), BELT.yaw);
      p[P.twoHand] = 0;
      p[P.offAt] = 0;
      guardLife(p, P, A, -8, -18);
    },
    run: { h: [-0.03, -0.38, 0.27], p: [0.15, -0.9, -0.4], d: [-8, -15], f: [0.3, 1, 0] },
  },
  /** 2 · MIDDLE, TWO HANDS: both hands on the grip before his navel, the elbows in, the point up at
   *  the foe's throat (the middle guard every school starts from). */
  2: {
    pose(p, P, A) {
      squareStance(p, P, A, 0.11);
      set3(p, P.rH, 0.1, -0.35, 0.3);
      set3(p, P.rP, -0.35, -0.85, -0.25);
      set3(p, P.lP, 0.4, -0.85, -0.2);
      set3(p, P.swF, 0.6, 0.8, 0);
      twoHands(p, P);
      guardLife(p, P, A, 3, 22);
    },
    run: { h: [0.1, -0.35, 0.3], p: [-0.35, -0.85, -0.25], d: [3, 18], f: [0.6, 0.8, 0] },
  },
  /** 3 · LOW, TWO HANDS: both hands on the grip before the belt, the point down at the foe's feet,
   *  inviting the attack. */
  3: {
    pose(p, P, A) {
      squareStance(p, P, A, 0.12);
      set3(p, P.rH, 0.1, -0.42, 0.26);
      set3(p, P.rP, -0.3, -0.85, -0.3);
      set3(p, P.lP, 0.4, -0.85, -0.25);
      set3(p, P.swF, 0.6, 0.8, 0);
      twoHands(p, P);
      guardLife(p, P, A, 0, -22);
    },
    run: { h: [0.1, -0.42, 0.26], p: [-0.3, -0.85, -0.3], d: [0, -18], f: [0.6, 0.8, 0] },
  },
};
const G = GUARDS[GUARD_ID];

/** The motion base on trial (null: today's hero). `run.dv`: its run carry's blade direction as a
 *  unit vector. */
export const STYLE = HERO_ID
  ? {
    id: HERO_ID,
    ease: (p, P, A, base) => base(p, P, A),
    guard: G.pose,
    block: null, // (anim.js blockPose as it is)
    run: G.run,
    atk: { two: 0, body: 1.3, dip: 0.025, lunge: 0.05, lean: 0.05, antic: 0.6, home: 0.22, arc: 1.04 },
  }
  : null;
if (STYLE) {
  const d = [0, 0, 0];
  dir(d, 0, STYLE.run.d[0], STYLE.run.d[1]);
  STYLE.run.dv = d;
}
