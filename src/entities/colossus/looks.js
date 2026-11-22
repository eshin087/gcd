// The Tide Colossus's look (?tideLook=a|b|c; ADR-143): three steps of ONE idea, all in the wyrm's surface
// (the owner turned down full redraws of the wyrm and picks from graded builds; wyrm look lessons). None
// is the owner's pick until they pick it from the rendered sheets (.claude/preview/tide-colossus/).
//
//   a  DROWNED HIDE   the wyrm's hide as it is; the seams jade, on the throat, the palms and the gills; a
//                     small bare coral crown. The nearest to the wyrm.
//   b  REEF-GROWN     a, and barnacle crust on the knuckles, the brow and the shoulders, kelp ribbons from
//                     the wrists and the crown, the comb teeth, the six eyes. The fight is built with it.
//   c  WRECK-CROWNED  b, and wreckage grown into it: spars in the crown, an anchor chain over one shoulder,
//                     a hull plate on a forearm. The most silhouette.
//
// Everything here is drawn only (model.js): joints, hit volumes and timings are the same in all three.

export const TIDE_LOOKS = ['a', 'b', 'c'];
export const TIDE_LOOK_DEFAULT = 'b';
let LOOK = TIDE_LOOK_DEFAULT;
try {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const v = String(q.get('tideLook') ?? q.get('tidelook') ?? '').toLowerCase();
  if (TIDE_LOOKS.includes(v)) LOOK = v;
} catch {
  /* headless */
}

const BUILDS = {
  a: { name: 'drowned hide', barnacles: false, kelp: false, comb: false, eyes: 2, crown: 'bare', wreck: false },
  b: { name: 'reef-grown', barnacles: true, kelp: true, comb: true, eyes: 6, crown: 'reef', wreck: false },
  c: { name: 'wreck-crowned', barnacles: true, kelp: true, comb: true, eyes: 6, crown: 'reef', wreck: true },
};

/** The look in use ('a' | 'b' | 'c'; 'b' with nothing set); read once from ?tideLook=. */
export const tideLookId = () => LOOK;
/** Its numbers. */
export const tideLook = () => BUILDS[LOOK] ?? BUILDS[TIDE_LOOK_DEFAULT];
/** Pick the look the NEXT built colossus has (the tests, the Lab's look sheets). False for an unknown name. */
export function setTideLook(k) {
  if (!TIDE_LOOKS.includes(k)) return false;
  LOOK = k;
  return true;
}
