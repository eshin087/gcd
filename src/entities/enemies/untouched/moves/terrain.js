import { WjTerrain } from '../terrain.js';

// Bai Wuji's terrain moves as move data (the TERRAIN AGENT's file; moves.js is the router: its header has the
// format; moves/melee.js the exports). Empty today. The handler: ../terrain.js (WjTerrain); the beat
// fields it owns go in FIELDS (each `wj`-prefixed, e.g. 'wjThrow', 'wjFloat').
export const FIELDS = Object.freeze([]);
export const create = (d) => new WjTerrain(d);
export function moves(X) {
  void X;
  return {};
}
export const LINKS = {};
