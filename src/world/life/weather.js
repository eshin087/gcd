// THE WEATHER (piece 'weather'): a level's slow spells, one mood per level that breathes. STUB: the
// interface is fixed (life.js, "THE CONTRACT"); nothing happens yet.
//
//   weather.name     the spell now: 'clear' | a level's own names ('mist', 'drizzle', 'squall', ...)
//   weather.wet      0..1: rain falling now (the air's sound, a footstep's splash)
//   weather.mist     0..1: how thick the low mist is now
//   weather.windK    what the weather asks of the wind: its strength is multiplied by this (1 = none)
// With the piece off: 'clear', 0, 0, 1.

export class Weather {
  constructor(life) {
    this.life = life;
    this.name = 'clear';
    this.wet = 0;
    this.mist = 0;
    this.windK = 1;
  }

  update() {}

  clear() {}

  setVisible() {}

  takes() {
    return false;
  }
}
