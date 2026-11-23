// THE BURST AS LINES (the streak pass, round 2): the flurry's last blow, when the hanging cuts open.
// Today (level 0) it blooms into a white blot over both fighters for about a tenth of a second (the
// burst's and the art's pooled lights, the fat flare strokes, the stars, the art's expanding halo,
// the hero's spark star, the screen's flash; measured one effect at a time: docs in the report /
// DEVLOG). Each level turns those down together and hands the picture to the LINES: every hanging
// cut flares thin and long for a few frames (the star snaps out to its full length across the
// target), then the tiers' steel frames (the echoes split, the rings open where the cuts cross:
// flurryFx.js TIER_LOOK). The same level calms the centre of the flash cuts (their star and their
// light: on the wyrm the storm's centre stacks into a bloom).
//
//   0  today (byte for byte: the same draws, the same values, the same random streams)
//   1  a little calmer: the lights and the blooms halved, the thin long lines on top
//   2  lines first: the target and the hero stay visible through the burst
//   3  only lines: no pooled light, no star, no halo; a blink of darkness round the star
//
// Presentation only: no timing, damage, hit-stop, camera or hit test moves. Read at the moment of
// the blow (flurry.js / flurryFx.js snapshot it). ?burst=0|1|2|3 in the URL; setBurst(n) (the Lab /
// the films); setBurst(obj) a custom level (a BURST_LOOK.levels entry's shape: the measuring rig
// switches one effect off at a time with it). Default BURST_DEFAULT (0) until the owner picks.

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/**
 * The levels. Every number multiplies today's (1 = today).
 *   light    the pooled lights of the burst and of the art's blow: [intensity, radius]
 *   flare    the burst's fat flare strokes along each hanging cut: [alpha, size]
 *   sparks   the burst's sparks off the lines and the art's shards: [alpha, size]
 *   star     the burst's '*', the art's '*' core and the impact frame's '+' core: [alpha, size]
 *   halo     the art's expanding '°' disc: [alpha, size]
 *   speed    the impact frame's speed lines across the screen: alpha
 *   crescent the art's crescent / lens: alpha
 *   pfx      false: the hero's own spark star and shockwave on the art's blow are not called
 *            (player/fx.js; they draw on that module's own cosmetic stream, never Math.random)
 *   boss     the struck boss's white hurt flash on the last blow (takeHit `flash`)
 *   thin     the new thin long lines: each hanging cut flares out to `ext` x its length, `size` m
 *            thick, for `life` s (fx time); `a` its alpha (0: none)
 *   veil     the soft veil round each hanging cut (alpha): where the cuts cross the veils stack
 *   cut      a flash cut's centre: its '+' star [alpha, size] and its light (intensity)
 *   screen   the screen's own pulses (game/flow.js, not this module's: burstScreen()): `cut` x a flash
 *            cut's flicker, `last` x the last blow's flash, `dip` x the last blow's dark blink
 */
export const BURST_LOOK = deepFreeze({
  levels: [
    null, // 0: today
    {
      light: [0.5, 0.8], flare: [0.6, 0.6], sparks: [0.8, 0.9], star: [0.5, 0.7], halo: [0.4, 0.7], speed: 0.7, crescent: 0.8,
      pfx: true, boss: 0.8,
      thin: { a: 0.9, ext: 1.35, size: 0.055, life: 0.1 },
      cut: { star: [0.6, 0.8], light: 0.6 }, veil: 0.6,
      screen: { cut: 0.6, last: 0.5, dip: 1.2 },
    },
    {
      light: [0.2, 0.6], flare: [0.3, 0.35], sparks: [0.6, 0.8], star: [0.2, 0.5], halo: [0.1, 0.5], speed: 0.45, crescent: 0.6,
      pfx: false, boss: 0.5,
      thin: { a: 1, ext: 1.6, size: 0.045, life: 0.12 },
      cut: { star: [0.35, 0.65], light: 0.3 }, veil: 0.35,
      screen: { cut: 0.3, last: 0.2, dip: 1.5 },
    },
    {
      light: [0, 0.5], flare: [0, 0.3], sparks: [0.45, 0.7], star: [0, 0.4], halo: [0, 0.4], speed: 0.3, crescent: 0.45,
      pfx: false, boss: 0.3,
      thin: { a: 1, ext: 1.85, size: 0.04, life: 0.14 },
      cut: { star: [0.15, 0.5], light: 0 }, veil: 0.15,
      screen: { cut: 0, last: 0, dip: 1.8 },
    },
  ],
});
export const BURST_DEFAULT = 0;

const fromUrl = () => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('burst') : null;
    const n = q == null || q === '' ? NaN : Number(q);
    return Number.isInteger(n) && n >= 0 && n < BURST_LOOK.levels.length ? n : BURST_DEFAULT;
  } catch {
    return BURST_DEFAULT;
  }
};
let level = fromUrl();
let custom = null;

/** n: 0..3, or a custom level object (BURST_LOOK.levels' shape; missing keys = today). */
export const setBurst = (n) => {
  if (n && typeof n === 'object') {
    custom = n;
    level = -1;
    return level;
  }
  custom = null;
  level = Number.isInteger(n) && n >= 0 && n < BURST_LOOK.levels.length ? n : BURST_DEFAULT;
  return level;
};
/** The level now (-1: a custom one). */
export const burstLevel = () => level;
/** The look now: null = today (level 0), else the level's entry. */
export const burstLook = () => (custom ? custom : BURST_LOOK.levels[level] ?? null);

const ONE = deepFreeze({ cut: 1, last: 1, dip: 1 });
/**
 * The screen's pulses for the flurry (game/flow.js reads this: `cut` x a flash cut's flashPulse,
 * `last` x the last blow's flashPulse, `dip` x the last blow's grade.dip amount). Today: all 1.
 */
export const burstScreen = () => burstLook()?.screen ?? ONE;

/** A [a, b] pair of the look (today: [1, 1]). */
export const pair = (L, key) => {
  const v = L?.[key];
  return Array.isArray(v) ? v : null;
};
