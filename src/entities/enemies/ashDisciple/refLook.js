import { lookOf } from '../duelist/lookSwitch.js';

// Shen Hui drawn after the reference pack (docs/art/character-packs-v04/shen-hui, ADR-289). Two switches,
// each '0' (the figure and the motion as they ship) until the owner picks:
//   ?ashRef=a      his look (gear.js, read when his rig is built: a page load per option): the bracer of
//                  old bronze on his sword forearm (the anchor's "bracer (old bronze)", not the charcoal
//                  cloth strips), brick-red inner folds showing down the front and the back of the robe
//                  between its panels, and the robe layered and ragged: an over-robe's torn edge at
//                  mid-thigh and frayed ends along the whole hem in every phase (phase 3's own frays
//                  still come on top). The hat, the straight jian with its disc guard, its red tassel,
//                  the colours and the phase dressing (`?ashLook`: phase 2's smoulder, phase 3's lost hat,
//                  loose hair and pale robe) are kept as they are.
//   ?ashRefMove=a  his motion (poses.js / moves.js): the poses only, never the timing, the zones, the
//                  damage or the root motion.

export const refLook = () => lookOf('ashRef', '0') !== '0';
export const refMove = () => lookOf('ashRefMove', '0') !== '0';

/**
 * The guard after F01 [1.5 - 6.5] / P01 "front guard" / A01 08 / V01 "base (return) pose": the same jian
 * level at chest height pointing at the opponent and the same sword-finger arc over his head, on a lower,
 * wider stance (the knees bent, the feet a long stride apart: the sheets' "stable and composed").
 */
export const GUARD_REF = Object.freeze({ sink: 0.07, wide: 0.04, stride: 1.18, knee: 0.08 });

/**
 * The pose layer over a beat's keys (moves.js refKeysOf). From the strips' contact and follow panels
 * (D01 - D12 CONTACT / FOLLOW, F01 rows 1 - 6 "contact" / "follow": the weight committed, the stance long):
 *   load   the windup's last keys sink a little (the D sheets' PREPARE: knees loading);
 *   sink   the contact and the follow-through sink and the body leans into the cut;
 *   wide   feet on the floor a little wider;
 *   floor  a key already lower than this keeps its height (a kneel, a sweep, the Kindling, Ash on the Wind
 *          are not pushed deeper: the knees would fold shut);
 *   free   a one-handed blow's free hand, if it would sit in front of his body at the contact, goes out to
 *          the side and back (opposition: D01 plumThrust / piercingAsh CONTACT, D04 glideKick 4, D12
 *          needleDart 3, the left hand behind, not over the blade);
 *   react  the reactions read bigger (R01 rows 5 - 7: the flinch, the stagger, the reel thrown further).
 */
export const REF = Object.freeze({ load: 0.04, sink: 0.07, lean: 0.08, wide: 0.03, floor: -0.42, free: [0.16, 0.02, -0.18], freeZ: 0.1, reach: 0.52, react: { pitch: 1.3, bZ: 1.35, spX: 1.25, by: 0.04 } });
