import { shotMoves } from './kiShots.js';
import { beamMoves } from './kiBeam.js';

// Tian Lei's ki moves: the two halves joined (moves/kiShots.js: the thrown and the called;
// moves/kiBeam.js: the beams). Neither agent edits this file.
export function kiMoves(X) {
  return { ...shotMoves(X), ...beamMoves(X) };
}
