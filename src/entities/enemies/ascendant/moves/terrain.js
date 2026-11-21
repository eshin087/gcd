// Tian Lei's terrain moves (MOVES.md: Tile Kick, Ring Breaker, Stone Storm): pieces of the ring's floor
// stamped up, thrown and broken. THE TERRAIN AGENT'S FILE.
//
// A move file is a function of the builders object `X` (ascendant/moves.js header) returning
// { name: move }. A move marked `terrain: '<kind>'` has its hooks routed to the actor's `d.terrain`
// (ascendant/terrain.js TerrainMoves; the routing contract: the top of ascendant/ascendant.js). Every
// beat here is a `cast` with `selfCue`: what it throws or bursts carries its own cue (the flare on the
// tile, flashLead before it reaches the hero), and the brain sends none for the beat itself.
// What each does, and its numbers: TerrainMoves (terrain.js) and TUNING.terrain (tuningTerrain.js).
export function terrainMoves(X) {
  const { TELL: { N, R }, punch } = X;
  /** A cast beat out of a blow's keys: fixed (the tile's cue is the timing), he stays where he is. */
  const cast = (beat, kind, o = {}) => ({ ...beat, fixed: true, cast: { kind, selfCue: true }, close: 0, track: 0.85, ...o });
  return {
    /** Tile Kick: he stamps, a tile jumps up out of the ring before him, and his cross sends it at the
     *  hero (a parry cuts it, cover stops it; the tile's place is left broken). */
    tileKick: {
      label: 'Tile Kick', phase: 1, weight: [1.8, 1.2, 0], cooldown: 9, band: [3.5, 14], recovery: 0.6, terrain: 'tileKick', cat: 'terrain',
      beats: [cast(punch('cross', N, 0.8, 16, { cock: 0.72 }), 'tileKick', { knockback: 2.2 })],
    },
    /** Ring Breaker: both fists into the floor; tiles burst up in a line toward the hero, one after
     *  another (red: step off the line, or roll at the tile under you). */
    ringBreaker: {
      label: 'Ring Breaker', phase: 2, weight: [0, 1.3, 1.2], cooldown: 10, band: [3.5, 14], recovery: 0.55, terrain: 'ringBreaker', cat: 'terrain',
      beats: [cast(punch('hammer', R, 0.9, 22), 'ringBreaker', { knockdown: true, knockback: 3.5, track: 0.9, ring: 1.2 })],
    },
    /** Stone Storm: his aura tears three tiles up round him; they leave one after another (normal,
     *  a guard), then the great one (red, a knockdown). */
    stoneStorm: {
      label: 'Stone Storm', phase: 2, weight: [0, 1.6, 1.6], cooldown: 11, band: [4, 15], recovery: 0.6, terrain: 'stoneStorm', cat: 'terrain',
      beats: [
        cast(punch('double', N, 0.95, 14), 'stormThrow', { knockback: 2.2, track: 0.8 }),
        cast(punch('palm', R, 1.5, 26), 'stormGreat', { knockdown: true, knockback: 4.5, track: 0.8 }),
      ],
    },
  };
}
