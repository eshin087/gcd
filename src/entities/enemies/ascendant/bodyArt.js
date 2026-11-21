import { ART_CLOTH, ART_SKIN, ART_LIGHT } from '../ashDisciple/bodyArt.js';

// Look option `d` of Tian Lei's body (`?ascLook=d`): outfit a (gear.js) drawn through the WYRM's
// art path, the dragon-look twin the other two human bosses have as an unpicked option (the owner
// turned it down for them: "a block of digits at 30 m"; CLAUDE.md asks new characters to be drawn
// this way, so the owner sees both for this one). The converter is ashDisciple/bodyArt.js
// toDragonLook (one per rig, at the first item's build); the colours are each spec's `ink` (the
// hues of look.js ASC_TINT.a, a little brighter: the art path's key light is softer than the
// ink-line fill). The gold hair, the light and the wraps are recoloured by form through setFill
// (look.js), which writes the art source's ink on this path.

const cloth = (ink, o = {}) => ({ ...ART_CLOTH, light: [1.25, 0.8, 0.4, 0.02], ink, ...o });

/** Tian Lei, outfit a. */
export const ASC_ART = {
  default: cloth([0.1, 0.1, 0.11]),
  coat: cloth([0.4, 0.07, 0.06]), // the oxblood tunic
  collar: cloth([0.07, 0.06, 0.06]), // the soft boots
  lining: cloth([0.12, 0.03, 0.03]),
  leather: cloth([0.07, 0.065, 0.07]), // the black sash
  pants: cloth([0.12, 0.115, 0.13]),
  hem: cloth([0.55, 0.52, 0.46]), // the wraps
  shirt: cloth([0.05, 0.045, 0.05]), // the dark hair (form 1)
  hair: cloth([0.95, 0.64, 0.13], { strokeEdge: 0.3, inkGlow: 0.3 }), // the gold hair (forms 2 - 3)
  hairTip: cloth([1.0, 0.8, 0.28], { strokeEdge: 0.3, inkGlow: 0.3 }),
  skin: { ...ART_SKIN, ink: [0.6, 0.42, 0.3] },
  eye: { ...ART_SKIN, ink: [0.1, 0.08, 0.07] },
  flask: { ...ART_LIGHT, ink: [1.0, 0.7, 0.18], emit: [1.7, 1.0, 0.25] },
};
