import { ART_CLOTH, ART_METAL, ART_SKIN, ART_LIGHT, ART_KEEP } from '../ashDisciple/bodyArt.js';

// Qian Yao drawn through the WYRM's art path (FLAG.ART; ashDisciple/bodyArt.js toDragonLook; STYLE.md
// "The house style"): the default of each of his three bodies (`?fallenLook=a|b|c`); `?fallenArt=ink`
// draws the ink-line twin instead (look.js FALLEN_TINT). Designed for the art path: big flat facets,
// separate shapes, a strong silhouette at 30 m. The colours are each spec's `ink` (the hues of
// look.js FALLEN_TINT a little brighter: the art path's key light is softer than the ink-line fill).
// The bar (`trim`, `bevel`) stays on its ink-line material: a bar is thinner than an art cell.

const cloth = (ink, o = {}) => ({ ...ART_CLOTH, ink, ...o });
const metal = (ink, o = {}) => ({ ...ART_METAL, ink, ...o });

const COMMON = {
  default: cloth([0.14, 0.14, 0.145]),
  skin: { ...ART_SKIN, ink: [0.58, 0.46, 0.36] },
  eye: { ...ART_SKIN, ink: [0.9, 0.82, 0.55] },
  hair: cloth([0.07, 0.065, 0.07]),
  hairTip: cloth([0.1, 0.095, 0.1]),
  trim: ART_KEEP,
  bevel: ART_KEEP,
  // his bronze: the crown ring, the halo, the boards, the shackles, the aureole
  facing: metal([0.55, 0.38, 0.15], { strokeEdge: 0.25 }),
  // the light in the wheel / the aureole (look.js drives its glow with his sun)
  flask: { ...ART_LIGHT, ink: [1.0, 0.86, 0.5], emit: [1.2, 0.95, 0.5] },
};

export const FALLEN_ART = {
  // a: the Haloed Exile: bone white robe, ash-grey trousers, a bronze belt, pale sash ends
  a: {
    ...COMMON,
    coat: cloth([0.62, 0.6, 0.55]),
    collar: cloth([0.62, 0.6, 0.55]),
    lining: cloth([0.22, 0.21, 0.2]),
    hem: cloth([0.7, 0.66, 0.56]),
    shirt: cloth([0.08, 0.075, 0.07]),
    pants: cloth([0.3, 0.3, 0.31]),
    leather: metal([0.5, 0.35, 0.14]),
    armor: metal([0.4, 0.3, 0.15]),
  },
  // b: the Chained Judge: an ash-grey court robe layered over bone white, black hat
  b: {
    ...COMMON,
    coat: cloth([0.34, 0.33, 0.32]),
    collar: cloth([0.6, 0.58, 0.52]),
    lining: cloth([0.58, 0.55, 0.48]),
    hem: cloth([0.18, 0.12, 0.08]), // the scorched hem
    shirt: cloth([0.05, 0.05, 0.055]),
    pants: cloth([0.26, 0.26, 0.27]),
    leather: metal([0.5, 0.35, 0.14]),
    armor: metal([0.4, 0.3, 0.15]),
  },
  // c: the Gilt Guardian: bronze lamellar, a bone-white skirt under it, dark hair
  c: {
    ...COMMON,
    coat: cloth([0.6, 0.58, 0.52]),
    collar: cloth([0.6, 0.58, 0.52]),
    lining: cloth([0.2, 0.19, 0.18]),
    hem: cloth([0.64, 0.6, 0.52]),
    shirt: cloth([0.07, 0.065, 0.06]),
    pants: cloth([0.3, 0.3, 0.31]),
    leather: metal([0.48, 0.34, 0.14]),
    armor: metal([0.5, 0.36, 0.16]),
    spike: metal([0.55, 0.4, 0.18]),
    welt: metal([0.4, 0.3, 0.14]),
  },
};
