import { ART_CLOTH, ART_SKIN, ART_KEEP } from '../ashDisciple/bodyArt.js';

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
/** Lacquered plate (option c's cuirass): a hard key and a brighter edge. */
const plate = (ink, o = {}) => ({ ...ART_CLOTH, light: [0.85, 0.75, 0.5, 0.02], strokeEdge: 0.3, ink, ...o });
/** The big dark cloth (robe, trousers, linings): a low gain and a soft key, so it prints dim digits
 *  and the pale and red parts stand out of it (at the game camera its flared skirt caught the key and
 *  printed as bright as the fur). */
const dark = (ink, o = {}) => ({ ...ART_CLOTH, light: [0.75, 0.4, 0.4, 0.02], ink, ...o });
const skin = (ink) => ({ ...ART_SKIN, light: [1.1, 0.8, 0.2, 0.05], ink });

/** The parts every outfit shares: the dao (today's material: thinner than an art cell), the skin. */
const SHARED = {
  default: cloth([0.1, 0.1, 0.11]),
  armor: ART_KEEP, // the dao's steel
  bevel: ART_KEEP, // its edge
  trim: ART_KEEP, // its guard and pommel
  skin: skin([0.55, 0.4, 0.3]),
  eye: cloth([0.05, 0.035, 0.035], { strokes: 'none' }), // the mask's eye slits, nose, the ears' insides
  shirt: cloth([0.045, 0.045, 0.055]), // the darks: shoes, the grip's cord, the under-collar
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
    facing: cloth([0.5, 0.1, 0.05]), // the dull vermilion sash
    hair: cloth([0.04, 0.04, 0.05]), // the dark hair behind the mask
  },
  // b, the Charm-Bearer: white hair, a half mask, a sleeveless vest, a rope belt hung with paper
  b: {
    ...SHARED,
    welt: pale([0.86, 0.84, 0.77], { light: [1.3, 1.2, 0.5, 0.16] }), // the half mask
    hair: pale([0.62, 0.62, 0.64]), // the white hair and its long tail
    coat: dark([0.06, 0.08, 0.1]), // the sleeveless vest: a blue-black
    shirt: cloth([0.04, 0.04, 0.05]),
    leather: cloth([0.2, 0.17, 0.12], { strokeEdge: 0.3 }), // the thick hemp rope
    hem: pale([0.5, 0.48, 0.44]), // the paper strips
    facing: cloth([0.42, 0.09, 0.05]), // the vermilion cords that tie the paper
    pants: dark([0.24, 0.235, 0.26]), // the wide trousers: a lighter grey than the vest, the figure's widest part
    piping: pale([0.21, 0.2, 0.18]), // the wraps
  },
  // c, the Fox Captain: a lacquered cuirass, a fox's head on the left shoulder and its pelt, the mask on the brow
  c: {
    ...SHARED,
    welt: pale([0.86, 0.84, 0.77], { light: [1.3, 1.2, 0.5, 0.16] }), // the mask pushed up on the brow
    spike: plate([0.08, 0.055, 0.055]), // the cuirass: black-red lacquer, its plates catching the key
    leather: cloth([0.28, 0.18, 0.1]), // straps, the belt
    hem: pale([0.3, 0.29, 0.27]), // the fox's head and its pelt: a silver fox, grey
    coat: dark([0.085, 0.085, 0.15]), // the under-robe, sleeves and skirt (the Shrine Fox's indigo)
    pants: dark([0.12, 0.12, 0.135]),
    piping: pale([0.21, 0.2, 0.18]),
    facing: cloth([0.42, 0.09, 0.05]), // the vermilion cords of the cuirass
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

/** The dao on today's material, every option (the fills of its ink-line parts). */
export const DAO_INK = {
  armor: [0.42, 0.44, 0.47], // a broad blade of grey steel, duller than the jian
  bevel: [0.7, 0.72, 0.76], // its edge
  trim: [0.2, 0.17, 0.14], // dark iron fittings
};
