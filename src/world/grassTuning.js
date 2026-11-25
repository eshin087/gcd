// Grass the sword cuts (the scorch map's A channel, "torn"): what the blade, the boss's marks and the
// wyrm's claws take out of the meadow, and how a mown blade is drawn. Read by scorch.js (tear),
// grass.js (the shader; mowSwing, the hero's swing) and scars.js (every kind of mark tears).
// `?mow=0`: nothing tears (today's grass, exactly).

export const GRASS = Object.freeze({
  /**
   * The mown blade (grass.js): a torn blade keeps the lower `stub` share of its letter's ink (the
   * letter is CUT, its upper part gone: not shrunk, not swapped like burnt grass), each blade's cut a
   * little higher or lower (`jitter`), a few of them `low` (cut to the root). The torn value x `gain`
   * is the share of the blades there that are cut (each blade is cut or stands: a light tear is a
   * scatter of stubs, a swath's edge a ragged line of them). A stub is paler where it was cut (`fresh`,
   * `freshAsh` on the Ashfall's dried grass), `freshK` of the way (never over burnt grass); it sways as
   * the lower part of the blade does (barely).
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
    fresh2: 0.75, // round 2: x freshK (the stubble stays letters in the grass's colours, not a pale wash)
    /** torn past bare[0] .. bare[1] the grass is torn OUT (a blow's mark: the floor bare under it, the stubs
     *  at the root, nothing lying), under it MOWN (the sword tears at most GRASS.mow.maxK) */
    bare: [0.84, 0.97],
    /** the cut tops lying where they fell: [share of the mown blades, their size (x the blade), paleness] */
    lie: [0.4, 0.55, 0.85],
  }),
  /**
   * The hero's swing (grass.js mowSwing, called by player.js `_combat` beside `_cutWorld`): every frame
   * from the active window to `after` s past it, while the steel's point moves at `speed` m/s or more,
   * the drawn steel (out to `reach` x its length) is swept from last frame's pose to this one in
   * sub-steps of at most `sub` m of the point's travel (`maxSub` at most); wherever it passes lower than
   * `above` m over the grass's top (`top` x the meadow's height there) it tears a strip along the steel
   * `w` m wide: `skim` deep at the tops (fading to 0 `above` m over them), 1 at `stubY` x the top and
   * under, times `maxK` (the sword MOWS; a tear under `min` x maxK none). Only where grass grows
   * (`minDensity`, the fire's density there).
   */
  mow: Object.freeze({
    maxK: 0.8, // the sword mows (pale stubble); only a blow's mark tears the grass out (GRASS.blade.bare)
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
   * The cut follows the drawn arc (round 3; world/mowFx.js cutArc, called by player/fx.js trail for each
   * stroke of the arc's EDGE): a stroke lower than `above` m over the grass's top (`top` x the meadow's
   * height there) cuts every blade whose root lies within w/2 (`wHeavy` for the heavy blows) of the
   * stroke's footprint as the camera sees it (along the view ray down to `mid` x the top). The cut is
   * one byte per blade instance in a `tex`-wide texture the grass shader reads: exact to the blade.
   */
  arc: Object.freeze({ top: 1.05, above: 0.85, mid: 0.5, w: 0.55, wHeavy: 0.7, tex: 512 }),
  /**
   * The grass spray (round 5, world/grassSpray.js; `?grassSpray=a|b|c`, 0 none): grass letters (`glyphs`,
   * the house letter) thrown off every blade the drawn arc cuts, `per` a blade on average (a light, b
   * medium, c a full burst that also cuts a bolder line: the arc's width x `wide`, its stubs paler,
   * `fresh2`), at most `max` alive (x the quality). Along the swing `fling` m/s, `side` across, `up` m/s;
   * `drag` /s, `gravity` m/s2, a flutter of `flutter` m/s2 at `flutterHz`; landed at `floor` m they lie
   * `lie` s at `lieAlpha` and fade; `life` s at most in the air. Colours: `fresh` green to `straw`.
   */
  spray: Object.freeze({
    look: 'a',
    glyphs: "/\\|',;`vi1",
    max: 1600,
    lowQ: 0.8, // at quality q a cut blade throws per x (1 / q)^lowQ (the phone draws a third of the blades)
    // a / a2 (round 6, the owner's pick a, closer to the grass): chips of the cut blade's OWN letter in
    // its own colour, drawn as the grass is (world/mowFx.js _chip): `size` x the blade, `frag` of them a
    // band of its strokes (`band` of the cell tall, at the letter's own scale), tumbling at `spin` rad/s,
    // coloured as the blade is at `tip` of its height throughout, `lit` x its light in the air / lying.
    // a0: round 5's a (the house letter, fresh green to straw)
    a: Object.freeze({ per: 0.55, size: [0.75, 0.95], frag: 0.35, band: [0.2, 0.34], spin: [4, 10], tip: 0.85, lit: [1.6, 1.05] }),
    a2: Object.freeze({ per: 0.5, size: [0.5, 0.7], frag: 0.5, band: [0.18, 0.3], spin: [5, 12], tip: 0.85, lit: [1.6, 1.05] }),
    a0: Object.freeze({ per: 0.45 }),
    b: Object.freeze({ per: 0.9 }),
    c: Object.freeze({ per: 1.6, wide: 1.45, fresh2: 1.0 }),
    fling: [1.0, 3.0],
    side: 0.9,
    up: [1.4, 3.0],
    drag: 1.6,
    gravity: 6.5,
    flutter: 3.0,
    flutterHz: 9,
    floor: 0.05,
    life: [0.9, 1.3],
    lie: [0.3, 0.8],
    lieAlpha: 0.75,
    alpha: [0.75, 0.95],
    fresh: [0.3, 0.46, 0.19],
    straw: [0.46, 0.44, 0.26],
  }),
  /**
   * The cut tops (world/mowFx.js, round 2): the upper part of each cut blade's letter leaves on the frame
   * its stub shows. `look` the default of `?mowLook=` (a thrown, b sliced, c shred, r1 round 1). At most
   * `max` pieces (x the quality), `perTear` new ones a tear call; the oldest lying one gives way first.
   * In the air: `gravity` m/s2, `drag` /s; landed it settles flat over `settle` s, lies `lie` s, thins
   * away over `thin` s. `throw` (a): along the swing `fling` m/s x its strength, `side` of that across,
   * `up` m/s, `spin` rad/s. `slice` (b): a top topples off its stub over `time` s drifting `drift` m/s
   * along the swing; `fly` of them are thrown as in a. `shred` (c): as `throw`, and `extra` of the tops
   * burst into a couple more of the grass's strokes (`glyphs`) at `size` x the blade.
   */
  fly: Object.freeze({
    look: 'a',
    max: 2000,
    touch: 4096, // cells one tear call may hand over (a slam's whole disc)
    perTear: 360,
    gravity: 9.5,
    drag: 1.6,
    settle: 0.12,
    lie: [1.6, 3.2],
    thin: 0.7,
    lit: [2.3, 1.3], // brightness x the grass's own: in the air (a cut top catching the light), lying (calmed over `calm` s)
    calm: 0.8,
    // (a, the owner's pick, round 4: a sprinkle, not a burst: `share` of the cut tops are tossed, lower and
    // shorter, a gentle spin, the grass's own light; the rest topple off as in b; a short lie, an early thin.
    // Round 2's a: every top, fling [1.6, 3.6], side 0.45, up [2.8, 4.8], spin [5, 13], lie [1.6, 3.2], thin 0.7, lit [2.3, 1.3])
    throw: Object.freeze({ share: 0.5, fling: [0.9, 2.0], side: 0.3, up: [1.7, 2.7], spin: [2, 6], lie: [0.7, 1.3], thin: 0.45, lit: [1.15, 1.0] }),
    // (b, round 3: the owner's pick, quieter: a short lean over, a little drift, the grass's own light,
    // a short lie; `lean` rad off upright they come to rest)
    slice: Object.freeze({ time: [0.2, 0.34], drift: 0.15, fly: 0.05, lean: [0.9, 1.25], lie: [0.6, 1.2], thin: 0.4, lit: [1.05, 1.0] }),
    shred: Object.freeze({ fling: [1.8, 4.2], side: 0.6, up: [2.6, 4.6], spin: [8, 18], extra: 0.7, size: 0.5, glyphs: "/\\|',`" }),
  }),
  /**
   * What each KIND of floor mark tears (scars.mark): a slam a disc as wide as its round, a cut / claws
   * thin lines (`w`), a thrust a short nick, a dash a furrow, a blast a round, a beam a long strip, a
   * step a paw's disc. `k`: the depth (0..1) from a light blow to the hardest (by the mark's power).
   * `lift`: on torn grass a mark lies this high (m x density) instead of SCAR.mark.grassLift (on the
   * stubble, not on the blades' tips).
   */
  mark: Object.freeze({
    slam: Object.freeze({ r: 1.05, k: [0.95, 1] }),
    cut: Object.freeze({ w: 0.5, k: [0.95, 1] }),
    thrust: Object.freeze({ w: 0.34, r: 0.45, k: [0.9, 1] }),
    dash: Object.freeze({ w: 0.62, k: [0.95, 1] }),
    blast: Object.freeze({ r: 0.95, k: [0.95, 1] }),
    beam: Object.freeze({ w: 0.8, k: [1, 1] }),
    step: Object.freeze({ r: 0.5, k: [0.6, 0.85] }),
    lift: 0.08,
  }),
  /** the A channel's edge: a disc / a strip is full depth out to its radius and `full` of a map cell more
   *  (0.625 m cells: a line narrower than a cell still mows the cells it crosses), falling off over `soft` m */
  full: 0.25,
  soft: 0.3,
});
