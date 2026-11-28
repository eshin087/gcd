import { TELL, TELL_STYLE } from './rules.js';

// THE BLACKOUT (?black=0|a|b|c; default 0 = today's violet charge; ADR-271). The owner's Phantom Blade
// Zero reference (2026-11-27): while a boss charges a BLACK blow the whole picture drains toward dark
// grey and dims, the boss stays lit and readable, a white glint sits on the striking part, and colour
// snaps back on the strike. The owner's one exception to "no background colour change": black blows
// only, never red, blue or normal ones.
//   0  today: the eclipse with violet strokes on the striking part, the body darkened violet, the flare
//      dyed violet, the screen's edges dimming (ui/tells.js).
//   a  the film: the dark drops in over the last 0.3 s before the cue, holds through it, snaps back on
//      the strike.
//   b  as a, but the dark builds through the whole charge (~1.5 s).
//   c  as a, but darker.
// In a, b and c the violet goes (TELL_STYLE.black.pale): the flare undyed (a white-hot streak), the
// charge a white point with pale motes drawn in, no darkened body, no dark screen edges.
//
// Driven by the events that already carry the charge: `combat:charge` (its start and length), every
// frame of it a `beat()` from what draws it (DuelFx.charge: every duelist and the wyrm; the fox's Howl,
// thousandFox/beam.js), then the black `combat:flash` (the cue: it holds `hold` s, then the strike). A
// charge whose beats stop (stagger, posture break, parry recoil, a Lab interrupt replacing the attack,
// death) lets go over `drop` s; a reset, a retry or a change of state clears it at once (ui/tells.js).
// Game time: slow-mo and the Lab's time scale stretch it with the blow; a pause freezes it. Colour
// comes back on real time (a hit-stop on the strike must not hold the picture half dark).
// The grade itself is the final pass's uBlack / uBlackK (render/pipeline.js): the boss's pixels (and
// `hero` of the hero's) are read off the scene's ASCII flag and kept; bright letters keep their light.
// No allocation per frame; never throws.

const OPTS = ['0', 'a', 'b', 'c'];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
export const BLACK_DEFAULT = '0'; // today's look until the owner picks
/** The switch (the Lab cycles it; read every frame). */
export const BLACK = { opts: OPTS, mode: OPTS.includes(q('black')) ? q('black') : BLACK_DEFAULT };
export const getBlack = () => BLACK.mode;
export const setBlack = (m) => (BLACK.mode = OPTS.includes(m) ? m : BLACK_DEFAULT);
/** Is the blackout on (a, b or c)? */
export const blackOn = () => BLACK.mode !== '0';
/** The flare's colours for a tell: TELL_STYLE[tell].flare, the black one undyed in the blackout. */
export const flareStyle = (tell) => (tell === TELL.BLACK && blackOn() ? TELL_STYLE.black.pale.flare : TELL_STYLE[tell]?.flare ?? TELL_STYLE.red.flare);
/** How much a black blow darkens the boss's body (TELL_STYLE.black.warn): 1 today, 0 in the blackout. */
export const blackBody = () => (blackOn() ? 0 : 1);

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
const BEAT_GAP = 0.15; // s of game time without a beat before a charge counts as cancelled

export class Blackout {
  constructor(game) {
    this.game = game;
    this.phase = 0; // 0 none, 1 charging, 2 cued (holding to the strike), 3 letting go
    this.t0 = 0; // game time the charge began
    this.dur = 1.5; // ... its length to the cue
    this.beatAt = -1; // game time of the last beat
    this.cueAt = 0; // game time of the cue
    this.k = 0; // the grade now 0..1
    this.k0 = 0; // ... as it was when it began to let go
    this.goAt = 0; // real time it began to let go, and over how long
    this.goDur = 0.1;
    this.mode = BLACK.mode; // the variant that drew the last frame
    const ev = game?.events;
    ev?.on('combat:charge', (d) => this.start(d?.dur));
    ev?.on('combat:flash', (d) => {
      if (d && d.tell === TELL.BLACK && !d.hazard) this.cue();
    });
  }

  get now() {
    return fin(this.game?.time);
  }

  /** Real time: colour comes back on it, so a hit-stop on the strike does not hold the dark. */
  get realNow() {
    return fin(this.game?.realTime, this.now);
  }

  /** A black blow begins to charge, `dur` s to its cue. */
  start(dur) {
    if (!blackOn()) return;
    this.phase = 1;
    this.t0 = this.now;
    this.dur = Math.max(0.2, fin(dur, 1.5));
    this.beatAt = this.t0;
  }

  /** Every frame of a charge, from what draws it: the charge is still on. */
  beat() {
    if (!blackOn()) return;
    if (this.phase !== 1) this.start(1.5);
    this.beatAt = this.now;
  }

  /** The black cue: the dark holds to the strike (a cue with no charge before it drops in at once). */
  cue() {
    if (!blackOn()) return;
    if (this.phase !== 1 && this.phase !== 2) {
      this.t0 = this.now;
      this.dur = 0.01;
    }
    this.phase = 2;
    this.cueAt = this.now;
  }

  /** Let go: colour comes back over `over` s (the strike's snap, a cancel's drop). */
  release(over) {
    if (this.phase === 0 || this.phase === 3) return;
    this.phase = 3;
    this.k0 = this.k;
    this.goAt = this.realNow;
    this.goDur = Math.max(0.01, fin(over, 0.1));
  }

  /** At once (a reset, a retry, a new state, the switch turned off). */
  clear() {
    this.phase = 0;
    this.k = 0;
    this.k0 = 0;
  }

  /** The grade 0..1 this frame (writes nothing). */
  step() {
    const O = TELL_STYLE.black.out, V = O[BLACK.mode];
    if (!V) {
      this.clear();
      return 0;
    }
    const now = this.now;
    if (this.phase === 1) {
      if (!(now - this.beatAt <= BEAT_GAP)) this.release(O.drop);
      else {
        const age = now - this.t0;
        this.k = V.over == null ? ss(age / this.dur) : ss((age - (this.dur - V.over)) / Math.max(0.01, V.over));
      }
    }
    if (this.phase === 2) {
      // (a cue straight after a charge's start, or none at all: the dark is all there by the cue)
      this.k = Math.max(this.k, ss((now - this.cueAt) / 0.06));
      if (now - this.cueAt >= O.hold) this.release(O.snap);
    }
    if (this.phase === 3) {
      const f = clamp01((this.realNow - this.goAt) / this.goDur);
      this.k = this.k0 * (1 - f);
      if (f >= 1) this.clear();
    }
    if (!(this.k >= 0)) this.k = 0;
    return this.k;
  }

  /** Step and write the final pass's uniforms (paused: the dark holds, like game time). */
  update() {
    const k = this.step();
    const u = this.game?.pipeline?.finalMat?.uniforms;
    if (!u || !u.uBlack) return;
    const O = TELL_STYLE.black.out, V = O[BLACK.mode];
    u.uBlack.value = k;
    if (V && u.uBlackK) u.uBlackK.value.set(1 - V.depth, V.grey, O.hero, O.reach);
    if (u.uBlackKeep) u.uBlackKeep.value.set(O.keep[0], O.keep[1]);
  }
}
