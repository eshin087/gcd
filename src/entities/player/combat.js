import * as THREE from 'three';
import { clamp, lerp } from '../../core/math.js';
import { DIM } from './model.js';
import { FINISHER_ANIMS, finisherId, pickFinisher } from './finishers.js';

// Attack data + the blade sweep used for hit detection. No stamina: pacing comes from windup /
// recovery only (docs/COMBAT.md). Moveset (ADR-041; owner concept sheet "Combat key poses"):
//   LMB tap ×5  a cut from the right → a backhand → a whirl (a full turn) → a lunge, all one-handed
//               (ADR-071), → the two-handed SLAM (combo finisher: a leap and one diagonal into the
//               ground, a shard burst, more damage + posture)
//   LMB while sprinting      SPRINT_ATK: a bounding rising slash that keeps the run's momentum
//   LMB out of a forward roll ROLL_ATK: a low cut rising out of the crouch
//               (both count as hit 1: the next tap is the rising backhand)
//   HEAVY       (RMB / R2 / the HEAVY tile; ADR-115) the chain's BRANCH at the point it is pressed:
//               HEAVY[0] alone (or after the slam, a sprint's or a roll's run-out), HEAVY[n] after the
//               n-th light (L-H, L-L-H, ...): five heavy moves, each with its own job (combat.js HEAVY)
//   HEAVY hold  a deep coiled charge, the blade held up behind the right shoulder and glowing;
//               release = the dashing CLEAVE (the root travels forward, farther with more charge, and
//               the blade carves one diagonal through the target as the dash arrives). A light press
//               comes out at once: only the heavy button waits to see whether it is held
//
// Swing shapes (`anim`) are read by anim.js:
//   kind 'clip'   — a keyframed clip from swings.js (`clip`: its name): the light swings, the
//                   slam and the cleave. The clip's keys run over this attack's windup / active frames / recovery,
//                   and its blade crosses the front of the hero inside the active frames, exactly
//                   while it can hit. Options: `spin` (±1: the whole body turns once through the
//                   active frames, − = to his right), `turn` (rad, + = to his left: a partial body
//                   pivot through the cut that turns back in the recovery; the feet turn on their
//                   balls), `spinFeet` ('hop': a spin's feet leave the grass from where they stand
//                   through the fast part of the turn, are carried round with the body, each round
//                   its own side to its stance spot, and land on it; 'carry', the default: they are
//                   carried round with it in two quick pivot steps), `hop` (m: a skip off the
//                   ground through the windup into the cut; `tuck`: how far the feet lift with it,
//                   × the hop, over 1 = the knees draw up), `feet: 'dash'` (bounding steps for a
//                   long root travel instead of one lunge step; `dashW`: the dash starts at the
//                   windup's end).
//   kind 'thrust' — the execution's lunge: blade level along the facing line, hands driven forward.
//
// `variants` (Session 16, owner: "I don't want him to show the same pattern over and over"): other
// looks for the same hit. The animator picks `anim` or one of them at random when the hit starts
// (its own noise, never the game's RNG; never the same one twice in a row, and never a clip along
// the line the swing before it cut: swings.js `line`). Every variant keeps the hit's timing, damage,
// reach and lunge and sweeps the blade across his front inside the active frames, so the chain
// still connects (the REACH test swings each one).
//
// `lunge` = m stepped forward through the strike; `reach` = how far ahead of the hero the swing
// connects without stepping (used by the step-in assist to size the lunge, see REACH.assist).
// `chain` = the fraction of the recovery after which the next light may start: the cut carries
// through before the next one winds up (it was 0: a mashed chain cut each swing off as its active
// frames ended, 4 hits a second).
// `bite` = how hard the edge catches in what it cuts (× anim.js BITE, default 1; a clip's landed,
// unguarded hit only): through the hit-pause the hips drop, the chest folds into the blow, the head
// nods, the grip pulls in and the blade holds where it bit, then tears on through. The heavier the
// blow the deeper (the slam 1.3, the sprint slash 1.1, the cleave 1.5: its clip folds neither the
// chest nor the head into it, swings.js `fold`); the thrust has none.
//
// Pace (Session 26, owner: "speed up the attack speed ... its too slow right now"): a light is a
// short gather, a QUICK cut and a held finish: windup 0.11 s, active 0.12 s, and the next light may
// start 30 % into the recovery, so a mashed chain lands a hit every ~0.30 s. (History: 0.25 s a hit
// until Session 25, where the owner found the swings "too fast to follow" and they went to 0.42 s
// with a 0.18 s cut; the cut itself is now as quick as it was then, and what makes it readable is the
// pose held at each end and the arc that hangs in the air behind the blade, ADR-074.) The lights'
// damage and posture are back to what they were at the old pace (the x1.4 that paid for the slow
// chain is gone), so a mashed chain's damage per second is about what it has been.

export const LIGHT = [
  {
    // 1, a cut from the right. The falling cut: cocked beside the head (blade up-back-right) → a
    // diagonal down across the front → low past the left hip
    name: 'fallingCut', kind: 'light', combo: 1, damage: 30, poise: 12, heavy: false,
    windup: 0.11, active: 0.12, recovery: 0.24, chain: 0.3, lunge: 0.55, reach: 2.2,
    hitstop: 0.055, shake: 0.12, bite: 1, contact: 'light', punch: 0.35, kick: 0.08,
    anim: { kind: 'clip', clip: 'fallingCut' }, // high right → low left
    variants: [
      { kind: 'clip', clip: 'drawSlash', turn: 0.3 }, // low and flat from the right hip, pivoting into it
      { kind: 'clip', clip: 'risingSlash', hop: 0.12 }, // a skip in, from the right knee up to high left
    ],
  },
  {
    // 2, a backhand from the left. The rising backhand: from low at the left hip up across the front
    // to high right
    name: 'risingCut', kind: 'light', combo: 2, damage: 32, poise: 12, heavy: false,
    windup: 0.11, active: 0.12, recovery: 0.24, chain: 0.3, lunge: 0.55, reach: 2.2,
    hitstop: 0.055, shake: 0.12, bite: 1, contact: 'light', punch: 0.35, kick: 0.08,
    anim: { kind: 'clip', clip: 'risingBackhand' }, // low left → high right
    variants: [
      { kind: 'clip', clip: 'flatBackhand', turn: -0.4 }, // level at chest height, pivoting round with it
      { kind: 'clip', clip: 'fallingBackhand' }, // from over the left shoulder down to the right hip
    ],
  },
  {
    // 3, the whirl: he follows the backhand round to his right, a full turn with the sword arm thrown
    // out level; the blade crosses the front two thirds of the way round, inside the active frames
    name: 'whirl', kind: 'light', combo: 3, damage: 36, poise: 16, heavy: false,
    windup: 0.13, active: 0.15, recovery: 0.26, chain: 0.3, lunge: 0.7, reach: 2.2,
    hitstop: 0.065, shake: 0.16, bite: 1, contact: 'sweep', punch: 0.45, kick: 0.1,
    anim: { kind: 'clip', clip: 'whirl', spin: -1, spinFeet: 'hop' },
    variants: [
      { kind: 'clip', clip: 'risingWhirl', spin: -1, spinFeet: 'hop' }, // the same turn out of a crouch, the blade spiralling up
      { kind: 'clip', clip: 'lowSweep' }, // no turn: a crouching sweep along the grass
    ],
  },
  {
    // 4, the lunge (def name `stab`): the hand draws back to the right ribs, then one long line from
    // the rear heel to the point
    name: 'stab', kind: 'light', combo: 4, damage: 30, poise: 14, heavy: false,
    windup: 0.11, active: 0.1, recovery: 0.24, chain: 0.3, lunge: 0.8, reach: 2.3,
    hitstop: 0.07, shake: 0.14, bite: 1, contact: 'point', punch: 0.6, kick: 0.1,
    glint: 'ridge', // the edge glint and the contact's flash run up the ridge (fx.edgeGlint): a point-first drive
    anim: { kind: 'clip', clip: 'lunge' },
    variants: [
      { kind: 'clip', clip: 'risingThrust' }, // out of a crouch, the point driving up into the target
    ],
  },
  {
    // 5, the combo finisher: raise two-handed overhead, slam down, crystal shards burst from the ground
    name: 'slam', kind: 'slam', combo: 5, damage: 66, poise: 44, heavy: true,
    // (`chain`: a mashed button no longer cuts the landing off as the blade meets the ground; the
    // blow's damage is up from 58 to pay for the beat it holds)
    windup: 0.28, active: 0.13, recovery: 0.42, chain: 0.3, lunge: 0.75, reach: 2.1,
    hitstop: 0.12, shake: 0.42, bite: 1.3, contact: 'slam', punch: 1.6, kick: 0.2,
    up: 1.0, // reach band above the blade: lower than the sweeps' so the raise can't tag the neck overhead
    shards: { radius: 1.7, height: 3.2 }, // ground burst at the impact point (hits if the blade missed)
    // a clip like the lights (swings.js `groundSlam`): a gather at the right hip, a leap as the blade
    // sweeps up his right side and cocks over the shoulder, one diagonal down into the ground ahead
    anim: { kind: 'clip', clip: 'groundSlam', hop: 0.26, tuck: 1.2 }, // a leap through the raise, the knees drawn up, landing on the blow
    variants: [
      { kind: 'clip', clip: 'groundSlam', hop: 0.09 }, // nearly grounded: he rises onto his toes and stamps into it
    ],
  },
];

/**
 * The chain's looks (ADR-188, the weight pass). `?lights=old` (or the Lab's PLAYER → `lights` row,
 * live) plays the clips it had before (swings.js / lightsOld.js `…Old`, and the `drawCut` and `slam`
 * it shared with the flurry, One Breath and Earthbreaker); only LIGHT's `anim` / `variants` change, so
 * every hit's timing, damage, reach, tells and its heavy branch are the same in both. The animator
 * reads them as each hit starts (anim.js _pickVariant). Two more to compare while the owner picks:
 * `?lights=fresh` (lightsFresh.js) and `?lights=blink` (lightsBlink.js, hit 5 from finishers.js,
 * `?finisher=lance|cross|talisman|flash`; the blink chain's finisher spell replaces the slam's shards).
 */
export const LIGHTS_IDS = ['new', 'old', 'fresh', 'blink'];
export const LIGHTS_NAMES = { new: 'weighted', old: 'before', fresh: 'brand new', blink: 'instant cuts' };
const LIGHT_OLD = [
  {
    anim: { kind: 'clip', clip: 'fallingCutOld' },
    variants: [{ kind: 'clip', clip: 'drawCut', turn: 0.3 }, { kind: 'clip', clip: 'risingSlashOld', hop: 0.12 }],
  },
  {
    anim: { kind: 'clip', clip: 'risingBackhandOld' },
    variants: [{ kind: 'clip', clip: 'flatBackhandOld', turn: -0.4 }, { kind: 'clip', clip: 'fallingBackhandOld' }],
  },
  {
    anim: { kind: 'clip', clip: 'whirlOld', spin: -1, spinFeet: 'hop' },
    variants: [{ kind: 'clip', clip: 'risingWhirlOld', spin: -1, spinFeet: 'hop' }, { kind: 'clip', clip: 'lowSweepOld' }],
  },
  { anim: { kind: 'clip', clip: 'lungeOld' }, variants: [{ kind: 'clip', clip: 'risingThrustOld' }] },
  { anim: { kind: 'clip', clip: 'slam', hop: 0.26, tuck: 1.2 }, variants: [{ kind: 'clip', clip: 'slam', hop: 0.09 }] },
];
/** `?lights=fresh`: a brand-new chain to compare (lightsFresh.js: new sword paths and body shapes),
 *  on the same clock: a high flat ring, a kneeling sweep along the grass (a pivot carries it on), a
 *  leap with a rising cut, a full turn to his left into a side-on thrust (or a skip into it, its second
 *  look), and a two-handed diagonal from over the right shoulder into the ground, with a touch of
 *  magic on the cut (finisherFx.js). */
const LIGHT_FRESH = [
  { anim: { kind: 'clip', clip: 'freshCloudRing' }, variants: [] },
  { anim: { kind: 'clip', clip: 'freshKneelSweep', turn: -0.5 }, variants: [] },
  { anim: { kind: 'clip', clip: 'freshDragonLeap', hop: 0.3, tuck: 1.25 }, variants: [] },
  { anim: { kind: 'clip', clip: 'freshSwallowThrust', spin: 1, spinFeet: 'hop' }, variants: [{ kind: 'clip', clip: 'freshTwoStepThrust', hop: 0.08, tuck: 0.6 }] },
  { anim: { kind: 'clip', clip: 'freshSplitter', hop: 0.18, tuck: 1.1 }, variants: [] },
];
/** `?lights=blink` (the owner, 2026-11-25: "a fierce skilled striker instead of ... acrobatics", no
 *  twirls, a finisher that is a spell and looks nothing like the heavy slam): hits 1-2 precise, tight
 *  cuts that snap to a stop, hits 3-4 planted, brutal blows (lightsBlink.js), and hit 5 the finisher
 *  picked in finishers.js (`?finisher=`). No spin and no hop anywhere. */
const LIGHT_BLINK = [
  { anim: { kind: 'clip', clip: 'strikeFalling' }, variants: [{ kind: 'clip', clip: 'strikeDraw', turn: 0.3 }, { kind: 'clip', clip: 'strikeRising' }] },
  { anim: { kind: 'clip', clip: 'strikeBackhand' }, variants: [{ kind: 'clip', clip: 'strikeFlatBack', turn: -0.4 }, { kind: 'clip', clip: 'strikeFallingBack' }] },
  { anim: { kind: 'clip', clip: 'strikeCleave', turn: 0.35 }, variants: [{ kind: 'clip', clip: 'strikeHew' }, { kind: 'clip', clip: 'strikeLowCut' }] },
  { anim: { kind: 'clip', clip: 'strikeLunge' }, variants: [{ kind: 'clip', clip: 'strikeRisingThrust' }] },
  { anim: FINISHER_ANIMS[finisherId()], variants: [] },
];
const LIGHT_NEW = LIGHT.map((L) => ({ anim: L.anim, variants: L.variants }));
let lightsNow = 'new';
/** The chain's look now: 'new' (the default), 'old' or 'fresh'. */
export const lightsMode = () => lightsNow;
/** Switch the chain's look ('new' | 'old' | 'fresh'); false for anything else. */
export function setLights(mode) {
  if (!LIGHTS_IDS.includes(mode)) return false;
  if (mode === 'blink') LIGHT_BLINK[4].anim = FINISHER_ANIMS[finisherId()];
  const src = mode === 'old' ? LIGHT_OLD : mode === 'fresh' ? LIGHT_FRESH : mode === 'blink' ? LIGHT_BLINK : LIGHT_NEW;
  LIGHT.forEach((L, i) => {
    L.anim = src[i].anim;
    L.variants = src[i].variants;
  });
  lightsNow = mode;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lights') : null;
  if (q === 'old' || q === 'fresh' || q === 'blink') setLights(q);
}
/** Pick the blink chain's finisher (finishers.js; the Lab, the film rig): re-points hit 5 when the
 *  blink chain is on. False for an unknown id. */
export function setFinisherLook(id) {
  if (!pickFinisher(id)) return false;
  LIGHT_BLINK[4].anim = FINISHER_ANIMS[finisherId()];
  if (lightsNow === 'blink') LIGHT[4].anim = LIGHT_BLINK[4].anim;
  return true;
}

/**
 * The heavy BRANCHES (ADR-115; owner: "Heavy branches"): HEAVY[0] is the heavy pressed on its own,
 * HEAVY[n] the heavy pressed after the n-th light of the chain (in that light's recovery, from its
 * `chain`, or buffered through its cut). Each is a two-handed blow with its own job:
 *   0 Piercing Gale      a dashing two-handed thrust: the gap closer (`dash`, `travel` m)
 *   1 Rising Crescent    L-H: a rising two-handed cut from the left hip: it throws a duelist out of
 *                        what he is doing (`reel` 2: the stagger a flurry's last blow gives)
 *   2 Whirling Tempest   L-L-H: a full two-handed turn (`spin`): the blade sweeps all round him
 *   3 Mountain Splitter  L-L-L-H: a falling diagonal from over the left shoulder whose posture
 *                        (`poise` 50) crushes a duelist's raised guard (TUNING.guard.crushPoise 48)
 *   4 Earthbreaker       L-L-L-L-H: the slam with a higher leap, more damage and a wider ring of
 *                        shards (L-L-L-L-L is the plain slam, as before)
 * They end the chain: the next light is hit 1. Held past CHARGE.hold, a heavy press is the charge
 * (the dashing cleave) instead. Numbers are a first pass, to be tuned from play (game/telemetry.js).
 * `button: 'heavy'`: the press may still turn into the charge (its swing waits at the coil while the
 * button is held, player.js `pending`).
 */
export const HEAVY = [
  {
    name: 'piercingGale', label: 'Piercing Gale', kind: 'heavy', button: 'heavy', combo: 0, damage: 54, poise: 34, heavy: true, dash: true,
    windup: 0.3, active: 0.14, recovery: 0.42, chain: 0.35, lunge: 0, travel: 2.8, reach: 2.4,
    hitstop: 0.1, shake: 0.3, bite: 1.2, contact: 'point', punch: 1.2, kick: 0.16, glint: 'ridge',
    anim: { kind: 'clip', clip: 'heavyThrust', feet: 'dash', dashW: true },
  },
  {
    name: 'risingCrescent', label: 'Rising Crescent', kind: 'heavy', button: 'heavy', combo: 1, damage: 50, poise: 36, heavy: true, reel: 2,
    windup: 0.28, active: 0.14, recovery: 0.42, chain: 0.35, lunge: 0.7, reach: 2.3,
    hitstop: 0.1, shake: 0.32, bite: 1.25, contact: 'sweep', punch: 1.2, kick: 0.16,
    anim: { kind: 'clip', clip: 'heavyRise' },
  },
  {
    name: 'whirlingTempest', label: 'Whirling Tempest', kind: 'heavy', button: 'heavy', combo: 2, damage: 52, poise: 30, heavy: true,
    windup: 0.28, active: 0.18, recovery: 0.44, chain: 0.35, lunge: 0.6, reach: 2.4,
    hitstop: 0.1, shake: 0.32, bite: 1.2, contact: 'sweep', punch: 1.1, kick: 0.15,
    anim: { kind: 'clip', clip: 'heavySpin', spin: -1, spinFeet: 'hop' },
  },
  {
    name: 'mountainSplitter', label: 'Mountain Splitter', kind: 'heavy', button: 'heavy', combo: 3, damage: 62, poise: 50, heavy: true,
    windup: 0.34, active: 0.14, recovery: 0.46, chain: 0.35, lunge: 0.8, reach: 2.3,
    hitstop: 0.12, shake: 0.4, bite: 1.35, contact: 'slam', punch: 1.5, kick: 0.2,
    anim: { kind: 'clip', clip: 'heavyCrush' },
  },
  {
    name: 'earthbreaker', label: 'Earthbreaker', kind: 'slam', button: 'heavy', combo: 4, damage: 84, poise: 52, heavy: true,
    windup: 0.32, active: 0.13, recovery: 0.5, chain: 0.35, lunge: 0.85, reach: 2.1,
    hitstop: 0.14, shake: 0.5, bite: 1.4, contact: 'slam', punch: 1.9, kick: 0.24,
    up: 1.0,
    shards: { radius: 2.6, height: 3.6 },
    anim: { kind: 'clip', clip: 'slam', hop: 0.36, tuck: 1.3 },
  },
];

/** The heavy that a heavy press makes after `def` (the attack in whose recovery it comes): after the
 *  n-th light (n 1-4) its branch HEAVY[n]; after anything else (the slam, a heavy, nothing) HEAVY[0]. */
export function heavyAfter(def) {
  const n = def?.kind === 'light' ? Math.round(Number(def.combo) || 0) : 0;
  return HEAVY[n >= 1 && n <= 4 ? n : 0];
}

/** LMB while sprinting: a bounding rising slash, low right → high left, that carries the run's
 *  momentum `travel` m along the run direction (`keepYaw`: it does not snap to the aim). Counts as
 *  hit 1 of the combo. */
export const SPRINT_ATK = {
  name: 'sprintSlash', kind: 'light', combo: 1, damage: 40, poise: 18, heavy: false,
  windup: 0.11, active: 0.13, recovery: 0.32, chain: 0.25, lunge: 0, travel: 2.4, keepYaw: true, reach: 2.3,
  hitstop: 0.07, shake: 0.2, bite: 1.1, contact: 'sweep', punch: 0.5, kick: 0.1,
  anim: { kind: 'clip', clip: 'sprintSlash', feet: 'dash' },
};

/** LMB out of a forward roll: a low cut that rises out of the crouch, right → left. Counts as hit 1
 *  of the combo. */
export const ROLL_ATK = {
  name: 'rollCut', kind: 'light', combo: 1, damage: 34, poise: 14, heavy: false,
  windup: 0.1, active: 0.11, recovery: 0.26, chain: 0.3, lunge: 0.9, reach: 2.2,
  hitstop: 0.06, shake: 0.14, bite: 1, contact: 'light', punch: 0.4, kick: 0.08,
  anim: { kind: 'clip', clip: 'rollCut' },
};

/** The charged attack (hold HEAVY, release): the DASHING CLEAVE. The charge itself is the windup, so
 *  the release is quick: he bursts `travel` m forward (lerped by charge; `dash`: the root's travel
 *  runs through the active frames, front-loaded) with the blade cocked behind the right shoulder,
 *  and carves one two-handed diagonal through whatever the dash reaches as it dies out (the blade
 *  crosses his front over the last 40 % of the active frames), ending low in a long lunge.
 *  (Was a lunging thrust: the owner, session 25: "an impactful slash with a cool weightful hit
 *  instead of a poke".) */
export const CLEAVE = {
  name: 'cleave', kind: 'cleave', combo: 1, heavy: true, dash: true,
  damage: [70, 110], poise: [30, 50], // lerped by charge (see chargeStats)
  travel: [2.2, 3.6],
  windup: 0.08, active: 0.24, recovery: 0.45, lunge: 0, reach: 2.3,
  hitstop: 0.15, shake: 0.45, bite: 1.5, contact: 'cleave', punch: [1.2, 2.0], kick: [0.14, 0.24],
  // (the freeze × 1 + 0.3 × charge: player.js; the bite's drag caps at 1: the blade holds where it bit)
  anim: { kind: 'clip', clip: 'cleave', feet: 'dash', dashW: true },
};

/** The lunging thrust: the execution against a broken duelist (player.js _startExecuteThrust). The
 *  root travels forward through the active frames (`dash`). */
export const THRUST = {
  name: 'thrust', kind: 'thrust', combo: 1, heavy: true, dash: true,
  damage: [70, 110], poise: [30, 50],
  travel: [2.2, 3.6],
  windup: 0.07, active: 0.2, recovery: 0.45, lunge: 0, reach: 2.3,
  hitstop: 0.1, shake: 0.3, contact: 'execute',
  // the execution's own impact (player.js _executeHit): a long freeze, a heavy shake, a deep punch
  exec: { hitstop: 0.16, shake: 0.5, punch: 2.0, kick: 0.24 },
  anim: { kind: 'thrust' },
};

/** ONE BREATH (ADR-146): the Sheathed's reward, the hero's draw-slash. Guard, then hold HEAVY: the
 *  draw stance (the iai's coil at the right hip: anim.js flurryPose 'coil'); release: a blink step of
 *  `travel` m along his aim through the dashing heavy's machinery (player.js _startHeavy), `damage`, a
 *  short recovery. Released at most `counter` s before a foe's white or blue blade blow lands, the cut
 *  beats it aside as the flash counter does (his string ends, he reels) for `damage` and
 *  `counterPosture`, and no crit window (player.js _trade, `drawCounter`). Locked until the Sheathed falls
 *  (game.unlocks 'oneBreath'; ?tech=draw). */
export const ONE_BREATH = {
  name: 'oneBreath', kind: 'cleave', combo: 1, heavy: true, dash: true, drawCounter: true,
  damage: 46, poise: 30, travel: 5, counter: 0.12, counterPosture: 40,
  windup: 0.04, active: 0.1, recovery: 0.55, lunge: 0, reach: 2.4,
  hitstop: 0.12, shake: 0.35, bite: 1.2, contact: 'cleave', punch: [1.2, 1.6], kick: [0.12, 0.18],
  anim: { kind: 'clip', clip: 'drawCut', feet: 'dash', dashW: true },
};

export const CHARGE = {
  hold: 0.3, // s the HEAVY button must be held before a press becomes a charge (shorter = a heavy on release)
  full: 1.2, // s of hold for full damage
  maxHold: 2.6, // auto-release (also guards against a lost mouseup)
  move: 0.4, // movement multiplier while charging (low crouched stance)
};

/**
 * Reach against giant targets. The wyrm's chest hangs 2–4 m above the grass, above any sword
 * swung at a 1.75 m hero's chest height, so the blade hits through a vertical BAND: a hurt sphere
 * counts when it overlaps the blade's swept wall extended `up` m above its highest point and
 * `down` m below its lowest (horizontal distance + leftover vertical gap vs radius + `radius`); an attack may lower `up` (its own `up`).
 * `tipExt` lengthens the hit segment past the steel (the cyan edge wave). The step-in assist
 * stretches the lunge (by at most `max` m) toward a hurt surface within `range` m and `arc` rad of
 * the facing, so swings started a few metres out still land.
 */
export const REACH = {
  radius: 0.24,
  up: 2.6,
  down: 0.5,
  tipExt: 0.4,
  assist: { range: 4.8, arc: 0.8, max: 1.3 },
};

/**
 * The weight of a landed cut (player.js _applyHit). Per attack def:
 *   hitstop  s the frame freezes (× crit.stop on a crit; the cleave × 1 + 0.3 × charge)
 *   shake    camera trauma (× crit.shake)
 *   punch    m the camera jumps closer (+ crit.punch): a number, or [k0, k1] lerped by the charge
 *   kick     m the picture is thrown along the cut (× crit.kick; game.kick): the same forms
 *   contact  the look of the cut drawn at the contact (combat/cutFx.js CUT_LOOK.tier)
 * Against a duelist his own hit stun (TUNING.hitStun.light.stop) is the longer freeze of a light.
 */
export const HIT_FEEL = { crit: { stop: 1.4, shake: 1.3, punch: 0.6, kick: 1.35 } };
/** A HIT_FEEL value: a number, or [k0, k1] lerped by `k` (the charge 0..1); 0 when it is neither. */
export const feel = (v, k = 0) => (Array.isArray(v) ? lerp(v[0], v[1], clamp(Number.isFinite(k) ? k : 0, 0, 1)) : Number.isFinite(v) ? v : 0);

/** Charge fraction 0..1 and the charged attack's damage / poise / travel for a hold of `holdT`
 *  seconds (`def`: CLEAVE, or THRUST for the execution). */
export function chargeStats(holdT, def = CLEAVE) {
  const k = clamp((Number.isFinite(holdT) ? holdT - CHARGE.hold : 0) / (CHARGE.full - CHARGE.hold), 0, 1);
  return {
    k,
    damage: lerp(def.damage[0], def.damage[1], k),
    poise: lerp(def.poise[0], def.poise[1], k),
    travel: lerp(def.travel[0], def.travel[1], k),
  };
}

/**
 * Deepest hurt sphere touched by the vertical wall over segment a→b (band [min y − down, max y +
 * up]), widened by `rad`. Fills out.{sphere, x, y, z} (contact point: on the segment in plan, at
 * the sphere's underside / the band) and returns the penetration (> 0 = hit), else 0.
 */
export function bandHit(spheres, ax, ay, az, bx, by, bz, rad, up, down, out) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  const lo = Math.min(ay, by) - down, hi = Math.max(ay, by) + up;
  let best = null, bestPen = 0, bu = 0, by0 = 0;
  for (let i = 0; i < spheres.length; i++) {
    const h = spheres[i];
    if (!h || !(h.r > 0) || !Number.isFinite(h.x + h.y + h.z)) continue;
    const u = len2 > 1e-9 ? clamp(((h.x - ax) * abx + (h.z - az) * abz) / len2, 0, 1) : 0;
    const cx = ax + abx * u - h.x, cz = az + abz * u - h.z;
    const dh2 = cx * cx + cz * cz;
    const dy = h.y < lo ? lo - h.y : h.y > hi ? h.y - hi : 0;
    const pen = h.r + rad - Math.sqrt(dh2 + dy * dy);
    if (pen > bestPen) {
      bestPen = pen;
      best = h;
      bu = u;
      // contact height: the sphere's surface above / below this plan point, kept inside the band
      const sy = Math.sqrt(Math.max(0, h.r * h.r - dh2));
      const segY = ay + (by - ay) * u;
      by0 = clamp(segY < h.y ? h.y - sy : h.y + sy, lo, hi);
    }
  }
  if (!best) return 0;
  out.sphere = best;
  out.x = ax + abx * bu;
  out.y = by0;
  out.z = az + abz * bu;
  return bestPen;
}

/**
 * Tracks the blade segment (hilt → tip + REACH.tipExt) in world space frame to frame and tests the
 * swept volume against hurt spheres with 3 sub-steps through the vertical reach band.
 */
export class SwordSweep {
  /** `unlean(v)` (optional) maps a visual world point onto the upright gameplay body before hit
   *  tests; a, b, pa, pb and point() stay visual (trails and sparks follow the drawn blade). */
  constructor(sword, unlean = null) {
    this.sword = sword;
    this.unlean = unlean;
    this.a = new THREE.Vector3(); // hilt, this frame
    this.b = new THREE.Vector3(); // tip, this frame
    this.pa = new THREE.Vector3(); // last frame
    this.pb = new THREE.Vector3();
    this.valid = false;
    this._sa = new THREE.Vector3();
    this._sb = new THREE.Vector3();
  }

  /** Read the blade from the sword's (freshly updated) matrixWorld. */
  sample() {
    const m = this.sword.matrixWorld;
    this.a.set(0, 0, DIM.bladeBase).applyMatrix4(m);
    this.b.set(0, 0, DIM.bladeTip + REACH.tipExt).applyMatrix4(m);
    if (!Number.isFinite(this.a.x + this.a.y + this.a.z + this.b.x + this.b.y + this.b.z)) {
      this.valid = false;
      return false;
    }
    if (!this.valid) {
      this.pa.copy(this.a);
      this.pb.copy(this.b);
      this.valid = true;
    }
    return true;
  }

  commit() {
    if (!this.valid) return;
    this.pa.copy(this.a);
    this.pb.copy(this.b);
  }

  /** Point `f` (0 hilt … 1 visible tip) along the current blade. */
  point(f, out) {
    const k = (DIM.bladeTip - DIM.bladeBase) / (DIM.bladeTip + REACH.tipExt - DIM.bladeBase);
    return out.lerpVectors(this.a, this.b, f * k);
  }

  /**
   * Sweep last frame's blade to this frame's in 3 sub-steps. At the earliest sub-step that touches
   * anything, picks the deepest sphere. Fills out.{sphere, x, y, z} and returns true on a hit.
   */
  test(spheres, out, up = REACH.up) {
    if (!this.valid || !spheres || !spheres.length) return false;
    const sa = this._sa, sb = this._sb;
    for (let s = 1; s <= 3; s++) {
      const t = s / 3;
      sa.lerpVectors(this.pa, this.a, t);
      sb.lerpVectors(this.pb, this.b, t);
      if (this.unlean) {
        this.unlean(sa);
        this.unlean(sb);
      }
      if (bandHit(spheres, sa.x, sa.y, sa.z, sb.x, sb.y, sb.z, REACH.radius, up, REACH.down, out) > 0) return true;
    }
    return false;
  }
}
