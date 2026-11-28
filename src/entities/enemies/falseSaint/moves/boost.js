import { TUNING_BOOST } from '../tuningBoost.js';

// The False Saint's boosters (the BOOST AGENT's file; moves.js is the router: its header has the format,
// moves/melee.js the exports). The booster punch (Votive Fist), the plated arm's rapid flurry (Rosary),
// the jet strings (Censer Wheel, Thurible), the dive knee (Descent), the strafing pass (Passing Bell's
// flight; its laser is the arsenal's), the overclock passes (Vespers), the last grab (Last Rite), and his
// jet step (Censer Step: the footwork hook below, TUNING.fsJet). Numbers: ../tuningBoost.js (TUNING.boost).
//
// THE BEAT FIELDS this file's handler owns (FIELDS; saint.js routes every beat carrying one to it):
//   fsJet    a beat whose booster lights (the jet in the fire field is its tell: fx.jet / jetBurst)
//   fsDash   a beat that crosses the floor behind its fist (the booster punch's blink-dash)
//   fsDive   a beat that lifts him on the back thrusters and dives (Descent)
//   fsBlitz  an overclock pass (Vespers) / a strafing pass
// The engine's own beat fields (dash, lift, leap, close, flit ...) work as on every duelist.
//
// THE FOOTWORK HOOK (saint.js FsBrain._foot asks every handler first): `footwork(dt, s)` → true when it
// moved him this frame (the jet step: Tian Lei's dash, ascendant.js AscBrain, is the precedent). Never
// asked while a phase change waits, a counter is pending, the hero drinks, or his AI is off.
// Empty today (wave 0): no moves, the hook returns false (TUNING.fsJet.on is false).
export const FIELDS = Object.freeze(['fsJet', 'fsDash', 'fsDive', 'fsBlitz']);

export function moves() {
  return {};
}
export const LINKS = {};

/** FsBoost: the boosters' behaviour (the routing contract, saint.js header; every hook optional). */
export class FsBoost {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T?.boost ?? TUNING_BOOST;
    this.reset();
  }
  reset() {
    this.stats = { jets: 0 };
  }
  stop() {}
  frame() {}
  /** The jet step (TUNING.fsJet): true when it moved him this frame. Off until the boost agent builds it. */
  footwork() {
    return false;
  }
}
export const create = (d) => new FsBoost(d);
