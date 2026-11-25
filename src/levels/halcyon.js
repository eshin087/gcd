import { createHalcyonPlaza, PLAZA } from '../world/halcyonPlaza.js';
import { Halcyon } from '../entities/enemies/halcyon/halcyon.js';

// Halcyon Plaza: a city that has not been built yet (a world of an age still to come, one of the
// worlds and universes gcd's sword carries him to), and Halcyon, the Last Saviour, who owns it
// (ADR-159, ADR-160). The plaza is centred on the origin; the bonfire waits in the south alley's
// mouth. No reward yet: the owner has not chosen one (ADR-161).
const P = PLAZA;

export const HALCYON = Object.freeze({
  id: 'city',
  aliases: ['halcyon', 'plaza', 'neon', 'saviour', 'tomorrow'],
  name: 'Halcyon Plaza',
  sub: 'a city that has not been built yet, and the man who owns it',
  world: Object.freeze({
    arenaRadius: P.r,
    playerBound: P.bound, // round the origin (the towers' colliders hold the hero in the corners)
    dragonBound: 13.5,
    bonfire: { x: P.bonfire.x, z: P.bonfire.z },
    playerSpawn: { x: P.bonfire.x + 0.6, z: P.bonfire.z - 1.7 },
    dragonSleep: { x: P.wait.x, z: P.wait.z, yaw: P.wait.yaw }, // hovering beside his statue, arms folded
    bossTriggerZ: P.entryZ,
    wakeRadius: 9,
  }),
  buildSet: createHalcyonPlaza,
  createBoss: (game) => new Halcyon(game),
  text: Object.freeze({
    arrive: ['The stair ends in rain and neon: a city that has not been built yet. One face smiles from every screen.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The smiling man in the sky looks down at you…',
    phase2: 'THE SMILE DROPS',
    phase3: 'NO ONE IS WATCHING',
    victory: 'THE SAVIOUR FALLS',
    fallen: 'The last screen shows a man on his knees. Then the city goes dark.',
    restReset: 'Halcyon rises over the plaza again, smiling.',
    again: 'Every screen lights again. He is smiling.',
    rise: 'You rise again at the bonfire.',
  }),
});
