// THE HERO'S MOVE STYLES (options for the owner's pick; `today` is the default and draws exactly
// what shipped before). A style is one "character": how he STANDS (a set of poses he shifts
// between, at ease and in a fight), what he does when IDLE, and his light-attack COMBO.
//
//   ?moves=<id>    both halves from one style      (today | flow | still | restless | showy)
//   ?stance=<id>   only how he stands and idles    (wins over ?moves=)
//   ?combo=<id>    only the light chain            (wins over ?moves=)
//   Lab: PLAYER -> the 'moves' rows.
//
// THE CONTRACT (one file per style, `styles/<id>.js`, each owned by one author):
//   id, label, blurb
//   stances   null = today's two (stances.js atEase / fencerGuard), or
//             { ease: [STANCE, ...], fight: [STANCE, ...] } with
//             STANCE = { id, fn(p, P, A), w = 1, dwell = [min, max] seconds (counted after its
//             fade), minTier?, maxTier? (the streak tiers it may play at), move? ({ d, n } or
//             false: where the free hand's fingers and palm go as he sets off) }
//             fn writes a whole standing pose over guard()'s, like stances.js atEase. The animator
//             holds one stance per set for `dwell` seconds, then cross-fades to another by weight
//             (never the same twice running). One entry = one fixed stance.
//   shift     optional { fade: seconds } for that cross-fade
//   fidgets   null = today's FIDGETS (anim.js), or [{ name, dur, fn(p, A, u, e), sets: ['ease'] }],
//             written as offsets from the current pose ('fight' in `sets`: it plays in the guard too).
//             Guide: styles/STANCES.md; audit: node tests/audit/hero-stance.mjs . <id>
//   chain     null = today's LIGHT (combat.js), or 3 - 7 attack defs in LIGHT's shape (each with a
//             `name` unique across every style, `combo` = its index + 1). The levers (several
//             blows in one press, a held beat, heft, the rules a clip must pass): styles/COMBOS.md
//   chainAwake  optional [{ minTier, chain }]: at a chain's START the entry with the highest
//             minTier at or under the hero's streak tier replaces the chain (the streak piece
//             'tiers' on)
//   swings    {} or clips in swings.js's format, under names unique across every style (prefix
//             them with the style's id); they are added to SWINGS. A clip whose blade is carried
//             round by a body turn carries `spin: true` (the whip lint skips it, as it does the whirl)
// A style file imports only ../poseKit.js and ../swingKit.js (never anim.js, swings.js or combat.js:
// they import the styles).
// Nothing here may read Math.random (the sims seed it): use the animator's noise.
import { today } from './today.js';
import { flow } from './flow.js';
import { still } from './still.js';
import { restless } from './restless.js';
import { showy } from './showy.js';

export const STYLES = { today, flow, still, restless, showy };
export const STYLE_IDS = Object.keys(STYLES);

const known = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(STYLES, v) ? v : null);
const fromUrl = (() => {
  try {
    if (typeof location === 'undefined') return {};
    const q = new URLSearchParams(location.search), both = known(q.get('moves'));
    return { stance: known(q.get('stance')) ?? both, combo: known(q.get('combo')) ?? both };
  } catch {
    return {};
  }
})();
const PICK = { stance: fromUrl.stance ?? 'today', combo: fromUrl.combo ?? 'today' };

/** The style he stands and idles in / the style his light chain comes from. */
export const stanceStyle = () => STYLES[PICK.stance];
export const comboStyle = () => STYLES[PICK.combo];
export const stanceStyleId = () => PICK.stance;
export const comboStyleId = () => PICK.combo;
/** Lab / tests: switch at run time (an unknown id is ignored). Returns the id now set. */
export function setStanceStyle(id) {
  if (known(id)) PICK.stance = id;
  return PICK.stance;
}
export function setComboStyle(id) {
  if (known(id)) PICK.combo = id;
  return PICK.combo;
}
export function setMoves(id) {
  setStanceStyle(id);
  setComboStyle(id);
  return PICK.stance;
}
