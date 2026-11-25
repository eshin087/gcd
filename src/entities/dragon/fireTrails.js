// Fire trails (ADR-190, the fire-and-forest pass; the owner: "all the fire should be coming from the
// dragon itself"). Every hazard that burns away from the wyrm now visibly travels there from it:
//   crack   a glowing crack in the ground that runs out from its forefeet (the eruptions: the P2 line
//           of pillars bursts as the crack's head reaches each one; the P3 chase pillars burst where
//           the crack's head has caught the hero). Heat in the fire field along the crack (hot at the
//           head, cooling behind it), sparks off the head, and a floor mark (world.groundBlow `cut`,
//           charred in phase 3) every `markEvery` m it runs: the floor keeps it.
//   runner  a fire front running along the ground (the second flame wall, ?wallSource=b: from where
//           the breath strikes the ground to the wall's line): taller flames at its head.
//   front   the edge of a wall line being laid (layFront): a flame at each end of the laid stretch.
// Plain functions over the wyrm's DragonFx (`fx`), the pattern of skyFx.js: state on `fx._trails`,
// made once; pooled records, no per-frame allocation. Cosmetic noise from a private LCG, never
// Math.random (a new draw would move every seeded fight in the suites). trailUpdate(fx, dt) runs from
// hazards.update; trailReset(fx) from hazards.clear (a reset, a death, a phase change).
//
// The switches (read once, the pattern of APOC_LOOK; numbers in tuningFire.js TRAILS):
//   ?fireTrail=off      every piece as before (the base: films, perf)
//   ?wallSource=a|b|off the P3 second flame wall: a (default) a fire front runs out along its line
//                       from where the first wall crosses it; b the head turns and breathes it: a
//                       runner from the breath's strike to the line, then the line is laid
//   ?crack=off          the eruptions without their crack
//   (the meteors' source is skyFx.js METEOR_SOURCE, ?meteorSource=)

import { TRAILS } from './tuningFire.js';

const param = (k) => {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get(k);
  } catch {
    return null;
  }
};
const ALL_OFF = param('fireTrail') === 'off';
export const WALL_SOURCE = (() => {
  if (ALL_OFF) return 'off';
  const v = param('wallSource');
  return v === 'b' || v === 'off' ? v : 'a';
})();
export const CRACK_ON = !ALL_OFF && param('crack') !== 'off';
export const TRAILS_OFF = ALL_OFF;

const C = TRAILS.crack;
const MAX_TRAILS = 8;
const MAXP = 96; // points per trail (a ring: the oldest are long cold by the time they are overwritten)
const EMBER = ".'`*";
const HOT = [4.6, 3.5, 1.5];
const DARK = [0.8, 0.08, 0.012];
const KIND = { crack: 0, runner: 1 };

// a private LCG (cosmetic only)
let _seed = 0x2f6b9a13;
const rnd = () => {
  _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0;
  return _seed / 4294967296;
};
const rand = (a, b) => a + rnd() * (b - a);

/** The trails' state, made once per DragonFx. */
function state(fx) {
  let s = fx._trails;
  if (!s) {
    s = fx._trails = {
      list: Array.from({ length: MAX_TRAILS }, () => ({
        alive: false, live: false, kind: 0, power: 0, serial: 0,
        pts: new Float32Array(MAXP * 3), start: 0, count: 0,
        hx: 0, hz: 0, lx: 0, lz: 0, x0: 0, z0: 0, run: 0, mx: 0, mz: 0, acc: 0, acc2: 0, side: 1, t: 0, cold: 0,
      })),
      t: 0,
      serial: 0,
      gm: { kind: 'cut', power: 0, r: NaN, dx: 0, dz: 0, len: NaN, by: 'boss', hot: false, claws: 0, spread: NaN, arc: false },
    };
  }
  return s;
}

/** The phone's share of every emission (LOW quality: the touch preset). */
function share(fx) {
  return (fx.game?.settings?.quality ?? 2) === 0 ? C.phoneK : 1;
}

/** Start a trail at (x, z): kind 'crack' | 'runner', `power` its floor marks' power. Returns a handle (or null). */
export function trailStart(fx, x, z, kind = 'crack', power = C.markPower) {
  if (!fx || !Number.isFinite(x + z)) return null;
  const s = state(fx);
  let tr = null;
  for (const c of s.list) if (!c.alive) {
    tr = c;
    break;
  }
  if (!tr) {
    // all in use: the coldest released one goes
    for (const c of s.list) if (!c.live && (!tr || c.cold > tr.cold)) tr = c;
    if (!tr) return null;
  }
  tr.alive = tr.live = true;
  tr.kind = KIND[kind] ?? 0;
  tr.power = power;
  tr.serial = ++s.serial;
  tr.start = tr.count = 0;
  tr.hx = tr.x0 = tr.mx = tr.lx = x;
  tr.hz = tr.z0 = tr.mz = tr.lz = z;
  tr.run = tr.acc = tr.acc2 = tr.cold = 0;
  tr.side = 1;
  tr.t = s.t;
  push(tr, x, z, s.t);
  return { i: s.list.indexOf(tr), serial: tr.serial };
}

function get(fx, ref) {
  const tr = ref && fx?._trails?.list[ref.i];
  return tr && tr.alive && tr.serial === ref.serial ? tr : null;
}

function push(tr, x, z, t) {
  let k;
  if (tr.count < MAXP) k = (tr.start + tr.count++) % MAXP;
  else {
    k = tr.start;
    tr.start = (tr.start + 1) % MAXP;
  }
  tr.pts[3 * k] = x;
  tr.pts[3 * k + 1] = z;
  tr.pts[3 * k + 2] = t;
}

/**
 * Move a live trail's head to (x, z): the crack opens behind it (a point every `step` m, jagged a
 * little to either side), and the floor keeps a mark every `markEvery` m it has run.
 */
export function trailHead(fx, ref, x, z) {
  const tr = get(fx, ref);
  if (!tr || !tr.live || !Number.isFinite(x + z)) return;
  const s = fx._trails;
  tr.hx = x;
  tr.hz = z;
  // (from the last laid point toward the head, a step at a time: a long jump has no straight stretch)
  let guard = 64;
  for (;;) {
    let dx = x - tr.lx, dz = z - tr.lz;
    const l = Math.hypot(dx, dz);
    if (l < C.step || guard-- <= 0) break;
    dx /= l;
    dz /= l;
    tr.lx += dx * C.step;
    tr.lz += dz * C.step;
    tr.run += C.step;
    tr.side = -tr.side;
    const j = C.jag * (0.4 + 0.6 * rnd()) * tr.side;
    push(tr, tr.lx - dz * j, tr.lz + dx * j, s.t);
    mark(fx, s, tr);
  }
}

/** The floor's mark of the crack (world.groundBlow `cut`) once it has run `markEvery` m from the last. */
function mark(fx, s, tr) {
  if (tr.kind !== KIND.crack) return;
  const L = Math.hypot(tr.lx - tr.mx, tr.lz - tr.mz);
  if (L < C.markEvery) return;
  const w = fx.game?.world;
  const g = s.gm;
  g.power = tr.power;
  g.dx = (tr.lx - tr.mx) / L;
  g.dz = (tr.lz - tr.mz) / L;
  g.len = L;
  g.hot = (fx.d?.phase ?? 1) >= 3;
  g.spread = NaN;
  try {
    w?.groundBlow?.(tr.mx, tr.mz, g);
    w?.scorch?.burnCircle?.(tr.mx + g.dx * L * 0.5, tr.mz + g.dz * L * 0.5, C.scorchR, C.scorchChar, C.scorchHeat);
  } catch (err) {
    console.error('[dragon] crack mark failed', err);
  }
  tr.mx = tr.lx;
  tr.mz = tr.lz;
}

/** The trail stops growing; it cools out over `glow` s (its floor marks stay). */
export function trailRelease(fx, ref) {
  const tr = get(fx, ref);
  if (tr) tr.live = false;
}

/** Test / debug: a trail's start, head, points and length run (null when gone). */
export function trailInfo(fx, ref) {
  const tr = get(fx, ref);
  if (!tr) return null;
  return { x0: tr.x0, z0: tr.z0, hx: tr.hx, hz: tr.hz, points: tr.count, run: tr.run, live: tr.live };
}

/** Forget every trail (a reset, a death, a phase change). */
export function trailReset(fx) {
  const s = fx?._trails;
  if (!s) return;
  for (const tr of s.list) tr.alive = tr.live = false;
}

/** Every frame (hazards.update): the trails glow and cool. Never throws. */
export function trailUpdate(fx, dt) {
  const s = fx?._trails;
  if (!s || !(dt > 0)) return;
  s.t += dt;
  try {
    const K = share(fx);
    for (const tr of s.list) if (tr.alive) drawTrail(fx, s, tr, dt, K);
  } catch (err) {
    console.error('[dragon] fire trails failed', err);
    trailReset(fx);
  }
}

function drawTrail(fx, s, tr, dt, K) {
  const now = s.t, glow = tr.kind === KIND.runner ? C.runnerGlow : C.glow;
  if (!tr.live) {
    tr.cold += dt;
    if (tr.cold > glow + 0.2) {
      tr.alive = false;
      return;
    }
  }
  const P = tr.pts, n = tr.count;
  // the body: heat laid along the crack, hot at the head, cooling behind it (many small blobs, low)
  tr.acc += dt * C.rate * K * (tr.kind === KIND.runner ? 0.7 : 1);
  let m = Math.min(28, Math.floor(tr.acc));
  tr.acc -= m;
  while (m-- > 0 && n > 1) {
    const j = Math.min(n - 2, Math.floor(rnd() * (n - 1)));
    const a = (tr.start + j) % MAXP, b = (tr.start + j + 1) % MAXP;
    const age = now - P[3 * b + 2];
    if (age > glow) continue;
    const u = rnd(), k = 1 - age / glow;
    const x = P[3 * a] + (P[3 * b] - P[3 * a]) * u, z = P[3 * a + 1] + (P[3 * b + 1] - P[3 * a + 1]) * u;
    if (tr.kind === KIND.runner) {
      fx._blob(x, rand(0.5, 0.9), z, 0, rand(1.5, 3.5) * k, 0, rand(0.3, 0.5), rand(1.0, 1.4), 0.6, 0.34 * k * k + 0.06, 0, 0.6, 2);
    } else {
      // a seam of small hot letters right on the ground: thin, a cell or two wide at the game camera
      fx._blob(x, C.y, z, 0, rand(0.2, 0.7) * k, 0, rand(0.25, 0.4), rand(0.75, 0.95), 0.5, C.heat * (0.35 + 0.65 * k * k), 0, 0, 0.4);
    }
  }
  if (!tr.live) return;
  // the head: the crack tearing open (hotter, a lick of flame) and sparks thrown off it
  tr.acc2 += dt * C.headRate * K;
  let h = Math.min(8, Math.floor(tr.acc2));
  tr.acc2 -= h;
  while (h-- > 0) {
    if (tr.kind === KIND.runner) {
      fx._blob(tr.hx + rand(-0.4, 0.4), rand(0.6, 1.4), tr.hz + rand(-0.4, 0.4), rand(-0.6, 0.6), rand(3, 6), rand(-0.6, 0.6), rand(0.3, 0.45), rand(1.4, 1.9), 0.9, 0.4, 0.05, 0.6, 2.5);
      continue;
    }
    fx._blob(tr.hx + rand(-0.25, 0.25), C.y + 0.15, tr.hz + rand(-0.25, 0.25), rand(-0.3, 0.3), rand(1, 3), rand(-0.3, 0.3), rand(0.2, 0.32), rand(0.8, 1.1), 0.5, 0.4, 0.05, 0.4, 1.5);
    if (h % 2 === 0 && fx.add) {
      const o = fx._rec(tr.hx, 0.25, tr.hz, rand(0.35, 0.6), rand(0.22, 0.32), 0.06, EMBER);
      o.vx = rand(-1.5, 1.5);
      o.vy = rand(2, 5);
      o.vz = rand(-1.5, 1.5);
      o.drag = 1.0;
      o.gravity = -9;
      o.flicker = 0.4;
      fx._col(HOT, 1, DARK, 1);
      fx._spawn(fx.add, o);
    }
  }
}

/**
 * A wall line being laid (?wallSource): a flame at the laid stretch's end (x, z), k 0..1 its strength.
 * Per frame, from the hazard; `acc` an accumulator the caller keeps.
 */
export function layFront(fx, st, key, dt, x, z, k = 1) {
  if (!fx || !Number.isFinite(x + z) || !(k > 0)) return;
  st[key] = (st[key] || 0) + dt * C.frontRate * share(fx) * k;
  let m = Math.min(10, Math.floor(st[key]));
  st[key] -= m;
  while (m-- > 0) {
    fx._blob(x + rand(-0.5, 0.5), rand(0.6, 1.6), z + rand(-0.5, 0.5), rand(-0.6, 0.6), rand(3, 6), rand(-0.6, 0.6), rand(0.3, 0.45), rand(1.3, 1.8), 0.9, 0.4 * k, 0.05, 0.6, 2.5);
  }
}

/** The cosmetic LCG (other trail visuals: skyFx's sources). */
export const trailRand = rand;
