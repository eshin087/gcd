// Tian Lei's ki: what his ki moves do once they are started (blasts thrown, the beam lit, discs
// cast, strikes called). THE KI AGENT'S FILE: a stub with the shape the actor routes to.
//
// The routing contract is at the top of ascendant.js. In short: every engine hook of a beat or a move
// marked `ki: '<kind>'` (moves/ki.js) comes here; reset() at every reset of his; frame(dt) every frame.
// Anything this class throws or calls must be told to the cue ledger (d.brain.expect / fairDelay) and
// draw from its own random stream, never Math.random or fx.rnd() (ashDisciple/terrain.js shows how).

export class KiMoves {
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

  /** A ki move starts (brain.startAct → d.onActStart): false = it cannot start now (nothing changes). */
  begin(act) {
    void act;
    return true;
  }

  /** His AI weighs a ki move (brain._choose → d.weigh): the weight it gets now (0 = not now). */
  weigh(def, w, dist) {
    void def;
    void dist;
    return w;
  }

  /** A `cast` beat's impact (d.onCast). */
  onCast(b, s, a) {}

  /** A `release` beat's impact (d.onRelease). */
  onRelease(b, s, a) {}

  /** Any routed beat's impact, its first frame (d.onImpact; before the zone is tested). */
  onImpact(b, s, a) {}

  /** Every frame of a routed beat (d.beatMotion; u 0..1 the windup, 1..2 the active frames). */
  motion(b, u, s, dt) {}

  /** A `sustain` beat, every `sustain.tick` s while it is lit (d.onSustain; k 0..1 through it). */
  onSustain(b, s, a, k) {}

  /** A routed beat's blow met the hero (d.hitPlayer; `r` the player's RESULT). */
  onHit(o, r) {}

  /** The blade lock ended (d.onLockEnd) while a routed move started it: true = handled here. */
  lockEnd(won) {
    void won;
    return false;
  }

  /** Every frame, after the brain (d.brainFrame). */
  frame(dt) {}
}
