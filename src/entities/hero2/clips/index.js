// The clip registry of the remade hero: every clip-set file, IN THE REFERENCE'S ORDER (the MOVE film's
// sets first, then the SWORD film's; the order of play in the review film), then the engine's synthetic
// test clips. This is the ONE place that names the set files. A set is a lazy import, so a set that
// fails to load (or is not written yet) costs only its own clips.
//
// Every set of the plan is listed; one not built yet is a stub file with no clips (its author's build
// replaces the file, never this list).
import { createLibrary } from '../engine.js';

export const SETS = [
  // ---- MOVE film (unarmed movement), then the SWORD film: the review film plays them in this order
  ['moveGround', () => import('./moveGround.js')], // MOVE 0:00-3:56
  ['moveTurns', () => import('./moveTurns.js')], // MOVE 3:56-6:40
  ['moveJumps', () => import('./moveJumps.js')], // MOVE 6:40-10:48
  ['moveEvade', () => import('./moveEvade.js')], // MOVE 10:48-14:28
  ['moveStrafe', () => import('./moveStrafe.js')], // MOVE 14:28-17:34
  ['moveStrafeB', () => import('./moveStrafeB.js')], // MOVE 17:34-24:11
  ['moveMisc', () => import('./moveMisc.js')], // MOVE 24:11-25:21 and 29:39-30:47
  ['moveHorse', () => import('./moveHorse.js')], // MOVE 25:21-29:39
  ['swordOne', () => import('./swordOne.js')], // SWORD 0:00-1:40
  ['swordOneH', () => import('./swordOneH.js')], // SWORD 1:40-3:52
  ['swordOneB', () => import('./swordOneB.js')], // SWORD 3:52-7:02
  ['swordHorse', () => import('./swordHorse.js')], // SWORD 7:02-8:40
  ['swordTwo', () => import('./swordTwo.js')], // SWORD 8:40-12:01
  ['swordTwoB', () => import('./swordTwoB.js')], // SWORD 12:01-15:22
  ['swordPair', () => import('./swordPair.js')], // SWORD 15:22-19:03
  // ---- the engine's synthetic test clips (names start with _; not from the footage)
  ['_test', () => import('./_test.js')],
];

/** Load every set (each one's failure is its own: noted in lib.problems) and decode them in order. */
export async function loadLibrary(sets = SETS) {
  const mods = [], failed = [];
  for (const [id, load] of sets) {
    try {
      mods.push(await load());
    } catch (e) {
      failed.push({ clip: '', text: `set ${id} failed to load: ${e?.message ?? e}` });
    }
  }
  const lib = createLibrary(mods);
  lib.problems.unshift(...failed);
  return lib;
}
