import { WEATHER_TUNE } from './weatherTuning.js';
import { GlyphParticles } from '../../render/particles.js';
import { gi } from '../../render/glyphs.js';

/** The weather's own letters (mist banks, dust devils): written into the buffers each frame by this
 *  module (soft in and out, carried by the wind every frame); its own update must not age them. */
class WeatherBatch extends GlyphParticles {
  update() {}
}

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
//   (added for the air's sound, audio/air.js)
//   weather.breath   0..1: how far the star's breath is in now (the Obsidian Throne's 'breath' spell)
//   weather.bolt     0..1: the dry lightning's flash against its brightest (weather.flash / bolts.peak max):
//                    far thunder follows a bolt above ~0.35
//   (the spell names the air colours by: 'squall' (ash, embers), 'breath' (starless))
// With the piece off: 'clear', 0, 0, 1 (and flash 0, light 1, breath 0, bolt 0).
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
const smoothE = (u) => smooth(clamp01(u));

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
    this.breath = 0;
    this.bolt = 0;
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
    this._p = { x: 0, z: 0 };
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
    for (let i = 0; i < (this.tune.devils?.max ?? 0); i++) this._devils.push({ i, on: false, x: 0, z: 0, vx: 0, vz: 0, dx: 1, dz: 0, age: 0, life: 1, acc: 0, h: 4, r: 1, ph: 0 });
    this._bolt.next = this.tune.bolts?.first ? this._range(this.tune.bolts.first, this._dr) : this._wait(this.val[P.bolts]);
    if (this.tune.devils?.first) this._devilT = this._range(this.tune.devils.first, this._dr);
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
    this._hold = this._range(this.tune.firstHold ?? s.hold, this._dr);
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
    this.breath = clamp01(v[P.breath]);
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
    if (T.mist?.bank || T.devils) this._batch();
    if (T.mist) this._mist(dt, fx.alpha, rk);
    if (T.rain) this._fall(dt, fx.alpha, T.rain, 'rain', this.wet, rk);
    if (T.grey) this._fall(dt, fx.alpha, T.grey, 'grey', v[P.grey], rk);
    if (T.snow) this._fall(dt, fx.alpha, T.snow, 'snow', v[P.snow], rk);
    if (T.embers) this._embers(dt, fx.add, v[P.embers], rk);
    if (T.devils) this._devilsUpdate(dt, fx.alpha, v[P.devils] * this._pre, L.quality * L.k);
    if (T.bolts) this._bolts(dt, v[P.bolts] * this._pre);
    if (this._bp) this._drawBatch(dt);
    this.bolt = T.bolts ? clamp01(this.flash / Math.max(1e-3, T.bolts.peak[1])) : 0;
    if (T.breath) L.set?.ambience?.breathe?.(clamp01(v[P.breath] * (T.breath.k ?? 1) * L.k));
  }

  /** The piece was switched off (or the level hidden): nothing of it stays. */
  _standDown() {
    this._live = false;
    this._restore();
    this.name = 'clear';
    this.wet = this.mist = this.flash = this.breath = this.bolt = 0;
    this.windK = this.light = 1;
    for (const d of this._devils) d.on = false;
    this._emptyBatch();
    this.life.set?.ambience?.breathe?.(0);
    if (this.tune) this._start();
    this.name = 'clear';
  }

  /** Nothing of the weather's own letters stays (the piece off, the world hidden, a reset). */
  _emptyBatch() {
    for (const b of this._banks ?? []) b.on = false;
    const pool = this._bp;
    if (!pool) return;
    pool.count = 0;
    pool.geometry.instanceCount = 0;
  }

  clear(why) {
    // what is in the air goes with the shared pools; the devils, the banks and a flash go now
    for (const d of this._devils) d.on = false;
    this._emptyBatch();
    this.flash = this.bolt = 0;
    if (why === 'hide') this._restore();
  }

  setVisible(on) {
    this._visible = !!on;
    if (this._bp?.mesh) this._bp.mesh.visible = !!on;
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
    const M = this.tune.mist, v = this.val;
    if (!pool) return;
    const bands = M.bands;
    if (!this._veilAcc) {
      this._veilAcc = new Float64Array(bands.length);
      this._bankAcc = new Float64Array(bands.length);
    }
    for (let i = 0; i < bands.length; i++) {
      const B = bands[i];
      const k = clamp01((v[P[B.key]] ?? 0) * (B.k ?? 1));
      // today's veil, full once the value reaches the band's `veil`; banks above it
      const veil = B.veil > 0 ? Math.min(1, k / B.veil) : 0;
      const bank = B.veil < 1 ? clamp01((k - B.veil) / (1 - B.veil)) : 0;
      if (M.veil) {
        this._veilAcc[i] += dt * M.veil.rate * veil * rk;
        let n = Math.min(4, Math.floor(this._veilAcc[i]));
        this._veilAcc[i] -= Math.floor(this._veilAcc[i]);
        while (n-- > 0) this._veil(pool, M, B);
      }
      if (M.bank) {
        this._bankAcc[i] += dt * M.bank.rate * bank * rk;
        let n = Math.min(2, Math.floor(this._bankAcc[i]));
        this._bankAcc[i] -= Math.floor(this._bankAcc[i]);
        while (n-- > 0) this._bank(M, B);
      }
    }
  }

  /** A point of a mist band in view (or NaN): round the level, thinner in the clearing, off the hero. */
  _mistAt(M, B, r0, r1, out, ring) {
    const f = this.life.focus;
    out.x = NaN;
    let x, z, r;
    if (ring) {
      // (today's veil: a ring round the level, kept if it falls near the view)
      const a = this._fr() * TAU;
      r = r0 + (r1 - r0) * this._fr();
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (Math.abs(x - f.x) > ring[0] || Math.abs(z - f.z) > ring[1]) return out;
    } else {
      // (a bank: a point of the view, kept if it is in the band)
      x = f.x + (this._fr() - 0.5) * 2 * M.view[0];
      z = f.z + M.view[2] + (this._fr() - 0.5) * 2 * M.view[1];
      r = Math.hypot(x, z);
      if (r < r0 || r > r1) return out;
    }
    if (B.inner && this._fr() > (B.innerK + (1 - B.innerK) * clamp01((r - B.inner[0]) / (B.inner[1] - B.inner[0])))) return out;
    if (this._nearHero(x, z, WEATHER_TUNE.heroGap.mist)) return out;
    out.x = x;
    out.z = z;
    return out;
  }

  /** Today's veil: one wide, very faint stroke (the atmosphere's mist, drawn here while it is ours). */
  _veil(pool, M, B) {
    const V = M.veil, p = this._mistAt(M, B, V.r[0], V.r[1], this._p, V.view);
    if (!(p.x === p.x)) return;
    const w = this._air(p.x, p.z, M.carry, M.drift);
    const q = this._resetRec();
    q.x = p.x; q.y = this._range(V.y); q.z = p.z;
    q.vx = w.x * (0.8 + 0.5 * this._fr()); q.vz = w.z + (this._fr() - 0.5) * (M.drift[0] || M.carry ? 0.15 : 0.02);
    q.life = this._range(V.life);
    q.size = this._range(V.size); q.sizeEnd = V.sizeEnd;
    q.glyph = V.glyph;
    q.color = q.colorEnd = V.color;
    q.alpha = V.alpha; q.alphaEnd = 0;
    q.rot = (this._fr() - 0.5) * 0.15;
    pool.spawn(q);
  }

  /** A bank is born: a loose cluster of letters in a free slot of the weather's own batch. */
  _bank(M, B) {
    const K = M.bank;
    let bank = null;
    for (const o of this._banks) if (!o.on) { bank = o; break; }
    if (!bank) return;
    const p = this._mistAt(M, B, B.r[0], B.r[1], this._p);
    if (!(p.x === p.x)) return;
    const w = this._air(p.x, p.z, M.carry, M.drift);
    bank.on = true;
    bank.x = p.x; bank.z = p.z; bank.vx = w.x; bank.vz = w.z;
    bank.y = this._range(B.y);
    bank.age = 0;
    bank.life = this._range(K.life);
    bank.n = Math.min(this._bankPer, Math.round(this._range(K.per)));
    bank.k = 1;
    const L0 = bank.i * this._bankPer;
    for (let j = 0; j < bank.n; j++) {
      // (an ellipse, denser at its heart; a little higher in the middle)
      const a = this._fr() * TAU, r = Math.sqrt(this._fr());
      const l = this._ml[L0 + j];
      l.ox = Math.cos(a) * r * K.spread[0];
      l.oz = Math.sin(a) * r * K.spread[1];
      l.oy = (1 - r) * K.rise * this._fr();
      l.g = this._mg[Math.floor(this._fr() * this._mg.length)];
      l.size = this._range(K.size);
      l.ph = this._fr() * TAU;
      l.a = 0.55 + 0.45 * this._fr() * (1 - 0.5 * r);
    }
  }

  /** The weather's own batch, made on first use (life.build: no Math.random). */
  _batch() {
    if (this._bp !== undefined) return this._bp;
    this._bp = null;
    const T = this.tune, q = Math.max(0.3, Math.min(1, this.life.quality));
    const K = T.mist?.bank, D = T.devils;
    this._bankPer = K ? K.per[1] : 0;
    const nb = K ? Math.max(1, Math.round(K.max * q)) : 0;
    this._banks = [];
    this._ml = [];
    for (let i = 0; i < nb; i++) this._banks.push({ i, on: false, x: 0, y: 1, z: 0, vx: 0, vz: 0, age: 0, life: 1, n: 0, k: 1 });
    for (let i = 0; i < nb * this._bankPer; i++) this._ml.push({ ox: 0, oy: 0, oz: 0, g: 0, size: 0.4, ph: 0, a: 1 });
    this._mg = K ? [...K.glyph].map((c) => gi(c)) : [];
    this._dg = D ? [...D.glyph].map((c) => gi(c)) : [];
    this._dl = [];
    for (let i = 0; D && i < D.max * D.letters; i++) this._dl.push({ u: 0, a: 0, w: 1, r: 1, g: 0, size: 0.4 });
    for (const d of this._devils) if (d.on) this._devilLetters(d);
    const max = nb * this._bankPer + (D ? D.max * D.letters : 0);
    if (!(max > 0)) return null;
    try {
      this._bp = this.life.build(() => new WeatherBatch(this.life.game.U, { max, additive: false }));
      this._bp.mesh.visible = this._visible !== false;
      this.life.game.pipeline?.registerParticles?.(this._bp);
    } catch {
      this._bp = null;
    }
    return this._bp;
  }

  /** One letter into the batch (n: the cursor). */
  _putL(n, x, y, z, size, g, rot, c, a) {
    const pool = this._bp;
    if (!pool || n >= pool.max) return n;
    const P = pool.iPos.array, D = pool.iData.array, C = pool.iColor.array;
    P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z;
    D[n * 4] = size; D[n * 4 + 1] = g; D[n * 4 + 2] = rot; D[n * 4 + 3] = 0;
    C[n * 4] = c[0]; C[n * 4 + 1] = c[1]; C[n * 4 + 2] = c[2]; C[n * 4 + 3] = a;
    return n + 1;
  }

  /** The batch this frame: the mist banks (carried by the air each frame, soft in and out, clear of the
   *  hero) and the dust devils (twisting columns). */
  _drawBatch(dt) {
    const pool = this._bp;
    if (!pool) return;
    const L = this.life, T = this.tune, H = L.hero, t = L.t;
    let n = 0;
    const K = T.mist?.bank, M = T.mist;
    if (K) {
      const hc = K.heroClear;
      for (const b of this._banks) {
        if (!b.on) continue;
        b.age += dt;
        if (b.age >= b.life) { b.on = false; continue; }
        // the air carries it (eased: a bank is slow to turn)
        const w = this._air(b.x, b.z, M.carry, M.drift);
        const e = 1 - Math.exp(-dt / 2);
        b.vx += (w.x - b.vx) * e;
        b.vz += (w.z - b.vz) * e;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        const env = smoothE(b.age / K.fadeIn) * smoothE((b.life - b.age) / K.fadeOut) * L.calm;
        if (!(env > 0.01)) continue;
        const L0 = b.i * this._bankPer;
        for (let j = 0; j < b.n; j++) {
          const l = this._ml[L0 + j];
          const x = b.x + l.ox + Math.sin(t * 0.31 + l.ph) * K.wobble;
          const z = b.z + l.oz + Math.cos(t * 0.23 + l.ph * 1.3) * K.wobble * 0.6;
          let a = K.alpha * l.a * env * (0.8 + 0.2 * Math.sin(t * 0.6 + l.ph));
          const dx = x - H.x, dz = z - H.z, d = Math.sqrt(dx * dx + dz * dz);
          if (d < hc[1]) a *= smoothE((d - hc[0]) / (hc[1] - hc[0]));
          if (!(a > 0.01)) continue;
          n = this._putL(n, x, b.y + l.oy, z, l.size, l.g, 0, K.color, a);
        }
      }
    }
    if (T.devils) n = this._drawDevils(n);
    pool.count = n;
    pool.geometry.instanceCount = n;
    pool.iPos.needsUpdate = pool.iData.needsUpdate = pool.iColor.needsUpdate = true;
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
      // (a squall carries them across the whole yard: never slower than `min` along the wind)
      const ws = Math.hypot(w.x, w.z);
      if (E.min && ws < E.min) {
        w.x = ws > 1e-3 ? (w.x / ws) * E.min : dx * E.min;
        w.z = ws > 1e-3 ? (w.z / ws) * E.min : dz * E.min;
      }
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
    // (an even spread round the mean: an exponential's long tail left minutes with nothing)
    return (60 / perMin) * (0.4 + 1.2 * this._dr());
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
        for (let tries = 0; tries < (D.tries ?? 6); tries++) {
          const up = this._range(D.upwind, this._dr), side = (D.south ?? 0) + (this._dr() - 0.5) * 2 * D.across;
          const x0 = f.x - dx * up - dz * side, z0 = f.z - dz * up + dx * side;
          // its whole path must stay off the ring (and its kerb)
          let ok = true;
          for (let s = 0; s <= 10 && ok; s++) {
            const t = (s / 10) * life, x = x0 + dx * sp * t, z = z0 + dz * sp * t;
            if (Math.abs(x) < K && Math.abs(z) < K) ok = false;
            // (and it never crosses the hero: it would hide him)
            else if (Math.hypot(x - L.hero.x, z - L.hero.z) < (D.heroGap ?? 0)) ok = false;
          }
          if (!ok) continue;
          d.on = true; d.x = x0; d.z = z0; d.vx = dx * sp; d.vz = dz * sp; d.age = 0; d.life = life; d.acc = 0;
          d.h = this._range(D.height, this._dr); d.r = this._range(D.radius, this._dr); d.ph = this._dr() * TAU;
          d.dx = dx; d.dz = dz;
          if (this._dl) this._devilLetters(d);
          break;
        }
      }
    }
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
      d.dx = dx;
      d.dz = dz;
    }
  }

  /** A devil's letters are born with it: each its height, angle and turn. */
  _devilLetters(d) {
    const D = this.tune.devils, j0 = d.i * D.letters;
    for (let j = 0; j < D.letters; j++) {
      const l = this._dl[j0 + j];
      l.u = this._fr();
      l.a = this._fr() * TAU;
      l.w = D.swirl * (0.7 + 0.6 * this._fr());
      l.r = 0.75 + 0.5 * this._fr();
      l.g = this._dg[Math.floor(this._fr() * this._dg.length)];
      l.size = this._range(D.size);
    }
  }

  /** The devils into the batch: twisting columns of pale dust letters, a funnel leaning downwind, soft
   *  as they gather and fall apart, gone with the fight. */
  _drawDevils(n) {
    const D = this.tune.devils, L = this.life, gy = L.set?.groundY ?? 0;
    for (const d of this._devils) {
      if (!d.on) continue;
      const env = smoothE(d.age / D.fadeIn) * smoothE((d.life - d.age) / D.fadeOut) * this._pre;
      if (!(env > 0.01)) continue;
      const j0 = d.i * D.letters;
      for (let j = 0; j < D.letters; j++) {
        const l = this._dl[j0 + j];
        const u = (l.u + d.age * D.rise / d.h) % 1;
        const a = l.a + d.age * l.w * (1.6 - 0.8 * u);
        const r = (d.r * 0.35 + d.r * Math.pow(u, 1.3)) * l.r;
        const lean = u * d.h * D.lean;
        const x = d.x + Math.cos(a) * r + (d.dx ?? 1) * lean;
        const z = d.z + Math.sin(a) * r * 0.8 + (d.dz ?? 0) * lean;
        const al = D.alpha * env * smoothE(u / 0.08) * Math.pow(1 - u, 0.5);
        if (!(al > 0.01)) continue;
        n = this._putL(n, x, gy + 0.15 + u * d.h, z, l.size, l.g, 0, D.color, al);
      }
    }
    return n;
  }

  /** Dry lightning far off: a flash for a frame or two (weather.flash; the Ring's ambience shows it). */
  _bolts(dt, perMin) {
    const B = this.tune.bolts, b = this._bolt;
    b.next -= dt;
    if (b.next <= 0) {
      b.next = this._wait(perMin);
      if (perMin > 0.05 && this._preNow) {
        b.want = Math.max(b.want ?? 0, this._range(B.peak, this._dr) * this.life.k);
        b.again = this._dr() < B.double ? this._range(B.gap, this._dr) : -1;
      }
    }
    if (b.again > 0) {
      b.again -= dt;
      if (b.again <= 0) b.want = Math.max(b.want ?? 0, this._range(B.peak, this._dr) * 0.7 * this.life.k);
    }
    // a soft rise (B.rise /s) toward what the bolt wants, and a slower fall
    b.want = (b.want ?? 0) > 0.002 ? b.want * Math.exp(-dt * B.decay) : 0;
    this.flash += (b.want - this.flash) * (1 - Math.exp(-dt * (B.rise ?? 30)));
    if (this.flash < 0.002 && b.want === 0) this.flash = 0;
    // (the fight's own storm takes over the sky: not a flicker of ours in it)
    if (!this._preNow) {
      this.flash = b.want = 0;
      b.again = -1;
    }
  }
}
