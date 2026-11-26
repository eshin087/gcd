import * as THREE from 'three';
import { TELL, RESULT } from '../../../combat/rules.js';
import { turnToward } from '../../../core/math.js';

// Xin Yi's iron (phase 2; ADR-156): the two guns. A move's beat marked `iron: '<kind>'` (moves.js):
//   'rain'    Iron Rain (the rework, ADR-169: THE BULLETS' RULE): a sustained beat (the brain's `sustain`:
//             the ledger sees the whole lit window as one guard) that fires BURSTS: TUNING.ironRain.bursts
//             bursts of `per` slugs, `gap` s apart inside a burst, `rest` s from a burst's last slug to the
//             next burst's first, from alternating hands while he strafes round the hero at `strafe` m.
//             Each burst is ONE cue (the beat's own glint for the first, a glint at the muzzle `glint` s
//             before the others: the slugs themselves are `quiet`) and ONE result (slugHit): the first slug
//             that finds the hero decides the burst; its aim is FIXED at the burst's glint, led by the
//             hero's speed then (a roll or a turn after it is clean). A hit FLINCHES him `stun` s (player.js
//             hit.stun: the buffer kept, no second stagger inside it); every slug carries it, so no slug of a burst staggers twice. A
//             parry turns the burst (its slugs within `parryKeep` s spark off the blade). A held guard pays
//             `guardCost` a slug (12 a burst), never health. Cover in its way stops a slug (fx:
//             destructibles.stop, TUNING.world.shot of a pillar's letters each)
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
    this.rain = null; // { side, shots, t, k, j, aim, glinted } while Iron Rain's bursts run
    this.burst = null; // the last burst fired: { k, res, at } (slugHit)
    this._aim0 = null; // the first burst's aim, fixed at the beat's glint
    this._hitT = -1e9; // d.time a bullet of his last HIT the hero (TUNING.shotMercy)
    this.stats = { bursts: 0, slugs: 0, burstHits: 0, burstParried: 0, burstBlocked: 0, burstDodged: 0, chip: 0, spared: 0, lateHits: 0 };
    this.reloading = false;
    this.wheel = null;
  }

  /** Everything in flight of his is the fx pool's: nothing held here to drop. */
  drop() {
    this.rain = null;
    this.burst = null;
    this._aim0 = null;
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
    this._aim0 = null;
  }

  /** A gun beat's impact (true: handled). */
  onImpact(b, s, a) {
    const D = b.def, d = this.d;
    if (!D.iron) return false;
    if (D.iron === 'rain') {
      // (the bursts started a flight before the impact, motion(): the first slug arrives at the impact)
      if (!this.rain) this._startRain(D, a);
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

  /** Iron Rain's lit window (its bursts run on their own clock: _rainStep). */
  onSustain() {}

  /** The point a burst aims at: where the hero is, led by his speed now (fixed from here on). */
  _aimNow() {
    const p = this.game.player?.position, v = this.game.player?.vel, d = this.d;
    if (!p) return null;
    const dist = Math.hypot(p.x - d.position.x, p.z - d.position.z), lead = Math.min(0.4, dist / this.T.shot.speed + this.T.ironRain.glint);
    return { x: p.x + fin(v?.x) * lead, z: p.z + fin(v?.z) * lead };
  }

  /** s a slug takes to reach the hero from where he stands now. */
  _flight() {
    const p = this.game.player?.position, d = this.d;
    if (!p) return 0;
    return Math.min(0.6, Math.max(0, Math.hypot(p.x - d.position.x, p.z - d.position.z) - this.T.shot.radius - 0.45) / this.T.shot.speed);
  }

  /** The bursts begin: he strafes, one side round the hero (away from the nearer edge of his bound). */
  _startRain(D, a) {
    const d = this.d, p = this.game.player?.position;
    const side = p ? (d.position.x * (p.z - d.position.z) - d.position.z * (p.x - d.position.x) >= 0 ? 1 : -1) : 1;
    this.rain = { side, shots: 0, t: 0, k: 0, j: 0, aim: this._aim0 ?? this._aimNow(), glinted: 0, bursts: D.bursts ?? this.T.ironRain.bursts };
    this._aim0 = null;
    this._rainStep(a, 0);
  }

  /** Iron Rain, every frame of its lit window: the bursts' glints (aims fixed there) and their slugs.
   *  A burst's glint comes `glint` s before its first slug REACHES the hero (as every shot's cue: the
   *  first burst's is the beat's own, its slugs leave a flight early); its aim is fixed at the glint, or
   *  as its first slug leaves if that comes first. */
  _rainStep(a, dt) {
    const R = this.rain, I = this.T.ironRain, d = this.d;
    if (!R) return;
    R.t += dt;
    const every = (I.per - 1) * I.gap + I.rest;
    while (R.k < R.bursts) {
      const T0 = R.k * every;
      if (R.k > 0 && R.glinted < R.k && R.t >= T0 + this._flight() - I.glint) {
        R.glinted = R.k;
        if (R.j === 0) R.aim = this._aimNow();
        const h = d.handPoint(this.hand === 1, this._h);
        if (Number.isFinite(h.x + h.y + h.z)) {
          d.fx.tellFlash?.(TELL.NORMAL, h.x, h.y, h.z, 0.8, false);
          d.emit('combat:flash', { source: 'dragon', attack: a?.name ?? 'ironRain', tell: TELL.NORMAL, x: h.x, y: h.y, z: h.z, bullet: true, burst: true });
        }
      }
      const due = T0 + R.j * I.gap;
      if (R.t + 1e-6 < due) break;
      if (R.j === 0) {
        this.burst = { k: R.k, res: null, at: -1e9, landed: false };
        this.stats.bursts++;
        if (R.k > 0 && R.glinted < R.k) R.aim = this._aimNow(); // (it leaves before its glint: fixed now)
      }
      this._fire(a, TELL.NORMAL, I.damage, false, { aim: R.aim, quiet: true });
      this.stats.slugs++;
      if (++R.j >= I.per) {
        R.j = 0;
        R.k++;
      }
    }
  }

  /**
   * A slug of Iron Rain reached the hero (wokenOne.hitPlayer): THE ONE RESULT of its burst. `call(o)`
   * deals it (the duelist's hitPlayer). Returns the RESULT.
   */
  slugHit(o, call) {
    const I = this.T.ironRain, B = this.burst, d = this.d, now = fin(d.time);
    if (!B) return call(o);
    if (B.res === RESULT.PARRIED && now - B.at <= I.parryKeep) {
      // turned: the burst's slugs spark off the blade
      const c = this.game.player?.getChestPos?.((this._cv ??= new THREE.Vector3()), true);
      if (c) d.fx.guard?.(c.x, c.y, c.z, { heavy: false, deflect: true });
      return RESULT.PARRIED;
    }
    // EVERY slug is a FLINCH (`stun` / `mercy`), whatever the burst's result so far: a guard let go after a
    // blocked first slug, or a roll whose i-frames end inside the burst, never gives a full stagger. The
    // burst staggers at most once: a slug that lands inside the flinch (stun + mercy, longer than a burst)
    // hurts without staggering (player.js shotStunT). Its knock-back stays, so a raised guard pays guard,
    // never health (a no-knock-back hit is a stream, which chips health through a block)
    const r = call({ ...o, extra: { ...(o.extra ?? null), stun: I.stun, mercy: I.mercy } });
    if (r === RESULT.IGNORED) return r;
    if (r === RESULT.HIT) {
      if (B.landed) this.stats.chip++;
      B.landed = true;
      this._hitT = now;
    }
    if (B.res === null || B.res === RESULT.PARRIED) {
      // THE ONE RESULT: the first slug that finds him (or the first after a parry's sparks ran out)
      B.res = r === RESULT.CLASHED ? RESULT.PARRIED : r === RESULT.PERFECT ? RESULT.DODGED : r;
      B.at = now;
      if (B.res === RESULT.HIT) this.stats.burstHits++;
      else if (B.res === RESULT.PARRIED) this.stats.burstParried++;
      else if (B.res === RESULT.BLOCKED) this.stats.burstBlocked++;
      else if (B.res === RESULT.DODGED) this.stats.burstDodged++;
    } else if (r === RESULT.HIT) this.stats.lateHits++;
    return r;
  }

  /** Any other shot of his reached the hero: inside TUNING.shotMercy of a bullet that hit him it goes
   *  harmless (the bullets' rule: he can always act before the next thing that hurts him). */
  shotHit(o, call) {
    const now = fin(this.d.time);
    if (now - this._hitT < (this.T.shotMercy ?? 0.45)) {
      this.stats.spared++;
      return RESULT.IGNORED;
    }
    const r = call(o);
    if (r === RESULT.HIT) this._hitT = now;
    return r;
  }

  /** One shot from the hand whose turn it is, at where the hero is (a short lead on his movement);
   *  `o.aim` a fixed point instead (a burst's), `o.quiet` no cue of its own (a burst's slug). */
  _fire(a, tell, damage, heavy, o = null) {
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
    const dist = Math.hypot(p.x - x, p.z - z);
    // (a cued shot is never on the hero before its cue can count, the shot's own rule: >= 0.2 s cued, or it
    // fizzles: fired close, from the side-on aim's forward hand, it flies just slow enough to take
    // TUNING.shotCue s; a burst's quiet slug was cued by its burst's glint)
    const speed = o?.quiet ? C.speed : Math.min(C.speed, Math.max(6, (dist - C.radius - 0.45) / this.T.shotCue));
    const lead = Math.min(0.3, dist / speed) * 0.5;
    const aim = o?.aim;
    const tx = aim ? aim.x : p.x + fin(v?.x) * lead, tz = aim ? aim.z : p.z + fin(v?.z) * lead;
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
    // (the fairness guard: it hangs a moment at the muzzle, or goes uncued and harmless)
    const w = d.fairThrow(Math.max(0, dist - C.radius - 0.45) / speed, tell, a?.name ?? 'shot');
    const s = d.fx.throwShot?.({ delay: w > 0 ? w : 0,
      kind: 'blast', x, y: Math.max(0.9, Math.min(1.4, y)), z, dx: dx / l, dz: dz / l, speed, radius: C.radius, size: C.size, range: C.range,
      tell, damage, knockback: heavy ? 1.6 : 0.3, attack: a?.name ?? (heavy ? 'twoThunders' : 'ironRain'), returnable: heavy, hitKind: 'shot',
    });
    if (s) {
      if (w < 0) s.done = true;
      // (a burst's slug: its aim stays where the glint fixed it, and the burst's one cue was its glint:
      // ascendant/fx.js reads both)
      s.keepAim = !!aim;
      s.quiet = !!o?.quiet;
      s.slug = !!o?.quiet;
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
    // (the first burst's aim: fixed at the beat's own glint)
    const A = d.brain.act;
    if (D.iron === 'rain' && u <= 1 && !this._aim0 && !this.rain && A && A.t >= b.flash) this._aim0 = this._aimNow();
    // (the first burst leaves a flight before the impact: its first slug arrives on the beat's own glint + flashLead)
    if (D.iron === 'rain' && u <= 1 && !this.rain && A && A.t >= b.impact - this._flight()) this._startRain(D, A);
    if (D.iron === 'rain' && this.rain && u <= 1) this._rainStep(A, dt);
    if (D.iron === 'rain' && this.rain && u > 1) this._rainStep(A, dt);
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
    if (this.rain && (!a || !a.beats.some((b) => b.def.iron === 'rain'))) this.rain = null;
    if (this.reloading && (!a || a.name !== 'reload')) this.reloading = false;
  }
}

export { SHOT_BLOW };
