import { DUEL_WORLD } from '../duelist/worldTuning.js';

// Wen Yao, the Thousand-Body Fox's numbers (ADR-147; COMBAT.md → "The Thousand-Body Fox"). Copied block
// for block from Shen Hui's (ashDisciple/tuning.js: the comments there say why each number is what it
// is) and changed only where he is someone else: his health and phases, his bound, no burning ground,
// no terrain, and his own blocks at the end (the paper selves, the Pearl, the mantle, the world).
// Per-phase values are [P1, P2, P3]. Times in seconds, distances in metres.
export const TUNING = {
  name: 'WEN YAO, THE THOUSAND-BODY FOX',
  hp: 3000,
  phaseAt: [1, 0.66, 0.33], // HP fractions where each phase starts (the boss bar's ticks)
  radius: 0.42, // body circle (the hero is pushed out of it)
  bound: 12.2, // he stays this close to the terrace's centre (min with CONFIG.world.dragonBound)

  // ---- tells (rules: COMBAT.md; checked by the duel tests). PBZ-boss speed (owner, 2026-11-12):
  // openers ~0.46–0.6 s, a string's hits ~0.34 s apart, the flash the timing cue
  flashLead: 0.3, // the glint this long before every impact
  minFirstWindup: 0.42, // a move's first real hit, every phase
  minHitGap: 0.32, // impact to impact inside a move (>= flashLead: each flash after the hit before it)
  // (phase 3 is no faster than phase 2: the 0.42 s floor holds; its ramp is in what he does)
  windupScale: [1, 0.92, 0.92], // the windups of later phases (moves are authored with first windups >= 0.46)
  recoveryScale: [0.9, 0.8, 0.8], // (never below phase 2's: the first half of a recovery is the hero's)
  // the step-in through a windup (brain.js close-in): at most this far toward the hero, so the zone
  // reaches him at the impact (a move's first hit / its later hits; a beat's own `close` overrides)
  close: { first: 3.0, next: 1.4, speed: 12 },

  // ---- posture (POSTURE.parry in combat/rules.js for parries)
  posture: {
    max: [320, 380, 380],
    hit: { light: 5, heavy: 16 }, // weapon hits that land
    guard: { light: 8, heavy: 20 }, // weapon hits his guard deflects
    regenDelay: 2.5,
    regenRate: 20,
    breakTime: 3.2,
    breakCritMult: 1.5, // (the wyrm's 2.2: for a duelist the execution is the reward of a break)
  },

  // ---- his guard
  guard: {
    arc: 1.31, // rad either side of his facing (75°)
    raiseDelay: 0.18, // after a move's recovery, a stagger or a recoil ends (a clash or a flinch: at once)
    windupOpen: 0.55, // in a windup his guard holds until this fraction of it (he commits to the strike)
    counterChance: [0, 0.35, 0.7, 1], // on the 1st, 2nd, 3rd, 4th+ guarded strike in a row
    countWindow: 2.5, // guarded strikes further apart than this start the count over
    // a heavy strike with at least this much posture crushes it: the charged thrust from ~90 % charge
    // (player/combat.js THRUST.poise 30..50); the chain's slam (40) is turned aside like any other
    crushPoise: 48,
    clashStop: 0.07, // hit-stop on a ward (× 1.6 for a heavy strike)
    deflectStop: 0.1, // ... and when he beats the strike away (the hero's blade is thrown back)
    // (owner, 2026-11-14: "being able to animation cancel from a swing to a guard or dodge instantly")
    // a move's recovery is open for this fraction of it (the punish window); after that he breaks it
    // off into his guard when a strike comes, or steps out of a heavy blow
    recoverOpen: 0.5,
    evade: 0.45, // the chance (once per 3 s) he steps out of a heavy blow levelled at him
    wardLinger: 0.6, // s the guard stays raised after a strike was met
  },
  // the trade clash (the hero's cut meets his blow, DEFENSE.trade): guard posture × `posture`
  // (light 12, heavy 30), he gives `push` m
  trade: { posture: 1.5, push: 0.5 },
  // duel framing (main.js): within `within` m of him the camera eases `zoom` m closer (gone `fade` m
  // further out), so the blades read; the hits punch it in from there
  camera: { within: 6.5, fade: 4, zoom: -6 },
  // strikes that land on him outside his attacks: after `breakOff` of them within `window` he backsteps
  flinch: { breakOff: 2, window: 1.6, hitStun: 0.22 },
  // hit stun (owner, 2026-11-12: "more impactful hit stun, not weightless"): every blow that lands on
  // him freezes the frame (`stop` s), jolts his chest and head back (`jolt` 0..1, poses.js) and shoves
  // him `push` m; it interrupts only footwork and his recovery (heavy: a stagger), never a windup
  // `shudder` m: through the freeze his drawn figure flickers ± this far along the cut, fading (drawn
  // only; duelist.js; the Lab's 'shudder' toggle)
  hitStun: { light: { stop: 0.065, jolt: 0.65, push: 0.14, shudder: 0.045 }, heavy: { stop: 0.1, jolt: 1, push: 0.32, shudder: 0.07 }, critStop: 0.12, joltDecay: 5 },
  parts: { head: 1.3, body: 1, leg: 0.9 },

  // ---- the execution (a broken disciple, player.js _tryExecution → onExecute)
  execRange: 3.2,
  // ---- the Ghostep behind him (player.js _ghostep reads attacker.ghostepBehind; the wyrm's 3.2 m
  // is out of sword reach of a man's back)
  ghostepBehind: 1.5,
  execution: { damage: 260 },

  // ---- footwork
  // (owner, 2026-11-12: "it shouldn't be attacking if it's not near the player ... it should sprint
  // and catch up to add pressure"): he circles only inside striking range; outside it he runs, and
  // past `sprintAt` he sprints (faster than the hero's 7.2 m/s sprint: kiting doesn't work)
  move: {
    walk: 2.2, // circling with the guard up
    run: 5.6,
    sprint: 8.6,
    turn: [8, 9.5, 9.5], // rad/s while circling
    trackTurn: [14, 16, 16], // rad/s while tracking the hero in a windup
    band: [1.8, 3.2], // he circles this far off (inside striking range)
    sprintAt: 5.5, // further than this: sprint
    near: 1.1, // closer than this: sometimes backsteps out
    backChance: 0.3,
    backstep: { dist: 2.0, time: 0.36 },
    strafeSwitch: [0.9, 2.0], // s between changes of circling direction
  },
  // PBZ pace (owner, 2026-11-12: "relentless"): short breathers, and after a move he often flows
  // straight into the next one without footwork (`chain`: the chance per move end, per phase)
  // (the second pass: shorter, phase by phase; the third phase is wave 2's)
  idleGap: [[0.1, 0.3], [0.06, 0.2], [0.03, 0.12]], // s of footwork between moves [min, max] per phase
  // a reaction that leaves him open (recoil, stagger, reeling, trampled, executed) and a break end in
  // this much footwork, whatever idleGap is: the hero's punish window (the old idleGap; a break: 0.4 s
  // at least)
  openingGap: [[0.12, 0.38], [0.08, 0.26], [0.08, 0.26]],
  chain: [0.6, 0.72, 0.82],
  // the director (duelist/brain.js header, director.js; COMBAT.md "The duelists' pressure"). Per-phase
  // arrays [P1, P2, P3]
  pressure: {
    chainDepth: [4, 5, 7], // moves in a row (links and the flow) before a breather ...
    chainRest: [[0.45, 0.75], [0.25, 0.45], [0.15, 0.35]], // ... of this much footwork
    linkCut: 0.5, // a link starts at this fraction of the recovery (the first part: the punish window)
    chainCut: 0.5, // ... and the old flow roll (`chain`) at this one
    // where the hero is as a move ends (a link's `when`): near / mid / far (m), front / behind (rad
    // off his facing), away (m/s backing off)
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 3, 3], overRun: 0.1, sameCat: 0.7, // a category picked again: × sameCat; past maxRun in a row × overRun
    floorAfter: [16, 13, 10], floorBoost: 1.8, floorForce: 2, // a category absent floorAfter s weighs more; × floorForce of it: forced
    seek: { max: 2.5, every: 9 }, // the footwork keeps to another range for an absent category (s at most / at most every)
    farDist: 6, closerBoost: 1.8, // past farDist m the gap closers × closerBoost
    maxLive: [1, 2, 3], // hazards live at once before another hazard move is picked (× 0.05)
    bias: { string: [1.5, 1.6, 1.7] }, // a category's weight × this (the strings: the most cues a second)
    density: [1, 1.5, 1.8], // the busier moves weigh more: × (their cues a second as authored)^density (director.js densityOf)
    mixed: 0.1, // a move asking a guard while a dodge is due within guard.horizon s (or the other way) × this
    holdGap: 5, // a breather longer than this (a test, the Lab) holds the links and the flow too
    // the fairness guard: two cues needing different answers never within `sep` s (+ `margin`): a
    // blade's blow waits at the cock (maxHold s at most a blow), a called strike waits (maxDelay)
    guard: { sep: 0.3, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 1.4, pad: 0.12 },
    // what tests/integration/fox.mjs PACE asserts (duel.mjs's PACE: a steady defender in god mode, the
    // hero roaming 2.5 - 9 m, on the real terrace; the paper selves' cuts count as his cues). Measured
    // 2026-11-21 on five seeds x 120 s (4242, 7, 99, 1337, 2024): P1 63.7 - 68.3 cues a minute (mean
    // 65.8), P2 80.6 - 89.5 (84.2), P3 80.1 - 84.9 (83.5); P2 / P1 at least 1.18 per seed, 1.28 in the
    // mean; P3 / P2 0.95 - 1.02 per seed, 0.99 in the mean; longest gap 3.79 / 2.87 / 3.12 s; 0
    // conflicts. Phase 3 is not busier than phase 2 (the 0.42 s floor, the long casts: the Round, the
    // black pearl, the Pearl): it asks more instead, 15 % of its cues a dodge against phase 2's 8 %. The
    // margins as Shen Hui's: about 8 % under the worst seed's ramp, 4 % under the mean's, 8 % under the
    // slowest seed's rate, half a second over the longest gap.
    // (2026-11-22, bare-handed: Tian Lei's strike builders, the drive, Fox Descending, Pearl Rain; the same
    // five seeds x 120 s: P1 65.3 - 71.6 (68.3), P2 76.7 - 83.4 (80.2), P3 75.9 - 82.0 (79.3); P2 / P1 at
    // least 1.10 per seed, 1.175 in the mean; P3 / P2 0.93 - 1.06 per seed, 0.99 in the mean; the longest
    // gap 3.42 / 3.34 / 3.45 s; 0 conflicts; a dodge in 11 / 12 / 17 % of the cues. The margins as before)
    meter: { ramp: [1, 1.01, 0.86], rampMean: [1, 1.13, 0.95], minRate: [60, 70, 70], maxGap: [3.9, 3.8, 4.0] },
  },
  // a hero drinking a flask: no gap, and the moves that close distance are favoured × `weight`
  punish: { weight: 4 },

  // ---- the duel's moments (ADR-062)
  // the full deflect: every real hit of a string of at least `minHits` parried → he reels (react
  // 'reeling'), +`posture`, a cinematic moment
  fullDeflect: { minHits: 5, posture: 70 },
  // the blade lock: a PERFECT parry (DEFENSE.perfectParryWindow) of a blow marked `lock` crosses the
  // blades (player.startBladeLock): the hero's presses push the meter up `push` each, he pushes it down
  // `decay` per s (per phase); full wins, empty loses, and when `dur` s run out the hero wins if he
  // held it at `hold` or above (a tug of ~1.5 s at 8 presses a second; 5 a second just holds; none
  // loses in ~1.5 s). Won: he reels, +`posture`. Lost: he shoves the hero (`shove`) and counters.
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.38, 0.38], dur: 2.6, hold: 0.6, posture: 110, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  // the mikiri: a roll INTO a perilous thrust (a beat marked `mikiri`) steps on his blade (player.js
  // _mikiri): he is pinned and stumbles (react 'trampled'), +`posture`
  mikiri: { posture: 130 },
  // the cinematic moment (flow.cinematic): the camera `zoom` m closer, leaning `weight` toward the
  // clash, time × `slowmo` for `dur` real seconds
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  // every blow he deals (moves.js damage, the Ash Crescents) × this: the probe bots set it (a bot reading
  // 70 % of the tells should be on the edge, one reading 85 % should win)
  damageScale: 1.15,

  // ---- the phase transitions (the kindling, phase 2; ash on the wind, phase 3): one red ring blow each
  transition: { ringRadius: 6, damage: 10, knockback: 6 },


  // ---- Paper Blades' sword qi (Shen Hui's crescents: DuelFx.throwCrescent)
  crescent: { speed: 14, radius: 0.7, life: 2.2, chip: 0.25, minLead: 0.27 },

  // ---- the paper selves (clones.js FoxClones; ADR-147): his own bodies, a fixed pool built with him
  clones: {
    pool: 5, // rigs built in his constructor (never mid-fight: the seeded fights would shift)
    max: [2, 4, 5], // live at once per phase (the scatter's cap)
    scatter: [2, 3, 3], // torn off by one Scattered Leaves
    ring: [3.5, 5.5], apart: 2.2, // spawned this far round the hero, at least this far from each other
    in: 0.45, // s of tearing free: it can be popped at once, it cannot strike yet
    walk: 2.4, slot: 2.6, // m/s to its own slot this far from the hero
    reach: 3.2, // a self takes the token only this close to the hero
    every: [2.6, 1.9, 1.2], // s at least between one self's blow and the next self's windup
    windup: 0.62, recover: 0.55, // its blow's windup (paperCut) and its recovery after
    damage: 8, knockback: 0.5, parryPosture: 10,
    cleave: 1.4, cleaveHeavy: 2.6, // a cut that pops one pops every other self this near the hit point
    popPosture: 6, // each self popped adds this to the real one's posture
    hurt: [0.3, 0.32], // its two hurt spheres' radii (chest, pelvis)
    round: 0.42, // the Thousand-Body Round: the selves' cuts this far apart, his own this long after the last
  },
  // ---- the Pearl of the Hollow Moon (pearl.js FoxPearl)
  pearl: {
    charge: [1.6, 1.4, 1.4], // s of charging over the blade's tip (his guard down, his selves fight on)
    r0: 2.0, perClone: 0.35, rMax: 3.4, // its burst's radius: r0 + perClone x live selves (rMax at most)
    damage: 26, perCloneDamage: 3,
    count: [1, 3, 3], spread: 3.4, // pearls batted at once, landing in a row this far apart across his line
    time: [0.5, 0.8], per: 24, lead: 0.2, // flight: time[0] + distance / per (time[1] at most), aimed lead s ahead
    maxDelay: 0.4, // the fairness guard may lengthen its flight this much (else it comes apart uncued)
    interrupt: { hits: 2, heavy: 1, posture: 90, react: 'reeling' }, // cuts on him while he charges burst it in his hand
    driveMax: 5, // the drive (Pearl of the Hollow Moon): the dash into the hero at the end of the charge, m at most
    assist: 0.85, // a self at his side helps shape it: this far to his left
    knockback: 2.4,
  },
  // ---- the Fox-Fire Mantle (phase 3): what it sets alight where he stands
  // (fire never spreads in this game: what his fire does not touch does not burn. He keeps within his
  // bound, 12.2 m, and the terrace's charm posts stand at 16.5 m: the tail's sweep throws its flame
  // `tail.reach` m past the cut and the pounce lights the far end of its line, so the posts catch when
  // the fight comes to the rim)
  // `tails`: the fox spirit grows one tail as the mantle wakes and all nine as his bar runs out (d.tails;
  // the nine-tailed fox of the old tales)
  mantle: { grow: 1.0, tails: 9, ignite: { every: 0.6, r: 1.5, k: 0.5 }, tail: { reach: 1.0, k: 0.8 } },
  // ---- what his blows do to the world (POWER: 1 fells a tree; DUEL_WORLD's fields for the blade)
  world: { ...DUEL_WORLD, pearl: 1.4, greatPearl: 2.0, pounce: 1.0, tail: 0.9, pounceFire: 0.8 },

  // ---- the intro: he wakes when the hero steps onto the terrace or comes this close (flow also checks)
  wakeRadius: 9,
};

/** Value for the phase (1-based) from a per-phase array, or the value itself. */
export function perPhase(v, phase) {
  return Array.isArray(v) ? v[Math.min(v.length, Math.max(1, phase)) - 1] : v;
}
