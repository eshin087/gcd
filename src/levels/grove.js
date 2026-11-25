import { createWindlessGrove, GROVE } from '../world/windlessGrove.js';
import { Sheathed } from '../entities/enemies/sheathed/sheathed.js';
import { TUNING as BOSS_TUNING } from '../entities/enemies/sheathed/tuning.js';

// The Windless Grove (ADR-145): a bamboo grove at night with a round clearing, and Lu Wusheng, the
// Sheathed: a wandering swordsman who kneels before a mound of swords, his own across his knees, and
// whose blade stays in the scabbard until one draw. The clearing is centred on the origin; the bonfire
// waits to the south.
const G = GROVE;

export const WINDLESS = Object.freeze({
  id: 'grove',
  aliases: ['sheathed', 'windless', 'bamboo', 'wusheng'],
  name: 'The Windless Grove',
  sub: 'where a man who swore off the sword still carries one',
  boss: BOSS_TUNING.name, // the boss's full name (the title's world list; the HUD reads the boss's own)
  world: Object.freeze({
    arenaRadius: 15,
    playerBound: G.bound,
    dragonBound: G.floor.r,
    bonfire: { x: G.bonfire.x, z: G.bonfire.z },
    playerSpawn: { x: G.bonfire.x + 0.6, z: G.bonfire.z - 1.7 },
    dragonSleep: { x: G.wait.x, z: G.wait.z, yaw: G.wait.yaw },
    bossTriggerZ: G.entryZ, // where the path meets the clearing
    wakeRadius: 9,
  }),
  buildSet: createWindlessGrove,
  createBoss: (game) => new Sheathed(game),
  // (ADR-152: the lines play up a wanderer who has sworn not to draw; original wording)
  text: Object.freeze({
    arrive: ['No wind moves the bamboo. In the clearing ahead a man kneels before a mound of swords that are not his. His own lies across his knees, still in its scabbard.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The kneeling man stands, the scabbard loose in his hand. "I put this down years ago. Walk on, and it stays down."',
    phase2: "A THUMB'S WIDTH OF STEEL",
    phase3: 'THE GROVE HOLDS ITS BREATH',
    victory: 'THE SHEATHED FALLS',
    fallen: 'One click of a sword going home. He kneels again, as if he had never stood.',
    restReset: 'The swordsman kneels again before the graves.',
    again: 'He lays the sword across his knees once more. Somewhere a promise is still being kept.',
    rise: 'You rise again at the bonfire.',
  }),
});
