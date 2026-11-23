import { TELL } from '../../../combat/rules.js';
import { turnToward } from '../../../core/math.js';

// Xin Yi's iron (phase 2; ADR-156): the two guns. A move's beat marked `iron: '<kind>'` (moves.js):
//   'rain'    Iron Rain: a sustained beat (the brain's `sustain`: one cue for the stream, the ledger sees
//             the whole lit window as one guard) whose ticks each fire a shot from alternating hands while
//             he strafes round the hero at TUNING.ironRain.strafe m; cover in its way stops a shot (fx:
//             destructibles.stop, TUNING.world.shot of a pillar's letters each). A held guard pays guard
//             only (wokenOne.hitPlayer: `guardCost`, 55 at most for the volley)
//   'heavy'   a heavy shot (a cast that cues itself), returnable: a perfect parry flies it back (THE BEND)
//   'point'   the point-blank shot at the end of Close Iron (a blade's blow of the brain's, a blue flare):
//             drawn as a muzzle flash and a slug
//   'wheel'   Turning Wheel: the cartwheel to one side (his root carried sideways), firing low along the
//             floor (a red line zone of the brain's; the shots drawn along it)
//   'reload'  after TUNING.reload.after ranged moves he throws both guns away (fx.gunsAway) and takes two
//             more from the coat: his guard down (the move's recoverOpen, wokenOne.guarding)
// Every shot is a blast of LordFx's pool (fx.throwShot, AscFx's 'blast': the cue ledger reads fx.shots).
// Game rolls (which hand) never draw Math.random: the hands alternate.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const SHOT_BLOW = Object.freeze({ kind: 'blast', by: 'boss', y: 1.0 });

export class IronMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T;
    this._p = { x: 0, y: 0, z: 0 };
    this._h = { x: 0, y: 0, z: 0 };
    this.reset();
  }

  reset() {
    this.fired = 0; // ranged moves since the last reload
    this.hand = 0; // the hand the next shot leaves (0 right, 1 left)
    this.rain = null; // { side, shots } while Iron Rain's stream runs
    this.reloading = false;
    this.wheel = null;
  }

  /** Everything in flight of his is the fx pool's: nothing held here to drop. */
  drop() {
    this.rain = null;
    this.reloading = false;
    this.wheel = null;
  }

  /** His AI's say on a move (wokenOne.weigh): after `reload.after` ranged moves, only the reload. */
  weigh(name, def, w) {
    if (this.d.phase !== 2) return name === 'reload' ? 0 : w;
    const due = this.fired >= this.T.reload.after;
    if (name === 'reload') return due ? 40 : 0;
    if (due && def.ranged) return 0;
    return w;
  }

  begin(A) {
    const def = A.def;
    if (def.ranged && this.d.phase === 2) this.fired++;
    this.reloading = A.name === 'reload';
    if (this.reloading) {
      this.fired = 0;
      this.d.fx.gunsAway?.(this.d);
      this.d.emit('dragon:reload');
    }
    this.rain = null;
    this.wheel = null;
  }

  /** A gun beat's impact (true: handled). */
  onImpact(b, s, a) {
    const D = b.def, d = this.d;
    if (!D.iron) return false;
    if (D.iron === 'rain') {
      // the stream starts: he strafes, one side round the hero (away from the nearer edge of his bound)
      const p = this.game.player?.position;
      const side = p ? (d.position.x * (p.z - d.position.z) - d.position.z * (p.x - d.position.x) >= 0 ? 1 : -1) : 1;
      this.rain = { side, shots: 0 };
      this._fire(a, TELL.NORMAL, this.T.ironRain.damage, false);
      return true;
    }
    if (D.iron === 'point') {
      const h = d.handPoint(false, this._h);
      d.fx.muzzle?.(h.x, h.y, h.z, Math.sin(d.yaw), Math.cos(d.yaw), 0.9, 2);
      this.game.events?.emit?.('dragon:shot', { attack: a?.name ?? 'closeIron', heavy: true });
      return false; // (the brain's blow decides the rest)
    }
    if (D.iron === 'wheel') {
      // the line along the floor: shots drawn on it, the world bitten along it
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), r = D.zone?.r ?? 9;
      for (let i = 1; i <= 4; i++) {
        const k = (i / 4) * r;
        d.fx.muzzle?.(d.position.x + fx * k, 0.35, d.position.z + fz * k, fx, fz, 0.5, 2);
      }
      this.game.events?.emit?.('dragon:shot', { attack: a?.name ?? 'turningWheel', heavy: false });
      return false;
    }
    return D.iron === 'reload';
  }

  /** A cast beat: a heavy shot (true: handled). */
  onCast(b, s, a) {
    const D = b.def;
    if (D.cast?.kind !== 'shot') return false;
    this._fire(a, D.tell ?? TELL.BLUE, D.damage ?? 16, true, D.cast?.both);
    return true;
  }

  /** Iron Rain's lit window: a shot each tick. */
  onSustain(b, s, a) {
    if (b.def.iron !== 'rain' || !this.rain) return;
    this._fire(a, TELL.NORMAL, this.T.ironRain.damage, false);
  }

  /** One shot from the hand whose turn it is, at where the hero is (a short lead on his movement). */
  _fire(a, tell, damage, heavy) {
    const d = this.d, p = this.game.player?.position;
    if (!p) return null;
    const left = this.hand === 1 && d.phase >= 2;
    this.hand = 1 - this.hand;
    const h = d.handPoint(left, this._h);
    let x = h.x, y = h.y, z = h.z;
    if (!Number.isFinite(x + y + z)) {
      x = d.position.x;
      y = 1.2;
      z = d.position.z;
    }
    const v = this.game.player?.vel;
    const C = heavy ? this.T.heavyShot : this.T.shot;
    const dist = Math.hypot(p.x - x, p.z - z), lead = Math.min(0.3, dist / C.speed) * 0.5;
    const tx = p.x + fin(v?.x) * lead, tz = p.z + fin(v?.z) * lead;
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
    const s = d.fx.throwShot?.({
      kind: 'blast', x, y: Math.max(0.9, Math.min(1.4, y)), z, dx: dx / l, dz: dz / l, speed: C.speed, radius: C.radius, size: C.size, range: C.range,
      tell, damage, knockback: heavy ? 1.6 : 0.4, attack: a?.name ?? (heavy ? 'twoThunders' : 'ironRain'), returnable: heavy, hitKind: 'shot',
    });
    if (s) {
      s.iron = true;
      s.heavy = heavy;
      if (this.rain && !heavy) this.rain.shots++;
      d.fx.muzzle?.(x, y, z, dx / l, dz / l, heavy ? 0.8 : 0.45, 2);
      this.game.events?.emit?.('dragon:shot', { attack: s.attack, heavy });
    }
    return s;
  }

  /** Every frame of a gun beat: Iron Rain's strafe; Turning Wheel's cartwheel to one side. */
  motion(b, u, s, dt) {
    const D = b.def, d = this.d;
    if (D.iron === 'rain' && this.rain && u > 1 && s) {
      const I = this.T.ironRain;
      // round the hero at the strafe's ring, facing him
      const ang = Math.atan2(d.position.x - s.p.x, d.position.z - s.p.z);
      const r = Math.min(I.strafe[1], Math.max(I.strafe[0], s.dist));
      const a1 = ang + (this.rain.side * I.speed * dt) / Math.max(1, r);
      const tx = s.p.x + Math.sin(a1) * r, tz = s.p.z + Math.cos(a1) * r;
      const x0 = d.position.x, z0 = d.position.z;
      d.moveBy(tx - x0, tz - z0);
      // (pressed against a wall or a pillar: round the other way)
      if (Math.hypot(d.position.x - x0, d.position.z - z0) < I.speed * dt * 0.3) this.rain.side = -this.rain.side;
      d.groundVelSet((d.position.x - x0) / Math.max(dt, 1e-4), (d.position.z - z0) / Math.max(dt, 1e-4));
      d.yaw = turnToward(d.yaw, Math.atan2(s.p.x - d.position.x, s.p.z - d.position.z), 16 * dt);
    }
    if (D.iron === 'wheel' && u > 0.25 && u < 1) {
      // the cartwheel: carried 2.4 m to his left through the windup
      const k = (Math.min(1, u) - 0.25) / 0.75, prev = b._wheel ?? 0, now = 2.4 * k * k * (3 - 2 * k);
      b._wheel = now;
      const lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
      d.moveBy(lx * (now - prev), lz * (now - prev));
    }
  }

  frame() {
    const a = this.d.brain.act;
    if (this.rain && (!a || a.name !== 'ironRain')) this.rain = null;
    if (this.reloading && (!a || a.name !== 'reload')) this.reloading = false;
  }
}

export { SHOT_BLOW };
