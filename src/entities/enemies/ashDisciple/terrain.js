import { clamp, turnToward } from '../../../core/math.js';
import { TELL } from '../../../combat/rules.js';
import { perPhase } from '../duelist/realise.js';
import { TUNING } from './tuning.js';

// The Ash Disciple uses the courtyard (ADR-111; COMBAT.md → "The Ash Disciple" → "He uses the
// courtyard"). Four moves on the pieces of the set (world.destructibles, ARCHITECTURE.md →
// "Destruction"); the moves themselves are data (moves.js: a move marked `terrain: kind`), their
// numbers TUNING.terrain. What is here: which piece he goes for, how he gets to it, and what the piece
// then does.
//   fell    Severed Pillar    he is behind the standing piece nearest the hero and cuts it through: it
//                             falls on the hero (the world tells it red, marks the strip and deals it)
//   kick    Flying Lantern    a short stone piece kicked at the hero: it cues itself flashLead before
//                             it lands (blue: a parry bursts it on the blade), the blow is his
//   toll    Three Tolls       three blows on the fallen bell, each a ring of sound that crosses the
//                             courtyard and cues itself flashLead before it reaches the hero
//   spring  Swallow's Return  he leaps back onto a pillar and springs off it into a diving cut
// A move is chosen by his AI only while a piece for it is in reach (weigh → 0 otherwise); started by
// hand (the Lab, Training) it goes for the nearest one however far, and cannot start with none (the
// tests' world mocks have no pieces). Out past his bound for a piece, his bound stretches (`slack`)
// and draws him back in once the move is over.
// No per-frame allocation: one record per move, per shot and per ring, reused; drawn through the
// duelist FX's reused spawn record.

/** A piece's states (world/destructibles.js STATE; ARCHITECTURE.md → "Destruction"). */
const INTACT = 0, FLYING = 4;
const ease = (u) => u * u * (3 - 2 * u);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

const STREAK = [1.7, 1.65, 1.6], STREAK_END = [0.3, 0.28, 0.27];
const GRIT = [1.1, 1.15, 1.35], GRIT_END = [0.2, 0.21, 0.26];
const MARK = [0.75, 0.78, 0.9];
const DUST = [0.24, 0.23, 0.22];
const BRONZE = [2.5, 1.6, 0.55], BRONZE_END = [0.6, 0.22, 0.05];
const STEEL = [3.0, 3.0, 3.2], STEEL_END = [0.5, 0.5, 0.6];

export class TerrainMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    /** m his bound is stretched by (a move that takes him out to a piece; it draws him back after) */
    this.slack = 0;
    /** the piece his AI found for each kind when it last weighed its moves (at brain time `pickT`) */
    this.pick = { fell: null, kick: null, toll: null, spring: null };
    this.pickT = -1;
    /** the move running: its act, its piece, where he started and where he is going */
    this.cur = { act: null, kind: '', piece: null, x0: 0, z0: 0, sx: 0, sy: 0, sz: 0, face: 0, k: 0, struck: false, dive: false, landed: false, px: 0, py: 0, pz: 0, tx: 0, tz: 0 };
    /** the piece in the air (Flying Lantern) */
    this.shot = { live: false, piece: null, flashed: false, tell: TELL.BLUE, damage: 0, kb: 0, attack: 'lanternKick', dx: 0, dz: 1, tx: 0, tz: 0 };
    /** the rings of sound (Three Tolls) */
    this.rings = Array.from({ length: 4 }, () => ({ alive: false, x: 0, z: 0, r: 0, age: 0, flashed: -1, done: false, tell: TELL.NORMAL, damage: 0, kb: 0, attack: 'bellToll', heavy: false }));
    this._blow = { kind: 'blunt', by: 'boss', dx: 0, dz: 0, y: 1, src: -1 };
    this._throw = { time: 0.7, power: 1, radius: 2, by: 'boss', onLand: (b, x, z) => this._landed(b, x, z) };
    this._flash = { source: 'dragon', attack: '', tell: TELL.NORMAL, x: 0, y: 0, z: 0 };
    this._v = { x: 0, y: 0, z: 0 };
    this._c = [0, 0, 0];
  }

  get W() {
    return this.game.world?.destructibles ?? null;
  }

  reset() {
    this.slack = 0;
    this.pickT = -1;
    this.cur.act = null;
    this.cur.piece = null;
    this.shot.live = false;
    this.shot.piece = null;
    for (const r of this.rings) r.alive = false;
  }

  /** Something of his is still in the air (a kicked piece, a ring of sound). */
  get busy() {
    return this.shot.live || this.rings.some((r) => r.alive);
  }

  // ------------------------------------------------------------------ which piece
  /**
   * The piece for a move of `kind` now, or null. Not `forced` (his AI): only one in reach of him
   * that the hero is placed for. `forced` (the Lab, Training): the best one however far.
   */
  find(kind, forced = false) {
    const L = this.W?.list;
    const T = TUNING.terrain, K = T[kind];
    if (!L?.length || !K) return null;
    const d = this.d, me = d.position;
    const p = this.game.player?.position;
    const hx = Number.isFinite(p?.x) ? p.x : me.x + Math.sin(d.yaw) * 4, hz = Number.isFinite(p?.z) ? p.z : me.z + Math.cos(d.yaw) * 4;
    const lim = d.baseBound + T.edge;
    const dHero = Math.hypot(me.x - hx, me.z - hz) || 1;
    let best = null, bs = Infinity;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.state !== INTACT || Math.hypot(b.x, b.z) > lim) continue;
      const dh = Math.hypot(hx - b.x, hz - b.z), dd = Math.hypot(me.x - b.x, me.z - b.z);
      let score;
      if (kind === 'toll') {
        if (b.kind !== 'bell') continue;
        if (!forced && (dd > K.reach || dh > K.heroMax)) continue;
        score = dd;
      } else {
        if (b.mat !== 'stone' || b.hpMax === Infinity) continue;
        if (kind === 'fell') {
          if (!b.topples || b.h < K.minH) continue;
          if (!forced && (dh < K.heroMin || dh > b.h + K.over || dd > K.reach)) continue;
          score = dh;
        } else if (kind === 'kick') {
          if (!(b.lift > 0) || b.h < K.minH || b.h > K.maxH || b.weight > K.maxWeight) continue;
          if (!forced && (dd > K.reach || dh < K.heroMin || dh > K.heroMax)) continue;
          score = dd - (b.kind === 'lantern' ? K.lantern : 0);
        } else {
          if (!b.topples || b.h < K.minH) continue;
          score = dd;
          if (!forced) {
            if (dd > K.reach || dd < K.near || dh < K.heroMin || dh > K.heroMax) continue;
            // behind him as the hero sees it (1 = straight behind): the way out is away from the blade
            const back = ((b.x - me.x) * (me.x - hx) + (b.z - me.z) * (me.z - hz)) / (dd * dHero);
            if (back < -0.25) continue;
            score = dd * 0.12 - back;
          }
        }
      }
      if (score < bs) {
        bs = score;
        best = b;
      }
    }
    return best;
  }

  /** His AI weighs a move (brain._choose → disciple.weigh): 0 while no piece for it is in reach. */
  weigh(def, w) {
    const kind = def.terrain;
    if (!kind) return w;
    const d = this.d;
    const b = this.find(kind, false);
    this.pick[kind] = b;
    this.pickT = d.time;
    if (!b) return 0;
    if (kind === 'spring') {
      // pressed, he wants the way out more
      const K = TUNING.terrain.spring;
      if (d.posture > d.maxPosture * K.postureOver || d.time - fin(d.brain?.struck?.t, -9) < K.struckWithin) w *= K.pressed;
    }
    return w;
  }

  /** A terrain move starts (brain.startAct → disciple.onActStart): its piece, where he will stand.
   *  False: there is no piece for it (the move does not start). */
  begin(A) {
    const kind = A?.def?.terrain;
    if (!kind) return true;
    const d = this.d, me = d.position, T = TUNING.terrain, K = T[kind];
    let b = this.pickT === d.time ? this.pick[kind] : null;
    if (!b || b.state !== INTACT) b = this.find(kind, true);
    if (!b || !K) return false;
    const C = this.cur;
    C.act = A;
    C.kind = kind;
    C.piece = b;
    C.x0 = me.x;
    C.z0 = me.z;
    C.k = 0;
    C.struck = C.dive = C.landed = false;
    const p = this.game.player?.position;
    const hx = Number.isFinite(p?.x) ? p.x : me.x + Math.sin(d.yaw) * 4, hz = Number.isFinite(p?.z) ? p.z : me.z + Math.cos(d.yaw) * 4;
    // from the piece toward the hero
    let ux = hx - b.x, uz = hz - b.z, l = Math.hypot(ux, uz);
    if (l < 0.05) {
      ux = b.x - me.x;
      uz = b.z - me.z;
      l = Math.hypot(ux, uz) || 1;
    }
    ux /= l;
    uz /= l;
    const R = b.r + d.T.radius;
    C.sy = 0;
    if (kind === 'spring') {
      // his feet land on its face toward the hero, well up it
      C.sx = b.x + ux * b.r * 0.7;
      C.sz = b.z + uz * b.r * 0.7;
      C.sy = Math.max(1, Math.min(K.perch, b.h - 0.9));
    } else if (kind === 'toll') {
      // beside the bell, on the hero's side of it, to whichever hand is nearer the courtyard's centre
      let bx = 0, bz = 0, bo = Infinity;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const a = Math.atan2(ux, uz) + sgn * 0.9;
        const x = b.x + Math.sin(a) * (R + K.stand), z = b.z + Math.cos(a) * (R + K.stand), o = Math.hypot(x, z);
        if (o < bo) {
          bo = o;
          bx = x;
          bz = z;
        }
      }
      C.sx = bx;
      C.sz = bz;
    } else {
      // behind the piece: he, the piece and the hero in one line
      C.sx = b.x - ux * (R + K.stand);
      C.sz = b.z - uz * (R + K.stand);
    }
    if (kind !== 'spring') {
      const v = this._v;
      v.x = C.sx;
      v.z = C.sz;
      this.game.world?.resolve?.(v, d.T.radius, Infinity);
      if (Number.isFinite(v.x + v.z)) {
        C.sx = v.x;
        C.sz = v.z;
      }
    }
    C.face = Math.atan2(b.x - C.sx, b.z - C.sz);
    this.slack = Math.max(this.slack, T.edge + 3);
    return true;
  }

  // ------------------------------------------------------------------ his own root motion
  /** Per frame of a terrain move's beat (brain._motion → disciple.beatMotion). */
  motion(b, u, s, dt) {
    const C = this.cur, d = this.d;
    if (!C.act || C.act !== d.brain.act) return;
    if (C.kind === 'spring') {
      this._spring(b, u, s, dt);
      return;
    }
    const G = b.def.go, pos = d.position;
    let k = 1;
    if (G) {
      k = clamp((u - G[0]) / Math.max(1e-4, G[1] - G[0]), 0, 1);
      if (k > C.k) {
        const e = ease(k), px = pos.x, py = pos.y, pz = pos.z;
        pos.x = C.x0 + (C.sx - C.x0) * e;
        pos.z = C.z0 + (C.sz - C.z0) * e;
        pos.y = fin(G[2], 0) * 4 * k * (1 - k);
        this._trail(px, py, pz, pos.x, pos.y, pos.z);
        if (k >= 1) {
          pos.y = 0;
          d.fx.dust(pos.x, pos.z, 1.1);
        }
        C.k = k;
      }
      d.state = pos.y > 0.4 ? 'airborne' : 'combat';
    }
    // he looks where he is going, then at the piece
    const far = Math.hypot(C.sx - C.x0, C.sz - C.z0) > 1;
    d.yaw = turnToward(d.yaw, k < 0.7 && far ? Math.atan2(C.sx - C.x0, C.sz - C.z0) : C.face, 22 * dt);
  }

  /** Swallow's Return: up to the pillar, a beat on it, the dive. */
  _spring(b, u, s, dt) {
    const C = this.cur, d = this.d, pos = d.position, K = TUNING.terrain.spring, S = b.def.spring;
    if (!S) return;
    if (u < S.off) {
      const k = clamp((u - S.up[0]) / Math.max(1e-4, S.up[1] - S.up[0]), 0, 1);
      if (k > C.k) {
        const e = ease(k), px = pos.x, py = pos.y, pz = pos.z;
        pos.x = C.x0 + (C.sx - C.x0) * e;
        pos.z = C.z0 + (C.sz - C.z0) * e;
        pos.y = C.sy * e + K.arc * 4 * k * (1 - k);
        this._trail(px, py, pz, pos.x, pos.y, pos.z);
        C.k = k;
      }
      if (k < 1) d.yaw = turnToward(d.yaw, Math.atan2(C.sx - C.x0, C.sz - C.z0), 22 * dt);
      else {
        if (!C.struck) {
          C.struck = true;
          this._plant(C.piece);
        }
        if (s) d.yaw = turnToward(d.yaw, Math.atan2(s.p.x - pos.x, s.p.z - pos.z), 26 * dt);
      }
    } else if (u < 1) {
      if (!C.dive) {
        C.dive = true;
        C.px = pos.x;
        C.py = pos.y;
        C.pz = pos.z;
        C.tx = pos.x + Math.sin(d.yaw) * 4;
        C.tz = pos.z + Math.cos(d.yaw) * 4;
        C.k = 0;
        d.emit('dragon:takeoff');
      }
      const k = clamp((u - S.off) / Math.max(1e-4, 1 - S.off), 0, 1);
      if (s && k <= K.trackTo) {
        // the landing follows the hero (a little ahead of him), `stop` m short: his cut reaches the rest
        let ax = s.p.x + s.vx * 0.12 - C.px, az = s.p.z + s.vz * 0.12 - C.pz;
        const l = Math.hypot(ax, az) || 1;
        const len = clamp(l - K.stop, 0.5, K.max);
        ax /= l;
        az /= l;
        const v = this._v;
        v.x = C.px + ax * len;
        v.z = C.pz + az * len;
        this.game.world?.resolve?.(v, d.T.radius, Infinity);
        if (Number.isFinite(v.x + v.z)) {
          C.tx = v.x;
          C.tz = v.z;
        }
      }
      if (k > C.k) {
        const px = pos.x, py = pos.y, pz = pos.z, e = k * (0.6 + 0.4 * k);
        pos.x = C.px + (C.tx - C.px) * e;
        pos.z = C.pz + (C.tz - C.pz) * e;
        pos.y = C.py * (1 - e) * (1 - 0.5 * e);
        this._trail(px, py, pz, pos.x, pos.y, pos.z);
        C.k = k;
      }
      d.yaw = Math.atan2(C.tx - C.px, C.tz - C.pz);
    } else {
      if (C.dive && !C.landed) {
        C.landed = true;
        pos.x = C.tx;
        pos.z = C.tz;
      }
      pos.y = 0;
    }
    d.state = pos.y > 0.4 ? 'airborne' : 'combat';
  }

  /** His feet land on the pillar: it shudders, chips fly (a blunt blow; a worn one gives way). */
  _plant(pc) {
    const d = this.d, W = this.W, K = TUNING.terrain.spring, p = d.position;
    d.fx.dust(p.x, p.z, 0.5);
    this._burst(p.x, p.y + 0.2, p.z, 8, DUST, 2.2, false);
    if (!W?.strike || !pc || pc.state !== INTACT) return;
    const o = this._blow, hp = this.game.player?.position;
    o.kind = 'blunt';
    // (it is driven away from where he springs to)
    o.dx = pc.x - fin(hp?.x, p.x);
    o.dz = pc.z - fin(hp?.z, p.z);
    o.y = Math.min(pc.h, p.y);
    o.src = W.swing();
    W.strike(pc.x, pc.z, 0.2, K.power, o);
  }

  // ------------------------------------------------------------------ what the piece does
  /** A terrain beat's impact, its first frame (brain → disciple.onImpact). */
  impact(b, s, a) {
    const C = this.cur, d = this.d;
    if (!C.act || C.act !== a) return;
    if (C.kind === 'fell') this._fell(s);
    else if (C.kind === 'spring') {
      d.emit('dragon:land', { x: d.position.x, z: d.position.z });
      d.fx.dust(d.position.x, d.position.z, 1.4);
      this.game.world?.gust?.(d.position.x, d.position.z, 1.0, 4);
      this.game.shake?.(0.16);
    }
  }

  /** Severed Pillar: the blade is through it. It falls on the hero: the world tells it red, marks
   *  the strip it lands on and deals the blow (world.destructibles.topple). */
  _fell(s) {
    const C = this.cur, d = this.d, W = this.W, pc = C.piece;
    if (!W?.topple || !pc || pc.state !== INTACT) return;
    const p = s?.p;
    let dx = fin(p?.x, NaN) - pc.x, dz = fin(p?.z, NaN) - pc.z;
    if (!Number.isFinite(dx + dz) || dx * dx + dz * dz < 1e-4) {
      dx = Math.sin(d.yaw);
      dz = Math.cos(d.yaw);
    }
    if (!W.topple(pc, dx, dz, 'boss')) return;
    const l = Math.hypot(dx, dz) || 1, y = TUNING.terrain.fell.cut;
    this._cutLine(pc.x, y, pc.z, -dz / l, dx / l, pc.r);
    this.game.shake?.(0.22);
    this.game.world?.gust?.(pc.x, pc.z, 0.8, 5);
  }

  /** A terrain cast's impact (brain → disciple.onCast): the kick, a toll. */
  cast(b, s, a) {
    const C = this.cur;
    if (!C.act || C.act !== a) return;
    if (C.kind === 'kick') this._kick(b, s, a);
    else if (C.kind === 'toll') this._toll(b, a);
  }

  /** Flying Lantern: the piece leaves the ground and flies at the hero (world.destructibles.take /
   *  throwTo). It cues itself (frame) and its blow at the hero is his (_landed). */
  _kick(b, s, a) {
    const C = this.cur, d = this.d, W = this.W, pc = C.piece, K = TUNING.terrain.kick;
    if (!W?.take || !pc || pc.state !== INTACT || !W.take(pc)) return;
    let tx = pc.x + Math.sin(d.yaw) * 8, tz = pc.z + Math.cos(d.yaw) * 8;
    if (s) {
      tx = s.p.x + s.vx * K.lead;
      tz = s.p.z + s.vz * K.lead;
    }
    const dist = Math.hypot(tx - pc.x, tz - pc.z), l = dist || 1;
    const dx = (tx - pc.x) / l, dz = (tz - pc.z) / l;
    W.carry(pc, pc.x + dx * 0.2, 0.3, pc.z + dz * 0.2, 0.25, Math.atan2(dx, dz));
    const o = this._throw;
    o.time = clamp(K.time[0] + dist / K.per, K.time[0], K.time[1]);
    o.power = K.power;
    o.radius = K.radius;
    if (!W.throwTo(pc, tx, tz, o)) {
      W.drop?.(pc);
      return;
    }
    const S = this.shot;
    S.live = true;
    S.piece = pc;
    S.flashed = false;
    S.tell = b.def.tell;
    S.damage = b.def.damage;
    S.kb = b.def.knockback ?? 2;
    S.attack = a?.name ?? 'lanternKick';
    S.dx = dx;
    S.dz = dz;
    S.tx = tx;
    S.tz = tz;
    this._burst(pc.x, 0.7, pc.z, 14, DUST, 3.2, false, dx, dz);
    // the blow that sends it: a fan of pale strokes thrown the way it goes
    const fx = d.fx, rot = Math.atan2(-dz * 0.848, dx);
    for (let i = -3; i <= 3; i++) {
      const sp = fx.rand(9, 15), w = i * 0.22;
      fx._spawn(fx.add, {
        x: pc.x - dx * 0.5 - dz * w, y: 0.8 + 0.1 * Math.abs(i), z: pc.z - dz * 0.5 + dx * w, vx: dx * sp, vy: 0.6, vz: dz * sp,
        life: fx.rand(0.14, 0.24), size: 0.4, sizeEnd: 0.08, glyph: ')', rot, color: STEEL, colorEnd: STEEL_END, alpha: 0.95, alphaEnd: 0, drag: 5,
      });
    }
    this.game.shake?.(0.18);
  }

  /** The kicked piece has landed (the world's onLand): its blow at the hero, if he is under it. */
  _landed(pc, x, z) {
    const S = this.shot, d = this.d;
    if (!S.live || S.piece !== pc) return;
    S.live = false;
    const p = this.game.player, K = TUNING.terrain.kick;
    if (!p?.position || p.alive === false) return;
    if (Math.hypot(p.position.x - x, p.position.z - z) > K.hit + (p.radius ?? 0.45)) return;
    // (it must have been cued: it always is, its flight is longer than the lead)
    if (!S.flashed) return;
    d.hitPlayer({
      damage: S.damage, knockback: S.kb, kind: 'stone', tell: S.tell, attack: S.attack,
      from: { x: x - S.dx * 1.4, z: z - S.dz * 1.4 }, projectile: true, parryPosture: K.parryPosture,
    });
  }

  /** Three Tolls: his blade on the bronze. It rings (the world's sparks and sound) and a ring of
   *  sound leaves it. */
  _toll(b, a) {
    const C = this.cur, W = this.W, pc = C.piece, K = TUNING.terrain.toll;
    if (!pc) return;
    if (W?.strike) {
      const o = this._blow;
      o.kind = 'blunt';
      o.dx = pc.x - this.d.position.x;
      o.dz = pc.z - this.d.position.z;
      o.y = 1;
      o.src = W.swing();
      W.strike(pc.x, pc.z, 0.3, K.strike, o);
    }
    let R = null;
    for (const r of this.rings) {
      if (!r.alive) {
        R = r;
        break;
      }
    }
    if (R) {
      R.alive = true;
      R.x = pc.x;
      R.z = pc.z;
      R.r = K.from;
      R.age = 0;
      R.flashed = -1;
      R.done = false;
      R.tell = b.def.tell;
      R.heavy = b.def.tell === TELL.BLUE;
      R.damage = b.def.damage;
      R.kb = b.def.knockback ?? 1;
      R.attack = a?.name ?? 'bellToll';
    }
    const heavy = b.def.tell === TELL.BLUE;
    this._burst(pc.x, 1.1, pc.z, heavy ? 26 : 16, BRONZE, heavy ? 7 : 5, true);
    this.d.fx._light({ x: pc.x, y: 1.4, z: pc.z, color: [1, 0.7, 0.3], intensity: heavy ? 4.5 : 3, radius: heavy ? 10 : 7, life: 0.35, fade: 0.3 });
    this.game.shake?.(heavy ? 0.3 : 0.18);
    this.game.world?.gust?.(pc.x, pc.z, heavy ? 1.6 : 1.1, 14);
  }

  // ------------------------------------------------------------------ frame
  /** Every brain update (disciple.brainFrame): his bound's slack, the piece in the air, the rings. */
  frame(dt) {
    const d = this.d, C = this.cur, T = TUNING.terrain;
    // the move is over (it ran out, or he was thrown out of it)
    if (C.act && d.brain.act !== C.act) {
      C.act = null;
      C.piece = null;
    }
    // out past his bound for a piece: once the move is over the bound draws back in, and him with it
    if (C.act) this.slack = Math.max(this.slack, T.edge + 3);
    else if (this.slack > 0) {
      const out = Math.hypot(d.position.x, d.position.z) - d.baseBound;
      this.slack = Math.max(0, Math.min(this.slack - T.leash * dt, out + 0.05));
    }
    const lead = perPhase(d.T.flashLead, d.phase);
    this._shot(dt, lead);
    this._rings(dt, lead);
  }

  /** The kicked piece in the air: dust off it, its shadow where it will land, its cue. */
  _shot(dt, lead) {
    const S = this.shot;
    if (!S.live) return;
    const pc = S.piece, d = this.d, fx = d.fx;
    if (!pc || pc.state !== FLYING) {
      S.live = false; // (the fight was reset under it)
      return;
    }
    const left = pc.T - pc.t;
    const life = Math.max(0.02, (this.game.fxDt ?? dt) * 1.7);
    // the wake it leaves: grit and pale stone dust strung out along its flight
    const y = Math.max(0.3, pc.py + pc.h * 0.5);
    for (let i = 0; i < 2; i++) {
      const o = fx._rec(pc.px + fx.rand(-0.3, 0.3), y + fx.rand(-0.4, 0.4), pc.pz + fx.rand(-0.3, 0.3), fx.rand(0.22, 0.45), 0.24, 0.05, i ? '-=' : '.,:', GRIT, GRIT_END);
      o.vx = -S.dx * fx.rand(1, 3);
      o.vz = -S.dz * fx.rand(1, 3);
      o.vy = fx.rand(0, 0.8);
      o.drag = 2;
      o.stretch = i ? 1.8 : 0;
      o.alpha = 0.85;
      fx._spawn(fx.add, o);
    }
    // where it will come down: a ring of pale dust motes on the stones, closing as it nears (no
    // colour: it can be parried, and the glint on the piece is the cue)
    const K = TUNING.terrain.kick, k = clamp(1 - left / Math.max(0.05, pc.T), 0, 1);
    const r = K.hit * (1.5 - 0.6 * k), spin = (this.game.time ?? 0) * 1.4, c = this._c;
    const lum = 0.7 + 1.3 * k;
    c[0] = MARK[0] * lum;
    c[1] = MARK[1] * lum;
    c[2] = MARK[2] * lum;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + spin;
      const q = fx._rec(S.tx + Math.cos(a) * r, 0.14, S.tz + Math.sin(a) * r, life, i % 3 ? 0.3 : 0.44, i % 3 ? 0.3 : 0.44, i % 3 ? 'o' : 'x', c, null);
      q.alphaEnd = 1;
      fx._spawn(fx.add, q);
    }
    if (!S.flashed && left <= lead) {
      S.flashed = true;
      const f = this._flash;
      f.attack = S.attack;
      f.tell = S.tell;
      f.x = pc.px;
      f.y = y;
      f.z = pc.pz;
      d.emit('combat:flash', f);
      fx.hazardFlash(S.tell, f.x, f.y, f.z);
    }
  }

  /** The rings of sound: each grows from the bell, cues itself `lead` before its front reaches the
   *  hero and strikes him once as it passes (a parry or a roll through it spends it for him). */
  _rings(dt, lead) {
    const K = TUNING.terrain.toll, d = this.d, p = this.game.player;
    for (const R of this.rings) {
      if (!R.alive) continue;
      R.age += dt;
      R.r += K.speed * dt;
      if (R.r > K.range) {
        R.alive = false;
        continue;
      }
      this._drawRing(R, dt, K);
      const pp = p?.position;
      if (R.done || !pp || p.alive === false) continue;
      const ox = pp.x - R.x, oz = pp.z - R.z, D = Math.hypot(ox, oz) || 1e-3;
      const reach = K.width + (p.radius ?? 0.45), gap = D - R.r;
      if (R.flashed < 0 && gap > reach) {
        // (a hero running at the bell meets it sooner: the cue counts his own speed in)
        const toward = -(fin(p.vel?.x) * ox + fin(p.vel?.z) * oz) / D;
        if ((gap - reach) / (K.speed + Math.max(0, toward)) <= lead) {
          R.flashed = R.age;
          const f = this._flash;
          f.attack = R.attack;
          f.tell = R.tell;
          f.x = R.x + (ox / D) * R.r;
          f.y = 0.9;
          f.z = R.z + (oz / D) * R.r;
          d.emit('combat:flash', f);
          d.fx.hazardFlash(R.tell, f.x, f.y, f.z);
        }
      }
      if (gap > reach) continue;
      R.done = true;
      // fairness (as his crescents): a ring that could not cue in time passes him by (he stood at
      // the bell when it rang, or inside it)
      if (gap < -reach || R.flashed < 0 || R.age - R.flashed < 0.24) continue;
      d.hitPlayer({
        damage: R.damage, knockback: R.kb, kind: 'sound', tell: R.tell, attack: R.attack,
        from: { x: R.x, z: R.z }, projectile: true, parryPosture: K.parryPosture,
      });
    }
  }

  // ------------------------------------------------------------------ glyphs
  /** A ring of sound, re-drawn every frame: one line of bronze strokes along its front, each bulging
   *  outward, fading as it widens; a few motes of bronze dust lifted behind it. (The owner's pick of
   *  two filmed looks, 2026-11-15: "A: arc"; three thin ripples were turned down.) */
  _drawRing(R, dt, K) {
    const fx = this.d.fx, add = fx.add;
    if (!add) return;
    const life = Math.max(0.02, (this.game.fxDt ?? dt) * 1.7);
    const fade = clamp(1.15 - R.r / K.range, 0, 1) * (R.heavy ? 1.25 : 0.9);
    const c = this._c, r = R.r;
    c[0] = BRONZE[0] * fade;
    c[1] = BRONZE[1] * fade;
    c[2] = BRONZE[2] * fade;
    const n = clamp(Math.round((Math.PI * 2 * r) / 0.6), 18, 150);
    const size = R.heavy ? 0.62 : 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const o = fx._rec(R.x + ca * r, 0.5, R.z + sa * r, life, size, size, ')', c, null);
      o.rot = Math.atan2(-sa, ca);
      o.alphaEnd = 1;
      add.spawn(o);
    }
    // the hum it leaves
    if (r > 1) {
      for (let i = 0; i < 3; i++) {
        const a = fx.rnd() * Math.PI * 2, rr = r - fx.rand(0.2, 0.9);
        const o = fx._rec(R.x + Math.cos(a) * rr, 0.2, R.z + Math.sin(a) * rr, fx.rand(0.25, 0.5), 0.16, 0.04, ".'", BRONZE, BRONZE_END);
        o.vy = fx.rand(0.4, 1.2);
        o.alpha = 0.7 * fade;
        add.spawn(o);
      }
    }
  }

  /** The streak he leaves crossing the courtyard to a piece (frame to frame). */
  _trail(x0, y0, z0, x1, y1, z1) {
    const fx = this.d.fx, add = fx.add;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    if (!add || !(len > 0.04) || len > 9) return;
    const n = Math.min(12, Math.max(1, Math.round(len / 0.28)));
    const vx = (x1 - x0) / len, vz = (z1 - z0) / len;
    for (let i = 0; i < n; i++) {
      const f = (i + fx.rnd()) / n;
      const o = fx._rec(x0 + (x1 - x0) * f + fx.rand(-0.1, 0.1), y0 + (y1 - y0) * f + fx.rand(0.45, 1.5), z0 + (z1 - z0) * f + fx.rand(-0.1, 0.1), fx.rand(0.16, 0.32), fx.rand(0.18, 0.28), 0.05, '-=~', STREAK, STREAK_END);
      o.vx = vx * fx.rand(0.5, 2.5);
      o.vz = vz * fx.rand(0.5, 2.5);
      o.stretch = 2.2;
      o.alpha = 0.9;
      o.drag = 2.5;
      add.spawn(o);
    }
    if (y1 < 0.3 && fx.alpha) {
      const o = fx._rec(x1, 0.12, z1, fx.rand(0.35, 0.6), 0.26, 0.6, ',.`', DUST, null);
      o.vx = -vx * fx.rand(0.5, 1.5);
      o.vy = fx.rand(0.2, 0.8);
      o.vz = -vz * fx.rand(0.5, 1.5);
      o.alpha = 0.7;
      o.drag = 3;
      fx.alpha.spawn(o);
    }
  }

  /** The cut through a piece: a bright line across it (along (px, pz), the cut's way), sparks off the stone. */
  _cutLine(x, y, z, px, pz, r) {
    const fx = this.d.fx;
    const w = r + 0.9;
    for (let i = -6; i <= 6; i++) {
      const f = i / 6;
      fx._spawn(fx.add, {
        x: x + px * w * f, y: y + 0.12 * f, z: z + pz * w * f, life: 0.2 + 0.12 * (1 - Math.abs(f)), size: 0.34, sizeEnd: 0.06, glyph: '-=', stretch: 2.6,
        color: STEEL, colorEnd: STEEL_END, alpha: 1, alphaEnd: 0,
      });
    }
    for (let i = 0; i < 16; i++) {
      const sp = fx.rand(2, 7), side = fx.rnd() < 0.5 ? -1 : 1;
      fx._spawn(fx.add, {
        x: x + px * r * side * 0.6, y: y + fx.rand(-0.1, 0.1), z: z + pz * r * side * 0.6, vx: px * sp * side + fx.rand(-1, 1), vy: fx.rand(0.5, 3), vz: pz * sp * side + fx.rand(-1, 1),
        life: fx.rand(0.2, 0.45), size: fx.rand(0.14, 0.24), sizeEnd: 0.04, glyph: "*'+", color: [3.2, 2.6, 1.6], colorEnd: [0.8, 0.3, 0.08], alpha: 1, alphaEnd: 0, drag: 3, gravity: -6,
      });
    }
    fx._light({ x, y: 1, z, color: [1, 0.95, 0.85], intensity: 2.6, radius: 5, life: 0.2, fade: 0.18 });
  }

  /** A burst of glyphs at a point: dust kicked up (solid) or bronze sparks (`glow`), thrown out and
   *  along (dx, dz). */
  _burst(x, y, z, n, color, speed, glow, dx = 0, dz = 0) {
    const fx = this.d.fx, pool = glow ? fx.add : fx.alpha;
    for (let i = 0; i < n; i++) {
      const a = fx.rnd() * Math.PI * 2, sp = fx.rand(0.4, 1) * speed;
      fx._spawn(pool, {
        x, y: y + fx.rand(-0.2, 0.2), z, vx: Math.cos(a) * sp + dx * speed * 0.6, vy: fx.rand(0.4, glow ? 4 : 2.2), vz: Math.sin(a) * sp + dz * speed * 0.6,
        life: fx.rand(0.3, 0.7), size: glow ? fx.rand(0.16, 0.3) : fx.rand(0.24, 0.4), sizeEnd: glow ? 0.04 : 0.6, glyph: glow ? '*+x.' : ',.:`',
        color, colorEnd: glow ? BRONZE_END : color, alpha: glow ? 1 : 0.75, alphaEnd: 0, drag: glow ? 2.2 : 3, gravity: glow ? -7 : 0,
      });
    }
  }
}
