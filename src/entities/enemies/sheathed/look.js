import { lookOf } from '../duelist/lookSwitch.js';

// Lu Wusheng's look switches and his colours in the hero's ink-line art (ADR-152; STYLE.md "The
// Sheathed"). Every one is read when his rig is built (a reload):
//   ?sheathArt=a|0     how his body is printed: a the hero's ink-line art (the owner's pick, 2026-11-22:
//                      the main character's and Shen Hui's), 0 the wyrm's digits (bodyArt.js
//                      toDragonLook, as he shipped in ADR-145)
//   ?sheathTone=a|b|c  the Wanderer's palette in the ink-line art (the owner picks from the sheet; the
//                      fight is built with a): a indigo and sand, b pale and cold, c moss and rust
//   ?sheathMark=a|b|0  a mark of his own (the owner picks; built with a): a a torn strip of cloth tied
//                      to the scabbard's mouth, b a white streak through the hair and its tail, 0 none
// The tones and the mark are the Wanderer's (body d); the other bodies keep their inks as fills.

/** The body this page builds ('a' | 'b' | 'c' | 'd'; gear.js: d the Wanderer, the owner's pick). */
export function sheathLookNow() {
  const o = lookOf('sheathLook', 'a');
  return o === 'b' || o === 'c' || o === 'd' ? o : 'a';
}
/** How his body is printed: 'a' the hero's ink-line art, '0' the wyrm's digits. */
export function sheathArtNow() {
  return lookOf('sheathArt', '0') === 'a' ? 'a' : '0';
}
/** The Wanderer's palette ('a' | 'b' | 'c'). */
export function sheathToneNow() {
  const o = lookOf('sheathTone', 'a');
  return o === 'b' || o === 'c' ? o : 'a';
}
/** His mark ('a' the strip on the scabbard, 'b' the white streak, '0' none): the Wanderer's only. */
export function sheathMarkNow() {
  if (sheathLookNow() !== 'd') return '0';
  const o = lookOf('sheathMark', 'a');
  return o === 'b' || o === '0' ? o : 'a';
}

// ---------------------------------------------------------------- colours (linear fills)
// Which material is which on the Wanderer (gear.js): `coat` / `collar` the robe, `lining` its inside,
// `pants` the wide trousers, `leather` the scarf, `hem` the shin and wrist wraps and the hair tie,
// `shirt` the hair (gear.js: off the `hair` part, whose lines are the hero's gold), the cords and the
// shoes, `skin`; `piping` the torn strip (mark a); the white streak (mark b) is the scabbard's pale
// `facing` (sheathed.js _tint). Dark hair in all three. Measured on the grove's floor at the game
// camera (DEVLOG 2026-11-22): the fills sit about twice the prototype's, which printed him as dark as
// the floor; the scabbard (`trim`, 0.025) stays the darkest fill on him and the drawn blade the
// brightest pixels.
export const SHEATH_TONE = {
  // a: indigo and sand: a faded indigo robe, charcoal trousers, a sand-coloured scarf
  a: {
    coat: [0.33, 0.43, 0.78], collar: [0.33, 0.43, 0.78], lining: [0.08, 0.1, 0.19],
    pants: [0.3, 0.3, 0.33], leather: [1.0, 0.76, 0.4], hem: [0.66, 0.64, 0.6], shirt: [0.05, 0.05, 0.055],
    skin: [0.9, 0.62, 0.44],
  },
  // b: pale and cold: a bone-white robe over slate trousers, a blue-grey scarf
  b: {
    coat: [0.72, 0.7, 0.65], collar: [0.72, 0.7, 0.65], lining: [0.22, 0.22, 0.23],
    pants: [0.26, 0.32, 0.42], leather: [0.42, 0.55, 0.74], hem: [0.14, 0.15, 0.17], shirt: [0.05, 0.05, 0.055],
    skin: [0.9, 0.62, 0.44],
  },
  // c: moss and rust: a moss-green robe over dark brown trousers, a rust scarf
  c: {
    coat: [0.34, 0.5, 0.2], collar: [0.34, 0.5, 0.2], lining: [0.08, 0.11, 0.05],
    pants: [0.3, 0.19, 0.11], leather: [0.95, 0.4, 0.15], hem: [0.6, 0.58, 0.5], shirt: [0.05, 0.05, 0.055],
    skin: [0.9, 0.62, 0.44],
  },
};
/** Mark a's cloth: the torn strip (`piping`), unbleached; under the drawn blade's brightness. */
export const SHEATH_MARK = { strip: [0.86, 0.83, 0.76] };
/** The lift that keeps him readable on the grove's floor: the cool edge of light on the screen's left
 *  (uArtRim) times `rim` on his body's parts, the scarf and the mark a little more. */
export const SHEATH_LIFT = {
  rim: 3.0,
  rimOn: ['coat', 'collar', 'lining', 'pants', 'skin', 'shirt', 'hem'],
  rimMore: { leather: 3.6, piping: 3.6 },
};

/** The Wanderer's colours in the ink-line art (the class's _tint calls it when the print is 'a' and
 *  the body is d): the palette's fills, the marks' cloth, the lift. */
export function tintWanderer(M) {
  if (!M) return;
  const T = SHEATH_TONE[sheathToneNow()];
  const fill = (m, c) => m?.uniforms?.uArtFill?.value.setRGB(c[0], c[1], c[2]);
  for (const k in T) fill(M[k], T[k]);
  fill(M.piping, SHEATH_MARK.strip);
  for (const k of SHEATH_LIFT.rimOn) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= SHEATH_LIFT.rim;
  }
  for (const k in SHEATH_LIFT.rimMore) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= SHEATH_LIFT.rimMore[k];
  }
}
