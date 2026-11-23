import { lookOf } from '../../duelist/lookSwitch.js';
import { signKeys } from './melee.js';

// Tian Lei's ki moves, the beams (MOVES.md: Rising Tide, the sweeping tide, Twin Tide, Heaven-Splitting Tide). THE BEAM AGENT'S FILE.
//
// A move file is a function of the builders object `X` (ascendant/moves.js header: punch, kick, elbow,
// shoulder, strikeKeys, F, mirror, W, TELL, TUNING ...) returning { name: move }. A move (or one beat of
// a string) marked `ki: '<kind>'` has its hooks routed through ki.js to this agent's class (kiBeam.js
// BeamMoves): every kind here starts with 'beam'.
//
// A beam beat (beamBeat below) is a LINE zone the length and width of the beam, `sustain`ed for its lit
// window (the cue ledger holds the whole window as one interval) and `selfHit` (duelist/brain.js: the
// brain cues, flashes and holds it; BeamMoves tests the strip and deals the first contact and the
// ticks itself). `fixed` windups (a beam is its own pace in every form), `track: 0` (BeamMoves aims:
// at the hero until the line is fixed at the cue), `close: 0` (he stands where he is).
// `beam: { kind, side }` tells BeamMoves which beam it is: kind 'rising' | 'sweep' | 'twin' | 'great'
// (tuningBeam.js), side 'R' (the right palm thrusts: the default) | 'L' | 'both'.
//
// THE TECHNIQUE (BRIEF2, the lead's call: NOT cupped hands at the hip): turned side-on, the rear palm
// drawn back at the ribs where the light gathers (fx.beamCharge sits in it), the lead hand held out
// along the line, sighting; then the palm thrust out on a lunge (the great beam: both palms together).
// The thrust is HELD through the lit window, then he comes back to his guard.
//
// THE CUPPED HANDS (the fourth wave, an OPTION: `?ascBeamPose=cup`, read once as the moves are built;
// default '0' = the palm thrust above, as shipped): every beam is charged with BOTH hands cupped together
// at the hip (the right hip; Twin Tide's second beam the left), the light gathering between the palms
// (`beam.cup`: kiBeam.js draws fx.beamCharge, the sighting thread and the beam's origin at 'palms'),
// then both palms thrust forward together and held; the great beam's clash held with both cupped hands
// forward. Same timings, zones and tells: only the keys and where the light is drawn change.
// Instant Wave (`instantWave`, form 3) always uses the cupped hands: it IS that technique.
export const BEAM_POSE = lookOf('ascBeamPose', '0');

export function beamMoves(X) {
  const { TELL: { R, B }, TUNING, F, mirror, feet: { OR, LOW, LUNGE } } = X;
  const T = TUNING.beam;
  const CUP = BEAM_POSE === 'cup';

  // ---------------------------------------------------------------- the key poses (right-side authoring)
  // the weight settles back, the rear hand starts back
  const SETTLE = { yaw: -0.5, bY: -0.22, pitch: 0.04, hip: -0.08, rH: [0.06, -0.12, 0.08], rP: [-0.8, -0.6, -0.3], lH: [0.0, 0.08, 0.4], lP: [0.8, -0.6, -0.1], ...OR };
  // drawn: side-on, sunk, the rear palm at the ribs (turned up, cupping the light), the lead arm out straight
  // along the line at the shoulder's height, the eyes down it
  const GATHER = {
    yaw: -0.95, bY: -0.3, pitch: 0.06, hip: -0.16, spY: -0.1, roll: 0.03,
    rH: [0.04, -0.3, -0.16], rP: [-0.9, -0.5, -0.5], lH: [-0.1, 0.06, 0.58], lP: [0.6, -0.8, 0.0], ...LOW,
  };
  // the gather tightened just before it goes: the rear palm drawn a little further, the lead hand steady
  const COCKED = { ...GATHER, yaw: -1.02, bY: -0.33, rH: [0.06, -0.3, -0.2] };
  // the thrust: the hips turned over, the rear palm driven straight out where the lead hand pointed,
  // the lead hand pulled back to the hip
  const THRUST = {
    yaw: 0.22, bY: -0.3, bZ: 0.2, pitch: 0.1, hip: 0.16, spY: 0.06,
    rH: [0.08, 0.02, 0.6], rP: [-0.8, -0.3, -0.3], lH: [-0.04, -0.16, 0.06], lP: [0.8, -0.6, -0.4], ...LUNGE,
  };
  // both palms (the great beam): square, sunk, both heels of the hands driven out together
  const GATHER2 = { ...GATHER, bY: -0.36, rH: [0.06, -0.3, -0.18] };
  const THRUST2 = {
    yaw: 0.0, bY: -0.34, bZ: 0.22, pitch: 0.12, hip: 0, spY: 0,
    rH: [0.13, 0.0, 0.58], lH: [-0.13, 0.0, 0.58], rP: [-0.8, -0.3, -0.3], lP: [0.8, -0.3, -0.3], ...LUNGE,
  };

  // ---- the cupped hands (right-side authoring: the hands meet at his right hip)
  // the hands come together before him on the way down to the hip, the weight settling
  const CUP_SETTLE = { yaw: -0.36, bY: -0.2, pitch: 0.04, hip: -0.06, rH: [0.1, -0.22, 0.14], rP: [-0.8, -0.5, -0.4], lH: [-0.22, -0.18, 0.2], lP: [0.7, -0.5, -0.4], ...OR };
  // drawn: turned away, sunk wide, both hands cupped together at the right hip (the light between the
  // palms), the elbows back, the eyes on the hero over the lead shoulder
  const CUP_GATHER = {
    yaw: -0.8, bY: -0.32, pitch: 0.08, hip: -0.14, spY: -0.12, roll: 0.03,
    rH: [0.09, -0.44, 0.1], rP: [-0.9, -0.2, -0.7], lH: [-0.34, -0.42, 0.14], lP: [0.5, -0.4, -0.8], ...LOW,
  };
  // tightened before it goes: drawn a little further back and down
  const CUP_COCKED = { ...CUP_GATHER, yaw: -0.88, bY: -0.35, rH: [0.09, -0.45, 0.06], lH: [-0.34, -0.43, 0.1] };
  // the thrust: the hips turned square, both palms driven out together, wrists touching, at the chest
  const CUP_THRUST = {
    yaw: 0.0, bY: -0.32, bZ: 0.22, pitch: 0.12, hip: 0, spY: 0,
    rH: [0.115, 0.0, 0.6], lH: [-0.115, 0.0, 0.6], rP: [-0.8, -0.3, -0.3], lP: [0.8, -0.3, -0.3], ...LUNGE,
  };
  const cupKeys = (side = 'R') => {
    const m = side === 'L' ? mirror : (p) => p;
    return [
      [0.12, F(m(CUP_SETTLE))],
      [0.45, F(m(CUP_GATHER))],
      [0.9, F(m(CUP_COCKED))],
      [1.0, { ...F(m(CUP_THRUST)), e: 'i' }],
      [1.96, F(m({ ...CUP_THRUST, bZ: CUP_THRUST.bZ - 0.03 }))],
    ];
  };

  /**
   * A beam's keys over u (0..1 the windup, 1..2 the lit window): settle, draw back and sight, tighten,
   * the thrust at the impact HELD to the end of the lit window. `left`: the other palm (the mirror).
   * `cup`: the cupped hands (above) instead.
   */
  const beamKeys = (side = 'R', cup = CUP) => {
    if (cup) return cupKeys(side);
    const m = side === 'L' ? mirror : (p) => p;
    const both = side === 'both';
    const G = both ? GATHER2 : GATHER, C = both ? { ...GATHER2, bY: -0.39 } : COCKED, H = both ? THRUST2 : THRUST;
    return [
      [0.12, F(m(SETTLE))],
      [0.45, F(m(G))],
      [0.9, F(m(C))],
      [1.0, { ...F(m(H)), e: 'i' }],
      [1.96, F(m({ ...H, bZ: H.bZ - 0.03 }))],
    ];
  };
  /** The pose he holds his beam in through THE CLASH (kiBeam.js compiles it round each form's stance). */
  const CLASH_POSE = F({ ...THRUST2, bY: -0.4, bZ: 0.26, pitch: 0.16, rF: [-0.24, -0.5], lF: [0.22, 0.5] });
  /** ... with the cupped hands: both palms forward together, wrists touching. */
  const CLASH_CUP = F({ ...CUP_THRUST, bY: -0.4, bZ: 0.26, pitch: 0.16, rH: [0.11, 0.02, 0.56], lH: [-0.11, 0.02, 0.56], rF: [-0.24, -0.5], lF: [0.22, 0.5] });

  /** One beam beat: kind = a tuningBeam.js block; o: beat overrides (side, tell, windup, flare ...). */
  const beamBeat = (kind, o = {}) => {
    const C = T[kind];
    const { side = 'R', cup = CUP, windup = C.windup ?? C.charge, ...extra } = o;
    return {
      tell: R, windup, fixed: true, active: T.active,
      damage: C.first.damage, knockback: C.first.knockback, knockdown: true,
      zone: { kind: 'line', r: C.len, w: C.w }, part: cup || side === 'both' ? 'palms' : side === 'L' ? 'fistL' : 'fistR',
      close: 0, track: 0, cock: 0.9, selfHit: true, hazard: true,
      sustain: { dur: Math.max(0.05, C.lit - T.active), tick: T.tick },
      beam: cup ? { kind, side, cup: true } : { kind, side },
      keys: beamKeys(side, cup),
      ...extra,
    };
  };

  // ---- Instant Wave (the fourth wave): THE SIGN, gone, and beside the hero a cupped-hands beam point
  // blank. The sign (two fingers to the brow: moves/melee.js signKeys' poses) to u `signAt`, the vanish
  // (ascendant.js beatMotion `blink: { at, r, sign, signAt }`), he arrives already cupped at the hip; the
  // light gathers between the palms; the line is fixed at `fix` (the red cue's moment) and both palms go.
  // The windup after the arrival is (1 - signAt) x windup >= 0.8 s (tests BEAMS: the cue is fair).
  const IN = T.instant;
  const instantKeys = () => {
    const sk = signKeys(X, { coil: CUP_SETTLE, hit: CUP_THRUST, cock: 0.72 });
    const rise = sk[0][1], held = sk[1][1], s0 = IN.signAt;
    return [
      [s0 * 0.36, rise],
      [s0 * 0.96, held],
      [s0 + 0.02, F(CUP_GATHER)],
      [0.78, F({ ...CUP_GATHER, bY: -0.34 })],
      [0.93, F(CUP_COCKED)],
      [1.0, { ...F(CUP_THRUST), e: 'i' }],
      [1.96, F({ ...CUP_THRUST, bZ: CUP_THRUST.bZ - 0.03 })],
    ];
  };
  /** One side of Instant Wave: he arrives at the hero's `sgn` side (`at` round from the hero's facing). */
  const instantBeat = (sgn) => ({
    ...beamBeat('instant', { cup: true, windup: IN.windup }),
    blink: { at: sgn * IN.at, r: IN.r, sign: true, signAt: IN.signAt },
    keys: instantKeys(),
  });

  return {
    /** Rising Tide (form 1): the palm thrust, a beam 16 x 1.6 m on a line fixed at the cue. */
    risingTide: {
      label: 'Rising Tide', phase: 1, weight: [1.6, 0, 0], cooldown: 11, band: [4, 15], recovery: 0.6, cat: 'hazard', ki: 'beam',
      beats: [beamBeat('rising')],
    },
    /** Rising Tide, sweeping (forms 2 - 3): 20 x 2 m, dragged up to 40 deg toward the side the hero is on. */
    tideSweep: {
      label: 'Rising Tide, sweeping', phase: 2, weight: [0, 1.3, 0.7], cooldown: 13, band: [5, 16], recovery: 0.6, cat: 'hazard', ki: 'beamSweep',
      beats: [beamBeat('sweep')],
    },
    /** Twin Tide (form 3): a one-handed beam, then the other palm's aimed where the hero is heading. */
    twinTide: {
      label: 'Twin Tide', phase: 3, weight: [0, 0, 1.0], cooldown: 12, band: [5, 15], recovery: 0.55, cat: 'hazard', ki: 'beamTwin',
      beats: [beamBeat('twin', { windup: T.twin.windup[0] }), beamBeat('twin', { side: 'L', windup: T.twin.windup[1], cock: 0.85 })],
    },
    /** Heaven-Splitting Tide (form 3, the great spell): he vanishes to the ring's far edge, charges 2.4 s
     *  (the light of the ring dims, stones rise), then both palms: 26 x 3.4 m for 2.2 s, sweeping after
     *  the hero. Its head is a blue parry moment: a PERFECT parry starts THE CLASH (kiBeam.js). */
    heavenTide: {
      label: 'Heaven-Splitting Tide', phase: 3, weight: [0, 0, 1.6], cooldown: 35, band: [0, 16], recovery: 0.9, cat: 'hazard', ki: 'beamGreat',
      clashPose: CUP ? CLASH_CUP : CLASH_POSE,
      beats: [beamBeat('great', { side: 'both', tell: B, flare: true, lock: true, blink: { edge: true }, cock: 0.92 })],
    },
    /** Instant Wave (form 3, the fourth wave): two fingers to the brow, he is gone and BESIDE the hero
     *  (4 m off to a side, not behind), both hands cupped at the hip: a red beam point blank (12 x 1.6 m),
     *  fixed and cued >= 0.8 s after he arrives. Roll (or run) out of the line. Always the cupped hands. */
    instantWave: {
      label: 'Instant Wave', phase: 3, weight: [0, 0, 0.9], cooldown: 16, band: [3, 14], recovery: 0.6, cat: 'hazard', ki: 'beamInstant',
      beats: [{ pick: [instantBeat(1), instantBeat(-1)] }],
    },
  };
}
