import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from '../ashDisciple/bodyArt.js';

// Tian Lei's body by form: what his gear shows, hides and recolours when his form changes (his hair
// above all), and his colours. The duelist calls dressAscendant(d, dt) once a frame (kit.dress) and
// tintAscendant(M) once after his rig is built (the class's _tint).
//
//   form 1  the Challenger: his dark hair (option a a topknot and a tail, c a braid).
//   form 2  Golden Ascension: the hair risen and gold, lit from within (it breathes); the edges of his
//           clothes catch the gold (a band of light along the tunic's collar and hems, the wraps
//           pale gold, light at the wrists; c: the prayer beads' light).
//   form 3  Thunder Ascension: the hair stiffer, sharper, longer, its light paler and hotter; the
//           fists and the eyes burn; a: the tunic torn off his left shoulder; c: the cross-wrap
//           and the shoulder cloth gone, bare-chested.
// Each step is one big change of silhouette (the head above all) or one line of light.
//
// Every switched piece is built by gear.js, kept out of the static merge, hidden or shown here when
// d.phase changes (a few `visible` flags); the light is the rig's `flask` instance (never drawn as
// a flask on him) and his own `hair` / `hairTip` instances: no new material, so no new draw call
// beyond the switched meshes themselves. Per frame otherwise: four uniforms (the glow breathing).

/** The homage outfits (BRIEF 4; gear.js "the homage outfits"): h the fighter in an orange gi, g the
 *  son in a purple gi, v the prince in a blue bodysuit and white armour. Options only: the default is
 *  the owner's pick (`PICKED.ascLook`). */
export const HOMAGE_LOOKS = ['h', 'g', 'v'];

/** The option chosen (`?ascLook=`, read when his rig is built): { base: 'a' | 'c' | 'h' | 'g' | 'v'
 *  (the outfit), art: true for d (outfit a in the dragon look), homage: true for h / g / v }. */
export function ascLookNow() {
  const o = lookOf('ascLook', 'a', 'a');
  if (o === 'd') return { base: 'a', art: true, id: 'd' };
  if (HOMAGE_LOOKS.includes(o)) return { base: o, art: false, id: o, homage: true };
  return { base: o === 'c' ? 'c' : 'a', art: false, id: o === 'c' ? 'c' : 'a' }; // (the bare-chested outfit b is not offered)
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
  // the monk: a slate-blue robe, a rust-red shoulder cloth, dark wood beads, a brown sash
  c: {
    coat: [0.34, 0.4, 0.56], lining: [0.08, 0.1, 0.14], facing: [0.62, 0.16, 0.08], leather: [0.2, 0.13, 0.08],
    trim: [0.3, 0.16, 0.07], pants: [0.38, 0.38, 0.42], hem: [0.68, 0.65, 0.58], collar: [0.06, 0.05, 0.05],
    shirt: [0.035, 0.03, 0.035], skin: [0.85, 0.57, 0.4],
  },
  // h: an orange gi, the blue of the undershirt, wristbands, sash and boots
  h: {
    coat: [0.78, 0.29, 0.035], lining: [0.25, 0.08, 0.02], pants: [0.9, 0.34, 0.045], facing: [0.08, 0.16, 0.6],
    leather: [0.05, 0.1, 0.36], hem: [0.08, 0.16, 0.58], collar: [0.07, 0.14, 0.52], shirt: [0.035, 0.03, 0.035], skin: [0.85, 0.57, 0.4],
  },
  // g: a purple gi, a red sash, white wristbands, brown boots
  g: {
    coat: [0.36, 0.12, 0.52], lining: [0.1, 0.03, 0.14], pants: [0.42, 0.14, 0.6], leather: [0.42, 0.05, 0.04],
    hem: [0.82, 0.82, 0.8], collar: [0.24, 0.14, 0.07], shirt: [0.035, 0.03, 0.035], skin: [0.85, 0.57, 0.4],
  },
  // v: a blue bodysuit, white armour, gloves and boots, gold at the belly and the toes
  v: {
    pants: [0.08, 0.17, 0.62], lining: [0.03, 0.05, 0.16], armor: [0.82, 0.82, 0.8], piping: [0.85, 0.62, 0.16],
    hem: [0.86, 0.86, 0.84], collar: [0.82, 0.82, 0.8], shirt: [0.035, 0.03, 0.035], skin: [0.85, 0.57, 0.4],
  },
};
/** The homage outfits' eyes in forms 2 - 3 (the eyes themselves, M.eye: teal). */
const TEAL_EYE = [0.12, 0.95, 0.85];

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

/** The lift that keeps him readable on the ring's floor (tintAscendant): fill multipliers per part,
 *  and the rim (the cool edge of light on the screen's left) times `rim` on his body's parts. */
export const ASC_LIFT = {
  fill: { coat: 1.4, pants: 1.5, skin: 1.2, leather: 1.8, shirt: 1.6, lining: 1.4 },
  rimOn: ['coat', 'lining', 'pants', 'skin', 'leather', 'shirt', 'collar', 'hem'],
  rim: 3.2,
};

/** His colours (the class's _tint): the outfit's form-1 fills on HIS material instances (the
 *  ink-line art's uArtFill; in the dragon look, option d, the art source's ink holds the colours and
 *  this finds no uArtFill: nothing to do). */
export function tintAscendant(M) {
  if (!M) return;
  const T = ASC_TINT[ascLookNow().base] ?? ASC_TINT.a;
  for (const k in T) M[k]?.uniforms?.uArtFill?.value.setRGB(T[k][0], T[k][1], T[k][2]);
  // the figure on the ring's floor (dim at the game camera, form 1 above all): his fill a little
  // lighter and an edge of light along his silhouette (this rig's per-instance rim, ASC_LIFT)
  // (?ascLift=0: the figure as the body agent shipped it, for the owner's before / after)
  const lift = lookOf('ascLift', 'a', 'a') !== '0';
  if (lift) for (const k in ASC_LIFT.fill) M[k]?.uniforms?.uArtFill?.value.multiplyScalar(ASC_LIFT.fill[k]);
  if (lift) for (const k of ASC_LIFT.rimOn) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= ASC_LIFT.rim;
  }
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
  if (!D.base) {
    D.base = { hem: rgbOf(M.hem), eye: rgbOf(M.eye) }; // (form 1's wraps and eyes, to give back in the Lab)
    D.art = !!M.hair?.uniforms?.uWInk;
    D.homage = HOMAGE_LOOKS.includes(D.look);
  }
  // (dressPhase: the form he SHOWS, which changes at a transformation's nova, not at its start)
  const n = Math.min(3, Math.max(1, (d.dressPhase ?? d.phase) | 0));
  if (n !== D.phase) {
    D.phase = n;
    for (const e of D.at) e.m.visible = n >= e.from && n <= e.to;
    const F = FORM[n];
    if (F) {
      // (the wyrm art path, option d, prints a bright ink as white: its gold is held lower)
      const k = D.art ? 0.7 : 1;
      setFill(M.hair, F.hair[0] * k, F.hair[1] * k, F.hair[2] * k);
      setFill(M.hairTip, F.hairTip[0] * k, F.hairTip[1] * k, F.hairTip[2] * k);
      for (const m of [M.hair, M.hairTip]) {
        const u = m?.uniforms;
        u?.uInk?.value.setRGB(...F.ink);
        if (u?.uArtGlowK) u.uArtGlowK.value = F.glowK;
      }
      // (the homage outfits keep their wristbands' colour; their eyes turn teal)
      if (D.homage) setFill(M.eye, ...TEAL_EYE);
      else setFill(M.hem, ...F.hem);
      setFill(M.flask, ...F.flask);
      const fu = M.flask?.uniforms;
      if (fu) {
        fu.uInk?.value.setRGB(...F.fInk);
        fu.uEmissive?.value.setRGB(...F.fEm);
        if (fu.uGlowMask) fu.uGlowMask.value = 1;
      }
    } else {
      if (D.base.hem) setFill(M.hem, ...D.base.hem);
      if (D.homage && D.base.eye) setFill(M.eye, ...D.base.eye);
    }
  }
  // the gold breathes: slow in form 2, a faster, harder flicker in form 3 (the storm in him)
  const F = FORM[n];
  if (!F) return;
  const t = fin(d.time);
  const b = n === 3 ? 0.82 + 0.18 * Math.sin(t * 11.3) * Math.sin(t * 4.1 + 0.7) : 0.85 + 0.15 * Math.sin(t * 2.6);
  for (const m of [M.hair, M.hairTip]) {
    const u = m?.uniforms;
    if (u?.uInkGlow) u.uInkGlow.value = F.inkGlow * b * (D.art ? 0.4 : 1);
  }
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlow) fu.uGlow.value = F.glow * b * (D.art ? 0.5 : 1);
    if (fu.uInkGlow) fu.uInkGlow.value = (D.art ? 0.4 : 0.8) * b;
  }
}
