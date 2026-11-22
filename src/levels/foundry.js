import { createFoundry, FOUNDRY } from '../world/foundry.js';
import { ClockworkMarshal } from '../entities/enemies/marshal/marshal.js';

// The Brazen Foundry (ADR-136; world/foundry.js): the drill yard of a war-foundry whose forges never went
// cold, and Gongshu Yan, the Clockwork Marshal, kneeling in her bronze war-suit before the great furnace
// (COMBAT.md → "The Clockwork Marshal", ADR-135). The yard is centred on the origin; the bonfire waits to
// the south, past the gate. Beating her grants the hero a fire-lance shot (ADR-137; player/rewards.js).
const F = FOUNDRY;

export const FOUNDRY_LEVEL = Object.freeze({
  id: 'foundry',
  aliases: ['marshal', 'clockwork', 'brazen', 'suit'],
  name: 'The Brazen Foundry',
  sub: 'where the clockwork marshal drills alone',
  reward: 'fireLance',
  world: Object.freeze({
    arenaRadius: F.r,
    playerBound: 40,
    dragonBound: 13.2,
    bonfire: { x: F.bonfire.x, z: F.bonfire.z },
    playerSpawn: { x: F.bonfire.x + 0.6, z: F.bonfire.z - 1.7 },
    dragonSleep: { x: 0, z: -6, yaw: 0 }, // kneeling before the furnace, facing the gate
    bossTriggerZ: F.entryZ - 0.2, // just inside the gate
    wakeRadius: 10,
  }),
  buildSet: createFoundry,
  createBoss: (game) => new ClockworkMarshal(game),
  text: Object.freeze({
    arrive: ['The forges of the Brazen Foundry never went cold. In the drill yard a bronze giant kneels before the great furnace.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'Gears turn inside the kneeling giant…',
    phase2: 'THE FURNACE OPENS',
    phase3: 'THE WORKS RUN WILD',
    phase4: 'THE MARSHAL CLIMBS OUT',
    victory: 'MARSHAL DEFEATED',
    fallen: 'The gears wind down. The foundry is quiet.',
    restReset: 'The marshal returns to her armour.',
    again: 'The giant kneels once more. The foundry waits.',
    rise: 'You rise again at the bonfire.',
  }),
});
