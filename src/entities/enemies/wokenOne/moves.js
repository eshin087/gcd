import { TELL } from '../../../combat/rules.js';
import { makeRealise } from '../duelist/realise.js';
import { X as ASC, CLIPS as ASC_CLIPS } from '../ascendant/moves.js';
import { PHASE_POSES, BEHIND } from './poses.js';
import { TUNING } from './tuning.js';

// Xin Yi's moves and reaction clips, as data (ADR-156; COMBAT.md → "The One Who Woke"). He fights
// BARE-HANDED (phase 2: a gun in each hand, which strikes as a fist and fires): his blows are built with
// Tian Lei's exported strike builders (ascendant/moves.js X: punch, kick, elbow, strikeKeys), and his
// reaction clips are Tian Lei's bare-handed ones with his own on top (the Lean, the fall, the Bend, the
// stop), compiled round each phase's guard (poses.js). The MOVE / BEAT format is the Ash Disciple's
// (ashDisciple/moves.js header); `part` names the striking limb (wokenOne.js: the engine's blade).
// PHASE 1 keeps the LEFT HAND BEHIND HIS BACK: every move realised in phase 1 has its left hand keyed
// there (oneHand, below: the realiser of phase 1 reads MOVES_P1), so his phase-1 blows are the right
// hand's and the feet's. His own beat fields (wokenOne.js reads them; the brain ignores them):
//   beckon: true        (a feint beat) THE BECKON: the open hand, palm up, the fingers curling twice: the
//                       sign that the long string comes (The First Lesson's first keys)
//   wall: true          Borrowed Wall: two steps up the nearest upright by his path, a bite where he
//                       kicked off, then the flying kick (no piece in reach: a plain flying kick)
//   iron: 'rain' | 'heavy' | 'point' | 'wheel' | 'reload'   phase 2's guns (iron.js)
//   bolt: true          (a cast) a palm bolt in the code's green, returnable (phase 3)
//   send: true          Return to Sender: the hanging bolts sent back as one blow (one cue, one result)
//   unwrite: true       (a cast) bricks torn out of the code pillars and thrown one by one (red each)
//   rise: true          (Leaving the Floor) the burst as he goes straight up
//   fist: true          the Falling Fist: the spot fixed at u 0.7, the dive, the crater, then the front
//   pass: true          the Low Pass: the line fixed at u 0.7, one flat pass along it
//   dive: true          the Dive Within (black): the hall's letters stream into his chest
// And on a MOVE: ranged (counts toward the reload), needs ('held3': three bolts hanging), mirrorOf
// (deja vu's mirrored copy of a move: phase 3 replays it left for right), manual (never picked: only a
// link starts it), cat (the director's category), noWorld (a beat: no world blow of the brain's own).
// Rules (tests/integration/woke.mjs DATA): a tell on every real hit, a move's first real windup >=
// TUNING.minFirstWindup in every phase it is used in, impacts >= TUNING.minHitGap apart, a red / black
// cue at least pressure.guard.sep + margin after a white / blue one inside a move.

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const { punch, kick, elbow, strikeKeys, F, feet: FT } = ASC;

/** A dash on a beat: from `from` of the windup to the impact, stopping `stop` m short, `max` m at most. */
const dash = (max, from = 0.6, stop = 1.0) => ({ dash: { from, to: 1.0, stop, max }, close: 0 });
/** His head turned away from the hero through a blow (he looks away between blows: phase 1). */
const away = (beat, k = 0.7) => ({ ...beat, keys: beat.keys.map(([u, p]) => [u, u < 0.95 ? { ...p, hdY: (p.hdY ?? 0) + k } : p]) });

// ---------------------------------------------------------------- pose fragments
/** THE BECKON: the right hand forward, palm up, the fingers curling twice (the wrist turns up and in). */
const BECKON = { yaw: -0.2, bY: -0.04, hdY: 0.1, hdX: 0.0, rH: [0.04, -0.06, 0.48], rP: [-0.5, -0.9, 0.2], sw: [0.4, -1.3] };
const CURL = { ...BECKON, rH: [0.04, 0.0, 0.42], rP: [-0.4, -0.6, 0.6], sw: [0.4, -0.5] };
const beckonKeys = () => [
  [0.12, F({ ...BECKON, rH: [0.04, -0.2, 0.36] })],
  [0.3, F(BECKON)], [0.45, F(CURL)], [0.6, F(BECKON)], [0.75, F(CURL)], [0.9, F(BECKON)],
  [1.0, F({ ...BECKON, rH: [0.04, -0.2, 0.36] })], [2.0, F({ ...BECKON, rH: [0.04, -0.2, 0.36] })],
];
/** Aiming: the gun arm(s) straight out at the hero, the body bladed. */
const AIM_R = { yaw: -0.9, bY: -0.1, hdY: 0.9, rH: [0.1, 0.12, 0.62], rP: [-0.8, -0.2, -0.4], lH: [-0.04, -0.1, 0.3], sw: [0.0, 0.0] };
const AIM_2 = { yaw: -0.1, bY: -0.14, hdY: 0.1, rH: [0.12, 0.1, 0.6], rP: [-0.8, -0.2, -0.4], lH: [-0.12, 0.1, 0.6], lP: [0.8, -0.2, -0.4], sw: [0.0, 0.0] };
const aimKeys = (both = false, cock = 0.7) => strikeKeys({
  cock,
  coil: { ...(both ? AIM_2 : AIM_R), rH: [0.06, -0.1, 0.36], lH: both ? [-0.06, -0.1, 0.36] : [-0.04, -0.12, 0.3], ...FT.OR },
  hit: { ...(both ? AIM_2 : AIM_R), ...FT.OR },
  after: { ...(both ? AIM_2 : AIM_R), bZ: -0.06, pitch: -0.08, ...FT.OR },
});
/** The palm thrust that throws a bolt (phase 3): sunk, the palm driven out flat. */
const boltKeys = (cock = 0.72) => strikeKeys({
  cock,
  coil: { yaw: -0.6, bY: -0.28, hip: -0.12, rH: [0.0, -0.12, 0.08], rP: [-0.8, -0.6, -0.4], lH: [0.0, 0.08, 0.36], ...FT.LOW },
  hit: { yaw: 0.25, bY: -0.3, bZ: 0.16, pitch: 0.1, hip: 0.14, rH: [0.1, 0.0, 0.6], rP: [-0.8, -0.5, -0.2], lH: [-0.06, -0.1, 0.12], ...FT.LUNGE },
});
/** The cartwheel to one side, firing low (phase 2's Turning Wheel). */
const wheelKeys = () => [
  [0.3, F({ yaw: -0.2, bY: -0.3, roll: 0.3, rH: [0.1, 0.1, 0.3], lH: [-0.1, 0.1, 0.3], ...FT.LOW })],
  [0.6, F({ yaw: 0.0, bY: -0.1, roll: 1.3, pitch: 0.1, rH: [-0.3, -0.6, 0.1], lH: [0.3, 0.5, 0.1], rF: [-0.3, 0.6, 0.0], lF: [0.3, 0.9, 0.1] })],
  [0.85, F({ yaw: 0.0, bY: -0.2, roll: 2.4, rH: [-0.3, -0.6, 0.2], lH: [0.3, 0.4, 0.2], rF: [-0.4, 0.4, -0.1], lF: [0.3, 1.0, 0.1] })],
  [1.0, { ...F({ yaw: -0.3, bY: -0.4, roll: 0.2, rH: [0.12, -0.3, 0.55], lH: [-0.12, -0.3, 0.55], ...FT.LOW }), e: 'l' }],
  [2.0, F({ yaw: -0.3, bY: -0.32, rH: [0.12, -0.24, 0.5], lH: [-0.12, -0.24, 0.5], ...FT.LOW })],
];
/** The burst as he leaves the floor: crouched, then straight up, the arms thrown wide, the coat spread. */
const riseKeys = () => strikeKeys({
  cock: 0.7,
  coil: { yaw: 0, bY: -0.42, pitch: 0.16, hdX: 0.2, rH: [-0.04, -0.4, 0.0], rP: [-0.8, -0.4, -0.6], lH: [0.04, -0.4, 0.0], lP: [0.8, -0.4, -0.6], rF: [-0.3, 0.0], lF: [0.3, 0.0], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7] },
  hit: { yaw: 0, bY: 0.0, pitch: -0.1, hdX: -0.1, rH: [-0.36, -0.3, 0.04], rP: [-0.9, 0.2, -0.3], lH: [0.36, -0.3, 0.04], lP: [0.9, 0.2, -0.3], rF: [-0.12, 0.06, 0.0], lF: [0.12, 0.06, 0.0] },
});
/** Hanging in the air: upright, the arms a little out, the feet together and pointed down. */
const HOVER = { yaw: 0, bY: 0.0, pitch: -0.04, rH: [-0.3, -0.36, 0.06], lH: [0.3, -0.36, 0.06], rF: [-0.08, 0.1, 0.02], lF: [0.08, 0.1, 0.02], rK: [0, 0, 1], lK: [0, 0, 1], flat: 0.3 };
const hoverKeys = () => [[0.2, F(HOVER)], [1.0, F({ ...HOVER, bY: 0.02 })], [2.0, F(HOVER)]];
/** The Falling Fist: from the hover he pitches over head-first, the right fist driven down into the floor. */
const fistKeys = () => [
  [0.4, F({ ...HOVER, pitch: 0.4, rH: [0.0, 0.3, 0.2], rP: [-0.8, 0.5, -0.4] })],
  [0.7, F({ ...HOVER, pitch: 0.9, hdX: 0.4, rH: [0.0, 0.46, 0.0], rP: [-0.7, 0.6, -0.4], lH: [0.3, -0.2, 0.2] })],
  [1.0, { ...F({ bY: -0.55, pitch: 0.5, hdX: 0.4, rH: [0.06, -0.55, 0.42], rP: [-0.6, -0.6, 0.2], lH: [-0.1, -0.2, 0.2], rF: [-0.2, -0.36], lF: [0.24, 0.3], rK: [-0.6, 0, 0.8], lK: [0.6, 0, 0.8] }), e: 'l' }],
  [2.0, F({ bY: -0.5, pitch: 0.4, hdX: 0.3, rH: [0.06, -0.5, 0.4], lH: [-0.1, -0.2, 0.24], rF: [-0.2, -0.36], lF: [0.24, 0.3], rK: [-0.6, 0, 0.8], lK: [0.6, 0, 0.8] })],
];
/** The Low Pass: flat out along the floor, the lead fist forward, the coat streaming behind. */
const passKeys = () => [
  [0.5, F({ ...HOVER, pitch: 0.3 })],
  [0.85, F({ ...HOVER, pitch: 0.9, rH: [0.1, 0.3, 0.4], lH: [0.3, -0.4, -0.1] })],
  [1.0, { ...F({ ...HOVER, pitch: 1.35, rH: [0.06, 0.5, 0.5], rP: [-0.8, 0.2, -0.3], lH: [0.3, -0.4, -0.2], rF: [-0.06, 0.2, -0.3], lF: [0.06, 0.2, -0.3] }), e: 'l' }],
  [2.0, F({ ...HOVER, pitch: 1.2, rH: [0.06, 0.45, 0.5], lH: [0.3, -0.4, -0.2], rF: [-0.06, 0.2, -0.3], lF: [0.06, 0.2, -0.3] })],
];
/** The Dive Within: sunk low, both palms drawn to the chest (the hall's letters stream in), then the lunge. */
const diveKeys = () => strikeKeys({
  cock: 0.86,
  coil: { yaw: -0.1, bY: -0.42, pitch: 0.12, hdX: 0.1, rH: [0.1, -0.02, 0.06], lH: [-0.1, -0.02, 0.06], rP: [-0.8, -0.5, -0.5], lP: [0.8, -0.5, -0.5], ...FT.LOW },
  hit: { yaw: 0.1, bY: -0.24, bZ: 0.26, pitch: 0.4, hdX: 0.1, rH: [0.14, -0.02, 0.6], rP: [-0.8, -0.3, -0.2], lH: [-0.1, -0.3, 0.0], ...FT.LUNGE },
});
/** Return to Sender: both palms turned out toward the hero (the bolts leave together). */
const sendKeys = () => strikeKeys({
  cock: 0.8,
  coil: { yaw: 0, bY: -0.1, pitch: -0.06, rH: [-0.2, 0.2, 0.36], lH: [0.2, 0.2, 0.36], rP: [-0.9, 0.2, -0.3], lP: [0.9, 0.2, -0.3], ...FT.OR },
  hit: { yaw: 0, bY: -0.16, bZ: 0.1, pitch: 0.08, rH: [-0.1, 0.06, 0.6], lH: [0.1, 0.06, 0.6], rP: [-0.8, -0.2, -0.2], lP: [0.8, -0.2, -0.2], ...FT.OR },
});
/** The Still Hand: the right palm raised flat before him, the left at his side; the weight settled. */
const STILL = { yaw: -0.2, bY: -0.16, bZ: -0.04, pitch: -0.02, hdX: 0.04, rH: [0.06, 0.18, 0.5], rP: [-0.8, -0.8, -0.1], lH: [0.06, -0.5, 0.08], lP: [0.9, -0.2, -0.3], sw: [0.0, 1.5], lF: [0.2, 0.26], rF: [-0.2, -0.2], lFy: 0.25, rFy: -0.4, rK: [-0.4, 0, 0.9], lK: [0.4, 0, 0.9] };
const stanceKeys = (P) => [
  [0.4, F({ ...P, bY: P.bY * 0.6, rH: [P.rH[0], P.rH[1] - 0.2, P.rH[2] * 0.7] })],
  [0.8, F(P)], [1.0, F({ ...P, bY: P.bY - 0.02 })], [2.0, F(P)],
];
/** THE FALL: on his back on the floor, the arms out, the face to the ceiling. */
export const FALLEN = { bY: -0.82, pitch: -1.42, hdX: -0.2, yaw: 0, rH: [-0.36, -0.3, 0.1], rP: [-0.9, 0.2, 0.0], lH: [0.36, -0.3, 0.1], lP: [0.9, 0.2, 0.0], rF: [-0.16, 0.12, 0.7], lF: [0.18, 0.12, 0.62], rK: [0, 1, 0.2], lK: [0, 1, 0.2], flat: 0.1 };

// ---------------------------------------------------------------- beats
const T = TUNING;
const ST = T.stance;
/** A counter stance (Tian Lei's Still Water): a feint with a bait hold, catching from ST.from. */
const stance = (P) => ({
  tell: N, windup: ST.windup, fixed: true, hold: ST.hold, active: 0.05, damage: 0, feint: true, stance: { from: ST.from, open: ST.open },
  part: 'fistR', close: 0, track: 0.9, keys: stanceKeys(P),
});
/** A shot from the right gun (`both`: both guns): a cast that cues itself as it nears the hero. */
const shotBeat = (tell, windup, damage, o = {}) => {
  const { both = false, cock = 0.7, ...extra } = o;
  return { tell, windup, active: 0.06, damage, knockback: 1.2, cast: { kind: 'shot', selfCue: true }, part: 'fistR', close: 0, track: 0.92, keys: aimKeys(both, cock), ...extra };
};
/** A palm bolt (phase 3): a cast that cues itself; returnable. */
const boltBeat = (windup, damage, o = {}) => ({
  tell: B, windup, active: 0.06, damage, knockback: 1.4, cast: { kind: 'bolt', selfCue: true }, bolt: true, part: 'fistR', close: 0, track: 0.92, keys: boltKeys(), ...o,
});
/** A transition: down on one knee, then the ring (red), as every transition. */
const transitionBeat = (C, keys) => ({
  tell: R, windup: C.windup, fixed: true, active: 0.2, damage: C.damage, knockback: C.knockback, knockdown: true,
  zone: { kind: 'ring', r: C.ringRadius }, ring: C.ringRadius, part: 'feet', track: 0, close: 0, cock: 0.9, keys,
});
const kneelKeys = () => [
  [0.2, F({ bY: -0.55, pitch: 0.28, yaw: 0, hdX: 0.55, rH: [0.06, -0.52, 0.32], lH: [0.02, -0.4, 0.3], rF: [-0.14, 0.3], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 })],
  [0.7, F({ bY: -0.4, pitch: 0.1, yaw: 0, hdX: 0.1, rH: [-0.1, -0.44, 0.02], lH: [0.1, -0.44, 0.02], rF: [-0.32, 0.02], lF: [0.32, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3 })],
  [0.9, F({ bY: -0.44, pitch: 0.2, yaw: 0, hdX: 0.3, rH: [0.2, -0.04, 0.24], lH: [-0.2, -0.02, 0.26], rF: [-0.34, 0.02], lF: [0.34, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3 })],
  [1.0, { ...F({ bY: -0.08, pitch: -0.22, yaw: 0, hdX: -0.35, rH: [-0.44, 0.1, 0.12], lH: [0.44, 0.1, 0.12], rF: [-0.3, 0.0], lF: [0.3, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3 }), e: 'o' }],
  [2.0, F({ bY: -0.1, pitch: -0.16, yaw: 0, hdX: -0.25, rH: [-0.4, 0.06, 0.14], lH: [0.4, 0.06, 0.14], rF: [-0.3, 0.0], lF: [0.3, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3 })],
];
/** The rising: off his back without his hands (stiff, from the heels), standing; the arms thrown wide
 *  as the ring goes out; then the right palm raised and held (the recovery's keys). */
const risingKeys = () => [
  [0.0, F(FALLEN)],
  [0.25, F({ ...FALLEN, pitch: -1.3, bY: -0.78 })],
  [0.55, F({ bY: -0.36, pitch: -0.5, hdX: -0.1, yaw: 0, rH: [-0.1, -0.5, 0.06], lH: [0.1, -0.5, 0.06], rF: [-0.14, 0.06], lF: [0.14, 0.06], rK: [0, 0, 1], lK: [0, 0, 1] })],
  [0.8, F({ bY: -0.02, pitch: 0.0, yaw: 0, rH: [-0.06, -0.5, 0.06], lH: [0.06, -0.5, 0.06], rF: [-0.14, 0.0], lF: [0.14, 0.0] })],
  [0.94, F({ bY: -0.2, pitch: 0.12, yaw: 0, hdX: 0.1, rH: [0.06, -0.1, 0.2], lH: [-0.06, -0.1, 0.2], rF: [-0.28, 0.0], lF: [0.28, 0.0], rK: [-0.6, 0, 0.8], lK: [0.6, 0, 0.8] })],
  [1.0, { ...F({ bY: -0.04, pitch: -0.16, yaw: 0, hdX: -0.2, rH: [-0.44, 0.1, 0.12], lH: [0.44, 0.1, 0.12], rF: [-0.28, 0.0], lF: [0.28, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8] }), e: 'o' }],
  [2.0, F({ ...STILL })],
];

/** The moves whose string deja vu replays (TUNING.dejavu): their builders, `L` true = mirrored. */
const DEJAVU_BUILD = {
  lesson: (L) => ({
    label: 'The First Lesson', phase: 1, weight: [2.2, 1.2, 0.9], cooldown: 7, band: [0, 3.4], recovery: 0.7, cat: 'string',
    beats: [
      { feint: true, beckon: true, windup: 0.7, active: 0.05, close: 0, track: 1, part: 'fistR', keys: beckonKeys() },
      punch('cross', N, 0.46, 9, { left: L }),
      punch('hook', N, 0.34, 9, { left: L }),
      punch('backfist', N, 0.34, 9, { left: L }),
      kick('front', N, 0.36, 10, { left: L }),
      punch('palm', B, 0.5, 20, { flare: true, left: L }),
    ],
  }),
  stairKick: (L) => ({
    label: 'Climbing the Stair', phase: 1, weight: [1.6, 1.0, 0.8], cooldown: 6, band: [0, 3.6], recovery: 0.65, cat: 'string',
    beats: [kick('front', N, 0.48, 10, { left: L }), kick('round', N, 0.36, 11, { left: L }), kick('side', B, 0.42, 18, { left: L })],
  }),
  closeIron: (L) => ({
    label: 'Close Iron', phase: 2, weight: [0, 1.8, 0], cooldown: 5, band: [0, 3.2], recovery: 0.6, cat: 'string',
    beats: [
      elbow(N, 0.46, 10, { left: L }),
      punch('backfist', N, 0.34, 10, { left: L }),
      { ...punch('cross', B, 0.5, 20, { flare: true, left: L }), iron: 'point', zone: { kind: 'line', r: 3.2, w: 0.9 } },
    ],
  }),
  thousandHands: (L) => ({
    label: 'A Thousand Hands', phase: 3, weight: [0, 0, 1.8], cooldown: 6, band: [0, 3.4], recovery: 0.7, cat: 'string',
    beats: [
      punch('cross', N, 0.46, 8, { left: L }),
      punch('hook', N, 0.32, 8, { left: !L }),
      punch('cross', N, 0.32, 8, { left: L }),
      // (skipped frames: he tears into a column of digits and prints again at the hero's other side)
      { ...punch('hook', N, 0.46, 8, { left: !L }), flit: { r: 2.3 } },
      punch('cross', N, 0.32, 8, { left: L }),
      kick('round', N, 0.34, 8, { left: !L }),
      punch('palm', B, 0.5, 20, { flare: true, left: L }),
    ],
  }),
};
export const DEJAVU_MOVES = Object.freeze(Object.keys(DEJAVU_BUILD));

// ---------------------------------------------------------------- the moves
export const MOVES = {
  // ================================================================ phase 1: the Sparring Hall, one hand
  ...Object.fromEntries(Object.entries(DEJAVU_BUILD).map(([k, f]) => [k, f(false)])),
  /** Idle Hand: a jab and a backfist, his head turned away. */
  idleHand: {
    label: 'Idle Hand', phase: 1, weight: [2.0, 1.2, 0.8], cooldown: 3.5, band: [0, 3.2], recovery: 0.5, cat: 'string',
    beats: [away(punch('cross', N, 0.44, 10)), away(punch('backfist', N, 0.34, 11))],
  },
  /** Brushing Dust: a palm shove that makes range. */
  brushOff: {
    label: 'Brushing Dust', phase: 1, weight: [1.2, 0.8, 0.5], cooldown: 5, band: [0, 2.8], recovery: 0.55, cat: 'single',
    beats: [punch('palm', B, 0.55, 20, { knockback: 3.4 })],
  },
  /** Low Wind: a sweep at the ankles (red: roll through it). */
  lowWind: {
    label: 'Low Wind', phase: 1, weight: [1.0, 0.8, 0.6], cooldown: 6, band: [0, 3.0], recovery: 0.7, cat: 'hazard',
    beats: [{ ...kick('sweep', R, 0.64, 22), knockdown: true, ring: 2.2 }],
  },
  /** Borrowed Wall: two steps up the nearest upright by his path, then a flying kick (a parry moment). */
  wallStep: {
    label: 'Borrowed Wall', phase: 1, weight: [1.0, 0.8, 0.6], cooldown: 7, band: [5, 11], recovery: 0.7, cat: 'closer', gapCloser: true,
    beats: [{
      ...kick('flying', B, 0.9, 22, { flare: true, cock: 0.62 }), wall: true, air: true, track: 0.8,
      dash: { from: 0.45, to: 1.0, stop: 1.4, max: 10 }, close: 0,
      lift: [[0.15, 0], [0.42, 1.3], [0.7, 1.5], [1.0, 0.9], [1.6, 0.3], [2.0, 0]],
    }],
  },

  // ================================================================ phase 2: the Pillared Hall, iron
  /** Iron Rain: he strafes round you firing from alternating hands; the last shot big (returnable). */
  ironRain: {
    label: 'Iron Rain', phase: 2, weight: [0, 2.2, 0], cooldown: 7, band: [4, 13], recovery: 0.6, cat: 'ranged', ranged: true,
    beats: [
      {
        tell: N, windup: 0.8, active: 0.06, damage: 0, iron: 'rain', selfHit: true, noWorld: true, zone: { kind: 'line', r: 14, w: 0.6 },
        sustain: { dur: T.ironRain.dur, tick: T.ironRain.dur / (T.ironRain.count - 1) }, part: 'fistR', close: 0, track: 1, keys: aimKeys(true),
      },
      shotBeat(B, 0.42, T.ironRain.last, { iron: 'heavy', both: true }),
    ],
  },
  /** Two Thunders: two heavy shots, both returnable. */
  twoThunders: {
    label: 'Two Thunders', phase: 2, weight: [0, 1.6, 0], cooldown: 6, band: [3, 13], recovery: 0.6, cat: 'ranged', ranged: true,
    beats: [shotBeat(B, 0.7, 16, { iron: 'heavy' }), shotBeat(B, 0.55, 16, { iron: 'heavy', both: true })],
  },
  /** Turning Wheel: a cartwheel to one side, firing low: a line along the floor (red: roll through it). */
  turningWheel: {
    label: 'Turning Wheel', phase: 2, weight: [0, 1.0, 0], cooldown: 7, band: [2, 9], recovery: 0.65, cat: 'hazard', ranged: true,
    beats: [{ tell: R, windup: 0.7, active: 0.12, damage: 20, knockback: 2, iron: 'wheel', zone: { kind: 'line', r: 9, w: 1.4 }, part: 'fistR', close: 0, track: 0.75, cock: 0.85, keys: wheelKeys() }],
  },
  /** The reload: both guns thrown away, two more from the coat; his guard down (iron.js weighs it). */
  reload: {
    label: 'Reload', phase: 2, weight: [0, 0.05, 0], cooldown: 2, band: [0, 30], recovery: 0.2, recoverOpen: 1, cat: 'single', hidden: true,
    beats: [{ feint: true, iron: 'reload', windup: T.reload.dur, active: 0.05, close: 0, track: 0.4, keys: [[0.3, F({ yaw: 0, bY: -0.1, rH: [-0.36, -0.3, 0.1], lH: [0.36, -0.3, 0.1] })], [0.7, F({ yaw: 0, bY: -0.12, rH: [0.1, -0.06, -0.06], lH: [-0.1, -0.06, -0.06] })], [1.0, F({ yaw: 0, bY: -0.12, rH: [0.04, -0.22, 0.32], lH: [-0.04, -0.22, 0.32] })], [2.0, F({ yaw: 0, bY: -0.12, rH: [0.04, -0.22, 0.32], lH: [-0.04, -0.22, 0.32] })]] }],
  },

  // ================================================================ phase 3: the Source, the One
  /** The Still Hand: the raised flat palm; a cut into it is caught and answered by a one-inch push. */
  stillHand: {
    label: 'The Still Hand', phase: 3, weight: [0, 0, 1.2], cooldown: 9, band: [0, 3.2], recovery: 0.6, cat: 'single',
    beats: [stance(STILL), { ...punch('palm', B, 0.42, 22, { lock: true, flare: true }), close: 0.8 }],
  },
  /** Pushing Hands: two palm bolts in the code's green, both returnable (a returned one hangs: the stop). */
  pushingHands: {
    label: 'Pushing Hands', phase: 3, weight: [0, 0, 1.6], cooldown: 5, band: [3, 13], recovery: 0.6, cat: 'ranged', ranged: true,
    beats: [boltBeat(0.6, 16), boltBeat(0.5, 16, { keys: boltKeys(0.7) })],
  },
  /** Return to Sender: three hanging bolts turn and fly at you together: ONE blue flare, one result. */
  sentBack: {
    label: 'Return to Sender', phase: 3, weight: [0, 0, 1], cooldown: 1, band: [0, 30], recovery: 0.6, cat: 'single', needs: 'held3',
    beats: [{ tell: B, flare: true, windup: 0.9, active: 0.08, damage: 24, knockback: 2.2, send: true, noWorld: true, zone: { kind: 'ring', r: 30 }, part: 'palms', close: 0, track: 1, keys: sendKeys() }],
  },
  /** Unwriting: bricks torn out of the code pillars and thrown one by one (red each; no pillar: never). */
  unwriting: {
    label: 'Unwriting', phase: 3, weight: [0, 0, 1.0], cooldown: 9, band: [3, 13], recovery: 1.9, cat: 'terrain',
    beats: [{ tell: R, windup: 0.7, active: 0.06, damage: T.unwriting.damage, unwrite: true, cast: { kind: 'unwrite', selfCue: true }, part: 'palms', close: 0, track: 0.9, keys: sendKeys() }],
  },
  /** Leaving the Floor: straight up in a burst (red), he hangs, then the Falling Fist or the Low Pass. */
  leaveFloor: {
    label: 'Leaving the Floor', phase: 3, weight: [0, 0, 1.1], cooldown: 10, band: [0, 12], recovery: 0.6, cat: 'area',
    beats: [
      { tell: R, windup: 0.8, active: 0.15, damage: T.flight.burst.damage, knockback: T.flight.burst.knockback, rise: true, air: true, zone: { kind: 'ring', r: T.flight.burst.r }, ring: T.flight.burst.r, part: 'feet', close: 0, track: 0.5, keys: riseKeys(), lift: [[0.9, 0], [1.0, 1.0], [2.0, T.flight.hover]] },
      { feint: true, windup: 0.9, active: 0.05, close: 0, track: 1, keys: hoverKeys(), lift: [[0, T.flight.hover], [1.0, T.flight.hover + 0.2], [2.0, T.flight.hover + 0.2]] },
      {
        pick: [
          { tell: R, windup: 1.1, fixed: true, active: 0.12, damage: T.flight.fist.damage, knockback: 3, knockdown: true, fist: true, air: true, zone: { kind: 'ring', r: T.flight.fist.crater }, ring: T.flight.fist.crater, part: 'fistR', close: 0, track: 0.7, cock: 0.7, keys: fistKeys(), lift: [[0, T.flight.hover + 0.2], [0.7, T.flight.hover + 0.6], [1.0, 0]] },
          { tell: R, windup: 0.9, fixed: true, active: 0.35, damage: T.flight.lowPass.damage, knockback: 3, knockdown: true, pass: true, air: true, zone: { kind: 'line', r: T.flight.lowPass.len, w: T.flight.lowPass.w }, part: 'fistR', close: 0, track: 0.7, cock: 0.7, keys: passKeys(), lift: [[0, T.flight.hover + 0.2], [0.7, T.flight.hover], [1.0, T.flight.lowPass.y], [1.9, T.flight.lowPass.y], [2.0, 0]] },
        ],
      },
    ],
  },
  /** The Dive Within: the charged blow (black): the hall's letters stream into his chest, a flat lunge. */
  diveWithin: {
    label: 'The Dive Within', phase: 3, weight: [0, 0, 0.7], cooldown: 14, band: [2, 9], recovery: 0.9, cat: 'closer', gapCloser: true,
    beats: [{ tell: K, windup: 1.5, hold: [0.1, 0.5], active: 0.1, damage: T.dive.damage, knockback: 3, knockdown: true, dive: true, zone: { kind: 'line', r: 2.2, w: 1.0 }, part: 'palms', ...dash(T.dive.reach, 0.86, 0.9), track: 0.85, cock: 0.86, keys: diveKeys() }],
  },

  // ================================================================ the transitions
  /** A Hundred Iron Seeds (into phase 2): he throws the coat open; the hall rewrites itself round him. */
  ironSeeds: { label: 'A Hundred Iron Seeds', phase: 2, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 0.6, beats: [transitionBeat(T.ironSeeds, kneelKeys())] },
  /** The rising (into phase 3): off his back without his hands, the ring, then the Still Hand held. */
  rising: {
    label: 'The Rising', phase: 3, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: T.rising.palm, recoverOpen: 0,
    recoveryKeys: [[0, { ...STILL }], [1, { ...STILL }]],
    beats: [transitionBeat(T.rising, risingKeys())],
  },

  // ================================================================ counters (out of his guard)
  answer: { label: 'Answer', phase: 1, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55, beats: [punch('cross', N, 0.46, 12, { track: 0.7 }), punch('palm', B, 0.4, 18)] },
  answer2: { label: 'Answer (iron)', phase: 2, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55, beats: [elbow(N, 0.46, 12, { track: 0.7 }), { ...punch('cross', B, 0.4, 18), iron: 'point', zone: { kind: 'line', r: 3.0, w: 0.9 } }] },
  answer3: { label: 'Answer (the One)', phase: 3, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55, beats: [punch('hook', N, 0.46, 12, { track: 0.7 }), punch('palm', B, 0.4, 18, { ...dash(2.4) })] },

  // ================================================================ his flurries (a streak of guards)
  hundredHands: flurry(1, [['punch', 'cross'], ['kick', 'front'], ['punch', 'hook'], ['punch', 'backfist']]),
  hundredHands2: flurry(2, [['punch', 'hook'], ['kick', 'side'], ['punch', 'cross'], ['kick', 'round']]),
  hundredHands3: flurry(3, [['kick', 'round'], ['punch', 'cross'], ['kick', 'front'], ['punch', 'hook']]),
};
// deja vu's mirrored copies (phase 3 replays left for right): never picked, only linked to
for (const [k, f] of Object.entries(DEJAVU_BUILD)) MOVES[`${k}M`] = { ...f(true), weight: [0, 0, 1], manual: true, hidden: true, mirrorOf: k };

/** His flurry of one phase: the first blow from where he stands; in phase 3 each later one from another side. */
function flurry(ph, kinds) {
  return {
    label: `Hundred Hands${ph > 1 ? ` (${ph})` : ''}`, phase: ph, weight: 0, counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.7,
    beats: kinds.map(([fn, kind], i) => (fn === 'kick' ? kick : punch)(kind, N, i ? 0.46 : 0.6, 8, i && ph >= 3 ? { flit: { r: 2.4 } } : { track: 0.7 })),
  };
}

export const MOVE_NAMES = Object.keys(MOVES);
export const TRANSITIONS = Object.freeze({ 2: 'ironSeeds', 3: 'rising' });
export const COUNTERS = Object.freeze(['answer', 'answer2', 'answer3']);
export const STREAKS = Object.freeze(['hundredHands', 'hundredHands2', 'hundredHands3']);

// ---------------------------------------------------------------- phase 1: one hand
/** A beat with the left hand behind his back in every key (phase 1). */
const oneHandBeat = (b) => (b?.keys ? { ...b, keys: b.keys.map(([u, p]) => [u, { ...p, ...BEHIND }]) } : b);
const oneHand = (def) => ({ ...def, beats: def.beats.map((b) => (b.pick ? { ...b, pick: b.pick.map(oneHandBeat) } : oneHandBeat(b))) });
/** The moves as realised in phase 1 (the left hand behind his back; transitions as authored). */
const MOVES_P1 = Object.fromEntries(Object.entries(MOVES).map(([k, d]) => [k, d.transition ? d : oneHand(d)]));

// ---------------------------------------------------------------- reaction clips
// Tian Lei's bare-handed clips, with his own on top: THE LEAN (his ward clips: a slip back and aside, the
// head out of the line; one afterimage is drawn by fx.ghost), THE FALL (the deathblow's `executed`: flat on
// his back), the Bend, the stop, his waiting (his back turned, the hands behind him) and the intro (a look
// over the shoulder, the turn, THE BECKON).
const LEAN_L = { yaw: -0.5, bY: -0.12, bZ: -0.2, bX: 0.12, pitch: -0.32, roll: 0.16, hdY: 0.4, hdX: -0.2, rH: [0.06, -0.2, 0.3], lH: [-0.02, -0.06, 0.24] };
const LEAN_R = { yaw: 0.2, bY: -0.12, bZ: -0.2, bX: -0.12, pitch: -0.32, roll: -0.16, hdY: -0.1, hdX: -0.2, rH: [0.06, -0.06, 0.24], lH: [-0.02, -0.2, 0.3] };
const LEAN_HIGH = { yaw: -0.2, bY: -0.3, bZ: -0.1, pitch: 0.24, hdX: 0.3, rH: [0.06, -0.2, 0.3], lH: [-0.02, -0.2, 0.3] };
const slip = (P, dur = 0.34) => ({
  dur, hold: true,
  keys: [[0, { ...P, pitch: P.pitch * 0.5, bZ: P.bZ * 0.5 }], [0.07, { e: 'o', ...P }], [0.22, { ...P, pitch: P.pitch * 0.7, bZ: P.bZ * 0.7 }]],
});
const BEHIND_BACK = { rH: [0.16, -0.36, -0.2], rP: [-0.6, -0.2, -0.9], ...BEHIND };
const WAIT = { bY: -0.02, pitch: -0.02, yaw: 0, hdX: 0.08, rF: [-0.13, 0.0], lF: [0.13, 0.0], rK: [-0.1, 0, 1], lK: [0.1, 0, 1], rFy: -0.1, lFy: 0.1, flat: 1, ...BEHIND_BACK };
/** He bends back under it (the Bend): arched over backward, one hand to the floor. */
const BENT = { bY: -0.5, bZ: -0.4, pitch: -1.05, hdX: -0.4, yaw: 0, rH: [-0.1, -0.7, -0.4], rP: [-0.9, -0.3, -0.4], lH: [0.3, 0.2, 0.1], rF: [-0.2, 0.36], lF: [0.2, 0.3], rK: [-0.4, 0.4, 0.8], lK: [0.4, 0.4, 0.8], flat: 0.6 };
export const CLIPS = {
  ...ASC_CLIPS,
  ward: slip(LEAN_L),
  wardR: slip(LEAN_R),
  wardHigh: slip(LEAN_HIGH, 0.38),
  clash: slip(LEAN_L, 0.26),
  deflect: { dur: 0.26, keys: [[0, { ...LEAN_L, pitch: -0.1 }], [0.07, { e: 'o', ...LEAN_R, pitch: -0.2 }], [0.18, { ...LEAN_R, pitch: -0.1 }]] },
  wardHold: { dur: 1, hold: true, keys: [[0, { yaw: -0.3, bY: -0.12, pitch: -0.08, hdY: 0.3, rH: [0.06, -0.1, 0.32], lH: [0.0, 0.0, 0.3] }]] },
  /** THE FALL (the deathblow on bar 1): thrown down flat on his back, he lies there (THE FALL's `lie`). */
  executed: {
    dur: 0.5 + T.fall.lie, hold: true,
    keys: [
      [0.0, { bY: -0.3, pitch: -0.3, hdX: -0.3, rH: [-0.3, 0.1, 0.1], lH: [0.3, 0.1, 0.1] }],
      [0.35, { e: 'o', ...FALLEN, bY: -0.7 }],
      [0.5, { ...FALLEN }],
      [0.5 + T.fall.lie, { ...FALLEN, hdX: -0.1 }],
    ],
  },
  /** THE BEND: arched over backward, a hand to the floor; held open (TUNING.bend.open). */
  bend: { dur: T.bend.open, hold: true, keys: [[0.0, { bY: -0.2, pitch: -0.4, bZ: -0.2 }], [0.12, { e: 'o', ...BENT }], [T.bend.open * 0.75, { ...BENT, pitch: -0.95 }], [T.bend.open, { bY: -0.2, pitch: -0.3, bZ: -0.1 }]] },
  /** THE STOP: the right palm raised; rooted (TUNING.stop.root). */
  stop: { dur: T.stop.root, hold: true, keys: [[0.0, { ...STILL, rH: [0.06, 0.0, 0.4] }], [0.08, { e: 'o', ...STILL }], [T.stop.root, { ...STILL }]] },
  /** He waits: his back to the hall's entry (dragonSleep's yaw), the hands clasped behind him. */
  meditate: { dur: 1, hold: true, keys: [[0, { ...WAIT }]] },
  /** The intro: the head turns over his shoulder; he turns (wokenOne.js turns the root); THE BECKON. */
  intro: {
    dur: 2.6,
    keys: [
      [0, { ...WAIT }],
      [0.5, { ...WAIT, hdY: 1.1, spY: 0.2 }],
      [0.9, { ...WAIT, hdY: 1.1, spY: 0.25 }],
      [1.4, { ...WAIT, hdY: 0.1, spY: 0.0, rH: [0.06, -0.3, 0.2] }],
      [1.7, { ...WAIT, ...BECKON, lH: BEHIND.lH, lP: BEHIND.lP }],
      [1.9, { ...WAIT, ...CURL, lH: BEHIND.lH, lP: BEHIND.lP }],
      [2.1, { ...WAIT, ...BECKON, lH: BEHIND.lH, lP: BEHIND.lP }],
      [2.3, { ...WAIT, ...CURL, lH: BEHIND.lH, lP: BEHIND.lP }],
      [2.6, { e: 'o', bY: -0.06, yaw: -0.3, hdY: 0.26, rH: [0.04, -0.2, 0.36], rP: [-0.8, -0.7, -0.1], ...BEHIND, rF: [-0.16, -0.16], lF: [0.17, 0.2] }],
    ],
  },
};
/** When in the intro the beckon's curl is done and the room rewrites (wokenOne.js). */
export const INTRO_BECKON = 2.3;

/** Compiled reaction clips, one set per phase (each round its phase's guard). */
export const CLIPS_BY_PHASE = PHASE_POSES.map((P) => {
  const out = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, P.compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
  for (const [k, c] of Object.entries(out)) c.name = k;
  return out;
});
export const CLIP = CLIPS_BY_PHASE[0];

const REALISERS = PHASE_POSES.map((P, i) => makeRealise({ TUNING, MOVES: i === 0 ? MOVES_P1 : MOVES, compileClip: (keys, dur) => P.compileClip(keys, dur), completeBeat: P.completeBeat }));

/**
 * A move as it will play this time (duelist/realise.js), round the guard of the phase it is used in; a
 * transition round the NEW phase's guard. DEJA VU: `REPLAY` (wokenOne.js sets it as a replay starts) feeds
 * the realiser the draws the first pass took (the same holds and picks), and every realised move keeps
 * its draws (`A.draws`) for one.
 */
export const REPLAY = { name: null, draws: null };
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  const def = MOVES[name];
  if (!def) return null;
  const ph = def.transition ? def.phase : phase;
  const base = def.mirrorOf ?? name;
  let i = 0;
  const replay = REPLAY.name === base && Array.isArray(REPLAY.draws) ? REPLAY.draws : null;
  const draws = [];
  const r = () => {
    const v = replay && i < replay.length ? replay[i++] : rnd();
    draws.push(v);
    return v;
  };
  if (replay) REPLAY.name = REPLAY.draws = null;
  const A = REALISERS[Math.min(REALISERS.length, Math.max(1, ph)) - 1](name, phase, r, opts);
  if (A) {
    A.draws = draws;
    A.replay = !!replay;
  }
  return A;
}
