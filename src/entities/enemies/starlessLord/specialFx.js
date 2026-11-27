import { K_VOID, K_STEEL, K_SMOKE, K_FIRE, GROUND_Y } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// The upgraded looks of two of the Starless Lord's specials (ADR-251), three options each for the owner to
// pick from, '0' = as they ship (Void Lightning's crackle and bolt, the ignition the owner picked in ADR-122,
// `?ignite=a`; these draw OVER it):
//
//   `?boltFx=`   Void Lightning (every bolt from his free hand: Void Lightning, the bolts inside Void
//                Cadence, Lightning Verse, Chained Lightning, Thunder Verse, ...)
//     a  THE THREAD   through the windup the Void is wound into his fingers: two arms of violet motes
//                     spiral in and tighten to a white heart at the fingertips; the bolt leaves with two
//                     violet strands braided round its core and a ring of strokes punched out at his hand
//     b  THE TEAR     through the windup arcs crawl up his casting arm from the hand to the shoulder (the
//                     arm lit violet); the bolt leaves a tear in the air along its line: a dark seam with
//                     violet lips that hangs a breath and comes apart upward, letter by letter
//     c  THE STORM    through the windup the floor answers: arcs creep out along the floor round his feet,
//                     and past halfway short arcs drop from his hand to the floor; the bolt grounds three
//                     times along its line, each fork bursting on the floor in strokes and dust
//   `?igniteFx=` a form's ignition (the kneel, then the blades lit and the red shock ring; forms 2 - 4)
//     a  THE COCOON   through the kneel a column of tiny violet letters rises round him and draws in
//                     tight; as the blades light it bursts out flat along the floor with the shock ring
//     b  THE WRIT     through the kneel the new steel is written in light where it will stand (two blades
//                     out to his sides, the staff level across him, the cross-hilted blade upright before
//                     his face), cell by cell from the hand out; as it ignites the writing flashes white
//                     and is torn off as letters
//     c  THE ECLIPSE  through the kneel a ring of dark spreads on the floor round him with a red rim; as
//                     the blades light the rim stands up as a short wall of red and violet and falls
//
// All of it is heat in the fire field (STYLE.md "The fire field": the same small letters) and glyph
// particles of one letter cell, at his hand, his arm, the bolt's line or round his feet: never the sky,
// never the background's colour. It adds no hit, no cue and no floor mark: the gameplay is the move's own.
// Jitter draws from the looks' own stream (fx.lr), never Math.random or the stream gameplay reads.
// Cost (headless count, lord.mjs SPECIALFX): at most a few hundred blobs alive at a peak (the field holds 6000).

const TAU = Math.PI * 2;
const VIOLET = [2.6, 0.5, 3.4], VIOLET_END = [0.35, 0.05, 0.6];
const RED = [3.4, 0.25, 0.15], RED_END = [0.5, 0.03, 0.02];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export const boltLook = () => lookOf('boltFx', '0');
export const igniteLook = () => lookOf('igniteFx', '0');

export class LordSpecialFx {
  constructor(d) {
    this.d = d;
    this._a = { x: 0, y: 0, z: 0 };
    this._b = { x: 0, y: 0, z: 0 };
    this._c = { x: 0, y: 0, z: 0 };
    this.reset();
  }

  reset() {
    this._acc = 0;
    this._acc2 = 0;
    this._tears = [];
  }

  get fx() {
    return this.d.fx;
  }

  /** A world point of a joint's origin into `o`. */
  _at(obj, o) {
    if (!obj?.matrixWorld) return null;
    const e = obj.matrixWorld.elements;
    o.x = e[12];
    o.y = e[13];
    o.z = e[14];
    return o;
  }

  /** Every frame after the pose (lord.afterPose): `a` the move he is in, or null. */
  frame(dt, a) {
    const d = this.d, F = this.fx;
    if (!F?.fire || !(dt > 0) || d.mode === 'dying' || d.mode === 'dead') return;
    this._tearsStep(dt);
    if (!a) return;
    const cur = a.beats?.find((b) => a.t < b.impact);
    if (!cur || cur.feint) return;
    const k = Math.min(1, Math.max(0, (a.t - cur.start) / Math.max(0.05, cur.impact - cur.start)));
    if (a.def?.transition) {
      const L = igniteLook();
      if (L !== '0') this._igniteWind(L, k, dt, a.def.phase ?? d.phase);
    } else if (cur.def?.bolt) {
      const L = boltLook();
      if (L !== '0') this._boltWind(L, k, dt);
    }
  }

  /** The bolt leaves his hand (lord.onImpact): from `h` to `e` (world points). */
  bolt(h, e) {
    const L = boltLook();
    if (L === '0' || !this.fx?.fire || !h || !e || !Number.isFinite(h.x + h.y + h.z + e.x + e.y + e.z)) return;
    if (L === 'a') this._boltThread(h, e);
    else if (L === 'b') this._boltTear(h, e);
    else if (L === 'c') this._boltStorm(h, e);
  }

  /** A form's ignition lands (lord.onImpact, after the shipped nova). */
  ignite(form) {
    const L = igniteLook();
    if (L === '0' || !this.fx?.fire) return;
    const d = this.d, x = fin(d.position.x), z = fin(d.position.z);
    if (L === 'a') this._cocoonBurst(x, z);
    else if (L === 'b') this._writBurst(form);
    else if (L === 'c') this._eclipseWall(x, z);
  }

  // ---------------------------------------------------------------- Void Lightning: the windups
  _boltWind(L, k, dt) {
    const d = this.d, F = this.fx, h = d._hand;
    if (!h || !Number.isFinite(h.x + h.y + h.z)) return;
    const t = fin(d.time), A = F._axes();
    if (L === 'a') {
      // two arms of motes spiralling in to the fingertips, tightening as the cast comes
      const R0 = 1.0 - 0.45 * k;
      for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 8; i++) {
        const u = i / 7, r = R0 * (1 - u) + 0.04, ang = arm * Math.PI + u * 5.5 - t * (7 + 7 * k);
        const c = Math.cos(ang) * r, s = Math.sin(ang) * r;
        F._dot(h.x + A.rx * c + A.ux * s, h.y + A.ry * c + A.uy * s, h.z + A.rz * c + A.uz * s, 0.16 + 0.06 * u, 0.3 + 0.55 * u * (0.5 + 0.5 * k), K_VOID);
      }
      // the heart: white, swelling
      F._dot(h.x, h.y, h.z, 0.18 + 0.2 * k, 0.7 + 0.65 * k, K_STEEL);
      this._acc += dt * (10 + 24 * k);
      while (this._acc >= 1) {
        this._acc -= 1;
        const a = F.lr() * TAU, R = F.lrand(0.8, 1.3), mx = h.x + (A.rx * Math.cos(a) + A.ux * Math.sin(a)) * R, my = h.y + (A.ry * Math.cos(a) + A.uy * Math.sin(a)) * R, mz = h.z + (A.rz * Math.cos(a) + A.uz * Math.sin(a)) * R;
        const life = F.lrand(0.18, 0.3);
        F._spawn(F.add, { x: mx, y: my, z: mz, vx: (h.x - mx) / life, vy: (h.y - my) / life, vz: (h.z - mz) / life, life, size: 0.11, sizeEnd: 0.04, glyph: ".'", color: VIOLET, colorEnd: VIOLET_END, alpha: 0.25, alphaEnd: 1 });
      }
    } else if (L === 'b') {
      // arcs crawling up the casting arm, the arm lit
      const R = d.rig?.arms?.L;
      const w = this._at(R?.wrist ?? R?.fore, this._a), e = this._at(R?.fore, this._b), s = this._at(R?.upper, this._c);
      if (!w || !e || !s) return;
      const pts = [h, w, e, s];
      for (let i = 0; i < 3; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        for (let q = 0; q <= 2; q++) {
          const u = q / 2;
          F._dot(p0.x + (p1.x - p0.x) * u, p0.y + (p1.y - p0.y) * u, p0.z + (p1.z - p0.z) * u, 0.2, (0.2 + 0.45 * k) * (1 - i * 0.2), K_VOID);
        }
      }
      this._acc += dt * (6 + 26 * k);
      while (this._acc >= 1) {
        this._acc -= 1;
        // an arc from one joint to the next (how far up the arm it reaches grows with k)
        const i = Math.min(2, Math.floor(F.lr() * (1 + 2.2 * k))), p0 = pts[i], p1 = pts[i + 1];
        F.arc(p0.x, p0.y, p0.z, p1.x + F.lrand(-0.12, 0.12), p1.y + F.lrand(-0.12, 0.12), p1.z + F.lrand(-0.12, 0.12), 0.18, null, null, 3);
      }
      F._dot(h.x, h.y, h.z, 0.22 + 0.15 * k, 0.55 + 0.5 * k, K_STEEL);
    } else if (L === 'c') {
      // the floor answers round his feet; past halfway arcs drop from the hand
      const x = fin(d.position.x), z = fin(d.position.z);
      this._acc += dt * (8 + 22 * k);
      while (this._acc >= 1) {
        this._acc -= 1;
        const a = F.lr() * TAU, r0 = F.lrand(0.3, 0.6), r1 = r0 + F.lrand(0.6, 1.2) * (0.5 + k);
        F.arc(x + Math.cos(a) * r0, GROUND_Y, z + Math.sin(a) * r0, x + Math.cos(a + F.lrand(-0.3, 0.3)) * r1, GROUND_Y, z + Math.sin(a + F.lrand(-0.3, 0.3)) * r1, 0.24, null, null, 3);
        if (k > 0.5 && F.lr() < 0.35) F.arc(h.x, h.y, h.z, h.x + F.lrand(-0.6, 0.6), GROUND_Y, h.z + F.lrand(-0.6, 0.6), 0.22, null, null, 4);
      }
      F._dot(h.x, h.y, h.z, 0.25 + 0.15 * k, 0.5 + 0.5 * k, K_VOID);
      F._dot(x, GROUND_Y + 0.05, z, 0.9 + 0.8 * k, 0.12 + 0.22 * k, K_VOID);
    }
  }

  // ---------------------------------------------------------------- Void Lightning: the bolts
  /** a: two violet strands braided round the core, a ring punched out at the hand. */
  _boltThread(h, e) {
    const F = this.fx, A = F._axes();
    const dx = e.x - h.x, dy = e.y - h.y, dz = e.z - h.z, len = Math.hypot(dx, dy, dz);
    if (!(len > 0.2)) return;
    // two unit vectors across the line: one level, one up
    const hl = Math.hypot(dx, dz) || 1, px = -dz / hl, pz = dx / hl;
    const n = Math.max(6, Math.min(48, Math.round(len / 0.28)));
    for (let s = 0; s < 2; s++) {
      let lx = h.x, ly = h.y, lz = h.z;
      for (let i = 1; i <= n; i++) {
        const u = i / n, th = u * len * 3.2 + s * Math.PI, r = 0.2 * Math.min(1, u * 6) * Math.min(1, (1 - u) * 6 + 0.2);
        const x = h.x + dx * u + px * Math.cos(th) * r, y = h.y + dy * u + Math.sin(th) * r, z = h.z + dz * u + pz * Math.cos(th) * r;
        F._ink(lx, ly, lz, x, y, z, F.lrand(0.32, 0.42), 1.0, 0.0, 1.0, i > 1 ? 1 : 0, K_VOID);
        lx = x;
        ly = y;
        lz = z;
      }
    }
    // the ring punched out at the hand
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = 5.5;
      const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
      F._blob(h.x + ux * 0.12, h.y + uy * 0.12, h.z + uz * 0.12, ux * sp, uy * sp, uz * sp, 0.16, 0.27, 0.2, 0.75, 0, K_STEEL, 6);
    }
    F._blob(h.x, h.y, h.z, 0, 0, 0, 0.18, 0.5, 0.2, 1.2, 0, K_STEEL);
  }

  /** b: a tear in the air along the line, hanging a breath, then coming apart upward. */
  _boltTear(h, e) {
    const dx = e.x - h.x, dy = e.y - h.y, dz = e.z - h.z, len = Math.hypot(dx, dy, dz);
    if (!(len > 0.2)) return;
    if (this._tears.length >= 4) this._tears.shift();
    this._tears.push({ ax: h.x, ay: h.y, az: h.z, bx: e.x, by: e.y, bz: e.z, len, t: 0, life: 0.55 });
  }

  _tearsStep(dt) {
    const F = this.fx;
    for (let j = this._tears.length - 1; j >= 0; j--) {
      const T = this._tears[j];
      T.t += dt;
      if (T.t >= T.life) {
        this._tears.splice(j, 1);
        continue;
      }
      const k = T.t / T.life, open = Math.min(1, T.t / 0.08), fade = 1 - k;
      const n = Math.max(4, Math.min(36, Math.round(T.len / 0.34)));
      const A = F._axes();
      for (let i = 0; i <= n; i++) {
        const u = i / n, w = Math.sin(Math.PI * u) * 0.22 * open * (1 + 0.6 * k);
        const x = T.ax + (T.bx - T.ax) * u, y = T.ay + (T.by - T.ay) * u + 0.35 * k * k, z = T.az + (T.bz - T.az) * u;
        // the dark seam, its violet lips above and below (in the camera's up)
        F._dot(x, y, z, 0.3 + w, 0.55 * fade, K_SMOKE);
        F._dot(x + A.ux * w, y + A.uy * w, z + A.uz * w, 0.18, (0.6 + 0.3 * open) * fade, K_VOID);
        F._dot(x - A.ux * w, y - A.uy * w, z - A.uz * w, 0.18, (0.6 + 0.3 * open) * fade, K_VOID);
      }
      // it comes apart upward: letters torn off the lips
      this._acc2 += dt * 60 * (0.3 + k);
      while (this._acc2 >= 1) {
        this._acc2 -= 1;
        const u = F.lr(), x = T.ax + (T.bx - T.ax) * u, y = T.ay + (T.by - T.ay) * u, z = T.az + (T.bz - T.az) * u;
        F._spawn(F.add, { x, y, z, vx: F.lrand(-0.3, 0.3), vy: F.lrand(0.8, 2.2), vz: F.lrand(-0.3, 0.3), life: F.lrand(0.3, 0.55), size: 0.12, sizeEnd: 0.05, glyph: "'.:", color: VIOLET, colorEnd: VIOLET_END, alpha: 0.9, alphaEnd: 0, drag: 1.5 });
      }
    }
  }

  /** c: the bolt grounds three times along its line, each fork bursting on the floor. */
  _boltStorm(h, e) {
    const F = this.fx;
    for (const u of [0.3, 0.55, 0.82]) {
      const x = h.x + (e.x - h.x) * u, y = h.y + (e.y - h.y) * u, z = h.z + (e.z - h.z) * u;
      const gx = x + F.lrand(-0.7, 0.7), gz = z + F.lrand(-0.7, 0.7);
      F.lightning(x, y, z, gx, GROUND_Y, gz, 0.7, false);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + F.lr() * 0.4, sp = F.lrand(3, 6);
        F._blob(gx, GROUND_Y + 0.05, gz, Math.cos(a) * sp, 0, Math.sin(a) * sp, F.lrand(0.12, 0.2), 0.27, 0.2, 0.7, 0, K_STEEL, 6);
      }
      for (let i = 0; i < 5; i++) F._blob(gx + F.lrand(-0.3, 0.3), 0.25, gz + F.lrand(-0.3, 0.3), F.lrand(-0.6, 0.6), F.lrand(0.4, 1.2), F.lrand(-0.6, 0.6), F.lrand(0.5, 0.8), 0.5, 1.0, 0.4, 0, K_SMOKE, 1.5);
    }
  }

  // ---------------------------------------------------------------- the ignitions
  _igniteWind(L, k, dt, form) {
    const d = this.d, F = this.fx, x = fin(d.position.x), z = fin(d.position.z), t = fin(d.time);
    if (L === 'a') {
      // a column of tiny letters rising round him, drawing in
      this._acc += dt * (30 + 70 * k);
      const r = 1.3 - 0.75 * k;
      while (this._acc >= 1) {
        this._acc -= 1;
        const a = F.lr() * TAU, rr = r * F.lrand(0.85, 1.15);
        F._blob(x + Math.cos(a) * rr, F.lrand(0.05, 0.4), z + Math.sin(a) * rr, -Math.sin(a) * 1.4, F.lrand(1.6, 3.2), Math.cos(a) * 1.4, F.lrand(0.5, 0.8), 0.22, 0.14, 0.42 + 0.35 * k, 0, K_VOID, 0.6);
      }
    } else if (L === 'b') {
      // the new steel written in light where it will stand, cell by cell from the hand out
      const yaw = fin(d.yaw), fx = Math.sin(yaw), fz = Math.cos(yaw), sx = -fz, sz = fx;
      const reach = Math.min(1, k * 1.25);
      const line = (ax, ay, az, bx, by, bz) => {
        F._ink(ax, ay, az, ax + (bx - ax) * reach, ay + (by - ay) * reach, az + (bz - az) * reach, 0, 0.75 + 0.35 * k);
      };
      const y = 1.0;
      if (form === 2) {
        // two blades out to his sides
        line(x - sx * 0.35, y, z - sz * 0.35, x - sx * 1.6 - fx * 0.3, y + 0.35, z - sz * 1.6 - fz * 0.3);
        line(x + sx * 0.35, y, z + sz * 0.35, x + sx * 1.6 - fx * 0.3, y + 0.35, z + sz * 1.6 - fz * 0.3);
      } else if (form === 3) {
        // the staff level across him (from the middle out both ways)
        line(x + fx * 0.3, y, z + fz * 0.3, x + fx * 0.3 + sx * 1.6, y, z + fz * 0.3 + sz * 1.6);
        line(x + fx * 0.3, y, z + fz * 0.3, x + fx * 0.3 - sx * 1.6, y, z + fz * 0.3 - sz * 1.6);
      } else {
        // the cross-hilted blade upright before his face
        line(x + fx * 0.4, 0.9, z + fz * 0.4, x + fx * 0.4, 2.7, z + fz * 0.4);
        if (k > 0.7) line(x + fx * 0.4 - sx * 0.3, 1.2, z + fz * 0.4 - sz * 0.3, x + fx * 0.4 + sx * 0.3, 1.2, z + fz * 0.4 + sz * 0.3);
      }
      if (F.lr() < dt * 20) F._spawn(F.add, { x: x + F.lrand(-1, 1), y: F.lrand(0.6, 1.8), z: z + F.lrand(-1, 1), vx: 0, vy: 0.6, vz: 0, life: 0.4, size: 0.11, sizeEnd: 0.04, glyph: ".'", color: [3, 3, 3.4], colorEnd: VIOLET_END, alpha: 1, alphaEnd: 0 });
      this._writ = { form, x, z, fx, fz, sx, sz, t };
    } else if (L === 'c') {
      // a ring of dark spreading on the floor, its rim red
      const R = 0.6 + 2.2 * k, n = Math.round(14 + 26 * k);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 0.4;
        F._dot(x + Math.cos(a) * R, GROUND_Y + 0.04, z + Math.sin(a) * R, 0.32, 0.35 + 0.45 * k, K_FIRE);
        F._dot(x + Math.cos(a) * R * 0.7, GROUND_Y + 0.03, z + Math.sin(a) * R * 0.7, 0.6, 0.35 + 0.3 * k, K_SMOKE);
      }
      F._dot(x, GROUND_Y + 0.03, z, R * 0.9, 0.3 + 0.3 * k, K_SMOKE);
    }
  }

  _cocoonBurst(x, z) {
    const F = this.fx;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU + F.lr() * 0.1, sp = F.lrand(9, 13);
      F._blob(x + Math.cos(a) * 0.5, F.lrand(0.15, 0.6), z + Math.sin(a) * 0.5, Math.cos(a) * sp, F.lrand(0, 0.6), Math.sin(a) * sp, F.lrand(0.32, 0.45), 0.3, 0.22, 0.85, 0, K_VOID, 2.5);
    }
    for (let i = 0; i < 24; i++) {
      const a = F.lr() * TAU, sp = F.lrand(2, 6);
      F._spawn(F.add, { x, y: F.lrand(0.4, 2.2), z, vx: Math.cos(a) * sp, vy: F.lrand(1, 4), vz: Math.sin(a) * sp, life: F.lrand(0.4, 0.8), size: 0.12, sizeEnd: 0.04, glyph: "'.:", color: VIOLET, colorEnd: VIOLET_END, alpha: 1, alphaEnd: 0, drag: 2 });
    }
  }

  _writBurst(form) {
    const F = this.fx, W = this._writ;
    if (!W) return;
    const seg = [];
    const y = 1.0;
    if (form === 2) seg.push([-0.35, -1.6, -0.3, 0.35], [0.35, 1.6, -0.3, 0.35]);
    else if (form === 3) seg.push([0, 1.6, 0.3, 0], [0, -1.6, 0.3, 0]);
    for (const [s0, s1, f0, up] of seg) {
      for (let i = 0; i <= 12; i++) {
        const u = i / 12, s = s0 + (s1 - s0) * u, xx = W.x + W.sx * s + W.fx * f0 * u, zz = W.z + W.sz * s + W.fz * f0 * u, yy = y + up * u;
        F._blob(xx, yy, zz, 0, 0, 0, 0.12, 0.3, 0.2, 1.3, 0, K_STEEL);
        F._spawn(F.add, { x: xx, y: yy, z: zz, vx: F.lrand(-1.5, 1.5), vy: F.lrand(0.5, 3), vz: F.lrand(-1.5, 1.5), life: F.lrand(0.35, 0.6), size: 0.13, sizeEnd: 0.04, glyph: "|/-\\", color: [3.4, 3.3, 3.6], colorEnd: VIOLET_END, alpha: 1, alphaEnd: 0, drag: 2 });
      }
    }
    if (form >= 4) {
      const xx = W.x + W.fx * 0.4, zz = W.z + W.fz * 0.4;
      for (let i = 0; i <= 14; i++) {
        const yy = 0.9 + (1.8 * i) / 14;
        F._blob(xx, yy, zz, 0, 0, 0, 0.12, 0.3, 0.2, 1.3, 0, K_STEEL);
        F._spawn(F.add, { x: xx, y: yy, z: zz, vx: F.lrand(-2, 2), vy: F.lrand(-0.5, 1.5), vz: F.lrand(-2, 2), life: F.lrand(0.35, 0.6), size: 0.13, sizeEnd: 0.04, glyph: "|/-\\", color: [3.4, 3.3, 3.6], colorEnd: VIOLET_END, alpha: 1, alphaEnd: 0, drag: 2 });
      }
    }
    this._writ = null;
  }

  _eclipseWall(x, z) {
    const F = this.fx, R = 2.8;
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU;
      const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R;
      F._blob(px, GROUND_Y + 0.1, pz, Math.cos(a) * 0.6, F.lrand(4, 6.5), Math.sin(a) * 0.6, F.lrand(0.28, 0.4), 0.34, 0.2, 0.85, 0, K_FIRE, 1, 9);
      if (i % 2 === 0) F._blob(px, GROUND_Y + 0.2, pz, Math.cos(a) * 0.4, F.lrand(3, 5), Math.sin(a) * 0.4, F.lrand(0.3, 0.45), 0.4, 0.25, 0.55, 0, K_VOID, 1, 7);
    }
    for (let i = 0; i < 16; i++) {
      const a = F.lr() * TAU;
      F._spawn(F.add, { x: x + Math.cos(a) * R, y: 0.3, z: z + Math.sin(a) * R, vx: Math.cos(a) * 1.5, vy: F.lrand(2, 5), vz: Math.sin(a) * 1.5, life: F.lrand(0.4, 0.7), size: 0.12, sizeEnd: 0.04, glyph: "+'", color: RED, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 1.5, gravity: -6 });
    }
  }
}
