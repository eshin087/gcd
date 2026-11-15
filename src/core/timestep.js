// How a rendered frame is split into simulation steps (main.js; ADR-103).
//
// The game's timing windows are short (a perfect parry: 0.08 s, DEFENSE in combat/rules.js) and every
// headless test steps the simulation at 1 / 60 s. A frame is therefore never simulated in one step
// longer than about that: a slow frame is cut into equal steps, so a machine at 30 fps runs the very
// steps the tests run (two of 1 / 60 s) instead of one step of 1 / 30 s that samples a 0.08 s
// window two and a half times. A fast frame (120 Hz, 144 Hz) is one short step, as before.
//
//   max       the longest step aimed for, s
//   slack     a frame up to (1 + slack) x max is still ONE step: a 60 Hz frame that comes in a hair
//             late (16.9 ms) must not be cut in two, and a 50 Hz display runs one step of 20 ms
//   maxSteps  steps per frame at most; a frame longer than maxSteps x max s (under 10 fps) is
//             simulated as that much time and the game runs slow, as it always did under 20 fps
export const STEP = Object.freeze({ max: 1 / 60, slack: 0.25, maxSteps: 6 });

/** The longest frame that is simulated in full (s). */
export const FRAME_MAX = STEP.max * STEP.maxSteps;

/**
 * Split a frame of `realDt` seconds: `out.n` steps of `out.dt` seconds each (n x dt = the frame,
 * clamped to [0, FRAME_MAX]). A non-finite or negative frame is one step of 0 s.
 */
export function simSteps(realDt, out = { n: 1, dt: 0 }) {
  const T = Number.isFinite(realDt) && realDt > 0 ? Math.min(realDt, FRAME_MAX) : 0;
  const n = Math.max(1, Math.min(STEP.maxSteps, Math.ceil(T / STEP.max - STEP.slack)));
  out.n = n;
  out.dt = T / n;
  return out;
}

/**
 * Simulate one frame: `simulate(dt)` once per step, and `afterFirst()` once, right after the first
 * step. A press or a release is an edge of the FRAME: the first step sees it and the others see
 * only what is held, so `afterFirst` is where the input's edges are cleared (a second step must not
 * toggle the lock-on back or buffer the roll again).
 * `one`: a single step of `realDt` whatever its length (window.__tick, a dev aid's exact step).
 * Returns `out` ({ n, dt }: what was run).
 */
export function runFrame(realDt, simulate, afterFirst, out = { n: 1, dt: 0 }, one = false) {
  if (one) {
    out.n = 1;
    out.dt = Number.isFinite(realDt) && realDt > 0 ? realDt : 0;
  } else simSteps(realDt, out);
  for (let i = 0; i < out.n; i++) {
    simulate(out.dt);
    if (i === 0) afterFirst?.();
  }
  return out;
}
