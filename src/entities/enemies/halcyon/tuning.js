import { PLAYER_SCALE } from '../../player/model.js';
import { DUEL_WORLD } from '../duelist/worldTuning.js';
import { BEAM_TUNING } from '../ascendant/tuningBeam.js';

// Halcyon, the Last Saviour's numbers (ADR-154; COMBAT.md → "Halcyon"). Started from Tian Lei's (the
// closest relative: a bare-handed fighter with beams and thrown terrain; ascendant/tuning.js says why
// each shared number is what it is) and the Thousand-Body Fox's one-bar structure; changed where he is
// someone else: one bar, three phases, flight, his eyes, the city.
// Per-phase values are [P1, P2, P3]. Times in seconds, distances in metres.
export const TUNING = {
  name: 'HALCYON, THE LAST SAVIOUR',
  // the bar: sized so the fencing bot wins in about 150 - 210 s (tests/integration/city.mjs WIN)
  hp: 14000,
  phaseAt: [1, 0.66, 0.33],
  radius: 0.45,
  scale: PLAYER_SCALE * 1.12,
  bound: 13.5,

  // ---- tells (PBZ pace; Tian Lei's)
  flashLead: 0.26,
  minFirstWindup: 0.45,
  minHitGap: 0.34,
  windupScale: [1, 0.93, 0.86],
  recoveryScale: [0.95, 0.88, 0.82],
  close: { first: 3.2, next: 1.6, speed: 14 },
  // (the strike builders' reach: ascendant/moves.js reads ITS tuning's; these are his for his own zones)
  reach: { fist: 1.7, kick: 2.1, line: 2.2, lineW: 0.8 },

  // ---- posture
  posture: {
    max: [1100, 1250, 1400],
    hit: { light: 5, heavy: 16 },
    guard: { light: 8, heavy: 20 },
    regenDelay: 2.4,
    regenRate: 20,
    breakTime: 3.4,
    breakCritMult: 1.5,
  },
  guard: {
    arc: 1.31, raiseDelay: 0.16, windupOpen: 0.55, counterChance: [0, 0.35, 0.7, 1], countWindow: 2.5,
    crushPoise: 48, clashStop: 0.07, deflectStop: 0.1, recoverOpen: 0.55, evade: 0.4, wardLinger: 0.6,
  },
  trade: { posture: 1.5, push: 0.5 },
  camera: { within: 6.5, fade: 4, zoom: -6 },
  flinch: { breakOff: 2, window: 1.6, hitStun: 0.22 },
  hitStun: { light: { stop: 0.065, jolt: 0.65, push: 0.14, shudder: 0.045 }, heavy: { stop: 0.1, jolt: 1, push: 0.32, shudder: 0.07 }, critStop: 0.12, joltDecay: 5 },
  parts: { head: 1.3, body: 1, leg: 0.9 },
  execRange: 3.2,
  ghostepBehind: 1.5,
  execution: { damage: 260 },

  // ---- footwork: FLIGHT. He glides, he never walks (flight.js holds him at fly.hover between moves)
  move: {
    walk: 3.4, run: 8.5, sprint: 12, // (gliding: faster than the hero's 7.2 m/s sprint; kiting does not work)
    turn: [9, 10, 11], trackTurn: [14, 16, 17],
    band: [1.6, 2.8], // he hovers this close: within sword reach (the flight rule, ADR-154)
    sprintAt: 5, near: 1.1, backChance: 0.3, backstep: { dist: 2.2, time: 0.32 }, strafeSwitch: [0.7, 1.6],
  },
  idleGap: [[0.1, 0.3], [0.06, 0.2], [0.04, 0.14]],
  openingGap: [[0.12, 0.38], [0.08, 0.26], [0.08, 0.26]],
  chain: [0.55, 0.68, 0.78],
  pressure: {
    chainDepth: [4, 5, 6],
    chainRest: [[0.45, 0.75], [0.25, 0.45], [0.18, 0.36]],
    linkCut: 0.5, chainCut: 0.5,
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 3, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 13, 11], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6, closerBoost: 1.8,
    maxLive: [1, 2, 2],
    bias: { string: [1.5, 1.6, 1.6] },
    density: [1, 1.4, 1.6],
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.3, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 1.4, pad: 0.12 },
    // what tests/integration/city.mjs PACE asserts (the steady defender in god mode, the hero roaming
    // 2.5 - 9 m on the real plaza). Set from the first measure, 2026-11-22 (COMBAT.md "Halcyon")
    meter: { ramp: [1, 0.95, 0.85], rampMean: [1, 1.0, 0.9], minRate: [42, 46, 46], maxGap: [4.6, 4.4, 4.4] },
  },
  punish: { weight: 4 },
  fullDeflect: { minHits: 5, posture: 70 },
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.38, 0.38], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  damageScale: 1.1,
  transition: { ringRadius: 6, damage: 10, knockback: 6 },
  // struck out of the air he drops (brain.js T.airFall)
  airFall: { g: 26 },

  // ---- FLIGHT (flight.js; ADR-154's rule: every hurt sphere in sword reach between moves)
  fly: {
    hover: 0.5, // m off the floor in footwork (the engine tests zones and body circles only up to 0.6 m)
    ease: 6, // 1/s toward the hover height
    bob: 0.06, bobHz: 0.7,
    reach: 3.9, // above this he is out of sword reach (only inside a move: tests FLIGHT)
    // the out-of-reach stretch a move may make (tests FLIGHT): at most this long per phase
    maxOut: [2.6, 2.2, 2.2],
    recover: [0.8, 0.7, 0.6], // a move that leaves reach ends back at hover in at least this
  },
  // ---- the pass (Fly-By) and THE CRASH (flight.js): what a good answer buys
  pass: {
    back: [14, 18], // he backs off this far before he comes through
    speed: 40, // m/s through the hero at chest height
    y: 1.2,
    over: 6, // m past the hero he carries on
  },
  crash: {
    look: 12, // m along the deflected line: the first standing cover there takes him
    slide: 0.25, // s into it
    stun: [1.7, 1.4, 1.2], // s buried in it
    damage: 60, posture: 30,
    skid: 8, skidK: 0.6, // nothing on the line: he skids this far and is stunned x skidK
    power: 3.2, // BLUNT on the cover (his body through it)
  },
  // ---- his eyes (glare.js): heat from two points at his eyes
  glare: {
    tick: 0.18, active: 0.1, maxTicks: 3, thrown: 4,
    // cover: what the cover at the beam's end takes each world tick (a car holds the whole lit window
    // of a Stare: 6 x 0.3 x its metal's 0.9 under its 2.4, and burns)
    world: { every: 0.15, sweep: 1.4, cover: 0.3, trench: 0.6, trenchR: 0.6, step: 1.4, ignite: 0.7 },
    // The Stare: blue first contact; fixed at 0.76 of the windup; 22 x 1.0 m; lit 0.9 s
    stare: { windup: 1.0, len: 22, w: 1.0, lit: 0.9, fix: 0.76, first: { damage: 20, knockback: 4 }, tick: 7, push: 0.45 },
    // its perfect parry goes back into his eyes
    returned: { damage: 50, posture: 34, reel: 1.6 },
    // Red Glare: level at y 1.15, lit at the cue, an arc of 110 deg, 30 m long
    sweep: { windup: 1.1, len: 30, w: 1.2, y: 1.15, arc: 110, lit: 0.9, safe: 2.2, first: { damage: 24, knockback: 5 } },
    // Scorched Avenue (phase 2): up to 6 m, the line through the hero marked 0.6 s before, the foot runs at 16 m/s
    high: { windup: 1.3, rise: 6, mark: 0.6, speed: 16, r: 1.3, len: 24, damage: 26, knockback: 4 },
    // the transition's wild turn of the beam (3 m and above: nothing on the hero)
    wild: { y: 3.2, len: 22, turn: 1, dur: 1.2 },
    // phase 3: one short beam at each standing screen
    burn: { dur: 0.35, power: 6 },
  },
  // ---- the beam's drawing borrows Tian Lei's (fxBeam.js reads d.T.beam.look)
  beam: { ...BEAM_TUNING },

  // ---- terrain (terrain.js): cars thrown, towers, the falling sky, the statue's arm
  curb: { lift: 1.0, speed: 22, time: [0.5, 1.0], lead: 0.2, maxDelay: 0.4, hit: 1.8, find: 9, minFlight: 0.45, parryPosture: 10, power: 1.6, radius: 2.4, halves: 4 },
  tower: { flare: 0.9, every: 0, skid: 1.1, rise: 9 },
  sky: { carry: 2.2, mark: 1.6, r: 5.5, damage: 45, knockback: 6, every: 20, power: 4, crater: 3.2 },
  monument: { r: 5, power: 2.2 },
  grab: { up: 0.6, hold: 0.5, down: 0.3, height: 9, damage: 30, knockback: 3, cap: 1.6 },
  clap: { r: 7, power: 1.2, push: 9 },
  meteor: { from: 9, crater: 2.4, power: 2.6 },

  // ---- what his blows do to the world (POWER: 1 fells a tree)
  world: { ...DUEL_WORLD, pass: 2.4, dive: 2.6, throw: 1.6 },

  wakeRadius: 9,
};

/** Value for the phase (1-based) from a per-phase array, or the value itself. */
export function perPhase(v, phase) {
  return Array.isArray(v) ? v[Math.min(v.length, Math.max(1, phase)) - 1] : v;
}
