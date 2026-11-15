// The fire field's looks (render/fireField.js, ADR-101): data, not logic. One block per kind of heat.
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
// `steel` is the crisp kind (sparks, glints, cuts): no turbulence, and a thin line of it prints as
// the stroke character that runs along it.
export const FIRE_PALETTES = {
  fire: {
    stops: [[0.42, 0.016, 0.0], [1.1, 0.1, 0.006], [1.8, 0.44, 0.025], [2.4, 1.35, 0.2], [3.1, 2.8, 1.9]],
    hdr: 0.6, fill: 0.07, back: [0.5, 0.8], lick: 1.0, erode: 1.0, boil: 7, warp: 1.0,
  },
  void: {
    stops: [[0.1, 0.02, 0.34], [0.4, 0.06, 1.0], [0.95, 0.3, 1.9], [1.6, 1.1, 2.6], [2.8, 2.6, 3.2]],
    hdr: 0.6, fill: 0.07, back: [0.5, 0.8], lick: 0.6, erode: 1.0, boil: 9, warp: 1.0,
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
