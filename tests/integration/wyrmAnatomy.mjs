// The Cinder Wyrm's blows as ANATOMY (ADR-257; integ.mjs `wyrmanatomy`, opt-in): every melee string and
// single blow run once from the same start on a still hero, the rig's joints recorded every frame, and per
// blow (each combat:tell) at its contact:
//
//   gap     the striking part's distance to the hero's chest at the announced impact (m): does the drawn
//           blow land on the beat (a claw / bite / tail that is still 2 m off when the hit lands reads as
//           a hitbox bigger than the picture)
//   gapMin  ... its closest within [impact - 0.12, impact + 0.25] s, and when (dt, s after the impact)
//   limb    a foreleg's elbow angle (shoulder - elbow - wrist, deg; 180 straight) and its reach
//           (|shoulder -> wrist| / (humerus + forearm)) at the contact: a raking or smashing paw at full
//           extension reads as reach, a bent one as a pat
//   neck    a bite's neck length at the contact over its length at the blow's start (the uncoil)
//   chain   the order the links reach their top speed in the strike window [impact - 0.4, impact + 0.1]:
//           successive breaking (the root first, the tip last: hips, chest, neck base, head for a bite;
//           shoulder, elbow, wrist, paw for a claw; tail base, 1/3, 2/3, tip for a tail; wing root,
//           elbow, wrist, the finger tip for a wing) and the tip's lag after the root (ms). Every link
//           peaking on the same frame is the "everything starts and stops together" stiffness
//   load    a wing blow's wrist: its highest in the windup over its height at the start, and at the contact
//   slide   the planted feet's skating on the ground through the blow (m, worst foot)
//   pop     the worst one-frame change of speed of any tracked joint in the blow (m / frame^2 x 60, i.e.
//           m/s gained in one frame) and which joint
//
// usage: const A = makeWyrmAnatomy({ THREE, G, DT, SCALE, ANATOMY, place, settle, ATTACKS, kindOf });
//        A.measure(name, { units, ang, phase }) -> row; A.print(out, row)
export function makeWyrmAnatomy({ THREE, G, DT, SCALE, ANATOMY, settle, place, ATTACKS, kindOf = null }) {
  const V = () => new THREE.Vector3();
  const deg = (r) => (r * 180) / Math.PI;
  const angle = (a, b, c) => {
    const u = V().subVectors(a, b).normalize(), w = V().subVectors(c, b).normalize();
    return deg(Math.acos(Math.max(-1, Math.min(1, u.dot(w)))));
  };
  const ARM_L = (ANATOMY.humerus + ANATOMY.forearm) * SCALE;

  function snapshot(d, p) {
    const pt = d.rig.pt, tl = d.rig.tail, n = tl.n;
    const c = (v) => v.clone();
    const tq = [0, Math.round(n / 3), Math.round((2 * n) / 3), n];
    return {
      t: G.game.time,
      hero: V().set(p.position.x, p.position.y + 1.1, p.position.z),
      root: V().set(d.position.x, 0, d.position.z), hips: c(pt.hips), chest: c(pt.chest), neckBase: c(pt.neckBase), head: c(pt.head), snout: c(pt.snout),
      arms: pt.arms.map((a) => ({ shoulder: c(a.shoulder), elbow: c(a.elbow), wrist: c(a.wrist), toe: c(a.toe) })),
      legs: pt.legs.map((l) => ({ toe: c(l.toe) })),
      wings: pt.wings.map((w) => ({ root: c(w.root), elbow: c(w.elbow), wrist: c(w.wrist), tip: c(w.tips[1]) })),
      tail: tq.map((i) => c(tl.p[i])),
    };
  }
  // the chain a part's blow travels down, root first
  const chainOf = (part, wi) => {
    if (part === 'claw' || part === 'forefeet' || part === 'wrists') {
      const k = wi ?? 0;
      return [['shoulder', (f) => f.arms[k].shoulder], ['elbow', (f) => f.arms[k].elbow], ['wrist', (f) => f.arms[k].wrist], ['paw', (f) => f.arms[k].toe]];
    }
    if (part === 'wing' || part === 'wings') {
      const k = wi ?? 0;
      return [['root', (f) => f.wings[k].root], ['elbow', (f) => f.wings[k].elbow], ['wrist', (f) => f.wings[k].wrist], ['tip', (f) => f.wings[k].tip]];
    }
    if (part === 'tailTip' || part === 'tail') return [['base', (f) => f.tail[0]], ['t1/3', (f) => f.tail[1]], ['t2/3', (f) => f.tail[2]], ['tip', (f) => f.tail[3]]];
    return [['hips', (f) => f.hips], ['chest', (f) => f.chest], ['neck', (f) => f.neckBase], ['head', (f) => f.snout]];
  };
  const tipOf = (part, wi) => chainOf(part, wi).at(-1)[1];

  function measure(name, { units = 5.5, ang = 0, phase = 1, max = 14 } = {}) {
    const { game } = G;
    const d = game.dragon, p = game.player;
    settle(G);
    if (d.phase !== phase) d.enterPhase(phase);
    d.hazards?.clear?.();
    place(G, units * 1.25, ang); // (model units: place() scales by SCALE / 1.25)
    p.debug.god = true;
    const beats = [];
    const at0 = d.announceTell.bind(d);
    d.announceTell = (a, b) => {
      if (a.name === name) beats.push({ t0: game.time, imp: game.time + b.impactIn, part: b.part, wi: b.wi, tell: b.tell, kind: kindOf?.(name, b, a) ?? b.attack });
      return at0(a, b);
    };
    const F = [];
    d.brain.startAction(ATTACKS[name]);
    for (let i = 0; i < Math.round(max / DT); i++) {
      game.mouseGround.set(d.position.x, 0, d.position.z);
      G.tick(DT);
      p.debug.heal();
      if (!d.brain.action || d.brain.action.name !== name) break;
      F.push(snapshot(d, p));
      if (globalThis.process?.env?.GCD_TRACE) {
        const f = F[F.length - 1], ph = d.brain.action?.phase ?? '';
        if (/active|recovery/.test(ph) || d.brain.action.dur - d.brain.action.t < 0.15) globalThis.process.stdout.write(`    t ${game.time.toFixed(3)} ${ph.padEnd(9)} ${d.brain.action.t.toFixed(3)}  snout-hero ${f.snout.distanceTo(f.hero).toFixed(2)}  snout-look ${f.snout.distanceTo(d.pose.look).toFixed(2)}  head-goal ${d.rig.headPos.distanceTo(d.pose.headTarget).toFixed(2)}  hero ${p.position.x.toFixed(2)},${p.position.z.toFixed(2)}
`);
      }
    }
    d.announceTell = at0;
    const at = (t) => {
      let i = F.findIndex((f) => f.t >= t - 1e-6);
      return i < 0 ? F.length - 1 : i;
    };
    // (a hit's hit-stop runs the game in slivers of a frame: those frames are a deliberate freeze, not
    // motion, and are left out of speeds and pops)
    const real = (i) => i > 0 && F[i].t - F[i - 1].t > 0.9 * DT;
    const speed = (get, i) => (real(i) ? get(F[i]).distanceTo(get(F[i - 1])) / DT : 0);
    const per = beats.map((b) => {
      if (!F.length) return { ...b, fail: 'no frames' };
      const i0 = at(b.t0), iI = at(b.imp);
      const tip = tipOf(b.part, b.wi);
      const gap = tip(F[iI]).distanceTo(F[iI].hero);
      let gapMin = Infinity, iC = iI;
      for (let i = at(b.imp - 0.12); i <= at(b.imp + 0.25); i++) {
        const g = tip(F[i]).distanceTo(F[i].hero);
        if (g < gapMin) { gapMin = g; iC = i; }
      }
      const row = { tell: b.tell, kind: b.kind, part: b.part, wi: b.wi, W: +(b.imp - b.t0).toFixed(2), gap: +gap.toFixed(2), gapMin: +gapMin.toFixed(2), gapAt: +((iC - iI) * DT).toFixed(2) };
      const ch = chainOf(b.part, b.wi);
      // successive breaking: each link's top speed in the strike window, its time
      const w0 = Math.max(1, at(b.imp - 0.4)), w1 = Math.min(F.length - 1, at(b.imp + 0.1));
      row.chain = ch.map(([nm, get]) => {
        let best = 0, bi = w0;
        for (let i = w0; i <= w1; i++) { const s = speed(get, i); if (s > best) { best = s; bi = i; } }
        return { nm, at: Math.round((bi - iI) * DT * 1000), v: +best.toFixed(1) };
      });
      row.lag = row.chain.at(-1).at - row.chain[0].at;
      row.inOrder = row.chain.every((c, j) => j === 0 || c.at >= row.chain[j - 1].at);
      if (b.part === 'claw' || b.part === 'forefeet' || b.part === 'wrists') {
        const k = b.wi ?? 0, A = F[iC].arms[k];
        row.elbow = Math.round(angle(A.shoulder, A.elbow, A.wrist));
        row.reach = +(A.shoulder.distanceTo(A.wrist) / ARM_L).toFixed(2);
        // the most open the elbow gets through the active (the strike's fullest reach)
        let open = 0;
        for (let i = iI; i <= Math.min(F.length - 1, at(b.imp + 0.2)); i++) open = Math.max(open, angle(F[i].arms[k].shoulder, F[i].arms[k].elbow, F[i].arms[k].wrist));
        row.elbowMax = Math.round(open);
      } else if (b.part === 'wing' || b.part === 'wings') {
        const k = b.wi ?? 0;
        let hi = -Infinity;
        for (let i = i0; i <= iI; i++) hi = Math.max(hi, F[i].wings[k].wrist.y - F[i].chest.y);
        const s0 = F[i0].wings[k].wrist.y - F[i0].chest.y, sC = F[iC].wings[k].wrist.y - F[iC].chest.y;
        row.load = +(hi - s0).toFixed(2);
        row.drive = +(sC - hi).toFixed(2);
      } else if (b.part === 'tailTip' || b.part === 'tail') {
        // the tail's bow (deg): the outer third's heading against the inner third's, signed with the
        // turn (- = the tip trails behind the turn, + = it has cracked past), through the strike window
        let lo = 0, hi = 0, turn = 0;
        for (let i = w0; i <= w1; i++) {
          const A = F[i].tail, a0 = Math.atan2(A[1].x - A[0].x, A[1].z - A[0].z), a1 = Math.atan2(A[3].x - A[2].x, A[3].z - A[2].z);
          const P = F[i - 1].tail, pa = Math.atan2(P[1].x - P[0].x, P[1].z - P[0].z);
          turn += Math.atan2(Math.sin(a0 - pa), Math.cos(a0 - pa));
          const bow = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
          const sg = Math.sign(turn) || 1;
          lo = Math.min(lo, deg(bow) * sg);
          hi = Math.max(hi, deg(bow) * sg);
        }
        row.bow = [Math.round(lo), Math.round(hi)];
        // the tip's turn about the root against the middle's since the window opened (deg): how far it
        // falls behind (trail) and then runs past (crack)
        const br = (q, f) => Math.atan2(q.x - f.root.x, q.z - f.root.z);
        const W0 = F[w0], t0 = br(W0.tail[3], W0), m0 = br(W0.tail[1], W0);
        let tr = 0, cr = 0, mt = 0, sgn = 0;
        for (let i = w0; i <= Math.min(F.length - 1, at(b.imp + 0.35)); i++) {
          const dm = Math.atan2(Math.sin(br(F[i].tail[1], F[i]) - m0), Math.cos(br(F[i].tail[1], F[i]) - m0));
          const dt_ = Math.atan2(Math.sin(br(F[i].tail[3], F[i]) - t0), Math.cos(br(F[i].tail[3], F[i]) - t0));
          if (!sgn && Math.abs(dm) > 0.05) sgn = Math.sign(dm);
          if (!sgn) continue;
          const lag = (dt_ - dm) * sgn;
          tr = Math.min(tr, lag);
          cr = Math.max(cr, lag);
          mt = Math.max(mt, Math.abs(dm));
        }
        row.trail = [Math.round(deg(tr)), Math.round(deg(cr))];
      } else {
        const l0 = F[i0].neckBase.distanceTo(F[i0].head), lC = F[iC].neckBase.distanceTo(F[iC].head);
        row.neck = +(lC / Math.max(1e-3, l0)).toFixed(2);
        // the head ahead of the chest at the contact (m, along the line to the hero)
        const dir = V().subVectors(F[iC].hero, F[iC].chest).setY(0).normalize();
        row.headAhead = +V().subVectors(F[iC].snout, F[iC].chest).dot(dir).toFixed(2);
      }
      // planted feet skating (world xz while the toe stays on the ground, through the beat)
      // (not the striking paw: a rake drags its claws over the ground on purpose)
      const claw = b.part === 'claw' ? (b.wi ?? 0) : b.part === 'forefeet' || b.part === 'wrists' ? -2 : -1;
      const feet = [(f) => f.legs[0].toe, (f) => f.legs[1].toe, ...[0, 1].filter((k) => k !== claw && claw !== -2).map((k) => (f) => f.arms[k].toe)];
      let slide = 0;
      for (const get of feet) {
        let s = 0;
        for (let i = Math.max(1, i0); i <= Math.min(F.length - 1, at(b.imp + 0.3)); i++) {
          const a0 = get(F[i - 1]), a1 = get(F[i]);
          if (a0.y < 0.12 && a1.y < 0.12) {
            const m = Math.hypot(a1.x - a0.x, a1.z - a0.z);
            if (m < 0.2) s += m; // (a step's plant can land a frame low: only skating counts)
          }
        }
        slide = Math.max(slide, s);
      }
      row.slide = +slide.toFixed(2);
      // pops: the worst one-frame change of velocity of any joint in the beat (m/s gained in a frame)
      const joints = [['snout', (f) => f.snout], ['chest', (f) => f.chest], ['hips', (f) => f.hips], ...ch];
      let pop = 0, popK = '', popAt = 0;
      for (const [nm, get] of joints) {
        for (let i = Math.max(2, i0); i <= Math.min(F.length - 1, at(b.imp + 0.3)); i++) {
          if (!real(i) || !real(i - 1)) continue;
          const a = get(F[i]), m = get(F[i - 1]), o = get(F[i - 2]);
          const j = Math.hypot(a.x - 2 * m.x + o.x, a.y - 2 * m.y + o.y, a.z - 2 * m.z + o.z) / DT;
          if (j > pop) { pop = j; popK = nm; popAt = (i - iI) * DT; }
        }
      }
      row.pop = +pop.toFixed(1);
      row.popK = popK;
      row.popAt = +popAt.toFixed(2);
      return row;
    });
    return { name, frames: F.length, beats: per };
  }

  function print(out, r) {
    out(`  ${r.name.padEnd(14)} ${String(r.frames).padStart(4)}f`);
    for (const b of r.beats) {
      if (b.fail) { out(`      ${String(b.tell).padEnd(7)} FAIL ${b.fail}`); continue; }
      const chain = b.chain.map((c) => `${c.nm} ${c.at}`).join(' > ');
      const extra = b.bow ? `tail tip vs middle ${b.trail[0]}° .. +${b.trail[1]}° (trails .. cracks past)` : b.elbow != null ? `elbow ${b.elbow}° (max ${b.elbowMax}°) reach ${b.reach}` : b.load != null ? `wing load +${b.load} drive ${b.drive}` : b.neck != null ? `neck x${b.neck} head ahead ${b.headAhead} m` : '';
      out(`      ${String(b.tell).padEnd(7)} ${String(b.kind ?? '').padEnd(10)} W ${b.W.toFixed(2)}  gap ${b.gap.toFixed(2)} (min ${b.gapMin.toFixed(2)} @${b.gapAt >= 0 ? '+' : ''}${b.gapAt})  ${extra}`);
      out(`               chain ${chain} ms (lag ${b.lag}${b.inOrder ? '' : ' OUT OF ORDER'})  slide ${b.slide}  pop ${b.pop} ${b.popK}@${b.popAt}`);
    }
  }
  return { measure, print };
}
