// Private choreography for the motion audition. The owner's reference keeps a
// soft elbow and lets the torso carry the free hand; it does not clasp the wrist
// and then throw sword fingers behind the shoulder on each light.
import { P } from '../../entities/player/anim.js';
import { clamp, smoothstep } from '../../core/math.js';

// Shoulder-relative metres: gather, then counterbalance. Keep the elbow bent and
// the palm away from the belt. Alternating cuts share nearby hand positions.
const FREE = {
  fallingCut: [[0.025, -0.19, 0.27], [0.20, -0.26, -0.06]],
  drawCut: [[0.025, -0.23, 0.29], [0.20, -0.23, -0.04]],
  risingSlash: [[-0.025, -0.18, 0.28], [0.18, -0.32, -0.08]],
  risingBackhand: [[0.15, -0.27, 0.12], [0.20, -0.25, 0.10]],
  flatBackhand: [[0.10, -0.21, 0.22], [0.23, -0.23, 0.03]],
  fallingBackhand: [[0.04, -0.21, 0.24], [0.21, -0.25, 0.08]],
  whirl: [[0.015, -0.23, 0.25], [0.22, -0.25, 0.06]],
  risingWhirl: [[0.01, -0.24, 0.25], [0.21, -0.28, 0.04]],
  lowSweep: [[-0.02, -0.15, 0.28], [0.19, -0.18, 0.10]],
  lunge: [[0.04, -0.22, 0.24], [0.21, -0.28, 0.02]],
  // Keep the sweep's counterbalance while the torso unwinds into this thrust;
  // pulling the hand forward at the same time made that entry change too fast.
  risingThrust: [[0.16, -0.24, 0.12], [0.20, -0.29, 0.02]],
  sprintSlash: [[0.12, -0.30, 0.02], [0.18, -0.33, -0.08]],
  rollCut: [[0.06, -0.25, 0.26], [0.19, -0.31, -0.05]],
};
const TWO = new Set(['slam', 'heavyCrush', 'heavyRise', 'heavySpin', 'cleave']);
const HAND_CHANNELS = [P.lH, P.lH + 1, P.lH + 2, P.lP, P.lP + 1, P.lP + 2,
  P.lD, P.lD + 1, P.lD + 2, P.lN, P.lN + 1, P.lN + 2, P.hs, P.lk, P.twoHand];
const mix = (a, b, k) => a + (b - a) * k;
const ease = (a, b, t) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };

export function createAttackMotion() {
  const paths = new WeakMap();
  return (p, A) => {
    const d = A.def, clip = (A.atkDef === d ? A.atkAnim : d?.anim)?.clip;
    const hand = FREE[clip], two = TWO.has(clip);
    if (!d || (!hand && !two)) return;
    const F = A.from, entry = A.temperedEntry?.hand;
    const t = A.t, W = d.windup, end = W + d.active, R = d.recovery;
    const gather = smoothstep(0, W * 0.9, t);
    // Keep the follow-through through the real input-buffer boundary. Return
    // only if the player lets this swing finish instead of chaining another.
    const home = ease(end + R * 0.34, end + R, t);
    const fight = clamp(A.fightW, 0, 1), breath = Math.sin(A.time * Math.PI * 2 / 3.7);
    const hx = mix(0.085, 0.015, fight);
    const hy = mix(-0.45 + 0.009 * breath, -0.24 + 0.006 * breath, fight);
    const hz = mix(0.105 + 0.008 * Math.sin(A.time * 0.8), 0.27, fight);

    for (let i = 0; i < 3; i++) {
      const start = entry ? entry[i] : F[P.lH + i];
      let v;
      if (hand) {
        // Overlapping envelopes make one continuous arc, with no stop at the
        // coil. The next hit starts from the solved hand, not a hidden IK target.
        const open = smoothstep(W * 0.65, end + R * 0.12, t);
        v = mix(mix(start, hand[0][i], gather), hand[1][i], open);
        p[P.twoHand] = F[P.twoHand] * (1 - ease(0, W * 0.8, t));
      } else {
        const nearGrip = i === 0 ? -0.07 : i === 1 ? -0.20 : 0.30;
        v = mix(start, nearGrip, gather);
      }
      const rest = i === 0 ? hx : i === 1 ? hy : hz;
      p[P.lH + i] = mix(v, rest, home);
      // A dropped elbow throughout the gather and release. The existing IK
      // still solves the exact hilt contact while two-handed.
      const pole = i === 0 ? 0.45 : i === 1 ? -0.72 : -0.48;
      const restPole = i === 0 ? mix(0.36, 0.4, fight) : i === 1 ? mix(-0.25, -0.86, fight) : mix(-0.9, -0.3, fight);
      p[P.lP + i] = mix(mix(F[P.lP + i], pole, gather), restPole, home);
      p[P.lD + i] = F[P.lD + i] * (1 - gather);
      p[P.lN + i] = F[P.lN + i] * (1 - gather);
    }
    p[P.lk] = F[P.lk] * (1 - ease(0, W * 0.6, t));
    p[P.hs] = F[P.hs] * (1 - gather);

    if (two && t < W) {
      // Gather first; close the supporting hand as it reaches the hilt, before
      // the active frames. In v3 the falling heavy already had full grip at .4W.
      p[P.twoHand] = mix(F[P.twoHand], 1, ease(W * 0.16, W * 0.86, t));
      // Give the cross-body raise room in front of the chest. This offset is
      // gone before the active phase, so its cutting path remains the same.
      if (clip === 'heavyCrush' || clip === 'slam') {
        const arc = Math.sin(Math.PI * clamp(t / (W - 1 / 30), 0, 1)) ** 2;
        p[P.rH + 2] += 0.10 * arc;
      }
    }
    // These channels have their own entry path; a second animator cross-fade
    // would slow the hand twice and then catch it up abruptly at blendDur.
    if (A.pathCh) {
      let ch = paths.get(A.pathCh);
      if (!ch) { ch = [...new Set([...A.pathCh, ...HAND_CHANNELS])]; paths.set(A.pathCh, ch); }
      A.pathCh = ch;
    }
  };
}
