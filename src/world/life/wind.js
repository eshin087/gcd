import { WIND_TUNE, WIND_DEFAULT, WIND_LULL, WIND_BURST, WIND_HUSH } from './windTuning.js';
import { WIND_SLOTS } from '../../render/shaderLib.js';

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
    // the streaks: a reused spawn record, and when each live one dies (to keep inside `max`)
    this._streak = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.22, sizeEnd: 0.22, glyph: '-',
      color: [0.15, 0.18, 0.19], colorEnd: [0.15, 0.18, 0.19], alpha: 0.38, alphaEnd: 0, rot: 0, drag: 0,
    };
    this._streakDie = new Float32Array(Math.max(1, T.streaks.max | 0));
    this._streakAcc = 0;
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
    this._streaks(dt);
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
    A[WIND_SLOTS * 2 + 2]?.set(G.lean, G.wave, G.front, G.lift);
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
    this._streakDie.fill(0);
    const fire = this.life.game?.fx?.fire;
    if (fire && fire.wind === this) fire.wind = null;
  }

  /** A few short strokes riding each front low over the ground, round the camera's focus. */
  _streaks(dt) {
    const S = this.T.streaks, L = this.life, fx = L.game?.fx?.alpha;
    if (!fx || !(S.rate > 0) || !(S.max > 0) || this._hidden) return;
    const t = this._t, die = this._streakDie, f = L.focus;
    const fxF = Number.isFinite(f.x) ? f.x : 0, fzF = Number.isFinite(f.z) ? f.z : 0;
    const rate = S.rate * L.quality * L.calm * Math.min(1.5, L.k);
    for (const F of this.fronts) {
      if (!F.on || F.env < 0.05) continue;
      // only while its edge is near the view
      const sF = fxF * F.nx + fzF * F.nz;
      if (Math.abs(F.pos - sF) > 32) continue;
      this._streakAcc += dt * rate * F.strength * F.env;
      while (this._streakAcc >= 1) {
        this._streakAcc -= 1;
        let slot = -1;
        for (let i = 0; i < die.length; i++) {
          if (die[i] <= t) {
            slot = i;
            break;
          }
        }
        if (slot < 0) {
          this._streakAcc = 0;
          break;
        }
        // a point on the edge, in view, just behind it
        const c = (fxF * F.nz * -1 + fzF * F.nx) + L.range(-24, 24);
        const e = F.pos + 2.4 * Math.sin(c * 0.07 + F.phase) + 1.1 * Math.sin(c * 0.19 + F.phase * 1.7) - L.range(0, 2.5);
        // (x, z) from (s = e, c): s = x nx + z nz, c = nx z - nz x
        const x = e * F.nx - c * F.nz, z = e * F.nz + c * F.nx;
        if (Math.abs(x - fxF) > 26 || Math.abs(z - fzF) > 20) continue;
        // where the front is weak (a patch between gusts) fewer ride it
        const patch = 0.62 + 0.38 * Math.sin(c * 0.11 + F.phase * 2.3);
        if (L.rand() > patch) continue;
        // and never over the hero
        const h = L.hero;
        if (Math.abs(x - h.x) < 1.4 && Math.abs(z - h.z) < 1.4) continue;
        const r = this._streak, life = L.range(S.life[0], S.life[1]);
        const v = F.speed * L.range(0.85, 1.1);
        r.x = x;
        r.y = L.range(0.12, 0.55);
        r.z = z;
        r.vx = F.nx * v;
        r.vy = L.range(-0.05, 0.12);
        r.vz = F.nz * v;
        r.life = life;
        r.size = r.sizeEnd = L.range(S.size[0], S.size[1]);
        r.glyph = S.glyph;
        r.color[0] = r.colorEnd[0] = S.color[0];
        r.color[1] = r.colorEnd[1] = S.color[1];
        r.color[2] = r.colorEnd[2] = S.color[2];
        r.alpha = S.alpha * F.env;
        r.rot = L.range(-0.12, 0.12);
        if (fx.spawn(r) >= 0) die[slot] = t + life;
      }
    }
  }

  clear(why) {
    // a reset or the Lab hiding the world: what is in the air goes (the prevailing wind stays)
    for (const b of this.bursts) b.on = false;
    if (why === 'hide') {
      for (const F of this.fronts) F.on = false;
      this._streakDie.fill(0);
    }
  }

  setVisible(on) {
    this._hidden = !on;
  }

  takes() {
    return false;
  }
}

/** s a front born at a point (a roar's) takes to swell in */
const WIND_BORN_EASE = 0.15;

const WIND_DEFAULT_FRONTS = Object.freeze({ every: [10, 16], strength: [0.7, 1], speed: [5, 6], tail: [8, 12], lead: 2, air: 2, spread: 10, from: 45, to: 60 });
