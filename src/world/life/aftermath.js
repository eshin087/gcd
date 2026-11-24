import { LetterBatch } from './letterBatch.js';
import { aftermathTuning } from './aftermathTuning.js';
import { lifeSay } from '../../audio/lifeSfx.js';

// THE AFTERMATH (piece 'answer'): what a fight leaves in the air, after the flames and the blows:
//   smoke    where fire landed (ignite) and has burned out, a thin slow column of tiny faint letters
//            rises for 20 - 40 s, leaning and drifting with the wind (life.wind.at), thinning as it goes
//            (fewer letters, fainter). A few columns at once (aftermathTuning.smoke.max x quality: the
//            newest win); fire landing again near one feeds it. The flames' own smoke (the fire field:
//            fire.js, scorch.js, wreckage.js) comes first: this starts once the ground there no longer
//            burns, and only where the fire left a mark (the scorch map's char).
//   embers   a few sparks lift off the hot early part of a burn, carried on the wind, dying as they go
//   dust     after a big blow (impact power >= dust.min) a low haze of pale letters hangs over the
//            crater for 6 - 10 s and drifts off downwind, spreading and thinning
// All of it thins by time, not by life.calm (the fight is when it is made); it lingers after a victory
// (the quiet after) and is gone at the fight's reset (clear('reset')). Never on the hero (heroClear).
//
//   aftermath.impact(x, z, r, power, o)   a blow landed (life.impact): dust may hang there
//   aftermath.ignite(x, z, r, k)          fire landed (life.ignite): smoke may rise there after
//   aftermath.smoking / .hazes            columns smoking / hazes hanging now
//   aftermath.sources / .haze             the records (the tests read them)
//   aftermath.off                         true: it does nothing (a film's "today")
// With the piece off: nothing; its letters are gone. Two own LetterBatches (the smoke and dust; the
// embers, additive), made at the first fire or blow; no allocation per frame, no Math.random.
// The sound: a new haze is heard as a faint sift of grit (audio/lifeSfx.js 'dustSift'); the smoke is
// silent (its hiss was too much), the embers too (the fire has its own).

const TAU = Math.PI * 2;
/** the sound's options (reused) */
const SND = { k: 1, delay: 0.12 };
const smoothE = (x) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

export class Aftermath {
  constructor(life) {
    this.life = life;
    this.T = aftermathTuning(life.levelId);
    this.off = false;
    this.stat = { sources: 0, fed: 0, smoked: 0, dropped: 0, hazes: 0, embers: 0 };
    this._s = 0x2c9b5e17;
    this._w = { x: 0, z: 0, k: 0 };
    this._rec = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, col: 0, color: null, colorEnd: null, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
    this._visible = true;
    this._b = undefined;
    this._eb = undefined;
    // (made for quality 1: the phone preset is set after the world is built; quality limits what is used)
    const S = this.T.smoke, D = this.T.dust;
    this._perS = Math.max(16, S.per);
    this._perD = Math.max(20, D.per * 2);
    this.sources = Array.from({ length: Math.max(2, S.max) }, (_, i) => ({
      i, on: false, state: 0, x: 0, z: 0, r: 1, k: 1, last: 0, age: 0, life: 1, H: 3, wx: 0, wz: 0, acc: 0, n: 0,
    }));
    this.haze = Array.from({ length: Math.max(1, D.max) }, (_, i) => ({
      i, on: false, x: 0, z: 0, r: 1, age: 0, life: 1, n: 0, vx: 0, vz: 0, k: 1,
    }));
    this._sl = null;
    this._dl = null;
    if (life.enabled) {
      life.action?.('smoke at hero', () => {
        const h = life.hero;
        this.ignite(h.x + 2, h.z - 1, 1.6, 1);
        const s = this.sources.find((o) => o.on && Math.hypot(o.x - h.x - 2, o.z - h.z + 1) < 0.1);
        if (s) s.last = -1e9;
        return !!s;
      }, 'smoke rises from burnt ground beside the hero (as after a breath)');
      life.action?.('crater dust at hero', () => {
        const h = life.hero;
        return this.impact(h.x + 2, h.z - 1, 3, 1.6);
      }, 'a low haze of dust hangs over a crater beside the hero');
    }
  }

  get on() {
    return !this.off && !!this.life.on?.('answer');
  }

  _r() {
    this._s = (Math.imul(this._s, 1664525) + 1013904223) >>> 0;
    return this._s / 4294967296;
  }

  _range(a) {
    return a[0] + (a[1] - a[0]) * this._r();
  }

  get smoking() {
    let n = 0;
    for (const s of this.sources) if (s.on && s.state === 1) n++;
    return n;
  }

  get hazes() {
    let n = 0;
    for (const h of this.haze) if (h.on) n++;
    return n;
  }

  /** Letters drawn now (smoke, dust, embers). */
  get count() {
    return (this._b?.count ?? 0) + (this._eb?.count ?? 0);
  }

  // ---- what lands -----------------------------------------------------------------------------------

  /** How many of `n` records the phone budget lets run (life.quality now). */
  _use(n, max) {
    return Math.min(n, Math.max(2, Math.round(max * Math.max(0.3, Math.min(1, this.life.quality)))));
  }

  ignite(x, z, r = 2, k = 1) {
    if (!this.on || !Number.isFinite(x + z + r + k) || !(r > 0) || !(k > 0)) return false;
    const S = this.T.smoke, t = this.life.t, use = this._use(this.sources.length, S.max);
    let best = null, bd = Infinity;
    for (let i = 0; i < use; i++) {
      const s = this.sources[i];
      if (!s.on) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < S.merge + s.r * 0.5 && d < bd) {
        best = s;
        bd = d;
      }
    }
    if (best) {
      // fire lands on it again: it burns again first, then smokes on
      best.last = t;
      best.k = Math.max(best.k, Math.min(2, k));
      best.r = Math.min(2.5, Math.max(best.r, r * 0.6));
      if (best.state === 1) {
        best.state = 0;
        best.age = 0;
      }
      this.stat.fed++;
      return true;
    }
    // a free column, else the one longest without fire (the newest win)
    let s = null;
    for (let i = 0; i < use && !s; i++) if (!this.sources[i].on) s = this.sources[i];
    if (!s) {
      s = this.sources[0];
      for (let i = 0; i < use; i++) if (this.sources[i].last < s.last) s = this.sources[i];
    }
    s.on = true;
    s.state = 0;
    s.x = x;
    s.z = z;
    s.r = Math.min(2.5, Math.max(0.5, r * 0.6));
    s.k = Math.min(2, k);
    s.last = t;
    s.age = 0;
    s.acc = 0;
    s.wx = s.wz = 0;
    this.stat.sources++;
    return true;
  }

  impact(x, z, r = 2, power = 1) {
    const D = this.T.dust;
    if (!this.on || !Number.isFinite(x + z + r + power) || !(power >= D.min)) return false;
    const cr = Math.max(0.8, Math.min(Math.max(r, 1), 1.2 + 1.1 * power)) * D.r;
    for (const h of this.haze) {
      if (!h.on || Math.hypot(h.x - x, h.z - z) > D.merge) continue;
      // the same crater struck again: it thickens and stays
      h.age = Math.min(h.age, D.fadeIn);
      h.life = Math.max(h.life, this._range(D.life));
      h.r = Math.max(h.r, cr);
      h.k = Math.max(h.k, Math.min(2, power / D.min));
      this._hazeLetters(h);
      return true;
    }
    const use = Math.min(this.haze.length, Math.max(1, Math.round(D.max * Math.max(0.3, Math.min(1, this.life.quality)))));
    let h = null;
    for (let i = 0; i < use && !h; i++) if (!this.haze[i].on) h = this.haze[i];
    if (!h) {
      h = this.haze[0];
      for (let i = 0; i < use; i++) if (this.haze[i].life - this.haze[i].age < h.life - h.age) h = this.haze[i];
    }
    if (!this._batch()) return false;
    h.on = true;
    h.x = x;
    h.z = z;
    h.r = cr;
    h.age = 0;
    h.life = this._range(D.life);
    h.k = Math.min(2, power / D.min);
    h.vx = h.vz = 0;
    this._hazeLetters(h);
    this.stat.hazes++;
    // the grit coming down over the crater as the haze rises (a faint patter, a beat after the blow; the
    // tremor's dust off a stone in the same blow is the same sound: lifeSay keeps one)
    SND.k = Math.min(1.4, 0.4 + 0.4 * h.k);
    lifeSay(this.life, 'dustSift', x, z, SND);
    return true;
  }

  // ---- the letters -----------------------------------------------------------------------------------

  _batch() {
    if (this._b !== undefined) return this._b;
    this._b = null;
    const g = this.life.game, T = this.T;
    if (!g?.U) return null;
    const max = this.sources.length * this._perS + this.haze.length * this._perD;
    const chars = [...new Set([...T.glyph.smoke, ...T.glyph.dust])].join('');
    try {
      this._b = this.life.build(() => new LetterBatch(g, max, chars, { rand: () => this._r() }));
      // (the haze lies low over the floor: a tight soft depth)
      this._b.uniforms.uSoft.value = 0.2;
      this._b.mesh.visible = this._visible;
      g.pipeline?.registerParticles?.(this._b);
      const sg = [...T.glyph.smoke].map((c) => this._b.col(c)), dg = [...T.glyph.dust].map((c) => this._b.col(c));
      this._sl = Array.from({ length: this.sources.length * this._perS }, () => ({ u0: 0, ox: 0, oz: 0, g: sg[(this._r() * sg.length) | 0], a: 1, ph: 0, sp: 1, keep: 0 }));
      for (const l of this._sl) {
        l.u0 = this._r();
        // (a soft heap: densest on its line)
        const a = this._r() * TAU, d = (this._r() + this._r() + this._r()) / 3;
        l.ox = Math.cos(a) * d;
        l.oz = Math.sin(a) * d;
        l.a = 0.5 + 0.5 * this._r();
        l.ph = this._r() * TAU;
        l.sp = 0.75 + 0.5 * this._r();
        l.keep = this._r();
      }
      this._dg = dg;
      this._dl = Array.from({ length: this.haze.length * this._perD }, () => ({ ox: 0, oy: 0, oz: 0, g: 0, a: 1, ph: 0, t0: 0, per: 3 }));
    } catch {
      this._b = null;
    }
    return this._b;
  }

  _emberBatch() {
    if (this._eb !== undefined) return this._eb;
    this._eb = null;
    const g = this.life.game, E = this.T.embers;
    if (!g?.U) return null;
    const q = Math.max(0.3, Math.min(1, this.life.quality));
    const max = Math.max(8, Math.round(E.max * q));
    try {
      this._eb = this.life.build(() => new LetterBatch(g, max, this.T.glyph.ember, { additive: true, spawned: max, rand: () => this._r() }));
      this._eb.mesh.visible = this._visible;
      g.pipeline?.registerParticles?.(this._eb);
      this._eg = [...this.T.glyph.ember].map((c) => this._eb.col(c));
    } catch {
      this._eb = null;
    }
    return this._eb;
  }

  /** A haze's letters (re)placed: a low soft heap, densest in its middle and near the ground. */
  _hazeLetters(h) {
    if (!this._dl) return;
    const D = this.T.dust, n = Math.min(this._perD, Math.round(D.per * h.k * Math.max(0.3, Math.min(1, this.life.quality))));
    h.n = Math.max(8, n);
    const L0 = h.i * this._perD, t = this.life.t;
    for (let j = 0; j < h.n; j++) {
      const l = this._dl[L0 + j];
      this._hazeLetter(D, l);
      l.t0 = t - this._r() * l.per;
    }
  }

  _hazeLetter(D, l) {
    const g = () => (this._r() + this._r() + this._r() - 1.5) / 1.5;
    l.ox = g();
    l.oz = g() * 0.8;
    const rr = Math.min(1, Math.hypot(l.ox, l.oz));
    // (low: most of it a hand's height to a knee's, a few higher in its heart)
    l.oy = D.y[0] + (D.y[1] - D.y[0]) * Math.pow(this._r(), 2.2) * (1 - 0.6 * rr);
    l.g = this._dg[(this._r() * this._dg.length) | 0];
    l.a = (0.5 + 0.5 * this._r()) * (1 - 0.5 * rr);
    l.ph = this._r() * TAU;
    l.per = this._range(D.cycle);
  }

  /** The air at a point (the wind's, zero when it is off or still). */
  _air(x, z) {
    const L = this.life, w = this._w;
    w.x = w.z = 0;
    if (L.on?.('wind') && L.wind?.at) L.wind.at(x, z, w);
    if (!Number.isFinite(w.x + w.z)) w.x = w.z = 0;
    return w;
  }

  // ---- the frame -------------------------------------------------------------------------------------

  update(dt) {
    if (!this.on) {
      if (this._b || this._eb) this._empty();
      return;
    }
    if (!Number.isFinite(dt) || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const L = this.life, t = L.t, S = this.T.smoke, W = L.world;
    // the columns: waiting for their flames to go out, then smoking out their life
    let any = false;
    for (const s of this.sources) {
      if (!s.on) continue;
      any = true;
      if (s.state === 0) {
        if (t - s.last < S.wait) continue;
        if ((W?.fire?.burning?.(s.x, s.z) ?? 0) > 0) continue;
        const burn = W?.scorch?.burnAt?.(s.x, s.z);
        if (Number.isFinite(burn) && burn < S.minBurn) {
          // fire that left no mark: nothing smoulders there
          s.on = false;
          this.stat.dropped++;
          continue;
        }
        if (!this._batch()) continue;
        s.state = 1;
        s.age = 0;
        s.life = this._range(S.life) * Math.min(1.3, 0.7 + 0.3 * s.k);
        s.H = this._range(S.height) * Math.min(1.25, 0.8 + 0.2 * s.k);
        const w = this._air(s.x, s.z);
        s.wx = w.x * S.carry;
        s.wz = w.z * S.carry;
        this.stat.smoked++;
      } else {
        s.age += dt;
        if (s.age >= s.life) {
          s.on = false;
          continue;
        }
        // its lean follows the air, slowly (smoke is slow to turn)
        const w = this._air(s.x, s.z), e = 1 - Math.exp(-dt / 1.5);
        s.wx += (w.x * S.carry - s.wx) * e;
        s.wz += (w.z * S.carry - s.wz) * e;
      }
    }
    for (const h of this.haze) if (h.on) any = true;
    if (!any && !this._b && !this._eb) return;
    this._embers(dt);
    const b = this._b;
    if (b) {
      b.begin();
      let n = 0;
      n = this._drawSmoke(b, n);
      n = this._drawHaze(b, dt, n);
      b.n = n;
      b.end();
    }
    if (this._eb) {
      this._eb.begin();
      this._eb.flow(dt, t);
      this._eb.end();
    }
  }

  _clear(x, z) {
    const H = this.life.hero, C = this.T.heroClear, d = Math.hypot(x - H.x, z - H.z);
    return d >= C[1] ? 1 : smoothE((d - C[0]) / (C[1] - C[0]));
  }

  _put(b, n, x, y, z, g, c, a) {
    if (n >= b.max || !(a > 0.004)) return n;
    const P = b.iPos.array, D = b.iData.array, C = b.iColor.array;
    P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z;
    D[n * 4] = 0.3; D[n * 4 + 1] = g; D[n * 4 + 2] = 0; D[n * 4 + 3] = 0;
    C[n * 4] = c[0]; C[n * 4 + 1] = c[1]; C[n * 4 + 2] = c[2]; C[n * 4 + 3] = a;
    return n + 1;
  }

  /** The smoke columns: letters rising through each, leaning with its air, curling, thinning. */
  _drawSmoke(b, n) {
    const S = this.T.smoke, t = this.life.t, Ls = this._sl;
    if (!Ls) return n;
    for (const s of this.sources) {
      if (!s.on || s.state !== 1) continue;
      const life = s.age / s.life;
      const env = smoothE(s.age / S.fadeIn) * Math.pow(1 - life, 0.9);
      if (!(env > 0.01)) continue;
      // it thins by count as well as by alpha: fewer letters as it goes
      const keep = 0.3 + 0.7 * (1 - life);
      const H = s.H, rise = (S.rise[0] + S.rise[1]) * 0.5;
      const wr = s.r / 1.5, L0 = s.i * this._perS, nS = Math.max(16, Math.round(this._perS * Math.max(0.3, Math.min(1, this.life.quality))));
      for (let j = 0; j < nS; j++) {
        const l = Ls[L0 + j];
        if (l.keep > keep) continue;
        let u = l.u0 + (s.age * rise * l.sp) / H;
        u -= Math.floor(u);
        // (denser low: it slows and spreads as it rises)
        const hu = Math.pow(u, 1.3), y = 0.15 + hu * H;
        // the lean: the air x the time it took to rise this high, at most `lean` m
        const tt = (hu * H) / rise;
        let lx = s.wx * tt, lz = s.wz * tt;
        const ll = Math.hypot(lx, lz);
        if (ll > S.lean) {
          lx *= S.lean / ll;
          lz *= S.lean / ll;
        }
        const rr = (S.spread + S.grow * u) * Math.min(1.6, Math.max(0.6, wr));
        const cu = S.curl * u;
        const x = s.x + lx + l.ox * rr + Math.sin(t * 0.6 + l.ph + u * 5) * cu;
        const z = s.z + lz + l.oz * rr + Math.cos(t * 0.47 + l.ph * 1.3 + u * 4) * cu * 0.7;
        // (it comes up out of the char softly and is gone by the top)
        const a = S.alpha * env * l.a * smoothE(u / 0.12) * Math.pow(1 - u, 0.8) * this._clear(x, z);
        n = this._put(b, n, x, y, z, l.g, S.color, a);
      }
    }
    return n;
  }

  /** The hazes: a low heap of pale letters over the crater, drifting downwind, spreading and thinning. */
  _drawHaze(b, dt, n) {
    const D = this.T.dust, t = this.life.t, Ld = this._dl;
    if (!Ld) return n;
    for (const h of this.haze) {
      if (!h.on) continue;
      h.age += dt;
      if (h.age >= h.life) {
        h.on = false;
        continue;
      }
      const w = this._air(h.x, h.z), e = 1 - Math.exp(-dt / 2);
      h.vx += (w.x * D.carry - h.vx) * e;
      h.vz += (w.z * D.carry - h.vz) * e;
      h.x += h.vx * dt;
      h.z += h.vz * dt;
      const life = h.age / h.life;
      const env = smoothE(h.age / D.fadeIn) * smoothE((h.life - h.age) / (h.life * 0.55));
      if (!(env > 0.01)) continue;
      const grow = h.r * (1 + D.grow * life);
      const sp = Math.hypot(h.vx, h.vz), nx = sp > 0.03 ? h.vx / sp : 1, nz = sp > 0.03 ? h.vz / sp : 0;
      // (it stretches along the air as it drifts)
      const along = 1 + Math.min(0.6, sp * 1.5) * life;
      const L0 = h.i * this._perD;
      for (let j = 0; j < h.n; j++) {
        const l = Ld[L0 + j];
        let u = (t - l.t0) / l.per;
        if (u >= 1) {
          this._hazeLetter(D, l);
          l.t0 = t;
          u = 0;
        }
        const ax = l.ox * grow * along, az = l.oz * grow;
        const x = h.x + nx * ax - nz * az + Math.sin(t * 0.37 + l.ph) * 0.08;
        const z = h.z + nz * ax + nx * az + Math.cos(t * 0.29 + l.ph) * 0.06;
        const a = D.alpha * env * l.a * smoothE(u / 0.25) * smoothE((1 - u) / 0.3) * this._clear(x, z);
        n = this._put(b, n, x, l.oy + u * 0.15, z, l.g, D.color, a);
      }
    }
    return n;
  }

  /** A few embers off the hot early part of each burn, on the wind. */
  _embers(dt) {
    const E = this.T.embers, q = Math.max(0.3, Math.min(1, this.life.quality));
    let need = false;
    for (const s of this.sources) if (s.on && s.state === 1 && s.age < s.life * E.hot) need = true;
    if (!need) return;
    const pool = this._emberBatch();
    if (!pool) return;
    const r = this._rec;
    for (const s of this.sources) {
      if (!s.on || s.state !== 1) continue;
      const hot = 1 - s.age / (s.life * E.hot);
      if (!(hot > 0)) continue;
      s.acc += dt * E.rate * q * hot * Math.min(1.5, s.k);
      while (s.acc >= 1) {
        s.acc -= 1;
        const a = this._r() * TAU, d = s.r * 0.7 * Math.sqrt(this._r());
        r.x = s.x + Math.cos(a) * d;
        r.z = s.z + Math.sin(a) * d;
        r.y = 0.15 + this._r() * 0.2;
        const wk = E.carry / Math.max(0.05, this.T.smoke.carry);
        r.vx = s.wx * wk + (this._r() - 0.5) * 0.3;
        r.vz = s.wz * wk + (this._r() - 0.5) * 0.3;
        r.vy = this._range(E.rise);
        r.gravity = -0.04;
        r.drag = 0.1;
        r.life = this._range(E.life);
        r.col = this._eg[(this._r() * this._eg.length) | 0];
        r.color = E.color;
        r.colorEnd = E.colorEnd;
        r.alpha = 1;
        r.alphaEnd = 0;
        r.flicker = E.flicker;
        if (pool.spawn(r)) this.stat.embers++;
      }
    }
  }

  _empty() {
    this._b?.empty();
    this._eb?.empty();
  }

  clear() {
    for (const s of this.sources) s.on = false;
    for (const h of this.haze) h.on = false;
    this._empty();
  }

  setVisible(on) {
    this._visible = !!on;
    if (this._b?.mesh) this._b.mesh.visible = this._visible;
    if (this._eb?.mesh) this._eb.mesh.visible = this._visible;
    if (!on) this.clear();
  }

  takes() {
    return false;
  }
}
