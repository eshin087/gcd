// Lu Wusheng's form audit (ADR-252; sheath.mjs `form`, opt-in): every move played once with the AI off,
// the hero still and in god mode at the middle of the move's band, his joints read every frame in his
// own frame (the root's inverse). What it records at each blow's IMPACT (the frame the blow is live):
//   el        the sword arm's elbow (shoulder, elbow, grip; deg, 180 = straight)
//   wrist     the forearm (elbow → grip) against the weapon (guard → tip; deg, 0 = one line)
//   line      a thrust's arm line: shoulder → grip against the weapon (deg; a thrust in line ≤ ~10)
//   bel       the weapon's elevation (deg, + = the point up)
//   tilt      the point's path off level over the strike (deg; 0 a flat sweep, ~90 an upright bar:
//             at the game camera a cut reads as a diagonal at ~25 - 60)
//   kR / kL   the knees (hip, knee, ankle; deg)
//   ff        the front foot's height off the floor (cm; the strike lands with the front footfall: ~0)
//   kick      a kick (part 'feet', a foot off the floor): the kicking knee (deg) and the foot's reach
//             (hip → ankle over the leg's length; 1 = the leg straight out)
// and for a DRAW (or a bare-blade beat) through its windup and cut:
//   hilt      the right fist's distance from the hilt's middle in the scabbard at the cock (cm; the hand
//             on the grip: ≤ ~4)
//   pull      the left (scabbard) hand's travel along his facing from the cock to 4 frames after the
//             cut (cm; < 0 = drawn back: saya-biki, the scabbard pulled back as the blade leaves)
//   out       the angle between the blade at the cut's end and the scabbard's line at the cock (deg:
//             how far round the blade swings out of the sheath in the cut)
// Per move: the free (left) hand's fastest speed (m/s) and the worst one-frame second difference of the
// tracked joints (a pop, mm).

const DEG = 180 / Math.PI;

/** `H`: { THREE, build, duel, run, DT, MOVES, names, phaseOf(name) → phase, setPhase(G, phase) }. */
export function sheathAudit(H) {
  const { THREE, build, duel, run, DT, MOVES, names } = H;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ang3 = (a, b, c) => Math.acos(clamp(V().subVectors(a, b).normalize().dot(V().subVectors(c, b).normalize()), -1, 1)) * DEG;
  const angV = (u, w) => Math.acos(clamp(u.clone().normalize().dot(w.clone().normalize()), -1, 1)) * DEG;
  const inv = new THREE.Matrix4();
  function sample(game) {
    const d = game.dragon, R = d.rig, B = d.kit.blade;
    R.root.updateMatrixWorld(true);
    inv.copy(R.root.matrixWorld).invert();
    const at = (o, x = 0, y = 0, z = 0) => V(x, y, z).applyMatrix4(o.matrixWorld);
    const off = d.sheathParts?.off;
    const W = {
      shR: at(R.arms.R.upper), elR: at(R.arms.R.fore), grip: at(R.sword),
      shL: at(R.arms.L.upper), elL: at(R.arms.L.fore), wrL: at(R.arms.L.wrist ?? R.arms.L.fore),
      hipR: at(R.legs.R.thigh), knR: at(R.legs.R.shin), anR: at(R.legs.R.foot),
      hipL: at(R.legs.L.thigh), knL: at(R.legs.L.shin), anL: at(R.legs.L.foot),
      head: at(R.head, 0, 0.13, 0), chest: at(R.chest, 0, 0.12, 0), pelvis: at(R.pelvis),
      guard: at(R.sword, 0, 0, B.guard ?? 0.1), tip: at(R.sword, 0, 0, B.tip ?? 1),
      hilt: off ? at(off, 0, 0, -0.15) : at(R.pelvis), mouth: off ? at(off, 0, 0, 0) : at(R.pelvis), back: off ? at(off, 0, 0, 0.5) : at(R.pelvis),
    };
    const Bf = {};
    for (const k in W) Bf[k] = W[k].clone().applyMatrix4(inv);
    R.chest.updateMatrixWorld(true);
    return { W, B: Bf, sheath: d.sheath, chestInv: R.chest.matrixWorld.clone().invert() };
  }
  const rows = [];
  for (const name of names) {
    const def = MOVES[name];
    const phase = H.phaseOf(name);
    const G = build();
    const band = def.band ?? [0, 4];
    const dist = clamp((band[0] + Math.min(band[1], 8)) / 2, 1.6, 7);
    duel(G, { dist });
    const { game } = G;
    const d = game.dragon, p = game.player;
    p.debug.god = true;
    if (phase > 1) H.setPhase(G, phase);
    run(G, 0.6);
    d.position.set(0, 0, 0);
    d.yaw = Math.PI / 2;
    p.debug.teleport(dist, 0);
    run(G, 0.7);
    if (!d.debug.trigger(name)) { rows.push({ name, phase, fail: 'trigger' }); continue; }
    const A = d.brain.act;
    const F = [];
    let px = d.position.x, pz = d.position.z;
    for (let i = 0; i < 1500 && d.brain.act === A; i++) {
      p.hp = p.maxHp;
      p.debug.teleport(p.position.x, p.position.z);
      const s = sample(game);
      s.t = A.t;
      s.jump = Math.hypot(d.position.x - px, d.position.z - pz) > 0.25;
      px = d.position.x;
      pz = d.position.z;
      s.hs = game.hitstopTimer > 0;
      F.push(s);
      G.tick(DT);
    }
    const legL = (s, k) => s.B['hip' + k].distanceTo(s.B['kn' + k]) + s.B['kn' + k].distanceTo(s.B['an' + k]);
    const floor = Math.min(...F.map((s) => Math.min(s.B.anR.y, s.B.anL.y)));
    const at = (t) => { const i = F.findIndex((s) => s.t >= t - 1e-6); return i < 0 ? F.length - 1 : i; };
    const imp = [];
    for (const b of A.beats) {
      if (b.feint) continue;
      const i = at(b.impact), s = F[i], B = s.B;
      const blade = V().subVectors(B.tip, B.guard);
      const i0 = Math.max(0, i - 3), i1 = Math.min(F.length - 1, i + 1);
      const path = V().subVectors(F[i1].B.tip, F[i0].B.tip);
      const front = B.anR.z > B.anL.z ? 'R' : 'L';
      const r = {
        i: b.index ?? A.beats.indexOf(b), tell: b.def.tell ?? '-', part: b.def.part ?? '', draw: !!(b.def.draw || b.def.bare),
        el: Math.round(ang3(B.shR, B.elR, B.grip)),
        wrist: Math.round(angV(V().subVectors(B.grip, B.elR), blade)),
        line: Math.round(angV(V().subVectors(B.grip, B.shR), blade)),
        bel: Math.round(Math.asin(clamp(blade.clone().normalize().y, -1, 1)) * DEG),
        tilt: path.length() > 0.02 ? Math.round(Math.atan2(Math.abs(path.y), Math.hypot(path.x, path.z)) * DEG) : null,
        kR: Math.round(ang3(B.hipR, B.knR, B.anR)), kL: Math.round(ang3(B.hipL, B.knL, B.anL)),
        ff: Math.round((B['an' + front].y - floor) * 100),
      };
      if (b.def.part === 'feet') {
        const k = B.anR.y > B.anL.y ? 'R' : 'L';
        if (B['an' + k].y - floor > 0.25) r.kick = { leg: k, knee: Math.round(ang3(B['hip' + k], B['kn' + k], B['an' + k])), reach: +(B['hip' + k].distanceTo(B['an' + k]) / legL(s, k)).toFixed(2) };
      }
      if (r.draw) {
        const ck = at(b.start + (b.def.cock ?? 0.93) * (b.impact - b.start));
        const cS = F[ck].B, aS = F[Math.min(F.length - 1, i + 4)].B;
        r.hilt = Math.round(cS.grip.distanceTo(cS.hilt) * 100);
        if (globalThis.process?.env?.GCD_HILT) {
          // (the way from the fist to the hilt, in the chest's frame: what to add to a pose's rH)
          const ch = F[ck].chestInv, v = V().subVectors(F[ck].W.hilt, F[ck].W.grip).transformDirection(ch);
          const wl = V().subVectors(F[ck].W.hilt, F[ck].W.grip).length();
          globalThis.process.stdout.write(`      ${name} b${r.i} cock: fist → hilt ${(wl * 100).toFixed(1)} cm, chest frame [${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}]
`);
        }
        r.pull = Math.round((aS.mouth.z - cS.mouth.z) * 100);
        r.out = Math.round(angV(V().subVectors(aS.tip, aS.guard), V().subVectors(cS.back, cS.mouth).negate()));
      }
      imp.push(r);
    }
    let freeV = 0, pop = 0, popK = '', popT = 0;
    for (let i = 1; i < F.length; i++) {
      if (F[i].jump || F[i - 1].jump || F[i].hs) continue;
      freeV = Math.max(freeV, F[i].B.wrL.distanceTo(F[i - 1].B.wrL) / DT);
      if (i > 1 && !F[i - 2].jump) for (const k of ['grip', 'wrL', 'elR', 'elL', 'knR', 'knL', 'anR', 'anL', 'head', 'pelvis', 'tip']) {
        const j = V().copy(F[i].B[k]).addScaledVector(F[i - 1].B[k], -2).add(F[i - 2].B[k]).length() * 1000;
        if (j > pop) { pop = j; popK = k; popT = F[i].t; }
      }
    }
    rows.push({ name, phase, label: def.label, frames: F.length, freeV: +freeV.toFixed(1), pop: Math.round(pop), popK, popT: +popT.toFixed(2), imp });
  }
  return rows;
}

export function printSheathAudit(rows, out) {
  out('   move              ph   f   freeV  pop(mm @t)          | per impact: tell part  el wrist line bel tilt  kR/kL  ff  [kick knee/reach] [draw hilt/pull/out]');
  for (const r of rows) {
    if (r.fail) { out(`   ${r.name} FAIL ${r.fail}`); continue; }
    out(`   ${r.name.padEnd(17)} ${r.phase}  ${String(r.frames).padStart(4)}  ${String(r.freeV).padStart(5)}  ${`${r.pop} ${r.popK}@${r.popT}`.padEnd(19)} |`);
    for (const x of r.imp) {
      const k = x.kick ? `  kick ${x.kick.leg} ${x.kick.knee}°/${x.kick.reach}` : '';
      const dr = x.draw ? `  draw hilt ${x.hilt}cm pull ${x.pull}cm out ${x.out}°` : '';
      out(`        b${x.i} ${String(x.tell).padEnd(6)} ${String(x.part).padEnd(5)} ${String(x.el).padStart(4)} ${String(x.wrist).padStart(5)} ${String(x.line).padStart(4)} ${String(x.bel).padStart(4)} ${String(x.tilt ?? '-').padStart(4)}  ${x.kR}/${x.kL}  ${String(x.ff).padStart(3)}${k}${dr}`);
    }
  }
}
