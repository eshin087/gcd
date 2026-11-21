// Tian Lei's terrain moves (MOVES.md: Tile Kick, Ring Breaker, Stone Storm, the craters ...): pieces of
// the ring's floor stamped up, thrown and broken. THE TERRAIN AGENT'S FILE.
//
// A move file is a function of the builders object `X` (ascendant/moves.js header) returning
// { name: move }. A move marked `terrain: '<kind>'` has its hooks routed to the actor's `d.terrain`
// (ascendant/terrain.js TerrainMoves; the routing contract: the top of ascendant/ascendant.js).
export function terrainMoves(X) {
  void X;
  return {};
}
