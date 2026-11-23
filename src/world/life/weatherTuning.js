// The weather's numbers (world/life/weather.js): one block per level id. A level without a block has no
// weather of its own (the layer does nothing there).
//
// A level:
//   calm        the spell every visit starts in, and the one the fight eases back to
//   spells      name → { hold: [s, s] how long it holds once in, fade: [s, s] how long it takes to come
//               in (the spell it replaces goes as this one comes), next: [[name, weight], ...] what may
//               follow (a spell whose `option` the set does not have is left out), and its VALUES (any
//               left out: 0, or 1 for a factor):
//                 mist 0..1     the low mist's thickness (weather.mist; the mist bands draw by it)
//                 foot 0..1     a second band of mist (the fox terrace's foot)
//                 wet 0..1      rain falling (weather.wet; the drizzle draws by it)
//                 windK         what the weather asks of the wind (weather.windK; 1 = nothing)
//                 moon, ambient the moonlight / ambient light, multiplied (a cloud on the moon)
//                 fogNear, fogFar, fogColor   the fog, multiplied (a grey-out pulls it in and greys it)
//                 embers 0..1   the ember squall's stream (ash)
//                 grey 0..1     the grey-out's extra ash in the air (ash)
//                 breath 0..1   the fallen star breathes: the seal swells, the motes quicken (starless)
//                 devils, bolts dust devils / dry lightning, a minute (ring, before the fight only)
//                 snow 0..1     snow falling straight down (grove, option c only)
//   sky         false: the layer never touches the light / fog uniforms here (a set's own ambience writes
//               them every frame)
//   mist / rain / embers / grey / snow / devils / bolts / breath    how each thing is drawn
//
// Rates are per second at quality 1, life.k 1, before the fight (life.calm 1); every rate is multiplied
// by life.quality, life.k and life.calm. Colours are linear and dim (the level's own hue).

const MIST_GLYPH = '~-';

export const WEATHER_TUNE = Object.freeze({
  /** a spell fades this fast when the Lab forces it (s) */
  labFade: 8,
  /** the director's values may move this much a frame at most (the test's epsilon, at 60 fps) */
  maxStep: 0.02,
  /** a factor this close to 1 is 1 (the uniforms are left alone) */
  idle: 1e-4,
  /** below this `life.calm` counts as the fight: no new spell, back to the calm one */
  fightCalm: 0.995,
  /** s: a spell not seen for this long weighs twice its weight when the director picks what follows */
  longing: 90,
  /** spawns are kept this far (m) from the hero */
  heroGap: { mist: 4, fall: 0.8 },

  cinderwood: {
    calm: 'clear',
    spells: {
      clear: { hold: [55, 95], fade: [35, 50], next: [['mist', 3], ['drizzle', 1]], mist: 0.3 },
      mist: { hold: [40, 75], fade: [30, 45], next: [['clear', 3], ['drizzle', 2]], mist: 1, fogNear: 0.88, fogFar: 0.9, moon: 0.94 },
      drizzle: { hold: [30, 55], fade: [25, 35], next: [['clear', 1]], mist: 0.55, wet: 0.5, windK: 1.25, moon: 0.84, ambient: 0.92, fogNear: 0.92, fogFar: 0.94 },
    },
    // the low mist: wide faint strokes; thicker in the tree line (r > 30) than in the clearing
    mist: {
      bands: [{ key: 'mist', r: [14, 46], inner: [20, 32], innerK: 0.25, y: [0.25, 1.2] }],
      rate: 10.5, life: [9, 14], size: [2.2, 4.2], sizeEnd: 4.8, alpha: 0.075,
      color: [0.2, 0.24, 0.3], glyph: MIST_GLYPH,
      /** m/s: the drift when there is no wind to carry it (today's), and how much of the wind it takes */
      drift: [0.45, 0], carry: 0.4, view: [34, 26],
    },
    // a thin rain: short dim strokes falling at the wind's slant
    rain: {
      rate: 210, area: [44, 32], y: [4.5, 8], fall: [7.5, 9.5], carry: 0.8, drift: [0.9, 0],
      size: 0.24, stretch: 1.1, color: [0.3, 0.34, 0.42], alpha: 0.36, alphaEnd: 0.18, glyph: '|',
    },
  },

  ash: {
    calm: 'ashfall',
    sky: true,
    spells: {
      ashfall: { hold: [50, 85], fade: [30, 45], next: [['squall', 3], ['greyout', 2]] },
      squall: { hold: [15, 25], fade: [12, 18], next: [['ashfall', 1]], windK: 1.6, embers: 1 },
      greyout: { hold: [40, 65], fade: [30, 45], next: [['ashfall', 1]], grey: 1, fogNear: 0.55, fogFar: 0.66, fogColor: 2.2, ambient: 1.08, moon: 0.86 },
    },
    // glowing embers lifted off the ruins and carried across the yard in a loose stream
    embers: {
      rate: 20, upwind: [12, 20], band: 5, wander: [8, 0.11], y: [0.2, 1.1], carry: 1.5, drift: [1.6, 0],
      rise: [0.25, 0.8], gravity: -0.08, drag: 0.08, life: [4, 7], size: 0.1, sizeEnd: 0.04,
      color: [1.5, 0.46, 0.09], colorEnd: [0.35, 0.05, 0.01], flicker: 0.5, glyph: ".'·",
    },
    // the grey-out: more ash hanging in the air (fine, slow)
    grey: {
      rate: 13, area: [46, 34], y: [1, 7], fall: [0.3, 0.55], carry: 0.25, drift: [0.35, 0], life: [8, 11],
      size: 0.13, color: [0.27, 0.26, 0.25], colorEnd: [0.15, 0.15, 0.15], alpha: 0.6, glyph: ".,'`",
    },
  },

  starless: {
    calm: 'still',
    spells: {
      still: { hold: [20, 36], fade: [7, 10], next: [['breath', 1]] },
      breath: { hold: [1.5, 3], fade: [4, 6], next: [['still', 1]], breath: 1 },
    },
    // the set's ambience does the drawing (throneHall.js: ambience.breathe(k)): k = breath × this
    breath: { k: 1 },
  },

  ring: {
    calm: 'dusk',
    // (the ring's own ambience writes the light every frame: its far lightning reads weather.flash)
    sky: false,
    spells: {
      dusk: { hold: [45, 80], fade: [35, 50], next: [['gathering', 1]], devils: 1.6, bolts: 2.4 },
      gathering: { hold: [40, 70], fade: [30, 45], next: [['dusk', 1]], windK: 1.3, devils: 2.6, bolts: 5 },
    },
    // a loose rising column of the level's dust, crossing the badlands with the wind, never onto the ring
    devils: {
      max: 2, keepOut: 18, upwind: [14, 24], across: 16, life: [9, 14], speed: 1.5, carry: 0.9,
      rate: 30, height: [3, 5], radius: [0.9, 1.5], swirl: 2.4, rise: [0.9, 1.8], partLife: [0.8, 1.4],
      size: [0.12, 0.22], color: [0.3, 0.24, 0.19], colorEnd: [0.12, 0.09, 0.07], alpha: 0.55, glyph: ".,'`",
    },
    // dry lightning far off: weather.flash, a very faint flicker of the sky (skybreakRing.js adds it)
    bolts: { peak: [0.07, 0.13], decay: 16, double: 0.4, gap: [0.08, 0.16] },
  },

  fox: {
    calm: 'moonlit',
    spells: {
      moonlit: { hold: [50, 90], fade: [25, 40], next: [['cloud', 3], ['groundmist', 2]], mist: 0.3 },
      cloud: { hold: [8, 20], fade: [20, 35], next: [['moonlit', 1]], mist: 0.3, moon: 0.75, ambient: 0.82 },
      groundmist: { hold: [45, 80], fade: [30, 45], next: [['moonlit', 1]], mist: 0.3, foot: 1, fogNear: 0.92 },
    },
    mist: {
      bands: [
        { key: 'mist', r: [24, 44], y: [0.3, 1.2] },
        // the terrace's foot, never on the paving (r 14) nor its steps
        { key: 'foot', r: [17, 24], y: [0.15, 0.8], k: 0.9 },
      ],
      rate: 10.5, life: [9, 14], size: [2.2, 4.2], sizeEnd: 4.8, alpha: 0.075,
      color: [0.19, 0.22, 0.3], glyph: MIST_GLYPH, drift: [0.4, 0], carry: 0.35, view: [34, 26],
    },
  },

  grove: {
    calm: 'still',
    spells: {
      still: { hold: [50, 85], fade: [35, 50], next: [['mist', 3], ['snow', 2]], mist: 0.3, snow: 0.3 },
      mist: { hold: [50, 80], fade: [35, 50], next: [['still', 1]], mist: 1, snow: 0.3, fogNear: 0.85, fogFar: 0.92 },
      snow: { hold: [60, 100], fade: [30, 40], next: [['still', 1]], option: 'c', mist: 0.3, snow: 1, moon: 0.94 },
    },
    // the mist pools low between the canes and does not drift (no wind here)
    mist: {
      bands: [{ key: 'mist', r: [6.5, 24], y: [0.05, 0.55] }],
      rate: 8, life: [10, 15], size: [2, 3.6], sizeEnd: 4.2, alpha: 0.075,
      color: [0.17, 0.22, 0.2], glyph: MIST_GLYPH, drift: [0, 0], carry: 0, wobble: 0.06, view: [34, 26],
    },
    // option c: snow straight down, slow, sparse
    snow: {
      option: 'c', rate: 11, area: [44, 32], y: [5, 9], fall: [0.5, 0.75], carry: 0, drift: [0, 0],
      size: 0.13, color: [0.46, 0.48, 0.54], alpha: 0.75, alphaEnd: 0.6, glyph: "·.'", spin: 1.2,
    },
  },
});
