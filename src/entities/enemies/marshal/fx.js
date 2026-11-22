import { TELL } from '../../../combat/rules.js';
import { perPhase } from '../duelist/realise.js';
import { DuelFx, K_FIRE, K_SMOKE, K_STEEL, GROUND_Y } from '../duelist/fx.js';
import { BLOW } from '../../../world/breakTuning.js';
import { FOUNDRY } from '../../../world/foundry.js';

// The Clockwork Marshal's effects (STYLE.md "The fire field"): everything that burns is HEAT in the fire
// field, printed in the wyrm's small letters; embers, sparks and grit are glyph particles about one letter
// in size. Nothing here is a big glowing sprite. What is redrawn every frame goes through DuelFx's _frame /
// _dot / _ink (one copy a frame). Look jitter comes from the look stream lr() (never Math.random or the
// gameplay stream rnd(), which other code reads). Cost: the furnace mouth ~10 blobs a frame, the muzzle's
// heat ~6 a frame through a windup, a bolt ~60 blobs once, a mortar's mark ~12 a frame.
//   muzzleHeat     the lance's fire tube heating through a windup (small cool blobs, > 0.7 m up)
//   lanceBolt      the bolt: a line of fire blobs round a crisp steel core, a burst where it ends
//   fireFan        Sweeping Fire's fan of flame across his front
//   ventRing       Bellows Vent: a ring of fire off his back
//   furnaceMouth   the Great Furnace's mouth (the set's), every frame
//   standingFire   a small standing fire (the husk's open furnace)
//   plateBurst     a plate torn off: sparks and grit
//   callStrike     Sky-Splitting Mortars: a red ring on the ground, a shell falling into it

const EMBER = [3.2, 1.1, 0.25], EMBER_END = [0.5, 0.06, 0.01];
const SPARK = [3.0, 2.2, 1.0], GRIT = [0.32, 0.3, 0.28], GRIT_END = [0.12, 0.11, 0.1];
const BLAST = Object.freeze({ kind: BLOW.BLAST, by: 'boss', fire: 1 });

export class MarshalFx extends DuelFx {
  constructor(d) {
    super(d);
    // the mortars' marks (the fairness guard and the cue ledger read `strikes`: duelist/brain.js)
    this.strikes = Array.from({ length: 8 }, () => ({ alive: false, x: 0, z: 0, r: 1, t: 0, at: 1, flashed: false, damage: 0, kb: 0, attack: 'mortarRain' }));
    this._acc = 0;
  }

  reset() {
    super.reset();
    for (const s of this.strikes ?? []) s.alive = false;
  }

  update(dt, d) {
    super.update(dt, d);
    this.updateStrikes(dt, d);
    if (d.game?.level?.id === 'foundry' && d.game.level.stage !== 'lab') this.furnaceMouth(dt);
  }

  get strikesAlive() {
    return this.strikes.some((s) => s.alive);
  }

  // ---------------------------------------------------------------- the Fire Lance
  /** The fire tube heating through a windup (k 0..1): small cool blobs gathering at the muzzle. */
  muzzleHeat(x, y, z, k, dt) {
    if (!Number.isFinite(x + y + z + k)) return;
    this._acc += dt * (30 + 60 * k);
    while (this._acc >= 1) {
      this._acc -= 1;
      const a = this.lr() * Math.PI * 2, r = 0.35 * (1 - k) + 0.05;
      this._blob(x + Math.cos(a) * r, Math.max(0.7, y + this.lrand(-0.1, 0.15)), z + Math.sin(a) * r, -Math.cos(a) * r * 2, this.lrand(0.1, 0.6), -Math.sin(a) * r * 2, this.lrand(0.18, 0.3), 0.26, 0.12, 0.22 + 0.45 * k, 0, K_FIRE, 1.5);
    }
    if (k > 0.6) this._dot(x, Math.max(0.7, y), z, 0.3, 0.5 + 0.6 * (k - 0.6), K_FIRE);
  }

  /** The bolt from (a) to (b): a crisp steel core written on the letter grid, a sheath of fire blobs that
   *  outlives it and lifts, a burst of fire where it ends. `big` for the suit's lance. */
  lanceBolt(ax, ay, az, bx, by, bz, big = true) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz)) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (!(len > 0.1)) return;
    this._ink(ax, ay, az, bx, by, bz, 0.16, big ? 1.12 : 0.95, 0.25);
    const n = Math.min(70, Math.ceil(len / 0.28));
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = big ? 0.55 : 0.4;
      this._blob(ax + dx * t, ay + dy * t, az + dz * t, this.lrand(-0.3, 0.3), this.lrand(0.2, 0.9), this.lrand(-0.3, 0.3), this.lrand(0.22, 0.4), s, s * 0.5, 0.62, 0, K_FIRE, 1.4, -0.6);
    }
    this.fireBurst(bx, by, bz, big ? 1 : 0.6);
    this._light({ x: (ax + bx) / 2, y: Math.max(1, (ay + by) / 2), z: (az + bz) / 2, color: [1, 0.55, 0.2], intensity: big ? 5 : 3, radius: 8 + len * 0.3, life: 0.22, fade: 0.2 });
  }

  /** A burst of fire where something burning lands (k: size). */
  fireBurst(x, y, z, k = 1) {
    if (!Number.isFinite(x + y + z)) return;
    const n = Math.round(14 * k);
    for (let i = 0; i < n; i++) {
      const a = this.lr() * Math.PI * 2, sp = this.lrand(1, 3.4) * k;
      this._blob(x, Math.max(GROUND_Y, y), z, Math.cos(a) * sp, this.lrand(0.4, 2.2), Math.sin(a) * sp, this.lrand(0.3, 0.55), 0.6 * k, 0.9 * k, 0.6, 0, K_FIRE, 2.5, -1);
    }
    for (let i = 0; i < 6 * k; i++) {
      this._spawn(this.add, {
        x, y: Math.max(0.3, y), z, vx: this.lrand(-3, 3), vy: this.lrand(1, 4), vz: this.lrand(-3, 3), life: this.lrand(0.4, 0.9), size: this.lrand(0.12, 0.2), sizeEnd: 0.04,
        glyph: "*'.", color: EMBER, colorEnd: EMBER_END, alpha: 1, alphaEnd: 0, drag: 1.6, gravity: -4,
      });
    }
  }

  /** Sweeping Fire: a fan of flame across his front (sector `r`, half-angle `ang`). */
  fireFan(x, z, yaw, r, ang) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = yaw + (i / (n - 1) - 0.5) * 2 * ang, d = this.lrand(0.6, r);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      this._blob(px, 0.5, pz, Math.sin(a) * 2, this.lrand(0.5, 1.8), Math.cos(a) * 2, this.lrand(0.3, 0.6), 0.7, 1.1, 0.6, 0, K_FIRE, 1.8, -0.8);
    }
    this._light({ x, y: 1.2, z, color: [1, 0.5, 0.15], intensity: 4, radius: r * 1.8, life: 0.3, fade: 0.25 });
  }

  /** Bellows Vent: a ring of fire thrown out round him, low. */
  ventRing(x, z, r) {
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.lrand(-0.1, 0.1), sp = r * this.lrand(2.2, 3);
      this._blob(x + Math.cos(a) * 0.8, 0.7, z + Math.sin(a) * 0.8, Math.cos(a) * sp, this.lrand(0.2, 1.2), Math.sin(a) * sp, this.lrand(0.3, 0.42), 0.7, 1.0, 0.62, 0, K_FIRE, 3.2, -0.5);
    }
    this.shock?.(x, z, r, this._shockO ?? (this._shockO = { k: 0.8, fire: 1, kind: 'fire' }));
  }

  /** The Great Furnace's mouth (world/foundry.js FOUNDRY.furnace): standing fire spilling over its lip. */
  furnaceMouth(dt) {
    const F = FOUNDRY.furnace, x = F.x, z = F.z + 3.1;
    const life = this._frame();
    if (life > 0) {
      for (let i = 0; i < 7; i++) {
        const u = (i / 6 - 0.5) * 1.8;
        const h = 0.55 + 0.25 * Math.sin((this.game.time ?? 0) * 6 + i * 1.7);
        this._blob(x + u, 1.2 + 0.25 * Math.abs(Math.sin(i * 2.1)), z, 0, 0, 0, life, 0.75, 0.75, h, h, K_FIRE);
      }
      this._blob(x, 2.0, z - 0.3, 0, 0, 0, life, 1.2, 1.2, 0.45, 0.45, K_FIRE);
    }
    this._fAcc = (this._fAcc ?? 0) + dt * 10;
    while (this._fAcc >= 1) {
      this._fAcc -= 1;
      this._blob(x + this.lrand(-1, 1), 1.3, z + 0.2, this.lrand(-0.2, 0.2), this.lrand(0.8, 1.6), this.lrand(0.2, 0.6), this.lrand(0.5, 0.9), 0.6, 0.25, 0.5, 0, K_FIRE, 0.5, -1.2);
      if (this.lr() < 0.25) this._blob(x + this.lrand(-0.6, 0.6), 9.6, z - 3.4, 0, this.lrand(0.6, 1.2), 0.2, this.lrand(1.2, 2), 0.9, 2.2, 0.5, 0, K_SMOKE, 0.2, -0.3);
      if (this.lr() < 0.3) {
        this._spawn(this.add, {
          x: x + this.lrand(-1, 1), y: 1.6, z: z + 0.3, vx: this.lrand(-0.6, 0.6), vy: this.lrand(1.5, 3), vz: this.lrand(0.2, 1.2), life: this.lrand(0.8, 1.6), size: 0.14, sizeEnd: 0.04,
          glyph: "'.*", color: EMBER, colorEnd: EMBER_END, alpha: 1, alphaEnd: 0, drag: 0.6, gravity: 0.6,
        });
      }
    }
  }

  /** A small standing fire (the husk's open furnace), redrawn every frame. */
  standingFire(x, y, z, k = 1) {
    const life = this._frame();
    if (!(life > 0) || !Number.isFinite(x + y + z)) return;
    const t = this.game.time ?? 0;
    for (let i = 0; i < 4; i++) {
      const h = (0.45 + 0.2 * Math.sin(t * 7 + i * 2.3)) * k;
      this._blob(x + (i - 1.5) * 0.18, y + 0.12 * (i & 1), z, 0, 0, 0, life, 0.42, 0.42, h, h, K_FIRE);
    }
    if (this.lr() < 0.2) this._blob(x, y + 0.3, z, 0, this.lrand(0.6, 1.2), 0, this.lrand(0.5, 0.9), 0.4, 0.15, 0.45, 0, K_FIRE, 0.5, -1);
  }

  /** The furnace on his back breathing (the back plate gone): a little fire out of the grate. */
  backFire(x, y, z, k, dt) {
    this._bAcc = (this._bAcc ?? 0) + dt * 14 * k;
    while (this._bAcc >= 1) {
      this._bAcc -= 1;
      this._blob(x + this.lrand(-0.2, 0.2), y + this.lrand(-0.15, 0.2), z + this.lrand(-0.2, 0.2), 0, this.lrand(0.6, 1.4), 0, this.lrand(0.25, 0.45), 0.35, 0.15, 0.45 * k + 0.15, 0, K_FIRE, 0.6, -1);
    }
  }

  /** A plate torn off the suit: sparks thrown off where it sat, grit falling. */
  plateBurst(x, y, z, dx, dz) {
    if (!Number.isFinite(x + y + z + dx + dz)) return;
    for (let i = 0; i < 16; i++) {
      const sp = this.lrand(2, 7), spark = i < 10;
      this._spawn(spark ? this.add : this.alpha, {
        x, y, z, vx: dx * sp + this.lrand(-2, 2), vy: this.lrand(0.5, 4), vz: dz * sp + this.lrand(-2, 2), life: this.lrand(0.3, 0.7), size: this.lrand(0.12, 0.2), sizeEnd: 0.04,
        glyph: spark ? "*'`" : ".,:", color: spark ? SPARK : GRIT, colorEnd: spark ? EMBER_END : GRIT_END, alpha: 1, alphaEnd: 0, drag: 1.8, gravity: spark ? -6 : -9,
      });
    }
    this.guard(x, y, z, { heavy: true });
  }

  /** A blow on a plate: a dull clang instead of a cut's spray (marshal.js sets d._plateHit). */
  hitSpark(x, y, z, dx, dz, heavy) {
    if (this.d._plateHit) {
      if (!Number.isFinite(x + y + z)) return;
      this.guard(x, y, z, { heavy });
      for (let i = 0; i < 6; i++) {
        this._spawn(this.alpha, {
          x, y, z, vx: dx * this.lrand(1, 3) + this.lrand(-1, 1), vy: this.lrand(0.3, 2), vz: dz * this.lrand(1, 3) + this.lrand(-1, 1), life: this.lrand(0.25, 0.5), size: 0.14, sizeEnd: 0.04,
          glyph: ".,'", color: [0.6, 0.55, 0.42], colorEnd: GRIT_END, alpha: 1, alphaEnd: 0, drag: 2, gravity: -6,
        });
      }
      return;
    }
    super.hitSpark(x, y, z, dx, dz, heavy);
  }

  /** The pilot's fire bolt in flight (a duelist crescent with style 'fire'): a short streak of fire with
   *  a steel tip, embers off it. */
  _drawCrescent(c, ember) {
    if (c.style !== 'fire') return super._drawCrescent(c, ember);
    const life = this._frame();
    if (life > 0) {
      for (let i = 0; i < 4; i++) this._blob(c.x - c.dx * i * 0.22, 0.85, c.z - c.dz * i * 0.22, 0, 0, 0, life, 0.42 - i * 0.06, 0.42 - i * 0.06, 0.7 - i * 0.12, 0.7 - i * 0.12, K_FIRE);
      this._ink(c.x - c.dx * 0.5, 0.85, c.z - c.dz * 0.5, c.x + c.dx * 0.2, 0.85, c.z + c.dz * 0.2, 0, 1.05);
    }
    if (this.lr() < 0.5) this._blob(c.x, 0.85, c.z, -c.dx * 2, this.lrand(0.2, 0.8), -c.dz * 2, this.lrand(0.2, 0.3), 0.35, 0.15, 0.45, 0, K_FIRE, 1.5, -0.5);
  }

  // ---------------------------------------------------------------- Sky-Splitting Mortars
  /** Mark (x, z): a shell lands there `warn` s from now (red: roll or leave the ring). */
  callStrike(x, z, r, warn, o = {}) {
    const s = this.strikes.find((p) => !p.alive);
    if (!s) return null;
    s.alive = true;
    s.x = x;
    s.z = z;
    s.r = r;
    s.t = 0;
    s.at = warn;
    s.flashed = false;
    s.damage = o.damage ?? 22;
    s.kb = o.knockback ?? 3;
    s.attack = o.attack ?? 'mortarRain';
    s._fairAt = undefined;
    return s;
  }

  updateStrikes(dt, d) {
    const p = this.game.player, lead = perPhase(d.T.flashLead, d.phase);
    for (const s of this.strikes) {
      if (!s.alive) continue;
      s.t += dt;
      if (s.t < s.at) {
        const k = Math.min(1, s.t / s.at);
        this.warnRing(s.x, s.z, s.r, k, dt);
        // the shell falling into its ring in the last half second: a fire blob coming down
        const left = s.at - s.t;
        if (left < 0.5) this._dot(s.x, 0.4 + left * 18, s.z, 0.5, 0.75, K_FIRE);
        if (!s.flashed && s.t >= s.at - lead) {
          s.flashed = true;
          d.emit('combat:tell', { source: 'dragon', attack: s.attack, tell: TELL.RED, impactIn: lead, x: s.x, z: s.z, hazard: true });
          d.emit('combat:flash', { source: 'dragon', attack: s.attack, tell: TELL.RED, x: s.x, y: 0.6, z: s.z, hazard: true });
          this.ringPulse(s.x, s.z, s.r * 0.5);
        }
        continue;
      }
      s.alive = false;
      this.fireBurst(s.x, 0.4, s.z, 1.2);
      this.ringPulse(s.x, s.z, s.r);
      const W = d.T.world;
      this.game.world?.scorch?.burnCircle?.(s.x, s.z, s.r * 0.8, 0.3, 0.9);
      this.game.world?.impact?.(s.x, s.z, s.r, W.mortar, BLAST);
      this.game.world?.ignite?.(s.x, s.z, s.r * 0.7, 1);
      this.game.shake?.(0.25);
      d.emit('dragon:explosion', { x: s.x, z: s.z, radius: s.r });
      const pp = p?.position;
      if (pp && p.alive !== false && Math.hypot(pp.x - s.x, pp.z - s.z) <= s.r + (p.radius ?? 0.45) * 0.5) {
        d.hitPlayer({ damage: s.damage, knockback: s.kb, knockdown: true, kind: 'fire', tell: TELL.RED, parryable: false, blockable: false, attack: s.attack, from: { x: s.x, z: s.z }, extra: { plunge: false } });
      }
    }
  }
}
export { K_STEEL };
