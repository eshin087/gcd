// THE INSTANT SLASH (ADR-240; the owner, 2026-11-26: "use the current production auto attack combo and remove
// the curvy slashes with the instant slashes", for every attack and the flurry). Where the blade passed,
// ONE STRAIGHT LINE hangs for a moment instead of the curved crescent (fx.js `trail`): thin, sharp at both
// ends, white-hot in the middle, cooling the way the arc cools; the eye gets the line, not the swing. Drawn
// with the arc's own strokes (fx.js `|` strokes in the additive pool, its colours), so it is the same ink as
// the arc it replaces. `?slash=arc` (the Lab's `slash` button) draws the crescent as before.
//
// The line IS the blade's cut, and it comes WITH the swing: the blade's drawn point is followed frame by frame;
// on the first frame the swing has ended (the point slows past its fastest step: SWING) the line is
// drawn through where the point was as the swing began and where it is now, carried on past each end. Its
// angle, height and place are the blade's own, from every side. Per attack, from what it is (combat.js defs,
// the look the animator picked):
//   a cut     the chord of the swing (above)
//   a turn    (the picked look's `spin`: the whirl, the rising whirl, Whirling Tempest) three straight cuts
//             round him between points evenly along the swing, drawn together as it ends
//   a thrust  (a clip whose `line` is 'point', or a `thrust` def: the stab, the heavy thrust, the execution)
//             a short streak straight on off the point, along the blade, as the thrust stops
// The look (SLASH): 'light' for a light attack, 'heavy' for a heavy one (`heavy` on the def: the slam, the
// heavies, the charged cleave, One Breath, the execution): the heavy arc's violet, longer and thicker, the
// camera kicked along the cut with a small shake. Nothing on a dead hero, no allocation a frame, no
// Math.random. The lines were first drawn for the instant cuts of ADR-233 (PR 118, closed); this is their
// drawing, driven by the production attacks.

import { SWINGS } from './swings.js';
import { DIM } from './model.js';
import { ARC_TONE } from './fx.js';

/** 'line' (the default): the instant slash; 'arc': the curved crescent as before. */
export const SLASH_IDS = ['line', 'arc'];
let slashNow = 'line';
export const slashMode = () => slashNow;
/** Pick the look of every swing's mark; false for an unknown id. */
export function setSlash(m) {
  if (!SLASH_IDS.includes(m)) return false;
  slashNow = m;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('slash') : null;
  if (q) setSlash(q);
}

/** The line's looks: strokes, their size at the middle (m), life (s) at the ends … the middle, the
 *  four-frame flash, the hairline that outlasts it, the colours (the arc's: white-hot → its core → the
 *  colour it cools to); `ext` the share of the recorded stretch it is carried on past each end, `min` the
 *  shortest line (m), `max` the longest; `rows` strokes side by side (`gap` m apart on the screen's plane;
 *  the outer ones `outer` × the size, in `edge`'s colour); `hold` the share of its size a stroke still has
 *  at the end of its life and `fade` its opacity then; `kick` the camera's kick along the cut (m) and the
 *  shake on the frame it is drawn; `over` (m): carried on no higher than this over the higher of its two
 *  points, × (1 − its steepness²) (a cut straight down never draws a pillar into the sky); `floor` (m) the
 *  line never goes under; `thrust` (m) a thrust's streak; `ring` the turn's cuts. */
export const SLASH = {
  light: {
    n: 30, size: 0.13, life: [0.14, 0.3], flash: { size: 0.19, life: 0.05 }, hair: { size: 0.045, life: 0.95, alpha: 0.7 },
    hot: [3.0, 3.5, 4.3], core: ARC_TONE.light.core, end: ARC_TONE.light.end, ext: 0.35, min: 1.5, max: 4.2,
    rows: 1, gap: 0, outer: 1, hold: 0.12, fade: 0, kick: null, over: 1.6,
  },
  heavy: {
    n: 44, size: 0.2, life: [0.24, 0.42], flash: { size: 0.26, life: 0.05 }, hair: { size: 0.07, life: 1.3, alpha: 0.8 },
    hot: [2.6, 2.6, 3.6], core: ARC_TONE.heavy.core, end: ARC_TONE.heavy.end, ext: 0.6, min: 3.0, max: 7.0,
    rows: 3, gap: 0.07, outer: 0.8, edge: [0.95, 0.32, 2.5], hold: 0.6, fade: 0.25, kick: { m: 0.08, shake: 0.12 }, over: 2.0,
  },
  floor: 0.08,
  thrust: 0.9,
  ring: 3,
};
const LOOKS = ['light', 'heavy'];
/** When the line is drawn: the swing is followed from `from` × the windup; its fastest frame is looked for
 *  from `peakFrom` × the windup (the active window on); the swing has ended on the first frame after it whose point moves under `end`
 *  of that (the line is drawn then, with the blade); the line starts where the point was just before the
 *  first frame moving `start` of it; at the latest `late` of the recovery in. (The owner, 2026-11-26: the
 *  lines "look out of place and a bit lagged. it should show as soon as the animation swing ends": they
 *  were drawn at the end of the active window, from the frame before it opened.) */
export const SWING = { from: 0.5, peakFrom: 1, end: 0.8, start: 0.3, late: 0.35 };
const NB = 64; // frames of the point kept (a swing from late in its windup to its end)

export class SlashFx {
  constructor(player) {
    this.p = player;
    this.game = player.game;
    this.rec = null; // the attack record the line belongs to
    this.kind = 0; // 0 a cut, 1 a turn, 2 a thrust
    this.look = 0;
    this.st = 0; // 0 following the swing, 2 drawn
    this.T = [0, 0, 0];
    this.H = [0, 0, 0];
    this.buf = new Float32Array(NB * 3); // the point, frame by frame
    this.spd = new Float32Array(NB); // … and how far it moved that frame
    this.nb = 0;
    this.peak = 0; // the fastest frame's step, and its index
    this.pi = -1;
    this.lastT = -1;
    this.lines = 0; // drawn so far (tests)
    this.last = new Float32Array(8); // the last line drawn: its ends, heavy, the kind (tests)
    this.kicks = 0;
    /** Tests: (ax, ay, az, bx, by, bz, look, kind) as each line is decided. */
    this.onLine = null;
    this._o = { x: 0, y: 0, z: 0, life: 0.2, size: 0.1, sizeEnd: 0.02, glyph: '|', rot: 0, stretch: 1, color: SLASH.light.core, colorEnd: SLASH.light.end, alpha: 1, alphaEnd: 0, drag: 0 };
  }

  /** Does this attack draw its line here (player.js: then no crescent behind the blade)? */
  owns(at) {
    return slashNow === 'line' && !!at?.def;
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

  /** Per frame, after the pose and the sweep (player.js _combat). */
  update() {
    const P = this.p, at = P.atk, d = at?.def;
    if (slashNow !== 'line' || !(P.hp > 0) || !d || (P.state !== 'attack' && P.state !== 'heavy') || at.pending) {
      this.rec = null;
      return;
    }
    if (!this._blade()) return;
    if (this.rec !== at) {
      this.rec = at;
      this.st = 0;
      this.nb = 0;
      this.peak = 0;
      this.pi = -1;
      this.lastT = -1;
      // what it is: the look the animator picked (a variant may turn or not)
      const an = P.anim?.atkDef === d && P.anim.atkAnim ? P.anim.atkAnim : d.anim;
      const C = an?.clip ? SWINGS[an.clip] : null;
      this.kind = d.kind === 'thrust' || an?.kind === 'thrust' || C?.line === 'point' ? 2 : an?.spin ? 1 : 0;
      this.look = d.heavy ? 1 : 0;
    }
    const W = d.windup, Ac = d.active, R = d.recovery, t = at.t;
    // (the point is followed from late in the windup; a frozen frame, the hit-pause, moves nothing)
    if (this.st === 2 || t < SWING.from * W || t === this.lastT) return;
    this.lastT = t;
    const T = this.T, B = this.buf, n = this.nb;
    const sp = n > 0 ? Math.hypot(T[0] - B[n * 3 - 3], T[1] - B[n * 3 - 2], T[2] - B[n * 3 - 1]) : 0;
    if (n < NB) {
      B[n * 3] = T[0];
      B[n * 3 + 1] = T[1];
      B[n * 3 + 2] = T[2];
      this.spd[n] = sp;
      this.nb = n + 1;
    }
    // the swing: its fastest frame from the windup's end on; it has ENDED on the first frame after that
    // peak (the cut proper: from the active window on) whose point moves under SWING.end of it (at the latest SWING.late of the recovery in)
    if (t >= SWING.peakFrom * W && sp > this.peak) {
      this.peak = sp;
      this.pi = this.nb - 1;
    }
    const ended = this.pi >= 0 && this.nb - 1 > this.pi && sp < SWING.end * this.peak;
    if (!ended && t < W + Ac + SWING.late * R && this.nb < NB) return;
    this.st = 2;
    if (!(this.peak > 0)) return;
    // the fast stretch: back from the peak to the first frame moving at least SWING.start of it; the line
    // runs from the point before that frame to where it is now
    let s = this.pi;
    while (s > 0 && this.spd[s - 1] >= SWING.start * this.peak) s--;
    const a = Math.max(0, s - 1), e = this.nb - 1;
    if (this.kind === 2) this._streak(SLASH.thrust * (this.look ? 1.4 : 1));
    else if (this.kind === 1) {
      // a turn: three straight cuts between points evenly along the stretch
      const k = SLASH.ring;
      for (let j = 1; j <= k; j++) {
        const i0 = Math.round(a + ((e - a) * (j - 1)) / k), i1 = Math.round(a + ((e - a) * j) / k);
        if (i1 > i0) this._cut(B[i0 * 3], B[i0 * 3 + 1], B[i0 * 3 + 2], B[i1 * 3], B[i1 * 3 + 1], B[i1 * 3 + 2], j === 1);
      }
    } else this._cut(B[a * 3], B[a * 3 + 1], B[a * 3 + 2], B[e * 3], B[e * 3 + 1], B[e * 3 + 2], true);
  }

  /** The line through the point's two places, carried on past both (no shorter than its min), kept off
   *  the ground and under its ceiling. `kick`: this line may kick the camera (a turn's first cut only). */
  _cut(x0, y0, z0, x1, y1, z1, kick) {
    const L = SLASH[LOOKS[this.look]];
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const d = Math.hypot(dx, dy, dz);
    if (!(d > 1e-3)) return;
    dx /= d;
    dy /= d;
    dz /= d;
    const len = Math.min(L.max, Math.max(L.min, d * (1 + 2 * L.ext)));
    const pad = (len - d) / 2;
    let s0 = -pad, s1 = d + pad; // along the line from the first point
    if (Math.abs(dy) > 1e-6) {
      const sF = (SLASH.floor - y0) / dy; // where it meets the floor
      if (dy < 0) s1 = Math.min(s1, sF);
      else s0 = Math.max(s0, sF);
      const sT = (Math.max(y0, y1) + L.over * (1 - dy * dy) - y0) / dy; // where it reaches its ceiling
      if (dy > 0) s1 = Math.min(s1, sT);
      else s0 = Math.max(s0, sT);
    } else if (y0 < SLASH.floor) return;
    if (!(s1 - s0 > 0.2)) return;
    this._draw(x0 + dx * s0, y0 + dy * s0, z0 + dz * s0, x0 + dx * s1, y0 + dy * s1, z0 + dz * s1, false, kick);
  }

  /** A thrust: a short streak straight on off the point, along the blade. */
  _streak(len) {
    const T = this.T, H = this.H;
    let dx = T[0] - H[0], dy = T[1] - H[1], dz = T[2] - H[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    this._draw(T[0], T[1], T[2], T[0] + dx * len, T[1] + dy * len, T[2] + dz * len, true, true);
  }

  _draw(ax, ay, az, bx, by, bz, thrust, kick) {
    const look = this.look, Lk = SLASH[LOOKS[look]];
    this.onLine?.(ax, ay, az, bx, by, bz, LOOKS[look], this.kind);
    const la = this.last;
    la[0] = ax;
    la[1] = ay;
    la[2] = az;
    la[3] = bx;
    la[4] = by;
    la[5] = bz;
    la[6] = look;
    la[7] = this.kind;
    this.lines++;
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-4)) return;
    dx /= len;
    dy /= len;
    dz /= len;
    // the weight of a heavy line: the picture thrown along the cut, a small shake
    const K = Lk.kick;
    if (K && kick) {
      const g = this.game;
      g?.kick?.(dx, dy, dz, K.m);
      g?.shake?.(K.shake);
      this.kicks++;
    }
    const fx = this.p.fx?.add;
    if (!fx?.spawn) return;
    const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
    // the stroke's turn on the screen (as fx.js alongRot), and the screen's across (for the rows)
    const C = this.game?.camera?.matrixWorld?.elements;
    let rot = Math.atan2(dy, dx) - Math.PI / 2;
    let px = 0, py = 1, pz = 0;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-10) rot = Math.atan2(sy, sx) - Math.PI / 2;
      const qx = dy * C[10] - dz * C[9], qy = dz * C[8] - dx * C[10], qz = dx * C[9] - dy * C[8], ql = Math.hypot(qx, qy, qz);
      if (ql > 1e-6) {
        px = qx / ql;
        py = qy / ql;
        pz = qz / ql;
      }
    }
    // (a thrust's streak: fewer strokes, thinner, sharp toward its far end)
    const n = thrust ? Math.max(10, Math.round(Lk.n * 0.4)) : Lk.n;
    const o = this._o, seg = len / n, k0 = thrust ? 0.75 : 1;
    const rows = thrust ? 1 : Math.max(1, Lk.rows | 0);
    o.rot = rot;
    o.colorEnd = Lk.end;
    for (let r = 0; r < rows; r++) {
      // (the middle row is the line; the rows beside it thinner, shorter, no flash, no hairline)
      const mid = (rows - 1) / 2, off = rows > 1 ? (r - mid) * Lk.gap : 0, side = off !== 0, k = side ? k0 * Lk.outer : k0;
      const wMin = side ? 0.3 + (0.25 * Math.abs(r - mid)) / mid : 0;
      for (let pass = 0; pass < 3; pass++) {
        if (side && pass > 0) break;
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n, s = (f - 0.5) * len;
          const y = cy + dy * s + py * off;
          if (y < SLASH.floor) continue;
          // sharp at both ends (a thrust: full at the point, sharp at its far end)
          const w = thrust ? Math.pow(Math.max(0, 1 - f), 0.6) : Math.pow(Math.sin(Math.PI * f), 0.7);
          if (side && w < wMin) continue;
          o.x = cx + dx * s + px * off;
          o.y = y;
          o.z = cz + dz * s + pz * off;
          if (pass === 0) {
            const size = Lk.size * k * (0.25 + 0.75 * w);
            o.size = size;
            o.sizeEnd = size * Lk.hold;
            o.stretch = Math.min(30, (seg / size) * 1.8);
            o.life = (Lk.life[0] + (Lk.life[1] - Lk.life[0]) * w) * (side ? 0.9 : 1);
            o.alphaEnd = Lk.fade;
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
