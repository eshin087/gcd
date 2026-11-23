import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { compileClip, completeBeat, GUARD } from './poses.js';
import { TUNING } from './tuning.js';
import { makeRealise } from '../duelist/realise.js';
import { GUARD_CLIPS } from '../duelist/guard.js';

// Lu Wusheng's moves and reaction clips, as data (COMBAT.md → "The Sheathed"; the format is the Ash
// Disciple's: ashDisciple/moves.js header). His weapon in the engine's sense is the SHEATHED sword in his
// right hand (kit.blade spans the scabbard): every blow but a draw is blunt, the scabbard, the pommel, a
// shoulder, a foot. His own beat fields (sheathed.js reads them; the engine's are ADR-144's):
//   draw: true      THE DRAW (ADR-144): always blue with the flare, `fixed`, wound up >= 0.9 s. The beat's
//                   own hit is lethal (sheathed.js hitPlayer: TUNING.draw); a held guard is knocked open
//                   (takeHit's `breaksGuard`), never hurt. He waits at the cock for a hero who cannot answer
//                   (the engine's honor gate, `mayCue`), and a chain of draws goes on only past a dodge
//                   (`stopOn`). The sheath: settled from TUNING.draw.grip of the windup, drawn at its
//                   impact, re-sheathed in the recovery (the click at draw.home)
//   bare: true      the blade is out for this beat (Lightless Draw, the hanging cuts' flicks, The Blade Goes
//                   Home's second cut): drawn as a draw is, but its blow is not lethal
//   settle: true    the stance of the draw with no click and no flare (The Hand That Does Not Draw, the
//                   transitions): the hand on the hilt, never drawn
//   pathHit: true   (with `selfHit`) A Thousand Li: the hit test covers the path he crossed (sheathed.js)
//   cast.kind 'late'  phase 3's hanging cuts (lateCuts.js)
// A move's `recoverOpen: 1` (the engine's, ADR-144): its whole recovery is open (the blade is out: he has
// no guard at all from a draw's impact to the click).

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const TAU = Math.PI * 2;
const ANK = DIM.ankle;
const W2B = (wAz, yaw) => wAz - yaw;
const DRAW = TUNING.draw;

// ---------------------------------------------------------------- pose fragments
const SET = { rF: [-0.12, 0.3], lF: [0.17, -0.24] };
const STEP_IN = { rF: [-0.12, 0.6], lF: [0.2, -0.38], rK: [-0.25, 0, 1], lK: [0.55, -0.2, 0.8], lFy: 0.9 };
const LUNGE_FEET = { rF: [-0.08, 0.86], lF: [0.22, -0.6], rK: [-0.1, 0, 1], lK: [0.35, -0.3, 0.9], rFy: -0.05, lFy: 0.95 };
const COIL = { bY: -0.22, bZ: -0.08, yaw: 0.85, hip: 0.14, spX: 0.06, rH: [-0.08, -0.22, 0.0], rP: [-0.6, -0.6, -0.5], sw: [-0.9, 0.04], swF: [1, 0.1, 0], lH: [0.02, 0.0, 0.42], lP: [0.6, -0.3, 0.5], hdY: -0.75, ...SET };
const LUNGE = {
  bY: -0.3, bZ: 0.22, pitch: 0.1, yaw: 0.3, hip: -0.06, spX: 0.18, spY: -0.04, hdY: -0.26, hdX: 0.02,
  rH: [0.04, -0.04, 0.56], rP: [-0.7, -0.3, -0.2], sw: [-0.3, 0.02], swF: [1, 0.1, 0], lH: [0.2, -0.04, -0.34], lP: [0.7, -0.3, -0.6],
  ...LUNGE_FEET,
};
const RAISED = { two: 1, rH: [0.1, 0.42, 0.08], rP: [-0.8, 0.4, -0.3], sw: [-0.2, 2.0], swF: [1, 0, 0], pitch: -0.12, bY: -0.04, spX: -0.06, hdX: 0.02, yaw: 0.2 };
const CHOP = { two: 1, rH: [0.1, -0.3, 0.46], rP: [-0.8, -0.3, 0], sw: [-0.12, -0.62], swF: [1, 0, 0], pitch: 0.24, bY: -0.32, spX: 0.16, hdX: -0.16, yaw: 0.12, rF: [-0.1, 0.76], lF: [0.22, -0.5] };
const STEP_BACK = { rF: [-0.12, 0.14], lF: [0.2, -0.34] };
const CROUCH = { bY: -0.52, pitch: 0.16, rF: [-0.46, 0.22], lF: [0.2, -0.1], rK: [-0.6, 0.3, 0.7], lK: [0.4, 0.2, 0.9], rFy: -0.7, flat: 0.8 };

// THE SETTLE: side-on and sunk, the left hand closed on the scabbard's mouth at the left hip, the right
// hand open on the hilt (keyed: `arm` 0). The right-hand piece is hidden then (sheathed.js), so `sw`
// is only kept pointing along the scabbard
const SETTLE = {
  arm: 0, bY: -0.3, bZ: -0.02, pitch: 0.12, yaw: 0.78, hip: 0.18, spX: 0.1, spY: 0.1, hdY: -0.7, hdX: 0.08,
  rH: [0.3, -0.36, 0.26], rP: [-0.3, -0.8, 0.2], sw: [2.85, -0.55], swF: [0, 1, 0],
  lH: [0.02, -0.5, 0.12], lP: [0.4, -0.8, 0.4], lsw: [2.85, -0.55],
  rF: [-0.14, 0.42], lF: [0.2, -0.34], rK: [-0.3, 0, 1], lK: [0.6, -0.2, 0.8], flat: 0.95,
};
// the stillness: a hair lower, nothing else moves
const COCK = { ...SETTLE, bY: -0.34, pitch: 0.14 };
// the low crouch of Moon Leaves the Water
const LOW_SETTLE = { ...SETTLE, ...CROUCH, yaw: 0.85, hdY: -0.7, hdX: 0.2, rH: [0.28, -0.4, 0.3], lH: [0.0, -0.52, 0.16], pitch: 0.24 };
// the end of a level draw: the blade out at full reach to his right, the body turned through, the
// scabbard still at the hip in the left hand
const CUT_END = {
  arm: 1, ext: 1, lead: -0.25, yaw: -0.35, sw: [W2B(-1.55, -0.35), 0.12], swF: [0, 1, 0],
  bY: -0.34, bZ: 0.14, pitch: 0.12, hip: -0.14, spX: 0.12, hdY: 0.3,
  lH: [0.06, -0.48, 0.06], lP: [0.4, -0.8, 0.3], lsw: [2.6, -0.6], ...LUNGE_FEET,
};
const CUT_END2 = { ...CUT_END, sw: [W2B(-1.7, -0.4), 0.16], yaw: -0.4, bZ: 0.16 };
// the end of a rising draw (Moon Leaves the Water, the last word of No Fourth Refusal): the blade high
const RISE_END = { ...CUT_END, yaw: 0.0, sw: [W2B(-0.4, 0.0), 1.45], bY: -0.18, pitch: -0.08, spX: -0.04, hdX: -0.1 };
// the end of A Thousand Li: past the hero, the blade out behind him, his back to the cut
const PASS_END = { ...CUT_END, yaw: -0.6, sw: [W2B(-2.4, -0.6), -0.2], bY: -0.4, pitch: 0.22, bZ: 0.2 };

/** THE RE-SHEATHE (a draw's recovery, 1.15 s at phase 1's scale): the follow-through held, a short
 *  flick down and aside, the blade's spine laid on the left hand, the tip found, slid home slowly, the
 *  click (TUNING.draw.home), then the sword passed back to the right hand (draw.handOff). */
const resheatheKeys = (from = CUT_END) => [
  [0.12, { ...from }],
  [0.24, { ...from, e: 'i', sw: [from.sw[0] - 0.25, -0.75], ext: 0.85 }],
  [0.46, { arm: 0, yaw: 0.55, bY: -0.28, rH: [0.24, -0.3, 0.42], rP: [-0.4, -0.7, 0.2], sw: [2.5, -0.4], lH: [0.04, -0.48, 0.14], lsw: [2.85, -0.55], ...SET }],
  [0.8, { arm: 0, yaw: 0.7, bY: -0.24, rH: [0.32, -0.38, 0.22], rP: [-0.3, -0.8, 0.2], sw: [2.85, -0.55], lH: [0.03, -0.5, 0.12], lsw: [2.85, -0.55], ...SET }],
  [0.95, { arm: 0, yaw: 0.45, bY: -0.12, rH: [0.1, -0.44, 0.14], sw: [0.2, -0.9], lH: [0.04, -0.48, 0.06], ...SET }],
];

/**
 * A draw beat (ADR-144). The keys go from the settle to the cock and hold there; the cut itself is one
 * key marked 'h' (the cubic holds the cock up to the impact and the next frame is the follow-through:
 * no pose between, ADR-126's curve invents no swing); `end` the follow-through.
 */
function draw({ windup, hold = [0.15, 0.75], zone, dash = null, end = CUT_END, end2 = null, settle = SETTLE, cock = 0.93, track = 0.92, extra = {} }) {
  const ck = { ...settle, bY: settle.bY - 0.04, pitch: (settle.pitch ?? 0) + 0.02 };
  return {
    tell: B, flare: true, draw: true, fixed: true, windup, hold, cock, active: 0.08, damage: DRAW.damage, knockback: 2.4,
    zone, part: 'hilt', close: 0, track, noSweep: true, follow: 0.24,
    ...(dash ? { dash } : {}),
    stopOn: ['blocked', 'hit'],
    // the settle turns sharp (ADR-152): the head comes round to the hero first, then the body drops
    // into the stance at speed (ease-in) out of the quiet carry; the timings are the beat's own
    keys: [
      [DRAW.grip * 0.4, { e: 'i', hdY: settle.hdY, hdX: settle.hdX }],
      [DRAW.grip, { ...settle, e: 'i' }],
      [cock, ck],
      [1.0, { ...end, e: 'h' }],
      [1.6, { ...(end2 ?? end), e: 'o' }],
      [2.0, { ...(end2 ?? end) }],
    ],
    ...extra,
  };
}

/** Thrust beat keys (the pommel or the scabbard's butt driven home). */
const thrustKeys = (k = 1, cock = 0.74) => [
  [cock * 0.5, { gather: true, ...COIL, bY: -0.18 * k, rH: [-0.04, -0.18, 0.12] }],
  [cock, { ...COIL, rH: [-0.08 * k, -0.24, -0.02], bY: -0.24 * k }],
  [1.0, { ...LUNGE, e: 'i', bZ: 0.16, rH: [0.04, -0.05, 0.49] }],
  [1.6, { ...LUNGE, e: 'o', bZ: 0.27, rH: [0.05, -0.03, 0.58] }],
  [2.0, { settle: true, ...LUNGE, bZ: 0.2 }],
];
/** A cut with the scabbard, as the weapon's path (ashDisciple/moves.js slashKeys). */
function slashKeys({ from, through, to, yaw: [y0, y1, y2], cock = 0.7, sink = 0, extra = {} }) {
  const dir = Math.sign(to[0] - from[0]) || 0;
  const sw = (w, y) => [W2B(w[0], y), w[1]];
  const gy = (y0 + 0.32) / 2;
  return [
    [cock * 0.45, { gather: true, arm: 0.7, ext: 0.6, lead: 0.05 * dir, yaw: gy, sw: sw([from[0] * 0.55, from[1] * 0.55 + 0.08], gy), bY: -0.2 - sink * 0.5, bZ: -0.03, lH: [0.04, -0.1, 0.32], lP: [0.6, -0.7, 0.1], ...SET }],
    [cock, { arm: 1, ext: 0.5, lead: 0.22 * dir, yaw: y0, sw: sw(from, y0), bY: -0.24 - sink, bZ: -0.06, pitch: 0.08, hip: 0.1 * dir, lH: [0.0, -0.13, 0.32], lP: [0.6, -0.8, 0.1], ...SET, ...extra.cocked }],
    [1.0, { e: 'i', arm: 1, ext: 1, lead: 0, yaw: y1, sw: sw(through, y1), bY: -0.28 - sink, bZ: 0.1, pitch: 0.1, hip: -0.06 * dir, lH: [0.26, -0.1, -0.16], lP: [0.8, -0.4, -0.5], ...STEP_IN, ...extra.strike }],
    [1.6, { e: 'o', arm: 1, ext: 0.88, lead: -0.32 * dir, yaw: y2, sw: sw(to, y2), bY: -0.24 - sink, bZ: 0.08, pitch: 0.04, hip: -0.12 * dir, lH: [0.3, -0.04, -0.22], ...STEP_IN, ...extra.follow }],
    [2.0, { settle: true, arm: 1, ext: 0.84, lead: -0.26 * dir, yaw: y2, sw: sw([to[0] * 0.94, to[1] * 0.9], y2), bY: -0.22 - sink, bZ: 0.06, lH: [0.28, -0.06, -0.18], ...STEP_IN }],
  ];
}
const CUTS = {
  up: { from: [-1.6, -1.0], through: [0.0, 0.1], to: [1.2, 1.1], yaw: [0.1, 0.5, 0.85], zone: { kind: 'sector', r: 2.15, ang: 0.9 } }, // the scabbard swept up
  back: { from: [1.4, 0.7], through: [0.0, -0.02], to: [-1.6, -0.5], yaw: [0.95, 0.55, 0.12], zone: { kind: 'sector', r: 2.15, ang: 0.9 } }, // backhand
  flat: { from: [-1.9, 0.1], through: [0.0, 0.04], to: [1.7, 0.06], yaw: [0.05, 0.5, 0.95], zone: { kind: 'sector', r: 2.15, ang: 0.95 } },
};
const overKeys = (cock = 0.7) => [
  [cock * 0.5, { gather: true, ...RAISED, rH: [0.1, 0.3, 0.14], sw: [-0.2, 1.5], bY: -0.1, ...SET }],
  [cock, { ...RAISED, sw: [-0.2, 2.05], rF: [-0.12, 0.42], lF: [0.2, -0.28] }],
  [1.0, { ...CHOP, e: 'i' }],
  [1.6, { ...CHOP, e: 'o', bY: -0.4, pitch: 0.3, sw: [-0.12, -0.8], rH: [0.1, -0.36, 0.42] }],
  [2.0, { settle: true, ...CHOP, bY: -0.34 }],
];
/** One scabbard blow: a CUTS entry, 'thrust' (the pommel / the butt) or 'over'. */
function blow(kind, tell, windup, damage, extra = {}) {
  if (kind === 'thrust') {
    return { tell, windup, active: 0.1, damage, knockback: tell === N ? 0.8 : 1.5, zone: { kind: 'line', r: 1.7, w: 0.7 }, part: 'tip', keys: thrustKeys(1, extra.cock ?? 0.74), ...extra };
  }
  if (kind === 'over') {
    return { tell, windup, active: 0.1, damage, knockback: 1.6, zone: { kind: 'sector', r: 2.3, ang: 0.5 }, part: 'tip', keys: overKeys(extra.cock ?? 0.7), ...extra };
  }
  const C = CUTS[kind];
  return { tell, windup, active: 0.08, damage, knockback: tell === N ? 0.7 : 1.5, zone: C.zone, part: 'tip', keys: slashKeys({ ...C, cock: extra.cock ?? 0.7 }), ...extra };
}
/** The low sweep with the scabbard at the ankles (red: roll through it). */
const sweepKeys = (cock = 0.62) => {
  const out = { arm: 1, ext: 1, lead: 0, sw: [-1.45, -0.5], lH: [0.3, -0.12, 0.08], lP: [0.9, 0.1, -0.2] };
  const wound = { ...CROUCH, arm: 1, ext: 0.55, lead: -0.2, yaw: 1.2, sw: [-2.1, -0.55], lH: [0.12, -0.08, 0.28], hdY: -1.0 };
  return [
    [cock, { ...wound }],
    [1.0, { ...CROUCH, ...out, e: 'i', yaw: 0.9, hdY: -0.6 }],
    [2.0, { ...CROUCH, ...out, e: 'l', yaw: 0.9 - TAU, hdY: -0.6 }],
    [2.001, { e: 'h', yaw: 0.9 }],
  ];
};
/** A kick (the foot strikes: no sweep trail, the glint at his feet). */
const KICK_COIL = { bY: -0.3, pitch: -0.04, yaw: 0.25, hip: 0.1, spX: -0.04, hdY: -0.2, rH: [-0.1, -0.4, 0.0], sw: [-0.6, -0.9], swF: [0, 1, 0], lH: [0.24, 0.0, 0.3], lP: [0.8, -0.2, 0.3], rF: [-0.1, 0.44, 0.14], lF: [0.16, -0.12], rK: [-0.1, 0.4, 1], lK: [0.4, 0, 0.9], flat: 0.5 };
const KICK_OUT = { bY: -0.2, bZ: -0.1, pitch: -0.28, yaw: 0.1, hip: -0.1, spX: -0.1, hdX: 0.1, hdY: -0.1, rH: [-0.12, -0.36, -0.1], sw: [-0.9, -0.8], swF: [0, 1, 0], lH: [0.3, 0.05, 0.1], lP: [0.8, -0.2, 0.3], rF: [-0.04, 0.74, 0.95], lF: [0.14, -0.2], rK: [0, 0.3, 1], lK: [0.4, 0, 0.9], rFy: 0, flat: 0.3 };
function kick(tell, windup, damage, extra = {}) {
  return {
    tell, windup, active: 0.1, damage, knockback: 2.4, zone: { kind: 'sector', r: 1.9, ang: 0.7 }, part: 'feet', noSweep: true, track: 0.7,
    keys: [[0.5, { gather: true, ...KICK_COIL, bY: -0.24, rF: [-0.1, 0.2, 0.06] }], [0.8, { ...KICK_COIL }], [1.0, { ...KICK_OUT, e: 'i' }], [1.6, { ...KICK_OUT, e: 'o', bZ: -0.14 }], [2.0, { ...KICK_OUT, pitch: -0.12, rF: [-0.08, 0.3, 0.6] }]],
    ...extra,
  };
}
/** The shoulder check: he drops his weight and drives into the hero, the scabbard tucked behind. */
const SHOULDER_COIL = { bY: -0.36, bZ: -0.06, pitch: 0.2, yaw: -0.9, hip: -0.2, spX: 0.2, hdY: 0.8, rH: [-0.16, -0.36, -0.12], sw: [-2.6, -0.6], swF: [0, 1, 0], lH: [0.18, -0.2, 0.2], lP: [0.6, -0.5, 0.2], rF: [-0.14, -0.2], lF: [0.2, 0.36] };
const SHOULDER_HIT = { ...SHOULDER_COIL, bZ: 0.26, bY: -0.3, pitch: 0.12, yaw: -1.2, lH: [0.22, -0.1, 0.1], rF: [-0.14, -0.4], lF: [0.22, 0.7] };
/** A glide in with a level scabbard cut at its end. */
function glide(tell, windup, damage, max, extra = {}) {
  return {
    tell, windup, active: 0.1, damage, knockback: 1.0, zone: { kind: 'sector', r: 2.1, ang: 0.95 }, part: 'tip',
    dash: { from: 0.3, to: 0.95, stop: 1.2, max }, close: 0, track: 0.5,
    keys: slashKeys({ from: [-2.0, -0.3], through: [0.0, 0.02], to: [1.5, 0.1], yaw: [0.4, 0.4, 0.9], cock: 0.8, sink: 0.08, extra: { cocked: { pitch: 0.2, bY: -0.32 } } }),
    ...extra,
  };
}
/** The perilous thrust (the scabbard's butt driven like a spear: red, a mikiri can step on it). */
const PERIL_COIL = { ...COIL, bY: -0.34, bZ: -0.14, yaw: 0.95, rH: [-0.12, -0.32, -0.08], sw: [-1.0, -0.08], lH: [0.28, 0.06, 0.1], lP: [0.9, 0.2, -0.2], hdY: -0.8, rF: [-0.12, 0.34], lF: [0.2, -0.38] };
const PERIL_LUNGE = { ...LUNGE, bZ: 0.3, bY: -0.34, rF: [-0.08, 1.05], lF: [0.22, -0.68], lH: [0.2, 0.08, -0.44] };
const perilKeys = () => [[0.4, { gather: true, ...PERIL_COIL }], [0.84, { ...PERIL_COIL, bY: -0.36, rH: [-0.14, -0.33, -0.1] }], [1.0, { ...PERIL_LUNGE, e: 'i' }], [1.6, { ...PERIL_LUNGE, e: 'o', bZ: 0.34 }], [2.0, { ...PERIL_LUNGE }]];
/** A flick of the bare blade at the air (the hanging cuts): a short snap from high to low. */
const flickKeys = (from = [-1.0, 0.9], to = [0.9, -0.6], cock = 0.7) => slashKeys({ from, through: [0.0, 0.1], to, yaw: [0.3, 0.5, 0.8], cock });

// ---------------------------------------------------------------- the moves
export const MOVES = {
  // ======================================================== phase 1: the Sheath
  /** A Knock, Not a Cut: a short check with the pommel (he answers a sword with a knock). */
  knock: {
    label: 'A Knock, Not a Cut', phase: 1, weight: [2.0, 1.8, 2.4], cooldown: 2.5, band: [0, 2.6], recovery: 0.42,
    beats: [blow('thrust', N, 0.46, 12, { zone: { kind: 'line', r: 1.7, w: 0.7 }, dash: { from: 0.7, to: 1.0, stop: 1.0, max: 1.6 }, close: 0 })],
  },
  /** Still in Its Sleep: the sheathed sword raised two-handed and brought down like a beam. */
  lintel: {
    label: 'Still in Its Sleep', phase: 1, weight: [1.5, 1.0, 0.6], cooldown: 3.5, band: [0, 3.6], recovery: 0.55,
    beats: [blow('over', B, 0.6, 22, { cock: 0.72 })],
    recoveryKeys: [[0.5, { ...CHOP, two: 0.4, bY: -0.24, sw: [-0.3, -0.6] }]],
  },
  /** Three Refusals: the scabbard up, back, and the pommel: the deflect chain. */
  refusals: {
    label: 'Three Refusals', phase: 1, weight: [2.4, 0, 0], cooldown: 4, band: [0, 3.4], recovery: 0.55, cat: 'string',
    beats: [blow('up', N, 0.46, 11), blow('back', N, 0.34, 11), blow('thrust', N, 0.34, 12)],
  },
  /** Three Refusals from phase 2: a heavy fourth word. */
  refusals2: {
    label: 'Three Refusals', phase: 2, weight: [0, 2.6, 3.6], cooldown: 4, band: [0, 3.4], recovery: 0.6, cat: 'string',
    beats: [blow('up', N, 0.46, 11), blow('back', N, 0.34, 11), blow('thrust', N, 0.34, 12), blow('over', B, 0.42, 20)],
  },
  /** Sweeping the Road: the scabbard swept round at the ankles, as a traveller clears his path. Red: roll through it. */
  reedCutter: {
    label: 'Sweeping the Road', phase: 1, weight: [1.2, 0.9, 0.6], cooldown: 6, band: [0, 3.2], recovery: 0.6,
    beats: [{ tell: R, windup: 0.64, active: 0.22, damage: 22, knockback: 2.5, knockdown: true, zone: { kind: 'ring', r: 2.9 }, ring: 2.9, part: 'feet', track: 0.6, close: 1.2, keys: sweepKeys(0.62) }],
    recoveryKeys: [[0.4, { ...CROUCH, bY: -0.36, yaw: 0.7, arm: 1, ext: 0.8, sw: [-0.9, -0.5] }]],
  },
  /** Go Back Down the Road: a shoulder check that throws the hero back to a draw's distance (his last warning). */
  shutDoor: {
    label: 'Go Back Down the Road', phase: 1, weight: [1.6, 1.4, 1.0], cooldown: 5, band: [0, 5.2], recovery: 0.5,
    beats: [{
      tell: B, windup: 0.52, active: 0.1, damage: 18, knockback: 3.4, zone: { kind: 'sector', r: 1.8, ang: 0.8 }, part: 'feet', noSweep: true,
      dash: { from: 0.6, to: 1.0, stop: 0.9, max: 4.2 }, close: 0, track: 0.6,
      keys: [[0.4, { ...SHOULDER_COIL }], [0.8, { ...SHOULDER_COIL, bY: -0.4 }], [1.0, { ...SHOULDER_HIT, e: 'i' }], [1.6, { ...SHOULDER_HIT, e: 'o' }], [2.0, { ...SHOULDER_HIT, bZ: 0.2 }]],
    }],
  },
  /** Three Steps of a Long Road: a glide in, a kick, the scabbard's butt: a string that moves. */
  fordSteps: {
    label: 'Three Steps of a Long Road', phase: 1, weight: [1.8, 2.0, 3.0], cooldown: 6, band: [2.5, 7.5], recovery: 0.6, cat: 'string',
    beats: [glide(N, 0.5, 12, 5), kick(N, 0.36, 10, { knockback: 1.2 }), blow('thrust', N, 0.36, 14, { dash: { from: 0.6, to: 1.0, stop: 1.0, max: 2.4 }, close: 0 })],
  },
  /** The Walking Staff: the scabbard's butt driven like a spear from range (the sword he walks with). Red; a roll into it steps on it. */
  tapStone: {
    label: 'The Walking Staff', phase: 1, weight: [1.1, 0.9, 0.6], cooldown: 6, band: [3.0, 8.5], recovery: 0.6,
    beats: [{ tell: R, windup: 0.68, active: 0.12, damage: 26, knockback: 2.5, zone: { kind: 'line', r: 2.1, w: 0.7 }, part: 'tip', mikiri: true, dash: { from: 0.84, to: 1.0, stop: 0.8, max: 6 }, close: 0, track: 0.82, keys: perilKeys() }],
    recoveryKeys: [[0.45, { ...PERIL_LUNGE, bY: -0.26, rH: [0.04, -0.1, 0.45] }]],
  },
  /** A Knock in Reply: his counter out of a deflect. */
  answer: {
    label: 'A Knock in Reply', phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.5,
    beats: [blow('up', N, 0.46, 14, { track: 0.7 }), blow('thrust', B, 0.4, 20)],
  },

  /** ONE BREATH: the draw (ADR-144). The settle, the stillness, the click (the blue flare through the
   *  scabbard's mouth), and the cut: one frame at the cock, the next at the end of a cut up to 4.5 m on.
   *  Parry it or dodge it; a held guard is knocked open; nothing else lives. */
  oneBreath: {
    label: 'One Breath', phase: 1, weight: [4.0, 1.2, 0.4], cooldown: [11, 8, 6], band: [2.2, 8], recovery: 1.15, recoverOpen: 1, cat: 'single',
    beats: [draw({ windup: 1.1, zone: { kind: 'line', r: 5.2, w: 1.3 }, dash: { from: 0.99, to: 1.0, stop: 1.4, max: 4.5 } })],
    recoveryKeys: resheatheKeys(CUT_END2),
  },
  /** Lightless Draw: the charged blow every boss has. Darkness gathers at the hilt; then a dashing
   *  cut of the bare blade. Black: dodge it (a guard is knocked open). Never lethal. */
  lightless: {
    label: 'Lightless Draw', phase: 1, weight: [1.0, 0.8, 0.6], cooldown: 12, band: [2.4, 9], recovery: 1.0, recoverOpen: 1, gapCloser: true,
    beats: [{
      tell: K, bare: true, windup: 1.45, fixed: true, hold: [0.1, 0.5], cock: 0.86, active: 0.14, damage: 38, knockback: 4, knockdown: true,
      zone: { kind: 'sector', r: 2.9, ang: 1.05 }, part: 'hilt', dash: { from: 0.88, to: 1.0, stop: 1.2, max: 7.5 }, close: 0, track: 0.88, noSweep: true,
      keys: [[0.3, { ...SETTLE }], [0.86, { ...COCK, bY: -0.4 }], [1.0, { ...CUT_END, e: 'i' }], [1.6, { ...CUT_END2, e: 'o' }], [2.0, { ...CUT_END2 }]],
    }],
    recoveryKeys: resheatheKeys(CUT_END2),
  },
  /** Ten Thousand Leaves: his flurry, the answer to a streak of guards (DEFENSE.foeStreak): scabbard
   *  blows from every side. */
  leaves: {
    label: 'Ten Thousand Leaves', phase: 1, weight: [0, 0, 0], counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
    beats: [
      blow('flat', N, 0.62, 9, { track: 0.7 }),
      blow('up', N, 0.48, 9, { flit: { r: 2.6 } }),
      blow('back', N, 0.48, 9, { flit: { r: 2.6 } }),
      blow('flat', N, 0.48, 9, { flit: { r: 2.6 } }),
    ],
  },
  /** The resheathe after a reaction left the blade out (sheathed.js): a feint beat (no tell, no hit),
   *  the re-sheathe as its recovery. Manual: never picked. */
  resheathe: {
    label: 'Re-sheathe', phase: 1, weight: [0, 0, 0], manual: true, hidden: true, cooldown: 0, band: [0, 99], recovery: 0.9, recoverOpen: 1,
    beats: [{ feint: true, windup: 0.08, active: 0.04, close: 0, track: 0, keys: [[0.5, { ...CUT_END2 }]] }],
    recoveryKeys: resheatheKeys(CUT_END2),
  },

  // ======================================================== phase 2: A Thumb's Width
  /** Moon Leaves the Water: a rising draw from a low crouch at close range. */
  moonRise: {
    label: 'Moon Leaves the Water', phase: 2, weight: [0, 1.0, 0.4], cooldown: [9, 7, 6], band: [0, 3.6], recovery: 1.15, recoverOpen: 1, cat: 'single',
    beats: [draw({ windup: 0.95, hold: [0.1, 0.55], settle: LOW_SETTLE, zone: { kind: 'sector', r: 3.0, ang: 1.15 }, dash: { from: 0.99, to: 1.0, stop: 1.2, max: 2.0 }, end: RISE_END })],
    recoveryKeys: resheatheKeys(RISE_END),
  },
  /** A Thousand Li: he crosses the whole ground in one draw and ends three metres past the hero, his
   *  back turned: the longest opening. The cut covers the path he crossed (sheathed.js `pathHit`). */
  thousandLi: {
    label: 'A Thousand Li', phase: 2, weight: [0, 0.8, 0.5], cooldown: [12, 9, 8], band: [5, 14], recovery: 1.4, recoverOpen: 1, cat: 'closer', gapCloser: true,
    beats: [draw({ windup: 1.2, hold: [0.15, 0.6], zone: { kind: 'line', r: 13, w: 1.3 }, dash: { from: 0.99, to: 1.0, stop: -3, max: 13 }, end: PASS_END, extra: { selfHit: true, pathHit: true } })],
    recoveryKeys: resheatheKeys(PASS_END),
  },
  /** No Fourth Refusal: Three Refusals whose last word is a rising draw. */
  refusalDraw: {
    label: 'No Fourth Refusal', phase: 2, weight: [0, 1.3, 0.9], cooldown: [0, 9, 8], band: [0, 3.2], recovery: 1.15, recoverOpen: 1, cat: 'string',
    beats: [
      blow('up', N, 0.46, 11), blow('back', N, 0.34, 11), blow('thrust', N, 0.34, 12),
      draw({ windup: 0.9, hold: [0.08, 0.3], settle: LOW_SETTLE, zone: { kind: 'sector', r: 3.0, ang: 1.15 }, end: RISE_END }),
    ],
    recoveryKeys: resheatheKeys(RISE_END),
  },
  /** The Hand That Does Not Draw: the stance with no click and no flare, then a pommel check. */
  falseSettle: {
    label: 'The Hand That Does Not Draw', phase: 2, weight: [0, 1.2, 1.0], cooldown: 7, band: [1.5, 5], recovery: 0.5,
    beats: [
      { feint: true, settle: true, windup: 0.75, active: 0.08, close: 0, track: 0.9, keys: [[DRAW.grip, { ...SETTLE }], [0.9, { ...COCK }], [1.0, { ...COCK }], [2.0, { ...SETTLE, bY: -0.24 }]] },
      blow('thrust', N, 0.46, 14, { dash: { from: 0.6, to: 1.0, stop: 1.0, max: 3 }, close: 0 }),
    ],
  },
  /** The Blade Goes Home: One Breath, and past a dodge a second cut on the way back to the scabbard. */
  returning: {
    label: 'The Blade Goes Home', phase: 2, weight: [0, 0.7, 0.4], cooldown: [0, 10, 8], band: [2.2, 7], recovery: 1.15, recoverOpen: 1, cat: 'string',
    beats: [
      draw({ windup: 1.1, zone: { kind: 'line', r: 5.2, w: 1.3 }, dash: { from: 0.99, to: 1.0, stop: 1.4, max: 4.5 } }),
      { tell: B, bare: true, windup: 0.62, active: 0.08, damage: 18, knockback: 1.2, zone: { kind: 'sector', r: 2.6, ang: 0.9 }, part: 'tip', close: 1.2, track: 0.7,
        keys: slashKeys({ from: [-1.6, 0.3], through: [0.0, 0.0], to: [1.4, -0.4], yaw: [-0.2, 0.3, 0.6], cock: 0.7 }) },
    ],
    recoveryKeys: resheatheKeys(CUT_END),
  },
  /** A Thumb's Width: the phase-2 transition. A thumb's width of blade shows; a ring of pressure
   *  bends the grove. Red: roll through it. */
  thumbWidth: {
    label: "A Thumb's Width (phase 2)", phase: 2, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.8,
    beats: [{
      tell: R, settle: true, windup: 1.7, active: 0.18, damage: TUNING.transition.damage, knockback: TUNING.transition.knockback,
      zone: { kind: 'ring', r: TUNING.transition.ringRadius }, ring: TUNING.transition.ringRadius, part: 'feet', track: 0, close: 0,
      keys: [[0.3, { ...SETTLE }], [0.9, { ...COCK, bY: -0.42 }], [1.0, { ...COCK, e: 'i', bY: -0.3, pitch: 0 }], [2.0, { ...SETTLE, bY: -0.26 }]],
    }],
  },

  // ======================================================== phase 3: the Held Breath
  /** The Vow Gives Way: phase 3's counter: a check, then a draw. */
  answerDraw: {
    label: 'The Vow Gives Way', phase: 3, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 1.15, recoverOpen: 1,
    beats: [blow('up', N, 0.46, 14, { track: 0.7 }), draw({ windup: 0.9, hold: [0.08, 0.3], zone: { kind: 'line', r: 4.2, w: 1.3 }, dash: { from: 0.99, to: 1.0, stop: 1.4, max: 2.5 } })],
    recoveryKeys: resheatheKeys(CUT_END2),
  },
  /** Three Autumns: three passing draws from three sides, re-sheathed in motion between. Each a parry
   *  moment; the chain goes on only past a dodge. */
  threeAutumns: {
    label: 'Three Autumns', phase: 3, weight: [0, 0, 1.1], cooldown: 9, band: [2, 8], recovery: 1.15, recoverOpen: 1, cat: 'string',
    beats: [
      draw({ windup: 1.0, hold: [0.1, 0.35], zone: { kind: 'line', r: 4.6, w: 1.3 }, dash: { from: 0.99, to: 1.0, stop: 1.4, max: 4 } }),
      draw({ windup: 0.78, hold: [0, 0.1], cock: 0.9, zone: { kind: 'line', r: 4.6, w: 1.3 }, dash: { from: 0.99, to: 1.0, stop: 1.4, max: 4 }, extra: { flit: { r: 4.0 } } }),
      draw({ windup: 0.78, hold: [0, 0.1], cock: 0.9, zone: { kind: 'line', r: 4.6, w: 1.3 }, dash: { from: 0.99, to: 1.0, stop: 1.4, max: 4 }, extra: { flit: { r: 4.0 } } }),
    ],
    recoveryKeys: resheatheKeys(CUT_END2),
  },
  /** The Sound Arrives Late: three flicks of the bare blade at the air; lines of heat hang across the
   *  ground and cut one by one, each with its red cue (lateCuts.js). Be out of each line as it cuts. */
  lateRain: {
    label: 'The Sound Arrives Late', phase: 3, weight: [0, 0, 1.2], cooldown: 12, band: [2.5, 12], recovery: 1.0, recoverOpen: 1, cat: 'hazard',
    beats: [{
      tell: R, bare: true, windup: 0.75, active: 0.1, damage: TUNING.late.damage, knockback: TUNING.late.knockback, cast: { kind: 'late', selfCue: true }, hazard: true,
      part: 'tip', close: 0, track: 0.8,
      keys: [[0.3, { ...SETTLE }], [0.55, { ...flickKeys([-1.0, 0.9], [0.9, -0.6])[2][1] }], [0.75, { ...flickKeys([1.0, 0.8], [-0.9, -0.5])[2][1] }], ...flickKeys([-0.6, 1.2], [0.6, -0.8], 0.86).slice(2)],
    }],
    recoveryKeys: resheatheKeys(CUT_END),
  },
  /** The Held Breath: the phase-3 transition. A draw nobody sees; a red ring; on the click every stalk
   *  within nine metres falls. */
  heldBreath: {
    label: 'The Held Breath (phase 3)', phase: 3, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 1.15,
    beats: [{
      tell: R, bare: true, windup: 1.6, active: 0.22, damage: TUNING.transition.damage, knockback: 3, knockdown: true,
      zone: { kind: 'ring', r: TUNING.heldBreath.ringRadius }, ring: TUNING.heldBreath.ringRadius, part: 'feet', track: 0, close: 0,
      keys: [[0.3, { ...SETTLE }], [0.93, { ...COCK, bY: -0.44 }], [1.0, { ...CUT_END, e: 'h', yaw: -0.35 - TAU }], [2.0, { ...CUT_END2, yaw: -0.4 - TAU }], [2.001, { e: 'h', yaw: -0.4 }]],
    }],
    recoveryKeys: resheatheKeys(CUT_END2),
  },
};
export const MOVE_NAMES = Object.keys(MOVES);
/** His counter out of a guard, by phase (kit.counterMove). */
export const counterMove = (phase) => (phase >= 3 ? 'answerDraw' : 'answer');

// ---------------------------------------------------------------- reaction clips (no hits)
const KNEEL = { bY: -0.52, pitch: 0.22, spX: 0.1, hdX: 0.5, rF: [-0.12, 0.32], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 };
// kneeling in seiza, the sword across his knees, both hands resting on it
const SEIZA = {
  bY: -0.6, bZ: -0.06, pitch: 0.04, yaw: 0, hip: 0, spX: 0.08, spY: 0, hdX: 0.32, hdY: 0,
  rF: [-0.13, -0.36], lF: [0.13, -0.36], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], rFy: 0, lFy: 0, flat: 0.2,
  rH: [0.08, -0.46, 0.26], rP: [-0.5, -0.2, -0.8], sw: [1.45, -0.06], swF: [0, 1, 0], lH: [-0.06, -0.46, 0.24], lP: [0.5, -0.2, -0.8],
};

export const CLIPS = {
  ...GUARD_CLIPS,
  flinch: { dur: 0.26, keys: [[0.07, { e: 'o', spX: -0.06, hdX: -0.12, bZ: -0.05, yaw: 0.46 }]] },
  backstep: { dur: 0.42, keys: [[0.12, { bY: -0.18, pitch: -0.08, ...STEP_BACK }], [0.32, { bY: -0.12, rF: [-0.1, 0.22], lF: [0.17, -0.26] }]] },
  sidestep: { dur: 0.36, keys: [[0.12, { bY: -0.2, roll: 0.08, rF: [-0.2, 0.25], lF: [0.25, -0.2] }]] },
  stagger: {
    dur: 0.8,
    keys: [
      [0.12, { e: 'o', pitch: -0.2, bZ: -0.1, bY: -0.14, rH: [-0.3, -0.3, 0.1], sw: [-1.7, -0.2], swF: [0, 1, 0], lH: [0.3, 0.0, 0.1], hdX: -0.2, ...STEP_BACK }],
      [0.5, { pitch: -0.08, bY: -0.16, rH: [-0.2, -0.36, 0.14], sw: [-1.0, -0.5], lH: [0.25, 0.0, 0.2] }],
    ],
  },
  recoil: {
    dur: 1.0,
    keys: [
      [0.1, { e: 'o', pitch: -0.24, bZ: -0.1, rH: [-0.1, 0.2, 0.15], rP: [-0.8, 0.4, -0.4], sw: [-0.5, 1.4], swF: [1, 0, 0], lH: [0.3, 0.05, 0.05], hdX: -0.2, ...STEP_BACK }],
      [0.6, { pitch: -0.12, rH: [-0.1, -0.1, 0.25], sw: [-0.6, 0.3], lH: [0.25, 0.1, 0.1] }],
    ],
  },
  /** A parried draw: the blade beaten up and away, the scabbard still at his hip; he is caught with
   *  the blade out (TUNING.draw.caught). */
  caught: {
    dur: DRAW.caught,
    keys: [
      [0.1, { e: 'o', pitch: -0.28, bZ: -0.12, yaw: -0.3, arm: 1, ext: 0.9, sw: [-1.2, 1.3], lH: [0.06, -0.48, 0.1], lsw: [2.6, -0.6], hdX: -0.22, ...STEP_BACK }],
      [0.7, { pitch: -0.18, bY: -0.2, arm: 1, ext: 0.8, sw: [-1.4, 0.7], lH: [0.06, -0.48, 0.1], lsw: [2.7, -0.6], rF: [-0.12, 0.04], lF: [0.2, -0.46] }],
      [1.3, { pitch: -0.06, bY: -0.16, arm: 1, ext: 0.8, sw: [-1.3, 0.2], lH: [0.06, -0.48, 0.1], lsw: [2.8, -0.55] }],
    ],
  },
  reeling: {
    dur: 1.45,
    keys: [
      [0.12, { e: 'o', pitch: -0.32, bZ: -0.14, bY: -0.12, yaw: -0.2, rH: [-0.34, 0.05, 0.05], rP: [-0.9, 0.3, -0.3], sw: [-2.3, 0.2], swF: [0, 1, 0], lH: [0.32, 0.1, 0.0], lP: [0.9, 0.3, 0.0], hdX: -0.3, rF: [-0.12, 0.05], lF: [0.2, -0.5] }],
      [0.6, { pitch: -0.2, bY: -0.2, yaw: 0.0, rH: [-0.3, -0.05, 0.12], sw: [-2.0, 0.0], lH: [0.3, 0.0, 0.1], hdX: -0.1, rF: [-0.14, -0.15], lF: [0.18, -0.45] }],
      [1.1, { pitch: -0.05, bY: -0.16, rH: [-0.1, -0.3, 0.2], sw: [-0.9, -0.5], lH: [0.1, -0.2, 0.3] }],
    ],
  },
  trampled: {
    dur: 1.5,
    keys: [
      [0.1, { e: 'o', pitch: 0.42, bY: -0.34, bZ: 0.1, rH: [0.02, -0.38, 0.45], rP: [-0.6, -0.6, 0.2], sw: [-0.25, -1.15], swF: [1, 0, 0], lH: [0.2, -0.2, 0.2], hdX: 0.45, rF: [-0.08, 0.7], lF: [0.22, -0.48] }],
      [0.75, { pitch: 0.35, bY: -0.3, rH: [0.0, -0.36, 0.42], sw: [-0.3, -1.1], hdX: 0.4 }],
      [1.0, { e: 'o', pitch: -0.2, bY: -0.16, bZ: -0.1, rH: [-0.25, -0.2, 0.15], sw: [-1.6, -0.3], swF: [0, 1, 0], lH: [0.3, 0.05, 0.05], hdX: -0.1, ...STEP_BACK }],
    ],
  },
  lock: {
    dur: 3, hold: true,
    keys: [[0.1, { e: 'o', two: 0.8, bY: -0.22, bZ: 0.08, pitch: 0.12, yaw: 0.3, rH: [0.08, 0.0, 0.44], sw: [0.5, 0.95], swF: [0, 0.3, -1], rF: [-0.1, 0.4], lF: [0.2, -0.42] }]],
  },
  /** Posture broken: down on one knee, leaning on the sword (drawn: sheathed.js), head bowed. */
  broken: {
    dur: 3.2, hold: true,
    keys: [
      [0.25, { e: 'o', ...KNEEL, rH: [-0.15, -0.4, 0.3], rP: [-0.7, -0.4, -0.3], sw: [-0.6, -1.0], swF: [1, 0, 0], lH: [0.05, -0.45, 0.15], lP: [0.6, -0.3, 0.3] }],
      [2.9, { ...KNEEL, hdX: 0.4, rH: [-0.15, -0.38, 0.3], sw: [-0.6, -0.95], lH: [0.05, -0.43, 0.15] }],
      [3.2, { ...KNEEL, bY: -0.4, hdX: 0.2, rH: [-0.1, -0.3, 0.32], sw: [-0.5, -0.6], lH: [0.05, -0.3, 0.2] }],
    ],
  },
  executed: {
    dur: 1.3,
    keys: [
      [0.0, { ...KNEEL, rH: [-0.15, -0.4, 0.3], sw: [-0.6, -1.0], lH: [0.05, -0.45, 0.15] }],
      [0.2, { e: 'o', ...KNEEL, pitch: -0.25, hdX: -0.3, bY: -0.45, rH: [-0.2, -0.3, 0.1], sw: [-1.2, -0.6], lH: [0.0, -0.1, 0.25] }],
      [0.7, { ...KNEEL, pitch: 0.3, hdX: 0.5, bY: -0.54, rH: [-0.15, -0.42, 0.28], sw: [-0.6, -1.05], lH: [0.0, -0.4, 0.25] }],
      [1.05, { ...KNEEL, bY: -0.3, hdX: 0.15, rH: [-0.1, -0.3, 0.3], sw: [-0.5, -0.6], lH: [0.05, -0.2, 0.2], ...STEP_BACK }],
    ],
  },
  /** Defeated: he kneels and lays the sheathed sword across his knees again. */
  death: {
    dur: 2.4, hold: true,
    keys: [
      [0.4, { e: 'o', ...KNEEL, pitch: 0.1, rH: [0.0, -0.3, 0.3], sw: [-0.3, -0.9], lH: [0.0, -0.3, 0.2] }],
      [1.2, { ...SEIZA, hdX: 0.55, pitch: 0.12 }],
      [2.4, { ...SEIZA, hdX: 0.7, pitch: 0.18 }],
    ],
  },
  /** Kneeling before the graves, the sword across his knees (asleep: the fight has not begun). */
  meditate: { dur: 1, hold: true, keys: [[0, { ...SEIZA }]] },
  /** The intro: he rises with the sword in his hand, turns his head, and lets it hang. */
  intro: {
    dur: 2.4,
    keys: [
      [0, { ...SEIZA }],
      [0.4, { ...SEIZA, hdX: 0.1 }],
      [1.0, { bY: -0.2, yaw: 0.1, hdX: 0.1, rH: [0.0, -0.4, 0.2], sw: [0.4, -0.7], swF: [0, 1, 0], lH: [0.04, -0.46, 0.06], rF: [-0.12, 0.12], lF: [0.14, -0.12] }],
      [1.7, { bY: -0.1, yaw: 0.2, hdX: 0.06, hdY: -0.3, rH: [-0.04, -0.44, 0.12], sw: [-0.2, -0.95], lH: [0.04, -0.47, 0.02] }],
    ],
  },
};
/** Compiled reaction clips (build time). */
export const CLIP = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
for (const [k, c] of Object.entries(CLIP)) c.name = k;

/** A move as it will play this time (duelist/realise.js). */
export const realise = makeRealise({ TUNING, MOVES, compileClip: (keys, dur) => compileClip(keys, dur), completeBeat });

export { GUARD, ANK };
