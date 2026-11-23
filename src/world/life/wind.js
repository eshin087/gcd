import { WIND_TUNE, WIND_DEFAULT, WIND_LULL, WIND_BURST, WIND_HUSH } from './windTuning.js';
import { WIND_SLOTS } from '../../render/shaderLib.js';
import { LetterBatch } from './letterBatch.js';

// THE WIND (piece 'wind'): one shared wind per level, the air every other layer reads.
//
//   wind.at(x, z, out)    the air's velocity at a point on the ground, m/s: out.x, out.z, and out.k
//                         (0..1: how much of a gust is passing there now). Returns `out` (pass your own
//                         record; with none, a shared one is returned: read it at once).
//   wind.front(o)         send a gust front across the level: { strength (1 = an ordinary gust),
//                         speed (m/s), width (m), dirX, dirZ (default: the prevailing wind) }
//                         (added: `from`, m upwind of the camera's focus where it is born; default the
//                         level's `fronts.from`. Returns the slot, or -1)
//   wind.burst(x, z, strength, radius)   a radial push from a point (life.gust → here)
//   wind.dirX, .dirZ      the prevailing direction now (unit)
//   wind.speed            the prevailing speed now, m/s
//   wind.level            0..1: how loud the air is now (the air's sound, emitters)
//   wind.still            true in a level with no wind of its own (the Windless Grove): at() is zero
//                         there except where a burst passes
//   (added) wind.lull(sec)   the air falls still for `sec` s (the Lab's 'lull'; the answer layer's hush)
//   (added) wind.gust        0..1: how much front is passing the camera's focus now
//   (added) wind.wisped      wisps born this visit (the tests)
// With the piece off: at() gives zero, level 0, and nothing is drawn or written.
//
// The shaders read it from the shared uniforms `uWind` (dirX, dirZ, speed, level) and `uWindFronts`
// (shaderLib.js: the fronts, the sink, the field's travel, the grass's and the trees' answer), written
// here once a frame while the piece is on, and put back to all-zero (the old sway) when it goes off.
//
// A FRONT is a line moving along its direction: ahead of its edge the air rises over `lead` m, behind
// it the gust decays over `tail` m. The edge bows and its strength comes in patches along its length
// (the same formula as WIND_GLSL's windFronts: keep the two in step). It is born `from` m upwind of the
// camera's focus and dies `to` m downwind, easing in and out so nothing pops.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Wind {
  constructor(life) {
    this.life = life;
    const T = (this.T = WIND_TUNE[life.levelId] ?? WIND_DEFAULT);
    this.still = life.levelId === 'grove' || T.still === true;
    this.dirX = Math.cos(T.dir * DEG);
    this.dirZ = Math.sin(T.dir * DEG);
    this.speed = 0;
    this.level = 0;
    this.gust = 0;
    this._o = { x: 0, z: 0, k: 0 };
    this._t = 0;
    this._ox = 0; // the field's travel (the grass's patches ride it downwind)
    this._oz = 0;
    this._next = 0; // s to the next front
    this._lull = 0; // s of lull held
    this._lullK = 0; // 0..1 how still the lull holds the air now
    this._wrote = false;
    this._k = 1; // life.k x the weather's windK: every amplitude scales by it
    this.fronts = Array.from({ length: WIND_SLOTS }, () => ({
      on: false, nx: 1, nz: 0, pos: 0, end: 0, speed: 0, strength: 0, tail: 8, lead: 2, phase: 0, env: 0, air: 0, quiet: false, ease: 0.8, born: false,
    }));
    this.bursts = Array.from({ length: 4 }, () => ({ on: false, x: 0, z: 0, s: 0, r: 1, age: 0 }));
    // the wisps (wind.js _wisps): clumps of tiny faint letters riding the air, drawn in an own batch
    // made on the first update with the piece on; their own random stream (seeded once from life.rand:
    // how many letters a clump has never moves what the other layers draw)
    this._wc = [];
    this._wl = null;
    this._wb = undefined;
    this._wAcc = 0;
    this._wgAcc = 0;
    this._ws = 0;
    /** wisps born this visit (the tests) */
    this.wisped = 0;
    this._w = { x: 0, z: 0, k: 0 };

    life.action('gust front', () => this.front({ strength: 1.15 }), 'send a gust front across the level');
    life.action('burst at hero', () => {
      const h = this.life.hero;
      this.burst(h.x, h.z, 1.4, 14);
    }, 'a radial burst of air from the hero');
    life.action('lull', () => this.lull(WIND_LULL.hold), 'the air falls still for a few seconds');
  }

  _on() {
    return this.life.on('wind');
  }

  /** The air at (x, z), m/s, and how much gust is passing (out.k). No allocation. */
  at(x, z, out = this._o) {
    out.x = 0;
    out.z = 0;
    out.k = 0;
    out.alarm = 0;
    if (!this._on() || !Number.isFinite(x) || !Number.isFinite(z)) return out;
    if (!this.still) {
      const S = this.T.sink;
      if (S) {
        // the throne: drawn toward the star, fading toward its rim and very close to it
        const dx = S.x - x, dz = S.z - z, d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const f = (1 - smooth(S.radius * 0.6, S.radius, d)) * smooth(0.5, 4, d);
          out.x = (dx / d) * this.speed * f;
          out.z = (dz / d) * this.speed * f;
        }
      } else {
        out.x = this.dirX * this.speed;
        out.z = this.dirZ * this.speed;
      }
    }
    // the fronts (in the still grove only the fight's: a front sent from a point)
    let k = 0, al = 0;
    for (const F of this.fronts) {
      if (!F.on) continue;
      const f = this._frontK(F, x, z);
      if (f <= 0) continue;
      out.x += F.nx * f * F.air;
      out.z += F.nz * f * F.air;
      k += f;
      if (!F.quiet) al += f;
    }
    out.k = Math.min(1, k);
    out.alarm = Math.min(1, al);
    // bursts: an expanding ring of air pushing outward (also in the still grove)
    for (const B of this.bursts) {
      if (!B.on) continue;
      const dx = x - B.x, dz = z - B.z, d = Math.hypot(dx, dz);
      const t = B.age / WIND_BURST.life;
      const R = B.r * Math.min(1, B.age * WIND_BURST.grow);
      const w = Math.max(1, B.r * WIND_BURST.width);
      const ring = Math.max(0, 1 - Math.abs(d - R) / w);
      const inner = d < R ? 0.35 : 0;
      const f = Math.max(ring, inner) * (1 - t) * (1 - t) * B.s;
      if (f <= 0 || d < 1e-3) continue;
      out.x += (dx / d) * f * WIND_BURST.air;
      out.z += (dz / d) * f * WIND_BURST.air;
      out.k = Math.min(1, out.k + f * 0.6);
      out.alarm = Math.min(1, out.alarm + f * 0.6);
    }
    return out;
  }

  /** How much of front F passes (x, z): its strength x the profile x the patch (WIND_GLSL's windFronts). */
  _frontK(F, x, z) {
    const s = x * F.nx + z * F.nz;
    const c = F.nx * z - F.nz * x;
    const e = F.pos + 2.4 * Math.sin(c * 0.07 + F.phase) + 1.1 * Math.sin(c * 0.19 + F.phase * 1.7);
    const d = e - s;
    if (d < -F.lead || d > F.tail * 5) return 0;
    const f = d < 0 ? smooth(-F.lead, 0, d) : Math.exp(-d / F.tail);
    return f * F.strength * F.env * this._k * (0.62 + 0.38 * Math.sin(c * 0.11 + F.phase * 2.3));
  }

  /** Send a gust front across the level. Returns its slot, or -1 (the piece off, a still level, no slot). */
  front(o = {}) {
    if (!this._on() || !o) return -1;
    // a front born at a point (the fight's: a roar from the boss) starts there; the still grove lets only those pass
    const ox = Number(o.x), oz = Number(o.z), born = Number.isFinite(ox) && Number.isFinite(oz);
    if (this.still && !born) return -1;
    const T = this.T, FT = T.fronts ?? WIND_DEFAULT_FRONTS;
    let F = null, slot = -1;
    for (let i = 0; i < this.fronts.length; i++) {
      if (!this.fronts[i].on) {
        F = this.fronts[i];
        slot = i;
        break;
      }
    }
    if (!F) {
      // all busy: the one furthest along gives way
      slot = 0;
      for (let i = 1; i < this.fronts.length; i++) if (this.fronts[i].pos - this.fronts[i].end > this.fronts[slot].pos - this.fronts[slot].end) slot = i;
      F = this.fronts[slot];
    }
    const L = this.life;
    let nx = Number(o.dirX), nz = Number(o.dirZ);
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-3) {
      const sink = T.sink;
      if (sink) {
        const f = L.focus;
        nx = sink.x - f.x;
        nz = sink.z - f.z;
        if (Math.hypot(nx, nz) < 1e-3) nx = 1;
      } else {
        const a = Math.atan2(this.dirZ, this.dirX) + L.range(-1, 1) * FT.spread * DEG;
        nx = Math.cos(a);
        nz = Math.sin(a);
      }
    }
    const n = Math.hypot(nx, nz);
    F.nx = nx / n;
    F.nz = nz / n;
    const num = (v, a, b) => (Number.isFinite(Number(v)) ? Number(v) : L.range(a, b));
    F.strength = Math.max(0, Math.min(3, num(o.strength, FT.strength[0], FT.strength[1])));
    F.speed = Math.max(0.5, num(o.speed, FT.speed[0], FT.speed[1]));
    F.tail = Math.max(1, num(o.width, FT.tail[0], FT.tail[1]));
    F.lead = FT.lead;
    F.air = FT.air;
    F.phase = L.range(0, TAU);
    // a front born at a point is strongest along the line it runs from that point (its patches, as in
    // _frontK: 0.62 + 0.38 sin(c 0.11 + 2.3 phase), peak where the line through the point runs)
    if (born) F.phase = (Math.PI / 2 - (F.nx * oz - F.nz * ox) * 0.11) / 2.3;
    const f = L.focus, from = Number.isFinite(Number(o.from)) ? Number(o.from) : FT.from;
    const s0 = (Number.isFinite(f.x) ? f.x : 0) * F.nx + (Number.isFinite(f.z) ? f.z : 0) * F.nz;
    F.pos = born ? ox * F.nx + oz * F.nz : s0 - from;
    F.end = Math.max(s0, F.pos) + FT.to;
    // (born at a point it swells in fast: it is the blow's own air, not a gust from far upwind)
    F.env = 0;
    F.ease = born ? WIND_BORN_EASE : 0.8;
    F.born = born;
    // a quiet front (the arrival's) moves the air but does not alarm what perches (out.alarm)
    F.quiet = o.quiet === true;
    F.on = true;
    return slot;
  }

  /** A radial push from (x, z): an expanding ring of air that fades. */
  burst(x, z, strength = 1, radius = 12) {
    if (!this._on() || !Number.isFinite(x + z + strength + radius) || !(strength > 0) || !(radius > 0)) return;
    let B = this.bursts[0];
    for (const b of this.bursts) {
      if (!b.on) {
        B = b;
        break;
      }
      if (b.age > B.age) B = b;
    }
    B.on = true;
    B.x = x;
    B.z = z;
    B.s = Math.min(3, strength);
    B.r = Math.min(40, radius);
    B.age = 0;
  }

  /** The air falls still for `sec` s (eases in and out). */
  lull(sec = WIND_LULL.hold) {
    if (Number.isFinite(sec) && sec > 0) this._lull = Math.max(this._lull, sec);
  }

  update(dt) {
    if (!this._on()) {
      if (this._wrote) this._off();
      return;
    }
    if (!Number.isFinite(dt) || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const L = this.life, T = this.T, B = T.breath;
    this._t += dt;
    const t = this._t;
    // the prevailing direction wanders
    const a = (T.dir + T.wander * (0.7 * Math.sin(t * 0.031 + 0.4) + 0.3 * Math.sin(t * 0.077 + 1.3))) * DEG;
    this.dirX = Math.cos(a);
    this.dirZ = Math.sin(a);
    // the speed breathes
    let raw = 0.5 + 0.5 * (0.6 * Math.sin((TAU * t) / B.periods[0] + 0.7) + 0.4 * Math.sin((TAU * t) / B.periods[1] + 2.1));
    if (B.pause > 0) raw = smooth(B.pause, 1, raw);
    if (B.fit > 0) raw = Math.min(1, Math.max(0, raw + B.fit * 0.5 * Math.sin(t * 1.9) * Math.sin(t * 0.67 + 0.5) * (0.6 + raw)));
    // a lull
    if (this._lull > 0) this._lull -= dt;
    const lw = this._lull > 0 ? 1 : 0;
    this._lullK += (lw - this._lullK) * (1 - Math.exp(-dt / WIND_LULL.ease));
    const wk = L.weather?.windK;
    const k = (this._k = L.k * (Number.isFinite(wk) ? Math.max(0, wk) : 1));
    // the world holding its breath (life.hush: a great blow winds up, the victory's lull) stills the air
    const hush = Math.max(0, Math.min(1, Number.isFinite(L.hush) ? L.hush : 0));
    this.speed = this.still ? 0 : T.speed * (B.floor + (1 - B.floor) * raw) * k * (1 - this._lullK) * (1 - WIND_HUSH.speed * hush);
    this._ox += this.dirX * this.speed * dt;
    this._oz += this.dirZ * this.speed * dt;
    // fronts: born on a schedule (fewer while the boss is up), carried across, eased in and out
    const FT = T.fronts;
    if (FT && !this.still) {
      this._next -= dt * L.calm * (1 - this._lullK) * (1 - hush);
      // (none is born while the world holds its breath: a due one waits for the breath to be let go)
      if (this._next <= 0 && hush < 0.05) {
        this._next = L.range(FT.every[0], FT.every[1]);
        this.front();
      }
    }
    const f = L.focus;
    let gust = 0;
    for (const F of this.fronts) {
      if (!F.on) continue;
      F.pos += F.speed * dt;
      const left = F.end - F.pos;
      // (an ambient front dies down while the world holds its breath; the fight's own goes on)
      const want = (left < 12 ? Math.max(0, left / 12) : 1) * (F.born ? 1 : 1 - hush);
      F.env += (want - F.env) * (1 - Math.exp(-dt / (F.ease || 0.8)));
      if (left <= 0 && F.env < 0.02) {
        F.on = false;
        F.env = 0;
        continue;
      }
      gust += this._frontK(F, f.x, f.z);
    }
    this.gust = Math.min(1, gust);
    for (const b of this.bursts) {
      if (!b.on) continue;
      b.age += dt;
      if (b.age >= WIND_BURST.life) b.on = false;
    }
    const front0 = FT?.air ?? WIND_DEFAULT_FRONTS.air;
    this.level = Math.min(1, (this.speed + gust * front0) / T.loud);
    this._write();
    this._wisps(dt);
    // the fire field's smoke and flames ride the air (render/fireField.js reads `wind`)
    const fire = L.game?.fx?.fire;
    if (fire && fire.wind !== this) {
      fire.wind = this;
      fire.windK = T.fire;
    }
  }

  /** The shared uniforms, once a frame (shaderLib.js: uWind, uWindFronts). */
  _write() {
    const U = this.life.game?.U;
    const W = U?.uWind?.value, A = U?.uWindFronts?.value;
    if (!W || !A) return;
    this._wrote = true;
    // (dir (0, 0) means "off" to the shaders: a still level still writes its direction)
    W.set(this.dirX, this.dirZ, this.speed, this.level);
    for (let i = 0; i < WIND_SLOTS; i++) {
      const F = this.fronts[i], a = A[i * 2], b = A[i * 2 + 1];
      if (!a || !b) continue;
      if (F?.on && F.env > 0.001) {
        a.set(F.nx, F.nz, F.pos, F.strength * F.env * this._k);
        b.set(F.tail, F.lead, F.phase, 0);
      } else {
        a.set(0, 0, 0, 0);
      }
    }
    const T = this.T, S = T.sink;
    A[WIND_SLOTS * 2]?.set(S?.x ?? 0, S?.z ?? 0, S && !this.still ? 1 : 0, 0);
    A[WIND_SLOTS * 2 + 1]?.set(this._ox, this._oz, 0, 0);
    const G = T.grass, R = T.trees;
    // (while the boss is up a gust's stir steps back further: nothing on the floor competes with a tell)
    const calm = Math.max(0, Math.min(1, Number.isFinite(this.life.calm) ? this.life.calm : 1));
    A[WIND_SLOTS * 2 + 2]?.set(G.lean, G.wave, G.front * (0.5 + 0.5 * calm), G.patch);
    A[WIND_SLOTS * 2 + 3]?.set(R.lean, R.rock, R.front, R.stir);
  }

  /** Back to the old motion: every wind uniform zero; nothing in flight. */
  _off() {
    const U = this.life.game?.U;
    U?.uWind?.value?.set(0, 0, 0, 0);
    for (const v of U?.uWindFronts?.value ?? []) v.set(0, 0, 0, 0);
    this._wrote = false;
    this.speed = this.level = this.gust = 0;
    for (const F of this.fronts) F.on = false;
    for (const b of this.bursts) b.on = false;
    this._wispsGo();
    const fire = this.life.game?.fx?.fire;
    if (fire && fire.wind === this) fire.wind = null;
  }

  /** The wisps' own stream (an LCG seeded once from life.rand). */
  _wr() {
    this._ws = (Math.imul(this._ws, 1664525) + 1013904223) >>> 0;
    return this._ws / 4294967296;
  }

  _wrange(a, b) {
    return a + (b - a) * this._wr();
  }

  /** The wisps' batch and records, made on first use (life.build: no Math.random). */
  _wispBatch() {
    if (this._wb !== undefined) return this._wb;
    this._wb = null;
    const W = this.T.wisps, L = this.life;
    if (!W || !(W.max > 0) || !L.game?.U) return null;
    this._ws = (Math.floor(L.rand() * 4294967296) ^ 0x51ed270b) >>> 0;
    const q = Math.max(0.3, Math.min(1, L.quality));
    const nc = Math.max(1, Math.round(W.max * q)), per = W.per[1] | 0;
    for (let i = 0; i < nc; i++) {
      this._wc.push({ i, on: false, x: 0, y: 0, z: 0, vx: 0, vz: 0, nx: 1, nz: 0, age: 0, life: 1, len: 1, wid: 0.3, n: 0, ph: 0, curl: 0, tone: 1 });
    }
    this._wper = per;
    this._wl = new Float32Array(nc * per * WL);
    // the letters: the tuning's, and the four strokes a '-' turns into along the wisp on screen
    const chars = [...new Set([...W.glyph, ...STROKES])].join('');
    try {
      this._wb = L.build(() => new LetterBatch(L.game, nc * per, chars, { snap: W.snap ?? 0 }));
      this._wg = [...W.glyph].map((c) => (c === '-' ? -1 : this._wb.col(c)));
      this._wst = [...STROKES].map((c) => this._wb.col(c));
      this._wb.mesh.visible = !this._hidden;
      L.game.pipeline?.registerParticles?.(this._wb);
    } catch {
      this._wb = null;
    }
    return this._wb;
  }

  /** Nothing of the wisps stays (the piece off, the world hidden). */
  _wispsGo() {
    for (const c of this._wc) c.on = false;
    this._wb?.empty?.();
    this._wAcc = this._wgAcc = 0;
  }

  /** A wisp is born at (x, z): a thin drift of letters along the air there. `gust`: a front's (longer). */
  _wispBorn(x, z, gust) {
    const W = this.T.wisps;
    let c = null;
    for (const o of this._wc) {
      if (!o.on) {
        c = o;
        break;
      }
    }
    if (!c) return;
    this.wisped++;
    const a = this.at(x, z, this._w);
    const s = Math.hypot(a.x, a.z);
    c.nx = s > 1e-3 ? a.x / s : this.dirX;
    c.nz = s > 1e-3 ? a.z / s : this.dirZ;
    c.vx = a.x * W.carry;
    c.vz = a.z * W.carry;
    c.on = true;
    c.x = x;
    c.z = z;
    c.y = this._wrange(W.y[0], W.y[1]);
    c.age = 0;
    c.life = this._wrange(W.life[0], W.life[1]);
    c.len = this._wrange(W.len[0], W.len[1]) * (gust ? W.gustLen : 1);
    c.wid = this._wrange(W.width[0], W.width[1]);
    c.n = Math.min(this._wper, Math.round(this._wrange(W.per[0], W.per[1]) * (gust ? 1 : W.calmPer)));
    c.ph = this._wr() * TAU;
    c.curl = W.curl * this._wrange(0.4, 1.2);
    c.tone = this._wrange(0.8, 1.12);
    const l = this._wl, g = this._wg;
    for (let j = 0, o = c.i * this._wper * WL; j < c.n; j++, o += WL) {
      // along: thicker in the middle, thinning to single letters at both ends; across: a soft spread
      l[o] = 0.5 * (this._wr() + this._wr()) - 0.5;
      l[o + 1] = (this._wr() + this._wr() + this._wr() - 1.5) / 1.5;
      l[o + 2] = this._wrange(-1, 1);
      // each letter flows at its own pace inside the clump (the clump stretches and comes apart)
      l[o + 3] = this._wrange(-1, 1) * W.flow;
      l[o + 4] = this._wr() * TAU;
      // when it fades in and out of the clump (fractions of the clump's life): nothing pops
      l[o + 5] = this._wrange(0, 0.3);
      l[o + 6] = this._wrange(0.5, 1);
      l[o + 7] = g[Math.floor(this._wr() * g.length)] ?? 0;
      l[o + 8] = this._wrange(0.4, 1);
    }
  }

  /** "Wind drawn in letters": WISPS, thin elongated drifts of many tiny faint letters that ride the air
   *  low over the ground. A few in view in the prevailing breeze; more where a front passes (born in
   *  its band, then carried by the air at their own point, so they slow as it moves on). Each wisp
   *  stretches, curls and thins as it goes; each letter has its own slight path inside it and fades in
   *  and out on its own, so the clump never pops and is never gridded. */
  _wisps(dt) {
    const W = this.T.wisps, L = this.life;
    if (!W || !(W.max > 0) || this._hidden) {
      if (this._wb) this._wispsGo();
      return;
    }
    const b = this._wispBatch();
    if (!b) return;
    const f = L.focus, H = L.hero;
    const fx = Number.isFinite(f.x) ? f.x : 0, fz = Number.isFinite(f.z) ? f.z : 0;
    const rk = L.quality * L.calm * Math.min(1.5, L.k);
    const V = W.view;
    // the prevailing breeze: a few, by how hard it blows now
    const sN = this.T.speed > 0 ? Math.min(1.5, this.speed / this.T.speed) : 0;
    this._wAcc += dt * W.rate * rk * sN;
    for (let tries = 0; this._wAcc >= 1 && tries < 4; tries++) {
      this._wAcc -= 1;
      const x = fx + this._wrange(-V[0], V[0]), z = fz + this._wrange(V[1], V[2]);
      if (Math.abs(x - H.x) < 2 && Math.abs(z - H.z) < 2) continue;
      this._wispBorn(x, z, false);
    }
    if (this._wAcc > 1) this._wAcc = 1;
    // a front: more, born in its band where it passes the view
    for (const F of this.fronts) {
      if (!F.on || F.env < 0.05) continue;
      const sF = fx * F.nx + fz * F.nz;
      if (Math.abs(F.pos - sF) > 30) continue;
      this._wgAcc += dt * W.gust * rk * Math.min(1.5, F.strength) * F.env;
      for (let tries = 0; this._wgAcc >= 1 && tries < 4; tries++) {
        this._wgAcc -= 1;
        const c = (fz * F.nx - fx * F.nz) + this._wrange(-18, 16);
        const back = this._wrange(-1, F.tail * 1.4);
        const e = F.pos + 2.4 * Math.sin(c * 0.07 + F.phase) + 1.1 * Math.sin(c * 0.19 + F.phase * 1.7) - back;
        const x = e * F.nx - c * F.nz, z = e * F.nz + c * F.nx;
        if (Math.abs(x - fx) > V[0] + 2 || z - fz < V[1] || z - fz > V[2]) continue;
        // where the front is weak (between its patches) fewer are born
        const patch = 0.62 + 0.38 * Math.sin(c * 0.11 + F.phase * 2.3);
        if (this._wr() > patch * patch) continue;
        if (Math.abs(x - H.x) < 2 && Math.abs(z - H.z) < 2) continue;
        this._wispBorn(x, z, true);
      }
      if (this._wgAcc > 1) this._wgAcc = 1;
    }
    // the letters this frame
    const U = L.game?.U, R = U?.uCamRight?.value, Up = U?.uCamUp?.value;
    const gy = L.set?.groundY ?? 0, l = this._wl, per = this._wper, col = this._wcol ?? (this._wcol = [0, 0, 0]);
    const hc = W.heroClear, ease = 1 - Math.exp(-dt / W.ease), turn = 1 - Math.exp(-dt / 1.5);
    b.begin();
    for (const c of this._wc) {
      if (!c.on) continue;
      c.age += dt;
      if (c.age >= c.life) {
        c.on = false;
        continue;
      }
      // the air carries it (eased: a wisp is slow to answer), and it turns with the air
      const a = this.at(c.x, c.z, this._w);
      c.vx += (a.x * W.carry - c.vx) * ease;
      c.vz += (a.z * W.carry - c.vz) * ease;
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      const sp = Math.hypot(c.vx, c.vz);
      if (sp > 0.05) {
        c.nx += (c.vx / sp - c.nx) * turn;
        c.nz += (c.vz / sp - c.nz) * turn;
        const n = Math.hypot(c.nx, c.nz) || 1;
        c.nx /= n;
        c.nz /= n;
      }
      const tt = c.age / c.life;
      const env = smooth(0, 0.18, tt) * (1 - smooth(0.6, 1, tt)) * L.calm;
      if (!(env > 0.01)) continue;
      // it stretches and widens as it goes, and its axis bends in a slow wave
      const len = c.len * (1 + W.stretch * tt), wid = c.wid * (1 + W.spread * tt);
      const nx = c.nx, nz = c.nz, px = -nz, pz = nx, t = c.age, st = this._wst;
      // (the screen's right and up of its axis and of its side: a stroke lies along the wisp there)
      const ar = R ? nx * R.x + nz * R.z : 1, au = Up ? nx * Up.x + nz * Up.z : 0;
      const sr = R ? px * R.x + pz * R.z : 0, su = Up ? px * Up.x + pz * Up.z : 1;
      col[0] = W.color[0] * c.tone;
      col[1] = W.color[1] * c.tone;
      col[2] = W.color[2] * c.tone;
      for (let j = 0, o = c.i * per * WL; j < c.n; j++, o += WL) {
        const born = l[o + 5], die = l[o + 6];
        if (tt < born || tt > die) continue;
        const u = l[o], ph = l[o + 4];
        const along = u * len + l[o + 3] * t;
        const arg = along * W.wave + c.ph + t * 0.8;
        const across = l[o + 1] * wid + c.curl * Math.sin(arg) + 0.05 * Math.sin(t * 1.9 + ph);
        const x = c.x + nx * along + px * across, z = c.z + nz * along + pz * across;
        // the ends thin out; each letter fades in and out on its own
        const end = 1 - Math.min(1, 4 * u * u);
        let al = W.alpha * l[o + 8] * env * end * smooth(born, born + 0.12, tt) * (1 - smooth(die - 0.15, die, tt));
        // (a slow shimmer: letters come and go a little as it flows)
        al *= 0.75 + 0.25 * Math.sin(t * 2.3 + ph * 3.1);
        const dx = x - H.x, dz = z - H.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < hc[1]) al *= smooth(hc[0], hc[1], d);
        if (!(al > 0.01)) continue;
        // a stroke ('-') is the one of - / | \ that runs along the wisp where it is on screen
        let g = l[o + 7];
        if (g < 0) {
          const sl = c.curl * W.wave * Math.cos(arg);
          const dr = ar + sr * sl, du = au + su * sl;
          const k = du / (Math.abs(dr) + 1e-4) * (dr < 0 ? -1 : 1);
          g = k > 2.414 || k < -2.414 ? st[2] : k > 0.414 ? st[1] : k < -0.414 ? st[3] : st[0];
        }
        b.put(x, gy + c.y + l[o + 2] * W.rise + 0.06 * Math.sin(t * 1.3 + ph), z, W.size, g, 0, col, al);
      }
    }
    b.end();
  }

  clear(why) {
    // a reset or the Lab hiding the world: what is in the air goes (the prevailing wind stays)
    for (const b of this.bursts) b.on = false;
    if (why === 'hide') {
      for (const F of this.fronts) F.on = false;
      this._wispsGo();
    }
  }

  setVisible(on) {
    this._hidden = !on;
    if (this._wb?.mesh) this._wb.mesh.visible = !!on;
  }

  takes() {
    return false;
  }
}

/** s a front born at a point (a roar's) takes to swell in */
const WIND_BORN_EASE = 0.15;

/** the strokes a '-' of a wisp turns into, by its direction on screen: along, rising, upright, falling */
const STROKES = '-/|\\';

/** fields of one wisp letter: u (along, -0.5..0.5), v (across), w (height), flow (m/s), phase, born, die, glyph, alpha */
const WL = 9;

const WIND_DEFAULT_FRONTS = Object.freeze({ every: [10, 16], strength: [0.7, 1], speed: [5, 6], tail: [8, 12], lead: 2, air: 2, spread: 10, from: 45, to: 60 });
