import { TUNING } from './tuning.js';

// The wyrm's reach into the tree wall (2026-11-16, the tuning pass: the owner's "destroy more of the
// terrain in the background, especially the tree walls surrounding the map"). The wyrm fights inside
// the clearing; these carry what it does out to the trees round it, through the world's own calls,
// with numbers in TUNING.world.wind / .carry. Neither touches the hero: no blow, no fire on his
// ground, no tell (an attack's hit, damage, timing and tell are unchanged).
//   wallWind(d, x, z, key, k)          a roar's, a shock's, a wingbeat's front of wind: wear on wood
//                                      (world.destructibles.wind)
//   carryFire(d, x, z, dx, dz, key)    fire that does not stop where it lands: along its way to the
//                                      first wood it meets, which catches (world.destructibles.carryFire),
//                                      a streak of heat flying there (game.fx.fire)
// Every call is guarded (a test's world mock has no destructibles) and allocates nothing.

const FROM = { from: 0, fall: 0 };
const BLOB = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 1, sizeEnd: 0.4, heat: 0.5, heatEnd: 0, drag: 0.6, gravity: 0, kind: 'fire' };
// (cosmetic noise from a stream of its own: the seeded fights replay Math.random)
let seed = 0x51ab3e07;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** A front of wind from (x, z) (TUNING.world.wind[key] = [power, reach m, from m, falloff?], power x k). */
export function wallWind(d, x, z, key, k = 1) {
  const W = TUNING.world.wind?.[key], D = d?.game?.world?.destructibles;
  if (!W || !D?.wind || !(k > 0)) return 0;
  FROM.from = W[2] ?? 0;
  FROM.fall = W[3] ?? 0;
  return D.wind(x, z, W[0] * k, W[1], FROM);
}

/**
 * Fire that carries on from (x, z) along (dx, dz) (TUNING.world.carry[key] = [length m, at most every s,
 * burn k, streak blobs]): the first wood standing within that length catches on the wall's budget
 * (BREAK.wall.fire), and a streak of heat runs out to it. Rate-limited per key on the wyrm.
 */
export function carryFire(d, x, z, dx, dz, key, y = 1.2) {
  const C = TUNING.world.carry?.[key], D = d?.game?.world?.destructibles;
  if (!C || !D?.carryFire || !Number.isFinite(x + z + dx + dz)) return null;
  const T = (d._carryT ??= {}), now = d.game.time ?? 0;
  if (now < (T[key] ?? -1e9)) return null;
  T[key] = now + C[1];
  const b = D.carryFire(x, z, dx, dz, C[0], C[2]);
  if (!b) return null;
  // the streak: heat flying from where the fire ended to the tree it reached (it lands as the tree catches)
  const fire = d.game.fx?.fire, H = D._carryHit;
  const n = C[3] | 0;
  if (fire && n > 0) {
    const ex = H.x - x, ez = H.z - z, L = Math.hypot(ex, ez) || 1, top = Math.min(6, b.h * 0.5);
    for (let i = 0; i < n; i++) {
      const u = rnd(), sp = L / 0.55;
      BLOB.x = x + ex * u * 0.6 + (rnd() - 0.5);
      BLOB.y = y + (top - y) * u * 0.5 + rnd() * 0.6;
      BLOB.z = z + ez * u * 0.6 + (rnd() - 0.5);
      BLOB.vx = (ex / L) * sp * (0.7 + 0.3 * rnd());
      BLOB.vy = 0.6 + rnd() * 1.2;
      BLOB.vz = (ez / L) * sp * (0.7 + 0.3 * rnd());
      BLOB.life = 0.35 + rnd() * 0.25;
      BLOB.size = 0.9 + rnd() * 0.5;
      BLOB.sizeEnd = 0.4;
      BLOB.heat = 0.36 + rnd() * 0.12;
      fire.spawn(BLOB);
    }
  }
  return b;
}
