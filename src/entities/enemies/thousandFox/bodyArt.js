import { ART_CLOTH, ART_SKIN } from '../ashDisciple/bodyArt.js';

// Wen Yao's figure in the WYRM's art path (`?foxLook=a|b|c`; d is outfit a in the hero's ink-line art):
// the art sources each of his materials becomes at the first gear item's build (ashDisciple/bodyArt.js
// toDragonLook: one twin per material, same draw calls). gear.js says which material is which part.
//
// The art path on a human figure has twice read as "a block of digits at 30 m" to the owner: a figure
// of one dark tone prints as one field of dim digits. So each outfit is a few big flat-faceted parts in
// tones far apart, light to dark, and the parts are placed so the figure reads as bands from the head
// down (option a: the bone mask, the pale fur across the shoulders, the dark robe, the vermilion sash,
// the pale wraps at the shins). The key light is a little stronger than the cloth's default (the
// Skybreak Ring's lesson: a duelist in the art path read dim at the game camera).

/** Cloth with the stronger key: a dark body, its lit faces a clear step brighter, its outline in strokes. */
const cloth = (ink, o = {}) => ({ ...ART_CLOTH, light: [1.25, 0.9, 0.4, 0.02], ink, ...o });
/** Fur, paper, bone: pale parts whose facets must still print as steps, not as one white patch (a low
 *  gain, a strong key). */
const pale = (ink, o = {}) => ({ ...ART_CLOTH, light: [0.95, 1.0, 0.3, 0.03], strokeEdge: 0.3, ink, ...o });
/** A loud colour (the Wild Fox's jacket, the scarf): its lit faces bright, its shadowed ones still
 *  the colour (a light floor), so it reads as one bold shape. */
const loud = (ink, o = {}) => ({ ...ART_CLOTH, light: [1.15, 0.95, 0.35, 0.08], ink, ...o });
/** The big dark cloth (robe, trousers, linings): a low gain and a soft key, so it prints dim digits
 *  and the pale and red parts stand out of it (at the game camera its flared skirt caught the key and
 *  printed as bright as the fur). */
const dark = (ink, o = {}) => ({ ...ART_CLOTH, light: [0.75, 0.4, 0.4, 0.02], ink, ...o });
const skin = (ink) => ({ ...ART_SKIN, light: [1.1, 0.8, 0.2, 0.05], ink });

/** The parts every outfit shares (he is bare-handed: no weapon part). */
const SHARED = {
  default: cloth([0.1, 0.1, 0.11]),
  skin: skin([0.55, 0.4, 0.3]),
  eye: cloth([0.05, 0.035, 0.035], { strokes: 'none' }), // the mask's eye slits, nose, the ears' insides
  shirt: cloth([0.045, 0.045, 0.055]), // the darks: shoes, the undershirt, a belt
  lining: dark([0.05, 0.05, 0.075]), // the inside of the sleeves and the skirt
};

/** Per outfit (gear.js's header says which part each name is). Linear albedo, before the pass lifts it. */
export const FOX_ART = {
  // a, the Shrine Fox: a bone mask, a charcoal-indigo robe, a pale fur mantle, vermilion sash, pale wraps
  a: {
    ...SHARED,
    welt: pale([0.9, 0.88, 0.8], { light: [1.3, 1.2, 0.5, 0.16] }), // the bone-white mask (the one bright thing)
    hem: pale([0.2, 0.195, 0.185]), // the fur mantle: well under the mask
    coat: dark([0.085, 0.085, 0.15]), // the charcoal-indigo robe and sleeves
    pants: dark([0.12, 0.12, 0.135]), // the trousers: dark, apart from the robe by its hue
    piping: pale([0.21, 0.2, 0.18]), // the forearm and shin wraps
    facing: cloth([0.5, 0.1, 0.05]), // the dull vermilion sash and the cord that ties the sleeves back
    hair: cloth([0.04, 0.04, 0.05]), // the dark hair behind the mask
  },
  // b, the Wild Fox: an amber sleeveless jacket, dark trousers, an upswept crest of dark red-brown hair,
  // the half-mask pushed to the side of the head, a long vermilion scarf, a fox-tail charm
  b: {
    ...SHARED,
    welt: pale([0.86, 0.84, 0.77], { light: [1.3, 1.2, 0.5, 0.16] }), // the mask on his temple, the tail charm's tip
    coat: loud([0.5, 0.22, 0.045]), // the jacket: a deep burnt amber
    lining: dark([0.16, 0.08, 0.03]),
    hair: cloth([0.17, 0.055, 0.04], { strokeEdge: 0.3 }), // the crest: a dark red-brown
    facing: loud([0.62, 0.11, 0.045]), // the scarf and the mask's cord: vermilion
    hem: pale([0.42, 0.22, 0.09]), // the fox-tail charm: russet fur
    leather: cloth([0.05, 0.045, 0.05]), // the belt
    pants: dark([0.08, 0.08, 0.1]), // the trousers: near black, under the loud jacket
    piping: pale([0.24, 0.23, 0.21]), // the wraps: forearms, fists, shins
  },
  // c, the Pelt Brawler: a quilted russet jerkin, a fox's head on the left shoulder and its pelt, the mask on the brow
  c: {
    ...SHARED,
    welt: pale([0.86, 0.84, 0.77], { light: [1.3, 1.2, 0.5, 0.16] }), // the mask pushed up on the brow
    leather: dark([0.2, 0.1, 0.06], { strokeEdge: 0.3 }), // the quilted jerkin: a dark russet-brown (b's amber is the loud one)
    hem: pale([0.3, 0.29, 0.27]), // the fox's head and its pelt: a silver fox, grey
    coat: dark([0.085, 0.085, 0.15]), // the under-robe and the skirt (the Shrine Fox's indigo)
    pants: dark([0.12, 0.12, 0.135]),
    piping: pale([0.21, 0.2, 0.18]),
    facing: cloth([0.5, 0.1, 0.05]), // the vermilion lacing
    hair: cloth([0.04, 0.04, 0.05]),
  },
};

/** Option d (outfit a in the hero's ink-line art, ADR-122's look path for the human bosses): the
 *  fills of his material instances (uArtFill, linear), the same parts as FOX_ART.a. */
export const FOX_INK = {
  welt: [0.78, 0.76, 0.7],
  hem: [0.5, 0.48, 0.45],
  coat: [0.11, 0.11, 0.2],
  lining: [0.05, 0.05, 0.08],
  pants: [0.15, 0.15, 0.17],
  piping: [0.42, 0.4, 0.36],
  facing: [0.55, 0.12, 0.07],
  hair: [0.05, 0.05, 0.06],
  shirt: [0.05, 0.05, 0.06],
  eye: [0.04, 0.03, 0.03],
  skin: [0.85, 0.6, 0.45],
};
