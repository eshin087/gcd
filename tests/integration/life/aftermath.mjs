// The living world's aftermath (src/world/life/aftermath.js, piece 'answer'): what a fight leaves in
// the air: smoke off burnt ground, embers, dust over a crater. Its scenarios (tests/integration/life.mjs
// runs them; T is its toolbox). Run: node tests/integration/life.mjs . aftermath

/** Math.random calls made while fn runs. */
function randomIn(fn) {
  const mr = Math.random;
  let n = 0;
  Math.random = () => {
    n++;
    return mr();
  };
  try {
    fn();
  } finally {
    Math.random = mr;
  }
  return n;
}

/** Fire lands at (x, z) as a breath's does: the grass catches, the ground chars, the living world feels it. */
function burn(w, x, z, r = 2) {
  w.world.scorch.burnCircle(x, z, r, 0.6, 1);
  w.world.fire.ignite(x, z, r, 1);
  w.world.ignite(x, z, r, 1);
}

/** The frame, with the ground fire burning down (the toolbox's step leaves world.fire alone). */
function stepF(w, sec, dt = 1 / 60) {
  for (let t = 0; t < sec - 1e-9; t += dt) {
    w.step(dt, dt);
    w.world.fire.update(dt);
  }
}

/** The smoke's written letters now (positions), from its batch. */
function smokeLetters(A) {
  const b = A._b, P = b?.iPos?.array, out = [];
  for (let i = 0; b && i < b.count; i++) out.push({ x: P[i * 3], y: P[i * 3 + 1], z: P[i * 3 + 2] });
  return out;
}

export default {
  /** Smoke rises where fire landed once its flames are out, and is carried downwind: the mean drift of
   *  its letters follows wind.at there. It is gone after its life. Nothing of it draws from Math.random. */
  smoke(T) {
    const w = T.build('cinderwood', 'all');
    const A = w.life.aftermath;
    w.place(6, 18);
    w.step(2);
    const sx = -4, sz = 4;
    burn(w, sx, sz, 2);
    T.assert(A.sources.filter((s) => s.on).length === 1 && A.smoking === 0, 'fire lands: one column waits for its flames');
    let start = -1;
    const r0 = randomIn(() => w.life.ignite(sx + 0.5, sz, 1, 1));
    T.assert(r0 === 0, `fire landing again feeds it, drawing nothing from Math.random (${r0})`);
    for (let t = 0; t < 30 && start < 0; t += 0.25) {
      stepF(w, 0.25);
      if (A.smoking > 0) start = t;
    }
    const left = w.world.fire.burning(sx, sz);
    T.assert(start > 0 && left === 0, `it smokes once the grass there has burned out (after ${start.toFixed(1)} s; ${left} s of flame left)`);
    // its drift against the air, over 10 s
    let mx = 0, mz = 0, k = 0, wx = 0, wz = 0, top = 0;
    const p = { x: 0, z: 0, k: 0 };
    for (let i = 0; i < 40; i++) {
      stepF(w, 0.25);
      for (const l of smokeLetters(A)) {
        if (l.y < 1.2) continue;
        mx += l.x - sx;
        mz += l.z - sz;
        top = Math.max(top, l.y);
        k++;
      }
      w.life.wind.at(sx, sz, p);
      wx += p.x;
      wz += p.z;
    }
    mx /= k || 1;
    mz /= k || 1;
    const ml = Math.hypot(mx, mz), wl = Math.hypot(wx, wz);
    const cos = (mx * wx + mz * wz) / Math.max(1e-6, ml * wl);
    T.assert(k > 200 && top > 2.2, `a column of letters (${k} samples over 10 s, up to ${top.toFixed(1)} m)`);
    T.assert(wl > 0 && cos > 0.85 && ml > 0.2, `it leans downwind: its letters drift ${ml.toFixed(2)} m on average, ${((Math.acos(Math.min(1, cos)) * 180) / Math.PI).toFixed(0)} deg off the wind's way`);
    T.assert(w.counts().random === 0, `nothing of it drew from Math.random (${w.counts().random} in its frames)`);
    const n10 = A._b.count;
    stepF(w, 45, 1 / 30);
    T.assert(A.smoking === 0 && A._b.count === 0 && A.sources.every((s) => !s.on), `it is gone after its life (${n10} letters at 10 s, ${A._b.count} at 55 s)`);
    T.assert(A.stat.embers > 0, `a few embers lifted off it while it was hot (${A.stat.embers})`);
  },

  /** Fire landing every frame along a sweep for 20 s: a handful of columns at most (the newest win),
   *  never past the batch, on the phone fewer. */
  budget(T) {
    for (const q of [1, 0.5]) {
      const w = T.build('cinderwood', 'all', { quality: q });
      const A = w.life.aftermath;
      w.place(0, 22);
      w.step(1);
      let most = 0, lettersMost = 0;
      for (let t = 0; t < 20; t += 1 / 30) {
        const a = t * 0.6, x = Math.cos(a) * 9, z = Math.sin(a) * 9;
        burn(w, x, z, 1.5);
        stepF(w, 1 / 30, 1 / 30);
        let on = 0;
        for (const s of A.sources) if (s.on) on++;
        most = Math.max(most, on);
        lettersMost = Math.max(lettersMost, A._b?.count ?? 0);
      }
      stepF(w, 15, 1 / 30);
      const S = A.T.smoke, max = Math.max(2, Math.round(S.max * q));
      T.assert(most <= max && A.sources.length === max, `quality ${q}: at most ${max} columns at once (${most})`);
      T.assert(A.smoking > 0 && lettersMost <= A._b.max, `... smoking after the sweep (${A.smoking}); letters never past the batch (${lettersMost} <= ${A._b.max})`);
    }
  },

  /** Dust hangs over a crater after a big blow, drifts off downwind, and is gone in its life; a blow
   *  under its power leaves none. */
  dust(T) {
    const w = T.build('ring', 'all');
    const A = w.life.aftermath;
    w.place(0, 12);
    w.step(2);
    w.world.impact(-3, 0, 3, 1.0, { kind: 'blunt', by: 'boss' });
    T.assert(A.hazes === 0, 'a heavy blow (power 1.0): no haze');
    w.world.impact(-3, 0, 3, 1.6, { kind: 'blunt', by: 'boss' });
    T.assert(A.hazes === 1, 'a big blow (power 1.6): a haze over the crater');
    const h = A.haze.find((o) => o.on);
    const p = { x: 0, z: 0, k: 0 };
    let wx = 0, wz = 0, top = 0;
    for (let i = 0; i < 20; i++) {
      w.step(0.25);
      w.life.wind.at(h.x, h.z, p);
      wx += p.x;
      wz += p.z;
      for (const l of smokeLetters(A)) top = Math.max(top, l.y);
    }
    const mx = h.x + 3, mz = h.z, ml = Math.hypot(mx, mz), wl = Math.hypot(wx, wz);
    const cos = (mx * wx + mz * wz) / Math.max(1e-6, ml * wl);
    T.assert(A._b.count > 30 && top < 1.5, `it hangs low: ${A._b.count} letters, none above ${top.toFixed(2)} m`);
    T.assert(ml > 0.3 && cos > 0.85, `it drifts downwind: ${ml.toFixed(2)} m in 5 s, ${((Math.acos(Math.min(1, cos)) * 180) / Math.PI).toFixed(0)} deg off the wind`);
    w.step(7);
    T.assert(A.hazes === 0 && A._b.count === 0, `gone within its life (${A.hazes} hazes, ${A._b.count} letters at 12 s)`);
  },

  /** The Grove: no wind: smoke rises straight, the haze stays over its crater. */
  grove(T) {
    const w = T.build('grove', 'all');
    const A = w.life.aftermath;
    w.place(6, 10);
    w.step(1);
    w.world.scorch.burnCircle(-3, 2, 1.5, 0.6, 0);
    A.ignite(-3, 2, 1.5, 1);
    A.sources[0].last = -1e9;
    w.step(6);
    let mx = 0, mz = 0, k = 0;
    for (const l of smokeLetters(A)) {
      mx += l.x + 3;
      mz += l.z - 2;
      k++;
    }
    T.assert(A.smoking === 1 && k > 10 && Math.hypot(mx / k, mz / k) < 0.2, `the column stands straight (${k} letters, ${Math.hypot(mx / (k || 1), mz / (k || 1)).toFixed(2)} m off its foot on average)`);
  },

  /** It lingers after a victory (the quiet after); the reset empties it; the piece off: nothing. */
  clear(T) {
    const w = T.build('cinderwood', 'all', { state: 'boss' });
    const A = w.life.aftermath;
    w.place(6, 18);
    w.step(1);
    w.world.scorch.burnCircle(-3, 2, 1.5, 0.6, 0);
    A.ignite(-3, 2, 1.5, 1);
    A.sources[0].last = -1e9;
    w.world.impact(4, 4, 3, 1.8, { kind: 'blunt', by: 'boss' });
    w.step(3);
    w.game.state = 'victory';
    w.emit('game:victory', {});
    w.step(3);
    T.assert(A.smoking === 1 && A.hazes === 1 && A.count > 0, `after a victory the smoke and the haze are still there (${A.count} letters)`);
    w.life.clear('reset');
    w.step(1 / 60);
    T.assert(A.smoking === 0 && A.hazes === 0 && A.count === 0, `clear('reset') empties both (${A.count})`);
    const o = T.build('cinderwood', 'wind,litter');
    o.world.ignite(-3, 2, 1.5, 1);
    o.world.impact(4, 4, 3, 1.8, { kind: 'blunt', by: 'boss' });
    o.step(5);
    T.assert(o.life.aftermath.sources.every((s) => !s.on) && o.life.aftermath._b === undefined, 'the piece off: no smoke, no haze, no batch');
  },
};
