import { BASE_ITEMS, BASE_LOADOUT } from './base.js';
import { SHIELD_ITEMS } from './shield.js';
import { ABYSS_ITEMS, ABYSS_LOADOUT, ABYSS_TINT } from './abyss.js';

// The hero's equipment, as data. A LOADOUT maps each slot to the id of the item worn there (or
// nothing); buildHero(U, loadout) in model.js builds the skeleton and the body, then lets each
// equipped item hang its meshes on the joints. gear/README.md: how to add an item and what the
// animator needs from one.

/** The equipment slots, in the order their items are built. */
export const SLOTS = Object.freeze(['head', 'chest', 'shoulders', 'arms', 'legs', 'waist', 'back', 'weapon', 'offhand']);

/** Every known item: id → { id, slot, name, build(ctx) } (+ `dims` on a weapon). */
export const GEAR = {};

/** Add an item to the registry (throws on a malformed item or a taken id). Returns the item. */
export function registerItem(item) {
  if (!item || typeof item.id !== 'string' || !item.id) throw new Error('gear item needs an id');
  if (!SLOTS.includes(item.slot)) throw new Error(`gear item "${item.id}" has no valid slot (got "${item.slot}"; slots: ${SLOTS.join(', ')})`);
  if (typeof item.build !== 'function') throw new Error(`gear item "${item.id}" needs a build(ctx) function`);
  if (Object.hasOwn(GEAR, item.id) && GEAR[item.id] !== item) throw new Error(`gear item id "${item.id}" is already registered`);
  GEAR[item.id] = item;
  return item;
}

/** The item registered under `id`, or null. */
export function getItem(id) {
  return typeof id === 'string' && Object.hasOwn(GEAR, id) ? GEAR[id] : null;
}

for (const item of [...BASE_ITEMS, ...ABYSS_ITEMS, ...SHIELD_ITEMS]) registerItem(item);

/** What the hero wears (the one hero outfit, gear/abyss.js): the hood, the robe and cowl, the bell
 *  sleeve, the boots, the robe's skirt, the cloak, the one-handed sword and the kite shield
 *  (gear/shield.js). Every duelist brings its own loadout. */
export const DEFAULT_LOADOUT = ABYSS_LOADOUT;

/** The hero's colours (model.js tintHero, on his own rig's materials only): the Player applies them
 *  to every rig it builds. A duelist never gets them. */
export const HERO_TINT = ABYSS_TINT;

/** The slots that are never left bare: an empty one gets the plain undersuit (gear/base.js). */
export { BASE_LOADOUT };

/**
 * A loadout as the list buildHero walks: [{ slot, item }] in SLOTS order, `item` null for an empty
 * slot. An empty `chest`, `arms` or `legs` gets its BASE_LOADOUT item. Throws on an id that is not
 * registered or an item put in the wrong slot: a loadout is data, so a bad one is a bug to fix,
 * not something to draw around.
 */
export function resolveLoadout(loadout) {
  const L = loadout ?? {};
  return SLOTS.map((slot) => {
    const id = L[slot] ?? BASE_LOADOUT[slot] ?? null;
    if (id == null) return { slot, item: null };
    const item = getItem(id);
    if (!item) throw new Error(`loadout.${slot}: no gear item "${id}" is registered`);
    if (item.slot !== slot) throw new Error(`loadout.${slot}: "${id}" is a ${item.slot} item`);
    return { slot, item };
  });
}
