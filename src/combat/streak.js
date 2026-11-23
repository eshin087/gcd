// THE STREAK PASS: what a run of perfect defences looks, sounds and plays like (the rules of the
// streak itself: DEFENSE.flurry in rules.js, docs/COMBAT.md "The streak and the flurry"). Pieces,
// each behind its own switch so the owner can judge every one alone (?streakfx=off | all | a comma
// list; the Lab's 'streak' row):
//
//   storm    the flurry accelerates: its first cuts are shown, each later one comes faster, the last
//            land almost at once; the whole flurry stays short however long the streak (player/flurry.js)
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
};

/** A piece's strength (0 when it is off). */
export const streakK = (piece) => (STREAK_FX.on[piece] === true ? Math.max(0, Number(STREAK_FX.k[piece]) || 0) : 0);
export const setPerfectMode = (m) => (STREAK_FX.perfect = PERFECT.includes(m) ? m : PERFECT_DEFAULT);
export const perfectMode = () => STREAK_FX.perfect;
