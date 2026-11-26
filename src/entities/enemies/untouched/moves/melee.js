// Bai Wuji's blows (the MELEE AGENT's file; moves.js is the router: its header has the format and the
// rules). TODAY core's small working set, so the fight runs start to death: a kick, a palm, a blink
// behind into a kick (blue), a three-beat string, a red lunge, his counter and his flurry.
// Exports (all optional but `moves`):
//   moves(X)        → { name: move }   (X: the builders, moves.js; no import of moves.js: a cycle)
//   LINKS           { from: [link, ...] } his combo links for these moves (links.js format)
//   FIELDS          the beat fields this file's HANDLER owns (each prefixed `wj`; none here: core's
//                   untouched.js handles `wjBlink` itself)
//   create(d)       → the handler object (spells.js shows its hooks); none here
// Every new beat or move field is prefixed `wj`. Every landed blow throws (knockback >= 2: R2).

export const FIELDS = Object.freeze([]);

export function moves(X) {
  const { punch, kick, TELL } = X;
  const { N, B, R } = TELL;
  return {
    // ================================================================ phase 1: THE BLINDFOLD
    /** Flick: a lazy round kick, the hands never leave his pockets. */
    flick: {
      label: 'Flick', phase: 1, weight: [2.0, 1.4, 1.0], cooldown: 2.5, band: [0, 3.4], recovery: 0.6, cat: 'single',
      beats: [{ ...kick('round', N, 0.58, 18), knockback: 3 }],
    },
    /** Open Palm: one palm to the chest that sends the hero flying (blue, the flare: a parry moment). */
    palm: {
      label: 'Open Palm', phase: 1, weight: [1.6, 1.2, 0.9], cooldown: 3.5, band: [0, 3.2], recovery: 0.65, cat: 'single',
      beats: [{ ...punch('palm', B, 0.62, 22, { flare: true }), knockback: 5 }],
    },
    /** Behind You: he is gone, and behind the hero, the heel already coming (blue; a guard holds from any side). */
    behindYou: {
      label: 'Behind You', phase: 1, weight: [1.4, 1.2, 1.2], cooldown: 5, band: [0, 9], recovery: 0.6, cat: 'closer', gapCloser: true,
      beats: [{ ...kick('side', B, 0.7, 20, { flare: true }), knockback: 4, close: 0.6, track: 0.8, wjBlink: { behind: 1.8 } }],
    },
    /** Three Count: a jab, a hook, a knee (normal, normal, blue). */
    threeCount: {
      label: 'Three Count', phase: 1, weight: [1.6, 1.6, 1.4], cooldown: 4, band: [0, 3.4], recovery: 0.6, cat: 'string',
      beats: [{ ...punch('jab', N, 0.55, 14), knockback: 2 }, { ...punch('hook', N, 0.42, 14), knockback: 2.4 }, { ...kick('knee', B, 0.46, 22, { flare: true }), knockback: 4.5 }],
    },
    /** Long Step: one step that is ten, a side kick through the hero (red: roll). */
    longStep: {
      label: 'Long Step', phase: 1, weight: [1.0, 1.0, 1.0], cooldown: 6, band: [2.4, 8], recovery: 0.8, cat: 'closer', gapCloser: true,
      beats: [{ ...kick('side', R, 0.7, 30), knockback: 8, knockdown: true, close: 4.2, track: 0.6, wjCrash: true }],
    },
    /** Not Even Close: his counter out of his guard (a palm). */
    notEvenClose: {
      label: 'Not Even Close', phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [{ ...punch('palm', B, 0.5, 20), knockback: 5 }],
    },
    /** Too Slow: his answer to a streak of guards, blows from every side. */
    tooSlow: {
      label: 'Too Slow', phase: 1, weight: [0, 0, 0], counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
      beats: [
        { ...punch('cross', N, 0.6, 14, { track: 0.7 }), knockback: 2 },
        { ...kick('round', N, 0.48, 14), knockback: 2, flit: { r: 2.4 } },
        { ...punch('hook', N, 0.48, 14), knockback: 2, flit: { r: 2.4 } },
        { ...punch('uppercut', N, 0.48, 14), knockback: 3, flit: { r: 2.4 } },
      ],
    },
  };
}

const near = (to, chance) => ({ to, when: 'near', chance });
const far = (to, chance) => ({ to, when: 'far', chance });
const guarding = (to, chance) => ({ to, when: 'guarding', chance });

export const LINKS = {
  flick: [near('threeCount', [0.3, 0.35, 0.35]), far('behindYou', [0.3, 0.35, 0.4])],
  palm: [far('longStep', [0.3, 0.3, 0.35]), far('behindYou', [0.25, 0.3, 0.35])],
  behindYou: [near('threeCount', [0.3, 0.35, 0.4]), guarding('flick', [0.25, 0.3, 0.3])],
  threeCount: [far('behindYou', [0.3, 0.35, 0.35]), guarding('palm', [0.2, 0.3, 0.3])],
  longStep: [near('flick', [0.25, 0.3, 0.35])],
};
