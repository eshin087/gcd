import { DuelFx, K_STEEL, K_SMOKE, K_FIRE } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// Gu Shan's effects (STYLE.md "The fire field"): his force is AIR, DUST AND BROKEN STONE, never a glow
// of qi (that is Tian Lei's). Pressure prints as level steel strokes, the dust wall that rises after a
// blow as smoke, and only where the air itself burns at the fist a short cool heart of fire (many small
// blobs, never one hot one). Nothing glows before the cue (ADR-118): The One Blow's charge is the
// engine's black charge, plus the air going still (dust and leaves drawn in toward the fist). Every
// jitter here draws from the LOOKS' stream (DuelFx.lr), never Math.random or a gameplay stream.
//   limbTrail(a.., b.., heavy)        a blow's smear off the striking hand
//   lane(x, z, dx, dz, len, w, k)     a line blow's pressure down its lane (?hermitBlow=a | b)
//   palmBurst(x, z, dx, dz, k)        the palm's push of air (a short lane)
//   crater(x, z, r, k)                a fist in the floor (Peak Falls, Heaven and Earth's last)
//   stamp(x, z, r, k)                 a transition's stamp / clap: the ring of air and dust
//   stillAir(x, y, z, k, dt)          The One Blow's charge: the air drawn in (per frame)
//   afterimage(d, x0, z0, x1, z1)     One Step: he is gone, the shape left behind
//   slide(x, z, dx, dz, k)            the hero thrown (a Last Breath, a shattered guard): the dust trail
//   skin(x, y, z, dx, dz)             a cut in his windup: sparks off the gathered qi
// The fissure (Split Earth) is a crescent of the pool drawn by _drawCrescent (style 'fissure').

const TAU = Math.PI * 2;
const STONE = [0.42, 0.4, 0.37];
const STONE_END = [0.12, 0.11, 0.1];
const DUSTC = [0.34, 0.32, 0.29];
const DUST_END = [0.1, 0.1, 0.09];
const LEAF = [0.32, 0.36, 0.2];
const LEAF_END = [0.12, 0.13, 0.08];
const GRIT = ".,:'`";
const CHIPS = '#%&,.:';
const L_DUST = [0.9, 0.85, 0.75];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The lane's look (`?hermitBlow=`): a = steel strokes and dust (the author's pick), b = a burning core. */
export const hermitBlowLook = () => (lookOf('hermitBlow', 'a', 'a') === 'b' ? 'b' : 'a');

export class HermitFx extends DuelFx {
  constructor(d) {
    super(d);
    this._stillAcc = 0;
  }

  // ---------------------------------------------------------------- blows
  /** A blow's smear off the striking hand (its point last frame → now): a faint pale stroke and a
   *  little dust; heavier for a red or black blow. ~4 - 12 blobs a frame. */
  limbTrail(ax, ay, az, bx, by, bz, heavy) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz)) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az, st = Math.hypot(dx, dy, dz);
    if (!(st > 0.03 && st < 4)) return;
    this._ink(ax, ay, az, bx, by, bz, this.lrand(0.14, 0.2), heavy ? 0.6 : 0.4, 0, heavy ? 0.7 : 0.5, 1);
    const n = Math.max(1, Math.round(st / 0.3));
    for (let i = 0; i < n; i++) {
      const u = (i + this.lr()) / n;
      this._blob(ax + dx * u, Math.max(0.75, ay + dy * u), az + dz * u, this.lrand(-0.2, 0.2), this.lrand(0.1, 0.4), this.lrand(-0.2, 0.2), this.lrand(0.3, 0.5), 0.34, 0.6, heavy ? 0.4 : 0.3, 0, K_SMOKE, 1.5);
    }
  }

  /**
   * A line blow's pressure from (x, z) along (dx, dz) for `len` m, `w` wide (The One Blow: the whole
   * lane; Idle Finger: a thin one; k its weight). Option a: rows of level steel strokes racing down
   * the lane at waist height, the dust wall rising behind them, a short cool heart at the fist.
   * Option b: the same with a core of fire down the middle. ~150 - 500 blobs, once.
   */
  lane(x, z, dx, dz, len, w, k = 1) {
    if (!this.fire || !Number.isFinite(x + z + dx + dz + len + w)) return;
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, px = -uz, pz = ux;
    k = Math.max(0.2, Math.min(2, fin(k, 1)));
    const burn = hermitBlowLook() === 'b';
    // the pressure: level strokes, several rows across the lane, thrown down it
    const rows = Math.max(2, Math.round(w / 0.35)), steps = Math.min(40, Math.max(4, Math.round(len / 0.6)));
    for (let r = 0; r < rows; r++) {
      const off = ((r + 0.5) / rows - 0.5) * w, y = 0.9 + this.lrand(-0.35, 0.45);
      for (let i = 0; i < steps; i++) {
        const u = (i + this.lr() * 0.6) / steps, sx = x + ux * len * u + px * off, sz = z + uz * len * u + pz * off;
        const sp = this.lrand(9, 16) * k;
        this._blob(sx, y, sz, ux * sp, this.lrand(-0.2, 0.2), uz * sp, this.lrand(0.1, 0.18) + 0.08 * u, 0.3, 0.12, 0.5 + 0.25 * k * (1 - u), 0, K_STEEL, 5);
      }
    }
    // the edges of the lane: two long strokes at waist height
    for (const s of [-1, 1]) this._ink(x + px * s * w * 0.5, 0.9, z + pz * s * w * 0.5, x + ux * len + px * s * w * 0.5, 0.9, z + uz * len + pz * s * w * 0.5, this.lrand(0.16, 0.24), 0.55 * k, 0, 0.3 * k, 0);
    // the dust wall rising after it, along the whole lane
    const dn = Math.min(60, Math.round(len * 1.4 * k));
    for (let i = 0; i < dn; i++) {
      const u = this.lr(), off = this.lrand(-0.6, 0.6) * w, sx = x + ux * len * u + px * off, sz = z + uz * len * u + pz * off;
      this._blob(sx, this.lrand(0.75, 1.0), sz, ux * this.lrand(0.5, 2) + px * off * 0.6, this.lrand(0.4, 1.4), uz * this.lrand(0.5, 2) + pz * off * 0.6, this.lrand(0.9, 1.6), 0.6, 1.8, 0.5, 0, K_SMOKE, 1.4, 0.3);
    }
    // grit torn off the floor
    for (let i = 0, n = Math.round(len * 1.2 * k); i < n; i++) {
      const u = this.lr(), sx = x + ux * len * u + px * this.lrand(-0.5, 0.5) * w, sz = z + uz * len * u + pz * this.lrand(-0.5, 0.5) * w;
      const o = this._rec(sx, 0.15, sz, this.lrand(0.4, 0.8), this.lrand(0.16, 0.26), 0.08, GRIT, DUSTC, DUST_END);
      o.vx = ux * this.lrand(2, 7) + this.lrand(-1, 1);
      o.vy = this.lrand(0.6, 2.4);
      o.vz = uz * this.lrand(2, 7) + this.lrand(-1, 1);
      o.drag = 2.4;
      o.gravity = -5;
      this._spawn(this.alpha, o);
    }
    // where the air burns at the fist: a short heart of many small, cool blobs (option b: down the lane)
    const hn = burn ? Math.min(140, Math.round(len * 9)) : 14;
    const hl = burn ? len : 1.2;
    for (let i = 0; i < hn; i++) {
      const u = burn ? this.lr() : this.lr() * this.lr(), sx = x + ux * hl * u + px * this.lrand(-0.12, 0.12), sz = z + uz * hl * u + pz * this.lrand(-0.12, 0.12);
      this._blob(sx, this.lrand(0.95, 1.25), sz, ux * this.lrand(1, 5), this.lrand(0, 0.6), uz * this.lrand(1, 5), burn ? this.lrand(0.25, 0.45) : this.lrand(0.12, 0.24), burn ? 0.34 : 0.2, 0.08, burn ? 1.0 * (1 - 0.4 * u) : 0.45, 0, K_FIRE, burn ? 1.5 : 3);
    }
    this.game.shake?.(0.35 * k);
    this._light({ x: x + ux * 1.5, y: 1.2, z: z + uz * 1.5, color: L_DUST, intensity: 3 * k, radius: 8, life: 0.25, fade: 0.2 });
  }

  /** The palm's push of air (x, z) along (dx, dz): a short lane of strokes and a puff of dust. */
  palmBurst(x, z, dx, dz, k = 1) {
    this.lane(x, z, dx, dz, 3.5 * Math.max(0.5, k), 1.1, 0.7 * k);
    this.dust(x + dx * 0.6, z + dz * 0.6, 0.8 * k);
  }

  /** A fist driven into the floor at (x, z): the ragged dust front, chips of stone, the dust that
   *  hangs; draws only (the blow calls the world). ~120 - 220 blobs, once. */
  crater(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r + k) || !(r > 0)) return;
    k = Math.max(0.3, Math.min(2.2, k));
    this.shock(x, z, r * 1.2, this._opt(0.7 + 0.4 * k, 0.06, 'dust', 0, k > 1.2));
    for (let i = 0, n = Math.round(18 * k); i < n; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2, 7) * Math.min(1.5, k), rr = this.lrand(0, 0.5 * r);
      const o = this._rec(x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, this.lrand(0.5, 1.0), this.lrand(0.16, 0.26), 0.08, CHIPS, STONE, STONE_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(3, 8) * Math.min(1.4, k);
      o.vz = Math.sin(a) * sp;
      o.drag = 1.2;
      o.gravity = -14;
      o.spin = this.lrand(-6, 6);
      this._spawn(this.alpha, o);
    }
    for (let i = 0; i < Math.round(10 * k); i++) {
      const a = this.lr() * TAU, sp = this.lrand(0.6, 2.4);
      this._blob(x + Math.cos(a) * 0.5, this.lrand(0.75, 1.1), z + Math.sin(a) * 0.5, Math.cos(a) * sp, this.lrand(0.3, 1.2), Math.sin(a) * sp, this.lrand(0.9, 1.6), 0.7, 1.9, 0.55, 0, K_SMOKE, 1.5, 0.5);
    }
    this.game.world?.scorch?.burnCircle?.(x, z, r * 0.4, 0.2 * Math.min(1.5, k), 0);
    this.game.shake?.(0.3 * k);
  }

  /** A transition's stamp or clap at (x, z): the ring of air out to r, the dust lifted off the whole
   *  ledge with it, a crisp ripple at his waist. */
  stamp(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r) || !(r > 0)) return;
    this.shock(x, z, r, this._opt(1.4 * k, 0.05, 'dust', 0, true));
    this._airRipple(x, z, 1.1, 0.6, r * 1.05, 0.34 + 0.03 * r, 0.6, 0.42, 0.3, 0.25);
    for (let i = 0; i < 30; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(7, 13);
      this._blob(x + ca * 0.6, this.lrand(0.7, 1.5), z + sa * 0.6, ca * sp, this.lrand(-0.3, 0.6), sa * sp, this.lrand(0.18, 0.3), 0.3, 0.2, 0.6, 0, K_STEEL, 4);
    }
    this.crater(x, z, r * 0.4, k);
    this._light({ x, y: 1.3, z, color: L_DUST, intensity: 4, radius: r * 1.6, life: 0.3, fade: 0.25 });
  }

  /**
   * The One Blow's charge, every frame of it (k 0..1 toward the cue): the air goes still round him;
   * dust off the floor and leaves off the trees are drawn in toward his fist from a few metres out,
   * thicker toward the cue. Glyph particles only (nothing glows: the engine's black charge is the cue).
   */
  stillAir(x, y, z, k, dt) {
    if (!Number.isFinite(x + y + z + k + dt) || !(dt > 0)) return;
    this._stillAcc += dt * (12 + 50 * clamp01(k));
    while (this._stillAcc >= 1) {
      this._stillAcc -= 1;
      const a = this.lr() * TAU, r = this.lrand(2.2, 5.5), h = this.lrand(0.1, 2.2), leaf = this.lr() < 0.3;
      const lf = this.lrand(0.5, 0.9);
      const o = this._rec(x + Math.cos(a) * r, h, z + Math.sin(a) * r, lf, leaf ? 0.2 : 0.16, 0.06, leaf ? '~,' : GRIT, leaf ? LEAF : DUSTC, leaf ? LEAF_END : DUST_END);
      o.vx = (x - (x + Math.cos(a) * r)) / lf;
      o.vy = (y - h) / lf;
      o.vz = (z - (z + Math.sin(a) * r)) / lf;
      o.alpha = 0.3;
      o.alphaEnd = 0.9;
      o.spin = leaf ? this.lrand(-4, 4) : 0;
      this._spawn(this.alpha, o);
    }
  }

  /** One Step: he is gone from (x0, z0) and stands at (x1, z1): the shape he leaves (a pale ghost
   *  printed from his body), a line of dust between, a puff at each end. */
  afterimage(d, x0, z0, x1, z1) {
    if (!Number.isFinite(x0 + z0 + x1 + z1)) return;
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ux = len > 1e-3 ? dx / len : 0, uz = len > 1e-3 ? dz / len : 0;
    const gx = d?.position ? x0 - d.position.x : 0, gz = d?.position ? z0 - d.position.z : 0;
    if (d) this.ghost(d, this._ghostOpt(ux * 1.2, uz * 1.2, 0.7, 0, gx, gz));
    for (let i = 0; i < 2; i++) this._ink(x0 + dx * 0.3, 0.7 + i * 0.6, z0 + dz * 0.3, x1, 0.7 + i * 0.6, z1, this.lrand(0.16, 0.24), 0.14, 0, 0.7);
    this.dust(x0, z0, 0.8);
    this.dust(x1, z1, 1.0);
  }

  /** The hero thrown from (x, z) along (dx, dz) (a Last Breath, a shattered guard): a trail of dust
   *  and grit where he will slide (k: its length / 10 m). */
  slide(x, z, dx, dz, k = 1) {
    if (!Number.isFinite(x + z + dx + dz + k)) return;
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, len = Math.max(1, 8 * k);
    for (let i = 0, n = Math.round(14 * k) + 4; i < n; i++) {
      const u = this.lr(), sx = x + ux * len * u, sz = z + uz * len * u;
      this._blob(sx, this.lrand(0.75, 0.95), sz, ux * this.lrand(1, 4), this.lrand(0.2, 0.8), uz * this.lrand(1, 4), this.lrand(0.6, 1.1), 0.5, 1.3, 0.45, 0, K_SMOKE, 2, 0.3);
      const o = this._rec(sx, 0.12, sz, this.lrand(0.4, 0.8), this.lrand(0.16, 0.24), 0.08, GRIT, DUSTC, DUST_END);
      o.vx = ux * this.lrand(3, 8);
      o.vy = this.lrand(0.4, 2);
      o.vz = uz * this.lrand(3, 8);
      o.drag = 2.4;
      o.gravity = -6;
      this._spawn(this.alpha, o);
    }
  }

  /** A cut that lands in his windup: it only bites (TUNING.skin): sparks off the gathered qi. */
  skin(x, y, z, dx, dz) {
    if (!Number.isFinite(x + y + z)) return;
    for (let i = 0; i < 8; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2, 5);
      const o = this._rec(x, y, z, this.lrand(0.2, 0.36), 0.14, 0.04, "'+.", [1.6, 1.6, 1.7], [0.3, 0.3, 0.35]);
      o.vx = Math.cos(a) * sp + fin(dx) * 2;
      o.vy = this.lrand(0.5, 3);
      o.vz = Math.sin(a) * sp + fin(dz) * 2;
      o.drag = 3;
      o.gravity = -6;
      this._spawn(this.add, o);
    }
  }

  // ---------------------------------------------------------------- the fissure (the crescent pool)
  /** Split Earth's fissure (a crescent of style 'fissure'): a ragged crack running along the floor at
   *  its head, chips thrown up, dust behind. Others draw as the pool draws them. */
  _drawCrescent(c, ember) {
    if (c.style !== 'fissure') return super._drawCrescent(c, ember);
    if (!this.fire) return;
    const life = this._frame();
    const px = -c.dz, pz = c.dx;
    if (life > 0) {
      // the crack's head: a short ragged line across the way, low on the floor
      for (let i = -3; i <= 3; i++) {
        const o = i * 0.16 + this.lrand(-0.05, 0.05);
        this._blob(c.x + px * o, 0.35, c.z + pz * o, 0, 0, 0, life, 0.32, 0.32, 0.7 - 0.08 * Math.abs(i), 0.7 - 0.08 * Math.abs(i), K_STEEL);
      }
    }
    if (this.lr() < 0.7) {
      const o = this._rec(c.x + px * this.lrand(-0.4, 0.4), 0.2, c.z + pz * this.lrand(-0.4, 0.4), this.lrand(0.4, 0.8), this.lrand(0.16, 0.24), 0.08, CHIPS, STONE, STONE_END);
      o.vx = c.dx * this.lrand(1, 4);
      o.vy = this.lrand(2, 5);
      o.vz = c.dz * this.lrand(1, 4);
      o.drag = 1.2;
      o.gravity = -12;
      this._spawn(this.alpha, o);
    }
    if (this.lr() < 0.5) this._blob(c.x, this.lrand(0.75, 0.95), c.z, this.lrand(-0.3, 0.3), this.lrand(0.3, 0.9), this.lrand(-0.3, 0.3), this.lrand(0.7, 1.2), 0.5, 1.4, 0.45, 0, K_SMOKE, 1.5, 0.3);
  }
}
