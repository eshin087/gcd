import { TELL, RESULT } from '../../../combat/rules.js';
import { K_FIRE, K_SMOKE, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { perPhase } from '../duelist/realise.js';
import { lookOf } from '../duelist/lookSwitch.js';

// THE MOLTEN SEAMS (ADR-133): from phase 2 the cut his eyes leave in the stone lingers as a low seam of
// molten rock (the recipe of the Ash Disciple's burning ground, ashDisciple/moveFx.js): T.seam.life s by
// phase, a contact tick of T.seam.damage every T.seam.tick s to a hero standing on it after its first
// T.seam.grace s, never while he rolls; with his guard up a tick costs T.seam.guard of the guard meter
// and no health (a blocked blow). It is ground to step off, not a blow: no cue. A pool of T.seam.pool
// segments (the oldest goes when it is full). gaze.js lays them (lay(x, z, dx, dz): one segment from
// the foot's last mark to this one, each T.seam.step m of travel).
// Drawn as heat in the fire field's FIRE slot (molten rock is fire: orange, red at its rim, below his
// knees), embers off it (one-letter glyphs). `?gaze=c` makes it twice as wide (the thin line's show).
// Look jitter from its own stream, never Math.random.

const EMBER = [3.2, 1.2, 0.3], EMBER_END = [0.5, 0.06, 0.01];

export class Seams {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    const n = d.T.seam?.pool ?? 10;
    this.list = Array.from({ length: n }, () => ({ alive: false, ax: 0, az: 0, bx: 0, bz: 0, w: 0.8, life: 3, age: 0, acc: 0, emb: 0 }));
    this._seed = 0x6a09e667;
    this._tick = 0;
    this._last = null; // { x, z, t } the foot's last mark (a seam joins on to it)
    this._hit = {
      damage: 6, from: { x: 0, z: 0 }, knockback: 0, knockdown: false, kind: 'fire', burn: 0,
      tell: TELL.NORMAL, parryable: false, blockable: true, attack: 'moltenSeam', attacker: null,
      plunge: false, perfect: false, light: true, around: true,
    };
    this.stats = { seams: 0, ticks: 0, guarded: 0 };
  }

  get T() {
    return this.d.T.seam;
  }

  lr() {
    this._seed = (Math.imul(this._seed, 1103515245) + 12345) >>> 0;
    return this._seed / 4294967296;
  }

  reset() {
    for (const s of this.list) s.alive = false;
    this._tick = 0;
    this._last = null;
  }

  get alive() {
    let n = 0;
    for (const s of this.list) if (s.alive) n++;
    return n;
  }

  /** The beam's foot marked the stone at (x, z), moving (dx, dz): a seam from its last mark (phase 2 on). */
  lay(x, z, dx, dz) {
    const T = this.T, life = perPhase(T.life, this.d.phase);
    const now = this.d.time ?? 0;
    if (!(life > 0) || !Number.isFinite(x + z)) {
      this._last = { x, z, t: now };
      return null;
    }
    const L = this._last;
    let ax, az;
    if (L && now - L.t < 0.35 && Math.hypot(x - L.x, z - L.z) < T.step * 2.2) {
      ax = L.x;
      az = L.z;
    } else {
      const l = Math.hypot(dx, dz) || 1;
      ax = x - (dx / l) * T.step * 0.5;
      az = z - (dz / l) * T.step * 0.5;
    }
    this._last = { x, z, t: now };
    let s = this.list.find((q) => !q.alive);
    if (!s) s = this.list.reduce((a, b) => (b.age > a.age ? b : a));
    s.alive = true;
    s.ax = ax;
    s.az = az;
    s.bx = x;
    s.bz = z;
    s.w = T.width * (lookOf('gaze', 'a') === 'c' ? 2 : 1);
    s.life = life;
    s.age = 0;
    s.acc = 0;
    s.emb = 0;
    this.stats.seams++;
    return s;
  }

  frame(dt) {
    if (!(dt >= 0)) return;
    if (this._tick > 0) this._tick -= dt;
    let any = false;
    for (const s of this.list) {
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.alive = false;
        continue;
      }
      any = true;
      this._draw(s, dt);
    }
    if (any) this._hurt();
  }

  /** The hero on a seam: a small blockable burn every tick after its grace, never while he rolls. */
  _hurt() {
    const T = this.T, g = this.game, p = g.player;
    if (this._tick > 0 || !p?.takeHit || p.alive === false || (g.state && g.state !== 'boss')) return;
    if (p.state === 'roll' || p.isInvulnerable?.()) return;
    const px = p.position?.x, pz = p.position?.z, pr = (p.radius ?? 0.45) * 0.8;
    if (!Number.isFinite(px + pz)) return;
    for (const s of this.list) {
      if (!s.alive || s.age < T.grace || s.age > s.life - 0.3) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / l2));
      const cx = s.ax + dx * u, cz = s.az + dz * u;
      if (Math.hypot(px - cx, pz - cz) > s.w / 2 + pr) continue;
      this._tick = T.tick;
      const h = this._hit, guarded = !!p.blocking && (p.guard ?? 0) > 0;
      h.attacker = this.d;
      h.damage = guarded ? T.guard : T.damage;
      h.knockback = guarded ? 0.01 : 0;
      h.from.x = cx + (Math.hypot(cx - px, cz - pz) < 1e-3 ? 0.01 : 0);
      h.from.z = cz;
      this.stats.ticks++;
      const kx = p.kb?.x ?? 0, kz = p.kb?.z ?? 0;
      try {
        const r = p.takeHit(h);
        if (guarded && r === RESULT.BLOCKED) {
          this.stats.guarded++;
          if (p.kb) {
            p.kb.x = kx;
            p.kb.z = kz;
          }
        }
      } catch (err) {
        console.error('[fallen seam] player.takeHit failed', err);
      }
      return;
    }
  }

  _draw(s, dt) {
    const fx = this.d.fx;
    if (!fx?.fire) return;
    const k = Math.min(1, s.age / 0.1) * Math.min(1, (s.life - s.age) / 0.6);
    if (!(k > 0.02)) return;
    fx._line?.(s.ax, GROUND_Y, s.az, s.bx, GROUND_Y, s.bz, 0, s.w * 0.7, 0.22 * GROUND_GAIN * k, 0, K_FIRE, 0.2);
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    s.acc += dt * 4 * k;
    while (s.acc >= 1) {
      s.acc -= 1;
      const u = this.lr();
      if (s.age > 0.6 && this.lr() < 0.3) fx._blob(s.ax + dx * u, 0.9, s.az + dz * u, 0, 0.5, 0, 0.8, 0.4, 0.9, 0.24, 0, K_SMOKE, 0.6, 0);
    }
    s.emb += dt * 6 * k;
    if (s.emb >= 1 && fx.add) {
      s.emb -= 1;
      const u = this.lr();
      const o = fx._rec?.(s.ax + dx * u, 0.35, s.az + dz * u, 0.5 + this.lr() * 0.6, 0.13, 0.04, ".'`", EMBER, EMBER_END);
      if (o) {
        o.vx = (this.lr() - 0.5) * 0.5;
        o.vy = 1 + this.lr();
        o.vz = (this.lr() - 0.5) * 0.5;
        o.drag = 0.8;
        fx._spawn(fx.add, o);
      }
    }
  }
}
