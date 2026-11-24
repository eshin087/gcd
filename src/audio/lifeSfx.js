import { clamp } from '../core/math.js';
import { env, perc, num } from './dsp.js';
import { LIFE_SFX_TUNE, lifeHeard, lifeSfxLevel } from './lifeSfxTuning.js';

// THE LIVING WORLD'S ONE-SHOT SOUNDS (`life.sound(name, x, z, o)` → audio.play): a flock's wings, an
// animal's rustle, a tree's shudder and creak, dust and pebbles, a lantern catching, guttering, dying.
// Synthesized only (the owner turned down recorded ambience as noisy), quiet, short, under the fight.
// Same definition format as sfx.js: { prio, rev, gap, falloff, bus, gain, play(v, t, o, E) }; audio.js
// looks a name up here after SFX, FIRE_SFX and THUMP_SFX. Every number: lifeSfxTuning.js.
//
//   flockBurst  { n (birds, 4..48), kind 'small' | 'crow' | 'pigeon' }   the wings of a roost leaving
//   animalBolt  { kind 'rabbit' | 'deer' | 'rat' | 'lizard' | 'fox' }   an animal bolting for cover
//   treeShudder { k (0..2), kind 'leaf' | 'dead' | 'cane' }              a tree shaken, not broken
//   treeCreak   { k (0.5..1.5) }                                         a tree leaning to its fall
//   dustSift    { k }   pebbles { k, mat 'stone' | 'glass' | 'sand' | 'earth' }   leafSkitter { k }
//   lampCatch / lampGutter / lampOut { k (0..1) }                         a lantern or brazier
//
// Each one varies per call (pitch, timing, band, count) from this module's OWN stream (an LCG): never
// Math.random (the seeded fight sims replay it) and never the audio's shared stream (dsp.js arand: the
// fight's sounds keep their sequence). Noise offsets come from it too.
//
//   lifeSay(life, name, x, z, o, i)   how the living world's layers call them: the level's choice (a
//                         name the level never hears: nothing; its gain), the layer-side rate limit
//                         (LIFE_SFX_TUNE.say: `gap` s between two of a name; `i` > 0: the i-th of one
//                         burst, which passes only in the same frame as the first), quieter while the boss
//                         is up (LIFE_SFX_TUNE.fight), the level's kind (birds, ground, tree) when `o` gives
//                         none; then life.sound. Returns whether it played. `o` is read, never kept.

const S = LIFE_SFX_TUNE.sound;

let seed = 0x5bd1e995;
/** this module's own stream (0..1) */
const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const rr = (a, b) => a + (b - a) * r();
const ra = (A) => A[0] + (A[1] - A[0]) * r();
const ri = (A) => Math.round(ra(A));

// ---- building blocks ---------------------------------------------------------------------------------

/** Looping noise from the engine's tables, its offset from this stream. */
const src = (v, kind, t0, t1, rate = 1) => v.noise(kind, t0, t1, rate, r() * 0.999);

/** A noise burst: kind → filter → percussive envelope → out. Returns the filter. */
function nb(v, t, kind, type, f, q, a, attack, decay) {
  const n = src(v, kind, t, t + attack + decay + 0.03, rr(0.94, 1.06));
  const fl = v.filter(type, f, q);
  const g = v.gain(0);
  perc(g.gain, t, a, attack, decay);
  n.connect(fl).connect(g).connect(v.out);
  return fl;
}

/** A short pitched decay → out. */
function ping(v, t, type, f, a, decay, attack = 0.002) {
  const s = v.osc(type, f, t, t + attack + decay + 0.03);
  const g = v.gain(0);
  perc(g.gain, t, a, attack, decay);
  s.connect(g).connect(v.out);
  return s;
}

/** A soft thud: a sine falling in pitch and a little low noise under it. */
function thud(v, t, from, to, a, decay) {
  const s = v.osc('sine', from, t, t + decay + 0.05);
  s.frequency.setValueAtTime(from, t);
  s.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay * 0.7);
  const g = v.gain(0);
  perc(g.gain, t, a, 0.004, decay);
  s.connect(g).connect(v.out);
  nb(v, t, 'brown', 'lowpass', 240, 0.7, a * 0.9, 0.004, decay * 0.7);
}

// The claps / grains of one sound: a fixed pool of records, filled, sorted by time, then written onto
// one gain param each (one noise source per band, not one per clap).
const MAXEV = 240;
const EV = Array.from({ length: MAXEV }, () => ({ t: 0, a: 0, b: 0, up: 0.002, down: 0.01 }));
let evN = 0;
function ev(t, a, b, up, down) {
  if (evN >= MAXEV || !(t >= 0) || !(a > 0)) return;
  const e = EV[evN++];
  e.t = t; e.a = a; e.b = b; e.up = Math.max(0.0004, up); e.down = Math.max(0.0008, down);
}
function sortEv() {
  for (let i = 1; i < evN; i++) {
    const e = EV[i];
    let j = i - 1;
    while (j >= 0 && EV[j].t > e.t) {
      EV[j + 1] = EV[j];
      j--;
    }
    EV[j + 1] = e;
  }
}
/** The last event's time + its tail (s after t). */
function evEnd() {
  let end = 0;
  for (let i = 0; i < evN; i++) end = Math.max(end, EV[i].t + EV[i].up * 3 + EV[i].down * 6);
  return end;
}
/** The events of band b, written as soft claps on a gain param (t: the sound's start). */
function claps(p, t, b) {
  p.setValueAtTime(0, t);
  for (let i = 0; i < evN; i++) {
    const e = EV[i];
    if (e.b !== b) continue;
    p.setTargetAtTime(e.a, t + e.t, e.up);
    p.setTargetAtTime(0, t + e.t + e.up * 2.5, e.down);
  }
}
/** A noise band carrying the events of band b → out. Returns the filter. */
function band(v, t, end, kind, type, f, q, b) {
  const n = src(v, kind, t, t + end + 0.02, rr(0.95, 1.05));
  const fl = v.filter(type, f, q);
  const g = v.gain(0);
  claps(g.gain, t, b);
  n.connect(fl).connect(g).connect(v.out);
  return fl;
}

// ---- the sounds --------------------------------------------------------------------------------------

export const LIFE_SFX = Object.freeze({
  flockBurst: {
    ...pick(S.flockBurst),
    play(v, t, o) {
      const K = S.flockBurst.kinds[o.kind] ?? S.flockBurst.kinds.small;
      const n = clamp(Math.round(num(o.n, 24)), 4, 48);
      // (more birds: louder, but slower than their count: a clap's level falls as n^-0.25)
      const a0 = K.amp * Math.pow(20 / n, 0.25);
      evN = 0;
      for (let i = 0; i < n; i++) {
        // its own moment: more go early than late (as flock.js launches them)
        const tb = i === 0 ? 0 : K.spread * Math.pow(r(), 1.6);
        const beats = ri(K.beats), per = 1 / (K.beat * rr(0.8, 1.2)), b = r() < 0.5 ? 0 : 1;
        for (let j = 0; j < beats; j++) ev(tb + j * per * rr(0.85, 1.15), a0 * rr(0.45, 1) * (1 - 0.16 * j), b, K.clap[0] * rr(0.7, 1.3), K.clap[1] * rr(0.7, 1.3));
      }
      sortEv();
      const end = evEnd();
      band(v, t, end, K.noise, 'bandpass', K.band[0] * rr(0.9, 1.1), K.q, 0);
      band(v, t, end, K.noise, 'bandpass', K.band[1] * rr(0.9, 1.1), K.q, 1);
      // the low swell of all of them, and the air they move (a band that rises as they climb)
      const kn = Math.sqrt(n / 24), sp = K.spread;
      const bn = src(v, 'brown', t, t + end + 0.05), lp = v.filter('lowpass', K.bodyHz * rr(0.9, 1.1), 0.7), bg = v.gain(0);
      env(bg.gain, t, [[0, 0], [0.05, K.body * kn * 0.7], [sp * 0.3, K.body * kn], [sp * 0.85, K.body * kn * 0.45], [end, 0]]);
      bn.connect(lp).connect(bg).connect(v.out);
      const wn = src(v, 'pink', t, t + end + 0.05), bp = v.filter('bandpass', K.washHz[0], 0.8), wg = v.gain(0);
      env(bp.frequency, t, [[0, K.washHz[0] * rr(0.9, 1.1)], [end, K.washHz[1] * rr(0.9, 1.1)]]);
      env(wg.gain, t, [[0, 0], [sp * 0.45, K.wash * kn], [end, 0]]);
      wn.connect(bp).connect(wg).connect(v.out);
    },
  },

  animalBolt: {
    ...pick(S.animalBolt),
    play(v, t, o) {
      const A = S.animalBolt;
      const kind = A[o.kind] ? o.kind : 'rabbit', K = A[kind];
      evN = 0;
      if (kind === 'rabbit') {
        // a hop: a quick brush of grass and a soft pad under it
        const n = ri(K.hops);
        let at = 0;
        for (let i = 0; i < n; i++) {
          const k = 1 - 0.25 * i;
          nb(v, t + at, 'pink', 'bandpass', ra(K.band), 0.8, K.amp * k * rr(0.7, 1), rr(0.008, 0.016), ra(K.decay));
          nb(v, t + at + 0.01, 'brown', 'lowpass', rr(160, 210), 0.7, K.thump * k, 0.006, 0.04);
          at += ra(K.every);
        }
      } else if (kind === 'deer') {
        // a bound: two hooves (front, back) and a brush of the undergrowth on the first
        const n = ri(K.bounds);
        let at = 0;
        for (let i = 0; i < n; i++) {
          const k = 1 - 0.2 * i, f = ra(K.hoofHz);
          thud(v, t + at, f, f * 0.55, K.hoof * k * rr(0.75, 1), rr(0.07, 0.1));
          thud(v, t + at + ra(K.pair), f * rr(0.92, 1.08), f * 0.5, K.hoof * 0.7 * k * rr(0.75, 1), rr(0.06, 0.09));
          if (i === 0) nb(v, t + at, 'pink', 'bandpass', rr(1300, 1900), 0.7, K.brush, 0.02, 0.14);
          at += ra(K.every);
        }
      } else if (kind === 'rat') {
        // a scratch-skitter: tiny claws on stone in a quick run, a faint scrape under it
        const len = ra(K.len), rate = ra(K.rate);
        for (let u = 0; u < len; u += (1 / rate) * rr(0.6, 1.4)) ev(u, K.amp * rr(0.4, 1) * (1 - 0.4 * (u / len)), r() < 0.6 ? 0 : 1, 0.0008, rr(0.002, 0.005));
        sortEv();
        const end = evEnd();
        band(v, t, end, 'white', 'bandpass', K.band[0] * rr(0.9, 1.1), 2, 0);
        band(v, t, end, 'white', 'bandpass', K.band[1] * rr(0.9, 1.1), 2.5, 1);
        const n = src(v, 'pink', t, t + len + 0.05), hp = v.filter('highpass', 2500, 0.7), g = v.gain(0);
        env(g.gain, t, [[0, 0], [0.03, K.scrape], [len, 0]]);
        n.connect(hp).connect(g).connect(v.out);
      } else if (kind === 'lizard') {
        // ticks on stone: a burst, a freeze, a burst (its scuttle)
        const bursts = ri(K.bursts);
        let at = 0;
        for (let i = 0; i < bursts; i++) {
          const len = ra(K.len), rate = ra(K.rate);
          for (let u = 0; u < len; u += (1 / rate) * rr(0.7, 1.3)) ev(at + u, K.amp * rr(0.35, 1), 0, 0.0005, rr(0.0015, 0.003));
          at += len + ra(K.rest);
        }
        sortEv();
        band(v, t, evEnd(), 'white', 'bandpass', ra(K.band), 4, 0);
      } else {
        // the fox: one soft rustle as it slips into the dark
        nb(v, t, 'pink', 'bandpass', ra(K.band), 0.7, K.amp * rr(0.8, 1), rr(0.025, 0.04), ra(K.decay));
      }
    },
  },

  treeShudder: {
    ...pick(S.treeShudder),
    play(v, t, o) {
      const A = S.treeShudder, K = A[o.kind] ?? A.leaf;
      const k = clamp(num(o.k, 1), 0.15, 2), s = Math.min(1.3, 0.45 + 0.55 * k);
      const D = ra(K.len) * (0.8 + 0.2 * Math.min(1.5, k));
      // the shake: a band of leaves (or twigs) fluttering, each flutter weaker as it settles
      evN = 0;
      const rate = ra(K.rate);
      for (let u = 0; u < D; u += (1 / rate) * rr(0.7, 1.3)) {
        const f = 1 - u / D;
        ev(u, K.amp * s * Math.pow(f, 1.2) * rr(0.55, 1), 0, 0.004, (0.5 / rate) * rr(0.7, 1.2));
      }
      if (K.tick > 0) for (let i = ri([4, 8]); i > 0; i--) ev(D * Math.pow(r(), 1.5), K.tick * s * rr(0.4, 1), 1, 0.0006, rr(0.002, 0.005));
      sortEv();
      const end = Math.max(D, evEnd());
      band(v, t, end, K === A.dead ? 'white' : 'pink', 'bandpass', K.band * rr(0.85, 1.15), K.q, 0);
      if (K.tick > 0) band(v, t, end, 'white', 'bandpass', rr(5000, 6500), 2, 1);
      // the leaves' own soft hiss under the flutter
      if (K !== A.dead) nb(v, t, 'pink', 'bandpass', K.band * rr(0.9, 1.1), 0.7, K.amp * 0.3 * s, 0.02, D * 0.6);
      // the trunk: a dull knock
      if (K.knock > 0) thud(v, t, rr(140, 170), 80, K.knock * s, 0.08);
    },
  },

  treeCreak: {
    ...pick(S.treeCreak),
    play(v, t, o) {
      const C = S.treeCreak, k = clamp(num(o.k, 1), 0.4, 1.6);
      const D = ra(C.len), f0 = ra(C.rate), end = t + D + 0.06;
      // the wood's stick-slip: a pulse train whose rate slides as it gives
      const saw = v.osc('sawtooth', f0, t, end);
      env(saw.frequency, t, [[0, f0], [D * 0.3, f0 * rr(1.1, 1.35)], [D * 0.62, f0 * rr(0.78, 0.98)], [D, f0 * rr(1.3, 1.6)]]);
      const lfo = v.osc('sine', rr(5, 9), t, end), dep = v.gain(f0 * 0.07);
      lfo.connect(dep).connect(saw.frequency);
      // its grain: the pulses come in uneven clumps
      const am = v.gain(0.7);
      for (let u = 0.02; u < D; u += rr(0.025, 0.06)) am.gain.setTargetAtTime(rr(0.3, 1), t + u, 0.006);
      saw.connect(am);
      // (its level grows slower than the shake: a hard one is not much louder; the first formant at full,
      // the second and the body under it)
      const out = v.gain(0);
      const a = C.amp * 1.6 * Math.sqrt(k);
      env(out.gain, t, [[0, 0], [0.14, a * 0.55], [D * 0.5, a], [D * 0.85, a * 0.5], [D, 0]]);
      out.connect(v.out);
      const f1 = v.filter('bandpass', ra(C.f1), 7);
      am.connect(f1).connect(out);
      const f2 = v.filter('bandpass', ra(C.f2), 9), g2 = v.gain(0.55 / 1.6);
      am.connect(f2).connect(g2).connect(out);
      const lp = v.filter('lowpass', 210, 0.7), g3 = v.gain(Math.min(1, C.body / Math.max(1e-3, C.amp * 1.6)));
      am.connect(lp).connect(g3).connect(out);
      // a few fibres giving at the end
      evN = 0;
      for (let i = ri([4, 8]); i > 0; i--) ev(D * rr(0.55, 1), C.fibres * k * rr(0.4, 1), 0, 0.0005, rr(0.002, 0.006));
      sortEv();
      band(v, t, Math.max(D, evEnd()), 'white', 'bandpass', rr(2000, 2800), 1.2, 0);
    },
  },

  dustSift: {
    ...pick(S.dustSift),
    play(v, t, o) {
      const C = S.dustSift, k = clamp(num(o.k, 1), 0.3, 1.6);
      const D = ra(C.len), n = Math.round(ra(C.grains) * Math.min(1.3, 0.5 + 0.5 * k));
      evN = 0;
      // grains: a trickle that thins (more of them early)
      for (let i = 0; i < n; i++) {
        const u = Math.pow(r(), 1.4);
        ev(D * u, C.amp * k * rr(0.25, 1) * (1 - 0.6 * u), r() < 0.5 ? 0 : 1, 0.0006, rr(0.0012, 0.0035));
      }
      sortEv();
      const end = Math.max(D, evEnd());
      band(v, t, end, 'white', 'highpass', C.hp * rr(0.9, 1.1), 0.7, 0);
      band(v, t, end, 'white', 'bandpass', C.hp * rr(1.3, 1.6), 1.5, 1);
      const n2 = src(v, 'pink', t, t + D + 0.03), hp = v.filter('highpass', 3000, 0.6), g = v.gain(0);
      env(g.gain, t, [[0, 0], [0.12, C.hiss * k], [D, 0]]);
      n2.connect(hp).connect(g).connect(v.out);
    },
  },

  pebbles: {
    ...pick(S.pebbles),
    play(v, t, o) {
      const C = S.pebbles, K = C[o.mat] ?? C.stone, k = clamp(num(o.k, 1), 0.3, 2);
      const n = Math.round(C.count[0] + (C.count[1] - C.count[0]) * clamp((k - 0.3) / 1.3, 0, 1));
      evN = 0;
      let rings = 0;
      for (let i = 0; i < n; i++) {
        const t1 = ra(C.first), a = C.amp * rr(0.45, 1), b = r() < 0.5 ? 0 : 1;
        ev(t1, a, b, 0.0005, rr(0.003, 0.008));
        const t2 = t1 + ra(C.bounce);
        ev(t2, a * rr(0.22, 0.45), b, 0.0005, rr(0.002, 0.005));
        if (r() < 0.3) ev(t2 + ra(C.bounce) * 0.6, a * rr(0.08, 0.18), b, 0.0005, 0.002);
        // a stone's tick: a faint ring on some of the first hits
        if (K.ring > 0 && rings < 5 && r() < 0.5) {
          rings++;
          ping(v, t + t1, 'sine', (b ? K.band[1] : K.band[0]) * K.ringHz * rr(0.9, 1.1), K.ring * rr(0.5, 1), rr(0.015, 0.035), 0.0008);
        }
      }
      sortEv();
      const end = evEnd();
      band(v, t, end, K.noise, 'bandpass', K.band[0] * rr(0.9, 1.1), K.q, 0);
      band(v, t, end, K.noise, 'bandpass', K.band[1] * rr(0.9, 1.1), K.q, 1);
    },
  },

  leafSkitter: {
    ...pick(S.leafSkitter),
    play(v, t, o) {
      const C = S.leafSkitter, k = clamp(num(o.k, 1), 0.3, 1.5);
      evN = 0;
      for (let i = ri(C.ticks); i > 0; i--) ev(C.len * Math.pow(r(), 1.3), C.amp * k * rr(0.4, 1), 0, 0.0005, rr(0.002, 0.004));
      sortEv();
      band(v, t, Math.max(C.len, evEnd()), 'white', 'bandpass', ra(C.band), 2, 0);
      nb(v, t, 'pink', 'bandpass', rr(1400, 1900), 0.8, C.brush * k, 0.015, C.len * 0.5);
    },
  },

  lampCatch: {
    ...pick(S.lampCatch),
    play(v, t, o) {
      const C = S.lampCatch, k = clamp(num(o.k, 1), 0.3, 1.2);
      // the whump: the flame taking the air, a band that opens and settles
      const n = src(v, 'brown', t, t + 0.4), lp = v.filter('lowpass', 180, 0.9), g = v.gain(0);
      env(lp.frequency, t, [[0, rr(150, 200)], [0.09, rr(600, 800)], [0.35, 300]]);
      env(g.gain, t, [[0, 0], [rr(0.02, 0.035), C.whump * k], [0.12, C.whump * 0.55 * k], [0.36, 0]]);
      n.connect(lp).connect(g).connect(v.out);
      const s = v.osc('sine', 55, t, t + 0.25), sg = v.gain(0);
      env(s.frequency, t, [[0, rr(48, 58)], [0.1, rr(70, 85)], [0.22, 60]]);
      perc(sg.gain, t, C.sub * k, 0.02, 0.15);
      s.connect(sg).connect(v.out);
      // the short crackle as it takes
      evN = 0;
      for (let i = ri(C.crackles); i > 0; i--) ev(rr(0.04, 0.4), C.crackle * k * Math.pow(r(), 1.4), r() < 0.7 ? 0 : 1, 0.0005, rr(0.002, 0.008));
      sortEv();
      const end = evEnd();
      band(v, t, end, 'white', 'bandpass', rr(2100, 2900), 0.9, 0);
      band(v, t, end, 'white', 'bandpass', rr(1100, 1500), 1.2, 1);
    },
  },

  lampGutter: {
    ...pick(S.lampGutter),
    play(v, t, o) {
      const C = S.lampGutter, k = clamp(num(o.k, 1), 0.3, 1.2), D = ra(C.len);
      // the flame fluttering: its breath, shaken in uneven beats, dying back
      const n = src(v, 'pink', t, t + D + 0.05), lp = v.filter('lowpass', rr(520, 700), 0.8), g = v.gain(0);
      g.gain.setValueAtTime(0, t);
      for (let u = 0; u < D; u += ra(C.every)) g.gain.setTargetAtTime(C.amp * k * rr(0.2, 1) * (1 - 0.6 * (u / D)), t + u, 0.012);
      g.gain.setTargetAtTime(0, t + D, 0.03);
      n.connect(lp).connect(g).connect(v.out);
      const n2 = src(v, 'brown', t, t + D + 0.05), lp2 = v.filter('lowpass', 220, 0.7), g2 = v.gain(0);
      env(g2.gain, t, [[0, 0], [0.06, C.amp * 0.8 * k], [D, 0]]);
      n2.connect(lp2).connect(g2).connect(v.out);
    },
  },

  lampOut: {
    ...pick(S.lampOut),
    play(v, t, o) {
      const C = S.lampOut, k = clamp(num(o.k, 1), 0.3, 1.2);
      // the last puff of the flame, and a short hiss falling away
      nb(v, t, 'pink', 'lowpass', rr(420, 560), 0.8, C.puff * k * rr(0.75, 1), 0.015, rr(0.09, 0.14));
      const f = nb(v, t, 'white', 'bandpass', 4000, 1.1, C.hiss * k * rr(0.75, 1), 0.01, rr(0.22, 0.32));
      env(f.frequency, t, [[0, rr(3600, 4400)], [0.3, rr(1600, 2000)]]);
      // a click or two of the stone cooling
      const n = r() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const at = t + rr(0.3, 0.6) + i * rr(0.12, 0.3);
        nb(v, at, 'white', 'bandpass', rr(2800, 3600), 5, C.click * k * (1 - 0.4 * i), 0.0005, 0.006);
        ping(v, at, 'sine', rr(2600, 3100), C.ring * k, 0.03, 0.0008);
      }
    },
  },
});

/** A recipe's voice settings from its tuning block. */
function pick(T) {
  return { prio: T.prio ?? 0, rev: T.rev ?? 0.08, gap: T.gap ?? 0, falloff: T.falloff ?? 1, gain: T.gain ?? 1 };
}

// ---- the layers' side ---------------------------------------------------------------------------------

const LAST = new WeakMap(); // life → { name: [life.t of the last, ...] }
const REC = {};

/**
 * A layer of the living world asks for a sound (see the header). `i`: the i-th of one burst (0 the
 * first). Returns whether it played.
 */
export function lifeSay(life, name, x, z, o, i = 0) {
  if (!life || typeof life.sound !== 'function' || !LIFE_SFX[name]) return false;
  const heard = lifeHeard(life.levelId, name);
  if (!(heard > 0)) return false;
  const Y = LIFE_SFX_TUNE.say[name];
  const t = Number.isFinite(life.t) ? life.t : 0;
  let m = LAST.get(life);
  if (!m) LAST.set(life, (m = {}));
  const last = m[name];
  if (Y) {
    if (i > 0) {
      // (the rest of a burst pass only alongside its first, and only up to `most`)
      if (last !== t || i >= Y.most) return false;
    } else if (last !== undefined && t - last >= 0 && t - last < Y.gap) return false;
  }
  for (const k in REC) delete REC[k];
  if (o) Object.assign(REC, o);
  const L = lifeSfxLevel(life.levelId);
  if (name === 'flockBurst' && REC.kind === undefined) REC.kind = L.birds;
  else if (name === 'treeShudder' && REC.kind === undefined) REC.kind = L.tree;
  else if (name === 'pebbles' && REC.mat === undefined) REC.mat = L.ground;
  const calm = Number.isFinite(life.calm) ? clamp(life.calm, 0, 1) : 1;
  const fight = 1 - LIFE_SFX_TUNE.fight * clamp((1 - calm) / 0.6, 0, 1);
  REC.gain = Math.max(0, num(REC.gain, 1)) * heard * fight;
  const ok = life.sound(name, x, z, REC) === true;
  if (ok && i === 0) m[name] = t;
  return ok;
}

/** Every sound's name (the tests and the audition page). */
export const LIFE_SOUNDS = Object.freeze(Object.keys(LIFE_SFX));
