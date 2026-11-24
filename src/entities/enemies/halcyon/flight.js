import * as THREE from 'three';
import { clamp } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { perPhase } from '../duelist/realise.js';
import { TUNE as HERO_TUNE } from '../../player/player.js';

// Halcyon's flight (ADR-160): the rule that keeps a sword fight fair, the pass, the crash, the carry.
//
// THE RULE. In footwork he HOVERS at T.fly.hover (0.5 m: the engine tests zones and body circles up to
// 0.6 m), every hurt sphere in sword reach. He is out of reach (above T.fly.reach) only INSIDE a move
// that brings him back: a windup that ends in a blow at the hero, a lit beam. A move that leaves reach
// ends back at hover. Struck out of the air he drops (T.airFall); a posture break, a crash, a returned
// beam put him on the floor: the only times his feet touch it are the ones the hero earned.
// `frame()` (his brainFrame, after the brain) eases his root to the height his mode asks for, unless a
// beat of his flight is moving him (owns()). `stats` keeps the stretches out of reach (tests FLIGHT).
//
// THE PASS (Fly-By, moves.js halPass): the feint before it backs him off down his line (`back`); the
// pass leaves at impact - distance / speed, along the line fixed then, at chest height, through the
// hero's spot at the impact and `over` m on (he coasts out of it in the recovery).
//
// THE CRASH (a parry of a flying blow, a perfect dodge of a red one: halcyon.js): thrown off his line
// (±0.45 rad, away from the hero), he slides in T.crash.slide s into the first standing cover on it
// within `look` m (world.destructibles.coverAt), breaks it at his real height (BLUNT) and lies buried
// in it a stun of `stun` s by phase (60 damage, 30 posture). Nothing on the line: he skids `skid` m,
// a trench of world.impact stations behind him, stunned x skidK. `dragon:crash`.
//
// THE CARRY (See the World): caught (a hit of the grab), the hero is knocked down (his own knockdown:
// no control), carried up to T.grab.height in `up` s, held `hold` s, thrown down in `down` s through the
// nearest standing sign or car near where he fell (it breaks): 30, a knockdown whose get-up comes so the
// whole loss of control is at most T.grab.cap s. The camera keeps both in frame (cameraRig.keep).

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const ease = (u) => u * u * (3 - 2 * u);
const _v = new THREE.Vector3();

export class Flight {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.pass = { on: false };
    this.cr = { on: false };
    this.carry = { on: false };
    this.hold = 0;
    this.stats = { out: 0, outMax: 0, outFoot: 0, outPhase: [0, 0, 0], passes: 0, crashes: 0, skids: 0, carries: 0 };
    this._t = 0;
    this._o = { kind: 'blunt', by: 'player', dx: 0, dz: 0, y: 1.0, src: -1, scar: true };
    this._k = { kind: 'blunt', by: 'boss', dx: 0, dz: 0, y: 0.5, src: -1, scar: true };
  }

  get T() {
    return this.d.T;
  }

  reset() {
    this.pass.on = false;
    this.cr.on = false;
    this.carry.on = false;
    this.hold = 0;
    this.stats.out = 0;
    this.stats.outMax = 0;
    this.stats.outFoot = 0;
    this.stats.outPhase.fill(0);
  }

  /** A beat of his flight is moving him (the hover layer keeps off). */
  owns() {
    const br = this.d.brain;
    if (this.pass.on || this.cr.on || this.carry.on || this.d.terrainOwns?.()) return true;
    if (this.d.mode !== 'act' || !br.act) return false;
    if (br.leap) return true;
    const a = br.act;
    const cur = a.beats.find((b) => a.t < b.end + 1e-6);
    return !!cur && (!!cur.def.lift || !!cur.def.halPass);
  }

  /** The height his mode asks for now. */
  _want() {
    const d = this.d, br = d.brain, F = this.T.fly;
    switch (d.mode) {
      case 'sleep':
        return 6;
      case 'intro': {
        // down out of the dark to his hover over the clip
        const u = clamp(br.modeT / Math.max(0.1, (br.clip?.dur ?? 2.4) * 0.6), 0, 1);
        return 6 + (F.hover - 6) * ease(u);
      }
      case 'foot':
        return F.hover;
      case 'act': {
        const a = br.act;
        if (a?.def?.transition) {
          // on one knee through the first part of a transition, up for the scream
          const b = a.beats[0], u = b ? (a.t - b.start) / Math.max(0.05, b.impact - b.start) : 1;
          return u < 0.62 ? 0 : F.hover;
        }
        // a move spent on the floor (Meteor, the falling sky): its recovery on the ground
        if (a?.def?.grounded && a.t >= a.recoveryStart) return 0;
        return F.hover;
      }
      case 'react':
        return br.open.has(br.react?.kind) ? 0 : F.hover;
      default:
        return 0;
    }
  }

  /** Every frame, after the brain: the pass's coast, the crash, the carry, then the hover layer. */
  frame(dt) {
    const d = this.d, p = d.position;
    if (this.pass.on) this._coast(dt);
    if (this.cr.on) this._crash(dt);
    if (this.carry.on) this._carry(dt);
    if (this.hold > 0) this._hold(dt);
    if (!this.owns() && !d.brain.falling) {
      const want = this._want();
      const F = this.T.fly;
      this._t += dt;
      const bob = want > 0.2 ? F.bob * Math.sin(this._t * F.bobHz * Math.PI * 2) : 0;
      const k = 1 - Math.exp(-dt * (want < p.y ? F.ease * 1.6 : F.ease));
      p.y += (want + bob - p.y) * k;
      if (!(p.y >= 0)) p.y = 0;
    }
    d.state = d.mode === 'act' && p.y > 1.5 ? 'airborne' : d.state === 'airborne' ? 'combat' : d.state;
    // out of reach: only inside a move (tests FLIGHT)
    const out = p.y > this.T.fly.reach;
    if (out) {
      this.stats.out += dt;
      this.stats.outMax = Math.max(this.stats.outMax, this.stats.out);
      const ph = Math.min(3, Math.max(1, d.phase)) - 1;
      this.stats.outPhase[ph] = Math.max(this.stats.outPhase[ph], this.stats.out);
      if (d.mode === 'foot') this.stats.outFoot += dt;
    } else this.stats.out = 0;
  }

  /** A reaction held at its pose `sec` s (a returned beam's reel). */
  holdReact(sec) {
    this.hold = Math.max(this.hold, fin(sec, 0));
  }

  _hold(dt) {
    const br = this.d.brain, R = br.react;
    if (this.d.mode !== 'react' || !R) {
      this.hold = 0;
      return;
    }
    this.hold -= dt;
    const at = Math.min(0.9, R.clip.dur - 0.1);
    if (this.hold > 0.3) {
      if (R.t > at) R.t = at;
      if (br.clipT > at) br.clipT = at;
    }
  }

  // ---------------------------------------------------------------- the pass
  /** Fly-By's back-off (the feint before a pass): up and away along his line, `back` m off the hero. */
  back(b, u, s, dt) {
    const d = this.d, P = this.T.pass;
    if (!s) return;
    if (b._back === undefined) {
      const away = Math.atan2(d.position.x - s.p.x, d.position.z - s.p.z);
      const r = P.back[0] + (P.back[1] - P.back[0]) * Math.random();
      let tx = s.p.x + Math.sin(away) * r, tz = s.p.z + Math.cos(away) * r;
      // (inside the city: past 21 m from the middle he turns round the plaza instead)
      const l = Math.hypot(tx, tz);
      if (l > 21) {
        tx *= 21 / l;
        tz *= 21 / l;
      }
      b._back = { x0: d.position.x, z0: d.position.z, y0: d.position.y, tx, tz };
      d.fx.afterimage?.(d, 0, 0, 0.35);
      d.emit?.('dragon:takeoff');
    }
    const B = b._back, k = ease(clamp(u / 0.9, 0, 1));
    d.position.x = B.x0 + (B.tx - B.x0) * k;
    d.position.z = B.z0 + (B.tz - B.z0) * k;
    d.position.y = B.y0 + (P.y + 0.6 - B.y0) * k;
    d.yaw = Math.atan2(s.p.x - d.position.x, s.p.z - d.position.z);
    this.pass.on = false;
  }

  /** The pass's windup and its active frames: held at his end of the line, then through the hero's spot. */
  go(b, u, s, dt) {
    const d = this.d, P = this.T.pass, a = d.brain.act;
    if (!a) return;
    if (!b._go) {
      b._go = { fixed: false, x: d.position.x, z: d.position.z, y: d.position.y, tx: 0, tz: 0, dx: 0, dz: 1, leave: Infinity };
    }
    const G = b._go;
    const t = a.t;
    // the line is fixed as he leaves (the distance at his speed before the impact)
    if (!G.fixed && s) {
      const lead = d.brain._lead(s, Math.max(0, b.impact - t));
      const tx = d.position.x + lead.dx, tz = d.position.z + lead.dz;
      const dist = Math.hypot(tx - d.position.x, tz - d.position.z);
      d.yaw = Math.atan2(tx - d.position.x, tz - d.position.z);
      if (b.impact - t <= dist / P.speed + 0.02) {
        G.fixed = true;
        G.x = d.position.x;
        G.z = d.position.z;
        G.y = d.position.y;
        G.tx = tx;
        G.tz = tz;
        const l = dist || 1;
        G.dx = (tx - G.x) / l;
        G.dz = (tz - G.z) / l;
        G.leave = t;
        G.T = Math.max(0.05, b.impact - t);
        G.len = dist;
        this.stats.passes++;
        d.fx.sonic?.(d.position.x, d.position.y + 0.8, d.position.z, G.dx, G.dz);
        this.game.events?.emit?.('dragon:dash', { x: d.position.x, z: d.position.z });
      }
      return;
    }
    if (!G.fixed) return;
    // through the hero's spot at the impact, at chest height, on past it
    const k = (t - G.leave) / G.T;
    const along = G.len * k;
    d.position.x = G.x + G.dx * along;
    d.position.z = G.z + G.dz * along;
    d.position.y = G.y + (P.y - G.y) * clamp(k, 0, 1);
    d.yaw = Math.atan2(G.dx, G.dz);
    // what stands on his line is thrown aside (his body through it)
    this._sweepLine(G.x + G.dx * Math.max(0, along - P.speed * dt), G.z + G.dz * Math.max(0, along - P.speed * dt), d.position.x, d.position.z, G.dx, G.dz);
    if (u >= 1.99 || t >= b.end - dt) {
      this.pass.on = true;
      this.pass.dx = G.dx;
      this.pass.dz = G.dz;
      this.pass.left = P.over;
      this.pass.v = P.speed;
    }
    if (((t * 60) | 0) % 3 === 0) d.fx.afterimage?.(d, -G.dx * 2, -G.dz * 2, 0.3);
  }

  /** Out of a pass: on past the hero, slowing, down to his hover. */
  _coast(dt) {
    const d = this.d, P = this.pass;
    if (d.mode === 'react' || d.mode === 'broken' || d.mode === 'dying' || d.mode === 'dead' || this.cr.on) {
      P.on = false;
      return;
    }
    const step = Math.min(P.left, P.v * dt);
    P.left -= step;
    P.v = Math.max(6, P.v * Math.exp(-dt * 5));
    d.moveBy(P.dx * step, P.dz * step);
    if (P.left <= 0.05) P.on = false;
  }

  _sweepLine(ax, az, bx, bz, dx, dz) {
    const W = this.game.world?.destructibles;
    if (!W?.sweep) return;
    const o = this._k;
    o.kind = 'blunt';
    o.by = 'boss';
    o.dx = dx;
    o.dz = dz;
    o.y = 1.2;
    o.src = W.swing?.() ?? -1;
    W.sweep(ax, az, bx, bz, 0.7, this.T.world.pass, o);
  }

  // ---------------------------------------------------------------- the crash
  /** Thrown off his line (dx, dz: the way he was going) into the first cover on it. */
  crash(dx, dz, why = 'parry') {
    const d = this.d, C = this.T.crash, p = this.game.player?.position;
    if (d.mode === 'dying' || d.mode === 'dead' || this.cr.on) return false;
    let l = Math.hypot(dx, dz);
    if (!(l > 1e-3)) {
      dx = Math.sin(d.yaw);
      dz = Math.cos(d.yaw);
      l = 1;
    }
    dx /= l;
    dz /= l;
    // off his line, away from the hero
    const side = p ? Math.sign((p.x - d.position.x) * dz - (p.z - d.position.z) * dx) || 1 : 1;
    const a = Math.atan2(dx, dz) + side * 0.45;
    dx = Math.sin(a);
    dz = Math.cos(a);
    this.pass.on = false;
    const W = this.game.world?.destructibles;
    const x0 = d.position.x, z0 = d.position.z;
    const c = W?.coverAt?.(x0 + dx * 0.8, z0 + dz * 0.8, x0 + dx * C.look, z0 + dz * C.look, 0.4) ?? null;
    let tx, tz;
    if (c) {
      const t = 0.8 + (C.look - 0.8) * fin(W.coverT, 1);
      const reach = Math.max(0, t - c.r * 0.5);
      tx = x0 + dx * reach;
      tz = z0 + dz * reach;
    } else {
      tx = x0 + dx * C.skid;
      tz = z0 + dz * C.skid;
      const r = Math.hypot(tx, tz), B = d.bound + 4;
      if (r > B) {
        tx *= B / r;
        tz *= B / r;
      }
    }
    if (!d.brain.startReact('crashed')) return false;
    d.brain.falling = false;
    const st = perPhase(C.stun, d.phase) * (c ? 1 : C.skidK);
    Object.assign(this.cr, { on: true, t: 0, x0, z0, y0: d.position.y, tx, tz, dx, dz, piece: c, stun: st, hit: false, why });
    d.yaw = Math.atan2(dx, dz);
    this.stats[c ? 'crashes' : 'skids']++;
    d.emit?.('dragon:crash', { why, cover: c ? c.kind : null, x: tx, z: tz });
    d._cinematic?.('crash', { slowmo: 0.4, dur: 0.5, zoom: -6 });
    return true;
  }

  _crash(dt) {
    const d = this.d, C = this.T.crash, R = this.cr, br = d.brain;
    if (d.mode !== 'react' || br.react?.kind !== 'crashed') {
      R.on = false;
      return;
    }
    R.t += dt;
    if (R.t < C.slide) {
      const k = R.t / C.slide;
      d.position.x = R.x0 + (R.tx - R.x0) * k;
      d.position.z = R.z0 + (R.tz - R.z0) * k;
      d.position.y = R.y0 * (1 - k) + 0.3 * k;
      if (((R.t * 60) | 0) % 2 === 0) d.fx.afterimage?.(d, -R.dx, -R.dz, 0.3);
      if (!R.piece) this._skidMark(d.position.x, d.position.z, R);
      return;
    }
    if (!R.hit) {
      R.hit = true;
      d.position.x = R.tx;
      d.position.z = R.tz;
      d.position.y = 0;
      const W = this.game.world, D = W?.destructibles, c = R.piece;
      if (c && D) {
        const o = this._o;
        o.dx = R.dx;
        o.dz = R.dz;
        o.y = clamp(1.0, c.y0 + 0.2, c.y0 + c.h);
        o.by = 'player'; // (the hero's answer put him there: what explodes there is the hero's)
        o.src = D.swing?.() ?? -1;
        D.strike(c.x, c.z, Math.max(0.6, c.r * 0.6), C.power, o);
        W.impact?.(R.tx, R.tz, 1.4, 1.0, o);
      }
      d.fx.crashBurst?.(R.tx, 1.0, R.tz, R.dx, R.dz, c ? 1 : 0.7);
      this.game.shake?.(c ? 0.55 : 0.35);
      d.hurt?.(c ? C.damage : Math.round(C.damage * 0.6), c ? C.posture : Math.round(C.posture * 0.6), 'crash');
      R.left = R.stun;
    }
    // buried: the clip held on its lying pose for the stun, then up
    R.left -= dt;
    const Rx = br.react, hold = 1.15;
    if (R.left > 0 && Rx) {
      if (Rx.t > hold) Rx.t = hold;
      if (br.clipT > hold) br.clipT = hold;
    }
    if (R.left <= 0) R.on = false;
  }

  _skidMark(x, z, R) {
    const W = this.game.world;
    const key = Math.round(x * 1.2) * 4096 + Math.round(z * 1.2);
    if (R.last === key) return;
    R.last = key;
    const o = this._k;
    o.kind = 'blunt';
    o.by = 'player';
    o.dx = R.dx;
    o.dz = R.dz;
    o.y = 0.3;
    o.src = W?.destructibles?.swing?.() ?? -1;
    o.mark = 'dash'; // (its floor mark: a furrow the way he skids, not a crater; scars.mark)
    o.len = 1.1;
    W?.impact?.(x, z, 0.7, 0.8, o);
    o.mark = undefined;
    o.len = undefined;
  }

  // ---------------------------------------------------------------- the carry (See the World)
  /** The grab landed: up with the hero, a hold, down through the street. */
  grab() {
    const d = this.d, pl = this.game.player;
    if (!pl?.position || this.carry.on) return false;
    const G = this.T.grab;
    this.carry.on = true;
    this.carry.t = 0;
    this.carry.x = pl.position.x;
    this.carry.z = pl.position.z;
    this.carry.hit = false;
    this.carry.target = null;
    this.stats.carries++;
    d.emit?.('dragon:grab', { x: pl.position.x, z: pl.position.z });
    void G;
    return true;
  }

  _carry(dt) {
    const d = this.d, G = this.T.grab, C = this.carry, pl = this.game.player, p = pl?.position;
    if (!p || !pl.alive || d.mode === 'dying' || d.mode === 'dead' || d.mode === 'broken') {
      this._release();
      return;
    }
    C.t += dt;
    const up = G.up, hold = G.hold, down = G.down;
    // the hero stays down (his own knockdown, before its get-up i-frames)
    if (pl.state === 'knockdown' && pl.stateT > 0.35 && !C.hit) pl.stateT = 0.35;
    let h;
    if (C.t < up) h = G.height * ease(C.t / up);
    else if (C.t < up + hold) h = G.height;
    else h = G.height * (1 - Math.min(1, (C.t - up - hold) / down) ** 2);
    // where he comes down: the nearest standing sign or car to where he was taken
    if (!C.target && C.t >= up) {
      const W = this.game.world?.destructibles;
      C.target = W?.nearest?.(C.x, C.z, { maxDist: 9, kind: 'sign' }) ?? W?.nearest?.(C.x, C.z, { maxDist: 9, kind: 'car' }) ?? null;
      C.tx = C.target ? C.target.x : C.x;
      C.tz = C.target ? C.target.z : C.z;
    }
    const k = C.t < up + hold ? 0 : Math.min(1, (C.t - up - hold) / down);
    const x = C.target ? C.x + (C.tx - C.x) * k : C.x, z = C.target ? C.z + (C.tz - C.z) * k : C.z;
    if (!C.hit) {
      p.x = x;
      p.z = z;
      p.y = h;
      // he holds the hero up at arm's length, above him
      d.position.x = x + Math.sin(d.yaw) * -0.7;
      d.position.z = z + Math.cos(d.yaw) * -0.7;
      d.position.y = Math.max(0.5, h - 0.4);
      this.game.cameraRig?.keep?.(x, h * 0.5, z, 2 + h * 0.4, true);
    }
    if (C.t >= up + hold + down && !C.hit) {
      C.hit = true;
      p.y = 0;
      const W = this.game.world, D = W?.destructibles;
      if (C.target && D) {
        const o = this._k;
        o.kind = 'blunt';
        o.by = 'boss';
        o.dx = 0;
        o.dz = 0;
        o.y = Math.min(2.5, C.target.y0 + C.target.h * 0.6);
        o.src = D.swing?.() ?? -1;
        D.strike(C.target.x, C.target.z, Math.max(0.5, C.target.r), 4, o);
      }
      W?.impact?.(x, z, 1.6, 1.2, this._k);
      d.fx.crater?.(x, z, 1.8, 1.2);
      this.game.shake?.(0.6);
      // the slam lands first (the get-up's last 0.5 s are i-frames: set before it, the slam came back DODGED) ...
      d.hitPlayer({ damage: G.damage, knockback: G.knockback, knockdown: true, kind: 'crush', tell: TELL.RED, attack: 'seeTheWorld', from: { x: x - Math.sin(d.yaw), z: z - Math.cos(d.yaw) }, parryable: false, blockable: false, extra: { perfect: false } });
      // ... then the get-up comes so the whole loss of control is at most G.cap
      const dur = HERO_TUNE?.knockdownDur ?? 1.3, left = Math.max(0.3, G.cap - C.t);
      if (pl.state === 'knockdown') pl.stateT = Math.max(0, dur - left);
      C.on = false;
    }
  }

  _release() {
    const p = this.game.player?.position;
    if (p && p.y > 0) p.y = 0;
    this.carry.on = false;
  }

  /** The Lab / a reset mid-carry: the hero back on the floor. */
  stop() {
    if (this.carry.on) this._release();
    this.cr.on = false;
    this.pass.on = false;
  }
}

void RESULT;
void _v;
