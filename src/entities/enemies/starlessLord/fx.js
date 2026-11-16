import { TELL, RESULT } from '../../../combat/rules.js';
import { DuelFx, K_FIRE, K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { perPhase } from '../duelist/realise.js';
import { DUEL_WORLD } from '../duelist/worldTuning.js';

/** A thrown stone stopped by cover / a blast on the floor, as blows on the world (ADR-107). */
const SHOT_BLOW = Object.freeze({ kind: 'blunt', by: 'boss', y: 0.95 });
const BLAST_BLOW = Object.freeze({ kind: 'blast', by: 'boss' });

// The Starless Lord's FX, on top of the duelist's (tells, clashes, sparks, sweep trails). Void and
// steel, both printed by the fire field (render/fireField.js) in the wyrm's small digits:
//   - `void`: violet fire with a pale heart. What the Void does: the gathering in his hand, the
//     wreath of form 4, the wake of his glide and of a cut, the fire out of a rift, the Dark Star,
//     the rings and the pillar of an ignition, what an afterimage is made of.
//   - `steel`: thin lines that print as the strokes running along them ('-' '/' '|' '\'). What is
//     sharp: lightning (a jagged path of strokes, white-hot joints, forks, a violet afterglow of
//     void round it), the crescents' edges, the wall of the push, the talons of the Crushing Dark,
//     the taut line of the pull, the thrown blade.
// Small glyph particles (about one letter cell) stay for what flies on its own: embers of his red
// blades, sparks, chips of stone, motes. The blades themselves stay red light (strokes + a red light
// that follows the main blade) round a white-hot core of steel.
// Thrown things (the blade, the stones, the fissures) fly here: each cues itself `flashLead` before it
// reaches the hero (a glint on it + combat:flash), and one that could only cue too late fizzles on
// touch, as the wyrm's bullets and the Ash Crescent do (COMBAT.md → fairness).

const TAU = Math.PI * 2;
const RED = [3.4, 0.2, 0.12], RED_CORE = [3.9, 0.95, 0.7], RED_END = [0.5, 0.03, 0.02], RED_DIM = [1.5, 0.08, 0.1];
const VOID = [2.6, 0.5, 3.4], VOID_END = [0.35, 0.05, 0.6]; // the motes drawn in to a cast (glyphs)
const STONE = [0.5, 0.5, 0.58];
const DARK = [0.012, 0.0, 0.02]; // the Dark Star's heart: it drinks the light (the alpha pool)
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class LordFx extends DuelFx {
  constructor(d) {
    super(d);
    this.shots = Array.from({ length: 8 }, () => ({ alive: false }));
    this.strikes = Array.from({ length: 10 }, () => ({ alive: false }));
    this.crushes = Array.from({ length: 2 }, () => ({ alive: false }));
    this.glowAcc = 0;
    this.auraAcc = 0;
    this.castAcc = 0;
    this.wakeAcc = 0;
    this.pullAcc = 0;
    this.light = null; // the red light that follows the main blade
    this._pts = new Float32Array(3 * 48);
  }

  reset() {
    super.reset();
    for (const s of this.shots) s.alive = false;
    for (const s of this.strikes) s.alive = false;
    for (const s of this.crushes) s.alive = false;
    this.light?.kill?.();
    this.light = null;
  }

  update(dt, d) {
    super.update(dt, d);
    this.updateShots(dt, d);
    this.updateStrikes(dt, d);
    this.updateCrushes(dt, d);
  }

  /** The on-screen angle of a world direction (for glyph strokes laid along it). */
  _screenRot(dx, dy, dz) {
    const A = this._axes();
    const sx = dx * A.rx + dy * A.ry + dz * A.rz, sy = dx * A.ux + dy * A.uy + dz * A.uz;
    return sx * sx + sy * sy > 1e-10 ? Math.atan2(sy, sx) - Math.PI / 2 : 0;
  }

  /** A ring of `n` blobs round (x, z) at height y, this frame only. `lobes` > 0: that many hotter
   *  stretches turning with `spin` (rad), so a ring of one colour is seen to turn. */
  _ring(x, y, z, r, n, size, heat, kind, lobes = 0, spin = 0) {
    const life = this._frame();
    if (!(life > 0) || !(r > 0)) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, h = lobes > 0 ? heat * (0.55 + 0.75 * Math.max(0, Math.cos(lobes * (a - spin)))) : heat;
      this._blob(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, 0, 0, life, size, size, h, h, kind);
    }
  }

  /** A ring of blobs thrown outward from (x, z): it races to about `r` m in `life` s. */
  _shock(x, y, z, r, n, life, size, sizeEnd, heat, kind, r0 = 0.5, drag = 0.5) {
    const sp = Math.max(0, r - r0) / Math.max(0.05, life);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      this._blob(x + ca * r0, y, z + sa * r0, ca * sp, 0, sa * sp, life, size, sizeEnd, heat, 0, kind, drag);
    }
  }

  // ---------------------------------------------------------------- the blades of red light
  /** One blade's glow this frame (hilt a → tip b, `k` 0..1 how far it is lit, `hot` > 1 in form 4):
   *  a row of small red strokes along it, re-drawn every frame (his weapon, not a spell: it stays
   *  red light, as the red light that follows it). */
  bladeGlow(a, b, k = 1, hot = 1) {
    const add = this.add;
    if (!add || !(k > 0.02) || !Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z)) return;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz) * k;
    if (!(len > 0.05)) return;
    const life = Math.max(0.02, (this.game.fxDt ?? this.game.dt ?? 0.016) * 1.6);
    const rot = this._screenRot(dx, dy, dz);
    const n = Math.max(3, Math.round(len / 0.16));
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * k;
      const o = this._rec(a.x + dx * u, a.y + dy * u, a.z + dz * u, life, 0.26 * hot, 0.26 * hot, '|', RED, null);
      o.rot = rot;
      o.stretch = 0.5;
      o.alpha = 0.8;
      o.alphaEnd = 0.8;
      add.spawn(o);
    }
  }

  /** The red light on the main blade (one pooled light, moved every frame; `k` 0 = dark). */
  bladeLight(a, b, k, hot = 1) {
    if (!Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z)) return;
    if (!this.light || this.light.dead) {
      if (!(k > 0.02)) return;
      this.light = this._light({ x: a.x, y: a.y, z: a.z, color: [1.0, 0.12, 0.06], intensity: 0, radius: 6.5, flicker: 0.25 });
    }
    const L = this.light;
    if (!L) return;
    L.x = (a.x + b.x) * 0.5;
    L.y = Math.max(0.6, (a.y + b.y) * 0.5);
    L.z = (a.z + b.z) * 0.5;
    L.intensity = 2.3 * k * hot;
    L.radius = 6.5 + 2 * (hot - 1);
  }

  /** A blade ignites (or dies): the whole blade flashes white, red sparks are thrown off along it, a
   *  breath of the Void rises off it. */
  igniteBurst(a, b, k = 1) {
    if (!Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z)) return;
    this._ink(a.x, a.y, a.z, b.x, b.y, b.z, 0.16, 1.15);
    for (let i = 0; i < 6 * k; i++) {
      const u = this.rnd();
      this._blob(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u, this.rand(-0.4, 0.4), this.rand(0.4, 1.4), this.rand(-0.4, 0.4), this.rand(0.25, 0.45), 0.5, 0.25, 0.3, 0, K_VOID, 1, 1);
    }
    for (let i = 0; i < 14 * k; i++) {
      const u = this.rnd(), ang = this.rnd() * TAU, sp = this.rand(1.5, 5);
      this._spawn(this.add, {
        x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u,
        vx: Math.cos(ang) * sp, vy: this.rand(-0.5, 3), vz: Math.sin(ang) * sp,
        life: this.rand(0.2, 0.5), size: this.rand(0.12, 0.22), sizeEnd: 0.04, glyph: "+*'", color: RED_CORE, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 3, gravity: -4,
      });
    }
    this._light({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, color: [1, 0.2, 0.1], intensity: 5 * k, radius: 8, life: 0.3, fade: 0.25 });
  }

  /** Embers shed by a blade (always a few; more in form 4). */
  bladeEmbers(a, b, dt, k = 1) {
    this.glowAcc += dt * 14 * k;
    while (this.glowAcc >= 1) {
      this.glowAcc -= 1;
      const u = this.rnd();
      this._spawn(this.add, {
        x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u,
        vx: this.rand(-0.4, 0.4), vy: this.rand(0.3, 1.2), vz: this.rand(-0.4, 0.4),
        life: this.rand(0.3, 0.7), size: this.rand(0.08, 0.15), sizeEnd: 0.03, glyph: ".'", color: RED, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 0.8, flicker: 0.5,
      });
    }
  }

  /** Form 4: the Void wreathes him: violet fire rising BEHIND him (so it licks round his outline and
   *  never covers the figure), arcs crawling over the plate, and under his feet a slow wheel. */
  aura(x, y, z, dt, k = 1, fx = x, fz = z) {
    // (behind him as the camera sees him: the field's depth test hides what the body covers)
    const A = this._axes();
    const bx = A.ry * A.uz - A.rz * A.uy, by = A.rz * A.ux - A.rx * A.uz, bz = A.rx * A.uy - A.ry * A.ux; // toward the camera
    const ox = x - bx * 0.7, oy = y - by * 0.7, oz = z - bz * 0.7;
    this.auraAcc += dt * 46 * k;
    while (this.auraAcc >= 1) {
      this.auraAcc -= 1;
      // (spread across the screen and up his height, never toward the camera)
      const s = this.rand(-0.85, 0.85), h = this.rand(-1.0, 0.9);
      this._blob(ox + A.rx * s, oy + h, oz + A.rz * s, A.rx * s * 0.4, this.rand(0.7, 2.0), A.rz * s * 0.4, this.rand(0.5, 0.95), 0.75, 0.4, 0.6, 0.12, K_VOID, 1, 0.8);
      if (this.rnd() < 0.1) {
        const ex = x + this.rand(-0.7, 0.7), ey = y + this.rand(-0.9, 0.7), ez = z + this.rand(-0.7, 0.7);
        this.arc(x + this.rand(-0.2, 0.2), y + this.rand(-0.4, 0.4), z + this.rand(-0.2, 0.2), ex, ey, ez, 0.3);
      }
    }
    // the wheel on the floor: a ring of the Void, four hotter spokes of it turning slowly
    this._ring(fx, GROUND_Y, fz, 1.25, 28, 0.34, 0.34 * GROUND_GAIN * k, K_VOID, 4, (this.d.time ?? 0) * 0.7);
  }

  /** The wake of his glide: the Void torn off under him, left burning low on the floor behind. */
  glideWake(x, z, vx, vz, dt, k = 1) {
    const sp = Math.hypot(vx, vz);
    this.wakeAcc += dt * (16 + 4 * sp) * k;
    while (this.wakeAcc >= 1) {
      this.wakeAcc -= 1;
      const a = this.rnd() * TAU, r = this.rand(0, 0.4);
      this._blob(x + Math.cos(a) * r, this.rand(0.3, 0.5), z + Math.sin(a) * r, -vx * 0.2 + this.rand(-0.4, 0.4), this.rand(0, 0.5), -vz * 0.2 + this.rand(-0.4, 0.4), this.rand(0.3, 0.6), 0.55, 0.85, 0.85, 0, K_VOID, 2);
    }
  }

  // ---------------------------------------------------------------- Void lightning
  /** A small arc from a to b: a few jagged strokes (the Void crawling over him, a mark crackling).
   *  `w` 0.14 .. 0.3 = how bright; (`color` / `end`: the old glyph colours, unused: arcs are steel). */
  arc(ax, ay, az, bx, by, bz, w = 0.22, color = null, end = null, steps = 4) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz)) return;
    let px = ax, py = ay, pz = az;
    const j = 0.18 * Math.hypot(bx - ax, by - ay, bz - az), h = Math.min(1.15, 0.35 + 2.4 * w);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = i < steps ? 1 : 0;
      const x = ax + (bx - ax) * t + this.rand(-j, j) * e, y = ay + (by - ay) * t + this.rand(-j, j) * e, z = az + (bz - az) * t + this.rand(-j, j) * e;
      this._ink(px, py, pz, x, y, z, this.rand(0.06, 0.13), h, 0.2, h, i > 1 ? 1 : 0);
      px = x;
      py = y;
      pz = z;
    }
  }

  /**
   * A bolt from a to b, drawn in text: a jagged path of thin steel, so it prints as the strokes that
   * run along it ('-' '/' '|' '\'), each joint white-hot (a digit); forks that die in the air; round
   * it a sheath of the Void that lingers and tears for a third of a second after the core is gone
   * (the afterglow). `k` = size (0.6 a small arc along the floor, 1.1 the bolt from his hand, 2.4
   * lightning out of the sky); `lit`: its flash of light and its landing burst; `gold`: a bolt thrown
   * back by a perfect parry (its sheath is fire).
   */
  lightning(ax, ay, az, bx, by, bz, k = 1, lit = true, gold = false) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz + k)) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (!(len > 0.05)) return;
    const steps = Math.max(3, Math.min(40, Math.round(len / 0.55)));
    const big = k >= 0.8, kk = Math.min(k, 2.4), sheath = gold ? K_FIRE : K_VOID;
    const P = this._pts;
    // the path of the core: it wanders off the straight line and back (each joint keeps half of the
    // drift of the one before, so it runs in long leaning strokes, not a staircase), its ends true
    const j = 0.3 * Math.min(kk, 1.7) + 0.06;
    let ox = 0, oy = 0, oz = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, e = i > 0 && i < steps ? Math.min(1, Math.sin(Math.PI * t) * 2.2) : 0;
      ox = ox * 0.5 + this.rand(-j, j);
      oy = oy * 0.5 + this.rand(-j, j);
      oz = oz * 0.5 + this.rand(-j, j);
      P[i * 3] = ax + dx * t + ox * e;
      P[i * 3 + 1] = ay + dy * t + oy * e;
      P[i * 3 + 2] = az + dz * t + oz * e;
    }
    // the core, written on the grid one cell wide: every cell a bright stroke along the bolt (just
    // under the heat at which a cell prints a digit), every third joint a white-hot digit. It cools
    // in ~0.2 s to grey strokes. A bolt out of the sky is two cells wide.
    const heat = big ? 1.16 : 0.8, A = this._axes(), w2 = kk > 1.8 ? 0.14 : 0;
    for (let i = 1; i <= steps; i++) {
      const x0 = P[i * 3 - 3], y0 = P[i * 3 - 2], z0 = P[i * 3 - 1], x1 = P[i * 3], y1 = P[i * 3 + 1], z1 = P[i * 3 + 2];
      const life = this.rand(0.15, 0.23);
      this._ink(x0, y0, z0, x1, y1, z1, life, heat, 0.3, heat, i > 1 ? 1 : 0);
      if (i % 3 === 0 && i < steps) this._blob(x1, y1, z1, 0, 0, 0, 0.12, 0.3, 0.26, 0.9, 0, K_STEEL); // a joint burns white
      if (w2) this._ink(x0 + A.rx * w2, y0 + A.ry * w2, z0 + A.rz * w2, x1 + A.rx * w2, y1 + A.ry * w2, z1 + A.rz * w2, life, heat, 0.25, heat);
      if (!big) continue;
      // the sheath: violet letters round the core that outlive it and tear upward (the afterglow)
      const sz = 0.75 * Math.sqrt(kk);
      this._blob((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, this.rand(-0.3, 0.3), this.rand(0, 0.6), this.rand(-0.3, 0.3), this.rand(0.3, 0.5), sz, sz * 0.55, 0.45, 0, sheath, 1);
      this._blob(x1, y1, z1, this.rand(-0.3, 0.3), this.rand(0, 0.6), this.rand(-0.3, 0.3), this.rand(0.3, 0.5), sz, sz * 0.55, 0.45, 0, sheath, 1);
      if (this.rnd() < 0.34 && i < steps) {
        // a fork that dies in the air
        let fx = x1, fy = y1, fz = z1;
        const r = 0.6 * Math.min(kk, 1.6);
        for (let q = 0; q < 3; q++) {
          const nx = fx + this.rand(-r, r), ny = fy + this.rand(-r * 0.8, r), nz = fz + this.rand(-r, r);
          this._ink(fx, fy, fz, nx, ny, nz, this.rand(0.08, 0.15), 0.95 - 0.2 * q, 0.15, 0.85 - 0.2 * q);
          fx = nx;
          fy = ny;
          fz = nz;
        }
      }
    }
    if (lit) {
      this._light({ x: (ax + bx) / 2, y: Math.max(1, (ay + by) / 2), z: (az + bz) / 2, color: gold ? [1, 0.8, 0.4] : [0.7, 0.4, 1], intensity: 5.5 * k, radius: 9 + len * 0.3, life: 0.24, fade: 0.2 });
      // where it lands: a burst of short strokes, a breath of the sheath, a few sparks
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + this.rnd() * 0.3, ca = Math.cos(a), sa = Math.sin(a), sp = this.rand(5, 9) * Math.min(kk, 1.6);
        const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
        this._blob(bx + ux * 0.15, by + uy * 0.15, bz + uz * 0.15, ux * sp, uy * sp, uz * sp, this.rand(0.12, 0.2), 0.27, 0.2, 0.6, 0, K_STEEL, 6);
      }
      for (let i = 0; i < 4; i++) this._blob(bx + this.rand(-0.2, 0.2), Math.max(0.35, by) + this.rand(0, 0.3), bz + this.rand(-0.2, 0.2), this.rand(-1, 1), this.rand(0.5, 2), this.rand(-1, 1), this.rand(0.25, 0.4), 0.5 * Math.min(kk, 1.8), 0.3, 0.42, 0, sheath, 2, 1);
      for (let i = 0; i < 8; i++) {
        const a = this.rnd() * TAU, sp = this.rand(2, 7);
        this._spawn(this.add, { x: bx, y: by, z: bz, vx: Math.cos(a) * sp, vy: this.rand(0, 4.5), vz: Math.sin(a) * sp, life: this.rand(0.15, 0.4), size: 0.16, sizeEnd: 0.04, glyph: "+x*'", color: gold ? [4.2, 3.4, 1.6] : [3.6, 2.6, 4.4], colorEnd: gold ? [0.6, 0.3, 0.05] : VOID_END, alpha: 1, alphaEnd: 0, drag: 4 });
      }
      // where it meets the floor it runs out along it
      if (by < 0.8) for (let i = 0; i < 4; i++) {
        const a = this.rnd() * TAU, r = this.rand(0.8, 1.9) * Math.min(kk, 1.6);
        this.arc(bx, GROUND_Y, bz, bx + Math.cos(a) * r, GROUND_Y, bz + Math.sin(a) * r, 0.3, null, null, 3);
      }
    }
  }

  /** The Void gathering in his hand through a cast's windup (`k` 0..1): a ball of violet fire that
   *  swells, arcs snapping off it, motes drawn in to it, and past half-way an arc to the floor now
   *  and then. (`color`: the motes'.) */
  crackle(x, y, z, k, dt, color = VOID) {
    this.castAcc += dt * (14 + 34 * k);
    while (this.castAcc >= 1) {
      this.castAcc -= 1;
      const a = this.rnd() * TAU, e = this.rand(-1, 1), r = this.rand(0.2, 0.42 + 0.3 * k);
      this._ink(x, y, z, x + Math.cos(a) * r, y + e * r, z + Math.sin(a) * r, this.rand(0.05, 0.1), 1.0, 0.2, 0.6);
      // a mote drawn in from further out
      const R = this.rand(0.7, 1.3), b = this.rnd() * TAU, h = this.rand(-0.6, 0.6);
      const mx = x + Math.cos(b) * R, my = y + h, mz = z + Math.sin(b) * R, life = this.rand(0.16, 0.28);
      this._spawn(this.add, { x: mx, y: my, z: mz, vx: (x - mx) / life, vy: (y - my) / life, vz: (z - mz) / life, life, size: 0.12, sizeEnd: 0.04, glyph: ".'", color, colorEnd: VOID_END, alpha: 0.2, alphaEnd: 1 });
      if (k > 0.5 && this.rnd() < 0.1) this.arc(x, y, z, x + this.rand(-0.7, 0.7), 0.2, z + this.rand(-0.7, 0.7), 0.26, null, null, 5);
    }
    const P = this._toCamera(x, y, z);
    this._dot(P.x, P.y, P.z, 0.42 + 0.4 * k, 0.45 + 0.6 * k, K_VOID);
  }

  // ---------------------------------------------------------------- the push, the pull, crescents, the rift
  throwCrescent(x, z, dx, dz, o) {
    const c = super.throwCrescent(x, z, dx, dz, o);
    if (c) {
      c.style = o.style ?? 'crescent';
      c.speed = o.speed;
      c.radius = o.radius;
      c.half = o.half;
      c.life = o.life;
      c.seed = this.rnd() * 100;
      c.lx = c.lz = NaN; // (the rift: where its crack last reached)
    }
    return c;
  }

  /** The push leaves his palm: dashes of force thrown out in a fan before him, the floor swept. */
  pushBurst(x, y, z, dx, dz) {
    const base = Math.atan2(dz, dx);
    for (let i = -6; i <= 6; i++) {
      const a = base + (i / 6) * 1.15, ca = Math.cos(a), sa = Math.sin(a), yy = y + this.rand(-0.6, 0.4), sp = this.rand(9, 12);
      for (let q = 0; q < 3; q++) this._blob(x + ca * (0.5 + q * 0.14), yy, z + sa * (0.5 + q * 0.14), ca * (sp + q * 2.5), 0, sa * (sp + q * 2.5), this.rand(0.14, 0.24), 0.27, 0.22, 0.34, 0, K_STEEL, 2.5);
    }
    for (let i = 0; i < 7; i++) {
      const a = base + this.rand(-1, 1), sp = this.rand(3, 8);
      this._blob(x + Math.cos(a) * 0.6, 0.3, z + Math.sin(a) * 0.6, Math.cos(a) * sp, this.rand(0.2, 0.8), Math.sin(a) * sp, this.rand(0.4, 0.7), 0.5, 1.2, 0.7, 0, K_SMOKE, 2.4);
    }
    this._light({ x, y, z, color: [0.9, 0.75, 1], intensity: 4, radius: 8, life: 0.2, fade: 0.18 });
  }

  _drawCrescent(c) {
    const px = -c.dz, pz = c.dx;
    if (c.style === 'push') {
      // a wall of force: three bowed lines of pale strokes, one above the other, as tall as a man; a
      // fainter rank behind them; upright strokes shimmering through; the floor's dust torn along
      const half = c.half ?? 2.4, t = c.age ?? 0;
      this._bow(c, half, 0.7, 0.45, 0, 0.27, 0.7);
      this._bow(c, half, 0.7, 1.0, 0, 0.27, 0.85);
      this._bow(c, half, 0.7, 1.55, 0, 0.27, 0.7);
      this._bow(c, half * 0.85, 0.7, 0.72, 0, 0.27, 0.4, K_STEEL, 0.45);
      this._bow(c, half * 0.85, 0.7, 1.28, 0, 0.27, 0.4, K_STEEL, 0.45);
      for (let i = 0; i < 5; i++) {
        const u = Math.sin(t * 23 + i * 2.4 + (c.seed ?? 0)), bow = 0.7 * (1 - u * u);
        const x = c.x + px * u * half + c.dx * bow, z = c.z + pz * u * half + c.dz * bow;
        this._ink(x, 0.45, z, x, 1.55, z, 0, 0.5);
      }
      if (this.rnd() < 0.7) this._blob(c.x + this.rand(-half, half) * px - c.dx * 0.3, 0.3, c.z + this.rand(-half, half) * pz - c.dz * 0.3, c.dx * 3, this.rand(0.2, 0.8), c.dz * 3, this.rand(0.35, 0.6), 0.5, 1.1, 0.65, 0, K_SMOKE, 2);
      return;
    }
    if (c.style === 'rift') {
      // a fissure racing along the floor: a white-hot jagged head, the crack it leaves drawn in thin
      // strokes that cool behind it, the Void's fire bursting up out of the crack
      const t = c.age ?? 0, jag = Math.sin(t * 40 + (c.seed ?? 0)) * 0.22;
      const hx = c.x + px * jag, hz = c.z + pz * jag;
      if (Number.isFinite(c.lx + c.lz) && Math.hypot(hx - c.lx, hz - c.lz) < 3) this._ink(c.lx, 0.45, c.lz, hx, 0.45, hz, this.rand(0.5, 0.75), 1.15, 0, 1.15, 1);
      c.lx = hx;
      c.lz = hz;
      this._dot(hx, 0.45, hz, 0.3, 0.6, K_STEEL);
      for (let i = 0; i < 3; i++) {
        const b = this.rand(0, 1.3), w = this.rand(-0.12, 0.12);
        this._blob(c.x - c.dx * b + px * w, 0.35, c.z - c.dz * b + pz * w, 0, this.rand(2.5, 6) * (1 - b * 0.4), 0, this.rand(0.2, 0.36), 0.5, 0.24, 0.8, 0, K_VOID, 3);
      }
      if (this.rnd() < 0.5) this._spawn(this.alpha, { x: hx, y: 0.1, z: hz, vx: this.rand(-1.5, 1.5), vy: this.rand(1, 3.5), vz: this.rand(-1.5, 1.5), life: this.rand(0.3, 0.6), size: 0.16, sizeEnd: 0.05, glyph: "#,.'", color: STONE, alpha: 1, alphaEnd: 0, gravity: -9 });
      return;
    }
    // a crescent of light: a bowed edge of white strokes standing off the floor, the Void burning in
    // the hollow behind it and torn off in its wake, a red ember shed now and then
    this._bow(c, 1.0, 0.6, 0.6, 0.16, 0.28, 1.15);
    this._bow(c, 0.9, 0.55, 0.62, 0.12, 0.62, 0.62, K_VOID, 0.34, 0.2);
    for (let i = 0; i < 2; i++) {
      const u = this.rand(-0.85, 0.85), bow = 0.55 * (1 - u * u) - 0.55;
      this._blob(c.x + px * u + c.dx * bow, 0.6, c.z + pz * u + c.dz * bow, -c.dx * 1.5, this.rand(0.1, 0.7), -c.dz * 1.5, this.rand(0.2, 0.34), 0.55, 0.26, 0.42, 0, K_VOID, 1.5, 0.8);
    }
    if (this.rnd() < 0.6) this._spawn(this.add, { x: c.x + this.rand(-0.7, 0.7) * px, y: 0.3, z: c.z + this.rand(-0.7, 0.7) * pz, vx: -c.dx * 2, vy: this.rand(0.3, 1.2), vz: -c.dz * 2, life: this.rand(0.2, 0.5), size: 0.14, sizeEnd: 0.04, glyph: ".'", color: RED, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 2 });
  }

  _fizzle(c) {
    const col = c.style === 'push' ? [1.6, 1.4, 1.5] : RED;
    for (let i = 0; i < 8; i++) {
      const a = this.rnd() * TAU, sp = this.rand(1, 5);
      this._spawn(this.add, { x: c.x, y: 0.7, z: c.z, vx: Math.cos(a) * sp, vy: this.rand(0, 2.5), vz: Math.sin(a) * sp, life: this.rand(0.2, 0.5), size: 0.16, sizeEnd: 0.05, glyph: "'.*", color: col, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 3 });
    }
    // the edge breaks: its halves fly apart and go out; what was behind it goes up
    const px = -c.dz, pz = c.dx, half = c.style === 'push' ? Math.min(1.6, c.half ?? 1.6) : 0.9;
    for (let i = -5; i <= 5; i++) {
      if (!i) continue;
      const u = i / 5, sp = 3 * Math.sign(i) + u * 2;
      this._blob(c.x + px * u * half, 0.65, c.z + pz * u * half, px * sp, this.rand(0.5, 2.2), pz * sp, this.rand(0.12, 0.22), 0.27, 0.2, 0.55, 0, K_STEEL, 3);
    }
    if (c.style !== 'push') for (let i = 0; i < 4; i++) this._blob(c.x + this.rand(-0.4, 0.4), 0.6, c.z + this.rand(-0.4, 0.4), this.rand(-1, 1), this.rand(0.5, 2), this.rand(-1, 1), this.rand(0.2, 0.36), 0.5, 0.25, 0.36, 0, K_VOID, 2, 1);
  }

  /** The pull's windup: a taut line of strokes between his hand and the hero that brightens as it
   *  closes, and the Void drawn from him down a narrowing vortex into the hand. */
  pullStream(hx, hy, hz, px, py, pz, k, dt) {
    const dx = hx - px, dy = hy - py, dz = hz - pz, l = Math.hypot(dx, dy, dz) || 1;
    if (!Number.isFinite(l + k)) return;
    // two unit vectors across the line
    const ux = -dz / (Math.hypot(dx, dz) || 1), uz = dx / (Math.hypot(dx, dz) || 1);
    this.pullAcc += dt * (30 + 60 * k);
    const t = this.d.time ?? 0;
    while (this.pullAcc >= 1) {
      this.pullAcc -= 1;
      const u = this.rnd(), ang = u * 11 - t * 14 + (this.rnd() < 0.5 ? Math.PI : 0), r = (0.75 * (1 - u) + 0.1) * (0.5 + 0.5 * k);
      const x = px + dx * u + ux * Math.cos(ang) * r, y = py + dy * u + Math.sin(ang) * r, z = pz + dz * u + uz * Math.cos(ang) * r;
      const sp = 9 + 7 * k;
      this._blob(x, y, z, (dx / l) * sp, (dy / l) * sp, (dz / l) * sp, this.rand(0.12, 0.22), 0.46, 0.24, 0.5, 0, K_VOID);
    }
    this._ink(px, py, pz, hx, hy, hz, 0, (0.4 + 0.7 * k) * this.rand(0.85, 1.0));
  }

  // ---------------------------------------------------------------- the Crushing Dark
  /** The grip's windup round the hero (x, y, z = his chest; `k` 0..1): five talons closing in on him
   *  from above, thin strokes tipped with the Void, and a ring of it tightening on the floor.
   *  Re-drawn every frame. */
  gripClaw(x, y, z, k) {
    if (!this.fire || !Number.isFinite(x + y + z + k)) return;
    if (!(this._frame() > 0)) return;
    const t = this.d.time ?? 0;
    const R = 1.75 - 0.85 * k, h = 0.45 + 0.25 * k;
    for (let f = 0; f < 5; f++) {
      const a = (f / 5) * TAU + t * 1.4;
      let px = x + Math.cos(a) * R * 0.25, py = y + R * 1.05, pz = z + Math.sin(a) * R * 0.25;
      for (let i = 1; i <= 4; i++) {
        const u = i / 4, th = u * (1.25 + 0.5 * k); // how far down the sphere the talon has curled
        const nx = x + Math.cos(a) * R * Math.sin(th), ny = y + R * Math.cos(th) * 1.05, nz = z + Math.sin(a) * R * Math.sin(th);
        this._ink(px, py, pz, nx, ny, nz, 0, h, 0, h, i > 1 ? 1 : 0);
        this._line(px, py, pz, nx, ny, nz, 0, 0.46 - 0.06 * i, 0.3 + 0.2 * k, 0, K_VOID, 0.2);
        px = nx;
        py = ny;
        pz = nz;
      }
      this._dot(px, py, pz, 0.3, 0.3 + 0.5 * k, K_STEEL); // the point of the claw
    }
    this._ring(x, GROUND_Y, z, R * 0.95, 30, 0.36, (0.24 + 0.24 * k) * GROUND_GAIN, K_VOID, 5, -t * 2);
  }

  /** The hand closed on nothing: the talons snap shut and scatter. */
  gripSnap(x, y, z) {
    if (!Number.isFinite(x + y + z)) return;
    for (let i = 0; i < 16; i++) {
      const a = this.rnd() * TAU, e = this.rand(-0.3, 1), r = 0.9, life = this.rand(0.1, 0.2);
      const sx = x + Math.cos(a) * r, sy = y + e * r, sz = z + Math.sin(a) * r;
      this._blob(sx, sy, sz, ((x - sx) / life) * 0.8, ((y - sy) / life) * 0.8, ((z - sz) / life) * 0.8, life, 0.27, 0.2, 0.5, 0, K_STEEL);
    }
    for (let i = 0; i < 5; i++) this._blob(x + this.rand(-0.2, 0.2), y + this.rand(-0.2, 0.2), z + this.rand(-0.2, 0.2), this.rand(-1.5, 1.5), this.rand(0, 2), this.rand(-1.5, 1.5), this.rand(0.2, 0.35), 0.5, 0.25, 0.36, 0, K_VOID, 3, 1);
  }

  /** The hand closed on the hero: for `dur` s the Void presses him into the floor at (x, z). */
  gripCrush(x, z, dur = 0.55) {
    const c = this.crushes.find((p) => !p.alive) ?? this.crushes[0];
    Object.assign(c, { alive: true, x, z, t: 0, dur });
    this._light({ x, y: 1, z, color: [0.75, 0.3, 1], intensity: 5, radius: 7, life: dur, fade: 0.3 });
    return c;
  }

  updateCrushes(dt) {
    for (const c of this.crushes) {
      if (!c.alive) continue;
      c.t += dt;
      const k = clamp01(c.t / c.dur);
      // three rings of the Void closing on him, strokes driven down onto him from above
      for (let ring = 0; ring < 3; ring++) {
        const r = (1.5 - ring * 0.42) * (1 - 0.75 * k) + 0.16;
        this._ring(c.x, GROUND_Y + ring * 0.04, c.z, r, 18 - ring * 4, 0.32, 0.2 * GROUND_GAIN, K_VOID, 3, c.t * (5 + ring * 2) * (ring & 1 ? -1 : 1));
      }
      for (let i = 0; i < 2; i++) {
        const a = this.rnd() * TAU, r = this.rand(0, 0.7), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = this.rand(1.6, 2.6), vy = -this.rand(9, 14), life = this.rand(0.1, 0.18);
        for (let q = 0; q < 3; q++) this._blob(x, y + q * 0.14, z, 0, vy, 0, life, 0.25, 0.2, 0.42, 0, K_STEEL);
      }
      if (c.t >= c.dur) {
        c.alive = false;
        this._shock(c.x, 0.4, c.z, 2.2, 30, 0.3, 0.5, 0.85, 0.75, K_VOID, 0.3, 2);
        this.game.shake?.(0.3);
        this.game.world?.scorch?.burnCircle?.(c.x, c.z, 1.1, 0.3, 0.8);
        this.game.world?.impact?.(c.x, c.z, 1.1, DUEL_WORLD.crush, BLAST_BLOW);
      }
    }
  }

  // ---------------------------------------------------------------- thrown things: the blade, torn stone
  /**
   * Throw something. o: { kind 'glaive' | 'stone', x, y, z, dx, dz, speed, radius, life, tell, damage,
   * knockback, attack, delay (s it hangs in the air first), big, range, back (the glaive's return
   * speed), orbit: { r, a, w } (a stone turns round him at radius r from angle a at w rad/s while it hangs) }.
   */
  throwShot(o) {
    const s = this.shots.find((p) => !p.alive);
    if (!s) return null;
    const l = Math.hypot(o.dx, o.dz) || 1;
    Object.assign(s, {
      alive: true, kind: o.kind, x: o.x, y: o.y ?? 1, z: o.z, ox: o.x, oz: o.z, dx: o.dx / l, dz: o.dz / l, speed: o.speed, radius: o.radius ?? 0.8, life: o.life ?? 2.5,
      tell: o.tell ?? TELL.NORMAL, damage: o.damage ?? 14, kb: o.knockback ?? 1.2, attack: o.attack ?? 'thrown', age: 0, flashed: -1, done: false,
      wait: 0, delay: o.delay ?? 0, big: !!o.big, range: o.range ?? 12, back: o.back ?? o.speed, phase: o.delay > 0 ? 'hang' : 'fly', spin: this.rnd() * TAU, hx: o.x, hz: o.z, rise: o.rise ?? 1.8,
      orbit: o.orbit ?? null, pspin: NaN,
    });
    return s;
  }

  get shotsAlive() {
    return this.shots.some((s) => s.alive);
  }

  updateShots(dt, d) {
    const p = this.game.player, pp = p?.position, lead = perPhase(d.T.flashLead, d.phase);
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.age += dt;
      s.spin += dt * (s.kind === 'glaive' ? 26 : 5);
      if (s.phase === 'hang') {
        // torn from the floor: it rises, turning round him in the Void's grip, until its turn to fly
        const k = Math.min(1, s.age / Math.max(0.2, s.delay * 0.7));
        s.y = 0.2 + (s.rise - 0.2) * (1 - (1 - k) * (1 - k));
        if (s.orbit) {
          const a = s.orbit.a + s.orbit.w * s.age;
          s.x = d.position.x + Math.cos(a) * s.orbit.r;
          s.z = d.position.z + Math.sin(a) * s.orbit.r;
        }
        this._drawStone(s, true);
        if (s.age >= s.delay) {
          s.phase = 'fly';
          s.age = 0;
          // thrown at where the hero is now
          if (pp) {
            const dx = pp.x - s.x, dz = pp.z - s.z, l = Math.hypot(dx, dz) || 1;
            s.dx = dx / l;
            s.dz = dz / l;
          }
          s.ox = s.x;
          s.oz = s.z;
        }
        continue;
      }
      if (s.phase === 'back') {
        // the blade comes home to his hand (it hangs a moment where it turned: time for its cue)
        const hx = d._hilt.x - s.x, hz = d._hilt.z - s.z, l = Math.hypot(hx, hz);
        if (l < 1.1 || d.mode === 'dying' || d.mode === 'dead') {
          s.alive = false;
          d.onGlaiveBack?.();
          continue;
        }
        s.dx = hx / l;
        s.dz = hz / l;
        if (s.wait > 0) s.wait -= dt;
        else {
          s.x += s.dx * s.back * dt;
          s.z += s.dz * s.back * dt;
        }
      } else {
        s.x += s.dx * s.speed * dt;
        s.z += s.dz * s.speed * dt;
        if (s.kind === 'stone') s.y += (0.95 - s.y) * Math.min(1, dt * 6);
      }
      if (s.kind === 'glaive' && s.phase === 'fly' && (Math.hypot(s.x - s.ox, s.z - s.oz) >= s.range || Math.hypot(s.x, s.z) > d.bound + 6)) {
        s.phase = 'back';
        s.wait = 0.32;
        s.flashed = -1;
        s.done = false;
      }
      if (s.age > s.life + (s.kind === 'glaive' ? 3 : 0) || Math.hypot(s.x, s.z) > 60) {
        s.alive = false;
        if (s.kind === 'glaive') d.onGlaiveBack?.();
        continue;
      }
      // the world in its way (ADR-107): cover stops a torn stone; the great stone breaks through
      // it; the blade cuts through whatever it crosses, out and home
      const W = this.game.world?.destructibles;
      if (W?.stop) {
        const WT = d.T.world ?? DUEL_WORLD;
        const sp = s.phase === 'back' ? (s.wait > 0 ? 0 : s.back) : s.speed;
        const px = s.x - s.dx * sp * dt, pz = s.z - s.dz * sp * dt;
        if (s.kind === 'stone' && !s.big) {
          if (W.stop(px, pz, s.x, s.z, s.radius, WT.stone ?? DUEL_WORLD.stone, SHOT_BLOW)) {
            this._shatter(s);
            continue;
          }
        } else if (sp > 0) {
          // (one blow per pass per piece: a fresh id for each flight, and for the blade's way home)
          if (s.wsrc === undefined || s.age < s.wAge || s.wPhase !== s.phase) s.wsrc = W.swing();
          s.wAge = s.age;
          s.wPhase = s.phase;
          const o = (this._shotBlow ??= { kind: 'cut', by: 'boss', dx: 0, dz: 0, y: 0.95, src: -1 });
          o.kind = s.kind === 'stone' ? 'blunt' : 'cut';
          o.dx = s.dx;
          o.dz = s.dz;
          o.src = s.wsrc;
          W.sweep(px, pz, s.x, s.z, s.radius, s.kind === 'stone' ? WT.bigStone ?? DUEL_WORLD.bigStone : WT.glaive ?? DUEL_WORLD.glaive, o);
        }
      }
      if (s.kind === 'glaive') this._drawGlaive(s);
      else this._drawStone(s, false);
      if (!pp || s.done || p.alive === false) continue;
      const rx = pp.x - s.x, rz = pp.z - s.z;
      const along = rx * s.dx + rz * s.dz, across = Math.abs(-rx * s.dz + rz * s.dx);
      const reach = s.radius + (p.radius ?? 0.45), half = s.radius + 0.5;
      const speed = s.phase === 'back' ? s.back : s.speed;
      if (across < half && along > 0 && s.flashed < 0 && (along - reach) / speed + Math.max(0, s.wait ?? 0) <= lead) {
        s.flashed = s.age;
        d.emit('combat:flash', { source: 'dragon', attack: s.attack, tell: s.tell, x: s.x, y: s.y, z: s.z, hazard: true, bullet: true });
        this.hazardFlash(s.tell, s.x, s.y, s.z);
      }
      if (across < half && Math.abs(along) <= reach) {
        s.done = true;
        const cued = s.flashed >= 0 ? s.age - s.flashed : 0;
        if (s.flashed < 0 || cued < 0.2) {
          // announced too late (the hero ran into it point-blank): it only breaks
          if (s.kind === 'stone') this._shatter(s);
          continue;
        }
        const red = s.tell === TELL.RED;
        const r = d.hitPlayer({
          damage: s.damage, knockback: s.kb, knockdown: red, kind: 'thrown', tell: s.tell, attack: s.attack, from: { x: s.x - s.dx, z: s.z - s.dz },
          projectile: true, light: !red, parryPosture: s.kind === 'glaive' ? 14 : 8, extra: red ? { plunge: false } : null,
        });
        if (s.kind === 'stone') this._shatter(s);
        else if (r === RESULT.PARRIED && s.phase === 'fly') {
          // the blade struck aside: it turns for home at once
          s.phase = 'back';
          s.wait = 0;
          s.flashed = -1;
          s.done = true; // (its way home starts from the hero: no second pass through him)
        }
      }
    }
  }

  /** The thrown blade: a line of white strokes turning in the air, the arcs its two points leave
   *  behind them (a wheel of strokes), the Void at its hub, red embers shed. */
  _drawGlaive(s) {
    const c = Math.cos(s.spin), sn = Math.sin(s.spin), R = 0.95;
    this._ink(s.x - c * R * 0.86, s.y, s.z - sn * R * 0.86, s.x + c * R * 0.86, s.y, s.z + sn * R * 0.86, 0, 0.85);
    this._dot(s.x, s.y, s.z, 0.6, 0.34, K_VOID);
    // what the points leave: from where each was last frame to where it is
    const p0 = Number.isFinite(s.pspin) && Math.abs(s.spin - s.pspin) < 1.2 ? s.pspin : s.spin - 0.4;
    s.pspin = s.spin;
    for (let e = 0; e < 2; e++) {
      let lx = s.x + Math.cos(p0 + e * Math.PI) * R, lz = s.z + Math.sin(p0 + e * Math.PI) * R;
      for (let q = 1; q <= 3; q++) {
        const a = p0 + (s.spin - p0) * (q / 3) + e * Math.PI, x = s.x + Math.cos(a) * R, z = s.z + Math.sin(a) * R;
        this._ink(lx, s.y, lz, x, s.y, z, 0.13, 0.5, 0, 0.5, 1);
        lx = x;
        lz = z;
      }
    }
    if (this.rnd() < 0.6) this._spawn(this.add, { x: s.x + this.rand(-0.8, 0.8), y: s.y, z: s.z + this.rand(-0.8, 0.8), vx: -s.dx * 3, vy: this.rand(-0.5, 1), vz: -s.dz * 3, life: this.rand(0.2, 0.45), size: 0.13, sizeEnd: 0.03, glyph: ".'", color: RED_CORE, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 2 });
  }

  /** A torn stone: a clump of small grey letters in the Void's grip (violet fire round it). */
  _drawStone(s, hang) {
    const life = Math.max(0.02, (this.game.fxDt ?? this.game.dt ?? 0.016) * 1.6);
    const k = s.big ? 1.6 : 1, n = s.big ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = s.spin + (i / n) * TAU, r = i === 0 ? 0 : (i & 1 ? 0.2 : 0.11) * k, e = Math.sin(a * 1.7 + i) * 0.6;
      const o = this._rec(s.x + Math.cos(a) * r, s.y + e * r, s.z + Math.sin(a) * r, life, 0.24, 0.24, '#&%@8'[i % 5], s.big ? [0.75, 0.42, 0.5] : STONE, null);
      o.alphaEnd = 1;
      this._spawn(this.alpha, o);
    }
    // the Void's grip on it
    this._dot(s.x, s.y, s.z, s.big ? 1.25 : 0.85, s.big ? 0.62 : 0.4, K_VOID);
    if (hang) {
      if (this.rnd() < 0.5) this._spawn(this.alpha, { x: s.x + this.rand(-0.3, 0.3), y: s.y - 0.2, z: s.z + this.rand(-0.3, 0.3), vy: -this.rand(1, 3), life: this.rand(0.2, 0.5), size: 0.14, sizeEnd: 0.05, glyph: ".,'", color: [0.3, 0.3, 0.34], alpha: 0.9, alphaEnd: 0 });
      // a thread of the Void from his hand to the stone it holds
      const h = this.d._hand;
      if (h && this.rnd() < 0.3) this.arc(h.x, h.y, h.z, s.x, s.y, s.z, 0.14, null, null, 5);
    } else if (this.rnd() < 0.8) {
      this._blob(s.x - s.dx * 0.3, s.y, s.z - s.dz * 0.3, -s.dx * 2, this.rand(-0.2, 0.5), -s.dz * 2, this.rand(0.16, 0.3), 0.5 * k, 0.25, 0.34, 0, K_VOID, 1);
    }
  }

  /** A stone tears out of the floor (dust and chips where it left). */
  tearUp(x, z) {
    for (let i = 0; i < 8; i++) {
      const a = this.rnd() * TAU, sp = this.rand(1, 4);
      this._spawn(this.alpha, { x, y: 0.15, z, vx: Math.cos(a) * sp, vy: this.rand(1, 4), vz: Math.sin(a) * sp, life: this.rand(0.3, 0.7), size: 0.18, sizeEnd: 0.1, glyph: ",.`#", color: [0.26, 0.26, 0.3], alpha: 0.8, alphaEnd: 0, drag: 2.5, gravity: -6 });
    }
    for (let i = 0; i < 4; i++) {
      const a = this.rnd() * TAU, sp = this.rand(0.5, 1.8);
      this._blob(x, 0.3, z, Math.cos(a) * sp, this.rand(0.3, 1), Math.sin(a) * sp, this.rand(0.4, 0.7), 0.5, 1.0, 0.7, 0, K_SMOKE, 2.5);
    }
  }

  _shatter(s) {
    s.alive = false;
    for (let i = 0; i < (s.big ? 16 : 10); i++) {
      const a = this.rnd() * TAU, sp = this.rand(1.5, 6);
      this._spawn(this.alpha, { x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * sp + s.dx * 3, vy: this.rand(-1, 4), vz: Math.sin(a) * sp + s.dz * 3, life: this.rand(0.3, 0.7), size: this.rand(0.14, 0.24), sizeEnd: 0.05, glyph: "#%,.'", color: STONE, colorEnd: [0.15, 0.15, 0.18], alpha: 1, alphaEnd: 0, drag: 2, gravity: -9 });
    }
    for (let i = 0; i < (s.big ? 7 : 4); i++) {
      const a = this.rnd() * TAU, sp = this.rand(1, 3.5);
      this._blob(s.x, s.y, s.z, Math.cos(a) * sp + s.dx * 2, this.rand(0, 2), Math.sin(a) * sp + s.dz * 2, this.rand(0.2, 0.4), 0.5, 0.3, 0.4, 0, K_VOID, 2.5, 0.8);
    }
    this._blob(s.x, s.y, s.z, s.dx, 0.4, s.dz, 0.6, 0.6, 1.4, 0.7, 0, K_SMOKE, 1);
    this.game.shake?.(s.big ? 0.3 : 0.12);
  }

  // ---------------------------------------------------------------- marked ground: called lightning, the Dark Star
  /**
   * Mark the ground at (x, z): it is struck `warn` s from now. o: { damage, knockback, attack, style
   * ('bolt': lightning called down, the default; 'star': the Dark Star), drift (m/s the mark follows
   * the hero until its cue) }.
   */
  callStrike(x, z, r, warn, o = {}) {
    const s = this.strikes.find((p) => !p.alive);
    if (!s) return null;
    Object.assign(s, { alive: true, x, z, r, t: 0, at: warn, flashed: false, damage: o.damage ?? 26, kb: o.knockback ?? 3, attack: o.attack ?? 'storm', style: o.style ?? 'bolt', drift: o.drift ?? 0, acc: 0 });
    return s;
  }

  get strikesAlive() {
    return this.strikes.some((s) => s.alive);
  }

  updateStrikes(dt, d) {
    const p = this.game.player, lead = perPhase(d.T.flashLead, d.phase);
    for (const s of this.strikes) {
      if (!s.alive) continue;
      s.t += dt;
      const star = s.style === 'star';
      if (s.t < s.at) {
        const k = Math.min(1, s.t / s.at);
        if (star && s.drift > 0 && !s.flashed && p?.position && p.alive !== false) {
          // the star follows the hero until its cue (then it is where it will burst)
          const dx = p.position.x - s.x, dz = p.position.z - s.z, l = Math.hypot(dx, dz);
          if (l > 0.05) {
            const step = Math.min(l, s.drift * dt);
            s.x += (dx / l) * step;
            s.z += (dz / l) * step;
            d.clampTarget?.(s);
          }
        }
        this.warnRing(s.x, s.z, s.r, k, dt);
        if (star) this._drawStar(s, k, dt);
        else this._drawMark(s, k, dt);
        if (!s.flashed && s.t >= s.at - lead) {
          s.flashed = true;
          d.emit('combat:tell', { source: 'dragon', attack: s.attack, tell: TELL.RED, impactIn: lead, x: s.x, z: s.z, hazard: true });
          d.emit('combat:flash', { source: 'dragon', attack: s.attack, tell: TELL.RED, x: s.x, y: 0.6, z: s.z, hazard: true });
          this.ringPulse(s.x, s.z, s.r * 0.5);
        }
        continue;
      }
      s.alive = false;
      if (star) this._starBurst(s);
      else {
        this.lightning(s.x + this.rand(-2, 2), 26, s.z + this.rand(-1, 1), s.x, 0.1, s.z, 2.4, true);
        this.ringPulse(s.x, s.z, s.r);
      }
      this.game.world?.scorch?.burnCircle?.(s.x, s.z, s.r * 0.8, 0.3, 0.9);
      this.game.world?.impact?.(s.x, s.z, s.r, (d.T.world ?? DUEL_WORLD).strike ?? DUEL_WORLD.strike, BLAST_BLOW);
      this.game.shake?.(star ? 0.4 : 0.22);
      d.emit('dragon:explosion', { x: s.x, z: s.z, radius: s.r });
      const pp = p?.position;
      if (pp && p.alive !== false && Math.hypot(pp.x - s.x, pp.z - s.z) <= s.r + (p.radius ?? 0.45) * 0.5) {
        d.hitPlayer({ damage: s.damage, knockback: s.kb, knockdown: true, kind: star ? 'void' : 'lightning', tell: TELL.RED, parryable: false, blockable: false, attack: s.attack, from: { x: s.x, z: s.z }, extra: { plunge: false } });
      }
    }
  }

  /** A mark waiting for its lightning: arcs crackling up off the floor inside it, and high above it
   *  a wheel of the Void turning faster and drawing in, leaders reaching down as the strike nears. */
  _drawMark(s, k, dt) {
    if (this.rnd() < 0.35) this.arc(s.x + this.rand(-s.r, s.r) * 0.6, GROUND_Y, s.z + this.rand(-s.r, s.r) * 0.6, s.x + this.rand(-0.4, 0.4), this.rand(0.7, 1.7), s.z + this.rand(-0.4, 0.4), 0.26, null, null, 3);
    const H = 8.5;
    this._ring(s.x, H, s.z, 1.3 - 0.5 * k, 18, 0.42, 0.22 + 0.34 * k, K_VOID, 3, s.t * (2 + 6 * k));
    if (k > 0.45 && this.rnd() < 0.5) {
      const y0 = H - this.rand(0, 1), y1 = y0 - this.rand(1.2, 3.2) * k;
      this.arc(s.x + this.rand(-0.4, 0.4), y0, s.z + this.rand(-0.4, 0.4), s.x + this.rand(-0.6, 0.6), y1, s.z + this.rand(-0.6, 0.6), 0.3, null, null, 3);
    }
  }

  /** The Dark Star gathering over its ring: a heart that drinks the light inside a burning rim of
   *  the Void, short rays standing off it, the air spiralling in to it, arcs from it to the floor,
   *  and its reach on the floor in the Void's own colour. */
  _drawStar(s, k, dt) {
    const life = Math.max(0.02, (this.game.fxDt ?? dt) * 1.6), y = 1.3 + 0.1 * Math.sin(s.t * 5), R = 0.6 + 0.55 * k;
    for (let i = 0; i < 4; i++) {
      const o = this._rec(s.x + this.rand(-0.1, 0.1) * R, y + this.rand(-0.1, 0.1) * R, s.z + this.rand(-0.1, 0.1) * R, life, R * 1.6, R * 1.6, '@#8M'[i], DARK, null);
      o.alphaEnd = 1;
      o.rot = s.t * 3 + i;
      this._spawn(this.alpha, o);
    }
    // the rim: hotter stretches of it turn round the heart
    this._ring(s.x, y, s.z, R * 1.1, 24, 0.5, 0.5 + 0.4 * k, K_VOID, 2, s.t * (3 + 5 * k));
    // its corona: short rays standing off the rim, flickering
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU - s.t * 2.2 + Math.sin(s.t * 7 + i) * 0.2, c = Math.cos(a), sn = Math.sin(a), l = 0.3 + 0.35 * k + 0.12 * Math.sin(s.t * 13 + i * 2.1);
      this._ink(s.x + c * R * 1.15, y + sn * R * 0.35, s.z + sn * R * 1.15, s.x + c * (R + l), y + sn * (R + l) * 0.35, s.z + sn * (R + l), 0, 0.9, 0, 0.5);
    }
    s.acc += dt * (30 + 50 * k);
    while (s.acc >= 1) {
      s.acc -= 1;
      // drawn in along a spiral from the ring's edge
      const a = this.rnd() * TAU, r = s.r * this.rand(0.5, 1.05), h = this.rand(0.05, 2.4), lf = this.rand(0.3, 0.5);
      const sx = s.x + Math.cos(a) * r, sz = s.z + Math.sin(a) * r;
      this._spawn(this.add, {
        x: sx, y: h, z: sz, vx: ((s.x - sx) / lf) - Math.sin(a) * 3, vy: (y - h) / lf, vz: ((s.z - sz) / lf) + Math.cos(a) * 3,
        life: lf, size: 0.18, sizeEnd: 0.05, glyph: "-~'", rot: this._screenRot(-Math.sin(a), 0, Math.cos(a)) + Math.PI / 2, color: this.rnd() < 0.5 ? VOID : RED, colorEnd: VOID_END, alpha: 0.3, alphaEnd: 1, drag: 0.6,
      });
    }
    if (this.rnd() < 0.3 + 0.4 * k) {
      const a = this.rnd() * TAU, r = this.rand(0.4, 1) * s.r * 0.8;
      this.arc(s.x, y, s.z, s.x + Math.cos(a) * r, GROUND_Y, s.z + Math.sin(a) * r, 0.26, null, null, 5);
    }
  }

  /** The Dark Star bursts: the heart goes up in a ball of the Void (pale at its heart), a ring of it
   *  races out to its edge, bolts run out along the floor, the dark is thrown up. */
  _starBurst(s) {
    const y = 1.25;
    for (let i = 0; i < 14; i++) {
      const a = this.rnd() * TAU, sp = this.rand(0.5, 4);
      this._blob(s.x, y + this.rand(-0.3, 0.3), s.z, Math.cos(a) * sp, this.rand(0, 3), Math.sin(a) * sp, this.rand(0.28, 0.45), 0.8, 1.5, 0.5, 0, K_VOID, 2, 1);
    }
    this._shock(s.x, 0.5, s.z, s.r, 60, 0.26, 0.6, 1.0, 0.8, K_VOID, 0.5, 0.6);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + this.rnd(), r = s.r * this.rand(0.8, 1.05);
      this.lightning(s.x, y, s.z, s.x + Math.cos(a) * r, GROUND_Y, s.z + Math.sin(a) * r, 0.7, false);
    }
    for (let i = 0; i < 24; i++) {
      const a = this.rnd() * TAU, sp = this.rand(2, 10);
      this._spawn(this.alpha, { x: s.x, y, z: s.z, vx: Math.cos(a) * sp, vy: this.rand(1, 8), vz: Math.sin(a) * sp, life: this.rand(0.4, 0.9), size: this.rand(0.16, 0.26), sizeEnd: 0.05, glyph: "#@%*'", color: [0.05, 0.0, 0.09], alpha: 1, alphaEnd: 0, drag: 1.5, gravity: -7 });
    }
    this._light({ x: s.x, y: 1.4, z: s.z, color: [0.75, 0.45, 1], intensity: 9, radius: s.r * 3.4, life: 0.5, fade: 0.4 });
  }

  // ---------------------------------------------------------------- the blink, the ignition, the deathblow
  /** A shape left where he stood: his bones traced in the Void, letters that rise and go out.
   *  `segs` = [x0, y0, z0, x1, y1, z1] per bone (world), `n` of them. */
  afterimage(segs, n) {
    for (let i = 0; i < n; i++) {
      const k = i * 6, ax = segs[k], ay = segs[k + 1], az = segs[k + 2], dx = segs[k + 3] - ax, dy = segs[k + 4] - ay, dz = segs[k + 5] - az;
      const l = Math.hypot(dx, dy, dz);
      if (!(l > 1e-3) || !Number.isFinite(l + ax + ay + az)) continue;
      const m = Math.min(8, Math.max(1, Math.ceil(l / 0.16)));
      for (let q = 0; q <= m; q++) {
        const t = q / m;
        this._blob(ax + dx * t, ay + dy * t, az + dz * t, 0, 0.5, 0, this.rand(0.3, 0.5), 0.34, 0.2, 0.36, 0, K_VOID, 0, 0.5);
      }
    }
  }

  /** He is gone from (x0, z0) and at (x1, z1): a streak of the Void between with one bright line
   *  through it, an implosion where he stood, a ring thrown out where he is. */
  blinkTrail(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (!Number.isFinite(len)) return;
    const n = Math.min(40, Math.max(4, Math.round(len / 0.3)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      for (let h = 0; h < 3; h++) {
        this._blob(x0 + dx * u + this.rand(-0.15, 0.15), 0.5 + h * 0.6, z0 + dz * u + this.rand(-0.15, 0.15), 0, this.rand(0, 0.6), 0, this.rand(0.16, 0.3) + 0.12 * u, 0.5, 0.26, 0.26 + 0.3 * u, 0, K_VOID, 0, 0.6);
      }
    }
    this._ink(x0, 1.1, z0, x1, 1.1, z1, 0.16, 0.25, 0, 1.15);
    // where he stood: the air falls in
    for (let i = 0; i < 14; i++) {
      const a = this.rnd() * TAU, r = this.rand(0.8, 1.5), h = this.rand(0.2, 2.2), lf = this.rand(0.14, 0.26);
      this._spawn(this.add, { x: x0 + Math.cos(a) * r, y: h, z: z0 + Math.sin(a) * r, vx: -Math.cos(a) * r / lf, vy: (1.2 - h) / lf, vz: -Math.sin(a) * r / lf, life: lf, size: 0.18, sizeEnd: 0.05, glyph: "-'", color: RED_DIM, colorEnd: [0.1, 0, 0.03], alpha: 0.4, alphaEnd: 1 });
    }
    // where he is: thrown out
    this._shock(x1, 1.1, z1, 1.6, 18, 0.2, 0.42, 0.7, 0.55, K_VOID, 0.2, 4);
    this._light({ x: x1, y: 1.2, z: z1, color: [0.8, 0.25, 1], intensity: 3.5, radius: 6, life: 0.2, fade: 0.18 });
  }

  /** A form's ignition lands: a pillar of the Void through him round a core of white strokes, a
   *  ring of it racing out, bolts along the floor, red sparks thrown up. */
  igniteNova(x, z, r) {
    if (!Number.isFinite(x + z + r)) return;
    this._shock(x, 0.5, z, r, 64, 0.32, 0.7, 1.2, 0.8, K_VOID, 0.8, 0.5);
    // the pillar
    for (let i = 0; i < 30; i++) {
      const a = this.rnd() * TAU, rr = this.rand(0, 0.45), h = this.rand(0.2, 3);
      this._blob(x + Math.cos(a) * rr, h, z + Math.sin(a) * rr, 0, this.rand(8, 18), 0, this.rand(0.3, 0.6), 0.6, 0.3, 0.5, 0, K_VOID, 1);
    }
    this._ink(x, 0.3, z, x, 6, z, 0.26, 1.5, 0, 1.0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + this.rnd() * 0.5, rr = r * this.rand(0.55, 0.9);
      this.lightning(x, GROUND_Y, z, x + Math.cos(a) * rr, GROUND_Y, z + Math.sin(a) * rr, 0.6, false, false);
    }
    for (let i = 0; i < 22; i++) {
      const a = this.rnd() * TAU, sp = this.rand(2, 9);
      this._spawn(this.add, { x, y: 1, z, vx: Math.cos(a) * sp, vy: this.rand(2, 9), vz: Math.sin(a) * sp, life: this.rand(0.4, 0.9), size: this.rand(0.12, 0.22), sizeEnd: 0.04, glyph: "+*'", color: RED_CORE, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 1.5, gravity: -8 });
    }
    this._light({ x, y: 1.4, z, color: [0.8, 0.3, 1], intensity: 8, radius: r * 1.6, life: 0.55, fade: 0.45 });
  }

  /** The deathblow goes through him: the Void and red sparks burst out of his back. */
  deathblowBurst(x, y, z, dx, dz) {
    if (!Number.isFinite(x + y + z + dx + dz)) return;
    for (let i = 0; i < 12; i++) {
      const sp = this.rand(3, 9), a = Math.atan2(dz, dx) + this.rand(-0.5, 0.5);
      this._blob(x, y, z, Math.cos(a) * sp, this.rand(-0.5, 2.5), Math.sin(a) * sp, this.rand(0.25, 0.5), 0.5, 0.26, 0.42, 0, K_VOID, 3, 0.6);
    }
    for (let i = 0; i < 16; i++) {
      const sp = this.rand(3, 11), a = Math.atan2(dz, dx) + this.rand(-0.5, 0.5);
      this._spawn(this.add, { x, y, z, vx: Math.cos(a) * sp, vy: this.rand(-1, 3.5), vz: Math.sin(a) * sp, life: this.rand(0.25, 0.6), size: this.rand(0.12, 0.22), sizeEnd: 0.04, glyph: "*+'-", color: RED_CORE, colorEnd: RED_END, alpha: 1, alphaEnd: 0, drag: 3 });
    }
    this._light({ x, y, z, color: [1, 0.25, 0.15], intensity: 6, radius: 9, life: 0.35, fade: 0.3 });
  }
}
