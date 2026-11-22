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
export function beamMoves(X) {
  const { TELL: { R, B }, TUNING, F, mirror, feet: { OR, LOW, LUNGE } } = X;
  const T = TUNING.beam;

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

  /**
   * A beam's keys over u (0..1 the windup, 1..2 the lit window): settle, draw back and sight, tighten,
   * the thrust at the impact HELD to the end of the lit window. `left`: the other palm (the mirror).
   */
  const beamKeys = (side = 'R') => {
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

  /** One beam beat: kind = a tuningBeam.js block; o: beat overrides (side, tell, windup, flare ...). */
  const beamBeat = (kind, o = {}) => {
    const C = T[kind];
    const { side = 'R', windup = C.windup ?? C.charge, ...extra } = o;
    return {
      tell: R, windup, fixed: true, active: T.active,
      damage: C.first.damage, knockback: C.first.knockback, knockdown: true,
      zone: { kind: 'line', r: C.len, w: C.w }, part: side === 'L' ? 'fistL' : side === 'both' ? 'palms' : 'fistR',
      close: 0, track: 0, cock: 0.9, selfHit: true, hazard: true,
      sustain: { dur: Math.max(0.05, C.lit - T.active), tick: T.tick },
      beam: { kind, side },
      keys: beamKeys(side),
      ...extra,
    };
  };

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
      clashPose: CLASH_POSE,
      beats: [beamBeat('great', { side: 'both', tell: B, flare: true, lock: true, blink: { edge: true }, cock: 0.92 })],
    },
  };
}
