// Heaven-Devouring Howl (`foxVerdict`, phase 3): Wen Yao summons the Nine-Tailed Fox and it rakes the
// terrace with a beam from its jaws (beam.js the move's logic, spirit.js the creature, fxBeam.js its
// drawing; COMBAT.md → "The Thousand-Body Fox" → "The Howl"). `TUNING.verdict`. Times in seconds,
// distances in metres, angles in degrees where named `deg`.
export const VERDICT = {
  // ---- when (his weigh): from `start` s into phase 3, at least `every` s apart; once, forced, the
  // first time his bar falls under `forceAt` of his health if he has not used it
  start: 12,
  every: 32,
  forceAt: 0.18,
  // ---- he leaves: a flit to the rim point farthest from the hero, `rim` m from the centre
  rim: 11.5,
  flit: 0.5,
  // ---- the summoning (both palms on the paving; the fox rises behind him)
  summon: 2.4,
  // ---- the dark sun at the jaws: `charge` s; the line is FIXED at `fix` of it (the red cue)
  charge: 1.4,
  fix: 0.8,
  // ---- the beam: a strip from him across the terrace
  len: 26,
  w: 3.6,
  lit: 2.4, // s lit (the beat's `sustain.dur`)
  sweep: { after: 0.5, rate: 34, max: 80 }, // deg/s toward the hero's side, at most `max` deg, one way
  first: { damage: 30, knockback: 6 }, // the first contact: knockdown, thrown along it
  tick: 0.18, // a tick this often after the first contact ...
  tickDamage: 12,
  maxTicks: 3, // ... at most this many (the last throws the hero clear of its side)
  guard: { cost: 14, push: 2.4 }, // a held guard facing it: guard per tick, slides along it (player.streamBlock)
  // ---- it ends: he kneels open
  kneel: 2.2,
  kneelPosture: 60, // added to his posture as he drops (the hero's reward)
  // ---- the world along the strip (ADR-107): every `every` s while lit
  world: { every: 0.2, sweep: 1.6, impact: 1.2, ignite: 0.9 },
  // ---- the creature (spirit.js): m to the top of its head, the head's length, the tails' length
  spirit: { height: 9, head: 3.5, tails: 14, behind: 3.0 },
  // ---- the terrace's light while it stands (world ambience dim, 0..1)
  dim: 0.55,
};
