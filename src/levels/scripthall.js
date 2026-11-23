import { createScriptHall, HALL } from '../world/scriptHall.js';
import { WokenOne } from '../entities/enemies/wokenOne/wokenOne.js';

// The Hall of Falling Script: a written world the Abyss dreams, and Xin Yi, the One Who Woke, who woke
// inside it and stayed to keep it from being unwritten (ADR-156, ADR-157; ARCHITECTURE.md → "The One
// Who Woke"). One arena on the origin whose three scenes morph into each other (world/scriptHall.js
// `scenes`); the bonfire waits at the foot of the path to the south.
const H = HALL;

export const SCRIPTHALL = Object.freeze({
  id: 'code',
  aliases: ['one', 'hall', 'script', 'woke', 'xinyi'],
  name: 'The Hall of Falling Script',
  sub: 'where one man woke and stayed',
  world: Object.freeze({
    arenaRadius: 15,
    playerBound: 40, // round the origin: the hall, the steps, the path and the bonfire landing
    dragonBound: 13.5, // the slots stand inside it: he uses them
    bonfire: { x: H.bonfire.x, z: H.bonfire.z },
    playerSpawn: { x: H.bonfire.x + 0.6, z: H.bonfire.z - 1.7 },
    dragonSleep: { x: H.wait.x, z: H.wait.z, yaw: H.wait.yaw }, // his back to the path
    bossTriggerZ: 15.4, // up the steps onto the floor
    wakeRadius: 9,
  }),
  buildSet: createScriptHall,
  createBoss: (game) => new WokenOne(game),
  /** The fixed reward of this level (ADR-158): the hero's second learned technique (game/unlocks.js). */
  reward: Object.freeze({ id: 'longSecond', name: 'The Long Second', line: 'Guard, then dodge with no direction: lean back under the blow and stay in reach.', usable: true }),
  text: Object.freeze({
    arrive: ['Every wall of this hall is written in the same falling hand. At its far end a man in a long black coat stands with his back to you.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The falling letters hold still. He looks over his shoulder…',
    phase2: 'A HUNDRED IRON SEEDS',
    phase3: 'HE SEES THE SCRIPT',
    victory: 'THE ONE WHO WOKE SLEEPS',
    fallen: 'The letters fall again, as if no one had stood here.',
    restReset: 'The man in the black coat turns his back once more.',
    again: 'He turns his back. The hall writes itself whole.',
    rise: 'You rise again at the bonfire.',
  }),
});
