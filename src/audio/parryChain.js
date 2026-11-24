import { clamp } from '../core/math.js';
import { perc, glide, num } from './dsp.js';

// THE DEFLECT CHAIN on the recorded parry (sampleList.js 'parry' / 'parry-blue'; audio.js _parry). The synth
// parry climbs two semitones per deflect with a bright bell and a sparkle on top; the owner turned that down
// for the recorded parry ("make it sound more serious and cool. current sounds like its for kids"). Here the
// chain builds WEIGHT, not pitch: no bell, no sparkle, no arpeggio. Three ideas behind `?chain=a|b|c`
// (samples.js chainMode(); the Lab's chain row), default a. A parry of chain n builds by
// k = (n - 1) / (full - 1), held at 1 after `full`; a single parry (chain 1) is the recording alone.
//
//   a  weight         the same clang an octave under itself (rate x0.5: a longer, darker ring through a
//                     low-pass) and a saturated sub (thump.js's voice) under it, both growing with the chain
//   b  doubled strike a second strike of the recording a breath after the first (and a third from chain 4),
//                     a driven band of the same clang beside it, the pitch up half a semitone a deflect
//                     (two at most)
//   c  long ring      a low steel ring in the track's key (the streak's tonic, else G) that rings longer with
//                     the chain, and more of the clang in the hall
//
// Per variant: db (the clang's own gain at full build, dB), semis (pitch per deflect), semisMax; the layers'
// [at chain 2, at full] pairs are lerped by k. Nothing here draws randomness (no Math.random, no arand).

export const PARRY_CHAIN = {
  full: 5,
  a: {
    label: 'weight',
    db: 1.5,
    semis: 0,
    shadow: { rate: 0.5, gain: [0.22, 0.55], lp: 2400 },
    sub: { f0: 84, f1: 36, slide: 0.13, gain: [0.3, 0.85], decay: [0.18, 0.34], harm: 0.6, drive: 0.62, curve: 4, lp: 420 },
  },
  b: {
    label: 'doubled strike',
    db: 1,
    semis: 0.5,
    semisMax: 2,
    strikes: [
      { from: 2, at: 0.024, rate: 0.96, gain: [0.35, 0.6] },
      { from: 4, at: 0.05, rate: 0.92, gain: [0.25, 0.4] },
    ],
    grit: { drive: [4, 24], hz: 1700, q: 0.7, gain: [0.1, 0.3] },
  },
  c: {
    label: 'long ring',
    db: 0.5,
    semis: 0,
    ring: { lo: 110, partials: [[1, 1, 1], [1.003, 0.5, 1.1], [2.32, 0.45, 0.6], [3.7, 0.25, 0.4]], gain: [0.05, 0.12], decay: [0.5, 1.7] },
    hall: [0.12, 0.5],
  },
};

const lerp = (p, k) => p[0] + (p[1] - p[0]) * k;

/** 0..1: how far chain `ch` has built (0 at a single parry). */
export function chainK(ch) {
  return clamp((num(ch, 1) - 1) / Math.max(1, PARRY_CHAIN.full - 1), 0, 1);
}

/** The recorded clang's rate (x) for chain `ch` under variant V. */
export function chainRate(V, ch) {
  const s = Math.min(num(V.semisMax, 24), num(V.semis, 0) * Math.max(0, num(ch, 1) - 1));
  return Math.pow(2, s / 12);
}

/** The recorded clang's gain (x) for chain `ch` under variant V. */
export function chainGain(V, ch) {
  return Math.pow(10, (num(V.db, 0) * chainK(ch)) / 20);
}

/**
 * The variant's layers for chain `ch` (>= 2) into voice `v`, its clang started at t with file `r` at `rate`
 * (bank = the SampleBank: start()). tune: the streak's parry tune (its tonic) or null.
 */
export function chainLayers(E, V, ch, v, t, r, rate, bank, tune) {
  const k = chainK(ch);
  if (V.shadow) {
    const S = V.shadow;
    const lp = v.filter('lowpass', S.lp, 0.7);
    lp.connect(v.out);
    bank.start(v, t, r, lerp(S.gain, k), rate * S.rate, { dest: lp });
  }
  if (V.sub) {
    const S = V.sub;
    const D = lerp(S.decay, k);
    const end = t + 0.006 + D + 0.03;
    const a = v.osc('sine', S.f0, t, end);
    glide(a.frequency, t, S.f0, S.f1, S.slide);
    const h = v.osc('sine', S.f0 * 2, t, end);
    glide(h.frequency, t, S.f0 * 2, S.f1 * 2, S.slide);
    const pre = v.gain(S.drive);
    const hg = v.gain(S.harm);
    a.connect(pre);
    h.connect(hg).connect(pre);
    const g = v.gain(0);
    perc(g.gain, t, lerp(S.gain, k), 0.006, D);
    pre.connect(v.shaper(S.curve)).connect(v.filter('lowpass', S.lp, 0.6)).connect(g).connect(v.out);
  }
  if (V.strikes) {
    for (const S of V.strikes) if (ch >= S.from) bank.start(v, t + S.at, r, lerp(S.gain, k), rate * S.rate);
  }
  if (V.grit) {
    const S = V.grit;
    const bp = v.filter('bandpass', S.hz, S.q);
    const sh = v.shaper(lerp(S.drive, k));
    sh.connect(bp).connect(v.out);
    bank.start(v, t, r, lerp(S.gain, k), rate, { dest: sh });
  }
  if (V.ring) {
    const S = V.ring;
    let f = tune && tune.tonic > 0 ? tune.tonic : 196;
    while (f >= S.lo * 2) f /= 2;
    while (f < S.lo) f *= 2;
    const D = lerp(S.decay, k), A = lerp(S.gain, k);
    for (const [ratio, amp, ds] of S.partials) {
      const o = v.osc('sine', f * ratio, t, t + 0.002 + D * ds + 0.05);
      const g = v.gain(0);
      perc(g.gain, t, A * amp, 0.002, D * ds);
      o.connect(g).connect(v.out);
    }
  }
  if (V.hall && E.reverbIn) {
    const s = v.gain(lerp(V.hall, k));
    v.out.connect(s);
    s.connect(E.reverbIn);
  }
}
