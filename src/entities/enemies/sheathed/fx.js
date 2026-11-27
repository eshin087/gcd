import { DuelFx, K_STEEL, K_SMOKE } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// Lu Wusheng's effects (STYLE.md → "The Sheathed"): all heat in the fire field, in the same small
// letters, no glyph sprite. Look code draws from the looks' stream (`lr()`), never `rnd()` or
// Math.random.
//   mouthGlint   the stillness: a pinpoint of pale light at the scabbard's mouth that grows into a
//                short bright thread (white, not a colour)
//   drawLine     the cut: on the cut's frame one white-hot inked line from the scabbard's mouth through
//                the hero to the blade's end (the part that harms, the zone's), and beyond it THE WAKE, a
//                thinner pale line (`?drawCut=b`: and an afterimage of him where he stood)
//   hairline     between the cut and the click: a hair-thin pale line at cut height where the wake passed
//   woodSweep    a scabbard blow's trail: dull wood, not steel
//   lateLine     a hanging cut of phase 3 (lateCuts.js): marked on the ground until it cuts
const PALE = 0.34;
const TAU = Math.PI * 2;
// the draw's looks (ADR-252, `?drawFx=a|b|c`, '0' = as shipped; awaiting the owner's pick from the films): the
// letters' colours (the add pool: above 1 a letter glows), pale steel, never blue (the blue flare is the cue)
const AIR = [0.8, 0.85, 1.0], AIR_HOT = [2.2, 2.3, 2.6], LEAF = [1.0, 1.05, 0.95], LEAF_END = [0.45, 0.48, 0.42];
const HANG = 110; // b: the letters left hanging along a cut (dropped on the click)

export class SheathFx extends DuelFx {
  constructor(d) {
    super(d);
    this._mg = 0;
    this._inAcc = 0;
    this._hang = new Float32Array(HANG * 3);
    this._hangN = 0;
  }

  /** The cut's look ('a' the one white line; 'b' the line and an afterimage where he stood). */
  drawCutLook() {
    return lookOf('drawCut', 'a') === 'b' ? 'b' : 'a';
  }

  /** The draw's look (ADR-252): '0' as shipped; 'a' the drawn breath; 'b' hanging leaves; 'c' the late sound. */
  drawFxLook() {
    const v = lookOf('drawFx', '0');
    return v === 'a' || v === 'b' || v === 'c' ? v : '0';
  }

  /** The stillness at the scabbard's mouth (k 0..1 through the cock): drawn this frame only. `dx..dz`
   *  the way the hilt points (the thread grows along it). */
  mouthGlint(x, y, z, dx, dy, dz, k) {
    if (!Number.isFinite(x + y + z + dx + dy + dz + k)) return;
    const P = this._toCamera(x, y, z);
    this._dot(P.x, P.y, P.z, 0.12, 0.7 + 0.9 * k, K_STEEL);
    if (k > 0.15) {
      const L = 0.06 + 0.26 * k;
      this._ink(P.x, P.y, P.z, P.x + dx * L, P.y + dy * L, P.z + dz * L, 0, 0.85 + 0.6 * k, 0, 0.5);
    }
    if (this.drawFxLook() === 'a') this._breathIn(x, y, z, k);
  }

  /** a, the drawn breath: the air round him drawn into the scabbard's mouth through the stillness, faster
   *  as the click nears (tiny pale letters converging, a faint ring tightening round the mouth). */
  _breathIn(x, y, z, k) {
    const fdt = Math.max(0, Math.min(0.1, Number(this.game.fxDt ?? this.game.dt) || 0.016));
    this._inAcc += fdt * (30 + 90 * k);
    while (this._inAcc >= 1) {
      this._inAcc -= 1;
      const a = this.lr() * TAU, e = this.lrand(-0.5, 0.7), r = this.lrand(0.7, 1.4), T = this.lrand(0.22, 0.34);
      const sx = x + Math.cos(a) * r, sy = Math.max(0.15, y + e * r), sz = z + Math.sin(a) * r;
      const o = this._rec(sx, sy, sz, T, this.lrand(0.12, 0.16), 0.05, "'-.", AIR, AIR_HOT);
      o.vx = (x - sx) / T;
      o.vy = (y - sy) / T;
      o.vz = (z - sz) / T;
      o.alpha = 0.4;
      o.alphaEnd = 1;
      this._spawn(this.add, o);
    }
    const life = this._frame();
    if (life > 0 && k > 0.2) {
      const P = this._toCamera(x, y, z), A = this._axes(), rr = 0.34 - 0.16 * k, h = 0.2 + 0.5 * k;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
        this._blob(P.x + A.rx * ca + A.ux * sa, P.y + A.ry * ca + A.uy * sa, P.z + A.rz * ca + A.uz * sa, 0, 0, 0, life, 0.12, 0.12, h, h, K_STEEL);
      }
    }
  }

  /** The cut: a white-hot line from a (the scabbard's mouth) to b (the blade's end), then the wake to c. */
  drawLine(ax, ay, az, bx, by, bz, cx, cy, cz) {
    if (!Number.isFinite(ax + ay + az + bx + by + bz + cx + cy + cz)) return;
    const L = this.drawFxLook();
    if (L === 'a') this._breathOut(ax, ay, az, bx, by, bz);
    else if (L === 'b') this._leaves(ax, ay, az, bx, by, bz, cx, cz);
    if (L === 'c') {
      // c: the late sound: the cut itself all but silent (a thin line, no breath of air); the click opens it
      this._ink(ax, ay, az, bx, by, bz, 0.35, 1.25, 0.1, 1.1);
      this._ink(bx, by, bz, cx, cy, cz, 0.5, 0.36, 0.04, 0.22, 1);
      return;
    }
    this._ink(ax, ay, az, bx, by, bz, 0.5, 1.8, 0.3, 1.6);
    // a second, cooler line a hair below it: the edge reads thick for the frame it lands
    this._ink(ax, ay - 0.05, az, bx, by - 0.05, bz, 0.22, 1.0, 0, 0.9);
    this._ink(bx, by, bz, cx, cy, cz, 0.6, 0.5, 0.06, 0.3, 1);
    // a breath of cut air along it
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t = this.lr();
      this._blob(ax + (bx - ax) * t, ay + (by - ay) * t + this.lrand(-0.1, 0.1), az + (bz - az) * t, this.lrand(-0.3, 0.3), this.lrand(0.0, 0.3), this.lrand(-0.3, 0.3), this.lrand(0.25, 0.4), 0.3, 0.5, 0.3, 0, K_SMOKE, 1.2);
    }
    this._lookLight?.({ x: (ax + bx) / 2, y: ay, z: (az + bz) / 2, color: [1, 1, 1.05], intensity: 3.5, radius: 7, life: 0.18 });
  }

  /** a: the breath let go: the air drawn in thrown out along the cut from the blade's end, and a ripple of
   *  cut air round where the cut ended. */
  _breathOut(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    for (let i = 0; i < 110; i++) {
      const t = this.lrand(0.25, 1), sp = this.lrand(6, 16), side = this.lrand(-0.35, 0.35);
      const o = this._rec(ax + dx * t, ay + this.lrand(-0.12, 0.12), az + dz * t, this.lrand(0.22, 0.45), this.lrand(0.12, 0.17), 0.04, "'-.", AIR_HOT, AIR);
      o.vx = (ux - uz * side) * sp;
      o.vy = this.lrand(-0.4, 0.8);
      o.vz = (uz + ux * side) * sp;
      o.drag = 3.2;
      this._spawn(this.add, o);
    }
    this._airRipple(bx, bz, by, 0.3, 2.4, 0.36, 0.85, 0.45, 0.22, 0.3);
  }

  /** b: hanging leaves: the blade's unseen arc drawn for an instant at cut height round where he ended,
   *  and pale letters left hanging along the whole line, drifting a little, until the click drops them. */
  _leaves(ax, ay, az, bx, by, bz, cx, cz) {
    const d = this.d, ox = d?.position?.x ?? bx, oz = d?.position?.z ?? bz, yaw = Number.isFinite(d?.yaw) ? d.yaw : Math.atan2(bx - ax, bz - az);
    // the arc: from his left round through his front to his right (the cut he made), 1.05 m out
    let px = NaN, pz = NaN;
    for (let i = 0; i <= 14; i++) {
      const a = yaw + 1.7 - (i / 14) * 2.9, qx = ox + Math.sin(a) * 1.05, qz = oz + Math.cos(a) * 1.05;
      if (i) this._ink(px, ay, pz, qx, ay, qz, 0.35, 0.8 + 0.8 * (i / 14), 0, 0.9 + 0.7 * (i / 14), 1);
      px = qx;
      pz = qz;
    }
    const W = this.game.world?.life?.wind, wx = (W?.dirX ?? 0) * 0.15, wz = (W?.dirZ ?? 0) * 0.15;
    const ex = cx - ax, ez = cz - az;
    this._hangN = 0;
    for (let i = 0; i < HANG; i++) {
      const t = this.lr() * (i < HANG * 0.6 ? 0.45 : 1), x = ax + ex * t + this.lrand(-0.12, 0.12), y = ay + this.lrand(-0.2, 0.16), z = az + ez * t + this.lrand(-0.12, 0.12);
      const o = this._rec(x, y, z, this.lrand(0.85, 1.05), this.lrand(0.11, 0.15), 0.11, "'-.", LEAF, LEAF);
      o.vx = wx + this.lrand(-0.08, 0.08);
      o.vy = this.lrand(-0.12, 0.02);
      o.vz = wz + this.lrand(-0.08, 0.08);
      o.alpha = 0.9;
      o.alphaEnd = 0.7;
      o.flicker = 0.3;
      this._spawn(this.add, o);
      this._hang[i * 3] = x + o.vx * 0.9;
      this._hang[i * 3 + 1] = y + o.vy * 0.9;
      this._hang[i * 3 + 2] = z + o.vz * 0.9;
      this._hangN = i + 1;
    }
  }

  /** The re-sheathe's click (sheathed.js _onClick, with the wake still hanging): b drops the hanging
   *  letters; c opens the line: a white seam along it, the air split to both sides, two ripples. */
  drawClick(ax, az, cx, cz, y) {
    if (!Number.isFinite(ax + az + cx + cz + y)) return;
    const L = this.drawFxLook();
    if (L === 'b') {
      for (let i = 0; i < this._hangN; i++) {
        const o = this._rec(this._hang[i * 3], this._hang[i * 3 + 1], this._hang[i * 3 + 2], this.lrand(0.5, 0.8), 0.13, 0.08, "'-.", LEAF, LEAF_END);
        o.vx = this.lrand(-0.3, 0.3);
        o.vy = this.lrand(-1.2, -0.3);
        o.vz = this.lrand(-0.3, 0.3);
        o.gravity = -5;
        o.drag = 0.8;
        o.alpha = 0.9;
        o.spin = this.lrand(-6, 6);
        this._spawn(this.add, o);
      }
      this._hangN = 0;
      return;
    }
    if (L !== 'c') return;
    const ex = cx - ax, ez = cz - az, l = Math.hypot(ex, ez) || 1, nx = -ez / l, nz = ex / l;
    this._ink(ax, y, az, cx, y, cz, 0.26, 1.9, 0, 1.5);
    for (let i = 0; i < 140; i++) {
      const t = this.lr(), s = this.lr() < 0.5 ? -1 : 1, sp = this.lrand(4, 11);
      const o = this._rec(ax + ex * t, y + this.lrand(-0.1, 0.1), az + ez * t, this.lrand(0.3, 0.6), this.lrand(0.12, 0.17), 0.04, "*'-", AIR_HOT, AIR);
      o.vx = nx * s * sp + this.lrand(-0.6, 0.6);
      o.vy = this.lrand(-0.5, 2.2);
      o.vz = nz * s * sp + this.lrand(-0.6, 0.6);
      o.drag = 2.6;
      o.gravity = -3;
      this._spawn(this.add, o);
    }
    for (let i = 0; i < 14; i++) {
      const t = this.lr();
      this._blob(ax + ex * t, y + this.lrand(-0.1, 0.1), az + ez * t, nx * this.lrand(-1, 1), this.lrand(0, 0.5), nz * this.lrand(-1, 1), this.lrand(0.3, 0.5), 0.35, 0.7, 0.32, 0, K_SMOKE, 1.4);
    }
    for (const t of [0.15, 0.4, 0.65, 0.9]) this._airRipple(ax + ex * t, az + ez * t, y, 0.25, 1.8, 0.38, 0.8, 0.45, 0.22, 0.3);
    this._lookLight?.({ x: ax + ex * 0.5, y, z: az + ez * 0.5, color: [1, 1, 1.05], intensity: 3, radius: 8, life: 0.18 });
  }

  /** The wake hangs where it passed, until the click (this frame only). */
  hairline(ax, ay, az, bx, by, bz, k = 1) {
    if (!Number.isFinite(ax + ay + az + bx + by + bz)) return;
    this._ink(ax, ay, az, bx, by, bz, 0, PALE * k, 0, PALE * k * 0.6);
  }

  /** A scabbard blow's trail: the weapon's tip path at a low heat (lacquered wood, no steel's wash). */
  woodSweep(pa, pb, a, b) {
    if (!this.fire || !Number.isFinite(pa.x + pa.y + pa.z + pb.x + pb.y + pb.z + a.x + a.y + a.z + b.x + b.y + b.z)) return;
    const step = Math.hypot(b.x - pb.x, b.y - pb.y, b.z - pb.z);
    if (step < 0.04 || step > 6) return;
    this._ink(pb.x, pb.y, pb.z, b.x, b.y, b.z, this.lrand(0.14, 0.2), 0.62, 0, 0.62, 1);
  }

  /** A hanging cut (lateCuts.js): its line on the ground, `k` 0..1 toward its cut (this frame only). */
  lateLine(ax, az, bx, bz, k) {
    if (!Number.isFinite(ax + az + bx + bz + k)) return;
    const y = 0.32;
    this._ink(ax, y, az, bx, y, bz, 0, 0.3 + 0.55 * k, 0, 0.3 + 0.55 * k);
  }

  /** A hanging cut cuts: a white-hot line along it, at the height of a man's waist, and grit off the floor. */
  lateCut(ax, az, bx, bz) {
    if (!Number.isFinite(ax + az + bx + bz)) return;
    this._ink(ax, 1.05, az, bx, 1.05, bz, 0.45, 1.7, 0.2, 1.7);
    for (let i = 0; i < 8; i++) {
      const t = this.lr();
      this._blob(ax + (bx - ax) * t, 0.3, az + (bz - az) * t, 0, this.lrand(0.3, 0.8), 0, this.lrand(0.3, 0.5), 0.3, 0.55, 0.32, 0, K_SMOKE, 1, 0.5);
    }
  }
}
