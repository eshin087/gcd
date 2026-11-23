import { AscFx } from '../ascendant/fx.js';
import { FIRE_PALETTES } from '../../../render/firePalettes.js';

// Xin Yi's effects (ADR-156): Tian Lei's effects class (AscFx: LordFx's pool of thrown things grown to
// 24, blasts that cover stops, the perfect parry's return, the vanish, the craters, the stance's glow)
// with the CODE palette in the fire field's void slot (FIRE_PALETTES.code: here K_VOID is the falling
// script's green). Every effect of his prints in it: the shots and their trails, the palm's stilled air,
// the afterimages' glow, the shock fronts, the Bend's wake. TELLS KEEP THEIR COLOURS (white, blue, red,
// black: the engine's tellFlash / hazardFlash): nothing green is ever a cue.
//
// THE CONTRACT (wokenOne.js and iron.js / one.js call these; world metres, `ph` = phase 1..3; a method
// with `dt` is called every frame while its thing lasts, the others once). Inherited from AscFx and used
// as they are: throwShot / updateShots (blasts: `kind: 'blast'`, `size`, `returnable`; the Lord's
// 'stone'), muzzle, crater, vanish, stanceGlow, transformGather, transformNova, limbTrail, ghost, flit.
//   shotTrail(s)                          (the blasts' drawing: a short bright slug and its trail; AscFx._drawBlast)
//   bendWake(d, dx, dz)                   THE BEND: thin rings in the shot's wake over his chest, three afterimages
//   afterimages(d, n)                     n afterimages where he stands (the Lean: one)
//   heldBolt(x, y, z, k, dt)              a returned bolt hanging before his palm (THE STOP)
//   stopHum(x, y, z)                      the moment a bolt stops in the air
//   sendBurst(x, y, z)                    the sent bolts burst (on the guard or on a parry)
//   codeColumn(x0, z0, x1, z1)            SKIPPED FRAMES: he tears into a column of digits, prints again
//   riseBurst(x, z, r)                    Leaving the Floor: the ring as he goes up
//   front(x, z, r, w, dt)                 the Falling Fist's front: a ring of heaving letters at r
//   passWake(ax, az, bx, bz, y)           the Low Pass's wake along its line
//   diveStream(d, k, dt)                  the Dive Within's charge: the hall's letters stream into his chest
//   gunsAway(d)                           the reload: both guns clatter away as loose digits
//   palmHold(d, dt)                       the Still Hand held after the rising (the air stilled round it)
//   lockStream(x, y, z, dt)               the blade lock on his palm: letters streaming round it
//   fallStill(d)                          THE FALL: the moment he lands on his back
// THE EFFECTS AGENT'S FILE: the lead's stub draws them with the inherited pieces.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class WokenFx extends AscFx {
  constructor(d) {
    super(d);
    // the code's green in the fire field: this level borrows the void slot (AscFx set gold first)
    this.game.fx?.fire?.setPalette?.('void', FIRE_PALETTES.code);
  }

  bendWake(d, dx, dz) {
    this.afterimages(d, 3);
    const c = this._chest(d);
    this.muzzle(c.x, c.y + 0.2, c.z, fin(dx), fin(dz, 1), 0.6, 2);
  }

  afterimages(d, n = 1) {
    for (let i = 0; i < n; i++) this.ghost?.(d);
  }

  heldBolt(x, y, z, k = 1) {
    this.muzzle(x, y, z, 0, 1, 0.25 * k, 3);
  }

  stopHum(x, y, z) {
    this.muzzle(x, y, z, 0, 1, 0.6, 3);
  }

  sendBurst(x, y, z) {
    this.muzzle(x, y, z, 0, 1, 1, 3);
  }

  codeColumn(x0, z0, x1, z1) {
    this.flit?.(x0, z0, x1, z1);
  }

  riseBurst(x, z, r) {
    this.crater?.(x, z, r * 0.5, 0.6);
  }

  front() {}

  passWake() {}

  diveStream() {}

  gunsAway() {}

  palmHold(d, dt) {
    this.stanceGlow?.(d, dt, 3);
  }

  lockStream() {}

  fallStill(d) {
    this.dust?.(d.position.x, d.position.z, 1);
  }
}
