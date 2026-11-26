import { WjSpells } from '../spells.js';

// Bai Wuji's spells as move data (the SPELLS AGENT's file; moves.js is the router: its header has the
// format, moves/melee.js the exports). The handler is ../spells.js (WjSpells): every beat below carries
// one of the fields in FIELDS, so untouched.js routes it there. Numbers: ../tuningSpells.js
// (TUNING.spells). BRIEF R4: no spell can be blocked: a held guard is opened (breaksGuard), never paid
// in health. Every spell has a tell from its windup's start and is FIXED before it fires.
//   wjDraw: 'knot' | 'wreck'   Azure Draw: a knot beyond the hero drags him, then collapses (red) /
//                             the Wrecking Knot dragged along a line across the crossing (red)
//   wjYank: true              the Yank: Draw on the hero himself, onto the waiting fist (blue: parry)
//   wjCast: 'point' | 'palm'  Crimson Cast: a red point flicked to his place, a burst (red) / held at
//                             the palm and released point blank after a blink (red)
//   wjNull: 'line' | 'last'   the Violet Null (red) / the Last Null (P3 below 12 %: wider, turning)
//   wjMoment                  (core's field) the P1 -> P2 unveiling: its burst on the world is drawn and
//                             dealt here (spells.js beatMotion), the push is core's
// Every move is `cat: 'spell'` (the director's categories). Selected by WjSpells.weigh: the hero far or
// blocking; never two spells back to back; the Null never twice inside 20 s. (The weights are high on
// purpose: the director scales a move by its cues a second to the power pressure.density, and one cue
// over a 1 - 2 s windup weighs a quarter of a string there.)
export const FIELDS = Object.freeze(['wjDraw', 'wjYank', 'wjCast', 'wjNull', 'wjMoment']);
export const create = (d) => new WjSpells(d);

export function moves(X) {
  const { punch, TUNING, TELL, FRAGS: F, holdKeys } = X;
  const { B, R } = TELL;
  const S = TUNING.spells;
  const STAND = F.STAND, PL = F.POCKET_L;
  // ---- the spells' poses (whole poses on his stance, the left hand kept in its pocket: he does not
  // take it seriously); hand offsets from each shoulder, +x his left, +z forward
  /** One finger raised before him, the hand at his chin (Draw: the knot opens where it points). */
  const FINGER = { ...STAND, ...PL, yaw: -0.12, hdX: -0.04, rH: [0.05, 0.12, 0.34], rP: [-0.9, -0.6, 0.1], sw: [0, 1.45] };
  const FINGER_UP = { ...FINGER, rH: [0.06, 0.3, 0.38], pitch: -0.05, hdX: -0.1 };
  /** The finger drawn back toward him (the drag), then flicked down (the collapse). */
  const FINGER_IN = { ...FINGER, rH: [0.1, 0.18, 0.2] };
  const FINGER_DOWN = { ...FINGER, rH: [0.06, -0.04, 0.48], rP: [-0.8, -0.3, -0.2], pitch: 0.05 };
  /** The flick: the hand cocked by the ear, then thrown open toward the hero (Cast). */
  const FLICK_COCK = { ...STAND, ...PL, yaw: -0.32, hdX: -0.02, rH: [0.14, 0.16, 0.12], rP: [-0.9, 0.2, -0.3], sw: [0, 1.45] };
  const FLICK = { ...STAND, ...PL, yaw: 0.12, pitch: 0.04, bZ: 0.04, rH: [0.1, 0.04, 0.56], rP: [-0.8, -0.3, -0.3], sw: [0, 1.45] };
  /** The palm held low at his hip, then driven out point blank (Cast's second form). */
  const PALM_COCK = { ...STAND, ...PL, yaw: -0.4, bY: -0.06, rH: [0.06, -0.24, 0.1], rP: [-0.9, -0.5, -0.3], sw: [0, 1.45] };
  const PALM = { ...STAND, ...PL, yaw: 0.2, bY: -0.1, bZ: 0.14, pitch: 0.08, rH: [0.1, -0.04, 0.56], rP: [-0.8, -0.5, -0.2], sw: [0, 1.45] };
  /** Both hands before him, the fingers up, a hand's width apart (the Null's merge), then the right
   *  thrust out, the fingers pointing down the line. */
  const GATHER = { ...STAND, yaw: -0.02, pitch: -0.04, bY: -0.04, hdX: 0.04, rH: [0.1, 0.06, 0.34], rP: [-0.9, -0.5, 0], lH: [-0.1, 0.06, 0.34], lP: [0.9, -0.5, 0], sw: [0, 1.45] };
  const MERGED = { ...GATHER, rH: [0.04, 0.1, 0.42], lH: [-0.04, 0.1, 0.42], hdX: 0.08 };
  const LINE = { ...STAND, ...PL, yaw: 0.06, pitch: 0.03, bZ: 0.06, hdX: 0.06, rH: [0.06, 0.08, 0.6], rP: [-0.8, -0.4, -0.3], sw: [0, 1.45] };
  /** The open hand reached out at the hero, then closed and pulled back to his side (the Yank). */
  const REACH = { ...STAND, ...PL, yaw: -0.05, rH: [0.04, 0.06, 0.55], rP: [-0.8, -0.5, -0.2], sw: [0, 1.45] };
  const REACH_IN = { ...STAND, ...PL, yaw: -0.4, rH: [0.1, 0.02, 0.12], rP: [-0.9, -0.2, -0.4], sw: [0, 1.45] };

  /** A spell's selfHit beat (spells.js deals its hits; the zone is the data's: the brain neither tests nor
   *  sweeps it). `fixed`: the spells keep their windups in every phase (each is cued by its own length). */
  const spell = (tell, windup, damage, knockback, own, keys, o = {}) => ({
    tell, windup, fixed: true, active: 0.1, damage, knockback, knockdown: true, zone: { kind: 'line', r: 20, w: 2 },
    selfHit: true, part: 'fistR', close: 0, track: 0.5, cock: 0.8, air: true, keys, ...own, ...o,
  });
  const D = S.draw, Y = S.yank, C = S.cast, P = S.palm, Wk = S.wreck, Nl = S.null, LN = S.lastNull;
  const yankFist = punch('cross', B, Y.windup, Y.damage, { flare: true, cock: 0.86 });
  return {
    // ================================================================ phase 1 on
    /** Azure Draw: one finger lifted; a blue knot opens beyond the hero and drags him (and the loose
     *  wreckage) toward it for its life, then collapses (red: be out of it, or roll). */
    azureDraw: {
      label: 'Azure Draw', phase: 1, weight: [0.8, 0.8, 0.7], cooldown: 7, band: [0, 40], recovery: 0.5, cat: 'spell',
      beats: [spell(R, D.windup, D.damage, D.knockback, { wjDraw: 'knot' }, [[0.08, FINGER], [0.3, FINGER_UP], [0.75, FINGER_IN], [0.86, FINGER_IN], [1.0, { ...FINGER_DOWN, e: 'i' }], [2.0, FINGER_DOWN]])],
    },
    /** The Yank: Draw on the hero himself: a short blue cue, the pull (always `travel` s), the fist he is
     *  pulled onto (blue: parry it as you arrive). */
    azureYank: {
      label: 'The Yank', phase: 1, weight: [1.5, 1.1, 1.1], cooldown: 6, band: [2.8, Y.max], recovery: 0.5, cat: 'spell',
      beats: [{
        ...yankFist, knockback: Y.knockback, close: 0, track: 1, wjYank: true,
        keys: [[0.12, REACH], [0.4, REACH], [0.62, REACH_IN], ...yankFist.keys.filter(([u]) => u >= 0.8)],
      }],
    },
    // ================================================================ phase 2 on
    /** Crimson Cast: the point flicked from his fingers to the hero's place (fixed at `fix`), a burst:
     *  9 m from the point and through whatever is behind, a crater, the loose pieces thrown outward. */
    crimsonCast: {
      label: 'Crimson Cast', phase: 2, weight: [0, 1.6, 1.6], cooldown: 6, band: [0, 40], recovery: 0.5, cat: 'spell',
      beats: [spell(R, C.windup, C.damage, C.knockback, { wjCast: 'point', wjCrash: C.crash }, [[0.1, FLICK_COCK], [0.62, FLICK_COCK], [0.8, { ...FLICK, e: 'i' }], [2.0, FLICK]], { fixed: false })],
    },
    /** Point Blank: he is gone, behind the hero, Cast held at his palm: released point blank (a short red). */
    crimsonPalm: {
      label: 'Point Blank', phase: 2, weight: [0, 1.0, 1.2], cooldown: 8, band: [0, 9], recovery: 0.55, cat: 'spell', gapCloser: true,
      beats: [spell(R, P.windup, P.damage, P.knockback, { wjCast: 'palm', wjCrash: P.crash, wjBlink: { behind: P.behind } }, holdKeys(PALM_COCK, PALM, 0.78), { fixed: false, track: 0.85 })],
    },
    /** The Wrecking Knot: the knot dragged across the crossing along a line shown before it moves (16 m
     *  in 1.4 s), chewing a trench and every piece on its way, dragging the hero toward its path. */
    wreckingKnot: {
      label: 'The Wrecking Knot', phase: 2, weight: [0, 0.6, 0.45], cooldown: 14, band: [2, 40], recovery: 0.55, cat: 'spell',
      beats: [spell(R, Wk.windup, Wk.damage, Wk.knockback, { wjDraw: 'wreck', wjCrash: Wk.crash, sustain: { dur: Wk.time / 2, tick: 0.2 } }, [[0.1, FINGER], [0.28, FINGER_UP], [0.8, FINGER_UP], [1.0, { ...FINGER_DOWN, e: 'i' }], [2.0, FINGER_DOWN]], { track: Wk.fix })],
    },
    /** THE VIOLET NULL: blue and red over his fingers, merged (the long, loud cue; he does not move); the
     *  line fixed and shown on the road; then a 5 m line across the whole arena that erases what is on it. */
    violetNull: {
      label: 'Violet Null', phase: 2, weight: [0, 1.0, 1.0], cooldown: 24, band: [0, 46], recovery: 0.8, cat: 'spell',
      beats: [spell(R, Nl.windup, Nl.damage, Nl.knockback, { wjNull: 'line', sustain: { dur: Nl.contact, tick: 0.1 } }, [[0.1, GATHER], [0.5, GATHER], [0.82, MERGED], [0.92, MERGED], [1.0, { ...LINE, e: 'i' }], [2.0, LINE]], { track: Nl.fix })],
    },
    // ================================================================ phase 3, below 12 %
    /** THE LAST NULL: the cue longer, the line 7 m wide, turning a little (the way it turns shown first). */
    lastNull: {
      label: 'The Last Null', phase: 3, weight: [0, 0, 0.01], cooldown: 0, band: [0, 46], recovery: 1.2, cat: 'spell',
      beats: [spell(R, LN.windup, LN.damage, LN.knockback, { wjNull: 'last', sustain: { dur: LN.contact, tick: 0.1 } }, [[0.1, GATHER], [0.5, GATHER], [0.8, MERGED], [0.92, MERGED], [1.0, { ...LINE, e: 'i' }], [2.0, LINE]], { track: LN.fix })],
    },
  };
}
// THE PACE (the integration pass): a spell is one cue over a long windup, so out of its recovery he goes
// straight on with a blink opener (far: he is gone and behind the hero; near: a string), never another
// spell (WjSpells.weigh). Measured with veil.mjs PACE: without these the spells cost phase 2 a fifth of
// its cues a minute.
const L = (to, when, chance) => ({ to, when, chance });
const AFTER = (k = 1) => [
  L('everywhere', 'far', [0, 0, 0.55 * k]), L('passThrough', 'far', [0, 0.6 * k, 0.5 * k]), L('behindYou', 'far', [0.6 * k, 0.45 * k, 0.4 * k]),
  L('passThrough', 'mid', [0, 0.5 * k, 0.45 * k]), L('behindYou', 'mid', [0.55 * k, 0.4 * k, 0.4 * k]),
  L('fiveSides', 'near', [0, 0, 0.5 * k]), L('fourSides', 'near', [0, 0.5 * k, 0.4 * k]), L('threeCount', 'near', [0.55 * k, 0.4 * k, 0.3 * k]),
];
export const LINKS = {
  azureDraw: AFTER(), azureYank: AFTER(), crimsonCast: AFTER(), crimsonPalm: AFTER(), wreckingKnot: AFTER(),
  violetNull: AFTER(0.6), // (the signature lands; a breath more before the next)
};
