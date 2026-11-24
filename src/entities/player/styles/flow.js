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
  id: 'flow.trail', w: 1.2, dwell: [8, 15], maxTier: 2,
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
  id: 'flow.low', w: 1, dwell: [7, 13], maxTier: 2,
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
    dir(p, P.swD, -43 + 3 * m.tipA, -38 + 2 * m.tipB + 1.2 * m.brL);
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
  id: 'flow.water', w: 0.8, dwell: [6, 11], maxTier: 2,
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
  id: 'flow.long', w: 1, dwell: [6, 12], maxTier: 2,
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
  id: 'flow.high', w: 1, dwell: [5, 10], maxTier: 2,
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

// ================================================================ ON A STREAK (tier 3 and up)
// From the streak's third tier he stands in these instead (the others carry maxTier 2): the blade
// lifts off the grass and the stance opens, the steel moving more, as if the current had him.
const FINGERS_LO = unitAzEl(10, -40);
/** THE CURRENT (at ease, streak): the trailing blade lifted, the point riding high behind him and
 *  swaying slowly; the free hand low ahead of the hip in sword fingers. */
const current = {
  id: 'flow.current', w: 1, dwell: [8, 14], minTier: 3,
  move: { d: [0.1, -0.6, 0.8], n: [-0.4, -0.6, -0.7] },
  fn(p, P, A) {
    const m = life(A, LIFE.breath[0] * 0.95);
    const k = A.streakK ?? 0.6;
    p[P.bodyX] = -0.025 - 0.02 * m.sw;
    p[P.bodyY] = -0.04 + 0.008 * m.br;
    p[P.bodyZ] = 0.0;
    p[P.pelvX] = 0;
    p[P.pelvY] = -0.24;
    p[P.pelvZ] = -0.04 - 0.02 * m.sw;
    p[P.spX] = 0.0 + 0.024 * m.br;
    p[P.spY] = 0.1;
    p[P.spZ] = 0.03 + 0.02 * m.sw;
    p[P.hdX] = 0.02 - 0.02 * m.br;
    p[P.hdY] = 0.06 + 0.16 * m.look;
    p[P.hdZ] = -0.02;
    set3(p, P.rH, -0.23 + 0.01 * m.tipB, -0.42 + 0.014 * m.brL, -0.18 + 0.015 * m.tipA);
    set3(p, P.rP, 0.6, -0.2, 0.8);
    dir(p, P.swD, -140 + (4 + 3 * k) * m.tipA, -30 + (3 + 2 * k) * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.321, -0.866, 0.383);
    hand(p, [0.07 + 0.006 * m.sw, -0.45 + 0.012 * m.brL, 0.16 + 0.01 * m.br], [0.45, -0.3, -0.8], FINGERS_LO, 1, [-0.35, -0.6, -0.72], 1);
    set3(p, P.rF, -0.14, ANK, -0.12);
    set3(p, P.lF, 0.13, ANK, 0.16);
    set3(p, P.rK, -0.5, 0.05, 1);
    set3(p, P.lK, 0.25, 0.05, 1);
    p[P.rFy] = -0.6;
    p[P.lFy] = 0.15;
    p[P.footFlat] = 0.95;
  },
};
const AIM_LINE = unitAzEl(-10, -16);
/** THE TIDE (in a fight, streak): the long guard sunk deeper and wider, the point low at the foe
 *  and swaying more as the streak grows; the free hand out ahead in sword fingers along the blade's
 *  own line, both arms pointing the way in. */
const tide = {
  id: 'flow.tide', w: 1, dwell: [6, 12], minTier: 3,
  move: { d: [0.05, -0.5, 0.85], n: [-0.6, -0.4, -0.7] },
  fn(p, P, A) {
    const m = life(A, LIFE.breath[1] * 0.95);
    const k = A.streakK ?? 0.6;
    p[P.bodyX] = 0.0 - 0.012 * m.sw;
    p[P.bodyY] = -0.13 + 0.006 * m.br;
    p[P.bodyZ] = 0.0 + 0.016 * m.dr;
    p[P.pelvX] = 0;
    p[P.pelvY] = 0.32;
    p[P.pelvZ] = 0.02;
    p[P.spX] = 0.06 + 0.02 * m.br;
    p[P.spY] = 0.22;
    p[P.spZ] = -0.03;
    p[P.hdX] = 0.04 - 0.012 * m.br;
    p[P.hdY] = -0.48;
    p[P.hdZ] = 0.02;
    set3(p, P.rH, -0.09 + 0.006 * m.tipB, -0.35 + 0.012 * m.brL, 0.33 + 0.01 * m.tipA);
    set3(p, P.rP, 0.1, -0.7, -0.7);
    dir(p, P.swD, -9 + (2.5 + 3 * k) * m.tipA, -19 + (2 + 2 * k) * m.tipB + 1.2 * m.brL);
    set3(p, P.swF, 0.2, 1, 0.15);
    hand(p, [0.0 + 0.005 * m.sw, -0.27 + 0.01 * m.brL, 0.34 + 0.008 * m.br], [0.4, -0.85, -0.2], AIM_LINE, 1, [0, -1, 0], 1);
    set3(p, P.rF, -0.11, ANK, 0.32);
    set3(p, P.lF, 0.13, ANK, -0.28);
    set3(p, P.rK, -0.4, 0, 1);
    set3(p, P.lK, 0.75, 0, 0.65);
    p[P.rFy] = -0.45;
    p[P.lFy] = 0.95;
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

// ================================================================ THE COMBO: a sword dance in figure eights
// Five presses, one figure: each finish is the next coil, the steel swinging back like a pendulum
// and looping up the side it finished on into the next cut (R → L, loop up the left, L → R, loop up
// the right, down and back up in one press, a drawn cut R → L that he holds, and the wide backhand
// sweep L → R that he holds with the fingers out, which leaves the blade low on the right where the
// first cut loops up again). The groove, mashed: da · da · da-da · (held) DAAA · (held).
// Next from: 0.26 · 0.27 · 0.35 · 0.51 · 0.50 s, a cycle of ~1.88 s, 201 damage (~107 /s).
const CHAIN = [
  {
    // 1 the falling river: from high right a diagonal across his chest down past the left hip; the
    // free arm swings out behind him against it
    name: 'flowRiver', kind: 'light', combo: 1, damage: 27, poise: 10, heavy: false,
    windup: 0.1, active: 0.11, recovery: 0.22, chain: 0.22, lunge: 0.55, reach: 2.2,
    hitstop: 0.045, shake: 0.1, bite: 0.8, contact: 'light', punch: 0.3, kick: 0.07, flare: 0.45,
    anim: { kind: 'clip', clip: 'flowRiver' },
  },
  {
    // 2 the returning river: the steel loops up his left side and falls back across to the right hip
    name: 'flowReturn', kind: 'light', combo: 2, damage: 29, poise: 11, heavy: false,
    windup: 0.11, active: 0.11, recovery: 0.22, chain: 0.22, lunge: 0.55, reach: 2.2,
    hitstop: 0.05, shake: 0.11, bite: 0.9, contact: 'light', punch: 0.32, kick: 0.07, flare: 0.5,
    anim: { kind: 'clip', clip: 'flowReturn' },
  },
  {
    // 3 twin ripples: up the right side and down across him, and in the same breath the wrist rolls
    // over and the steel runs back up the same line: two blows in one press
    name: 'flowTwin', kind: 'light', combo: 3, damage: 35, poise: 13, heavy: false,
    windup: 0.1, active: 0.2, recovery: 0.24, chain: 0.2, lunge: 0.6, reach: 2.2,
    hitstop: 0.04, shake: 0.1, bite: 0.6, contact: 'light', punch: 0.28, kick: 0.06, flare: 0.45,
    hits: [
      { at: [1.0, 1.42], damage: 16, poise: 6, hitstop: 0.035, bite: 0.5 },
      { at: [1.5, 2.0], damage: 19, poise: 7, hitstop: 0.055, bite: 0.9, punch: 0.4, contact: 'sweep', flare: 0.55 },
    ],
    anim: { kind: 'clip', clip: 'flowTwin' },
  },
  {
    // 4 the drawn breath: he sinks and steps through, drawing the blade low and flat from behind the
    // right hip across to his left, the hips turning with it, and HOLDS it there a beat
    name: 'flowDraw', kind: 'light', combo: 4, damage: 42, poise: 18, heavy: false,
    windup: 0.12, active: 0.12, recovery: 0.38, chain: 0.6, buffer: 0.55, lunge: 0.7, reach: 2.2,
    hitstop: 0.075, shake: 0.18, bite: 1.2, biteHold: 0.12, heft: { t: 0.08, rate: 0.35 },
    contact: 'sweep', punch: 0.55, kick: 0.12, flare: 0.6,
    anim: { kind: 'clip', clip: 'flowDraw', turn: 0.3 },
  },
  {
    // 5 the wide sweep: out of the held breath the whole body unwinds into a deep bow and the steel
    // sweeps wide and low from his left all the way round past the right, and he holds it, the
    // sword fingers pointed at the foe
    name: 'flowSweep', kind: 'light', combo: 5, damage: 78, poise: 42, heavy: true,
    windup: 0.2, active: 0.14, recovery: 0.48, chain: 0.25, buffer: 0.5, lunge: 0.75, reach: 2.3,
    hitstop: 0.13, shake: 0.4, bite: 1.45, biteHold: 0.14, heft: { t: 0.1, rate: 0.3 },
    contact: 'cleave', punch: 1.5, kick: 0.2, flare: 0.95,
    anim: { kind: 'clip', clip: 'flowSweep', turn: -0.4 },
  },
];

// ON A STREAK (tier 3 and up; the streak's 'tiers' piece): one more figure in the dance. After the
// twin ripples the steel runs on in an eddy, a level double out to his left and back, before the
// drawn breath: six presses, da · da · da-da · da-da · (held) DAAA. Cycle ~2.32 s, 247 damage.
const AW = (d, name, combo) => ({ ...d, name, combo });
const EDDY = {
  name: 'flowEddyA', kind: 'light', combo: 4, damage: 36, poise: 14, heavy: false,
  windup: 0.1, active: 0.2, recovery: 0.24, chain: 0.2, lunge: 0.5, reach: 2.2,
  hitstop: 0.04, shake: 0.11, bite: 0.6, contact: 'light', punch: 0.3, kick: 0.06, flare: 0.5,
  hits: [
    { at: [1.0, 1.42], damage: 16, poise: 6, hitstop: 0.035, bite: 0.5 },
    { at: [1.5, 2.0], damage: 20, poise: 8, hitstop: 0.06, bite: 1.0, punch: 0.45, contact: 'sweep', flare: 0.6 },
  ],
  anim: { kind: 'clip', clip: 'flowEddy' },
};
const CHAIN_AWAKE = [
  AW(CHAIN[0], 'flowRiverA', 1),
  AW(CHAIN[1], 'flowReturnA', 2),
  AW(CHAIN[2], 'flowTwinA', 3),
  EDDY,
  AW(CHAIN[3], 'flowDrawA', 5),
  AW(CHAIN[4], 'flowSweepA', 6),
];

const SWINGS = {
  /** 1 the falling river (line right): cocked beside the head, the diagonal down across his chest. */
  flowRiver: {
    line: 'right',
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.14,
    keys: [
      { u: 0.6, by: -0.04, bz: -0.09, bx: -0.06, hip: -0.46, sy: -0.52, sx: -0.1, fh: 'chest' },
      { u: 1.0, h: [-0.06, 0.2, 0.0], a: [-150, 40], by: -0.08, bz: -0.07, bx: -0.05, hip: -0.38, sy: -0.44, sx: -0.04, sz: 0.05, fh: 'chest' },
      { u: 1.25, h: [0.02, 0.14, 0.24], a: [-102, 32] },
      { u: 1.5, h: [0.14, -0.05, 0.46], a: [-30, 12], by: -0.22, bz: 0.1, bx: 0.01, hip: 0.2, sy: 0.0, sx: 0.3, sz: 0.0, l: [0.3, -0.12, 0.02], lp: [0.45, -0.85, -0.3], ld: [85, 8], pn: [-0.3, -1, 0], lk: 0 },
      { u: 1.75, h: [0.25, -0.22, 0.41], a: [30, -16] },
      { u: 2.0, h: [0.31, -0.33, 0.3], a: [72, -34], by: -0.29, bz: 0.15, bx: 0.05, hip: 0.4, sy: 0.42, sx: 0.42, sz: -0.07, fh: 'highWing', l: [0.34, 0.0, -0.24] },
      { u: 2.15, by: -0.31, bz: 0.17, bx: 0.06, hip: 0.5, sy: 0.55, sx: 0.47 },
      { u: 2.45, h: [0.34, -0.36, 0.14], a: [128, -22], by: -0.26, bz: 0.11, bx: 0.04, hip: 0.44, sy: 0.48, sx: 0.38, sz: -0.06, fh: 'highWing' },
    ],
  },
  /** 2 the returning river (line left): the loop up his left side, the diagonal down to the right
   *  hip; the fingers come in to the chest through the loop and fly out to his left at the finish. */
  flowReturn: {
    line: 'left',
    lF: [0.15, 0.48], rF: [-0.17, -0.46], fy: [0.15, -0.75], drag: 0.14,
    keys: [
      { u: 0.6, by: -0.1, bz: -0.08, bx: -0.06, hip: 0.43, sy: 0.52, sx: -0.06, l: [0.18, -0.3, 0.08] },
      { u: 1.0, h: [0.32, 0.14, 0.1], a: [156, 44], by: -0.09, bz: -0.06, bx: -0.05, hip: 0.34, sy: 0.45, sx: 0.0, sz: -0.05, fh: 'chest', l: [-0.06, -0.2, 0.26], ld: [15, 55] },
      { u: 1.25, h: [0.24, 0.1, 0.32], a: [104, 34] },
      { u: 1.5, h: [0.1, -0.06, 0.46], a: [30, 12], by: -0.22, bz: 0.1, bx: 0.01, hip: -0.08, sy: 0.0, sx: 0.3, l: [0.24, -0.12, 0.1], lp: [0.4, -0.85, -0.3], ld: [70, 30], pn: [-0.4, -1, 0], lk: 0 },
      { u: 1.75, h: [-0.12, -0.24, 0.4], a: [-30, -16] },
      { u: 2.0, h: [-0.24, -0.34, 0.26], a: [-70, -34], by: -0.29, bz: 0.15, bx: 0.05, hip: -0.36, sy: -0.4, sx: 0.4, sz: 0.07, fh: 'wing', l: [0.44, -0.12, -0.16] },
      { u: 2.15, by: -0.31, bz: 0.17, bx: 0.06, hip: -0.47, sy: -0.52, sx: 0.45 },
      { u: 2.45, h: [-0.26, -0.38, 0.08], a: [-124, -26], by: -0.26, bz: 0.11, bx: 0.04, hip: -0.42, sy: -0.46, sx: 0.36, sz: 0.06, fh: 'wing' },
    ],
  },
  /** 3 twin ripples (line right): up the right side to the coil, down across to the left hip (the
   *  first blow), the wrist rolling over at the bottom, the fingers meeting the sword wrist, and back
   *  up the same diagonal to high right (the second), the fingers splitting away to the left. */
  flowTwin: {
    line: 'right',
    lF: [0.15, 0.46], rF: [-0.17, -0.44], fy: [0.2, -0.7], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.03, bz: -0.08, bx: -0.06, hip: -0.46, sy: -0.52, sx: -0.06, fh: 'chest' },
      { u: 1.0, h: [-0.06, 0.18, 0.02], a: [-148, 36], by: -0.07, bz: -0.06, bx: -0.05, hip: -0.38, sy: -0.44, sx: -0.02, sz: 0.04, fh: 'chest' },
      { u: 1.18, h: [0.06, 0.06, 0.34], a: [-70, 22] },
      { u: 1.3, h: [0.18, -0.12, 0.45], a: [0, 0], by: -0.2, bz: 0.08, bx: 0.02, hip: 0.14, sy: 0.05, sx: 0.3 },
      { u: 1.4, h: [0.28, -0.28, 0.34], a: [74, -30], by: -0.25, bz: 0.11, bx: 0.04, hip: 0.3, sy: 0.32, sx: 0.38, fh: 'wrist', l: [0.02, -0.3, 0.3], lk: 0.6 },
      { u: 1.62, h: [0.14, -0.14, 0.44], a: [10, -6], by: -0.2, bz: 0.12, hip: 0.04, sy: 0.02, sx: 0.28, l: [0.3, -0.24, 0.06], lp: [0.4, -0.7, -0.5], ld: [95, -20], pn: [0, -1, 0], lk: 0 },
      { u: 1.8, h: [-0.08, 0.06, 0.4], a: [-50, 20] },
      { u: 2.0, h: [-0.2, 0.18, 0.28], a: [-84, 38], by: -0.1, bz: 0.13, bx: 0.05, hip: -0.32, sy: -0.34, sx: 0.06, sz: 0.06, fh: 'wingLo', l: [0.42, -0.3, -0.14] },
      { u: 2.13, by: -0.08, bz: 0.14, bx: 0.06, hip: -0.42, sy: -0.46, sx: 0.0 },
      { u: 2.45, h: [-0.24, 0.24, 0.12], a: [-120, 46], by: -0.09, bz: 0.1, bx: 0.04, hip: -0.38, sy: -0.42, sx: 0.02, sz: 0.05, fh: 'wingLo' },
    ],
  },
  /** (streak) the eddy (line flat): out of the ripples' finish the blade drops to his right at
   *  chest height and runs level across to his left (the first blow), the wrist turns over with the
   *  fingers at the sword wrist, and it runs back level to his right (the second), the fingers
   *  flying out to the left. */
  flowEddy: {
    line: 'flat',
    lF: [0.18, 0.42], rF: [-0.17, -0.44], fy: [0.5, -0.6], drag: 0.16,
    keys: [
      { u: 0.6, by: -0.18, bz: -0.08, bx: -0.06, hip: -0.5, sy: -0.56, sx: 0.16, fh: 'chest' },
      { u: 1.0, h: [-0.3, -0.12, 0.08], a: [-150, 4], by: -0.17, bz: -0.06, bx: -0.05, hip: -0.42, sy: -0.48, sx: 0.16, fh: 'chest' },
      { u: 1.18, h: [-0.06, -0.12, 0.38], a: [-70, 2] },
      { u: 1.3, h: [0.14, -0.12, 0.46], a: [0, 0], by: -0.21, bz: 0.08, bx: 0.02, hip: 0.1, sy: 0.04, sx: 0.24 },
      { u: 1.4, h: [0.3, -0.14, 0.3], a: [84, 4], by: -0.22, bz: 0.1, bx: 0.04, hip: 0.34, sy: 0.38, sx: 0.24, fh: 'wrist', l: [0.04, -0.16, 0.3], lk: 0.5 },
      { u: 1.62, h: [0.12, -0.1, 0.46], a: [8, 6], by: -0.2, bz: 0.12, hip: 0.02, sy: 0.02, sx: 0.22, l: [0.38, -0.12, 0.04], lp: [0.2, -0.7, -0.7], ld: [95, 0], pn: [0, -1, 0], lk: 0 },
      { u: 1.8, h: [-0.14, -0.06, 0.42], a: [-56, 10] },
      { u: 2.0, h: [-0.3, -0.04, 0.26], a: [-96, 12], by: -0.18, bz: 0.13, bx: 0.05, hip: -0.36, sy: -0.38, sx: 0.12, fh: 'wing', l: [0.45, -0.16, -0.13] },
      { u: 2.13, by: -0.19, bz: 0.14, bx: 0.06, hip: -0.46, sy: -0.5, sx: 0.14 },
      { u: 2.45, h: [-0.32, 0.0, 0.1], a: [-136, 16], by: -0.16, bz: 0.1, bx: 0.04, hip: -0.42, sy: -0.46, sx: 0.1, fh: 'wing' },
    ],
  },
  /** 4 the drawn breath (line flat): low from behind the right hip, sinking and stepping through,
   *  the blade drawn level across to his left and held there, the free hand high behind him. */
  flowDraw: {
    line: 'flat',
    lF: [0.18, 0.44], rF: [-0.18, -0.46], fy: [0.55, -0.6], drag: 0.16, home: 0.6,
    keys: [
      { u: 0.6, by: -0.24, bz: -0.08, bx: -0.06, hip: -0.52, sy: -0.56, sx: 0.3, fh: 'aimLo' },
      { u: 1.0, h: [-0.14, -0.37, -0.16], a: [-156, -12], by: -0.22, bz: -0.06, bx: -0.05, hip: -0.44, sy: -0.48, sx: 0.26, fh: 'aimLo' },
      { u: 1.3, h: [0.0, -0.34, 0.26], a: [-104, -10] },
      { u: 1.5, h: [0.14, -0.3, 0.45], a: [-32, -5], by: -0.32, bz: 0.11, bx: 0.01, hip: 0.14, sy: 0.02, sx: 0.36, l: [0.24, -0.08, 0.12], lp: [0.45, -0.85, -0.3], ld: [60, 10], pn: [0, -1, 0], lk: 0 },
      { u: 1.75, h: [0.3, -0.25, 0.36], a: [36, 3] },
      { u: 2.0, h: [0.38, -0.19, 0.2], a: [96, 12], by: -0.27, bz: 0.15, bx: 0.05, hip: 0.42, sy: 0.44, sx: 0.3, fh: 'highWing', l: [0.34, 0.02, -0.2] },
      { u: 2.15, by: -0.25, bz: 0.16, bx: 0.06, hip: 0.52, sy: 0.56, sx: 0.32 },
      { u: 2.4, h: [0.37, -0.14, 0.12], a: [134, 18], by: -0.24, bz: 0.12, bx: 0.05, hip: 0.47, sy: 0.5, sx: 0.26, fh: 'highWing', l: [0.32, 0.0, -0.18] },
      { u: 2.6, h: [0.37, -0.14, 0.12], a: [136, 18], by: -0.23, bz: 0.12, bx: 0.05, hip: 0.46, sy: 0.5, sx: 0.25, fh: 'highWing', l: [0.32, 0.0, -0.18] },
    ],
  },
  /** 5 the wide sweep (line low): the blade gathered low at his left, the body unwinding into a
   *  deep bow, one wide sweep along the knees from the left round past the right, and held, the
   *  sword fingers thrown out at the foe against it. */
  flowSweep: {
    line: 'low',
    lF: [0.2, 0.52], rF: [-0.19, -0.5], fy: [0.35, -0.85], drag: 0.2, home: 0.55,
    keys: [
      { u: 0.6, by: -0.3, bz: -0.09, bx: -0.06, hip: 0.56, sy: 0.6, sx: 0.36, fh: 'wrist', l: [0.08, -0.3, 0.3] },
      { u: 1.0, h: [0.36, -0.32, 0.04], a: [150, -10], by: -0.3, bz: -0.07, bx: -0.05, hip: 0.46, sy: 0.52, sx: 0.36, fh: 'wrist', l: [0.08, -0.3, 0.3], lk: 0.8 },
      { u: 1.12, l: [0.18, -0.26, 0.24], lp: [0.5, -0.8, -0.2], ld: [40, -20], pn: [0, -1, 0], lk: 0.2 },
      { u: 1.28, h: [0.28, -0.32, 0.32], a: [98, -10] },
      { u: 1.5, h: [0.12, -0.3, 0.47], a: [32, -8], by: -0.4, bz: 0.1, bx: 0.01, hip: -0.04, sy: 0.06, sx: 0.44, l: [0.06, -0.12, 0.36], lp: [0.4, -0.9, -0.1], ld: [-4, 4], pn: [-1, 0, 0], lk: 0 },
      { u: 1.75, h: [-0.14, -0.28, 0.42], a: [-36, -6] },
      { u: 2.0, h: [-0.3, -0.24, 0.24], a: [-96, -2], by: -0.42, bz: 0.15, bx: 0.05, hip: -0.4, sy: -0.4, sx: 0.46, fh: 'aim', l: [0.0, -0.04, 0.44], ld: [-6, 6] },
      { u: 2.15, by: -0.44, bz: 0.16, bx: 0.06, hip: -0.5, sy: -0.52, sx: 0.48 },
      { u: 2.4, h: [-0.34, -0.22, 0.1], a: [-130, 2], by: -0.4, bz: 0.13, bx: 0.05, hip: -0.45, sy: -0.47, sx: 0.44, fh: 'aim', l: [0.0, -0.04, 0.44], ld: [-6, 6] },
      { u: 2.55, h: [-0.34, -0.22, 0.1], a: [-132, 2], by: -0.39, bz: 0.13, bx: 0.05, hip: -0.45, sy: -0.47, sx: 0.43, fh: 'aim', l: [0.0, -0.04, 0.44], ld: [-6, 6] },
    ],
  },
};

export const flow = {
  id: 'flow',
  label: 'Flowing swordsman',
  blurb: 'Loose and graceful; cuts that roll into each other.',
  stances: { ease: [trail, low, water, current], fight: [long, high, tide] },
  shift: { fade: 3.2 },
  fidgets: [flower, drawArc, flick, circle],
  chain: CHAIN,
  chainAwake: [{ minTier: 3, chain: CHAIN_AWAKE }],
  swings: SWINGS,
};
