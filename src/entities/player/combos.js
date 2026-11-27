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

const hit = (clip, w, a, r, ch, extra = null, fin = null, feel = null) => ({ anim: { kind: 'clip', clip, ...(extra ?? {}) }, windup: w, active: a, recovery: r, chain: ch, fin, feel });
// a hit's impact (`feel`, the owner, 2026-11-26: "make the attack animation look better in terms of animation and
// impact/feel"): its hit-stop (s), shake, zoom punch and kick along the cut on a landed blow, and its step in
// (`lunge`, m) — the combo's own, over production's (player.js _applyHit reads them off the def)
const F = (hitstop, shake, punch, kick, lunge) => ({ hitstop, shake, punch, kick, lunge });
const FIN = { kind: 'light', heavy: true, contact: 'sweep' }; // a finisher that is not the slam
export const COMBOS = {
  a: {
    name: 'Iai', feel: 'iai', hand: 'back',
    hits: [
      // (hit-stop by the tiers of docs/ANIMATION.md 5.4: the lights 0.065-0.07 s, the thrust a medium 0.08,
      // the finisher a heavy 0.15)
      hit('drawCut', 0.09, 0.1, 0.28, 0.28, { turn: 0.3 }, null, F(0.065, 0.16, 0.5, 0.14, 0.75)),
      hit('flatBackhand', 0.09, 0.1, 0.28, 0.28, { turn: -0.4 }, null, F(0.065, 0.16, 0.5, 0.14, 0.75)),
      hit('risingSlash', 0.1, 0.11, 0.28, 0.28, { hop: 0.12 }, null, F(0.07, 0.2, 0.55, 0.16, 0.85)),
      hit('risingThrust', 0.09, 0.09, 0.28, 0.28, null, null, F(0.08, 0.18, 0.7, 0.16, 1.0)),
      hit('heavyCrush', 0.24, 0.13, 0.45, 0.3, null, FIN, F(0.15, 0.5, 1.8, 0.3, 0.9)),
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
const KEYS = ['anim', 'variants', 'windup', 'active', 'recovery', 'chain', 'kind', 'heavy', 'contact', 'hitstop', 'shake', 'punch', 'kick', 'lunge'];
const BASE = LIGHT.map((d) => Object.fromEntries(KEYS.map((k) => [k, d[k]])));
let comboNow = '0';
/** The light combo now ('0' production's, or a COMBOS key). */
export const comboMode = () => comboNow;
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
    d.variants = [];
    d.windup = H.windup;
    d.active = H.active;
    d.recovery = H.recovery;
    d.chain = H.chain;
    if (H.fin) Object.assign(d, H.fin);
    if (H.feel) Object.assign(d, H.feel);
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
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('combo') : null;
  if (typeof location !== 'undefined') setCombo(q && COMBO_IDS.includes(q) ? q : DEFAULT_COMBO);
}
