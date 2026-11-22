import { GlyphParticles } from '../render/particles.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { mulberry32 } from '../core/rng.js';

// THE SUNLIGHT (ADR-132): the Skywell Vault's four wells and the pools he bores (`world.sun`; null on
// every other set and on ?stage=lab). A set that carries `sun: { wells, great, bore }` (data only:
// world/skywellVault.js) gets one; world.js builds it after the destructibles, updates it and resets it
// in restore().
//
// A POOL: { id, x, z, r, open 0..1, state 'open' | 'shutting' | 'shut' | 'opening', temp, life, piece }.
//   - the four FIXED pools are open exactly while their windlass (a breakable of kind 'windlass', bound
//     once by place, as the throne's vents bind their rims) is INTACT: the hero's cuts, the boss's own
//     beam or dive and world.restore() all work with no other code path. The windlass gone, the lid
//     drops: `open` 1 -> 0 over SUN.shut s, eaten from one side as a straight edge.
//   - up to SUN.temp TEMPORARY pools (bore(); the great well over the centre in phase 3): they open
//     over SUN.open s, live `life` s, then the wound in the rock closes over SUN.close s.
// API: lit(x, z) -> 0..1, poolAt(x, z), nearestOpen(x, z), openCount (fixed lids open), bore(x, z, r,
// life) -> pool | null, shut(i) / openAll() (Lab, tests), update(dt), reset().
// Events: 'world:sun' { id, open, temp } on each change of a pool's state (open: true as it opens,
// false as it starts to shut).
// Drawn (the look `?pool=a|b`): the lit disc is a glyph batch of its own lying on the floor (gold
// digits, additive: the technique of the throne's seal inlay), slow gold motes falling in each shaft
// (one-cell glyph particles in the shared pool), one warm point light per open pool (game.lights). Not
// fire-field heat: sunlight is not fire. The batch is refilled only while a pool is changing.

/** The sunlight's numbers. */
export const SUN = Object.freeze({
  shut: 0.7, // s a lid takes to drop
  open: 0.55, // s a bored pool takes to open (and a fixed lid to come back on a reset: at once)
  close: 0.9, // s a bored pool's wound takes to close
  litAt: 0.5, // a pool lights what stands in it once it is at least this open
  temp: 3, // bored pools alive at once at most (the boss asks for fewer: his tuning)
  cell: 0.34, // m between the disc's glyphs
  light: { y: 6, intensity: 2.6, radius: 7.5, color: [1.0, 0.82, 0.5] },
  motes: 2.6, // a second, per open pool (a bored one: half again)
});

// the disc's glyphs: gold digits, brighter toward the centre; the rim a ring of strokes
const DISC = '0123456789';
const RIM = '-=';
const GOLD = [1.15, 0.86, 0.36], GOLD_RIM = [1.5, 1.15, 0.5], MOTE = [2.2, 1.7, 0.75], MOTE_END = [0.5, 0.32, 0.08];

export class SunWells {
  /** `data`: the set's `sun` ({ wells: [{ x, z, r }], great: { x, z, r }, bore: { r } }). */
  constructor(game, world, data) {
    this.game = game;
    this.world = world;
    this.data = data;
    this.pools = [];
    this.stats = { shut: 0, bored: 0 };
    (data.wells ?? []).forEach((w, i) => this.pools.push({ id: i, x: w.x, z: w.z, r: w.r, open: 1, state: 'open', temp: false, life: Infinity, piece: undefined, wx: w.wx, wz: w.wz }));
    for (let i = 0; i < SUN.temp; i++) this.pools.push({ id: (data.wells?.length ?? 0) + i, x: 0, z: 0, r: 0, open: 0, state: 'shut', temp: true, life: 0, piece: null, live: false });
    this._dirty = true;
    this._rng = mulberry32(0x5a11 + (data.wells?.length ?? 0)); // (the look's own stream: never Math.random)
    this._evt = { id: 0, open: false, temp: false };
    this._acc = 0;
    this.lights = [];
    this.forced = null; // (Lab) a lid held shut by hand: { [id]: true }
    this.batch = null;
    this.visible = true;
    try {
      this.batch = new GlyphParticles(game.U, { max: 2400, additive: true });
      game.pipeline?.registerParticles?.(this.batch);
    } catch (err) {
      console.error('[sun] glyph batch failed', err);
      this.batch = null;
    }
    for (const p of this.pools) {
      const L = game.lights?.add?.({ x: p.x, y: SUN.light.y, z: p.z, color: SUN.light.color, intensity: 0, radius: SUN.light.radius, flicker: 0.04 }) ?? null;
      this.lights.push(L);
    }
  }

  // ---------------------------------------------------------------- queries
  /** How lit (x, z) is: 1 inside a pool at least SUN.litAt open, else 0. */
  lit(x, z) {
    return this.poolAt(x, z) ? 1 : 0;
  }

  /** The pool (x, z) stands in (open at least SUN.litAt), or null. */
  poolAt(x, z) {
    if (!Number.isFinite(x + z)) return null;
    for (const p of this.pools) {
      if (p.temp && !p.live) continue;
      if (p.open >= SUN.litAt && Math.hypot(x - p.x, z - p.z) <= p.r) return p;
    }
    return null;
  }

  /** The nearest pool that is open (or opening past SUN.litAt), or null. `o.fixed`: fixed lids only. */
  nearestOpen(x, z, o = null) {
    let best = null, bd = Infinity;
    for (const p of this.pools) {
      if (p.temp && (!p.live || o?.fixed)) continue;
      if (p.state === 'shut' || p.state === 'shutting') continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Fixed lids open (or opening). */
  get openCount() {
    let n = 0;
    for (const p of this.pools) if (!p.temp && (p.state === 'open' || p.state === 'opening')) n++;
    return n;
  }

  /** Bored pools alive. */
  get boredCount() {
    let n = 0;
    for (const p of this.pools) if (p.temp && p.live) n++;
    return n;
  }

  // ---------------------------------------------------------------- changes
  /** A new pool over (x, z), `r` m wide, `life` s long (then it closes). Null when none is free. */
  bore(x, z, r = this.data.bore?.r ?? 2.8, life = 12) {
    if (!Number.isFinite(x + z + r + life)) return null;
    const p = this.pools.find((q) => q.temp && !q.live);
    if (!p) return null;
    p.x = x;
    p.z = z;
    p.r = r;
    p.open = 0;
    p.state = 'opening';
    p.life = life;
    p.live = true;
    this._dirty = true;
    this.stats.bored++;
    this._emit(p, true);
    return p;
  }

  /** Lab / tests: lid `i` (0..3) shut now (its windlass broken if it stands, else held shut). */
  shut(i) {
    const p = this.pools[i];
    if (!p || p.temp) return false;
    const pc = this._piece(p);
    const D = this.world?.destructibles;
    if (pc && pc.state === 0 && D?._break) {
      try {
        D._break(pc, p.x - pc.x, p.z - pc.z, 'world', 'break', true);
      } catch (err) {
        console.error('[sun] break failed', err);
      }
    }
    if (pc?.state === 0 || !pc) {
      this.forced ??= {};
      this.forced[p.id] = true;
    }
    return true;
  }

  /** Lab / tests: every lid open (the windlasses stand again: world.restore()). */
  openAll() {
    this.forced = null;
    this.world?.restore?.();
    this.reset();
  }

  /** Every pool as at the fight's start: the four lids open, nothing bored. */
  reset() {
    this.forced = null;
    for (const p of this.pools) {
      if (p.temp) {
        p.live = false;
        p.open = 0;
        p.state = 'shut';
      } else {
        p.open = 1;
        p.state = 'open';
      }
    }
    this._dirty = true;
  }

  /** The windlass that holds lid `p` open (bound once, by kind and place). */
  _piece(p) {
    if (p.temp) return null;
    if (p.piece !== undefined && p.piece !== null) return p.piece;
    const L = this.world?.destructibles?.list;
    if (!L) return null;
    const wx = p.wx ?? p.x, wz = p.wz ?? p.z;
    p.piece = L.find((o) => o.kind === 'windlass' && Math.hypot(o.x - wx, o.z - wz) < 0.5) ?? null;
    return p.piece;
  }

  _emit(p, open) {
    const e = this._evt;
    e.id = p.id;
    e.open = open;
    e.temp = !!p.temp;
    this.game.events?.emit?.('world:sun', e);
  }

  update(dt) {
    if (!(dt >= 0)) return;
    for (const p of this.pools) {
      const was = p.open;
      if (p.temp) {
        if (!p.live) continue;
        p.life -= dt;
        if (p.state === 'opening') {
          p.open = Math.min(1, p.open + dt / SUN.open);
          if (p.open >= 1) p.state = 'open';
        } else if (p.state === 'open' && p.life <= 0) {
          p.state = 'shutting';
          this._emit(p, false);
        } else if (p.state === 'shutting') {
          p.open = Math.max(0, p.open - dt / SUN.close);
          if (p.open <= 0) {
            p.state = 'shut';
            p.live = false;
            this._dirty = true;
          }
        }
      } else {
        const pc = this._piece(p);
        // (no windlass bound: a set without one keeps its lids open, the Lab's hand aside)
        const intact = (pc ? pc.state === 0 : true) && !this.forced?.[p.id];
        if (intact && p.state !== 'open') {
          // a restore: the lid is open again at once (the fight's reset)
          p.open = 1;
          p.state = 'open';
          this._emit(p, true);
        } else if (!intact && (p.state === 'open' || p.state === 'opening')) {
          p.state = 'shutting';
          this.stats.shut++;
          this._emit(p, false);
          this._shutFx(p);
        }
        if (p.state === 'shutting') {
          p.open = Math.max(0, p.open - dt / SUN.shut);
          if (p.open <= 0) p.state = 'shut';
        }
      }
      if (p.open !== was) this._dirty = true;
    }
    this._lights();
    this._motes(dt);
    if (this._dirty) this._fill();
    this.batch?.update?.(dt, this.game.time ?? 0);
  }

  /** The lights: one per pool, as open as it is. */
  _lights() {
    for (let i = 0; i < this.pools.length; i++) {
      const p = this.pools[i], L = this.lights[i];
      if (!L) continue;
      const on = p.temp ? (p.live ? p.open : 0) : p.open;
      L.x = p.x;
      L.z = p.z;
      L.intensity = this.visible ? SUN.light.intensity * on * (p.temp ? 0.85 : 1) : 0;
    }
  }

  /** The disc of each pool, refilled into the batch (only while something changed). */
  _fill() {
    this._dirty = false;
    const B = this.batch;
    if (!B) return;
    B.clear();
    if (!this.visible) return;
    const calm = lookOf('pool', 'a') === 'b';
    const step = SUN.cell;
    for (const p of this.pools) {
      if (p.temp && !p.live) continue;
      if (p.open <= 0.001) continue;
      // the lid eats the disc from one side as a straight edge (the far side from the windlass first:
      // the lid hinges at the chain's side), a bored pool's wound closes from its rim inward
      const ex = p.temp ? 0 : p.x - (p.wx ?? p.x), ez = p.temp ? 0 : p.z - (p.wz ?? p.z), el = Math.hypot(ex, ez) || 1;
      const ux = ex / el, uz = ez / el;
      const edge = (p.open * 2 - 1) * p.r; // glyphs with (q - c) . u < edge are lit
      const R = p.temp ? p.r * Math.min(1, p.open * 1.1) : p.r;
      const n = Math.ceil(R / step);
      for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
          // (a staggered grid: the rows offset by half a cell, so the disc never reads as a chessboard)
          const ox = (i + ((j & 1) ? 0.5 : 0)) * step, oz = j * step * 0.92;
          const rr = Math.hypot(ox, oz);
          if (rr > R) continue;
          if (!p.temp && -(ox * ux + oz * uz) > edge) continue;
          const rim = rr > R - step * 1.1;
          if (calm && !rim && rr < R - step * 2.2) continue; // ?pool=b: the rim and a band inside it only
          const h = Math.sin(i * 12.9898 + j * 78.233 + p.id * 3.1) * 43758.5453;
          const f = h - Math.floor(h);
          const k = rim ? 1 : 0.55 + 0.45 * (1 - rr / R) + 0.1 * f;
          const col = rim ? GOLD_RIM : GOLD;
          const glyph = rim ? RIM[(f * RIM.length) | 0] : DISC[(f * DISC.length) | 0];
          B.spawn({
            x: p.x + ox, y: 0.07, z: p.z + oz, life: 1e9, size: rim ? 0.3 : 0.24, sizeEnd: rim ? 0.3 : 0.24, glyph,
            color: [col[0] * k, col[1] * k, col[2] * k], colorEnd: [col[0] * k, col[1] * k, col[2] * k], alpha: 1, alphaEnd: 1,
            rot: rim ? Math.atan2(-ox, oz) : 0, flicker: 0.12,
          });
        }
      }
    }
  }

  /** Gold motes falling slowly in the open shafts (the shared glyph pool: one cell each). */
  _motes(dt) {
    const fx = this.game.fx?.add;
    if (!fx || !this.visible || !(dt > 0)) return;
    for (const p of this.pools) {
      if ((p.temp && !p.live) || p.open < SUN.litAt) continue;
      p._m = (p._m ?? 0) + dt * SUN.motes * (p.temp ? 1.5 : 1) * p.open;
      while (p._m >= 1) {
        p._m -= 1;
        const r = this._rng, a = r() * Math.PI * 2, d = Math.sqrt(r()) * p.r * 0.9;
        fx.spawn({
          x: p.x + Math.cos(a) * d, y: 3.2 + r() * 2.5, z: p.z + Math.sin(a) * d, vx: (r() - 0.5) * 0.12, vy: -0.45 - r() * 0.35, vz: (r() - 0.5) * 0.12,
          life: 4 + r() * 3, size: 0.11, sizeEnd: 0.06, glyph: ".'", color: MOTE, colorEnd: MOTE_END, alpha: 0.8, alphaEnd: 0, drag: 0.1, flicker: 0.4,
        });
      }
    }
  }

  /** A lid drops: dust falls through the closing shaft, a crash of the bronze far up. */
  _shutFx(p) {
    const fx = this.game.fx?.alpha ?? this.game.fx?.add;
    if (fx) {
      const r = this._rng;
      for (let i = 0; i < 22; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * p.r;
        fx.spawn({
          x: p.x + Math.cos(a) * d, y: 2.5 + r() * 4, z: p.z + Math.sin(a) * d, vx: (r() - 0.5) * 0.4, vy: -2 - r() * 2.5, vz: (r() - 0.5) * 0.4,
          life: 0.9 + r() * 0.8, size: 0.16, sizeEnd: 0.08, glyph: ",.`'", color: [0.42, 0.38, 0.32], colorEnd: [0.14, 0.12, 0.1], alpha: 0.9, alphaEnd: 0, drag: 0.4,
        });
      }
    }
    this.game.shake?.(0.12);
  }

  /** Lab (world.debug.setVisible): the discs, the motes and the lights go with the rest of the set. */
  setVisible(on) {
    this.visible = !!on;
    if (this.batch?.mesh) this.batch.mesh.visible = this.visible;
    this._dirty = true;
  }
}
