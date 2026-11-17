import { ART_CLOTH, ART_METAL, ART_SKIN, ART_KEEP } from '../ashDisciple/bodyArt.js';

// Look option `a` of Varr Nihil's body (`?lordLook=a`; `c` = with the form dressing too): the same
// figure in the dragon look. The converter and the shared light settings are ashDisciple/bodyArt.js
// (one file for both duelists; it may move to duelist/ at the merge). The Obsidian Throne's night is
// darker than the courtyard's: the light's gain is raised, not the albedo (docs/STYLE.md checklist).

const NIGHT = 1.5;
const cloth = (ink, o = {}) => ({ ...ART_CLOTH, light: [NIGHT, 0.8, 0.4, 0.02], ink, ...o });
const plate = (ink, o = {}) => ({ ...ART_METAL, light: [NIGHT, 0.95, 1.4, 0.02], ink, ...o });

/** The Starless Lord (gear.js says which material is which; the hues of lord.js _tint). */
export const LORD_ART = {
  default: cloth([0.1, 0.1, 0.11]),
  coat: cloth([0.08, 0.075, 0.085]), // black cloth: the cape, the war-skirt, the sleeves
  collar: cloth([0.09, 0.08, 0.09]),
  lining: cloth([0.42, 0.04, 0.03]), // crimson inside the cape and the skirt
  collarIn: cloth([0.42, 0.04, 0.035]),
  facing: cloth([0.34, 0.03, 0.03]),
  piping: cloth([0.42, 0.06, 0.05]),
  hem: cloth([0.3, 0.05, 0.05]), // the ember-red lower edge
  shirt: cloth([0.04, 0.04, 0.048]), // the undersuit
  pants: cloth([0.05, 0.05, 0.06]),
  leather: cloth([0.08, 0.07, 0.075]),
  hair: cloth([0.04, 0.04, 0.05]),
  hairTip: cloth([0.05, 0.05, 0.06]),
  skin: { ...ART_SKIN, ink: [0.05, 0.05, 0.06] },
  armor: plate([0.13, 0.13, 0.155]), // black plate
  spike: plate([0.16, 0.155, 0.18]),
  bevel: plate([0.36, 0.31, 0.34], { strokeEdge: 0 }), // the plates' bright edges
  welt: plate([0.2, 0.08, 0.08]),
  // the blades of red light, the slit in the faceplate, the sigil, the hilt: today's materials (a
  // blade is thinner than one art cell; its light is the fight's tell)
  flask: ART_KEEP,
  trim: ART_KEEP,
};
