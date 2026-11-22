import { lookOf } from '../duelist/lookSwitch.js';

// Gu Shan's look: which outfit his rig is built in, his colours, and what his gear shows by phase.
// The duelist calls dressHermit(d, dt) once a frame (kit.dress) and tintHermit(M) once after his rig
// is built (the class's _tint). The outfits themselves are gear.js; the wyrm art path's colours are
// bodyArt.js HERMIT_ART.
//
//   `?hermitLook=` (read when his rig is built; lookSwitch PICKED hermitLook 'a'):
//   a   the Straw Recluse (the author's pick; the fight is built with it): a ragged straw rain cape
//       over a patched hemp robe, the sleeves rolled to the elbow, white hair in a loose topknot with
//       a wooden pin, a long white beard, a wine gourd at the hip, bare feet, wooden beads on the
//       right wrist.
//   b   the Woodcutter: broad, a sleeveless hemp vest over a bare chest, a rope belt, an empty axe
//       sling and a bundle of firewood on his back, a headscarf, cloth-wrapped forearms, dark hair.
//   c   the Ascetic: lean, a faded robe over one shoulder, grey hair unbound down his back, a great
//       string of wooden beads across the chest, eyes shut.
//   a0  outfit a in the INK-LINE art the three earlier human bosses wear (the hero's own material
//       set, recoloured by tintHermit). a, b and c are drawn through the WYRM's art path (CLAUDE.md:
//       new characters are drawn this way; bodyArt.js).
//
// By phase: phases 1 - 2 he fights with the right hand, the left held at the small of his back;
// phase 3 (BOTH HANDS) the left comes out. Nothing he wears hides that hand (the cape, the hair and
// the firewood end above it), so no piece has to change: the switch below is there for a piece that
// should (gear.js registers it with `at`), and costs nothing when none does.

const LOOKS = ['a', 'b', 'c', 'a0'];

/** The outfit chosen (`?hermitLook=`, read when his rig is built): 'a' | 'b' | 'c' | 'a0'. */
export function hermitLookNow() {
  const o = lookOf('hermitLook', 'a', 'a');
  return LOOKS.includes(o) ? o : 'a';
}

/** The chosen outfit as { base: 'a' | 'b' | 'c' (what he wears), art: true when drawn through the
 *  wyrm's art path (all but a0) }. */
export function hermitLook() {
  const o = hermitLookNow();
  return { id: o, base: o === 'a0' ? 'a' : o, art: o !== 'a0' };
}

/** The dressing record on his rig (gear.js registers the pieces that switch by phase in it). */
export function dressOf(root, look = 'a') {
  return (root.userData.dress ??= { kind: 'hermit', look, phase: 0, at: [] });
}
/** Show mesh `m` from phase `from` to phase `to` (hidden until then; phase 1 is the build's state). */
export function at(D, m, from, to = 9) {
  D.at.push({ m, from, to });
  m.visible = from <= 1 && to >= 1;
}

// ---------------------------------------------------------------- colours (linear)
/** Outfit a in the ink-line art (a0): the fill of each of his material instances (gear.js says which
 *  is which). Dark cloth that the white hair and the straw stand out of. */
export const HERMIT_TINT = {
  a: {
    coat: [0.3, 0.27, 0.21], // the hemp robe
    lining: [0.12, 0.1, 0.08],
    facing: [0.16, 0.17, 0.22], // its patches, the rolled cuffs
    leather: [0.5, 0.4, 0.2], // the straw cape
    welt: [0.36, 0.28, 0.14],
    collarIn: [0.2, 0.15, 0.07],
    hem: [0.9, 0.9, 0.86], // the white hair and beard
    shirt: [0.06, 0.055, 0.05], // the sash, the collar band
    pants: [0.2, 0.19, 0.16],
    trim: [0.3, 0.17, 0.08], // the wooden beads, the hair pin
    piping: [0.55, 0.36, 0.13], // the gourd
    skin: [0.78, 0.56, 0.4],
  },
};

/** His colours (the class's _tint): outfit a's fills on HIS material instances (the ink-line art's
 *  uArtFill). In the wyrm's art path (a, b, c) the art source's ink holds the colours and this finds
 *  no uArtFill: nothing to do. */
export function tintHermit(M) {
  if (!M) return;
  const T = HERMIT_TINT[hermitLook().base];
  if (!T) return;
  for (const k in T) M[k]?.uniforms?.uArtFill?.value.setRGB(T[k][0], T[k][1], T[k][2]);
}

/**
 * Once a frame (kit.dress): show the pieces of his phase (a phase change flips their `visible`
 * flags; otherwise one comparison). No allocation.
 */
export function dressHermit(d) {
  const D = d?.rig?.root?.userData?.dress;
  if (!D || D.kind !== 'hermit') return;
  const n = Math.min(3, Math.max(1, (d.dressPhase ?? d.phase) | 0));
  if (n === D.phase) return;
  D.phase = n;
  for (const e of D.at) e.m.visible = n >= e.from && n <= e.to;
}
