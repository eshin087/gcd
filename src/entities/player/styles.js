// PROTOTYPE: three looks and feels for the hero, for the owner to pick from (`?style=a|b|c`; the
// Lab's STYLE row reloads into one). Each style is a BUILD (heroDims.js: shorter legs, broader
// shoulders), a GRIP, its own stances (at ease, the guard when locked on or in a boss fight, the
// block) and the way it cuts (styleAttack, anim.js attackPose: the body's share of every swing, the
// weight in and out of it, how long the finish is held). The swings' keys and their hit timing are
// unchanged.
//
//   A · Grounded   two hands; heavy and committed (the blade carried on the shoulder at ease, a
//                  two-handed middle guard, a hanging-guard block, the body driving every cut and
//                  the finish held)
//   B · Swift      one hand; a wuxia duelist (the blade down the arm's line and the free hand
//                  behind his back at ease, a low guard with the free hand raised in sword fingers,
//                  a braced vertical block, cuts that flow from one into the next)
//   C · Heroic     mixed: two hands in the guard and the block, one hand in the combo (at ease the
//                  sword planted before him, both hands on the pommel; a guard with the blade drawn
//                  back up and out like a wing; an overhead braced block; wide arcs)
//
// Pose space: body axes (x = his left, y up, z ahead); hand targets are offsets from each shoulder
// (anim.js).
import { DIM, STYLE_ID, BUILD } from './heroDims.js';
import { oscillate, dir, set3, onTheBelt } from './stances.js';
import { TAU } from '../../core/math.js';
import { COAT_PANELS, CAPE_SHEETS } from './gear/wanderer.js';

const ANK = DIM.ankle;
const LEFT_FROM_RIGHT = -(DIM.shoulder[0] + DIM.gripShoulder[0]); // a sword-hand offset → the same point as a free-hand offset (x)
export const STYLE_NAMES = { now: 'Today', a: 'A · Grounded', b: 'B · Swift', c: 'C · Heroic', b1: 'B1 · Loose', b2: 'B2 · Reverse', b3: 'B3 · Sheathed' };

// the build reaches the cloth too: the coat's panels shorten with the legs, the cape's roots move
// out with the shoulders (both are read when the rig is built, after this module has run)
if (BUILD) {
  for (const C of COAT_PANELS) for (let i = 0; i < 2; i++) C.len[i] *= BUILD.legScale;
  for (const S of CAPE_SHEETS) S.at[0] *= 1 + (BUILD.chest - 1) * 0.8;
}

const loose = (p, P) => {
  // the free hand open and rigid on the forearm (no wrist of its own)
  set3(p, P.lD, 0, 0, 0);
  set3(p, P.lN, 0, 0, 0);
  p[P.hs] = 0;
  p[P.lk] = 0;
};
const eyesOn = (p, P, k = 0.85) => {
  p[P.hdY] = -(p[P.pelvY] + p[P.spY]) * k;
};

// ================================================================ A · GROUNDED (two hands)
const A_STYLE = {
  /** At ease: the blade carried on the right shoulder, the flat on it and the point up behind him;
   *  the free hand hangs; a broad, settled stance. */
  ease(p, P, A) {
    const m = oscillate(A.time, 3.9);
    p[P.bodyX] = 0.012 * m.sw;
    p[P.bodyY] = -0.02 + 0.007 * m.br;
    p[P.bodyZ] = 0;
    p[P.pelvX] = 0;
    p[P.pelvY] = -0.1;
    p[P.pelvZ] = 0.018 * m.sw;
    p[P.spX] = -0.03 + 0.024 * m.br;
    p[P.spY] = 0.06;
    p[P.spZ] = 0.04 - 0.012 * m.sw;
    p[P.hdX] = 0.02 - 0.02 * m.br;
    p[P.hdY] = 0.04 + 0.16 * m.look;
    p[P.hdZ] = -0.06;
    set3(p, P.rH, 0.0 + 0.004 * m.tipB, 0.0 + 0.012 * m.brL, 0.19);
    set3(p, P.rP, -0.45, -0.9, 0.2);
    // (the blade rides the shoulder: it rises and falls a little with the breath)
    dir(p, P.swD, -173 + 1.5 * m.tipA, 34 + 1.6 * m.brL);
    set3(p, P.swF, -1, 0.2, 0);
    set3(p, P.lH, 0.035 + 0.006 * m.sw, -0.5 + 0.012 * m.brL, 0.03);
    set3(p, P.lP, 0.4, -0.2, -0.9);
    loose(p, P);
    p[P.twoHand] = 0;
    p[P.offAt] = 0;
    set3(p, P.rF, -0.16, ANK, -0.05);
    set3(p, P.lF, 0.16, ANK, 0.1);
    set3(p, P.rK, -0.4, 0.05, 1);
    set3(p, P.lK, 0.35, 0.05, 1);
    p[P.rFy] = -0.45;
    p[P.lFy] = 0.3;
    p[P.footFlat] = 0.95;
  },
  /** The guard: a two-handed middle guard, sunk and square, the point up at the foe's eyes. */
  guard(p, P, A) {
    const m = oscillate(A.time, 3.2);
    p[P.bodyX] = 0.006 * m.sw;
    p[P.bodyY] = -0.11 + 0.007 * m.br;
    p[P.bodyZ] = 0.01 * m.dr;
    p[P.pelvX] = 0.03;
    p[P.pelvY] = -0.3;
    p[P.pelvZ] = 0;
    p[P.spX] = 0.08 + 0.02 * m.br;
    p[P.spY] = 0.14;
    p[P.spZ] = 0;
    p[P.hdX] = -0.04;
    p[P.hdZ] = 0;
    eyesOn(p, P);
    set3(p, P.rH, 0.0 + 0.005 * m.tipB, -0.3 + 0.012 * m.brL, 0.27 + 0.008 * m.tipA);
    set3(p, P.rP, -0.55, -0.8, -0.15);
    set3(p, P.lP, 0.6, -0.8, -0.1);
    dir(p, P.swD, 18 + 2.2 * m.tipA, 30 + 2 * m.tipB + 1.4 * m.brL);
    set3(p, P.swF, 0.5, 0.85, 0);
    loose(p, P);
    p[P.twoHand] = 1;
    p[P.offAt] = 0;
    set3(p, P.lF, 0.15, ANK, 0.3);
    set3(p, P.rF, -0.17, ANK, -0.3);
    set3(p, P.lK, 0.3, 0, 1);
    set3(p, P.rK, -0.45, 0, 1);
    p[P.lFy] = 0.1;
    p[P.rFy] = -0.75;
    p[P.footFlat] = 0.92;
  },
  /** The block (over blockPose's body and feet): a hanging guard, both hands high by the right
   *  temple, the blade slanting down across his front to the left. */
  block(p, P, A) {
    set3(p, P.rH, 0.0, 0.1, 0.27);
    set3(p, P.rP, -0.85, -0.3, -0.3);
    set3(p, P.lP, 0.3, -0.9, -0.2);
    dir(p, P.swD, 72, -30);
    set3(p, P.swF, -0.3, 0.3, 1);
    p[P.twoHand] = 1;
    p[P.offAt] = 0;
    p[P.hs] = 0;
  },
  run: { h: [-0.02, -0.3, 0.26], p: [-0.5, -0.8, -0.2], d: [18, 26], f: [0.5, 0.85, 0] },
  atk: { two: 1, body: 1.6, dip: 0.05, lunge: 0.06, lean: 0.09, antic: 1, home: 0.55, arc: 1 },
};

// ================================================================ B · SWIFT (one hand)
const B_STYLE = {
  /** At ease: the blade down the arm's own line (the at-ease stance the owner picked), the free
   *  hand behind the small of his back. */
  ease(p, P, A, base) {
    base(p, P, A);
    const m = oscillate(A.time, 3.7);
    set3(p, P.lH, -0.13 + 0.004 * m.sw, -0.34 + 0.008 * m.brL, -0.17);
    set3(p, P.lP, 0.85, -0.3, 0.1);
    set3(p, P.lD, -0.9, -0.3, 0); // the back of the hand on his back, the fingers across it
    set3(p, P.lN, 0, 0, -1);
    p[P.hs] = 0;
    p[P.lk] = 0;
    p[P.twoHand] = 0;
    p[P.spX] -= 0.02; // the chest a little prouder
  },
  /** The guard: side-on, the sword side to the foe, the blade low with its point at the foe's knees,
   *  the free hand raised beside his head in sword fingers, pointing the way. */
  guard(p, P, A) {
    const m = oscillate(A.time, 3.0);
    p[P.bodyX] = -0.01 * m.sw;
    p[P.bodyY] = -0.1 + 0.006 * m.br;
    p[P.bodyZ] = 0.012 * m.dr;
    p[P.pelvX] = 0;
    p[P.pelvY] = 0.32;
    p[P.pelvZ] = 0.02;
    p[P.spX] = 0.04 + 0.02 * m.br;
    p[P.spY] = 0.18;
    p[P.spZ] = -0.02;
    p[P.hdX] = 0.02;
    p[P.hdZ] = 0.02;
    eyesOn(p, P);
    set3(p, P.rH, -0.06 + 0.005 * m.tipB, -0.33 + 0.012 * m.brL, 0.34 + 0.008 * m.tipA);
    set3(p, P.rP, 0.05, -0.9, -0.45);
    dir(p, P.swD, -32 + 2.4 * m.tipA, -20 + 2.2 * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.25, 1, 0);
    set3(p, P.lH, 0.08 + 0.006 * m.tipA, 0.36 + 0.012 * m.brL, -0.04);
    set3(p, P.lP, 0.85, 0.1, -0.4);
    dir(p, P.lD, 12, 38);
    set3(p, P.lN, -0.3, -0.5, 0.8);
    p[P.hs] = 1;
    p[P.lk] = 0;
    p[P.twoHand] = 0;
    p[P.offAt] = 0;
    set3(p, P.rF, -0.1, ANK, 0.3);
    set3(p, P.lF, 0.13, ANK, -0.26);
    set3(p, P.rK, -0.3, 0, 1);
    set3(p, P.lK, 0.75, 0, 0.65);
    p[P.rFy] = -0.1;
    p[P.lFy] = 0.9;
    p[P.footFlat] = 0.94;
  },
  /** The block: the blade upright before his chest, the free palm braced on the flat. */
  block(p, P, A) {
    // (beside his head, not before his face: upright in front of the chest it hid the face)
    set3(p, P.rH, -0.12, -0.15, 0.3);
    set3(p, P.rP, -0.7, -0.7, -0.1);
    set3(p, P.lP, 0.7, -0.7, 0.1);
    dir(p, P.swD, -18, 70);
    set3(p, P.swF, 0, 0.15, 1);
    p[P.twoHand] = 1;
    p[P.offAt] = 0.42;
    p[P.hs] = 0;
  },
  run: { h: [-0.06, -0.33, 0.3], p: [0.05, -0.9, -0.45], d: [-32, -18], f: [0.25, 1, 0] },
  atk: { two: 0, body: 1.3, dip: 0.025, lunge: 0.05, lean: 0.05, antic: 0.6, home: 0.22, arc: 1.04 },
};

// ================================================================ C · HEROIC (mixed grip)
const C_STYLE = {
  /** At ease: the sword planted point-down at his right side, the hand resting on its pommel, the
   *  other on his belt; chest up, the weight settled (a hero's rest). */
  ease(p, P, A, base) {
    base(p, P, A);
    const m = oscillate(A.time, 4.1);
    p[P.bodyX] = 0.01 * m.sw;
    p[P.pelvY] = -0.06;
    p[P.spY] = 0.06;
    p[P.spX] = -0.04 + 0.022 * m.br;
    p[P.hdX] = 0.0 - 0.02 * m.br;
    set3(p, P.rH, -0.1, -0.36 + 0.006 * m.brL, 0.2);
    set3(p, P.rP, 0.2, -0.6, -0.8);
    set3(p, P.swD, -0.05, -1, 0.06);
    set3(p, P.swF, 0, 0.1, 1);
    set3(p, P.rF, -0.17, ANK, -0.02);
    set3(p, P.lF, 0.16, ANK, 0.06);
    p[P.rFy] = -0.5;
    p[P.lFy] = 0.35;
  },
  /** The guard: wide and deep, coiled, both hands before the right chest and the blade drawn back
   *  up and out to his right like a wing, ready to come round. */
  guard(p, P, A) {
    const m = oscillate(A.time, 3.0);
    p[P.bodyX] = 0.008 * m.sw;
    p[P.bodyY] = -0.15 + 0.007 * m.br;
    p[P.bodyZ] = 0.012 * m.dr;
    p[P.pelvX] = 0.03;
    p[P.pelvY] = -0.38;
    p[P.pelvZ] = 0;
    p[P.spX] = 0.1 + 0.02 * m.br;
    p[P.spY] = -0.1;
    p[P.spZ] = 0.02;
    p[P.hdX] = -0.05;
    p[P.hdZ] = 0;
    eyesOn(p, P, 0.9);
    set3(p, P.rH, -0.12 + 0.005 * m.tipB, -0.16 + 0.012 * m.brL, 0.2 + 0.008 * m.tipA);
    set3(p, P.rP, -0.9, -0.35, -0.25);
    set3(p, P.lP, 0.5, -0.85, 0.1);
    dir(p, P.swD, -95 + 2.4 * m.tipA, 42 + 2 * m.tipB + 1.4 * m.brL);
    set3(p, P.swF, 0, 0.3, -1);
    loose(p, P);
    p[P.twoHand] = 1;
    p[P.offAt] = 0;
    set3(p, P.lF, 0.17, ANK, 0.36);
    set3(p, P.rF, -0.2, ANK, -0.34);
    set3(p, P.lK, 0.35, 0, 1);
    set3(p, P.rK, -0.5, 0, 1);
    p[P.lFy] = 0.15;
    p[P.rFy] = -0.85;
    p[P.footFlat] = 0.92;
  },
  /** The block: the blade level above his brow, the free palm braced under it half way along. */
  block(p, P, A) {
    set3(p, P.rH, 0.0, 0.3, 0.27);
    set3(p, P.rP, -0.85, 0.1, -0.3);
    set3(p, P.lP, 0.85, 0.1, -0.3);
    dir(p, P.swD, 88, 6);
    set3(p, P.swF, 0, 1, 0.3);
    p[P.twoHand] = 1;
    p[P.offAt] = 0.48;
    p[P.hs] = 0;
  },
  run: { h: [-0.12, -0.2, 0.2], p: [-0.9, -0.35, -0.25], d: [-95, 38], f: [0, 0.3, -1] },
  atk: { two: 0, body: 1.75, dip: 0.04, lunge: 0.05, lean: 0.1, antic: 1, home: 0.4, arc: 1.12 },
};

// ================================================================ B's three takes (round 2)
// The owner liked B but wanted him "chill, cool, and great idle animations, poses, motions". From
// how games build idles (layered motion driven from the hips, contrapposto and asymmetry, slow
// breathing, stillness with rare deliberate moves rather than constant drift, idle breaks every
// several seconds at most, a readable silhouette, real transitions into and out of the fight),
// three at-ease takes on B, sharing one livelier guard, rarer signature idle breaks and the
// transitions:
//   B1 · Loose     contrapposto, the hip cocked over the sword leg, the blade dangling from a loose
//                  hand with its point resting in the grass, a thumb in the belt
//   B2 · Reverse   the jian held reversed, the blade lying up along the back of the arm, the free
//                  hand loose in sword fingers; it flips to a forward grip as he takes his guard
//   B3 · Sheathed  the sword in a scabbard at his left hip, the free hand resting on it; he draws
//                  into his guard and sheathes again when the fight is over (anim.js: the draw)
const regrip = (t, period, dur) => {
  // a bump 0 → 1 → 0 for `dur` s once every `period` s
  const u = (((t % period) + period) % period) / dur;
  return u < 1 ? Math.sin(Math.PI * u) ** 2 : 0;
};
/** B's guard, alive: a combat breath (2.4 s), the weight rocking on the balls of the feet, the arms
 *  a beat behind it, the point drawing a slow small circle on the foe, a re-grip every few seconds. */
function bGuardAlive(p, P, A) {
  B_STYLE.guard(p, P, A);
  const t = A.time, br = Math.sin((t * TAU) / 2.4);
  const rock = Math.sin((t * TAU) / 1.9), rockL = Math.sin((t * TAU) / 1.9 - 0.8);
  const c = (t * TAU) / 3.3;
  p[P.bodyZ] += 0.016 * rock;
  p[P.bodyY] += 0.006 * br - 0.005 * Math.abs(rock);
  p[P.spX] += 0.012 * br + 0.01 * rockL;
  p[P.rH] += 0.008 * Math.cos(c);
  p[P.rH + 1] += 0.008 * Math.sin(c) + 0.006 * rockL;
  dir(p, P.swD, -32 + 3.5 * Math.cos(c - 0.5), -20 + 3 * Math.sin(c - 0.5));
  const g = regrip(t, 5.3, 0.4);
  if (g > 0) set3(p, P.swF, 0.25 + 0.7 * g, 1 - 0.6 * g, 0);
  p[P.lH + 1] += 0.012 * br;
}
const B_LIFE = { after: 6, gap: [9, 18] };

/** B1 · Loose: the weight on the sword leg, the hip cocked out over it and the shoulders tilted
 *  against it; the blade hangs from a loose hand with its point resting in the grass behind his
 *  heel; a thumb hooked in the belt; the head tipped, looking off. It sways slowly over the weight
 *  leg and the hanging blade follows a beat behind, like a pendulum. */
function b1Ease(p, P, A) {
  const m = oscillate(A.time, 4.4);
  const sway = Math.sin((A.time * TAU) / 9.7 + 0.5), swayL = Math.sin((A.time * TAU) / 9.7 - 0.3);
  p[P.bodyX] = -0.05 - 0.012 * sway;
  p[P.bodyY] = -0.018 + 0.006 * m.br;
  p[P.bodyZ] = -0.01;
  p[P.pelvX] = 0.02;
  p[P.pelvY] = -0.2;
  p[P.pelvZ] = -0.09 - 0.012 * sway;
  p[P.spX] = -0.055 + 0.02 * m.br;
  p[P.spY] = 0.14;
  p[P.spZ] = 0.1 + 0.012 * sway;
  p[P.hdX] = 0.05 - 0.015 * m.br;
  p[P.hdY] = 0.24 + 0.2 * m.look;
  p[P.hdZ] = -0.09;
  set3(p, P.rH, -0.215 + 0.006 * m.tipB, -0.45 + 0.01 * m.brL, -0.03);
  set3(p, P.rP, 0.4, -0.3, -0.85);
  dir(p, P.swD, -165 + 6 * swayL + 2 * m.tipA, -70 + 2 * m.tipB);
  set3(p, P.swF, -0.7, 0, 0.7);
  onTheBelt(p, P, m, p[P.pelvY] + p[P.spY]);
  set3(p, P.rF, -0.12, DIM.ankle, -0.05);
  set3(p, P.lF, 0.19, DIM.ankle, 0.12);
  set3(p, P.rK, -0.3, 0.05, 1);
  set3(p, P.lK, 0.6, 0.05, 1);
  p[P.rFy] = -0.35;
  p[P.lFy] = 0.55;
  p[P.footFlat] = 0.95;
}

/** B2 · Reverse: the weight on the free leg this time (the mirror contrapposto), the sword hand
 *  relaxed at the hip with the jian reversed, its blade lying up along the back of the arm past the
 *  shoulder; the free hand hangs loose in sword fingers. Returns 1: the reversed grip (anim.js opens
 *  the wrist's range for it). */
function b2Ease(p, P, A) {
  const m = oscillate(A.time, 4.2);
  const sway = Math.sin((A.time * TAU) / 10.3 + 1.7);
  p[P.bodyX] = 0.045 + 0.012 * sway;
  p[P.bodyY] = -0.016 + 0.006 * m.br;
  p[P.bodyZ] = -0.008;
  p[P.pelvX] = 0.02;
  p[P.pelvY] = 0.06;
  p[P.pelvZ] = 0.085 + 0.012 * sway;
  p[P.spX] = -0.04 + 0.02 * m.br;
  p[P.spY] = -0.1;
  p[P.spZ] = -0.09 - 0.012 * sway;
  p[P.hdX] = 0.04 - 0.015 * m.br;
  p[P.hdY] = -0.12 + 0.2 * m.look;
  p[P.hdZ] = 0.07;
  set3(p, P.rH, -0.15 + 0.004 * m.tipB, -0.44 + 0.008 * m.brL, -0.035);
  set3(p, P.rP, 0.35, -0.2, -0.9);
  dir(p, P.swD, -160 + 1.5 * m.tipA, 68 + 1.5 * m.tipB);
  set3(p, P.swF, 0.6, 0, 0.8);
  set3(p, P.lH, 0.035 + 0.004 * m.sw, -0.49 + 0.01 * m.brL, 0.07);
  set3(p, P.lP, 0.5, -0.2, -0.85);
  dir(p, P.lD, 6, -72);
  set3(p, P.lN, -0.6, 0, 0.8);
  p[P.hs] = 1;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.lF, 0.12, DIM.ankle, -0.04);
  set3(p, P.rF, -0.19, DIM.ankle, 0.12);
  set3(p, P.lK, 0.3, 0.05, 1);
  set3(p, P.rK, -0.6, 0.05, 1);
  p[P.lFy] = 0.35;
  p[P.rFy] = -0.55;
  p[P.footFlat] = 0.95;
  return 1;
}

/** B3 · Sheathed (round 3, the owner: "the sheathe looks promising but the sheathe placement is too
 *  close to the character ... dont have it sheathe back in right away ... after like 20 secsonds of no
 *  attack ... when the sword is out have it look like the original pose/angle ... the guard angle
 *  looks really bad ... i also want the sheathe cover to be a bit glowly/epic"). The sword rests in a
 *  scabbard hung out from his left hip; drawn, he stands in the at-ease pose he picked before
 *  (stances.js atEase) with the free hand on the scabbard; it goes back in after 20 s without a
 *  swing or a block (anim.js). Its guard and the scabbard's glow are options (`?guard=1|2|3`,
 *  `?sheath=cyan|violet|gold`). */
const PARAM = (k, ok, d) => {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get(k);
    return ok.includes(v) ? v : d;
  } catch {
    return d;
  }
};
export const SHEATH_LOOK = PARAM('sheath', ['cyan', 'violet', 'gold'], 'cyan');
export const GUARD_ID = PARAM('guard', ['1', '2', '3'], '1');
// the scabbard (pelvis space): its mouth out from the left hip at the belt, its axis back, down and a
// little out, clear of the thigh and the coat's side panel; hung from the belt by a hanger
// (round 3: at 0.24 out it sat 3 cm off the thigh standing and cut 6 cm into it in a lunge)
export const SCABBARD = { at: [0.29, 0.06, 0.12], axis: [0.44, -0.36, -0.82], len: 0.86, r: [0.046, 0.03] };
/** The sheathed at-ease pose: an easy contrapposto, the sword hand loose at his side, the free hand
 *  resting on the scabbard by its mouth (anim.js holds it there: the sheath's `lf`). */
function b3Sheathed(p, P, A) {
  const m = oscillate(A.time, 4.3);
  const sway = Math.sin((A.time * TAU) / 9.1 + 0.2);
  p[P.bodyX] = -0.035 - 0.01 * sway;
  p[P.bodyY] = -0.016 + 0.006 * m.br;
  p[P.bodyZ] = -0.008;
  p[P.pelvX] = 0.02;
  p[P.pelvY] = -0.14;
  p[P.pelvZ] = -0.06 - 0.01 * sway;
  p[P.spX] = -0.04 + 0.02 * m.br;
  p[P.spY] = 0.08;
  p[P.spZ] = 0.07 + 0.01 * sway;
  p[P.hdX] = 0.04 - 0.015 * m.br;
  p[P.hdY] = 0.16 + 0.2 * m.look;
  p[P.hdZ] = -0.06;
  // the sword hand loose at his side, the elbow soft
  set3(p, P.rH, -0.205 + 0.004 * m.sw, -0.465 + 0.01 * m.brL, 0.035);
  set3(p, P.rP, 0.45, -0.25, -0.85);
  // (the blade sits in the scabbard; the pose's direction follows its line, so a blend out of it
  // never swings through his legs)
  set3(p, P.swD, SCABBARD.axis[0], SCABBARD.axis[1], SCABBARD.axis[2]);
  set3(p, P.swF, 1, 0, 0);
  b3FreeOnScabbard(p, P, m);
  set3(p, P.rF, -0.12, DIM.ankle, -0.04);
  set3(p, P.lF, 0.17, DIM.ankle, 0.1);
  set3(p, P.rK, -0.3, 0.05, 1);
  set3(p, P.lK, 0.5, 0.05, 1);
  p[P.rFy] = -0.35;
  p[P.lFy] = 0.45;
  p[P.footFlat] = 0.95;
}
/** The free hand resting on the scabbard by its mouth (its target is the scabbard itself: anim.js
 *  apply(), the sheath's `lf`): the palm on it, the fingers down round it, the thumb to the guard. */
function b3FreeOnScabbard(p, P, m) {
  set3(p, P.lH, 0.03, -0.46 + 0.006 * (m?.brL ?? 0), 0.14);
  // (the elbow back, not out: out to the side it flared 30°; the hand rigid on the forearm: turned
  // to wrap the scabbard the wrist bent 60°)
  set3(p, P.lP, 0.35, -0.45, -0.82);
  set3(p, P.lD, 0, 0, 0);
  set3(p, P.lN, 0, 0, 0);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}
/** Drawn, at ease: the at-ease stance he picked (stances.js atEase: the blade down the arm's own
 *  line), the free hand on the scabbard instead of the belt. */
function b3Drawn(p, P, A, base) {
  base(p, P, A);
  b3FreeOnScabbard(p, P, oscillate(A.time, 3.7));
}

/** The guard's life (all three options): a combat breath, the weight rocking on the balls of the
 *  feet, the arms a beat behind, the point drawing a slow small circle on the foe. */
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
const B3_GUARDS = {
  /** 1 · LOW, ONE HAND: the sword hand before the right hip, the elbow down by the ribs, the blade
   *  straight off the forearm with its point low at the foe; the free hand on the scabbard. */
  1: {
    pose(p, P, A) {
      squareStance(p, P, A, 0.1);
      set3(p, P.rH, -0.03, -0.4, 0.27);
      set3(p, P.rP, 0.15, -0.9, -0.4);
      set3(p, P.swF, 0.3, 1, 0);
      b3FreeOnScabbard(p, P, null);
      guardLife(p, P, A, -8, -18);
    },
    run: { h: [-0.03, -0.38, 0.27], p: [0.15, -0.9, -0.4], d: [-8, -15], f: [0.3, 1, 0] },
    lf: 1,
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
      p[P.twoHand] = 1;
      p[P.offAt] = 0;
      p[P.hs] = 0;
      p[P.lk] = 0;
      guardLife(p, P, A, 3, 22);
    },
    run: { h: [0.1, -0.35, 0.3], p: [-0.35, -0.85, -0.25], d: [3, 18], f: [0.6, 0.8, 0] },
    lf: 0,
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
      p[P.twoHand] = 1;
      p[P.offAt] = 0;
      p[P.hs] = 0;
      p[P.lk] = 0;
      guardLife(p, P, A, 0, -22);
    },
    run: { h: [0.1, -0.42, 0.26], p: [-0.3, -0.85, -0.3], d: [0, -18], f: [0.6, 0.8, 0] },
    lf: 0,
  },
};
const B3G = B3_GUARDS[GUARD_ID];
const bTake = (ease, extra) => ({ ...B_STYLE, ease, guard: bGuardAlive, life: B_LIFE, ...extra });
const B1_STYLE = bTake(b1Ease, { trans: 'twirl', fidgets: ['look', 'stretch', 'flick', 'twirl', 'inspect'] });
const B2_STYLE = bTake(b2Ease, { trans: 'twirl', fidgets: ['look', 'stretch', 'flick', 'twirl'] });
const B3_STYLE = {
  ...B_STYLE,
  // drawn: the picked at-ease pose (base = stances.js atEase); sheathed: b3Sheathed (anim.js stand()
  // blends the two by the sheath)
  ease: b3Drawn,
  sheathedEase: b3Sheathed,
  guard: B3G.pose,
  block: null, // (the cross ward every style shares: the owner flagged the braced upright one)
  run: B3G.run,
  guardLf: B3G.lf,
  life: B_LIFE,
  trans: 'draw',
  sheath: true,
  sheatheAfter: 20, // s without a swing, a block or a fight before he sheathes the sword
  fidgets: ['look', 'stretch', 'flick', 'twirl', 'inspect'], // drawn
  fidgetsSheathed: ['look', 'stretch', 'hilt'],
};

const STYLES = { a: A_STYLE, b: B_STYLE, c: C_STYLE, b1: B1_STYLE, b2: B2_STYLE, b3: B3_STYLE };
/** The style on trial (null: today's hero). Its run carry's blade direction as a unit vector. */
export const STYLE = STYLE_ID ? STYLES[STYLE_ID] : null;
if (STYLE) {
  const d = [0, 0, 0];
  dir(d, 0, STYLE.run.d[0], STYLE.run.d[1]);
  STYLE.run.dv = d;
  STYLE.id = STYLE_ID;
}
