import { GlyphParticles } from '../render/particles.js';
import { CONFIG } from '../core/config.js';
import { SCAR, FIRE } from './breakTuning.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// Impact marks (ADR-107): what a blow leaves behind. Glyphs that stay where they are until the fight
// is reset, in one batch of their own (the throne hall's inlay works the same way):
//   scars.mark(x, z, o)                      a blow met the ground (world.groundBlow): a mark of its KIND
//                                            (SCAR.mark: slam, cut, thrust, dash, blast, beam, step), so the
//                                            arena shows what was fought there; `?marks=0` leaves only today's
//   scars.ground(x, z, power, dx, dz)        a star of cracks in the floor, as wide as the blow was hard
//   scars.crater(x, z, r, power)             a crater's rim: a ring of thrown-up earth
//   scars.object(owner, x, y, z, power, M)   a nick on a struck object (dropped when it breaks)
//   scars.rubble(x, z, r, M, n)              what is left where something came down
//   scars.drop(owner)  scars.reset()  scars.count  scars.on  scars.setQuality(k)
// When the batch is full (SCAR.max x the quality factor) the oldest SCAR.evict share fades out over
// SCAR.fade s and goes (one rebuild of the batch, not one per new mark). `ink` is the set's crack colour
// (`scarInk` in a set's output: dark on pale paving, an ember red on the hall's black tiles).
// The batch is written only when a mark comes or fades: a floor full of marks costs nothing per frame.
// No allocation once the marks' records exist (they are recycled). No Math.random: the module's own
// stream (the seeded fight sims replay Math.random; a mark must never move them).

const SIN_PITCH = Math.sin(CONFIG.camera.pitch);
/** The on-screen angle of a ground direction (dx, dz) at the fixed camera (north up). */
const groundRot = (dx, dz) => Math.atan2(-dz * SIN_PITCH, dx);
const DEFAULT_INK = [0.02, 0.02, 0.026];
const PF = 26; // (GlyphParticles' floats per particle: its alpha is at +16 / +17)
const TAU = 6.283185307;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const KINDS = ['slam', 'cut', 'thrust', 'dash', 'blast', 'beam', 'step'];

// cosmetic noise from this module's own stream (the seeded sims replay Math.random)
let seed = 0x7a3c19e5;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const pick = (s) => s[Math.floor(rnd() * s.length)];

/** Is the kind marking on (`?marks=0`: today's cracks only)? Read per blow (a Map lookup). */
export const marksOn = () => lookOf('marks', '1') !== '0';

export class Scars {
  constructor(game, ink) {
    this.game = game;
    this.ink = Array.isArray(ink) && ink.length === 3 && ink.every(Number.isFinite) ? ink : DEFAULT_INK;
    // a line's ink (a gash, a furrow, a trench) never brighter than SCAR.mark.lineInk: an ember-red ink
    // drawn as a long stroke would read as a danger strip
    const top = Math.max(...this.ink), L = SCAR.mark.lineInk;
    this.lineInk = top > L ? this.ink.map((c) => (c * L) / top) : this.ink;
    this.max = SCAR.max;
    this.cap = SCAR.max;
    /** the marks, oldest first: { x, y, z, glyph, size, color: [r, g, b], alpha, rot, owner } (records are reused) */
    this.marks = [];
    this._spare = []; // records of marks that went, kept for the next ones
    this.sys = null;
    this._stale = false;
    this._dirty = false; // a mark came: the batch's buffers are written on the next update
    this._dying = 0; // the oldest this many marks are fading out
    this._dieT = 0;
    /** how many kind marks were made, by kind (the tests', the Lab's) */
    this.made = { slam: 0, cut: 0, thrust: 0, dash: 0, blast: 0, beam: 0, step: 0 };
    this.kinds = 0;
    // where the kind marks went (a ring of slots: x, z, size, kind, count, time) for the merge
    const S = SCAR.mark.merge.slots;
    this._near = new Float64Array(S * 6);
    this._nearN = 0;
    this._nearK = 0;
    this._lastStep = [NaN, NaN];
    this._rec = { x: 0, y: 0, z: 0, life: 1e9, size: 0, sizeEnd: 0, glyph: '.', color: null, colorEnd: null, alpha: 1, alphaEnd: 1, rot: 0 };
    this._col = [0, 0, 0];
    this._col2 = [0, 0, 0];
    try {
      // (headroom over the cap for the marks fading out while new ones come)
      this.sys = new GlyphParticles(game.U, { max: Math.ceil(this.max * (1 + SCAR.evict)) + 64, additive: false });
      game.pipeline?.registerParticles?.(this.sys);
    } catch {
      this.sys = null; // (headless: no particle batch; the marks are still counted)
    }
  }

  get count() {
    return this.marks.length;
  }

  /** Kind marking on (`?marks=0` off: scars.mark draws nothing and world.impact draws today's cracks). */
  get on() {
    return marksOn();
  }

  /** The phone budget: at most SCAR.max x k marks stay. */
  setQuality(k) {
    if (!Number.isFinite(k)) return;
    this.cap = Math.max(60, Math.min(this.max, Math.round(this.max * k)));
    if (this.marks.length > this.cap) this._evict(this.marks.length - this.cap);
  }

  /** The oldest `n` marks go now (their records are kept for reuse); the batch is rebuilt once. */
  _evict(n) {
    const M = this.marks;
    n = Math.min(n, M.length);
    for (let i = 0; i < n; i++) this._spare.push(M[i]);
    M.copyWithin(0, n);
    M.length -= n;
    this._dying = Math.max(0, this._dying - n);
    this._stale = true;
  }

  _add(x, y, z, glyph, size, color, alpha, rot, owner) {
    if (!Number.isFinite(x + y + z + size + rot)) return;
    const M = this.marks;
    if (M.length >= this.cap) {
      // the oldest share starts to fade (update): new marks still come while it does; only a batch
      // past its headroom (a flood within the fade) drops the faded share at once
      if (!this._dying) {
        this._dying = Math.max(1, Math.round(this.cap * SCAR.evict));
        this._dieT = 0;
      } else if (M.length >= this.cap + this._dying) this._evict(this._dying);
    }
    const m = this._spare.pop() ?? { x: 0, y: 0, z: 0, glyph: '.', size: 0, color: [0, 0, 0], alpha: 1, rot: 0, owner: -1 };
    m.x = x; m.y = y; m.z = z; m.glyph = glyph; m.size = size; m.alpha = alpha; m.rot = rot; m.owner = owner;
    m.color[0] = color[0]; m.color[1] = color[1]; m.color[2] = color[2];
    M.push(m);
    if (!this._stale) this._spawn(m);
    this._dirty = true;
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
    this._dirty = true;
    if (!this.sys) return;
    this.sys.clear();
    const M = this.marks;
    for (let i = 0; i < M.length; i++) this._spawn(M[i]);
  }

  // ---------------------------------------------------------------- the kinds of blow

  /**
   * A blow met the ground (world.groundBlow): the floor keeps a mark of its kind until the reset.
   * `o`: { kind: 'slam' | 'cut' | 'thrust' | 'dash' | 'blast' | 'step' | 'beam', power, r, dx, dz, len,
   * by, hot, claws (a cut: n parallel gashes, a beast's), arc (a dash / cut: round (x, z) at r, len m of
   * arc from the angle of (dx, dz): an ankle sweep) }. Returns the glyphs it laid.
   */
  mark(x, z, o) {
    if (!o || !this.on || !Number.isFinite(x + z)) return 0;
    const K = SCAR.mark, kind = o.kind;
    let power = Number(o.power);
    if (!(power >= K.min) || !KINDS.includes(kind)) return 0;
    if (o.by === 'player') power *= K.by.player;
    const n0 = this.marks.length;
    let dx = Number(o.dx), dz = Number(o.dz);
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) {
      dx /= dl;
      dz /= dl;
    } else {
      const a = rnd() * TAU;
      dx = Math.cos(a);
      dz = Math.sin(a);
    }
    const r = Number.isFinite(o.r) && o.r > 0 ? o.r : NaN;
    const len = Number.isFinite(o.len) && o.len > 0 ? o.len : NaN;
    // (the merge: a mark of this kind already near here thins this one)
    const size = kind === 'slam' || kind === 'blast' ? this._roundR(kind, power, r) : 1;
    const mx = kind === 'cut' || kind === 'dash' || kind === 'beam' ? x + dx * (o.arc ? 0 : (len || 1) * 0.5) : x;
    const mz = kind === 'cut' || kind === 'dash' || kind === 'beam' ? z + dz * (o.arc ? 0 : (len || 1) * 0.5) : z;
    const keep = kind === 'beam' ? 1 : this._merge(mx, mz, size, kind);
    if (keep <= 0) return 0;
    switch (kind) {
      case 'slam': this._slam(x, z, power, size, keep, r); break;
      case 'cut': this._cut(x, z, dx, dz, power, len, keep, o.claws | 0, o.arc ? r : 0); break;
      case 'thrust': this._thrust(x, z, dx, dz, power, keep); break;
      case 'dash': this._dash(x, z, dx, dz, power, len, keep, o.arc ? r : 0); break;
      case 'blast': this._blast(x, z, power, size, keep, !!o.hot); break;
      case 'beam': this._beam(x, z, dx, dz, power, len, !!o.hot || o.hot === undefined); break;
      case 'step': this._step(x, z, dx, dz, power); break;
    }
    const n = this.marks.length - n0;
    if (n > 0) {
      this.made[kind]++;
      this.kinds++;
    }
    return Math.max(0, n);
  }

  /** A round mark's radius (a slam's, a blast's): by its power, never past the blow's own reach. */
  _roundR(kind, power, r) {
    const T = SCAR.mark[kind];
    let R = T.r[0] + (power - 0.3) * T.rk;
    if (Number.isFinite(r)) R = Math.min(R, Math.max(T.r[0], r * 0.6));
    return Math.min(T.r[1], Math.max(T.r[0], R));
  }

  /** The share of a new mark's glyphs kept: thinned by each older mark of its kind near (x, z). */
  _merge(x, z, size, kind) {
    const G = SCAR.mark.merge, A = this._near, k = KINDS.indexOf(kind), now = Number(this.game.time) || 0;
    let same = 0;
    for (let i = 0; i < this._nearN; i++) {
      const j = i * 6;
      if (A[j + 3] !== k) continue;
      const near = G.near * Math.max(size, A[j + 2]), d2 = (A[j] - x) ** 2 + (A[j + 1] - z) ** 2;
      // (the same blow told twice, by its actor and by the engine: the second is not drawn)
      if (d2 < 0.25 * near * near && Math.abs(now - A[j + 5]) < G.twice) return 0;
      if (d2 < near * near) same = Math.max(same, ++A[j + 4]);
    }
    const j = (this._nearK % G.slots) * 6;
    this._nearK++;
    this._nearN = Math.min(G.slots, this._nearN + 1);
    A[j] = x; A[j + 1] = z; A[j + 2] = size; A[j + 3] = k; A[j + 4] = 0; A[j + 5] = now;
    if (!same) return 1;
    const keep = G.keep ** same;
    return keep < G.floor ? (same > 6 ? 0 : G.floor) : keep;
  }

  _slam(x, z, power, R, keep, rBlow) {
    const T = SCAR.mark.slam, K = SCAR.mark, y = K.y;
    const k = clamp01((power - 0.3) / 1.5);
    // the biggest reuse today's crater rim (and its charred disc, which world.impact lays)
    if (power >= SCAR.crater.min) this.crater(x, z, Math.max(R, Math.min(Number.isFinite(rBlow) ? rBlow : 9, 1.2 + power * 1.1)), power, keep);
    else {
      const n = Math.max(3, Math.round((T.grit[0] + (T.grit[1] - T.grit[0]) * k) * keep));
      const a0 = rnd() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU + (rnd() - 0.5) * 0.7, d = R * (0.78 + 0.38 * rnd());
        this._add(x + Math.cos(a) * d, y + 0.03, z + Math.sin(a) * d, pick(T.glyphs), 0.2 + rnd() * 0.18 + 0.1 * k, K.grit, K.alpha, rnd() * TAU, -1);
      }
    }
    // the crushed middle and short radial cracks out to the rim
    this._add(x + (rnd() - 0.5) * 0.15, y, z + (rnd() - 0.5) * 0.15, pick('x+*'), 0.36 + 0.2 * k, this.ink, K.alpha, rnd() * 3, -1);
    const spokes = Math.max(2, Math.round((T.spokes[0] + (T.spokes[1] - T.spokes[0]) * k) * Math.sqrt(keep)));
    const s0 = rnd() * TAU;
    for (let s = 0; s < spokes; s++) {
      let a = s0 + (s / spokes) * TAU + (rnd() - 0.5) * 0.8;
      const reach = R * (0.85 + 0.45 * rnd());
      for (let d = 0.3; d < reach; d += 0.34) {
        a += (rnd() - 0.5) * 0.25;
        const ca = Math.cos(a), sa = Math.sin(a);
        this._add(x + ca * d, y, z + sa * d, '-', T.crack * (1 - 0.4 * (d / reach)), this.ink, K.alpha * 0.9, groundRot(ca, sa), -1);
      }
    }
  }

  /** One long thin gash along (dx, dz) from (x, z), or `claws` parallel ones; `arc` > 0: round (x, z). */
  _cut(x, z, dx, dz, power, len, keep, claws, arc) {
    const T = SCAR.mark.cut, K = SCAR.mark, y = K.y;
    const k = clamp01((power - 0.2) / 1.2);
    const L = Math.min(T.len[1], Math.max(T.len[0], Number.isFinite(len) ? len : T.len[0] + 1.6 * k));
    const lines = claws > 1 ? Math.min(4, claws) : 1;
    const bow = (rnd() - 0.5) * 2 * T.bow * L;
    const px = -dz, pz = dx; // (across the gash)
    const a0 = Math.atan2(dz, dx);
    for (let c = 0; c < lines; c++) {
      const off = lines > 1 ? (c - (lines - 1) / 2) * T.claws : 0;
      const Lc = L * (lines > 1 ? 0.75 + 0.25 * rnd() : 1);
      const steps = Math.max(2, Math.round(Lc / T.step));
      for (let i = 0; i <= steps; i++) {
        if (keep < 1 && rnd() > keep + 0.25) continue;
        const t = i / steps, s = t * Lc;
        // a clean line: a gentle bow, tapered at both ends (a blade goes in and comes out)
        const taper = Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88));
        let cx, cz, ux, uz;
        if (arc > 0) {
          const a = a0 + (s + off * 0) / arc;
          const rr = arc + off;
          cx = x + Math.cos(a) * rr;
          cz = z + Math.sin(a) * rr;
          ux = -Math.sin(a);
          uz = Math.cos(a);
        } else {
          const b = bow * Math.sin(Math.PI * t) + off;
          cx = x + dx * s + px * b;
          cz = z + dz * s + pz * b;
          ux = dx;
          uz = dz;
        }
        this._add(cx, y, cz, '-', lerp(T.size[0], T.size[1], k) * (0.55 + 0.45 * taper), this.lineInk, K.alpha * (0.6 + 0.4 * taper), groundRot(ux, uz), -1);
      }
    }
    // a little grit thrown to one side of it
    const side = rnd() < 0.5 ? -1 : 1;
    const n = Math.round((T.grit[0] + (T.grit[1] - T.grit[0]) * k) * keep);
    for (let i = 0; i < n; i++) {
      const t = 0.25 + 0.6 * rnd(), s = t * L, d = side * (0.28 + 0.4 * rnd() + (lines - 1) * T.claws * 0.5);
      const cx = arc > 0 ? x + Math.cos(a0 + s / arc) * (arc + d) : x + dx * s + px * d;
      const cz = arc > 0 ? z + Math.sin(a0 + s / arc) * (arc + d) : z + dz * s + pz * d;
      this._add(cx, y + 0.02, cz, pick('.,\''), 0.18 + 0.12 * rnd(), K.grit, K.alpha, rnd() * TAU, -1);
    }
  }

  /** A point driven in at (x, z): a short deep nick along (dx, dz), a spray of grit ahead of it. */
  _thrust(x, z, dx, dz, power, keep) {
    const T = SCAR.mark.thrust, K = SCAR.mark, y = K.y;
    const k = clamp01((power - 0.2) / 1.2);
    const L = lerp(T.len[0], T.len[1], k), rot = groundRot(dx, dz);
    for (let s = -L * 0.5; s <= L * 0.5 + 1e-6; s += 0.2) this._add(x + dx * s, y, z + dz * s, '-', T.size * (1 - 0.3 * Math.abs(s) / L), this.lineInk, K.alpha, rot, -1);
    this._add(x + dx * L * 0.5, y, z + dz * L * 0.5, pick('vx'), T.size * 0.8, this.ink, K.alpha, rot, -1);
    const n = Math.round((T.spray[0] + (T.spray[1] - T.spray[0]) * k) * keep);
    for (let i = 0; i < n; i++) {
      const a = (rnd() - 0.5) * 1.1, d = lerp(T.reach[0], T.reach[1], rnd()) * (0.6 + 0.4 * k);
      const ca = Math.cos(a), sa = Math.sin(a);
      const ux = dx * ca - dz * sa, uz = dz * ca + dx * sa;
      this._add(x + ux * d, y + 0.02, z + uz * d, pick('.,\'`'), 0.17 + 0.12 * rnd(), K.grit, K.alpha, rnd() * TAU, -1);
    }
  }

  /** A shallow furrow `len` m along (dx, dz) from (x, z): two scuffed edges, a heap where it ends. */
  _dash(x, z, dx, dz, power, len, keep, arc) {
    const T = SCAR.mark.dash, K = SCAR.mark, y = K.y;
    const k = clamp01((power - 0.2) / 1.2);
    const L = Math.min(T.len[1], Math.max(T.len[0], Number.isFinite(len) ? len : 1.5));
    const a0 = Math.atan2(dz, dx);
    const at = (s, d, out) => {
      if (arc > 0) {
        const a = a0 + s / arc;
        out[0] = x + Math.cos(a) * (arc + d);
        out[1] = z + Math.sin(a) * (arc + d);
        out[2] = groundRot(-Math.sin(a), Math.cos(a));
      } else {
        out[0] = x + dx * s - dz * d;
        out[1] = z + dz * s + dx * d;
        out[2] = groundRot(dx, dz);
      }
    };
    const P = this._col2;
    const w = T.w * (0.8 + 0.5 * k);
    for (let s = 0; s <= L; s += T.step) {
      // (a furrow is shallow: its edges come and go, it is deepest toward its end)
      const deep = 0.45 + 0.55 * (s / L);
      for (const side of [-1, 1]) {
        if (rnd() > (0.55 + 0.4 * deep) * keep + 0.1) continue;
        at(s + (rnd() - 0.5) * 0.12, side * w * (0.85 + 0.3 * rnd()), P);
        this._add(P[0], y, P[1], rnd() < 0.8 ? '-' : '~', T.size * (0.75 + 0.3 * rnd()), this.lineInk, T.alpha * deep, P[2] + (rnd() - 0.5) * 0.2, -1);
      }
      if (rnd() < 0.3 * keep) {
        at(s, (rnd() - 0.5) * w, P);
        this._add(P[0], y + 0.01, P[1], pick('.,'), 0.17, K.grit, T.alpha, rnd() * TAU, -1);
      }
    }
    // the heap of earth pushed up where it stopped
    const n = Math.round((3 + 4 * k) * keep);
    for (let i = 0; i < n; i++) {
      at(L + 0.1 + 0.3 * rnd(), (rnd() - 0.5) * w * 2.4, P);
      this._add(P[0], y + 0.03, P[1], pick('.,:o'), 0.2 + 0.14 * rnd(), K.grit, K.alpha, rnd() * TAU, -1);
    }
  }

  /** Ki, a spell, an explosion at (x, z): a scorched round and a star of thin cracks; `hot` chars it. */
  _blast(x, z, power, R, keep, hot) {
    const T = SCAR.mark.blast, K = SCAR.mark, y = K.y;
    const k = clamp01((power - 0.3) / 1.5);
    const dark = hot ? T.char : this.ink;
    const n = Math.round((T.dots[0] + (T.dots[1] - T.dots[0]) * k) * keep);
    for (let i = 0; i < n; i++) {
      // (denser toward the middle: the round is scorched, not ringed)
      const a = rnd() * TAU, d = R * 0.7 * Math.sqrt(rnd()) * (0.5 + 0.5 * rnd());
      this._add(x + Math.cos(a) * d, y, z + Math.sin(a) * d, pick(T.glyphs), 0.24 + 0.16 * rnd(), dark, K.alpha * 0.85, rnd() * TAU, -1);
    }
    const spokes = Math.max(3, Math.round((T.spokes[0] + (T.spokes[1] - T.spokes[0]) * k) * Math.sqrt(keep)));
    const s0 = rnd() * TAU;
    for (let s = 0; s < spokes; s++) {
      let a = s0 + (s / spokes) * TAU + (rnd() - 0.5) * 0.5;
      const reach = R * (0.9 + 0.5 * rnd());
      for (let d = R * 0.45; d < reach; d += 0.32) {
        a += (rnd() - 0.5) * 0.3;
        const ca = Math.cos(a), sa = Math.sin(a);
        // (thin cracks: smaller strokes than a slam's)
        this._add(x + ca * d, y, z + sa * d, '-', 0.32 * (1 - 0.35 * ((d - R * 0.45) / reach)), this.ink, K.alpha * 0.85, groundRot(ca, sa), -1);
      }
    }
    if (hot) this._char(x, z, R * 0.8, K.char.blast);
  }

  /** A beam's trench `len` m along (dx, dz) from (x, z): charred edges and a glassy middle. */
  _beam(x, z, dx, dz, power, len, hot) {
    const T = SCAR.mark.beam, K = SCAR.mark, y = K.y;
    const k = clamp01((power - 0.3) / 1.2);
    const L = Math.min(T.len[1], Math.max(T.len[0], Number.isFinite(len) ? len : 1.4));
    const rot = groundRot(dx, dz), px = -dz, pz = dx, w = T.w * (0.85 + 0.4 * k);
    for (let s = 0; s < L; s += T.step) {
      for (const side of [-1, 1]) {
        const d = side * w * (0.9 + 0.25 * rnd());
        this._add(x + dx * s + px * d, y, z + dz * s + pz * d, '-', 0.34 + 0.06 * rnd(), this.lineInk, K.alpha, rot + (rnd() - 0.5) * 0.12, -1);
      }
      // the glass: a pale sheen down the middle, every other cell (dim: never a lit line)
      if (rnd() < 0.55) this._add(x + dx * s + px * (rnd() - 0.5) * w * 0.5, y + 0.01, z + dz * s + pz * (rnd() - 0.5) * w * 0.5, rnd() < 0.7 ? '=' : '~', 0.3, T.glass, T.glassAlpha, rot, -1);
    }
    if (hot) for (let s = 0; s < L; s += 0.9) this._char(x + dx * s, z + dz * s, w * 1.6, K.char.beam);
  }

  /** A heavy foot at (x, z): a faint print, toes toward (dx, dz); none within SCAR.mark.step.gap of the last. */
  _step(x, z, dx, dz, power) {
    const T = SCAR.mark.step, K = SCAR.mark, y = K.y;
    if (!(power >= T.min)) return;
    const l = this._lastStep;
    if (Number.isFinite(l[0]) && (l[0] - x) ** 2 + (l[1] - z) ** 2 < T.gap * T.gap) return;
    l[0] = x;
    l[1] = z;
    const k = clamp01((power - T.min) / 1.2), s = 0.6 + 0.4 * k;
    // a pad and three toes fanned ahead
    this._add(x, y, z, pick('o.'), 0.3 * s, this.ink, T.alpha, 0, -1);
    for (let i = -1; i <= 1; i++) {
      const a = i * 0.45, ca = Math.cos(a), sa = Math.sin(a);
      const ux = dx * ca - dz * sa, uz = dz * ca + dx * sa;
      this._add(x + ux * 0.42 * s, y, z + uz * 0.42 * s, '-', 0.26 * s, this.ink, T.alpha, groundRot(ux, uz), -1);
    }
  }

  /** The scorch map charred round (x, z) only where no grass grows (its fuel is under FIRE.minFuel
   *  whatever the char: no fire burns differently), deterministic, no heat. */
  _char(x, z, r, k) {
    const w = this.game.world, s = w?.scorch, f = w?.fire;
    if (!s?.burn || !s.data || !(r > 0) || !Number.isFinite(x + z)) return;
    const density = typeof f?.density === 'function' ? f.density : null;
    if (!density) return;
    const N = s.size, c = s.cellSize, min = s.min;
    const c0x = Math.max(0, Math.floor((x - r - min) / c)), c1x = Math.min(N - 1, Math.floor((x + r - min) / c));
    const c0z = Math.max(0, Math.floor((z - r - min) / c)), c1z = Math.min(N - 1, Math.floor((z + r - min) / c));
    let any = false;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const wx = min + (cx + 0.5) * c, wz = min + (cz + 0.5) * c;
        const d = Math.hypot(wx - x, wz - z);
        if (d > r) continue;
        if (!(density(wx, wz) < FIRE.minFuel)) continue;
        const i = cz * N + cx, v = Math.min(1, k * (1 - d / r) * 1.4);
        if (v <= s.burn[i]) continue;
        s.burn[i] = v;
        s.data[i * 4] = Math.round(v * 255);
        any = true;
      }
    }
    if (any) s.dirty = true;
  }

  // ---------------------------------------------------------------- today's marks

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
   * blow (SCAR.crater). The charred floor inside it is the scorch map's (world.impact). `keep` thins it.
   */
  crater(x, z, r, power, keep = 1) {
    const C = SCAR.crater;
    if (!Number.isFinite(x + z + r + power) || !(r > 0.3)) return;
    const k = Math.min(1, Math.max(0, (power - C.min) / 1.3));
    const n = Math.max(4, Math.round((C.ring[0] + (C.ring[1] - C.ring[0]) * k) * keep));
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
    let w = 0, gone = 0;
    for (let i = 0; i < M.length; i++) {
      const m = M[i];
      if (m.owner === owner) {
        this._spare.push(m);
        if (i < this._dying) gone++;
      } else M[w++] = m;
    }
    if (w !== M.length) {
      M.length = w;
      this._dying = Math.max(0, this._dying - gone);
      this._stale = true;
    }
  }

  reset() {
    for (let i = 0; i < this.marks.length; i++) this._spare.push(this.marks[i]);
    this.marks.length = 0;
    this._stale = false;
    this._dirty = false;
    this._dying = 0;
    this._nearN = this._nearK = 0;
    this._lastStep[0] = this._lastStep[1] = NaN;
    for (const k of KINDS) this.made[k] = 0;
    this.kinds = 0;
    this.sys?.clear();
  }

  setVisible(on) {
    if (this.sys?.mesh) this.sys.mesh.visible = !!on;
  }

  update(dt, time) {
    if (this._dying > 0) {
      // the oldest share fades out, then goes (one rebuild)
      this._dieT += Number.isFinite(dt) && dt > 0 ? dt : 0;
      const f = clamp01(1 - this._dieT / SCAR.fade);
      if (f <= 0) this._evict(this._dying);
      else if (this.sys && !this._stale) {
        const D = this.sys.data, M = this.marks, n = Math.min(this._dying, this.sys.count, M.length);
        for (let i = 0; i < n; i++) D[i * PF + 16] = D[i * PF + 17] = M[i].alpha * f;
        this._dirty = true;
      }
    }
    if (this._stale) this._refill();
    // (the batch's buffers are written only when something changed: the marks do not move)
    if (this._dirty && this.sys) {
      this._dirty = false;
      this.sys.update(0, time);
    }
  }
}
