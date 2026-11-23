// The wind's numbers (world/life/wind.js), one block per level. Speeds in m/s, times in s, angles in
// degrees (0 = toward +x, 90 = toward +z: the game camera looks toward -z, so 0 blows left to right
// across the screen, where a lean reads best).
//
//   dir, wander      the prevailing direction and how far it wanders (slowly, two incommensurate sines)
//   speed            the prevailing speed at the top of a breath
//   breath           how it breathes: `floor` (0..1 of `speed` at the bottom of a breath), `periods` (two
//                    sines, s), `pause` (0..1: the bottom of the breath is held still: the fox's sighs),
//                    `fit` (0..1: a fast restless part on top: the ash's fitful wind)
//   fronts           gust fronts: `every` [min, max] s apart, `strength` [min, max] (1 = an ordinary gust),
//                    `speed` [min, max] m/s they travel, `tail` [min, max] m behind the edge, `lead` m
//                    ahead of it, `air` m/s of wind a strength-1 front adds, `spread` deg off the
//                    prevailing, `from` / `to` m upwind / downwind of the camera's focus where one is born
//                    and dies
//   sink             (the Obsidian Throne) the air is drawn toward a point instead: { x, z, radius }
//   streaks          the few letters that ride a front low over the ground: `rate` a second per strength-1
//                    front (on screen), `max` alive, `life` [min, max] s, `size`, `color` (linear, dim),
//                    `alpha`, `glyph`
//   grass            how the meadow answers (the shader, uWindFronts[10]): `lean` (the prevailing lean, x
//                    the blade's height at a strong wind), `wave` (the travelling patches on top of it),
//                    `front` (how far a front lays a blade over), `lift` (the leading edge's brightness:
//                    light catching bent blades)
//   trees            how the canopy answers (uWindFronts[11]): `lean`, `rock` (the sway on top of it),
//                    `front`, `stir` (the crosswise flutter as a front passes), metres at aSway 1
//   loud             m/s of air (prevailing + a front at the focus) that is `level` 1 (the air's sound)
//   fire             how the fire field's smoke and flames ride the wind: acceleration = wind x this

const BASE = {
  dir: 0, wander: 8, speed: 1.4,
  breath: { floor: 0.55, periods: [11, 29], pause: 0, fit: 0 },
  fronts: { every: [9, 16], strength: [0.75, 1.1], speed: [5, 6.5], tail: [8, 13], lead: 2.2, air: 2.2, spread: 10, from: 45, to: 60 },
  sink: null,
  streaks: { rate: 5, max: 60, life: [0.7, 1.3], size: [0.2, 0.26], color: [0.15, 0.18, 0.19], alpha: 0.38, glyph: '-~-,' },
  grass: { lean: 0.16, wave: 0.2, front: 0.55, lift: 0.5 },
  trees: { lean: 0.3, rock: 0.25, front: 0.4, stir: 0.07 },
  loud: 4,
  fire: { smoke: 0.5, flame: 0.55 },
};

const level = (o) => Object.freeze({
  ...BASE, ...o,
  breath: Object.freeze({ ...BASE.breath, ...o.breath }),
  fronts: o.fronts === null ? null : Object.freeze({ ...BASE.fronts, ...o.fronts }),
  streaks: Object.freeze({ ...BASE.streaks, ...o.streaks }),
  grass: Object.freeze({ ...BASE.grass, ...o.grass }),
  trees: Object.freeze({ ...BASE.trees, ...o.trees }),
  fire: Object.freeze({ ...BASE.fire, ...o.fire }),
  sink: o.sink ? Object.freeze({ ...o.sink }) : null,
});

export const WIND_TUNE = Object.freeze({
  /** a moonlit clearing: a night breeze in slow breaths; a front every 8 - 16 s crosses the meadow */
  cinderwood: level({
    dir: -18, speed: 1.5,
    breath: { floor: 0.5, periods: [12, 31] },
    fronts: { every: [8, 16] },
  }),
  /** the burned sect: dry and fitful; gusts drag low across the paving */
  ash: level({
    dir: -8, wander: 14, speed: 1.6,
    breath: { floor: 0.35, periods: [7, 17], fit: 0.45 },
    fronts: { every: [6, 12], strength: [0.6, 1.2], speed: [6, 8], tail: [5, 8], lead: 1.6, spread: 16 },
    streaks: { rate: 7, color: [0.19, 0.18, 0.17], glyph: "-~.'" },
    grass: { lean: 0.12, wave: 0.24, front: 0.42 },
  }),
  /** the crater of the fallen star: no weather wind, a slow draw of the air toward the star, breathing */
  starless: level({
    dir: -90, wander: 0, speed: 0.45,
    breath: { floor: 0.15, periods: [9, 9], pause: 0.2 },
    fronts: null,
    sink: { x: 0, z: -21.4, radius: 60 },
    grass: { lean: 0.1, wave: 0.05, front: 0, lift: 0 },
    trees: { lean: 0.05, rock: 0.02 },
    loud: 3,
  }),
  /** high badlands at dusk: a steady strong plateau wind from the west (toward +x), few lulls */
  ring: level({
    dir: 0, wander: 5, speed: 3.2,
    breath: { floor: 0.78, periods: [14, 37] },
    fronts: { every: [6, 11], strength: [0.6, 0.95], speed: [8, 10], tail: [10, 16], lead: 2.8, air: 2.6, spread: 6 },
    streaks: { rate: 6, color: [0.22, 0.18, 0.14], glyph: "-~-'" },
    grass: { lean: 0.2, wave: 0.16, front: 0.4 },
    loud: 6,
  }),
  /** the hill shrine: a soft breeze that comes in sighs, with real pauses between */
  fox: level({
    dir: -25, wander: 10, speed: 1.3,
    breath: { floor: 0.05, periods: [10, 23], pause: 0.38 },
    fronts: { every: [13, 24], strength: [0.6, 0.9], speed: [4, 5.5], tail: [9, 14] },
    streaks: { rate: 3.5, color: [0.16, 0.17, 0.2] },
  }),
  /** the Windless Grove: none. The grove holds its breath (wind.still) */
  grove: level({ speed: 0, wander: 0, fronts: null, still: true, streaks: { rate: 0, max: 0 } }),
});

/** a level without a block: a quiet breeze, no fronts */
export const WIND_DEFAULT = level({ speed: 0.8, fronts: null, streaks: { rate: 0, max: 0 } });

/** s a lull (the Lab's button) holds the air still, and how it eases in and out */
export const WIND_LULL = Object.freeze({ hold: 6, ease: 1.2 });

/** a radial burst (life.gust): the ring's speed (radius per s), how long it lives, the air it pushes */
export const WIND_BURST = Object.freeze({ life: 1.6, grow: 1.1, width: 0.45, air: 4 });
