import { LetterBatch } from './letterBatch.js';
import { tremorTuning } from './tremorTuning.js';
import { hangKick, hangKickSettle } from '../hang.js';

// THE TREMOR (piece 'answer'): a heavy blow shakes what stands near it. A blow of `power` at (x, z) sends
// a shake outward that falls off with distance (tremorTuning.js: reach, fall); what stands inside it
// answers by what it is, sized by the shake's strength there, and settles in under a second:
//   a tree (what has leaves)  shudders (destructibles.shudder: no damage) and its own leaves come down
//                             from its crown (litter.showerAt: they then fall on the wind and lie)
//   a bamboo cane             shivers, a leaf or two drops
//   stone that stands tall    a thin sift of dust letters falls straight down off its top, a faint puff
//                             of them at its foot
//   what hangs                swings away from the blow and rings down (hang.js hangKick: the hang
//                             shader's kick, on top of the wind's lean)
//   the floor                 pebbles hop: a few tiny grit letters jump a hand's height and settle
//   the grass                 flattens outward (world.gust) where the blow made no gust of its own
//   the bonfire               gutters for a moment (atmosphere.gutter)
// A light blow (under `min`) shakes nothing; one blow that arrives twice (world.impact and
// world.groundBlow, a beam's every 0.2 s) shakes once (`merge`, `gap`).
//
//   tremor.impact(x, z, r, power, o)   life.impact calls it for every blow on the world: (x, z) where,
//                                      r its reach in m, power on the POWER scale (0.3 light, 1 heavy,
//                                      2 the biggest), o the blow's record or undefined
//   tremor.shake(x, z, r, power)       the same, forced past the merge and the gap (the Lab, a test);
//                                      returns the reach (m) or 0
//   tremor.stat                        what the shakes did this page load (the tests and the Lab read it)
//   tremor.off                         true: it does nothing (a film's "today")
// With the piece off: nothing; its letters are gone. Its own letters (dust, grit) print in the house
// letter in an own LetterBatch, made at the first shake; no allocation per frame, no Math.random.

const TAU = Math.PI * 2;
const MEM = 8;
const WOOD_LEAFY = new Set(['tree', 'deadTree', 'cinderBough']);

export class Tremor {
  constructor(life) {
    this.life = life;
    this.T = tremorTuning(life.levelId);
    this.off = false;
    this.stat = { shakes: 0, merged: 0, trees: 0, canes: 0, leaves: 0, stones: 0, dust: 0, pebbles: 0, kicks: 0, gusts: 0, gutters: 0, reach: 0 };
    // the last shakes (x, z, t, power): a blow that arrives twice shakes once
    this._mem = new Float64Array(MEM * 4).fill(-1e9);
    this._memN = 0;
    this._lastT = -1e9;
    this._lastP = 0;
    this._near = [];
    this._b = undefined;
    this._visible = true;
    this._s = 0x7e3a11c5;
    this._rec = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, col: 0, color: null, colorEnd: null, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
    this._crown = { x: 0, y0: 0, y1: 0, z: 0, r: 1 };
    // the pebbles: records written each frame (they hop, land, lie a moment, fade)
    this._peb = [];
    this._pebN = 0;
    if (life.enabled) {
      life.action?.('tremor at hero', () => {
        const h = life.hero;
        return this.shake(h.x + 2.5, h.z - 1.5, 2.5, 1.4);
      }, 'a heavy blow lands beside the hero: what stands near shakes');
    }
  }

  get on() {
    return !this.off && !!this.life.on?.('answer');
  }

  /** This layer's own stream (an LCG): the letters' look never moves life.rand. */
  _r() {
    this._s = (Math.imul(this._s, 1664525) + 1013904223) >>> 0;
    return this._s / 4294967296;
  }

  _range(a) {
    return a[0] + (a[1] - a[0]) * this._r();
  }

  impact(x, z, r, power) {
    if (!this.on) return 0;
    return this._shake(x, z, r, power, false);
  }

  shake(x, z, r = 2, power = 1.2) {
    if (!this.on) return 0;
    return this._shake(x, z, r, power, true);
  }

  _shake(x, z, r, power, force) {
    if (!Number.isFinite(x + z + r + power) || !(power > 0)) return 0;
    const L = this.life, T = this.T, t = L.t, p = power * (Number.isFinite(L.k) ? L.k : 1);
    if (!(p >= T.min)) return 0;
    if (!force) {
      // one blow that arrives twice, or a beam's steady burn: the same shake
      const M = this._mem, G = T.merge;
      for (let i = 0; i < MEM; i++) {
        const k = i * 4;
        if (t - M[k + 2] > G.t) continue;
        if (Math.hypot(x - M[k], z - M[k + 1]) < G.r && M[k + 3] >= p * G.k) {
          this.stat.merged++;
          return 0;
        }
      }
      if (t - this._lastT < T.gap && p <= this._lastP) {
        this.stat.merged++;
        return 0;
      }
    }
    const k = (this._memN++ % MEM) * 4;
    this._mem[k] = x;
    this._mem[k + 1] = z;
    this._mem[k + 2] = t;
    this._mem[k + 3] = p;
    this._lastT = t;
    this._lastP = p;
    const R = T.reach;
    const reach = Math.min(R.max, Math.max(0, r) * R.r + R.k * Math.pow(p, R.pow));
    this.stat.shakes++;
    this.stat.reach = reach;
    this._pieces(x, z, reach, p);
    this._hang(x, z, reach, p);
    this._floor(x, z, r, reach, p);
    this._grass(x, z, reach, p);
    this._fire(x, z, reach, p);
    return reach;
  }

  /** The shake's strength at d m from the blow (0 beyond its reach). */
  _at(p, d, reach) {
    if (!(d < reach)) return 0;
    return p * Math.pow(1 - Math.max(0, d) / reach, this.T.reach.fall);
  }

  /** What stands within the reach answers by what it is. */
  _pieces(x, z, reach, p) {
    const D = this.life.world?.destructibles;
    if (!D?.around) return;
    const L = this.life, T = this.T, q = Math.max(0.3, Math.min(1, L.quality)), near = this._near;
    const n = D.around(x, z, reach, near, 80);
    let leafLeft = Math.round(T.tree.total * q), caneLeft = Math.round(T.bamboo.total * q), dustLeft = Math.round(T.stone.total * q);
    for (let i = 0; i < n; i++) {
      const b = near[i];
      const ox = b.x - x, oz = b.z - z, dd = Math.hypot(ox, oz);
      const s = this._at(p, dd - b.r, reach);
      if (!(s > 0)) continue;
      const dx = dd > 1e-3 ? ox / dd : 0, dz = dd > 1e-3 ? oz / dd : 1;
      if (b.kind === 'bamboo') {
        const B = T.bamboo;
        if (s < B.min) continue;
        if (D.shudder?.(b, Math.min(B.cap, B.amp * s), dx, dz)) this.stat.canes++;
        if (B.leaves > 0 && b.leafy > 0 && caneLeft > 0) caneLeft -= this._leaves(b, B, s, q, caneLeft);
      } else if (b.mat === 'wood' && (WOOD_LEAFY.has(b.kind) || b.leafy > 0)) {
        const B = T.tree;
        if (s < B.min) continue;
        if (D.shudder?.(b, Math.min(B.cap, B.amp * s), dx, dz)) this.stat.trees++;
        if (B.leaves > 0 && b.leafy > 0 && leafLeft > 0) leafLeft -= this._leaves(b, B, s, q, leafLeft);
      } else if (b.mat === 'stone' && b.kind !== 'boulder' && b.h >= T.stone.minH && b.hpMax !== Infinity) {
        if (s < T.stone.min || dustLeft <= 0) continue;
        dustLeft -= this._sift(b, s, q, dustLeft);
      } else if (b.mat === 'wood' || b.mat === 'metal') {
        // a post, a lamp, a rack: a small shudder
        const B = T.tree;
        if (s >= B.min) D.shudder?.(b, Math.min(B.cap, B.amp * s * 0.5), dx, dz);
      }
    }
    near.length = 0;
  }

  /** Where a tree's crown is (its leaf parts as they stand, else a guess from its size), into this._crown. */
  _crownOf(b, B) {
    const C = this._crown, body = b.body, cen = body?.centre, leaf = body?.leaf, shown = body?.shown;
    let n = 0, sx = 0, sy = 0, sz = 0, sr = 0, lo = Infinity, hi = -Infinity;
    if (cen && leaf && cen.length >= leaf.length * 4) {
      for (let i = 0; i < leaf.length; i++) {
        if (!leaf[i] || (shown && !shown[i])) continue;
        const cx = cen[i * 4], cy = cen[i * 4 + 1], cz = cen[i * 4 + 2], cr = cen[i * 4 + 3];
        sx += cx; sy += cy; sz += cz; sr = Math.max(sr, cr + Math.hypot(cx - b.x, cz - b.z) * 0.5);
        lo = Math.min(lo, cy - cr * 0.5);
        hi = Math.max(hi, cy + cr * 0.3);
        n++;
      }
    }
    if (n > 0) {
      C.x = sx / n; C.z = sz / n; C.r = Math.max(0.6, Math.min(4, sr * 0.8));
      C.y0 = Math.max(0.8, lo); C.y1 = Math.max(C.y0 + 0.3, hi);
    } else {
      const h = (b.y0 ?? 0) + b.h;
      C.x = b.x; C.z = b.z; C.r = Math.max(0.5, Math.min(3, b.r * 3));
      C.y0 = Math.max(0.8, h * B.crown[0]); C.y1 = Math.max(C.y0 + 0.3, h * B.crown[1]);
    }
    return C;
  }

  /** Leaves come down from its crown (litter.showerAt). Returns how many. */
  _leaves(b, B, s, q, left) {
    const litter = this.life.litter;
    if (!litter?.showerAt) return 0;
    const n = Math.min(left, B.most, Math.round(B.leaves * s * q * b.leafy * 1.6));
    if (n < 1) return 0;
    const C = this._crownOf(b, B);
    let got = 0;
    try {
      got = litter.showerAt(C.x, C.z, C.r, n, C.y0, C.y1, B.kind) || 0;
    } catch (err) {
      this.life._fail?.('litter', err);
    }
    this.stat.leaves += got;
    return n;
  }

  /** Dust sifts off a tall stone's top and puffs faintly at its foot. Returns the letters spent. */
  _sift(b, s, q, left) {
    const pool = this._batch();
    if (!pool) return 0;
    const S = this.T.stone, top = (b.y0 ?? 0) + b.h, gy = this._gy();
    const n = Math.min(left, S.most, Math.round(S.per * s * q));
    if (n < 1) return 0;
    const r = this._rec;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const a = this._r() * TAU, rr = b.r * S.spread * (0.75 + 0.45 * this._r());
      r.x = b.x + Math.cos(a) * rr;
      r.z = b.z + Math.sin(a) * rr;
      r.y = top - this._r() * Math.min(0.5, b.h * 0.15);
      r.vx = (this._r() - 0.5) * 0.08;
      r.vz = (this._r() - 0.5) * 0.08;
      r.vy = -this._range(S.fall);
      const fallT = Math.max(0.3, (r.y - gy - 0.1) / Math.max(0.3, -r.vy + 0.6));
      r.life = Math.min(this._range(S.life), fallT);
      r.gravity = S.gravity;
      r.drag = 0.6;
      r.col = this._dg[(this._r() * this._dg.length) | 0];
      r.color = S.color;
      r.colorEnd = S.color;
      r.alpha = S.alpha * (0.55 + 0.45 * this._r());
      r.alphaEnd = r.alpha * 0.4;
      r.flicker = 0;
      if (pool.spawn(r)) k++;
    }
    // the faint puff at its foot
    const np = Math.min(Math.max(0, left - k), Math.round(S.puff * s * q));
    for (let i = 0; i < np; i++) {
      const a = this._r() * TAU, v = this._range(S.puffOut);
      r.x = b.x + Math.cos(a) * (b.r + 0.05);
      r.z = b.z + Math.sin(a) * (b.r + 0.05);
      r.y = gy + 0.12 + this._r() * 0.25;
      r.vx = Math.cos(a) * v;
      r.vz = Math.sin(a) * v;
      r.vy = 0.05 + this._r() * 0.12;
      r.life = this._range(S.puffLife);
      r.gravity = 0;
      r.drag = 1.6;
      r.col = this._dg[(this._r() * this._dg.length) | 0];
      r.color = S.color;
      r.colorEnd = S.color;
      r.alpha = S.puffAlpha * (0.6 + 0.4 * this._r());
      r.alphaEnd = 0;
      if (pool.spawn(r)) k++;
    }
    this.stat.stones++;
    this.stat.dust += k;
    return k;
  }

  /** What hangs swings away from the blow (the hang shader's kick). */
  _hang(x, z, reach, p) {
    const H = this.T.hang, U = this.life.game?.U;
    if (!U?.uHangKick) return;
    if (hangKick(U, x, z, Math.min(H.cap, H.amp * p), Math.max(H.min, reach * H.reach)) >= 0) this.stat.kicks++;
  }

  /** Pebbles hop off the floor round the blow. */
  _floor(x, z, r, reach, p) {
    const F = this.T.floor;
    if (!(p >= F.min)) return;
    const L = this.life, q = Math.max(0.3, Math.min(1, L.quality));
    if (!this._batch()) return;
    const n = Math.min(F.most, Math.round(F.per * Math.min(1.6, p) * q));
    const r0 = Math.max(0.3, r * F.in), r1 = Math.max(r0 + 0.5, reach * F.out), gy = this._gy(), H = L.hero;
    const W = L.world, C = W?.colliders?.circles;
    let k = 0;
    for (let i = 0; i < n * 2 && k < n; i++) {
      const e = this._freePebble();
      if (!e) break;
      const a = this._r() * TAU, d = r0 + (r1 - r0) * Math.pow(this._r(), 0.8);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (Math.abs(px - H.x) < 0.7 && Math.abs(pz - H.z) < 0.7) continue;
      if (C && this._inside(C, px, pz)) continue;
      const f = Math.max(0.25, 1 - d / Math.max(r1, 1e-3));
      e.on = true;
      e.x = px;
      e.z = pz;
      e.gy = gy + 0.1;
      e.y = e.gy;
      e.vy = this._range(F.up) * (0.55 + 0.45 * f);
      // (a little outward: the shock passed under it)
      e.vx = Math.cos(a) * 0.35 * f;
      e.vz = Math.sin(a) * 0.35 * f;
      // (the shock reaches it a beat after the blow)
      e.wait = d / 40;
      e.bounce = 1;
      e.rest = this._range(F.rest);
      e.fade = 0.35;
      e.g = this._gg[(this._r() * this._gg.length) | 0];
      e.a = F.alpha * (0.6 + 0.4 * this._r());
      k++;
    }
    this.stat.pebbles += k;
  }

  _inside(C, x, z) {
    for (let i = 0; i < C.length; i++) {
      const c = C[i], dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < c.r * c.r) return true;
    }
    return false;
  }

  _freePebble() {
    const P = this._peb;
    for (let i = 0; i < P.length; i++) if (!P[i].on) return P[i];
    return null;
  }

  /** The grass flattens outward where the blow made no gust of its own (world.gust, one slot). */
  _grass(x, z, reach, p) {
    const G = this.T.gust, W = this.life.world;
    if (!(p >= G.min) || typeof W?.gust !== 'function') return;
    const g = W._gust;
    if (g && g.strength > 0.4 && Math.hypot(g.x - x, g.z - z) < reach * 0.5) return;
    W.gust(x, z, Math.min(G.cap, G.k * p), reach * G.rK);
    this.stat.gusts++;
  }

  /** The bonfire gutters for a moment. */
  _fire(x, z, reach, p) {
    const bf = this.life.set?.bonfire, A = this.life.world?.atmosphere;
    if (!bf || typeof A?.gutter !== 'function' || !Number.isFinite(bf.x + bf.z)) return;
    const s = this._at(p, Math.hypot(bf.x - x, bf.z - z), reach);
    if (!(s >= this.T.fire.min)) return;
    A.gutter(Math.min(1, s * 0.7), bf.x - x, bf.z - z);
    this.stat.gutters++;
  }

  _gy() {
    return 0;
  }

  /** The tremor's own letters, made at the first shake (life.build: no Math.random). */
  _batch() {
    if (this._b !== undefined) return this._b;
    this._b = null;
    const g = this.life.game, T = this.T;
    if (!g?.U) return null;
    const q = Math.max(0.3, Math.min(1, this.life.quality));
    const npeb = Math.max(8, Math.round(T.floor.most * 2 * q));
    const spawned = Math.max(32, Math.round((T.stone.total + T.stone.puff * 4) * 2.2 * q));
    const chars = [...new Set([...T.glyph.dust, ...T.glyph.grit])].join('');
    try {
      this._b = this.life.build(() => new LetterBatch(g, spawned + npeb, chars, { spawned, rand: () => this._r() }));
      // (the floor's letters lie low: a tight soft depth, or the floor behind them fades them out)
      this._b.uniforms.uSoft.value = 0.12;
      this._b.mesh.visible = this._visible;
      g.pipeline?.registerParticles?.(this._b);
      this._dg = [...T.glyph.dust].map((c) => this._b.col(c));
      this._gg = [...T.glyph.grit].map((c) => this._b.col(c));
      for (let i = 0; i < npeb; i++) this._peb.push({ on: false, x: 0, y: 0, z: 0, gy: 0, vx: 0, vy: 0, vz: 0, wait: 0, bounce: 0, rest: 0, fade: 0, g: 0, a: 0 });
    } catch {
      this._b = null;
    }
    return this._b;
  }

  update(dt) {
    if (!this.on) {
      if (this._b) this._empty();
      return;
    }
    if (!Number.isFinite(dt) || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    hangKickSettle(this.life.game?.U);
    const b = this._b;
    if (!b) return;
    b.begin();
    b.flow(dt, this.life.t);
    // the pebbles: up, down, one small bounce, a moment lying, gone
    const col = this.T.floor.color, H = this.life.hero;
    let live = 0;
    for (const e of this._peb) {
      if (!e.on) continue;
      live++;
      if (e.wait > 0) {
        e.wait -= dt;
        continue;
      }
      if (e.bounce >= 0) {
        e.vy -= 9.8 * dt;
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        e.y += e.vy * dt;
        if (e.y <= e.gy) {
          e.y = e.gy;
          if (e.bounce > 0 && e.vy < -0.6) {
            e.vy = -e.vy * 0.3;
            e.vx *= 0.5;
            e.vz *= 0.5;
            e.bounce--;
          } else {
            e.bounce = -1;
          }
        }
      } else if (e.rest > 0) {
        e.rest -= dt;
      } else {
        e.fade -= dt;
        if (e.fade <= 0) {
          e.on = false;
          continue;
        }
      }
      let a = e.a * (e.bounce < 0 && e.rest <= 0 ? Math.max(0, e.fade / 0.35) : 1);
      // (never on the hero's feet)
      const hx = e.x - H.x, hz = e.z - H.z;
      if (hx * hx + hz * hz < 0.36) a *= 0.2;
      b.put(e.x, e.y, e.z, 0.3, e.g, 0, col, a);
    }
    this._pebN = live;
    b.end();
  }

  _empty() {
    for (const e of this._peb) e.on = false;
    this._pebN = 0;
    this._b?.empty();
  }

  /** Letters in the air now (dust, grit). */
  get count() {
    return this._b ? this._b.np + this._pebN : 0;
  }

  clear() {
    this._empty();
    this._mem.fill(-1e9);
    this._lastT = -1e9;
    this._lastP = 0;
  }

  setVisible(on) {
    this._visible = !!on;
    if (this._b?.mesh) this._b.mesh.visible = this._visible;
    if (!on) this._empty();
  }

  takes() {
    return false;
  }
}
