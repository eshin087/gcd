// The False Saint's effects driven alone (the FX AGENT's file), before the moves use them: the Lab and the
// film rig call `dragon.debug.fx(name, opts)`, which calls `run(d, name, opts)` here (saint.js); FsFx.update
// then steps the timeline every frame (`step(d, drive, dt)`, fx time) until it returns false. `d` is the
// boss (d.fx the FsFx). Each driver calls the FsFx methods with the arguments of the contract (fx.js
// header), as a move will: every frame for the held ones, once for the others. Nothing here deals damage
// or breaks the world.
//
//   name        what it plays (s)                                         opts
//   'jet'       the right elbow's booster lit and out (1.2)               part
//   'stopAll'   ends the timeline
// (wave 0: the two above; the fx agent adds one driver per effect)

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

const DRIVERS = {
  jet: { dur: 1.2, frame: (d, t, o) => d.fx.jet?.(o.part ?? 'elbowR', Math.sin(Math.min(1, t / 1.2) * Math.PI)) },
};

/** Start driver `name` (false: none of that name; 'stopAll' ends the one playing). */
export function run(d, name, opts = {}) {
  if (!d?.fx) return false;
  if (name === 'stopAll') {
    d.fx._drive = null;
    return true;
  }
  const D = DRIVERS[name];
  if (!D) return false;
  d.fx._drive = { D, t: 0, o: opts ?? {} };
  return true;
}

/** One frame of the timeline: false when it is over. */
export function step(d, drive, dt) {
  drive.t += fin(dt);
  drive.D.frame?.(d, drive.t, drive.o);
  return drive.t < drive.D.dur;
}

/** The drivers' names (the Lab's list). */
export const NAMES = Object.freeze(Object.keys(DRIVERS));
