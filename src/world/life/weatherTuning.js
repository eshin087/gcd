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
/** the atmosphere's own low mist as it is today (atmosphere.js): wide, very faint strokes in a ring round
 *  the level; the weather draws it in place of the atmosphere (takes('mist')) while a band's value is up */
const VEIL = Object.freeze({
  rate: 3.2, r: [24, 44], y: [0.3, 1.2], life: [9, 14], size: [2.2, 4.2], sizeEnd: 4.8, alpha: 0.07,
  color: [0.2, 0.24, 0.3], glyph: MIST_GLYPH, view: [34, 26],
});
/** a bank of mist: a loose cluster of letters (`~ - =`, 0.4 - 0.6 m) that drifts as one with the air,
 *  comes in and goes out softly over seconds, and keeps clear of the hero. Drawn in the weather's own
 *  batch (weather.js WeatherBatch): `max` banks at once (x quality), `per` letters each.
 *  rate: banks born a second in view at full mist */
const BANK = Object.freeze({
  max: 12, rate: 1.4, per: [36, 46], spread: [4.2, 1.8], rise: 0.45, size: [0.5, 0.75], alpha: 0.44,
  life: [16, 24], fadeIn: 4, fadeOut: 5, color: [0.5, 0.55, 0.64], glyph: '~-=~-~', wobble: 0.25,
  heroClear: [0.5, 1.7],
});

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
  // (a level may carry `firstHold: [s, s]`: the calm spell's first hold of a visit, shorter, so the
  //  level shows what it does within the first seconds)
  /** spawns are kept this far (m) from the hero */
  heroGap: { mist: 2.5, fall: 0.8 },

  cinderwood: {
    calm: 'clear',
    spells: {
      clear: { hold: [55, 95], fade: [35, 50], next: [['mist', 3], ['drizzle', 1]], mist: 0.3 },
      mist: { hold: [40, 75], fade: [30, 45], next: [['clear', 3], ['drizzle', 2]], mist: 1, fogNear: 0.82, fogFar: 0.95, fogColor: 4, moon: 0.94 },
      drizzle: { hold: [30, 55], fade: [25, 35], next: [['clear', 1]], mist: 0.55, wet: 0.5, windK: 1.25, moon: 0.84, ambient: 0.92, fogNear: 0.9, fogFar: 0.96, fogColor: 2.5 },
    },
    // the low mist: today's faint veil, and as it thickens banks of small letters, more in the tree
    // line (r > 30) than in the clearing
    mist: {
      veil: VEIL, bank: BANK,
      bands: [{ key: 'mist', r: [12, 46], inner: [16, 30], innerK: 0.25, y: [0.9, 1.3], veil: 0.3 }],
      /** m/s: the drift when there is no wind to carry it (today's), and how much of the wind it takes */
      drift: [0.45, 0], carry: 0.4, view: [18, 15, -1],
    },
    // a thin rain: short dim strokes falling at the wind's slant
    rain: {
      rate: 160, area: [36, 28], y: [4.5, 8], fall: [7.5, 9.5], carry: 0.8, drift: [0.9, 0],
      size: 0.38, stretch: 1.3, color: [0.4, 0.44, 0.54], alpha: 0.42, alphaEnd: 0.2, glyph: '|',
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
      rate: 18, upwind: [10, 22], band: 5, wander: [8, 0.11], y: [0.2, 1.1], carry: 1.5, drift: [1.6, 0],
      rise: [0.2, 0.7], gravity: -0.06, drag: 0.08, life: [6, 9], size: 0.42, sizeEnd: 0.16,
      color: [2.4, 0.75, 0.15], colorEnd: [0.5, 0.07, 0.01], flicker: 0.35, glyph: "·'·.",
    },
    // the grey-out: more ash hanging in the air (fine, slow)
    grey: {
      rate: 13, area: [46, 34], y: [1, 7], fall: [0.3, 0.55], carry: 0.25, drift: [0.35, 0], life: [8, 11],
      size: 0.16, color: [0.34, 0.33, 0.31], colorEnd: [0.16, 0.15, 0.15], alpha: 0.8, glyph: ".,'`",
    },
  },

  starless: {
    calm: 'still',
    // (the first breath comes soon: a player standing at the spawn sees the crater breathe once)
    firstHold: [4, 7],
    spells: {
      still: { hold: [20, 36], fade: [8, 11], next: [['breath', 1]] },
      // the crater's dark warms with it (a breath of red in the fog and the ambient)
      breath: { hold: [2, 3.5], fade: [5, 7], next: [['still', 1]], breath: 1, ambient: 1.5, fogColor: 4.5, moon: 1.15 },
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
      max: 2, first: [3, 6], keepOut: 18, upwind: [14, 22], across: 9, south: 4, life: [10, 15], speed: 1.5, carry: 0.9,
      // the column: `letters` pale dust letters turning round it (rad/s), rising (m/s) and wrapping, a
      // funnel `radius` wide at the top, leaning downwind; soft as it gathers and falls apart
      letters: 64, height: [6, 8], radius: [1.6, 2.4], swirl: 2.2, rise: 1.1, lean: 0.14, fadeIn: 2, fadeOut: 3,
      size: [0.4, 0.6], color: [0.66, 0.56, 0.43], alpha: 0.7, glyph: "~-=,'`~",
    },
    // dry lightning far off: weather.flash (0..1), a soft brightening of the far side of the sky (the fog:
    // the horizon side of the frame) and a breath of the ambient; skybreakRing.js adds it
    bolts: { first: [2, 5], peak: [0.6, 1], rise: 20, decay: 2.6, double: 0.4, gap: [0.12, 0.22], fog: [0.17, 0.17, 0.21], ambient: [0.1, 0.105, 0.14], moon: [0.22, 0.24, 0.32] },
  },

  fox: {
    calm: 'moonlit',
    spells: {
      moonlit: { hold: [50, 90], fade: [25, 40], next: [['cloud', 3], ['groundmist', 2]], mist: 0.3 },
      cloud: { hold: [8, 20], fade: [20, 35], next: [['moonlit', 1]], mist: 0.3, moon: 0.75, ambient: 0.82 },
      groundmist: { hold: [45, 80], fade: [30, 45], next: [['moonlit', 1]], mist: 0.3, foot: 1, fogNear: 0.9, fogColor: 2.5 },
    },
    mist: {
      veil: VEIL, bank: { ...BANK, color: [0.34, 0.38, 0.48] },
      bands: [
        { key: 'mist', r: [24, 44], y: [0.6, 1.5], veil: 0.3 },
        // the terrace's foot, never on the paving (r 14) nor its steps
        { key: 'foot', r: [17, 24], y: [0.45, 1.2], veil: 0 },
      ],
      drift: [0.4, 0], carry: 0.35, view: [18, 15, -1],
    },
  },

  grove: {
    calm: 'still',
    spells: {
      still: { hold: [50, 85], fade: [35, 50], next: [['mist', 3], ['snow', 2]], mist: 0.3, snow: 0.3 },
      mist: { hold: [50, 80], fade: [35, 50], next: [['still', 1]], mist: 1, snow: 0.3, fogNear: 0.85, fogFar: 0.94, fogColor: 3 },
      snow: { hold: [60, 100], fade: [30, 40], next: [['still', 1]], option: 'c', mist: 0.3, snow: 1, moon: 0.94 },
    },
    // the mist pools low between the canes and does not drift (no wind here)
    mist: {
      veil: VEIL, bank: { ...BANK, color: [0.32, 0.4, 0.38], spread: [2.2, 1.4], wobble: 0.05 },
      bands: [{ key: 'mist', r: [6.5, 24], y: [0.2, 0.8], veil: 0.3 }],
      drift: [0, 0], carry: 0, view: [18, 15, -1],
    },
    // option c: snow straight down, slow, sparse
    snow: {
      option: 'c', rate: 9, area: [36, 28], y: [5, 9], fall: [0.5, 0.75], carry: 0, drift: [0, 0],
      size: 0.2, color: [0.55, 0.57, 0.63], alpha: 0.8, alphaEnd: 0.6, glyph: "·.'", spin: 1.2,
    },
  },
});
