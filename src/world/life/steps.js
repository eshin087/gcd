import { GlyphParticles } from '../../render/particles.js';
import { CONFIG } from '../../core/config.js';
import { STEPS } from './stepsTuning.js';
import { bendLook } from '../grassTrail.js';
import { dragonLook } from '../../render/dragonPrint.js';
import { DP_STEP_U, DP_STEPS } from '../../render/dragonStep.js';

/** The prints' look (`?prints=a`: the matrix flash, STEPS.flash; '0' the prints before). */
export const printLook = () => (dragonLook('prints') === 'a' ? 'a' : '0');

// THE STEPS (piece 'steps'): a footstep answers the surface it lands on (stepsTuning.js has every number).
//
//   steps.surfaceAt(x, z)     what the ground is there: one of SURFACES. Works with the piece off too
//                             (other layers and the audio ask it). Built once per level from the set's
//                             own data (its slab outlines, the meadow's density, the layout constants),
//                             cached a byte per 0.5 m cell as it is asked.
//   steps.step(x, z, o)       a foot came down at (x, z): o { sprint, heavy (a landing), side (-1 right,
//                             1 left), vx, vz, kick (0..1: the dash's bounding steps) }. Draws the
//                             surface's answer: a puff, a print, torn grass, trodden grass, a glint.
//   steps.footfall(x, z, o)   (added) step() for the hero's hooks: returns the surface when the piece is
//                             on (the `player:footstep` payload carries it), undefined when it is off
//                             (the hook then draws today's dust)
//   steps.grassAt(x, z)       (added) is there grass underfoot (the meadow's density), whatever the surface
//   steps.prints              (added) the prints lying now
// With the piece off: step() draws nothing, footfall() returns undefined.
//
// What a surface answers (stepsTuning.js `surfaces`):
//   grass     no dust; torn blade bits on a sprint; the grass is trodden (scorch.trample: the scorch
//             map's blue channel, which the grass shader reads) and stands up again over ~6 s
//   earth     a small low dust puff and a print (~5 s)
//   stone     a tiny grit puff on a sprint or a landing only
//   sand      a puff on every step that the wind carries off
//   ash       a soft grey puff that hangs, then sinks; a print that fills in (~14 s)
//   obsidian  no dust: a dim red glint, gone in 0.75 s (before the fight only)
//   leaf      a leaf or two flicked aside
// Every step also asks the litter to move what lies underfoot, and on wet ground (weather.wet) adds a
// tiny splash. Prints lie in an own pool (made on the first step with the piece on), refreshed ten
// times a second from the steps' own records: their fade is the steps' clock, not the pool's.

export const SURFACES = Object.freeze(['grass', 'earth', 'stone', 'ash', 'obsidian', 'sand', 'leaf']);

const SIN_PITCH = Math.sin(CONFIG.camera.pitch);
/** The on-screen angle of a ground direction (dx, dz) at the fixed camera (north up): scars.js's. */
const groundRot = (dx, dz) => Math.atan2(-dz * SIN_PITCH, dx);
const fract = (v) => v - Math.floor(v);
const GRASS_BIT = 0x80;

const inShape = (s, x, z) => {
  if (s.square !== undefined) return Math.abs(x) <= s.square && Math.abs(z) <= s.square;
  const d = Math.hypot(x - (s.x ?? 0), z - (s.z ?? 0));
  if (s.disc !== undefined) return d <= s.disc;
  if (s.ring) return d >= s.ring[0] && d <= s.ring[1];
  return false;
};

/** Is (x, z) inside the polygon [[x, z], ...]? (even-odd rule) */
function inPoly(P, x, z) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class Steps {
  constructor(life) {
    this.life = life;
    const id = life.levelId;
    this.rule = STEPS.levels[id] ?? STEPS.fallback;
    this._idx = Object.create(null);
    SURFACES.forEach((s, i) => (this._idx[s] = i));
    // the surfaces' answers with this level's changes
    const per = STEPS.perLevel[id] ?? {};
    this.answer = Object.create(null);
    for (const s of SURFACES) {
      const base = STEPS.surfaces[s] ?? {};
      const mod = per[s] ?? {};
      this.answer[s] = { ...base, ...mod };
    }
    this._cache = null; // the surface map, made on the first ask
    this._slabGrid = null;
    // the prints: records (reused) and the batch they are drawn in
    this.pool = null;
    this._recs = [];
    this._n = 0; // live records, oldest first
    this._refresh = 0;
    this._stale = false;
    this._t = 0;
    this._visible = true;
    // reused spawn records (no allocation per step)
    this._p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.2, sizeEnd: 0.2, glyph: '.', color: null, colorEnd: null, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, spin: 0, rot: 0 };
    this._pr = { x: 0, y: 0, z: 0, life: 1e6, size: 0.2, sizeEnd: 0.2, glyph: '.', color: null, colorEnd: null, alpha: 1, alphaEnd: 1, rot: 0, stretch: 0 };
    this._w = { x: 0, z: 0, k: 0 };
    life.action?.('surface here', () => {
      const h = life.hero;
      return `surface: ${this.surfaceAt(h.x, h.z)}${this.grassAt(h.x, h.z) ? ' (grass)' : ''}`;
    }, 'what the ground is under the hero (the steps)');
    life.action?.('stamp', () => {
      if (!life.on('steps')) return 'steps off';
      const h = life.hero;
      this.step(h.x, h.z, { heavy: true, sprint: true, side: 0 });
      return `stamp on ${this.surfaceAt(h.x, h.z)}`;
    }, 'a heavy landing under the hero (the steps)');
  }

  // ------------------------------------------------------------------ the surface map
  _build() {
    const E = STEPS.extent, c = STEPS.cell, N = Math.ceil(E / c);
    this._N = N;
    this._min = -E / 2;
    this._cache = new Uint8Array(N * N);
    // the slabs' outlines in buckets of 2 m
    const B = 2, M = Math.ceil(E / B);
    const grid = new Array(M * M);
    const slabs = Array.isArray(this.life.set?.slabs) ? this.life.set.slabs : [];
    for (const s of slabs) {
      const P = s?.outline;
      if (!Array.isArray(P) || P.length < 3) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of P) {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
      }
      if (!Number.isFinite(x0 + x1 + z0 + z1)) continue;
      const i0 = Math.max(0, Math.floor((x0 - this._min) / B)), i1 = Math.min(M - 1, Math.floor((x1 - this._min) / B));
      const j0 = Math.max(0, Math.floor((z0 - this._min) / B)), j1 = Math.min(M - 1, Math.floor((z1 - this._min) / B));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (grid[j * M + i] ??= []).push(P);
    }
    this._slabGrid = grid;
    this._M = M;
    this._B = B;
  }

  _onSlab(x, z) {
    const i = Math.floor((x - this._min) / this._B), j = Math.floor((z - this._min) / this._B);
    if (i < 0 || j < 0 || i >= this._M || j >= this._M) return false;
    const L = this._slabGrid[j * this._M + i];
    if (!L) return false;
    for (let k = 0; k < L.length; k++) if (inPoly(L[k], x, z)) return true;
    return false;
  }

  _density(x, z) {
    const d = this.life.world?.fire?.density;
    if (typeof d !== 'function') return 0;
    const v = d(x, z);
    return Number.isFinite(v) ? v : 0;
  }

  /** The surface's index | GRASS_BIT, worked out at (x, z). */
  _classify(x, z) {
    const R = this.rule, I = this._idx;
    const grass = this._density(x, z) >= STEPS.grassMin;
    const g = grass ? GRASS_BIT : 0;
    if (R.over) for (const s of R.over) if (inShape(s, x, z)) return I[s.surface] | g;
    // (a joint between two slabs is still the floor: the cell's corners are asked too)
    const e = STEPS.joint;
    if (this._onSlab(x, z) || this._onSlab(x - e, z - e) || this._onSlab(x + e, z - e) || this._onSlab(x - e, z + e) || this._onSlab(x + e, z + e)) return I[R.slab ?? 'stone'] | g;
    if (R.areas) for (const s of R.areas) if (inShape(s, x, z)) return I[s.surface] | g;
    if (grass) return I[R.grass ?? 'grass'] | g;
    return I[R.ground ?? 'earth'];
  }

  _code(x, z) {
    if (!this._cache) this._build();
    if (!Number.isFinite(x + z)) return this._idx[this.rule.ground ?? 'earth'];
    const c = STEPS.cell;
    const i = Math.floor((x - this._min) / c), j = Math.floor((z - this._min) / c);
    // (off the map: worked out each time, never cached)
    if (i < 0 || j < 0 || i >= this._N || j >= this._N) return this._classify(x, z);
    const k = j * this._N + i;
    let v = this._cache[k];
    if (v === 0) {
      v = this._classify(this._min + (i + 0.5) * c, this._min + (j + 0.5) * c) + 1;
      this._cache[k] = v;
    }
    return v - 1;
  }

  /** What the ground is at (x, z): one of SURFACES. */
  surfaceAt(x, z) {
    return SURFACES[this._code(x, z) & 0x7f] ?? 'grass';
  }

  /** Is there grass underfoot at (x, z) (whatever the surface is called there)? */
  grassAt(x, z) {
    return (this._code(x, z) & GRASS_BIT) !== 0;
  }

  get prints() {
    return this._n;
  }

  // ------------------------------------------------------------------ a foot comes down
  /** step() for the hero's hooks: the surface when the piece is on, else undefined. */
  footfall(x, z, o) {
    const L = this.life;
    if (!L.on('steps') || !Number.isFinite(x + z)) return undefined;
    try {
      this._step(x, z, o);
      return this.surfaceAt(x, z);
    } catch (err) {
      L._fail?.('steps', err);
      return undefined;
    }
  }

  step(x, z, o) {
    if (!this.life.on('steps') || !Number.isFinite(x + z)) return;
    try {
      this._step(x, z, o);
    } catch (err) {
      this.life._fail?.('steps', err);
    }
  }

  _step(x, z, o) {
    const L = this.life;
    const sprint = !!o?.sprint, heavy = !!o?.heavy;
    const kick = Number.isFinite(o?.kick) ? Math.max(0, Math.min(1, o.kick)) : 0;
    const mode = heavy ? 'heavy' : sprint || kick > 0.5 ? 'sprint' : 'run';
    const code = this._code(x, z);
    const surf = SURFACES[code & 0x7f] ?? 'grass';
    const A = this.answer[surf];
    // the counts' scale: the phone's budget, thinner while the boss is up
    const q = Math.max(0, Math.min(1, L.quality)) * (0.5 + 0.5 * Math.max(0, Math.min(1, L.calm)));
    // the way he is going (a print turns to it)
    let dx = Number.isFinite(o?.vx) ? o.vx : 0, dz = Number.isFinite(o?.vz) ? o.vz : 0;
    if (dx * dx + dz * dz < 0.09) {
      dx = L.hero?.vx ?? 0;
      dz = L.hero?.vz ?? 0;
    }
    if (dx * dx + dz * dz < 0.09) {
      const yaw = L.game?.player?.yaw;
      dx = Number.isFinite(yaw) ? Math.sin(yaw) : 0;
      dz = Number.isFinite(yaw) ? Math.cos(yaw) : 1;
    }
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;

    if (A.bits) this._burst(A.bits, mode, q, x, z, 0);
    if (A.puff) this._burst(A.puff, mode, q * (heavy ? 1 : 1 + 0.6 * kick), x, z, A.puff.wind ?? 0);
    if (A.glint && L.calm > 0.99) {
      // (before the fight only: a red tick at the hero's feet must not sit beside a red tell)
      // (a glint lies ON the floor: it is a mark of the prints' batch, whose depth fade is low)
      const want = (A.glint[mode] ?? 0) * q;
      let n = Math.floor(want);
      if (L.rand() < want - n) n++;
      for (let i = 0; i < n; i++) this._print(A.glint, x + L.range(-0.15, 0.15), z + L.range(-0.15, 0.15), 0, 0);
    }
    if (A.flick) this._burst(A.flick, mode, q, x, z, 0);
    // the prints: the flash (the default, STEPS.flash: code in the foot's shape, gone in under a second) on
    // EVERY surface in every level (the owner, 2026-11-25: "have the footprints show in every stage"); with
    // `?prints=0` the surface's own print where it has one (earth, ash)
    const flash = printLook() === 'a';
    if (flash || A.print) {
      const P = flash ? STEPS.flash : A.print;
      if (heavy) {
        // both feet, side by side across the way he came down
        this._print(P, x - dz * 0.16, z + dx * 0.16, dx, dz);
        this._print(P, x + dz * 0.16, z - dx * 0.16, dx, dz);
      } else this._print(P, x, z, dx, dz);
    }
    // trodden grass, wherever grass grows (`?bend=0`: today's trodden trail in the scorch map's B; else
    // the grass bends round the hero's wake, world/grassTrail.js, which a sprint and a landing widen)
    if (code & GRASS_BIT) {
      const T = STEPS.trample;
      const r = heavy ? T.rHeavy : sprint ? T.rSprint : T.r;
      if (bendLook() === '0') {
        const k = heavy ? T.kHeavy : sprint ? T.kSprint : T.k;
        L.world?.scorch?.trample?.(x, z, r, k);
      } else if (heavy || sprint) L.world?.trail?.press?.(x, z, r);
    }
    // what lies underfoot is moved (the litter's)
    const S = STEPS.scatter;
    // (through life._call: a slip of the litter's is the litter's, not the steps')
    if (L._call) L._call('litter', 'scatter', x, z, heavy ? S.rHeavy : S.r, (heavy ? S.kHeavy : S.k) * L.k);
    // wet ground
    const wet = L.weather?.wet;
    if (Number.isFinite(wet) && wet > STEPS.splash.min) this._burst(STEPS.splash, mode, q * Math.min(1, wet), x, z, 0);
  }

  /** `spec`'s letters at (x, z): its count for the mode (a fraction is a chance), thrown up and out. */
  _burst(spec, mode, q, x, z, windK) {
    const fx = this.life.game?.fx?.alpha;
    if (!fx) return;
    const L = this.life, K = L.k;
    const want = (spec[mode] ?? 0) * q;
    let n = Math.floor(want);
    if (L.rand() < want - n) n++;
    if (n <= 0) return;
    let wx = 0, wz = 0;
    if (windK > 0) {
      const w = L._call ? L._call('wind', 'at', x, z, this._w) : null;
      if (w && Number.isFinite(w.x + w.z)) {
        wx = w.x * windK;
        wz = w.z * windK;
      }
    }
    const p = this._p, big = mode === 'heavy' ? 1.35 : 1;
    for (let i = 0; i < n; i++) {
      const a = L.rand() * 6.283;
      const sp = (spec.out ? L.range(spec.out[0], spec.out[1]) : 0) * big * K;
      const ca = Math.cos(a), sa = Math.sin(a);
      p.x = x + ca * 0.12;
      p.y = spec.y ? L.range(spec.y[0], spec.y[1]) : L.range(0.2, 0.32); // (the shared pool fades a letter within ~0.5 m of the floor)
      p.z = z + sa * 0.12;
      p.vx = ca * sp + wx;
      p.vy = (spec.up ? L.range(spec.up[0], spec.up[1]) : 0) * big * K;
      p.vz = sa * sp + wz;
      p.life = L.range(spec.life[0], spec.life[1]);
      p.size = L.range(spec.size[0], spec.size[1]);
      p.sizeEnd = spec.sizeEnd ? L.range(spec.sizeEnd[0], spec.sizeEnd[1]) : p.size * 0.8;
      p.glyph = spec.glyph;
      p.color = spec.color;
      p.colorEnd = spec.colorEnd;
      p.alpha = spec.alpha ?? 0.6;
      p.alphaEnd = 0;
      p.drag = spec.drag ?? 2;
      p.gravity = spec.gravity ?? 0;
      p.spin = (L.rand() - 0.5) * 3;
      p.rot = L.rand() * 6.283;
      fx.spawn(p);
    }
  }

  // ------------------------------------------------------------------ the prints
  _makePool() {
    if (this.pool) return this.pool;
    const g = this.life.game;
    if (!g?.U) return null;
    const max = Math.max(30, Math.round(STEPS.prints.max * Math.max(0.3, Math.min(1, this.life.quality))));
    this._max = max;
    // (life.build: three.js's uuids draw from the living world's stream, never Math.random)
    this.pool = this.life.build ? this.life.build(() => new GlyphParticles(g.U, { max, additive: false })) : new GlyphParticles(g.U, { max, additive: false });
    if (this.pool.uniforms?.uSoft) this.pool.uniforms.uSoft.value = STEPS.prints.soft;
    g.pipeline?.registerParticles?.(this.pool);
    this.pool.mesh.visible = this._visible;
    for (let i = 0; i < max; i++) this._recs.push({ x: 0, z: 0, rot: 0, age: 0, spec: null, dx: 0, dz: 1, seed: 0 });
    return this.pool;
  }

  _print(spec, x, z, dx, dz) {
    if (!this._makePool()) return;
    const R = this._recs;
    if (this._n >= this._max) {
      // full: the oldest goes (its record is reused)
      const r0 = R[0];
      R.copyWithin(0, 1, this._n);
      R[this._n - 1] = r0;
      this._n--;
    }
    const r = R[this._n++];
    r.x = x;
    r.z = z;
    r.rot = dx || dz ? groundRot(dx, dz) - Math.PI / 2 + (this.life.rand() - 0.5) * 0.3 : this.life.rand() * 6.283;
    r.age = 0;
    r.spec = spec;
    r.dx = dx || 0;
    r.dz = dx || dz ? dz : 1;
    r.seed = this.life.rand();
    this._stale = true;
  }

  /** One flash print (STEPS.flash): its code letters in the foot's oval, heel to toe, flashing and gone. */
  _flash(r, s, pr) {
    const P = this.pool;
    const n = s.n[0] + Math.floor(fract(r.seed * 7.31) * (s.n[1] - s.n[0] + 1));
    const ax = r.dx, az = r.dz, cx = -az, cz = ax;
    const G = s.glyphs, col = this._fc ?? (this._fc = [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const a = r.age - i * s.cascade;
      if (a < 0 || a >= s.life) continue;
      // heel to toe along the way he went, a little scatter across (the foot's oval)
      const u = (n > 1 ? i / (n - 1) : 0.5) - 0.5;
      const w = (fract(r.seed * 13.7 + i * 0.618) - 0.5) * Math.sqrt(Math.max(0, 1 - 4 * u * u));
      const along = u * s.foot[0], across = w * s.foot[1] * 2;
      pr.x = r.x + ax * along + cx * across;
      pr.y = STEPS.prints.y;
      pr.z = r.z + az * along + cz * across;
      // the letter re-rolls every `flicker` s
      const roll = Math.floor(a / s.flicker);
      pr.glyph = G[Math.floor(fract(r.seed * 91.7 + i * 7.13 + roll * 0.379) * G.length)];
      // hot white-green on the flash, cooling to code green, then dimming away
      const k = a / s.life;
      if (a < s.hotT) {
        const t = a / s.hotT;
        for (let c = 0; c < 3; c++) col[c] = s.hot[c] + (s.color[c] - s.hot[c]) * t;
      } else {
        const t = (a - s.hotT) / (s.life - s.hotT);
        for (let c = 0; c < 3; c++) col[c] = s.color[c] + (s.colorEnd[c] - s.color[c]) * t;
      }
      pr.color = pr.colorEnd = col;
      pr.alpha = pr.alphaEnd = s.alpha * (1 - k * k);
      pr.size = pr.sizeEnd = s.size;
      pr.rot = 0;
      pr.stretch = 0;
      P.spawn(pr);
    }
  }

  _redraw() {
    const P = this.pool;
    if (!P) return;
    P.clear();
    const pr = this._pr, Y = STEPS.prints.y;
    for (let i = 0; i < this._n; i++) {
      const r = this._recs[i], s = r.spec;
      if (s.glyphs) {
        // (on a dragon-printed floor the floor's own cells flash: render/dragonStep.js, _stepUniforms)
        if (!this._floorPrints()) this._flash(r, s, pr);
        continue;
      }
      const f = 1 - r.age / s.life;
      // it holds a while, then fills in
      const a = s.alpha * Math.min(1, (s.hold ?? 1) * f);
      pr.x = r.x; pr.y = Y; pr.z = r.z;
      pr.size = pr.sizeEnd = Array.isArray(s.size) ? s.size[0] : s.size;
      pr.glyph = s.glyph;
      pr.color = pr.colorEnd = s.color;
      pr.alpha = pr.alphaEnd = a;
      pr.rot = r.rot;
      pr.stretch = s.stretch ?? 0;
      P.spawn(pr);
    }
    P.update(0, this.life.t);
    this._stale = false;
    this._refresh = 0;
  }

  /** Does the floor print the flash itself (the dragon ground, world/ground.js look b)? */
  _floorPrints() {
    return this.life.game?.world?.ground?.userData?.look === 'b';
  }

  /** The newest flash prints into the dragon print's uniforms (DP_STEP_U); none: off. */
  _stepUniforms() {
    const S = DP_STEP_U.uDpSteps.value, F = STEPS.flash;
    let k = 0;
    if (this._floorPrints()) {
      for (let i = this._n - 1; i >= 0 && k < DP_STEPS; i--) {
        const r = this._recs[i];
        if (!r.spec?.glyphs) continue;
        S[k++].set(r.x, r.z, r.age, Math.atan2(r.dz, r.dx));
      }
    }
    for (let i = k; i < DP_STEPS; i++) S[i].z = -1;
    DP_STEP_U.uDpStepK.value.set(F.life, F.hotT, F.flicker, k > 0 ? 1 : 0);
    DP_STEP_U.uDpStepF.value.set(F.cells[0] / 2, F.cells[1] / 2, F.cascade * (F.n[1] - 1), 0);
  }

  update(dt) {
    if (!this.life.on('steps')) {
      if (this._n || this.pool?.count) this._wipe();
      if (DP_STEP_U.uDpStepK.value.w) this._stepUniforms();
      return;
    }
    this._stepUniforms();
    if (!this._n) return;
    // the marks age; the ones that are gone leave the list (the live keep their order, oldest first;
    // a gone record is swapped to the back, ready for reuse)
    const R = this._recs;
    let w = 0, quick = false;
    for (let i = 0; i < this._n; i++) {
      const r = R[i];
      r.age += dt;
      if (r.age >= r.spec.life) continue;
      if (r.spec.life < 2) quick = true;
      if (w !== i) {
        R[i] = R[w];
        R[w] = r;
      }
      w++;
    }
    if (w !== this._n) {
      this._n = w;
      this._stale = true;
    }
    this._refresh += dt;
    // (a short mark, a glint, fades every frame; the prints ten times a second)
    if (this._stale || quick || this._refresh >= STEPS.prints.refresh) this._redraw();
  }

  _wipe() {
    this._n = 0;
    this._stale = false;
    this.pool?.clear();
  }

  clear() {
    // a reset (or the Lab hiding the world): the prints go
    this._wipe();
  }

  setVisible(on) {
    this._visible = !!on;
    if (this.pool?.mesh) this.pool.mesh.visible = this._visible;
  }

  takes() {
    return false;
  }
}
