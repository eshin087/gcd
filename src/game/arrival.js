// THE ARRIVAL (piece 'arrival'): as the player enters a level from the title, the camera opens wide
// over the arena for a few seconds while the level shows itself (a gust crosses it), then settles
// behind the hero. Any input skips it. Never on a respawn, never from the Lab's state jumps.
// STUB: the class exists so the flow can hold one; it does nothing yet.
//
//   new Arrival(game, flow)
//   arrival.begin()          the title was dismissed (flow._startGame)
//   arrival.update(dt)       once a frame; returns true while the beat holds the camera
//   arrival.cancel()         a reset, a debug jump or the boss intro took over
//   arrival.active
// With the piece off (`!game.world?.life?.on('arrival')`): begin() does nothing.

export class Arrival {
  constructor(game, flow) {
    this.game = game;
    this.flow = flow;
    this.active = false;
  }

  begin() {}

  update() {
    return false;
  }

  cancel() {
    this.active = false;
  }
}
