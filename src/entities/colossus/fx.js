import { DuelFx, K_VOID, K_STEEL } from '../enemies/duelist/fx.js';
import { SHELF, rimZ } from '../../world/tideShelf.js';

// The Tide Colossus's effects (ADR-142). BRINE is heat in the fire field: the level re-skins the void
// slot with FIRE_PALETTES.brine (colossus.js), so K_VOID blobs print as dark sea green through jade to a
// foam-white heart, in the wyrm's small digits (STYLE.md "The fire field"). The beam is a dense line of
// small cool blobs (a hot heart by overlap, never one big hot blob); the surge a low wall of brine (heat
// 0.3 – 0.5: strokes and dim digits) under a thin steel crest (it prints '-' strokes: the foam line).
// Droplets, foam flecks and spray are glyph particles, one letter cell, from the world atlas. Ground
// warnings (the stone wets and gleams ahead of the beam and the surge) are glyph specks on the ground,
// never heat. Blobs stay at least 0.7 m up. Heat re-drawn every frame goes through the one-copy frame
// clock (DuelFx._frame / _dot), or it stacks in slow motion. The look's jitter draws from its own stream
// (DuelFx.lr), never Math.random. The timing cues are the shared ones (DuelFx.tellFlash, at k 1.8).

const SPRAY = [0.45, 1.05, 0.75]; // additive: a bright jade-white droplet
const SPRAY_END = [0.05, 0.2, 0.14];
const WATER = [0.3, 0.42, 0.4]; // alpha: grey-green water
const WET = [0.32, 0.5, 0.46]; // the gleam of wet stone (a ground warning)
const LOW = 0.75; // blobs never lower than this (the field's soft depth fade eats them)

export class TideFx {
  constructor(c) {
    this.c = c;
    this.game = c.game;
    this.duel = new DuelFx(c);
    this._acc = 0;
    this._sAcc = 0;
    this._wAcc = 0;
  }

  reset() {
    this.duel.reset();
    this._acc = this._sAcc = this._wAcc = 0;
  }

  update(dt) {
    const D = this.duel, fdt = this.game.fxDt ?? dt;
    D.updateGlints(dt);
    D.updateFlares(dt);
    D._frontsUpdate(fdt);
    D._emittersUpdate(fdt);
    D._streaksUpdate(fdt);
  }

  // ---- the shared cues
  tellFlash(tell, x, y, z, k, flare) {
    this.duel.tellFlash(tell, x, y, z, k, flare);
  }
  hazardFlash(tell, x, y, z, k) {
    this.duel.hazardFlash(tell, x, y, z, k);
  }
  charge(x, y, z, u, dt, k) {
    this.duel.charge(x, y, z, u, dt, k);
  }
  parrySpark(x, y, z, tell) {
    this.duel.parrySpark(x, y, z, tell);
  }
  breakBurst(x, y, z) {
    this.duel.breakBurst(x, y, z);
  }

  /** A droplet (glyph particle, one cell): `add` = a bright jade-white one, else grey-green water. */
  _drop(x, y, z, vx, vy, vz, life, add = true, size = 0.2) {
    const D = this.duel, o = D._rec(x, y, z, life, size, size * 0.4, add ? "'.,`" : '.,:', add ? SPRAY : WATER, add ? SPRAY_END : [0.08, 0.1, 0.1]);
    o.vx = vx;
    o.vy = vy;
    o.vz = vz;
    o.drag = 1.4;
    o.gravity = -9;
    D._spawn(add ? D.add : D.alpha, o);
  }

  /** Struck: a spray of water and letters along the blow, a short cut of steel across it. */
  hitSpark(x, y, z, dx, dz, heavy) {
    if (!Number.isFinite(x + y + z + dx + dz)) return;
    const D = this.duel, n = heavy ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const sp = D.lrand(1.5, heavy ? 6 : 4);
      this._drop(x, y, z, dx * sp + D.lrand(-1.5, 1.5), D.lrand(0.5, 3.5), dz * sp + D.lrand(-1.5, 1.5), D.lrand(0.3, 0.7), D.lr() < 0.4);
    }
    const l = heavy ? 0.8 : 0.5, sp = heavy ? 5 : 3.5;
    for (let i = -2; i <= 2; i++) {
      const u = i / 2;
      D._blob(x + dx * u * l, Math.max(LOW, y + 0.05 * u), z + dz * u * l, dx * sp, 0, dz * sp, 0.12, 0.3, 0.22, 0.55 - 0.15 * Math.abs(u), 0, K_STEEL, 6);
    }
  }

  /** A hand comes down on the shelf: a ring of brine thrown out low, droplets, the dust's shock front. */
  splash(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r + k)) return;
    const D = this.duel, n = Math.round(16 * k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + D.lr() * 0.3, ca = Math.cos(a), sa = Math.sin(a), sp = D.lrand(4, 8) * k;
      D._blob(x + ca * r * 0.4, LOW + D.lr() * 0.4, z + sa * r * 0.4, ca * sp, D.lrand(0.5, 1.5), sa * sp, D.lrand(0.25, 0.45), D.lrand(0.5, 0.8), 0.9, D.lrand(0.35, 0.55), 0, K_VOID, 3.5);
    }
    for (let i = 0; i < Math.round(18 * k); i++) {
      const a = D.lr() * Math.PI * 2, sp = D.lrand(2, 6) * k;
      this._drop(x + Math.cos(a) * r * 0.5, 0.4, z + Math.sin(a) * r * 0.5, Math.cos(a) * sp, D.lrand(2, 6), Math.sin(a) * sp, D.lrand(0.4, 0.9), D.lr() < 0.5);
    }
    D.groundShock(x, z, r * 0.9, 0.6 * k);
  }

  /** The forearm scraping along the shelf: water and grit thrown ahead of it. */
  scrape(x, z, band, dir, dt) {
    const D = this.duel;
    this._sAcc += dt * 40;
    let guard = 0;
    while (this._sAcc >= 1 && guard++ < 6) {
      this._sAcc -= 1;
      const zz = z + D.lrand(-band * 0.5, band * 0.5);
      this._drop(x + dir * 1.5, 0.4, zz, dir * D.lrand(3, 8), D.lrand(1, 3), D.lrand(-1, 1), D.lrand(0.3, 0.6), D.lr() < 0.35);
    }
  }

  /**
   * THE BEAM, this frame: a dense line of small brine blobs from the maw (mx, my, mz) down to where it
   * meets the shelf (qx, qz), and the scour beyond it along the ground to (fx, fz); spray where it meets
   * the ground; the stone wet ahead of it. `width` m across.
   */
  beam(mx, my, mz, qx, qz, fx, fz, width, dt) {
    const D = this.duel;
    const life = D._frame();
    if (life > 0 && Number.isFinite(mx + my + mz + qx + qz + fx + fz)) {
      const qy = LOW + 0.1, dx = qx - mx, dy = qy - my, dz = qz - mz, L = Math.hypot(dx, dy, dz);
      const n = Math.min(70, Math.max(4, Math.ceil(L / 0.28)));
      for (let i = 0; i <= n; i++) {
        const t = i / n, w = width * (0.35 + 0.65 * t);
        const x = mx + dx * t, y = Math.max(LOW, my + dy * t), z = mz + dz * t;
        // a core and two strands either side (across: the ground plane's normal to the beam)
        D._blob(x, y, z, 0, 0, 0, life, w * 0.8, w * 0.8, 0.62, 0.62, K_VOID);
        const j = (D.lr() - 0.5) * w * 0.9;
        D._blob(x + j, Math.max(LOW, y + (D.lr() - 0.5) * 0.4), z, 0, 0, 0, life, w * 0.5, w * 0.5, 0.4, 0.4, K_VOID);
      }
      // the scour: brine rushing over the ground beyond the jet, thinning out
      const gx = fx - qx, gz = fz - qz, G = Math.hypot(gx, gz), m = Math.min(26, Math.max(2, Math.ceil(G / 0.45)));
      for (let i = 1; i <= m; i++) {
        const t = i / m;
        D._blob(qx + gx * t, LOW + 0.05, qz + gz * t, 0, 0, 0, life, width * (0.8 - 0.3 * t), width * (0.8 - 0.3 * t), 0.55 * (1 - 0.6 * t), 0.5, K_VOID);
      }
    }
    // spray where it meets the shelf, and the wet gleam ahead of it
    this._acc += dt * 90;
    let guard = 0;
    while (this._acc >= 1 && guard++ < 6) {
      this._acc -= 1;
      const a = D.lr() * Math.PI * 2, sp = D.lrand(2, 7);
      this._drop(qx, 0.6, qz, Math.cos(a) * sp, D.lrand(2, 6), Math.sin(a) * sp * 0.6 + 2, D.lrand(0.3, 0.7), D.lr() < 0.6);
    }
    this._wAcc += dt * 30;
    guard = 0;
    while (this._wAcc >= 1 && guard++ < 4) {
      this._wAcc -= 1;
      const t = D.lr();
      this.wetSpeck(qx + (fx - qx) * t + D.lrand(-2.5, 2.5), qz + (fz - qz) * t + D.lrand(-1, 1));
    }
  }

  /** One gleam of wet stone on the ground (a ground warning: glyph specks, never heat). */
  wetSpeck(x, z, life = 0.7) {
    const D = this.duel, o = D._rec(x, 0.08, z, life, 0.26, 0.2, '.,-_', WET, [0.06, 0.09, 0.09]);
    o.alpha = 0.9;
    D._spawn(D.alpha, o);
  }

  /** The stone along the rim wets (the surge's windup): specks in a band at the rim. */
  wetRim(k = 1) {
    const D = this.duel, s = this.c.sense, n = Math.round(30 * k);
    for (let i = 0; i < n; i++) {
      const x = s.x + D.lrand(-22, 22);
      this.wetSpeck(x, rimZ(x) + D.lrand(0.3, 2.2), D.lrand(0.6, 1.2));
    }
  }

  /** The roar: brine spray thrown from the maw, a ring of it on the air. */
  roar(maw) {
    if (!maw || !Number.isFinite(maw.x + maw.y + maw.z)) return;
    const D = this.duel;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, sp = D.lrand(5, 9);
      D._blob(maw.x, Math.max(LOW, maw.y), maw.z, Math.cos(a) * sp, D.lrand(-1, 2), Math.sin(a) * sp * 0.5 + 4, D.lrand(0.3, 0.5), 0.7, 1.2, 0.45, 0, K_VOID, 2.5);
    }
    for (let i = 0; i < 30; i++) this._drop(maw.x, maw.y, maw.z, D.lrand(-6, 6), D.lrand(0, 5), D.lrand(2, 9), D.lrand(0.5, 1.0), D.lr() < 0.5);
  }

  /** The surge's wall of water this frame: low brine across x0..x1 at front z, a steel crest on top. */
  surgeFront(z, x0, x1, depth) {
    const D = this.duel, life = D._frame();
    if (!(life > 0) || !Number.isFinite(z + x0 + x1)) return;
    for (let x = x0; x <= x1; x += 1.0) {
      const j = D.lr();
      for (let r = 0; r < 3; r++) {
        const y = LOW + r * (depth - LOW) * 0.45, back = r * 0.5;
        D._blob(x + j * 0.4, y, z - back, 0, 0, 0, life, 1.15, 1.15, 0.36 + 0.08 * r, 0.36, K_VOID);
      }
    }
    D._line(x0, depth + 0.1, z + 0.2, x1, depth + 0.1, z + 0.2, 0, 0.28, 0.75, 0, K_STEEL, 0.3);
    // foam thrown off the top
    for (let i = 0; i < 3; i++) this._drop(x0 + D.lr() * (x1 - x0), depth, z, D.lrand(-1, 1), D.lrand(1, 3), D.lrand(2, 5), D.lrand(0.3, 0.6), true, 0.18);
  }

  /** A lingering line of the breath (phase 3): a thin strip of brine along its points, this frame. */
  line(pts, n, k = 1) {
    const D = this.duel, life = D._frame();
    if (!(life > 0) || n < 2) return;
    for (let i = 0; i + 1 < n; i++) {
      const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[i * 2 + 2], bz = pts[i * 2 + 3];
      const L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(L / 0.55));
      for (let j = 0; j < m; j++) {
        const t = j / m;
        D._blob(ax + (bx - ax) * t, LOW + 0.02, az + (bz - az) * t, 0, 0, 0, life, 0.62, 0.62, (0.4 + 0.12 * D.lr()) * k, 0.4 * k, K_VOID);
      }
    }
  }
}

export { SHELF };
