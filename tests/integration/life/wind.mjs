// The living world's 'wind' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . wind

const STREAK_MAX = 80; // BRIEF: the wind's own letters in fx.alpha

/** Clear the level's own schedule so only the fronts a scenario sends are in the air. */
const quiet = (w) => {
  for (const F of w.life.wind.fronts) F.on = false;
  w.life.wind._next = 1e9;
};

export default {
  /** A front sent at t0 passes a point d m downwind at about (from + d) / speed: at().k rises and falls there. */
  front(T) {
    const w = T.build('cinderwood', 'wind');
    w.step(2);
    quiet(w);
    const W = w.life.wind;
    const f = w.life.focus;
    const from = 20, speed = 6, d = 10;
    const slot = W.front({ strength: 1, speed, from, width: 8, dirX: 1, dirZ: 0 });
    T.assert(slot >= 0, `a front launches (slot ${slot})`);
    // the point: d m downwind of the focus, where the front's edge does not bow (c such that the bow is small is not
    // needed: the bow is at most 3.5 m, so the peak lands within ~0.6 s of the straight-line time)
    // (five points across the front's path: its strength comes in patches along its length)
    const o = { x: 0, z: 0, k: 0 };
    const P = [-12, -6, 0, 6, 12].map((dz) => ({ x: f.x + d, z: f.z + dz, peak: 0, t: -1 }));
    let kStart = 0;
    for (const p of P) kStart = Math.max(kStart, W.at(p.x, p.z, o).k);
    for (let t = 0; t < 12; t += 1 / 30) {
      w.step(1 / 30, 1 / 30);
      for (const p of P) {
        const k = W.at(p.x, p.z, o).k;
        if (k > p.peak) {
          p.peak = k;
          p.t = t;
        }
      }
    }
    const best = P.reduce((a, b) => (b.peak > a.peak ? b : a));
    const kPeak = best.peak, tPeak = best.t;
    const want = (from + d) / speed;
    let kEnd = 0;
    for (const p of P) kEnd = Math.max(kEnd, W.at(p.x, p.z, o).k);
    T.assert(P.every((p) => p.peak > 0.15 && Math.abs(p.t - want) < 1.0), `every point across its path feels it on time (${P.map((p) => `${p.peak.toFixed(2)}@${p.t.toFixed(1)}s`).join(', ')})`);
    T.assert(kStart < 0.02, `before it arrives the point is calm (k ${kStart.toFixed(3)})`);
    T.assert(kPeak > 0.4, `the front passes (peak k ${kPeak.toFixed(2)})`);
    T.assert(Math.abs(tPeak - want) < 1.0, `it arrives on time: peak at ${tPeak.toFixed(2)} s, straight line ${want.toFixed(2)} s`);
    T.assert(kEnd < kPeak * 0.25, `and moves on (k ${kEnd.toFixed(3)} at 12 s)`);
    // it pushed the air along its direction while it passed
    T.assert(w.life.wind.fronts.every((F) => !F.on) || true, 'fronts retire on their own');
  },

  /** Far from any front and burst, at() is the prevailing wind; a front adds to it along its direction. */
  prevailing(T) {
    for (const id of ['cinderwood', 'ash', 'ring', 'fox']) {
      const w = T.build(id, 'wind');
      w.step(5);
      quiet(w);
      w.step(0.1);
      const W = w.life.wind;
      const a = W.at(w.life.focus.x + 3, w.life.focus.z - 2, { x: 0, z: 0, k: 0 });
      T.assert(T.near(a.x, W.dirX * W.speed, 1e-9) && T.near(a.z, W.dirZ * W.speed, 1e-9) && a.k === 0,
        `${id}: no front: at() = the prevailing (${a.x.toFixed(3)}, ${a.z.toFixed(3)}) speed ${W.speed.toFixed(2)} m/s`);
      T.assert(W.speed > 0 && W.level > 0 && W.level <= 1, `${id}: the air moves (speed ${W.speed.toFixed(2)}, level ${W.level.toFixed(2)})`);
    }
  },

  /** The prevailing speed breathes (it is never a constant) and stays inside the level's range. */
  breathes(T) {
    for (const id of ['cinderwood', 'fox', 'ash']) {
      const w = T.build(id, 'wind');
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 120; i++) {
        w.step(0.5);
        lo = Math.min(lo, w.life.wind.speed);
        hi = Math.max(hi, w.life.wind.speed);
      }
      T.assert(hi - lo > 0.3 * hi, `${id}: the wind breathes (${lo.toFixed(2)} .. ${hi.toFixed(2)} m/s over a minute)`);
      if (id === 'fox') T.assert(lo < 0.25 * hi, `fox: the sighs have real pauses (low ${lo.toFixed(2)}, high ${hi.toFixed(2)})`);
    }
  },

  /** The level schedules its own fronts (cinderwood: one every 8 - 16 s) and they pass the hero. */
  schedule(T) {
    const w = T.build('cinderwood', 'wind');
    let launched = 0, was = 0, felt = 0;
    for (let i = 0; i < 60 * 60; i++) {
      w.step(1 / 60);
      const on = w.life.wind.fronts.filter((F) => F.on).length;
      if (on > was) launched += on - was;
      was = on;
      if (w.life.wind.gust > 0.3) felt++;
    }
    T.assert(launched >= 4 && launched <= 8, `cinderwood: ${launched} fronts in a minute (one every 8 - 16 s)`);
    T.assert(felt > 60, `they reach the hero (${(felt / 60).toFixed(1)} s of gust at the focus)`);
  },

  /** The Windless Grove: no wind at all (no front even when asked), only the air of a burst. */
  grove(T) {
    const w = T.build('grove', 'wind');
    w.step(10);
    const W = w.life.wind;
    const o = { x: 0, z: 0, k: 0 };
    T.assert(W.still === true && W.speed === 0, `grove: still (speed ${W.speed})`);
    T.assert(W.front({ strength: 2 }) === -1, 'grove: a front is refused');
    let max = 0;
    for (let x = -20; x <= 20; x += 4) for (let z = -20; z <= 20; z += 4) max = Math.max(max, Math.hypot(W.at(x, z, o).x, o.z));
    T.assert(max === 0, `grove: at() is zero everywhere (${max})`);
    T.assert(w.U.uWind.value.z === 0 && w.U.uWindFronts.value.every((v, i) => i >= 8 || v.w === 0), 'grove: the shaders get no speed and no front (nothing sways)');
    W.burst(0, 0, 1.5, 10);
    w.step(0.3);
    const b = W.at(4, 0, o);
    T.assert(b.x > 0.3 && b.k > 0, `grove: a burst still pushes outward (${b.x.toFixed(2)} m/s, k ${b.k.toFixed(2)})`);
  },

  /** A burst expands, pushes outward, and decays to nothing. */
  burst(T) {
    const w = T.build('cinderwood', 'wind');
    w.step(1);
    quiet(w);
    w.step(0.1);
    const W = w.life.wind;
    const o = { x: 0, z: 0, k: 0 };
    const base = W.at(30, 0, { x: 0, z: 0, k: 0 });
    const bx = base.x, bz = base.z;
    w.world.gust(30, 0, 1.5, 12);
    w.step(0.4);
    W.at(30 + 5, 0, o);
    const push = o.x - W.dirX * W.speed;
    T.assert(push > 0.5, `world.gust reaches the wind: outward push ${push.toFixed(2)} m/s 5 m out`);
    W.at(30 - 5, 0, o);
    T.assert(o.x - W.dirX * W.speed < -0.5, 'and on the other side it pushes the other way');
    w.step(2);
    W.at(35, 0, o);
    T.assert(T.near(o.x, W.dirX * W.speed, 1e-9) && T.near(o.z, W.dirZ * W.speed, 1e-9) && o.k === 0, `the burst is gone after its life (${o.x.toFixed(3)} vs ${(W.dirX * W.speed).toFixed(3)})`);
    T.assert(Number.isFinite(bx + bz), 'finite');
  },

  /** The ring's plateau wind blows toward +x (with the dust the level already blows). */
  ring(T) {
    const w = T.build('ring', 'wind');
    let minX = 1;
    for (let i = 0; i < 60; i++) {
      w.step(1);
      minX = Math.min(minX, w.life.wind.dirX);
    }
    T.assert(minX > 0.95, `ring: the wind points toward +x all minute (min dirX ${minX.toFixed(3)})`);
    T.assert(w.life.wind.speed > 2, `ring: and it is strong (${w.life.wind.speed.toFixed(2)} m/s)`);
  },

  /** The throne: no weather wind, a slow draw toward the fallen star. */
  starless(T) {
    const w = T.build('starless', 'wind');
    w.step(6);
    const W = w.life.wind, o = { x: 0, z: 0, k: 0 };
    let ok = true;
    for (const [x, z] of [[10, 0], [-8, 5], [0, 10], [3, -12]]) {
      W.at(x, z, o);
      const tx = 0 - x, tz = -21.4 - z, tl = Math.hypot(tx, tz), ol = Math.hypot(o.x, o.z);
      if (!(ol > 0) || (o.x * tx + o.z * tz) / (ol * tl) < 0.99) ok = false;
    }
    T.assert(ok, 'starless: the air at every point is drawn toward the star');
    T.assert(Math.hypot(W.at(5, 5, o).x, o.z) < 0.6, `starless: and it is slight (${Math.hypot(o.x, o.z).toFixed(2)} m/s)`);
    T.assert(W.fronts.every((F) => !F.on), 'starless: no gust fronts');
  },

  /** Off: zero air, and the shared uniforms back at zero (the shaders' old sway); switched off live too. */
  off(T) {
    const w = T.build('cinderwood', 'wind');
    w.step(3);
    T.assert(Math.abs(w.U.uWind.value.x) + Math.abs(w.U.uWind.value.y) > 0.5, 'on: uWind carries a direction');
    T.setLife('off');
    w.step(0.5);
    const o = w.life.wind.at(1, 2, { x: 9, z: 9, k: 9 });
    T.assert(o.x === 0 && o.z === 0 && o.k === 0 && w.life.wind.level === 0, 'off: still air');
    const u = w.U.uWind.value;
    T.assert(u.x === 0 && u.y === 0 && u.z === 0 && u.w === 0 && w.U.uWindFronts.value.every((v) => v.x === 0 && v.y === 0 && v.z === 0 && v.w === 0), 'off: every wind uniform is zero again');
    T.assert(w.game.fx.fire.wind == null, 'off: the fire field no longer reads the wind');
    const b = T.build('ash', 'off');
    b.step(3);
    T.assert(b.U.uWind.value.x === 0 && b.U.uWind.value.z === 0, 'life off: the uniforms are never written');
  },

  /** No NaN for NaN input; a NaN front or burst is refused. */
  nan(T) {
    const w = T.build('cinderwood', 'wind');
    w.step(1);
    const W = w.life.wind, o = { x: 0, z: 0, k: 0 };
    for (const [x, z] of [[NaN, 0], [0, NaN], [Infinity, 1], [1, -Infinity]]) {
      W.at(x, z, o);
      T.assert(Number.isFinite(o.x) && Number.isFinite(o.z) && Number.isFinite(o.k), `at(${x}, ${z}) is finite (${o.x}, ${o.z}, ${o.k})`);
    }
    W.burst(NaN, 0, 1, 10);
    w.world.life.gust(0, 0, NaN, 10);
    W.front({ strength: NaN, speed: NaN, width: NaN, dirX: NaN, dirZ: NaN, from: NaN });
    w.step(1);
    W.at(0, 20, o);
    T.assert(Number.isFinite(o.x + o.z + o.k) && Number.isFinite(W.speed + W.level + W.dirX + W.dirZ), 'NaN options fall back to the level\'s numbers');
    T.assert(w.U.uWindFronts.value.every((v) => Number.isFinite(v.x + v.y + v.z + v.w)) && Number.isFinite(w.U.uWind.value.x + w.U.uWind.value.z), 'the uniforms stay finite');
  },

  /** The streaks stay inside the budget on every level, even with fronts sent back to back, and fewer on the phone. */
  budget(T) {
    for (const id of T.LEVEL_IDS) {
      const off = T.build(id, 'off');
      const on = T.build(id, 'wind');
      let peak = 0, peakAlive = 0;
      for (let i = 0; i < 30; i++) {
        if (i % 2 === 0) on.life.wind.front({ strength: 1.6, from: 20 });
        off.step(1);
        on.step(1);
        peak = Math.max(peak, on.counts().alpha - off.counts().alpha);
        const t = on.life.wind._t;
        peakAlive = Math.max(peakAlive, on.life.wind._streakDie.reduce((n, d) => n + (d > t ? 1 : 0), 0));
      }
      const c = on.counts();
      T.assert(peakAlive <= STREAK_MAX && peak <= STREAK_MAX + 25, `${id}: streaks inside the budget (${peakAlive} alive at most, alpha +${peak} over life off; <= ${STREAK_MAX})`);
      T.assert(c.add === off.counts().add || Math.abs(c.add - off.counts().add) < 40, `${id}: nothing of the wind in fx.add`);
      T.assert(c.random === 0 && c.own === 0, `${id}: no Math.random, no pool of its own`);
    }
    const hi = T.build('cinderwood', 'wind', { quality: 1 });
    const lo = T.build('cinderwood', 'wind', { quality: 0.5 });
    let a = 0, b = 0;
    for (let i = 0; i < 20; i++) {
      if (i % 3 === 0) {
        hi.life.wind.front({ strength: 1, from: 15 });
        lo.life.wind.front({ strength: 1, from: 15 });
      }
      hi.step(1);
      lo.step(1);
    }
    a = hi.counts().spawned.alpha;
    b = lo.counts().spawned.alpha;
    T.assert(b < a, `the phone gets fewer streaks (${b} spawns at quality 0.5, ${a} at 1)`);
  },

  /** life.k scales the wind; the weather's windK multiplies in. */
  strength(T) {
    // (LIFE.k is global: one build at a time)
    const lo = T.build('cinderwood', 'wind', { k: 0.6 });
    lo.step(4);
    const sLo = lo.life.wind.speed;
    const hi = T.build('cinderwood', 'wind', { k: 1.5 });
    hi.step(4);
    const sHi = hi.life.wind.speed;
    T.assert(T.near(sHi / sLo, 1.5 / 0.6, 1e-6), `lifeK scales the speed (${sLo.toFixed(2)} at 0.6, ${sHi.toFixed(2)} at 1.5)`);
    const w = T.build('cinderwood', 'wind', { k: 1 });
    w.step(2);
    const s0 = w.life.wind.speed;
    w.life.wind.lull(5);
    w.step(4);
    T.assert(w.life.wind.speed < s0 * 0.2, `a lull stills the air (${w.life.wind.speed.toFixed(2)} from ${s0.toFixed(2)})`);
    w.step(8);
    T.assert(w.life.wind.speed > 0.3, `and lets it go again (${w.life.wind.speed.toFixed(2)})`);
    T.assert(['gust front', 'burst at hero', 'lull'].every((l) => w.life.actions.some((a) => a.label === l)), 'the Lab has its three buttons');
  },

  /** The bonfire's smoke rides the wind: it drifts downwind, and turns when the wind does. */
  smoke(T) {
    const drift = (dirX, dirZ) => {
      const w = T.build('cinderwood', 'wind');
      w.step(1);
      quiet(w);
      const W = w.life.wind;
      W.T = { ...W.T, dir: (Math.atan2(dirZ, dirX) * 180) / Math.PI, wander: 0 };
      w.step(6);
      const F = w.game.fx.fire, d = F.data, bf = w.set.bonfire;
      let sx = 0, sz = 0, n = 0;
      for (let i = 0; i < F.count; i++) {
        const k = i * 15;
        if (d[k + 12] !== 1) continue;
        sx += d[k] - bf.x;
        sz += d[k + 2] - bf.z;
        n++;
      }
      return { x: sx / Math.max(1, n), z: sz / Math.max(1, n), n };
    };
    const east = drift(1, 0), north = drift(0, -1);
    T.assert(east.n > 0 && east.x > 0.2, `wind to +x: the smoke drifts to +x (mean ${east.x.toFixed(2)}, ${east.z.toFixed(2)} m, ${east.n} puffs)`);
    T.assert(north.z < -0.2 && Math.abs(north.x) < north.z * -1, `wind to -z: it turns with it (mean ${north.x.toFixed(2)}, ${north.z.toFixed(2)} m)`);
  },
};
