// Destruction numbers (world/destructibles.js, world/fire.js, world/scars.js; ADR-107). Content is
// data: what a material is worth, how hard a blow is, how long things burn.
//
// POWER is the one scale every blow is put on (0 = a touch, 1 = a blow that fells a tree):
//   0.12 a quick cut      0.3 a duelist's cut       0.5 a heavy cut (an overhead, the hero's finisher)
//   0.8 a claw, the hero's charged cleave           1.0 a tail, a slam, a thrown stone
//   1.5 a meteor, a bolt of the Void                2.5 the dive's crash, the nova
// An object loses `power × the material's factor for that kind of blow` of its structure.

export const BLOW = Object.freeze({ CUT: 'cut', BLUNT: 'blunt', BLAST: 'blast', FIRE: 'fire' });

export const BREAK = Object.freeze({
  /** per material: structure of a 1 m wide, 3 m tall piece; how each kind of blow bites; its debris */
  mats: Object.freeze({
    wood: Object.freeze({
      hp: 0.9,
      take: Object.freeze({ cut: 1, blunt: 0.9, blast: 1.1, fire: 0 }),
      chips: "/\\|-'`,", // splinters
      dust: ".,'",
      color: [0.34, 0.25, 0.17],
      colorEnd: [0.1, 0.07, 0.05],
      burns: true,
    }),
    stone: Object.freeze({
      hp: 1.3,
      take: Object.freeze({ cut: 0.7, blunt: 1, blast: 1.15, fire: 0 }),
      chips: '#%&o:.,', // chunks
      dust: '.:,',
      color: [0.3, 0.33, 0.42], // (kept low: debris in the stone's own dim hue, never a white flash)
      colorEnd: [0.12, 0.13, 0.16],
      burns: false,
    }),
    metal: Object.freeze({
      hp: 2.6,
      take: Object.freeze({ cut: 0.3, blunt: 0.8, blast: 0.9, fire: 0 }),
      chips: '*+x.', // sparks
      dust: ".'",
      color: [2.4, 1.5, 0.5],
      colorEnd: [0.5, 0.12, 0.03],
      burns: false,
      sparks: true,
    }),
    bone: Object.freeze({
      hp: 0.8,
      take: Object.freeze({ cut: 0.8, blunt: 1.1, blast: 1.2, fire: 0 }),
      chips: "|/\\-:.'",
      dust: '.:',
      color: [0.46, 0.43, 0.36],
      colorEnd: [0.16, 0.15, 0.13],
      burns: false,
    }),
  }),
  /** a blow weaker than this leaves a mark and takes nothing (a quick cut on stone) */
  scratch: 0.1,
  /** a struck object cannot be struck again by the same source for this long (one swing, one chip) */
  rehit: 0.18,
  /**
   * A BRUSH (a blow with `o.brush`: a boss's body walking, turning, shouldering into a piece): only
   * what the blow has over `brush` x the piece's structure bites; the rest is a shove and a shudder.
   * A walk shakes a big tree and breaks the small things (bones, helms, a sapling); a charge, a tail
   * swept hard, a landing or a thrown piece still fells what it meets (2026-11-15, the tuning pass: the
   * body's sweeps added up step by step and a four-minute fight left a sixth of the clearing standing).
   * A flat stone (a flagstone: lower than `flat` m) takes nothing from a brush: claws and feet scrape
   * over the paving; a stomp, a landing, a dive or a thrown piece (world.impact) still breaks it
   */
  brush: 0.55,
  // ... but never less than this share of it: a body that keeps pushing into a tree (walking straight
  // through it) still brings it down in a couple of seconds; a turn's brush only shakes it
  brushMin: 0.4,
  brushRehit: 0.3, // s between two brushes of one piece (a limb rubbing past it)
  brushFlat: 0.3,
  /**
   * Fire that LANDS lights wood (destructibles.ignite: a breath, a flame wall, a burning pass; not the
   * spread, which has its own budget below): at most `perSec` new fires a second over the level
   * (banking `bank`), and only while fewer than `maxBurning` x the quality factor burn. Past it the
   * grass still burns and the wood is only scorched (a flame wall that crossed the ring lit 22 - 29
   * trees at once)
   */
  light: Object.freeze({ perSec: 0.12, bank: 3, maxBurning: 6 }),
  /** falling over: seconds for a 5 m piece (scaled by sqrt(h / 5)), the strip it lands on, what it deals */
  topple: Object.freeze({
    time: 1.0,
    minH: 2.2, // shorter pieces shatter where they stand
    pad: 0.55, // m either side of the falling piece that it hits
    damage: 22, // to the hero under it (dodge it: red), × the piece's weight (0.6 … 1.3)
    bossDamage: 220, // to a boss under a piece the hero felled, × weight
    bossPosture: 90,
    knock: 6,
    shake: 0.42,
  }),
  /** a thrown piece (a boss's move supplies its own tell and blow; these are the world's share) */
  thrown: Object.freeze({ gravity: 22, spin: 5.5, blast: 1.2, shake: 0.4 }),
  /** cover: a piece stops a projectile and pays for it */
  cover: Object.freeze({ minH: 1.1, bullet: 0.12, bolt: 1.5, stone: 0.7, crescent: 0.35 }),
  /** burning wood: seconds alight, the ring round the trunk that burns the hero, ticks as the ground fire's.
   *  `glow`: its light is a LOCAL glow (radius m, intensity; it was ~16 m and 2.6, a yellow flood that
   *  buried the fire on the ground the hero must read): a piece that catches within `share` m of one
   *  already lit shares that light (it is kept on for as long as either burns); at most `lights` at once
   *  (only 8 reach the shaders) */
  burn: Object.freeze({ time: 7, pad: 1.0, light: [3.2, 1.1, 0.25], lights: 4, glow: Object.freeze({ radius: 5, intensity: 1.5, share: 8 }) }),
  /** the spatial grid every query walks (strike, sweep, stop, coverAt, ignite, nearest): cell size, m */
  grid: Object.freeze({ cell: 4 }),
  /**
   * Fire spreads (2026-11-15: the owner's "fire spreads from tree to tree"; ADR-107 had it burn where
   * it lands): a piece alight for `after` s tries every `every` s to light ONE unburnt wood piece (or a
   * log) whose base is within `reach` m of its own (+ both radii), with `chance`. Limits: at most
   * `maxBurning` things alight at once (x the quality factor), a budget of `perSec` spreads a second
   * over the whole level (it banks up to `bank`), and a fire passes on at most `gens` times from where
   * fire landed (a blaze stays a stand, it never walks round the whole ring).
   */
  spread: Object.freeze({ after: 2.2, every: 1.1, chance: 0.45, reach: 5.2, maxBurning: 7, perSec: 0.25, bank: 2, k: 0.9, gens: 2 }), // (tuning, 2026-11-15: maxBurning 9, perSec 0.3)
  /**
   * Wreckage (world/wreckage.js): what a felled tree, a broken stone and a thrown piece leave lying,
   * scenery the hero walks over (no collider, it stops nothing). Pools of prop-art meshes: `logs` fallen
   * trunks, `chars` burnt ones, `rubble` piles. The quality factor scales how many may lie at once; past
   * that the oldest sinks into the ground (`sink` s). `trunk`: share of a tree's height that lies as its
   * trunk [a crowned tree, a bare one] (the crown comes apart as before); `thick`: the log's radius x the
   * piece's; `flatten`: the char it leaves on the grass under it (the blades shrink: it lies on them,
   * not under them). A burnt log smoulders `smoulder` s (at most `smoulderMax` x quality at once: smoke and
   * embers, a warm patch of ground); a log that catches burns `burn` s.
   */
  wreck: Object.freeze({ logs: 40, chars: 18, rubble: 30, sink: 1.4, trunk: Object.freeze([0.5, 0.85]), thick: 0.85, flatten: 0.4, smoulder: 30, smoulderMax: 8, burn: 6 }),
  /** a thrown piece smashes what stands in its way: power x its weight, while it flies under `y` m */
  flight: Object.freeze({ power: 0.8, y: 7 }),
  /**
   * Wearing down (2026-11-16, the owner's "slowly crumble and break"): a tree loses itself in stages
   * before it falls. At each share of its structure in `at` it reaches the next stage: 1 a burst of
   * leaves and a thinner crown, 2 boughs snapped and half the crown gone, 3 it leans `lean` rad (x 0.75
   * .. 1.25) along the blow, over `leanTime` s. Which parts go by each stage is the set's (forest.js
   * `wear`). A burning tree's crown is all gone by `burn` of its burn. `debris`: glyphs a dropped part
   * throws per metre of its size (x quality). `shakeMax`: range pieces (the forest's trees) that may
   * shudder at once (their vertices are rewritten each frame; x quality; the rest only chip).
   */
  wear: Object.freeze({ at: Object.freeze([0.82, 0.5, 0.22]), lean: 0.2, leanTime: 0.6, burn: 0.85, debris: 14, shakeMax: 10 }),
  /**
   * The tree wall round the clearing (2026-11-16): every tree of it breaks, out to the forest's edge
   * (74 m). A tree whose base is beyond `from` m is the wall's: `hp` x the structure of a tree of its
   * size (it takes a fight's worth of blows, a hit shows at once as a stage), and it falls mostly AWAY
   * from the arena: at least `out` of its way points out (a fall that cannot reach the hero's bound tells
   * nothing: there is nothing to dodge). Where it lands it strikes the trees behind with `domino` x its
   * weight (0.7 elsewhere: a felled rim tree tears into the wall behind it), and a fire in the wall may
   * pass on `gens` more times than BREAK.spread.gens (a blaze eats into the wall, not round the ring).
   */
  wall: Object.freeze({ from: 32, hp: 1.15, out: 0.55, domino: 1.4, gens: 1 }),
  /** a piece some of whose `guards` stand (the Cinder Tree's trunk under its boughs) takes this share of a blow */
  guarded: 0.2,
  /**
   * The landmarks of Cinderwood (2026-11-16: the owner reversed ADR-119's "they stay whole"; the bonfire
   * stays): structure in POWER units by piece. The Elder Wyrm's skeleton comes apart rib by rib over a
   * fight (a tail blow takes a third to a half of a rib); the Cinder Tree loses its boughs first (each
   * burns too), then its trunk falls to a charred stump; the bone nest's great ribcage and skull.
   */
  landmark: Object.freeze({
    rib: 2.4, spine: 3.2, skull: 6, jaw: 3, horn: 2, hip: 3, mast: 2.6, fingers: 1.6, wing: 2.2,
    bough: 2.6, trunk: 7,
    nestRib: 1.6, nestSkull: 3.5,
  }),
});

/**
 * The phone budget (world.setQuality, from the quality preset: LOW, MEDIUM, HIGH): a factor on the debris
 * glyphs a break throws, the flames of burning wood, how much wreckage lies at once, how many fires and
 * smouldering logs, and how many marks stay on the floor.
 */
export const QUALITY = Object.freeze({ LOW: 0.5, MEDIUM: 0.75, HIGH: 1 });

// (How a broken piece comes apart is the owner's pick of three filmed looks, 2026-11-15: "digits",
// a shower of the characters it is drawn in. Chunks and shards were turned down: destructibles.js
// `_crumble`.)

/**
 * Grass and ground fire (world/fire.js). Grass fire burns where it lands and does not creep through
 * the grass (the owner's pick); standing wood is another matter: it passes fire on, BREAK.spread.
 */
export const FIRE = Object.freeze({
  minFuel: 0.18, // grass density below this does not catch
  life: [3.2, 4.6], // s a cell burns: thin grass … a full meadow
  grace: 0.45, // s after it catches before it can hurt (a roll through the blast ends outside)
  tick: 0.55, // s between burns on a hero who stays in it
  damage: 5,
  heat: 0.55, // the scorch map's heat a burning cell holds (the ground's ember glow under the flames)
  flames: 46, // flame glyphs per second per burning square metre (capped below)
  maxFlames: 800, // … per second over the whole field
  maxCells: 2600, // burning cells at once (a hard cap: the oldest fires are simply left to finish)
  glow: Object.freeze({ intensity: 1.5, pad: 2, max: 6 }), // a blaze's one light: radius min(max, its radius + pad) m
  // under a live breath (world.fire.hush): the grass's flames x k heat (and smaller, lower). At 1 they
  // added up with the breath's own blobs into white-yellow knots along its cone (integration, 2026-11-15)
  hush: Object.freeze({ k: 0.45, slots: 8 }),
});

/** Impact marks (world/scars.js). */
export const SCAR = Object.freeze({
  max: 520, // glyphs kept; the oldest go first
  ground: Object.freeze({ min: 0.45, glyphs: 'x+*', spokes: [5, 9], reach: [0.7, 2.6] }),
  object: Object.freeze({ glyphs: 'x/\\+', size: [0.22, 0.5] }),
  /** a crater: a blow of `min` power or more leaves a rim of thrown-up earth and a charred disc */
  crater: Object.freeze({ min: 1.2, glyphs: '.:o,', ring: [10, 26], char: 0.85 }),
  /** at the cap this share of the oldest marks goes in one step (one rebuild of the batch, not one per mark) */
  evict: 0.15,
});
