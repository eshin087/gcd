// Private choreography for the motion audition. The owner's reference keeps a
// soft elbow and lets the torso carry the free hand; it does not clasp the wrist
// and then throw sword fingers behind the shoulder on each light.
import { P } from '../../entities/player/anim.js';
import { clamp, smoothstep } from '../../core/math.js';
import { createFreeArm } from './freeArm.js';

// Chest-local, shoulder-relative metres. Low flowing counterbalance; a free arm
// may follow the chest through the cut instead of holding a raised fixed guard.
const FREE = {
  fallingCut: [[0.03, -0.34, 0.16], [0.14, -0.38, -0.12]],
  drawCut: [[0.025, -0.37, 0.11], [0.17, -0.34, -0.10]],
  risingSlash: [[-0.01, -0.35, 0.13], [0.14, -0.41, -0.10]],
  risingBackhand: [[0.12, -0.38, 0], [0.07, -0.31, 0.20]],
  flatBackhand: [[0.12, -0.34, 0.04], [0.10, -0.33, 0.17]],
  fallingBackhand: [[0.10, -0.37, 0.08], [0.12, -0.31, 0.19]],
  whirl: [[0.04, -0.34, 0.14], [0.12, -0.37, 0.02]],
  risingWhirl: [[0.03, -0.33, 0.15], [0.12, -0.36, 0.06]],
  lowSweep: [[0.03, -0.27, 0.20], [0.13, -0.28, 0.15]],
  lunge: [[0.04, -0.33, 0.16], [0.17, -0.36, -0.13]],
  risingThrust: [[0.07, -0.34, 0.12], [0.16, -0.36, -0.09]],
  sprintSlash: [[0.07, -0.40, 0.03], [0.14, -0.40, -0.12]],
  rollCut: [[0.07, -0.31, 0.17], [0.14, -0.35, -0.08]],
};
const TWO = new Set(['slam', 'heavyCrush', 'heavyRise', 'heavySpin', 'cleave']);
const HAND_CHANNELS = [P.lH, P.lH + 1, P.lH + 2, P.lP, P.lP + 1, P.lP + 2,
  P.lD, P.lD + 1, P.lD + 2, P.lN, P.lN + 1, P.lN + 2, P.hs, P.lk, P.twoHand];
const mix = (a, b, k) => a + (b - a) * k;
const ease = (a, b, t) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };

export function createAttackMotion() {
  const paths = new WeakMap();
  const freeArm = createFreeArm();
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
    const breath = Math.sin(A.time * Math.PI * 2 / 3.7);
    const hx = 0.075;
    const hy = -0.45 + 0.008 * breath;
    const hz = 0.065;

    for (let i = 0; i < 3; i++) {
      const start = entry ? entry[i] : F[P.lH + i];
      let v;
      if (hand) {
        // Filled by the torso-relative path below, retaining the solved entry.
        v = start;
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
      const restPole = i === 0 ? 0.36 : i === 1 ? -0.25 : -0.9;
      p[P.lP + i] = mix(mix(F[P.lP + i], pole, gather), restPole, home);
      p[P.lD + i] = F[P.lD + i] * (1 - gather);
      p[P.lN + i] = F[P.lN + i] * (1 - gather);
    }
    p[P.lk] = F[P.lk] * (1 - ease(0, W * 0.6, t));
    p[P.hs] = F[P.hs] * (1 - gather);
    if (hand) freeArm(p, A, hand);

    if (two && t < W) {
      // Gather first; close the supporting hand as it reaches the hilt, before
      // the active frames. In v3 the falling heavy already had full grip at .4W.
      const carry = A.temperedEntry?.chainedHeavy;
      p[P.twoHand] = mix(F[P.twoHand], 1, ease(carry ? 0 : W * 0.16, W * (carry ? 0.94 : 0.86), t));
      // Give the cross-body raise room in front of the chest. This offset is
      // gone before the active phase, so its cutting path remains the same.
      if (!carry && (clip === 'heavyCrush' || clip === 'slam')) {
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
