// THE CREATURES (piece 'creatures'): small living things, one letter each, that mind the hero: birds
// that lift off, moths round a flame, fireflies that part from his path. Nothing to hit, nothing that
// hits. STUB: the interface is fixed (life.js, "THE CONTRACT"); nothing lives yet.
//
//   creatures.startle(x, z, r, k)   everything alive within r of (x, z) flees (k: how hard: 1 = a roar);
//                                   returns how many fled
// With the piece off: startle does nothing.

export class Creatures {
  constructor(life) {
    this.life = life;
  }

  startle() {
    return 0;
  }

  update() {}

  clear() {}

  setVisible() {}

  takes() {
    return false;
  }
}
