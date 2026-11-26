import * as THREE from 'three';
import { RESULT } from '../../../../combat/rules.js';
import { TUNING_MELEE } from '../tuningMelee.js';

// Bai Wuji's hands and feet (the MELEE AGENT's file; moves.js is the router: its header has the format
// and the rules). A man who does not take the hero seriously, then does: in phase 1 his hands never leave
// his pockets (kicks, a knee, the heel; `pocket` keeps the hands in), from phase 2 they come out.
// Exports:
//   moves(X)        → { name: move }   (X: the builders, moves.js; no import of moves.js: a cycle)
//   LINKS           { from: [link, ...] } his combo links for these moves (links.js format)
//   FIELDS          the beat fields this file's HANDLER owns (below)
//   create(d)       → the handler (WjMelee): the weight of every blow, Dark Spark, Everywhere's ghosts,
//                   the blink chase, the mercy for a hero who is down
// Every new beat or move field is prefixed `wj`. Every landed blow throws (knockback >= 2.5: R2).
//
// THE BEAT FIELDS (this handler's; core's `wjBlink` / `wjCrash` / blockPush / guardCost: moves.js):
//   wjWeight: 'light' | 'heavy' | 'huge'   the camera on a landed blow (fx.weight(kind)); a blocked one is
//              fx.weight('block'); either way the slide's dust (fx.shove). EVERY beat of this file has
//              one: it is what routes the beat to this handler.
//   wjSpark: 1 | 2       Dark Spark (1; 2: the doubled one's second, from behind): the charge on his fist
//              through the windup (fx.sparkCharge), the throw aimed through the scenery
//              (terrain.aimThrow), a miss buries the fist in whatever stands on its line (a sweep)
//   wjGhost: i           Everywhere's afterimage i: it stands at its place from the move's start
//              (fx.ghostStrike) until he comes out of it with the blow
//   wjQuake: 'axe' | 'stomp' | 'plant'   the blow's own world blow at its impact (TUNING.melee)
//
// FOLLOW (the strings): a blocked beat slides the hero wjWeight.blockPush (3.4 m), a landed one its
// knockback, so every later beat of a string either steps in up to `follow.close` m through its windup
// (brain.js close-in: arriving where its zone wants him at the impact) or blinks (`wjBlink`) to a side
// of him late in its windup, when the slide is mostly over, then closes the rest. The brain breaks a
// string off when its next beat cannot reach (brain.js "a string's next hit"): `strings` in
// tests/integration/veil.mjs counts the beats that reach a hero who blocks every one and one who is hit
// by every one.

/** The beat fields this handler owns (moves.js routes a beat with one of them here). */
export const FIELDS = Object.freeze(['wjWeight', 'wjSpark', 'wjGhost', 'wjQuake']);

const TM = TUNING_MELEE;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export function moves(X) {
  const { punch, kick, TELL, FRAGS, holdKeys, F, strikeKeys } = X;
  const { N, B, R } = TELL;
  const FOL = TM.follow, SP = TM.spark, EW = TM.everywhere;
  // ---- the hands in the pockets (phase 1): every key of the beat gets the pockets' hand fields
  const P0 = FRAGS.POCKETS ?? {};
  const IN = { rH: P0.rH, rP: P0.rP, lH: P0.lH, lP: P0.lP, sw: P0.sw };
  const IN_L = { lH: P0.lH, lP: P0.lP };
  const pocket = (beat, hands = IN) => (P0.rH ? { ...beat, keys: beat.keys.map(([u, p]) => [u, { ...p, ...hands }]) } : beat);
  /** A following beat: it steps in up to follow.close m through its windup (the slide of the last one). */
  const follows = (beat, extra = {}) => ({ ...beat, close: FOL.close, ...extra });
  /** A beat out of a step-blink to a side of the hero (late in the windup: the slide is mostly over). */
  const blinked = (beat, where, extra = {}) => ({ ...beat, wjBlink: { u: FOL.blinkU, ...where }, close: 1.6, track: 0.9, ...extra });
  const side = (s, r = FOL.blinkR) => ({ side: s, r });
  const STAND = FRAGS.STAND;

  /** The lazy step: no blow; he is at the hero's flank, hands in his pockets. */
  const lazy = (s) => ({
    feint: true, windup: 0.34, fixed: true, active: 0.05, close: 0, track: 0.95, wjWeight: 'light', wjBlink: { side: s, r: 2.3, u: 0.45 },
    keys: STAND ? [[0.3, STAND], [1.0, STAND], [2.0, STAND]] : [],
  });

  /** The stomp's keys: the knee drawn up through the windup, driven down at the impact. */
  const stompKeys = [[0.35, FRAGS.mlStompLift], [0.82, FRAGS.mlStompLift], [1.0, { ...FRAGS.mlStomp, e: 'i' }], [2.0, FRAGS.mlStomp]];
  /** Dark Spark's keys: the long wind-up held, the fist thrown straight through. */
  const sparkKeys = (cock = 0.86) => [[0.25, FRAGS.mlSparkCoil], [cock, FRAGS.mlSparkCoil], [1.0, { ...FRAGS.mlSpark, e: 'l' }], [1.6, { ...FRAGS.mlSpark, e: 'o' }], [2.0, FRAGS.mlSpark]];
  const spark = (windup, o = {}) => ({
    tell: R, windup, active: 0.1, damage: SP.damage, knockback: SP.knockback, wjCrash: SP.crash, blockPush: SP.blockPush,
    zone: { kind: 'line', r: 2.6, w: 1.1 }, part: 'fistR', track: 0.72, cock: 0.86, keys: sparkKeys(0.86), wjSpark: 1, wjWeight: 'huge', ...o,
  });

  return {
    // ================================================================ phase 1: THE BLINDFOLD
    /** Flick: a lazy front kick off the hip, the hands never leave his pockets. */
    flick: {
      label: 'Flick', phase: 1, weight: [2.2, 1.2, 0.8], cooldown: 2.6, band: [0, 3.6], recovery: 0.6, cat: 'single',
      beats: [pocket({ ...kick('front', N, 0.56, 15), knockback: 2.5, wjWeight: 'light' })],
    },
    /** Knee and Shove: a knee into the belly, then the sole of his foot pushes the hero away (normal, normal). */
    kneeShove: {
      label: 'Knee and Shove', phase: 1, weight: [1.6, 1.1, 0.7], cooldown: 4, band: [0, 3.2], recovery: 0.6,
      beats: [
        pocket({ ...kick('knee', N, 0.55, 14), knockback: 2.5, blockPush: 2.6, wjWeight: 'light' }),
        pocket(follows({ ...kick('front', N, 0.42, 16, { left: true }), knockback: 4.5, blockPush: 4.2, wjWeight: 'heavy' })),
      ],
    },
    /** Behind You: he is gone, and behind the hero, the heel already coming (blue; a guard holds from any side). */
    behindYou: {
      label: 'Behind You', phase: 1, weight: [1.4, 1.1, 0.9], cooldown: 5, band: [0, 10], recovery: 0.6, cat: 'closer', gapCloser: true,
      beats: [pocket({ ...kick('side', B, 0.72, 22, { flare: true }), knockback: 4.5, close: 0.6, track: 0.8, wjBlink: { behind: 1.8 }, wjWeight: 'heavy' })],
    },
    /** Three Count: a front kick, a round kick that follows the hero's slide, and from his flank a side
     *  kick (normal, normal, blue). */
    threeCount: {
      label: 'Three Count', phase: 1, weight: [1.8, 1.4, 1.0], cooldown: 4.5, band: [0, 3.4], recovery: 0.6, cat: 'string',
      beats: [
        pocket({ ...kick('front', N, 0.55, 14), knockback: 2.5, wjWeight: 'light' }),
        pocket(follows({ ...kick('round', N, 0.42, 15), knockback: 3, wjWeight: 'light' })),
        pocket(blinked({ ...kick('side', B, 0.52, 22, { flare: true }), knockback: 5, wjWeight: 'heavy' }, side(1))),
      ],
    },
    /** The Axe Heel: the leg up over his head and the heel down through the road (red: dodge). A crater;
     *  the pieces within 3 m shudder or topple. */
    axeHeel: {
      label: 'Axe Heel', phase: 1, weight: [1.2, 1.0, 0.8], cooldown: 6, band: [0, 3.4], recovery: 0.8, cat: 'area',
      beats: [pocket({ ...kick('axe', R, 0.8, 30), knockback: 6, ring: 2.6, groundMark: { kind: 'slam' }, wjQuake: 'axe', wjWeight: 'heavy' })],
    },
    /** The Lazy Step: no blow; he is simply at the hero's flank, hands in his pockets (his footwork). */
    lazyStep: {
      label: 'Lazy Step', phase: 1, weight: [1.3, 0.8, 0.5], cooldown: 4, band: [3.6, 14], recovery: 0.2, cat: 'closer', gapCloser: true,
      beats: [{ pick: [lazy(1), lazy(-1)] }],
    },
    /** Long Step: one step that is ten, a side kick through the hero (red: roll). */
    longStep: {
      label: 'Long Step', phase: 1, weight: [0.8, 0.8, 0.6], cooldown: 7, band: [2.4, 8], recovery: 0.8, cat: 'closer', gapCloser: true,
      beats: [pocket({ ...kick('side', R, 0.7, 30), knockback: 8, knockdown: true, close: 4.2, track: 0.6, wjCrash: true, wjWeight: 'heavy' })],
    },
    /** Open Palm (phase 2 on; the Lab and the suites call it in any phase): one palm to the chest that
     *  sends the hero flying (blue, the flare: a parry moment). */
    palm: {
      label: 'Open Palm', phase: 1, weight: [0, 1.2, 0.9], cooldown: 3.5, band: [0, 3.2], recovery: 0.65, cat: 'single',
      beats: [{ ...punch('palm', B, 0.62, 22, { flare: true }), knockback: 5, wjWeight: 'heavy' }],
    },
    /** Not Even Close: his counter (two cuts on the shell in a row, or out of his guard): a short palm, the
     *  other hand still in its pocket, that throws the hero 5 m (blue). */
    notEvenClose: {
      label: 'Not Even Close', phase: 1, weight: [0, 0, 0], counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [pocket({ ...punch('palm', B, 0.5, 20), knockback: 5, blockPush: 4, wjWeight: 'heavy' }, IN_L)],
    },
    /** Too Slow: his answer to a streak of guards, blows from every side (normal). */
    tooSlow: {
      label: 'Too Slow', phase: 1, weight: [0, 0, 0], counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.75,
      beats: [
        { ...kick('front', N, 0.6, 14, { track: 0.7 }), knockback: 2.5, wjWeight: 'light' },
        { ...kick('round', N, 0.48, 14), knockback: 2.5, flit: { r: 2.4 }, wjWeight: 'light' },
        { ...punch('hook', N, 0.48, 14), knockback: 2.5, flit: { r: 2.4 }, wjWeight: 'light' },
        { ...punch('uppercut', N, 0.48, 14), knockback: 3, flit: { r: 2.4 }, wjWeight: 'light' },
      ],
    },

    // ================================================================ phase 2: THE EYES (the hands come out)
    /** DARK SPARK: a long charged straight punch (red; sparks gather on the fist). 10 m, and the hero goes
     *  through the first piece behind him; a miss buries the fist in whatever stands on its line. */
    darkSpark: {
      label: 'Dark Spark', phase: 2, weight: [0, 1.0, 0.8], cooldown: 9, band: [0, 6], recovery: 0.9, cat: 'single',
      beats: [spark(SP.windup)],
    },
    /** Four Sides: a jab, then from his flank, from behind, from the other flank (normal, normal, blue,
     *  red); every beat after the first out of a blink (a guard holds from any side). */
    fourSides: {
      label: 'Four Sides', phase: 2, weight: [0, 1.6, 1.2], cooldown: 6, band: [0, 3.4], recovery: 0.7, cat: 'string',
      beats: [
        { ...punch('jab', N, 0.55, 14), knockback: 2.5, wjWeight: 'light' },
        blinked({ ...kick('round', N, 0.44, 15), knockback: 3, wjWeight: 'light' }, side(1)),
        blinked({ ...punch('cross', B, 0.46, 20), knockback: 3.5, wjWeight: 'heavy' }, { behind: FOL.blinkR }),
        blinked({ ...kick('side', R, 0.6, 28), knockback: 7, wjCrash: true, wjWeight: 'heavy' }, side(-1)),
      ],
    },
    /** Passing Through: he is at the hero's flank, then through him at a run, the arm out (blue, the flare). */
    passThrough: {
      label: 'Passing Through', phase: 2, weight: [0, 1.0, 0.9], cooldown: 7, band: [2.4, 12], recovery: 0.8, cat: 'closer', gapCloser: true,
      beats: [{
        tell: B, flare: true, windup: 0.74, active: 0.1, damage: 24, knockback: 6, wjCrash: true, zone: { kind: 'sector', r: 2.0, ang: 1.0 }, part: 'fistR',
        wjBlink: { side: 1, r: 4.2, u: 0.12 }, dash: { from: 0.5, to: 1.0, stop: 0.9, max: 5 }, close: 0, track: 0.85, cock: 0.72,
        keys: strikeKeys({ coil: FRAGS.mlLariatCoil, hit: FRAGS.mlLariat, cock: 0.72 }), wjWeight: 'heavy',
      }],
    },
    /** Rise and Plant: a rising knee, then both palms down on him and the road (normal, then red: a
     *  crater, and the hero planted on his back). */
    risePlant: {
      label: 'Rise and Plant', phase: 2, weight: [0, 1.1, 0.9], cooldown: 7, band: [0, 3.2], recovery: 0.85,
      beats: [
        { ...kick('knee', N, 0.55, 14), knockback: 2.5, blockPush: 2.4, wjWeight: 'light' },
        follows({
          tell: R, windup: 0.66, active: 0.12, damage: 30, knockback: 3, knockdown: true, zone: { kind: 'ring', r: 2.4, fwd: 0.5 }, ring: 2.4, part: 'palms',
          groundMark: { kind: 'slam' }, wjQuake: 'plant', track: 0.8, cock: 0.7, wjWeight: 'huge',
          keys: [[0.35, FRAGS.mlPlantHigh], [0.7, FRAGS.mlPlantHigh], [1.0, { ...FRAGS.mlPlant, e: 'i' }], [2.0, FRAGS.mlPlant]],
        }, { close: 3.4 }),
      ],
    },
    /** The Stomp: the knee up, the foot down through the road; a ring that throws everything loose out of
     *  it and cracks the crossing's bars (red). */
    stomp: {
      label: 'The Stomp', phase: 2, weight: [0, 1.0, 0.8], cooldown: 8, band: [0, 3.2], recovery: 0.85, cat: 'area',
      beats: [{
        tell: R, windup: 0.8, active: 0.14, damage: 26, knockback: 7, zone: { kind: 'ring', r: TM.stomp.ring }, ring: TM.stomp.ring, part: 'feet',
        close: 1.2, track: 0.5, cock: 0.82, groundMark: { kind: 'blast' }, wjQuake: 'stomp', keys: stompKeys, wjWeight: 'huge',
      }],
    },
    /** Two Hands: both palms into the chest: only a throw (normal, little damage, 8 m through the scenery). */
    twoHands: {
      label: 'Two Hands', phase: 2, weight: [0, 1.0, 0.9], cooldown: 6, band: [0, 3.0], recovery: 0.7, cat: 'single',
      beats: [{ ...punch('double', N, 0.6, 8), knockback: 8, wjCrash: 3.6, blockPush: 5.2, guardCost: 46, wjWeight: 'heavy' }],
    },
    /** The Feint: a flick that stops short, then the real blow, a palm (blue). Used rarely. */
    feintPalm: {
      label: 'The Feint', phase: 2, weight: [0, 0.35, 0.3], cooldown: 14, band: [0, 3.2], recovery: 0.7, cat: 'single',
      beats: [
        { feint: true, windup: 0.42, fixed: true, active: 0.05, close: 0.8, track: 0.9, wjWeight: 'light', keys: kick('front', N, 0.42, 0).keys.filter(([u]) => u <= 0.8) },
        { ...punch('palm', B, 0.56, 22, { flare: true }), knockback: 5, close: 1.4, wjWeight: 'heavy' },
      ],
    },

    // ================================================================ phase 3: THE MEASURELESS
    /** EVERYWHERE: he is gone; three afterimages stand round the hero and strike in turn (blue, blue,
     *  red), the real blow out of each (a guard holds from any side; the cues one at a time). */
    everywhere: {
      label: 'Everywhere', phase: 3, weight: [0, 0, 1.3], cooldown: 9, band: [0, 12], recovery: 0.8, cat: 'string', gapCloser: true,
      beats: [
        { ...kick('side', B, EW.windup[0], 22), knockback: 4, close: 1.0, track: 0.9, wjBlink: { at: EW.at[0], r: EW.r, u: 0.1 }, wjGhost: 0, wjWeight: 'heavy' },
        { ...kick('round', B, EW.windup[1], 22), knockback: 4, close: 1.2, track: 0.9, wjBlink: { at: EW.at[1], r: EW.r, u: 0.1 }, wjGhost: 1, wjWeight: 'heavy' },
        { ...punch('palm', R, EW.windup[2], 30), knockback: 7, wjCrash: true, close: 1.2, track: 0.9, wjBlink: { at: EW.at[2], r: EW.r, u: 0.1 }, wjGhost: 2, wjWeight: 'huge' },
      ],
    },
    /** Five Sides: five blows, each from another side of the hero (normal, blue, normal, blue, red). */
    fiveSides: {
      label: 'Five Sides', phase: 3, weight: [0, 0, 1.4], cooldown: 7, band: [0, 3.4], recovery: 0.75, cat: 'string',
      beats: [
        { ...punch('cross', N, 0.56, 15), knockback: 2.5, wjWeight: 'light' },
        blinked({ ...kick('round', B, 0.44, 18), knockback: 3, wjWeight: 'light' }, side(1)),
        blinked({ ...punch('hook', N, 0.42, 15), knockback: 3, wjWeight: 'light' }, { behind: FOL.blinkR }),
        blinked({ ...kick('front', B, 0.44, 18), knockback: 3.5, wjWeight: 'heavy' }, side(-1)),
        blinked({ ...kick('side', R, 0.58, 28), knockback: 7, wjCrash: true, wjWeight: 'huge' }, { at: 0, r: 2.2 }),
      ],
    },
    /** Dark Spark, Twice: the charged punch, and if it was dodged, the second from behind (red, red). */
    doubleSpark: {
      label: 'Dark Spark, Twice', phase: 3, weight: [0, 0, 0.9], cooldown: 12, band: [0, 6], recovery: 0.95, cat: 'single',
      beats: [
        spark(SP.windup, { stopOn: ['hit'] }),
        spark(SP.second.windup, { wjSpark: 2, wjBlink: { behind: SP.second.behind, u: 0.15 }, close: 1.0, cock: 0.7, keys: sparkKeys(0.7) }),
      ],
    },
  };
}

// ---------------------------------------------------------------- his combo links (and the choice)
const L = (to, when, chance) => ({ to, when, chance });
export const LINKS = {
  // phase 1: close, he strings; far, a blink opener; a guard held up, the shove or the heel
  flick: [L('threeCount', 'near', [0.3, 0.3, 0.3]), L('kneeShove', 'guarding', [0.35, 0.3, 0.25]), L('behindYou', 'far', [0.35, 0.3, 0.3])],
  lazyStep: [L('flick', 'near', [0.55, 0.3, 0.2]), L('kneeShove', 'near', [0.35, 0.3, 0.2]), L('axeHeel', 'near', [0.35, 0.3, 0.2])],
  behindYou: [L('threeCount', 'near', [0.3, 0.3, 0.3]), L('kneeShove', 'guarding', [0.3, 0.25, 0.25])],
  threeCount: [L('behindYou', 'far', [0.35, 0.3, 0.3]), L('axeHeel', 'guarding', [0.3, 0.25, 0.25]), L('lazyStep', 'mid', [0.3, 0.2, 0])],
  kneeShove: [L('behindYou', 'far', [0.35, 0.3, 0.3]), L('longStep', 'mid', [0.25, 0.2, 0.2])],
  axeHeel: [L('behindYou', 'far', [0.3, 0.3, 0.3]), L('flick', 'near', [0.25, 0.2, 0.2])],
  longStep: [L('flick', 'near', [0.25, 0.2, 0.2]), L('passThrough', 'far', [0, 0.3, 0.3])],
  palm: [L('passThrough', 'far', [0, 0.35, 0.35]), L('behindYou', 'far', [0.25, 0.3, 0.3])],
  // phase 2 - 3: guarding, the throw and the crusher; far, a blink opener; never the same move twice
  darkSpark: [L('fourSides', 'far', [0, 0.35, 0.35]), L('passThrough', 'far', [0, 0.3, 0.3])],
  fourSides: [L('twoHands', 'guarding', [0, 0.35, 0.35]), L('passThrough', 'far', [0, 0.3, 0.3]), L('darkSpark', 'mid', [0, 0.2, 0.2])],
  passThrough: [L('fourSides', 'near', [0, 0.3, 0.3]), L('risePlant', 'guarding', [0, 0.3, 0.3])],
  risePlant: [L('passThrough', 'far', [0, 0.3, 0.3])],
  stomp: [L('passThrough', 'far', [0, 0.35, 0.35]), L('fourSides', 'near', [0, 0.25, 0.25])],
  twoHands: [L('passThrough', 'far', [0, 0.4, 0.4]), L('darkSpark', 'mid', [0, 0.25, 0.25])],
  feintPalm: [L('passThrough', 'far', [0, 0.3, 0.3])],
  everywhere: [L('fiveSides', 'near', [0, 0, 0.3]), L('twoHands', 'guarding', [0, 0, 0.3])],
  fiveSides: [L('everywhere', 'far', [0, 0, 0.35]), L('risePlant', 'guarding', [0, 0, 0.3])],
  doubleSpark: [L('everywhere', 'far', [0, 0, 0.3])],
};

// ================================================================== THE HANDLER
/** The moves that answer a held guard (the throw, the crusher: BRIEF "guarding"). */
/** The hero's states that hold him (he cannot answer a blow in them). */
const OUT = new Set(['stagger', 'knockdown', 'guardBreak']);
const KD = 1.3; // s of the hero's knockdown (player.js TUNE.knockdownDur)
const VS_GUARD = new Set(['twoHands', 'risePlant', 'kneeShove', 'axeHeel']);

/**
 * WjMelee: the melee beats' own behaviour (the routing contract, untouched.js header; the hooks as in
 * spells.js). THE SURFACE others may read: `stats` { weights, blocks, spared, sparks: { landed, missed,
 * buried }, chases, ghosts }, `chaseT` (s to the next blink chase).
 */
export class WjMelee {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T?.melee ?? TM;
    this._o = { kind: 'blunt', by: 'boss', dx: NaN, dz: NaN, y: 1, src: -1, scar: true, falloff: 0 };
    this._v = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.stats = { weights: 0, blocks: 0, spared: 0, sparks: { landed: 0, missed: 0, buried: 0 }, chases: 0, ghosts: 0 };
    this.spark = null;
    this.chase = null;
    this.chaseT = 0;
    this.outT = 0;
    this.freeT = 9;
  }

  stop() {
    this.spark = null;
    this.chase = null;
  }

  // ---------------------------------------------------------------- every frame
  frame(dt) {
    try {
      this._frame(dt);
    } catch (err) {
      console.error('[untouched] melee frame', err);
    }
  }
  _frame(dt) {
    const d = this.d;
    this.chaseT = Math.max(0, this.chaseT - fin(dt));
    // Dark Spark: over without landing: the fist is buried in whatever stands on its line
    const S = this.spark;
    if (S) {
      const a = d.brain?.act;
      if (S.landed || d.mode === 'dying' || d.mode === 'dead') this.spark = null;
      else if (a !== S.a || S.b.done || (a && a.t > S.b.end + 0.02)) {
        this.spark = null;
        this._bury(S);
      }
    }
    if (this.chase) this._chaseFrame(dt);
    // the hero out of his own hands (staggered, guard broken, down): how long in a row (a gap under
    // `free` s does not end it)
    const p = this.game.player, M = this.T.mercy ?? TM.mercy;
    if (p && OUT.has(p.state)) {
      this.outT += fin(dt) + (this.freeT < M.free ? this.freeT : 0);
      if (this.freeT >= M.free) this.outT = fin(dt);
      this.freeT = 0;
    } else {
      this.freeT += fin(dt);
      if (this.freeT >= M.free) this.outT = 0;
    }
  }

  /** s the hero has left in the state that holds him now (0: he is his own). */
  _outLeft(p) {
    const t = fin(p.stateT, 0);
    if (p.state === 'stagger') return Math.max(0, fin(p.staggerLen, 0.4) - t);
    if (p.state === 'knockdown') return Math.max(0, KD - t);
    if (p.state === 'guardBreak') return Math.max(0, 0.45 + KD - t);
    return 0;
  }

  /** Should beat b (at u of its windup) be spared? (see beatMotion's MERCY) */
  _spare(b, u, D, p) {
    const M = this.T.mercy ?? TM.mercy;
    // s to its impact
    const cock = D.cock ?? 0.8;
    const left = u >= 1 ? 0 : u <= cock ? (1 - u) * fin(b.W, 0.5) + fin(b.H, 0) : (1 - u) * fin(b.W, 0.5);
    const outLeft = this._outLeft(p);
    if ((this.T.spareDown ?? true) && (p.state === 'knockdown' || p.state === 'guardBreak') && outLeft > left - 0.05) return true;
    if (!(M.lockCap > 0)) return false;
    // the stretch he would be out of his own hands at the impact, and what this blow adds to it
    let stretch = 0;
    if (OUT.has(p.state)) stretch = left - outLeft < M.free ? this.outT + left : 0;
    else if (this.outT > 0 && this.freeT + left < M.free) stretch = this.outT + this.freeT + left;
    return stretch > 0 && stretch + (D.knockdown ? KD : 0.4) > M.lockCap + 1e-3;
  }

  /** The missed Dark Spark's fist: a sweep of the line ahead of where it was thrown. */
  _bury(S) {
    const W = this.game.world, M = this.T.spark?.miss ?? TM.spark.miss;
    this.stats.sparks.missed++;
    const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);
    const ax = S.x + fx * 0.6, az = S.z + fz * 0.6, bx = S.x + fx * M.len, bz = S.z + fz * M.len;
    const o = this._o;
    o.kind = 'blunt';
    o.dx = fx;
    o.dz = fz;
    o.y = 1.1;
    o.falloff = 0;
    o.src = W?.destructibles?.swing?.() ?? -1;
    const n = W?.destructibles?.sweep?.(ax, az, bx, bz, M.halfW, M.power, o) ?? 0;
    if (n > 0) this.stats.sparks.buried++;
    this.d.fx?.sparkHit?.(ax, 1.2, az, fx, fz, false);
    this.d.fx?.weight?.('heavy', fx, fz);
  }

  // ---------------------------------------------------------------- a beat's motion (its windup and impact)
  beatMotion(b, u, s, dt) {
    try {
      this._beatMotion(b, u, s, dt);
    } catch (err) {
      console.error('[untouched] melee beatMotion', err);
    }
  }
  _beatMotion(b, u, s, dt) {
    const d = this.d, D = b.def, p = this.game.player;
    if (b.feint) return;
    // MERCY (the owner's rules): a beat is not thrown (it becomes a feint: no cue if it had none yet, no
    // blow) when at its impact the hero would still be DOWN, or when it would keep him out of his own
    // hands (staggered, down) for longer than `lockCap` s in a row (a string that lands blow after blow
    // leaves him a moment, `free` s, to answer the next)
    if (p && !b.struck && this._spare(b, u, D, p)) {
      b.feint = true;
      b.done = true;
      this.stats.spared++;
      return;
    }
    // Dark Spark: the charge gathers on his fist through the windup
    if (D.wjSpark && u < 1) d.fx?.sparkCharge?.(d, Math.max(0, Math.min(1, u)), 'R');
    // Everywhere: the afterimages wait at their places round the hero until each strikes
    if (D.wjGhost !== undefined && p?.position) {
      const a = d.brain?.act;
      for (const x of a?.beats ?? []) {
        if (x.feint || x.def.wjGhost === undefined || x._blinked || x.index < b.index) continue;
        const K = x.def.wjBlink ?? {};
        const yaw = fin(p.yaw) + fin(K.at, Math.PI), r = fin(K.r, 2);
        const gx = p.position.x + Math.sin(yaw) * r, gz = p.position.z + Math.cos(yaw) * r;
        const k = x === b ? Math.max(0, Math.min(1, u / Math.max(0.05, fin(K.u, 0.12)))) : 0.35;
        d.fx?.ghostStrike?.(gx, gz, Math.atan2(p.position.x - gx, p.position.z - gz), k);
      }
      if (b._blinked && !b._ghosted) {
        b._ghosted = true;
        this.stats.ghosts++;
      }
    }
    void s, dt;
  }

  /** The impact's own world blow (wjQuake); Dark Spark's hit flash. */
  onImpact(b, s, a) {
    try {
      this._onImpact(b, s, a);
    } catch (err) {
      console.error('[untouched] melee onImpact', err);
    }
  }
  _onImpact(b, s, a) {
    const d = this.d, D = b.def, W = this.game.world;
    if (D.wjSpark) this.spark = { b, a, landed: false, x: d.position.x, z: d.position.z, yaw: d.yaw };
    const Q = D.wjQuake;
    if (!Q || !W?.impact) return;
    const T = this.T[Q] ?? TM[Q] ?? {};
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), fwd = fin(D.zone?.fwd, Q === 'stomp' ? 0 : 0.6);
    const x = d.position.x + fx * fwd, z = d.position.z + fz * fwd;
    const o = this._o;
    o.kind = Q === 'stomp' ? 'blast' : 'blunt';
    o.dx = NaN;
    o.dz = NaN;
    o.y = 0.4;
    o.falloff = Q === 'stomp' ? 0.5 : 0.3;
    o.src = W.destructibles?.swing?.() ?? -1;
    W.impact(x, z, fin(T.r, 3), fin(T.power, 1), o);
    void s;
  }

  // ---------------------------------------------------------------- his blow on the hero
  /** Dark Spark's throw is aimed through the scenery (terrain.aimThrow) when a piece is near its way. */
  hitPlayer(o) {
    const D = o?.beat?.def, p = this.game.player;
    if (!D?.wjSpark || !p?.position) return o;
    let a = null;
    try {
      a = this.d.parts?.terrain?.aimThrow?.(p) ?? null;
    } catch (err) {
      console.error('[untouched] terrain.aimThrow', err);
    }
    const ax = fin(a?.dx ?? a?.x, NaN), az = fin(a?.dz ?? a?.z, NaN), l = Math.hypot(ax, az);
    if (!(l > 1e-3)) return o;
    // (only a way near his punch's own: within 60 degrees of straight on from him)
    const nx = p.position.x - this.d.position.x, nz = p.position.z - this.d.position.z, nl = Math.hypot(nx, nz) || 1;
    if ((ax * nx + az * nz) / (l * nl) < 0.5) return o;
    return { ...o, from: { x: p.position.x - (ax / l) * 2, z: p.position.z - (az / l) * 2 } };
  }

  /** After the blow: the camera's weight, the slide's dust, Dark Spark's flash, the blink chase. */
  onHit(o, r) {
    try {
      this._onHit(o, r);
    } catch (err) {
      console.error('[untouched] melee onHit', err);
    }
  }
  _onHit(o, r) {
    const d = this.d, p = this.game.player, D = o?.beat?.def;
    if (!p?.position || !D) return;
    const fx = d.fx;
    const sx = fin(o.from?.x, d.position.x), sz = fin(o.from?.z, d.position.z);
    let nx = p.position.x - sx, nz = p.position.z - sz;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (r === RESULT.HIT) {
      this.stats.weights++;
      fx?.weight?.(D.wjWeight ?? 'light', nx, nz);
      const kb = fin(o.knockback, 0);
      if (kb > 0.2) fx?.shove?.(p.position.x, p.position.z, nx, nz, kb);
      if (D.wjSpark) {
        if (this.spark) this.spark.landed = true;
        this.stats.sparks.landed++;
        this.d.tellPoint?.('fistR', this._v);
        fx?.sparkHit?.(fin(this._v.x, p.position.x), fin(this._v.y, 1.2), fin(this._v.z, p.position.z), nx, nz, true);
      }
      this._armChase(kb, nx, nz);
    } else if (r === RESULT.BLOCKED) {
      this.stats.weights++;
      this.stats.blocks++;
      fx?.weight?.('block', nx, nz);
      const bp = fin(o.extra?.blockPush, fin(D.blockPush, 0));
      if (bp > 0.2) fx?.shove?.(p.position.x, p.position.z, nx, nz, bp);
    }
  }

  // ---------------------------------------------------------------- the blink chase (phase 3)
  _armChase(kb, nx, nz) {
    const C = this.T.chase ?? TM.chase, d = this.d;
    if (d.phase < 3 || kb < C.minKb || this.chaseT > 0 || this.chase) return;
    if (!(Math.random() < C.chance)) return;
    this.chase = { t: 0, nx, nz };
  }

  _chaseFrame(dt) {
    const C = this.T.chase ?? TM.chase, d = this.d, p = this.game.player, K = this.chase;
    K.t += fin(dt);
    if (!p?.alive || K.t > 2.2 || d.mode === 'dying' || d.mode === 'dead' || d.mode === 'broken') {
      this.chase = null;
      return;
    }
    // (wait for his slide to be nearly over, and for himself to be back on his feet)
    const sp = Math.hypot(fin(p.kb?.x), fin(p.kb?.z));
    if (K.t < C.settle || sp > 2.2 || d.mode !== 'foot') return;
    const decay = 6;
    const ex = p.position.x + fin(p.kb?.x) / decay, ez = p.position.z + fin(p.kb?.z) / decay;
    let tx = ex + K.nx * C.off, tz = ez + K.nz * C.off;
    if (d.standable && !d.standable(tx, tz)) {
      tx = ex + K.nz * C.off;
      tz = ez - K.nx * C.off;
      if (!d.standable(tx, tz)) {
        this.chase = null;
        return;
      }
    }
    this.chase = null;
    this.chaseT = C.cooldown;
    this.stats.chases++;
    d.blinkTo?.(tx, tz, p.position);
  }

  // ---------------------------------------------------------------- the choice
  /** A held guard draws the throw and the crusher. */
  weigh(name, def, w, dist) {
    void def, dist;
    if (VS_GUARD.has(name) && this.game.player?.blocking) return w * 2.2;
    return w;
  }
}

export const create = (d) => new WjMelee(d);
