import { mergeGeometries, limb, looseHand, gripFist } from '../heroGeo.js';

// The free (left) hand, one builder for every `arms` item (gear/README.md): every outfit's sleeves
// end in the same bare hand, so a change to the hand (its pose, the sword fingers) reaches them all.
// An arms item draws its own sleeve and cuff down to the wrist (keep a DARK cuff right up to it, so
// the pale hand stands alone at the game camera), then calls this and returns what it gives.

/**
 * The free hand: the skin wrist and the open hand on the left forearm, and the same hand closed on
 * the grip DIM.offGrip below the sword hand (on the `sword` joint, hidden; the animator shows one or
 * the other with `twoHand`, rig.offHand). `ctx` = the item's build context; `mat` = the hand's
 * material (skin). Returns { offHand: { open, grip }, keep: [open, grip] }: put both in the item's
 * return value. Build-time only.
 */
export function buildFreeHand({ arms, sword, M, DIM, BODY, mesh }, mat = M.skin) {
  const fore = arms.L.fore, HK = BODY.hand, fa1 = BODY.foreArm[1];
  // the skin wrist stays on the forearm
  mesh(fore, limb({ length: 0.05, r0: fa1 - 0.006, r1: fa1 - 0.004, radial: 8, rings: 2, capSegs: 1 }).translate(0, -DIM.foreArm + 0.075, 0), mat);
  // the free hand open (hanging, reaching, bracing): on the wrist joint when the rig has one (the
  // hand turns on it), else on the forearm. looseHand is built in forearm space: shift it into the
  // wrist's (a wrist joint hangs on the forearm, unturned at build time)
  const wj = arms.L.wrist ?? fore, wp = arms.L.wrist?.position;
  const H = looseHand(DIM.foreArm - 0.03, 1, HK);
  const hand = mergeGeometries([H.palm, H.fingers, H.tips, H.thumb]);
  if (wp) hand.translate(-wp.x, -wp.y, -wp.z);
  const open = mesh(wj, hand, mat);
  // … and the same hand closed round the grip below the sword hand (on the sword joint, so it closes
  // round the grip in every pose)
  const F = gripFist(HK);
  const grip = mesh(sword, mergeGeometries([F.fingers, F.thumb, F.ridge]).translate(0, 0, -DIM.offGrip), mat);
  grip.visible = false;
  return { offHand: { open, grip }, keep: [open, grip] };
}
