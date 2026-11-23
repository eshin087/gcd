import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from '../ashDisciple/bodyArt.js';

// Halcyon's look options (duelist/lookSwitch.js PENDING; never in PICKED: the owner picks from the
// sheets, docs/looks/halcyon/; ADR-155). Every option is drawn in the hero's INK-LINE art, dense and
// bright (the owner, of the bosses they kept: "make it look detailed like the main character").
//   ?halLook=a   the owner's answer (2026-11-22, "Recognizable"; the fight is built with it): a deep blue
//                armoured suit, a long red cape, a gold belt and gold trim at the wrists and the boots,
//                red boots, dark slick hair, eyes two red points, thin pale neon seams on the plates; a
//                plain gold clasp at each shoulder where the cape pins. Nothing on the chest.
//            b   the idol: a navy suit, gold shoulder pieces of his own shape, white gloves, a cape with
//                a bright lining, blond slick hair.
//            c   tomorrow's tyrant: black and chrome, a crimson cape, white hair.
//   ?glare=a|b|c   his eyes' heat (fx.js): a crimson with a white-hot steel core, b crimson alone, c the
//                  engine's orange fire with a steel core.
// (?city=a|b|c is the set's: world/halcyonPlaza.js.)
// Read when his rig is built (a reload).
export const HAL_LOOKS = Object.freeze({ halLook: 'a', glare: 'a' });
export const halLook = (name) => lookOf(name, HAL_LOOKS[name] ?? 'a');

/** The outfit his rig is built in: 'a' | 'b' | 'c' (an unknown value draws a). */
export function halLookNow() {
  const o = halLook('halLook');
  return o === 'b' || o === 'c' ? o : 'a';
}

/** Per outfit, the ink-line fill of each of his material instances (linear; gear.js says which is which). */
export const HAL_TINT = {
  a: {
    pants: [0.07, 0.12, 0.42], armor: [0.14, 0.24, 0.72], piping: [0.55, 0.85, 1.05], trim: [0.85, 0.6, 0.14],
    collar: [0.55, 0.06, 0.05], coat: [0.62, 0.05, 0.04], lining: [0.24, 0.02, 0.02], hem: [0.5, 0.035, 0.03],
    shirt: [0.05, 0.04, 0.035], welt: [0.06, 0.1, 0.32], skin: [0.86, 0.6, 0.45],
  },
  b: {
    pants: [0.03, 0.045, 0.16], armor: [0.06, 0.09, 0.26], piping: [0.85, 0.75, 0.45], trim: [0.92, 0.66, 0.16],
    collar: [0.5, 0.06, 0.05], coat: [0.58, 0.045, 0.04], lining: [0.88, 0.7, 0.32], hem: [0.82, 0.62, 0.22],
    shirt: [0.88, 0.68, 0.3], welt: [0.85, 0.85, 0.82], skin: [0.86, 0.6, 0.45],
  },
  c: {
    pants: [0.03, 0.03, 0.035], armor: [0.5, 0.52, 0.56], piping: [1.0, 0.2, 0.15], trim: [0.68, 0.7, 0.74],
    collar: [0.04, 0.04, 0.045], coat: [0.42, 0.015, 0.03], lining: [0.12, 0.01, 0.015], hem: [0.32, 0.01, 0.02],
    shirt: [0.85, 0.85, 0.88], welt: [0.05, 0.05, 0.06], skin: [0.84, 0.6, 0.46],
  },
};
/** The eyes' light by --glare (the `flask` part: its fill, ink lines, emissive). */
const EYES = { fill: [1.0, 0.08, 0.05], ink: [1.6, 0.2, 0.12], em: [1.4, 0.1, 0.06] };

/** The lift that keeps him readable on the dark street (as Tian Lei's ASC_LIFT): fill multipliers and the rim. */
export const HAL_LIFT = { fill: { pants: 1.5, armor: 1.3, coat: 1.25, collar: 1.3 }, rimOn: ['pants', 'armor', 'coat', 'lining', 'collar', 'trim', 'skin', 'shirt'], rim: 3.0 };

/** His colours (the class's _tint), once after his rig is built. */
export function tintHalcyon(M) {
  if (!M) return;
  const T = HAL_TINT[halLookNow()] ?? HAL_TINT.a;
  for (const k in T) M[k]?.uniforms?.uArtFill?.value.setRGB(T[k][0], T[k][1], T[k][2]);
  for (const k in HAL_LIFT.fill) M[k]?.uniforms?.uArtFill?.value.multiplyScalar(HAL_LIFT.fill[k]);
  for (const k of HAL_LIFT.rimOn) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= HAL_LIFT.rim;
  }
  // the neon seams light themselves a little (their ink lines glow), the eyes burn
  const pu = M.piping?.uniforms;
  if (pu?.uInkGlow) pu.uInkGlow.value = 0.5;
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlowMask) fu.uGlowMask.value = 1;
    fu.uInk?.value.setRGB(...EYES.ink);
    fu.uEmissive?.value.setRGB(...EYES.em);
    fu.uArtFill?.value.setRGB(...EYES.fill);
  }
}

/** The dressing record on his rig (gear.js registers the pieces that change by phase). */
export function dressOf(root) {
  return (root.userData.dress ??= { kind: 'hal', phase: 0, at: [] });
}
/** Show mesh `m` from phase `from` to phase `to`. */
export function at(D, m, from, to = 9) {
  D.at.push({ m, from, to });
  m.visible = from <= 1 && to >= 1;
}

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);

/**
 * Once a frame (kit.dress): the cape torn to tatters from phase 3 (a few `visible` flags when the phase
 * changes); the eyes' light (never out while he lives; brighter through a windup of his eyes, d.eyesK).
 */
export function dressHalcyon(d) {
  const D = d?.rig?.root?.userData?.dress;
  if (!D || D.kind !== 'hal') return;
  const n = Math.min(3, Math.max(1, (d.dressPhase ?? d.phase) | 0));
  if (n !== D.phase) {
    D.phase = n;
    for (const e of D.at) e.m.visible = n >= e.from && n <= e.to;
  }
  const fu = d.rig.materials.flask?.uniforms;
  if (fu) {
    const dead = d.mode === 'dead' || (d.mode === 'dying' && d.brain.modeT > 1.6);
    const k = dead ? 0 : 0.7 + 0.9 * Math.min(1, fin(d.eyesK)) + 0.08 * Math.sin(fin(d.time) * 9);
    if (fu.uGlow) fu.uGlow.value = k;
    if (fu.uInkGlow) fu.uInkGlow.value = k;
  }
}

/** For tools: re-colour a rig (the look sheets). */
export function setHalFill(M, part, rgb) {
  setFill(M[part], ...rgb);
}
