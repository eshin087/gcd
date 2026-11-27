import { lookOf } from '../duelist/lookSwitch.js';
import { DIM } from '../../player/model.js';

// Lu Wusheng's form (ADR-252; `?sheathForm=a`, '0' = as before, the default until the owner picks from the
// films). The motion audit (tests/integration/sheath.mjs `form`, sheathAudit.mjs) measured at each impact:
//   - his thrusts (the pommel, the scabbard's butt) landed on a bent arm, the elbow 121 - 124°, the scabbard
//     24° off the line of the arm (a punch that misses its own fist); The Walking Staff's long lunge on two
//     locked knees (176 / 176°)
//   - every draw ended in a straight-legged split (both knees 176°: the feet set wider than his legs reach)
//     with the cut's arm short (elbow 129 - 141°); through the draw his scabbard hand went FORWARD 26 - 51 cm
//     (the hips turning through carried it), where an iai draw pulls the scabbard back as the blade leaves
//     (saya-biki); at the cock his right fist sat 11 - 13 cm off the hilt
//   - the two-handed overhead came straight down (the point's path 75 - 87° off level: one upright bar at
//     the game camera)
//   - Sweeping the Road turned his hips a full circle over feet that stayed put: the legs crossed (-0.86 m)
//     and a knee popped (0.62 m a frame²)
//   - the free hand in the scabbard cuts swung 0.5 m from the chest to behind his hip inside the strike
// The form replaces only POSES (the beats' keys, the moves' recovery keys): every windup, impact, cue, zone
// and root motion is as before (sheath.mjs FORM checks it).
export const formOn = () => lookOf('sheathForm', '0') !== '0';

const ANK = DIM.ankle;

/** The sword hand on the weapon's own line out of the shoulder: [az, el] in body space, `r` m out (a
 *  thrust: the arm long behind the scabbard, opened past ARM_SOFT by TUNING.form.armSoft). */
export const reachLine = (az, el, r) => [Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r - 0.02, Math.cos(az) * Math.cos(el) * r];

/** A lunge's feet round the hips at `bZ`: the front shin upright over its foot (the knee ~100 - 120°), the
 *  back leg long behind (~155 - 170°), as far as his legs reach at a lunge's depth. */
export const lungeFeet = (bZ, front = 0.44, back = 0.74) => ({ rF: [-0.1, bZ + front], lF: [0.2, bZ - back], rK: [-0.15, 0, 1], lK: [0.35, -0.3, 0.9], rFy: -0.1, lFy: 0.9 });

/**
 * The form's keys for a beat or a recovery, from the authored ones: a pose is recognised by the fragment it
 * was spread from (the arrays are shared, so `k.lsw === F.CUT_END.lsw` marks every cut end), and only the
 * fields that were wrong are replaced. `F` the authored fragments, `G` the form's (moves.js).
 */
export function makeFormKeys(F, G) {
  const isEnd = (k) => k.lsw === F.CUT_END.lsw;
  const isSettle = (k) => k.rH === F.SETTLE.rH;
  const isLow = (k) => k.rH === F.LOW_SETTLE.rH;
  return function formKey(u, k, b) {
    let o = k;
    // the draw: the right fist on the hilt in the settle and the cock; the scabbard pulled back and a real
    // lunge at the cut's end (and through the flick that starts the re-sheathe)
    if (isSettle(k)) o = { ...o, ...G.SETTLE_HANDS };
    else if (isLow(k)) o = { ...o, ...G.LOW_HANDS };
    else if (isEnd(k)) {
      const bZ = k.bZ ?? 0.14;
      const up = k.sw?.[1] > 1; // (a rising draw ends higher, on a shorter stance)
      o = { ...o, ...G.END, ...lungeFeet(Math.min(bZ, 0.2), up ? 0.4 : 0.46, up ? 0.52 : 0.62), bY: Math.min(k.bY ?? -0.34, up ? -0.3 : -0.38) };
    }
    // a thrust's strike: the arm long and on the scabbard's line, out of a lunge
    if (b && u >= 1 - 1e-6 && b.zone?.kind === 'line' && !b.draw && Array.isArray(k.sw) && !(k.arm > 0) && (k.rF === F.LUNGE_FEET.rF || k.rF === F.PERIL_LUNGE.rF)) {
      const bZ = k.bZ ?? 0;
      const deep = k.rF === F.PERIL_LUNGE.rF;
      o = { ...o, bY: Math.min(k.bY ?? -0.3, deep ? -0.4 : -0.34), rH: reachLine(k.sw[0], k.sw[1], u < 1.3 ? 0.6 : 0.62), rP: [-0.75, -0.25, -0.3], ...lungeFeet(Math.min(bZ, 0.24), deep ? 0.48 : 0.44, deep ? 0.8 : 0.74), lH: [0.24, 0.08, -0.3], lP: [0.7, -0.2, -0.6] };
    }
    // ... and a recovery that holds the lunge holds the form's (The Walking Staff's: the old one on two locked knees)
    if (!b && !isEnd(k) && (k.rF === F.LUNGE_FEET.rF || k.rF === F.PERIL_LUNGE.rF)) {
      const deep = k.rF === F.PERIL_LUNGE.rF;
      o = { ...o, ...lungeFeet(Math.min(k.bZ ?? 0, 0.24), deep ? 0.48 : 0.44, deep ? 0.8 : 0.74) };
    }
    // the two-handed overhead: raised over his sword shoulder and brought down ACROSS him (a diagonal)
    if ((k.two ?? 0) > 0.95 && Array.isArray(k.sw)) {
      if (u < 1 - 1e-6 && k.sw[1] > 1.3) o = { ...o, ...G.RAISED2 };
      else if (u >= 1 - 1e-6 && k.sw[1] < -0.4) {
        const bZ = k.bZ ?? 0;
        o = { ...o, ...(u < 1.3 ? G.CHOP2 : G.CHOP2_FOLLOW), rF: [-0.1, bZ + 0.44], lF: [0.2, bZ - 0.58], rK: [-0.2, 0, 1], lK: [0.35, -0.2, 0.9] };
      }
    }
    // the free hand in the scabbard cuts: gathered by the sternum and split back in opposition, half the travel
    const fh = G.FREE.get(k.lH);
    if (fh) o = { ...o, lH: fh };
    return o;
  };
}

/** The low sweep's feet: they go round with him (the right leg sweeps the ground, the left turns on its
 *  ball), each just off the floor so the clip carries them. */
const rotXZ = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
export const sweepFeet = (ph) => {
  const r = rotXZ(-0.46, 0.22, ph), l = rotXZ(0.12, -0.04, ph);
  return { rF: [r[0], ANK + 0.04, r[1]], lF: [l[0], ANK + 0.04, l[1]], rFy: -0.7 + ph, lFy: 0.9 + ph };
};
