// The remade hero's body sizes, DERIVED from a dimension table (dims.js HDIM or any other with the
// same fields). Plain data and arithmetic, no three.js. The body (body.js, bodyParts.js, cloth.js)
// reads only what this returns, so a new build (the reference character's measured proportions,
// written into dims.js) is followed with no other change.
//
// How: today's hero (player/heroDims.js, gear/*.js) is the TEMPLATE. Its costume was sculpted in
// metres for a skeleton whose numbers HDIM still holds (TPL below is a frozen copy of them). A size of
// the template is carried over to a new table by the measure it hangs off:
//   - heights on the trunk: piecewise-linear between the joints (hip joint, pelvis, waist, ribcage,
//     shoulders, neck base, crown), so a longer spine stretches the tunic and not the hood;
//   - widths across the shoulders by the shoulder span, across the hips by the hip span;
//   - girth (limb radii, cloth thickness, the hood, the hands) by the height;
//   - lengths along a bone by that bone.

/** Today's skeleton (the HDIM placeholder numbers the template costume was sized for). Frozen. */
export const TPL = Object.freeze({
  height: 1.85, hipsY: 0.97, spine: 0.08, chest: 0.19, neck: 0.27, head: 0.09,
  clavIn: 0.03, clavUp: 0.2, clav: 0.148, upperArm: 0.28, foreArm: 0.27, palm: 0.07,
  hipHalf: 0.105, hipDrop: 0.05, thigh: 0.43, shin: 0.42, ankle: 0.07, foot: 0.15,
  blade: 0.93, bladeBase: 0.16, bladeTip: 1.5,
});

/**
 * Where today's costume was sculpted: the template's joints in today's IDLE stance (heroDims.js REST:
 * the pelvis 0.955, the waist 1.035, the ribcage 1.225, the neck base 1.535; the shoulders 1.44, the
 * hip joints 0.905). Every height in gear/*.js is one of these plus an offset. `crown`: the top of the
 * head the head's size is measured to (the neck base + 0.30).
 */
export const TEMPLATE_LM = Object.freeze({ hipJoint: 0.905, hips: 0.955, spine: 1.035, chest: 1.225, shoulder: 1.44, neckBase: 1.535, crown: 1.835 });
/** today's ribcage joint -> neck base (heroDims.js DIM.neck): where the neck base falls between this
 *  skeleton's neck and head joints (as a share of `head`) */
const NECK_BASE = (0.31 - TPL.neck) / TPL.head;

/** A build's landmark heights (m above the ground, the rest pose standing straight). */
export function landmarks(d) {
  const hips = d.hipsY, spine = hips + d.spine, chest = spine + d.chest, neck = chest + d.neck, head = neck + d.head;
  const hipJoint = hips - d.hipDrop;
  return { hipJoint, hips, spine, chest, shoulder: chest + d.clavUp, neck, neckBase: neck + NECK_BASE * d.head, head, crown: d.height, knee: hipJoint - d.thigh, ankle: hipJoint - d.thigh - d.shin };
}

const LM_KEYS = ['hipJoint', 'hips', 'spine', 'chest', 'shoulder', 'neckBase', 'crown'];

/**
 * Everything the body is built from, for dimension table `d`.
 *   y(h)        a template height on the trunk -> the same place on this build (m above the ground)
 *   sx(x, h)    a template width at template height h -> this build's (the shoulders' span above the
 *               waist, the hips' below, blended between)
 *   g           girth factor (height ratio): limb radii, cloth, hands, the hood
 *   kHead       the head's size factor (neck base to crown)
 *   lm / lmT    this build's / the template's landmark heights
 *   arm, leg    bone lengths and radii
 */
export function deriveBody(d) {
  const lmT = TEMPLATE_LM, lm = landmarks(d);
  const tH = LM_KEYS.map((k) => lmT[k]), nH = LM_KEYS.map((k) => lm[k]);
  const y = (h) => {
    // below the hip joint and above the crown: carried by the nearest span's scale
    let i = 0;
    while (i < tH.length - 2 && h > tH[i + 1]) i++;
    const u = (h - tH[i]) / (tH[i + 1] - tH[i]);
    return nH[i] + u * (nH[i + 1] - nH[i]);
  };
  const g = d.height / TPL.height;
  const kSh = (d.clavIn + d.clav) / (TPL.clavIn + TPL.clav);
  const kHip = d.hipHalf / TPL.hipHalf;
  // widths: hips below the waist, shoulders from the ribcage up, blended over the waist
  const sx = (x, h) => {
    const t = Math.min(1, Math.max(0, (h - lmT.spine) / (lmT.chest + 0.1 - lmT.spine)));
    return x * (kHip + (kSh - kHip) * t);
  };
  const kHead = (lm.crown - lm.neckBase) / (lmT.crown - lmT.neckBase);
  return {
    d, g, kSh, kHip, kHead, lm, lmT, y, sx,
    /** a template depth (front-back) at height h: girth, a little of the width's change */
    sz: (z, h) => z * (0.5 * g + 0.5 * (sx(1, h))),
    shoulderX: d.clavIn + d.clav,
    arm: {
      upper: d.upperArm, fore: d.foreArm, palm: d.palm,
      // template radii (heroDims BODY.upperArm / foreArm / deltoid) times the girth
      ua: [0.066 * g, 0.056 * g], fa: [0.057 * g, 0.046 * g], deltoid: [0.074 * g, 0.07 * g, 0.078 * g],
      hand: 1.12 * 0.92 * g, // the template's hand size (BODY.hand) and a touch slimmer: it is all bare now
    },
    leg: {
      thigh: d.thigh, shin: d.shin, ankle: d.ankle, foot: d.foot,
      th: [0.086 * g, 0.062 * g, 0.01 * g], sh: [0.064 * g, 0.049 * g, 0.01 * g],
      // the boot: template BODY.foot (foot space: ankle at the origin)
      footR: [0.056 * g, 0.048 * g, 0.146 * (d.foot / TPL.foot)], footC: [0, -0.02 * (d.ankle / TPL.ankle), 0.052 * (d.foot / TPL.foot)],
    },
    // the sword (socket space: grip centre, blade +Z) keeps its own sizes; its drawn point is d.blade
    sword: { k: d.blade / TPL.blade, gripBack: 0.08, guard: 0.1, gem: 0.116, forte: 0.2, offGrip: 0.08 },
  };
}
