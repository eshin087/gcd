// The living world's 'weather' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . weather

const { WEATHER_TUNE } = await import(new URL('../../../src/world/life/weatherTuning.js', import.meta.url).href);

/** The light and fog uniforms, as numbers (bit-identity is checked with ===). */
const sky = (U) => [
  U.uMoonColor.value.r, U.uMoonColor.value.g, U.uMoonColor.value.b,
  U.uAmbient.value.r, U.uAmbient.value.g, U.uAmbient.value.b,
  U.uFogColor.value.r, U.uFogColor.value.g, U.uFogColor.value.b,
  U.uFogNear.value, U.uFogFar.value,
];
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const BUDGET = { alpha: 250, add: 190, fire: 150, own: 600 };
const WEATHER_LEVELS = (T) => T.LEVEL_IDS.filter((id) => WEATHER_TUNE[id]);

export default {
  /** Every level starts its visit in its calm spell, at once. */
  calm(T) {
    for (const id of WEATHER_LEVELS(T)) {
      const w = T.build(id, 'weather');
      w.step(1);
      const W = w.life.weather;
      T.assert(W.name === WEATHER_TUNE[id].calm && W.spell === W.name, `${id}: the visit starts in '${WEATHER_TUNE[id].calm}' (${W.name})`);
    }
  },

  /** Over 15 simulated minutes every spell is visited, the values stay in range and move continuously,
   *  and the same level built twice runs the same sequence. */
  cycle(T) {
    const dt = 1 / 30, eps = WEATHER_TUNE.maxStep;
    for (const id of WEATHER_LEVELS(T)) {
      const runs = [];
      for (let k = 0; k < 2; k++) {
        const w = T.build(id, 'weather', { quality: 0.5 });
        const W = w.life.weather;
        const seen = new Set([W.name]);
        const seq = [];
        let last = null, worst = 0, bad = 0;
        const frames = Math.round((k === 0 ? 900 : 360) / dt);
        for (let f = 0; f < frames; f++) {
          w.step(dt, dt);
          if (W.spell !== seq[seq.length - 1]?.[0]) seq.push([W.spell, +w.life.t.toFixed(2)]);
          seen.add(W.name);
          const v = [W.mist, W.wet, W.windK, W.light, ...W.val];
          if (!(W.mist >= 0 && W.mist <= 1 && W.wet >= 0 && W.wet <= 1 && W.windK > 0.5 && W.windK < 2.5 && v.every(Number.isFinite))) bad++;
          // (a factor is judged relative to its size: a fog colour x4.5 moves in larger steps)
          if (last) for (let i = 0; i < v.length; i++) worst = Math.max(worst, Math.abs(v[i] - last[i]) / Math.max(1, Math.abs(last[i])));
          last = v;
        }
        runs.push(seq);
        if (k > 0) continue;
        const all = Object.keys(W.spells);
        T.assert(all.every((s) => seen.has(s)), `${id}: every spell visited in 15 min (${all.filter((s) => !seen.has(s)).join(', ') || 'all'}; ${seq.length} turns)`);
        T.assert(bad === 0, `${id}: mist / wet / windK in range all along (${bad} bad frames)`);
        T.assert(worst <= eps, `${id}: the values move continuously (largest step a frame ${worst.toFixed(4)} <= ${eps})`);
      }
      const a = JSON.stringify(runs[0].filter((s) => s[1] <= 360)), b = JSON.stringify(runs[1]);
      T.assert(a === b, `${id}: built twice, the same sequence (${runs[1].map((s) => `${s[0]}@${s[1].toFixed(0)}`).join(' ')})`);
    }
  },

  /** In the fight no spell starts, and the one that was in eases back to the calm spell. */
  fight(T) {
    for (const id of WEATHER_LEVELS(T)) {
      const w = T.build(id, 'weather');
      w.step(2);
      const W = w.life.weather;
      const other = Object.keys(W.spells).find((s) => s !== WEATHER_TUNE[id].calm);
      W.force(other, 4);
      w.step(6);
      w.game.state = 'boss';
      w.step(90);
      T.assert(W.name === WEATHER_TUNE[id].calm && W.spell === W.name, `${id}: the fight eases '${other}' back to '${W.name}'`);
      const names = new Set();
      for (let i = 0; i < 240; i++) {
        w.step(1);
        names.add(W.spell);
      }
      T.assert(names.size === 1, `${id}: no spell starts in 4 min of fight (${[...names].join(', ')})`);
    }
  },

  /** With the piece off the light and fog are bit-identical to a run with no life; with it switched off
   *  mid-run they are back exactly. */
  uniforms(T) {
    const rest = T.LIFE_PIECES.filter((p) => p !== 'weather').join(',');
    for (const id of T.LEVEL_IDS) {
      const base = T.build(id, 'off');
      base.step(60);
      const ref = sky(base.U);
      const w = T.build(id, rest);
      w.step(60);
      T.assert(same(sky(w.U), ref), `${id}: weather off: the sky and fog uniforms are untouched after 60 s`);
      if (!WEATHER_TUNE[id]) continue;
      const v = T.build(id, 'weather');
      const W = v.life.weather;
      // the heaviest light: every spell that changes it, in turn
      const lit = Object.keys(W.spells).filter((s) => [4, 5, 6, 7, 8].some((i) => W.spells[s].v[i] !== 1));
      for (const s of lit) {
        W.force(s, 3);
        v.step(8);
      }
      const moved = !same(sky(v.U), ref);
      if (lit.length && WEATHER_TUNE[id].sky !== false) T.assert(moved, `${id}: '${lit.at(-1)}' changes the light (${sky(v.U).map((x) => +x.toFixed(4)).join(' ')})`);
      T.setLife('off');
      v.step(60 - 8 * lit.length);
      T.assert(same(sky(v.U), ref), `${id}: weather switched off: the uniforms are back exactly`);
    }
  },

  /** The atmosphere's sky glow (the wyrm's Armageddon) and the weather share the colours: when the glow
   *  ends the colours are the level's again, and the weather's factor is back on top. */
  glow(T) {
    const w = T.build('cinderwood', 'weather');
    const W = w.life.weather;
    const ref = sky(w.U);
    W.force('drizzle', 3);
    w.step(6);
    const wet = sky(w.U);
    for (let i = 0; i < 300; i++) {
      w.world.atmosphere.skyGlow(1);
      w.step(1 / 60);
    }
    w.step(4);
    T.assert(same(sky(w.U), wet), `the colours after the glow are the weather's again (${sky(w.U)[3].toFixed(5)} against ${wet[3].toFixed(5)})`);
    T.setLife('off');
    w.step(1);
    T.assert(same(sky(w.U), ref), 'and the level\'s own once the weather is off');
  },

  /** The Ring's storm (form 3, in the fight) is not altered by the weather, nor by its wind. */
  ringStorm(T) {
    const runs = [];
    for (const spec of ['off', 'weather', 'weather,wind']) {
      const w = T.build('ring', spec, { state: 'boss' });
      w.game.dragon.phase = 3;
      w.step(30);
      const s = sky(w.U);
      runs.push(s);
      if (spec !== 'off') T.assert(same(s, runs[0]), `ring storm with ${spec}: the light and fog are the storm's own`);
      if (spec !== 'off') T.assert(w.life.weather.flash === 0 && w.life.weather._devils.every((d) => !d.on), `ring storm with ${spec}: no far lightning, no dust devil`);
    }
  },

  /** The Ring before the fight: dust devils cross the badlands now and then, never onto the ring; dry
   *  lightning flickers a few times a minute. */
  ringDusk(T) {
    const w = T.build('ring', 'weather');
    const W = w.life.weather, K = WEATHER_TUNE.ring.devils.keepOut;
    let devils = 0, onRing = 0, bolts = 0, lastFlash = 0, peak = 0;
    const was = new Set();
    for (let i = 0; i < 300 * 30; i++) {
      w.step(1 / 30, 1 / 30);
      for (const d of W._devils) {
        if (d.on && !was.has(d)) { devils++; was.add(d); }
        if (!d.on) was.delete(d);
        if (d.on && Math.abs(d.x) < K - 0.6 && Math.abs(d.z) < K - 0.6) onRing++;
      }
      if (W.flash > 0.1 && lastFlash <= 0.1) bolts++;
      peak = Math.max(peak, W.flash);
      lastFlash = W.flash;
    }
    T.assert(devils >= 4 && devils <= 30, `ring: ${devils} dust devils in 5 min`);
    T.assert(onRing === 0, `ring: no devil onto the ring (${onRing} frames)`);
    T.assert(bolts >= 6 && bolts <= 45 && peak <= 1.05, `ring: ${bolts} far flickers in 5 min (peak ${peak.toFixed(3)} of 1)`);
  },

  /** The fallen star breathes every 30 - 50 s: the seal swells a little and settles. */
  starless(T) {
    const w = T.build('starless', 'weather');
    const W = w.life.weather;
    const starts = [];
    let prev = 'still';
    for (let i = 0; i < 300 * 30; i++) {
      w.step(1 / 30, 1 / 30);
      if (W.spell === 'breath' && prev !== 'breath') starts.push(w.life.t);
      prev = W.spell;
    }
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    T.assert(starts.length >= 5 && gaps.every((g) => g > 28 && g < 70), `starless: ${starts.length} breaths in 5 min, ${gaps.map((g) => g.toFixed(0)).join(' / ')} s apart`);
    T.assert(typeof w.set.ambience?.breathe === 'function', 'starless: the throne hall\'s ambience can breathe');
  },

  /** The budget, per level, in each spell (live letters the weather adds to the shared pools). */
  budget(T) {
    for (const id of WEATHER_LEVELS(T)) {
      const base = T.build(id, 'off');
      base.step(45);
      const b = base.counts();
      for (const s of Object.keys(T.build(id, 'weather').life.weather.spells)) {
        const w = T.build(id, 'weather');
        w.life.weather.force(s, 2);
        w.step(45);
        const c = w.counts();
        const da = c.alpha - b.alpha, dd = c.add - b.add, df = c.fire - b.fire;
        T.assert(da <= BUDGET.alpha && dd <= BUDGET.add && df <= BUDGET.fire && c.own <= BUDGET.own,
          `${id} '${s}': +${da} alpha, +${dd} add, +${df} fire (<= ${BUDGET.alpha} / ${BUDGET.add} / ${BUDGET.fire}), own ${c.own} (<= ${BUDGET.own})`);
      }
    }
  },

  /** The grove has no wind: its mist does not drift. */
  groveStill(T) {
    const w = T.build('grove', 'weather,wind');
    w.life.weather.force('mist', 2);
    w.step(30);
    const P = w.game.fx.alpha, d = P.data, M = w.life.weather.tune.mist, W = w.life.weather;
    let n = 0, fast = 0;
    for (let i = 0; i < P.count; i++) {
      const k = i * 26;
      // (the veil's wide strokes, by their colour)
      if (!(Math.abs(d[k + 10] - M.veil.color[0]) < 1e-6 && Math.abs(d[k + 11] - M.veil.color[1]) < 1e-6)) continue;
      n++;
      if (Math.hypot(d[k + 3], d[k + 5]) > 0.04) fast++;
    }
    // (the banks: the weather's own batch; a bank drifts as one with the air, and there is none)
    for (const b of W._banks ?? []) {
      if (!b.on) continue;
      if (Math.hypot(b.vx, b.vz) > 0.04) fast++;
    }
    n += W._bp?.count ?? 0;
    T.assert(n > 40 && fast === 0, `grove: ${n} letters of mist, ${fast} drifting`);
  },
};
