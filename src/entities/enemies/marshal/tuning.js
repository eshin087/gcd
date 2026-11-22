// The Clockwork Marshal's numbers (COMBAT.md → "The Clockwork Marshal"; ADR-135). Starting values: tune
// them in the Lab and with the test bots. Per-phase values are [phase 1, 2, 3, 4]: phases 1 - 3 are the
// SUIT (a bronze war-suit drawn at suit.scale, one bar, its plates its guard), phase 4 the PILOT (Gongshu
// Yan herself, out of the husk, on a bar of her own with the duelist's guard). Times in seconds,
// distances in gameplay metres (what is drawn is scaled; every reach here is what hits).
export const TUNING = {
  name: 'GONGSHU YAN, THE CLOCKWORK MARSHAL',
  hp: 2400, // (the suit's bar: the base constructor reads it; marshal.js sets each body's own)
  phaseAt: [1, 0.66, 0.33], // the suit's bar: phases 2 and 3 at 66 % and 33 % (the pilot's bar has no gates)
  radius: 0.9, // (the suit's body circle; each body's own below, marshal.js keeps the live one)
  scale: 1.75,
  bound: 13.2, // he keeps to the yard (world/foundry.js FOUNDRY.r is 15)

  // ---- the two bodies (ADR-135). `scale`: drawn size; `game`: the factor his hurt spheres are scaled
  // by from the root (what is drawn is what is hit); `radius`: the body circle; `hp`: the bar
  suit: { hp: 2400, scale: 1.75, game: 1.75, radius: 0.9 },
  pilot: { hp: 1000, scale: 1.0, game: 1.0, radius: 0.4 },

  // ---- tells (rules: COMBAT.md; checked by tests/integration/marshal.mjs). The suit is slow and heavy:
  // its first real windup >= 0.7 s and its blows >= 0.5 s apart; the pilot is the Lord's pace
  flashLead: [0.32, 0.32, 0.3, 0.26],
  suitTiming: { minFirstWindup: 0.7, minHitGap: 0.5 },
  pilotTiming: { minFirstWindup: 0.4, minHitGap: 0.34 },
  minFirstWindup: 0.4, // (the loosest of the two: per body above)
  minHitGap: 0.34,
  windupScale: [1, 0.94, 0.88, 1],
  recoveryScale: [1, 0.92, 0.85, 0.8],
  close: { first: 2.4, next: 1.2, speed: 9 },

  // ---- posture (POSTURE.parry in combat/rules.js). The helm off: every gain x plates.helm.lost.posture
  posture: {
    max: [520, 520, 520, 420],
    hit: { light: 5, heavy: 16 },
    guard: { light: 8, heavy: 20 },
    regenDelay: 2.4,
    regenRate: 20,
    breakTime: 4.5, // on one knee, waiting for the deathblow
    breakCritMult: 1.5,
    spared: { hp: 0.2, posture: 0.5 }, // the pilot's break unanswered with her bar empty: she rises with this much
  },

  // ---- the guard: the PILOT's (the suit has none: its plates are its guard, marshal.js `guarding`)
  guard: {
    arc: 1.31,
    raiseDelay: 0.16,
    windupOpen: 0.5,
    counterChance: [0, 0, 0, 0.7],
    countWindow: 2.5,
    crushPoise: 48,
    clashStop: 0.07,
    deflectStop: 0.1,
    recoverOpen: 0.5,
    evade: 0.45,
    wardLinger: 0.6,
  },
  trade: { posture: 1.5, push: 0.5 },
  // duel framing (main.js): the suit wants a wider frame than the Lord's
  camera: { within: 7.5, fade: 4, zoom: -3 },
  flinch: { breakOff: 2, window: 1.6, hitStun: 0.22 },
  hitStun: { light: { stop: 0.06, jolt: 0.45, push: 0.04, shudder: 0.03 }, heavy: { stop: 0.1, jolt: 0.8, push: 0.12, shudder: 0.05 }, critStop: 0.12, joltDecay: 5 },
  parts: { head: 1.2, body: 1, leg: 0.9 },

  // ---- the deathblow
  execRange: 3.8,
  ghostepBehind: 2.0,
  execution: { damage: 260 },

  // ---- footwork. `suit` / `pilot`: each body's own (marshal.js writes the live `move` from them and the
  // flank plates' losses)
  move: {
    walk: 1.8, run: 4.2, sprint: 6.5, turn: [3.2, 3.4, 3.6, 9], trackTurn: [4.2, 4.6, 5.0, 15],
    band: [2.2, 4.2], sprintAt: 6.5, near: 1.4, backChance: 0.15, backstep: { dist: 1.6, time: 0.4 }, strafeSwitch: [1.4, 2.6],
  },
  moveSuit: {
    walk: 1.8, run: 4.2, sprint: 6.5, turn: [3.2, 3.4, 3.6, 3.6], trackTurn: [4.2, 4.6, 5.0, 5.0],
    band: [2.2, 4.2], sprintAt: 6.5, near: 1.4, backChance: 0.15, backstep: { dist: 1.6, time: 0.4 }, strafeSwitch: [1.4, 2.6],
  },
  movePilot: {
    walk: 2.4, run: 6.0, sprint: 9.2, turn: [9, 9, 9, 9], trackTurn: [15, 15, 15, 15],
    band: [1.8, 3.4], sprintAt: 5.5, near: 1.1, backChance: 0.3, backstep: { dist: 2.2, time: 0.36 }, strafeSwitch: [0.9, 2.0],
  },
  idleGap: [[0.3, 0.6], [0.25, 0.5], [0.2, 0.4], [0.06, 0.18]],
  openingGap: [[0.3, 0.6], [0.25, 0.5], [0.2, 0.45], [0.06, 0.2]],
  chain: [0.4, 0.5, 0.6, 0.7],
  // the director (duelist/brain.js header, director.js; the Ash Disciple's tuning.js explains each key)
  pressure: {
    chainDepth: [3, 3, 4, 6],
    chainRest: [[0.6, 1.0], [0.5, 0.9], [0.45, 0.8], [0.2, 0.4]],
    linkCut: 0.5,
    chainCut: 0.5,
    near: 3.6, far: 7, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 2, 3, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 16, 16, 12], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 7, closerBoost: 1.6,
    maxLive: [1, 2, 2, 2],
    bias: { string: [1, 1.1, 1.2, 1.8], hazard: [1, 1, 1.2, 1], terrain: [1, 1, 1, 1] },
    density: [0.8, 0.9, 1.0, 2.0],
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.4, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 0.8, pad: 0.18 },
    // what tests/integration/marshal.mjs PACE asserts per phase: cues a minute at least, the longest gap
    meter: { minRate: [30, 32, 36, 70], maxGap: [6.5, 6.0, 6.0, 4.5] },
  },
  punish: { weight: 3 },

  // ---- the duel's moments (as the Lord's)
  fullDeflect: { minHits: 5, posture: 70 },
  lock: { start: 0.5, push: 0.085, decay: [0.35, 0.35, 0.35, 0.4], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  cinematic: { zoom: -8, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  damageScale: 1.0,

  // ---- the plates (ADR-135; COMBAT.md "The Clockwork Marshal"). A blow on a plated side: the bar takes
  // `soak` of it, the plate's structure the raw damage (x heavyK for a heavy or charged blow); a bare
  // back takes x backBare. `minOff`: plates gone by phase 1 / 2 / 3 (a transition's impact sheds the
  // least-sound until that many are gone; never the helm). `lost`: what each missing plate changes
  plates: {
    soak: 0.3,
    heavyK: 1.5,
    backBare: 1.4,
    minOff: [0, 2, 4],
    blowGap: 0.15, // the suit's bar empty: what is left blows off this far apart
    breast: { hp: 420, lost: { bolts: 1, sweepAny: true } },
    back: { hp: 300, lost: { ventBehind: 2 } },
    left: { hp: 260, lost: { turn: 0.88, run: 0.88 } },
    right: { hp: 260, lost: { turn: 0.88, run: 0.88 } },
    helm: { hp: Infinity, lost: { posture: 1.3 } },
    fly: 0.8, // s a shed plate flies before it lands
  },

  // ---- the Fire Lance (moves.js `fireLance`; fx.js draws the bolt as heat in the fire field)
  lance: { range: 18, width: 1.4, gap: 0.6, returnPlate: 220, returnPosture: 40 },
  // the transitions' shock ring (the Lord's ignition ring)
  shock: { ringRadius: 6, damage: 12, knockback: 7 },
  eject: { ringRadius: 5, damage: 10, knockback: 6, hatchY: 2.1, travel: 3.5 },
  // Sky-Splitting Mortars: `count` shells, one every `gap` s, each a red ring `radius` m warned `warn` s
  mortar: { count: 5, gap: 0.5, warn: 1.1, radius: 2.2, damage: 22, knockback: 3, lead: 0.4, scatter: 1.6 },
  // the pilot's thrown fire bolts (`release`)
  shot: { speed: 13, radius: 0.6, life: 1.6 },
  // burning ground (ashDisciple/moveFx.js reads `burn`): Sweeping Fire leaves its arc alight
  burn: { from: 1, cap: [4, 6, 8, 0], width: 0.9, life: 5, len: 5, ring: 0.62, grace: 0.45, armAfter: 0.35, tick: 0.55, damage: 5, guard: 34, flames: 26, ignite: 0.8, fade: 0.6 },

  // ---- what his blows do to the world (ADR-107; over duelist/worldTuning.js DUEL_WORLD)
  world: { per: 40, red: 1.25, crescent: 0.35, bolt: 1.5, lance: 1.2, lanceFire: 1, sweepFire: 0.8, hammer: 1.0, stomp: 0.8, charge: 1.0, body: 0.6, mortar: 1.0, plate: 0.5, vent: 0.6 },

  // ---- the intro: he rises from his kneel before the furnace
  wakeRadius: 10,
  intro: { dur: 3.0 },
};
