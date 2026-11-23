import { FoxSpirit } from './spirit.js';

// Heaven-Devouring Howl (`foxVerdict`, phase 3; ADR-151; COMBAT.md → "The Thousand-Body Fox" → "The
// Howl"): he flits to the rim, summons the Nine-Tailed Fox (spirit.js), a dark sun gathers at its jaws,
// the line is fixed at the red cue, and a beam rakes the terrace (lit `sustain`, `selfHit`: this file
// tests the strip and deals the hits), sweeping one way toward the hero's side; the world breaks along it;
// then he kneels open. Numbers: tuningBeam.js (`d.T.verdict`); drawing: fxBeam.js.
// Reference read, not imported: ascendant/kiBeam.js (BeamMoves).
//
// THE ROUTING CONTRACT (fox.js calls these; a beat or move is the Howl's when its def has `verdict`):
//   new FoxHowl(d)            inside his constructor (_setup): builds the spirit now (never mid-fight)
//   reset()                   nothing lit, the spirit hidden, the terrace's light back, the camera back
//   busy                      the summoning, the beam or its fade is under way
//   weigh(name, def, w) → w   the move's weight now (0 before T.verdict.start s into phase 3, within
//                             `every` s of the last one)
//   forced() → name | null    a move to start now instead of the AI's pick (the first time his bar is
//                             under `forceAt`, once)
//   onActStart(A) → bool      the move starts (false refuses it)
//   beatMotion(b, u, s, dt)   a `verdict` beat's motion (the flit, the summoning, the aim)
//   onImpact(b, s, a)         a `verdict` beat's impact (the beam lit at the beam beat's)
//   onSustain(b, s, a, k)     the lit window's ticks
//   frame(dt)                 every frame after the brain (fox.js brainFrame): ticks, the world, the motion
//   pose(dt)                  every frame after his pose (fox.js afterPose): the drawing
// STUB (contracts commit): the spirit agent writes it.

export class FoxHowl {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T.verdict;
    this.spirit = new FoxSpirit(d);
    this.stats = { howls: 0, first: 0, ticks: 0, blocked: 0 };
    this.reset();
  }

  reset() {
    this.on = false;
    this.used = false;
    this.lastAt = -Infinity;
    this.spirit?.reset();
  }

  get busy() {
    return this.on;
  }

  weigh(name, def, w) {
    return 0;
  }

  forced() {
    return null;
  }

  onActStart(A) {
    return true;
  }

  beatMotion(b, u, s, dt) {}

  onImpact(b, s, a) {}

  onSustain(b, s, a, k) {}

  frame(dt) {}

  pose(dt) {}
}
