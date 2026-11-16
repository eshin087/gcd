// Terrain moves (ADR-110; docs/COMBAT.md "The wyrm uses the ground"): the wyrm takes what stands in
// the clearing and uses it. Registered into TUNING.attacks by tuning.js (Object.assign), so the Lab,
// Training, abilities() and hitPlayer read them like every other attack. The performances live in
// terrainAttacks.js; the piece in the jaws, in the air and where it lands in terrain.js; their dust,
// roots, splinters and fire in terrainFx.js.
//
// Units: seconds (phase-1 values; windups and recoveries x d.tScale in later phases, a piece in the
// air keeps its speed), WORLD metres, HP. Lengths that follow the body are written as model units x
// SCALE in a comment. `phase` = the first phase the AI uses it in (the Lab can force any); `weight` =
// AI weight per phase [P1, P2, P3]; `cooldown` s after it ends. A move is only picked when a piece
// it can use is in reach (terrain.js: jawsPiece / tailPiece); with none, its weight is 0.
//
// Second pass (2026-11-15, the owner: "the dragon looks very unnatural when it picks up the terrain
// and it gives too much time for the player to dodge. don't show exactly where the terrain will
// land"): about twice as fast from the tell to the blow, a whole-body grab and throw, and NOTHING
// drawn on the ground before the piece arrives. The cue is the flare on the flying piece, flashLead
// (0.35 s) before it lands. Tell to blow, phase 1 (measured by scenario TERRAIN): hurl ~1.4 - 1.6 s
// (was 2.9), firebrand ~1.8 s in phase 2 (was 3.4), tail bat ~1.1 - 1.3 s (was 1.8).

import { TELL } from '../../combat/rules.js';

/** What the jaws and the tail can reach, and how a piece hangs in the jaws. */
export const TERRAIN = {
  jaws: {
    // the jaws close on a piece this far ahead of the root (3.3 .. 5.2 model units x SCALE 1.875:
    // nearer, the head cannot get down under its own chest; farther, the neck is at its end)
    near: 6.2, far: 9.8, stand: 8.3,
    fetch: 20, // it will go this far (root to piece) for one: a lunge, then the bite (no trot)
    fetchSpeed: 24, // m/s of that lunge, at most (the charge runs at 33)
    fetchTime: 0.5, // the longest the lunge may take: past it, the move is not picked (the Lab: x1.6)
    turn: 6.5, // rad/s it whips round toward the piece as it lunges
    clear: 2.6, // a piece the hero stands this close to is left alone (he would be in the jaws)
    grip: [0.6, 2.4], // where on a trunk the jaws close: m above its foot (at most 0.38 of its height)
    blend: 18, // 1/s: how fast a torn piece is yanked up into the jaws
    // how a held piece hangs: a stiff pendulum in the jaws (rad/s^2 per rad, 1/s, rad/s^2 per m/s^2
    // of the jaws' own acceleration: a jerk forward swings the top back)
    sway: { k: 150, c: 12, drive: 0.05, whipK: 3.2 },
    heldTurn: 4.5, // rad/s the body turns toward the hero with a piece in the jaws (the neck does the rest)
    showArc: 0.8, // rad: a held piece is swung back and out toward the camera's side by up to this much (it stays seen)
    whipArc: 0.6, // rad off its nose the neck's whip can still throw at; farther round, the coil
    pivotMax: 0.4, // ... is drawn out into a pivot by up to this many s (a throw behind it is slower: his opening)
    glow: 3.2, // intensity of the throat's light riding a held / thrown piece (radius 4 m + 0.4 of its height)
    shudder: 0.07, // rad a rooted piece shakes as the jaws tug at it
  },
  tail: {
    ring: [6.0, 15.5], // the piece's distance from the root: what the swinging tail reaches (3.2 .. 8.3 x SCALE)
    body: 5.2, // the line it flies must pass this far from the root (it is not batted through the wyrm)
    cos: 0.3, // the tail's travel at the piece and the line to the hero: at least this cosine apart
  },
  // the piece the wyrm has chosen stirs before it is taken: dust and grit off it, per second
  stir: 30,
  // the tug before a piece tears free: grit jumping off the ground round its foot, per second
  strain: 70,
};

export const TERRAIN_ATTACKS = {
  // the owner's move: it lunges to a tree or a boulder, a foreleg pins the ground, the jaws clamp, a
  // tug that holds, a heave that tears it out (roots and dirt burst), it rocks back onto its haunches,
  // the neck coils back over the shoulder and whips; the piece leaves the jaws tumbling with the whip
  // and flies flat and fast at where the hero is heading. One red blow where it lands. Nothing is
  // drawn on the ground: the flare on the piece, 0.35 s before it lands, is the cue
  hurl: {
    label: 'Uproot and hurl', tell: TELL.RED, phase: 1,
    windup: 0.3, // the bite: the head drives down, a foreleg pins, the jaws clamp
    lift: 0.3, tug: 0.45, // the tear: it comes free at this share of it (before: a tug that holds)
    aim: 0.18, // the coil: the neck back over the shoulder, the piece swung behind
    active: 0.16, release: 0.5, // the whip; the piece leaves the jaws at this share of it
    cock: 1.2, // rad a tree is swung back before the whip
    spin: 9, // rad/s a tree tumbles on with, at least (a boulder x1.4): the whip's own swing, carried on
    recovery: 0.55, // the follow-through (the piece flies on by itself: its flash comes from the air)
    // s in the air: flightBase + metres / flightPer, kept in this range (fast and flat: it is the
    // THROW you read, not the landing)
    flight: [0.4, 0.68], flightBase: 0.22, flightPer: 48,
    lead: 0.7, // of the flight: it is thrown where the hero is heading at the release
    radius: 3.4, damage: 30, knockback: 5, knockdown: true,
    power: 1.0, // on the world where it lands (world/breakTuning.js POWER: 1 fells a tree; tuning: 1.2)
    smash: 0.9, // on what stands in its path as it flies (a tree in the way goes down; it flies on; tuning: 1.1)
    skid: 2.6, skidTime: 0.3, // past the blow it carries on this far, tumbling, and comes apart
    // the hero's distance from the wyrm: any but under its chest. Nearer than `close` it is picked
    // less (x closeK): it turns its back on him for the tree, and that is his opening
    minDist: 5, maxDist: 36, close: 9, closeK: 0.7,
    weight: [2.6, 2.6, 2.4], cooldown: 15, // (tuning: [3.2, 3.0, 2.6])
  },
  // its back to a boulder, the tail cocked the other way, one lash: the tail meets the boulder and
  // it bursts off the ground, skimming at the hero. Blue and a parry MOMENT (the blue flare, ADR-118):
  // cut it out of the air (a parry), take it on the guard, step off its line, or put a tree or a
  // standing stone between you and it (cover stops it and pays for it). Its line is not drawn
  tailBat: {
    label: 'Tail bat (a boulder)', tell: TELL.BLUE, flare: true, phase: 1,
    windup: 0.6, minWindup: 0.5, // the pivot and the cock of the tail
    active: 0.3, impact: 0.16, // the lash; the tail meets the boulder about this far into it
    recovery: 0.6,
    offset: 0.95, past: 0.75, pivotRate: 7, // rad short of the boulder / beyond it; rad/s of the pivot
    coil: 0.12, // rad per tail segment it curls away from the boulder in the windup (the cock)
    speed: [26, 42], cruise: 32, // m/s (it is re-timed to land on its flash + lead)
    hop: 1.2, // m it bursts up off the ground at the contact, falling back to a skim
    width: 1.15, // half width of its line (+ the hero's radius)
    over: 7, // it flies this far past the hero before it comes apart
    range: [7, 32], // boulder to hero
    damage: 26, knockback: 5,
    power: 1.0, // on the cover that stops it, and where it bursts
    burst: 2.0, // radius of that last blast on the world (m)
    weight: [2.6, 2.6, 2.4], cooldown: 12, // (tuning: [3.0, 3.0, 2.8])
  },
  // phase 2: a tree in the jaws, a breath up its trunk, and it is thrown burning. The blow is red;
  // where it lands the tree's wreck burns on (contact ticks, blockable) and the grass round it catches
  fireBrand: {
    label: 'Firebrand (a burning tree)', tell: TELL.RED, phase: 2,
    windup: 0.3, lift: 0.3, tug: 0.45,
    kindle: 0.42, // held out ahead: the breath runs up it
    aim: 0.18, active: 0.16, release: 0.5, cock: 1.2, spin: 8, recovery: 0.6,
    flight: [0.42, 0.7], flightBase: 0.24, flightPer: 48, lead: 0.7,
    radius: 4.0, damage: 32, burn: 2.0, knockback: 5, knockdown: true,
    power: 1.4, smash: 1.2, skid: 2.2, skidTime: 0.3,
    // the wreck: s it burns, its radius, the contact ticks of a hero standing in it
    pyre: { time: 3.4, radius: 2.9, tick: 0.3, tickDamage: 4, tickBurn: 0.8 },
    ignite: [1, 1.2], // the grass and wood round it: share of a full burn, of the blast's radius
    // what it lights on its way: the flying brand sets fire to the wood it smashes (share of a burn)
    trailIgnite: 0.5,
    minDist: 5, maxDist: 36, close: 9, closeK: 0.7,
    weight: [0, 2.2, 2.6], cooldown: 19, // (tuning: [0, 2.8, 3.0])
  },
};
