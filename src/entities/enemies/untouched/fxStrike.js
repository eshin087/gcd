import { lookOf } from '../duelist/lookSwitch.js';
import { K_STEEL } from '../duelist/fx.js';

// THE STRIKE ON THE SHELL (round 4; the owner: "when the player hits him and the sword is hitting the
// barrier, show a cool ascii effect of the sword hitting the barrier and it showing its silhouette
// briefly"). Behind the live look switch `?wjStrike=0|a|b|c` ('0' = the ripple as first shipped; the
// owner picks). Every look keeps the stop's white point, its push of air and its shards (fx.js
// barrierStop); a, b and c replace the ripple's rings with the shell's SILHOUETTE, lit by a wave that
// runs out of the point where the blade stopped and fades in about half a second. All of it is heat in
// the fire field written on the letter grid (fx._ink: one stroke per letter cell, STYLE.md "The fire
// field"); nothing new is drawn any other way.
//   a  the shell: the barrier's whole oval outline, lit round from the point both ways
//   b  his outline: the shell as it hugs him, a hand's width off his body (his own figure, as drawn at
//      the stop: his mesh points, fx._bodyPts), lit from the point outward
//   c  the rings: that outline and two wider ones behind it, each a beat later, the space round him
//      rippling outward in his own shape
//
// THE SURFACE (fx.js calls these; all safe every frame, nothing allocated per frame):
//   wjStrikeNow()                         the look being played
//   createStrikes()                       the pool (fx.js holds it)
//   strikeStart(fx, st, d, point, heavy)  from barrierStop: true = a look took the stop (no ripple)
//   strikeUpdate(fx, st, d, fdt)          every frame (fx.js _wjUpdate)

export const STRIKE_OPTS = Object.freeze(['0', 'a', 'b', 'c']);
/** The look being played ('0' = the ripple as first shipped). */
export function wjStrikeNow() {
  const v = lookOf('wjStrike', '0');
  return STRIKE_OPTS.includes(v) ? v : '0';
}

export const STRIKE = Object.freeze({
  T: 0.52, // s the silhouette lives (it fades over the last `fade`)
  fade: 0.2,
  speed: 8.5, // m/s the light runs out of the point over the outline
  tau: 0.13, // s a stroke takes to cool from the wave's crest to its tail
  peak: 0.8, // the crest's heat (1.2 prints a white digit; two strokes meeting add up: kept well under it)
  tail: 0.45, // x peak: what stays lit behind the crest until the fade
  heavy: 1.12, // a heavy cut's crest x
  near: 0.55, // m round the point the outline burns hotter (x `hot`)
  hot: 1.05,
  // the outline (b, c): his body points on the camera's plane, a grid of `cell` m, the shell `pad` m off
  // his surface (the blade stops 0.14 off his hurt spheres: TUNING.wjBarrier.shell); `body` m round a
  // mesh point counts as his body
  cell: 0.085,
  body: 0.07,
  pad: 0.13,
  rings: [0, 0.3, 0.62], // c: m outside the first outline for each ring
  ringLag: 0.06, // c: s between rings
  ringK: [1, 0.6, 0.38], // c: each ring's heat x
  // a: the oval in this many pieces
  rimN: 48,
});

const GW = 72, GH = 96; // the grid's most nodes
const MAX_SEG = 1800;

/** The pool: a few strikes at once (the oldest is reused). */
export function createStrikes() {
  const list = [];
  for (let i = 0; i < 3; i++) {
    list.push({
      alive: false, t: 0, look: 'a', heavy: false, cs: 0, cu: 0, ang: 0,
      seg: new Float32Array(MAX_SEG * 4), dist: new Float32Array(MAX_SEG), ring: new Uint8Array(MAX_SEG), n: 0,
    });
  }
  return { list, field: new Float32Array(GW * GH), gs: { s0: 0, u0: 0, nx: 0, ny: 0 } };
}

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** His centre (the shell's): x, y, z in `o`. */
function centre(fx, d, o) {
  const S = fx._shell(d);
  o.ok = S.ok;
  o.x = S.px;
  o.y = S.fy + S.top * 0.5;
  o.z = S.pz;
  return o;
}

/** The blade stopped on the shell at `point`: start the look's silhouette. False for '0' (the ripple). */
export function strikeStart(fx, st, d, point, heavy = false) {
  const look = wjStrikeNow();
  if (look === '0' || !st || !point) return false;
  const C = centre(fx, d, (fx._wjC ??= { ok: false, x: 0, y: 0, z: 0 }));
  if (!C.ok) return false;
  let r = st.list[0];
  for (const q of st.list) {
    if (!q.alive) {
      r = q;
      break;
    }
    if (q.t > r.t) r = q;
  }
  const A = fx._axes();
  const px = point.x - C.x, py = point.y - C.y, pz = point.z - C.z;
  r.cs = px * A.rx + py * A.ry + pz * A.rz;
  r.cu = px * A.ux + py * A.uy + pz * A.uz;
  r.look = look;
  r.heavy = !!heavy;
  r.t = 0;
  r.n = 0;
  // (a: the point's angle on the oval)
  const S = fx._sh;
  r.ang = Math.atan2(r.cu / Math.max(0.05, S.hu), r.cs / Math.max(0.05, S.rx));
  if (look === 'b' || look === 'c') {
    try {
      buildOutline(fx, st, r, d, C, A, look === 'c' ? STRIKE.rings.length : 1);
    } catch (err) {
      console.error('[untouched] strike outline', err);
      r.n = 0;
    }
    if (!(r.n > 0)) r.look = 'a'; // (no figure to read: the oval)
  }
  r.alive = true;
  return true;
}

/** His outline(s) on the camera's plane, from his body points: a distance field on a grid, cut by
 *  marching squares at each ring's distance; every segment runs with his body on its left (so each one
 *  starts where the last ended and the strokes never print twice). Plane coordinates, m from his centre. */
function buildOutline(fx, st, r, d, C, A, rings) {
  const n = fx._bodyPts?.(d) ?? 0;
  if (!(n >= 12)) return;
  const P = fx._gp, T = STRIKE, cell = T.cell;
  // the points on the plane, and their bounds
  let s0 = Infinity, s1 = -Infinity, u0 = Infinity, u1 = -Infinity;
  const ps = (st._ps ??= new Float32Array(600)), m = Math.min(n, 300);
  for (let i = 0; i < m; i++) {
    const x = P[i * 3] - C.x, y = P[i * 3 + 1] - C.y, z = P[i * 3 + 2] - C.z;
    const s = x * A.rx + y * A.ry + z * A.rz, u = x * A.ux + y * A.uy + z * A.uz;
    ps[i * 2] = s;
    ps[i * 2 + 1] = u;
    if (s < s0) s0 = s;
    if (s > s1) s1 = s;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
  }
  const out = T.body + T.pad + T.rings[rings - 1] + cell * 2;
  s0 -= out;
  s1 += out;
  u0 -= out;
  u1 += out;
  const nx = Math.min(GW, Math.ceil((s1 - s0) / cell) + 1), ny = Math.min(GH, Math.ceil((u1 - u0) / cell) + 1);
  if (!(nx > 3 && ny > 3)) return;
  // the field: at every node, the distance to his nearest body point
  const F = st.field;
  for (let j = 0; j < ny; j++) {
    const u = u0 + j * cell;
    for (let i = 0; i < nx; i++) {
      const s = s0 + i * cell;
      let best = 1e9;
      for (let k = 0; k < m; k++) {
        const ds = ps[k * 2] - s, du = ps[k * 2 + 1] - u, q = ds * ds + du * du;
        if (q < best) best = q;
      }
      F[j * GW + i] = Math.sqrt(best);
    }
  }
  // each ring's outline
  let c = 0;
  const seg = r.seg, dist = r.dist, ring = r.ring;
  for (let k = 0; k < rings; k++) {
    const lv = T.body + T.pad + T.rings[k];
    for (let j = 0; j + 1 < ny && c < MAX_SEG; j++) {
      for (let i = 0; i + 1 < nx && c < MAX_SEG; i++) {
        // corners counter-clockwise: a (i, j), b (i+1, j), cc (i+1, j+1), dd (i, j+1); inside = nearer than lv
        const va = F[j * GW + i] - lv, vb = F[j * GW + i + 1] - lv, vc = F[(j + 1) * GW + i + 1] - lv, vd = F[(j + 1) * GW + i] - lv;
        const ia = va < 0, ib = vb < 0, ic = vc < 0, id = vd < 0;
        if (ia === ib && ib === ic && ic === id) continue;
        // the crossings in counter-clockwise order round the cell: [x, y, exit?]
        const X = (st._x ??= new Float32Array(12)), E = (st._e ??= new Uint8Array(4));
        let q = 0;
        const edge = (v0, v1, x0, y0, x1, y1, in0) => {
          if ((v0 < 0) === (v1 < 0)) return;
          const t = v0 / (v0 - v1);
          X[q * 2] = x0 + (x1 - x0) * t;
          X[q * 2 + 1] = y0 + (y1 - y0) * t;
          E[q] = in0 ? 1 : 0; // inside -> outside going round: an exit
          q++;
        };
        const xa = s0 + i * cell, ya = u0 + j * cell, xb = xa + cell, yb = ya + cell;
        edge(va, vb, xa, ya, xb, ya, ia);
        edge(vb, vc, xb, ya, xb, yb, ib);
        edge(vc, vd, xb, yb, xa, yb, ic);
        edge(vd, va, xa, yb, xa, ya, id);
        // each exit joined to the crossing after it (an entry): the body on the segment's left
        for (let e = 0; e < q && c < MAX_SEG; e++) {
          if (!E[e]) continue;
          const f = (e + 1) % q;
          seg[c * 4] = X[e * 2];
          seg[c * 4 + 1] = X[e * 2 + 1];
          seg[c * 4 + 2] = X[f * 2];
          seg[c * 4 + 3] = X[f * 2 + 1];
          const mx = (X[e * 2] + X[f * 2]) * 0.5 - r.cs, my = (X[e * 2 + 1] + X[f * 2 + 1]) * 0.5 - r.cu;
          dist[c] = Math.hypot(mx, my);
          ring[c] = k;
          c++;
        }
      }
    }
  }
  r.n = c;
}

/** A stroke's heat at `te` s after the wave reached it (te < 0: not yet). */
function waveHeat(r, te, near) {
  if (te < 0) return 0;
  const T = STRIKE, crest = T.peak * (r.heavy ? T.heavy : 1);
  const k = T.tail + (1 - T.tail) * Math.exp(-te / T.tau);
  const fade = clamp01((T.T - r.t) / T.fade);
  return Math.min(1.0, crest * k * fade * (near < T.near ? T.hot : 1));
}

/** Every frame: each live strike's silhouette, drawn round him where he stands now. */
export function strikeUpdate(fx, st, d, fdt) {
  if (!st) return;
  let any = false;
  for (const r of st.list) {
    if (!r.alive) continue;
    r.t += fin(fdt);
    const life = STRIKE.T + (r.look === 'c' ? STRIKE.ringLag * (STRIKE.rings.length - 1) : 0);
    if (r.t > life || d.mode === 'dead' || !d.barrier?.up) {
      r.alive = false;
      continue;
    }
    any = true;
  }
  if (!any || !fx.fire || !(fx._frame() > 0)) return;
  const C = centre(fx, d, (fx._wjC ??= { ok: false, x: 0, y: 0, z: 0 }));
  if (!C.ok) return;
  for (const r of st.list) {
    if (!r.alive) continue;
    if (r.look === 'a') drawRim(fx, r);
    else drawOutline(fx, r, C);
  }
}

/** a: the oval, lit round from the point both ways. */
function drawRim(fx, r) {
  const S = fx._sh, N = STRIKE.rimN, per = Math.PI * Math.max(0.3, (S.rx + S.hu) * 0.5); // m from the point to the far side
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= N; i++) {
    const a = r.ang + (i / N) * Math.PI * 2;
    const P = fx._shellPt(Math.cos(a), Math.sin(a));
    if (i > 0) {
      const off = Math.min(i, N - i) / N; // 0 at the point, 0.5 across
      const m = off * 2 * per, h = waveHeat(r, r.t - m / STRIKE.speed, m);
      if (h > 0.03) fx._ink(px, py, pz, P.x, P.y, P.z, 0, h, 0, h, 1, K_STEEL);
    }
    px = P.x;
    py = P.y;
    pz = P.z;
  }
}

/** b, c: his outline(s), each segment from the strike's plane onto where he stands now. */
function drawOutline(fx, r, C) {
  const A = fx._axes(), Q = fx._toCamera(C.x, C.y, C.z), ox = Q.x, oy = Q.y, oz = Q.z;
  const seg = r.seg, T = STRIKE;
  for (let i = 0; i < r.n; i++) {
    const k = r.ring[i];
    const te = r.t - k * T.ringLag - r.dist[i] / T.speed;
    const h = waveHeat(r, te, r.dist[i]) * (r.look === 'c' ? T.ringK[k] ?? 0.4 : 1);
    if (!(h > 0.03)) continue;
    const s0 = seg[i * 4], u0 = seg[i * 4 + 1], s1 = seg[i * 4 + 2], u1 = seg[i * 4 + 3];
    fx._ink(
      ox + A.rx * s0 + A.ux * u0, oy + A.ry * s0 + A.uy * u0, oz + A.rz * s0 + A.uz * u0,
      ox + A.rx * s1 + A.ux * u1, oy + A.ry * s1 + A.uy * u1, oz + A.rz * s1 + A.uz * u1,
      0, h, 0, h, 1, K_STEEL,
    );
  }
}
