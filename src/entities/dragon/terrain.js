import { TUNING } from './tuning.js';
import { TERRAIN } from './tuningTerrain.js';
import { TELL, RESULT } from '../../combat/rules.js';
import { clamp, angleDiff } from '../../core/math.js';
import { STATE } from '../../world/destructibles.js';
import { BREAK } from '../../world/breakTuning.js';

// The wyrm's hold on the world's pieces (ADR-110): which tree or boulder it can take, the piece in
// its jaws, the piece in the air, where it will land (the mark), the blow when it lands, and the
// burning wreck a firebrand leaves. The world owns the pieces (world/destructibles.js, ADR-107:
// take / carry / throwTo / drop / stop); a thrown piece's blow at the hero is the thrower's, so it
// is dealt here, with the move's own tell.
//
//   jawsPiece(d, wood, out, any)   the piece the jaws would take (and how far it must go for it)
//   tailPiece(d, out, any)         the boulder the tail would bat (and which way the tail swings)
//   dragon.terrain (class Terrain):
//     grab(piece, x, y, z)         the jaws at (x, y, z) close on it: it is torn out and held
//     carry(dt, x, y, z, tilt, yaw) every frame while held (after the rig): its grip point at the jaws
//     blaze(dt, k)                 the held piece burns (a firebrand being lit)
//     lob(tx, tz, spec, attack, a, b, burning) → its flight time: thrown in an arc, it lands and bursts
//     bat(piece, lane, speed, spec, attack, a, b) → true: batted along the ground (cover stops it)
//     mark(dt, x, z, r, k, hot) / lane(dt, ...)   the landing spot / the line, before the throw
//     stir(dt, piece)              the chosen piece sheds dust (the read: this is the one)
//     drop()                       an interrupted hold: the piece falls where it is
//     piecePos(out)                the piece held or in the air (the tell's flash sits on it)
//     update(dt) / reset()
// Every call into the world is guarded: the test suites' world mocks have no destructibles, and
// then no move finds a piece. No per-frame allocation (pooled shots and pyres, reused records).

const { INTACT, HELD } = STATE;
const J = TERRAIN.jaws, TL = TERRAIN.tail;
const G = BREAK.thrown.gravity, SPIN = BREAK.thrown.spin;
const LEAVES = 'o0O8@&';
const GRIT = ".,:'";
const DUST = ",.`:'";
const FLAMES = "*^'`\"~%";
const PALE_DIM = [0.2, 0.2, 0.19];
const EARTH = [0.34, 0.27, 0.2];
const EARTH_END = [0.12, 0.1, 0.08];
const LEAF = [0.26, 0.42, 0.2];
const LEAF_END = [0.07, 0.11, 0.06];
const rand = (a, b) => a + Math.random() * (b - a);

/** world.destructibles when it can lift and throw (a test's world mock may have none). */
export function pieces(d) {
  const W = d.game.world?.destructibles;
  return W && Array.isArray(W.list) && typeof W.take === 'function' && typeof W.throwTo === 'function' ? W : null;
}

const liftable = (b) => b && b.state === INTACT && b.lift > 0 && b.lift <= 1 && Number.isFinite(b.hpMax);

/**
 * The piece the jaws would take: the liftable piece that costs the least to reach (a turn, a short
 * run), not one the hero stands against. `wood`: a tree only (it must burn). Writes the plan into
 * `out` ({ piece, time: s of turning and running before the bite, travel: m }) and returns the piece
 * or null. `any` (a forced move: the Lab, Training): a longer run is allowed.
 */
export function jawsPiece(d, wood = false, out = null, any = false) {
  const W = pieces(d);
  if (!W) return null;
  const px = d.position.x, pz = d.position.z, B = d.bound;
  const hp = d.sense.pos;
  const maxT = any ? J.fetchTime * 1.6 : J.fetchTime, maxD = any ? J.fetch * 1.5 : J.fetch;
  let best = null, bs = Infinity, bt = 0, bl = 0;
  const L = W.list;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (!liftable(b)) continue;
    if (wood && !(b.mat === 'wood' && b.burns !== false && b.h >= BREAK.topple.minH)) continue;
    const dx = b.x - px, dz = b.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > maxD || dist < 0.5) continue;
    if (Math.hypot(b.x - hp.x, b.z - hp.z) < J.clear + b.r) continue;
    // where it would stand to bite: `stand` short of the piece on the line to it, inside its bound
    let sx = b.x - (dx / dist) * J.stand, sz = b.z - (dz / dist) * J.stand;
    const sr = Math.hypot(sx, sz);
    if (sr > B) {
      sx *= B / sr;
      sz *= B / sr;
      const sd = Math.hypot(b.x - sx, b.z - sz);
      if (sd > J.far - 0.3 || sd < J.near) continue;
    }
    const travel = dist > J.far - 0.4 || dist < J.near + 0.2 ? Math.hypot(sx - px, sz - pz) : 0;
    const turn = Math.abs(angleDiff(d.yaw, Math.atan2(dx, dz)));
    const time = Math.max(turn / J.turn, travel / J.fetchSpeed) + 0.12;
    if (time > maxT) continue;
    const score = travel + turn * 3.5;
    if (score < bs) {
      bs = score;
      best = b;
      bt = time;
      bl = travel;
    }
  }
  if (best && out) {
    out.piece = best;
    out.time = bt;
    out.travel = bl;
  }
  return best;
}

/**
 * The boulder the tail would bat at the hero: within the swinging tail's ring, the line from it to
 * the hero clear of the wyrm's own body, and the tail's travel at the boulder pointing the hero's
 * way. Writes { piece, dir: which way the pivot turns (+1 / -1) } into `out`; returns the piece or
 * null. `any` (a forced move): the nearest boulder in the ring, whatever the line.
 */
export function tailPiece(d, out = null, any = false) {
  const W = pieces(d);
  if (!W) return null;
  const X = TUNING.attacks.tailBat;
  const px = d.position.x, pz = d.position.z;
  const hp = d.sense.pos;
  const hb = Math.atan2(hp.x - px, hp.z - pz), hd = Math.hypot(hp.x - px, hp.z - pz);
  let best = null, bs = Infinity, bdir = 1;
  const L = W.list;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (!liftable(b) || b.kind !== 'boulder') continue;
    const dx = b.x - px, dz = b.z - pz;
    const R = Math.hypot(dx, dz);
    if (R < TL.ring[0] || R > TL.ring[1]) continue;
    const lx = hp.x - b.x, lz = hp.z - b.z;
    const len = Math.hypot(lx, lz);
    if (len < (any ? 2.5 : X.range[0]) || len > (any ? 60 : X.range[1])) continue;
    const phi = Math.atan2(dx, dz);
    // the tail's travel at the boulder is along (cos phi, -sin phi) x -dir: toward the hero
    const c = (Math.cos(phi) * lx - Math.sin(phi) * lz) / len;
    const dir = c > 0 ? -1 : 1;
    if (!any) {
      if (Math.abs(c) < TL.cos) continue;
      // its line clear of the wyrm's body
      const t = clamp(-(dx * lx + dz * lz) / (len * len), 0, 1);
      if (Math.hypot(dx + lx * t, dz + lz * t) < TL.body) continue;
      // the hero out of the lash's own arc
      const rel = angleDiff(phi, hb) * dir;
      if (hd < TL.ring[1] + 2.5 && rel > -(X.past + 0.3) && rel < X.offset + 0.3) continue;
    }
    const pivot = Math.abs(angleDiff(d.yaw, phi + Math.PI + dir * X.offset));
    const score = pivot + Math.abs(R - 10) * 0.12 + (1 - Math.abs(c)) * 1.5;
    if (score < bs) {
      bs = score;
      best = b;
      bdir = dir;
    }
  }
  if (best && out) {
    out.piece = best;
    out.dir = bdir;
  }
  return best;
}

const blankShot = (i) => ({
  i, on: false, piece: null, mode: 0, attack: '', spec: null, action: null, beat: null,
  t: 0, T: 1, span: 1, pulsed: false, burning: false, hitDone: false,
  // an arc (mode 0): where it left the jaws, its velocity, where it lands, the way it travels
  x0: 0, y0: 0, z0: 0, vx: 0, vy: 0, vz: 0, tx: 0, tz: 0, dx: 0, dz: 1, r: 3,
  // a skim (mode 1): its line, how far along it is, where the hero stood on it, its speed, its tumble
  ax: 0, az: 0, len: 0, s: 0, hitS: 0, speed: 20, ang: 0, x: 0, y: 0, z: 0,
  mk: { hold: 0, acc4: 0, heatT: 0, seed: 1 }, acc: 0, light: null,
});
const blankPyre = () => ({ on: false, x: 0, z: 0, r: 2, t: 0, T: 3, tickT: 0, acc: 0, heatT: 0, light: null, spec: null, attack: '' });

export class Terrain {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    /** the piece in the jaws */
    this.hold = { piece: null, grip: 0, ox: 0, oy: 0, oz: 0, blend: 0, bx: 0, by: 0, bz: 0, ax: 0, ay: 1, az: 0, fire: 0, acc: 0, dirt: 0, shed: 0, light: null };
    this.shots = [blankShot(0), blankShot(1), blankShot(2)];
    this.pyres = [blankPyre(), blankPyre(), blankPyre()];
    /** the mark before the throw (one move aims at a time) */
    this.mk = { hold: 0, acc4: 0, heatT: 0, seed: 1, lastT: -9 };
    this._stir = 0;
    this._phase = 1;
    this._last = null; // the shot thrown last (piecePos)
    this._landed = (piece, x, z) => this._onLand(piece, x, z);
    this._o = { damage: 0, from: { x: 0, z: 0 }, point: { x: 0, y: 0.8, z: 0 }, knockback: 0, knockdown: false, kind: 'crush', burn: 0, tell: TELL.RED, parryable: false, blockable: false, attack: '', plunge: false, perfect: undefined };
    this._stop = { kind: 'blunt', by: 'boss', y: 0.8, dx: 0, dz: 0 };
    this._throw = { time: 1, power: 1, radius: 2, by: 'boss', onLand: null };
  }

  get W() {
    return pieces(this.d);
  }

  // ------------------------------------------------------------------ the piece in the jaws
  /** The jaws at (x, y, z) close on `piece`: it is torn out of the ground and held. False = it is gone. */
  grab(piece, x, y, z) {
    const W = this.W, h = this.hold;
    if (!W || !piece || h.piece) return false;
    if (!W.take(piece)) return false;
    const tall = piece.h >= BREAK.topple.minH;
    h.piece = piece;
    h.grip = tall ? clamp(y, J.grip[0], Math.min(J.grip[1], piece.h * 0.38)) : piece.h * 0.5;
    // where it stood, against where the jaws would hold it: the difference fades out (no jump)
    h.ox = piece.x - x;
    h.oy = 0 - (y - h.grip);
    h.oz = piece.z - z;
    h.blend = 1;
    h.bx = piece.x;
    h.by = 0;
    h.bz = piece.z;
    h.ax = 0;
    h.ay = 1;
    h.az = 0;
    h.fire = 0;
    h.acc = 0;
    return true;
  }

  /** Every frame while it is held (after the rig): the grip point at (x, y, z), leaning `tilt` toward `yaw`. */
  carry(dt, x, y, z, tilt = 0, yaw = 0) {
    const W = this.W, h = this.hold, b = h.piece;
    if (!b) return;
    if (!W || b.state !== HELD || !Number.isFinite(x + y + z + tilt + yaw)) {
      h.piece = null;
      return;
    }
    const st = Math.sin(tilt);
    h.ax = Math.sin(yaw) * st;
    h.ay = Math.cos(tilt);
    h.az = Math.cos(yaw) * st;
    h.blend *= Math.exp(-J.blend * Math.max(0, dt));
    h.bx = x - h.ax * h.grip + h.ox * h.blend;
    h.by = y - h.ay * h.grip + h.oy * h.blend;
    h.bz = z - h.az * h.grip + h.oz * h.blend;
    W.carry(b, h.bx, h.by, h.bz, tilt, yaw);
    // earth falls from its foot: it was torn out, it is not standing there
    h.dirt += dt * 30;
    let n = Math.min(4, Math.floor(h.dirt));
    h.dirt -= n;
    const fx = this.d.fx;
    while (n-- > 0) {
      const o = fx._rec(h.bx + rand(-0.5, 0.5) * b.r * 2, h.by + rand(-0.1, 0.5), h.bz + rand(-0.5, 0.5) * b.r * 2, rand(0.5, 0.9), rand(0.28, 0.42), 0.12, GRIT);
      o.vx = rand(-0.6, 0.6);
      o.vy = rand(-1, 0.5);
      o.vz = rand(-0.6, 0.6);
      o.gravity = -14;
      o.drag = 0.4;
      fx._col(EARTH, 1, EARTH_END, 1);
      fx._spawn(fx.alpha, o);
    }
    // and it sheds: leaves and bark shaken off along its length (the read at the game camera: the
    // dark tree in the jaws is the one trailing litter)
    if (b.h >= BREAK.topple.minH) {
      h.shed += dt * 26;
      n = Math.min(3, Math.floor(h.shed));
      h.shed -= n;
      while (n-- > 0) {
        const u = 0.25 + 0.75 * Math.random(), leaf = b.leafy > 0 && u > 0.45;
        const o = fx._rec(h.bx + h.ax * b.h * u + rand(-0.5, 0.5), h.by + h.ay * b.h * u + rand(-0.3, 0.3), h.bz + h.az * b.h * u + rand(-0.5, 0.5), rand(0.6, 1.1), rand(0.3, 0.44), 0.12, leaf ? LEAVES : b.M?.chips ?? GRIT);
        o.vx = rand(-0.8, 0.8);
        o.vy = rand(-0.6, 0.8);
        o.vz = rand(-0.8, 0.8);
        o.gravity = leaf ? -3.5 : -11;
        o.drag = leaf ? 1.4 : 0.5;
        o.spin = rand(-5, 5);
        o.rot = rand(0, 6.283);
        if (leaf) fx._col(LEAF, 1.5, LEAF_END, 1);
        else fx._col(b.M?.color ?? PALE_DIM, 1.3, b.M?.colorEnd ?? PALE_DIM, 1);
        fx._spawn(fx.alpha, o);
      }
    }
  }

  /** The held piece burns (k 0..1: how far the fire has run up it). */
  blaze(dt, k) {
    const h = this.hold, b = h.piece;
    if (!b || !(k > 0)) return;
    h.fire = k;
    this._flames(h, dt, h.bx, h.by, h.bz, h.ax, h.ay, h.az, b, k);
    const fx = this.d.fx;
    if (!h.light) h.light = fx._light({ x: h.bx, y: h.by + 2, z: h.bz, color: [1, 0.5, 0.16], intensity: 3.6, radius: 12, fadeIn: 0.2, fade: 0.4, flicker: 0.5 });
    h.light?.set?.(h.bx + h.ax * b.h * 0.5, h.by + h.ay * b.h * 0.5, h.bz + h.az * b.h * 0.5);
  }

  /** An interrupted hold: the piece falls where it is and comes apart (no blow). */
  drop() {
    const h = this.hold, b = h.piece;
    h.piece = null;
    h.light?.kill?.();
    h.light = null;
    if (b && b.state === HELD) this.W?.drop?.(b);
  }

  /** The piece held or in the air (the flash of its tell sits on it); the jaws when there is none. */
  piecePos(out) {
    const h = this.hold;
    if (h.piece) return out.set(h.bx + h.ax * h.piece.h * 0.5, h.by + h.ay * h.piece.h * 0.5, h.bz + h.az * h.piece.h * 0.5);
    const s = this._last;
    if (s?.on) {
      if (s.mode === 1) return out.set(s.x, s.y + 0.6, s.z);
      const t = s.t;
      return out.set(s.x0 + s.vx * t, Math.max(0.5, s.y0 + s.vy * t - 0.5 * G * t * t + 1), s.z0 + s.vz * t);
    }
    return out.copy(this.d.rig.pt.mouth);
  }

  // ------------------------------------------------------------------ the piece in the air
  _shot() {
    for (const s of this.shots) if (!s.on) return s;
    return null;
  }

  /**
   * The held piece is thrown in an arc at (tx, tz): the world flies it and bursts it there
   * (throwTo); its blow at the hero is dealt here when it lands. `a` / `b`: the action and its tell
   * beat (the flash still comes if the action is cut short). Returns the flight time, 0 = not thrown.
   */
  lob(tx, tz, spec, attack, a = null, b = null, burning = false) {
    const W = this.W, h = this.hold, piece = h.piece, s = this._shot();
    if (!W || !piece || !s || !Number.isFinite(tx + tz)) return 0;
    const dist = Math.hypot(tx - h.bx, tz - h.bz);
    const T = clamp(0.55 + dist / spec.flightPer, spec.flight[0], spec.flight[1]);
    const o = this._throw;
    o.time = T;
    o.power = spec.power;
    o.radius = spec.radius;
    o.onLand = this._landed;
    if (!W.throwTo(piece, tx, tz, o)) return 0;
    s.on = true;
    s.piece = piece;
    s.mode = 0;
    s.attack = attack;
    s.spec = spec;
    s.action = a;
    s.beat = b;
    s.t = 0;
    s.T = T;
    s.span = Math.max(T, b ? b.impactIn : T);
    s.pulsed = false;
    s.burning = !!burning;
    s.hitDone = false;
    s.x0 = h.bx;
    s.y0 = h.by;
    s.z0 = h.bz;
    s.vx = (tx - h.bx) / T;
    s.vz = (tz - h.bz) / T;
    s.vy = (0 - h.by + 0.5 * G * T * T) / T;
    s.tx = tx;
    s.tz = tz;
    const l = dist > 1e-3 ? dist : 1;
    s.dx = (tx - h.bx) / l;
    s.dz = (tz - h.bz) / l;
    s.r = spec.radius;
    s.mk.seed = this.mk.seed;
    s.mk.hold = s.mk.acc4 = s.mk.heatT = 0;
    s.acc = 0;
    s.light = h.light; // (a firebrand's light flies with it)
    h.light = null;
    h.piece = null;
    this._last = s;
    return T;
  }

  /**
   * `piece` is batted along the ground: from where it stands along (dx, dz) for `len` m at `speed`;
   * `hitS` = how far along the line the hero stood. It is carried here frame by frame (the first
   * cover on its way stops it: world.stop), tests the hero as it passes and comes apart at the end.
   */
  bat(piece, dx, dz, len, hitS, speed, spec, attack, a = null, b = null) {
    const W = this.W, s = this._shot();
    if (!W || !piece || !s || !Number.isFinite(dx + dz + len + speed) || !(speed > 0)) return false;
    if (!W.take(piece)) return false;
    s.on = true;
    s.piece = piece;
    s.mode = 1;
    s.attack = attack;
    s.spec = spec;
    s.action = a;
    s.beat = b;
    s.t = 0;
    s.T = hitS / speed;
    s.span = Math.max(s.T, 0.3);
    s.pulsed = false;
    s.burning = false;
    s.hitDone = false;
    s.ax = piece.x;
    s.az = piece.z;
    s.dx = dx;
    s.dz = dz;
    s.len = len;
    s.s = 0;
    s.hitS = hitS;
    s.speed = speed;
    s.ang = 0;
    s.x = piece.x;
    s.y = 0.2;
    s.z = piece.z;
    s.r = piece.r;
    s.mk.seed = this.mk.seed;
    s.mk.hold = s.mk.acc4 = s.mk.heatT = 0;
    s.acc = 0;
    s.light = null;
    this._last = s;
    return true;
  }

  /** The world calls this where a thrown piece lands (throwTo's onLand). */
  _onLand(piece, x, z) {
    for (const s of this.shots) {
      if (s.on && s.mode === 0 && s.piece === piece) {
        this._impact(s, x, z);
        return;
      }
    }
  }

  _blow(s, x, z, y = 0.8) {
    const d = this.d, spec = s.spec, o = this._o;
    const red = spec.tell === TELL.RED;
    o.damage = spec.damage;
    o.knockback = spec.knockback ?? 0;
    o.knockdown = !!spec.knockdown;
    o.kind = s.burning ? 'fire' : 'crush';
    o.burn = spec.burn ?? 0;
    o.tell = spec.tell ?? TELL.RED;
    o.parryable = !red;
    o.blockable = !red;
    o.attack = s.attack;
    o.plunge = false; // a thrown piece is no body to leap onto: slow-mo and crits in place
    o.perfect = undefined;
    o.from.x = x;
    o.from.z = z;
    o.point.x = x;
    o.point.y = y;
    o.point.z = z;
    return d.hitPlayer(o, null);
  }

  _impact(s, x, z) {
    const d = this.d, g = this.game, fx = d.fx, spec = s.spec;
    s.on = false;
    const p = g.player;
    const pp = p?.position;
    if (!s.hitDone && pp && Math.hypot(pp.x - x, pp.z - z) <= spec.radius + (p.radius ?? 0.45)) {
      s.hitDone = true;
      this._blow(s, x, z);
    }
    fx.dustRing(x, z, spec.radius * 0.45, 30, 0.9);
    d.markHitbox?.(x, 0, z, spec.radius);
    if (s.burning) {
      // the burning tree bursts: a fire blast, the grass and wood round it catch, its wreck burns on
      s.light?.kill?.();
      fx._light({ x, y: 1.2, z, color: [1, 0.58, 0.22], intensity: 8, radius: 13, life: 0.55, fade: 0.45, flicker: 0.3 });
      fx._fireBlast(x, z, spec.radius); // (the fire field's blast, ADR-113)
      g.world?.scorch?.burnCircle?.(x, z, spec.radius * 0.8, 0.45, 1);
      const ig = spec.ignite;
      if (ig) g.world?.ignite?.(x, z, spec.radius * ig[1], ig[0]);
      d.emit('dragon:explosion', { x, z, radius: spec.radius });
      this._pyre(x, z, spec, s.attack);
    }
    s.light = null;
    s.piece = null;
    s.action = s.beat = null;
  }

  /** A batted piece comes apart at (tx, tz) a moment from now (the world's shortest fall). */
  _endSkim(s, tx, tz) {
    const W = this.W, o = this._throw;
    o.time = 0.25;
    o.power = s.spec.power;
    o.radius = s.spec.burst ?? 2;
    o.onLand = null;
    if (s.piece?.state === HELD) W?.throwTo?.(s.piece, tx, tz, o);
    s.on = false;
    s.piece = null;
    s.action = s.beat = null;
  }

  // ------------------------------------------------------------------ marks (where it will land)
  /** The landing spot before the throw: k 0..1 toward the impact, `hot` = its last flashLead s. */
  mark(dt, x, z, r, k, hot) {
    const st = this.mk, t = this.game.time ?? 0;
    if (t - st.lastT > 0.3) {
      st.seed = 1 + Math.random() * 97;
      st.heatT = 0;
    }
    st.lastT = t;
    this._disc(st, dt, x, z, r, k, hot);
  }

  /** The line a batted piece will take, before the lash: from (ax, az) along (dx, dz), s0..s1, half width hw. */
  lane(dt, ax, az, dx, dz, s0, s1, hw, k, hot) {
    const st = this.mk, t = this.game.time ?? 0;
    if (t - st.lastT > 0.3) {
      st.seed = 1 + Math.random() * 97;
      st.heatT = 0;
    }
    st.lastT = t;
    this._band(st, dt, ax, az, dx, dz, s0, s1, hw, k, hot);
  }

  _disc(st, dt, x, z, r, k, hot) {
    const fx = this.d.fx;
    const life = fx.holdLife(st, dt);
    // the ground heats up over the footprint, as under every other blow from above (ADR-052)
    fx.heatDisc(life, st, dt, x, z, r, k, hot, st.seed);
  }

  _band(st, dt, ax, az, dx, dz, s0, s1, hw, k, hot) {
    const fx = this.d.fx;
    fx.heatBand(fx.holdLife(st, dt), st, dt, ax, az, dx, dz, s0, s1, hw, k, hot, st.seed);
  }

  /** The flash of a landing (combat:flash): its mark flares. */
  _pulse(x, z, r) {
    this.d.fx.heatFlare(x, z, r);
  }

  /** The piece the wyrm has chosen sheds dust and grit before it is taken. */
  stir(dt, b) {
    if (!b) return;
    const fx = this.d.fx;
    this._stir += dt * TERRAIN.stir;
    let n = Math.min(4, Math.floor(this._stir));
    this._stir -= n;
    while (n-- > 0) {
      const a = Math.random() * 6.283, rr = b.r * (0.6 + 0.6 * Math.random());
      const o = fx._rec(b.x + Math.cos(a) * rr, 0.15 + Math.random() * Math.min(1.2, b.h * 0.3), b.z + Math.sin(a) * rr, rand(0.4, 0.8), rand(0.3, 0.5), rand(0.7, 1.1), DUST);
      o.vx = Math.cos(a) * rand(0.4, 1.4);
      o.vy = rand(0.5, 1.6);
      o.vz = Math.sin(a) * rand(0.4, 1.4);
      o.drag = 1.6;
      o.alpha = 0.6;
      o.spin = rand(-2, 2);
      fx._col(b.M?.colorEnd ?? PALE_DIM, 1.6, b.M?.colorEnd ?? PALE_DIM, 1);
      fx._spawn(fx.alpha, o);
    }
  }

  /** Flames along a trunk: its foot at (bx, by, bz), its axis (ax, ay, az); k 0..1 = how much of it burns. */
  _flames(st, dt, bx, by, bz, ax, ay, az, b, k) {
    const fx = this.d.fx;
    st.acc += dt * (70 + b.h * 34) * k;
    let n = Math.min(22, Math.floor(st.acc));
    st.acc -= n;
    const wide = b.leafy > 0 ? b.r * 2.6 : b.r * 1.1;
    while (n-- > 0) {
      const u = Math.random() * k, hot = Math.random();
      const rr = (u > 0.45 ? wide : b.r) * Math.sqrt(Math.random()), a = Math.random() * 6.283;
      const o = fx._rec(bx + ax * b.h * u + Math.cos(a) * rr, by + ay * b.h * u + rand(-0.2, 0.2), bz + az * b.h * u + Math.sin(a) * rr, rand(0.35, 0.7), 0.7 + hot * 0.6, 0.1, FLAMES);
      o.vx = rand(-0.5, 0.5);
      o.vy = rand(1.4, 3.4);
      o.vz = rand(-0.5, 0.5);
      o.drag = 1;
      o.flicker = 0.3;
      o.spin = rand(-2, 2);
      o.stretch = 0.5;
      const c = fx._c0, e = fx._c1;
      c[0] = 3.6;
      c[1] = 1.1 + hot * 1.1;
      c[2] = 0.24;
      e[0] = 0.8;
      e[1] = 0.05;
      e[2] = 0.02;
      fx._spawn(fx.add, o);
    }
  }

  // ------------------------------------------------------------------ the burning wreck
  _pyre(x, z, spec, attack) {
    const P = spec.pyre;
    if (!P) return;
    let p = null;
    for (const q of this.pyres) if (!q.on) p = p ?? q;
    if (!p) return;
    p.on = true;
    p.x = x;
    p.z = z;
    p.r = P.radius;
    p.t = 0;
    p.T = P.time;
    p.tickT = P.tick;
    p.acc = 0;
    p.heatT = 0;
    p.spec = spec;
    p.attack = attack;
    p.light = this.d.fx._light({ x, y: 1.4, z, color: [1, 0.45, 0.12], intensity: 3.4, radius: 10, life: P.time + 0.4, fade: 0.9, flicker: 0.55 });
  }

  _burn(p, dt) {
    const d = this.d, g = this.game, fx = d.fx, P = p.spec.pyre;
    p.t += dt;
    const u = p.t / p.T; // 0 → 1 as it burns down
    if (u >= 1) {
      p.on = false;
      p.light = null;
      return;
    }
    const live = 1 - u * u;
    p.acc += dt * 34 * p.r * live;
    let n = Math.min(16, Math.floor(p.acc));
    p.acc -= n;
    while (n-- > 0) {
      const a = Math.random() * 6.283, rr = p.r * Math.sqrt(Math.random()), hot = Math.random();
      const o = fx._rec(p.x + Math.cos(a) * rr, rand(0.15, 0.5), p.z + Math.sin(a) * rr, rand(0.4, 0.85), 0.55 + hot * 0.5, 0.08, FLAMES);
      o.vx = rand(-0.4, 0.4);
      o.vy = rand(1.6, 4.2) * (0.5 + 0.5 * live);
      o.vz = rand(-0.4, 0.4);
      o.drag = 1;
      o.flicker = 0.3;
      o.stretch = 0.5;
      const c = fx._c0, e = fx._c1;
      c[0] = 3.5;
      c[1] = 1.0 + hot * 1.0;
      c[2] = 0.22;
      e[0] = 0.8;
      e[1] = 0.05;
      e[2] = 0.02;
      fx._spawn(fx.add, o);
    }
    p.heatT -= dt;
    if (p.heatT <= 0) {
      p.heatT = 0.3;
      g.world?.scorch?.burnCircle?.(p.x, p.z, p.r, 0.04, 0.65);
    }
    // a hero standing in it: contact ticks (blockable, never while he rolls; not on top of the grass
    // fire's own ticks where that burns too)
    p.tickT -= dt;
    if (p.tickT > 0) return;
    p.tickT = P.tick;
    const pl = g.player, pp = pl?.position;
    if (!pp || pl.alive === false || pl.state === 'roll' || pl.isInvulnerable?.()) return;
    if (Math.hypot(pp.x - p.x, pp.z - p.z) > p.r * 0.85 + (pl.radius ?? 0.45)) return;
    if (g.world?.fire?.burning?.(pp.x, pp.z) > 0) return;
    const o = this._o;
    o.damage = P.tickDamage;
    o.knockback = 0;
    o.knockdown = false;
    o.kind = 'fire';
    o.burn = P.tickBurn ?? 0;
    o.tell = TELL.NORMAL;
    o.parryable = false;
    o.blockable = true;
    o.attack = p.attack;
    o.plunge = false;
    o.perfect = false;
    o.from.x = p.x;
    o.from.z = p.z;
    o.point.x = pp.x;
    o.point.y = 0.5;
    o.point.z = pp.z;
    d.hitPlayer(o, null);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!(dt > 0)) return;
    try {
      this._update(dt);
    } catch (err) {
      // never freeze the frame: what was in the air is let go
      console.error('[dragon] terrain update failed', err);
      this.reset();
    }
  }

  _update(dt) {
    const d = this.d;
    // a new phase, death or sleep puts the wrecks out (as the fire hazards)
    if (d.phase !== this._phase || d.state === 'dying' || d.state === 'dead' || d.state === 'sleeping') {
      this._phase = d.phase;
      for (const p of this.pyres) {
        if (p.on) p.light?.kill?.();
        p.on = false;
        p.light = null;
      }
    }
    for (const s of this.shots) if (s.on) (s.mode === 1 ? this._skim(s, dt) : this._arc(s, dt));
    for (const p of this.pyres) if (p.on) this._burn(p, dt);
  }

  /** The tell's flash, if the action that threw it is gone: flashLead before the piece arrives. */
  _cue(s, left, x, z, r) {
    const lead = TUNING.flashLead;
    if (left > lead + 1e-6) return false;
    const b = s.beat;
    if (b && !b.flashed) {
      b.flashed = true;
      this.d.flashTell(s.action, b);
    }
    if (!s.pulsed) {
      s.pulsed = true;
      this._pulse(x, z, r);
    }
    return true;
  }

  _arc(s, dt) {
    const fx = this.d.fx, b = s.piece;
    s.t += dt;
    if (!b || s.t > s.T + 0.6) {
      // it never landed (the world was restored under it): nothing more to mark
      s.on = false;
      s.light?.kill?.();
      s.light = null;
      return;
    }
    const left = s.T - s.t;
    const hot = this._cue(s, left, s.tx, s.tz, s.r);
    if (left > 0) this._disc(s.mk, dt, s.tx, s.tz, s.r, clamp(1 - left / s.span, 0, 1), hot);
    // where it is now (the world moves it: the same arc), its axis as it turns end over end
    const t = Math.min(s.t, s.T);
    const x = s.x0 + s.vx * t, y = Math.max(0, s.y0 + s.vy * t - 0.5 * G * t * t), z = s.z0 + s.vz * t;
    const ang = SPIN * t, sa = Math.sin(ang);
    const ax = s.dx * sa, ay = Math.cos(ang), az = s.dz * sa;
    if (s.burning) {
      this._flames(s, dt, x, y, z, ax, ay, az, b, 1);
      s.light?.set?.(x + ax * b.h * 0.5, y + ay * b.h * 0.5, z + az * b.h * 0.5);
    } else {
      // it sheds leaves and grit as it flies
      s.acc += dt * 34;
      let n = Math.min(4, Math.floor(s.acc));
      s.acc -= n;
      while (n-- > 0) {
        const u = Math.random(), leaf = b.leafy > 0 && u > 0.4;
        const o = fx._rec(x + ax * b.h * u + rand(-0.4, 0.4), y + ay * b.h * u + rand(-0.4, 0.4), z + az * b.h * u + rand(-0.4, 0.4), rand(0.5, 0.9), rand(0.3, 0.45), 0.12, leaf ? LEAVES : b.M?.chips ?? GRIT);
        o.vx = s.vx * 0.3 + rand(-1, 1);
        o.vy = rand(-0.5, 1.5);
        o.vz = s.vz * 0.3 + rand(-1, 1);
        o.gravity = leaf ? -4 : -12;
        o.drag = leaf ? 1.5 : 0.5;
        o.spin = rand(-6, 6);
        o.rot = rand(0, 6.283);
        if (leaf) fx._col(LEAF, 1, LEAF_END, 1);
        else fx._col(b.M?.color ?? PALE_DIM, 1, b.M?.colorEnd ?? PALE_DIM, 1);
        fx._spawn(fx.alpha, o);
      }
    }
  }

  _skim(s, dt) {
    const d = this.d, g = this.game, fx = d.fx, W = this.W, b = s.piece, spec = s.spec;
    if (!W || !b || b.state !== HELD) {
      s.on = false;
      s.piece = null;
      return;
    }
    s.t += dt;
    const x0 = s.x, z0 = s.z;
    s.s = Math.min(s.len, s.s + s.speed * dt);
    s.x = s.ax + s.dx * s.s;
    s.z = s.az + s.dz * s.s;
    // a low skim: up off the ground at once, a shallow hop along the way
    s.y = 0.25 + 0.5 * Math.sin(Math.PI * Math.min(1, s.s / Math.max(1, s.len))) + Math.min(0.3, s.t * 3);
    s.ang += dt * 9;
    W.carry(b, s.x, s.y, s.z, s.ang, Math.atan2(s.dx, s.dz));
    // the mark ahead of it; the flash, if the lash's action is gone
    const left = (s.hitS - s.s) / s.speed;
    const hot = !s.hitDone && this._cue(s, left, s.ax + s.dx * s.hitS, s.az + s.dz * s.hitS, 1.6);
    if (s.s < s.len - 0.5) this._band(s.mk, dt, s.ax, s.az, s.dx, s.dz, s.s, s.len, spec.width, 1, hot || s.hitDone);
    // its wake: dust torn off the ground, grit
    s.acc += dt * 60;
    let n = Math.min(6, Math.floor(s.acc));
    s.acc -= n;
    while (n-- > 0) {
      const o = fx._rec(s.x + rand(-0.5, 0.5), rand(0.1, 0.5), s.z + rand(-0.5, 0.5), rand(0.5, 0.9), rand(0.4, 0.7), rand(1, 1.6), DUST);
      o.vx = -s.dx * rand(1, 4) + rand(-1, 1);
      o.vy = rand(0.4, 1.8);
      o.vz = -s.dz * rand(1, 4) + rand(-1, 1);
      o.drag = 2.4;
      o.alpha = 0.7;
      o.spin = rand(-2, 2);
      fx._col(PALE_DIM, 1, PALE_DIM, 1);
      fx._spawn(fx.alpha, o);
    }
    d.markHitbox?.(s.x, s.y + b.h * 0.5, s.z, spec.width);
    // cover: the first standing piece on this step stops it and pays for it
    const so = this._stop;
    so.dx = s.dx;
    so.dz = s.dz;
    const c = W.stop?.(x0, z0, s.x, s.z, b.r * 0.7, spec.power, so);
    if (c) {
      g.shake?.(0.25);
      this._endSkim(s, x0 + (s.x - x0) * (W.coverT ?? 1), z0 + (s.z - z0) * (W.coverT ?? 1));
      return;
    }
    // the hero on its line as it passes
    const p = g.player, pp = p?.position;
    if (!s.hitDone && pp) {
      const ex = s.x - x0, ez = s.z - z0, l2 = ex * ex + ez * ez;
      const t = l2 > 1e-9 ? clamp(((pp.x - x0) * ex + (pp.z - z0) * ez) / l2, 0, 1) : 0;
      const cx = x0 + ex * t, cz = z0 + ez * t;
      if (Math.hypot(pp.x - cx, pp.z - cz) <= spec.width + (p.radius ?? 0.45) && (pp.y ?? 0) < 2.2) {
        const r = this._blow(s, cx - s.dx * 0.6, cz - s.dz * 0.6, 1);
        if (r && r !== RESULT.IGNORED) s.hitDone = true;
        if (r === RESULT.HIT || r === RESULT.BLOCKED || r === RESULT.PARRIED || r === RESULT.CLASHED) {
          // it breaks on him (cut apart, or against his guard, or on his body)
          g.shake?.(0.2);
          this._endSkim(s, cx + s.dx * 0.8, cz + s.dz * 0.8);
          return;
        }
      }
    }
    if (s.s >= s.len) this._endSkim(s, s.x + s.dx * s.speed * 0.2, s.z + s.dz * s.speed * 0.2);
  }

  /** The fight's reset (and a broken update): the held piece falls, nothing is tracked, no wreck burns. */
  reset() {
    this.drop();
    const W = this.W;
    for (const s of this.shots) {
      if (s.on && s.mode === 1 && s.piece?.state === HELD) W?.drop?.(s.piece);
      s.on = false;
      s.piece = null;
      s.action = s.beat = null;
      s.light = null; // (fx.reset() killed the lights)
    }
    for (const p of this.pyres) {
      p.on = false;
      p.light = null;
    }
    this._last = null;
    this._stir = 0;
    this.mk.lastT = -9;
    this._phase = this.d.phase ?? 1;
  }
}
