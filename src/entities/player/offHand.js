// THE FREE HAND IN A ONE-HANDED SWING (`?offhand=side|back|quiet`, ADR-240; the owner, 2026-11-26: "make the
// left hand look more natural and not stand out so much as it looks unnatural and off"). In production every
// light cut sends the free hand's sword fingers to a place of their own (swings.js FH: at the foe, out to the
// side, high back, behind the hip ...), a pale point flung about at the edge of every swing. Three looks to
// pick from, each a rest the body carries with a damped pendulum on it (anim.js HeroAnimator._sideHand, first
// written for the instant cuts of ADR-233), worn by every one-handed swing (a clip that never keys `two`):
//   side   loose at his side: the hand beside the left thigh, the elbow a little bent, an open hand, swaying
//          a little as the body turns and drops (what the owner asked for on 2026-11-25)
//   back   behind the back: the hand on the small of his back, palm out, the elbow out to his left and back
//          (the one-handed fencer's hand, hidden from the front)
//   quiet  production's own gestures kept, pulled in: the hand goes `keep` of the way to where the clip sends
//          it from its rest at his side, the sword fingers as keyed
// 'auto' (the default) wears the swings' feel's own hand (feel.js), production's free hand without a feel; '0' is
// production's free hand, untouched.
//
// A look's fields (body axes: +x his left, +y up, +z ahead; m):
//   hang   the wrist's rest from the left shoulder, turned with the chest
//   thigh, hip  … the same rest from the left hip joint (turned with the pelvis), and how far toward it
//   near   the nearest the hand hangs to the shoulder (× the model's scale; the arm's reach is 0.55)
//   w, z   the pendulum's spring (rad/s, damping ratio): under-damped, so it sways once and settles
//   k, sway  how much of the pendulum's lag shows, and the most it shows (m)
//   easeIn, ease, easeBack, linger, drop, vIn, trail, trailMax, thighR: anim.js SIDE's (the side hand's
//          timings and bounds)
//   pole, ld, ln  the elbow's way, the fingers, the palm (body axes turned with the chest); lw their weight
//   hs     the hand's shape (0 open, 1 sword fingers); `keep` (quiet) how far toward the clip's own hand
//   body   (m, chest local) the nearest the hand comes to his spine between hip and chest (anim.js SIDE_KEEP): the
//          back look's hand kept out of his coat (ADR-247); 0 none (beside the hip the side's hand sits at 0.23)

import { feelHand } from './feel.js';

// (easeBack 0.2 s: the hand leaving the side for a two-handed blow reaches round him to the hilt through its windup;
// at 0.1 it snapped there)
const COMMON = { easeIn: 0.16, ease: 0.3, easeBack: 0.2, linger: 0.35, drop: 12, vIn: 3.3, trail: 0.012, trailMax: 0.1, thighR: 0.095, body: 0 };
export const OFFHAND = {
  side: {
    ...COMMON, hang: [0.07, -0.53, 0.06], thigh: [0.14, -0.02, 0.05], hip: 0.5, near: 0.5, w: 10.5, z: 0.42, k: 0.35, sway: 0.07,
    pole: [0.15, -0.25, -0.95], ld: [0.06, -0.97, 0.2], ln: [-0.92, -0.05, 0.25], lw: 0.85, hs: 0, keep: 0,
  },
  // (back: its rest 0.32 m behind the shoulder, clear of his coat; at 0.21 it sat inside it, ADR-247)
  back: {
    ...COMMON, hang: [-0.1, -0.42, -0.32], thigh: [0, 0, 0], hip: 0, near: 0.3, w: 12, z: 0.55, k: 0.25, sway: 0.04, thighR: 0,
    pole: [0.85, -0.15, -0.5], ld: [-0.9, -0.25, -0.2], ln: [0, 0, -1], lw: 0.8, hs: 0, keep: 0, body: 0.27,
  },
  quiet: {
    ...COMMON, hang: [0.1, -0.5, 0.1], thigh: [0.14, -0.02, 0.08], hip: 0.4, near: 0.3, w: 11, z: 0.5, k: 0.3, sway: 0.05,
    pole: null, ld: null, ln: null, lw: 0, hs: null, keep: 0.35,
  },
};
export const OFFHAND_IDS = ['auto', '0', 'side', 'back', 'quiet'];
let offNow = 'auto';
/** The free hand's look now ('auto': the swings' feel's own hand, feel.js, or production's without a feel; '0'
 *  production's; or an OFFHAND key). */
export const offHandMode = () => offNow;
/** The look's data, or null for production's. */
export const offHandLook = () => {
  const m = offNow === 'auto' ? feelHand() ?? '0' : offNow;
  return m === '0' ? null : OFFHAND[m] ?? null;
};
/** Pick the look (live from the next swing); false for an unknown id. */
export function setOffHand(m) {
  const id = String(m);
  if (!OFFHAND_IDS.includes(id)) return false;
  offNow = id;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('offhand') : null;
  if (q) setOffHand(q);
}
