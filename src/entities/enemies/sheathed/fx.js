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

export class SheathFx extends DuelFx {
  constructor(d) {
    super(d);
    this._mg = 0;
  }

  /** The cut's look ('a' the one white line; 'b' the line and an afterimage where he stood). */
  drawCutLook() {
    return lookOf('drawCut', 'a') === 'b' ? 'b' : 'a';
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
  }

  /** The cut: a white-hot line from a (the scabbard's mouth) to b (the blade's end), then the wake to c. */
  drawLine(ax, ay, az, bx, by, bz, cx, cy, cz) {
    if (!Number.isFinite(ax + ay + az + bx + by + bz + cx + cy + cz)) return;
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
