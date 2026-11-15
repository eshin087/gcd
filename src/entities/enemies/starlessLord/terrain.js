import { TELL } from '../../../combat/rules.js';
import { clamp } from '../../../core/math.js';
import { perPhase } from '../duelist/realise.js';
import { TUNING } from './tuning.js';

// The Starless Lord uses the crater (ADR-109; COMBAT.md → "The Starless Lord" → "He uses the
// crater"). Three moves on the pieces of the set (world.destructibles, ARCHITECTURE.md →
// "Destruction"); the moves themselves are data (moves.js: a move marked `terrain: kind`), their
// numbers TUNING.terrain. What is here: which pieces he takes, how they hang in his grip, where
// they are thrown and what they do when they land.
//   hurl   Void Hurl    one piece (a stone already in the air, else a shard or a slab torn out of
//                       the floor) rises, comes to hang over his hand and is thrown at the hero
//   rain   Glass Rain   up to three at once, thrown one after another where the hero is going
//   fall   Crown Fall   his hand closes on a tall piece beside the hero and wrenches it down on him:
//                       the fall is the world's (red, its strip marked, dealt by destructibles.js)
// A thrown piece cues itself: the place it will land is ringed in red from the moment it leaves, and
// the glint comes flashLead before it lands, as the wyrm's meteors and his own called lightning do.
// The blow where it lands is his (red: out of the ring, or a roll through it); what it does to the
// other pieces there is the world's.
// A move is chosen by his AI only while there is a piece for it (weigh → 0 otherwise); started by
// hand (the Lab, Training) it takes what there is, and cannot start with none (the lab stage and
// the tests' world mocks have no pieces). Cut short before the throw (a stagger, a break, his
// death), what he holds drops where it hangs.
// No per-frame allocation: fixed records for the pieces held and the rings on the floor.

/** A piece's states (world/destructibles.js STATE). */
const INTACT = 0, HELD = 3;
const ease = (u) => u * u * (3 - 2 * u);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const lerp = (a, b, k) => a + (b - a) * k;
const GRIP = [2.6, 0.2, 0.12], GRIP_END = [0.5, 0.03, 0.02];
/** Where up to three pieces hang, in his own frame: [to his left, up, forward] m. Beside him and
 *  low enough to be on a phone's screen with him (the camera looks down: 3.6 m up was off its top). */
const SLOTS = [[1.5, 2.5, 0.5], [-1.7, 2.5, 0.5], [0, 3.3, 0.3]];
const KINDS = new Set(['hurl', 'rain', 'fall']);

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
    /** the rings where thrown pieces will land */
    this.marks = Array.from({ length: 4 }, () => ({ alive: false, piece: null, x: 0, z: 0, r: 0, t: 0, at: 0, flashed: false, damage: 0, kb: 0, attack: '' }));
    /** Crown Fall's piece and the way it falls */
    this.fall = { piece: null, dx: 0, dz: 1 };
    this._throw = { time: 0.8, power: 1, radius: 2, by: 'boss', onLand: (b, x, z) => this._landed(b, x, z) };
    this._from = { x: 0, z: 0 };
    this._cand = [];
  }

  get W() {
    return this.game.world?.destructibles ?? null;
  }

  get T() {
    return TUNING.terrain;
  }

  /** Something of his is still held or in the air. */
  get busy() {
    return this.held.some((h) => h.piece) || this.marks.some((m) => m.alive);
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
  }

  // ---------------------------------------------------------------- which pieces
  /** The pieces he can take now, best first: a stone already in the air, then the nearest to him. */
  _liftable(max) {
    const out = this._cand, W = this.W, d = this.d, T = this.T;
    out.length = 0;
    if (!W?.list) return out;
    for (const b of W.list) {
      if (b.state !== INTACT || !(b.lift > 0 && b.lift <= 2)) continue;
      const r = Math.hypot(b.x - d.position.x, b.z - d.position.z);
      if (r > T.reach || r < 1.2) continue;
      out.push(b);
    }
    // (a stone in the air first, big slabs last, else the nearest to him)
    const key = (b) => Math.hypot(b.x - d.position.x, b.z - d.position.z) - (b.kind === 'hover' ? T.reach : 0) + Math.max(0, b.h - T.easyH) * 3;
    out.sort((a, b) => key(a) - key(b));
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
      if (b.state !== INTACT || !b.topples || b.kind === 'hover') continue;
      const dx = hx - b.x, dz = hz - b.z, l = Math.hypot(dx, dz);
      if (l < T.min || l > b.h - T.short) continue; // (the strip runs from its foot to its height)
      if (Math.hypot(b.x - this.d.position.x, b.z - this.d.position.z) > this.T.reach) continue;
      const s = l - b.h * 0.5; // the hero nearest the middle of its fall
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

  /** His AI weighs a terrain move: nothing while there is no piece for it. */
  weigh(def, w) {
    if (!KINDS.has(def.terrain) || !this.W) return 0;
    if (this.busy) return 0;
    if (def.terrain === 'fall') return this._fallPick() ? w : 0;
    return this._liftable(3).length >= (def.terrain === 'rain' ? 2 : 1) ? w : 0;
  }

  /** A terrain move starts: the pieces are taken (false: there is none, it does not start). */
  begin(A) {
    const kind = A.def.terrain, W = this.W;
    if (!KINDS.has(kind) || !W || this.busy) return false;
    if (kind === 'fall') {
      if (!this._fallPick()) return false;
      this.act = A;
      this.kind = kind;
      this.cast = false;
      return true;
    }
    const want = kind === 'rain' ? fin(A.def.beats?.[0]?.cast?.count, 3) : 1;
    const c = this._liftable(want);
    if (c.length < (kind === 'rain' ? 2 : 1)) return false;
    let n = 0;
    for (const b of c) {
      const y0 = fin(b.def?.hover, 0);
      if (!W.take(b)) continue;
      // (a stone that hung in the air is drawn lifted by its own body: in his grip the lift is the
      // carry's, so it can be thrown down to the floor; throneHall.js lifts it again when it is whole)
      if (y0 > 0 && b.body) {
        b.body.position.y = 0;
        b.body.updateMatrix();
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
    this.act = A;
    this.kind = kind;
    this.cast = false;
    this.gapT = 0;
    this.game.shake?.(0.12);
    return true;
  }

  // ---------------------------------------------------------------- the throw
  /** His cast beat lands: the throw begins (hurl, rain) or the piece is wrenched down (fall). */
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
      // (the later ones a little to either side of the aim)
      tx += this.d.fx.rand(-T.spread, T.spread);
      tz += this.d.fx.rand(-T.spread, T.spread);
    }
    const dist = Math.hypot(tx - h.px, tz - h.pz);
    const time = clamp(dist / T.per, T.flight[0], T.flight[1]);
    this._throw.time = time;
    this._throw.power = T.power;
    this._throw.radius = T.radius;
    if (!W.throwTo(pc, tx, tz, this._throw)) {
      h.piece = null;
      return false;
    }
    const m = this.marks.find((k) => !k.alive);
    if (m) Object.assign(m, { alive: true, piece: pc, x: tx, z: tz, r: T.radius, t: 0, at: time, flashed: false, damage: this.hit.damage, kb: this.hit.kb, attack: this.hit.attack });
    h.piece = null;
    this.gapT = T.gap;
    const hand = this.d._hand;
    if (this.d._ptsOk) this.d.fx.arc(hand.x, hand.y, hand.z, h.px, h.py + 0.6, h.pz, 0.26, GRIP, GRIP_END, 6);
    this.game.shake?.(0.16);
    return true;
  }

  /** A thrown piece landed (destructibles.throwTo onLand): his blow, on a hero inside its ring. */
  _landed(pc, x, z) {
    const m = this.marks.find((k) => k.alive && k.piece === pc);
    if (!m) return;
    m.alive = false;
    m.piece = null;
    const d = this.d, p = this.game.player, pp = p?.position;
    d.fx.ringPulse(x, z, m.r);
    d.emit('dragon:explosion', { x, z, radius: m.r });
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
    this.act = null;
    this.cast = false;
  }

  // ---------------------------------------------------------------- every frame
  frame(dt) {
    const d = this.d, W = this.W, T = this.T;
    const holding = this.held.some((h) => h.piece);
    if (holding) {
      const m = d.mode;
      // cut short before the throw, or he is down: what he holds falls
      if (m === 'dying' || m === 'dead' || m === 'broken' || (!this.cast && (d.brain.act !== this.act || m !== 'act'))) this.drop();
    }
    if (this.kind === 'fall' && !this.cast && this.act && d.brain.act !== this.act) {
      this.act = null;
      this.fall.piece = null;
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
      // the grip: a thread of red from his hand to it, motes shaken off it
      if (d._ptsOk && d.fx.rnd() < 0.45) d.fx.arc(hand.x, hand.y, hand.z, h.px, h.py + Math.min(1.2, pc.h * 0.4), h.pz, 0.16, GRIP, GRIP_END, 5);
    }
    // the rest of a rain leave one after another
    if (this.cast && this.kind === 'rain' && this.held.some((h) => h.piece)) {
      this.gapT -= dt;
      if (this.gapT <= 0) this._throwNext(null);
    }
    if (this.cast && !this.held.some((h) => h.piece)) this.act = null;
    // the rings where they will land: the glint flashLead before
    const lead = perPhase(d.T.flashLead, d.phase);
    for (const m of this.marks) {
      if (!m.alive) continue;
      m.t += dt;
      // (drawn strong from the moment the piece leaves: there is under a second to be out of it)
      d.fx.warnRing(m.x, m.z, m.r, 0.45 + 0.55 * clamp(m.t / m.at, 0, 1), dt);
      if (!m.flashed && m.t >= m.at - lead) {
        m.flashed = true;
        d.emit('combat:tell', { source: 'dragon', attack: m.attack, tell: TELL.RED, impactIn: Math.max(0.02, m.at - m.t), x: m.x, z: m.z, hazard: true });
        d.emit('combat:flash', { source: 'dragon', attack: m.attack, tell: TELL.RED, x: m.x, y: 0.6, z: m.z, hazard: true });
        d.fx.ringPulse(m.x, m.z, m.r * 0.5);
      }
      // (a piece that never landed: broken in the air by something else)
      if (m.t > m.at + 0.5 || (m.piece && m.piece.state !== 4 && m.t > 0.1)) {
        m.alive = false;
        m.piece = null;
      }
    }
  }
}
