import { PLAYER_SCALE } from '../../player/model.js';
import { LETHAL } from '../../../combat/rules.js';

// Gu Shan, the One-Blow Hermit's numbers (ADR-138). Per-phase values are [phase 1, 2, 3]. Times in
// seconds, distances in metres. Starting values: tune them in the Lab and with the bots of
// tests/integration/hermit.mjs (WIN, BOTS, STRATEGY).
//
// The whole fight is reading. Every blow of his is the whole of the hero's life (`lethal`, ADR-139:
// player.js resolves it), every blow has a huge, slow, obvious tell (a windup of 1 s and more, a
// bait hold at the cock that is never the same, the flare 0.4 s before the impact), and he is GREEDY:
// he never guards in a windup or a recovery, so the hero may cut him while the blow is coming and
// must get out in time. One health bar, three phases (`phaseAt`): P1 one blow at a time, P2 two blows
// that ask two answers and the ground itself, P3 both hands (three-blow strings), the cover gone.
export const TUNING = {
  name: 'GU SHAN, THE ONE-BLOW HERMIT',
  // one bar (the god-mode mixed bot's fight 100 - 150 s, each phase 25 s at least; tests WIN / BOTS). Ten
  // seeds at 9300 with skin 0.7: the god-mode reader 100 - 102 s; readers at 95 / 85 / 70 % of his cues
  // win 10 / 2 / 0 of 10 (9600 with skin 0.5: 103 - 115 s and 10 / 1 / 0)
  hp: 9300,
  phaseAt: [1, 0.66, 0.33],
  radius: 0.42,
  // his drawn size: 1.1 x the hero's (visual only)
  scale: PLAYER_SCALE * 1.1,
  // the circle he keeps to: the level's CONFIG.world.dragonBound (the ring of striking stones) caps it
  bound: 14,

  // ---- every blow kills (ADR-139; combat/rules.js LETHAL is the default, passed as `hit.lethal`):
  //   whole      at or above this share of his health an unanswered blow leaves `leave` health (LAST
  //              BREATH) and throws him `throw` m with a knockdown; below it the blow kills
  //   guardNeed  a held guard with at least this share of the meter is SHATTERED (no health lost, the
  //              whole meter gone, knocked open 0.8 s, pushed `guardPush` m); with less: as no answer
  //   minApart   (his suite) no two lethal impacts closer than this
  lethal: { ...LETHAL, minApart: 0.9 },
  // his skin: a cut that lands while his blow is coming (a windup) bites at `windup` (sparks off the
  // gathered qi); in his recovery in full, broken x posture.breakCritMult. Counters, flurries and
  // executions are final damage and ignore it
  skin: { windup: 0.7 },

  // ---- tells (COMBAT.md "The One-Blow Hermit"; checked by tests/integration/hermit.mjs DATA). The
  // flare comes 0.4 s before the impact: a roll or a parry made on it is always in time (parry 0.22 s,
  // perfect dodge 0.2 s)
  flashLead: 0.4,
  minFirstWindup: 1.0,
  minHitGap: 0.9,
  windupScale: [1, 0.9, 0.82],
  recoveryScale: [1, 0.9, 0.85],
  // (a palm steps in up to `first` m through its windup; a string's next blow `next`)
  close: { first: 3.0, next: 1.4, speed: 6 },

  // ---- posture: parries are few (about five a minute), so the meter is short and slow to drain
  posture: {
    max: [260, 300, 340],
    hit: { light: 4, heavy: 12 },
    guard: { light: 6, heavy: 16 },
    regenDelay: 5,
    regenRate: 10,
    breakTime: 4,
    breakCritMult: 2,
  },

  // ---- his guard: an open palm in his footwork turns the hero's cuts; never in a windup or a
  // recovery (he is greedy); after counterChance guarded cuts in a row he answers with Reproach
  guard: {
    arc: 1.31,
    raiseDelay: 0.3,
    windupOpen: 0,
    recoverOpen: 1,
    counterChance: [0, 0, 0.5, 1],
    countWindow: 2.5,
    crushPoise: 48,
    clashStop: 0.07,
    deflectStop: 0.1,
    evade: 0,
    wardLinger: 0.6,
  },
  trade: { posture: 1.5, push: 0.4 },
  camera: { within: 7, fade: 4, zoom: -5 },
  flinch: { breakOff: 3, window: 1.6, hitStun: 0.2 },
  hitStun: { light: { stop: 0.06, jolt: 0.45, push: 0.06, shudder: 0.04 }, heavy: { stop: 0.09, jolt: 0.8, push: 0.16, shudder: 0.06 }, critStop: 0.12, joltDecay: 5 },
  parts: { head: 1.3, body: 1, leg: 0.9 },

  // ---- the execution
  execRange: 3.4,
  ghostepBehind: 1.5,
  execution: { damage: 300 },

  // ---- footwork: an old man's walk; he does not sprint (Idle Finger and One Step answer a hero who
  // keeps away)
  move: {
    walk: 1.5,
    run: 4.2,
    sprint: 4.2,
    turn: [5, 5.5, 6],
    trackTurn: [7, 7.5, 8],
    band: [2.2, 4.2],
    sprintAt: 99,
    near: 1.2,
    backChance: 0.2,
    backstep: { dist: 1.6, time: 0.4 },
    strafeSwitch: [1.6, 3.0],
  },
  idleGap: [[0.5, 1.0], [0.35, 0.7], [0.25, 0.5]],
  openingGap: [[0.5, 0.9], [0.4, 0.8], [0.35, 0.7]],
  chain: [0, 0.25, 0.4],
  // the director (duelist/brain.js header, director.js): the slowest duelist by design
  pressure: {
    chainDepth: [1, 2, 2],
    chainRest: [[0.9, 1.4], [0.6, 1.0], [0.4, 0.8]],
    linkCut: 0.7,
    chainCut: 0.7,
    near: 3.4, far: 7, front: 0.9, behind: 2.2, away: 1.2,
    maxRun: [2, 2, 2], overRun: 0.2, sameCat: 0.6,
    floorAfter: [0, 0, 0], floorBoost: 1, floorForce: 0,
    seek: { max: 2, every: 10 },
    farDist: 7, closerBoost: 1.6,
    maxLive: [1, 1, 2],
    bias: { string: [1, 1, 1.2], closer: [1, 1.2, 1.1], area: [1, 1, 1], hazard: [1, 1, 1], terrain: [1, 1, 1], ranged: [1, 1.1, 1.1], spell: [1, 1, 1], single: [1, 1, 1] },
    density: [0.4, 0.5, 0.6],
    mixed: 0.1,
    holdGap: 5,
    guard: { sep: 0.7, margin: 0.1, maxHold: 0.6, maxDelay: 1.2, horizon: 2, pad: 0.2 },
    // what tests/integration/hermit.mjs PACE asserts, set from ten seeds (4242 7 99 1337 2024 11 23 555 808
    // 31337, 120 s a phase, a god-mode defender who answers every cue): cues a minute P1 12.7 / 13.7 /
    // 14.2 (min / mean / max), P2 16.0 / 17.4 / 19.2, P3 18.3 / 21.1 / 25.9; the longest gap 4.9 / 4.2 /
    // 4.8 s; to dodge 61 / 72 / 62 %; 0 conflicts; lethal impacts never closer than 1.0 s. Each phase
    // busier than the one before (x1.27, x1.21 in the mean)
    meter: { ramp: [1, 0.95, 0.95], rampMean: [1, 1.15, 1.1], minRate: [11, 14, 16], maxGap: [6.5, 6, 6] },
  },
  // he does not punish a drink: no move weighs more, and he starts none while the hero drinks
  // (hermit.js weigh)
  punish: { weight: 1 },

  // ---- the duel's moments (no blade lock, no mikiri, no flurry of his: no move asks for them)
  fullDeflect: { minHits: 3, posture: 60 },
  lock: { start: 0.5, push: 0.085, decay: [0.32, 0.35, 0.38], dur: 2.6, hold: 0.6, posture: 100, shove: { damage: 12, knockback: 2.6 }, camera: { zoom: -7, weight: 0.55 } },
  mikiri: { posture: 120 },
  cinematic: { zoom: -10, weight: 0.6, slowmo: 0.28, dur: 0.9 },
  damageScale: 1,

  // ---- Split Earth's fissure runs in the crescent pool (DuelFx.throwCrescent, style 'fissure')
  crescent: { speed: 13, radius: 0.9, life: 1.8, chip: 0 },

  // ---- what his blows do to the world (ADR-107, the POWER scale: 1 fells a tree; duelist/
  // worldTuning.js DUEL_WORLD for the rest). Every blow's damage is 160, so `per` 80 gives the zone 2.0
  // (a red one x 1.25); hermit.js onImpact adds the rest:
  //   carry       the force past the zone: the palm `palm.len` m at `palm.power`, The One Blow the
  //               whole lane at `lane` with a scar down its length
  //   crater      Peak Falls' crater (r, power); the transitions' stamp
  //   fissure     the floor torn along Split Earth
  //   wind        the first cover between him and the hero on a line blow (beat `wind`): it takes this
  //               and the hero behind it is untouched
  //   deflected   a parried palm's force turned past the hero at an angle
  //   thrown      the hero's slide on a Last Breath or a shattered guard: what stands behind him breaks
  //   burn        the pines The One Blow passes catch (world.ignite k)
  world: {
    per: 80, red: 1.25,
    palm: { len: 9, power: 1.4 },
    lane: 3.0,
    crater: { r: 4.5, power: 2.4 },
    stamp: { power: 2.5, falloff: 0.5 },
    // what the transitions do to the ring's eight inner stones wherever they stand: The Mountain Answers
    // cracks them, Both Hands fells them outward
    inner: { stamp: 1.1, clap: 4.0 },
    rim: { clap: 1.3 },
    fissure: 1.2,
    wind: 3.0,
    crescent: 3.0,
    deflected: 1.6,
    thrown: 2.4,
    burn: 0.6,
    // (the WRECKAGE scenario: after a full bot fight at least this share of the striking stones is down)
    meter: { posts: 0.6 },
  },

  // he stands with his palm on a stone until the hero steps onto the ledge
  wakeRadius: 9,
};
