import { DEFAULT_LOADOUT, SHROUD_LOADOUT } from './index.js';
import { MOON_LOADOUT, MOON_SHADED_LOADOUT, MOON_TINT } from './moon.js';
import { SWALLOW_LOADOUT, SWALLOW_SHADED_LOADOUT, SWALLOW_TINT } from './swallow.js';
import { WARDEN_LOADOUT, WARDEN_SHADED_LOADOUT, WARDEN_TINT } from './warden.js';

// The hero's OUTFIT OPTIONS (ADR-089; kept for later use: the owner, 2026-11-14, "keep the new skins
// for now to be used in the future"; the default is the Wanderer, `wanderer`, since 2026-11-16,
// ADR-123, and the Shrouded set it replaced is the option `shroud`): each look is a
// loadout plus its colours (a tint on the rig's own materials, model.js tintHero). main.js reads
// `?heroLook=<id>` into `game.heroLook`; the Player wears it, the Lab's OUTFIT row and
// `game.pickHeroLook(id)` switch it live. If one is made the default later it becomes DEFAULT_LOADOUT
// (+ its tint). Nothing in gear/ imports this file.
// Each of the three new looks comes twice: its bare head with the face lit, and the same head with
// the face in shadow (`<id>-shade`, named "<look> (shaded)": the head item's `shadowsFace` twin; `of`
// = the lit look's id). At the game camera a lit face under gold hair can read as one gold mask (the
// owner's "gold face", Session 16), so the owner picks the face from renders, not from text.

export const HERO_LOOKS = Object.freeze({
  wanderer: Object.freeze({ id: 'wanderer', name: 'Wanderer', loadout: DEFAULT_LOADOUT, tint: null }),
  shroud: Object.freeze({ id: 'shroud', name: 'Shrouded (2026-11-11)', loadout: SHROUD_LOADOUT, tint: null }),
  // (prototypes for the owner's pick, 2026-11-17: "make the sword a bit shorter and same with the
  // character. the legs are too long and put a hood on". `legs`: his own thigh and shin (DIM's 0.43 /
  // 0.42); `ownWeapon`: switching to it live brings its sword too)
  'proto-a': Object.freeze({ id: 'proto-a', name: 'Option A: legs -6%, sword 1.52 m, hood', loadout: Object.freeze({ ...DEFAULT_LOADOUT, head: 'shroud.hood', weapon: 'wanderer.swordA' }), tint: null, legs: Object.freeze({ thigh: 0.404, shin: 0.395 }), ownWeapon: true }),
  'proto-b': Object.freeze({ id: 'proto-b', name: 'Option B: legs -12%, sword 1.42 m, hood, his fringe, face lit', loadout: Object.freeze({ ...DEFAULT_LOADOUT, head: 'shroud.hoodOwnHair', weapon: 'wanderer.swordB' }), tint: null, legs: Object.freeze({ thigh: 0.378, shin: 0.37 }), ownWeapon: true }),
  robe: Object.freeze({ id: 'robe', name: 'Moonlit Robe', loadout: MOON_LOADOUT, tint: MOON_TINT }),
  'robe-shade': Object.freeze({ id: 'robe-shade', name: 'Robe (shaded)', loadout: MOON_SHADED_LOADOUT, tint: MOON_TINT, of: 'robe' }),
  swallow: Object.freeze({ id: 'swallow', name: 'Swallow', loadout: SWALLOW_LOADOUT, tint: SWALLOW_TINT }),
  'swallow-shade': Object.freeze({ id: 'swallow-shade', name: 'Swallow (shaded)', loadout: SWALLOW_SHADED_LOADOUT, tint: SWALLOW_TINT, of: 'swallow' }),
  warden: Object.freeze({ id: 'warden', name: 'Moon Warden', loadout: WARDEN_LOADOUT, tint: WARDEN_TINT }),
  'warden-shade': Object.freeze({ id: 'warden-shade', name: 'Warden (shaded)', loadout: WARDEN_SHADED_LOADOUT, tint: WARDEN_TINT, of: 'warden' }),
});
export const DEFAULT_LOOK = 'wanderer';
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
