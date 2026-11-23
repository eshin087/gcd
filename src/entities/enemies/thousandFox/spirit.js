// The Nine-Tailed Fox (Heaven-Devouring Howl, ADR-151): a creature, so a BODY in the wyrm's art path
// (FLAG.ART; CLAUDE.md "Every NEW creature"). Built once in his constructor (fox.js _setup → beam.js
// FoxHowl), hidden until summoned; no colliders, no hurt spheres, not in `breakables`. Its motion is
// procedural (rise, rear, the jaws open, the head turning with the sweep, dissolve).
//
// Surface (beam.js calls these): new FoxSpirit(d), reset() (hidden), show(x, z, yaw) (placed, rising
// starts), frame(dt, state) (the motion: state = { rise 0..1, rear 0..1, jaw 0..1, turn rad, fade 0..1 }),
// jawPoint(out) (where the dark sun gathers: world metres), visible, hide().
// STUB (contracts commit): the spirit agent builds it.

export class FoxSpirit {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.visible = false;
    this.root = null;
  }

  reset() {
    this.hide();
  }

  show(x, z, yaw) {
    this.visible = true;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
  }

  hide() {
    this.visible = false;
    if (this.root) this.root.visible = false;
  }

  frame(dt, state) {}

  jawPoint(out) {
    return out.set(this.x ?? 0, 6, this.z ?? 0);
  }
}
