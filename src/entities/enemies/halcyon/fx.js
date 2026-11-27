import { AscFx } from '../ascendant/fx.js';
import { K_SMOKE, K_VOID, K_STEEL, K_FIRE } from '../duelist/fx.js';
import { FIRE_PALETTES } from '../../../render/firePalettes.js';
import { halLook } from './look.js';
import { eyesLook, eyeBeam, eyeCharge, eyesAxis } from './fxEyes.js';
import { shockwave, shockUpdate, shockReset } from './fxShock.js';

// Halcyon's effects: Tian Lei's (AscFx: the beam's body, the splash, the muzzle, the crater, the vanish,
// the limb trails; every drawing method on its own stream) with his eyes' heat in place of the gold. The
// fire field has no crimson kind: this level swaps the VOID slot for his glare palette as this class is
// built (?glare=a|b|c, look.js), as the Skybreak Ring swaps in gold. Everything that burns or glows is
// heat in the fire field (STYLE.md "The fire field"); glyph particles are only small things that fly.
//
// His own surface (positions in world metres; `dt` methods every frame while they last):
//   eyes(x, y, z, k)                         two points of red heat at his eyes, k 0..1 the kindle
//   afterimage(d, dx, dz)                    a figure of steel left behind him (a pass, a vanish, a crash)
//   towerFlare(x, y0, z, ux, uz, w, h, k)    the windows on a tower's face lit along his line (the tell)
//   skyMark(x, z, r, u)                      a dark disc with a red rim on the ground (The Falling Sky)
//   avenueMark(ax, az, bx, bz, k)            red strokes along the road (Scorched Avenue's line)
//   crashBurst(x, y, z, dx, dz)              his body through a storefront: debris, dust, a ring of air
//   shockwave(x, z, r, y, land)              (ADR-254) Applause's ring / Meteor's landing under `?halShock=a|b`
//                                            (fxShock.js); false under '0' (the caller draws the dust front)
// (ADR-254) `beam` / `beamSplash` / `eyes` draw his own eye beams and their charge under `?halEyes=a|b`
// (fxEyes.js); '0' Tian Lei's beam in his crimson.

/** ?glare=: the palette the void slot takes. a crimson with a white-hot steel core (the beam body draws a
 *  steel core over it), b crimson alone, c the engine's orange fire. */
export const GLARE_PALETTES = {
  a: FIRE_PALETTES.glare,
  b: FIRE_PALETTES.glareDeep,
  c: FIRE_PALETTES.fire,
};
const L_CRIMSON = [1.0, 0.16, 0.08], L_ORANGE = [1.0, 0.5, 0.18];
const RED = [3.2, 0.3, 0.16], RED_END = [1.0, 0.05, 0.03];
const DEBRIS = [0.4, 0.38, 0.36], DEBRIS_END = [0.12, 0.11, 0.1];
const GLASS = [0.6, 0.72, 0.9], GLASS_END = [0.15, 0.2, 0.3];
const TAU = Math.PI * 2;

export class HalFx extends AscFx {
  constructor(d) {
    super(d);
    this.glareLook = halLook('glare');
    const pal = GLARE_PALETTES[this.glareLook] ?? GLARE_PALETTES.a;
    if (pal) this.game.fx?.fire?.setPalette?.('void', pal);
    this._markAcc = 0;
  }

  /** A light kept while asked for: his heat's colour, not Tian Lei's gold. */
  _keep(key, x, y, z, color, intensity, radius, flicker = 0) {
    return super._keep(key, x, y, z, this.glareLook === 'c' ? L_ORANGE : L_CRIMSON, intensity, radius, flicker);
  }
  _light(o) {
    if (o) o.color = this.glareLook === 'c' ? L_ORANGE : L_CRIMSON;
    return super._light(o);
  }

  // ---------------------------------------------------------------- the redrawn options (ADR-254)
  /** A beam (glare.js): under `?halEyes=a|b` his eyes' own (fxEyes.js); '0' Tian Lei's, in his crimson. */
  beam(ax, ay, az, bx, by, bz, w, k, dt, form = 1) {
    const L = eyesLook();
    if (L === '0' || !this.fire || !Number.isFinite(ax + ay + az + bx + by + bz + w + k) || !(k > 0.01)) return super.beam(ax, ay, az, bx, by, bz, w, k, dt, form);
    eyeBeam(this, L, ax, ay, az, bx, by, bz, Math.max(0.4, w), Math.min(1, k), Math.max(0, dt || 0));
  }
  /** Its end: drawn by the beam's own foot under a / b. */
  beamSplash(x, y, z, k, dt, form = 1) {
    if (eyesLook() === '0') super.beamSplash(x, y, z, k, dt, form);
  }
  /** A shockwave (Applause, Meteor's landing): true when an option drew it (`?halShock=a|b`, fxShock.js). */
  shockwave(x, z, r, y, land = false) {
    return shockwave(this, x, z, r, y, land);
  }
  update(dt, d) {
    super.update(dt, d);
    shockUpdate(this, dt);
  }
  reset() {
    super.reset();
    shockReset(this);
  }

  /** His eyes this frame: two crimson points (steel hearts as k rises). */
  eyes(x, y, z, k, rx = 1, rz = 0) {
    if (!this.fire || !Number.isFinite(x + y + z + k) || !(k > 0.02)) return;
    // (the redrawn beams: the eyes' axis for the two threads, the charge through a windup)
    const L = eyesLook();
    if (L !== '0') {
      eyesAxis(this, rx, rz);
      if (this.d?.glare && !this.d.glare.busy && this.d.mode === 'act') eyeCharge(this, L, x, y, z, k, Math.max(0, this.game.fxDt ?? this.game.dt ?? 0.016));
    }
    const life = this._frame();
    if (!(life > 0)) return;
    for (const s of [-1, 1]) {
      const ex = x + rx * 0.045 * s, ez = z + rz * 0.045 * s;
      this._blob(ex, y, ez, 0, 0, 0, life, 0.12 + 0.12 * k, 0.12 + 0.12 * k, 0.45 + 0.6 * k, 0.45 + 0.6 * k, K_VOID);
      if (k > 0.4) this._blob(ex, y, ez, 0, 0, 0, life, 0.07 + 0.05 * k, 0.07 + 0.05 * k, 0.5 + 0.8 * (k - 0.4), 0.5, K_STEEL);
    }
    if (k > 0.3) this._keep('eyes', x, y, z, L_CRIMSON, 0.4 + 1.6 * k, 2 + 3 * k, 0.2);
  }

  /** A figure of steel left where he was (DuelFx.ghost), drifting the way he went. */
  afterimage(d, dx = 0, dz = 0, life = 0.4) {
    if (!d) return 0;
    return this.ghost(d, this._ghostOpt(dx, dz, life, 0, 0, 0, 0, 0, 0));
  }

  /** The windows on a tower's face, lit along his line (Through the Tower's tell). */
  towerFlare(x, y0, z, ux, uz, w, h, k) {
    if (!this.fire || !Number.isFinite(x + y0 + z + k) || !(k > 0.02)) return;
    const life = this._frame();
    if (!(life > 0)) return;
    const cols = 3, rows = 5;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if ((i + j * 2) % 3 === 1 && k < 0.7) continue;
        const u = ((i + 0.5) / cols - 0.5) * w, v = y0 + ((j + 0.5) / rows) * h;
        this._blob(x + ux * u, v, z + uz * u, 0, 0, 0, life, 0.5, 0.5, 0.3 + 0.7 * k * (0.6 + 0.4 * Math.sin(j * 1.7 + this._now() * 14)), 0, K_STEEL);
      }
    }
  }

  /** The Falling Sky's mark: a dark disc on the ground with a red rim, u 0..1 through the windup. */
  skyMark(x, z, r, u) {
    if (!this.fire || !Number.isFinite(x + z + r + u)) return;
    const life = this._frame();
    if (!(life > 0)) return;
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this._now() * 0.6;
      this._blob(x + Math.cos(a) * r, 0.35, z + Math.sin(a) * r, 0, 0, 0, life, 0.6, 0.6, 0.35 + 0.45 * u, 0, K_VOID);
    }
    for (let i = 0; i < 9; i++) {
      const rr = r * Math.sqrt((i + 0.5) / 9) * 0.85, a = i * 2.39996;
      this._blob(x + Math.cos(a) * rr, 0.3, z + Math.sin(a) * rr, 0, 0, 0, life, r * 0.6, r * 0.6, 0.35 + 0.35 * u, 0, K_SMOKE);
    }
  }

  /** Scorched Avenue's line marked on the road: red strokes a → b, k 0..1. */
  avenueMark(ax, az, bx, bz, k) {
    const A = this.add;
    if (!A || !Number.isFinite(ax + az + bx + bz + k)) return;
    this._markAcc += 1;
    if (this._markAcc % 4) return;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, rot = Math.atan2(-dz * 0.848, dx);
    for (let s = 0.5; s < L; s += 0.9) {
      for (const side of [-1, 1]) {
        const o = this._rec(ax + (dx * s) / L - (dz / L) * side * 0.9, 0.42, az + (dz * s) / L + (dx / L) * side * 0.9, 0.12, 0.55, 0.55, '-', RED, RED_END);
        o.rot = rot;
        o.alpha = 0.5 + 0.5 * k;
        this._spawn(A, o);
      }
    }
  }

  /** His body through a storefront: debris and glass thrown on along his line, dust, a ring of air. */
  crashBurst(x, y, z, dx, dz, k = 1) {
    if (!Number.isFinite(x + y + z + dx + dz)) return;
    this.crater(x, z, 1.6 * k, 1.1 * k);
    for (let i = 0; i < Math.round(26 * k); i++) {
      const a = Math.atan2(dz, dx) + this.lrand(-1.1, 1.1), sp = this.lrand(3, 10);
      const glass = i % 3 === 0;
      const o = this._rec(x, y + this.lrand(-0.3, 0.5), z, this.lrand(0.4, 0.9), this.lrand(0.12, 0.2), 0.06, glass ? "/\\'`" : '#%&.,', glass ? GLASS : DEBRIS, glass ? GLASS_END : DEBRIS_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(1, 6);
      o.vz = Math.sin(a) * sp;
      o.drag = 1.4;
      o.gravity = -12;
      o.spin = this.lrand(-6, 6);
      this._spawn(this.alpha, o);
    }
    this.dust(x, z, 1.3 * k);
  }

  /** The sonic crack of a pass leaving: a ring of air at his back, strokes along his line. */
  sonic(x, y, z, dx, dz) {
    if (!this.fire || !Number.isFinite(x + y + z + dx + dz)) return;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, ca = Math.cos(a) * 0.9, sa = Math.sin(a) * 0.9;
      this._blob(x - dz * ca, y + sa, z + dx * ca, -dx * 2 - dz * ca * 3, sa * 3, -dz * 2 + dx * ca * 3, 0.22, 0.42, 0.2, 0.55, 0, K_STEEL, 3);
    }
    for (let i = 0; i < 3; i++) this._ink(x - dx * 0.5, y - 0.3 + i * 0.3, z - dz * 0.5, x - dx * 4, y - 0.3 + i * 0.3, z - dz * 4, 0.2, 0.6, 0, 0.2);
  }

  /** Fire left where a beam crossed a car or a sign (the blobs fall in the engine's own fire). */
  scorch(x, z) {
    if (!this.fire) return;
    for (let i = 0; i < 4; i++) this._blob(x + this.lrand(-0.3, 0.3), 0.5, z + this.lrand(-0.3, 0.3), 0, this.lrand(0.6, 1.4), 0, this.lrand(0.25, 0.45), 0.5, 0.2, 0.6, 0, K_FIRE, 1, -0.5);
  }
}
