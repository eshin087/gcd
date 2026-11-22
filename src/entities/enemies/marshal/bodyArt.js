import { ART_CLOTH, ART_METAL, ART_SKIN, ART_LIGHT, ART_KEEP } from '../ashDisciple/bodyArt.js';

// The Clockwork Marshal's body in the dragon look (ADR-093, ADR-100: every new character is drawn through
// the wyrm's art path; gear.js calls toDragonLook(ctx, MARSHAL_ART[look]) from the first item's build).
// A dark body, brighter digits only where the key light catches, stroke outlines; no red-and-gold, no
// chest light, no smooth faceplate. Which material is which (gear.js):
//   armor   the suit's plates          bevel  their worn, brighter edges     spike  the iron frame
//   welt    the gears and belts (glow hotter by phase: marshal.js drives uGlow)
//   flask   the furnace's grate and the fire tube's mouth (self-lit embers)
//   trim    the lance and the sabre (thinner than an art cell: today's material)
//   coat / shirt / pants / leather / hem / skin / hair / facing   the pilot (her arming coat, the
//   undershirt, trousers, belts and boots, the bandage, her face, the grey topknot, the bronze dial bracers)
// The yard is open-air and lit by the furnace: the light's gain a little over the courtyard's.

const DAY = 1.45;
const cloth = (ink, o = {}) => ({ ...ART_CLOTH, light: [DAY, 0.78, 0.36, 0.02], ink, ...o });
const plate = (ink, o = {}) => ({ ...ART_METAL, light: [DAY, 0.95, 1.35, 0.02], ink, ...o });
const glow = (ink, emit) => ({ ...ART_LIGHT, ink, emit });

/** The pilot's materials (the same in every look but her colours). */
const pilot = (o = {}) => ({
  coat: cloth([0.075, 0.068, 0.062]), // the soot-dark quilted arming coat
  collar: cloth([0.09, 0.08, 0.07]),
  lining: cloth([0.12, 0.1, 0.08]),
  collarIn: cloth([0.12, 0.1, 0.08]),
  shirt: cloth([0.05, 0.048, 0.05]),
  pants: cloth([0.06, 0.056, 0.055]),
  leather: cloth([0.13, 0.09, 0.055], { strokeEdge: 0.3 }),
  hem: cloth([0.46, 0.43, 0.38]), // the bandage on one arm
  piping: cloth([0.2, 0.15, 0.08]),
  facing: plate([0.3, 0.22, 0.1]), // the bronze dial bracers
  skin: { ...ART_SKIN, ink: [0.48, 0.38, 0.3] },
  eye: { ...ART_SKIN, ink: [0.08, 0.07, 0.06] },
  hair: cloth([0.4, 0.4, 0.41]), // grey topknot
  hairTip: cloth([0.48, 0.48, 0.5]),
  ...o,
});

export const MARSHAL_ART = Object.freeze({
  /** A (the default): bell-helm lamellar: verdigris bronze scales, brighter worn edges, an iron frame. */
  a: Object.freeze({
    default: cloth([0.1, 0.1, 0.1]),
    ...pilot(),
    armor: plate([0.16, 0.2, 0.15]),
    bevel: plate([0.42, 0.4, 0.27], { strokeEdge: 0 }),
    spike: plate([0.07, 0.07, 0.078]),
    welt: { ...plate([0.3, 0.2, 0.08]), glow: [0, 0.6], inkGlow: 0.3, emit: [1.0, 0.45, 0.12] },
    flask: glow([1.0, 0.4, 0.08], [1.0, 0.32, 0.06]),
    trim: ART_KEEP,
    blade: ART_KEEP,
    bladeTip: ART_KEEP,
    gem: ART_KEEP,
  }),
  /** B: boiler shell: smooth riveted plates in raw red-brown bronze. */
  b: Object.freeze({
    default: cloth([0.1, 0.1, 0.1]),
    ...pilot({ hair: cloth([0.08, 0.07, 0.06]), hairTip: cloth([0.1, 0.09, 0.08]), collar: cloth([0.18, 0.16, 0.13]) }),
    armor: plate([0.26, 0.14, 0.08]),
    bevel: plate([0.46, 0.3, 0.18], { strokeEdge: 0 }),
    spike: plate([0.08, 0.07, 0.065]),
    welt: { ...plate([0.32, 0.2, 0.08]), glow: [0, 0.6], inkGlow: 0.3, emit: [1.0, 0.45, 0.12] },
    flask: glow([1.0, 0.4, 0.08], [1.0, 0.32, 0.06]),
    trim: ART_KEEP, blade: ART_KEEP, bladeTip: ART_KEEP, gem: ART_KEEP,
  }),
  /** C: tomb general: square bronze tiles laced with cord, blackened bronze with bright edges. */
  c: Object.freeze({
    default: cloth([0.1, 0.1, 0.1]),
    ...pilot({ hair: cloth([0.06, 0.06, 0.07]), coat: cloth([0.1, 0.09, 0.08]), collar: cloth([0.14, 0.11, 0.08]) }),
    armor: plate([0.1, 0.095, 0.085]),
    bevel: plate([0.5, 0.42, 0.26], { strokeEdge: 0 }),
    spike: plate([0.06, 0.06, 0.066]),
    piping: cloth([0.24, 0.08, 0.06]), // the lacing cord
    welt: { ...plate([0.3, 0.2, 0.08]), glow: [0, 0.6], inkGlow: 0.3, emit: [1.0, 0.45, 0.12] },
    flask: glow([1.0, 0.4, 0.08], [1.0, 0.32, 0.06]),
    trim: ART_KEEP, blade: ART_KEEP, bladeTip: ART_KEEP, gem: ART_KEEP,
  }),
});
