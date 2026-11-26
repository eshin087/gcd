// The mount's measurements (metres): an ordinary riding horse sized for the remade hero (1.85 m): about
// 1.6 m at the withers, a body about as long as it is tall, legs half its height. Plain data, no imports.
// hskeleton.js builds the rest pose from these; hbody.js is sculpted round them; every horse clip is
// built for them (H2 generator gen.mjs): after changing one, rebuild the clips.
//
// The frame is the hero's: +Z his front, +Y up, +X his LEFT. The root is the ground under his middle.
export const HORSE = {
  withers: 1.6, // the top of the withers above the ground, standing (the drawn topline)
  // ---- the trunk (joint positions, standing; the pelvis joint is the hip joints' level, on the spine)
  pelvisY: 1.17, // the pelvis joint above the ground, standing
  pelvisZ: -0.55, // ... and this far behind the root
  spine1: [0, 0.1, 0.36], // pelvis -> loins
  spine2: [0, 0.02, 0.36], // loins -> the saddle's middle (the back)
  withersJ: [0, 0, 0.4], // the back -> the withers joint (inside the chest, between the shoulder blades)
  // ---- the neck and head (rest: straight forward, +Z)
  neckBase: [0, 0.18, 0.3], // withers joint -> the root of the neck
  neckSeg: 0.3, // three neck segments
  head: 0.58, // poll -> the end of the muzzle (drawn; the head joint sits at the poll)
  jaw: [0, -0.1, 0.1], // head -> the jaw's hinge
  ear: [0.07, 0.07, -0.02], // head -> an ear's root (x mirrored)
  earLen: 0.15,
  bit: [0, -0.17, 0.42], // head -> the corner of the mouth (the bit, where the reins start)
  // ---- the tail (rest: straight back, -Z): the dock's bones; the hair hangs from them (hbody.js)
  tailRoot: [0, 0.22, -0.4], // pelvis -> the dock
  tailSeg: 0.13, // three dock segments after the root
  // ---- the fore legs (rest: straight down): shoulder -> elbow -> knee -> fetlock -> ground
  // (the fore leg swings from the top of the shoulder blade, as a horse's does: the blade and the upper arm
  // are one bone here, from the blade's top to the elbow; the point of the shoulder is drawn on it)
  shoulder: [0.17, 0.15, -0.02], // withers joint -> the top of the shoulder blade (x mirrored)
  humerus: 0.56, // the blade's top -> the elbow
  forearm: 0.46,
  cannonF: 0.27,
  pasternF: 0.2, // fetlock -> the hoof's ground point
  // ---- the hind legs: hip joint -> stifle -> hock -> fetlock -> ground
  hip: [0.21, -0.02, -0.02], // pelvis -> the hip joint (x mirrored)
  femur: 0.42,
  tibia: 0.44,
  cannonH: 0.34,
  pasternH: 0.2,
  hoofLen: 0.13, // the hoof's sole, heel to toe (drawn)
  // ---- the rider's sockets
  saddle: [0, 0.4, -0.05], // the back (spine2) -> where the RIDER'S HIPS sit (his pelvis joint), about 1.7 m up
  stirrup: [0.26, -0.8, 0.08], // saddle -> a stirrup's tread (the rider's ankle; x mirrored)
  rein: [0, 0.4, 0], // withers joint -> where the rider's hands hold the reins (above the withers)
};
