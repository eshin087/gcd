// FLOW: the flowing wuxia swordsman (a style for the owner's pick; the contract: styles/index.js,
// the guides: styles/STANCES.md, styles/COMBOS.md). Loose and graceful, never hurried: the sword
// carried low and trailing at his right side, the free arm hanging loose and swinging out as the
// counterweight in the cuts; cuts that roll into each other like a sword dance in figure eights.
//
//   ?moves=flow   both halves     ?stance=flow / ?combo=flow   one half
//
// Body axes: x = his LEFT, y up, z AHEAD. Hand targets are offsets from each shoulder. Nothing here
// allocates per call or reads Math.random: every pose is a pure function of the animator's time.
import { P, set3, v3, dir, unitAzEl, standLife, handLoose, ANK, add3, dirNudge, hump, kf, smoother } from '../poseKit.js';

// The life's periods (s): breath, settle, drift, the look's two, the point's two; none a multiple of
// another. A little slower than today's: he is never hurried.
const LIFE = { breath: [4.1, 3.4], settle: 8.7, drift: 13.3, look: [10.3, 6.1], point: [5.3, 7.1], arms: 1.0 };
const _m = { br: 0, brL: 0, sw: 0, dr: 0, look: 0, tipA: 0, tipB: 0 };
const life = (A, breath) => standLife(A.time, breath, LIFE, _m);

/** The free hand, written in full (lH lP lD lN hs lk twoHand offAt). d / n: unit vectors × weight. */
function hand(p, h, e, d, dw, n, hs) {
  v3(p, P.lH, h[0], h[1], h[2]);
  v3(p, P.lP, e[0], e[1], e[2]);
  v3(p, P.lD, d[0] * dw, d[1] * dw, d[2] * dw);
  v3(p, P.lN, n[0], n[1], n[2]);
  p[P.hs] = hs;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}

// ================================================================ AT EASE
/** TRAILING: the blade carried low behind the right hip, the point trailing over the grass; the
 *  free hand hangs a little forward, open. The weight on the rear (right) leg. */
const trail = {
  id: 'flow.trail', w: 1.2, dwell: [8, 15],
  fn(p, P, A) {
    const m = life(A, LIFE.breath[0]);
    p[P.bodyX] = -0.03 - 0.02 * m.sw;
    p[P.bodyY] = -0.02 + 0.007 * m.br;
    p[P.bodyZ] = -0.01;
    p[P.pelvX] = 0;
    p[P.pelvY] = -0.2;
    p[P.pelvZ] = -0.05 - 0.02 * m.sw;
    p[P.spX] = -0.01 + 0.022 * m.br;
    p[P.spY] = 0.06;
    p[P.spZ] = 0.04 + 0.02 * m.sw;
    p[P.hdX] = 0.03 - 0.02 * m.br;
    p[P.hdY] = 0.12 + 0.18 * m.look;
    p[P.hdZ] = -0.02 - 0.01 * m.sw;
    // the arm hangs a little back, the elbow soft; the blade carries on down the forearm's line
    set3(p, P.rH, -0.19 + 0.006 * m.tipB, -0.5 + 0.01 * m.brL, -0.1 + 0.01 * m.tipA);
    set3(p, P.rP, 0.6, -0.2, 0.8);
    dir(p, P.swD, -126 + 3 * m.tipA, -50 + 2.4 * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.728, -0.166, -0.665);
    handLoose(p, m, { out: 0.01, fwd: 0.09, swing: 1.3 });
    set3(p, P.rF, -0.135, ANK, -0.1);
    set3(p, P.lF, 0.13, ANK, 0.14);
    set3(p, P.rK, -0.5, 0.05, 1);
    set3(p, P.lK, 0.2, 0.05, 1);
    p[P.rFy] = -0.6;
    p[P.lFy] = 0.15;
    p[P.footFlat] = 0.95;
  },
};

/** THE LOW LINE: an easy step forward onto the sword foot, the arm reaching a little ahead and the
 *  blade low and forward off his right side, the point over the grass; the weight settles forward
 *  and back; the free hand hangs back at his left side, loose, the head turned out over the field. */
const low = {
  id: 'flow.low', w: 1, dwell: [7, 13],
  fn(p, P, A) {
    const m = life(A, LIFE.breath[0] * 1.07);
    p[P.bodyX] = -0.01 + 0.012 * m.sw;
    p[P.bodyY] = -0.035 + 0.007 * m.br;
    p[P.bodyZ] = 0.01 + 0.014 * m.dr;
    p[P.pelvX] = 0;
    p[P.pelvY] = 0.16;
    p[P.pelvZ] = 0.02 + 0.015 * m.sw;
    p[P.spX] = 0.02 + 0.022 * m.br;
    p[P.spY] = 0.06;
    p[P.spZ] = -0.02 - 0.012 * m.sw;
    p[P.hdX] = 0.04 - 0.02 * m.br;
    p[P.hdY] = -0.3 + 0.2 * m.look;
    p[P.hdZ] = 0.02;
    set3(p, P.rH, -0.17 + 0.006 * m.tipB, -0.43 + 0.012 * m.brL, 0.18 + 0.008 * m.tipA);
    set3(p, P.rP, 0.4, -0.4, -0.8);
    dir(p, P.swD, -37 + 3 * m.tipA, -37 + 2 * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.84, -0.54, 0.05);
    handLoose(p, m, { out: 0.04, fwd: -0.07, swing: 1.2 });
    set3(p, P.rF, -0.11, ANK, 0.16);
    set3(p, P.lF, 0.13, ANK, -0.12);
    set3(p, P.rK, -0.35, 0.05, 1);
    set3(p, P.lK, 0.5, 0.05, 0.9);
    p[P.rFy] = -0.3;
    p[P.lFy] = 0.6;
    p[P.footFlat] = 0.95;
  },
};

const FINGERS_UP = unitAzEl(-6, 64);
/** STILL WATER: the blade hangs at his right side point down and a little forward; the free hand
 *  raised in sword fingers before the chest. The feet near together, the weight centred. */
const water = {
  id: 'flow.water', w: 0.8, dwell: [6, 11],
  fn(p, P, A) {
    const m = life(A, LIFE.breath[0] * 1.15);
    p[P.bodyX] = 0.0 - 0.012 * m.sw;
    p[P.bodyY] = -0.015 + 0.008 * m.br;
    p[P.bodyZ] = 0.0;
    p[P.pelvX] = 0;
    p[P.pelvY] = -0.1;
    p[P.pelvZ] = -0.015 * m.sw;
    p[P.spX] = -0.02 + 0.026 * m.br;
    p[P.spY] = 0.04;
    p[P.spZ] = 0.01 * m.sw;
    p[P.hdX] = 0.06 - 0.02 * m.br;
    p[P.hdY] = 0.05 + 0.1 * m.look;
    p[P.hdZ] = 0;
    set3(p, P.rH, -0.22 + 0.005 * m.tipB, -0.47 + 0.012 * m.brL, 0.03 + 0.01 * m.tipA);
    set3(p, P.rP, 0.7, -0.25, -0.65);
    dir(p, P.swD, -66 + 2.5 * m.tipA, -62 + 2 * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.7, -0.05, 0.7);
    hand(p, [-0.03 + 0.004 * m.sw, -0.27 + 0.01 * m.brL, 0.25 + 0.006 * m.br], [0.75, -0.6, -0.25], FINGERS_UP, 1, [-0.85, 0.1, 0.5], 1);
    set3(p, P.rF, -0.11, ANK, -0.03);
    set3(p, P.lF, 0.11, ANK, 0.06);
    set3(p, P.rK, -0.35, 0.05, 1);
    set3(p, P.lK, 0.35, 0.05, 1);
    p[P.rFy] = -0.4;
    p[P.lFy] = 0.3;
    p[P.footFlat] = 0.95;
  },
};

// ================================================================ FIGHT
const AIM_BACK = unitAzEl(85, -42);
/** THE LONG GUARD: side-on, the sword foot forward, the blade low and forward at the foe's knees;
 *  the free arm drawn back behind him in sword fingers, the counterweight. */
const long = {
  id: 'flow.long', w: 1, dwell: [6, 12],
  move: { d: [0.1, -0.6, 0.8], n: [-0.4, -0.6, -0.7] },
  fn(p, P, A) {
    const m = life(A, LIFE.breath[1]);
    p[P.bodyX] = 0.0 - 0.01 * m.sw;
    p[P.bodyY] = -0.09 + 0.006 * m.br;
    p[P.bodyZ] = 0.0 + 0.012 * m.dr;
    p[P.pelvX] = 0;
    p[P.pelvY] = 0.28;
    p[P.pelvZ] = 0.02;
    p[P.spX] = 0.04 + 0.02 * m.br;
    p[P.spY] = 0.24;
    p[P.spZ] = -0.03;
    p[P.hdX] = 0.05 - 0.012 * m.br;
    p[P.hdY] = -0.46;
    p[P.hdZ] = 0.02;
    set3(p, P.rH, -0.1 + 0.005 * m.tipB, -0.34 + 0.012 * m.brL, 0.3 + 0.008 * m.tipA);
    set3(p, P.rP, 0.1, -0.7, -0.7);
    dir(p, P.swD, -10 + 2.4 * m.tipA, -16 + 2 * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.2, 1, 0.15);
    hand(p, [0.3 + 0.006 * m.sw, -0.27 + 0.01 * m.brL, -0.12 + 0.008 * m.br], [0.4, -0.5, -0.8], AIM_BACK, 0.5, [-0.3, -0.6, -0.4], 1);
    set3(p, P.rF, -0.1, ANK, 0.27);
    set3(p, P.lF, 0.12, ANK, -0.24);
    set3(p, P.rK, -0.4, 0, 1);
    set3(p, P.lK, 0.75, 0, 0.65);
    p[P.rFy] = -0.45;
    p[P.lFy] = 0.95;
    p[P.footFlat] = 0.95;
  },
};

const AIM_FWD = unitAzEl(-8, 12);
/** THE HIGH LINE: the sword hand up beside the head, the blade level forward along the forearm,
 *  its point on the foe's eyes; the free hand out ahead in sword fingers. */
const high = {
  id: 'flow.high', w: 1, dwell: [5, 10],
  move: { d: [0.05, -0.5, 0.85], n: [-0.6, -0.4, -0.7] },
  fn(p, P, A) {
    const m = life(A, LIFE.breath[1] * 1.08);
    p[P.bodyX] = 0.0 - 0.01 * m.sw;
    p[P.bodyY] = -0.07 + 0.006 * m.br;
    p[P.bodyZ] = 0.0 + 0.01 * m.dr;
    p[P.pelvX] = 0;
    p[P.pelvY] = 0.2;
    p[P.pelvZ] = 0.02;
    p[P.spX] = 0.02 + 0.02 * m.br;
    p[P.spY] = 0.18;
    p[P.spZ] = -0.02;
    p[P.hdX] = 0.02 - 0.012 * m.br;
    p[P.hdY] = -0.36;
    p[P.hdZ] = 0.0;
    set3(p, P.rH, -0.06 + 0.005 * m.tipB, 0.0 + 0.01 * m.brL, 0.36 + 0.008 * m.tipA);
    set3(p, P.rP, -0.9, -0.2, -0.4);
    dir(p, P.swD, 21 + 2 * m.tipA, 10 + 2 * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.1, 1, -0.1);
    hand(p, [-0.0 + 0.005 * m.sw, -0.15 + 0.01 * m.brL, 0.3 + 0.006 * m.br], [0.35, -0.9, -0.1], AIM_FWD, 1, [-1, 0, 0], 1);
    set3(p, P.rF, -0.11, ANK, 0.22);
    set3(p, P.lF, 0.12, ANK, -0.22);
    set3(p, P.rK, -0.4, 0, 1);
    set3(p, P.lK, 0.7, 0, 0.7);
    p[P.rFy] = -0.4;
    p[P.lFy] = 0.9;
    p[P.footFlat] = 0.95;
  },
};

// ================================================================ IDLE (offsets from whatever pose he holds)
const TAU = Math.PI * 2;
/** THE FLOWER: the wrist rolls the blade in a slow figure eight beside him, twice, the point lifted
 *  off the grass; the eyes follow the steel. */
const flower = {
  name: 'flow.flower', dur: 4.4, sets: ['ease'],
  fn(p, A, u, e) {
    const b = hump(u, 0.04, 0.2, 0.78, 0.96);
    const ph = TAU * 2 * smoother((u - 0.08) / 0.84);
    dirNudge(p, P.swD, 46 * Math.sin(ph) * b, (30 + 22 * Math.sin(2 * ph)) * b, e);
    add3(p, P.rH, -0.02 * Math.sin(ph) * b, (0.06 + 0.02 * Math.sin(2 * ph)) * b, 0.07 * b, e);
    p[P.hdX] += 0.12 * b * e;
    p[P.hdY] += -0.18 * b * e + 0.08 * Math.sin(ph) * b * e;
    p[P.spY] += 0.04 * Math.sin(ph) * b * e;
    add3(p, P.lH, 0.02 * Math.sin(ph) * b, 0.01 * b, 0, e);
  },
};
/** THE DRAWING ARC: as in tai chi sword he sinks, lifts the blade slowly forward, carries it round
 *  to his left with the hips, the weight going over, and lets it settle back down; the free hand
 *  rises against it. */
const drawArc = {
  name: 'flow.draw', dur: 5.6, sets: ['ease'],
  fn(p, A, u, e) {
    const rise = kf(u, [0.05, 0, 0.32, 1, 0.62, 0.75, 0.9, 0]);
    const sweep = kf(u, [0.18, 0, 0.62, 1, 0.94, 0]);
    dirNudge(p, P.swD, 52 * sweep, 38 * rise, e);
    add3(p, P.rH, 0.08 * sweep, 0.12 * rise, 0.12 * rise, e);
    p[P.bodyY] -= 0.035 * Math.max(rise, sweep) * e;
    p[P.bodyX] += 0.035 * (sweep - 0.5 * rise) * e;
    p[P.pelvY] += 0.16 * sweep * e;
    p[P.spY] += 0.1 * sweep * e;
    p[P.spX] += 0.03 * rise * e;
    p[P.hdY] += (0.14 * sweep - 0.1 * rise) * e;
    add3(p, P.lH, 0.04 * sweep, 0.09 * rise, -0.04 * sweep, e);
  },
};
/** THE FLICK: one snap of the wrist that throws the point up and the blood off it, a settle. */
const flick = {
  name: 'flow.flick', dur: 2.4, sets: ['ease', 'fight'],
  fn(p, A, u, e) {
    const b = kf(u, [0.22, 0, 0.32, 1, 0.42, 1, 0.58, -0.25, 0.76, 0]);
    dirNudge(p, P.swD, 10 * b, 26 * b, e);
    add3(p, P.rH, 0, 0.03 * b, 0.03 * b, e);
    p[P.hdX] += 0.05 * kf(u, [0.25, 0, 0.4, 1, 0.8, 0]) * e;
  },
};
/** THE POINT'S CIRCLE (in the guard): the point draws one small slow circle on the foe and the
 *  fingers settle again; small, it never blocks a move. */
const circle = {
  name: 'flow.circle', dur: 3.4, sets: ['fight'],
  fn(p, A, u, e) {
    const b = hump(u, 0.05, 0.25, 0.75, 0.95), ph = TAU * smoother((u - 0.1) / 0.8);
    dirNudge(p, P.swD, 9 * Math.sin(ph) * b, 7 * (Math.cos(ph) - 1) * b, e);
    add3(p, P.rH, 0.01 * Math.sin(ph) * b, 0.01 * Math.cos(ph) * b, 0.02 * b, e);
    add3(p, P.lH, 0, 0.015 * b, 0.02 * b, e);
  },
};

export const flow = {
  id: 'flow',
  label: 'Flowing swordsman',
  blurb: 'Loose and graceful; cuts that roll into each other.',
  stances: { ease: [trail, low, water], fight: [long, high] },
  shift: { fade: 2.8 },
  fidgets: [flower, drawArc, flick, circle],
  chain: null,
  swings: {},
};
