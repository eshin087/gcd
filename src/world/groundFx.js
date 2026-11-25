import { DP_FX_U } from '../render/dragonPrintFx.js';

// THE DRAGON PRINT'S UPGRADES, CPU side (stub: the upgrades' author fills it). world.js builds one and
// calls update(dt) once a frame, after the scorch map and the hero's wake. Writes DP_FX_U (render/
// dragonPrintFx.js) only; reads the game (fighters' positions, the world's blows, the wind); never
// Math.random, no allocation per frame, no new event.
//
//   new GroundFx(game, world)
//   fx.update(dt)        once a frame
//   fx.blow(x, z, power) a blow met the ground (world.groundBlow calls it): the ripple's source
//   fx.clear()           the fight's reset

export class GroundFx {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.U = DP_FX_U;
  }

  update(dt) {}

  blow(x, z, power) {}

  clear() {}
}
