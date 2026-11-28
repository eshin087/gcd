// The probe `npm run perf` (scripts/perf.mjs) runs inside the game's page: a fight staged at a fixed
// place, then what one frame costs. One async function; scripts/perf.mjs evaluates `(<this file>)(opts)`.
//   opts: { sizes: [[w, h], ...], frames, black }
// Returns: { level, fight, draw, cpu, gpu: { '<w>x<h>': { passes, frame } }, timer }
async (opts) => {
  const g = window.__game;
  const T = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      g.flow.resume?.();
      window.__tick(dt, 1);
    }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // the same seed every run, so the same fight is staged
  let seed = 12345;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.requestAnimationFrame = () => 0; // frozen: only this probe renders
  if (g.gamepad) g.gamepad.update = () => {};
  const size = (w, h) => {
    g.pipeline.setSize(w, h, 1);
    g.camera.aspect = w / h;
    g.camera.updateProjectionMatrix();
  };
  const stats = (a) => {
    const s = Float64Array.from(a).sort();
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(3), p95: +q(0.95).toFixed(3), max: +s[s.length - 1].toFixed(3) };
  };

  // ---- stage the fight: boss AI on, the hero unkillable and standing 5 m from the boss
  const [W0, H0] = opts.sizes[0];
  size(W0, H0);
  g.input.mouse.ndcX = 0;
  g.input.mouse.ndcY = 0.35;
  g.flow.debug.toState('boss');
  T(150);
  if (g.player.debug) g.player.debug.god = true;
  const b = g.boss?.position ?? g.dragon.position;
  g.player.debug.teleport?.(b.x + 5, b.z);
  T(30);
  // (--black: the blackout pinned full on, combat/blackout.js: what the grade's actor mask costs every frame)
  if (opts.black && g.blackout) {
    (await import('/src/combat/blackout.js')).setBlack('a');
    g.blackout.step = () => (g.blackout.k = 1);
    T(2);
  }

  // ---- script cost: the CPU ms of a frame by module, over `frames` ticks of the live fight
  const cur = {};
  const rows = {};
  const undo = [];
  const wrap = (obj, key, name) => {
    const f = obj?.[key];
    if (typeof f !== 'function') return;
    obj[key] = function (...a) {
      const t = performance.now();
      try {
        return f.apply(this, a);
      } finally {
        cur[name] = (cur[name] ?? 0) + performance.now() - t;
      }
    };
    undo.push(() => (obj[key] = f));
  };
  const w = g.world;
  for (const [o, k, n] of [
    [g.flow, 'update', 'flow'], [g.player, 'update', 'player'], [g.boss ?? g.dragon, 'update', 'boss'],
    [w, 'update', 'world'], [w?.destructibles, 'update', 'world.destructibles'], [w?.fire, 'update', 'world.fire'],
    [w?.scars, 'update', 'world.scars'], [w?.life, 'update', 'world.life'], [w?.atmosphere, 'update', 'world.atmosphere'],
    [g.lights, 'update', 'lights'], [g.fx?.alpha, 'update', 'fx'], [g.fx?.add, 'update', 'fx'], [g.fx?.fire, 'update', 'fx'],
    [g.hud, 'update', 'hud'], [g.audio, 'update', 'audio'], [g.cameraRig, 'update', 'camera'],
    [g.pipeline, 'render', 'render (script)'],
  ]) wrap(o, k, n);
  const total = [];
  const frames = opts.frames ?? 300;
  try {
    for (let i = 0; i < frames; i++) {
      for (const k in cur) cur[k] = 0;
      if (i % 40 === 0) g.player._buffer?.('light');
      if (i % 240 === 120) g.player.debug.teleport?.(b.x + 5, b.z);
      g.flow.resume?.();
      const t0 = performance.now();
      window.__tick(1 / 60, 1);
      total.push(performance.now() - t0);
      for (const k in cur) (rows[k] ??= []).push(cur[k]);
    }
  } finally {
    for (let i = undo.length - 1; i >= 0; i--) undo[i]();
  }
  const modules = {};
  for (const k of Object.keys(rows).sort((a, c) => stats(rows[c]).mean - stats(rows[a]).mean)) modules[k] = stats(rows[k]).mean;

  // ---- what a frame draws, by pass (after the frame has settled: the still shadow map takes its casters after ~20
  // frames, and the GPU ramps its clock up; a frozen scene is rendered, so the frames are the same)
  const r = g.renderer, info = r.info, P = g.pipeline;
  for (let i = 0; i < 40; i++) P.render();
  const names = new Map([[P.shadowRT, 'shadow'], [P.sceneRT, 'scene'], [P.seenRT, 'seen'], [P.compRT, 'comp'], [P.brightRT, 'bloom'], [null, 'final']]);
  for (const bl of P.blur ?? []) names.set(bl, 'bloom');
  if (P.fire?.heatRT) names.set(P.fire.heatRT, 'fire');
  if (P.fire?.flameRT) names.set(P.fire.flameRT, 'fire');
  const label = (obj) => {
    let n = names.get(r.getRenderTarget()) ?? 'other';
    if (n === 'comp') n = obj === g.fxScene ? 'fx' : 'ascii';
    else if (n === 'scene' && obj !== g.scene) n = 'seen';
    return n;
  };
  const draw = {};
  {
    const orig = r.render;
    info.autoReset = false;
    r.render = function (obj, cam) {
      info.reset();
      orig.call(this, obj, cam);
      const o = (draw[label(obj)] ??= { calls: 0, tris: 0 });
      o.calls += info.render.calls;
      o.tris += info.render.triangles;
    };
    try {
      P.render();
    } finally {
      r.render = orig;
      info.autoReset = true;
    }
  }
  let calls = 0, tris = 0;
  for (const k in draw) {
    calls += draw[k].calls;
    tris += draw[k].tris;
  }

  // ---- the GPU's ms by pass (EXT_disjoint_timer_query_webgl2) and the whole frame, at each size
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpuPasses = async (n) => {
    if (!ext) return null;
    const orig = r.render;
    const pend = [];
    r.render = function (obj, cam) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      try {
        orig.call(this, obj, cam);
      } finally {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
      }
      pend.push([label(obj), q]);
    };
    const per = {};
    let got = 0;
    try {
      for (let i = 0; i < 4; i++) P.render();
      for (const [, q] of pend) gl.deleteQuery(q);
      pend.length = 0;
      for (let f = 0; f < n; f++) {
        P.render();
        gl.flush();
        for (let tries = 0; pend.length && tries < 200; tries++) {
          await sleep(0);
          if (!gl.getQueryParameter(pend[pend.length - 1][1], gl.QUERY_RESULT_AVAILABLE)) continue;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            const f = {};
            for (const [k, q] of pend) f[k] = (f[k] ?? 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
            for (const k in f) (per[k] ??= []).push(f[k]);
            got++;
          }
          for (const [, q] of pend) gl.deleteQuery(q);
          pend.length = 0;
        }
      }
    } finally {
      r.render = orig;
    }
    const out = {};
    let t = 0;
    for (const k in per) {
      const a = per[k].sort((x, y) => x - y);
      out[k] = +a[a.length >> 1].toFixed(3);
      t += a[a.length >> 1];
    }
    out.total = +t.toFixed(3);
    return got ? out : null;
  };
  const gpuFrame = () => {
    const px = new Uint8Array(4);
    const one = () => {
      for (let i = 0; i < 8; i++) P.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    };
    for (let i = 0; i < 6; i++) one();
    const meds = [];
    for (let rep = 0; rep < 3; rep++) {
      const a = [];
      for (let i = 0; i < 15; i++) {
        const t0 = performance.now();
        one();
        a.push((performance.now() - t0) / 8);
      }
      a.sort((x, y) => x - y);
      meds.push(a[a.length >> 1]);
    }
    return +Math.min(...meds).toFixed(3); // the quietest of three: the GPU's clock and the OS only ever add time
  };
  const gpu = {};
  for (const [sw, sh] of opts.sizes) {
    size(sw, sh);
    T(2);
    for (let i = 0; i < 40; i++) P.render();
    gpu[`${sw}x${sh}`] = { passes: await gpuPasses(16), frame: gpuFrame() };
  }
  return {
    level: g.levelId ?? g.level?.id ?? g.world?.level?.id,
    fight: { state: g.state, alive: g.player.alive },
    draw: { calls, tris, passes: draw },
    cpu: { frame: stats(total), modules },
    gpu,
    timer: !!ext,
  };
}
