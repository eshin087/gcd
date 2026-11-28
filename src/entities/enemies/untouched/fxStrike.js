import { lookOf } from '../duelist/lookSwitch.js';
import { K_STEEL } from '../duelist/fx.js';

// THE STRIKE ON THE SHELL (round 4, ADR-266). The owner, after two filmed tries (a wave of light round the
// shell; his body's whole outline): "it should always show up on every hit that [the barrier] is blocking
// ... [it] doesn't have to be a perfect outline of the boss character and should be like a cool subtle ascii
// invisible shield briefly showing per hit on the hit location".
// So every cut stopped on the shell shows a PATCH of the shell where it struck: a faint net of crossing
// strokes ('/' and '\' printing as a diamond mesh) on the shell's surface round the point, opening out from it
// and fading in about a fifth of a second, brightest at the point, cut off at the shell's edge. Nothing else of
// the stop is drawn (no white point, no ripple). Heat in the fire field written on the letter grid (fx._ink),
// one stroke per letter cell a frame.
// Behind the live look switch `?wjStrike=0|a` (PICKED a; '0' = the ripple of rings as first shipped).
//
// THE SURFACE (fx.js calls these; all safe every frame, nothing allocated per frame):
//   wjStrikeNow()                         the look being played
//   createStrikes()                       the pool (fx.js holds it)
//   strikeStart(fx, st, d, point, heavy)  from barrierStop: true = the patch took the stop (draw nothing else)
//   strikeUpdate(fx, st, d, fdt)          every frame (fx.js _wjUpdate)

export const STRIKE_OPTS = Object.freeze(['0', 'a']);
/** The look being played ('0' = the ripple as first shipped). */
export function wjStrikeNow() {
  const v = lookOf('wjStrike', '0');
  return STRIKE_OPTS.includes(v) ? v : '0';
}

export const STRIKE = Object.freeze({
  T: 0.22, // s a patch shows (a heavy cut: x heavyT)
  heavyT: 1.3,
  r0: 0.3, // m: the patch's radius at the hit
  r1: 0.8, // m: at its end (it opens out from the point)
  heavyR: 1.25, // a heavy cut's radii x
  sp: 0.24, // m between the net's parallel strokes
  step: 0.05, // m between samples along a stroke (one letter cell prints once whatever the count)
  heat: 0.55, // at the point (1.1 is a bright stroke, 1.2 a white digit); it falls to 0 at the patch's edge
  edge: 1.04, // the shell's outline (1) and a little: the net is cut off there
});

const MAX = 6; // patches at once (every hit shows; the oldest is reused)

/** The pool. */
export function createStrikes() {
  const list = [];
  for (let i = 0; i < MAX; i++) list.push({ alive: false, t: 0, T: 0, s: 0, u: 0, k: 1 });
  return { list, seen: new Set() };
}

/** The blade stopped on the shell at `point`: a patch of it shows there. False for '0' (the ripple). */
export function strikeStart(fx, st, d, point, heavy = false) {
  if (wjStrikeNow() === '0' || !st || !point || !Number.isFinite(point.x + point.y + point.z)) return false;
  const S = fx._shell(d);
  if (!S.ok) return false;
  let r = st.list[0];
  for (const q of st.list) {
    if (!q.alive) {
      r = q;
      break;
    }
    if (q.t > r.t) r = q;
  }
  // where it struck on the shell's plane, in its radii (a point outside the outline is brought onto it)
  const Q = fx._onShell(point.x, point.y, point.z);
  const l = Math.hypot(Q.x, Q.y), c = l > 0.97 ? 0.97 / l : 1;
  r.s = Q.x * c;
  r.u = Q.y * c;
  r.k = heavy ? STRIKE.heavyR : 1;
  r.T = STRIKE.T * (heavy ? STRIKE.heavyT : 1);
  r.t = 0;
  r.alive = true;
  return true;
}

/** Every frame: each live patch on the shell where he stands now. */
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
  const S = fx._shell(d);
  if (!S.ok) return;
  const T = STRIKE, seen = st.seen, rx = Math.max(0.05, S.rx), hu = Math.max(0.05, S.hu);
  seen.clear();
  for (const r of st.list) {
    if (!r.alive) continue;
    const f = r.t / r.T, ease = 1 - (1 - f) * (1 - f);
    const R = (T.r0 + (T.r1 - T.r0) * ease) * r.k, fade = 1 - f * f, H = T.heat * fade;
    const cs = r.s * rx, cu = r.u * hu; // the point, m on the plane
    // the net: strokes along both diagonals through the patch, sampled every `step` m
    const n = Math.ceil(R / T.sp) + 1, m = Math.ceil((R * 1.42) / T.step);
    for (let dir = 0; dir < 2; dir++) {
      const sx = dir ? 0.7071 : 0.7071, sy = dir ? -0.7071 : 0.7071; // along the stroke
      const nx = -sy, ny = sx; // across the strokes
      for (let k = -n; k <= n; k++) {
        const ox = nx * k * T.sp, oy = ny * k * T.sp;
        for (let j = -m; j <= m; j++) {
          const ps = ox + sx * j * T.step, pu = oy + sy * j * T.step, dd = Math.hypot(ps, pu);
          if (dd > R) continue;
          const s = cs + ps, u = cu + pu;
          if ((s / rx) * (s / rx) + (u / hu) * (u / hu) > T.edge * T.edge) continue;
          const q = 1 - dd / R, h = H * (0.3 + 0.7 * q) * Math.min(1, q * 5); // (soft to the edge, a short fade there)
          if (!(h > 0.04)) continue;
          const P = fx._shellPt(s / rx, u / hu);
          const Sc = fx._screen(P.x, P.y, P.z);
          if (Sc.ok) {
            const key = Math.floor(Sc.px / Sc.cw) * 8192 + Math.floor(Sc.py / Sc.ch);
            if (seen.has(key)) continue;
            seen.add(key);
          }
          // a short piece along the stroke, so the cell prints as the stroke's slant
          const a = fx._shellPt((s - sx * 0.03) / rx, (u - sy * 0.03) / hu, (fx._wjA ??= { x: 0, y: 0, z: 0 }));
          const ax = a.x, ay = a.y, az = a.z;
          const b = fx._shellPt((s + sx * 0.03) / rx, (u + sy * 0.03) / hu, (fx._wjB ??= { x: 0, y: 0, z: 0 }));
          fx._ink(ax, ay, az, b.x, b.y, b.z, 0, h, 0, h, 0, K_STEEL);
        }
      }
    }
  }
}
