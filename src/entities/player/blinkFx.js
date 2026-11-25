// THE SLASH LINE of an instant cut (`?lights=blink`: the chain, lightsBlink.js; its last hit,
// lastHits.js; the heavies, heaviesBlink.js; the specials, specialsBlink.js). The blade is
// at the coil, then at the finish, and where it passed ONE STRAIGHT LINE hangs for a moment: thin, sharp
// at both ends, white-hot in the middle, cooling the way the sword's arc cools. It is what makes the cut
// read as instant: the eye gets the line, not the swing. Drawn with the sword arc's own strokes (fx.js
// `|` strokes in the additive pool, its colours), so it is the same ink as the arc it replaces.
//
// The line IS the blade's cut (the owner, 2026-11-25: "the white slashes don't seem to match with the
// attack angle direction"): the point of the blade is recorded on the frames of the cut, and the line
// runs through where it actually was on the frame the cut starts across his front and on the frame it
// has crossed, carried on past both. Its angle, height and place are the blade's own, from every side.
// The path between the two frames does not matter: the line is the chord of the cut.
//
// A clip's `slash`: a list of cuts, each
//   [u0, u1]          the cross: the line runs through the point at the first frame of phase ≥ u0 and at
//                     the first frame ≥ u1, drawn on that second frame
//   [u0, u1, delay]   the same, drawn `delay` s later (the delayed cut: the line arrives after the blade)
//   [u, len, 'point'] a thrust: a short streak `len` m straight on off the point along the blade, at u
//   [u0, u1, 'ring']  a turn: the point's place on every frame from u0 to u1, and the straight cuts
//                     between them, drawn together at u1 (the ring the blade cut round him; no clip
//                     uses it today)
// and the clip's `slashLook` picks the line's look (SLASH):
//   (none)     'light': the chain's hits, white
//   'strong'   the last hit of the chain: white like a light, longer and a little thicker
//   'heavy'    the heavies (the owner: "the heavy attack also needs to be instant and feel weight"):
//              the heavy arc's violet (fx.js ARC_TONE), the longest and thickest, three rows of the same
//              small strokes side by side (thick without a bigger letter), and on the frame it is drawn
//              the camera is kicked along the cut with a small shake (game.kick / game.shake, as a
//              landed hit's, smaller than a hit's: SLASH.heavy.kick), even when the cut meets nothing.
//              No hit-stop on a whiff, no colour flash, no sound.
// Nothing outside the blink look set, nothing on a dead hero, no allocation a frame, no Math.random.

import { SWINGS } from './swings.js';
import { lightsMode } from './combat.js';
import { DIM } from './model.js';
import { ARC_TONE } from './fx.js';
import { swingPhase } from './anim.js';

/** The line's looks: strokes, their size at the middle (m), life (s) at the ends … the middle, the
 *  four-frame flash, the hairline that outlasts it, the colours (the arc's: white-hot → its core → the
 *  colour it cools to); `ext` the share of the recorded stretch it is carried on past each end, `min` the
 *  shortest line (m: at a high frame rate the two frames are close), `max` the longest; `rows` strokes
 *  side by side (`gap` m apart on the screen's plane; the outer ones thinner and shorter, `outer` × the
 *  size, in `edge`'s colour: the heavy arc's violet round a hot middle); `hold` the share of its size a
 *  stroke still has at the end of its life and `fade` its opacity then (a heavy line stays thick for
 *  the first eight to ten frames instead of thinning at once); `kick` the camera's kick along the cut
 *  (m) and the shake (trauma) on the frame the line is drawn; `over` (m): carried on no higher than this
 *  over the higher of its two points, × (1 − its steepness²) (a level cut runs on freely; a cut straight
 *  down from over his head stops where the point was, never a pillar into the sky). `floor` (m) the
 *  line never goes under. */
export const SLASH = {
  light: {
    n: 30, size: 0.13, life: [0.14, 0.3], flash: { size: 0.19, life: 0.05 }, hair: { size: 0.045, life: 0.95, alpha: 0.7 },
    hot: [3.0, 3.5, 4.3], core: ARC_TONE.light.core, end: ARC_TONE.light.end, ext: 0.35, min: 1.5, max: 4.2,
    rows: 1, gap: 0, outer: 1, hold: 0.12, fade: 0, kick: null,
  },
  strong: {
    n: 32, size: 0.16, life: [0.15, 0.32], flash: { size: 0.21, life: 0.05 }, hair: { size: 0.05, life: 1.0, alpha: 0.72 },
    hot: [3.0, 3.5, 4.3], core: ARC_TONE.light.core, end: ARC_TONE.light.end, ext: 0.38, min: 1.8, max: 5.0,
    rows: 1, gap: 0, outer: 1, hold: 0.12, fade: 0, kick: null,
  },
  heavy: {
    n: 48, size: 0.22, life: [0.26, 0.44], flash: { size: 0.28, life: 0.05 }, hair: { size: 0.08, life: 1.5, alpha: 0.85 },
    hot: [2.6, 2.6, 3.6], core: ARC_TONE.heavy.core, end: ARC_TONE.heavy.end, ext: 1.0, min: 6.0, max: 9.0,
    rows: 5, gap: 0.075, outer: 0.8, edge: [0.95, 0.32, 2.5], hold: 0.8, fade: 0.3, kick: { m: 0.11, shake: 0.16 }, over: 2.4,
  },
  floor: 0.08,
};
const LOOKS = ['light', 'strong', 'heavy'];
/** A clip's line look as an index into LOOKS. */
const lookOf = (C) => (C?.slashLook === 'heavy' ? 2 : C?.slashLook === 'strong' ? 1 : 0);

const NC = 8; // cuts a clip may list
const NP = 8; // lines waiting for their delay
const NR = 48; // a ring's points at most

export class BlinkFx {
  constructor(player) {
    this.p = player;
    this.game = player.game;
    this.rec = null; // the attack record the cuts belong to
    this.st = new Int8Array(NC); // per cut: 0 waiting for u0, 1 for u1, 2 drawn
    this.f0 = new Int32Array(NC); // the frame its first point was taken on
    this.P0 = new Float32Array(NC * 3);
    this.T = [0, 0, 0];
    this.H = [0, 0, 0];
    this.prev = [0, 0, 0];
    this.hasPrev = false;
    this.frame = 0;
    this.t = 0;
    this.pend = new Float32Array(NP * 8); // ax ay az bx by bz, the time it is drawn at, the look (LOOKS index)
    this.ring = new Float32Array(NR * 3); // a turn's points (one ring a swing)
    this.nr = 0;
    this.np = 0;
    this.lines = 0; // drawn so far (tests)
    this.last = new Float32Array(8); // the last line drawn: its ends, heavy, the look (tests)
    this.kicks = 0; // camera kicks given so far (tests)
    this.kickLast = 0; // the last one's size (m)
    /** Tests: (ax, ay, az, bx, by, bz, heavy, thrust, chord, look) as each line is decided; `heavy` is
     *  the heavy look, `look` its name ('light' | 'strong' | 'heavy'). */
    this.onLine = null;
    this._o = { x: 0, y: 0, z: 0, life: 0.2, size: 0.1, sizeEnd: 0.02, glyph: '|', rot: 0, stretch: 1, color: SLASH.light.core, colorEnd: SLASH.light.end, alpha: 1, alphaEnd: 0, drag: 0 };
  }

  _blade() {
    const e = this.p.rig?.sword?.matrixWorld?.elements;
    if (!e) return false;
    // (the DRAWN point, model.js: the line sits on the steel the eye sees, not on the hit's reach past it)
    const zt = DIM.drawnTip, zh = DIM.bladeBase, T = this.T, H = this.H;
    T[0] = e[8] * zt + e[12];
    T[1] = e[9] * zt + e[13];
    T[2] = e[10] * zt + e[14];
    H[0] = e[8] * zh + e[12];
    H[1] = e[9] * zh + e[13];
    H[2] = e[10] * zh + e[14];
    return Number.isFinite(T[0] + T[1] + T[2] + H[0] + H[1] + H[2]);
  }

  /** The clip this attack plays, if it is an instant cut that draws its own line. */
  _clip(at) {
    const P = this.p, d = at?.def;
    if (!d || lightsMode() !== 'blink') return null;
    const an = P.anim?.atkDef === d ? P.anim.atkAnim : null;
    const C = an?.clip ? SWINGS[an.clip] : null;
    return C?.slash ? C : null;
  }

  /** Is this attack an instant cut that draws its own line (player.js: then no round arc behind the blade)? */
  owns(at) {
    return !!this._clip(at);
  }

  /** Does this attack def draw its own line in the look set now (asked as the attack starts, before the
   *  animator has picked its clip up: player.js, One Breath's pass mark)? */
  draws(def) {
    const c = lightsMode() === 'blink' ? def?.anim?.clip : null;
    return !!(c && SWINGS[c]?.slash);
  }

  /** Per frame (player._updateFx). */
  update(dt = 0) {
    const P = this.p;
    if (Number.isFinite(dt) && dt > 0) this.t += dt;
    this.frame++;
    if (!(P.hp > 0) || P.state === 'dead') {
      this.np = 0;
      this.rec = null;
      return;
    }
    if (this.np) this._flush();
    const at = P.atk, d = at?.def;
    if (!d || (P.state !== 'attack' && P.state !== 'heavy') || at.pending) {
      this.rec = null;
      return;
    }
    const C = this._clip(at);
    if (!C) {
      this.rec = null;
      return;
    }
    if (this.rec !== at) {
      this.rec = at;
      this.st.fill(0);
      this.hasPrev = false;
      this.nr = 0;
    }
    if (!this._blade()) return;
    const S = C.slash, look = lookOf(C);
    const u = swingPhase(at.t, d.windup, d.active, d.recovery);
    const T = this.T, P0 = this.P0;
    for (let i = 0; i < S.length && i < NC; i++) {
      const c = S[i];
      if (!c || this.st[i] === 2) continue;
      if (c[2] === 'ring') {
        if (u >= c[0] && this.nr < NR) {
          const o = this.nr++ * 3;
          this.ring[o] = T[0];
          this.ring[o + 1] = T[1];
          this.ring[o + 2] = T[2];
        }
        if (u >= c[1]) {
          this.st[i] = 2;
          const R = this.ring;
          for (let j = 1; j < this.nr; j++) this._emit(R[j * 3 - 3], R[j * 3 - 2], R[j * 3 - 1], R[j * 3], R[j * 3 + 1], R[j * 3 + 2], look, false, 0, true);
        }
        continue;
      }
      if (c[2] === 'point') {
        if (u >= c[0]) {
          this.st[i] = 2;
          this._streak(c[1], look);
        }
        continue;
      }
      if (this.st[i] === 0 && u >= c[0]) {
        P0[i * 3] = T[0];
        P0[i * 3 + 1] = T[1];
        P0[i * 3 + 2] = T[2];
        this.f0[i] = this.frame;
        this.st[i] = 1;
      }
      if (this.st[i] === 1 && u >= c[1]) {
        // (both ends on one frame: the frame before is the cut's other end)
        if (this.f0[i] === this.frame && this.hasPrev) {
          P0[i * 3] = this.prev[0];
          P0[i * 3 + 1] = this.prev[1];
          P0[i * 3 + 2] = this.prev[2];
        }
        this.st[i] = 2;
        this._cut(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2], T[0], T[1], T[2], look, Number(c[2]) || 0);
      }
    }
    this.prev[0] = T[0];
    this.prev[1] = T[1];
    this.prev[2] = T[2];
    this.hasPrev = true;
  }

  /** The line through the point's two places, carried on past both (and no shorter than its min),
   *  kept off the ground; now, or `delay` s from now. */
  _cut(x0, y0, z0, x1, y1, z1, look, delay) {
    const L = SLASH[LOOKS[look]] ?? SLASH.light;
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const d = Math.hypot(dx, dy, dz);
    if (!(d > 1e-4)) return;
    dx /= d;
    dy /= d;
    dz /= d;
    const len = Math.min(L.max, Math.max(L.min, d * (1 + 2 * L.ext)));
    const pad = (len - d) / 2;
    let s0 = -pad, s1 = d + pad; // along the line from the first point
    // (off the ground: a cut down past the hip ends where its line meets the floor)
    if (Math.abs(dy) > 1e-6) {
      const sF = (SLASH.floor - y0) / dy; // where it meets the floor
      if (dy < 0) s1 = Math.min(s1, sF);
      else s0 = Math.max(s0, sF);
    } else if (y0 < SLASH.floor) return;
    if (L.over != null && Math.abs(dy) > 1e-6) {
      const sT = (Math.max(y0, y1) + L.over * (1 - dy * dy) - y0) / dy; // where it reaches its ceiling
      if (dy > 0) s1 = Math.min(s1, sT);
      else s0 = Math.max(s0, sT);
    }
    if (!(s1 - s0 > 0.2)) return;
    this._emit(x0 + dx * s0, y0 + dy * s0, z0 + dz * s0, x0 + dx * s1, y0 + dy * s1, z0 + dz * s1, look, false, delay);
  }

  /** A thrust: a short streak straight on off the point, along the blade. */
  _streak(len, look) {
    const T = this.T, H = this.H;
    let dx = T[0] - H[0], dy = T[1] - H[1], dz = T[2] - H[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    this._emit(T[0], T[1], T[2], T[0] + dx * len, T[1] + dy * len, T[2] + dz * len, look, true, 0);
  }

  _emit(ax, ay, az, bx, by, bz, look, thrust, delay, chord = false) {
    this.onLine?.(ax, ay, az, bx, by, bz, look === 2, thrust, chord, LOOKS[look]);
    if (delay > 0) {
      if (this.np >= NP) return;
      const o = this.np++ * 8, Q = this.pend;
      Q[o] = ax;
      Q[o + 1] = ay;
      Q[o + 2] = az;
      Q[o + 3] = bx;
      Q[o + 4] = by;
      Q[o + 5] = bz;
      Q[o + 6] = this.t + delay;
      Q[o + 7] = look;
      return;
    }
    this._draw(ax, ay, az, bx, by, bz, look, thrust, chord);
  }

  /** The lines whose delay is up. */
  _flush() {
    const Q = this.pend;
    for (let i = 0; i < this.np; ) {
      const o = i * 8;
      if (this.t < Q[o + 6]) {
        i++;
        continue;
      }
      this._draw(Q[o], Q[o + 1], Q[o + 2], Q[o + 3], Q[o + 4], Q[o + 5], Math.round(Q[o + 7]), false);
      const l = --this.np * 8;
      for (let k = 0; k < 8; k++) Q[o + k] = Q[l + k];
    }
  }

  _draw(ax, ay, az, bx, by, bz, look, thrust, chord = false) {
    const fx = this.p.fx?.add;
    const Lk = SLASH[LOOKS[look]] ?? SLASH.light;
    const la = this.last;
    la[0] = ax;
    la[1] = ay;
    la[2] = az;
    la[3] = bx;
    la[4] = by;
    la[5] = bz;
    la[6] = look === 2 ? 1 : 0;
    la[7] = look;
    this.lines++;
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-4)) return;
    dx /= len;
    dy /= len;
    dz /= len;
    // the weight of a heavy line: the picture thrown along the cut, a small shake (a ring's chords: none)
    const K = Lk.kick;
    if (K && !chord) {
      const g = this.game;
      g?.kick?.(dx, dy, dz, K.m);
      g?.shake?.(K.shake);
      this.kicks++;
      this.kickLast = K.m;
    }
    if (!fx?.spawn) return;
    const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
    // the stroke's turn on the screen (as fx.js alongRot), and the screen's across (for the rows)
    const C = this.game.camera?.matrixWorld?.elements;
    let rot = Math.atan2(dy, dx) - Math.PI / 2;
    let px = 0, py = 1, pz = 0;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-10) rot = Math.atan2(sy, sx) - Math.PI / 2;
      // (the line's direction × the camera's back axis: across the line, in the screen's plane)
      const qx = dy * C[10] - dz * C[9], qy = dz * C[8] - dx * C[10], qz = dx * C[9] - dy * C[8], ql = Math.hypot(qx, qy, qz);
      if (ql > 1e-6) {
        px = qx / ql;
        py = qy / ql;
        pz = qz / ql;
      }
    }
    // (a thrust's streak: fewer strokes, thinner, sharp toward its far end; a ring's chord: strokes as
    // the line's middle, a stretch of one line round him, its ends not sharpened)
    const n = thrust ? Math.max(10, Math.round(Lk.n * 0.4)) : chord ? Math.max(4, Math.round((Lk.n * len) / 3)) : Lk.n;
    const o = this._o, seg = len / n, k0 = thrust ? 0.75 : chord ? 0.8 : 1;
    const rows = thrust || chord ? 1 : Math.max(1, Lk.rows | 0);
    o.rot = rot;
    o.colorEnd = Lk.end;
    for (let r = 0; r < rows; r++) {
      // (the middle row is the line; the rows beside it thinner, shorter, no flash, no hairline)
      const mid = (rows - 1) / 2, off = rows > 1 ? (r - mid) * Lk.gap : 0, side = off !== 0, k = side ? k0 * Lk.outer : k0;
      const wMin = side ? 0.3 + (0.25 * Math.abs(r - mid)) / mid : 0; // (the outer rows the shorter)
      for (let pass = 0; pass < 3; pass++) {
        if (side && pass > 0) break;
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n, s = (f - 0.5) * len;
          const y = cy + dy * s + py * off;
          if (y < SLASH.floor) continue;
          // sharp at both ends (a thrust: full at the point, sharp at its far end)
          const w = thrust ? Math.pow(Math.max(0, 1 - f), 0.6) : chord ? 0.85 : Math.pow(Math.sin(Math.PI * f), 0.7);
          if (side && w < wMin) continue;
          o.x = cx + dx * s + px * off;
          o.y = y;
          o.z = cz + dz * s + pz * off;
          if (pass === 0) {
            const size = Lk.size * k * (0.25 + 0.75 * w);
            o.size = size;
            o.sizeEnd = size * (Lk.hold ?? 0.12);
            o.stretch = Math.min(30, (seg / size) * 1.8);
            o.life = (Lk.life[0] + (Lk.life[1] - Lk.life[0]) * w) * (side ? 0.9 : 1);
            o.alphaEnd = Lk.fade ?? 0;
            o.color = side ? Lk.edge ?? Lk.core : w > 0.92 ? Lk.hot : Lk.core;
            o.alpha = (0.55 + 0.45 * w) * (side ? 0.7 : 1);
          } else if (pass === 2) {
            // the flash: for a few frames the middle of the line is a blade of light
            if (w < 0.55) continue;
            o.size = Lk.flash.size * k * w;
            o.sizeEnd = Lk.size * k;
            o.stretch = Math.min(30, (seg / o.size) * 1.8);
            o.life = Lk.flash.life;
            o.color = Lk.hot;
            o.alpha = 1;
            o.alphaEnd = 0;
          } else {
            // the hairline: thinner, fainter, the last of it to go (the lines of a chain hang together)
            o.size = Lk.hair.size * k;
            o.sizeEnd = Lk.hair.size * k * 0.5;
            o.stretch = Math.min(40, (seg / o.size) * 1.6);
            o.life = Lk.hair.life * (0.6 + 0.4 * w);
            o.color = Lk.core;
            o.alpha = Lk.hair.alpha * w;
            o.alphaEnd = 0;
          }
          fx.spawn(o);
        }
      }
    }
  }
}
