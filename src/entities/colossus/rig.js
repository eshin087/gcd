import * as THREE from 'three';
import { solveTwoBone } from '../dragon/rig/ik.js';
import { BODY, POSE } from './tuning.js';
import { SHELF, rimZ } from '../../world/tideShelf.js';

// The Tide Colossus's rig (procedural, no clips; ADR-141): each hand and the head is driven to a pose
// target by a critically damped spring, so everything moves like mass. The actions (attacks.js) write
// the targets every frame (`hand[i].tgt`, `head.tgt`, `curl`, `jaw`, ...); the rig integrates the
// springs, solves the arms (two-bone IK from the shoulders), lays the neck along a curve from the yoke
// to the back of the skull, and writes the joints. `pt` holds the world points gameplay reads (palms,
// wrists, fingertips, the maw, the head's middle). No allocation per frame.

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Aim `obj` (a child of the root) so +Z runs along f and +Y leans toward u. */
function orient(obj, f, u) {
  _z.copy(f);
  if (!(_z.lengthSq() > 1e-8)) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(u, _z);
  if (_x.lengthSq() < 1e-6) _x.crossVectors(_z.x > 0.9 ? _y.set(0, 0, 1) : _y.set(1, 0, 0), _z);
  _x.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
}

/** A critically damped spring on a vector: pos chases tgt at stiffness k (1/s). */
function spring(pos, vel, tgt, k, dt) {
  const ax = -k * k * (pos.x - tgt.x) - 2 * k * vel.x;
  const ay = -k * k * (pos.y - tgt.y) - 2 * k * vel.y;
  const az = -k * k * (pos.z - tgt.z) - 2 * k * vel.z;
  vel.x += ax * dt;
  vel.y += ay * dt;
  vel.z += az * dt;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class ColossusRig {
  constructor(model) {
    this.model = model;
    const hand = (s) => ({
      s,
      pos: v3(), vel: v3(), tgt: v3(), // the wrist
      fwd: v3(0, -0.3, 1), fwdT: v3(0, -0.3, 1), // toward the fingers
      up: v3(0, 1, 0), upT: v3(0, 1, 0), // the back of the hand
      curl: 0.6, curlT: 0.6, spread: 0, spreadT: 0,
      k: 0, // stiffness override this frame (0 = the phase's)
      snap: false, // put it on its target this frame (a slam's drop, a reset)
      elbow: v3(), reach: v3(), bend: v3(s * 0.5, -1, 0).normalize(),
      speed: 0,
    });
    this.hands = [hand(-1), hand(1)];
    this.head = {
      maw: v3(), vel: v3(), tgt: v3(), fwd: v3(0, -0.25, 1), fwdT: v3(0, -0.25, 1), jaw: 0.1, jawT: 0.1, k: 0, snap: false, speed: 0,
    };
    this.sway = v3();
    this.swayVel = v3();
    this.swayT = v3();
    this.sink = 0; // the whole body lowered into the sea (m): the intro's rise, the death's fall
    this.sinkT = 0;
    this.phase = 1;
    /** World points gameplay reads (written every update). */
    this.pt = {
      palm: [v3(), v3()], wrist: [v3(), v3()], elbow: [v3(), v3()], shoulder: [v3(), v3()],
      tips: [[v3(), v3(), v3(), v3()], [v3(), v3(), v3(), v3()]], thumb: [v3(), v3()],
      maw: v3(), head: v3(), chin: v3(), throat: v3(), neck: [v3(), v3(), v3(), v3()], root: v3(),
    };
    this._mawLocal = v3(0, -0.4, BODY.head.len * 0.74);
  }

  /** Stiffness of the hands / head in this phase. */
  stiff(kind) {
    const a = POSE.stiff[kind];
    return a[Math.max(0, Math.min(a.length - 1, this.phase - 1))];
  }

  /** Put everything on its target now (a reset, the Lab). */
  snap() {
    for (const h of this.hands) {
      h.pos.copy(h.tgt);
      h.vel.set(0, 0, 0);
      h.fwd.copy(h.fwdT);
      h.up.copy(h.upT);
      h.curl = h.curlT;
      h.spread = h.spreadT;
    }
    const H = this.head;
    H.maw.copy(H.tgt);
    H.vel.set(0, 0, 0);
    H.fwd.copy(H.fwdT);
    H.jaw = H.jawT;
    this.sway.copy(this.swayT);
    this.swayVel.set(0, 0, 0);
    this.sink = this.sinkT;
  }

  update(dt) {
    const M = this.model, root = M.root;
    if (dt > 0) {
      const d = Math.min(dt, 0.05);
      for (const h of this.hands) {
        const x0 = h.pos.x, y0 = h.pos.y, z0 = h.pos.z;
        if (h.snap) {
          h.pos.copy(h.tgt);
          h.vel.set(0, 0, 0);
        } else spring(h.pos, h.vel, h.tgt, h.k > 0 ? h.k : this.stiff('hand'), d);
        h.snap = false;
        h.k = 0;
        h.speed = Math.hypot(h.pos.x - x0, h.pos.y - y0, h.pos.z - z0) / d;
        const f = 1 - Math.exp(-8 * d);
        h.fwd.lerp(h.fwdT, f).normalize();
        h.up.lerp(h.upT, f).normalize();
        h.curl += (h.curlT - h.curl) * (1 - Math.exp(-10 * d));
        h.spread += (h.spreadT - h.spread) * (1 - Math.exp(-10 * d));
      }
      const H = this.head;
      const m0x = H.maw.x, m0y = H.maw.y, m0z = H.maw.z;
      if (H.snap) {
        H.maw.copy(H.tgt);
        H.vel.set(0, 0, 0);
      } else spring(H.maw, H.vel, H.tgt, H.k > 0 ? H.k : this.stiff('head'), d);
      H.snap = false;
      H.k = 0;
      H.speed = Math.hypot(H.maw.x - m0x, H.maw.y - m0y, H.maw.z - m0z) / d;
      H.fwd.lerp(H.fwdT, 1 - Math.exp(-5 * d)).normalize();
      H.jaw += (H.jawT - H.jaw) * (1 - Math.exp(-9 * d));
      spring(this.sway, this.swayVel, this.swayT, BODY.sway.k, d);
      this.sink += (this.sinkT - this.sink) * (1 - Math.exp(-2.5 * d));
    }
    // ---- the root: the body's anchor, leaning into the blow and lowered by `sink`
    const R = BODY.root;
    root.position.set(R.x + this.sway.x, R.y + this.sway.y - this.sink, R.z + this.sway.z);
    const rp = root.position, P = this.pt;
    P.root.copy(rp);
    // the body masses lean a little with the sway (drawn only)
    M.body.rotation.set(-this.sway.z * 0.01, 0, -this.sway.x * 0.012);
    // ---- the arms
    const S = BODY.shoulder;
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i], A = M.arms[i], s = h.s;
      const sh = P.shoulder[i].set(s * S.x + this.sway.x * 0.8, S.y + this.sway.y - this.sink, S.z + this.sway.z * 0.8);
      _a.set(s * 0.55, -1, 0.1); // the elbow's pole: down and out
      solveTwoBone(sh, h.pos, BODY.upper, BODY.fore, _a, h.elbow, h.reach, h.bend, BODY.soft);
      P.elbow[i].copy(h.elbow);
      P.wrist[i].copy(h.reach);
      A.upper.position.subVectors(sh, rp);
      orient(A.upper, _b.subVectors(h.elbow, sh), UP);
      A.fore.position.subVectors(h.elbow, rp);
      orient(A.fore, _b.subVectors(h.reach, h.elbow), UP);
      A.hand.position.subVectors(h.reach, rp);
      orient(A.hand, h.fwd, h.up);
      for (let k = 0; k < A.fingers.length; k++) {
        const F = A.fingers[k], c = h.curl * (1 + (k === 0 || k === 3 ? 0.08 : 0));
        F.k.rotation.x = c * 0.85 - 0.15;
        F.k.rotation.y = ((k - 1.5) / 1.5) * (0.12 + 0.22 * h.spread);
        F.t.rotation.x = c * 1.15;
      }
      A.thumb.k.rotation.x = h.curl * 0.6;
      A.thumb.t.rotation.x = 0.4 + h.curl * 0.8;
    }
    // ---- the head and the neck
    const H = this.head;
    orient(M.head, H.fwd, UP);
    // the skull's back from the maw: maw - R * mawLocal
    _c.copy(this._mawLocal).applyQuaternion(M.head.quaternion);
    _b.subVectors(H.maw, _c); // the back of the skull (world)
    M.head.position.subVectors(_b, rp);
    const NB = BODY.neckBase;
    const n0 = P.neck[0].set(NB.x + this.sway.x * 0.6, NB.y + this.sway.y - this.sink, NB.z + this.sway.z * 0.6);
    const n3 = P.neck[3].copy(_b);
    // a quadratic curve from the yoke to the skull, bowed up (the neck arches into the head)
    _c.addVectors(n0, n3).multiplyScalar(0.5);
    _c.y += 3.2;
    _c.z -= 1.2;
    for (let k = 1; k < 3; k++) {
      const t = k / 3, u = 1 - t;
      P.neck[k].set(u * u * n0.x + 2 * u * t * _c.x + t * t * n3.x, u * u * n0.y + 2 * u * t * _c.y + t * t * n3.y, u * u * n0.z + 2 * u * t * _c.z + t * t * n3.z);
    }
    for (let k = 0; k < 3; k++) {
      const j = M.neck[k], a = P.neck[k], b = P.neck[k + 1];
      j.position.subVectors(a, rp);
      _b.subVectors(b, a);
      orient(j, _b, UP);
      j.scale.set(1, 1, Math.max(0.4, _b.length() / 4.6));
    }
    for (let k = 0; k < 2; k++) {
      const j = M.mand[k], sx = k === 0 ? -1 : 1;
      j.rotation.set(H.jaw * 0.38, sx * H.jaw * 0.42, 0);
    }
    root.updateMatrixWorld(true);
    // ---- the points gameplay reads
    for (let i = 0; i < 2; i++) {
      const A = M.arms[i];
      P.palm[i].set(0, -0.2, BODY.palm.len * 0.55).applyMatrix4(A.hand.matrixWorld);
      for (let k = 0; k < 4; k++) {
        const F = A.fingers[k];
        P.tips[i][k].set(0, 0, F.l1).applyMatrix4(F.t.matrixWorld);
      }
      P.thumb[i].set(0, 0, 1.1).applyMatrix4(A.thumb.t.matrixWorld);
    }
    P.maw.copy(H.maw);
    P.head.set(0, 0.2, BODY.head.len * 0.45).applyMatrix4(M.head.matrixWorld);
    P.chin.set(0, -BODY.head.tall * 0.3, BODY.head.len * 0.62).applyMatrix4(M.head.matrixWorld);
    P.throat.copy(P.neck[2]);
  }
}

// ---- pose helpers the actions use (targets only; the rig moves toward them)
const _t = new THREE.Vector3();

/** The resting grip: fingers hooked over the rim at x = s * grip.x, the head looking over it. */
export function poseGrip(h, s, phaseLean = 0) {
  const G = POSE.grip, x = s * G.x, rz = rimZ(x);
  // the palm over the rim's lip, the fingers laid flat on the shelf (their claws dig in)
  h.tgt.set(x, G.y + phaseLean, rz - G.back);
  h.fwdT.set(s * 0.12, -0.42, 1);
  h.upT.set(0, 1, 0.3);
  h.curlT = -0.1;
  h.spreadT = 0.45;
}

/** Hover flat over the ground point (x, z): the palm `lift` m up (clamped by the phone rule), fingers spread. */
export function poseHover(h, x, z, lift, s, spread = 1, fist = false) {
  const P = BODY.palm;
  // the wrist sits behind the palm's middle, toward the body (north)
  h.tgt.set(x - s * 0.2, Math.min(POSE.lift, lift) + 0.6, z - P.len * 0.55);
  h.fwdT.set(0, -0.08, 1);
  h.upT.set(0, 1, 0);
  h.curlT = fist ? 1.25 : 0.05;
  h.spreadT = fist ? 0 : spread;
}

/** Lying on the ground after a blow, palm flat at (x, z). */
export function posePlanted(h, x, z, s, fist = false) {
  const P = BODY.palm;
  h.tgt.set(x - s * 0.2, fist ? 0.9 : 0.55, z - P.len * 0.55);
  h.fwdT.set(0, -0.05, 1);
  h.upT.set(0, 1, 0);
  h.curlT = fist ? 1.25 : 0.2;
  h.spreadT = fist ? 0 : 0.7;
}

/** Pulled back off the cliff (a hand that let go). */
export function poseReel(h, s) {
  const R = POSE.reel, x = s * R.x;
  h.tgt.set(x, R.y, rimZ(x) - R.back);
  h.fwdT.set(s * 0.3, 0.4, 1);
  h.upT.set(0, 1, -0.2);
  h.curlT = 1.0;
  h.spreadT = 0;
}

/** The forearm laid along the rim for a sweep: the hand on the shelf at x, leading toward `dir` (±1). */
export function poseLaid(h, x, band, dir) {
  const z = rimZ(x) + band * 0.62;
  h.tgt.set(x, 0.9, z - 1.2);
  h.fwdT.set(dir * 0.9, -0.15, 0.45);
  h.upT.set(0, 1, 0);
  h.curlT = 0.35;
  h.spreadT = 0.4;
}

/** The head: loom (watching over the rim), rear (the breath's windup), down (chin on the rim). */
export function poseHead(H, kind, hx) {
  const z0 = rimZ(hx);
  if (kind === 'down') {
    H.tgt.set(hx, POSE.down.y, z0 + POSE.down.fwd);
    H.fwdT.set(0, -0.3, 1);
    H.jawT = 0.25;
  } else if (kind === 'rear') {
    H.tgt.set(hx, POSE.rear.y, z0 - POSE.rear.back);
    H.fwdT.set(0, 0.05, 1);
    H.jawT = 0.85;
  } else {
    H.tgt.set(hx, POSE.loom.y, z0 - POSE.loom.back);
    H.fwdT.set(0, -0.32, 1);
    H.jawT = 0.12;
  }
}

/** Where a hand may land: on the shelf, never past the rim or the scarp. */
export function clampShelf(out, x, z) {
  const S = POSE.shelf;
  const cx = Math.max(-S.xMax, Math.min(S.xMax, x));
  const z0 = rimZ(cx) + S.zMin;
  out.x = cx;
  out.z = Math.max(z0, Math.min(S.zMax, z));
  return out;
}

export { _t as _scratch, SHELF };
