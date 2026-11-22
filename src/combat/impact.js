// IMPACT: the weight of a landed cut beyond the freeze, the shake and the cut's line (cutFx.js).
// Four pieces, each behind its own switch, so the owner can judge every one alone (the Lab's
// 'impact' row; ?impact=off | all | a comma list of stamp, ripple, react, thump):
//
//   stamp    the hit as a short ASCII animation printed in the letter grid at the drawn contact
//            (combat/impactStamp.js; the fire field's `steel` letters)
//   ripple   the struck body's own letters take the blow: shoved along the blade's travel, re-rolled,
//            a ring running out through the body (render/impactRipple.js + the ASCII pass)
//   react    the body answers by where it was hit (the wyrm: dragon/; the duelists: enemies/duelist/)
//   thump    the low end of a heavy hit and a short dip of the music (audio/)
//
// `IMPACT.on.<piece>` is read at the moment of the hit; `IMPACT.k.<piece>` scales that piece's
// strength (1 = as tuned; the option sheets film 0.5 / 1 / 1.5). Each piece keeps its own numbers in
// its own file; this file holds only the switches.
//
// The hit itself (PlayerFx.contact hands the stamp and the ripple this record; the reactions read
// takeHit's own `o`, below, and the thump reads the player:hitDragon payload):
//   x, y, z   the DRAWN contact (player._contactPoint), world
//   o.tier    the attack's `contact` (combat.js): light | sweep | point | slam | cleave | execute
//   o.cut     {x, y, z} the blade's travel at the contact, world, unit (NaN: unknown)
//   o.edge    {x, y, z} the blade's direction, hilt → point, world, unit (NaN: unknown)
//   o.hilt    Vector3 | null
//   o.crit    a crit or a broken foe
//   o.power   0..1 the cleave's charge
//   o.low     the LOW quality preset
//   o.target  the struck boss (game.dragon) or null
// The bosses get theirs through takeHit(o): o.point (the drawn contact), o.cut {x, z} (the blade's
// travel on the ground), o.part, o.heavy, o.crit, o.swing.

const PIECES = ['stamp', 'ripple', 'react', 'thump'];

const fromUrl = () => {
  const on = { stamp: true, ripple: true, react: true, thump: true };
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('impact') : null;
    if (q == null || q === '' || q === 'all') return on;
    const want = new Set(q.split(',').map((s) => s.trim()));
    for (const p of PIECES) on[p] = want.has(p); // 'off' (or any unknown word) leaves every piece off
  } catch {
    /* no location (the headless sims): everything on */
  }
  return on;
};

export const IMPACT = {
  pieces: PIECES,
  on: fromUrl(),
  k: { stamp: 1, ripple: 1, react: 1, thump: 1 },
  // the owner's picks per kind of struck body (2026-11-22), on top of `k`: the stamp prints on the
  // human bosses only (on the wyrm the cut's own flare and its bright digits hide it), and a human
  // boss's reaction is drawn at x1.5 (at x1 it moves him 3 - 9 px at the game camera)
  by: { stamp: { duelist: 1, wyrm: 0 }, react: { duelist: 1.5, wyrm: 1 } },
};

/** Is a piece on (and its strength above zero)? */
export const impactOn = (piece) => IMPACT.on[piece] === true && IMPACT.k[piece] > 0;
/** A piece's strength (0 when it is off). */
/** `who`: 'duelist' | 'wyrm' (the struck body's kind: IMPACT.by scales the piece for it); omit for none. */
export const impactK = (piece, who) => {
  if (IMPACT.on[piece] !== true) return 0;
  const k = Math.max(0, Number(IMPACT.k[piece]) || 0);
  const by = who ? IMPACT.by[piece]?.[who] : 1;
  return k * (Number.isFinite(by) ? Math.max(0, by) : 1);
};
