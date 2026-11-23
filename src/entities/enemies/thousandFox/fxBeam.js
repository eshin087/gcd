// Heaven-Devouring Howl's drawing (ADR-151; STYLE.md "The fox's effects"): pure draw helpers that take
// the FX (`d.fx`, a FoxFx: DuelFx's _blob / _dot / _ink / _frame / _toCamera / _axes) as their first
// argument. Heat in the fire field, small letters; look code draws from fx.kr(), never Math.random.
//
// Surface (beam.js calls these):
//   summonRing(fx, x, z, r, k, dt)        the ring of script burning out on the floor round him (k 0..1)
//   darkSun(fx, x, y, z, u, dt)           the black sphere gathering at the jaws (u 0..1 through the charge)
//   beamMark(fx, x0, z0, x1, z1, w, k, dt)   the strip's ground heating before it fires (k 0..1)
//   beamBody(fx, x0, y0, z0, x1, z1, w, t, dt)   the beam lit: jaws → down into the terrace → along the strip
//   spiritFire(fx, spirit, k, dt)         the fire at the creature's edges and tail tips
//   spiritEnd(fx, spirit)                 it goes up in embers (once)
// STUB (contracts commit): the spirit agent writes them.

export function summonRing(fx, x, z, r, k, dt) {}
export function darkSun(fx, x, y, z, u, dt) {}
export function beamMark(fx, x0, z0, x1, z1, w, k, dt) {}
export function beamBody(fx, x0, y0, z0, x1, z1, w, t, dt) {}
export function spiritFire(fx, spirit, k, dt) {}
export function spiritEnd(fx, spirit) {}
