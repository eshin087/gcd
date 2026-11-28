// THE RED TRAIL (?redTrail=0|a|b; default 0 = off, today's look; ADR-271). The owner's Phantom Blade
// Zero reference (2026-11-27): every cut of a red string leaves a long thin red crescent. From a red
// blow's flare onward (never before it: the flare is the timing cue, ADR-118) the blade's sweep lays a
// thin red line just outside its white edge (duelist/fx.js `sweep`; numbers: TELL_STYLE.red.trail):
//   a  thin and short-lived (~0.2 s)
//   b  longer (~0.45 s), a little hotter: the film's long crescent
// Blades only (Shen Hui, the Starless Lord, Lu Wusheng: every duelist whose cut goes through `sweep`).
// The bare-handed bosses and the wyrm are left out: a fist's or a claw's path is short and lies on the
// contact, where a red wake would hide the blow; their flare already marks it.

const OPTS = ['0', 'a', 'b'];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
export const RED_TRAIL_DEFAULT = '0'; // off until the owner picks
/** The switch (the Lab cycles it; read on every cut). */
export const RED_TRAIL = { opts: OPTS, mode: OPTS.includes(q('redTrail')) ? q('redTrail') : RED_TRAIL_DEFAULT };
export const getRedTrail = () => RED_TRAIL.mode;
export const setRedTrail = (m) => (RED_TRAIL.mode = OPTS.includes(m) ? m : RED_TRAIL_DEFAULT);
