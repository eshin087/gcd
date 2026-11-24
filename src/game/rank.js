import { RANK } from './rankTuning.js';

// The grade of a won fight or a finished rush (ADR-179): a pure function of the clean-play inputs,
// its thresholds in rankTuning.js. Not the screen's colour grade (grade.js, ScreenGrade).
//
//   rankRun({ deaths, damageTaken, maxHp, flasksUsed }) → { grade: 'S'|'A'|'B'|'C', marks: [..], hurt }
//     deaths       deaths in the run (a boss: every attempt before the win; a rush: all eight fights)
//     damageTaken  HP lost in the winning attempt (a rush: the eight winning attempts summed)
//     maxHp        the hero's max HP (a rush: the eight fights' max HP summed, so `hurt` is the share of
//                  all the health the rush gave him: the same rule reads a boss and a rush)
//     flasksUsed   flasks drunk in the run (every attempt)
//   compareRank(a, b) → < 0 when a ranks above b: the better grade first; within a grade the faster
//     timeMs (time never changes a grade, it only orders runs of the same grade)
//   gradeIndex(g) → 0 for S ... 3 for C (Infinity for anything else)

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const meets = (lim, deaths, hurt) => !!lim && deaths <= lim.deaths && hurt <= lim.hurt + 1e-9;

export function rankRun(run = {}) {
  const deaths = Math.max(0, Math.floor(fin(run.deaths)));
  const dmg = Math.max(0, fin(run.damageTaken));
  const max = Math.max(1, fin(run.maxHp, 1));
  const hurt = dmg / max;
  let grade = RANK.grades[RANK.grades.length - 1].id;
  for (const G of RANK.grades) {
    if (meets(G, deaths, hurt) || meets(G.or, deaths, hurt)) {
      grade = G.id;
      break;
    }
  }
  const marks = [];
  if (deaths === 0 && dmg <= 0) marks.push('UNTOUCHED');
  if (deaths === 0) marks.push('DEATHLESS');
  if (Math.max(0, fin(run.flasksUsed)) === 0) marks.push('NO FLASK');
  return { grade, marks, hurt };
}

export function gradeIndex(g) {
  const i = RANK.order.indexOf(g);
  return i < 0 ? Infinity : i;
}

/** Order two runs ({ grade, timeMs }): the better grade first, then the faster time. */
export function compareRank(a, b) {
  const ga = gradeIndex(a?.grade), gb = gradeIndex(b?.grade);
  if (ga !== gb) return ga < gb ? -1 : 1;
  return fin(a?.timeMs, Infinity) - fin(b?.timeMs, Infinity) || 0;
}
