// The clip registry of the remade hero: every clip-set file, IN THE REFERENCE'S ORDER (the MOVE film's
// sets first, then the SWORD film's; the order of play in the review film), then the engine's synthetic
// test clips. This is the ONE place that names the set files. A set is a lazy import, so a set that
// fails to load (or is not written yet) costs only its own clips.
//
// A set not written yet stays a commented line: the release bundle (esbuild) resolves every import
// here, so a line for a missing file would break `npm run build`. Its author un-comments it in the
// same commit that adds the file.
import { createLibrary } from '../engine.js';

export const SETS = [
  // ---- MOVE film (unarmed movement)
  // ['moveBasic', () => import('./moveBasic.js')], // MOCAP: un-comment with the file (idle, turnaround, walk, run, sprint, ...)
  // ---- SWORD film (one-handed, two-handed, paired)
  // ['swordBasic', () => import('./swordBasic.js')], // MOCAP: un-comment with the file (idle, equip, the light combo, ...)
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
