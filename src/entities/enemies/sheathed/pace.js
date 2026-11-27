import { lookOf } from '../duelist/lookSwitch.js';
import { perPhase } from '../duelist/realise.js';

// THE READABLE PACE (ADR-252, `?sheathPace=a`; '0', the default until the owner picks, is the pace he shipped
// with). COMBAT.md rule 10 asks of every melee attack a first windup >= 0.7 s, string blows >= 0.45 s apart and
// the cue ~0.35 s before the impact; Lu Wusheng's blunt blows were tuned faster (TUNING.minFirstWindup 0.42,
// minHitGap 0.32, flashLead 0.3: A Knock, Not a Cut at 0.46 s, Three Refusals' blows 0.34 s apart). Under `a`:
//   - a move's first real blow winds up at least `pace.first` s (x the phase's windupScale), every later real
//     blow lands at least `pace.gap` s after the one before, and the cue (the flash) comes `pace.flashLead` s
//     before the impact;
//   - the time added is a HOLD of the blow's cocked pose (with the held tells on, the larger of the two holds:
//     a blue or red blow's ADR-223 hold already counts toward the floor) (the realiser's keysOf `hold`, the held tells' hook,
//     duelist/realise.js): a still pose that says which blow, the strike from the cock as fast as before, a
//     delay that is always the same;
//   - the draws (their own settle, stillness and click, ADR-144), the quick blow (Before the Word, ADR-223),
//     the transitions and the hanging cuts keep their own timings and cues. (Tian Lei's `?ascPace`, ADR-248,
//     is the same rule; this is his file's method on this kit.)

/** Is the readable pace on (read live). */
export const paceOn = () => lookOf('sheathPace', '0') === 'a';

const real = (b) => !b.feint && (b.damage ?? 0) > 0;
const own = (b) => !!(b.draw || b.cast || b.hazard);
const lead = (b, ws) => b.windup * (b.fixed ? 1 : ws) + (Array.isArray(b.hold) ? b.hold[0] : 0);
const tail = (b) => (b.active ?? 0) + Math.max(0, Number(b.sustain?.dur) || 0);
const keeps = (def) => !!(def.transition || def.quick || def.manual);

/** The extra hold of every beat of every move, per phase (index 0 = phase 1): a Map beat → s. */
export function buildPace(MOVES, T) {
  const P = T.pace;
  return [1, 2, 3].map((ph) => {
    const ws = perPhase(T.windupScale, ph), first = P.first * ws, gap = P.gap;
    const out = new Map();
    for (const def of Object.values(MOVES)) {
      if (keeps(def)) continue;
      // (`pre`: the time from the move's start before its first real blow's own windup: a feint's stance
      // counts toward that blow's windup; `since`: from the last real blow's impact)
      let since = null, pre = 0;
      for (const b of def.beats) {
        const w = lead(b, ws);
        if (real(b)) {
          if (!own(b)) {
            const x = (since === null ? first : gap) - (since === null ? pre + w : since + w);
            if (x > 1e-4) out.set(b, x);
          }
          since = tail(b);
        } else if (since !== null) since += w + tail(b);
        else pre += w + tail(b);
      }
    }
    return out;
  });
}

/** The cue under the pace: a paced move's blows flash `pace.flashLead` s before their impact (never before
 *  their tell); the draws, the casts and the moves that keep their timings keep their own cue. */
export function paceCue(A, T) {
  if (!A || keeps(A.def ?? {})) return A;
  for (const b of A.beats) if (!b.feint && !own(b.def)) b.flash = Math.max(b.tellAt, b.impact - T.pace.flashLead);
  return A;
}
