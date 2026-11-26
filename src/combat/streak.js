// THE STREAK PASS: what a run of perfect defences looks, sounds and plays like (the rules of the
// streak itself: DEFENSE.flurry in rules.js, docs/COMBAT.md "The streak and the flurry"). Pieces,
// each behind its own switch so the owner can judge every one alone (?streakfx=off | all | a comma
// list; the Lab's 'streak' row):
//
//   storm    the flurry accelerates: its first cuts are shown, each later one comes faster, the last
//            land almost at once; the whole flurry stays short however long the streak (player/flurry.js).
//            Its tempo (STREAK_FX.tempo; ?tempo=0 off): the first cut a heavy beat, each later one a
//            share of the one before (DEFENSE.flurry.tempo); off = the storm of ADR-167 exactly.
//            Its chain (STREAK_FX.chain; ?chain=0 off): the passes run A -> B -> C, each from where
//            the one before ended, every slash on the path he ran (DEFENSE.flurry.chain); the shape
//            they draw is one of its figures (STREAK_FX.figure; ?figure=)
//   tiers    past the flurry's 7 blows a longer streak LOOKS grander at each tier: the flurry's cuts
//            and its last blow, the banner's name (player/flurryFx.js, ui/)
//   aura     the streak shows on the hero and his blade between flurries (player/streakFx.js)
//   counter  a number near the hero ticks up on every perfect defence and fades (ui/)
//   sound    every perfect defence in a streak rings a step higher; a quiet layer at high tiers (audio/)
//   world    at high tiers the arena answers a perfect defence: dust, embers, the grass (player/streakFx.js)
//
// A single perfect parry / perfect dodge has three looks (?perfect=today | sharp | cinema; the owner
// picked `sharp`, the default; `?perfect=today` draws it as before): combat/perfectFx.js.
//
// The tier of a streak (read anywhere, never stored): 0 below TIERS[0], then 1, 2, ... The flurry's
// own length stops at DEFENSE.flurry.max (7) and its damage with it: tiers change looks only.

const PIECES = ['storm', 'tiers', 'aura', 'counter', 'sound', 'world'];
// (the flurry's figures: player/flurryFigures.js FIGURE_NAMES, 'any' first)
const FIGURES = ['any', 'star', 'zigzag', 'cage', 'spiral', 'cross'];
const PERFECT = ['today', 'sharp', 'cinema'];
/** The look a single perfect parry / dodge gets when nothing asks for another (the owner's pick, 2026-11-23). */
export const PERFECT_DEFAULT = 'sharp';

/** Streak counts at which a tier begins (tier 1 at TIERS[0], ...). Tier 3 is the full flurry. */
export const STREAK_TIERS = Object.freeze([3, 5, 7, 10, 15]);

/** 0 … STREAK_TIERS.length for a streak count. */
export const streakTier = (n) => {
  let t = 0;
  if (!(n > 0)) return 0;
  for (let i = 0; i < STREAK_TIERS.length; i++) if (n >= STREAK_TIERS[i]) t = i + 1;
  return t;
};
/** 0..1 through the tiers (0 below the first, 1 at the last). */
export const streakHeat = (n) => streakTier(n) / STREAK_TIERS.length;

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};

const fromUrl = () => {
  const on = {};
  for (const p of PIECES) on[p] = true;
  const v = q('streakfx');
  if (v == null || v === '' || v === 'all') return on;
  const want = new Set(v.split(',').map((s) => s.trim()));
  for (const p of PIECES) on[p] = want.has(p); // 'off' (or any unknown word) leaves every piece off
  return on;
};

export const STREAK_FX = {
  pieces: PIECES,
  on: fromUrl(),
  /** A piece's strength (1 = as tuned; the option sheets film 0.5 / 1 / 1.5). */
  k: { storm: 1, tiers: 1, aura: 1, counter: 1, sound: 1, world: 1 },
  perfectModes: PERFECT,
  /** The look of a single perfect parry / dodge. */
  perfect: PERFECT.includes(q('perfect')) ? q('perfect') : PERFECT_DEFAULT,
  /** The storm's tempo (DEFENSE.flurry.tempo): heavy first, then faster by ratio. false (?tempo=0) =
   *  the storm's pace of ADR-167 exactly. Only with the storm piece on; read as a flurry starts. */
  tempo: q('tempo') !== '0',
  /** The flurry's path chains (DEFENSE.flurry.chain): every pass starts where the one before ended,
   *  every slash drawn lies on the path he ran, the last blow's 'A' shards are white-steel letter
   *  dust. false (?chain=0) = the ring-teleport paths, the crescents and the shards exactly as before.
   *  Read as a flurry starts. */
  chain: q('chain') !== '0',
  /** The dodge looks (?dodgefx=a|b|c|d; '' = off, the flurry as above exactly; the Lab's `dodgefx`): the
   *  flurry on a man on the ground (not a riposte) gains smeared copies along each dash, floor kicks and
   *  aerial cuts (DEFENSE.flurry.dodgefx), and one of: a Thunder Thrust art (a), a bloom and tendrils at
   *  each contact (b), a cloud of falling sparks (c), a heavier art (d). Read as a flurry starts. */
  dodgefx: ['a', 'b', 'c', 'd'].includes(q('dodgefx')) ? q('dodgefx') : '',
  /** The chain's figure (DEFENSE.flurry.chain.figures; player/flurryFigures.js): 'any' (a different
   *  one each flurry) or a figure's name to pin it (?figure=star | zigzag | cage | spiral | cross; the
   *  Lab's `figure` button). Read as a flurry starts. */
  figure: FIGURES.includes(q('figure')) ? q('figure') : 'any',
  figures: FIGURES,
};

/** A piece's strength (0 when it is off). */
export const streakK = (piece) => (STREAK_FX.on[piece] === true ? Math.max(0, Number(STREAK_FX.k[piece]) || 0) : 0);
export const setPerfectMode = (m) => (STREAK_FX.perfect = PERFECT.includes(m) ? m : PERFECT_DEFAULT);
export const perfectMode = () => STREAK_FX.perfect;
