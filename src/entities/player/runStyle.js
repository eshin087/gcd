// The hero's run style (ADR-229): his posture on the run and the sprint over loco()'s shared gait, the hero's
// animator only (a duelist's footwork never reads it). The owner (2026-11-26), of the run with the sword carry
// G2: "This js looking better but i want to make him look cooler when he runs. Give another variations".
//   base     the run as loco() poses it
//   hunter   leaning hard into the run, the hips lower, the head held level, eyes ahead
//   dash     hunter, the free arm swept back behind him (runArms.js `b`: the swordsman's dash)
//   coiled   bladed: the chest turned so the sword shoulder leads and the free one hangs back, side-on to the run
//            (the sword shoulder drawn back instead put the steel against the coat)
//   ghost    low and smooth: little bounce, the lean held long, the coat streaming
// Written over loco()'s pose with its weight; never throws, no allocation, never Math.random.
import { clamp } from '../../core/math.js';

const IDS = ['base', 'hunter', 'dash', 'coiled', 'ghost'];
export const RUN_STYLE_IDS = Object.freeze(IDS.slice());
export const RUN_STYLE_NAMES = Object.freeze({ base: 'as it was', hunter: 'hunter', dash: "swordsman's dash", coiled: 'coiled', ghost: 'ghost' });
const DEFAULT = IDS[0];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: (() => {
  const v = q('runStyle');
  return IDS.includes(v) ? v : DEFAULT;
})() };
export const runStyleMode = () => PICK.mode;
export function setRunStyle(id) {
  PICK.mode = IDS.includes(String(id)) ? String(id) : DEFAULT;
  return PICK.mode;
}

// per style: `lean` the chest further into the run (rad, run → sprint), `sink` the hips lower (m), `head` how much
// of the added lean the neck gives back (1 = the head stays as level as before), `turn` the chest turned (rad; + = the
// sword shoulder back, − = it leads), `bob` × the stride's bounce, `arm` the free arm's carry (runArms.js)
export const RUN_STYLES = {
  base: null,
  hunter: { lean: [0.26, 0.14], sink: [0.09, 0.07], head: 0.9, turn: 0, bob: 1, arm: null },
  dash: { lean: [0.26, 0.14], sink: [0.09, 0.07], head: 0.9, turn: 0, bob: 1, arm: 'b' },
  coiled: { lean: [0.22, 0.12], sink: [0.07, 0.06], head: 0.9, turn: -0.3, bob: 1, arm: null },
  ghost: { lean: [0.3, 0.1], sink: [0.13, 0.08], head: 0.95, turn: 0, bob: 0.2, arm: null },
};

/** The style in use (its table, or null for `base`). */
export const runStyle = () => RUN_STYLES[PICK.mode] ?? null;

/** Write the style over loco()'s posture: `w` loco's weight, `runK` walk → run, `s` the sprint, `bob` the stride's
 *  bounce loco() put on bodyY this frame. */
export function applyRunStyle(p, P, St, w, runK, s, bob) {
  if (!St || !(w > 0)) return;
  const k = w * runK; // a walk keeps its own posture
  const lean = (St.lean[0] + (St.lean[1] - St.lean[0]) * s) * k;
  const sink = (St.sink[0] + (St.sink[1] - St.sink[0]) * s) * k;
  p[P.spX] += lean;
  p[P.hdX] -= lean * St.head;
  p[P.bodyY] -= sink + (1 - St.bob) * (Number.isFinite(bob) ? bob : 0) * k;
  if (St.turn) {
    // the chest turns toward the sword side, the head stays on the run
    p[P.spY] += St.turn * k;
    p[P.hdY] -= St.turn * k;
  }
}
/** The free arm's carry this style asks for (null: the runArm switch's). */
export const runStyleArm = () => runStyle()?.arm ?? null;
export const clampK = (v) => clamp(v, 0, 1);
