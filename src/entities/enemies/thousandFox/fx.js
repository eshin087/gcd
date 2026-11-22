import { DuelFx, K_STEEL, K_VOID, K_SMOKE } from '../duelist/fx.js';
import { FIRE_PALETTES } from '../../../render/firePalettes.js';
import { lookOf } from '../duelist/lookSwitch.js';

// Wen Yao's effects (ADR-131; STYLE.md "The fox's effects"). All of it is heat in the fire field (small
// letters; many small cool blobs, at least 0.7 m up, never one big hot one) and glyph particles of one
// letter cell (paper slips, sparks). Look code draws from its own seeded stream, never Math.random and
// never the gameplay streams.
//
// FOXFIRE is a palette, not a kind: this level swaps the VOID slot (FireField.setPalette('void', ...),
// as the Skybreak Ring does for gold): here K_VOID IS FOXFIRE. `?foxfire=` a jade (the default), b the
// wyrm's orange `fire` kind (no swap: the heat is drawn as K_FIRE), c moon-white.
//
// THE SURFACE (fox.js, clones.js and pearl.js call these; positions are world metres; a method with `dt`
// is called every frame while its thing lasts, the others once). STUB: every method is a no-op until the
// effects are built; the names and arguments are fixed.
//   pearlCharge(x, y, z, u, dt)           the Pearl over the blade's tip, u 0..1 through the charge
//   pearlThread(ax, ay, az, bx, by, bz, dt)   a crisp thread from a self's hand (a) to the Pearl (b)
//   pearlFly(x, y, z, dt)                 a batted pearl in flight
//   pearlMark(x, z, r, k, dt)             the ground it will burst on heating, k 0..1 to the burst
//   pearlBurst(x, z, r)                   it bursts (once)
//   pearlFizzle(x, y, z)                  it comes apart (in his hand, or uncued in the air)
//   greatPearl(x, y, z, u, dt)            the Moon-Swallowing Pearl going dark over his head
//   greatBurst(x, z, r)                   where he lands with it
//   cloneSpawn(x, z)                      a paper self tears free here
//   clonePop(x, y, z, by)                 a paper self pops (pale one-cell paper slips, a little smoke)
//   cloneBurn(x, y, z, tx, ty, tz, k)     phase 3's change: a self burns up and streams into him
//   mantle(d, dt, k)                      the Fox-Fire Mantle, k 0..1 as it grows in
//   tailSweep(x, z, r)                    Burning Brush's tail goes round (once)
//   pounceLand(x, z, r)                   the pounce lands (once)
export class FoxFx extends DuelFx {
  constructor(d) {
    super(d);
    this.look = lookOf('foxfire', 'a');
    const pal = this.look === 'c' ? FIRE_PALETTES.moon : this.look === 'b' ? null : FIRE_PALETTES.foxfire;
    if (pal) this.game.fx?.fire?.setPalette?.('void', pal);
    /** the kind foxfire is drawn as (K_VOID with a palette swapped in; the wyrm's fire for look b) */
    this.FOX = K_VOID;
    this._ks = 0x7f4a7c15;
  }

  reset() {
    super.reset();
  }

  pearlCharge() {}
  pearlThread() {}
  pearlFly() {}
  pearlMark() {}
  pearlBurst() {}
  pearlFizzle() {}
  greatPearl() {}
  greatBurst() {}
  cloneSpawn() {}
  clonePop() {}
  cloneBurn() {}
  mantle() {}
  tailSweep() {}
  pounceLand() {}
}

export { K_STEEL, K_SMOKE };
