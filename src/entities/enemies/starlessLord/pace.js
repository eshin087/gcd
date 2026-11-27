import { lookOf } from '../duelist/lookSwitch.js';
import { perPhase } from '../duelist/realise.js';

// THE READABLE PACE (ADR-251, `?lordPace=a`; '0', the default until the owner picks, is the pace he shipped
// with: "faster than Shen Hui and ramping", the owner's pick). COMBAT.md rule 10 asks of every melee attack a
// first windup >= 0.7 s, string blows >= 0.45 s apart and the cue ~0.35 s before the impact; the Lord was
// tuned faster (TUNING.minFirstWindup 0.4, minHitGap 0.34, flashLead 0.26, windupScale down to 0.83 in form 4:
// a string's blows ~0.34 s apart in form 1, ~0.3 s in form 4). Under `a` (Tian Lei's ADR-248 recipe):
//   - a move's first real blow winds up at least `pace.first` s (x the form's windupScale), every later real
//     blow lands at least `pace.gap` s after the one before (feints between them count), and the cue (the
//     flash) comes `pace.flashLead` s before the impact;
//   - the time added is a HOLD of the blow's cocked pose (the realiser's keysOf `hold`, the held tells' hook,
//     duelist/realise.js): the pose that says which blow stands still longer, the strike from the cock as
//     fast as before; a delay that is always the same (a fair one);
//   - his quick blows (ADR-226: `motionOnly`, thrown from the guard), his counters out of a guard and his
//     flurry (the answers to the hero's own play, timed with the flash chain, ADR-246) and the ignitions keep
//     their own timings;
//   - his spells keep theirs too (rule 10 is the melee's floor): a beat that casts, throws, releases or reaches
//     out with the Void (a bolt, the pull, the grip, the push, the crescents, the stones, the Dark Star) gets no
//     hold and keeps its own cue (each cues itself), and a hazard or a move of the crater's pieces is left alone.
//     A spell still counts in a string's run: the blade blow after it lands at least `gap` s after it.

/** Is the readable pace on (read live). */
export const paceOn = () => lookOf('lordPace', '0') === 'a';

/** A real hit (a feint and a beat without damage are not). */
const real = (b) => !b.feint && (b.damage ?? 0) > 0;
/** The shortest time a beat takes from its start to its impact (its windup scaled, its shortest hold). */
const lead = (b, ws) => b.windup * (b.fixed ? 1 : ws) + (Array.isArray(b.hold) ? b.hold[0] : 0);
/** ... and from its impact to its end. */
const tail = (b) => (b.active ?? 0) + Math.max(0, Number(b.sustain?.dur) || 0);
const alts = (raw) => (Array.isArray(raw.pick) ? raw.pick : [raw]);
/** A move the pace leaves alone. */
const exempt = (def) => !!(def.transition || def.motionOnly || def.counter || def.streak || def.cat === 'hazard' || def.terrain);
/** A spell beat (its own cue, no hold). */
const spell = (b) => !!(b.cast || b.release || b.bolt || b.pull || b.grip);

/**
 * The extra hold of every beat of every move, per form (index 0 = form 1): a Map beat → s. A beat that needs
 * none is not in it. `MOVES` the move table, `T` his TUNING (forms, windupScale, pace).
 */
export function buildPace(MOVES, T) {
  const P = T.pace;
  return Array.from({ length: T.forms }, (_, i) => i + 1).map((form) => {
    const ws = perPhase(T.windupScale, form), first = P.first * ws, gap = P.gap;
    const out = new Map();
    for (const def of Object.values(MOVES)) {
      if (exempt(def)) continue;
      // since the last real hit's impact: the shortest time already run (null: no real hit yet)
      let since = null;
      for (const raw of def.beats ?? []) {
        let after = Infinity, lastTail = Infinity, anyReal = false;
        for (const b of alts(raw)) {
          const w = lead(b, ws);
          if (real(b)) {
            anyReal = true;
            const want = since === null ? first : gap;
            const have = since === null ? w : since + w;
            const x = want - have;
            if (x > 1e-4 && !spell(b)) out.set(b, x);
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

/** The cue under the pace: every beat of a realised move `A` flashes `pace.flashLead` s before its impact
 *  (never before its tell); an exempt move keeps its own cue. */
export function paceCue(A, T) {
  if (!A || exempt(A.def)) return A;
  for (const b of A.beats) if (!spell(b.def ?? {}) && Number.isFinite(b.tellAt) && Number.isFinite(b.impact)) b.flash = Math.max(b.tellAt, b.impact - T.pace.flashLead);
  return A;
}
