import { K_VOID } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// His guns' shots redrawn (ADR-253, `?oneGunFx=0|a|b`; the owner picks from films, '0' as he shipped): the
// muzzle and the slug in flight, in the fire field's code green (WokenFx calls these from _drawSlug and
// muzzle when the switch is on; hits, timings, cues and answers are untouched). The fox's and Bai Wuji's
// idiom: many small letters at the gun and along the bullet's way, nothing big or glowing, nothing on the
// background.
//   a  THE TRACER (bullet time): the muzzle a short hot cone of strokes down the barrel with two side vents
//      and a spent casing (one bright digit) kicked out to the side, bouncing to the floor; the slug a hot
//      head on a thin line of strokes written from the muzzle to it, fading behind, and every ~0.4 m a small
//      ring of stilled air left standing where it passed (a heavy shot: wider rings, a longer line)
//   b  THE SCRIPT (the code): the muzzle a fan of binary digits thrown forward with a ring of stilled air
//      round the barrel; the slug sheds the code it is written in: a curtain of tiny digits left falling
//      along its way, its head two hot cells (a heavy shot: a denser curtain, a second column)
// Cost: a about 10 - 25 blobs a frame a slug and ~40 at a muzzle; b about 8 - 20 letters a slug (glyph
// particles, each one cell) and ~30 at a muzzle (counted by the GUNFX scenario).

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
// (his fx.js colours: the code's green and the pale mint, HDR; never white: a white star is a cue)
const CODE = [0.55, 3.3, 1.05], CODE_END = [0.02, 0.5, 0.12];
const MINT = [1.9, 3.4, 2.2], MINT_END = [0.12, 0.9, 0.35];
const BITS = '01', DIG = '0123456789';

/** The switch, read live ('0' | 'a' | 'b'). */
export function gunFxNow() {
  const o = lookOf('oneGunFx', '0');
  return o === 'a' || o === 'b' ? o : '0';
}
export const GUNFX_OPTS = Object.freeze(['0', 'a', 'b']);

/** A: the muzzle. (x, y, z) the drawn muzzle, (dx, dz) the way the shot flies, k its size (0.45 a slug). */
function muzzleA(fx, x, y, z, dx, dz, k) {
  const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, sx = -uz, sz = ux;
  // the cone: three short hot strokes down the barrel, splaying
  for (let i = -1; i <= 1; i++) {
    const a = i * 0.22, cx = ux * Math.cos(a) - uz * Math.sin(a), cz = uz * Math.cos(a) + ux * Math.sin(a), len = (i ? 0.38 : 0.62) * (0.7 + k);
    fx._ink(x, y, z, x + cx * len, y + fx.lrand(-0.03, 0.03), z + cz * len, 0.07, i ? 1.0 : 1.25, 0, 0.35, 0, K_VOID);
  }
  // the side vents: two short strokes out to each side of the muzzle
  for (const s of [-1, 1]) fx._ink(x + ux * 0.06, y, z + uz * 0.06, x + ux * 0.12 + sx * s * 0.22, y + 0.03, z + uz * 0.12 + sz * s * 0.22, 0.06, 0.8, 0, 0.3, 0, K_VOID);
  // a breath of heat where it left
  const P = fx._toCamera(x, y, z);
  fx._blob(P.x, P.y, P.z, ux * 1.5, 0.2, uz * 1.5, 0.12, 0.16 * (0.6 + k), 0.3 * (0.6 + k), 0.9, 0, K_VOID, 3);
  // the spent casing: one bright digit kicked out to his right of the line and up, falling to the floor
  const side = fx.lr() < 0.5 ? 1 : -1, sp = fx.lrand(1.6, 2.4);
  fx._letter(x - ux * 0.08, y + 0.04, z - uz * 0.08, sx * side * sp + ux * -0.4, fx.lrand(1.6, 2.4), sz * side * sp + uz * -0.4, fx.lrand(0.5, 0.7), '0', MINT, CODE_END, 0.12, 0.6, -9);
}

/** A: a slug in flight (AscFx's shot record `s`: x y z dx dz speed path age heavy returned). */
function slugA(fx, s) {
  const heavy = !!s.heavy, ret = !!s.returned, dx = s.dx, dz = s.dz;
  const flown = ret ? s.age * s.speed * 1.25 : fin(s.path);
  const hx = s.x, hy = s.y, hz = s.z;
  // the line written back along its way from the slug (to the muzzle, at most `T` m), hot at the head
  const T = Math.min(heavy ? 5 : 3.2, Math.max(0.4, flown + 0.15));
  const sl = Number.isFinite(s.yTo) && !ret ? (s.yTo - s.y0) / s.yLen : 0; // (it falls along its way: the line too)
  fx._ink(hx - dx * T, hy - sl * T, hz - dz * T, hx - dx * 0.25, hy - sl * 0.25, hz - dz * 0.25, 0, 0.25, 0, heavy ? 0.85 : 0.7, 0, K_VOID);
  fx._ink(hx - dx * 0.3, hy - sl * 0.3, hz - dz * 0.3, hx, hy, hz, 0, ret ? 1.9 : heavy ? 1.6 : 1.4, 0, ret ? 2.0 : 1.7, 0, K_VOID);
  const P = fx._toCamera(hx, hy, hz);
  fx._dot(P.x, P.y, P.z, heavy ? 0.26 : 0.2, ret ? 1.0 : 0.85, K_VOID);
  // the rings of stilled air it leaves standing, one every `every` m of its way
  const every = heavy ? 0.5 : 0.4;
  s._ringA = fin(s._ringA, 0) + Math.min(2, fin(s.speed) * (ret ? 1.25 : 1) * (fx.game.fxDt ?? 0.016));
  if (s._ringA >= every) {
    s._ringA = 0;
    fx._wakeRing(hx - dx * 0.2, hy, hz - dz * 0.2, dx, dz, heavy ? 0.2 : 0.13, heavy ? 10 : 8, heavy ? 0.5 : 0.3, heavy ? 0.4 : 0.3, heavy ? 0.5 : 0.4);
  }
  if (heavy || ret) fx._keep(s, hx, hy, hz, [0.36, 1.0, 0.5], ret ? 1.4 : 1.0, 3.2, 0.1);
}

/** B: the muzzle: a fan of binary digits thrown down the line, a ring of stilled air round the barrel. */
function muzzleB(fx, x, y, z, dx, dz, k) {
  const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, base = Math.atan2(uz, ux);
  const n = Math.round(8 + 10 * k);
  for (let i = 0; i < n; i++) {
    const a = base + fx.lrand(-0.32, 0.32), sp = fx.lrand(4, 9);
    fx._letter(x, y + fx.lrand(-0.04, 0.04), z, Math.cos(a) * sp, fx.lrand(-0.4, 0.8), Math.sin(a) * sp, fx.lrand(0.16, 0.3), BITS, i % 3 ? CODE : MINT, CODE_END, 0.12, 5, -1);
  }
  fx._wakeRing(x + ux * 0.05, y, z + uz * 0.05, ux, uz, 0.12 + 0.12 * k, 10, 0.9, 0.18, 0.7);
  const P = fx._toCamera(x, y, z);
  fx._blob(P.x, P.y, P.z, 0, 0, 0, 0.08, 0.14, 0.22, 1.0, 0, K_VOID);
}

/** B: a slug in flight: a hot head, and the code it is written in left falling along its way. */
function slugB(fx, s) {
  const heavy = !!s.heavy, ret = !!s.returned, dx = s.dx, dz = s.dz, hx = s.x, hy = s.y, hz = s.z;
  fx._ink(hx - dx * 0.22, hy, hz - dz * 0.22, hx, hy, hz, 0, ret ? 1.9 : 1.55, 0, ret ? 2.0 : 1.75, 0, K_VOID);
  const P = fx._toCamera(hx, hy, hz);
  fx._dot(P.x, P.y, P.z, heavy ? 0.22 : 0.16, ret ? 1.0 : 0.8, K_VOID);
  // the curtain: digits left where it passed, falling (`rate` a metre of its way)
  const rate = heavy ? 9 : 5, step = Math.min(2, fin(s.speed) * (ret ? 1.25 : 1) * (fx.game.fxDt ?? 0.016));
  s._codeB = fin(s._codeB, 0) + step * rate;
  const cols = heavy || ret ? 2 : 1, sx = -dz, sz = dx;
  while (s._codeB >= 1) {
    s._codeB -= 1;
    const back = fx.lrand(0.05, step + 0.05);
    for (let c = 0; c < cols; c++) {
      const off = cols > 1 ? (c ? 0.07 : -0.07) : 0;
      fx._letter(hx - dx * back + sx * off, hy + fx.lrand(-0.03, 0.05), hz - dz * back + sz * off, fx.lrand(-0.1, 0.1), fx.lrand(-0.9, -0.4), fx.lrand(-0.1, 0.1), fx.lrand(0.45, 0.8), fx.lr() < 0.6 ? BITS : DIG, fx.lr() < 0.25 ? MINT : CODE, CODE_END, 0.11, 1.2, -1.5);
    }
  }
  if (heavy || ret) fx._keep(s, hx, hy, hz, [0.36, 1.0, 0.5], ret ? 1.3 : 0.9, 3, 0.1);
}

/** WokenFx's hooks: true when the switch drew it. */
export function drawGunMuzzle(fx, x, y, z, dx, dz, k) {
  const o = gunFxNow();
  if (o === '0' || !fx.fire || !Number.isFinite(x + y + z + dx + dz + k)) return false;
  (o === 'a' ? muzzleA : muzzleB)(fx, x, y, z, dx, dz, k);
  fx.game.lights?.add?.({ x, y, z, color: [0.72, 1.0, 0.8], intensity: 1.6 * (0.5 + k), radius: 3.5, life: 0.08, fade: 0.07 });
  return true;
}
export function drawGunSlug(fx, s) {
  const o = gunFxNow();
  if (o === '0' || !Number.isFinite(s.x + s.y + s.z + s.dx + s.dz)) return false;
  (o === 'a' ? slugA : slugB)(fx, s);
  return true;
}
