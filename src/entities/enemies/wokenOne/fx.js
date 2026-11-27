import { AscFx, ASC_WORLD } from '../ascendant/fx.js';
import { K_VOID, K_SMOKE, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { FIRE_PALETTES } from '../../../render/firePalettes.js';
import { drawGunMuzzle, drawGunSlug } from './fxIron.js';

// Xin Yi's effects (ADR-156): Tian Lei's effects class (AscFx: LordFx's pool of thrown things grown to
// 24, blasts that cover stops, the perfect parry's return, the craters, the stance's glow) with the
// CODE palette in the fire field's void slot (FIRE_PALETTES.code: here K_VOID is the falling script's
// green). Every effect of his prints in it: the shots and their trails, the palm's stilled air, the
// afterimages, the shock fronts, the Bend's wake. Heat in the void slot prints as DIGITS (the field's
// body and heart are its digit sets), so his effects read as written code without a glyph style of
// their own; glyph particles are only small things of one letter cell (loose digits, chips).
//
// TELLS KEEP THEIR COLOURS (white, blue, red, black: the engine's tellFlash / hazardFlash / charge and
// the flares and glints they leave): nothing green is ever a cue. The colour turning below (gold,
// violet, storm blue and white glyphs and lights of the inherited draws turned to the code's greens)
// runs ONLY inside his own drawing methods (GREEN_DRAW) and never inside a cue's (CUE_DRAW): a red or
// white cue drawn from inside his shots' update (the shots' hazard flash) keeps its colour. The fire
// field's two tint zones are left to the cues (a zone of ours could push a cue's flare out).
//
// THE CONTRACT (wokenOne.js, iron.js and source.js call these; world metres, `ph` = phase 1..3; a
// method with `dt` is called every frame while its thing lasts, the others once). Inherited from AscFx
// and used as they are: throwShot / updateShots (blasts: `kind: 'blast'`, `size`, `returnable`; the
// Lord's 'stone'), muzzle, crater, vanish, stanceGlow, transformGather, limbTrail.
//   (the blasts' drawing)                 _drawBlast: a gun shot (`s.iron`) a short bright slug and a thin
//                                         trail, a heavy one (`s.heavy`) bigger with rings in its wake; a
//                                         palm bolt (`s.bolt`, or any other blast of his) a ball of green
//                                         script; a returned one hotter, ringed, flying back
//   bendWake(d, dx, dz)                   THE BEND: thin rings in the shot's wake over his chest, three afterimages
//   afterimages(d, n)                     n afterimages where he stands (the Lean: one)
//   heldBolt(x, y, z, k, dt)              a returned bolt hanging before his palm (THE STOP), humming
//   stopHum(x, y, z)                      the moment a bolt stops in the air: a ring of stilled air
//   sendBurst(x, y, z)                    the sent bolts burst (or an unsent one drops as loose digits)
//   codeColumn(x0, z0, x1, z1)            SKIPPED FRAMES: he tears into a column of digits, prints again
//                                         (flit is this: a blow of A Thousand Hands)
//   riseBurst(x, z, r)                    Leaving the Floor: the ring as he goes up
//   front(x, z, r, w, dt)                 the Falling Fist's front: a ring of heaving letters at r
//   passWake(ax, az, bx, bz, y)           the Low Pass's wake along its line
//   diveStream(d, k, dt)                  the Dive Within's charge: the hall's letters stream into his chest
//   gunsAway(d)                           the reload: both guns clatter away as loose digits
//   palmHold(d, dt)                       the Still Hand held after the rising (the air stilled round it)
//   lockStream(x, y, z, dt)               the blade lock on his palm: letters streaming round it (drawn by
//                                         update() itself while his reaction is the engine's 'lock' in
//                                         phase 3: nobody needs to call it)
//   fallStill(d)                          THE FALL: the moment he lands on his back
//   transformNova(x, z, r, form)          a transition's ring (A Hundred Iron Seeds, the rising): a front of
//                                         green, a column of falling code through him (no lightning)
//   ghost(d, o)                           an afterimage in green (DuelFx's options)
// Every drawing method runs on LordFx's private drawing stream (its rnd()) and the look stream (lr()):
// nothing here draws from the stream the AI reads, nor from Math.random.

const TAU = Math.PI * 2;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// glyph colours (HDR, the glyph particles' own): the code's green, a pale mint for the brightest
// letters (never white: a white cross or star is a cue), the hall's dim letters
const CODE = [0.55, 3.3, 1.05], CODE_END = [0.02, 0.5, 0.12];
const MINT = [1.9, 3.4, 2.2], MINT_END = [0.12, 0.9, 0.35];
const DIM = [0.22, 1.05, 0.4], DIM_END = [0.02, 0.3, 0.08];
const IRON = [0.42, 0.5, 0.46], IRON_END = [0.08, 0.1, 0.09]; // the guns' dark metal, as loose digits
const CHIP = [0.45, 0.48, 0.45], CHIP_END = [0.12, 0.13, 0.12]; // a floor slab's chips
// lights
const L_CODE = [0.36, 1.0, 0.5], L_MINT = [0.72, 1.0, 0.8];
// one-cell glyphs (all in the world atlas: npm test's glyph check)
const DIG = '0123456789';
const BITS = '01';
const SCRIPT = '0123456789:=+-';
const CLATTER = '=-[]071';
const CHIPS = '#%&';
// the blast's blow on the world (AscFx's: the floor burst's world.impact)
const BLAST_BLOW = Object.freeze({ kind: 'blast', by: 'boss', y: 1.0 });

// colour turning (inside his own draws only; see the header)
const violet = (c) => Array.isArray(c) && c[2] > c[0] * 1.05 && c[1] < c[2] * 0.62;
const goldish = (c) => Array.isArray(c) && c[0] > 0 && c[1] >= c[0] * 0.45 && c[1] <= c[0] && c[2] <= c[0] * 0.45 && (c[1] >= c[0] * 0.6 || c[2] < c[0] * 0.12);
const whitish = (c, lo) => Array.isArray(c) && Math.max(c[0], c[1], c[2]) >= lo && Math.min(c[0], c[1], c[2]) >= 0.72 * Math.max(c[0], c[1], c[2]);
const stormish = (c) => Array.isArray(c) && c[2] >= c[0] && c[2] >= c[1] && c[0] >= 0.3 * c[2] && c[1] >= 0.45 * c[2] && !violet(c);
const turnGlyph = (c) => {
  if (!Array.isArray(c)) return c;
  const m = Math.max(c[0], c[1], c[2]);
  if (goldish(c) || violet(c)) return m > 1.2 ? CODE : CODE_END;
  if (whitish(c, 1.2) || stormish(c)) return m > 1.2 ? MINT : MINT_END;
  return c;
};
const turnLight = (c) => {
  if (goldish(c) || violet(c)) return L_CODE;
  if (whitish(c, 0.6) || stormish(c)) return L_MINT;
  return c;
};

// his own drawing methods and the inherited ones he uses: on the drawing stream, colours turned
const GREEN_DRAW = [
  'bendWake', 'afterimages', 'heldBolt', 'stopHum', 'sendBurst', 'codeColumn', 'riseBurst', 'front', 'passWake', 'diveStream', 'gunsAway',
  'palmHold', 'lockStream', 'fallStill', 'flit', 'ghost', 'transformNova', 'transformGather', 'muzzle', 'crater', 'vanish', 'stanceGlow',
  'limbTrail', 'updateShots', '_drawPillar', '_frontSpawn', '_colsUpdate',
];
// the cues and the engine's moments: never turned (TELLS KEEP THEIR COLOURS)
const CUE_DRAW = [
  'tellFlash', 'hazardFlash', 'charge', 'updateFlares', 'updateGlints', 'warnRing', 'ringPulse', 'guard', 'clash', 'parrySpark', 'hitSpark',
  'breakBurst', 'stunStars',
];

export class WokenFx extends AscFx {
  constructor(d) {
    super(d);
    // the code's green in the fire field: this level borrows the void slot (AscFx set gold first)
    this.game.fx?.fire?.setPalette?.('void', FIRE_PALETTES.code);
    this._tone = 0; // > 0 inside one of his drawing methods: gold / violet / white turn green
    this._cue = 0; // > 0 inside a cue's drawing: nothing turns
    // every light asked for through the game (DuelFx._light, AscFx's super._light) passes the turning
    const real = this.game, self = this;
    const lights = {
      add(o) {
        const L = real.lights;
        if (!L?.add) return null;
        if (o && self._tone > 0 && self._cue === 0) o.color = turnLight(o.color);
        return L.add(o);
      },
    };
    this.game = new Proxy(real, {
      get(t, k) {
        if (k === 'lights') return t.lights ? lights : t.lights;
        return t[k];
      },
    });
    for (const n of GREEN_DRAW) {
      const f = this[n];
      if (typeof f !== 'function') continue;
      this[n] = function (a, b, c, d2, e, f2, g, h, i, j, k, l) {
        this._drawing++;
        this._tone++;
        try {
          return f.call(this, a, b, c, d2, e, f2, g, h, i, j, k, l);
        } finally {
          this._tone--;
          this._drawing--;
        }
      };
    }
    for (const n of CUE_DRAW) {
      const f = this[n];
      if (typeof f !== 'function') continue;
      this[n] = function (a, b, c, d2, e, f2, g, h, i, j, k, l) {
        this._cue++;
        try {
          return f.call(this, a, b, c, d2, e, f2, g, h, i, j, k, l);
        } finally {
          this._cue--;
        }
      };
    }
    // code columns alive (SKIPPED FRAMES, a transition's column): drawn every frame of their life
    this._cols = Array.from({ length: 5 }, () => ({ alive: false, mode: 'out', x: 0, z: 0, t: 0, T: 0.4, R: 0.5, H: 2.2, rate: 80, acc: 0, k: 1 }));
    this._streamAcc = 0;
    this._palmAcc = 0;
    this._lockAcc = 0;
    this._frontAcc = 0;
  }

  reset() {
    super.reset();
    for (const c of this._cols ?? []) c.alive = false;
  }

  update(dt, d) {
    super.update(dt, d);
    const fdt = this.game.fxDt ?? dt;
    this._colsUpdate(fdt);
    // THE BLADE LOCK on his palm (phase 3): the engine's lock reaction; drawn here, nobody calls it
    const R = d?.brain?.react;
    if (d && d.phase >= 3 && d.mode === 'react' && R?.kind === 'lock') {
      const h = d._hand;
      if (h && Number.isFinite(h.x + h.y + h.z)) this.lockStream(h.x, h.y, h.z, fdt);
    }
  }

  // ---------------------------------------------------------------- colour
  /** A glyph particle: inside his draws the inherited gold / violet / white / storm turn green / mint. */
  _spawn(pool, o) {
    if (o && this._tone > 0 && this._cue === 0) {
      o.color = turnGlyph(o.color);
      if (o.colorEnd) o.colorEnd = turnGlyph(o.colorEnd);
    }
    super._spawn(pool, o);
  }

  /** A light kept alive by being asked for every frame (AscFx's), its colour turned the same way. */
  _keep(key, x, y, z, color, intensity, radius, flicker = 0) {
    if (this._tone > 0 && this._cue === 0) color = turnLight(color);
    return super._keep(key, x, y, z, color, intensity, radius, flicker);
  }

  // ---------------------------------------------------------------- small pieces
  /** One glyph particle of one letter cell (the reused record), in the additive pool by default. */
  _letter(x, y, z, vx, vy, vz, life, glyph, color, colorEnd, size = 0.15, drag = 0, gravity = 0, alpha = 1, alphaEnd = 0, pool = this.add) {
    const o = this._rec(x, y, z, life, size, size * 0.85, glyph, color, colorEnd);
    o.vx = vx;
    o.vy = vy;
    o.vz = vz;
    o.drag = drag;
    o.gravity = gravity;
    o.alpha = alpha;
    o.alphaEnd = alphaEnd;
    this._spawn(pool, o);
  }

  /** A thin ring of green in the camera's plane round (x, y, z), thrown out from r0 at `sp` m/s. */
  _flatRing(x, y, z, r0, n, sp, life, size, heat, drag = 2) {
    const A = this._axes(), P = this._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
    const s0 = this.lr() * TAU;
    for (let i = 0; i < n; i++) {
      const a = s0 + (i / n) * TAU + this.lrand(-0.12, 0.12), ca = Math.cos(a), sa = Math.sin(a);
      const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
      this._blob(px + ux * r0, py + uy * r0, pz + uz * r0, ux * sp, uy * sp, uz * sp, life * this.lrand(0.85, 1.1), size, size * 1.2, heat * this.lrand(0.8, 1.15), 0, K_VOID, drag);
    }
  }

  /** A ripple of green over the floor from r0 to r1 in T s (DuelFx._airRipple's, in the code palette). */
  _codeRipple(x, z, y, r0, r1, T, heat, size, spacing = 0.3) {
    if (!(T > 0) || !Number.isFinite(x + z + y + r0 + r1 + T + heat)) return;
    const D = 1.6 / T, v0 = (r1 - r0) / this._reach(D, T);
    const n = Math.max(12, Math.min(120, Math.round((TAU * Math.max(r0, r1)) / spacing)));
    const p1 = this.lr() * TAU, p2 = this.lr() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ((i + this.lrand(-0.3, 0.3)) / n) * TAU;
      const st = 0.62 + 0.3 * Math.sin(3 * a + p1) + 0.22 * Math.sin(8 * a + p2) + this.lrand(-0.1, 0.1);
      if (st < 0.3) continue;
      const ca = Math.cos(a), sa = Math.sin(a), lob = 1 + 0.05 * Math.sin(3 * a + p2) + this.lrand(-0.03, 0.03);
      this._blob(x + ca * r0, y, z + sa * r0, ca * v0 * lob, 0, sa * v0 * lob, T * this.lrand(0.9, 1.05), size, size * 1.25, heat * st, heat * st * 0.5, K_VOID, D);
    }
  }

  /**
   * His body as last drawn, printed in green heat one blob per letter cell (DuelFx.ghost's recipe):
   * o = { ox, oz (m added to every point), life (s), heat, vx, vy, vz, j (jitter m/s), fall (m/s: the
   * letters fall instead, faster at the head), drag, step (2: every other point), glyphs (the share of
   * cells that also throw a loose digit) }. Returns the blobs spent.
   */
  _printBody(d, o) {
    if (!d || !this.fire) return 0;
    const n = this._bodyPts(d), P = this._gp;
    if (n < 12) return 0;
    const S = this._screen(d.position.x, 1, d.position.z), mpp = S.mpp, cell = S.cw * mpp, D = 12 * mpp, A = this._axes();
    const q = 1 / Math.max(0.02, cell), cells = this._gCells, step = o.step ?? 1, j = fin(o.j, 0.1);
    let y0 = Infinity;
    for (let i = 0; i < n; i++) y0 = Math.min(y0, P[i * 3 + 1]);
    cells.clear();
    let spent = 0;
    for (let i = 0; i < n; i += step) {
      const px = P[i * 3] + fin(o.ox), py = P[i * 3 + 1], pz = P[i * 3 + 2] + fin(o.oz);
      const sx = px * A.rx + py * A.ry + pz * A.rz, sy = px * A.ux + py * A.uy + pz * A.uz;
      const cx = Math.round(sx * q), cy = Math.round(sy * q * (S.cw / S.ch));
      const key = (cx & 0xffff) * 65536 + (cy & 0xffff);
      if (cells.has(key)) continue;
      cells.add(key);
      const h = clamp01((py - y0) / 1.9);
      const lf = fin(o.life, 0.5) * (0.6 + 0.55 * h) + this.lrand(0.04, 0.12);
      const vx = fin(o.vx) + this.lrand(-j, j), vz = fin(o.vz) + this.lrand(-j, j);
      const vy = o.fall ? -this.lrand(0.4, 1) * o.fall * (0.35 + 0.65 * h) : fin(o.vy) + this.lrand(-j, j);
      this._blob(px, py, pz, vx, vy, vz, lf, D * 1.3, D * 0.85, fin(o.heat, 0.4) * this.lrand(0.85, 1.2), 0, K_VOID, fin(o.drag, 1));
      spent++;
      if (o.glyphs && this.lr() < o.glyphs) {
        this._letter(px, py, pz, vx, vy * 1.2, vz, lf * 1.3, DIG, this.lr() < 0.3 ? MINT : CODE, CODE_END, 0.15, 0.6, o.fall ? -3 : 0);
      }
    }
    return spent;
  }

  /** A ball of green script, this frame only: a body of heat filled to its edge, a hot heart, a rim
   *  turning, and loose digits riding on it a frame or two each (what makes it read as written). */
  _ball(x, y, z, R, t, seed, k = 1, letters = 2) {
    const life = this._frame();
    if (!(life > 0) || !Number.isFinite(x + y + z + R + t)) return;
    const A = this._axes(), P = this._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
    const at = (ox, oy, sz, h) => this._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, sz, sz, h, h, K_VOID);
    for (let i = 0; i < 8; i++) {
      const rr = R * 0.78 * Math.sqrt((i + 0.5) / 8), a = i * 2.39996 + t * 2.2;
      at(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.72, 0.42 * k);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - t * 3.1, rr = R * (0.92 + 0.06 * hash(seed + i));
      at(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.36, (0.3 + 0.25 * Math.max(0, Math.cos(a * 2 + t * 5))) * k);
    }
    at(0, 0, R * 0.5, 1.2 * k);
    for (let i = 0; i < letters; i++) {
      const a = this.lr() * TAU, rr = R * Math.sqrt(this.lr()) * 0.9, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      this._letter(x + A.rx * ox + A.ux * oy, y + A.ry * ox + A.uy * oy, z + A.rz * ox + A.uz * oy, 0, 0, 0, this.lrand(0.06, 0.11), DIG, this.lr() < 0.35 ? MINT : CODE, null, 0.14);
    }
  }

  /** A thin ring standing across the way (ux, uz) at (x, y, z), radius r, thrown out at `sp` m/s:
   *  the wake a shot leaves in slowed air. */
  _wakeRing(x, y, z, ux, uz, r, n, sp, life, heat) {
    const sx = -uz, sz = ux;
    const s0 = this.lr() * TAU;
    for (let i = 0; i < n; i++) {
      const a = s0 + (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const ox = sx * ca, oy = sa, oz = sz * ca;
      this._blob(x + ox * r, y + oy * r, z + oz * r, ox * sp, oy * sp, oz * sp, life * this.lrand(0.85, 1.1), 0.16, 0.2, heat * this.lrand(0.8, 1.15), 0, K_VOID, 1.5);
    }
  }

  // ---------------------------------------------------------------- the shots
  /** A muzzle flash: his guns' (phase 2) redrawn under `?oneGunFx=a|b` (ADR-253, fxIron.js), else AscFx's. */
  muzzle(x, y, z, dx, dz, k = 1, form = 1) {
    if (this.d?.phase === 2 && drawGunMuzzle(this, x, y, z, dx, dz, k)) return;
    return super.muzzle(x, y, z, dx, dz, k, form);
  }

  /** His blasts' drawing (AscFx's _flyBlast calls it every frame of a blast's flight). */
  _drawBlast(s, hang) {
    if (s.lantern) return super._drawBlast(s, hang);
    if (s.iron) return this._drawSlug(s);
    return this._drawBolt(s, hang);
  }

  /** A gun shot: a short bright slug (a few cells of mint-hot digits) and a thin trail of strokes
   *  back along its way; a heavy one longer and hotter, rings left in its wake; a returned one (sent
   *  back by a perfect parry) hotter still, ringed close, its trail pointing at the hero. ~8 - 20 blobs
   *  a frame, ~40 alive per shot. */
  _drawSlug(s) {
    if (drawGunSlug(this, s)) return; // (?oneGunFx=a|b, ADR-253: fxIron.js)
    const heavy = !!s.heavy, ret = !!s.returned, dx = s.dx, dz = s.dz;
    if (!Number.isFinite(s.x + s.y + s.z + dx + dz)) return;
    const flown = ret ? s.age * s.speed * 1.25 : s.path;
    const L = heavy ? 0.8 : 0.55;
    const T = Math.min(heavy ? 3.4 : 2.4, Math.max(L, fin(flown) + 0.2));
    const hx = s.x, hy = s.y, hz = s.z;
    // the trail: thin strokes (the cool rim prints as upright / leaning strokes) back along its way
    this._ink(hx - dx * T, hy, hz - dz * T, hx - dx * L * 0.8, hy, hz - dz * L * 0.8, 0, 0.14, 0, ret ? 0.6 : heavy ? 0.55 : 0.45, 0, K_VOID);
    // the slug: a few cells of bright digits, its head the hottest
    this._ink(hx - dx * L, hy, hz - dz * L, hx, hy, hz, 0, heavy ? 0.95 : 0.8, 0, ret ? 2.0 : heavy ? 1.75 : 1.5, 0, K_VOID);
    const P = this._toCamera(hx, hy, hz);
    this._dot(P.x, P.y, P.z, heavy ? 0.36 : 0.28, ret ? 1.0 : heavy ? 0.8 : 0.65, K_VOID);
    // what it sheds: a breath of heat, now and then a loose digit falling behind it
    if (this.lr() < (heavy ? 0.9 : 0.45)) this._blob(hx - dx * L, hy + this.lrand(-0.04, 0.04), hz - dz * L, -dx * 1.2 + this.lrand(-0.3, 0.3), this.lrand(-0.1, 0.3), -dz * 1.2 + this.lrand(-0.3, 0.3), this.lrand(0.12, 0.22), 0.3, 0.16, 0.34, 0, K_VOID, 2);
    if (this.lr() < (heavy ? 0.45 : 0.18)) this._letter(hx - dx * L * 1.5, hy, hz - dz * L * 1.5, this.lrand(-0.4, 0.4), this.lrand(-0.2, 0.6), this.lrand(-0.4, 0.4), this.lrand(0.25, 0.45), BITS, CODE, CODE_END, 0.14, 1.5, -5);
    // the rings in its wake (heavy, returned): thin rings left standing in the air where it passed
    if (heavy || ret) {
      const every = ret ? 0.55 : 0.9;
      s._ring = fin(s._ring, 0) + Math.min(2, fin(s.speed) * (ret ? 1.25 : 1) * (this.game.fxDt ?? 0.016));
      if (s._ring >= every) {
        s._ring = 0;
        this._wakeRing(hx - dx * L, hy, hz - dz * L, dx, dz, ret ? 0.3 : 0.24, ret ? 12 : 10, ret ? 0.7 : 0.45, ret ? 0.5 : 0.36, ret ? 0.55 : 0.42);
      }
      this._keep(s, hx, hy, hz, L_CODE, ret ? 1.6 : 1.1, ret ? 4.5 : 3.5, 0.1);
    }
  }

  /** A palm bolt (or any other blast of his): a ball of green script, a tail of heat, loose digits
   *  shed behind it; hanging (`hang`): it swells with letters drawn in. ~25 blobs a frame. */
  _drawBolt(s, hang) {
    const k = s.size ?? 1, ret = !!s.returned;
    const grow = hang ? Math.min(1, s.age / Math.max(0.15, s.delay)) : 1;
    const R = 0.42 * k * (0.5 + 0.5 * grow);
    this._ball(s.x, s.y, s.z, R, s.age + s.seed, s.seed, ret ? 1.3 : 1, ret ? 3 : 2);
    if (hang) {
      if (this.lr() < 0.6) {
        const a = this.lr() * TAU, R2 = this.lrand(0.6, 1.2), lf = this.lrand(0.16, 0.26), mx = s.x + Math.cos(a) * R2, my = s.y + this.lrand(-0.5, 0.5), mz = s.z + Math.sin(a) * R2;
        this._letter(mx, my, mz, (s.x - mx) / lf, (s.y - my) / lf, (s.z - mz) / lf, lf, DIG, CODE, CODE_END, 0.13, 0, 0, 0.3, 1);
      }
      return;
    }
    // the tail: heat shed back along its way, a short line of strokes, digits falling out of it
    const tl = Math.min(1.1 * k, 0.06 * s.speed * (0.4 + Math.min(1, s.age * 4))) + R;
    this._ink(s.x - s.dx * tl, s.y, s.z - s.dz * tl, s.x - s.dx * R * 0.9, s.y, s.z - s.dz * R * 0.9, 0, 0.15, 0, ret ? 0.7 : 0.5, 0, K_VOID);
    for (let i = 0; i < 2; i++) this._blob(s.x - s.dx * (0.3 + 0.3 * i) * k, s.y + this.lrand(-0.08, 0.08), s.z - s.dz * (0.3 + 0.3 * i) * k, -s.dx * 1.4 + this.lrand(-0.3, 0.3), this.lrand(-0.1, 0.4), -s.dz * 1.4 + this.lrand(-0.3, 0.3), this.lrand(0.14, 0.24), 0.44 * k, 0.18, 0.4, 0, K_VOID, 2);
    if (this.lr() < 0.5) this._letter(s.x - s.dx * R, s.y + this.lrand(-R, R) * 0.6, s.z - s.dz * R, -s.dx * 1.5 + this.lrand(-0.5, 0.5), this.lrand(-0.3, 0.5), -s.dz * 1.5 + this.lrand(-0.5, 0.5), this.lrand(0.25, 0.45), DIG, CODE, CODE_END, 0.14, 1.2, -4);
    if (ret) {
      s._ring = fin(s._ring, 0) + Math.min(2, fin(s.speed) * 1.25 * (this.game.fxDt ?? 0.016));
      if (s._ring >= 0.6) {
        s._ring = 0;
        this._wakeRing(s.x - s.dx * R, s.y, s.z - s.dz * R, s.dx, s.dz, R * 1.05, 12, 0.6, 0.45, 0.5);
      }
    }
    this._keep(s, s.x, s.y, s.z, L_CODE, ret ? 2.2 : 1.6, 5 * k, 0.12);
  }

  /** A blast of his bursts (the floor at the end of its way, cover, a guard, him): a flash of green,
   *  digits thrown out and falling, on the floor a small ragged ring and a scorch. The world's blow is
   *  AscFx's, unchanged. ~40 - 70 blobs. */
  _blastBurst(s, floor, onHim) {
    if (s.lantern) return super._blastBurst(s, floor, onHim);
    s.alive = false;
    const size = s.size ?? 1, k = s.iron ? (s.heavy ? 0.85 : 0.5) : size, x = s.x, y = Math.max(0.35, s.y), z = s.z, A = this._axes();
    if (!Number.isFinite(x + y + z)) return;
    const P = this._toCamera(x, y, z);
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.1, 0.35 * k, 0.8 * k, 1.5, 0, K_VOID);
    const n = Math.round(8 + 10 * k);
    for (let i = 0; i < n; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(2, 5) * k;
      const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
      this._blob(x + ux * 0.15, y + uy * 0.15, z + uz * 0.15, ux * sp, Math.abs(uy * sp) + 0.4, uz * sp, this.lrand(0.18, 0.32), 0.42 * k + 0.1, 0.24, 0.5, 0, K_VOID, 3, 1);
    }
    for (let i = 0, m = Math.round(5 + 8 * k); i < m; i++) {
      const a = this.lr() * TAU, sp = this.lrand(1.5, 5);
      this._letter(x, y, z, Math.cos(a) * sp, this.lrand(0.5, 3.5), Math.sin(a) * sp, this.lrand(0.35, 0.7), i & 1 ? DIG : BITS, i % 3 ? CODE : MINT, CODE_END, 0.15, 1.6, -9);
    }
    if (floor) {
      this._shock(x, 0.8, z, 1.4 * k + 0.3, 14, 0.24, 0.4, 0.7, 0.42, K_VOID, 0.25, 3);
      this._blob(x, 0.8, z, 0, 0.6, 0, 0.8, 0.5, 1.2, 0.4, 0, K_SMOKE, 1.5, 0.4);
      // (the world's blow: AscFx's numbers, on the blast's own size)
      this.game.world?.scorch?.burnCircle?.(x, z, 0.8 * size, 0.22, 0.15);
      const W = this.game.world;
      W?.impact?.(x, z, 1.1 * size, size > 1.2 ? this.d?.T?.world?.bigBlast ?? ASC_WORLD.bigBlast : this.d?.T?.world?.blast ?? ASC_WORLD.blast, BLAST_BLOW);
    }
    this.game.lights?.add?.({ x, y: y + 0.3, z, color: L_CODE, intensity: (onHim ? 5 : 2.6) * k, radius: 5 * k + 1, life: 0.2, fade: 0.18 });
    if (onHim) this.game.shake?.(0.25);
  }

  // ---------------------------------------------------------------- THE BEND
  /** THE BEND: the shot (or the heavy cut) passes over his chest along (dx, dz) (from the hero to
   *  him): a line of thin rings left standing in its wake, a streak through them, three afterimages of
   *  him trailing toward the hero. ~350 - 650 blobs, once. */
  bendWake(d, dx, dz) {
    if (!d?.position) return;
    const l = Math.hypot(fin(dx), fin(dz)) || 1, ux = fin(dx) / l, uz = fin(dz, 1) / l;
    const c = this._chest(d), y = c.y + 0.3;
    if (!Number.isFinite(c.x + c.y + c.z)) return;
    // the rings: seven along the way, widening as they go, each a thin ring standing across it
    for (let i = 0; i < 7; i++) {
      const s = -2.6 + 0.85 * i, r = 0.42 + 0.06 * i;
      this._wakeRing(c.x + ux * s, y + 0.04 * i, c.z + uz * s, ux, uz, r, 18, 0.3 + 0.05 * i, 0.8 + 0.05 * i, 0.55 + 0.04 * i);
    }
    // the streak: the way the thing went, over his chest
    this._ink(c.x - ux * 3, y, c.z - uz * 3, c.x + ux * 3.2, y + 0.3, c.z + uz * 3.2, 0.45, 0.25, 0, 1.0, 0, K_VOID);
    // three afterimages trailing toward the hero (where he was as he went back), fainter each
    for (let i = 0; i < 3; i++) this._ghostGold(d, ux * 0.25, uz * 0.25, 0.85 - 0.15 * i, -ux * 0.45 * (i + 1), -uz * 0.45 * (i + 1), true, 3);
    this.game.lights?.add?.({ x: c.x, y: y + 0.4, z: c.z, color: L_CODE, intensity: 3, radius: 7, life: 0.5, fade: 0.4 });
  }

  /** n afterimages where he stands (the Lean: one, a little behind him; more step back further). */
  afterimages(d, n = 1) {
    if (!d?.position) return;
    const yaw = fin(d.yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < n; i++) this._ghostGold(d, -fx * 0.4, -fz * 0.4, 0.5 - 0.08 * i, -fx * 0.18 * i, -fz * 0.18 * i, n > 1 || i > 0, 3);
  }

  /** An afterimage (DuelFx's options), printed in green. */
  ghost(d, o = this._ghostO) {
    return this._ghostGold(d, fin(o?.dx), fin(o?.dz), fin(o?.life, 0.6), fin(o?.ox), fin(o?.oz), !!o?.light, 3);
  }

  // ---------------------------------------------------------------- THE STOP
  /** A returned bolt hanging before his palm, every frame: the ball, shivering in place, a thin ring
   *  of still air pulsing round it, a hum of digits held in the air beside it. ~30 blobs a frame. */
  heldBolt(x, y, z, k = 1, dt = 0) {
    if (!Number.isFinite(x + y + z)) return;
    const t = this._now(), seed = x * 3.1 + z * 1.7;
    const jx = 0.018 * Math.sin(t * 91 + seed), jy = 0.018 * Math.sin(t * 77 + seed * 2);
    this._ball(x + jx, y + jy, z, 0.44 * fin(k, 1), t * 0.6 + seed, seed, 1.25, 2);
    const life = this._frame();
    if (life > 0) {
      const A = this._axes(), P = this._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
      const R = 0.58 + 0.04 * Math.sin(t * 14 + seed), h = 0.18 + 0.12 * Math.max(0, Math.sin(t * 14 + seed));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + hash(seed + i) * 0.3, ox = Math.cos(a) * R, oy = Math.sin(a) * R;
        this._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, 0.2, 0.2, h, h, K_VOID);
      }
    }
    if (dt > 0 && this.lr() < dt * 6) {
      const a = this.lr() * TAU, r = this.lrand(0.5, 0.9);
      this._letter(x + Math.cos(a) * r, y + this.lrand(-0.4, 0.4), z + Math.sin(a) * r, 0, 0, 0, this.lrand(0.3, 0.5), DIG, DIM, DIM_END, 0.13, 0, 0, 0.8, 0);
    }
  }

  /** The moment a bolt stops in the air: a ring of air thrown out and stilled at once, digits thrown
   *  off that stop where they are, a short light. ~40 blobs, once. */
  stopHum(x, y, z) {
    if (!Number.isFinite(x + y + z)) return;
    this._flatRing(x, y, z, 0.3, 18, 4.5, 0.28, 0.2, 0.55, 9);
    this._flatRing(x, y, z, 0.2, 12, 2.5, 0.4, 0.18, 0.35, 7);
    for (let i = 0; i < 10; i++) {
      const a = this.lr() * TAU, sp = this.lrand(3, 6);
      this._letter(x, y, z, Math.cos(a) * sp, this.lrand(-1.5, 2), Math.sin(a) * sp, this.lrand(0.5, 0.8), DIG, i & 1 ? MINT : CODE, CODE_END, 0.14, 9);
    }
    this.game.lights?.add?.({ x, y, z, color: L_MINT, intensity: 2.5, radius: 4, life: 0.18, fade: 0.15 });
  }

  /** The sent bolts burst at (x, y, z) (on the guard, on a parry) or an unsent one drops: a flash of
   *  green, heat thrown out, a shower of loose digits falling to the floor. ~50 blobs, once. */
  sendBurst(x, y, z) {
    if (!Number.isFinite(x + y + z)) return;
    const P = this._toCamera(x, y, z);
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.12, 0.4, 0.9, 1.4, 0, K_VOID);
    this._flatRing(x, y, z, 0.25, 16, 3.5, 0.3, 0.26, 0.5, 4);
    for (let i = 0; i < 14; i++) {
      const a = this.lr() * TAU, sp = this.lrand(1, 4);
      this._blob(x, y, z, Math.cos(a) * sp, this.lrand(0, 2), Math.sin(a) * sp, this.lrand(0.2, 0.35), 0.4, 0.2, 0.42, 0, K_VOID, 3);
    }
    for (let i = 0; i < 16; i++) {
      const a = this.lr() * TAU, sp = this.lrand(0.5, 3);
      this._letter(x + Math.cos(a) * 0.2, y + this.lrand(-0.2, 0.3), z + Math.sin(a) * 0.2, Math.cos(a) * sp, this.lrand(0, 2.5), Math.sin(a) * sp, this.lrand(0.5, 0.9), DIG, i % 3 ? CODE : MINT, CODE_END, 0.15, 1.2, -9);
    }
    this.game.lights?.add?.({ x, y, z, color: L_CODE, intensity: 3, radius: 5, life: 0.22, fade: 0.2 });
  }

  // ---------------------------------------------------------------- SKIPPED FRAMES
  /** He tears into a column of digits at (x0, z0) and prints again at (x1, z1): his body's letters
   *  fall out of the air where he stood, a column of falling digits there; at the new spot digits
   *  rain down onto him for a beat. No streak between: the frames between are skipped. Call it before
   *  his pose is redrawn (duelist.flit does): his meshes are still where he was. ~250 blobs, once,
   *  then ~30 glyphs a frame for 0.35 s. */
  codeColumn(x0, z0, x1, z1) {
    if (!Number.isFinite(x0 + z0 + x1 + z1)) return;
    const d = this.d;
    if (d) this._printBody(d, { life: 0.45, heat: 0.55, fall: 3.5, j: 0.15, drag: 0.4, glyphs: 0.18 });
    this._col('out', x0, z0, 0.38, 0.45, 2.2, 90, 1);
    this._col('in', x1, z1, 0.26, 0.4, 2.3, 110, 1);
    this.dust(x1, z1, 0.6);
  }

  /** A blow of his flurry (duelist.flit): SKIPPED FRAMES. */
  flit(x0, z0, x1, z1) {
    return this.codeColumn(x0, z0, x1, z1);
  }

  _col(mode, x, z, T, R, H, rate, k) {
    let c = this._cols.find((q) => !q.alive);
    if (!c) {
      c = this._cols[0];
      for (const q of this._cols) if (q.t / q.T > c.t / c.T) c = q;
    }
    c.alive = true;
    c.mode = mode;
    c.x = x;
    c.z = z;
    c.t = 0;
    c.T = T;
    c.R = R;
    c.H = H;
    c.rate = rate;
    c.acc = 0;
    c.k = k;
    return c;
  }

  /** Every frame: the code columns alive. 'out' digits fall down where he was; 'in' they rain down
   *  onto where he is and a column of heat prints him in; 'nova' a tall column through a transition. */
  _colsUpdate(dt) {
    if (!(dt > 0)) return;
    const life = this._frame(), A = this._axes();
    for (const c of this._cols) {
      if (!c.alive) continue;
      c.t += dt;
      if (c.t >= c.T) {
        c.alive = false;
        continue;
      }
      const u = c.t / c.T, fade = c.mode === 'in' ? Math.sin(Math.PI * Math.min(1, u * 1.2)) : 1 - u;
      c.acc += dt * c.rate * Math.max(0.2, fade);
      let m = Math.min(24, Math.floor(c.acc));
      c.acc -= m;
      while (m-- > 0) {
        const a = this.lr() * TAU, rr = c.R * Math.sqrt(this.lr());
        const y = c.mode === 'out' ? this.lrand(0.3, c.H) : this.lrand(c.H * 0.5, c.H * 1.25);
        this._letter(c.x + Math.cos(a) * rr, y, c.z + Math.sin(a) * rr, 0, -this.lrand(5, 10) * (c.mode === 'nova' ? 1.4 : 1), 0, this.lrand(0.18, 0.36), DIG, this.lr() < 0.3 ? MINT : CODE, CODE_END, 0.15, 0, 0, 1, 0.2);
      }
      if (life > 0) {
        const n = c.mode === 'nova' ? 16 : 8, h = (c.mode === 'out' ? 0.3 : 0.5) * fade * c.k;
        if (h > 0.03) for (let i = 0; i < n; i++) {
          const yy = 0.4 + (i / (n - 1)) * (c.H - 0.4), s = (hash(i + Math.floor(c.t * 20) * 3.3) - 0.5) * c.R;
          this._blob(c.x + A.rx * s, yy, c.z + A.rz * s, 0, 0, 0, life, c.R * 1.2, c.R * 1.2, h * (0.7 + 0.5 * hash(i * 7 + c.t)), h, K_VOID);
        }
      }
    }
  }

  // ---------------------------------------------------------------- flight
  /** Leaving the Floor: the ring as he goes straight up: a front of green out to r, a ripple, digits
   *  thrown up off the floor round his feet. ~300 blobs, once. */
  riseBurst(x, z, r) {
    if (!Number.isFinite(x + z + r) || !(r > 0)) return;
    this.shock(x, z, r, this._opt(1.1, 0.85, 'void', 0, true));
    this._codeRipple(x, z, 0.85, 0.5, r * 1.05, 0.4, 0.5, 0.42);
    for (let i = 0; i < 24; i++) {
      const a = this.lr() * TAU, rr = this.lrand(0.2, 1.1);
      this._letter(x + Math.cos(a) * rr, this.lrand(0.2, 0.8), z + Math.sin(a) * rr, Math.cos(a) * 0.6, this.lrand(5, 10), Math.sin(a) * 0.6, this.lrand(0.35, 0.6), SCRIPT, this.lr() < 0.3 ? MINT : CODE, CODE_END, 0.15, 1.5, -4);
    }
    this.dust(x, z, 1.1);
    this.game.lights?.add?.({ x, y: 1.2, z, color: L_CODE, intensity: 4, radius: r * 1.6, life: 0.35, fade: 0.3 });
  }

  /**
   * The Falling Fist's front, every frame while it runs: a ring of heaving letters at radius r (`w`
   * its width): a bright leading row lifting and falling round the ring, a dimmer row behind, heat
   * shed behind it, chips and loose digits thrown up where it passes. ~500 - 700 blobs alive at 11 m.
   */
  front(x, z, r, w, dt) {
    if (!Number.isFinite(x + z + r + w) || !(r > 0.2)) return;
    const life = this._frame(), t = this._now();
    if (life > 0) {
      const n = Math.max(24, Math.min(200, Math.round((TAU * r) / 0.36)));
      const rb = Math.max(0.2, r - w * 0.6);
      for (let i = 0; i < n; i++) {
        const j0 = hash(i * 1.37 + 3.1), a = ((i + (j0 - 0.5) * 0.6) / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const heave = Math.sin(a * 7 + t * 13 + j0 * 4), lift = 0.12 * Math.max(0, heave);
        const st = 0.75 + 0.35 * Math.sin(a * 3 + t * 2.5 + j0);
        // (low over the floor the field's soft depth test fades heat: the rows are drawn hotter for it)
        const hh = (0.62 + 0.35 * Math.max(0, heave)) * st;
        this._blob(x + ca * r, 0.8 + lift, z + sa * r, 0, 0, 0, life, 0.72, 0.72, hh * 2.1, 0, K_VOID);
        if (heave > 0.2) this._blob(x + ca * r, 1.2 + lift * 2, z + sa * r, 0, 0, 0, life, 0.5, 0.5, hh * 1.1, 0, K_VOID);
        if (i & 1) this._blob(x + ca * rb, GROUND_Y, z + sa * rb, 0, 0, 0, life, 0.42, 0.42, 0.3 * st * GROUND_GAIN, 0, K_VOID);
      }
    }
    if (!(dt > 0)) return;
    // heat shed behind it, chips and digits thrown up where it passes
    this._frontAcc += dt * Math.min(70, 4 * r + 10);
    while (this._frontAcc >= 1) {
      this._frontAcc -= 1;
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), rr = r - this.lrand(0, w);
      this._blob(x + ca * rr, this.lrand(0.8, 1.0), z + sa * rr, ca * 1.2, this.lrand(0.2, 0.8), sa * 1.2, this.lrand(0.25, 0.4), 0.42, 0.7, 0.5, 0, K_VOID, 2);
      if (this.lr() < 0.45) {
        const chip = this.lr() < 0.4;
        this._letter(x + ca * r, 0.25, z + sa * r, ca * this.lrand(0.5, 2), this.lrand(2.5, 5.5), sa * this.lrand(0.5, 2), this.lrand(0.4, 0.7), chip ? CHIPS : DIG, chip ? CHIP : CODE, chip ? CHIP_END : CODE_END, 0.16, 1, -12, 0.9, 0, chip ? this.alpha : this.add);
      }
    }
  }

  /** The Low Pass's wake along its line a → b at height y: three lines of green drawn along it, heat
   *  flung out to both sides, loose digits and dust. ~200 blobs, once. */
  passWake(ax, az, bx, bz, y) {
    if (!Number.isFinite(ax + az + bx + bz)) return;
    y = fin(y, 0.9);
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (!(L > 0.2)) return;
    const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
    for (let i = 0; i < 3; i++) this._ink(ax, y - 0.4 + i * 0.4, az, bx, y - 0.4 + i * 0.4, bz, this.lrand(0.3, 0.45), 0.25, 0, i === 1 ? 1.1 : 0.7, 0, K_VOID);
    const n = Math.min(60, Math.round(L / 0.28));
    for (let i = 0; i < n; i++) {
      const u = (i + this.lr()) / n, x = ax + dx * u, z = az + dz * u;
      for (let side = -1; side <= 1; side += 2) {
        const sp = this.lrand(1.5, 4);
        this._blob(x + px * side * 0.4, y + this.lrand(-0.3, 0.4), z + pz * side * 0.4, px * side * sp + ux * 2, this.lrand(0, 0.8), pz * side * sp + uz * 2, this.lrand(0.3, 0.55), 0.4, 0.8, 0.42 * (0.5 + 0.5 * u), 0, K_VOID, 2.5);
      }
      if (this.lr() < 0.35) this._letter(x, y, z, px * this.lrand(-3, 3), this.lrand(0.5, 2.5), pz * this.lrand(-3, 3), this.lrand(0.4, 0.7), DIG, CODE, CODE_END, 0.15, 1.5, -8);
    }
    this.dust(ax, az, 0.7);
    this.dust(bx, bz, 1.0);
    this.game.lights?.add?.({ x: (ax + bx) / 2, y: y + 0.5, z: (az + bz) / 2, color: L_CODE, intensity: 3, radius: L * 0.6, life: 0.3, fade: 0.25 });
  }

  /**
   * The Dive Within's charge, every frame of its black windup (`k` 0..1): the hall's letters streaming
   * in from all round toward his chest, dim as they leave and bright as they arrive, threads of heat
   * drawn in from near late in it. The black tell's eclipse is the engine's (its own corona and motes);
   * this stops a hand short of his chest, never on it. ~80 - 200 glyphs and ~20 blobs alive.
   */
  diveStream(d, k, dt) {
    if (!d?.position || !(dt > 0)) return;
    k = clamp01(fin(k));
    const c = this._chest(d), cx = c.x, cy = c.y, cz = c.z;
    if (!Number.isFinite(cx + cy + cz)) return;
    this._streamAcc += dt * (60 + 200 * k);
    let m = Math.min(16, Math.floor(this._streamAcc));
    this._streamAcc -= m;
    while (m-- > 0) {
      const a = this.lr() * TAU, r = this.lrand(3, 9), sx = cx + Math.cos(a) * r, sz = cz + Math.sin(a) * r, sy = this.lrand(0.2, 3), lf = this.lrand(0.5, 0.85);
      const ex = cx + Math.cos(a) * 0.55, ez = cz + Math.sin(a) * 0.55;
      this._letter(sx, sy, sz, (ex - sx) / lf, (cy - sy) / lf, (ez - sz) / lf, lf, SCRIPT, DIM, MINT, 0.16, 0, 0, 0.55, 1);
    }
    if (k > 0.35 && this.lr() < dt * 40 * k) {
      const a = this.lr() * TAU, r = this.lrand(1.2, 2.4), lf = this.lrand(0.25, 0.4), hx = cx + Math.cos(a) * r, hy = cy + this.lrand(-0.8, 0.6), hz = cz + Math.sin(a) * r;
      const ex = cx + Math.cos(a) * 0.6, ez = cz + Math.sin(a) * 0.6;
      this._blob(hx, hy, hz, (ex - hx) / lf, (cy - hy) / lf, (ez - hz) / lf, lf, 0.36, 0.16, 0.25 + 0.3 * k, 0.1, K_VOID);
    }
    this._keep('dive', cx, cy, cz, L_CODE, 0.4 + 1.2 * k, 4 + 3 * k, 0.1);
  }

  // ---------------------------------------------------------------- iron, the palm, the fall
  /** The reload: both guns thrown away, clattering to the floor as loose digits of dark metal, a
   *  bright cell at each muzzle going out. ~30 glyphs, once. */
  gunsAway(d) {
    if (!d?.position) return;
    const yaw = fin(d.yaw), fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    for (let s = 0; s < 2; s++) {
      const h = s ? d._handL : d._hand, side = s ? -1 : 1;
      const x = Number.isFinite(h?.x) ? h.x : d.position.x + lx * 0.4 * side, y = Number.isFinite(h?.y) ? h.y : 1.1, z = Number.isFinite(h?.z) ? h.z : d.position.z + lz * 0.4 * side;
      for (let i = 0; i < 12; i++) {
        const sp = this.lrand(1.5, 3.5);
        this._letter(x + this.lrand(-0.08, 0.08), y + this.lrand(-0.05, 0.05), z + this.lrand(-0.08, 0.08), lx * side * sp + fx * this.lrand(-0.8, 0.8), this.lrand(1, 3), lz * side * sp + fz * this.lrand(-0.8, 0.8), this.lrand(0.5, 0.9), CLATTER, IRON, IRON_END, 0.16, 0.6, -12, 1, 0.2, this.alpha);
      }
      this._letter(x, y, z, lx * side * 2, 1.5, lz * side * 2, 0.35, BITS, MINT, CODE_END, 0.15, 1, -10);
      this._blob(x, y, z, lx * side, 0.3, lz * side, 0.2, 0.3, 0.2, 0.4, 0, K_VOID, 3);
    }
  }

  /** The Still Hand held after the rising, every frame: round his raised palm the air is stilled: a
   *  ring of green that does not move, a hot heart in the palm, digits hanging motionless round it.
   *  ~30 blobs a frame, ~25 glyphs alive. */
  palmHold(d, dt) {
    const h = d?._hand;
    if (!h || !Number.isFinite(h.x + h.y + h.z)) return;
    const life = this._frame(), t = this._now();
    if (life > 0) {
      const A = this._axes(), P = this._toCamera(h.x, h.y, h.z), px = P.x, py = P.y, pz = P.z;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + hash(i) * 0.25, R = 0.55 + 0.05 * hash(i + 9), ox = Math.cos(a) * R, oy = Math.sin(a) * R;
        this._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, 0.2, 0.2, 0.32 + 0.08 * Math.sin(t * 3 + i), 0, K_VOID);
      }
      this._blob(px, py, pz, 0, 0, 0, life, 0.3, 0.3, 0.95, 0.95, K_VOID);
    }
    if (dt > 0) {
      this._palmAcc += dt * 22;
      while (this._palmAcc >= 1) {
        this._palmAcc -= 1;
        const a = this.lr() * TAU, r = this.lrand(0.35, 1.1);
        this._letter(h.x + Math.cos(a) * r, h.y + this.lrand(-0.6, 0.6), h.z + Math.sin(a) * r, 0, 0, 0, this.lrand(0.6, 1.0), DIG, this.lr() < 0.25 ? MINT : DIM, DIM_END, 0.13, 0, 0, 0.9, 0);
      }
    }
    this._keep('palm', h.x, h.y, h.z, L_CODE, 1.6, 4.5, 0);
  }

  /** The blade lock on his palm, every frame: letters streaming past round the palm (in the camera's
   *  plane, as water round a stone), a hot heart where the blade is held. ~30 glyphs alive. */
  lockStream(x, y, z, dt) {
    if (!Number.isFinite(x + y + z)) return;
    const A = this._axes(), P = this._toCamera(x, y, z);
    this._dot(P.x, P.y, P.z, 0.32, 1.0, K_VOID);
    if (!(dt > 0)) return;
    this._lockAcc += dt * 70;
    while (this._lockAcc >= 1) {
      this._lockAcc -= 1;
      const side = this.lr() < 0.5 ? -1 : 1, off = side * this.lrand(0.2, 0.6), lf = this.lrand(0.25, 0.4), sp = 3.6;
      // from one side of the palm to the other, bowed out round it
      const sx = x - A.rx * 0.9 + A.ux * off, sy = y - A.ry * 0.9 + A.uy * off, sz = z - A.rz * 0.9 + A.uz * off;
      this._letter(sx, sy, sz, A.rx * sp + A.ux * off * 0.6, A.ry * sp + A.uy * off * 0.6, A.rz * sp + A.uz * off * 0.6, lf, DIG, this.lr() < 0.3 ? MINT : CODE, CODE_END, 0.14, 0.5, 0, 0.9, 0);
    }
    this._keep('lock', x, y, z, L_CODE, 2, 4, 0.1);
  }

  /** THE FALL: he lands flat on his back: the dust of it, a flat ripple of green over the floor, and
   *  his letters loosening off him and hanging in the stilled air. ~250 blobs, once. */
  fallStill(d) {
    if (!d?.position) return;
    const x = d.position.x, z = d.position.z;
    if (!Number.isFinite(x + z)) return;
    this.dust(x, z, 1.3);
    this._codeRipple(x, z, 0.8, 0.6, 4.2, 0.6, 0.4, 0.4);
    this._printBody(d, { life: 1.3, heat: 0.3, vy: 0.12, j: 0.06, drag: 4, step: 2, glyphs: 0.12 });
    this.game.lights?.add?.({ x, y: 1, z, color: L_CODE, intensity: 2, radius: 5, life: 0.8, fade: 0.7 });
  }

  // ---------------------------------------------------------------- the transitions
  /** A transition's ring (A Hundred Iron Seeds, the rising): a front of green out to r, a ripple, a
   *  column of falling code through him (no lightning: he is not a storm), digits thrown out. ~400 -
   *  550 blobs at the burst, ~40 glyphs a frame while the column falls. */
  transformNova(x, z, r, form = 2) {
    if (!Number.isFinite(x + z + r)) return;
    this.shock(x, z, r, this._opt(1.6, 0.9, 'void', 0, true));
    this._shock(x, 0.9, z, r * 0.7, 40, 0.3, 0.55, 1.0, 0.55, K_VOID, 0.8, 1.2);
    this._codeRipple(x, z, 0.9, 0.7, r * 1.08, 0.45, 0.5, 0.45);
    this._col('nova', x, z, form >= 3 ? 1.0 : 0.85, 0.8, form >= 3 ? 10 : 8, 180, 1);
    for (let i = 0; i < 30; i++) {
      const a = this.lr() * TAU, sp = this.lrand(3, 9);
      this._letter(x, 0.5, z, Math.cos(a) * sp, this.lrand(2, 8), Math.sin(a) * sp, this.lrand(0.5, 1.0), SCRIPT, i % 3 ? CODE : MINT, CODE_END, 0.16, 1.2, -6);
    }
    this.game.lights?.add?.({ x, y: 2, z, color: L_CODE, intensity: 4, radius: r * 1.5, life: 0.6, fade: 0.5 });
  }
}
