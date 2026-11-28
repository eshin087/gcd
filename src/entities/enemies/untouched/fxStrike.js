import { lookOf } from '../duelist/lookSwitch.js';
import { K_STEEL } from '../duelist/fx.js';

// THE STRIKE ON THE SHELL (round 4, ADR-266). The owner: the barrier is "a subtle barrier that's an outline
// of his body", and "anytime you hit him it only shows the full ascii outline during the hit, and goes away
// after the hit ends". So a cut stopped on the shell shows the shell WHOLE, at once, as the outline of his
// body a hand's width off it, in faint strokes, for as long as the hit lasts (`hold` s), then it is gone:
// no wave, no flash, no rings, no white point, no push of air. Heat in the fire field written on the letter
// grid (fx._ink, STYLE.md "The fire field"), one stroke per letter cell.
// Behind the live look switch `?wjStrike=0|a` (PICKED a: the owner's own description; '0' = the ripple of
// rings as first shipped).
//
// THE OUTLINE: his figure as drawn at the stop (his mesh points, fx._bodyPts) on the camera's plane, a
// distance field on a grid, cut by marching squares `body + pad` m off his surface; every segment runs with
// his body on its left, so each starts where the last ended and no letter cell prints twice.
//
// THE SURFACE (fx.js calls these; all safe every frame, nothing allocated per frame):
//   wjStrikeNow()                         the look being played
//   createStrikes()                       the pool (fx.js holds it)
//   strikeStart(fx, st, d, point, heavy)  from barrierStop: true = the outline took the stop (draw nothing else)
//   strikeUpdate(fx, st, d, fdt)          every frame (fx.js _wjUpdate)

export const STRIKE_OPTS = Object.freeze(['0', 'a']);
/** The look being played ('0' = the ripple as first shipped). */
export function wjStrikeNow() {
  const v = lookOf('wjStrike', '0');
  return STRIKE_OPTS.includes(v) ? v : '0';
}

export const STRIKE = Object.freeze({
  hold: 0.16, // s the outline shows (the hit: the stop's freeze and the hero's bounce off it)
  heavy: 0.2, // s for a heavy cut
  heat: 0.42, // faint strokes (1.1 is a bright stroke, 1.2 a white digit)
  heatHeavy: 0.5,
  cell: 0.085, // m: the grid the outline is cut on
  body: 0.07, // m round a mesh point that counts as his body
  pad: 0.13, // m off his surface (the blade stops 0.14 off his hurt spheres: TUNING.wjBarrier.shell)
});

const GW = 72, GH = 96; // the grid's most nodes
const MAX_SEG = 900;

/** The pool: a few strikes at once (the oldest is reused). */
export function createStrikes() {
  const list = [];
  for (let i = 0; i < 3; i++) list.push({ alive: false, t: 0, T: 0, heat: 0, seg: new Float32Array(MAX_SEG * 4), n: 0 });
  return { list, field: new Float32Array(GW * GH), ps: new Float32Array(600), X: new Float32Array(8), E: new Uint8Array(4) };
}

/** His centre (the shell's) in `o`. */
function centre(fx, d, o) {
  const S = fx._shell(d);
  o.ok = S.ok;
  o.x = S.px;
  o.y = S.fy + S.top * 0.5;
  o.z = S.pz;
  return o;
}

/** The blade stopped on the shell: the outline, whole, for the hit. False for '0' (the ripple). */
export function strikeStart(fx, st, d, point, heavy = false) {
  if (wjStrikeNow() === '0' || !st) return false;
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
  r.n = 0;
  try {
    buildOutline(fx, st, r, d, C, fx._axes());
  } catch (err) {
    console.error('[untouched] strike outline', err);
    r.n = 0;
  }
  if (!(r.n > 0)) return false; // (no figure to read: the ripple)
  r.t = 0;
  r.T = heavy ? STRIKE.heavy : STRIKE.hold;
  r.heat = heavy ? STRIKE.heatHeavy : STRIKE.heat;
  r.alive = true;
  void point;
  return true;
}

/** His outline on the camera's plane (m from his centre) into r.seg. */
function buildOutline(fx, st, r, d, C, A) {
  const n = fx._bodyPts?.(d) ?? 0;
  if (!(n >= 12)) return;
  const P = fx._gp, T = STRIKE, cell = T.cell, ps = st.ps, m = Math.min(n, 300);
  let s0 = Infinity, s1 = -Infinity, u0 = Infinity, u1 = -Infinity;
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
  const lv = T.body + T.pad, out = lv + cell * 2;
  s0 -= out;
  u0 -= out;
  const nx = Math.min(GW, Math.ceil((s1 + out - s0) / cell) + 1), ny = Math.min(GH, Math.ceil((u1 + out - u0) / cell) + 1);
  if (!(nx > 3 && ny > 3)) return;
  // the field: at every node, the distance to his nearest body point, less the outline's
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
      F[j * GW + i] = Math.sqrt(best) - lv;
    }
  }
  // marching squares: corners counter-clockwise a (i, j), b (i+1, j), c (i+1, j+1), d (i, j+1); inside < 0
  const seg = r.seg, X = st.X, E = st.E;
  let c = 0;
  for (let j = 0; j + 1 < ny && c < MAX_SEG; j++) {
    for (let i = 0; i + 1 < nx && c < MAX_SEG; i++) {
      const va = F[j * GW + i], vb = F[j * GW + i + 1], vc = F[(j + 1) * GW + i + 1], vd = F[(j + 1) * GW + i];
      const ia = va < 0, ib = vb < 0, ic = vc < 0, id = vd < 0;
      if (ia === ib && ib === ic && ic === id) continue;
      const xa = s0 + i * cell, ya = u0 + j * cell, xb = xa + cell, yb = ya + cell;
      let q = 0;
      // each crossing round the cell, in order: an exit (inside -> outside) or an entry
      const edge = (v0, v1, x0, y0, x1, y1, in0) => {
        if (v0 < 0 === v1 < 0) return;
        const t = v0 / (v0 - v1);
        X[q * 2] = x0 + (x1 - x0) * t;
        X[q * 2 + 1] = y0 + (y1 - y0) * t;
        E[q] = in0 ? 1 : 0;
        q++;
      };
      edge(va, vb, xa, ya, xb, ya, ia);
      edge(vb, vc, xb, ya, xb, yb, ib);
      edge(vc, vd, xb, yb, xa, yb, ic);
      edge(vd, va, xa, yb, xa, ya, id);
      // each exit joined to the crossing after it: his body on the segment's left
      for (let e = 0; e < q && c < MAX_SEG; e++) {
        if (!E[e]) continue;
        const f = (e + 1) % q;
        seg[c * 4] = X[e * 2];
        seg[c * 4 + 1] = X[e * 2 + 1];
        seg[c * 4 + 2] = X[f * 2];
        seg[c * 4 + 3] = X[f * 2 + 1];
        c++;
      }
    }
  }
  r.n = c;
}

/** Every frame: the live outline round him where he stands, whole, at one faint heat; gone when the hit is. */
export function strikeUpdate(fx, st, d, fdt) {
  if (!st) return;
  let any = false;
  for (const r of st.list) {
    if (!r.alive) continue;
    r.t += Number.isFinite(fdt) ? fdt : 0;
    if (r.t > r.T || d.mode === 'dead' || !d.barrier?.up) r.alive = false;
    else any = true;
  }
  if (!any || !fx.fire || !(fx._frame() > 0)) return;
  const C = centre(fx, d, (fx._wjC ??= { ok: false, x: 0, y: 0, z: 0 }));
  if (!C.ok) return;
  const A = fx._axes(), Q = fx._toCamera(C.x, C.y, C.z), ox = Q.x, oy = Q.y, oz = Q.z;
  // one stroke per letter cell the outline crosses, whatever number of its pieces fall in it (pieces
  // sharing a cell would add their heat up to a white digit): each piece's middle, snapped to its cell
  // (a zero-length _ink), once per cell per frame
  const seen = (st.seen ??= new Set());
  seen.clear();
  for (const r of st.list) {
    if (!r.alive) continue;
    const seg = r.seg, h = r.heat;
    for (let i = 0; i < r.n; i++) {
      const s = (seg[i * 4] + seg[i * 4 + 2]) * 0.5, u = (seg[i * 4 + 1] + seg[i * 4 + 3]) * 0.5;
      const x = ox + A.rx * s + A.ux * u, y = oy + A.ry * s + A.uy * u, z = oz + A.rz * s + A.uz * u;
      const S = fx._screen(x, y, z);
      if (S.ok) {
        const key = Math.floor(S.px / S.cw) * 8192 + Math.floor(S.py / S.ch);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      fx._ink(x, y, z, x, y, z, 0, h, 0, h, 0, K_STEEL);
    }
  }
}
