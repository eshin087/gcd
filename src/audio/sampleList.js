import { SAMPLE_FILES } from './sampleFiles.js';

// The recorded / designed one-shots: the attack sounds and the blue / red cues (ADR-165), and the combat
// core (round 2): the parries, the hurt, the hero's cuts landing, the slam, the flurry, the plunge, the
// clash, the boss's guard. Recorded files are CC0 (OpenGameArt), designed ones were made for gcd.
// Content is data. The files and their peak times are generated (sampleFiles.js, by
// scripts/audio/build-sfx.py from the owner's picks, scripts/audio/sfx-picks.json); this file says how
// each slot plays. assets/audio/CREDITS.md names every source. A slot with no file (cue-blue, time-blue
// today), not loaded yet, failed, or with no fetch (file://, the headless tests) plays its synth recipe
// (sfx.js) instead; `?sfx=old` plays only the synth, as before (samples.js).
//
// Per slot:
//   bus      'cue' (the blue / red cues, the flurry: past the Ghostep low-pass, as their synth) or 'sfx'
//            (the world: muffled by Ghostep's slow-mo like the rest of it)
//   prio     voice-steal priority (sfx.js)
//   gain     linear, on top of the file's own level (the build loudness-matches a slot's files; set so
//            the slot plays at its synth's in-game level, measured through the real engine)
//   rate     playback rate (below 1: lower and longer)
//   jitter   ± fraction of rate drawn per play (the bank's own stream: never Math.random)
//   rev      reverb send
//   falloff  distance attenuation multiplier (audio.js _spatial; < 1 carries further)
//   gap      s: the same slot never starts twice within this
//   align    true: the clip's loudest moment (its peak_ms) lands on the blow's impact (payload impactIn),
//            `lead` s before it
//   lead     s (with align)
//   skip     (with align) true: when the peak would land late (impactIn shorter than the clip's peak), the
//            clip starts that far INTO the file (`fadeIn` s fade) instead of late
//   cut      (with align) s after the peak at which the clip is cut off (`fadeOut` s fade); absent: whole

export const SFX_ROOT = 'assets/audio/sfx/';

export const SLOTS = [
  'cue-blue', 'cue-red', 'time-blue', 'time-red',
  'sword-light', 'sword-heavy', 'sword-thrust', 'sword-draw',
  'fist-light', 'fist-heavy', 'beast-claw', 'beast-tail',
  'parry', 'parry-blue', 'hurt', 'hit-scale', 'cut-light', 'cut-heavy', 'slam',
  'flurry-cut', 'flurry-coil', 'plunge-dive', 'plunge-hit', 'clash', 'boss-guard',
];

const CUE = { bus: 'cue', prio: 6, gain: 1, rate: 1, jitter: 0.02, rev: 0.25, falloff: 0.25, gap: 0.12, align: false, lead: 0 };
const BLOW = { bus: 'sfx', prio: 3, gain: 0.7, rate: 1, jitter: 0.04, rev: 0.1, falloff: 0.8, gap: 0.06, align: true, lead: 0.01 };
const CORE = { bus: 'sfx', prio: 3, gain: 1, rate: 1, jitter: 0.02, rev: 0.12, falloff: 1, gap: 0.05, align: false, lead: 0 };

export const SLOT = {
  // the warning as the windup starts (combat:tell) and the timing sound just before the impact (combat:flash)
  'cue-blue': { ...CUE },
  'cue-red': { ...CUE, rev: 0.3 },
  'time-blue': { ...CUE, gap: 0.08, rev: 0.2, falloff: 0.2 },
  'time-red': { ...CUE, gap: 0.08, rev: 0.2, falloff: 0.2 },
  // a boss's blow through the air (dragon:attack); heavy: louder and a little lower
  'sword-light': { ...BLOW },
  'sword-heavy': { ...BLOW, gain: 0.85, rate: 0.95 },
  'sword-thrust': { ...BLOW, gain: 0.72 },
  'sword-draw': { ...BLOW, gain: 0.9, prio: 4 },
  'fist-light': { ...BLOW, gain: 0.65 },
  'fist-heavy': { ...BLOW, gain: 0.82, rate: 0.95 },
  // the wyrm's claws and its tail / body sweeps (played as its attack begins: no impact to line up)
  'beast-claw': { ...BLOW, gain: 0.8, align: false, gap: 0.2, falloff: 0.8 },
  'beast-tail': { ...BLOW, gain: 0.85, align: false, gap: 0.2, falloff: 0.8 },
  // ---- the combat core (round 2): prio / rev / gap as the synth recipe each one replaces (sfx.js)
  // your parry (player:parry of a blade): an ordinary blow; a blue blow or a perfect parry (+ its perfect
  // layer, 'parryPerfect'); the deflect chain on top of either (PARRY_CHAIN)
  parry: { ...CORE, prio: 6, rev: 0.4, gap: 0.06, gain: 1.4 },
  'parry-blue': { ...CORE, prio: 6, rev: 0.4, gap: 0.06, gain: 2.45 },
  // a blow lands on you (louder for a bigger blow: HURT)
  hurt: { ...CORE, prio: 4, rev: 0.1, gap: 0.08, gain: 1.86 },
  // your cut lands on the wyrm (a wing keeps the synth's membrane thwap): heavy × HIT_HEAVY
  'hit-scale': { ...CORE, prio: 3, rev: 0.12, gap: 0.04, gain: 1.38, jitter: 0.04 },
  // the blade's own layer on a landed cut (CUT_SLOT): pitched a semitone up the chain as the synth (no jitter:
  // the chain's own ±2 % alternation is the variation)
  'cut-light': { ...CORE, prio: 3, rev: 0.1, gap: 0.03, gain: 0.32, jitter: 0 },
  'cut-heavy': { ...CORE, prio: 3, rev: 0.1, gap: 0.03, gain: 0.39, jitter: 0 },
  // the slam into the ground
  slam: { ...CORE, prio: 4, rev: 0.25, gap: 0.2, gain: 2.74 },
  // the flurry (on the cue bus: crisp while the world is held and muffled): a flash cut a step higher each
  // (FLURRY); the last blow's coil, fitted to its length: its top (peak) on the strike, cut off there
  'flurry-cut': { ...CORE, bus: 'cue', prio: 6, rev: 0.3, gap: 0.03, gain: 0.99, jitter: 0.005 },
  'flurry-coil': { ...CORE, bus: 'cue', prio: 6, rev: 0.4, gap: 0.2, gain: 0.772, jitter: 0, align: true, skip: true, lead: 0, fadeIn: 0.03, cut: 0.004, fadeOut: 0.012 },
  // the plunge: the dive's loudest moment on the blade's landing (DEFENSE.plunge.dive s later), then the hit
  'plunge-dive': { ...CORE, prio: 6, rev: 0.35, gap: 0.3, gain: 0.419, align: true, skip: true, lead: 0, fadeIn: 0.02 },
  'plunge-hit': { ...CORE, prio: 6, rev: 0.55, gap: 0.3, gain: 2.15 },
  // two cuts meet (combat:clash); the boss holds your strike (dragon:guard, not a deflect)
  clash: { ...CORE, prio: 7, rev: 0.45, gap: 0.1, gain: 1.67 },
  'boss-guard': { ...CORE, prio: 5, rev: 0.14, gap: 0.05, gain: 1.41 },
};

/** A heavy blow on a slot that is not a heavy one already (a heavy thrust, a draw): × gain, × rate. */
export const HEAVY = { gain: 1.2, rate: 0.95 };

/** The hero's swing (player:attack) per kind: a slot, or null = the synth `swing` (the owner's pick, round
 *  2: the heavy cut and the execution's thrust went back to the synth; the light cut keeps its takes). */
export const HERO_SLOT = { light: 'sword-light', heavy: null, thrust: null };

/** hurt: × (clamp(damage / div, min, max) / min) ^ exp on the gain (the synth's k = clamp(damage / 40, 0.6,
 *  1.4) on its body; ^0.5: the synth's grunt does not scale, so its loudest 50 ms rose 1.5 dB from 20.7 to
 *  34.5 damage, and so does this). */
export const HURT = { div: 40, min: 0.6, max: 1.4, exp: 1 };

/** hit-scale on a heavy blow (the synth: × 1.3, a deeper, longer thud). */
export const HIT_HEAVY = { gain: 1.3, rate: 0.92 };

/** The 'cut' layer's slot per weight (player:hitDragon weight); its level per weight follows the synth's
 *  (sfx.js CUT_SND a, relative to the slot's own `ref` weight). */
export const CUT_SLOT = { light: 'cut-light', sweep: 'cut-light', point: 'cut-light', slam: 'cut-heavy', cleave: 'cut-heavy', execute: 'cut-heavy' };
export const CUT_REF = { 'cut-light': 'light', 'cut-heavy': 'slam' };

/** flurry-cut: a step higher each cut as the synth (a whole tone, or the streak's scale), the rate capped
 *  at `maxRate` (an octave); a cut of the storm's merged run (fast) at `fastGain`. */
export const FLURRY = { maxRate: 2, fastGain: 0.55 };

/** The plunge / the execution: × gain (the synth's k); the boss's guard on a heavy strike: × gain, × rate. */
export const EXEC = { dive: 1.15, hit: 1.3 };
export const GUARD_HEAVY = { gain: 1.3, rate: 0.88 };
export const CLASH_HEAVY = 1.25;

/** The bosses' blows together: two never start within `gap` s (a flurry does not stack into noise). */
export const BLOWS = { gap: 0.09 };

/** The hero's own sword (player:attack): the same slots, pitched above the bosses so the two blades can
 *  be told apart; each cut of the chain `combo` higher (combo 1..5: up to 4 steps, as the synth's rising swing). */
export const HERO = { gain: 0.8, rate: 1.08, combo: 0.025, rev: 0.08, prio: 2, gap: 0.04 };

/** The slot of a duelist's blow (dragon:attack's weapon / weight / shape). */
export function blowSlot(weapon, weight, shape) {
  if (weapon === 'fist') return shape === 'kick' || weight === 'heavy' ? 'fist-heavy' : 'fist-light';
  if (shape === 'draw') return 'sword-draw';
  if (shape === 'thrust') return 'sword-thrust';
  if (shape === 'kick') return 'fist-heavy'; // (a sword fighter's kick: a leg through the air)
  return weight === 'heavy' ? 'sword-heavy' : 'sword-light';
}

/** The wyrm's attacks by name (dragon:attack): a claw or a tail / body sweep. A name in neither (a bite,
 *  a maw, a stomp, a spell) keeps today's synth swipe; names matched by audio.js RX_OWN_SOUND keep their
 *  own sounds. */
export const BEAST = {
  claw: ['swipe', 'clawCombo', 'rendingFlurry', 'frenzy', 'stormFlurry', 'cinderFlurry', 'cinderRake'],
  tail: ['tailLash', 'tail', 'pivotLash', 'tailBat', 'wingBuffet', 'wingRend', 'rearGuard'],
};

/** Every slot's files: [{ file, peak_ms }] (the generated list; a slot not listed has none). */
export function slotFiles(slot) {
  const l = SAMPLE_FILES[slot];
  return Array.isArray(l) ? l : [];
}
