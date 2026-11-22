// The fire field's looks (render/fireField.js, ADR-113): data, not logic. One block per kind of heat.
//
// A heat value h runs from 0 (nothing) through ~0.4 (the cool rim), ~1 (the body) to 2+ (the heart,
// where many blobs overlap). `stops` are the five linear HDR colours the letters take along that
// run (rim, low, body, hot, heart); they are multiplied by `hdr`.
//   hdr    overall brightness. Kept low on purpose: the owner called big bright letters "way too
//          flashy", and above ~1 the bloom swallows the digits.
//   fill   how much of the colour fills the cell behind the letter in the body
//   back   [rim, body] opacity of the dark backing behind each letter (the house style: a dark body
//          with brighter digits; it is what keeps the fire readable over lit grass)
//   lick   how far the heat climbs above its source as tongues (0 = none)
//   erode  how hard noise tears the cool rim into separate tongues (0 = a smooth edge)
//   boil   letter re-rolls per second (each cell on its own beat)
//   warp   how far (in cells) noise pushes the body about
//   haze   (optional) the colour the letters of the world take beside this heat (render/pipeline.js
//          heat haze; read for the void slot only)
// `steel` is the crisp kind (sparks, glints, cuts): no turbulence, and a thin line of it prints as
// the stroke character that runs along it.
export const FIRE_PALETTES = {
  fire: {
    stops: [[0.42, 0.016, 0.0], [1.1, 0.1, 0.006], [1.8, 0.44, 0.025], [2.4, 1.35, 0.2], [3.1, 2.8, 1.9]],
    hdr: 0.6, fill: 0.07, back: [0.5, 0.8], lick: 1.0, erode: 1.0, boil: 7, warp: 1.0,
  },
  void: {
    stops: [[0.34, 0.05, 0.8], [0.62, 0.1, 1.45], [1.05, 0.32, 2.05], [1.7, 1.15, 2.7], [2.8, 2.6, 3.2]],
    hdr: 0.6, fill: 0.07, back: [0.5, 0.8], lick: 0.6, erode: 1.0, boil: 9, warp: 1.0, haze: [0.62, 0.34, 1.0],
  },
  // GOLD (the Skybreak Ring: Tian Lei's energy). Not a kind of its own: a level swaps the void slot
  // for it (FireField.setPalette('void', FIRE_PALETTES.gold); the Lord's level never does). Energy,
  // not fire: an amber rim (no red in it), a gold body, a pale yellow-white heart; it boils fast and
  // climbs far less than flame (a blast stays a ball, a beam a beam: what rises is made to rise).
  gold: {
    stops: [[0.62, 0.36, 0.035], [1.25, 0.82, 0.1], [1.95, 1.48, 0.3], [2.5, 2.2, 0.85], [3.1, 3.0, 2.3]],
    hdr: 0.6, fill: 0.08, back: [0.45, 0.75], lick: 0.4, erode: 0.6, boil: 11, warp: 0.6, haze: [1.0, 0.78, 0.32],
  },
  // FOXFIRE (the Foxfire Terrace: Wen Yao's Pearl and mantle; ADR-131). Like gold, a swap of the void
  // slot (FoxFx). `foxfire` (?foxfire=a): jade, dark green strokes, jade digits, a pale mint heart (not
  // a cue's red, blue or black, not the wyrm's orange, not the Void's violet). `moon` (?foxfire=c): a
  // cold moon-white.
  foxfire: {
    stops: [[0.03, 0.3, 0.12], [0.1, 0.78, 0.36], [0.3, 1.45, 0.72], [0.95, 2.2, 1.35], [2.3, 3.1, 2.55]],
    hdr: 0.6, fill: 0.07, back: [0.5, 0.8], lick: 0.8, erode: 1.0, boil: 9, warp: 0.9, haze: [0.36, 0.95, 0.62],
  },
  moon: {
    stops: [[0.22, 0.26, 0.4], [0.6, 0.68, 0.92], [1.2, 1.3, 1.6], [2.0, 2.1, 2.4], [3.0, 3.05, 3.2]],
    hdr: 0.55, fill: 0.06, back: [0.5, 0.8], lick: 0.7, erode: 0.9, boil: 9, warp: 0.8, haze: [0.7, 0.78, 1.0],
  },
  steel: {
    stops: [[0.5, 0.5, 0.6], [1.2, 1.2, 1.32], [1.9, 1.88, 1.85], [2.7, 2.65, 2.55], [3.5, 3.4, 3.2]],
    hdr: 0.6, fill: 0.06, back: [0.3, 0.55], lick: 0, erode: 0, boil: 12, warp: 0,
  },
};

/** Smoke: dim grey letters where the fire has gone out. */
export const FIRE_SMOKE = { color: [0.085, 0.078, 0.074], back: 0.42 };

/** The kinds a blob can be (FireField.spawn's `kind`): each has its own channel of the heat buffer. */
export const FIRE_KIND = { fire: 0, smoke: 1, void: 2, steel: 3 };
