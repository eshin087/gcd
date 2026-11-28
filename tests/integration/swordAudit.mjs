// The sword audit (ADR-226): every move of a sword-wielding duelist (the Ash Disciple, the Starless Lord)
// played once with the AI off and the hero standing still at the middle of the move's band, his joints
// read every frame in his own frame (the root's inverse) and measured the way the hero's reference-built
// stance and swings were measured (ADR-207, ADR-214):
//   wrist   the sword wrist: the forearm (elbow → grip) against the blade (0 = one line; the hero holds
//           ≤ 60, past it the fist turns off the wrist)
//   gap     the blade (guard → tip) from his head and his torso (m, minus their radii; < 0 = through him)
//   two     both hands on the hilt: the free hand off its place on the grip (m, anim.js gripGap) while `twoHand` > 0.95
//   chest   his chest's facing against the way to the hero (deg, + = turned to his left of the hero), at
//           each blow's impact and the worst of the windup
//   head    the same for his eyes
//   elbow   the sword elbow's interior angle (min..max: a small range reads as a stiff arm)
//   free    the free hand's fastest speed (m/s: a flailing arm) and its range of travel (m: a rigid one)
//   feet    planted feet sliding (m, summed), the feet crossing (the left foot's side minus the right's
//           along his pelvis' left axis, m: < 0 = crossed), the narrowest / widest stance
//   jolt    the largest one-frame second difference of any tracked point (mm a frame²: a pop) and where
// Used by duel.mjs and lord.mjs (scenario `audit`, opt-in; `GCD_AUDIT=a,b` picks moves,
// `GCD_AUDIT_JSON=file` writes the rows, `GCD_AUDIT_TOP=n` lists each move's n worst pops).

/** `H`: the suite's harness { THREE, build, duel, run, DT, MOVES, names, formOf(name) → form, setForm }. */
export function swordAudit(H) {
  const { THREE, build, duel, run, DT, MOVES, names } = H;
  const TOP = Number(process.env.GCD_AUDIT_TOP ?? 0);
  const DEG = 180 / Math.PI;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const inv = new THREE.Matrix4();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const ang3 = (a, b, c) => {
    const u = new THREE.Vector3().subVectors(a, b).normalize(), w = new THREE.Vector3().subVectors(c, b).normalize();
    return Math.acos(clamp(u.dot(w), -1, 1)) * DEG;
  };
  const angV = (u, w) => Math.acos(clamp(u.clone().normalize().dot(w.clone().normalize()), -1, 1)) * DEG;
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // the closest two segments come (sampled: build-free, accurate to a centimetre at these sizes)
  const segSeg = (a0, a1, b0, b1) => {
    let best = 9;
    const ab = tmp2.subVectors(b1, b0).clone(), L = ab.lengthSq();
    for (let i = 0; i <= 16; i++) {
      const p = tmp.copy(a0).lerp(a1, i / 16);
      const t = L > 1e-9 ? clamp(new THREE.Vector3().subVectors(p, b0).dot(ab) / L, 0, 1) : 0;
      const q = new THREE.Vector3().copy(b0).addScaledVector(ab, t);
      best = Math.min(best, p.distanceTo(q));
    }
    return best;
  };
  const segPt = (a0, a1, p) => segSeg(a0, a1, p, p);

  function sample(game) {
    const d = game.dragon, R = d.rig, B = d.kit.blade;
    R.root.updateMatrixWorld(true);
    inv.copy(R.root.matrixWorld).invert();
    const at = (o, x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld);
    const dir = (o, x, y, z) => new THREE.Vector3(x, y, z).transformDirection(o.matrixWorld).transformDirection(inv);
    const W = {
      shR: at(R.arms.R.upper), elR: at(R.arms.R.fore), grip: at(R.sword),
      shL: at(R.arms.L.upper), elL: at(R.arms.L.fore), wrL: at(R.arms.L.wrist ?? R.arms.L.fore),
      hipR: at(R.legs.R.thigh), knR: at(R.legs.R.shin), anR: at(R.legs.R.foot),
      hipL: at(R.legs.L.thigh), knL: at(R.legs.L.shin), anL: at(R.legs.L.foot),
      head: at(R.head, 0, 0.13, 0), chest: at(R.chest, 0, 0.12, 0), pelvis: at(R.pelvis),
      guard: at(R.sword, 0, 0, B.guard ?? 0.1), tip: at(R.sword, 0, 0, B.tip ?? 1),
      pommel: at(R.sword, 0, 0, -0.12),
    };
    const Bf = {};
    for (const k in W) Bf[k] = W[k].clone().applyMatrix4(inv);
    const hero = game.player.position.clone().applyMatrix4(inv);
    const chestF = dir(R.chest, 0, 0, 1), headF = dir(R.head, 0, 0, 1), pelvX = dir(R.pelvis, 1, 0, 0);
    const toHero = Math.atan2(hero.x, hero.z);
    // (the root's own scale: distances are read in model metres)
    return {
      W, B: Bf, hero, two: d.anim?.cur?.[45] ?? 0, gripGap: d.anim?.gripGap ?? 1,
      chest: wrapA(Math.atan2(chestF.x, chestF.z) - toHero) * DEG,
      head: wrapA(Math.atan2(headF.x, headF.z) - toHero) * DEG,
      pelvX,
      x: d.position.x, z: d.position.z, y: d.position.y, yaw: d.yaw,
    };
  }

  const phaseOf = (a, t) => {
    for (const b of a.beats) {
      if (t < b.start) continue;
      const i = b.index ?? a.beats.indexOf(b);
      if (t < b.impact - 0.12) return `b${i} windup`;
      if (t <= b.impact + 0.06) return `b${i} strike`;
      if (t <= b.end + 1e-6) return `b${i} active`;
    }
    return t < (a.recoveryStart ?? a.end) ? 'follow' : 'recovery';
  };

  const PTS = ['grip', 'wrL', 'elR', 'elL', 'knR', 'knL', 'anR', 'anL', 'head', 'chest', 'pelvis', 'tip'];
  const rows = [];
  for (const name of names) {
    const def = MOVES[name];
    const form = H.formOf ? H.formOf(name) : 1;
    const G = build();
    const band = def.band ?? [0, 4];
    const dist = clamp((band[0] + Math.min(band[1], 8)) / 2, 1.6, 7);
    duel(G, { dist, form });
    const { game } = G;
    const d = game.dragon, p = game.player;
    p.debug.god = true;
    if (form > 1 && d.phase !== form) H.setForm?.(G, form);
    run(G, 0.6);
    d.position.set(0, 0, 0);
    d.yaw = Math.PI / 2;
    p.debug.teleport(dist, 0);
    run(G, 0.7);
    if (!d.debug.trigger(name)) { rows.push({ name, form, fail: 'trigger' }); continue; }
    const A = d.brain.act;
    const F = [];
    let after = -1, px = d.position.x, pz = d.position.z;
    const impacts = [];
    for (let i = 0; i < 1500; i++) {
      p.hp = p.maxHp;
      p.debug.teleport(p.position.x, p.position.z);
      const inAct = d.brain.act === A;
      if (!inAct && after < 0) after = 0;
      if (after >= 0 && after++ > 14) break;
      const s = sample(game);
      s.t = inAct ? A.t : A.end + after * DT;
      s.ph = inAct ? phaseOf(A, A.t) : 'blend out';
      s.jump = Math.hypot(d.position.x - px, d.position.z - pz) > 0.4;
      px = d.position.x;
      pz = d.position.z;
      s.air = s.jump || d.position.y > 0.05 || !!d.brain.leap || (inAct && !!A.beats.find((b) => (b.def.dash || b.def.flit || b.def.blink) && A.t >= b.start && A.t <= b.end + 0.1));
      s.hs = game.hitstopTimer > 0;
      F.push(s);
      if (inAct) for (const b of A.beats) {
        if (b.feint || b._aud || A.t < b.impact) continue;
        b._aud = true;
        impacts.push({ i: b.index ?? A.beats.indexOf(b), tell: b.def.tell ?? '-', chest: Math.round(s.chest), head: Math.round(s.head), frame: F.length - 1, kick: !!(b.def.noSweep && !b.def.cast) || b.def.part === 'feet' && !!b.def.noSweep, thrust: b.def.zone?.kind === 'line' });
      }
      G.tick(DT);
    }
    // per frame
    let wristMax = 0, wristSum = 0, wristOver = 0, gapHead = 9, gapBody = 9, gapAt = '', twoOff = 0, twoN = 0;
    let elMin = 180, elMax = 0, elMinAt = '', freeAt = '', freeV = 0, slide = 0, cross = 9, crossAt = '', wide = 0, narrow = 9;
    let chestWind = 0, chestWindAt = '';
    const freeLo = new THREE.Vector3(9, 9, 9), freeHi = new THREE.Vector3(-9, -9, -9);
    for (let i = 0; i < F.length; i++) {
      const s = F[i], b = s.B;
      const fore = tmp.subVectors(b.grip, b.elR).clone(), blade = new THREE.Vector3().subVectors(b.tip, b.guard);
      const w = angV(fore, blade);
      wristMax = Math.max(wristMax, w);
      wristSum += w;
      if (w > 60) wristOver++;
      const gh = segPt(b.guard, b.tip, b.head) - 0.15, gb = segSeg(b.guard, b.tip, b.pelvis, b.chest) - 0.16;
      if (Math.min(gh, gb) < Math.min(gapHead, gapBody)) gapAt = s.ph;
      gapHead = Math.min(gapHead, gh);
      gapBody = Math.min(gapBody, gb);
      if (s.two > 0.95) {
        twoOff = Math.max(twoOff, s.gripGap);
        twoN++;
      }
      const el = ang3(b.shR, b.elR, b.grip);
      if (el < elMin) elMinAt = `${s.ph} @${s.t.toFixed(2)}`;
      elMin = Math.min(elMin, el);
      elMax = Math.max(elMax, el);
      freeLo.min(b.wrL);
      freeHi.max(b.wrL);
      if (i > 0 && !s.air && !F[i - 1].air) { const fv = b.wrL.distanceTo(F[i - 1].B.wrL) / DT; if (fv > freeV) { freeV = fv; freeAt = `${s.ph} @${s.t.toFixed(2)}`; } }
      // the feet: crossing along the pelvis' left axis, the stance's width on the floor
      const side = new THREE.Vector3().subVectors(b.anL, b.anR).dot(s.pelvX);
      if (side < cross) { cross = side; crossAt = s.ph; }
      const fw = Math.hypot(b.anL.x - b.anR.x, b.anL.z - b.anR.z);
      if (!s.air) { wide = Math.max(wide, fw); narrow = Math.min(narrow, fw); }
      if (i > 0 && !s.air && !F[i - 1].air) for (const k of ['anR', 'anL']) {
        const a1 = s.W[k], b1 = F[i - 1].W[k];
        if (a1.y < 0.14 && b1.y < 0.14) slide += Math.hypot(a1.x - b1.x, a1.z - b1.z);
      }
      if (/windup/.test(s.ph) && Math.abs(s.chest) > Math.abs(chestWind)) { chestWind = s.chest; chestWindAt = s.ph; }
    }
    // pops: second differences, his frame and the world round his root (outside jumps and hit-stops)
    const jolts = [];
    for (let i = 2; i < F.length; i++) {
      if (F[i].air || F[i - 1].air || F[i - 2].air || F[i].hs || F[i - 1].hs || F[i - 2].hs) continue;
      for (const k of PTS) {
        const jb = tmp.copy(F[i].B[k]).addScaledVector(F[i - 1].B[k], -2).add(F[i - 2].B[k]).length() * 1000;
        jolts.push({ j: jb, k, t: F[i].t, ph: F[i].ph });
      }
    }
    jolts.sort((a, b) => b.j - a.j);
    const top = jolts.filter((x, i, L) => L.findIndex((y) => y.k === x.k && Math.abs(y.t - x.t) < 0.05) === i).slice(0, Math.max(1, TOP));
    // his facing: the fastest turn (deg/s)
    let yawR = 0;
    for (let i = 1; i < F.length; i++) if (!F[i].jump) yawR = Math.max(yawR, (Math.abs(wrapA(F[i].yaw - F[i - 1].yaw)) / DT) * DEG);
    // at each impact (GCD_AUDIT_IMPACT): the sword elbow, the wrist, both knees, the front foot down or
    // not, the blade's elevation, the cut's tilt (the point's path over the strike: 0 = level across, 90
    // = straight down / up: a bar at the game camera), a thrust's arm line (shoulder → grip against the
    // blade, 0 = one line) and a kick's knee (the kicking leg: the higher ankle)
    for (const im of impacts) {
      const s = F[im.frame], b = s.B, s0 = F[Math.max(0, im.frame - 3)].B, s1 = F[Math.min(F.length - 1, im.frame + 3)].B;
      im.elbow = Math.round(ang3(b.shR, b.elR, b.grip));
      im.wrist = Math.round(angV(tmp.subVectors(b.grip, b.elR).clone(), new THREE.Vector3().subVectors(b.tip, b.guard)));
      im.knR = Math.round(ang3(b.hipR, b.knR, b.anR));
      im.knL = Math.round(ang3(b.hipL, b.knL, b.anL));
      const bl = new THREE.Vector3().subVectors(b.tip, b.guard);
      im.bladeEl = Math.round(Math.asin(clamp(bl.y / Math.max(1e-6, bl.length()), -1, 1)) * DEG);
      const tv = new THREE.Vector3().subVectors(s1.tip, s0.tip);
      im.tilt = tv.length() > 0.02 ? Math.round(Math.asin(clamp(Math.abs(tv.y) / tv.length(), 0, 1)) * DEG) : null;
      im.tipV = +(tv.length() / (6 * DT)).toFixed(1);
      im.armLine = Math.round(angV(new THREE.Vector3().subVectors(b.grip, b.shR), bl));
      // the front foot: the one further toward the hero; down = its ankle under 0.14 m
      const fR = b.anR.clone().sub(b.pelvis).dot(new THREE.Vector3(s.hero.x, 0, s.hero.z).normalize()), fL = b.anL.clone().sub(b.pelvis).dot(new THREE.Vector3(s.hero.x, 0, s.hero.z).normalize());
      const front = fR >= fL ? 'R' : 'L', fy = s.W[front === 'R' ? 'anR' : 'anL'].y - (s.y || 0);
      im.front = `${front}${fy < 0.14 ? 'down' : 'up' + Math.round(fy * 100)}`;
      if (im.kick) {
        const up = b.anR.y > b.anL.y ? 'R' : 'L';
        im.kickKnee = up === 'R' ? im.knR : im.knL;
        im.kickLeg = up;
      }
    }
    rows.push({
      name, form, label: def.label, frames: F.length,
      wrist: { max: Math.round(wristMax), mean: Math.round(wristSum / F.length), over60: +(wristOver / F.length).toFixed(2) },
      gap: { head: +gapHead.toFixed(2), body: +gapBody.toFixed(2), at: gapAt },
      two: twoN ? +twoOff.toFixed(2) : null,
      chestWind: Math.round(chestWind), chestWindAt, impacts,
      elbow: [Math.round(elMin), Math.round(elMax)], elMinAt,
      free: { v: +freeV.toFixed(1), range: +freeHi.clone().sub(freeLo).length().toFixed(2), at: freeAt },
      feet: { slide: +slide.toFixed(2), cross: +cross.toFixed(2), crossAt, narrow: +narrow.toFixed(2), wide: +wide.toFixed(2) },
      yawR: Math.round(yawR),
      pop: top.map((x) => ({ j: Math.round(x.j), k: x.k, t: +x.t.toFixed(2), ph: x.ph })),
    });
  }
  return rows;
}

/** The rows as a table (one line a move). */
export function printAudit(rows, out) {
  out('   move              f  wrist max/mean/>60   blade gap head/body (when)    2h    chest wind / at impacts (tell)            elbow     free v/range   feet slide/cross/narrow-wide   turn°/s  worst pop');
  for (const r of rows) {
    if (r.fail) { out(`   ${r.name} FAIL ${r.fail}`); continue; }
    const imp = r.impacts.map((x) => `${x.chest}${x.tell[0] ?? ''}`).join(' ');
    out(`   ${r.name.padEnd(17)} ${r.form}  ${`${r.wrist.max}/${r.wrist.mean}/${r.wrist.over60}`.padEnd(19)} ${`${r.gap.head}/${r.gap.body} (${r.gap.at})`.padEnd(29)} ${String(r.two ?? '-').padEnd(5)} ${`${r.chestWind} / ${imp}`.padEnd(41)} ${`${r.elbow[0]}-${r.elbow[1]}`.padEnd(9)} ${`${r.free.v}/${r.free.range}`.padEnd(14)} ${`${r.feet.slide}/${r.feet.cross}/${r.feet.narrow}-${r.feet.wide}`.padEnd(30)} ${String(r.yawR).padStart(6)}  ${r.pop.map((p) => `${p.k} ${p.j} @${p.t} ${p.ph}`).join(' · ')}`);
  }
}

/** The impacts as a table (GCD_AUDIT_IMPACT=1): one line a blow. */
export function printImpacts(rows, out) {
  out('   move              beat tell  elbow wrist knR knL  bladeEl tilt tipV  armLine front    kickKnee');
  for (const r of rows) {
    if (r.fail) continue;
    for (const x of r.impacts) out(`   ${r.name.padEnd(17)} b${String(x.i).padEnd(3)} ${String(x.tell).padEnd(6)} ${String(x.elbow).padStart(5)} ${String(x.wrist).padStart(5)} ${String(x.knR).padStart(3)} ${String(x.knL).padStart(3)}  ${String(x.bladeEl).padStart(6)} ${String(x.tilt ?? '-').padStart(4)} ${String(x.tipV).padStart(5)} ${String(x.armLine).padStart(7)}${x.thrust ? '*' : ' '} ${x.front.padEnd(8)} ${x.kick ? `${x.kickLeg} ${x.kickKnee}` : ''}`);
  }
}

/** How still the blade stands through a blow's held tell pose (ADR-226): move `name` triggered (AI off,
 *  the hero still at `dist`), its first real beat's point read in his own frame from `u0` to `u1` of the
 *  windup (duelist/tellPose.js TELL_U, a little inside it); returns the farthest the point wandered (m)
 *  from where it stood at u0, and the beat's windup. */
export function heldTip(H, name, { dist = 2.6, form = 1, u0 = 0.42, u1 = 0.76 } = {}) {
  const { THREE, build, duel, run, DT } = H;
  const G = build();
  duel(G, { dist, form });
  const { game } = G;
  const d = game.dragon, p = game.player;
  p.debug.god = true;
  if (form > 1 && d.phase !== form) H.setForm?.(G, form);
  run(G, 0.6);
  if (!d.debug.trigger(name)) return { fail: 'trigger' };
  const A = d.brain.act, b = A.beats.find((x) => !x.feint);
  const inv = new THREE.Matrix4();
  let at = null, far = 0, n = 0;
  for (let i = 0; i < 600 && d.brain.act === A && A.t < b.impact; i++) {
    p.hp = p.maxHp;
    G.tick(DT);
    const u = (A.t - b.start) / Math.max(1e-6, b.impact - b.start);
    if (u < u0 || u > u1) continue;
    d.rig.root.updateMatrixWorld(true);
    inv.copy(d.rig.root.matrixWorld).invert();
    const tip = new THREE.Vector3(0, 0, d.kit.blade.tip ?? 1).applyMatrix4(d.rig.sword.matrixWorld).applyMatrix4(inv);
    n++;
    if (!at) at = tip;
    else far = Math.max(far, tip.distanceTo(at));
  }
  return { far, n, windup: b.impact - b.start, tell: b.def.tell };
}
