// The living world's own rules (src/world/life/life.js, "THE CONTRACT"), on every level.

/** What the living world may hold in the pools it shares with the fight (live particles, every piece on). */
const BUDGET = { alpha: 700, add: 500, fire: 400, own: 1400 };

export default {
  /** OFF IS FREE: with every piece off the living world spawns nothing and draws from no random stream. */
  off(T) {
    for (const id of T.LEVEL_IDS) {
      const base = T.build(id, 'off');
      base.step(6);
      const b = base.counts();
      T.assert(b.pools === 0, `${id}: life off makes no particle pool of its own (${b.pools})`);
      T.assert(base.life.takes('leaves') === false && base.life.takes('fireflies') === false && base.life.takes('mist') === false && base.life.takes('ash') === false, `${id}: life off takes nothing from the atmosphere`);
      const w = base.life.wind.at(3, 4, { x: 9, z: 9, k: 9 });
      T.assert(w.x === 0 && w.z === 0 && w.k === 0 && base.life.wind.level === 0, `${id}: life off: still air (${w.x}, ${w.z}, k ${w.k}, level ${base.life.wind.level})`);
      T.assert(base.life.weather.wet === 0 && base.life.weather.mist === 0 && base.life.weather.windK === 1 && base.life.litter.count === 0, `${id}: life off: clear weather, nothing lying`);
    }
  },

  /** Every piece on, on every level, for a minute with the hero running: no throw, no NaN, no
   *  Math.random, inside the shared pools' budget; then the fight starts and it calms. */
  all(T) {
    for (const id of T.LEVEL_IDS) {
      const before = T.build(id, 'off');
      before.step(20);
      const off = before.counts();
      const w = T.build(id, 'all', { feet: true });
      w.walk(2.5, -3);
      w.step(10);
      w.walk(-3, 1);
      w.step(10);
      w.walk(0, 0);
      w.world.gust(w.game.player.position.x + 3, w.game.player.position.z, 1.6, 20);
      w.step(40);
      const c = w.counts();
      const errs = Object.entries(w.life._errs).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`);
      T.assert(errs.length === 0, `${id}: no layer threw${errs.length ? ` (${errs.join(', ')})` : ''}`);
      T.assert(c.random === 0, `${id}: the living world draws nothing from Math.random (${c.random} calls inside life.update / life.gust / the feet in 60 s)`);
      // (the prints' pool is made on the first print: none on grass and stone, so not on every level)
      T.assert(c.pools >= 1, `${id}: the own pools were made inside the counted frames (${c.pools}: litter${w.life.steps.pool ? ', prints' : ''})`);
      T.assert(Math.random === T.countingRandom, `${id}: Math.random is the test's own again after the pools were built`);
      T.assert(c.alpha - off.alpha <= BUDGET.alpha && c.add - off.add <= BUDGET.add && c.fire - off.fire <= BUDGET.fire && c.own <= BUDGET.own,
        `${id}: inside the budget: +${c.alpha - off.alpha} alpha (<= ${BUDGET.alpha}), +${c.add - off.add} add (<= ${BUDGET.add}), +${c.fire - off.fire} fire (<= ${BUDGET.fire}), ${c.own} own (<= ${BUDGET.own})`);
      T.assert(T.near(w.life.calm, 1, 0.02), `${id}: calm is 1 before the fight (${w.life.calm.toFixed(2)})`);
      w.game.state = 'boss';
      w.step(8);
      T.assert(T.near(w.life.calm, T.LIFE_TUNE.fightCalm, 0.03), `${id}: calm eases to ${T.LIFE_TUNE.fightCalm} in the fight (${w.life.calm.toFixed(2)})`);
      w.life.hushFor(1.5, 1);
      w.step(0.8);
      T.assert(w.life.hush > 0.8, `${id}: the hush holds (${w.life.hush.toFixed(2)})`);
      w.step(12);
      T.assert(w.life.hush === 0, `${id}: the hush lets go (${w.life.hush.toFixed(3)})`);
      w.world.life.clear('reset');
      w.life.setVisible(false);
      w.step(0.5);
      w.life.setVisible(true);
      w.step(1);
    }
  },

  /** Each piece stands alone (the others off) on every level: no throw, no NaN, no Math.random; the
   *  litter without the wind falls straight down; with every piece on, what a layer takes over the
   *  atmosphere draws no more (nothing is drawn twice). */
  alone(T) {
    for (const id of T.LEVEL_IDS) {
      for (const piece of ['wind', 'weather', 'litter', 'steps', 'creatures', 'answer']) {
        const w = T.build(id, piece, { feet: true });
        w.walk(3, -2);
        w.step(8);
        w.world.gust(w.game.player.position.x, w.game.player.position.z, 1.6, 12);
        w.emit('dragon:roar', { strength: 1 });
        w.walk(0, 0);
        w.step(6);
        const errs = Object.entries(w.life._errs).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`);
        T.assert(!errs.length && w.counts().random === 0, `${id} [${piece} alone]: stands (${errs.join(', ') || 'no throw'}, ${w.counts().random} Math.random)`);
        if (piece === 'litter' && w.life.litter.leaves) {
          let n = 0, side = 0;
          for (const f of w.life.litter.leaves) if (f.s === 1 && f.y > 1) { n++; side += Math.hypot(f.vx, f.vz); }
          T.assert(n === 0 || side / n < 0.8, `${id} [litter, no wind]: what falls comes straight down (mean sideways ${(side / Math.max(1, n)).toFixed(2)} m/s over ${n})`);
        }
      }
      // every piece on: the atmosphere's own leaves / mist / ash / fireflies stop where a layer took them
      const a = T.build(id, 'all');
      a.step(10);
      const A = a.world.atmosphere, took = [];
      for (const what of ['leaves', 'mist', 'ash', 'fireflies']) if (a.life.takes(what)) took.push(what);
      const acc = { leaves: A.leafAcc, mist: A.mistAcc, ash: A.ashAcc };
      T.assert(took.every((w) => w === 'fireflies' || !acc[w]), `${id}: the atmosphere stopped drawing what the living world took (${took.join(', ') || 'nothing'}; acc ${JSON.stringify(acc)})`);
    }
  },

  /** The phone's budget: at quality 0.5 the living world holds fewer letters than at 1. */
  phone(T) {
    for (const id of T.LEVEL_IDS) {
      const hi = T.build(id, 'all', { quality: 1 });
      hi.step(45);
      const lo = T.build(id, 'all', { quality: 0.5 });
      lo.step(45);
      const a = hi.counts(), b = lo.counts();
      const sum = (c) => c.spawned.alpha + c.spawned.add + c.spawned.fire;
      // (a set's own ambience draws from Math.random: a few spawns either way are its noise)
      T.assert(sum(b) <= sum(a) * 1.01 + 20, `${id}: no more spawns on the phone (${sum(b)} at 0.5, ${sum(a)} at 1)`);
    }
  },

  /** Switching a piece off mid-run leaves nothing of it behind, and the training room has no life. */
  switches(T) {
    const w = T.build('cinderwood', 'all');
    w.step(20);
    T.setLife('off');
    w.step(25);
    const c = w.counts();
    const base = T.build('cinderwood', 'off');
    base.step(45);
    const b = base.counts();
    T.assert(c.own === 0, `every piece off: the living world's own pools are empty (${c.own})`);
    T.assert(Math.abs(c.alpha - b.alpha) <= 60 && Math.abs(c.add - b.add) <= 60, `every piece off: the shared pools are back to the atmosphere's own (${c.alpha} / ${c.add} against ${b.alpha} / ${b.add})`);
    for (const p of T.LIFE_PIECES) T.assert(w.life.on(p) === false, `${p} is off`);
  },
};
