// THE FLASH CHAIN (`?counter=chain`; ADR-246). The owner, 2026-11-26, after research into counter-kill
// chains in other sword games: "Issen chain first", then "show me current and show me ... he strikes back
// ... video comparison"; then, having seen every duelist both ways on film: "strikes back". So in the game
// the chain is the default; `?counter=0` gives the flash counter as it was (he reels at once).
//
// With the chain on, a flash counter (DEFENSE.counter: the hero's cut just becoming a cut as a duelist's
// blow arrives) no longer ends the fight's beat at once. Its link number decides:
//   links 1 .. n-1   the cut goes through him (DEFENSE.counterChain.damage / posture for that link), he is
//                    knocked back a step (`react`) and STRIKES BACK straight away: his counter move
//                    (kit.counterMove, the riposte he throws out of a guard), cued as any blow. A flash
//                    counter of that move's blow is the next link.
//   link n           the last: as the flash counter today (he reels, a cinematic moment, the crit window).
// Missing a link costs nothing extra: his strike-back is an ordinary blow, answered however the hero likes,
// and the chain starts over on the next flash counter. The timing window is the same for every link (the
// owner's pick). Only the duelists' engine plays it (duelist.js onCounter); the wyrm has no flash counter
// and Bai Wuji's barrier keeps its own.
// (the headless sims keep the old flash counter unless a scenario sets the chain: their checks are written for
// it; duel FLASHCHAIN plays the chain)

const IDS = ['0', 'chain'];
let mode = '0';

export const COUNTER_IDS = IDS;
/** '0' (the flash counter as it was: he reels at once) or 'chain' (the game's default). */
export const counterMode = () => mode;
export const counterChainOn = () => mode === 'chain';
export function setCounterMode(m) {
  if (!IDS.includes(m)) return false;
  mode = m;
  return true;
}
export const DEFAULT_COUNTER = 'chain';
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('counter') : null;
  if (typeof location !== 'undefined') mode = q && IDS.includes(q) ? q : DEFAULT_COUNTER;
}
