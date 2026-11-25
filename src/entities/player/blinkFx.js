// THE SLASH LINE of an instant cut (`?lights=blink`, lightsBlink.js): the blade is at the coil, then at
// the finish, and where it passed ONE STRAIGHT LINE hangs for a quarter of a second: thin, long, sharp
// at both ends, white-hot in the middle, cooling the way the sword's arc cools. It is what makes the
// cut read as instant: the eye gets the line, not the swing. Drawn with the sword arc's own strokes
// (fx.js `|` strokes in the additive pool, its colours), so it is the same ink as the arc beside it.
//
// A clip's `slash` [u0, u1, len, 'point'?]: the blade's point is read as the attack's phase passes u0
// and u1 (the two frames it crosses his front), and the line runs through both, `len` m long, centred
// between them; with 'point' (the thrust) it runs along the blade, ahead of the point. One line per
// attack. Nothing outside the blink chain, nothing on a dead hero, no allocation, no Math.random.

import { SWINGS } from './swings.js';
import { lightsMode } from './combat.js';
import { DIM } from './model.js';

/** The line's look: strokes, their size at the middle (m), life (s) at the ends … the middle, the
 *  hairline that outlasts it, the colours (the arc's: white-hot → its core → the indigo it cools to). */
export const SLASH = {
  n: 28, size: 0.09, life: [0.16, 0.3], hair: { size: 0.035, life: 0.42, alpha: 0.5 },
  hot: [3.0, 3.5, 4.3], core: [1.5, 2.1, 2.8], end: [0.14, 0.1, 0.8], floor: 0.05,
};

export class BlinkFx {
  constructor(player) {
    this.p = player;
    this.game = player.game;
    this.rec = null; // the attack record the line belongs to
    this.st = 0; // 0 waiting for u0, 1 for u1, 2 drawn
    this.A = [0, 0, 0];
    this.T = [0, 0, 0];
    this.H = [0, 0, 0];
    this.lines = 0; // drawn so far (tests)
    this._o = { x: 0, y: 0, z: 0, life: 0.2, size: 0.1, sizeEnd: 0.02, glyph: '|', rot: 0, stretch: 1, color: SLASH.core, colorEnd: SLASH.end, alpha: 1, alphaEnd: 0, drag: 0 };
  }

  _blade() {
    const e = this.p.rig?.sword?.matrixWorld?.elements;
    if (!e) return false;
    const zt = DIM.bladeTip, zh = DIM.bladeBase, T = this.T, H = this.H;
    T[0] = e[8] * zt + e[12];
    T[1] = e[9] * zt + e[13];
    T[2] = e[10] * zt + e[14];
    H[0] = e[8] * zh + e[12];
    H[1] = e[9] * zh + e[13];
    H[2] = e[10] * zh + e[14];
    return Number.isFinite(T[0] + T[1] + T[2] + H[0] + H[1] + H[2]);
  }

  /** Per frame (player._updateFx). */
  update() {
    const P = this.p, at = P.atk, d = at?.def;
    if (!d || P.state !== 'attack' || lightsMode() !== 'blink' || !(P.hp > 0) || at.pending) {
      this.rec = null;
      return;
    }
    const an = P.anim?.atkDef === d ? P.anim.atkAnim : null;
    const S = an?.clip ? SWINGS[an.clip]?.slash : null;
    if (!S) return;
    if (this.rec !== at) {
      this.rec = at;
      this.st = 0;
    }
    if (this.st === 2 || !(at.t >= d.windup)) return;
    const u = 1 + (at.t - d.windup) / Math.max(1e-4, d.active);
    if (!this._blade()) return;
    if (this.st === 0 && u >= S[0]) {
      this.A[0] = this.T[0];
      this.A[1] = this.T[1];
      this.A[2] = this.T[2];
      this.st = 1;
    } else if (this.st === 1 && u >= S[1]) {
      this.st = 2;
      this._draw(S);
    }
  }

  _draw(S) {
    const fx = this.p.fx?.add;
    if (!fx?.spawn) return;
    const A = this.A, T = this.T, H = this.H, len = S[2];
    let dx, dy, dz, cx, cy, cz;
    if (S[3] === 'point') {
      // along the blade, from mid-blade on past the point
      dx = T[0] - H[0];
      dy = T[1] - H[1];
      dz = T[2] - H[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      cx = T[0] + dx * len * 0.2;
      cy = T[1] + dy * len * 0.2;
      cz = T[2] + dz * len * 0.2;
    } else {
      dx = T[0] - A[0];
      dy = T[1] - A[1];
      dz = T[2] - A[2];
      const l = Math.hypot(dx, dy, dz);
      if (!(l > 0.05)) return;
      dx /= l;
      dy /= l;
      dz /= l;
      cx = (A[0] + T[0]) / 2;
      cy = (A[1] + T[1]) / 2;
      cz = (A[2] + T[2]) / 2;
    }
    // the stroke's turn on the screen (as fx.js alongRot)
    const C = this.game.camera?.matrixWorld?.elements;
    let rot = Math.atan2(dy, dx) - Math.PI / 2;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-10) rot = Math.atan2(sy, sx) - Math.PI / 2;
    }
    const o = this._o, n = SLASH.n, seg = len / n;
    o.rot = rot;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, s = (f - 0.5) * len;
        const y = cy + dy * s;
        if (y < SLASH.floor) continue;
        const w = Math.pow(Math.sin(Math.PI * f), 0.7); // sharp at both ends
        o.x = cx + dx * s;
        o.y = y;
        o.z = cz + dz * s;
        if (pass === 0) {
          const size = SLASH.size * (0.25 + 0.75 * w);
          o.size = size;
          o.sizeEnd = size * 0.12;
          o.stretch = Math.min(30, (seg / size) * 1.8);
          o.life = SLASH.life[0] + (SLASH.life[1] - SLASH.life[0]) * w;
          o.color = w > 0.8 ? SLASH.hot : SLASH.core;
          o.alpha = 0.55 + 0.45 * w;
        } else {
          // the hairline: thinner, fainter, the last of it to go
          o.size = SLASH.hair.size;
          o.sizeEnd = SLASH.hair.size * 0.5;
          o.stretch = Math.min(40, (seg / SLASH.hair.size) * 1.6);
          o.life = SLASH.hair.life * (0.6 + 0.4 * w);
          o.color = SLASH.core;
          o.alpha = SLASH.hair.alpha * w;
        }
        fx.spawn(o);
      }
    }
    this.lines++;
  }
}
