import { lookOf } from './lookSwitch.js';
import { tatterStrip, sheetOffset } from '../../player/heroGeo.js';

// The bosses drawn like the hero's ASCII (ADR-220): per boss, one look switch whose options step from
// today's print toward the hero's own figure at the game camera. The levers (docs/STYLE.md "The bosses
// drawn like the hero"):
//   letters  his letter cell follows his size on screen as the hero's does (pipeline.js
//            _updateBossLetters; at 720p and on the phone it is the cell he had, from 1080p up it is
//            the hero's chunkier one)
//   body     his cloth printed with the hero's values instead of ADR-194's evenly lit body: a dark
//            letter body (sparse marks in the shadow), light only on the lit side and the screen-left
//            rim (U.uBossHero.x, materials.js; 0 = ADR-194's lift, 1 = the hero's cloak)
//   hem      the pale dotted hem rises from the shin to where the hero's coat tails turn pale (m above
//            his feet, U.uBossHero.y) and fades in over `fade` m (z): his cloth's lower part reads as
//            the hero's flowing tails
//   rim      the screen-left lavender rim on his cloth (× uArtHeroRim, w; 1 = the hero's)
//   cloth    built at load (the boss's gear.js: `clothPanels(level, panels)`): his skirt cut the hero's
//            way, wider toward the hem and torn into strips (flared), so he widens toward the ground
// Option '0' is each boss as he shipped (ADR-194's print); the owner picks one per boss (PICKED in
// lookSwitch.js). Read every frame by main.js (a Map lookup): the print is live; the cloth needs a reload.

/** level id -> its switch name and the options: { letters, body, hem, fade, rim, cloth }. */
export const HERO_PRINT = Object.freeze({
  ash: { name: 'ashHero', opts: {
    a: { letters: true, body: 1, hem: 0.95, fade: 0.35, rim: 0 },
    b: { letters: true, body: 1, hem: 0.95, fade: 0.35, rim: 0, cloth: 'flare' },
  } },
  starless: { name: 'lordHero', opts: {
    a: { letters: true, body: 1, hem: 0.95, fade: 0.35, rim: 0 },
    b: { letters: true, body: 1, hem: 0.95, fade: 0.35, rim: 0, cloth: 'flare' },
  } },
  ring: { name: 'ascHero', opts: {
    a: { letters: true, body: 0.5, hem: 0.95, fade: 0.35, rim: 0 },
    b: { letters: true, body: 0.5, hem: 0.95, fade: 0.35, rim: 0, cloth: 'flare' },
  } },
  grove: { name: 'sheathHero', opts: {
    a: { letters: true, body: 1, hem: 0.95, fade: 0.35, rim: 0 },
    b: { letters: true, body: 1, hem: 0.95, fade: 0.35, rim: 0, cloth: 'flare' },
  } },
  city: { name: 'halHero', opts: {
    a: { letters: true, body: 1, hem: 0.95, fade: 0.35, rim: 0 },
  } },
});

const NONE = Object.freeze({ letters: false, body: 0, hem: 0, fade: 0, rim: 0, cloth: null });
/** Every option with the defaults filled in, made once (heroPrint runs every frame: no allocation). */
const FULL = new Map();
for (const [id, e] of Object.entries(HERO_PRINT)) FULL.set(id, new Map(Object.entries(e.opts).map(([k, o]) => [k, Object.freeze({ ...NONE, ...o })])));

/** The hero print drawn now for level `id` (NONE for a level without a switch, or its option '0'). */
export function heroPrint(id) {
  const e = HERO_PRINT[id];
  if (!e) return NONE;
  return FULL.get(id).get(lookOf(e.name, '0')) ?? NONE;
}

/** The cloth the boss of level `id` is built with ('flare' | null): read once by his gear.js. */
export function heroCloth(id) {
  return heroPrint(id).cloth ?? null;
}

/** The torn strips' lengths (m) and forks a flared panel takes, in turn (the hero's coat tails: 0.07 - 0.15). */
const TEARS = [0.13, 0.08, 0.15, 0.1, 0.07, 0.12];

/**
 * A skirt's panels (the fields of the Wanderer's COAT_PANELS) cut the hero's way: the hem half again
 * as wide, the lower panel a quarter longer, flaring out further, torn into strips along the hem as his
 * coat tails are. The figure then widens toward the ground as the hero's cloak does (about his letters
 * across at the hem). A new array; `panels` is not touched.
 */
export function flared(panels, { w = 1.55, len = 1.25, flare = 0.14 } = {}) {
  return panels.map((P, i) => {
    const w2 = P.w[2] * w;
    const n = Math.max(1, Math.round(w2 / 0.11));
    const strips = Array.from({ length: n }, (_, k) => TEARS[(i * 2 + k) % TEARS.length]);
    const fork = Array.from({ length: n }, (_, k) => (i + k) & 1);
    return { ...P, w: [P.w[0], P.w[1] * (1 + (w - 1) * 0.4), w2], len: [P.len[0], P.len[1] * len], flare: (P.flare ?? 0) + flare, strips, fork };
  });
}

/**
 * A flared panel's torn strips along its hem (as Shen Hui's robe skirt and the Wanderer's coat build
 * them), for a skirt builder that has none of its own: on the lower segment `s1` (length L1, radius R1 at
 * its top), panel `P` (number `i`), in material `mat`. Returns the strip records the animator swings
 * (anim.js _coat) and the length they add below the hem (for the panel's `len`).
 */
export function tornHem({ joint, mesh }, s1, P, i, L1, R1, mat, seed = 3000) {
  const strips = [];
  const n = P.strips?.length ?? 0;
  if (!n) return { strips, extra: 0 };
  const R2 = R1 + 0.25 * L1, sk = P.skew ?? 0, wr = P.w[2] / n;
  for (let k = 0; k < n; k++) {
    const u = ((k + 0.5) / n - 0.5) * P.w[2] + sheetOffset(P.w[2], P.w[0], sk);
    const a = u / R2;
    const sj = joint(s1, Math.sin(a) * R2, -L1, (Math.cos(a) - 1) * R2);
    sj.rotation.y = a;
    mesh(sj, tatterStrip(P.strips[k], Math.max(0.05, wr), { fork: !!P.fork?.[k], curl: 0.2, seed: seed + i * 31 + k * 7 }), mat);
    strips.push({ joint: sj, len: P.strips[k], rest: a, phase: (i * 1.9 + k * 2.1) % (Math.PI * 2) });
  }
  return { strips, extra: Math.max(...P.strips) * 0.8 };
}

/** The panels the boss of level `id` wears: `panels` flared when his option asks for it (read at build). */
export function clothPanels(id, panels) {
  return heroCloth(id) === 'flare' ? flared(panels) : panels;
}
