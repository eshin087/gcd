import { lookOf } from '../duelist/lookSwitch.js';
import { perPhase } from '../duelist/realise.js';

// THE READABLE PACE (ADR-248, `?ascPace=a`; '0', the default until the owner picks, is the pace he
// shipped with). COMBAT.md rule 10 asks of every melee attack a first windup >= 0.7 s, string blows
// >= 0.45 s apart and the cue ~0.35 s before the impact; Tian Lei was tuned faster (TUNING.minFirstWindup
// 0.4, minHitGap 0.34, flashLead 0.26: a string's first blow at 0.45 - 0.5 s, its blows 0.37 - 0.46 s
// apart). Under `a`:
//   - a move's first real blow winds up at least `pace.first` s (x the form's windupScale: 0.7 / 0.65 /
//     0.6 s), every later real blow lands at least `pace.gap` s after the one before (feints between them
//     count), and the cue (the flash) comes `pace.flashLead` s before the impact;
//   - the time added is a HOLD of the blow's cocked pose (the realiser's keysOf `hold`, the held tells'
//     hook, duelist/realise.js): the pose that says which blow stands still longer, the strike from the
//     cock as fast as before; a delay that is always the same (a fair one);
//   - the snap blows (ADR-225: the owner's quick white jabs from his guard) and the transformations keep
//     their own timings.
// Shots, beams and floor pieces cue themselves (their own flashLead, read from TUNING): unchanged.

/** Is the readable pace on (read live). */
export const paceOn = () => lookOf('ascPace', '0') === 'a';

/** A real hit (a feint and a beat without damage are not). */
const real = (b) => !b.feint && (b.damage ?? 0) > 0;
/** The shortest time a beat takes from its start to its impact (its windup scaled, its shortest hold). */
const lead = (b, ws) => b.windup * (b.fixed ? 1 : ws) + (Array.isArray(b.hold) ? b.hold[0] : 0);
/** ... and from its impact to its end. */
const tail = (b) => (b.active ?? 0) + Math.max(0, Number(b.sustain?.dur) || 0);
const alts = (raw) => (Array.isArray(raw.pick) ? raw.pick : [raw]);

/**
 * The extra hold of every beat of every move, per form (index 0 = form 1): a Map beat → s. A beat that
 * needs none is not in it. `MOVES` the move table, `T` his TUNING (windupScale, pace).
 */
export function buildPace(MOVES, T) {
  const P = T.pace;
  return [1, 2, 3].map((form) => {
    const ws = perPhase(T.windupScale, form), first = P.first * ws, gap = P.gap;
    const out = new Map();
    for (const def of Object.values(MOVES)) {
      if (def.transition || def.snap) continue;
      // since the last real hit's impact: the shortest time already run (null: no real hit yet)
      let since = null;
      for (const raw of def.beats) {
        const list = alts(raw);
        let after = Infinity, lastTail = Infinity, anyReal = false;
        for (const b of list) {
          const w = lead(b, ws);
          if (real(b)) {
            anyReal = true;
            const want = since === null ? first : gap;
            const have = since === null ? w : since + w;
            const x = want - have;
            if (x > 1e-4) out.set(b, x);
            lastTail = Math.min(lastTail, tail(b));
          } else after = Math.min(after, w + tail(b));
        }
        // (a beat of only feints adds its shortest time to the run; a real one starts it again)
        if (anyReal) since = lastTail;
        else if (since !== null && Number.isFinite(after)) since += after;
      }
    }
    return out;
  });
}

/** The cue under the pace: every beat of a realised move `A` flashes `pace.flashLead` s before its
 *  impact (never before its tell); a snap blow, a transformation keep their own cue. */
export function paceCue(A, T) {
  if (A.def.snap || A.def.transition) return A;
  for (const b of A.beats) b.flash = Math.max(b.tellAt, b.impact - T.pace.flashLead);
  return A;
}
