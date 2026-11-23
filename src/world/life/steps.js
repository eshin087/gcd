// THE STEPS (piece 'steps'): a footstep answers the surface it lands on. STUB: the interface is fixed
// (life.js, "THE CONTRACT"); surfaceAt() answers 'grass' everywhere and a step draws nothing yet.
//
//   steps.surfaceAt(x, z)     what the ground is there: one of SURFACES. Works with the piece off too
//                             (other layers and the audio ask it).
//   steps.step(x, z, o)       a foot came down at (x, z): o { sprint, heavy (a landing), side (-1 right,
//                             1 left), vx, vz }. Draws the surface's answer (a puff, a print).
// With the piece off: step() draws nothing.

export const SURFACES = Object.freeze(['grass', 'earth', 'stone', 'ash', 'obsidian', 'sand', 'leaf']);

export class Steps {
  constructor(life) {
    this.life = life;
  }

  surfaceAt() {
    return 'grass';
  }

  step() {}

  update() {}

  clear() {}

  setVisible() {}

  takes() {
    return false;
  }
}
