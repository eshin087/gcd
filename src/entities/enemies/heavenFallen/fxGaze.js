import * as THREE from 'three';
import { K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { drawBeam, drawBeamSplash } from '../ascendant/fxBeam.js';

// Qian Yao's eyes, drawn (FallenFx.gaze / eyesCharge / gazeFlash call these; gaze.js decides where).
// Heat in the fire field (STYLE.md "The fire field"): the void slot is GOLD on this level
// (FireField.setPalette, as the Skybreak Ring does), steel is the crisp white-hot kind. Many small cool
// blobs, never one hot one; hdr stays the palette's 0.6. Never red: red is the dodge tell. Look
// randomness: the fx's own stream (F.lr()), never Math.random.
//
// ?gaze=a  a white core in a gold sheath with a boiling foot (Tian Lei's beam body, narrower, from two
//          points at his eyes; recommended)
// ?gaze=b  a braided lance: two strands of gold wound round a thin core (the braid of fxBeam.js)
// ?gaze=c  a thin steel line; its show is the wide molten seam it leaves (seams.js widens it)

const WHITE = [3.4, 3.3, 2.9], GOLD = [3.6, 2.6, 0.9], GOLD_END = [0.7, 0.35, 0.04];
const F_V = { x: 0, y: 0, z: 0 };
const TMP = new THREE.Vector3();

/** The two eyes as drawn (out: { lx, ly, lz, rx, ry, rz }), from the head sphere and his facing. */
export function eyes(d, out) {
  const h = d._hs?.[0], s = d.drawScale || 1;
  const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), cx = Math.cos(d.yaw), cz = -Math.sin(d.yaw);
  const v = (F_V.x = d.position.x, F_V.y = d.position.y + 1.36, F_V.z = d.position.z, F_V);
  if (h && Number.isFinite(h.x + h.y + h.z) && (h.x || h.z)) {
    v.x = h.x;
    v.y = h.y - 0.13;
    v.z = h.z;
  }
  // (the upright point as it is drawn: his scale about his root, the lean toward the camera)
  const D = d.drawnPoint ? d.drawnPoint(TMP.set(v.x, v.y, v.z)) : TMP.set(v.x, v.y, v.z);
  const x = D.x, y = D.y, z = D.z;
  const f = 0.11 * s, w = 0.045 * s;
  out.lx = x + fx * f + cx * w;
  out.lz = z + fz * f + cz * w;
  out.rx = x + fx * f - cx * w;
  out.rz = z + fz * f - cz * w;
  out.ly = out.ry = y;
  return out;
}

/** The lit beam: from his eyes (a) to its foot on the floor (b), `w` m wide (its hit strip), `k` 0..1. */
export function drawGaze(F, d, ax, ay, az, bx, by, bz, w, k, dt, kind) {
  if (!F.fire || !Number.isFinite(ax + ay + az + bx + by + bz + k) || !(k > 0.01)) return;
  const style = F.gazeLook();
  const E = eyes(d, (F._eyes ??= {}));
  if (style === 'c') {
    // a thin steel line from each eye converging on the foot, a small knot where it meets
    const life = F._frame();
    if (life > 0) {
      F._ink(E.lx, E.ly, E.lz, bx, by, bz, 0, 1.1 * k, 0, 0.8 * k, 0, K_STEEL);
      F._ink(E.rx, E.ry, E.rz, bx, by, bz, 0, 1.1 * k, 0, 0.8 * k, 0, K_STEEL);
      F._blob(bx, Math.max(0.5, by), bz, 0, 0, 0, life, 0.45, 0.45, 0.8 * k, 0.8 * k, K_VOID);
    }
    sparks(F, bx, by, bz, k, dt);
    return;
  }
  // a / b: the beam's body (fxBeam.js; its style read from F.look('ascBeam'), which FallenFx answers
  // from ?gaze=), narrower than Tian Lei's: his eyes are not his palms
  drawBeam(F, ax, ay, az, bx, by, bz, Math.max(0.45, w * 0.62), k, dt, 1);
  // the two points at his eyes, white-hot, and the threads from each into the beam
  const life = F._frame();
  if (life > 0) {
    for (const [x, y, z] of [[E.lx, E.ly, E.lz], [E.rx, E.ry, E.rz]]) {
      F._blob(x, y, z, 0, 0, 0, life, 0.16, 0.16, 1.1 * k, 1.1 * k, K_STEEL);
      F._ink(x, y, z, ax + (bx - ax) * 0.08, ay + (by - ay) * 0.08, az + (bz - az) * 0.08, 0, 0.9 * k, 0, 0.6 * k, 0, K_STEEL);
    }
  }
  // the boiling knot where it meets the floor, embers and a wisp of smoke
  drawBeamSplash(F, bx, Math.max(0.4, by), bz, k * 0.75, dt, 1);
  if (dt > 0 && F.lr() < dt * 6 * k) F._blob(bx, 0.6, bz, F.lrand(-0.3, 0.3), F.lrand(0.6, 1.2), F.lrand(-0.3, 0.3), F.lrand(0.8, 1.3), 0.5, 1.2, 0.3, 0, K_SMOKE, 0.5);
}

/** Embers off the foot of a beam (one-letter glyphs: small things that fly on their own). */
function sparks(F, x, y, z, k, dt) {
  if (!(dt > 0)) return;
  F._gzAcc = (F._gzAcc ?? 0) + dt * 40 * k;
  while (F._gzAcc >= 1) {
    F._gzAcc -= 1;
    const a = F.lr() * Math.PI * 2, sp = F.lrand(1.5, 4.5);
    const r = F._rec(x, Math.max(0.3, y), z, F.lrand(0.25, 0.5), F.lrand(0.11, 0.17), 0.03, "'.+", F.lr() < 0.4 ? WHITE : GOLD, GOLD_END);
    r.vx = Math.cos(a) * sp;
    r.vy = F.lrand(1, 4);
    r.vz = Math.sin(a) * sp;
    r.drag = 2;
    r.gravity = -7;
    F._spawn(F.add, r);
  }
}

/** Through a windup: two points of light growing at his eyes (`u` 0..1); `fixed`: the line is set (a
 *  thread of light runs out from the eyes along it); `up`: he looks up at the rock. */
export function drawEyesCharge(F, d, u, dt, fixed, up) {
  if (!F.fire || !Number.isFinite(u)) return;
  const life = F._frame();
  if (!(life > 0)) return;
  const E = eyes(d, (F._eyes ??= {}));
  const r = 0.07 + 0.16 * u, h = 0.45 + 0.75 * u;
  for (const [x, y, z] of [[E.lx, E.ly, E.lz], [E.rx, E.ry, E.rz]]) {
    F._blob(x, y, z, 0, 0, 0, life, r, r, h, h, u > 0.6 ? K_STEEL : K_VOID);
    if (u > 0.3) F._blob(x, y, z, 0, 0, 0, life, r * 2.2, r * 2.2, 0.18 * u, 0.18 * u, K_VOID);
  }
  if (fixed && !up) {
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), mx = (E.lx + E.rx) / 2, mz = (E.lz + E.rz) / 2;
    const t = F._now(), L = 4 + 6 * u, off = (t * 10) % 0.9;
    for (let s = off; s < L; s += 0.9) F._ink(mx + fx * s, E.ly - s * 0.08, mz + fz * s, mx + fx * (s + 0.45), E.ly - (s + 0.45) * 0.08, mz + fz * (s + 0.45), 0, 0.5 * u, 0, 0.35 * u, 0, K_VOID);
  }
  if (up) {
    const mx = (E.lx + E.rx) / 2, mz = (E.lz + E.rz) / 2;
    F._ink(mx, E.ly + 0.1, mz, mx, E.ly + 1.2 + 4 * u, mz, 0, 0.5 * u, 0, 0.1, 0, K_VOID);
  }
  F._keep?.('eyes', E.lx, E.ly, E.lz, [1.0, 0.86, 0.55], 0.6 + 2.2 * u, 3 + 3 * u, 0.1);
  // the floor before him lit faintly, as the charge grows
  if (u > 0.4 && !up) F._blob(d.position.x + Math.sin(d.yaw) * 1.2, GROUND_Y, d.position.z + Math.cos(d.yaw) * 1.2, 0, 0, 0, life, 1.2, 1.2, 0.05 * GROUND_GAIN * u, 0.05 * GROUND_GAIN * u, K_VOID);
}
