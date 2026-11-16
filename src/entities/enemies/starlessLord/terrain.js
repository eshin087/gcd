import { TELL } from '../../../combat/rules.js';
import { clamp } from '../../../core/math.js';
import { FIRE_KIND } from '../../../render/firePalettes.js';
import { perPhase } from '../duelist/realise.js';
import { TUNING } from './tuning.js';

// The Starless Lord uses the crater (ADR-109; COMBAT.md → "The Starless Lord" → "He uses the
// crater"). His moves on the pieces of the set (world.destructibles, ARCHITECTURE.md →
// "Destruction"); the moves themselves are data (moves.js: a move marked `terrain: kind`), their
// numbers TUNING.terrain. What is here: which pieces he takes, how they hang in his grip, where
// they are thrown and what they do when they land.
//   hurl     Void Hurl    one piece (a stone already in the air; once those are spent a plate torn
//                         out of the floor near him; else a shard or a slab) rises, comes to hang
//                         over his hand and is thrown at the hero
//   rain     Glass Rain   up to three at once, thrown one after another where the hero is going
//   fall     Crown Fall   his hand closes on a tall piece beside the hero and wrenches it down on him:
//                         the fall is the world's (red, its strip marked, dealt by destructibles.js)
//   rupture  Rupture      (the second pass, form 2 on) the floor tears open in a line from him toward
//                         the hero, one plate after another bursting up out of it
//   halo     Falling Halo (forms 3 and 4) the Void lifts a ring of plates round the hero, open on the
//                         side away from him, and drops them on him one after another
// A THROWN piece (hurl, rain, the halo's drops) shows nothing where it will land (the owner's choice,
// 2026-11-16, as ADR-119 for the wyrm): its flare is drawn ON the flying piece flashLead before it
// lands, and a roll at the flare always goes through it. The blow where it lands is his (red); what
// it does to the other pieces there is the world's. Crown Fall topples a piece: the world marks its
// strip, as before. A plate of the Rupture bursts up out of the floor: its flare is on the plate.
// Every one of them is known to the cue ledger before its cue (duelist/ledger.js reads the marks and
// the pieces held for a Glass Rain; the Rupture's plates and the halo's drops through brain.expect),
// and the fairness guard may hold a halo's drop, push the Rupture back, or let a piece land uncued
// (and so harmless) rather than cue it beside a blow that asks the other answer.
// Through a windup the Void is seen gathering in his hand (LordFx.gather), the pieces he holds are
// wrapped in it, and each leaves with a stroke of it.
// A move is chosen by his AI only while there is a piece for it (weigh → 0 otherwise); started by
// hand (the Lab, Training) it takes what there is, and cannot start with none (the lab stage and
// the tests' world mocks have no pieces). Cut short before the throw (a stagger, a break, his
// death), what he holds drops where it hangs.
// Two random streams of its own: `_g` (where a piece is aimed: the rain's spread) and `_l` (what only
// draws). Neither is the effects' stream, so no look can move a landing.
// No per-frame allocation: fixed records for the pieces held, the landings, the line and the ring.

/** A piece's states (world/destructibles.js STATE). */
const INTACT = 0, HELD = 3, FLYING = 4;
const K_VOID = FIRE_KIND.void;
const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const lerp = (a, b, k) => a + (b - a) * k;
const GRIP = [2.6, 0.2, 0.12], GRIP_END = [0.5, 0.03, 0.02];
const GRIT = [0.32, 0.3, 0.36], GRIT_END = [0.1, 0.09, 0.12];
/** Where up to three pieces hang, in his own frame: [to his left, up, forward] m. Beside him and
 *  low enough to be on a phone's screen with him (the camera looks down: 3.6 m up was off its top). */
const SLOTS = [[1.5, 2.5, 0.5], [-1.7, 2.5, 0.5], [0, 3.3, 0.3]];
const KINDS = new Set(['hurl', 'rain', 'fall', 'rupture', 'halo']);
/** The Void gathering in his hand through each kind's windup (LordFx.gather's kinds). */
const GATHER = { hurl: 'debris', rain: 'debris', halo: 'debris', fall: 'grip', rupture: 'rift' };
const MAXR = 8; // the Rupture's plates at most
const MAXH = 6; // the halo's plates at most

export class LordTerrain {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    /** the pieces in his grip: where each stood (x0, y0, z0), how long held, its slot */
    this.held = Array.from({ length: 3 }, () => ({ piece: null, x0: 0, y0: 0, z0: 0, t: 0, slot: 0, px: 0, py: 0, pz: 0 }));
    /** the move they belong to; `cast`: its throw has begun (the rest go by themselves) */
    this.act = null;
    this.kind = '';
    this.cast = false;
    this.gapT = 0;
    this.hit = { damage: 0, kb: 0, attack: 'voidHurl' };
    /** where thrown pieces will land (the ledger reads `at - t`; NOT drawn: the flare is on the piece).
     *  `quiet`: the fairness guard could not clear it: no cue, no blow */
    this.marks = Array.from({ length: 6 }, () => ({ alive: false, piece: null, x: 0, z: 0, r: 0, t: 0, at: 0, flashed: false, quiet: false, damage: 0, kb: 0, attack: '' }));
    /** Crown Fall's piece and the way it falls */
    this.fall = { piece: null, dx: 0, dz: 1 };
    /** the Rupture: plates bursting up in a line, one every `gap` s */
    this.rupt = {
      live: false, t: 0, n: 0, hitDone: false, damage: 0, kb: 0, attack: 'plateRupture', dx: 0, dz: 1,
      x: new Float32Array(MAXR), z: new Float32Array(MAXR), at: new Float32Array(MAXR),
      flashed: new Uint8Array(MAXR), done: new Uint8Array(MAXR), quiet: 0, h: new Array(MAXR).fill(null),
    };
    /** the halo: plates hanging round where the hero stood, dropped on him in turn */
    this.halo = {
      live: false, cx: 0, cz: 0, R: 0, t: 0, next: 0, n: 0, damage: 0, kb: 0, attack: 'plateHalo',
      p: Array.from({ length: MAXH }, () => ({ piece: null, x0: 0, z0: 0, y: 0, t: 0, at: 0, h: null })),
    };
    this._throw = { time: 0.8, power: 1, radius: 2, by: 'boss', onLand: (b, x, z) => this._landed(b, x, z) };
    this._pop = { time: 0.5, power: 0.8, radius: 1.4, by: 'boss', onLand: null };
    this._blow = { kind: 'blast', by: 'boss', dx: 0, dz: 0, y: 0.3, src: -1 };
    this._shockO = { kind: 'void', k: 0.7 };
    this._tell = { source: 'dragon', attack: '', tell: TELL.RED, impactIn: 0, x: 0, z: 0, hazard: true };
    this._flash = { source: 'dragon', attack: '', tell: TELL.RED, x: 0, y: 0, z: 0, hazard: true, flare: true };
    this._from = { x: 0, z: 0 };
    this._cand = [];
    this._floor = [];
    this._ang = [];
    this._gs = 0x510e527f;
    this._ls = 0x1f83d9ab;
  }

  get W() {
    return this.game.world?.destructibles ?? null;
  }

  get T() {
    return TUNING.terrain;
  }

  /** The gameplay stream (its own: no look can move it). */
  _g() {
    this._gs = (Math.imul(this._gs, 1664525) + 1013904223) >>> 0;
    return this._gs / 4294967296;
  }
  /** The looks' stream. */
  _l() {
    this._ls = (Math.imul(this._ls, 1103515245) + 12345) >>> 0;
    return this._ls / 4294967296;
  }
  _lr(a, b) {
    return a + this._l() * (b - a);
  }

  /** Something of his is still held, in the air or waiting to burst. */
  get busy() {
    return this.held.some((h) => h.piece) || this.marks.some((m) => m.alive) || this.rupt.live || this.halo.live;
  }

  reset() {
    for (const h of this.held) h.piece = null;
    for (const m of this.marks) {
      m.alive = false;
      m.piece = null;
    }
    this.act = null;
    this.kind = '';
    this.cast = false;
    this.fall.piece = null;
    this._endRupture();
    this.halo.live = false;
    for (const q of this.halo.p) {
      q.piece = null;
      q.h?.cancel?.();
      q.h = null;
    }
    this._gs = 0x510e527f;
    this._ls = 0x1f83d9ab;
  }

  // ---------------------------------------------------------------- which pieces
  /** The pieces he can take now, best first: a stone already in the air, then the nearest to him.
   *  Void Hurl (`floorFirst`): once the stones in the air are spent, a plate of the floor near him
   *  before the crater's standing shards. Glass Rain: plates make up a rain that is short of pieces. */
  _liftable(max, floorFirst = false) {
    const out = this._cand, W = this.W, d = this.d, T = this.T;
    out.length = 0;
    if (!W?.list) return out;
    let stones = 0;
    for (const b of W.list) {
      if (b.kind === 'hover' && b.state === INTACT) stones++;
      if (b.state !== INTACT || !(b.lift > 0 && b.lift <= 2)) continue;
      const r = Math.hypot(b.x - d.position.x, b.z - d.position.z);
      if (r > T.reach || r < 1.2) continue;
      out.push(b);
    }
    // (a stone in the air first, big slabs last, else the nearest to him)
    const key = (b) => Math.hypot(b.x - d.position.x, b.z - d.position.z) - (b.kind === 'hover' ? T.reach : 0) + Math.max(0, b.h - T.easyH) * 3;
    out.sort((a, b) => key(a) - key(b));
    const plates = W.floorNear && W.floor?.length ? W.floorNear(d.position.x, d.position.z, T.floorReach, this._floor, { whole: true, max: 3 }) : 0;
    if (floorFirst && !stones && plates) {
      // the stones are spent: the floor at his feet before the pieces that stand
      out.unshift(this._floor[0]);
    } else for (let i = 0; i < plates && out.length < max; i++) if (this._floor[i].state === INTACT && Math.hypot(this._floor[i].x - d.position.x, this._floor[i].z - d.position.z) >= 1.2) out.push(this._floor[i]);
    if (out.length > max) out.length = max;
    return out;
  }

  /** The tall piece to bring down on the hero, and the way it falls: the one whose strip he stands in. */
  _fallPick() {
    const W = this.W, p = this.game.player, F = this.fall, T = this.T.fall;
    F.piece = null;
    if (!W?.list || !p?.position) return null;
    // where he will be when it lands (a little of his way)
    const hx = p.position.x + fin(p.vel?.x) * T.lead, hz = p.position.z + fin(p.vel?.z) * T.lead;
    let best = null, bs = Infinity;
    for (const b of W.list) {
      if (b.state !== INTACT || !b.topples || b.kind === 'hover' || b.floor) continue;
      const dx = hx - b.x, dz = hz - b.z, l = Math.hypot(dx, dz), off = fin(b.fallOff, 0);
      if (l - off < T.min || l - off > b.h - T.short) continue; // (the strip runs from its foot to its height)
      if (Math.hypot(b.x - this.d.position.x, b.z - this.d.position.z) > this.T.reach) continue;
      const s = l - off - b.h * 0.5; // the hero nearest the middle of its fall
      if (Math.abs(s) < bs) {
        bs = Math.abs(s);
        best = b;
        F.dx = dx / l;
        F.dz = dz / l;
      }
    }
    F.piece = best;
    return best;
  }

  /**
   * The halo's plates: whole slabs `r0` .. `r1` m round (cx, cz), one for each of `n` stretches of the
   * ring that is left when the arc `gapArc` (rad) facing away from him is taken out of it (his way out).
   * Into this._cand, in order round the ring. Returns how many.
   */
  _haloPick(cx, cz, n) {
    const W = this.W, K = this.T.halo, d = this.d, out = this._cand, ang = this._ang;
    out.length = 0;
    if (!W?.floorNear || !W.floor?.length || !(n > 0)) return 0;
    const m = W.floorNear(cx, cz, K.r1, this._floor, { whole: true, max: 40 });
    // the gap: the side of the ring away from him
    const away = Math.atan2(cx - d.position.x, cz - d.position.z);
    const span = TAU - K.gapArc, a0 = away + K.gapArc / 2;
    for (let s = 0; s < n; s++) {
      const want = a0 + ((s + 0.5) / n) * span;
      let best = null, be = Infinity;
      for (let i = 0; i < m; i++) {
        const b = this._floor[i], dd = Math.hypot(b.x - cx, b.z - cz);
        if (dd < K.r0 || out.includes(b)) continue;
        let e = Math.atan2(b.x - cx, b.z - cz) - want;
        e = Math.abs(Math.atan2(Math.sin(e), Math.cos(e)));
        if (e > span / n / 2 + 0.15) continue;
        const score = e * 2 + Math.abs(dd - (K.r0 + K.r1) / 2) * 0.3;
        if (score < be) {
          be = score;
          best = b;
        }
      }
      if (best) {
        out.push(best);
        ang[out.length - 1] = want;
      }
    }
    return out.length;
  }

  /** His AI weighs a terrain move: nothing while there is no piece for it. */
  weigh(def, w) {
    if (!KINDS.has(def.terrain) || !this.W) return 0;
    if (this.busy) return 0;
    const kind = def.terrain;
    if (kind === 'fall') return this._fallPick() ? w : 0;
    if (kind === 'rupture') return this.W.floor?.length ? w : 0;
    if (kind === 'halo') {
      const p = this.game.player?.position, n = perPhase(def.beats?.[0]?.cast?.count ?? this.T.halo.count, this.d.phase);
      return p && this._haloPick(p.x, p.z, n) >= this.T.halo.need ? w : 0;
    }
    return this._liftable(3, kind === 'hurl').length >= (kind === 'rain' ? 2 : 1) ? w : 0;
  }

  /** A terrain move starts: the pieces are taken (false: there is none, it does not start). */
  begin(A) {
    const kind = A.def.terrain, W = this.W;
    if (!KINDS.has(kind) || !W || this.busy) return false;
    if (kind === 'fall') {
      if (!this._fallPick()) return false;
      return this._start(A, kind);
    }
    if (kind === 'rupture') return W.floor?.length ? this._start(A, kind) : false;
    if (kind === 'halo') return this._beginHalo(A);
    const want = kind === 'rain' ? fin(A.def.beats?.[0]?.cast?.count, 3) : 1;
    const c = this._liftable(want, kind === 'hurl');
    if (c.length < (kind === 'rain' ? 2 : 1)) return false;
    let n = 0;
    for (const b of c) {
      const y0 = fin(b.def?.hover, 0);
      if (!W.take(b)) continue;
      // (a stone that hung in the air is drawn lifted by its own body: in his grip the lift is the
      // carry's, so it can be thrown down to the floor; throneHall.js lifts it again when it is whole)
      if (y0 > 0 && b.body) {
        b.body.position.y = 0;
        b.body.updateMatrix?.();
      }
      const h = this.held[n];
      h.piece = b;
      h.x0 = b.x;
      h.y0 = y0;
      h.z0 = b.z;
      h.t = 0;
      h.slot = kind === 'rain' ? n : 0;
      W.carry(b, b.x, y0, b.z, 0, 0);
      n++;
    }
    if (!n) return false;
    this._start(A, kind);
    this.game.shake?.(0.12);
    return true;
  }

  _start(A, kind) {
    this.act = A;
    this.kind = kind;
    this.cast = false;
    this.gapT = 0;
    return true;
  }

  /** The halo: plates torn up round the hero, rising through the windup to hang over their places. */
  _beginHalo(A) {
    const W = this.W, p = this.game.player?.position, K = this.T.halo, H = this.halo;
    if (!p) return false;
    const n = Math.min(MAXH, perPhase(A.def.beats?.[0]?.cast?.count ?? K.count, this.d.phase));
    const vx = fin(this.game.player?.vel?.x), vz = fin(this.game.player?.vel?.z);
    const cx = p.x + vx * K.lead, cz = p.z + vz * K.lead;
    if (this._haloPick(cx, cz, n) < K.need) return false;
    let k = 0;
    for (const b of this._cand) {
      if (!W.take(b)) continue;
      const q = H.p[k++];
      q.piece = b;
      q.x0 = b.x;
      q.z0 = b.z;
      q.y = K.hangY + 0.35 * Math.sin(k * 2.1);
      q.t = -0.06 * k; // (they come up one after another)
      q.at = 0;
      q.h?.cancel?.();
      q.h = null;
      W.carry(b, b.x, 0, b.z, 0, 0);
    }
    if (k < K.need) {
      for (let i = 0; i < k; i++) {
        W.drop(H.p[i].piece);
        H.p[i].piece = null;
      }
      return false;
    }
    H.live = true;
    H.cx = cx;
    H.cz = cz;
    H.R = (K.r0 + K.r1) / 2;
    H.t = 0;
    H.n = k;
    H.next = 0;
    this._start(A, 'halo');
    this.game.shake?.(0.14);
    return true;
  }

  // ---------------------------------------------------------------- the throw
  /** His cast beat lands: the throw begins (hurl, rain), the piece is wrenched down (fall), the floor
   *  tears open (rupture), the halo begins to fall. */
  onCast(b, s, a) {
    const D = b.def, d = this.d, W = this.W;
    this.cast = true;
    this.hit.damage = D.damage;
    this.hit.kb = D.knockback ?? 3;
    this.hit.attack = a?.name ?? 'voidHurl';
    if (this.kind === 'fall') {
      // (the hero has moved since the windup began: the piece that still reaches him, else the one chosen)
      const F = this.fall, was = F.piece, wx = F.dx, wz = F.dz;
      if (!this._fallPick() && was?.state === INTACT) {
        F.piece = was;
        F.dx = wx;
        F.dz = wz;
      }
      const pc = F.piece;
      if (pc && W?.topple(pc, F.dx, F.dz, 'boss')) {
        const h = d._hand;
        if (d._ptsOk) d.fx.arc(h.x, h.y, h.z, pc.x, Math.min(pc.h, 4) * 0.8, pc.z, 0.3, GRIP, GRIP_END, 7);
        this.game.shake?.(0.25);
      }
      F.piece = null;
      this.act = null;
      return;
    }
    if (this.kind === 'rupture') {
      this._castRupture(D, s, a);
      this.act = null;
      return;
    }
    if (this.kind === 'halo') {
      this._castHalo(D, a);
      return;
    }
    this.gapT = 0; // the first leaves now
    this._throwNext(s);
  }

  /** Throw the next held piece at where the hero is going. */
  _throwNext(s) {
    const W = this.W, T = this.T, p = this.game.player;
    const h = this.held.find((x) => x.piece && x.piece.state === HELD);
    if (!h || !W) return false;
    const pc = h.piece, pp = p?.position;
    let tx = pp ? pp.x + fin(p.vel?.x) * T.lead : this.d.position.x + Math.sin(this.d.yaw) * 6;
    let tz = pp ? pp.z + fin(p.vel?.z) * T.lead : this.d.position.z + Math.cos(this.d.yaw) * 6;
    if (this.kind === 'rain' && h.slot > 0) {
      // (the later ones a little to either side of the aim: the terrain's own gameplay stream)
      tx += (this._g() * 2 - 1) * T.spread;
      tz += (this._g() * 2 - 1) * T.spread;
    }
    const dist = Math.hypot(tx - h.px, tz - h.pz);
    const time = clamp(dist / T.per, T.flight[0], T.flight[1]);
    if (!this._launch(pc, tx, tz, time, T.radius, T.power, this.hit.damage, this.hit.kb, this.hit.attack, T.maxDelay)) {
      h.piece = null;
      return false;
    }
    h.piece = null;
    this.gapT = T.gap;
    const hand = this.d._hand;
    if (this.d._ptsOk) this.d.fx.arc(hand.x, hand.y, hand.z, h.px, h.py + 0.6, h.pz, 0.26, GRIP, GRIP_END, 6);
    this.game.shake?.(0.16);
    return true;
  }

  /**
   * A held piece leaves for (tx, tz) in `time` s (the fairness guard may lengthen it by up to
   * `maxDelay`; one it cannot clear lands uncued and harmless). Its landing record (the ledger reads
   * it); a stroke of the Void the way it goes.
   */
  _launch(pc, tx, tz, time, r, power, damage, kb, attack, maxDelay) {
    const W = this.W, d = this.d;
    const dl = d.brain?.fairDelay?.(time, TELL.RED, maxDelay) ?? 0;
    if (dl > 0) {
      time += dl;
      if (d.brain.stats) d.brain.stats.delays++;
    }
    const o = this._throw;
    o.time = time;
    o.power = power;
    o.radius = r;
    const x0 = pc.px, y0 = pc.py, z0 = pc.pz;
    if (!W.throwTo(pc, tx, tz, o)) return false;
    const m = this.marks.find((k) => !k.alive);
    if (m) {
      m.alive = true;
      m.piece = pc;
      m.x = tx;
      m.z = tz;
      m.r = r;
      m.t = 0;
      m.at = time;
      m.flashed = false;
      m.quiet = dl < 0;
      m.damage = damage;
      m.kb = kb;
      m.attack = attack;
    }
    // the fling: a stroke of the Void from the piece the way it goes
    const l = Math.hypot(tx - x0, tz - z0) || 1, dx = (tx - x0) / l, dz = (tz - z0) / l;
    d.fx._line?.(x0, y0 + 0.4, z0, x0 + dx * 1.6, y0 + 0.2, z0 + dz * 1.6, 0.2, 0.45, 0.4, 0, K_VOID, 0.2);
    return true;
  }

  /** A thrown piece landed (destructibles.throwTo onLand): his blow, on a hero inside its reach. */
  _landed(pc, x, z) {
    const m = this.marks.find((k) => k.alive && k.piece === pc);
    if (!m) return;
    m.alive = false;
    m.piece = null;
    const d = this.d, p = this.game.player, pp = p?.position;
    d.fx.shock?.(x, z, m.r * 1.2, this._shockO);
    d.emit('dragon:explosion', { x, z, radius: m.r });
    if (m.quiet || !m.flashed) return; // (never cued: it harms nobody)
    if (!pp || p.alive === false || Math.hypot(pp.x - x, pp.z - z) > m.r + (p.radius ?? 0.45) * 0.5) return;
    this._from.x = x;
    this._from.z = z;
    d.hitPlayer({ damage: m.damage, knockback: m.kb, knockdown: true, kind: 'crush', tell: TELL.RED, parryable: false, blockable: false, attack: m.attack, from: this._from });
  }

  /** Let go of everything held: it drops where it hangs. */
  drop() {
    const W = this.W;
    for (const h of this.held) {
      if (h.piece?.state === HELD) W?.drop(h.piece);
      h.piece = null;
    }
    for (const q of this.halo.p) {
      if (q.piece?.state === HELD) W?.drop(q.piece);
      q.piece = null;
      q.h?.cancel?.();
      q.h = null;
    }
    this.halo.live = false;
    this.act = null;
    this.cast = false;
  }

  // ---------------------------------------------------------------- the Rupture
  /** The floor tears open along the line from him toward the hero: a plate every `step` m, one every
   *  `gap` s, to `past` m beyond where the hero stands. */
  _castRupture(D, s, a) {
    const d = this.d, K = this.T.rupture, R = this.rupt, me = d.position, p = this.game.player?.position;
    let dx = (s?.p?.x ?? p?.x ?? me.x + Math.sin(d.yaw)) - me.x, dz = (s?.p?.z ?? p?.z ?? me.z + Math.cos(d.yaw)) - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      dx /= dist;
      dz /= dist;
    } else {
      dx = Math.sin(d.yaw);
      dz = Math.cos(d.yaw);
    }
    const gap = perPhase(K.gap, d.phase);
    const n = clamp(Math.floor((Math.max(dist, K.first) + K.past - K.first) / K.step) + 1, 2, Math.min(MAXR, K.max));
    this._endRupture();
    R.live = true;
    R.t = 0;
    R.n = n;
    R.hitDone = false;
    R.damage = D.damage;
    R.kb = D.knockback ?? 3;
    R.attack = a?.name ?? 'plateRupture';
    R.dx = dx;
    R.dz = dz;
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
    // the fairness guard: the plate under the hero bursts clear of every cue that asks a guard (the
    // whole line waits with it); if no wait clears it the line still tears open, uncued and harmless
    const dl = d.brain?.fairDelay?.(R.at[near], TELL.RED, K.maxDelay) ?? 0;
    R.quiet = dl < 0 ? 1 : 0;
    if (dl > 0) {
      for (let i = 0; i < n; i++) R.at[i] += dl;
      if (d.brain.stats) d.brain.stats.delays++;
    }
    if (!R.quiet) for (let i = 0; i < n; i++) if (p && Math.hypot(p.x - R.x[i], p.z - R.z[i]) < K.radius + K.cue + 1.5) R.h[i] = d.brain?.expect?.(R.at[i], TELL.RED, R.attack) ?? null;
    this.game.shake?.(0.14);
    // where it starts: the floor at his hand's feet splits
    d.fx.shock?.(me.x + dx * 0.8, me.z + dz * 0.8, 1.4, this._shockOpt(0.5));
  }

  _endRupture() {
    const R = this.rupt;
    R.live = false;
    for (let i = 0; i < MAXR; i++) {
      R.h[i]?.cancel?.();
      R.h[i] = null;
    }
  }

  _shockOpt(k) {
    this._shockO.k = k;
    return this._shockO;
  }

  /** Every frame of the Rupture: a plate quivers, flares (on the plate, for a hero near enough to be
   *  reached), and bursts up out of the floor. One blow at most for the whole line. */
  _ruptureFrame(dt, lead) {
    const R = this.rupt;
    if (!R.live) return;
    const d = this.d, K = this.T.rupture, W = this.W, fx = d.fx, pl = this.game.player, pp = pl?.position;
    R.t += dt;
    let left = 0;
    for (let i = 0; i < R.n; i++) {
      if (R.done[i]) continue;
      left++;
      const x = R.x[i], z = R.z[i], until = R.at[i] - R.t;
      // the plate quivers before it goes: grit jumping off it (the piece itself telling, no mark)
      if (until < K.quiver && until > 0 && this._l() < 0.7) {
        const a = this._l() * TAU, rr = this._lr(0.2, 0.9);
        fx._spawn(fx.alpha, { x: x + Math.cos(a) * rr, y: 0.1, z: z + Math.sin(a) * rr, vx: 0, vy: this._lr(1, 3), vz: 0, life: this._lr(0.25, 0.45), size: 0.16, sizeEnd: 0.08, glyph: ",.`'", color: GRIT, colorEnd: GRIT_END, alpha: 0.9, alphaEnd: 0, drag: 1.5, gravity: -8 });
      }
      if (!R.flashed[i] && !R.quiet && until <= lead && pp && pl.alive !== false && Math.hypot(pp.x - x, pp.z - z) < K.radius + K.cue) {
        R.flashed[i] = 1;
        this._cue(R.attack, x, 0.45, z, Math.max(0.02, until));
      }
      if (until > 0) continue;
      R.done[i] = 1;
      R.h[i]?.cancel?.();
      R.h[i] = null;
      // it bursts: the plate there torn up and thrown a little way, the Void out of the hole
      if (W?.floorNear && W.floorNear(x, z, K.take, this._floor, { max: 1 }) && W.take(this._floor[0])) {
        const b = this._floor[0];
        W.carry(b, b.x, 0.1, b.z, 0.5, Math.atan2(R.dx, R.dz));
        const o = this._pop;
        o.time = K.pop;
        o.power = K.power;
        o.radius = K.radius;
        W.throwTo(b, b.x + R.dx * K.skid, b.z + R.dz * K.skid, o);
      }
      const bo = this._blow;
      bo.dx = R.dx;
      bo.dz = R.dz;
      bo.src = W?.swing?.() ?? -1;
      this.game.world?.impact?.(x, z, K.radius * 0.8, K.power * 0.6, bo);
      fx.shock?.(x, z, K.radius * 1.4, this._shockOpt(0.75));
      for (let q = 0; q < 6; q++) fx._blob(x + this._lr(-0.4, 0.4), 0.4, z + this._lr(-0.4, 0.4), this._lr(-0.6, 0.6), this._lr(3, 6), this._lr(-0.6, 0.6), this._lr(0.25, 0.4), 0.5, 0.9, 0.42, 0, K_VOID, 1.5);
      this.game.shake?.(0.1);
      if (!R.hitDone && R.flashed[i] && pp && pl.alive !== false && Math.hypot(pp.x - x, pp.z - z) <= K.radius + (pl.radius ?? 0.45) * 0.5) {
        R.hitDone = true;
        this._from.x = x - R.dx;
        this._from.z = z - R.dz;
        d.hitPlayer({ damage: R.damage, knockback: R.kb, knockdown: true, kind: 'crush', tell: TELL.RED, parryable: false, blockable: false, attack: R.attack, from: this._from });
      }
    }
    if (!left) this._endRupture();
  }

  /** A cue of his that lands away from him: combat:tell + combat:flash (red, a hazard), its flare drawn
   *  at (x, y, z) (the piece). */
  _cue(attack, x, y, z, impactIn) {
    const d = this.d, t = this._tell, f = this._flash;
    t.attack = attack;
    t.impactIn = impactIn;
    t.x = x;
    t.z = z;
    d.emit('combat:tell', t);
    f.attack = attack;
    f.x = x;
    f.y = y;
    f.z = z;
    d.emit('combat:flash', f);
    d.fx.tellFlash(TELL.RED, x, y, z, 1, true);
  }

  // ---------------------------------------------------------------- the halo
  /** The halo begins to fall: one plate every `gap` s, each told to the ledger until it leaves. */
  _castHalo(D, a) {
    const H = this.halo, K = this.T.halo, d = this.d;
    H.damage = D.damage;
    H.kb = D.knockback ?? 3;
    H.attack = a?.name ?? 'plateHalo';
    H.t = 0;
    H.next = 0;
    const gap = perPhase(K.gap, d.phase), fl = (K.drop[0] + K.drop[1]) / 2;
    for (let i = 0; i < H.n; i++) {
      const q = H.p[i];
      q.at = K.first + i * gap;
      q.h?.cancel?.();
      q.h = q.piece ? d.brain?.expect?.(q.at + fl, TELL.RED, H.attack) ?? null : null;
    }
    this.act = null;
  }

  /** Every frame of the halo: up out of the floor round where the hero stood (the windup), hanging,
   *  then dropped one after another on the hero, aimed inside the ring: out of it, he is clear. */
  _haloFrame(dt) {
    const H = this.halo;
    if (!H.live) return;
    const d = this.d, K = this.T.halo, W = this.W, fx = d.fx;
    let held = 0;
    for (let i = 0; i < H.n; i++) {
      const q = H.p[i], pc = q.piece;
      if (!pc) continue;
      if (pc.state !== HELD) {
        q.piece = null;
        continue;
      }
      held++;
      q.t += dt;
      const k = ease(clamp(q.t / K.lift, 0, 1)), bob = Math.sin(q.t * 2.7 + i) * 0.1 * k;
      W.carry(pc, q.x0, q.y * k + bob, q.z0, 0.3 * Math.sin(q.t * 1.7 + i) * k, q.t * 0.8 + i);
      // wrapped in the Void
      if (this._l() < 0.5) fx._blob(q.x0 + this._lr(-0.5, 0.5), q.y * k + this._lr(-0.1, 0.4), q.z0 + this._lr(-0.5, 0.5), 0, this._lr(-0.3, 0.3), 0, this._lr(0.2, 0.32), 0.5, 0.8, 0.2, 0, K_VOID, 1);
      if (!this.cast) continue;
      if (H.t + dt < q.at) continue;
      // its turn: dropped on the hero, aimed inside the ring (a hero out of it is not followed)
      const pl = this.game.player, pp = pl?.position;
      let tx = H.cx, tz = H.cz;
      if (pp) {
        tx = pp.x + fin(pl.vel?.x) * K.lead;
        tz = pp.z + fin(pl.vel?.z) * K.lead;
      }
      const ox = tx - H.cx, oz = tz - H.cz, ol = Math.hypot(ox, oz), lim = H.R * K.inner;
      if (ol > lim) {
        tx = H.cx + (ox / ol) * lim;
        tz = H.cz + (oz / ol) * lim;
      }
      const time = clamp(K.drop[0] + Math.hypot(tx - pc.px, tz - pc.pz) / K.per, K.drop[0], K.drop[1]);
      q.h?.cancel?.();
      q.h = null;
      if (this._launch(pc, tx, tz, time, K.radius, K.power, H.damage, H.kb, H.attack, K.maxDelay)) {
        if (d._ptsOk) fx.arc(d._hand.x, d._hand.y, d._hand.z, pc.px, pc.py + 0.3, pc.pz, 0.22, GRIP, GRIP_END, 5);
        this.game.shake?.(0.1);
      } else W.drop(pc);
      q.piece = null;
      held--;
    }
    if (this.cast) H.t += dt;
    if (!held) H.live = false;
  }

  // ---------------------------------------------------------------- every frame
  frame(dt) {
    const d = this.d, W = this.W, T = this.T;
    const holding = this.held.some((h) => h.piece) || (this.halo.live && !this.cast);
    if (holding) {
      const m = d.mode;
      // cut short before the throw, or he is down: what he holds falls
      if (m === 'dying' || m === 'dead' || m === 'broken' || (!this.cast && (d.brain.act !== this.act || m !== 'act'))) this.drop();
    }
    if ((this.kind === 'fall' || this.kind === 'rupture') && !this.cast && this.act && d.brain.act !== this.act) {
      this.act = null;
      this.fall.piece = null;
    }
    // the Void gathering in his hand through the windup
    const a = d.brain?.act;
    if (this.act && !this.cast && a === this.act && d._ptsOk) {
      const cur = a.beats?.[0];
      if (cur) d.fx.gather?.(GATHER[this.kind] ?? 'debris', d._hand, clamp((a.t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1), dt);
    }
    // the pieces in his grip: up out of their place, then across to hang over him
    const c = Math.cos(d.yaw), s = Math.sin(d.yaw), hand = d._hand;
    for (const h of this.held) {
      const pc = h.piece;
      if (!pc) continue;
      if (pc.state !== HELD) {
        h.piece = null;
        continue;
      }
      h.t += dt;
      const S = SLOTS[h.slot] ?? SLOTS[0];
      // (his frame: forward (s, c), his left (c, -s))
      const sx = d.position.x + c * S[0] + s * S[2], sz = d.position.z - s * S[0] + c * S[2];
      const up = ease(clamp(h.t / 0.35, 0, 1)), k = ease(clamp((h.t - 0.18) / Math.max(0.2, T.lift - 0.18), 0, 1));
      const bob = Math.sin(h.t * 3.1 + h.slot * 2) * 0.12 * k;
      h.px = lerp(h.x0, sx, k);
      h.pz = lerp(h.z0, sz, k);
      h.py = lerp(h.y0 + T.rise * up, S[1], k) + bob;
      W.carry(pc, h.px, h.py, h.pz, 0.25 * Math.sin(h.t * 1.3 + h.slot) + 0.5 * k, h.t * 0.9 + h.slot);
      // the grip: a thread of red from his hand to it, the Void wrapped round it
      if (d._ptsOk && this._l() < 0.45) d.fx.arc(hand.x, hand.y, hand.z, h.px, h.py + Math.min(1.2, pc.h * 0.4), h.pz, 0.16, GRIP, GRIP_END, 5);
      if (this._l() < 0.6) d.fx._blob(h.px + this._lr(-0.5, 0.5), h.py + this._lr(0, Math.min(1.5, pc.h * 0.6)), h.pz + this._lr(-0.5, 0.5), 0, this._lr(-0.2, 0.4), 0, this._lr(0.2, 0.32), 0.55, 0.85, 0.22, 0, K_VOID, 1);
    }
    // the rest of a rain leave one after another
    if (this.cast && this.kind === 'rain' && this.held.some((h) => h.piece)) {
      this.gapT -= dt;
      if (this.gapT <= 0) this._throwNext(null);
    }
    if (this.cast && (this.kind === 'hurl' || this.kind === 'rain') && !this.held.some((h) => h.piece)) this.act = null;
    const lead = perPhase(d.T.flashLead, d.phase);
    this._haloFrame(dt);
    this._ruptureFrame(dt, lead);
    // the pieces in the air: nothing on the floor where they will land; the flare ON the piece
    // flashLead before it lands
    for (const m of this.marks) {
      if (!m.alive) continue;
      m.t += dt;
      const pc = m.piece;
      if (pc && pc.state === FLYING) {
        // its wake: the Void torn off it
        if (this._l() < 0.7) d.fx._blob(pc.px + this._lr(-0.3, 0.3), pc.py + this._lr(0, 0.6), pc.pz + this._lr(-0.3, 0.3), 0, 0, 0, this._lr(0.18, 0.3), 0.5, 0.9, 0.24, 0, K_VOID, 1);
        if (!m.flashed && !m.quiet && pc.T - pc.t <= lead) {
          m.flashed = true;
          this._cue(m.attack, pc.px, Math.max(0.4, pc.py + Math.min(1, pc.h * 0.5)), pc.pz, Math.max(0.02, pc.T - pc.t));
        }
      }
      // (a piece that never landed: broken in the air by something else, or the fight reset under it)
      if (m.t > m.at + 0.5 || (pc && pc.state !== FLYING && m.t > 0.1)) {
        m.alive = false;
        m.piece = null;
      }
    }
  }
}
