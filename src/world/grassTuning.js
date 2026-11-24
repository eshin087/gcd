// Grass the sword cuts (the scorch map's A channel, "torn"): what the blade, the boss's marks and the
// wyrm's claws take out of the meadow, and how a mown blade is drawn. Read by scorch.js (tear),
// grass.js (the shader), world/mow.js (the hero's swing) and scars.js (every kind of mark tears).
// `?mow=0`: nothing tears (today's grass, exactly).

export const GRASS = Object.freeze({
  /**
   * The mown blade (grass.js): a torn blade keeps the lower `stub` share of its letter's ink (the
   * letter is CUT, its upper part gone: not shrunk, not swapped like burnt grass), each blade's cut a
   * little higher or lower (`jitter`), a few of them `low` (cut to the root). Its top is paler where it
   * was cut (`fresh`, `freshAsh` on the Ashfall's dried grass), `freshK` of the way; the stubble barely
   * sways (`stiff`: the wind's lean x the share left). `gain`: the torn value that is a full cut.
   */
  blade: Object.freeze({
    stub: 0.42,
    jitter: 0.12,
    low: 0.15,
    ink: [0.2, 0.8], // the letter's ink spans this share of its quad (the atlas cell's margins)
    gain: 1.25,
    fresh: [0.27, 0.27, 0.13],
    freshAsh: [0.17, 0.16, 0.14],
    freshK: 0.9,
    /** the cut tops lying where they fell: [share of the mown blades, their size (x the blade), paleness] */
    lie: [0.4, 0.55, 0.85],
  }),
  /**
   * The hero's swing (world/mow.js, called beside player.js `_cutWorld`): every frame of the active
   * window the drawn steel (out to `reach` x its length) is swept from last frame's pose to this one in
   * sub-steps of at most `sub` m of the point's travel (`maxSub` at most); wherever the steel passes
   * below the grass's top (`top` x the meadow's height there) it tears a strip along the steel, `w` m
   * wide (at least; the sub-step's travel when that is wider), as deep as how far under the tops the
   * edge went: `depth` x (top - y) / top, a tear under `min` none. Only where the grass grows
   * (`minDensity`, the fire's density there).
   */
  mow: Object.freeze({
    reach: 1.45, // x the drawn steel: out to the arc's edge (player/fx.js ARC_LOOK.at), the cut the player sees
    sub: 0.2,
    maxSub: 8,
    top: 1.05,
    above: 0.45, // m over the tops the edge still skims them (its wind: a light tear, `skim` deep at the tops)
    skim: 0.45,
    stubY: 0.55, // x the top: an edge this low or lower mows to stubble (1)
    min: 0.08,
    w: 0.8,
    after: 0.14, // s past the active window the follow-through still cuts
    speed: 2.5, // m/s at the steel's point: a slower blade cuts nothing
    minDensity: 0.12,
    /**
     * The cut tops fly (player/fx.js mowBits): `per` grass letters per unit of new tear (the sum over
     * the cells), at most `max` a swing (x the quality), in the grass's own green, tiny, short-lived.
     */
    bits: Object.freeze({ per: 2.2, max: 14, size: [0.1, 0.16], life: [0.35, 0.7], up: [0.8, 2.0], fling: [0.6, 1.8] }),
  }),
  /**
   * What each KIND of floor mark tears (scars.mark): a slam a disc as wide as its round, a cut / claws
   * thin lines (`w`), a thrust a short nick, a dash a furrow, a blast a round, a beam a long strip, a
   * step a paw's disc. `k`: the depth (0..1) from a light blow to the hardest (by the mark's power).
   * `lift`: on torn grass a mark lies this high (m x density) instead of SCAR.mark.grassLift (on the
   * stubble, not on the blades' tips).
   */
  mark: Object.freeze({
    slam: Object.freeze({ r: 1.05, k: [0.75, 1] }),
    cut: Object.freeze({ w: 0.6, k: [0.85, 1] }),
    thrust: Object.freeze({ w: 0.34, r: 0.45, k: [0.7, 1] }),
    dash: Object.freeze({ w: 0.62, k: [0.85, 1] }),
    blast: Object.freeze({ r: 0.95, k: [0.85, 1] }),
    beam: Object.freeze({ w: 0.8, k: [1, 1] }),
    step: Object.freeze({ r: 0.42, k: [0.45, 0.7] }),
    lift: 0.08,
  }),
  /** the A channel's soft edge: a disc / a strip is full depth inside, falling off over `soft` m */
  soft: 0.35,
});
