import { K_FIRE, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// The upgraded looks of two of Shen Hui's phase-2 specials (ADR-250), three options each for the owner to
// pick from, '0' = as they ship (the kindled blade's sweep and the shock of the red ring, nothing more):
//
//   `?whirlFx=`  Ember Whirl (two spinning cuts and the low burning sweep)
//     a  THE WHEEL    the point of the blade leaves a ring of fire at its own height that burns a moment
//                     after it has passed: two spins draw two wheels round him; the sweep a low one
//     b  THE CYCLONE  a whirl of fire rising round him as he turns, embers flung off the point along
//                     the turn; on the sweep it drops into a burst of embers along the floor
//     c  THE DISC     the whole width the blade sweeps burns for an instant: a spinning disc of fire
//                     at his waist (at his ankles for the sweep), thin and short-lived
//   `?fallFx=`   Heaven-Splitting Fall (the great leap, the red ring, two-handed down on it)
//     a  THE COMET    from the top of the leap a tail of fire follows him down; where he lands a column
//                     of fire stands up and falls back as embers
//     b  THE SPLIT    the cut as he comes down draws a tall seam of fire down to the stones, and where
//                     it lands the floor splits in fire ahead of him and behind, out past the burning ring
//     c  FIRE RAIN    once the ring locks, fire rains onto it from above until he lands, and his
//                     landing throws embers out across the stones
//
// All of it is heat in the fire field (STYLE.md "The fire field": the same small letters) and glyph
// particles of one letter cell (embers), at the blade or his body or the spot the blow lands: never the
// sky, never the background's colour. It adds no hit and no cue: the gameplay (the ring, the cues, the
// burning ground) is the move's own. Jitter draws from the looks' own stream (fx.lr), never Math.random.
// Cost: at most ~120 blobs alive per option at its peak (the field holds 6000).

const EMBER = [3.2, 1.1, 0.25];
const EMBER_END = [0.5, 0.06, 0.01];
const TAU = Math.PI * 2;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export const whirlLook = () => lookOf('whirlFx', '0');
export const fallLook = () => lookOf('fallFx', '0');

export class AshSpecialFx {
  constructor(d) {
    this.d = d;
    this._p = { x: 0, y: 0, z: 0 };
    this.reset();
  }

  reset() {
    this._rain = 0;
    this._acc = 0;
    this._landed = null;
  }

  get fx() {
    return this.d.fx;
  }

  /** Every frame after the pose (disciple.afterPose): `a` the move he is in, or null. */
  frame(dt, a) {
    const d = this.d, F = this.fx;
    if (!F?.fire || !a || !(dt > 0) || !d._tipOk) return;
    const name = a.name;
    if (name === 'emberWhirl') {
      const L = whirlLook();
      if (L !== '0') this._whirl(L, dt, a);
    } else if (name === 'heavenFall') {
      const L = fallLook();
      if (L !== '0') this._fall(L, dt, a);
    }
  }

  /** A blow of his lands (disciple.onImpact). */
  impact(b, a) {
    if (!a || !b) return;
    if (a.name === 'emberWhirl' && b.def?.part === 'feet') {
      const L = whirlLook();
      if (L === 'b') this._groundEmbers(this.d.position.x, this.d.position.z, 3.2, 40);
    }
    if (a.name === 'heavenFall') {
      const L = fallLook();
      const x = this.d.position.x, z = this.d.position.z;
      if (L === 'a') this._column(x, z);
      else if (L === 'b') this._split(x, z, this.d.yaw);
      else if (L === 'c') this._groundEmbers(x, z, 3.0, 46);
    }
  }

  // ---------------------------------------------------------------- Ember Whirl
  _whirl(L, dt, a) {
    const d = this.d, F = this.fx;
    // only through the spins: from the snap out of each windup's cock to the end of its active frames
    const b = a.beats.find((x) => a.t >= x.impact - 0.06 && a.t <= x.end + 0.04);
    if (!b) return;
    const low = b.def?.part === 'feet';
    const t0 = d._tipPrev, t1 = d._tip, h0 = d._hiltPrev, h1 = d._hilt;
    const step = Math.hypot(t1.x - t0.x, t1.z - t0.z);
    if (!(step > 0.02) || step > 3) return;
    const n = Math.min(10, Math.max(1, Math.ceil(step / 0.12)));
    if (L === 'a') {
      // the wheel: heat along the point's own path, lingering, rising a little
      for (let i = 1; i <= n; i++) {
        const u = i / n, x = t0.x + (t1.x - t0.x) * u, y = t0.y + (t1.y - t0.y) * u, z = t0.z + (t1.z - t0.z) * u;
        F._blob(x, Math.max(low ? GROUND_Y : 0.2, y), z, F.lrand(-0.1, 0.1), F.lrand(0.2, 0.6), F.lrand(-0.1, 0.1), F.lrand(0.45, 0.62), 0.38, 0.22, low ? 0.5 * GROUND_GAIN * 0.6 : 0.55, 0, K_FIRE, 1.2, 1.2);
      }
    } else if (L === 'b') {
      // the cyclone: a whirl of fire rising round him, and embers off the point along the turn
      this._acc += dt * (low ? 130 : 110);
      let g = 0;
      while (this._acc >= 1 && g++ < 8) {
        this._acc -= 1;
        const h = F.lrand(0.1, low ? 1.0 : 2.0), ang = a.t * 11 + F.lr() * TAU, r = 0.75 + 0.35 * h, ca = Math.cos(ang), sa = Math.sin(ang), sp = 4.2;
        F._blob(d.position.x + ca * r, 0.35 + h, d.position.z + sa * r, -sa * sp, F.lrand(1.2, 2.6), ca * sp, F.lrand(0.26, 0.4), 0.44, 0.2, 0.58, 0, K_FIRE, 1.6, 1.2);
      }
      const vx = (t1.x - t0.x) / dt, vz = (t1.z - t0.z) / dt;
      if (F.lr() < 0.7) this._ember(t1.x, t1.y, t1.z, vx * 0.35, F.lrand(0.5, 2), vz * 0.35);
    } else {
      // the disc: the area the blade swept this frame, filled thin with fire for an instant
      for (let i = 0; i < n * 3; i++) {
        const u = F.lr(), f = 0.25 + 0.75 * F.lr();
        const hx = h0.x + (h1.x - h0.x) * u, hy = h0.y + (h1.y - h0.y) * u, hz = h0.z + (h1.z - h0.z) * u;
        const tx = t0.x + (t1.x - t0.x) * u, ty = t0.y + (t1.y - t0.y) * u, tz = t0.z + (t1.z - t0.z) * u;
        const x = hx + (tx - hx) * f, y = hy + (ty - hy) * f, z = hz + (tz - hz) * f;
        F._blob(x, Math.max(low ? GROUND_Y : 0.2, y), z, 0, F.lrand(0.05, 0.3), 0, F.lrand(0.16, 0.24), 0.38, 0.3, (low ? 0.5 * GROUND_GAIN * 0.6 : 0.5) * (0.6 + 0.4 * f), 0, K_FIRE, 1, 0.5);
      }
    }
  }

  // ---------------------------------------------------------------- Heaven-Splitting Fall
  _fall(L, dt, a) {
    const d = this.d, F = this.fx, b = a.beats[0], J = d.brain?.leap;
    if (!b || a.t > b.impact) return;
    const u = (a.t - b.start) / Math.max(1e-4, b.impact - b.start), Lp = b.def?.leap;
    if (!Lp) return;
    const apexU = Lp.from + (1 - Lp.from) * 0.5;
    if (L === 'a' && u > apexU && d.position.y > 0.3) {
      // the comet's tail: fire where his body was, behind him on the way down
      const n = 5;
      for (let i = 0; i < n; i++) {
        F._blob(d.position.x + F.lrand(-0.25, 0.25), d.position.y + F.lrand(0.5, 1.5), d.position.z + F.lrand(-0.25, 0.25), F.lrand(-0.3, 0.3), F.lrand(1.5, 3), F.lrand(-0.3, 0.3), F.lrand(0.3, 0.45), 0.5, 0.2, 0.6, 0, K_FIRE, 1.5, 0);
      }
      if (F.lr() < 0.6) this._ember(d.position.x, d.position.y + 1, d.position.z, F.lrand(-1, 1), F.lrand(1, 3), F.lrand(-1, 1));
    } else if (L === 'b' && u > 0.8) {
      // the split: a tall line of fire down the cut's way, from high over the spot to the stones, growing
      // brighter as he comes down on it (two lines a hand apart: a seam, not a hair)
      const tx = J?.target?.x ?? d.position.x, tz = J?.target?.z ?? d.position.z, k = (u - 0.8) / 0.2;
      const top = 0.4 + 6 * (1 - 0.5 * k), ox = 0.08 * Math.cos(d.yaw), oz = -0.08 * Math.sin(d.yaw);
      F._line(tx - ox, 0.4, tz - oz, tx - ox, top, tz - oz, 0.05, 0.42, 0.9 + 0.5 * k, 0, K_FIRE, 0.16);
      F._line(tx + ox, 0.4, tz + oz, tx + ox, top, tz + oz, 0.05, 0.3, 0.6 + 0.4 * k, 0, K_FIRE, 0.16);
      F._ink(tx, 0.3, tz, tx, top, tz, 0.04, 0.9 * (0.5 + 0.5 * k));
    } else if (L === 'c' && u > Lp.lock) {
      // fire raining onto the locked ring: streaks of heat falling from over it (and an ember in some)
      const tx = J?.target?.x ?? d.position.x, tz = J?.target?.z ?? d.position.z, R = fin(b.def?.ring, 2.6);
      this._rain += dt * 90;
      let g = 0;
      while (this._rain >= 1 && g++ < 8) {
        this._rain -= 1;
        const ang = F.lr() * TAU, r = R * Math.sqrt(F.lr()), x = tx + Math.cos(ang) * r, z = tz + Math.sin(ang) * r;
        F._blob(x, F.lrand(2.6, 4.2), z, 0, F.lrand(-9, -6), 0, F.lrand(0.32, 0.45), 0.3, 0.22, 0.6, 0.2, K_FIRE, 0, -3);
        if (F.lr() < 0.3) this._ember(x, F.lrand(2.6, 4.2), z, F.lrand(-0.3, 0.3), F.lrand(-8, -5), F.lrand(-0.3, 0.3), 0.5);
      }
    }
  }

  /** The comet's landing: a column of fire up off the spot, falling back as embers. */
  _column(x, z) {
    const F = this.fx;
    for (let i = 0; i < 44; i++) {
      const ang = F.lr() * TAU, r = F.lrand(0, 0.55);
      F._blob(x + Math.cos(ang) * r, F.lrand(0.3, 1.2), z + Math.sin(ang) * r, Math.cos(ang) * 0.6, F.lrand(4, 8.5), Math.sin(ang) * 0.6, F.lrand(0.35, 0.6), 0.55, 0.3, 0.62, 0, K_FIRE, 1.6, 2.5);
    }
    F._embers(x, 1.4, z, 30, 1.5, 5);
    F._lookLight({ x, y: 2, z, color: [1, 0.5, 0.2], intensity: 5, radius: 6, life: 0.5, fade: 0.45 });
  }

  /** The split's landing: the floor torn in fire ahead of him and behind along his facing, out past the
   *  ring of burning ground (6 m ahead, 3 behind), the crack running out from him over 0.2 s. */
  _split(x, z, yaw) {
    const F = this.fx, dx = Math.sin(yaw), dz = Math.cos(yaw);
    for (const [len, sgn, n] of [[6, 1, 54], [3, -1, 24]]) {
      for (let i = 0; i < n; i++) {
        const s = 0.3 + (i / n) * len, j = F.lrand(-0.14, 0.14) * (1 + s * 0.12), fade = 1 - 0.35 * (s / len);
        const px = x + sgn * dx * s + dz * j, pz = z + sgn * dz * s - dx * j;
        F._blob(px, GROUND_Y, pz, 0, F.lrand(0.3, 1.0), 0, F.lrand(0.7, 1.0) * fade, 0.36, 0.22, 0.62 * GROUND_GAIN * 0.75, 0, K_FIRE, 1, 0.2);
        if (i % 2 === 0) F._blob(px, 0.45, pz, 0, F.lrand(2, 3.5), 0, F.lrand(0.3, 0.45), 0.38, 0.14, 0.5, 0, K_FIRE, 1.5, 1);
      }
      F._ink(x + sgn * dx * 0.3, GROUND_Y, z + sgn * dz * 0.3, x + sgn * dx * len, GROUND_Y, z + sgn * dz * len, 0.4, 1.2);
    }
    F._lookLight({ x: x + dx * 1.5, y: 0.6, z: z + dz * 1.5, color: [1, 0.45, 0.15], intensity: 4, radius: 5, life: 0.5, fade: 0.45 });
  }

  /** Embers thrown out along the floor, `R` m round (x, z). */
  _groundEmbers(x, z, R, n) {
    const F = this.fx;
    for (let i = 0; i < n; i++) {
      const ang = F.lr() * TAU, sp = F.lrand(R * 1.2, R * 2.4);
      this._ember(x + Math.cos(ang) * 0.4, F.lrand(0.15, 0.5), z + Math.sin(ang) * 0.4, Math.cos(ang) * sp, F.lrand(0.6, 2.2), Math.sin(ang) * sp);
    }
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * TAU + F.lrand(-0.1, 0.1), r = F.lrand(0.6, 1.4);
      F._blob(x + Math.cos(ang) * r, GROUND_Y, z + Math.sin(ang) * r, Math.cos(ang) * 4, 0.2, Math.sin(ang) * 4, F.lrand(0.3, 0.45), 0.42, 0.3, 0.42 * GROUND_GAIN * 0.6, 0, K_FIRE, 2.5, 0);
    }
  }

  /** One ember: a glyph particle of one letter cell (the shared add pool). */
  _ember(x, y, z, vx, vy, vz, life = 0) {
    const F = this.fx, o = F._rec(x, y, z, life || F.lrand(0.4, 0.9), F.lrand(0.13, 0.2), 0.04, "*'.", EMBER, EMBER_END);
    o.vx = vx;
    o.vy = vy;
    o.vz = vz;
    o.drag = 1.2;
    o.gravity = -5;
    o.flicker = 0.5;
    F._spawn(F.add, o);
  }
}

