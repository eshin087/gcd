// Terrain moves (ADR-110; docs/COMBAT.md "The wyrm uses the ground"): the wyrm takes what stands in
// the clearing and uses it. Registered into TUNING.attacks by tuning.js (Object.assign), so the Lab,
// Training, abilities() and hitPlayer read them like every other attack. The performances live in
// terrainAttacks.js; the piece in the jaws, in the air and where it lands in terrain.js.
//
// Units: seconds (phase-1 values; windups and recoveries x d.tScale in later phases, a piece in the
// air keeps its speed), WORLD metres, HP. Lengths that follow the body are written as model units x
// SCALE in a comment. `phase` = the first phase the AI uses it in (the Lab can force any); `weight` =
// AI weight per phase [P1, P2, P3]; `cooldown` s after it ends. A move is only picked when a piece
// it can use is in reach (terrain.js: jawsPiece / tailPiece); with none, its weight is 0.

import { TELL } from '../../combat/rules.js';

/** What the jaws and the tail can reach. A landing is marked as every footprint is: the ground heats up (ADR-052). */
export const TERRAIN = {
  jaws: {
    // the jaws close on a piece this far ahead of the root (3.3 .. 5.2 model units x SCALE 1.875:
    // nearer, the head cannot get down under its own chest; farther, the neck is at its end)
    near: 6.2, far: 9.8, stand: 8.3,
    fetch: 21, // it will go this far (root to piece) for one: a short run, then the bite
    fetchSpeed: 9.5, // m/s of that run (a trot; the charge runs at 33)
    fetchTime: 1.7, // the longest the run may take: past it, the move is not picked
    turn: 3.4, // rad/s it turns toward the piece (its fighting turn is 1.2 .. 2.2)
    clear: 2.6, // a piece the hero stands this close to is left alone (he would be in the jaws)
    grip: [0.6, 2.4], // where on a trunk the jaws close: m above its foot (at most 0.38 of its height)
    blend: 9, // 1/s: how fast a torn piece settles into the jaws (no jump at the bite)
  },
  tail: {
    ring: [6.0, 15.5], // the piece's distance from the root: what the swinging tail reaches (3.2 .. 8.3 x SCALE)
    body: 5.2, // the line it flies must pass this far from the root (it is not batted through the wyrm)
    cos: 0.3, // the tail's travel at the piece and the line to the hero: at least this cosine apart
  },
  // the piece the wyrm has chosen stirs before it is taken: dust and grit off it, per second
  stir: 26,
};

export const TERRAIN_ATTACKS = {
  // the owner's move: it bites into a tree or a boulder, tears it out of the ground, rears its head
  // back and hurls it. One red blow where it lands; the landing is marked from the moment the piece
  // leaves the ground, follows the hero until the throw and is fixed from then on
  hurl: {
    label: 'Uproot and hurl', tell: TELL.RED, phase: 1,
    windup: 0.7, // the jaws go down to the piece and close on it
    lift: 0.65, // torn out, raised; the body turns to the hero
    aim: 0.55, // held high, cocked back: the mark follows the hero
    active: 0.24, release: 0.55, // the whip; the piece leaves the jaws at this share of it
    cock: 1.2, // rad a tree leans back over the shoulder before the whip (it leaves the jaws upright)
    recovery: 1.0, // (never shorter than the flight: it watches the piece land)
    flight: [0.85, 1.2], flightPer: 34, // s in the air: 0.55 + metres / flightPer, kept in this range
    lead: 0.45, // of the flight: it is thrown where the hero will be if he keeps going
    track: 7, // 1/s: how tightly the mark follows him before the throw
    radius: 3.4, damage: 30, knockback: 5, knockdown: true,
    power: 1.2, // on the world where it lands (world/breakTuning.js POWER: 1 fells a tree)
    // the hero's distance from the wyrm: any but under its chest. Nearer than `close` it is picked
    // less (x closeK): it turns its back on him for the tree, and that is his opening
    minDist: 5, maxDist: 36, close: 9, closeK: 0.7,
    weight: [3.2, 3.0, 2.6], cooldown: 15,
  },
  // its back to a boulder, the tail cocked, one lash: the boulder skims the ground at the hero. Blue:
  // cut it out of the air (a parry), take it on the guard, step off its line, or put a tree or a
  // standing stone between you and it (cover stops it and pays for it)
  tailBat: {
    label: 'Tail bat (a boulder)', tell: TELL.BLUE, phase: 1,
    windup: 0.95, minWindup: 0.8, // the pivot needs its time (as the tail lash's)
    active: 0.36, impact: 0.21, // the lash; the tail meets the boulder about this far into it
    recovery: 0.95,
    offset: 0.95, past: 0.75, pivotRate: 4.2, // rad short of the boulder / beyond it; rad/s of the pivot
    speed: [22, 34], cruise: 27, // m/s (it is re-timed to land on its flash + lead)
    width: 1.15, // half width of its line (+ the hero's radius)
    over: 7, // it flies this far past the hero before it comes apart
    range: [7, 32], // boulder to hero
    damage: 26, knockback: 5,
    power: 1.0, // on the cover that stops it, and where it bursts
    burst: 2.0, // radius of that last blast on the world (m)
    weight: [3.0, 3.0, 2.8], cooldown: 12,
  },
  // phase 2: a tree in the jaws, a breath up its trunk, and it is thrown burning. The blow is red;
  // where it lands the tree's wreck burns on (contact ticks, blockable) and the grass round it catches
  fireBrand: {
    label: 'Firebrand (a burning tree)', tell: TELL.RED, phase: 2,
    windup: 0.65, lift: 0.6,
    kindle: 0.8, // held out ahead: the breath runs up it
    aim: 0.45, active: 0.24, release: 0.55, cock: 1.2, recovery: 1.1,
    flight: [0.9, 1.25], flightPer: 34, lead: 0.45, track: 7,
    radius: 4.0, damage: 32, burn: 2.0, knockback: 5, knockdown: true,
    power: 1.4,
    // the wreck: s it burns, its radius, the contact ticks of a hero standing in it
    pyre: { time: 3.4, radius: 2.9, tick: 0.3, tickDamage: 4, tickBurn: 0.8 },
    ignite: [1, 1.2], // the grass and wood round it: share of a full burn, of the blast's radius
    minDist: 5, maxDist: 36, close: 9, closeK: 0.7,
    weight: [0, 2.8, 3.0], cooldown: 19,
  },
};
