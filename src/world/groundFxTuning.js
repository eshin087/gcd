// THE DRAGON PRINT'S UPGRADES: every number (world/groundFx.js, the CPU side; render/dragonPrintFx.js, the
// GLSL hooks). Each upgrade has its options ('a' the author's pick, 'b' the alternative), read through
// dragonLook('dpCloud' | 'dpContact' | 'dpRipple' | 'dpRidge') (render/dragonPrint.js). Units: m, s, and
// the ground's relief units (world/ground.js groundRelief: about 0 .. 1.2 over a mound).

export const GFX = Object.freeze({
  // ---- drifting cloud shadows (dpCloud): soft shapes riding the level's one wind (ADR-163), dimming the
  // moon's share of the light only (a fire's light stays). The shape is value noise (dpFbm) at `scale`
  // (1/m: 0.03 = shapes about 30 m across), warped by `warp` so they are not blobs of one size, cut at
  // `cover` (0..1: higher = less sky under cloud) with an edge `soft` wide; `depth` the share of the moon a
  // cloud takes away. They drift with the wind at `k` x its speed, never slower than `min` nor faster than
  // `max` m/s; a level with no wind of its own (the Windless Grove, or ?life=off) drifts at `still`.
  cloud: Object.freeze({
    a: Object.freeze({ scale: 0.06, warp: 1.1, cover: 0.64, soft: 0.09, depth: 0.55, k: 1.4, min: 0.7, max: 3.2 }),
    // (b: smaller broken cloud, sharper edged, quicker: a windier sky)
    b: Object.freeze({ scale: 0.12, warp: 0.9, cover: 0.63, soft: 0.04, depth: 0.6, k: 2.4, min: 1.2, max: 5 }),
    still: Object.freeze({ dir: 35, speed: 0.6 }), // (deg from +x toward +z, m/s)
  }),

  // ---- contact shadows (dpContact): darker digits ringing the foot of every rock, tree and fighter.
  // The set's standing pieces and its colliders are baked once into a texture (`texel` m a texel, at most
  // `maxSize` texels a side, over the scorch map's square) and baked again, at most every `rebake` s,
  // when a piece falls, breaks or stands again. A ring is full under the piece (`r`) and fades out over
  // `spread` + `spreadR` x r m beyond it; `depth` (0..1) is how much of the light it takes at its edge.
  // A piece lower than `minH` m (a flagstone, a slab) rings nothing; up to `hRef` m tall it rings less.
  // A broken piece keeps a ring round its stump (`stub` x depth). Option b leans the ring away from the moon
  // (`lean` m: the dark falls on the shadow side, a short soft drop shadow).
  contact: Object.freeze({
    texel: 0.25,
    maxSize: 1024,
    rebake: 0.2,
    minH: 0.3,
    hRef: 1.2,
    stub: 0.7,
    a: Object.freeze({ depth: 0.7, spread: 0.35, spreadR: 0.4, lean: 0 }),
    b: Object.freeze({ depth: 0.75, spread: 0.4, spreadR: 0.45, lean: 0.6 }),
    // the fighters (a few uniforms, written each frame): the hero's ring (r m, depth), the boss's body
    // circles (its footprint: game.boss.bodyCircles; r when a circle has none), faded out over `lift` m
    // of height (a leap, a flight). Their rings fade over spread[0] x r + spread[1] m. (The depths are
    // option a's; option b scales them by its own depth over a's.)
    hero: Object.freeze({ r: 0.32, depth: 0.7 }),
    boss: Object.freeze({ r: 0.6, depth: 0.7 }),
    spread: Object.freeze([0.5, 0.3]),
    lift: 1.2,
  }),

  // ---- the impact re-print ripple (dpRipple): a blow that meets the ground (world.groundBlow: every
  // boss blow on the floor, the hero's plunge and charged cleave) sends a ring outward through the
  // print; the cells it passes take another digit and a little more light, then settle. A blow under
  // `minPower` (POWER scale: 0.3 a light blow, 1 a heavy one, 2 the biggest) sends none. A ring runs out
  // to `reach[0]` + `reach[1]` x power m (at most `reachMax`) at `speed` m/s, easing out; its strength
  // is `amp[0]` + `amp[1]` x power (at most 1), fading as it goes. `front` / `back` m: the band's width
  // ahead of and behind its edge; `jitter` m: how ragged the edge is cell to cell (each cell flips on its
  // own beat). `slots` rings live at once (a new one takes the oldest's slot when all are busy).
  // The print (each surface re-prints the same way, render/dragonPrintFx.js): over `flip` of strength a
  // cell takes another digit, its tone rises by `tone` x the strength (a denser digit) and its light by
  // `light` x it (added to the print's 0.2 + 1.5 x tone: about twice as bright at full strength).
  ripple: Object.freeze({
    slots: 6,
    minPower: 0.45,
    a: Object.freeze({ speed: 6, reach: [2.5, 3.2], reachMax: 9, amp: [0.5, 0.35], front: 0.3, back: 0.7, jitter: 0.35, flip: 0.2, tone: 0.6, light: 2 }),
    // (b: a slower, wider swell: the ground heaves rather than flips)
    b: Object.freeze({ speed: 3.5, reach: [2, 2.6], reachMax: 7, amp: [0.35, 0.35], front: 0.8, back: 1.6, jitter: 0.6, flip: 0.35, tone: 0.3, light: 1.1 }),
  }),

  // ---- ridge outlines (dpRidge): stroke letters ( _ - / \ ( ) ) along the edges of the relief's lit
  // faces, like the wyrm's outline: where the moon's share on the BROAD relief (the mounds, not the
  // meadow's tussocks) crosses the edge level (the moon's height + `edge`) within half a cell, the cell
  // prints the stroke that runs along that edge, on its lit side, `gain` brighter (added to its tone,
  // unclamped: a stroke has less ink than a dense digit; without it a lit outline reads as a dark gap).
  // Only a sharp edge (the share turns faster than `sharp` per m: a crest, a rim; not a gentle swell), on
  // a cell lit over `tone` (none in the moon's shadow). `steep`: the relief's normal is steepened as the
  // surface's is (ground.js: 1.4). `edge2` > 0: a second, inner edge that much higher (b: each lit face
  // ringed twice, the relief engraved like a map).
  ridge: Object.freeze({
    a: Object.freeze({ edge: -0.02, edge2: 0, tone: 0.08, sharp: 0.03, gain: 0.9, steep: 1.4 }),
    b: Object.freeze({ edge: -0.05, edge2: 0.06, tone: 0.08, sharp: 0.03, gain: 0.7, steep: 1.4 }),
  }),
});
