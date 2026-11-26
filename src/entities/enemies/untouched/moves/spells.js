import { WjSpells } from '../spells.js';

// Bai Wuji's spells as move data (the SPELLS AGENT's file; moves.js is the router: its header has the
// format; moves/melee.js the exports). Empty today. The handler: ../spells.js (WjSpells); the beat
// fields it owns go in FIELDS (each `wj`-prefixed, e.g. 'wjDraw', 'wjCast', 'wjNull', 'wjSpark').
export const FIELDS = Object.freeze([]);
export const create = (d) => new WjSpells(d);
export function moves(X) {
  void X;
  return {};
}
export const LINKS = {};
