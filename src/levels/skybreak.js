import { createSkybreakRing, RING } from '../world/skybreakRing.js';
import { Ascendant } from '../entities/enemies/ascendant/ascendant.js';

// The Skybreak Ring: a tournament ring of stone tiles on the open badlands, and Tian Lei, the Last
// Ascendant: a bare-handed fighter who is beaten three times, each time in a greater form. The ring
// is centred on the origin; the bonfire waits to the south.
const R = RING;

export const SKYBREAK = Object.freeze({
  id: 'ring',
  aliases: ['skybreak', 'ascendant', 'tianlei'],
  name: 'The Skybreak Ring',
  sub: 'where the last ascendant waits for a challenger',
  world: Object.freeze({
    arenaRadius: R.half,
    playerBound: 40, // round the origin: the ring, the path and the bonfire landing
    dragonBound: R.floor.r,
    bonfire: { x: R.bonfire.x, z: R.bonfire.z },
    playerSpawn: { x: R.bonfire.x + 0.6, z: R.bonfire.z - 1.7 },
    dragonSleep: { x: R.wait.x, z: R.wait.z, yaw: R.wait.yaw },
    bossTriggerZ: R.entryZ - 0.6, // onto the platform
    wakeRadius: 9,
  }),
  buildSet: createSkybreakRing,
  createBoss: (game) => new Ascendant(game),
  text: Object.freeze({
    arrive: ['Wind crosses the badlands. On a ring of worn stone, a man stands with his arms folded.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The man on the ring opens his eyes…',
    phase2: 'GOLDEN ASCENSION',
    phase3: 'THUNDER ASCENSION',
    victory: 'THE ASCENDANT FALLS',
    fallen: 'The storm breaks. The ring is quiet.',
    restReset: 'The ascendant returns to the centre of the ring.',
    again: 'He folds his arms once more. The ring waits.',
    rise: 'You rise again at the bonfire.',
  }),
});
