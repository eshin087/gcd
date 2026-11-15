import * as THREE from 'three';
import { TUNING, SCALE } from './tuning.js';
import { TERRAIN } from './tuningTerrain.js';
import { clamp, lerp, smoothstep, easeInOutSine, angleDiff } from '../../core/math.js';
import { beat, perPhase } from './attacks.js';
import { jawsPiece, tailPiece } from './terrain.js';
import { STATE } from '../../world/destructibles.js';
import { BREAK } from '../../world/breakTuning.js';

// Terrain moves (ADR-110; numbers in tuningTerrain.js = TUNING.attacks.*; the same action shape as
// attacks.js: phases / beats / weight / start / enter / update / hit / end, driven by the runner in
// ai.js; spread into ATTACKS there). The wyrm uses what stands in the clearing:
//   hurl       'Uproot and hurl'  it bites into a tree or a boulder, tears it out and throws it: one
//                                 red blow where it lands (the landing is marked from the bite on)
//   tailBat    'Tail bat'         its back to a boulder, one lash of the tail: the boulder skims
//                                 the ground at the hero (blue; cover stops it)
//   fireBrand  'Firebrand'        phase 2: a tree in the jaws, lit with a breath, thrown burning;
//                                 its wreck burns on where it lands
// A move is only picked when a piece it can use is in reach (terrain.js jawsPiece / tailPiece): its
// weight is 0 otherwise. Forced with nothing in reach (the Lab, Training on a bare stage) it looks
// round, snorts and ends: no tell, no blow.
// The piece is the world's (world/destructibles.js): taken, carried and thrown through
// dragon.terrain, which also deals the blow when it lands.

const T = TUNING.attacks;
const S = SCALE;
const J = TERRAIN.jaws;
const REST_SPREAD = TUNING.rest.spread;
const V = () => new THREE.Vector3();
const _v = V(), _g = V();
const wind = (d, base) => base * (d.tScale ?? 1);
const ARENA = 31; // m round the centre a throw may be aimed at (the clearing is 30)

/** The plan the picker wrote for the action that is starting (phases() runs right before start()). */
const _jaws = { piece: null, time: 0, travel: 0 };
const _tail = { piece: null, dir: 1 };

// ------------------------------------------------------------------ nothing in reach
const SEARCH = 1.0;
/** Forced with no piece in reach: it casts about, snorts, and that is all. */
function searchPose(d, a, dt) {
  const pose = d.pose, pt = d.rig.pt;
  const sw = Math.sin(a.t * 6.2) * (1 - a.k);
  pose.head = d.rootPt(pose.headTarget, sw * 2.4, 3.3, 4.3);
  pose.headRate = 6;
  d.rootPt(pose.look, sw * 9, 0.5, 9);
  pose.lookDown = 0.7;
  pose.jaw = 0.3;
  pose.lower = 0.12;
  if (!a.snorted && a.t > 0.3) {
    a.snorted = true;
    d.fx.snort(pt.nostrils, pt.headFwd, 1.2);
  }
}

// ------------------------------------------------------------------ the jaws: take, raise, throw
/** s from now until the piece leaves the jaws (the running action `a`, spec X). */
function untilRelease(a, X) {
  let t = -a.t;
  for (let i = a.i; i < a.list.length; i++) {
    if (a.list[i][0] === 'active') return t + a.list[i][1] * X.release;
    t += a.list[i][1];
  }
  return 0;
}
const flightOf = (X, dist) => clamp(0.55 + dist / X.flightPer, X.flight[0], X.flight[1]);

/** Called off: the piece is gone (broken, burned, taken) or out of the jaws' reach. No blow follows. */
function abort(a) {
  a.aborted = true;
  a.finish = true;
  for (const b of a.beats) b.flashed = true; // (a tell that was sent gets no flash: nothing lands)
}

/**
 * A move that takes a piece in the jaws and throws it. `wood`: a tree only; a spec with `kindle`
 * lights it first (the firebrand).
 */
function makeThrow(name, wood) {
  const X = T[name];
  const burning = X.kindle > 0;
  return {
    name,
    cooldown: X.cooldown,
    phases(d) {
      _jaws.piece = null;
      if (!jawsPiece(d, wood, _jaws, false)) jawsPiece(d, wood, _jaws, true);
      if (!_jaws.piece) return [['search', SEARCH]];
      const list = [['fetch', Math.max(0.06, _jaws.time)], ['windup', wind(d, X.windup)], ['lift', wind(d, X.lift)]];
      if (burning) list.push(['kindle', X.kindle]);
      // the recovery outlasts the flight: it watches the piece land (and the flash comes inside the action)
      list.push(['aim', wind(d, X.aim)], ['active', X.active], ['recovery', Math.max(wind(d, X.recovery), X.flight[1] + 0.2)]);
      return list;
    },
    // one red beat: the piece landing. It starts when the jaws go for the piece (the run to it tells
    // nothing: no blow can come of it yet) and is re-timed when the piece leaves the jaws
    beats(d, a) {
      if (a.none) return [];
      let at = 0, t = 0;
      for (const e of a.list) {
        if (e[0] === 'fetch') at = e[1];
        else if (e[0] === 'active') {
          t += e[1] * X.release;
          break;
        } else t += e[1];
      }
      return [beat(name, at, t + flightOf(X, d.sense.dist), X, 'piece')];
    },
    weight: (d, s) => (s.dist >= X.minDist && s.dist <= X.maxDist && jawsPiece(d, wood, null, false) ? perPhase(X.weight, d.phase) * (s.dist < X.close ? X.closeK : 1) : 0),
    start(d, a) {
      a.none = a.list[0][0] === 'search';
      a.piece = a.none ? null : _jaws.piece;
      a.tall = !!a.piece && a.piece.h >= BREAK.topple.minH;
      a.held = false;
      a.thrown = false;
      a.aborted = false;
      a.tilt = 0;
      a.fire = 0;
      a.breath = false;
      a.span = 1;
      const p = d.sense.pos;
      a.tx = a.lx = p.x;
      a.tz = a.lz = p.z;
      a.head0 = V();
    },
    enter(d, a, phase) {
      if (a.none || a.aborted) return;
      const pt = d.rig.pt, P = a.piece, g = d.game;
      if (phase === 'windup') {
        // the run may have ended early: the tell starts now
        const b = a.beats[0];
        if (b && !b.told) b.at = a.T;
        const dist = Math.hypot(P.x - d.position.x, P.z - d.position.z);
        const ang = Math.abs(angleDiff(d.yaw, Math.atan2(P.x - d.position.x, P.z - d.position.z)));
        if (P.state !== STATE.INTACT || dist > J.far + 1.4 || dist < J.near - 1.6 || ang > 1.0) {
          a.beats.length = 0;
          abort(a);
        }
      } else if (phase === 'lift') {
        const m = pt.mouth;
        if (!d.terrain.grab(P, m.x, m.y, m.z)) {
          abort(a);
          return;
        }
        a.held = true;
        a.head0.copy(d.rig.headPos);
        const b = a.beats[0];
        a.span = b ? Math.max(0.5, b.at + b.impactIn - a.T) : 2;
        d.emit('dragon:bite');
        g.shake?.(0.22);
        d.fx.dustRing(P.x, P.z, P.r + 0.5, 18, 0.5);
      } else if (phase === 'kindle') {
        a.breath = true;
        d.emit('dragon:breathStart');
        d.emit('dragon:spell', { name, x: d.position.x, z: d.position.z });
      } else if (phase === 'aim') {
        this.stopBreath(d, a);
      } else if (phase === 'active') {
        // the throw is committed: the mark stays where it is
        a.lx = a.tx;
        a.lz = a.tz;
        if (!burning) d.emit('dragon:spell', { name, x: d.position.x, z: d.position.z });
      }
    },
    stopBreath(d, a) {
      if (!a.breath) return;
      a.breath = false;
      d.emit('dragon:breathEnd');
    },
    /** The landing spot follows the (led) hero until the throw; drawn from the bite on. */
    track(d, a, dt) {
      const s = d.sense, b = a.beats[0];
      const fl = flightOf(X, s.dist);
      let wx = s.pos.x + s.vel.x * X.lead * fl, wz = s.pos.z + s.vel.z * X.lead * fl;
      const r = Math.hypot(wx, wz);
      if (r > ARENA) {
        wx *= ARENA / r;
        wz *= ARENA / r;
      }
      if (a.phase !== 'active' && a.phase !== 'recovery') {
        const k = 1 - Math.exp(-X.track * dt);
        a.tx += (wx - a.tx) * k;
        a.tz += (wz - a.tz) * k;
      }
      if (a.thrown || !b) return; // (in the air, the piece's own mark is drawn by dragon.terrain)
      const left = b.at + b.impactIn - a.T;
      d.terrain.mark(dt, a.tx, a.tz, X.radius, clamp(1 - left / a.span, 0, 1), b.flashed);
    },
    update(d, a, dt) {
      const pose = d.pose, s = d.sense, pt = d.rig.pt, k = a.k, P = a.piece;
      if (a.none) {
        searchPose(d, a, dt);
        return;
      }
      if (a.aborted) return;
      const ph = a.phase;
      if (ph === 'fetch') {
        // it turns to the piece and goes for it: a short run, the head low and reaching
        const dx = P.x - d.position.x, dz = P.z - d.position.z;
        const dist = Math.hypot(dx, dz), yawP = Math.atan2(dx, dz);
        const ang = Math.abs(angleDiff(d.yaw, yawP));
        d.turnToward(yawP, Math.max(d.turnRate, J.turn), dt);
        const left = Math.max(0.08, a.dur - a.t);
        if (ang < 0.75) {
          if (dist > J.stand + 0.35) d.moveForward(Math.min(J.fetchSpeed, Math.max(2.5, (dist - J.stand) / left)), dt);
          else if (dist < J.near + 0.2) {
            d.moveForward(-Math.min(4.5, Math.max(1.5, (J.near + 0.7 - dist) / left)), dt);
            pose.speed = Math.max(pose.speed, 2.5);
          }
        }
        pose.head = d.rootPt(pose.headTarget, 0, 3.5, 4.2);
        pose.headRate = 5;
        pose.look.set(P.x, Math.min(2, P.h * 0.4), P.z);
        pose.lookDown = 0.8;
        pose.jaw = 0.45;
        pose.lower = 0.12;
        pose.spread[0] = pose.spread[1] = TUNING.rest.walkSpread;
        d.terrain.stir(dt, P);
        // there already: the bite does not wait for the plan's time
        if (a.t > 0.1 && ang < 0.22 && dist <= J.far - 0.5 && dist >= J.near) a.t = a.dur;
        return;
      }
      if (ph === 'windup') {
        // the head goes down to it, the jaws wide; they close on it as the windup ends. The head is
        // steered by where the MOUTH is against the grip point (the neck does the rest)
        const dx = P.x - d.position.x, dz = P.z - d.position.z, dl = Math.hypot(dx, dz) || 1;
        d.turnToward(Math.atan2(dx, dz), Math.max(d.turnRate, J.turn), dt);
        const gy = a.tall ? 1.5 : Math.max(0.5, P.h * 0.6);
        _g.set(P.x, gy, P.z);
        _v.subVectors(_g, pt.mouth);
        pose.head = pose.headTarget.copy(d.rig.headPos).add(_v);
        pose.head.y = Math.max(0.55 * S, pose.head.y);
        pose.headRate = 4 + 10 * k;
        pose.look.set(P.x + (dx / dl) * 5, gy - 2.5, P.z + (dz / dl) * 5);
        pose.lookDown = 1.2;
        pose.headExact = k > 0.6;
        pose.jaw = k < 0.86 ? 0.55 + 0.45 * smoothstep(0, 0.5, k) : 0.3;
        pose.jawRate = k < 0.86 ? 10 : 30;
        pose.lower = 0.1 + 0.2 * k;
        pose.pitch = 0.12 * k;
        pose.stanceF = 0.25;
        pose.restep = 1;
        pose.spread[0] = pose.spread[1] = 0.6;
        pose.spreadRate = 5;
        d.terrain.stir(dt, P);
        return;
      }
      // from here the piece is in the jaws: the body turns to the hero in time for the throw
      this.track(d, a, dt);
      const until = untilRelease(a, X);
      if (!a.thrown) {
        const need = Math.abs(s.ang) / Math.max(0.15, until - 0.15);
        d.turnToward(s.yawTo, clamp(Math.max(d.turnRate, need), 0, 5.5), dt);
      }
      pose.stanceF = 0.2;
      pose.restep = 1;
      const lean = a.tall ? 1 : 0; // a boulder sits in the jaws: no lean to show
      if (ph === 'lift') {
        // torn out and raised: the head comes up and back over the shoulders, the wings flare
        const e = easeInOutSine(k);
        d.rootPt(_v, 0, 5.0, 3.3);
        pose.head = pose.headTarget.lerpVectors(a.head0, _v, e);
        pose.headRate = 9;
        d.rootPt(pose.look, 0, 6, 14);
        pose.jaw = 0.3;
        pose.pitch = 0.1 * (1 - e) - 0.08 * e;
        pose.lower = 0.25 * (1 - e);
        pose.spread[0] = pose.spread[1] = 0.55 + 0.25 * e;
        pose.spreadRate = 5;
        // it comes out of the ground upright and swings back over the shoulder: a tree that leans is a tree held
        a.tilt = (-X.cock * 0.7 * smoothstep(0.25, 1, k) + 0.1 * Math.sin(a.t * 9) * (1 - e)) * lean;
      } else if (ph === 'kindle') {
        // held out ahead and up, the crown forward: a breath runs up the trunk
        pose.head = d.rootPt(pose.headTarget, 0, 4.8, 4.0);
        pose.headRate = 5;
        d.rootPt(pose.look, 0, 6, 14);
        pose.jaw = 0.5;
        pose.swell = 1;
        pose.pitch = -0.06;
        pose.spread[0] = pose.spread[1] = 0.9;
        pose.spreadRate = 4;
        a.tilt += (0.4 * lean - a.tilt) * (1 - Math.exp(-7 * dt));
        a.fire = smoothstep(0.05, 0.85, k);
        d.throat = 0.5 + 0.5 * k;
        d.fx.mouthEmbers(dt, pt.mouth, 60, pt.headFwd, 1);
      } else if (ph === 'aim') {
        // cocked back: the head high over the withers, the piece leaning away from the hero
        pose.head = d.rootPt(pose.headTarget, 0, 5.3, 2.2);
        pose.headRate = 6;
        d.rootPt(pose.look, 0, 6.5, 14);
        pose.jaw = 0.32;
        pose.pitch = -0.14 * smoothstep(0, 0.7, k);
        pose.lower = -0.08;
        pose.swell = k;
        pose.spread[0] = pose.spread[1] = 0.85;
        pose.spreadRate = 4;
        a.tilt += ((-X.cock + 0.06 * Math.sin(a.t * 11)) * lean - a.tilt) * (1 - Math.exp(-9 * dt));
        if (burning) d.throat = 0.6;
      } else if (ph === 'active') {
        // the whip: head and neck snap forward and down, the jaws let go on the way
        const e = clamp(k / X.release, 0, 1);
        pose.head = d.rootPt(pose.headTarget, 0, lerp(5.3, 3.9, e), lerp(2.2, 5.3, e));
        pose.headRate = 26;
        pose.headExact = true;
        pose.look.set(a.lx, 2, a.lz);
        pose.lookDown = 0.9;
        pose.jaw = a.thrown ? 1 : 0.32;
        pose.jawRate = 30;
        pose.pitch = lerp(-0.14, 0.16, e);
        pose.lower = lerp(-0.08, 0.2, e);
        pose.bodyRate = 12;
        pose.spread[0] = pose.spread[1] = lerp(0.85, 0.4, e);
        pose.spreadRate = 16;
        if (!a.thrown) a.tilt = -X.cock * lean * (1 - e) * (1 - e);
      } else {
        // the follow-through: the head low and out, the jaws open (a roar after it); then it settles
        const hold = k < 0.3;
        if (hold) pose.head = d.rootPt(pose.headTarget, 0, 3.6, 5.3);
        pose.headRate = hold ? 8 : 3;
        pose.look.set(a.lx, 1, a.lz);
        pose.lookDown = 0.6;
        pose.jaw = hold ? 0.9 : 0.3;
        pose.pitch = 0.16 * (1 - smoothstep(0, 0.5, k));
        pose.lower = 0.2 * (1 - smoothstep(0, 0.5, k));
        pose.spread[0] = pose.spread[1] = k < 0.35 ? 0.4 : REST_SPREAD;
        pose.spreadRate = 3;
        d.throat = 0;
      }
    },
    hit(d, a, dt) {
      if (!a.held || a.thrown || a.aborted) return;
      const m = d.rig.pt.mouth, Tn = d.terrain;
      const live = a.phase === 'active' || a.phase === 'recovery';
      const tx = live ? a.lx : a.tx, tz = live ? a.lz : a.tz;
      Tn.carry(dt, m.x, m.y, m.z, a.tilt, Math.atan2(tx - m.x, tz - m.z));
      if (burning && a.fire > 0) Tn.blaze(dt, a.fire);
      if (!Tn.hold.piece) {
        // the world took it back (a reset under the hold)
        abort(a);
        return;
      }
      if (a.phase === 'active' && a.k >= X.release) {
        const b = a.beats[0];
        const fl = Tn.lob(a.lx, a.lz, X, name, a, b, burning);
        a.thrown = true;
        if (fl > 0) {
          if (b && !b.flashed) b.impactIn = Math.max(0.05, a.T - b.at + fl);
          d.game.shake?.(0.18);
          d.game.world?.gust?.(m.x, m.z, 1.2, 9 * S);
        } else {
          Tn.drop();
          abort(a);
        }
      }
    },
    end(d, a) {
      this.stopBreath(d, a);
      d.throat = 0;
      // cut short with the piece still in the jaws (a stagger, a break, a plunge, death): it falls
      if (a.held && !a.thrown) d.terrain.drop();
    },
  };
}

const hurl = makeThrow('hurl', false);
const fireBrand = makeThrow('fireBrand', true);

// ------------------------------------------------------------------ tail bat
const B = T.tailBat;
/** The tail's bearing round the root at the boulder's distance (the chain point nearest that far out). */
function tailBearing(d, R) {
  const ch = d.rig.tail, px = d.position.x, pz = d.position.z;
  let bi = ch.n, bd = Infinity;
  for (let i = 3; i <= ch.n; i++) {
    const e = Math.abs(Math.hypot(ch.p[i].x - px, ch.p[i].z - pz) - R);
    if (e < bd) {
      bd = e;
      bi = i;
    }
  }
  return Math.atan2(ch.p[bi].x - px, ch.p[bi].z - pz);
}

const tailBat = {
  name: 'tailBat',
  cooldown: B.cooldown,
  faceAway: true, // (the Lab's quick turn: its back to the hero, where the pivot usually ends)
  phases(d) {
    _tail.piece = null;
    if (!tailPiece(d, _tail, false)) tailPiece(d, _tail, true);
    if (!_tail.piece) return [['search', SEARCH]];
    return [['windup', Math.max(wind(d, B.windup), B.minWindup)], ['active', B.active], ['recovery', wind(d, B.recovery)]];
  },
  // one blue beat: the boulder reaching the hero (re-timed when the lash starts and when the tail
  // meets the boulder)
  beats(d, a) {
    if (a.none) return [];
    const P = a.piece, p = d.sense.pos;
    return [beat('tailBat', 0, a.list[0][1] + B.impact + Math.max(1, Math.hypot(p.x - P.x, p.z - P.z) - B.width) / B.cruise, B, 'piece')];
  },
  weight: (d) => (tailPiece(d, null, false) ? perPhase(B.weight, d.phase) : 0),
  start(d, a) {
    a.none = a.list[0][0] === 'search';
    a.piece = a.none ? null : _tail.piece;
    a.dir = _tail.dir;
    a.batted = false;
    a.yawW = d.yaw;
    a.tailAng = undefined;
    a.ux = 0;
    a.uz = 1;
    a.len = 10;
    a.hitS = 5;
    a.reach = 4;
    if (a.piece) this.aim(d, a);
  },
  /** The boulder's line: from it through the hero and `over` m past him (not out of the clearing's rim). */
  aim(d, a) {
    const P = a.piece, p = d.sense.pos;
    const lx = p.x - P.x, lz = p.z - P.z, l = Math.hypot(lx, lz);
    if (l < 0.5) return;
    a.ux = lx / l;
    a.uz = lz / l;
    a.hitS = l;
    a.reach = Math.max(1, l - B.width); // how far it flies before its edge meets him
    let len = l + B.over;
    // not past the trees' edge: where the line leaves the circle of radius ARENA + 4
    const R = ARENA + 4, pd = P.x * a.ux + P.z * a.uz, c = P.x * P.x + P.z * P.z - R * R;
    const disc = pd * pd - c;
    if (disc > 0) len = Math.min(len, Math.max(l + 1, -pd + Math.sqrt(disc)));
    a.len = len;
  },
  enter(d, a, phase) {
    if (a.none) return;
    if (phase === 'active') {
      a.yawW = d.yaw;
      this.aim(d, a); // the lash is committed: its line is fixed
      const b = a.beats[0];
      if (b && !b.flashed) b.impactIn = Math.max(0.05, a.T - b.at + B.impact + a.reach / B.cruise);
      if (a.piece.state !== STATE.INTACT) abortBat(a);
    }
  },
  update(d, a, dt) {
    const pose = d.pose, P = a.piece, k = a.k;
    if (a.none) {
      searchPose(d, a, dt);
      return;
    }
    if (a.aborted) return;
    const b = a.beats[0];
    const phi = Math.atan2(P.x - d.position.x, P.z - d.position.z);
    pose.tailLegacy = true; // the lash rides the measured chain (as the tail lash's)
    pose.spread[0] = pose.spread[1] = a.phase === 'recovery' && k > 0.4 ? REST_SPREAD : 0;
    pose.spreadRate = 5;
    if (a.phase === 'windup') {
      // the pivot: its back to the boulder, the tail stopping `offset` short of it, coiled low; it
      // looks over its shoulder at the hero (pose.look is his chest)
      this.aim(d, a);
      d.turnToward(phi + Math.PI + a.dir * B.offset, B.pivotRate, dt);
      pose.speed = Math.max(pose.speed, 3.5);
      pose.tailLift = 0;
      pose.tailCurl = a.dir * 0.05;
      pose.tailStiff = 1.6;
      pose.tailWave = 0;
      const e = smoothstep(0.4, 1, k);
      pose.lower = 0.25 * e;
      pose.pitch = 0.1 * e;
      pose.stanceH = 0.35;
      pose.restep = 1;
      pose.lookRate = 6;
      d.terrain.stir(dt, P);
      d.terrain.lane(dt, P.x, P.z, a.ux, a.uz, 1, a.len, B.width, 0.15 + 0.6 * k, false);
    } else if (a.phase === 'active') {
      // the lash: a short, fast spin that carries the tail through the boulder and past it
      d.yaw = a.yawW - a.dir * (B.offset + B.past) * easeInOutSine(k);
      pose.tailLift = 0;
      pose.tailCurl = -a.dir * 0.05;
      pose.tailStiff = 2.8;
      pose.tailWave = 0;
      pose.lower = 0.3;
      pose.pitch = 0.14;
      pose.bodyRate = 10;
      pose.stanceH = 0.35;
      pose.speed = 6;
      if (!a.batted) d.terrain.lane(dt, P.x, P.z, a.ux, a.uz, 1, a.len, B.width, 0.8 + 0.2 * k, !!b?.flashed);
    } else {
      pose.tailLift = k > 0.5 ? 1 : 0;
      pose.lower = 0.3 * (1 - k);
      pose.pitch = 0.14 * (1 - k);
    }
  },
  hit(d, a) {
    if (a.none || a.aborted || a.batted || a.phase !== 'active') return;
    const P = a.piece, g = d.game;
    const R = Math.hypot(P.x - d.position.x, P.z - d.position.z);
    const phi = Math.atan2(P.x - d.position.x, P.z - d.position.z);
    const ang = tailBearing(d, R);
    const prev = a.tailAng ?? ang;
    a.tailAng = ang;
    // the tail crossed the boulder's bearing this frame (or it is as late as the lash allows)
    const r0 = angleDiff(phi, prev), r1 = angleDiff(phi, ang);
    const crossed = (r0 > 0) !== (r1 > 0) && Math.abs(r0) < 1.2 && Math.abs(r1) < 1.2;
    if (!crossed && Math.abs(r1) > 0.1 && a.t < B.impact + 0.07) return;
    a.batted = true;
    // its speed lands it on the hero when the tell said it would
    const b = a.beats[0];
    const left = b ? b.at + b.impactIn - a.T : a.reach / B.cruise;
    const speed = clamp(a.reach / Math.max(0.12, left), B.speed[0], B.speed[1]);
    if (b && !b.flashed) b.impactIn = Math.max(0.05, a.T - b.at + a.reach / speed);
    if (!d.terrain.bat(P, a.ux, a.uz, a.len, a.reach, speed, B, 'tailBat', a, b)) {
      abortBat(a);
      return;
    }
    g.shake?.(0.3);
    g.world?.gust?.(P.x, P.z, 1.3, 8 * S);
    d.fx.dustRing(P.x, P.z, P.r + 0.4, 26, 0.8);
    d.emit('dragon:step', { x: P.x, z: P.z, heavy: true });
    d.emit('dragon:spell', { name: 'tailBat', x: P.x, z: P.z });
  },
};
function abortBat(a) {
  a.aborted = true;
  for (const b of a.beats) b.flashed = true;
}

export const TERRAIN_MOVES = { hurl, tailBat, fireBrand };
