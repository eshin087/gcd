import * as THREE from 'three';
import { TELL, RESULT } from '../../../combat/rules.js';
import { CONFIG } from '../../../core/config.js';
import { perPhase } from '../duelist/realise.js';

// Xin Yi in the Source (phase 3; ADR-156): what he does with the written world.
//   THE STOP    a palm bolt of his (moves.js `bolt`, a returnable blast) struck back by a perfect parry
//               does not bend him now: as it comes within reach of his chest he raises the palm and it
//               HANGS before him (rooted TUNING.stop.root s: the `stop` reaction; + stop.posture each).
//               Up to stop.max hang; unsent after stop.life s they drop as loose digits (harmless).
//   RETURN TO SENDER (`send`): with three hanging they turn and fly at the hero together: ONE blow of the
//               brain's (one blue flare, one result; wokenOne.hitPlayer → sent(r)): a parry bursts them all
//               and pays his posture stop.sendPosture each (the counter is the flare's); a held guard pays
//               one blow's guard; a roll clears it (they fly on past).
//   UNWRITING (`unwrite`, a cast): bricks torn out of up to three code pillars near him (a bite each:
//               destructibles.strike), held in the air over them, thrown one by one TUNING.unwriting.gap s
//               apart: the Lord's torn stones (fx.throwShot 'stone': the red flare on each flying piece as
//               it nears the hero, no ground mark; the cue ledger reads fx.shots)
//   FLIGHT      Leaving the Floor (`rise`): the burst ring as he goes up; he hangs (the beats' `lift`) and
//               the camera eases back so both stay in frame (cameraPull, main.js); then the FALLING FIST
//               (`fist`: the spot fixed at u 0.7, the dive onto it, the crater, then THE FRONT: a ring
//               running out from flight.fist.front.from to .to m at .speed m/s that heaves and cracks each
//               floor slab it crosses and strikes the hero ONCE as it reaches him, cued flashLead before;
//               told to the ledger as it starts) or the LOW PASS (`pass`: the line fixed at u 0.7 by the
//               beat's `track`, one flat pass along it; the uprights on it are swept)
//   THE DIVE WITHIN (`dive`): the hall's letters stream into his chest through the charge (fx.diveStream)
// Game rolls never draw Math.random (the stones' order is the pillars' distance).

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const FRONT_BLOW = { kind: 'blunt', by: 'boss', y: 0.4, dx: NaN, dz: NaN, src: -1, down: true, scar: false };

export class SourceMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T;
    this.held = []; // { s (its fx.shots record), age, x, y, z }
    this._near = [];
    this._c = new THREE.Vector3();
    this._slabs = [];
    this.front = { live: false, x: 0, z: 0, r: 0, hit: false, flashed: false, h: null, attack: 'fallingFist', fx: 0 };
    this.fist = null; // { x, z } the spot the Falling Fist dives on
    this.reset();
  }

  reset() {
    this.drop();
    this.fist = null;
    this.d.cameraPull = 0;
  }

  /** Everything hanging falls, the front dies out (the fall, a reset, his death). */
  drop() {
    for (const h of this.held) this._release(h, false);
    this.held.length = 0;
    const F = this.front;
    F.live = false;
    F.h?.cancel?.();
    F.h = null;
  }

  begin(A) {
    if (!A.def.beats.some((b) => b.fist || b.pick?.some((x) => x.fist))) this.fist = null;
  }

  /** Unwriting can start: a code pillar standing within unwriting.near m. */
  canUnwrite() {
    const W = this.game.world?.destructibles;
    if (!W?.nearest) return false;
    return !!W.nearest(this.d.position.x, this.d.position.z, { maxDist: this.T.unwriting.near, kind: 'codePillar' });
  }

  // ---------------------------------------------------------------- the stop
  /** The Lab: n bolts hanging at once. */
  holdDebug(n = 3) {
    const d = this.d;
    for (let i = 0; i < n && this.held.length < this.T.stop.max; i++) {
      const s = d.fx.throwShot?.({ kind: 'blast', x: d.position.x, y: 1.3, z: d.position.z, dx: Math.sin(d.yaw), dz: Math.cos(d.yaw), speed: 0, radius: 0.5, size: this.T.bolt.size, tell: TELL.BLUE, damage: 16, attack: 'pushingHands' });
      if (s) this._hold(s, true);
    }
    return this.held.length;
  }

  /** A returned bolt within reach of his chest: it hangs (false: he cannot hold another). */
  _hold(s, quiet = false) {
    const d = this.d, S = this.T.stop;
    if (this.held.length >= S.max) return false;
    s.phase = 'push'; // (AscFx: a blast held where it is: its flight and drawing are ours)
    s.done = true;
    s.returned = false;
    s.held = true;
    const i = this.held.length, fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
    const side = (i - 1) * 0.55;
    const h = { s, age: 0, x: d.position.x + fx * 1.1 + lx * side, y: 1.35 + (i === 1 ? 0.25 : 0), z: d.position.z + fz * 1.1 + lz * side };
    s.x = h.x;
    s.y = h.y;
    s.z = h.z;
    this.held.push(h);
    if (quiet) return true;
    d.fx.stopHum?.(h.x, h.y, h.z);
    d.addPosture(S.posture);
    d.brain.startReact('stop');
    d.emit('dragon:stop', { held: this.held.length });
    return true;
  }

  /** A held bolt let go: `fly` false: it drops as loose digits (fx), else it was sent. */
  _release(h, fly) {
    const s = h.s;
    if (!s) return;
    s.held = false;
    if (!fly) {
      s.alive = false;
      this.d.fx.sendBurst?.(h.x, h.y * 0.5, h.z);
    }
  }

  /** Return to Sender's blow was answered (wokenOne.hitPlayer): ONE result for all of them. */
  sent(r) {
    const d = this.d, n = this.held.length, p = this.game.player;
    const c = p?.getChestPos?.(this._c, true) ?? p?.position;
    for (const h of this.held) {
      if (c) d.fx.sendBurst?.(c.x, fin(c.y, 1.2), c.z);
      h.s.alive = false;
    }
    this.held.length = 0;
    if (r === RESULT.PARRIED) d.addPosture(this.T.stop.sendPosture * n);
    d.emit('dragon:sent', { count: n, result: r });
  }

  // ---------------------------------------------------------------- the hooks
  onImpact(b, s, a) {
    const D = b.def, d = this.d, fx = d.fx, WT = this.T.world;
    const W = this.game.world;
    if (D.rise) {
      fx.riseBurst?.(d.position.x, d.position.z, D.zone?.r ?? 4);
      this.game.shake?.(0.3);
      return true;
    }
    if (D.fist) {
      // the crater where he lands, then THE FRONT
      const F = this.T.flight.fist;
      fx.crater?.(d.position.x, d.position.z, F.crater * 0.6, 1);
      W?.impact?.(d.position.x, d.position.z, F.crater * 0.7, WT.crater, { kind: 'blunt', by: 'boss', y: 0.4, src: W.destructibles?.swing?.() ?? -1 });
      this.game.shake?.(0.5);
      this._startFront(d.position.x, d.position.z, a?.name ?? 'leaveFloor');
      return true;
    }
    if (D.pass) {
      // the uprights on the line are swept
      const L = this.T.flight.lowPass, fxd = Math.sin(d.yaw), fzd = Math.cos(d.yaw);
      const Wd = W?.destructibles;
      Wd?.sweep?.(d.position.x, d.position.z, d.position.x + fxd * L.len, d.position.z + fzd * L.len, L.w * 0.5, WT.lowPass, { kind: 'blunt', by: 'boss', y: 1.0, dx: fxd, dz: fzd, src: Wd.swing?.() ?? -1 });
      fx.passWake?.(d.position.x, d.position.z, d.position.x + fxd * L.len, d.position.z + fzd * L.len, L.y);
      return false; // (the brain's line decides the hero)
    }
    return false;
  }

  /** A cast beat: a bolt, or Unwriting's bricks (true: handled). */
  onCast(b, s, a) {
    const D = b.def;
    if (D.cast?.kind === 'bolt') {
      this._bolt(a, D);
      return true;
    }
    if (D.cast?.kind === 'unwrite') {
      this._unwrite(a, D);
      return true;
    }
    return false;
  }

  _bolt(a, D) {
    const d = this.d, p = this.game.player?.position;
    if (!p) return;
    const h = d.handPoint(false, this._c), C = this.T.bolt;
    let x = h.x, y = h.y, z = h.z;
    if (!Number.isFinite(x + y + z)) {
      x = d.position.x;
      y = 1.2;
      z = d.position.z;
    }
    const dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1;
    const sh = d.fx.throwShot?.({
      kind: 'blast', x, y: clamp(y, 1.0, 1.4), z, dx: dx / l, dz: dz / l, speed: C.speed, radius: C.radius, size: C.size, range: C.range,
      tell: TELL.BLUE, damage: D.damage ?? 16, knockback: 1.4, attack: a?.name ?? 'pushingHands', returnable: true, hitKind: 'thrown',
    });
    if (sh) {
      sh.bolt = true;
      d.fx.muzzle?.(x, y, z, dx / l, dz / l, 0.7, 3);
    }
  }

  /** Unwriting: bricks out of the nearest code pillars, held over them, thrown one by one. */
  _unwrite(a, D) {
    const d = this.d, Wd = this.game.world?.destructibles, U = this.T.unwriting;
    if (!Wd?.list) return;
    const near = this._near;
    near.length = 0;
    for (const b of Wd.list) {
      if (b.kind !== 'codePillar' || b.state !== 0 || b.absent) continue;
      const dist = Math.hypot(b.x - d.position.x, b.z - d.position.z);
      if (dist <= U.near) near.push({ b, dist });
    }
    near.sort((p, q) => p.dist - q.dist);
    const n = Math.min(U.count, near.length);
    for (let i = 0; i < n; i++) {
      const b = near[i].b;
      // a bite out of the pillar where the brick was torn
      Wd.strike?.(b.x, b.z, b.r + 0.2, this.T.world.brick * 0.5, { kind: 'blunt', by: 'boss', y: 2.2, src: Wd.swing?.() ?? -1 });
      d.fx.throwShot?.({
        kind: 'stone', x: b.x, y: 2.2, z: b.z, dx: 0, dz: 1, speed: U.speed, radius: 0.55, tell: TELL.RED, damage: D.damage ?? U.damage, knockback: 2.4,
        attack: a?.name ?? 'unwriting', delay: U.first + i * U.gap, rise: 3.0, range: 26, big: false,
      });
    }
    d.emit('dragon:unwrite', { count: n });
  }

  // ---------------------------------------------------------------- the front
  _startFront(x, z, attack) {
    const F = this.front, P = this.T.flight.fist.front, d = this.d, p = this.game.player?.position;
    F.live = true;
    F.x = x;
    F.z = z;
    F.r = P.from;
    F.hit = false;
    F.flashed = false;
    F.attack = attack;
    F.h?.cancel?.();
    F.h = null;
    if (p) {
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist >= P.from && dist <= P.to) F.h = d.brain.expect?.((dist - P.from) / P.speed, TELL.RED, attack) ?? null;
    }
  }

  _frontStep(dt) {
    const F = this.front, P = this.T.flight.fist.front, d = this.d, pl = this.game.player, p = pl?.position;
    if (!F.live) return;
    const r0 = F.r;
    F.r += P.speed * dt;
    // the slabs it crosses heave and crack
    const Wd = this.game.world?.destructibles;
    if (Wd?.floorNear) {
      const n = Wd.floorNear(F.x, F.z, F.r + 0.6, this._slabs, { max: 24 });
      for (let i = 0; i < n; i++) {
        const b = this._slabs[i], dist = Math.hypot(b.x - F.x, b.z - F.z);
        if (dist < r0 - 0.6 || dist > F.r + 0.6) continue;
        FRONT_BLOW.src = Wd.swing?.() ?? -1;
        Wd.strike?.(b.x, b.z, 0.3, this.T.world.front, FRONT_BLOW);
      }
    }
    d.fx.front?.(F.x, F.z, F.r, P.width, dt);
    if (p && !F.hit && pl.alive !== false) {
      const dist = Math.hypot(p.x - F.x, p.z - F.z);
      const lead = perPhase(this.T.flashLead, d.phase);
      if (!F.flashed && dist >= F.r && dist - F.r <= P.speed * lead && dist <= P.to) {
        F.flashed = true;
        d.emit('combat:flash', { source: 'dragon', attack: F.attack, tell: TELL.RED, x: p.x, y: 0.4, z: p.z, hazard: true });
        d.fx.hazardFlash?.(TELL.RED, p.x, 0.4, p.z);
      }
      if (dist >= r0 - P.width && dist <= F.r + P.width && dist >= P.from) {
        F.hit = true;
        if (F.flashed) {
          d.hitPlayer({ damage: P.damage, knockback: 3, knockdown: true, kind: 'crush', tell: TELL.RED, attack: F.attack, from: { x: F.x, z: F.z }, projectile: true });
        }
      }
    }
    if (F.r >= P.to) {
      F.live = false;
      F.h = null;
    }
  }

  // ---------------------------------------------------------------- motion
  /** Every frame of a beat: the Falling Fist's dive on the fixed spot. */
  motion(b, u, s, dt) {
    const D = b.def, d = this.d;
    if (D.fist) {
      if (u >= 0.7 && !this.fist && s) this.fist = { x: s.p.x, z: s.p.z, x0: d.position.x, z0: d.position.z };
      if (this.fist && u < 1) {
        const k = clamp((u - 0.7) / 0.3, 0, 1), e = k * k;
        d.position.x = this.fist.x0 + (this.fist.x - this.fist.x0) * e;
        d.position.z = this.fist.z0 + (this.fist.z - this.fist.z0) * e;
        d.moveBy(0, 0);
      }
    }
    if (D.pass && u > 1 && u < 2) {
      // one flat pass along the line he faced at u 0.7 (the beat's `track`)
      const L = this.T.flight.lowPass, step = (L.len / Math.max(0.05, b.A ?? 0.35)) * dt;
      d.moveBy(Math.sin(d.yaw) * step, Math.cos(d.yaw) * step);
    }
  }

  // ---------------------------------------------------------------- every frame
  frame(dt) {
    const d = this.d, S = this.T.stop;
    // a returned bolt within reach: it stops
    if (d.phase >= 3 && d.mode !== 'dying' && d.mode !== 'dead' && !d._changing) {
      const c = d.lockPoint(this._c);
      for (const s of d.fx.shots ?? []) {
        if (!s.alive || !s.returned || s.held || s.kind !== 'blast') continue;
        const l = Math.hypot(s.x - c.x, s.y - c.y, s.z - c.z);
        if (l < 2.4 && l > 0.6) this._hold(s);
      }
    }
    // what hangs: it ages; unsent it drops
    for (let i = this.held.length - 1; i >= 0; i--) {
      const h = this.held[i];
      h.age += dt;
      if (!h.s.alive || h.age > S.life) {
        this._release(h, false);
        this.held.splice(i, 1);
      }
    }
    this._frontStep(dt);
    // the camera: both in frame while he is up in the air
    const up = d.position.y > 1.2 && d.mode === 'act';
    const want = up ? this._pairZoom() : 0;
    d.cameraPull += (want - d.cameraPull) * Math.min(1, dt * this.T.flight.zoom.ease);
    if (!(d.cameraPull > 0.01)) d.cameraPull = 0;
  }

  /** The extra camera distance that keeps him and the hero in frame (kiBeam.js _pairZoom's). */
  _pairZoom() {
    const rig = this.game.cameraRig, cam = this.game.camera, d = this.d, p = this.game.player?.position;
    if (!rig || !p) return 0;
    const tanV = Math.tan(((Number.isFinite(cam?.fov) ? cam.fov : CONFIG.camera.fov) * Math.PI) / 360);
    const asp = Number.isFinite(cam?.aspect) && cam.aspect > 0.2 ? cam.aspect : 16 / 9;
    const pitch = fin(rig.pitch, CONFIG.camera.pitch);
    const m = 1.5;
    const hx = Math.abs(p.x - d.position.x) / 2 + m, hz = Math.abs(p.z - d.position.z) / 2 + m + d.position.y * 0.4;
    const need = Math.max(hx / (tanV * asp * 0.88), (hz * Math.sin(pitch) + 1.2 + d.position.y) / (tanV * 0.78));
    const base = fin(rig.targetDistance, CONFIG.camera.distance);
    return Math.min(this.T.flight.zoom.max, Math.max(0, need - base));
  }

  /** After the pose: the hanging bolts; the dive's stream. */
  draw(dt) {
    const d = this.d;
    for (const h of this.held) {
      h.s.x = h.x;
      h.s.y = h.y + Math.sin(h.age * 3 + h.x) * 0.03;
      h.s.z = h.z;
      d.fx.heldBolt?.(h.s.x, h.s.y, h.s.z, 1, dt);
    }
    const a = d.brain.act;
    if (a) {
      for (const b of a.beats) {
        if (!b.def.dive || b.feint || a.t >= b.flash || a.t < b.start) continue;
        d.fx.diveStream?.(d, clamp((a.t - b.start) / Math.max(0.05, b.flash - b.start), 0, 1), dt);
      }
    }
  }
}
