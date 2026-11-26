// Bai Wuji's spells' numbers (the spells agent's file: Azure Draw, the Yank, the Unveiling burst, Crimson
// Cast, the Wrecking Knot, the Violet Null, the Last Null). Read as TUNING.spells (tuning.js merges it).
// The handler is spells.js (WjSpells), the move data moves/spells.js. Times in seconds, distances in
// metres, POWER on the world's scale (breakTuning.js: 1 a slam, 2.5 the wyrm's dive). Damage is BEFORE
// his damageScale (1.54): the hero has 160 HP. Every spell is unblockable (BRIEF R4): a held guard is
// opened (breaksGuard), never paid in health.
export const TUNING_SPELLS = {
  // ---- the choice (WjSpells.weigh): a spell is weighed up when the hero stands far or keeps blocking;
  // never two spells back to back; none while one of his spells still lives on the floor
  choice: {
    far: 6, farK: 1.5, // the hero beyond `far` m: x farK
    near: 2.6, nearK: 1, // ... inside `near` m: x nearK (1: a spell is weighed UP far, never down near)
    blockAt: 1.2, blockK: 2.2, // the hero's guard held this many s of the last few: x blockK
    blockMax: 4, blockFall: 0.5, // (the count's cap; it falls at this rate a second while he does not guard)
  },

  // ---- AZURE DRAW, the knot (P1 on): one finger; a blue knot opens BEYOND the hero, drags him for its
  // life, then collapses (red) on a small radius round it
  draw: {
    windup: 1.95, // s: the cue to the collapse (the knot opens at `open` of it)
    open: 0.1, // u: the knot opens (its place is fixed then: the collapse lands there)
    beyond: 3.4, // m beyond the hero, on his line from Wuji (the drag takes him away from Wuji)
    maxR: 17, // m from the crossing's middle at most
    strength: 4.6, r: 8.5, falloff: 1, // its drag (pull.js: strength x (1 - dist / r) ^ falloff m/s)
    crush: 2.3, // m: the collapse's radius round the knot (+ the hero's radius)
    damage: 30, knockback: 6, // (46 HP after damageScale)
    power: 2.1, worldR: 2.6, // the collapse on the world (world.impact, blast)
    grab: 7.5, carry: 2, carrySpeed: 3.4, carryY: 0.9, // loose pieces (cars, slabs) within grab m drift in
    bite: { every: 0.3, reach: 4.2, power: 0.45, core: 1.4, corePower: 1.6, max: 8 }, // what it touches is bitten, bricks fly in
  },

  // ---- THE YANK (P1 on): Draw on the hero himself, onto the waiting fist (blue: parry as he arrives)
  yank: {
    windup: 1.05, // s: the cue to the fist
    travel: 0.5, // s: the pull's FIXED length (whatever the distance): he arrives `early` s before the fist
    early: 0.05,
    stop: 1.3, // m in front of Wuji he is set down
    max: 14, // m: a hero farther than this is not pulled (the fist whiffs)
    maxSpeed: 32, // m/s
    damage: 24, knockback: 5, // (37 HP)
  },

  // ---- THE UNVEILING BURST (the P1 -> P2 transition's impact; core deals the push and the ring blow)
  unveil: {
    r: 8, // m: what stands within is flattened: liftable pieces thrown outward, the rest toppled
    throwMin: 5, throwMax: 8, // m the liftable pieces are thrown
    topple: 7, // m: the ruins, lamps and signals within topple outward
    max: 10, // pieces at most
    fxR: 7, fxPower: 2.2,
  },

  // ---- CRIMSON CAST (P2 on): a red point flicked to the hero's place (fixed at `fix`), a burst
  cast: {
    windup: 1.25, fix: 0.35, // u: the place is fixed (stepping out after it works: a walk of ~0.75 s clears r)
    r: 2.4, // m: the burst's reach on the hero (+ his radius)
    damage: 34, knockback: 9, // (52 HP; 9 m and through whatever is behind: wjCrash)
    crash: 3.4,
    power: 3.0, worldR: 4.6, // the crater (world.impact, blast)
    throwR: 7, throwMin: 5, throwMax: 9, throwN: 3, // loose pieces within throwR m are thrown outward
  },
  // ... and its second form: held at his palm, released point blank after a blink (a short red)
  palm: {
    windup: 0.78,
    reach: 0.9, // m ahead of his root: the burst's middle
    r: 2.5, damage: 30, knockback: 8, crash: 3.0,
    power: 2.2, worldR: 3,
    behind: 2.2, // m: where he blinks to (behind the hero)
  },

  // ---- THE WRECKING KNOT (P2 on): the knot dragged along a line across the crossing (fixed and shown
  // before it moves), chewing a trench and every piece on its way
  wreck: {
    windup: 1.9, fix: 0.28, // u: the path is fixed (through the hero's place, across his line from Wuji): shown 0.7 s before it moves
    len: 16, time: 1.4, // m in s (it crosses the hero's fixed place at the impact)
    half: 1.5, // m: the strip's half-width (the hero inside it is hit once, red)
    strength: 4.2, r: 7, // its drag while it moves
    damage: 30, knockback: 8, crash: 3.2,
    chew: 1.5, power: 3.2, // the sweep along its way (m either side, POWER)
    furrow: 2, // m between its floor marks (dash furrows)
  },

  // ---- THE VIOLET NULL (P2 on; the fight's signature): the long cue (blue and red over his fingers,
  // merged), the LINE fixed and shown on the road, then 0.35 s of contact on a 5 m line across the arena
  null: {
    windup: 1.65, fix: 0.42, merge: 0.82, // u: the line is fixed (shown ~1 s: a walk clears it) / the two meet (the violet ball holds after)
    len: 46, w: 5, // m
    contact: 0.35, // s it can touch the hero (an erasure, not a held beam)
    beam: 0.9, // s it is drawn (it fades itself)
    damage: 70, knockback: 12, // (108 of 160 HP: the heaviest blow of the fight, never one that kills from full health)
    lethalCap: 0.78, // (and never more than this share of his max health after damageScale)
    power: 60, // POWER: everything on the strip is felled outright
    after: 3, every: 0.3, // s: the strip is swept again (a tower's base under its falling top goes too)
    trench: { power: 2.4, seg: 14, reach: 30 }, // the trench mark (scars `beam`, half-width w / 2), laid in seg m pieces out to `reach` m from the middle
    gap: 20, // s: never twice inside this
    first: 5, firstK: 6, // in phase 2: after `first` s, until the first one, x firstK (the player sees it early)
  },
  // ---- THE LAST NULL (P3, once below `below` of his bar): the cue longer, 7 m wide, turning `turn` deg
  lastNull: {
    windup: 2.3, fix: 0.55, merge: 0.8,
    len: 46, w: 7, turn: 25,
    contact: 0.75, beam: 1.1,
    damage: 80, knockback: 12, // (123 HP)
    below: 0.12, weight: 40,
  },
};
