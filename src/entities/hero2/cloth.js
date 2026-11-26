import * as THREE from 'three';
import { JI } from './skeleton.js';

// The remade hero's cloth: the cloak's sheets and the coat tails as SPRING CHAINS. Each sheet is a
// chain of particles down its middle, its first pinned to an anchor on a bone (bodyParts.js
// buildStrands). Every game step:
//   1. the anchors and the body's colliders are read from the posed skeleton (solveFK's `world`) and
//      carried into SIM space: the world's metres without the drawn lean and scale (the body's own
//      position and rotation applied), so running, turning and jumping swing the cloth by inertia;
//   2. fixed substeps (CLOTH.substep, at most maxSub; the anchors are eased across them):
//      Verlet with gravity, air drag against the world's wind (game.world.life.wind: CLAUDE.md, the
//      one wind), damping; then constraints, root to tip: the link length (inextensible, the root
//      pinned), the HANG (each link pulled toward the sheet's rest hang: straight down with its outward
//      flare, stiffer at the root), a swing limit off straight down, the colliders (capsules round the
//      legs, the trunk, the arms, the head, the blades: each sheet has its own set) and the ground;
//   3. each stretch of the sheet (its rigid geometry, one batched bone) is set on its link: its top
//      on the particle, its length down the link, its width axis carried down from the anchor (no
//      twist from link to link), back in the body's frame.
// Deterministic (no Math.random), no allocation per step, never throws on a NaN (a strand that goes
// non-finite is settled again). `settle()` (body.reset) puts every sheet at its rest hang against the
// colliders with no velocity: after a teleport, a clip jump, the first frame.

/** The cloth's numbers (per kind: skirt = the coat tails, cloak = the back sheets, drape = the arm sheets). */
export const CLOTH = {
  substep: 1 / 120, // s
  maxSub: 8,
  gravity: 9.8, // m/s²
  iters: 2, // constraint passes per substep
  settleIters: 40, // passes for settle()
  jump: 1.5, // m: an anchor that moves further than this in one step is a teleport (settle)
  maxDt: 0.2, // s: a longer step is a hitch (settle)
  kinds: {
    // damp: 1/s velocity loss; drag: 1/s toward the air's velocity (how far it trails at a run);
    // hang: the pull toward the rest hang per link, root → tip (per pass, 0..1); max: rad off straight
    // down; clear: m the cloth keeps off a collider; cols: which colliders it meets (COL bits)
    skirt: { damp: 2.2, drag: 1.4, hang: [0.3, 0.18, 0.1, 0.06], max: 1.35, clear: 0.02, cols: 0 },
    cloak: { damp: 1.6, drag: 1.1, hang: [0.22, 0.12, 0.07, 0.05], max: 1.45, clear: 0.03, cols: 0 },
    drape: { damp: 1.8, drag: 1.0, hang: [0.25, 0.14, 0.08, 0.05], max: 1.45, clear: 0.025, cols: 0 },
  },
};

/** Collider bits. */
export const COL = { TORSO: 1, THIGH_L: 2, THIGH_R: 4, SHIN_L: 8, SHIN_R: 16, UARM_L: 32, UARM_R: 64, FARM_L: 128, FARM_R: 256, HEAD: 512, BLADE_R: 1024, BLADE_L: 2048 };
const LEGS = COL.THIGH_L | COL.THIGH_R | COL.SHIN_L | COL.SHIN_R;
CLOTH.kinds.skirt.cols = LEGS | COL.FARM_L | COL.FARM_R | COL.BLADE_R | COL.BLADE_L;
CLOTH.kinds.cloak.cols = LEGS | COL.TORSO | COL.UARM_L | COL.UARM_R | COL.HEAD | COL.BLADE_R | COL.BLADE_L;
CLOTH.kinds.drape.cols = LEGS | COL.TORSO | COL.HEAD | COL.BLADE_R | COL.BLADE_L;

const NCOL = 12;
// capsule ends (joint index pairs; -1 = the blade's point) and radii (x the girth factor)
const CAPS = [
  // [bit, a, b, r]
  [COL.TORSO, JI.spine, JI.neck, 0.12],
  [COL.THIGH_L, JI.thighL, JI.shinL, 0.078],
  [COL.THIGH_R, JI.thighR, JI.shinR, 0.078],
  [COL.SHIN_L, JI.shinL, JI.footL, 0.058],
  [COL.SHIN_R, JI.shinR, JI.footR, 0.058],
  [COL.UARM_L, JI.upperArmL, JI.foreArmL, 0.062],
  [COL.UARM_R, JI.upperArmR, JI.foreArmR, 0.062],
  [COL.FARM_L, JI.foreArmL, JI.handL, 0.052],
  [COL.FARM_R, JI.foreArmR, JI.handR, 0.052],
  [COL.HEAD, JI.head, JI.head, 0.13],
  [COL.BLADE_R, JI.weaponR, -1, 0.03],
  [COL.BLADE_L, JI.weaponL, -1, 0.03],
];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/** Rotate (x, y, z) by the quaternion at q[o..o+3] into out[k..k+2]. */
function rot(q, o, x, y, z, out, k) {
  const qx = q[o], qy = q[o + 1], qz = q[o + 2], qw = q[o + 3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[k] = x + qw * tx + (qy * tz - qz * ty);
  out[k + 1] = y + qw * ty + (qz * tx - qx * tz);
  out[k + 2] = z + qw * tz + (qx * ty - qy * tx);
}
/** a * b (quaternions at a[ao], b[bo]) into out[o]. */
function qmul(a, ao, b, bo, out, o) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3], bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

export class Cloth {
  /**
   * `strands` (bodyParts.js buildStrands) with `holders` set on each (one Object3D per stretch, under
   * the body's group); `g` = the build's girth factor; `bladeLen` = the drawn blade (socket +Z).
   */
  constructor(strands, g = 1, bladeLen = 0.93) {
    this.g = g;
    this.bladeLen = bladeLen;
    this.S = strands.map((st) => {
      const n = st.segs.length;
      const K = CLOTH.kinds[st.kind];
      const lens = new Float32Array(n);
      for (let i = 0; i < n; i++) lens[i] = st.segs[i].len;
      // the anchor's frame on its bone: Rz(rz) Ry(ry) (bodyParts.js: X across, Z the outer face)
      _q.setFromEuler(new THREE.Euler(0, st.ry, st.rz ?? 0, 'ZYX'));
      return {
        def: st, K, n, lens, holders: st.holders, bone: JI[st.bone], ref: JI[st.ref],
        at: new Float32Array(st.at), qa: new Float32Array([_q.x, _q.y, _q.z, _q.w]),
        // the outward flare at rest in the ref bone's frame (horizontal: the anchor's outer face)
        outL: new Float32Array([Math.sin(st.ry), 0, Math.cos(st.ry)]), out: st.out ?? 0.2,
        drag: K.drag * (st.lag != null ? 0.6 + 0.8 * st.lag : 1),
        p: new Float32Array((n + 1) * 3), o: new Float32Array((n + 1) * 3),
        a0: new Float32Array(3), a1: new Float32Array(3), // the anchor, last step / this step (sim space)
        ax: new Float32Array(3), az: new Float32Array(3), // the anchor's across / outer axes (sim)
        dir: new Float32Array(3), // the rest hang (sim, unit)
        wind: new Float32Array(2), ok: false,
      };
    });
    this.cap = new Float32Array(NCOL * 7); // ax ay az bx by bz r (sim space)
    this.bits = new Int32Array(NCOL);
    this.ground = 0;
    this.groundY = 0; // the floor's height (body.groundY)
    this.objP = new Float32Array(3);
    this.objQ = new Float32Array(4);
    this.qTmp = new Float32Array(4);
    this.v3 = new Float32Array(3);
    this._w = { x: 0, z: 0, k: 0 };
    this.ready = false;
  }

  /** Read the body's place (its group's position and rotation: sim = place + rotate(local)). */
  _place(obj) {
    const P = this.objP, Q = this.objQ;
    P[0] = obj.position.x;
    P[1] = obj.position.y;
    P[2] = obj.position.z;
    Q[0] = obj.quaternion.x;
    Q[1] = obj.quaternion.y;
    Q[2] = obj.quaternion.z;
    Q[3] = obj.quaternion.w;
    // the ground under him: the world's floor (y = groundY; the levels are flat), not his root, which a
    // jump or a plunge may lift
    this.ground = Number.isFinite(this.groundY) ? this.groundY : 0;
  }

  /** body-frame point (x, y, z) -> sim space, into out[k..]. */
  _toSim(x, y, z, out, k) {
    rot(this.objQ, 0, x, y, z, out, k);
    out[k] += this.objP[0];
    out[k + 1] += this.objP[1];
    out[k + 2] += this.objP[2];
  }

  /** The anchors, their frames, the rest hangs and the colliders from the posed skeleton. */
  _read(world, wind) {
    const Wp = world.p, Wr = world.r, g = this.g, t = this.v3, q = this.qTmp;
    for (const s of this.S) {
      s.a0.set(s.a1);
      const b = s.bone;
      rot(Wr, b * 4, s.at[0], s.at[1], s.at[2], t, 0);
      this._toSim(Wp[b * 3] + t[0], Wp[b * 3 + 1] + t[1], Wp[b * 3 + 2] + t[2], s.a1, 0);
      // the anchor's frame in sim space: objQ * boneR * qa
      qmul(Wr, b * 4, s.qa, 0, q, 0);
      qmul(this.objQ, 0, q, 0, q, 0);
      rot(q, 0, 1, 0, 0, s.ax, 0);
      rot(q, 0, 0, 0, 1, s.az, 0);
      // the rest hang: straight down, flared out along the anchor's outer face as the ref bone holds it
      qmul(this.objQ, 0, Wr, s.ref * 4, q, 0);
      rot(q, 0, s.outL[0], s.outL[1], s.outL[2], t, 0);
      // (the flare goes with how much the outer face looks sideways: a body lying on its back turns the
      // back's face to the ground, and its little horizontal part must not pick a direction at random)
      const h = Math.hypot(t[0], t[2]), fl = h > 1e-4 ? (s.out * Math.min(1, h / 0.7)) / h : 0;
      let dx = t[0] * fl, dy = -1, dz = t[2] * fl;
      const l = Math.hypot(dx, dy, dz);
      s.dir[0] = dx / l;
      s.dir[1] = dy / l;
      s.dir[2] = dz / l;
      const w = wind?.at?.(s.a1[0], s.a1[2], this._w);
      s.wind[0] = Number.isFinite(w?.x) ? w.x : 0;
      s.wind[1] = Number.isFinite(w?.z) ? w.z : 0;
    }
    const C = this.cap;
    for (let i = 0; i < CAPS.length; i++) {
      const [bit, a, b, r] = CAPS[i];
      this.bits[i] = bit;
      this._toSim(Wp[a * 3], Wp[a * 3 + 1], Wp[a * 3 + 2], C, i * 7);
      if (b >= 0) this._toSim(Wp[b * 3], Wp[b * 3 + 1], Wp[b * 3 + 2], C, i * 7 + 3);
      else {
        // the blade: from the socket along its +Z
        rot(Wr, a * 4, 0, 0, this.bladeLen, t, 0);
        this._toSim(Wp[a * 3] + t[0], Wp[a * 3 + 1] + t[1], Wp[a * 3 + 2] + t[2], C, i * 7 + 3);
      }
      C[i * 7 + 6] = r * g;
    }
  }

  /** Blades a hand does not hold collide with nothing (bit off). */
  setBlades(R, L) {
    this.bladeR = !!R;
    this.bladeL = !!L;
  }

  _collide(s, i) {
    const p = s.p, k = i * 3, C = this.cap, mask = s.K.cols, clear = s.K.clear;
    for (let c = 0; c < CAPS.length; c++) {
      const bit = this.bits[c];
      if (!(mask & bit)) continue;
      if (bit === COL.BLADE_R && !this.bladeR) continue;
      if (bit === COL.BLADE_L && !this.bladeL) continue;
      if (s.def.arm && ((s.def.arm === 'L' && (bit === COL.UARM_L || bit === COL.FARM_L)) || (s.def.arm === 'R' && (bit === COL.UARM_R || bit === COL.FARM_R)))) continue;
      const o = c * 7, ax = C[o], ay = C[o + 1], az = C[o + 2];
      const ux = C[o + 3] - ax, uy = C[o + 4] - ay, uz = C[o + 5] - az;
      const R = C[o + 6] + clear;
      const L2 = ux * ux + uy * uy + uz * uz;
      let t = L2 > 1e-8 ? ((p[k] - ax) * ux + (p[k + 1] - ay) * uy + (p[k + 2] - az) * uz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + ux * t, cy = ay + uy * t, cz = az + uz * t;
      let dx = p[k] - cx, dy = p[k + 1] - cy, dz = p[k + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R * R) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-5) {
        // dead centre: out along the anchor's outer face
        dx = s.az[0];
        dy = s.az[1];
        dz = s.az[2];
        d = 1;
      }
      // under the capsule's axis, near the ground (a body lying down, the cloth under it): out sideways
      // along the ground, not down into it (the ground would throw it back up into the body, then out
      // over the top: the sheets stood up round him)
      if (dy < 0 && p[k + 1] - this.ground < R * 2) {
        const hd = Math.hypot(dx, dz), r2 = R * R - dy * dy;
        let hx = dx, hz = dz;
        if (hd < 1e-5) {
          const ah = Math.hypot(s.az[0], s.az[2]) || 1;
          hx = s.az[0] / ah;
          hz = s.az[2] / ah;
        } else {
          hx /= hd;
          hz /= hd;
        }
        const hr = r2 > 0 ? Math.sqrt(r2) : 0;
        p[k] = cx + hx * hr;
        p[k + 2] = cz + hz * hr;
        continue;
      }
      const f = R / d;
      p[k] = cx + dx * f;
      p[k + 1] = cy + dy * f;
      p[k + 2] = cz + dz * f;
    }
    const gy = this.ground + clear;
    if (p[k + 1] < gy) p[k + 1] = gy;
  }

  /** One pass of the constraints over strand s (anchor at a). */
  _constrain(s, a, hangK) {
    const p = s.p, n = s.n, K = s.K, gy = this.ground + K.clear;
    p[0] = a[0];
    p[1] = a[1];
    p[2] = a[2];
    for (let i = 1; i <= n; i++) {
      const k = i * 3, j = k - 3, L = s.lens[i - 1];
      // the hang: toward the rest hang from the link's root
      const hk = (K.hang[Math.min(i - 1, K.hang.length - 1)] ?? 0) * hangK;
      if (hk > 0) {
        p[k] += (p[j] + s.dir[0] * L - p[k]) * hk;
        p[k + 1] += (p[j + 1] + s.dir[1] * L - p[k + 1]) * hk;
        p[k + 2] += (p[j + 2] + s.dir[2] * L - p[k + 2]) * hk;
      }
      this._collide(s, i);
      // the link's length and its swing off straight down
      let dx = p[k] - p[j], dy = p[k + 1] - p[j + 1], dz = p[k + 2] - p[j + 2];
      let d = Math.hypot(dx, dy, dz);
      if (!(d > 1e-6)) {
        dx = s.dir[0];
        dy = s.dir[1];
        dz = s.dir[2];
        d = 1;
      }
      dx /= d;
      dy /= d;
      dz /= d;
      // the swing limit off straight down; a link whose root is near the ground may lie flat on it (the
      // ground holds it there: a sheet on a body lying down lies on the floor, it is not stood up off it)
      const near = 1 - (p[j + 1] - gy) / (1.5 * L);
      const lim = near > 0 ? K.max + (Math.PI / 2 + 0.02 - K.max) * Math.min(1, near) : K.max;
      const cmax = Math.cos(lim);
      if (-dy < cmax) {
        // past the limit: tilt toward straight down until it is at the limit
        const h = Math.hypot(dx, dz) || 1, sm = Math.sin(lim);
        dx = (dx / h) * sm;
        dz = (dz / h) * sm;
        dy = -cmax;
      }
      p[k] = p[j] + dx * L;
      p[k + 1] = p[j + 1] + dy * L;
      p[k + 2] = p[j + 2] + dz * L;
      // a collider can still hold the tip in: let it win over the length (the next pass mends it)
      this._collide(s, i);
    }
  }

  /** Every strand at its rest hang against the colliders, no velocity. */
  settle(world, obj, wind) {
    this._place(obj);
    this._read(world, wind);
    for (const s of this.S) {
      s.a0.set(s.a1);
      const p = s.p;
      p[0] = s.a1[0];
      p[1] = s.a1[1];
      p[2] = s.a1[2];
      for (let i = 1; i <= s.n; i++) {
        const k = i * 3, L = s.lens[i - 1];
        p[k] = p[k - 3] + s.dir[0] * L;
        p[k + 1] = p[k - 2] + s.dir[1] * L;
        p[k + 2] = p[k - 1] + s.dir[2] * L;
      }
      for (let it = 0; it < CLOTH.settleIters; it++) this._constrain(s, s.a1, 1);
      s.o.set(p);
      s.ok = true;
    }
    this.ready = true;
  }

  /** One game step. */
  step(world, obj, dt, wind) {
    if (!this.ready || dt > CLOTH.maxDt) return this.settle(world, obj, wind);
    if (!(dt > 0)) return; // (no time: the cloth stays as it was)
    this._place(obj);
    this._read(world, wind);
    const n = Math.min(CLOTH.maxSub, Math.max(1, Math.ceil(dt / CLOTH.substep - 1e-6)));
    const h = dt / n, h2 = h * h, G = CLOTH.gravity;
    const a = this.v3;
    for (const s of this.S) {
      const jx = s.a1[0] - s.a0[0], jy = s.a1[1] - s.a0[1], jz = s.a1[2] - s.a0[2];
      if (!s.ok || jx * jx + jy * jy + jz * jz > CLOTH.jump * CLOTH.jump) {
        this._settleOne(s);
        continue;
      }
      const p = s.p, o = s.o, K = s.K, damp = Math.max(0, 1 - K.damp * h), drag = s.drag;
      for (let sub = 1; sub <= n; sub++) {
        const u = sub / n;
        a[0] = s.a0[0] + jx * u;
        a[1] = s.a0[1] + jy * u;
        a[2] = s.a0[2] + jz * u;
        for (let i = 1; i <= s.n; i++) {
          const k = i * 3;
          const vx = (p[k] - o[k]) * damp, vy = (p[k + 1] - o[k + 1]) * damp, vz = (p[k + 2] - o[k + 2]) * damp;
          // air drag against the wind (velocities in m/s: v / h)
          const ax = drag * (s.wind[0] - vx / h), ay = -G - drag * (vy / h), az = drag * (s.wind[1] - vz / h);
          o[k] = p[k];
          o[k + 1] = p[k + 1];
          o[k + 2] = p[k + 2];
          let mx = vx + ax * h2, my = vy + ay * h2, mz = vz + az * h2;
          const m2 = mx * mx + my * my + mz * mz;
          if (m2 > 0.04) {
            const f = 0.2 / Math.sqrt(m2);
            mx *= f;
            my *= f;
            mz *= f;
          }
          p[k] += mx;
          p[k + 1] += my;
          p[k + 2] += mz;
        }
        for (let it = 0; it < CLOTH.iters; it++) this._constrain(s, a, 1);
      }
      // a strand gone non-finite is settled again (never a NaN on screen)
      let bad = false;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad = true;
      if (bad) this._settleOne(s);
    }
  }

  _settleOne(s) {
    const p = s.p;
    p[0] = s.a1[0];
    p[1] = s.a1[1];
    p[2] = s.a1[2];
    for (let i = 1; i <= s.n; i++) {
      const k = i * 3, L = s.lens[i - 1];
      p[k] = p[k - 3] + s.dir[0] * L;
      p[k + 1] = p[k - 2] + s.dir[1] * L;
      p[k + 2] = p[k - 1] + s.dir[2] * L;
    }
    for (let it = 0; it < CLOTH.settleIters; it++) this._constrain(s, s.a1, 1);
    s.o.set(p);
    s.a0.set(s.a1);
    s.ok = true;
  }

  /** Set every stretch's holder (body frame) on its link. */
  draw() {
    const Q = this.objQ;
    // the inverse of the body's rotation
    const iq = this.qTmp;
    iq[0] = -Q[0];
    iq[1] = -Q[1];
    iq[2] = -Q[2];
    iq[3] = Q[3];
    const t = this.v3;
    for (const s of this.S) {
      const p = s.p;
      // the across axis, carried down from the anchor (body frame)
      rot(iq, 0, s.ax[0], s.ax[1], s.ax[2], t, 0);
      _x.set(t[0], t[1], t[2]);
      for (let i = 0; i < s.n; i++) {
        const k = i * 3, H = s.holders[i];
        if (!H) continue;
        rot(iq, 0, p[k] - this.objP[0], p[k + 1] - this.objP[1], p[k + 2] - this.objP[2], t, 0);
        H.position.set(t[0], t[1], t[2]);
        // up the stretch: from the next particle to this one
        rot(iq, 0, p[k] - p[k + 3], p[k + 1] - p[k + 4], p[k + 2] - p[k + 5], t, 0);
        _y.set(t[0], t[1], t[2]);
        if (_y.lengthSq() < 1e-10) _y.set(0, 1, 0);
        _y.normalize();
        _x.addScaledVector(_y, -_x.dot(_y));
        if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
        _x.normalize();
        _z.crossVectors(_x, _y);
        _m.makeBasis(_x, _y, _z);
        H.quaternion.setFromRotationMatrix(_m);
      }
    }
  }
}
