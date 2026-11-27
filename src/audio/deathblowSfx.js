import { env, perc, glide, rnd, num } from './dsp.js';

// THE DEATHBLOW'S SOUND (?dbsfx=0|a|b|c|d; default d; 0 = the dodge flurry's own sounds). The parry streak's
// deathblow is a planted combo of N blows (player:flurry art 'deathblow', player:flurryHit per blow,
// player:flurryEnd). Three families of hit, each with a blow (i of n) and a finisher; all synthesised,
// all a plain recipe on a Voice (v.osc / v.noise / v.filter / v.gain / v.out), played through AudioEngine.play
// as 'dbHit' / 'dbLast' (audio.js hooks them in; docs/ARCHITECTURE.md audio section).
//   a Flesh      blade through flesh: a short wet tear (band noise sweeping down, a jagged envelope) over a
//                little low body; the finisher a deep impact with its upper harmonics (a phone plays them)
//   b Steel      a dense metal strike: a click and short inharmonic ring (steel-plate ratios, no bell tuning);
//                the finisher a huge clang whose long dark tail closes down
//   d Pierce     (the default) a blade PUNCTURING skin and passing through flesh: a tight 3-5 kHz puncture tick,
//                a wet low-mid push-through with a resonant gurgle, a dull meat thud (with harmonics); a thrust
//                (the blow's data, else every 3rd) adds a drag as the blade is drawn out; the finisher two
//                overlapping punctures, a heavy wet pull-out and a low boom
//   c Cinematic  a muffled thump at the contact and a reverse swell into the next blow; the finisher a deep
//                boom with a sub drop and its upper harmonics
// Per-blow variation comes from the audio's own seeded stream (dsp.js rnd), never Math.random; every blow
// is a little louder than the last (LEVEL.grow); no pitch ladder. The three families are levelled to the
// same A-weighted loudness (LEVEL.a / b / c, measured on the audition page's OfflineAudioContext).

const OPTS = ['0', 'a', 'b', 'c', 'd'];
const q = () => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get('dbsfx') : null;
  } catch {
    return null;
  }
};
export const DB_SFX_DEFAULT = 'd';
/** The switch (`?dbsfx=`): read at each blow (the Lab cycles it). '0' = today's flurry sounds, d = Pierce. */
export const DB_SFX = { opts: OPTS, mode: OPTS.includes(q()) ? q() : DB_SFX_DEFAULT };
export const getDbSfx = () => DB_SFX.mode;
export const setDbSfx = (m) => (DB_SFX.mode = OPTS.includes(m) ? m : DB_SFX_DEFAULT);

/** Loudness: per option [a blow, the finisher] (levelled to equal A-weighted energy), and the growth per blow (1 + grow x (i - 1)). */
export const LEVEL = { a: [1.55, 1.0], b: [0.83, 0.6], c: [1.78, 1.41], d: [1.47, 0.99], grow: 0.05 };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Sine / triangle with a falling pitch and a percussive gain. */
function tone(v, t, type, from, to, slide, a, attack, decay) {
  const s = v.osc(type, from, t, t + attack + decay + 0.03);
  if (to !== from) glide(s.frequency, t, from, to, slide);
  const g = v.gain(0);
  perc(g.gain, t, a, attack, decay);
  s.connect(g).connect(v.out);
  return s;
}

/** Noise through one filter whose cutoff glides f0 -> f1, with a piecewise-linear gain. pts = [[t, g], ...]. */
function band(v, t, kind, type, f0, f1, Q, pts) {
  const D = pts[pts.length - 1][0];
  const n = v.noise(kind, t, t + D + 0.03, rnd(0.94, 1.06));
  const f = v.filter(type, f0, Q);
  if (f1 !== f0) glide(f.frequency, t, f0, f1, D);
  const g = v.gain(0);
  env(g.gain, t, pts);
  n.connect(f).connect(g).connect(v.out);
  return f;
}

/** A struck partial set: each [ratio, amp, decay] a sine; `tail` (optional) closes a lowpass over the ring. */
function ring(v, t, f0, parts, a, decayK, tail) {
  let dst = v.out;
  let D = 0;
  for (const p of parts) D = Math.max(D, p[2] * decayK);
  if (tail) {
    const lp = v.filter('lowpass', tail[0], 0.7);
    glide(lp.frequency, t, tail[0], tail[1], D);
    lp.connect(v.out);
    dst = lp;
  }
  for (const [r, amp, d] of parts) {
    const s = v.osc('sine', f0 * r * rnd(0.998, 1.002), t, t + d * decayK + 0.05);
    const g = v.gain(0);
    perc(g.gain, t, a * amp, 0.002, d * decayK);
    s.connect(g).connect(dst);
  }
}

// --- a: Flesh --------------------------------------------------------------------------------

/** One wet tear: the cut's band sweeping down through a jagged envelope, a bite of high crackle at its start. */
function tear(v, t, k, D, lo) {
  const j1 = rnd(0.4, 0.7), j2 = rnd(0.3, 0.6);
  band(v, t, 'pink', 'bandpass', rnd(2300, 2900), lo, 1.3, [
    [0, 0], [0.004, 0.62 * k], [D * 0.3, 0.62 * k * j1], [D * 0.45, 0.5 * k], [D * 0.62, 0.5 * k * j2], [D, 0],
  ]);
  band(v, t, 'white', 'highpass', 3600, 3600, 0.7, [[0, 0], [0.003, 0.2 * k], [D * 0.5, 0.05 * k], [D * 0.85, 0]]);
}

const FLESH = {
  hit(v, t, o) {
    const k = o.k, D = rnd(0.1, 0.14);
    tear(v, t, k, D, rnd(520, 760));
    tone(v, t + 0.006, 'sine', rnd(125, 150), 52, 0.08, 0.5 * k, 0.004, 0.16);
    tone(v, t + 0.006, 'triangle', rnd(250, 300), 104, 0.08, 0.14 * k, 0.004, 0.09);
  },
  last(v, t, o) {
    const k = o.k;
    tear(v, t, k * 1.1, 0.24, 420);
    tear(v, t + 0.035, k * 0.8, 0.2, 360);
    // the deep impact: the fundamental under, then its harmonics so a phone plays it
    tone(v, t + 0.012, 'sine', 96, 34, 0.28, 0.55 * k, 0.006, 0.95);
    tone(v, t + 0.012, 'triangle', 192, 68, 0.28, 0.45 * k, 0.006, 0.6);
    tone(v, t + 0.012, 'sine', 288, 102, 0.26, 0.3 * k, 0.006, 0.4);
    tone(v, t + 0.012, 'sine', 480, 170, 0.22, 0.14 * k, 0.006, 0.25);
    band(v, t + 0.01, 'brown', 'lowpass', 520, 120, 0.8, [[0, 0], [0.01, 0.45 * k], [0.35, 0]]);
  },
};

// --- b: Steel --------------------------------------------------------------------------------

const PLATE = [[1, 1, 1], [1.59, 0.7, 0.8], [2.14, 0.55, 0.65], [2.65, 0.4, 0.5], [3.52, 0.28, 0.4], [4.8, 0.18, 0.3], [6.3, 0.1, 0.22]];

const STEEL = {
  hit(v, t, o) {
    const k = o.k, f0 = rnd(440, 640);
    band(v, t, 'white', 'highpass', 1800, 1800, 0.8, [[0, 0], [0.002, 0.6 * k], [0.03, 0.15 * k], [0.05, 0]]);
    ring(v, t, f0, PLATE, 0.13 * k, rnd(0.16, 0.22));
    tone(v, t, 'sine', rnd(150, 175), 70, 0.05, 0.5 * k, 0.003, 0.1);
    tone(v, t, 'triangle', rnd(300, 350), 140, 0.05, 0.12 * k, 0.003, 0.06);
  },
  last(v, t, o) {
    const k = o.k;
    band(v, t, 'white', 'highpass', 1400, 1400, 0.8, [[0, 0], [0.003, 0.8 * k], [0.06, 0.2 * k], [0.12, 0]]);
    ring(v, t, 175, PLATE, 0.14 * k, 3.4, [3600, 380]);
    // two near partials beating, an octave down: the clang's slow shudder
    for (const [f, d] of [[88, 2.2], [89.7, 2.2], [264, 1.4]]) tone(v, t, 'sine', f, f, 0, 0.14 * k, 0.003, d);
    tone(v, t, 'sine', 120, 45, 0.15, 0.4 * k, 0.004, 0.5);
    tone(v, t, 'triangle', 240, 90, 0.15, 0.22 * k, 0.004, 0.3);
  },
};

// --- c: Cinematic ----------------------------------------------------------------------------

const CINE = {
  hit(v, t, o) {
    const k = o.k;
    // the muffled thump at the contact
    tone(v, t, 'sine', rnd(100, 118), 46, 0.09, 0.6 * k, 0.004, 0.2);
    tone(v, t, 'triangle', rnd(200, 235), 92, 0.09, 0.17 * k, 0.004, 0.1);
    band(v, t, 'brown', 'lowpass', 700, 260, 0.7, [[0, 0], [0.004, 0.5 * k], [0.09, 0]]);
    // the reverse swell into the next blow: it builds over the gap and is cut at the contact
    if (o.swell > 0.08) {
      const S = o.swell, at = t + 0.07;
      band(v, at, 'pink', 'bandpass', 280, rnd(2000, 2600), 1.1, [[0, 0], [S * 0.8, 0.3 * k], [S, 0.34 * k], [S + 0.012, 0]]);
      const s = v.osc('triangle', 90, at, at + S + 0.03);
      glide(s.frequency, at, 90, 220, S);
      const g = v.gain(0);
      env(g.gain, at, [[0, 0], [S * 0.85, 0.1 * k], [S + 0.012, 0]]);
      s.connect(g).connect(v.out);
    }
  },
  last(v, t, o) {
    const k = o.k;
    tone(v, t, 'sine', 70, 30, 0.45, 0.4 * k, 0.006, 1.5);
    // the sub drop: a deeper note falling under the boom, and the boom's upper harmonics
    tone(v, t + 0.04, 'sine', 52, 22, 1.1, 0.28 * k, 0.03, 1.4);
    tone(v, t, 'triangle', 140, 60, 0.4, 0.42 * k, 0.006, 0.9);
    tone(v, t, 'sine', 210, 90, 0.4, 0.3 * k, 0.006, 0.55);
    tone(v, t, 'sine', 350, 150, 0.35, 0.14 * k, 0.006, 0.35);
    band(v, t, 'brown', 'lowpass', 900, 150, 0.8, [[0, 0], [0.006, 0.55 * k], [0.5, 0]]);
    band(v, t, 'pink', 'lowpass', 1800, 300, 0.7, [[0, 0], [0.004, 0.3 * k], [0.14, 0]]);
  },
};

// --- d: Pierce -------------------------------------------------------------------------------

/** The puncture: a very fast click into a narrow band of noise around 3-5 kHz, a few ms. */
function puncture(v, t, k) {
  band(v, t, 'white', 'bandpass', rnd(3200, 4800), rnd(3000, 4200), 2.2, [[0, 0], [0.0012, 0.75 * k], [0.005, 0.3 * k], [0.011, 0]]);
  band(v, t, 'white', 'highpass', 5200, 5200, 0.7, [[0, 0], [0.001, 0.12 * k], [0.004, 0]]);
}
/** The wet push-through: low-mid noise (pink / brown, ~400-1400 Hz) in a squelchy jagged envelope, and a gurgle (a Q 6 bandpass swept down). */
function push(v, t, k, D, f0) {
  const a = rnd(0.45, 0.8), b = rnd(0.35, 0.7), c = rnd(0.5, 0.85);
  band(v, t, 'pink', 'bandpass', f0, rnd(400, 520), 1.1, [
    [0, 0], [0.005, 0.8 * k], [D * 0.22, 0.8 * k * a], [D * 0.34, 0.7 * k], [D * 0.52, 0.7 * k * b], [D * 0.66, 0.55 * k * c], [D * 0.85, 0.3 * k], [D, 0],
  ]);
  band(v, t, 'brown', 'lowpass', 900, 380, 0.8, [[0, 0], [0.008, 0.5 * k], [D * 0.7, 0.25 * k], [D, 0]]);
  band(v, t + 0.01, 'pink', 'bandpass', rnd(950, 1150), rnd(300, 380), 6, [
    [0, 0], [D * 0.15, 0.4 * k], [D * 0.3, 0.12 * k], [D * 0.5, 0.36 * k], [D * 0.75, 0.1 * k], [D * 0.95, 0],
  ]);
}
/** The blade drawn out: a short swell that builds and is cut as the steel clears the flesh. */
function drag(v, t, k, S, f0) {
  band(v, t, 'pink', 'bandpass', f0, f0 * 1.9, 1.4, [[0, 0], [S * 0.55, 0.18 * k], [S * 0.9, 0.42 * k], [S * 0.96, 0.28 * k], [S, 0]]);
  band(v, t, 'brown', 'lowpass', 600, 300, 0.8, [[0, 0], [S * 0.8, 0.22 * k], [S, 0]]);
}

const PIERCE = {
  hit(v, t, o) {
    const k = o.k, D = rnd(0.07, 0.115);
    puncture(v, t, k);
    push(v, t + 0.003, k, D, rnd(1100, 1400));
    // the dull meat thud under it, with its harmonics so a phone plays it
    const f = rnd(92, 130);
    tone(v, t + 0.004, 'sine', f, f * 0.45, 0.07, 0.55 * k, 0.004, 0.15);
    tone(v, t + 0.004, 'triangle', f * 2, f * 0.9, 0.07, 0.2 * k, 0.004, 0.09);
    tone(v, t + 0.004, 'sine', f * 3, f * 1.35, 0.06, 0.1 * k, 0.004, 0.06);
    if (o.thrust) drag(v, t + D + rnd(0.0, 0.03), k * 0.9, rnd(0.08, 0.12), rnd(450, 620));
  },
  last(v, t, o) {
    const k = o.k;
    puncture(v, t, k);
    puncture(v, t + 0.038, k * 0.85);
    push(v, t + 0.003, k * 1.1, 0.24, 1250);
    push(v, t + 0.04, k * 0.8, 0.2, 950);
    // the low impact boom with its harmonics
    tone(v, t + 0.008, 'sine', 78, 32, 0.3, 0.6 * k, 0.005, 0.7);
    tone(v, t + 0.008, 'triangle', 156, 66, 0.3, 0.4 * k, 0.005, 0.5);
    tone(v, t + 0.008, 'sine', 234, 100, 0.28, 0.24 * k, 0.005, 0.34);
    tone(v, t + 0.008, 'sine', 390, 170, 0.22, 0.1 * k, 0.005, 0.2);
    // the heavy wet pull-out
    drag(v, t + 0.27, k * 1.5, 0.3, 380);
    band(v, t + 0.3, 'pink', 'bandpass', 900, 350, 5, [[0, 0], [0.06, 0.3 * k], [0.12, 0.1 * k], [0.2, 0.22 * k], [0.28, 0]]);
  },
};

const FAMILY = { a: FLESH, b: STEEL, c: CINE, d: PIERCE };

/**
 * The AudioEngine.play defs: 'dbHit' (a blow) and 'dbLast' (the finisher). opts { mode 'a'|'b'|'c'|'d', i, n,
 * swell (s to the next blow, 'c'), thrust (d: the blow is a thrust; else every 3rd), gain }. `bus: 'cue'`: crisp while the world is held and muffled round it.
 */
function build(last) {
  return {
    prio: 6, rev: last ? 0.35 : 0.18, gap: 0, bus: 'cue',
    play(v, t, o) {
      const fam = FAMILY[o.mode];
      if (!fam) return;
      const n = clamp(Math.round(num(o.n, 1)), 1, 7), i = clamp(Math.round(num(o.i, 1)), 1, n);
      const k = (LEVEL[o.mode]?.[last ? 1 : 0] ?? 1) * (1 + LEVEL.grow * (i - 1)) * Math.max(0, num(o.gain, 1));
      fam[last ? 'last' : 'hit'](v, t, { k, i, n, swell: num(o.swell, 0), thrust: o.thrust ?? i % 3 === 0 });
    },
  };
}
export const DB_SFX_DEFS = { dbHit: build(false), dbLast: build(true) };

/**
 * One blow's sound for player:flurryHit data `d` (n, of, last): the play() name and opts, or null when
 * the switch is '0'. `gap` is the estimated seconds to the next blow (the reverse swell's length).
 */
export function deathblowSound(d, mode = DB_SFX.mode, gap = 0.4) {
  if (!FAMILY[mode]) return null;
  const of = num(d?.of, 1), n = num(d?.n, 1), last = !!d?.last || n >= of;
  const opts = { mode, i: n, n: of, swell: last ? 0 : clamp(gap - 0.07, 0.1, 0.38) };
  if (d?.thrust != null) opts.thrust = !!d.thrust;
  return { name: last ? 'dbLast' : 'dbHit', opts };
}
