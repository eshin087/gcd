import { createSkywellVault, VAULT } from '../world/skywellVault.js';
import { HeavenFallen } from '../entities/enemies/heavenFallen/fallen.js';

// The Skywell Vault and Qian Yao, the Heaven-Fallen (`?level=fallen`; ADR-132, ADR-133): a hall under
// the mountain lit only by four shafts of sunlight he cut with his eyes; while the sun is in him he
// cannot be staggered, and the hero shuts the sky (each lid hangs on a chain from a windlass at the
// floor). The duel's centre is the origin; the bonfire waits to the south.
const V = VAULT;

export const FALLEN = Object.freeze({
  id: 'fallen',
  aliases: ['heaven', 'heavenfallen', 'skywell', 'vault', 'qianyao'],
  name: 'The Skywell Vault',
  sub: 'where the heaven-fallen drinks the sun',
  world: Object.freeze({
    arenaRadius: V.R,
    playerBound: 40,
    dragonBound: V.floor.r,
    bonfire: { x: V.bonfire.x, z: V.bonfire.z },
    playerSpawn: { x: V.bonfire.x + 0.6, z: V.bonfire.z - 1.7 },
    dragonSleep: { x: V.seat.x, z: V.seat.z, yaw: 0 },
    bossTriggerZ: V.entryZ - 0.6, // through the broken gate
    wakeRadius: 9,
  }),
  buildSet: createSkywellVault,
  createBoss: (game) => new HeavenFallen(game),
  // the level's fixed reward (ADR-134; game/rewards.js): granted on victory, its line shown
  reward: Object.freeze({ id: 'fallingHeaven', name: 'Falling Heaven', line: 'Falling Heaven is yours: sprint, then heavy, and you come down out of the sky on your foe.' }),
  text: Object.freeze({
    arrive: ['Under the mountain, four chains hold the sky open. Something sits in the dark between the lights.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'Between the lights, a head lifts…',
    phase2: 'HE OPENS HIS EYES',
    phase3: 'HE TEARS THE SKY',
    victory: 'THE HEAVEN-FALLEN FALLS',
    fallen: 'The light goes out of him. The vault is dark.',
    restReset: 'The Heaven-Fallen returns to his seat.',
    again: 'He sits once more between the lights. The vault waits.',
    rise: 'You rise again at the bonfire.',
  }),
});
