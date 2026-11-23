import { WEATHER_TUNE } from './weatherTuning.js';

// THE WEATHER (piece 'weather'): a level's slow spells, one mood per level that breathes.
//
//   weather.name     the spell now: a level's own names ('clear', 'mist', 'drizzle', 'squall', ...)
//   weather.wet      0..1: rain falling now (the air's sound, a footstep's splash)
//   weather.mist     0..1: how thick the low mist is now
//   weather.windK    what the weather asks of the wind: its strength is multiplied by this (1 = none)
//   (added)
//   weather.flash    0..~0.15: dry lightning far off this frame (the Skybreak Ring's ambience adds it to
//                    its sky)
//   weather.light    the moonlight factor now (1 = untouched)
//   weather.spell    the spell the director is heading for (name changes to it half way in)
//   weather.force(name, fade)   start a spell now (the Lab's buttons; fade in s, default the spell's own)
// With the piece off: 'clear', 0, 0, 1 (and flash 0, light 1).
//
// THE DIRECTOR. Per level a list of spells (weatherTuning.js), each with a hold, a fade and what may
// follow. A visit starts in the level's calm spell (the same every attempt: the director has its own
// random stream, seeded once from life.rand(), so nothing else the world draws can move it). A new spell
// cross-fades in over tens of seconds (a smoothstep: its values move continuously and slowly, nobody can
// say when it began). In the fight (life.calm < 1) no new spell starts and the director eases back to
// the calm spell; what falls and drifts thins by calm.
//
// THE LIGHT AND THE FOG. The weather never sets a uniform to a value of its own: it multiplies whatever
// the base is this frame by its factors (moon, ambient, fogNear, fogFar, fogColor) and takes its factor
// off again at the start of its next update. Before multiplying it restores what it wrote last frame,
// but only where the uniform still holds exactly what it wrote: a value another system wrote meanwhile
// is that system's new base and is left alone. It stands aside (restores and writes nothing) while the
// atmosphere's sky glow is on (that one saves and restores the colours itself), in a level whose own
// ambience writes the light every frame (`sky: false`: the Ring), whenever all its factors are 1, and
// whenever the piece is off. So with the piece off the uniforms are never touched.

const TAU = Math.PI * 2;
const FIGHT = new Set(['bossIntro', 'boss']);
/** the values a spell carries (weatherTuning.js); the factors default to 1, the rest to 0 */
const PARAMS = ['mist', 'foot', 'wet', 'windK', 'moon', 'ambient', 'fogNear', 'fogFar', 'fogColor', 'embers', 'grey', 'breath', 'devils', 'bolts', 'snow'];
const FACTORS = new Set(['windK', 'moon', 'ambient', 'fogNear', 'fogFar', 'fogColor']);
const P = Object.fromEntries(PARAMS.map((p, i) => [p, i]));
const SKY = ['moon', 'ambient', 'fogNear', 'fogFar', 'fogColor'].map((p) => P[p]);

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Weather {
  constructor(life) {
    this.life = life;
    this.name = 'clear';
    this.wet = 0;
    this.mist = 0;
    this.windK = 1;
    this.flash = 0;
    this.light = 1;
    this.spell = 'clear';
    const T = life.enabled ? WEATHER_TUNE[life.levelId] : null;
    this.tune = T && T.spells && T.spells[T.calm] ? T : null;
    this._live = false;
    // the eased values, and the cross-fade's ends
    this.val = new Float64Array(PARAMS.length);
    this._from = new Float64Array(PARAMS.length);
    this._to = new Float64Array(PARAMS.length);
    for (const p of PARAMS) this.val[P[p]] = FACTORS.has(p) ? 1 : 0;
    // the uniforms: the base under the weather's factors and what it wrote (restore only what is still ours)
    this._sky = { on: false, base: new Float64Array(11), mine: new Float64Array(11) };
    // the scratch records (no allocation per frame)
    this._w = { x: 0, z: 0, k: 0 };
    this._rec = {};
    this._resetRec();
    this._devils = [];
    this._bolt = { next: 0, again: -1 };
    if (!this.tune) return;
    const T2 = this.tune;
    this.option = life.set?.option ?? null;
    /** the spells this page can have (one that needs a set option this page does not have is left out) */
    this.spells = {};
    for (const [name, s] of Object.entries(T2.spells)) {
      if (s.option && s.option !== this.option) continue;
      const v = new Float64Array(PARAMS.length);
      for (const p of PARAMS) v[P[p]] = Number.isFinite(s[p]) ? s[p] : FACTORS.has(p) ? 1 : 0;
      // (snow only where the set has the snow)
      if (T2.snow?.option && T2.snow.option !== this.option) v[P.snow] = 0;
      this.spells[name] = { name, hold: s.hold ?? [60, 90], fade: s.fade ?? [30, 40], next: s.next ?? [[T2.calm, 1]], v };
    }
    // the director's own stream (seeded once: what else draws from life.rand never moves the sequence),
    // and the drawing's (how many letters fall depends on the phone's quality: it must not move the director)
    this._ds = (Math.floor(life.rand() * 4294967296) ^ 0x9e3779b9) >>> 0;
    this._fs = (Math.floor(life.rand() * 4294967296) ^ 0x7f4a7c15) >>> 0;
    this._start();
    for (let i = 0; i < (this.tune.devils?.max ?? 0); i++) this._devils.push({ on: false, x: 0, z: 0, vx: 0, vz: 0, age: 0, life: 1, acc: 0, h: 4, r: 1, ph: 0 });
    this._bolt.next = this._wait(this.val[P.bolts]);
    this._acc = { mist: 0, foot: 0, rain: 0, embers: 0, grey: 0, snow: 0 };
    this._pre = 1;
    for (const name of Object.keys(this.spells)) {
      life.action(`${name} now`, () => this.force(name, WEATHER_TUNE.labFade), `weather: ease into '${name}' over ${WEATHER_TUNE.labFade} s`);
    }
  }

  // ---- the director -------------------------------------------------------------------------------

  _dr() {
    this._ds = (Math.imul(this._ds, 1664525) + 1013904223) >>> 0;
    return this._ds / 4294967296;
  }

  _fr() {
    this._fs = (Math.imul(this._fs, 1664525) + 1013904223) >>> 0;
    return this._fs / 4294967296;
  }

  _range(r, f = this._fr) {
    return r[0] + (r[1] - r[0]) * f.call(this);
  }

  /** The visit begins in the calm spell, at once. */
  _start() {
    const s = this.spells[this.tune.calm];
    this.val.set(s.v);
    this._from.set(s.v);
    this._to.set(s.v);
    this._cur = s;
    this._u = 1;
    this._fade = 1;
    this._hold = this._range(s.hold, this._dr);
    this.name = this.spell = s.name;
    s.seen = this.life.t;
  }

  /** Head for a spell: from the values now, over `fade` s. */
  _go(s, fade) {
    this._from.set(this.val);
    this._to.set(s.v);
    this._cur = s;
    this._u = 0;
    this._fade = Math.max(1, Number.isFinite(fade) ? fade : this._range(s.fade, this._dr));
    this._hold = this._range(s.hold, this._dr);
    this.spell = s.name;
    s.seen = this.life.t;
  }

  /** What follows: by the spell's weights, a spell not seen for a while weighing more (so a visit sees
   *  them all, without a fixed order). */
  _weight(n, w) {
    const s = this.spells[n];
    if (!s) return 0;
    return w * (1 + Math.max(0, this.life.t - (s.seen ?? 0)) / WEATHER_TUNE.longing);
  }

  _pick() {
    const list = this._cur.next;
    let sum = 0;
    for (const [n, w] of list) sum += this._weight(n, w);
    if (!(sum > 0)) return this.spells[this.tune.calm];
    let r = this._dr() * sum;
    for (const [n, w] of list) {
      const x = this._weight(n, w);
      if (!(x > 0)) continue;
      r -= x;
      if (r <= 0) return this.spells[n];
    }
    return this.spells[this.tune.calm];
  }

  /** Start a spell now (the Lab). */
  force(name, fade) {
    const s = this.spells?.[name];
    if (!s) return false;
    this._go(s, fade);
    return true;
  }

  _direct(dt) {
    const L = this.life;
    const fight = L.calm < WEATHER_TUNE.fightCalm || FIGHT.has(L.game?.state);
    const calm = this.spells[this.tune.calm];
    if (fight && this._cur !== calm) this._go(calm);
    if (this._u < 1) {
      this._u = Math.min(1, this._u + dt / this._fade);
    } else if (!fight) {
      this._hold -= dt;
      if (this._hold <= 0) this._go(this._pick());
    }
    const s = smooth(this._u), v = this.val, a = this._from, b = this._to;
    for (let i = 0; i < v.length; i++) v[i] = a[i] + (b[i] - a[i]) * s;
    if (this._u >= 0.5) this.name = this.spell;
  }

  // ---- the light and the fog ----------------------------------------------------------------------

  /** Take the weather's factor off the uniforms (only where they still hold what it wrote). */
  _restore() {
    const S = this._sky, U = this.life.game?.U;
    if (!S.on) return;
    S.on = false;
    if (!U) return;
    const b = S.base, m = S.mine;
    this._unput(U.uMoonColor, 0);
    this._unput(U.uAmbient, 3);
    this._unput(U.uFogColor, 6);
    if (U.uFogNear && U.uFogNear.value === m[9]) U.uFogNear.value = b[9];
    if (U.uFogFar && U.uFogFar.value === m[10]) U.uFogFar.value = b[10];
  }

  _unput(u, i) {
    const c = u?.value, b = this._sky.base, m = this._sky.mine;
    if (c && c.r === m[i] && c.g === m[i + 1] && c.b === m[i + 2]) c.setRGB(b[i], b[i + 1], b[i + 2]);
  }

  _put(u, i, k) {
    const c = u.value, b = this._sky.base, m = this._sky.mine;
    b[i] = c.r; b[i + 1] = c.g; b[i + 2] = c.b;
    c.setRGB(c.r * k, c.g * k, c.b * k);
    m[i] = c.r; m[i + 1] = c.g; m[i + 2] = c.b;
  }

  _applySky() {
    this._restore();
    const U = this.life.game?.U;
    const v = this.val;
    this.light = v[P.moon];
    if (this.tune.sky === false || !U?.uMoonColor?.value || !U.uAmbient?.value || !U.uFogColor?.value || !U.uFogNear || !U.uFogFar) return;
    let idle = true;
    for (const i of SKY) if (Math.abs(v[i] - 1) > WEATHER_TUNE.idle) idle = false;
    if (idle) return;
    // the atmosphere's sky glow saves and restores the colours itself: stand aside while it is on
    const atm = this.life.world?.atmosphere;
    if (atm && (atm.glow > 0 || atm._glowWant > 0)) return;
    const S = this._sky, b = S.base, m = S.mine;
    this._put(U.uMoonColor, 0, v[P.moon]);
    this._put(U.uAmbient, 3, v[P.ambient]);
    this._put(U.uFogColor, 6, v[P.fogColor]);
    b[9] = U.uFogNear.value;
    b[10] = U.uFogFar.value;
    U.uFogNear.value = b[9] * v[P.fogNear];
    U.uFogFar.value = Math.max(U.uFogNear.value + 1, b[10] * v[P.fogFar]);
    m[9] = U.uFogNear.value;
    m[10] = U.uFogFar.value;
    S.on = true;
  }

  // ---- the frame ----------------------------------------------------------------------------------

  update(dt) {
    const L = this.life;
    if (!this.tune || !L.on('weather')) {
      if (this._live) this._standDown();
      return;
    }
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    dt = Math.min(dt, 0.1);
    this._live = true;
    this._direct(dt);
    const v = this.val;
    this.wet = clamp01(v[P.wet]);
    this.mist = clamp01(v[P.mist]);
    this.windK = Number.isFinite(v[P.windK]) ? v[P.windK] : 1;
    this._applySky();
    // before the fight (the Ring's devils and far lightning): eases out fast once the boss is up
    const g = L.game;
    const pre = !FIGHT.has(g?.state) && (g?.dragon?.phase ?? 1) <= 1 ? 1 : 0;
    this._preNow = pre;
    this._pre += (pre - this._pre) * (1 - Math.exp(-dt / (pre ? 4 : 0.6)));
    if (this._pre < 0.002) this._pre = 0;
    const fx = g?.fx;
    if (!fx) return;
    const T = this.tune;
    // what the drawing scales by: the phone, the strength, the fight
    const rk = L.quality * L.k * L.calm;
    if (T.mist) this._mist(dt, fx.alpha, rk);
    if (T.rain) this._fall(dt, fx.alpha, T.rain, 'rain', this.wet, rk);
    if (T.grey) this._fall(dt, fx.alpha, T.grey, 'grey', v[P.grey], rk);
    if (T.snow) this._fall(dt, fx.alpha, T.snow, 'snow', v[P.snow], rk);
    if (T.embers) this._embers(dt, fx.add, v[P.embers], rk);
    if (T.devils) this._devilsUpdate(dt, fx.alpha, v[P.devils] * this._pre, L.quality * L.k);
    if (T.bolts) this._bolts(dt, v[P.bolts] * this._pre);
    if (T.breath) L.set?.ambience?.breathe?.(clamp01(v[P.breath] * (T.breath.k ?? 1) * L.k));
  }

  /** The piece was switched off (or the level hidden): nothing of it stays. */
  _standDown() {
    this._live = false;
    this._restore();
    this.name = 'clear';
    this.wet = this.mist = this.flash = 0;
    this.windK = this.light = 1;
    for (const d of this._devils) d.on = false;
    this.life.set?.ambience?.breathe?.(0);
    if (this.tune) this._start();
    this.name = 'clear';
  }

  clear(why) {
    // what is in the air goes with the shared pools; the devils and a flash go now
    for (const d of this._devils) d.on = false;
    this.flash = 0;
    if (why === 'hide') this._restore();
  }

  setVisible(on) {
    if (!on) {
      for (const d of this._devils) d.on = false;
      this.flash = 0;
    }
  }

  takes(what) {
    // the low mist of a level with mist of its own (the default atmosphere's levels)
    return what === 'mist' && !!this.tune?.mist;
  }

  // ---- the drawing --------------------------------------------------------------------------------

  _resetRec() {
    const r = this._rec;
    r.x = r.y = r.z = r.vx = r.vy = r.vz = 0;
    r.life = 1; r.size = 0.2; r.sizeEnd = 0.2;
    r.color = r.colorEnd = null;
    r.alpha = 1; r.alphaEnd = 0; r.glyph = '.';
    r.rot = r.spin = r.drag = r.gravity = r.flicker = r.stretch = 0;
    return r;
  }

  /** The air at a point: the wind's when it blows, else the level's quiet drift (× windK). */
  _air(x, z, carry, drift) {
    const L = this.life, w = this._w;
    if (L.on('wind') && !L.wind?.still) {
      L.wind.at(x, z, w);
      w.x *= carry;
      w.z *= carry;
    } else if (L.wind?.still) {
      w.x = w.z = 0;
    } else {
      w.x = drift[0] * this.windK;
      w.z = drift[1] * this.windK;
    }
    if (!Number.isFinite(w.x + w.z)) w.x = w.z = 0;
    return w;
  }

  _nearHero(x, z, r) {
    const h = this.life.hero;
    const dx = x - h.x, dz = z - h.z;
    return dx * dx + dz * dz < r * r;
  }

  /** The low mist: bands of wide faint strokes round the level, drifting with the air. */
  _mist(dt, pool, rk) {
    const M = this.tune.mist, f = this.life.focus, v = this.val;
    if (!pool) return;
    for (const B of M.bands) {
      const k = (v[P[B.key]] ?? 0) * (B.k ?? 1);
      const acc = this._acc[B.key] = (this._acc[B.key] ?? 0) + dt * M.rate * k * rk;
      if (acc < 1) continue;
      let n = Math.min(8, Math.floor(acc));
      this._acc[B.key] = acc - Math.floor(acc);
      while (n-- > 0) {
        const a = this._fr() * TAU, r = this._range(B.r);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x - f.x) > M.view[0] || Math.abs(z - f.z) > M.view[1]) continue;
        // thinner in the clearing than in the tree line
        if (B.inner && this._fr() > (B.innerK + (1 - B.innerK) * clamp01((r - B.inner[0]) / (B.inner[1] - B.inner[0])))) continue;
        if (this._nearHero(x, z, WEATHER_TUNE.heroGap.mist)) continue;
        const w = this._air(x, z, M.carry, M.drift);
        const q = this._resetRec();
        const wob = M.wobble ?? 0.15;
        q.x = x; q.y = this._range(B.y); q.z = z;
        q.vx = w.x * (0.8 + 0.4 * this._fr()) + (this._fr() - 0.5) * wob;
        q.vz = w.z * (0.8 + 0.4 * this._fr()) + (this._fr() - 0.5) * wob;
        q.life = this._range(M.life);
        q.size = this._range(M.size);
        q.sizeEnd = M.sizeEnd;
        q.glyph = M.glyph;
        q.color = q.colorEnd = M.color;
        q.alpha = M.alpha;
        q.alphaEnd = 0;
        q.rot = (this._fr() - 0.5) * 0.15;
        pool.spawn(q);
      }
    }
  }

  /** Things that fall over the view: the drizzle, the grey-out's ash, the snow. */
  _fall(dt, pool, F, key, k, rk) {
    if (!pool || !(k > 0.001)) {
      this._acc[key] = 0;
      return;
    }
    const acc = (this._acc[key] += dt * F.rate * k * rk);
    if (acc < 1) return;
    let n = Math.min(24, Math.floor(acc));
    this._acc[key] = acc - Math.floor(acc);
    const f = this.life.focus, gy = this.life.set?.groundY ?? 0;
    while (n-- > 0) {
      const x = f.x + (this._fr() - 0.5) * F.area[0];
      const z = f.z + (this._fr() - 0.5) * F.area[1] - 3;
      const y = this._range(F.y);
      const fall = this._range(F.fall);
      const w = this._air(x, z, F.carry, F.drift);
      const t = Math.max(0.2, y / fall);
      // (where it lands: keep it off the hero)
      if (this._nearHero(x + w.x * t, z + w.z * t, WEATHER_TUNE.heroGap.fall)) continue;
      const q = this._resetRec();
      q.x = x; q.y = gy + y; q.z = z;
      q.vx = w.x; q.vy = -fall; q.vz = w.z;
      q.life = F.life ? Math.min(t, this._range(F.life)) : t;
      q.size = q.sizeEnd = F.size;
      q.glyph = F.glyph;
      q.color = F.color;
      q.colorEnd = F.colorEnd ?? F.color;
      q.alpha = F.alpha;
      q.alphaEnd = F.alphaEnd ?? 0;
      if (F.stretch) {
        // a streak along its fall as the camera sees it (58 degrees down: a fall shows at ~0.53, z at ~0.85)
        q.stretch = F.stretch;
        q.rot = Math.atan2(w.x, fall * 0.53 + w.z * 0.85);
      } else {
        q.spin = (this._fr() - 0.5) * (F.spin ?? 0);
        q.rot = this._fr() * TAU;
      }
      pool.spawn(q);
    }
  }

  /** The ember squall: embers lifted upwind of the view and carried across it in a loose stream. */
  _embers(dt, pool, k, rk) {
    const E = this.tune.embers;
    if (!pool || !(k > 0.001)) {
      this._acc.embers = 0;
      return;
    }
    const acc = (this._acc.embers += dt * E.rate * k * rk);
    if (acc < 1) return;
    let n = Math.min(12, Math.floor(acc));
    this._acc.embers = acc - Math.floor(acc);
    const L = this.life, f = L.focus;
    const dx = L.on('wind') && L.wind.speed > 0 ? L.wind.dirX : 1, dz = L.on('wind') && L.wind.speed > 0 ? L.wind.dirZ : 0;
    // the stream's line wanders slowly across the yard
    const mid = Math.sin(L.t * E.wander[1]) * E.wander[0];
    while (n-- > 0) {
      const up = this._range(E.upwind), side = mid + (this._fr() - 0.5) * 2 * E.band;
      const x = f.x - dx * up - dz * side, z = f.z - 3 - dz * up + dx * side;
      const w = this._air(x, z, E.carry, E.drift);
      const q = this._resetRec();
      q.x = x; q.y = this._range(E.y); q.z = z;
      q.vx = w.x * (0.75 + 0.5 * this._fr()); q.vz = w.z * (0.75 + 0.5 * this._fr());
      q.vy = this._range(E.rise);
      q.gravity = E.gravity;
      q.drag = E.drag;
      q.life = this._range(E.life);
      q.size = E.size; q.sizeEnd = E.sizeEnd;
      q.glyph = E.glyph;
      q.color = E.color; q.colorEnd = E.colorEnd;
      q.alpha = 1; q.alphaEnd = 0;
      q.flicker = E.flicker;
      pool.spawn(q);
    }
  }

  /** Waiting time to the next event at `perMin` a minute (an exponential gap, from the director's stream). */
  _wait(perMin) {
    if (!(perMin > 0.01)) return 30;
    return Math.min(120, -Math.log(1 - this._dr() * 0.999) * 60 / perMin);
  }

  /** Dust devils crossing the badlands with the wind, never onto the ring. */
  _devilsUpdate(dt, pool, perMin, rk) {
    const D = this.tune.devils, L = this.life, f = L.focus;
    const windOn = L.on('wind') && L.wind.speed > 0;
    const dx = windOn ? L.wind.dirX : 1, dz = windOn ? L.wind.dirZ : 0;
    const sp = (windOn ? L.wind.speed * D.carry : D.speed) * this.windK;
    // a new one now and then
    this._devilT = (this._devilT ?? this._wait(perMin)) - dt;
    if (this._devilT <= 0) {
      this._devilT = this._wait(perMin);
      let d = null;
      if (perMin > 0.05) for (const o of this._devils) if (!o.on) { d = o; break; }
      if (d) {
        const life = this._range(D.life, this._dr), K = D.keepOut;
        for (let tries = 0; tries < 6; tries++) {
          const up = this._range(D.upwind, this._dr), side = (this._dr() - 0.5) * 2 * D.across;
          const x0 = f.x - dx * up - dz * side, z0 = f.z - dz * up + dx * side;
          // its whole path must stay off the ring (and its kerb)
          let ok = true;
          for (let s = 0; s <= 10 && ok; s++) {
            const t = (s / 10) * life, x = x0 + dx * sp * t, z = z0 + dz * sp * t;
            if (Math.abs(x) < K && Math.abs(z) < K) ok = false;
          }
          if (!ok) continue;
          d.on = true; d.x = x0; d.z = z0; d.vx = dx * sp; d.vz = dz * sp; d.age = 0; d.life = life; d.acc = 0;
          d.h = this._range(D.height, this._dr); d.r = this._range(D.radius, this._dr); d.ph = this._dr() * TAU;
          break;
        }
      }
    }
    if (!pool) return;
    const gy = L.set?.groundY ?? 0;
    for (const d of this._devils) {
      if (!d.on) continue;
      d.age += dt;
      if (d.age >= d.life) {
        d.on = false;
        continue;
      }
      // it wanders a little across its way
      const wob = Math.sin(d.age * 0.7 + d.ph) * 0.4;
      d.x += (d.vx - dz * wob) * dt;
      d.z += (d.vz + dx * wob) * dt;
      // it gathers and falls apart (and stands down with the fight)
      const env = Math.sin(Math.PI * d.age / d.life) * (this._pre > 0 ? 1 : 0);
      d.acc += dt * D.rate * env * rk;
      let n = Math.min(10, Math.floor(d.acc));
      d.acc -= Math.floor(d.acc);
      while (n-- > 0) {
        const h = d.h * Math.pow(this._fr(), 0.8);
        const a = this._fr() * TAU, r = d.r * (0.5 + 0.5 * this._fr()) * (0.6 + 0.6 * h / d.h);
        const c = Math.cos(a), s = Math.sin(a);
        const q = this._resetRec();
        q.x = d.x + c * r; q.y = gy + 0.1 + h; q.z = d.z + s * r;
        // round the column, rising, carried with it
        q.vx = -s * D.swirl + d.vx; q.vz = c * D.swirl + d.vz;
        q.vy = this._range(D.rise);
        q.drag = 0.6;
        q.life = this._range(D.partLife);
        q.size = this._range(D.size); q.sizeEnd = q.size * 0.6;
        q.glyph = D.glyph;
        q.color = D.color; q.colorEnd = D.colorEnd;
        q.alpha = D.alpha * (0.7 + 0.3 * env); q.alphaEnd = 0;
        q.spin = (this._fr() - 0.5) * 3;
        pool.spawn(q);
      }
    }
  }

  /** Dry lightning far off: a flash for a frame or two (weather.flash; the Ring's ambience shows it). */
  _bolts(dt, perMin) {
    const B = this.tune.bolts, b = this._bolt;
    b.next -= dt;
    if (b.next <= 0) {
      b.next = this._wait(perMin);
      if (perMin > 0.05 && this._preNow) {
        this.flash = Math.max(this.flash, this._range(B.peak, this._dr) * this.life.k);
        b.again = this._dr() < B.double ? this._range(B.gap, this._dr) : -1;
      }
    }
    if (b.again > 0) {
      b.again -= dt;
      if (b.again <= 0) this.flash = Math.max(this.flash, this._range(B.peak, this._dr) * 0.7 * this.life.k);
    }
    this.flash = this.flash > 0.002 ? this.flash * Math.exp(-dt * B.decay) : 0;
    // (the fight's own storm takes over the sky: not a flicker of ours in it)
    if (!this._preNow) {
      this.flash = 0;
      b.again = -1;
    }
  }
}
