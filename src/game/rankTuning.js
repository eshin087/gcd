// The grade's numbers (rank.js; ADR-179). A grade measures CLEAN PLAY (the owner, 2026-11-23): deaths
// and the damage the hero took in the winning attempt decide it; time never does (it only orders two
// runs of the same grade). Blocking, parrying and dodging earn the same grade: a blow met on the guard
// costs guard, not HP, and is not "damage taken" (player.js _block; only a contact stream's chip
// through a held guard is, as a roll out of the stream would have cost nothing).
//
//   grades     best first; a run gets the first whose every limit it meets:
//     deaths   at most this many deaths in the run (Infinity: any)
//     hurt     at most this share of the hero's max HP lost in the winning attempt (Infinity: any)
//     or       an alternative set of limits that also earns the grade (A: no deaths, OR one death and
//              at most half the HP)
//   order      the grades from best to worst (a best grade is the lowest index)
//   marks      what is shown beside the grade, in this order (each its own test in rank.js):
//     UNTOUCHED  no damage at all in the run (no death, nothing lost in the winning attempt)
//     DEATHLESS  no death in the run
//     NO FLASK   no flask drunk in the run (every attempt)
//
// Starting numbers (the plan, 2026-11-23). Against the suites' winning bots (2026-11-23: 0 - 8 blows
// landed in a whole fight, most 0 - 3; a duelist's blow is 18 - 38 HP of 160) an S allows one light blow
// and no heavy one, so about half the bots' wins are an S and the rest an A: to be tuned when the owner
// has played them.

export const RANK = Object.freeze({
  grades: Object.freeze([
    Object.freeze({ id: 'S', deaths: 0, hurt: 0.15 }),
    Object.freeze({ id: 'A', deaths: 0, hurt: Infinity, or: Object.freeze({ deaths: 1, hurt: 0.5 }) }),
    Object.freeze({ id: 'B', deaths: 3, hurt: Infinity }),
    Object.freeze({ id: 'C', deaths: Infinity, hurt: Infinity }),
  ]),
  order: Object.freeze(['S', 'A', 'B', 'C']),
  marks: Object.freeze(['UNTOUCHED', 'DEATHLESS', 'NO FLASK']),
});
