// THE IMPACT RIPPLE: the struck body's own letters take the blow. Round the drawn contact its cells
// are shoved along the blade's travel, re-roll and brighten, and a ring runs out through the body.
// STUB: the interface is fixed (main.js builds it as game.fx.ripple and updates it on fx time;
// PlayerFx.contact calls hit(); see combat/impact.js for the record), the effect is to come: the
// shader half lives in the ASCII pass (render/pipeline.js), as the heat haze does.

export class ImpactRipple {
  constructor(game) {
    this.game = game;
    /** Hits drawn so far (tests). */
    this.n = 0;
  }

  /** One landed cut at (x, y, z), the drawn contact; `o`: combat/impact.js; `k`: the strength. */
  hit(x, y, z, o, k = 1) {}

  /** Per frame, on fx time (it runs on through a hit-stop). Must not throw or allocate. */
  update(dt) {}

  /** Drop every running ripple (a level reset). */
  clear() {}
}
