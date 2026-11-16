import { TUNING } from './tuning.js';
import { TERRAIN } from './tuningTerrain.js';
import { TELL, RESULT } from '../../combat/rules.js';
import { clamp, angleDiff } from '../../core/math.js';
import { STATE } from '../../world/destructibles.js';
import { BREAK, BLOW } from '../../world/breakTuning.js';
import * as TFX from './terrainFx.js';

// The wyrm's hold on the world's pieces (ADR-110, second pass): which tree or boulder it can take,
// the piece in its jaws (rooted while the jaws tug, then hanging from them like a stiff pendulum), the
// piece in the air (flown here, frame by frame: it tumbles on with the whip's swing and smashes what
// stands in its path), the blow where it lands, and the burning wreck a firebrand leaves. NOTHING is
// drawn on the ground before a piece arrives (the owner: "don't show exactly where the terrain will
// land"): the cue is the flare on the flying piece, flashLead before it lands. The world owns the
// pieces (world/destructibles.js, ADR-107: take / carry / throwTo / drop / stop / sweep); a thrown
// piece's blow at the hero is the thrower's, so it is dealt here, with the move's own tell.
//
//   jawsPiece(d, wood, out, any)   the piece the jaws would take (and how long the lunge to it is)
//   tailPiece(d, out, any)         the boulder the tail would bat (and which way the tail swings)
//   dragon.terrain (class Terrain):
//     grab(piece, x, y, z)         the jaws at (x, y, z) close on it: taken, but still ROOTED
//     tear()                       it comes free (roots and dirt burst) and is yanked up into the jaws
//     carry(dt, x, y, z, tilt, yaw, stiff)  every frame while held (after the rig): its grip point at
//                                  the jaws; rooted, it shudders where it stands; free, it swings
//                                  toward `tilt` (rad, + = its top toward heading `yaw`) as a pendulum
//     blaze(dt, k)                 the held piece burns (a firebrand being lit)
//     lob(tx, tz, spec, attack, a, b, burning) → its flight time: thrown at (tx, tz) with the swing
//     bat(piece, lane, speed, spec, attack, a, b) → true: batted along the ground (cover stops it)
//     stir(dt, piece)              the chosen piece sheds dust (the read: this is the one)
//     drop()                       an interrupted hold: the piece falls where it is
//     piecePos(out)                the piece held or in the air (the tell's flash sits on it)
//     update(dt) / reset()
// Every call into the world is guarded: the test suites' world mocks have no destructibles, and
// then no move finds a piece. No per-frame allocation (pooled shots and pyres, reused records).

const { INTACT, HELD } = STATE;
const J = TERRAIN.jaws, TL = TERRAIN.tail, SW = J.sway;
const G = BREAK.thrown.gravity;
const DUST = ",.`:'";
const PALE_DIM = [0.2, 0.2, 0.19];
const EARTH_LIT = [0.62, 0.48, 0.34];
const rand = (a, b) => a + Math.random() * (b - a);

/** world.destructibles when it can lift and throw (a test's world mock may have none). */
export function pieces(d) {
  const W = d.game.world?.destructibles;
  return W && Array.isArray(W.list) && typeof W.take === 'function' && typeof W.throwTo === 'function' ? W : null;
}

const liftable = (b) => b && b.state === INTACT && b.lift > 0 && b.lift <= 1 && Number.isFinite(b.hpMax);

/**
 * The piece the jaws would take: the liftable piece that costs the least to reach (a turn, a
 * lunge), not one the hero stands against. `wood`: a tree only (it must burn). Writes the plan into
 * `out` ({ piece, time: s of turning and lunging before the bite, travel: m }) and returns the piece
 * or null. `any` (a forced move: the Lab, Training): a longer lunge is allowed.
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
    // the turn and the lunge overlap (it whips round as it springs): the longer of the two, and a
    // gathering beat before a long spring
    const time = Math.max(turn / J.turn, travel / J.fetchSpeed + (travel > 1 ? 0.08 : 0)) + 0.06;
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
  t: 0, T: 1, burning: false, hitDone: false, src: -1,
  // an arc (mode 0): its centre of mass at release, its velocity, where it lands, the way it travels,
  // its tumble (angle about the throw's cross axis, rad/s), the centre's height up its axis
  x0: 0, y0: 0, z0: 0, vx: 0, vy: 0, vz: 0, tx: 0, tz: 0, dx: 0, dz: 1, r: 3, yaw: 0, ang: 0, w: 0, hc: 1, pcy: 0,
  cx: 0, cy: 0, cz: 0, // where its centre is now
  // a skim (mode 1): its line, how far along it is, where the hero stood on it, its speed, its tumble
  ax: 0, az: 0, len: 0, s: 0, hitS: 0, speed: 20, hop: 0, x: 0, y: 0, z: 0,
  fire: { acc: 0, emb: 0 }, grit: { acc: 0 }, light: null,
});
const blankPyre = () => ({ on: false, x: 0, z: 0, r: 2, t: 0, T: 3, tickT: 0, acc: 0, smoke: 0, heatT: 0, light: null, spec: null, attack: '' });

export class Terrain {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    /** the piece in the jaws: rooted (the tug) or swinging from them (th / w: its tilt and tilt rate) */
    this.hold = {
      piece: null, rooted: false, grip: 0, ox: 0, oy: 0, oz: 0, blend: 0, bx: 0, by: 0, bz: 0, ax: 0, ay: 1, az: 0,
      th: 0, w: 0, yaw: 0, jx: 0, jy: 0, jz: 0, jvx: 0, jvz: 0, jv: false, sh: 0,
      fire: 0, flame: { acc: 0, emb: 0 }, dirt: 0, shed: { acc: 0 }, light: null, strain: { strain: 0 },
    };
    /** pieces the flying ones have smashed on their way (tests, the Lab) */
    this.smashed = 0;
    this.shots = [blankShot(0), blankShot(1), blankShot(2)];
    this.pyres = [blankPyre(), blankPyre(), blankPyre()];
    this._stir = 0;
    this._phase = 1;
    this._last = null; // the shot thrown last (piecePos)
    this._o = { damage: 0, from: { x: 0, z: 0 }, point: { x: 0, y: 0.8, z: 0 }, knockback: 0, knockdown: false, kind: 'crush', burn: 0, tell: TELL.RED, parryable: false, blockable: false, attack: '', plunge: false, perfect: undefined };
    this._stop = { kind: 'blunt', by: 'boss', y: 0.8, dx: 0, dz: 0 };
    this._sweep = { kind: BLOW.BLUNT, by: 'boss', y: 1, dx: 0, dz: 0, src: -1 };
    this._land = { kind: BLOW.BLAST, by: 'boss', dx: 0, dz: 0, src: -1, fire: 0 };
    this._throw = { time: 1, power: 1, radius: 2, by: 'boss', onLand: null };
  }

  get W() {
    return pieces(this.d);
  }

  // ------------------------------------------------------------------ the piece in the jaws
  /** The jaws at (x, y, z) close on `piece`: it is taken (out of the world's colliders) but still rooted. */
  grab(piece, x, y, z) {
    const W = this.W, h = this.hold;
    if (!W || !piece || h.piece) return false;
    if (!W.take(piece)) return false;
    const tall = piece.h >= BREAK.topple.minH;
    h.piece = piece;
    h.rooted = true;
    h.grip = tall ? clamp(y, J.grip[0], Math.min(J.grip[1], piece.h * 0.38)) : piece.h * 0.5;
    h.ox = h.oy = h.oz = 0;
    h.blend = 0;
    h.bx = piece.x;
    h.by = 0;
    h.bz = piece.z;
    h.ax = 0;
    h.ay = 1;
    h.az = 0;
    h.th = 0;
    h.w = 0;
    h.sh = 0;
    h.jv = false;
    h.fire = 0;
    h.flame.acc = h.flame.emb = 0;
    return true;
  }

  /** The tug wins: the piece tears out of the ground and is yanked up into the jaws (no jump: the gap fades). */
  tear(dx = 0, dz = 0) {
    const h = this.hold, b = h.piece;
    if (!b || !h.rooted) return false;
    h.rooted = false;
    // its foot is where it stood; held, the foot hangs `grip` below the jaws: the gap is blended out
    h.ox = h.bx - (h.jx - h.ax * h.grip);
    h.oy = h.by - (h.jy - h.ay * h.grip);
    h.oz = h.bz - (h.jz - h.az * h.grip);
    h.blend = 1;
    h.w = 0;
    TFX.tearOut(this.d.fx, b, b.x, b.z, dx, dz);
    this.game.world?.scars?.ground?.(b.x, b.z, 0.8 + 0.4 * (b.weight ?? 1));
    return true;
  }

  /**
   * Every frame while it is held (after the rig): the grip point at (x, y, z). Rooted, the piece stands
   * where it stood and shudders as the jaws tug. Free, its tilt swings toward `tilt` (rad, + = the
   * top toward heading `yaw`) as a stiff pendulum driven by the jaws' own acceleration (a jerk forward
   * swings the top back); `stiff` scales the jaws' hold (the whip: tighter).
   */
  carry(dt, x, y, z, tilt = 0, yaw = 0, stiff = 1) {
    const W = this.W, h = this.hold, b = h.piece;
    if (!b) return;
    if (!W || b.state !== HELD || !Number.isFinite(x + y + z + tilt + yaw + stiff)) {
      h.piece = null;
      return;
    }
    const dtc = clamp(dt, 0, 0.05);
    // the jaws' velocity along the heading (for the swing's drive), finite-differenced
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let acc = 0;
    if (h.jv && dtc > 1e-5) {
      const vx = (x - h.jx) / dtc, vz = (z - h.jz) / dtc;
      acc = ((vx - h.jvx) * sy + (vz - h.jvz) * cy) / dtc;
      h.jvx = vx;
      h.jvz = vz;
    } else {
      h.jvx = h.jvz = 0;
    }
    h.jv = true;
    h.jx = x;
    h.jy = y;
    h.jz = z;
    h.yaw = yaw;
    if (h.rooted) {
      // it holds: the trunk shudders toward the jaws and back (the tug against the roots)
      h.sh += dtc * 31;
      const a = Math.atan2(x - b.x, z - b.z);
      const shk = J.shudder * (0.5 + 0.5 * Math.sin(h.sh)) * Math.min(1, b.h / 4);
      h.th = shk;
      h.ax = Math.sin(a) * Math.sin(shk);
      h.ay = Math.cos(shk);
      h.az = Math.cos(a) * Math.sin(shk);
      h.bx = b.x;
      h.by = 0;
      h.bz = b.z;
      W.carry(b, h.bx, 0, h.bz, shk, a);
      TFX.catchLight(this.d.fx, b.x, 0, b.z, h.ax, h.ay, h.az, b, 0.7);
      return;
    }
    // the swing: a damped spring toward the asked tilt, pushed by the jaws' acceleration
    const k = SW.k * stiff, c = SW.c * Math.sqrt(stiff);
    const drv = clamp(acc, -400, 400) * SW.drive;
    h.w += (k * (tilt - h.th) - c * h.w - drv) * dtc;
    h.w = clamp(h.w, -30, 30);
    h.th += h.w * dtc;
    const st = Math.sin(h.th);
    h.ax = sy * st;
    h.ay = Math.cos(h.th);
    h.az = cy * st;
    h.blend *= Math.exp(-J.blend * dtc);
    h.bx = x - h.ax * h.grip + h.ox * h.blend;
    h.by = y - h.ay * h.grip + h.oy * h.blend;
    h.bz = z - h.az * h.grip + h.oz * h.blend;
    W.carry(b, h.bx, h.by, h.bz, h.th, yaw);
    TFX.catchLight(this.d.fx, h.bx, h.by, h.bz, h.ax, h.ay, h.az, b, h.fire > 0 ? 0 : 1);
    // the throat's glow on it: a warm light rides the piece in the jaws (a dark trunk on dark grass
    // reads at the game camera only lit), and flies with it
    const fx = this.d.fx;
    const mx = h.bx + h.ax * b.h * 0.45, my = h.by + h.ay * b.h * 0.45, mz = h.bz + h.az * b.h * 0.45;
    if (!h.light) h.light = fx._light({ x: mx, y: my, z: mz, color: [1, 0.5, 0.2], intensity: J.glow, radius: 4 + b.h * 0.4, fadeIn: 0.1, fade: 0.3, flicker: 0.25 });
    h.light?.set?.(mx, my, mz);
    // earth falls from its torn foot, and a tree sheds leaves and bark along its length
    h.dirt += dtc * 46;
    let n = Math.min(5, Math.floor(h.dirt));
    h.dirt -= n;
    while (n-- > 0) {
      const o = fx._rec(h.bx + rand(-0.5, 0.5) * b.r * 2, h.by + rand(-0.1, 0.5), h.bz + rand(-0.5, 0.5) * b.r * 2, rand(0.5, 0.9), rand(0.28, 0.42), 0.12, ".,:'");
      o.vx = rand(-0.6, 0.6);
      o.vy = rand(-1, 0.5);
      o.vz = rand(-0.6, 0.6);
      o.gravity = -14;
      o.drag = 0.4;
      fx._col(EARTH_LIT, 1, PALE_DIM, 1);
      fx._spawn(fx.alpha, o);
    }
    if (b.h >= BREAK.topple.minH) TFX.trail(fx, h.shed, dtc, h.bx, h.by, h.bz, h.ax, h.ay, h.az, b, 0, 0, 0);
  }

  /** The held piece burns (k 0..1: how far the fire has run up it). */
  blaze(dt, k) {
    const h = this.hold, b = h.piece;
    if (!b || !(k > 0)) return;
    h.fire = k;
    TFX.burnTrunk(this.d.fx, h.flame, dt, h.bx, h.by, h.bz, h.ax, h.ay, h.az, b, k);
    const fx = this.d.fx;
    if (!h.light) h.light = fx._light({ x: h.bx, y: h.by + 2, z: h.bz, color: [1, 0.5, 0.16], intensity: 3.6, radius: 12, fadeIn: 0.2, fade: 0.4, flicker: 0.5 });
    h.light?.set?.(h.bx + h.ax * b.h * 0.5, h.by + h.ay * b.h * 0.5, h.bz + h.az * b.h * 0.5);
  }

  /** An interrupted hold: the piece falls where it is and comes apart (no blow). */
  drop() {
    const h = this.hold, b = h.piece;
    h.piece = null;
    h.rooted = false;
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
      return out.set(s.cx, Math.max(0.6, s.cy), s.cz);
    }
    return out.copy(this.d.rig.pt.mouth);
  }

  // ------------------------------------------------------------------ the piece in the air
  _shot() {
    for (const s of this.shots) if (!s.on) return s;
    return null;
  }

  /**
   * The held piece leaves the jaws for (tx, tz): its centre flies a flat, fast arc (the world's
   * gravity) and it tumbles on about the throw's cross axis at the swing it had in the jaws (at least
   * spec.spin). It is flown here, frame by frame (the world's piece stays HELD in the air: carry), and
   * handed back to the world where it lands. `a` / `b`: the action and its tell beat (the flash
   * still comes if the action is cut short). Returns the flight time, 0 = not thrown.
   */
  lob(tx, tz, spec, attack, a = null, b = null, burning = false) {
    const W = this.W, h = this.hold, piece = h.piece, s = this._shot();
    if (!W || !piece || h.rooted || !s || !Number.isFinite(tx + tz)) return 0;
    const tall = piece.h >= BREAK.topple.minH;
    // its centre: halfway up a boulder, about the middle of a tree's length
    const hc = tall ? piece.h * 0.45 : piece.h * 0.5;
    const cx = h.bx + h.ax * hc, cy = h.by + h.ay * hc, cz = h.bz + h.az * hc;
    const dist = Math.hypot(tx - cx, tz - cz);
    const T = clamp((spec.flightBase ?? 0.22) + dist / spec.flightPer, spec.flight[0], spec.flight[1]);
    const yLand = tall ? 0.9 : Math.max(0.4, piece.h * 0.5);
    s.on = true;
    s.piece = piece;
    s.mode = 0;
    s.attack = attack;
    s.spec = spec;
    s.action = a;
    s.beat = b;
    s.t = 0;
    s.T = T;
    s.burning = !!burning;
    s.hitDone = false;
    s.src = typeof W.swing === 'function' ? W.swing() : -1;
    s.x0 = s.cx = cx;
    s.y0 = s.cy = s.pcy = cy;
    s.z0 = s.cz = cz;
    s.vx = (tx - cx) / T;
    s.vz = (tz - cz) / T;
    s.vy = (yLand - cy + 0.5 * G * T * T) / T;
    s.tx = tx;
    s.tz = tz;
    const l = dist > 1e-3 ? dist : 1;
    s.dx = (tx - cx) / l;
    s.dz = (tz - cz) / l;
    s.yaw = Math.atan2(s.dx, s.dz);
    s.r = spec.radius;
    s.hc = hc;
    // the tilt it leaves the jaws with, in the throw's own plane, and the swing it carries on
    const rel = Math.cos(angleDiff(h.yaw, s.yaw));
    s.ang = h.th * rel;
    const min = (spec.spin ?? 8) * (tall ? 1 : 1.4);
    s.w = clamp(h.w * rel, min, min * 1.6);
    s.fire.acc = s.fire.emb = 0;
    s.grit.acc = 0;
    s.light = h.light; // (a firebrand's light flies with it)
    h.light = null;
    h.piece = null;
    this._last = s;
    this._place(s);
    return T;
  }

  /** Where the flying piece is at s.t: its centre on the arc, its axis tumbling, its foot below. */
  _place(s) {
    const t = Math.min(s.t, s.T), b = s.piece;
    s.cx = s.x0 + s.vx * t;
    s.cy = s.y0 + s.vy * t - 0.5 * G * t * t;
    s.cz = s.z0 + s.vz * t;
    const ang = s.ang + s.w * t, sa = Math.sin(ang);
    const ax = s.dx * sa, ay = Math.cos(ang), az = s.dz * sa;
    this.W?.carry?.(b, s.cx - ax * s.hc, s.cy - ay * s.hc, s.cz - az * s.hc, ang, s.yaw);
    return ang;
  }

  /**
   * `piece` is batted along the ground: from where it stands along (dx, dz) for `len` m at `speed`;
   * `hitS` = how far along the line the hero stood. It bursts up off the ground and skims; it is
   * carried here frame by frame (the first cover on its way stops it: world.stop), tests the hero as
   * it passes and comes apart at the end.
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
    s.hop = spec.hop ?? 1;
    s.ang = 0;
    s.x = piece.x;
    s.y = 0.2;
    s.z = piece.z;
    s.r = piece.r;
    s.grit.acc = 0;
    s.light = null;
    this._last = s;
    TFX.batBurst(this.d.fx, piece.x, piece.z, piece.r, dx, dz, piece.M);
    this.game.world?.scars?.ground?.(piece.x, piece.z, 0.7, dx, dz);
    return true;
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
    // the action that threw it, while it still runs and still holds this beat (a blue flare blow's
    // parry is a parry MOMENT: hitPlayer reads it off the action's current beat)
    const a = s.action && d.brain?.action === s.action && s.action.cur === s.beat ? s.action : null;
    return d.hitPlayer(o, a);
  }

  /** It lands at (x, z): the blow, the world takes the blast, the ground is torn; it skids on and comes apart. */
  _impact(s, x, z) {
    const d = this.d, g = this.game, fx = d.fx, spec = s.spec, b = s.piece;
    const p = g.player;
    const pp = p?.position;
    if (!s.hitDone && pp && Math.hypot(pp.x - x, pp.z - z) <= spec.radius + (p.radius ?? 0.45)) {
      s.hitDone = true;
      this._blow(s, x, z);
    }
    // the world takes it: the blast on what stands round it, the floor cracked, the grass torn
    const lo = this._land;
    lo.dx = s.dx;
    lo.dz = s.dz;
    lo.src = typeof this.W?.swing === 'function' ? this.W.swing() : -1;
    lo.fire = 0;
    g.world?.impact?.(x, z, spec.radius, spec.power, lo);
    g.world?.gust?.(x, z, 1.4, spec.radius + 5);
    g.shake?.(clamp(0.3 + 0.12 * (b?.weight ?? 1), 0.3, 0.6));
    TFX.landing(fx, x, z, spec.radius, s.dx, s.dz, b, s.burning);
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
    } else s.light?.kill?.();
    // it carries on: one skid along the way it flew, tumbling, and comes apart there (the world's
    // fall: its crumble, its scar, its rubble). Its tumble goes on from where it is
    const W = this.W, o = this._throw;
    if (b && b.state === HELD && W) {
      o.time = spec.skidTime ?? 0.3;
      o.power = 0.4;
      o.radius = 1.6;
      o.onLand = null;
      const sk = spec.skid ?? 2;
      // (its foot out of the ground first: a tumbling trunk may have it below, and the world's fall
      // ends the moment the foot is under)
      if (b.py < 0.2) W.carry(b, b.px, 0.2, b.pz, s.ang + s.w * s.T, s.yaw);
      if (W.throwTo(b, x + s.dx * sk, z + s.dz * sk, o) && Number.isFinite(b.ang)) b.ang = s.ang + s.w * s.T;
    }
    s.on = false;
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

  /** The tug: grit jumps round the rooted piece's foot (k 0..1 of the strain). */
  strain(dt, k) {
    const h = this.hold;
    if (h.piece && h.rooted) TFX.strain(this.d.fx, h.strain, dt, h.piece, k);
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
    p.smoke = 0;
    p.heatT = 0;
    p.spec = spec;
    p.attack = attack;
    p.light = this.d.fx._light({ x, y: 1.4, z, color: [1, 0.45, 0.12], intensity: 3.4, radius: 10, life: P.time + 0.4, fade: 0.9, flicker: 0.55 });
  }

  _burn(p, dt) {
    const d = this.d, g = this.game, P = p.spec.pyre;
    p.t += dt;
    const u = p.t / p.T; // 0 → 1 as it burns down
    if (u >= 1) {
      p.on = false;
      p.light = null;
      return;
    }
    // heat in the fire field (ADR-113): the wreck burns as one body of flame, dying down
    TFX.pyre(d.fx, p, dt, p.x, p.z, p.r, 1 - u * u);
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

  /** The tell's flash, if the action that threw it is gone: flashLead before the piece arrives (on the piece). */
  _cue(s, left) {
    const lead = TUNING.flashLead;
    if (left > lead + 1e-6) return false;
    const b = s.beat;
    if (b && !b.flashed) {
      b.flashed = true;
      // the cue belongs to the flying piece: its flare, and not the wyrm's body spike (flashTell
      // arms that for any red blow; it is put back as it was)
      const d = this.d, w = d._warnAt, wa = d._warnAction;
      d.flashTell(s.action, b);
      d._warnAt = w;
      d._warnAction = wa;
    }
    return true;
  }

  _arc(s, dt) {
    const d = this.d, g = this.game, W = this.W, fx = d.fx, b = s.piece;
    if (!W || !b || b.state !== HELD) {
      // the world took it back under it (a reset): nothing more to fly
      s.on = false;
      s.light?.kill?.();
      s.light = null;
      s.piece = null;
      return;
    }
    const px = s.cx, pz = s.cz;
    s.t += dt;
    this._cue(s, s.T - s.t);
    const ang = this._place(s);
    const sa = Math.sin(ang), ax = s.dx * sa, ay = Math.cos(ang), az = s.dz * sa;
    const fx0 = s.cx - ax * s.hc, fy0 = s.cy - ay * s.hc, fz0 = s.cz - az * s.hc;
    // what stands in its path is smashed (it flies on): a segment of this frame's travel, as wide as
    // the piece; a piece flying over something low passes over it
    const sw = this._sweep;
    sw.dx = s.dx;
    sw.dz = s.dz;
    sw.y = Math.max(0.3, s.cy - (b.h >= BREAK.topple.minH ? b.h * 0.4 : b.r));
    sw.src = s.src;
    const n = W.sweep?.(px, pz, s.cx, s.cz, Math.max(0.6, b.r + 0.4), s.spec.smash ?? 1, sw) ?? 0;
    if (n > 0) {
      this.smashed += n;
      g.shake?.(0.15);
      TFX.smashOn(fx, s.cx, s.cy, s.cz, s.dx, s.dz, null);
      if (s.burning && s.spec.trailIgnite) g.world?.ignite?.(s.cx, s.cz, b.r + 1.2, s.spec.trailIgnite, false);
    }
    s.light?.set?.(s.cx, s.cy, s.cz);
    if (s.burning) TFX.burnTrunk(fx, s.fire, dt, fx0, fy0, fz0, ax, ay, az, b, 1, s.vx, s.vz);
    else {
      TFX.trail(fx, s.grit, dt, fx0, fy0, fz0, ax, ay, az, b, s.vx, s.vy - G * s.t, s.vz);
      TFX.catchLight(fx, fx0, fy0, fz0, ax, ay, az, b, 1);
      // the wake: a streak of dust left hanging along its path (the throw is read in the half second it flies)
      TFX.streak(fx, px, s.pcy ?? s.cy, pz, s.cx, s.cy, s.cz, b);
    }
    s.pcy = s.cy;
    if (s.t >= s.T) this._impact(s, s.tx, s.tz);
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
    // it bursts up off the ground (the tail's blow lifts it), drops into a low skim, a shallow hop on
    const u = Math.min(1, s.s / Math.max(1, s.len));
    s.y = 0.25 + s.hop * Math.exp(-s.t * 7) * Math.min(1, s.t * 14) + 0.4 * Math.sin(Math.PI * u);
    s.ang += dt * 11;
    W.carry(b, s.x, s.y, s.z, s.ang, Math.atan2(s.dx, s.dz));
    // the flash, if the lash's action is gone (on the boulder; nothing is drawn on the ground)
    if (!s.hitDone) this._cue(s, (s.hitS - s.s) / s.speed);
    // its wake: dust torn off the ground, grit
    s.grit.acc += dt * 60;
    let n = Math.min(6, Math.floor(s.grit.acc));
    s.grit.acc -= n;
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

  /** The fight's reset (and a broken update): the held piece falls, nothing is in the air, no wreck burns. */
  reset() {
    this.drop();
    const W = this.W;
    for (const s of this.shots) {
      if (s.on && s.piece?.state === HELD) W?.drop?.(s.piece);
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
    this._phase = this.d.phase ?? 1;
  }
}
