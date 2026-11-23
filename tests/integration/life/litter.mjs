// The living world's 'litter' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . litter

const AIR = 1, LYING = 2;

/** A level with the litter on, nothing falling (rate 0) and nothing lying yet: a clean floor to test on. */
function bare(T, id, spec = 'litter', o = {}) {
  const w = T.build(id, spec, o);
  const L = w.life.litter;
  // (nothing falls, nothing is laid, and nothing is recycled for being too many)
  L.T = { ...L.T, rate: 0, lying: 0 };
  w.place(o.x ?? 2, o.z ?? 14);
  w.step(1 / 60); // (the first update builds the pool)
  L.T = { ...L.T, lying: 1e6 };
  return w;
}

/** A letter of kind 0 put down at (x, z) (or into the air at height y), that never times out. */
function put(w, x, z, y) {
  const L = w.life.litter;
  const f = L._free();
  L._dress(f, 0);
  L._lie(f, x, z);
  f.last = 1e9;
  f.a = 1;
  f.fa = 0;
  L.count++;
  if (Number.isFinite(y)) {
    f.s = AIR;
    f.y = y;
    f.vx = f.vz = 0;
    f.vy = -f.fall;
  }
  return f;
}

/** The air everywhere: (vx, vz) m/s (a faked gust: the real wind is not in this worktree's tests). */
function fakeWind(w, vx, vz, k = 1) {
  w.life.wind.at = (x, z, out = { x: 0, z: 0, k: 0 }) => {
    out.x = vx;
    out.z = vz;
    out.k = k;
    return out;
  };
}

export default {
  /** A letter dropped from h lands in about h / its fall speed, then lies still for 20 s of still air. */
  landsAndStays(T) {
    for (const id of ['cinderwood', 'ash', 'fox']) {
      const w = bare(T, id);
      const h = 6;
      const f = put(w, 5, 12, h);
      const expect = h / f.fall;
      let t = 0;
      while (f.s === AIR && t < 60) { w.step(0.05); t += 0.05; }
      T.assert(f.s === LYING, `${id}: the letter landed (after ${t.toFixed(1)} s)`);
      T.assert(t > expect * 0.6 && t < expect * 1.5 + 1, `${id}: it fell in ${t.toFixed(1)} s (its fall speed says ~${expect.toFixed(1)} s)`);
      T.assert(f.y < 0.35 && f.y >= 0.04, `${id}: it lies just over the floor (y ${f.y.toFixed(2)})`);
      const x = f.x, z = f.z;
      f.last = 1e9; // (ash melts into the floor in 10 - 22 s by design: this is about the air)
      w.step(20);
      T.assert(f.s === LYING && f.x === x && f.z === z, `${id}: it stays put for 20 s of still air (moved ${Math.hypot(f.x - x, f.z - z).toFixed(3)} m)`);
    }
  },

  /** Air faster than a letter's own threshold lifts it; slower air leaves it; a gust takes some, not all. */
  liftByAir(T) {
    const w = bare(T, 'cinderwood');
    w.place(0, 20);
    const f = put(w, 6, 14);
    f.lift = 3;
    fakeWind(w, 2.6, 0);
    w.step(2);
    T.assert(f.s === LYING, `air at 2.6 m/s leaves a letter whose threshold is 3 m/s lying`);
    fakeWind(w, 3.4, 0, 1);
    w.step(0.2);
    T.assert(f.s === AIR, `air at 3.4 m/s lifts it within 0.2 s`);
    w.step(0.6);
    T.assert(f.x > 6.05, `it is carried downwind (x ${f.x.toFixed(2)})`);
    // a gust in the middle of the kind's range takes some of a patch and leaves the others
    const g = bare(T, 'cinderwood');
    g.place(0, 20);
    const K = g.life.litter.kinds[0].K;
    const patch = [];
    for (let i = 0; i < 60; i++) patch.push(put(g, -6 + (i % 10) * 1.2, 10 + Math.floor(i / 10) * 1.2));
    fakeWind(g, (K.lift[0] + K.lift[1]) / 2, 0, 1);
    g.step(0.3);
    const lifted = patch.filter((f) => f.s === AIR).length;
    T.assert(lifted > 10 && lifted < 50, `a mid-range gust lifts some of a patch, not all (${lifted} of 60)`);
    // and once the air is still again, what it lifted comes to rest
    fakeWind(g, 0, 0, 0);
    g.step(12);
    T.assert(patch.every((f) => f.s !== AIR), `after the gust everything lies again (${patch.filter((f) => f.s === AIR).length} still in the air)`);
  },

  /** The hero running through moves the letters near his path and not those 6 m away; they settle again. */
  kickedByFeet(T) {
    for (const id of ['cinderwood', 'fox']) {
      const w = bare(T, id);
      w.place(-8, 10);
      w.step(0.1);
      const near = [], far = [];
      for (let x = -5; x <= 5; x += 0.7) {
        near.push(put(w, x, 10 + 0.3 * Math.sin(x * 3)));
        far.push(put(w, x, 16));
      }
      const at = (A) => A.map((f) => [f.x, f.z]);
      const n0 = at(near), f0 = at(far);
      w.walk(7.2, 0);
      w.step(2.2);
      w.walk(0, 0);
      w.step(8);
      const moved = (A, P) => A.filter((f, i) => Math.hypot(f.x - P[i][0], f.z - P[i][1]) > 0.25).length;
      const mn = moved(near, n0), mf = moved(far, f0);
      T.assert(mn >= near.length * 0.7, `${id}: a sprint through moves the letters on its path (${mn} of ${near.length})`);
      T.assert(mf === 0, `${id}: and none 6 m away (${mf} of ${far.length})`);
      T.assert(near.every((f) => f.s !== AIR), `${id}: what it kicked lies again 8 s later`);
      const dz = near.map((f) => Math.abs(f.z - 10)).reduce((a, b) => Math.max(a, b), 0);
      const top = Math.max(...near.map((f) => f.y));
      T.assert(dz < 3.5, `${id}: kicked low and aside, not flung (furthest ${dz.toFixed(2)} m off the path)`);
      T.assert(top < 0.4, `${id}: (they came down: highest now ${top.toFixed(2)} m)`);
    }
  },

  /** scatter returns how many it moved; they come to rest again; off, it does nothing. */
  scatter(T) {
    const w = T.build('cinderwood', 'litter');
    w.place(14, 18);
    w.step(3);
    const L = w.life.litter;
    const lying = L.leaves.filter((f) => f.s === LYING);
    T.assert(lying.length > 40, `cinderwood: litter lies round the hero at the rim from the start (${lying.length})`);
    const c = lying[0];
    const inR = L.leaves.filter((f) => (f.s === LYING || f.s === AIR) && Math.hypot(f.x - c.x, f.z - c.z) <= 4);
    const n = L.scatter(c.x, c.z, 4, 1);
    T.assert(n === inR.length && n > 0, `scatter moved ${n} letters (${inR.length} were within 4 m)`);
    T.assert(inR.every((f) => f.s === AIR), `each of them is in the air`);
    const top = Math.max(...inR.map((f) => f.vy));
    T.assert(top > 1.5, `thrown up (fastest ${top.toFixed(1)} m/s)`);
    w.step(12);
    T.assert(inR.every((f) => f.s !== AIR), `12 s later they have all come to rest (${inR.filter((f) => f.s === AIR).length} still flying)`);
    const out = inR.filter((f) => Math.hypot(f.x - c.x, f.z - c.z) > 1).length;
    T.assert(out >= inR.length * 0.6, `outward: ${out} of ${inR.length} lie more than 1 m from the blow`);
    T.assert(L.scatter(NaN, 0, 4, 1) === 0 && L.scatter(0, 0, -1, 1) === 0, `a bad scatter moves nothing`);
    const off = T.build('cinderwood', 'wind');
    off.step(1);
    T.assert(off.life.litter.scatter(0, 0, 10, 1) === 0, `with the piece off scatter returns 0`);
  },

  /** The pool never exceeds its cap on any level at quality 1, holds fewer at 0.5; the budget. */
  budget(T) {
    for (const id of T.LEVEL_IDS) {
      const peak = { 1: 0, 0.5: 0 };
      for (const q of [1, 0.5]) {
        const w = T.build(id, 'wind,litter', { quality: q });
        w.walk(2, -1.5);
        for (let s = 0; s < 40; s++) {
          w.step(1);
          if (s === 20) w.walk(-2.5, 1);
          peak[q] = Math.max(peak[q], w.counts().own);
        }
        const c = w.counts();
        T.assert(c.pools === 1, `${id} q ${q}: one pool of its own (${c.pools})`);
        T.assert(c.alpha === w.counts().alpha && c.random === 0, `${id} q ${q}: no Math.random`);
      }
      T.assert(peak[1] <= 500 && peak[1] > 0, `${id}: at most 500 letters at quality 1 (peak ${peak[1]})`);
      T.assert(peak[0.5] <= 250 && peak[0.5] < peak[1], `${id}: fewer at quality 0.5 (peak ${peak[0.5]} <= 250)`);
    }
    // the shared pools: the litter spawns nothing there
    const w = T.build('ash', 'off');
    w.step(10);
    const a = w.counts();
    const l = T.build('ash', 'litter');
    l.step(10);
    const b = l.counts();
    T.assert(b.spawned.alpha < a.spawned.alpha, `ash: the ashfall moves from the shared pool into the litter's (${b.spawned.alpha} alpha spawns, ${a.spawned.alpha} without)`);
  },

  /** The window follows a 60 m walk; the count stays steady and nothing lies outside it. */
  window(T) {
    for (const id of ['cinderwood', 'ash', 'fox']) {
      const w = T.build(id, 'litter');
      w.place(-30, 20);
      w.step(4);
      const L = w.life.litter;
      const n0 = L.lying;
      w.walk(6, 0);
      w.step(10);
      w.walk(0, 0);
      w.step(0.5);
      const n1 = L.lying;
      const F = w.U.uFocus.value;
      const outside = L.leaves.filter((f) => f.s === LYING && (Math.abs(f.x - F.x) > 22.01 || f.z < F.z - 19.01 || f.z > F.z + 15.01)).length;
      T.assert(n0 > 0 && Math.abs(n1 - n0) <= Math.max(12, n0 * 0.25), `${id}: walking 60 m keeps the lying count steady (${n0} → ${n1})`);
      T.assert(outside === 0, `${id}: nothing lies outside the window (${outside})`);
    }
  },

  /** Off leaves the pool empty; switching it off mid-run takes every letter away. */
  off(T) {
    for (const id of T.LEVEL_IDS) {
      const w = T.build(id, 'wind,steps');
      w.step(5);
      const c = w.counts();
      T.assert(c.pools === 0 && w.life.litter.count === 0, `${id}: litter off makes no pool and holds nothing (${c.pools} pools, ${w.life.litter.count})`);
      T.assert(w.life.takes('leaves') === false && w.life.takes('ash') === false, `${id}: litter off takes nothing from the atmosphere`);
    }
    const w = T.build('cinderwood', 'litter');
    w.step(5);
    T.assert(w.life.litter.count > 0, `cinderwood: on, letters lie (${w.life.litter.count})`);
    T.setLife('off');
    w.step(0.1);
    T.assert(w.life.litter.count === 0 && w.counts().own === 0, `switched off: none left, none drawn (${w.life.litter.count}, ${w.counts().own})`);
    T.setLife('litter');
    w.step(1);
    T.assert(w.life.litter.lying > 0, `switched on again: the ground is laid again (${w.life.litter.lying})`);
  },

  /** What each level takes from the atmosphere. */
  takes(T) {
    const want = { cinderwood: 'leaves', ash: 'ash', starless: 'leaves', ring: 'leaves', fox: 'leaves', grove: 'leaves' };
    for (const id of T.LEVEL_IDS) {
      const w = T.build(id, 'litter');
      w.step(0.1);
      T.assert(w.life.takes(want[id]) === true, `${id}: the litter takes '${want[id]}'`);
    }
    const w = T.build('ash', 'litter');
    T.assert(w.life.takes('leaves') === false, `ash: the embers' leaf slot is left to the atmosphere`);
  },

  /** The grove: a leaf comes straight down (no drift), one at a time. */
  grove(T) {
    const w = bare(T, 'grove', 'wind,litter');
    const f = put(w, 3, 4, 8);
    const x = f.x, z = f.z;
    let t = 0, maxD = 0;
    while (f.s === AIR && t < 60) {
      w.step(0.1);
      t += 0.1;
      maxD = Math.max(maxD, Math.hypot(f.x - x, f.z - z));
    }
    T.assert(f.s === LYING, `grove: the leaf landed after ${t.toFixed(1)} s`);
    T.assert(maxD < 1e-6, `grove: it came straight down (drift ${maxD.toExponential(1)} m)`);
    const g = T.build('grove', 'wind,litter');
    g.step(4);
    const L = g.life.litter;
    let peak = 0;
    for (let s = 0; s < 60; s++) {
      g.step(1);
      peak = Math.max(peak, L.leaves.filter((r) => r.s === AIR).length);
    }
    T.assert(peak >= 1 && peak <= 8, `grove: few leaves in the air at once (peak ${peak})`);
  },

  /** The ring: grit tumbles across with the wind and piles against the downwind kerb. */
  ring(T) {
    const w = T.build('ring', 'wind,litter');
    w.place(0, 5);
    w.step(90);
    const L = w.life.litter;
    const lie = L.leaves.filter((f) => f.s === LYING);
    const kerb = lie.filter((f) => f.x > 13.4 && f.x < 15 && Math.abs(f.z) < 13).length / (1.6 * 26);
    const mid = lie.filter((f) => Math.abs(f.x) < 8 && Math.abs(f.z) < 8).length / (16 * 16);
    T.assert(kerb > mid * 3, `ring: grit lies thicker against the east kerb (${kerb.toFixed(2)}/m2) than mid-ring (${mid.toFixed(2)}/m2)`);
    const moving = L.leaves.filter((f) => f.s === AIR && f.y < 0.6).length;
    T.assert(moving > 3, `ring: some grit is tumbling along the ground (${moving})`);
  },
};
