import { mergeGeometries, limb, looseHand, gripFist, swordFingers } from '../heroGeo.js';
import { handLook } from './handLook.js';
import { shapedHand } from './handShape.js';

// The free (left) hand, one builder for every `arms` item (gear/README.md): every outfit's sleeves
// end in the same bare hand, so a change to the hand (its pose, the sword fingers) reaches them all.
// An arms item draws its own sleeve and cuff down to the wrist (keep a DARK cuff right up to it, so
// the pale hand stands alone at the game camera), then calls this and returns what it gives.

/**
 * The free hand: the skin wrist on the left forearm; the open hand and the sword fingers (jian jue,
 * hidden) on the free wrist; and the same hand closed on the grip DIM.offGrip below the sword hand
 * (on the `sword` joint, hidden). The animator shows one of the three (`twoHand`, the hand's
 * distance from the grip and the pose's hand shape `hs`; rig.offHand). `ctx` = the item's build
 * context; `mat` = the hand's material (skin). Returns { offHand: { open, grip, fingers }, keep:
 * [open, grip, fingers] }: put both in the item's return value (keep: the three are toggled, so the
 * merge must leave them apart). Build-time only.
 */
export function buildFreeHand({ arms, sword, M, DIM, BODY, mesh }, mat = null) {
  // the owner's pick of size and ink (`?handLook=`, gear/handLook.js; today's by default)
  const look = handLook();
  if (!mat) mat = M[look.mat] ?? M.skin;
  const fore = arms.L.fore, HK = BODY.hand * (look.kRest ?? look.k), fa1 = BODY.foreArm[1];
  // the skin wrist stays on the forearm
  mesh(fore, limb({ length: 0.05, r0: fa1 - 0.006, r1: fa1 - 0.004, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.075, 0), mat);
  // the free hand open (hanging, reaching, bracing): on the wrist joint when the rig has one (the
  // hand turns on it), else on the forearm. looseHand is built in forearm space: shift it into the
  // wrist's (a wrist joint hangs on the forearm, unturned at build time)
  const wj = arms.L.wrist ?? fore, wp = arms.L.wrist?.position;
  // (a reshaped hand when the look asks for one: `shape` is its curl, 0 open … 1 a fist)
  const H = look.shape != null ? shapedHand(DIM.foreArm - 0.03, 1, look.k, look.shape) : looseHand(DIM.foreArm - 0.03, 1, HK);
  const hand = mergeGeometries([H.palm, H.fingers, H.tips, H.thumb]);
  if (wp) hand.translate(-wp.x, -wp.y, -wp.z);
  const open = mesh(wj, hand, mat);
  // the sword fingers (index and middle out, the other two curled under the thumb): built in wrist
  // space (on the forearm, shifted down to where the wrist would be)
  const SF = swordFingers(1, HK, BODY.fingerEx ?? 1.3);
  const fg = mergeGeometries([SF.palm, SF.fingers, SF.curled, SF.thumb]);
  if (!wp) fg.translate(0, -(DIM.foreArm - 0.03), 0);
  const fingers = mesh(wj, fg, mat);
  fingers.visible = false;
  // … and the same hand closed round the grip below the sword hand (on the sword joint, so it closes
  // round the grip in every pose)
  const F = gripFist(HK);
  const grip = mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]).translate(0, 0, -DIM.offGrip), mat);
  grip.visible = false;
  return { offHand: { open, grip, fingers }, keep: [open, grip, fingers] };
}
