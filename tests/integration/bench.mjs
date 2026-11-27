// The bench: the same five mortal bots (god mode OFF) against any duelist boss, whole fights, so bosses
// can be compared on one scale (the Untouched's tuning pass). A helper, not a suite: veil.mjs, city.mjs
// and asc.mjs each run it as their opt-in scenario `bench`, handing it their own harness (build, duel,
// run ...). Reported, not asserted.
//   env: GCD_BSEEDS (default 4242,7,99,1,23,512), GCD_BBOTS (default fencing,pace,blocker,roller,perfect),
//        GCD_BSECS (a fight's cap, default 600), GCD_BMOVES=1 (damage by move per run),
//        GCD_BSET (a JSON object deep-merged into the boss's TUNING before the first fight: a settings probe,
//        e.g. '{"hp":20000,"wjBarrier":{"cracks":2}}'; arrays are replaced whole)
//
// The bots (all drink a flask below 60 HP in his openings, the second half of a recovery, or out of reach):
//   fencing  the suites' fencer, mortal and good, not perfect: it answers a share of his cues
//            (GCD_BSKILL, default 0.9; the rest it misses: seeded per seed), parrying a normal / blue cue
//            0.12 s before the impact (an ordinary parry) and rolling through a red / black 0.1 s before
//            (a perfect dodge); cuts in his openings and pokes now and then. (At skill 1 it takes no hit
//            from any boss: the suites' god-mode fencer is a perfect answerer.)
//   pace     the suites' pace defender, mortal: holds the guard through a normal / blue blow, rolls 0.28 s
//            before a red / black one (not a perfect dodge), never attacks: how long it lives.
//   blocker  holds the guard always, dodges nothing; lets go only to cut in his openings.
//   roller   perfect-dodges every red / black (0.1 s), holds the guard through the rest; cuts in openings.
//   perfect  the skill ceiling: a perfect parry of every normal / blue cue (0.04 s before the impact), a
//            perfect dodge of every red / black (0.08 s before); cuts in his openings.
//   good     a good human (the tuning pass, round 3): of his normal / blue cues 70 % pressed a shade early,
//            0.235 s before the impact, and HELD past it (the ordinary parry's band is 0.20 - 0.22 s, ADR-227: a
//            press in it parries, an earlier one blocks; measured, ~45 % ordinary parries, ~35 % blocks), 20 % a
//            perfect parry (0.08 s), 10 % missed; every red / black rolled, 75 % on time (0.1 s: a perfect
//            dodge), 25 % early (0.32 s: a plain roll); cuts in his openings and pokes now and then (seeded).
// Reported per run besides: the barrier's open seconds per minute and the damage he took per opening.

export const BOTS = ['good', 'fencing', 'pace', 'blocker', 'roller', 'perfect'];

/** The fencing bot's misses: a seeded stream of its own (null: it answers everything). */
const P_SKILL = (bot, skill, mulberry32, seed) => {
  if (!POLICY[bot]?.skill || !(skill < 1) || !mulberry32) return null;
  const r = mulberry32(seed * 977 + Math.round(skill * 100));
  return () => r() > skill;
};
const POLICY = {
  fencing: { red: { lead: 0.1 }, other: { parry: 0.12 }, attack: 'fence', skill: true },
  pace: { red: { lead: 0.28 }, other: { guard: true }, attack: 'none' },
  blocker: { red: null, other: { guard: true }, attack: 'open', alwaysGuard: true },
  roller: { red: { lead: 0.1 }, other: { guard: true }, attack: 'open' },
  perfect: { red: { lead: 0.08 }, other: { parry: 0.04 }, attack: 'fence' },
  good: { red: { lead: 0.1 }, other: { parry: 0.235 }, attack: 'fence', human: { ordinary: 0.7, perfect: 0.2, perfectLead: 0.08, early: 0.25, earlyLead: 0.32 } },
};

/** H: { build, duel, run, TUNING, TELL, DT, THREE } of the calling suite. */
export function benchRun(H, seed, bot, { secs = 600, skill = 0.9 } = {}) {
  const { build, duel, run, TUNING, TELL, DT, THREE, mulberry32 } = H;
  const miss = P_SKILL(bot, skill, mulberry32, seed);
  const P = POLICY[bot];
  // (the good bot's hand: a seeded stream of its own per seed)
  const hand = P.human && mulberry32 ? mulberry32(seed * 7919 + 31) : null;
  const G = build(seed, true);
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  // (GCD_BFORM=n: the fight starts in phase n, through its real transitions, and stays in it: a probe)
  const form = Number(process.env.GCD_BFORM ?? 1);
  duel(G, { dist: 3, ai: false, form });
  d.debug.setAI(true);
  p.debug.god = false;
  const lead = (src) => (src === 'world' ? 0.3 : Array.isArray(TUNING.flashLead) ? TUNING.flashLead[Math.max(0, d.phase - 1)] : TUNING.flashLead);
  const pend = [];
  let guardUntil = -1, missed = 0;
  const isRed = (t) => t === TELL.RED || t === TELL.BLACK;
  const defend = {
    onEvent(n, e) {
      if (n !== 'combat:flash' || (e?.source !== 'dragon' && e?.source !== 'world')) return;
      if (miss?.()) { missed++; return; }
      let ans = undefined;
      if (hand) {
        const u = hand(), Hm = P.human;
        if (isRed(e.tell)) ans = u < Hm.early ? Hm.earlyLead : P.red.lead;
        else if (u < Hm.ordinary) ans = P.other.parry;
        else if (u < Hm.ordinary + Hm.perfect) ans = Hm.perfectLead;
        else { missed++; return; }
      }
      pend.push({ tell: e.tell, attack: e.attack, at: game.time + lead(e.source), x: e.x, z: e.z, hazard: !!e.hazard && !e.bullet, done: false, ans });
    },
    act() {
      const t = game.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.5) pend.splice(i, 1);
      let busy = false;
      for (const e of pend) {
        if (e.done) continue;
        const left = e.at - t - DT;
        if (isRed(e.tell)) {
          if (!P.red) { e.done = true; continue; }
          if (left <= (e.ans ?? P.red.lead)) {
            e.done = true;
            input.up(1);
            guardUntil = -1;
            const c = e.hazard ? { x: e.x, z: e.z } : d.position, q = p.position;
            const dx = q.x - c.x, dz = q.z - c.z, l = Math.hypot(dx, dz) || 1;
            input.axis = e.hazard ? { x: dx / l, y: -dz / l } : { x: dz / l, y: dx / l };
            input.tap('Space');
            busy = true;
          }
        } else if (P.other.parry !== undefined) {
          if (left <= (e.ans ?? P.other.parry)) {
            e.done = true;
            // (the good bot holds the guard from its press to past the impact, as a person does: a press in
            // the parry window parries, an early one blocks; a tap released early would have answered nothing)
            if (P.human) { input.press(1); guardUntil = Math.max(guardUntil, e.at + 0.15); }
            else { input.up(1); input.click(1); }
            busy = true;
          }
        } else if (P.other.guard) {
          e.done = true;
          guardUntil = Math.max(guardUntil, e.at + 0.2);
        }
      }
      if (P.alwaysGuard) guardUntil = Infinity;
      // (busy until each answered cue's impact is past: a cut started inside a roll turns it into the roll's
      // attack and gives up its i-frames: the perfect bot was hit so, seed 99, a red 0.08 s after it rolled)
      return busy || pend.some((e) => (!e.done && e.at - t < 0.7) || (e.done && e.at + 0.25 > t));
    },
    dueWithin(s) { const t = game.time; return pend.some((e) => !e.done && e.at - t < s); },
  };
  G.defend = defend;

  // what hurt him, and whether it was answered
  const hurt = [];
  let curAtk = null;
  const th = p.takeHit.bind(p);
  p.takeHit = (h) => { curAtk = h?.attack ?? null; const r = th(h); curAtk = null; return r; };
  const n = { parries: 0, perfect: 0, dodges: 0, heals: 0, blocks: 0, guardBreaks: 0, guardOpens: 0, openThenCue: 0, openThenHit: 0 };
  const flog = [];
  const diag = { openAt: -9, openFlash: false, openHit: false, touchAt: 0, untouched: 0 };
  const phAt = [game.time];
  const w0 = G.watch;
  G.watch = (ev, e) => {
    w0?.(ev, e);
    if (ev === 'player:hurt' && e?.damage > 0) hurt.push([game.time, e.damage, curAtk || e.kind || d.brain.act?.name || d.mode, d.phase]);
    // (GCD_BHIT=1: each hit and the cues before it)
    if (process.env.GCD_BHIT) { if (ev === 'combat:flash') flog.push([game.time, e?.attack, e?.tell, e?.source]); if (ev === 'combat:tell') flog.push([game.time, 'tell:' + e?.attack, e?.tell, e?.impactIn?.toFixed?.(2)]); if (ev === 'player:hurt' && e?.damage > 0) H.out(`      HIT @${(game.time - t0).toFixed(2)} ${curAtk} ${e.damage.toFixed(0)} hero ${p.state} stateT ${p.stateT?.toFixed(2)} dist ${Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z).toFixed(2)} | ${flog.filter((x) => x[0] > game.time - 2).map((x) => `${(x[0] - t0).toFixed(2)} ${x[1]} ${x[2]} ${x[3] ?? ''}`).join(' · ')}`); }
    if (ev === 'player:parry') { n.parries++; if (e?.perfect) n.perfect++; }
    if (ev === 'player:perfectDodge') n.dodges++;
    if (ev === 'player:heal') n.heals++;
    if (ev === 'player:block') n.blocks++;
    if (ev === 'player:guardBreak') n.guardBreaks++;
    if (ev === 'player:guardOpen') { n.guardOpens++; diag.openAt = game.time; diag.openFlash = diag.openHit = false; }
    // (what follows a guard knocked open within 1.2 s: a cue of his, a blow that lands)
    if (game.time - diag.openAt < 1.2) {
      if (ev === 'combat:flash' && e?.source === 'dragon' && !diag.openFlash) { diag.openFlash = true; n.openThenCue++; }
      if (ev === 'player:hurt' && e?.damage > 0 && !diag.openHit) { diag.openHit = true; n.openThenHit++; }
    }
    // (the hero's blade on him: a cut that lands or stops on the barrier)
    if (ev === 'player:hitDragon' || (ev === 'dragon:barrier' && e?.state === 'stop')) { diag.untouched = Math.max(diag.untouched, game.time - diag.touchAt); diag.touchAt = game.time; }
    if (/^dragon:phase[234]$/.test(ev)) phAt.push(game.time);
  };
  const t0 = game.time;
  diag.touchAt = t0;
  // (GCD_BTOUCH=1: what reached him, each time: the hero's state and the hit's kind)
  if (process.env.GCD_BTOUCH) { const th0 = d.takeHit.bind(d); d.takeHit = (o = {}) => { H.out(`      touch @${(game.time - t0).toFixed(1)} hero ${p.state} kind ${o.kind ?? '-'} attack ${o.attack ?? o.move ?? '-'} exact ${!!o.exact} dmg ${o.damage}`); return th0(o); }; }
  let outcome = 'time';
  const tgt = new THREE.Vector3();
  // (the barrier: s open, his damage taken while it is open and while it stands)
  const bm = { open: 0, dmgOpen: 0, dmgUp: 0, prev: d.hp, wasOpen: false, t: game.time };
  run(G, secs, () => {
    {
      const nowOpen = !!d.barrier && !d.barrier.up, h = d.hp;
      if (h < bm.prev) { if (nowOpen || bm.wasOpen) bm.dmgOpen += bm.prev - h; else bm.dmgUp += bm.prev - h; }
      bm.prev = h;
      if (bm.wasOpen) bm.open += game.time - bm.t;
      bm.t = game.time;
      bm.wasOpen = nowOpen;
    }
    if (form > 1 && d.brain.pendingPhase > form) d.brain.pendingPhase = 0;
    input.axis = { x: 0, y: 0 };
    if (!p.alive || game.state !== 'boss') return;
    d.lockPoint(tgt);
    game.mouseGround.set(tgt.x, 0, tgt.z);
    const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z, dist = Math.hypot(dx, dz);
    const tick = (game.realTime * 60) | 0;
    if (p.state === 'lock') { if (tick % 5 === 0) input.click(0); return; }
    const busy = defend.act();
    const a = d.brain.act;
    const open = d.broken || (d.mode === 'react' && ['recoil', 'stagger', 'flinch', 'reeling', 'trampled'].includes(d.brain.react?.kind)) || (a && a.t > a.recoveryStart) || p.critTimer > 0;
    // (a person drinks in the second half of his move's recovery too: asc.mjs GCD_PRDRINK=human)
    const opening = d.broken || d.mode === 'react' || (d.mode === 'act' && !!a && a.t > (a.recoveryStart + a.end) / 2);
    if (p.hp < 60 && p.flasks > 0 && (opening || dist > 6) && !defend.dueWithin(0.7) && ['idle', 'run', 'block'].includes(p.state) && tick % 6 === 0) { input.up(1); input.tap('KeyF'); return; }
    if (dist > 2.6 && !busy) input.axis = { x: dx / dist, y: -dz / dist };
    let swing = false;
    if (P.attack === 'fence') swing = !busy && dist < 3.2 && (open ? tick % 20 === 0 : tick % 70 === 0);
    else if (P.attack === 'open') swing = !busy && dist < 3.2 && open && !defend.dueWithin(0.45) && tick % 20 === 0;
    else if (P.attack === 'none') swing = false;
    // (the execution of a broken boss for the pace defender too: it never cuts otherwise)
    if (P.attack === 'none' && d.broken && dist < 3.2 && tick % 12 === 0) swing = true;
    const guardNow = guardUntil > game.time;
    if (swing) { input.up(1); input.click(0); }
    else if (guardNow) input.press(1);
    else if (guardUntil > 0) { guardUntil = P.alwaysGuard ? guardUntil : -1; input.up(1); }
  }, () => {
    if (d.mode === 'dead' || game.state === 'victory') { outcome = 'won'; return true; }
    if (!p.alive) { outcome = 'died'; return true; }
    return false;
  });
  G.watch = w0;
  G.defend = null;
  const T = game.time - t0;
  const byMove = hurt.reduce((m, h) => ((m[h[2]] = (m[h[2]] || 0) + h[1]), m), {});
  const killer = outcome === 'died' ? hurt[hurt.length - 1]?.[2] ?? '?' : null;
  const worst = hurt.reduce((m, h) => (h[1] > m[1] ? h : m), [0, 0, '']);
  const perPh = phAt.map((x, i) => (phAt[i + 1] ?? game.time) - x);
  const opens = d.barrier?.stats ? Object.values(d.barrier.stats.opens).reduce((a, x) => a + x, 0) : 0;
  return {
    openPerMin: T > 0 ? bm.open / (T / 60) : 0, opens, dmgPerOpen: opens ? bm.dmgOpen / opens : 0, dmgOpen: bm.dmgOpen, dmgUp: bm.dmgUp,
    seed, bot, outcome, T, phase: d.phase, bar: Math.max(0, d.hp) / (d.maxHp ?? TUNING.hp), hp: p.hp,
    flasks: p.maxFlasks - p.flasks, hits: hurt.length, dmg: hurt.reduce((s, h) => s + h[1], 0), killer,
    worst: worst[1], worstBy: worst[2], perPh, missed, spared: d.parts?.melee?.stats?.spared ?? null, untouched: Math.max(diag.untouched, game.time - diag.touchAt), turns: d.patience?.stats?.turns ?? null, byMove, barrier: d.barrier?.stats ? { ...d.barrier.stats } : null, ...n,
  };
}

const stat = (v) => (v.length ? { min: Math.min(...v), mean: v.reduce((a, x) => a + x, 0) / v.length, max: Math.max(...v) } : null);

/** The scenario body: every bot x every seed, a line per run and a summary per bot. */
export async function benchScenario(H, who) {
  const { out } = H;
  const seeds = (process.env.GCD_BSEEDS ?? '4242,7,99,1,23,512').split(',').map(Number);
  const bots = (process.env.GCD_BBOTS ?? BOTS.join(',')).split(',');
  const secs = Number(process.env.GCD_BSECS ?? 600);
  const skill = Number(process.env.GCD_BSKILL ?? 0.9);
  if (process.env.GCD_BSET) {
    const merge = (t, o) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') merge(t[k], v); else t[k] = v; } };
    merge(H.TUNING, JSON.parse(process.env.GCD_BSET));
    out(`   (GCD_BSET ${process.env.GCD_BSET})`);
  }
  out(`\n== scenario BENCH (${who}: mortal bots, whole fights of at most ${secs} s; seeds ${seeds.join(', ')}; the fencing bot answers ${Math.round(skill * 100)} % of cues) ==`);
  const all = [];
  for (const bot of bots) {
    for (const seed of seeds) {
      const r = benchRun(H, seed, bot, { secs, skill });
      all.push(r);
      out(`   ${bot.padEnd(8)} seed ${String(seed).padEnd(5)} ${r.outcome.padEnd(5)} ${r.T.toFixed(0).padStart(4)} s · phase ${r.phase} bar ${(r.bar * 100).toFixed(0)} % · phases ${r.perPh.map((x) => x.toFixed(0)).join(' / ')} s · hits ${r.hits} for ${r.dmg.toFixed(0)} · flasks ${r.flasks} · worst ${r.worst.toFixed(0)} (${r.worstBy}) · parries ${r.parries} (perfect ${r.perfect}) · dodges ${r.dodges} · blocks ${r.blocks} · guard opened ${r.guardOpens} (then a cue ${r.openThenCue}, a landed blow ${r.openThenHit}) · longest untouched ${r.untouched.toFixed(0)} s${r.turns !== null ? ` (he stopped waiting ${r.turns}x)` : ''} · guard broken (red) ${r.guardBreaks}${r.missed ? ` · cues missed ${r.missed}` : ''}${r.spared !== null ? ` · spared ${r.spared}` : ''}${r.killer ? ` · KILLED BY ${r.killer}` : ''}${r.barrier ? ` · barrier ${JSON.stringify(r.barrier)}` : ''} · open ${r.openPerMin.toFixed(1)} s/min, ${r.opens} openings, ${r.dmgPerOpen.toFixed(0)} dmg each (open ${r.dmgOpen.toFixed(0)} / through it ${r.dmgUp.toFixed(0)})`);
      if (process.env.GCD_BMOVES) out(`        damage by move: ${Object.entries(r.byMove).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')}`);
    }
  }
  out(`   -- ${who}: summary by bot (won / runs · win time min / mean / max · death time mean · flasks mean · deaths by) --`);
  for (const bot of bots) {
    const rs = all.filter((r) => r.bot === bot), won = rs.filter((r) => r.outcome === 'won'), died = rs.filter((r) => r.outcome === 'died');
    const T = stat(won.map((r) => r.T)), D = stat(died.map((r) => r.T));
    const kills = died.reduce((m, r) => ((m[r.killer] = (m[r.killer] || 0) + 1), m), {});
    out(`   SUMMARY ${who} ${bot.padEnd(8)} won ${won.length}/${rs.length}${T ? ` in ${T.min.toFixed(0)} / ${T.mean.toFixed(0)} / ${T.max.toFixed(0)} s` : ''} · died ${died.length}${D ? ` at ${D.mean.toFixed(0)} s mean` : ''} · timed out ${rs.length - won.length - died.length} · flasks ${stat(rs.map((r) => r.flasks)).mean.toFixed(1)} · his bar left mean ${(stat(rs.map((r) => r.bar)).mean * 100).toFixed(0)} %${Object.keys(kills).length ? ` · deaths by ${Object.entries(kills).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''} · barrier open ${stat(rs.map((r) => r.openPerMin)).mean.toFixed(1)} s/min · ${stat(rs.map((r) => r.dmgPerOpen)).mean.toFixed(0)} dmg per opening · parries ${stat(rs.map((r) => r.parries)).mean.toFixed(0)} (perfect ${stat(rs.map((r) => r.perfect)).mean.toFixed(0)}) · hits ${stat(rs.map((r) => r.hits)).mean.toFixed(1)}`);
  }
  return all;
}
