import * as THREE from 'three';
import { TUNING, SCALE } from './tuning.js';
import { TERRAIN } from './tuningTerrain.js';
import { clamp, lerp, smoothstep, easeInOutSine, easeOutBack, angleDiff } from '../../core/math.js';
import { beat, perPhase } from './attacks.js';
import { jawsPiece, tailPiece } from './terrain.js';
import * as TFX from './terrainFx.js';
import { STATE } from '../../world/destructibles.js';
import { BREAK } from '../../world/breakTuning.js';

// Terrain moves (ADR-110, second pass; numbers in tuningTerrain.js = TUNING.attacks.*; the same
// action shape as attacks.js: phases / beats / weight / start / enter / update / hit / end, driven by
// the runner in ai.js; spread into ATTACKS there). The wyrm uses what stands in the clearing:
//   hurl       'Uproot and hurl'  it lunges to a tree or a boulder, a foreleg pins the ground, the
//                                 jaws clamp, a tug that holds, a heave that tears it out, it rocks
//                                 back, the neck coils over the shoulder and whips: the piece flies
//                                 flat and fast, tumbling on with the swing. One red blow where it lands
//   tailBat    'Tail bat'         its back to a boulder, the tail cocked the other way, one lash: the
//                                 boulder bursts off the ground at the hero (blue, a parry moment;
//                                 cover stops it)
//   fireBrand  'Firebrand'        phase 2: the hurl with a breath up the trunk first: thrown burning,
//                                 its wreck burns on where it lands
// NOTHING is drawn on the ground before a piece arrives (the owner: "don't show exactly where the
// terrain will land"): one tell at the start of the move, and the flare on the flying piece flashLead
// s before it lands. The aim is fixed at the release, on where the hero is heading then.
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
const _v = V(), _g = V(), _w = V();
const wind = (d, base) => base * (d.tScale ?? 1);
const ARENA = 31; // m round the centre a throw may be aimed at (the clearing is 30)

/** The plan the picker wrote for the action that is starting (phases() runs right before start()). */
const _jaws = { piece: null, time: 0, travel: 0 };
const _tail = { piece: null, dir: 1 };

/** A point in the THROW's frame (model units x SCALE; x across the throw, z along it) round the root. */
function framePt(d, out, yaw, x, y, z) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return out.set(d.position.x + (x * c + z * s) * S, y * S, d.position.z + (-x * s + z * c) * S);
}

/** Quadratic Bezier between three throw-frame points (model units) → world. */
function frameBezier(d, out, yaw, p0, p1, p2, t) {
  const u = 1 - t;
  return framePt(
    d, out, yaw,
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
  );
}

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

// ------------------------------------------------------------------ the jaws: take, tear, throw
/** s from now until the piece leaves the jaws (the running action `a`, spec X). */
function untilRelease(a, X) {
  let t = -a.t;
  for (let i = a.i; i < a.list.length; i++) {
    if (a.list[i][0] === 'active') return t + a.list[i][1] * X.release;
    t += a.list[i][1];
  }
  return 0;
}
const flightOf = (X, dist) => clamp((X.flightBase ?? 0.22) + dist / X.flightPer, X.flight[0], X.flight[1]);

/** Called off: the piece is gone (broken, burned, taken) or out of the jaws' reach. No blow follows. */
function abort(a) {
  a.aborted = true;
  a.finish = true;
  for (const b of a.beats) b.flashed = true; // (a tell that was sent gets no flash: nothing lands)
}

/** Where the hero is heading: his position led by his velocity over `lead` of the flight, inside the clearing. */
function aimAt(d, X, out, fromX, fromZ) {
  const s = d.sense;
  const fl = flightOf(X, Math.hypot(s.pos.x - fromX, s.pos.z - fromZ));
  let wx = s.pos.x + s.vel.x * X.lead * fl, wz = s.pos.z + s.vel.z * X.lead * fl;
  const r = Math.hypot(wx, wz);
  if (r > ARENA) {
    wx *= ARENA / r;
    wz *= ARENA / r;
  }
  out.x = wx;
  out.z = wz;
  return fl;
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
      const list = [['lunge', Math.max(0.06, _jaws.time)], ['windup', wind(d, X.windup)], ['lift', wind(d, X.lift)]];
      if (burning) list.push(['kindle', wind(d, X.kindle)]);
      // the piece flies on by itself after the whip (it carries its own flash): the follow-through
      // need not wait for it
      list.push(['aim', wind(d, X.aim)], ['active', X.active], ['recovery', wind(d, X.recovery)]);
      return list;
    },
    // one red beat: the piece landing. The tell is the lunge's start (the first readable sign: it
    // whips round and springs at the piece); it is re-timed every frame until the piece leaves the
    // jaws, then fixed
    beats(d, a) {
      if (a.none) return [];
      let t = 0;
      for (const e of a.list) {
        if (e[0] === 'active') {
          t += e[1] * X.release;
          break;
        }
        t += e[1];
      }
      return [beat(name, 0, t + flightOf(X, d.sense.dist), X, 'piece')];
    },
    weight: (d, s) => (s.dist >= X.minDist && s.dist <= X.maxDist && jawsPiece(d, wood, null, false) ? perPhase(X.weight, d.phase) * (s.dist < X.close ? X.closeK : 1) : 0),
    start(d, a) {
      a.none = a.list[0][0] === 'search';
      a.piece = a.none ? null : _jaws.piece;
      a.tall = !!a.piece && a.piece.h >= BREAK.topple.minH;
      a.held = false;
      a.thrown = false;
      a.aborted = false;
      a.tiltT = 0; // the tilt asked of the piece in the jaws (terrain.carry swings toward it)
      a.stiff = 1;
      a.fire = 0;
      a.breath = false;
      a.side = 1;
      a.wi = 0;
      a.pinned = false;
      a.stamped = false;
      a.stamp = null;
      a.pin = V();
      a.stampAt = a.stampAt ?? V();
      a.head0 = V();
      const p = d.sense.pos;
      a.tx = a.lx = p.x;
      a.tz = a.lz = p.z;
      a.yawT = d.yaw;
      a._aim = { x: 0, z: 0 };
    },
    enter(d, a, phase) {
      if (a.none || a.aborted) return;
      const pt = d.rig.pt, P = a.piece, g = d.game;
      if (phase === 'windup') {
        const dist = Math.hypot(P.x - d.position.x, P.z - d.position.z);
        const ang = Math.abs(angleDiff(d.yaw, Math.atan2(P.x - d.position.x, P.z - d.position.z)));
        if (P.state !== STATE.INTACT || dist > J.far + 1.4 || dist < J.near - 1.6 || ang > 1.0) {
          abort(a);
          return;
        }
        // the foreleg on the piece's side pins the ground beside it, braced against the pull
        const c = Math.cos(d.yaw), s = Math.sin(d.yaw), dx = P.x - d.position.x, dz = P.z - d.position.z;
        const lat = dx * c - dz * s;
        a.wi = lat >= 0 ? 0 : 1;
        const side = a.wi === 0 ? 1 : -1, l = Math.hypot(dx, dz) || 1;
        a.pin.set(P.x - (dx / l) * (P.r + 1.5) + c * side * 1.0, 0, P.z - (dz / l) * (P.r + 1.5) - s * side * 1.0);
        d.rig.clampPaw?.(a.wi, a.pin);
      } else if (phase === 'lift') {
        const m = pt.mouth;
        if (!d.terrain.grab(P, m.x, m.y, m.z)) {
          abort(a);
          return;
        }
        a.held = true;
        d.emit('dragon:bite');
        g.shake?.(0.16);
      } else if (phase === 'kindle') {
        a.breath = true;
        d.emit('dragon:breathStart');
        d.emit('dragon:spell', { name, x: d.position.x, z: d.position.z });
      } else if (phase === 'aim') {
        this.stopBreath(d, a);
        // the coil goes back over the shoulder AWAY from the target's side, so the whip crosses to it
        const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
        const lat = (a.tx - d.position.x) * c - (a.tz - d.position.z) * s;
        a.side = lat >= 0 ? 1 : -1;
        // a target far round to the side or behind: the coil becomes a pivot (the body comes round
        // with the piece at heldTurn) until the neck's whip can cover the rest (J.whipArc)
        const off = Math.abs(angleDiff(d.yaw, Math.atan2(a.tx - d.position.x, a.tz - d.position.z)));
        const need = (off - J.whipArc) / Math.max(1, J.heldTurn);
        if (need > a.dur) {
          a.dur = Math.min(need, a.dur + J.pivotMax);
          a.list[a.i][1] = a.dur;
        }
      } else if (phase === 'active') {
        if (!burning) d.emit('dragon:spell', { name, x: d.position.x, z: d.position.z });
      } else if (phase === 'recovery') {
        a.stamp = d.rootPt(a.stampAt, a.side * 1.5, 0, 3.3);
      }
    },
    stopBreath(d, a) {
      if (!a.breath) return;
      a.breath = false;
      d.emit('dragon:breathEnd');
    },
    update(d, a, dt) {
      const pose = d.pose, s = d.sense, pt = d.rig.pt, k = a.k, P = a.piece;
      if (a.none) {
        searchPose(d, a, dt);
        return;
      }
      if (a.aborted) return;
      const ph = a.phase;
      const lean = a.tall ? 1 : 0.35; // a boulder sits in the jaws: it rocks, it does not swing back like a club
      // the aim follows the hero (it is fixed at the release, in hit()); the throw frame looks at it
      if (!a.thrown) {
        aimAt(d, X, a._aim, d.position.x, d.position.z);
        a.tx = a._aim.x;
        a.tz = a._aim.z;
      }
      const yT = Math.atan2(a.tx - d.position.x, a.tz - d.position.z);
      if (!a.thrown) a.yawT = yT;
      pose.spreadRate = 6;
      if (ph === 'lunge') {
        // it whips round toward the piece and springs at it: low, the neck reaching, the forelegs out
        const dx = P.x - d.position.x, dz = P.z - d.position.z;
        const dist = Math.hypot(dx, dz), yawP = Math.atan2(dx, dz);
        const ang = Math.abs(angleDiff(d.yaw, yawP));
        d.turnToward(yawP, Math.max(d.turnRate, J.turn), dt);
        const left = Math.max(0.05, a.dur - a.t);
        if (ang < 1.1) {
          if (dist > J.stand + 0.3) d.moveForward(Math.min(J.fetchSpeed, Math.max(3, (dist - J.stand) / left)), dt);
          else if (dist < J.near + 0.2) d.moveForward(-Math.min(6, Math.max(1.5, (J.near + 0.7 - dist) / left)), dt);
        }
        pose.head = d.rootPt(pose.headTarget, 0, 2.9, 5.0);
        pose.headRate = 9;
        pose.look.set(P.x, Math.min(2, P.h * 0.4), P.z);
        pose.lookDown = 0.9;
        pose.jaw = 0.55;
        pose.lower = 0.28;
        pose.pitch = 0.16;
        pose.stanceF = 0.35;
        pose.spread[0] = pose.spread[1] = 0.4;
        pose.tailLift = 0.5;
        pose.tailStiff = 1.4;
        d.terrain.stir(dt, P);
        // there already: the bite does not wait for the plan's time
        if (a.t > 0.04 && ang < 0.25 && dist <= J.far - 0.5 && dist >= J.near) a.t = a.dur;
        return;
      }
      if (ph === 'windup') {
        // the bite: the head drives down at the trunk, the jaws wide, a foreleg slams down beside it,
        // the jaws clamp. The head is steered by where the MOUTH is against the grip point
        const dx = P.x - d.position.x, dz = P.z - d.position.z, dl = Math.hypot(dx, dz) || 1;
        d.turnToward(Math.atan2(dx, dz), Math.max(d.turnRate, J.turn), dt);
        const gy = a.tall ? 1.5 : Math.max(0.5, P.h * 0.6);
        _g.set(P.x - (dx / dl) * P.r * 0.6, gy, P.z - (dz / dl) * P.r * 0.6);
        _v.subVectors(_g, pt.mouth);
        pose.head = pose.headTarget.copy(d.rig.headPos).add(_v);
        pose.head.y = Math.max(0.55 * S, pose.head.y);
        pose.headRate = 10 + 22 * k;
        pose.look.set(P.x + (dx / dl) * 5, gy - 2.5, P.z + (dz / dl) * 5);
        pose.lookDown = 1.2;
        pose.headExact = k > 0.5;
        pose.jaw = k < 0.78 ? 0.6 + 0.4 * smoothstep(0, 0.4, k) : 0.22;
        pose.jawRate = k < 0.78 ? 14 : 45;
        const e = smoothstep(0, 0.7, k), side = a.wi === 0 ? 1 : -1;
        pose.lower = 0.12 + 0.3 * e;
        pose.pitch = 0.2 * e;
        pose.roll = side * 0.07 * e;
        pose.twist = side * 0.08 * e;
        pose.bodyRate = 9;
        pose.stanceF = 0.3;
        pose.spread[0] = pose.spread[1] = 0.5;
        pose.tailLift = 0.45;
        pose.tailCurl = -side * 0.03;
        // the pin: the paw rises off the ground and slams down beside the piece
        const ov = pose.pawOv[a.wi];
        if (!a.pinned) {
          const u = clamp(k / 0.55, 0, 1);
          ov.w = 1;
          ov.pos.set(a.pin.x, Math.sin(Math.PI * u) * 1.4 * S * 0.5 + 0.05, a.pin.z);
          pose.pawOvRate = 16;
          if (k >= 0.55) {
            a.pinned = true;
            pose.pawPlant[a.wi] = true;
            TFX.pin(d.fx, a.pin.x, a.pin.z);
            d.emit('dragon:step', { x: a.pin.x, z: a.pin.z, heavy: false });
          }
        }
        d.terrain.stir(dt, P);
        return;
      }
      // from here the piece is in the jaws
      const Tn = d.terrain;
      if (ph !== 'lift' || Tn.hold.rooted === false) {
        // the body comes round to the hero, no faster than a creature with a tree in its mouth: the
        // neck's whip covers the rest
        d.turnToward(s.yawTo, Math.max(d.turnRate, J.heldTurn), dt);
      }
      pose.restep = ph === 'lift' ? 0 : 1;
      if (ph === 'lift') {
        const side = a.wi === 0 ? 1 : -1;
        if (Tn.hold.rooted) {
          // the tug: the jaws haul back on the trunk and it holds (twice), the haunches dig in, the
          // body rocks back; grit jumps round its foot
          const u = clamp(k / X.tug, 0, 1);
          const pull = 0.45 * smoothstep(0, 1, u) + 0.18 * Math.sin(u * Math.PI * 3);
          const dx = P.x - d.position.x, dz = P.z - d.position.z, dl = Math.hypot(dx, dz) || 1;
          const gy = a.tall ? 1.5 : Math.max(0.5, P.h * 0.6);
          _g.set(P.x - (dx / dl) * (P.r * 0.6 + pull), gy + 0.25 * u, P.z - (dz / dl) * (P.r * 0.6 + pull));
          _v.subVectors(_g, pt.mouth);
          pose.head = pose.headTarget.copy(d.rig.headPos).add(_v);
          pose.headRate = 30;
          pose.headExact = true;
          pose.look.set(P.x, gy - 1, P.z);
          pose.lookDown = 1.2;
          pose.jaw = 0.18;
          pose.jawRate = 40;
          pose.lower = 0.42;
          pose.pitch = 0.12 - 0.16 * u;
          pose.roll = side * 0.05 + 0.03 * Math.sin(a.t * 41);
          pose.twist = -side * 0.06 * u;
          pose.bodyRate = 12;
          pose.stanceF = 0.3;
          pose.stanceH = 0.25;
          pose.spread[0] = pose.spread[1] = 0.35 + 0.1 * u;
          pose.spreadRate = 9;
          pose.tailLift = 0.3;
          pose.tailStiff = 2;
          if (k < X.tug) d.moveForward(-1.3, dt);
          Tn.strain(dt, u);
          a.head0.copy(d.rig.headPos);
          a.tiltT = 0;
          a.stiff = 1;
        } else {
          // torn out: the head rears up and back with it, the weight rocks onto the haunches, the
          // wings flare for balance, the tail swings up as the counterweight
          const u = clamp((k - X.tug) / Math.max(0.05, 1 - X.tug), 0, 1);
          const e = easeOutBack(u, 1.2);
          framePt(d, _w, a.yawT, 0, a.tall ? 4.7 : 4.3, 3.2);
          pose.head = pose.headTarget.lerpVectors(a.head0, _w, e);
          pose.headRate = 16;
          framePt(d, pose.look, a.yawT, 0, 6, 14);
          pose.lookDown = 0.4;
          pose.jaw = 0.22;
          pose.lower = lerp(0.42, 0.1, u);
          pose.pitch = lerp(-0.04, -0.17, smoothstep(0, 0.6, u));
          pose.rear = 0.25 * Math.sin(Math.PI * u);
          pose.bodyRate = 10;
          pose.stanceH = 0.25;
          pose.spread[0] = pose.spread[1] = 0.3; // (folded back: the wings do not hide the piece)
          pose.spreadRate = 8;
          pose.tailLift = 1;
          pose.tailStiff = 1.6;
          a.tiltT = -0.35 * lean * e;
          a.stiff = 1;
        }
      } else if (ph === 'kindle') {
        // held out ahead and up, the crown forward: a breath runs up the trunk
        framePt(d, pose.headTarget, a.yawT, 0, 4.9, 4.2);
        pose.head = pose.headTarget;
        pose.headRate = 7;
        framePt(d, pose.look, a.yawT, 0, 6, 14);
        pose.jaw = 0.5;
        pose.swell = 1;
        pose.pitch = -0.08;
        pose.spread[0] = pose.spread[1] = 0.45;
        pose.tailLift = 1;
        a.tiltT = 0.35 * lean;
        a.stiff = 1;
        a.fire = smoothstep(0.05, 0.85, k);
        d.throat = 0.5 + 0.5 * k;
        d.fx.mouthEmbers(dt, pt.mouth, 60, pt.headFwd, 1);
      } else if (ph === 'aim') {
        // the coil: the neck drawn back high over the shoulder away from the target, the chest turned
        // away, up on the haunches, the wings raised; the piece swung back behind; the tail out to
        // the other side as the counterweight
        const sd = a.side, e = smoothstep(0, 1, k);
        framePt(d, pose.headTarget, a.yawT, -sd * 1.4 * e, lerp(4.7, 5.0, e), lerp(3.2, 1.5, e));
        pose.head = pose.headTarget;
        pose.headRate = 14;
        framePt(d, pose.look, a.yawT, 0, 6.5, 14);
        pose.lookDown = 0.3;
        pose.jaw = 0.22;
        pose.twist = -sd * 0.3 * e;
        pose.pitch = -0.17;
        pose.lower = -0.06 * e;
        pose.roll = -sd * 0.05 * e;
        pose.bodyRate = 10;
        pose.swell = e;
        pose.spread[0] = pose.spread[1] = 0.28;
        pose.spreadRate = 8;
        pose.tailLift = 1;
        pose.tailCurl = sd * 0.07 * e;
        a.tiltT = -X.cock * lean;
        a.stiff = 1.4;
        if (burning) d.throat = 0.6;
      } else if (ph === 'active') {
        // the whip: the head flung over and down through the release, the chest twisting round, the
        // body lurching forward onto the forelegs, the wings snapping down, the tail swung the other way
        const sd = a.side, u = easeInOutSine(k);
        frameBezier(d, pose.headTarget, a.yawT, [-sd * 1.4, 5.0, 1.5], [0, 5.3, 5.0], [sd * 0.8, 2.8, 6.8], u);
        pose.head = pose.headTarget;
        pose.headRate = 40;
        pose.headExact = true;
        pose.look.set(a.lx, 2, a.lz);
        if (!a.thrown) pose.look.set(a.tx, 2, a.tz);
        pose.lookDown = 0.9;
        pose.jaw = a.thrown ? 0.95 : 0.22;
        pose.jawRate = 40;
        pose.twist = lerp(-sd * 0.3, sd * 0.32, u);
        pose.pitch = lerp(-0.17, 0.22, u);
        pose.lower = lerp(-0.06, 0.32, u);
        pose.roll = sd * 0.07 * u;
        pose.bodyRate = 16;
        pose.spread[0] = pose.spread[1] = lerp(0.28, 0.5, u);
        pose.spreadRate = 20;
        pose.tailLift = 1;
        pose.tailCurl = lerp(sd * 0.07, -sd * 0.09, u);
        pose.tailStiff = 2;
        d.moveForward(5 * (1 - u), dt);
        a.tiltT = 1.0 * lean;
        a.stiff = J.sway.whipK;
      } else {
        // the follow-through: the head carries on low and out past the release, the jaws open (a
        // roar after it), a forepaw stamps down to take the weight; then it settles
        const sd = a.side, hold = k < 0.4;
        if (hold) {
          framePt(d, pose.headTarget, a.yawT, sd * 0.9, 2.7, 6.3);
          pose.head = pose.headTarget;
        }
        pose.headRate = hold ? 10 : 3;
        pose.look.set(a.lx, 1, a.lz);
        pose.lookDown = 0.6;
        pose.jaw = hold ? 0.85 : 0.3;
        const e = smoothstep(0, 0.7, k);
        pose.pitch = 0.22 * (1 - e);
        pose.lower = 0.32 * (1 - e);
        pose.twist = sd * 0.32 * (1 - e);
        pose.bodyRate = 5;
        pose.spread[0] = pose.spread[1] = k < 0.35 ? 0.35 : REST_SPREAD;
        pose.spreadRate = 3;
        pose.tailCurl = -sd * 0.09 * (1 - e);
        d.throat = 0;
        const wi = sd > 0 ? 0 : 1, ov = pose.pawOv[wi];
        if (!a.stamped && a.stamp) {
          ov.w = 1;
          ov.pos.set(a.stamp.x, 0.8 * (1 - k / 0.16), a.stamp.z);
          pose.pawOvRate = 24;
          if (k >= 0.16) {
            a.stamped = true;
            d.rig.clampPaw?.(wi, ov.pos.copy(a.stamp));
            pose.pawPlant[wi] = true;
            d.fx.dustRing?.(ov.pos.x, ov.pos.z, 0.35 * S, 12, 0.5);
            d.emit('dragon:step', { x: ov.pos.x, z: ov.pos.z, heavy: true });
          }
        }
      }
    },
    hit(d, a, dt) {
      if (!a.held || a.thrown || a.aborted) return;
      const m = d.rig.pt.mouth, Tn = d.terrain, g = d.game;
      // the plane the piece swings in. Swung straight back it lies over the wyrm's own back, under the
      // raised wing, where the game camera cannot see it: it is swung back and OUT toward the side the
      // camera looks from (up to J.showArc), and the whip brings the plane round to the throw by the release
      let yS = a.yawT;
      const cam = g.camera?.position;
      if (cam && (a.phase === 'lift' || a.phase === 'aim' || a.phase === 'active')) {
        const back = a.yawT + Math.PI;
        const cy = Math.atan2(cam.x - d.position.x, cam.z - d.position.z);
        yS = back + clamp(angleDiff(back, cy), -J.showArc, J.showArc) - Math.PI;
        if (a.phase === 'active') yS += angleDiff(yS, a.yawT) * smoothstep(0, 1, a.k / X.release);
      }
      a.yS = Number.isFinite(a.yS) ? a.yS + angleDiff(a.yS, yS) * (1 - Math.exp(-12 * dt)) : yS;
      Tn.carry(dt, m.x, m.y, m.z, a.tiltT, a.phase === 'active' && a.k >= X.release * 0.9 ? a.yawT : a.yS, a.stiff);
      if (!Tn.hold.piece) {
        // the world took it back (a reset under the hold)
        abort(a);
        return;
      }
      // the tug wins
      if (Tn.hold.rooted && (a.phase !== 'lift' || a.k >= X.tug)) {
        const P = a.piece, dx = d.position.x - P.x, dz = d.position.z - P.z, l = Math.hypot(dx, dz) || 1;
        Tn.tear(dx / l, dz / l);
        g.shake?.(0.34);
        g.world?.gust?.(P.x, P.z, 1.2, 9);
        d.emit('dragon:step', { x: P.x, z: P.z, heavy: true });
      }
      if (burning && a.fire > 0) Tn.blaze(dt, a.fire);
      const b = a.beats[0];
      if (a.phase === 'active' && a.k >= X.release && !Tn.hold.rooted) {
        // the release: the aim is fixed on where he is heading now
        aimAt(d, X, a._aim, m.x, m.z);
        a.lx = a.tx = a._aim.x;
        a.lz = a.tz = a._aim.z;
        const fl = Tn.lob(a.lx, a.lz, X, name, a, b, burning);
        a.thrown = true;
        if (fl > 0) {
          if (b && !b.flashed) b.impactIn = Math.max(0.05, a.T - b.at + fl);
          // the beat leaves with the piece: the piece sends its own cue (terrain._cue), so the cue is
          // the flare on the piece alone, never the body's red spike of the wyrm's own blows
          a.beats = [];
          g.shake?.(0.2);
          g.world?.gust?.(m.x, m.z, 1.2, 9 * S);
        } else {
          Tn.drop();
          abort(a);
        }
        return;
      }
      // until then the landing is re-timed every frame (so the flash can never come early)
      if (b && !b.flashed) b.impactIn = Math.max(0.05, a.T - b.at + untilRelease(a, X) + flightOf(X, Math.hypot(a.tx - m.x, a.tz - m.z)));
    },
    end(d, a) {
      this.stopBreath(d, a);
      d.throat = 0;
      // cut short with the piece in the jaws (a stagger, a break, a plunge, death): it falls
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
  // one blue beat (a parry moment: the blue flare): the boulder reaching the hero (re-timed when the
  // lash starts and when the tail meets the boulder)
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
    const phi = Math.atan2(P.x - d.position.x, P.z - d.position.z);
    pose.tailLegacy = true; // the lash rides the measured chain (as the tail lash's)
    pose.spreadRate = 6;
    if (a.phase === 'windup') {
      // the pivot: its back to the boulder, the tail stopping `offset` short of it; then the cock:
      // the hips wind up against the swing, the tail curls away from the boulder, low, and it looks
      // over its shoulder at the hero (pose.look is his chest)
      this.aim(d, a);
      d.turnToward(phi + Math.PI + a.dir * B.offset, B.pivotRate, dt);
      pose.speed = Math.max(pose.speed, 4);
      const e = smoothstep(0.25, 1, k);
      pose.tailLift = 0;
      pose.tailCurl = a.dir * B.coil * e;
      pose.tailStiff = 1.6;
      pose.tailWave = 0;
      pose.lower = 0.28 * e;
      pose.pitch = 0.1 * e;
      pose.twist = a.dir * 0.22 * e;
      pose.roll = -a.dir * 0.05 * e;
      pose.bodyRate = 8;
      pose.stanceH = 0.4;
      pose.restep = 1;
      pose.lookRate = 7;
      pose.spread[0] = pose.spread[1] = 0.3 * e;
      d.terrain.stir(dt, P);
    } else if (a.phase === 'active') {
      // the lash: a short, fast spin that carries the tail through the boulder and past it, the hips
      // snapping round ahead of the tail
      d.yaw = a.yawW - a.dir * (B.offset + B.past) * easeInOutSine(k);
      pose.tailLift = 0;
      pose.tailCurl = -a.dir * 0.08;
      pose.tailStiff = 3;
      pose.tailWave = 0;
      pose.lower = 0.32;
      pose.pitch = 0.14;
      pose.twist = -a.dir * 0.2;
      pose.roll = a.dir * 0.06;
      pose.bodyRate = 14;
      pose.stanceH = 0.4;
      pose.speed = 6;
      pose.spread[0] = pose.spread[1] = 0.45;
      pose.spreadRate = 14;
    } else {
      pose.tailLift = k > 0.5 ? 1 : 0;
      pose.tailCurl = -a.dir * 0.08 * (1 - k);
      pose.lower = 0.32 * (1 - k);
      pose.pitch = 0.14 * (1 - k);
      pose.twist = -a.dir * 0.2 * (1 - k);
      pose.spread[0] = pose.spread[1] = k > 0.4 ? REST_SPREAD : 0.45;
      pose.spreadRate = 4;
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
    g.shake?.(0.34);
    g.world?.gust?.(P.x, P.z, 1.3, 8 * S);
    d.emit('dragon:step', { x: P.x, z: P.z, heavy: true });
    d.emit('dragon:spell', { name: 'tailBat', x: P.x, z: P.z });
  },
};
function abortBat(a) {
  a.aborted = true;
  for (const b of a.beats) b.flashed = true;
}

export const TERRAIN_MOVES = { hurl, tailBat, fireBrand };
