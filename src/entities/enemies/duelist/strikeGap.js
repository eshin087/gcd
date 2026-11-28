// THE STRIKE GAP (`?strikeGap=`, the Lab's `strikeGap`; ADR-264): the nearest a beat's DASH brings a duelist (never a
// dash through him; not the windup's step-in nor authored travel, which his footwork and lunges are keyed to) brings him to the hero for a BLADE blow, so the two swords meet
// in the open between the bodies and a parry's clash reads at the game camera instead of inside two stacked bodies.
// Capped at `reachK` x the blow's reach (zone r + fwd): every blow still reaches where it did. Bare-handed blows (the
// kit marks the striking limb in `_part`) are left as authored. 'a' 1.5 m, 'b' 1.8 m (the default), '0' as before.
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
export const STRIKE_GAP = Object.freeze({ opts: Object.freeze(['0', 'a', 'b']), floor: Object.freeze({ a: 1.5, b: 1.8 }), reachK: 0.85 });
export const STRIKE_GAP_DEFAULT = '0'; // (the owner picked b, but any floor bends Shen Hui's authored lunges (duel ashform, ADR-250): off until that trade is decided)
const S = { mode: STRIKE_GAP.opts.includes(q('strikeGap')) ? q('strikeGap') : STRIKE_GAP_DEFAULT };
export const strikeGapMode = () => S.mode;
export const setStrikeGap = (m) => (S.mode = STRIKE_GAP.opts.includes(m) ? m : STRIKE_GAP_DEFAULT);
/** The floor (m, centre to centre) for duelist `d`'s blow of zone `z`; 0 when off or not a blade blow. */
export function strikeGapFloor(d, z) {
  const F = STRIKE_GAP.floor[S.mode];
  if (!F || !z) return 0;
  if (typeof d?._part === 'string' && d._part !== 'sword') return 0; // (a fist, a foot: as authored)
  const reach = (Number(z.r) || 0) + Math.max(0, Number(z.fwd) || 0);
  return Math.max(0, Math.min(F, reach * STRIKE_GAP.reachK));
}
