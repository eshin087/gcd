import { FIRE_KIND } from '../../../render/firePalettes.js';
import { BLOW } from '../../../world/breakTuning.js';

// TIDEBREATH: the Tide Colossus's fixed reward (ADR-143), a breath-style beam technique for the hero.
// Fixed rewards (ROADMAP M2: slots, a meter, an equip screen, bindings on keyboard, pad and touch) are not
// built, and several bosses are being built at once: each binding its own button into player.js,
// core/bindings.js and ui/touch.js would collide and leave several ad hoc systems. So this module ships
// THE TECHNIQUE ITSELF, working, reachable from the Lab only (the colossus's debug `tidebreath`), and its
// shape is what the technique system adopts: `TIDE_BREATH` (the data) and a cast (`TideBreathCast`:
// start(), update(dt)). No slot, no meter, no binding, no equip screen, nothing granted on victory.
//
// The cast: after `windup` s, a beam along the hero's facing for `beam` s, `range` m long and
// `halfWidth` m either side. Each of its `ticks` hits the first hurt sphere of the boss it meets
// (boss.takeHit, heavy), sweeps the world along it once (destructibles.sweep, BLOW.BLAST, by 'player')
// and lands a world.impact at its end. Drawn as a crisp steel line in the fire field with the hero's own
// cyan in glyph sparks. It builds NO three.js object (at import or when cast): every object draws an id
// from the seeded Math.random, and one more on the default hero rig has turned the wyrm's seeded tests
// red before. No new hero state: he casts from where he stands (his motion is a listed follow-up).

export const TIDE_BREATH = Object.freeze({
  id: 'tideBreath',
  name: 'Tidebreath',
  from: 'tide',
  windup: 0.45,
  beam: 0.9,
  range: 18,
  halfWidth: 0.6,
  ticks: 6,
  damage: 24,
  posture: 6,
  world: Object.freeze({ sweep: 0.5, end: 0.6 }),
});

const CYAN = [0.4, 1.6, 2.2]; // the hero's own colour (ADR-106), in his sparks only
const STEEL = FIRE_KIND.steel;
const BLOB = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.3, sizeEnd: 0.3, heat: 0.9, heatEnd: 0.9, drag: 0, gravity: 0, kind: STEEL };
const SPARK = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.3, size: 0.18, sizeEnd: 0.06, glyph: "'.*", color: CYAN, colorEnd: [0.05, 0.2, 0.3], alpha: 1, alphaEnd: 0, drag: 2, gravity: -4 };
const WORLD_O = { kind: BLOW.BLAST, by: 'player', dx: 0, dz: 0, y: 1, src: -1 };

export class TideBreathCast {
  constructor(game, data = TIDE_BREATH) {
    this.game = game;
    this.T = data;
    this.t = -1; // -1 = idle; else seconds since the cast began
    this.tick = 0;
    this.dir = { x: 0, z: 1 };
    this.dealt = 0;
    this.hits = 0;
    this._seed = 0x1de5;
  }

  get active() {
    return this.t >= 0;
  }

  /** Begin a cast along the hero's facing (false: no hero, or one is running). */
  start() {
    const p = this.game.player;
    if (!p?.position || p.alive === false || this.t >= 0) return false;
    const yaw = Number.isFinite(p.yaw) ? p.yaw : 0;
    this.dir.x = Math.sin(yaw);
    this.dir.z = Math.cos(yaw);
    this.t = 0;
    this.tick = 0;
    this.dealt = 0;
    this.hits = 0;
    this.src = this.game.world?.destructibles?.swing?.() ?? -1;
    return true;
  }

  _rnd() {
    this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  update(dt) {
    if (this.t < 0 || !(dt > 0)) return;
    const T = this.T, g = this.game, p = g.player?.position;
    if (!p) {
      this.t = -1;
      return;
    }
    this.t += dt;
    const ax = p.x + this.dir.x * 0.8, az = p.z + this.dir.z * 0.8, bx = p.x + this.dir.x * T.range, bz = p.z + this.dir.z * T.range;
    if (this.t < T.windup) {
      // the windup: the steel gathers at his hands
      this._dot(ax, 1.2, az, 0.35 + 0.4 * (this.t / T.windup), 0.6);
      return;
    }
    const u = (this.t - T.windup) / T.beam;
    if (u >= 1) {
      this.t = -1;
      return;
    }
    // the beam this frame: a crisp line of steel (it prints as the stroke that runs along it)
    for (let d = 0.8; d <= T.range; d += 0.3) this._dot(p.x + this.dir.x * d, 1.15, p.z + this.dir.z * d, 0.28, 1.0);
    if (this._rnd() < 0.8) this._spark(bx, 1.0, bz);
    // its ticks, evenly through the beam
    const due = Math.min(T.ticks, Math.floor(u * T.ticks) + 1);
    while (this.tick < due) {
      this.tick++;
      this._hitTick(ax, az, bx, bz);
    }
  }

  _hitTick(ax, az, bx, bz) {
    const T = this.T, g = this.game, boss = g.dragon;
    // the boss: the first hurt sphere along the beam
    const H = boss?.hurtSpheres;
    if (Array.isArray(H) && typeof boss.takeHit === 'function' && boss.state !== 'dying' && boss.state !== 'dead') {
      let best = null, bt = Infinity;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      for (const h of H) {
        if (!h || !Number.isFinite(h.x + h.z + h.r) || h.y - h.r > 3.5) continue;
        const t = Math.max(0, Math.min(1, ((h.x - ax) * dx + (h.z - az) * dz) / L2));
        const d = Math.hypot(h.x - (ax + dx * t), h.z - (az + dz * t));
        if (d <= h.r + T.halfWidth && t < bt) {
          bt = t;
          best = h;
        }
      }
      if (best) {
        let r = 0;
        try {
          r = boss.takeHit({ damage: T.damage, part: best.part, point: { x: best.x, y: best.y, z: best.z }, dir: { x: this.dir.x, z: this.dir.z }, heavy: true, posture: T.posture });
        } catch (err) {
          console.error('[tidebreath] takeHit failed', err);
        }
        if (Number.isFinite(r) && r > 0) {
          this.dealt += r;
          this.hits++;
          g.events?.emit('player:hitDragon', { damage: r, part: best.part, point: { x: best.x, y: best.y, z: best.z }, heavy: true, crit: false, kind: 'technique', combo: 1, weight: null });
        }
        for (let i = 0; i < 4; i++) this._spark(best.x, best.y, best.z);
      }
    }
    // the world: one sweep along it a tick (one id a cast: a piece takes it once), a blow at its end
    const D = g.world?.destructibles;
    if (D?.sweep) {
      WORLD_O.dx = this.dir.x;
      WORLD_O.dz = this.dir.z;
      WORLD_O.src = this.src;
      D.sweep(ax, az, bx, bz, T.halfWidth, T.world.sweep, WORLD_O);
    }
    if (this.tick === T.ticks) g.world?.impact?.(bx, bz, 1.4, T.world.end, WORLD_O);
  }

  _dot(x, y, z, size, heat) {
    const f = this.game.fx?.fire;
    if (!f) return;
    const dt = Math.max(0.011, (this.game.fxDt ?? this.game.dt ?? 0.016) * 1.5);
    BLOB.x = x;
    BLOB.y = y;
    BLOB.z = z;
    BLOB.life = dt;
    BLOB.size = BLOB.sizeEnd = size;
    BLOB.heat = BLOB.heatEnd = heat;
    f.spawn(BLOB);
  }

  _spark(x, y, z) {
    const pool = this.game.fx?.add;
    if (!pool) return;
    const a = this._rnd() * Math.PI * 2, sp = 2 + this._rnd() * 4;
    SPARK.x = x;
    SPARK.y = y;
    SPARK.z = z;
    SPARK.vx = Math.cos(a) * sp;
    SPARK.vy = 1 + this._rnd() * 3;
    SPARK.vz = Math.sin(a) * sp;
    SPARK.life = 0.25 + this._rnd() * 0.3;
    pool.spawn(SPARK);
  }
}
