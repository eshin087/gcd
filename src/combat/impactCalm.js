// CALM AT THE CONTACT: the impact pass's follow-up (ADR-149's open item). Today's own light at the
// moment a cut lands (the steel lit white through the freeze, its white strokes on the edge, the
// cut's core '*' and pooled light, the sparks, the charged cleave's fan of streaks, and the swing
// arc's white-hot "bite" sweeping back through the contact as the blade swings on) covers the frames
// the stamp and the ripple print in. Each level below dims THOSE, together, at the moment of the hit:
//
//   0  today (byte for byte: the same draws, the same values, the same random streams)
//   1  a little calmer
//   2  clearly calmer
//   3  the contact carried almost only by the lines, the stamp and the ripple
//
// Read at the moment of the hit (PlayerFx.contact snapshots the level), presentation only: no
// timing, damage, hit-stop, camera or hit test moves. Steel on steel (clashFx.js) is not touched,
// and a swing that misses never reads this (the arc is only dimmed near a contact, in the frames
// after it, and only for the swing that landed).
//
// The game draws CALM_DEFAULT (the owner's pick, 2026-11-22: level 1); ?calm=0|1|2|3 in the URL
// overrides it (?calm=0: today as it was); setCalm(n) (the Lab / the films); setCalm(obj) takes a custom level
// (a CALM_LOOK.levels entry's shape: the measuring rig switches one effect off at a time with it).

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/**
 * The levels. Every number multiplies today's (1 = today). Read by:
 *   blade   player.js (the steel's gain): the LIT part of the gain (the strike's light + the hit's
 *           flare) × this while the hit's flare is held (through the freeze), back to today's as
 *           the flare cools (TUNE.bladeFlare.fall); `flare` × the hit's own flare value on top
 *   edge    fx.edgeFlash (the white strokes laid on the steel at the contact): [alpha, size]
 *   core    cutFx (the two-frame '*'): [alpha, size]
 *   light   cutFx (the pooled light): [intensity, radius]
 *   slash   cutFx (the slash line and the tick): [alpha, colour] (colour: its HDR heat; the lines
 *           stay, they are the house rule's "lines")
 *   sparks  cutFx (the streaks, the motes, the thrust's puff): [alpha, size]
 *   ring    cutFx (the heavy blows' thin ring): colour ×
 *   cleave  fx.cleaveImpact (the charged cleave's fan of long streaks): [alpha, size]
 *   arc     fx.trail, the swing arc where it crosses the contact in the hit's first frames:
 *           a [alpha, size] inside r[0] m of the contact (in the screen's plane), today's past r[1]
 *           (× rHeavy for the slam, the cleave, the execution); for `win` real s after the freeze
 *           ends (the arc's strokes then live on their own life: 0.2 - 0.46 s); `bite` false draws
 *           the bite's strokes in the arc's own colour, not white-hot, inside the zone
 *   boss    the struck boss's own white hurt flash (dragon.js / duelist.js takeHit: `flash`, held
 *           through the freeze): x this, through calmBossFlash() (needs one line in each of those
 *           files: the lead's; until then nothing reads it in the game, only the films)
 */
export const CALM_LOOK = deepFreeze({
  levels: [
    null, // 0: today
    {
      blade: 0.7, flare: 0.6,
      edge: [0.55, 0.85],
      core: [0.6, 0.8],
      light: [0.5, 0.8],
      slash: [0.9, 0.85],
      sparks: [0.65, 0.9],
      ring: 0.8,
      cleave: [0.6, 0.85],
      arc: { a: 0.5, size: 0.85, r: [0.6, 1.6], rHeavy: 1.3, win: 0.12, bite: true },
      boss: 0.75,
    },
    {
      blade: 0.45, flare: 0.3,
      edge: [0.3, 0.7],
      core: [0.35, 0.65],
      light: [0.25, 0.65],
      slash: [0.8, 0.7],
      sparks: [0.35, 0.75],
      ring: 0.6,
      cleave: [0.35, 0.7],
      arc: { a: 0.25, size: 0.7, r: [0.9, 2.0], rHeavy: 1.3, win: 0.14, bite: false },
      boss: 0.5,
    },
    {
      blade: 0.22, flare: 0,
      edge: [0.1, 0.6],
      core: [0.15, 0.5],
      light: [0, 0.5],
      slash: [0.7, 0.55],
      sparks: [0.15, 0.6],
      ring: 0.4,
      cleave: [0.15, 0.6],
      arc: { a: 0.1, size: 0.6, r: [1.1, 2.4], rHeavy: 1.3, win: 0.16, bite: false },
      boss: 0.3,
    },
  ],
});

/** The level the game draws when nothing asks for another (the owner's pick, 2026-11-22). */
export const CALM_DEFAULT = 1;

const fromUrl = () => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('calm') : null;
    const n = q == null || q === '' ? CALM_DEFAULT : Math.round(Number(q));
    return Number.isFinite(n) && n >= 0 && n < CALM_LOOK.levels.length ? n : CALM_DEFAULT;
  } catch {
    return CALM_DEFAULT;
  }
};

let level = fromUrl();
let custom = null;

/** Set the level: 0 (as before the calm) … 3, or a custom level object (the rig; the CALM_LOOK.levels
 *  shape). Junk falls back to CALM_DEFAULT. */
export const setCalm = (n) => {
  if (n && typeof n === 'object') {
    custom = n;
    level = -1;
    return level;
  }
  custom = null;
  const v = Math.round(Number(n));
  level = Number.isFinite(v) && v >= 0 && v < CALM_LOOK.levels.length ? v : CALM_DEFAULT;
  return level;
};
/** The level number (−1: a custom one). */
export const calmLevel = () => level;
/** The current level's numbers, or null for today (every reader then draws exactly today's). */
export const calmLook = () => (level < 0 ? custom : CALM_LOOK.levels[level] ?? null);

const pair = (v, i) => (Array.isArray(v) && Number.isFinite(v[i]) ? Math.max(0, v[i]) : 1);
/** [alpha / intensity, size / radius] multipliers of a level's entry (1 when it has none). */
export const calmA = (L, key) => (L ? pair(L[key], 0) : 1);
export const calmS = (L, key) => (L ? pair(L[key], 1) : 1);

/** The struck boss's hurt flash value at the hit x the level's `boss` (today: v unchanged). */
export const calmBossFlash = (v) => {
  const L = calmLook();
  return L && Number.isFinite(L.boss) ? v * Math.max(0, L.boss) : v;
};
