// RESTLESS: the restless, aggressive duelist (a fencer crossed with a boxer). Never still, always
// about to go: the weight bounces from foot to foot, the point twitches, the head keeps looking; a
// change of stance makes him STEP (the lead foot switches). His attack is pressure: quick doubles,
// a step-in, a feint, a burst and a drive that steps through: tat-tat, tat, tat, tat-tat-TAT.
// The contract: styles/index.js (stances: STANCES.md; the combo: COMBOS.md).
// Nothing here allocates per frame, throws, or reads Math.random: every pose is a pure function of
// the animator's clock (A.time) and the streak (A.streakK).
import { P, ANK, set3, dir, to3, add3, dirNudge, dirTo, kf, hump, standLife, wave, smoother } from '../poseKit.js';

// ================================================================ THE LIFE (faster than today's)
// (periods in s, none a multiple of another: the weight goes foot to foot in ~3 s, the eyes move
// every couple of seconds, the point's two wander quicker)
const LIFE = { breath: [2.9, 2.5], settle: 3.3, drift: 6.1, look: [4.3, 2.9], point: [2.3, 3.1], arms: 0.9 };
const M = { br: 0, brL: 0, sw: 0, dr: 0, look: 0, tipA: 0, tipB: 0 };
const life = (A, breath) => standLife(A.time, breath, LIFE, M);
/** The bounce: a boxer's bob, twice per weight shift, that swells and dies over ~10 s (never a
 *  metronome), more eager as the streak grows. −1..1 times its own strength (0.35..1). */
function bob(A, period) {
  const t = A.time, k = 0.62 + 0.38 * wave(t, 9.7, 0.8);
  return (0.7 * wave(t, period) + 0.3 * wave(t, period * 0.5, 1.3)) * k * (1 + 0.5 * (A.streakK || 0));
}
/** The point's twitch: two quick small sines (degrees, ×1): the point never settles. */
const twitch = (t, a, b) => 0.6 * wave(t, a) + 0.4 * wave(t, b, 2.1);

/** The free hand's channels other than its place (so every rest writes all eight). */
function freeRest(p, hs) {
  p[P.hs] = hs;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}

// ================================================================ AT EASE
/** BOB: left foot ahead, leaning in a little, the blade low out to his front-right swaying with the
 *  weight as it bounces foot to foot; the free hand hangs loose and every few seconds shakes out. */
function easeBob(p, P_, A) {
  const m = life(A, LIFE.breath[0]), t = A.time, b = bob(A, 0.86);
  const sw = wave(t, 1.7); // foot to foot (quicker than the life's settle)
  p[P.bodyX] = -0.012 - 0.026 * sw;
  p[P.bodyY] = -0.045 + 0.009 * b + 0.005 * m.br;
  p[P.bodyZ] = 0.012 + 0.006 * m.dr;
  p[P.pelvX] = 0.02;
  p[P.pelvY] = -0.22 + 0.03 * sw;
  p[P.pelvZ] = -0.03 - 0.03 * sw;
  p[P.spX] = 0.09 + 0.02 * m.br;
  p[P.spY] = 0.12 - 0.02 * sw;
  p[P.spZ] = 0.04 + 0.025 * sw;
  p[P.hdX] = -0.05 - 0.015 * m.br;
  p[P.hdY] = 0.1 + 0.22 * m.look;
  p[P.hdZ] = -0.02 - 0.02 * sw;
  set3(p, P.rH, -0.2 + 0.008 * sw, -0.45 + 0.01 * m.brL, 0.12 + 0.01 * m.tipA);
  set3(p, P.rP, 0.5, -0.3, -0.8);
  dir(p, P.swD, -46 + 4 * sw + 2 * m.tipA, -41 + 2.5 * m.tipB + 1.5 * b);
  set3(p, P.swF, 0.78, -0.62, 0); // (swept at the game camera: broadest on all four sides)
  // the free hand: loose beside the thigh, swinging with the weight; a burst of shakes now and then
  const shake = smoother((wave(t, 5.3, 0.4) - 0.55) / 0.4);
  set3(p, P.lH, 0.07 + 0.012 * sw + 0.012 * shake * wave(t, 0.21), -0.48 + 0.008 * m.brL + 0.008 * shake * wave(t, 0.17, 1), 0.05 + 0.02 * m.dr);
  set3(p, P.lP, 0.4, -0.2, -0.9);
  set3(p, P.lD, 0.05 + 0.25 * shake * wave(t, 0.19), -0.3, 0.08);
  set3(p, P.lN, -0.6, 0, 0.1);
  freeRest(p, 0);
  set3(p, P.rF, -0.14, ANK, -0.11);
  set3(p, P.lF, 0.13, ANK, 0.18);
  set3(p, P.rK, -0.5, 0.05, 1);
  set3(p, P.lK, 0.3, 0.05, 1);
  p[P.rFy] = -0.55;
  p[P.lFy] = 0.15;
  p[P.footFlat] = 0.95;
}

/** TRAIL: the other foot ahead (he steps into it), the blade trailing low behind the right hip, the
 *  free hand forward at the belt line, open; he rocks on and off the front foot, looking about. */
function easeTrail(p, P_, A) {
  const m = life(A, LIFE.breath[0]), t = A.time, b = bob(A, 1.1);
  const rk = wave(t, 2.3, 0.5); // on and off the front foot
  p[P.bodyX] = 0.01 + 0.01 * m.sw;
  p[P.bodyY] = -0.035 + 0.007 * b + 0.005 * m.br;
  p[P.bodyZ] = 0.005 + 0.018 * rk;
  p[P.pelvX] = 0.0;
  p[P.pelvY] = 0.22;
  p[P.pelvZ] = 0.03 + 0.015 * m.sw;
  p[P.spX] = 0.06 + 0.02 * m.br + 0.02 * rk;
  p[P.spY] = 0.04;
  p[P.spZ] = -0.03;
  p[P.hdX] = -0.02;
  p[P.hdY] = -0.22 + 0.3 * m.look;
  p[P.hdZ] = 0.02;
  set3(p, P.rH, -0.21, -0.46 + 0.01 * m.brL, -0.03 + 0.008 * rk);
  set3(p, P.rP, 0.6, -0.25, 0.75);
  dir(p, P.swD, -120 + 3 * m.tipA, -45 + 2 * m.tipB + 1.5 * rk);
  set3(p, P.swF, 0.63, -0.26, -0.73);
  // the free hand forward of the hip at the belt line, open, the fingers loose and moving
  set3(p, P.lH, 0.03 + 0.006 * m.sw, -0.37 + 0.01 * m.brL, 0.2 + 0.012 * rk);
  set3(p, P.lP, 0.6, -0.5, -0.6);
  dir(p, P.lD, 8 + 10 * wave(t, 1.3), -25 + 8 * wave(t, 0.9, 1));
  p[P.lD] *= 0.5; p[P.lD + 1] *= 0.5; p[P.lD + 2] *= 0.5;
  set3(p, P.lN, -0.45, -0.5, 0.1);
  freeRest(p, 0);
  set3(p, P.rF, -0.12, ANK, 0.15);
  set3(p, P.lF, 0.13, ANK, -0.13);
  set3(p, P.rK, -0.3, 0.05, 1);
  set3(p, P.lK, 0.55, 0.05, 0.85);
  p[P.rFy] = -0.2;
  p[P.lFy] = 0.7;
  p[P.footFlat] = 0.95;
}

/** PROWL: wide and low on the left foot, leaning in, the blade held low across his front with the
 *  point ahead and down; the free hand low and out to the left, open for balance; the weight sways
 *  from side to side. */
function easeProwl(p, P_, A) {
  const m = life(A, LIFE.breath[0]), t = A.time, b = bob(A, 1.3);
  const sw = wave(t, 2.9, 1.2);
  p[P.bodyX] = 0.0 - 0.035 * sw;
  p[P.bodyY] = -0.1 + 0.008 * b + 0.006 * m.br;
  p[P.bodyZ] = 0.02;
  p[P.pelvX] = 0.04;
  p[P.pelvY] = -0.3 + 0.04 * sw;
  p[P.pelvZ] = -0.04 * sw;
  p[P.spX] = 0.2 + 0.02 * m.br;
  p[P.spY] = 0.2 - 0.03 * sw;
  p[P.spZ] = 0.03 * sw;
  p[P.hdX] = -0.15;
  p[P.hdY] = 0.08 + 0.2 * m.look;
  p[P.hdZ] = 0.0;
  set3(p, P.rH, -0.22 + 0.01 * sw, -0.42 + 0.01 * m.brL, 0.15 + 0.008 * m.tipA);
  set3(p, P.rP, 0.7, -0.4, -0.5);
  dir(p, P.swD, -55 + 3 * m.tipA - 4 * sw, -32 + 2 * m.tipB);
  set3(p, P.swF, 0.32, -0.86, -0.39);
  set3(p, P.lH, 0.13 + 0.01 * sw, -0.42 + 0.01 * m.brL, 0.1);
  set3(p, P.lP, 0.7, -0.4, -0.6);
  dir(p, P.lD, 60 + 6 * m.dr, -40);
  p[P.lD] *= 0.6; p[P.lD + 1] *= 0.6; p[P.lD + 2] *= 0.6;
  set3(p, P.lN, 0, -0.7, 0);
  freeRest(p, 0);
  set3(p, P.rF, -0.17, ANK, -0.16);
  set3(p, P.lF, 0.17, ANK, 0.22);
  set3(p, P.rK, -0.7, 0.05, 0.7);
  set3(p, P.lK, 0.5, 0.05, 0.9);
  p[P.rFy] = -0.7;
  p[P.lFy] = 0.25;
  p[P.footFlat] = 0.95;
}

/** ITCH (streak tier 3+): the blade up and forward at his right, the point circling small and quick
 *  (rolling in the wrist), the bounce eager; the free hand loose and out. */
function easeItch(p, P_, A) {
  const m = life(A, LIFE.breath[0]), t = A.time, b = bob(A, 0.72);
  const sw = wave(t, 1.5);
  const ca = wave(t, 1.2), cb = wave(t, 1.2, Math.PI / 2); // the point's circle
  p[P.bodyX] = -0.01 - 0.024 * sw;
  p[P.bodyY] = -0.06 + 0.011 * b;
  p[P.bodyZ] = 0.02;
  p[P.pelvX] = 0.02;
  p[P.pelvY] = -0.16 + 0.03 * sw;
  p[P.pelvZ] = -0.03 * sw;
  p[P.spX] = 0.1 + 0.02 * m.br;
  p[P.spY] = 0.18;
  p[P.spZ] = 0.02 * sw;
  p[P.hdX] = -0.06;
  p[P.hdY] = -0.05 + 0.18 * m.look;
  p[P.hdZ] = 0.0;
  set3(p, P.rH, -0.23 + 0.006 * ca, -0.38 + 0.006 * cb + 0.01 * m.brL, 0.2);
  set3(p, P.rP, 0.75, -0.4, -0.5);
  dir(p, P.swD, -53 + 2.5 * ca, -25 + 2.5 * cb);
  set3(p, P.swF, 0.33, -0.92, -0.22);
  set3(p, P.lH, 0.09 + 0.01 * sw, -0.46 + 0.008 * m.brL, 0.08);
  set3(p, P.lP, 0.45, -0.25, -0.85);
  set3(p, P.lD, 0.06, -0.3, 0.1);
  set3(p, P.lN, -0.6, 0, 0.15);
  freeRest(p, 0);
  set3(p, P.rF, -0.14, ANK, -0.12);
  set3(p, P.lF, 0.13, ANK, 0.2);
  set3(p, P.rK, -0.5, 0.05, 1);
  set3(p, P.lK, 0.3, 0.05, 1);
  p[P.rFy] = -0.55;
  p[P.lFy] = 0.15;
  p[P.footFlat] = 0.93;
}

// ================================================================ FIGHT
/** CROUCH: low and forward on the sword foot, the point on the foe and twitching, the free hand up
 *  before the chest as a guard hand, open; a small fighter's bounce. */
function fightCrouch(p, P_, A) {
  const m = life(A, LIFE.breath[1]), t = A.time, b = bob(A, 0.78);
  p[P.bodyX] = 0.0 - 0.012 * m.sw;
  p[P.bodyY] = -0.12 + 0.008 * b + 0.005 * m.br;
  p[P.bodyZ] = 0.02 + 0.012 * m.dr;
  p[P.pelvX] = 0.03;
  p[P.pelvY] = 0.28;
  p[P.pelvZ] = 0.02;
  p[P.spX] = 0.12 + 0.02 * m.br;
  p[P.spY] = 0.24;
  p[P.spZ] = -0.03;
  p[P.hdX] = -0.06;
  p[P.hdY] = -0.46;
  p[P.hdZ] = 0.02;
  set3(p, P.rH, -0.1 + 0.005 * m.tipB, -0.24 + 0.01 * m.brL, 0.36 + 0.008 * m.tipA);
  set3(p, P.rP, 0.06, -0.9, -0.45);
  dir(p, P.swD, -11 + 1.3 * twitch(t, 0.43, 0.71) + 1.5 * m.tipA, 7 + 1.2 * twitch(t, 0.53, 0.37) + 1.5 * m.tipB);
  dir(p, P.swF, -11, 97);
  // the guard hand: open before the left chest, the fingers up, the palm toward the foe
  set3(p, P.lH, -0.04 + 0.005 * m.sw, -0.16 + 0.01 * m.brL, 0.28 + 0.006 * b);
  set3(p, P.lP, 0.7, -0.65, -0.25);
  dir(p, P.lD, -5, 58 + 3 * m.br);
  p[P.lD] *= 0.6; p[P.lD + 1] *= 0.6; p[P.lD + 2] *= 0.6;
  set3(p, P.lN, -0.4, 0, 0.7);
  freeRest(p, 0);
  set3(p, P.rF, -0.1, ANK, 0.28);
  set3(p, P.lF, 0.12, ANK, -0.25);
  set3(p, P.rK, -0.4, 0, 1);
  set3(p, P.lK, 0.75, 0, 0.65);
  p[P.rFy] = -0.45;
  p[P.lFy] = 0.95;
  p[P.footFlat] = 0.95;
}

/** COCKED: the other foot forward, the sword hand drawn up by the right ear with the blade cocked
 *  up and out over the shoulder, the free hand forward with sword fingers on the foe. */
function fightCocked(p, P_, A) {
  const m = life(A, LIFE.breath[1]), t = A.time, b = bob(A, 0.9);
  p[P.bodyX] = 0.0 + 0.012 * m.sw;
  p[P.bodyY] = -0.08 + 0.008 * b + 0.005 * m.br;
  p[P.bodyZ] = 0.01 + 0.012 * m.dr;
  p[P.pelvX] = 0.02;
  p[P.pelvY] = -0.3;
  p[P.pelvZ] = -0.02;
  p[P.spX] = 0.06 + 0.02 * m.br;
  p[P.spY] = -0.06;
  p[P.spZ] = 0.03;
  p[P.hdX] = 0.0;
  p[P.hdY] = 0.34;
  p[P.hdZ] = -0.02;
  set3(p, P.rH, -0.26 + 0.005 * m.tipB, -0.06 + 0.01 * m.brL, 0.25 + 0.006 * m.tipA);
  set3(p, P.rP, -0.3, -0.9, 0.2);
  dir(p, P.swD, -42 + 1.2 * twitch(t, 0.47, 0.67) + 2 * m.tipA, 40 + 1.2 * twitch(t, 0.59, 0.41) + 1.5 * m.tipB);
  set3(p, P.swF, 0.67, -0.13, 0.74);
  set3(p, P.lH, 0.0 + 0.005 * m.sw, -0.14 + 0.01 * m.brL, 0.38 + 0.006 * b);
  set3(p, P.lP, 0.4, -0.9, -0.1);
  dir(p, P.lD, -4, 2 + 2 * m.br);
  set3(p, P.lN, -0.8, 0, 0);
  freeRest(p, 1);
  set3(p, P.rF, -0.13, ANK, -0.2);
  set3(p, P.lF, 0.12, ANK, 0.26);
  set3(p, P.rK, -0.6, 0, 0.8);
  set3(p, P.lK, 0.2, 0, 1);
  p[P.rFy] = -0.8;
  p[P.lFy] = 0.1;
  p[P.footFlat] = 0.95;
}

/** HUNT (streak tier 3+): deeper still on the sword foot, the point dropped to the foe's knees and
 *  circling, the free hand high and open. */
function fightHunt(p, P_, A) {
  const m = life(A, LIFE.breath[1]), t = A.time, b = bob(A, 0.7);
  const ca = wave(t, 1.1), cb = wave(t, 1.1, Math.PI / 2);
  p[P.bodyX] = 0.0 - 0.012 * m.sw;
  p[P.bodyY] = -0.16 + 0.01 * b;
  p[P.bodyZ] = 0.03 + 0.012 * m.dr;
  p[P.pelvX] = 0.04;
  p[P.pelvY] = 0.3;
  p[P.pelvZ] = 0.02;
  p[P.spX] = 0.18 + 0.02 * m.br;
  p[P.spY] = 0.22;
  p[P.spZ] = -0.03;
  p[P.hdX] = -0.12;
  p[P.hdY] = -0.46;
  p[P.hdZ] = 0.02;
  set3(p, P.rH, -0.08 + 0.006 * ca, -0.3 + 0.006 * cb, 0.36);
  set3(p, P.rP, 0.2, -0.9, -0.4);
  dir(p, P.swD, -16 + 3 * ca, -8 + 3 * cb);
  dir(p, P.swF, -16, 82);
  set3(p, P.lH, -0.02 + 0.005 * m.sw, -0.08 + 0.01 * m.brL, 0.3);
  set3(p, P.lP, 0.75, -0.6, -0.2);
  dir(p, P.lD, -5, 62 + 3 * m.br);
  p[P.lD] *= 0.6; p[P.lD + 1] *= 0.6; p[P.lD + 2] *= 0.6;
  set3(p, P.lN, -0.4, 0, 0.7);
  freeRest(p, 0);
  set3(p, P.rF, -0.11, ANK, 0.3);
  set3(p, P.lF, 0.13, ANK, -0.27);
  set3(p, P.rK, -0.45, 0, 1);
  set3(p, P.lK, 0.8, 0, 0.6);
  p[P.rFy] = -0.45;
  p[P.lFy] = 0.95;
  p[P.footFlat] = 0.95;
}

const stances = {
  ease: [
    { id: 'restless.bob', fn: easeBob, w: 1.2, dwell: [3, 6], maxTier: 2, move: { d: [0, -0.6, 0.8], n: [-0.6, -0.2, -0.7] } },
    { id: 'restless.trail', fn: easeTrail, w: 1, dwell: [3, 6], maxTier: 2 },
    { id: 'restless.prowl', fn: easeProwl, w: 0.9, dwell: [3, 5], maxTier: 2 },
    { id: 'restless.itch', fn: easeItch, w: 1, dwell: [4, 7], minTier: 3 },
  ],
  fight: [
    { id: 'restless.crouch', fn: fightCrouch, w: 1, dwell: [3, 6], maxTier: 2 },
    { id: 'restless.cocked', fn: fightCocked, w: 1, dwell: [3, 5], maxTier: 2 },
    { id: 'restless.hunt', fn: fightHunt, w: 1, dwell: [4, 7], minTier: 3 },
  ],
};

// ================================================================ IDLE ACTIONS (offsets)
/** ROLL: the blade rolled in two quick circles in the wrist, the eyes on it. */
function idleRoll(p, A, u, e) {
  const k = hump(u, 0.1, 0.22, 0.78, 0.92) * e;
  if (!(k > 0)) return;
  const amp = 34 - 14 * (A.fightW || 0), th = 4 * Math.PI * smoother((u - 0.12) / 0.74);
  dirNudge(p, P.swD, amp * Math.sin(th), amp * (Math.cos(th) - 1) * 0.8 + 10, k);
  add3(p, P.rH, 0.02 * Math.sin(th), 0.04 + 0.02 * Math.cos(th), 0.04, k);
  p[P.hdY] -= 0.18 * k;
  p[P.hdX] += 0.06 * k;
}
/** TAP: the flat laid on the right shoulder and bounced on it twice, the chin up. */
function idleTap(p, A, u, e) {
  const k = hump(u, 0.06, 0.24, 0.8, 0.95) * e;
  if (!(k > 0)) return;
  const tap = 0.035 * (Math.max(0, Math.sin(Math.PI * kf(u, [0.38, 0, 0.5, 1]))) + Math.max(0, Math.sin(Math.PI * kf(u, [0.56, 0, 0.68, 1]))));
  to3(p, P.rH, 0.0, 0.0 + tap, 0.19, k);
  to3(p, P.rP, -0.45, -0.9, 0.2, k);
  dirTo(p, P.swD, -0.1, 0.56, -0.82, k);
  to3(p, P.swF, -1, 0.2, 0, k);
  p[P.hdZ] -= 0.08 * k;
  p[P.hdY] += 0.12 * k;
  p[P.hdX] -= 0.05 * k;
  p[P.spZ] += 0.04 * k;
}
/** NECK: a roll of the neck one way and back, a shrug, the free hand shaken out, two quick lifts
 *  onto the toes. */
function idleNeck(p, A, u, e) {
  if (!(e > 0)) return;
  const n = hump(u, 0.05, 0.15, 0.55, 0.65) * e, th = 2 * Math.PI * kf(u, [0.08, 0, 0.6, 1]);
  p[P.hdZ] += 0.24 * Math.sin(th) * n;
  p[P.hdX] += 0.18 * (1 - Math.cos(th)) * 0.5 * n;
  p[P.spZ] -= 0.04 * Math.sin(th) * n;
  const sh = hump(u, 0.15, 0.22, 0.3, 0.38) * e; // a shrug
  p[P.spX] -= 0.04 * sh;
  add3(p, P.rH, 0, 0.03, 0, sh);
  add3(p, P.lH, 0, 0.04, 0, sh);
  const sk = hump(u, 0.35, 0.42, 0.6, 0.68) * e; // the free hand shaken out
  add3(p, P.lH, 0.025 * Math.sin(u * 95), 0.02 * Math.sin(u * 77 + 1), 0.03, sk);
  p[P.lD] += 0.3 * Math.sin(u * 90) * sk;
  const hop = hump(u, 0.66, 0.7, 0.88, 0.94) * e; // up onto the toes twice
  const h = Math.max(0, Math.sin(2 * Math.PI * kf(u, [0.68, 0, 0.92, 2])));
  p[P.bodyY] += 0.02 * h * hop;
  p[P.footFlat] -= 0.35 * h * hop;
}
/** BECKON: the free hand forward, palm up, the fingers flicked up twice: come on. */
function idleBeckon(p, A, u, e) {
  const k = hump(u, 0.08, 0.28, 0.75, 0.92) * e;
  if (!(k > 0)) return;
  to3(p, P.lH, 0.0, -0.2, 0.36, k);
  to3(p, P.lP, 0.5, -0.85, -0.2, k);
  const f = kf(u, [0.3, 0, 0.38, 1, 0.46, 0, 0.54, 1, 0.62, 0]);
  const c = 0.75, el = 5 + 70 * f;
  to3(p, P.lD, 0, c * Math.sin(el * Math.PI / 180), c * Math.cos(el * Math.PI / 180), k);
  to3(p, P.lN, 0, 0.8, 0, k);
  p[P.hs] += (0 - p[P.hs]) * k;
  p[P.hdX] -= 0.06 * k;
  p[P.hdZ] += 0.06 * k;
}
const fidgets = [
  { name: 'restless.roll', dur: 1.5, sets: ['ease', 'fight'], fn: idleRoll },
  { name: 'restless.tap', dur: 2.2, sets: ['ease'], fn: idleTap },
  { name: 'restless.neck', dur: 2.8, sets: ['ease'], fn: idleNeck },
  { name: 'restless.beckon', dur: 2.0, sets: ['ease', 'fight'], fn: idleBeckon },
];

// ================================================================ THE COMBO: PRESSURE
// tat-tat, tat, tat, tat-tat-TAT. A quick jab-cut and a flat cross (a double: 0.21 s apart), a
// step-in rising cut (the first pause), a shoulder feint into a falling cross cut (the long beat),
// a burst of two cuts in one press, then the drive: a long step through and one heavy diagonal, held.
// Each hit starts on the side the one before left the blade (the pendulum): R→L, L→R, R→L, L→R,
// R→L→R, R→L. His free hand fights like a boxer's: up before the chin as a guard hand in the quick
// cuts, a punch-like feint, flung wide only on the drive.
// next from (W + A + chain × R): 0.25 · 0.324 · 0.38 · 0.36 · 0.345 · 0.692 = 2.35 s; with the hit-
// stops and the drive's heft a mashed cycle runs ~2.47 s: 266 damage → ~107.7 /s (today 107.8).
// The blows land ~0.21 · 0.39 · 0.47 · 0.26 · 0.10 · 0.41 · 0.63 s apart: tat-tat, tat, tat, tat-tat-TAT.
/** The guard hand: open before the chin, the fingers up, the palm toward the foe. */
const GUARD = { l: [-0.05, -0.15, 0.25], lp: [0.7, -0.65, -0.2], ld: [-5, 58], pn: [-0.4, 0, 0.7], lk: 0, hs: 0 };
const C = (name, extra) => ({ kind: 'clip', clip: name, ...extra });
const chain = [
  {
    // 1 tat: the jab-cut. A short falling diagonal from beside the right shoulder; hardly a windup.
    name: 'restlessJab', kind: 'light', combo: 1, damage: 26, poise: 10, heavy: false,
    windup: 0.12, active: 0.09, recovery: 0.2, chain: 0.2, lunge: 0.45, reach: 2.2,
    hitstop: 0.04, shake: 0.08, bite: 0.7, contact: 'light', punch: 0.25, kick: 0.05, flare: 0.4,
    anim: C('restlessJab'),
  },
  {
    // 2 tat: the cross. A flat backhand return at chest height, the guard hand punching out with it.
    name: 'restlessCross', kind: 'light', combo: 2, damage: 29, poise: 11, heavy: false,
    windup: 0.08, active: 0.09, recovery: 0.28, chain: 0.55, lunge: 0.4, reach: 2.2,
    hitstop: 0.045, shake: 0.1, bite: 0.8, contact: 'light', punch: 0.3, kick: 0.06, flare: 0.45,
    buffer: 0.45,
    anim: C('restlessCross', { turn: -0.25 }),
  },
  {
    // 3 tat: the step-in. Dropped low on the right, a skip in and one rising cut to high left.
    name: 'restlessRise', kind: 'light', combo: 3, damage: 38, poise: 14, heavy: false,
    windup: 0.12, active: 0.11, recovery: 0.3, chain: 0.5, lunge: 0.8, reach: 2.2,
    hitstop: 0.06, shake: 0.14, bite: 1.0, contact: 'sweep', punch: 0.45, kick: 0.09, flare: 0.55,
    buffer: 0.5,
    anim: C('restlessRise', { hop: 0.07 }),
  },
  {
    // 4 tat: the feint. The shoulder dips and the guard hand jabs (the fake), then the blade comes
    // over the left shoulder in a falling cross cut down to the right hip.
    name: 'restlessFeint', kind: 'light', combo: 4, damage: 35, poise: 13, heavy: false,
    windup: 0.2, active: 0.1, recovery: 0.24, chain: 0.25, lunge: 0.5, reach: 2.2,
    hitstop: 0.055, shake: 0.12, bite: 0.9, contact: 'light', punch: 0.4, kick: 0.08, flare: 0.5,
    anim: C('restlessFeint'),
  },
  {
    // 5 tat-tat: the burst. Two cuts in one press: up from the right knee to high left, and straight
    // back down to the right hip.
    name: 'restlessBurst', kind: 'light', combo: 5, damage: 44, poise: 15, heavy: false,
    windup: 0.09, active: 0.2, recovery: 0.22, chain: 0.25, lunge: 0.55, reach: 2.2,
    hitstop: 0.045, shake: 0.1, bite: 0.8, contact: 'light', punch: 0.3, kick: 0.06, flare: 0.45,
    hits: [
      { at: [1.0, 1.5], damage: 20, poise: 7 },
      { at: [1.5, 2.0], damage: 24, poise: 8, hitstop: 0.06, shake: 0.13, punch: 0.4, kick: 0.08, bite: 1.0 },
    ],
    branch: 4,
    anim: C('restlessBurst'),
  },
  {
    // 6 TAT: the drive. Wound back over the right shoulder with the fingers on the foe, a long step
    // through and one heavy diagonal down to the left hip; he holds it.
    name: 'restlessDrive', kind: 'light', combo: 6, damage: 94, poise: 58, heavy: true,
    windup: 0.24, active: 0.13, recovery: 0.46, chain: 0.7, lunge: 1.0, reach: 2.2,
    hitstop: 0.13, shake: 0.45, bite: 1.5, biteHold: 0.14, heft: { t: 0.1, rate: 0.3 }, flare: 1.0,
    contact: 'cleave', punch: 1.7, kick: 0.22, buffer: 0.6, branch: 0,
    anim: C('restlessDrive'),
  },
];

const swings = {
  /** Hit 1, the jab-cut: cocked beside the right shoulder (not over it), a short quick diagonal down
   *  across his chest to the left hip; the guard hand pulls in to the chin as the sword hand goes out. */
  restlessJab: {
    line: 'right',
    lF: [0.15, 0.42], rF: [-0.17, -0.4], fy: [0.2, -0.7], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.06, bz: -0.06, bx: -0.05, hip: -0.36, sy: -0.42, sx: 0.02, ...GUARD },
      { u: 1.0, h: [-0.16, 0.06, 0.2], a: [-85, 26], by: -0.08, bz: -0.05, bx: -0.04, hip: -0.28, sy: -0.36, sx: 0.06, sz: 0.04, ...GUARD },
      { u: 1.25, h: [-0.04, 0.04, 0.36], a: [-58, 20] },
      { u: 1.5, h: [0.12, -0.04, 0.46], a: [-30, 10], by: -0.18, bz: 0.08, bx: 0.01, hip: 0.14, sy: 0.0, sx: 0.28, l: [-0.08, -0.17, 0.2], lp: [0.75, -0.6, -0.25], ld: [0, 55], pn: [-0.4, 0, 0.7], lk: 0 },
      { u: 1.75, h: [0.22, -0.18, 0.42], a: [24, -12] },
      { u: 2.0, h: [0.28, -0.28, 0.32], a: [58, -26], by: -0.24, bz: 0.11, bx: 0.04, hip: 0.3, sy: 0.32, sx: 0.36, sz: -0.05, l: [0.06, -0.2, 0.18], lp: [0.75, -0.55, -0.35], ld: [20, 40], pn: [-0.5, -0.3, 0.6] },
      { u: 2.12, by: -0.26, bz: 0.12, bx: 0.05, hip: 0.4, sy: 0.44, sx: 0.4 },
      { u: 2.4, h: [0.3, -0.3, 0.2], a: [95, -22], by: -0.22, bz: 0.08, bx: 0.04, hip: 0.35, sy: 0.38, sx: 0.33, l: [0.08, -0.22, 0.16] },
    ],
  },
  /** Hit 2, the cross: from the left hip, a flat backhand at chest height round to his right, the
   *  body pivoting with it; the guard hand leaves the sword wrist and punches out to his left. */
  restlessCross: {
    line: 'flat',
    lF: [0.2, 0.34], fy: [0.6, -0.55],
    keys: [
      { u: 0.6, by: -0.18, bz: -0.06, bx: -0.05, hip: 0.44, sy: 0.52, sx: 0.22, fh: 'wrist', l: [0.08, -0.14, 0.3] },
      { u: 1.0, h: [0.34, -0.14, 0.16], a: [140, 2], by: -0.16, bz: -0.05, bx: -0.04, hip: 0.36, sy: 0.46, sx: 0.2, fh: 'wrist', l: [0.08, -0.14, 0.3], lk: 0.85 },
      { u: 1.1, l: [0.22, -0.12, 0.22], lp: [0.3, -0.8, -0.4], ld: [70, 0], pn: [0, -1, 0], lk: 0.25 },
      { u: 1.25, h: [0.26, -0.12, 0.34], a: [96, 2] },
      { u: 1.5, h: [0.08, -0.08, 0.46], a: [30, 4], by: -0.2, bz: 0.08, bx: 0.01, hip: -0.06, sy: 0.04, sx: 0.24, l: [0.36, -0.12, 0.12], lp: [0.2, -0.7, -0.7], ld: [80, 5], pn: [0, -0.3, 1], lk: 0 },
      { u: 1.75, h: [-0.16, -0.04, 0.42], a: [-34, 8] },
      { u: 2.0, h: [-0.28, 0.0, 0.26], a: [-88, 14], by: -0.19, bz: 0.1, bx: 0.04, hip: -0.34, sy: -0.36, sx: 0.14, fh: 'wing', l: [0.42, -0.16, 0.02] },
      { u: 2.15, by: -0.2, bz: 0.11, bx: 0.05, hip: -0.45, sy: -0.48, sx: 0.16 },
      { u: 2.4, h: [-0.3, 0.02, 0.1], a: [-128, 16], by: -0.16, bz: 0.08, bx: 0.04, hip: -0.41, sy: -0.44, sx: 0.12, fh: 'wing', l: [0.4, -0.18, -0.04] },
    ],
  },
  /** Hit 3, the step-in: dropped low on the right behind the knee, a skip in and a rising cut up
   *  across his front to high left; the guard hand drops back behind the hip. */
  restlessRise: {
    line: 'left',
    fy: [0.3, -0.6],
    keys: [
      { u: 0.6, by: -0.32, bz: -0.08, bx: -0.06, hip: -0.44, sy: -0.5, sx: 0.44, ...GUARD },
      { u: 1.0, h: [-0.16, -0.36, -0.12], a: [-150, -32], by: -0.28, bz: -0.06, bx: -0.05, hip: -0.36, sy: -0.44, sx: 0.38, ...GUARD },
      { u: 1.25, h: [-0.01, -0.3, 0.26], a: [-100, -26] },
      { u: 1.5, h: [0.14, -0.12, 0.46], a: [-30, -6], by: -0.15, bz: 0.09, bx: 0.01, hip: 0.14, sy: 0.02, sx: 0.24, l: [0.16, -0.34, 0.06], lp: [0.6, -0.6, -0.4], ld: [100, -50], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [0.3, 0.08, 0.38], a: [32, 22] },
      { u: 2.0, h: [0.36, 0.18, 0.22], a: [70, 42], by: -0.1, bz: 0.12, bx: 0.05, hip: 0.34, sy: 0.38, sx: 0.02, sz: -0.05, fh: 'tail', l: [0.24, -0.42, -0.3] },
      { u: 2.15, by: -0.08, bz: 0.13, bx: 0.06, hip: 0.45, sy: 0.5, sx: -0.04 },
      { u: 2.45, h: [0.38, 0.24, 0.1], a: [118, 50], by: -0.09, bz: 0.09, bx: 0.04, hip: 0.41, sy: 0.45, sx: -0.02, fh: 'tail' },
    ],
  },
  /** Hit 4, the feint: the chest dips and the guard hand jabs at the foe (the fake), then the body
   *  winds back left, the blade comes over the left shoulder, and a falling cross cut runs down
   *  across his chest to the right hip. */
  restlessFeint: {
    line: 'left',
    lF: [0.15, 0.46], rF: [-0.17, -0.44], fy: [0.15, -0.75], drag: 0.14,
    keys: [
      { u: 0.32, h: [0.24, 0.06, 0.26], a: [96, 30], by: -0.17, bz: 0.05, hip: 0.12, sy: 0.14, sx: 0.3, l: [0.02, -0.12, 0.44], lp: [0.5, -0.8, -0.2], ld: [-4, 8], pn: [-0.3, 0, 1], lk: 0, hs: 0 },
      { u: 0.68, by: -0.1, bz: -0.08, bx: -0.06, hip: 0.44, sy: 0.52, sx: -0.04, l: [0.16, -0.28, 0.1] },
      { u: 1.0, h: [0.3, 0.14, 0.1], a: [154, 42], by: -0.09, bz: -0.06, bx: -0.05, hip: 0.36, sy: 0.46, sx: 0.0, sz: -0.05, fh: 'chest', l: [-0.06, -0.2, 0.26], ld: [15, 55] },
      { u: 1.25, h: [0.24, 0.1, 0.32], a: [104, 32] },
      { u: 1.5, h: [0.1, -0.06, 0.46], a: [30, 12], by: -0.21, bz: 0.09, bx: 0.01, hip: -0.06, sy: 0.0, sx: 0.3, l: [0.22, -0.1, 0.12], lp: [0.4, -0.85, -0.3], ld: [60, 40], pn: [-0.4, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.12, -0.22, 0.4], a: [-30, -14] },
      { u: 2.0, h: [-0.24, -0.32, 0.26], a: [-70, -32], by: -0.28, bz: 0.13, bx: 0.05, hip: -0.34, sy: -0.38, sx: 0.4, sz: 0.07, fh: 'highWing', l: [0.32, 0.04, -0.2] },
      { u: 2.15, by: -0.3, bz: 0.15, bx: 0.06, hip: -0.45, sy: -0.5, sx: 0.45 },
      { u: 2.4, h: [-0.26, -0.36, 0.1], a: [-120, -24], by: -0.25, bz: 0.1, bx: 0.04, hip: -0.41, sy: -0.45, sx: 0.36, sz: 0.06, fh: 'highWing' },
    ],
  },
  /** Hit 5, the burst: two cuts in one press. From behind the right knee up across his front to high
   *  left (the first blow), the wrist turns over and the blade falls straight back down across him to
   *  the right hip (the second); the guard hand stays up through both. */
  restlessBurst: {
    line: 'spiral',
    fy: [0.35, -0.65],
    keys: [
      { u: 0.6, by: -0.3, bz: -0.08, bx: -0.06, hip: -0.42, sy: -0.48, sx: 0.4, ...GUARD },
      { u: 1.0, h: [-0.1, -0.32, 0.06], a: [-120, -24], by: -0.26, bz: -0.06, bx: -0.05, hip: -0.34, sy: -0.42, sx: 0.34, ...GUARD },
      { u: 1.28, h: [0.06, -0.16, 0.44], a: [-10, 4], by: -0.18, hip: 0.0, sy: -0.06, sx: 0.26 },
      { u: 1.5, h: [0.2, 0.08, 0.36], a: [40, 34], by: -0.14, bz: 0.08, bx: 0.02, hip: 0.2, sy: 0.24, sx: 0.16, l: [0.06, -0.18, 0.2], lp: [0.75, -0.55, -0.3], ld: [10, 50], pn: [-0.4, 0, 0.7], lk: 0 },
      { u: 1.72, h: [0.04, -0.12, 0.44], a: [-24, -6] },
      { u: 2.0, h: [-0.2, -0.3, 0.3], a: [-80, -28], by: -0.26, bz: 0.12, bx: 0.05, hip: -0.3, sy: -0.34, sx: 0.38, l: [0.2, -0.12, 0.2], lp: [0.6, -0.7, -0.35], ld: [40, 30], pn: [-0.4, -0.4, 0.6] },
      { u: 2.15, by: -0.28, bz: 0.13, bx: 0.06, hip: -0.42, sy: -0.46, sx: 0.42 },
      { u: 2.4, h: [-0.24, -0.34, 0.14], a: [-118, -24], by: -0.24, bz: 0.09, bx: 0.04, hip: -0.38, sy: -0.42, sx: 0.34, l: [0.18, -0.16, 0.18] },
    ],
  },
  /** Hit 6, the drive: gathered (the guard hand up), wound far back over the right shoulder with the
   *  sword fingers on the foe, then a long step through and one heavy diagonal from high right down
   *  across his chest past the left hip; deep in the front knee, the free arm flung back, held. */
  restlessDrive: {
    line: 'down',
    home: 0.45,
    lF: [0.16, 0.56], rF: [-0.17, -0.5], fy: [0.12, -0.78], drag: 0.12,
    keys: [
      { u: 0.3, h: [-0.1, 0.06, 0.12], a: [-120, 30], by: -0.12, hip: -0.3, sy: -0.36, sx: 0.04, ...GUARD },
      { u: 0.65, by: -0.05, bz: -0.1, bx: -0.07, hip: -0.52, sy: -0.6, sx: -0.1, l: [0.0, -0.06, 0.38], lp: [0.35, -0.9, -0.1], ld: [-6, 10], pn: [-1, 0, 0], lk: 0, hs: 1 },
      { u: 1.0, h: [-0.08, 0.22, -0.02], a: [-158, 42], by: -0.07, bz: -0.08, bx: -0.05, hip: -0.44, sy: -0.52, sx: -0.06, sz: 0.06, fh: 'aim', hs: 1 },
      { u: 1.25, h: [0.02, 0.16, 0.24], a: [-108, 34] },
      { u: 1.5, h: [0.14, -0.04, 0.48], a: [-32, 12], by: -0.26, bz: 0.12, bx: 0.01, hip: 0.18, sy: 0.0, sx: 0.36, l: [0.26, -0.06, 0.06], lp: [0.45, -0.85, -0.3], ld: [70, 15], pn: [-0.3, -1, 0], lk: 0 },
      { u: 1.75, h: [0.2, -0.2, 0.46], a: [-4, -16] },
      { u: 2.0, h: [0.2, -0.36, 0.36], a: [34, -38], by: -0.38, bz: 0.17, bx: 0.04, hip: 0.26, sy: 0.26, sx: 0.55, sz: -0.04, fh: 'highWing', l: [0.32, 0.01, -0.22] },
      { u: 2.15, by: -0.4, bz: 0.19, bx: 0.05, hip: 0.35, sy: 0.37, sx: 0.6 },
      { u: 2.45, h: [0.21, -0.37, 0.34], a: [40, -36], by: -0.37, bz: 0.16, bx: 0.04, hip: 0.31, sy: 0.32, sx: 0.55, fh: 'highWing' },
      { u: 2.6, h: [0.21, -0.37, 0.33], a: [41, -36], by: -0.37, bz: 0.16, bx: 0.04, hip: 0.31, sy: 0.32, sx: 0.55, fh: 'highWing' },
    ],
  },
};

export const restless = {
  id: 'restless',
  label: 'Restless duelist',
  blurb: 'Never still; fast pressure, steps and feints.',
  stances,
  shift: { fade: 1.7 },
  fidgets,
  chain,
  swings,
};
