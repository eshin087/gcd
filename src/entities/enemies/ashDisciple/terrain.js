import { clamp, turnToward } from '../../../core/math.js';
import { TELL } from '../../../combat/rules.js';
import { FIRE_KIND } from '../../../render/firePalettes.js';
import { perPhase } from '../duelist/realise.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { TUNING } from './tuning.js';

// The Ash Disciple uses the courtyard (ADR-111; COMBAT.md → "The Ash Disciple" → "He uses the
// courtyard"). His moves on the pieces of the set (world.destructibles, ARCHITECTURE.md →
// "Destruction"); the moves themselves are data (moves.js: a move marked `terrain: kind`), their
// numbers TUNING.terrain. What is here: which piece he goes for, how he gets to it, and what the piece
// then does.
//   fell    Severed Pillar    he is behind the standing piece nearest the hero and cuts it through: it
//                             falls on the hero (the world tells it red, marks the strip and deals it).
//                             A colossus's upper half too: its strip starts `fallOff` m out from its base
//   kick    Flying Lantern    a short stone piece kicked at the hero: the flare on the flying piece
//                             flashLead before it lands (blue: a parry bursts it on the blade), the blow
//                             is his. Nothing is drawn where it will land (the owner's choice, 2026-11-16)
//   toll    Three Tolls       three blows on the fallen bell, each a ring of sound that crosses the
//                             courtyard and cues itself flashLead before it reaches the hero
//   spring  Swallow's Return  he leaps back onto a pillar and springs off it into a diving cut
//   flag    Rising Flagstone  (the second pass) the floor: his blade levers a flagstone up out of the
//                             paving and he kicks it at the hero (blue, the flare on the piece); a move
//                             of two or three beats levers and kicks one each beat
//   fan     Scattered Flagstones  (phase 3) three flagstones levered up at once and cut through in the
//                             air: they leave as a fan, each with its own flare
// A move is chosen by his AI only while a piece for it is in reach (weigh → 0 otherwise); started by
// hand (the Lab, Training) it goes for the nearest one however far, and cannot start with none (the
// tests' world mocks have no pieces). Out past his bound for a piece, his bound stretches (`slack`)
// and draws him back in once the move is over.
// Every piece in the air is told to the cue ledger (duelist/ledger.js: the lantern and the toll's
// rings by its predictor, the kicked flagstones through brain.expect) and its flight is lengthened by
// the fairness guard (brain.fairDelay) when it would land too near a cue that asks the other answer.
// Two random streams of its own: `_g` for what decides the game (none drawn yet: kept for the fan's
// aim if it ever jitters), `_l` for what only draws. Neither is the effects' stream (fx.rnd), so no
// look option can move a landing.
// No per-frame allocation: one record per move, per shot and per ring, reused; drawn through the
// duelist FX's reused records.

/** A piece's states (world/destructibles.js STATE; ARCHITECTURE.md → "Destruction"). */
const INTACT = 0, HELD = 3, FLYING = 4;
const K_STEEL = FIRE_KIND.steel, K_FIRE = FIRE_KIND.fire, K_SMOKE = FIRE_KIND.smoke;
const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** A steady hash 0..1 of a number (a ragged ring that does not boil frame to frame). */
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const GRIT = [1.1, 1.15, 1.35], GRIT_END = [0.2, 0.21, 0.26];
const DUST = [0.24, 0.23, 0.22];
const BRONZE = [2.5, 1.6, 0.55], BRONZE_END = [0.6, 0.22, 0.05];
const SPARK = [3.2, 2.6, 1.6], SPARK_END = [0.8, 0.3, 0.08];
/** The looks of a toll's ring of sound (`?toll=`): '0' the bronze ')' arcs as shipped, 'a' a ragged
 *  front of steel in the fire field, 'b' the same with a low bronze heat under it. */
export const TOLL_LOOKS = Object.freeze(['0', 'a', 'b']);
const FLOOR_KINDS = new Set(['flag', 'fan']);

export class TerrainMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    /** m his bound is stretched by (a move that takes him out to a piece; it draws him back after) */
    this.slack = 0;
    /** the piece his AI found for each kind when it last weighed its moves (at brain time `pickT`) */
    this.pick = { fell: null, kick: null, toll: null, spring: null, flag: null, fan: null };
    this.pickT = -1;
    /** the move running: its act, its piece, where he started and where he is going */
    this.cur = { act: null, kind: '', piece: null, x0: 0, z0: 0, sx: 0, sy: 0, sz: 0, face: 0, k: 0, struck: false, dive: false, landed: false, px: 0, py: 0, pz: 0, tx: 0, tz: 0, beat: null, levered: false };
    /** the piece in the air (Flying Lantern) */
    this.shot = { live: false, piece: null, flashed: false, tell: TELL.BLUE, damage: 0, kb: 0, attack: 'lanternKick', dx: 0, dz: 1, tx: 0, tz: 0, quiet: false };
    /** the rings of sound (Three Tolls) */
    this.rings = Array.from({ length: 4 }, () => ({ alive: false, x: 0, z: 0, r: 0, age: 0, flashed: -1, done: false, tell: TELL.NORMAL, damage: 0, kb: 0, attack: 'bellToll', heavy: false, seed: 0 }));
    /** flagstones levered up and waiting for the kick (Rising Flagstone, Scattered Flagstones) */
    this.lifted = Array.from({ length: 4 }, () => ({ piece: null, t: 0, x0: 0, z0: 0, ox: 0, oz: 0, y: 0, spin: 0 }));
    /** flagstones in the air: each told to the cue ledger (`h`, brain.expect) */
    this.kicks = Array.from({ length: 4 }, () => ({ live: false, piece: null, flashed: false, quiet: false, tell: TELL.BLUE, damage: 0, kb: 0, attack: '', dx: 0, dz: 1, h: null }));
    this._blow = { kind: 'blunt', by: 'boss', dx: 0, dz: 0, y: 1, src: -1 };
    this._throw = { time: 0.7, power: 1, radius: 2, by: 'boss', onLand: (b, x, z) => this._landed(b, x, z) };
    this._slabThrow = { time: 0.7, power: 1, radius: 2, by: 'boss', onLand: (b, x, z) => this._slabLanded(b, x, z) };
    // (a thrown piece's cue: `flare` — the flare is drawn on the piece; not a `hazard`, as before: the
    // HUD's edge and the trainer read it as his blow)
    this._flash = { source: 'dragon', attack: '', tell: TELL.NORMAL, x: 0, y: 0, z: 0, flare: false };
    this._v = { x: 0, y: 0, z: 0 };
    this._near = [];
    this._gs = 0x6a09e667;
    this._ls = 0x3c6ef372;
  }

  get W() {
    return this.game.world?.destructibles ?? null;
  }

  /** The gameplay stream (its own: no look can move it). */
  _g() {
    this._gs = (Math.imul(this._gs, 1664525) + 1013904223) >>> 0;
    return this._gs / 4294967296;
  }
  /** The looks' stream (its own: a look drawing more or less never moves anything). */
  _l() {
    this._ls = (Math.imul(this._ls, 1103515245) + 12345) >>> 0;
    return this._ls / 4294967296;
  }
  _lr(a, b) {
    return a + this._l() * (b - a);
  }

  reset() {
    this.slack = 0;
    this.pickT = -1;
    this.cur.act = null;
    this.cur.piece = null;
    this.cur.beat = null;
    this.shot.live = false;
    this.shot.piece = null;
    for (const r of this.rings) r.alive = false;
    for (const L of this.lifted) L.piece = null;
    for (const k of this.kicks) {
      k.live = false;
      k.piece = null;
      k.h?.cancel?.();
      k.h = null;
    }
    this._gs = 0x6a09e667;
    this._ls = 0x3c6ef372;
  }

  /** Something of his is still in the air (a kicked piece, a ring of sound, a levered flagstone). */
  get busy() {
    return this.shot.live || this.rings.some((r) => r.alive) || this.kicks.some((k) => k.live) || this.lifted.some((L) => L.piece);
  }

  /** Where the hero is (a point ahead of him when there is none). */
  _hero() {
    const d = this.d, me = d.position, p = this.game.player?.position, v = this._v;
    v.x = Number.isFinite(p?.x) ? p.x : me.x + Math.sin(d.yaw) * 4;
    v.z = Number.isFinite(p?.z) ? p.z : me.z + Math.cos(d.yaw) * 4;
    return v;
  }

  // ------------------------------------------------------------------ which piece
  /**
   * The piece for a move of `kind` now, or null. Not `forced` (his AI): only one in reach of him
   * that the hero is placed for. `forced` (the Lab, Training): the best one however far.
   */
  find(kind, forced = false) {
    if (FLOOR_KINDS.has(kind)) return this._floorAhead(TUNING.terrain[kind], forced);
    const L = this.W?.list;
    const T = TUNING.terrain, K = T[kind];
    if (!L?.length || !K) return null;
    const d = this.d, me = d.position;
    const H = this._hero(), hx = H.x, hz = H.z;
    const lim = d.baseBound + T.edge;
    const dHero = Math.hypot(me.x - hx, me.z - hz) || 1;
    let best = null, bs = Infinity;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.state !== INTACT || b.floor || Math.hypot(b.x, b.z) > lim) continue;
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
          // (a colossus: its legs stand while its upper half does, and the upper half is what falls; its
          // strip starts `fallOff` m out from the base, where the upper half comes down)
          if (b.top && b.top.state === INTACT) continue;
          const off = fin(b.fallOff, 0);
          if (!forced && (dh - off < K.heroMin || dh - off > b.h + K.over || dd > K.reach)) continue;
          score = dh; // (the piece nearest the hero: a pillar before a colossus beside it)
        } else if (kind === 'kick') {
          if (!(b.lift > 0) || b.h < K.minH || b.h > K.maxH || b.weight > K.maxWeight) continue;
          if (!forced && (dd > K.reach || dh < K.heroMin || dh > K.heroMax)) continue;
          score = dd - (b.kind === 'lantern' ? K.lantern : 0);
        } else {
          if (!b.topples || b.h < K.minH || b.y0 > 0) continue;
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

  /**
   * A flagstone to lever up (Rising Flagstone, Scattered Flagstones): whole slabs of the paving within
   * `K.reach` of the point `K.ahead` m in front of him toward the hero, nearest first, into this._near
   * (at most `K.count`). His AI: only while the hero stands `heroMin` .. `heroMax` m off and there are
   * `need` of them. Returns the first, or null.
   */
  _floorAhead(K, forced) {
    const W = this.W, d = this.d, me = d.position, out = this._near;
    out.length = 0;
    if (!K || !W?.floorNear || !W.floor?.length) return null;
    const H = this._hero();
    let ux = H.x - me.x, uz = H.z - me.z;
    const dist = Math.hypot(ux, uz);
    if (!forced && (dist < K.heroMin || dist > K.heroMax)) return null;
    if (dist > 0.05) {
      ux /= dist;
      uz /= dist;
    } else {
      ux = Math.sin(d.yaw);
      uz = Math.cos(d.yaw);
    }
    const n = W.floorNear(me.x + ux * K.ahead, me.z + uz * K.ahead, forced ? K.reach * 2.5 : K.reach, out, { kind: K.kind, whole: true, max: K.count ?? 1 });
    if (!n || (!forced && n < (K.need ?? 1))) return null;
    return out[0];
  }

  /** His AI weighs a move (brain._choose → disciple.weigh): 0 while no piece for it is in reach. */
  weigh(def, w) {
    const kind = def.terrain;
    if (!kind) return w;
    const d = this.d;
    // (a flagstone move while one is still in the air or levered: not yet)
    if (FLOOR_KINDS.has(kind) && (this.kicks.some((k) => k.live) || this.lifted.some((L) => L.piece))) return 0;
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
    C.beat = A.beats?.[0] ?? null;
    C.levered = false;
    if (FLOOR_KINDS.has(kind)) {
      this._standBehind(C, b, K);
      this.slack = Math.max(this.slack, T.edge + 3);
      return true;
    }
    const H = this._hero(), hx = H.x, hz = H.z;
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
    if (kind !== 'spring') this._resolve(C);
    C.face = Math.atan2(b.x - C.sx, b.z - C.sz);
    this.slack = Math.max(this.slack, T.edge + 3);
    return true;
  }

  /** His stand point out of the colliders. */
  _resolve(C) {
    const v = this._v, d = this.d;
    v.x = C.sx;
    v.z = C.sz;
    this.game.world?.resolve?.(v, d.T.radius, Infinity);
    if (Number.isFinite(v.x + v.z)) {
      C.sx = v.x;
      C.sz = v.z;
    }
  }

  /** A flagstone move: his foot planted just behind the slab, the slab between him and the hero. */
  _standBehind(C, b, K) {
    const d = this.d, H = this._hero();
    let ux = H.x - b.x, uz = H.z - b.z, l = Math.hypot(ux, uz);
    if (l < 0.05) {
      ux = Math.sin(d.yaw);
      uz = Math.cos(d.yaw);
      l = 1;
    }
    ux /= l;
    uz /= l;
    C.piece = b;
    C.sx = b.x - ux * (b.r * 0.5 + K.stand);
    C.sz = b.z - uz * (b.r * 0.5 + K.stand);
    C.sy = 0;
    this._resolve(C);
    C.face = Math.atan2(H.x - C.sx, H.z - C.sz);
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
    const floor = FLOOR_KINDS.has(C.kind);
    if (floor && C.beat !== b) {
      // the next beat of a flagstone string: the next slab, from where he stands now
      C.beat = b;
      C.levered = false;
      C.k = 0;
      C.x0 = d.position.x;
      C.z0 = d.position.z;
      const K = TUNING.terrain[C.kind];
      const nb = this._floorAhead(K, true);
      if (nb) this._standBehind(C, nb, K);
      else C.piece = null;
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
          if (Math.hypot(C.sx - C.x0, C.sz - C.z0) > 1.5) d.fx.dust(pos.x, pos.z, 1.1);
        }
        C.k = k;
      }
      d.state = pos.y > 0.4 ? 'airborne' : 'combat';
    }
    if (floor) {
      // he faces the hero over the slab; the blade levers it up at `lever` of the windup
      if (s) C.face = Math.atan2(s.p.x - pos.x, s.p.z - pos.z);
      d.yaw = turnToward(d.yaw, C.face, 22 * dt);
      if (!C.levered && u >= fin(b.def.lever, 0.5) && u < 1) {
        C.levered = true;
        this._lever(C, b.def.cast?.kind === 'fan' ? TUNING.terrain.fan : TUNING.terrain.flag);
      }
      return;
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

  // ------------------------------------------------------------------ the flagstones
  /**
   * The blade's point under the slab: it jumps up out of the paving (the world: torn out, its hole
   * shows the broken look, a block of prop art in the air). Scattered Flagstones: up to `K.count` at
   * once, each from its own place, gathering into a row in front of him.
   */
  _lever(C, K) {
    const W = this.W, d = this.d, fx = d.fx;
    if (!W?.take || !K) return;
    const fan = (K.count ?? 1) > 1;
    let n = 0;
    if (fan) this._floorAhead(K, true);
    const list = fan ? this._near : null;
    const want = fan ? Math.min(list.length, K.count, this.lifted.length) : 1;
    const fwx = Math.sin(d.yaw), fwz = Math.cos(d.yaw);
    for (let i = 0; i < want; i++) {
      const pc = fan ? list[i] : C.piece;
      if (!pc || pc.state !== INTACT || !W.take(pc)) continue;
      const L = this.lifted.find((x) => !x.piece);
      if (!L) {
        W.drop?.(pc);
        continue;
      }
      L.piece = pc;
      L.t = 0;
      L.x0 = pc.x;
      L.z0 = pc.z;
      // where it hangs: in front of him (the fan: a row across his front)
      const side = fan ? (i === 0 ? 0 : i === 1 ? -1 : 1) * K.row : 0;
      const ahead = fan ? K.hang : Math.hypot(pc.x - d.position.x, pc.z - d.position.z);
      L.ox = d.position.x + fwx * ahead + fwz * side;
      L.oz = d.position.z + fwz * ahead - fwx * side;
      L.y = fan ? K.rise + 0.25 * Math.abs(side) : K.rise;
      L.spin = (i % 2 ? -1 : 1) * (2.5 + i);
      W.carry(pc, pc.x, 0.05, pc.z, 0, 0);
      n++;
      // the scoop: grit thrown up off its edge, a pale stroke where the blade went under it
      this._burst(pc.x, 0.15, pc.z, 7, DUST, 2.4, false);
      fx._ink(pc.x - fwx * pc.r, 0.12, pc.z - fwz * pc.r, pc.x + fwx * 0.3, 0.5, pc.z + fwz * 0.3, 0.16, 0.95, 0);
    }
    if (n) this.game.shake?.(0.08);
  }

  /** The kick (or the fan's cut): every levered slab leaves for the hero. */
  _kickSlabs(b, s, a) {
    const d = this.d, W = this.W, fx = d.fx, D = b.def;
    const fan = D.cast?.kind === 'fan';
    const K = fan ? TUNING.terrain.fan : TUNING.terrain.flag;
    const H = this._hero();
    let tx0 = H.x, tz0 = H.z;
    if (s) {
      tx0 = s.p.x + s.vx * K.lead;
      tz0 = s.p.z + s.vz * K.lead;
    }
    let i = 0;
    for (const L of this.lifted) {
      const pc = L.piece;
      if (!pc) continue;
      L.piece = null;
      if (pc.state !== HELD || !W?.throwTo) continue;
      // the fan: the middle one at the hero, the others turned `spread` rad to either side of it
      let tx = tx0, tz = tz0;
      const off = fan ? (i === 0 ? 0 : i === 1 ? -1 : 1) * K.spread : 0;
      i++;
      if (off) {
        const vx = tx0 - pc.px, vz = tz0 - pc.pz, c = Math.cos(off), sn = Math.sin(off);
        tx = pc.px + vx * c + vz * sn;
        tz = pc.pz - vx * sn + vz * c;
      }
      const dist = Math.hypot(tx - pc.px, tz - pc.pz), l = dist || 1;
      const dx = (tx - pc.px) / l, dz = (tz - pc.pz) / l;
      let fl = clamp(K.time[0] + dist / K.per, K.time[0], K.time[1]);
      // the fairness guard: a flight that would land too near a cue asking the other answer is
      // lengthened (a higher lob); one that cannot be cleared lands uncued, and so harms nobody
      const dl = d.brain?.fairDelay?.(fl, D.tell, K.maxDelay) ?? 0;
      if (dl > 0) {
        fl += dl;
        if (d.brain.stats) d.brain.stats.delays++;
      }
      const o = this._slabThrow;
      o.time = fl;
      o.power = K.power;
      o.radius = K.radius;
      if (!W.throwTo(pc, tx, tz, o)) {
        W.drop?.(pc);
        continue;
      }
      const R = this.kicks.find((x) => !x.live);
      if (R) {
        R.live = true;
        R.piece = pc;
        R.flashed = false;
        R.quiet = dl < 0;
        R.tell = D.tell;
        R.damage = D.damage;
        R.kb = D.knockback ?? 2;
        R.attack = a?.name ?? 'flagKick';
        R.dx = dx;
        R.dz = dz;
        R.h?.cancel?.();
        R.h = R.quiet ? null : d.brain?.expect?.(fl, D.tell, R.attack) ?? null;
      }
      // the blow that sends it: pale strokes thrown the way it goes, grit off the slab
      for (let q = -2; q <= 2; q++) {
        const w = q * 0.2, y = pc.py + 0.15 + 0.05 * Math.abs(q);
        fx._ink(pc.px - dz * w, y, pc.pz + dx * w, pc.px - dz * w * 1.6 + dx * 1.3, y + 0.1, pc.pz + dx * w * 1.6 + dz * 1.3, 0.13, 0.85, 0);
      }
      this._burst(pc.px, pc.py + 0.1, pc.pz, 6, GRIT, 2.6, false, dx, dz);
    }
    if (i) {
      this.game.shake?.(fan ? 0.2 : 0.14);
      if (fan) {
        // the cut through the three: one bright line across them
        const fwx = Math.sin(d.yaw), fwz = Math.cos(d.yaw), cx = d.position.x + fwx * K.hang, cz = d.position.z + fwz * K.hang;
        fx._ink(cx - fwz * (K.row + 1), K.rise + 0.3, cz + fwx * (K.row + 1), cx + fwz * (K.row + 1), K.rise + 0.25, cz - fwx * (K.row + 1), 0.2, 1.15, 0);
      }
    }
  }

  /** A kicked slab has landed (the world's onLand): its blow at the hero, if he is under it and it was cued. */
  _slabLanded(pc, x, z) {
    const R = this.kicks.find((k) => k.live && k.piece === pc);
    if (!R) return;
    R.live = false;
    R.piece = null;
    R.h?.cancel?.();
    R.h = null;
    const d = this.d, p = this.game.player, K = TUNING.terrain.flag;
    d.fx.dust?.(x, z, 0.7);
    if (!p?.position || p.alive === false || !R.flashed) return;
    if (Math.hypot(p.position.x - x, p.position.z - z) > K.hit + (p.radius ?? 0.45)) return;
    d.hitPlayer({
      damage: R.damage, knockback: R.kb, kind: 'stone', tell: R.tell, attack: R.attack,
      from: { x: x - R.dx * 1.4, z: z - R.dz * 1.4 }, projectile: true, parryPosture: K.parryPosture,
    });
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
    // (a colossus: its upper half shears off at its cut, high over the blade's line)
    if (pc.y0 > 0) this._cutLine(pc.x, pc.y0, pc.z, -dz / l, dx / l, pc.r * 0.8);
    this.game.shake?.(0.22);
    this.game.world?.gust?.(pc.x, pc.z, 0.8, 5);
  }

  /** A terrain cast's impact (brain → disciple.onCast): the kick, a toll, a flagstone. */
  cast(b, s, a) {
    const C = this.cur;
    if (!C.act || C.act !== a) return;
    if (C.kind === 'kick') this._kick(b, s, a);
    else if (C.kind === 'toll') this._toll(b, a);
    else if (FLOOR_KINDS.has(C.kind)) this._kickSlabs(b, s, a);
  }

  /** Flying Lantern: the piece leaves the ground and flies at the hero (world.destructibles.take /
   *  throwTo). It cues itself (frame: the flare on it) and its blow at the hero is his (_landed). */
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
    // the fairness guard (as the flagstones'): a longer flight, or no cue and no blow
    const dl = d.brain?.fairDelay?.(o.time, b.def.tell, K.maxDelay) ?? 0;
    if (dl > 0) {
      o.time += dl;
      if (d.brain.stats) d.brain.stats.delays++;
    }
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
    S.quiet = dl < 0;
    S.tell = b.def.tell;
    S.damage = b.def.damage;
    S.kb = b.def.knockback ?? 2;
    S.attack = a?.name ?? 'lanternKick';
    S.dx = dx;
    S.dz = dz;
    S.tx = tx;
    S.tz = tz;
    this._burst(pc.x, 0.7, pc.z, 14, DUST, 3.2, false, dx, dz);
    // the blow that sends it: a fan of pale strokes in the field, thrown the way it goes
    const fx = d.fx;
    for (let i = -3; i <= 3; i++) {
      const w = i * 0.22, y = 0.8 + 0.1 * Math.abs(i);
      const x0 = pc.x - dx * 0.5 - dz * w, z0 = pc.z - dz * 0.5 + dx * w;
      fx._ink(x0, y, z0, x0 + dx * 1.5 - dz * w * 0.6, y + 0.15, z0 + dz * 1.5 + dx * w * 0.6, 0.15, 0.9, 0);
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
    // (it must have been cued: it always is, its flight is longer than the lead, unless the fairness
    // guard could not clear it: then it lands uncued and harms nobody)
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
      R.seed = this._l() * 100;
    }
    const heavy = b.def.tell === TELL.BLUE;
    this._burst(pc.x, 1.1, pc.z, heavy ? 26 : 16, BRONZE, heavy ? 7 : 5, true);
    this.d.fx._light({ x: pc.x, y: 1.4, z: pc.z, color: [1, 0.7, 0.3], intensity: heavy ? 4.5 : 3, radius: heavy ? 10 : 7, life: 0.35, fade: 0.3 });
    this.game.shake?.(heavy ? 0.3 : 0.18);
    this.game.world?.gust?.(pc.x, pc.z, heavy ? 1.6 : 1.1, 14);
  }

  // ------------------------------------------------------------------ frame
  /** Every brain update (disciple.brainFrame): his bound's slack, the pieces in the air, the rings. */
  frame(dt) {
    const d = this.d, C = this.cur, T = TUNING.terrain;
    // the move is over (it ran out, or he was thrown out of it): a flagstone still levered falls
    if (C.act && d.brain.act !== C.act) {
      C.act = null;
      C.piece = null;
      C.beat = null;
      this._dropLifted();
    }
    // out past his bound for a piece: once the move is over the bound draws back in, and him with it
    if (C.act) this.slack = Math.max(this.slack, T.edge + 3);
    else if (this.slack > 0) {
      const out = Math.hypot(d.position.x, d.position.z) - d.baseBound;
      this.slack = Math.max(0, Math.min(this.slack - T.leash * dt, out + 0.05));
    }
    const lead = perPhase(d.T.flashLead, d.phase);
    this._shot(dt, lead);
    this._liftedFrame(dt);
    this._kicksFrame(dt, lead);
    this._rings(dt, lead);
  }

  _dropLifted() {
    const W = this.W;
    for (const L of this.lifted) {
      if (L.piece?.state === HELD) W?.drop?.(L.piece);
      L.piece = null;
    }
  }

  /** The levered slabs: up out of the paving, turning, to hang a moment before the kick. */
  _liftedFrame(dt) {
    const W = this.W, K = TUNING.terrain.flag;
    for (const L of this.lifted) {
      const pc = L.piece;
      if (!pc) continue;
      if (pc.state !== HELD) {
        L.piece = null;
        continue;
      }
      L.t += dt;
      const k = ease(clamp(L.t / K.riseT, 0, 1));
      const bob = Math.sin(L.t * 9) * 0.04 * k;
      W?.carry(pc, pc.x + (L.ox - pc.x) * k, 0.05 + (L.y - 0.05) * k + bob, pc.z + (L.oz - pc.z) * k, 0.4 + L.spin * L.t * 0.35, L.t * L.spin);
    }
  }

  /** The kicked slabs in the air: grit off them, the flare on each flashLead before it lands. */
  _kicksFrame(dt, lead) {
    const d = this.d, fx = d.fx;
    for (const R of this.kicks) {
      if (!R.live) continue;
      const pc = R.piece;
      if (!pc || pc.state !== FLYING) {
        R.live = false; // (the fight was reset under it)
        R.piece = null;
        R.h?.cancel?.();
        R.h = null;
        continue;
      }
      const left = pc.T - pc.t;
      R.h?.retime?.(Math.max(0, left));
      const y = Math.max(0.2, pc.py + 0.15);
      if (this._l() < 0.6) this._grit(pc.px, y, pc.pz, R.dx, R.dz);
      if (!R.flashed && !R.quiet && left <= lead) {
        R.flashed = true;
        this._flare(R.attack, R.tell, pc.px, y + 0.2, pc.pz);
      }
    }
  }

  /** The flare of a thrown piece, ON the piece (ADR-119's rule, the owner's for the duelists too):
   *  the cue the ledger, the HUD, the sound and the AI read, and the flare drawn there. */
  _flare(attack, tell, x, y, z) {
    const f = this._flash, d = this.d;
    f.attack = attack;
    f.tell = tell;
    f.x = x;
    f.y = y;
    f.z = z;
    f.flare = true;
    d.emit('combat:flash', f);
    d.fx.tellFlash(tell, x, y, z, 1, true);
  }

  /** A little grit shed off a flying stone (small glyph particles, the looks' own stream). */
  _grit(x, y, z, dx, dz) {
    const fx = this.d.fx;
    const o = fx._rec(x + this._lr(-0.25, 0.25), y + this._lr(-0.2, 0.3), z + this._lr(-0.25, 0.25), this._lr(0.22, 0.42), this._lr(0.12, 0.2), 0.05, '.,:', GRIT, GRIT_END);
    o.vx = -dx * this._lr(1, 3);
    o.vz = -dz * this._lr(1, 3);
    o.vy = this._lr(0, 0.8);
    o.drag = 2;
    o.alpha = 0.85;
    fx._spawn(fx.add, o);
  }

  /** The kicked piece in the air: grit off it, and its flare flashLead before it lands. Nothing is
   *  drawn where it will come down. */
  _shot(dt, lead) {
    const S = this.shot;
    if (!S.live) return;
    const pc = S.piece;
    if (!pc || pc.state !== FLYING) {
      S.live = false; // (the fight was reset under it)
      return;
    }
    const left = pc.T - pc.t;
    const y = Math.max(0.3, pc.py + pc.h * 0.5);
    for (let i = 0; i < 2; i++) this._grit(pc.px, y, pc.pz, S.dx, S.dz);
    if (!S.flashed && !S.quiet && left <= lead) {
      S.flashed = true;
      this._flare(S.attack, S.tell, pc.px, y, pc.pz);
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
      const look = lookOf('toll', '0');
      if (look === 'a' || look === 'b') this._drawRingField(R, K, look === 'b');
      else this._drawRing(R, dt, K);
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
          f.flare = false;
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
  /** A ring of sound as shipped (`?toll=0`), re-drawn every frame: one line of bronze strokes along
   *  its front, each bulging outward, fading as it widens; a few motes of bronze dust lifted behind
   *  it. (The owner's pick of two filmed looks, 2026-11-15: "A: arc"; three thin ripples were turned
   *  down.) Big glyph sprites: kept only as the default until the owner picks a redraw. */
  _drawRing(R, dt, K) {
    const fx = this.d.fx, add = fx.add;
    if (!add) return;
    const life = Math.max(0.02, (this.game.fxDt ?? dt) * 1.7);
    const fade = clamp(1.15 - R.r / K.range, 0, 1) * (R.heavy ? 1.25 : 0.9);
    const c = this._c ?? (this._c = [0, 0, 0]), r = R.r;
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
        const a = this._l() * Math.PI * 2, rr = r - this._lr(0.2, 0.9);
        const o = fx._rec(R.x + Math.cos(a) * rr, 0.2, R.z + Math.sin(a) * rr, this._lr(0.25, 0.5), 0.16, 0.04, ".'", BRONZE, BRONZE_END);
        o.vy = this._lr(0.4, 1.2);
        o.alpha = 0.7 * fade;
        add.spawn(o);
      }
    }
  }

  /**
   * A ring of sound in the fire field (`?toll=a|b`, STYLE.md: rings of sound and cut air are steel):
   * a front of pale steel at waist height, ragged (each stretch keeps its own strength and a little
   * wander in radius, steady frame to frame, with gaps where it is weak), a fainter row trailing it,
   * fading as it widens; the heavy (blue) third toll stands taller and brighter. `bronze` (b): a low
   * fire heat under the front, the bell's colour in the field. Re-drawn every frame: at most ~150
   * blobs a ring (b: ~230); three rings at most at once.
   */
  _drawRingField(R, K, bronze) {
    const fx = this.d.fx;
    if (!fx.fire) return;
    const life = fx._frame();
    if (!(life > 0)) return;
    const r = R.r, fade = clamp(1.12 - r / K.range, 0, 1);
    const heat = (R.heavy ? 1.05 : 0.82) * fade, tall = R.heavy ? 1.35 : 1;
    const n = clamp(Math.round((TAU * r) / 0.3), 24, 150);
    const s0 = R.seed;
    for (let i = 0; i < n; i++) {
      const j0 = hash(s0 + i * 0.37), j1 = hash(s0 + i * 0.37 + 17.1);
      // strength along the ring: two slow waves turning with it, and a hash: weak stretches are gaps
      const a = ((i + (j0 - 0.5) * 0.6) / n) * TAU;
      const st = 0.66 + 0.24 * Math.sin(3 * a + s0) + 0.18 * Math.sin(7 * a + s0 * 1.7) + (j1 - 0.5) * 0.3;
      if (st < 0.3) continue;
      const rr = r * (1 + (j1 - 0.5) * 0.035), ca = Math.cos(a), sa = Math.sin(a);
      const x = R.x + ca * rr, z = R.z + sa * rr, h = heat * st;
      fx._blob(x, 0.75 * tall, z, 0, 0, 0, life, 0.36, 0.36, h, h, K_STEEL);
      if (R.heavy && i % 2 === 0) fx._blob(x, 1.25, z, 0, 0, 0, life, 0.32, 0.32, h * 0.8, h * 0.8, K_STEEL);
      // the row that trails it
      if (i % 2 === 1) {
        const rb = rr - 0.42, hb = h * 0.45;
        fx._blob(R.x + ca * rb, 0.6 * tall, R.z + sa * rb, 0, 0, 0, life, 0.32, 0.32, hb, hb, K_STEEL);
      }
      if (bronze && i % 2 === 0) {
        const hf = 0.22 * fade * st;
        fx._blob(R.x + ca * (rr - 0.2), 0.5, R.z + sa * (rr - 0.2), 0, 0, 0, life, 0.5, 0.5, hf, hf, K_FIRE);
      }
    }
    // the hum it leaves: a few motes of dust lifted behind it (small glyphs)
    if (r > 1 && this._l() < 0.7) {
      const a = this._l() * TAU, rr = r - this._lr(0.3, 1.0);
      const o = fx._rec(R.x + Math.cos(a) * rr, 0.2, R.z + Math.sin(a) * rr, this._lr(0.25, 0.5), 0.14, 0.04, ".'", bronze ? BRONZE : GRIT, bronze ? BRONZE_END : GRIT_END);
      o.vy = this._lr(0.4, 1.2);
      o.alpha = 0.7 * fade;
      fx._spawn(fx.add, o);
    }
  }

  /** The streak he leaves crossing the courtyard to a piece (frame to frame): cut air, steel in the
   *  fire field (a short-lived line at his chest and a fainter one at his knees), dust where he lands. */
  _trail(x0, y0, z0, x1, y1, z1) {
    const fx = this.d.fx;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    if (!(len > 0.04) || len > 9) return;
    fx._line(x0, y0 + 1.1, z0, x1, y1 + 1.1, z1, 0.2, 0.32, 0.42, 0, K_STEEL, 0.2);
    fx._line(x0, y0 + 0.5, z0, x1, y1 + 0.5, z1, 0.14, 0.3, 0.24, 0, K_STEEL, 0.3);
    if (y1 < 0.3 && fx.alpha) {
      const vx = (x1 - x0) / len, vz = (z1 - z0) / len;
      const o = fx._rec(x1, 0.12, z1, this._lr(0.35, 0.6), 0.2, 0.3, ',.`', DUST, null);
      o.vx = -vx * this._lr(0.5, 1.5);
      o.vy = this._lr(0.2, 0.8);
      o.vz = -vz * this._lr(0.5, 1.5);
      o.alpha = 0.7;
      o.drag = 3;
      fx.alpha.spawn(o);
    }
  }

  /** The cut through a piece: a bright line of steel across it (along (px, pz), the cut's way) written
   *  on the letter grid, a fainter one under it; sparks off the stone (small glyphs). */
  _cutLine(x, y, z, px, pz, r) {
    const fx = this.d.fx;
    const w = r + 0.9;
    fx._ink(x - px * w, y - 0.12, z - pz * w, x + px * w, y + 0.12, z + pz * w, 0.28, 1.15, 0);
    fx._ink(x - px * w * 0.8, y - 0.2, z - pz * w * 0.8, x + px * w * 0.8, y + 0.02, z + pz * w * 0.8, 0.2, 0.6, 0);
    fx._blob(x, y, z, 0, 0, 0, 0.22, 0.5, 0.8, 0.6, 0, K_SMOKE);
    for (let i = 0; i < 16; i++) {
      const sp = this._lr(2, 7), side = this._l() < 0.5 ? -1 : 1;
      fx._spawn(fx.add, {
        x: x + px * r * side * 0.6, y: y + this._lr(-0.1, 0.1), z: z + pz * r * side * 0.6, vx: px * sp * side + this._lr(-1, 1), vy: this._lr(0.5, 3), vz: pz * sp * side + this._lr(-1, 1),
        life: this._lr(0.2, 0.45), size: this._lr(0.12, 0.2), sizeEnd: 0.04, glyph: "*'+", color: SPARK, colorEnd: SPARK_END, alpha: 1, alphaEnd: 0, drag: 3, gravity: -6,
      });
    }
    fx._light({ x, y: 1, z, color: [1, 0.95, 0.85], intensity: 2.6, radius: 5, life: 0.2, fade: 0.18 });
  }

  /** A burst of glyphs at a point: dust kicked up (solid) or bronze sparks (`glow`), thrown out and
   *  along (dx, dz). Small letters (a letter cell or so). */
  _burst(x, y, z, n, color, speed, glow, dx = 0, dz = 0) {
    const fx = this.d.fx, pool = glow ? fx.add : fx.alpha;
    for (let i = 0; i < n; i++) {
      const a = this._l() * TAU, sp = this._lr(0.4, 1) * speed;
      fx._spawn(pool, {
        x, y: y + this._lr(-0.2, 0.2), z, vx: Math.cos(a) * sp + dx * speed * 0.6, vy: this._lr(0.4, glow ? 4 : 2.2), vz: Math.sin(a) * sp + dz * speed * 0.6,
        life: this._lr(0.3, 0.7), size: glow ? this._lr(0.14, 0.24) : this._lr(0.16, 0.26), sizeEnd: glow ? 0.04 : 0.3, glyph: glow ? '*+x.' : ',.:`',
        color, colorEnd: glow ? BRONZE_END : color, alpha: glow ? 1 : 0.75, alphaEnd: 0, drag: glow ? 2.2 : 3, gravity: glow ? -7 : 0,
      });
    }
  }
}
