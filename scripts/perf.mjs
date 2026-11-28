// `npm run perf`: what a frame costs, on THIS machine's real GPU (ADR-206). Starts the dev server and a
// headless Chrome / Edge, stages the same fight on each level (a fixed seed, the hero 5 m from the boss),
// and prints per level: the draw calls and triangles by pass, the GPU ms by pass at 1080p, at the phone's
// 2556 x 1179 and (--4k) at 3840 x 2160, and the script ms of a frame by module. Nothing is installed.
//
//   npm run perf                      Cinderwood, Ashfall and Halcyon Plaza
//   npm run perf -- --all             every level
//   npm run perf -- --levels ash,city one or more (ids or aliases)
//   npm run perf -- --4k              also 3840 x 2160
//   npm run perf -- --black           with a black blow's blackout pinned full on (?black=a, ADR-271): its cost
//   npm run perf -- --save            keep this run as this machine's baseline (.perf/baseline.json, not committed)
//   npm run perf -- --check           exit 1 when a level draws over 10 % more calls or triangles than the baseline
//
// Run it before and after a change that draws something (a look, an effect, a level): the baseline is a
// machine's own, since the milliseconds depend on the GPU; the triangle and draw-call counts do not
// (tests/integration/cost.mjs holds those in `npm test`; a fast GPU's 1 - 2 ms frame moves up to ~30 % between
// two runs of the same tree, so the milliseconds are read as sizes, not gated). The GPU timer is EXT_disjoint_timer_query_webgl2:
// a browser without it prints no GPU ms. Headless Chrome / Edge on a PC with a GPU; set PERF_BROWSER to
// the browser's path when it is not found.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valueOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const LEVELS = ['cinderwood', 'ash', 'starless', 'ring', 'fox', 'grove', 'code', 'city'];
const wanted = flag('--all') ? LEVELS : (valueOf('--levels') ?? 'cinderwood,ash,city').split(',');
const SIZES = [[1920, 1080], [2556, 1179]];
if (flag('--4k')) SIZES.push([3840, 2160]);
const BASE = join(ROOT, '.perf', 'baseline.json');

const BROWSERS = [
  process.env.PERF_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
].filter(Boolean);
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.error('perf: no Chrome or Edge found; set PERF_BROWSER to its path');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const profile = mkdtempSync(join(tmpdir(), 'gcd-perf-'));
const cleanup = () => {
  for (const p of procs) try { p.kill(); } catch { /* gone */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* in use: the OS tmp is cleaned */ }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

const WEB = 5300 + Math.floor(Math.random() * 400);
const CDP = WEB + 500;
procs.push(spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs')], { env: { ...process.env, PORT: String(WEB) }, stdio: 'ignore' }));
procs.push(spawn(browser, [
  '--headless=new', '--enable-gpu', '--ignore-gpu-blocklist', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-sync', '--force-device-scale-factor=1', '--window-size=1400,860', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' }));

async function page() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('perf: the browser did not open its debugging port');
}
const tab = await page();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++nextId; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalIn = async (expression, timeout = 170000) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout });
  const e = res.result?.exceptionDetails;
  if (e) throw new Error(e.exception?.description ?? e.text);
  return res.result?.result?.value;
};

const probe = readFileSync(join(ROOT, 'scripts', 'perf-probe.js'), 'utf8');
const results = {};
for (const lv of wanted) {
  process.stdout.write(`perf: ${lv} ...`);
  // autoq=0: the resolution is the probe's, not the controller's; the 1x ratio and the rest as the dev server serves
  await send('Page.navigate', { url: `http://localhost:${WEB}/?level=${lv}&autoq=0&fpscap=0` });
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) {
    await sleep(300);
    try { ready = await evalIn("!!(window.__game && window.__game.flow && window.__game.pipeline && typeof window.__tick === 'function')", 5000); } catch { /* navigating */ }
  }
  if (!ready) { console.log(' the game did not start'); continue; }
  await sleep(2500);
  try {
    results[lv] = await evalIn(`(${probe})(${JSON.stringify({ sizes: SIZES, frames: 300, black: flag('--black') })})`);
    console.log(' done');
  } catch (e) {
    console.log(` failed: ${String(e.message).split('\n')[0]}`);
  }
}
ws.close();
cleanup();

// ---- the report
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '-' : v.toFixed(d));
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;
// counts repeat exactly (shown from 3 %); milliseconds do not (two runs of the same tree differ by up to
// ~30 % on a fast GPU, whose frame is 1 - 2 ms), so they show from 25 % and gate nothing
const delta = (now, then, from = 0.03) => {
  if (!then || !now) return '';
  const d = (now - then) / then;
  return Math.abs(d) < from ? '' : ` (${d > 0 ? '+' : ''}${Math.round(d * 100)}%)`;
};
const MS = 0.25;
let regress = 0;
console.log(`\nbrowser: ${browser}\nGPU timer: ${Object.values(results).some((r) => r.timer) ? 'yes' : 'NO (no GPU ms below)'}${base ? `   baseline: ${base.when}` : '   no baseline yet (--save keeps this run)'}\n`);
for (const [lv, r] of Object.entries(results)) {
  const b = base?.results?.[lv];
  console.log(`== ${lv}  (${r.fight.state}${r.fight.alive ? "" : ", hero down"})`);
  if (b && (r.draw.tris > b.draw.tris * 1.1 || r.draw.calls > b.draw.calls * 1.1)) regress++;
  console.log(`   draws   ${r.draw.calls} calls${delta(r.draw.calls, b?.draw.calls)}, ${Math.round(r.draw.tris / 1000)}k triangles${delta(r.draw.tris, b?.draw.tris)}   ` + Object.entries(r.draw.passes).map(([k, v]) => `${k} ${v.calls}/${Math.round(v.tris / 1000)}k`).join('  '));
  for (const [sz, g] of Object.entries(r.gpu)) {
    const bg = b?.gpu?.[sz];
    const f = g.frame, bf = bg?.frame;
    console.log(`   GPU ${sz.padEnd(9)} frame ${fmt(f, 2)} ms${delta(f, bf, MS)}` + (g.passes ? `   passes: ${Object.entries(g.passes).filter(([k]) => k !== 'total').map(([k, v]) => `${k} ${fmt(v, 2)}`).join('  ')}` : ''));
  }
  const top = Object.entries(r.cpu.modules).slice(0, 5).map(([k, v]) => `${k} ${fmt(v, 2)}`).join('  ');
  console.log(`   script  frame ${fmt(r.cpu.frame.mean, 2)} ms (p95 ${fmt(r.cpu.frame.p95, 2)}, worst ${fmt(r.cpu.frame.max, 1)})${delta(r.cpu.frame.mean, b?.cpu.frame.mean, MS)}   ${top}`);
}
console.log('\n60 fps is 16.7 ms: GPU frame + script frame must both stay under it on the device; this machine is not that device.');
if (flag('--save')) {
  mkdirSync(dirname(BASE), { recursive: true });
  writeFileSync(BASE, JSON.stringify({ when: new Date().toISOString().slice(0, 16).replace('T', ' '), browser, results: { ...(base?.results ?? {}), ...results } }, null, 1) + '\n');
  console.log(`saved ${BASE}`);
}
if (flag('--check') && regress) {
  console.log(`perf: ${regress} level(s) draw over 10 % more calls or triangles than the baseline`);
  process.exit(1);
}
process.exit(0);
