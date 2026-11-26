import { lookOf } from '../duelist/lookSwitch.js';
import { DIM } from '../../player/model.js';

// Bai Wuji's look (the BODY AGENT's file; the body contract: gear.js header). TODAY A STAND-IN: dark
// colours on Halcyon's builders, white "hair" (the `shirt` part), the eyes (`flask`) lit by d.eyesK.
// His look switches are `?wj...=` (duelist/lookSwitch.js: lookOf(name, def)); every taste call ships
// behind one, registered PENDING there with its Lab row (dev/labLooks.js) until the owner picks.

/** His look switches and their defaults (the body agent adds `wjLook`, `wjHair` ... here). */
export const WJ_LOOKS = Object.freeze({ wjLetters: 'a' });
export const wjLook = (name) => lookOf(name, WJ_LOOKS[name] ?? 'a');

/** His letters follow his size on screen by the hero's rule (`?wjLetters=a`; live). */
export function wjLettersOn() {
  return wjLook('wjLetters') === 'a';
}

/** The stand-in's colours (linear fills of his material instances: halcyon/gear.js names the parts). */
const TINT = {
  pants: [0.03, 0.03, 0.045], armor: [0.05, 0.05, 0.07], piping: [0.18, 0.2, 0.26], trim: [0.12, 0.12, 0.14], hair: [0.12, 0.12, 0.14],
  collar: [0.04, 0.04, 0.05], welt: [0.05, 0.05, 0.06], shirt: [0.9, 0.92, 0.96], skin: [0.82, 0.66, 0.56],
};
const EYES = { fill: [0.35, 0.7, 1.4], ink: [0.6, 1.1, 1.8], em: [0.4, 0.8, 1.6] };

/** His colours (the kit's _tint), once after his rig is built. */
export function tintUntouched(M) {
  if (!M) return;
  for (const k in TINT) M[k]?.uniforms?.uArtFill?.value.setRGB(TINT[k][0], TINT[k][1], TINT[k][2]);
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlowMask) fu.uGlowMask.value = 1;
    fu.uInk?.value.setRGB(...EYES.ink);
    fu.uEmissive?.value.setRGB(...EYES.em);
    fu.uArtFill?.value.setRGB(...EYES.fill);
  }
}

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);

/** Every frame (the kit's dress): the eyes burn by d.eyesK (0: behind the blindfold, dark). */
export function dressUntouched(d) {
  const fu = d?.rig?.materials?.flask?.uniforms;
  if (!fu) return;
  const dead = d.mode === 'dead' || (d.mode === 'dying' && d.brain.modeT > 1.6);
  const k = dead ? 0 : 1.6 * Math.min(1, Math.max(0, fin(d.eyesK)));
  if (fu.uGlow) fu.uGlow.value = k;
  if (fu.uInkGlow) fu.uInkGlow.value = k;
}

/** His eyes as drawn (world): out a Vector3; finite even before the rig has a matrix. */
export function eyePoint(d, out) {
  const h = d?.rig?.head;
  if (h?.matrixWorld) {
    out.set(0, 0.128, 0.11).applyMatrix4(h.matrixWorld);
    if (Number.isFinite(out.x + out.y + out.z)) return out;
  }
  const p = d.position;
  return out.set(p.x + Math.sin(d.yaw) * 0.2, p.y + 2.0, p.z + Math.cos(d.yaw) * 0.2);
}

/** His right ('R') or left ('L') hand as drawn (world). */
export function handPoint(d, side, out) {
  const A = d?.rig?.arms?.[side === 'L' ? 'L' : 'R'];
  if (A?.fore?.matrixWorld) {
    out.set(0, -DIM.foreArm, 0).applyMatrix4(A.fore.matrixWorld);
    if (Number.isFinite(out.x + out.y + out.z)) return out;
  }
  const p = d.position, s = side === 'L' ? 1 : -1;
  return out.set(p.x + Math.cos(d.yaw) * 0.3 * s, p.y + 1.0, p.z - Math.sin(d.yaw) * 0.3 * s);
}
