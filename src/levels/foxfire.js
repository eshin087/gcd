import { createFoxTerrace, TERRACE } from '../world/foxTerrace.js';
import { ThousandFox } from '../entities/enemies/thousandFox/fox.js';

// The Foxfire Terrace: a moonlit hill shrine, and Wen Yao, the Thousand-Body Fox, who sits on its round
// terrace among his own paper selves (ADR-131; ARCHITECTURE.md → "The Thousand-Body Fox"). The terrace
// is centred on the origin; the bonfire waits at the foot of the path to the south.
const T = TERRACE;

export const FOXFIRE = Object.freeze({
  id: 'fox',
  aliases: ['foxfire', 'terrace', 'shrine', 'thousand', 'wenyao'],
  name: 'The Foxfire Terrace',
  sub: 'where the fox keeps a thousand shadows',
  world: Object.freeze({
    arenaRadius: 14.5,
    playerBound: 40, // round the origin: the terrace, the path and the bonfire landing
    dragonBound: 12.2, // he stays inside the ring of lanterns and stone foxes
    bonfire: { x: T.bonfire.x, z: T.bonfire.z },
    playerSpawn: { x: T.bonfire.x + 0.6, z: T.bonfire.z - 1.7 },
    dragonSleep: { x: 0, z: -2, yaw: 0 }, // seated in the middle of the terrace, facing the path
    bossTriggerZ: 14.6, // up the last steps onto the paving
    wakeRadius: 9,
  }),
  buildSet: createFoxTerrace,
  createBoss: (game) => new ThousandFox(game),
  /** The fixed reward of this level (ADR-135): recorded, not usable yet (no technique slot exists). */
  reward: Object.freeze({ id: 'paperDouble', kind: 'ability', name: 'Paper Double', usable: false, line: 'A paper self that takes a blow meant for you.' }),
  text: Object.freeze({
    arrive: ['Paper charms hang from every bough. On the terrace above, someone sits among his own shadows.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The seated figures turn their masks toward you…',
    phase2: 'ONE BECOMES A THOUSAND',
    phase3: 'THE FOX WEARS ITS FIRE',
    victory: 'THE FOX IS UNMASKED',
    fallen: 'The paper settles. One mask lies on the stones.',
    restReset: 'The fox sits down among his shadows again.',
    again: 'The fox sits once more. The terrace waits.',
    rise: 'You rise again at the bonfire.',
  }),
});
