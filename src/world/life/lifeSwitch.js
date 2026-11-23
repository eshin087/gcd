// The living world's switch: which of its pieces run, and how strongly.
//
//   ?life=off | all | wind,litter,steps,weather,creatures,air,arrival,answer
//   ?lifeK=0.25..2      the strength of all of it (1 = as tuned; the Lab: quiet 0.6, natural 1, strong 1.5)
//
// The pieces (world/life/life.js says what each one is):
//   wind       one shared wind per level: gust fronts through the grass, the trees, smoke and letters
//   litter     leaves (ash, paper, grit) that fall, lie on the ground and lift again
//   steps      footsteps that answer the surface
//   weather    a level's slow spells (mist, a drizzle, an ember squall)
//   creatures  birds, moths, fireflies that mind the hero
//   air        the sound of the air (audio/air.js)
//   arrival    the camera opens wide over the level as the player enters (game/arrival.js)
//   answer     the world answers the fight (a roar's gust front, the hush before a great blow)
//
// DEFAULT: off, until the owner has picked from the filmed options. Headless (no `location`): off, so
// the seeded suites are untouched; tests/integration/life.mjs turns pieces on with setLife().

export const LIFE_PIECES = Object.freeze(['wind', 'litter', 'steps', 'weather', 'creatures', 'air', 'arrival', 'answer']);
const DEFAULT = 'off';

const parse = (spec) => {
  const on = {};
  const q = spec == null || spec === '' ? DEFAULT : String(spec).trim().toLowerCase();
  const want = q === 'all' ? null : new Set(q.split(',').map((s) => s.trim()));
  for (const p of LIFE_PIECES) on[p] = want === null ? true : want.has(p); // 'off' (or an unknown word): nothing
  return on;
};

const clampK = (v) => {
  const k = Number(v);
  return Number.isFinite(k) ? Math.min(2, Math.max(0.25, k)) : 1;
};

const fromUrl = () => {
  try {
    if (typeof location === 'undefined') return { on: parse(DEFAULT), k: 1 };
    const q = new URLSearchParams(location.search);
    return { on: parse(q.get('life')), k: q.has('lifeK') ? clampK(q.get('lifeK')) : 1 };
  } catch {
    return { on: parse(DEFAULT), k: 1 };
  }
};

const first = fromUrl();

export const LIFE = {
  pieces: LIFE_PIECES,
  /** piece → boolean (the Lab flips these live) */
  on: first.on,
  /** the strength of all of it, 0.25..2 */
  k: first.k,
};

/** Is a piece switched on? (A level may still leave it out: ask `game.world.life.on(piece)`.) */
export const lifeOn = (piece) => LIFE.on[piece] === true;
/** Is any piece on? */
export const lifeAny = () => LIFE_PIECES.some((p) => LIFE.on[p] === true);

/** Set the pieces from a spec ('all' | 'off' | 'wind,litter'): the Lab and the tests. */
export function setLife(spec) {
  const on = parse(spec ?? DEFAULT);
  for (const p of LIFE_PIECES) LIFE.on[p] = on[p];
  return LIFE;
}

/** Set the strength (clamped 0.25..2). */
export function setLifeK(k) {
  LIFE.k = clampK(k);
  return LIFE.k;
}
