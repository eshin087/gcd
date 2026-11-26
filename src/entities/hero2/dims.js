// The remade hero's measurements (metres, the 1.85 m gameplay body before the drawn scale). Plain
// data, no imports. skeleton.js builds the rest pose from these; the body (body.js) is sculpted round
// them. MEASURED from the owner's reference footage (scripts/mocap/proportions.py: ratios to his height from
// about 480 standing frames, on our 1.85 m): long legs, high shoulders. Every clip is built for these
// numbers: after changing one, rebuild every clip set (scripts/mocap/build.py).
export const HDIM = {
  height: 1.85, // crown above the ground, standing
  hipsY: 1.057, // the pelvis joint above the ground, standing straight (hipDrop + thigh + shin + ankle, measured)
  spine: 0.084, // pelvis -> waist
  chest: 0.199, // waist -> ribcage joint
  neck: 0.226, // ribcage joint -> neck base
  head: 0.075, // neck base -> head joint (the skull turns here)
  clavIn: 0.03, // the clavicle's root: this far out from the spine ...
  clavUp: 0.21, // ... and this far above the ribcage joint
  clav: 0.157, // clavicle length (to the shoulder joint): shoulders +-(clavIn + clav) = +-0.178
  upperArm: 0.294,
  foreArm: 0.271,
  palm: 0.07, // wrist -> the grip's centre in the fist
  hipHalf: 0.103, // hip joints +-this from the spine
  hipDrop: 0.083, // ... and this far under the pelvis joint
  thigh: 0.46,
  shin: 0.43,
  ankle: 0.084, // ankle height with the foot flat
  foot: 0.126, // ankle -> ball of the foot, along the ground
  // the sword (socket space: origin = grip centre, blade along +Z)
  blade: 0.93, // the drawn point
  bladeBase: 0.16, // gameplay hit segment along +Z ...
  bladeTip: 1.5, // ... to here (unchanged from today's hero)
};
