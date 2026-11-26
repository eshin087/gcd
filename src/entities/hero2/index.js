// The remade hero's switchboard (src/entities/hero2/README.md). main.js calls `mountHero2(game)` once
// after the player exists, and `game.hero2.update(dt)` every step after the player's update. Nothing in
// hero2 is imported unless a switch asks for it:
//   ?hero=new                    the game PLAYED with the remade hero (adapter.js: player.anim becomes it)
//   ?hero=new&show=<clip>|all    the review mode instead (showcase.js; `&show` empty = the whole list)
//   ?hero2=body                  the body builder's side-by-side stand (bodyDev.js)
//   ?hero2=horse                 the horse builder's stand (horse/horseDev.js)
// A stand's `mount(game, params)` returns `{ update(dt) }` (or nothing). Several may be on at once.

/** True when the URL asks for any hero2 mode. */
export function hero2Wanted(search) {
  try {
    const q = new URLSearchParams(search);
    return q.get('hero') === 'new' || q.has('hero2');
  } catch {
    return false;
  }
}

/** 'play' | 'show' | null: what `?hero=new` asks for. */
export function hero2Mode(search) {
  try {
    const q = new URLSearchParams(search);
    if (q.get('hero') !== 'new') return null;
    return q.has('show') ? 'show' : 'play';
  } catch {
    return null;
  }
}

// each stand is its own lazy chunk in the dev server (the release bundle inlines them)
const STANDS = {
  play: () => import('./adapter.js'),
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
  const mode = hero2Mode(location.search);
  if (mode === 'show') await add('showcase');
  else if (mode === 'play') await add('play');
  for (const name of (q.get('hero2') || '').split(',')) if (name !== 'showcase' && name !== 'play' && STANDS[name]) await add(name);
  game.hero2 = {
    mode,
    parts,
    update(dt) {
      for (const p of parts) p.update?.(dt);
    },
  };
  return game.hero2;
}
