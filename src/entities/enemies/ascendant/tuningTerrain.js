// Tian Lei's numbers, the moves on the ring's pieces (d.T.terrain; tuning.js spreads this in). THE TERRAIN AGENT'S FILE.
// Timings, damage, speeds, radii, counts and world powers of that agent's moves live here, not in logic.
// (The blows' own damage and tells are the moves' data: moves/terrain.js.) POWER is the world's scale
// (world/breakTuning.js: a ring tile breaks at 0.85, cracks at ~0.17; 1 fells a tree).
export const TERRAIN_TUNING = {
  /** Tile Kick: he stamps, a tile jumps up before him (`ahead` m toward the hero, a whole one within
   *  `reach` of that point), hangs at `rise` m, and his punch sends it at the hero at `speed` m/s.
   *  The hero must stand `heroMin` .. `heroMax` m off for his AI to pick it. */
  tileKick: {
    ahead: 1.5, reach: 1.6, heroMin: 3.5, heroMax: 15,
    stamp: 0.32, // u of the windup when his foot comes down and the tile jumps
    rise: 1.0, riseT: 0.2,
    speed: 16, minFlight: 0.42, // (a flight shorter than the cue's lead plus a breath is lengthened: the cue comes first)
    lead: 0.2, // s of the hero's motion he leads the throw by
    hit: 0.95, // m from where it lands: the blow reaches the hero
    power: 0.9, radius: 1.3, // the world's share where it lands (it breaks there)
    parryPosture: 24, // a parry cuts it in two: what that does to his posture
    maxDelay: 0.45,
  },
  /** Ring Breaker: his fist drives into the floor; the tiles burst up in a line toward the hero, one
   *  every `step` m from `first` m out to `past` m beyond him, one every `gap` s (per form), each with
   *  its flare on the tile for a hero within `cue` m of it (the Lord's Rupture). */
  ringBreaker: {
    first: 1.8, step: 1.5, past: 2.5, max: 9, delay: 0.15, gap: [0.2, 0.2, 0.17],
    radius: 1.25, cue: 2.0, quiver: 0.32, take: 1.0, pop: 0.5, skid: 0.7, power: 1.15, fist: 1.1, maxDelay: 0.6,
  },
  /** Stone Storm: his aura tears up `count` tiles within `near` m of him and holds them round him at
   *  `slots` (his frame: [left, up, forward] m), turning; at the first cast they leave `gap` s apart,
   *  each at the hero (a flight of `time` s, `per` m a second); the great one is the last tile held,
   *  thrown by the second blow. A stagger before a throw drops what he holds. */
  stoneStorm: {
    count: 3, near: 5.5, rise: 0.55, liftT: 0.5, gap: 0.42, time: [0.5, 0.95], per: 15, lead: 0.15,
    slots: [[1.5, 2.1, 0.6], [-1.5, 2.1, 0.6], [0, 2.7, -0.4]], great: [0, 3.1, 0.9],
    hit: 1.0, greatHit: 1.6, power: 1.0, greatPower: 2.0, radius: 1.3, greatRadius: 2.4, maxDelay: 0.45,
  },
  /** The quake (Heavenfall's landing: d.terrain.quake): a front that runs out over the whole ring.
   *  Defaults for what the caller leaves out; `shatter` m round the landing every tile breaks; each
   *  slab the front crosses takes `crack` (it shows cracked); `width` m: how wide the front's blow is;
   *  a great crater (`crater` power) at the landing. */
  quake: { from: 3.4, to: 14, speed: 9, damage: 22, knockback: 4, width: 1.1, shatter: 6, crack: 0.32, crater: 2.4, maxDelay: 0.5 },
  /** A transformation's nova (d.terrain.nova): the tiles within r of him crack, those within `breakR` break. */
  nova: { crack: 0.35, breakR: 2.2, power: 1.4 },
  /** A heavy blow's crater (d.terrain.crater): rubble piles of the wreckage round it, by its weight. */
  crater: { rubble: 2, minK: 0.8 },
};
