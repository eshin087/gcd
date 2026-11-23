// THE CREATURES' NUMBERS (world/life/creatures.js). Content is data: every count, radius, colour and
// per-level choice lives here. A level without a block has no creatures.
//
// Colours are linear. Everything is dim (the house style: nocturnal, low saturation) except a firefly,
// which is the one bright thing, as it was before (atmosphere.js). Counts are scaled by life.quality and
// life.calm, speeds and pushes by life.k.

const FIREFLY = Object.freeze({
  glyph: '·',
  size: 0.2,
  /** the colour at full blink (HDR: a firefly is the one bright thing) */
  color: [1.6, 2.4, 0.6],
  /** the blink: max(0, sin(t * rate))^pow; a letter below `min` is not drawn */
  blinkRate: 1.9,
  blinkPow: 3,
  min: 0.05,
  /** its own wander (m/s) and how fast it eases back to where it lives (1/s) */
  wander: 0.6,
  home: 0.06,
  /** height above the ground, m */
  y: [0.5, 2.8],
  /** the hero: a soft push out of `r` m (`runR` while he runs), up to `push` m/s at his feet */
  r: 4,
  runR: 6,
  push: 2.6,
  /** how fast its push velocity follows what it wants (1/s) */
  ease: 3,
  /** how much of the wind's velocity carries it */
  wind: 0.3,
  /** a startle: m/s outward at k = 1 */
  flee: 4.5,
  /** ... and how fast that flight dies away (1/s) */
  fleeDecay: 0.7,
  /** life.hush dims it by this much at full hush */
  hush: 0.85,
});

const MOTH = Object.freeze({
  /** the two letters a moth flips between as it beats (the brief: ' , v) */
  glyphs: ["'", 'v'],
  /** beats per second (a range: each moth its own) */
  beat: [7, 11],
  size: 0.15,
  /** dim pale, drawn slightly warm by the fire */
  color: [0.5, 0.38, 0.24],
  alpha: 0.8,
  /** loose orbits round the flame: radius m, height m above the ground, angular speed rad/s */
  r: [0.6, 1.6],
  y: [0.8, 2.0],
  w: [0.9, 2.2],
  /** each on its own wobble: m of in-and-out and up-and-down, at Hz */
  wobble: 0.35,
  wobbleHz: [0.6, 1.6],
  /** the hero standing at the fire (within `near` m of the flame) scatters them; they come back */
  near: 1.4,
  /** a scattered moth's orbit grows by this factor and rises this many m; it fades by `fade` */
  scatterR: 3.2,
  scatterY: 1.4,
  fade: 0.7,
  /** fear rises at this rate (1/s) and falls away at this one, once he has left */
  fearUp: 3,
  fearDown: 0.25,
});

const SMALL_BIRD = Object.freeze({
  /** at rest: one letter, darker than the canopy it sits on */
  perched: ',',
  size: 0.28,
  restColor: [0.035, 0.04, 0.045],
  restAlpha: 0.85,
  /** in the air: the two wing letters and their beat (per s) */
  wings: ['v', '^'],
  beat: [6, 9],
  flyColor: [0.11, 0.12, 0.14],
  flyAlpha: 0.95,
  /** the take-off: horizontal m/s away from the cause, climb m/s, and how long it accelerates */
  speed: [6, 8.5],
  climb: [4, 6],
  /** each bird of a flock goes up to this many s after the first */
  stagger: 0.35,
  /** s in the air before it counts as gone (well out of the frame by then) */
  flight: 5,
  /** s away before it may come back to its perch (out of view) */
  away: [30, 60],
});

const CROW = Object.freeze({
  ...SMALL_BIRD,
  perched: 'v',
  size: 0.4,
  restColor: [0.022, 0.022, 0.026],
  restAlpha: 0.9,
  wings: ['v', '~'],
  beat: [3.2, 4.6],
  flyColor: [0.07, 0.07, 0.08],
  speed: [5, 7],
  climb: [3, 4.5],
  stagger: 0.5,
});

/** What makes a perched bird take off. */
const ALARM = Object.freeze({
  /** a hero running (speed m/s above `run`) within `r` m of the perch; any hero within `close` m */
  run: 3.4,
  r: 8.5,
  close: 3.5,
  /** a gust passing the perch: life.wind.at(...).k above this */
  gust: 0.55,
  /** the others perched within this many m of a bird that goes take off with it */
  flock: 4.5,
  /** how far apart the birds of one perch sit (m) */
  spread: 0.9,
});

/** Out of the game camera's view: a perch this far from the camera's focus (m, ground) may be refilled. */
const VIEW = Object.freeze({ x: 26, north: 22, south: 14 });

const HAWK = Object.freeze({
  glyph: 'v',
  flap: '^',
  /** a few beats now and then; mostly it glides */
  flapEvery: [5, 9],
  flapBeats: 3,
  flapRate: 5,
  size: 0.42,
  color: [0.06, 0.045, 0.035],
  alpha: 0.9,
  /** the circle: radius m, height m, s a lap. The game camera looks down at 58 degrees from 36 m: a
   *  thing high up shows farther north than its ground point, so the circle is centred `south` m south of
   *  the camera's focus (eased toward it over `follow` s) and this height keeps the whole lap in frame */
  r: 9,
  y: 6.5,
  lap: 25,
  south: 2,
  follow: 14,
  /** the shadow on the floor under it: a small dark letter, offset along the light, at most `maxOff` m */
  shadow: 'v',
  shadowSize: 0.3,
  shadowColor: [0.015, 0.011, 0.008],
  shadowAlpha: 0.55,
  maxOff: 3,
  /** the fight starts: it climbs away at these m/s, and is gone after `leave` s */
  leaveSpeed: 7,
  leaveClimb: 5,
  leave: 4,
});

const SPARK = Object.freeze({
  glyph: '·',
  size: 0.12,
  color: [0.9, 0.16, 0.05],
  /** slow orbits round a vent: radius m, height m, rad/s */
  r: [0.7, 1.4],
  y: [0.4, 1.4],
  w: [0.25, 0.5],
  /** a slow fade in and out (per s) */
  pulse: [0.3, 0.6],
});

export const CREATURES_TUNE = Object.freeze({
  firefly: FIREFLY,
  moth: MOTH,
  birds: Object.freeze({ small: SMALL_BIRD, crow: CROW }),
  alarm: ALARM,
  view: VIEW,
  hawk: HAWK,
  spark: SPARK,
  /** a level's creatures (what is missing there is not built) */
  levels: Object.freeze({
    cinderwood: Object.freeze({
      // as before (70 at r 22 - 46), and some inside the clearing's rim
      fireflies: { n: 58, r: [22, 46], inner: 14, innerR: [14, 27] },
      moths: { n: 4 },
      // small birds on the tree wall: perches on the canopies of trees at r 31 - 38
      birds: { kind: 'small', kinds: ['tree'], r: [31, 38], groups: 7, perGroup: [2, 4], yK: 0.82, inK: 0.55 },
    }),
    ash: Object.freeze({
      moths: { n: 3 },
      // crows on the pillar ring (every 5.2 m at 15.6), the gate and the ruined hall's columns
      birds: { kind: 'crow', kinds: ['pillar'], r: [0, 30], minH: 1.6, groups: 6, perGroup: [1, 3], yK: 1, inK: 0 },
    }),
    starless: Object.freeze({
      // nothing alive. A few dim sparks orbiting the vents (THRONE.vents)
      sparks: { perVent: 2 },
    }),
    ring: Object.freeze({
      moths: { n: 3, braziers: 2 },
      hawk: true,
    }),
    fox: Object.freeze({
      // foxfire: paler and bluer, and they keep a wider distance
      fireflies: { n: 50, r: [18, 44], inner: 8, innerR: [15, 22], color: [0.9, 1.7, 2.3], hr: 7, runR: 9 },
      moths: { n: 4 },
      birds: { kind: 'small', kinds: ['deadTree'], r: [15, 34], groups: 4, perGroup: [2, 3], yK: 0.85, inK: 0.2 },
    }),
    grove: Object.freeze({
      // they hang almost still, fewer
      fireflies: { n: 30, r: [10, 30], inner: 8, innerR: [7, 13], wander: 0.12, windK: 0 },
      moths: { n: 3 },
    }),
  }),
});
