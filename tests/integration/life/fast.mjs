// The living world's fast path (`?lifeFast=`, LIFE.fast; src/world/life/ship.js, the wake's and the step
// flash's circles): it changes how the letters reach the GPU and where two ground shaders may stop early,
// never what is drawn.
//   - same: the same build stepped fast and today's way holds the same letters (counts, places, colours)
//   - ranges: fast, a batch hands over only its first n instances (one range per attribute) and an empty one
//     leaves the frame (layer mask 0); today's way: whole arrays, the mask as built
//   - bounds: the step flash's circle holds every print's oval; the wake's circle holds every chunk's, and
//     outside it the CPU copy of trailBend bends nothing; today's way writes w 0 (no circle)
//   - off: with the living world off nothing of it is written (the steps' circle stays 0)

/** Every own pool's drawn instances as numbers (its first `count`), in the registration order. */
function snapshot(w) {
  const out = [];
  for (const p of w.own.slice(w.ownBase)) {
    const geo = p.geometry ?? p.mesh?.geometry;
    const n = geo?.instanceCount ?? 0;
    const rec = { n, a: [] };
    for (const k of ['iPos', 'iData', 'iColor']) {
      const A = geo?.attributes?.[k];
      if (!A) continue;
      rec.a.push(Array.from(A.array.subarray(0, n * A.itemSize)));
    }
    out.push(rec);
  }
  return out;
}

export default {
  async same(T) {
    for (const id of ['cinderwood', 'ash', 'fox', 'grove', 'code']) {
      const run = (fast) => {
        T.LIFE.fast = fast;
        const w = T.build(id, 'all', { feet: true });
        w.walk(2.5, -3);
        w.step(6);
        w.walk(-3, 1);
        w.step(4);
        w.world.gust(w.game.player.position.x + 3, w.game.player.position.z, 1.6, 20);
        w.step(4);
        return { s: snapshot(w), c: w.counts() };
      };
      try {
        const A = run(false), B = run(true);
        T.assert(A.s.length === B.s.length, `${id}: the same pools fast and today (${B.s.length} / ${A.s.length})`);
        let ninst = 0, worst = 0, counts = true;
        for (let i = 0; i < Math.min(A.s.length, B.s.length); i++) {
          if (A.s[i].n !== B.s[i].n) counts = false;
          ninst += B.s[i].n;
          for (let j = 0; j < A.s[i].a.length; j++) {
            const a = A.s[i].a[j], b = B.s[i].a[j] ?? [];
            if (a.length !== b.length) { worst = Infinity; continue; }
            for (let k = 0; k < a.length; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]));
          }
        }
        T.assert(counts && ninst > 0, `${id}: the same letters in every batch fast and today (${ninst} drawn)`);
        T.assert(worst <= 1e-9, `${id}: at the same places, in the same colours (worst difference ${worst})`);
        T.assert(A.c.litter === B.c.litter && A.c.own === B.c.own && A.c.random === 0 && B.c.random === 0, `${id}: the same counts, no Math.random (own ${B.c.own} / ${A.c.own})`);
      } finally {
        T.LIFE.fast = true;
      }
    }
  },

  async ranges(T) {
    for (const fast of [true, false]) {
      T.LIFE.fast = fast;
      try {
        const w = T.build('cinderwood', 'all', { feet: true });
        w.walk(2, -2);
        w.step(5);
        let full = 0, empty = 0, ok = true, why = '';
        for (const p of w.own.slice(w.ownBase)) {
          const mesh = p.mesh, geo = p.geometry ?? mesh?.geometry, n = geo?.instanceCount ?? 0;
          const mask0 = mesh.userData.__lifeMask ?? 1;
          for (const k of ['iPos', 'iData', 'iColor']) {
            const A = geo.attributes[k];
            if (!A) continue;
            const R = A.updateRanges;
            if (fast && n > 0 && !(R.length === 1 && R[0].start === 0 && R[0].count === n * A.itemSize)) { ok = false; why = `${k}: ${JSON.stringify(R)} for ${n}`; }
            if (!fast && R.length !== 0) { ok = false; why = `${k}: a range today (${JSON.stringify(R)})`; }
          }
          if (fast && n === 0 && mesh.layers.mask !== 0) { ok = false; why = 'an empty batch still in the frame'; }
          if (fast && n > 0 && mesh.layers.mask !== mask0) { ok = false; why = 'a batch with letters out of the frame'; }
          if (!fast && mesh.layers.mask !== mask0) { ok = false; why = 'today: a mask changed'; }
          if (n > 0) full++;
          else empty++;
        }
        T.assert(ok && full > 0, `${fast ? 'fast' : 'today'}: ${fast ? 'only the first n instances go, an empty batch leaves the frame' : 'whole arrays, the masks as built'} (${full} drawing, ${empty} empty)${why ? ' ' + why : ''}`);
        // and the fast path left the frame no allocation to make: one kept range record per attribute
        if (fast) {
          const p = w.own.slice(w.ownBase).find((q) => (q.geometry ?? q.mesh?.geometry)?.instanceCount > 0);
          const A = (p.geometry ?? p.mesh.geometry).attributes.iPos, r0 = A.updateRanges[0];
          w.step(1 / 60);
          T.assert(A.updateRanges[0] === r0, 'fast: the range record is kept frame to frame (no allocation)');
        }
      } finally {
        T.LIFE.fast = true;
      }
    }
    // an empty frame of a batch: out of the frame; one letter: back, one instance's range
    {
      T.LIFE.fast = true;
      const w = T.build('cinderwood', 'all');
      w.step(4);
      const b = w.life.wind._wb;
      const mask0 = b.mesh.layers.mask;
      b.begin();
      b.end();
      const out = b.mesh.layers.mask === 0 && b.count === 0;
      b.begin();
      b.put(0, 1, 0, 0, 1, 0, [0.5, 0.5, 0.5], 0.5);
      b.end();
      const R = b.iPos.updateRanges;
      T.assert(out && b.mesh.layers.mask === (b.mesh.userData.__lifeMask ?? 1) && R.length === 1 && R[0].count === 3, `fast: an empty batch leaves the frame (mask ${mask0} -> 0), one letter brings it back with one instance's range`);
      b.empty();
      T.assert(b.mesh.layers.mask === 0, 'fast: empty() takes it out of the frame');
    }
    // switched off live: the next frame is today's again (whole arrays, every mask back)
    T.LIFE.fast = true;
    const w = T.build('cinderwood', 'all', { feet: true });
    w.step(4);
    T.LIFE.fast = false;
    w.step(1 / 60);
    const back = w.own.slice(w.ownBase).every((p) => p.mesh.layers.mask === (p.mesh.userData.__lifeMask ?? p.mesh.layers.mask) && ((p.geometry ?? p.mesh.geometry).instanceCount === 0 || p.mesh.layers.mask !== 0));
    T.assert(back, 'fast switched off live: every batch with letters back in the frame');
    T.LIFE.fast = true;
  },

  async bounds(T) {
    const { DP_STEP_U, DP_STEPS } = await T.imp('src/render/dragonStep.js');
    const { STEPS } = await T.imp('src/world/life/stepsTuning.js');
    // the step flash: the floor must print it (the dragon ground's look b): the test's stand-in says so
    const w = T.build('grove', 'all', { feet: true });
    w.world.ground = { userData: { look: 'b' } };
    let seen = 0, ok = true, worst = Infinity;
    const half = Math.max(STEPS.flash.cells[0], STEPS.flash.cells[1]) / 2;
    w.walk(3, -1);
    for (let f = 0; f < 240; f++) {
      w.step(1 / 60);
      const B = DP_STEP_U.uDpStepB.value, K = DP_STEP_U.uDpStepK.value;
      if (K.w < 0.5) continue;
      seen++;
      if (B.w !== 1) ok = false;
      for (let i = 0; i < DP_STEPS; i++) {
        const S = DP_STEP_U.uDpSteps.value[i];
        if (S.z < 0) continue;
        worst = Math.min(worst, B.z - (Math.hypot(S.x - B.x, S.y - B.y) + half));
      }
    }
    T.assert(seen > 30 && ok && worst >= 0, `the step flash's circle holds every print's oval (${seen} frames with prints, least room ${worst.toFixed(3)} m)`);
    T.LIFE.fast = false;
    w.step(1 / 60);
    T.assert(DP_STEP_U.uDpStepB.value.w === 0, "today's way: no step circle (w 0)");
    T.LIFE.fast = true;

    // the wake: GrassTrail on its own, as world.js drives it
    const { createSharedUniforms, TRAIL_CH } = await T.imp('src/render/shaderLib.js');
    const { GrassTrail } = await T.imp('src/world/grassTrail.js');
    const LS = await T.imp('src/entities/enemies/duelist/lookSwitch.js');
    LS.setLook('bend', 'a');
    try {
      const U = createSharedUniforms();
      const tr = new GrassTrail(U);
      const P = U.uPushers.value[0];
      const o = { x: 0, z: 0, drop: 0, dark: 0, k: 0 };
      let holds = true, outside = 0, bent = 0, frames = 0;
      for (let f = 0; f < 420; f++) {
        const t = f / 60;
        P.set(-8 + t * 5, 0, Math.sin(t * 1.3) * 3, 0.8);
        tr.update(1 / 60, P);
        const A = U.uTrailAll.value;
        if (U.uBend.value.x < 0.5) continue;
        frames++;
        for (let c = 0; c < TRAIL_CH; c++) {
          const C = U.uTrailBox.value[c];
          if (C.z > 0 && Math.hypot(C.x - A.x, C.y - A.y) + C.z > A.z) holds = false;
        }
        // points just outside the circle: nothing bends there
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2, r = A.z + 0.01 + (k % 3) * 0.4;
          tr.bendAt(A.x + Math.cos(a) * r, A.y + Math.sin(a) * r, 0.37, o);
          outside++;
          if (o.k !== 0 || o.x !== 0 || o.z !== 0) bent++;
        }
      }
      T.assert(frames > 100 && holds && U.uTrailAll.value.w === 1, `the wake's circle holds every chunk's circle (${frames} frames)`);
      T.assert(bent === 0, `outside the wake's circle nothing is bent (${bent} of ${outside} points)`);
      T.LIFE.fast = false;
      tr.update(1 / 60, P);
      T.assert(U.uTrailAll.value.w === 0, "today's way: no wake circle (w 0)");
    } finally {
      T.LIFE.fast = true;
      LS.setLook('bend', null);
    }
  },

  async off(T) {
    const { DP_STEP_U } = await T.imp('src/render/dragonStep.js');
    DP_STEP_U.uDpStepB.value.set(0, 0, 0, 0);
    for (const id of ['cinderwood', 'grove']) {
      const w = T.build(id, 'off');
      w.world.ground = { userData: { look: 'b' } };
      w.walk(3, -1);
      w.step(4);
      const B = DP_STEP_U.uDpStepB.value;
      T.assert(w.own.length - w.ownBase === 0 && B.x === 0 && B.y === 0 && B.z === 0 && B.w === 0, `${id}: life off: no batch, the step circle never written`);
    }
  },
};
