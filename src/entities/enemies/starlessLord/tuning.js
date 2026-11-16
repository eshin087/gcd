// The Starless Lord's numbers (COMBAT.md → "The Starless Lord"). Starting values: tune them in the
// Lab. Per-form values are [form 1, 2, 3, 4]. Times in seconds, distances in metres.
//
// Four blade forms, each with its own health bar (the owner's pick: "four bars, a deathblow each"):
//   1  one blade, the free hand casting        2  twin blades
//   3  the blades joined into a long staff     4  one cross-hilted blade, wreathed in the Void
// A bar emptied, or his posture broken, leaves him on one knee: the deathblow (the hero's execution)
// ends that form and he rises into the next; the fourth deathblow kills him.
export const TUNING = {
  name: 'VARR NIHIL, THE STARLESS LORD',
  forms: 4,
  hp: 1400, // each form's bar
  phaseAt: [1], // no gates inside a bar (the boss bar draws no ticks)
  radius: 0.42, // body circle (the hero is pushed out of it)
  // his drawn size (model metres → world): a head taller than Shen Hui (1.2) and the hero (1.08).
  // Visual only, as theirs: the body circle, the hurt spheres and every reach are in gameplay metres
  scale: 1.32,
  // he stays on the crater's floor: a circle round the seal (world/throneHall.js THRONE.floor: the
  // plates end at 15 m, the rim's slabs stand from 15.8 m), so a hero backed against the rim is still
  // in his reach. North of it the dais is closed to him too: the level's CONFIG.world.bossFloor.zN
  // (levels/starless.js; lord.js clampTarget), which the lab stage does not have
  bound: 13.6,

  // ---- tells (rules: COMBAT.md; checked by tests/integration/lord.mjs). Faster than Shen Hui and
  // ramping (the owner's pick): a string's follow-up windups 0.34 s in form 1 (Shen Hui's) down to
  // 0.28 s in form 4 (windupScale), so its blows land 0.42 → 0.36 s apart; every hit still cued by
  // its flash
  flashLead: 0.26, // the glint this long before every impact (<= the tightest gap: each flash after the hit before it)
  minFirstWindup: 0.4, // a move's first real hit, every form
  minHitGap: 0.34, // impact to impact inside a move
  windupScale: [1, 0.94, 0.89, 0.83],
  recoveryScale: [0.9, 0.85, 0.8, 0.72],
  // the step-in through a windup (duelist/brain.js close-in)
  close: { first: 3.0, next: 1.5, speed: 13 },

  // ---- posture (POSTURE.parry in combat/rules.js for parries). The Sekiro rule: his posture is
  // hard to move while his bar is full and gives way as it empties: every gain × lerp(gainByHp) by
  // the bar's missing fraction, and it recovers faster the fuller the bar (regenByHp)
  posture: {
    max: [460, 500, 540, 600],
    hit: { light: 5, heavy: 16 },
    guard: { light: 8, heavy: 20 },
    regenDelay: 2.2,
    regenRate: 22,
    gainByHp: [0.45, 1.25], // posture gain × this: [bar full, bar empty]
    regenByHp: [1.5, 0.5], // regen rate × this: [bar full, bar empty]
    breakTime: 4.5, // on one knee, waiting for the deathblow
    breakCritMult: 1.5,
    // a break nobody answered: he rises with this much of the bar back (if it was empty) and half the meter
    spared: { hp: 0.2, posture: 0.5 },
  },

  // ---- his guard (as the Ash Disciple's: the front arc, in footwork and early in a windup)
  guard: {
    arc: 1.31,
    raiseDelay: 0.16,
    windupOpen: 0.5,
    counterChance: [0, 0.4, 0.75, 1],
    countWindow: 2.5,
    crushPoise: 48,
    clashStop: 0.07,
    deflectStop: 0.1,
    recoverOpen: 0.5, // a recovery's punish window; after it he breaks it off into his guard or a step
    evade: 0.5,
    wardLinger: 0.6,
  },
  trade: { posture: 1.5, push: 0.5 }, // the trade clash (as the Ash Disciple's)
  // duel framing (main.js): the camera eases in within his reach (as the Ash Disciple's)
  camera: { within: 6.5, fade: 4, zoom: -6 },
  flinch: { breakOff: 2, window: 1.6, hitStun: 0.22 },
  hitStun: { light: { stop: 0.065, jolt: 0.6, push: 0.12, shudder: 0.045 }, heavy: { stop: 0.1, jolt: 1, push: 0.3, shudder: 0.07 }, critStop: 0.12, joltDecay: 5 }, // (shudder: the Ash Disciple's note)
  parts: { head: 1.3, body: 1, leg: 0.9 },

  // ---- the deathblow (a broken lord, player.js _tryExecution → onExecute)
  execRange: 3.4,
  ghostepBehind: 1.5,
  execution: { damage: 260 }, // (shown as the deathblow's number; the form ends whatever it is)

  // ---- footwork: he circles only inside striking range, runs outside it, sprints past sprintAt
  move: {
    walk: 2.4,
    run: 6.0,
    sprint: 9.2,
    turn: [8, 9, 10, 11],
    trackTurn: [14, 15, 16, 18],
    band: [1.8, 3.4],
    sprintAt: 5.5,
    near: 1.1,
    backChance: 0.3,
    backstep: { dist: 2.2, time: 0.36 },
    strafeSwitch: [0.9, 2.0],
  },
  idleGap: [[0.1, 0.3], [0.07, 0.22], [0.05, 0.16], [0.03, 0.1]], // s of footwork between moves per form (the second pass: shorter)
  // a reaction that leaves him open and a break end in this much footwork, whatever idleGap is: the
  // hero's punish window (the old idleGap; a break: 0.4 s at least)
  openingGap: [[0.14, 0.4], [0.1, 0.32], [0.08, 0.26], [0.05, 0.18]],
  chain: [0.55, 0.62, 0.7, 0.78], // the chance a move flows straight into the next
  // the director (duelist/brain.js header, director.js; the Ash Disciple's tuning.js explains each
  // key). Per-form arrays [1, 2, 3, 4]
  pressure: {
    chainDepth: [4, 4, 5, 6],
    chainRest: [[0.45, 0.75], [0.4, 0.65], [0.3, 0.55], [0.25, 0.45]],
    linkCut: 0.5,
    chainCut: 0.5,
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 2, 3, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 14, 12, 10], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6, closerBoost: 1.8,
    maxLive: [1, 2, 2, 3],
    bias: { string: [1.3, 1.3, 2, 1.6], hazard: [1, 1, 0.6, 1], terrain: [1, 1, 0.7, 1] },
    density: [1, 1.1, 2.2, 2], // the busier moves weigh more: × (their cues a second as authored)^density (director.js densityOf)
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.3, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 1.4, pad: 0.12 },
    // what tests/integration/lord.mjs PACE asserts (the Ash Disciple's tuning.js says how). (core,
    // 2026-11-16, five seeds x 120 s with today's moves: cues/min F1 75.5 - 83.2 (70.6 before the
    // pass), F2 86.1 - 92.0 (79.6), F3 82.2 - 88.1 (75.2), F4 86.2 - 96.6 (84.9); longest gap 3.44 /
    // 3.49 / 3.78 / 3.13 s. Form 3 is not yet busier than form 2: its staff strings give 1.55 cues a
    // second against the twin blades' 1.6 - 2.0 (ramp 0.85 there until its moves are redone). Over
    // eleven seeds form 2 averaged x1.11 form 1, one seed x0.99: its ramp floor is 0.97
    meter: { ramp: [1, 0.97, 0.85, 0.98], minRate: [70, 78, 76, 80], maxGap: [4, 4, 4.3, 4.3] },
  },
  punish: { weight: 4 }, // a hero drinking a flask: the moves that close distance × this

  // ---- the duel's moments (as the Ash Disciple's, ADR-062)
  fullDeflect: { minHits: 5, posture: 70 },
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.35, 0.38, 0.42], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 130 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  // every blow he deals (moves.js damage, the spells) × this
  damageScale: 1.1,

  // ---- the blade forms' ignition (the transition into forms 2-4): a red shock ring round him
  ignite: { ringRadius: 6.5, damage: 12, knockback: 7 },

  // ---- the Void spells (lord.js / fx.js). Thrown things cue themselves `flashLead` before they
  // reach the hero (too late: they fizzle), as the wyrm's bullets and the Ash Crescent do
  crescent: { speed: 14, radius: 0.7, life: 2.2, chip: 0.25 }, // red sword-light off a cut (form 4)
  push: { speed: 12.5, radius: 0.8, half: 2.4, life: 1.9 }, // the Void push: a wall of force along the ground
  bolt: { range: 17, width: 1.7, returnDamage: 55, returnPosture: 34 }, // Void lightning (a perfect parry sends it back)
  pull: { range: 11, drag: 5.5 }, // the Void pull: dragged this far toward him
  glaive: { speed: 15, back: 17, range: 12.5, radius: 0.9, life: 3.2 }, // the thrown blade: out, then back to his hand
  debris: { speed: 16, radius: 0.8, life: 2.4, gap: 0.42, rise: 1.9 }, // hurled stones, `gap` s apart
  storm: { radius: 2.3, warn: 0.95, gap: 0.5, lead: 0.5 }, // called lightning: marked ground, then the strike
  // ---- the second pass's Void (spells.js): what flies, waits or falls while he fights on
  // the wheeling blade (form 2, thrown mid-string): it comes in on the hero `flight` s after the
  // throw (min - max; a string with a `catch` beat times it into the gap before the catch), out
  // `wide` m to one side and `beyond` m past him on the way; home at `back` m/s; `home` s more at most
  wheel: { flight: 1.1, min: 0.7, max: 1.8, yield: 0.4, wide: 3.4, beyond: 1.2, rise: 0.55, back: 18, home: 1.6, radius: 0.9, reach: 0.6 },
  // the orbit (form 3): `count` stones turning round him at `r` m, `w` rad/s, each thrown into a
  // gap of his string (`minGap` s wide at least) and `flight` s in the air whatever the distance
  // (speed within `speed`); each set on the wheel to fly from `side` rad off the line to the hero; one
  // too near the hero all the same (< minDist m) turns on round him (maxWait s at most), then crumbles;
  // any torn stone (Torn Stone's too) waits up to `yield` s in the grip for a slot clear of his string
  orbit: { count: 3, r: 2.6, w: 2.0, rise: 2.0, flight: 0.55, minDelay: 0.6, minGap: 0.5, after: 0.6, minDist: 1.7, maxWait: 0.3, side: 1.9, early: 0.06, yield: 0.9, speed: [3, 24], radius: 0.8, life: 2.4 },
  // the Starless Sky as weather (form `form` on): one strike every `gap` s ([bar full, bar empty]),
  // a second with `pair` chance ([full, empty]) `pairGap` s later and `apart` m off; each lands
  // `warn` s from its call (up to `slack` more to find a slot clear of his blade), `lead` s ahead of
  // where the hero is going, up to `scatter` m off; at most `maxLive` on the floor; first `start` s into the form.
  // Called only inside a move of his, landing in a pause of it or in its recovery (`inString` s
  // before its end at the latest): his strings are dense, their recovery is the hero's own time
  weather: { form: 4, start: 4, gap: [3.2, 1.8], pair: [0.25, 0.6], inString: 0.1, pairGap: 0.45, apart: 3.8, warn: 1.1, slack: 0.9, retry: 0.4, radius: 2.1, lead: 0.55, scatter: 1.4, maxLive: 2, damage: 22, knockback: 3 },
  // Starless Night (form 4's great spell): `waves` fronts `gap` s apart from r0 m round where he
  // stands, out at `speed` m/s to `reach` m; each strikes a hero it runs over (red: roll through it);
  // `firstAfter` s into form 4 before he may cast it
  night: { waves: 3, gap: 0.9, speed: 8, r0: 0.8, reach: 16.5, width: 0.8, firstAfter: 14 },
  grip: { range: 9.5, width: 2.2, crush: 0.55 }, // the Crushing Dark: a line from his hand; `crush` s of the seal closing
  rift: { speed: 13.5, radius: 0.75, life: 1.9 }, // fissures of red light along the floor
  star: { radius: 3.0, warn: 1.7, drift: 2.3, after: 0.45, minWarn: 1.2 }, // the Dark Star: it follows the hero at `drift` m/s, then bursts (cast inside a string: `after` s past its last blow, `minWarn` s at least)
  // ---- the crater's pieces in the Void's grip (terrain.js, ADR-109; the moves: moves.js `terrain`)
  terrain: {
    reach: 26, // a piece this far from him can be taken or pulled down
    easyH: 4.5, // pieces taller than this are taken last (a 7 m slab is thrown when nothing else is left)
    rise: 1.3, // m a piece comes up out of its place before it crosses to him
    lift: 0.95, // s until it hangs over him (inside the windup)
    // its flight: distance / `per` s, within `flight`. The ring is drawn as it leaves: 0.9 s at the
    // least lets a hero who sees it run out of it (2.1 m + his half width at 4.6 m/s, after a quarter
    // second to react); a roll gets out of it at any time (the bots: tests/integration/lord.mjs TERRAIN)
    per: 16,
    flight: [0.9, 1.2],
    // thrown where the hero will be this many s on: less than its flight, so a hero who keeps
    // running one way is past the ring when it lands, and one who stands still is under it
    lead: 0.15,
    radius: 2.1, // the ring where it lands: his blow reaches a hero inside it
    spread: 1.0, // Glass Rain: the later throws land up to this far to either side of the aim
    power: 1.2, // what the landing does to the pieces it lands among (POWER: a thrown stone)
    gap: 0.55, // Glass Rain: s between throws
    // Crown Fall: the hero stands in the strip a piece would fall on: `min` m from its foot at least,
    // `short` m inside its height; where he will be `lead` s on
    fall: { min: 0.8, short: 0.2, lead: 0.3 },
  },
  // ---- the glide: past this speed he is carried, not running (lord.js; the root lifts `hover` m)
  glide: { on: 3.4, off: 2.8, hover: 0.22, back: 0.26 },

  // ---- the intro: he rises from the throne and leaps down to the seal
  wakeRadius: 10,
  // (seatY: the root's height while he sits; daisY: the dais's top tier; stand: how far in front of
  // the seat he stands up; then the leap to `land`, on the seal's northern edge: 10 m from the seat)
  intro: { seatY: 0.74, daisY: 0.52, stand: 1.0, land: { x: 0, z: -5.5 }, leapFrom: 1.5, leapTo: 2.5, apex: 2.6 },
};

/** Value for the form (1-based) from a per-form array, or the value itself. */
export function perForm(v, form) {
  return Array.isArray(v) ? v[Math.min(v.length, Math.max(1, form)) - 1] : v;
}
