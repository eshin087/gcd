import { ART_CLOTH, ART_SKIN, ART_LIGHT } from '../ashDisciple/bodyArt.js';

// Gu Shan drawn through the WYRM's art path (`?hermitLook=a|b|c`; docs/STYLE.md "The house style":
// small fine digits, a dark body with brighter digits where the key light catches, outlines in
// strokes). The converter is ashDisciple/bodyArt.js toDragonLook (one per rig, at the first item's
// build); the colours are each spec's `ink`, per outfit (gear.js says which material is which piece).
// Outfit a0 is outfit a in the ink-line art: no spec here, look.js HERMIT_TINT colours it.

const cloth = (ink, o = {}) => ({ ...ART_CLOTH, light: [1.2, 0.8, 0.4, 0.02], ink, ...o });
const skin = (ink) => ({ ...ART_SKIN, ink });
/** White hair / straw: a bright ink, its outline strokes reaching further in (the strands). */
const strands = (ink) => cloth(ink, { strokeEdge: 0.3 });

export const HERMIT_ART = {
  // a, the Straw Recluse
  a: {
    default: cloth([0.1, 0.095, 0.09]),
    coat: cloth([0.12, 0.108, 0.085]), // the patched hemp robe
    lining: cloth([0.1, 0.09, 0.075]),
    facing: cloth([0.13, 0.14, 0.18]), // the patches, the rolled cuffs
    leather: strands([0.24, 0.18, 0.085]), // the straw cape
    welt: strands([0.11, 0.08, 0.037]), // its middle tier
    collarIn: cloth([0.08, 0.06, 0.03]),
    hem: strands([0.8, 0.79, 0.75]), // the white hair, brows and beard
    shirt: cloth([0.06, 0.055, 0.05]), // the sash, the collar band
    pants: cloth([0.07, 0.065, 0.055]),
    trim: cloth([0.25, 0.14, 0.07]), // the wooden beads, the hair pin
    piping: cloth([0.5, 0.31, 0.11]), // the wine gourd
    skin: skin([0.62, 0.44, 0.31]),
    eye: skin([0.1, 0.08, 0.07]),
    flask: { ...ART_LIGHT, ink: [0.9, 0.62, 0.2], emit: [1.0, 0.6, 0.2] },
  },
  // b, the Woodcutter
  b: {
    default: cloth([0.1, 0.095, 0.09]),
    coat: cloth([0.09, 0.068, 0.045]), // the hemp vest
    lining: cloth([0.04, 0.03, 0.022]),
    facing: cloth([0.08, 0.11, 0.2]), // the indigo headscarf
    leather: cloth([0.34, 0.27, 0.15]), // the rope belt, the rope over his shoulder, the bundle's ties
    collar: cloth([0.22, 0.15, 0.08], { strokeEdge: 0.3 }), // the firewood
    trim: cloth([0.12, 0.08, 0.05]), // the empty axe sling (dark leather)
    hem: cloth([0.34, 0.32, 0.27]), // the forearm and shin wraps
    shirt: cloth([0.05, 0.045, 0.045]), // the dark hair
    pants: cloth([0.085, 0.085, 0.095]),
    piping: cloth([0.38, 0.3, 0.15]), // the straw sandals
    skin: skin([0.64, 0.45, 0.3]),
    eye: skin([0.1, 0.08, 0.07]),
    flask: { ...ART_LIGHT, ink: [0.9, 0.62, 0.2], emit: [1.0, 0.6, 0.2] },
  },
  // c, the Ascetic
  c: {
    default: cloth([0.1, 0.095, 0.09]),
    coat: cloth([0.17, 0.11, 0.055]), // the faded ochre robe
    lining: cloth([0.13, 0.09, 0.05]),
    facing: cloth([0.24, 0.12, 0.07]), // the robe's edge
    leather: cloth([0.2, 0.13, 0.08]), // the cord at his waist
    trim: cloth([0.09, 0.05, 0.03], { strokeEdge: 0.3 }), // the great string of beads (dark wood)
    hair: strands([0.5, 0.5, 0.49]), // the grey hair
    hairTip: strands([0.62, 0.62, 0.6]),
    pants: cloth([0.12, 0.1, 0.08]),
    skin: skin([0.6, 0.43, 0.3]),
    eye: skin([0.2, 0.13, 0.09]), // shut: a dark lid line, no eye
    flask: { ...ART_LIGHT, ink: [0.9, 0.62, 0.2], emit: [1.0, 0.6, 0.2] },
  },
};
