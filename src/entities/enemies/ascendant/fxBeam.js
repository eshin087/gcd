import { K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';

// Tian Lei's beam (ascendant/fx.js AscFx.beam / beamCharge / beamSplash / beamClash / beamSplit
// draw through here): the fight's signature image. `F` is the AscFx: these use its helpers (_ink
// on the letter grid, _blob, the one-copy frame clock _frame, lr() / lrand(), _keep for a light
// that lives while it is asked for). K_VOID is GOLD on this level (FireField.setPalette).
//
// The beam as text: a CORE written on the letter grid (_ink lines one row apart: the middle ones
// white-hot digits, the outer ones bright strokes), a GOLD BODY of soft heat round it whose width
// swells in bulges that run out along it and whose edge boils (each station's jitter re-rolled 14
// times a second), licks of heat and sparks torn off its edges, the floor under it lit and charred,
// a bulb of light at the muzzle with rays turning in it. Everything held is re-drawn every frame on
// the one-copy clock (so a beam held 2.2 s through slow motion never stacks heat); what flies off
// it is spawned at a rate, not a frame.
// ?ascBeam=a  a column: the body is four overlapping rows of heat across its width.
// ?ascBeam=b  a braid: two strands of gold wind round a thinner core, rings of light run down it.

const TAU = Math.PI * 2;
const GOLD = [4.0, 3.0, 1.1], GOLD_END = [0.8, 0.4, 0.04], WHITE = [3.6, 3.5, 3.0];
const STORM = [2.6, 3.1, 4.2], STORM_END = [0.3, 0.4, 0.8];
const DUSTC = [0.32, 0.3, 0.27], DUST_END = [0.12, 0.11, 0.1], STONE = [0.42, 0.4, 0.38];
const L_GOLD = [1.0, 0.78, 0.36], L_STORM = [0.72, 0.84, 1.0];
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const BODY_A = [-0.62, -0.21, 0.21, 0.62];

/**
 * The beam's body a → b this frame. o: { muzzle (draw the bulb), light (a key for its light, or
 * null), floor (light the floor under it), flies (licks and sparks off it) }.
 */
function beamBody(F, ax, ay, az, bx, by, bz, w, k, dt, form, o) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (!(L > 0.3)) return;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const style = F.look('ascBeam'), braid = style === 'b';
  const t = F._now(), A = F._axes(), C = F._across(dx, dy, dz), cx = C.x, cy = C.y, cz = C.z;
  const S = F._screen(ax, ay, az), row = S.ok ? S.mpp * S.ch : 0.22;
  const hw = 0.5 * w * Math.sqrt(k), life = F._frame();
  if (life > 0) {
    // the core, written on the grid: lines one letter row apart
    let half = Math.max(0, Math.min(3, Math.round((0.36 * w * k) / (2 * row))));
    if (braid) half = Math.max(0, Math.min(1, half - 1));
    const kc = Math.min(1, k / 0.45), s0 = Math.min(L * 0.3, 0.3);
    // (the middle line white-hot steel; the lines beside it add gold to the body's, so it is pale
    // yellow there, then gold: a white core that shades into the body, not a white bar)
    // (the white-hot middle only at the peak, k > 0.85: a beam held at its lower strength (kiBeam.js
    // look.held) is gold through, the owner having called bright letters flashy)
    const hot = k > 0.85;
    for (let j = -half; j <= half; j++) {
      const aj = Math.abs(j), h = (aj === 0 ? (hot ? (braid ? 1.12 : 1.22) : 0.95) : aj === 1 ? 0.6 : aj === 2 ? 0.45 : 0.3) * kc;
      const off = j * row * 0.98;
      F._ink(ax + ux * s0 + cx * off, ay + uy * s0 + cy * off, az + uz * s0 + cz * off, bx + cx * off, by + cy * off, bz + cz * off, 0, h, 0, h * 0.9, 0, aj === 0 && hot ? K_STEEL : K_VOID);
    }
    // the body: stations along it, its width swelling in bulges that run out, its edge boiling
    const step = Math.max(0.28, L / 110), n = Math.ceil(L / step), roll = Math.floor(t * 14);
    // (heat a blob, scaled by how many of them overlap along the beam: a wide beam's big blobs would
    // otherwise sum to a white bar)
    const ov = Math.min(1, (2.7 * step) / Math.max(0.2, hw * 0.95)), ovb = Math.min(1, (2.2 * step) / Math.max(0.2, 0.5 * hw + 0.18));
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * step;
      if (s > L) break;
      const flow = Math.sin(s * 0.85 - t * 24), taper = Math.min(1, 0.5 + s / 1.6) * (1 - 0.45 * Math.max(0, (s - (L - 0.7)) / 0.7));
      const hf = hw * taper * (0.86 + 0.14 * flow);
      const x0 = ax + ux * s, y0 = ay + uy * s, z0 = az + uz * s;
      if (!braid) {
        for (let q = 0; q < 4; q++) {
          const b = BODY_A[q], jit = (hash(i * 3.7 + q * 11.1 + roll * 0.71) - 0.5) * 0.24 * hf;
          const off = b * hf + jit, h = (0.2 + 0.05 * flow + 0.07 * (1 - Math.abs(b))) * k * ov;
          F._blob(x0 + cx * off, y0 + cy * off, z0 + cz * off, 0, 0, 0, life, hf * 0.95, hf * 0.95, h, h, K_VOID);
        }
      } else {
        for (let st = 0; st < 2; st++) {
          const ph = s * 1.9 - t * 18 + st * Math.PI, sn = Math.sin(ph), front = Math.cos(ph);
          const off = 0.72 * hf * sn, sz = 0.5 * hf + 0.18, h = (0.55 + 0.35 * Math.max(0, front)) * k * ovb;
          F._blob(x0 + cx * off, y0 + cy * off, z0 + cz * off, 0, 0, 0, life, sz, sz, h, h, K_VOID);
        }
        const h0 = (0.2 + 0.05 * flow) * k * ov;
        F._blob(x0, y0, z0, 0, 0, 0, life, hf * 0.9, hf * 0.9, h0, h0, K_VOID);
      }
      // the floor under it, lit
      if (o.floor && i % 4 === 0 && y0 < 2.6) F._blob(x0, GROUND_Y, z0, 0, 0, 0, life, Math.min(2.6, w * 0.9), Math.min(2.6, w * 0.9), 0.1 * GROUND_GAIN * k, 0.1 * GROUND_GAIN * k, K_VOID);
    }
    // rings of light running down it (the braid's; the column carries one faint one)
    const P = braid ? 4 : 0, sp = 1.4;
    for (let j = 0; j < P; j++) {
      const s = ((t * sp + j / P) % 1) * L;
      if (s < 0.6) continue;
      const hf = hw * Math.min(1, 0.5 + s / 1.6) * 1.12, x0 = ax + ux * s, y0 = ay + uy * s, z0 = az + uz * s;
      F._ink(x0 - cx * hf, y0 - cy * hf, z0 - cz * hf, x0 + cx * hf, y0 + cy * hf, z0 + cz * hf, 0, 0.9 * k, 0, 0.9 * k, 0, K_VOID);
    }
    // the bulb at the muzzle: a disc of light, a white heart, rays turning in it
    if (o.muzzle) {
      const R = (0.3 + 0.2 * w) * Math.sqrt(k);
      F._disc(ax, ay, az, R, 14, R * 0.75, 0.5 * k, K_VOID);
      const M = F._toCamera(ax, ay, az), mx = M.x, my = M.y, mz = M.z;
      const hh = (hot ? 1.3 : 0.75) * k;
      F._blob(mx, my, mz, 0, 0, 0, life, R * 0.8, R * 0.8, hh, hh, hot ? K_STEEL : K_VOID);
      const rf = Math.floor(t * 10);
      for (let j = 0; j < 6; j++) {
        const a = t * 3 + (j / 6) * TAU + (hash(j + rf) - 0.5) * 0.4, len = R * (1.5 + 0.8 * hash(j * 3 + rf));
        const ex = A.rx * Math.cos(a) + A.ux * Math.sin(a), ey = A.ry * Math.cos(a) + A.uy * Math.sin(a), ez = A.rz * Math.cos(a) + A.uz * Math.sin(a);
        F._ink(mx + ex * R * 0.5, my + ey * R * 0.5, mz + ez * R * 0.5, mx + ex * len, my + ey * len, mz + ez * len, 0, 0.8 * k, 0, 0.3 * k);
      }
    }
  }
  if (o.flies && dt > 0) {
    // licks of heat torn off its edges, sparks
    F._beamAcc += dt * 70 * (L / 16) * k;
    while (F._beamAcc >= 1) {
      F._beamAcc -= 1;
      const s = F.lr() * L, sd = F.lr() < 0.5 ? -1 : 1, hf = hw * Math.min(1, 0.5 + s / 1.6);
      const x0 = ax + ux * s + cx * sd * hf * 0.85, y0 = ay + uy * s + cy * sd * hf * 0.85, z0 = az + uz * s + cz * sd * hf * 0.85;
      const v = F.lrand(1.2, 3);
      F._blob(x0, y0, z0, cx * sd * v + ux * F.lrand(2, 6), cy * sd * v + F.lrand(0.2, 1), cz * sd * v + uz * F.lrand(2, 6), F.lrand(0.14, 0.24), 0.42, 0.2, 0.36 * k, 0, K_VOID, 2);
      if (F.lr() < 0.3) {
        const r = F._rec(x0, y0, z0, F.lrand(0.2, 0.4), F.lrand(0.12, 0.18), 0.03, "'.+", F.lr() < 0.4 ? WHITE : GOLD, GOLD_END);
        r.vx = cx * sd * v * 2 + ux * F.lrand(3, 9);
        r.vy = cy * sd * v * 2 + F.lrand(0, 2);
        r.vz = cz * sd * v * 2 + uz * F.lrand(3, 9);
        r.drag = 2.5;
        F._spawn(F.add, r);
      }
    }
    // the floor charred under it
    if (o.floor && ay < 2.6) {
      F._scorchAcc = (F._scorchAcc ?? 0) + dt * 10 * k;
      while (F._scorchAcc >= 1) {
        F._scorchAcc -= 1;
        const s = F.lr() * L;
        F.game.world?.scorch?.burnCircle?.(ax + ux * s, az + uz * s, Math.min(1.6, w * 0.4), 0.05, 0.45);
      }
    }
  }
  if (o.light) F._keep(o.light, ax + dx * 0.4, Math.max(0.8, ay + dy * 0.4), az + dz * 0.4, form >= 3 ? L_STORM : L_GOLD, (2.2 + 0.6 * w) * k, Math.min(22, L * 0.55 + 4), 0.15);
}

/** The lit beam this frame (AscFx.beam). */
export function drawBeam(F, ax, ay, az, bx, by, bz, w, k, dt, form) {
  beamBody(F, ax, ay, az, bx, by, bz, w, k, dt, form, BEAM_O);
  // the third form's beam crackles: arcs along its length now and then
  if (form >= 3 && dt > 0 && F.lr() < dt * 7 * k) {
    const L = Math.hypot(bx - ax, by - ay, bz - az), s0 = F.lrand(0.1, 0.8), s1 = Math.min(1, s0 + F.lrand(1.5, 3.5) / Math.max(1, L));
    const C = F._across(bx - ax, by - ay, bz - az), sd = (F.lr() < 0.5 ? -1 : 1) * w * 0.55;
    F.arc(ax + (bx - ax) * s0 + C.x * sd, ay + (by - ay) * s0 + C.y * sd, az + (bz - az) * s0 + C.z * sd, ax + (bx - ax) * s1 + C.x * sd, ay + (by - ay) * s1 + C.y * sd, az + (bz - az) * s1 + C.z * sd, 0.3, null, null, 4);
  }
}
const BEAM_O = Object.freeze({ muzzle: true, light: 'beam', floor: true, flies: true });
const SPLIT_O = Object.freeze({ muzzle: false, light: null, floor: true, flies: true });

/**
 * The line he has fixed (kiBeam.js, from the cue until the beam is lit): a thin thread of gold run out
 * from his lead hand a → b, in dashes that crawl outward along it (the eye follows it to where it ends),
 * brighter near the hand. `k` 0..1 its strength. No randomness (a steady pattern on the clock).
 */
export function drawSight(F, ax, ay, az, bx, by, bz, k, form) {
  if (!F.fire || !Number.isFinite(ax + ay + az + bx + by + bz + k) || !(k > 0.01)) return;
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (!(L > 0.5)) return;
  const ux = dx / L, uy = dy / L, uz = dz / L, t = F._now();
  const dash = 0.9, gap = 0.55, per = dash + gap, off = (t * 9) % per;
  const kind = form >= 3 ? K_STEEL : K_VOID;
  for (let s = -per + off; s < L; s += per) {
    const s0 = Math.max(0.15, s), s1 = Math.min(L, s + dash);
    if (s1 <= s0) continue;
    const f0 = 1 - 0.75 * (s0 / L), f1 = 1 - 0.75 * (s1 / L);
    F._ink(ax + ux * s0, ay + uy * s0, az + uz * s0, ax + ux * s1, ay + uy * s1, az + uz * s1, 0, 0.85 * k * f0, 0, 0.85 * k * f1, 0, kind);
  }
}

/** The windup (AscFx.beamCharge): at the drawn-back palm, u 0..1. */
export function drawBeamCharge(F, x, y, z, u, dt, form) {
  const A = F._axes(), t = F._now(), life = F._frame(), f3 = form >= 3;
  const P = F._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
  const R = 0.1 + 0.36 * u;
  if (life > 0) {
    // the bulb: a ball of gold in the camera's plane, its white heart swelling
    for (let i = 0; i < 10; i++) {
      const rr = R * Math.sqrt((i + 0.5) / 10), a = i * 2.39996 + t * 6, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      F._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, R * 0.8, R * 0.8, 0.45 + 0.3 * u, 0.45 + 0.3 * u, K_VOID);
    }
    const hh = (0.75 + 0.6 * u) * (1 + 0.1 * Math.sin(t * 31));
    F._blob(px, py, pz, 0, 0, 0, life, R * 0.95, R * 0.95, hh, hh, K_STEEL);
    // a ring of light turning round it, drawing in
    const Rc = R * 1.4 + 0.5 * (1 - u);
    for (let c = 0; c < 9; c++) {
      const a = t * (5 + 8 * u) + (c / 9) * TAU, ca = Math.cos(a) * Rc, sa = Math.sin(a) * Rc * 0.85, h = (0.3 + 0.3 * u) * (0.6 + 0.4 * hash(c));
      F._blob(px + A.rx * ca + A.ux * sa, py + A.ry * ca + A.uy * sa, pz + A.rz * ca + A.uz * sa, 0, 0, 0, life, 0.26, 0.26, h, h, K_VOID);
    }
    // the floor under the hands, lit
    F._ring(x, GROUND_Y, z, 0.5 + 0.9 * u, Math.round(14 + 12 * u), 0.3, (0.14 + 0.24 * u) * GROUND_GAIN, K_VOID, 3, t * (2 + 4 * u));
  }
  if (dt > 0) {
    // motes and threads of heat drawn in from all round
    F._chargeAcc2 += dt * (26 + 70 * u);
    while (F._chargeAcc2 >= 1) {
      F._chargeAcc2 -= 1;
      const a = F.lr() * TAU, e = F.lrand(-0.7, 0.9), R2 = F.lrand(1.0, 2.6), lf = F.lrand(0.2, 0.34);
      const mx = x + Math.cos(a) * R2, my = y + e * R2 * 0.7, mz = z + Math.sin(a) * R2;
      if (F.lr() < 0.6) {
        const r = F._rec(mx, Math.max(0.1, my), mz, lf, 0.13, 0.04, ".'", f3 && F.lr() < 0.4 ? STORM : GOLD, GOLD_END);
        r.vx = (x - mx) / lf;
        r.vy = (y - Math.max(0.1, my)) / lf;
        r.vz = (z - mz) / lf;
        r.alpha = 0.25;
        r.alphaEnd = 1;
        F._spawn(F.add, r);
      } else F._blob(mx, Math.max(0.75, my), mz, (x - mx) / lf, (y - Math.max(0.75, my)) / lf, (z - mz) / lf, lf, 0.36, 0.2, 0.3 + 0.2 * u, 0.5, K_VOID, 0);
    }
    // dust drawn in along the floor, turning
    if (F.lr() < dt * 18 * u) {
      const a = F.lr() * TAU, r = F.lrand(2, 3.6), lf = F.lrand(0.5, 0.8), sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      const o = F._rec(sx, 0.12, sz, lf, 0.16, 0.06, ",.`'", DUSTC, DUST_END);
      o.vx = (x - sx) / lf - Math.sin(a) * 2.5;
      o.vy = 0.4;
      o.vz = (z - sz) / lf + Math.cos(a) * 2.5;
      o.alpha = 0.5;
      o.alphaEnd = 0.9;
      F._spawn(F.alpha, o);
    }
    if (u > 0.5 && F.lr() < dt * (3 + 9 * u) * (f3 ? 1.5 : 1)) F.arc(x, y, z, x + F.lrand(-1.1, 1.1), GROUND_Y, z + F.lrand(-1.1, 1.1), 0.3, null, null, 5);
  }
  F._keep('charge', x, Math.max(0.7, y), z, f3 ? L_STORM : L_GOLD, 0.8 + 3.2 * u, 4 + 5 * u, 0.15 + 0.2 * u);
}

/** Where the beam ends (AscFx.beamSplash): a churning ball of light, rays jittering out of it,
 *  spray, sparks, chips and smoke off the floor. */
export function drawBeamSplash(F, x, y, z, k, dt, form) {
  const A = F._axes(), t = F._now(), life = F._frame();
  const P = F._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
  if (life > 0) {
    const R = (0.75 + 0.15 * Math.sin(t * 30)) * Math.sqrt(k);
    for (let i = 0; i < 12; i++) {
      const rr = R * Math.sqrt((i + 0.5) / 12), a = i * 2.39996 - t * 8, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      F._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, R * 0.65, R * 0.65, 0.5 * k, 0.5 * k, K_VOID);
    }
    F._blob(px, py, pz, 0, 0, 0, life, R * 0.7, R * 0.7, 1.3 * k, 1.3 * k, K_STEEL);
    for (let j = 0; j < 7; j++) {
      const a = F.lr() * TAU, ca = Math.cos(a), sa = Math.abs(Math.sin(a)) * 0.9 + 0.1 * Math.sin(a), len = F.lrand(0.8, 2.0) * Math.sqrt(k);
      const ex = A.rx * ca + A.ux * sa, ey = A.ry * ca + A.uy * sa, ez = A.rz * ca + A.uz * sa;
      F._ink(px + ex * R * 0.6, py + ey * R * 0.6, pz + ez * R * 0.6, px + ex * len, py + ey * len, pz + ez * len, 0, 0.95 * k, 0, 0.4 * k);
    }
  }
  if (dt > 0) {
    F._splashAcc += dt * 90 * k;
    while (F._splashAcc >= 1) {
      F._splashAcc -= 1;
      const a = F.lr() * TAU, sp = F.lrand(2, 6);
      F._blob(x, Math.max(0.75, y), z, Math.cos(a) * sp, F.lrand(2, 6), Math.sin(a) * sp, F.lrand(0.2, 0.35), 0.45, 0.2, 0.45 * k, 0, K_VOID, 2, 1);
      if (F.lr() < 0.45) {
        const r = F._rec(x, y, z, F.lrand(0.25, 0.5), F.lrand(0.12, 0.2), 0.04, "+*'.", F.lr() < 0.4 ? WHITE : form >= 3 && F.lr() < 0.3 ? STORM : GOLD, form >= 3 ? STORM_END : GOLD_END);
        r.vx = Math.cos(a) * sp * 1.5;
        r.vy = F.lrand(1, 6);
        r.vz = Math.sin(a) * sp * 1.5;
        r.drag = 2;
        r.gravity = -7;
        F._spawn(F.add, r);
      }
      if (y < 1.8 && F.lr() < 0.3) {
        const r = F._rec(x + F.lrand(-0.4, 0.4), 0.2, z + F.lrand(-0.4, 0.4), F.lrand(0.5, 0.9), F.lrand(0.16, 0.24), 0.08, "#%,.", STONE, DUST_END);
        r.vx = Math.cos(a) * sp;
        r.vy = F.lrand(3, 7);
        r.vz = Math.sin(a) * sp;
        r.drag = 1;
        r.gravity = -13;
        r.spin = F.lrand(-5, 5);
        F._spawn(F.alpha, r);
      }
      if (F.lr() < 0.08) F._blob(x + F.lrand(-0.3, 0.3), Math.max(0.8, y), z + F.lrand(-0.3, 0.3), F.lrand(-0.5, 0.5), F.lrand(0.6, 1.6), F.lrand(-0.5, 0.5), F.lrand(0.8, 1.3), 0.6, 1.5, 0.5, 0, K_SMOKE, 1, 0.5);
    }
    if (y < 1.8 && F.lr() < dt * 6) F.game.world?.scorch?.burnCircle?.(x, z, 0.9, 0.06, 0.5);
  }
  F._keep('splash', x, Math.max(0.8, y), z, form >= 3 ? L_STORM : L_GOLD, 3.2 * k, 7, 0.3);
}

/** The clash (AscFx.beamClash): the head grinding on the blade at (x, y, z), the beam along (dx, dz). */
export function drawBeamClash(F, x, y, z, dx, dz, k, dt, form) {
  const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, px0 = -uz, pz0 = ux;
  const A = F._axes(), t = F._now(), life = F._frame();
  const P = F._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
  const R = 0.75 + 0.45 * k + 0.07 * Math.sin(t * 47);
  if (life > 0) {
    // the hemisphere of light: a disc of gold round a white heart, its rim a ring of strokes that jitters
    for (let i = 0; i < 16; i++) {
      const rr = R * Math.sqrt((i + 0.5) / 16), a = i * 2.39996 + t * 11, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      F._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, R * 0.6, R * 0.6, 0.55, 0.55, K_VOID);
    }
    F._blob(px, py, pz, 0, 0, 0, life, 0.62, 0.62, 1.9, 1.9, K_STEEL);
    let lx = 0, ly = 0, lz = 0;
    const rf = Math.floor(t * 20);
    for (let q = 0; q <= 12; q++) {
      const a = (q / 12) * TAU, rr = R * (1.05 + 0.12 * (hash(q % 12 + rf) - 0.5)), ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      const nx = px + A.rx * ox + A.ux * oy, ny = py + A.ry * ox + A.uy * oy, nz = pz + A.rz * ox + A.uz * oy;
      if (q) F._ink(lx, ly, lz, nx, ny, nz, 0, 0.9, 0, 0.9, 1);
      lx = nx;
      ly = ny;
      lz = nz;
    }
    // rays thrown back into the hemisphere facing the beam
    for (let j = 0; j < 9; j++) {
      const th = F.lrand(-1.4, 1.4), c = Math.cos(th), s = Math.sin(th), rx = -ux * c + px0 * s, rz = -uz * c + pz0 * s, ry = F.lrand(-0.2, 0.9), len = F.lrand(0.7, 1.8);
      F._ink(x + rx * R * 0.7, y + ry * R * 0.5, z + rz * R * 0.7, x + rx * len * R, y + ry * len, z + rz * len * R, 0, 1.0, 0, 0.4);
    }
  }
  if (dt > 0) {
    // the light parting round the blade: two streams on past it, wider as the hero wins
    const phi = 0.45 + 0.6 * k;
    F._clashAcc += dt * 150;
    while (F._clashAcc >= 1) {
      F._clashAcc -= 1;
      const sd = F.lr() < 0.5 ? -1 : 1, a = phi * sd + F.lrand(-0.15, 0.15), c = Math.cos(a), s = Math.sin(a);
      const vx = ux * c + px0 * s, vz = uz * c + pz0 * s, sp = F.lrand(8, 14);
      if (F.lr() < 0.5) F._blob(x + vx * 0.4, y + F.lrand(-0.2, 0.3), z + vz * 0.4, vx * sp, F.lrand(-0.3, 0.8), vz * sp, F.lrand(0.14, 0.22), 0.6, 0.3, 0.5, 0, K_VOID, 1);
      else {
        // sparks: back toward him and out to the sides, and up
        const r = F._rec(x, y, z, F.lrand(0.25, 0.5), F.lrand(0.12, 0.2), 0.03, "+*'.", F.lr() < 0.5 ? WHITE : form >= 3 && F.lr() < 0.4 ? STORM : GOLD, GOLD_END);
        const bk = F.lrand(1, 7), sw = F.lrand(-7, 7);
        r.vx = -ux * bk + px0 * sw;
        r.vy = F.lrand(1, 6);
        r.vz = -uz * bk + pz0 * sw;
        r.drag = 2;
        r.gravity = -7;
        F._spawn(F.add, r);
      }
    }
    // the hero's feet: dust ploughed back along the beam
    if (F.lr() < dt * 22) {
      const o = F._rec(x + F.lrand(-0.5, 0.5), 0.12, z + F.lrand(-0.5, 0.5), F.lrand(0.4, 0.8), 0.17, 0.06, ",.`'", DUSTC, DUST_END);
      o.vx = ux * F.lrand(2, 5) + px0 * F.lrand(-1.5, 1.5);
      o.vy = F.lrand(0.5, 2);
      o.vz = uz * F.lrand(2, 5) + pz0 * F.lrand(-1.5, 1.5);
      o.drag = 2;
      o.gravity = -4;
      F._spawn(F.alpha, o);
    }
  }
  F._keep('clash', x, Math.max(0.8, y), z, form >= 3 ? L_STORM : L_GOLD, 5 + 2 * k, 9, 0.4);
}

/** The split (AscFx.beamSplit's record, drawn every frame from update until it fades). */
export function drawSplit(F, S, dt) {
  S.t += dt;
  S.last += dt;
  const fade = S.last <= 0.12 ? 1 : 1 - (S.last - 0.12) / 0.75;
  if (!(fade > 0)) {
    S.alive = false;
    return;
  }
  const k = fade * Math.min(1, S.t / 0.08), th = 0.2 + 0.04 * Math.sin(S.t * 9);
  for (let sd = -1; sd <= 1; sd += 2) {
    const c = Math.cos(th * sd), s = Math.sin(th * sd), vx = S.dx * c - S.dz * s, vz = S.dx * s + S.dz * c;
    beamBody(F, S.x + vx * 0.7, S.y, S.z + vz * 0.7, S.x + vx * S.len, S.y, S.z + vz * S.len, 1.3, k, dt, S.form, SPLIT_O);
    // the V: white lines where the beam is parted
    F._ink(S.x + vx * 0.25, S.y, S.z + vz * 0.25, S.x + vx * 1.8, S.y, S.z + vz * 1.8, 0, 1.42 * k, 0, 1.0 * k);
  }
  const life = F._frame();
  if (life > 0) {
    const P = F._toCamera(S.x, S.y, S.z);
    F._blob(P.x, P.y, P.z, 0, 0, 0, life, 0.6, 0.6, 1.6 * k, 1.6 * k, K_STEEL);
    F._disc(S.x, S.y, S.z, 0.6, 9, 0.45, 0.5 * k, K_VOID);
  }
  F._keep('split', S.x, Math.max(0.8, S.y), S.z, S.form >= 3 ? L_STORM : L_GOLD, 5 * k, 12, 0.3);
}
