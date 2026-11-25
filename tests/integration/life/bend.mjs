// The grass's wake (world/grassTrail.js, `?bend=a|b|c`; `?bend=0` today's trodden trail): the trail on its
// own with the shared uniforms, driven as world.js drives it (once a frame, from the hero's pusher), read
// back through bendAt (the CPU copy of the grass shader's trailBend). Run from steps.mjs (`steps.wake`).
//   - blades bend AWAY from the path: along the way he went, out to each side
//   - they spring back within the option's time; a bent blade is never darker than its limit (<= 0.12),
//     and nothing pops: a blade's bend changes a little a frame, and across the path it is smooth (no cells)
//   - `?bend=0` writes nothing (uBend.x 0): the grass as before
//   - no Math.random, no NaN, at most TRAIL_N points through a long run with turns, jumps and the air

/** s after he passes by which every blade of the option stands (|bend| < 0.03) and has mostly risen (k < 0.1). */
const BY = { a: { up: 1.0, still: 1.6 }, b: { up: 2.6, still: 3.6 }, c: { up: 2.0, still: 3.0 } };

export default async function wake(T) {
  const { createSharedUniforms, TRAIL_N } = await T.imp('src/render/shaderLib.js');
  const { GrassTrail, bendLook } = await T.imp('src/world/grassTrail.js');
  const { GRASS } = await T.imp('src/world/grassTuning.js');
  const LS = await T.imp('src/entities/enemies/duelist/lookSwitch.js');
  const dt = 1 / 60;

  /** He runs east along z = 0 at `v` m/s from x = -8 to x = 4 and stops; fn(t since he passed x = 0, trail). */
  const run = (look, fn, v = 6, secs = 7) => {
    LS.setLook('bend', look);
    try {
      const U = createSharedUniforms();
      const tr = new GrassTrail(U);
      const P = U.uPushers.value[0];
      let x = -8, t = 0, tp = null;
      for (let f = 0; f < secs / dt; f++) {
        if (x < 4) x += v * dt;
        P.set(x, 0, 0, 0.8);
        tr.update(dt, P);
        t += dt;
        if (tp === null && x >= 0) tp = t;
        fn(tp === null ? -1 : t - tp, tr, U);
      }
      return { tr, U };
    } finally {
      LS.setLook('bend', null);
    }
  };

  T.assert(bendLook() === GRASS.bend.look && GRASS.bend.look !== '0', `the default is the wake, option ${bendLook()}`);
  const o = {};
  for (const look of ['a', 'b', 'c']) {
    const opt = GRASS.bend.options[look];
    // blades at the path, a hand off it each side, and nearly at the rim
    const P = [[0, 0], [0, 0.35], [0, -0.35], [0, 0.6], [0, -0.6]];
    const prev = P.map(() => ({ x: 0, z: 0, dark: 0 }));
    let peak = 0, along = 0, outward = 0, inward = 0, seen = 0, darkMax = 0, jump = 0, darkJump = 0, lateUp = 0, lateStill = 0;
    run(look, (t, tr) => {
      P.forEach(([px, pz], i) => {
        // (two hashes: the stagger's extremes)
        for (const h of [0.02, 0.98]) {
          const b = tr.bendAt(px, pz, h, o);
          if (![b.x, b.z, b.drop, b.dark, b.k].every(Number.isFinite)) throw new Error('NaN bend');
          if (h === 0.98) {
            jump = Math.max(jump, Math.hypot(b.x - prev[i].x, b.z - prev[i].z));
            darkJump = Math.max(darkJump, Math.abs(b.dark - prev[i].dark));
            prev[i].x = b.x; prev[i].z = b.z; prev[i].dark = b.dark;
          }
          darkMax = Math.max(darkMax, b.dark);
          if (i === 0) peak = Math.max(peak, b.k);
          if (b.k > 0.3 && t >= 0) {
            seen++;
            if (b.x > 0) along++;
            if (pz !== 0) {
              if (Math.sign(b.z) === Math.sign(pz)) outward++;
              else inward++;
            }
          }
          if (t >= BY[look].up) lateUp = Math.max(lateUp, b.k);
          if (t >= BY[look].still) lateStill = Math.max(lateStill, Math.hypot(b.x, b.z));
        }
      });
    });
    T.assert(peak > 0.8, `bend ${look}: a blade at his path is bent down fully as he passes (k ${peak.toFixed(2)})`);
    T.assert(seen > 20 && along === seen, `bend ${look}: every bent blade leans along the way he went (${along} of ${seen})`);
    T.assert(outward > 0 && inward === 0, `bend ${look}: off the path they lean out, away from it (${outward} out, ${inward} in)`);
    T.assert(lateUp < 0.1 && lateStill < 0.03, `bend ${look}: risen by ${BY[look].up} s (k ${lateUp.toFixed(3)}) and still by ${BY[look].still} s (bend ${lateStill.toFixed(3)})`);
    T.assert(darkMax <= opt.dark + 1e-9 && opt.dark <= 0.12, `bend ${look}: a bent blade is at most ${opt.dark} darker (${darkMax.toFixed(3)}), never a dark trail`);
    T.assert(jump < 0.3 && darkJump < 0.03, `bend ${look}: nothing pops (a blade's bend moves at most ${jump.toFixed(3)} heights a frame, its shade ${darkJump.toFixed(4)})`);
    // across the path, 0.4 s after he passed: smooth, no cells (the scorch map's were 0.625 m)
    let rough = 0, maxK = 0, row = [];
    run(look, (t, tr) => {
      if (t < 0.4 || row.length) return;
      for (let z = -1.2; z <= 1.2001; z += 0.05) row.push(tr.bendAt(0.3, z, 0.5, o).k);
    });
    for (let i = 1; i < row.length; i++) rough = Math.max(rough, Math.abs(row[i] - row[i - 1]));
    for (const k of row) maxK = Math.max(maxK, k);
    T.assert(maxK > 0.2 && rough < 0.12, `bend ${look}: across the path the bend is smooth (largest step ${rough.toFixed(3)} per 5 cm, peak ${maxK.toFixed(2)})`);
  }

  // `?bend=0`: nothing is written (uBend.x 0, no boxes): the grass draws exactly as before
  const z = run('0', () => {});
  const Bx = z.U.uTrailBox.value;
  T.assert(z.U.uBend.value.x === 0 && z.tr.count === 0 && Bx.every((v) => v.z === 0) && z.tr.bendAt(0, 0, 0.5, o).k === 0, 'bend 0: no wake (uBend.x 0, no points): today');

  // a long run with turns, a jump (teleport), the air and a landing: at most TRAIL_N points, all finite, no
  // Math.random; a reset leaves nothing bent
  LS.setLook('bend', 'b');
  let calls = 0;
  const R = Math.random;
  Math.random = () => { calls++; return R(); };
  try {
    const U = createSharedUniforms();
    const tr = new GrassTrail(U);
    const P = U.uPushers.value[0];
    let maxN = 0, bad = 0, airK = -1, landR = 0;
    for (let f = 0; f < 60 * 20; f++) {
      const t = f * dt;
      const a = t * 1.7;
      let x = Math.cos(a) * 4 + t * 0.5, zz = Math.sin(a * 1.3) * 3, y = 0;
      if (t > 8 && t < 8.02) { x += 20; } // a jump
      if (t > 12 && t < 12.8) y = 3; // in the air
      P.set(x, y, zz, 0.8);
      if (Math.abs(t - 12.8) < 1e-9 || (t > 12.8 && t < 12.82)) tr.press(x, zz, 1.2);
      tr.update(dt, P);
      maxN = Math.max(maxN, tr.count);
      for (const v of U.uTrail.value) if (![v.x, v.y, v.z, v.w].every(Number.isFinite)) bad++;
      if (t > 12.3 && t < 12.32) airK = tr.hr;
      if (t > 12.82 && t < 12.84) landR = tr.hr;
    }
    T.assert(maxN <= TRAIL_N && maxN >= 16 && bad === 0, `20 s of turns: at most ${TRAIL_N} points (${maxN}), all finite`);
    T.assert(airK === 0 && Math.abs(landR - 1.2) < 1e-9, `in the air the wake has no width (${airK}); a heavy landing widens it to 1.2 m (${landR})`);
    tr.clear();
    T.assert(tr.count === 0 && U.uBend.value.x === 0, 'a reset: nothing bent');
  } finally {
    Math.random = R;
    LS.setLook('bend', null);
  }
  T.assert(calls === 0, `the wake draws nothing from Math.random (${calls})`);

  // cheap: a frame's update (the CPU side) in microseconds
  {
    const U = createSharedUniforms();
    const tr = new GrassTrail(U);
    const P = U.uPushers.value[0];
    const t0 = performance.now();
    for (let f = 0; f < 6000; f++) {
      P.set(Math.cos(f * 0.03) * 5, 0, Math.sin(f * 0.02) * 5, 0.8);
      tr.update(dt, P);
    }
    const us = ((performance.now() - t0) / 6000) * 1000;
    T.assert(us < 50, `a frame's update costs ${us.toFixed(1)} µs`);
  }
}
