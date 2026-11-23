import { TELL } from '../../../combat/rules.js';
import { compileClip, completeBeat, GUARD } from './poses.js';
import { TUNING } from './tuning.js';
import { makeRealise } from '../duelist/realise.js';
import { X as ASC, CLIPS as ASC_CLIPS } from '../ascendant/moves.js';

// Wen Yao's moves and reaction clips, as data (ADR-147; COMBAT.md → "The Thousand-Body Fox"). He fights
// BARE-HANDED (the owner, 2026-11-22: "a fist fighter, no sword"): his blows are built with Tian Lei's
// exported strike builders (ascendant/moves.js X: punch, kick, elbow, strikeKeys; authored round the
// same left-lead stance as his), and his reaction clips are Tian Lei's bare-handed ones, compiled round
// his own guard (poses.js). The MOVE / BEAT format is the Ash Disciple's (ashDisciple/moves.js header);
// `part` on a beat names the striking limb (fox.js: the engine's "blade" is that limb). His own beat
// fields, read by fox.js (the brain ignores them):
//   swap: true      as the beat's windup starts a paper self drops in beside the hero and he trades
//                   places with it (no room: a flit to the hero's side); the string's reach check counts it
//   pack: { n, mode, gap, form, blow, tell, from, at, flare, r, linger, feed, damage }
//                   A PACK of paper selves (clones.js FoxClones.pack; ADR-151), called at `at` of the beat
//                   (u, default 1: its impact; the call is usually a feint beat, his gesture). n bodies
//                   (per phase), `mode` 'together' (ONE cue, ONE result: a parry bursts all) or 'sequence'
//                   (n cues `gap` s apart, each its own), arriving round the hero by `form` ('ring' | 'fan'
//                   | 'sides' | 'above' | 'low'), each playing the hidden self-move `blow` ('dive' |
//                   'cross' | 'upkick' | 'slam': paperDive ...), `tell` for every cue, the first (the one)
//                   impact `from` s after the call. `flare`: a blue moment's flare; `r`: a together pack's
//                   ring; `linger`: s the bodies stay after their blow (the Burial's pile); `feed`: bodies
//                   that strike burst into the Pearl (it grows); `damage`: a together pack's blow.
//   spring: 'pile'  through the beat's windup he goes to the Burial's pile and springs off it (it bursts)
//                   into the beat's leap
//   twin: true      (on the Pearl's drive) a self appears across the hero from him, shapes its own Pearl
//                   and drives it in at the same instant (no cue of its own: his red cue is the one)
//   lift: true      (the Moon-Swallowing Pearl) two selves lift it with him until he leaps
//   pearl: 'drive'  the Pearl held in his palm and DRIVEN into the hero (the beat's windup is the charge:
//                   his guard down, a self at his side helping to shape it; its blow red; its burst grows
//                   with the selves that fed it). 'charge' (the volley: the beat is a
//                   `cast: { kind: 'pearl', selfCue: true }`, three pearls thrown). 'great' the black pearl
//   mantle: 'tail' | 'pounce'   phase 3's blows of the fox spirit (their world blows: fox.js onImpact)
//   verdict: ...    Heaven-Devouring Howl's beats (beam.js routes them)
// And on a MOVE: densityAs (the director weighs it as a move of that many cues a second), hidden (the
// Lab's list leaves it out), copy (per phase: the chance his counter begins with the struck body bursting
// as paper and him dropping in behind the hero: "It was a copy").

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const { punch, kick, elbow, strikeKeys, F, feet: FT } = ASC;
const CP = TUNING.clones, PE = TUNING.pearl, TR = TUNING.transition;
const CB = CP.blows;

// ---------------------------------------------------------------- pose fragments
/** A dash on a beat: from `from` of the windup to the impact, stopping `stop` m short, `max` m at most. */
const dash = (max, from = 0.6, stop = 1.0) => ({ dash: { from, to: 1.0, stop, max }, close: 0 });
/** The orb in his palm: the lead palm forward and up, the rear hand cupped over it (shaping it). */
const ORB = { yaw: -0.3, bY: -0.3, pitch: 0.06, hdY: 0.24, hdX: 0.1, rH: [0.08, -0.02, 0.34], rP: [-0.8, -0.6, -0.2], lH: [0.04, -0.08, 0.4], lP: [0.6, -0.9, 0.1], ...FT.LOW };
/** The drive: the orb slammed home on a lunge, the palm open into the hero. */
const DRIVE = { yaw: 0.2, bY: -0.32, bZ: 0.22, pitch: 0.14, hip: 0.14, rH: [0.08, -0.06, 0.55], rP: [-0.8, -0.5, -0.2], lH: [0.0, -0.12, 0.12], ...FT.LUNGE };
const driveKeys = () => strikeKeys({ cock: 0.86, pre: { ...ORB, rH: [0.06, -0.12, 0.26] }, coil: ORB, hit: DRIVE });
/** The volley: both hands thrown wide, each flinging an orb. */
const FLING = { yaw: 0.1, bY: -0.2, pitch: -0.04, spX: -0.08, rH: [-0.4, 0.1, 0.24], rP: [-0.9, 0.1, -0.2], lH: [0.4, 0.1, 0.24], lP: [0.9, 0.1, -0.2], ...FT.OR };
const flingKeys = () => strikeKeys({ cock: 0.86, coil: ORB, hit: FLING });
/** He tears selves off himself: a paper charm pulled from each sleeve and flung out wide. */
const scatterKeys = () => strikeKeys({
  cock: 0.5,
  coil: { yaw: -0.1, bY: -0.3, rH: [0.14, -0.02, 0.12], lH: [-0.14, -0.02, 0.12], rP: [-0.8, -0.4, -0.4], lP: [0.8, -0.4, -0.4], ...FT.LOW },
  hit: { yaw: 0.0, bY: -0.16, pitch: -0.1, spX: -0.1, rH: [-0.46, 0.14, 0.08], lH: [0.46, 0.14, 0.08], rP: [-0.9, 0.2, -0.2], lP: [0.9, 0.2, -0.2], ...FT.OR },
});
/** The Round's call: one arm swept round over his head, the selves close in. */
const callKeys = () => strikeKeys({
  cock: 0.5,
  coil: { yaw: -0.4, bY: -0.24, rH: [0.06, -0.1, 0.2], lH: [0.02, 0.06, 0.34], ...FT.OR },
  hit: { yaw: 0.3, bY: -0.12, pitch: -0.12, rH: [-0.2, 0.46, 0.06], rP: [-0.7, 0.5, -0.4], lH: [0.1, -0.1, 0.3], ...FT.OR },
});
/** A backstep out of reach before the drive's charge: no blow. */
const backstep = (dist = 1.9) => ({
  feint: true, windup: 0.3, active: 0.05, close: 0, track: 1, travel: [[0, 0], [1, -dist * 0.8], [2, -dist]],
  keys: [[0.5, F({ bY: -0.2, pitch: -0.08, ...FT.OR })], [1.0, F({ bY: -0.24, ...FT.OR })]],
});

/** The Pearl's harrying pack: selves drop in one after another while he shapes it; each that strikes
 *  bursts into it (it grows). fox.js caps n so the last blow lands `minRedAfter` before the drive. */
export const PEARL_PACK = Object.freeze({ n: [1, 2, 2], mode: 'sequence', gap: 0.34, form: 'fan', blow: 'cross', tell: N, from: 0.62, at: 0.05, feed: true });
/** The drive (the Pearl in his palm, driven into the hero): red, the windup the charge. */
function driveBeat(o = {}) {
  return {
    tell: R, windup: PE.charge[0], fixed: true, active: 0.1, damage: PE.damage, knockback: PE.knockback, knockdown: true, pearl: 'drive',
    zone: { kind: 'line', r: 2.5, w: 1.3 }, part: 'palms', ...dash(PE.driveMax, 0.8, 1.0), track: 0.92, cock: 0.86, keys: driveKeys(), ...o,
  };
}

/** One of the transitions: down on one knee, then the ring of force round him (red). */
const transitionBeat = () => ({
  tell: R, windup: 1.6, fixed: true, active: 0.22, damage: TR.damage, knockback: TR.knockback, knockdown: true,
  zone: { kind: 'ring', r: TR.ringRadius }, ring: TR.ringRadius, part: 'feet', track: 0, close: 0, cock: 0.9,
  keys: [
    [0.2, F({ bY: -0.55, pitch: 0.28, yaw: 0, hdX: 0.55, rH: [0.06, -0.52, 0.32], lH: [0.02, -0.4, 0.3], rF: [-0.14, 0.3], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 })],
    [0.7, F({ bY: -0.4, pitch: 0.1, yaw: 0, hdX: 0.1, rH: [-0.1, -0.44, 0.02], lH: [0.1, -0.44, 0.02], rF: [-0.32, 0.02], lF: [0.32, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3 })],
    [0.9, F({ bY: -0.44, pitch: 0.2, yaw: 0, hdX: 0.3, rH: [0.2, -0.04, 0.24], lH: [-0.2, -0.02, 0.26], rF: [-0.34, 0.02], lF: [0.34, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3 })],
    [1.0, { ...F({ bY: -0.08, pitch: -0.22, yaw: 0, hdX: -0.35, rH: [-0.44, 0.1, 0.12], lH: [0.44, 0.1, 0.12], rF: [-0.3, 0.0], lF: [0.3, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3 }), e: 'o' }],
    [2.0, F({ bY: -0.1, pitch: -0.16, yaw: 0, hdX: -0.25, rH: [-0.4, 0.06, 0.14], lH: [0.4, 0.06, 0.14], rF: [-0.3, 0.0], lF: [0.3, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3 })],
  ],
});

/** The Thousand-Body Round's pack: n selves drop into a ring round the hero and strike in turn. */
export const ROUND_PACK = Object.freeze({ n: [0, 4, 5], mode: 'sequence', gap: 0.36, form: 'ring', blow: 'cross', tell: N, from: 0.9 });
/** The Thousand-Body Round with `n` selves: the call (the pack drops), then his own palm from above,
 *  `ROUND_PACK.gap` after the last of their n blows (a parry moment; a perfect parry locks). */
export function roundBeats(n) {
  const P = ROUND_PACK;
  // (the palm's beat starts at the call's end (its impact + active 0.08): its impact lands `gap` after
  // the pack's last blow, which comes `from + gap x (n - 1)` after the call's impact)
  const W = Math.max(0.6, P.from + P.gap * (n - 1) + P.gap - 0.08);
  return [
    { feint: true, windup: 0.5, active: 0.08, close: 0, track: 1, keys: callKeys(), pack: P },
    { ...punch('palm', B, W, 22, { flare: true, lock: true, cock: 0.9 }), fixed: true, close: 2.4, track: 0.85, lift: [[0.62, 0], [0.86, 0.9], [1.0, 0]] },
  ];
}

// ---------------------------------------------------------------- the moves
// PBZ-fast as Shen Hui (TUNING.flashLead 0.3, the 0.42 s / 0.32 s floors). Phase 3 is no faster than
// phase 2: it asks more (the fox spirit's tail, the pounce, the black pearl, five selves).
export const MOVES = {
  // ---------------------------------------------------------------- phase 1: the Fox Plays
  /** Fox Bite: a dashing cross from mid range. */
  foxBite: {
    label: 'Fox Bite', phase: 1, weight: [1.4, 0.9, 0.4], cooldown: 2.5, band: [2.4, 6.5], recovery: 0.5,
    beats: [{ ...punch('cross', N, 0.5, 18, { knockback: 1.0 }), ...dash(4.5, 0.35, 1.0), track: 0.6 }],
  },

  /** Three Paws: jab, cross, then the open palm driven home (a parry moment: the blue flare). */
  brushstrokes: {
    label: 'Three Paws', phase: 1, weight: [2.6, 2.0, 1.4], cooldown: 3.5, band: [0, 3.6], recovery: 0.55,
    beats: [
      punch('jab', N, 0.46, 13),
      punch('cross', N, 0.34, 13),
      punch('palm', B, 0.42, 20, { flare: true }),
    ],
  },

  /** Ladder to the Moon: a leap and both fists brought down on you (a parry moment; a perfect parry locks). */
  moonLadder: {
    label: 'Ladder to the Moon', phase: 1, weight: [1.4, 1.0, 0.5], cooldown: 3, band: [0, 4.4], recovery: 0.6,
    beats: [{ ...punch('hammer', B, 0.56, 24, { flare: true, lock: true, cock: 0.72 }), zone: { kind: 'sector', r: 2.2, ang: 0.6 }, close: 2.8, lift: [[0.35, 0], [0.74, 0.5], [1.0, 0]] }],
  },

  /** Sweeping Tail: dropped low, a leg swept round at the ankles (red: roll through it). */
  sweepingBrush: {
    label: 'Sweeping Tail', phase: 1, weight: [1.0, 0.8, 0.4], cooldown: 6, band: [0, 3.0], recovery: 0.7,
    beats: [{ ...kick('sweep', R, 0.62, 22), knockdown: true, ring: 2.2 }],
  },

  /** Changing Places: as the windup starts a self drops in beside you and he trades places with it, and kicks. */
  changingPlaces: {
    label: 'Changing Places', phase: 1, weight: [1.6, 2.2, 2.0], cooldown: 5, band: [3, 12], recovery: 0.55, gapCloser: true,
    beats: [{ ...kick('round', N, 0.6, 18), swap: true, close: 3.0, track: 0.8 }],
  },

  /** Two Leaves Fall: paper charms flung from his sleeves; two selves drop out of the air to your left
   *  and right and dive-kick one after the other (block or parry each). */
  twinFall: {
    label: 'Two Leaves Fall', phase: 1, weight: [1.5, 1.0, 0.7], cooldown: 7, band: [0, 9], recovery: 0.7, cat: 'spell', densityAs: 1.2,
    beats: [{ feint: true, windup: 0.42, active: 0.08, close: 0, track: 1, keys: scatterKeys(), pack: { n: 2, mode: 'sequence', gap: 0.36, form: 'sides', blow: 'dive', tell: N, from: 0.92 } }],
  },

  /** Pearl of the Hollow Moon: a step back, the Pearl shaped in his palm (a self at his side helps
   *  shape it) while selves drop in and harry you (pop or parry them: each that strikes bursts into the
   *  Pearl and it grows), then a dash and the Pearl driven into you. Red: roll. Two blows on him while he
   *  shapes it burst it in his hand. */
  foxPearl: {
    label: 'Pearl of the Hollow Moon', phase: 1, weight: [1.8, 1.1, 0.9], cooldown: 9, band: [0, 9], recovery: 0.6, cat: 'closer', densityAs: 1.1,
    beats: [backstep(1.6), driveBeat({ pack: PEARL_PACK })],
  },

  /** The Fox's Answer: his counter out of a guard, a palm. From phase 2, half the time "It was a copy":
   *  the body you struck bursts as paper and he drops in behind you for it (same tell, same windup; a
   *  raised guard meets it from any side). */
  riposte: {
    label: "The Fox's Answer", phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.55, copy: [0, 0.5, 0.5],
    beats: [punch('palm', B, 0.46, 18)],
  },

  /** Paper Rain: his answer to a streak of guards: before each blow after the first he is gone and at
   *  another side of you; a raised guard meets them from any side. */
  streakFlurry: {
    label: 'Paper Rain', phase: 1, weight: [0, 0, 0], counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
    beats: [
      punch('cross', N, 0.62, 14, { track: 0.7 }),
      { ...kick('round', N, 0.48, 14), flit: { r: 2.4 } },
      { ...punch('hook', N, 0.48, 14), flit: { r: 2.4 } },
      { ...punch('uppercut', N, 0.48, 14), flit: { r: 2.4 } },
    ],
  },

  // the hidden self-moves (never picked): a pack body's blow, realised once each (fox.js; clones.js
  // poses the body on its clip; the blow's numbers are TUNING.clones'). Windups TUNING.clones.blows.
  /** A dive kick out of the air. */
  paperDive: {
    label: 'Paper Dive', phase: 1, weight: [0, 0, 0], hidden: true, cooldown: 0, band: [0, 3], recovery: 0.3,
    beats: [{ ...kick('flying', N, CB.dive, CP.damage), fixed: true, close: 0, track: 0.8, lift: null, air: false }],
  },
  /** A leaping cross. */
  paperCross: {
    label: 'Paper Cross', phase: 1, weight: [0, 0, 0], hidden: true, cooldown: 0, band: [0, 3], recovery: 0.3,
    beats: [{ ...punch('cross', N, CB.cross, CP.damage, { knockback: CP.knockback }), fixed: true, close: 0, track: 0.8 }],
  },
  /** A slide in low and a kick upward. */
  paperUpkick: {
    label: 'Paper Kite', phase: 1, weight: [0, 0, 0], hidden: true, cooldown: 0, band: [0, 3], recovery: 0.3,
    beats: [{ ...kick('front', N, CB.upkick, CP.damage), fixed: true, close: 0, track: 0.8 }],
  },
  /** Both fists brought down. */
  paperSlam: {
    label: 'Paper Slam', phase: 1, weight: [0, 0, 0], hidden: true, cooldown: 0, band: [0, 3], recovery: 0.3,
    beats: [{ ...punch('hammer', N, CB.slam, CP.damage), fixed: true, close: 0, track: 0.8 }],
  },

  // ---------------------------------------------------------------- phase 2: A Thousand Bodies
  /** Hand to Hand: four blows; before the second and the last a self drops in beside you and he trades places with it. */
  relay: {
    label: 'Hand to Hand', phase: 2, weight: [0, 2.6, 2.4], cooldown: 6, band: [0, 4.0], recovery: 0.6,
    beats: [
      punch('jab', N, 0.46, 12),
      { ...punch('hook', N, 0.36, 12), swap: true, close: 2.4 },
      { ...kick('knee', N, 0.36, 12) },
      { ...punch('uppercut', B, 0.44, 20, { flare: true }), swap: true, close: 2.4 },
    ],
  },

  /** The Burial: selves dive onto your spot all at once (red: roll out of the ring) and lie piled there;
   *  he runs at the pile and springs off it (it bursts) and comes down on you with both fists (Fox
   *  Descending, red: roll again). One heavy cut on the pile pops it: he leaps from where he stands. */
  buryingLeaves: {
    label: 'The Burial', phase: 2, weight: [0, 1.3, 1.3], cooldown: 10, band: [0, 11], recovery: 0.65, gapCloser: true, cat: 'closer', densityAs: 1.0,
    beats: [
      { feint: true, windup: 0.45, active: 0.08, close: 0, track: 1, keys: scatterKeys(), pack: { n: [0, 3, 4], mode: 'together', form: 'above', blow: 'dive', tell: R, r: 3.0, from: 0.95, linger: 0.6, damage: 24 } },
      {
        ...punch('hammer', R, 0.95 + 0.6 + 0.9 - 0.08, 26, { cock: 0.7 }), fixed: true, zone: { kind: 'ring', r: 2.6 }, ring: 2.6, knockdown: true, knockback: 2.6, spring: 'pile',
        leap: { from: 0.62, lock: 0.85, apex: 3.4 }, close: 0, track: 0.9,
      },
    ],
  },

  /** The Thousand-Body Round: n selves drop into a ring round you and strike in turn, then his own palm
   *  from above (a parry moment). Parry the whole chain: the full deflect. The beats are realised for
   *  the phase's n (realise below: roundBeats(n)); these are five's. */
  foxRing: {
    label: 'The Thousand-Body Round', phase: 2, weight: [0, 1.5, 1.6], cooldown: 12, band: [0, 6], recovery: 0.6, densityAs: 1.4,
    beats: roundBeats(5),
  },

  /** A Thousand at Once: selves appear in the air on every side and dive at the same instant (one blue
   *  cue, the flare): one parry bursts them all; or roll out of the ring. */
  allAtOnce: {
    label: 'A Thousand at Once', phase: 2, weight: [0, 1.4, 1.4], cooldown: 10, band: [0, 9], recovery: 0.6, cat: 'spell', densityAs: 1.0,
    beats: [{ feint: true, windup: 0.45, active: 0.08, close: 0, track: 1, keys: callKeys(), pack: { n: [0, 4, 5], mode: 'together', form: 'ring', blow: 'dive', tell: B, flare: true, from: 1.0 } }],
  },

  /** The Kite String: three selves slide in low from three sides and kick upward one after another,
   *  then he drops on you from above with his heel (red: roll). */
  kiteString: {
    label: 'The Kite String', phase: 2, weight: [0, 1.2, 1.2], cooldown: 9, band: [0, 8], recovery: 0.6, densityAs: 1.3,
    beats: [
      { feint: true, windup: 0.42, active: 0.08, close: 0, track: 1, keys: scatterKeys(), pack: { n: 3, mode: 'sequence', gap: 0.34, form: 'low', blow: 'upkick', tell: N, from: 0.92 } },
      { ...kick('axe', R, 0.92 + 0.34 * 2 + 0.5 - 0.08, 26), fixed: true, knockdown: true, ring: 2.6, close: 0, track: 0.85, leap: { from: 0.7, lock: 0.85, apex: 2.6 } },
    ],
  },

  /** The Twin Pearls: he and a self across you each shape a Pearl and drive it in from two sides at the
   *  same instant (one red cue, two lines crossing on you): roll. */
  twinPearl: {
    label: 'The Twin Pearls', phase: 2, weight: [0, 0.9, 0.8], cooldown: 12, band: [2.5, 9], recovery: 0.6, cat: 'closer', densityAs: 1.0,
    beats: [backstep(1.4), driveBeat({ twin: true })],
  },

  /** Pearl Rain: three pearls shaped at once and flung across your line (red: roll out of the row). */
  pearlRain: {
    label: 'Pearl Rain', phase: 2, weight: [0, 1.0, 0.9], cooldown: 11, band: [3, 12], recovery: 0.55, cat: 'ranged', densityAs: 1.0,
    beats: [
      backstep(1.9),
      { tell: R, windup: PE.charge[0], active: 0.1, damage: PE.damage, knockback: PE.knockback, pearl: 'charge', cast: { kind: 'pearl', selfCue: true }, part: 'palms', close: 0, track: 0.9, cock: 0.86, keys: flingKeys() },
    ],
  },

  /** A Thousand Bodies: the phase-2 transition. On one knee, then a ring of force (red). */
  thousandBodies: {
    label: 'A Thousand Bodies (phase 2)', phase: 2, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.7,
    beats: [transitionBeat()],
  },

  // ---------------------------------------------------------------- phase 3: the Nine-Tailed Fox
  /** Burning Tail: a cross, then the fox spirit's tails swept round (red, knocks you down). */
  burningBrush: {
    label: 'Burning Tail', phase: 3, weight: [0, 0, 2.2], cooldown: 7, band: [0, 4], recovery: 0.65,
    beats: [
      punch('cross', N, 0.46, 14),
      { ...kick('sweep', R, 0.6, 24), zone: { kind: 'ring', r: 3.6 }, ring: 3.6, knockdown: true, mantle: 'tail' },
    ],
  },

  /** Fox-Fire Pounce: on all fours, a long leap and both claws driven down (red); the ground there catches. */
  foxPounce: {
    label: 'Fox-Fire Pounce', phase: 3, weight: [0, 0, 1.6], cooldown: 8, band: [4, 10], recovery: 0.7, gapCloser: true,
    beats: [{
      ...punch('double', R, 0.66, 28, { cock: 0.72 }), zone: { kind: 'line', r: 2.4, w: 1.2 }, knockback: 2.4, mantle: 'pounce',
      ...dash(9, 0.3, 1.2), lift: [[0.3, 0], [0.7, 1.3], [1.0, 0]], track: 0.6,
    }],
  },

  /** Moon-Swallowing Pearl: the Pearl grown huge and dark over his head, two selves lifting it with him,
   *  then a leap down on you (black). */
  greatPearl: {
    label: 'Moon-Swallowing Pearl', phase: 3, weight: [0, 0, 0.9], cooldown: 14, band: [2.4, 9], recovery: 0.8,
    beats: [{
      ...punch('hammer', K, 1.5, 44, { cock: 0.85 }), fixed: true, hold: [0.1, 0.5], active: 0.14, knockback: 3, knockdown: true,
      zone: { kind: 'ring', r: 3.4 }, ring: 3.4, close: 0, track: 0.9, leap: { from: 0.55, lock: 0.85, apex: 3.2 }, pearl: 'great', lift: true,
    }],
  },

  /** Heaven-Devouring Howl (phase 3; beam.js, tuningBeam.js): he leaves for the rim, summons the
   *  Nine-Tailed Fox, and its beam rakes the terrace (black on the summoning, red on the beam: roll
   *  through it); then he kneels open. Every beat is the Howl's (`verdict`: beam.js routes it).
   *  PLACEHOLDER (contracts commit): the spirit agent writes its beats and weight. */
  foxVerdict: {
    label: 'Heaven-Devouring Howl', phase: 3, weight: [0, 0, 1.0], verdict: true, cooldown: 0, band: [0, 99], recovery: 0.6, cat: 'ranged',
    beats: [{ feint: true, verdict: 'flit', windup: 0.5, active: 0.05, close: 0, track: 0, keys: callKeys() }],
  },

  /** The Nine-Tailed Fox: the phase-3 transition. His selves burn up into him and the fox spirit wakes
   *  round him; the ring of force (red). */
  foxMantle: {
    label: 'The Nine-Tailed Fox (phase 3)', phase: 3, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.7,
    beats: [transitionBeat()],
  },
};
export const MOVE_NAMES = Object.keys(MOVES);
/** The scripted move that begins each later phase. */
export const TRANSITIONS = Object.freeze({ 2: 'thousandBodies', 3: 'foxMantle' });

// ---------------------------------------------------------------- reaction clips (no hits)
// Tian Lei's bare-handed reactions (his wards, the flinch, the stagger, the recoil, the lock, the
// break, the death), compiled round Wen Yao's guard; his own wait and intro: seated among his selves,
// then up, a crack of the knuckles and a beckoning hand.
const SEATED = F({
  bY: -0.6, bZ: -0.06, pitch: 0.04, yaw: 0, hip: 0, spX: 0.08, spY: 0, hdX: 0.32, hdY: 0,
  rF: [-0.13, -0.36], lF: [0.13, -0.36], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], rFy: 0, lFy: 0, flat: 0.2,
  rH: [0.06, -0.46, 0.24], rP: [-0.5, -0.2, -0.8], lH: [-0.06, -0.46, 0.24], lP: [0.5, -0.2, -0.8],
});
export const CLIPS = {
  ...ASC_CLIPS,
  meditate: { dur: 1, hold: true, keys: [[0, { ...SEATED }]] },
  // a self helping him: holding the Pearl with him (its hands forward, cupped) / bracing for his spring
  orbHold: { dur: 1, hold: true, keys: [[0, F({ ...ORB, yaw: -0.1, rH: [0.06, 0.0, 0.4], lH: [-0.02, -0.04, 0.42] })]] },
  liftHold: { dur: 1, hold: true, keys: [[0, F({ yaw: 0, bY: -0.2, pitch: -0.12, hdX: -0.35, rH: [0.12, 0.62, 0.08], lH: [-0.12, 0.62, 0.08], rP: [-0.6, 0.6, -0.4], lP: [0.6, 0.6, -0.4], ...FT.OR })]] },
  brace: { dur: 1, hold: true, keys: [[0, F({ yaw: 0, bY: -0.42, pitch: 0.3, hdX: -0.2, rH: [0.08, -0.32, 0.3], lH: [-0.08, -0.32, 0.3], rP: [-0.8, -0.6, -0.2], lP: [0.8, -0.6, -0.2], ...FT.LOW })]] },
  intro: {
    dur: 2.8,
    keys: [
      [0, { ...SEATED }],
      [0.3, { ...SEATED, hdX: 0.05 }],
      // up, the fists pressed together before the chest (the knuckles cracked)
      [0.95, F({ bY: -0.12, yaw: 0, hdX: 0.1, rH: [0.06, -0.02, 0.3], lH: [-0.06, -0.02, 0.3], rP: [-0.8, -0.6, -0.4], lP: [0.8, -0.6, -0.4], rF: [-0.14, 0.04], lF: [0.14, -0.04] })],
      [1.35, F({ bY: -0.1, yaw: 0, hdX: 0.0, rH: [0.04, 0.0, 0.32], lH: [-0.04, 0.0, 0.32], rF: [-0.14, 0.04], lF: [0.14, -0.04] })],
      // the lead hand held out, palm up, the fingers beckoning: come on
      [1.85, F({ yaw: -0.5, bY: -0.16, hdY: 0.4, rH: [0.1, -0.3, 0.1], lH: [0.04, -0.02, 0.5], lP: [0.6, -0.9, 0.1], ...FT.OR })],
      [2.2, F({ yaw: -0.5, bY: -0.16, hdY: 0.4, rH: [0.1, -0.3, 0.1], lH: [0.04, 0.04, 0.44], lP: [0.6, -0.9, 0.1], ...FT.OR })],
      [2.8, F({ yaw: -0.6, bY: -0.22, hdY: 0.5, rH: [0.1, 0.02, 0.22], lH: [0.02, 0.06, 0.4], ...FT.OR })],
    ],
  },
};

/** Compiled reaction clips (build time). */
export const CLIP = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
for (const [k, c] of Object.entries(CLIP)) c.name = k;

// ---------------------------------------------------------------- realising a move
const perPhaseN = (v, ph) => (Array.isArray(v) ? v[Math.min(v.length, Math.max(1, ph)) - 1] : v) || 5;
const realiser = (M) => makeRealise({ TUNING, MOVES: M, compileClip: (keys, dur) => compileClip(keys, dur), completeBeat });
const base = realiser(MOVES);
// the Round realised for each live count (its own windup per count; FoxBrain.startAct passes `opts.selves`)
const ROUNDS = {};
for (let n = 1; n <= TUNING.clones.pool; n++) ROUNDS[n] = realiser({ foxRing: { ...MOVES.foxRing, beats: roundBeats(n) } });

/** A move as it will play this time (duelist/realise.js). The Round is realised for its pack's n this
 *  phase (`opts.selves`, FoxBrain.startAct; ROUND_PACK.n). */
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  if (name === 'foxRing') {
    const n = Math.max(1, Math.min(TUNING.clones.pool, Math.round(Number(opts?.selves) || perPhaseN(ROUND_PACK.n, phase))));
    return ROUNDS[n](name, phase, rnd, opts);
  }
  return base(name, phase, rnd, opts);
}

/** The guard pose (for tools). */
export { GUARD };
