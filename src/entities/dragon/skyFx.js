// The apocalypse's sky and its meteors (2026-11-15, second pass; the owner: "his animation and
// shooting fire into the sky for the apocalypse needs to be improved"). Plain functions over the
// wyrm's DragonFx instance (`fx`), the pattern bulletFx.js uses: they reuse its spawn records
// (_blob for heat in the fire field, _rec / _col / _spawn for glyph particles), its pooled lights
// (_light) and keep their own state on `fx._sky` (made once): nothing here allocates per frame.
//
// Everything that burns is heat in the fire field (docs/STYLE.md "The fire field"): many cool blobs
// that overlap into a body with a hot heart and a ragged rim, never one big hot blob. Embers, rocks
// and dust are glyph particles about one cell in size, from the world atlas.
//
//   skyBolt      one of the salvo: a COLUMN of fire climbing out of the frame (its tail hangs where
//                it passed, so the column stands for a moment) under a tumbling head
//   skyPillar    (look b) one sustained roar of fire straight up out of the jaws, held every frame
//   skyDeck      the sky answering: a burning cloud deck along the top of the frame (drawn on a
//                plane above the fight, placed along the camera's own rays so it stays in view),
//                rents of light tearing open in it, embers raining down out of it
//   skyMeteor    a meteor whose head is a body of fire (cooler blobs tumbling round a small heart), a
//                long hanging tail and smoke
//   skyImpact    the strike: a ball of fire, a ground wave, a cone of rock and dirt, a column of smoke
//   skyCrater    the crater smoulders (or burns: P3)
//   skyThroat    the chest and the throat filling with fire before a cast
// skyUpdate(fx, dt) runs the bolts and the deck every frame (hazards.update calls it).
//
// The look of the whole move: ?apoc=a|b|c (APOC_LOOK; read once, the pattern of FLARE_LOOK).
//   a  the salvo: a dozen columns of fire torn up into the sky, the deck flares up over the clearing
//   b  the pillar: one sustained column roared up; the ceiling spreads out from the top of it
//   c  the flight: it takes off, hangs over the clearing and rains the salvo up from the air

import { TUNING } from './tuning.js';

export const APOC_LOOK = (() => {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get('apoc');
    return v === 'b' || v === 'c' ? v : 'a';
  } catch {
    return 'a';
  }
})();

const EMBER = ".'`*";
const ROCK = '.,:;o';
const HOT = [4.6, 3.5, 1.5];
const DARK = [0.8, 0.08, 0.012];
const EMBER_COL = [3.0, 1.0, 0.18];
const ASH_COL = [1.2, 0.35, 0.06];
const ROCK_COL = [0.17, 0.14, 0.12];
const DIRT_COL = [0.12, 0.09, 0.07];
const FIRE_BLOW = Object.freeze({ kind: 'blast', by: 'boss' });
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const MAX_BOLTS = 20;

/** The sky's state, made once per DragonFx. */
function sky(fx) {
  let s = fx._sky;
  if (!s) {
    s = fx._sky = {
      bolts: Array.from({ length: MAX_BOLTS }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, hold: 0, acc: 0, seed: 0, k: 1 })),
      deck: 0, // the deck's strength shown (eases toward want)
      want: 0, // asked this frame (skyDeck), cleared every update
      wantHold: 0,
      cx: 0,
      cz: 0,
      spread: 1, // 0..1: how far over the frame the deck has spread from (cx, cz)
      accSmoke: 0,
      accFire: 0,
      accRent: 0,
      accRain: 0,
      accPillar: 0,
      accCore: 0,
      accThroat: 0,
      rentT: 0,
      light: null,
      ray: { x: 0, y: 0, z: 0 },
      m: new Float64Array(16),
    };
  }
  return s;
}

/** Forget every bolt and the deck (a reset, a death, a phase change). */
export function skyReset(fx) {
  const s = fx?._sky;
  if (!s) return;
  for (const b of s.bolts) b.alive = false;
  s.deck = s.want = s.wantHold = 0;
  s.light?.kill?.();
  s.light = null;
}

// ------------------------------------------------------------------ the salvo
/** One bolt of the salvo (visual only): a column of fire climbing out of the frame. `k` scales it. */
export function skyBolt(fx, x, y, z, vx, vy, vz, k = 1) {
  if (!Number.isFinite(x + y + z + vx + vy + vz)) return;
  const s = sky(fx);
  let b = null;
  for (const c of s.bolts) if (!c.alive) {
    b = c;
    break;
  }
  if (!b) return;
  b.alive = true;
  b.x = x;
  b.y = y;
  b.z = z;
  b.vx = vx;
  b.vy = vy;
  b.vz = vz;
  b.age = 0;
  b.hold = 0;
  b.acc = 0;
  b.seed = Math.random() * 100;
  b.k = k;
  // the muzzle: a gout of fire torn off the jaws as it leaves, sparks flung out
  for (let i = 0; i < 10; i++) {
    fx._blob(x + rand(-0.3, 0.3), y + rand(-0.2, 0.4), z + rand(-0.3, 0.3), vx * 0.12 + rand(-4, 4), vy * 0.1 + rand(0, 4), vz * 0.12 + rand(-4, 4), rand(0.2, 0.38), rand(0.8, 1.1), rand(1.6, 2.2), 0.34, 0, 3, 1);
  }
  for (let i = 0; i < 6; i++) {
    const o = fx._rec(x, y, z, rand(0.4, 0.8), rand(0.22, 0.32), 0.06, EMBER);
    o.vx = vx * 0.15 + rand(-6, 6);
    o.vy = rand(2, 9);
    o.vz = vz * 0.15 + rand(-6, 6);
    o.drag = 1.1;
    o.gravity = -10;
    o.flicker = 0.4;
    fx._col(HOT, 1, DARK, 1);
    fx._spawn(fx.add, o);
  }
}

function updateBolts(fx, s, dt) {
  for (const b of s.bolts) {
    if (!b.alive) continue;
    b.age += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.age > 1.4 || b.y > 70 || !Number.isFinite(b.x + b.y + b.z)) {
      b.alive = false;
      continue;
    }
    const vl = Math.hypot(b.vx, b.vy, b.vz) || 1;
    const ux = b.vx / vl, uy = b.vy / vl, uz = b.vz / vl;
    const life = fx._hold(b, 'hold', dt);
    const k = b.k;
    if (life) {
      // the head: cooler blobs tumbling round a small hot heart (never one white disc)
      fx._blob(b.x, b.y, b.z, 0, 0, 0, life, 0.8 * k, 0.8 * k, 0.55, 0.55);
      for (let i = 0; i < 5; i++) {
        const a = b.age * 9 + b.seed + i * 1.257, r = 0.45 * k;
        fx._blob(b.x + Math.cos(a) * r - ux * i * 0.35, b.y + Math.sin(a * 1.3) * r - uy * i * 0.35, b.z + Math.sin(a) * r - uz * i * 0.35, 0, 0, 0, life, (1.3 - i * 0.1) * k, (1.3 - i * 0.1) * k, 0.3, 0.3);
      }
    }
    // the column: fire left hanging where the head passed, swelling and cooling, licking upward
    b.acc += dt * 150 * k;
    let m = Math.min(12, Math.floor(b.acc));
    b.acc -= m;
    while (m-- > 0) {
      const back = rand(0, vl * dt * 1.2 + 0.6);
      fx._blob(
        b.x - ux * back + rand(-0.25, 0.25), b.y - uy * back + rand(-0.25, 0.25), b.z - uz * back + rand(-0.25, 0.25),
        rand(-0.8, 0.8), rand(0.5, 3), rand(-0.8, 0.8),
        rand(0.45, 0.85), rand(0.8, 1.1) * k, rand(1.8, 2.6) * k, 0.3, 0, 1.2, 1.5,
      );
    }
  }
}

// ------------------------------------------------------------------ look b: the pillar
/**
 * One frame of the sustained pillar roared straight up out of the jaws at `mouth` (strength k 0..1):
 * a stream of overlapping blobs climbing ~40 m/s, swelling and cooling, a thin hot vein in it.
 */
export function skyPillar(fx, dt, mouth, k = 1) {
  if (!mouth || !Number.isFinite(mouth.x + mouth.y + mouth.z) || !(k > 0)) return;
  const s = sky(fx);
  s.accPillar += dt * 260 * k;
  let n = Math.min(14, Math.floor(s.accPillar));
  s.accPillar -= n;
  while (n-- > 0) {
    const sp = rand(32, 44);
    fx._blob(
      mouth.x + rand(-0.3, 0.3), mouth.y + rand(0, 0.6), mouth.z + rand(-0.3, 0.3),
      rand(-1.6, 1.6), sp, rand(-1.6, 1.6),
      rand(0.6, 0.95), rand(0.9, 1.2), rand(2.4, 3.4), Math.random() < 0.3 ? 0.42 : 0.3, 0.02, 0.4, 0,
    );
  }
  s.accCore += dt * 70 * k;
  n = Math.min(5, Math.floor(s.accCore));
  s.accCore -= n;
  while (n-- > 0) {
    fx._blob(mouth.x + rand(-0.08, 0.08), mouth.y + 0.3, mouth.z + rand(-0.08, 0.08), rand(-0.3, 0.3), rand(44, 52), rand(-0.3, 0.3), rand(0.35, 0.55), 0.6, 1.2, 0.55, 0.1, 0.2, 0);
  }
  // spray off the jaws
  if (Math.random() < dt * 40) {
    const o = fx._rec(mouth.x, mouth.y + 0.3, mouth.z, rand(0.4, 0.8), rand(0.22, 0.32), 0.05, EMBER);
    o.vx = rand(-7, 7);
    o.vy = rand(4, 14);
    o.vz = rand(-7, 7);
    o.drag = 1;
    o.gravity = -12;
    o.flicker = 0.4;
    fx._col(HOT, 1, DARK, 1);
    fx._spawn(fx.add, o);
  }
}

/**
 * The chest and the throat filling with fire before a cast (k 0..1): heat crawling up the neck from
 * the chest to the jaws, small and cool (it is a glow under the scales, not a flame), embers off it.
 */
export function skyThroat(fx, dt, chest, mouth, k) {
  if (!chest || !mouth || !Number.isFinite(chest.x + chest.y + chest.z + mouth.x + mouth.y + mouth.z) || !(k > 0)) return;
  const s = sky(fx);
  s.accThroat += dt * (20 + 70 * k);
  let n = Math.min(8, Math.floor(s.accThroat));
  s.accThroat -= n;
  while (n-- > 0) {
    // the glow climbs: lower along the neck early, up to the jaws as it fills
    const u = Math.min(1, Math.random() * (0.35 + 0.75 * k));
    const x = chest.x + (mouth.x - chest.x) * u, y = chest.y + (mouth.y - chest.y) * u, z = chest.z + (mouth.z - chest.z) * u;
    fx._blob(x + rand(-0.5, 0.5), y + rand(-0.3, 0.3), z + rand(-0.5, 0.5), rand(-0.3, 0.3), rand(0.5, 2), rand(-0.3, 0.3), rand(0.25, 0.45), rand(0.7, 1.0), 0.4, 0.14 + 0.16 * k, 0, 0.8, 1);
  }
}

// ------------------------------------------------------------------ the sky answers
/**
 * Ask for the burning deck this frame: strength k (0..1), spreading from over (cx, cz) (`spread`
 * 0..1 of the frame; 1 = everywhere). Called every frame while it should show; it fades when not.
 */
export function skyDeck(fx, k, cx = 0, cz = 0, spread = 1) {
  const s = sky(fx);
  if (!(k > s.want)) return;
  s.want = Math.min(1, k);
  s.wantHold = 0.2;
  if (Number.isFinite(cx + cz)) {
    s.cx = cx;
    s.cz = cz;
  }
  s.spread = Math.max(0, Math.min(1, spread));
}

/** World point where the camera's ray through NDC (u, v) meets the plane y = H (into s.ray); false if none. */
function rayAt(fx, s, u, v, H) {
  const cam = fx.game.camera;
  const e = cam?.matrixWorld?.elements, pi = cam?.projectionMatrixInverse?.elements;
  if (!e || !pi) return false;
  // a point on the ray in view space (z = -1 plane of the projection), then to world
  const cx = pi[0] * u + pi[4] * v + pi[8] * -1 + pi[12], cy = pi[1] * u + pi[5] * v + pi[9] * -1 + pi[13];
  const cz = pi[2] * u + pi[6] * v + pi[10] * -1 + pi[14], cw = pi[3] * u + pi[7] * v + pi[11] * -1 + pi[15];
  if (!(Math.abs(cw) > 1e-9)) return false;
  const vx = cx / cw, vy = cy / cw, vz = cz / cw;
  const dx = e[0] * vx + e[4] * vy + e[8] * vz, dy = e[1] * vx + e[5] * vy + e[9] * vz, dz = e[2] * vx + e[6] * vy + e[10] * vz;
  const ox = e[12], oy = e[13], oz = e[14];
  if (!(dy < -1e-4) || !(oy > H + 1)) return false;
  const t = (H - oy) / dy;
  s.ray.x = ox + dx * t;
  s.ray.y = H;
  s.ray.z = oz + dz * t;
  return Number.isFinite(s.ray.x + s.ray.z);
}

function updateDeck(fx, s, dt) {
  s.wantHold -= dt;
  const want = s.wantHold > 0 ? s.want : 0;
  s.deck += (want - s.deck) * (1 - Math.exp(-(want > s.deck ? 2.2 : 1.2) * dt));
  if (s.wantHold <= 0) s.want = 0;
  const k = s.deck;
  if (k < 0.02) {
    if (s.light) {
      s.light.kill?.();
      s.light = null;
    }
    return;
  }
  const cam = fx.game.camera;
  const camY = cam?.matrixWorld?.elements?.[13];
  if (!Number.isFinite(camY)) return;
  // the deck hangs about half way up to the camera (a phone's close camera: lower), along the top
  // of the frame: NDC v 0.62 .. 1.1, a little past both sides
  const H = Math.max(6, Math.min(15, camY * 0.48));
  const reach = 8 + 60 * s.spread;
  // smoke: the dark belly of the cloud
  s.accSmoke += dt * 34 * k;
  let n = Math.min(6, Math.floor(s.accSmoke));
  s.accSmoke -= n;
  while (n-- > 0) {
    if (!rayAt(fx, s, rand(-1.25, 1.25), rand(0.7, 1.12), H + rand(-1, 1.5))) continue;
    if (Math.hypot(s.ray.x - s.cx, s.ray.z - s.cz) > reach) continue;
    fx._blob(s.ray.x, s.ray.y, s.ray.z, rand(-1, 1), rand(-0.2, 0.3), rand(-1, 1), rand(2.4, 3.4), rand(4, 6), rand(6, 8), 0.55, 0.3, 0.2, 0, 1);
  }
  // fire rolling under it: cool (red strokes, orange digits), a few hotter knots
  s.accFire += dt * 80 * k;
  n = Math.min(10, Math.floor(s.accFire));
  s.accFire -= n;
  while (n-- > 0) {
    if (!rayAt(fx, s, rand(-1.25, 1.25), rand(0.66, 1.1), H + rand(-1.5, 0.5))) continue;
    if (Math.hypot(s.ray.x - s.cx, s.ray.z - s.cz) > reach) continue;
    const hot = Math.random() < 0.15;
    fx._blob(s.ray.x, s.ray.y, s.ray.z, rand(-1.5, 1.5), rand(-0.6, 0.4), rand(-1.5, 1.5), rand(1.2, 2.2), rand(2.4, 3.6), rand(3.6, 5), (hot ? 0.42 : 0.24) * (0.6 + 0.4 * k), 0, 0.3, 0);
  }
  // rents of light: a seam tears open, a jagged line of hot blobs that flares and closes
  s.rentT -= dt;
  if (s.rentT <= 0 && k > 0.3) {
    s.rentT = rand(0.18, 0.5) / k;
    if (rayAt(fx, s, rand(-1, 1), rand(0.72, 1.02), H - 0.5) && Math.hypot(s.ray.x - s.cx, s.ray.z - s.cz) <= reach) {
      let x = s.ray.x, z = s.ray.z;
      const a = rand(0, TAU), len = rand(6, 14), steps = Math.round(len / 0.8);
      let dx = Math.cos(a), dz = Math.sin(a);
      for (let i = 0; i < steps; i++) {
        fx._blob(x, H - 0.6, z, 0, -0.2, 0, rand(0.25, 0.45), 1.0, 1.5, i % 3 === 0 ? 0.62 : 0.5, 0.05, 0, 0);
        const turn = rand(-0.5, 0.5);
        const c = Math.cos(turn), sn = Math.sin(turn);
        const nx = dx * c - dz * sn;
        dz = dx * sn + dz * c;
        dx = nx;
        x += dx * 0.8;
        z += dz * 0.8;
      }
    }
  }
  // embers and burning ash raining out of it over the fight
  s.accRain += dt * 46 * k;
  n = Math.min(6, Math.floor(s.accRain));
  s.accRain -= n;
  while (n-- > 0) {
    if (!rayAt(fx, s, rand(-1.1, 1.1), rand(-0.9, 1.0), H - 1)) continue;
    const o = fx._rec(s.ray.x, s.ray.y, s.ray.z, rand(1.4, 2.2), rand(0.22, 0.32), 0.18, EMBER);
    o.vx = rand(-1.2, 1.2);
    o.vy = rand(-7, -4);
    o.vz = rand(-1.2, 1.2);
    o.flicker = 0.5;
    if (Math.random() < 0.6) fx._col(EMBER_COL, 0.9, DARK, 0.6);
    else fx._col(ASH_COL, 0.7, DARK, 0.3);
    fx._spawn(fx.add, o);
  }
  // the light of it over the clearing (one big warm flickering light, from above)
  if (s.light?.dead) s.light = null;
  if (!s.light) s.light = fx._light({ x: s.cx, y: 18, z: s.cz, color: [1, 0.45, 0.14], intensity: 0, radius: 60, flicker: 0.35 });
  if (s.light) {
    s.light.set?.(s.cx, 18, s.cz);
    s.light.intensity = 2.6 * k;
  }
}

/** Every frame (hazards.update): the bolts and the deck. Never throws. */
export function skyUpdate(fx, dt) {
  if (!fx || !(dt > 0)) return;
  const s = fx._sky;
  if (!s) return;
  try {
    updateBolts(fx, s, dt);
    updateDeck(fx, s, dt);
  } catch (err) {
    console.error('[dragon] sky update failed', err);
    skyReset(fx);
  }
}

// ------------------------------------------------------------------ meteors
/**
 * A falling meteor at (x, y, z) moving along (vx, vy, vz), drawn `size` x: a head that is a body of
 * fire (cooler blobs tumbling round a small heart), a long tail left hanging along its path, smoke
 * behind, embers torn off, its own light (none when h.dark).
 */
export function skyMeteor(fx, life, h, dt, x, y, z, vx, vy, vz, size = 1) {
  if (!Number.isFinite(x + y + z + vx + vy + vz)) return;
  const s = size;
  const vl = Math.hypot(vx, vy, vz) || 1;
  const ux = vx / vl, uy = vy / vl, uz = vz / vl;
  if (life) {
    fx._blob(x, y, z, 0, 0, 0, life, 1.0 * s, 1.0 * s, 0.6, 0.6);
    for (let i = 0; i < 7; i++) {
      const a = h.t * 6.5 + h.seed + i * 0.898, r = (0.5 + 0.12 * (i % 3)) * s;
      const back = i * 0.3 * s;
      fx._blob(
        x + Math.cos(a) * r - ux * back, y + Math.sin(a * 1.7) * r * 0.8 - uy * back, z + Math.sin(a) * r - uz * back,
        0, 0, 0, life, (1.6 - i * 0.08) * s, (1.6 - i * 0.08) * s, 0.3 - i * 0.015, 0.3 - i * 0.015,
      );
    }
  }
  // the tail: fire shed along the way it came, hanging, swelling, burning out
  h.acc += dt * 100 * Math.min(1.6, s);
  let m = Math.min(12, Math.floor(h.acc));
  h.acc -= m;
  while (m-- > 0) {
    const back = rand(0.8, 3.5) * s;
    fx._blob(
      x - ux * back + rand(-0.35, 0.35) * s, y - uy * back + rand(-0.35, 0.35) * s, z - uz * back + rand(-0.35, 0.35) * s,
      ux * 2 + rand(-0.8, 0.8), uy * 2 + rand(0, 1.5), uz * 2 + rand(-0.8, 0.8),
      rand(0.4, 0.75), rand(1.1, 1.5) * s, rand(2.0, 2.8) * s, 0.3, 0, 1.6, 1.2,
    );
    if (m % 4 === 0) {
      const o = fx._rec(x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), z + rand(-0.4, 0.4), rand(0.5, 0.9), rand(0.22, 0.3), 0.05, EMBER);
      o.vx = ux * 4 + rand(-3, 3);
      o.vy = uy * 4 + rand(-1, 3);
      o.vz = uz * 4 + rand(-3, 3);
      o.drag = 1.2;
      o.gravity = -9;
      o.flicker = 0.4;
      fx._col(HOT, 1, DARK, 1);
      fx._spawn(fx.add, o);
    }
  }
  // smoke rolling off the back of the tail
  h.acc2 += dt * 22;
  while (h.acc2 >= 1) {
    h.acc2 -= 1;
    const back = rand(3, 7) * s;
    fx._blob(x - ux * back + rand(-0.5, 0.5), y - uy * back, z - uz * back + rand(-0.5, 0.5), ux, 0.8, uz, rand(1.0, 1.6), 1.6 * s, 3.8 * s, 0.45, 0, 1.0, 0, 1);
  }
  if (!h.l0 && !h.dark) h.l0 = fx._light({ x, y, z, color: [1, 0.58, 0.22], intensity: 4.5 * Math.min(1.6, s), radius: 11 * Math.min(1.6, s), fade: 0.15, flicker: 0.35 });
  h.l0?.set(x, Math.max(1, y), z);
}

/**
 * A meteor strikes (x, z), radius r: a ball of fire that fills its footprint and rolls up, a wave of
 * fire racing out along the ground, a cone of rock and dirt thrown up out of the crater, a column of
 * smoke, dust, scorch; the world takes the blow (ADR-107). h.great: the biggest strike of the fight.
 */
export function skyImpact(fx, h, x, z, r) {
  if (!Number.isFinite(x + z + r)) return;
  const g = fx.game, gr = !!h.great, q = Math.sqrt(r / 3), K = gr ? 2.6 : 1;
  h.l0?.kill?.();
  h.l0 = null;
  // the ball of fire: born together at the heart, each flying to its own spot of the disc
  let n = Math.round(30 * K);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = (r * 0.85 * Math.sqrt(Math.random())) / 0.3;
    fx._blob(x, rand(0.8, 1.6), z, Math.cos(a) * sp, rand(1, 4) * q, Math.sin(a) * sp, rand(0.45, 0.8), rand(0.9, 1.3) * q, rand(2.0, 2.8) * q, 0.36, 0, 2.6, 2);
  }
  // the ground wave out to the edge
  n = Math.round(7 * r);
  const a0 = Math.random() * TAU, v = (r * 0.75) / 0.24;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    fx._blob(x + ca * r * 0.2, 1.0, z + sa * r * 0.2, ca * v, 0, sa * v, 0.24, 0.9, 1.7, 0.42, 0.15);
  }
  // the crater blast: a cone of fire and dirt thrown up and out of the hole
  n = Math.round(14 * K);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, out = rand(2, 5) * q;
    fx._blob(x + Math.cos(a) * 0.6, rand(0.9, 1.5), z + Math.sin(a) * 0.6, Math.cos(a) * out, rand(9, 16) * q, Math.sin(a) * out, rand(0.5, 0.9), rand(1.0, 1.4) * q, rand(1.6, 2.2) * q, 0.34, 0, 1.4, -6);
  }
  let o;
  for (let i = 0; i < Math.round(26 * K); i++) {
    const a = Math.random() * TAU, sp = rand(3, 9) * q;
    o = fx._rec(x + Math.cos(a) * 0.5, 0.5, z + Math.sin(a) * 0.5, rand(0.8, 1.4), rand(0.26, 0.42), 0.2, ROCK);
    o.vx = Math.cos(a) * sp;
    o.vy = rand(7, 15) * q;
    o.vz = Math.sin(a) * sp;
    o.gravity = -22;
    o.drag = 0.3;
    o.alpha = 0.95;
    o.alphaEnd = 0.6;
    o.spin = rand(-6, 6);
    if (i & 1) fx._col(ROCK_COL, 1, ROCK_COL, 0.7);
    else fx._col(DIRT_COL, 1, DIRT_COL, 0.6);
    fx._spawn(fx.alpha, o);
  }
  // the column of smoke that climbs out of it
  n = Math.round(10 * K);
  for (let i = 0; i < n; i++) {
    fx._blob(x + rand(-0.6, 0.6) * q, rand(1.5, 3), z + rand(-0.6, 0.6) * q, rand(-0.4, 0.4), rand(2, 5), rand(-0.4, 0.4), rand(1.4, 2.4), 1.6 * q, 4.2 * q, 0.5, 0, 0.6, 0, 1);
  }
  // sparks flung high
  for (let i = 0; i < Math.round(18 * K); i++) {
    const a = Math.random() * TAU, sp = rand(2, 9) * q;
    o = fx._rec(x, 0.6, z, rand(0.7, 1.4), rand(0.2, 0.32), 0.06, EMBER);
    o.vx = Math.cos(a) * sp;
    o.vy = rand(4, 12) * q;
    o.vz = Math.sin(a) * sp;
    o.drag = 0.7;
    o.gravity = -15;
    o.flicker = 0.45;
    fx._col(HOT, 1, DARK, 1.2);
    fx._spawn(fx.add, o);
  }
  if (gr) {
    // the great one: a second slow wave and a column of fire out of the crater
    const v2 = (r * 0.9) / 0.5;
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      fx._blob(x + ca * r * 0.3, 1.2, z + sa * r * 0.3, ca * v2, 0, sa * v2, 0.5, 1.6, 2.8, 0.42, 0.15);
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, rr = r * 0.3 * Math.sqrt(Math.random());
      fx._blob(x + Math.cos(a) * rr, rand(0.8, 2), z + Math.sin(a) * rr, Math.cos(a) * rand(0.5, 2.5), rand(10, 24), Math.sin(a) * rand(0.5, 2.5), rand(0.6, 1.1), rand(1.6, 2.2), rand(2.4, 3.2), 0.36, 0, 0.8, -9);
    }
    fx._light({ x, y: 3, z, color: [1, 0.75, 0.45], intensity: 14, radius: 26, life: 0.7, fade: 0.6, flicker: 0.2 });
  }
  fx.dustRing?.(x, z, r * 0.7, Math.round(26 * K), 1.0);
  g.world?.scorch?.burnCircle?.(x, z, r, 0.6, 1);
  const w = g.world, ig = TUNING.world.ignite.meteor;
  w?.impact?.(x, z, r, TUNING.world.meteor, FIRE_BLOW);
  w?.ignite?.(x, z, r * ig[1], ig[0]);
  g.world?.gust?.(x, z, 1.2, 9);
  fx._light({ x, y: 1.5, z, color: [1, 0.62, 0.3], intensity: 8, radius: 13, life: 0.5, fade: 0.4, flicker: 0.2 });
  h.l1 = fx._light({ x, y: 0.8, z, color: [1, 0.38, 0.08], intensity: 2.2, radius: 6, life: 1.3, fade: 1.0, flicker: 0.5 });
  const p = g.player?.position;
  const dist = p ? Math.hypot(p.x - x, p.z - z) : 99;
  g.shake?.(gr ? (dist < 16 ? 0.9 : 0.6) : dist < 8 ? 0.32 : dist < 16 ? 0.16 : 0.07);
}

/**
 * The crater (k 1 -> 0): a glowing rim of embers round a smoking hole; `burning` (it hurts: P3) a
 * bed of flame over it, tall enough to read as fire.
 */
export function skyCrater(fx, h, dt, x, z, r, k, burning = false) {
  if (!(k > 0) || !Number.isFinite(x + z + r)) return;
  h.acc3 += dt * (burning ? 80 : 34) * k;
  let m = Math.min(burning ? 6 : 4, Math.floor(h.acc3));
  h.acc3 -= m;
  while (m-- > 0) {
    const a = Math.random() * TAU;
    if (burning) {
      const rr = r * 0.72 * Math.sqrt(Math.random());
      fx._blob(x + Math.cos(a) * rr, rand(0.7, 1.1), z + Math.sin(a) * rr, rand(-0.4, 0.4), rand(1.5, 3.2), rand(-0.4, 0.4), rand(0.45, 0.8), rand(1.3, 1.8), 0.5, 0.42, 0.04, 0.8, 1.5);
    } else {
      // the rim: cool licks on the lip of the hole
      const rr = r * rand(0.55, 0.8);
      fx._blob(x + Math.cos(a) * rr, rand(0.7, 0.9), z + Math.sin(a) * rr, 0, rand(0.6, 1.4), 0, rand(0.35, 0.6), rand(0.7, 1.0), 0.3, 0.26 * k, 0, 0.8, 1);
    }
    const rr2 = r * 0.7 * Math.sqrt(Math.random());
    const o = fx._rec(x + Math.cos(a) * rr2, 0.2, z + Math.sin(a) * rr2, rand(0.4, 0.9), rand(0.2, 0.28), 0.06, EMBER);
    o.vx = rand(-0.4, 0.4);
    o.vy = rand(1, 3.2);
    o.vz = rand(-0.4, 0.4);
    o.drag = 0.8;
    o.flicker = 0.5;
    fx._col(EMBER_COL, 0.6 + 0.6 * k, DARK, 0.6);
    fx._spawn(fx.add, o);
  }
  h.acc2 += dt * 5 * k;
  while (h.acc2 >= 1) {
    h.acc2 -= 1;
    fx._blob(x + rand(-0.5, 0.5) * r, rand(1.5, 2.6), z + rand(-0.5, 0.5) * r, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(1.2, 1.8), 1.4, 3.4, 0.4, 0, 0.6, 0, 1);
  }
}
