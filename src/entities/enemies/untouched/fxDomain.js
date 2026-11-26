import * as THREE from 'three';
import { K_FIRE, K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';

// Bai Wuji's domain effects (the FX AGENT's file): the hand sign, the closing sphere, the catch, the
// void breaking. WjFx (fx.js) imports this module as a namespace and calls its functions through `?.`
// (each takes the WjFx first: fn(F, ...args)); `update(F, S, fdt)` steps what lives on (the wall's seal,
// the break). The void's AIR (its stars) is the SET's, not this file's (world/veiledCrossing.js ambience).
// All of it is heat in the fire field (the void slot VIOLET while it draws; smoke for the dark; the fire
// slot's red for the cue; steel for edges and noise) and glyph particles of one letter cell.
//
//   domainSign(F, d, k)        every frame of the sign's beat: at his raised fingers a point of dark (a few
//                              near-black letters) inside a pale rim that widens with k, violet round it,
//                              motes drawn into it. ~25 blobs.
//   domainWall(F, x, z, r, k)  every frame of the close: the sphere's wall, a ring round him at the radius
//                              DRAWN so it reaches the hero exactly at k = 1 (the impact the engine judges):
//                              rw = dh + (rim - dh) (1 - k)^1.25, rim = `r` at its first call (domain.js
//                              passes 41), dh = the hero's distance. A bright edge (steel strokes on the
//                              floor, violet heat standing on it, rising), a dark band of smoke outside
//                              it (the swallowed side); over its last 7 m to the hero the stretch of it
//                              facing him turns RED (the cue) and a thin red ring on the floor marks
//                              where it will meet him. Drawn only where it is on screen. After the last
//                              call at k = 1 it seals: the ring runs in on him and goes out (0.35 s).
//   domainCaught(F, hero, k)   every frame of the hold: letters of white noise flickering over him, a
//                              static of strokes falling through him, violet closing round his feet.
//   domainBreak(F, x, z)       once: cracks run out from the point like glass (0.55 s), then the void falls
//                              away in shards of letters (two waves, ~260 glyphs).

const TAU = Math.PI * 2;
const WALL = Object.freeze({ step: 0.5, red: 7, seal: 0.35, ys: [0.9, 1.9, 2.9], heat: [0.34, 0.26, 0.16], edge: 0.85, smoke: [0.7, 1.6] });
const DARK = [0.012, 0.0, 0.02];
const PALE = [1.5, 1.55, 1.85], PALE_END = [0.25, 0.25, 0.36];
const VIO = [1.4, 0.5, 2.4], VIO_END = [0.2, 0.05, 0.45];
const SHARD = [1.5, 1.4, 2.0], SHARD_END = [0.2, 0.1, 0.4];
const NOISE = [1.6, 1.6, 1.7], NOISE_END = [0.4, 0.4, 0.45];
const L_VIOLET = [0.74, 0.4, 1.0], L_CRIMSON = [1.0, 0.14, 0.12], L_WHITE = [0.9, 0.88, 1.0];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  return (a < 0 ? a + TAU : a) - Math.PI;
};
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const RAYS = 10, KINKS = 4;

export function createState() {
  return {
    sign: { seen: -9, acc: 0 },
    wall: { seen: -9, start: 0, r0: 40, x: 0, z: 0, rw: 0, k: 0, seal: false, sealT: 0 },
    caught: { seen: -9 },
    brk: { alive: false, t: 0, x: 0, y: 1.6, z: 0, wave: 0, rays: new Float32Array(RAYS * (KINKS + 1) * 2) },
    v: new THREE.Vector3(),
  };
}

export function resetState(F, S) {
  if (!S) return;
  S.sign.seen = -9;
  S.wall.seen = -9;
  S.wall.seal = false;
  S.caught.seen = -9;
  S.brk.alive = false;
}

// ======================================================================= THE SIGN
export function domainSign(F, d, k) {
  const S = F._domainState;
  if (!S || !F.fire || !d) return;
  k = clamp01(fin(k, 0));
  const now = F._now(), G = S.sign;
  if (now - G.seen > 0.3) {
    G.acc = 0;
    F._say('wjSign', d.position?.x, d.position?.z);
  }
  G.seen = now;
  F._violet(0.4);
  const h = d.handPoint ? d.handPoint('L', S.v) : null; // (round 2: the body's SIGN raises the LEFT hand; the right stays pocketed)
  if (!h || !Number.isFinite(h.x + h.y + h.z)) return;
  const P = F._toCamera(h.x, h.y + 0.16, h.z), lf = F._frame(), A = F._axes();
  if (lf > 0) {
    // the point of dark: near-black letters of one cell (it drinks the light)
    for (let i = 0; i < 3; i++) {
      const o = F._rec(P.x + A.rx * (i - 1) * 0.05, P.y + A.ry * (i - 1) * 0.05, P.z + A.rz * (i - 1) * 0.05, lf * 1.2, 0.2 + 0.1 * k, 0.2 + 0.1 * k, '@#8', DARK, DARK);
      o.alphaEnd = 1;
      F._spawn(F.alpha, o);
    }
    // its pale rim, widening
    const rr = 0.2 + 0.3 * k, n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + now * 2, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      F._blob(P.x + A.rx * ca + A.ux * sa, P.y + A.ry * ca + A.uy * sa, P.z + A.rz * ca + A.uz * sa, 0, 0, 0, lf, 0.14, 0.14, 0.6 + 0.5 * k, 0.6 + 0.5 * k, K_STEEL);
    }
    // violet round it
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - now * 3, ca = Math.cos(a) * (rr + 0.2), sa = Math.sin(a) * (rr + 0.2);
      F._blob(P.x + A.rx * ca + A.ux * sa, P.y + A.ry * ca + A.uy * sa, P.z + A.rz * ca + A.uz * sa, 0, 0, 0, lf, 0.3, 0.3, 0.36 * k + 0.1, 0.36 * k + 0.1, K_VOID);
    }
    // the realm's first breath: a faint violet ring on the floor round him, widening
    const p = d.position;
    if (p && k > 0.05) F._ring(p.x, GROUND_Y, p.z, 1.2 + 2.6 * k, 40, 0.34, 0.14 * GROUND_GAIN * k, K_VOID, 6, now * 1.5);
  }
  // motes drawn into it from all round
  const fdt = Math.max(0, Math.min(0.1, fin(F.game.fxDt, 0.016)));
  G.acc += fdt * (30 + 50 * k);
  while (G.acc >= 1) {
    G.acc -= 1;
    const a = F.lr() * TAU, e = F.lrand(-0.8, 0.8), r = F.lrand(1.2, 2.6), T = F.lrand(0.3, 0.5);
    const sx = h.x + Math.cos(a) * r, sy = Math.max(0.2, h.y + e * r), sz = h.z + Math.sin(a) * r;
    const o = F._rec(sx, sy, sz, T, 0.13, 0.04, ".'-", F.lr() < 0.5 ? VIO : PALE, VIO_END);
    o.vx = (h.x - sx) / T;
    o.vy = (h.y - sy) / T;
    o.vz = (h.z - sz) / T;
    o.alpha = 0.25;
    o.alphaEnd = 1;
    F._spawn(F.add, o);
  }
  F._keep('wjSign', h.x, h.y, h.z, L_VIOLET, 0.6 + 1.2 * k, 3, 0.1);
}

// ======================================================================= THE WALL
/** The hero's distance from (x, z), and his angle round it. */
function heroAt(F, x, z, out) {
  const p = F.game.player?.position;
  if (!p || !Number.isFinite(p.x + p.z)) {
    out.d = 0;
    out.a = Math.PI / 2;
    return out;
  }
  out.d = Math.hypot(p.x - x, p.z - z);
  out.a = Math.atan2(p.z - z, p.x - x);
  return out;
}
const _h = { d: 0, a: 0 };

/** The wall at radius rw round (x, z) this frame; red over the stretch facing the hero by kr. */
function wallDraw(F, x, z, rw, kr, ha, fade = 1) {
  const lf = F._frame();
  if (!(lf > 0) || !(rw > 0.3)) return 0;
  // (headless, no camera: every point is 'on screen'; nothing is seen, so the wall is drawn coarse there)
  const n = F._screen(x, 1.2, z).ok ? Math.max(24, Math.min(480, Math.round((TAU * rw) / WALL.step))) : 48;
  let prevOk = false, px = 0, pz = 0, drawn = 0;
  const M = 90, eh = WALL.edge * fade * GROUND_GAIN * 0.5;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a), bx = x + ca * rw, bz = z + sa * rw;
    const S = F._screen(bx, 1.2, bz);
    const ok = !S.ok || (S.px > -M && S.py > -M && S.px < S.W + M && S.py < S.H + M);
    if (ok) {
      // the bright thin edge, on the floor
      if (prevOk) F._ink(px, GROUND_Y + 0.1, pz, bx, GROUND_Y + 0.1, bz, 0, eh, 0, eh, 1);
      // the wall standing on it, fading as it rises
      for (let q = 0; q < WALL.ys.length; q++) {
        const h = WALL.heat[q] * fade * (0.8 + 0.4 * hash(i * 1.3 + q));
        F._blob(bx, WALL.ys[q], bz, 0, 0, 0, lf, 0.55, 0.55, h, h, K_VOID);
      }
      // the dark outside it (the swallowed side): smoke's dark backing and grey letters
      if (i % 2 === 0) for (const o of WALL.smoke) F._blob(x + ca * (rw + o), 0.8, z + sa * (rw + o), 0, 0, 0, lf, 1.2, 1.2, 0.6 * fade, 0.6 * fade, K_SMOKE);
      // the cue: red on the stretch facing him, as it comes
      if (kr > 0.02) {
        const da = Math.abs(wrap(a - ha));
        if (da < 0.7) {
          const hr = (0.4 + 0.3 * kr) * kr * (1 - (da / 0.7) * (da / 0.7));
          F._blob(bx, 0.75, bz, 0, 0, 0, lf, 0.5, 0.5, hr, hr, K_FIRE);
          F._blob(bx, 1.35, bz, 0, 0, 0, lf, 0.46, 0.46, hr * 0.85, hr * 0.85, K_FIRE);
          F._blob(bx, 2.0, bz, 0, 0, 0, lf, 0.4, 0.4, hr * 0.6, hr * 0.6, K_FIRE);
        }
      }
      drawn++;
    }
    prevOk = ok;
    px = bx;
    pz = bz;
  }
  return drawn;
}

export function domainWall(F, x, z, r, k) {
  const S = F._domainState;
  if (!S || !F.fire || !Number.isFinite(x + z)) return;
  k = clamp01(fin(k, 0));
  const W = S.wall, now = F._now();
  if (now - W.seen > 0.3) {
    W.r0 = Math.max(8, Math.min(60, fin(r, 40)));
    W.start = now;
    W.seal = false;
    F._say('wjDomainClose', x, z, 2);
  }
  W.seen = now;
  W.x = x;
  W.z = z;
  W.k = k;
  F._violet(0.5);
  const H = heroAt(F, x, z, _h), dh = Math.min(H.d, W.r0 - 0.5);
  const rw = dh + (W.r0 - dh) * Math.pow(1 - k, 1.25);
  W.rw = rw;
  const kr = clamp01(1 - (rw - dh) / WALL.red);
  if (kr > 0.02) F._crimson(0.4); // (round 2: the fire slot is crimson only while a red thing of his lives)
  wallDraw(F, x, z, rw, kr, H.a);
  // where it will meet him: a thin red ring on the floor at his distance (gone once it is there)
  const lf = F._frame();
  if (kr > 0.05 && rw > dh + 0.25 && lf > 0 && dh > 0.6) {
    const hr = 0.48 * GROUND_GAIN * kr, n = 14;
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const a0 = H.a - 0.55 + (1.1 * i) / n, a1 = H.a - 0.55 + (1.1 * (i + 1)) / n;
      F._ink(x + Math.cos(a0) * dh, GROUND_Y, z + Math.sin(a0) * dh, x + Math.cos(a1) * dh, GROUND_Y, z + Math.sin(a1) * dh, 0, hr, 0, hr, 0, K_FIRE);
    }
  }
  const lx = x + Math.cos(H.a) * rw, lz = z + Math.sin(H.a) * rw;
  F._keep('wjWall', lx, 1.6, lz, L_VIOLET, 3.2, 9, 0.1);
  if (kr > 0.1) F._keep('wjWallRed', lx, 1.0, lz, L_CRIMSON, 2.2 * kr, 5, 0.1);
}

// ======================================================================= THE CATCH
export function domainCaught(F, hero, k) {
  const S = F._domainState, p = hero?.position;
  if (!S || !F.fire || !p || !Number.isFinite(p.x + p.z)) return;
  k = clamp01(fin(k, 0));
  S.caught.seen = F._now();
  F._violet(0.4);
  const lf = F._frame(), fade = k > 0.85 ? clamp01((1 - k) / 0.15) : 1;
  if (!(lf > 0) || !(fade > 0.01)) return;
  const A = F._axes(), x = p.x, y = fin(p.y), z = p.z;
  // white noise of letters over him (each cell its own flicker, re-rolled every frame)
  for (let i = 0; i < 20; i++) {
    const sx = F.lrand(-0.38, 0.38), sy = F.lrand(0.1, 1.8);
    const P = F._toCamera(x + A.rx * sx, y + sy, z + A.rz * sx);
    const h = F.lrand(0.45, 1.35) * fade;
    F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.12, 0.12, h, h, K_STEEL);
  }
  // a static of strokes falling through him
  for (let i = 0; i < 6; i++) {
    const sx = F.lrand(-0.45, 0.45);
    const o = F._rec(x + A.rx * sx, y + F.lrand(0.6, 2.1), z + A.rz * sx, F.lrand(0.1, 0.18), 0.14, 0.12, "|:;.'1", NOISE, NOISE_END);
    o.vy = -F.lrand(5, 9);
    o.alpha = 0.9 * fade;
    F._spawn(F.add, o);
  }
  // violet closing round his feet
  F._ring(x, GROUND_Y, z, 1.1 - 0.5 * k, 16, 0.32, 0.2 * GROUND_GAIN * fade, K_VOID, 3, F._now() * 4);
}

// ======================================================================= THE BREAK
export function domainBreak(F, x, z) {
  const S = F._domainState;
  if (!S || !F.fire || !Number.isFinite(x + z)) return;
  const B = S.brk;
  B.alive = true;
  B.t = 0;
  B.x = x;
  B.y = 1.6;
  B.z = z;
  B.wave = 0;
  // the cracks: RAYS lines out from the point in the camera's plane, each with KINKS joints (metres)
  const R = B.rays, seed = F.lr() * 100;
  for (let i = 0; i < RAYS; i++) {
    let a = (i / RAYS) * TAU + (hash(seed + i) - 0.5) * 0.5, s = 0, u = 0;
    const L = 5 + 10 * hash(seed + i * 3.1);
    for (let j = 0; j <= KINKS; j++) {
      const o = (i * (KINKS + 1) + j) * 2;
      R[o] = s;
      R[o + 1] = u;
      a += (hash(seed + i * 7.7 + j * 1.3) - 0.5) * 0.7;
      const l = (L / KINKS) * (0.7 + 0.6 * hash(seed + i + j * 9.1));
      s += Math.cos(a) * l;
      u += Math.sin(a) * l;
    }
  }
  F._violet(1.4);
  F._blob(x, 1.6, z, 0, 0, 0, 0.08, 0.3, 0.16, 1.4, 0, K_STEEL);
  F._light({ x, y: 1.8, z, color: L_WHITE, intensity: 3, radius: 9, life: 0.3, fade: 0.26 });
}

function breakDraw(F, B, fdt) {
  B.t += fdt;
  const t = B.t;
  F._violet(0.3);
  const A = F._axes(), P0 = F._toCamera(B.x, B.y, B.z), cx = P0.x, cy = P0.y, cz = P0.z;
  if (t < 0.55 && F._frame() > 0) {
    // the cracks run out fast and fade
    const g = clamp01(t / 0.2), h = 0.95 * Math.pow(1 - t / 0.55, 0.5), R = B.rays;
    for (let i = 0; i < RAYS; i++) {
      for (let j = 0; j < KINKS; j++) {
        if (j / KINKS > g) break;
        const o = (i * (KINKS + 1) + j) * 2, s0 = R[o], u0 = R[o + 1], s1 = R[o + 2], u1 = R[o + 3];
        const hh = h * (1 - 0.15 * j);
        F._ink(cx + A.rx * s0 + A.ux * u0, cy + A.ry * s0 + A.uy * u0, cz + A.rz * s0 + A.uz * u0, cx + A.rx * s1 + A.ux * u1, cy + A.ry * s1 + A.uy * u1, cz + A.rz * s1 + A.uz * u1, 0, hh, 0, hh, j ? 1 : 0);
        if (j === 1 && hash(i * 5.3) < 0.6) {
          const bs = s1 + (u1 - u0) * 0.5, bu = u1 - (s1 - s0) * 0.5;
          F._ink(cx + A.rx * s1 + A.ux * u1, cy + A.ry * s1 + A.uy * u1, cz + A.rz * s1 + A.uz * u1, cx + A.rx * bs + A.ux * bu, cy + A.ry * bs + A.uy * bu, cz + A.rz * bs + A.uz * bu, 0, hh * 0.7, 0, hh * 0.5, 1);
        }
      }
    }
  }
  // the void falls away in shards of letters, two waves
  const waves = [0.3, 0.42], counts = [140, 120];
  while (B.wave < waves.length && t >= waves[B.wave]) {
    const n = counts[B.wave];
    for (let i = 0; i < n; i++) {
      const a = F.lr() * TAU, r = 14 * Math.sqrt(F.lr()), s = Math.cos(a) * r, u = Math.sin(a) * r * 0.62;
      const o = F._rec(cx + A.rx * s + A.ux * u, cy + A.ry * s + A.uy * u, cz + A.rz * s + A.uz * u, F.lrand(0.6, 1.2), F.lrand(0.18, 0.28), 0.08, "/\\|_-<>", SHARD, SHARD_END);
      o.vx = A.rx * Math.cos(a) * F.lrand(0.5, 2);
      o.vy = -F.lrand(0.5, 2.5);
      o.vz = A.rz * Math.cos(a) * F.lrand(0.5, 2);
      o.gravity = -10;
      o.drag = 0.6;
      o.spin = F.lrand(-5, 5);
      o.alpha = 0.85;
      F._spawn(F.add, o);
    }
    B.wave++;
  }
  if (t > 1.0) B.alive = false;
}

/** Every frame (WjFx.update): the wall's seal, the break. */
export function update(F, S, fdt) {
  if (!S) return;
  const W = S.wall, now = F._now();
  if (!W.seal && W.seen > 0 && now - W.seen > 0.06 && now - W.seen < 0.5 && W.k >= 0.98) {
    W.seal = true;
    W.sealT = 0;
  }
  if (W.seal) {
    W.sealT += fdt;
    const f = clamp01(W.sealT / WALL.seal);
    if (f >= 1) {
      W.seal = false;
      W.seen = -9;
    } else {
      F._violet(0.3);
      wallDraw(F, W.x, W.z, Math.max(0.4, W.rw * (1 - f)), 0, 0, 1 - f);
    }
  }
  if (S.brk.alive) breakDraw(F, S.brk, fdt);
}
