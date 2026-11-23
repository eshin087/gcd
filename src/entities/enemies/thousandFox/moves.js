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
//   swap: true      as the beat's windup starts he trades places with the paper self nearest the hero
//                   (none alive: a flit to the hero's side); the string's reach check counts it
//   spring: true    as the beat's windup starts he goes to the self nearest him and springs off its
//                   hands (it tears) into the beat's leap: a self throws him at the hero
//   scatter: true   (on a feint beat: no tell, no glint, no hit) at its impact paper selves tear off him
//   round: true     (a feint beat) at its impact every live self is given a slot in the Thousand-Body
//                   Round, the slots ending TUNING.clones.round s before the move's next beat lands
//   pearl: 'drive'  the Pearl held in his palm and DRIVEN into the hero (the beat's windup is the charge:
//                   his guard down, a self at his side helping to shape it, threads from the others; its
//                   blow red; its burst grows with the selves alive). 'charge' (the volley: the beat is a
//                   `cast: { kind: 'pearl', selfCue: true }`, three pearls thrown). 'great' the black pearl
//   mantle: 'tail' | 'pounce'   phase 3's blows of the fox spirit (their world blows: fox.js onImpact)
// And on a MOVE: clonesFight (a self may take the cutting token while it runs), needs (live selves
// needed to start it), densityAs (the director weighs it as a move of that many cues a second),
// hidden (the Lab's list leaves it out).

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const { punch, kick, elbow, strikeKeys, F, feet: FT } = ASC;
const CP = TUNING.clones, PE = TUNING.pearl, TR = TUNING.transition;

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

/** The Thousand-Body Round with `n` selves: the call, then his own palm after their n blows. */
export function roundBeats(n) {
  const gap = CP.round;
  // the selves' blows land `gap` apart and the last `gap` before his own; the first self's windup starts
  // at the call's impact at the soonest (its windup CP.windup), so his blow's windup covers all of it
  const W = Math.max(0.6, gap * n + CP.windup + 0.06);
  return [
    { feint: true, round: true, windup: 0.5, active: 0.08, close: 0, track: 1, keys: callKeys() },
    { ...punch('palm', B, W, 22, { flare: true, cock: 0.9 }), fixed: true, close: 2.4, track: 0.85 },
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

  /** Changing Places: as the windup starts he trades places with the self nearest you, and kicks. */
  changingPlaces: {
    label: 'Changing Places', phase: 1, weight: [1.6, 2.2, 2.0], cooldown: 5, band: [3, 12], recovery: 0.55, gapCloser: true,
    beats: [{ ...kick('round', N, 0.6, 18), swap: true, close: 3.0, track: 0.8 }],
  },

  /** Scattered Leaves: paper charms flung from his sleeves; selves tear free round you (no blow). */
  scatter: {
    label: 'Scattered Leaves', phase: 1, weight: [1.5, 1.8, 1.6], cooldown: 9, band: [0, 14], recovery: 0.35, cat: 'spell', densityAs: 1.1, clonesFight: true,
    beats: [{ feint: true, scatter: true, windup: 0.5, active: 0.1, close: 0, track: 1, keys: scatterKeys() }],
  },

  /** Pearl of the Hollow Moon: a step back, the Pearl shaped in his palm (a self at his side helps, the
   *  others feed it a thread each), then a dash and the Pearl driven into you. Red: roll. Its burst grows
   *  with every self still standing; two blows on him while he shapes it burst it in his hand. */
  foxPearl: {
    label: 'Pearl of the Hollow Moon', phase: 1, weight: [1.3, 1.1, 0.9], cooldown: 10, band: [0, 9], recovery: 0.6, cat: 'closer', clonesFight: true, densityAs: 1.0,
    beats: [
      backstep(1.6),
      {
        tell: R, windup: PE.charge[0], active: 0.1, damage: PE.damage, knockback: PE.knockback, knockdown: true, pearl: 'drive',
        zone: { kind: 'line', r: 2.5, w: 1.3 }, part: 'palms', ...dash(PE.driveMax, 0.8, 1.0), track: 0.92, cock: 0.86, keys: driveKeys(),
      },
    ],
  },

  /** The Fox's Answer: his counter out of a guard, an elbow then a palm. */
  riposte: {
    label: "The Fox's Answer", phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
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

  /** Paper Punch (hidden, never picked): a paper self's blow. Its data and clip are the selves'. */
  paperCut: {
    label: 'Paper Punch', phase: 1, weight: [0, 0, 0], hidden: true, cooldown: 0, band: [0, 3], recovery: CP.recover,
    beats: [{ ...punch('cross', N, CP.windup, CP.damage, { knockback: CP.knockback }), fixed: true, close: 0, track: 0.8 }],
  },

  // ---------------------------------------------------------------- phase 2: A Thousand Bodies
  /** Hand to Hand: four blows; before the second and the last he trades places with a self. */
  relay: {
    label: 'Hand to Hand', phase: 2, weight: [0, 2.6, 2.4], cooldown: 6, band: [0, 4.0], recovery: 0.6,
    beats: [
      punch('jab', N, 0.46, 12),
      { ...punch('hook', N, 0.36, 12), swap: true, close: 2.4 },
      { ...kick('knee', N, 0.36, 12) },
      { ...punch('uppercut', B, 0.44, 20, { flare: true }), swap: true, close: 2.4 },
    ],
  },

  /** Fox Descending: he runs at a self, springs off its hands (it tears) and comes down on you with both
   *  fists (red: roll). A self throws him: the pack's own move. */
  springboard: {
    label: 'Fox Descending', phase: 2, weight: [0, 1.6, 1.6], cooldown: 9, band: [3, 11], recovery: 0.65, needs: 1, gapCloser: true, cat: 'closer', densityAs: 1.0,
    beats: [{
      ...punch('hammer', R, 0.95, 26, { cock: 0.7 }), zone: { kind: 'ring', r: 2.6 }, ring: 2.6, knockdown: true, knockback: 2.6, spring: true,
      leap: { from: 0.32, lock: 0.8, apex: 3.4 }, close: 0, track: 0.9,
    }],
  },

  /** The Thousand-Body Round: every live self strikes in turn, then his own palm (a parry moment). The
   *  beats are realised for the live count (realise below: roundBeats(n)); these are five's. */
  foxRing: {
    label: 'The Thousand-Body Round', phase: 2, weight: [0, 1.6, 1.8], cooldown: 12, band: [0, 6], recovery: 0.6, needs: 2, densityAs: 1.4,
    beats: roundBeats(5),
  },

  /** Pearl Rain: three pearls shaped at once and flung across your line (red: roll out of the row). */
  pearlRain: {
    label: 'Pearl Rain', phase: 2, weight: [0, 1.0, 0.9], cooldown: 11, band: [3, 12], recovery: 0.55, cat: 'ranged', clonesFight: true, densityAs: 1.0,
    beats: [
      backstep(1.9),
      { tell: R, windup: PE.charge[0], active: 0.1, damage: PE.damage, knockback: PE.knockback, pearl: 'charge', cast: { kind: 'pearl', selfCue: true }, part: 'palms', close: 0, track: 0.9, cock: 0.86, keys: flingKeys() },
    ],
  },

  /** A Thousand Bodies: the phase-2 transition. On one knee, then a ring of force (red); selves to the cap. */
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

  /** Moon-Swallowing Pearl: the Pearl grown huge and dark over his head, a leap down on you (black). */
  greatPearl: {
    label: 'Moon-Swallowing Pearl', phase: 3, weight: [0, 0, 0.9], cooldown: 14, band: [2.4, 9], recovery: 0.8, clonesFight: true,
    beats: [{
      ...punch('hammer', K, 1.5, 44, { cock: 0.85 }), fixed: true, hold: [0.1, 0.5], active: 0.14, knockback: 3, knockdown: true,
      zone: { kind: 'ring', r: 3.4 }, ring: 3.4, close: 0, track: 0.9, leap: { from: 0.55, lock: 0.85, apex: 3.2 }, pearl: 'great',
    }],
  },

  /** The Nine-Tailed Fox: the phase-3 transition. His selves burn up into him and the fox spirit wakes
   *  round him; the ring of force (red); then selves to the cap. */
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
const realiser = (M) => makeRealise({ TUNING, MOVES: M, compileClip: (keys, dur) => compileClip(keys, dur), completeBeat });
const base = realiser(MOVES);
// the Round realised for each live count (its own windup per count; FoxBrain.startAct passes `opts.selves`)
const ROUNDS = {};
for (let n = 2; n <= TUNING.clones.pool; n++) ROUNDS[n] = realiser({ foxRing: { ...MOVES.foxRing, beats: roundBeats(n) } });

/** A move as it will play this time (duelist/realise.js). The Round is realised for the selves alive
 *  as it starts (`opts.selves`). */
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  if (name === 'foxRing') {
    const n = Math.max(2, Math.min(TUNING.clones.pool, Math.round(Number(opts?.selves) || TUNING.clones.pool)));
    return ROUNDS[n](name, phase, rnd, opts);
  }
  return base(name, phase, rnd, opts);
}

/** The guard pose (for tools). */
export { GUARD };
