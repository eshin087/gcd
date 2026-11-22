import { createTideShelf, SHELF } from '../world/tideShelf.js';
import { TideColossus } from '../entities/colossus/colossus.js';

// Drownwatch Cliff: a shelf of salt grass on a basalt cliff, and NAERATH, THE TIDE COLOSSUS, a sea creature
// too big for the arena (ADR-141). It stands in the sea north of the rim and never comes ashore: the hero
// fights its two hands and its head from the shelf while it breathes down the shore. The bonfire waits on
// the path below the shelf, to the south.
export const TIDE = Object.freeze({
  id: 'tide',
  aliases: ['colossus', 'cliff', 'shore', 'sea', 'drownwatch'],
  name: 'Drownwatch Cliff',
  sub: 'where the sea stands up',
  world: Object.freeze({
    arenaRadius: 20,
    playerBound: 34, // round the origin; the sea's colliders are the north limit (world/tideShelf.js)
    dragonBound: 20,
    bonfire: { x: SHELF.bonfire.x, z: SHELF.bonfire.z },
    playerSpawn: { x: SHELF.bonfire.x + 0.6, z: SHELF.bonfire.z - 1.7 },
    // the boss slot's `position` is the rim's centre (the minimap, audio, the art grid's anchor)
    dragonSleep: { x: 0, z: SHELF.edgeZ, yaw: 0 },
    bossTriggerZ: SHELF.scarpZ - 0.8, // up through the scarp's gap onto the shelf
    wakeRadius: 6,
  }),
  buildSet: createTideShelf,
  createBoss: (game) => new TideColossus(game),
  text: Object.freeze({
    arrive: ['Salt wind over a broken watch-shelf. Below, the tide does not go out.', 'Rest at the bonfire to restore your flasks.'],
    stir: 'The sea stands up…',
    phase2: 'THE TIDE CLIMBS THE CLIFF',
    phase3: 'ITS DROWNED LIGHT WAKES',
    victory: 'THE TIDE COLOSSUS SINKS',
    fallen: 'The swell closes over it. Drownwatch is quiet.',
    restReset: 'The colossus sinks back beneath the swell.',
    again: 'The sea lies flat once more. The cliff waits.',
    rise: 'You rise again at the bonfire.',
    // the feed's lines for a creature boss (ui/feed.js; Cinderwood's own when a level has none)
    wake: 'The sea stirs…',
    fury: 'The tide climbs the cliff!',
    breath: 'the drowned tide',
  }),
});
