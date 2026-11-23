import { lookOf } from '../duelist/lookSwitch.js';
import { ART_CLOTH, ART_SKIN } from '../ashDisciple/bodyArt.js';

// Lu Wusheng's look switches and his colours in the hero's ink-line art (ADR-152; STYLE.md "The
// Sheathed"). Every one is read when his rig is built (a reload):
//   ?sheathArt=0|1|2|3|a  how his body is printed, five graded steps (ADR-152; the owner picks; `a`
//                      draws until then): 0 the wyrm's digits as he shipped (ADR-145, his body as it
//                      was), 1 the digits in his palette with a stroke outline, 2 the digits lit and
//                      outlined harder, 3 the hero's ink-line art flattened (flat fills, no fold or
//                      crease lines: the outline and the part edges only), a the hero's ink-line art
//                      (the main character's and Shen Hui's). 1 - a wear his reworked body (gear.js
//                      `sheathTuned`: fuller sleeves, the long robe, fewer small pieces).
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
/** How his body is printed: '0' | '1' | '2' (the wyrm's digits) | '3' | 'a' (the hero's ink-line art). */
export function sheathArtNow() {
  const o = lookOf('sheathArt', '0');
  return o === '1' || o === '2' || o === '3' || o === 'a' ? o : '0';
}
/** True when the print is the wyrm's digits (0, 1, 2): toDragonLook converts the rig. */
export const sheathDigits = () => ['0', '1', '2'].includes(sheathArtNow());
/** True when the Wanderer wears his reworked body (every print but 0, which keeps him as he shipped). */
export const sheathTuned = () => sheathLookNow() === 'd' && sheathArtNow() !== '0';
/** The Wanderer's palette ('a' | 'b' | 'c'). */
export function sheathToneNow() {
  const o = lookOf('sheathTone', 'a');
  return o === 'b' || o === 'c' ? o : 'a';
}
/** His mark ('a' the strip on the scabbard, 'b' the white streak, '0' none): the Wanderer's only. */
export function sheathMarkNow() {
  if (!sheathTuned()) return '0';
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

/** The graded prints between the digits and the ink-line art (`?sheathArt=1|2|3`; 0 and a are the
 *  two ends). 1 and 2 are the wyrm's digits (toDragonLook) with the palette's inks (`ink` x the
 *  palette's fill), the art source's light [gain, key, fresnel, floor] and a stroke outline that
 *  reaches further in (`strokeEdge`, lower = wider) in a paler ink (`rimInk` x the ink); 3 is the
 *  ink-line art with its interior lines dropped (`flat`: the cloth's fold and band sub-pieces folded
 *  into one, sheathed.js _setup), no glints, no fold shading and half the rim lift. */
export const SHEATH_STEP = Object.freeze({
  1: { ink: 0.42, light: [1.0, 0.8, 0.4, 0.03], strokeEdge: 0.3, rimInk: 2.0 },
  2: { ink: 0.5, light: [1.1, 0.95, 0.6, 0.1], strokeEdge: 0.12, rimInk: 3.0 },
  3: { flat: true, rim: 1.5 },
});
/** The cloth materials a flat print folds into one piece each (their aPart sub-pieces). */
export const SHEATH_FLAT = ['coat', 'collar', 'lining', 'pants', 'leather', 'hem', 'shirt', 'piping'];

/** The art sources of print 1 or 2 (gear.js hands it to toDragonLook): `base` (SHEATH_ART.d, the
 *  Wanderer's digits as he shipped) with the palette's colours and the step's light and outline. */
export function wandererDigits(base, step = sheathArtNow()) {
  const S = SHEATH_STEP[step];
  if (!S?.ink) return base;
  const T = SHEATH_TONE[sheathToneNow()];
  const k = (c, f) => c.map((x) => Math.min(1, x * f));
  const cloth = (c, o = {}) => ({ ...ART_CLOTH, light: S.light, strokeEdge: S.strokeEdge, ink: k(c, S.ink), rimInk: k(c, S.ink * S.rimInk), ...o });
  const out = { ...base };
  // (the trousers and the wraps a step darker than in the ink-line art: neutral greys print near white
  // in the digits, and the trousers must stay darker than the robe)
  const dim = { pants: 0.72, hem: 0.8 };
  for (const n of ['coat', 'collar', 'lining', 'pants', 'leather', 'hem']) out[n] = cloth(T[n].map((x) => x * (dim[n] ?? 1)));
  // the hair and the shoes dark, their outline a cool grey that still reads on the floor
  out.hair = cloth([0.09, 0.075, 0.065], { rimInk: [0.34, 0.34, 0.4] });
  out.hairTip = out.hair;
  out.shirt = cloth([0.06, 0.06, 0.065], { rimInk: [0.3, 0.3, 0.34] });
  out.skin = { ...ART_SKIN, light: [S.light[0], 0.7, 0.2, S.light[3] + 0.03], ink: k(T.skin, S.ink * 0.85) };
  return out;
}

/** The Wanderer's colours in the ink-line art (the class's _tint calls it when the print is 3 or a
 *  and the body is d): the palette's fills, the marks' cloth, the lift; print 3 flattened. */
export function tintWanderer(M, step = sheathArtNow()) {
  if (!M) return;
  const T = SHEATH_TONE[sheathToneNow()];
  const flat = !!SHEATH_STEP[step]?.flat;
  const fill = (m, c) => m?.uniforms?.uArtFill?.value.setRGB(c[0], c[1], c[2]);
  for (const k in T) fill(M[k], T[k]);
  fill(M.piping, SHEATH_MARK.strip);
  const lift = flat ? SHEATH_STEP[step].rim / SHEATH_LIFT.rim : 1;
  for (const k of SHEATH_LIFT.rimOn) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= SHEATH_LIFT.rim * lift;
  }
  for (const k in SHEATH_LIFT.rimMore) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= SHEATH_LIFT.rimMore[k] * lift;
  }
  if (!flat) return;
  // flat: no glints and no fold shading on the cloth (its interior lines are folded away in _setup)
  for (const k of [...SHEATH_FLAT, 'skin']) {
    const u = M[k]?.uniforms;
    if (u?.uArtSpec) u.uArtSpec.value.x = 0;
    if (u?.uArtSub) u.uArtSub.value = 0;
  }
}
