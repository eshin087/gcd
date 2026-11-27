import { PLAYER_SCALE } from '../../player/model.js';
import { DUEL_WORLD } from '../duelist/worldTuning.js';
import { BEAM_TUNING } from '../ascendant/tuningBeam.js';
import { TUNING_MELEE } from './tuningMelee.js';
import { TUNING_SPELLS } from './tuningSpells.js';
import { TUNING_TERRAIN } from './tuningTerrain.js';

// Bai Wuji, the Untouched's numbers (the Veiled Crossing, `?level=veil`). Started from Halcyon's (the
// closest relative on the engine: a bare-handed duelist on Tian Lei's strike builders, one bar, three
// phases) with no flight; changed where he is someone else: the barrier (wjBarrier), the weight of every
// blow (wjWeight), the throw through the world (wjCrash), the pull (wjPull), the domain (wjDomain).
// The moves agents add their own numbers in tuningMelee.js / tuningSpells.js / tuningTerrain.js (merged
// below: one object, `TUNING.melee` / `TUNING.spells` / `TUNING.terrain`), never here.
// Per-phase values are [P1, P2, P3]. Times in seconds, distances in metres.

export const TUNING = {
  name: 'BAI WUJI, THE UNTOUCHED',
  // the bar. Round 3 (the owner after playing: "takes forever to do damage to him"; their answer, "the
  // barrier opens easier", hp back near 20000; a good player wins in about three minutes): 26000 -> 20000
  // with wjBarrier's cracks 2, longer openings and openDamage (bench.mjs, six seeds, the table in
  // ADR-250). Round 2: 26000 put the perfect answerer at 234 - 245 s and the fencing bot at 2 wins in 6.
  hp: 20000,
  // one bar, three phases: 66 % THE BLINDFOLD COMES OFF, 30 % THE MEASURELESS
  phaseAt: [1, 0.66, 0.3],
  radius: 0.45,
  scale: PLAYER_SCALE * 1.12,
  bound: 13.5,

  // ---- tells: no lower than the hardest duelist's today (Tian Lei, ascendant/tuning.js: 0.26 / 0.40 /
  // 0.34; the Starless Lord's are the same lead and first windup)
  flashLead: 0.26,
  minFirstWindup: 0.4,
  minHitGap: 0.34,
  // (phase 3, inside the void: everything faster; realise scales every unfixed windup, the minimums
  // still hold: tests/integration/veil.mjs DATA)
  windupScale: [1, 0.92, 0.84],
  recoveryScale: [0.8, 0.7, 0.64], // (the integration pass: 0.95 / 0.85 / 0.74 before; veil.mjs PACE)
  close: { first: 3.2, next: 1.6, speed: 14 },
  reach: { fist: 1.7, kick: 2.1, line: 2.2, lineW: 0.8 },

  // ---- posture (as on every duelist)
  posture: {
    max: [1000, 1150, 1300],
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

  // ---- footwork: he WALKS (no hover); he closes a gap by a blink (wjBlink), not a run
  move: {
    walk: 2.6, run: 6.5, sprint: 9,
    turn: [9, 10, 11], trackTurn: [14, 16, 17],
    band: [1.6, 3.0],
    sprintAt: 5, near: 1.1, backChance: 0.25, backstep: { dist: 2.2, time: 0.32 }, strafeSwitch: [0.7, 1.6],
  },
  idleGap: [[0.12, 0.34], [0.06, 0.2], [0.03, 0.1]],
  openingGap: [[0.14, 0.4], [0.08, 0.26], [0.06, 0.2]],
  chain: [0.5, 0.66, 0.78],
  pressure: {
    chainDepth: [4, 5, 7], // (the integration pass: 3 in phase 1 before; veil.mjs PACE)
    chainRest: [[0.28, 0.5], [0.2, 0.38], [0.12, 0.28]], // (phase 1 0.45 - 0.75, phase 2 0.25 - 0.45 before)
    linkCut: 0.5, chainCut: 0.5,
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 3, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 13, 11], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6, closerBoost: 1.8,
    maxLive: [1, 2, 2],
    bias: { string: [2.2, 1.8, 1.8] }, // (the integration pass: 1.5 / 1.6 / 1.6 before)
    density: [1.6, 1.8, 2.0], // (the integration pass: 1 / 1.4 / 1.9 before the spells and the terrain joined; veil.mjs PACE)
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.3, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 1.4, pad: 0.12 },
    // THE PURSUIT (duelist/brain.js header; Tian Lei's numbers): a blow whose reach the hero has left
    // breaks off before its glint and he chases (a far link, a blink opener); a hero backing away is
    // stepped in on harder. (His blows out of a blink and his spells reach anywhere: never broken off.)
    pursue: { margin: 0.5, after: 0.06, gap: 0.06, closeK: [1.0, 1.6, 1.6], dashK: [1.0, 1.5, 1.5], away: 1.2, leapLead: 0.35, blinkLead: 0.4, blinkKeep: 0.6, miss: 0, lead: 0.6, habit: 0.6, habitMax: 3, habitDecay: 0.1 },
    // what tests/integration/veil.mjs PACE asserts: none yet (the tuning agent sets `meter` from the
    // bots: { ramp, rampMean, minRate, maxGap }); without it the suite measures only
  },
  punish: { weight: 4 },
  fullDeflect: { minHits: 5, posture: 70 },
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.38, 0.38], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  // (his blows 35 - 60 % above Halcyon's for the same kind: Halcyon's 1.1 x 1.4)
  damageScale: 1.54,
  transition: { ringRadius: 6, damage: 0, knockback: 7, blockPush: 4, power: 2.2 },
  airFall: { g: 26 },

  // ---- R1 THE UNREACHED (barrier.js)
  wjBarrier: {
    // the shell: this much off his body's hurt spheres (a hand's width): the blade stops there
    shell: 0.14,
    // (round 3: 4.0 / 3.2 / 2.6 before; the good bot's openings are mostly perfects and cracks: longer than
    // this measured no faster, 7 / 6 / 5 s with 6 / 5 / 4 by cracks: 201 - 217 s)
    open: [6, 5, 4.2], // s open after a perfect parry / a perfect dodge of any blow of his
    cracks: 2, // ordinary parries that open it (0: off; the owner, round 3: two; 4 before, 3 at first)
    openCracked: [5, 4.2, 3.4], // s open by cracks (2.4 / 2.0 / 1.6 before)
    // x the damage of every cut of the hero's that is not exact while it is open (barrier.scaled; round 3:
    // the owner's "the hero's cuts hit harder while it is open"; no new mark: the open ring and the damage
    // numbers read it). Round 3: 1.3: the good bot 241 - 249 s; 1.6: 195 - 240 s; 2: 179 - 211 s; 2.2 shipped.
    // Round 3b (take b, the glide, his default: faster strings out of blinks): 2.2 gave the good bot 2 wins
    // in 6 (159 - 173 s, its deaths with 3 - 30 % of his bar left); 2.35: 4 in 6, 153 - 199 s; 2.5: 6 in 6,
    // 147 / 166 / 191 s, the perfect bot 106 - 119 s untouched; hp 18000 at 2.2: 3 in 6; longer openings by
    // cracks (6 / 5 / 4): no change (the good bot opens him by cracks 1 - 3 times a fight)
    openDamage: 2.5,
    crackFade: 9, // s without a new crack: the cracks are gone
    // the stop on the hero's side: he is thrown back off the shell by this much (player.onGuarded push)
    push: 0.9,
    // two strikes in a row on the shell within `window` s: his counter (moves/melee.js `wjCounter`)
    counterAfter: 2, counterWindow: 2.2,
  },
  // ---- R2 WEIGHT: what a blow of his that lands / is blocked does, unless the beat says otherwise
  wjWeight: {
    knockback: { hand: 3, big: 7 }, // the floor of a landed blow's throw (a beat's own knockback wins when larger)
    blockPush: 3.4, // m a blocked blow slides the hero (a beat's `blockPush` wins)
    // of the hero's guard meter per blocked blow (a beat's `guardCost` wins: absolute points). The owner
    // (round 2): the THIRD block in a row knocks the guard open, never the second: 0.45 (two leave 10; the
    // third opens it up to 1 s after the second: the meter refills 60 a second from 0.8 s after a block, and
    // no cost breaks a third 1.3 s on without breaking a second 0.34 s on; veil.mjs WEIGHT). (0.4 at first; 0.5 in the first tuning pass opened it on the second.) A block costs no health.
    guardCost: 0.45,
  },
  // ---- R3 THROWN THROUGH THE WORLD (player.js reads the hit fields; these are his)
  wjCrash: { power: 3.2, damage: 6, minKb: 3 }, // (power: Halcyon's crash's 3.2, BLUNT: a car (2.4, metal) and a wall break behind him)
  // ---- R5 THE PULL (pull.js)
  wjPull: {
    max: 4, // knots at once
    // the drag at the knot's rim (m/s added to the hero's knock-back velocity each frame) and inside
    strength: 4.2, r: 9, falloff: 1, life: 1.6,
    // a roll ignores the pull (its own travel carries him out)
    rollK: 0,
  },
  // ---- the domain (domain.js; the P2 -> P3 transition)
  wjDomain: {
    sign: 1.5, // s of the hand sign (the transition's first beat)
    close: 1.0, // s of the closing sphere's red cue (its windup)
    r: 40, // the sphere's reach (the whole arena)
    hold: 0.95, // (the integration pass: 1.0 measured 1.22 s out of his hands with the blow's own stagger) s the caught hero is held (max 1.2: the owner's lock cap), the blow inside it
    blow: 0.3, // of the hero's max health: never lethal (at least 1 HP left)
    knockback: 6,
    escapeOpen: 2, // the escape opens the barrier for open[2] x this
  },

  // ---- HIS PATIENCE (patience.js; the tuning pass, round 2: the owner, a defender who never attacks must
  // not outlast him): `after` s without the hero's blade reaching him (a cut that lands or stops on the
  // barrier; a flurry) he stops waiting (the cue: his eyes burn for `cue` s, the unveiling's sound) and until
  // it does every blocked blow costs at least `guardCost` of the meter: one block knocks the guard open and
  // the next blow of the string lands in it. Measured (bench.mjs, the pace defender, six seeds, 600 s): without
  // it alive in every seed; after 20: dead in 102 - 383 s; after 30: 201 - 525 s (mean 363); after 40: 83 -
  // 518 s. guardCost 0.7 (two blocks): alive in every seed. (His later phases' moves picked early were tried as
  // the press: they made him easier to wait out.) No other bot goes 20 s without reaching him.
  // Round 3b (take b, the glide): after 30 the pace defender lived out 600 s on one seed of six (588 s; the
  // others 53 - 575 s); after 25: one alive too; after 20: dead in all six, 95 - 553 s (mean 325). A hero who
  // fights is never 20 s without reaching him (the bench's bots: 13 s at most). Why it is slow even so: one
  // block knocks the guard open, but his next blow lands in the opening about one time in ten.
  wjPatience: { after: 20, cue: 1.2, guardCost: 1 },

  // ---- the beam's drawing borrows Tian Lei's (fxBeam.js reads d.T.beam.look)
  beam: { ...BEAM_TUNING },
  // ---- the moves agents' numbers
  melee: TUNING_MELEE,
  spells: TUNING_SPELLS,
  terrain: TUNING_TERRAIN,
  // ---- what his blows do to the world (POWER: 1 fells a tree)
  world: { ...DUEL_WORLD },

  wakeRadius: 9,
};

/** Value for the phase (1-based) from a per-phase array, or the value itself. */
export function perPhase(v, phase) {
  return Array.isArray(v) ? v[Math.min(v.length, Math.max(1, phase)) - 1] : v;
}
