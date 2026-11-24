// THE TREMOR (piece 'answer'): a heavy blow shakes what stands near it. Leaves rain off a struck tree,
// dust sifts off pillars, lanterns and banners swing, pebbles hop on the floor, bamboo shivers.
// STUB: the interface is fixed (life.js, "THE CONTRACT"); nothing shakes yet.
//
//   tremor.impact(x, z, r, power, o)   life.impact calls it for every blow on the world: (x, z) where,
//                                      r its reach in m, power on the POWER scale (0.3 light, 1 heavy,
//                                      2 the biggest), o the blow's record or undefined
//                                      ({ kind, by, dx, dz, len, hot }; world.js groundBlow)
// With the piece off: nothing.

export class Tremor {
  constructor(life) {
    this.life = life;
  }

  impact() {}

  update() {}

  clear() {}

  setVisible() {}

  takes() {
    return false;
  }
}
