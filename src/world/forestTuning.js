// Cinderwood's forest beyond the clearing (the fire-and-forest pass, ADR-190): the hero walks out among
// the trees (world/edge.js WALK mode), a rock ridge is the true end of the map, and the forest he walks
// in is denser and alive (young trees, undergrowth, fallen logs, old stumps, mossy rocks, roots and
// hanging moss on the old oaks) for the wyrm to rip and burn through. Read by world/forest.js and
// world/undergrowth.js. Distances in m from the clearing's centre; counts are what is PLACED (a spot
// that is taken, on the path south or a landmark, is skipped).

/**
 * The ridge: a ring of crags (prop art, breakable: they chip and crumble to rubble that still blocks)
 * at `r` m, wobbling by `wob` ([amplitude m, lobes, phase] each); one crag every `step` m along it,
 * `size` [min, max] m across, `h` [min, max] m tall, set `out` m beyond the line (so their colliders'
 * inner faces sit on it). The hero's ground ends `inset` m past the line (the backstop behind the
 * crags' colliders: edge.js `walk.at`). Across the path south the crags stand `pathH` x taller.
 * `hp`: a crag's structure (a stone of its size takes ~3: a ridge takes a fight's blows and chips).
 * `stub`: the share of its footprint its rubble still blocks.
 */
export const RIDGE = Object.freeze({
  r: 48.5,
  wob: Object.freeze([Object.freeze([1.4, 3, 0.7]), Object.freeze([0.8, 7, 2.1]), Object.freeze([0.4, 13, 4.0])]),
  step: 2.1,
  size: Object.freeze([1.25, 1.9]),
  h: Object.freeze([2.4, 4.6]),
  out: 1.15,
  /** a second row behind the first, taller and half a step along (the ridge rises): `out` m beyond the line */
  back: Object.freeze({ out: 3.0, size: Object.freeze([1.5, 2.2]), h: Object.freeze([3.8, 6.2]) }),
  inset: 0.25,
  pathH: 1.25,
  hp: 9,
  stub: 0.85,
  /** its bricks: x the brick size (BREAK.chip.brick): a crag is big and far from the fight, coarser bricks
   *  keep its triangles down (the phone's budget; ~140 a crag at x 1, ~50 at x 2) */
  brick: 2,
});

/** The ridge's line at angle `a` (rad, atan2(z, x)): m from the centre. */
export function ridgeAt(a) {
  let r = RIDGE.r;
  for (const [amp, lobes, ph] of RIDGE.wob) r += amp * Math.sin(lobes * a + ph);
  return r;
}

/**
 * What grows in the forest (counts placed; `band` [from, to] m). Walkable: inside the ridge, every piece
 * drawn on the phone too (what stands where he walks is what blocks him). Deep: beyond the ridge, on
 * the deep mesh the phone does not draw (`phoneDeep`: the quality below which it is hidden).
 *   young    young oaks and pines between the old trees: `s` their scale, `gap` m from any tree
 *   thicket  trees pressed close behind the ridge (deep): `gap` m apart
 *   bush / fern / bramble   undergrowth (no collider: he pushes through it; it burns and is torn up);
 *            the grass thins under it (its spot in the set's treeSpots, `grass` x its scale m)
 *   log      fallen logs (colliders along them), `len` m, `rad` m thick
 *   stump    old stumps (a collider)
 *   rock     mossy rocks (a collider)
 *   roots    surface roots on the old oaks of scale > `minS` (2026: `n` of them, `len` m)
 *   moss     hanging moss under an oak's crown: a share `chance` of the oaks get `n` strands, `len` m
 */
export const GROWTH = Object.freeze({
  young: Object.freeze({ n: 90, band: Object.freeze([30, 46.5]), s: Object.freeze([0.5, 0.78]), gap: 2.3, pine: 0.45 }),
  thicket: Object.freeze({ n: 170, band: Object.freeze([50.5, 60]), s: Object.freeze([0.75, 1.15]), gap: 2.0, pine: 0.5, dead: 0.12 }),
  bush: Object.freeze({ n: 150, band: Object.freeze([27.5, 46.5]), deep: 60, s: Object.freeze([1.0, 1.6]) }),
  fern: Object.freeze({ n: 120, band: Object.freeze([27.5, 46.5]), deep: 40, s: Object.freeze([1.1, 1.7]) }),
  bramble: Object.freeze({ n: 60, band: Object.freeze([28.5, 46.5]), deep: 30, s: Object.freeze([0.9, 1.4]) }),
  /** the undergrowth thickens at the forest's edge: this share of each kind's walkable count in `band` m (the treeline the fight sees) */
  rim: Object.freeze({ share: 0.45, band: Object.freeze([25, 31.5]) }),
  log: Object.freeze({ n: 22, band: Object.freeze([32, 45.5]), len: Object.freeze([3.2, 6.5]), rad: Object.freeze([0.28, 0.48]) }),
  stump: Object.freeze({ n: 26, band: Object.freeze([30, 46]), s: Object.freeze([0.8, 1.35]) }),
  rock: Object.freeze({ n: 34, band: Object.freeze([31, 46]), size: Object.freeze([0.55, 1.2]) }),
  roots: Object.freeze({ minS: 1.0, n: Object.freeze([3, 5]), len: Object.freeze([1.1, 2.0]) }),
  moss: Object.freeze({ chance: 0.4, n: Object.freeze([3, 6]), len: Object.freeze([0.8, 1.8]) }),
  /** m a piece of undergrowth keeps from a trunk, a log, a stump or a rock (it grows where the crowns let light in) */
  brushGap: 2.1,
  /** m of grass thinned round a piece of undergrowth, x its scale */
  grass: 1.1,
  /** the quality (destructibles' q) below which the deep mesh (beyond the ridge) is not drawn */
  phoneDeep: 0.7,
  /** keep clear of the bonfire's path: m either side of x = 0 south of z 27 (the path's own width + this) */
  pathPad: 0.6,
});
