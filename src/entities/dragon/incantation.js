// The wyrm's incantation (ADR-190): the roar that opens a cast spell, and the ring of burning
// incantation glyphs it draws on the ground (or in the air before its jaws), in the fire field's
// small letters (game.fx.fire, docs/STYLE.md "The fire field"). Every roar-cast spell (spellsFire.js,
// broodAttacks.js) calls cast() at its windup and reads back where the circle stands.
//
// STUB (lead, 2026-11-25): the interface is fixed; the brood agent owns this file and draws it.
//   cast({ x, y, z, r, dur, kind, color }) -> id    a circle at (x, y, z), radius r m, burning `dur` s
//                                                   (kind: 'ground' | 'jaws'; color: a fire palette name)
//   flare(id, k)                                    the circle's power 0..1 (the spell releasing)
//   end(id)                                         the circle burns out (fades over a short tail)
//   update(dt)                                      every frame (Dragon.update; never throws)
//   reset()                                         nothing left (death, phase change, the level's reset)
// No per-frame allocations; nothing drawn while no circle burns.

export class Incantation {
  constructor(d) {
    this.d = d;
    this._next = 1;
  }
  cast(o = {}) {
    void o;
    return this._next++;
  }
  flare(id, k) {
    void id;
    void k;
  }
  end(id) {
    void id;
  }
  update(dt) {
    void dt;
  }
  reset() {}
}
