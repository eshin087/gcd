// The Ash Disciple's numbers (docs/specs/ash-disciple.md; COMBAT.md → "The Ash Disciple"). Starting
// values: tune them in the Lab. Per-phase values are [P1, P2, P3]. Times in seconds, distances in metres.
export const TUNING = {
  name: 'SHEN HUI, THE ASH DISCIPLE',
  hp: 3000, // a near-perfect fencing bot (tests/integration/duel.mjs WIN) wins in about a minute
  // (the second pass: three phases, the fencer / the kindled blade / ash on the wind)
  phaseAt: [1, 0.62, 0.3], // HP fractions where each phase starts (the boss bar's ticks)
  radius: 0.42, // body circle (the hero is pushed out of it)
  bound: 12.5, // he stays this close to the courtyard's centre (min with CONFIG.world.dragonBound)

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
    chainDepth: [4, 5, 6], // moves in a row (links and the flow) before a breather ...
    chainRest: [[0.45, 0.75], [0.35, 0.6], [0.25, 0.45]], // ... of this much footwork
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
    density: [1, 1.3, 1.6], // the busier moves weigh more: × (their cues a second as authored)^density (director.js densityOf)
    mixed: 0.1, // a move asking a guard while a dodge is due within guard.horizon s (or the other way) × this
    holdGap: 5, // a breather longer than this (a test, the Lab) holds the links and the flow too
    // the fairness guard: two cues needing different answers never within `sep` s (+ `margin`): a
    // blade's blow waits at the cock (maxHold s at most a blow), a called strike waits (maxDelay)
    guard: { sep: 0.3, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 1.4, pad: 0.12 },
    // what tests/integration/duel.mjs PACE asserts (a steady defender, the hero roaming 2.5 - 9 m):
    // each phase at least `ramp` × the one before (per phase), cues a minute at least `minRate`,
    // the longest gap between cues at most `maxGap` s. (core, 2026-11-16, five seeds x 120 s with
    // today's moves: P1 69.8 - 72.1 cues/min (60.2 before the pass), P2 87.4 - 93.0 (76.0), longest
    // gap 2.87 / 2.87 s (2.49 / 2.43); phase 3 arrives in wave 2: its numbers are placeholders)
    meter: { ramp: [1, 1.08, 1.05], minRate: [64, 78, 82], maxGap: [3.4, 3.4, 3.2] },
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

  // ---- burning ground (the second pass; moveFx.js BurnLines): a beat's `burn` (moves.js) leaves a line
  // of fire on the stones. The rule of fire on grass (world/breakTuning.js FIRE; COMBAT.md "The world
  // breaks"): `damage` every `tick` s to a hero standing in it, after its first `grace` s, blockable,
  // never while he rolls. It is ground to step off, not a blow: no cue. From phase `from`; at most
  // `cap` lines alive per phase (one more puts the oldest out); `width` m, `life` s, `len` m (a line's
  // default), `ring` arcs' share of the circle; `flames` per metre a second (the fire field), `ignite`:
  // the wood it touches catches (world.ignite, k)
  // `armAfter`: a line laid by a string does not burn while that string still has blows coming (the
  // hero defends where he stands), then from this long after its last blow (its grace at least)
  // `guard` (the owner, 2026-11-16: "guard meter, no health"): with his guard up a tick costs no health
  // but this much of the guard meter (GUARD.max 100, no regen between ticks: GUARD.regenDelay 0.8 >
  // tick; the first tick 0.45 s in, then every 0.55 s): a full meter holds 2 ticks and the 3rd (34 x 3
  // > 100) knocks the guard open ~1.57 s into a line he stands on (half its life): he still has to step
  // off. (A blocked light blow drains 11 - 17: the fire drains faster, to say "move".)
  burn: { from: 2, cap: [0, 7, 9], width: 0.8, life: 3.2, len: 3.4, ring: 0.62, grace: 0.45, armAfter: 0.35, tick: 0.55, damage: 5, guard: 34, flames: 26, ignite: 0.8, fade: 0.6 },

  // ---- the projectile (Ash Crescent)
  // (`minLead`: the second pass: a crescent that would reach the hero sooner than this after it is
  // thrown is not thrown at all; disciple.onRelease)
  crescent: { speed: 14, radius: 0.7, life: 2.2, chip: 0.25, minLead: 0.27 },

  // ---- the terrain (ADR-111; terrain.js; COMBAT.md → "The Ash Disciple" → "He uses the courtyard").
  // Four moves on the pieces of the set (world.destructibles). Each is chosen only while a piece for
  // it is in reach; from the Lab it goes for the nearest one however far.
  terrain: {
    edge: 6.5, // a piece may stand this far outside his bound (the ring of pillars, the lanterns, the gate)
    leash: 5, // m/s: out past his bound for a piece, he is drawn back in this fast once the move is over
    // Severed Pillar: he is behind the standing piece nearest the hero and cuts it down on him
    fell: {
      reach: 14, // m he will cross to get behind it
      minH: 2.3, // a piece this tall at least (it must fall, not shatter)
      heroMin: 1.2, // the hero this far from its base at least ...
      over: 0.5, // ... and at most its height + this (inside the strip it lands on)
      stand: 0.45, // m of air between him and the piece
      cut: 0.85, // m up the piece where the blade goes through (drawn)
    },
    // Flying Lantern: a short stone piece (a lantern, a pillar's stump) kicked at the hero
    kick: {
      reach: 13,
      minH: 0.9, maxH: 2.3, maxWeight: 1.0, // what he can send flying
      lantern: 4, // m a lantern is preferred over a stump by
      heroMin: 4.5, heroMax: 26, // the hero this far from the piece
      stand: 0.35,
      time: [0.62, 0.95], per: 34, // s in the air: time[0] + distance / per, at most time[1]
      lead: 0.2, // s of the hero's own movement it is aimed ahead by
      hit: 1.5, // m round where it lands that it strikes the hero (+ his radius)
      power: 0.9, radius: 2.0, // its burst on the other pieces where it lands (POWER, m)
      parryPosture: 14, // a parry bursts it on the blade
      maxDelay: 0.4, // s the fairness guard may lengthen its flight by (a cue of the other answer too near)
    },
    // (the second pass) the floor: a flagstone levered up out of the paving by the blade and kicked at
    // the hero (Rising Flagstone: one; Flagstone Volley, phase 2: one a beat, two or three). Blue, the
    // flare on the flying slab flashLead before it lands; nothing drawn where it lands
    flag: {
      kind: 'flagstone', // (world/floor.js: the courtyard's paving)
      ahead: 1.5, reach: 2.2, // a whole slab within `reach` m of the point `ahead` m in front of him toward the hero
      heroMin: 3.5, heroMax: 14, // the hero this far from him (his AI)
      stand: 0.45, // m behind the slab's centre his foot is planted
      rise: 0.8, riseT: 0.16, // m it jumps up out of the paving, in s
      time: [0.45, 0.85], per: 20, // s in the air: time[0] + distance / per, at most time[1]
      lead: 0.15, // s of the hero's own movement it is aimed ahead by
      hit: 1.2, // m round where it lands that it strikes the hero (+ his radius)
      power: 0.6, radius: 1.6, // its burst on what is round where it lands
      parryPosture: 12,
      maxDelay: 0.4,
    },
    // Scattered Flagstones (phase 3): `count` slabs levered at once, gathered into a row `hang` m in
    // front of him (`row` m apart, `rise` m up) and cut through in the air: they leave as a fan, the
    // middle one at the hero, the others `spread` rad to either side
    fan: {
      kind: 'flagstone', ahead: 1.6, reach: 2.6, count: 3, need: 2,
      heroMin: 3.5, heroMax: 13, stand: 0.45,
      hang: 1.6, row: 1.75, rise: 1.0, spread: 0.42, // (a slab in his hands is a block ~1.7 m across: `row` keeps three apart)
      time: [0.5, 0.9], per: 19, lead: 0.12,
      power: 0.5, radius: 1.4, maxDelay: 0.4,
    },
    // Three Tolls: he strikes the fallen bell; each blow sends a ring of sound across the courtyard
    toll: {
      reach: 15,
      heroMax: 23, // the hero this far from the bell at most
      stand: 0.3,
      arc: 1.3, // m: the height of his leap to it
      from: 1.5, speed: 12, range: 26, // the ring: born this wide (m), m/s, where it dies
      width: 0.45, // m either side of its front that it strikes
      strike: 0.9, // his blow on the bronze (POWER; it only rings)
      parryPosture: 10,
    },
    // Swallow's Return: he leaps back onto a pillar and springs off it into a diving cut
    spring: {
      reach: 10.5, near: 2.2, // the pillar this far from him (at most / at least)
      minH: 3.2, // tall enough to spring from
      heroMin: 3, heroMax: 12.5, // the hero this far from the pillar
      perch: 2.3, // m up it where his feet land (at most; 0.9 m under its top)
      arc: 0.9, // m the leap rises above the straight line to the perch
      stop: 1.4, // the dive ends this far short of the hero (his cut reaches the rest)
      max: 12.5, // m the dive can cover
      trackTo: 0.55, // the dive follows the hero until this fraction of it
      power: 0.3, // what his feet do to the pillar (POWER, a blunt blow)
      // the defensive read: pressed (his posture over `postureOver` of its max, or struck within
      // `struckWithin` s), he wants the way out `pressed` times as much
      pressed: 2.4, postureOver: 0.4, struckWithin: 2.2,
    },
  },

  // ---- the intro: he wakes when the hero crosses the gate or comes this close (flow also checks)
  wakeRadius: 9,
};

/** Value for the phase (1-based) from a per-phase array, or the value itself. */
export function perPhase(v, phase) {
  return Array.isArray(v) ? v[Math.min(v.length, Math.max(1, phase)) - 1] : v;
}
