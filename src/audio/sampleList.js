import { SAMPLE_FILES } from './sampleFiles.js';

// The recorded one-shots (CC0, OpenGameArt): the attack sounds and the blue / red cues only. Content is
// data. The files and their peak times are generated (sampleFiles.js, by scripts/audio/build-sfx.py
// from the owner's picks); this file says how each slot plays. assets/audio/CREDITS.md names every
// source. A slot with no file, not loaded yet, failed, or with no fetch (file://, the headless tests)
// plays its synth recipe (sfx.js) instead; `?sfx=old` plays only the synth, as before (samples.js).
//
// Per slot:
//   bus      'cue' (the blue / red cues: past the Ghostep low-pass, as the synth cues) or 'sfx' (the
//            world: muffled by Ghostep's slow-mo like the rest of it)
//   prio     voice-steal priority (sfx.js)
//   gain     linear, on top of the file's own level (the build loudness-matches a slot's files)
//   rate     playback rate (below 1: lower and longer)
//   jitter   ± fraction of rate drawn per play (the bank's own stream: never Math.random)
//   rev      reverb send
//   falloff  distance attenuation multiplier (audio.js _spatial; < 1 carries further)
//   gap      s: the same slot never starts twice within this
//   align    true: the clip's loudest moment (its peak_ms) lands on the blow's impact (payload impactIn),
//            `lead` s before it
//   lead     s (with align)

export const SFX_ROOT = 'assets/audio/sfx/';

export const SLOTS = [
  'cue-blue', 'cue-red', 'time-blue', 'time-red',
  'sword-light', 'sword-heavy', 'sword-thrust', 'sword-draw',
  'fist-light', 'fist-heavy', 'beast-claw', 'beast-tail',
];

const CUE = { bus: 'cue', prio: 6, gain: 1, rate: 1, jitter: 0.02, rev: 0.25, falloff: 0.25, gap: 0.12, align: false, lead: 0 };
const BLOW = { bus: 'sfx', prio: 3, gain: 0.7, rate: 1, jitter: 0.04, rev: 0.1, falloff: 0.8, gap: 0.06, align: true, lead: 0.01 };

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
};

/** A heavy blow on a slot that is not a heavy one already (a heavy thrust, a draw): × gain, × rate. */
export const HEAVY = { gain: 1.2, rate: 0.95 };

/** The bosses' blows together: two never start within `gap` s (a flurry does not stack into noise). */
export const BLOWS = { gap: 0.09 };

/** The hero's own sword (player:attack): the same slots, pitched above the bosses so the two blades can
 *  be told apart; each step of the combo `combo` higher (of 3, as the synth's rising swing). */
export const HERO = { gain: 0.8, rate: 1.08, combo: 0.03, rev: 0.08, prio: 2, gap: 0.04 };

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
