// The litter's numbers (world/life/litter.js): what falls and lies, per level. Content is data: the
// logic reads this and nothing else. A level without a block has no litter.
//
// A level's block:
//   takes      what the atmosphere stops drawing because the litter draws it ('leaves' | 'ash')
//   rate       letters that start falling per s (x life.calm x life.quality x life.k)
//   lying      how many letters lie in the window at once (x life.quality): the pre-seed, and the
//              count past which the oldest go (faded, the ones out of view first)
//   last       [min, max] s a lying letter lasts before it is recycled (faded out)
//   grass      where the grass is thick a letter lies on the blades: this share of their mean height
//   kinds      what falls: each { share, glyphs, color, color2, size, fall, slip, flutter, spin, lift,
//              carry, hop, lie, alpha, from, where, source }
//     share     the kind's part of what falls and lies
//     glyphs    letters it is drawn with (world atlas only)
//     color     linear colour in the air at full brightness; color2: the other end of its tint
//     size      [min, max] m
//     fall      [min, max] its own terminal speed, m/s
//     slip      m/s of side-slip in the air (the flutter's swing); 0: straight down
//     flutter   [min, max] rad/s of the swing (and of its turning)
//     spin      rad/s it turns as it falls, at most (either way)
//     tau       s its velocity takes to follow the air (light leaves slow, grit quick)
//     lift      [min, max] m/s of air over it that lifts it off the ground (each letter its own)
//     carry     how much of the air's speed it takes
//     hop       m/s up when the air or a foot lifts it
//     lie       its brightness lying, against 1 in the air
//     alpha     its opacity
//     from      [min, max] m: where it starts falling ('edge' kinds start on the ground)
//     where     where it falls and lies: { at: 'rim' | 'near' | 'ash' | 'kerb' | 'flat', ... } (litter.js)
//     source    'sky' (falls from above) | 'edge' (tumbles in along the ground from upwind)
//   kerb       (ring) a tumbling letter that reaches this |x| or |z| from inside stops against it
//   shelter    how much harder a letter is to lift where it piles (x the weight above 1)
const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const LITTER = deepFreeze({
  /** the own pool at quality 1 */
  max: 500,
  /** the window round life.focus the litter keeps to (m): x either side, z north (zN) and south (zS);
   *  a little wider than the game camera's view of the ground, so a letter moved from one side to the
   *  other is never moved in view */
  window: { x: 22, zN: 19, zS: 15 },
  /** the band (m) inside the window's edge where letters arrive when the window moves */
  band: 3,
  /** m a lying letter floats over the floor: above the paving's slabs (their tops stand 0.03 - 0.1 m),
   *  or the pool's depth test buries it */
  floor: 0.16,
  /** the pool's soft depth (m): a letter on the floor is hidden by what stands in front of it */
  soft: 0.2,
  /** lying letters fade out under the hero's feet: fully hidden inside [0], fully seen beyond [1] (m) */
  heroClear: [0.32, 0.7],
  /** the hero's feet: at this speed (m/s) or more he kicks what lies within r */
  kick: { speed: 2.2, r: 1.05, forward: 0.32, aside: [0.5, 1.3], up: [0.7, 1.6] },
  /** a blow's scatter: m/s outward and up at k 1, at its centre (falls off to the rim) */
  scatter: { out: 5.5, up: 3.2 },
  /** s to fade a letter in when it starts falling, and out when it is recycled (in view / out of view) */
  fadeIn: 0.8,
  fadeOut: [4, 0.4],
  /** a lying letter's lift is checked every this many frames (round-robin) */
  liftEvery: 4,
  /** the Lab's 'leaf shower': this many start falling round the camera at once */
  shower: 60,

  levels: {
    // a night breeze through oaks and pines: dark green and brown leaves off the canopy ring and into
    // the clearing's rim, thinning toward the middle; they lie on the grass and the flagstones
    cinderwood: {
      takes: ['leaves'],
      rate: 2.4,
      lying: 150,
      last: [80, 160],
      grass: 0.95,
      kinds: [
        {
          share: 0.45, glyphs: ",`'~", color: [0.17, 0.27, 0.13], color2: [0.12, 0.18, 0.09],
          size: [0.2, 0.27], fall: [0.6, 0.95], slip: 0.55, flutter: [1.6, 2.8], spin: 2.4, tau: 0.55,
          lift: [2.6, 4.4], carry: 0.85, hop: 1.4, lie: 0.7, alpha: 0.85, from: [4.5, 8],
          where: { at: 'rim', lo: 0.12, r0: 10, r1: 30 }, source: 'sky',
        },
        {
          share: 0.55, glyphs: ",'~.", color: [0.3, 0.21, 0.1], color2: [0.22, 0.15, 0.08],
          size: [0.2, 0.27], fall: [0.65, 1.0], slip: 0.5, flutter: [1.8, 3], spin: 2.8, tau: 0.5,
          lift: [2.4, 4.0], carry: 0.85, hop: 1.4, lie: 0.8, alpha: 0.85, from: [4.5, 8],
          where: { at: 'rim', lo: 0.12, r0: 10, r1: 30 }, source: 'sky',
        },
      ],
    },

    // the burned sect: ash everywhere, as today's ashfall (26 flakes/s, grey, `.,'\``), but it lands,
    // lies thicker in the lee of pillars, lanterns and statues (their east and north sides), and is
    // kicked up by feet. Ash melts into the floor sooner than a leaf.
    ash: {
      takes: ['ash'],
      rate: 26,
      lying: 230,
      last: [10, 22],
      grass: 0.9,
      shelter: 0.6,
      kinds: [
        {
          share: 1, glyphs: ".,'`", color: [0.38, 0.37, 0.35], color2: [0.29, 0.28, 0.27],
          size: [0.12, 0.22], fall: [0.55, 0.9], slip: 0.3, flutter: [1.2, 2.4], spin: 1.5, tau: 0.45,
          lift: [1.9, 3.6], carry: 0.9, hop: 0.9, lie: 0.8, alpha: 0.85, from: [4, 9],
          where: { at: 'ash', base: 1, pile: 2.2, reach: 1.6, gap: 0.45, lee: [[1, 0], [0, -1]], within: 40, maxR: 3.5 },
          source: 'sky',
        },
      ],
    },

    // the crater of a fallen star: fine black-red grit, sparse, lying as dim letters on the obsidian;
    // the air's slow draw toward the star moves what is in the air
    starless: {
      takes: ['leaves'],
      rate: 0.5,
      lying: 45,
      last: [90, 180],
      grass: 0.9,
      kinds: [
        {
          share: 1, glyphs: ".,·", color: [0.17, 0.05, 0.04], color2: [0.09, 0.03, 0.03],
          size: [0.13, 0.19], fall: [0.4, 0.7], slip: 0.12, flutter: [0.8, 1.6], spin: 1.2, tau: 0.6,
          lift: [2.2, 4.0], carry: 0.9, hop: 0.6, lie: 0.6, alpha: 0.8, from: [3, 6],
          where: { at: 'flat', r: 15, out: 0.55 }, source: 'sky',
        },
      ],
    },

    // the badlands ring: grit and dry grass seed that tumble ACROSS the ring on the plateau wind and
    // collect against the kerb; little stays elsewhere
    ring: {
      takes: ['leaves'],
      rate: 3,
      lying: 110,
      last: [40, 90],
      grass: 0.9,
      kerb: 14.8,
      shelter: 1.5,
      kinds: [
        {
          share: 0.7, glyphs: ".,:", color: [0.26, 0.19, 0.12], color2: [0.18, 0.13, 0.08],
          size: [0.13, 0.19], fall: [2.2, 3.2], slip: 0.1, flutter: [2, 4], spin: 5, tau: 0.18,
          lift: [0.8, 2.6], carry: 0.6, hop: 0.7, lie: 0.6, alpha: 0.8, from: [0.05, 0.15],
          where: { at: 'kerb', base: 0.25, pile: 3, depth: 1.4, half: 15 }, source: 'edge',
        },
        {
          share: 0.3, glyphs: "`'~", color: [0.3, 0.25, 0.14], color2: [0.22, 0.18, 0.1],
          size: [0.16, 0.22], fall: [1.1, 1.6], slip: 0.2, flutter: [2, 3.5], spin: 4, tau: 0.25,
          lift: [1.0, 2.8], carry: 0.7, hop: 0.9, lie: 0.55, alpha: 0.8, from: [0.05, 0.2],
          where: { at: 'kerb', base: 0.25, pile: 3, depth: 1.4, half: 15 }, source: 'edge',
        },
      ],
    },

    // the hill shrine: every tree is dead, so dry leaves (brown, grey) and pale paper slips from the
    // charm posts at r 16.5; they lie on the paving and skitter when the breeze sighs
    fox: {
      takes: ['leaves'],
      rate: 1.2,
      lying: 120,
      last: [80, 160],
      grass: 0.95,
      kinds: [
        {
          share: 0.78, glyphs: ",'~`", color: [0.22, 0.17, 0.11], color2: [0.15, 0.13, 0.11],
          size: [0.18, 0.25], fall: [0.6, 1.0], slip: 0.5, flutter: [1.6, 2.8], spin: 2.6, tau: 0.5,
          lift: [2.2, 3.8], carry: 0.85, hop: 1.3, lie: 0.55, alpha: 0.85, from: [4, 7],
          where: { at: 'rim', lo: 0.3, r0: 8, r1: 18 }, source: 'sky',
        },
        {
          share: 0.22, glyphs: '-=_', color: [0.34, 0.32, 0.27], color2: [0.27, 0.25, 0.21],
          size: [0.17, 0.23], fall: [0.45, 0.7], slip: 0.7, flutter: [1.4, 2.4], spin: 3.2, tau: 0.6,
          lift: [1.9, 3.2], carry: 0.9, hop: 1.5, lie: 0.5, alpha: 0.8, from: [1.6, 3],
          where: { at: 'near', r: 16.5, angles: [24, -24, 60, -60, 130, -130, 160, -160], spread: 2.6, lo: 0.04 },
          source: 'sky',
        },
      ],
    },

    // the grove holds its breath: single bamboo leaves straight down, one at a time, turning, long
    // pauses between them; they lie on the earth and move only when the hero passes
    grove: {
      takes: ['leaves'],
      rate: 0.3,
      lying: 70,
      last: [140, 260],
      grass: 0.9,
      kinds: [
        {
          share: 1, glyphs: "-~`'", color: [0.13, 0.22, 0.1], color2: [0.18, 0.2, 0.1],
          size: [0.2, 0.26], fall: [0.45, 0.6], slip: 0, flutter: [1.0, 1.6], spin: 1.8, tau: 0.6,
          lift: [2.6, 4.4], carry: 1, hop: 1.1, lie: 0.55, alpha: 0.85, from: [6, 9],
          where: { at: 'rim', lo: 0.35, r0: 5, r1: 15 }, source: 'sky',
        },
      ],
    },
  },
});
