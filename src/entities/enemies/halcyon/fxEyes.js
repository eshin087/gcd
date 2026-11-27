import { K_FIRE, K_SMOKE, K_VOID, K_STEEL } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// HIS EYES' BEAMS, REDRAWN (ADR-254, `?halEyes=0|a|b`; '0', the default until the owner picks, is Tian
// Lei's ki beam in his crimson, as it shipped). The boss motion audit's effects pass, drawn to the bar the
// owner set (the Fox's Howl, Bai Wuji's spells: a hard core, a living body, the world answering at the
// foot, a held charge before). Pure draw helpers on his HalFx (fx.js: DuelFx's _blob / _ink / _dot /
// _frame / _rec / _spawn / _toCamera / _axes / lr): heat in the fire field (small letters, many small
// cool blobs, never one big hot one), glyph particles of one letter cell for what flies on its own (sparks,
// ash, the shimmer). Jitter from fx.lr() (the looks' stream), never Math.random. Nothing of a beam's
// gameplay moves (glare.js: where it is lit, what it hits, when): only how it is drawn.
//
//   a  HEAT VISION: two white-hot threads, one out of each eye, meeting a short way out into one hard
//      line; a thin crimson sheath round it that flickers; the air over it shimmering (tiny faint letters
//      rising off the line); where it lands, the floor goes molten (a low glow of fire, a white heart),
//      sparks spit back along it, smoke curls up. The charge: red motes drawn into his eyes.
//   b  THE CRIMSON PULSE: a thicker crimson body with a hard core, rings of light racing down it from his
//      eyes to its end (it reads as pressure, a beat); where it lands a scorch ring opens and opens again
//      on the beat, ash thrown up. The charge: a ring of red tightening round his eyes.
//
// COST (measured in the city.mjs `eyes` scenario at the game camera): a ~ 2 x the core's cells + 60
// sheath + 30 at the foot a frame; b ~ 2 x the core's cells + 8 rings x 10 + 40 at the foot a frame
// (today's: ~3 core lines + ~100 stations). Every one is a held blob (one copy a frame).

/** The option (read live: the Lab flips it from the next frame). */
export const eyesLook = () => lookOf('halEyes', '0');

const TAU = Math.PI * 2;
const SPARK = [3.4, 1.2, 0.5], SPARK_END = [0.6, 0.05, 0.02];
const SHIM = [1.6, 0.35, 0.25], SHIM_END = [0.3, 0.03, 0.02];
const ASH = [0.5, 0.42, 0.4], ASH_END = [0.15, 0.12, 0.1];
const L_CRIMSON = [1.0, 0.16, 0.08];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Per-fx state (no allocation a frame). */
const ST = new WeakMap();
function st(fx) {
  let s = ST.get(fx);
  if (!s) ST.set(fx, (s = { t: 0, shimAcc: 0, sparkAcc: 0, smokeAcc: 0, ashAcc: 0, moteAcc: 0, rx: 1, rz: 0 }));
  return s;
}

/** His eyes' right vector (HalFx.eyes passes it every frame they show). */
export function eyesAxis(fx, rx, rz) {
  const s = st(fx);
  if (Number.isFinite(rx + rz)) {
    s.rx = rx;
    s.rz = rz;
  }
}

/**
 * The beam lit this frame, (ax, ay, az) his eyes → (bx, by, bz) its end; `w` its width (0.7 the stare,
 * 1.0 Scorched Avenue), `k` 0..1 its strength (1 the white peak, then held, then the fade), dt the frame.
 */
export function eyeBeam(fx, look, ax, ay, az, bx, by, bz, w, k, dt) {
  const s = st(fx);
  s.t += dt;
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (!(L > 0.05)) return;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const life = fx._frame();
  if (look === 'b') return pulse(fx, s, ax, ay, az, bx, by, bz, ux, uy, uz, L, w, k, dt, life);
  // ---- a: heat vision
  // the two threads: one out of each eye, meeting `meet` m out
  const meet = Math.min(1.1, L * 0.3), mx = ax + ux * meet, my = ay + uy * meet, mz = az + uz * meet;
  for (const side of [-1, 1]) {
    const ex = ax + s.rx * 0.05 * side, ez = az + s.rz * 0.05 * side;
    fx._ink(ex, ay, ez, mx, my, mz, 0, 1.0 + 0.2 * k, 0, 1.15 + 0.15 * k, 0, K_STEEL);
  }
  // one hard line on from there; a white-hot core prints white digits (heat over 1.2)
  fx._ink(mx, my, mz, bx, by, bz, 0, 1.12 + 0.25 * k, 0, 1.05 + 0.2 * k, 1, K_STEEL);
  // the crimson sheath: small cool blobs along it, flickering
  if (life > 0) {
    const n = Math.min(60, Math.ceil(L / 0.3));
    for (let i = 0; i <= n; i++) {
      const t = i / n, j = fx.lr();
      const r = (0.06 + 0.05 * j) * w;
      fx._blob(ax + dx * t + (fx.lr() - 0.5) * r, ay + dy * t + (fx.lr() - 0.5) * r, az + dz * t + (fx.lr() - 0.5) * r, 0, 0, 0, life, 0.22 * w, 0.22 * w, (0.32 + 0.25 * j) * (0.6 + 0.4 * k), 0, K_VOID);
    }
  }
  // the shimmer: tiny faint letters rising off the line (one letter cell, many, faint)
  const A = fx.alpha;
  s.shimAcc += dt * 70 * k;
  while (s.shimAcc >= 1) {
    s.shimAcc -= 1;
    const t = fx.lr();
    const o = fx._rec(ax + dx * t, ay + dy * t + 0.05, az + dz * t, fx.lrand(0.35, 0.6), 0.09, 0.05, "'.`", SHIM, SHIM_END);
    o.vy = fx.lrand(0.6, 1.4);
    o.vx = fx.lrand(-0.15, 0.15);
    o.vz = fx.lrand(-0.15, 0.15);
    o.alpha = 0.55;
    fx._spawn(A, o);
  }
  foot(fx, s, bx, by, bz, ux, uz, k, dt, life, 'a');
}

/** b: the crimson pulse (see the header). */
function pulse(fx, s, ax, ay, az, bx, by, bz, ux, uy, uz, L, w, k, dt, life) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  fx._ink(ax, ay, az, bx, by, bz, 0, 1.15 + 0.25 * k, 0, 1.05 + 0.2 * k, 0, K_STEEL);
  if (!(life > 0)) return;
  // the body: two soft lines of crimson either side of the core (on the camera's plane)
  const Ax = fx._axes();
  // (the beam's own sideways in the picture: across its line as drawn, in the camera's plane)
  const br = ux * Ax.rx + uy * Ax.ry + uz * Ax.rz, bu = ux * Ax.ux + uy * Ax.uy + uz * Ax.uz;
  const px = -bu * Ax.rx + br * Ax.ux, py = -bu * Ax.ry + br * Ax.uy, pz = -bu * Ax.rz + br * Ax.uz;
  const pl = Math.hypot(px, py, pz) || 1, sx = (px / pl) * 0.16 * w, sy = (py / pl) * 0.16 * w, sz = (pz / pl) * 0.16 * w;
  const n = Math.min(70, Math.ceil(L / 0.32));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + dx * t, y = ay + dy * t, z = az + dz * t, h = (0.38 + 0.18 * fx.lr()) * (0.6 + 0.4 * k);
    fx._blob(x + sx, y + sy, z + sz, 0, 0, 0, life, 0.26 * w, 0.26 * w, h, 0, K_VOID);
    fx._blob(x - sx, y - sy, z - sz, 0, 0, 0, life, 0.26 * w, 0.26 * w, h, 0, K_VOID);
  }
  // the rings racing down it: 14 m/s, 2.2 m apart, each a small circle of crimson round the line
  const sp = 14, gap = 2.2, ph = (s.t * sp) % gap;
  for (let d0 = ph; d0 < L; d0 += gap) {
    const t = d0 / L, cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t, R = (0.22 + 0.1 * Math.min(1, d0 / 4)) * w;
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU, ca = Math.cos(a) * R, sa = Math.sin(a) * R;
      fx._blob(cx + Ax.rx * ca + Ax.ux * sa, cy + Ax.ry * ca + Ax.uy * sa, cz + Ax.rz * ca + Ax.uz * sa, 0, 0, 0, life, 0.14, 0.14, 0.75 * k + 0.2, 0, K_VOID);
    }
  }
  foot(fx, s, bx, by, bz, ux, uz, k, dt, life, 'b');
}

/** Where the beam lands: a: the floor molten, sparks spat back, smoke; b: a scorch ring on the beat, ash. */
function foot(fx, s, x, y, z, ux, uz, k, dt, life, look) {
  const fy = Math.max(0.12, Math.min(y, 0.6));
  if (life > 0) {
    if (look === 'a') {
      // the molten spot: a low glow of fire, a white heart
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996, r = 0.55 * Math.sqrt((i + 0.5) / 14);
        fx._blob(x + Math.cos(a) * r, fy, z + Math.sin(a) * r, 0, 0, 0, life, 0.34, 0.34, 0.55 + 0.25 * fx.lr(), 0, K_FIRE);
      }
      fx._blob(x, fy + 0.05, z, 0, 0, 0, life, 0.22, 0.22, 1.25 * k, 0, K_STEEL);
    } else {
      // the scorch ring opening on the beat (0.36 s), and opening again
      const u = (s.t % 0.36) / 0.36, R = 0.2 + 1.1 * u;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU + u;
        fx._blob(x + Math.cos(a) * R, 0.14, z + Math.sin(a) * R, 0, 0, 0, life, 0.24, 0.24, (0.8 - 0.6 * u) * k, 0, K_VOID);
      }
      for (let i = 0; i < 8; i++) {
        const a = i * 2.39996, r = 0.35 * Math.sqrt((i + 0.5) / 8);
        fx._blob(x + Math.cos(a) * r, fy, z + Math.sin(a) * r, 0, 0, 0, life, 0.3, 0.3, 0.7, 0, K_VOID);
      }
      fx._blob(x, fy + 0.05, z, 0, 0, 0, life, 0.2, 0.2, 1.25 * k, 0, K_STEEL);
    }
  }
  const A = fx.alpha;
  if (look === 'a') {
    // sparks spat back along the beam and up
    s.sparkAcc += dt * 55 * k;
    while (s.sparkAcc >= 1) {
      s.sparkAcc -= 1;
      const a = Math.atan2(-uz, -ux) + fx.lrand(-1.1, 1.1), sp = fx.lrand(3, 8);
      const o = fx._rec(x, fy + 0.1, z, fx.lrand(0.22, 0.45), 0.1, 0.03, "*+'", SPARK, SPARK_END);
      o.vx = Math.cos(a) * sp;
      o.vz = Math.sin(a) * sp;
      o.vy = fx.lrand(2, 5.5);
      o.gravity = -14;
      o.drag = 1.2;
      fx._spawn(fx.add, o);
    }
    s.smokeAcc += dt * 14 * k;
    while (s.smokeAcc >= 1) {
      s.smokeAcc -= 1;
      fx._blob(x + fx.lrand(-0.3, 0.3), fy + 0.2, z + fx.lrand(-0.3, 0.3), fx.lrand(-0.2, 0.2), fx.lrand(0.8, 1.5), fx.lrand(-0.2, 0.2), fx.lrand(0.6, 1.0), 0.4, 0.9, 0.45, 0, K_SMOKE, 0.6);
    }
  } else {
    s.ashAcc += dt * 30 * k;
    while (s.ashAcc >= 1) {
      s.ashAcc -= 1;
      const a = fx.lr() * TAU, sp = fx.lrand(0.6, 2.2);
      const o = fx._rec(x + Math.cos(a) * 0.3, fy + 0.1, z + Math.sin(a) * 0.3, fx.lrand(0.5, 0.9), 0.08, 0.05, '.,`', ASH, ASH_END);
      o.vx = Math.cos(a) * sp;
      o.vz = Math.sin(a) * sp;
      o.vy = fx.lrand(1.2, 2.6);
      o.gravity = -3;
      o.drag = 1;
      fx._spawn(A, o);
    }
  }
  fx._keep?.('eyeFoot', x, fy + 0.3, z, L_CRIMSON, 1.2 + 1.6 * k, 4, 0.25);
}

/**
 * The charge at his eyes through a beam's windup (k 0..1, his eyesK), (x, y, z) between them. a: red
 * motes drawn in from about a metre round his head; b: a ring of red tightening round his eyes.
 */
export function eyeCharge(fx, look, x, y, z, k, dt) {
  if (!(k > 0.05) || !(dt > 0)) return;
  const s = st(fx);
  if (look === 'a') {
    s.moteAcc += dt * 40 * k;
    while (s.moteAcc >= 1) {
      s.moteAcc -= 1;
      // (a mote from a point on a sphere round his head, flying in to arrive as it dies)
      const a = fx.lr() * TAU, e = fx.lrand(-0.6, 0.9), r = fx.lrand(0.7, 1.1), life = fx.lrand(0.22, 0.34);
      const ox = Math.cos(a) * Math.cos(e) * r, oy = Math.sin(e) * r, oz = Math.sin(a) * Math.cos(e) * r;
      fx._blob(x + ox, y + oy, z + oz, -ox / life, -oy / life, -oz / life, life, 0.12, 0.05, 0.6, 0.9, K_VOID);
    }
  } else if (look === 'b') {
    const life = fx._frame();
    if (!(life > 0)) return;
    const Ax = fx._axes(), R = 0.65 - 0.5 * k;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + s.t * 3, ca = Math.cos(a) * R, sa = Math.sin(a) * R;
      fx._blob(x + Ax.rx * ca + Ax.ux * sa, y + Ax.ry * ca + Ax.uy * sa, z + Ax.rz * ca + Ax.uz * sa, 0, 0, 0, life, 0.12, 0.12, 0.35 + 0.55 * k, 0, K_VOID);
    }
    s.t += dt;
  }
}

/** The splash where a beam ends (glare.js calls it after `beam`): drawn inside eyeBeam's foot; nothing
 *  more under a or b (the end the old splash drew would sit on top of the new foot). */
export const eyeSplash = () => {};
void clamp01;
