import { GlyphParticles } from '../render/particles.js';
import { CONFIG } from '../core/config.js';
import { SCAR } from './breakTuning.js';

// Impact marks (ADR-107): what a blow leaves behind. Glyphs that stay where they are until the fight
// is reset, in one batch of their own (the throne hall's inlay works the same way):
//   scars.ground(x, z, power, dx, dz)        a star of cracks in the floor, as wide as the blow was hard
//   scars.crater(x, z, r, power)             a crater's rim: a ring of thrown-up earth
//   scars.object(owner, x, y, z, power, M)   a nick on a struck object (dropped when it breaks)
//   scars.rubble(x, z, r, M, n)              what is left where something came down
//   scars.drop(owner)  scars.reset()  scars.count  scars.setQuality(k)
// When the batch is full (SCAR.max x the quality factor) the oldest SCAR.evict share goes in one step:
// one rebuild of the batch, not one per new mark. `ink` is the set's crack colour (`scarInk` in a
// set's output: dark on pale paving, an ember red on the hall's black tiles).
// No allocation once the marks' records exist (they are recycled).

const SIN_PITCH = Math.sin(CONFIG.camera.pitch);
/** The on-screen angle of a ground direction (dx, dz) at the fixed camera (north up). */
const groundRot = (dx, dz) => Math.atan2(-dz * SIN_PITCH, dx);
const DEFAULT_INK = [0.02, 0.02, 0.026];

// cosmetic noise from this module's own stream (the seeded sims replay Math.random)
let seed = 0x7a3c19e5;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

export class Scars {
  constructor(game, ink) {
    this.game = game;
    this.ink = Array.isArray(ink) && ink.length === 3 && ink.every(Number.isFinite) ? ink : DEFAULT_INK;
    this.max = SCAR.max;
    this.cap = SCAR.max;
    /** the marks, oldest first: { x, y, z, glyph, size, color: [r, g, b], alpha, rot, owner } (records are reused) */
    this.marks = [];
    this._spare = []; // records of marks that went, kept for the next ones
    this.sys = null;
    this._stale = false;
    this._rec = { x: 0, y: 0, z: 0, life: 1e9, size: 0, sizeEnd: 0, glyph: '.', color: null, colorEnd: null, alpha: 1, alphaEnd: 1, rot: 0 };
    this._col = [0, 0, 0];
    try {
      this.sys = new GlyphParticles(game.U, { max: this.max, additive: false });
      game.pipeline?.registerParticles?.(this.sys);
    } catch {
      this.sys = null; // (headless: no particle batch; the marks are still counted)
    }
  }

  get count() {
    return this.marks.length;
  }

  /** The phone budget: at most SCAR.max x k marks stay. */
  setQuality(k) {
    if (!Number.isFinite(k)) return;
    this.cap = Math.max(60, Math.min(this.max, Math.round(this.max * k)));
    if (this.marks.length > this.cap) this._evict(this.marks.length - this.cap);
  }

  /** The oldest `n` marks go (their records are kept for reuse); the batch is rebuilt once. */
  _evict(n) {
    const M = this.marks;
    n = Math.min(n, M.length);
    for (let i = 0; i < n; i++) this._spare.push(M[i]);
    M.copyWithin(0, n);
    M.length -= n;
    this._stale = true;
  }

  _add(x, y, z, glyph, size, color, alpha, rot, owner) {
    if (!Number.isFinite(x + y + z + size)) return;
    if (this.marks.length >= this.cap) this._evict(Math.max(1, Math.round(this.cap * SCAR.evict)));
    const m = this._spare.pop() ?? { x: 0, y: 0, z: 0, glyph: '.', size: 0, color: [0, 0, 0], alpha: 1, rot: 0, owner: -1 };
    m.x = x; m.y = y; m.z = z; m.glyph = glyph; m.size = size; m.alpha = alpha; m.rot = rot; m.owner = owner;
    m.color[0] = color[0]; m.color[1] = color[1]; m.color[2] = color[2];
    this.marks.push(m);
    if (!this._stale) this._spawn(m);
  }

  _spawn(m) {
    if (!this.sys) return;
    const r = this._rec;
    r.x = m.x; r.y = m.y; r.z = m.z; r.size = r.sizeEnd = m.size; r.glyph = m.glyph;
    r.color = r.colorEnd = m.color; r.alpha = r.alphaEnd = m.alpha; r.rot = m.rot;
    this.sys.spawn(r);
  }

  _refill() {
    this._stale = false;
    if (!this.sys) return;
    this.sys.clear();
    const M = this.marks;
    for (let i = 0; i < M.length; i++) this._spawn(M[i]);
  }

  /**
   * A blow met the ground (world.groundBlow): the floor keeps a mark of its kind until the reset.
   * `o`: { kind: 'slam' | 'cut' | 'thrust' | 'dash' | 'blast' | 'step' | 'beam', power, r, dx, dz, len, by, hot }.
   * STUB: no mark yet.
   */
  mark(x, z, o) {
    return 0;
  }

  /** Cracks in the floor round (x, z): spokes of strokes, longer the harder the blow; (dx, dz) leans them. */
  ground(x, z, power, dx = 0, dz = 0) {
    const G = SCAR.ground;
    if (!(power >= G.min) || !Number.isFinite(x + z)) return;
    const k = Math.min(1, (power - G.min) / 1.6);
    const spokes = Math.round(G.spokes[0] + (G.spokes[1] - G.spokes[0]) * k);
    const reach = G.reach[0] + (G.reach[1] - G.reach[0]) * k;
    const lean = Math.hypot(dx, dz) > 1e-3 ? Math.atan2(dz, dx) : rnd() * 6.283;
    const a0 = rnd() * 6.283;
    this._add(x, 0.07, z, G.glyphs[Math.floor(rnd() * G.glyphs.length)], 0.5 + 0.4 * k, this.ink, 0.9, rnd() * 3, -1);
    for (let s = 0; s < spokes; s++) {
      let a = a0 + (s / spokes) * 6.283 + (rnd() - 0.5) * 0.5;
      // spokes bunch toward the way the blow travelled
      a += Math.sin(lean - a) * 0.35;
      const len = reach * (0.55 + 0.6 * rnd());
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let r = 0.42; r < len; r += 0.4) {
        // a crack wanders a little as it runs
        a += (rnd() - 0.5) * 0.22;
        const cx = x + ca * r + (rnd() - 0.5) * 0.08, cz = z + sa * r + (rnd() - 0.5) * 0.08;
        this._add(cx, 0.07, cz, '-', 0.52 * (1 - 0.45 * (r / len)), this.ink, 0.85, groundRot(Math.cos(a), Math.sin(a)), -1);
      }
    }
  }

  /**
   * A crater's rim round (x, z), r out: earth thrown up in a ring of dark lumps, denser the harder the
   * blow (SCAR.crater). The charred floor inside it is the scorch map's (world.impact).
   */
  crater(x, z, r, power) {
    const C = SCAR.crater;
    if (!Number.isFinite(x + z + r + power) || !(r > 0.3)) return;
    const k = Math.min(1, Math.max(0, (power - C.min) / 1.3));
    const n = Math.round(C.ring[0] + (C.ring[1] - C.ring[0]) * k);
    const col = this._col;
    col[0] = 0.07; col[1] = 0.06; col[2] = 0.055;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + (rnd() - 0.5) * 0.4, d = r * (0.85 + 0.3 * rnd());
      this._add(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, C.glyphs[Math.floor(rnd() * C.glyphs.length)], 0.3 + rnd() * 0.25 + 0.15 * k, col, 0.9, rnd() * 6.283, -1);
    }
  }

  /** A nick where a blow met an object: fresh, paler material, a stroke across the blow. */
  object(owner, x, y, z, power, M) {
    const O = SCAR.object;
    const k = Math.min(1, Math.max(0, power) / 1.2);
    const size = O.size[0] + (O.size[1] - O.size[0]) * k;
    const c = M?.color ?? [0.5, 0.5, 0.55];
    const pale = this._col;
    pale[0] = c[0] * 0.55; pale[1] = c[1] * 0.55; pale[2] = c[2] * 0.55;
    const n = power > 0.45 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      // (toward the camera: south and up, so the mark sits on the face the player sees)
      this._add(x + (rnd() - 0.5) * 0.3, Math.max(0.25, y) + (rnd() - 0.5) * 0.3 + 0.1, z + 0.3, O.glyphs[Math.floor(rnd() * O.glyphs.length)], size * (i ? 0.7 : 1), pale, 0.9, (rnd() - 0.5) * 0.8, owner);
    }
  }

  /** Rubble where something came down: its own characters scattered on the floor. */
  rubble(x, z, r, M, n = 10, glyphs = '.,:o') {
    const c = M?.colorEnd ?? [0.16, 0.17, 0.2];
    const col = this._col;
    col[0] = c[0] * 1.5; col[1] = c[1] * 1.5; col[2] = c[2] * 1.5;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r;
      this._add(x + Math.cos(a) * d, 0.09, z + Math.sin(a) * d, glyphs[Math.floor(rnd() * glyphs.length)], 0.2 + rnd() * 0.22, col, 0.85, rnd() * 6.283, -1);
    }
  }

  /** An object broke or was carried off: its nicks go with it. */
  drop(owner) {
    const M = this.marks;
    let w = 0;
    for (let i = 0; i < M.length; i++) {
      const m = M[i];
      if (m.owner === owner) this._spare.push(m);
      else M[w++] = m;
    }
    if (w !== M.length) {
      M.length = w;
      this._stale = true;
    }
  }

  reset() {
    for (let i = 0; i < this.marks.length; i++) this._spare.push(this.marks[i]);
    this.marks.length = 0;
    this._stale = false;
    this.sys?.clear();
  }

  setVisible(on) {
    if (this.sys?.mesh) this.sys.mesh.visible = !!on;
  }

  update(dt, time) {
    if (this._stale) this._refill();
    if (this.sys && this.sys.count) this.sys.update(dt, time);
  }
}
