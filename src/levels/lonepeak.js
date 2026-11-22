import { createLonePeak, PEAK } from '../world/lonePeak.js';
import { Hermit } from '../entities/enemies/hermit/hermit.js';

// The Lone Peak Hermitage: a ledge of struck stones high on a mountain, and Gu Shan, the One-Blow
// Hermit (ADR-138): an old recluse who fights with one hand, slowly, and every blow of his kills
// (ADR-139). The training ground is centred on the origin; the bonfire waits on a shelf to the south.
const P = PEAK;

export const LONEPEAK = Object.freeze({
  id: 'peak',
  aliases: ['hermit', 'hermitage', 'lonepeak', 'oneblow'],
  name: 'Lone Peak Hermitage',
  sub: 'where an old man has struck the same stone for forty years',
  world: Object.freeze({
    arenaRadius: P.r,
    playerBound: P.bound, // round the origin: the ledge, the path and the bonfire's shelf
    dragonBound: P.r - 2, // the hermit keeps inside the ring of striking stones
    bonfire: { x: P.bonfire.x, z: P.bonfire.z },
    playerSpawn: { x: P.bonfire.x + 0.6, z: P.bonfire.z - 1.7 },
    dragonSleep: { x: P.wait.x, z: P.wait.z, yaw: P.wait.yaw }, // his palm on the northernmost inner stone
    bossTriggerZ: P.entryZ - 0.6, // over the ledge's south lip
    wakeRadius: 9,
  }),
  buildSet: createLonePeak,
  createBoss: (game) => new Hermit(game),
  text: Object.freeze({
    arrive: ['The path ends at a ledge of struck stones. An old man stands with his palm on one of them.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The old man takes his hand from the stone…',
    phase2: 'THE MOUNTAIN ANSWERS',
    phase3: 'BOTH HANDS',
    victory: 'THE HERMIT BOWS',
    fallen: 'The dust settles. One stone still stands.',
    restReset: 'The hermit returns to his stone.',
    again: 'He lays his palm on the stone once more. The ledge waits.',
    rise: 'You rise again at the bonfire.',
  }),
});
