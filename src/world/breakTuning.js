// Destruction numbers (world/destructibles.js, world/fire.js, world/scars.js; ADR-103). Content is
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
      color: [0.42, 0.3, 0.2],
      colorEnd: [0.12, 0.08, 0.06],
      burns: true,
    }),
    stone: Object.freeze({
      hp: 1.7,
      take: Object.freeze({ cut: 0.45, blunt: 1, blast: 1.15, fire: 0 }),
      chips: '#%&o:.,', // chunks
      dust: '.:,',
      color: [0.5, 0.54, 0.66],
      colorEnd: [0.16, 0.17, 0.2],
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
      color: [0.7, 0.66, 0.56],
      colorEnd: [0.2, 0.19, 0.16],
      burns: false,
    }),
  }),
  /** a blow weaker than this leaves a mark and takes nothing (a quick cut on stone) */
  scratch: 0.1,
  /** a struck object cannot be struck again by the same source for this long (one swing, one chip) */
  rehit: 0.18,
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
  /** burning wood: seconds alight, the ring round the trunk that burns the hero, ticks as the ground fire's */
  burn: Object.freeze({ time: 7, pad: 1.0, light: [3.2, 1.1, 0.25] }),
});

/** Grass and ground fire (world/fire.js). Fire burns where it lands and never spreads (the owner's pick). */
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
});

/** Impact marks (world/scars.js). */
export const SCAR = Object.freeze({
  max: 520, // glyphs kept; the oldest go first
  ground: Object.freeze({ min: 0.45, glyphs: 'x+*', spokes: [5, 9], reach: [0.7, 2.6] }),
  object: Object.freeze({ glyphs: 'x/\\+', size: [0.22, 0.5] }),
});
