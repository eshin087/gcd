import { GlyphParticles } from '../../render/particles.js';
import { gi } from '../../render/glyphs.js';
import { meadowHeight } from '../grass.js';
import { LITTER } from './litterTuning.js';

// THE LITTER (piece 'litter'): what falls and lies: leaves, ash, paper slips, grit, by level
// (litterTuning.js). It drifts down on the wind, lands, stays on the ground as letters, and lifts
// again when a gust or a foot passes.
//
//   litter.scatter(x, z, r, k)   what lies (or flies) within r of (x, z) is thrown outward and up (k: how
//                                hard, 1 = a heavy blow); returns how many letters it moved
//   litter.count                 letters lying or in the air now
//   litter.lying                 of those, the ones lying (added)
//   litter.shower(n)             n letters start falling round the camera at once (added: the Lab)
// With the piece off: scatter does nothing and returns 0, count 0, no pool exists.
//
// HOW: one pool of its own (GlyphParticles, not additive, LITTER.max x quality letters), made on the
// first update with the piece on. The letters are records in a stable array of this module's (a letter
// keeps its record from falling to lying to lifting); every frame the records are written straight
// into the pool's instance buffers (position, size / glyph / rotation, colour / alpha) and the pool's
// own update is a no-op (LitterBatch): one draw call, no spawn / compaction churn, no allocation.
//
// A letter's life: AIR (falls at its own terminal speed, carried by life.wind.at, swings and turns)
// → LYING (still, dimmer, just over the floor, or on the grass) → AIR again when the air over it is
// faster than its own threshold, when the hero runs through it, or when a blow scatters it → ...
// → FADE when it is recycled (it lay its time out, or too many lie), then free.
// The litter keeps to a window round life.focus (the visible ground and a margin): a lying letter the
// window leaves behind is moved to the band at the window's other edge (out of view), so walking never
// reveals bare ground.

const FREE = 0, AIR = 1, LYING = 2, FADE = 3;
const TAU = Math.PI * 2;
const GRID = 1; // m a weight cell
const GRID_HALF = 80;
const GRID_N = (GRID_HALF * 2) / GRID;
const HALF = () => 0.5; // (the grass's mean blade)
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The pool whose letters this module writes itself: its own update must not age or compact them. */
class LitterBatch extends GlyphParticles {
  update() {}
}

export class Litter {
  constructor(life) {
    this.life = life;
    this.count = 0;
    this.lying = 0;
    this.T = life.enabled ? (LITTER.levels[life.levelId] ?? null) : null;
    const gh = life.set?.grass?.height;
    this._grassH = Number.isFinite(gh) ? gh : 1;
    this.pool = null;
    this.leaves = null;
    this.kinds = null;
    this._seeded = false;
    this._acc = 0;
    this._frame = 0;
    this._recycleT = 0;
    this._fx = NaN;
    this._fz = NaN;
    this._w = { x: 0, z: 0, k: 0 };
    this._pick = { x: 0, z: 0 };
    this._lastSpawn = null;
    this._win = { fx: 0, fz: 0, x0: 0, x1: 0, z0: 0, z1: 0 };
    this._mvx = 0;
    this._mvz = 0;
    this._bounds = this._win;
    this._visible = true;
    life.action?.('leaf shower', () => this.shower(), 'a burst of falling leaves round the camera');
    life.action?.('scatter at hero', () => {
      const h = this.life.hero;
      return this.scatter(h.x, h.z, 4, 1);
    }, 'what lies round the hero is thrown up, as by a blow');
  }

  _on() {
    return !!this.T && this.life.on('litter');
  }

  // ---------------------------------------------------------------- build (first update with the piece on)
  _build() {
    const T = this.T;
    this.kinds = T.kinds.map((K) => {
      const glyphs = [...K.glyphs].map((c) => gi(c));
      const W = K.where ?? { at: 'flat' };
      const base = W.at === 'rim' || W.at === 'near' ? (W.lo ?? 0) : W.at === 'ash' || W.at === 'kerb' ? W.base / (W.base + W.pile) : W.at === 'flat' ? Math.min(1, W.out ?? 1) : 1;
      return { K, glyphs, W, base, grid: new Float32Array(GRID_N * GRID_N).fill(NaN), pts: this._points(W) };
    });
    let share = 0;
    for (const k of this.kinds) share += k.K.share ?? 1;
    this._shareSum = share || 1;
    this.leaves = Array.from({ length: LITTER.max }, () => ({
      s: FREE, k: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ph: 0, fq: 1, sa: 0, sp: 0, rot: 0, size: 0.2, g: 0,
      cr: 0, cg: 0, cb: 0, fall: 1, lift: 3, pile: 0, b: 1, a: 0, fa: 0, age: 0, last: 100, gy: 0.05,
    }));
    // three.js draws a uuid from Math.random for every geometry / material / mesh: while the pool is
    // made (inside life.update), those draws come from the living world's own stream, so the seeded
    // fights' Math.random is never moved
    const mr = Math.random;
    try {
      Math.random = () => this.life.rand();
      this.pool = new LitterBatch(this.life.game.U, { max: LITTER.max, additive: false });
      this.pool.uniforms.uSoft.value = LITTER.soft;
      this.pool.mesh.visible = this._visible;
      this.life.game.pipeline?.registerParticles?.(this.pool);
    } catch {
      this.pool = null; // (no GPU: the letters still live, they are only not drawn)
    } finally {
      Math.random = mr;
    }
  }

  /** The points a 'near' kind gathers round (the charm posts), from its tuning. */
  _points(W) {
    if (W.at !== 'near') return null;
    return (W.angles ?? []).map((d) => {
      const a = (d * Math.PI) / 180;
      return { x: Math.sin(a) * W.r, z: Math.cos(a) * W.r };
    });
  }

  /** Where a kind falls and lies, 0..1 (cached per metre). */
  _weight(kd, x, z) {
    const i = Math.floor((x + GRID_HALF) / GRID), j = Math.floor((z + GRID_HALF) / GRID);
    if (i < 0 || j < 0 || i >= GRID_N || j >= GRID_N) return kd.base;
    const c = j * GRID_N + i;
    let w = kd.grid[c];
    if (w !== w) {
      w = this._weightAt(kd, (i + 0.5) * GRID - GRID_HALF, (j + 0.5) * GRID - GRID_HALF);
      kd.grid[c] = w;
    }
    return w;
  }

  _weightAt(kd, x, z) {
    const W = kd.W;
    switch (W.at) {
      case 'rim': {
        const r = Math.hypot(x, z);
        return W.lo + (1 - W.lo) * smooth(W.r0, W.r1, r);
      }
      case 'near': {
        let best = 0;
        for (const p of kd.pts) {
          const d = Math.hypot(x - p.x, z - p.z);
          best = Math.max(best, Math.exp(-(d * d) / (W.spread * W.spread)));
        }
        return Math.max(W.lo ?? 0, best);
      }
      case 'ash': {
        // piles in the lee of what stands (pillars, lanterns, statues): a bump on each lee side
        let pile = 0;
        const C = this.life.world?.colliders?.circles ?? [];
        for (const c of C) {
          if (!(c.r <= W.maxR) || Math.hypot(c.x, c.z) > W.within) continue;
          for (const [lx, lz] of W.lee) {
            const px = c.x + lx * (c.r + W.gap), pz = c.z + lz * (c.r + W.gap);
            const d = Math.hypot(x - px, z - pz);
            if (d < W.reach) pile = Math.max(pile, 1 - d / W.reach);
          }
        }
        return (W.base + W.pile * pile) / (W.base + W.pile);
      }
      case 'kerb': {
        // against the ring's kerb, the downwind (east) side most
        const ax = Math.abs(x), az = Math.abs(z);
        let pile = 0;
        if (az < W.half + 0.5 && ax < W.half + 0.2) {
          const dx = W.half - ax, dz = W.half - az;
          const east = x > 0 ? 1 : 0.35;
          pile = Math.max(east * smooth(W.depth, 0, dx), 0.35 * smooth(W.depth, 0, dz));
        }
        return (W.base + W.pile * pile) / (W.base + W.pile);
      }
      default: {
        const r = Math.hypot(x, z);
        return r < (W.r ?? Infinity) ? 1 : (W.out ?? 1);
      }
    }
  }

  /** How high a letter lies at (x, z): over the floor, or on the blades' tips where the grass is thick
   *  (lower, the pool's soft depth test hides it among the blades). */
  _groundY(x, z) {
    const d = this.life.world?.fire?.density?.(x, z);
    const y0 = LITTER.floor;
    if (!(d > 0.15) || !(this.T.grass > 0)) return y0;
    const h = meadowHeight(x, z, HALF) * this._grassH;
    return y0 + this.T.grass * (Number.isFinite(h) ? h : 0) * smooth(0.15, 0.65, d);
  }

  /** Is (x, z) inside something that stands (a stone, a trunk, a pillar)? */
  _inside(x, z) {
    const C = this.life.world?.colliders?.circles;
    if (!C) return false;
    for (let i = 0; i < C.length; i++) {
      const c = C[i];
      const dx = x - c.x, dz = z - c.z, r = c.r * 0.9;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  _kindIndex() {
    let u = this.life.rand() * this._shareSum;
    for (let i = 0; i < this.kinds.length; i++) {
      u -= this.kinds[i].K.share ?? 1;
      if (u <= 0) return i;
    }
    return this.kinds.length - 1;
  }

  /** A point in [x0, x1] x [z0, z1] where the kind lies (by its weight), into this._pick; false if none found. */
  _place(kd, x0, x1, z0, z1, tries = 8) {
    const L = this.life, P = this._pick;
    for (let t = 0; t < tries; t++) {
      const x = L.range(x0, x1), z = L.range(z0, z1);
      if (L.rand() > this._weight(kd, x, z)) continue;
      if (this._inside(x, z)) continue;
      P.x = x;
      P.z = z;
      return true;
    }
    return false;
  }

  _free() {
    const A = this.leaves;
    for (let i = 0; i < A.length; i++) if (A[i].s === FREE) return A[i];
    return null;
  }

  /** A record's look and its own numbers, fresh. */
  _dress(f, ki) {
    const L = this.life, K = this.kinds[ki].K, gl = this.kinds[ki].glyphs;
    f.k = ki;
    f.g = gl[Math.floor(L.rand() * gl.length)] ?? 0;
    f.size = L.range(K.size[0], K.size[1]);
    const t = L.rand(), v = L.range(0.82, 1.12);
    const c0 = K.color, c1 = K.color2 ?? K.color;
    f.cr = (c0[0] + (c1[0] - c0[0]) * t) * v;
    f.cg = (c0[1] + (c1[1] - c0[1]) * t) * v;
    f.cb = (c0[2] + (c1[2] - c0[2]) * t) * v;
    f.fall = L.range(K.fall[0], K.fall[1]);
    f.lift = L.range(K.lift[0], K.lift[1]);
    f.fq = L.range(K.flutter[0], K.flutter[1]);
    f.ph = L.rand() * TAU;
    f.sa = L.rand() * TAU;
    f.sp = (L.rand() * 2 - 1) * K.spin;
    f.rot = L.rand() * TAU;
    f.pile = 0;
  }

  /** The window round the camera's focus (one record, reused). */
  _window() {
    const F = this.life.focus, W = LITTER.window, B = this._win;
    const fx = Number.isFinite(F?.x) ? F.x : 0, fz = Number.isFinite(F?.z) ? F.z : 0;
    B.fx = fx;
    B.fz = fz;
    B.x0 = fx - W.x;
    B.x1 = fx + W.x;
    B.z0 = fz - W.zN;
    B.z1 = fz + W.zS;
    return B;
  }

  _target() {
    return Math.round((this.T.lying ?? 0) * this.life.quality);
  }

  _cap() {
    return Math.max(0, Math.min(LITTER.max, Math.round(LITTER.max * this.life.quality)));
  }

  /** Lay `n` letters on the ground across the window (the level was windy before you came). */
  _seed(n) {
    const L = this.life, B = this._bounds;
    for (let i = 0; i < n && this.count < this._cap(); i++) {
      const f = this._free();
      if (!f) break;
      const ki = this._kindIndex();
      if (!this._place(this.kinds[ki], B.x0, B.x1, B.z0, B.z1, 24)) continue;
      this._dress(f, ki);
      this._lie(f, this._pick.x, this._pick.z);
      f.age = L.range(0, f.last); // (they did not all land at once)
      f.a = 1;
      f.fa = 0;
      f.b = this.kinds[ki].K.lie;
      this.count++;
    }
  }

  /** What would be in the air at this moment, already on its way down (not all starting at the top). */
  _seedAir(B) {
    const L = this.life, T = this.T;
    let fallT = 0, sh = 0;
    for (const kd of this.kinds) {
      const K = kd.K;
      if (K.source === 'edge') continue;
      fallT += (K.share ?? 1) * ((K.from[0] + K.from[1]) / (K.fall[0] + K.fall[1]));
      sh += K.share ?? 1;
    }
    if (!(sh > 0)) return;
    const n = Math.round(T.rate * L.calm * L.quality * L.k * (fallT / sh));
    for (let i = 0; i < n; i++) {
      const ki = this._kindIndex();
      if (this.kinds[ki].K.source === 'edge' || !this._spawn(ki, B)) continue;
      const f = this._lastSpawn;
      const u = L.rand();
      const left = (f.y * (1 - u)) / f.fall; // s of its fall already behind it
      f.y *= u;
      f.x += f.vx * left;
      f.z += f.vz * left;
      f.a = 1;
      f.fa = 0;
    }
  }

  _lie(f, x, z) {
    const L = this.life, K = this.kinds[f.k].K, kd = this.kinds[f.k];
    f.s = LYING;
    f.x = x;
    f.z = z;
    f.gy = this._groundY(x, z);
    f.y = f.gy;
    f.vx = f.vy = f.vz = 0;
    f.age = 0;
    f.last = L.range(this.T.last[0], this.T.last[1]);
    const w = this._weight(kd, x, z);
    f.pile = Math.max(f.pile, kd.base < 1 ? Math.max(0, (w - kd.base) / (1 - kd.base)) : 0);
    f.rot += K.spin > 0 ? 0.6 * Math.sin(f.ph) : 0;
  }

  /** A letter starts falling from the sky (or tumbling in along the ground from upwind). */
  _spawn(ki, B, inner = false) {
    const f = this._free();
    if (!f || this.count >= this._cap()) return false;
    const L = this.life, kd = this.kinds[ki], K = kd.K;
    const w = L.wind?.at?.(B.fx, B.fz, this._w) ?? this._w;
    const wx = Number.isFinite(w.x) ? w.x : 0, wz = Number.isFinite(w.z) ? w.z : 0;
    let x, z, y;
    if (K.source === 'edge') {
      const sp = Math.hypot(wx, wz);
      if (sp < 0.2) return false;
      const dx = wx / sp, dz = wz / sp, band = LITTER.band;
      // the upwind side of the window, by how much the wind runs along each axis
      if (L.rand() * (Math.abs(dx) + Math.abs(dz)) < Math.abs(dx)) {
        x = dx > 0 ? B.x0 + L.rand() * band : B.x1 - L.rand() * band;
        z = L.range(B.z0, B.z1);
      } else {
        z = dz > 0 ? B.z0 + L.rand() * band : B.z1 - L.rand() * band;
        x = L.range(B.x0, B.x1);
      }
      if (this._inside(x, z)) return false;
      this._dress(f, ki);
      y = this._groundY(x, z) + L.range(K.from[0], K.from[1]);
      f.vx = wx * K.carry;
      f.vz = wz * K.carry;
      f.vy = 0;
    } else {
      // where it should land (by its weight), less the drift of its fall on the wind
      const S = LITTER.window, m = inner ? 0.55 : 1;
      const x0 = B.fx - S.x * m, x1 = B.fx + S.x * m, z0 = B.fz - S.zN * m, z1 = B.fz + S.zS * m;
      if (!this._place(kd, x0, x1, z0, z1, 6)) return false;
      const h = this.life.hero;
      if (Math.abs(this._pick.x - h.x) < 1.2 && Math.abs(this._pick.z - h.z) < 1.2) return false;
      this._dress(f, ki);
      y = L.range(K.from[0], K.from[1]);
      const tFall = y / f.fall;
      x = this._pick.x - wx * K.carry * tFall;
      z = this._pick.z - wz * K.carry * tFall;
      f.vx = wx * K.carry;
      f.vz = wz * K.carry;
      f.vy = -f.fall;
    }
    f.s = AIR;
    f.x = x;
    f.y = y;
    f.z = z;
    f.a = 0;
    f.fa = 1 / LITTER.fadeIn;
    f.b = 1;
    f.age = 0;
    this.count++;
    this._lastSpawn = f;
    return true;
  }

  /** Off the ground: the air (or a foot, or a blow) takes it, with this velocity. */
  _lift(f, vx, vy, vz) {
    f.s = AIR;
    f.vx = vx;
    f.vy = vy;
    f.vz = vz;
    f.y = Math.max(f.y, f.gy + 0.02);
    f.pile = 0;
  }

  _fadeOut(f, inView) {
    if (f.s === FADE) return;
    f.s = FADE;
    f.fa = -1 / LITTER.fadeOut[inView ? 0 : 1];
  }

  _inView(f, B) {
    const W = LITTER.window, m = LITTER.band + 2;
    return f.x > B.fx - W.x + m && f.x < B.fx + W.x - m && f.z > B.fz - W.zN + m && f.z < B.fz + W.zS - m;
  }

  _release(f) {
    if (f.s !== FREE) {
      if (f.s === LYING) this.lying--;
      f.s = FREE;
      this.count--;
    }
  }

  // ---------------------------------------------------------------- the interface
  /** A blow at (x, z): what lies (or flies) within r is thrown outward and up. Returns how many moved. */
  scatter(x, z, r = 4, k = 1) {
    if (!this._on() || !this.leaves || !Number.isFinite(x + z + r + k) || !(r > 0) || !(k > 0)) return 0;
    const L = this.life, S = LITTER.scatter;
    let n = 0;
    for (const f of this.leaves) {
      if (f.s !== LYING && f.s !== AIR) continue;
      const dx = f.x - x, dz = f.z - z;
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      const K = this.kinds[f.k].K;
      const fo = 1 - d / r, hop = K.hop / 1.4;
      const ux = d > 1e-3 ? dx / d : Math.cos(f.sa), uz = d > 1e-3 ? dz / d : Math.sin(f.sa);
      const out = S.out * k * (0.35 + 0.65 * fo) * L.range(0.6, 1.15);
      if (f.s === LYING) this.lying--;
      this._lift(f, ux * out, S.up * k * hop * (0.3 + 0.7 * fo) * L.range(0.6, 1.1), uz * out);
      n++;
    }
    return n;
  }

  /** n letters start falling round the camera at once (the Lab's 'leaf shower'). */
  shower(n = LITTER.shower) {
    if (!this._on() || !this.leaves) return 0;
    const B = this._window();
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) if (this._spawn(this._kindIndex(), B, true)) k++;
    // (they start at different heights already: _spawn draws each one's own)
    return k;
  }

  takes(what) {
    return !!this.T && Array.isArray(this.T.takes) && this.T.takes.includes(what);
  }

  setVisible(on) {
    this._visible = !!on;
    if (this.pool) this.pool.mesh.visible = this._visible;
  }

  /** 'reset': the fight was reset: what is in the air goes; what lies stays (it is the ground). */
  clear() {
    if (!this.leaves) return;
    for (const f of this.leaves) if (f.s === AIR) this._release(f);
    this._draw();
  }

  // ---------------------------------------------------------------- the frame
  update(dt) {
    if (!this._on()) {
      if (this.leaves && this.count > 0) {
        for (const f of this.leaves) f.s = FREE;
        this.count = this.lying = 0;
        this._seeded = false;
        this._draw();
      }
      return;
    }
    if (!Number.isFinite(dt) || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    if (!this.leaves) this._build();
    const L = this.life, T = this.T, B = this._window();
    this._bounds = B;
    // the window: a jump (a respawn, the Lab) lays the ground anew; a walk moves what it leaves behind
    const jump = !Number.isFinite(this._fx) || Math.hypot(B.fx - this._fx, B.fz - this._fz) > 12;
    if (!this._seeded || jump) {
      if (this._seeded) for (const f of this.leaves) this._release(f);
      this._seeded = true;
      this._seed(this._target());
      this._seedAir(B);
    }
    const mx = Number.isFinite(this._fx) ? B.fx - this._fx : 0, mz = Number.isFinite(this._fz) ? B.fz - this._fz : 0;
    const moved = Math.hypot(mx, mz);
    this._fx = B.fx;
    this._fz = B.fz;
    // (the camera's drift, smoothed: where the window is heading)
    const ev = 1 - Math.exp(-dt / 0.5);
    this._mvx += (mx / dt - this._mvx) * ev;
    this._mvz += (mz / dt - this._mvz) * ev;
    this._frame++;

    // what starts falling
    this._acc += dt * T.rate * L.calm * L.quality * L.k;
    let guard = 0;
    while (this._acc >= 1 && guard++ < 40) {
      this._acc -= 1;
      this._spawn(this._kindIndex(), B);
    }
    if (this._acc > 1) this._acc = 0;

    // the letters
    const H = L.hero, kick = LITTER.kick, kicking = H.speed >= kick.speed;
    const hx = H.speed > 1e-3 ? H.vx / H.speed : 0, hz = H.speed > 1e-3 ? H.vz / H.speed : 0;
    const every = LITTER.liftEvery, slot = this._frame % every;
    const band = Math.max(LITTER.band, moved * 2);
    const amp = L.k;
    const wind = L.wind;
    const w = this._w;
    let lying = 0;
    for (let i = 0; i < this.leaves.length; i++) {
      const f = this.leaves[i];
      if (f.s === FREE) continue;
      const K = this.kinds[f.k].K;
      // fading (in or out)
      if (f.fa !== 0) {
        f.a += f.fa * dt;
        if (f.a >= 1) { f.a = 1; f.fa = 0; }
        if (f.a <= 0) {
          f.a = 0;
          f.s = FREE;
          this.count--;
          continue;
        }
      }
      if (f.s === LYING) {
        lying++;
        f.age += dt;
        // the window left it behind: to the band at the other edge (out of view)
        if (f.x < B.x0 || f.x > B.x1 || f.z < B.z0 || f.z > B.z1) {
          let x0 = B.x0, x1 = B.x1, z0 = B.z0, z1 = B.z1;
          if (f.x < B.x0) x0 = B.x1 - band;
          else if (f.x > B.x1) x1 = B.x0 + band;
          if (f.z < B.z0) z0 = B.z1 - band;
          else if (f.z > B.z1) z1 = B.z0 + band;
          if (this._place(this.kinds[f.k], x0, x1, z0, z1, 6)) {
            const age = f.age, last = f.last;
            this._dress(f, f.k);
            this._lie(f, this._pick.x, this._pick.z);
            f.age = age;
            f.last = last;
            f.b = K.lie;
          } else {
            f.s = FREE;
            this.count--;
            lying--;
          }
          continue;
        }
        // its time is out
        if (f.age > f.last) {
          this._fadeOut(f, this._inView(f, B));
          lying--;
          continue;
        }
        // the hero's feet
        if (kicking) {
          const dx = f.x - H.x, dz = f.z - H.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < kick.r * kick.r) {
            const side = dx * -hz + dz * hx >= 0 ? 1 : -1; // which side of his path
            const fw = H.speed * kick.forward * L.range(0.6, 1.2) * amp;
            const as = L.range(kick.aside[0], kick.aside[1]) * side * amp;
            const up = L.range(kick.up[0], kick.up[1]) * (K.hop / 1.4) * amp;
            this._lift(f, hx * fw - hz * as, up, hz * fw + hx * as);
            lying--;
            continue;
          }
        }
        // the air over it
        if (i % every === slot && wind?.at) {
          wind.at(f.x, f.z, w);
          const sp = Math.hypot(w.x, w.z);
          const thr = f.lift * (1 + (T.shelter ?? 0) * f.pile * 2);
          if (sp > thr && Number.isFinite(sp)) {
            const g = Math.min(2, sp / thr);
            this._lift(f, w.x * K.carry * 0.5, K.hop * L.range(0.35, 0.9) * g, w.z * K.carry * 0.5);
            lying--;
            continue;
          }
        }
        // (brightness settles to its lying value)
        f.b += (K.lie - f.b) * Math.min(1, dt * 1.5);
        continue;
      }
      if (f.s === FADE) {
        continue;
      }
      // AIR
      f.ph += f.fq * dt;
      if (wind?.at) wind.at(f.x, f.z, w);
      else w.x = w.z = 0;
      const wx = Number.isFinite(w.x) ? w.x : 0, wz = Number.isFinite(w.z) ? w.z : 0;
      const sw = Math.sin(f.ph) * K.slip * amp;
      const tx = wx * K.carry + Math.cos(f.sa) * sw;
      const tz = wz * K.carry + Math.sin(f.sa) * sw;
      const ty = -f.fall * (1 + 0.4 * Math.cos(2 * f.ph));
      const e = 1 - Math.exp(-dt / K.tau);
      f.vx += (tx - f.vx) * e;
      f.vz += (tz - f.vz) * e;
      f.vy += (ty - f.vy) * e;
      f.sa += 0.15 * dt;
      const px = f.x, pz = f.z;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      f.rot += f.sp * dt;
      f.b += (1 - f.b) * Math.min(1, dt * 2);
      // gone out of the window in the air: let it go (out of view)
      const mg = 3;
      if (f.x < B.x0 - mg || f.x > B.x1 + mg || f.z < B.z0 - mg || f.z > B.z1 + mg || !(f.y > -5 && f.y < 40)) {
        f.s = FREE;
        this.count--;
        continue;
      }
      if (f.y > 1.5) continue;
      // the ring's kerb stops what tumbles out across it (it piles there)
      const kb = T.kerb;
      if (kb && f.y < f.gy + 0.6) {
        let hit = false;
        if (Math.abs(px) < kb && Math.abs(f.x) >= kb && Math.abs(f.z) < kb + 0.3) { f.x = Math.sign(f.x) * (kb - 0.05); hit = true; }
        if (Math.abs(pz) < kb && Math.abs(f.z) >= kb && Math.abs(f.x) < kb + 0.3) { f.z = Math.sign(f.z) * (kb - 0.05); hit = true; }
        if (hit) {
          f.pile = 1;
          this._lie(f, f.x, f.z);
          f.pile = 1;
          lying++;
          continue;
        }
      }
      const gy = this._groundY(f.x, f.z);
      f.gy = gy;
      if (f.y > gy) continue;
      // down: it lies, unless the air is still fast enough to skip it on (a tumble)
      const sp = Math.hypot(wx, wz);
      const thr = f.lift;
      if (sp > thr * 0.85 && f.vy < 0) {
        f.y = gy + 0.01;
        f.vy = K.hop * L.range(0.2, 0.6) * Math.min(1.5, sp / thr);
        f.vx *= 0.7;
        f.vz *= 0.7;
        continue;
      }
      if (this._inside(f.x, f.z)) {
        this._fadeOut(f, true);
        continue;
      }
      this._lie(f, f.x, f.z);
      lying++;
    }
    this.lying = lying;

    // too many lie (or the cap fell): the oldest go, the ones out of view first
    this._recycleT -= dt;
    if (this._recycleT <= 0) {
      this._recycleT = 0.5;
      let over = Math.max(this.lying - this._target(), this.count - this._cap());
      for (let n = 0; n < 8 && over > 0; n++, over--) {
        let best = null, bs = -1, bv = false;
        for (const f of this.leaves) {
          if (f.s !== LYING) continue;
          const v = this._inView(f, B);
          const s = f.age / f.last + (v ? 0 : 10);
          if (s > bs) { bs = s; best = f; bv = v; }
        }
        if (!best) break;
        this._fadeOut(best, bv);
        this.lying--;
      }
      // the camera is moving and too few lie: lay some in the band it is heading into (out of view;
      // what falls cannot keep up with a run)
      const short = this._target() - this.lying;
      const vx = this._mvx, vz = this._mvz;
      if (short > 0 && Math.hypot(vx, vz) > 1) {
        const bd = LITTER.band + Math.hypot(vx, vz) * 0.5;
        const ax = Math.abs(vx), az = Math.abs(vz);
        for (let n = 0; n < Math.min(short, 12) && this.count < this._cap(); n++) {
          const f = this._free();
          if (!f) break;
          const ki = this._kindIndex();
          let x0 = B.x0, x1 = B.x1, z0 = B.z0, z1 = B.z1;
          if (this.life.rand() * (ax + az) < ax) {
            if (vx > 0) x0 = B.x1 - bd;
            else x1 = B.x0 + bd;
          } else if (vz > 0) z0 = B.z1 - bd;
          else z1 = B.z0 + bd;
          if (!this._place(this.kinds[ki], x0, x1, z0, z1, 8)) continue;
          this._dress(f, ki);
          this._lie(f, this._pick.x, this._pick.z);
          f.age = this.life.range(0, f.last * 0.8);
          f.a = 1;
          f.fa = 0;
          f.b = this.kinds[ki].K.lie;
          this.count++;
          this.lying++;
        }
      }
    }
    this._draw();
  }

  /** The records into the pool's instance buffers (one draw call). */
  _draw() {
    const pool = this.pool;
    if (!pool) return;
    const P = pool.iPos.array, D = pool.iData.array, C = pool.iColor.array;
    const H = this.life.hero, hc = LITTER.heroClear;
    let n = 0;
    if (this.leaves && this.count > 0) {
      for (const f of this.leaves) {
        if (f.s === FREE) continue;
        const K = this.kinds[f.k].K;
        let a = K.alpha * f.a;
        if (f.s !== AIR) {
          // not drawn over the hero's feet
          const dx = f.x - H.x, dz = f.z - H.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < hc[1] * hc[1]) a *= smooth(hc[0], hc[1], Math.sqrt(d2));
        }
        if (!(a > 0.002)) continue;
        const b = f.b;
        const rot = f.s === AIR && K.spin > 0 ? f.rot + 0.6 * Math.sin(f.ph) : f.rot;
        P[n * 3] = f.x; P[n * 3 + 1] = f.y; P[n * 3 + 2] = f.z;
        D[n * 4] = f.size; D[n * 4 + 1] = f.g; D[n * 4 + 2] = rot; D[n * 4 + 3] = 0;
        C[n * 4] = f.cr * b; C[n * 4 + 1] = f.cg * b; C[n * 4 + 2] = f.cb * b; C[n * 4 + 3] = a;
        n++;
      }
    }
    pool.count = n;
    pool.geometry.instanceCount = n;
    pool.iPos.needsUpdate = pool.iData.needsUpdate = pool.iColor.needsUpdate = true;
  }
}
