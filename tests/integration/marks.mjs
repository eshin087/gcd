// The floor's marks in a fight sim (scars.mark, ADR-107: every boss attack that meets the ground marks
// it, the marks stay until the reset): a REAL Scars on the suite's mock world, wired as src/world/world.js
// wires world.groundBlow and world.impact's floor mark. Built on a Math.random stream of its own (three.js
// draws a uuid from Math.random for its particle batch: the seeded fight must not move). It changes
// nothing in the fight: the marks draw from their own stream and damage nothing.
//   const M = attachMarks(game);  ...the fight...  marksLine(M) / M.kinds / M.made
// (the repo root is the suite's: process.argv[2])
import { pathToFileURL } from 'node:url';

const imp = (p) => import(pathToFileURL(`${process.argv[2]}/${p}`).href);
const { Scars } = await imp('src/world/scars.js');
const { mulberry32 } = await imp('src/core/rng.js');

export function attachMarks(game) {
  const w = game?.world;
  if (!w) return null;
  let sc = w.scars;
  if (!sc?.mark) {
    const R0 = Math.random;
    Math.random = mulberry32(0x6a7c19);
    try {
      sc = new Scars(game, w.forest?.scarInk);
    } finally {
      Math.random = R0;
    }
    w.scars = sc;
  }
  const impact = w.impact;
  w.impact = (x, z, r, power, o) => {
    const n = impact ? impact(x, z, r, power, o) : 0;
    if (Number.isFinite(x + z + r + power) && power > 0) sc.impactMark(x, z, r, power, o);
    return n;
  };
  w.groundBlow = (x, z, o) => {
    if (Number.isFinite(x + z) && o && o.power > 0) sc.mark(x, z, o);
  };
  return sc;
}

/** One line: the marks a fight left, by kind, and the glyphs they hold. */
export function marksLine(sc) {
  if (!sc) return 'no marks (no world)';
  const by = Object.entries(sc.made).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ');
  return `${sc.kinds} floor marks (${by || 'none'}), ${sc.count} glyphs (cap ${sc.cap})`;
}

// marks a whole bot fight leaves, per suite (scenario WIN): enough to read "a fight happened here",
// not so many that the floor is noise (measured 2026-11-23; the cap holds the glyphs either way)
const RANGE = { duel: [5, 60], lord: [10, 90], asc: [5, 60], fox: [3, 400], city: [12, 150], integ: [50, 400], sheath: [4, 40], woke: [5, 60] };

/** Print the fight's marks and check them: a count in its suite's range, the glyphs under the cap. */
export function marksCheck(sc, tag, out, assert) {
  if (!sc) return;
  out(`     the floor: ${marksLine(sc)}`);
  const [lo, hi] = RANGE[tag] ?? [1, 1e9];
  assert(sc.kinds >= lo && sc.kinds <= hi, `${tag}: a whole fight leaves ${sc.kinds} floor marks (${lo} - ${hi})`);
  assert(sc.count <= Math.ceil(sc.cap * 1.15) + 1, `${tag}: the marks' glyphs stay under the cap (${sc.count} <= ${sc.cap} + the share fading out)`);
}
