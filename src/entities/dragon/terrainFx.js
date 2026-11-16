// The terrain moves' effects (terrainAttacks.js / terrain.js; ADR-110, second pass): the wyrm's `fx`
// (fx.js DragonFx) is the first argument, as bulletFx.js does. Small things that fly on their own
// (grit, clods, root ends, splinters, leaves, sparks) are glyph particles about one letter cell big;
// fire and smoke are heat in the fire field (STYLE.md "The fire field"): a burning tree in the jaws,
// in the air, and its wreck where it lands print in the wyrm's small digits, never as big glyph
// sprites (ADR-113). No allocation: the fx's reused records (_rec / _blob) and colour scratch.
//
//   strain(fx, st, dt, b, k)                   the tug: grit jumps round its foot, the ground cracks
//   tearOut(fx, b, x, z, dx, dz)               torn free: roots, clods and dust burst from where it stood
//   pin(fx, x, z)                              a foreleg slams down to brace: a puff and grit
//   burnTrunk(fx, st, dt, bx, by, bz, ax, ay, az, b, k, vx, vz)   fire along a trunk (k: how much burns)
//   trail(fx, st, dt, x, y, z, ax, ay, az, b, vx, vy, vz)          a flying piece sheds grit and leaves
//   smashOn(fx, x, y, z, dx, dz, M)            it tears through what stood in its path: splinters
//   landing(fx, x, z, r, dx, dz, b, burning)   it lands with weight: a spray thrown on, clods, smoke
//   batBurst(fx, x, z, r, dx, dz, M)           the tail meets the boulder: chips and turf blasted off
//   pyre(fx, st, dt, x, z, r, live)            a burning wreck on the ground

const rand = (a, b) => a + Math.random() * (b - a);
const GRIT = ".,:'";
const CLODS = 'o0.,:;';
const ROOTS = "~/\\|)(j'";
const LEAVES = 'o0O8@&';
const SPLINTERS = "/\\|-!'";
const EMBERS = "*'.`";
const EARTH = [0.34, 0.27, 0.2];
const EARTH_END = [0.12, 0.1, 0.08];
const ROOT = [0.42, 0.33, 0.22];
const ROOT_END = [0.14, 0.1, 0.07];
const LEAF = [0.26, 0.42, 0.2];
const LEAF_END = [0.07, 0.11, 0.06];
const PALE = [0.42, 0.4, 0.37];
const PALE_END = [0.14, 0.13, 0.12];
const HOT = [3.4, 1.4, 0.35];
const DARK = [0.5, 0.06, 0.02];

/** One glyph particle (the fx's reused record), velocity, gravity, drag, spin; colour then spawned. */
function chip(fx, pool, x, y, z, vx, vy, vz, life, size, glyphs, c0, k0, c1, k1, gravity = -14, drag = 0.5) {
  const o = fx._rec(x, y, z, life, size, size * 0.35, glyphs);
  o.vx = vx;
  o.vy = vy;
  o.vz = vz;
  o.gravity = gravity;
  o.drag = drag;
  o.spin = rand(-7, 7);
  o.rot = rand(0, 6.283);
  fx._col(c0, k0, c1, k1);
  fx._spawn(pool, o);
}

/** The tug (k 0..1 of the strain): grit jumps round its foot, and a ring of cracked earth lifts. */
export function strain(fx, st, dt, b, k) {
  if (!b) return;
  st.strain = (st.strain ?? 0) + dt * 70 * (0.4 + k);
  let n = Math.min(6, Math.floor(st.strain));
  st.strain -= n;
  const r = b.r + 0.3;
  while (n-- > 0) {
    const a = Math.random() * 6.283, rr = r * rand(0.7, 1.5);
    chip(fx, fx.alpha, b.x + Math.cos(a) * rr, 0.08, b.z + Math.sin(a) * rr, Math.cos(a) * rand(0.2, 1.2), rand(1.5, 3.6) * (0.6 + k), Math.sin(a) * rand(0.2, 1.2), rand(0.35, 0.6), rand(0.28, 0.4), CLODS, EARTH, 1.3, EARTH_END, 1);
  }
}

/** Torn free: root ends whip out of the hole, clods and grit burst, a ring of dust rolls out. */
export function tearOut(fx, b, x, z, dx = 0, dz = 0) {
  if (!b) return;
  const tall = b.h >= 3, r = b.r + 0.4;
  // root ends: thin strokes flung up and out, falling back (a tree; a boulder leaves only clods)
  const roots = tall ? 16 : 4;
  for (let i = 0; i < roots; i++) {
    const a = Math.random() * 6.283, sp = rand(2, 6);
    chip(fx, fx.alpha, x + Math.cos(a) * r * 0.6, rand(0.1, 0.6), z + Math.sin(a) * r * 0.6, Math.cos(a) * sp - dx * 1.5, rand(3, 8), Math.sin(a) * sp - dz * 1.5, rand(0.6, 1.0), rand(0.36, 0.5), ROOTS, ROOT, 1.4, ROOT_END, 1, -16, 0.8);
  }
  // clods and grit: a fountain out of the hole
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.283, sp = rand(1, 5);
    chip(fx, fx.alpha, x + Math.cos(a) * r * 0.5, rand(0.1, 0.5), z + Math.sin(a) * r * 0.5, Math.cos(a) * sp, rand(3, 9), Math.sin(a) * sp, rand(0.5, 1.0), rand(0.3, 0.46), i % 3 ? GRIT : CLODS, EARTH, 1.4, EARTH_END, 1, -18, 0.4);
  }
  // the bark cracks: splinters off the trunk where the jaws hold it (a tree)
  if (tall) {
    for (let i = 0; i < 8; i++) chip(fx, fx.alpha, x + rand(-0.4, 0.4), rand(0.8, 2.2), z + rand(-0.4, 0.4), rand(-2.5, 2.5), rand(1, 4), rand(-2.5, 2.5), rand(0.4, 0.7), rand(0.3, 0.42), SPLINTERS, b.M?.color ?? PALE, 1.4, b.M?.colorEnd ?? PALE_END, 1);
  }
  fx.dustRing?.(x, z, r + 0.6, 26, 0.85);
  // a cloud of earth-smoke thrown up where it stood (the fire field's grey): it climbs with the
  // piece and hangs for a moment, a pale column the eye finds at the game camera
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * 6.283, up = rand(0, 1);
    fx._blob(x + Math.cos(a) * r * rand(0.2, 1.1), rand(0.3, 1.2) + up * 2.5, z + Math.sin(a) * r * rand(0.2, 1.1), Math.cos(a) * rand(0.6, 2) - dx * 1.2, rand(1.2, 4.5) * (0.4 + up), Math.sin(a) * rand(0.6, 2) - dz * 1.2, rand(1.3, 2.1), rand(1.2, 1.8), rand(3, 4.2), 0.5, 0, 2.2, 0, 1);
  }
  // and a ring of clods flung wide that bounce out from it
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * 6.283, sp = rand(4, 8);
    chip(fx, fx.alpha, x + Math.cos(a) * r * 0.6, 0.3, z + Math.sin(a) * r * 0.6, Math.cos(a) * sp, rand(2, 5), Math.sin(a) * sp, rand(0.6, 1.0), rand(0.4, 0.52), CLODS, EARTH, 1.8, EARTH_END, 1, -18, 0.3);
  }
}

/** A foreleg slams down to brace against the pull. */
export function pin(fx, x, z) {
  fx.dustRing?.(x, z, 0.9, 12, 0.5);
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * 6.283;
    chip(fx, fx.alpha, x + Math.cos(a) * 0.5, 0.1, z + Math.sin(a) * 0.5, Math.cos(a) * rand(0.5, 2), rand(1.5, 3.5), Math.sin(a) * rand(0.5, 2), rand(0.35, 0.55), rand(0.28, 0.38), GRIT, EARTH, 1.2, EARTH_END, 1);
  }
}

/**
 * Fire along a trunk: its foot at (bx, by, bz), its axis (ax, ay, az); k 0..1 = how much of it burns
 * (from the foot up). (vx, vz): the piece's own velocity: a flying brand leaves its heat behind (a
 * blob is born still and lags), so it streaks. Heat in the fire field: blobs 0.8 - 1.6 m across.
 */
export function burnTrunk(fx, st, dt, bx, by, bz, ax, ay, az, b, k, vx = 0, vz = 0) {
  if (!b || !(k > 0)) return;
  st.acc = (st.acc ?? 0) + dt * (50 + b.h * 16) * k;
  let n = Math.min(14, Math.floor(st.acc));
  st.acc -= n;
  const wide = b.leafy > 0 ? b.r * 2.4 : b.r * 1.2;
  while (n-- > 0) {
    const u = Math.random() * k, hot = Math.random();
    const rr = (u > 0.45 ? wide : b.r) * Math.sqrt(Math.random()), a = Math.random() * 6.283;
    fx._blob(
      bx + ax * b.h * u + Math.cos(a) * rr, Math.max(0.4, by + ay * b.h * u), bz + az * b.h * u + Math.sin(a) * rr,
      vx * 0.15 + rand(-0.4, 0.4), rand(1.2, 2.8), vz * 0.15 + rand(-0.4, 0.4),
      rand(0.3, 0.55), rand(0.8, 1.2) + hot * 0.4, 0.4, 0.46 + hot * 0.14, 0, 1.2, 2,
    );
  }
  // embers thrown off it (one letter cell each)
  st.emb = (st.emb ?? 0) + dt * 18 * k;
  let m = Math.min(3, Math.floor(st.emb));
  st.emb -= m;
  while (m-- > 0) {
    const u = Math.random() * k;
    chip(fx, fx.add, bx + ax * b.h * u, by + ay * b.h * u, bz + az * b.h * u, vx * 0.2 + rand(-1.5, 1.5), rand(1, 4), vz * 0.2 + rand(-1.5, 1.5), rand(0.5, 0.9), rand(0.2, 0.3), EMBERS, HOT, 1, DARK, 1.2, -4, 0.8);
  }
}

/** A flying piece sheds grit and leaves along its length. */
export function trail(fx, st, dt, x, y, z, ax, ay, az, b, vx, vy, vz) {
  if (!b) return;
  st.acc = (st.acc ?? 0) + dt * 40;
  let n = Math.min(4, Math.floor(st.acc));
  st.acc -= n;
  while (n-- > 0) {
    const u = Math.random(), leaf = b.leafy > 0 && u > 0.4;
    chip(
      fx, fx.alpha, x + ax * b.h * u + rand(-0.4, 0.4), y + ay * b.h * u + rand(-0.4, 0.4), z + az * b.h * u + rand(-0.4, 0.4),
      vx * 0.25 + rand(-1, 1), vy * 0.2 + rand(-0.5, 1.5), vz * 0.25 + rand(-1, 1), rand(0.5, 0.9), rand(0.3, 0.44),
      leaf ? LEAVES : b.M?.chips ?? GRIT, leaf ? LEAF : b.M?.color ?? PALE, leaf ? 1 : 1, leaf ? LEAF_END : b.M?.colorEnd ?? PALE_END, 1, leaf ? -4 : -12, leaf ? 1.5 : 0.5,
    );
  }
}

/**
 * The wake of a thrown piece: grey dust left hanging along its path this frame (the fire field's
 * smoke kind, lagging and spreading as it fades), from (x0, y0, z0) to (x1, y1, z1). The throw is
 * read as a line through the air for the half second it flies.
 */
export function streak(fx, x0, y0, z0, x1, y1, z1, b) {
  const l = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const n = Math.min(4, Math.max(1, Math.round(l / 0.6)));
  const w = Math.max(0.5, Math.min(1.4, (b?.r ?? 0.5) * 1.6));
  for (let i = 0; i < n; i++) {
    const u = (i + Math.random()) / n;
    fx._blob(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, rand(-0.3, 0.3), rand(-0.2, 0.4), rand(-0.3, 0.3), rand(0.45, 0.7), w, w * 2.2, 0.5, 0, 1.5, 0, 1);
  }
}

/**
 * Light catching the piece in the jaws / in the air: a thin line of heat along its axis in the fire
 * field's steel (crisp: a thin line prints as the stroke that runs along it), born and gone within a
 * frame or two, so the trunk prints in pale digits on its dark body ("brighter digits only where
 * light catches"). A boulder: a few round its middle. k scales it (0..1).
 */
export function catchLight(fx, bx, by, bz, ax, ay, az, b, k = 1) {
  if (!b || !(k > 0)) return;
  if (b.h >= 3) {
    const n = Math.min(12, Math.max(3, Math.round(b.h / 0.7)));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      fx._blob(bx + ax * b.h * u, by + ay * b.h * u, bz + az * b.h * u, 0, 0, 0, 0.09, 0.8, 0.6, 0.42 * k, 0.3 * k, 0, 0, 3);
    }
  } else {
    const c = b.h * 0.5;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.283;
      fx._blob(bx + ax * c + Math.cos(a) * b.r * 0.6, by + ay * c, bz + az * c + Math.sin(a) * b.r * 0.6, 0, 0, 0, 0.09, 0.9, 0.7, 0.38 * k, 0.28 * k, 0, 0, 3);
    }
  }
}

/** It tears through something standing in its path: splinters and chips fly on with it. */
export function smashOn(fx, x, y, z, dx, dz, M) {
  for (let i = 0; i < 14; i++) {
    const sp = rand(3, 9);
    chip(fx, fx.alpha, x + rand(-0.5, 0.5), Math.max(0.3, y + rand(-0.8, 0.8)), z + rand(-0.5, 0.5), dx * sp + rand(-2, 2), rand(1, 5), dz * sp + rand(-2, 2), rand(0.5, 0.9), rand(0.3, 0.44), M?.chips ?? SPLINTERS, M?.color ?? PALE, 1.4, M?.colorEnd ?? PALE_END, 1);
  }
}

/**
 * It lands with weight at (x, z), travelling along (dx, dz): a spray of earth thrown on the way it
 * was going, clods, a skirt of dust, a column of earth-smoke; a burning piece also a burst of embers.
 */
export function landing(fx, x, z, r, dx, dz, b, burning = false) {
  fx.dustRing?.(x, z, r * 0.55, 34, 1.0);
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * 6.283, sp = rand(1.5, 5), fw = rand(2, 9);
    chip(fx, fx.alpha, x + Math.cos(a) * 0.6, rand(0.1, 0.6), z + Math.sin(a) * 0.6, Math.cos(a) * sp + dx * fw, rand(3, 9), Math.sin(a) * sp + dz * fw, rand(0.5, 1.1), rand(0.3, 0.48), i % 2 ? CLODS : GRIT, EARTH, 1.5, EARTH_END, 1, -18, 0.4);
  }
  if (b && b.h >= 3) for (let i = 0; i < 10; i++) {
    const sp = rand(3, 8);
    chip(fx, fx.alpha, x + rand(-1, 1), rand(0.4, 1.6), z + rand(-1, 1), dx * sp + rand(-2.5, 2.5), rand(2, 6), dz * sp + rand(-2.5, 2.5), rand(0.5, 0.9), rand(0.3, 0.42), b.leafy > 0 && i % 2 ? LEAVES : SPLINTERS, b.leafy > 0 && i % 2 ? LEAF : b.M?.color ?? PALE, 1.4, b.leafy > 0 && i % 2 ? LEAF_END : b.M?.colorEnd ?? PALE_END, 1);
  }
  // the earth-smoke (grey in the fire field) rolls on along the throw
  for (let i = 0; i < 9; i++) fx._blob(x + rand(-1, 1) * r * 0.4, rand(0.4, 1.2), z + rand(-1, 1) * r * 0.4, dx * rand(1, 3) + rand(-1, 1), rand(0.8, 2.2), dz * rand(1, 3) + rand(-1, 1), rand(1.0, 1.6), 1.4, 3.6, 0.44, 0, 1.0, 0, 1);
  if (burning) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.283, sp = rand(2, 7);
      chip(fx, fx.add, x, 0.6, z, Math.cos(a) * sp + dx * 3, rand(4, 10), Math.sin(a) * sp + dz * 3, rand(0.7, 1.3), rand(0.2, 0.32), EMBERS, HOT, 1, DARK, 1.2, -15, 0.7);
    }
  }
}

/** The tail meets the boulder: stone chips and turf blasted off the way it is batted. */
export function batBurst(fx, x, z, r, dx, dz, M) {
  fx.dustRing?.(x, z, r + 0.4, 26, 0.85);
  for (let i = 0; i < 20; i++) {
    const sp = rand(3, 10), a = rand(-0.9, 0.9), c = Math.cos(a), s = Math.sin(a);
    const vx = (dx * c - dz * s) * sp, vz = (dz * c + dx * s) * sp;
    chip(fx, fx.alpha, x + rand(-0.4, 0.4), rand(0.2, 0.9), z + rand(-0.4, 0.4), vx, rand(1.5, 6), vz, rand(0.4, 0.8), rand(0.28, 0.42), i % 3 ? M?.chips ?? GRIT : CLODS, i % 3 ? M?.color ?? PALE : EARTH, 1.5, i % 3 ? M?.colorEnd ?? PALE_END : EARTH_END, 1, -16, 0.4);
  }
  for (let i = 0; i < 4; i++) fx._blob(x + rand(-0.6, 0.6), rand(0.3, 0.8), z + rand(-0.6, 0.6), dx * rand(1, 3), rand(0.5, 1.4), dz * rand(1, 3), rand(0.7, 1.1), 1.0, 2.6, 0.4, 0, 1.2, 0, 1);
}

/** A burning wreck: heat over its disc, climbing (live 1 → 0 as it burns down). */
export function pyre(fx, st, dt, x, z, r, live) {
  st.acc += dt * 26 * r * live;
  let n = Math.min(14, Math.floor(st.acc));
  st.acc -= n;
  while (n-- > 0) {
    const a = Math.random() * 6.283, rr = r * Math.sqrt(Math.random()), hot = Math.random();
    fx._blob(
      x + Math.cos(a) * rr, rand(0.4, 0.9), z + Math.sin(a) * rr, rand(-0.3, 0.3), rand(1.4, 3.4) * (0.5 + 0.5 * live), rand(-0.3, 0.3),
      rand(0.35, 0.7), rand(0.9, 1.4) + hot * 0.4, 0.4, (0.42 + hot * 0.16) * (0.6 + 0.4 * live), 0, 1, 1.6,
    );
  }
  // smoke over it as it dies down
  st.smoke = (st.smoke ?? 0) + dt * 5 * (1.2 - live);
  if (st.smoke >= 1) {
    st.smoke -= 1;
    fx._blob(x + rand(-0.5, 0.5) * r, rand(1.5, 2.5), z + rand(-0.5, 0.5) * r, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(1.2, 1.8), 1.4, 3.4, 0.4, 0, 0.6, 0, 1);
  }
}
