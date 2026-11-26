import * as THREE from 'three';
import { TELL, RESULT } from '../../../combat/rules.js';
import { TUNE as HERO_TUNE } from '../../player/player.js';

// Bai Wuji's spells (the spells agent's file): Azure Draw (the blue pull), Crimson Cast (the red push),
// the Violet Null (the two merged), and the transition's unveiling burst. A HANDLER on the routing
// contract (untouched.js header): moves/spells.js creates it (`create(d)`) and names the beat fields it
// owns (`FIELDS`: wjDraw, wjYank, wjCast, wjNull, wjMoment); untouched.js calls the hooks below through
// `?.` for every beat that carries one of them. Numbers: tuningSpells.js (TUNING.spells, `this.T`).
//
// THE SPELLS (BRIEF R4: none can be blocked: a held guard is OPENED (breaksGuard), never paid in health;
// each has a tell from its windup's start and is FIXED before it fires):
//   knot   Azure Draw: at `open` of the windup a knot (pull.js) opens `beyond` m past the hero on his line
//          from Wuji; it drags him (and up to `carry` loose cars / slabs, taken and carried in; bricks
//          bitten off what it touches fly to it) until the impact, then COLLAPSES: red, `crush` m round
//          it. The place never moves after it opens. A hero at its edge walks out against the drag; one in
//          its heart must roll.
//   yank   the Yank: `travel` s before the fist (always that long, whatever the distance) the hero is
//          pulled to `stop` m in front of him (his knock-back velocity steered each frame), set down
//          `early` s before the fist: the parry's moment is the arrival. Blue; a held guard is opened.
//   point  Crimson Cast: the hero's place is fixed at `fix`; a red point flies there from his hand,
//          arriving at the impact: the burst (red, `r` m, 9 m of throw through whatever stands behind,
//          wjCrash), a crater, the loose pieces round it thrown outward.
//   palm   Cast's second form: out of a blink (core's wjBlink) the point held at his palm, the burst
//          `reach` m ahead of him at the impact (a short red).
//   wreck  the Wrecking Knot: the path (`len` m, across the hero's line from Wuji, through his place) is
//          fixed at `fix` and shown (fx.drawPath); the knot runs it in `time` s, crossing the hero's fixed
//          place AT the impact: it drags him toward its path, sweeps every piece on its way, furrows the
//          road; red on its strip (`half` m), from the glint on.
//   line   THE VIOLET NULL: the charge over his fingers (fx.nullCharge, merged at `merge`), the line fixed
//          at `fix` and shown on the road (fx.nullLine); at the impact a line `w` m wide and `len` long:
//          `contact` s it can touch the hero (one red hit, the heaviest of the fight, never lethal from
//          full health: `lethalCap`), every piece on the strip felled outright (swept at `power`, again
//          every `every` s for `after` s: a tower's base under its falling top goes too), the void's
//          floating pieces too, and a wide trench (scars `beam` with the half-width w / 2). Never twice
//          inside `gap` s (WjSpells.weigh; also counts the Last Null).
//   last   THE LAST NULL (phase 3, once below `below` of his bar): wider, longer, turning `turn` deg over
//          its contact (the end of its turn shown as a second line before it fires).
//   unveil (core's wjMoment: 'unveil', the transition's impact) Cast's burst from where he stands: the
//          liftable pieces within `r` thrown outward, the ruins near toppled; the push is core's (no damage:
//          wjCrashDamage 0 here).
// Every spell that lands: fx.weight(kind, dx, dz) ('spell' / 'null' / 'huge') and fx.shove along the throw.
// The fx agent's newer methods are called through `?.`: nullLine(seg, k), castMark(x, z, r, k),
// drawPath(seg, k) (every frame while shown); fx.unveil is core's to call (untouched.js afterPose).
// Lab / film: d.parts.spells.stats; the spells are triggered by name (d.brain.trigger).

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const DEG = Math.PI / 180;
const STUCK = new Set(['knockdown', 'dead', 'plunge', 'flurry', 'lock', 'ghostep', 'mikiri']);
const SPELL_MOVES = new Set(['azureDraw', 'azureYank', 'crimsonCast', 'crimsonPalm', 'wreckingKnot', 'violetNull', 'lastNull']);
const NULL_MOVES = new Set(['violetNull', 'lastNull']);

export class WjSpells {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.rec = null; // the live spell of the move in hand: { kind, act, beat, ... }
    this.lit = null; // a Null's line while it is lit (outlives its beat's windup; ends on its own)
    this.after = null; // a Null's strip swept again for a while: { ax, az, bx, bz, half, t, next, src }
    this.yank = null; // the Yank's pull in progress
    this._around = [];
    this._o = { kind: 'blast', by: 'boss', dx: NaN, dz: NaN, src: -1, scar: true, mark: 'blast', hot: false, y: 1, tx: undefined, tz: undefined };
    this._sw = { kind: 'blast', by: 'boss', dx: 0, dz: 0, src: -1, down: true };
    this._gb = { kind: 'beam', power: 1, dx: 0, dz: 1, len: 1, w: 2.5, by: 'boss', hot: true, r: 2 };
    this._seg = { ax: 0, az: 0, bx: 0, bz: 0, w: 5 };
    this._seg2 = { ax: 0, az: 0, bx: 0, bz: 0, w: 5 };
    this._pt = { x: 0, y: 1.2, z: 0, k: 0 };
    this._v = new THREE.Vector3();
    this._knotFx = { on: true, x: 0, z: 0, y: 1.1, r: 3, strength: 2, falloff: 1, life: 1, t: 0, k: 0, id: 0 };
    this.reset();
  }

  /** His spells' numbers (TUNING.spells). */
  get T() {
    return this.d.T.spells;
  }

  /** Fight reset (Untouched.reset): forget everything in flight. */
  reset() {
    this._cancel();
    this.lit = null;
    this.after = null;
    this.blockT = 0;
    this.lastWasSpell = false;
    this._seen = null;
    this.lastNullT = -Infinity;
    this.lastDone = false;
    this.p2T = NaN;
    this._ids = 9000;
    this.stats = { draws: 0, collapses: 0, crushed: 0, carried: 0, bitten: 0, yanks: 0, pulled: 0, casts: 0, bursts: 0, thrown: 0, wrecks: 0, swept: 0, nulls: 0, lastNulls: 0, nullHits: 0, felled: 0, trenches: 0, unveils: 0, flattened: 0, cancelled: 0 };
    /** what each spell did to the hero, for the suite: [{ spell, r, t, x, z }] (the last 32) */
    this.log = [];
  }

  /** Stop whatever is held / lit now (a reaction, a break, the domain, the death). */
  stop() {
    this._cancel();
    if (this.lit) this.lit.noHero = true; // (the erasure already happened; its line fades by itself)
  }

  /** A spell is still alive on the floor (a knot, a point, a lit line, a pull). */
  get busy() {
    return !!(this.rec?.live || this.lit || this.yank);
  }

  _cancel() {
    const R = this.rec;
    if (R) {
      if (R.knot) R.knot.on = false;
      const D = this.game.world?.destructibles;
      for (const b of R.carried ?? []) D?.drop?.(b);
      if (R.live) this.stats.cancelled++;
    }
    this.rec = null;
    this._endYank();
  }

  // ---------------------------------------------------------------- the choice
  /** The AI weighs a move with a beat of this handler's: return the weight (0 = not now). */
  weigh(name, def, w, dist) {
    if (!SPELL_MOVES.has(name)) return w;
    const d = this.d, C = this.T.choice, now = this.game.time ?? 0;
    if (this.lastWasSpell || this.busy) return 0;
    if (NULL_MOVES.has(name)) {
      if (now - this.lastNullT < this.T.null.gap) return 0;
      if (name === 'lastNull') {
        const k = d.hp / Math.max(1, d.maxHp);
        return d.phase >= 3 && !this.lastDone && k <= this.T.lastNull.below ? this.T.lastNull.weight : 0;
      }
      // (the first one early in phase 2, so the player sees it)
      if (d.phase === 2 && this.stats.nulls === 0 && Number.isFinite(this.p2T) && now - this.p2T >= this.T.null.first) w *= this.T.null.firstK;
    }
    if (dist >= C.far) w *= C.farK;
    else if (dist <= C.near) w *= C.nearK;
    if (this.blockT >= C.blockAt) w *= C.blockK;
    return w;
  }

  /** A move with a beat of this handler's starts: false refuses it (nothing has changed yet). */
  onActStart(A) {
    if (SPELL_MOVES.has(A?.name) && (this.lit || this.rec?.live || this.yank)) return false;
    return true;
  }

  /** A beat's reach for the brain: a spell reaches wherever the hero is. */
  reach(b) {
    const D = b?.def;
    if (!D) return undefined;
    if (D.wjDraw || D.wjYank || D.wjNull || D.wjCast === 'point') return Infinity;
    return undefined;
  }

  // ---------------------------------------------------------------- every frame
  /** Every frame after the brain (brainFrame). */
  frame(dt) {
    const d = this.d, p = this.game.player;
    try {
      // the hero's guard, for the choice (a hero who keeps blocking is answered with a spell)
      const C = this.T.choice;
      if (p?.blocking) this.blockT = Math.min(C.blockMax, this.blockT + dt);
      else this.blockT = Math.max(0, this.blockT - dt * C.blockFall);
      // the moves as they start: was the last one a spell? (never two back to back)
      const a = d.brain?.act;
      if (a && a !== this._seen && d.mode === 'act') {
        this._seen = a;
        if (!a.def.transition && !a.def.counter) this.lastWasSpell = SPELL_MOVES.has(a.name);
      }
      if (d.phase >= 2 && !Number.isFinite(this.p2T)) this.p2T = this.game.time ?? 0;
      if (d.phase < 2) this.p2T = NaN;
      // the move in hand gone (a reaction, a break, a link out): what it held lets go
      const R = this.rec;
      if (R && (d.brain?.act !== R.act || d.mode !== 'act' || R.beat.feint)) this._cancel();
      if (this.yank) this._yankStep(dt);
      if (this.lit) this._litStep(dt);
      if (this.after) this._afterStep(dt);
    } catch (err) {
      console.error('[untouched] spells frame', err);
      this._cancel();
      this.lit = null;
      this.after = null;
    }
  }

  // ---------------------------------------------------------------- the beats
  beatMotion(b, u, s, dt) {
    const D = b.def;
    if (b.feint) return;
    try {
      if (D.wjMoment === 'unveil') this._unveilMotion(b, u);
      else if (D.wjDraw === 'knot') this._knotMotion(b, u, s, dt);
      else if (D.wjDraw === 'wreck') this._wreckMotion(b, u, s, dt);
      else if (D.wjYank) this._yankMotion(b, u, s);
      else if (D.wjCast) this._castMotion(b, u, s, dt);
      else if (D.wjNull) this._nullMotion(b, u, s, dt);
    } catch (err) {
      console.error('[untouched] spells beatMotion', err);
      this._cancel();
    }
  }

  onImpact(b, s, a) {
    const D = b.def;
    try {
      if (D.wjDraw === 'knot') this._collapse(b, a);
      else if (D.wjCast) this._burst(b, a);
      else if (D.wjNull) this._fire(b, a);
      else if (D.wjDraw === 'wreck') this.d.fx?.weight?.('spell', this.rec?.px ?? 0, this.rec?.pz ?? 1);
    } catch (err) {
      console.error('[untouched] spells onImpact', err);
      this._cancel();
    }
  }

  /** Before a blow of one of this handler's beats reaches the hero: its unblockable fields. */
  hitPlayer(o) {
    const D = o?.beat?.def;
    if (!D) return o;
    if (D.wjMoment === 'unveil') return { ...o, extra: { ...(o.extra ?? null), wjCrashDamage: 0 } };
    if (D.wjYank) return { ...o, extra: { ...(o.extra ?? null), around: true, breaksGuard: true } };
    return o;
  }

  /** After it: the hero's RESULT (the log; the throw's skid). */
  onHit(o, r) {
    const D = o?.beat?.def;
    if (!D || D.wjMoment) return;
    if (D.wjYank) this._note('yank', r);
  }

  // ---------------------------------------------------------------- helpers
  _hero() {
    const p = this.game.player;
    return p?.alive && p.position ? p : null;
  }

  _note(spell, r) {
    const p = this.game.player;
    this.log.push({ spell, r, t: this.game.time ?? 0, x: p?.position?.x ?? 0, z: p?.position?.z ?? 0 });
    if (this.log.length > 32) this.log.shift();
  }

  /** One unblockable spell blow on the hero (a held guard opened, no health through it). */
  _strike(b, a, spell, damage, knockback, fx, fz, o = {}) {
    const d = this.d, p = this._hero();
    if (!p) return RESULT.IGNORED;
    const scale = d.T.damageScale ?? 1;
    const cap = (fin(this.T.null.lethalCap, 0.78) * (p.maxHp ?? 160)) / scale;
    const r = d.hitPlayer({
      damage: Math.min(damage, cap), knockback, knockdown: o.knockdown ?? true, kind: 'spell', tell: o.tell ?? TELL.RED, attack: a?.name ?? spell,
      from: { x: fx, z: fz }, beat: b, projectile: true,
      extra: { parryable: false, blockable: true, breaksGuard: true, ...(o.extra ?? null) },
    });
    this._note(spell, r);
    if (r === RESULT.HIT && knockback > 0) {
      const q = p.position, dx = q.x - fx, dz = q.z - fz, l = Math.hypot(dx, dz) || 1;
      d.fx?.shove?.(q.x, q.z, dx / l, dz / l, knockback);
    }
    return r;
  }

  /** The loose, liftable pieces within `reach` m of (x, z) (cars, slabs; not floor slabs, not absent). */
  _loose(x, z, reach, max) {
    const D = this.game.world?.destructibles, out = this._around;
    if (!D?.around) return (out.length = 0), out;
    D.around(x, z, reach, out, 64);
    let n = 0;
    for (let i = 0; i < out.length; i++) {
      const b = out[i];
      if (b.lift === 1 && !b.floor && !(b.y0 > 0.5) && n < max) out[n++] = b;
    }
    out.length = n;
    return out;
  }

  // ---------------------------------------------------------------- AZURE DRAW: the knot
  _knotMotion(b, u, s, dt) {
    const d = this.d, T = this.T.draw, a = d.brain.act;
    let R = this.rec;
    if (!R || R.beat !== b) {
      if (u < T.open || u >= 1 || !s || b._wjOpened) return;
      b._wjOpened = true;
      // the knot opens BEYOND the hero, on his line from Wuji: its place is fixed from now
      const p = s.p, dx = p.x - d.position.x, dz = p.z - d.position.z, l = Math.hypot(dx, dz) || 1;
      let x = p.x + (dx / l) * T.beyond, z = p.z + (dz / l) * T.beyond;
      const rr = Math.hypot(x, z);
      if (rr > T.maxR) {
        x *= T.maxR / rr;
        z *= T.maxR / rr;
      }
      const knot = d.pull.add({ x, z, strength: T.strength, r: T.r, falloff: T.falloff, life: 60 });
      if (!knot) return;
      knot.y = 1.15;
      R = this.rec = { kind: 'knot', act: a, beat: b, knot, live: true, carried: [], biteT: 0, x, z };
      this.stats.draws++;
      // loose wreckage near it is taken and drifts in (a car, a slab)
      const W = this.game.world?.destructibles;
      if (W?.take) {
        for (const c of this._loose(x, z, T.grab, T.carry * 2)) {
          if (R.carried.length >= T.carry) break;
          if (Math.hypot(c.x - p.x, c.z - p.z) < 1.6) continue; // (not the one the hero stands against)
          if (W.take(c)) {
            c._wjY = 0;
            R.carried.push(c);
            this.stats.carried++;
          }
        }
      }
    }
    if (u >= 1 || !R.knot?.on) return;
    const K = R.knot;
    d.fx?.drawKnot?.(K, dt);
    // the carried pieces drift in, lifting
    const W = this.game.world?.destructibles;
    for (const c of R.carried) {
      const px = c.px ?? c.x, pz = c.pz ?? c.z, dx = K.x - px, dz = K.z - pz, l = Math.hypot(dx, dz);
      const step = Math.min(l, T.carrySpeed * dt * (0.5 + 0.5 * Math.min(1, l / 3)));
      c._wjY = Math.min(T.carryY, (c._wjY ?? 0) + dt * 1.2);
      const k = l > 1e-3 ? step / l : 0;
      W?.carry?.(c, px + dx * k, c._wjY, pz + dz * k, 0.25 * Math.sin((this.game.time ?? 0) * 2 + c.id), Math.atan2(dx, dz));
    }
    // what it touches is bitten: bricks off the pieces round it fly to it
    R.biteT -= dt;
    if (R.biteT <= 0 && W?.strike) {
      R.biteT = T.bite.every;
      this._bite(K.x, K.z, T.bite);
    }
  }

  /** The knot's bite: every piece within `reach` m loses bricks that fly toward (x, z); the core harder. */
  _bite(x, z, B) {
    const W = this.game.world?.destructibles, out = this._around;
    if (!W?.around) return;
    W.around(x, z, B.reach, out, 32);
    const o = this._o;
    let n = 0;
    for (let i = 0; i < out.length && n < B.max; i++) {
      const c = out[i], dx = x - c.x, dz = z - c.z, l = Math.hypot(dx, dz) || 1;
      o.kind = 'blunt';
      o.dx = dx / l;
      o.dz = dz / l;
      o.tx = dx / l;
      o.tz = dz / l;
      o.y = 1;
      o.src = W.swing?.() ?? -1;
      const pw = l - c.r < B.core ? B.corePower : B.power;
      if (W.strike(c.x, c.z, 0.05, pw, o)) n++;
    }
    o.tx = o.tz = undefined;
    this.stats.bitten += n;
  }

  /** The collapse (the beat's impact): red on `crush` m round the knot; what it carried is crushed in it. */
  _collapse(b, a) {
    const R = this.rec, d = this.d, T = this.T.draw;
    if (!R || R.beat !== b || !R.knot) return;
    const K = R.knot;
    d.fx?.drawCollapse?.(K);
    K.on = false;
    R.live = false;
    this.stats.collapses++;
    const p = this._hero();
    if (p && Math.hypot(p.position.x - K.x, p.position.z - K.z) <= T.crush + (p.radius ?? 0.45)) {
      if (this._strike(b, a, 'draw', T.damage, T.knockback, K.x, K.z) === RESULT.HIT) this.stats.crushed++;
    }
    const W = this.game.world, D = W?.destructibles;
    for (const c of R.carried) D?.throwTo?.(c, K.x + (c.id % 3 - 1) * 0.3, K.z + ((c.id >> 2) % 3 - 1) * 0.3, { time: 0.22, power: 1.8, radius: 1.8, by: 'boss' });
    R.carried.length = 0;
    const o = this._o;
    o.kind = 'blast';
    o.mark = 'blast';
    o.hot = false;
    o.dx = o.dz = NaN;
    o.y = 1;
    o.src = D?.swing?.() ?? -1;
    W?.impact?.(K.x, K.z, T.worldR, T.power, o);
    const dx = K.x - d.position.x, dz = K.z - d.position.z;
    d.fx?.weight?.('spell', dx, dz);
    this.rec = null;
  }

  // ---------------------------------------------------------------- THE WRECKING KNOT
  _wreckMotion(b, u, s, dt) {
    const d = this.d, T = this.T.wreck, a = d.brain.act;
    let R = this.rec;
    if (!R || R.beat !== b) {
      if (u < T.fix || !s) return;
      // the path: across the hero's line from Wuji, through his place now (fixed)
      const p = s.p, dx = p.x - d.position.x, dz = p.z - d.position.z, l = Math.hypot(dx, dz) || 1;
      const side = (this._side = -(this._side || 1));
      const px = (-dz / l) * side, pz = (dx / l) * side, h = T.len / 2;
      R = this.rec = {
        kind: 'wreck', act: a, beat: b, live: true, carried: [], knot: null, hit: false,
        ax: p.x - px * h, az: p.z - pz * h, bx: p.x + px * h, bz: p.z + pz * h, px, pz, cx: p.x, cz: p.z,
        tFix: a?.t ?? 0, lastX: NaN, lastZ: NaN, furrow: 0, src: this.game.world?.destructibles?.swing?.() ?? -1,
      };
      this.stats.wrecks++;
    }
    if (!R.live) return;
    const now = a?.t ?? 0, speed = T.len / T.time, start = b.impact - T.len / 2 / speed;
    const seg = this._seg;
    seg.ax = R.ax;
    seg.az = R.az;
    seg.bx = R.bx;
    seg.bz = R.bz;
    seg.w = T.half * 2;
    if (now < start) {
      d.fx?.drawPath?.(seg, clamp01((now - R.tFix) / Math.max(0.05, start - R.tFix)));
      return;
    }
    // the knot runs the path (it crosses the hero's fixed place at the impact)
    const run = Math.min(T.len, (now - start) * speed);
    const x = R.ax + R.px * run, z = R.az + R.pz * run;
    if (!R.knot) {
      R.knot = d.pull.add({ x, z, strength: T.strength, r: T.r, falloff: 1, life: 60 });
      if (R.knot) R.knot.y = 1.0;
    }
    const K = R.knot;
    if (K) {
      K.x = x;
      K.z = z;
      d.fx?.drawKnot?.(K, dt);
    }
    d.fx?.drawPath?.(seg, 1);
    // what is on its way is chewed (one blow a piece: one src for the whole run), the road furrowed
    const W = this.game.world, D = W?.destructibles;
    if (Number.isFinite(R.lastX) && D?.sweep) {
      const o = this._sw;
      o.kind = 'blunt';
      o.dx = R.px;
      o.dz = R.pz;
      o.src = R.src;
      o.down = true;
      this.stats.swept += D.sweep(R.lastX, R.lastZ, x, z, T.chew, T.power, o);
      R.furrow += Math.hypot(x - R.lastX, z - R.lastZ);
      if (R.furrow >= T.furrow) {
        R.furrow = 0;
        const g = this._gb;
        g.kind = 'dash';
        g.power = 1.3;
        g.dx = R.px;
        g.dz = R.pz;
        g.len = T.furrow;
        g.w = undefined;
        g.hot = false;
        g.r = T.half;
        W?.groundBlow?.(x - R.px * T.furrow, z - R.pz * T.furrow, g);
      }
    }
    R.lastX = x;
    R.lastZ = z;
    // the hero on its strip: one red hit, from the glint on
    const p = this._hero();
    if (p && !R.hit && now >= b.flash - 1e-6 && Math.hypot(p.position.x - x, p.position.z - z) <= T.half + (p.radius ?? 0.45)) {
      const r = this._strike(b, a, 'wreck', T.damage, T.knockback, x - R.px * 1.2, z - R.pz * 1.2);
      if (r !== RESULT.IGNORED) R.hit = true;
    }
    if (run >= T.len - 1e-6 || u >= 2) {
      if (K) K.on = false;
      R.live = false;
    }
  }

  // ---------------------------------------------------------------- THE YANK
  _yankMotion(b, u, s) {
    const d = this.d, T = this.T.yank, a = d.brain.act, p = this._hero();
    if (!a || !p || b._wjYanked) return;
    // the cue: a blue knot on the hero himself until the pull
    const now = a.t, t0 = b.impact - T.travel - T.early;
    if (now < t0) {
      const K = this._knotFx;
      K.x = p.position.x;
      K.z = p.position.z;
      K.y = 1.1;
      K.r = 2.2;
      K.k = clamp01((now - b.start) / Math.max(0.05, t0 - b.start));
      K.id = b._wjId ??= ++this._ids;
      d.fx?.drawKnot?.(K, this.game.dt ?? 1 / 60);
      return;
    }
    b._wjYanked = true;
    if (STUCK.has(p.state) || p.state === 'roll' || this.d.domain?.holding) return;
    const q = p.position, dx = q.x - d.position.x, dz = q.z - d.position.z, l = Math.hypot(dx, dz);
    if (!(l > 0.2) || l > T.max) return;
    this.yank = { act: a, beat: b, t: 0, T: T.travel, tx: d.position.x + (dx / l) * T.stop, tz: d.position.z + (dz / l) * T.stop, from: l };
    this.stats.yanks++;
    void s, u;
  }

  /** The pull: his knock-back velocity steered each frame so he arrives at the stop `travel` s on. */
  _yankStep(dt) {
    const Y = this.yank, d = this.d, p = this._hero();
    if (!p || d.brain.act !== Y.act || d.mode !== 'act' || STUCK.has(p.state) || p.state === 'roll' || d.domain?.holding) {
      this._endYank();
      return;
    }
    Y.t += dt;
    const q = p.position, left = Y.T - Y.t;
    if (left <= 0) {
      this.stats.pulled++;
      this._endYank(true);
      return;
    }
    const kd = Math.exp(-(HERO_TUNE?.knockbackDecay ?? 6) * Math.max(dt, 1e-4));
    let vx = (Y.tx - q.x) / Math.max(left, dt), vz = (Y.tz - q.z) / Math.max(left, dt);
    const v = Math.hypot(vx, vz), cap = this.T.yank.maxSpeed;
    if (v > cap) {
      vx *= cap / v;
      vz *= cap / v;
    }
    // (his own running is taken out of it: the pull's length is fixed)
    p.kb.x = (vx - fin(p.vel?.x)) / kd;
    p.kb.z = (vz - fin(p.vel?.z)) / kd;
    const K = this._knotFx;
    K.x = q.x;
    K.z = q.z;
    K.k = clamp01(Y.t / Y.T);
    d.fx?.drawKnot?.(K, dt);
  }

  _endYank(arrived = false) {
    const Y = this.yank, p = this.game.player;
    this.yank = null;
    if (Y && p?.kb && (arrived || p.alive)) {
      p.kb.x = 0;
      p.kb.z = 0;
    }
  }

  // ---------------------------------------------------------------- CRIMSON CAST
  _castMotion(b, u, s, dt) {
    if (u >= 1) return; // (its burst is the impact's: nothing after it)
    const d = this.d, a = d.brain.act, kind = b.def.wjCast;
    let R = this.rec;
    const P = this._pt;
    if (kind === 'palm') {
      if (!R || R.beat !== b) R = this.rec = { kind: 'palm', act: a, beat: b, live: true, carried: [] };
      if (u >= 1) return;
      // held at his palm through the windup
      d.handPoint?.('R', this._v);
      P.x = fin(this._v.x, d.position.x);
      P.y = fin(this._v.y, 1.2);
      P.z = fin(this._v.z, d.position.z);
      P.k = clamp01(u);
      d.fx?.castPoint?.(P, dt);
      return;
    }
    const T = this.T.cast;
    if (!R || R.beat !== b) {
      if (u < T.fix || !s) {
        // the point grows at his fingers until the place is fixed
        d.handPoint?.('R', this._v);
        P.x = fin(this._v.x, d.position.x);
        P.y = fin(this._v.y, 1.3);
        P.z = fin(this._v.z, d.position.z);
        P.k = clamp01(u / T.fix) * 0.6;
        d.fx?.castPoint?.(P, dt);
        return;
      }
      d.handPoint?.('R', this._v);
      R = this.rec = {
        kind: 'point', act: a, beat: b, live: true, carried: [], x: s.p.x, z: s.p.z, tFix: a?.t ?? 0,
        hx: fin(this._v.x, d.position.x), hy: fin(this._v.y, 1.3), hz: fin(this._v.z, d.position.z),
      };
      this.stats.casts++;
    }
    if (u >= 1 || !R.live) return;
    // it flies from his hand to the fixed place, arriving at the impact
    const k = clamp01(((a?.t ?? 0) - R.tFix) / Math.max(0.05, b.impact - R.tFix));
    const e = k * k * (3 - 2 * k);
    P.x = R.hx + (R.x - R.hx) * e;
    P.z = R.hz + (R.z - R.hz) * e;
    P.y = R.hy + (0.9 - R.hy) * e + Math.sin(Math.PI * k) * 0.8;
    P.k = 0.6 + 0.4 * k;
    d.fx?.castPoint?.(P, dt);
    d.fx?.castMark?.(R.x, R.z, T.r, k);
  }

  /** The burst (the beat's impact): red round the point; a crater; the loose pieces thrown outward. */
  _burst(b, a) {
    const d = this.d, R = this.rec, palm = b.def.wjCast === 'palm';
    if (!R || R.beat !== b) return;
    const T = palm ? this.T.palm : this.T.cast;
    let x = R.x, z = R.z;
    if (palm) {
      const f = d.yaw;
      x = d.position.x + Math.sin(f) * T.reach;
      z = d.position.z + Math.cos(f) * T.reach;
    }
    R.live = false;
    this.rec = null;
    this.stats.bursts++;
    d.fx?.castBurst?.(x, z, T.worldR, T.power);
    const p = this._hero();
    if (p && Math.hypot(p.position.x - x, p.position.z - z) <= T.r + (p.radius ?? 0.45)) {
      // (from the point; a hero standing on it is thrown away from Wuji)
      let fx = x, fz = z;
      if (Math.hypot(p.position.x - x, p.position.z - z) < 0.3) {
        const dx = p.position.x - d.position.x, dz = p.position.z - d.position.z, l = Math.hypot(dx, dz) || 1;
        fx = p.position.x - dx / l;
        fz = p.position.z - dz / l;
      }
      this._strike(b, a, palm ? 'palm' : 'cast', T.damage, T.knockback, fx, fz);
    }
    const W = this.game.world, D = W?.destructibles;
    const o = this._o;
    o.kind = 'blast';
    o.mark = 'blast';
    o.hot = true;
    o.dx = o.dz = NaN;
    o.y = 1;
    o.src = D?.swing?.() ?? -1;
    W?.impact?.(x, z, T.worldR, T.power, o);
    if (!palm) this._throwOut(x, z, T.throwR, T.throwMin, T.throwMax, T.throwN);
    d.fx?.weight?.('spell', x - d.position.x, z - d.position.z);
  }

  /** The liftable pieces within `reach` of (x, z) are thrown outward (min .. max m), `n` at most. */
  _throwOut(x, z, reach, min, max, n) {
    const D = this.game.world?.destructibles;
    if (!D?.take || !D.throwTo) return 0;
    let k = 0;
    for (const c of this._loose(x, z, reach, n * 2)) {
      if (k >= n) break;
      const dx = c.x - x, dz = c.z - z, l = Math.hypot(dx, dz);
      const ux = l > 0.1 ? dx / l : Math.sin(c.id), uz = l > 0.1 ? dz / l : Math.cos(c.id);
      const far = min + (max - min) * clamp01(1 - l / Math.max(0.1, reach));
      if (!D.take(c)) continue;
      D.throwTo(c, c.x + ux * far, c.z + uz * far, { power: 1.6, by: 'boss' });
      k++;
    }
    this.stats.thrown += k;
    return k;
  }

  // ---------------------------------------------------------------- THE VIOLET NULL
  _nullMotion(b, u, s, dt) {
    if (u >= 1) return; // (lit at the impact: frame() draws it from there)
    const d = this.d, last = b.def.wjNull === 'last', T = last ? this.T.lastNull : this.T.null, a = d.brain.act;
    let R = this.rec;
    if (!R || R.beat !== b) R = this.rec = { kind: last ? 'last' : 'line', act: a, beat: b, live: true, carried: [], fixed: false };
    if (u >= 1) return;
    // the charge over his fingers: blue and red, merged at `merge`
    d.fx?.nullCharge?.(d, clamp01(u / T.merge), null, null);
    if (!R.fixed && s && u >= T.fix) {
      // the LINE is fixed: from him through the hero's place now
      const dx = s.p.x - d.position.x, dz = s.p.z - d.position.z, l = Math.hypot(dx, dz) || 1;
      R.fixed = true;
      R.ang = Math.atan2(dx / l, dz / l);
      R.tFix = a?.t ?? 0;
      R.ox = d.position.x;
      R.oz = d.position.z;
      R.turn = last ? (this._side = -(this._side || 1)) * T.turn * DEG : 0;
      // (the Last Null starts half its turn to one side of the hero, and turns through him)
      R.a0 = R.ang - R.turn * 0.5;
    }
    if (R.fixed) {
      d.yaw = R.ang;
      const k = clamp01(((a?.t ?? 0) - R.tFix) / Math.max(0.05, b.impact - R.tFix));
      d.fx?.nullLine?.(this._segAt(this._seg, R, R.a0, T), k);
      if (last) d.fx?.nullLine?.(this._segAt(this._seg2, R, R.a0 + R.turn, T), k * 0.6);
    }
  }

  _segAt(seg, R, ang, T) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    seg.ax = R.ox + dx * 0.8;
    seg.az = R.oz + dz * 0.8;
    seg.bx = R.ox + dx * T.len;
    seg.bz = R.oz + dz * T.len;
    seg.w = T.w;
    return seg;
  }

  /** The impact: the line is lit (its contact, its erasure, its trench). */
  _fire(b, a) {
    const d = this.d, R = this.rec, last = b.def.wjNull === 'last', T = last ? this.T.lastNull : this.T.null;
    if (!R || R.beat !== b) return;
    if (!R.fixed) {
      R.fixed = true;
      R.ang = d.yaw;
      R.ox = d.position.x;
      R.oz = d.position.z;
      R.turn = 0;
      R.a0 = R.ang;
    }
    R.live = false;
    this.rec = null;
    this.lastNullT = this.game.time ?? 0;
    if (last) {
      this.lastDone = true;
      this.stats.lastNulls++;
    } else this.stats.nulls++;
    const D = this.game.world?.destructibles;
    this.lit = {
      beat: b, act: a, T, last, t: 0, hit: false, noHero: false, ox: R.ox, oz: R.oz, a0: R.a0, turn: R.turn, ang: R.a0,
      src: D?.swing?.() ?? -1, done: false,
    };
    d.yaw = R.a0;
    // the erasure: what is on the strip now goes at once (the Last Null's turn sweeps it on as it turns)
    this._erase(this.lit, R.a0);
    const dx = Math.sin(R.a0), dz = Math.cos(R.a0);
    d.fx?.weight?.('null', dx, dz);
    this.game.cameraRig?.keep?.(R.ox + dx * 8, 1, R.oz + dz * 8, 9, false);
  }

  /** Every piece on the strip at angle `ang` is felled outright (its tops, its floor, the void's floating pieces). */
  _erase(L, ang) {
    const D = this.game.world?.destructibles;
    if (!D?.sweep) return 0;
    const T = L.T, o = this._sw, dx = Math.sin(ang), dz = Math.cos(ang);
    o.kind = 'blast';
    o.dx = dx;
    o.dz = dz;
    o.src = L.src;
    o.down = true;
    const n = D.sweep(L.ox + dx * 0.8, L.oz + dz * 0.8, L.ox + dx * T.len, L.oz + dz * T.len, T.w / 2, this.T.null.power, o);
    this.stats.felled += n;
    return n;
  }

  _litStep(dt) {
    const L = this.lit, d = this.d, T = L.T;
    L.t += dt;
    const k = clamp01(L.t / T.beam);
    // the Last Null turns through its contact
    if (L.last && L.turn) {
      const ang = L.a0 + L.turn * clamp01(L.t / T.contact);
      if (Math.abs(ang - L.ang) > 0.5 * DEG) {
        L.ang = ang;
        this._erase(L, ang);
      }
      if (d.mode === 'act' && d.brain.act === L.act) d.yaw = ang;
    }
    const seg = this._segAt(this._seg, L, L.ang, T);
    seg.y = 1.0;
    d.fx?.nullBeam?.(seg, k);
    // the hero in it at the instant: one hit (the heaviest of the fight), thrown along it
    const p = this._hero();
    if (p && !L.hit && !L.noHero && L.t <= T.contact + 1e-6) {
      const dx = Math.sin(L.ang), dz = Math.cos(L.ang), q = p.position;
      const ox = q.x - L.ox, oz = q.z - L.oz, along = ox * dx + oz * dz, across = -ox * dz + oz * dx;
      if (along >= 0.3 && along <= T.len + (p.radius ?? 0.45) && Math.abs(across) <= T.w / 2 + (p.radius ?? 0.45)) {
        // (thrown along the line: the blow comes from behind him on it, a hair off its middle)
        const sx = L.ox + dx * (along - 2) + -dz * across * 0.2, sz = L.oz + dz * (along - 2) + dx * across * 0.2;
        const r = this._strike(L.beat, L.act, L.last ? 'lastNull' : 'null', T.damage, T.knockback, sx, sz);
        if (r !== RESULT.IGNORED) {
          L.hit = true;
          if (r === RESULT.HIT) this.stats.nullHits++;
        }
      }
    }
    if (L.t >= T.beam) {
      d.fx?.nullEnd?.(seg);
      this._trench(L);
      this.after = { ox: L.ox, oz: L.oz, a0: L.a0, a1: L.ang, T, t: 0, next: this.T.null.every };
      this.lit = null;
    }
  }

  /** The wide trench (scars `beam` with the line's half-width), laid in pieces of `seg` m. */
  _trench(L) {
    const W = this.game.world;
    if (!W?.groundBlow) return;
    const T = L.T, N = this.T.null.trench, g = this._gb;
    const angs = [L.last && L.turn ? L.a0 + L.turn * 0.5 : L.ang]; // (the Last Null: one trench down the middle of its turn)
    for (const ang of angs) {
      const dx = Math.sin(ang), dz = Math.cos(ang);
      for (let s = 0.8; s < T.len - 0.5; s += N.seg) {
        if (Math.hypot(L.ox + dx * s, L.oz + dz * s) > N.reach) break; // (past the crossing's last ruins: no one sees it)
        g.kind = 'beam';
        g.power = N.power;
        g.dx = dx;
        g.dz = dz;
        g.len = Math.min(N.seg, T.len - s);
        g.w = T.w / 2;
        g.hot = true;
        g.r = T.w / 2;
        W.groundBlow(L.ox + dx * s, L.oz + dz * s, g);
      }
    }
    this.stats.trenches++;
  }

  /** The strip swept again for a while (fresh blows): what stood under a falling top goes too. */
  _afterStep(dt) {
    const A = this.after;
    A.t += dt;
    A.next -= dt;
    if (A.next <= 0) {
      A.next = this.T.null.every;
      const D = this.game.world?.destructibles;
      const L = { T: A.T, ox: A.ox, oz: A.oz, src: D?.swing?.() ?? -1 };
      this._erase(L, A.a0);
      if (Math.abs(A.a1 - A.a0) > 1e-3) this._erase(L, A.a1);
    }
    if (A.t >= this.T.null.after) this.after = null;
  }

  // ---------------------------------------------------------------- THE UNVEILING BURST (core's wjMoment)
  _unveilMotion(b, u) {
    const d = this.d, T = this.T.unveil;
    if (u < 1) return; // (the band's light and the eyes' flare: fx.unveil, called from core's afterPose)
    if (b._wjUnveiled) return;
    b._wjUnveiled = true;
    this.stats.unveils++;
    const x = d.position.x, z = d.position.z;
    d.fx?.castBurst?.(x, z, T.fxR, T.fxPower);
    // the loose pieces within `r` are thrown outward; the ruins, lamps and signals near topple outward
    let n = this._throwOut(x, z, T.r, T.throwMin, T.throwMax, Math.ceil(T.max / 2));
    const D = this.game.world?.destructibles, out = this._around;
    if (D?.around && D.topple) {
      D.around(x, z, T.topple, out, 32);
      for (let i = 0; i < out.length && n < T.max; i++) {
        const c = out[i];
        if (c.lift === 1 || c.floor || !(c.hpMax < Infinity)) continue;
        const dx = c.x - x, dz = c.z - z;
        if (D.topple(c, dx, dz, 'boss')) n++;
      }
    }
    this.stats.flattened += n;
    d.fx?.weight?.('huge', 0, 1);
  }

  // ---------------------------------------------------------------- unused hooks (kept for the contract)
  onRelease(b, s, a) {
    void b, s, a;
  }
  onCast(b, s, a) {
    void b, s, a;
  }
  onSustain(b, s, a, k) {
    void b, s, a, k;
  }
  /** One of this handler's beats was parried (before the engine's onParried): false = the engine's. */
  onParried(info, b) {
    void info, b;
    return false;
  }
  afterPose(dt, a) {
    void dt, a;
  }
}
