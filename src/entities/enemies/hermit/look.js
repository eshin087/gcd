import { lookOf } from '../duelist/lookSwitch.js';

// Gu Shan's look (PLACEHOLDER: the body agent replaces this file). `?hermitLook=a|b|c|a0` picks the
// outfit when his rig is built (lookSwitch PICKED hermitLook 'a').
export function hermitLookNow() {
  const o = lookOf('hermitLook', 'a', 'a');
  return ['a', 'b', 'c', 'a0'].includes(o) ? o : 'a';
}

/** His colours, once after his rig is built (the class's _tint). */
export function tintHermit(M) {
  if (!M) return;
  const T = { coat: [0.42, 0.38, 0.3], lining: [0.2, 0.18, 0.14], leather: [0.3, 0.24, 0.16], pants: [0.36, 0.33, 0.28], hem: [0.6, 0.57, 0.5], collar: [0.12, 0.1, 0.08], shirt: [0.82, 0.8, 0.76], skin: [0.8, 0.6, 0.46] };
  for (const k in T) M[k]?.uniforms?.uArtFill?.value.setRGB(T[k][0], T[k][1], T[k][2]);
}

/** Once a frame (kit.dress): the left hand comes out in phase 3 (nothing to switch in the placeholder). */
export function dressHermit() {}
