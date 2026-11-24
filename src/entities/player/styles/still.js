// STILL: the still, deadly master. Almost motionless; everything he does is small, late and exact,
// and the stillness is the threat. His sword is drawn and resting (not the Sheathed's draw).
//   STANDING  long dwells, slow fades; the breath, the eyes and the point are the only motion.
//   IDLE      a turn of the grip in the fingers, a long breath out with the head bowed, one sharp
//             flick to clean the blade (chiburi) and then nothing.
//   COMBO     few hits, each sudden: almost no windup, a hard stop, a held finish.
// The contract: styles/index.js. Guides: styles/STANCES.md, styles/COMBOS.md.
import { P, ANK, set3, dir, add3, dirNudge, kf, hump, handLoose, standLife, STAND_LIFE } from '../poseKit.js';

// his own slow life: a long breath, the weight settling slowly, a gaze that hardly wanders
const LIFE = { ...STAND_LIFE, breath: [4.9, 4.3], settle: 11.3, drift: 17.9, look: [13.7, 7.9], point: [6.1, 8.3], arms: 1.1 };
const lifeOf = (A, i) => standLife(A.time, LIFE.breath[i], LIFE);

// ================================================================ AT EASE
/** PLANTED: tall and square, the chin up; the sword arm long down his side and the blade carrying
 *  on down its line, the point resting low ahead of the right foot; the free arm hangs long. */
function planted(p, P, A) {
  const m = lifeOf(A, 0);
  p[P.bodyX] = -0.015 - 0.01 * m.sw;
  p[P.bodyY] = -0.006 + 0.006 * m.br;
  p[P.bodyZ] = -0.004;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.12;
  p[P.pelvZ] = -0.03 - 0.01 * m.sw;
  p[P.spX] = -0.045 + 0.022 * m.br; // the chest open and tall; it fills with the breath
  p[P.spY] = 0.06;
  p[P.spZ] = 0.02 + 0.008 * m.sw;
  p[P.hdX] = -0.07 - 0.012 * m.br; // the chin up
  p[P.hdY] = 0.06 + 0.07 * m.look;
  p[P.hdZ] = 0;
  set3(p, P.rH, -0.19 + 0.004 * m.tipB, -0.5 + 0.008 * m.brL, 0.07 + 0.006 * m.tipA);
  set3(p, P.rP, 0.5, -0.3, -0.8);
  dir(p, P.swD, -34 + 1.5 * m.tipA, -60 + 1.2 * m.tipB + 0.6 * m.brL);
  set3(p, P.swF, 0.82, 0, 0.57); // square to the blade's heading: broad to the camera all round
  handLoose(p, m, { out: 0.012, fwd: 0.01, swing: 0.6 });
  set3(p, P.rF, -0.13, ANK, -0.02);
  set3(p, P.lF, 0.12, ANK, 0.06);
  set3(p, P.rK, -0.35, 0.05, 1);
  set3(p, P.lK, 0.3, 0.05, 1);
  p[P.rFy] = -0.35;
  p[P.lFy] = 0.2;
  p[P.footFlat] = 0.95;
}

/** CARRIED: the sword side a little forward, the blade carried low along his right side with the
 *  point down at the grass ahead, the flat up; the head a little bowed, the eyes low; the free arm
 *  hangs a little behind the thigh. */
function carried(p, P, A) {
  const m = lifeOf(A, 0);
  p[P.bodyX] = 0.02 + 0.01 * m.sw; // the weight over the rear (left) leg
  p[P.bodyY] = -0.018 + 0.006 * m.br;
  p[P.bodyZ] = -0.01;
  p[P.pelvX] = 0;
  p[P.pelvY] = 0.1; // the right hip a little forward
  p[P.pelvZ] = 0.035 + 0.01 * m.sw;
  p[P.spX] = 0.02 + 0.02 * m.br;
  p[P.spY] = 0.04;
  p[P.spZ] = -0.03;
  p[P.hdX] = 0.13 - 0.01 * m.br; // bowed a little: the eyes on the ground ahead
  p[P.hdY] = -0.08 + 0.06 * m.look;
  p[P.hdZ] = 0.02;
  set3(p, P.rH, -0.1 + 0.004 * m.tipB, -0.4 + 0.008 * m.brL, 0.2 + 0.006 * m.tipA);
  set3(p, P.rP, 0.3, -0.85, -0.4);
  dir(p, P.swD, -27 + 1.6 * m.tipA, -31 + 1.2 * m.tipB + 0.6 * m.brL);
  set3(p, P.swF, 0.75, -0.66, -0.06); // (the broadest the drawn flat gets to the camera all round)
  handLoose(p, m, { out: 0.02, fwd: -0.07, swing: 0.7 });
  set3(p, P.rF, -0.12, ANK, 0.1);
  set3(p, P.lF, 0.13, ANK, -0.09);
  set3(p, P.rK, -0.25, 0.05, 1);
  set3(p, P.lK, 0.5, 0.05, 1);
  p[P.rFy] = -0.2;
  p[P.lFy] = 0.5;
  p[P.footFlat] = 0.95;
}

/** LEVEL: square and easy, the weight on the left leg; the sword hand at his right hip and the blade
 *  laid out nearly level, out to his right front, light in the fingers, the flat up; the free hand hangs a little out and
 *  forward, open; the head turned out over the field. */
function level(p, P, A) {
  const m = lifeOf(A, 1);
  p[P.bodyX] = 0.025 + 0.01 * m.sw;
  p[P.bodyY] = -0.015 + 0.006 * m.br;
  p[P.bodyZ] = -0.005;
  p[P.pelvX] = 0;
  p[P.pelvY] = 0.06;
  p[P.pelvZ] = 0.03 + 0.01 * m.sw; // the weight hip rides higher
  p[P.spX] = -0.01 + 0.02 * m.br;
  p[P.spY] = -0.02;
  p[P.spZ] = -0.02;
  p[P.hdX] = 0.0 - 0.01 * m.br;
  p[P.hdY] = 0.28 + 0.08 * m.look; // the eyes out over the field
  p[P.hdZ] = -0.02;
  set3(p, P.rH, -0.16 + 0.003 * m.tipB, -0.32 + 0.008 * m.brL, 0.26);
  set3(p, P.rP, 0.6, -0.7, -0.3); // the elbow in by the ribs: the forearm and the blade open out to his right
  dir(p, P.swD, -41 + 1.6 * m.tipA, -15 + 1.2 * m.tipB + 0.5 * m.brL);
  set3(p, P.swF, 0.1, 1, 0.1);
  handLoose(p, m, { out: 0.04, fwd: 0.09, swing: 0.8 });
  set3(p, P.lN, -0.4, 0, 0.6); // the palm turned a little forward
  set3(p, P.rF, -0.14, ANK, 0.03);
  set3(p, P.lF, 0.12, ANK, -0.04);
  set3(p, P.rK, -0.3, 0.05, 1);
  set3(p, P.lK, 0.35, 0.05, 1);
  p[P.rFy] = -0.25;
  p[P.lFy] = 0.35;
  p[P.footFlat] = 0.95;
}

// ================================================================ FIGHT
/** LOW POINT: side-on, the sword foot forward, the blade straight off a long arm with its point low
 *  at the foe's knee; the free hand open and low before him, palm down. Nothing moves but the tip. */
function lowPoint(p, P, A) {
  const m = lifeOf(A, 1);
  p[P.bodyX] = 0.0 - 0.008 * m.sw;
  p[P.bodyY] = -0.07 + 0.005 * m.br; // the knees soft
  p[P.bodyZ] = 0.005 * m.dr;
  p[P.pelvX] = 0;
  p[P.pelvY] = 0.28; // the sword side to the foe
  p[P.pelvZ] = 0.02;
  p[P.spX] = 0.04 + 0.015 * m.br;
  p[P.spY] = 0.2;
  p[P.spZ] = -0.02;
  p[P.hdX] = 0.05;
  p[P.hdY] = -0.42; // the eyes on the foe over the sword shoulder
  p[P.hdZ] = 0.02;
  set3(p, P.rH, -0.1 + 0.003 * m.tipB, -0.36 + 0.008 * m.brL, 0.34 + 0.004 * m.tipA);
  set3(p, P.rP, 0.06, -0.9, -0.45);
  dir(p, P.swD, -12 + 1.6 * m.tipA, -24 + 1.4 * m.tipB);
  set3(p, P.swF, 0.2, 1, 0.3);
  set3(p, P.lH, 0.02, -0.36 + 0.008 * m.brL, 0.3);
  set3(p, P.lP, 0.45, -0.85, -0.2);
  set3(p, P.lD, -0.15, -0.25, 0.9);
  set3(p, P.lN, 0, -1, 0);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, -0.1, ANK, 0.26);
  set3(p, P.lF, 0.11, ANK, -0.22);
  set3(p, P.rK, -0.4, 0, 1);
  set3(p, P.lK, 0.75, 0, 0.65);
  p[P.rFy] = -0.45;
  p[P.lFy] = 0.95;
  p[P.footFlat] = 0.95;
}

/** HIGH POINT: the sword hand high beside the right temple, the blade straight off the forearm with
 *  the point dropped at the foe's eyes; the free hand's sword fingers low before him. Only the tip
 *  moves. */
function highPoint(p, P, A) {
  const m = lifeOf(A, 1);
  p[P.bodyX] = 0.0;
  p[P.bodyY] = -0.06 + 0.005 * m.br;
  p[P.bodyZ] = 0.006 * m.dr;
  p[P.pelvX] = 0;
  p[P.pelvY] = 0.22;
  p[P.pelvZ] = 0.02;
  p[P.spX] = 0.01 + 0.015 * m.br;
  p[P.spY] = 0.18;
  p[P.spZ] = -0.02;
  p[P.hdX] = 0.04;
  p[P.hdY] = -0.36;
  p[P.hdZ] = 0.02;
  set3(p, P.rH, -0.1, -0.08 + 0.006 * m.brL, 0.46); // the arm out before the shoulder, the elbow dropped under it
  set3(p, P.rP, -0.5, -0.85, 0);
  dir(p, P.swD, 5 + 1.8 * m.tipA, 13 + 1.6 * m.tipB); // the point up a little: a tall foe's eyes
  set3(p, P.swF, -0.02, 0.97, -0.22);
  set3(p, P.lH, 0.05, -0.42 + 0.008 * m.brL, 0.2);
  set3(p, P.lP, 0.45, -0.3, -0.8);
  set3(p, P.lD, 0.0, -0.45, 0.85);
  set3(p, P.lN, -0.35, -0.6, -0.72);
  p[P.hs] = 1;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, -0.1, ANK, 0.24);
  set3(p, P.lF, 0.11, ANK, -0.2);
  set3(p, P.rK, -0.4, 0, 1);
  set3(p, P.lK, 0.75, 0, 0.65);
  p[P.rFy] = -0.45;
  p[P.lFy] = 0.95;
  p[P.footFlat] = 0.95;
}

// ================================================================ IDLE
const FIDGETS = [
  {
    // the grip turns in the fingers: the blade rolls a quarter over and back, the eyes on it
    name: 'still.grip', dur: 3.6, sets: ['ease'],
    fn(p, A, u, e) {
      const b = hump(u, 0.12, 0.42, 0.62, 0.92);
      dirNudge(p, P.swD, 10 * b, 6 * b, e);
      add3(p, P.swF, 0.5 * b, 0, -0.5 * b, e);
      add3(p, P.rH, 0, 0.015 * b, 0.02 * b, e);
      p[P.hdX] += 0.1 * b * e;
      p[P.hdY] -= 0.12 * b * e;
    },
  },
  {
    // the head bows and one long breath goes out: the shoulders and the hands sink with it
    name: 'still.breath', dur: 4.6, sets: ['ease', 'fight'],
    fn(p, A, u, e) {
      const inh = kf(u, [0.05, 0, 0.3, 1, 0.42, 1, 0.85, 0]);
      const bow = hump(u, 0.25, 0.5, 0.75, 0.97);
      p[P.spX] += (-0.03 * inh + 0.05 * bow) * e;
      p[P.bodyY] += (0.008 * inh - 0.012 * bow) * e;
      p[P.hdX] += 0.2 * bow * e;
      add3(p, P.rH, 0, 0.012 * inh - 0.015 * bow, 0, e);
      add3(p, P.lH, 0, 0.012 * inh - 0.015 * bow, 0, e);
    },
  },
  {
    // chiburi: the hand rises a little, ONE sharp flick out and down to clean the blade, then
    // nothing: he holds it there, and only then lets it settle back
    name: 'still.chiburi', dur: 3.4, sets: ['ease'],
    fn(p, A, u, e) {
      const lift = kf(u, [0.08, 0, 0.26, 1, 0.3, 1, 0.36, 0]);
      const flick = kf(u, [0.28, 0, 0.36, 1, 0.78, 1, 0.97, 0]);
      dirNudge(p, P.swD, 8 * lift - 22 * flick, 14 * lift - 6 * flick, e);
      add3(p, P.rH, -0.03 * flick, 0.04 * lift + 0.01 * flick, 0.04 * lift - 0.02 * flick, e);
      p[P.hdX] += 0.08 * lift * e;
    },
  },
  {
    // the eyes go slowly over his shoulder and come back: the body does not follow
    name: 'still.gaze', dur: 5.2, sets: ['ease', 'fight'],
    fn(p, A, u, e) {
      const g = hump(u, 0.1, 0.4, 0.62, 0.94);
      p[P.hdY] += 0.5 * g * e;
      p[P.hdX] -= 0.03 * g * e;
      p[P.spY] += 0.04 * g * e;
    },
  },
];

const EASE = [
  { id: 'still.planted', fn: planted, w: 1.2, dwell: [10, 16] },
  { id: 'still.carried', fn: carried, w: 1, dwell: [8, 14] },
  { id: 'still.level', fn: level, w: 1, dwell: [9, 15] },
];
const FIGHT = [
  { id: 'still.low', fn: lowPoint, w: 1, dwell: [8, 14] },
  { id: 'still.high', fn: highPoint, w: 1, dwell: [7, 12] },
];

export const still = {
  id: 'still', label: 'Still master', blurb: 'Calm and still; sudden sharp cuts, held poses.',
  stances: { ease: EASE, fight: FIGHT }, shift: { fade: 3.2 },
  fidgets: FIDGETS, chain: null, swings: {},
};
