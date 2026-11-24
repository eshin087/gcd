// What a duelist's blows do to the world (ADR-107; world/breakTuning.js POWER scale: 1 fells a
// tree). Shared by the Ash Disciple and the Starless Lord; an actor's `T.world` overrides fields.
export const DUEL_WORLD = Object.freeze({
  per: 40, // a blade's blow: its damage / per (a cut of 12 → 0.3, an overhead of 24 → 0.6)
  red: 1.25, // a red blow bites harder
  crescent: 0.35, // a crescent of sword qi / red light stopped by cover
  push: 0.6, // the wall of force goes through: what it meets is thrown down ahead of it
  stone: 0.7, // a torn stone stopped by cover
  bigStone: 1.6, // the great stone breaks through
  glaive: 0.5, // the returning blade cuts through
  bolt: 1.5, // Void lightning on the cover the hero stands behind
  grip: 3, // the Crushing Dark closes on the cover instead: it is crushed
  strike: 1.2, // a called bolt / the Dark Star where it lands
  crush: 1.0, // the grip's crush on the floor under the hero
});

/**
 * The mark a duelist's blow leaves on the FLOOR (world.groundBlow → scars.mark; brain.js _groundOf).
 * A beat's own `groundMark: { kind, power, len, r, fwd, side, arc }` wins (`groundMark: false`: none);
 * else it is read from the beat's shape: a landing (a leap, a dive, a lift that comes down at the
 * impact) a slam (a cut when the blade ends low), a heavy ring a slam (at his feet's reach: an ankle
 * sweep a scuffed arc round him), a big ring (>= `bigRing` m: a form's shock) a blast, a blade that
 * ends low (its pose's blade elevation <= `low` rad at or after the impact) a gash, a long dash
 * (>= `dash` m) a furrow behind him. Power = the blow's world power (damage / per, a red x red) x the
 * kind's factor here. An actor's `T.marks` overrides fields.
 */
export const DUEL_MARK = Object.freeze({
  low: -0.55,
  bigRing: 4,
  dash: 3.5,
  slam: 1.7,
  cut: 1.6,
  sweep: 1.2,
  blast: 1.2,
  skid: 0.7,
  thrust: 1.6,
  cutLen: [1.1, 2.4], // m: a gash, by the blow's reach
  skidLen: [1.0, 2.4], // m: a dash's furrow (its last stretch)
  sweepArc: 0.7, // of a full turn: an ankle sweep's scuffed arc
});
