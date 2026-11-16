// Private preview definitions. The ordinary heavy becomes a dashing diagonal
// cut; shared combat numbers, the original hero and human bosses are untouched.
const candidates = new WeakMap(), originals = new WeakMap();

export function temperedAttack(def) {
  if (!def || def.button !== 'heavy' || def.anim?.clip !== 'heavyThrust') return def;
  if (!candidates.has(def)) {
    const candidate = Object.freeze({
      ...def, label: 'Sweeping Gale', contact: 'sweep', glint: 'edge',
      anim: Object.freeze({ ...def.anim, clip: 'heavyCrush' }),
    });
    candidates.set(def, candidate); originals.set(candidate, def);
  }
  return candidates.get(def);
}

export const originalAttack = def => originals.get(def) ?? def;
