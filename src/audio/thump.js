import { clamp } from '../core/math.js';
import { perc, glide, holdAt, num } from './dsp.js';
import { impactK } from '../combat/impact.js';

// THUMP (the impact pass, combat/impact.js): the low end of a heavy hit and a short dip of the music.
// A landed cut already plays the body's hit and the blade's 'cut' layer (sfx.js); this adds, scaled by
// impactK('thump') and read at the moment of the hit (0: nothing is built, nothing is scheduled):
//
//   the sub   a short pitched-down sine (f0 → f1 Hz) with its octave mixed in, through a soft clip and a
//             low-pass: the clip's harmonics (80 - 300 Hz) carry it on a phone that cannot play 40 Hz.
//             No noise, no click (the envelope opens from zero over `attack`).
//   the dip   the music (only the music: never the cue bus, the tells or the timing flash) drops
//             `dipDb` for about a tenth of a second on a HEAVY blow and comes back by ~0.25 s. One dip
//             per `dipGap`: a later heavy blow inside a dip that still holds only extends it (to at most
//             `dipMax` after it began); one landing as the music comes back does nothing (no pumping).
//
// The dip is its own gain node on the music path (musicBus → thumpDip → musicDip → mix; audio.js
// _build), at 1 when idle, so it multiplies with the pause duck (musicBus), the timing flash's dip
// (musicDip) and the Ghostep / flurry hold (slowGain) instead of fighting them.
// Who thumps (player:hitDragon after the engine's own early returns: a guarded strike, the plunge, the
// slam's ground shards and a flurry's flash cuts keep their own sounds):
//   strength = weight[weight] (slam / cleave / execute); a heavy branch's sweep or point gets
//   `heavyBranch`; a crit at least `crit`; the light chain's sweep / point `knock` (0: an option).
//   Only a `heavy` blow dips the music.

export const THUMP = {
  // strength of the sub per cut weight (player:hitDragon `weight`), before impactK('thump')
  weight: { light: 0, sweep: 0, point: 0, slam: 1, cleave: 1.1, execute: 1.2 },
  heavyBranch: 0.7, // a heavy blow whose weight is a sweep / point (Piercing Gale, Rising Crescent, Whirling Tempest)
  crit: 0.55, // a crit (a broken foe) on a light weight: the sub, no dip
  knock: 0, // the light chain's sweep / point (the whirl, the lunge): an option (the audition plays 0.3)
  // the voice
  f0: 70, // Hz at the start of the body
  f1: 38, // Hz it falls to (exponential glide over `slide` s)
  slide: 0.11,
  harm: 0.6, // the octave (a second sine, 2 x f) mixed in before the clip: phone speakers hear 80 - 160 Hz
  drive: 0.62, // gain into the soft clip (the sum peaks just under 1: saturated, never hard-clipped)
  curve: 4, // the clip's softness (dsp.js distortionCurve amount; ~5 warm)
  lp: 420, // Hz: low-pass after the clip (keeps the harmonics low, no fizz)
  attack: 0.006, // s: opens from zero (no click)
  decay: 0.18, // s to -60 dB (exponential): heard as ~0.1 s
  gain: 0.9, // peak at strength 1 (measured against the master compressor + limiter: see the audition notes)
  // the music's dip
  dipDb: -4.5, // dB at strength 1 (scaled by impactK, capped at dipMaxDb)
  dipMaxDb: -9,
  dipIn: 0.012, // s: time constant down
  dipHold: 0.09, // s held before it comes back
  dipOut: 0.06, // s: time constant back (within 1 dB of the music by ~0.18 s after the hold)
  dipGap: 0.5, // s: at most one dip begins per gap
  dipMax: 0.45, // s: a dip extended by later blows ends at most this long after it began
};

const T = THUMP;

/** The sub voice (played through AudioEngine.play('sub', { k })): sfx bus, centred, a dry hint of hall. */
export const THUMP_SFX = {
  sub: {
    prio: 3, rev: 0.03, gap: 0.03,
    play(v, t, o) {
      const s = clamp(num(o.k, 1), 0, 2.5);
      const end = t + T.attack + T.decay + 0.03;
      const a = v.osc('sine', T.f0, t, end);
      glide(a.frequency, t, T.f0, T.f1, T.slide);
      const h = v.osc('sine', T.f0 * 2, t, end);
      glide(h.frequency, t, T.f0 * 2, T.f1 * 2, T.slide);
      const pre = v.gain(T.drive);
      const hg = v.gain(T.harm);
      a.connect(pre);
      h.connect(hg).connect(pre);
      const g = v.gain(0);
      perc(g.gain, t, T.gain * s, T.attack, T.decay);
      pre.connect(v.shaper(T.curve)).connect(v.filter('lowpass', T.lp, 0.6)).connect(g).connect(v.out);
    },
  },
};

/** The piece's state on the engine (no audio nodes of its own: the dip node is built with the graph). */
export class Thump {
  constructor(E) {
    this.E = E;
    this.dipAt = -10; // ctx time the current dip began
    this.dipRelease = -10; // ctx time it starts to come back
    this.subs = 0; // counters (tests, the Lab)
    this.dips = 0;
    this.extends = 0;
  }

  /** The sub's strength for a landed blow (0: none). */
  strength(d) {
    const tier = d.weight ?? (d.heavy ? 'slam' : 'light');
    let s = num(T.weight[tier], 0);
    const side = tier === 'sweep' || tier === 'point';
    if (d.heavy && side) s = Math.max(s, T.heavyBranch);
    else if (side) s = Math.max(s, num(T.knock, 0));
    if (d.crit) s = Math.max(s, T.crit);
    return s;
  }

  /** player:hitDragon, after the engine's early returns (guarded, plunge, shards, flash cuts). */
  onHit(d) {
    const k = impactK('thump');
    if (!(k > 0) || !this.E.ctx) return;
    const s = this.strength(d);
    if (!(s > 0)) return;
    if (this.E.play('sub', { k: s * k })) this.subs++;
    if (d.heavy) this.dip(k);
  }

  /** Dip the music (see the header). Returns 'dip' | 'extend' | null. */
  dip(k) {
    const E = this.E;
    const g = E.thumpDip?.gain;
    if (!g || !E.ctx) return null;
    const now = E.ctx.currentTime;
    const since = now - this.dipAt;
    if (since >= 0 && since < T.dipGap) {
      // inside a dip's window: extend it while it still holds; once it is coming back, leave it
      if (now >= this.dipRelease) return null;
      const rel = Math.min(now + 0.006 + T.dipHold, this.dipAt + T.dipMax);
      if (!(rel > this.dipRelease)) return null;
      g.cancelScheduledValues(this.dipRelease);
      g.setTargetAtTime(1, rel, T.dipOut);
      this.dipRelease = rel;
      this.extends++;
      return 'extend';
    }
    const db = Math.max(T.dipMaxDb, T.dipDb * clamp(num(k, 1), 0, 4));
    const level = Math.pow(10, db / 20);
    const t = now + 0.006; // with the hit's own voices (AudioEngine.play schedules at now + 6 ms)
    holdAt(g, now);
    g.setTargetAtTime(level, t, T.dipIn);
    g.setTargetAtTime(1, t + T.dipHold, T.dipOut);
    this.dipAt = now;
    this.dipRelease = t + T.dipHold;
    this.dips++;
    return 'dip';
  }
}
