import { FsArsenal } from '../arsenal.js';

// The False Saint's arsenal as move data (the ARSENAL AGENT's file; moves.js is the router: its header has
// the format, moves/melee.js the exports). The handler is ../arsenal.js (FsArsenal: its header has the hooks
// with their arguments). Numbers: ../tuningArsenal.js (TUNING.arsenal).
//   Vigil (the eye's cutting laser), Absolution (the palm cannon), Triptych (the forearm gun's bolts),
//   Choir (the missile swarm), Kyrie (the creeping barrage), Verdict (the sky lance), Revelation (the
//   full burst), Passing Bell's laser (its flight is the boost agent's).
//
// THE BEAT FIELDS this file's handler owns (FIELDS; saint.js routes every beat carrying one to it):
//   fsLaser    the eye laser (a sight line, then the cut)
//   fsCannon   the palm cannon / the core cannon (a held beam: `sustain`)
//   fsBolt     the forearm gun's bolts
//   fsMissile  the micro-missiles
//   fsMortar   the back's mortar barrage (rows of marked shells)
//   fsLance    the reticle and the pillar of light
// Every shot that lands away from him carries its own cue (a `cast` with `selfCue`, as Bai Wuji's thrown
// pieces: the flash on the mark, the ledger told as it leaves). Empty today (wave 0).
export const FIELDS = Object.freeze(['fsLaser', 'fsCannon', 'fsBolt', 'fsMissile', 'fsMortar', 'fsLance']);
export const create = (d) => new FsArsenal(d);

export function moves() {
  return {};
}
export const LINKS = {};
