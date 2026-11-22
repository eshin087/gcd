import { FIRE_LANCE } from './combat.js';
import { REWARDS } from './rewards.js';
import { BLOW } from '../../world/breakTuning.js';
import { FIRE_KIND } from '../../render/firePalettes.js';

// The hero's fire-lance shot (ADR-137): the Clockwork Marshal's reward, owned once she is beaten
// (player/rewards.js `fireLance`; `?reward=fireLance` forces it). Pressed (the `technique` action: Q, pad
// button 14, the touch tile shown while it is owned), with a charge left and the hero free (standing,
// running, guarding), the free hand's sword fingers loose a bolt of fire after FIRE_LANCE.windup s. The
// hero keeps his pose (the guard's sword fingers already point ahead: no new animation); the bolt goes
// at the lock-on target, else along his facing. Drawn as heat in the fire field with a crisp steel core
// (STYLE.md "The fire field"). It meets the world (ADR-107): cover stops it, it lights wood, its end is a
// blow on the world by the player. Charges: FIRE_LANCE.charges at most, back by perfect parries and
// perfect dodges (a plain parry a third of one) and in full after a rest. No allocation per frame.

const FREE = new Set(['idle', 'run', 'sprint', 'block']);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class FireLance {
  constructor(player) {
    this.p = player;
    this.game = player.game;
    this.charges = FIRE_LANCE.charges;
    this.t = 0; // time since the press (the windup), or < 0 idle
    this.cool = 0; // the recovery left
    this.bolt = { alive: false, x: 0, y: 1.2, z: 0, dx: 0, dz: 1, flown: 0, src: -1 };
    this.stats = { fired: 0, hits: 0, stopped: 0 };
    this._b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.1, size: 0.4, sizeEnd: 0.4, heat: 0.6, heatEnd: 0, drag: 0, gravity: 0, kind: FIRE_KIND.fire };
    this._hit = { damage: 0, part: 'body', point: { x: 0, y: 0, z: 0 }, dir: { x: 0, z: 1 }, heavy: true, poise: FIRE_LANCE.poise, posture: FIRE_LANCE.posture, crit: false };
    this._blow = { kind: BLOW.BLAST, by: 'player', fire: FIRE_LANCE.fire, dx: 0, dz: 0, src: -1 };
    this._stop = { kind: BLOW.CUT, by: 'player', y: 1.0 };
    this._v = { x: 0, y: 0, z: 0 };
    this.t = -1;
    const ev = this.game?.events;
    ev?.on?.('player:parry', (e) => this.gain(e?.perfect ? FIRE_LANCE.perfect : FIRE_LANCE.parry));
    ev?.on?.('player:perfectDodge', () => this.gain(FIRE_LANCE.perfect));
  }

  /** The hero owns it (the store on the game, else the page's). */
  get owned() {
    const R = this.game?.rewards ?? REWARDS;
    return !!R?.has?.('fireLance');
  }

  gain(k) {
    if (!this.owned || !(k > 0)) return;
    this.charges = Math.min(FIRE_LANCE.charges, this.charges + k);
  }

  /** Full again (a rest at the bonfire, a respawn). */
  refill() {
    this.charges = FIRE_LANCE.charges;
    this.t = -1;
    this.cool = 0;
    this.bolt.alive = false;
  }

  /** Loose a shot now if it may be (owned, a whole charge, the hero free). True if it started. */
  fire() {
    const p = this.p;
    if (!this.owned || this.charges < 1 || this.t >= 0 || this.cool > 0 || !p.alive || !FREE.has(p.state)) return false;
    this.charges -= 1;
    this.t = 0;
    this.stats.fired++;
    this.game?.events?.emit?.('player:technique', { id: 'fireLance', charges: this.charges });
    return true;
  }

  update(dt, control = true) {
    if (!(dt > 0)) return;
    if (this.cool > 0) this.cool -= dt;
    const inp = this.game?.input;
    if (control && this.owned && inp?.actPressed?.('technique')) this.fire();
    if (this.t >= 0) {
      this.t += dt;
      this._muzzleHeat(Math.min(1, this.t / FIRE_LANCE.windup));
      if (this.t >= FIRE_LANCE.windup) {
        this.t = -1;
        this.cool = FIRE_LANCE.recovery;
        if (this.p.alive) this._launch();
      }
    }
    if (this.bolt.alive) this._fly(dt);
  }

  /** Where the shot leaves from: the free hand's sword fingers (drawn), else before his chest. */
  _origin(out) {
    const pt = this.p.rig?.arms?.L?.point;
    if (pt?.getWorldPosition) {
      pt.getWorldPosition(this._wv ?? (this._wv = new pt.position.constructor()));
      const w = this._wv;
      if (Number.isFinite(w.x + w.y + w.z)) {
        out.x = w.x;
        out.y = Math.max(0.7, w.y);
        out.z = w.z;
        return out;
      }
    }
    const P = this.p.position, yaw = fin(this.p.yaw);
    out.x = P.x + Math.sin(yaw) * 0.5;
    out.y = 1.2;
    out.z = P.z + Math.cos(yaw) * 0.5;
    return out;
  }

  _launch() {
    const p = this.p, g = this.game, B = this.bolt, o = this._origin(this._v);
    // at the lock-on target, else along his facing
    let dx = Math.sin(fin(p.yaw)), dz = Math.cos(fin(p.yaw));
    const d = g?.dragon;
    if (p.lockOn && d?.lockPoint) {
      const L = d.lockPoint(this._lp ?? (this._lp = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }));
      const ax = L.x - p.position.x, az = L.z - p.position.z, l = Math.hypot(ax, az);
      if (l > 0.3) {
        dx = ax / l;
        dz = az / l;
      }
    }
    B.alive = true;
    B.x = o.x;
    B.y = o.y;
    B.z = o.z;
    B.dx = dx;
    B.dz = dz;
    B.flown = 0;
    B.src = g?.world?.destructibles?.swing?.() ?? -1;
    this._burst(o.x, o.y, o.z, 0.5);
  }

  _fly(dt) {
    const B = this.bolt, g = this.game, F = FIRE_LANCE;
    const step = Math.min(F.speed * dt, F.range - B.flown);
    const px = B.x, pz = B.z;
    B.x += B.dx * step;
    B.z += B.dz * step;
    B.flown += step;
    // cover stops it (it takes the blow, wood catches)
    const W = g?.world?.destructibles;
    const c = W?.stop?.(px, pz, B.x, B.z, F.radius, F.power, this._stop);
    if (c) {
      this.stats.stopped++;
      this._end(c.x, Math.min(1.4, B.y), c.z, true);
      return;
    }
    // the boss: its hurt spheres (gameplay space) against this frame's stretch of the line
    const d = g?.dragon;
    if (d && typeof d.takeHit === 'function' && d.state !== 'dead' && d.state !== 'dying' && Array.isArray(d.hurtSpheres)) {
      for (const s of d.hurtSpheres) {
        if (!s || !(s.r > 0)) continue;
        const ax = s.x - px, az = s.z - pz;
        const t = Math.max(0, Math.min(step, ax * B.dx + az * B.dz));
        const qx = px + B.dx * t - s.x, qz = pz + B.dz * t - s.z;
        if (qx * qx + qz * qz > (s.r + F.radius) ** 2 || Math.abs(s.y - B.y) > s.r + 1.6) continue;
        const H = this._hit;
        H.damage = F.damage;
        H.part = typeof s.part === 'string' ? s.part : 'body';
        H.point.x = s.x;
        H.point.y = s.y;
        H.point.z = s.z;
        H.dir.x = B.dx;
        H.dir.z = B.dz;
        let r = 0;
        try {
          r = d.takeHit(H);
        } catch (err) {
          console.error('[fireLance] takeHit failed', err);
        }
        if (r > 0) this.stats.hits++;
        this._end(s.x, s.y, s.z, false);
        return;
      }
    }
    this._draw(px, pz);
    if (B.flown >= F.range - 1e-6) this._end(B.x, 0.4, B.z, false);
  }

  /** The bolt ends at (x, y, z): a burst of fire; the world takes it there (by the player). */
  _end(x, y, z, cover) {
    const B = this.bolt, w = this.game?.world, o = this._blow;
    B.alive = false;
    o.dx = B.dx;
    o.dz = B.dz;
    o.src = B.src;
    if (!cover) w?.impact?.(x, z, 1.0, FIRE_LANCE.power, o);
    w?.ignite?.(x, z, 1.2, 1);
    this._burst(x, y, z, 1);
    this.game?.shake?.(0.08);
  }

  // ---------------------------------------------------------------- heat (the fire field)
  _blob(x, y, z, vx, vy, vz, life, size, sizeEnd, heat, kind) {
    const f = this.game?.fx?.fire;
    if (!f || !Number.isFinite(x + y + z)) return;
    const b = this._b;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    b.life = life;
    b.size = size;
    b.sizeEnd = sizeEnd;
    b.heat = heat;
    b.heatEnd = 0;
    b.kind = kind;
    b.drag = 1.2;
    b.gravity = -0.6;
    f.spawn(b);
  }

  _muzzleHeat(k) {
    const o = this._origin(this._v);
    this._blob(o.x, o.y, o.z, 0, 0.3, 0, 0.08, 0.22, 0.12, 0.25 + 0.5 * k, FIRE_KIND.fire);
  }

  /** The bolt this frame: a short streak of fire round a steel core, from where it was to where it is. */
  _draw(px, pz) {
    const B = this.bolt, n = 4;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = px + (B.x - px) * t, z = pz + (B.z - pz) * t;
      this._blob(x, B.y, z, 0, 0.3, 0, 0.18, 0.42, 0.18, 0.6, FIRE_KIND.fire);
      if (i === n) this._blob(x, B.y, z, 0, 0, 0, 0.06, 0.2, 0.2, 1.1, FIRE_KIND.steel);
    }
  }

  _burst(x, y, z, k) {
    for (let i = 0; i < 10 * k; i++) {
      const a = (i / (10 * k)) * Math.PI * 2;
      this._blob(x, y, z, Math.cos(a) * 2.2 * k, 0.8, Math.sin(a) * 2.2 * k, 0.3, 0.45 * k, 0.7 * k, 0.55, FIRE_KIND.fire);
    }
  }
}
