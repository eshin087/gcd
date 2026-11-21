import { LordFx } from '../starlessLord/fx.js';

// Tian Lei's effects: the aura of his forms, his blasts, the beam, the vanish, the transformation.
// All of it is heat in the fire field (STYLE.md "The fire field") and glyph particles of one letter
// cell; look code draws from lr() / lrand(), never from the stream the AI reads.
//
// STUB: every method below is the surface his class and his moves call, drawn as nothing yet. The
// effects' own file replaces this one and keeps these signatures. Positions are world metres;
// `form` is 1..3; a method with `dt` is called every frame while its thing lasts, the others once.
// Thrown things are LordFx's: throwShot({ kind: 'blast' | 'disc', ... }) and callStrike(.., { style: 'bolt' }).

export class AscFx extends LordFx {
  /** Every frame after his pose: the aura of his form (form 1: none). */
  formAura(d, dt, form) {}

  /** A blow's trail off a fist, a foot, an elbow or a knee: the limb's point last frame → now. */
  limbTrail(ax, ay, az, bx, by, bz, form, heavy) {}

  /** A palm's flash as a blast leaves it, along (dx, dz). */
  muzzle(x, y, z, dx, dz, k, form) {}

  /** Energy gathering between the cupped hands through a beam's windup (u 0..1). */
  beamCharge(x, y, z, u, dt, form) {}

  /** The lit beam this frame: muzzle → end, `w` m wide, `k` 0..1 its strength (it fades out by k). */
  beam(ax, ay, az, bx, by, bz, w, k, dt, form) {}

  /** Where the beam ends on something this frame (the floor, a butte, a guard). */
  beamSplash(x, y, z, k, dt, form) {}

  /** The beam clash: the beam's head grinding on the hero's blade at (x, y, z); `k` = the struggle's meter 0..1. */
  beamClash(x, y, z, dx, dz, k, dt, form) {}

  /** The clash won: the beam split in two round (x, z) and on for `len` m along (dx, dz). */
  beamSplit(x, y, z, dx, dz, len, form) {}

  /** He vanishes at (x0, z0) and is at (x1, z1): the shape he leaves, the streak, the dust at both ends. */
  vanish(d, x0, z0, x1, z1, form) {}

  /** The shape he leaves behind as a dash starts. */
  dashGhost(d, form) {}

  /** A shock ring thrown out from his body to `r` m (Aura Burst; a landing). */
  auraBurst(x, z, r, form) {}

  /** The transformation: energy and stones drawn up round him through the windup (u 0..1) ... */
  transformGather(x, z, u, dt, form) {}

  /** ... then the pillar of light and the shock ring out to `r` m as the new form stands. */
  transformNova(x, z, r, form) {}

  /** A heavy blow meets the floor at (x, z): dust, chips, a ring to `r` m; `k` its weight. */
  crater(x, z, r, k) {}
}
