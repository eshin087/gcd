import { DIM } from '../../player/model.js';
import { P, to3 } from '../../player/anim.js';
import { createDuelPoses } from '../duelist/poses.js';
import * as ML from './posesMelee.js';
import * as SP from './posesSpells.js';
import * as TR from './posesTerrain.js';

// Bai Wuji's stance, footwork and reaction clips (the BODY AGENT's file; the body contract: gear.js
// header). He does not take a stance: he stands. Tall, loose, the weight on one leg, the head tilted, the
// HANDS IN HIS POCKETS (elbows out). His "guard" is no guard: the barrier turns the blade, so a ward is a
// tilt of the head and a hand half out of a pocket. In phase 1 his footwork keeps both hands in the
// pockets; from phase 2 they come out, loose at his sides (pilot.armsK: 1 in phase 1, 0 after, eased:
// untouched.js brainFrame). Every clip starts from and returns to GUARD (hands in the pockets), so a
// blow drawn by the moves files comes out of the pockets and goes back into them.
//
// Pose channels (duelist/poses.js header): body space +x his LEFT, +y up, +z forward; hands are offsets
// from each shoulder; feet model space; `sw` [az, el] turns the right fist (it hangs on the sword joint).
//
// THE POSES ROUTER: the three moves agents each own a pose file, merged here:
//   posesMelee.js    names start with `ml`   (the melee agent)
//   posesSpells.js   names start with `sp`   (the spells agent)
//   posesTerrain.js  names start with `tr`   (the terrain agent)
//   this file        no prefix               (the body agent)
// Each exports FRAGS (pose fragments), CLIPS (reaction clips: { dur, hold?, keys }), REACT (their root
// motion) and OPEN (the ones that leave him open). A name defined twice is reported (console.error) and
// the earlier one kept; the suite's DATA scenario fails on it. A pose file never imports this one.
//
// THE BODY'S FRAGMENTS (FRAGS; the moves files and core's transitions read them):
//   POCKETS   { rH, rP, lH, lP, sw }: both hands in the coat's pockets, elbows out (spread it into a
//             kick's keys to keep the hands in: "the hands never leave his pockets")
//   POCKET_R / POCKET_L   one hand in its pocket (the other free for a palm or a sign)
//   LOOSE     both hands out, loose at his sides (phases 2 - 3)
//   STAND     standing, hands in the pockets, the head tilted (the transitions' rest)
//   UNVEIL    a finger of the right hand hooked in the band over his eyes (the P1 -> P2 transition)
//   UNVEIL_PULL  the band pulled down to his neck, the head dipped, the hair shaken out (its follow)
//   SIGN      the left hand raised before his face, two fingers up (the sword fingers), held; the right
//             hand in its pocket (the P2 -> P3 transition: look.js shows the two fingers through it)
//   KNEEL     on one knee (the posture break, the death)

const ANK = DIM.ankle;

/** Both hands in the coat's pockets: the fists at the front of the hips, the elbows out and back. */
export const POCKETS = Object.freeze({
  rH: [0.065, -0.43, 0.05], rP: [-1, -0.1, -0.45], lH: [-0.065, -0.43, 0.05], lP: [1, -0.1, -0.45], sw: [0.1, -1.25],
});
/** Out of the pockets, loose at his sides, the fingers half curled (phases 2 - 3). */
export const LOOSE = Object.freeze({
  rH: [-0.02, -0.5, 0.05], rP: [-0.9, -0.1, -0.35], lH: [0.03, -0.49, 0.06], lP: [0.9, -0.1, -0.35], sw: [0.1, -1.35],
});

/** His stance: upright and tall, the weight on his left leg, the hip out, the head tilted; the hands
 *  in the pockets. */
export const GUARD = Object.freeze({
  bX: 0.025, bY: -0.015, bZ: 0.0, pitch: -0.035, yaw: -0.18, roll: 0,
  hip: 0.05, hipZ: 0.05, hipX: 0, spX: -0.03, spY: 0.06, spZ: -0.035,
  hdX: -0.05, hdY: 0.1, hdZ: 0.09, two: 0, flat: 1, rFy: -0.35, lFy: 0.12,
  ...POCKETS,
  swF: [0, 0, 1], rK: [-0.25, 0, 1], lK: [0.2, 0, 1],
  rF: [-0.15, ANK, -0.03], lF: [0.1, ANK, 0.07],
});

const K = createDuelPoses(GUARD, {
  breath: { k: 0.6, period: 4.2 },
  // at a run the right hand stays in its pocket (the left swings free: duelLoco)
  run: { hand: POCKETS.rH, pole: POCKETS.rP, blade: POCKETS.sw, flat: [0, 0, 1] },
});
export const { duelStance, compileClip, completeBeat, evalClip, duelClip } = K;

/**
 * His footwork: the duelist's, then (1) a slouch while he walks (the chest and head a little down, the
 * shoulders loose), and (2) the hands: in the pockets in phase 1 (pilot.armsK 1), out and loose at his
 * sides after (armsK 0), standing; walking from phase 2 they swing with the gait.
 */
export function wjLoco(p, A) {
  K.duelLoco(p, A);
  const w = Math.max(0, Math.min(1, A.moveW ?? 0));
  if (w > 0.002) {
    p[P.pitch] += 0.045 * w;
    p[P.spX] += 0.05 * w;
    p[P.hdX] += 0.06 * w;
  }
  const inK = Math.max(0, Math.min(1, A.player?.armsK ?? 1));
  // phase 1: both hands kept in, walking or running (his gait swings the free arm otherwise)
  if (inK > 0.001) {
    to3(p, P.rH, ...POCKETS.rH, inK);
    to3(p, P.rP, ...POCKETS.rP, inK);
    to3(p, P.lH, ...POCKETS.lH, inK);
    to3(p, P.lP, ...POCKETS.lP, inK);
  }
  // later: out of the pockets, loose (standing; walking the gait carries the arms)
  const out = (1 - inK) * (1 - w);
  if (out > 0.001) {
    to3(p, P.rH, ...LOOSE.rH, out);
    to3(p, P.rP, ...LOOSE.rP, out);
    to3(p, P.lH, ...LOOSE.lH, out);
    to3(p, P.lP, ...LOOSE.lP, out);
  }
}

/** The pose table HeroAnimator takes for him. */
export const WJ_POSES = Object.freeze({ loco: wjLoco, duel: K.POSES.duel });

// ---------------------------------------------------------------- the body's fragments
/** A whole pose: the stance's every field, then `p` (so nothing one key set leaks into the next); the
 *  head turned back onto the opponent unless the pose turns it itself. */
function W(p) {
  const out = { ...GUARD, ...p };
  if (p.hdY === undefined) out.hdY = GUARD.hdY - ((p.yaw ?? GUARD.yaw) - GUARD.yaw) * 0.82 - (p.spY ?? 0) * 0.82;
  return out;
}
const POCKET_R = Object.freeze({ rH: POCKETS.rH, rP: POCKETS.rP, sw: POCKETS.sw });
const POCKET_L = Object.freeze({ lH: POCKETS.lH, lP: POCKETS.lP });

const STAND = W({});
/** On one knee, the right hand on the knee, the left on the floor; the head down. */
const KNEEL = W({
  bX: 0, bY: -0.52, pitch: 0.24, yaw: 0, hip: 0, hipZ: 0, spX: 0.1, spY: 0, spZ: 0, hdX: 0.4, hdZ: 0,
  rF: [-0.12, ANK, 0.32], lF: [0.17, ANK, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7, rFy: -0.1, lFy: 0.1,
  rH: [0.08, -0.32, 0.36], rP: [-0.8, -0.3, -0.2], lH: [0.02, -0.55, 0.22], lP: [0.7, -0.3, 0.2], sw: [0.2, -1.0],
});
/** A finger hooked in the band over his eyes: the right hand at his brow, the elbow high and out, the
 *  chin up; the left still in its pocket. */
const UNVEIL = W({
  pitch: -0.06, yaw: -0.12, hdX: -0.16, hdZ: 0.04, spX: -0.06,
  rH: [0.1, 0.36, 0.2], rP: [-0.9, 0.5, -0.1], sw: [0.4, 1.0], ...POCKET_L,
});
/** ... pulled down to his neck: the hand at the throat, the head dipped and turned (the hair shaken
 *  out), the shoulders dropping. */
const UNVEIL_PULL = W({
  pitch: 0.04, yaw: -0.2, hdX: 0.22, hdY: 0.35, hdZ: -0.12, spX: 0.06,
  rH: [0.14, 0.1, 0.18], rP: [-0.9, 0.1, -0.2], sw: [0.4, -0.2], ...POCKET_L,
});
/** The hand sign: the left hand raised before his face, two fingers up, the elbow in; the right hand in
 *  its pocket; square to the hero, the chin level. */
const SIGN = W({
  yaw: -0.05, pitch: -0.02, hdX: 0.0, hdY: 0.02, hdZ: 0.02, spX: -0.02, spY: 0.0, spZ: 0,
  lH: [-0.14, 0.12, 0.3], lP: [0.6, -0.8, 0.0], ...POCKET_R,
});

/** The body's fragments (the transitions' keys and the moves files read them). */
const BODY_FRAGS = { POCKETS: W(POCKETS), POCKET_R, POCKET_L, LOOSE: W(LOOSE), STAND, KNEEL, UNVEIL, UNVEIL_PULL, SIGN };

// ---------------------------------------------------------------- the body's clips
// (keys: [t s, pose]; e: ease of the segment ending at the key: 's' smooth, 'o' ease-out, 'i' in, 'l', 'h')
/** A ward: a tilt of the head away from the blade, one hand half out of its pocket, the palm toward
 *  the blade at the hip (the barrier turns it, not the hand). `side` 1 = his left, -1 his right. */
function ward(side, high = false) {
  const hand = side > 0
    ? { lH: [0.02, high ? -0.1 : -0.3, 0.2], lP: [0.9, -0.4, 0.1], ...POCKET_R }
    : { rH: [-0.02, high ? -0.1 : -0.3, 0.2], rP: [-0.9, -0.4, 0.1], sw: [0.2, 0.2], ...POCKET_L };
  return W({ yaw: GUARD.yaw + side * 0.12, hdX: high ? -0.16 : -0.08, hdZ: GUARD.hdZ - side * 0.16, hdY: GUARD.hdY - side * 0.1, spZ: -side * 0.04, ...hand });
}
const WARD_L = ward(1), WARD_R = ward(-1), WARD_HIGH = ward(1, true);
/** A ward met: the head jerks a hair further, the half-drawn hand flicks out. */
const met = (Wd, dur = 0.34) => ({
  dur, hold: true,
  keys: [[0, Wd], [0.07, { ...Wd, e: 'o', bZ: -0.06, hdX: Wd.hdX - 0.06, spX: -0.06 }], [0.2, { ...Wd, bZ: -0.02 }]],
});
/** Surprised: the head snaps back, both hands out of the pockets, a half step back on his heels. */
const SURPRISED = W({
  pitch: -0.2, bZ: -0.08, bY: -0.06, hdX: -0.3, hdZ: 0, spX: -0.12,
  rH: [-0.18, -0.26, 0.16], rP: [-0.9, -0.2, -0.1], lH: [0.2, -0.24, 0.18], lP: [0.9, -0.2, -0.1], sw: [0.0, 0.2],
  rF: [-0.15, ANK, -0.2], lF: [0.12, ANK, 0.12],
});
/** The intro's first pose: hands in his pockets, his back half turned, the head turned over his
 *  shoulder to the hero, tilted. */
const BACK_TURNED = W({ yaw: -1.6, hdY: 1.05, hdZ: 0.14, hdX: -0.06, spY: 0.25, hip: -0.1, rF: [-0.12, ANK, 0.05], lF: [0.12, ANK, -0.05], rFy: -1.5, lFy: -1.3 });

const BODY_CLIPS = {
  // the guard (duelist/guard.js kinds: ward = his left side, wardR his right, wardHigh over his head)
  ward: met(WARD_L),
  wardR: met(WARD_R),
  wardHigh: met(WARD_HIGH, 0.38),
  clash: met(WARD_L, 0.26),
  // the deflect: the left hand flicks out of its pocket, the back of it brushes the blade aside, back in
  deflect: {
    dur: 0.28,
    keys: [[0, WARD_L], [0.08, W({ e: 'o', yaw: GUARD.yaw - 0.25, hdZ: -0.05, lH: [-0.3, -0.12, 0.34], lP: [0.9, -0.2, -0.2], ...POCKET_R })], [0.2, WARD_L]],
  },
  wardHold: { dur: 1, hold: true, keys: [[0, WARD_L]] },
  flinch: { dur: 0.26, keys: [[0.07, { e: 'o', spX: -0.08, hdX: -0.16, bZ: -0.05, yaw: GUARD.yaw - 0.15 }]] },
  // a lazy glide back, the hands kept in, the feet barely leaving the floor
  backstep: {
    dur: 0.42,
    keys: [
      [0.1, W({ bY: -0.04, pitch: -0.08, rF: [-0.15, 0.06, -0.12], lF: [0.1, 0.04, 0.02], rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1], flat: 0.6 })],
      [0.28, W({ bY: -0.03, pitch: -0.06, rF: [-0.15, 0.05, -0.16], lF: [0.1, 0.05, -0.02], flat: 0.7 })],
      [0.4, W({ bY: -0.04, flat: 1 })],
    ],
  },
  sidestep: {
    dur: 0.38,
    keys: [
      [0.12, W({ bY: -0.05, roll: 0.08, rF: [-0.18, 0.06, -0.08], lF: [0.14, 0.08, 0.08], rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1], flat: 0.6 })],
      [0.28, W({ bY: -0.03, roll: 0.02, flat: 1 })],
    ],
  },
  // a heavy blow through the open barrier: he is SURPRISED (the head snaps back, the hands come out)
  stagger: {
    dur: 0.8,
    keys: [[0.12, { ...SURPRISED, e: 'o' }], [0.5, W({ pitch: -0.08, bY: -0.06, hdX: -0.1, rH: [-0.12, -0.36, 0.14], lH: [0.14, -0.36, 0.14] })]],
  },
  /** Surprised (core may play it the first time the hero's blade really reaches him): held a moment
   *  longer than the stagger, then the hands go back into the pockets. */
  surprised: {
    dur: 1.0,
    keys: [[0.1, { ...SURPRISED, e: 'o' }], [0.45, { ...SURPRISED, hdX: -0.22, pitch: -0.14 }], [0.85, W({ hdX: 0.02, hdZ: -0.06 })]],
  },
  // his blow parried: the striking leg / hand knocked away, a step back, the head turned
  recoil: {
    dur: 1.0,
    keys: [
      [0.1, W({ e: 'o', pitch: -0.2, bZ: -0.08, yaw: -0.5, hdX: -0.18, rH: [-0.22, 0.1, 0.12], rP: [-0.8, 0.4, -0.4], lH: [0.24, -0.2, 0.1], rF: [-0.18, ANK, -0.36], lF: [0.16, ANK, 0.08], sw: [0, 0.3] })],
      [0.6, W({ pitch: -0.1, yaw: -0.4, rH: [-0.08, -0.3, 0.14], lH: [0.12, -0.32, 0.12] })],
    ],
  },
  reeling: {
    dur: 1.45,
    keys: [
      [0.12, W({ e: 'o', pitch: -0.32, bZ: -0.14, bY: -0.1, yaw: -0.4, hdX: -0.3, hdZ: 0, rH: [-0.32, 0.0, 0.04], rP: [-0.9, 0.3, -0.3], lH: [0.3, 0.04, 0.0], lP: [0.9, 0.3, 0.0], rF: [-0.12, ANK, 0.05], lF: [0.2, ANK, -0.5], sw: [0, 0.3] })],
      [0.6, W({ pitch: -0.18, bY: -0.16, yaw: -0.2, hdX: -0.1, rH: [-0.26, -0.18, 0.12], lH: [0.26, -0.16, 0.1], rF: [-0.14, ANK, -0.15], lF: [0.18, ANK, -0.45] })],
      [1.1, W({ pitch: -0.04, bY: -0.08, hdX: 0, rH: [-0.08, -0.34, 0.12], lH: [0.1, -0.34, 0.12] })],
    ],
  },
  // stepped on (a mikiri): pitched forward, a hand on the floor, then thrown back
  trampled: {
    dur: 1.5,
    keys: [
      [0.1, W({ e: 'o', pitch: 0.42, bY: -0.34, bZ: 0.1, hdX: 0.45, rH: [0.06, -0.36, 0.46], rP: [-0.6, -0.6, 0.2], lH: [0.0, -0.2, 0.3], rF: [-0.08, ANK, -0.48], lF: [0.22, ANK, 0.7], sw: [0, -0.4] })],
      [0.75, W({ pitch: 0.35, bY: -0.3, hdX: 0.4, rH: [0.04, -0.34, 0.42], lH: [0.0, -0.2, 0.3], rF: [-0.08, ANK, -0.48], lF: [0.22, ANK, 0.7] })],
      [1.0, W({ e: 'o', pitch: -0.2, bY: -0.1, bZ: -0.1, hdX: -0.1, rH: [-0.2, -0.2, 0.16], lH: [0.24, -0.16, 0.1], rF: [-0.18, ANK, -0.4], lF: [0.2, ANK, 0.08] })],
    ],
  },
  // the lock: one open palm against the blade before him (the barrier between), the other in its pocket
  lock: {
    dur: 3, hold: true,
    keys: [
      [0.1, W({ e: 'o', bY: -0.08, bZ: 0.06, pitch: 0.08, yaw: -0.25, hdX: 0.02, lH: [-0.06, 0.12, 0.42], lP: [0.8, -0.6, 0.0], ...POCKET_R, rF: [-0.18, ANK, -0.3], lF: [0.14, ANK, 0.3] })],
      [3, W({ bY: -0.1, bZ: 0.08, pitch: 0.1, yaw: -0.25, hdX: 0.04, lH: [-0.06, 0.12, 0.44], lP: [0.8, -0.6, 0.0], ...POCKET_R, rF: [-0.18, ANK, -0.32], lF: [0.14, ANK, 0.32] })],
    ],
  },
  // the posture break: surprised, then down on one knee, one hand on the floor, looking up at the end
  broken: {
    dur: 4.5, hold: true,
    keys: [
      [0.14, { ...SURPRISED, e: 'o' }],
      [0.45, { ...KNEEL, e: 'o' }],
      [4.0, { ...KNEEL, hdX: 0.3 }],
      [4.5, { ...KNEEL, bY: -0.42, hdX: 0.0, hdZ: 0.1 }],
    ],
  },
  executed: {
    dur: 1.2, hold: true,
    keys: [
      [0.0, KNEEL],
      [0.2, { ...KNEEL, e: 'o', pitch: -0.32, hdX: -0.38, bY: -0.45, rH: [-0.3, -0.2, 0.05], lH: [0.3, -0.1, 0.1] }],
      [0.75, { ...KNEEL, pitch: 0.3, hdX: 0.5, bY: -0.55 }],
      [1.2, { ...KNEEL, pitch: 0.26, hdX: 0.5, bY: -0.54 }],
    ],
  },
  // the death: a step back, surprised once more, down on one knee, the head bowed; then forward onto
  // his hands
  death: {
    dur: 3.0, hold: true,
    keys: [
      [0.25, { ...SURPRISED, e: 'o' }],
      [0.8, { ...KNEEL, e: 'o', pitch: 0.1, hdX: 0.2 }],
      [1.8, { ...KNEEL, hdX: 0.55 }],
      [3.0, { ...KNEEL, bY: -0.6, pitch: 0.5, hdX: 0.6, rH: [0.06, -0.5, 0.36], lH: [-0.02, -0.55, 0.32] }],
    ],
  },
  /** He waits for a challenger: standing, hands in the pockets, the head a little down. */
  meditate: { dur: 1, hold: true, keys: [[0, W({ hdX: 0.12, hdZ: 0.04 })]] },
  /** The intro: his back half turned, the head over his shoulder; a slow look; he turns to face the
   *  hero, the head tilting the other way (hands in the pockets throughout). */
  intro: {
    dur: 2.2,
    keys: [
      [0, BACK_TURNED],
      [0.8, { ...BACK_TURNED, hdZ: 0.2, hdX: -0.1 }],
      [1.5, W({ e: 'o', yaw: -0.7, hdY: 0.5, hdZ: 0.05, rFy: -0.8, lFy: -0.4 })],
      [2.2, STAND],
    ],
  },
};

/** Suggested keys for core's two transitions (moves.js TRANSITION_MOVES; core owns them): the unveiling
 *  (u 0..2, impact at 1.0: the dress changes there) and the hand sign's two beats. */
export const TRANSITION_KEYS = Object.freeze({
  unveil: [[0.2, STAND], [0.55, UNVEIL], [0.85, UNVEIL], [1.0, { ...UNVEIL_PULL, e: 'o' }], [1.4, UNVEIL_PULL], [2.0, STAND]],
  measurelessSign: [[0.2, STAND], [0.4, { ...SIGN, e: 'o' }], [1.0, SIGN], [2.0, SIGN]],
  measurelessClose: [[0.4, SIGN], [0.8, SIGN], [1.0, { ...SIGN, e: 'i', bY: -0.04 }], [2.0, SIGN]],
});

// ---------------------------------------------------------------- the router
function mergeNamed(label, parts) {
  const out = {};
  for (const [who, map] of parts) {
    for (const [k, v] of Object.entries(map ?? {})) {
      if (Object.hasOwn(out, k)) {
        console.error(`[untouched] ${label} "${k}" of ${who} is defined twice: the first kept`);
        continue;
      }
      out[k] = v;
    }
  }
  return out;
}
/** Every pose fragment by name (the body's unprefixed, then ml / sp / tr). */
export const FRAGS = Object.freeze(mergeNamed('pose', [['poses.js', BODY_FRAGS], ['posesMelee.js', ML.FRAGS], ['posesSpells.js', SP.FRAGS], ['posesTerrain.js', TR.FRAGS]]));
/** Every reaction clip (uncompiled: moves.js compiles them). */
export const CLIPS = Object.freeze(mergeNamed('clip', [['poses.js', BODY_CLIPS], ['posesMelee.js', ML.CLIPS], ['posesSpells.js', SP.CLIPS], ['posesTerrain.js', TR.CLIPS]]));
/** Extra reactions' root motion, and which leave him open (the kit's REACT / OPEN). */
export const REACT = Object.freeze({ surprised: { travel: -0.4 }, ...TR.REACT, ...SP.REACT, ...ML.REACT });
export const OPEN = Object.freeze([...new Set(['surprised', ...ML.OPEN, ...SP.OPEN, ...TR.OPEN])]);
/** Names each pose file defines (the suite's DATA checks the prefixes and that none is defined twice). */
export const POSE_FILES = Object.freeze({
  body: [...Object.keys(BODY_FRAGS), ...Object.keys(BODY_CLIPS)],
  ml: [...Object.keys(ML.FRAGS), ...Object.keys(ML.CLIPS)],
  sp: [...Object.keys(SP.FRAGS), ...Object.keys(SP.CLIPS)],
  tr: [...Object.keys(TR.FRAGS), ...Object.keys(TR.CLIPS)],
});
/** The body's base clips (the suite's BODY scenario plays each). */
export const BODY_CLIP_NAMES = Object.freeze(Object.keys(BODY_CLIPS));
