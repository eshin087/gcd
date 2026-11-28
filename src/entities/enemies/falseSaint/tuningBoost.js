// The False Saint's boosters' numbers (the BOOST AGENT's file: the booster punch, the rapid flurry of the
// plated arm, the jet dash footwork, the dive, the jet strings, the overclock passes, the last grab). Read
// as TUNING.boost (tuning.js merges it). Times in seconds, distances in metres, damage before
// TUNING.damageScale (1.6); per-phase values [P1, P2, P3, P4]. Windups not marked fixed shrink by
// TUNING.windupScale [1, 0.94, 0.88, 0.84]; the data rules (saint.mjs DATA) hold in every phase.
export const TUNING_BOOST = {
  // ---- CENSER STEP, his jet step (FsBoost.footwork; it supersedes TUNING.fsJet, core's placeholder):
  // from phase `from`, a hero further than `at` m is closed on a jet: `pre` s of the boosters lighting
  // (he does not move), then a straight dash at `speed` m/s that stops `stop` m short of the hero (never
  // through him), `max` m at most, an afterimage where he left. From phase `zig` the dash is two legs: the
  // first `zigAng` rad off the line for `zigShare` of the way, the second onto the stop point. `every` s
  // between dashes (the hero can still walk away). `hover`: his height in footwork from phase 3 (stiff,
  // on the thrusters; 0 = on the floor). The dash deals nothing.
  step: {
    on: true, from: 2, at: [99, 6.5, 6, 5.5], every: [99, 3.4, 2.7, 2.1], speed: [22, 22, 25, 29], stop: 2.4, max: 10, pre: [0.12, 0.12, 0.1, 0.09],
    zig: 3, zigAng: 0.62, zigShare: 0.45, hover: [0, 0, 0.2, 0.24], hoverEase: 7, scorch: 0.35,
  },

  // ---- VOTIVE FIST, the booster punch (P2+, blue, a parry moment): the elbow's jet lights from `jetFrom`
  // of the windup (the tell, held at the coil from `cock` to `dashFrom`), then he crosses up to `reach` m in
  // a blink behind the fist and stops `stop` m short of the hero. A miss (rolled, whiffed) CARRIES ON
  // `carry` m along the line at `carrySpeed` (everything on it struck at fist height `y`, `power`; a
  // crater of `crater` m where it ends), and the punch's wave goes on `wave` m past that at `waveK` of the
  // power (his body stops at his floor's edge, 13.8 m; the set's pieces stand from 16 m). Parried:
  // `parryPosture` more posture than any blue parry, and he skids `overshoot` m past the hero's side.
  votive: {
    windup: 0.95, cock: 0.62, jetFrom: 0.1, dashFrom: 0.86, reach: 10, stop: 1.3, damage: 30, knockback: 6.5, blockPush: 4.5,
    y: 1.25, w: 0.9, power: 2.4, carry: 3.4, carrySpeed: 26, crater: 1.6, craterPower: 2.2, wave: 4.5, waveK: 0.75, parryPosture: 90, overshoot: 1.5,
    weight: [0, 1.5, 1.25, 1.1], cooldown: [9, 5.2, 4.4, 3.8], band: [2.2, 11], recovery: 0.95,
  },

  // ---- ROSARY, the plated arm's rapid flurry (his flurry from P2; DEFENSE.foeStreak launches it): `first`
  // the jet-lit coil, then the pistons in groups of three (`beat`: short, short, long: the stutter), the
  // `chance` beats drawn (7 - 10 blows in all), the last a blue parry moment. Every blow chips what stands
  // `side` m beside the hero (`chip` power).
  rosary: {
    first: 0.62, beat: [0.34, 0.34, 0.47], last: 0.52, active: 0.05, damage: 10, knockback: 0.9, lastDamage: 22, lastKnockback: 5.5,
    middle: 8, chance: [3, 5, 7], p: 0.5, reach: 1.95, side: 1.35, chip: 0.7, close: 1.0, recovery: 0.85,
  },

  // ---- DESCENT, the dive knee (P3+, red): up `h` m on the back thrusters by `rise` of the windup, the
  // mark on the floor follows the hero until `lock`, he drifts over it, dives from `fall` (the glint), and
  // lands knee-first: a ring of `r` m, a crater, the plates thrown (`power` over `r + 0.8`).
  descent: {
    windup: 1.55, cock: 0.86, rise: 0.3, lock: 0.74, fall: 0.84, h: 7.5, short: 1.2, r: 2.8, damage: 34, knockback: 6, power: 3.4, mark: 3.0,
    weight: [0, 0, 1.1, 1.0], cooldown: 9, band: [3, 14], recovery: 1.05,
  },

  // ---- THE JET STRINGS (P3+): Censer Wheel (the booster punch, a jet-spun back elbow, a rising jet kick:
  // blue, n, blue) and Thurible (the elbow, the kick, the booster punch out of the air: n, blue, blue)
  strings: {
    elbow: 0.46, elbowFirst: 0.56, elbowDamage: 16, elbowKnockback: 2.2, elbowReach: 1.8,
    kick: 0.52, kickDamage: 24, kickKnockback: 5, kickReach: 2.15, kickLift: 0.85,
    airPunch: 0.8, airReach: 7,
    wheel: { weight: [0, 0, 1.2, 1.1], cooldown: 7, band: [3, 10], recovery: 0.85 },
    thurible: { weight: [0, 0, 1.0, 1.0], cooldown: 7, band: [0, 3.4], recovery: 0.85 },
  },

  // ---- VESPERS, OVERCLOCK (P4): `passes` jet-streak passes through the hero from the sides `turns` (rad
  // round the hero from where he stood), each announced: the set (`set` s: he jets to its launch point
  // `launch` m out and the line shows), then the pass (`windup`; he leaves `dist / speed` s before the
  // impact and runs `over` m past). The last comes from above (`high` m up, red, a ring of `lastR`).
  vespers: {
    passes: 4, turns: [0, 2.05, -2.05, 1.0], set: 0.32, windup: 0.52, active: 0.1, launch: 6.2, speed: 44, over: 3.2, track: 0.62, y: 1.15, w: 0.8,
    damage: 20, knockback: 3.5, r: 1.35, power: 1.6,
    lastSet: 0.42, lastWindup: 0.66, lastDive: 0.24, high: 6, lastLaunch: 4.5, lastDamage: 30, lastKnockback: 6, lastR: 2.4, lastPower: 3.0,
    weight: [0, 0, 0, 1.3], cooldown: 14, band: [0, 12], recovery: 1.2,
  },

  // ---- LAST RITE (P4, once, under `below` of his bar): he stops, the core whines through a long red windup
  // (`windup`, fixed), and lunges `reach` m to embrace. Dodged or missed: he stands wide open (his posture
  // breaks: the deathblow's chance). Caught: a heavy blast (never the hero's last HP: at most his HP - 1)
  // and a ring of `blastR` m that bites the world.
  rite: { below: 0.08, windup: 1.75, cock: 0.84, dashFrom: 0.88, reach: 5, stop: 0.9, damage: 60, knockback: 7, blastR: 4.5, power: 3.2, weight: [0, 0, 0, 1], boost: 60 },
};
