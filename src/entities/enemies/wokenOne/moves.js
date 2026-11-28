import { TELL } from '../../../combat/rules.js';
import { makeRealise } from '../duelist/realise.js';
import { X as ASC, CLIPS as ASC_CLIPS } from '../ascendant/moves.js';
import { PHASE_POSES, GEAR2_POSES, BEHIND } from './poses.js';
import { TUNING, GEARED } from './tuning.js';
import { oneMovesNow } from './look.js';
import * as SK from './strikes.js';
import { limbsB, sweepOn } from './limbs.js';
import { DIM } from '../../player/model.js';

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
const { elbow, strikeKeys, F, feet: FT } = ASC;
/** Tian Lei's punch and kick, the blow's kind kept on the beat (`blow`: the rebuild reads it, MOVES_A). */
const punch = (kind, ...a) => ({ ...ASC.punch(kind, ...a), blow: kind });
const kick = (kind, ...a) => ({ ...ASC.kick(kind, ...a), blow: kind });
// ... and his own strikes (strikes.js), tagged the same way (`kick`: the foot strikes at full length)
const tag = (fn, blow) => (...a) => ({ ...fn(...a), blow });
const spinBack = tag(SK.spinBack, 'spinBack'), tornado = tag(SK.tornado, 'tornado'), butterfly = tag(SK.butterfly, 'butterfly');
const flash = tag(SK.flash, 'flash'), aerial = tag(SK.aerial, 'aerial'), bicycle = tag(SK.bicycle, 'bicycle'), dropHeel = tag(SK.dropHeel, 'dropHeel');
const { spinFist, flyKnee, burstKeys, BURST_PART } = SK;

/** A dash on a beat: from `from` of the windup to the impact, stopping `stop` m short, `max` m at most. */
// (a palm thrust on a dash stops 1.35 m short: its lunge reaches that far, ADR-162's rule)
const dash = (max, from = 0.6, stop = 1.35) => ({ dash: { from, to: 1.0, stop, max }, close: 0 });
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
export const FALLEN = { bY: -0.84, pitch: -1.45, hdX: -0.2, yaw: 0, rH: [-0.36, -0.3, 0.1], rP: [-0.9, 0.2, 0.0], lH: [0.36, -0.3, 0.1], lP: [0.9, 0.2, 0.0], rF: [-0.16, 0.06, 0.88], lF: [0.18, 0.06, 0.82], rK: [0, 0.4, 1], lK: [0, 0.4, 1], flat: 0.1 };

// ---------------------------------------------------------------- beats
const T = TUNING;
const ST = T.stance;
/** Iron Rain's lit window: its bursts' slugs, last to last (iron.js _rainStep). */
const RAIN_DUR = (() => {
  const I = T.ironRain;
  return (I.bursts - 1) * ((I.per - 1) * I.gap + I.rest) + (I.per - 1) * I.gap;
})();
/** One burst of Iron Rain, first slug to last. */
const BURST1_DUR = (T.ironRain.per - 1) * T.ironRain.gap;
/** Iron in the Air: a step, the leap sideways, flat in the air (rolled onto his side), both guns out. */
const leapKeys = () => [
  [0.35, F({ yaw: -0.1, bY: -0.3, pitch: 0.1, rH: [0.06, -0.2, 0.3], lH: [-0.06, -0.2, 0.3], ...FT.LOW })],
  [0.7, F({ yaw: 0.0, roll: 1.2, bY: -0.1, rH: [0.12, 0.1, 0.6], rP: [-0.8, -0.2, -0.4], lH: [-0.12, 0.1, 0.6], lP: [0.8, -0.2, -0.4], rF: [-0.2, 0.7, -0.2], lF: [0.2, 0.9, -0.1], flat: 0.2 })],
  [1.0, { ...F({ yaw: 0.0, roll: 1.45, bY: -0.06, rH: [0.12, 0.1, 0.6], rP: [-0.8, -0.2, -0.4], lH: [-0.12, 0.1, 0.6], lP: [0.8, -0.2, -0.4], rF: [-0.3, 0.8, -0.2], lF: [0.1, 1.0, -0.1], flat: 0.2 }), e: 'l' }],
  [1.6, F({ yaw: 0.0, roll: 0.9, bY: -0.2, rH: [0.12, 0.1, 0.6], lH: [-0.12, 0.1, 0.6], rF: [-0.3, 0.4, -0.1], lF: [0.2, 0.5, 0.0], flat: 0.3 })],
  [2.0, F({ yaw: -0.2, roll: 0.0, bY: -0.4, pitch: 0.1, rH: [0.12, -0.1, 0.5], lH: [-0.12, -0.1, 0.5], ...FT.LOW })],
];
/** Gear 2's opening: a back flip off the hands (the left hand comes out from behind his back), the wrist
 *  shaken once, the two-handed guard (lead hand open forward, rear hand at the chest). */
const secondHandKeys = () => [
  [0.1, F({ bY: -0.32, pitch: 0.2, rH: [0.0, -0.3, 0.1], ...BEHIND, ...FT.OR })],
  [0.28, F({ bY: 0.0, pitch: -1.6, hdX: -0.4, rH: [-0.1, 0.5, -0.1], lH: [0.1, 0.5, -0.1], rF: [-0.12, 0.9, 0.3], lF: [0.12, 0.8, 0.1], flat: 0.2 })],
  [0.45, { ...F({ bY: -0.3, pitch: 0.2, rH: [0.06, -0.2, 0.3], lH: [-0.16, -0.06, 0.3], lP: [0.8, -0.5, 0.2], ...FT.OR }), e: 'o' }],
  [0.6, F({ bY: -0.16, yaw: -0.2, rH: [0.06, -0.1, 0.24], lH: [-0.2, 0.06, 0.34], lP: [0.9, 0.2, 0.3], ...FT.OR })],
  [0.7, F({ bY: -0.16, yaw: -0.2, rH: [0.06, -0.1, 0.24], lH: [-0.12, 0.0, 0.34], lP: [0.9, -0.6, -0.2], ...FT.OR })],
  [0.8, F({ bY: -0.16, yaw: -0.2, rH: [0.06, -0.1, 0.24], lH: [-0.2, 0.06, 0.34], lP: [0.9, 0.2, 0.3], ...FT.OR })],
  [1.0, F({ bY: -0.18, yaw: -0.3, hdY: 0.3, rH: [0.1, 0.06, 0.2], lH: [0.02, 0.1, 0.4], lP: [0.8, -0.8, 0.1], ...FT.OR })],
  [2.0, F({ bY: -0.18, yaw: -0.3, hdY: 0.3, rH: [0.1, 0.06, 0.2], lH: [0.02, 0.1, 0.4], lP: [0.8, -0.8, 0.1], ...FT.OR })],
];
/** A counter stance (Tian Lei's Still Water): a feint with a bait hold, catching from ST.from. */
const stance = (P) => ({
  tell: N, windup: ST.windup, fixed: true, hold: ST.hold, active: 0.05, damage: 0, feint: true, stance: { from: ST.from, open: ST.open },
  part: 'fistR', close: 0, track: 0.9, keys: stanceKeys(P),
});
/** A shot from the right gun (`both`: both guns): a cast that cues itself as it nears the hero. */
const shotBeat = (tell, windup, damage, o = {}) => {
  const { both = false, cock = 0.7, ...extra } = o;
  return { tell, windup, active: 0.06, damage, knockback: 1.2, cast: { kind: 'shot', selfCue: true }, part: 'fistR', close: 0, track: 0.92, keys: aimKeys(both, cock), aim: both ? 2 : 1, cock, ...extra };
};
/** A palm bolt (phase 3): a cast that cues itself; returnable. */
const boltBeat = (windup, damage, o = {}) => ({
  tell: B, windup, active: 0.06, damage, knockback: 1.4, cast: { kind: 'bolt', selfCue: true }, bolt: true, part: 'fistR', close: 0, track: 0.92, keys: boltKeys(), cock: 0.72, ...o,
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

// ---------------------------------------------------------------- the rework's beats (ADR-168)
/**
 * A FLURRY BURST (flurry.js): one cue, one windup, one glint, then `n` blows drawn over `dur` s, ONE
 * result. `kind` 'chain' (both fists) | 'right' (the right hand alone: gear 1) | 'kicks'. `cap`: the
 * most a held guard pays for the whole burst.
 */
const burst = (kind, tell, windup, damage, n = 7, dur = 0.7, o = {}) => {
  const { left = false, cock = 0.72, cap = 30, ...extra } = o;
  return {
    tell, windup, active: 0.06, damage, knockback: 0.5, flurry: { n, dur, cap, kind }, sustain: { dur, tick: dur / (n - 1) }, selfHit: true, noWorld: true,
    zone: kind === 'kicks' ? { kind: 'sector', r: 2.0, ang: 0.7 } : { kind: 'sector', r: 1.9, ang: 0.8 }, part: BURST_PART[kind] ?? 'fistR',
    track: 0.85, keys: burstKeys(kind, n, cock, left), ...extra, cock,
  };
};
/** A fast blow (the fast strings): its windup unscaled by the phase (TUNING.fast sits on the floors), the
 *  coil reached early and held, so the blow itself is a snap out of a still chamber. */
const fast = (b) => {
  const cock = b.cock ?? 0.7;
  // (the draw keeps 0.64 of the windup: out of a kick into a punch in 0.14 s jolted the knee)
  const keys = b.keys.map(([u, k]) => [u <= cock + 1e-6 ? (u * 0.64) / cock : u <= 1 ? 0.82 + ((u - cock) * 0.18) / (1 - cock) : u, k]);
  const coil = b.keys.filter(([u]) => u <= cock + 1e-6).reduce((a, k) => (k[0] > a[0] ? k : a), [-1, null]);
  if (coil[1]) {
    const { e, gather, settle, ...pose } = coil[1];
    keys.push([0.82, pose]);
  }
  keys.sort((x, y) => x[0] - y[0]);
  return { ...b, fixed: true, keys, cock: 0.82 };
};
/** His low sweep (red, knockdown, a ring 2.2): Tian Lei's. */
const sweep = (windup, damage, o = {}) => ({ ...kick('sweep', R, windup, damage, o), knockdown: true, ring: 2.2 });
/** A palm on a dash (it stops 1.35 m short: ADR-162's rule, no blow ends inside the hero). */
const palmDash = (tell, windup, damage, o = {}) => ({ ...punch('palm', tell, windup, damage, o), ...dash(2.6, 0.55, 1.35) });
/** The flying side kick out of Borrowed Wall (a parry moment): Tian Lei's flying kick, the zone longer. */
const wallKick = () => ({ ...kick('flying', B, 1.05, 22, { flare: true, cock: 0.62 }), lift: null, zone: { kind: 'line', r: 2.6, w: 0.9 }, wallBlow: 'kick' });
/** ... or the drop heel onto the spot fixed at the spring (red: roll). */
const wallHeel = () => ({ ...dropHeel(R, 1.05, 22, { from: 0, cock: 0.62 }), lift: null, zone: { kind: 'ring', r: 2.4 }, ring: 2.4, knockdown: true, wallBlow: 'heel' });

/** The moves whose string deja vu replays (TUNING.dejavu): their builders, `L` true = mirrored. */
const DEJAVU_BUILD = {
  /** The First Lesson: the beckon, then five blows of the right hand and the feet; the palm a parry moment. */
  lesson: (L) => ({
    label: 'The First Lesson', phase: 1, weight: [2.2, 1.2, 0.9], cooldown: 6, band: [0, 3.4], recovery: 0.6, cat: 'string',
    beats: [
      { feint: true, beckon: true, windup: 0.5, active: 0.05, close: 0, track: 1, part: 'fistR', keys: beckonKeys() },
      punch('cross', N, 0.46, 9, { left: L }),
      punch('backfist', N, 0.34, 9, { left: L }),
      kick('front', N, 0.34, 10, { left: L }),
      spinBack(N, 0.36, 10, { left: L }),
      punch('palm', B, 0.5, 20, { flare: true, left: L }),
    ],
  }),
  /** Climbing the Stair: front, round, the other leg's round high, the spin back kick (a parry moment). */
  stairKick: (L) => ({
    label: 'Climbing the Stair', phase: 1, weight: [1.8, 1.0, 0.8], cooldown: 5, band: [0, 3.6], recovery: 0.55, cat: 'string',
    beats: [
      kick('front', N, 0.46, 10, { left: L }),
      kick('round', N, 0.34, 10, { left: L }),
      kick('round', N, 0.34, 10, { left: !L }),
      spinBack(B, 0.42, 20, { flare: true, left: L }),
    ],
  }),
  closeIron: (L) => ({
    label: 'Close Iron', phase: 2, weight: [0, 2.2, 0], cooldown: 5, band: [0, 3.2], recovery: 0.6, cat: 'string',
    beats: [
      elbow(N, 0.46, 10, { left: L }),
      punch('backfist', N, 0.34, 10, { left: L }),
      spinBack(N, 0.36, 10, { left: L }),
      { ...punch('cross', B, 0.5, 20, { flare: true, left: L }), iron: 'point', zone: { kind: 'line', r: 3.2, w: 0.9 } },
    ],
  }),
  thousandHands: (L) => ({
    label: 'A Thousand Hands', phase: 3, weight: [0, 0, 1.8], cooldown: 6, band: [0, 3.4], recovery: 0.7, cat: 'string',
    beats: [
      punch('cross', N, 0.46, 8, { left: L }),
      // (the three middle punches: one burst, ADR-168)
      burst('chain', N, 0.46, 16, 8, 0.75, { left: L }),
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
  /** Idle Hand: a cross and a backfist, his head turned away; the spinning backfist; the drop heel (red). */
  idleHand: {
    label: 'Idle Hand', phase: 1, weight: [1.8, 1.2, 0.8], cooldown: 4, band: [0, 3.2], recovery: 0.5, cat: 'string',
    beats: [away(punch('cross', N, 0.46, 10)), away(punch('backfist', N, 0.34, 10)), spinFist(N, 0.36, 10), dropHeel(R, 0.5, 20)],
  },
  // ---- the rework's phase 1 (ADR-168): kicks, air, a burst of the right hand (gear 1, one hand)
  /** Three Steps on Air: a hop and he HANGS in the air: three bicycle snaps, then the drop heel (red). */
  threeOnAir: {
    label: 'Three Steps on Air', phase: 1, weight: [2.4, 0.6, 0.6], cooldown: 7, band: [0, 3.2], recovery: 0.6, cat: 'string',
    beats: [
      bicycle(N, 0.5, 9, { first: true }),
      bicycle(N, 0.34, 9, { left: true }),
      bicycle(N, 0.34, 9),
      dropHeel(R, 0.55, 20, { from: 0.6 }),
    ],
  },
  /** The Sky Turns Twice: a tornado kick, another the other way, then the drop heel (red; the sweep after a
   *  spin did not read at its contact at the game camera: the film review, ADR-168). */
  skyTurns: {
    label: 'The Sky Turns Twice', phase: 1, weight: [2.4, 0.6, 0.6], cooldown: 7, band: [0, 3.4], recovery: 0.6, cat: 'string',
    beats: [tornado(N, 0.5, 10), tornado(N, 0.4, 10, { left: true }), dropHeel(R, 0.55, 20)],
  },
  /** Crane Crossing Water: two butterfly kicks that carry him in, then the flying side kick (a parry moment). */
  craneWater: {
    label: 'Crane Crossing Water', phase: 1, weight: [1.3, 0.6, 0.5], cooldown: 7, band: [2.5, 6], recovery: 0.65, cat: 'closer', gapCloser: true,
    beats: [butterfly(N, 0.5, 10), butterfly(N, 0.42, 10, { left: true }), { ...kick('flying', B, 0.46, 20, { flare: true }), ...dash(2.4, 0.4, 1.35) }],
  },
  /** Moon Over the Shoulder: the flash kick (he lands 2.4 m back), at once the flying knee on a dash. */
  moonOver: {
    label: 'Moon Over the Shoulder', phase: 1, weight: [1.2, 0.6, 0.6], cooldown: 7, band: [0, 2.2], recovery: 0.6, cat: 'string',
    beats: [flash(N, 0.46, 10), flyKnee(B, 0.5, 20, { flare: true, dash: 4 })],
  },
  /** Rain on One Roof: a burst of the right hand alone, then the palm (a parry moment). */
  oneRoof: {
    label: 'Rain on One Roof', phase: 1, weight: [1.4, 0.5, 0.5], cooldown: 7, band: [0, 3.0], recovery: 0.6, cat: 'flurry',
    beats: [burst('right', N, 0.5, 16, 7, 0.7), { ...punch('palm', B, 0.45, 20, { flare: true }) }],
  },
  // ---- gear 2 (both hands: bar 1 at or under TUNING.gear2.at; `gear: 2`, wokenOne.weigh)
  /** A Hundred Hands: the chain-punch burst of both hands, a hook, both palms (a parry moment). */
  hundredHands: {
    label: 'A Hundred Hands', phase: 1, gear: 2, weight: [1.8, 0.8, 0.6], cooldown: 6, band: [0, 3.0], recovery: 0.5, cat: 'flurry',
    beats: [burst('chain', N, 0.5, 17, 8, 0.75), punch('hook', N, 0.34, 9), elbow(N, 0.32, 9), punch('double', B, 0.42, 20, { flare: true })],
  },
  /** The Long Lesson: seven blows, hands and feet (the full-deflect string). */
  longLesson: {
    label: 'The Long Lesson', phase: 1, gear: 2, weight: [2.6, 0.6, 0.6], cooldown: 8, band: [0, 3.2], recovery: 0.55, cat: 'string',
    beats: [
      punch('cross', N, 0.46, 9),
      punch('hook', N, 0.32, 9),
      elbow(N, 0.32, 9),
      aerial(N, 0.36, 10),
      tornado(N, 0.36, 10),
      punch('backfist', N, 0.32, 9),
      spinBack(B, 0.42, 20, { flare: true }),
    ],
  },
  /** Storm Step: the flying knee from far, a burst, a tornado kick, the drop heel (red). */
  stormStep: {
    label: 'Storm Step', phase: 1, gear: 2, weight: [1.6, 0.5, 0.5], cooldown: 7, band: [2.5, 6.5], recovery: 0.55, cat: 'closer', gapCloser: true,
    beats: [flyKnee(N, 0.5, 10, { dash: 5 }), punch('cross', N, 0.34, 9), burst('chain', N, 0.42, 16, 7, 0.7), tornado(N, 0.36, 10), dropHeel(R, 0.5, 20)],
  },
  /** Gear 2's opening (never picked: wokenOne.js starts it): he flips back, the left hand comes out, a
   *  shake of the wrist, the two-handed guard. Guard down all through (a real opening). */
  secondHand: {
    label: 'The Second Hand', phase: 1, weight: [0, 0, 0], manual: true, hidden: true, cooldown: 0, band: [0, 99], recovery: 0.1, recoverOpen: 1, cat: 'single', twoHand: true,
    beats: [{ feint: true, secondHand: true, fixed: true, windup: T.gear2.open, active: 0.05, close: 0, track: 0.3, keys: secondHandKeys(), travel: [[0.1, 0], [0.45, -1.6], [1.0, -1.6]], lift: [[0.1, 0], [0.28, 0.5], [0.45, 0], [2, 0]] }],
  },
  /** Brushing Dust: a palm shove that makes range. */
  brushOff: {
    label: 'Brushing Dust', phase: 1, weight: [1.2, 0.8, 0.5], cooldown: 5, band: [0, 2.8], recovery: 0.55, cat: 'single',
    beats: [punch('palm', B, 0.55, 20, { knockback: 3.4 })],
  },
  /** Low Wind: a sweep at the ankles (red: roll through it). */
  lowWind: {
    label: 'Low Wind', phase: 1, weight: [2.0, 1.2, 0.6], cooldown: 6, band: [0, 3.0], recovery: 0.7, cat: 'hazard',
    beats: [sweep(0.64, 22)],
  },
  /** Borrowed Wall (reworked, ADR-168): the upright that brings him at the hero from the SIDE, two steps up
   *  its face, the spring, then a flying side kick (a parry moment) or the drop heel (red); no upright in
   *  reach: the same off the floor. His root is driven by wokenOne.js _wallRun through the whole beat. */
  wallStep: {
    label: 'Borrowed Wall', phase: 1, weight: [1.8, 0.9, 0.7], cooldown: 5, band: [3.5, 12], recovery: 0.6, cat: 'closer', gapCloser: true,
    beats: [{ pick: [{ ...wallKick(), wall: true, air: true, track: 0, close: 0 }, { ...wallHeel(), wall: true, air: true, track: 0, close: 0 }] }],
  },

  // ================================================================ phase 2: the Pillared Hall, iron
  /** Iron Rain: he strafes round you firing from alternating hands; the last shot big (returnable). */
  ironRain: {
    label: 'Iron Rain', phase: 2, weight: [0, 2.2, 0], cooldown: 7, band: [4, 13], recovery: 0.6, cat: 'ranged', ranged: true,
    beats: [
      {
        tell: N, windup: 0.8, active: 0.06, damage: 0, iron: 'rain', selfHit: true, noWorld: true, zone: { kind: 'line', r: 14, w: 0.6 },
        // (the bursts run on their own clock, iron.js _rainStep: the lit window holds all of them)
        sustain: { dur: RAIN_DUR + 0.04, tick: RAIN_DUR + 0.04 }, part: 'fistR', close: 0, track: 1, keys: aimKeys(true),
      },
      // (the heavy last shot 0.6 s after the third burst)
      shotBeat(B, 0.62, T.ironRain.last, { iron: 'heavy', both: true }),
    ],
  },
  /** Iron in the Air (the rework, ADR-169): he leaps sideways, flat in the air, and fires ONE burst
   *  (white); lands in a slide and fires the heavy shot (blue, returnable). */
  ironLeap: {
    label: 'Iron in the Air', phase: 2, weight: [0, 1.4, 0], cooldown: 7, band: [4, 12], recovery: 0.6, cat: 'ranged', ranged: true,
    beats: [
      {
        tell: N, windup: 0.62, active: 0.06, damage: 0, iron: 'rain', bursts: 1, selfHit: true, noWorld: true, zone: { kind: 'line', r: 14, w: 0.6 }, air: true,
        sustain: { dur: BURST1_DUR + 0.04, tick: BURST1_DUR + 0.04 }, part: 'fistR', close: 0, track: 1, cock: 0.7, keys: leapKeys(),
        lift: [[0.4, 0], [0.75, 0.85], [1.0, 0.95], [1.6, 0.6], [2.0, 0]],
      },
      shotBeat(B, 0.5, 14, { iron: 'heavy', both: true }),
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
    beats: [stance(STILL), { ...punch('palm', B, 0.46, 22, { lock: true, flare: true }), close: 0.8 }],
  },
  /** Pushing Hands: two palm bolts in the code's green, both returnable (a returned one hangs: the stop). */
  pushingHands: {
    label: 'Pushing Hands', phase: 3, weight: [0, 0, 1.6], cooldown: 5, band: [3, 13], recovery: 0.6, cat: 'ranged', ranged: true,
    beats: [boltBeat(0.6, 16), boltBeat(0.5, 16, { keys: boltKeys(0.7), cock: 0.7 })],
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
      { tell: R, windup: 0.8, active: 0.15, damage: T.flight.burst.damage, knockback: T.flight.burst.knockback, rise: true, air: true, zone: { kind: 'ring', r: T.flight.burst.r }, ring: T.flight.burst.r, part: 'feet', close: 0, track: 0.5, keys: riseKeys(), cock: 0.7, lift: [[0.9, 0], [1.0, 1.0], [2.0, T.flight.hover]] },
      { feint: true, windup: 0.9, active: 0.05, close: 0, track: 1, keys: hoverKeys(), lift: [[0, T.flight.hover], [1.0, T.flight.hover + 0.2], [2.0, T.flight.hover + 0.2]] },
      {
        pick: [
          { tell: R, windup: 1.1, fixed: true, active: 0.12, damage: T.flight.fist.damage, knockback: 3, knockdown: true, fist: true, air: true, zone: { kind: 'ring', r: T.flight.fist.crater }, ring: T.flight.fist.crater, part: 'fistR', close: 0, track: 0.7, cock: 0.7, keys: fistKeys(), lift: [[0, T.flight.hover + 0.2], [0.7, T.flight.hover + 0.6], [1.0, 0]] },
          { tell: R, windup: 0.9, fixed: true, active: 0.35, damage: T.flight.lowPass.damage, knockback: 3, knockdown: true, pass: true, air: true, zone: { kind: 'line', r: T.flight.lowPass.len, w: T.flight.lowPass.w }, part: 'fistR', close: 0, track: 0.7, cock: 0.7, keys: passKeys(), lift: [[0, T.flight.hover + 0.2], [0.7, T.flight.hover], [1.0, T.flight.lowPass.y], [1.7, T.flight.lowPass.y], [1.95, 0]] },
        ],
      },
    ],
  },
  /** The Dive Within: the charged blow (black): the hall's letters stream into his chest, a flat lunge. */
  diveWithin: {
    label: 'The Dive Within', phase: 3, weight: [0, 0, 0.7], cooldown: 14, band: [2, 9], recovery: 0.9, cat: 'closer', gapCloser: true,
    beats: [{ tell: K, windup: 1.5, hold: [0.1, 0.5], active: 0.1, damage: T.dive.damage, knockback: 3, knockdown: true, dive: true, zone: { kind: 'line', r: 2.2, w: 1.0 }, part: 'palms', ...dash(T.dive.reach, 0.86, 1.35), track: 0.85, cock: 0.86, keys: diveKeys() }],
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

  // ================================================================ the fast strings (?oneMoves=a; weight 0 on '0': wokenOne.weigh)
  /** Snapping Hands: the right hand three times, quick: the first windup at the floor of a fair read
   *  (TUNING.minFirstWindup), the next two at TUNING.fast.next (impacts minHitGap apart). White: block or
   *  parry each. */
  snapHands: {
    label: 'Snapping Hands', phase: 1, fast: true, weight: [1.6, 1.3, 1.2], cooldown: 5, band: [0, 2.6], recovery: 0.45, cat: 'string',
    beats: [fast(punch('backfist', N, T.fast.first, T.fast.damage)), fast(punch('cross', N, T.fast.next, T.fast.damage)), fast(punch('backfist', N, T.fast.next, T.fast.damage))],
  },
  /** Quick Foot: a low front kick out of the guard and the right hand straight after it, both quick. */
  quickFoot: {
    label: 'Quick Foot', phase: 1, fast: true, weight: [1.3, 1.1, 1.1], cooldown: 5, band: [0, 2.8], recovery: 0.5, cat: 'string',
    beats: [fast(kick('front', N, T.fast.first, T.fast.damage + 1)), fast(punch('cross', N, T.fast.next, T.fast.damage))],
  },

  // ================================================================ counters (out of his guard)
  answer: { label: 'Answer', phase: 1, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55, beats: [spinBack(N, 0.46, 12, { track: 0.7 }), punch('palm', B, 0.4, 18)] },
  answer2: { label: 'Answer (iron)', phase: 2, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55, beats: [elbow(N, 0.46, 12, { track: 0.7 }), { ...punch('cross', B, 0.4, 18), iron: 'point', zone: { kind: 'line', r: 3.0, w: 0.9 } }] },
  answer3: { label: 'Answer (the One)', phase: 3, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55, beats: [punch('hook', N, 0.46, 12, { track: 0.7 }), punch('palm', B, 0.4, 18, { ...dash(2.4) })] },

  // ================================================================ his flurries (a streak of guards)
  // (phase 1's, the rework: a burst, a tornado kick, a palm; flurry.js settles the streak for a burst)
  streakHands: { ...flurry(1, [['punch', 'cross']]), beats: [burst('right', N, 0.6, 16, 7, 0.7, { track: 0.7 }), tornado(N, 0.46, 9), punch('palm', N, 0.46, 9)] },
  streakHands2: flurry(2, [['punch', 'hook'], ['kick', 'side'], ['punch', 'cross'], ['kick', 'round']]),
  streakHands3: flurry(3, [['kick', 'round'], ['punch', 'cross'], ['kick', 'front'], ['punch', 'hook']]),
};
// deja vu's mirrored copies (phase 3 replays left for right): never picked, only linked to
for (const [k, f] of Object.entries(DEJAVU_BUILD)) MOVES[`${k}M`] = { ...f(true), weight: [0, 0, 1], manual: true, hidden: true, mirrorOf: k };

/** His flurry of one phase: the first blow from where he stands; in phase 3 each later one from another side. */
function flurry(ph, kinds) {
  return {
    label: `Rain of Hands${ph > 1 ? ` (${ph})` : ''}`, phase: ph, weight: 0, counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.7,
    beats: kinds.map(([fn, kind], i) => (fn === 'kick' ? kick : punch)(kind, N, i ? 0.46 : 0.6, 8, i && ph >= 3 ? { flit: { r: 2.4 } } : { track: 0.7 })),
  };
}

export const MOVE_NAMES = Object.keys(MOVES);

// ---------------------------------------------------------------- the rebuild (?oneMoves=a, look.js oneMovesNow)
/** One gun aimed side-on: the right shoulder toward the hero, the arm straight down the line to him (the
 *  sight line), the head turned along it, the left hand easy at his side. The old aim (yaw -0.9 with the
 *  hand ahead of the chest) put the right arm 36 degrees off the hero, the forearm across his face; this
 *  one is within 5 (measured at the impact: the shoulder to the fist against the shoulder to his chest). */
const AIM_SIDE = { yaw: 0.8, bY: -0.1, hdY: -0.68, rH: [-0.5, 0.1, 0.36], rP: [-0.9, -0.3, -0.2], lH: [0.1, -0.5, -0.05], lP: [0.9, -0.2, -0.3], sw: [0.0, 0.0] }; // (the left hand hangs: not on the hip)
const aimSideKeys = (cock = 0.7) => strikeKeys({
  cock,
  coil: { ...AIM_SIDE, rH: [-0.22, -0.12, 0.26], ...FT.OR },
  hit: { ...AIM_SIDE, ...FT.OR },
  after: { ...AIM_SIDE, rH: [-0.48, 0.2, 0.32], bZ: -0.05, pitch: -0.06, ...FT.OR },
});
/** The held windup of a blue / red / black blow: he reaches the blow's coil in `T.held.drift` of the time
 *  his draw into it had, and HOLDS it (the realiser's bait-hold rule: the cocked pose keyed again) until
 *  `T.held.to` of the windup at most, or earlier where the strike would get under `T.held.keep` of the
 *  time it had; the strike runs in the rest. The windup is no longer (the cue, the flash and the impact
 *  stay where they were): the pose that says blue or red stands still long enough to read, and the blow
 *  out of it is a snap. A beat with a bait hold of its own (the Dive Within) or no keys is left alone. */
function heldTell(b) {
  if (!b?.keys || b.feint || b.hold || !(b.tell === B || b.tell === R || b.tell === K)) return b;
  const cock = b.cock ?? 0.8;
  // (the strike keeps `keep` of the time it had: a snap, not a pop; the spins need their turn)
  // (... and the draw into the coil keeps `drift` of its time: a spin's coil is half a turn away)
  const from = cock * T.held.drift, to = Math.min(T.held.to, 1 - (1 - cock) * T.held.keep);
  if (!(cock > from + 0.02 && cock < 1 && to > from + 0.12)) return b;
  const pre = b.keys.filter(([u]) => u <= cock + 1e-6);
  if (!pre.length) return b;
  const coil = pre.reduce((a, k) => (k[0] > a[0] ? k : a));
  const { e, gather, settle, ...pose } = coil[1];
  const keys = b.keys.map(([u, k]) => [u <= cock + 1e-6 ? (u * from) / cock : u <= 1 ? to + ((u - cock) * (1 - to)) / (1 - cock) : u, k]);
  keys.push([to, pose]);
  keys.sort((x, y) => x[0] - y[0]);
  return { ...b, keys, cock: to };
}
/** The straight blows (the rebuild): at the hit key the striking hand's target `T.reach` x further from
 *  its shoulder, along the same line (with armSoftA the arm lands long, ~165 degrees at the elbow, where it
 *  stopped at ~150: a punch that never reached). Hooks, uppercuts and hammers keep their bend. */
const STRAIGHT = new Set(['jab', 'cross', 'palm', 'double', 'backfist']);
function longArm(b) {
  if (!STRAIGHT.has(b.blow) || !b.keys) return b;
  const k = T.reach, side = b.part === 'fistL' ? ['lH'] : b.part === 'palms' || b.blow === 'double' ? ['rH', 'lH'] : ['rH'];
  const keys = b.keys.map(([u, p]) => {
    if (Math.abs(u - 1) > 1e-6) return [u, p];
    const q = { ...p };
    for (const h of side) if (Array.isArray(q[h])) q[h] = q[h].map((x) => x * k);
    return [u, q];
  });
  return { ...b, keys };
}
/** The kicks whose leg lands straight (the rebuild: the owner, "a straight line when his kick is out"). */
const KICKS = new Set(['front', 'side', 'round', 'axe', 'flying', 'sweep', 'spinBack', 'tornado', 'butterfly', 'flash', 'aerial', 'bicycle', 'dropHeel']);
/** The hip joint of pose p in model space (strikes.js toModel's turn: roll, pitch, yaw round the waist pivot). */
function hipOf(p, s) {
  const x0 = s * 0.09, y0 = -0.08, ya = p.yaw ?? 0, pi = p.pitch ?? 0, ro = p.roll ?? 0;
  let x = x0 * Math.cos(ro) - y0 * Math.sin(ro), y = x0 * Math.sin(ro) + y0 * Math.cos(ro), z = 0;
  const y1 = y * Math.cos(pi) - z * Math.sin(pi), z1 = y * Math.sin(pi) + z * Math.cos(pi);
  return [x * Math.cos(ya) + z1 * Math.sin(ya) + (p.bX ?? 0), y1 + 1.04 + (p.bY ?? 0), -x * Math.sin(ya) + z1 * Math.cos(ya) + (p.bZ ?? 0)];
}
/** At a kick's contact key the striking foot's target is put `T.legReach` x the leg's length from its hip
 *  along the same line (never under the ankle's height): the animator's soft reach then lands the leg
 *  straight (kickStretch carries the frames round it). A foot the key left near the hip (a tuck) is left. */
function longLeg(b) {
  if (!KICKS.has(b.blow) || !b.keys) return b;
  const f = b.part === 'footL' ? 'lF' : b.part === 'footR' ? 'rF' : null;
  if (!f) return b;
  const L = DIM.thigh + DIM.shin, want = T.legReach * L;
  const keys = b.keys.map(([u, p]) => {
    const v = p[f];
    // (the contact key; the sweep's whole turn along the floor)
    const at = b.blow === 'sweep' ? u >= 1 - 1e-6 && u <= 2 + 1e-6 : Math.abs(u - 1) < 1e-6;
    if (!at || !Array.isArray(v) || v.length !== 3) return [u, p];
    const h = hipOf(p, f === 'lF' ? 1 : -1), d = [v[0] - h[0], v[1] - h[1], v[2] - h[2]], l = Math.hypot(...d);
    if (!(l > 0.45 * L) || l >= want) return [u, p];
    const k = want / l;
    let y = h[1] + d[1] * k, hz = k;
    if (y < DIM.ankle) {
      // (on the floor: the length goes out along it instead)
      y = DIM.ankle;
      const dy = y - h[1], hd = Math.hypot(d[0], d[2]);
      hz = hd > 1e-3 ? Math.sqrt(Math.max(0, want * want - dy * dy)) / hd : k;
    }
    return [u, { ...p, [f]: [h[0] + d[0] * hz, y, h[2] + d[2] * hz] }];
  });
  return { ...b, keys };
}
/** A kick that carries him in (`travel`, the butterflies) carries him `T.travelCut` m less: the longer
 *  leg reaches what the travel used to (a foot ended 0.2 - 0.4 m inside the hero). */
function shortTravel(b) {
  if (!Array.isArray(b.travel) || !KICKS.has(b.blow)) return b;
  const cut = T.travelCut;
  return { ...b, travel: b.travel.map(([u, m]) => [u, m > 0 ? Math.max(0, m - cut * Math.min(1, m / 1.1)) : m]) };
}
/** The rebuild's limb rules (tests: woke REBUILD). */
export const REBUILD = Object.freeze({ KICKS, STRAIGHT, hipOf });
function beatA(b) {
  let o = shortTravel(b);
  if (o.aim === 1) o = { ...o, keys: aimSideKeys(o.cock ?? 0.7) };
  return heldTell(longLeg(longArm(o)));
}
/** The moves as the rebuild plays them (transitions as authored: their kneel is their windup). */
export const MOVES_A = Object.fromEntries(Object.entries(MOVES).map(([k, d]) => [k, d.transition ? d : { ...d, beats: d.beats.map((b) => (b.pick ? { ...b, pick: b.pick.map(beatA) } : beatA(b))) }]));
/** `?oneMoves=b` (ADR-253): `a` with the limbs on the line (limbs.js): straight blows down his centre line,
 *  kicks held long through the contact, the sweep crossing the hero at its impact, short blows' zones fitted
 *  to their reach. The guns' aim and recoil are drawn (gunAim.js, wokenOne.js); timings are `a`'s. */
function beatB(b) {
  let o = shortTravel(b);
  if (o.aim === 1) o = { ...o, keys: aimSideKeys(o.cock ?? 0.7) };
  return heldTell(limbsB(longLeg(longArm(sweepOn(o)))));
}
export const MOVES_B = Object.fromEntries(Object.entries(MOVES).map(([k, d]) => [k, d.transition ? d : { ...d, beats: d.beats.map((b) => (b.pick ? { ...b, pick: b.pick.map(beatB) } : beatB(b))) }]));
export const TRANSITIONS = Object.freeze({ 2: 'ironSeeds', 3: 'rising' });
export const COUNTERS = Object.freeze(['answer', 'answer2', 'answer3']);
export const STREAKS = Object.freeze(['streakHands', 'streakHands2', 'streakHands3']);

// ---------------------------------------------------------------- phase 1: one hand
/** A beat with the left hand behind his back in every key (phase 1). */
const oneHandBeat = (b) => (b?.keys ? { ...b, keys: b.keys.map(([u, p]) => [u, { ...p, ...BEHIND }]) } : b);
const oneHand = (def) => ({ ...def, beats: def.beats.map((b) => (b.pick ? { ...b, pick: b.pick.map(oneHandBeat) } : oneHandBeat(b))) });
/** The moves as realised in phase 1 (the left hand behind his back; transitions as authored). */
const MOVES_P1 = Object.fromEntries(Object.entries(MOVES).map(([k, d]) => [k, d.transition || d.twoHand ? d : oneHand(d)]));
const MOVES_P1_A = Object.fromEntries(Object.entries(MOVES_A).map(([k, d]) => [k, d.transition || d.twoHand ? d : oneHand(d)]));
const MOVES_P1_B = Object.fromEntries(Object.entries(MOVES_B).map(([k, d]) => [k, d.transition || d.twoHand ? d : oneHand(d)]));

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
/** Gear 2's reaction clips (phase 1, both hands: GEAR2_POSES' guard). */
export const CLIPS_GEAR2 = (() => {
  const out = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, GEAR2_POSES.compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
  for (const [k, c] of Object.entries(out)) c.name = k;
  return out;
})();

const REALISERS = PHASE_POSES.map((P, i) => makeRealise({ TUNING, MOVES: i === 0 ? MOVES_P1 : MOVES, compileClip: (keys, dur) => P.compileClip(keys, dur), completeBeat: P.completeBeat }));
/** Phase 1 in gear 2 (both hands, ADR-168): the moves two-handed, round gear 2's guard. */
const REALISE_G2 = makeRealise({ TUNING, MOVES, compileClip: (keys, dur) => GEAR2_POSES.compileClip(keys, dur), completeBeat: GEAR2_POSES.completeBeat });
/** ... and the rebuild's (`?oneMoves=a`). */
const REALISERS_A = PHASE_POSES.map((P, i) => makeRealise({ TUNING, MOVES: i === 0 ? MOVES_P1_A : MOVES_A, compileClip: (keys, dur) => P.compileClip(keys, dur), completeBeat: P.completeBeat }));
const REALISE_G2_A = makeRealise({ TUNING, MOVES: MOVES_A, compileClip: (keys, dur) => GEAR2_POSES.compileClip(keys, dur), completeBeat: GEAR2_POSES.completeBeat });
/** ... and `?oneMoves=b`'s (ADR-253). */
const REALISERS_B = PHASE_POSES.map((P, i) => makeRealise({ TUNING, MOVES: i === 0 ? MOVES_P1_B : MOVES_B, compileClip: (keys, dur) => P.compileClip(keys, dur), completeBeat: P.completeBeat }));
const REALISE_G2_B = makeRealise({ TUNING, MOVES: MOVES_B, compileClip: (keys, dur) => GEAR2_POSES.compileClip(keys, dur), completeBeat: GEAR2_POSES.completeBeat });

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
  // (phase 1 in gear 2, and gear 2's own opening: two-handed, round gear 2's guard)
  const g2 = ph === 1 && !def.transition && (GEARED.now >= 2 || def.twoHand);
  const mv = oneMovesNow();
  const RS = mv === 'b' ? REALISERS_B : mv === 'a' ? REALISERS_A : REALISERS;
  const G2 = mv === 'b' ? REALISE_G2_B : mv === 'a' ? REALISE_G2_A : REALISE_G2;
  const A = (g2 ? G2 : RS[Math.min(RS.length, Math.max(1, ph)) - 1])(name, phase, r, opts);
  if (A) {
    A.draws = draws;
    A.replay = !!replay;
  }
  return A;
}
