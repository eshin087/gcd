// The living world's 'steps' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . steps
// (`steps.map` prints every level's surface map: ABYSS_STEPS_MAP=1 to see it)

const CH = { grass: '"', earth: '.', stone: '#', ash: ':', obsidian: '@', sand: '~', leaf: ',' };

/**
 * The steps' own letters in fx.alpha: every spawn made inside steps.step() is recorded with its life,
 * so `live(t)` counts what of the steps is still in the air (the level's own ambience shares the pool).
 */
function tap(w) {
  const fx = w.game.fx.alpha, rec = [];
  let inside = false;
  const spawn = fx.spawn;
  fx.spawn = (r) => {
    if (inside) rec.push(w.game.time + (r.life ?? 1));
    return spawn(r);
  };
  const S = w.life.steps, step = S.step.bind(S);
  S.step = (x, z, o) => {
    inside = true;
    try {
      step(x, z, o);
    } finally {
      inside = false;
    }
  };
  return { get spawned() { return rec.length; }, live: () => rec.filter((e) => e > w.game.time).length };
}

/** A sprint's footfalls for `sec` s along (vx, vz) from where the hero stands: steps every 0.17 s. */
function sprint(w, sec, vx, vz, o = {}, probe = null) {
  const dt = 1 / 60, every = 0.17;
  let acc = 0, side = 1, peak = 0;
  for (let t = 0; t < sec; t += dt) {
    w.walk(vx, vz);
    w.step(dt);
    acc += dt;
    if (acc >= every) {
      acc -= every;
      side = -side;
      const p = w.game.player.position;
      w.life.steps.step(p.x + side * 0.12, p.z, { sprint: true, side, vx, vz, ...o });
    }
    if (probe) peak = Math.max(peak, probe.live());
  }
  w.walk(0, 0);
  return peak;
}

const first = {
  /** A top-down map of every level's surfaces (60 x 60 m, 1 m a letter, north up). */
  map(T) {
    const show = !!process.env.ABYSS_STEPS_MAP;
    for (const id of T.LEVEL_IDS) {
      const w = T.build(id, 'off');
      const S = w.life.steps;
      const tally = {};
      const rows = [];
      for (let z = -29.5; z < 30; z += 1) {
        let row = '';
        for (let x = -29.5; x < 30; x += 1) {
          const s = S.surfaceAt(x, z);
          tally[s] = (tally[s] ?? 0) + 1;
          row += CH[s] ?? '?';
        }
        rows.push(row);
      }
      if (show) {
        T.out(`  ${id}  (${Object.entries(CH).map(([k, v]) => `${v} ${k}`).join('  ')})  x -30..30 left to right, z -30 (north) at the top`);
        for (const r of rows) T.out('   ' + r);
      }
      T.out(`  ${id}: ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(', ')}`);
      T.assert(Object.keys(tally).every((k) => k in CH), `${id}: every cell is one of SURFACES`);
    }
  },

  /** surfaceAt at known points of every level, with the piece off. */
  surfaces(T) {
    const at = (id, pts) => {
      const w = T.build(id, 'off');
      for (const [x, z, want, what] of pts) {
        const got = w.life.steps.surfaceAt(x, z);
        T.assert(want.split('|').includes(got), `${id}: ${what} (${x}, ${z}) is ${want} (${got})`);
      }
      return w;
    };
    const c = at('cinderwood', [[0, 15, 'grass', 'the meadow'], [-12, -14, 'grass', 'the meadow north-west'], [0, 25.5, 'earth', 'the bonfire\'s bare ring'], [-3, -15.5, 'earth', 'the nest']]);
    const fs = c.set.slabs[0];
    T.assert(c.life.steps.surfaceAt(fs.x, fs.z) === 'stone', `cinderwood: a flagstone (${fs.x.toFixed(1)}, ${fs.z.toFixed(1)}) is stone (${c.life.steps.surfaceAt(fs.x, fs.z)})`);
    // the courtyard: ash lies over the paving and wins (prints and puffs are the level's answer)
    at('ash', [[0, 0, 'ash', 'the yard\'s centre (paving under ash: ash wins)'], [10, -10, 'ash', 'the yard'], [0.5, 26, 'stone', 'the path'], [-25, 0, 'ash', 'the burnt hillside']]);
    at('starless', [[0, 0, 'obsidian', 'the seal'], [9, 5, 'obsidian', 'the crater floor'], [0, 22, 'stone', 'the path']]);
    at('ring', [[0, 0, 'stone', 'the centre'], [10, -10, 'stone', 'a tile'], [22, 0, 'sand', 'the clay'], [0, -24, 'sand', 'the lake bed']]);
    const fx = at('fox', [[0.7, 0.7, 'stone|earth', 'the paving'], [5, 5, 'stone|earth', 'the paving'], [22, 10, 'grass', 'the hillside']]);
    const pf = fx.set.slabs.filter((s) => s.z > 20).sort((a, b) => Math.abs(a.z - 25) - Math.abs(b.z - 25))[0];
    T.assert(fx.life.steps.surfaceAt(pf.x, pf.z) === 'stone', `fox: a flagstone of the path (${pf.x.toFixed(1)}, ${pf.z.toFixed(1)}) is stone`);
    at('grove', [[0, 2, 'stone|earth', 'the paving'], [0, 9, 'earth', 'the clearing'], [-9, 4, 'earth', 'the clearing'], [0, -26, 'leaf', 'under the bamboo']]);
    // cheap: a hundred thousand asks
    const w = T.build('ring', 'off');
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 100000; i++) if (w.life.steps.surfaceAt(((i * 7919) % 6000) / 100 - 30, ((i * 104729) % 6000) / 100 - 30) === 'stone') n++;
    const ms = performance.now() - t0;
    T.assert(ms < 1500, `ring: 100000 surfaceAt calls in ${ms.toFixed(0)} ms (${n} stone)`);
  },

  /** `?prints=0` (the prints before the flash): a step on ash leaves a print that fills in; a print on earth
   *  fades sooner. */
  async prints(T) {
    const { setLook } = await T.imp('src/entities/enemies/duelist/lookSwitch.js');
    setLook('prints', '0');
    try {
      prints0(T);
    } finally {
      setLook('prints', null);
    }
  },

  /** The flash print (the default, STEPS.flash): a step on EVERY surface leaves one, gone in under a second;
   *  with the dragon ground (world/ground.js look b) the floor's own cells print it (render/dragonStep.js). */
  async flash(T) {
    const { STEPS } = await T.imp('src/world/life/stepsTuning.js');
    const { DP_STEP_U } = await T.imp('src/render/dragonStep.js');
    const c = T.build('cinderwood', 'steps');
    c.step(0.2);
    const spots = [['grass', 0, 15], ['stone', c.set.slabs[0].x, c.set.slabs[0].z], ['earth', 0, 25.5]];
    for (const [name, x, z] of spots) {
      const n0 = c.life.steps.prints;
      c.life.steps.step(x, z, { side: 1, vx: 4.6, vz: 0 });
      T.assert(c.life.steps.prints === n0 + 1, `${name} (${c.life.steps.surfaceAt(x, z)}): a step leaves a flash print (${c.life.steps.prints - n0})`);
      c.step(0.05);
    }
    c.step(0.1);
    T.assert(c.counts().own > 0, `the flash is drawn (${c.counts().own} letters; no dragon ground here: on the floor as letters)`);
    c.step(STEPS.flash.life + 0.1);
    T.assert(c.life.steps.prints === 0 && c.counts().own === 0, `gone ${STEPS.flash.life + 0.1} s on (${c.life.steps.prints})`);
    // on a dragon ground the floor prints it: the shared uniforms carry the newest prints, the batch draws none
    c.world.ground = { userData: { look: 'b' } };
    c.life.steps.step(0, 15, { side: 1, vx: 4.6, vz: 0 });
    c.step(0.1);
    const S = DP_STEP_U.uDpSteps.value[0];
    T.assert(DP_STEP_U.uDpStepK.value.w === 1 && Math.abs(S.x) < 0.5 && Math.abs(S.y - 15) < 0.5 && S.z > 0, `dragon ground: the floor's uniforms carry the print (${S.x.toFixed(2)}, ${S.y.toFixed(2)}, age ${S.z.toFixed(2)})`);
    T.assert(c.counts().own === 0, `dragon ground: no letters of its own (${c.counts().own})`);
    c.step(STEPS.flash.life + 0.2);
    T.assert(DP_STEP_U.uDpStepK.value.w === 0, 'dragon ground: off again once the print is gone');
  },

  /** The trample (`?bend=0`: today's trodden trail): blue rises at the foot, red and green untouched, it
   *  stands up again, reset clears it. */
  async trample(T) {
    const LS = await T.imp('src/entities/enemies/duelist/lookSwitch.js');
    LS.setLook('bend', '0');
    try {
      trample0(T);
    } finally {
      LS.setLook('bend', null);
    }
  },

  /** With the grass's wake on (`?bend=a|b|c`, the default b) a step writes no trodden trail (B stays 0):
   *  a sprint step and a landing widen the wake instead. */
  async noTrample(T) {
    const LS = await T.imp('src/entities/enemies/duelist/lookSwitch.js');
    for (const look of [null, 'a', 'b', 'c']) {
      LS.setLook('bend', look);
      try {
        const w = T.build('cinderwood', 'steps');
        const pressed = [];
        w.world.trail = { press: (x, z, r) => pressed.push(r) };
        sprint(w, 2, 7, 0);
        w.life.steps.step(w.game.player.position.x, 15, { heavy: true });
        const sc = w.world.scorch;
        let b = 0;
        for (let i = 2; i < sc.data.length; i += 4) b = Math.max(b, sc.data[i]);
        T.assert(b === 0 && sc._tramN === 0, `bend ${look ?? 'default'}: no trodden cells in B (max ${b}, ${sc._tramN} cells)`);
        T.assert(pressed.length >= 5 && pressed.includes(1.2), `bend ${look ?? 'default'}: the sprint's steps and the landing widen the wake instead (${pressed.length} presses: ${[...new Set(pressed)].join(', ')} m)`);
      } finally {
        LS.setLook('bend', null);
      }
    }
  },

  /** The grass's wake itself: world/grassTrail.js on its own, as world.js drives it (bend.mjs). */
  async wake(T) {
    const m = await T.imp('tests/integration/life/bend.mjs');
    await m.default(T);
  },
};

function trample0(T) {
  {
    const w = T.build('cinderwood', 'steps');
    const sc = w.world.scorch;
    sc.burnCircle(5, 10, 2, 0.5, 1);
    const i = sc._idx(5, 10);
    const r0 = sc.data[i * 4], g0 = sc.data[i * 4 + 1];
    const burn0 = sc.burn[i], heat0 = sc.heat[i];
    w.life.steps.step(0, 15, { side: 1 });
    w.life.steps.step(5, 10, { sprint: true });
    const j = sc._idx(0, 15);
    T.assert(sc.data[j * 4 + 2] > 180 && sc.trampleAt(0, 15) > 0.7, `a grass step tramples the cell (B ${sc.data[j * 4 + 2]})`);
    T.assert(sc.data[i * 4] === r0 && sc.data[i * 4 + 1] === g0 && sc.burn[i] === burn0 && sc.heat[i] === heat0, `red and green untouched by the trample (R ${r0}, G ${g0})`);
    T.assert(sc.data[sc._idx(0, 17) * 4 + 2] === 0, 'two metres off: no trample');
    // timing of the heat is as before (compare with a scorch that was never trodden)
    const ref = T.build('cinderwood', 'off');
    ref.world.scorch.burnCircle(5, 10, 2, 0.5, 1);
    T.setLife('steps'); // (build() sets the switch for every world)
    // (burnCircle's jitter draws from Math.random: copy the cell over so the two start equal)
    ref.world.scorch.heat.set(sc.heat);
    ref.world.scorch.burn.set(sc.burn);
    w.step(5);
    ref.step(5);
    T.assert(T.near(sc.heat[i], ref.world.scorch.heat[i], 1e-6) && T.near(sc.burn[i], ref.world.scorch.burn[i], 1e-6), `the heat decays as before (${sc.heat[i].toFixed(4)} vs ${ref.world.scorch.heat[i].toFixed(4)})`);
    const mid = sc.trampleAt(0, 15);
    T.assert(mid > 0.2 && mid < 0.7, `half stood up after 5 s (${mid.toFixed(2)})`);
    w.step(6);
    T.assert(sc.trampleAt(0, 15) === 0 && sc.data[j * 4 + 2] === 0 && sc._tramN === 0, `stood up after ~10 s (${sc.trampleAt(0, 15)})`);
    // a heavy landing treads wider; reset clears it
    w.life.steps.step(0, 15, { heavy: true });
    T.assert(sc.trampleAt(1, 15) > 0.5, `a heavy landing treads ~1.2 m (${sc.trampleAt(1, 15).toFixed(2)} at 1 m)`);
    sc.reset();
    T.assert(sc.trampleAt(0, 15) === 0 && sc._tramN === 0 && sc.data[j * 4 + 2] === 0, 'reset clears the trample');
    // no random draw
    const T0 = T.build('cinderwood', 'steps');
    let calls = 0;
    const R = Math.random;
    Math.random = () => { calls++; return R(); };
    try {
      T0.world.scorch.trample(0, 15, 0.6, 1);
      for (let i = 0; i < 60; i++) T0.world.scorch.update(1 / 60);
    } finally {
      Math.random = R;
    }
    T.assert(calls === 0, `the trample draws nothing from Math.random (${calls})`);
  }
}

const more = {

  /** With the piece off a step draws nothing and footfall says nothing. */
  off(T) {
    for (const spec of ['off', 'wind,litter,weather,creatures']) {
      const w = T.build('ash', spec);
      w.step(0.5);
      const a = w.counts();
      const s = w.life.steps.footfall(0, 0, { sprint: true });
      w.life.steps.step(0, 0, { heavy: true });
      const b = w.counts();
      w.step(0.2);
      T.assert(s === undefined, `${spec}: footfall returns nothing (${s})`);
      T.assert(b.spawned.alpha === a.spawned.alpha && b.pools === a.pools && w.world.scorch._tramN === 0 && w.life.steps.prints === 0, `${spec}: a step draws nothing (+${b.spawned.alpha - a.spawned.alpha} alpha, ${b.pools} pools)`);
    }
    // switched off mid-run: the prints go
    const w = T.build('ash', 'steps');
    w.life.steps.step(0, 0, {});
    w.step(0.2);
    T.setLife('off');
    w.step(0.2);
    T.assert(w.life.steps.prints === 0 && w.counts().own === 0, 'switched off: nothing of it is left');
  },

  /** Each surface answers in its own way. */
  async answers(T) {
    const n = (id, x, z, o, sec = 0.02) => {
      const w = T.build(id, 'steps');
      w.step(0.1);
      const a = w.counts().spawned.alpha;
      w.life.steps.step(x, z, o);
      const d = w.counts().spawned.alpha - a;
      w.step(sec);
      return { w, d };
    };
    let sum = 0;
    for (let i = 0; i < 20; i++) sum += n('ash', 0, 0, { vx: 0, vz: -4.6 }).d;
    T.assert(sum >= 40, `ash: a puff every step (${(sum / 20).toFixed(1)} letters a step)`);
    sum = 0;
    for (let i = 0; i < 10; i++) sum += n('cinderwood', 0, 15, {}).d;
    T.assert(sum === 0, `grass at a run: no dust (${sum})`);
    sum = 0;
    for (let i = 0; i < 10; i++) sum += n('cinderwood', 0, 15, { sprint: true }).d;
    T.assert(sum > 0 && sum <= 30, `grass at a sprint: a torn blade or two (${(sum / 10).toFixed(1)} a step)`);
    const st = n('ring', 0, 0, {});
    T.assert(st.d === 0, `stone at a run: nothing (${st.d})`);
    // obsidian: no dust, a glint on the floor (a mark of the prints' batch) gone in 0.3 s (`?prints=0`: the
    // flash print would add its own marks; the flash scenario checks it)
    const { setLook } = await T.imp('src/entities/enemies/duelist/lookSwitch.js');
    setLook('prints', '0');
    const ob = T.build('starless', 'steps');
    ob.step(0.1);
    const oa = ob.counts().spawned.alpha;
    ob.life.steps.step(3, 3, { sprint: true });
    ob.life.steps.step(3.5, 3, { heavy: true });
    const g0 = ob.life.steps.prints;
    T.assert(ob.counts().spawned.alpha === oa && g0 >= 2 && g0 <= 8, `obsidian: no dust, a glint or two (${g0} marks, +${ob.counts().spawned.alpha - oa} dust)`);
    ob.step(0.8);
    T.assert(ob.life.steps.prints === 0 && ob.counts().own === 0, `obsidian: the glint is gone in 0.8 s (${ob.life.steps.prints})`);
    setLook('prints', null);
    // sand: the puff goes downwind
    const w = T.build('ring', 'steps,wind');
    w.step(0.5);
    const base = w.game.fx.alpha.count;
    for (let i = 0; i < 8; i++) w.life.steps.step(22, 0, { sprint: true });
    const k0 = w.game.fx.alpha.count;
    w.step(0.6);
    const D = w.game.fx.alpha.data;
    let mx = 0, m = 0;
    for (let i = base; i < Math.min(k0, w.game.fx.alpha.count); i++) { mx += D[i * 26] - 22; m++; }
    const wind = w.life.wind.at(22, 0, { x: 0, z: 0, k: 0 });
    T.assert(m > 0 && Math.sign(mx / m) === Math.sign(wind.x) && Math.abs(mx / m) > 0.15, `ring clay: the puff drifts downwind (mean dx ${(mx / Math.max(1, m)).toFixed(2)} m, wind ${wind.x.toFixed(2)} m/s)`);
    // grove: packed earth gives no dust cloud
    sum = 0;
    for (let i = 0; i < 10; i++) sum += n('grove', 0, 9, { sprint: true }).d;
    T.assert(sum === 0, `grove earth: no dust cloud (${sum})`);
    const lf = n('grove', 0, -26, { sprint: true });
    T.assert(lf.d >= 1, `grove leaf floor: a leaf flicked (${lf.d})`);
  },

  /** The trail through the meadow (the hero's feet, as player.js brings them down): the grass is trodden
   *  where he ran (the scorch map's blue, which the grass shader reads with the wind on or off), it
   *  stands up again within ~10 s, and with the steps off there is no trail at all. (`?bend=0`: today's
   *  trail; with the wake on there is none, noTrample) */
  async trail(T) {
    const LS = await T.imp('src/entities/enemies/duelist/lookSwitch.js');
    LS.setLook('bend', '0');
    try {
      trail0(T);
    } finally {
      LS.setLook('bend', null);
    }
  },


  /** A 30 s sprint on every level: inside the steps' budget (fx.alpha 60, own 120), no NaN, no Math.random. */
  budget(T) {
    for (const id of T.LEVEL_IDS) {
      const sp = T.CONFIG.world.playerSpawn ?? { x: 0, z: 20 };
      const run = (spec, quality) => {
        const w = T.build(id, spec, { quality });
        const probe = tap(w);
        w.place(sp.x, sp.z);
        let peak = 0, own = 0;
        // across the arena and back
        for (let k = 0; k < 6; k++) {
          const dir = k % 2 ? 1 : -1;
          peak = Math.max(peak, sprint(w, 5, 1.5 * dir, -7 * dir, {}, probe));
          // (the steps' own pool: the prints; the litter's pool is the litter's budget)
          own = Math.max(own, w.counts().prints);
        }
        return { w, peak, own, spawned: probe.spawned, prints: w.life.steps.prints };
      };
      const a = run('all', 1);
      const errs = Object.entries(a.w.life._errs).filter(([, n]) => n > 0).map(([k, n]) => `${k} x${n}`);
      T.assert(!errs.length, `${id}: nothing threw (${errs.join(', ')})`);
      T.assert(a.w.counts().random === 0, `${id}: no Math.random (${a.w.counts().random})`);
      T.assert(a.peak <= 60 && a.own <= 120, `${id}: a 30 s sprint holds <= 60 alpha of its own (peak ${a.peak}, ${a.spawned} spawned) and <= 120 prints (${a.own})`);
      const ph = run('steps', 0.5);
      T.assert(ph.spawned <= a.spawned && ph.own <= Math.max(30, a.own), `${id}: the phone holds fewer (${ph.spawned} spawned, ${ph.own} prints at 0.5)`);
    }
  },

  /** The hero's hook: the payload carries the surface (and still fits the catalogue's schema) when the
   *  piece is on, and is today's payload when it is off. */
  async payload(T) {
    const w = T.build('ash', 'steps');
    const got = [];
    w.game.events.on('player:footstep', (d) => got.push(d));
    // the hook as player.js writes it
    const emit = (x, z, sprint) => {
      const surface = w.game.world?.life?.steps?.footfall?.(x, z, { sprint, side: 1, vx: 0, vz: -4 });
      const d = { x, z, sprint };
      if (surface) d.surface = surface;
      w.emit('player:footstep', d);
    };
    emit(0, 0, false);
    T.setLife('off');
    emit(0, 0, true);
    const ok = (d) => Number.isFinite(d.x) && Number.isFinite(d.z) && typeof d.sprint === 'boolean';
    T.assert(got.length === 2 && got.every(ok), 'both payloads fit { x: n, z: n, sprint: b }');
    T.assert(got[0].surface === 'ash' && !('surface' in got[1]), `on: surface '${got[0].surface}'; off: no surface field`);
    // the real hooks call footfall with these names
    const src = await import('node:fs').then((fs) => fs.readFileSync(`${T.ROOT}/src/entities/player/player.js`, 'utf8') + fs.readFileSync(`${T.ROOT}/src/entities/player/flurry.js`, 'utf8'));
    T.assert((src.match(/steps\?\.footfall\?\.\(/g) ?? []).length === 4, 'the hero’s four landings ask the steps (_footstep, the plunge landing, the flurry touchdown, the roll’s landing)');
  },
};

/** (today's trail, under `?bend=0`) */
function trail0(T) {
  {
    const trail = (spec) => {
      const w = T.build('cinderwood', spec, { feet: true });
      w.place(-8, 16);
      w.walk(5, 0);
      w.step(3.2);
      w.walk(0, 0);
      const sc = w.world.scorch;
      let n = 0, max = 0;
      for (let x = -8; x <= 8; x += 0.25) {
        const v = sc.trampleAt(x, 16);
        if (v > 0.05) n++;
        max = Math.max(max, v);
      }
      w.step(5);
      const mid = sc._tramN;
      w.step(6);
      return { n, max, mid, end: sc._tramN };
    };
    const on = trail('steps'), both = trail('steps,wind'), off = trail('wind');
    T.assert(on.n >= 8 && on.max > 0.5, `steps on, wind off: a trail of trodden cells along the run (${on.n} of 65 probes, deepest ${on.max.toFixed(2)})`);
    T.assert(both.n >= 8, `steps and wind on: the same trail (${both.n})`);
    T.assert(on.mid > 0 && on.end === 0, `it stands up again (${on.mid} cells still trodden 5 s after, ${on.end} at 11 s)`);
    T.assert(off.n === 0 && off.max === 0, `steps off: no trail (${off.n})`);
  }
}

/** The prints before the flash (`?prints=0`): ash fills in, earth fades sooner, grass and stone none. */
function prints0(T) {
  const w = T.build('ash', 'steps');
  w.step(0.5);
  w.life.steps.step(0, 0, { side: 1, vx: 0, vz: -4.6 });
  w.step(0.2);
  T.assert(w.life.steps.prints === 1 && w.counts().pools === 1, `ash: a step leaves a print in its own pool (${w.life.steps.prints}, ${w.counts().pools} pool)`);
  T.assert(w.counts().own === 1, `ash: the print is drawn (${w.counts().own})`);
  const a0 = w.life.steps.pool.iColor.array[3];
  w.step(8);
  const a1 = w.life.steps.pool.iColor.array[3];
  T.assert(w.life.steps.prints === 1 && a1 < a0, `ash: the print fills in (alpha ${a0.toFixed(2)} -> ${a1.toFixed(2)} at 8 s)`);
  w.step(6.5);
  T.assert(w.life.steps.prints === 0 && w.counts().own === 0, `ash: gone after ~14 s (${w.life.steps.prints})`);
  // earth: ~5 s
  const c = T.build('cinderwood', 'steps');
  c.life.steps.step(0, 25.5, { side: -1, vx: 4.6, vz: 0 });
  c.step(4);
  const e4 = c.life.steps.prints;
  c.step(1.5);
  T.assert(e4 === 1 && c.life.steps.prints === 0, `earth: a print lasts ~5 s (${e4} at 4 s, ${c.life.steps.prints} at 5.5 s)`);
  // grass and stone leave none
  c.life.steps.step(0, 15, { sprint: true });
  c.life.steps.step(c.set.slabs[0].x, c.set.slabs[0].z, { sprint: true });
  T.assert(c.life.steps.prints === 0, `grass and stone leave no print (${c.life.steps.prints})`);
  // a reset takes them
  w.life.steps.step(1, 1, {});
  w.life.clear('reset');
  w.step(0.2);
  T.assert(w.life.steps.prints === 0 && w.counts().own === 0, 'a reset takes the prints');
  // the pool is capped
  for (let i = 0; i < 400; i++) w.life.steps.step((i % 20) - 10, Math.floor(i / 20) - 10, {});
  w.step(0.2);
  T.assert(w.life.steps.prints <= 120 && w.counts().own <= 120, `at most 120 prints (${w.life.steps.prints})`);
}

export default { ...first, ...more };
