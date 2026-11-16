// FX of the wyrm's whole-body melee (attacks.js KINDS: fireSnap, emberRake, wingSlam, tailSlam,
// wingSweep). Plain functions over the wyrm's DragonFx instance (`fx`), the pattern bulletFx.js uses:
// they reuse its spawn records (_blob into the fire field, _rec / _col for glyph particles, _light),
// so nothing here allocates per frame. Fire is heat in the fire field (docs/STYLE.md "The fire
// field"); dust, sparks and embers are small glyph particles. Only atlas glyphs.
//
// Cost (fire-field blobs at the peak): a fire snap ~230 / s for 0.5 s (~130 alive), a slam ~40 at
// once, a tail slam ~50 at once. The ground they set burning is the hazards' strip (hazards.js).

import { SCALE } from './tuning.js';

const S = SCALE;
const EMBER_STAR = ".'*•";
const DUST = ",.`:'";
const HOT = [4.6, 3.5, 1.5];
const DARK = [0.8, 0.08, 0.012];
const DUST_COL = [0.2, 0.19, 0.17];
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * One frame of the fire snap's gout: a short, fat cone of the breath's fire from the open jaws along `yaw`,
 * pitched down by `pitch` (rad), reaching about `range` m. `st` keeps the accumulators (a string
 * hit's scratch); `u` 0..1 = progress through the gout (it thins at the end); `first` = the frame
 * it bursts out (a puff at the maw).
 */
export function snapFire(fx, st, dt, mouth, yaw, pitch, range, u, first) {
  if (!mouth || !Number.isFinite(mouth.x + mouth.y + mouth.z + yaw)) return;
  const sa = Math.sin(yaw), ca = Math.cos(yaw);
  const fade = u > 0.75 ? Math.max(0.2, 1 - (u - 0.75) / 0.25) : 1;
  // speed so that drag 1.5 over the life carries a blob to ~range (v / drag x (1 - e^-drag life))
  const vMax = (range * 1.5) / 0.6;
  if (first) {
    // the burst: fire balls out of the maw all at once, wider than the stream that follows
    for (let i = 0; i < 14; i++) {
      const y = yaw + rand(-0.35, 0.35), pj = pitch + rand(-0.12, 0.1), cp = Math.cos(pj), sp = rand(0.25, 0.6) * vMax;
      fx._blob(mouth.x, mouth.y, mouth.z, Math.sin(y) * cp * sp, -Math.sin(pj) * sp + rand(0, 2), Math.cos(y) * cp * sp, rand(0.35, 0.55), rand(0.7, 1.0) * S, rand(1.6, 2.3) * S, 0.45, 0, 2.2, 2.5);
    }
    fx._light({ x: mouth.x + sa * 3, y: 1.4, z: mouth.z + ca * 3, color: [1, 0.5, 0.16], intensity: 6, radius: 9 * S, life: 0.55, fadeIn: 0.05, fade: 0.3, flicker: 0.5 });
  }
  // the gout itself: the breath's body (fx.breathBody: the same fire as every breath of the wyrm, in
  // the look in use), a short fat cone of about a third of the breath's rate
  fx.breathBody?.(dt, mouth, yaw, pitch, range, 0.22, 0.35 * fade);
  // sparks thrown off it
  st.sparkAcc = (st.sparkAcc ?? 0) + dt * 40;
  let n = Math.min(3, Math.floor(st.sparkAcc));
  st.sparkAcc -= n;
  while (n-- > 0) {
    const dd = rand(1, range * 0.8), lat = rand(-6, 6);
    const o = fx._rec(mouth.x + sa * dd, Math.max(0.3, mouth.y - Math.sin(pitch) * dd), mouth.z + ca * dd, rand(0.4, 0.8), rand(0.25, 0.4), 0.06, EMBER_STAR);
    o.vx = sa * rand(4, 10) + ca * lat;
    o.vy = rand(1.5, 5.5);
    o.vz = ca * rand(4, 10) - sa * lat;
    o.drag = 1.6;
    o.gravity = -9;
    o.flicker = 0.4;
    fx._col(HOT, 1, DARK, 1);
    fx._spawn(fx.add, o);
  }
}

/** The heat left in the jaws as the gout dies: a few licks of flame and smoke at the maw. */
export function snapSmoke(fx, st, dt, mouth, fwd) {
  if (!mouth || !Number.isFinite(mouth.x + mouth.y + mouth.z)) return;
  st.smokeAcc = (st.smokeAcc ?? 0) + dt * 14;
  while (st.smokeAcc >= 1) {
    st.smokeAcc -= 1;
    fx._blob(mouth.x + rand(-0.2, 0.2), mouth.y + rand(0, 0.3), mouth.z + rand(-0.2, 0.2), (fwd?.x ?? 0) * 1.5, rand(1.2, 2.4), (fwd?.z ?? 0) * 1.5, rand(0.6, 1.0), 0.6 * S, 1.6 * S, 0.3, 0, 1, 0, 1);
  }
}

/** A raking claw's sparks: torn off the toe where it scrapes low (from phase 2: it burns). */
export function rakeSparks(fx, toe, dx, dz, hot) {
  if (!toe || !Number.isFinite(toe.x + toe.y + toe.z) || toe.y > 1.2 * S) return;
  const l = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < (hot ? 3 : 1); i++) {
    const o = fx._rec(toe.x, Math.max(0.2, toe.y), toe.z, rand(0.3, 0.6), rand(0.22, 0.32), 0.05, EMBER_STAR);
    o.vx = (dx / l) * rand(4, 9) + rand(-2, 2);
    o.vy = rand(1, 4.5);
    o.vz = (dz / l) * rand(4, 9) + rand(-2, 2);
    o.drag = 1.4;
    o.gravity = -10;
    o.flicker = 0.4;
    fx._col(HOT, 1, DARK, 1);
    fx._spawn(fx.add, o);
  }
  if (hot) fx._blob(toe.x, 0.4, toe.z, (dx / l) * 2, rand(1, 2.5), (dz / l) * 2, rand(0.3, 0.5), 0.8, 1.4, 0.4, 0, 1.8, 1.5);
}

/** Dust thrown along the ground away from (x, z) in a fan (a gust off the wings). */
function dustFan(fx, x, z, dirX, dirZ, n, speed) {
  const base = Math.atan2(dirX, dirZ);
  for (let i = 0; i < n; i++) {
    const a = base + rand(-1.1, 1.1), sp = rand(0.5, 1) * speed;
    fx._spawn(fx.alpha, {
      x: x + rand(-1, 1), y: rand(0.15, 0.6), z: z + rand(-1, 1),
      vx: Math.sin(a) * sp, vy: rand(0.3, 1.8), vz: Math.cos(a) * sp,
      life: rand(0.7, 1.2), size: rand(0.45, 0.75) * S, sizeEnd: rand(1.1, 1.7) * S, glyph: DUST,
      color: DUST_COL, alpha: 0.75, alphaEnd: 0, drag: 2.6, gravity: -1.2, spin: rand(-2, 2),
    });
  }
}

/**
 * Both wings come down in front: the air they push out of the way throws a fan of dust ahead and
 * to both sides of the slam point (x, z) (fwd = the wyrm's facing); with `fire` (phase 2+) the
 * draught fans the heat of its body out along the ground as a low, licking wave.
 */
export function wingSlamBurst(fx, x, z, r, fwdX, fwdZ, fire) {
  if (!Number.isFinite(x + z + r)) return;
  fx.dustRing(x, z, r * 0.5, 30, 1.1);
  dustFan(fx, x, z, fwdX, fwdZ, 26, 14 * S);
  if (!fire) return;
  const a0 = Math.atan2(fwdX, fwdZ);
  for (let i = 0; i < 22; i++) {
    const a = a0 + rand(-1.3, 1.3), sp = rand(8, 15);
    fx._blob(x + Math.sin(a) * r * 0.3, rand(0.4, 0.9), z + Math.cos(a) * r * 0.3, Math.sin(a) * sp, rand(0.5, 2), Math.cos(a) * sp, rand(0.35, 0.55), rand(0.8, 1.1) * S, rand(1.4, 2.0) * S, 0.4, 0, 2.4, 2);
  }
  fx._light({ x, y: 1, z, color: [1, 0.55, 0.2], intensity: 5, radius: 10 * S, life: 0.35, fade: 0.3, flicker: 0.3 });
}

/**
 * The tail comes down along the ground: dust bursts up along its length (`pts` = the chain's points,
 * from `i0`), the ground cracks under its tip; with `fire` it splits the crust and flames spit up
 * along the line.
 */
export function tailSlamLine(fx, pts, i0, n, fire) {
  for (let i = i0; i <= n; i += 2) {
    const p = pts[i];
    if (!p || !Number.isFinite(p.x + p.z)) continue;
    fx.dustRing(p.x, p.z, 0.3 * S, 8, 0.7);
    if (fire) fx._blob(p.x, 0.5, p.z, rand(-1, 1), rand(2.5, 5), rand(-1, 1), rand(0.35, 0.6), rand(0.9, 1.2) * S, 0.5 * S, 0.42, 0, 2, 1.5);
  }
  const t = pts[n];
  if (t && Number.isFinite(t.x + t.z)) {
    fx.dustRing(t.x, t.z, 0.6 * S, 20, 1.0);
    if (fire) fx.slamBurst?.(t.x, t.z, 1.2 * S);
  }
}
