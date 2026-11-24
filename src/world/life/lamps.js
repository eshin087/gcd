// THE LAMPS (piece 'answer'): the levels' stone lanterns and braziers, which stand unlit today. They
// kindle as the fight heats up (a boss's new phase, fire landing near), gutter under a blow's shock and
// go dark when the piece that holds them breaks or falls.
// STUB: the interface is fixed (life.js, "THE CONTRACT"); nothing is lit yet.
//
//   lamps.impact(x, z, r, power, o)   a blow landed (life.impact): a lamp near it gutters
//   lamps.ignite(x, z, r, k)          fire landed (life.ignite): a lamp near it may catch
//   lamps.lit                         how many are lit now
// With the piece off: nothing is lit, no light is asked of the light pool.

export class Lamps {
  constructor(life) {
    this.life = life;
    this.lit = 0;
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
