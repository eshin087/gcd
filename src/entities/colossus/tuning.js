import { TELL } from '../../combat/rules.js';
import { SHELF } from '../../world/tideShelf.js';

// NAERATH, THE TIDE COLOSSUS: every number of the fight (docs/COMBAT.md "The Tide Colossus"; ADR-141 –
// ADR-143). Content is data: the attack table, the poses, the phases, the world's powers. World metres,
// game seconds. First numbers, tuned with tests/integration/tide.mjs's bots.

const E = SHELF.edgeZ, SEA = SHELF.seaY;

/** One knob for the whole body (1 = the plan's numbers). */
export const SIZE = 1;

/** The body: where the parts are rooted, how long the bones are. */
export const BODY = Object.freeze({
  root: Object.freeze({ x: 0, y: SEA, z: E - 24 }), // the body's anchor in the sea (object3d.position)
  shoulder: Object.freeze({ x: 12, y: -3, z: E - 13 }), // ±x
  // (the plan's 13 + 15 m left the shelf's south third out of reach from shoulders 13 m behind the rim:
  // 14 + 16, with the root leaning up to 3 m toward the rim, reaches the scarp; ADR-141)
  upper: 14 * SIZE,
  fore: 16 * SIZE,
  soft: 0.08, // two-bone IK's soft reach (ik.js)
  palm: Object.freeze({ len: 3.6 * SIZE, wide: 4.2 * SIZE, thick: 0.9 * SIZE }),
  finger: Object.freeze({ len: 3.4 * SIZE, r: 0.42 * SIZE }),
  neckBase: Object.freeze({ x: 0, y: -4, z: E - 20 }),
  neckSegs: 3,
  head: Object.freeze({ wide: 9 * SIZE, tall: 4.5 * SIZE, len: 8 * SIZE }),
  sway: Object.freeze({ side: 4, rim: 3, k: 2.2 }), // the root leans toward the acting side / the rim (m), spring rate
});

/** Named poses and the PHONE RULE (ADR-142): a striking hand's windup never lifts it more than `lift` m
 *  above the shelf nor holds it further than `near` m (over the ground) from where it will land: the
 *  threat reads from the hand hovering over him like a ceiling, the spread fingers and its shadow. */
export const POSE = Object.freeze({
  lift: 3.5,
  near: 6,
  grip: Object.freeze({ x: 9, y: 2.1, back: 2.8, tips: 3.5 }), // wrist ±x, y, m north of the rim; fingertips m over it
  reel: Object.freeze({ x: 15, y: 4.5, back: 9 }),
  loom: Object.freeze({ y: 3.5, back: 4, follow: 10 }), // maw (hx, y, rim - back), hx follows the hero within ±follow
  rear: Object.freeze({ y: 5, back: 6 }),
  down: Object.freeze({ y: 1.2, fwd: 0.5 }), // chin on the rim
  // critically damped springs: stiffness (1/s) per phase for the hands and the head
  stiff: Object.freeze({ hand: [5.5, 6.2, 7], head: [3.2, 3.6, 4.2] }),
  shelf: Object.freeze({ zMin: 1.6, zMax: SHELF.scarpZ - 1.2, xMax: SHELF.half }), // where a hand may land (rim + zMin .. zMax)
});

const R = TELL.RED, B = TELL.BLUE, N = TELL.NORMAL, K = TELL.BLACK;

/**
 * The attacks. Every hit declares its tell. Times are windups (to the impact), `rec` the recovery (the
 * opening; scaled by phaseTimeScale with the windups), `cd` the cooldown, `w` the director's weight per
 * phase ([p1, p2, p3]; 0 = not in that phase), `links` [{ to, chance }].
 *   slam / hammer / grasp / blackFathom  a hand over a spot near the hero; `track` s before the impact it
 *          stops following; `r` the blow's radius
 *   sweep  the forearm scraped along the rim at `speed` m/s over `len` m; the band `band` m from the rim
 *   breath a beam `width` m wide from the maw, swept along the shore in `pass` s; `passes` per phase
 *   surge  a wall of water `depth` m deep crossing the shelf at `speed` m/s
 */
export const ATTACKS = Object.freeze({
  slam: { label: 'Palm slam', phase: 1, tell: R, windup: 1.0, track: 0.45, r: 3.6, damage: 30, knockdown: true, rec: 1.6, cd: 3, w: [3, 2.2, 1.6], links: [{ to: 'hammer', chance: 0.25 }] },
  hammer: { label: 'Knuckle hammer', phase: 1, tell: B, flare: true, windup: 0.9, track: 0.4, r: 2.4, damage: 26, knockback: 4, rec: 1.3, cd: 2.5, w: [3, 2.2, 1.6], links: [{ to: 'slam', chance: 0.2 }] },
  sweep: { label: 'Rim sweep', phase: 1, tell: B, windup: 1.1, speed: 20, len: 22, band: 9, r: 1.6, damage: 24, knockback: 6, rec: 1.4, cd: 6, w: [1.6, 1.3, 1.1] },
  flick: { label: 'Finger flick', phase: 1, tell: N, windup: 0.7, r: 3.0, damage: 14, knockback: 7, rec: 0.9, cd: 4, near: 3.5, after: 2.5, w: [0, 0, 0] },
  breath: { label: 'Tide breath', phase: 1, tell: R, parryable: false, blockable: false, windup: 1.8, width: 1.6, pass: [2.4, 2.0, 2.0], gap: 0.5, passes: [1, 2, 2], reach: 23, damage: 34, knockdown: true, spent: [2.4, 2.4, 1.8], cd: 14, open: 8, w: [1.4, 1.5, 1.8], linger: 5, tick: 0.4, tickDamage: 6 },
  breaker: { label: 'Breaker (3 hits)', phase: 2, string: true, hits: [{ tell: N, windup: 0.9, side: -1 }, { tell: N, windup: 0.6, side: 1 }, { tell: B, flare: true, windup: 0.75, side: 0 }], r: 2.4, clapR: 3.2, damage: [16, 16, 26], knockback: 3, track: 0.4, rec: 1.8, cd: 8, w: [0, 2.0, 2.0] },
  crossSweep: { label: 'Cross sweep (2 hits)', phase: 2, string: true, hits: [{ tell: B }, { tell: R }], windup: 1.1, ret: 0.9, speed: 20, len: 22, band: 9, retSpeed: 26, retBand: 7, r: 1.6, damage: [22, 26], knockback: 6, rec: 1.6, cd: 10, w: [0, 1.2, 1.3] },
  surge: { label: 'Tide surge', phase: 2, tell: R, hazard: true, plunge: false, windup: 1.4, depth: 2.6, speed: 11, damage: 22, knockback: 6, cd: 12, w: [0, 1.2, 1.4] },
  blackFathom: { label: 'Black Fathom', phase: 2, tell: K, windup: 1.5, hold: [0.15, 0.6], track: 0.5, r: 4.5, damage: 44, knockdown: true, rec: 2.0, cd: 14, w: [0, 0.9, 1.0] },
  grasp: { label: 'Drowning grasp', phase: 3, tell: R, windup: 1.1, track: 0.4, r: 3.0, rake: 8, rakeT: 0.5, damage: 28, knockdown: true, rec: 2.0, cd: 9, w: [0, 0, 1.8] },
  bellow: { label: 'Bellow', phase: 1, tell: N, windup: 1.2, push: 3, w: [0, 0, 0] },
});

export const TUNING = Object.freeze({
  maxHp: 3600,
  phaseAt: Object.freeze([1, 0.66, 0.33]),
  damageScale: 1,
  partMult: Object.freeze({ head: 1.6, hand: 1.0, wrist: 0.85, finger: 0.6, body: 0.6 }),
  posture: Object.freeze({ max: Object.freeze([320, 380, 440]), headMult: 1.25 }),
  phaseTimeScale: Object.freeze([1, 0.86, 0.75]),
  idleGap: Object.freeze([[0.9, 1.4], [0.6, 1.0], [0.35, 0.7]]),
  // after a move the hero answered (a parried last blow, a flurry, a counter)
  openingGap: Object.freeze([[1.2, 1.8], [0.9, 1.3], [0.6, 0.9]]),
  flashLead: 0.35,
  // fairness (COMBAT.md rule 10): the first windup of a move at least `minWindup` in phase 1; impacts in a
  // string at least `stringGap` apart; two cues that need different answers never within `apart`
  fair: Object.freeze({ minWindup: 0.7, stringGap: 0.45, apart: 0.3, hold: 0.5 }),
  // the director: no safe spot (a hero deeper than `deep` m from the rim for `deepT` s: breath and surge
  // x `deepK` in the pick), a repeat penalty
  director: Object.freeze({ deep: 14, deepT: 4, deepK: 3, repeat: 0.35, nearHand: 3.5 }),
  // the grip: a hand that takes `hp` damage inside `window` s lets go for `letGo` s; the head drops for
  // `headDown` s and takes `posture`
  grip: Object.freeze({ hp: 240, window: 6, letGo: 5, headDown: 2.6, posture: 80 }),
  broken: 3.2, // posture break: the chin on the rim (POSTURE.breakTime)
  plunged: Object.freeze({ down: 1.6, flash: 0.45 }),
  stagger: 1.4,
  recoil: 0.7, // a parried last blow: the hand thrown back
  deflectKnock: Object.freeze({ time: 0.14, dist: 1.2 }),
  intro: Object.freeze({ slamL: 1.4, slamR: 2.3, rise: 3.0, roar: 3.6, done: 5.0 }),
  death: Object.freeze({ slip: 1.6, fall: 3.2, dissolve: 2.4 }),
  flashDecay: 4,
  // the hero's hits on parts pushed through takeHit's `part` (player.js): what the flinch moves
  flinch: Object.freeze({ hand: 0.5, head: 1.0 }),
  // the world (POWER scale: 1 fells a tree; ADR-107); every call guarded with ?.
  world: Object.freeze({
    slam: 1.3, slamR: 4.2, hammer: 1.0, hammerR: 2.8, clap: 1.2, clapR: 3.6, sweep: 0.9, sweepR: 1.6,
    blackFathom: 1.6, blackR: 5, grasp: 1.0, graspR: 3.4, furrow: 0.6, flick: 0.5,
    breath: Object.freeze({ cover: 0.5, ground: 0.35, every: 3 }),
    surge: 0.35, wind: Object.freeze({ bellow: Object.freeze([0.3, 30, 0]) }),
    intro: 1.2, death: 0.8, falloff: 0.6,
    // a hand or the head moving through the world (its body, ADR-107's trample): power per m/s over `min`
    body: Object.freeze({ min: 6, per: 0.05, max: 0.7, y: 2.6 }),
    ignite: Object.freeze({ breath: 0 }), // brine does not set alight
  }),
});

/** A per-phase value: arrays are indexed by phase, scalars are the same in every phase. */
export const perPhase = (v, phase) => (Array.isArray(v) ? v[Math.max(0, Math.min(v.length - 1, (phase | 0) - 1))] : v);
