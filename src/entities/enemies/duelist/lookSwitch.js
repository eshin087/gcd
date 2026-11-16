// Look options behind URL switches: a redraw is shown to the owner as two or three options on one
// sheet and picked before it becomes the default (CLAUDE.md "One art design"; the pattern ADR-118
// used for the flare and ADR-119 for the wyrm's ring, breath and apocalypse).
//
//   lookOf('star', '0')   the option to draw the Dark Star with: `?star=a` in the URL, else `a` when
//                         the URL says `?looks=new` (every proposed redraw at once), else the default.
//   setLook('star', 'b')  the Lab, the tests and the film rig switch it live; null gives it back.
//
// By convention '0' is the look as it shipped before the option existed, 'a' the proposal its
// author would pick, 'b' and 'c' the alternatives. Read at draw time (a Map lookup): cheap.

const fromUrl = new Map();
const forced = new Map();
let allNew = false;
try {
  // (the headless tests have no `location`)
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  for (const [k, v] of q) if (v) fromUrl.set(k, v);
  allNew = fromUrl.get('looks') === 'new';
} catch {
  // no URL: the defaults
}

/** The option chosen for switch `name` (a short lower-case word); `def` when nothing chose one. */
export function lookOf(name, def = '0') {
  const f = forced.get(name);
  if (f != null) return f;
  const u = fromUrl.get(name);
  if (u != null) return u;
  return allNew && def === '0' ? 'a' : def;
}

/** Switch a look live (null: back to the URL's or the default). */
export function setLook(name, value) {
  if (value == null) forced.delete(name);
  else forced.set(name, String(value));
}

/** Every look as it would be drawn right now, for the Lab and for reports: { name: option }. */
export function looksNow(names) {
  const o = {};
  for (const n of names) o[n] = lookOf(n);
  return o;
}
