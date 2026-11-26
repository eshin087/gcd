import { WjTerrain } from '../terrain.js';

// Bai Wuji's terrain moves as move data (the TERRAIN AGENT's file; moves.js is the router: its header has the
// format; moves/melee.js the exports). The crossing and the void as his weapons: wreckage lifted and thrown,
// a tower's top brought down on the hero's place, an orbit of pieces cast one at a time, the road burst up
// in a line, the void's floating pieces dropped and cast. What each does once started, and every piece's
// numbers: the handler ../terrain.js (WjTerrain) and ../tuningTerrain.js (TUNING.terrain).
//
// THE BEAT FIELDS this file's handler owns (FIELDS; untouched.js routes every beat carrying one to it):
//   wjLift:  'take' | 'throw'            Curb Pull: a car / a road slab lifted into a blue knot; thrown (blue)
//   wjDown:  'take' | 'drop'             Bring It Down: a tower's top torn off and carried over the hero;
//                                        dropped on his place (red: the place is fixed and marked)
//   wjOrbit: 'lift' | 'cast' | 'burst'   The Orbit: loose pieces turning round him; one cast per beat
//                                        (blue), the last bursts on the road (red)
//   wjRoad:  'stomp'                     The Road Itself: a line of slabs bursts up toward him (red)
//   wjFloat: 'take' | 'drop' | 'draw' | 'cast'   in the void: a floating piece dropped on him (red) /
//                                        two drawn to his side and cast in turn (blue)
// Every real beat is a `cast` with `selfCue`: what it throws or drops carries its own cue (the flash ON
// the piece or on the place it lands, flashLead before it reaches the hero); the brain sends none for the
// beat. A move whose piece is gone is refused (WjTerrain.onActStart → false) and weighed 0 by his AI.
export const FIELDS = Object.freeze(['wjLift', 'wjDown', 'wjOrbit', 'wjRoad', 'wjFloat']);
export const create = (d) => new WjTerrain(d);

export function moves(X) {
  const { TELL, FRAGS, TUNING } = X;
  const { B, R } = TELL;
  const T = TUNING.terrain;
  const S = FRAGS.STAND;
  /** A whole pose: his stance, a fragment of this file's over it (posesTerrain.js). */
  const P = (...fr) => Object.assign({}, S, ...fr);
  const GAZE = P(FRAGS.trGaze), NOD = P(FRAGS.trNod), RAISE = P(FRAGS.trRaise), PULL = P(FRAGS.trPullDown);
  const CONDUCT = P(FRAGS.trConduct), FLICK = P(FRAGS.trConduct, FRAGS.trFlick), UP = P(FRAGS.trHeelUp), DOWN = P(FRAGS.trHeelDown);
  /** Keys over a beat (u 0..2, the impact at 1): from `a` at the cock to `b` at the impact, back to `c`. */
  const to = (a, b, c = b, cock = 0.8) => [[cock * 0.5, a], [cock, a], [1.0, { ...b, e: 'o' }], [2.0, c]];
  /** A beat that only lifts or carries (no cue, no blow: a feint to the engine). */
  const lift = (windup, field, keys) => ({ feint: true, windup, fixed: true, active: 0.05, close: 0, track: 1, ...field, keys });
  /** A cast beat (fixed: what it sends carries its cue), he stays where he is and faces the hero. */
  const cast = (tell, windup, damage, knockback, field, keys, o = {}) => ({
    tell, windup, fixed: true, active: 0.1, damage, knockback, cast: { kind: 'wjTerrain', selfCue: true }, part: 'fistR', close: 0, track: 0.9, cock: 0.8, ...field, keys, ...o,
  });
  return {
    // ================================================================ phase 1 on: CURB PULL
    /** Curb Pull: without a hand out of his pockets he looks at a car or a slab of the road; it lifts and
     *  hangs a moment turning in a blue knot, and comes at the hero (blue: a parry cuts it in two and its
     *  halves burst behind him; rolled, it bursts where it lands). */
    curbPull: {
      label: 'Curb Pull', phase: 1, weight: [0.5, 0.8, 0], cooldown: 10, band: [3.5, 20], recovery: 0.7, cat: 'terrain',
      beats: [
        lift(T.curb.liftT + 0.45, { wjLift: 'take' }, to(S, GAZE, GAZE, 0.5)),
        cast(B, 0.62, 22, 6, { wjLift: 'throw' }, to(GAZE, NOD, S)),
      ],
    },
    // ================================================================ phase 2 on: BRING IT DOWN
    /** Bring It Down: two fingers raised at the nearest tower; its top tears off its base, comes over the
     *  crossing and falls on the hero's place (red: the place follows him, then is fixed and marked; a
     *  crater). No top left: refused. */
    bringDown: {
      label: 'Bring It Down', phase: 2, weight: [0, 0.9, 0], cooldown: 18, band: [0, 40], recovery: 0.9, cat: 'terrain',
      beats: [
        lift(T.down.carryT + 0.2, { wjDown: 'take' }, to(S, RAISE, RAISE, 0.5)),
        cast(R, 1.4, 36, 9, { wjDown: 'drop' }, [[0.3, RAISE], [0.55, RAISE], [0.7, { ...PULL, e: 'o' }], [2.0, PULL]], { knockdown: true }),
      ],
    },
    // ================================================================ phase 2 on: THE ORBIT
    /** The Orbit: three loose pieces rise and turn round him, a wall 4 - 5 m out; then cast one at a
     *  time: blue, blue, and the last bursts on the road (red, a knockdown). */
    theOrbit: {
      label: 'The Orbit', phase: 2, weight: [0, 1.0, 0.9], cooldown: 16, band: [2.5, 14], recovery: 0.75, cat: 'terrain',
      beats: [
        lift(T.orbit.liftT + 0.5, { wjOrbit: 'lift' }, to(S, CONDUCT, CONDUCT, 0.5)),
        cast(B, 0.7, 18, 5, { wjOrbit: 'cast' }, to(CONDUCT, FLICK, CONDUCT)),
        cast(B, 0.62, 18, 5, { wjOrbit: 'cast' }, to(CONDUCT, FLICK, CONDUCT)),
        cast(R, 0.8, 28, 8, { wjOrbit: 'burst' }, to(CONDUCT, FLICK, S), { knockdown: true }),
      ],
    },
    // ================================================================ phase 2 on: THE ROAD ITSELF
    /** The Road Itself: his heel through the road; the slabs burst up in a line to the hero and past
     *  him, one after another (red: step off the strip, or roll through it). One blow for the line. */
    roadItself: {
      label: 'The Road Itself', phase: 2, weight: [0, 1.0, 0.8], cooldown: 12, band: [3.5, 14], recovery: 0.6, cat: 'terrain',
      beats: [cast(R, 0.85, 24, 6, { wjRoad: 'stomp' }, to(UP, DOWN, S), { knockdown: true })],
    },
    // ================================================================ phase 3: IN THE VOID
    /** Overhead: a floating piece of the crossing drifts over the hero and is dropped (red). */
    overhead: {
      label: 'Overhead', phase: 3, weight: [0, 0, 1.1], cooldown: 8, band: [0, 40], recovery: 0.6, cat: 'terrain',
      beats: [
        lift(T.float.carryT + 0.1, { wjFloat: 'take' }, to(S, RAISE, RAISE, 0.5)),
        cast(R, 1.1, 30, 8, { wjFloat: 'drop' }, [[0.3, RAISE], [0.5, RAISE], [0.62, { ...PULL, e: 'o' }], [2.0, S]], { knockdown: true }),
      ],
    },
    /** Cast Off: two floating pieces drawn to his sides, cast at the hero in turn (blue, blue). */
    castOff: {
      label: 'Cast Off', phase: 3, weight: [0, 0, 1.0], cooldown: 8, band: [3, 24], recovery: 0.6, cat: 'terrain',
      beats: [
        lift(T.float.liftT + 0.4, { wjFloat: 'draw' }, to(S, CONDUCT, CONDUCT, 0.5)),
        cast(B, 0.6, 20, 5, { wjFloat: 'cast' }, to(CONDUCT, FLICK, CONDUCT)),
        cast(B, 0.56, 20, 5, { wjFloat: 'cast' }, to(CONDUCT, FLICK, S)),
      ],
    },
  };
}
// (no links: a terrain move is chosen by his AI when the arena has the piece for it, never chained into)
export const LINKS = {};
