import { DEFAULT_LOADOUT } from './index.js';
import { MOON_LOADOUT, MOON_TINT } from './moon.js';
import { SWALLOW_LOADOUT, SWALLOW_TINT } from './swallow.js';
import { WARDEN_LOADOUT, WARDEN_TINT } from './warden.js';

// The hero's OUTFIT OPTIONS, a temporary switch (the ?lordLook= precedent, ADR log): each look is a
// loadout plus its colours (a tint on the rig's own materials, model.js tintHero). main.js reads
// `?heroLook=<id>` into `game.heroLook`; the Player wears it, the Lab's OUTFIT row and
// `game.pickHeroLook(id)` switch it live. Once the owner picks one, this file, the switch and the
// losing looks go: the pick becomes DEFAULT_LOADOUT (+ its tint). Nothing in gear/ imports this file.

export const HERO_LOOKS = Object.freeze({
  shroud: Object.freeze({ id: 'shroud', name: 'Wanderer (today)', loadout: DEFAULT_LOADOUT, tint: null }),
  robe: Object.freeze({ id: 'robe', name: 'Moonlit Robe', loadout: MOON_LOADOUT, tint: MOON_TINT }),
  swallow: Object.freeze({ id: 'swallow', name: 'Swallow', loadout: SWALLOW_LOADOUT, tint: SWALLOW_TINT }),
  warden: Object.freeze({ id: 'warden', name: 'Moon Warden', loadout: WARDEN_LOADOUT, tint: WARDEN_TINT }),
});
export const DEFAULT_LOOK = 'shroud';
export const LOOK_IDS = Object.keys(HERO_LOOKS);

/** The look registered under `id`, or null. */
export const getLook = (id) => (typeof id === 'string' && Object.hasOwn(HERO_LOOKS, id) ? HERO_LOOKS[id] : null);

/** The look a URL query asks for (`?heroLook=robe`, case-insensitive); the default when absent or unknown. */
export function heroLookFromSearch(search) {
  let id = null;
  try {
    const q = new URLSearchParams(search ?? '');
    id = q.get('heroLook') ?? q.get('herolook');
  } catch {
    id = null;
  }
  const k = typeof id === 'string' ? id.trim().toLowerCase() : '';
  return getLook(k) ? k : DEFAULT_LOOK;
}

/** `href` with `?heroLook=<id>` set (removed for the default); other params kept. */
export function heroLookUrl(id, href) {
  const u = new URL(href);
  u.searchParams.delete('herolook');
  if (id === DEFAULT_LOOK) u.searchParams.delete('heroLook');
  else u.searchParams.set('heroLook', id);
  return u.toString();
}
