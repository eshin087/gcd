// COMBO LINKS, every move's (2026-11-15, the tuning pass): what the wyrm flows into the moment a move
// ends on its own (not parried into a recoil, staggered, broken or plunged: those keep the hero's
// opening). tuning.js copies each list onto its attack's tuning entry (`TUNING.attacks[name].links`);
// ai.js Brain._link reads it. One table, so the fight's flow is read and tuned in one place.
//
// A link: { to, when, chance: [P1, P2, P3] (or one number), band?: false }. The first link whose `when`
// holds for where the hero is as the move ends, whose roll passes and whose target is usable right
// now (its phase reached, off cooldown, weight > 0 from where he stands: `band: false` skips the
// target's own distance / angle band) starts with no pause, up to TUNING.pressure.chainDepth links in
// a row, then the breather (chainRest). `when`: 'front' (within 0.9 rad of the nose), 'side'
// (0.9 - 1.75), 'behind', 'near' (< 9 m from the root), 'mid' (9 - 18), 'far' (> 18), 'any'.
//
// Measured (scenario PRESSURE, GCD_PATT=1 prints where the hero is as each move ends): the strings,
// the bullet patterns, the spells and the terrain moves end with him in FRONT, near or mid, nine times
// in ten; the wing buffet with him at the SIDE; the pivot lash, the tail bat, the flights and the
// flame ring often with him BEHIND. So each list reads, in order: behind → the tail; side → a pivot,
// a swipe; front → a short follow-up (a stomp, a bite, the quick spit) or, from phase 2, another
// string or a fire move; mid → a lunge (pounce), a wing, a flight; far → the charge, a shot, a flight.
// Phase 1 links short follow-ups and rarely; phase 2 most moves flow into another; phase 3 nearly all.
// The director's own guards still hold: no guard-tell move while meteors / a chase fall, no red move
// while bullets fly (Brain._link), the chain cap, the breather.

const tail = (a, b, c) => ({ to: 'tail', when: 'behind', chance: [a, b, c] });

export const LINKS = {
  // ---- the single blows
  bite: [tail(0.7, 0.7, 0.85), { to: 'swipe', when: 'side', chance: [0.55, 0.6, 0.7] }, { to: 'stomp', when: 'front', chance: [0.1, 0.35, 0.25] }, { to: 'clawCombo', when: 'front', chance: [0, 0.3, 0.45] }],
  swipe: [tail(0.7, 0.7, 0.9), { to: 'bite', when: 'front', chance: [0.45, 0.5, 0.3] }, { to: 'wingRend', when: 'front', chance: [0, 0.3, 0.45] }],
  tail: [
    { to: 'pivotLash', when: 'side', chance: [0.4, 0.45, 0.55] }, { to: 'clawCombo', when: 'front', chance: [0.4, 0.45, 0.55] },
    { to: 'cinderSpit', when: 'front', chance: [0.45, 0.35, 0.45] }, { to: 'wingBuffet', when: 'mid', chance: [0.4, 0.5, 0.7] }, { to: 'hurl', when: 'far', chance: [0.25, 0.4, 0.6] },
  ],
  stomp: [
    tail(0.55, 0.6, 0.8), { to: 'swipe', when: 'side', chance: [0.4, 0.45, 0.55] }, { to: 'bite', when: 'front', chance: [0.4, 0.4, 0.25] },
    { to: 'wingRend', when: 'front', chance: [0.25, 0.3, 0.4] }, { to: 'wingBuffet', when: 'mid', chance: [0.4, 0.5, 0.7] },
  ],
  charge: [tail(0.55, 0.6, 0.8), { to: 'clawCombo', when: 'front', chance: [0.4, 0.5, 0.65] }, { to: 'stomp', when: 'front', chance: [0.1, 0.3, 0.2] }, { to: 'hurl', when: 'far', chance: [0.25, 0.35, 0.5] }],
  breath: [
    tail(0.55, 0.6, 0.8), { to: 'wingRend', when: 'front', chance: [0.3, 0.3, 0.4] }, { to: 'stomp', when: 'front', chance: [0.1, 0.3, 0.2] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'charge', when: 'far', chance: [0.25, 0.4, 0.5] },
  ],
  fireball: [{ to: 'charge', when: 'far', chance: [0.25, 0.4, 0.6] }, { to: 'pounce', when: 'mid', chance: [0, 0.5, 0.7] }, { to: 'cinderSpit', when: 'front', chance: [0.45, 0.35, 0.45] }],
  leap: [tail(0, 0.6, 0.8), { to: 'stomp', when: 'front', chance: [0, 0.4, 0.25] }, { to: 'frenzy', when: 'front', chance: [0, 0, 0.4] }, { to: 'flameRing', when: 'near', chance: [0, 0, 0.5] }],

  // ---- the strings (claws, jaws, wings, tail, fire)
  clawCombo: [
    tail(0.7, 0.7, 0.9), { to: 'pivotLash', when: 'side', chance: [0.4, 0.5, 0.6] },
    { to: 'cinderSpit', when: 'front', chance: [0.5, 0.4, 0.45] }, { to: 'furnaceMaw', when: 'front', chance: [0, 0.3, 0.35] }, { to: 'stomp', when: 'front', chance: [0.1, 0.3, 0.2] },
    { to: 'wingBuffet', when: 'mid', chance: [0.4, 0.5, 0.7] }, { to: 'pounce', when: 'far', chance: [0, 0.5, 0.7] },
  ],
  rendingFlurry: [
    tail(0.7, 0.7, 0.9), { to: 'pivotLash', when: 'side', chance: [0.4, 0.5, 0.6] },
    { to: 'cinderSpit', when: 'front', chance: [0.5, 0.4, 0.45] }, { to: 'eruptions', when: 'front', chance: [0, 0.3, 0.4] }, { to: 'skyHammer', when: 'front', chance: [0, 0.25, 0.35] },
    { to: 'wingBuffet', when: 'mid', chance: [0.4, 0.5, 0.7] }, { to: 'fanVolley', when: 'far', chance: [0.25, 0.4, 0.6] },
  ],
  stormFlurry: [
    tail(0.7, 0.7, 0.9), { to: 'pivotLash', when: 'side', chance: [0.4, 0.5, 0.6] },
    { to: 'stomp', when: 'front', chance: [0.2, 0.35, 0.2] }, { to: 'cinderSpit', when: 'front', chance: [0.45, 0.4, 0.45] }, { to: 'emberStorm', when: 'front', chance: [0, 0.25, 0.35] },
    { to: 'fanVolley', when: 'far', chance: [0.25, 0.4, 0.6] },
  ],
  hesitantMaw: [
    { to: 'swipe', when: 'side', chance: [0.55, 0.6, 0.8] }, tail(0.7, 0.7, 0.85),
    { to: 'stomp', when: 'front', chance: [0.2, 0.4, 0.25] }, { to: 'cinderSpit', when: 'front', chance: [0.3, 0.3, 0.4] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'charge', when: 'far', chance: [0.25, 0.4, 0.6] },
  ],
  blackMaw: [
    tail(0.7, 0.7, 0.9), { to: 'swipe', when: 'side', chance: [0.55, 0.6, 0.7] },
    { to: 'cinderSpit', when: 'front', chance: [0.5, 0.4, 0.5] }, { to: 'wingRend', when: 'front', chance: [0.3, 0.35, 0.45] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] },
  ],
  wingBuffet: [
    tail(0.55, 0.6, 0.8), { to: 'pivotLash', when: 'side', chance: [0.4, 0.5, 0.6] },
    { to: 'pounce', when: 'mid', chance: [0, 0.5, 0.7] }, { to: 'fanVolley', when: 'mid', chance: [0.4, 0.4, 0.5] },
    { to: 'charge', when: 'far', chance: [0.4, 0.5, 0.7] },
  ],
  tailLash: [
    tail(0, 0.5, 0.7), { to: 'clawCombo', when: 'front', chance: [0, 0.35, 0.5] }, { to: 'cinderSpit', when: 'front', chance: [0, 0.3, 0.4] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'eruptions', when: 'far', chance: [0, 0.3, 0.5] },
  ],
  pounce: [tail(0, 0.6, 0.8), { to: 'clawCombo', when: 'front', chance: [0, 0.4, 0.5] }, { to: 'stomp', when: 'front', chance: [0, 0.3, 0.2] }, { to: 'cinderSpit', when: 'front', chance: [0, 0.3, 0.4] }],
  frenzy: [
    tail(0, 0, 0.8), { to: 'flameRing', when: 'front', chance: [0, 0, 0.4] }, { to: 'cinderSpit', when: 'front', chance: [0, 0, 0.55] },
    { to: 'fanVolley', when: 'front', chance: [0, 0, 0.35] }, { to: 'pounce', when: 'far', chance: [0, 0, 0.7] },
  ],
  cinderFlurry: [
    tail(0, 0.7, 0.9), { to: 'pivotLash', when: 'side', chance: [0, 0.5, 0.6] },
    { to: 'emberRain', when: 'front', chance: [0, 0.3, 0.4] }, { to: 'stomp', when: 'front', chance: [0, 0.3, 0.2] }, { to: 'cinderSpit', when: 'front', chance: [0, 0.35, 0.45] },
    { to: 'pounce', when: 'mid', chance: [0, 0.5, 0.7] },
  ],
  wingRend: [
    tail(0.7, 0.7, 0.9), { to: 'pivotLash', when: 'side', chance: [0.4, 0.5, 0.6] },
    { to: 'cinderSpit', when: 'front', chance: [0.45, 0.4, 0.55] }, { to: 'skyHammer', when: 'front', chance: [0, 0.3, 0.4] }, { to: 'stomp', when: 'front', chance: [0.1, 0.3, 0.2] },
    { to: 'wingBuffet', when: 'mid', chance: [0.4, 0.5, 0.6] }, { to: 'pounce', when: 'far', chance: [0, 0.5, 0.7] },
  ],
  pivotLash: [
    { to: 'rearGuard', when: 'behind', chance: [0.4, 0.5, 0.7] }, { to: 'swipe', when: 'side', chance: [0.4, 0.4, 0.5] },
    { to: 'wingRend', when: 'front', chance: [0.5, 0.5, 0.6] }, { to: 'cinderSpit', when: 'front', chance: [0.45, 0.35, 0.45] }, { to: 'stomp', when: 'front', chance: [0.1, 0.3, 0.2] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] },
  ],
  rearGuard: [
    { to: 'wingRend', when: 'front', chance: [0.5, 0.5, 0.6] }, { to: 'hesitantMaw', when: 'front', chance: [0.25, 0.3, 0.4] }, { to: 'cinderSpit', when: 'front', chance: [0.45, 0.35, 0.45] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'charge', when: 'far', chance: [0.4, 0.4, 0.5] },
  ],
  skyHammer: [
    tail(0.55, 0.6, 0.8), { to: 'cinderSpit', when: 'front', chance: [0.45, 0.4, 0.55] }, { to: 'stomp', when: 'front', chance: [0.1, 0.3, 0.2] },
    { to: 'furnaceMaw', when: 'front', chance: [0, 0.3, 0.35] }, { to: 'emberStorm', when: 'front', chance: [0, 0.25, 0.35] },
    { to: 'wingBuffet', when: 'mid', chance: [0.4, 0.4, 0.5] }, { to: 'fireball', when: 'far', chance: [0.4, 0.5, 0.6] },
  ],
  furnaceMaw: [
    tail(0, 0.7, 0.9), { to: 'pivotLash', when: 'side', chance: [0, 0.5, 0.6] },
    { to: 'cinderSpit', when: 'front', chance: [0, 0.4, 0.55] }, { to: 'eruptions', when: 'front', chance: [0, 0.3, 0.4] }, { to: 'cinderRake', when: 'front', chance: [0, 0.25, 0.35] },
    { to: 'pounce', when: 'mid', chance: [0, 0.5, 0.7] }, { to: 'charge', when: 'far', chance: [0, 0.5, 0.7] },
  ],
  cinderRake: [
    { to: 'rearGuard', when: 'behind', chance: [0, 0.6, 0.8] }, { to: 'pivotLash', when: 'side', chance: [0, 0.5, 0.6] },
    { to: 'cinderSpit', when: 'front', chance: [0, 0.4, 0.55] }, { to: 'flameRing', when: 'front', chance: [0, 0, 0.4] }, { to: 'skyHammer', when: 'front', chance: [0, 0.25, 0.35] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'fireball', when: 'far', chance: [0, 0.5, 0.7] },
  ],
  cataclysm: [
    tail(0, 0, 0.9), { to: 'pivotLash', when: 'side', chance: [0, 0, 0.6] },
    { to: 'cinderSpit', when: 'front', chance: [0, 0, 0.55] }, { to: 'flameRing', when: 'front', chance: [0, 0, 0.45] },
    { to: 'fireLanes', when: 'mid', chance: [0, 0, 0.4] }, { to: 'pounce', when: 'mid', chance: [0, 0, 0.7] }, { to: 'charge', when: 'far', chance: [0, 0, 0.7] },
  ],

  // ---- the flights (they land beside / behind him: the tail, a stomp, a ring of fire)
  skyStrafe: [
    tail(0.4, 0.5, 0.7), { to: 'wingRend', when: 'front', chance: [0.3, 0.3, 0.4] }, { to: 'cinderSpit', when: 'front', chance: [0.5, 0.4, 0.5] },
    { to: 'stomp', when: 'near', chance: [0.1, 0.3, 0.2] }, { to: 'fanVolley', when: 'far', chance: [0.4, 0.5, 0.7] },
  ],
  diveBomb: [tail(0, 0.5, 0.7), { to: 'flameRing', when: 'near', chance: [0, 0, 0.5] }, { to: 'clawCombo', when: 'front', chance: [0, 0.4, 0.5] }, { to: 'stomp', when: 'near', chance: [0, 0.5, 0.35] }],
  hoverBarrage: [tail(0, 0.5, 0.7), { to: 'stomp', when: 'near', chance: [0, 0.5, 0.35] }, { to: 'cinderSpit', when: 'front', chance: [0, 0.3, 0.4] }, { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }],
  skyHunt: [
    tail(0.55, 0.6, 0.8), { to: 'wingRend', when: 'front', chance: [0.3, 0.35, 0.45] }, { to: 'stomp', when: 'near', chance: [0.2, 0.5, 0.35] },
    { to: 'cinderSpit', when: 'front', chance: [0.5, 0.4, 0.5] }, { to: 'charge', when: 'far', chance: [0.25, 0.4, 0.6] },
  ],
  skyFurnace: [
    tail(0, 0.6, 0.8), { to: 'flameRing', when: 'near', chance: [0, 0, 0.5] }, { to: 'skyHammer', when: 'front', chance: [0, 0.35, 0.45] },
    { to: 'cinderSpit', when: 'front', chance: [0, 0.35, 0.45] }, { to: 'eruptions', when: 'mid', chance: [0, 0.4, 0.6] },
  ],
  skyCataclysm: [
    tail(0, 0, 0.8), { to: 'flameRing', when: 'near', chance: [0, 0, 0.5] }, { to: 'cataclysm', when: 'front', chance: [0, 0, 0.4] },
    { to: 'frenzy', when: 'front', chance: [0, 0, 0.35] }, { to: 'eruptions', when: 'mid', chance: [0, 0, 0.7] },
  ],

  // ---- the spells
  meteorRain: [tail(0, 0.6, 0.8), { to: 'stomp', when: 'front', chance: [0, 0.4, 0.25] }, { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'charge', when: 'far', chance: [0, 0.4, 0.6] }],
  eruptions: [tail(0, 0.5, 0.7), { to: 'stomp', when: 'front', chance: [0, 0.4, 0.25] }, { to: 'clawCombo', when: 'front', chance: [0, 0.35, 0.45] }, { to: 'pounce', when: 'mid', chance: [0, 0.5, 0.7] }],
  flameRing: [
    tail(0, 0.5, 0.7), { to: 'stomp', when: 'front', chance: [0, 0.4, 0.25] }, { to: 'cinderSpit', when: 'front', chance: [0, 0.35, 0.45] },
    { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'leap', when: 'mid', chance: [0, 0.3, 0.5] }, { to: 'charge', when: 'far', chance: [0, 0.4, 0.6] },
  ],
  flameWall: [tail(0, 0, 0.7), { to: 'frenzy', when: 'front', chance: [0, 0, 0.4] }, { to: 'cinderSpit', when: 'front', chance: [0, 0, 0.45] }, { to: 'pounce', when: 'mid', chance: [0, 0, 0.6] }, { to: 'charge', when: 'far', chance: [0, 0, 0.5] }],
  nova: [tail(0, 0, 0.8), { to: 'cataclysm', when: 'front', chance: [0, 0, 0.5] }, { to: 'stomp', when: 'front', chance: [0, 0, 0.25] }, { to: 'leap', when: 'far', chance: [0, 0, 0.6] }],

  // ---- the breathed patterns
  emberStorm: [
    { to: 'clawCombo', when: 'front', chance: [0.25, 0.35, 0.45] }, { to: 'stomp', when: 'front', chance: [0.1, 0.3, 0.2] },
    { to: 'emberRain', when: 'mid', chance: [0, 0.3, 0.45] }, { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.5] }, { to: 'cinderSpit', when: 'far', chance: [0, 0.3, 0.5] },
  ],
  fanVolley: [
    { to: 'clawCombo', when: 'front', chance: [0.25, 0.4, 0.55] }, { to: 'wingRend', when: 'front', chance: [0.3, 0.3, 0.4] }, { to: 'hesitantMaw', when: 'front', chance: [0.2, 0.25, 0.35] },
    { to: 'charge', when: 'far', chance: [0.25, 0.4, 0.6] },
  ],
  cinderSpit: [
    tail(0.55, 0.6, 0.8), { to: 'swipe', when: 'side', chance: [0.4, 0.4, 0.5] },
    { to: 'bite', when: 'front', chance: [0.35, 0.35, 0.2] }, { to: 'wingRend', when: 'front', chance: [0.3, 0.3, 0.4] },
    { to: 'fanVolley', when: 'far', chance: [0, 0.2, 0.35] },
  ],
  emberRain: [{ to: 'clawCombo', when: 'front', chance: [0, 0.35, 0.45] }, { to: 'stomp', when: 'front', chance: [0, 0.3, 0.2] }, { to: 'cinderSpit', when: 'mid', chance: [0, 0.4, 0.6] }, { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.5] }],
  fireWheel: [{ to: 'wingRend', when: 'front', chance: [0, 0.3, 0.4] }, { to: 'fireLanes', when: 'mid', chance: [0, 0, 0.35] }, { to: 'pounce', when: 'mid', chance: [0, 0.4, 0.5] }, { to: 'cinderSpit', when: 'far', chance: [0, 0.4, 0.6] }],
  fireLanes: [{ to: 'frenzy', when: 'front', chance: [0, 0, 0.4] }, { to: 'cinderSpit', when: 'front', chance: [0, 0, 0.4] }, { to: 'pounce', when: 'mid', chance: [0, 0, 0.5] }, { to: 'fanVolley', when: 'far', chance: [0, 0, 0.4] }],

  // ---- the terrain moves
  hurl: [{ to: 'cinderSpit', when: 'front', chance: [0.45, 0.35, 0.45] }, { to: 'wingRend', when: 'front', chance: [0.3, 0.3, 0.4] }, { to: 'charge', when: 'mid', chance: [0, 0.3, 0.45] }, { to: 'tailBat', when: 'far', chance: [0.25, 0.35, 0.5] }],
  tailBat: [tail(0.55, 0.6, 0.8), { to: 'pivotLash', when: 'side', chance: [0.4, 0.5, 0.6] }, { to: 'cinderSpit', when: 'front', chance: [0.45, 0.35, 0.45] }, { to: 'hurl', when: 'far', chance: [0, 0.25, 0.4] }],
  fireBrand: [{ to: 'cinderSpit', when: 'front', chance: [0, 0.35, 0.45] }, { to: 'clawCombo', when: 'front', chance: [0, 0.3, 0.4] }, { to: 'charge', when: 'mid', chance: [0, 0.3, 0.45] }, { to: 'tailBat', when: 'far', chance: [0, 0.3, 0.45] }],
};
