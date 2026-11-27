// A duelist boss's moves as MOTION, measured on the real rig (the method of duel.mjs MOTION and the
// rig audits of ADR-126 / ADR-203): every move triggered from the same start on a still hero, frame by
// frame. Used by sheath.mjs / fox.mjs `motion` (asserted bars) and their `audit` (a printed table).
//
// Per move:
//   hand      the fastest step of either wrist in his own frame (m a frame; a teleport reads > 0.3)
//   pop       the largest second difference of a wrist, the head, the pelvis or an ankle (m; a pop:
//             a joint that changes its speed in one frame, > ~0.12 m)
//   slide     the planted feet's travel along the ground outside a dash or a leap (m)
//   elbow     the sword arm's smallest interior angle (deg; a straight arm is 180)
// Per beat (a blow, not a feint):
//   tell, W   its tell and windup (s)
//   held      the longest stretch of the windup in which nothing tracked moves faster than STILL m/s
//             (in his frame): the readable held windup pose (s)
//   heldEnd   how long before the impact that stretch ends (s)
//   face      the angle between where he faces and the hero at the impact (deg)
//   faceTell  ... at the beat's start (deg)
//   cock      the pose in that stretch (his frame): pelvis height, the sword hand's height and reach
//
// usage: const A = makeAudit({ THREE, G, DT, place, prep }); A.measure(name, { dist, phase }) → row
export const STILL = 0.9; // m/s: a joint slower than this reads as held at the game camera
export const STILL_REL = 0.2; // the wyrm: a part slower than this part of its own strike reads as held

const TRACK = ['wrR', 'wrL', 'head', 'pelvis', 'anR', 'anL', 'elR', 'elL'];
// (the held pose is the body's: a planted foot moves in his frame while the root closes in under it)
const HOLD = ['wrR', 'wrL', 'head', 'pelvis', 'elR', 'elL'];

export function makeAudit({ THREE, G, DT, place, prep = null }) {
  const V = () => new THREE.Vector3();
  const inv = new THREE.Matrix4(), tmp = V();
  const angle = (a, b, c) => {
    const u = V().subVectors(a, b).normalize(), w = V().subVectors(c, b).normalize();
    return (Math.acos(Math.max(-1, Math.min(1, u.dot(w)))) * 180) / Math.PI;
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function sample(d) {
    const R = d.rig;
    R.root.updateMatrixWorld(true);
    inv.copy(R.root.matrixWorld).invert();
    const L = (o, x = 0, y = 0, z = 0) => tmp.set(x, y, z).applyMatrix4(o.matrixWorld).clone();
    const W = {
      shR: L(R.arms.R.upper), elR: L(R.arms.R.fore), wrR: L(R.arms.R.fore, 0, -0.26, 0),
      shL: L(R.arms.L.upper), elL: L(R.arms.L.fore), wrL: L(R.arms.L.wrist),
      anR: L(R.legs.R.foot), anL: L(R.legs.L.foot),
      head: L(R.head, 0, 0.1, 0), pelvis: L(R.pelvis),
    };
    const B = {};
    for (const k in W) B[k] = W[k].clone().applyMatrix4(inv);
    return { W, B };
  }

  /** Run `name` once and measure it. `opts`: dist (m to the hero), phase, ang (the hero's bearing off his facing). */
  function measure(name, { dist = 3, phase = 1, ang = 0, maxFrames = 900 } = {}) {
    const { game } = G;
    const d = game.dragon, p = game.player;
    p.debug.god = true;
    prep?.(G, { name, phase, dist });
    place(G, dist, ang);
    for (let i = 0; i < 30; i++) { place(G, dist, ang); G.tick(DT); }
    if (!d.debug.trigger(name)) return { name, fail: 'trigger' };
    const F = [];
    let beats = null;
    for (let i = 0; i < maxFrames; i++) {
      G.tick(DT);
      p.debug.heal();
      const a = d.brain.act;
      if (!a || a.name !== name) break;
      beats ??= a.beats.map((b) => ({ start: b.start, impact: b.impact, end: b.end, W: b.W, H: b.H, feint: !!b.feint, tell: b.def.tell ?? null, draw: !!b.def.draw, dash: !!b.def.dash, leap: !!b.def.leap || !!b.def.lift }));
      const s = sample(d);
      s.t = a.t;
      s.yaw = d.yaw;
      s.toHero = Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z);
      s.fast = Math.hypot(d.pilot?.groundVel?.x ?? 0, d.pilot?.groundVel?.z ?? 0) > 6 || d.position.y > 0.03;
      F.push(s);
      const tk = globalThis.process?.env?.GCD_TRACE;
      if (tk && s.B[tk]) { const w = s.W[tk], b = s.B[tk]; globalThis.process.stdout.write(`    t ${a.t.toFixed(3)} ${tk} own [${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}] world [${w.x.toFixed(2)},${w.y.toFixed(2)},${w.z.toFixed(2)}] root [${d.position.x.toFixed(2)},${d.position.z.toFixed(2)}] yaw ${d.yaw.toFixed(2)} clip ${d.anim?.clip?.name ?? '-'}
`); }
    }
    if (F.length < 4 || !beats) return { name, fail: 'short', frames: F.length };
    let hand = 0, handAt = 0, pop = 0, popAt = 0, popK = '';
    for (let i = 1; i < F.length; i++) {
      for (const k of ['wrR', 'wrL']) {
        const v = F[i].B[k].distanceTo(F[i - 1].B[k]);
        if (v > hand) { hand = v; handAt = F[i].t; }
      }
      if (i > 1) for (const k of TRACK) {
        if (F[i].fast || F[i - 1].fast) continue;
        const a2 = V().copy(F[i].B[k]).addScaledVector(F[i - 1].B[k], -2).add(F[i - 2].B[k]).length();
        if (a2 > pop) { pop = a2; popAt = F[i].t; popK = k; }
      }
    }
    // the feet on the ground (world), outside a dash or a leap
    const lo = { R: 9, L: 9 }, hi = { R: 0, L: 0 }, slide = { R: 0, L: 0 };
    for (const s of F) for (const k of ['R', 'L']) { lo[k] = Math.min(lo[k], s.W['an' + k].y); hi[k] = Math.max(hi[k], s.W['an' + k].y); }
    for (let i = 1; i < F.length; i++) {
      if (F[i].fast || F[i - 1].fast) continue;
      for (const k of ['R', 'L']) {
        const a = F[i].W['an' + k], b = F[i - 1].W['an' + k];
        if (a.y < lo[k] + 0.02 && b.y < lo[k] + 0.02) slide[k] += Math.hypot(a.x - b.x, a.z - b.z);
      }
    }
    let elbow = 180;
    for (const s of F) elbow = Math.min(elbow, angle(s.B.shR, s.B.elR, s.B.wrR));
    // per beat
    const per = [];
    for (const b of beats) {
      if (b.feint) continue;
      const iS = F.findIndex((s) => s.t >= b.start - 1e-6), iI = F.findIndex((s) => s.t >= b.impact - 1e-6);
      if (iS < 0) continue;
      const i1 = iI < 0 ? F.length - 1 : iI;
      let run = 0, best = 0, bestEnd = iS;
      for (let i = Math.max(iS, 1); i <= i1; i++) {
        let mv = 0;
        for (const k of HOLD) mv = Math.max(mv, F[i].B[k].distanceTo(F[i - 1].B[k]) / DT);
        run = mv < STILL ? run + 1 : 0;
        if (run > best) { best = run; bestEnd = i; }
      }
      const c = F[Math.max(iS, bestEnd)];
      per.push({
        tell: b.tell, W: +b.W.toFixed(2), H: +(b.H ?? 0).toFixed(2), draw: b.draw,
        held: +(best * DT).toFixed(2), heldEnd: +((i1 - bestEnd) * DT).toFixed(2),
        face: Math.round((Math.abs(wrap(F[i1].toHero - F[i1].yaw)) * 180) / Math.PI),
        faceTell: Math.round((Math.abs(wrap(F[iS].toHero - F[iS].yaw)) * 180) / Math.PI),
        cock: { pel: +c.B.pelvis.y.toFixed(2), hand: +c.B.wrR.y.toFixed(2), reach: +c.B.wrR.z.toFixed(2), lhand: +c.B.wrL.y.toFixed(2) },
      });
    }
    return {
      name, frames: F.length,
      hand: +hand.toFixed(3), handAt: +handAt.toFixed(2), pop: +pop.toFixed(3), popAt: +popAt.toFixed(2), popK,
      slide: +(slide.R + slide.L).toFixed(2), lift: +Math.max(hi.R - lo.R, hi.L - lo.L).toFixed(2), elbow: Math.round(elbow),
      beats: per,
    };
  }

  /** One printed row a move, one line a beat. */
  function print(out, r) {
    if (r.fail) { out(`  ${r.name.padEnd(16)} FAIL ${r.fail}`); return; }
    out(`  ${r.name.padEnd(16)} ${String(r.frames).padStart(4)}f  hand ${r.hand.toFixed(2)} @${r.handAt}  pop ${r.pop.toFixed(2)} ${r.popK}@${r.popAt}  slide ${r.slide.toFixed(2)}  lift ${r.lift.toFixed(2)}  elbow ${r.elbow}`);
    for (const b of r.beats) out(`      ${String(b.tell ?? '-').padEnd(7)} W ${b.W.toFixed(2)}${b.H ? '+' + b.H.toFixed(2) : '     '}  held ${b.held.toFixed(2)} (ends ${b.heldEnd.toFixed(2)} before)  face ${String(b.face).padStart(3)}° (at tell ${String(b.faceTell).padStart(3)}°)  cock pel ${b.cock.pel} hand ${b.cock.hand}/${b.cock.reach}${b.draw ? '  DRAW' : ''}`);
  }
  return { measure, print, sample };
}

// ---------------------------------------------------------------- the wyrm (integ.mjs `wyrmaudit`)
// A creature: its tell is its body. Per blow (each combat:tell of a string): the striking part's and the
// body's (chest + head) held stretch in the windup (in the root's frame, x SCALE: STILL m/s x scale), the
// part's travel through the windup (its draw-back: how far it goes AWAY from where it strikes before the
// blow), the facing at the impact.
export function makeWyrmAudit({ THREE, G, DT, SCALE, place, settle, ATTACKS, kindOf = null }) {
  const V = () => new THREE.Vector3();
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const local = (d, w) => {
    const dx = w.x - d.position.x, dz = w.z - d.position.z, c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    return V().set(dx * c - dz * s, w.y - d.position.y, dx * s + dz * c);
  };
  function measure(name, { units = 6, ang = 0, phase = 1, max = 14 } = {}) {
    const { game } = G;
    const d = game.dragon, p = game.player;
    settle(G);
    if (d.phase !== phase) d.enterPhase(phase);
    d.hazards?.clear?.();
    place(G, (units * SCALE) / (SCALE / 1.25), ang);
    p.debug.god = true;
    const beats = [];
    const at0 = d.announceTell.bind(d);
    d.announceTell = (a, b) => { if (a.name === name) beats.push({ t0: game.time, imp: game.time + b.impactIn, part: b.part, wi: b.wi, tell: b.tell, kind: kindOf?.(name, b, a) ?? b.attack }); return at0(a, b); };
    const F = [];
    d.brain.startAction(ATTACKS[name]);
    for (let i = 0; i < Math.round(max / DT); i++) {
      game.mouseGround.set(d.position.x, 0, d.position.z);
      G.tick(DT);
      p.debug.heal();
      if (!d.brain.action || d.brain.action.name !== name) break;
      const pt = d.rig.pt, tl = d.rig.tail;
      F.push({
        t: game.time, yaw: d.yaw, toHero: Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z),
        snout: local(d, pt.snout), chest: local(d, pt.chest), head: local(d, pt.head),
        claw0: local(d, pt.arms[0].toe), claw1: local(d, pt.arms[1].toe),
        wing0: local(d, pt.wings[0].knuckles[1]), wing1: local(d, pt.wings[1].knuckles[1]),
        tailTip: local(d, tl.p[tl.n]), air: d.position.y > 0.05,
      });
      if (globalThis.process?.env?.GCD_TRACE && F.length > 1) {
        const A = F[F.length - 1], B = F[F.length - 2], sp = (k) => (A[k].distanceTo(B[k]) / DT / SCALE).toFixed(2);
        globalThis.process.stdout.write(`    t ${game.time.toFixed(3)} ${d.brain.action?.phase} snout ${sp('snout')} head ${sp('head')} chest ${sp('chest')} claw0 ${sp('claw0')} claw1 ${sp('claw1')} tail ${sp('tailTip')} yaw ${d.yaw.toFixed(3)}
`);
      }
    }
    d.announceTell = at0;
    const key = (b) => (b.part === 'claw' ? `claw${b.wi ?? 0}` : b.part === 'wing' ? `wing${b.wi ?? 0}` : b.part === 'wings' ? 'wing0' : b.part === 'tailTip' ? 'tailTip' : b.part === 'forefeet' || b.part === 'wrists' ? 'claw0' : ['snout', 'head', 'mouth'].includes(b.part) ? 'snout' : 'chest');
    const still = 0.9 * SCALE;
    const per = beats.map((b) => {
      const k = key(b);
      const i0 = F.findIndex((f) => f.t >= b.t0 - 1e-6), i1 = F.findIndex((f) => f.t >= b.imp - 1e-6);
      if (i0 < 0) return { ...b, k, fail: true };
      const iE = i1 < 0 ? F.length - 1 : i1;
      // (a creature this size is never still: held = slower than STILL_REL of its own strike, or STILL m/s)
      let pk = 0;
      for (let i = Math.max(1, iE - 2); i <= Math.min(F.length - 1, iE + 6); i++) pk = Math.max(pk, F[i][k].distanceTo(F[i - 1][k]) / DT);
      const lim = Math.max(still, STILL_REL * pk);
      const run = (keys) => {
        let r = 0, best = 0, end = i0;
        for (let i = Math.max(1, i0); i <= iE; i++) {
          let mv = 0;
          for (const kk of keys) mv = Math.max(mv, F[i][kk].distanceTo(F[i - 1][kk]) / DT);
          r = mv < lim ? r + 1 : 0;
          if (r > best) { best = r; end = i; }
        }
        return [best * DT, (iE - end) * DT];
      };
      const [hp, hpEnd] = run([k]);
      const [hb, hbEnd] = run([k, 'chest']);
      // the draw-back: the part's greatest distance from where it is at the impact, in the windup,
      // beyond where it started (anticipation)
      const hitAt = F[iE][k];
      let back = 0;
      const d0 = F[i0][k].distanceTo(hitAt);
      for (let i = i0; i <= iE; i++) back = Math.max(back, F[i][k].distanceTo(hitAt) - d0);
      let peak = 0;
      for (let i = Math.max(1, i0); i <= Math.min(F.length - 1, iE + 6); i++) peak = Math.max(peak, F[i][k].distanceTo(F[i - 1][k]) / DT);
      const chestDip = F.slice(i0, iE + 1).reduce((m, f) => Math.min(m, f.chest.y), 9) - F[i0].chest.y;
      return {
        tell: b.tell, kind: b.kind, part: k, W: +(b.imp - b.t0).toFixed(2),
        heldPart: +hp.toFixed(2), heldPartEnd: +hpEnd.toFixed(2), heldBody: +hb.toFixed(2), heldBodyEnd: +hbEnd.toFixed(2),
        back: +(back / SCALE).toFixed(2), peak: +(peak / SCALE).toFixed(1), chestDip: +(chestDip / SCALE).toFixed(2),
        face: Math.round((Math.abs(wrap(F[iE].toHero - F[iE].yaw)) * 180) / Math.PI),
      };
    });
    return { name, frames: F.length, beats: per };
  }
  function print(out, r) {
    out(`  ${r.name.padEnd(14)} ${String(r.frames).padStart(4)}f`);
    for (const b of r.beats) {
      if (b.fail) { out(`      ${String(b.tell).padEnd(7)} ${b.k} FAIL`); continue; }
      out(`      ${String(b.tell).padEnd(7)} ${String(b.kind ?? '').padEnd(10)} ${b.part.padEnd(7)} W ${b.W.toFixed(2)}  held part ${b.heldPart.toFixed(2)} (ends ${b.heldPartEnd.toFixed(2)})  body ${b.heldBody.toFixed(2)} (ends ${b.heldBodyEnd.toFixed(2)})  draw-back ${b.back.toFixed(2)} m  peak ${b.peak} m/s  chest dip ${b.chestDip}  face ${b.face}°`);
    }
  }
  return { measure, print };
}
