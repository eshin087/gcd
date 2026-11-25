// Numbers for the roar-cast fire spells (spellsFire.js, drawn by spellsFx.js); ADR-190.
// Registered into TUNING.attacks (spellsFire.js does it at load when tuning.js has not: `??=`), so the
// Lab, abilities() and hitPlayer read them like every other attack.
//
// Units: seconds (phase-1 values; the windup and the recovery x d.tScale in later phases, the spell's
// own travel keeps its speed), WORLD metres (the spells are sized against the 1.8 m hero), HP.
// `weight` = AI weight per phase [P1, P2, P3]; `cooldown` s after it ends. Both are CHANNELS: the
// wyrm stands over its spell and steers it until it ends (it is open to the sword all the while; a
// stagger or a posture break ends the spell: it dies harmlessly). Every big blow is red (dodge-only:
// a roll through it, or out of its reach); the serpent's body and the column's wall burn on contact
// (small blockable ticks, never while the hero rolls), like a burning strip.
// Phones (settings.quality 0: the LOW preset, `?touch`) draw a share of everything (`phone`).

import { TELL } from '../../combat/rules.js';

export const SPELLS = {
  // THE FIRE SERPENT: the wyrm roars over a circle of burning glyphs on the ground before it; a long
  // serpent of fire bursts out of the circle and slithers across the ground toward the hero, burning a
  // lane (the grass alight, the trees in its way felled and burning, a charred trench). It hunts him
  // for a few seconds (its turn is limited: a hero sprinting across its nose outruns the turn), and
  // strikes when he is in reach: it rears (the red tell), then lunges along the line it reared on and
  // bursts where its head lands. Phase 3 strikes three times; after the last it sinks into the ground.
  fireSerpent: {
    label: 'Fire serpent', tell: TELL.RED, phase: 2, category: 'spell',
    windup: 1.5, // the roar: the circle burns brighter until the serpent bursts out of it
    recovery: 1.1,
    circle: { ahead: 7.5, r: 2.6 }, // the incantation circle: this far before the root, its radius
    hunt: [3.2, 3.2, 4.2], // s it hunts at most (per phase); then it strikes from wherever it is
    strikes: [1, 2, 3], // strikes per phase (the last ends it)
    speed: 6.4, // m/s along the ground (the hero sprints 7.2, runs 4.6)
    turn: 1.35, // rad/s its heading may turn toward him (at 6.4 m/s: a 4.7 m turning circle)
    lead: 0.35, // s of his velocity it aims ahead of him
    wiggle: { amp: 0.95, hz: 1.0 }, // the slither: its heading swings this many rad either way, this often
    body: { len: 15, head: 0.72, tail: 0.18, y: 0.95, step: 0.36 }, // m long; half widths at the head / tail; height; sample step
    reach: [2.5, 7.5], // it rears when he is this far from its head ...
    aim: 0.6, // ... and within this angle (rad) of where it heads
    firstAfter: 1.4, // s of hunting before its first strike may start
    gap: 0.7, // s of hunting between two strikes
    rear: 0.78, // s it rears (the red tell: combat:tell at its start, the flash flashLead before the lunge lands)
    rearH: 3.2, // m its head rises
    lunge: { time: 0.3, dist: 8.5, r: 1.15 }, // s, m along the line it reared on, the head's hit radius
    recoil: 0.55, // s it lies spent after a strike (its head low) before it hunts again
    burst: { r: 2.4, power: 1.4 }, // the blast where its head lands (the same blow: one hit per strike)
    sink: 0.7, // s its body burns out into the ground after the last strike
    damage: 26, burn: 2.0, knockback: 5,
    tick: { every: 0.35, damage: 4, burn: 0.8, r: 0.55 }, // its body's contact burn (blockable; not while rolling)
    world: {
      sweepEvery: 0.55, power: 1.6, r: 1.0, // m of travel between its blows on what stands in its way
      igniteEvery: 1.4, igniteR: 1.3, igniteK: 0.85, // the lane catches
      markEvery: 3.0, // m between the charred trench's marks (world.groundBlow 'beam')
      maxR: 70, // m from the arena's centre it may slither (the map's end)
    },
    minDist: 8, maxDist: 34,
    weight: [0, 0.45, 0.35], cooldown: 24,
    phone: 0.55, // share of its fire blobs, embers and lane fire drawn on a phone
  },

  // THE FIRESTORM: the wyrm roars over a circle of burning glyphs before it; a spinning column of fire
  // rises out of it and drifts across the clearing toward the hero (slow, steered by the wyrm, whose
  // head follows it), sucking in embers and dust, tearing up the trees it passes (felled, burning,
  // the light ones lifted into its spin) and burning the ground under it. Then it gathers (the column
  // narrows, spins faster, burns brighter: the red tell) and bursts in a ring: the big blow, flung
  // trees and all. Its wall burns on contact (ticks).
  firestorm: {
    label: 'Firestorm', tell: TELL.RED, phase: 2, category: 'spell',
    windup: 1.5, // the roar over the circle
    rise: 0.7, // s the column takes to climb out of the circle (it does not move yet)
    drift: [4.2, 4.2, 4.8], // s it drifts toward the hero (per phase)
    speed: 2.5, // m/s at most
    turn: 0.9, // rad/s its way may turn toward him
    accel: 2.2, // m/s² it picks up speed
    gather: 1.15, // s it gathers before the burst (it stops; red tell at its start)
    burst: { r: 7.0, power: 1.5, fire: 0.7, front: 0.45 }, // the ring's reach, its blow on the world, the fire it leaves, s its front takes to run out
    recovery: 1.2,
    circle: { ahead: 8.5, r: 3.0 },
    damage: 30, burn: 2.5, knockback: 7,
    tick: { every: 0.3, damage: 5, burn: 1.0 }, // inside its wall (blockable; not while rolling)
    world: {
      sweepEvery: 0.5, power: 1.7, // its core: fells what it crosses
      graze: 0.35, grazeEvery: 0.45, // its outer swirl bites what stands within its reach
      igniteEvery: 1.0, igniteK: 0.7,
      lift: [1, 2, 2], liftReach: 3.2, // light trees (lift 1) it tears up into its spin, per phase; within this of its wall
      fling: 13, // m from its centre the lifted trees are flung at the burst
      maxR: 40, // m from the arena's centre it may drift
    },
    minDist: 7, maxDist: 28,
    weight: [0, 0.35, 0.4], cooldown: 26,
    phone: 0.5,
  },
};

/**
 * The looks (taste calls, the owner picks; switches read once at load):
 *   ?serpent=a  one long continuous serpent: a body of fire with a hot spine and flames licking up off
 *               its back (the default)
 *   ?serpent=b  a segmented serpent: a chain of burning vertebrae, each a knot of fire, a thin hot
 *               spine between them
 *   ?vortex=a   a tall thin column: 14 m, a narrow foot flaring to a wide crown of smoke (the default)
 *   ?vortex=b   a squat wide storm: 8 m, a broad wall of fire turning slower
 */
export const SPELL_LOOKS = {
  serpent: {
    a: { segmented: false },
    b: { segmented: true, every: 0.95 },
  },
  vortex: {
    a: { h: 14, r0: 1.0, r1: 2.9, spin: 5.2, strands: 4, twist: 0.32, rate: 2300, core: 0.45, reach: 2.1 },
    b: { h: 8, r0: 2.3, r1: 4.0, spin: 3.4, strands: 6, twist: 0.2, rate: 2500, core: 0.9, reach: 3.0 },
  },
};
