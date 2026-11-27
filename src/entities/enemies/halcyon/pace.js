import { lookOf } from '../duelist/lookSwitch.js';
import { perPhase } from '../duelist/realise.js';

// THE READABLE PACE (ADR-254, `?halPace=a`; '0', the default until the owner picks, is the pace he shipped
// with). COMBAT.md rule 10 asks of every melee attack a first windup >= 0.7 s, string blows >= 0.45 s apart
// and the cue ~0.35 s before the impact; Halcyon was tuned at Tian Lei's Phantom Blade Zero pace
// (TUNING.minFirstWindup 0.45, minHitGap 0.34, flashLead 0.26: Meet and Greet's jab at 0.53 s, its blows
// 0.36 - 0.42 s apart). Under `a` (Tian Lei's ADR-248 rule, his own copy: ascendant/ is that session's):
//   - a move's first real blow winds up at least `pace.first` s (x the phase's windupScale), every later
//     real blow lands at least `pace.gap` s after the one before (feints between them count), and the cue
//     comes `pace.flashLead` s before the impact;
//   - the time added is a HOLD of the blow's cocked pose (the realiser's keysOf `hold`, duelist/realise.js):
//     the pose that says which blow stands still longer, the strike from the cock as fast as before; a
//     delay that is always the same (a fair one);
//   - the snap blows (ADR-225: the owner's quick white blows from his guard) and the transitions keep
//     their timings; his eyes, a pass, a throw already wind up longer than the floor.

/** Is the readable pace on (read live). */
export const paceOn = () => lookOf('halPace', '0') === 'a';

const real = (b) => !b.feint && (b.damage ?? 0) > 0;
const lead = (b, ws) => b.windup * (b.fixed ? 1 : ws) + (Array.isArray(b.hold) ? b.hold[0] : 0);
const tail = (b) => (b.active ?? 0) + Math.max(0, Number(b.sustain?.dur) || 0);

/** The extra hold of every beat of every move, per phase (index 0 = phase 1): a Map beat → s. */
export function buildPace(MOVES, T) {
  const P = T.pace;
  return [1, 2, 3].map((ph) => {
    const ws = perPhase(T.windupScale, ph), first = P.first * ws, gap = P.gap;
    const out = new Map();
    for (const def of Object.values(MOVES)) {
      if (def.transition || def.snap) continue;
      let since = null;
      for (const b of def.beats) {
        const w = lead(b, ws);
        if (real(b)) {
          const want = since === null ? first : gap, have = since === null ? w : since + w;
          if (want - have > 1e-4) out.set(b, want - have);
          since = tail(b);
        } else if (since !== null) since += w + tail(b);
      }
    }
    return out;
  });
}

/** The cue under the pace: every beat of a realised move `A` flashes `pace.flashLead` s before its impact
 *  (never before its tell); a snap blow, a transition keep their own cue. */
export function paceCue(A, T) {
  if (!A || A.def.snap || A.def.transition) return A;
  for (const b of A.beats) if (!b.feint) b.flash = Math.max(b.tellAt ?? b.start, b.impact - T.pace.flashLead);
  return A;
}
