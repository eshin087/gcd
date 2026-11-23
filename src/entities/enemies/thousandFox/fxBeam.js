import { K_STEEL, K_SMOKE, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';

// Heaven-Devouring Howl's drawing (ADR-154; STYLE.md "The fox's effects"): pure draw helpers that take
// the FX (`d.fx`, a FoxFx: DuelFx's _blob / _dot / _ink / _frame / _toCamera / _axes / _screen, FoxFx's
// kr() look stream, _keep lights, FIRE3 = phase 3's fire kind per ?foxFire3) as their first argument.
// Everything that burns or glows is heat in the fire field (small letters; many small cool blobs, never
// one big hot one); what flies on its own (embers, the ring's script) is glyph particles of one letter
// cell. Look code draws from fx.kr() or a steady hash, never Math.random. Held heat goes through the
// one-copy frame clock (_frame / _dot): slow motion never stacks it.
//
// Surface (beam.js calls these):
//   summonRing(fx, x, z, r, k, dt)        the ring of script burning out on the floor round him (k 0..1
//                                         it grows; 1..2 it burns down)
//   darkSun(fx, x, y, z, u, dt)           the black sphere gathering at the jaws (u 0..1 through the charge)
//   beamMark(fx, x0, z0, x1, z1, w, k, dt)   the strip's ground heating before it fires (k 0..1)
//   beamBody(fx, x0, y0, z0, x1, z1, w, t, dt, k = 1)   the beam lit: jaws (x0, y0, z0) → down into the
//                                         terrace → along the floor to (x1, z1); t s since it lit (a white
//                                         peak first), k its strength (the fade)
//   spiritFire(fx, spirit, k, dt)         the fire at the creature's edges, tail tips, eyes and jaws, the
//                                         pool it rises from; ?foxSpirit=b: the whole fox as heat and ink
//   spiritEnd(fx, spirit)                 it goes up in embers (once)
//
// COST (the field holds 6000 blobs; the Howl stays under ~3000 alive, measured in the beam scenario):
// the ring ~2 x its cells, the dark sun ~90, the mark two edge lines, the beam ~3 core lines + ~110
// stations x 3, the fox's fire ~250 (b: ~900 at the game camera), the end ~200 once.

const TAU = Math.PI * 2;
const SCRIPT = '%#&$@=+*<>{}[]()?!~^';
const WHITE = [3.4, 3.2, 2.9];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** A steady hash 0..1 (a pattern that never reshuffles). */
const hash = (a, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
// the fire's colours that are not heat (a light, the script, embers), per phase 3's fire (?foxFire3)
const COL = {
  a: { light: [1.0, 0.42, 0.12], script: [3.2, 0.9, 0.2], scriptEnd: [0.5, 0.05, 0.01], ember: [3.2, 1.1, 0.25], emberEnd: [0.5, 0.06, 0.01] },
  b: { light: [0.42, 1.0, 0.62], script: [1.0, 3.0, 1.7], scriptEnd: [0.03, 0.28, 0.12], ember: [1.0, 3.0, 1.7], emberEnd: [0.03, 0.28, 0.12] },
};
const colOf = (fx) => COL[fx?.look3 === 'b' ? 'b' : 'a'];
/** A light kept while asked for every frame, in phase 3's colour (FoxFx._keep makes it). */
function keep(fx, key, x, y, z, intensity, radius, flicker = 0.15) {
  const L = fx._keep?.(key, x, y, z, intensity, radius, flicker);
  if (L) L.color = colOf(fx).light;
  return L;
}
/** Per-fx scratch (no allocation per frame). */
const SCR = new WeakMap();
function scr(fx) {
  let s = SCR.get(fx);
  if (!s) SCR.set(fx, (s = { sunAcc: 0, lickAcc: 0, scorchAcc: 0, tipAcc: 0, edgeAcc: 0, poolAcc: 0, splashAcc: 0 }));
  return s;
}

// ---------------------------------------------------------------- the summoning
/**
 * The ring of script round him (every frame of the summoning): two circles written on the letter grid
 * on the floor (crisp strokes that run round them), the band between them full of one-cell glyphs of
 * script in phase 3's colour, each its own steady character, flickering; it burns outward from his
 * palms to `r` over the first part of k, then holds; k past 1 it burns down. Heat ~2 x its cells.
 */
export function summonRing(fx, x, z, r, k, dt) {
  if (!fx?.fire || !Number.isFinite(x + z + r + k) || !(r > 0)) return;
  const grow = Math.min(1, k * 1.6), e = grow * grow * (3 - 2 * grow);
  const fade = k > 1 ? Math.max(0, 2 - k) : 1;
  if (!(fade > 0.01) || !(e > 0.02)) return;
  const R = r * e, t = fx.game?.time ?? 0, F = fx.FIRE3;
  // the circles: one segment per ~0.5 m, written on the grid (held: this frame only)
  for (const [rr, h] of [[R, 0.42], [R * 0.7, 0.32]]) {
    const n = Math.max(12, Math.min(64, Math.round((TAU * rr) / 0.5)));
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + t * 0.4, a1 = ((i + 1) / n) * TAU + t * 0.4;
      fx._ink(x + Math.sin(a0) * rr, GROUND_Y, z + Math.cos(a0) * rr, x + Math.sin(a1) * rr, GROUND_Y, z + Math.cos(a1) * rr, 0, h * GROUND_GAIN * fade, 0, h * GROUND_GAIN * fade, i ? 1 : 0, F);
    }
  }
  // the script between them: glyph particles (one cell each), a steady pick per slot
  const pool = fx.add, life = fx._frame();
  if (pool && life > 0) {
    const C = colOf(fx), rm = R * 0.85, n = Math.max(10, Math.min(56, Math.round((TAU * rm) / 0.42)));
    const o = fx._rec(x, 0.14, z, life, 0.4, 0.4, '#', C.script, C.script);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - t * 0.25, h = hash(i, 3.3);
      const fl = 0.55 + 0.45 * Math.sin(t * (3 + 4 * h) + i);
      o.x = x + Math.sin(a) * rm;
      o.z = z + Math.cos(a) * rm;
      o.glyph = SCRIPT[(h * SCRIPT.length) | 0];
      o.alpha = o.alphaEnd = Math.max(0, fl) * fade;
      pool.spawn(o);
    }
  }
  // a glow under his palms
  if (life > 0) fx._dot(x, 0.75, z, 1.0, 0.3 * fade * e, F);
}

// ---------------------------------------------------------------- the dark sun
/**
 * Every frame of the charge: a black sun gathering in front of the jaws, about 2 m across at the end. A
 * disc of dark (steel at a low heat inside a DARK tint zone of the field: blacked-out cells) that swells
 * with u, a thick hot rim of phase 3's fire round it (three rows, the outer ragged) that turns, a
 * white-hot point in its heart toward the end, and motes of fire streaming in from the whole arena (born
 * 6 - 22 m out, short streaks). ~250 - 400 blobs alive at the end.
 */
export function darkSun(fx, x, y, z, u, dt) {
  if (!fx?.fire || !Number.isFinite(x + y + z + u)) return;
  u = Math.max(0, Math.min(1, u));
  // (pulled 3.5 m toward the camera: in front of the jaws and the head, past the field's depth fade)
  const C = fx._toCam(), px = x + C.x * 3.5, py = y + C.y * 3.5, pz = z + C.z * 3.5, A = fx._axes(), F = fx.FIRE3, S = scr(fx);
  const t = fx.game?.time ?? 0, R = 0.35 + 0.8 * u;
  const life = fx._frame();
  if (life > 0) {
    fx._blob(px, py, pz, 0, 0, 0, life, R * 2.0, R * 2.0, 0.62, 0.62, K_STEEL);
    // the hot rim: three rows of heat round the dark (the outer one ragged), turning
    const n = Math.max(20, Math.round(20 + 22 * u));
    for (let q = 0; q < 3; q++) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * (1.2 + 2 * u) * (q === 1 ? -0.7 : 1) + q * 0.3, fl = 0.65 + 0.35 * hash(i + q * 97, Math.floor(t * 14));
        const rr = R * (q === 0 ? 1 : q === 1 ? 1.16 : 1.3 + 0.2 * hash(i, Math.floor(t * 9))) * (1 + 0.05 * Math.sin(t * 7 + i * 1.7));
        const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
        fx._dot(px + A.rx * ca + A.ux * sa, py + A.ry * ca + A.uy * sa, pz + A.rz * ca + A.uz * sa, q === 2 ? 0.4 : 0.5, (q === 0 ? 0.6 + 0.5 * u : q === 1 ? 0.45 : 0.28) * fl, F);
      }
    }
    if (u > 0.55) fx._dot(px, py, pz, 0.3, (1.3 * (u - 0.55)) / 0.45, K_STEEL);
    // the dye: steel within its disc prints black (fireField.js tint; the flare at the cue takes the other zone)
    const Sc = fx._screen(px, py, pz);
    if (fx.fire.tint && Sc.ok) {
      const rpx = (R * 0.98) / Sc.mpp;
      fx.fire.tint(861861, Sc.px, Sc.py, rpx, rpx, [0.3, 0.06, 0.1], 1, 1, 0.08);
    }
  }
  if (dt > 0) {
    S.sunAcc += dt * (60 + 160 * u);
    let g = 0;
    while (S.sunAcc >= 1 && g++ < 12) {
      S.sunAcc -= 1;
      const a = fx.kr() * TAU, e = fx.krand(-0.4, 0.9), D = fx.krand(6, 22), lf = fx.krand(0.55, 0.95);
      const sx = x + Math.cos(a) * D, sy = Math.max(0.8, y + e * D * 0.4), sz = z + Math.sin(a) * D;
      // (a short streak: two blobs one behind the other, both arriving as they die)
      for (let j = 0; j < 2; j++) {
        const f = 1 + 0.08 * j;
        const bx = x + (sx - x) * f, by = y + (sy - y) * f, bz = z + (sz - z) * f;
        fx._blob(bx, by, bz, (x - bx) / lf, (y - by) / lf, (z - bz) / lf, lf, 0.45, 0.2, (0.36 - 0.1 * j) * (0.6 + 0.4 * u), 0.55, F);
      }
    }
    if (S.sunAcc > 12) S.sunAcc = 0;
  }
  keep(fx, 'howlSun', x, Math.max(1, y), z, 0.8 + 2.2 * u, 7 + 7 * u, 0.3);
}

// ---------------------------------------------------------------- the line, fixed
/**
 * Every frame from the cue to the fire: the strip's ground heating (a hazard's mark, ADR-052): sparse
 * steady ground specks filling it, denser and hotter with k, and its two edges written on the grid in
 * phase 3's fire at a low heat (red strokes), brightening toward the fire.
 */
export function beamMark(fx, x0, z0, x1, z1, w, k, dt) {
  if (!fx?.fire || !Number.isFinite(x0 + z0 + x1 + z1 + w + k)) return;
  k = Math.max(0, Math.min(1, k));
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (!(L > 0.5)) return;
  const ux = dx / L, uz = dz / L, sx = -uz, sz = ux, hw = w / 2, F = fx.FIRE3;
  for (const sd of [-1, 1]) {
    const h = (0.2 + 0.18 * k) * GROUND_GAIN;
    fx._ink(x0 + sx * hw * sd, GROUND_Y, z0 + sz * hw * sd, x1 + sx * hw * sd, GROUND_Y, z1 + sz * hw * sd, 0, h, 0, h * 0.7, 0, F);
  }
  const pool = fx.add, life = fx._frame();
  if (!pool || !(life > 0)) return;
  const C = colOf(fx), t = fx.game?.time ?? 0;
  const n = Math.max(20, Math.min(170, Math.round((L * w) / 0.55)));
  const o = fx._rec(x0, 0.12, z0, life, 0.45, 0.45, '.', C.script, C.script);
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, 9.1);
    if (h1 > 0.35 + 0.65 * k) continue;
    const s = hash(i, 1.7) * L, c = (hash(i, 4.3) - 0.5) * w;
    o.x = x0 + ux * s + sx * c;
    o.z = z0 + uz * s + sz * c;
    o.glyph = ".,:'"[(hash(i, 6.1) * 4) | 0];
    o.alpha = o.alphaEnd = (0.35 + 0.6 * k) * (0.75 + 0.25 * Math.sin(t * 20 + i));
    pool.spawn(o);
  }
}

// ---------------------------------------------------------------- the beam
// the body across the beam: five rows of heat (the outer two boil: their offset re-rolled 14 times a second)
const BODY_A = [-0.9, -0.45, 0, 0.45, 0.9];
const BODY_H = [0.24, 0.32, 0.38, 0.32, 0.24];
/**
 * The beam lit (every frame): from the jaws (x0, y0, z0) down into the terrace at about 50 degrees, then
 * along the floor to (x1, z1), filling its strip (`w` m wide). A BULB of light at the jaws; a CORE written
 * on the letter grid (five lines one row apart: white-hot steel in the middle, fire beside it); a BODY of
 * heat five rows across the whole width, swelling in bulges that run out along it, its edge boiling; the
 * first `look.peak` s a hard white flash through it; a fountain of heat where it meets the floor; the floor
 * under it lit and charred, and a scar of low heat that lingers a moment where it has been; licks of heat
 * and embers torn off its edges; lights.
 */
export function beamBody(fx, x0, y0, z0, x1, z1, w, t, dt, k = 1) {
  if (!fx?.fire || !Number.isFinite(x0 + y0 + z0 + x1 + z1 + w + t + k) || !(k > 0.01)) return;
  // where it meets the floor: under the jaws' ground point, toward the end, as far as the drop
  const gx = x1 - x0, gz = z1 - z0, G = Math.hypot(gx, gz);
  if (!(G > 1)) return;
  const fall = Math.min(G * 0.5, Math.max(1, (y0 - 0.6) * 0.85));
  const lx = x0 + (gx / G) * fall, lz = z0 + (gz / G) * fall, ly = 0.6;
  const L = fx.d?.T?.verdict?.look;
  const peak = t < (L?.peak ?? 0.15);
  const kk = (peak ? 1 : L?.held ?? 0.85) * k;
  segment(fx, x0, y0, z0, lx, ly, lz, w * 0.7, kk, peak, false, dt);
  segment(fx, lx, ly, lz, x1, 0.6, z1, w, kk, peak, true, dt);
  splash(fx, lx, lz, w, kk, dt);
  bulb(fx, x0, y0, z0, w, kk, peak, t);
  keep(fx, 'howlBeam', (x0 + x1) * 0.5, 2.0, (z0 + z1) * 0.5, (2.8 + 0.9 * w) * kk, Math.min(26, G * 0.65 + 4), 0.15);
  keep(fx, 'howlLand', lx, 1.2, lz, 3.4 * kk, 9, 0.25);
}

/** The bulb of light at the jaws: a white heart, a ball of fire round it, rays turning in it. */
function bulb(fx, x, y, z, w, k, peak, t) {
  const life = fx._frame();
  if (!(life > 0)) return;
  const C = fx._toCam(), A = fx._axes(), F = fx.FIRE3;
  const px = x + C.x * 2.5, py = y + C.y * 2.5, pz = z + C.z * 2.5, R = (0.55 + 0.25 * w) * (peak ? 1.25 : 1);
  for (let i = 0; i < 12; i++) {
    const rr = R * Math.sqrt((i + 0.5) / 12), a = i * 2.39996 + t * 6, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
    fx._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, R * 0.8, R * 0.8, 0.42 * k, 0.42 * k, F);
  }
  fx._blob(px, py, pz, 0, 0, 0, life, R * 0.9, R * 0.9, (peak ? 1.6 : 1.25) * k, (peak ? 1.6 : 1.25) * k, K_STEEL);
  const rf = Math.floor(t * 10);
  for (let j = 0; j < 7; j++) {
    const a = t * 3 + (j / 7) * TAU + (hash(j + rf) - 0.5) * 0.4, len = R * (1.6 + 0.9 * hash(j * 3 + rf));
    const ex = A.rx * Math.cos(a) + A.ux * Math.sin(a), ey = A.ry * Math.cos(a) + A.uy * Math.sin(a), ez = A.rz * Math.cos(a) + A.uz * Math.sin(a);
    fx._ink(px + ex * R * 0.6, py + ey * R * 0.6, pz + ez * R * 0.6, px + ex * len, py + ey * len, pz + ez * len, 0, 0.9 * k, 0, 0.35 * k);
  }
}

/** One straight run of the beam a → b (`ground`: it lies on the floor: its width is the strip's). */
function segment(fx, ax, ay, az, bx, by, bz, w, k, peak, ground, dt) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (!(L > 0.3)) return;
  const ux = dx / L, uy = dy / L, uz = dz / L, F = fx.FIRE3, S = scr(fx), t = fx.game?.time ?? 0;
  // across: on the floor the strip's own sideways; in the air, sideways on the screen
  let cx, cy, cz;
  if (ground) {
    const l = Math.hypot(ux, uz) || 1;
    cx = -uz / l;
    cy = 0;
    cz = ux / l;
  } else {
    const A = fx._axes(), vx = A.ry * A.uz - A.rz * A.uy, vy = A.rz * A.ux - A.rx * A.uz, vz = A.rx * A.uy - A.ry * A.ux;
    cx = uy * vz - uz * vy;
    cy = uz * vx - ux * vz;
    cz = ux * vy - uy * vx;
    const l = Math.hypot(cx, cy, cz) || 1;
    cx /= l;
    cy /= l;
    cz /= l;
  }
  const Sc = fx._screen(ax, ay, az), row = Sc.ok ? Sc.mpp * Sc.ch : 0.22;
  const hw = 0.5 * w, life = fx._frame();
  if (life > 0) {
    // the core: five lines one row apart (a white-hot steel middle, fire beside it)
    for (let j = -2; j <= 2; j++) {
      const aj = Math.abs(j), off = j * row * 0.98;
      const h = (aj === 0 ? (peak ? 1.3 : 1.12) : aj === 1 ? 0.95 : 0.7) * Math.min(1, k / 0.6);
      fx._ink(ax + cx * off, ay + cy * off, az + cz * off, bx + cx * off, by + cy * off, bz + cz * off, 0, h, 0, h * 0.9, 0, aj === 0 || (peak && aj === 1) ? K_STEEL : F);
    }
    // the body: five rows of heat across the whole width, bulges running out along it, the edge boiling
    const step = Math.max(0.3, L / 100), n = Math.ceil(L / step), roll = Math.floor(t * 14);
    const sz = Math.max(0.45, hw * 0.78);
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * step;
      if (s > L) break;
      const flow = Math.sin(s * 0.7 - t * 22), taper = ground ? 1 - 0.45 * Math.max(0, (s - (L - 1.4)) / 1.4) : 0.8 + 0.2 * (s / L);
      const hf = hw * taper * (0.9 + 0.1 * flow);
      const x = ax + ux * s, y = ay + uy * s, z = az + uz * s;
      for (let q = 0; q < 5; q++) {
        const b = BODY_A[q], edge = q === 0 || q === 4;
        const jit = (hash(i * 3.7 + q * 11.1, roll * 0.71) - 0.5) * (edge ? 0.4 : 0.18) * hf;
        const off = b * hf + jit, h = (BODY_H[q] + 0.05 * flow) * k;
        fx._blob(x + cx * off, y + cy * off, z + cz * off, 0, 0, 0, life, sz, sz, h, h, F);
      }
      // the white flash of its first moment
      if (peak && i % 2 === 0) fx._blob(x, y, z, 0, 0, 0, life, sz * 1.2, sz * 1.2, 0.5, 0.5, K_STEEL);
      // the floor under it, lit
      if (ground && i % 3 === 0) fx._blob(x, GROUND_Y, z, 0, 0, 0, life, Math.min(3.4, w), Math.min(3.4, w), 0.13 * GROUND_GAIN * k, 0.13 * GROUND_GAIN * k, F);
    }
  }
  if (dt > 0) {
    // licks of heat torn off its edges; embers
    S.lickAcc += dt * 55 * (L / 12) * k;
    let g = 0;
    while (S.lickAcc >= 1 && g++ < 14) {
      S.lickAcc -= 1;
      const s = fx.kr() * L, sd = fx.kr() < 0.5 ? -1 : 1;
      const x = ax + ux * s + cx * sd * hw * 0.95, y = ay + uy * s + cy * sd * hw * 0.95 + 0.2, z = az + uz * s + cz * sd * hw * 0.95;
      const v = fx.krand(1.2, 3);
      fx._blob(x, Math.max(0.75, y), z, cx * sd * v + ux * fx.krand(1, 4), fx.krand(0.6, 2), cz * sd * v + uz * fx.krand(1, 4), fx.krand(0.18, 0.3), 0.55, 0.25, 0.4 * k, 0, F, 2);
      if (fx.kr() < 0.25) {
        const C = colOf(fx), r = fx._rec(x, Math.max(0.6, y), z, fx.krand(0.3, 0.6), fx.krand(0.14, 0.2), 0.04, "'.*", fx.kr() < 0.3 ? WHITE : C.ember, C.emberEnd);
        r.vx = cx * sd * v * 2 + ux * fx.krand(2, 6);
        r.vy = fx.krand(1, 4);
        r.vz = cz * sd * v * 2 + uz * fx.krand(2, 6);
        r.drag = 2.2;
        r.gravity = -3;
        fx._spawn(fx.add, r);
      }
    }
    if (S.lickAcc > 14) S.lickAcc = 0;
    if (ground) {
      // the floor charred under it, and a scar of low heat that lingers a moment where it has been
      S.scorchAcc += dt * 14 * k;
      while (S.scorchAcc >= 1) {
        S.scorchAcc -= 1;
        const s = fx.kr() * L;
        fx.game?.world?.scorch?.burnCircle?.(ax + ux * s, az + uz * s, Math.min(2.0, w * 0.55), 0.08, 0.7);
      }
      S.scarAcc = (S.scarAcc ?? 0) + dt * 45 * k;
      g = 0;
      while (S.scarAcc >= 1 && g++ < 6) {
        S.scarAcc -= 1;
        const s = fx.kr() * L, c = fx.krand(-0.7, 0.7) * hw, h = fx.krand(0.14, 0.22) * GROUND_GAIN;
        fx._blob(ax + ux * s + cx * c, GROUND_Y + 0.1, az + uz * s + cz * c, 0, 0.05, 0, fx.krand(1.0, 1.8), 1.3, 1.0, h, 0, F);
      }
      if (S.scarAcc > 6) S.scarAcc = 0;
    }
  }
}

/** Where the beam meets the floor: a fountain of heat thrown up and out, a hot knot, stone dust. */
function splash(fx, x, z, w, k, dt) {
  const F = fx.FIRE3, S = scr(fx), life = fx._frame();
  if (life > 0) for (let i = 0; i < 5; i++) fx._dot(x + (hash(i, 1) - 0.5) * 0.8, 0.9 + 0.35 * i, z + (hash(i, 2) - 0.5) * 0.8, 0.9, 0.36 * k, F);
  if (!(dt > 0)) return;
  S.splashAcc += dt * 60 * k;
  let g = 0;
  while (S.splashAcc >= 1 && g++ < 6) {
    S.splashAcc -= 1;
    const a = fx.kr() * TAU, sp = fx.krand(2, 6), up = fx.krand(2, 6);
    fx._blob(x + Math.cos(a) * 0.4, 0.85, z + Math.sin(a) * 0.4, Math.cos(a) * sp, up, Math.sin(a) * sp, fx.krand(0.25, 0.45), 0.5, 0.25, 0.4 * k, 0, F, 2.5, 3);
    if (fx.kr() < 0.2) fx._blob(x + Math.cos(a) * w * 0.4, 0.8, z + Math.sin(a) * w * 0.4, Math.cos(a) * 1.2, fx.krand(0.5, 1.4), Math.sin(a) * 1.2, fx.krand(0.6, 1.0), 0.7, 1.6, 0.4, 0, K_SMOKE, 1.0, 0.2);
  }
  if (S.splashAcc > 6) S.splashAcc = 0;
}

// ---------------------------------------------------------------- the creature's fire
/**
 * Every frame it stands (k 0..1 how much of it is there): ?foxSpirit=a the mesh's fire: flames climbing
 * off its tail tips and along the tails' outer edges, the pool of fire round its feet it rose out of
 * (thick while it rises), the white-hot eye slits, the glow inside the open jaws. ?foxSpirit=b: the
 * fox itself, drawn from its skeleton (spirit.P): the head's profile, the ears, the neck and back, the
 * legs and each tail written as ink lines on the grid in steel and phase 3's fire, heat along the
 * tails and the body; and the same flames.
 */
export function spiritFire(fx, spirit, k, dt) {
  const P = spirit?.P;
  if (!fx?.fire || !P || !(k > 0.01) || !Number.isFinite(P.jaw.x + P.head.y)) return;
  const F = fx.FIRE3, S = scr(fx), life = fx._frame(), st = spirit.st ?? {}, rising = 1 - Math.min(1, fin(st.rise));
  // (what burns on its body is spawned a little toward the camera: inside the mesh the field's depth
  // test would fade it)
  const tc = fx._toCam(), cx0 = tc.x * 1.4, cy0 = tc.y * 1.4, cz0 = tc.z * 1.4;
  const b = spirit.mode === 'b';
  if (b && life > 0) inkFox(fx, P, k, life);
  if (life > 0) {
    // the eye slits, white-hot; the glow inside the jaws as they open
    for (const e of P.eye) if (e.y > 0.5) fx._dot(e.x + cx0, e.y + cy0, e.z + cz0, 0.5, 1.4 * k, K_STEEL);
    // each tail tipped with a bright blob of fire (the readable part of nine tails at the game camera)
    const tf = 0.85 + 0.15 * Math.sin((fx.game?.time ?? 0) * 9);
    for (const tail of P.tails) {
      const q = tail[tail.length - 1], q2 = tail[tail.length - 2];
      if (!(q.y > 0.6)) continue;
      const mx = (q.x * 2 + q2.x) / 3 + cx0, my = (q.y * 2 + q2.y) / 3 + cy0, mz = (q.z * 2 + q2.z) / 3 + cz0;
      fx._dot(mx, my, mz, 1.15, 0.7 * k * tf, F);
      fx._dot(mx, my, mz, 0.45, 1.05 * k * tf, K_STEEL);
    }
    const j = fin(st.jaw);
    if (j > 0.05 && P.jaw.y > 0.5) {
      const mx = (P.jaw.x + P.head.x) * 0.5, my = (P.jaw.y + P.head.y) * 0.5 - 0.2, mz = (P.jaw.z + P.head.z) * 0.5;
      fx._dot(mx, my, mz, 0.9, 0.45 * j * k, F);
    }
  }
  if (!(dt > 0)) return;
  // flames off the tail tips and the two outer joints
  S.tipAcc += dt * 150 * k;
  let g = 0;
  while (S.tipAcc >= 1 && g++ < 16) {
    S.tipAcc -= 1;
    const tail = P.tails[(fx.kr() * P.tails.length) | 0], q = tail[tail.length - 1 - ((fx.kr() * 2.6) | 0)];
    if (!(q.y > 0.5)) continue;
    fx._blob(q.x + cx0 + fx.krand(-0.3, 0.3), q.y + cy0 + fx.krand(-0.2, 0.3), q.z + cz0 + fx.krand(-0.3, 0.3), fx.krand(-0.4, 0.4), fx.krand(1.2, 2.6), fx.krand(-0.4, 0.4), fx.krand(0.35, 0.6), fx.krand(0.6, 0.95), 0.2, fx.krand(0.34, 0.46) * k, 0, F, 1.2, -0.4);
  }
  if (S.tipAcc > 16) S.tipAcc = 0;
  // flames licking along the tails and the back
  S.edgeAcc += dt * 110 * k;
  g = 0;
  while (S.edgeAcc >= 1 && g++ < 12) {
    S.edgeAcc -= 1;
    const tail = P.tails[(fx.kr() * P.tails.length) | 0], i = 1 + ((fx.kr() * (tail.length - 2)) | 0), f = fx.kr();
    const a = tail[i - 1], c = tail[i], x = a.x + (c.x - a.x) * f, y = a.y + (c.y - a.y) * f, z = a.z + (c.z - a.z) * f;
    if (!(y > 0.6)) continue;
    fx._blob(x + cx0 + fx.krand(-0.5, 0.5), y + cy0 + fx.krand(0, 0.6), z + cz0 + fx.krand(-0.5, 0.5), 0, fx.krand(0.8, 1.8), 0, fx.krand(0.3, 0.5), fx.krand(0.45, 0.75), 0.15, fx.krand(0.22, 0.32) * k, 0, F, 1.4, -0.3);
  }
  if (S.edgeAcc > 12) S.edgeAcc = 0;
  // the pool of fire round its feet (thick while it rises out of it)
  S.poolAcc += dt * (40 + 120 * rising) * Math.max(0.3, k + rising);
  g = 0;
  const cx = (P.paw[0].x + P.paw[1].x) * 0.5, cz = (P.paw[0].z + P.paw[1].z) * 0.5, bx = spirit.x, bz = spirit.z;
  while (S.poolAcc >= 1 && g++ < 14) {
    S.poolAcc -= 1;
    const f = fx.kr(), a = fx.kr() * TAU, r = fx.krand(0.5, 3.6);
    const x = bx + (cx - bx) * f + Math.cos(a) * r, z = bz + (cz - bz) * f + Math.sin(a) * r;
    fx._blob(x, 0.75 + fx.kr() * 0.3, z, fx.krand(-0.3, 0.3), fx.krand(1.2, 2.8), fx.krand(-0.3, 0.3), fx.krand(0.35, 0.7), fx.krand(0.6, 1.0), 0.25, fx.krand(0.32, 0.46), 0, F, 1.2, -0.5);
  }
  if (S.poolAcc > 14) S.poolAcc = 0;
  keep(fx, 'howlFox', P.chest.x, Math.max(1.5, P.chest.y), P.chest.z, 2.2 * k, 12, 0.3);
}

/**
 * ?foxSpirit=b: the fox written as ink on the grid and heat (held, this frame only). The head is the same
 * design as the body's, outlined in steel: the skull, the near ear (its far twin dimmer), the brow, the
 * muzzle to the nose, the upper lip back to the hinge, the lower jaw (it opens), the throat; a white-hot
 * eye. Then the neck, the breast and the legs as heat, and each tail a line of fire with heat along it.
 */
function inkFox(fx, P, k, life) {
  const F = fx.FIRE3;
  const line = (a, c, h, kind = F, h1 = h) => {
    if (a.y < 0.3 && c.y < 0.3) return;
    fx._ink(a.x, Math.max(0.3, a.y), a.z, c.x, Math.max(0.3, c.y), c.z, 0, h * k, 0, h1 * k, 0, kind);
  };
  // P.outline: head [0 throat, 1 back, 2 ear back root, 3 ear front root, 4 brow, 5 muzzle, 6 nose,
  // 7 under the nose, 8 lip, 9 hinge], jaw [10 hinge, 11 chin, 12 under, 13 root]
  const O = P.outline, H = 1.05;
  line(O[0], O[1], H, K_STEEL);
  line(O[1], O[2], H, K_STEEL);
  for (let e = 1; e >= 0; e--) {
    const h = e === 0 ? H : 0.7, tip = P.ear[e];
    line(O[2], tip, h, K_STEEL);
    line(tip, O[3], h, K_STEEL);
  }
  for (let i = 3; i < 9; i++) line(O[i], O[i + 1], H, K_STEEL);
  for (let i = 10; i < 13; i++) line(O[i], O[i + 1], 0.95, K_STEEL);
  line(O[13], O[0], 0.9, K_STEEL);
  // (the neck, the breast and the legs are heat only, below: lines there tangled with the head's)
  // each tail: a line of fire down its middle, heat along it, thicker in the middle of the plume
  for (const tail of P.tails) {
    for (let i = 0; i + 1 < tail.length; i++) {
      line(tail[i], tail[i + 1], 0.65);
      const m = tail[i], q = tail[i + 1], s = 0.7 + 0.8 * Math.sin((Math.PI * (i + 0.5)) / tail.length);
      if (m.y > 0.6) fx._blob((m.x + q.x) * 0.5, (m.y + q.y) * 0.5, (m.z + q.z) * 0.5, 0, 0, 0, life, s, s, 0.2 * k, 0.2 * k, F);
    }
  }
  // the body's heat (the chest; the head a little, inside its outline)
  fx._blob(P.chest.x, P.chest.y, P.chest.z, 0, 0, 0, life, 3.0, 3.0, 0.14 * k, 0.14 * k, F);
  fx._blob((P.chest.x + P.neck.x) * 0.5, (P.chest.y + P.neck.y) * 0.5, (P.chest.z + P.neck.z) * 0.5, 0, 0, 0, life, 2.2, 2.2, 0.12 * k, 0.12 * k, F);
  for (const p of P.paw) fx._blob((P.chest.x + p.x) * 0.5, Math.max(0.8, (P.chest.y + p.y) * 0.5), (P.chest.z + p.z) * 0.5, 0, 0, 0, life, 1.2, 1.2, 0.12 * k, 0.12 * k, F);
  fx._blob(P.head.x, P.head.y, P.head.z, 0, 0, 0, life, 1.6, 1.6, 0.12 * k, 0.12 * k, F);
}

/**
 * It goes up in embers (once, as the end begins): heat thrown up from every joint of it and its head, a
 * cloud of one-cell embers rising, a last light. ~200 blobs, ~80 embers.
 */
export function spiritEnd(fx, spirit) {
  const P = spirit?.P;
  if (!fx?.fire || !P) return;
  const F = fx.FIRE3, C = colOf(fx);
  const burst = (q, n, s) => {
    if (!(q.y > 0.4) || !Number.isFinite(q.x + q.y + q.z)) return;
    for (let i = 0; i < n; i++) {
      fx._blob(q.x + fx.krand(-s, s), q.y + fx.krand(-s, s), q.z + fx.krand(-s, s), fx.krand(-1, 1), fx.krand(1.5, 4), fx.krand(-1, 1), fx.krand(0.5, 1.0), fx.krand(0.6, 1.0), 0.2, fx.krand(0.32, 0.5), 0, F, 1.0, -1.2);
    }
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      const o = fx._rec(q.x + fx.krand(-s, s), q.y + fx.krand(-s, s), q.z + fx.krand(-s, s), fx.krand(0.9, 1.8), fx.krand(0.14, 0.22), 0.05, ".'*", C.ember, C.emberEnd);
      o.vx = fx.krand(-1.2, 1.2);
      o.vy = fx.krand(1.5, 4.5);
      o.vz = fx.krand(-1.2, 1.2);
      o.drag = 0.8;
      o.gravity = -0.6;
      o.flicker = 0.5;
      fx._spawn(fx.add, o);
    }
  };
  for (const tail of P.tails) for (let i = 1; i < tail.length; i += 2) burst(tail[i], 3, 0.5);
  burst(P.head, 16, 0.9);
  burst(P.neck, 10, 0.9);
  burst(P.chest, 18, 1.6);
  for (const e of P.ear) burst(e, 4, 0.3);
  fx._light?.({ x: P.chest.x, y: Math.max(1.5, P.chest.y), z: P.chest.z, color: C.light, intensity: 4, radius: 16, life: 0.5, fade: 0.6 });
}
