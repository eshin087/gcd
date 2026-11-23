// THE SOUND OF THE AIR (piece 'air'): a quiet synthesized bed that follows the living world: the wind
// rising with each gust (life.wind.level, wind.at), leaves, rain (life.weather.wet), a level's own
// night voices, all going quiet with life.hush and while the boss is up. No recorded samples.
// STUB: the class exists so audio.js can hold one; it makes no sound yet.
//
//   new Air(audio)                 built with the audio engine (its context may not exist yet)
//   air.update(now, dt, game)      once a frame after the engine is unlocked; reads game.world?.life
// With the piece off (`!game.world?.life?.on('air')`): silent, and the bed the game has today plays
// exactly as before.

export class Air {
  constructor(audio) {
    this.audio = audio;
  }

  update() {}
}
