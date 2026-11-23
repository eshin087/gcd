import { PLAYER_SCALE } from '../../player/model.js';
import { SHOTS_TUNING } from './tuningShots.js';
import { BEAM_TUNING } from './tuningBeam.js';
import { TERRAIN_TUNING } from './tuningTerrain.js';

// Tian Lei's numbers (MOVES.md: the approved moveset, 2026-11-21). Starting values: tune them in the
// Lab. Per-form values are [form 1, 2, 3]. Times in seconds, distances in metres.
//
// Three forms, each with its own health bar (the Starless Lord's `lives` structure):
//   1  the Challenger (no aura)   2  Golden Ascension   3  Thunder Ascension
// A bar emptied, or his posture broken, leaves him on one knee: the deathblow (the hero's execution)
// ends that form and he TRANSFORMS into the next (ascend2 / ascend3); the third deathblow kills him.
// Harder forms mean more pressure, not more damage (the owner's standing answer): the windups and
// recoveries shorten, the gaps between moves shrink, the strings lengthen; no blow hits harder.
export const TUNING = {
  name: 'TIAN LEI, THE LAST ASCENDANT',
  forms: 3,
  // each form's bar. Measured over ten seeds with the mortal bots (COMBAT.md "Tian Lei" → Measured): at
  // 1500 the 95 % bot's fight is 48 s; at 2000 (with the meter below) 66 s and the 85 % bot wins 4 of 10;
  // at 4000 108 s, and the weaker bots die in form 1. The fight's length is the owner's to set after
  // playing it: these two numbers and `flurry.posture` are the levers.
  hp: 2000,
  phaseAt: [1], // no gates inside a bar
  radius: 0.42,
  // his drawn size: 1.12 x the hero's (visual only: every reach below is in gameplay metres)
  scale: PLAYER_SCALE * 1.12, // (the hero is drawn at PLAYER_SCALE, 1.08: he is ~1.21, between Shen Hui 1.2 and the Lord 1.32)
  // the circle he keeps to: the level's CONFIG.world.dragonBound (the ring's floor) caps it
  bound: 16,

  // ---- tells (COMBAT.md; checked by tests/integration/asc.mjs DATA). A string's follow-up windups
  // 0.34 s in form 1 down to ~0.29 s in form 3 (windupScale)
  flashLead: 0.26,
  minFirstWindup: 0.4,
  minHitGap: 0.34,
  windupScale: [1, 0.93, 0.86],
  recoveryScale: [0.9, 0.82, 0.74],
  close: { first: 3.0, next: 1.5, speed: 13 },

  // ---- reach (MOVES.md "The frame"): a fist 1.7 m, a kick 2.1 m, a palm thrust or a dash blow a
  // line 2.2 m (moves.js builders read them)
  reach: { fist: 1.7, kick: 2.1, line: 2.2, lineW: 0.8 },

  // ---- posture (the Sekiro rule, as the Lord's)
  posture: {
    max: [900, 1000, 1100], // (the first wave's [460, 520, 600] made a form 16 s for a parrying bot; [2400, 2700, 2900] with hp 4000 lost the weaker bots form 1: the lead's middle, 2026-11-21)
    hit: { light: 5, heavy: 16 },
    guard: { light: 8, heavy: 20 },
    regenDelay: 2.2,
    regenRate: 22,
    gainByHp: [0.45, 1.25],
    regenByHp: [1.5, 0.5],
    breakTime: 4.5,
    breakCritMult: 1.5,
    spared: { hp: 0.2, posture: 0.5 },
  },

  // ---- his guard (his forearms: the front arc, in footwork and early in a windup)
  guard: {
    arc: 1.31,
    raiseDelay: 0.16,
    windupOpen: 0.5,
    counterChance: [0, 0.4, 0.75, 1],
    countWindow: 2.5,
    crushPoise: 48,
    clashStop: 0.07,
    deflectStop: 0.1,
    recoverOpen: 0.5,
    evade: 0.5,
    wardLinger: 0.6,
  },
  trade: { posture: 1.5, push: 0.5 },
  camera: { within: 6.5, fade: 4, zoom: -6 },
  flinch: { breakOff: 2, window: 1.6, hitStun: 0.22 },
  hitStun: { light: { stop: 0.065, jolt: 0.6, push: 0.12, shudder: 0.045 }, heavy: { stop: 0.1, jolt: 1, push: 0.3, shudder: 0.07 }, critStop: 0.12, joltDecay: 5 },
  parts: { head: 1.3, body: 1, leg: 0.9 },

  // ---- the deathblow
  execRange: 3.4,
  ghostepBehind: 1.5,
  execution: { damage: 260 },

  // ---- footwork: he walks in striking range, runs beyond it, sprints past sprintAt; from form 2 he
  // DASHES past `dash.at` m (`dash`: ascendant.js), in form 3 he may vanish to close past `blink.far`
  move: {
    walk: 2.6,
    run: 6.2,
    sprint: 9.0,
    turn: [8, 9, 10],
    trackTurn: [14, 15, 16],
    band: [1.6, 3.2],
    sprintAt: 5.5,
    near: 1.0,
    backChance: 0.3,
    backstep: { dist: 2.0, time: 0.34 },
    strafeSwitch: [0.9, 2.0],
  },
  // the dash (form 2 on): past `at` m in his footwork he crosses the gap at `speed` m/s to `stop` m
  // short of the hero, an afterimage left where he started (fx.dashGhost); not more often than `every` s
  dash: { from: 2, at: 5.5, speed: 16, stop: 2.4, every: 2.2, max: 9 },
  // the closing blink (form 3): past `far` m he may vanish and stand `r` m from the hero (`chance` per
  // look, every `every` s at most)
  closeBlink: { form: 3, far: 9, r: 2.4, chance: 0.5, every: 4 },
  idleGap: [[0.1, 0.3], [0.04, 0.12], [0.04, 0.13]],
  openingGap: [[0.14, 0.4], [0.1, 0.32], [0.08, 0.26]],
  chain: [0.55, 0.68, 0.7],
  // the director (duelist/brain.js header, director.js), starting from the Lord's forms 1 - 3
  pressure: {
    chainDepth: [4, 5, 7],
    chainRest: [[0.45, 0.75], [0.25, 0.45], [0.25, 0.45]],
    linkCut: 0.5,
    chainCut: 0.5,
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 2, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 14, 18], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6, closerBoost: 1.8,
    maxLive: [1, 2, 2],
    bias: { string: [1.2, 1.0, 1.2], closer: [1, 1, 1.1], area: [1.1, 1.6, 0.7], hazard: [1.2, 1.4, 0.7], terrain: [1.3, 1.6, 1.4], ranged: [1.1, 1.2, 1.3], spell: [1, 1, 1.3], single: [1, 1, 1.0] },
    density: [0.6, 0.7, 0.8],
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.4, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 0.8, pad: 0.18 },
    // THE PURSUIT (duelist/brain.js header; the owner: "make the boss also stop attacking empty air if
    // the player moves out of the distance"): a blow the hero has run out of the reach of breaks off
    // before its glint (`margin` m past what it can still reach, the hero led to its impact; from
    // `after` s into its windup) and he chases (a `far` / `away` link, else `gap` s, then his dash /
    // blink). A hero backing away (> `away` m/s) is chased with closeK x the step-in and dashK x a
    // dash's length, by form (the Challenger chases less: harder forms mean more pressure; at 1.6 / 1.5
    // in form 1 too, PACE's form 1 came out level with form 2). A leap lands `leapLead` s and a blink
    // arrives `blinkLead` s ahead of where the hero is going (never more than the blink's own distance
    // less `blinkKeep` m: still behind / beside him, never in front of a hero running away). A move
    // that cannot reach where he will be at its first blow (led `lead` s at most) weighs x `miss` (0: it
    // is not picked, nor linked). A hero who keeps running from his blows is READ: each break-off (+1,
    // `habitMax` at most, falling `habitDecay` a second) weighs the moves that reach wherever he goes
    // (blinks, leaps, ki, beams, long dashes) x (1 + `habit` x it).
    pursue: { margin: 0.5, after: 0.06, gap: 0.06, closeK: [1.25, 1.6, 1.6], dashK: [1.25, 1.5, 1.5], away: 1.2, leapLead: 0.35, blinkLead: 0.4, blinkKeep: 0.6, miss: 0, lead: 0.6, habit: 0.6, habitMax: 3, habitDecay: 0.1 },
    // what tests/integration/asc.mjs PACE asserts (the tuning pass, set from the WORST of ten seeds
    // 4242 7 99 1337 2024 11 23 555 808 31337 x 120 s a form, with a margin): cues a minute F1 79.7 /
    // 83.3 / 86.8, F2 83.9 / 88.2 / 92.8, F3 88.3 / 101.4 / 108.8 (min / mean / max); form over form
    // x1.059 / x1.151 in the mean, x0.975 / x1.017 on the worst seed; longest gap 2.70 / 3.13 / 2.95 s;
    // dodge 13 / 23 / 39 %; 0 conflicts. (Before the pass: 85.5 / 91.7 / 106.7, dodge 10 / 17 / 26 %,
    // F3's longest gap 3.94 s on seed 1337.) rampMean is checked on the suite's three seeds (4242 7 99):
    // there F2 / F1 x1.067, F3 / F2 x1.077.
    meter: { ramp: [1, 0.96, 0.98], rampMean: [1, 1.02, 1.05], minRate: [76, 80, 85], maxGap: [4.0, 3.8, 3.6] },
  },
  punish: { weight: 4 },

  // ---- the duel's moments
  fullDeflect: { minHits: 5, posture: 70 },
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.35, 0.38], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  // his flurry answered in full fills this share of his posture meter (1: it breaks him outright, the
  // engine's rule; the tuning pass: 0.6, see ascendant.js onStreakBlow)
  flurry: { posture: 1 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  damageScale: 1.1,

  // a reaction, a break or the death that starts in the air drops him (duelist/brain.js _ground)
  airFall: { g: 30 },

  // ---- the transformation (ascend2 / ascend3: 2.3 s, then a shock ring; nothing lands on him until
  // the ring goes out)
  transform: { windup: 2.3, ringRadius: 6.5, damage: 12, knockback: 7 },

  // ---- the third wave (moves/melee.js). THE SIGN before a vanish (ascendant.js beatMotion: he goes at
  // u 0.5): `behind` m behind the hero, or `side` rad round from his facing at `sideR` m (Three Signs);
  // after the arrival a short step of at most `step` m from u `stepFrom` into reach; a riposte's hop
  // back `hop` m. THE COUNTER STANCE (duelist/brain.js `stance`): its windup, bait hold, catching from
  // `from` of the windup, open `open` s when nothing was caught.
  sign: { behind: 2.0, side: 1.5, sideR: 2.2, step: 1.6, stepFrom: 0.55, hop: 1.5 },
  stance: { windup: 0.45, hold: [0.2, 0.4], from: 0.3, open: 0.6 },

  // ---- what flies (the second wave's ki moves read these; LordFx's pools need a `crescent` block)
  crescent: { speed: 14, radius: 0.7, life: 2.2, chip: 0.25 },

  // ---- the second wave's numbers, each in its own file (tuningShots.js, tuningBeam.js, tuningTerrain.js)
  shots: SHOTS_TUNING,
  beam: BEAM_TUNING,
  terrain: TERRAIN_TUNING,

  // ---- what his blasts and the disc do to the world they meet (ADR-107; fx.js; the duelist's other
  // fields fall back to duelist/worldTuning.js DUEL_WORLD)
  world: { blast: 0.8, bigBlast: 1.4, disc: 0.6 },

  // ---- he stands waiting, arms folded, until the hero steps onto the ring
  wakeRadius: 9,
};
