import { blockLines } from './blockText.js';
import { el } from './dom.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { formatTime } from '../game/records.js';

// How a grade and a best are shown (ADR-179): taste calls, so each has options behind a URL switch,
// like the other look switches; the owner has NOT picked yet (2026-11-23). docs/looks/records/ (grade-options.jpg, title-options.jpg).
//
//   ?gradeLook=  the record screen's grade
//     a  the grade in block letters over the panel, the time, the marks and the bests under it (shipped)
//     b  the grade beside its lines: block letters on the left, time / marks / bests on the right
//     c  the grade in the banners' plain '#' letters, the time beside it on one line
//   ?recLook=    the title's best under each level
//     a  a small line under each stage button: the grade and the best time (shipped)
//     b  the grade inside the button after the name; the time on a small second line in the button
//     c  one line under the picker for the stage the mouse / pad is on (the current one otherwise)

export const GRADE_LOOK_DEFAULT = 'a';
export const REC_LOOK_DEFAULT = 'a';
const OPTS = ['a', 'b', 'c'];

export const gradeLookNow = () => {
  const v = lookOf('gradeLook', GRADE_LOOK_DEFAULT);
  return OPTS.includes(v) ? v : GRADE_LOOK_DEFAULT;
};
export const recLookNow = () => {
  const v = lookOf('recLook', REC_LOOK_DEFAULT);
  return OPTS.includes(v) ? v : REC_LOOK_DEFAULT;
};

const gradeClass = (g) => `gr-${String(g ?? '').toLowerCase()}`;

/** The record screen's head into `node` (emptied first); head null: nothing. */
export function gradeHead(node, head, look = GRADE_LOOK_DEFAULT) {
  if (!node) return;
  node.textContent = '';
  node.className = `ab-rec-head g-${look}`;
  if (!head?.grade) return;
  const big = el('pre', `ab-grade-big ${gradeClass(head.grade)}`, blockLines(head.grade, look === 'c').join('\n'), null);
  const side = el('div', 'ab-rec-side', null, null);
  const time = el('div', 'ab-rec-time', head.time ?? '', side);
  if (head.newBestTime || head.newBestGrade || head.first) el('span', 'ab-rec-new', head.first ? 'FIRST CLEAR' : 'NEW BEST', time);
  el('div', 'ab-rec-marks', head.marks?.length ? head.marks.join('  ·  ') : '', side);
  if (head.prev) el('div', 'ab-rec-prev', `best before  ${head.prev}`, side);
  if (head.note) el('div', 'ab-rec-note', head.note, side);
  if (look === 'c') {
    const row = el('div', 'ab-rec-row', null, node);
    row.appendChild(big);
    row.appendChild(side);
  } else if (look === 'b') {
    const row = el('div', 'ab-rec-row', null, node);
    row.appendChild(big);
    row.appendChild(side);
  } else {
    node.appendChild(big);
    node.appendChild(side);
  }
}

/** A best's short text: 'S  1:23.45' (null: none). */
export function bestText(best) {
  return best ? `${best.grade}  ${formatTime(best.timeMs)}` : null;
}

/** Dress a stage button with its best (recLook a / b); look c draws the shared line instead. */
export function dressStageButton(b, name, best, look = REC_LOOK_DEFAULT) {
  if (!b) return;
  b.textContent = '';
  b.classList.toggle('has-best', !!best);
  if (look === 'b') {
    const top = el('span', 'ab-stage-name', name, b);
    if (best) {
      el('span', `ab-stage-grade ${gradeClass(best.grade)}`, best.grade, top);
      el('span', 'ab-stage-time', formatTime(best.timeMs), b);
    }
    return;
  }
  el('span', 'ab-stage-name', name, b);
  if (look === 'a') {
    const line = el('span', 'ab-stage-best', null, b);
    if (best) {
      el('span', `g ${gradeClass(best.grade)}`, best.grade, line);
      el('span', 't', formatTime(best.timeMs), line);
    } else line.textContent = ' ';
  }
}

/** recLook c's shared line: the stage's name and its best, or that it is unbeaten. */
export function sharedLine(node, name, best) {
  if (!node) return;
  node.textContent = '';
  el('span', 'n', name, node);
  if (!best) {
    el('span', 'u', '  not yet beaten', node);
    return;
  }
  el('span', 'k', '  BEST  ', node);
  el('span', `g ${gradeClass(best.grade)}`, best.grade, node);
  if (best.marks?.length) el('span', 'm', `  ${best.marks.join(' · ')}`, node);
  el('span', 't', `  ${formatTime(best.timeMs)}`, node);
  if (best.clears) el('span', 'c', `  ·  ${best.clears} clear${best.clears === 1 ? '' : 's'}`, node);
}
