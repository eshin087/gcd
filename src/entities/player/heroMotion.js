// THE HERO'S MOTION AUDIT'S FIXES (ADR-256; the owner, 2026-11-26: "a lot of the bosses still have weird looking
// arm angles and sword positioning and attacks that look unrealistic", the hero audited the same way: integ.mjs
// `heroaudit`). Each fix is a switch, so the owner compares it with what ships; '0' is the motion before.
//
//   ?heroWrist=0|a|b   the sword wrist. His keys give the hand and the blade as two splines, so between keys the
//                      fist bent as far as WRIST_BACK (128°, anim.js) lets it: through every cut's turn, every roll
//                      and the held charge (75-104°). a: past 60° the blade's fold off the forearm eases toward
//                      80° (anim.js HeroAnimator._wristEase: the blade turns, the hand stays); b: from 50° toward 70°
//   ?heroThrust=0|a    the thrusts' extension (combo A's hit 4, the rising thrust; Piercing Gale, the lone heavy):
//                      they landed with the elbow at 127-143° and the blade 41-44° off the forearm, a cocked wrist
//                      on a bent arm. a: the hand at the arm's full stretch along the point's own line, the blade
//                      within ~15-20° of the forearm (a thrust extends from the shoulder along one line,
//                      docs/ANIMATION.md), aimed a little lower (36° / 24° up, from 45° / 36°)
//
// Read live: the player sets its animator's `wristSoft` every frame (player.js), setHeroThrust patches the two clips'
// keys in place (swings.js SWINGS; '0' puts production's back). The Lab's 'hero' row switches both.

import { SWINGS } from './swings.js';
import { forgetSwing } from './anim.js';

const D = Math.PI / 180;
export const WRIST = { 0: null, a: [60 * D, 80 * D], b: [50 * D, 70 * D] };
export const WRIST_IDS = ['0', 'a', 'b'];
let wristNow = 'a';
export const heroWrist = () => wristNow;
/** [from, max] rad for HeroAnimator.wristSoft, or null. */
export const wristSoft = () => WRIST[wristNow] ?? null;
export function setHeroWrist(m) {
  const id = String(m);
  if (!WRIST_IDS.includes(id)) return false;
  wristNow = id;
  return true;
}

// the keys a fix replaces: clip → { u: fields }
const THRUST_A = {
  risingThrust: {
    1.9: { h: [0.1, 0.22, 0.53], a: [4, 36] },
    2.45: { h: [0.1, 0.19, 0.49], a: [4, 34] },
  },
  heavyThrust: {
    1.9: { h: [0.13, 0.13, 0.6], a: [6, 24] },
    2.55: { h: [0.13, 0.1, 0.56], a: [6, 23] },
  },
};
export const THRUST = { 0: null, a: THRUST_A };
export const THRUST_IDS = ['0', 'a'];
const BASE = {};
for (const clip of Object.keys(THRUST_A)) {
  BASE[clip] = {};
  for (const u of Object.keys(THRUST_A[clip])) {
    const k = SWINGS[clip]?.keys.find((x) => Math.abs(x.u - +u) < 1e-6);
    if (k) BASE[clip][u] = Object.fromEntries(Object.keys(THRUST_A[clip][u]).map((f) => [f, k[f]]));
  }
}
let thrustNow = '0';
export const heroThrust = () => thrustNow;
export function setHeroThrust(m) {
  const id = String(m);
  if (!THRUST_IDS.includes(id)) return false;
  const T = THRUST[id];
  for (const clip of Object.keys(BASE)) {
    for (const u of Object.keys(BASE[clip])) {
      const k = SWINGS[clip].keys.find((x) => Math.abs(x.u - +u) < 1e-6);
      if (!k) continue;
      Object.assign(k, BASE[clip][u]);
      if (T?.[clip]?.[u]) Object.assign(k, T[clip][u]);
    }
    forgetSwing(clip);
  }
  thrustNow = id;
  return true;
}

// (in the game the fixes are on unless a switch turns them off; the headless sims start from the motion before,
//  which their checks are written for, and the audit names what it measures)
export const DEFAULT_WRIST = 'a';
export const DEFAULT_THRUST = 'a';
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q) {
    setHeroWrist(q.get('heroWrist') ?? DEFAULT_WRIST);
    setHeroThrust(q.get('heroThrust') ?? DEFAULT_THRUST);
  } else {
    setHeroWrist('0');
  }
}
