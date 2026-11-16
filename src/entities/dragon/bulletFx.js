// FX of the bullet-hell projectiles and the ground tongues (bullets.js). Plain functions over the
// wyrm's DragonFx instance (`fx`): they reuse its spawn records (_rec / _col, _blob), held-mark timer
// (_hold), pooled lights (_light), the shared additive glyph pool and the fire field, so nothing
// here allocates per frame. Only atlas glyphs (tests/glyphcheck.mjs).
//
// What is fire burns in the fire field (render/fireField.js): the embers, the muzzle flashes, the
// breath driven into the ground and the tongues that crawl out of it, a lobbed ember's splash. The
// orb stays a glyph mark: its colour is a combat signal (red = dodge only) the field has no kind for.
// Glyph particles are only the small things that fly on their own (sparks, peeling embers, motes).
//
// The two bullets read apart by colour AND shape (docs/STYLE.md "Bullets"):
//   ember  a small ragged ball of fire round a gold '*', a burning tail, embers peeling off
//          (parry / block / roll / cut)
//   orb    red '@' in a turning 'O' ring, a '!' / '#' tail    (dodge only)

import { TELL_STYLE } from '../../combat/rules.js';

const EMBER_CORE = '*';
const EMBER_TAIL = ".'`*";
const ORB_CORE = '@';
const ORB_HALO = 'O';
const ORB_TAIL = '!#';
const SPARKS = "*+x'`";
const CLASH = '+x*×';
const STREAK = '-';
const GLINT_PLUS = '+';
const GLINT_STAR = '*';
const WARN_MARK = '!';

const RED = TELL_STYLE.red.color;
const GOLD = [4.4, 2.5, 0.6];
const ORANGE = [3.2, 1.1, 0.2];
const DARK = [0.8, 0.08, 0.012];
const MOON = [2.6, 3.4, 4.6]; // the blade's blue-white: the clash colour
const MOON_END = [0.25, 0.5, 1.2];
const WHITE = [4.2, 4.0, 3.6];
const HOT = [4.6, 3.5, 1.5];
const CLASH_LIGHT = [0.7, 0.85, 1];
const FIRE_LIGHT = [1, 0.5, 0.15];
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const frac = (v) => v - Math.floor(v);

/** One bullet, every frame: a held core (+ halo) and a thin trail. */
export function drawBullet(fx, b, dt) {
  const life = fx._hold(b, 'hold', dt);
  const dim = b.dud ? 0.45 : 1;
  const pulse = 1 + 0.12 * Math.sin(b.t * 14 + b.seed);
  if (life > 0) {
    let o;
    if (b.kind === 2) {
      fx._col(RED, 1.6 * dim, RED, 1.6 * dim);
      o = fx._rec(b.x, b.y, b.z, life, 1.15 * pulse, 1.15 * pulse, ORB_CORE);
      o.alphaEnd = 1;
      fx._spawn(fx.add, o);
      fx._col(RED, 0.75 * dim, RED, 0.75 * dim);
      o = fx._rec(b.x, b.y, b.z, life, 1.75 * pulse, 1.75 * pulse, ORB_HALO);
      o.alphaEnd = 1;
      o.rot = b.t * 3 + b.seed;
      fx._spawn(fx.add, o);
    } else {
      // an ember: a ragged ball of fire, every one its own size and flicker (a stream of them is a
      // body of fire, not a string of beads), drawn out a little along its flight, round a gold
      // point that marks exactly where it is (an ember still gathering before its launch flickers)
      const k = b.launched ? 1 : 0.6 + 0.25 * Math.sin(b.t * 30 + b.seed);
      const s = 0.78 + 0.5 * frac(b.seed * 0.913); // its own size
      const fl = 0.8 + 0.2 * Math.sin(b.t * 23 + b.seed * 3) + 0.12 * Math.sin(b.t * 41 + b.seed);
      const sp = Math.hypot(b.vx, b.vz, b.vy) || 1;
      const bx = (-b.vx / sp) * 0.32 * s, by = (-b.vy / sp) * 0.32 * s, bz = (-b.vz / sp) * 0.32 * s;
      fx._blob(b.x, b.y, b.z, 0, 0, 0, life, (b.launched ? 0.95 : 0.8) * s * pulse, 0.95 * s * pulse, 1.05 * dim * k * fl, 1.05 * dim * k * fl);
      if (b.launched) {
        // drawn out behind: in a stream the comets overlap into one body of fire with a hotter core
        fx._blob(b.x + bx, b.y + by, b.z + bz, 0, 0, 0, life, 0.85 * s, 0.85 * s, 0.6 * dim * fl, 0.6 * dim * fl);
        fx._blob(b.x + 2.4 * bx, b.y + 2.4 * by + 0.08, b.z + 2.4 * bz, 0, 0, 0, life, 0.75 * s, 0.75 * s, 0.34 * dim, 0.34 * dim);
      }
      fx._col(GOLD, 0.85 * dim * k, GOLD, 0.85 * dim * k);
      o = fx._rec(b.x, b.y, b.z, life, 0.24 * s * pulse, 0.24 * s * pulse, EMBER_CORE);
      o.alphaEnd = 1;
      o.rot = b.t * 5 + b.seed;
      fx._spawn(fx.add, o);
    }
  }
  b.acc += dt * (b.kind === 2 ? 14 : 26);
  while (b.acc >= 1) {
    b.acc -= 1;
    let o;
    if (b.kind !== 2) {
      // the heat it sheds: a short burning tail that rises as it cools ...
      fx._blob(
        b.x + rand(-0.1, 0.1), b.y + rand(-0.08, 0.08), b.z + rand(-0.1, 0.1), b.vx * 0.12, rand(0.2, 0.9), b.vz * 0.12,
        rand(0.2, 0.34), 0.7, 0.25, 0.4 * dim, 0, 2, 1,
      );
      const r = Math.random();
      if (r < 0.08 && b.launched) {
        // ... and now and then an ember peels off it: thrown sideways, it drifts up and dies
        const side = Math.random() < 0.5 ? -1 : 1, sp = Math.hypot(b.vx, b.vz) || 1;
        const lx = (b.vz / sp) * side * rand(1.2, 3), lz = (-b.vx / sp) * side * rand(1.2, 3);
        fx._blob(b.x, b.y, b.z, b.vx * 0.35 + lx, rand(0.5, 1.8), b.vz * 0.35 + lz, rand(0.3, 0.5), 0.45, 0.2, 0.42 * dim, 0, 1.6, 1.2);
        fx._col(HOT, dim, DARK, 1);
        o = fx._rec(b.x, b.y, b.z, rand(0.45, 0.8), rand(0.2, 0.28), 0.05, EMBER_TAIL);
        o.vx = b.vx * 0.3 + lx;
        o.vy = rand(0.8, 2.4);
        o.vz = b.vz * 0.3 + lz;
        o.drag = 1.4;
        o.gravity = -2;
        o.flicker = 0.5;
        fx._spawn(fx.add, o);
        continue;
      }
      if (r > 0.3) continue;
      fx._col(ORANGE, dim, DARK, 1);
      o = fx._rec(b.x + rand(-0.08, 0.08), b.y + rand(-0.08, 0.08), b.z + rand(-0.08, 0.08), rand(0.22, 0.34), 0.26, 0.06, EMBER_TAIL);
      o.vy = rand(0.2, 0.9);
      o.flicker = 0.4;
    } else {
      fx._col(RED, 0.9 * dim, RED, 0.2);
      o = fx._rec(b.x + rand(-0.2, 0.2), b.y + rand(-0.2, 0.2), b.z + rand(-0.2, 0.2), rand(0.25, 0.4), 0.55, 0.12, ORB_TAIL);
    }
    o.vx = -b.vx * 0.12;
    o.vz = -b.vz * 0.12;
    o.drag = 2;
    fx._spawn(fx.add, o);
  }
}

function sparks(fx, x, y, z, n, c0, c1, speed, size, glyph, up = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = rand(0.35, 1) * speed;
    fx._col(c0, 1, c1, 1);
    const o = fx._rec(x, y, z, rand(0.2, 0.42), rand(0.6, 1) * size, 0.05, glyph);
    o.vx = Math.cos(a) * sp;
    o.vy = rand(-1, up);
    o.vz = Math.sin(a) * sp;
    o.drag = 3;
    o.gravity = 6;
    o.stretch = 0.25;
    fx._spawn(fx.add, o);
  }
}

const coreCol = (kind) => (kind === 2 ? RED : GOLD);
const endCol = () => DARK;

/**
 * A perfectly parried bullet on its way back (ADR-051): a white-gold core `size` x a bullet's, a
 * gold halo turning, a long orange trail. Reads apart from the plain deflect (the bullet's own look).
 */
export function drawReturned(fx, b, dt, size = 1.8) {
  const life = fx._hold(b, 'hold', dt);
  const s = size;
  if (life > 0) {
    // a ball of fire `size` x a bullet's, white-hot through and through, round a white point
    fx._blob(b.x, b.y, b.z, 0, 0, 0, life, 1.0 * s, 1.0 * s, 1.1, 1.1);
    fx._blob(b.x, b.y, b.z, 0, 0, 0, life, 0.55 * s, 0.55 * s, 1.3, 1.3);
    fx._col(WHITE, 1.25, WHITE, 1.25);
    const o = fx._rec(b.x, b.y, b.z, life, 0.22 * s, 0.22 * s, EMBER_CORE);
    o.alphaEnd = 1;
    o.rot = b.t * 9 + b.seed;
    fx._spawn(fx.add, o);
  }
  b.acc += dt * 60;
  while (b.acc >= 1) {
    b.acc -= 1;
    const back = Math.random() * dt;
    fx._blob(
      b.x - b.vx * back + rand(-0.1, 0.1), b.y + rand(-0.1, 0.1), b.z - b.vz * back + rand(-0.1, 0.1), b.vx * 0.1, rand(0, 0.8), b.vz * 0.1,
      rand(0.28, 0.45), 0.5 * s, 0.2, 0.5, 0, 2, 1,
    );
    if (Math.random() < 0.3) {
      fx._col(ORANGE, 1.1, DARK, 1);
      const o = fx._rec(b.x + rand(-0.12, 0.12), b.y + rand(-0.12, 0.12), b.z + rand(-0.12, 0.12), rand(0.28, 0.45), 0.26, 0.06, EMBER_TAIL);
      o.vx = -b.vx * 0.08;
      o.vz = -b.vz * 0.08;
      o.vy = rand(0, 0.8);
      o.drag = 2;
      o.flicker = 0.3;
      fx._spawn(fx.add, o);
    }
  }
}

/** The shot leaving the blade: a gold flare on top of the deflect clash. */
export function returnLaunch(fx, x, y, z) {
  if (!Number.isFinite(x + y + z)) return;
  fx._col(HOT, 1.2, GOLD, 0.4);
  const o = fx._rec(x, y, z, 0.18, 1.6, 0.4, GLINT_STAR);
  o.rot = rand(0, 1.5);
  fx._spawn(fx.add, o);
  sparks(fx, x, y, z, 10, GOLD, DARK, 8, 0.4, SPARKS, 4);
}

/** A returned shot bursting on the wyrm's head: a white-gold star, a ring of fire sparks, a warm light. */
export function returnBurst(fx, x, y, z) {
  if (!Number.isFinite(x + y + z)) return;
  // a burst of flame: blobs born on top of each other (a white heart for a blink) that fly apart
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * TAU, sp = rand(1.5, 7);
    fx._blob(x, y, z, Math.cos(a) * sp, rand(-1, 4), Math.sin(a) * sp, rand(0.3, 0.55), rand(0.8, 1.1), rand(1.5, 2.1), 0.42, 0, 2.6, 1.5);
  }
  sparks(fx, x, y, z, 18, GOLD, DARK, 11, 0.5, SPARKS, 5);
  sparks(fx, x, y, z, 10, ORANGE, DARK, 6, 0.6, EMBER_TAIL, 3);
  fx._light({ x, y, z, color: FIRE_LIGHT, intensity: 6, radius: 10, life: 0.3, fade: 0.25 });
}

/** A bullet bursting on the hero / his guard / the wyrm's head. */
export function burst(fx, x, y, z, kind) {
  if (!Number.isFinite(x + y + z)) return;
  const c = coreCol(kind);
  fx._col(c, 1.4, c, 0.5);
  const o = fx._rec(x, y, z, 0.2, kind === 2 ? 2.2 : 0.6, 0.2, GLINT_STAR);
  fx._spawn(fx.add, o);
  if (kind !== 2) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU, sp = rand(1, 4);
      fx._blob(x, y, z, Math.cos(a) * sp, rand(0, 3), Math.sin(a) * sp, rand(0.22, 0.4), rand(0.6, 0.9), rand(1.1, 1.5), 0.4, 0, 2.6, 1);
    }
  }
  sparks(fx, x, y, z, kind === 2 ? 16 : 9, c, endCol(kind), kind === 2 ? 9 : 6.5, 0.42, SPARKS, 4);
}

/** A bullet dying on its own (out of time, a dud, popped by a clash nearby): a few motes. */
export function fizzle(fx, x, y, z, kind) {
  if (!Number.isFinite(x + y + z)) return;
  sparks(fx, x, y, z, 4, coreCol(kind), endCol(kind), 2.5, 0.3, EMBER_TAIL, 2);
}

/** The clash of a deflected bullet: a blue-white star on the blade, crossed sparks, a cold light. */
export function deflectSpark(fx, x, y, z) {
  if (!Number.isFinite(x + y + z)) return;
  // compact and not overbright: the hero's own parry burst (player/fx.js) lands on the same spot,
  // and big additive glyphs on top of it clip to one white blob that hides the deflect
  fx._col(MOON, 0.9, MOON_END, 1);
  let o = fx._rec(x, y, z, 0.16, 0.8, 0.3, GLINT_STAR);
  fx._spawn(fx.add, o);
  fx._col(MOON, 0.55, MOON_END, 0.8);
  o = fx._rec(x, y, z, 0.16, 1.0, 1.9, GLINT_PLUS);
  o.rot = rand(0, 1.5);
  fx._spawn(fx.add, o);
  sparks(fx, x, y, z, 11, MOON, MOON_END, 10, 0.4, CLASH, 5);
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * TAU, sp = rand(9, 15);
    fx._col(WHITE, 1, MOON_END, 1);
    o = fx._rec(x, y, z, rand(0.12, 0.2), 0.5, 0.1, STREAK);
    o.vx = Math.cos(a) * sp;
    o.vy = rand(-1, 4);
    o.vz = Math.sin(a) * sp;
    o.rot = fx._screenRot(o.vx, o.vy, o.vz);
    o.stretch = 0.6;
    o.drag = 4;
    fx._spawn(fx.add, o);
  }
  fx._light({ x, y: Math.max(0.8, y), z, color: CLASH_LIGHT, intensity: 3.5, radius: 6.5, life: 0.2, fade: 0.16 });
}

/** A bullet cut out of the air by a swing. */
export function cutSpark(fx, x, y, z, kind) {
  if (!Number.isFinite(x + y + z)) return;
  const c = coreCol(kind);
  fx._col(c, 1.1, c, 0.4);
  const o = fx._rec(x, y, z, 0.16, 0.85, 0.2, 'x');
  fx._spawn(fx.add, o);
  sparks(fx, x, y, z, 6, c, endCol(kind), 6, 0.36, SPARKS, 3);
}

/** The timing glint of a bullet about to hit (its combat:flash): a sharp cross on the bullet. */
export function cueGlint(fx, x, y, z, tell) {
  if (!Number.isFinite(x + y + z)) return;
  const red = tell === 'red';
  const c = red ? RED : tell === 'blue' ? MOON : WHITE;
  fx._col(c, red ? 1.5 : 1.3, c, 0.4);
  let o = fx._rec(x, y, z, 0.2, red ? 2.4 : 1.7, 0.3, red ? WARN_MARK : GLINT_PLUS);
  fx._spawn(fx.add, o);
  fx._col(c, 1, c, 0.3);
  o = fx._rec(x, y, z, 0.16, 0.6, red ? 2.6 : 2.0, GLINT_STAR);
  o.rot = 0.6;
  fx._spawn(fx.add, o);
}

/**
 * A muzzle flash where a volley leaves the maw: a white-hot heart for a blink, a rolling puff of
 * flame thrown forward (it slows, swells and climbs), sparks. `n` scales it (2 a breath's frame, 8 -
 * 18 a cough).
 */
export function muzzle(fx, x, y, z, dx, dz, n = 8) {
  if (!Number.isFinite(x + y + z + dx + dz)) return;
  if (n >= 6) {
    // the heart: blobs born on top of each other just ahead of the teeth
    const k = Math.min(1.6, n / 10);
    for (let i = 0; i < 3; i++) {
      fx._blob(x + dx * 0.4, y, z + dz * 0.4, dx * rand(3, 6), rand(0, 1), dz * rand(3, 6), rand(0.1, 0.16), 1.1 * k, 1.9 * k, 0.6, 0.1, 4, 0);
    }
    fx._light({ x: x + dx, y, z: z + dz, color: FIRE_LIGHT, intensity: 2.5 + 2 * k, radius: 7, life: 0.12, fade: 0.1 });
  }
  for (let i = 0; i < n; i++) {
    const sp = rand(2, 8);
    if (i % 3 !== 2) {
      // the puff: overlapping blobs that roll forward, swell and climb (one body of flame)
      fx._blob(
        x + rand(-0.35, 0.35), y + rand(-0.25, 0.25), z + rand(-0.35, 0.35), dx * sp + rand(-1.6, 1.6), rand(-0.3, 2.2), dz * sp + rand(-1.6, 1.6),
        rand(0.28, 0.55), rand(0.8, 1.2), rand(1.5, 2.2), 0.42, 0, 2.8, 1.6,
      );
      continue;
    }
    fx._col(HOT, 1, DARK, 1);
    const o = fx._rec(x + rand(-0.4, 0.4), y + rand(-0.3, 0.3), z + rand(-0.4, 0.4), rand(0.25, 0.5), rand(0.2, 0.3), 0.08, EMBER_TAIL);
    o.vx = dx * sp * 1.4 + rand(-2, 2);
    o.vy = rand(-0.5, 3);
    o.vz = dz * sp * 1.4 + rand(-2, 2);
    o.drag = 2.5;
    o.flicker = 0.3;
    fx._spawn(fx.add, o);
  }
}

// ---------------------------------------------------------------- the breath into the ground
let beamAcc = 0;
let lickAcc = 0;
/**
 * A sustained breath from the jaws `m` down to its strike point (sx, sz): fire pouring along the
 * line (blobs that swell toward the ground, a hotter vein down the middle), a roiling splash where it
 * hits that rolls out and up. Short-lived (they never sink under the ground). `k` scales it.
 */
export function breathBeam(fx, m, sx, sz, dt, k = 1) {
  if (!Number.isFinite(m.x + m.y + m.z + sx + sz)) return;
  const dx = sx - m.x, dy = 0.5 - m.y, dz = sz - m.z;
  beamAcc += dt * 130 * k;
  let n = Math.min(12, Math.floor(beamAcc));
  beamAcc -= n;
  while (n-- > 0) {
    const u = Math.random(), core = Math.random() < 0.3;
    const j = core ? 0.06 : 0.22 + 0.35 * u;
    fx._blob(
      m.x + dx * u + rand(-j, j), m.y + dy * u + rand(-j, j) * 0.6, m.z + dz * u + rand(-j, j), dx * 2.6 + rand(-1, 1), dy * 2.6, dz * 2.6 + rand(-1, 1),
      rand(0.12, 0.22), (core ? 0.55 : 0.8) + 0.9 * u, (core ? 0.8 : 1.1) + 1.3 * u, core ? 0.6 : 0.3, 0.1, 2, 0,
    );
  }
  // where it strikes: flame rolling out low along the ground and curling up
  lickAcc += dt * 46 * k;
  let m2 = Math.min(6, Math.floor(lickAcc));
  lickAcc -= m2;
  const L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  while (m2-- > 0) {
    const a = Math.random() * TAU, sp = rand(1.5, 4.5);
    fx._blob(
      sx + rand(-0.4, 0.4), rand(0.4, 0.9), sz + rand(-0.4, 0.4), Math.cos(a) * sp + ux * 3, rand(1.5, 5.5), Math.sin(a) * sp + uz * 3,
      rand(0.3, 0.55), rand(1.2, 1.8), rand(0.6, 1.0), 0.48, 0, 1.6, 1.5,
    );
  }
  if (Math.random() < dt * 14) {
    fx._col(HOT, 1, DARK, 1);
    const o = fx._rec(sx, 0.5, sz, rand(0.5, 0.9), rand(0.22, 0.3), 0.06, EMBER_TAIL);
    o.vx = rand(-3, 3) + ux * 2;
    o.vy = rand(3, 7);
    o.vz = rand(-3, 3) + uz * 2;
    o.drag = 1.2;
    o.gravity = -9;
    o.flicker = 0.45;
    fx._spawn(fx.add, o);
  }
}

/** The windup of a breath into the ground: the spot it will strike heats up (k 0..1). */
export function strikeWarn(fx, st, dt, x, z, r, k) {
  const life = fx._hold(st, 'hold', dt);
  fx.heatDisc?.(life, st, dt, x, z, r, k, false, 4.1);
}

// ---------------------------------------------------------------- ground tongues
/** A tongue leaves the strike point: flame bursts forward along its line, a spray of sparks. */
export function tongueRelease(fx, tg) {
  const x = tg.x + tg.sx * tg.r0, z = tg.z + tg.sz * tg.r0;
  if (!Number.isFinite(x + z)) return;
  for (let i = 0; i < 5; i++) {
    const sp = rand(5, 11);
    fx._blob(x, rand(0.4, 0.8), z, tg.sx * sp + rand(-0.3, 0.3), rand(1, 3), tg.sz * sp + rand(-0.3, 0.3), rand(0.25, 0.4), rand(0.9, 1.2), rand(1.2, 1.5), 0.5, 0, 3, 1); // (along its line only)
  }
  for (let i = 0; i < 3; i++) {
    fx._col(HOT, 1, DARK, 1);
    const o = fx._rec(x, 0.6, z, rand(0.4, 0.7), rand(0.22, 0.3), 0.06, EMBER_TAIL);
    o.vx = tg.sx * rand(4, 9) + rand(-0.6, 0.6);
    o.vy = rand(2, 6);
    o.vz = tg.sz * rand(4, 9) + rand(-0.6, 0.6);
    o.drag = 1.4;
    o.gravity = -9;
    o.flicker = 0.4;
    fx._spawn(fx.add, o);
  }
}

/**
 * A tongue, every frame (tg.front / tg.tail: the stretch burning now). It must read from the game
 * camera as ONE line of fire, no wider than it hurts, with dark ground beside it:
 *   - a hot core line, unbroken from the tail to the front (small held blobs close together, on the
 *     line itself: the field sums them into a white-gold thread),
 *   - a body as wide as the hit (`width`), its edge wavering a little along the line (it licks, it
 *     never smears sideways), hottest just behind the front and dying toward the tail,
 *   - a bright front rolling forward (the way it travels), flames licking straight up off the line
 *     (most at the front), a few sparks.
 * No smoke, no flame thrown off the line, no wide ground heat: the gaps between tongues stay dark.
 * The ground under it is charred (little heat), and wood the front crawls over catches.
 */
export function tongueLive(fx, tg, dt) {
  const life = fx._hold(tg, 'hf', dt);
  const span = tg.front - tg.tail;
  if (!(span > 0)) return;
  const t = tg.t, sd = tg.seed, sx = tg.sx, sz = tg.sz, qx = sz, qz = -sx;
  const W = Math.max(0.6, tg.width);
  const full = Math.max(0.5, tg.speed * tg.hold);
  const ending = tg.front >= tg.r1 - 0.01;
  if (life > 0) {
    // the core: a thread on the line, every 0.45 m (blobs 0.6 m across overlap: no beads)
    for (let r = tg.front; r >= tg.tail; r -= 0.45) {
      const u = (tg.front - r) / full;
      const h = Math.max(0, 1 - u);
      if (h < 0.04) continue;
      fx._blob(tg.x + sx * r, 0.35, tg.z + sz * r, 0, 0, 0, life, 0.9, 0.9, 0.75 + 0.65 * h, 0.75 + 0.65 * h);
    }
    // the body: as wide as the hit, its edge licking a little along the line
    for (let r = tg.front - 0.2; r >= tg.tail; r -= 0.7) {
      const u = (tg.front - r) / full;
      const nz = 0.75 + 0.25 * Math.sin(r * 1.7 + t * 13 + sd) * Math.sin(r * 0.6 - t * 5 + sd * 2);
      const h = Math.pow(Math.max(0, 1 - u), 1.2) * nz * (ending ? 0.85 : 1);
      if (h < 0.06) continue;
      const wob = 0.1 * W * Math.sin(r * 0.9 + t * 7 + sd);
      fx._blob(tg.x + sx * r + qx * wob, 0.5 + 0.35 * h, tg.z + sz * r + qz * wob, 0, 0, 0, life, (0.7 + 0.2 * h) * W, (0.7 + 0.2 * h) * W, 0.5 * h, 0.5 * h);
    }
    if (!ending) {
      // the front: a bright clump rolling forward, a short lick ahead of it (the way it travels)
      const fx0 = tg.x + sx * tg.front, fz0 = tg.z + sz * tg.front;
      fx._blob(fx0, 0.75, fz0, 0, 0, 0, life, 1.3 * W, 1.3 * W, 1.6, 1.6);
      fx._blob(fx0 + sx * 0.7, 0.5, fz0 + sz * 0.7, 0, 0, 0, life, 0.9 * W, 0.9 * W, 0.8, 0.8);
    }
  }
  // flames licking straight up off the line (the most at the front), a few sparks
  tg.acc += dt * Math.min(40, 14 + 2.5 * span);
  let n = Math.min(6, Math.floor(tg.acc));
  tg.acc -= n;
  while (n-- > 0) {
    const q = Math.random();
    const r = tg.front - span * q * q;
    const h = Math.max(0, 1 - (tg.front - r) / full);
    const lat = rand(-0.3, 0.3) * W;
    const x = tg.x + sx * r + qx * lat, z = tg.z + sz * r + qz * lat;
    fx._blob(x, rand(0.5, 0.9), z, sx * rand(0, 1), rand(2.5, 5) * (0.5 + 0.5 * h), sz * rand(0, 1), rand(0.25, 0.45), rand(0.6, 0.85) * W, 0.3, 0.45 * (0.4 + 0.6 * h), 0.05, 1.6, 1.2);
    if (Math.random() < 0.12) {
      fx._col(GOLD, 0.85, DARK, 1.3);
      const o = fx._rec(x, rand(0.4, 1.0), z, rand(0.4, 0.7), rand(0.2, 0.26), 0.05, EMBER_TAIL);
      o.vx = rand(-0.4, 0.4);
      o.vy = rand(2, 5);
      o.vz = rand(-0.4, 0.4);
      o.drag = 1.2;
      o.gravity = -6;
      o.flicker = 0.45;
      fx._spawn(fx.add, o);
    }
  }
  // the ground: charred along the line (little heat: lit grass would bury the lines), wood catches
  tg.scT -= dt;
  if (tg.scT <= 0) {
    tg.scT = 0.14;
    const w = fx.game.world;
    const r = tg.tail + Math.random() * span;
    w?.scorch?.burnCircle?.(tg.x + sx * r, tg.z + sz * r, W * 0.5, 0.3, 0.12);
    if (!ending) {
      const fxp = tg.x + sx * tg.front, fzp = tg.z + sz * tg.front;
      w?.scorch?.burnCircle?.(fxp, fzp, W * 0.5, 0.25, 0.15);
      w?.ignite?.(fxp, fzp, W * 0.6, fx.d?.bullets?.K?.world?.tongueFire ?? 1, false); // (wood only: grass fire would bury the lines)
    }
  }
}

/** A small light riding a tongue's front (the field gives it to the fronts nearest the hero). */
export function tongueLight(fx, tg) {
  const x = tg.x + tg.sx * tg.front, z = tg.z + tg.sz * tg.front;
  if (!Number.isFinite(x + z)) return;
  fx._light({ x, y: 1.0, z, color: FIRE_LIGHT, intensity: 1.8, radius: 3.5, life: 0.2, fade: 0.14 });
}

// ---------------------------------------------------------------- lobbed embers
/** Where a lobbed ember will land: the ground there glows hotter as it falls. */
export function lobMark(fx, b, dt) {
  const life = fx._hold(b, 'mk', dt);
  const k = Math.min(1, b.t / Math.max(0.1, b.fall));
  fx.heatDisc?.(life, b, dt, b.tx, b.tz, 0.8, 0.25 + 0.6 * k, false, b.seed);
}

/** A lobbed ember lands: a splash of flame low on the ground, sparks thrown out, a blink of light. */
export function lobLand(fx, x, z) {
  if (!Number.isFinite(x + z)) return;
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * TAU, sp = rand(1.5, 4.5);
    fx._blob(x, rand(0.2, 0.5), z, Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp, rand(0.3, 0.5), rand(0.8, 1.1), rand(1.3, 1.8), 0.45, 0, 2.4, 1.4);
  }
  sparks(fx, x, 0.4, z, 6, GOLD, DARK, 5, 0.34, EMBER_TAIL, 5);
  fx._light({ x, y: 0.8, z, color: FIRE_LIGHT, intensity: 2.6, radius: 5, life: 0.16, fade: 0.12 });
}
