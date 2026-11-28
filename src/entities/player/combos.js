// FOUR LIGHT COMBOS FOR THE ENDING SLASH (`?combo=a|b|c|d`, ADR-240; the owner, 2026-11-26: "it should show at the
// end like an ending slash feel. If we need to make new animations and swings to make the new instant slash
// effect look good then do it and make 4 new light attack combos"; the timing may change). Each combo is five
// hits built from production's own swings (swings.js: every one already a natural cut), put in a new order,
// on new timing (a quick cut into a finish that holds, so the ending slash lands on a still pose), with a feel
// (feel.js: the clock inside each phase, the body's sink and turn) and a free hand (offHand.js, through the
// feel's own, `?offhand=auto`). A hit gives its clip (and the clip's extras: a pivot `turn`, a `hop`, a `spin`)
// and its windup / active / recovery / chain (s); a finisher that is not the slam is a light-kind heavy blow
// (`kind: 'light', heavy: true`: the heavy ending slash, no ground shards; a heavy after it is the lone heavy,
// as after the slam). Damage, posture, reach and the rest of each hit are production's. '0' = production.
//   a  Iai       draws: each cut leaves from a still pose and stops dead in another, the hand behind his back
//                (feel snap); a two-handed falling cut to finish
//   b  Tempest   quick strokes back and forth, no holds, the moves of the hand pulled in (feel flow); a full
//                turn to finish
//   c  Mountain  slow loads, heavy cuts, deep sinks, the hand at his side (feel weight); the leaping slam
//   d  Dancer    a skip, a turn, a lunge: crisp (feel snap), the hand loose at his side; a rising two-handed cut

import { LIGHT } from './combat.js';
import { setFeel, setFeelHand } from './feel.js';

const hit = (clip, w, a, r, ch, extra = null, fin = null) => ({ anim: { kind: 'clip', clip, ...(extra ?? {}) }, windup: w, active: a, recovery: r, chain: ch, fin });
// THE PLANTED COMBO (`?plant=1`, the default; the owner, 2026-11-27: "the character forward momentum from the
// attacks are way too much and his legs are also moving too much", with a reference whose swordsman barely
// moves through a whole combo; asked, they chose "nearly planted", stepping in only when the foe is out of
// reach). A combo's `plant` gives each hit its own step in (`lunge`, m: the step-in assist still stretches
// it to a foe out of reach, player.js _lungeFor), takes the skip off (`hop`), and plays the feet as a slide
// (anim.js plantFeet: the front foot slides on with the body and the rear one is drawn up after it, the
// stance kept, instead of a stride that changes the lead foot every hit). '0': production's lunges and steps.
export const PLANT_IDS = ['0', '1'];
let plantNow = '1';
export const plantMode = () => plantNow;
// THE POKE (`?poke=1`, the default; the owner, 2026-11-27: "the 4th thrust from the combo also needs to be a
// real thrust poke"): a combo's `poke` hit plays swings.js `poke`, a level thrust, instead of its own clip
// (combo A's rising thrust). '0' keeps the rising thrust.
export const POKE_IDS = ['0', '1'];
let pokeNow = '1';
export const pokeMode = () => pokeNow;
const FIN = { kind: 'light', heavy: true, contact: 'sweep' }; // a finisher that is not the slam
export const COMBOS = {
  a: {
    name: 'Iai', feel: 'snap', hand: 'guard',
    // (planted: m stepped in per hit; the skip off hit 3; hit 4 the level poke)
    // (`reach`: hit 5's two-handed falling cut connects nearer than the slam's 2.1 m it stands in for: the
    // step-in assist sizes its step from it, so a foe 2 m off is still reached)
    plant: { lunge: [0.12, 0.12, 0.14, 0.2, 0.24], reach: [null, null, null, null, 1.7], noHop: true },
    poke: 3,
    hits: [
      hit('drawCut', 0.09, 0.1, 0.28, 0.28, { turn: 0.3 }),
      hit('flatBackhand', 0.09, 0.1, 0.28, 0.28, { turn: -0.4 }),
      hit('risingSlash', 0.1, 0.11, 0.28, 0.28, { hop: 0.12 }),
      hit('risingThrust', 0.09, 0.09, 0.28, 0.28),
      hit('heavyCrush', 0.24, 0.13, 0.45, 0.3, null, FIN),
    ],
  },
  b: {
    name: 'Tempest', feel: 'flow', hand: 'quiet',
    hits: [
      hit('fallingCut', 0.09, 0.11, 0.2, 0.25),
      hit('risingBackhand', 0.09, 0.11, 0.2, 0.25),
      hit('fallingBackhand', 0.09, 0.11, 0.2, 0.25),
      hit('lowSweep', 0.1, 0.12, 0.2, 0.25),
      hit('whirl', 0.16, 0.16, 0.36, 0.3, { spin: -1, spinFeet: 'hop' }, FIN),
    ],
  },
  c: {
    name: 'Mountain', feel: 'weight', hand: 'side',
    hits: [
      hit('fallingCut', 0.14, 0.12, 0.3, 0.32),
      hit('flatBackhand', 0.14, 0.12, 0.3, 0.32, { turn: -0.4 }),
      hit('risingWhirl', 0.16, 0.15, 0.32, 0.32, { spin: -1, spinFeet: 'hop' }),
      hit('lunge', 0.14, 0.1, 0.3, 0.32),
      hit('slam', 0.32, 0.13, 0.45, 0.3, { hop: 0.36, tuck: 1.3 }),
    ],
  },
  d: {
    name: 'Dancer', feel: 'snap', hand: 'side',
    hits: [
      hit('risingSlash', 0.1, 0.11, 0.26, 0.27, { hop: 0.12 }),
      hit('fallingBackhand', 0.1, 0.11, 0.26, 0.27),
      hit('whirl', 0.12, 0.15, 0.28, 0.28, { spin: -1, spinFeet: 'hop' }),
      hit('lunge', 0.1, 0.1, 0.26, 0.27),
      hit('heavyRise', 0.24, 0.13, 0.45, 0.3, null, FIN),
    ],
  },
};
export const COMBO_IDS = ['0', 'a', 'b', 'c', 'd'];
const KEYS = ['anim', 'variants', 'windup', 'active', 'recovery', 'chain', 'kind', 'heavy', 'contact', 'lunge', 'reach'];
const BASE = LIGHT.map((d) => Object.fromEntries(KEYS.map((k) => [k, d[k]])));
let comboNow = '0';
/** The light combo now ('0' production's, or a COMBOS key). */
export const comboMode = () => comboNow;
/** Plant combo A's feet or give it production's steps back (re-wears the combo now); false for an unknown id. */
export function setPlant(m) {
  const id = String(m);
  if (!PLANT_IDS.includes(id)) return false;
  plantNow = id;
  setCombo(comboNow);
  return true;
}
/** Hit 4 the level poke ('1') or the combo's own thrust ('0'); re-wears the combo now. */
export function setPoke(m) {
  const id = String(m);
  if (!POKE_IDS.includes(id)) return false;
  pokeNow = id;
  setCombo(comboNow);
  return true;
}
/** Wear a combo on the five light defs (and its feel); '0' gives production's back. False for an unknown id. */
export function setCombo(m) {
  const id = String(m);
  if (!COMBO_IDS.includes(id)) return false;
  const C = COMBOS[id] ?? null;
  LIGHT.forEach((d, i) => {
    for (const k of KEYS) {
      if (BASE[i][k] === undefined) delete d[k];
      else d[k] = BASE[i][k];
    }
    const H = C?.hits[i];
    if (!H) return;
    d.anim = H.anim;
    if (C.poke === i && pokeNow === '1') d.anim = { ...H.anim, clip: 'poke' };
    if (C.plant && plantNow === '1') {
      const { hop, ...rest } = d.anim;
      d.anim = { ...(C.plant.noHop ? rest : d.anim), feet: 'plant' };
      if (Number.isFinite(C.plant.lunge?.[i])) d.lunge = C.plant.lunge[i];
      if (Number.isFinite(C.plant.reach?.[i])) d.reach = C.plant.reach[i];
    }
    d.variants = [];
    d.windup = H.windup;
    d.active = H.active;
    d.recovery = H.recovery;
    d.chain = H.chain;
    if (H.fin) Object.assign(d, H.fin);
  });
  setFeel(C ? C.feel : '0');
  setFeelHand(C ? C.hand : null);
  comboNow = id;
  return true;
}
// (in the game the owner's baseline, combo A (2026-11-26: "lets use this as the baseline"), unless `?combo=` picks
// another ('0' production's); the headless sims keep production's defs, which their checks are written for)
export const DEFAULT_COMBO = 'a';
{
  const S = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const q = S?.get('combo') ?? null;
  if (S && PLANT_IDS.includes(S.get('plant'))) plantNow = S.get('plant');
  if (S && POKE_IDS.includes(S.get('poke'))) pokeNow = S.get('poke');
  if (typeof location !== 'undefined') setCombo(q && COMBO_IDS.includes(q) ? q : DEFAULT_COMBO);
}
