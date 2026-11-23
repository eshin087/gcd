// THE WIND (piece 'wind'): one shared wind per level. STUB: the interface is fixed (life.js, "THE
// CONTRACT"); the body is a plain steady breeze so the other layers have air to read while the real
// wind is built.
//
//   wind.at(x, z, out)    the air's velocity at a point on the ground, m/s: out.x, out.z, and out.k
//                         (0..1: how much of a gust is passing there now). Returns `out` (pass your own
//                         record; with none, a shared one is returned: read it at once).
//   wind.front(o)         send a gust front across the level: { strength (1 = an ordinary gust),
//                         speed (m/s), width (m), dirX, dirZ (default: the prevailing wind) }
//   wind.burst(x, z, strength, radius)   a radial push from a point (life.gust → here)
//   wind.dirX, .dirZ      the prevailing direction now (unit)
//   wind.speed            the prevailing speed now, m/s
//   wind.level            0..1: how loud the air is now (the air's sound, emitters)
//   wind.still            true in a level with no wind of its own (the Windless Grove): at() is zero
//                         there except where a burst passes
// With the piece off: at() gives zero, level 0, and nothing is drawn or written.
//
// The shaders read it from the shared uniforms `uWind` (dirX, dirZ, speed, level) and `uWindFronts`
// (the fronts crossing the level), written here once a frame.

export class Wind {
  constructor(life) {
    this.life = life;
    this.still = life.levelId === 'grove';
    const a = 0.2;
    this.dirX = Math.cos(a);
    this.dirZ = Math.sin(a);
    this.speed = 0;
    this.level = 0;
    this._o = { x: 0, z: 0, k: 0 };
  }

  at(x, z, out = this._o) {
    const s = this.life.on('wind') && !this.still ? this.speed : 0;
    out.x = this.dirX * s;
    out.z = this.dirZ * s;
    out.k = 0;
    return out;
  }

  front() {}

  burst() {}

  update() {
    const on = this.life.on('wind') && !this.still;
    this.speed = on ? 1.2 * this.life.k : 0;
    this.level = on ? 0.3 : 0;
  }

  clear() {}

  setVisible() {}

  takes() {
    return false;
  }
}
