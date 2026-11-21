// Tian Lei's ki moves (MOVES.md: Spirit Shot, Scatter, Rising Tide, Blast Dance, Golden Rain, Sun Wheel,
// the sweeping and twin tides, Heaven's Volley, Thunder Gates, Lightning Lance, Storm Cage, the great
// beam, Mirage, Heavenfall ...): blasts, beams, discs and called strikes. THE KI AGENT'S FILE.
//
// A move file is a function of the builders object `X` (ascendant/moves.js header: punch, kick,
// elbow, shoulder, strikeKeys, F, mirror, W, TELL, TUNING ...) returning { name: move }. A move (or
// one beat of a string) marked `ki: '<kind>'` has its hooks routed to the actor's `d.ki` (ascendant/
// ki.js KiMoves; the routing contract: the comment at the top of ascendant/ascendant.js).
export function kiMoves(X) {
  void X;
  return {};
}
