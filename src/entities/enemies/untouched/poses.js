import { DIM } from '../../player/model.js';
import { P, to3 } from '../../player/anim.js';
import { createDuelPoses } from '../duelist/poses.js';
import { GUARDS } from '../ascendant/poses.js';
import { X as ASC, CLIPS as ASC_CLIPS } from '../ascendant/moves.js';
import * as ML from './posesMelee.js';
import * as SP from './posesSpells.js';
import * as TR from './posesTerrain.js';

// Bai Wuji's stance, footwork pose and reaction clips (the BODY AGENT's file: stances, the walk, the
// reels, the two transitions' own clips, the death; the body contract: gear.js header). TODAY A
// STAND-IN: Halcyon's guard on the ground (he walks; no hover), the arms folded in phase 1 (the stand-in
// for "hands in his pockets": pilot.armsK 1 in phase 1, 0 after).
//
// THE POSES ROUTER: the three moves agents each own a pose file, merged here:
//   posesMelee.js    names start with `ml`   (the melee agent)
//   posesSpells.js   names start with `sp`   (the spells agent)
//   posesTerrain.js  names start with `tr`   (the terrain agent)
//   this file        no prefix               (the body agent)
// Each exports FRAGS (pose fragments), CLIPS (reaction clips: { dur, hold?, keys }), REACT (their root
// motion) and OPEN (the ones that leave him open). A name defined twice is reported (console.error) and
// the earlier one kept; the suite's DATA scenario fails on it. A pose file never imports this one.

const ANK = DIM.ankle;
const { F } = ASC;

/** His guard: upright, chin up, the fists low (the clips start from and return to it). */
export const GUARD = Object.freeze({
  ...GUARDS[2],
  bY: -0.02, pitch: -0.04, yaw: -0.12, hdX: -0.06, hdY: 0.1,
  rH: [-0.04, -0.42, 0.12], rP: [-0.9, -0.3, -0.3], lH: [0.04, -0.4, 0.14], lP: [0.9, -0.3, -0.3],
  rF: [-0.12, ANK, -0.04], lF: [0.13, ANK, 0.06],
});

const K = createDuelPoses(GUARD, { breath: { k: 0.8, period: 3.6 } });
export const { duelStance, compileClip, completeBeat, evalClip, duelClip } = K;

/** The arms folded across the chest (phase 1's footwork, the wait: the stand-in for his pockets). */
export const FOLDED = Object.freeze({ rH: [0.2, -0.12, 0.17], rP: [-0.9, -0.3, -0.4], lH: [-0.2, -0.08, 0.19], lP: [0.9, -0.3, -0.4] });

/** His footwork: the duelist's, the arms folded by A.player.armsK (1 phase 1, 0 later). */
export function wjLoco(p, A) {
  K.duelLoco(p, A);
  const f = Math.max(0, Math.min(1, A.player?.armsK ?? 1));
  if (f > 0) {
    to3(p, P.rH, ...FOLDED.rH, f);
    to3(p, P.rP, ...FOLDED.rP, f);
    to3(p, P.lH, ...FOLDED.lH, f);
    to3(p, P.lP, ...FOLDED.lP, f);
  }
}

/** The pose table HeroAnimator takes for him. */
export const WJ_POSES = Object.freeze({ loco: wjLoco, duel: K.POSES.duel });

// ---------------------------------------------------------------- the body's own clips
const STAND = F({ ...FOLDED, bY: -0.02, pitch: -0.04, hdX: -0.12, yaw: 0, flat: 1 });
const KNEEL = F({ bY: -0.52, pitch: 0.24, spX: 0.1, hdX: 0.4, yaw: 0, rF: [-0.12, 0.32], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7, rH: [0.06, 0.1, 0.18], lH: [0.06, -0.4, 0.2] });
/** The body's fragments (the transitions' keys read them: moves/melee.js). */
const BODY_FRAGS = {
  STAND, KNEEL,
  /** a finger hooked in the blindfold, pulled down (the P1 -> P2 transition) */
  UNVEIL: F({ ...STAND, rH: [0.06, 0.62, 0.22], rP: [-0.7, 0.4, -0.4], hdX: 0.12 }),
  /** the hand sign: two fingers crossed, raised before the face (the P2 -> P3 transition) */
  SIGN: F({ ...STAND, rH: [0.02, 0.5, 0.3], rP: [-0.7, 0.2, -0.3], lH: [0.2, -0.24, 0.0], hdX: -0.05 }),
};
const BODY_CLIPS = {
  ...ASC_CLIPS,
  meditate: { dur: 1, hold: true, keys: [[0, STAND]] },
  intro: { dur: 2.0, keys: [[0, STAND], [1.2, STAND], [1.6, F({ ...STAND, hdX: -0.2 })], [2.0, STAND]] },
  death: {
    dur: 3.0, hold: true,
    keys: [[0.3, { ...KNEEL, e: 'o' }], [1.3, KNEEL], [3.0, F({ ...KNEEL, bY: -0.58, pitch: 0.4, hdX: 0.7 })]],
  },
};

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
export const REACT = Object.freeze({ ...TR.REACT, ...SP.REACT, ...ML.REACT });
export const OPEN = Object.freeze([...new Set([...ML.OPEN, ...SP.OPEN, ...TR.OPEN])]);
/** Names each pose file defines (the suite's DATA checks the prefixes and that none is defined twice). */
export const POSE_FILES = Object.freeze({
  body: [...Object.keys(BODY_FRAGS), ...Object.keys(BODY_CLIPS).filter((k) => !(k in ASC_CLIPS))],
  ml: [...Object.keys(ML.FRAGS), ...Object.keys(ML.CLIPS)],
  sp: [...Object.keys(SP.FRAGS), ...Object.keys(SP.CLIPS)],
  tr: [...Object.keys(TR.FRAGS), ...Object.keys(TR.CLIPS)],
});
