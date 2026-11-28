import { Vector3 } from 'three';
import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from '../ashDisciple/bodyArt.js';
import { DIM } from '../../player/model.js';

// The False Saint's look (the BODY AGENT's file; the body contract: gear.js header). WAVE 0: the stand-in's
// colours (a charcoal shirt, black trousers, olive skin, black hair) and the body's points, read from the
// hero's rig. The body agent replaces it (the four milestones, the shell drawn from d.shell) and keeps the
// contract's names.

export const FS_LOOKS = Object.freeze({ fsLetters: 'a' });
export const fsLook = (name) => lookOf(name, FS_LOOKS[name] ?? 'a');

/** His letters follow his size on screen by the hero's rule (`?fsLetters=a`; live). */
export function fsLettersOn() {
  return fsLook('fsLetters') === 'a';
}

/** The stand-in's fills (linear) per material instance (the boss print lifts a cloth fill to its hue). */
export const FS_TINT = Object.freeze({
  shirt: [0.07, 0.072, 0.08], pants: [0.035, 0.036, 0.04], skin: [0.62, 0.5, 0.36], hair: [0.03, 0.03, 0.035], hairTip: [0.05, 0.05, 0.055],
  coat: [0.07, 0.072, 0.08], collar: [0.5, 0.5, 0.48], armor: [0.04, 0.04, 0.045],
});

/** His colours (the kit's _tint), once after his rig is built. */
export function tintSaint(M) {
  if (!M) return;
  for (const k in FS_TINT) if (M[k]) setFill(M[k], FS_TINT[k][0], FS_TINT[k][1], FS_TINT[k][2]);
}

/** Once a frame (kit.dress): the stand-in shows nothing by phase or shell (the body agent's). */
export function dressSaint(d) {
  void d;
}

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const _a = new Vector3();

/** His (right) eye as drawn (world): out a Vector3; finite even before the rig has a matrix. */
export function eyePoint(d, out) {
  const h = d?.rig?.head;
  if (h?.matrixWorld) {
    out.set(-0.033, 0.128, 0.11).applyMatrix4(h.matrixWorld);
    if (Number.isFinite(out.x + out.y + out.z)) return out;
  }
  const p = d.position, y = fin(d.yaw);
  return out.set(p.x + Math.sin(y) * 0.2, p.y + 2.0, p.z + Math.cos(y) * 0.2);
}

/** His right ('R') or left ('L') hand as drawn (world). */
export function handPoint(d, side, out) {
  const A = d?.rig?.arms?.[side === 'L' ? 'L' : 'R'];
  if (A?.fore?.matrixWorld) {
    out.set(0, -DIM.foreArm, 0).applyMatrix4(A.fore.matrixWorld);
    if (Number.isFinite(out.x + out.y + out.z)) return out;
  }
  const p = d.position, s = side === 'L' ? 1 : -1, y = fin(d.yaw);
  return out.set(p.x + Math.cos(y) * 0.3 * s, p.y + 1.0, p.z - Math.sin(y) * 0.3 * s);
}

/** The joint a part sits on and its offset in that joint's frame (stand-in measures). */
function jointOf(r, name) {
  switch (name) {
    case 'elbowR': return [r.arms?.R?.fore, 0, 0.02, -0.04];
    case 'elbowL': return [r.arms?.L?.fore, 0, 0.02, -0.04];
    case 'shoulderR': return [r.arms?.R?.upper, 0, 0.05, -0.02];
    case 'shoulderL': return [r.arms?.L?.upper, 0, 0.05, -0.02];
    case 'calfR': return [r.legs?.R?.shin, 0, -0.18, -0.06];
    case 'calfL': return [r.legs?.L?.shin, 0, -0.18, -0.06];
    case 'core': return [r.chest, 0, 0.04, 0.13];
    case 'chest': return [r.chest, 0, 0.04, 0.02];
    case 'back': return [r.chest, 0, 0.02, -0.14];
    case 'mortar': return [r.chest, 0, 0.16, -0.16];
    case 'head': return [r.head, 0, 0.13, 0];
    default: return null;
  }
}

/** Where a weapon of his frame is, as drawn (world): out a Vector3; finite whatever the rig. */
export function partPoint(d, name, out) {
  if (name === 'palmR' || name === 'handR') return handPoint(d, 'R', out);
  if (name === 'palmL' || name === 'handL') return handPoint(d, 'L', out);
  if (name === 'eye') return eyePoint(d, out);
  const J = d?.rig ? jointOf(d.rig, name) : null;
  if (J?.[0]?.matrixWorld) {
    out.set(J[1], J[2], J[3]).applyMatrix4(J[0].matrixWorld);
    if (Number.isFinite(out.x + out.y + out.z)) return out;
  }
  const p = d.position;
  _a.set(p.x, p.y + 1.4, p.z);
  return out.copy(_a);
}
