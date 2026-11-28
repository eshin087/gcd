import { lookOf } from '../duelist/lookSwitch.js';
import { isDragonLook, setFill } from '../ashDisciple/bodyArt.js';
import { FOX_INK, FOX_INK_RIM } from './bodyArt.js';
import { applyLimbs } from './limbs.js';

// Wen Yao's look options (duelist/lookSwitch.js; never in PICKED: the owner picks from the sheets):
//   ?foxLook=h1|h2|h3|a|b|c|d   his body. In the hero's INK-LINE art (bodyArt.js FOX_INK), drawn as dense
//                      and bright as the hero: h1 the Wild Fox, bright (the default: a russet crest with
//                      pale tips, a short amber jacket, a long vermilion scarf), h2 the same figure in a
//                      vermilion jacket and a black scarf, h3 a long sleeveless pale coat lined in
//                      vermilion; d the Shrine Fox (a). Through the wyrm's art path (bodyArt.js FOX_ART;
//                      the figures the fight shipped with, PR #84): a the Shrine Fox, b the Wild Fox, c the
//                      Pelt Brawler. Read when a rig is built (gear.js).
//   ?foxfire=a|b|c     the foxfire's colour (fx.js): a jade, b the wyrm's orange, c moon-white
//   ?clones=a|b        the paper selves: a identical to him, b a step paler (tintFox `pale`)
//   ?foxLetters=a|b    his ink-line letters: a a fixed cell (as the other bosses), b they follow his size
//                      on screen as the hero's do (FOX_KIT.letters, render/pipeline.js)
//   ?foxFire3=a|b      phase 3's fire (the mantle, the Nine-Tailed Fox, its beam): a the wyrm's orange-red,
//                      b jade (fx.js FIRE3)
//   ?foxSpirit=a|b     the Nine-Tailed Fox: a a body in the wyrm's art path wreathed in fire, b fire and
//                      ink lines only (spirit.js, fxBeam.js)
// (foxLook's default is h1: the owner could not see him in the art path, "make it look detailed like the
// main character", 2026-11-22; still the owner's pick: lookSwitch.js PENDING)
export const FOX_LOOKS = Object.freeze({ foxLook: 'h1', foxfire: 'c', clones: 'a', foxLetters: 'b', foxFire3: 'a', foxSpirit: 'a' });
export const foxLook = (name) => lookOf(name, FOX_LOOKS[name] ?? 'a');

/** The ink-line outfits of the h family: the figure each builds (gear.js: 'h' the short jacket, 'h3'
 *  the long coat). */
const H_BASE = { h1: 'h', h2: 'h', h3: 'h3' };

/** The outfit a rig is built in: { id: the option, base: the figure gear.js builds ('a' | 'b' | 'c' |
 *  'h' | 'h3'), art: drawn in the wyrm's art path (false: the ink-line art, d and the h outfits) }. An
 *  unknown value draws the default (h1). */
export function foxLookNow() {
  const o = foxLook('foxLook');
  if (o === 'd') return { id: 'd', base: 'a', art: false };
  if (o === 'a' || o === 'b' || o === 'c') return { id: o, base: o, art: true };
  const id = H_BASE[o] ? o : 'h1';
  return { id, base: H_BASE[id], art: false };
}

/** What a paper self drawn a step paler (?clones=b) is mixed toward: paper, a warm off-white. */
const PAPER = [0.62, 0.6, 0.55];
/** How far toward it (the share of PAPER in each part's colour), and the floor of light the art path
 *  gives the paler self everywhere (uWLight.w: the shadowed side of a sheet of paper is not black). */
export const PALE = { mix: 0.3, floor: 0.08 };

const mixTo = (c, t) => [c[0] + (PAPER[0] - c[0]) * t, c[1] + (PAPER[1] - c[1]) * t, c[2] + (PAPER[2] - c[2]) * t];
const rgbOf = (m) => {
  const u = m?.uniforms, c = u?.uWInk?.value ?? u?.uArtFill?.value;
  return c ? [c.r, c.g, c.b] : null;
};

/**
 * His colours on a rig's own material instances, once after the rig is built (the class's _tint for
 * him, _tintSelf for each paper self). The art path's colours are its sources' inks (bodyArt.js
 * FOX_ART, set when the rig was converted): nothing to write. The ink-line outfits write their fills
 * (bodyArt.js FOX_INK[option]) and the h outfits their edge of light (FOX_INK_RIM). `pale`
 * (?clones=b): every part a step toward paper and a little light in its shadows; the tones keep their
 * order, so the self reads as a paler copy of him, not as someone else.
 */
export function tintFox(M, { pale = false } = {}) {
  if (!M) return;
  const art = isDragonLook(M);
  if (!art) {
    const L = foxLookNow();
    const T = FOX_INK[L.id] ?? FOX_INK.d;
    for (const k in T) setFill(M[k], ...T[k]);
    if (L.base[0] === 'h') {
      for (const k of FOX_INK_RIM.on) {
        const u = M[k]?.uniforms?.uArtRim;
        if (u) u.value *= FOX_INK_RIM.k;
      }
    }
  }
  if (!pale) return;
  for (const k in M) {
    const m = M[k], c = rgbOf(m);
    if (!c) continue;
    setFill(m, ...mixTo(c, PALE.mix));
    const L = m.uniforms.uWLight?.value;
    if (L) L.w = Math.max(L.w, PALE.floor);
  }
}

/** The body's dressing each frame (duelist kit.dress). His figure does not change by phase (the
 *  mantle of phase 3 is fire in fx.js); his animator takes the limbs pass's reach (limbs.js, ADR-249). */
export function dressFox(d) {
  applyLimbs(d?.anim);
}
