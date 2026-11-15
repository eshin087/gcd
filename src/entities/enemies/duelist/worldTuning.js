// What a duelist's blows do to the world (ADR-107; world/breakTuning.js POWER scale: 1 fells a
// tree). Shared by the Ash Disciple and the Starless Lord; an actor's `T.world` overrides fields.
export const DUEL_WORLD = Object.freeze({
  per: 40, // a blade's blow: its damage / per (a cut of 12 → 0.3, an overhead of 24 → 0.6)
  red: 1.25, // a red blow bites harder
  crescent: 0.35, // a crescent of sword qi / red light stopped by cover
  push: 0.6, // the wall of force goes through: what it meets is thrown down ahead of it
  stone: 0.7, // a torn stone stopped by cover
  bigStone: 1.6, // the great stone breaks through
  glaive: 0.5, // the returning blade cuts through
  bolt: 1.5, // Void lightning on the cover the hero stands behind
  grip: 3, // the Crushing Dark closes on the cover instead: it is crushed
  strike: 1.2, // a called bolt / the Dark Star where it lands
  crush: 1.0, // the grip's crush on the floor under the hero
});
