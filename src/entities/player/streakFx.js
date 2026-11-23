// THE STREAK ON THE HERO AND IN THE WORLD (combat/streak.js: the `aura` and `world` pieces). STUB:
// the interface is fixed (main.js builds it as game.fx.streak and updates it on fx time; it hears
// the game's events itself), the drawing is to come.

export class StreakFx {
  constructor(game) {
    this.game = game;
    /** Perfect defences answered so far (tests). */
    this.n = 0;
  }

  /** Per frame, on fx time (it runs on through a hit-stop). Must not throw or allocate. */
  update(dt) {}

  /** Drop everything it draws (a level reset). */
  clear() {}
}
