// Bai Wuji's terrain moves' numbers (the terrain agent's file: the crossing and the void as his weapons;
// the handler: terrain.js WjTerrain; the moves: moves/terrain.js). Read as TUNING.terrain (tuning.js merges
// it). The blows' own tells, damage and knock-back are the moves' data; what the pieces do is here.
// Times in seconds, distances in metres, POWER in the world's units (world/breakTuning.js: 1 fells a tree;
// a car breaks at 2.4, a road slab at 1.6, a tower top at 4.5).
export const TUNING_TERRAIN = {
  /** Every terrain move: no more than `max` of them start inside `window` s (BRIEF R6: never a rain of
   *  wreckage), none while something of his is still in the air, and none while the scene is morphing. */
  pace: { window: 12, max: 2 },
  /** The red cue of a piece that lands AWAY from him (a drop, a burst): combat:tell `tellAt` s before it
   *  lands at the latest (it goes out as the place is fixed), the flash flashLead before. */
  maxDelay: 0.6, // s the fairness guard may hold a called landing; past it the piece lands uncued and harmless
  /** CURB PULL: a car or a road slab within `find` m of him lifts (`liftT` s) to hang `hang` m over its
   *  place turning in a blue knot, and comes at the hero at `speed` m/s (a flight of `time`, at least
   *  `minFlight`, `lead` s of his motion led). Blue: a parry cuts it in two (its halves burst `halves` m
   *  behind him); a dodge: it bursts where it lands (power, radius; a slam's floor mark). */
  curb: {
    kinds: ['car', 'slab'], find: 16,
    take: 0.18, // u of the lift beat when it tears free
    liftT: 0.55, hang: 2.6, turn: 1.6,
    speed: 20, time: [0.6, 1.1], minFlight: 0.55, lead: 0.18,
    hit: 1.7, // m from where it lands: the blow reaches the hero
    power: 1.6, radius: 2.4, parryPosture: 18, halves: 4.2, halfPower: 1.4,
    mark: 1.2, // power of its floor mark (a slam)
  },
  /** BRING IT DOWN: the standing tower top nearest the hero is torn off its base (`take` of the windup),
   *  rises `rise` m, comes over the hero's place `over` m up, and falls: the place follows him until
   *  `fix` s before it lands, then it is fixed and shown (the mark, the red cue). A crater `crater` m
   *  wide (power), the blow `r` m round where it lands. No top left: the fallen tower's section (when the
   *  set makes its sections liftable: today none is), else the move is refused. */
  down: {
    kinds: ['towerTop', 'fallenTower'],
    take: 0.2, rise: 3, over: 9, carryT: 0.9, fall: 0.5, fix: 0.85,
    r: 3.2, crater: 3.6, power: 3.2, mark: 2.4,
  },
  /** THE ORBIT: `count` loose pieces within `near` m of him (`kinds`, the first kinds first) rise to turn
   *  round him `r` m out, `y` m up (`spin` rad/s); each cast beat sends one (the last one: the red that
   *  bursts on the road, `burst` m, power). Fewer than `min` standing: refused. */
  orbit: {
    kinds: ['slab', 'car', 'floatSlab', 'floatCar', 'floatCorner'], near: 14, count: 3, min: 2,
    r: 4.5, y: [1.7, 2.3, 2.0, 2.6], liftT: 0.8, spin: 1.3,
    speed: 18, time: [0.55, 1.0], minFlight: 0.55, lead: 0.15, hit: 1.6,
    power: 1.3, radius: 2.0, parryPosture: 14,
    burst: 2.6, burstPower: 1.8, mark: 1.6,
  },
  /** THE ROAD ITSELF: his heel into the road; the slabs burst up in a line toward the hero from `first` m
   *  out, one every `step` m to `past` m beyond him (`max` at most), one every `gap` s (per phase) after
   *  `delay`; each flares (red) for a hero within `cue` m of it; one blow for the whole line. The strip
   *  is fixed at the stomp and drawn (`w` m wide) until it bursts. */
  road: {
    first: 1.8, step: 1.6, past: 2.6, max: 10, delay: 0.25, gap: [0.16, 0.15, 0.13],
    radius: 1.3, cue: 2.0, w: 1.3, quiver: 0.35, take: 2.5, pop: 0.5, skid: 0.8, power: 1.25, mark: 1.0,
  },
  /** IN THE VOID: a floating piece drifts over the hero (`glideT` s, `over` m up) and is dropped (red, the
   *  blow `r` m round; the place fixed `fix` s before); or two are drawn to him and cast in turn (blue,
   *  as Curb Pull's throw). The void's pieces are spent as they go (the set has no way to make new ones). */
  float: {
    kinds: ['floatSlab', 'floatCar', 'floatCorner'], find: 30,
    take: 0.12, glideT: 0.9, over: 4.2, fall: 0.42, fix: 0.8,
    r: 2.4, crater: 2.4, power: 2.0, mark: 1.6,
    hang: 1.2, liftT: 0.5, speed: 20, time: [0.55, 1.0], minFlight: 0.55, lead: 0.15, hit: 1.6, parryPosture: 14, radius: 2.0, throwPower: 1.4,
  },
  /** THROWN INTO (terrain.behind / terrain.aimThrow for the melee and spells handlers): a piece within
   *  `reach` m and `spread` rad of the hero's way out counts. */
  into: { reach: 8, spread: 0.6, minHp: 0.5 },
};
