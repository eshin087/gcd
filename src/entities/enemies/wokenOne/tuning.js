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
  weapon: 'fist', // what his blows sound like through the air (duelist/attackSound.js: dragon:attack; his guns' shots sound on their own)
  flashLead: 0.26,
  minFirstWindup: 0.42,
  minHitGap: 0.32,
  // the rebuild (?oneMoves=a, moves.js): a blue / red / black blow reaches its coil in `drift` of the time it
  // had and holds it to `to` at most, the strike keeping `keep` of its time at least (heldTell); the fast strings' windups (the first at minFirstWindup, the next at
  // `next`, both unscaled by the phase (`fixed`): next is the floor of flashLead + a frame, and next + a
  // blow's 0.08 active clears minHitGap) and their damage
  held: { drift: 0.75, to: 0.84, keep: 0.7 },
  fast: { first: 0.42, next: 0.28, damage: 7 },
  windupScale: [1, 0.96, 0.92], // (the first windups are authored >= 0.46 s: x 0.92 keeps them over minFirstWindup)
  recoveryScale: [0.8, 0.82, 0.76],
  close: { first: 3.0, next: 1.5, speed: 13 },
  reach: { fist: 1.7, kick: 2.1, line: 2.2, lineW: 0.8 },
  // ADR-162's kit, as Tian Lei's (his use of it: ADR-168): his arms open as the hero's do at the end of a blow (anim.js `armSoft`: the
  // bosses' shared soft reach left every punch landing with the elbow at ~130°) and his kicks keep a little
  // bend at full stretch (`legSoft`)
  armSoft: [0.93, 0.99],
  legSoft: [0.9, 0.985],
  // the rebuild (?oneMoves=a): his kicks land with the leg straight (the owner: "a straight line when his kick
  // is out", not a triangle): the legs open to `legSoftA` and a lifted foot far from the hip is carried out
  // (anim.js kickStretch [from, to, add, lift0, lift1]); his straight punches land with the arm long
  // (`armSoftA`, and the hit key's hand `reach` x further from the shoulder: moves.js beatA)
  legSoftA: [0.95, 0.998],
  armSoftA: [0.95, 0.996],
  kickStretch: [0.62, 0.86, 0.3, 0.28, 0.5],
  reach: 1.16,
  travelCut: 0.7, // (the butterflies carry him this much less: moves.js shortTravel)
  legReach: 1.05, // (a kick's contact key: the striking foot this x the leg's length from its hip: moves.js longLeg)

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
  // (idleGap, chain, pressure.chainDepth and pressure.chainRest are per GEAR in phase 1: GEARED, below)
  openingGap: [[0.14, 0.4], [0.1, 0.32], [0.08, 0.26]],
  // the director (duelist/brain.js header, director.js): he throws things, so guard.sep is 0.4 (the Lord's
  // and Tian Lei's)
  pressure: {
    linkCut: 0.5,
    chainCut: 0.5,
    near: 3.3, far: 6, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 2, 3], overRun: 0.1, sameCat: 0.7,
    floorAfter: [16, 14, 16], floorBoost: 1.8, floorForce: 2,
    seek: { max: 2.5, every: 9 },
    farDist: 6, closerBoost: 1.8,
    maxLive: [1, 2, 2],
    bias: { string: [1.5, 1.0, 1.1], flurry: [1.1, 1.1, 1.1], closer: [1.2, 1, 1.1], area: [1.1, 1.0, 1.0], hazard: [1.2, 1.2, 1.0], terrain: [1, 1, 1.3], ranged: [1, 1.5, 1.2], spell: [1, 1, 1.2], single: [1, 1, 1.0] },
    density: [0.6, 0.7, 0.8],
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.4, margin: 0.06, maxHold: 0.5, maxDelay: 0.9, horizon: 0.8, pad: 0.18 },
    // THE PURSUIT (duelist/brain.js header; Tian Lei's block, ADR-162; his: ADR-168): a blow the hero has run out of the reach
    // of breaks off before its glint (no swing at air; a glint is always followed by a blow) and he chases; a
    // hero backing away is chased with closeK x the step-in and dashK x a dash's length, by phase
    pursue: { margin: 0.5, after: 0.06, gap: 0.06, closeK: [1.0, 1.6, 1.6], dashK: [1.0, 1.5, 1.5], away: 1.2, leapLead: 0.35, blinkLead: 0.4, blinkKeep: 0.6, miss: 0, lead: 0.6, habit: 0.6, habitMax: 3, habitDecay: 0.1 },
    // what tests/integration/woke.mjs PACE asserts, per STAGE [phase 1 gear 1, phase 1 gear 2, phase 2, phase 3]
    // (the rework, ADR-168; measured 2026-11-23 on the real set, three seeds 4242 7 99 x 60 s a stage, the WORST
    // seed with a margin): cues a minute (seed means) 85.2 / 87.3 / 74.9 /
    //  76.7; longest gap 2.42 / 2.39 / 2.23 / 3.32 s; dodge 13 / 10 / 7 / 21 %; 0 conflicts; the
    // fire field's peak about 1380 blobs (phase 3). A flurry burst of 6 - 8 blows is ONE cue (the owner's choice),
    // and so is a burst of three bullets: gear 2 counts below the plan's 95 - 105 though its strings run at the
    // 0.32 s floor. Main before the rework: 67.2 / 106.3 / 82.9 by phase (each of Iron Rain's 11 shots a cue)
    meter: { rampMean: [1, 1.0, 0.82, 0.82], minRate: [70, 78, 65, 62], maxGap: [3.3, 3.0, 3.5, 3.9], dodge: [0.05, 0.3] },
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
  heavyShot: { speed: 24, radius: 0.45, size: 1.25, range: 24 }, // (size > 1.2: AscFx's big blast, world.bigBlast on cover)
  // Iron Rain (THE BULLETS' RULE, ADR-169; iron.js): he strafes round the hero at `strafe` m firing from
  // alternating hands: `bursts` bursts of `per` slugs of `damage`, `gap` s apart inside a burst, `rest` s
  // from a burst's last slug to the next one's first; then the last big one (returnable). Each burst ONE
  // cue (a glint `glint` s before it; its aim fixed there) and ONE result: a hit flinches the hero `stun`
  // s (the buffer kept; `mercy` s more in which no bullet staggers him again), the burst's other slugs
  // are chip; a parry turns the burst (slugs within `parryKeep` s of it spark off). A held guard pays
  // `guardCost` a slug (12 a burst, 36 a volley) and `lastCost` for the big one, never health
  ironRain: { bursts: 3, per: 3, gap: 0.09, rest: 0.5, glint: 0.26, damage: 3, last: 14, strafe: [7, 10], speed: 6.5, guardCost: 4, lastCost: 9, stun: 0.18, mercy: 0.1, parryKeep: 0.3 },
  // every other shot of his (the heavy shots, the point-blank one, the bolts): inside this many s of a
  // bullet of his that HIT the hero, it goes harmless (iron.js shotHit; the bullets' rule)
  shotMercy: 0.45,
  // the reload: after `after` ranged moves he throws both guns away and takes two more from the coat
  reload: { after: 3, dur: 0.6 },
  // THE BEND (phase 2): a returned shot or the engine's heavy-blow evade. Time slows for everyone; he
  // arches back; it costs him `posture` (shot / cut), he is open `open` s and the first cut crits (x crit);
  // he cannot bend twice inside it; a melee bend at most once in `every` s
  bend: { slowmo: 0.3, dur: 0.7, open: 1.0, posture: { shot: 50, cut: 16 }, crit: 1.5, every: 6, returned: 50 },
  // THE STOP (phase 3): a returned bolt hangs before his raised palm (rooted `root` s, + `posture` each);
  // up to `max` hang; Return to Sender sends them; unsent after `life` s they drop as loose digits
  stop: { max: 3, root: 0.5, posture: 25, life: 4, sendPosture: 20 },
  bolt: { speed: 22, radius: 0.5, size: 1.25, range: 24 }, // (size > 1.2: world.bigBlast on cover)
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

  // ---- THE REWORK (ADR-168): phase 1's two gears, the flurry burst, Borrowed Wall
  // GEAR 2: bar 1 at or under `at` of its full (about a third into phase 1), between two moves (never
  // inside a string) he flips back and the left hand comes out: the move `secondHand` (`open` s, his
  // guard down). The pressure numbers of each gear: `gears` (read through GEARED, below)
  gear2: { at: 0.83, open: 0.9 },
  // THE FLURRY BURST (flurry.js): a parry of it costs him this much posture on top of the parry's own
  // (a heavy deflect)
  burst: { parryPosture: 20 },
  // BORROWED WALL (wokenOne.js _wallPick / _wallRun): the uprights within `seek` m of him; the one he
  // reaches inside `reachT` s at `speed` m/s whose line of flight comes at the hero most from the SIDE;
  // `up` m up its face by `springAt` of the windup; the long hang (time at `slow` for `slowDur` s at the
  // arc's top) only when the hero stands in the kick's line, at most once in `slowEvery` s
  wall: { seek: 9, reachT: 0.4, speed: 9.5, up: 1.8, springAt: 0.62, runTo: 0.4, slow: 0.45, slowDur: 0.18, slowEvery: 12 },
};

// ---- the gears' pressure (phase 1 only; the per-phase arrays stay three long): GEARED.now is set by
// wokenOne.js as the gear changes, and the arrays below are read through getters, so the brain (which
// reads TUNING.pressure.chainDepth[phase - 1] and the like) sees gear 2's numbers in phase 1 once it is on
export const GEARED = { now: 1 };
const GEAR_P = {
  // [gear 1, gear 2] of phase 1's value; phases 2 and 3 after them
  idleGap: [[0.04, 0.14], [0.02, 0.1]],
  chain: [0.7, 0.85],
  chainDepth: [5, 7],
  chainRest: [[0.3, 0.5], [0.15, 0.3]],
};
const P23 = {
  // (phase 2: a burst of bullets is ONE cue now, so its pressure went up to keep pace with gear 2)
  idleGap: [[0.02, 0.08], [0.02, 0.08]],
  chain: [0.82, 0.82],
  chainDepth: [7, 7],
  chainRest: [[0.15, 0.3], [0.15, 0.3]],
};
const geared = (k) => () => [GEAR_P[k][GEARED.now >= 2 ? 1 : 0], ...P23[k]];
Object.defineProperty(TUNING, 'idleGap', { get: geared('idleGap'), enumerable: true });
Object.defineProperty(TUNING, 'chain', { get: geared('chain'), enumerable: true });
Object.defineProperty(TUNING.pressure, 'chainDepth', { get: geared('chainDepth'), enumerable: true });
Object.defineProperty(TUNING.pressure, 'chainRest', { get: geared('chainRest'), enumerable: true });
