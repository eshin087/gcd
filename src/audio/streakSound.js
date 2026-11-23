import { clamp } from '../core/math.js';
import { perc, holdAt, num } from './dsp.js';
import { Voice } from './voice.js';
import { streakK, streakTier, perfectMode } from '../combat/streak.js';

// THE STREAK, HEARD (the streak pass's `sound` piece, combat/streak.js). Scaled by streakK('sound'),
// read at the moment (0: nothing is built, nothing is scheduled; the game sounds as before):
//
//   the climb   every perfect defence that raises the streak (a perfect dodge, a parry of a blade, a
//               trade clash, a mikiri) adds a short clean tone over its own sound, one scale step higher
//               per count: a minor pentatonic (or a natural minor) in the KEY OF THE PLAYING TRACK
//               (TRACK_KEYS), from the tonic in C4..G4 up two octaves, then it holds its top note and
//               a brighter partial grows instead of climbing into the squeaky. A tier reached (3, 5, 7,
//               10, 15) doubles the note once (the fifth, then the octave, then both).
//               Its own small bus goes straight to the pause duck (past the slow-motion muffle, like
//               the cues), at most `maxVoices` voices of its own (never the engine's sfx pool), and it
//               dips under every attack tell / timing flash (`tellDuck`): the tells always win.
//   the loss    a streak of 2+ that ends: its last note dropped a fourth and damped, with a muted pluck.
//   the layer   from tier 2 a quiet drone (the track's tonic and fifth, triangle waves, slow beating)
//               joins the music and thickens to tier 5; on the music bus, so it ducks with every music
//               duck (the pause, the stillness, the timing flash's dip, the thump's dip, the slow
//               motion). Fades out over about a second when the streak is lost or the fight ends.
//   the flurry  its cut rings move onto the scale (a higher start at higher tiers); cuts that come
//               faster than `fastCut` apart merge into one rising sweep instead of separate rings; the
//               burst's chord grows with the tier.
//   the parry   its deflect chain climbs the same scale (in place of whole tones), snapped to the key.
//
// No Math.random anywhere here, and the recipes this changes (parry, flurryCut, flurryBurst) draw the
// same number of random values as before: the seeded test fights replay the AI's Math.random.

const NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, Eb: 3, 'D#': 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, 'G#': 8, A: 9, Bb: 10, 'A#': 10, B: 11 };

/** The climb's scales: semitone steps of one octave; `top` = the degree it holds from (2 octaves). */
export const SCALES = {
  pent: { steps: [0, 3, 5, 7, 10], top: 10 }, // minor pentatonic (yu): two octaves at streak 11
  minor: { steps: [0, 2, 3, 5, 7, 8, 10], top: 14 }, // natural minor: two octaves at streak 15
};

/** The climb's timbres: [ratio, amp, decay share] partials (synthesised, no noise), attack s, decay s. */
export const TIMBRES = {
  // a guqin harmonic: nearly pure, a faint 2nd and 3rd, a slow beat from a twin a hair sharp
  guqin: { partials: [[1, 1, 1], [1.0016, 0.35, 1.1], [2, 0.22, 0.55], [3, 0.08, 0.35]], attack: 0.004, decay: 0.5, bright: 4 },
  // a singing bowl struck: inharmonic, a beating twin
  bowl: { partials: [[1, 1, 1], [1.0035, 0.55, 1.1], [2.71, 0.33, 0.55], [5.15, 0.11, 0.3]], attack: 0.002, decay: 0.6, bright: 4.1 },
  // dry struck steel (the parry's family, shorter)
  steel: { partials: [[1, 1, 1], [2.32, 0.42, 0.5], [3.7, 0.24, 0.35], [5.1, 0.11, 0.25]], attack: 0.0015, decay: 0.36, bright: 6.9 },
};

/**
 * The key of each recorded boss track (none carries key metadata): `tonic` = the climb's scale root
 * (a minor tonic: the relative minor of a major track, so every scale note is in the track's key),
 * `drone` = the layer's root and fifth (the track's own tonic). Measured from each track's chroma
 * (rig sd_key.py: Krumhansl profiles over 20 s windows; the drone pitch classes are among the
 * track's strongest). `synth` = the synthesised score (D minor).
 */
export const TRACK_KEYS = {
  synth: { tonic: 'D', drone: ['D', 'A'] },
  'music/cinder-p1.mp3': { tonic: 'E', drone: ['E', 'B'] }, // nearly flat chroma; G A B E strongest
  'music/cinder-p2.mp3': { tonic: 'B', drone: ['D', 'A'] }, // D major (r .84): B minor's notes
  'music/cinder-p3.mp3': { tonic: 'G', drone: ['C', 'G'] }, // C minor / G minor: the third is unclear, its fifth is not
  'music/ash-p1.mp3': { tonic: 'G', drone: ['G', 'D'] }, // G minor, nearly flat
  'music/ash-p2.mp3': { tonic: 'C#', drone: ['E', 'B'] }, // E major (r .67): C# minor's notes
  'music/starless-p1.mp3': { tonic: 'A', drone: ['A', 'E'] }, // A minor / A major windows
  'music/starless-p2.mp3': { tonic: 'Ab', drone: ['Ab', 'Eb'] }, // Ab minor
  'music/starless-p3.mp3': { tonic: 'Eb', drone: ['Eb', 'Bb'] }, // Eb minor
  'music/starless-p4.mp3': { tonic: 'C#', drone: ['E', 'B'] }, // E major (r .86)
};

export const STREAK_SOUND = {
  scale: 'pent', // SCALES key (the audition's options: pent + guqin, minor + bowl, pent + steel)
  timbre: 'guqin', // TIMBRES key
  lo: 233, // Hz: the climb's tonic is put in [lo, 2 lo) (Bb3 .. A4): two octaves up stays under ~1.9 kHz
  gain: 0.075, // a climb note's peak (each voice), before streakK
  growth: 0.2, // the note's level rises this much (x) from streak 1 to 15
  rev: 0.22, // reverb send
  bright: 0.3, // the held top note's extra partial at full brightness (x the note)
  brightSteps: 4, // counts past the top over which it brightens fully
  tierExtra: 0.35, // the doubled note's level (x the note)
  maxVoices: 3, // own voices at once (the oldest fades out in 20 ms)
  minGap: 0.05, // s: a note inside this of the last one replaces it (no pile of attacks)
  tellDuck: 0.4, // the climb bus under a tell / timing flash (x)
  tellHold: 0.22, // s held before it comes back (time constant 0.08)
  // the loss
  lossGain: 0.06,
  lossDrop: 5, // semitones it falls
  lossDur: 0.28, // s
  // the layer (gain on the music bus per tier, x streakK; the bus itself is x0.42)
  layer: [0, 0, 0.03, 0.04, 0.05, 0.06],
  // its lines per tier: root, fifth, octave, the fifth above that, two octaves (x the line)
  layerLines: [
    null,
    null,
    [1, 0.7, 0, 0, 0],
    [1, 0.75, 0.45, 0, 0],
    [1, 0.8, 0.55, 0.22, 0],
    [1, 0.8, 0.6, 0.28, 0.1],
  ],
  layerRatios: [1, 1.5, 2, 3, 4],
  layerLo: 196, // Hz: the drone root in [layerLo, 2 layerLo) (G3 .. G4: a phone hears it and its harmonics)
  layerLp: 1500, // Hz low-pass over the triangles
  layerBeat: 3, // cents between each line's twin (a slow beat)
  layerIn: 0.8, // s time constant up (a tier joins slowly)
  layerOut: 0.3, // s time constant down (~1 s to silence)
  // the flurry
  fastCut: 0.1, // s: cuts closer than this merge into one rising sweep
  cutHi: 1100, // Hz: the cut ring's tonic octave nearest this (today: 1568, a whole tone per cut)
  cutTop: 8, // the highest scale degree a cut reaches
  burstHi: 880, // Hz: the burst's tonic octave nearest this (today's run is on A 880)
  // a single perfect parry / dodge per perfectMode(): ring decay x, slow-motion sound x (today: none)
  perfect: { sharp: { ring: 0.55, slow: 0.45 }, cinema: { ring: 1.6, slow: 1.35 } },
};

const S = STREAK_SOUND;
const pcOf = (n) => (typeof n === 'number' ? ((n % 12) + 12) % 12 : NAMES[n] ?? 2);
/** The frequency of pitch class `pc` in [lo, 2 lo). */
const inOctave = (pc, lo) => {
  let f = 440 * Math.pow(2, (pcOf(pc) - 9) / 12);
  while (f >= lo * 2) f /= 2;
  while (f < lo) f *= 2;
  return f;
};
/** The frequency of `pc` nearest `hz`. */
const nearest = (pc, hz) => {
  const f = inOctave(pc, hz / Math.SQRT2);
  return f;
};

/** Hold a param where it is at `t` (cancelAndHoldAtTime where the browser has it), from now on. */
const hold = (p, t, now) => {
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
  else holdAt(p, now);
};

/** Semitones of scale degree d (0-based, may pass an octave). */
export function degreeSemis(scale, d) {
  const st = scale.steps, n = st.length;
  const i = Math.max(0, Math.floor(d));
  return 12 * Math.floor(i / n) + st[i % n];
}

/** A perfect parry / dodge's sound factors for the current perfectMode() (null: today's). */
export function perfectSound() {
  return S.perfect[perfectMode()] ?? null;
}

/**
 * The parry's pitch on the scale (sfx.js parry, with opts.tune): its base (880 / 740 Hz) snapped to the
 * nearest scale note, then up one scale degree per deflect of the chain.
 */
export function tuneParry(tune, base, chain) {
  const sc = tune.scale;
  const semis = 12 * Math.log2(base / tune.tonic); // the tonic sits below the parry (262 - 524 Hz)
  // the nearest scale degree to the base
  let best = 0, bd = Infinity;
  for (let d = 0; d <= 4 * sc.steps.length; d++) {
    const e = Math.abs(degreeSemis(sc, d) - semis);
    if (e < bd) {
      bd = e;
      best = d;
    }
  }
  return tune.tonic * Math.pow(2, degreeSemis(sc, best + Math.max(0, Math.round(chain) - 1)) / 12);
}

export class StreakSound {
  constructor(E) {
    this.E = E;
    this.count = 0; // the streak as the sound knows it
    this.pending = 0; // a raise waiting for its defence event (same call stack) or the next tick
    this.voices = [];
    this.bus = null; // built the first time the piece plays
    this.layer = null;
    this.layerTier = 0;
    this.sweep = null; // the flurry's merged sweep { v, oscs, f, at }
    this.cutAt = -10;
    this.cutF = 0;
    this.lastAt = -10;
    this.key = TRACK_KEYS.synth;
    this.keyFile = '';
    // counters (tests, the Lab)
    this.climbs = 0;
    this.extras = 0;
    this.losses = 0;
    this.lastHz = 0;
    this.stolen = 0;
    this.sweeps = 0;
    this._tune = { tonic: 293.66, scale: SCALES.pent };
  }

  get k() {
    return streakK('sound');
  }

  scale() {
    return SCALES[S.scale] || SCALES.pent;
  }

  /** The key of the playing music (TRACK_KEYS). */
  currentKey() {
    const m = this.E.music;
    const file = m && m.kind === 'track' ? m.spec?.file : '';
    if (file !== this.keyFile) {
      this.keyFile = file;
      this.key = (file && TRACK_KEYS[file]) || TRACK_KEYS.synth;
    }
    return this.key;
  }

  /** The climb's frequency for a streak count (monotone up to the top degree, then held). */
  climbHz(count) {
    const sc = this.scale();
    const d = Math.min(Math.max(0, Math.round(count) - 1), sc.top);
    return inOctave(this.currentKey().tonic, S.lo) * Math.pow(2, degreeSemis(sc, d) / 12);
  }

  /** 0..1: how far past the top degree the streak is. */
  brightness(count) {
    const past = Math.round(count) - 1 - this.scale().top;
    return past < 0 ? 0 : clamp((past + 1) / S.brightSteps, 0, 1);
  }

  /** The parry recipe's tune (sfx.js parry opts.tune), or null (the piece off: today's whole tones). */
  parryTune() {
    if (!(this.k > 0)) return null;
    const t = this._tune;
    t.tonic = inOctave(this.currentKey().tonic, 262);
    t.scale = this.scale();
    return t;
  }

  // --- events --------------------------------------------------------------------------------

  /** player:streak { count, lost }. */
  onStreak(d) {
    const n = Math.max(0, Math.round(num(d.count, 0)));
    const lost = Math.max(0, Math.round(num(d.lost, 0)));
    const prev = this.count;
    this.count = n;
    if (n > prev) this.pending = n;
    else this.pending = 0;
    if (n === 0 && lost >= 2) this.loss(lost);
    this._layerTo(n);
  }

  /** A defence event (parry, dodge, clash, mikiri): plays the climb if this call raised the streak. */
  onDefence(kind) {
    if (!this.pending) return false;
    const n = this.pending;
    this.pending = 0;
    return this.climb(n, kind);
  }

  /** combat:tell / combat:flash: the climb dips under it. */
  onTell() {
    const E = this.E;
    if (!this.bus || !E.ctx || !(this.k > 0)) return;
    const g = this.bus.gain, now = E.ctx.currentTime;
    holdAt(g, now);
    g.setTargetAtTime(S.tellDuck, now, 0.008);
    g.setTargetAtTime(1, now + S.tellHold, 0.08);
  }

  /** Per frame (AudioEngine._tick): a raise nobody claimed plays now; reap; the layer follows the music. */
  tick(now) {
    if (this.pending) this.onDefence('other');
    const vs = this.voices;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      if (v.end + 0.15 < now) {
        v.dispose();
        vs.splice(i, 1);
      }
    }
    if (this.sweep && this.sweep.v.end + 0.15 < now) {
      this.sweep.v.dispose();
      this.sweep = null;
    }
    const L = this.layer;
    if (L) {
      if (L.dead && now > L.deadAt) {
        L.dispose();
        this.layer = null;
        this.layerTier = 0;
      } else if (!L.dead) {
        const key = this.currentKey();
        if (L.key !== key) L.retune(key, now);
        const mm = this.E.musicMode;
        if (mm !== 'boss' && mm !== 'boss2' && this.layerTier) this._layerTo(0);
      }
    }
  }

  // --- the climb -----------------------------------------------------------------------------

  _bus() {
    const E = this.E;
    if (this.bus || !E.ctx) return this.bus;
    const dest = E.duck || E.master;
    if (!dest) return null;
    this.bus = E.ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(dest);
    return this.bus;
  }

  _voice(gain, rev) {
    const E = this.E;
    const bus = this._bus();
    if (!bus) return null;
    const now = E.ctx.currentTime;
    // replace a note that only just began; keep at most maxVoices
    let live = 0, oldest = null;
    for (const v of this.voices) {
      if (v.killed || v.end <= now) continue;
      live++;
      if (!oldest || v.start < oldest.start) oldest = v;
    }
    if (oldest && (live >= S.maxVoices || now - this.lastAt < S.minGap)) {
      oldest.kill(now, 0.02);
      this.stolen++;
    }
    const v = new Voice(E, { bus, gain, rev, prio: 3 });
    this.voices.push(v);
    this.lastAt = now;
    return v;
  }

  /** One climb note for streak count n (kind: 'parry' | 'dodge' | 'clash' | 'mikiri' | 'other'). */
  climb(n, kind = 'other') {
    const k = this.k;
    const E = this.E;
    if (!(k > 0) || !E.ctx || !(n >= 1)) return false;
    const pm = perfectSound();
    const T = TIMBRES[S.timbre] || TIMBRES.guqin;
    const f = this.climbHz(n);
    const lvl = S.gain * k * (1 + S.growth * clamp((n - 1) / 14, 0, 1));
    const v = this._voice(1, S.rev * (pm ? (pm.ring < 1 ? 0.5 : 1.6) : 1));
    if (!v) return false;
    const t = E.ctx.currentTime + 0.006;
    const dk = pm ? pm.ring : 1;
    const D = T.decay * dk;
    for (const [r, a, ds] of T.partials) this._ping(v, t, f * r, lvl * a, T.attack, D * ds);
    const br = this.brightness(n);
    if (br > 0) this._ping(v, t, f * T.bright, lvl * S.bright * br, T.attack, D * 0.6);
    // a tier reached: the note doubled once (tiers 1-2 the fifth, 3-4 the octave, 5 both)
    const tier = streakTier(n);
    if (tier > streakTier(n - 1)) {
      const a = lvl * S.tierExtra;
      if (tier <= 2 || tier === 5) this._ping(v, t + 0.012, f * 1.5, a, T.attack, D * 0.9);
      if (tier >= 3) this._ping(v, t + 0.012, f * 2, a * 0.8, T.attack, D * 0.8);
      this.extras++;
    }
    this.climbs++;
    this.lastHz = f;
    this.lastKind = kind;
    return true;
  }

  _ping(v, t, f, a, attack, decay) {
    const o = v.osc('sine', f, t, t + attack + decay + 0.03);
    const g = v.gain(0);
    perc(g.gain, t, a, attack, decay);
    o.connect(g).connect(v.out);
  }

  /** The streak of n (>= 2) ended: its last note dropped and damped, a muted pluck under it. */
  loss(n) {
    const k = this.k;
    const E = this.E;
    if (!(k > 0) || !E.ctx) return false;
    const v = this._voice(1, S.rev * 0.5);
    if (!v) return false;
    const t = E.ctx.currentTime + 0.006;
    const f = this.climbHz(n);
    const D = S.lossDur;
    const a = S.lossGain * k;
    const lp = v.filter('lowpass', 1400, 0.6);
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + D);
    lp.connect(v.out);
    const o = v.osc('triangle', f, t, t + D + 0.05);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, -S.lossDrop / 12), t + D * 0.8);
    const g = v.gain(0);
    perc(g.gain, t, a, 0.004, D);
    o.connect(g).connect(lp);
    // the muted string: the tonic an octave under the climb's floor, very short
    const p = inOctave(this.currentKey().tonic, S.lo / 2);
    const po = v.osc('triangle', p, t, t + 0.16);
    const pg = v.gain(0);
    perc(pg.gain, t, a * 0.9, 0.002, 0.12);
    po.connect(pg).connect(lp);
    this.losses++;
    return true;
  }

  // --- the layer -----------------------------------------------------------------------------

  _layerTo(n) {
    const E = this.E;
    const k = this.k;
    if (!E.ctx) return;
    const mm = E.musicMode;
    const fight = mm === 'boss' || mm === 'boss2';
    const tier = fight && k > 0 ? streakTier(n) : 0;
    const lvl = (S.layer[tier] ?? 0) * k;
    if (!(lvl > 0)) {
      if (this.layer && !this.layer.dead) this.layer.fade(E.ctx.currentTime);
      this.layerTier = 0;
      return;
    }
    if (this.layer?.dead) {
      // fading out but not gone: it comes back from where it is
      this.layer.dead = false;
      this.layer.deadAt = Infinity;
    }
    if (!this.layer) this.layer = new DroneLayer(this, this.currentKey());
    this.layer.set(tier, lvl, E.ctx.currentTime);
    this.layerTier = tier;
  }

  /** The layer's target level now (0 when none). */
  layerLevel() {
    return this.layer && !this.layer.dead ? this.layer.level : 0;
  }

  // --- the flurry ----------------------------------------------------------------------------

  /** player:flurryHit (not the last): the 'flurryCut' opts on the scale, or null (the piece off). */
  flurryCut(d) {
    const k = this.k;
    const E = this.E;
    if (!(k > 0) || !E.ctx) return null;
    const now = E.ctx.currentTime;
    const n = clamp(Math.round(num(d.n, 1)), 1, 8);
    const sc = this.scale();
    const off = Math.max(0, streakTier(this.count) - 2);
    const deg = Math.min(S.cutTop, n - 1 + off);
    const base = nearest(this.currentKey().tonic, S.cutHi);
    const f = base * Math.pow(2, degreeSemis(sc, deg) / 12);
    const fast = n > 1 && now - this.cutAt < S.fastCut;
    if (fast) this._sweepTo(f, this.cutF, now);
    this.cutAt = now;
    this.cutF = f;
    // (base: the scale's first cut, degree 0: the recorded flurry-cut rises by f / base)
    return { n, f, fast, base };
  }

  /** The merged sweep: one voice whose pitch glides up to each new cut. */
  _sweepTo(f, from, now) {
    const E = this.E;
    const t = now + 0.006;
    let sw = this.sweep;
    if (!sw || sw.v.killed || sw.v.end < t + 0.05) {
      sw?.v.kill(now, 0.02);
      const bus = this._bus();
      if (!bus) return;
      const v = new Voice(E, { bus, gain: 1, rev: 0.3, prio: 3 });
      const g = v.gain(0);
      g.connect(v.out);
      const oscs = [];
      for (const [r, a] of [[1, 0.12], [1.498, 0.07], [2.52, 0.035]]) {
        const o = v.osc('sine', from * r, t);
        const og = v.gain(a);
        o.connect(og).connect(g);
        oscs.push([o, r]);
      }
      sw = this.sweep = { v, g, oscs };
      g.gain.setValueAtTime(0, t);
      this.sweeps++;
    }
    const dt = Math.max(0.02, Math.min(S.fastCut, now - this.cutAt) * 0.8);
    for (const [o, r] of sw.oscs) {
      hold(o.frequency, t, now);
      o.frequency.exponentialRampToValueAtTime(f * r, t + dt);
    }
    const g = sw.g.gain;
    hold(g, t, now);
    g.linearRampToValueAtTime(this.k, t + 0.008);
    g.setValueAtTime(this.k, t + dt);
    g.exponentialRampToValueAtTime(0.001, t + dt + 0.45);
    g.linearRampToValueAtTime(0, t + dt + 0.46);
    const end = t + dt + 0.5;
    for (const [o] of sw.oscs) {
      try {
        o.stop(end);
      } catch {
        /* ignore */
      }
    }
    sw.v.end = end;
  }

  /** player:flurryEnd: the 'flurryBurst' opts (the chord in the key, grander per tier), or null. */
  burst(d) {
    if (!(this.k > 0) || !this.E.ctx) return null;
    return { n: clamp(Math.round(num(d.strikes, 2)) - 1, 1, 7), f: nearest(this.currentKey().tonic, S.burstHi), tier: streakTier(this.count), k: this.k };
  }

  dispose() {
    for (const v of this.voices) v.dispose();
    this.voices.length = 0;
    this.sweep?.v.dispose();
    this.sweep = null;
    this.layer?.dispose();
    this.layer = null;
  }
}

/** The quiet drone under a long streak: the track's tonic and fifth (+ octaves at higher tiers). */
class DroneLayer {
  constructor(SS, key) {
    const E = SS.E, ctx = E.ctx;
    this.E = E;
    this.ctx = ctx;
    this.key = key;
    this.dead = false;
    this.deadAt = Infinity;
    this.level = 0;
    this.nodes = [];
    this.oscs = [];
    const now = ctx.currentTime;
    this.out = this._n(ctx.createGain());
    this.out.gain.value = 0;
    this.out.connect(E.musicBus || E.master);
    const lp = this._n(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = S.layerLp;
    lp.Q.value = 0.5;
    lp.connect(this.out);
    this.lines = [];
    const root = inOctave(key.drone[0], S.layerLo);
    for (let i = 0; i < S.layerRatios.length; i++) {
      const g = this._n(ctx.createGain());
      g.gain.value = 0;
      g.connect(lp);
      const pair = [];
      for (const det of [-S.layerBeat / 2, S.layerBeat / 2]) {
        const o = this._n(ctx.createOscillator());
        o.type = 'triangle';
        o.frequency.value = this._lineHz(key, i, root);
        o.detune.value = det;
        o.connect(g);
        o.start(now);
        this.oscs.push(o);
        pair.push(o);
      }
      this.lines.push({ g, pair });
    }
  }

  _n(n) {
    this.nodes.push(n);
    return n;
  }

  _lineHz(key, i, root) {
    // the fifth lines are the drone's second note (its pitch class, above the root)
    const r = S.layerRatios[i];
    if (r === 1.5 || r === 3) {
      let f5 = inOctave(key.drone[1], root);
      return f5 * (r === 3 ? 2 : 1);
    }
    return root * r;
  }

  set(tier, lvl, now) {
    const mix = S.layerLines[tier] || S.layerLines[5];
    for (let i = 0; i < this.lines.length; i++) {
      const p = this.lines[i].g.gain;
      holdAt(p, now);
      p.setTargetAtTime(mix[i] ?? 0, now, S.layerIn);
    }
    const g = this.out.gain;
    holdAt(g, now);
    g.setTargetAtTime(lvl, now, S.layerIn);
    this.level = lvl;
  }

  retune(key, now) {
    this.key = key;
    const root = inOctave(key.drone[0], S.layerLo);
    for (let i = 0; i < this.lines.length; i++) {
      for (const o of this.lines[i].pair) {
        holdAt(o.frequency, now);
        o.frequency.setTargetAtTime(this._lineHz(key, i, root), now, 0.5);
      }
    }
  }

  fade(now) {
    const g = this.out.gain;
    holdAt(g, now);
    g.setTargetAtTime(0, now, S.layerOut);
    this.level = 0;
    this.dead = true;
    this.deadAt = now + S.layerOut * 6;
  }

  dispose() {
    for (const o of this.oscs) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes.length = 0;
    this.oscs.length = 0;
  }
}
