import { AscFx } from '../ascendant/fx.js';
import { K_SMOKE, K_VOID, K_STEEL, GROUND_Y } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { drawGaze, drawEyesCharge, eyes } from './fxGaze.js';

// Qian Yao's effects (ADR-133; STYLE.md "Qian Yao"): Tian Lei's AscFx (gold in the void slot of the
// fire field, his beam body, the shock rings, the crater, the kept lights) with what only he does:
//   gaze / eyesCharge / gazeFlash   his eyes (fxGaze.js)
//   lineMark                        Gaze from on High's line marked on the floor: red strokes (glyph
//                                   specks: a warning is not heat)
//   boreBeam                        the beam bored straight up into the rock (He Opens the Sky)
//   glance                          a cut on a radiant body: gold and steel sparks, a dull ring
//   eclipse                         his light put out: a ring of steel sparks round him
//   radiance                        option ?radiant=a: gold motes rising off the blazing body
//   stones (callStrike style 'stone')  the rock falling out of a bored well onto its ring
// Every drawing method runs on the drawing stream (LordFx's `_drawing`), never the stream game code
// reads (Math.random): a look option can never move where a stone falls.

const DRAW = ['gaze', 'eyesCharge', 'gazeFlash', 'lineMark', 'boreBeam', 'glance', 'eclipse', 'radiance', 'drinkWake', 'awakenRing'];
const GOLD = [3.2, 2.4, 0.8], GOLD_END = [0.6, 0.3, 0.04], WHITE = [3.4, 3.3, 3.0], STEEL = [2.6, 2.6, 2.8], STEEL_END = [0.4, 0.4, 0.5];
const RED = [2.6, 0.16, 0.1], RED_END = [0.6, 0.03, 0.02];
const ROCK = [0.42, 0.39, 0.35], ROCK_END = [0.16, 0.15, 0.13];
const TAU = Math.PI * 2;

/** The look options his effects read (duelist/lookSwitch.js; the owner picks from the sheets). */
export const FALLEN_FX_LOOKS = Object.freeze({ gaze: 'a', radiant: 'a', pool: 'a' });

export class FallenFx extends AscFx {
  constructor(d) {
    super(d);
    this._eyes = {};
    this._radAcc = 0;
    this._wakeAcc = 0;
    for (const n of DRAW) {
      const f = this[n];
      if (typeof f !== 'function') continue;
      this[n] = function (a, b, c, d2, e, f2, g, h, i, j, k, l) {
        this._drawing++;
        try {
          return f.call(this, a, b, c, d2, e, f2, g, h, i, j, k, l);
        } finally {
          this._drawing--;
        }
      };
    }
  }

  /** ?gaze= (a | b | c). */
  gazeLook() {
    return lookOf('gaze', 'a', 'a');
  }

  /** The look switches his inherited draws read: the beam body's style comes from ?gaze= (b: the
   *  braid), the called strikes always draw their newer path (his stones override it). */
  look(name) {
    if (name === 'ascBeam') return this.gazeLook() === 'b' ? 'b' : 'a';
    if (name === 'sky' || name === 'star') return 'a';
    if (name === 'ascAura') return 'a';
    return super.look(name);
  }

  // ---------------------------------------------------------------- his eyes
  gaze(ax, ay, az, bx, by, bz, w, k, dt, kind) {
    if (kind === 'return') {
      // the gaze sent back along the blade into his eyes: one bright stroke, once
      this._ink(ax, ay, az, bx, by, bz, 0.12, 1.3, 0, 0.9, 0, K_STEEL);
      this._ink(ax, ay, az, bx, by, bz, 0.16, 0.8, 0, 0.5, 0, K_VOID);
      return;
    }
    drawGaze(this, this.d, ax, ay, az, bx, by, bz, w, k, dt, kind);
  }

  eyesCharge(d, u, dt, fixed = false, up = false) {
    drawEyesCharge(this, d, u, dt, fixed, up);
  }

  /** The beam lights: a flash at his eyes. */
  gazeFlash(x, y, z) {
    if (!this.fire || !Number.isFinite(x + y + z)) return;
    const A = this._axes(), P = this._toCamera(x, y, z);
    for (let i = 0; i < 10; i++) {
      const a = i * 2.39996, rr = 0.3 * Math.sqrt((i + 0.5) / 10), ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      this._blob(P.x + A.rx * ox + A.ux * oy, P.y + A.ry * ox + A.uy * oy, P.z + A.rz * ox + A.uz * oy, 0, 0, 0, 0.12, 0.3, 0.5, 0.7, 0, K_VOID, 2);
    }
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.1, 0.24, 0.36, 1.0, 0, K_STEEL);
    super._light({ x, y, z, color: [1.0, 0.88, 0.6], intensity: 2.2, radius: 5, life: 0.14, fade: 0.12 });
  }

  /** Gaze from on High's line on the floor: red strokes along it (glyph specks), from the lock until
   *  the foot has run it. */
  lineMark(x0, z0, ux, uz, len, life) {
    const add = this.add;
    if (!add || !Number.isFinite(x0 + z0 + ux + uz + len)) return;
    const rot = this._screenRot?.(ux, 0, uz) ?? 0;
    for (let s = 0; s <= len; s += 0.42) {
      const side = (s / 0.42) & 1 ? 0.32 : -0.32;
      for (const off of [side, 0]) {
        this._spawn(add, {
          x: x0 + ux * s - uz * off, y: 0.09, z: z0 + uz * s + ux * off, vx: 0, vy: 0, vz: 0, life: life * this.lrand(0.95, 1.05), size: 0.28, sizeEnd: 0.24,
          glyph: off === 0 ? '-' : '.', color: RED, colorEnd: RED_END, alpha: 1, alphaEnd: 0.6, rot: rot + Math.PI / 2, flicker: 0.25,
        });
      }
    }
  }

  /** The beam bored straight up into the rock over (x, z): a column of gold heat, the breach's dust
   *  falling back down through it. */
  boreBeam(x, z) {
    if (!this.fire || !Number.isFinite(x + z)) return;
    for (let i = 0; i < 26; i++) {
      const y = 2 + (i / 26) * 13;
      this._blob(x + this.lrand(-0.12, 0.12), y, z + this.lrand(-0.12, 0.12), 0, this.lrand(4, 8), 0, this.lrand(0.25, 0.4), 0.5, 0.25, 0.5, 0, K_VOID, 1);
    }
    for (let i = 0; i < 18; i++) {
      const a = this.lr() * TAU, r = this.lrand(0.2, 2.2);
      this._spawn(this.alpha, {
        x: x + Math.cos(a) * r, y: this.lrand(5, 9), z: z + Math.sin(a) * r, vx: 0, vy: -this.lrand(3, 6), vz: 0, life: this.lrand(1, 1.6), size: 0.16, sizeEnd: 0.08,
        glyph: ",.`'", color: ROCK, colorEnd: ROCK_END, alpha: 0.9, alphaEnd: 0, drag: 0.3,
      });
    }
    super._light({ x, y: 4, z, color: [1.0, 0.85, 0.5], intensity: 4, radius: 8, life: 0.4, fade: 0.3 });
    this.game.shake?.(0.2);
  }

  /** A cut on a radiant body glances: gold and steel sparks thrown off it, no blood-ash. */
  glance(x, y, z, dx = 0, dz = 0) {
    if (!Number.isFinite(x + y + z)) return;
    this.clash?.(x, y, z, false);
    for (let i = 0; i < 10; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2, 5);
      const r = this._rec(x, y, z, this.lrand(0.18, 0.34), this.lrand(0.12, 0.18), 0.03, "'+.", this.lr() < 0.5 ? GOLD : STEEL, this.lr() < 0.5 ? GOLD_END : STEEL_END);
      r.vx = Math.cos(a) * sp - dx * 2;
      r.vy = this.lrand(0.5, 3.5);
      r.vz = Math.sin(a) * sp - dz * 2;
      r.drag = 3;
      r.gravity = -6;
      this._spawn(this.add, r);
    }
    if (this.fire) this._blob(x, y, z, 0, 0, 0, 0.1, 0.3, 0.5, 0.6, 0, K_VOID);
  }

  /** His light put out (an eclipse, or a lid shut on him): a ring of steel sparks round his chest,
   *  the gold torn off him as smoke. */
  eclipse(d, starve = false) {
    const c = this._chest(d), s = d.drawScale || 1, y = d.position.y + (c.y - d.position.y) * s;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + this.lrand(-0.1, 0.1), sp = this.lrand(3.5, 6);
      const r = this._rec(c.x + Math.cos(a) * 0.4, y, c.z + Math.sin(a) * 0.4, this.lrand(0.25, 0.4), 0.16, 0.04, "-+'", STEEL, STEEL_END);
      r.vx = Math.cos(a) * sp;
      r.vy = this.lrand(-0.5, 1.5);
      r.vz = Math.sin(a) * sp;
      r.drag = 4;
      this._spawn(this.add, r);
    }
    if (this.fire) {
      for (let i = 0; i < 14; i++) {
        const a = this.lr() * TAU;
        this._blob(c.x + Math.cos(a) * 0.5, y + this.lrand(-0.6, 0.6), c.z + Math.sin(a) * 0.5, Math.cos(a) * 1.2, this.lrand(0.4, 1.4), Math.sin(a) * 1.2, this.lrand(0.5, 0.9), 0.5, 1.1, 0.35, 0, K_SMOKE, 1);
      }
      this._shock(c.x, y, c.z, starve ? 2.6 : 1.8, 24, 0.3, 0.3, 0.3, 0.7, K_STEEL, 0.4, 1.5);
    }
    this.game.shake?.(starve ? 0.3 : 0.18);
  }

  /** ?radiant=a: while the sun is in him, gold motes rise off his body (one-letter glyphs), a soft
   *  light on him. `k` 0..1 his light. */
  radiance(d, k, dt) {
    if (!(k > 0.02) || !(dt > 0) || !d?.position) return;
    const s = d.drawScale || 1;
    this._radAcc += dt * 14 * k;
    while (this._radAcc >= 1) {
      this._radAcc -= 1;
      const a = this.lr() * TAU, r = this.lrand(0.15, 0.45) * s, y = d.position.y + this.lrand(0.3, 1.9) * s;
      this._spawn(this.add, {
        x: d.position.x + Math.cos(a) * r, y, z: d.position.z + Math.sin(a) * r, vx: Math.cos(a) * 0.2, vy: this.lrand(0.5, 1.2), vz: Math.sin(a) * 0.2,
        life: this.lrand(0.5, 0.9), size: 0.12, sizeEnd: 0.05, glyph: ".'", color: this.lr() < 0.3 ? WHITE : GOLD, colorEnd: GOLD_END, alpha: 0.9, alphaEnd: 0, drag: 0.6,
      });
    }
    this._keep?.('radiance', d.position.x, d.position.y + 1.6 * s, d.position.z, [1.0, 0.86, 0.55], 1.4 * k, 4.5, 0.05);
  }

  /** Flying low to a pool: a wake of gold streaks and dust behind him. */
  drinkWake(d, dt) {
    if (!(dt > 0) || !d?.position) return;
    this._wakeAcc += dt * 40;
    while (this._wakeAcc >= 1) {
      this._wakeAcc -= 1;
      this._spawn(this.alpha, {
        x: d.position.x + this.lrand(-0.4, 0.4), y: 0.15, z: d.position.z + this.lrand(-0.4, 0.4), vx: this.lrand(-0.6, 0.6), vy: this.lrand(0.4, 1.2), vz: this.lrand(-0.6, 0.6),
        life: this.lrand(0.4, 0.7), size: 0.17, sizeEnd: 0.08, glyph: ",.`'", color: [0.34, 0.31, 0.27], alpha: 0.8, alphaEnd: 0, drag: 2,
      });
    }
  }

  /** A transition's ring, marked on the floor where he will come down (awaken3): this frame. */
  awakenRing(x, z, r, k, dt) {
    this.warnRing?.(x, z, r, k, dt);
  }

  // ---------------------------------------------------------------- the stones of a bored well
  /** A stone on its way down onto its ring (LordFx.updateStrikes draws a mark with this). */
  _drawMarkA(s, k, dt, alt) {
    if (s.style !== 'stone') return super._drawMarkA(s, k, dt, alt);
    // the rock: a knot of '#' glyphs falling (out of frame at first), dust trailing off it
    const y = 0.6 + 13 * (1 - k * k);
    const life = 0.05;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, rr = i ? 0.35 : 0;
      this._spawn(this.alpha, { x: s.x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.6, z: s.z + Math.sin(a) * rr, life, size: 0.42, sizeEnd: 0.42, glyph: i ? '%' : '#', color: [0.5, 0.47, 0.42], alpha: 1, alphaEnd: 1 });
    }
    if (dt > 0 && this.lr() < dt * 20) {
      this._spawn(this.alpha, { x: s.x + this.lrand(-0.3, 0.3), y: y + 0.4, z: s.z + this.lrand(-0.3, 0.3), vx: 0, vy: 1, vz: 0, life: 0.5, size: 0.14, sizeEnd: 0.06, glyph: ",.'", color: ROCK, colorEnd: ROCK_END, alpha: 0.8, alphaEnd: 0 });
    }
  }

  /** The stone lands: rubble thrown out, dust, the floor broken under it (the world's impact is the
   *  strike's own: LordFx.updateStrikes). */
  _strikeA(s, alt) {
    if (s.style !== 'stone') return super._strikeA(s, alt);
    for (let i = 0; i < 16; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2, 6);
      this._spawn(this.alpha, { x: s.x, y: 0.4, z: s.z, vx: Math.cos(a) * sp, vy: this.lrand(2, 6), vz: Math.sin(a) * sp, life: this.lrand(0.5, 0.9), size: 0.22, sizeEnd: 0.12, glyph: "%#*+,.", color: ROCK, colorEnd: ROCK_END, alpha: 1, alphaEnd: 0, drag: 1.2, gravity: -14 });
    }
    if (this.fire) for (let i = 0; i < 10; i++) {
      const a = this.lr() * TAU;
      this._blob(s.x + Math.cos(a) * 0.6, 0.5, s.z + Math.sin(a) * 0.6, Math.cos(a) * 2, this.lrand(0.3, 1), Math.sin(a) * 2, this.lrand(0.6, 1.0), 0.6, 1.4, 0.4, 0, K_SMOKE, 1.5);
    }
    this.ringPulse?.(s.x, s.z, s.r);
  }

  /** Where his eyes are now (tests, the Lab): { lx, ly, lz, rx, ry, rz }. */
  eyePoints() {
    return eyes(this.d, this._eyes);
  }
}

export { GROUND_Y, K_VOID };
