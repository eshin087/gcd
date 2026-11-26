// AUTO quality (ADR-200), headless: the REAL controller (render/autoQuality.js) fed frame-time traces
// from device models (a GPU whose time follows the pixel count, a slow CPU, a display that holds the
// frame rate down, a noisy GPU at the edge of a step), and the scale steps it takes out. Also the
// frame-rate cap's pacing, the URL switches, the labels and the F2 cycle (the REAL GameFlow method).
// usage: node autoq.mjs <repoRoot> [scenario]
//   scenario: ladder | bench | gpu | probe | cpu | held | spikes | calm | edge | pacer | switches | cycle | all
import { pathToFileURL } from 'node:url';
import './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const { CONFIG } = await imp('src/core/config.js');
const AQ = await imp('src/render/autoQuality.js');
const { AutoQuality, ladderFor, FramePacer, qualityLabel, fpsCapOn, autoFromSearch, capFromSearch, floorFromSearch } = AQ;
const { GameFlow } = await imp('src/game/flow.js');

const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => {
  if (!c) {
    fails++;
    out('FAIL', m);
  } else out('ok  ', m);
};
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// the controller's logic is tested on a ladder down to 0.75x; the game ships with the owner's 1x floor
const C = { ...CONFIG.autoQuality, floor: 0.75 };
const scales = (a) => a.steps.map((s) => s.scale).join(' ');

/** A device: per frame the GPU's ms at scale s (`gpu(s)`), the script's ms (`cpu`), the display's
 *  refresh (`hz`, vsync: a frame lasts a whole number of refreshes), `noise` (± share, seeded),
 *  `timer` (the GPU's time is readable), `calm(t)`, `spike(t)` (a frame of that many s instead).
 *  Runs `secs` s through `a` and returns the scale over time. */
function run(a, dev, secs, t0 = 0) {
  const rnd = mulberry32(dev.seed ?? 7);
  const R = 1000 / (dev.hz ?? 60);
  const trace = [];
  let t = t0;
  while (t < t0 + secs) {
    const n = 1 + (dev.noise ? (rnd() * 2 - 1) * dev.noise : 0);
    const gpu = dev.gpu(a.scale) * n;
    const cpu = (dev.cpu ?? 2) * n;
    let ms = Math.max(gpu, cpu, dev.floorMs ?? 0);
    ms = Math.ceil(ms / R - 1e-9) * R;
    const sp = dev.spike?.(t);
    const dt = sp ?? ms / 1000;
    t += dt;
    if (a.sample(dt, cpu, dev.timer ? gpu : null, dev.calm ? dev.calm(t) : true)) trace.push([+t.toFixed(1), a.scale]);
  }
  return trace;
}
/** A GPU of `mpMs` ms per megapixel plus a fixed `fixed` ms, on a `w` x `h` CSS screen. */
const gpuOf = (mpMs, fixed = 1, w = 1440, h = 900) => (s) => fixed + mpMs * (w * s * h * s) / 1e6;

const SCENARIOS = {};

SCENARIOS.ladder = () => {
  out('\n== the ladder for a screen');
  const st = C.steps;
  assert(ladderFor(st, 1, 0.75).map((s) => s.scale).join(' ') === '1 0.75', 'a 1x screen: 1 0.75');
  assert(ladderFor(st, 2, 0.75).map((s) => s.scale).join(' ') === '2 1.5 1.25 1 0.75', 'a 2x screen: 2 1.5 1.25 1 0.75');
  assert(ladderFor(st, 1.75, 0.75).map((s) => s.scale).join(' ') === '1.75 1.5 1.25 1 0.75', 'a 1.75x screen: the top step drawn at 1.75');
  assert(ladderFor(st, 1, 0.5).map((s) => s.scale).join(' ') === '1 0.75 0.5', 'floor 0.5: 0.5 is a step');
  assert(ladderFor(st, 1, 1).map((s) => s.scale).join(' ') === '1', 'floor 1 on a 1x screen: one step');
  assert(ladderFor(st, 0.6, 0.75).length === 1, 'a screen under the floor still has one step');
  const a = new AutoQuality(C, { cap: 2 });
  assert(a.scale === 2 && a.index === 0, 'starts at the top step');
  a.index = 2;
  a.setCap(1);
  assert(a.scale === 1 && scales(a) === '1 0.75', `moved to a 1x screen at 1.25x: the nearest step under it (${a.scale})`);
  assert(a.setCap(1) === false, 'the same ratio again changes nothing');
};

SCENARIOS.bench = () => {
  out('\n== the first guess');
  const a = new AutoQuality(C, { cap: 2 });
  assert(a.pick(3) === 0, 'a fast GPU (3 ms at 2x): stays at 2x');
  const b = new AutoQuality(C, { cap: 2 });
  b.pick(20); // 1.5x: 20 × (0.25 + 0.75 × 0.5625) = 13.4 ms > 11.7 (60 fps × 0.7); 1.25x: 10.9
  assert(b.scale === 1.25, `20 ms at 2x: the highest step predicted to fit is ${b.scale}x (1.25)`);
  const c = new AutoQuality(C, { cap: 2 });
  c.pick(200);
  assert(c.scale === 0.75, 'a hopeless GPU: the floor');
  const d = new AutoQuality(C, { cap: 2 });
  d.pick(NaN);
  assert(d.scale === 2, 'no reading: no change');
  for (let k = 0; k < 4; k++) assert(a.predict(10, 0, k + 1) < a.predict(10, 0, k), `predicted cost falls step by step (${a.steps[k].scale} → ${a.steps[k + 1].scale})`);
  assert(Math.abs(a.predict(10, 0, 0) - 10) < 1e-9, 'the same step predicts the reading');
};

SCENARIOS.gpu = () => {
  out('\n== a GPU-bound device settles at the highest step that holds 60 fps');
  for (const timer of [true, false]) {
    // 20 ms per megapixel: 2x (5.2 MP) 104 ms, 1.5x 59, 1.25x 41, 1x 27, 0.75x 16
    const dev = { gpu: gpuOf(11, 1), timer, cpu: 2 }; // 2x 58 ms, 1.5x 33, 1.25x 23, 1x 15.3, 0.75x 9
    const a = new AutoQuality(C, { cap: 2 });
    const tr = run(a, dev, 60);
    assert(a.scale === 1, `${timer ? 'timer' : 'no timer'}: 2x → ${tr.map((x) => x[1]).join(' → ')} (at 1x the frame is 15.3 ms)`);
    const at1 = tr.findIndex((x) => x[1] === 1);
    assert(at1 === 2 && tr[at1][0] < 15, `  1x reached in ${at1 + 1} steps down, at ${tr[at1]?.[0]} s`);
    // after that: with a timer nothing; without one only probes (an up and its way back), ever rarer
    const later = run(a, dev, 600, 60);
    const all = [...tr.slice(at1 + 1), ...later];
    assert(timer ? all.length === 0 : all.length <= 2 * (C.backoff.length + 1) && all.length % 2 === 0, `  then ${all.length} steps in 11 minutes (${all.map((x) => `${x[0]}s:${x[1]}`).join(' ')})`);
    assert(a.scale === 1, `  and still at ${a.scale}x`);
  }
};

SCENARIOS.probe = () => {
  out('\n== no GPU timer: a step up is a probe, a failed one waits longer each time');
  const dev = { gpu: gpuOf(11, 1), timer: false, cpu: 2 };
  const a = new AutoQuality(C, { cap: 2 });
  a.index = 3; // 1x, where it holds
  a.reset();
  const tr = run(a, dev, 900);
  const ups = tr.filter((x, i) => x[1] > (tr[i - 1]?.[1] ?? 1));
  assert(ups.length === C.backoff.length + 1, `${ups.length} probes up in 15 minutes (backoff ${C.backoff.join(', ')} s, then never)`);
  const gaps = ups.slice(1).map((u, i) => u[0] - ups[i][0]);
  assert(gaps.every((g, i) => g >= C.backoff[i]), `  further apart each time: ${gaps.map((g) => g.toFixed(0)).join(', ')} s`);
  assert(a.scale === 1, `  back at 1x after each (${a.scale})`);
  // a faster device: the probe holds
  const fast = { gpu: gpuOf(2, 1), timer: false, cpu: 2 };
  const b = new AutoQuality(C, { cap: 2 });
  b.index = 3;
  b.reset();
  const tb = run(b, fast, 60);
  assert(b.scale === 2, `a fast GPU at 1x climbs to 2x in ${tb.length} probes (${tb.map((x) => `${x[0]}s:${x[1]}`).join(' ')})`);
};

SCENARIOS.cpu = () => {
  out('\n== a CPU-bound device: the resolution is not the limit, nothing changes');
  for (const timer of [true, false]) {
    const dev = { gpu: gpuOf(1, 1), cpu: 30, timer };
    const a = new AutoQuality(C, { cap: 2 });
    const tr = run(a, dev, 120);
    assert(tr.length === 0 && a.scale === 2, `${timer ? 'timer' : 'no timer'}: script 30 ms a frame → ${tr.length} steps, ${a.scale}x`);
  }
};

SCENARIOS.held = () => {
  out('\n== the frame rate held down from outside (a 30 fps battery saver): two tries, undone, never again');
  // the script reports little and there is no timer: it looks GPU-bound, but no step helps (two in a
  // row are needed: the first may be hidden by vsync)
  const dev = { gpu: () => 4, cpu: 2, timer: false, floorMs: 33.3 };
  const a = new AutoQuality(C, { cap: 2 });
  const tr = run(a, dev, 300);
  assert(tr.length === 3 && tr[0][1] === 1.5 && tr[1][1] === 1.25 && tr[2][1] === 2, `steps: ${tr.map((x) => `${x[0]}s:${x[1]}`).join(' ')}`);
  assert(a.scale === 2 && a.lowest === 0, `back at 2x and no step down again (lowest ${a.lowest})`);
  assert(/did not help/.test(a.log[a.log.length - 1]?.why), `why: ${a.log[a.log.length - 1]?.why}`);
  const b = new AutoQuality(C, { cap: 2 });
  const tb = run(b, { ...dev, timer: true }, 300);
  assert(tb.length === 0 && b.scale === 2, `with a GPU timer (4 ms of a 33 ms frame): not the GPU, ${tb.length} steps`);
};

SCENARIOS.spikes = () => {
  out('\n== single long frames (a tab switch, a hitch) are not slowness');
  const dev = { gpu: gpuOf(2, 1), cpu: 2, timer: false, spike: (t) => (Math.floor(t) % 4 === 0 && t % 1 < 0.02 ? 0.4 : null) };
  const a = new AutoQuality(C, { cap: 2 });
  const tr = run(a, dev, 120);
  assert(tr.length === 0 && a.scale === 2, `a 400 ms frame every 4 s: ${tr.length} steps`);
  const b = new AutoQuality(C, { cap: 2 });
  const hitch = { gpu: gpuOf(2, 1), cpu: 2, timer: false, spike: (t) => (t % 3 < 0.02 ? 0.12 : null) };
  const tb = run(b, hitch, 120);
  assert(tb.length === 0, `a 120 ms hitch every 3 s: ${tb.length} steps`);
};

SCENARIOS.calm = () => {
  out('\n== no step up during a fight; a step down may come in one');
  const slowDev = { gpu: gpuOf(11, 1), timer: true, cpu: 2, calm: () => false };
  const a = new AutoQuality(C, { cap: 2 });
  run(a, slowDev, 30);
  assert(a.scale === 1, `slow in a fight: down to ${a.scale}x`);
  const fast = { gpu: gpuOf(2, 1), timer: true, cpu: 2, calm: () => false };
  const tr = run(a, fast, 120, 30);
  assert(tr.length === 0 && a.scale === 1, `fast again in a fight: stays at ${a.scale}x for 2 minutes`);
  const tr2 = run(a, { ...fast, calm: () => true }, 30, 150);
  assert(a.scale === 2, `the fight over: up to ${a.scale}x (${tr2.map((x) => `${x[0]}s:${x[1]}`).join(' ')})`);
};

SCENARIOS.edge = () => {
  out('\n== a noisy GPU at the edge of a step: no flicker');
  // 1.25x is 17.5 ms ± 15 % (55 - 66 fps on a 60 Hz screen with vsync it is 30 or 60); 1x is 11.6 ms
  for (const timer of [true, false]) {
    for (const seed of [1, 2, 3]) {
      const dev = { gpu: gpuOf(10, 0.5, 1440, 900), timer, cpu: 2, noise: 0.15, seed };
      const a = new AutoQuality(C, { cap: 2 });
      const tr = run(a, dev, 1200);
      const settled = tr.filter((x) => x[0] > 60);
      const limit = timer ? 0 : 2 * (C.backoff.length + 1);
      assert(settled.length <= limit, `${timer ? 'timer' : 'no timer'} seed ${seed}: settled at ${a.scale}x, ${settled.length} steps after the first minute in 20 (≤ ${limit})`);
    }
  }
};

SCENARIOS.pacer = () => {
  out('\n== the 60 fps cap: every n-th refresh, an even pace');
  const pace = (hz, on, n = 600) => {
    const p = new FramePacer(60);
    p.on = on;
    const R = 1000 / hz;
    const drawn = [];
    for (let i = 0; i < n; i++) if (p.tick(i * R)) drawn.push(i * R);
    const gaps = drawn.slice(60).map((t, i) => t - drawn[59 + i]);
    const steady = drawn.filter((t) => t >= 100 * R); // after the first refreshes have measured the screen
    return { fps: ((steady.length - 1) / (steady[steady.length - 1] - steady[0])) * 1000, even: Math.max(...gaps) - Math.min(...gaps) < 0.01, gap: gaps[0] };
  };
  for (const [hz, want] of [[60, 60], [90, 90], [120, 60], [144, 72], [165, 82.5], [240, 60]]) {
    const r = pace(hz, true);
    assert(Math.abs(r.fps - want) < 2 && r.even, `${hz} Hz capped: ${r.fps.toFixed(1)} fps, even (${r.gap.toFixed(2)} ms)`);
  }
  const off = pace(120, false);
  assert(Math.abs(off.fps - 120) < 1, `120 Hz uncapped: ${off.fps.toFixed(0)} fps`);
};

SCENARIOS.switches = () => {
  out('\n== the URL switches, the cap default and the labels');
  assert(autoFromSearch('') === C.on && autoFromSearch('?autoq=0') === false && autoFromSearch('?autoq=1') === true, '?autoq: default, 0, 1');
  assert(capFromSearch('') === null && capFromSearch('?fpscap=0') === false && capFromSearch('?fpscap=1') === true, '?fpscap: automatic, 0, 1');
  assert(CONFIG.autoQuality.floor === 1, 'the shipped floor is 1x (the owner picked it: fewer, bigger letters below)');
  assert(floorFromSearch('') === CONFIG.autoQuality.floor && floorFromSearch('?autoqFloor=0.5') === 0.5 && floorFromSearch('?autoqFloor=x') === CONFIG.autoQuality.floor, '?autoqFloor');
  const g = { settings: { fpsCap: null }, touch: { active: false } };
  assert(fpsCapOn(g) === false, 'desktop: no cap by default');
  g.touch.active = true;
  assert(fpsCapOn(g) === !!CONFIG.fpsCap.touch, 'touch: capped by default');
  g.settings.fpsCap = false;
  assert(fpsCapOn(g) === false, 'touch with the cap turned off: none');
  const a = new AutoQuality(C, { cap: 2 });
  a.index = 2;
  assert(qualityLabel({ autoQuality: true }, a, CONFIG.quality) === 'AUTO 1.25x', 'label: AUTO 1.25x');
  assert(qualityLabel({ autoQuality: false, quality: 0 }, a, CONFIG.quality) === 'LOW', 'label: LOW');
};

SCENARIOS.cycle = () => {
  out('\n== F2 / the pause menu: AUTO → LOW → MEDIUM → HIGH → AUTO');
  let applied = 0;
  const game = { settings: { quality: CONFIG.defaultQuality, autoQuality: true }, autoQ: new AutoQuality(C, { cap: 2 }), applyQuality: () => applied++ };
  const logs = [];
  const fake = { game, _try: (fn) => fn(), _log: (t) => logs.push(t) };
  const seen = [];
  for (let i = 0; i < 4; i++) {
    GameFlow.prototype.cycleQuality.call(fake);
    seen.push(game.settings.autoQuality ? 'AUTO' : CONFIG.quality[game.settings.quality].name);
  }
  assert(seen.join(' ') === 'LOW MEDIUM HIGH AUTO', `cycle: ${seen.join(' → ')}`);
  assert(applied === 4 && logs[3] === 'Quality: AUTO', `applied each time; "${logs.join('", "')}"`);
  const old = { game: { settings: { quality: 2 }, applyQuality() {} }, _try: (fn) => fn(), _log() {} };
  GameFlow.prototype.cycleQuality.call(old);
  assert(old.game.settings.quality === 0 && !old.game.settings.autoQuality, 'without a controller the presets cycle as before (HIGH → LOW)');
  const g2 = { settings: { fpsCap: null }, touch: { active: true } };
  GameFlow.prototype.toggleFpsCap.call({ game: g2, _log() {} });
  assert(g2.settings.fpsCap === !CONFIG.fpsCap.touch, 'the pause menu turns the touch cap off');
};

const WANT = SCEN === 'all' ? Object.keys(SCENARIOS) : SCEN.split(',');
for (const name of WANT) {
  if (!SCENARIOS[name]) {
    out(`unknown scenario '${name}' (${Object.keys(SCENARIOS).join(' | ')} | all)`);
    process.exit(2);
  }
  SCENARIOS[name]();
}
out(fails ? `\n${fails} FAILED` : '\nAUTOQ: ALL PASSED');
process.exit(fails ? 1 : 0);
