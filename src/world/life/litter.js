// THE LITTER (piece 'litter'): what falls and lies: leaves, ash, paper slips, grit, by level. It drifts
// down on the wind, lands, stays on the ground as letters, and lifts again when a gust or a foot
// passes. STUB: the interface is fixed (life.js, "THE CONTRACT"); nothing falls yet.
//
//   litter.scatter(x, z, r, k)   what lies within r of (x, z) is thrown outward (k: how hard, 1 = a
//                                heavy blow); returns how many letters it moved
//   litter.count                 letters lying or in the air now
// With the piece off: scatter does nothing, count 0.

export class Litter {
  constructor(life) {
    this.life = life;
    this.count = 0;
  }

  scatter() {
    return 0;
  }

  update() {}

  clear() {}

  setVisible() {}

  takes() {
    return false;
  }
}
