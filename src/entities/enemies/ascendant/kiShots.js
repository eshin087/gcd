// Tian Lei's ki, the things he throws and calls: blasts, the disc, bolts, called strikes, the volley from the air, the weather. THE SHOTS AGENT'S FILE: a stub with the shape ki.js hands on to.
//
// ki.js (KiMoves) routes here every engine hook of a beat or a move whose `ki` kind does NOT start with 'beam', and every unmarked `release` / `cast` beat
// (the routing contract: the comment at the top of ascendant.js, and ki.js). Anything this class throws,
// lights or calls down must be known to the cue ledger (d.brain.expect / fairDelay) and draw from its own
// random stream, never Math.random or fx.rnd() (ashDisciple/terrain.js shows how). Numbers: tuningShots.js (d.T.shots).

export class ShotMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
  }

  /** Every reset of his (the duelist's reset, a death, the Lab): nothing of his left in the air. */
  reset() {}

  /** Something of his is still in the air or lit (the tests wait for it; the director may read it). */
  get busy() {
    return false;
  }

  /** A move of this kind starts (brain.startAct → d.onActStart): false = it cannot start now. */
  begin(act, opts) {
    void act;
    void opts;
    return true;
  }

  /** His AI weighs a move of this kind (brain._choose → d.weigh): the weight it gets now (0 = not now). */
  weigh(def, w, dist) {
    void def;
    void dist;
    return w;
  }

  /** A `cast` beat's impact (d.onCast). */
  onCast(b, s, a) {}

  /** A `release` beat's impact (d.onRelease). */
  onRelease(b, s, a) {}

  /** A routed beat's impact, its first frame (d.onImpact; before the zone is tested). */
  onImpact(b, s, a) {}

  /** Every frame of a routed beat (d.beatMotion; u 0..1 the windup, 1..2 the active frames). */
  motion(b, u, s, dt) {}

  /** A `sustain` beat, every `sustain.tick` s while it is lit (d.onSustain; k 0..1 through it). */
  onSustain(b, s, a, k) {}

  /** A routed beat's blow met the hero (d.hitPlayer; `r` the player's RESULT). */
  onHit(o, r) {}

  /** The blade lock ended (d.onLockEnd) while a move of this kind started it: true = handled here. */
  lockEnd(won) {
    void won;
    return false;
  }

  /** Every frame, after the brain (d.brainFrame). */
  frame(dt) {}
}
