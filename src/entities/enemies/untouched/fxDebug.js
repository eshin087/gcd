// Bai Wuji's effects driven alone (the FX AGENT's file), before the moves exist: the Lab and the film
// rig call `dragon.debug.fx(name, opts)`, which calls `run(d, name, opts)` here (untouched.js).
// `d` is the boss (d.fx is the WjFx). Return true when `name` was known. Empty today.

/** Drive effect `name` once (or start it): returns true if this module knows the name. */
export function run(d, name, opts) {
  void d, name, opts;
  return false;
}
