import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from '../ashDisciple/bodyArt.js';

// Tian Lei's body by form: what his gear shows, hides and recolours when his form changes (his hair
// above all), and his colours. The duelist calls dressAscendant(d, dt) once a frame (kit.dress) and
// tintAscendant(M) once after his rig is built (the class's _tint).
//
//   form 1  the Challenger: his dark hair (option a a topknot and a tail, b a loose mane, c a braid).
//   form 2  Golden Ascension: the hair risen and gold, lit from within (it breathes); the edges of his
//           clothes catch the gold (a band of light along the tunic's collar and hems, the wraps
//           pale gold, light at the wrists; c: the prayer beads' light).
//   form 3  Thunder Ascension: the hair stiffer, sharper, longer, its light paler and hotter; the
//           fists and the eyes burn; a: the tunic torn off his left shoulder; b: the half-robe torn
//           to rags; c: the cross-wrap and the shoulder cloth gone, bare-chested.
// Each step is one big change of silhouette (the head above all) or one line of light.
//
// Every switched piece is built by gear.js, kept out of the static merge, hidden or shown here when
// d.phase changes (a few `visible` flags); the light is the rig's `flask` instance (never drawn as
// a flask on him) and his own `hair` / `hairTip` instances: no new material, so no new draw call
// beyond the switched meshes themselves. Per frame otherwise: four uniforms (the glow breathing).

/** The option chosen (`?ascLook=`, read when his rig is built): { base: 'a' | 'b' | 'c' (the outfit),
 *  art: true for d (outfit a in the dragon look) }. */
export function ascLookNow() {
  const o = lookOf('ascLook', 'a', 'a');
  if (o === 'd') return { base: 'a', art: true, id: 'd' };
  return { base: o === 'b' || o === 'c' ? o : 'a', art: false, id: o === 'b' || o === 'c' ? o : 'a' };
}

/** The dressing record on his rig (gear.js registers the switched pieces in it). */
export function dressOf(root, look = 'a') {
  return (root.userData.dress ??= { kind: 'asc', look, phase: 0, at: [], base: null });
}
/** Show mesh `m` from form `from` to form `to` (hidden until then; form 1 is the build's state). */
export function at(D, m, from, to = 9) {
  D.at.push({ m, from, to });
  m.visible = from <= 1 && to >= 1;
}

// ---------------------------------------------------------------- colours (linear)
/** Per outfit, form 1 (the ink-line fill of each of his material instances; gear.js says which is
 *  which). Checked against a gold-orange field (his aura in forms 2 - 3): no part of his body is gold
 *  but the hair and the light; the cloth is a deep colour that the gold sits behind. */
export const ASC_TINT = {
  // the Challenger's tunic: crimson, a black sash, pale grey trousers, off-white wraps
  a: {
    coat: [0.7, 0.12, 0.08], lining: [0.18, 0.03, 0.03], leather: [0.05, 0.045, 0.05], pants: [0.44, 0.42, 0.46],
    hem: [0.7, 0.67, 0.6], collar: [0.06, 0.05, 0.05], shirt: [0.035, 0.03, 0.035], skin: [0.85, 0.57, 0.4],
  },
  // the brawler: a teal half-robe, a red sash, dark grey trousers
  b: {
    coat: [0.09, 0.32, 0.38], lining: [0.03, 0.09, 0.11], leather: [0.66, 0.1, 0.06], pants: [0.3, 0.3, 0.34],
    hem: [0.7, 0.67, 0.6], collar: [0.06, 0.05, 0.05], shirt: [0.035, 0.03, 0.035], skin: [0.85, 0.56, 0.39],
  },
  // the monk: a slate-blue robe, a rust-red shoulder cloth, dark wood beads, a brown sash
  c: {
    coat: [0.34, 0.4, 0.56], lining: [0.08, 0.1, 0.14], facing: [0.62, 0.16, 0.08], leather: [0.2, 0.13, 0.08],
    trim: [0.3, 0.16, 0.07], pants: [0.38, 0.38, 0.42], hem: [0.68, 0.65, 0.58], collar: [0.06, 0.05, 0.05],
    shirt: [0.035, 0.03, 0.035], skin: [0.85, 0.57, 0.4],
  },
};

/** By form: the gold hair (fill, its tips, the letters' ink and how much they light themselves),
 *  the wraps (`hem`), the light (`flask`: fill, ink, emissive, glow). */
const FORM = {
  2: {
    hair: [0.95, 0.64, 0.13], hairTip: [1.0, 0.8, 0.28], ink: [1.0, 0.74, 0.24], inkGlow: 0.45, glowK: 0.55,
    hem: [0.8, 0.68, 0.42], flask: [0.9, 0.62, 0.16], fInk: [1.0, 0.72, 0.25], fEm: [0.9, 0.55, 0.14], glow: 0.45,
  },
  3: {
    hair: [1.0, 0.88, 0.55], hairTip: [1.0, 0.97, 0.82], ink: [1.15, 1.05, 0.85], inkGlow: 0.85, glowK: 0.85,
    hem: [0.84, 0.8, 0.68], flask: [1.0, 0.94, 0.75], fInk: [1.2, 1.15, 1.05], fEm: [1.2, 1.2, 1.1], glow: 0.8,
  },
};

/** His colours (the class's _tint): the outfit's form-1 fills on HIS material instances (the
 *  ink-line art's uArtFill; in the dragon look, option d, the art source's ink holds the colours and
 *  this finds no uArtFill: nothing to do). */
export function tintAscendant(M) {
  if (!M) return;
  const T = ASC_TINT[ascLookNow().base] ?? ASC_TINT.a;
  for (const k in T) M[k]?.uniforms?.uArtFill?.value.setRGB(T[k][0], T[k][1], T[k][2]);
  // the light: gold letters with a hot core (the `flask` part's ink lines are amber for every rig)
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlowMask) fu.uGlowMask.value = 1;
    fu.uInk?.value.setRGB(...FORM[2].fInk);
    fu.uEmissive?.value.setRGB(...FORM[2].fEm);
  }
}

const rgbOf = (m) => {
  const u = m?.uniforms, c = u?.uWInk?.value ?? u?.uArtFill?.value;
  return c ? [c.r, c.g, c.b] : null;
};
const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);

/**
 * Once a frame (the actor's): show the dressing of his form; let the gold hair and the light
 * breathe. A form change flips the pieces' `visible` flags and writes a few colours; otherwise a
 * handful of uniforms. No allocation after the first call.
 */
export function dressAscendant(d, dt) {
  const D = d?.rig?.root?.userData?.dress;
  if (!D || D.kind !== 'asc') return;
  const M = d.rig.materials;
  if (!D.base) D.base = { hem: rgbOf(M.hem) }; // (form 1's wraps, to give back in the Lab)
  const n = Math.min(3, Math.max(1, d.phase | 0));
  if (n !== D.phase) {
    D.phase = n;
    for (const e of D.at) e.m.visible = n >= e.from && n <= e.to;
    const F = FORM[n];
    if (F) {
      setFill(M.hair, ...F.hair);
      setFill(M.hairTip, ...F.hairTip);
      for (const m of [M.hair, M.hairTip]) {
        const u = m?.uniforms;
        u?.uInk?.value.setRGB(...F.ink);
        if (u?.uArtGlowK) u.uArtGlowK.value = F.glowK;
      }
      setFill(M.hem, ...F.hem);
      setFill(M.flask, ...F.flask);
      const fu = M.flask?.uniforms;
      if (fu) {
        fu.uInk?.value.setRGB(...F.fInk);
        fu.uEmissive?.value.setRGB(...F.fEm);
        if (fu.uGlowMask) fu.uGlowMask.value = 1;
      }
    } else if (D.base.hem) setFill(M.hem, ...D.base.hem);
  }
  // the gold breathes: slow in form 2, a faster, harder flicker in form 3 (the storm in him)
  const F = FORM[n];
  if (!F) return;
  const t = fin(d.time);
  const b = n === 3 ? 0.82 + 0.18 * Math.sin(t * 11.3) * Math.sin(t * 4.1 + 0.7) : 0.85 + 0.15 * Math.sin(t * 2.6);
  for (const m of [M.hair, M.hairTip]) {
    const u = m?.uniforms;
    if (u?.uInkGlow) u.uInkGlow.value = F.inkGlow * b;
  }
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlow) fu.uGlow.value = F.glow * b;
    if (fu.uInkGlow) fu.uInkGlow.value = 0.8 * b;
  }
}
