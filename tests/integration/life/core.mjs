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
      // (the creatures re-draw every live letter into the shared pools each frame, one spawn a letter a
      // frame, and their birds do not scale with quality: which crows a gust happened to lift moves the
      // spawn count by thousands either way. They are measured live, below)
      // (both builds start Math.random from the level's seed: the set's own ambience, the fireflies and
      // embers, comes out the same at both qualities and on every run; only the living world differs)
      const spec = 'wind,weather,litter,steps,answer';
      const hi = T.build(id, spec, { quality: 1 });
      const lo = T.build(id, spec, { quality: 0.5 });
      let oh = 0, ol = 0;
      for (let i = 0; i < 45; i++) {
        hi.step(1);
        lo.step(1);
        oh += hi.counts().own;
        ol += lo.counts().own;
      }
      const ch = T.build(id, 'creatures', { quality: 1 }), cl = T.build(id, 'creatures', { quality: 0.5 });
      let dh = 0, dl = 0;
      for (let i = 0; i < 45; i++) {
        ch.step(1);
        cl.step(1);
        const a = ch.life.creatures.drawn ?? {}, b = cl.life.creatures.drawn ?? {};
        dh += (a.alpha ?? 0) + (a.add ?? 0);
        dl += (b.alpha ?? 0) + (b.add ?? 0);
      }
      T.assert(dl <= dh, `${id}: the creatures draw no more letters on the phone (${dl} at 0.5, ${dh} at 1, summed over 45 samples)`);
      const a = hi.counts(), b = lo.counts();
      const sum = (s) => s.alpha + s.add + s.fire;
      T.assert(ol <= oh, `${id}: the living world's own pools hold no more letters on the phone (${ol} at 0.5, ${oh} at 1, summed over 45 samples)`);
      T.assert(sum(b.lifeSpawned) <= sum(a.lifeSpawned), `${id}: the living world spawns no more into the shared pools on the phone (${sum(b.lifeSpawned)} at 0.5, ${sum(a.lifeSpawned)} at 1)`);
      T.assert(sum(b.spawned) <= sum(a.spawned), `${id}: no more spawns on the phone, the set's ambience with them (${sum(b.spawned)} at 0.5, ${sum(a.spawned)} at 1)`);
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

  /** The switch: a page with no `?life=` gets everything on (the owner's pick, 2026-11-23); `?life=off`
   *  nothing; a list its pieces; headless (no `location`) it is off, so the seeded suites are untouched. */
  async defaults(T) {
    const { lifeFromSearch, LIFE_PIECES } = await T.imp('src/world/life/lifeSwitch.js');
    const all = (o) => LIFE_PIECES.every((p) => o.on[p] === true), none = (o) => LIFE_PIECES.every((p) => o.on[p] === false);
    T.assert(all(lifeFromSearch('')) && all(lifeFromSearch('?level=ash')) && all(lifeFromSearch('?lab')), 'no ?life=: every piece on');
    T.assert(none(lifeFromSearch('?life=off')), '?life=off: every piece off');
    const two = lifeFromSearch('?life=wind,litter');
    T.assert(two.on.wind && two.on.litter && !two.on.weather && !two.on.air, '?life=wind,litter: those two only');
    T.assert(all(lifeFromSearch('?life=all')) && all(lifeFromSearch('?life=')), '?life=all and an empty ?life=: every piece on');
    T.assert(lifeFromSearch('?lifeK=1.5').k === 1.5 && lifeFromSearch('?lifeK=9').k === 2 && lifeFromSearch('').k === 1, '?lifeK= read and clamped');
    // headless: the module was loaded with no `location`, and setLife() with no spec is off
    T.setLife();
    T.assert(LIFE_PIECES.every((p) => T.LIFE.on[p] === false), 'headless / setLife(): off');
  },

  /** A level that has no tuning of its own (added after the layers were tuned) still runs every piece
   *  without a throw, and gets no arrival shot and keeps its own sound bed (the quiet defaults would
   *  frame the wrong place and silence its voices). */
  async newLevels(T) {
    const { ARRIVAL_TUNING } = await T.imp('src/game/arrivalTuning.js');
    const { AIR_TUNE } = await T.imp('src/audio/airTuning.js');
    const { Arrival } = await T.imp('src/game/arrival.js');
    const ids = T.LEVEL_IDS.filter((id) => !ARRIVAL_TUNING[id] || !AIR_TUNE.levels[id]);
    if (!ids.length) {
      T.out('ok   every level has its own arrival and air');
      return;
    }
    for (const id of ids) {
      const w = T.build(id, 'all');
      w.walk(2, -2);
      w.step(15);
      w.world.gust(w.game.player.position.x, w.game.player.position.z, 1.6, 20);
      w.step(5);
      const errs = Object.entries(w.life._errs).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`);
      T.assert(errs.length === 0, `${id}: every piece runs with no throw${errs.length ? ` (${errs.join(', ')})` : ''}`);
      const flow = { _ov: { focus: new T.THREE.Vector3(), weight: 0, zoom: 0 }, _ovW: 0, _ovZ: 0, _ovLambda: 1 };
      const a = new Arrival(w.game, flow);
      T.assert(!ARRIVAL_TUNING[id] ? a.begin() === false && !a.active : true, `${id}: no arrival shot of its own → no arrival`);
    }
  },

  /** Every letter the air and the fauna print exists in all three of the wyrm's fonts: a letter a font
   *  lacks prints BLANK (a flock was invisible at the large font until `v c x s` were added there). */
  async fonts(T) {
    const { WYRM_FONTS } = await T.imp('src/render/wyrmGlyphs.js');
    const BS = String.fromCharCode(92);
    const used = new Set("v^-~'0=|/" + BS + 'cxso+.,`:;*');
    const { FAUNA_TUNE } = await T.imp('src/world/life/faunaTuning.js');
    for (const c of FAUNA_TUNE.letters ?? '') used.add(c);
    for (const f of ['tremorTuning', 'aftermathTuning']) {
      const m = await T.imp(`src/world/life/${f}.js`);
      for (const v of Object.values(m)) for (const g of Object.values(v?.glyph ?? {})) for (const c of String(g)) used.add(c);
    }
    used.delete(' ');
    for (const [key, F] of Object.entries(WYRM_FONTS)) {
      const missing = [...used].filter((c) => !F.glyphs[c]);
      T.assert(missing.length === 0, `${key}: has every letter the living world prints${missing.length ? ` (missing ${JSON.stringify(missing.join(''))})` : ` (${used.size})`}`);
    }
  },
};

