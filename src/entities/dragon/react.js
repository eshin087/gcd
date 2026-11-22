import * as THREE from 'three';
import { impactK } from '../../combat/impact.js';
import { REACT as R } from './tuningReact.js';

// THE WYRM ANSWERS WHERE IT IS HIT (the impact pass's `react` piece; numbers: tuningReact.js).
//
// A landed cut (dragon.takeHit → hit(o, part)) starts a short reaction of the part it struck, found
// from the drawn contact (o.point) and pushed along the blade's travel (o.cut):
//   head   the snout snaps away along the cut (back and up for a thrust), the neck carries it on a beat
//          later, it comes back with one small overshoot
//   neck   a whip running along the neck from the contact
//   body   the torso turns about the chest / hips so the struck point goes with the blade, the struck
//          side sinks; the head is held, a small lash runs down the tail
//   leg    the knee / elbow is driven along the cut and down, the body dips to that side
//   wing   the wrist jerks along the cut, the hand folds in a little
//   tail   a lash from the contact to the tip
//
// DRAWN ONLY. The reaction is a set of small rotations put on the model's joints AFTER the wyrm's whole
// step (apply(), the last thing dragon._step does) and taken off again before the next one starts
// (restore(), its first): the AI, the rig's solve, the hurt spheres, the attacks' spheres, the body's
// blows on the world all run on exactly the joints they ran on before. What reads the drawn body in
// between (the renderer, the rigid batch's bone texture) sees the reaction. The wing membranes (built
// from the rig's points, not from the joints) are rebuilt from the moved joints; `drawnPoint(v)` maps a
// hurt sphere to where it is drawn (the hero's drawn contact, player._contactPoint).
//
// The first pose is there in the hit's own tick (the curves start at their peak) and holds through the
// hit-stop (game time); it recovers on game time after it. With impactK('react') at 0 nothing here
// touches the model: the wyrm moves exactly as before. Its old flinch (dragon.flinch: the head goal
// eased along the blow, ~0.6 m on a head cut, a few cm on any other) stays under it, on or off: it is
// part of the simulation the attacks were measured on, and it arrives after the freeze, where the
// head's snap hands over to it.
//
// No objects are built (no Object3D: three.js draws ids from Math.random), no random numbers are drawn,
// nothing is allocated per frame.

const HEAD = 1, NECK = 2, BODY = 3, LEG = 4, WING = 5, TAIL = 6;
const KIND = { head: HEAD, neck: NECK, body: BODY, leg: LEG, wing: WING, tail: TAIL };
const KIND_NAME = ['', 'head', 'neck', 'body', 'leg', 'wing', 'tail'];

/** The released spring: 1 at t = 0 (zero speed), one overshoot of e^(-z pi / sqrt(1 - z^2)). */
function snap(t, w, z) {
  if (!(t >= 0)) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}
/** ... reaching a point `delay` s later, eased in over R.ease (delay 0: the snap itself). */
function wave(t, delay, w, z) {
  if (delay <= 1e-6) return snap(t, w, z);
  const u = t - delay;
  if (!(u > 0)) return 0;
  return snap(u, w, z) * Math.min(1, u / R.ease);
}

export class WyrmReact {
  constructor(dragon) {
    this.d = dragon;
    const m = (this.m = dragon.model);
    // ---- the joints the reaction may turn (their local rotations are saved and put back)
    const J = (this.J = []);
    const add = (o) => (J.push(o), J.length - 1);
    this.iHips = add(m.hips);
    this.iChest = add(m.chest);
    this.iNeck = m.neck.map(add);
    this.iHead = add(m.head);
    this.iTail = m.tail.map(add);
    this.iThigh = m.legs.map((l) => add(l.thigh));
    this.iShin = m.legs.map((l) => add(l.shin));
    this.iHum = m.arms.map((a) => add(a.humerus));
    this.iFore = m.arms.map((a) => add(a.forearm));
    this.iWHum = m.wings.map((w) => add(w.humerus));
    this.iWFore = m.wings.map((w) => add(w.forearm));
    const nJ = J.length;
    this.wp = new Float64Array(nJ * 3); // joint world positions (this step, before the reaction)
    this.rv = new Float64Array(nJ * 3); // world rotation vectors to put on each joint
    this.saved = new Float64Array(nJ * 4);
    this.nN = m.neck.length;
    this.nT = m.tail.length;
    this.gN = new Float64Array(this.nN + 1);
    this.gT = new Float64Array(this.nT + 1);
    this.pN = new Float64Array((this.nN + 1) * 3); // neck points: its joints, then the head joint
    this.pT = new Float64Array((this.nT + 1) * 3); // tail points: its joints, then the tip
    this.iNeckPts = [...this.iNeck, this.iHead];

    // ---- anchors: the joints whose drawn move carries a hurt sphere or a membrane point
    const anchors = (this.anchors = []);
    const aIdx = new Map();
    const anchor = (o) => {
      if (!aIdx.has(o)) {
        aIdx.set(o, anchors.length);
        anchors.push(o);
      }
      return aIdx.get(o);
    };
    const nk = (i) => m.neck[Math.min(i, this.nN - 1)], tl = (i) => m.tail[Math.min(i, this.nT - 1)];
    // the hurt spheres in dragon.js HURT order (_refreshHurt): [anchor, second anchor or -1]
    const sp = [
      [m.head, null], [nk(2), null], [nk(4), null], [nk(6), null],
      [m.chest, null], [m.chest, m.hips], [m.hips, null],
      [tl(3), null], [tl(6), null], [tl(9), null], [tl(13), null],
    ];
    for (let k = 0; k < 2; k++) sp.push([m.wings[k].wrist, null], [m.wings[k].distal[1], null]);
    for (let k = 0; k < 2; k++) sp.push([m.arms[k].humerus, null], [m.arms[k].hand, null], [m.legs[k].thigh, null], [m.legs[k].meta, null]);
    this.sphA = new Int16Array(sp.length);
    this.sphB = new Int16Array(sp.length);
    sp.forEach(([a, b], i) => {
      this.sphA[i] = anchor(a);
      this.sphB[i] = b ? anchor(b) : -1;
    });
    this.sphOff = new Float64Array(sp.length * 3);
    // the membranes' points per wing: root, elbow (forearm joint), wrist, hip attach, the four fingers
    this.wingA = m.wings.map((w) => ({
      root: anchor(w.root), elbow: anchor(w.forearm), wrist: anchor(w.wrist), hip: anchor(w.hipAttach),
      fingers: w.distal.map(anchor),
    }));
    this.aHead = anchor(m.head);
    const nA = anchors.length;
    this.before = Array.from({ length: nA }, () => new THREE.Matrix4());
    this.delta = Array.from({ length: nA }, () => new THREE.Matrix4());
    // membrane scratch points (world) and the record WingMembrane.update reads
    const V = () => new THREE.Vector3();
    this.memPts = m.wings.map(() => ({ wrist: V(), elbow: V(), root: V(), hip: V(), tips: [V(), V(), V(), V()], knuckles: [V(), V(), V(), V()] }));

    // ---- the reactions alive (a fixed pool)
    this.pool = Array.from({ length: R.pool }, () => ({
      on: false, kind: 0, born: 0, life: 0, wk: 0, w: 26, z: 0.5,
      dx: 0, dy: 0, dz: 0, c: 0, u: 0, side: 0, front: false, ox: 0, oy: 0, oz: 0, ai: 0,
    }));
    this.applied = false;
    this.headShift = V();
    this.tw = V(); // the trunk's shove this step (world m)
    this.savedHips = V();
    this._eyes = [V(), V()];
    this._rootInv = new THREE.Matrix4();
    this._mInv = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();
    this._qw = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._v = V();
    this._v2 = V();
    this._ax = V();
    /** The last hit's reaction (the Lab, the tests): kind name, the chain point, the weight. */
    this.last = { kind: '', c: 0, wk: 0, side: 0, front: false, sphere: -1 };
  }

  /** Anything to draw? */
  get live() {
    for (const p of this.pool) if (p.on) return true;
    return false;
  }

  /** Drop every reaction (a reset, death): the joints get their own rotations back. */
  clear() {
    this.restore();
    for (const p of this.pool) p.on = false;
  }

  /** Take the drawn reaction off the joints (the start of dragon._step: the step runs on its own joints). */
  restore() {
    if (!this.applied) return;
    this.applied = false;
    const J = this.J, Q = this.saved;
    for (let j = 0; j < J.length; j++) J[j].quaternion.set(Q[j * 4], Q[j * 4 + 1], Q[j * 4 + 2], Q[j * 4 + 3]);
    this.m.hips.position.copy(this.savedHips);
    this.m.hips.updateMatrixWorld(true);
  }

  /** Where a hurt sphere (one of dragon._hurtPool's, by its exact point) is drawn: v in place. */
  drawnPoint(v) {
    if (!this.applied || !v) return v;
    const P = this.d._hurtPool, O = this.sphOff;
    for (let i = 0; i < P.length && i < this.sphA.length; i++) {
      const h = P[i];
      if (h.x === v.x && h.y === v.y && h.z === v.z) {
        v.x += O[i * 3];
        v.y += O[i * 3 + 1];
        v.z += O[i * 3 + 2];
        return v;
      }
    }
    return v;
  }

  /** The eyes as drawn (the glints): the rig's eye points carried by the head's last drawn move. */
  eyes(eyes) {
    if (!this.applied || this.headShift.lengthSq() < 1e-10) return eyes;
    for (let k = 0; k < 2 && k < eyes.length; k++) this._eyes[k].copy(eyes[k]).add(this.headShift);
    return this._eyes;
  }

  // ------------------------------------------------------------------ a hit
  /** dragon.takeHit's landed blow (its part already checked): start the struck part's reaction. */
  hit(o, part) {
    const d = this.d;
    if (d.state === 'sleeping' || d.state === 'dying' || d.state === 'dead') return;
    const k = impactK('react');
    if (!(k > 0)) return;
    const pt = d.rig.pt, P = d._hurtPool;
    // the contact: the drawn point, else the struck part's sphere
    let px = Number(o.point?.x), py = Number(o.point?.y), pz = Number(o.point?.z);
    const hasPt = Number.isFinite(px + py + pz);
    // the struck sphere: the nearest of the named part's (the nearest of all without a name)
    let best = -1, bd = Infinity;
    for (let i = 0; i < P.length; i++) {
      const h = P[i];
      if (part && h.part !== part) continue;
      const dd = hasPt ? Math.hypot(h.x - px, h.y - py, h.z - pz) - h.r : i;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (best < 0) return;
    const sph = P[best];
    if (!hasPt) {
      px = sph.x;
      py = sph.y;
      pz = sph.z;
    }
    const kind = KIND[sph.part] ?? BODY;
    // the push: the blade's travel on the ground (the flinch's way when it is not given)
    let dx = Number(o.cut?.x), dz = Number(o.cut?.z);
    let l = Math.hypot(dx, dz);
    if (!Number.isFinite(l) || l < 1e-3) {
      dx = d.flinchDir.x;
      dz = d.flinchDir.z;
      l = Math.hypot(dx, dz);
    }
    if (!(l > 1e-6)) {
      dx = 0;
      dz = 1;
      l = 1;
    }
    dx /= l;
    dz /= l;
    // weight: a light cut is a small quick give; the heavy blows (slam, cleave, the execution) are big
    const heavy = !!o.heavy;
    let wk = (heavy ? R.weight.heavy : R.weight.light) * (o.crit ? R.weight.crit : 1) * k;
    // what is still moving in that part damps the new one (three lights in a second do not build)
    let resid = 0;
    for (const p of this.pool) {
      if (!p.on || p.kind !== kind) continue;
      resid += p.wk * Math.abs(snap(d.time - p.born, p.w, p.z));
    }
    wk *= Math.max(R.stackMin, 1 - R.stack * Math.min(1, resid));
    if ((kind === HEAD || kind === NECK) && d.pose?.headExact) wk *= R.headExact;
    const sp = heavy ? R.spring.heavy : R.spring.light;
    // the slot: a free one, else the oldest
    let slot = this.pool[0];
    for (const p of this.pool) {
      if (!p.on) {
        slot = p;
        break;
      }
      if (p.born < slot.born) slot = p;
    }
    const r = slot;
    r.on = true;
    r.kind = kind;
    r.born = d.time;
    r.wk = wk;
    r.w = sp.w;
    r.z = sp.z;
    r.dx = dx;
    r.dy = 0;
    r.dz = dz;
    r.c = 0;
    r.u = 0;
    r.side = 0;
    r.front = false;
    let delay = 0;
    if (kind === HEAD) {
      // a thrust (the blade travelling away from the hero, into the face) tosses the head back AND up
      const hp = d.game.player?.position;
      let ax = pt.head.x - (hp?.x ?? pt.head.x - dx), az = pt.head.z - (hp?.z ?? pt.head.z - dz);
      const al = Math.hypot(ax, az) || 1;
      ax /= al;
      az /= al;
      r.dy = R.head.up * Math.max(0, dx * ax + dz * az);
      delay = R.head.delay + this.nN * R.head.travel;
    } else if (kind === NECK) {
      r.c = nearestOnChain(d.rig.neck.p, px, py, pz);
      r.dy = R.neck.up;
      delay = this.nN * R.neck.travel;
    } else if (kind === TAIL) {
      r.c = nearestOnChain(d.rig.tail.p, px, py, pz);
      delay = this.nT * R.tail.travel;
    } else if (kind === BODY) {
      // where along the trunk (0 the deep chest .. 1 the hips) and the contact relative to the joint it
      // rides on, in the body's own (unturned) frame
      const ax = pt.hips.x - pt.chestC.x, ay = pt.hips.y - pt.chestC.y, az = pt.hips.z - pt.chestC.z;
      const a2 = ax * ax + ay * ay + az * az;
      r.u = a2 > 1e-6 ? Math.min(1, Math.max(0, ((px - pt.chestC.x) * ax + (py - pt.chestC.y) * ay + (pz - pt.chestC.z) * az) / a2)) : 0;
      const base = r.u < 0.5 ? pt.chest : pt.hips;
      r.ai = r.u < 0.5 ? this.iChest : this.iHips;
      const c = Math.cos(d.yaw), s = Math.sin(d.yaw), ox = px - base.x, oz = pz - base.z;
      r.ox = ox * c - oz * s;
      r.oy = py - base.y;
      r.oz = ox * s + oz * c;
      delay = this.nT * R.body.travel;
    } else if (kind === LEG) {
      const j = best - 15;
      r.side = j >= 4 ? 1 : 0;
      r.front = j % 4 < 2;
    } else if (kind === WING) {
      r.side = best >= 13 ? 1 : 0;
    }
    r.life = 3.2 / (r.z * r.w) + delay + R.ease;
    const L = this.last;
    L.kind = KIND_NAME[kind];
    L.c = r.c;
    L.wk = wk;
    L.side = r.side;
    L.front = r.front;
    L.sphere = best;
  }

  // ------------------------------------------------------------------ the frame
  /** The drawn reaction for this step (the end of dragon._step; restore() took last step's off). */
  apply(dt) {
    const d = this.d;
    const st = d.state;
    if (st === 'sleeping' || st === 'dying' || st === 'dead' || d.object3d.visible === false) {
      for (const p of this.pool) p.on = false;
      return;
    }
    let any = false;
    for (const p of this.pool) {
      if (p.on && d.time - p.born > p.life) p.on = false;
      if (p.on) any = true;
    }
    if (!any) return;

    const J = this.J, W = this.wp, rv = this.rv, A = this.anchors;
    for (let i = 0; i < A.length; i++) this.before[i].copy(A[i].matrixWorld);
    for (let j = 0; j < J.length; j++) {
      const e = J[j].matrixWorld.elements;
      W[j * 3] = e[12];
      W[j * 3 + 1] = e[13];
      W[j * 3 + 2] = e[14];
    }
    for (let k = 0; k <= this.nN; k++) {
      const j = this.iNeckPts[k];
      this.pN[k * 3] = W[j * 3];
      this.pN[k * 3 + 1] = W[j * 3 + 1];
      this.pN[k * 3 + 2] = W[j * 3 + 2];
    }
    for (let k = 0; k < this.nT; k++) {
      const j = this.iTail[k];
      this.pT[k * 3] = W[j * 3];
      this.pT[k * 3 + 1] = W[j * 3 + 1];
      this.pT[k * 3 + 2] = W[j * 3 + 2];
    }
    {
      const e = this.m.tailTip.matrixWorld.elements, k = this.nT * 3;
      this.pT[k] = e[12];
      this.pT[k + 1] = e[13];
      this.pT[k + 2] = e[14];
    }
    rv.fill(0);
    this.tw.set(0, 0, 0);
    let neckHold = 0, tailHold = 0;
    for (const p of this.pool) {
      if (!p.on) continue;
      const t = d.time - p.born;
      if (p.kind === HEAD) this._head(p, t);
      else if (p.kind === NECK) this._neck(p, t);
      else if (p.kind === TAIL) this._tail(p, t);
      else if (p.kind === BODY) {
        this._body(p, t);
        neckHold = Math.max(neckHold, R.body.neckHold);
        tailHold = Math.max(tailHold, R.body.tailHold);
      } else if (p.kind === LEG) {
        this._leg(p, t);
        neckHold = Math.max(neckHold, R.body.neckHold);
        tailHold = Math.max(tailHold, R.body.tailHold);
      } else if (p.kind === WING) this._wing(p, t);
    }
    // the trunk turned: the limbs stay standing (their roots turn back), the neck and the tail base
    // hold most of their ground, every foot stays where it was planted
    const iH = this.iHips * 3, iC = this.iChest * 3;
    const hx = rv[iH], hy = rv[iH + 1], hz = rv[iH + 2];
    const cx = rv[iC] + hx, cy = rv[iC + 1] + hy, cz = rv[iC + 2] + hz;
    if (hx || hy || hz || cx || cy || cz) {
      for (let k = 0; k < 2; k++) {
        this._addRv(this.iThigh[k], -hx, -hy, -hz);
        this._addRv(this.iHum[k], -cx, -cy, -cz);
      }
      this._addRv(this.iNeck[0], -cx * neckHold, -cy * neckHold, -cz * neckHold);
      this._addRv(this.iTail[0], -hx * tailHold, -hy * tailHold, -hz * tailHold);
    }
    for (let k = 0; k < 2; k++) {
      this._keepFoot(this.m.legs[k].toe, this.iShin[k], [this.iHips, this.iThigh[k]]);
      this._keepFoot(this.m.arms[k].paw, this.iFore[k], [this.iHips, this.iChest, this.iHum[k]]);
    }

    // put the rotations on (each joint's world rotation vector, in its parent's frame)
    const Q = this.saved, q = this._q, qp = this._qp, qw = this._qw, ax = this._ax;
    for (let j = 0; j < J.length; j++) {
      const o = J[j];
      Q[j * 4] = o.quaternion.x;
      Q[j * 4 + 1] = o.quaternion.y;
      Q[j * 4 + 2] = o.quaternion.z;
      Q[j * 4 + 3] = o.quaternion.w;
    }
    const hp = this.m.hips.position;
    this.savedHips.copy(hp);
    this.applied = true;
    // the trunk's shove: world → the root's frame (its yaw, its scale)
    if (this.tw.lengthSq() > 1e-12) {
      const yc = Math.cos(this.d.yaw), ys = Math.sin(this.d.yaw), sc = this.m.root.scale.x || 1, tw = this.tw;
      const lx = (tw.x * yc - tw.z * ys) / sc, lz = (tw.x * ys + tw.z * yc) / sc;
      if (Number.isFinite(lx + lz)) hp.set(hp.x + lx, hp.y + tw.y / sc, hp.z + lz);
    }
    for (let j = 0; j < J.length; j++) {
      const x = rv[j * 3], y = rv[j * 3 + 1], z = rv[j * 3 + 2];
      const a = Math.sqrt(x * x + y * y + z * z);
      if (!(a > 1e-7) || !Number.isFinite(a)) continue;
      const o = J[j];
      ax.set(x / a, y / a, z / a);
      qw.setFromAxisAngle(ax, Math.min(a, R.maxAngle));
      qp.setFromRotationMatrix(this._m.extractRotation(o.parent.matrixWorld));
      q.copy(qp).invert().multiply(qw).multiply(qp);
      o.quaternion.premultiply(q);
      if (!Number.isFinite(o.quaternion.x + o.quaternion.y + o.quaternion.z + o.quaternion.w)) o.quaternion.set(Q[j * 4], Q[j * 4 + 1], Q[j * 4 + 2], Q[j * 4 + 3]);
    }
    this.m.hips.updateMatrixWorld(true);

    // what moved where: each anchor's drawn move, the hurt spheres' drawn offsets, the membranes
    for (let i = 0; i < A.length; i++) this.delta[i].multiplyMatrices(A[i].matrixWorld, this._mInv.copy(this.before[i]).invert());
    const P = d._hurtPool, O = this.sphOff, v = this._v, v2 = this._v2;
    for (let i = 0; i < this.sphA.length && i < P.length; i++) {
      const h = P[i];
      v.set(h.x, h.y, h.z).applyMatrix4(this.delta[this.sphA[i]]);
      if (this.sphB[i] >= 0) v.lerp(v2.set(h.x, h.y, h.z).applyMatrix4(this.delta[this.sphB[i]]), 0.5);
      const ok = Number.isFinite(v.x + v.y + v.z);
      O[i * 3] = ok ? v.x - h.x : 0;
      O[i * 3 + 1] = ok ? v.y - h.y : 0;
      O[i * 3 + 2] = ok ? v.z - h.z : 0;
    }
    const ph = d.rig.pt.head;
    this.headShift.copy(ph).applyMatrix4(this.delta[this.aHead]).sub(ph);
    if (!Number.isFinite(this.headShift.x + this.headShift.y + this.headShift.z)) this.headShift.set(0, 0, 0);
    this._membranes();
  }

  _addRv(j, x, y, z) {
    const rv = this.rv, i = j * 3;
    rv[i] += x;
    rv[i + 1] += y;
    rv[i + 2] += z;
  }

  /** Turn joint j so world point T moves by D (the part of D across the joint → T line). */
  _nudge(j, tx, ty, tz, Dx, Dy, Dz, lever = 0) {
    const W = this.wp, i = j * 3;
    const rx = tx - W[i], ry = ty - W[i + 1], rz = tz - W[i + 2];
    const r2 = rx * rx + ry * ry + rz * rz;
    if (!(r2 > 1e-4)) return;
    const k = (rx * Dx + ry * Dy + rz * Dz) / r2;
    const px = Dx - rx * k, py = Dy - ry * k, pz = Dz - rz * k;
    // rv = (r x Dp) / r^2 (a point close to the joint turns it no more than one `lever` m out would)
    const q = Math.max(r2, lever * lever);
    this._addRv(j, (ry * pz - rz * py) / q, (rz * px - rx * pz) / q, (rx * py - ry * px) / q);
  }

  /**
   * A chain whose points move by g[k] x (vx, vy, vz) (g[0] = 0: its base stays): segment k turns (in
   * the world) so its end moves g[k + 1] - g[k] further than its start; a joint carries its parents'
   * turns, so each joint takes the difference from the segment before it.
   */
  _chain(idx, pts, g, n, vx, vy, vz) {
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < n; k++) {
      const dg = g[k + 1] - g[k], i = k * 3;
      const rx = pts[i + 3] - pts[i], ry = pts[i + 4] - pts[i + 1], rz = pts[i + 5] - pts[i + 2];
      const r2 = rx * rx + ry * ry + rz * rz;
      let wx = 0, wy = 0, wz = 0;
      if (r2 > 1e-4 && Math.abs(dg) > 1e-7) {
        const Dx = vx * dg, Dy = vy * dg, Dz = vz * dg;
        const kk = (rx * Dx + ry * Dy + rz * Dz) / r2;
        const px = Dx - rx * kk, py = Dy - ry * kk, pz = Dz - rz * kk;
        wx = (ry * pz - rz * py) / r2;
        wy = (rz * px - rx * pz) / r2;
        wz = (rx * py - ry * px) / r2;
      }
      this._addRv(idx[k], wx - ox, wy - oy, wz - oz);
      ox = wx;
      oy = wy;
      oz = wz;
    }
  }

  _head(p, t) {
    const H = R.head, n = this.nN, g = this.gN, a = H.amp * p.wk;
    const s = snap(t, p.w, p.z);
    // the snout goes along the cut at once (the head turns on the neck's end)
    const sn = this.d.rig.pt.snout;
    this._nudge(this.iHead, sn.x, sn.y, sn.z, p.dx * a * s, p.dy * a * s, p.dz * a * s);
    // the top of the neck gives at once; the rest carries the head on a beat later, from the top down
    g[0] = 0;
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      g[k] = (H.top * s + H.follow * wave(t, H.delay + (n - k) * H.travel, p.w, p.z)) * Math.pow(f, 1.5);
    }
    this._chain(this.iNeckPts, this.pN, g, n, p.dx * a, p.dy * a, p.dz * a);
  }

  _neck(p, t) {
    const N = R.neck, n = this.nN, g = this.gN, a = N.amp * p.wk;
    // below the contact the neck bends at once to carry it (most near the contact); above it the neck
    // is carried, and a whip runs on up to the head
    const s = snap(t, p.w, p.z), c = Math.max(0.5, p.c);
    g[0] = 0;
    for (let k = 1; k <= n; k++) {
      if (k <= c) g[k] = s * (k / c) * (k / c);
      else g[k] = N.carry * s + (1 - N.carry) * wave(t, (k - c) * N.travel, p.w, p.z) * (1 + (N.whip * (k - c)) / Math.max(1, n - c));
    }
    this._chain(this.iNeckPts, this.pN, g, n, p.dx * a, p.dy * a, p.dz * a);
  }

  _tail(p, t) {
    const T = R.tail, n = this.nT, g = this.gT, a = T.amp * p.wk;
    // as the neck: bent at once up to the contact, carried beyond it, the lash growing toward the tip
    const s = snap(t, p.w, p.z), c = Math.max(0.5, p.c);
    g[0] = 0;
    for (let k = 1; k <= n; k++) {
      if (k <= c) g[k] = s * (k / c) * (k / c);
      else g[k] = T.carry * s + (1 - T.carry) * wave(t, (k - c) * T.travel, p.w, p.z) * (1 + (T.grow * (k - c)) / Math.max(1, n - c));
    }
    this._chain(this.iTail, this.pT, g, n, p.dx * a, 0, p.dz * a);
  }

  _body(p, t) {
    const B = R.body, wk = p.wk, s = snap(t, p.w, p.z);
    // the contact now: on the joint it rides on, in the body's frame turned by its yaw
    const W = this.wp, j = p.ai * 3, c = Math.cos(this.d.yaw), sn = Math.sin(this.d.yaw);
    const tx = W[j] + p.ox * c + p.oz * sn, ty = W[j + 1] + p.oy, tz = W[j + 2] - p.ox * sn + p.oz * c;
    // the whole trunk is shoved along the blade's travel (the feet stay planted: _keepFoot)
    const sh = B.shove * wk * s;
    this.tw.x += p.dx * sh;
    this.tw.z += p.dz * sh;
    // ... and swings on the hips: the struck end goes further (a blow on the rump only shoves it)
    const sw = B.swing * wk * s * (1 - p.u);
    this._nudge(this.iHips, tx, ty, tz, p.dx * sw, 0, p.dz * sw, B.lever);
    // the struck side gives: it sinks (the ribcage rolls over the shoulder, the rump over the hip)
    const gv = B.give * wk * s;
    this._nudge(p.u < 0.5 ? this.iChest : this.iHips, tx, ty, tz, 0, -gv, 0, B.lever);
    // a small lash runs down the tail
    const n = this.nT, g = this.gT;
    g[0] = 0;
    for (let k = 1; k <= n; k++) g[k] = (k / n) * wave(t, k * B.travel, p.w, p.z);
    const la = B.tailLash * wk;
    this._chain(this.iTail, this.pT, g, n, p.dx * la, 0, p.dz * la);
  }

  _leg(p, t) {
    const L = R.leg, a = L.amp * p.wk, s = snap(t, p.w, p.z), W = this.wp, k = p.side;
    const upper = p.front ? this.iHum[k] : this.iThigh[k];
    const lower = p.front ? this.iFore[k] : this.iShin[k];
    // the knee / elbow driven along the cut and down (the foot is kept below: _keepFoot)
    const i = lower * 3;
    this._nudge(upper, W[i], W[i + 1], W[i + 2], p.dx * a * s, -L.down * a * s, p.dz * a * s);
    // the body dips over that leg
    const r = upper * 3, dip = L.dip * p.wk * s;
    this._nudge(p.front ? this.iChest : this.iHips, W[r], W[r + 1], W[r + 2], 0, -dip, 0, L.lever);
  }

  _wing(p, t) {
    const G = R.wing, a = G.amp * p.wk, s = snap(t, p.w, p.z), k = p.side, w = this.m.wings[k];
    const wr = this._v.setFromMatrixPosition(w.wrist.matrixWorld);
    this._nudge(this.iWHum[k], wr.x, wr.y, wr.z, p.dx * a * s, -G.down * a * s, p.dz * a * s);
    // the hand folds in toward the wing's root
    const rt = this._v2.setFromMatrixPosition(w.root.matrixWorld).sub(wr);
    const l = rt.length();
    if (l > 1e-4) {
      const f = (G.fold * a * s) / l;
      this._nudge(this.iWFore[k], wr.x, wr.y, wr.z, rt.x * f, rt.y * f, rt.z * f);
    }
  }

  /** The foot (`end` joint) stays where it was: the lower bone turns back what its parents moved it. */
  _keepFoot(end, lower, parents) {
    const rv = this.rv, W = this.wp;
    const e = end.matrixWorld.elements, fx = e[12], fy = e[13], fz = e[14];
    let mx = this.tw.x, my = this.tw.y, mz = this.tw.z;
    for (const j of parents) {
      const i = j * 3, x = rv[i], y = rv[i + 1], z = rv[i + 2];
      if (!x && !y && !z) continue;
      const rx = fx - W[i], ry = fy - W[i + 1], rz = fz - W[i + 2];
      mx += y * rz - z * ry;
      my += z * rx - x * rz;
      mz += x * ry - y * rx;
    }
    if (mx * mx + my * my + mz * mz < 1e-10) return;
    this._nudge(lower, fx, fy, fz, -mx, -my, -mz);
  }

  /** The wing membranes from the moved joints (they are built from points, not joints). */
  _membranes() {
    const m = this.m, pt = this.d.rig.pt, D = this.delta;
    this._rootInv.copy(m.root.matrixWorld).invert();
    for (let k = 0; k < m.wings.length && k < 2; k++) {
      const w = m.wings[k], wp = pt.wings[k], a = this.wingA[k], mp = this.memPts[k];
      if (!w.membrane?.update || !wp) continue;
      mp.root.copy(wp.root).applyMatrix4(D[a.root]);
      mp.elbow.copy(wp.elbow).applyMatrix4(D[a.elbow]);
      mp.wrist.copy(wp.wrist).applyMatrix4(D[a.wrist]);
      mp.hip.copy(wp.attachH).applyMatrix4(D[a.hip]);
      for (let f = 0; f < 4; f++) {
        mp.knuckles[f].copy(wp.knuckles[f]).applyMatrix4(D[a.fingers[f]]);
        mp.tips[f].copy(wp.tips[f]).applyMatrix4(D[a.fingers[f]]);
      }
      w.membrane.update(mp, this._rootInv);
    }
  }
}

/** The nearest point of a chain (world points p[0..n]) to (x, y, z), as k + the share along segment k. */
function nearestOnChain(p, x, y, z) {
  let best = 0, bd = Infinity;
  for (let k = 0; k + 1 < p.length; k++) {
    const a = p[k], b = p[k + 1];
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, e2 = ex * ex + ey * ey + ez * ez;
    const u = e2 > 1e-9 ? Math.min(1, Math.max(0, ((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / e2)) : 0;
    const qx = a.x + ex * u - x, qy = a.y + ey * u - y, qz = a.z + ez * u - z, dd = qx * qx + qy * qy + qz * qz;
    if (dd < bd) {
      bd = dd;
      best = k + u;
    }
  }
  return best;
}
