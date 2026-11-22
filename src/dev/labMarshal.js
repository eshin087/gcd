import { el, button } from './labDom.js';

// The Lab's MARSHAL section (the Brazen Foundry only; ADR-135): a button per plate of the Clockwork
// Marshal's suit (tear it off now), the hand-over (`eject`), and the plates' state. The phase buttons of
// the FIGHT section use his debug.setForm (the suit's phases with their plates gone, the pilot).
// Kept in its own file so lab.js gains one call (sibling boss builds edit lab.js too).

/** Build the section into `section(root, key, title)`'s body when the boss is the Marshal; returns a sync(). */
export function buildMarshalSection(lab, root) {
  const d = lab.game.dragon;
  if (d?.kit?.id !== 'marshal' || typeof d.debug?.shedPlate !== 'function') return null;
  const { body } = lab._section(root, 'marshal', 'MARSHAL');
  const grid = el('div', 'lab-grid c2', null, body);
  for (const name of ['breast', 'back', 'left', 'right', 'helm']) {
    button(grid, `shed ${name}`, () => {
      const ok = lab.game.dragon?.debug?.shedPlate?.(name);
      lab._status(ok ? `plate off: ${name}` : `${name}: already off, or not the suit`, ok ? 'ok' : '');
    }).title = `tear the ${name} plate off the suit now (TUNING.plates.${name}.lost: what it changes)`;
  }
  button(grid, 'eject', () => {
    const ok = lab.game.dragon?.debug?.eject?.();
    lab._status(ok ? 'the marshal climbs out' : 'already the pilot', ok ? 'ok' : '');
  }).title = 'the hand-over now: the husk kneels, the pilot climbs out (phase 4)';
  const info = el('div', 'lab-note', '', body);
  return () => {
    const P = lab.game.dragon?.debug?.plates;
    if (!P) return;
    const txt = Object.entries(P).map(([k, v]) => `${k} ${v.on ? (Number.isFinite(v.hp) ? v.hp : '∞') : 'off'}`).join(' · ');
    if (info.textContent !== txt) info.textContent = txt;
  };
}
