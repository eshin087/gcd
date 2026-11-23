import * as THREE from 'three';
import { clamp, wrapAngle, turnToward } from '../../../core/math.js';
import { TELL, RESULT, DEFENSE, GUARD, facingDelta } from '../../../combat/rules.js';
import { perPhase } from '../duelist/realise.js';

// Halcyon's eyes (ADR-154; COMBAT.md → "Halcyon"): heat from two points at his eyes. Tian Lei's beam
// (ascendant/kiBeam.js) is the reference: the same body (HalFx.beam), the same rules for a held guard (it
// pays guard, never health: Player.streamBlock), the same cap on what a stream takes. The tell is ON HIM:
// two crimson points kindle at his eyes through the windup (d.eyesK; HalFx.eyes) and his head comes down.
// Every lit beam bites the world every T.glare.world.every s at its REAL height (ya at his eyes, yb where
// it ends), scorches the floor under its foot, lights what burns, and ends at the first cover on its line
// (the cover takes the cut: a car you hide behind is now burning).
//
// A beam is a beat marked `halGlare: '<kind>'`, `selfHit`, `sustain` (moves.js glareBeat): the brain cues,
// flashes, holds and ledgers it as any blow; this deals its hits.
//   stare   The Stare (blue first contact): the line from his eyes to the hero's chest is FIXED at `fix`
//           of the windup and lit at the impact. Guard: guard, never health. Parry: the beam turns off the
//           blade and rakes the set beside the hero. PERFECT parry: it goes back into his eyes (50, 34
//           posture, he drops and reels; `dragon:returned`). His first Stare's tail whips across his own
//           statue's neck: the head comes off (once a fight; ADR-154's moment).
//   sweep   Red Glare (red): level at y 1.15, LIT AT THE CUE, swept so it crosses the hero's bearing (fixed
//           at the cue) at the impact, `flashLead` later; on through its arc. One hit (24, knockdown) on a
//           hero in its strip from the impact on. Safe: rolled through, behind cover, inside `safe` m.
//   high    Scorched Avenue (red): he rises; the line through the hero is fixed and marked on the road
//           `mark` s before the impact; the beam's foot runs down it, reaching the hero's spot at the
//           impact; one hit on a hero within `r` of the foot. Cars on the line go up one after another.
//   wild    (the smile drops) one full turn of the beam at 3 m and above: over the hero's head; the signs
//           and lamp heads come down. No hit on the hero.
//   burn    (no one is watching) one short beam at a screen: it goes dark.

const DEG = Math.PI / 180;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Glare {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.B = { on: false, phase: 'off' };
    this.stats = { beams: 0, first: 0, ticks: 0, blocked: 0, parried: 0, returned: 0, hits: 0, covered: 0 };
    this._wo = { kind: 'blast', by: 'boss', dx: 0, dz: 0, y: 1.2, ya: 1.2, yb: 1.2, src: -1, scar: true };
    this._to = { kind: 'blast', by: 'boss', dx: 0, dz: 0, src: -1, scar: true };
    this._fire = { kind: 'blast', by: 'boss', y: 1, src: -1 };
    this._stations = new Set();
    this._blockEvt = -Infinity;
    this.statueDone = false;
    this.first = true;
  }

  get T() {
    return this.d.T.glare;
  }

  reset() {
    this.B.on = false;
    this.B.phase = 'off';
    this._stations.clear();
    this.statueDone = false;
    this.first = true;
  }

  /** A beam of his is lit (or fading). */
  get busy() {
    return !!this.B.on;
  }

  get phase() {
    return this.B.on ? this.B.phase : 'off';
  }

  /** His eyes as drawn (the eye points on his head, between them): out = a Vector3. */
  eyePoint(out) {
    const h = this.d.rig?.head;
    if (h?.matrixWorld) {
      out.set(0, 0.128, 0.11).applyMatrix4(h.matrixWorld);
      if (Number.isFinite(out.x + out.y + out.z)) return out;
    }
    const p = this.d.position;
    return out.set(p.x + Math.sin(this.d.yaw) * 0.2, p.y + 2.1, p.z + Math.cos(this.d.yaw) * 0.2);
  }

  /** A beam move may start (not while one is lit). */
  begin() {
    return !(this.B.on && this.B.phase === 'lit');
  }

  // ---------------------------------------------------------------- the windup
  /** Every frame of a beam beat (u 0..1 the windup, 1..2 the lit window). */
  motion(b, u, s, dt) {
    const d = this.d, kind = b.def.halGlare, C = this.T[kind];
    if (!C) return;
    const a = d.brain.act;
    if (u < 1) {
      d.eyesK = Math.max(d.eyesK ?? 0, clamp(u * 1.15, 0, 1));
      const fix = C.fix ?? 0.76;
      if (kind === 'stare') {
        if (!b._fixed && s) {
          d.yaw = turnToward(d.yaw, s.ang, perPhase(d.T.move.trackTurn, d.phase) * Math.max(dt, 1e-4));
          if (u >= fix) {
            b._fixed = true;
            b._yaw = Math.atan2(s.p.x - d.position.x, s.p.z - d.position.z);
            b._tx = s.p.x;
            b._tz = s.p.z;
          }
        } else if (b._fixed) d.yaw = turnToward(d.yaw, b._yaw, 12 * dt);
      } else if (kind === 'sweep') {
        // the bearing fixed at the cue; lit from it, swept to cross that bearing at the impact
        if (!b._fixed && s) {
          d.yaw = turnToward(d.yaw, s.ang, perPhase(d.T.move.trackTurn, d.phase) * Math.max(dt, 1e-4));
          if (a && a.t >= b.flash - 1e-6) {
            b._fixed = true;
            b._bear = Math.atan2(s.p.x - d.position.x, s.p.z - d.position.z);
            const side = b.def.sweepSide ?? (this._side = -(this._side || 1));
            b._sign = side;
            this._lightSweep(b, a);
          }
        }
      } else if (kind === 'high') {
        if (!b._fixed && s) {
          d.yaw = turnToward(d.yaw, s.ang, perPhase(d.T.move.trackTurn, d.phase) * Math.max(dt, 1e-4));
          const left = a ? b.impact - a.t : 1;
          if (left <= C.mark) {
            b._fixed = true;
            this._fixHigh(b, s);
          }
        }
        if (b._fixed) {
          d.fx.avenueMark?.(b._ax, b._az, b._bx, b._bz, clamp(u, 0, 1));
          // the foot starts at the cue and reaches the hero's spot at the impact
          if (a && a.t >= b.flash && !this.B.on) this._lightHigh(b, a);
        }
      }
      return;
    }
    // the lit window: the sweep turns him with it (his head, his eyes)
    if (this.B.on && this.B.beat === b && kind === 'sweep') d.yaw = this.B.ang;
  }

  _lightSweep(b, a) {
    const d = this.d, C = this.T.sweep, B = this.B;
    const lead = Math.max(0.05, b.impact - a.t);
    const total = lead + Math.max(0.1, b.end - b.impact);
    const w = (C.arc * DEG) / total;
    this._light(b, a, 'sweep');
    B.w0 = w * b._sign;
    B.ang = b._bear - B.w0 * lead;
    B.hitFrom = b.impact;
    B.lit = total;
    d.yaw = B.ang;
  }

  _fixHigh(b, s) {
    const d = this.d, C = this.T.high;
    const dx = s.p.x - d.position.x, dz = s.p.z - d.position.z, l = Math.hypot(dx, dz) || 1;
    b._dx = dx / l;
    b._dz = dz / l;
    b._tx = s.p.x;
    b._tz = s.p.z;
    b._ax = d.position.x + b._dx * 1.0;
    b._az = d.position.z + b._dz * 1.0;
    b._bx = d.position.x + b._dx * C.len;
    b._bz = d.position.z + b._dz * C.len;
  }

  _lightHigh(b, a) {
    const C = this.T.high, B = this.B;
    this._light(b, a, 'high');
    const lead = Math.max(0.05, b.impact - a.t);
    // where the foot starts: back along the line from the hero's spot, `speed` x lead, not behind him
    const back = Math.min(C.speed * lead, Math.max(0.5, Math.hypot(b._tx - b._ax, b._tz - b._az)));
    B.fx = b._tx - b._dx * back;
    B.fz = b._tz - b._dz * back;
    B.fv = back / lead; // m/s to the hero's spot at the impact, then C.speed on down the line
    B.dx = b._dx;
    B.dz = b._dz;
    B.hitFrom = b.impact - 0.06;
    B.lit = lead + (b.end - b.impact);
  }

  /** Light a beam: the record. */
  _light(b, a, kind) {
    const d = this.d, B = this.B, C = this.T[kind];
    B.on = true;
    B.phase = 'lit';
    B.kind = kind;
    B.C = C;
    B.beat = b;
    B.act = a;
    B.attack = a?.name ?? kind;
    B.tell = b.def.tell;
    B.t = 0;
    B.lit = Math.max(0.1, (b.A ?? 0.1) + (b.S ?? 0));
    B.first = false;
    B.hit = false;
    B.taken = 0;
    B.nextTick = this.T.active + this.T.tick * 0.5;
    B.worldNext = 0;
    B.fadeT = 0;
    B.deflect = 0;
    B.by = 'boss';
    B.noHero = false;
    B.hitFrom = -Infinity;
    B.len = C?.len ?? 20;
    B.w = C?.w ?? 1;
    const D = this.game.world?.destructibles;
    this._to.src = D?.swing?.() ?? -1;
    this._stations.clear();
    this.stats.beams++;
    d.emit?.('dragon:spell', { name: B.attack, x: d.position.x, z: d.position.z });
  }

  /** The beat's impact: the stare is lit now (the sweep and the foot were lit at the cue). */
  onImpact(b, s, a) {
    const kind = b.def.halGlare, d = this.d;
    if (kind === 'stare') {
      if (!b._fixed) {
        b._yaw = d.yaw;
        b._tx = d.position.x + Math.sin(d.yaw) * 6;
        b._tz = d.position.z + Math.cos(d.yaw) * 6;
      }
      this._light(b, a, 'stare');
      const B = this.B;
      B.ang = b._yaw;
      B.tx = b._tx;
      B.tz = b._tz;
      B.hitFrom = b.impact;
      d.yaw = b._yaw;
      this.eyePoint(_v);
      d.fx.muzzle?.(_v.x, _v.y, _v.z, Math.sin(B.ang), Math.cos(B.ang), 0.8, 2);
      this.game.shake?.(0.15);
    } else if (kind === 'sweep' && !this.B.on) {
      // (no cue reached: lit now, crossing at once)
      b._bear = d.yaw;
      b._sign = b.def.sweepSide ?? 1;
      this._lightSweep(b, a);
    } else if (kind === 'high' && !this.B.on) {
      if (!b._fixed && s) this._fixHigh(b, s);
      if (b._fixed) this._lightHigh(b, a);
    }
  }

  // ---------------------------------------------------------------- every frame
  frame(dt) {
    const d = this.d;
    d.eyesK = Math.max(0, (d.eyesK ?? 0) - dt * 2.5);
    const B = this.B;
    if (!B.on) return;
    try {
      if (B.phase === 'lit') this._lit(dt);
      else this._fade(dt);
    } catch (err) {
      console.error('[halcyon] glare frame failed', err);
      B.on = false;
      B.phase = 'off';
    }
  }

  _lit(dt) {
    const d = this.d, B = this.B, C = B.C;
    const moment = B.kind === 'wild' || B.kind === 'burn';
    if (!moment && (d.brain.act !== B.act || d.mode !== 'act')) {
      this._toFade();
      return;
    }
    B.t += dt;
    d.eyesK = 1;
    const now = d.brain.act?.t ?? 0;
    const eye = this.eyePoint(_v);
    let ox = eye.x, oy = eye.y, oz = eye.z, ex, ey, ez, gx, gz, len, y1;
    if (B.kind === 'stare') {
      // the line from his eyes through the hero's spot (fixed), down to the floor or `len`; deflected aside by a parry
      const ang = B.ang + B.deflect;
      const dx = Math.sin(ang), dz = Math.cos(ang);
      const dist = Math.max(1, Math.hypot(B.tx - ox, B.tz - oz));
      const slope = (1.1 - oy) / dist; // to the hero's chest at his spot
      const flat = Math.max(-0.5, Math.min(0, slope));
      len = C.len;
      // where it meets the floor
      const floorAt = flat < -1e-3 ? (0.3 - oy) / flat : Infinity;
      len = Math.min(len, floorAt);
      len = this._cover(ox, oz, dx, dz, len, B.w);
      ex = ox + dx * len;
      ez = oz + dz * len;
      ey = Math.max(0.3, oy + flat * len);
      B.dx = dx;
      B.dz = dz;
      gx = ox;
      gz = oz;
      y1 = ey;
    } else if (B.kind === 'sweep') {
      B.ang += B.w0 * dt;
      d.yaw = B.ang;
      const dx = Math.sin(B.ang), dz = Math.cos(B.ang);
      len = this._cover(ox, oz, dx, dz, C.len, C.w);
      ex = ox + dx * len;
      ez = oz + dz * len;
      ey = C.y;
      B.dx = dx;
      B.dz = dz;
      gx = ox;
      gz = oz;
      y1 = C.y;
    } else if (B.kind === 'high') {
      // the foot runs along the line
      const v = now < B.beat.impact ? B.fv : C.speed;
      B.fx += B.dx * v * dt;
      B.fz += B.dz * v * dt;
      ex = B.fx;
      ez = B.fz;
      ey = 0.35;
      len = Math.hypot(ex - ox, ez - oz);
      gx = ox;
      gz = oz;
      y1 = 0.35;
      const run = Math.hypot(B.fx - B.beat._ax, B.fz - B.beat._az);
      if (run > C.len) this._toFade();
    } else {
      // a moment's beam: wild turns over his head; burn at a screen
      if (B.kind === 'wild') {
        B.ang += (TAU_ / C.dur) * dt;
        const dx = Math.sin(B.ang), dz = Math.cos(B.ang);
        ex = ox + dx * C.len;
        ez = oz + dz * C.len;
        ey = C.y;
        B.dx = dx;
        B.dz = dz;
      } else {
        ex = B.tx;
        ey = B.ty;
        ez = B.tz;
        const l = Math.hypot(ex - ox, ez - oz) || 1;
        B.dx = (ex - ox) / l;
        B.dz = (ez - oz) / l;
      }
      len = Math.hypot(ex - ox, ez - oz);
      gx = ox;
      gz = oz;
      y1 = ey;
    }
    B.ox = ox;
    B.oy = oy;
    B.oz = oz;
    B.ex = ex;
    B.ey = ey;
    B.ez = ez;
    B.len = len;
    // the hero
    const p = this.game.player;
    if (!moment && !B.noHero && p?.alive && p.position && now >= B.hitFrom - 1e-6) this._hero(p, gx, gz, len);
    // the world
    if (B.t >= B.worldNext) {
      B.worldNext += this.T.world.every;
      this._world(oy, y1);
    }
    // drawn: a short white peak, then the held beam
    const L = d.T.beam.look, k = B.t < L.peak ? 1 : L.held;
    d.fx.beam?.(ox, oy, oz, ex, ey, ez, B.kind === 'high' ? 1.0 : 0.7, k, dt, 2);
    d.fx.beamSplash?.(ex, Math.max(0.4, ey), ez, k * 0.7, dt, 2);
    if (B.t >= B.lit) this._toFade();
  }

  /** The line's length to the first cover on it (the cover takes the cut). */
  _cover(ox, oz, dx, dz, len, w) {
    const D = this.game.world?.destructibles;
    const c = D?.coverAt?.(ox + dx * 0.6, oz + dz * 0.6, ox + dx * len, oz + dz * len, w * 0.3);
    this.B.coverPiece = c ?? null;
    if (!c) return len;
    return 0.6 + (len - 0.6) * fin(D.coverT, 1);
  }

  /** The hero against the lit beam: its first contact (the stare), its one hit (the sweep, the foot), ticks. */
  _hero(p, gx, gz, len) {
    const B = this.B, C = B.C, d = this.d, q = p.position, pr = p.radius ?? 0.45;
    let inside = false;
    if (B.kind === 'high') {
      inside = Math.hypot(q.x - B.fx, q.z - B.fz) <= C.r + pr;
    } else {
      const ox = q.x - gx, oz = q.z - gz, along = ox * B.dx + oz * B.dz, across = -ox * B.dz + oz * B.dx;
      const from = B.kind === 'sweep' ? C.safe : 0.3;
      inside = along >= from && along <= len + pr && Math.abs(across) <= (C.w ?? 1) / 2 + pr;
    }
    if (B.kind === 'stare') {
      if (!B.first && B.t <= this.T.active + 0.05) {
        if (inside) {
          B.first = true;
          this._firstContact(p);
        }
      } else if (B.t >= B.nextTick) {
        B.nextTick += this.T.tick;
        if (inside && p.state !== 'knockdown' && B.taken >= 0) this._tick(p);
      }
      return;
    }
    // one hit (red)
    if (B.hit || !inside) return;
    B.hit = true;
    this.stats.hits++;
    const r = d.hitPlayer({
      damage: C.first?.damage ?? C.damage, knockback: C.first?.knockback ?? C.knockback, knockdown: true, kind: 'beam', tell: TELL.RED, attack: B.attack,
      from: { x: B.kind === 'high' ? B.fx - B.dx : gx, z: B.kind === 'high' ? B.fz - B.dz : gz }, projectile: true, parryable: false, blockable: false,
    });
    if (r === RESULT.IGNORED) B.hit = false;
  }

  /** The Stare's first contact (blue): parried, perfectly parried, blocked or taken. */
  _firstContact(p) {
    const B = this.B, C = B.C, d = this.d;
    this.stats.first++;
    const r = d.hitPlayer({
      damage: C.first.damage, knockback: C.first.knockback, knockdown: false, kind: 'beam', tell: TELL.BLUE, attack: B.attack,
      from: { x: B.ox, z: B.oz }, projectile: true, parryable: true, blockable: true, flare: true, parryPosture: 0,
    });
    if (r === RESULT.PARRIED) {
      if (p.deflect?.perfect) this._returned(p);
      else {
        // the beam turns off the blade and rakes the set beside the hero (it never touches him again)
        this.stats.parried++;
        B.deflect = (Math.random() < 0.5 ? -1 : 1) * 0.55;
        B.noHero = true;
        B.by = 'player';
        this.game.shake?.(0.2);
      }
    } else if (r === RESULT.BLOCKED) {
      this.stats.blocked++;
    }
  }

  /** The Stare sent back into his eyes: he takes it, drops out of the air and reels. */
  _returned(p) {
    const B = this.B, d = this.d, R = this.T.returned;
    this.stats.returned++;
    B.noHero = true;
    B.phase = 'returned';
    B.fadeT = 0;
    const c = p.getChestPos?.(_w, true) ?? _w.set(p.position.x, 1.2, p.position.z);
    B.cx = c.x;
    B.cy = c.y;
    B.cz = c.z;
    d.emit?.('dragon:returned', { attack: B.attack, damage: R.damage });
    d.hurt?.(R.damage, R.posture, 'returned');
    if (d.mode !== 'dying' && d.mode !== 'dead' && !d.broken) {
      d.emit?.('dragon:stagger');
      d._cinematic?.('returned');
      if (d.brain.startReact('blinded')) d.flight?.holdReact?.(R.reel);
    }
    this.game.shake?.(0.5);
  }

  /** A tick of the stare on a hero still in it (a stream): a held guard facing him pays guard. */
  _tick(p) {
    const B = this.B, C = B.C, d = this.d;
    this.stats.ticks++;
    if (p.blocking && this._facing(p)) {
      this._blockTick(p, C.tick, C.push);
      return;
    }
    const last = ++B.taken >= (this.T.maxTicks ?? Infinity);
    let from = { x: B.ox, z: B.oz };
    if (last) {
      B.taken = -1;
      const q = p.position, along = (q.x - B.ox) * B.dx + (q.z - B.oz) * B.dz;
      from = { x: B.ox + B.dx * along, z: B.oz + B.dz * along };
      if (Math.hypot(q.x - from.x, q.z - from.z) < 0.05) from = { x: from.x + B.dz * 0.3, z: from.z - B.dx * 0.3 };
    }
    const scale = d.T.damageScale ?? 1, n = last ? 1 : Math.max(1, Math.ceil((C.tick * scale) / 4.8));
    for (let i = 0; i < n; i++) {
      const r = d.hitPlayer({
        damage: C.tick / n, knockback: last ? this.T.thrown : 0, knockdown: last, kind: 'beam', tell: TELL.RED, attack: B.attack,
        from, projectile: true, parryable: false, blockable: false, extra: { perfect: false },
      });
      if (r !== RESULT.HIT) break;
    }
  }

  _facing(p) {
    const B = this.B, d = this.d, half = DEFENSE.blockArc * 0.5, q = p.position;
    return facingDelta(p.yaw, q.x, q.z, B.ox, B.oz) <= half || facingDelta(p.yaw, q.x, q.z, d.position.x, d.position.z) <= half;
  }

  _blockTick(p, dmg, push) {
    const d = this.d, B = this.B, scale = d.T.damageScale ?? 1;
    this.stats.blocked++;
    const cost = clamp(dmg * scale * GUARD.cost.normal, GUARD.costMin, GUARD.costMax);
    const held = typeof p.streamBlock === 'function' ? p.streamBlock(cost, push, B.dx, B.dz) : false;
    if (!held) {
      d.hitPlayer({ damage: dmg, knockback: 0.6, knockdown: false, kind: 'beam', tell: TELL.RED, attack: B.attack, from: { x: B.ox, z: B.oz }, projectile: true, parryable: false, blockable: true, extra: { perfect: false } });
      return;
    }
    const now = this.game.time ?? 0;
    if (now - this._blockEvt > 0.4) {
      this._blockEvt = now;
      this.game.events?.emit?.('player:block', { damage: 0, tell: 'blue' });
    }
  }

  // ---------------------------------------------------------------- the world
  /** What stands in the beam is cut at the beam's real height (ya at his eyes, yb where it ends); the
   *  floor under its foot is trenched; what burns catches. */
  _world(ya, yb) {
    const B = this.B, W = this.T.world, wd = this.game.world, D = wd?.destructibles;
    if (!wd) return;
    const o = this._wo;
    o.by = B.by;
    o.dx = B.dx;
    o.dz = B.dz;
    o.ya = ya;
    o.yb = yb;
    o.y = (ya + yb) / 2;
    const power = B.kind === 'burn' ? this.T.burn.power : W.sweep;
    const c = B.coverPiece;
    if (D?.sweep) {
      o.src = D.swing?.() ?? -1;
      // (the cover at its end takes the cut apart: it is cut and set alight, and holds through the lit
      // window, so the hero behind it is safe while it stands)
      o.spare = c ?? undefined;
      D.sweep(B.ox + B.dx * 0.5, B.oz + B.dz * 0.5, B.ex, B.ez, (B.kind === 'high' ? B.C.r : 0.5), power, o);
      o.spare = undefined;
      if (c && c.state === 0) {
        o.src = D.swing?.() ?? -1;
        D.strike(B.ex, B.ez, 0.3, W.cover, o);
      }
    }
    if (c) {
      this.stats.covered++;
      this.d.fx.scorch?.(B.ex, B.ez);
      wd.ignite?.(B.ex, B.ez, 0.8, W.ignite);
    }
    // the trench under its foot (each spot once per beam)
    if (B.ey < 1.0 || B.kind === 'high') {
      const t = this._to;
      t.by = B.by;
      t.dx = B.dx;
      t.dz = B.dz;
      const key = Math.round(B.ex / W.step) * 4096 + Math.round(B.ez / W.step);
      if (!this._stations.has(key)) {
        this._stations.add(key);
        wd.impact?.(B.ex, B.ez, W.trenchR, B.kind === 'high' ? W.trench * 2 : W.trench, t);
        wd.ignite?.(B.ex, B.ez, W.trenchR + 0.3, W.ignite);
      }
    }
  }

  // ---------------------------------------------------------------- the moments
  /** The smile drops: one full turn of the beam at 3 m and above, over the hero's head. */
  wild() {
    const d = this.d, B = this.B, C = this.T.wild;
    this._light({ def: { tell: TELL.RED }, A: 0, S: C.dur }, null, 'wild');
    B.attack = 'wildGlare';
    B.ang = d.yaw;
    B.lit = C.dur;
    B.noHero = true;
  }

  /** No one is watching: one short beam at (x, y, z) (a screen): it goes dark. */
  burn(x, y, z) {
    const B = this.B, C = this.T.burn;
    this._light({ def: { tell: TELL.RED }, A: 0, S: C.dur }, null, 'burn');
    B.attack = 'burnScreens';
    B.tx = x;
    B.ty = y;
    B.tz = z;
    B.lit = C.dur;
    B.noHero = true;
    B.worldNext = C.dur * 0.6;
  }

  _toFade() {
    const B = this.B, d = this.d;
    // his first Stare's tail: a flick of his eyes across his own statue's neck (once a fight)
    if (B.kind === 'stare' && this.first && !this.statueDone) {
      this.first = false;
      const W = this.game.world?.destructibles;
      const head = W?.list?.find?.((x) => x.kind === 'statueHead' && x.state === 0);
      if (head) {
        this.statueDone = true;
        B.phase = 'flick';
        B.fadeT = 0;
        B.tx = head.x;
        B.ty = head.y0 + 0.3;
        B.tz = head.z;
        return;
      }
    }
    B.phase = 'fade';
    B.fadeT = 0;
    void d;
  }

  _fade(dt) {
    const B = this.B, d = this.d, L = d.T.beam.look;
    B.fadeT += dt;
    if (B.phase === 'returned') {
      // the beam from the hero's blade back into his eyes
      const e = this.eyePoint(_v), k = 1 - B.fadeT / 0.3;
      if (k <= 0) {
        B.on = false;
        B.phase = 'off';
        return;
      }
      d.fx.beam?.(B.cx, B.cy, B.cz, e.x, e.y, e.z, 0.8, k, dt, 2);
      d.fx.beamSplash?.(e.x, e.y, e.z, k, dt, 2);
      return;
    }
    if (B.phase === 'flick') {
      // the tail whips up across the statue's neck: the head comes off (a strike with only the head, at its height)
      const e = this.eyePoint(_v), u = Math.min(1, B.fadeT / 0.18);
      d.fx.beam?.(e.x, e.y, e.z, B.tx, B.ty, B.tz, 0.5, L.held * (1 - u * 0.5), dt, 2);
      if (u >= 1 && !B.flicked) {
        B.flicked = true;
        const W = this.game.world?.destructibles;
        if (W?.strike) {
          const o = this._fire;
          o.kind = 'blast';
          o.by = 'boss';
          o.y = B.ty;
          o.src = W.swing?.() ?? -1;
          W.strike(B.tx, B.tz, 0.35, 6, o);
        }
        d.emit?.('dragon:statue', { part: 'head' });
        B.phase = 'fade';
        B.fadeT = 0;
      }
      return;
    }
    B.flicked = false;
    const k = (1 - B.fadeT / L.fadeOut) * L.held;
    if (k <= 0.02 || B.fadeT > 1) {
      B.on = false;
      B.phase = 'off';
      return;
    }
    if (Number.isFinite(B.ex)) d.fx.beam?.(B.ox, B.oy, B.oz, B.ex, B.ey, B.ez, 0.6, k, dt, 2);
  }
}

const TAU_ = Math.PI * 2;
void wrapAngle;
