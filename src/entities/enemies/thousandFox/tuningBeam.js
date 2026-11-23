// Heaven-Devouring Howl (`foxVerdict`, phase 3): Wen Yao summons the Nine-Tailed Fox and it rakes the
// terrace with a beam from its jaws (beam.js the move's logic, spirit.js the creature, fxBeam.js its
// drawing; COMBAT.md → "The Thousand-Body Fox" → "The Howl"). `TUNING.verdict`. Times in seconds,
// distances in metres, angles in degrees where named `deg` / `rate`. Damage is before damageScale.
//
// THE MOVE, beat by beat (moves.js foxVerdict):
//   the flit    (a feint, `flit` s) he is gone and at the rim point farthest from the hero (`rim` m
//               out, inside his bound), facing the centre; no blow
//   the beam    ONE red beat whose windup is the summoning and the charge (`summon` + `charge` s,
//               fixed; the cue ledger sees one blow): both palms on the paving, the ring of script, the
//               fox rises behind him, the light drops (the darkness of a charged blow: `combat:charge`,
//               the screen's edge dims, his body darkens), the dark sun gathers at its jaws; at `fix` of
//               the charge, or at the red cue if that comes first, the line is FIXED and its ground
//               heats; the red flare at the jaws flashLead before it fires. Lit `lit` s (`sustain`,
//               `selfHit`: beam.js deals the hits)
//   the kneel   the move's recovery: `kneel` s on one knee, his guard down all of it (recoverOpen 1),
//               `kneelPosture` added to his posture as he drops; the fox goes up in embers
export const VERDICT = {
  // ---- when (his weigh): from `start` s into phase 3, at least `every` s apart; once, forced, the
  // first time his bar falls under `forceAt` of his health if he has not used it
  start: 12,
  every: 32,
  forceAt: 0.18,
  // ---- he leaves: a flit to the rim point farthest from the hero, `rim` m from the centre (the
  // feint's windup `flit` s; he vanishes at `flitAt` of it)
  rim: 11.5,
  flit: 0.5,
  flitAt: 0.3,
  // ---- the summoning (both palms on the paving; the fox rises behind him)
  summon: 2.4,
  ring: 3.0, // m: the ring of script burning out on the floor round him
  // ---- the dark sun at the jaws: `charge` s; the line is FIXED at `fix` of it (or at the red cue)
  charge: 1.4,
  fix: 0.8,
  // ---- the beam: a strip from him across the terrace
  len: 26,
  w: 3.6,
  lit: 2.4, // s lit (active + the beat's `sustain.dur`)
  active: 0.1, // s: the first contact's window
  land: 2.6, // m ahead of him where the beam from the jaws meets the floor (drawn; the strip starts at him)
  // deg/s toward the hero's side (decided as the sweep starts: toward the side he is on; on the line,
  // away from where he is going), at most `max` deg, one way only: rolled through, it never turns back
  sweep: { after: 0.5, rate: 34, max: 80 },
  first: { damage: 30, knockback: 6 }, // the first contact: knockdown, thrown along it
  tick: 0.18, // a tick this often after the first contact ...
  tickDamage: 12,
  maxTicks: 3, // ... at most this many touch the hero (blocked or not); the last throws him clear of its side
  thrown: 4.5, // m the last tick throws an unguarded hero clear (knockdown)
  // a held guard facing it: `cost` guard per tick (never health) and a slide of `push` m along it
  // (player.streamBlock); the last of the `maxTicks` slides him out of its side instead. First contact
  // blocked + 3 ticks: 30 x 1.15 + 3 x 14 = 77 of 100 guard, so a full guard never breaks in it
  guard: { cost: 14, push: 2.4 },
  // ---- it ends: he kneels open
  kneel: 2.2,
  kneelPosture: 60, // added to his posture as he drops (the hero's reward)
  // ---- the world along the strip (ADR-107): every `every` s while lit. `sweep`: the power of
  // destructibles.sweep on what stands in it (lanterns, the stone foxes to their plinths, the charm
  // posts; the two landmarks only chip: hp Infinity); `y` the height it passes at; a trench of
  // world.impact stations `step` m apart (each spot once), `impact` power, `impactR` m; world.ignite
  // `ignite` on the ground past the kerb (the hill's grass, the posts)
  world: { every: 0.2, sweep: 1.6, y: 1.2, impact: 1.2, impactR: 0.8, step: 1.4, ignite: 0.9 },
  // ---- the creature (spirit.js): m to the top of its head, the head's length, the tails' length,
  // m behind him (outward along the line) its jaws hang; `rise` of the summoning it takes to rise out of
  // the fire (the rest it rears); `end` s it takes to go up in embers; `headTurn` deg the head may turn
  // off its broadside (its body is always side-on to the camera: a fox seen from the front prints as a lump)
  spirit: { height: 9, head: 3.5, tails: 14, behind: 3.0, rise: 0.75, end: 1.1, headTurn: 30 },
  // ---- the terrace's light while it stands (world/foxTerrace.js light.dim, 0..1)
  dim: 0.55,
  // ---- the camera (cameraRig.hold / keep): the hero and the fox's head both in frame, `margin` m
  // round each, at most `maxZoom` m pulled back (desktop metres), eased in over `ease` s
  camera: { margin: 2.2, maxZoom: 60, ease: 0.8 },
  // ---- the look (fxBeam.js): a short white peak, then the held beam; the fade
  look: { peak: 0.14, held: 0.82, fadeOut: 0.3 },
};
