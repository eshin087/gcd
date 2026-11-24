// SHOWY, the showy acrobat: a performer who knows he is being watched. Flourishes everywhere, but
// every one lands in a clean pose. The contract: styles/index.js; the guides: STANCES.md, COMBOS.md.
//
// (The task's sketch asked for reverse grips and the sword laid over the shoulders. The rig holds the
// blade on the forearm's line (the wrist kink is bounded at 16 deg in a held pose), so a held reverse
// grip or a blade across the neck cannot stand still; they live in the idle actions instead, where
// the wrist may turn, and the held poses are their cousins on the forearm's line.)
import { P, N, set3, dir, unitAzEl, to3, dirNudge, dirTo, kf, hump, smoother, standLife, handLoose, ANK } from '../poseKit.js';

// ---------------------------------------------------------------- the sword arm on the blade's line
// The held poses keep the forearm on the blade's line (the kink): the hand target is built from the
// blade's direction f and the upper arm's g (H = upper·g + fore·f from the shoulder) and the elbow's
// pole is g square to the shoulder-hand line, so the solver lays the forearm along f (measured on
// the upright body: within 1.3 deg in every held pose). `bAz / bEl` turn the blade off that line:
// the stance audit measures the kink on the drawn, camera-leaned matrices, whose sheared rotations
// read a forearm 10-20 deg off its true line when the arm is out to his side; a few degrees here
// meet the audit halfway (the true kink stays at today's ~5 deg).
const DEG = Math.PI / 180, UPPER = 0.28, FORE = 0.27;
function armLine(p, fAz, fEl, gAz, gEl, bAz = 0, bEl = 0) {
  const fa = fAz * DEG, fe = fEl * DEG, ga = gAz * DEG, ge = gEl * DEG;
  const fx = Math.cos(fe) * Math.sin(fa), fy = Math.sin(fe), fz = Math.cos(fe) * Math.cos(fa);
  const gx = Math.cos(ge) * Math.sin(ga), gy = Math.sin(ge), gz = Math.cos(ge) * Math.cos(ga);
  const hx = UPPER * gx + FORE * fx, hy = UPPER * gy + FORE * fy, hz = UPPER * gz + FORE * fz;
  set3(p, P.rH, hx, hy, hz);
  const hl = Math.hypot(hx, hy, hz) || 1, d = (gx * hx + gy * hy + gz * hz) / (hl * hl);
  const px = gx - d * hx, py = gy - d * hy, pz = gz - d * hz;
  const pl = Math.hypot(px, py, pz) || 1;
  set3(p, P.rP, px / pl, py / pl, pz / pl);
  if (bAz || bEl) dir(p, P.swD, fAz + bAz, fEl + bEl);
  else set3(p, P.swD, fx, fy, fz);
}

// ================================================================ STANDING
// Each pose has its own slow life (periods none a multiple of another).
const LIFE_A = { breath: [3.9, 3.3], settle: 8.3, drift: 12.7, look: [9.7, 5.9], point: [5.1, 6.9], arms: 0.9 };

/** THE PRESENTER: weight back on the right leg, the chest open, the sword arm long and out to his
 *  right with the blade trailing low behind it; the free arm opens out to his left, palm up, as if
 *  presenting himself to a crowd. */
function present(p, P, A) {
  const m = standLife(A.time, LIFE_A.breath[0], LIFE_A);
  p[P.bodyX] = -0.035 - 0.018 * m.sw;
  p[P.bodyY] = -0.03 + 0.007 * m.br;
  p[P.bodyZ] = -0.015;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.3;
  p[P.pelvZ] = -0.05 - 0.02 * m.sw;
  p[P.spX] = -0.06 + 0.025 * m.br;
  p[P.spY] = 0.2;
  p[P.spZ] = 0.06 + 0.02 * m.sw;
  p[P.hdX] = -0.03 - 0.02 * m.br;
  p[P.hdY] = 0.26 + 0.14 * m.look;
  p[P.hdZ] = -0.05;
  armLine(p, -120 + 3 * m.tipA, -34 + 2.5 * m.tipB + 1.2 * m.brL, -92 + 2 * m.tipA, -78 + 1.5 * m.brL, 0, 4);
  set3(p, P.swF, 0.41, -0.81, 0.42);
  // the free hand open out to his left, palm up
  set3(p, P.lH, 0.27 + 0.008 * m.sw, -0.3 + 0.012 * m.brL, 0.16 + 0.01 * m.dr);
  set3(p, P.lP, 0.6, -0.75, -0.3);
  const d = unitAzEl(55, -12 + 3 * m.br);
  set3(p, P.lD, d[0] * 0.8, d[1] * 0.8, d[2] * 0.8);
  set3(p, P.lN, 0.15, 0.8, 0.3);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, -0.13, ANK, -0.1);
  set3(p, P.lF, 0.13, ANK, 0.19);
  set3(p, P.rK, -0.5, 0.05, 1);
  set3(p, P.lK, 0.3, 0.05, 1);
  p[P.rFy] = -0.7;
  p[P.lFy] = 0.45;
  p[P.footFlat] = 0.95;
}

/** THE SALUTE: heels close, the head a little bowed; the blade held up before his right chest, the
 *  point high, and the sword fingers of the free hand raised beside the flat. */
function salute(p, P, A) {
  const m = standLife(A.time, LIFE_A.breath[1], LIFE_A);
  p[P.bodyX] = 0.0 - 0.01 * m.sw;
  p[P.bodyY] = -0.01 + 0.006 * m.br;
  p[P.bodyZ] = 0.0;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.12;
  p[P.pelvZ] = -0.01 * m.sw;
  p[P.spX] = 0.02 + 0.022 * m.br;
  p[P.spY] = 0.1;
  p[P.spZ] = 0.0;
  p[P.hdX] = 0.1 - 0.015 * m.br;
  p[P.hdY] = 0.02 + 0.06 * m.look;
  p[P.hdZ] = 0.0;
  armLine(p, -35 + 2 * m.tipA, 56 + 1.5 * m.tipB + 1 * m.brL, -20, -55 + 1.5 * m.brL);
  set3(p, P.swF, -0.82, 0, -0.57);
  // the sword fingers up beside the blade, before the breastbone
  set3(p, P.lH, -0.12 + 0.004 * m.sw, -0.24 + 0.01 * m.brL, 0.27 + 0.006 * m.br);
  set3(p, P.lP, 0.75, -0.6, -0.2);
  const d = unitAzEl(-20, 70 + 3 * m.br);
  set3(p, P.lD, d[0], d[1], d[2]);
  set3(p, P.lN, -0.85, 0.1, 0.5);
  p[P.hs] = 1;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, -0.1, ANK, -0.03);
  set3(p, P.lF, 0.1, ANK, 0.08);
  set3(p, P.rK, -0.35, 0.05, 1);
  set3(p, P.lK, 0.3, 0.05, 1);
  p[P.rFy] = -0.5;
  p[P.lFy] = 0.35;
  p[P.footFlat] = 0.95;
}

/** THE SWALLOW: the weight on the left leg, the right foot drawn out behind him on its ball; the
 *  blade trails low behind the right hip, and the free hand is lifted high before him in sword
 *  fingers, the chin following it: a dancer's line from the raised fingers down to the point. */
function swallow(p, P, A) {
  const m = standLife(A.time + 4.1, LIFE_A.breath[1], LIFE_A);
  p[P.bodyX] = 0.035 + 0.012 * m.sw;
  p[P.bodyY] = -0.04 + 0.007 * m.br;
  p[P.bodyZ] = 0.01;
  p[P.pelvX] = 0;
  p[P.pelvY] = 0.08;
  p[P.pelvZ] = 0.05 + 0.015 * m.sw;
  p[P.spX] = -0.04 + 0.022 * m.br;
  p[P.spY] = -0.02;
  p[P.spZ] = -0.06 - 0.012 * m.sw;
  p[P.hdX] = -0.08 - 0.015 * m.br;
  p[P.hdY] = 0.12 + 0.08 * m.look;
  p[P.hdZ] = 0.05;
  armLine(p, -128 + 2.5 * m.tipA, -32 + 2 * m.tipB + 1 * m.brL, -105 + 2 * m.tipA, -72 + 1.5 * m.brL);
  set3(p, P.swF, 0.35, -0.86, 0.37);
  // the sword fingers raised high before him
  set3(p, P.lH, 0.05 + 0.006 * m.sw, 0.06 + 0.012 * m.brL, 0.33 + 0.008 * m.dr);
  set3(p, P.lP, 0.7, -0.6, -0.3);
  const d = unitAzEl(4, 52 + 3 * m.br);
  set3(p, P.lD, d[0], d[1], d[2]);
  set3(p, P.lN, -1, 0, 0.2);
  p[P.hs] = 1;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, -0.2, ANK, -0.14);
  set3(p, P.lF, 0.1, ANK, 0.1);
  set3(p, P.rK, -0.6, 0.05, 1);
  set3(p, P.lK, 0.25, 0.05, 1);
  p[P.rFy] = -0.9;
  p[P.lFy] = 0.2;
  p[P.footFlat] = 0.95;
}

/** THE CANE: weight on the left leg, the right foot forward and turned out; the sword arm long and
 *  down before his right hip with the point near the grass ahead of him, as if he leaned on it;
 *  the free hand hangs loose, a little out. */
function cane(p, P, A) {
  const m = standLife(A.time + 2.3, LIFE_A.breath[0] * 1.07, LIFE_A);
  p[P.bodyX] = 0.03 + 0.015 * m.sw;
  p[P.bodyY] = -0.025 + 0.007 * m.br;
  p[P.bodyZ] = 0.01;
  p[P.pelvX] = 0;
  p[P.pelvY] = 0.12;
  p[P.pelvZ] = 0.05 + 0.02 * m.sw;
  p[P.spX] = 0.03 + 0.022 * m.br;
  p[P.spY] = -0.05;
  p[P.spZ] = -0.04 - 0.015 * m.sw;
  p[P.hdX] = 0.0 - 0.015 * m.br;
  p[P.hdY] = -0.1 + 0.18 * m.look;
  p[P.hdZ] = 0.06;
  armLine(p, -42 + 2.5 * m.tipA, -52 + 1.5 * m.tipB + 1 * m.brL, 10, -84 + 1.5 * m.brL, 2, -8);
  set3(p, P.swF, -0.55, -0.14, -0.82);
  handLoose(p, m, { out: 0.03, fwd: 0.05, swing: 1.4 });
  set3(p, P.rF, -0.17, ANK, 0.14);
  set3(p, P.lF, 0.11, ANK, -0.06);
  set3(p, P.rK, -0.5, 0.05, 1);
  set3(p, P.lK, 0.3, 0.05, 1);
  p[P.rFy] = -0.75;
  p[P.lFy] = 0.25;
  p[P.footFlat] = 0.95;
}

/** HIGH LINE (fight): the empty stance: the weight sunk on the rear (right) leg, the front foot light
 *  ahead; the sword arm raised, the blade level above his head and pointed at the foe; the free
 *  hand's sword fingers forward under it. */
function highLine(p, P, A) {
  const m = standLife(A.time, 3.1, LIFE_A);
  p[P.bodyX] = -0.03 - 0.008 * m.sw;
  p[P.bodyY] = -0.12 + 0.006 * m.br;
  p[P.bodyZ] = -0.03 + 0.01 * m.dr;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.32;
  p[P.pelvZ] = -0.02;
  p[P.spX] = 0.02 + 0.02 * m.br;
  p[P.spY] = 0.12;
  p[P.spZ] = 0.04;
  p[P.hdX] = 0.04 - 0.01 * m.br;
  p[P.hdY] = 0.2;
  p[P.hdZ] = 0.0;
  armLine(p, -10 + 2 * m.tipA, 4 + 2 * m.tipB + 1 * m.brL, -65, 58 + 1.5 * m.brL);
  set3(p, P.swF, -0.06, -1, 0.08);
  // sword fingers forward at the foe, under the blade
  set3(p, P.lH, -0.02 + 0.004 * m.sw, -0.12 + 0.01 * m.brL, 0.38);
  set3(p, P.lP, 0.4, -0.85, -0.2);
  const d = unitAzEl(-6, 8 + 2 * m.br);
  set3(p, P.lD, d[0], d[1], d[2]);
  set3(p, P.lN, -1, 0, 0);
  p[P.hs] = 1;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, -0.12, ANK, -0.16);
  set3(p, P.lF, 0.1, ANK, 0.22);
  set3(p, P.rK, -0.6, 0.05, 1);
  set3(p, P.lK, 0.2, 0.05, 1);
  p[P.rFy] = -0.75;
  p[P.lFy] = 0.15;
  p[P.footFlat] = 0.95;
}

/** THE BOW (fight): a deep crouch over the same feet as the high line, the chest wound round to bring the right shoulder forward; the blade
 *  low and level ahead of him, its point on the foe's knee, and the free hand drawn back high behind
 *  him in sword fingers like a drawn bowstring. */
function bow(p, P, A) {
  const m = standLife(A.time + 1.1, 2.9, LIFE_A);
  p[P.bodyX] = 0.0 - 0.012 * m.sw;
  p[P.bodyY] = -0.2 + 0.007 * m.br;
  p[P.bodyZ] = 0.0 + 0.012 * m.dr;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.08;
  p[P.pelvZ] = 0.02;
  p[P.spX] = 0.12 + 0.02 * m.br;
  p[P.spY] = 0.34;
  p[P.spZ] = -0.03;
  p[P.hdX] = -0.02 - 0.01 * m.br;
  p[P.hdY] = -0.36;
  p[P.hdZ] = 0.02;
  armLine(p, -16 + 2.5 * m.tipA, -12 + 2 * m.tipB + 1 * m.brL, -50 + 1.5 * m.tipA, -62 + 1.5 * m.brL);
  set3(p, P.swF, 0, -1, 0);
  // the sword fingers drawn back high behind him
  set3(p, P.lH, 0.3 + 0.006 * m.sw, -0.12 + 0.012 * m.brL, -0.04 + 0.008 * m.dr);
  set3(p, P.lP, 0.35, -0.8, -0.45);
  const d = unitAzEl(60, 18 + 3 * m.br);
  set3(p, P.lD, d[0] * 0.5, d[1] * 0.5, d[2] * 0.5);
  set3(p, P.lN, -0.5, -1, 0.2);
  p[P.hs] = 1;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
  set3(p, P.rF, -0.14, ANK, -0.14);
  set3(p, P.lF, 0.12, ANK, 0.2);
  set3(p, P.rK, -0.65, 0.05, 1);
  set3(p, P.lK, 0.3, 0.05, 1);
  p[P.rFy] = -0.8;
  p[P.lFy] = 0.25;
  p[P.footFlat] = 0.95;
}

const STANCES = {
  ease: [
    { id: 'showy.present', fn: present, w: 1.2, dwell: [8, 15], move: { d: [0.3, -0.6, 0.7], n: [-0.4, -0.6, -0.7] } },
    { id: 'showy.swallow', fn: swallow, w: 1, dwell: [7, 12], move: { d: [0.1, -0.6, 0.8], n: [-0.4, -0.6, -0.7] } },
    { id: 'showy.cane', fn: cane, w: 1, dwell: [8, 14] },
  ],
  fight: [
    { id: 'showy.high', fn: highLine, w: 1, dwell: [6, 12] },
    { id: 'showy.bow', fn: bow, w: 1, dwell: [5, 10] },
  ],
};

// ================================================================ IDLE
// Offsets from whatever pose he stands in, or blends toward a target by the action's weight (the
// feet are never written: a fidget that moves them makes the planner step).
const TAU = Math.PI * 2;
const SCR = new Float32Array(N);
const UPPER_CH = [P.spX, P.spY, P.spZ, P.hdX, P.hdY, P.hdZ];
const VEC_CH = [P.rH, P.rP, P.lH, P.lP, P.lD, P.lN, P.swF];
/** Blend p's upper body (not the feet, not the hips' place) toward the pose in SCR by w. */
function toScr(p, w) {
  if (!(w > 0)) return;
  for (const i of UPPER_CH) p[i] += (SCR[i] - p[i]) * w;
  for (const i of VEC_CH) to3(p, i, SCR[i], SCR[i + 1], SCR[i + 2], w);
  dirTo(p, P.swD, SCR[P.swD], SCR[P.swD + 1], SCR[P.swD + 2], w);
  p[P.hs] += (SCR[P.hs] - p[P.hs]) * w;
}
/** The blade beside him in the plane x = X (body axes), at angle a round it (0 = point down,
 *  PI/2 = point ahead), by w. */
function bladeWheel(p, X, a, w) {
  const c = Math.sqrt(1 - X * X);
  dirTo(p, P.swD, X, -Math.cos(a) * c, Math.sin(a) * c, w);
  to3(p, P.swF, -1, 0, 0, w);
}

/** THE FLOWER: the hand comes up before his right hip and the blade wheels twice beside him, the
 *  second turn faster, then stops dead with the point low ahead; the free hand opens out to the
 *  side as if to say "there". */
function fFlower(p, A, u, e) {
  const arm = hump(u, 0.05, 0.18, 0.82, 0.97);
  to3(p, P.rH, -0.2, -0.36, 0.17, arm * e);
  to3(p, P.rP, 0.4, -0.5, -0.8, arm * e);
  // two turns: the first over 0.42 of the action, the second over 0.2, then the stop
  const s = kf(u, [0.14, 0, 0.5, 1, 0.7, 2]);
  const wheel = hump(u, 0.1, 0.18, 0.78, 0.94);
  if (wheel > 0) bladeWheel(p, -0.58, 0.55 + TAU * s, wheel * e);
  // the free hand presents as the second turn ends
  const pr = hump(u, 0.55, 0.72, 0.88, 0.99);
  to3(p, P.lH, 0.3, -0.28, 0.16, pr * e);
  to3(p, P.lP, 0.6, -0.75, -0.3, pr * e);
  to3(p, P.lN, 0.15, 0.8, 0.3, pr * e);
  to3(p, P.lD, 0.45, -0.15, 0.5, pr * e);
  p[P.hs] += (0 - p[P.hs]) * pr * e;
  p[P.hdY] += (-0.35 * hump(u, 0.12, 0.25, 0.6, 0.75) + 0.3 * pr) * e;
  p[P.hdX] += 0.12 * hump(u, 0.12, 0.25, 0.6, 0.75) * e;
  p[P.spY] += 0.08 * pr * e;
}

/** THE SALUTE: the blade comes up before his chest, the sword fingers rise beside it and the head
 *  bows; held; then the point is flicked out low to his right and he lets it fall back. */
function fSalute(p, A, u, e) {
  const k = hump(u, 0.04, 0.3, 0.66, 0.8);
  if (k > 0) {
    SCR.set(p);
    salute(SCR, P, A);
    toScr(p, smoother(k) * e);
    p[P.hdX] += 0.16 * hump(u, 0.3, 0.38, 0.52, 0.6) * e;
    p[P.spX] += 0.06 * hump(u, 0.3, 0.38, 0.52, 0.6) * e;
  }
  // the flick: out low to his right, fast, then home
  const fl = hump(u, 0.66, 0.72, 0.8, 0.96);
  if (fl > 0) {
    to3(p, P.rH, -0.25, -0.36, 0.12, fl * e);
    to3(p, P.rP, 0.3, -0.6, -0.75, fl * e);
    dirTo(p, P.swD, -0.75, -0.5, 0.43, fl * e);
    to3(p, P.swF, 0.4, -0.85, 0.35, fl * e);
  }
}

/** THE SHOULDER: one wheel of the blade beside him, then it is laid on his right shoulder, the
 *  point up behind him; a bounce of the steel on the shoulder, the free hand palm up out to the
 *  side, the head cocked; then down again. */
function fShoulder(p, A, u, e) {
  const wheel = hump(u, 0.04, 0.12, 0.26, 0.34);
  if (wheel > 0) {
    to3(p, P.rH, -0.2, -0.33, 0.16, wheel * e);
    bladeWheel(p, -0.58, 0.55 + TAU * kf(u, [0.08, 0, 0.32, 1]), wheel * e);
  }
  const sh = hump(u, 0.26, 0.4, 0.78, 0.92);
  if (sh > 0) {
    const b = 0.03 * Math.sin(Math.PI * smoother((u - 0.52) / 0.12));
    to3(p, P.rH, 0.0, 0.0 + (u > 0.52 && u < 0.64 ? b : 0), 0.19, sh * e);
    to3(p, P.rP, -0.45, -0.9, 0.2, sh * e);
    dirTo(p, P.swD, -0.1, 0.56, -0.82, sh * e);
    to3(p, P.swF, -1, 0.2, 0, sh * e);
    to3(p, P.lH, 0.28, -0.3, 0.14, sh * e);
    to3(p, P.lP, 0.6, -0.75, -0.3, sh * e);
    to3(p, P.lN, 0.15, 0.8, 0.3, sh * e);
    to3(p, P.lD, 0.45, -0.15, 0.5, sh * e);
    p[P.hs] += (0 - p[P.hs]) * sh * e;
    p[P.hdZ] -= 0.12 * sh * e;
    p[P.hdY] += 0.12 * sh * e;
    p[P.spZ] += 0.04 * sh * e;
    p[P.spX] -= 0.04 * sh * e;
  }
}

/** THE BECKON (in the fight too): the free hand comes forward palm up and the fingers call the foe
 *  in, twice; the point dips once with it. */
function fBeckon(p, A, u, e) {
  const k = hump(u, 0.05, 0.22, 0.75, 0.95);
  to3(p, P.lH, -0.02, -0.2, 0.36, k * e);
  to3(p, P.lP, 0.5, -0.8, -0.3, k * e);
  to3(p, P.lN, -0.1, 0.9, 0.2, k * e);
  const curl = kf(u, [0.3, 0, 0.38, 1, 0.46, 0, 0.54, 1, 0.62, 0]);
  const d = unitAzEl(0, 20 + 60 * curl);
  to3(p, P.lD, d[0] * 0.8, d[1] * 0.8, d[2] * 0.8, k * e);
  p[P.hs] += (0 - p[P.hs]) * k * e;
  p[P.hdZ] += 0.1 * k * e;
  p[P.hdX] -= 0.05 * k * e;
  dirNudge(p, P.swD, 0, -8 * hump(u, 0.3, 0.4, 0.5, 0.62), e);
}

const FIDGETS = [
  { name: 'showy.flower', dur: 3.0, sets: ['ease'], fn: fFlower },
  { name: 'showy.salute', dur: 4.2, sets: ['ease'], fn: fSalute },
  { name: 'showy.shoulder', dur: 3.8, sets: ['ease'], fn: fShoulder },
  { name: 'showy.beckon', dur: 2.6, sets: ['ease', 'fight'], fn: fBeckon },
];

export const showy = {
  id: 'showy',
  label: 'Showy acrobat',
  blurb: 'Flourishes, spins and hops; dramatic finishes.',
  stances: STANCES,
  shift: { fade: 2.5 },
  fidgets: FIDGETS,
  chain: null,
  swings: {},
};
