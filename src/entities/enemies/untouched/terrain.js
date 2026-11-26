import { clamp, turnToward } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { perPhase } from './tuning.js';

// Bai Wuji's terrain moves (the terrain agent's file): the crossing and the void as his weapons. A HANDLER
// on the routing contract (untouched.js header): moves/terrain.js creates it (`create(d)`) and names the
// beat fields it owns (FIELDS: wjLift, wjDown, wjOrbit, wjRoad, wjFloat); untouched.js calls the hooks
// below through `?.` for every beat that carries one of them. Its numbers: TUNING.terrain
// (tuningTerrain.js); the pieces it moves: world/destructibles.js take / carry / throwTo / drop.
//
// THE MOVES (moves/terrain.js has their data):
//   curbPull    Curb Pull        a car or a road slab within `curb.find` m of him (the nearest; cars first)
//                                lifts into a blue knot over its place, turning, and is thrown at the
//                                hero (blue; a held guard is opened: breaksGuard). Parried: cut in two, its
//                                halves burst behind him (by 'player'). Rolled / missed: it bursts where it
//                                lands, a slam's floor mark.
//   bringDown   Bring It Down    the standing tower top nearest the hero is torn off its base, carried over
//                                the crossing, held over the hero's place (the mark follows him) and fixed
//                                `down.fix` s before it lands (combat:tell, the mark, the red cue); a
//                                crater. No top: a fallen tower's section if the set made one liftable;
//                                else refused.
//   theOrbit    The Orbit        `orbit.count` loose pieces near him turn round him `orbit.r` m out; each
//                                cast beat sends one (blue), the last bursts on the road (red).
//   roadItself  The Road Itself  a line of the floor's slabs bursts up toward the hero, fixed at the stomp
//                                and drawn as a red strip, one after another to past him (red, one blow).
//   overhead    Overhead         (the void) a floating piece drifts over him and is dropped (red, as Bring
//                                It Down's fall).
//   castOff     Cast Off         (the void) two floating pieces drawn to his sides, cast in turn (blue).
// Every piece is found BY KIND at the move's start (destructibles.list / nearest; the set's THROWABLE kinds,
// world/veiledCrossing.js), never by place; a move with no piece for it is weighed 0 and refused
// (onActStart → false): the arena runs out of big things as the fight goes on. Every thrown or falling
// piece is ONE cue: told to the cue ledger as it leaves (brain.expect, retimed in flight), its landing
// asked of the fairness guard (brain.fairDelay: a later landing, or uncued and harmless), its flash
// flashLead before it lands (combat:flash; a red one away from him also combat:tell, `hazard`). Nothing
// lands on a hero who is down (no cue, no blow). At most TUNING.terrain.pace.max of these moves start
// inside pace.window s (`paced`: false lets the Lab and the tests trigger them back to back); none while
// something of his is in the air or the scene morphs. stop() (a reaction, a break, his death) lets go of
// what hangs: it falls where it is, uncued and harmless; his death also makes what flies harmless.
// reset() forgets everything (the world's reset puts the pieces back).
//
// THROWN INTO (for the melee and spells handlers: `d.parts.terrain?.behind(...)` / `aimThrow(...)`):
//   behind(hero, dx, dz, reach = into.reach) → { piece, t, x, z } | null
//       the first standing piece (not the floor, finite hp) on the line from the hero's place along
//       (dx, dz) within `reach` m: `t` m along it, (x, z) where the line meets its footprint. A reused
//       record: copy what you keep.
//   aimThrow(hero, from = boss, o = {reach, spread}) → { dx, dz, piece }
//       the way to throw the hero so he goes THROUGH a piece: the unit way out from `from` (his own place
//       by default) to the hero, turned to the nearest standing piece within `reach` m of the hero and
//       `spread` rad of that way (the one nearest the way); `piece` null when none: the plain way out.
//       Reused record. A beat can then aim its knock-back with `from` = hero - (dx, dz).
// No per-frame allocation: fixed records, reused. Look jitter from the effects' own stream (fx.lrand).

const GROUND = Object.freeze({ ground: true });
const CHIP = Object.freeze({ chip: true }); // (held: bitten by the hero's blade; cut under 1 hp it breaks and is let go) // (a raised piece let go comes down to the floor: destructibles.drop)
const INTACT = 0, HELD = 3, FLYING = 4;
const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const NFLY = 6, NHOLD = 4, NDROP = 2, MAXL = 12;
const GRIT = [0.62, 0.58, 0.55], GRIT_END = [0.16, 0.15, 0.15];
const RED = [3.2, 0.24, 0.16], RED_END = [1.2, 0.05, 0.04];

export class WjTerrain {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    /** false: the pace limit is off (the Lab, the tests: triggers back to back) */
    this.paced = true;
    /** what hangs: a piece lifted and carried (curb: over its place; orbit: round him; near: at his side) */
    this.hold = Array.from({ length: NHOLD }, () => ({ piece: null, act: null, mode: '', t: 0, x0: 0, y0: 0, z0: 0, slot: 0 }));
    /** what flies at the hero (thrown with throwTo; its blow at the landing) */
    this.fly = Array.from({ length: NFLY }, () => ({ live: false, piece: null, flashed: false, quiet: false, tell: TELL.BLUE, damage: 0, kb: 0, knockdown: false, attack: '', dx: 0, dz: 1, hit: 1, burst: 0, parryPosture: 0, mark: 0, tx: 0, tz: 0, h: null }));
    /** what falls on the hero's place (Bring It Down, Overhead): its own clock, game time */
    this.drops = Array.from({ length: NDROP }, () => ({ live: false, piece: null, act: null, K: null, t: 0, landAt: 0, fixAt: 0, relAt: 0, fixed: false, flashed: false, released: false, quiet: false, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0, over: 0, damage: 0, kb: 0, attack: '', h: null }));
    /** The Road Itself's line */
    this.line = {
      live: false, t: 0, n: 0, hitDone: false, weighed: false, damage: 0, kb: 0, attack: 'roadItself', dx: 0, dz: 1, quiet: 0, draw: 0,
      x: new Float32Array(MAXL), z: new Float32Array(MAXL), at: new Float32Array(MAXL), flashed: new Uint8Array(MAXL), done: new Uint8Array(MAXL), h: new Array(MAXL).fill(null),
    };
    /** when his terrain moves started (game time): the pace limit */
    this.starts = new Float64Array(4).fill(-1e9);
    this._si = 0;
    this.stats = { started: 0, refused: 0, taken: 0, thrown: 0, dropped: 0, split: 0, landed: 0, hits: 0, bursts: 0, lines: 0, quiet: 0, delays: 0, letGo: 0 };
    this._throw = { time: 0.6, power: 1.4, radius: 2, by: 'boss', ground: true, onLand: null };
    this._onLand = (b, x, z) => this._landed(b, x, z);
    this._pop = { time: 0.5, power: 0.8, radius: 1.2, by: 'boss', onLand: null };
    this._blow = { kind: 'blast', by: 'boss', dx: 0, dz: 0, src: -1, down: true };
    this._halfO = { kind: 'blast', by: 'player', dx: 0, dz: 0, src: -1 };
    this._mark = { kind: 'slam', power: 1, dx: 0, dz: 0, by: 'boss' };
    this._tell = { source: 'dragon', attack: '', tell: TELL.RED, impactIn: 0, x: 0, z: 0, hazard: true };
    this._flash = { source: 'dragon', attack: '', tell: TELL.RED, x: 0, y: 0, z: 0, hazard: true, flare: false };
    this._bflash = { source: 'dragon', attack: '', tell: TELL.BLUE, x: 0, y: 0, z: 0, flare: false };
    this._from = { x: 0, z: 0 };
    /** a thrown piece's hit: a held guard is opened (BRIEF R4), met from any side */
    this._blueX = Object.freeze({ breaksGuard: true, around: true });
    this._hv = { x: 0, z: 0 };
    this._near = [];
    this._one = [];
    this._pick = [];
    this._behind = { piece: null, t: 0, x: 0, z: 0 };
    this._aim = { dx: 0, dz: 1, piece: null };
    this._p = null;
  }

  get W() {
    return this.game.world?.destructibles ?? null;
  }
  get T() {
    return this.d.T.terrain;
  }
  get lead() {
    return perPhase(this.d.T.flashLead, this.d.phase);
  }

  // ------------------------------------------------------------------ the fight's reset, a stop
  /** Fight reset (Untouched.reset): forget everything in flight (the world's reset puts the pieces back). */
  reset() {
    for (const h of this.hold) {
      h.piece = null;
      h.act = null;
    }
    for (const R of this.fly) this._endFly(R);
    for (const D of this.drops) this._endDrop(D);
    this._endLine();
    this.starts.fill(-1e9);
  }

  /** A reaction, a break, his death: what hangs falls where it is (uncued, harmless); on his death what
   *  flies is made harmless too. */
  stop() {
    this._letGo();
    for (const D of this.drops) {
      if (!D.live) continue;
      if (!D.released) {
        if (D.piece?.state === HELD) this.W?.drop?.(D.piece, GROUND);
        this.stats.letGo++;
        this._endDrop(D);
      }
    }
    if (this._dying()) {
      for (const R of this.fly) {
        if (!R.live) continue;
        R.quiet = true;
        R.h?.cancel?.();
        R.h = null;
      }
      for (const D of this.drops) {
        D.quiet = true;
        D.h?.cancel?.();
        D.h = null;
      }
      this._endLine();
    }
  }

  _dying() {
    const m = this.d.mode;
    return m === 'dying' || m === 'dead' || !(this.d.hp > 0);
  }

  /** Every held piece falls where it hangs (no cue, no blow). */
  _letGo() {
    for (const h of this.hold) {
      if (!h.piece) continue;
      if (h.piece.state === HELD) this.W?.drop?.(h.piece, GROUND);
      this.stats.letGo++;
      h.piece = null;
      h.act = null;
    }
  }

  /** Something of his is in the air, hanging or bursting. */
  get busy() {
    return this.hold.some((h) => h.piece) || this.fly.some((f) => f.live) || this.drops.some((D) => D.live) || this.line.live;
  }

  // ------------------------------------------------------------------ the pieces, by kind
  /** A standing piece of one of `kinds` that can be lifted (first kinds first), nearest (x, z) within
   *  `max` m, not one in `skip`; or null. */
  _find(kinds, x, z, max, skip = null) {
    const W = this.W;
    if (!W?.list) return null;
    for (const kind of kinds) {
      let best = null, bd = max;
      for (const b of W.list) {
        if (b.kind !== kind || b.state !== INTACT || b.absent || !(b.lift > 0) || !(b.hpMax < Infinity)) continue;
        if (skip && skip.includes(b)) continue;
        if (b.top && b.top.state !== INTACT) continue; // (a base whose top is coming off)
        const e = Math.hypot(b.x - x, b.z - z);
        if (e < bd) {
          bd = e;
          best = b;
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** How many standing pieces of `kinds` within `max` m of (x, z) (at most `cap`), into this._pick. */
  _gather(kinds, x, z, max, cap) {
    const out = this._pick;
    out.length = 0;
    for (let i = 0; i < cap; i++) {
      const b = this._find(kinds, x, z, max, out);
      if (!b) break;
      out.push(b);
    }
    return out.length;
  }

  _hero() {
    const d = this.d, me = d.position, p = this.game.player?.position, v = this._hv;
    v.x = Number.isFinite(p?.x) ? p.x : me.x + Math.sin(d.yaw) * 4;
    v.z = Number.isFinite(p?.z) ? p.z : me.z + Math.cos(d.yaw) * 4;
    return v;
  }

  /** The hero is down (a knockdown) or gone: nothing of his lands on him now. */
  _heroDown() {
    const p = this.game.player;
    return !p?.position || p.alive === false || p.state === 'knockdown' || p.state === 'dead';
  }

  _morphing() {
    return !!this.game.world?.forest?.scenes?.morphing;
  }

  /** The move's piece(s) for a def, at his place (none: null / 0). */
  _plan(def) {
    const d = this.d, T = this.T, me = d.position, H = this._hero();
    const b0 = def?.beats?.[0];
    if (!b0) return 0;
    if (b0.wjLift) return this._find(T.curb.kinds, (me.x + H.x) / 2, (me.z + H.z) / 2, T.curb.find) ? 1 : 0;
    if (b0.wjDown) return this._find(T.down.kinds, H.x, H.z, 80) ? 1 : 0;
    if (b0.wjOrbit) return this._gather(T.orbit.kinds, me.x, me.z, T.orbit.near, T.orbit.count) >= T.orbit.min ? 1 : 0;
    if (b0.wjRoad) return this.W?.floor?.some((b) => b.state === INTACT) ? 1 : 0;
    if (b0.wjFloat === 'take') return this._find(T.float.kinds, H.x, H.z, T.float.find) ? 1 : 0;
    if (b0.wjFloat === 'draw') return this._gather(T.float.kinds, me.x, me.z, T.float.find, 2) >= 1 ? 1 : 0;
    return 1;
  }

  /** Inside the pace limit: no more than pace.max of these moves inside pace.window s. */
  _paceOk() {
    if (!this.paced) return true;
    const P = this.T.pace, now = this.game.time ?? 0;
    let n = 0;
    for (const t of this.starts) if (now - t < P.window) n++;
    return n < P.max;
  }

  // ------------------------------------------------------------------ the AI's choice, the start
  /** The AI weighs a move with a beat of this handler's: 0 while the arena has nothing for it, something
   *  of his is still in the air, the scene morphs or the pace limit is reached. */
  weigh(name, def, w, dist) {
    void name;
    void dist;
    if (!(w > 0)) return 0;
    if (this.busy || this._morphing() || !this._paceOk()) return 0;
    return this._plan(def) ? w : 0;
  }

  /** A move with a beat of this handler's starts: its pieces are chosen now (false: none; it does not start). */
  onActStart(A) {
    const def = A?.def, T = this.T, d = this.d;
    const b0 = def?.beats?.[0];
    if (!b0 || !T) return true;
    const no = () => {
      this.stats.refused++;
      return false;
    };
    if (this.busy || this._morphing() || !this._paceOk()) return no();
    const me = d.position, H = this._hero();
    const plan = (A._wj = { pieces: [], cast: 0 });
    if (b0.wjLift) {
      // (the one nearest the middle of the two of them: in the picture, in his reach)
      const pc = this._find(T.curb.kinds, (me.x + H.x) / 2, (me.z + H.z) / 2, T.curb.find);
      if (!pc) return no();
      plan.pieces.push(pc);
    } else if (b0.wjDown) {
      const pc = this._find(T.down.kinds, H.x, H.z, 80);
      if (!pc) return no();
      plan.pieces.push(pc);
    } else if (b0.wjOrbit) {
      if (this._gather(T.orbit.kinds, me.x, me.z, T.orbit.near, T.orbit.count) < T.orbit.min) return no();
      plan.pieces.push(...this._pick);
    } else if (b0.wjRoad) {
      if (!this.W?.floor?.some((b) => b.state === INTACT)) return no();
    } else if (b0.wjFloat === 'take') {
      const pc = this._find(T.float.kinds, H.x, H.z, T.float.find);
      if (!pc) return no();
      plan.pieces.push(pc);
    } else if (b0.wjFloat === 'draw') {
      if (this._gather(T.float.kinds, me.x, me.z, T.float.find, 2) < 1) return no();
      plan.pieces.push(...this._pick);
    }
    for (const pc of plan.pieces) this.W?.reserve?.(pc, 6);
    this.starts[this._si++ % this.starts.length] = this.game.time ?? 0;
    this.stats.started++;
    return true;
  }

  /** A thrown / called thing reaches the hero wherever he is. */
  reach(b) {
    void b;
    return Infinity;
  }

  // ------------------------------------------------------------------ his motion
  beatMotion(b, u, s, dt) {
    const d = this.d, D = b.def, A = d.brain.act, plan = A?._wj;
    if (s) d.yaw = turnToward(d.yaw, Math.atan2(s.p.x - d.position.x, s.p.z - d.position.z), 8 * dt);
    if (!plan || b._wjDone) return;
    const T = this.T;
    if (D.wjLift === 'take' && u >= T.curb.take) {
      b._wjDone = true;
      this._take(plan.pieces[0], A, 'curb', 0);
    } else if (D.wjOrbit === 'lift' && u >= 0.1) {
      b._wjDone = true;
      plan.pieces.forEach((pc, i) => this._take(pc, A, 'orbit', i));
    } else if (D.wjFloat === 'draw' && u >= T.float.take) {
      b._wjDone = true;
      plan.pieces.forEach((pc, i) => this._take(pc, A, 'near', i));
    } else if ((D.wjDown === 'take' && u >= T.down.take) || (D.wjFloat === 'take' && u >= T.float.take)) {
      b._wjDone = true;
      this._startDrop(plan.pieces[0], A, b, D.wjDown ? T.down : T.float);
    }
  }

  /** Lift a piece into a hold slot (it rises from where it lies). */
  _take(pc, A, mode, slot) {
    const W = this.W;
    // (what he holds turning round him is a wall the hero's blade chips: destructibles take o.chip)
    if (!pc || pc.state !== INTACT || pc.absent || !W?.take?.(pc, CHIP)) return false;
    const h = this.hold.find((x) => !x.piece);
    if (!h) {
      W.drop?.(pc, GROUND);
      return false;
    }
    h.piece = pc;
    h.act = A;
    h.mode = mode;
    h.t = 0;
    h.x0 = pc.x;
    h.y0 = pc.y0;
    h.z0 = pc.z;
    h.slot = slot;
    this.stats.taken++;
    this.d.fx?.dust?.(pc.x, pc.z, 0.9);
    this._grit(pc.x, 0.2, pc.z, 10, 2.6);
    this.game.shake?.(0.1);
    return true;
  }

  /** Where a held piece hangs this frame (world x, y, z of its base), into out. */
  _hangAt(h, out) {
    const d = this.d, T = this.T, me = d.position;
    if (h.mode === 'curb') {
      out.x = h.x0;
      out.z = h.z0;
      out.y = h.y0 + T.curb.hang + Math.sin(h.t * 2.4) * 0.12;
      out.k = ease(clamp(h.t / T.curb.liftT, 0, 1));
    } else if (h.mode === 'orbit') {
      const O = T.orbit;
      const a = (h.slot / Math.max(1, O.count)) * TAU + h.t * O.spin + d.yaw;
      out.x = me.x + Math.sin(a) * O.r;
      out.z = me.z + Math.cos(a) * O.r;
      out.y = Math.max(O.y[h.slot % O.y.length], h.y0 + 0.5) + Math.sin(h.t * 3 + h.slot) * 0.1;
      out.k = ease(clamp(h.t / O.liftT, 0, 1));
    } else {
      // (near: drawn to his side, over his shoulder)
      const F = T.float, side = h.slot % 2 ? -1 : 1, fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
      out.x = me.x + fz * 2.4 * side - fx * 0.6;
      out.z = me.z - fx * 2.4 * side - fz * 0.6;
      out.y = Math.max(F.hang + 1.4, h.y0 + 0.5) + Math.sin(h.t * 2.2 + h.slot) * 0.12;
      out.k = ease(clamp(h.t / F.liftT, 0, 1));
    }
    return out;
  }

  // ------------------------------------------------------------------ the impacts
  /** A terrain beat's impact, its first frame: the Road's heel through the floor. */
  onImpact(b, s, a) {
    void s;
    void a;
    if (b.def.wjRoad !== 'stomp') return;
    const d = this.d, x = d.position.x + Math.sin(d.yaw) * 0.5, z = d.position.z + Math.cos(d.yaw) * 0.5;
    const o = this._blow;
    o.dx = Math.sin(d.yaw);
    o.dz = Math.cos(d.yaw);
    o.src = this.W?.swing?.() ?? -1;
    this.game.world?.impact?.(x, z, 1.1, 1.0, o);
    d.fx?.crater?.(x, z, 1.2, 0.8);
    this.game.shake?.(0.2);
  }

  /** A cast beat's impact: the throw, the line. */
  onCast(b, s, a) {
    const D = b.def, A = a ?? this.d.brain.act;
    if (D.wjLift === 'throw') this._throwNext(D, A, 'curb', this.T.curb);
    else if (D.wjOrbit === 'cast' || D.wjOrbit === 'burst') this._throwNext(D, A, 'orbit', this.T.orbit, D.wjOrbit === 'burst');
    else if (D.wjFloat === 'cast') this._throwNext(D, A, 'near', this.T.float);
    else if (D.wjRoad === 'stomp') this._castLine(D, s, A);
  }

  // ------------------------------------------------------------------ throwing a held piece
  /** The next held piece of `mode` this move holds goes at the hero. */
  _throwNext(D, A, mode, K, burst = false) {
    const h = this.hold.find((x) => x.piece && x.mode === mode && x.act === A);
    if (!h) return null;
    const pc = h.piece;
    h.piece = null;
    h.act = null;
    if (pc.state !== HELD) return null;
    return this._throwPiece(pc, D, A?.name ?? 'terrain', K, burst);
  }

  /**
   * Throw the held piece `pc` at the hero: a flight of dist / speed (at least minFlight), lengthened by
   * the fairness guard or uncued and harmless when nothing clears it. `burst`: red, it bursts on the road
   * where it lands (a ring of `K.burst` m) instead of striking him as it comes.
   */
  _throwPiece(pc, D, attack, K, burst) {
    const W = this.W, d = this.d;
    if (!W?.throwTo) return null;
    const R = this.fly.find((f) => !f.live);
    if (!R) {
      W.drop?.(pc, GROUND);
      return null;
    }
    const H = this._hero(), s = d.brain?._sense?.();
    let tx = H.x, tz = H.z;
    if (s && Number.isFinite(s.vx + s.vz)) {
      tx += s.vx * K.lead;
      tz += s.vz * K.lead;
    }
    // (a raised piece hung under its own height would land on its first frame of flight: the world lands a
    // thrown piece when its pivot falls below its base, world/destructibles.js _fly)
    if (!(fin(pc.py, 0) >= 0.3)) W.carry?.(pc, fin(pc.px, pc.x), 0.3, fin(pc.pz, pc.z), 0, 0);
    const sx = fin(pc.px, pc.x), sz = fin(pc.pz, pc.z);
    const dist = Math.hypot(tx - sx, tz - sz), l = dist || 1;
    let fl = Math.max(clamp(dist / K.speed, K.time[0], K.time[1]), K.minFlight);
    const tell = burst ? TELL.RED : D.tell;
    let quiet = false;
    const dl = d.brain?.fairDelay?.(fl, tell, this.T.maxDelay, attack) ?? 0;
    if (dl > 0) {
      fl += dl;
      this.stats.delays++;
      if (d.brain.stats) d.brain.stats.delays++;
    } else if (dl < 0) quiet = true;
    const tw = this._throw;
    tw.time = fl;
    tw.power = burst ? K.burstPower ?? K.power : K.throwPower ?? K.power;
    tw.radius = burst ? K.burst ?? K.radius : K.radius;
    tw.by = 'boss';
    tw.onLand = this._onLand;
    if (!W.throwTo(pc, tx, tz, tw)) {
      W.drop?.(pc, GROUND);
      return null;
    }
    R.live = true;
    R.piece = pc;
    R.flashed = false;
    R.quiet = quiet;
    R.tell = tell;
    R.damage = D.damage;
    R.kb = D.knockback ?? 4;
    R.knockdown = !!D.knockdown;
    R.attack = attack;
    R.dx = (tx - sx) / l;
    R.dz = (tz - sz) / l;
    R.hit = K.hit;
    R.burst = burst ? K.burst : 0;
    R.parryPosture = K.parryPosture ?? 0;
    R.mark = K.mark ?? 1.2;
    R.tx = tx;
    R.tz = tz;
    R.h?.cancel?.();
    R.h = quiet ? null : d.brain?.expect?.(fl, tell, attack) ?? null;
    if (quiet) this.stats.quiet++;
    this.stats.thrown++;
    // the flick that sends it: grit off it the way it goes
    this._grit(sx, Math.max(0.4, fin(pc.py, 0) + pc.y0), sz, 8, 3, R.dx, R.dz);
    this.game.shake?.(0.12);
    return R;
  }

  /** A thrown piece came down (the world's onLand): its blow at the hero, if it was cued and he is there. */
  _landed(pc, x, z) {
    const R = this.fly.find((f) => f.live && f.piece === pc);
    if (R) return this._flyLanded(R, x, z);
    const D = this.drops.find((f) => f.live && f.piece === pc);
    if (D) return this._dropLanded(D, x, z);
  }

  _flyLanded(R, x, z) {
    R.live = false;
    R.piece = null;
    R.h?.cancel?.();
    R.h = null;
    this.stats.landed++;
    const d = this.d, p = this.game.player, pr = p?.radius ?? 0.45;
    const e = p?.position ? Math.hypot(p.position.x - x, p.position.z - z) : Infinity;
    this._markAt(x, z, R.burst > 0 ? R.mark * 1.2 : R.mark, R.dx, R.dz);
    if (R.burst > 0) {
      // the red one bursts on the road: a ring that throws
      d.fx?.crater?.(x, z, R.burst, 1.2);
      this.stats.bursts++;
    }
    if (e < 6) d.fx?.weight?.('huge', R.dx, R.dz);
    if (!R.flashed || R.quiet || this._heroDown() || this.game.state !== 'boss') return;
    const reach = R.burst > 0 ? R.burst + pr * 0.5 : R.hit + pr;
    if (e > reach) return;
    const f = this._from;
    if (R.burst > 0) {
      f.x = x;
      f.z = z;
    } else {
      f.x = x - R.dx * 1.4;
      f.z = z - R.dz * 1.4;
    }
    this.stats.hits++;
    const r = d.hitPlayer({
      damage: R.damage, knockback: R.kb, knockdown: R.knockdown, kind: R.burst > 0 ? 'crush' : 'stone', tell: R.tell, attack: R.attack,
      // (a thrown piece comes from where it hung, often off his line: a guard or a parry meets it from any side)
      from: f, projectile: true, parryPosture: R.parryPosture, extra: R.burst > 0 ? null : this._blueX,
    });
    if (r === RESULT.PARRIED && R.burst <= 0) this._split(R, x, z);
  }

  /** A parry cut it in two: the halves pass either side of him and burst behind him (the hero's). */
  _split(R, x, z) {
    const d = this.d, K = this.T.curb, Wd = this.game.world, o = this._halfO;
    this.stats.split++;
    for (const sg of [-1, 1]) {
      const hx = x + R.dx * K.halves - R.dz * sg * 1.8, hz = z + R.dz * K.halves + R.dx * sg * 1.8;
      o.dx = R.dx;
      o.dz = R.dz;
      o.src = this.W?.swing?.() ?? -1;
      Wd?.impact?.(hx, hz, 1.6, K.halfPower, o);
      this._markAt(hx, hz, 1.0, R.dx, R.dz);
      this._grit(x, 0.9, z, 8, 5, R.dx - R.dz * sg * 0.6, R.dz + R.dx * sg * 0.6);
      this._grit(hx, 0.4, hz, 8, 2.4);
    }
    d.fx?._ink?.(x - R.dz * 0.8, 1.0, z + R.dx * 0.8, x + R.dz * 0.8, 1.0, z - R.dx * 0.8, 0.2, 1.0, 0);
    d.emit?.('dragon:split', { attack: R.attack, x, z });
  }

  _endFly(R) {
    R.live = false;
    R.piece = null;
    R.h?.cancel?.();
    R.h = null;
  }

  // ------------------------------------------------------------------ a piece falling on his place
  /** Bring It Down / Overhead: the piece torn free; it rises, comes over the hero, and is dropped to land
   *  at the move's drop beat's impact (its own clock from here on). */
  _startDrop(pc, A, b, K) {
    const W = this.W, d = this.d;
    if (!pc || pc.state !== INTACT || pc.absent || !W?.take?.(pc)) return false;
    const D = this.drops.find((x) => !x.live);
    if (!D) {
      W.drop?.(pc, GROUND);
      return false;
    }
    const nb = A?.beats?.find((x) => x !== b && (x.def.wjDown === 'drop' || x.def.wjFloat === 'drop'));
    const now = this.game.time ?? 0;
    const landIn = nb ? Math.max(K.fall + 0.3, nb.impact - (A.t ?? 0)) : K.carryT + 1;
    const H = this._hero();
    Object.assign(D, {
      live: true, piece: pc, act: A, K, t: 0, landAt: now + landIn, fixAt: now + landIn - K.fix, relAt: now + landIn - K.fall,
      fixed: false, flashed: false, released: false, quiet: false, sx: pc.x, sy: pc.y0, sz: pc.z, tx: H.x, tz: H.z, over: Math.max(K.over + (pc.h ?? 1) * 0.2, pc.y0 + 1.5),
      damage: nb?.def.damage ?? 30, kb: nb?.def.knockback ?? 8, attack: A?.name ?? 'bringDown',
    });
    D.h?.cancel?.();
    D.h = d.brain?.expect?.(landIn, TELL.RED, D.attack) ?? null;
    this.stats.taken++;
    this.game.shake?.(K === this.T.down ? 0.4 : 0.15);
    this._grit(pc.x, pc.y0 + 0.2, pc.z, 14, 3);
    d.fx?.dust?.(pc.x, pc.z, 1.2);
    if (K === this.T.down) d.emit?.('dragon:tower', { x: pc.x, z: pc.z });
    return true;
  }

  _dropFrame(D, dt) {
    const pc = D.piece, W = this.W, d = this.d, K = D.K, now = this.game.time ?? 0;
    D.t += dt;
    if (!pc || (D.released ? pc.state !== FLYING : pc.state !== HELD)) {
      // (gone from under him: a scene's front, a reset)
      this._endDrop(D);
      return;
    }
    // the place follows the hero until it is fixed
    if (!D.released && !D.fixed) {
      const H = this._hero();
      D.tx = H.x;
      D.tz = H.z;
    }
    const k = ease(clamp(D.t / fin(K.carryT, 0.9), 0, 1));
    if (!D.released) {
      const arc = Math.sin(Math.PI * k) * fin(K.rise, 0);
      // (held beyond the place, away from the camera (-z: the game camera looks from the south), so the
      // hero is never under it on screen; it comes down on the place in its fall)
      const hz = D.tz - fin(K.back, 0);
      const x = D.sx + (D.tx - D.sx) * k, z = D.sz + (hz - D.sz) * k;
      const y = D.sy + (D.over - D.sy) * k + arc * (1 - k * 0.5);
      W?.carry?.(pc, x, y - pc.y0, z, 0.35 * k, D.t * 0.7);
      this._lift(pc, x, y, z, 0.6 + 0.4 * k);
    }
    // fixed: the place shown, the red cue told (the fairness guard may hold the fall a little)
    if (!D.fixed && now >= D.fixAt) {
      D.fixed = true;
      if (this._heroDown()) D.quiet = true;
      else {
        const dl = d.brain?.fairDelay?.(D.landAt - now, TELL.RED, this.T.maxDelay, D.attack) ?? 0;
        if (dl > 0) {
          D.landAt += dl;
          D.relAt += dl;
          this.stats.delays++;
          if (d.brain.stats) d.brain.stats.delays++;
        } else if (dl < 0) D.quiet = true;
      }
      if (D.quiet) {
        this.stats.quiet++;
        D.h?.cancel?.();
        D.h = null;
      } else {
        D.h?.retime?.(D.landAt - now);
        const t = this._tell;
        t.attack = D.attack;
        t.impactIn = Math.max(0.05, D.landAt - now);
        t.x = D.tx;
        t.z = D.tz;
        d.emit('combat:tell', t);
      }
    } else if (!D.fixed || D.released) D.h?.retime?.(Math.max(0, D.landAt - now));
    if (k > 0.5) this._markFall(D.tx, D.tz, K.r, D.fixed ? clamp(1 - (D.landAt - now) / Math.max(0.1, K.fix), 0, 1) : 0.25 * k, !D.quiet && D.fixed);
    if (!D.flashed && now >= D.landAt - this.lead) {
      D.flashed = true;
      if (!D.quiet && this._heroDown()) {
        D.quiet = true;
        D.h?.cancel?.();
        D.h = null;
      }
      if (!D.quiet) this._cueAt(D.attack, D.tx, D.tz, TELL.RED);
    }
    if (!D.released && now >= D.relAt) {
      const tw = this._throw;
      tw.time = Math.max(0.12, D.landAt - now);
      tw.power = K.power;
      tw.radius = K.crater;
      tw.by = 'boss';
      tw.onLand = this._onLand;
      if (W?.throwTo?.(pc, D.tx, D.tz, tw)) {
        D.released = true;
        this.stats.dropped++;
        this.game.shake?.(0.15);
      } else this._endDrop(D);
    }
  }

  _dropLanded(D, x, z) {
    const d = this.d, K = D.K, p = this.game.player, pr = p?.radius ?? 0.45;
    const quiet = D.quiet || !D.flashed;
    this._endDrop(D);
    this.stats.landed++;
    this._markAt(x, z, K.mark, 0, 0);
    d.fx?.crater?.(x, z, K.crater, K === this.T.down ? 2 : 1.4);
    const e = p?.position ? Math.hypot(p.position.x - x, p.position.z - z) : Infinity;
    if (e < 8) d.fx?.weight?.('huge', p.position.x - x, p.position.z - z);
    if (quiet || this._heroDown() || this.game.state !== 'boss' || e > K.r + pr * 0.5) return;
    this._from.x = x;
    this._from.z = z;
    this.stats.hits++;
    d.hitPlayer({ damage: D.damage, knockback: D.kb, knockdown: true, kind: 'crush', tell: TELL.RED, attack: D.attack, from: this._from });
  }

  _endDrop(D) {
    D.live = false;
    D.piece = null;
    D.act = null;
    D.h?.cancel?.();
    D.h = null;
  }

  // ------------------------------------------------------------------ The Road Itself's line
  _castLine(Dd, s, A) {
    const d = this.d, K = this.T.road, R = this.line, me = d.position, p = this.game.player?.position;
    let dx = fin(s?.p?.x, fin(p?.x, me.x + Math.sin(d.yaw))) - me.x, dz = fin(s?.p?.z, fin(p?.z, me.z + Math.cos(d.yaw))) - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      dx /= dist;
      dz /= dist;
    } else {
      dx = Math.sin(d.yaw);
      dz = Math.cos(d.yaw);
    }
    const gap = perPhase(K.gap, d.phase);
    const n = clamp(Math.floor((Math.max(dist, K.first) + K.past - K.first) / K.step) + 1, 2, Math.min(MAXL, K.max));
    this._endLine();
    Object.assign(R, { live: true, t: 0, n, hitDone: false, weighed: false, damage: Dd.damage, kb: Dd.knockback ?? 6, attack: A?.name ?? 'roadItself', dx, dz, draw: 0 });
    let near = 0, nd = Infinity;
    for (let i = 0; i < n; i++) {
      const s0 = K.first + i * K.step;
      R.x[i] = me.x + dx * s0;
      R.z[i] = me.z + dz * s0;
      R.at[i] = K.delay + i * gap;
      R.flashed[i] = 0;
      R.done[i] = 0;
      const e = p ? Math.hypot(p.x - R.x[i], p.z - R.z[i]) : Infinity;
      if (e < nd) {
        nd = e;
        near = i;
      }
    }
    const dl = this._lineDelay(R, n, near, p, K);
    R.quiet = dl < 0 || this._heroDown() ? 1 : 0;
    if (dl > 0) {
      for (let i = 0; i < n; i++) R.at[i] += dl;
      this.stats.delays++;
      if (d.brain.stats) d.brain.stats.delays++;
    }
    if (R.quiet) this.stats.quiet++;
    else for (let i = 0; i < n; i++) if (p && Math.hypot(p.x - R.x[i], p.z - R.z[i]) < K.radius + K.cue + 1.5) R.h[i] = d.brain?.expect?.(R.at[i], TELL.RED, R.attack) ?? null;
    this.stats.lines++;
  }

  /** The least wait that clears every station of the line that may cue; -1 when none up to maxDelay does. */
  _lineDelay(R, n, near, p, K) {
    const B = this.d.brain;
    if (!B?.fairDelay) return 0;
    const max = this.T.maxDelay;
    let sh = 0;
    for (let it = 0; it < 12; it++) {
      let need = 0;
      for (let i = 0; i < n; i++) {
        if (i !== near && !(p && Math.hypot(p.x - R.x[i], p.z - R.z[i]) < K.radius + K.cue + 1.5)) continue;
        const dl = B.fairDelay(R.at[i] + sh, TELL.RED, max - sh, R.attack);
        if (dl < 0) return -1;
        if (dl > need) need = dl;
      }
      if (!(need > 0)) return sh;
      sh += need;
      if (sh > max + 1e-6) return -1;
    }
    return -1;
  }

  _endLine() {
    const R = this.line;
    R.live = false;
    for (let i = 0; i < MAXL; i++) {
      R.h[i]?.cancel?.();
      R.h[i] = null;
    }
  }

  /** Every frame of the line: the strip drawn, a station quivers, flares (a hero near it), bursts up. */
  _lineFrame(dt) {
    const R = this.line;
    if (!R.live) return;
    const d = this.d, K = this.T.road, W = this.W, pl = this.game.player, pp = pl?.position, lead = this.lead;
    R.t += dt;
    // the strip, fixed at the stomp: red strokes down both edges of what is still to burst
    R.draw -= dt;
    const drawNow = R.draw <= 0 && !R.quiet;
    if (drawNow) R.draw = 0.08;
    let left = 0;
    for (let i = 0; i < R.n; i++) {
      if (R.done[i]) continue;
      left++;
      const x = R.x[i], z = R.z[i], until = R.at[i] - R.t;
      if (drawNow) this._strip(x, z, R.dx, R.dz, K.w, K.step, clamp(1 - until / 1.2, 0.3, 1));
      if (until < K.quiver && until > 0 && this._lr(0, 1) < 0.6) this._grit(x + this._lr(-0.6, 0.6), 0.1, z + this._lr(-0.6, 0.6), 1, 2.2);
      if (!R.flashed[i] && !R.quiet && until <= lead && pp && pl.alive !== false && Math.hypot(pp.x - x, pp.z - z) < K.radius + K.cue) {
        R.flashed[i] = 1;
        if (this._heroDown()) R.quiet = 1;
        else this._cueAt(R.attack, x, z, TELL.RED, Math.max(0.02, until));
      }
      if (until > 0) continue;
      R.done[i] = 1;
      R.h[i]?.cancel?.();
      R.h[i] = null;
      // it bursts: the slab there torn up and thrown a little way along the line
      if (W?.floorNear && W.floorNear(x, z, K.take, this._one, { max: 1 }) && W.take(this._one[0])) {
        const b = this._one[0];
        W.carry(b, b.x, 0.1, b.z, 0.5, Math.atan2(R.dx, R.dz));
        const o = this._pop;
        o.time = K.pop;
        o.power = K.power * 0.6;
        o.radius = K.radius;
        W.throwTo(b, b.x + R.dx * K.skid, b.z + R.dz * K.skid, o);
      }
      const bo = this._blow;
      bo.dx = R.dx;
      bo.dz = R.dz;
      bo.src = W?.swing?.() ?? -1;
      this.game.world?.impact?.(x, z, K.radius * 0.9, K.power, bo);
      this._markAt(x, z, K.mark, R.dx, R.dz, 'blast');
      d.fx?.shock?.(x, z, K.radius * 1.3, d.fx?._opt?.(0.7, 0.12, 'dust', 0, false));
      this._grit(x, 0.3, z, 6, 4);
      this.game.shake?.(0.08);
      const e = pp ? Math.hypot(pp.x - x, pp.z - z) : Infinity;
      if (!R.weighed && e < 3) {
        R.weighed = true;
        d.fx?.weight?.('spell', R.dx, R.dz);
      }
      if (!R.hitDone && R.flashed[i] && !R.quiet && !this._heroDown() && this.game.state === 'boss' && e <= K.radius + (pl?.radius ?? 0.45) * 0.5) {
        R.hitDone = true;
        this._from.x = x - R.dx;
        this._from.z = z - R.dz;
        this.stats.hits++;
        d.hitPlayer({ damage: R.damage, knockback: R.kb, knockdown: true, kind: 'crush', tell: TELL.RED, attack: R.attack, from: this._from });
      }
    }
    if (!left) this._endLine();
  }

  // ------------------------------------------------------------------ every frame
  /** After the brain: what hangs follows its knot; what flies is cued as it comes; what falls; the line. */
  frame(dt) {
    if (!(dt >= 0)) dt = 0;
    const d = this.d, W = this.W, act = d.mode === 'act' ? d.brain.act : null;
    // a move cut short (a reaction, a break, a new move): what it held falls where it hangs
    for (const h of this.hold) {
      if (!h.piece) continue;
      const pc = h.piece;
      if (pc.state !== HELD) {
        h.piece = null;
        h.act = null;
        continue;
      }
      if (h.act !== act) {
        W?.drop?.(pc, GROUND);
        this.stats.letGo++;
        h.piece = null;
        h.act = null;
        continue;
      }
      h.t += dt;
      const at = this._hangAt(h, (this._p ??= { x: 0, y: 0, z: 0, k: 0 }));
      const k = at.k, x = h.x0 + (at.x - h.x0) * k, z = h.z0 + (at.z - h.z0) * k, y = h.y0 + (at.y - h.y0) * k;
      W?.carry?.(pc, x, y - pc.y0, z, 0.3 * k, h.t * (h.mode === 'orbit' ? 1.2 : this.T.curb.turn));
      this._lift(pc, x, y, z, k);
    }
    for (const D of this.drops) {
      if (!D.live) continue;
      if (!D.released && D.act !== act) {
        // (his move cut short before the fall: it drops where it hangs, harmless)
        if (D.piece?.state === HELD) W?.drop?.(D.piece, GROUND);
        this.stats.letGo++;
        this._endDrop(D);
        continue;
      }
      this._dropFrame(D, dt);
    }
    const lead = this.lead;
    for (const R of this.fly) {
      if (!R.live) continue;
      const pc = R.piece;
      if (!pc || pc.state !== FLYING) {
        this._endFly(R);
        continue;
      }
      const left = pc.T - pc.t;
      R.h?.retime?.(Math.max(0, left));
      const y = Math.max(0.3, fin(pc.py, 0) + pc.y0 + 0.3);
      if (this._lr(0, 1) < 0.4) this._grit(pc.px, y, pc.pz, 1, 1.4, -R.dx, -R.dz);
      if (R.burst > 0 && !R.quiet) this._markFall(R.tx, R.tz, R.burst, clamp(1 - left / 0.9, 0, 1), R.flashed);
      if (!R.flashed && left <= lead) {
        R.flashed = true;
        if (!R.quiet && this._heroDown()) {
          R.quiet = true;
          R.h?.cancel?.();
          R.h = null;
        }
        if (!R.quiet) {
          if (R.burst > 0) this._cueAt(R.attack, R.tx, R.tz, TELL.RED, left);
          else this._flareOn(R.attack, R.tell, pc.px, y + 0.2, pc.pz);
        }
      }
    }
    this._lineFrame(dt);
  }

  // ------------------------------------------------------------------ cues and looks
  /** A thrown piece's cue ON the piece (blue): the flash the ledger, the HUD, the sound and the AI read. */
  _flareOn(attack, tell, x, y, z) {
    const f = this._bflash, d = this.d;
    f.attack = attack;
    f.tell = tell;
    f.x = x;
    f.y = y;
    f.z = z;
    d.emit('combat:flash', f);
    d.fx?.hazardFlash?.(tell, x, y, z, 1);
  }

  /** A red cue where something lands away from him (a hazard): combat:tell (unless it went at the fix) and
   *  combat:flash, its flash on the floor at (x, z). */
  _cueAt(attack, x, z, tell, impactIn = 0) {
    const d = this.d, f = this._flash;
    if (impactIn > 0) {
      const t = this._tell;
      t.attack = attack;
      t.impactIn = impactIn;
      t.x = x;
      t.z = z;
      d.emit('combat:tell', t);
    }
    f.attack = attack;
    f.tell = tell;
    f.x = x;
    f.y = 0.5;
    f.z = z;
    d.emit('combat:flash', f);
    d.fx?.hazardFlash?.(tell, x, 0.5, z, 1);
  }

  /** The blue knot that holds a lifted piece (the effects' liftGlow; none: a little grit off it). */
  _lift(pc, x, y, z, k) {
    const fx = this.d.fx;
    const r = Math.max(0.8, pc.r ?? 1);
    if (fx?.liftGlow) fx.liftGlow(x, y + (pc.h ?? 1) * 0.5, z, r, k);
    else if (this._lr(0, 1) < 0.25) this._grit(x, Math.max(0.2, y), z, 1, 0.8);
  }

  /** Where something will fall: the effects' fallMark (k 0..1 to its landing); none: red strokes round it. */
  _markFall(x, z, r, k, lit) {
    const fx = this.d.fx;
    if (fx?.fallMark) {
      fx.fallMark(x, z, r, k);
      return;
    }
    const P = this.game.fx?.add;
    if (!P || !Number.isFinite(x + z + r)) return;
    this._mt = (this._mt ?? 0) - (this.game.dt ?? 0.016);
    if (this._mt > 0) return;
    this._mt = 0.08;
    const hot = lit ? 1 : 0.5, n = Math.max(10, Math.round(r * 5));
    const o = this._rec(0, 0.4, 0, 0.2, 0.5, 0.5, '-', RED, RED_END);
    if (!o) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      o.x = x + Math.cos(a) * r;
      o.z = z + Math.sin(a) * r;
      o.y = 0.4;
      o.rot = -a;
      o.alpha = 0.6 + 0.4 * hot;
      P.spawn(o);
    }
  }

  /** One edge-stroke run of the Road's strip round station (x, z). */
  _strip(x, z, dx, dz, w, len, k) {
    const P = this.game.fx?.add;
    if (!P) return;
    const o = this._rec(0, 0.4, 0, 0.2, 0.5, 0.5, '-', RED, RED_END);
    if (!o) return;
    const rot = Math.atan2(-dz * 0.848, dx);
    for (const side of [-1, 1]) {
      for (let s = -len * 0.5; s < len * 0.5; s += 0.5) {
        o.x = x + dx * s - dz * side * w;
        o.z = z + dz * s + dx * side * w;
        o.y = 0.4;
        o.rot = rot;
        o.alpha = 0.45 + 0.55 * k;
        P.spawn(o);
      }
    }
  }

  /** A floor mark of a landing (world.groundBlow: the floor keeps it till the reset). */
  _markAt(x, z, power, dx, dz, kind = 'slam') {
    const m = this._mark;
    m.kind = kind;
    m.power = power;
    m.dx = dx;
    m.dz = dz;
    this.game.world?.groundBlow?.(x, z, m);
  }

  /** The particle record for a glyph (the effects' own reused one), or null. */
  _rec(x, y, z, life, size, sizeEnd, glyph, color, colorEnd) {
    const fx = this.d.fx;
    if (!fx?._rec) return null;
    const o = fx._rec(x, y, z, life, size, sizeEnd, glyph, color, colorEnd);
    o.alphaEnd = 0;
    return o;
  }

  /** The effects' looks stream in [a, b) (never Math.random). */
  _lr(a, b) {
    const fx = this.d.fx;
    return fx?.lrand ? fx.lrand(a, b) : (a + b) * 0.5;
  }

  /** A little burst of grit (glyph particles about a cell). */
  _grit(x, y, z, n, speed, dx = 0, dz = 0) {
    const fx = this.d.fx;
    if (!fx?._rec || !fx._spawn || !Number.isFinite(x + y + z)) return;
    for (let i = 0; i < n; i++) {
      const a = this._lr(0, TAU), sp = this._lr(0.4, 1) * speed;
      const o = fx._rec(x + this._lr(-0.3, 0.3), y + this._lr(-0.1, 0.2), z + this._lr(-0.3, 0.3), this._lr(0.35, 0.7), this._lr(0.16, 0.24), 0.06, ".,:'`", GRIT, GRIT_END);
      o.vx = Math.cos(a) * sp * 0.6 + dx * speed * 0.6;
      o.vy = this._lr(0.6, 2.4);
      o.vz = Math.sin(a) * sp * 0.6 + dz * speed * 0.6;
      o.drag = 1.6;
      o.gravity = -9;
      o.alpha = 0.9;
      fx._spawn(fx.alpha, o);
    }
  }

  // ------------------------------------------------------------------ thrown into (the other handlers)
  /** The first standing piece on the line from the hero along (dx, dz) within `reach` m (header). */
  behind(hero, dx, dz, reach) {
    const W = this.W, out = this._behind, p = hero?.position ?? hero;
    out.piece = null;
    const l = Math.hypot(fin(dx), fin(dz));
    reach = fin(reach, this.T?.into?.reach ?? 8);
    if (!W?.around || !p || !Number.isFinite(p.x + p.z) || !(l > 1e-4) || !(reach > 0)) return null;
    const ux = dx / l, uz = dz / l;
    const n = W.around(p.x + ux * reach * 0.5, p.z + uz * reach * 0.5, reach * 0.5 + 1, this._near, 48);
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const b = this._near[i];
      if (!(b.hpMax < Infinity) || b.state !== INTACT) continue;
      // the line meets the footprint circle (b.x, b.z, b.r): t along it
      const ox = b.x - p.x, oz = b.z - p.z, along = ox * ux + oz * uz;
      if (along < -b.r) continue;
      const side = ox * -uz + oz * ux, rr = (b.r ?? 0.5) + (this.game.player?.radius ?? 0.45);
      if (Math.abs(side) > rr) continue;
      const t = Math.max(0, along - Math.sqrt(Math.max(0, rr * rr - side * side)));
      if (t > reach || t >= best) continue;
      best = t;
      out.piece = b;
      out.t = t;
      out.x = p.x + ux * t;
      out.z = p.z + uz * t;
    }
    return out.piece ? out : null;
  }

  /** The way to throw the hero so he goes through a piece (header). */
  aimThrow(hero, from = null, o = null) {
    const W = this.W, out = this._aim, p = hero?.position ?? hero, f = from ?? this.d.position;
    const I = this.T?.into ?? { reach: 8, spread: 0.6, minHp: 0.5 };
    const reach = fin(o?.reach, I.reach), spread = fin(o?.spread, I.spread);
    out.piece = null;
    let dx = fin(p?.x) - fin(f?.x), dz = fin(p?.z) - fin(f?.z);
    let l = Math.hypot(dx, dz);
    if (!(l > 1e-3)) {
      dx = Math.sin(this.d.yaw);
      dz = Math.cos(this.d.yaw);
      l = 1;
    }
    out.dx = dx / l;
    out.dz = dz / l;
    if (!W?.around || !p || !Number.isFinite(p.x + p.z)) return out;
    const n = W.around(p.x, p.z, reach, this._near, 48);
    const a0 = Math.atan2(out.dx, out.dz);
    let best = spread;
    let bx = out.dx, bz = out.dz;
    for (let i = 0; i < n; i++) {
      const b = this._near[i];
      if (!(b.hpMax < Infinity) || b.state !== INTACT || !(b.hpMax >= I.minHp)) continue;
      const ox = b.x - p.x, oz = b.z - p.z, e = Math.hypot(ox, oz);
      if (!(e > 0.3) || e - (b.r ?? 0.5) > reach) continue;
      let da = Math.atan2(ox, oz) - a0;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) >= best) continue;
      best = Math.abs(da);
      bx = ox / e;
      bz = oz / e;
      out.piece = b;
    }
    out.dx = bx;
    out.dz = bz;
    return out;
  }

  // ------------------------------------------------------------------ the rest of the contract
  hitPlayer(o) {
    return o;
  }
  onHit(o, r) {
    void o, r;
  }
  onParried(info, b) {
    void info, b;
    return false;
  }
  onRelease(b, s, a) {
    void b, s, a;
  }
  onSustain(b, s, a, k) {
    void b, s, a, k;
  }
  afterPose(dt, a) {
    void dt, a;
  }
}
