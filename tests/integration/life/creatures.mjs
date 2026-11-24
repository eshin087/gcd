// The living world's 'creatures' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . creatures

const FIREFLY_LEVELS = new Set(['cinderwood', 'fox', 'grove']);
/** shared-pool budget (BRIEF section 6): letters drawn by the creatures in one frame */
const BUDGET = { alpha: 60, add: 120 };
/** the fauna (flock.js, animals.js): where there are flocks, where there are animals */
const FLOCK_LEVELS = new Set(['cinderwood', 'ash', 'fox', 'city']);
const ANIMAL_LEVELS = new Set(['cinderwood', 'ash', 'ring', 'fox']);
/** the fauna's own batch: letters a frame at most (a full sky of flocks and every animal) */
const LETTERS = 260;

const flying = (C) => C.flocks.airborne;
const anyFlock = (C) => C.flocks.flocks.some((f) => f.on);

const minFirefly = (w) => {
  const h = w.game.player.position;
  let m = Infinity;
  for (const f of w.life.creatures.fireflies) m = Math.min(m, Math.hypot(f.x - h.x, f.z - h.z));
  return m;
};

export default {
  /** takes('fireflies') exactly where the creatures draw them (and nowhere with the piece off). */
  takes(T) {
    for (const id of T.LEVEL_IDS) {
      const w = T.build(id, 'creatures');
      w.step(0.5);
      const want = FIREFLY_LEVELS.has(id);
      T.assert(w.life.takes('fireflies') === want, `${id}: takes fireflies ${want}`);
      T.assert(want === (w.life.creatures.fireflies.length > 0), `${id}: draws ${w.life.creatures.fireflies.length} fireflies`);
      const off = T.build(id, 'wind');
      off.step(0.5);
      T.assert(off.life.takes('fireflies') === false, `${id}: creatures off: the atmosphere keeps its fireflies`);
    }
  },

  /** A hero who stands still 5 s among fireflies has none within 2 m (the foxfire: none within 4 m). */
  fireflies(T) {
    for (const [id, min] of [['cinderwood', 2], ['fox', 4], ['grove', 2]]) {
      const w = T.build(id, 'creatures');
      w.step(1);
      // stand where the most fireflies live
      const ff = w.life.creatures.fireflies;
      let best = ff[0], bestN = -1;
      for (const a of ff) {
        let n = 0;
        for (const b of ff) if (Math.hypot(a.hx - b.hx, a.hz - b.hz) < 4) n++;
        if (n > bestN) { bestN = n; best = a; }
      }
      w.place(best.x, best.z);
      w.step(5);
      const m = minFirefly(w);
      T.assert(m >= min, `${id}: after 5 s standing among ${bestN} fireflies the nearest is ${m.toFixed(2)} m away (>= ${min})`);
      // they close behind him: once he has gone, they drift back to where they live
      w.place(best.x + 30, best.z);
      w.step(30);
      const back = Math.hypot(best.x - best.hx, best.z - best.hz);
      T.assert(back < 2.5, `${id}: he left: the firefly is back within ${back.toFixed(2)} m of its home (its own wander is ~2 m)`);
    }
  },

  /** Birds near a running hero take off (up and out of the frame within 2 s); those 25 m away stay. */
  birds(T) {
    for (const id of ['cinderwood', 'ash', 'fox']) {
      const w = T.build(id, 'creatures');
      w.step(0.5);
      const B = w.life.creatures.birds;
      T.assert(B.length >= 4, `${id}: ${B.length} birds perched`);
      if (!B.length) continue;
      const b = B[0];
      // the hero 12 m from the perch, inward, then running at it
      const rad = Math.hypot(b.px, b.pz) || 1;
      const sx = b.px - (b.px / rad) * 12, sz = b.pz - (b.pz / rad) * 12;
      w.place(sx, sz);
      w.step(1);
      T.assert(b.state === 'perched', `${id}: a hero standing 12 m away leaves it perched (${b.state})`);
      const far = B.filter((o) => Math.hypot(o.px - b.px, o.pz - b.pz) > 25 + 12);
      w.walk((b.px / rad) * 5, (b.pz / rad) * 5);
      let t = 0;
      while (b.state === 'perched' && t < 3) { w.step(0.1); t += 0.1; }
      w.walk(0, 0);
      T.assert(b.state === 'flying', `${id}: the running hero put it up (${b.state}) after ${t.toFixed(1)} s`);
      const flock = B.filter((o) => o.state !== 'perched').length;
      T.assert(flock >= 1 && flock <= 5, `${id}: ${flock} took off together`);
      const y0 = b.py;
      w.step(2);
      const up = b.y - y0, away = Math.hypot(b.x - b.px, b.z - b.pz);
      T.assert(up > 3.5 && away > 5, `${id}: 2 s later it is ${up.toFixed(1)} m up and ${away.toFixed(1)} m away`);
      T.assert(far.every((o) => o.state === 'perched'), `${id}: the ${far.length} birds 25 m from him stay perched`);
    }
  },

  /** Against the REAL wind and answer: an ordinary gust front lifts a group or two off the tree line
   *  as it passes (wind.at(perch).alarm over CREATURES_TUNE.alarm.gust), a quiet front (the arrival's)
   *  lifts none, a roar empties it. */
  gusts(T) {
    for (const id of ['cinderwood', 'ash', 'fox']) {
      const run = (send) => {
        const w = T.build(id, 'wind,creatures,answer');
        const W = w.life.wind;
        for (const F of W.fronts) F.on = false;
        W._next = 1e9; // (only the front this scenario sends)
        w.step(0.5);
        const B = w.life.creatures.birds;
        const p0 = B.filter((b) => b.state === 'perched').length;
        send(w);
        let alarm = 0, k = 0;
        const o = { x: 0, z: 0, k: 0 };
        for (let i = 0; i < 18 * 4; i++) {
          w.step(0.25);
          for (const b of B) {
            W.at(b.px, b.pz, o);
            alarm = Math.max(alarm, o.alarm);
            k = Math.max(k, o.k);
          }
        }
        return { p0, up: p0 - B.filter((b) => b.state === 'perched').length, alarm, k };
      };
      const g = run((w) => w.life.wind.front({ strength: 1.1 }));
      const m = run((w) => w.life.wind.front({ strength: 0.75 }));
      const q = run((w) => w.life.wind.front({ strength: 1.1, quiet: true }));
      const r = run((w) => w.life.answer.answerRoar(1, true));
      T.assert(g.alarm > 0.85 && g.up >= 1 && g.up < g.p0, `${id}: a gust front lifts some off the tree line (${g.up} of ${g.p0}; alarm at the perches up to ${g.alarm.toFixed(2)})`);
      T.assert(m.up <= g.up, `${id}: a weak front (0.75) lifts no more (${m.up}; alarm up to ${m.alarm.toFixed(2)})`);
      T.assert(q.k > 0.55 && q.alarm === 0 && q.up === 0, `${id}: the same front made quiet (the arrival's) lifts none (k ${q.k.toFixed(2)}, alarm ${q.alarm}, ${q.up} up)`);
      T.assert(r.up >= r.p0 * 0.9, `${id}: a roar empties the tree line (${r.up} of ${r.p0})`);
    }
  },

  /** startle returns how many fled; its birds stay gone at least 20 s, and come back out of view. */
  startle(T) {
    const w = T.build('cinderwood', 'creatures');
    w.step(0.5);
    const B = w.life.creatures.birds, b = B[0];
    const near = B.filter((o) => Math.hypot(o.px - b.px, o.pz - b.pz) < 6);
    const n = w.life.creatures.startle(b.px, b.pz, 6, 1);
    T.assert(n >= near.length && near.every((o) => o.state !== 'perched'), `startle returned ${n} (>= its ${near.length} birds), all of them up`);
    T.assert(w.life.creatures.startle(b.px, b.pz, 6, 1) < n, 'startled again at once: the birds are already gone');
    // the hero far away, the perch out of view
    w.place(-b.px, -b.pz);
    let min = Infinity;
    for (let t = 0; t < 25; t += 0.5) {
      w.step(0.5);
      if (near.some((o) => o.state === 'perched')) { min = t; break; }
    }
    T.assert(min === Infinity, 'none of them is back within 25 s');
    w.step(40);
    T.assert(near.every((o) => o.state === 'perched'), `a minute later they are back on their perches, out of view (${near.filter((o) => o.state === 'perched').length}/${near.length})`);
    // in view, they do not come back
    const v = T.build('cinderwood', 'creatures');
    v.step(0.5);
    const c = v.life.creatures.birds[0];
    v.place(c.px * 0.8, c.pz * 0.8);
    v.life.creatures.startle(c.px, c.pz, 3, 1);
    v.step(70);
    T.assert(c.state !== 'perched', 'a perch in view is not refilled');
    T.assert(v.life.creatures.startle(0, 0, 0, 1) === 0 && v.life.creatures.startle(NaN, 0, 5, 1) === 0, 'a startle of radius 0 or at NaN is nothing');
  },

  /** A bird does not perch on a felled tree (world.destructibles reports its piece's state). */
  felled(T) {
    const w = T.build('cinderwood', 'creatures');
    w.step(0.5);
    const B = w.life.creatures.birds, b = B[0], def = b.post.def;
    T.assert(!!def, 'a perch knows its tree');
    const pieces = (w.set.breakables ?? []).map((d) => ({ def: d, state: 0 }));
    w.world.destructibles = { list: pieces };
    w.step(0.5);
    T.assert(b.state === 'perched', 'its tree stands: it stays');
    pieces.find((p) => p.def === def).state = 2;
    w.step(0.5);
    T.assert(B.filter((o) => o.post.def === def).every((o) => o.state !== 'perched'), 'its tree is felled: every bird on it is up');
    w.place(-b.px, -b.pz);
    w.step(70);
    w.life.creatures.returnBirds();
    w.life.clear('reset');
    T.assert(B.filter((o) => o.post.def === def).every((o) => o.state !== 'perched'), 'it never returns to the felled tree (time, the Lab, a reset)');
    T.assert(B.filter((o) => o.post.def !== def).every((o) => o.state === 'perched'), 'the others are on their perches');
  },

  /** The moths scatter when the hero stands at the fire, and come back once he leaves. */
  moths(T) {
    const w = T.build('cinderwood', 'creatures');
    const bf = w.set.bonfire;
    w.place(bf.x + 3, bf.z);
    w.step(3);
    const M = w.life.creatures.moths;
    T.assert(M.length >= 3 && M.every((m) => m.fear === 0), `${M.length} moths round the fire, calm with the hero 3 m away`);
    const r = M.map((m) => Math.hypot(m.x - bf.x, m.z - bf.z));
    T.assert(r.every((d) => d >= 0.2 && d <= 2.2), `their orbits ${Math.min(...r).toFixed(2)} - ${Math.max(...r).toFixed(2)} m`);
    w.place(bf.x + 0.9, bf.z);
    w.step(1);
    T.assert(M.every((m) => m.fear > 0.9), 'he stands at the fire: they scatter');
    w.place(bf.x + 3, bf.z);
    w.step(8);
    T.assert(M.every((m) => m.fear < 0.05), 'he steps back: they return');
  },

  /** The hawk: the ring only, before the fight only. */
  hawk(T) {
    for (const id of T.LEVEL_IDS) {
      const w = T.build(id, 'creatures');
      w.step(1);
      T.assert((w.life.creatures.hawk !== null) === (id === 'ring'), `${id}: hawk ${w.life.creatures.hawk ? 'yes' : 'no'}`);
    }
    const w = T.build('ring', 'creatures', { state: 'explore' });
    w.place(0, 4);
    w.step(12);
    const h = w.life.creatures.hawk;
    T.assert(h.on && h.y > 5, `before the fight it circles ${h.y.toFixed(1)} m up`);
    // a lap stays where the game camera sees it (round the camera's focus, a little south)
    let maxN = 0, maxX = 0;
    for (let t = 0; t < 25; t += 0.5) {
      w.step(0.5);
      maxN = Math.max(maxN, 4 - h.z);
      maxX = Math.max(maxX, Math.abs(h.x));
    }
    T.assert(maxN < 9 && maxX < 11, `its lap: at most ${maxN.toFixed(1)} m north of the hero, ${maxX.toFixed(1)} m to the side`);
    w.game.state = 'boss';
    w.step(6);
    T.assert(!h.on, 'the boss wakes: it is gone');
    w.step(30);
    T.assert(!h.on, '... and stays gone through the fight');
  },

  /** The fight's calm: the birds do not return, fireflies and moths thin. */
  calm(T) {
    const w = T.build('cinderwood', 'creatures');
    w.step(2);
    let a0 = 0;
    for (let i = 0; i < 60; i++) { w.step(1 / 60); a0 += w.life.creatures.drawn.add; }
    const b = w.life.creatures.birds[0];
    w.life.creatures.startle(b.px, b.pz, 4, 1);
    w.place(-b.px, -b.pz);
    w.game.state = 'boss';
    w.step(80);
    let a1 = 0;
    for (let i = 0; i < 60; i++) { w.step(1 / 60); a1 += w.life.creatures.drawn.add; }
    T.assert(b.state !== 'perched', 'in the fight a bird that left does not return');
    T.assert(a1 < a0 * 0.6, `fireflies thin in the fight (${(a1 / 60).toFixed(1)} a frame, ${(a0 / 60).toFixed(1)} before)`);
    w.game.state = 'explore';
    w.step(70);
    T.assert(b.state === 'perched', 'after the fight it comes back (out of view)');
  },

  /** The budget on every level (the hero running, a startle), the phone's half, and off leaves nothing. */
  budget(T) {
    for (const id of T.LEVEL_IDS) {
      for (const quality of [1, 0.5]) {
        const w = T.build(id, 'creatures', { quality });
        let ma = 0, md = 0, sum = 0;
        w.walk(3, -4);
        for (let i = 0; i < 20 * 60; i++) {
          if (i === 600) { w.walk(-5, 1); w.life.creatures.startle(w.game.player.position.x, w.game.player.position.z, 10, 1); }
          w.step(1 / 60);
          const d = w.life.creatures.drawn;
          ma = Math.max(ma, d.alpha);
          md = Math.max(md, d.add);
          sum += d.alpha + d.add;
        }
        const c = w.counts();
        T.assert(ma <= BUDGET.alpha * quality && md <= BUDGET.add * quality, `${id} q${quality}: at most ${ma} alpha (<= ${BUDGET.alpha * quality}), ${md} add (<= ${BUDGET.add * quality}) a frame; ${(sum / 1200).toFixed(1)} on average`);
        // (the fauna's letters are the creatures' one own batch, on the levels that have fauna)
        const fauna = !!w.life.creatures.letters;
        T.assert(c.pools === (fauna ? 1 : 0) && c.random === 0, `${id} q${quality}: ${fauna ? 'one batch of its own (the fauna)' : 'no pool of its own'} (${c.pools}), no Math.random (${c.random})`);
        if (quality === 1) {
          T.setLife('off');
          w.step(0.5);
          const d = w.life.creatures.drawn;
          T.assert(d.alpha === 0 && d.add === 0 && w.life.takes('fireflies') === false && w.life.creatures.startle(0, 0, 50, 1) === 0, `${id}: switched off: nothing drawn, nothing taken, nothing startled`);
        }
      }
    }
  },

  /** Fire landing on the tree line sends a flock of 20+ birds up within a second (not all on one
   *  frame); they are gone from the level within 14 s; a second fire a second later sends none. */
  flockFire(T) {
    const w = T.build('cinderwood', 'creatures');
    w.place(0, 0);
    w.step(0.5);
    const C = w.life.creatures, F = C.flocks;
    T.assert(F.roosts.length >= 8 && F.roosts.every((R) => R.birds >= 30), `${F.roosts.length} roosts on the tree wall, ${F.roosts.reduce((n, R) => n + R.birds, 0)} birds hidden in the canopy`);
    const R = F.roosts[0];
    w.world.ignite(R.tx + 3, R.tz, 2, 1);
    const f = F.flocks.find((o) => o.on);
    T.assert(!!f && f.roost === R && R.birds === 0, `fire 3 m from its tree: that roost goes (${f ? f.n : 0} birds)`);
    w.step(1 / 60);
    const first = flying(C);
    w.step(1.2);
    const up = flying(C);
    T.assert(first < f.n * 0.5 && up >= 20, `they burst out over a second: ${first} in the air after a frame, ${up} after 1.2 s`);
    let top = 0;
    for (let i = 0; i < f.n; i++) top = Math.max(top, f.birds[i].y);
    T.assert(top > R.y + 1.5, `they rise out of the crown (${(top - R.y).toFixed(1)} m over it)`);
    // a second fire, a second later, at another roost: the sky's gap holds it
    w.step(1);
    const R2 = F.roosts[5];
    w.world.ignite(R2.tx, R2.tz, 2, 1);
    T.assert(R2.birds > 0 && F.flocks.filter((o) => o.on).length === 1, `a second fire a second later sends none (that roost still holds ${R2.birds})`);
    w.step(12);
    T.assert(!anyFlock(C) && flying(C) === 0, `14 s on, the flock is gone from the level (${flying(C)} in the air)`);
    w.world.ignite(R2.tx, R2.tz, 2, 1);
    T.assert(R2.birds === 0 && anyFlock(C), 'after the gap, fire at another roost sends its flock');
    // a level has a finite number of birds: a roost that went does not go again in the fight
    w.game.state = 'boss';
    w.step(30);
    F._last = -1e9;
    T.assert(F.flush(R, R.x, R.z) === 0 && R.birds === 0, 'an emptied roost has no more birds in the fight');
  },

  /** A toppled tree's flock leaves from that tree (world:impact 'topple' through the answer). */
  flockTree(T) {
    const w = T.build('cinderwood', 'creatures,answer');
    w.place(0, 0);
    w.step(0.5);
    const F = w.life.creatures.flocks, R = F.roosts[2];
    w.emit('world:impact', { kind: 'chip', mat: 'wood', x: R.tx, y: 1, z: R.tz, power: 1, by: 'player' });
    T.assert(R.birds > 0 && !F.flocks.some((f) => f.on), 'a chip on its tree sends none');
    w.emit('world:impact', { kind: 'topple', mat: 'wood', x: R.tx + 2, y: 0.5, z: R.tz - 1, power: 2, by: 'boss' });
    const f = F.flocks.find((o) => o.on);
    T.assert(!!f && f.roost === R, `the tree 2 m from the roost falls: its flock goes (${f?.n ?? 0}; ${F.lastWhy})`);
    w.step(1.5);
    let d = 0, n = 0;
    for (let i = 0; i < (f?.n ?? 0); i++) {
      const b = f.birds[i];
      if (b.t < 0) continue;
      d += Math.hypot(b.x - R.x, b.z - R.z);
      n++;
    }
    T.assert(n >= 20 && d / n < 10, `1.5 s on, ${n} birds out, ${(d / Math.max(1, n)).toFixed(1)} m on average from that tree`);
    F._last = -1e9;
    w.emit('world:impact', { kind: 'crash', mat: 'stone', x: 0, y: 0.4, z: 0, power: 1, by: 'boss' });
    T.assert(F.flocks.filter((o) => o.on).length === 1, 'a crash in the middle of the clearing sends no flock');
  },

  /** Animals within the hero's radius bolt away from him and end in cover; those far away stay. */
  animals(T) {
    for (const id of ['cinderwood', 'ash', 'ring', 'fox']) {
      const w = T.build(id, 'creatures');
      w.place(0, 0);
      w.step(0.5);
      const A = w.life.creatures.animals, L = A.list;
      T.assert(L.length >= 1, `${id}: ${L.length} animals (${[...new Set(L.map((a) => a.kind))].join(', ')})`);
      if (!L.length) continue;
      const a = L[0];
      const r = Math.hypot(a.x, a.z) || 1;
      const sx = a.x - (a.x / r) * 3.5, sz = a.z - (a.z / r) * 3.5;
      const far = L.filter((o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) > 30);
      w.place(sx, sz);
      const d0 = Math.hypot(a.x - sx, a.z - sz);
      w.step(0.8);
      T.assert(a.state === 'run' || a.state === 'hid' || a.state === 'gone', `${id}: the ${a.kind} 3.5 m from him bolts (${a.state})`);
      let inside = 0;
      for (let t = 0; t < 14 && a.state === 'run'; t += 0.1) {
        w.step(0.1);
        if (A.inside(a.x, a.z)) inside++;
      }
      T.assert(a.state === 'hid' || a.state === 'gone', `${id}: it is in cover (${a.state})`);
      const d1 = Math.hypot(a.x - sx, a.z - sz);
      T.assert(d1 > d0 + 4 && inside === 0, `${id}: it ran away from him (${d0.toFixed(1)} -> ${d1.toFixed(1)} m), never onto the fighting ground`);
      T.assert(far.every((o) => o.state === 'sit'), `${id}: the ${far.length} more than 30 m off still sit`);
    }
  },

  /** Nothing alive is ever on the fighting ground: the hero runs the rim, roars, blows and fire everywhere. */
  keepOut(T) {
    for (const id of ['cinderwood', 'ash', 'ring', 'fox']) {
      const w = T.build(id, 'creatures,answer', { state: 'boss' });
      w.step(0.5);
      const A = w.life.creatures.animals, K = w.life.creatures.FL.keepOut;
      let bad = 0, frames = 0;
      for (let i = 0; i < 40; i++) {
        const ang = i * 0.7, x = Math.cos(ang) * (K + 2), z = Math.sin(ang) * (K + 2);
        w.place(x, z);
        if (i % 5 === 0) w.emit('dragon:roar', { strength: 1 });
        w.world.impact(x * 0.8, z * 0.8, 2, 1.2, { kind: 'blunt', by: 'boss' });
        w.world.ignite(-x, -z, 3, 1);
        for (let k = 0; k < 15; k++) {
          w.step(1 / 30);
          frames++;
          for (const a of A.list) if (a.state !== 'hid' && a.state !== 'gone' && A.inside(a.x, a.z)) bad++;
        }
      }
      T.assert(bad === 0, `${id}: over ${frames} frames of the fight no animal is inside the fighting ground (${bad})`);
    }
  },

  /** Nothing returns while the boss is up; some come back after the victory. The fox goes once. */
  returns(T) {
    const w = T.build('cinderwood', 'creatures', { state: 'boss' });
    w.place(0, 0);
    w.step(0.5);
    const C = w.life.creatures, F = C.flocks, A = C.animals;
    // (at most three flocks in the air: each roost goes as soon as there is room)
    for (const R of F.roosts) {
      for (let t = 0; R.birds > 0 && t < 60; t += 0.5) {
        F._last = -1e9;
        if (!F.flush(R, 0, 0)) w.step(0.5);
      }
    }
    A.alarm(0, 0, 200, 'test');
    w.step(15);
    T.assert(F.roosts.every((R) => R.birds === 0) && A.list.every((a) => a.state === 'hid'), 'the roosts are empty, the animals in cover');
    w.step(150);
    T.assert(F.roosts.every((R) => R.birds === 0) && A.list.every((a) => a.state === 'hid'), 'two and a half minutes of the fight later nothing has returned');
    w.game.state = 'victory';
    w.step(45);
    const r1 = F.roosts.filter((R) => R.birds > 0).length, a1 = A.list.filter((a) => a.state === 'sit').length;
    w.step(90);
    const r2 = F.roosts.filter((R) => R.birds > 0).length, a2 = A.list.filter((a) => a.state === 'sit').length;
    T.assert(r1 >= 1 && r2 >= r1 && r2 >= F.roosts.length * 0.6, `after the victory the roosts fill over time (${r1} at 45 s, ${r2} of ${F.roosts.length} at 135 s)`);
    T.assert(a2 >= 1 && a2 >= a1, `... and animals come back (${a1} at 45 s, ${a2} of ${A.list.length} at 135 s)`);
    const fx = T.build('fox', 'creatures');
    fx.step(0.5);
    const fox = fx.life.creatures.animals.list[0];
    fx.place(fox.x + 2, fox.z);
    fx.step(15);
    fx.place(0, 30);
    fx.step(300);
    T.assert(fox.kind === 'fox' && fox.state === 'gone', `the fox slips away once and is not back in this visit (${fox.state})`);
  },

  /** Where there is fauna (the Throne, the Grove, the code hall: none); the letter budget on every level. */
  fauna(T) {
    for (const id of T.LEVEL_IDS) {
      const w = T.build(id, 'creatures,answer');
      w.step(0.5);
      const C = w.life.creatures;
      const nf = C.flocks?.roosts.length ?? 0, na = C.animals?.list.length ?? 0;
      T.assert((nf > 0) === FLOCK_LEVELS.has(id) && (na > 0) === ANIMAL_LEVELS.has(id), `${id}: ${nf} roosts, ${na} animals`);
      if (id === 'starless') T.assert(!C.letters && nf === 0 && na === 0, 'the Throne: nothing alive, no batch');
      for (const quality of [1, 0.5]) {
        const q = T.build(id, 'creatures,answer', { quality });
        q.step(0.5);
        const Q = q.life.creatures;
        let max = 0;
        // the worst case: a roost goes every 2 s (the gap skipped), every animal runs, the hero runs about
        q.walk(4, -3);
        for (let i = 0; i < 30 * 60; i++) {
          if (i % 120 === 0 && Q.flocks) {
            Q.flocks._last = -1e9;
            const R = Q.flocks.roosts.find((o) => o.birds > 0);
            if (R) Q.flocks.flush(R, 0, 0);
          }
          if (i === 200) Q.animals?.alarm(0, 0, 200, 'test');
          q.step(1 / 60);
          max = Math.max(max, Q.drawn.letters ?? 0, Q.letters?.n ?? 0);
        }
        const c = q.counts();
        const cap = LETTERS * Math.max(0.5, quality);
        T.assert(max <= cap && c.random === 0, `${id} q${quality}: at most ${max} fauna letters a frame (<= ${cap}), ${c.random} Math.random`);
      }
    }
  },

  /** The Lab's buttons: a flock flees, the animals bolt, life returns. */
  lab(T) {
    const w = T.build('cinderwood', 'creatures');
    w.place(0, 0);
    w.step(0.5);
    const act = (label) => w.life.actions.find((a) => a.label === label);
    T.assert(['flock flees', 'animals bolt', 'life returns'].every(act), 'the three buttons are on the life row');
    T.assert(act('flock flees').run() >= 20, 'flock flees: a roost goes');
    w.place(25, 0);
    T.assert(act('animals bolt').run() >= 1, 'animals bolt: they run');
    w.step(15);
    T.assert(act('life returns').run() >= 1 && w.life.creatures.flocks.roosts.every((R) => R.birds > 0), 'life returns: the roosts are full again');
  },
};
