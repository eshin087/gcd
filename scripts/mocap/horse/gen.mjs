// The horse's clips, authored by hand from the owner's reference footage (no pose tracking exists for a
// quadruped). The numbers MEASURED from the frames are in `REF_NUMBERS` below; everything else is a
// horse's well-known gait mechanics, tuned until the pair sheets (reference over ours) matched.
//
//   node scripts/mocap/horse/gen.mjs            writes src/entities/hero2/horse/clips/horseMove.js and
//                                               horseSword.js, and prints each clip's checks
//
// How a clip is made: the ROOT's path (speed, turn) is integrated first; a GAIT (cycle, footfall order,
// stance share, the body's rise and pitch per beat, the neck's nod) runs on a phase clock, and every
// hoof is PLANTED where it lands (a world point it keeps until it lifts: no slide by construction);
// between plants a hoof swings on an arc. The trunk, neck, head, tail and ears follow the gait's curves;
// the legs are solved to their hooves in their own plane (horse/hlegs.js). One-shots (starts, stops, the
// jumps, the rider's attacks) blend gaits over time and add their own body curves and flight legs.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const mod = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { HJ, HJI, LEGS, hRestOffsets, hCreatePose, hCreateWorld, hSolveFK } = await mod('src/entities/hero2/horse/hskeleton.js');
const { HORSE } = await mod('src/entities/hero2/horse/hdims.js');
const { solveLeg, writeLeg, toLegPlane, qx } = await mod('src/entities/hero2/horse/hlegs.js');
const { encodeQ, encodeF32 } = await mod('src/entities/hero2/clip.js');
const { qmul } = await mod('src/entities/hero2/qmath.js');

const D = HORSE, REST = hRestOffsets();
const deg = Math.PI / 180;

// ------------------------------------------------------------------ what the frames gave
export const REF_NUMBERS = {
  // cycle lengths: the silhouette's self-similarity over a tracked side view (H2 period.py), seconds
  walk: { cycle: 1.1, speed: 1.31, note: 'MOVE 26:28-26:46; 4-beat; ground speed from the ground strips under a tracked camera (229 px/s at 175 px/m)' },
  run: { cycle: 0.6, speed: 5.8, note: 'MOVE 27:08-27:26; a CANTER (3 beats and a gathered suspension; the body rocks): 1044 px/s at 180 px/m' },
  sprint: { cycle: 0.467, speed: 10.5, note: 'MOVE 27:47-28:12; a GALLOP (4 beats, longer suspension, the body stretched); the camera is three-quarter: speed estimated' },
  jump: { gather: 0.27, air: 0.5, foreFirst: 0.1, settle: 0.4, rise: 1.0, note: 'MOVE 28:49.4-28:50.7: gather, rear to ~55 deg, fly ~0.5 s pitched up then nose down, fores land 0.1 s before the hinds' },
  doubleJump: { kickAfter: 0.55, air: 1.3, note: 'MOVE 29:11.6-29:13.0: a second kick 0.55 s after the take-off, landing 1.3 s after it' },
  attacks: { light: 1.2, heavy: 1.9, note: 'SWORD 7:16.6-7:18.0 and 8:08.5-8:10.4: the horse stands; it braces and leans off the cut, the head turns away' },
};

// ------------------------------------------------------------------ helpers
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (x) => x - Math.floor(x);
/** 0 at s = 0 and 1, 1 at s = pk (a soft hump) */
const bump = (s, pk = 0.5) => (s <= 0 || s >= 1 ? 0 : s < pk ? Math.sin((Math.PI / 2) * (s / pk)) ** 2 : Math.sin((Math.PI / 2) * ((1 - s) / (1 - pk))) ** 2);
/** sum of [amp, harmonic, phase0] cosines at phase f */
const four = (terms, f) => {
  let v = 0;
  for (const [a, k, p] of terms ?? []) v += a * Math.cos(2 * Math.PI * k * (f - p));
  return v;
};
/** piecewise smooth keys [[t, v], ...] */
const keys = (K, t) => {
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) return lerp(K[i - 1][1], K[i][1], smooth((t - K[i - 1][0]) / (K[i][0] - K[i - 1][0])));
  return K[K.length - 1][1];
};
/** blend two gait tables (numbers, arrays and nested tables) */
function mix(A, B, w) {
  if (w <= 0) return A;
  if (w >= 1) return B;
  if (typeof A === 'number') return lerp(A, B, w);
  if (Array.isArray(A)) return A.map((a, i) => mix(a, B[i], w));
  const o = {};
  for (const k of Object.keys(A)) o[k] = k in B ? mix(A[k], B[k], w) : A[k];
  return o;
}

// ------------------------------------------------------------------ the gaits
// Phases: each hoof's touch-down in the cycle (0..1); `beta` the share of the cycle it is down. The trunk:
// `cy` the pelvis joint's height when level, `bob` / `pitch` / `roll` / `surge` cosines over the cycle
// (pitch > 0 = nose up), `neck` the neck root's elevation and its nod, `head` the head's angle (down < 0).
// Legs: `lift` swing heights (m), `knee` the fore knee's fold in the swing, `past` the pastern's fold,
// `hc` the hind cannon's angles [touch-down, lift-off, folded, reaching], `zF` / `zH` the neutral hoof
// places (m from the root), `lane` half the track's width.
const T_STAND = {
  T: 1, v: 0, beta: 1, ph: { HL: 0, FL: 0.25, HR: 0.5, FR: 0.75 },
  cy: 1.165, bob: [[0, 1, 0]], pitch: [[0, 1, 0]], pitch0: 0, roll: [[0, 1, 0]], surge: [[0, 1, 0]], spine: 0,
  neck: 52 * deg, neckA: [[0, 1, 0]], neck2: -10 * deg, neck3: -16 * deg, head: -74 * deg, headA: [[0, 1, 0]],
  tail: [-62 * deg, -14 * deg, -8 * deg, -4 * deg], tailA: [[0, 1, 0]], tailYaw: [[0, 1, 0]],
  ears: 8 * deg, jaw: 0,
  lift: { F: 0.1, H: 0.09 }, knee: 1.0, past: { F: 1.0, H: 0.8 }, pastern: 35 * deg, load: 6 * deg,
  hc: [6 * deg, -14 * deg, -40 * deg, 14 * deg], zF: 0.64, zH: -0.56, lane: { F: 0.17, H: 0.19 }, bias: { F: 0, H: 0 },
};
const GAITS = {
  stand: T_STAND,
  // the walk: lateral 4-beat (HL, FL, HR, FR a quarter apart), 62 % stance; the back dips twice a cycle
  // (once per hind push), the head nods twice (lowest as each fore lands)
  walk: {
    ...T_STAND, T: 1.1, v: 1.31, beta: 0.62, ph: { HL: 0, FL: 0.26, HR: 0.5, FR: 0.76 },
    cy: 1.16, bob: [[0.012, 2, 0.2]], pitch: [[0.012, 2, 0.05]], roll: [[0.018, 1, 0.3]], surge: [[0.01, 2, 0.1]],
    neck: 46 * deg, neckA: [[3.5 * deg, 2, 0.18]], head: -72 * deg, headA: [[-2 * deg, 2, 0.18]],
    tail: [-58 * deg, -16 * deg, -8 * deg, -4 * deg], tailA: [[2 * deg, 2, 0]], tailYaw: [[4 * deg, 1, 0.3]],
    lift: { F: 0.12, H: 0.08 }, knee: 1.1, past: { F: 0.7, H: 0.5 }, load: 8 * deg,
    hc: [10 * deg, -22 * deg, -30 * deg, 16 * deg], zF: 0.58, zH: -0.54,
  },
  // the run is a CANTER on the right lead: HL, then HR with FL together, then FR, then a gathered
  // moment in the air; the body rocks (forehand up as the hinds land, down onto the leading fore)
  run: {
    ...T_STAND, T: 0.6, v: 5.8, beta: 0.26, ph: { HL: 0, HR: 0.18, FL: 0.24, FR: 0.42 },
    cy: 1.13, bob: [[0.05, 1, 0.9]], pitch: [[0.17, 1, 0.14]], pitch0: 0.05, roll: [[0.01, 1, 0.2]], surge: [[0.05, 1, 0.2]], spine: 0.03,
    neck: 52 * deg, neckA: [[6 * deg, 1, 0.2]], neck2: -10 * deg, neck3: -16 * deg, head: -74 * deg, headA: [[-4 * deg, 1, 0.25]],
    tail: [-40 * deg, -10 * deg, -6 * deg, -4 * deg], tailA: [[8 * deg, 1, 0.6]], tailYaw: [[3 * deg, 1, 0.2]],
    lift: { F: 0.3, H: 0.24 }, knee: 1.9, past: { F: 1.6, H: 1.3 }, load: 12 * deg,
    hc: [24 * deg, -36 * deg, -85 * deg, 32 * deg], zF: 0.5, zH: -0.22, bias: { F: 0.0, H: 0.04 },
  },
  // the sprint is a GALLOP (transverse, right lead): HL, HR, FL, FR, then a long gathered suspension;
  // lower and longer, the neck reaching forward
  sprint: {
    ...T_STAND, T: 0.4667, v: 10.5, beta: 0.27, ph: { HL: 0, HR: 0.11, FL: 0.36, FR: 0.47 },
    cy: 1.1, bob: [[0.05, 1, 0.85]], pitch: [[0.085, 1, 0.12]], pitch0: -0.01, roll: [[0.008, 1, 0.2]], surge: [[0.06, 1, 0.2]], spine: 0.06,
    neck: 20 * deg, neckA: [[9 * deg, 1, 0.15]], neck2: -4 * deg, neck3: -8 * deg, head: -38 * deg, headA: [[-5 * deg, 1, 0.2]],
    tail: [8 * deg, -18 * deg, -16 * deg, -12 * deg], tailA: [[6 * deg, 1, 0.6]], tailYaw: [[2 * deg, 1, 0.2]],
    lift: { F: 0.42, H: 0.34 }, knee: 2.2, past: { F: 1.9, H: 1.5 }, load: 14 * deg,
    hc: [28 * deg, -50 * deg, -95 * deg, 40 * deg], zF: 0.66, zH: -0.3, bias: { F: 0.06, H: 0.1 }, lane: { F: 0.14, H: 0.16 },
  },
};

// ------------------------------------------------------------------ the simulation
const H = 1 / 240; // the simulation's step (s)
const MIN_SWING = 0.22; // s: the shortest swing after a stance cut short
const KEYS = ['FL', 'FR', 'HL', 'HR'];

/**
 * Run a clip spec. spec:
 *   dur (s), fps, loop, pre (s of simulation before frame 0), post (after the last frame)
 *   gait(t) -> a gait table (blended)
 *   yawRate(t) -> rad/s (default 0)
 *   body(t, g, b) -> adds to the body channels b (optional: jumps, attacks, mounting)
 *   flight: [{ t0, t1, legs: { FL: { keys: [[t, z, y, flex, past]...] } ... } }]  airborne windows:
 *            plants inside [t0, t1] are dropped; the hoof follows plane-relative keys (z, y off its top joint)
 *   plants: { FL: [[tOn, tOff, dz]] }  extra plants (a landing): world point under the hoof's neutral place
 *            at tOn, moved dz forward
 */
function simulate(spec) {
  const pre = spec.pre ?? 0, post = spec.post ?? 1.5;
  const t0 = -pre, t1 = spec.dur + post;
  const N = Math.ceil((t1 - t0) / H) + 1;
  const T = new Float64Array(N), RX = new Float64Array(N), RZ = new Float64Array(N), RY = new Float64Array(N), PH = new Float64Array(N);
  const G = [];
  const C = Object.fromEntries(KEYS.map((k) => [k, new Uint8Array(N)]));
  const F = Object.fromEntries(KEYS.map((k) => [k, new Uint8Array(N)])); // forced down (a landing)
  let x = 0, z = 0, yaw = 0, ph = spec.ph0 ?? 0;
  for (let i = 0; i < N; i++) {
    const t = t0 + i * H;
    const g = spec.gait(t);
    T[i] = t;
    RX[i] = x;
    RZ[i] = z;
    RY[i] = yaw;
    PH[i] = ph;
    G.push(g);
    for (const k of KEYS) C[k][i] = g.beta >= 0.999 ? 1 : frac(ph - g.ph[k]) < g.beta ? 1 : 0;
    // advance
    const v = g.v * (spec.speedK?.(t) ?? 1);
    x += Math.sin(yaw) * v * H;
    z += Math.cos(yaw) * v * H;
    yaw += (spec.yawRate?.(t) ?? 0) * H;
    ph += H / g.T * (spec.clockK?.(t) ?? 1);
  }
  // shift so frame 0 is the origin
  const i0 = Math.round(pre / H);
  const ox = RX[i0], oz = RZ[i0], oy = RY[i0];
  for (let i = 0; i < N; i++) {
    const dx = RX[i] - ox, dz = RZ[i] - oz, c = Math.cos(-oy), s = Math.sin(-oy);
    RX[i] = c * dx + s * dz;
    RZ[i] = -s * dx + c * dz;
    RY[i] -= oy;
  }
  const idx = (t) => Math.max(0, Math.min(N - 1, Math.round((t - t0) / H)));
  const rootAt = (t) => {
    const i = idx(t);
    return [RX[i], RZ[i], RY[i]];
  };
  const toWorld = (r, lx, lz) => [r[0] + Math.cos(r[2]) * lx + Math.sin(r[2]) * lz, r[1] - Math.sin(r[2]) * lx + Math.cos(r[2]) * lz];
  // flights: contacts dropped inside
  for (const fl of spec.flight ?? [])
    for (const k of KEYS) {
      const L = fl.legs[k];
      if (!L) continue;
      for (let i = idx(L.off ?? fl.t0); i <= idx(L.on ?? fl.t1); i++) C[k][i] = 0;
      // the landing: down for at least `stance` s (then the gait's own clock takes the leg again)
      for (let i = idx(L.on ?? fl.t1) + 1; i <= idx((L.on ?? fl.t1) + (L.stance ?? 0.14)); i++) C[k][i] = F[k][i] = 1;
    }
  // plants: runs of contact. A stance that a gait change stretches past the leg's reach ends early (the
  // hoof lifts and swings at least MIN_SWING s before the gait may plant it again)
  const plants = {};
  for (const k of KEYS) {
    const list = [];
    const fore = k[0] === 'F', c = C[k];
    let P = null, swingUntil = -1;
    for (let i = 0; i < N; i++) {
      const g = G[i];
      if (P) {
        // the plant seen from the body now: how far behind its neutral place
        const r = [RX[i], RZ[i], RY[i]];
        const dx = P.x - r[0], dz = P.z - r[1];
        const lz = -Math.sin(r[2]) * -dx * 0 + (Math.sin(r[2]) * dx + Math.cos(r[2]) * dz);
        const back = (fore ? g.zF : g.zH) - lz;
        const budget = Math.max(0.5, g.v * (spec.speedK?.(T[i]) ?? 1) * g.beta * g.T * 0.5 + 0.12);
        const forced = c[i] && P.forced;
        if ((!c[i] && !forced) || (back > budget && !forced)) {
          P.off = T[i - 1];
          P.j = i - 1;
          list.push(P);
          if (c[i]) swingUntil = i + Math.round(MIN_SWING / H);
          P = null;
        }
      }
      if (!P && c[i] && i >= swingUntil) {
        const r = [RX[i], RZ[i], RY[i]];
        const lane = (k[1] === 'L' ? 1 : -1) * (fore ? g.lane.F : g.lane.H);
        // a landing from a swing: the hoof goes where its neutral place will be at mid-stance (on a curve
        // or a slowing body as well as a straight one); standing from the first step: at the neutral place
        const stand = i === 0 || g.beta >= 0.999;
        const rm = stand ? r : rootAt(T[i] + g.beta * g.T * 0.5);
        const zl = (fore ? g.zF : g.zH) + (stand ? 0 : fore ? g.bias.F : g.bias.H) + (spec.plantShift?.(k, T[i]) ?? 0);
        const w = toWorld(rm, lane, zl);
        P = { on: T[i], off: T[N - 1], x: w[0], z: w[1], i, j: N - 1, forced: !!F[k][i] };
      }
      if (P && F[k][i]) P.forced = true;
      c[i] = P ? 1 : 0;
    }
    if (P) list.push(P);
    plants[k] = list;
  }
  return { T, t0, N, G, PH, idx, rootAt, plants, C, flights: spec.flight ?? [] };
}

// ------------------------------------------------------------------ one frame's pose
const pose = hCreatePose(), W = hCreateWorld();
const ang = new Float64Array(5), tgt = new Float64Array(3);

function qyx(q, i, yaw, r) {
  // qy(yaw) * qx(r)
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(r / 2), sx = Math.sin(r / 2);
  q[i] = cy * sx;
  q[i + 1] = sy * cx;
  q[i + 2] = -sy * sx;
  q[i + 3] = cy * cx;
}

/** The body's channels at time t (before the spec's extras). */
function bodyAt(sim, t) {
  const i = sim.idx(t), g = sim.G[i], f = frac(sim.PH[i]);
  return {
    g, f,
    cy: g.cy + four(g.bob, f), p: g.pitch0 + four(g.pitch, f), roll: four(g.roll, f), surge: four(g.surge, f), yaw: 0,
    s: g.spine * Math.cos(2 * Math.PI * (f - 0.6)),
    neck: g.neck + four(g.neckA, f), neck2: g.neck2, neck3: g.neck3, head: g.head + four(g.headA, f), turn: 0,
    tail: g.tail.map((v, k) => v + (k === 0 ? four(g.tailA, f) : four(g.tailA, f) * 0.4)), tailYaw: four(g.tailYaw, f),
    earL: [g.ears, 0], earR: [g.ears, 0], jaw: g.jaw,
  };
}

const ROOT_SHIFT = { x: 0 };

/** Pose at clip time t into `pose` / `W`; returns per-hoof { contact, miss }. */
let DROP = 0; // m the body is lowered this frame (build()'s reach pass)
function frame(sim, spec, t) {
  const b = bodyAt(sim, t);
  spec.body?.(t, b.g, b);
  b.cy -= DROP;
  const r = sim.rootAt(t);
  const q = pose.q;
  for (let k = 0; k < HJ; k++) {
    q[k * 4] = q[k * 4 + 1] = q[k * 4 + 2] = 0;
    q[k * 4 + 3] = 1;
  }
  pose.root[0] = r[0];
  pose.root[1] = r[1];
  pose.root[2] = r[2];
  // the trunk: pitch about the body's middle
  const p = b.p;
  pose.hips[0] = 0;
  pose.hips[1] = b.cy + D.pelvisZ * Math.sin(p);
  pose.hips[2] = D.pelvisZ * Math.cos(p) + b.surge;
  // pelvis: qy(yaw) * qx(-p) * qz(roll)
  {
    const a = new Float64Array(8);
    qyx(a, 0, b.yaw, -p);
    const hz = b.roll / 2;
    a[4] = 0;
    a[5] = 0;
    a[6] = Math.sin(hz);
    a[7] = Math.cos(hz);
    qmul(q, HJI.pelvis * 4, a, 0, a, 4);
  }
  qx(q, HJI.spine1 * 4, b.s * 0.5);
  qx(q, HJI.spine2 * 4, -b.s * 0.2);
  qx(q, HJI.withers * 4, -b.s * 0.3);
  const rP = -p, rW = -p + b.s * 0.5 - b.s * 0.2 - b.s * 0.3;
  // neck and head: elevations (up +) in the world's vertical plane
  const e1 = b.neck, e2 = e1 + b.neck2, e3 = e2 + b.neck3, eh = b.head;
  qyx(q, HJI.neck1 * 4, b.turn * 0.3, -e1 - rW);
  qyx(q, HJI.neck2 * 4, b.turn * 0.3, -(e2 - e1));
  qyx(q, HJI.neck3 * 4, b.turn * 0.25, -(e3 - e2));
  qyx(q, HJI.head * 4, b.turn * 0.15, -(eh - e3));
  qx(q, HJI.jaw * 4, b.jaw);
  qyx(q, HJI.earL * 4, b.earL[1], b.earL[0]);
  qyx(q, HJI.earR * 4, -b.earR[1], b.earR[0]);
  // the tail: elevations of a backward bone (up +)
  let prev = rP;
  for (let k = 0; k < 4; k++) {
    const e = b.tail.slice(0, k + 1).reduce((s, v) => s + v, 0);
    qyx(q, HJI['tail' + (k + 1)] * 4, k === 0 ? b.tailYaw : b.tailYaw * 0.5, e - prev);
    prev = e;
  }
  hSolveFK(pose, REST, W);
  // the legs
  const out = {};
  for (const leg of LEGS) {
    const k = leg.key, rPar = leg.fore ? rW : rP;
    const st = legState(sim, spec, leg, t, b.g);
    let pz, py, px;
    const top = leg.j[0] * 3;
    const sx = REST[top], sz = REST[top + 2], sy = REST[top + 1];
    if (st.plane) {
      pz = st.z + sz;
      py = st.y + sy;
      px = sx;
    } else {
      toLegPlane(W, leg, st.x, st.y, st.z, tgt);
      pz = tgt[0];
      py = tgt[1];
      px = tgt[2];
      if (st.planeMix) {
        pz = lerp(pz, st.planeMix.z + sz, st.planeMix.w);
        py = lerp(py, st.planeMix.y + sy, st.planeMix.w);
        px = lerp(px, sx, st.planeMix.w);
      }
    }
    let ap = st.apW + rPar;
    const flex = leg.fore ? st.flex : st.flex + rPar;
    let miss = solveLeg(leg, sx, sy, sz, px, py, pz, ap, flex, ang);
    if (st.pastFold > 0) {
      // the pastern folds back from the cannon in the air
      for (let it = 0; it < 2; it++) {
        ap = ang[2] - st.pastFold;
        miss = solveLeg(leg, sx, sy, sz, px, py, pz, ap, flex, ang);
      }
    }
    const ah = st.flat >= 1 ? rPar : lerp(ang[3], rPar, st.flat);
    writeLeg(q, leg, ang, 0, ah);
    if (!st.contact) {
      // never under the ground in the air: lift the target by what the hoof sinks, solve again
      hSolveFK(pose, REST, W);
      const hy = W.p[leg.j[4] * 3 + 1];
      if (hy < 0.01) {
        py += 0.01 - hy;
        miss = solveLeg(leg, sx, sy, sz, px, py, pz, ap, flex, ang);
        writeLeg(q, leg, ang, 0, ah);
      }
    }
    out[k] = { contact: st.contact, miss };
  }
  hSolveFK(pose, REST, W);
  return out;
}

/** Where a hoof is at time t: a plant (world), a swing between plants, or a flight key (plane). */
function legState(sim, spec, leg, t, g) {
  const k = leg.key, fore = leg.fore, list = sim.plants[k];
  // in a flight window?
  for (const fl of sim.flights) {
    const L = fl.legs[k];
    if (!L) continue;
    const off = L.off ?? fl.t0, on = L.on ?? fl.t1;
    if (t > off && t < on) {
      const K = L.keys;
      const z = keys(K.map((e) => [e[0], e[1]]), t), y = keys(K.map((e) => [e[0], e[2]]), t);
      const flex = keys(K.map((e) => [e[0], e[3]]), t), pf = keys(K.map((e) => [e[0], e[4]]), t);
      // ease out of the last plant and into the next: mixed with the world points near the ends
      const pa = [...list].reverse().find((P) => P.off <= off + 1e-6), pb = list.find((P) => P.on >= on - 1e-6);
      const ea = smooth((t - off) / Math.max(0.05, L.easeA ?? 0.12)), eb = smooth((on - t) / Math.max(0.05, L.easeB ?? 0.12));
      const s = { contact: false, flex, pastFold: pf, apW: g.pastern, flat: 0, plane: true, z, y };
      if (ea < 1 && pa) return { ...s, plane: false, x: pa.x, y: 0.0, z: pa.z, planeMix: { z, y, w: ea }, flat: 1 - ea };
      if (eb < 1 && pb) return { ...s, plane: false, x: pb.x, y: 0.0, z: pb.z, planeMix: { z, y, w: eb }, flat: 1 - eb };
      return s;
    }
  }
  let a = null, b = null;
  for (const P of list) {
    if (P.on <= t + 1e-9 && t <= P.off + 1e-9) {
      // planted
      const s = clamp01((t - P.on) / Math.max(1e-3, P.off - P.on));
      return {
        contact: true, x: P.x, y: 0, z: P.z, flat: 1, pastFold: 0,
        // loaded mid-stance the fetlock sinks; at the end the heel lifts and the pastern stands up (breakover)
        apW: g.beta < 1 ? g.pastern + g.load * Math.sin(Math.PI * Math.min(1, s / 0.8)) - (g.pastern - 8 * deg) * smooth((s - 0.75) / 0.25) : g.pastern,
        flex: fore ? 0 : lerp(g.hc[0], g.hc[1], g.beta < 1 ? s : 0.3),
      };
    }
    if (P.off < t) a = P;
    if (P.on > t && !b) b = P;
  }
  if (!a && b) a = b;
  if (!b && a) b = a;
  if (!a) return { contact: false, x: 0, y: 0, z: 0, flat: 1, apW: g.pastern, flex: 0, pastFold: 0 };
  // swing from plant a to plant b
  const dur = Math.max(1e-3, b.on - a.off), s = clamp01((t - a.off) / dur);
  const h = (fore ? g.lift.F : g.lift.H) * Math.min(1, dur / (g.T * (1 - g.beta) + 1e-3) + 0.2);
  const e = smooth(s);
  return {
    contact: false,
    x: lerp(a.x, b.x, e), z: lerp(a.z, b.z, e), y: h * bump(s, fore ? 0.42 : 0.45),
    flat: 1 - smooth(s / 0.15) * smooth((1 - s) / 0.2),
    apW: g.pastern,
    pastFold: (fore ? g.past.F : g.past.H) * bump(s, 0.35) * Math.min(1, dur * 4),
    flex: fore ? g.knee * bump(s, 0.42) * Math.min(1, dur * 4) : keys([[0, g.hc[1]], [0.35, g.hc[2]], [0.8, g.hc[3]], [1, g.hc[0]]], s),
  };
}

// ------------------------------------------------------------------ a clip from a spec
function build(spec) {
  const fps = spec.fps ?? 30;
  const n = spec.loop ? Math.round(spec.dur * fps) : Math.round(spec.dur * fps) + 1;
  if (spec.loop) spec.dur = n / fps;
  const sim = simulate(spec);
  const qs = new Float32Array(n * HJ * 4), hips = new Float32Array(n * 3), root = new Float32Array(n * 3);
  const contact = Object.fromEntries(KEYS.map((k) => [k, new Uint8Array(n)]));
  const report = { maxMiss: 0, missAt: '', slide: 0, sink: 0, swingMiss: 0 };
  const planted = {};
  // the reach pass: where a planted hoof is out of the leg's reach, the body comes down (the knees and
  // hocks bend) by what it misses, smoothed over the neighbouring frames so the dip never pops
  const need = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    let d = 0;
    for (let it = 0; it < 6; it++) {
      DROP = d;
      const res = frame(sim, spec, f / fps);
      let m = 0;
      for (const k of KEYS) if (res[k].contact) m = Math.max(m, res[k].miss);
      if (m < 0.008) break;
      d += m * 1.15 + 0.004;
    }
    need[f] = Math.min(0.3, d);
  }
  const drop = new Float64Array(n), W2 = Math.round(fps * 0.12);
  for (let f = 0; f < n; f++) {
    // the largest need near f, eased by its distance (a raised cosine), so a dip arrives and leaves softly
    let v = 0;
    for (let k = -W2; k <= W2; k++) {
      const g = spec.loop ? (f + k + n) % n : Math.max(0, Math.min(n - 1, f + k));
      v = Math.max(v, need[g] * (0.5 + 0.5 * Math.cos((Math.PI * k) / (W2 + 1))));
    }
    drop[f] = v;
  }
  for (let f = 0; f < n; f++) {
    const t = f / fps;
    DROP = drop[f];
    const res = frame(sim, spec, t);
    qs.set(pose.q, f * HJ * 4);
    // (sign continuity)
    if (f > 0)
      for (let j = 0; j < HJ; j++) {
        const a = (f - 1) * HJ * 4 + j * 4, c = f * HJ * 4 + j * 4;
        if (qs[a] * qs[c] + qs[a + 1] * qs[c + 1] + qs[a + 2] * qs[c + 2] + qs[a + 3] * qs[c + 3] < 0) for (let m = 0; m < 4; m++) qs[c + m] = -qs[c + m];
      }
    hips.set(pose.hips, f * 3);
    root[f * 3] = pose.root[0];
    root[f * 3 + 1] = pose.root[1];
    root[f * 3 + 2] = pose.root[2];
    for (const leg of LEGS) {
      const k = leg.key, R = res[k];
      contact[k][f] = R.contact ? 1 : 0;
      if (process.env.HDEBUG === spec.name && R.miss > 0.02) console.log(`  ${spec.name} f${f} ${k} ${R.contact ? 'down' : 'air '} miss ${(R.miss * 100).toFixed(1)}`);
      if (!R.contact && R.miss > report.swingMiss) report.swingMiss = R.miss;
      if (R.contact && R.miss > report.maxMiss) {
        report.maxMiss = R.miss;
        report.missAt = `${k} f${f}`;
      }
      const h = leg.j[4] * 3, x = W.p[h], y = W.p[h + 1], z = W.p[h + 2];
      if (R.contact) {
        if (!planted[k]) planted[k] = [x, z];
        report.slide = Math.max(report.slide, Math.hypot(x - planted[k][0], z - planted[k][1]));
      } else planted[k] = null;
      report.sink = Math.min(report.sink, y);
    }
  }
  // the root's frame 0 is the origin (the simulation shifted it); a loop: the yaw keeps turning
  const spans = {};
  for (const k of KEYS) {
    const c = contact[k], list = [];
    let i = 0;
    while (i < n) {
      if (!c[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && c[j + 1]) j++;
      list.push([i, j]);
      i = j + 1;
    }
    spans[k] = list;
  }
  const out = {
    name: spec.name, title: spec.title, src: spec.src, fps, n, loop: !!spec.loop, joints: null,
    q: encodeQ(qs), hips: encodeF32(hips), root: encodeF32(root),
    ...(spec.speed != null ? { speed: spec.speed } : {}),
    contact: spans,
    ...(spec.events ? { events: spec.events.map((e) => ({ f: Math.round(e.t * fps), name: e.name })) } : {}),
    ...(spec.phases ? { phases: spec.phases } : {}),
    gait: spec.gaitName ?? null,
    from: spec.from ?? null, to: spec.to ?? null,
  };
  // the travel per second over the clip (a loop: the cycle)
  const last = (n - 1) * 3;
  const travel = Math.hypot(root[last], root[last + 1]);
  report.travel = travel;
  report.drop = Math.max(...drop);
  DROP = 0;
  report.mps = spec.loop ? travel / ((n - 1) / fps) : null;
  return { clip: out, report };
}

// ------------------------------------------------------------------ the clips
const G = GAITS;
const gaitSeq = (list) => (t) => {
  // list: [[t, gaitTable], ...] blended smoothly between consecutive entries
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) if (t <= list[i][0]) return mix(list[i - 1][1], list[i][1], smooth((t - list[i - 1][0]) / (list[i][0] - list[i - 1][0])));
  return list[list.length - 1][1];
};

const MOVE = [];
const SWORD = [];

// --- stand: an idle loop of 6 s: breathing, the weight shifting, the head lowering and coming up, ear
// flicks, a tail swish, chewing on the bit
MOVE.push({
  name: 'horseStand', title: 'Horse: stand', src: 'move 25:21-25:55', loop: true, dur: 6, fps: 30, from: 'stand', to: 'stand', gaitName: 'stand',
  gait: () => G.stand,
  body(t, g, b) {
    const w = (2 * Math.PI) / 6;
    b.cy += 0.004 * Math.sin(t * w * 2) - 0.006 * (0.5 - 0.5 * Math.cos(t * w));
    b.roll += 0.02 * Math.sin(t * w);
    b.p += 0.008 * Math.sin(t * w * 2 + 1);
    b.neck += -6 * deg * (0.5 - 0.5 * Math.cos(t * w)) + 1.2 * deg * Math.sin(t * w * 3);
    b.head += -4 * deg * (0.5 - 0.5 * Math.cos(t * w));
    b.turn = 7 * deg * Math.sin(t * w + 0.6);
    b.jaw = 0.05 * Math.max(0, Math.sin(t * w * 4)) ** 2;
    const flick = (c, wdt) => Math.exp(-(((t - c) / wdt) ** 2));
    b.earL = [8 * deg - 25 * deg * flick(1.3, 0.12), 25 * deg * flick(1.3, 0.15) + 10 * deg * flick(4.2, 0.4)];
    b.earR = [8 * deg - 20 * deg * flick(3.1, 0.12), 30 * deg * flick(3.1, 0.2) + 8 * deg * flick(5.2, 0.4)];
    b.tailYaw += 22 * deg * Math.sin(Math.PI * clamp01((t - 2.2) / 0.9)) - 14 * deg * Math.sin(Math.PI * clamp01((t - 3.0) / 0.8));
    b.tail[0] += 10 * deg * Math.sin(Math.PI * clamp01((t - 2.2) / 1.6));
  },
});

// --- the stand while the rider mounts and dismounts (the horse's side of it): he lands in the saddle at
// 0.7 s (the back takes his weight: a dip, a lean toward the near side, a fore takes a half step), then
// settles; dismounting, the weight leaves at 0.5 s (the back rises, the horse shakes it off)
MOVE.push({
  name: 'horseMount', title: 'Horse: the rider mounts', src: 'move 25:21-25:55', dur: 1.6, fps: 30, from: 'stand', to: 'stand', gaitName: 'stand',
  gait: () => G.stand, events: [{ t: 0.7, name: 'riderOn' }],
  body(t, g, b) {
    const k = Math.exp(-(((t - 0.78) / 0.12) ** 2)) + 0.3 * smooth((t - 0.7) / 0.3) * (1 - smooth((t - 1.2) / 0.4));
    b.cy -= 0.035 * k;
    b.roll -= 0.03 * k;
    b.p -= 0.01 * k;
    b.neck += 5 * deg * k;
    b.head += 4 * deg * k;
    b.earL = [8 * deg - 30 * deg * k, 20 * deg * k];
    b.earR = [8 * deg - 30 * deg * k, 20 * deg * k];
  },
  plantShift: (k, t) => (k === 'FL' && t > 0.8 ? 0.12 : 0),
});
MOVE.push({
  name: 'horseDismount', title: 'Horse: the rider dismounts', src: 'move 25:21-25:55', dur: 1.4, fps: 30, from: 'stand', to: 'stand', gaitName: 'stand',
  gait: () => G.stand, events: [{ t: 0.5, name: 'riderOff' }],
  body(t, g, b) {
    const k = smooth((t - 0.45) / 0.2) * (1 - smooth((t - 0.9) / 0.4));
    b.cy += 0.02 * k;
    b.roll += 0.025 * Math.sin(Math.PI * clamp01((t - 0.45) / 0.5));
    b.neck += 6 * deg * Math.sin(Math.PI * clamp01((t - 0.6) / 0.7));
    b.turn = 10 * deg * Math.sin(Math.PI * clamp01((t - 0.6) / 0.8));
  },
});

// --- the gaits (loops) and the starts and stops between them
MOVE.push({ name: 'horseWalk', title: 'Horse walk', src: 'move 26:27-27:07', loop: true, dur: G.walk.T, fps: 30, speed: G.walk.v, pre: 4, from: 'walk', to: 'walk', gaitName: 'walk', gait: () => G.walk });
MOVE.push({
  name: 'horseWalkStart', title: 'Horse walk: start', src: 'move 26:27-27:07', dur: 1.5, fps: 30, from: 'stand', to: 'walk', gaitName: 'walk', pre: 1, ph0: 0.5,
  gait: gaitSeq([[0, G.stand], [1.0, G.walk]]), speedK: (t) => smooth(t / 1.2),
});
MOVE.push({
  name: 'horseWalkStop', title: 'Horse walk: stop', src: 'move 26:27-27:07', dur: 1.6, fps: 30, from: 'walk', to: 'stand', gaitName: 'walk', pre: 4,
  gait: gaitSeq([[0, G.walk], [1.1, G.stand]]), speedK: (t) => 1 - smooth(t / 1.0),
});
MOVE.push({ name: 'horseRun', title: 'Horse run (canter)', src: 'move 27:07-27:47', loop: true, dur: G.run.T, fps: 60, speed: G.run.v, pre: 3, from: 'run', to: 'run', gaitName: 'run', gait: () => G.run });
MOVE.push({
  name: 'horseRunStart', title: 'Horse run: start', src: 'move 27:07-27:47', dur: 1.3, fps: 60, from: 'walk', to: 'run', gaitName: 'run', pre: 4,
  gait: gaitSeq([[0, G.walk], [0.9, G.run]]), speedK: (t) => 1,
});
MOVE.push({
  name: 'horseRunStop', title: 'Horse run: stop', src: 'move 27:07-27:47', dur: 1.5, fps: 60, from: 'run', to: 'stand', gaitName: 'run', pre: 3,
  gait: gaitSeq([[0, G.run], [0.55, G.walk], [1.2, G.stand]]), speedK: (t) => 1 - 0.85 * smooth(t / 0.9),
  body(t, g, b) {
    // the halt: the haunches drop and the forehand comes up as the hinds slide under him
    const k = Math.sin(Math.PI * clamp01((t - 0.2) / 0.9));
    b.cy -= 0.05 * k;
    b.p += 0.07 * k;
    b.neck += 10 * deg * k;
    b.head += 6 * deg * k;
  },
});
MOVE.push({ name: 'horseSprint', title: 'Horse sprint (gallop)', src: 'move 27:47-28:37', loop: true, dur: G.sprint.T, fps: 60, speed: G.sprint.v, pre: 3, from: 'sprint', to: 'sprint', gaitName: 'sprint', gait: () => G.sprint });
MOVE.push({
  name: 'horseSprintStart', title: 'Horse sprint: start', src: 'move 27:47-28:37', dur: 1.0, fps: 60, from: 'run', to: 'sprint', gaitName: 'sprint', pre: 3,
  gait: gaitSeq([[0, G.run], [0.8, G.sprint]]),
});
MOVE.push({
  name: 'horseSprintStop', title: 'Horse sprint: stop', src: 'move 27:47-28:37', dur: 1.9, fps: 60, from: 'sprint', to: 'stand', gaitName: 'sprint', pre: 3,
  gait: gaitSeq([[0, G.sprint], [0.5, G.run], [1.0, G.walk], [1.5, G.stand]]), speedK: (t) => 1 - 0.9 * smooth(t / 1.3),
  body(t, g, b) {
    const k = Math.sin(Math.PI * clamp01((t - 0.3) / 1.2));
    b.cy -= 0.07 * k;
    b.p += 0.09 * k;
    b.neck += 12 * deg * k;
    b.head += 8 * deg * k;
  },
});
// (stepping round on the spot: a quick, short walk with no travel)
const TURN = { ...G.walk, v: 0, T: 0.8, beta: 0.55, lift: { F: 0.1, H: 0.08 } };
// --- turning: on the spot (a quarter turn, the hinds stepping round), and a walk turning a quarter
for (const [nm, sgn, ttl] of [['horseTurnL', 1, 'Horse: turn left'], ['horseTurnR', -1, 'Horse: turn right']]) {
  MOVE.push({
    name: nm, title: ttl, src: 'move 26:27-27:07', dur: 2.0, fps: 30, from: 'stand', to: 'stand', gaitName: 'walk', pre: 1, ph0: 0.5,
    gait: gaitSeq([[0, G.stand], [0.2, TURN], [1.5, TURN], [1.85, G.stand]]),
    yawRate: (t) => (sgn * (Math.PI / 2) * bump(clamp01((t - 0.1) / 1.6), 0.5)) / 0.8,
    body(t, g, b) {
      const k = bump(clamp01((t - 0.1) / 1.6), 0.5);
      b.turn = sgn * 18 * deg * k;
      b.roll += -sgn * 0.02 * k;
    },
  });
}
for (const [nm, sgn, ttl] of [['horseWalkTurnL', 1, 'Horse walk: turn left'], ['horseWalkTurnR', -1, 'Horse walk: turn right']]) {
  MOVE.push({
    name: nm, title: ttl, src: 'move 26:27-27:07', dur: 3.3, fps: 30, from: 'walk', to: 'walk', gaitName: 'walk', pre: 4,
    gait: () => G.walk,
    yawRate: (t) => sgn * (Math.PI / 2) * (bump(clamp01(t / 3.3), 0.5) / 1.65),
    body(t, g, b) {
      const k = bump(clamp01(t / 3.3), 0.5);
      b.turn = sgn * 15 * deg * k;
      b.roll += -sgn * 0.025 * k;
    },
  });
}

// --- the jump from a stand (measured: gather 0.27 s, 0.5 s in the air pitched up then nose down, fores
// land 0.1 s before the hinds, settled 0.4 s after)
const JUMP = { up: 0.27, foreOff: 0.18, land: 0.77, hindLand: 0.87, rise: 1.0, fwd: 1.6 };
function jumpBody(J, extra = null) {
  return (t, g, b) => {
    const air = t > J.up && t < J.hindLand;
    // the centre's height above standing: the gather dips, the flight is a parabola (or two)
    const gather = -0.12 * Math.sin(Math.PI * clamp01(t / J.up)) * (t < J.up ? 1 : 0);
    let fly = 0;
    if (air) {
      const s = (t - J.up) / (J.land - J.up);
      fly = J.rise * 4 * s * (1 - s) + (extra?.fly?.(t) ?? 0);
    }
    const land = t >= J.land ? -0.1 * Math.sin(Math.PI * clamp01((t - J.land) / 0.45)) : 0;
    b.cy += gather + fly + land + 0.12 * smooth((t - J.up + 0.12) / 0.12) * (1 - smooth((t - J.up - 0.15) / 0.2));
    b.p += keys(J.pitch, t);
    b.neck += keys(J.neck, t);
    b.head += keys(J.headK, t);
    b.tail[0] += keys(J.tail, t);
    b.earL = [8 * deg - 18 * deg * (air ? 1 : 0), 0];
    b.earR = b.earL;
    extra?.body?.(t, g, b);
  };
}
const FORE_TUCK = (t0, t1) => [[t0, 0.2, -0.9, 1.2, 0.6], [t0 + 0.12, 0.32, -0.62, 2.3, 1.2], [t1 - 0.18, 0.3, -0.66, 2.2, 1.1], [t1 - 0.05, 0.35, -1.05, 0.5, 0.3], [t1, 0.32, -1.3, 0, 0]];
const HIND_TRAIL = (t0, t1) => [[t0, -0.35, -1.15, -0.4, 0.4], [t0 + 0.12, -0.75, -0.95, -0.7, 0.9], [(t0 + t1) / 2, -0.25, -0.72, -1.3, 1.3], [t1 - 0.12, 0.05, -1.0, 0.3, 0.5], [t1, 0.0, -1.18, 0.1, 0]];
function jumpSpec(name, title, J, more = {}) {
  return {
    name, title, src: more.src ?? 'move 28:37-29:07', dur: J.dur, fps: 60, from: more.from ?? 'stand', to: more.to ?? 'stand', gaitName: 'jump', pre: more.pre ?? 1,
    gait: more.gait ?? (() => G.stand), speedK: more.speedK,
    events: [{ t: J.up, name: 'takeoff' }, { t: J.land, name: 'land' }, ...(J.kick ? [{ t: J.kick, name: 'kick' }] : [])],
    body: jumpBody(J, more.extra),
    flight: [{
      t0: J.up, t1: J.hindLand,
      legs: {
        FL: { off: J.foreOff, on: J.land, keys: FORE_TUCK(J.foreOff, J.land) },
        FR: { off: J.foreOff + 0.02, on: J.land + 0.03, keys: FORE_TUCK(J.foreOff + 0.02, J.land + 0.03) },
        HL: { off: J.up, on: J.hindLand, keys: HIND_TRAIL(J.up, J.hindLand) },
        HR: { off: J.up + 0.02, on: J.hindLand + 0.02, keys: HIND_TRAIL(J.up + 0.02, J.hindLand + 0.02) },
      },
    }],
    plantShift: (k, t) => (t > J.up ? (k[0] === 'F' ? 0.1 : 0.04) : 0),
    ...more.spec,
  };
}
const jStand = {
  ...JUMP, dur: 1.3,
  pitch: [[0, 0], [0.12, 0.08], [0.27, 0.62], [0.36, 0.56], [0.5, 0.32], [0.62, 0.06], [0.77, -0.22], [0.87, -0.08], [1.05, 0.03], [1.3, 0]],
  neck: [[0, 0], [0.15, -6 * deg], [0.3, 14 * deg], [0.55, 4 * deg], [0.77, -14 * deg], [1.0, 4 * deg], [1.3, 0]],
  headK: [[0, 0], [0.3, 12 * deg], [0.6, 0], [0.77, -6 * deg], [1.3, 0]],
  tail: [[0, 0], [0.27, 10 * deg], [0.5, 30 * deg], [0.8, 35 * deg], [1.1, 5 * deg], [1.3, 0]],
};
// (the root travels forward through the air: a speed between the take-off and the fores' landing)
MOVE.push(jumpSpec('horseJump', 'Horse jump', jStand, {
  gait: (t) => ({ ...G.stand, v: t > jStand.up - 0.05 && t < jStand.land ? jStand.fwd / (jStand.land - jStand.up + 0.05) : 0 }),
}));
// the double jump: a second kick 0.55 s after the take-off (the hinds paddle, the forehand surges up),
// landing 1.3 s after the take-off
const jDouble = {
  ...JUMP, dur: 2.05, land: 1.57, hindLand: 1.67, kick: 0.82, fwd: 2.6, rise: 1.25,
  pitch: [[0, 0], [0.12, 0.08], [0.27, 0.62], [0.4, 0.45], [0.75, 0.1], [0.85, 0.45], [1.0, 0.35], [1.25, 0.0], [1.45, -0.18], [1.57, -0.24], [1.67, -0.08], [1.85, 0.03], [2.05, 0]],
  neck: [[0, 0], [0.15, -6 * deg], [0.3, 14 * deg], [0.7, 0], [0.88, 16 * deg], [1.3, 0], [1.57, -14 * deg], [1.8, 4 * deg], [2.05, 0]],
  headK: [[0, 0], [0.3, 12 * deg], [0.7, 0], [0.9, 10 * deg], [1.3, 0], [1.57, -6 * deg], [2.05, 0]],
  tail: [[0, 0], [0.27, 10 * deg], [0.5, 30 * deg], [0.9, 15 * deg], [1.2, 35 * deg], [1.7, 30 * deg], [1.9, 5 * deg], [2.05, 0]],
};
{
  const J = jDouble;
  const s = jumpSpec('horseDoubleJump', 'Horse double jump', J, {
    src: 'move 29:07-29:39',
    gait: (t) => ({ ...G.stand, v: t > J.up - 0.05 && t < J.land ? J.fwd / (J.land - J.up + 0.05) : 0 }),
    extra: { fly: (t) => 0.5 * Math.sin(Math.PI * clamp01((t - J.kick) / (J.land - J.kick))) },
  });
  // the legs paddle at the kick: the hinds thrust back and tuck again, the fores fold tighter
  const kickHind = (t0, t1) => [[t0, -0.35, -1.15, -0.4, 0.4], [t0 + 0.12, -0.75, -0.95, -0.7, 0.9], [J.kick - 0.08, -0.2, -0.72, -1.3, 1.3], [J.kick + 0.06, -0.85, -0.98, -0.6, 0.7], [J.kick + 0.25, -0.2, -0.7, -1.3, 1.3], [t1 - 0.14, 0.05, -1.0, 0.3, 0.5], [t1, 0.0, -1.18, 0.1, 0]];
  const kickFore = (t0, t1) => [[t0, 0.2, -0.9, 1.2, 0.6], [t0 + 0.12, 0.32, -0.62, 2.3, 1.2], [J.kick, 0.25, -0.72, 1.8, 0.9], [J.kick + 0.12, 0.38, -0.58, 2.4, 1.3], [t1 - 0.2, 0.3, -0.66, 2.2, 1.1], [t1 - 0.05, 0.35, -1.05, 0.5, 0.3], [t1, 0.32, -1.3, 0, 0]];
  const L = s.flight[0].legs;
  L.FL.keys = kickFore(L.FL.off, L.FL.on);
  L.FR.keys = kickFore(L.FR.off, L.FR.on);
  L.HL.keys = kickHind(L.HL.off, L.HL.on);
  L.HR.keys = kickHind(L.HR.off, L.HR.on);
  MOVE.push(s);
}
// the jump out of the canter: the canter carries him in, a flatter flight (less rear), back into the
// canter (one cycle after landing)
{
  const R = G.run, up = 0.3;
  const J = {
    ...JUMP, dur: 1.35, up, foreOff: up - 0.08, land: up + 0.5, hindLand: up + 0.6, rise: 0.85, fwd: 0,
    pitch: [[0, 0], [up - 0.08, 0.25], [up, 0.35], [up + 0.15, 0.12], [up + 0.35, -0.12], [up + 0.5, -0.2], [up + 0.6, -0.05], [up + 0.8, 0], [1.35, 0]],
    neck: [[0, 0], [up, 10 * deg], [up + 0.3, 0], [up + 0.5, -10 * deg], [up + 0.75, 0], [1.35, 0]],
    headK: [[0, 0], [up, 8 * deg], [up + 0.5, -4 * deg], [1.35, 0]],
    tail: [[0, 0], [up, 10 * deg], [up + 0.4, 25 * deg], [up + 0.8, 0], [1.35, 0]],
  };
  const s = jumpSpec('horseJumpRun', 'Horse jump (from the run)', J, { from: 'run', to: 'run', gait: () => R, pre: 3 });
  s.plantShift = (k, t) => (t > J.up && t < J.hindLand + 0.05 ? (k[0] === 'F' ? 0.1 : -0.1) : 0);
  for (const L of Object.values(s.flight[0].legs)) L.easeA = 0.05;
  MOVE.push(s);
}

// --- under the rider's attacks (SWORD film): the horse stands, braces and leans off the cut; his head
// turns away from the blade. The rider's cut lands at `hit`.
function attackSpec(name, title, src, dur, hits, k) {
  // hits: the times the rider's cuts land (s); each one: a wind-up before it, the cut, a settle after
  const one = (t, hit, prev) => {
    const w0 = Math.max(prev + 0.1, hit - 0.55);
    return {
      wind: smooth((t - w0) / Math.max(0.1, hit - 0.05 - w0)) * (1 - smooth((t - hit) / 0.15)),
      cut: Math.exp(-(((t - hit - 0.05) / 0.12) ** 2)),
    };
  };
  const last = hits[hits.length - 1];
  return {
    name, title, src, dur, fps: 30, from: 'stand', to: 'stand', gaitName: 'stand', gait: () => G.stand,
    events: hits.map((h) => ({ t: h, name: 'hit' })),
    phases: { windup: Math.round((hits[0] - 0.2) * 30), active: Math.round(last * 30), recover: Math.round((dur - 0.15) * 30) },
    body(t, g, b) {
      let wind = 0, cut = 0, prev = -1;
      for (const h of hits) {
        const o = one(t, h, prev);
        wind = Math.max(wind, o.wind);
        cut = Math.max(cut, o.cut);
        prev = h;
      }
      const settle = Math.sin(Math.PI * clamp01((t - hits[0]) / (dur - hits[0])));
      // winding up to his left the rider's weight shifts that way: the horse leans right; on the cut the
      // weight swings across: a lean left, a dip, the head thrown away from the blade
      b.roll += k * (0.025 * wind - 0.05 * cut - 0.012 * settle);
      b.cy -= k * (0.02 * cut + 0.006 * wind);
      b.p += k * (0.015 * wind - 0.02 * cut);
      b.turn = k * (-8 * deg * wind + 16 * deg * cut + 5 * deg * settle);
      b.neck += k * (4 * deg * wind - 6 * deg * cut);
      b.earL = [8 * deg - 30 * deg * Math.max(wind, cut) * k, 0];
      b.earR = b.earL;
      b.tailYaw += k * 18 * deg * cut;
    },
    plantShift: (key, t) => (key === 'FR' && t > hits[0] + 0.08 ? 0.1 * k : 0),
  };
}
// the light cut lands 0.5 s in (SWORD 7:16.6-7:18.0); the heavy is two big swings (SWORD 8:08.5-8:12.5):
// the first lands 1.0 s in, the second, wound up again from 2.9 s, at 3.4 s; still at 4.0 s
SWORD.push(attackSpec('horseRiderLight', "Horse: the rider's light attack", 'sword 7:02-7:48', 1.2, [0.5], 1));
SWORD.push(attackSpec('horseRiderHeavy', "Horse: the rider's heavy attack", 'sword 7:48-8:40', 4.0, [1.0, 3.4], 1.6));

// ------------------------------------------------------------------ write
function writeSet(file, set, title, specs) {
  const clips = [];
  const lines = [];
  for (const s of specs) {
    const { clip, report } = build(s);
    clips.push(clip);
    lines.push(`${clip.name.padEnd(18)} n ${String(clip.n).padStart(3)} @${clip.fps}  miss ${(report.maxMiss * 100).toFixed(1)} cm (${report.missAt}) air ${(report.swingMiss * 100).toFixed(0)}  slide ${(report.slide * 100).toFixed(1)} cm  drop ${(report.drop * 100).toFixed(0)}  sink ${(report.sink * 100).toFixed(1)} cm  travel ${report.travel.toFixed(2)} m${report.mps != null ? `  ${report.mps.toFixed(2)} m/s` : ''}  contacts ${KEYS.map((k) => `${k}:${clip.contact[k].map((c) => c.join('-')).join(',')}`).join(' ')}`);
  }
  const body = `// GENERATED by scripts/mocap/horse/gen.mjs: do not edit by hand (rebuild instead).
// ${title}: the horse's clips in the hero's clip format (README.md), on the horse's skeleton (horse/hskeleton.js).
// Authored from the owner's reference footage (the measured numbers: gen.mjs REF_NUMBERS).
export default ${JSON.stringify({ set, title, clips }, null, 0).replace(/\},\{"name"/g, '},\n{"name"')};
`;
  // (a run for one clip only checks it: the set files are written by a full run)
  if (!only) fs.writeFileSync(path.join(ROOT, 'src/entities/hero2/horse/clips', file), body);
  return lines;
}

fs.mkdirSync(path.join(ROOT, 'src/entities/hero2/horse/clips'), { recursive: true });
const only = process.argv[2];
const report = [];
report.push(...writeSet('horseMove.js', 'horseMove', 'Horse: movement', MOVE.filter((s) => !only || s.name === only)));
report.push(...writeSet('horseSword.js', 'horseSword', 'Horse: under the rider\'s attacks', SWORD.filter((s) => !only || s.name === only)));
console.log(report.join('\n'));
