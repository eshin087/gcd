import * as THREE from 'three';
import { clamp, wrapAngle, turnToward } from '../../../core/math.js';
import { CONFIG } from '../../../core/config.js';
import { TELL, RESULT, DEFENSE, GUARD, facingDelta } from '../../../combat/rules.js';
import { RING } from '../../../world/skybreakRing.js';
import { perPhase } from '../duelist/realise.js';
import { FORM_POSES } from './poses.js';
import { MOVES } from './moves.js';
import { BEAM_TUNING } from './tuningBeam.js';
import { drawSight } from './fxBeam.js';

// Tian Lei's ki, the beams: Rising Tide, the sweeping and twin tides, the great beam and its clash, what
// a beam does to the world. THE BEAM AGENT'S FILE. Numbers: tuningBeam.js (d.T.beam); the moves and the
// technique's poses: moves/kiBeam.js.
//
// ki.js (KiMoves) routes here every engine hook of a beat or a move whose `ki` kind starts with 'beam'
// (the routing contract: the comment at the top of ascendant.js, and ki.js).
//
// HOW A BEAM PLAYS (a beat with `beam: { kind, side }`, `selfHit`, `sustain`: moves/kiBeam.js):
//   motion(), the windup   he aims at the hero (the great beam: and the vanish to the far edge happened
//                          at u 0.1, ascendant.js `blink.edge`); at `fix` of it the line is FIXED (the
//                          cue: the brain's red flare at the palm, flashLead before the impact) and a
//                          thread of light runs from his lead hand along it. The light gathers in the
//                          drawn-back palm (fx.beamCharge); the great beam dims the ring's light
//                          (ambience.dim), lifts stones (fx.transformGather) and holds the camera on him.
//   onImpact()             the beam is lit: this.B, which lives on its own (it survives the move ending
//                          into THE CLASH) and is drawn and tested in frame().
//   frame(), lit           the strip (len x w from the palm along his facing; the drawn line ends at a
//                          butte on it, or at the hero's raised guard): the FIRST CONTACT in the active
//                          frames, a TICK every T.beam.tick after (a stream: no stagger, never on a hero
//                          already down); a held guard facing him pays guard, never health, and slides
//                          along it. The sweep turns his facing (motion(), u 1..2) and the beam with it.
//                          The world: a sweep along it and on past its end to `world.carry` m (a butte's
//                          top comes off), a trench of world.impact stations, fire outside the ring.
//   THE CLASH              a PERFECT parry of the great beam's head: brain.startLock at range (the pair
//                          where they stand), his clip the held two-palm thrust, the beam drawn from his
//                          palms to the hero's blade, fx.beamClash with the lock's meter, the camera drawn
//                          back to frame both. lockEnd(won): won = the beam split past the hero
//                          (fx.beamSplit), 2 x a won lock's posture, he reels T.beam.clash.reel s; lost =
//                          40, knockdown, thrown 12 m along the beam. A plain parry of the head = a block.
// Fairness: the beat's `sustain` makes the cue ledger hold the whole lit window as one interval; `busy`
// is true while a beam is lit, held in the clash or fading (the weather must not call a strike then).
// Look randomness: the fx's own streams (fx.lr()); game rolls (the sweep's side when the hero stands on
// the line): Math.random, the AI's stream, as the Lord's code does.

const DEG = Math.PI / 180;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** The clip he holds his beam in through the clash, compiled round each form's stance (built once). */
let CLASH_CLIPS = null;
function clashClip(form) {
  if (!CLASH_CLIPS) {
    const pose = MOVES.heavenTide?.clashPose;
    CLASH_CLIPS = pose ? FORM_POSES.map((P) => {
      const c = P.compileClip([{ t: 0, ...pose }, { t: 4, ...pose }], 4, { hold: true });
      c.name = 'beamClash';
      return c;
    }) : [];
  }
  return CLASH_CLIPS[clamp(form | 0, 1, CLASH_CLIPS.length) - 1] ?? null;
}

export class BeamMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._stations = new Set();
    this._wo = { kind: 'blast', by: 'boss', dx: 0, dz: 0, y: 1.2, src: -1 };
    this._to = { kind: 'blast', by: 'boss', dx: 0, dz: 0, src: -1, scar: true };
    this.B = { on: false, phase: 'off' };
    this.stats = { beams: 0, first: 0, ticks: 0, blocked: 0, clashes: 0, won: 0, lost: 0, tops: 0 };
    this._form = 0;
    this._formAt = 0;
    this._greatAt = -Infinity;
    this._reel = 0;
    this._blockEvt = -Infinity;
  }

  get T() {
    return this.d.T?.beam ?? BEAM_TUNING;
  }

  /** Every reset of his (the duelist's reset, a death, the Lab): nothing of his left in the air. */
  reset() {
    this.B.on = false;
    this.B.phase = 'off';
    this._reel = 0;
    this._greatAt = -Infinity;
    this._form = 0;
    this._stations.clear();
  }

  /** A beam of his is lit, held in the clash or fading (the tests wait for it; the weather reads it). */
  get busy() {
    return !!this.B.on;
  }

  /** The live beam's phase: 'off' | 'lit' | 'clash' | 'split' | 'surge' | 'fade'. */
  get phase() {
    return this.B.on ? this.B.phase : 'off';
  }

  /** A move of this kind starts (brain.startAct → d.onActStart): false = it cannot start now. */
  begin(act) {
    if (this.B.on && (this.B.phase === 'lit' || this.B.phase === 'clash')) return false;
    if (act?.def === MOVES.heavenTide) this._greatAt = this._now();
    return true;
  }

  /** His AI weighs a move of this kind: the great beam not before T.great.from s into form 3, then at
   *  most every T.great.every s (it is the spell of the form: when it is ready it is likely). */
  weigh(def, w) {
    if (def !== MOVES.heavenTide) return w;
    const G = this.T.great, now = this._now();
    if (this.d.phase < 3 || now - this._formAt < G.from || now - this._greatAt < G.every) return 0;
    return w * 2;
  }

  onCast() {}
  onRelease() {}
  onSustain() {}
  onHit() {}

  // ---------------------------------------------------------------- the windup
  /** Every frame of a beam beat (u 0..1 the windup, 1..2 the lit window). */
  motion(b, u, s, dt) {
    const bm = b.def.beam, d = this.d;
    if (!bm) return;
    const C = this.T[bm.kind], great = bm.kind === 'great', form = d.phase;
    if (u < 1) {
      // aim: at the hero (the second palm of the twin: where he is heading) until the line is fixed
      const fix = C.fix ?? 0.76;
      if (!b._fixed && s) {
        let tx = s.p.x, tz = s.p.z;
        if (bm.kind === 'twin' && bm.side === 'L') {
          tx += fin(s.vx) * C.lead;
          tz += fin(s.vz) * C.lead;
        }
        const ang = Math.atan2(tx - d.position.x, tz - d.position.z);
        d.yaw = turnToward(d.yaw, ang, perPhase(d.T.move.trackTurn, form) * Math.max(dt, 1e-4));
        if (u >= fix) {
          b._fixed = true;
          b._yaw = d.yaw;
        }
      } else if (b._fixed) d.yaw = b._yaw;
      // the light gathering in the drawn-back palm
      const p = d.tellPoint(bm.side === 'L' ? 'fistL' : 'fistR', this._v);
      d.fx.beamCharge?.(p.x, p.y, p.z, clamp(u / 0.92, 0, 1), dt, form);
      if (great) {
        d.fx.transformGather?.(d.position.x, d.position.z, clamp(u, 0, 1), dt, form);
        this.game.world?.forest?.ambience?.dim?.(clamp(u * 1.15, 0, 1) * C.dim);
        this._keepPair(false);
        if (!b._cine && u > 0.12) {
          b._cine = true;
          this.game.flow?.cinematic?.({ x: d.position.x, z: d.position.z, zoom: C.cine.zoom, weight: C.cine.weight, slowmo: 1, dur: C.cine.dur, kind: 'greatBeam' });
        }
      }
      // the line he has fixed: a thread from the lead hand along it
      if (b._fixed) {
        const h = d.tellPoint(bm.side === 'L' ? 'fistR' : 'fistL', this._w);
        const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), L = this._lineLen(d.position.x, d.position.z, fx, fz, C.len, C.w, great);
        d.fx._drawing++;
        try {
          drawSight(d.fx, h.x, h.y, h.z, d.position.x + fx * L, Math.max(0.5, h.y - L * 0.03), d.position.z + fz * L, this.T.look.sight * (great ? 1.3 : 1), form);
        } finally {
          d.fx._drawing--;
        }
      }
      return;
    }
    // the lit window: the sweep is dragged toward the hero's side; the great beam follows him
    if (!this.B.on || this.B.beat !== b || this.B.phase !== 'lit') return;
    // (the sweep: up to `arc` deg; the great beam: on through its whole lit window, one way)
    if (bm.kind === 'sweep' || great) {
      const B = this.B, step = C.turn * DEG * dt, left = (C.arc ?? 360) * DEG - Math.abs(B.swept);
      if (left > 0) {
        const st = Math.min(step, left) * B.sign;
        B.swept += st;
        d.yaw = wrapAngle(d.yaw + st);
      }
    }
  }

  // ---------------------------------------------------------------- lit
  /** The beat's impact (its first frame): the beam is lit. */
  onImpact(b, s, a) {
    const bm = b.def.beam, d = this.d;
    if (!bm) return;
    const C = this.T[bm.kind], B = this.B;
    if (b._fixed) d.yaw = b._yaw;
    B.on = true;
    B.phase = 'lit';
    B.kind = bm.kind;
    B.side = bm.side;
    B.C = C;
    B.form = d.phase;
    B.act = a;
    B.beat = b;
    B.attack = a?.name ?? 'beam';
    B.tell = b.def.tell;
    B.t = 0;
    B.lit = Math.max(0.1, b.A + b.S);
    B.first = false;
    B.nextTick = this.T.active + this.T.tick * 0.5;
    B.worldNext = 0;
    B.fadeT = 0;
    B.swept = 0;
    B.w = C.w;
    B.guardAt = false;
    B.top = false;
    const D = this.game.world?.destructibles;
    this._to.src = D?.swing?.() ?? -1;
    this._stations.clear();
    // the sweep's side: toward the hero (on the line: the way he is moving, else a roll)
    if (bm.kind === 'sweep' || bm.kind === 'great') {
      const off = s ? wrapAngle(s.ang - d.yaw) : 0;
      let sign = Math.abs(off) > 0.03 ? Math.sign(off) : 0;
      if (!sign && s) {
        const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), side = fin(s.vx) * fz - fin(s.vz) * fx;
        sign = Math.abs(side) > 0.3 ? Math.sign(-side) || 1 : 0;
      }
      B.sign = sign || (Math.random() < 0.5 ? -1 : 1);
    }
    this._origin();
    this.stats.beams++;
    d.fx.muzzle?.(B.ox, B.oy, B.oz, B.dx, B.dz, bm.kind === 'great' ? 2.2 : 1.5, B.form);
    this.game.shake?.(bm.kind === 'great' ? 0.45 : 0.22);
    if (bm.kind === 'great') this.game.world?.forest?.ambience?.flare?.(1);
    d.emit?.('dragon:spell', { name: B.attack, x: B.ox, z: B.oz });
  }

  /** Every frame, after the brain (d.brainFrame). */
  frame(dt) {
    const d = this.d;
    if (d.phase !== this._form) {
      this._form = d.phase;
      this._formAt = this._now();
    }
    this._holdReel(dt);
    const B = this.B;
    if (!B.on) return;
    try {
      switch (B.phase) {
        case 'lit':
          this._lit(dt);
          break;
        case 'clash':
          this._clash(dt);
          break;
        default:
          this._fade(dt);
      }
    } catch (err) {
      console.error('[ascendant] beam frame failed', err);
      B.on = false;
      B.phase = 'off';
    }
  }

  _lit(dt) {
    const d = this.d, B = this.B, C = B.C, L = this.T.look;
    // the move ended under him (a stagger, a break, the Lab): the beam goes out
    if (d.brain.act !== B.act || d.mode !== 'act') {
      this._toFade();
      return;
    }
    B.t += dt;
    this._origin();
    const great = B.kind === 'great';
    B.len = this._lineLen(B.ox, B.oz, B.dx, B.dz, C.len, C.w, great);
    // the hero in its strip
    const p = this.game.player;
    B.guardAt = false;
    if (p?.alive && p.position) {
      const inside = this._inStrip(p.position.x, p.position.z, B.len, B.w);
      if (!B.first && B.t <= this.T.active + 1e-6 + dt * 0.5) {
        if (inside) {
          B.first = true;
          this._firstContact(p);
          if (B.phase !== 'lit') return; // (the clash)
        }
      } else if (B.t >= B.nextTick) {
        B.nextTick += this.T.tick;
        if (inside && p.state !== 'knockdown') this._tick(p);
      }
      if (inside && B.guardAt === false && p.blocking && this._facing(p)) B.guardAt = true;
    }
    // the world
    if (B.t >= B.worldNext) {
      B.worldNext += this.T.world.every;
      this._world();
    }
    // drawn: a short white peak, then the held beam gold (the owner: bright letters are flashy)
    const k = B.t < L.peak ? 1 : L.held;
    let end = B.len;
    if (B.guardAt && p) {
      const along = (p.position.x - B.ox) * B.dx + (p.position.z - B.oz) * B.dz;
      if (along > 0.6 && along < end) end = Math.max(0.6, along - 0.35);
    }
    this._draw(end, k, dt, B.guardAt ? 1 : B.top ? 1 : L.splash);
    if (great) this._keepPair(false);
    if (B.t >= B.lit) this._toFade();
  }

  /** The palm the beam leaves from, and its way (his facing), this frame. */
  _origin() {
    const d = this.d, B = this.B;
    const p = d.tellPoint(B.side === 'L' ? 'fistL' : B.side === 'both' ? 'palms' : 'fistR', this._v);
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    // (the palm a hand's breadth out along the line, never behind his root)
    const along = (p.x - d.position.x) * fx + (p.z - d.position.z) * fz;
    const push = Math.max(0, 0.35 - along);
    B.ox = p.x + fx * push;
    B.oz = p.z + fz * push;
    B.oy = clamp(fin(p.y, 1.25), 0.6, 2.2);
    B.dx = fx;
    B.dz = fz;
    if (!Number.isFinite(B.ox + B.oz)) {
      B.ox = d.position.x + fx * 0.6;
      B.oz = d.position.z + fz * 0.6;
    }
  }

  /** How far the drawn line runs along (fx, fz) from (x, z): its length, or to a butte on it within
   *  reach (then `B.top` notes it: the splash is drawn there and the sweep takes its top). */
  _lineLen(x, z, fx, fz, len, w, great) {
    const W = this.T.world, reach = great ? this.T.great.reach : len * W.reachSmall;
    let near = Infinity;
    for (const b of RING.buttes ?? []) {
      const ox = b.x - x, oz = b.z - z, t = ox * fx + oz * fz;
      if (t <= 0) continue;
      const perp = Math.abs(-ox * fz + oz * fx), R = b.r * 0.92;
      if (perp > R + w * 0.3) continue;
      const enter = t - Math.sqrt(Math.max(0, R * R - Math.min(perp * perp, R * R)));
      if (enter > 0.5 && enter < reach && enter < near) near = enter;
    }
    const top = near < Infinity;
    if (this.B.phase === 'lit') this.B.top = top;
    return top ? near : len;
  }

  /** Is (x, z) in the strip from the palm, `len` long and `w` wide (the hero's radius added)? */
  _inStrip(x, z, len, w) {
    const B = this.B, pr = this.game.player?.radius ?? 0.45;
    const ox = x - B.ox, oz = z - B.oz, along = ox * B.dx + oz * B.dz, across = -ox * B.dz + oz * B.dx;
    return along >= -pr - 0.3 && along <= len + pr && Math.abs(across) <= w / 2 + pr;
  }

  /** The hero faces the beam's palm or him (his guard's arc: the player's own test). */
  _facing(p) {
    const B = this.B, d = this.d, half = DEFENSE.blockArc * 0.5, q = p.position;
    return facingDelta(p.yaw, q.x, q.z, B.ox, B.oz) <= half || facingDelta(p.yaw, q.x, q.z, d.position.x, d.position.z) <= half;
  }

  /** The beam's first contact on the hero (its head): a blow. */
  _firstContact(p) {
    const B = this.B, C = B.C, d = this.d, great = B.kind === 'great';
    this.stats.first++;
    const r = d.hitPlayer({
      damage: C.first.damage, knockback: C.first.knockback, knockdown: true, kind: 'beam', tell: B.tell, attack: B.attack,
      from: { x: B.ox, z: B.oz }, projectile: true, parryable: great, blockable: true, flare: great, parryPosture: 0,
      // (the great beam's head rolled through is a plain dodge: a perfect one's slow-mo would leave the
      // hero standing in its sweep; its moment is the parry)
      extra: great ? { perfect: false } : null,
    });
    if (r === RESULT.PARRIED) {
      // the head of the great beam parried: perfectly → THE CLASH; else it is held as a block
      if (p.deflect?.perfect && this._startClash(p)) return;
      this._blockTick(p, C.first.damage, C.push * 2);
    } else if (r === RESULT.BLOCKED) {
      this.stats.blocked++;
      B.guardAt = true;
    }
  }

  /** A tick of the lit beam on a hero still in it: a stream (no stagger, no perfect dodge); on a held
   *  guard facing him: guard, never health, and a slide along it. */
  _tick(p) {
    const B = this.B, C = B.C, d = this.d;
    this.stats.ticks++;
    if (p.blocking && this._facing(p)) {
      this._blockTick(p, C.tick, C.push);
      return;
    }
    // (a stream: the player staggers on a no-knockback hit of 5 or more unless one came in the last
    // 0.6 s (player.js chipGuard): the tick is dealt in parts under that, the first opens the stream)
    const scale = d.T.damageScale ?? 1, n = Math.max(1, Math.ceil((C.tick * scale) / 4.8));
    for (let i = 0; i < n; i++) {
      const r = d.hitPlayer({
        damage: C.tick / n, knockback: 0, knockdown: false, kind: 'beam', tell: B.tell === TELL.BLUE ? TELL.RED : B.tell, attack: B.attack,
        from: { x: B.ox, z: B.oz }, projectile: true, parryable: false, blockable: false, extra: { perfect: false },
      });
      if (r !== RESULT.HIT) break;
    }
  }

  /** A beam held on the guard: its cost from the guard meter (GUARD: a blow's cost), no health; the
   *  hero slides `push` m along the beam. The tick that would empty the meter goes through the player's
   *  own block, which knocks the guard open. */
  _blockTick(p, dmg, push) {
    const d = this.d, B = this.B, scale = d.T.damageScale ?? 1;
    this.stats.blocked++;
    B.guardAt = true;
    const cost = clamp(dmg * scale * GUARD.cost.normal, GUARD.costMin, GUARD.costMax);
    // (the guard pays, the hero slides along the beam away from him: player.js streamBlock; the tick
    // that would empty the meter goes through the player's own block, which knocks the guard open)
    const held = typeof p.streamBlock === 'function' ? p.streamBlock(cost, push, B.dx, B.dz) : false;
    if (!held) {
      d.hitPlayer({
        damage: dmg, knockback: 0.6, knockdown: false, kind: 'beam', tell: TELL.RED, attack: B.attack,
        from: { x: B.ox, z: B.oz }, projectile: true, parryable: false, blockable: true, extra: { perfect: false },
      });
      return;
    }
    const c = p.getChestPos?.(this._w, true);
    if (c) {
      const x = c.x - B.dx * 0.45, z = c.z - B.dz * 0.45;
      p.fx?.blockChip?.(x, c.y, z);
      d.fx.beamSplash?.(x, c.y, z, 0.8, 0, B.form);
    }
    this.game.shake?.(0.05);
    const now = this._now();
    if (now - this._blockEvt > 0.4) {
      this._blockEvt = now;
      this.game.events?.emit?.('player:block', { damage: 0, tell: B.tell === TELL.BLUE ? 'blue' : 'normal' });
    }
  }

  /** The beam drawn this frame from the palm `end` m along it: the body, the splash where it ends. */
  _draw(end, k, dt, splash) {
    const B = this.B, d = this.d, L = this.T.look;
    const ey = Math.max(L.endY, B.oy - end * 0.045);
    const ex = B.ox + B.dx * end, ez = B.oz + B.dz * end;
    B.ex = ex;
    B.ey = ey;
    B.ez = ez;
    // (k under 1 dims the core; the width is kept: fxBeam scales the body's width by sqrt(k))
    const w = B.w / Math.sqrt(Math.max(0.2, k));
    d.fx.beam?.(B.ox, B.oy, B.oz, ex, B.top ? Math.max(ey, 1.0) : ey, ez, w, k, dt, B.form);
    if (splash > 0) d.fx.beamSplash?.(ex, B.top ? Math.max(ey, 1.0) : ey, ez, k * splash, dt, B.form);
  }

  _toFade() {
    const B = this.B;
    B.phase = 'fade';
    B.fadeT = 0;
  }

  /** The beam going out (or split, or surging on after a lost clash). */
  _fade(dt) {
    const B = this.B, L = this.T.look;
    B.fadeT += dt;
    const T = B.phase === 'split' ? 0.35 : B.phase === 'surge' ? 0.5 : L.fadeOut;
    if (B.phase === 'surge' && B.fadeT < T) {
      this._origin();
      B.len = this._lineLen(B.ox, B.oz, B.dx, B.dz, B.C.len, B.C.w, true);
      this._draw(B.len, L.held, dt, 1);
      return;
    }
    const k = (1 - B.fadeT / (B.phase === 'surge' ? 0.5 + L.fadeOut : T)) * L.held;
    if (k <= 0.02 || B.fadeT > 1.2) {
      B.on = false;
      B.phase = 'off';
      return;
    }
    if (B.phase === 'split') {
      // (the beam from his palms to where it was split, dying)
      const end = Math.hypot(fin(B.cx) - B.ox, fin(B.cz) - B.oz);
      if (end > 0.6) this._draw(end, k, dt, 0);
      return;
    }
    if (Number.isFinite(B.ex)) this._draw(fin(B.len, B.C?.len ?? 10), k, dt, 0);
  }

  // ---------------------------------------------------------------- the world
  /** Every `world.every` s while lit: what stands in it is blasted (and on past its end to `carry` m:
   *  a butte's top comes off), the floor under it is trenched, the ground outside the ring catches. */
  _world() {
    const B = this.B, W = this.T.world, wd = this.game.world, D = wd?.destructibles;
    if (!wd) return;
    const great = B.kind === 'great';
    const o = this._wo;
    o.dx = B.dx;
    o.dz = B.dz;
    o.y = W.y;
    if (D?.sweep) {
      o.src = D.swing?.() ?? -1;
      const ax = B.ox + B.dx * 0.4, az = B.oz + B.dz * 0.4, ex = B.ox + B.dx * B.len, ez = B.oz + B.dz * B.len;
      D.sweep(ax, az, ex, ez, B.w * 0.5 + 0.2, W.sweep, o);
      // on past the drawn end: the light carries on (the great beam reaches the buttes)
      const far = Math.max(B.len, W.carry);
      if (far > B.len + 0.5) D.sweep(ex, ez, B.ox + B.dx * far, B.oz + B.dz * far, W.carryR, W.sweep, o);
    }
    // the trench: world.impact stations on a grid along the line (each spot once per beam)
    const t = this._to, step = W.step, power = great ? W.trenchGreat : W.trench, H = RING.half ?? 15;
    t.dx = B.dx;
    t.dz = B.dz;
    for (let s = 1.0; s <= B.len; s += step) {
      const x = B.ox + B.dx * s, z = B.oz + B.dz * s;
      const key = Math.round(x / step) * 4096 + Math.round(z / step);
      if (this._stations.has(key)) continue;
      this._stations.add(key);
      wd.impact?.(x, z, W.trenchR, power, t);
      if (Math.abs(x) > H + 0.5 || Math.abs(z) > H + 0.5) wd.ignite?.(x, z, W.trenchR + 0.3, W.ignite);
    }
  }

  // ---------------------------------------------------------------- THE CLASH
  /** A perfect parry of the great beam's head: the blade lock at range. False if it cannot start. */
  _startClash(p) {
    const d = this.d, B = this.B, K = this.T.clash;
    const dist = Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z);
    B.phase = 'clash';
    const ok = d.brain.startLock({ start: K.start, push: K.push, decay: K.decay, dur: K.dur, hold: K.hold, dist, camera: { zoom: this._pairZoom(K.margin), weight: 1 } });
    if (!ok) {
      this._toFade();
      return false;
    }
    this.stats.clashes++;
    const clip = clashClip(d.phase);
    if (clip) d.brain._play?.(clip, 0.06);
    B.clashT = 0;
    this.game.world?.forest?.ambience?.flare?.(1);
    this.game.shake?.(0.5);
    return true;
  }

  /** Each frame of the clash: the beam from his palms to the hero's blade, the head grinding on it. */
  _clash(dt) {
    const d = this.d, B = this.B, p = this.game.player, L = p?.bladeLock;
    if (!p || !L || p.state !== 'lock') {
      // (it ended without a word: a death, the Lab)
      this._toFade();
      return;
    }
    B.clashT += dt;
    this._origin();
    // he stands square to the hero, the beam on him
    const ang = Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z);
    d.yaw = ang;
    B.dx = Math.sin(ang);
    B.dz = Math.cos(ang);
    const c = p.getChestPos?.(this._w, true) ?? { x: p.position.x, y: 1.2, z: p.position.z };
    const cx = c.x - B.dx * 0.55, cy = clamp(fin(c.y, 1.2), 0.9, 1.6), cz = c.z - B.dz * 0.55;
    B.cx = cx;
    B.cy = cy;
    B.cz = cz;
    const end = Math.max(0.6, (cx - B.ox) * B.dx + (cz - B.oz) * B.dz);
    B.len = end;
    // (the body to the contact: drawn level onto the blade)
    const k = this.T.look.held;
    d.fx.beam?.(B.ox, B.oy, B.oz, cx, cy, cz, B.w / Math.sqrt(k), k, dt, B.form);
    d.fx.beamClash?.(cx, cy, cz, B.dx, B.dz, clamp(fin(L.meter, 0.5), 0, 1), dt, B.form);
    this._keepPair(true);
    if (B.clashT > this.T.clash.dur + 2) this._toFade();
  }

  /** The blade lock ended (d.onLockEnd) while a move of this kind started it: true = handled here. */
  lockEnd(won) {
    const d = this.d, B = this.B, K = this.T.clash;
    if (!B.on || B.phase !== 'clash') return false;
    if (d.mode === 'dying' || d.mode === 'dead') {
      this._toFade();
      return true;
    }
    if (won) {
      this.stats.won++;
      // the beam parted past the hero, and dies
      d.fx.beamSplit?.(fin(B.cx, d.position.x), fin(B.cy, 1.2), fin(B.cz, d.position.z), B.dx, B.dz, K.split, B.form);
      B.phase = 'split';
      B.fadeT = 0;
      d.addPosture((d.T.lock?.posture ?? 110) * K.posture);
      d.hitstop?.(0.1, 0.05);
      d._cinematic?.('bladeLock');
      this.game.world?.forest?.ambience?.flare?.(1);
      this.game.shake?.(0.6);
      if (!d.broken && d.mode !== 'broken') {
        d.emit?.('dragon:stagger');
        if (d.brain.startReact('reeling')) this._reel = K.reel;
      }
      return true;
    }
    // lost: the beam breaks through the blade
    this.stats.lost++;
    B.phase = 'surge';
    B.fadeT = 0;
    d.hitPlayer({
      damage: K.lose.damage, knockback: K.lose.knockback, knockdown: true, kind: 'beam', tell: TELL.RED, attack: B.attack,
      from: { x: B.ox, z: B.oz }, projectile: true, parryable: false, blockable: false, extra: { perfect: false },
    });
    this.game.shake?.(0.5);
    d.brain._toFoot?.(0.5);
    return true;
  }

  /** A won clash: he reels `clash.reel` s (the reeling clip held on its staggered pose), a long opening. */
  _holdReel(dt) {
    if (!(this._reel > 0)) return;
    const br = this.d.brain, R = br.react;
    if (this.d.mode !== 'react' || R?.kind !== 'reeling') {
      this._reel = 0;
      return;
    }
    this._reel -= dt;
    if (this._reel > 0.5) {
      // (hold the clip short of its end: the pose between its second and third keys)
      const hold = Math.min(0.9, R.clip.dur - 0.1);
      if (R.t > hold) R.t = hold;
      if (br.clipT > hold) br.clipT = hold;
    }
  }

  // ---------------------------------------------------------------- the camera
  /** Keep him (and the hero) in frame through the great beam (`must`: both, the clash). */
  _keepPair(must) {
    const rig = this.game.cameraRig, d = this.d, p = this.game.player?.position;
    if (!rig?.keep) return;
    rig.keep(d.position.x, 1.2, d.position.z, 1.6, must);
    if (p && must) rig.keep(p.x, 1.0, p.z, 1.6, true);
  }

  /** The cinematic zoom (desktop metres: flow.cinematic) that frames him and the hero with `m` m
   *  round them, at this camera (the phone's closer one too). */
  _pairZoom(m) {
    const rig = this.game.cameraRig, cam = this.game.camera, d = this.d, p = this.game.player?.position;
    if (!rig || !p) return 0;
    const tanV = Math.tan(((Number.isFinite(cam?.fov) ? cam.fov : CONFIG.camera.fov) * Math.PI) / 360);
    const asp = Number.isFinite(cam?.aspect) && cam.aspect > 0.2 ? cam.aspect : 16 / 9;
    const pitch = fin(rig.pitch, CONFIG.camera.pitch);
    const hx = Math.abs(p.x - d.position.x) / 2 + m, hz = Math.abs(p.z - d.position.z) / 2 + m;
    const need = Math.max(hx / (tanV * asp * 0.88), (hz * Math.sin(pitch) + 1.2) / (tanV * 0.78));
    const base = fin(rig.targetDistance, CONFIG.camera.distance);
    const extra = Math.max(0, need - base);
    return extra * (CONFIG.camera.distance / Math.max(1, fin(rig.defaultDistance, CONFIG.camera.distance)));
  }

  _now() {
    return this.game.time ?? 0;
  }
}
