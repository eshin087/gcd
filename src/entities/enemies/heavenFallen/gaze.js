import * as THREE from 'three';
import { clamp, wrapAngle, turnToward } from '../../../core/math.js';
import { TELL, RESULT, DEFENSE, GUARD, facingDelta } from '../../../combat/rules.js';
import { BLOW } from '../../../world/breakTuning.js';
import { perPhase } from '../duelist/realise.js';

// Qian Yao's eyes (ADR-133; COMBAT.md "Qian Yao" → "His eyes"): the beat field `gaze: { kind }`
// (moves.js) routes a beat's hooks here (fallen.js). The model is Tian Lei's BeamMoves
// (ascendant/kiBeam.js): `selfHit` + `sustain` beats, the beam living on its own record `B` that is
// tested and drawn in frame(). Drawn as heat in the fire field from two points at his eyes (fxGaze.js
// through FallenFx: a white-hot core in `steel`, a gold sheath, a boiling knot where it meets the floor).
//
//   focus  Heaven's Gaze. Through the windup he tracks the hero until `fix` of it; two points of light
//          grow at his eyes (the tell is on HIM). Lit at the impact: the FIRST CONTACT is a blue blow
//          (a parry turns it, a PERFECT parry sends it back: 50 damage, 34 posture, an eclipse,
//          `dragon:returned`; a block costs guard). Cover stops it (the line ends at the first cover).
//   sweep  The Sweeping Gaze (and each half of Crossed Gaze). The line LIGHTS at the beat's flash (its
//          cue) `lead` s before it crosses where the hero stands, at an angle that its angular speed
//          brings onto him at the impact, and sweeps on across `arc` deg. It hits once, red, knocking
//          down, anywhere along it from `blind` m out to its end or the first cover; never before its
//          cue, never a hero inside `blind` m of his eyes' foot, never a rolling hero (the player's own
//          i-frames).
//   high   Gaze from on High. He rises; at the lock (`mark` s before the foot moves) the line through
//          where the hero stands is marked on the floor in red strokes; the foot runs along it at
//          `speed` m/s, reaching that spot at the impact. Its foot hits (r m) once, from the cue on.
//   bore   He Opens the Sky. No blow from the beam: at the impact it bores a well over him
//          (world.sun.bore) and calls three stones down near the hero (fx.callStrike: marked, red, told
//          to the ledger by the pool, held by the fairness guard).
// Every lit beam bites the world every T.gaze.worldEvery s: the line ends at the first cover
// (destructibles.coverAt), the cover takes `world.gaze`, the floor under its foot is swept (`down`),
// scarred every T.seam.step m (world.scars.ground), scorched, and wood there catches (world.ignite).
// From phase 2 the cut lingers as a molten seam (seams.js).

const DEG = Math.PI / 180;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class GazeMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._wo = { kind: BLOW.BLAST, by: 'boss', dx: 0, dz: 0, y: 0.6, src: -1, down: true, scar: false };
    this.B = { on: false, phase: 'off' };
    this.stats = { beams: 0, first: 0, parried: 0, returned: 0, blocked: 0, hits: 0, covered: 0, bores: 0, stones: 0 };
  }

  get T() {
    return this.d.T.gaze;
  }

  reset() {
    this.B.on = false;
    this.B.phase = 'off';
  }

  /** A beam is lit or fading (tests wait for it). */
  get busy() {
    return !!this.B.on;
  }

  // ---------------------------------------------------------------- the windup (every frame of the beat)
  motion(b, u, s, dt) {
    const g = b.def.gaze, d = this.d, a = d.brain.act;
    if (!g) return;
    const eye = this._eye(this._v);
    if (g.kind === 'focus') {
      if (u < 1) {
        const fix = this.T.focus.fix;
        if (!b._fixed && s) {
          d.yaw = turnToward(d.yaw, s.ang, perPhase(d.T.move.trackTurn, d.phase) * Math.max(dt, 1e-4));
          if (u >= fix) {
            b._fixed = true;
            b._yaw = d.yaw;
          }
        } else if (b._fixed) d.yaw = b._yaw;
        d.fx.eyesCharge?.(d, clamp(u / 0.95, 0, 1), dt, b._fixed);
      } else if (b._fixed) d.yaw = b._yaw;
      return;
    }
    if (g.kind === 'sweep') {
      const C = this.T.sweep, lead = perPhase(d.T.flashLead, d.phase);
      if (!b._sw) {
        // (the eyes charge through the windup until the line lights at the cue)
        if (a && a.t < b.flash) {
          if (s) d.yaw = turnToward(d.yaw, s.ang, perPhase(d.T.move.trackTurn, d.phase) * Math.max(dt, 1e-4));
          d.fx.eyesCharge?.(d, clamp((a.t - b.start) / Math.max(0.05, b.flash - b.start), 0, 1), dt, false);
          return;
        }
        // the cue: the line lights `lead` s before it reaches the hero's bearing
        const rate = (C.arc * DEG) / C.dur, toward = s ? s.ang : d.yaw;
        let sign = g.side ?? 0;
        if (!sign) sign = Math.random() < 0.5 ? -1 : 1;
        b._sw = { sign, rate, a0: wrapAngle(toward - sign * rate * lead), t0: a?.t ?? 0 };
        this._light(b, a, 'sweep', b._sw.a0);
      }
      const S = b._sw, el = clamp((a?.t ?? 0) - S.t0, 0, C.dur);
      d.yaw = wrapAngle(S.a0 + S.sign * S.rate * el);
      return;
    }
    if (g.kind === 'high') {
      const C = this.T.high, t = a?.t ?? 0;
      const runAt = b.impact - C.before / C.speed, lockAt = runAt - C.mark;
      if (!b._line && t >= lockAt && s) {
        // the lock: the line through where the hero stands, from his side of the hero on past him
        const dx = s.p.x - d.position.x, dz = s.p.z - d.position.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
        b._line = { x0: s.p.x - ux * C.before, z0: s.p.z - uz * C.before, ux, uz, len: C.len, t0: runAt };
        d.fx.lineMark?.(b._line.x0, b._line.z0, ux, uz, C.len, C.mark + C.len / C.speed + 0.2);
      }
      if (b._line) d.yaw = turnToward(d.yaw, Math.atan2(b._line.x0 + b._line.ux * C.before - d.position.x, b._line.z0 + b._line.uz * C.before - d.position.z), 6 * Math.max(dt, 1e-4));
      else if (s) d.yaw = turnToward(d.yaw, s.ang, 8 * Math.max(dt, 1e-4));
      if (!b._lit && b._line && t >= runAt) {
        b._lit = true;
        this._light(b, a, 'high', d.yaw);
      }
      if (!b._lit) d.fx.eyesCharge?.(d, clamp((t - b.start) / Math.max(0.05, runAt - b.start), 0, 1), dt, !!b._line);
      return;
    }
    if (g.kind === 'bore') {
      // (the bore's beat is a feint for the brain: no blow; it breaches the rock here at its impact)
      if (u < 1) d.fx.eyesCharge?.(d, clamp(u, 0, 1), dt, false, true);
      else if (!b._bored) {
        b._bored = true;
        this._bore(b, s);
      }
    }
    void eye;
  }

  /** The beat's impact: the focus beam lights; the bore breaches the rock. */
  onImpact(b, s, a) {
    const g = b.def.gaze, d = this.d;
    if (!g) return;
    if (g.kind === 'focus') {
      if (b._fixed) d.yaw = b._yaw;
      this._light(b, a, 'focus', d.yaw);
      return;
    }
    if (g.kind === 'bore') this._bore(b, s);
  }

  /** The beam lights now. */
  _light(b, a, kind, yaw) {
    const d = this.d, B = this.B;
    const C = kind === 'focus' ? this.T.focus : kind === 'sweep' ? this.T.sweep : this.T.high;
    B.on = true;
    B.phase = 'lit';
    B.kind = kind;
    B.C = C;
    B.beat = b;
    B.act = a;
    B.attack = a?.name ?? 'gaze';
    B.tell = b.def.tell;
    B.t = 0;
    B.first = false;
    B.hit = false;
    B.lit = Math.max(0.1, b.end - (a?.t ?? b.impact));
    B.worldNext = 0;
    B.fadeT = 0;
    B.scarAt = 0;
    B.yaw = yaw;
    B.len = C.len;
    B.line = b._line ?? null;
    const D = this.game.world?.destructibles;
    this._wo.src = D?.swing?.() ?? -1;
    this.stats.beams++;
    this._origin();
    d.fx.gazeFlash?.(B.sx, B.sy, B.sz);
    this.game.shake?.(kind === 'focus' ? 0.18 : 0.12);
    d.emit?.('dragon:spell', { name: B.attack, x: B.ox, z: B.oz });
  }

  /** Every frame after the brain. */
  frame(dt) {
    const B = this.B;
    if (!B.on) return;
    try {
      if (B.phase === 'lit') this._lit(dt);
      else this._fade(dt);
    } catch (err) {
      console.error('[fallen] gaze frame failed', err);
      B.on = false;
      B.phase = 'off';
    }
  }

  /** Where his eyes are for the game (the upright body: just ahead of his root, at his eyes' height;
   *  the drawn eyes lean with the camera and are only where the beam is DRAWN from), into `out`. */
  _eye(out) {
    const d = this.d, fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    return out.set(d.position.x + fx * 0.25, d.position.y + this.T.eyeY, d.position.z + fz * 0.25);
  }

  _origin() {
    const B = this.B, d = this.d, e = this._eye(this._v);
    B.ox = e.x;
    B.oy = e.y;
    B.oz = e.z;
    if (B.kind !== 'high') B.yaw = d.yaw;
    B.dx = Math.sin(B.yaw);
    B.dz = Math.cos(B.yaw);
    // the drawn eyes (the beam is drawn from between them)
    const E = d.fx.eyePoints?.();
    if (E && Number.isFinite(E.lx + E.ly + E.lz + E.rx + E.rz)) {
      B.sx = (E.lx + E.rx) / 2;
      B.sy = E.ly;
      B.sz = (E.lz + E.rz) / 2;
    } else {
      B.sx = B.ox;
      B.sy = B.oy;
      B.sz = B.oz;
    }
  }

  _lit(dt) {
    const d = this.d, B = this.B, C = B.C;
    // the move ended under him (a stagger, a break, an eclipse's reel, the Lab): the beam goes out
    if (d.brain.act !== B.act || d.mode !== 'act') {
      this._toFade();
      return;
    }
    B.t += dt;
    this._origin();
    const p = this.game.player, pp = p?.position;
    const a = B.act, b = B.beat;
    // where the beam's foot is (focus / sweep: the floor at the line's end; high: running along its line)
    let fx0, fz0, fx1, fz1;
    if (B.kind === 'high' && B.line) {
      const L = B.line, run = clamp((a.t - L.t0) * C.speed, 0, L.len);
      fx1 = L.x0 + L.ux * run;
      fz1 = L.z0 + L.uz * run;
      fx0 = fx1;
      fz0 = fz1;
      B.foot = run;
    } else {
      const start = B.kind === 'sweep' ? C.blind : 0.6;
      fx0 = B.ox + B.dx * start;
      fz0 = B.oz + B.dz * start;
      // the line ends at the first cover on it (a pillar, a stele, a windlass)
      const W = this.game.world?.destructibles;
      let len = C.len;
      // (the strip is C.w wide: a cover that touches it ends it)
      const cv = W?.coverAt?.(B.ox, B.oz, B.ox + B.dx * len, B.oz + B.dz * len, (C.w ?? 1.1) * 0.5);
      if (cv) {
        const t = fin(W.coverT, NaN);
        len = Number.isFinite(t) ? Math.max(0.8, t * len) : Math.max(0.8, Math.hypot(cv.x - B.ox, cv.z - B.oz) - (cv.r ?? 0.5) * 0.6);
        B.cover = cv;
      } else B.cover = null;
      B.len = len;
      fx1 = B.ox + B.dx * len;
      fz1 = B.oz + B.dz * len;
    }
    B.ex = fx1;
    B.ez = fz1;
    // the hero
    if (p?.alive !== false && pp && !B.hit) {
      if (B.kind === 'focus') {
        if (!B.first && B.t <= (b?.A ?? 0.12) + dt * 0.5) {
          if (this._onLine(pp, fx0, fz0, fx1, fz1, C.w)) {
            B.first = true;
            this._focusContact(p);
            if (!B.on) return;
          }
        }
      } else if (a.t >= b.flash - 1e-4) {
        const inside = B.kind === 'high' ? Math.hypot(pp.x - fx1, pp.z - fz1) <= C.r + (p.radius ?? 0.45) : this._onLine(pp, fx0, fz0, fx1, fz1, C.w);
        if (inside) this._redContact(p, B.kind === 'high' ? { x: fx1 - B.dx, z: fz1 - B.dz } : { x: B.ox, z: B.oz });
      }
    }
    // the world, and the cut it leaves
    if (B.t >= B.worldNext) {
      B.worldNext += this.T.worldEvery;
      this._world(fx1, fz1, dt);
    }
    // drawn (fxGaze.js): the core and the sheath from his eyes to the foot, the knot where it meets
    const k = clamp(B.t / 0.06, 0, 1);
    d.fx.gaze?.(B.sx, B.sy, B.sz, fx1, 0.25, fz1, C.w ?? 1.1, k, dt, B.kind);
    if (B.t >= B.lit) this._toFade();
  }

  /** Is (p) on the strip a -> b, `w` wide (the hero's radius added)? */
  _onLine(pp, ax, az, bx, bz, w) {
    const pr = this.game.player?.radius ?? 0.45, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    const ox = pp.x - ax, oz = pp.z - az, along = ox * ux + oz * uz, across = -ox * uz + oz * ux;
    return along >= -pr && along <= L + pr && Math.abs(across) <= w / 2 + pr;
  }

  _facing(p) {
    const B = this.B, half = DEFENSE.blockArc * 0.5, q = p.position;
    return facingDelta(p.yaw, q.x, q.z, B.ox, B.oz) <= half || facingDelta(p.yaw, q.x, q.z, this.d.position.x, this.d.position.z) <= half;
  }

  /** Heaven's Gaze reaches the hero: a blue blow a parry turns and a perfect parry sends back. */
  _focusContact(p) {
    const B = this.B, C = B.C, d = this.d;
    this.stats.first++;
    const r = d.hitPlayer({
      damage: C.first.damage, knockback: C.first.knockback, knockdown: false, kind: 'beam', tell: B.tell, attack: B.attack,
      from: { x: B.ox, z: B.oz }, projectile: true, parryable: true, blockable: true, parryPosture: 0, light: true,
    });
    if (r === RESULT.PARRIED) {
      this.stats.parried++;
      if (p.deflect?.perfect) {
        this._returned(p);
        return;
      }
      // turned: the beam is thrown off the blade and goes out
      d.sunParried?.();
      this._toFade();
      return;
    }
    if (r === RESULT.BLOCKED) {
      this.stats.blocked++;
      B.hit = true;
      if (typeof p.streamBlock === 'function') p.streamBlock(0, this.T.blockPush, B.dx, B.dz);
      return;
    }
    if (r === RESULT.HIT) {
      this.stats.hits++;
      B.hit = true;
    }
  }

  /** A perfect parry sent the gaze back into his eyes: an eclipse, then the damage and the posture. */
  _returned(p) {
    const d = this.d, c = d._hs?.[1], R = this.T.returned;
    this.stats.returned++;
    d.eclipse?.('returned');
    if (c && p?.getChestPos) {
      const v = p.getChestPos(this._w, true);
      d.fx.gaze?.(v.x, v.y, v.z, c.x, c.y, c.z, 0.7, 1, 0.016, 'return');
    }
    if (c) {
      d.emit('dragon:returned', { kind: 1, damage: R.damage, x: c.x, y: c.y, z: c.z });
      d.takeHit({ damage: R.damage, exact: true, heavy: true, posture: R.posture, part: 'head', point: { x: c.x, y: c.y, z: c.z } });
    }
    this._toFade();
  }

  /** A red beam (a sweep's line, the high foot) reaches the hero: once per beam. */
  _redContact(p, from) {
    const B = this.B, C = B.C, d = this.d;
    const r = d.hitPlayer({
      damage: C.damage, knockback: C.knockback, knockdown: true, kind: 'beam', tell: TELL.RED, attack: B.attack,
      from, projectile: true, parryable: false, blockable: false,
    });
    if (r !== RESULT.IGNORED) {
      B.hit = true;
      if (r === RESULT.HIT) this.stats.hits++;
    }
  }

  /** The beam's bite on the world this tick: its cover, the floor under its foot, the wood there. */
  _world(fx, fz) {
    const d = this.d, B = this.B, w = this.game.world, W = w?.destructibles, WT = d.T.world;
    if (!w) return;
    const o = this._wo;
    o.dx = B.dx;
    o.dz = B.dz;
    if (B.cover && W?.strike) {
      W.strike(B.cover.x, B.cover.z, 0.3, WT.gaze, o);
      this.stats.covered++;
    }
    // the floor along the foot's last step (focus / sweep: round the end; high: its run)
    if (W?.sweep) W.sweep(fx - B.dx * 0.4, fz - B.dz * 0.4, fx + B.dx * 0.4, fz + B.dz * 0.4, 0.45, WT.gaze, o);
    w.scorch?.burnCircle?.(fx, fz, 0.7, 0.35, 0.8);
    w.ignite?.(fx, fz, 0.8, WT.ignite, false);
    // the cut: a scar every T.seam.step m the foot travels, a molten seam from phase 2
    const step = d.T.seam.step;
    if (B.lx === undefined || B.lastBeam !== B.beat || Math.hypot(fx - B.lx, fz - B.lz) >= step) {
      const dx = B.lx !== undefined && B.lastBeam === B.beat ? fx - B.lx : B.dx, dz = B.lx !== undefined && B.lastBeam === B.beat ? fz - B.lz : B.dz;
      B.lx = fx;
      B.lz = fz;
      B.lastBeam = B.beat;
      w.scars?.ground?.(fx, fz, 0.8, dx, dz);
      d.seams?.lay?.(fx, fz, dx, dz);
    }
  }

  _toFade() {
    this.B.phase = 'fade';
    this.B.fadeT = 0;
  }

  _fade(dt) {
    const B = this.B, d = this.d;
    B.fadeT += dt;
    const k = 1 - B.fadeT / 0.22;
    if (k <= 0.02) {
      B.on = false;
      B.phase = 'off';
      return;
    }
    d.fx.gaze?.(B.sx ?? B.ox, B.sy ?? B.oy, B.sz ?? B.oz, B.ex ?? B.ox, 0.25, B.ez ?? B.oz, B.C?.w ?? 1, k, dt, B.kind);
  }

  // ---------------------------------------------------------------- the bore (He Opens the Sky)
  _bore(b, s) {
    const d = this.d, sun = this.game.world?.sun, BT = d.T.bore, f = d.phase;
    this.stats.bores++;
    const life = perPhase(BT.life, f);
    if (sun && life > 0 && sun.boredCount < perPhase(BT.cap, f) + (d._great ? 1 : 0)) sun.bore(d.position.x, d.position.z, d.T.bore?.r ?? sun.data?.bore?.r ?? 2.8, life);
    d.fx.boreBeam?.(d.position.x, d.position.z);
    // three stones, each where the hero is heading, inside `stoneSpread` m of him
    const p = this.game.player?.position;
    if (!p || !d.fx.callStrike) return;
    for (let i = 0; i < BT.stones.length; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * Math.min(BT.stoneSpread, 2.5 + i);
      let x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const l = Math.hypot(x, z), bound = d.bound + 0.5;
      if (l > bound) {
        x *= bound / l;
        z *= bound / l;
      }
      const st = d.fx.callStrike(x, z, BT.stoneR, BT.stones[i], { damage: BT.stoneDamage, knockback: 3, attack: 'openSky', style: 'stone' });
      if (st) this.stats.stones++;
    }
  }
}
