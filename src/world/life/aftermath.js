// THE AFTERMATH (piece 'answer'): what a fight leaves in the air. Thin smoke rising off scorched ground
// and leaning with the wind, embers drifting, dust hanging over a crater; all of it thinning out over
// time, gone at the fight's reset.
// STUB: the interface is fixed (life.js, "THE CONTRACT"); nothing lingers yet.
//
//   aftermath.impact(x, z, r, power, o)   a blow landed (life.impact): dust may hang there
//   aftermath.ignite(x, z, r, k)          fire landed (life.ignite): smoke may rise there after
// With the piece off: nothing.

export class Aftermath {
  constructor(life) {
    this.life = life;
  }

  impact() {}

  ignite() {}

  update() {}

  clear() {}

  setVisible() {}

  takes() {
    return false;
  }
}
