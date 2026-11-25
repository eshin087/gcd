// THE SLASH LINE of an instant cut (`?lights=blink`, lightsBlink.js): the blade is at the coil, then at
// the finish, and where it passed ONE STRAIGHT LINE hangs for a quarter of a second: thin, long, sharp
// at both ends, white-hot in the middle, cooling the way the sword's arc cools. It is what makes the
// cut read as instant: the eye gets the line, not the swing. Drawn with the sword arc's own strokes
// (fx.js `|` strokes in the additive pool, its colours), so it is the same ink as the arc beside it.
//
// A clip's `slash` [u, len, left, up]: as the attack's phase passes u (the blade crossing his front) the
// line appears before him at chest height, `len` m long, in the plane he faces, along (left, up): a
// placed line at a chosen sharp angle, not the blade's own curved path. [u, len, 'point'] (the thrust):
// along the blade, on past the point. One line per attack. Nothing outside the blink chain, nothing on a dead hero, no allocation, no Math.random.

import { SWINGS } from './swings.js';
import { lightsMode } from './combat.js';
import { DIM } from './model.js';

/** The line's look: strokes, their size at the middle (m), life (s) at the ends … the middle, the
 *  hairline that outlasts it, the colours (the arc's: white-hot → its core → the indigo it cools to). */
export const SLASH = {
  n: 30, size: 0.13, life: [0.14, 0.3], flash: { size: 0.19, life: 0.05 }, hair: { size: 0.045, life: 0.95, alpha: 0.7 },
  hot: [3.0, 3.5, 4.3], core: [1.5, 2.1, 2.8], end: [0.14, 0.1, 0.8], floor: 0.05,
  ahead: 1.35, height: 1.15, // where a cut's line is centred: m before him, m up (x his drawn scale)
};

export class BlinkFx {
  constructor(player) {
    this.p = player;
    this.game = player.game;
    this.rec = null; // the attack record the line belongs to
    this.st = 0; // 0 waiting for u0, 1 for u1, 2 drawn
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

  /** Is this attack an instant cut that draws its own line (player.js: then no round arc behind the blade)? */
  owns(at) {
    const P = this.p, d = at?.def;
    if (!d || lightsMode() !== 'blink') return false;
    const an = P.anim?.atkDef === d ? P.anim.atkAnim : null;
    return !!(an?.clip && SWINGS[an.clip]?.slash);
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
    if (u < S[0] || !this._blade()) return;
    this.st = 2;
    this._draw(S);
  }

  _draw(S) {
    const P = this.p, fx = P.fx?.add;
    if (!fx?.spawn) return;
    const T = this.T, H = this.H, len = S[1];
    let dx, dy, dz, cx, cy, cz;
    if (S[2] === 'point') {
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
      // before him, at chest height, in the plane he faces: S[2] to his left (+), S[3] up (+)
      const yaw = Number(P.yaw) || 0, fwx = Math.sin(yaw), fwz = Math.cos(yaw), lx = fwz, lz = -fwx;
      const k = P.drawScale || 1, l = Math.hypot(S[2], S[3]) || 1, a = S[2] / l, b = S[3] / l;
      dx = lx * a;
      dy = b;
      dz = lz * a;
      cx = P.position.x + fwx * SLASH.ahead * k;
      cy = (P.position.y || 0) + SLASH.height * k;
      cz = P.position.z + fwz * SLASH.ahead * k;
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
    for (let pass = 0; pass < 3; pass++) {
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
          o.color = w > 0.92 ? SLASH.hot : SLASH.core;
          o.alpha = 0.55 + 0.45 * w;
        } else if (pass === 2) {
          // the flash: for four frames the middle of the line is a blade of light
          if (w < 0.55) continue;
          o.size = SLASH.flash.size * w;
          o.sizeEnd = SLASH.size;
          o.stretch = Math.min(30, (seg / o.size) * 1.8);
          o.life = SLASH.flash.life;
          o.color = SLASH.hot;
          o.alpha = 1;
        } else {
          // the hairline: thinner, fainter, the last of it to go (the lines of a chain hang together)
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
