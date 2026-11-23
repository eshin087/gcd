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
//     glyphs    letters it is drawn with in the air (world atlas only)
//     ground    { glyphs, size } the letters it lies as (default: its air ones). The thin strokes
//               (, ' ` ~ - . :) all but vanish lying at the game camera (~1 px of ink at 0.3 m): a
//               letter that lies needs some body (c e s v ( ) < > [ ] =)
//     color     linear colour in the air at full brightness; color2: the other end of its tint
//     size      [min, max] m (at the game camera 0.3 m is ~6 px: smaller is a speck at most)
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
//     flat      (optional) it lies turned at most this many rad off the screen's horizontal
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
      rate: 4.5,
      lying: 170,
      last: [80, 160],
      grass: 1.15,
      kinds: [
        {
          share: 0.45, glyphs: "()cec", color: [0.3, 0.44, 0.2], color2: [0.22, 0.33, 0.15],
          size: [0.28, 0.34], ground: { glyphs: 'ce()v', size: [0.36, 0.44] }, fall: [0.42, 0.65], slip: 0.85, flutter: [1.4, 2.4], spin: 2.4, tau: 0.6,
          lift: [2.25, 3.5], carry: 1, hop: 1.5, lie: 0.85, alpha: 0.72, from: [4.5, 8],
          where: { at: 'rim', lo: 0.25, r0: 8, r1: 28 }, source: 'sky',
        },
        {
          share: 0.55, glyphs: "()cec", color: [0.42, 0.31, 0.16], color2: [0.32, 0.24, 0.12],
          size: [0.28, 0.34], ground: { glyphs: 'ce()s', size: [0.36, 0.44] }, fall: [0.45, 0.7], slip: 0.8, flutter: [1.5, 2.6], spin: 2.8, tau: 0.55,
          lift: [2.15, 3.4], carry: 1, hop: 1.5, lie: 0.85, alpha: 0.72, from: [4.5, 8],
          where: { at: 'rim', lo: 0.25, r0: 8, r1: 28 }, source: 'sky',
        },
      ],
    },

    // the burned sect: ash everywhere, as today's ashfall (26 flakes/s, grey, `.,'\``), but it lands,
    // lies thicker in the lee of pillars, lanterns and statues (their east and north sides), and is
    // kicked up by feet. Ash melts into the floor sooner than a leaf.
    ash: {
      takes: ['ash'],
      // (fewer, flatter letters lying in drifts in the lee of what stands, clear floor between: a field of
      // round dots everywhere read as snow, or noise)
      rate: 18,
      lying: 240,
      last: [14, 28],
      grass: 0.9,
      shelter: 0.3,
      kinds: [
        {
          share: 1, glyphs: ".,'`", color: [0.42, 0.41, 0.39], color2: [0.33, 0.32, 0.3],
          size: [0.12, 0.22], ground: { glyphs: '~-=~_', size: [0.34, 0.44] }, fall: [0.55, 0.9], slip: 0.3, flutter: [1.2, 2.4], spin: 0, tau: 0.45,
          lift: [1.9, 3.6], carry: 0.9, hop: 0.9, lie: 1.05, alpha: 0.85, from: [4, 9], flat: 0.22,
          where: { at: 'ash', base: 0.06, pile: 3, reach: 1.7, gap: 0.35, lee: [[1, 0], [0, -1], [0.7, -0.7]], within: 40, maxR: 3.5, tags: ['stone', 'boulder'] },
          source: 'sky',
        },
      ],
    },

    // the crater of a fallen star: fine black-red grit, sparse, lying as dim letters on the obsidian;
    // the air's slow draw toward the star moves what is in the air
    starless: {
      takes: ['leaves'],
      // (the dark grit was invisible on the obsidian: a few cinders of the star instead, ember-edged)
      rate: 0.35,
      lying: 26,
      last: [90, 180],
      grass: 0.9,
      kinds: [
        {
          share: 1, glyphs: "o·*", color: [0.66, 0.17, 0.06], color2: [0.46, 0.1, 0.05],
          size: [0.2, 0.26], ground: { glyphs: 'oc*', size: [0.24, 0.3] }, fall: [0.4, 0.7], slip: 0.12, flutter: [0.8, 1.6], spin: 1.2, tau: 0.6,
          lift: [0.8, 1.5], carry: 0.9, hop: 0.6, lie: 0.6, alpha: 0.8, from: [3, 6],
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
          share: 0.7, glyphs: "o:co", color: [0.54, 0.45, 0.32], color2: [0.44, 0.36, 0.25],
          size: [0.2, 0.26], fall: [2.2, 3.2], slip: 0.1, flutter: [2, 4], spin: 5, tau: 0.18,
          lift: [0.8, 2.6], carry: 0.6, hop: 1.1, lie: 0.75, alpha: 0.62, from: [0.05, 0.15],
          where: { at: 'kerb', base: 0.25, pile: 3, depth: 1.4, half: 15 }, source: 'edge',
        },
        {
          share: 0.3, glyphs: "v(~", color: [0.58, 0.52, 0.34], color2: [0.48, 0.42, 0.27],
          size: [0.24, 0.3], fall: [1.1, 1.6], slip: 0.2, flutter: [2, 3.5], spin: 4, tau: 0.25,
          lift: [1.0, 2.8], carry: 0.7, hop: 1.3, lie: 0.7, alpha: 0.62, from: [0.05, 0.2],
          where: { at: 'kerb', base: 0.25, pile: 3, depth: 1.4, half: 15 }, source: 'edge',
        },
      ],
    },

    // the hill shrine: every tree is dead, so dry leaves (brown, grey) and pale paper slips from the
    // charm posts at r 16.5; they lie on the paving and skitter when the breeze sighs
    fox: {
      takes: ['leaves'],
      rate: 3,
      lying: 130,
      last: [80, 160],
      grass: 1.15,
      kinds: [
        {
          share: 0.78, glyphs: "()cec", color: [0.42, 0.33, 0.2], color2: [0.32, 0.27, 0.2],
          size: [0.28, 0.34], ground: { glyphs: 'ce()s', size: [0.36, 0.44] }, fall: [0.45, 0.7], slip: 0.8, flutter: [1.4, 2.4], spin: 2.6, tau: 0.55,
          lift: [1.8, 3.2], carry: 1, hop: 1.4, lie: 0.8, alpha: 0.72, from: [4, 7],
          where: { at: 'rim', lo: 0.3, r0: 8, r1: 18 }, source: 'sky',
        },
        {
          share: 0.22, glyphs: '=[]', color: [0.56, 0.53, 0.45], color2: [0.46, 0.43, 0.36],
          size: [0.3, 0.36], ground: { glyphs: '=[]', size: [0.4, 0.48] }, fall: [0.4, 0.6], slip: 0.9, flutter: [1.3, 2.2], spin: 3.2, tau: 0.6,
          lift: [1.6, 2.8], carry: 1, hop: 1.5, lie: 0.75, alpha: 0.72, from: [1.6, 3],
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
          share: 1, glyphs: "/\\()", color: [0.3, 0.44, 0.2], color2: [0.36, 0.4, 0.2],
          size: [0.3, 0.36], ground: { glyphs: '()<>', size: [0.4, 0.48] }, fall: [0.45, 0.6], slip: 0, flutter: [1.0, 1.6], spin: 1.8, tau: 0.6,
          lift: [1.4, 2.4], carry: 1, hop: 1.1, lie: 0.7, alpha: 0.72, from: [6, 9],
          where: { at: 'rim', lo: 0.35, r0: 5, r1: 15 }, source: 'sky',
        },
      ],
    },
  },
});
