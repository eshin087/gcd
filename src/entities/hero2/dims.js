// The remade hero's measurements (metres, the 1.85 m gameplay body before the drawn scale). Plain
// data, no imports. skeleton.js builds the rest pose from these; the body (body.js) is sculpted round
// them. PLACEHOLDER numbers taken from today's hero (player/heroDims.js): the build is re-measured
// from the owner's reference footage and written here (see scripts/mocap, `proportions`).
export const HDIM = {
  height: 1.85, // crown above the ground, standing
  hipsY: 0.97, // the pelvis joint above the ground, standing straight (hipDrop + thigh + shin + ankle)
  spine: 0.08, // pelvis -> waist
  chest: 0.19, // waist -> ribcage joint
  neck: 0.27, // ribcage joint -> neck base
  head: 0.09, // neck base -> head joint (the skull turns here)
  clavIn: 0.03, // the clavicle's root: this far out from the spine ...
  clavUp: 0.2, // ... and this far above the ribcage joint
  clav: 0.148, // clavicle length (to the shoulder joint): shoulders +-(clavIn + clav) = +-0.178
  upperArm: 0.28,
  foreArm: 0.27,
  palm: 0.07, // wrist -> the grip's centre in the fist
  hipHalf: 0.105, // hip joints +-this from the spine
  hipDrop: 0.05, // ... and this far under the pelvis joint
  thigh: 0.43,
  shin: 0.42,
  ankle: 0.07, // ankle height with the foot flat
  foot: 0.15, // ankle -> ball of the foot, along the ground
  // the sword (socket space: origin = grip centre, blade along +Z)
  blade: 0.93, // the drawn point
  bladeBase: 0.16, // gameplay hit segment along +Z ...
  bladeTip: 1.5, // ... to here (unchanged from today's hero)
};
