import { createVeiledCrossing, CROSSING } from '../world/veiledCrossing.js';
import { Untouched } from '../entities/enemies/untouched/untouched.js';
import { TUNING as BOSS_TUNING } from '../entities/enemies/untouched/tuning.js';

// The Veiled Crossing: a city crossing after the fight has already levelled it, at night, under a black
// veil, and Bai Wuji, the Untouched, who waits in the middle of it with his hands in his pockets. The
// crossing is centred on the origin; the bonfire waits in the south. No reward yet (the owner has not
// chosen one).
const C = CROSSING;

export const VEIL = Object.freeze({
  id: 'veil',
  aliases: ['crossing', 'veiled', 'wuji', 'untouched'],
  name: 'The Veiled Crossing',
  sub: 'a city that lost the fight before you came, and the man who did not',
  boss: BOSS_TUNING.name, // the boss's full name (the title's world list; the HUD reads the boss's own)
  world: Object.freeze({
    arenaRadius: C.r,
    playerBound: C.bound,
    dragonBound: C.dragonBound,
    bonfire: { x: C.bonfire.x, z: C.bonfire.z },
    playerSpawn: { x: C.bonfire.x + 0.6, z: C.bonfire.z - 1.7 },
    dragonSleep: { x: C.wait.x, z: C.wait.z, yaw: C.wait.yaw },
    bossTriggerZ: C.entryZ,
    wakeRadius: 9,
  }),
  buildSet: createVeiledCrossing,
  createBoss: (game) => new Untouched(game),
  text: Object.freeze({
    arrive: ['The stair ends in a crossing no one crosses any more: broken towers, a black sky pressed low. Someone stands in the middle of it.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The man in the middle of the crossing turns his covered eyes toward you…',
    phase2: 'THE BLINDFOLD COMES OFF',
    phase3: 'THE MEASURELESS',
    victory: 'THE UNTOUCHED FALLS',
    fallen: 'The dark lets go of the crossing. He is still smiling.',
    restReset: 'He stands in the middle of the crossing again, hands in his pockets.',
    again: 'He has not moved. He never needed to.',
    rise: 'You rise again at the bonfire.',
  }),
});
