import { FsTerrain } from '../terrain.js';

// The False Saint's terrain moves as move data (the TERRAIN AGENT's file; moves.js is the router: its
// header has the format, moves/melee.js the exports). The foundry as his weapon: a ladle's chain shot so
// molten steel pours where the hero stands (Crucible), a girder or an unfinished frame torn off the line
// and thrown (Relic). The handler is ../terrain.js (FsTerrain), which also deals the molten pools' damage
// (to the hero, cued; to him, d.onMolten). Numbers: ../tuningTerrain.js (TUNING.terrain).
//
// THE BEAT FIELDS this file's handler owns (FIELDS; saint.js routes every beat carrying one to it):
//   fsLadle   Crucible: the ladle chosen, its chain shot, the pour (red mark where it lands)
//   fsRelic   Relic: a piece torn off the line or a girder, carried, thrown (blue)
// A move whose piece is gone is refused (FsTerrain.onActStart → false) and weighed 0 (FsTerrain.weigh).
// Empty today (wave 0).
export const FIELDS = Object.freeze(['fsLadle', 'fsRelic']);
export const create = (d) => new FsTerrain(d);

export function moves() {
  return {};
}
export const LINKS = {};
