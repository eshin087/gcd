import { lookOf } from '../duelist/lookSwitch.js';

// Wen Yao's look options (duelist/lookSwitch.js; never in PICKED: the owner picks from the sheets):
//   ?foxLook=a|b|c|d   a the Shrine Fox (the fight is built with it), b the Charm-Bearer, c the Fox
//                      Captain, d outfit a in the ink-line art the other human bosses ship in. Read when
//                      a rig is built.
//   ?foxfire=a|b|c     the foxfire's colour (fx.js): a jade, b the wyrm's orange, c moon-white
//   ?clones=a|b        the paper selves: a identical to him, b a step paler
export const FOX_LOOKS = Object.freeze({ foxLook: 'a', foxfire: 'a', clones: 'a' });
export const foxLook = (name) => lookOf(name, FOX_LOOKS[name] ?? 'a');

/** His colours on a rig's own material instances (the hero's set, recoloured). `pale`: a paper self
 *  drawn a step paler (?clones=b). STUB colours until the body is built. */
export function tintFox(M, { pale = false } = {}) {
  const k = pale ? 1.45 : 1;
  const fill = (m, r, g, b) => m?.uniforms?.uArtFill?.value.setRGB(Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k));
  fill(M.coat, 0.12, 0.12, 0.2); // charcoal-indigo robe
  fill(M.lining, 0.06, 0.06, 0.09);
  fill(M.hem, 0.78, 0.76, 0.7); // bone: the mask, the fur
  fill(M.shirt, 0.05, 0.05, 0.06);
  fill(M.pants, 0.1, 0.1, 0.14);
  fill(M.leather, 0.62, 0.6, 0.55);
  fill(M.trim, 0.3, 0.22, 0.12);
  fill(M.facing, 0.5, 0.12, 0.08); // the dull vermilion sash
  fill(M.armor, 0.5, 0.52, 0.56);
  fill(M.bevel, 0.7, 0.72, 0.76);
  fill(M.hair, 0.05, 0.05, 0.06);
}

/** The body's dressing each frame (duelist kit.dress). Nothing yet. */
export function dressFox() {}
