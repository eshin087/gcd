import { createThroneHall, THRONE } from '../world/throneHall.js';
import { StarlessLord } from '../entities/enemies/starlessLord/lord.js';

// The Obsidian Throne: the crater where the Starless Lord fell out of the night sky, and the star he
// took for a throne (COMBAT.md → "The Starless Lord"; world/throneHall.js, ADR-108). The seal inlaid
// in the crater's floor is the origin: the duel's centre. The bonfire waits to the south, at the foot
// of the path through the flattened forest.
const H = THRONE;

export const STARLESS = Object.freeze({
  id: 'starless',
  aliases: ['lord', 'throne', 'hall', 'void', 'starfall', 'crater'],
  name: 'The Obsidian Throne',
  sub: 'where the starless lord waits',
  world: Object.freeze({
    arenaRadius: 16,
    playerBound: 40, // round the seal: the crater, the path and the bonfire landing
    // the lord keeps to the crater's floor: a circle round the seal (the duelist's bound; his
    // tuning.js `bound` is the same number) ...
    dragonBound: H.floor.r,
    // ... south of the dais (starlessLord/lord.js clampTarget; a level without it has no such line)
    bossFloor: { zN: H.floor.zN },
    bonfire: { x: H.bonfire.x, z: H.bonfire.z },
    playerSpawn: { x: H.bonfire.x + 0.6, z: H.bonfire.z - 1.7 },
    dragonSleep: { x: H.throne.x, z: H.throne.z + 0.5, yaw: 0 }, // on the throne, facing the way in
    bossTriggerZ: H.entryZ - 0.8, // over the south lip, onto the crater's floor
    wakeRadius: 10,
  }),
  buildSet: createThroneHall,
  createBoss: (game) => new StarlessLord(game),
  text: Object.freeze({
    arrive: ['A crater lies where a star fell. Red light bleeds from its heart.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'On the throne, a helm lifts…',
    phase2: 'A SECOND BLADE IGNITES',
    phase3: 'THE BLADES JOIN',
    phase4: 'THE VOID ANSWERS HIM',
    victory: 'THE STARLESS LORD FALLS',
    fallen: 'The red light gutters out. The throne is empty.',
    restReset: 'The lord returns to his throne.',
    again: 'The lord sits once more. The crater waits.',
    rise: 'You rise again at the bonfire.',
  }),
});
