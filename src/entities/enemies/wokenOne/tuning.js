import { PLAYER_SCALE } from '../../player/model.js';

// Xin Yi's numbers (ADR-156; COMBAT.md → "The One Who Woke"). First values from the plan: tune them in
// the Lab and with the bots (tests/integration/woke.mjs PACE / STRATEGY). Per-phase values are
// [phase 1, 2, 3]. Times in seconds, distances in metres.
//
// TWO HEALTH BARS, THREE PHASES (lives: { total: 2 }): bar 1 holds phase 1 (the Sparring Hall, one hand)
// and phase 2 (the Pillared Hall, iron), the gate at half of it; bar 1 empty BREAKS him and the deathblow
// drops him flat (THE FALL): he lies, the hall turns to code from his body outward and he RISES with bar
// 2 full (phase 3, the Source). Harder means more pressure, never more damage (the owner's rule).
export const TUNING = {
  name: 'XIN YI, THE ONE WHO WOKE',
  bars: 2,
  hp: 3400, // bar 1 (phases 1 and 2)
  hp2: 2600, // bar 2 (phase 3)
  phaseAt: [1, 0.5, 0], // phase 1 → 2 at half of bar 1; phase 2 ends with the bar (the fall); none in phase 3
  radius: 0.42,
  // his drawn size: 1.1 x the hero's (visual only: every reach below is in gameplay metres)
  scale: PLAYER_SCALE * 1.1,
  bound: 16,

  // ---- tells (COMBAT.md; tests/integration/woke.mjs DATA). The floors every blow keeps
  flashLead: 0.26,
  minFirstWindup: 0.42,
  minHitGap: 0.32,
  windupScale: [1, 0.96, 0.92], // (the first windups are authored >= 0.46 s: x 0.92 keeps them over minFirstWindup)
  recoveryScale: [0.9, 0.82, 0.76],
  close: { first: 3.0, next: 1.5, speed: 13 },
  reach: { fist: 1.7, kick: 2.1, line: 2.2, lineW: 0.8 },

  // ---- posture (the Sekiro rule, as Tian Lei's: hard to move while the bar is full)
  posture: {
    max: [1000, 1100, 1200],
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

  // ---- his guard: THE LEAN (every phase until 3): the engine's guard, drawn as slips and back-leans
  // with one afterimage (fx.ghost). A look, not a new way to waste the hero's cuts.
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
    evade: 0.5, // (the engine's heavy-blow evade: in phase 2 it is THE BEND, at most once in bend.every s)
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

  move: {
    walk: 2.5,
    run: 6.0,
    sprint: 8.8,
    turn: [8, 9, 10],
    trackTurn: [14, 15, 16],
    band: [1.6, 3.4],
    sprintAt: 5.5,
    near: 1.0,
    backChance: 0.3,
    backstep: { dist: 2.0, time: 0.34 },
    strafeSwitch: [0.9, 2.0],
  },
  idleGap: [[0.12, 0.32], [0.06, 0.16], [0.03, 0.1]],
  openingGap: [[0.14, 0.4], [0.1, 0.32], [0.08, 0.26]],
  chain: [0.55, 0.65, 0.75],
  // the director (duelist/brain.js header, director.js): he throws things, so guard.sep is 0.4 (the Lord's
  // and Tian Lei's)
  pressure: {
    chainDepth: [4, 5, 6],
    chainRest: [[0.45, 0.75], [0.3, 0.5], [0.2, 0.35]],
    linkCut: 0.5,
    chainCut: 0.5,
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 2, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 14, 16], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6, closerBoost: 1.8,
    maxLive: [1, 2, 2],
    bias: { string: [1.3, 1.0, 1.1], closer: [1, 1, 1.1], area: [1.1, 1.0, 1.0], hazard: [1.2, 1.2, 1.0], terrain: [1, 1, 1.3], ranged: [1, 1.5, 1.2], spell: [1, 1, 1.2], single: [1, 1, 1.0] },
    density: [0.6, 0.7, 0.8],
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.4, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 0.8, pad: 0.18 },
    // what tests/integration/woke.mjs PACE asserts (measured 2026-11-22, three seeds 4242 7 99 x 60 s a phase,
    // the WORST seed with a margin): cues a minute P1 68.5 / 71.2 / 74.3, P2 90.8 / 96.3 / 102.5, P3 79.3 / 84.9 /
    // 89.5 (min / mean / max); longest gap 2.78 / 2.63 / 2.55 s; dodge 5 / 5 / 16 %; 0 conflicts; the fire field's
    // peak 199 / 482 / 953 blobs. Phase 3 reads fewer cues than phase 2 because each of Iron Rain's eleven shots
    // is a cue of its own (the stream is one guard in the ledger): phase 3 asks three times the dodges and
    // leaves the floor; P3 >= 0.82 x P2 on each seed, 0.85 in the mean
    meter: { ramp: [1, 1.15, 0.82], rampMean: [1, 1.25, 0.85], minRate: [62, 82, 72], maxGap: [3.4, 3.3, 3.3] },
  },
  punish: { weight: 4 },

  // ---- the duel's moments
  fullDeflect: { minHits: 5, posture: 70 },
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.35, 0.38], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  flurry: { posture: 0.6 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  damageScale: 1.0,
  airFall: { g: 30 },

  // ---- the transitions (as every transition: red, a fixed windup, a ring that throws the hero back)
  ironSeeds: { windup: 2.0, ringRadius: 6, damage: 12, knockback: 7 },
  rising: { windup: 2.3, ringRadius: 6.5, damage: 12, knockback: 7, palm: 1.5 },
  // THE FALL (bar 1 empty, the deathblow): time at `slowmo` for `slowDur` s, he lies `lie` s, then the hall
  // turns to code from his body outward and he rises (the transition `rising`)
  fall: { slowmo: 0.3, slowDur: 0.8, lie: 2.2 },

  // ---- the counter stance (the Still Hand: the engine's `stance`, Tian Lei's Still Water)
  stance: { windup: 0.45, hold: [0.2, 0.4], from: 0.3, open: 0.6 },

  // ---- IRON (phase 2): the guns. Every shot is a blast of LordFx's pool (AscFx.throwShot 'blast'),
  // drawn as a short bright slug and its trail; cover stops it and takes `world.shot` (a pillar's face is
  // gone in about two volleys, the pillar down in about four)
  shot: { speed: 30, radius: 0.32, size: 0.55, range: 24 },
  heavyShot: { speed: 24, radius: 0.45, size: 1.0, range: 24 },
  // Iron Rain: he strafes round the hero at `strafe` m, running up across pillars on his way, firing
  // from alternating hands: `count` shots of `damage` over `dur` s, then the last big one (returnable).
  // A held guard pays `guardCost` a shot (the hero's GUARD.costMin is 8: 55 at most for a whole volley)
  ironRain: { dur: 1.5, count: 11, damage: 5, last: 14, strafe: [7, 10], speed: 6.5, guardCost: 4.2, lastCost: 9 },
  // the reload: after `after` ranged moves he throws both guns away and takes two more from the coat
  reload: { after: 3, dur: 0.6 },
  // THE BEND (phase 2): a returned shot or the engine's heavy-blow evade. Time slows for everyone; he
  // arches back; it costs him `posture` (shot / cut), he is open `open` s and the first cut crits (x crit);
  // he cannot bend twice inside it; a melee bend at most once in `every` s
  bend: { slowmo: 0.3, dur: 0.7, open: 1.0, posture: { shot: 50, cut: 16 }, crit: 1.5, every: 6, returned: 50 },
  // THE STOP (phase 3): a returned bolt hangs before his raised palm (rooted `root` s, + `posture` each);
  // up to `max` hang; Return to Sender sends them; unsent after `life` s they drop as loose digits
  stop: { max: 3, root: 0.5, posture: 25, life: 4, sendPosture: 20 },
  bolt: { speed: 22, radius: 0.5, size: 0.9, range: 24 },
  // Unwriting: bricks torn out of up to `count` code pillars within `near` m, thrown `gap` s apart
  unwriting: { count: 3, near: 12, gap: 0.55, first: 0.7, speed: 17, damage: 20 },

  // ---- FLIGHT (phase 3): Leaving the Floor, then the Falling Fist or the Low Pass
  flight: {
    hover: 5, // m he hangs at
    burst: { r: 4, damage: 14, knockback: 5 },
    // the Falling Fist: the crater, then a front from `from` to `to` m at `speed` m/s that strikes once
    fist: { crater: 3.2, damage: 30, front: { from: 3, to: 11, speed: 14, damage: 18, width: 0.9 } },
    lowPass: { len: 14, w: 1.8, damage: 24, y: 0.9 },
    // the camera eases back so both stay in frame (kiBeam.js _pairZoom's model)
    zoom: { max: 7, ease: 3 },
  },
  dive: { reach: 9, damage: 44 },

  // ---- DEJA VU (phases 2 and 3): a string that ended on its own links back to itself (`force`); the
  // hall stutters `stutter` s and he replays it as realised the first time (phase 3: mirrored)
  dejavu: { chance: [0, 0.3, 0.45], stutter: 0.12, pulse: 0.4 },

  // ---- what his blows do to the world (ADR-107; POWER: 1 fells a tree). The duelist's other fields
  // fall back to duelist/worldTuning.js DUEL_WORLD
  world: { shot: 0.25, heavy: 0.6, blast: 0.25, bigBlast: 0.6, bolt: 0.6, kickOff: 0.2, crater: 2.0, front: 0.8, lowPass: 1.2, brick: 1.0 },

  // ---- he stands with his back turned until the hero steps onto the floor
  wakeRadius: 9,
};
