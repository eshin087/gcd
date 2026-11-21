import { ShotMoves } from './kiShots.js';
import { BeamMoves } from './kiBeam.js';

// Tian Lei's ki: what his ki moves do once they are started. The actor routes every engine hook of a
// beat or a move marked `ki: '<kind>'` here (the routing contract: the comment at the top of
// ascendant.js); this class only hands each on to one of two owners, by the kind's name:
//   a kind that starts with 'beam' ('beam', 'beamSweep', 'beamTwin', 'beamGreat' ...)  → kiBeam.js
//     BeamMoves: the beams, the beam clash, what a beam does to the world
//   every other kind ('blast', 'fan', 'rain', 'disc', 'bolt', 'cage', 'volley' ...)       → kiShots.js
//     ShotMoves: blasts, the disc, bolts, called strikes, the volley from the air, the weather
// An unmarked `release` / `cast` beat goes to the shots, an unmarked `sustain` beat to the beams.
// reset(), frame(dt), `busy` and lockEnd(won) reach both. Neither owner edits this file.

const isBeam = (kind) => typeof kind === 'string' && kind.startsWith('beam');

export class KiMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.shots = new ShotMoves(d);
    this.beams = new BeamMoves(d);
  }

  /** The owner of a kind (`fallback` when the beat and its move carry no mark). */
  _of(kind, fallback = this.shots) {
    if (kind == null) return fallback;
    return isBeam(kind) ? this.beams : this.shots;
  }
  _kind(b, a) {
    return b?.def?.ki ?? a?.def?.ki ?? null;
  }

  /** Every reset of his (the duelist's reset, a death, the Lab): nothing of his left in the air. */
  reset() {
    this.shots.reset();
    this.beams.reset();
  }

  /** Something of his is still in the air or lit (the tests wait for it; the director may read it). */
  get busy() {
    return !!(this.shots.busy || this.beams.busy);
  }

  /** A ki move starts (brain.startAct → d.onActStart): false = it cannot start now (nothing changes). */
  begin(act, opts) {
    return this._of(act?.def?.ki).begin(act, opts) !== false;
  }

  /** His AI weighs a ki move (brain._choose → d.weigh): the weight it gets now (0 = not now). */
  weigh(def, w, dist) {
    return this._of(def?.ki).weigh(def, w, dist);
  }

  /** A `cast` beat's impact (d.onCast). */
  onCast(b, s, a) {
    this._of(this._kind(b, a)).onCast(b, s, a);
  }

  /** A `release` beat's impact (d.onRelease). */
  onRelease(b, s, a) {
    this._of(this._kind(b, a)).onRelease(b, s, a);
  }

  /** Any routed beat's impact, its first frame (d.onImpact; before the zone is tested). */
  onImpact(b, s, a) {
    this._of(this._kind(b, a)).onImpact(b, s, a);
  }

  /** Every frame of a routed beat (d.beatMotion; u 0..1 the windup, 1..2 the active frames). */
  motion(b, u, s, dt) {
    this._of(this._kind(b, this.d.brain?.act)).motion(b, u, s, dt);
  }

  /** A `sustain` beat, every `sustain.tick` s while it is lit (d.onSustain; k 0..1 through it). */
  onSustain(b, s, a, k) {
    this._of(this._kind(b, a), this.beams).onSustain(b, s, a, k);
  }

  /** A routed beat's blow met the hero (d.hitPlayer; `r` the player's RESULT). */
  onHit(o, r) {
    const kind = o?.beat?.def?.ki ?? this.d.kit?.MOVES?.[o?.attack]?.ki ?? null;
    this._of(kind).onHit(o, r);
  }

  /** The blade lock ended (d.onLockEnd) while a routed move started it: true = handled here. */
  lockEnd(won) {
    return this.beams.lockEnd(won) === true || this.shots.lockEnd(won) === true;
  }

  /** Every frame, after the brain (d.brainFrame). */
  frame(dt) {
    this.shots.frame(dt);
    this.beams.frame(dt);
  }
}
