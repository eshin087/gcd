// The hero's moveset as MOTION, measured on the real rig (ADR-256; the method of motionAudit.mjs and of
// the boss audits of ADR-248 - ADR-250, for the hero's own rig): integ.mjs `heroaudit` (opt-in) drives
// every move and this module samples him frame by frame in his own frame (the drawn lean switched off:
// it shears him toward the camera and bends every angle).
//
// Per frame: the joints (both shoulders, elbows, wrists, the sword's point, the head, the pelvis, both
// ankles), the elbows' and knees' interior angles (180 = straight), the sword wrist's KINK (the forearm,
// elbow → grip, against the blade: the angle the fist holds), the blade's elevation, the hips' and the
// chest's turn, and the feet in the world.
// Per segment (one labelled move or transition):
//   step    the fastest step of a joint in one frame (m; hit-stop frames are skipped)
//   pop     its largest second difference (m: a joint that changes its speed in one frame)
//   dEl dKink dChest  the largest one-frame change of the sword elbow, the kink, the chest's turn (deg)
//   el kink knee      their ranges (deg)
//   foot    the largest one-frame jump of a foot in the world beyond the body's own travel that frame (m)
//   slide   how far a planted foot (on the ground, the other one higher) moves along the ground (m)

export function makeHeroAudit({ THREE, p, HD, dtOf = () => 1 / 60 }) {
  const r = p.rig;
  const V = () => new THREE.Vector3();
  const inv = new THREE.Matrix4(), tmp = V(), a1 = V(), a2 = V();
  const DEG = 180 / Math.PI;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const ang = (a, b, c) => {
    a1.subVectors(a, b).normalize();
    a2.subVectors(c, b).normalize();
    return Math.acos(clamp(a1.dot(a2), -1, 1)) * DEG;
  };
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const W = (o, x = 0, y = 0, z = 0) => tmp.set(x, y, z).applyMatrix4(o.matrixWorld).clone();
  const yawIn = (J) => {
    const o = W(J).applyMatrix4(inv), f = W(J, 0, 0, 1).applyMatrix4(inv).sub(o);
    return Math.atan2(f.x, f.z);
  };
  const KEYS = ['shR', 'elR', 'wrR', 'tip', 'shL', 'elL', 'wrL', 'head', 'pelvis', 'anR', 'anL'];

  function sample() {
    // (the drawn hero is leaned toward the camera and scaled: model.js; measured on the plain upright body)
    const on = p.lean?.on;
    if (p.lean) p.lean.on = false;
    r.root.updateMatrixWorld(true);
    try { return sample0(); } finally { if (p.lean) p.lean.on = on; r.root.updateMatrixWorld(true); }
  }
  function sample0() {
    inv.copy(r.root.matrixWorld).invert();
    const w = {
      shR: W(r.arms.R.upper), elR: W(r.arms.R.fore), wrR: W(r.arms.R.fore, 0, -HD.foreArm, 0),
      tip: W(r.sword, 0, 0, 0.9), sw0: W(r.sword),
      shL: W(r.arms.L.upper), elL: W(r.arms.L.fore), wrL: W(r.arms.L.wrist),
      head: W(r.head, 0, 0.1, 0), pelvis: W(r.pelvis),
      hpR: W(r.legs.R.thigh), knR: W(r.legs.R.shin), anR: W(r.legs.R.foot),
      hpL: W(r.legs.L.thigh), knL: W(r.legs.L.shin), anL: W(r.legs.L.foot),
    };
    const b = {};
    for (const k in w) b[k] = w[k].clone().applyMatrix4(inv);
    // the forearm (elbow → grip) against the blade (the sword joint's +z)
    const fore = V().subVectors(w.wrR, w.elR).normalize();
    const blade = V().subVectors(w.tip, w.sw0).normalize();
    const bl = V().subVectors(b.tip, b.sw0).normalize();
    return {
      dt: dtOf(), state: p.state, root: V().setFromMatrixPosition(r.root.matrixWorld),
      b, feetW: [w.anR, w.anL],
      elR: ang(w.shR, w.elR, w.wrR), elL: ang(w.shL, w.elL, w.wrL),
      knR: ang(w.hpR, w.knR, w.anR), knL: ang(w.hpL, w.knL, w.anL),
      kink: Math.acos(clamp(fore.dot(blade), -1, 1)) * DEG,
      elev: Math.asin(clamp(bl.y, -1, 1)) * DEG,
      hip: yawIn(r.pelvis), chest: yawIn(r.chest),
    };
  }

  /** Stats of a run of frames (each from sample()). */
  function stats(F) {
    const S = { n: F.length, step: {}, stepAt: {}, pop: {}, popAt: {}, dEl: 0, dElAt: -1, dElL: 0, dKink: 0, dKinkAt: -1, dChest: 0, dChestAt: -1, foot: 0, footAt: -1, slide: 0 };
    for (const k of KEYS) { S.step[k] = 0; S.pop[k] = 0; S.stepAt[k] = -1; S.popAt[k] = -1; }
    const rng = (f) => { let lo = Infinity, hi = -Infinity; for (const x of F) { const v = f(x); if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } return [lo, hi]; };
    S.el = rng((x) => x.elR);
    S.elL = rng((x) => x.elL);
    S.kink = rng((x) => x.kink);
    S.knee = rng((x) => Math.min(x.knR, x.knL));
    S.elev = rng((x) => x.elev);
    const slideAcc = [0, 0];
    for (let i = 1; i < F.length; i++) {
      const A = F[i - 1], B = F[i];
      if (!(B.dt >= 0.005) || !(A.dt >= 0.005)) continue; // a hit-stop frame
      if (B.root.distanceTo(A.root) > 0.5) continue; // a teleport (the takes reset him)
      for (const k of KEYS) {
        const s = B.b[k].distanceTo(A.b[k]);
        if (s > S.step[k]) { S.step[k] = s; S.stepAt[k] = i; }
        if (i >= 2 && F[i - 2].dt >= 0.005) {
          const Z = F[i - 2];
          const d2 = Math.hypot(B.b[k].x - 2 * A.b[k].x + Z.b[k].x, B.b[k].y - 2 * A.b[k].y + Z.b[k].y, B.b[k].z - 2 * A.b[k].z + Z.b[k].z);
          if (d2 > S.pop[k]) { S.pop[k] = d2; S.popAt[k] = i; }
        }
      }
      const de = Math.abs(B.elR - A.elR);
      if (de > S.dEl) { S.dEl = de; S.dElAt = i; }
      S.dElL = Math.max(S.dElL, Math.abs(B.elL - A.elL));
      const dk = Math.abs(B.kink - A.kink);
      if (dk > S.dKink) { S.dKink = dk; S.dKinkAt = i; }
      const dc = Math.abs(wrap(B.chest - A.chest)) * DEG;
      if (dc > S.dChest) { S.dChest = dc; S.dChestAt = i; }
      const rootStep = B.root.distanceTo(A.root);
      for (let f = 0; f < 2; f++) {
        const fs = B.feetW[f].distanceTo(A.feetW[f]);
        const ex = fs - rootStep;
        if (ex > S.foot) { S.foot = ex; S.footAt = i; }
        // planted: on the ground and the lower of the two
        const lowA = A.feetW[f].y - A.root.y, lowB = B.feetW[f].y - B.root.y;
        const other = B.feetW[1 - f].y - B.root.y;
        if (lowA < 0.12 && lowB < 0.12 && lowB <= other + 0.01) slideAcc[f] += Math.hypot(B.feetW[f].x - A.feetW[f].x, B.feetW[f].z - A.feetW[f].z);
      }
    }
    S.slide = Math.max(...slideAcc);
    return S;
  }

  const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : ' -- ');
  const f0 = (x) => (Number.isFinite(x) ? x.toFixed(0) : '--');
  const worst = (o, ks) => { let k0 = ks[0]; for (const k of ks) if (o[k] > o[k0]) k0 = k; return k0; };
  /** One table row. */
  function row(label, S) {
    const kS = worst(S.step, KEYS), kP = worst(S.pop, KEYS);
    return `${label.padEnd(26)} ${String(S.n).padStart(4)}  step ${f2(S.step[kS])} ${kS.padEnd(6)} pop ${f2(S.pop[kP])} ${kP.padEnd(6)} wrR ${f2(S.step.wrR)}/${f2(S.pop.wrR)} wrL ${f2(S.step.wrL)}/${f2(S.pop.wrL)} tip ${f2(S.step.tip)}  dEl ${f0(S.dEl).padStart(3)} dElL ${f0(S.dElL).padStart(3)} dKink ${f0(S.dKink).padStart(3)} dChest ${f0(S.dChest).padStart(3)}  el ${f0(S.el[0])}-${f0(S.el[1])} elL ${f0(S.elL[0])}-${f0(S.elL[1])} kink ${f0(S.kink[0])}-${f0(S.kink[1])} knee≥${f0(S.knee[0])} elev ${f0(S.elev[0])}..${f0(S.elev[1])}  foot ${f2(S.foot)} slide ${f2(S.slide)}`;
  }
  return { sample, stats, row, KEYS };
}
