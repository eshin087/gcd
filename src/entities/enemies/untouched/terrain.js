// Bai Wuji's terrain moves (the terrain agent's file): wreckage Draw lifts and throws (a car, a slab, a
// tower's top), the floating pieces of the void cast at the hero. A HANDLER on the routing contract
// (untouched.js header): moves/terrain.js creates it (`create(d)`) and names the beat fields it owns
// (`FIELDS`); untouched.js calls the hooks below through `?.` for every beat that carries one of them.
// Today a stub: every hook exists and does nothing.
export class WjTerrain {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T.terrain ?? {};
  }
  /** Fight reset (Untouched.reset): forget everything in flight. */
  reset() {}
  /** Stop whatever is held / lit now (a reaction, a break, the domain, the death). */
  stop() {}
  /** Every frame after the brain (brainFrame). */
  frame(dt) {
    void dt;
  }
  /** The AI weighs a move with a beat of this handler's: return the weight (0 = not now). */
  weigh(name, def, w, dist) {
    void name;
    void def;
    void dist;
    return w;
  }
  /** A move with a beat of this handler's starts: false refuses it (nothing has changed yet). */
  onActStart(A) {
    void A;
    return true;
  }
  /** A beat's reach for the brain (Infinity: a thrown / called thing that reaches anywhere); undefined: the engine's. */
  reach(b) {
    void b;
    return undefined;
  }
  beatMotion(b, u, s, dt) {
    void b, u, s, dt;
  }
  onImpact(b, s, a) {
    void b, s, a;
  }
  onRelease(b, s, a) {
    void b, s, a;
  }
  onCast(b, s, a) {
    void b, s, a;
  }
  onSustain(b, s, a, k) {
    void b, s, a, k;
  }
  /** Before a blow of one of this handler's beats reaches the hero: return the hit object to use (o or a copy). */
  hitPlayer(o) {
    return o;
  }
  /** After it: the player's RESULT. */
  onHit(o, r) {
    void o, r;
  }
  /** One of this handler's beats was parried (before the engine's onParried): true = handled (the engine's is skipped). */
  onParried(info, b) {
    void info, b;
    return false;
  }
  /** After the pose (afterPose): drawing that reads his limbs. */
  afterPose(dt, a) {
    void dt, a;
  }
}
