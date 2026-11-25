import { TRAIL_N, TRAIL_CH, TRAIL_SEG } from '../render/shaderLib.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { GRASS } from './grassTuning.js';

// THE HERO'S WAKE THROUGH THE GRASS (`?bend=a|b|c`; `?bend=0`: today, the trodden trail in the scorch map's
// B that the steps write, darker, standing up over 10 s). The owner (2026-11-24): the trodden trail went
// dark too quickly, in blocks, and back badly; the grass should BEND as he passes and come back.
//
//   trail.update(dt, P)       once a frame after the hero (world.update): P = his pusher (uPushers[0]: x, y,
//                             z, radius; y > 1.5 or radius 0: no contact). Keeps his last positions (a
//                             short polyline, GRASS.bend) and writes the grass's uniforms (uTrail, uTrailBox,
//                             uBend*: shaderLib.js). With `?bend=0` it writes uBend.x = 0 and keeps nothing.
//   trail.press(x, z, r)      a foot came down hard (the steps' sprint, a heavy landing): the wake is r m
//                             wide here for GRASS.bend.press.hold s
//   trail.clear()             the fight's reset: nothing bent
//   trail.bendAt(x, z, hash, out)   what the grass shader draws for a blade rooted at (x, z) (its own hash
//                             0..1, iRoot.w): out { x, z (the tip's push in blade heights), drop (heights),
//                             dark (0..1), k (0..1 how bent) }. The tests' and the Lab's CPU copy of the GLSL
//                             in grass.js: keep the two the same.
//   bendLook()                the option drawn now ('0' | 'a' | 'b' | 'c'), read per frame (setLook works live)
//
// No Math.random, no event, no allocation per frame (fixed typed arrays); nothing here touches the scorch
// map, the fire or the fights (the uniforms are read by the grass shader only).

const B = GRASS.bend;

/**
 * The wake in GLSL (the grass's blades, world/grass.js, and the dragon ground's printed tufts,
 * world/dragonGrass.js, share this one chunk; GrassTrail.bendAt below is its CPU copy: keep the two the
 * same). Needs COMMON_GLSL and the uniforms uTrail[TRAIL_N], uTrailBox[TRAIL_CH], uBend, uBendT, uBendS,
 * uBendE declared before it.
 *   vec4 trailBend(vec2 p, float hsh)   p: a blade's root (world xz), hsh: its own hash 0..1. The nearest
 *   stretch of the hero's last positions (the newest wins where two cross): there the blade bends along his
 *   way and out from his path, falling off smoothly to the stretch's radius; it holds, then springs back by
 *   its own time (edges sooner). Returns the tip's push (xz, in blade heights) and in w how bent it is
 *   (0..1: the drop and the shade).
 */
export const TRAIL_BEND_GLSL = /* glsl */ `
vec4 trailBend(vec2 p, float hsh) {
  float best = 0.0, bf = 0.0, bs = 0.0, bage = 0.0;
  vec2 bo = vec2(0.0), bt = vec2(0.0);
  int n = int(uBend.y + 0.5);
  for (int c = 0; c < ${TRAIL_CH}; c++) {
    vec4 C = uTrailBox[c];
    if (C.z <= 0.0 || distance(p, C.xy) > C.z) continue;
    for (int k = 0; k < ${TRAIL_SEG}; k++) {
      int i = c * ${TRAIL_SEG} + k;
      if (i + 1 >= n) break;
      vec4 A = uTrail[i], D = uTrail[i + 1];
      vec2 e = D.xy - A.xy;
      float l2 = dot(e, e);
      float t = l2 > 1e-6 ? clamp(dot(p - A.xy, e) / l2, 0.0, 1.0) : 1.0;
      float r = mix(A.w, D.w, t);
      if (r <= 0.01) continue;
      vec2 q = p - (A.xy + e * t);
      float ql = length(q);
      float s = ql / r;
      if (s >= 1.0) continue;
      float age = mix(A.z, D.z, t);
      float f = 1.0 - s * s;
      f *= f;
      float w = f * exp(-max(0.0, age - uBendT.x) / (uBendT.y * 2.0));
      if (w > best) {
        best = w; bf = f; bs = s; bage = age;
        float l = sqrt(l2);
        bt = l > 1e-3 ? e / l : vec2(0.0);
        bo = ql > 1e-4 ? q / ql : bt;
      }
    }
  }
  if (best <= 0.0) return vec4(0.0);
  float tau = uBendT.y * (1.0 - uBendT.w + 2.0 * uBendT.w * hsh) * (1.0 + (uBendE.y - 1.0) * bs);
  float x = max(0.0, bage - uBendT.x);
  float ex = exp(-x / tau);
  float R = uBendT.z > 0.01 ? ex * (cos(uBendT.z * x) + sin(uBendT.z * x) / (uBendT.z * tau)) : ex * (1.0 + x / tau);
  vec2 d = bt * uBendS.y + bo * (uBendS.z * smoothstep(0.0, 0.45, bs));
  float ja = (fract(hsh * 9.13 + 0.27) - 0.5) * uBendE.z;
  float ca = cos(ja), sa = sin(ja);
  d = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
  float dl = length(d);
  d = dl > 1e-3 ? d / dl : bo;
  return vec4(d * (bf * R * uBendS.x), 0.0, bf * max(R, 0.0));
}
`;

/** The option drawn now ('0' today; the default is GRASS.bend.look). */
export const bendLook = () => {
  const v = lookOf('bend', B.look);
  return v === '0' || v === 'a' || v === 'b' || v === 'c' ? v : B.look;
};

/** A blade's spring back: 1 while held, then to 0 (past it when omega > 0). */
export function bendResponse(age, hold, tau, omega) {
  const x = Math.max(0, age - hold);
  const e = Math.exp(-x / tau);
  if (omega > 0.01) return e * (Math.cos(omega * x) + Math.sin(omega * x) / (omega * tau));
  return e * (1 + x / tau);
}

/** The age (s) after which no blade of option `o` is bent more than `eps` of its full bend. */
export function bendEnd(o, eps = 0.01) {
  const tauMax = o.tau * (1 + o.stagger);
  let last = 0;
  for (let t = 0; t < 30; t += 0.01) if (Math.abs(bendResponse(t, o.hold, tauMax, o.omega)) > eps) last = t;
  return last + 0.01;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (v) => v - Math.floor(v);

export class GrassTrail {
  constructor(U) {
    this.U = U;
    const N = TRAIL_N;
    // committed points, oldest first: x, z, time stamp (the trail's clock), radius
    this.px = new Float64Array(N);
    this.pz = new Float64Array(N);
    this.pt = new Float64Array(N);
    this.pr = new Float64Array(N);
    this.n = 0;
    this.clock = 0;
    // the head (where he is now)
    this.hx = 0;
    this.hz = 0;
    this.hr = 0;
    this.live = false;
    this._boost = 0;
    this._boostT = 0;
    this.look = '0';
    this.opt = null;
    this.end = 0;
    this._q = new Float64Array(4);
    this._ends = Object.create(null);
    for (const k of Object.keys(B.options)) this._ends[k] = bendEnd(B.options[k]);
  }

  clear() {
    this.n = 0;
    this.live = false;
    this._boost = 0;
    this._boostT = 0;
    this._write();
  }

  /** A foot came down hard at (x, z): the wake is r m wide here a moment (the steps; `?bend=0`: nothing). */
  press(x, z, r) {
    if (this.look === '0' || !Number.isFinite(x + z + r) || !(r > 0)) return;
    if (this.live && Math.hypot(x - this.hx, z - this.hz) > 2) return;
    this._boost = Math.max(this._boost, r);
    this._boostT = B.press.hold;
  }

  update(dt, P) {
    const look = bendLook();
    if (look !== this.look) {
      this.look = look;
      this.opt = look === '0' ? null : B.options[look];
      this.end = look === '0' ? 0 : this._ends[look];
      this.n = 0;
      this.live = false;
    }
    if (!this.opt) {
      this._write();
      return;
    }
    if (!(dt >= 0) || !Number.isFinite(dt)) dt = 0;
    this.clock += dt;
    const o = this.opt;
    if (this._boostT > 0) {
      this._boostT -= dt;
      if (this._boostT <= 0) this._boost = 0;
    }
    const x = P?.x, z = P?.z;
    if (!Number.isFinite(x + z)) {
      this._write();
      return;
    }
    // (in the air, or no pusher: no contact; the wake tapers to nothing there)
    const contact = Number(P.w) > 0 && !(Number(P.y) > 1.5);
    const r = contact ? Math.max(Number(P.w) * o.r, this._boost) : 0;
    if (this.live && Math.hypot(x - this.hx, z - this.hz) > B.jump) this.n = 0; // a jump: start afresh
    this.hx = x;
    this.hz = z;
    this.hr = r;
    this.live = true;
    const now = this.clock;
    const N = TRAIL_N - 1; // (the head takes the last slot)
    if (this.n === 0) this._push(x, z, now, r);
    else {
      const k = this.n - 1;
      const d = Math.hypot(x - this.px[k], z - this.pz[k]);
      if (d < 0.05) {
        // standing: the grass under him stays pressed
        this.pt[k] = now;
        this.pr[k] = r;
      } else if (d >= B.far || (d >= B.spacing && now - this.pt[k] >= B.gap)) {
        if (this.n >= N) this._thin();
        this._push(x, z, now, r);
      }
    }
    // the old end: a segment whose newer point is past the end is gone (nothing in it is bent)
    while (this.n >= 2 && now - this.pt[1] > this.end) this._shift();
    this._write();
  }

  _push(x, z, t, r) {
    const i = this.n++;
    this.px[i] = x;
    this.pz[i] = z;
    this.pt[i] = t;
    this.pr[i] = r;
  }

  _shift() {
    const n = --this.n;
    this.px.copyWithin(0, 1, n + 1);
    this.pz.copyWithin(0, 1, n + 1);
    this.pt.copyWithin(0, 1, n + 1);
    this.pr.copyWithin(0, 1, n + 1);
  }

  /** Full: the older three quarters' straightest point goes (on a straight run nothing changes). */
  _thin() {
    const n = this.n, lim = Math.max(2, Math.floor(n * 0.75));
    let best = -1, bestE = Infinity;
    for (let i = 1; i < lim; i++) {
      const ax = this.px[i - 1], az = this.pz[i - 1], bx = this.px[i + 1], bz = this.pz[i + 1];
      const ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez);
      const dev = l > 1e-6 ? Math.abs((this.px[i] - ax) * ez - (this.pz[i] - az) * ex) / l : Math.hypot(this.px[i] - ax, this.pz[i] - az);
      // (a longer pair costs more: a gap must not grow without bound)
      const e = dev + 0.02 * l;
      if (e < bestE) {
        bestE = e;
        best = i;
      }
    }
    if (best < 0) {
      this._shift();
      return;
    }
    for (let i = best; i < n - 1; i++) {
      this.px[i] = this.px[i + 1];
      this.pz[i] = this.pz[i + 1];
      this.pt[i] = this.pt[i + 1];
      this.pr[i] = this.pr[i + 1];
    }
    this.n--;
  }

  /** The points as the shader reads them (oldest first, the head last; at least 2 while there is a wake). */
  get count() {
    return this.opt && this.live ? this.n + 1 : 0;
  }

  _pt(i, out) {
    // point i of the drawn polyline: committed 0..n-1, then the head
    if (i < this.n) {
      out[0] = this.px[i];
      out[1] = this.pz[i];
      out[2] = this.clock - this.pt[i];
      out[3] = this.pr[i];
    } else {
      out[0] = this.hx;
      out[1] = this.hz;
      out[2] = 0;
      out[3] = this.hr;
    }
    return out;
  }

  _write() {
    const U = this.U;
    const Tr = U?.uTrail?.value, Bx = U?.uTrailBox?.value, Bd = U?.uBend?.value;
    if (!Tr || !Bx || !Bd) return;
    const o = this.opt, n = this.count;
    if (!o || n < 2) {
      Bd.set(0, 0, 0, 0);
      for (let c = 0; c < Bx.length; c++) Bx[c].set(0, 0, 0, 0);
      return;
    }
    const q = this._q;
    for (let i = 0; i < n && i < Tr.length; i++) {
      this._pt(i, q);
      Tr[i].set(q[0], q[1], q[2], q[3]);
    }
    // each chunk's circle (its points' box, out by its widest radius)
    for (let c = 0; c < TRAIL_CH && c < Bx.length; c++) {
      const i0 = c * TRAIL_SEG, i1 = Math.min(n - 1, i0 + TRAIL_SEG);
      if (i0 + 1 >= n) {
        Bx[c].set(0, 0, 0, 0);
        continue;
      }
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, rm = 0;
      for (let i = i0; i <= i1; i++) {
        const v = Tr[i];
        if (v.x < x0) x0 = v.x;
        if (v.x > x1) x1 = v.x;
        if (v.y < z0) z0 = v.y;
        if (v.y > z1) z1 = v.y;
        if (v.w > rm) rm = v.w;
      }
      Bx[c].set((x0 + x1) / 2, (z0 + z1) / 2, rm > 0 ? Math.hypot(x1 - x0, z1 - z0) / 2 + rm + 0.01 : 0, 0);
    }
    Bd.set(1, n, 0, 0);
    U.uBendT?.value?.set(o.hold, o.tau, o.omega, o.stagger);
    U.uBendS?.value?.set(o.amp, o.along, o.out, o.drop);
    U.uBendE?.value?.set(o.dark, o.edge, o.jitter, 0);
  }

  /**
   * The bend of a blade rooted at (x, z) with hash h (iRoot.w), as the grass shader draws it (grass.js
   * `trailBend`: the same steps, kept in step by hand): out { x, z, drop, dark, k }.
   */
  bendAt(x, z, h, out = { x: 0, z: 0, drop: 0, dark: 0, k: 0 }) {
    out.x = out.z = out.drop = out.dark = out.k = 0;
    const U = this.U, o = this.opt;
    const Tr = U?.uTrail?.value, Bx = U?.uTrailBox?.value, Bd = U?.uBend?.value;
    if (!o || !Tr || !Bd || Bd.x < 0.5) return out;
    const n = Math.round(Bd.y);
    let best = 0, bf = 0, bs = 0, bage = 0, ox = 0, oz = 0, tx = 0, tz = 0;
    for (let c = 0; c < TRAIL_CH; c++) {
      const C = Bx[c];
      if (!(C.z > 0) || Math.hypot(x - C.x, z - C.y) > C.z) continue;
      for (let k = 0; k < TRAIL_SEG; k++) {
        const i = c * TRAIL_SEG + k;
        if (i + 1 >= n) break;
        const A = Tr[i], D = Tr[i + 1];
        const ex = D.x - A.x, ez = D.y - A.y, l2 = ex * ex + ez * ez;
        const t = l2 > 1e-6 ? Math.min(1, Math.max(0, ((x - A.x) * ex + (z - A.y) * ez) / l2)) : 1;
        const r = A.w + (D.w - A.w) * t;
        if (r <= 0.01) continue;
        const qx = x - (A.x + ex * t), qz = z - (A.y + ez * t), ql = Math.hypot(qx, qz);
        const s = ql / r;
        if (s >= 1) continue;
        const age = A.z + (D.z - A.z) * t;
        let f = 1 - s * s;
        f *= f;
        const w = f * Math.exp(-Math.max(0, age - o.hold) / (o.tau * 2));
        if (w > best) {
          best = w;
          bf = f;
          bs = s;
          bage = age;
          const l = Math.sqrt(l2);
          tx = l > 1e-3 ? ex / l : 0;
          tz = l > 1e-3 ? ez / l : 0;
          ox = ql > 1e-4 ? qx / ql : tx;
          oz = ql > 1e-4 ? qz / ql : tz;
        }
      }
    }
    if (!(best > 0)) return out;
    const tau = o.tau * (1 - o.stagger + 2 * o.stagger * h) * (1 + (o.edge - 1) * bs);
    const R = bendResponse(bage, o.hold, tau, o.omega);
    const so = o.out * smooth(0, 0.45, bs);
    let dx = tx * o.along + ox * so, dz = tz * o.along + oz * so;
    // each blade a little its own way
    const ja = (fract(h * 9.13 + 0.27) - 0.5) * o.jitter;
    const ca = Math.cos(ja), sa = Math.sin(ja);
    const rx = dx * ca - dz * sa, rz = dx * sa + dz * ca;
    const dl = Math.hypot(rx, rz);
    dx = dl > 1e-3 ? rx / dl : ox;
    dz = dl > 1e-3 ? rz / dl : oz;
    const b = bf * R * o.amp;
    const pos = bf * Math.max(0, R);
    out.x = dx * b;
    out.z = dz * b;
    out.drop = o.drop * pos;
    out.dark = o.dark * pos;
    out.k = pos;
    return out;
  }
}
