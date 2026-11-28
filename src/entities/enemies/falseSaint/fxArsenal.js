// The False Saint's arsenal drawings' helpers (the FX AGENT's file): what fx.js's lasers, cannons, bolts,
// missiles, shells and the lance need beyond one call (pools of records in flight, their per-frame step).
// fx.js (FsFx) calls, all optional:
//   createState()                    → the state (fixed pools: no allocation per frame)
//   resetState(fx, state)            the fight's reset: every record dead
//   update(fx, state, dt, d)         every frame (fx dt), after AscFx's
// Empty today (wave 0).
export function createState() {
  return {};
}
export function resetState() {}
export function update() {}
