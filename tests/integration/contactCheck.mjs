// The contact pass (ADR-259, combat/contact.js, `?contact=a`): headless checks on a duelist's suite.
//   rules     the same scripted exchange (his blows on the hero standing, on his guard, on his parry; the
//             hero's cuts on him, staggered and guarded) played with contact `0` and `a` from the same seed:
//             every result, every damage, the hero's health and guard, the boss's health and posture, the
//             clock each blow landed on are the SAME (the pass moves only the pose drawn)
//   meeting   with `a`, on the frame each hit / block is frozen: how deep the striker (his drawn steel or
//             fist, the hero's drawn steel) is in the struck body, against `0`; the hurt / block / cut
//             effects at the meeting point
//   reaction  the hero's body answers a hit (his HitReact on), and a boss's arm hit names the arm
// Used by duel.mjs (scenario `contact`) and asc.mjs (scenario `contact`: fists and feet).
/** H: the suite's harness { THREE, imp, build, duel, place, run, settle, home, DT, assert, out, RESULT, moves } */
export async function contactCheck(H) {
  const { THREE, imp, build, duel, place, run, settle, home, DT, assert, out, RESULT, moves } = H;
  const C = await imp('src/combat/contact.js');
  const { DIM } = await imp('src/entities/player/model.js');
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);

  function play(mode) {
    C.setContactMode(mode);
    const G = build();
    duel(G, { dist: 2.2 });
    const { game, input } = G;
    const d = game.dragon, p = game.player;
    p.debug.god = true;
    const log = [], depth = { hit: [], block: [], cut: [], short: [] }, fxOff = [];
    const body = new C.ContactBody(THREE), foe = new C.ContactBody(THREE);
    const A0 = new THREE.Vector3(), A1 = new THREE.Vector3(), P = new THREE.Vector3();
    let pending = null, fxAt = null, reacted = 0, arm = 0;
    const fxHurt = p.fx.hurt.bind(p.fx), fxBlock = p.fx.block.bind(p.fx);
    p.fx.hurt = (x, y, z, ...a) => ((fxAt = new THREE.Vector3(x, y, z)), fxHurt(x, y, z, ...a));
    p.fx.block = (x, y, z, ...a) => ((fxAt = new THREE.Vector3(x, y, z)), fxBlock(x, y, z, ...a));
    const take = p.takeHit;
    p.takeHit = (h) => {
      fxAt = null;
      const r = take(h);
      if (h?.attacker === d && (r === RESULT.HIT || r === RESULT.BLOCKED)) pending = { kind: r === RESULT.HIT ? 'hit' : 'block' };
      log.push([r, Math.round(h?.damage ?? 0), +(d.brain.clipT ?? 0).toFixed(4), Math.round(p.hp), Math.round(p.guard ?? 0)]);
      return r;
    };
    const dTake = d.takeHit.bind(d);
    d.takeHit = (o) => {
      const r = dTake(o);
      log.push(['cut', Math.round(r ?? 0), Math.round(d.hp), Math.round(d.posture)]);
      if (r > 0) pending = { kind: 'cut' };
      if (o?.limb?.startsWith?.('arm')) arm++;
      return r;
    };
    // after each tick: the frozen frame of the last contact, measured as drawn
    const tick = () => {
      if (!pending) return;
      const k = pending.kind;
      pending = null;
      if (k === 'cut') {
        if (!foe.fromRig(d.rig, d.drawScale || 1)) return;
        const s = p.rig.sword;
        A0.set(0, 0, DIM.bladeBase).applyMatrix4(s.matrixWorld);
        A1.set(0, 0, DIM.drawnTip).applyMatrix4(s.matrixWorld);
        depth.cut.push(Math.max(0, -foe.gap(A0, A1, C.CONTACT.edge)));
        return;
      }
      if (!body.fromRig(p.rig, p.drawScale || 1) || !d._tipOk) return;
      const limb = typeof d._part === 'string' && d._part !== 'sword';
      const g = limb ? body.gap(d._tip, d._tip, C.CONTACT.fist, P) : body.gap(d._hilt, d._tip, C.CONTACT.edge, P);
      if (k === 'hit') {
        depth.hit.push(Math.max(0, -g));
        depth.short.push(g);
        if (fxAt) fxOff.push(fxAt.distanceTo(P));
        if (p.hitReact?.active) reacted++;
      } else depth.block.push(Math.max(0, -g));
    };
    const runT = (sec, until = null) => run(G, sec, () => { G.input.axis = { x: 0, y: 0 }; game.mouseGround.set(d.position.x, 0, d.position.z); tick(); }, until);
    let n = 0;
    for (const answer of ['stand', 'block', 'parry']) {
      for (const name of moves) {
        const def = d.kit.MOVES[name], b0 = def?.beats?.find((b) => !b.feint && b.zone);
        home(G);
        place(G, Math.max(1.2, (b0?.zone?.r ?? 2) * 0.7));
        runT(0.3);
        if (!d.debug.trigger(name)) continue;
        n++;
        if (answer === 'block') input.press(1);
        const A = d.brain.act, done = new Set();
        runT(4, () => {
          if (answer === 'parry' && A === d.brain.act) {
            const b = A.beats.find((x) => !x.feint && x.impact > A.t && !done.has(x));
            if (b && b.impact - A.t <= 0.1) {
              done.add(b);
              input.click(1);
            }
          }
          return d.mode !== 'act';
        });
        input.up(1);
        tick();
        settle(G);
        p.debug.heal();
      }
    }
    // the hero's cuts: on him staggered (his guard down), then on his guard
    for (const open of [true, false]) {
      home(G);
      place(G, 1.7);
      runT(0.3);
      for (let s = 0; s < 3; s++) {
        if (open) d.debug.stagger();
        input.click(0);
        runT(0.45);
      }
      settle(G);
    }
    C.setContactMode('0');
    return { G, log, depth, fxOff, n, reacted, arm };
  }

  const R0 = play('0'), Ra = play('a'), Rb = play('b');
  for (const [m, R] of [['a', Ra], ['b', Rb]]) {
    const same = JSON.stringify(R0.log) === JSON.stringify(R.log);
    let first = -1;
    for (let i = 0; i < Math.max(R0.log.length, R.log.length) && first < 0; i++) if (JSON.stringify(R0.log[i]) !== JSON.stringify(R.log[i])) first = i;
    assert(same && R0.log.length > 10, `the rules do not move: ${R0.log.length} results of ${R0.n} moves and 6 cuts, the same with contact ${m}${same ? '' : ` (first difference at ${first}: ${JSON.stringify(R0.log[first])} → ${JSON.stringify(R.log[first])})`}`);
  }
  const pct = (a, f) => (a.length ? Math.round((100 * a.filter(f).length) / a.length) : 0);
  // (b: a blow that would fall short is reached into; how many hits are still 10 cm+ off his body)
  const sh = (R) => pct(R.depth.short, (g) => g > 0.1);
  out(`   short of his body by 10 cm+ at the freeze: ${sh(R0)} % → a ${sh(Ra)} % → b ${sh(Rb)} % of ${Rb.depth.short.length} hits`);
  assert(sh(Rb) <= sh(Ra), `b reaches into blows that would fall short (${sh(Ra)} → ${sh(Rb)} % short)`);
  for (const k of ['hit', 'block', 'cut']) {
    const a0 = R0.depth[k], a1 = Ra.depth[k];
    if (!a1.length) continue;
    out(`   ${k}: the striker in the struck body at the freeze, median ${(med(a0) * 100).toFixed(1)} → ${(med(a1) * 100).toFixed(1)} cm, through it (8 cm+) ${pct(a0, (x) => x > 0.08)} → ${pct(a1, (x) => x > 0.08)} % (${a1.length})`);
    assert(pct(a1, (x) => x > 0.08) <= Math.max(15, pct(a0, (x) => x > 0.08) / 2), `${k}: the blow is drawn ON what it struck, not through it (${pct(a1, (x) => x > 0.08)} % 8 cm+ deep)`);
  }
  if (Ra.fxOff.length) assert(med(Ra.fxOff) < 0.06, `the hurt is drawn at the meeting (median ${(med(Ra.fxOff) * 100).toFixed(1)} cm off it, ${Ra.fxOff.length})`);
  assert(Ra.reacted > 0 && R0.reacted === 0, `the hero's body answers a blow with contact a only (${Ra.reacted} hits answered, ${R0.reacted} with 0)`);
  return Ra.G;
}
