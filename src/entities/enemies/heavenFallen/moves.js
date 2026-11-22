import { TELL } from '../../../combat/rules.js';
import { MOVES as ASH, CLIPS as ASH_CLIPS } from '../ashDisciple/moves.js';
import { compileClip, completeBeat } from '../ashDisciple/poses.js';
import { makeRealise } from '../duelist/realise.js';
import { TUNING } from './tuning.js';

// Qian Yao's moves and reaction clips, as data (COMBAT.md → "Qian Yao, the Heaven-Fallen"; ADR-133).
// The format is the Ash Disciple's (ashDisciple/moves.js header; duelist/realise.js). His bar, HEAVEN'S
// RULE, is held as a jian is (a straight one-handed weapon, the free hand striking with the palm), so
// his blade's poses are the Ash Disciple's authored strikes: each beat below takes one of those beats'
// keys (its blade path, its feet) and gives it his own tell, windup, damage, zone and reach. What is his
// own beyond the engine's beat fields:
//   gaze: { kind }   a beat of his EYES (gaze.js routes its hooks): 'focus' (Heaven's Gaze: a line from
//                    his eyes, fixed at `fix` of the windup, lit `sustain.dur`), 'sweep' (swept across
//                    TUNING.gaze.sweep.arc deg, lit from its cue: its flash IS the line lighting),
//                    'high' (from the air: the beam's foot runs a line through where the hero stood),
//                    'bore' (He Opens the Sky: no blow from the beam; a well and falling stones)
//   fly: { kind }    his own root motion (fallen.js beatMotion): 'drink' (low and fast to a pool, held
//                    there), 'awaken3' (up through the roof, down into the great well)
//   pass: true       Exile's Passage: a flying charge through the hero (fallen.js: the world swept)
//   crack: true      the blow cracks the floor ahead of him (world.impact, blunt)
// Rules (COMBAT.md, checked by tests/integration/fallen.mjs `data`): a tell on every real hit, a move's
// first real windup >= TUNING.minFirstWindup in every phase (authored >= 0.64: x 0.86 in phase 3),
// impacts >= TUNING.minHitGap apart, feints never flash.

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;

// ---- the Ash Disciple's authored strikes this kit is posed with (read once, never written)
const RAIN = ASH.ashRain.beats; // rise, back, flat, over (held, lock), diag, flatBack, thrust
const CUT = { rise: RAIN[0], back: RAIN[1], flat: RAIN[2], over: RAIN[3], diag: RAIN[4], flatBack: RAIN[5], thrust: RAIN[6] };
const PLUM = ASH.plumThrust.beats[0];
const OVERHEAD = ASH.fallingAsh.beats[0];
const STAR = ASH.fallingStar.beats[0];
const PERIL = ASH.piercingAsh.beats[0];
const SPIN = ASH.crane.beats[0];
const SPIN2 = ASH.crane.beats[1];
const LOTUS = ASH.lotus.beats[0];
const FALL = ASH.heavenFall.beats[0];
const KINDLE = ASH.kindle.beats[0];

/** A beat: an authored strike's keys and root motion, with his numbers. Fields not his are dropped
 *  (the Ash Disciple's burning ground, his flit). */
function beat(base, o) {
  const { burn, flit, noSweep, ...b } = base;
  return { ...b, ...o };
}

// ---- his stance through a gaze: upright, the bar held low at his side, the head down on the hero.
// (the intro's last pose of the Ash Disciple: the jian lowered; his eyes do the work)
const STAND = { yaw: 0.0, bY: -0.05, pitch: 0.02, hdX: 0.12, rH: [0.06, -0.22, 0.24], rP: [-0.5, -0.6, -0.4], sw: [-0.2, -1.2], swF: [1, 0, 0], lH: [-0.1, -0.2, 0.26], lP: [0.6, -0.4, 0.3], rF: [-0.12, 0.05], lF: [0.12, -0.05] };
const GAZE_KEYS = [
  [0.3, { ...STAND, hdX: 0.05 }],
  [0.85, { ...STAND, hdX: 0.18, pitch: 0.06, bY: -0.1, lH: [0.02, -0.06, 0.3] }],
  [1.0, { ...STAND, e: 'i', hdX: 0.2, pitch: 0.08, bY: -0.12, lH: [0.04, -0.04, 0.32] }],
  [2.0, { ...STAND, hdX: 0.2, pitch: 0.08, bY: -0.12 }],
];
// ... from the air: the legs drawn up under the robe
const HIGH_KEYS = [
  [0.3, { ...STAND, rF: [-0.12, 0.2, 0.2], lF: [0.14, -0.05, 0.12], rK: [-0.2, 0.3, 1], lK: [0.3, 0.3, 1], flat: 0.4 }],
  [1.0, { ...STAND, e: 'i', hdX: 0.4, pitch: 0.16, rF: [-0.12, 0.2, 0.24], lF: [0.14, -0.05, 0.16], rK: [-0.2, 0.3, 1], lK: [0.3, 0.3, 1], flat: 0.4 }],
  [2.0, { ...STAND, hdX: 0.4, pitch: 0.16, rF: [-0.12, 0.2, 0.24], lF: [0.14, -0.05, 0.16], rK: [-0.2, 0.3, 1], lK: [0.3, 0.3, 1], flat: 0.4 }],
];
// ... looking straight up at the rock (He Opens the Sky)
const UP_KEYS = [
  [0.3, { ...STAND, hdX: -0.3, pitch: -0.1 }],
  [0.9, { ...STAND, hdX: -0.6, pitch: -0.22, bY: -0.16, lH: [0.1, 0.1, 0.24], lP: [0.6, 0.4, 0.3] }],
  [1.0, { ...STAND, e: 'i', hdX: -0.65, pitch: -0.25, bY: -0.18 }],
  [2.0, { ...STAND, hdX: -0.4, pitch: -0.12 }],
];
// ... the palm: the free hand driven out flat, the bar drawn back
const PALM_COCK = { yaw: 0.9, bY: -0.24, bZ: -0.06, hip: 0.12, rH: [-0.1, -0.2, -0.05], rP: [-0.6, -0.6, -0.5], sw: [-1.1, 0.1], swF: [1, 0.1, 0], lH: [0.12, 0.02, 0.1], lP: [0.6, 0.0, 0.6], hdY: -0.7, rF: [-0.12, 0.36], lF: [0.2, -0.3] };
const PALM_OUT = { yaw: -0.2, bY: -0.28, bZ: 0.16, pitch: 0.08, hip: -0.1, rH: [-0.14, -0.22, -0.1], rP: [-0.6, -0.6, -0.5], sw: [-1.6, 0.05], swF: [1, 0.1, 0], lH: [0.06, 0.06, 0.62], lP: [0.2, 0.2, 1.0], hdY: -0.1, rF: [-0.1, 0.72], lF: [0.22, -0.46], rK: [-0.25, 0, 1], lK: [0.6, -0.2, 0.8] };
const PALM_KEYS = [
  [0.35, { gather: true, ...PALM_COCK, yaw: 0.6 }],
  [0.75, { ...PALM_COCK }],
  [1.0, { ...PALM_OUT, e: 'i' }],
  [1.6, { ...PALM_OUT, e: 'o', bZ: 0.2 }],
  [2.0, { settle: true, ...PALM_OUT, bZ: 0.14 }],
];
// ... the flying charge: pitched into it, the bar levelled forward
const PASS_KEYS = [
  [0.4, { gather: true, ...PLUM.keys[1][1], bY: -0.3 }],
  [0.7, { ...PLUM.keys[1][1], pitch: 0.3, bY: -0.2, rF: [-0.12, 0.1, 0.3], lF: [0.16, -0.3, 0.25], flat: 0.3 }],
  [1.0, { ...PLUM.keys[2][1], e: 'i', pitch: 0.36, rF: [-0.12, 0.1, 0.3], lF: [0.16, -0.3, 0.25], flat: 0.3 }],
  [2.0, { ...PLUM.keys[3][1], pitch: 0.2 }],
];

const gaze = (kind) => ({ kind });
const G = TUNING.gaze;

export const MOVES = {
  // ================================================================ phase 1: the judge
  /** First Decree: a level cut, then a stepping thrust that sends him through the hero. */
  decree: {
    label: 'First Decree', phase: 1, weight: [2.2, 1.6, 1.2], cooldown: 3.5, band: [0, 3.8], recovery: 0.6, cat: 'single',
    beats: [
      beat(CUT.flat, { tell: N, windup: 0.64, damage: 16, knockback: 0.9, zone: { kind: 'sector', r: 2.5, ang: 1.0 } }),
      beat(CUT.thrust, { tell: B, windup: 0.52, damage: 24, knockback: 1.6, zone: { kind: 'line', r: 2.8, w: 1.2 } }),
    ],
  },

  /** Three Judgments: a rising cut, a backhand, and an overhead flare that can be locked. */
  threeJudgments: {
    label: 'Three Judgments', phase: 1, weight: [2.6, 2.0, 1.6], cooldown: 4, band: [0, 3.8], recovery: 0.65,
    beats: [
      beat(CUT.rise, { tell: N, windup: 0.64, damage: 14, knockback: 0.7, zone: { kind: 'sector', r: 2.5, ang: 0.95 } }),
      beat(CUT.back, { tell: N, windup: 0.46, damage: 14, knockback: 0.7, zone: { kind: 'sector', r: 2.5, ang: 0.95 } }),
      beat(OVERHEAD, { tell: B, flare: true, windup: 0.56, damage: 22, knockback: 1.6, zone: { kind: 'line', r: 3.0, w: 1.0 }, lock: true, close: 1.4 }),
    ],
    recoveryKeys: ASH.fallingAsh.recoveryKeys,
  },

  /** Pillar of Law: the bar raised over his head and held, then brought straight down: the floor cracks. */
  pillarOfLaw: {
    label: 'Pillar of Law', phase: 1, weight: [1.6, 1.2, 0.8], cooldown: 5, band: [0, 3.6], recovery: 0.7, cat: 'single',
    beats: [beat(OVERHEAD, { tell: B, windup: 0.85, hold: [0, 0.35], cock: 0.7, damage: 26, knockback: 2.0, zone: { kind: 'line', r: 2.8, w: 1.3 }, lock: false, flare: false, crack: true })],
    recoveryKeys: ASH.fallingAsh.recoveryKeys,
  },

  /** The Rule Pierces: a perilous thrust across the gap (red): roll into it (mikiri) or aside. */
  rulePierces: {
    label: 'The Rule Pierces', phase: 1, weight: [1.4, 1.2, 1.0], cooldown: 5, band: [3.0, 9], recovery: 0.75,
    beats: [beat(PERIL, { tell: R, windup: 0.72, damage: 26, knockback: 2.5, zone: { kind: 'line', r: 3.6, w: 1.0 }, mikiri: true, dash: { from: 0.84, to: 1.0, stop: 0.9, max: 6.5 } })],
    recoveryKeys: ASH.piercingAsh.recoveryKeys,
  },

  /** Palm of Noon: the free hand, flat, from close: the hero is thrown far back (no knockdown). */
  palmOfNoon: {
    label: 'Palm of Noon', phase: 1, weight: [1.4, 1.2, 1.0], cooldown: 5, band: [0, 2.8], recovery: 0.55, cat: 'single',
    beats: [{ tell: N, windup: 0.64, active: 0.1, damage: 12, knockback: 6, zone: { kind: 'sector', r: 2.0, ang: 0.8 }, part: 'palm', noSweep: true, keys: PALM_KEYS }],
  },

  /** Heaven's Gaze: a beam from his eyes. Parry turns it; a PERFECT parry sends it back (an eclipse). */
  heavenGaze: {
    label: "Heaven's Gaze", phase: 1, weight: [1.6, 1.3, 1.1], cooldown: 5.5, band: [4.5, 16], recovery: 0.7, cat: 'ranged',
    beats: [{ tell: B, windup: 0.95, active: 0.12, sustain: { dur: 0.35, tick: 0.1 }, selfHit: true, damage: G.focus.first.damage, knockback: G.focus.first.knockback, zone: { kind: 'line', r: G.focus.len, w: G.focus.w }, close: 0, track: 0.85, part: 'eyes', gaze: gaze('focus'), keys: GAZE_KEYS }],
  },

  /** Noonfall: up out of reach; the ring follows the hero, locks, and he comes down on it (red). */
  noonfall: {
    label: 'Noonfall', phase: 1, weight: [1.3, 1.2, 1.1], cooldown: 8, band: [4, 14], recovery: 0.95, cat: 'closer',
    beats: [beat(FALL, { tell: R, windup: 1.2, damage: 30, knockback: 4, knockdown: true, zone: { kind: 'ring', r: 2.8 }, ring: 2.8, leap: { from: 0.3, lock: 0.68, apex: TUNING.fly.apex }, air: true, dive: true })],
    recoveryKeys: ASH.heavenFall.recoveryKeys,
  },

  /** He Drinks the Sun: low and fast to the nearest open pool, and he stands in it (no blow). */
  sunDrink: {
    label: 'He Drinks the Sun', phase: 1, weight: [2, 2, 2], cooldown: 6, band: [0, 40], recovery: 0.2, cat: 'closer', manualWeigh: true,
    beats: [{ feint: true, windup: 1.4, active: 0.1, fixed: true, close: 0, track: 0, fly: { kind: 'drink' }, keys: HIGH_KEYS }],
  },

  /** Rebuke: his counter out of a guard: a diagonal cut, then a thrust. */
  riposte: {
    label: 'Rebuke', phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.6,
    beats: [
      beat(CUT.diag, { tell: N, windup: 0.64, damage: 16, knockback: 0.8, track: 0.7, zone: { kind: 'sector', r: 2.5, ang: 0.85 } }),
      beat(CUT.thrust, { tell: B, windup: 0.46, damage: 22, knockback: 1.5, zone: { kind: 'line', r: 2.6, w: 0.9 } }),
    ],
  },

  /** A Hundred Verdicts: his flurry out of a streak of guards (DEFENSE.foeStreak). */
  streakFlurry: {
    label: 'A Hundred Verdicts', phase: 1, weight: [0, 0, 0], counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.8,
    beats: [
      beat(CUT.diag, { tell: N, windup: 0.64, damage: 14, knockback: 0.7, track: 0.7, zone: { kind: 'sector', r: 2.5, ang: 0.9 } }),
      beat(CUT.flat, { tell: N, windup: 0.5, damage: 14, knockback: 0.7, zone: { kind: 'sector', r: 2.5, ang: 1.0 } }),
      beat(CUT.rise, { tell: N, windup: 0.5, damage: 14, knockback: 0.7, zone: { kind: 'sector', r: 2.5, ang: 0.95 } }),
      beat(CUT.flatBack, { tell: N, windup: 0.5, damage: 14, knockback: 0.7, zone: { kind: 'sector', r: 2.5, ang: 1.0 } }),
    ],
  },

  // ================================================================ phase 2: his eyes open
  /** The Sweeping Gaze: the beam swept across in front of him (red). Roll through the line, stand
   *  behind cover, or be close inside it (it is blind within 2.2 m). Its cue is the line lighting. */
  sweepingGaze: {
    label: 'The Sweeping Gaze', phase: 2, weight: [0, 1.8, 1.4], cooldown: 7, band: [3, 11], recovery: 0.8, cat: 'spell',
    beats: [{ tell: R, windup: 1.0, active: 0.1, sustain: { dur: Math.max(0.1, G.sweep.dur - 0.3 - 0.1), tick: 0.05 }, selfHit: true, knockdown: true, damage: G.sweep.damage, knockback: G.sweep.knockback, zone: { kind: 'line', r: G.sweep.len, w: G.sweep.w }, close: 0, track: 0.6, part: 'eyes', gaze: gaze('sweep'), keys: GAZE_KEYS }],
  },

  /** Gaze from on High: he rises, and the beam's foot runs a line through where the hero stood (red,
   *  marked on the floor before it moves). Then he comes down. */
  gazeOnHigh: {
    label: 'Gaze from on High', phase: 2, weight: [0, 1.4, 1.2], cooldown: 9, band: [5, 16], recovery: 0.95, cat: 'spell',
    beats: [{
      tell: R, windup: 1.3, fixed: true, active: 0.1, sustain: { dur: (G.high.len - G.high.before) / G.high.speed, tick: 0.05 }, selfHit: true, knockdown: true,
      damage: G.high.damage, knockback: G.high.knockback, zone: { kind: 'ring', r: G.high.r }, close: 0, track: 0.3, part: 'eyes', air: true,
      lift: [[0, TUNING.fly.hover], [0.46, TUNING.fly.apex], [2, TUNING.fly.apex]], gaze: gaze('high'), keys: HIGH_KEYS,
    }],
  },

  /** Turning Day: three cuts and a spin low round him (red). */
  turningDay: {
    label: 'Turning Day', phase: 2, weight: [0, 2.4, 2.0], cooldown: 6, band: [0, 3.8], recovery: 0.75,
    beats: [
      beat(CUT.rise, { tell: N, windup: 0.64, damage: 12, knockback: 0.6, zone: { kind: 'sector', r: 2.5, ang: 0.95 } }),
      beat(CUT.back, { tell: N, windup: 0.44, damage: 12, knockback: 0.6, zone: { kind: 'sector', r: 2.5, ang: 0.95 } }),
      beat(CUT.flat, { tell: N, windup: 0.44, damage: 12, knockback: 0.6, zone: { kind: 'sector', r: 2.5, ang: 1.0 } }),
      beat(LOTUS, { tell: R, windup: 0.6, damage: 24, knockback: 2.6, knockdown: true, zone: { kind: 'ring', r: 3.0 }, ring: 3.0, close: 1.0 }),
    ],
    recoveryKeys: ASH.lotus.recoveryKeys,
  },

  /** Exile's Passage: a flying charge straight through the hero, a metre off the floor (red). */
  exilesPassage: {
    label: "Exile's Passage", phase: 2, weight: [0, 1.4, 1.0], cooldown: 7, band: [5, 14], recovery: 0.9, cat: 'closer',
    beats: [{
      tell: R, windup: 0.9, active: 0.12, sustain: { dur: 0.3, tick: 0.3 }, damage: 26, knockback: 3.5, knockdown: true, air: true, pass: true,
      zone: { kind: 'line', r: 2.4, w: 1.6, fwd: -1.0 }, close: 0, track: 0.6,
      dash: { from: 0.55, to: 1.0, stop: 0.4, max: 13 }, travel: [[1, 0], [2, 4]],
      lift: [[0, TUNING.fly.hover], [0.55, 1.0], [2, 1.0]], keys: PASS_KEYS,
    }],
    recoveryKeys: ASH.plumThrust.recoveryKeys,
  },

  /** The Light Goes Out: his one black blow. His own light drawn into the bar, then down. */
  lightGoesOut: {
    label: 'The Light Goes Out', phase: 2, weight: [0, 0.9, 0.9], cooldown: 12, band: [0, 3.8], recovery: 0.9, cat: 'single',
    beats: [beat(OVERHEAD, { tell: K, windup: 1.5, damage: 40, knockback: 3, knockdown: true, zone: { kind: 'sector', r: 3.0, ang: 0.7 }, lock: false, flare: false, close: 2.0, crack: true })],
    recoveryKeys: ASH.fallingAsh.recoveryKeys,
  },

  /** He Opens the Sky: he looks up and the beam bores a well over him; three stones fall (red). */
  openSky: {
    label: 'He Opens the Sky', phase: 2, weight: [0, 1.5, 1.5], cooldown: TUNING.bore.cooldown, band: [0, 40], recovery: 0.6, cat: 'hazard', hazard: true, manualWeigh: true,
    beats: [{ feint: true, windup: 1.3, fixed: true, active: 0.1, close: 0, track: 0, part: 'eyes', gaze: gaze('bore'), keys: UP_KEYS }],
  },

  // ================================================================ phase 3: he tears the sky
  /** Crossed Gaze: two sweeps from opposite sides, a second apart (red, red). */
  crossedGaze: {
    label: 'Crossed Gaze', phase: 3, weight: [0, 0, 1.4], cooldown: 9, band: [3, 11], recovery: 0.85, cat: 'spell',
    beats: [
      { tell: R, windup: 1.0, active: 0.1, sustain: { dur: Math.max(0.1, G.sweep.dur - 0.4), tick: 0.05 }, selfHit: true, knockdown: true, damage: G.sweep.damage, knockback: G.sweep.knockback, zone: { kind: 'line', r: G.sweep.len, w: G.sweep.w }, close: 0, track: 0.6, part: 'eyes', gaze: { kind: 'sweep', side: 1 }, keys: GAZE_KEYS },
      { tell: R, windup: 0.5, fixed: true, active: 0.1, sustain: { dur: Math.max(0.1, G.sweep.dur - 0.4), tick: 0.05 }, selfHit: true, knockdown: true, damage: G.sweep.damage, knockback: G.sweep.knockback, zone: { kind: 'line', r: G.sweep.len, w: G.sweep.w }, close: 0, track: 0.6, part: 'eyes', gaze: { kind: 'sweep', side: -1 }, keys: GAZE_KEYS },
    ],
  },

  /** Exile's Return: the passage there, and back (red, red). */
  passageReturn: {
    label: "Exile's Return", phase: 3, weight: [0, 0, 1.1], cooldown: 9, band: [5, 14], recovery: 0.95, cat: 'closer',
    beats: [0.9, 0.7].map((w, i) => ({
      tell: R, windup: w, fixed: i > 0, active: 0.12, sustain: { dur: 0.3, tick: 0.3 }, damage: 24, knockback: 3.5, knockdown: true, air: true, pass: true,
      zone: { kind: 'line', r: 2.4, w: 1.6, fwd: -1.0 }, close: 0, track: 0.7,
      dash: { from: i ? 0.35 : 0.55, to: 1.0, stop: 0.4, max: 13 }, travel: [[1, 0], [2, 4]],
      lift: [[0, i ? 1.0 : TUNING.fly.hover], [0.55, 1.0], [2, 1.0]], keys: PASS_KEYS,
    })),
    recoveryKeys: ASH.plumThrust.recoveryKeys,
  },

  // ================================================================ the transitions
  /** His eyes open (phase 2): he rises 2 m, a well is bored over him, a red shock ring. */
  awaken2: {
    label: 'His Eyes Open (phase 2)', phase: 2, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.9,
    beats: [beat(KINDLE, {
      tell: R, windup: 1.75, fixed: true, damage: TUNING.transition.damage, knockback: TUNING.transition.knockback,
      zone: { kind: 'ring', r: TUNING.transition.ringRadius }, ring: TUNING.transition.ringRadius, air: true,
      lift: [[0, TUNING.fly.hover], [0.8, 2.0], [1.0, 2.0], [2, 1.2]],
    })],
  },

  /** He tears the sky (phase 3): up through the roof; the great well opens over the centre and he
   *  comes down in it (a red ring there, marked for 1.2 s). */
  awaken3: {
    label: 'He Tears the Sky (phase 3)', phase: 3, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.9,
    beats: [beat(FALL, {
      tell: R, windup: 2.4, fixed: true, damage: TUNING.transition.damage + 6, knockback: TUNING.transition.knockback, knockdown: true,
      zone: { kind: 'ring', r: TUNING.transition.landRadius }, ring: TUNING.transition.landRadius, air: true, leap: undefined, fly: { kind: 'awaken3' }, track: 0,
    })],
    recoveryKeys: ASH.heavenFall.recoveryKeys,
  },
};
export const MOVE_NAMES = Object.keys(MOVES);
export const TRANSITIONS = Object.freeze({ 2: 'awaken2', 3: 'awaken3' });

// ---------------------------------------------------------------- reaction clips: the Ash Disciple's
// (his guard, his flinch, the recoil, reeling, the break, the execution, the death), with his own
// waiting pose: standing with his eyes shut between the lights, not kneeling
const SEATED = { bY: -0.42, bZ: -0.04, pitch: 0.04, hdX: 0.34, rF: [-0.16, 0.22], lF: [0.16, 0.22], rK: [-0.3, 0.1, 0.9], lK: [0.3, 0.1, 0.9], flat: 0.5, rH: [0.06, -0.36, 0.28], rP: [-0.5, -0.4, -0.6], sw: [0.9, -0.3], swF: [0, 1, 0], lH: [-0.08, -0.34, 0.26], lP: [0.5, -0.3, -0.6] };
export const CLIPS = {
  ...ASH_CLIPS,
  meditate: { dur: 1, hold: true, keys: [[0, { ...SEATED }]] },
  intro: {
    dur: 2.6,
    keys: [
      [0, { ...SEATED }],
      [0.4, { ...SEATED, hdX: 0.1 }],
      [1.1, { ...STAND, hdX: -0.25, pitch: -0.08 }],
      [1.8, { ...STAND, hdX: 0.05 }],
      [2.3, { ...STAND, yaw: 0.3, rH: [0.06, -0.12, 0.3], sw: [-0.4, -0.4] }],
    ],
  },
};
export const CLIP = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
for (const [k, c] of Object.entries(CLIP)) c.name = k;

export const realise = makeRealise({ TUNING, MOVES, compileClip: (keys, dur) => compileClip(keys, dur), completeBeat });
