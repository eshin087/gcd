import { TUNING as ASH } from '../ashDisciple/tuning.js';

// Qian Yao, the Heaven-Fallen: his numbers (COMBAT.md → "Qian Yao, the Heaven-Fallen"; ADR-133).
// Per-phase values are [P1, P2, P3]. Times in seconds, distances in metres. He is HEAVY and deliberate
// where the Lord and Tian Lei are fast: more pressure by phase, not more damage. The shape is the Ash
// Disciple's (the reference duelist); what is his own is the sunlight (`sun`), his eyes (`gaze`), his
// flight (`fly`), the bored wells (`bore`) and what he does to the world (`world`).
export const TUNING = {
  name: 'QIAN YAO, THE HEAVEN-FALLEN',
  hp: 7000, // (a 95 % bot that only defends wins in about 90 s: tests/integration/fallen.mjs DEFEND; the owner sets the length)
  phaseAt: [1, 0.66, 0.33], // one bar, three phases with gates (as Shen Hui; not the Lord's lives)
  radius: 0.5, // the tallest man in the game
  scale: 1.4, // drawn size (visual only; the hero is 1.0 x HERO_SCALE)
  bound: 13.2,

  // ---- tells (COMBAT.md; checked by tests/integration/fallen.mjs `data`)
  flashLead: 0.3,
  minFirstWindup: 0.55, // a move's first real hit, every phase (authored >= 0.64: x 0.86 in phase 3)
  minHitGap: 0.42, // impact to impact inside a move
  windupScale: [1, 0.92, 0.86],
  recoveryScale: [1, 0.9, 0.82],
  close: { first: 3.0, next: 1.4, speed: 11 },

  // ---- posture (POSTURE.parry in combat/rules.js for parries). Radiant, it neither regenerates nor
  // breaks: it HOLDS at its maximum and he breaks the frame his light is out (fallen.js)
  posture: {
    max: [360, 420, 440],
    hit: { light: 5, heavy: 16 },
    guard: { light: 8, heavy: 20 },
    regenDelay: 2.8,
    regenRate: 18,
    breakTime: 3.2,
    breakCritMult: 1.5,
  },
  guard: { ...ASH.guard, counterChance: [0, 0.3, 0.6, 1] },
  trade: { posture: 1.5, push: 0.4 },
  camera: { within: 7, fade: 4, zoom: -5 },
  flinch: { breakOff: 2, window: 1.6, hitStun: 0.22 },
  hitStun: { light: { stop: 0.065, jolt: 0.55, push: 0.1, shudder: 0.04 }, heavy: { stop: 0.1, jolt: 0.9, push: 0.25, shudder: 0.06 }, critStop: 0.12, joltDecay: 5 },
  parts: { head: 1.3, body: 1, leg: 0.9 },
  execRange: 3.6,
  ghostepBehind: 1.8,
  execution: { damage: 280 },

  // ---- footwork: he hovers 0.35 m over the floor (fly.hover) and drifts; outside striking range he
  // glides in fast (a melee hero is never left waiting)
  move: {
    walk: 2.0,
    run: 5.4,
    sprint: 8.8,
    turn: [7, 8, 9],
    trackTurn: [12, 13.5, 15],
    band: [2.0, 3.6],
    sprintAt: 6,
    near: 1.2,
    backChance: 0.25,
    backstep: { dist: 2.2, time: 0.4 },
    strafeSwitch: [1.0, 2.2],
  },
  idleGap: [[0.18, 0.4], [0.12, 0.3], [0.06, 0.2]],
  openingGap: [[0.16, 0.4], [0.12, 0.3], [0.1, 0.28]],
  chain: [0.5, 0.62, 0.74],
  pressure: {
    chainDepth: [3, 4, 5],
    chainRest: [[0.5, 0.8], [0.35, 0.6], [0.2, 0.45]],
    linkCut: 0.55,
    chainCut: 0.55,
    near: 3.4, far: 6.5, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 3, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 13, 10], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6.5, closerBoost: 1.8,
    maxLive: [1, 2, 2],
    bias: { string: [1.3, 1.4, 1.5] },
    density: [1, 1.3, 1.6],
    mixed: 0.1,
    holdGap: 5,
    // the fairness guard: two cues needing different answers never within `sep` s (+ `margin`)
    guard: { sep: 0.4, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 1.4, pad: 0.12 },
    // what tests/integration/fallen.mjs PACE asserts (see its comment for the measured runs)
    meter: { ramp: [1, 1.0, 1.0], rampMean: [1, 1.08, 1.08], minRate: [40, 48, 56], maxGap: [4.5, 4.5, 4.5] },
  },
  punish: { weight: 4 },
  fullDeflect: { minHits: 4, posture: 70 },
  lock: { start: 0.5, push: 0.085, decay: [0.3, 0.34, 0.38], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  damageScale: 1.1,

  // ---- the phase transitions: awaken2 (his eyes open: a red shock ring), awaken3 (he tears the sky:
  // the great well, and he comes down in it)
  transition: { ringRadius: 6, damage: 12, knockback: 6, landRadius: 4 },

  // ---- THE SUNLIGHT (ADR-133; COMBAT.md "The sunlight rule")
  sun: {
    fill: 1.25, // k a second while he is inside an open pool, at any height
    linger: 8, // s a full charge takes to drain out of the light
    glance: 0.3, // the hero's damage on a radiant body
    parry: 0.2, // each parry of his blow takes this much light
    eclipse: 3.2, // s a PERFECT answer puts his light out (k 0, no refill even in a pool)
    starve: { eclipse: 4.5, posture: 90 }, // the lid shut on the pool he drinks in (or flies to)
    drinkBelow: 0.25, // he goes for a pool under this
    defend: { time: 2.5, weight: 3 }, // after the hero chips a windlass his gap closers weigh more
    glanceStop: 0.035, // the hit-stop of a cut that glances
  },

  // ---- HIS EYES (gaze.js; drawn in the fire field: fxGaze.js)
  gaze: {
    eyeY: 1.92, // m over his root where the beams leave (his eyes, drawn at scale 1.4)
    focus: { len: 16, w: 1.1, fix: 0.85, first: { damage: 22, knockback: 3 } },
    sweep: { len: 12, w: 1.1, arc: 110, dur: 0.9, blind: 2.2, damage: 24, knockback: 3.5 },
    high: { len: 14, r: 1.1, speed: 10, before: 5, mark: 0.55, damage: 22, knockback: 3.5 },
    returned: { damage: 50, posture: 34 }, // a perfect parry sends Heaven's Gaze back
    blockPush: 0.5,
    worldEvery: 0.1, // s between the beam's bites on the world while lit
    look: { core: 1.0, sheath: 1.0 },
  },
  // the molten seam the cut leaves from phase 2 (seams.js; the recipe of the Ash Disciple's burning ground)
  seam: { life: [0, 3.5, 5], grace: 0.3, tick: 0.5, damage: 6, guard: 30, width: 0.8, pool: 10, step: 1.3 },

  // ---- flight (fallen.js, moves.js): he hovers in his footwork; aloft only inside a move, and every
  // aloft move ends on the floor in a recovery of at least 0.9 s
  fly: { hover: 0.35, apex: 4.6, descend: 9, drink: { speed: 13, hold: 0.9, height: 1.6 } },
  airFall: { g: 26 },

  // ---- the bored wells (He Opens the Sky; the great well)
  bore: {
    life: [0, 12, 16], // s a bored pool stays open, by phase
    cap: [0, 1, 2], // bored pools alive at once, by phase
    cooldown: 18,
    stones: [0.9, 1.25, 1.6], // s after the breach each stone lands
    stoneR: 1.5, stoneDamage: 20, stoneSpread: 5,
    greatLife: 18, greatEvery: 30, // the great well (phase 3): s open / s before he may tear it again
    awakenLife: 14, // the pool phase 2's awakening bores over him
  },

  // ---- what he does to the world (ADR-107; the gaze's numbers: COMBAT.md "The world breaks")
  world: { per: 40, red: 1.25, gaze: 0.7, ignite: 0.8, dive: 1.6, passage: 1.0, rubble: 1.0, strike: 1.0, bolt: 0.8, grip: 1.2 },

  wakeRadius: 9,
};
