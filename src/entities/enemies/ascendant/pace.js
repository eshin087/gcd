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
//   - the snap blows (ADR-225: the owner's quick white jabs from his guard), his counters out of a guard and
//     his flurries (the answers to the hero's own play, timed with the flash chain, ADR-246), the
//     transformations, hazards and floor pieces keep their own timings;
//   - his ki keeps its own too (rule 10 is the melee's floor): a beat that casts, throws, releases, fires a
//     beam or raises the floor (`ki`, `cast`, `release`, `beam`, `terrain`, `sustain`) gets no hold and keeps
//     its own cue (each cues itself); it still counts in a string's run: a blow after it lands at least `gap` s
//     after it. (The Starless Lord's ADR-251 refined this recipe; the same exemptions.)
//   - a blow he runs in for (a dash from before its cock: Tiger Descends' elbow, the dashing palms) keeps its
//     windup (the run is the tell; a hold inside it slowed the dash); its cue is paced.

/** Is the readable pace on (read live). */
export const paceOn = () => lookOf('ascPace', '0') === 'a';

/** A real hit (a feint and a beat without damage are not). */
const real = (b) => !b.feint && (b.damage ?? 0) > 0;
/** The shortest time a beat takes from its start to its impact (its windup scaled, its shortest hold). */
const lead = (b, ws) => b.windup * (b.fixed ? 1 : ws) + (Array.isArray(b.hold) ? b.hold[0] : 0);
/** ... and from its impact to its end. */
const tail = (b) => (b.active ?? 0) + Math.max(0, Number(b.sustain?.dur) || 0);
const alts = (raw) => (Array.isArray(raw.pick) ? raw.pick : [raw]);
/** A move the pace leaves alone. */
const exempt = (def) => !!(def.transition || def.snap || def.counter || def.streak || def.cat === 'hazard' || def.terrain);
/** A ki beat (its own cue, no hold). */
const spell = (b) => !!(b.ki || b.cast || b.release || b.beam || b.terrain || b.sustain);
/** A blow he runs in for (a dash that starts before its cock): its run is its windup, no hold (a hold inside
 *  the run slowed the dash, and a sprinting hero got away from Tiger Descends' elbow); its cue is paced. */
const runIn = (b) => !!(b.dash && (b.dash.from ?? 0) < (b.cock ?? 0.8));

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
      if (exempt(def)) continue;
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
            // (never a sliver: a hold of a few frames put two keys side by side, a hitch, not a held pose)
            if (x > 1e-4 && !spell(b) && !runIn(b)) out.set(b, Math.max(x, P.minHold ?? 0));
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

/** The cue under the pace: every melee beat of a realised move `A` flashes `pace.flashLead` s before its
 *  impact (never before its tell); an exempt move and a ki beat keep their own cue. */
export function paceCue(A, T) {
  if (!A || exempt(A.def)) return A;
  for (const b of A.beats) if (!spell(b.def ?? {}) && Number.isFinite(b.tellAt) && Number.isFinite(b.impact)) b.flash = Math.max(b.tellAt, b.impact - T.pace.flashLead);
  return A;
}

/** Does the pace apply to move `def` / beat `b` (tests: asc READABLE). */
export const PACED = Object.freeze({ exempt, spell, runIn });
