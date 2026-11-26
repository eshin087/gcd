// The remade hero's switchboard (owned by the lead; see README.md). main.js calls `mountHero2(game)`
// once after the player exists, and `game.hero2.update(dt)` every step after the player's update.
// Nothing in hero2 is imported unless a switch asks for it:
//   ?hero=new            the review mode / the remade hero (showcase.js: `mount(game, params)`)
//   ?hero2=body          the body builder's side-by-side stand (bodyDev.js: `mount(game, params)`)
//   ?hero2=horse         the horse builder's stand (horse/horseDev.js)
// A stand's `mount` returns `{ update(dt) }` (or nothing). Several may be on at once.

/** True when the URL asks for any hero2 mode. */
export function hero2Wanted(search) {
  try {
    const q = new URLSearchParams(search);
    return q.get('hero') === 'new' || q.has('hero2');
  } catch {
    return false;
  }
}

// each stand is its own lazy chunk in the dev server (the release bundle inlines them)
const STANDS = {
  showcase: () => import('./showcase.js'),
  body: () => import('./bodyDev.js'),
  horse: () => import('./horse/horseDev.js'),
};

export async function mountHero2(game) {
  const q = new URLSearchParams(location.search);
  const parts = [];
  const add = async (file) => {
    try {
      const m = await STANDS[file]();
      const part = await m.mount(game, q);
      if (part) parts.push(part);
    } catch (e) {
      console.warn(`[hero2] ${file}:`, e);
    }
  };
  if (q.get('hero') === 'new') await add('showcase');
  for (const name of (q.get('hero2') || '').split(',')) if (name !== 'showcase' && STANDS[name]) await add(name);
  game.hero2 = {
    parts,
    update(dt) {
      for (const p of parts) p.update?.(dt);
    },
  };
  return game.hero2;
}
