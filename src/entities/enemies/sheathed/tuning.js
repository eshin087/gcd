// Lu Wusheng, the Sheathed: his numbers (COMBAT.md → "The Sheathed"; ADR-144, ADR-145). Per-phase
// values are [P1, P2, P3]. Times in seconds, distances in metres. Guard, hit stun and footwork start
// from Shen Hui's (ashDisciple/tuning.js); what is his own is commented.
export const TUNING = {
  name: 'LU WUSHENG, THE SHEATHED',
  // (the bots, 2026-11-22: at 3000 and posture 300 / 340 the fencing bot won in 32 - 43 s: a parried draw is a
  // moment (the hero's counter) and 1.5 s caught with the blade out. 3800 and 360 / 400 bring it near Shen Hui's minute)
  hp: 3800,
  // the Sheath / A Thumb's Width / the Held Breath
  phaseAt: [1, 0.66, 0.36],
  radius: 0.42,
  bound: 12.5,

  // ---- tells (COMBAT.md "Core rules")
  flashLead: 0.3,
  minFirstWindup: 0.42,
  minHitGap: 0.32,
  // harder means more pressure and more kinds of draw, never more damage: the draws are `fixed`
  windupScale: [1, 0.94, 0.92],
  recoveryScale: [0.95, 0.85, 0.8],
  close: { first: 3.0, next: 1.4, speed: 12 },

  posture: {
    max: [360, 400, 400],
    hit: { light: 5, heavy: 16 },
    guard: { light: 8, heavy: 20 },
    regenDelay: 2.5,
    regenRate: 20,
    breakTime: 3.2,
    breakCritMult: 1.5,
  },

  // ---- his guard: the scabbard (the engine's wards and deflects, drawn as lacquered wood)
  guard: {
    arc: 1.31,
    raiseDelay: 0.18,
    windupOpen: 0.55,
    counterChance: [0, 0.35, 0.7, 1],
    countWindow: 2.5,
    crushPoise: 48,
    clashStop: 0.07,
    deflectStop: 0.1,
    // (a draw's recovery, the re-sheathe, is open the whole way: its move's own `recoverOpen: 1`)
    recoverOpen: 0.5,
    evade: 0.45,
    wardLinger: 0.6,
  },
  trade: { posture: 1.5, push: 0.5 },
  camera: { within: 6.5, fade: 4, zoom: -6 },
  flinch: { breakOff: 2, window: 1.6, hitStun: 0.22 },
  hitStun: { light: { stop: 0.065, jolt: 0.65, push: 0.14, shudder: 0.045 }, heavy: { stop: 0.1, jolt: 1, push: 0.32, shudder: 0.07 }, critStop: 0.12, joltDecay: 5 },
  parts: { head: 1.3, body: 1, leg: 0.9 },
  execRange: 3.2,
  ghostepBehind: 1.5,
  execution: { damage: 260 },

  move: {
    walk: 2.0, // (a little slower than Shen Hui: he walks like a man with time)
    run: 5.6,
    sprint: 8.6,
    turn: [8, 9.5, 9.5],
    trackTurn: [14, 16, 16],
    band: [2.2, 4.4], // (he keeps a draw's distance)
    sprintAt: 6.5,
    near: 1.1,
    backChance: 0.3,
    backstep: { dist: 2.0, time: 0.36 },
    strafeSwitch: [0.9, 2.0],
  },
  idleGap: [[0.45, 0.85], [0.06, 0.18], [0.02, 0.08]],
  openingGap: [[0.12, 0.38], [0.08, 0.26], [0.08, 0.26]],
  chain: [0.4, 0.75, 0.9],
  // the director (duelist/brain.js header; COMBAT.md "The duelists' pressure"). He is deliberately slower
  // in cues a minute than Shen Hui (the draws' long windups): measured in sheath.mjs PACE
  pressure: {
    chainDepth: [4, 5, 7],
    chainRest: [[0.45, 0.75], [0.3, 0.5], [0.2, 0.4]],
    linkCut: 0.5,
    chainCut: 0.5,
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 3, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 13, 10], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6, closerBoost: 1.8,
    maxLive: [1, 1, 2],
    bias: { string: [1.4, 1.5, 1.6] },
    density: [1, 1.4, 1.6],
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.3, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 1.4, pad: 0.12 },
    // what sheath.mjs PACE asserts (a steady defender that guards white and blue, rolls red, black and the
    // draws; the hero roaming 2.5 - 9 m; 60 s a phase). Measured 2026-11-22, seeds 4242 / 7 / 99: P1 51.9 -
    // 55.1 cues a minute (mean 53.4), P2 70.7 - 75.1 (72.4), P3 76.3 - 79.7 (78.3); P2 / P1 at least 1.30
    // per seed, P3 / P2 at least 1.06; longest gap 3.17 / 2.53 / 2.75 s; 0 conflicts. Slower than Shen Hui
    // (77 / 92 / 100) on purpose: the draws' long windups. The margins about 8 % under the worst seed
    meter: { ramp: [1, 1.18, 0.98], rampMean: [1, 1.2, 1.03], minRate: [47, 64, 69], maxGap: [3.8, 3.3, 3.4] },
  },
  punish: { weight: 4 },

  fullDeflect: { minHits: 4, posture: 70 },
  // (no blade lock: a scabbard does not lock; kept for the engine's shape, no beat is marked `lock`)
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.38, 0.38], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  damageScale: 1,

  // ---- the transitions: one red ring blow each
  transition: { ringRadius: 6, damage: 10, knockback: 6 },
  heldBreath: { ringRadius: 6.5 },

  // ---- THE DRAW (ADR-144): one rule for the whole fight (COMBAT.md "The Sheathed")
  draw: {
    lethal: true, // an unanswered draw kills (maxHp × 1.5); off: `damage`
    damage: 110,
    caught: 1.5, // s a parried draw recoils him (a parried blow: 1.0)
    wait: 0.6, // s a draw waits at the cock for a hero who cannot answer (knocked down, staggered, guard-open), then feints
    afterBlock: 1.1, // s: no draw is cued sooner than this after a blocked one
    // the sheath's thresholds on a draw beat (u of the windup, 1..2 past the impact): the right hand
    // takes the hilt at `grip`, the blade is out at `out`; the re-sheathe's click at `home` of the
    // recovery, the sword passed back to the right hand at `handOff`
    grip: 0.3,
    out: 0.995,
    home: 0.8,
    handOff: 0.95,
  },
  // the cut's line and the grove (fx.js; read where DUEL_WORLD is): power in POWER units
  world: {
    per: 40, red: 1.25, crescent: 0.35, bolt: 1.5, grip: 3,
    draw: 1.2, // the blade's own part: fells wood, chips stone
    wake: 0.55, // the pale line past the hero: it cuts bamboo, not the hero
    wakeLen: 10,
    wakeW: 0.5,
    cutY: 1.15,
    ring: 1.0, // The Held Breath: every stalk within ringR falls on the click
    ringR: 9,
    late: 0.8, // the hanging cuts
  },
  // the hanging cuts (lateCuts.js, phase 3's The Sound Arrives Late): lines of heat across the arena
  late: { len: 14, w: 1.0, count: [3, 4], first: 1.0, gap: 0.7, damage: 24, knockback: 2.2, lead: 0.3 },

  wakeRadius: 9,
};

/** Value for the phase (1-based) from a per-phase array, or the value itself. */
export function perPhase(v, phase) {
  return Array.isArray(v) ? v[Math.min(v.length, Math.max(1, phase)) - 1] : v;
}
