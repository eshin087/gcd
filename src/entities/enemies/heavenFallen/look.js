import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from '../ashDisciple/bodyArt.js';
import { clamp, damp } from '../../../core/math.js';

// Qian Yao's look (STYLE.md "Qian Yao"; the owner picks from rendered sheets):
//   ?fallenLook=a|b|c   his body (gear.js): a the Haloed Exile (recommended), b the Chained Judge,
//                       c the Gilt Guardian. Read when his rig is built.
//   ?fallenArt=ink      the ink-line twin of that body (the look the owner picked for the three other
//                       human bosses); default: the wyrm's art path.
//   ?radiant=a|b        how the sun shows on him: a the whole body blazes white-gold (recommended),
//                       b only the wheel (or the aureole), the eyes and a rim of light.
// How it reads at a glance: radiant, a body blazing white-gold, the wheel lit; dim, a dull bronze-grey
// figure with a dark wheel; an eclipse snaps him dark (fx.eclipse: a ring of steel sparks). Gold is his
// and is no tell (red, blue, white and black stay the tells; cyan stays the hero's).
// dressFallen(d, dt) once a frame (kit.dress): a handful of uniforms, no allocation.

/** The body chosen now: { body: 'a' | 'b' | 'c', art: true for the wyrm's art path }. */
export function fallenLookNow() {
  const o = lookOf('fallenLook', 'a', 'a');
  const body = o === 'b' || o === 'c' ? o : 'a';
  return { body, art: lookOf('fallenArt', 'art', 'art') !== 'ink' };
}

/** The ink-line fills of each body (his material instances' uArtFill; gear.js says which is which). */
export const FALLEN_TINT = {
  a: { coat: [0.78, 0.75, 0.68], collar: [0.78, 0.75, 0.68], lining: [0.26, 0.25, 0.24], hem: [0.82, 0.78, 0.66], shirt: [0.08, 0.075, 0.07], pants: [0.36, 0.36, 0.37], leather: [0.55, 0.38, 0.15], armor: [0.48, 0.36, 0.17], facing: [0.62, 0.43, 0.17], skin: [0.8, 0.6, 0.45], hair: [0.07, 0.065, 0.07], hairTip: [0.1, 0.095, 0.1] },
  b: { coat: [0.42, 0.41, 0.4], collar: [0.74, 0.72, 0.65], lining: [0.72, 0.68, 0.6], hem: [0.22, 0.14, 0.09], shirt: [0.05, 0.05, 0.055], pants: [0.32, 0.32, 0.33], leather: [0.55, 0.38, 0.15], armor: [0.48, 0.36, 0.17], facing: [0.62, 0.43, 0.17], skin: [0.8, 0.6, 0.45], hair: [0.07, 0.065, 0.07], hairTip: [0.1, 0.095, 0.1] },
  c: { coat: [0.74, 0.72, 0.65], collar: [0.74, 0.72, 0.65], lining: [0.24, 0.23, 0.22], hem: [0.78, 0.74, 0.64], shirt: [0.07, 0.065, 0.06], pants: [0.36, 0.36, 0.37], leather: [0.55, 0.38, 0.15], armor: [0.6, 0.44, 0.2], spike: [0.65, 0.48, 0.22], facing: [0.62, 0.43, 0.17], skin: [0.8, 0.6, 0.45], hair: [0.07, 0.065, 0.07], hairTip: [0.1, 0.095, 0.1] },
};
/** The bar (both paths: it stays on the ink-line material). */
const BAR = { trim: [0.6, 0.42, 0.16], bevel: [0.95, 0.8, 0.45], shirt: [0.08, 0.06, 0.04] };
const SUN_GOLD = [1.0, 0.86, 0.52];
const BODY = ['coat', 'collar', 'lining', 'hem', 'pants', 'leather', 'armor', 'spike', 'facing', 'skin', 'hair', 'hairTip', 'shirt'];

/** His colours (the class's _tint): the body's fills on his own material instances. */
export function tintFallen(M) {
  if (!M) return;
  const L = fallenLookNow(), T = FALLEN_TINT[L.body] ?? FALLEN_TINT.a;
  for (const k in T) M[k]?.uniforms?.uArtFill?.value.setRGB(T[k][0], T[k][1], T[k][2]);
  for (const k of ['trim', 'bevel']) {
    const u = M[k]?.uniforms, c = BAR[k];
    u?.uArtFill?.value.setRGB(c[0], c[1], c[2]);
    u?.uInk?.value.setRGB(c[0] * 1.3, c[1] * 1.3, c[2] * 1.3);
    if (u?.uEmissive) u.uEmissive.value.setRGB(1.6, 1.25, 0.6);
  }
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlowMask) fu.uGlowMask.value = 1;
    fu.uInk?.value.setRGB(1.2, 1.05, 0.7);
    fu.uEmissive?.value.setRGB(1.3, 1.05, 0.55);
    fu.uArtFill?.value.setRGB(0.9, 0.78, 0.45);
  }
}

/**
 * Once a frame: the sun on him (d.sun.k 0..1, eclipsed). The light ring (`flask`) glows with it in
 * both looks; ?radiant=a also lights the whole body (the art path: its letters self-lit and their ink
 * warmed; the ink line: its fill lifted toward gold); dim, nothing; an eclipse puts it out at once.
 */
export function dressFallen(d, dt) {
  const M = d?.rig?.materials, S = d?.sun;
  if (!M || !S) return;
  const D = (d._dress ??= { k: 0, base: null, art: !!M.coat?.uniforms?.uWInk });
  if (!D.base) {
    D.base = {};
    for (const n of BODY) {
      const u = M[n]?.uniforms;
      const c = u?.uWInk?.value ?? u?.uArtFill?.value;
      if (c) D.base[n] = [c.r, c.g, c.b, u.uInkGlow?.value ?? 0];
    }
  }
  const want = S.eclipsed ? 0 : clamp(S.k, 0, 1);
  // (an eclipse snaps it dark; the light comes back as it fills)
  D.k = S.eclipsed || !(dt > 0) ? want : damp(D.k, want, 8, dt);
  const k = D.k, whole = lookOf('radiant', 'a', 'a') !== 'b';
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlow) fu.uGlow.value = 0.15 + 1.6 * k;
    if (fu.uInkGlow) fu.uInkGlow.value = 0.1 + 0.9 * k;
    if (D.art) setFill(M.flask, 0.25 + 0.75 * k, 0.2 + 0.66 * k, 0.1 + 0.4 * k);
  }
  const eu = M.eye?.uniforms;
  if (eu?.uInkGlow) eu.uInkGlow.value = (whole ? 0.6 : 1.1) * k;
  const kb = whole ? k : 0;
  if (Math.abs(kb - (D.kb ?? -1)) < 0.004) return;
  D.kb = kb;
  for (const n in D.base) {
    const m = M[n], u = m?.uniforms, b = D.base[n];
    if (!u) continue;
    if (D.art) {
      // the letters warm toward white-gold and light themselves
      setFill(m, b[0] + (SUN_GOLD[0] - b[0]) * 0.55 * kb, b[1] + (SUN_GOLD[1] - b[1]) * 0.55 * kb, b[2] + (SUN_GOLD[2] - b[2]) * 0.55 * kb);
      if (u.uInkGlow) u.uInkGlow.value = b[3] + 0.55 * kb;
    } else {
      const f = 1 + 0.5 * kb;
      setFill(m, Math.min(1.4, (b[0] + (SUN_GOLD[0] - b[0]) * 0.4 * kb) * f), Math.min(1.3, (b[1] + (SUN_GOLD[1] - b[1]) * 0.4 * kb) * f), Math.min(1.0, (b[2] + (SUN_GOLD[2] - b[2]) * 0.4 * kb) * f));
    }
  }
}
