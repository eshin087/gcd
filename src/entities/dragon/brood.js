// The wyrm's brood (ADR-190): small fire creatures it calls up with a roar, which fight on their own
// beside it: fire drakelings (circle the hero, lunge, die to one or two cuts, dive in and burst when
// their time runs out) and kamikaze wisps (peel off its body, home in on the hero in a staggered line,
// burst with a red tell; cut them down or roll through). They are bodies of fire: drawn as heat in
// the fire field (game.fx.fire) or through the wyrm's art path, never big glyph sprites (CLAUDE.md).
//
// STUB (lead, 2026-11-25): the interface is fixed; the brood agent owns this file.
//   spawn(kind, o) -> id   kind 'drakeling' | 'wisp'; o: { x, y, z, ... } where it leaves the wyrm
//   count(kind?)           how many live (the AI's weight reads it: no new brood while one lives)
//   update(dt)             every frame (Dragon.update; never throws)
//   clear()                all burst harmlessly (phase change roar, like hazards.clear)
//   reset()                nothing left (death, the level's reset)
// Hero blows reach them through whatever the hero already strikes (the brood agent finds the seam
// and documents it in docs/ARCHITECTURE.md); their hits on the hero go through dragon.hitPlayer
// with a tell (normal / blue / red), like every boss blow.

export class Brood {
  constructor(d) {
    this.d = d;
    this._next = 1;
  }
  spawn(kind, o = {}) {
    void kind;
    void o;
    return 0;
  }
  count(kind) {
    void kind;
    return 0;
  }
  update(dt) {
    void dt;
  }
  clear() {}
  reset() {}
}
