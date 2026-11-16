// Preview-only idle choreography. The original six-slot scheduler still owns
// timing and cancellation; these gestures replace its hand and blade targets.
import { P } from '../../entities/player/anim.js';
import { clamp, smoothstep } from '../../core/math.js';

export const IDLE_GESTURES = Object.freeze([
  { label: 'Look around', duration: 3.4 },
  { label: 'Loosen shoulders', duration: 3.0 },
  { label: 'Check the edge', duration: 3.8 },
  { label: 'Low blade flourish', duration: 1.7 },
  { label: 'Lift and settle', duration: 3.6 },
  { label: 'Shift weight', duration: 4.2 },
]);
const toward = (p, i, x, y, z, w) => {
  p[i] += (x - p[i]) * w; p[i + 1] += (y - p[i + 1]) * w; p[i + 2] += (z - p[i + 2]) * w;
};
function blade(p, azimuth, elevation, w) {
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  toward(p, P.swD, Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e), w);
}

export function temperedIdle(p, A) {
  const F = A.fidget, gesture = IDLE_GESTURES[F?.k];
  if (!gesture || !(F.w > 0)) return;
  const u = clamp(F.t / gesture.duration, 0, 1), e = F.w;
  const arc = Math.sin(Math.PI * u), sway = Math.sin(Math.PI * 2 * u);
  // Free wrists stay aligned with their forearms. Express the gesture through
  // shoulders and elbows instead of bending fingers into a world-space target.
  toward(p, P.lD, 0, 0, 0, e); toward(p, P.lN, 0, 0, 0, e);
  p[P.hs] *= 1 - e; p[P.lk] *= 1 - e;
  switch (F.k) {
    case 0:
      p[P.hdY] += 0.48 * sway * e;
      p[P.spY] += 0.1 * sway * e;
      p[P.hdX] -= 0.035 * arc * e;
      break;
    case 1:
      toward(p, P.lH, 0.08, -0.44 + 0.045 * arc, 0.10 + 0.06 * sway, e);
      p[P.spX] -= 0.055 * arc * e;
      p[P.spZ] -= 0.035 * sway * e;
      p[P.hdZ] += 0.12 * sway * e;
      break;
    case 2:
      toward(p, P.rH, -0.14, -0.20, 0.34, e);
      toward(p, P.rP, 0.02, -0.9, -0.4, e);
      blade(p, -24 + 8 * sway, 20 + 6 * arc, e);
      toward(p, P.swF, 0.3, 1, -0.15, e);
      toward(p, P.lH, -0.015, -0.25, 0.24, e);
      toward(p, P.lP, 0.35, -0.8, -0.45, e);
      p[P.hdY] -= 0.18 * e; p[P.hdX] += 0.09 * e;
      break;
    case 3: {
      // A controlled low arc, driven by the arm. The old full wrist circle
      // folded the blade behind the forearm during its upper half.
      const s = smoothstep(0.12, 0.88, u), sweep = Math.sin(Math.PI * s);
      toward(p, P.rH, -0.18 - 0.025 * sweep, -0.40 + 0.075 * sweep, 0.12 + 0.12 * sweep, e);
      toward(p, P.rP, 0.2, -0.5, -0.8, e);
      blade(p, -58 + 38 * sweep, -48 + 36 * sweep, e);
      p[P.spY] += 0.10 * sweep * e; p[P.hdY] -= 0.12 * sweep * e;
      break;
    }
    case 4:
      // Lift the steel in front of the shoulder, never lay it behind the head.
      toward(p, P.rH, -0.16, -0.17, 0.31, e);
      toward(p, P.rP, 0, -0.85, -0.45, e);
      blade(p, -44, 34, e);
      toward(p, P.swF, 0.4, 1, -0.15, e);
      p[P.spX] -= 0.025 * arc * e;
      break;
    case 5:
      p[P.bodyX] += 0.035 * sway * e;
      p[P.pelvZ] += 0.035 * sway * e;
      p[P.spZ] -= 0.035 * sway * e;
      p[P.bodyY] -= 0.014 * arc * e;
      p[P.hdX] += 0.045 * arc * e;
      toward(p, P.lH, 0.09, -0.445, 0.115 + 0.015 * sway, e);
      break;
  }
}
