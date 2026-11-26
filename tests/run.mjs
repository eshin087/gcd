// Runs the whole test set (`npm test`): the headless integration suites and the static checks, side
// by side, one process each. They share nothing (no files written, no ports), so the wall time is the
// slowest task instead of the sum. The same checks run as before; none is dropped.
//
//   node tests/run.mjs [root] [--serial] [--jobs N] [--shard I/N] [--list]
//
// --shard I/N runs the I-th of N shares of the tasks (CI runs the N shares as parallel jobs, each on
// its own machine; ADR-153). The shares are dealt from each task's `est` (its seconds on a CI runner),
// longest first, each to the share with the least so far: every task lands in exactly one share, and a
// task added to TASKS is dealt by itself. --list prints the shares and runs nothing.
//
// Each task's output is held and printed whole when the task ends, so two suites never interleave.
// Exit code: 0 when every task passed, 1 otherwise. One suite on its own is still
// `node tests/integration/<suite>.mjs . <scenario>`.
//
// On the owner's machine (no CI env; ADR-205) the run is kept light so the PC stays usable while agents
// test: every worker runs at below-normal priority (a game or the browser gets the CPU first), and all
// runs on the machine share one pool of ABYSS_JOBS slots (default 8): two agents' `npm test` queue in
// it instead of starting 48 processes. --only <names> runs only the tasks whose name starts with one of
// the comma-separated names (`--only integ,life`). On CI none of this applies: it runs as before.
import { spawn } from 'node:child_process';
import { availableParallelism, constants, setPriority, tmpdir } from 'node:os';
import { mkdirSync, openSync, writeSync, closeSync, readFileSync, unlinkSync, rmdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const VALUED = new Set(['--jobs', '--shard', '--only']);
const root = resolve(args.find((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1])) ?? '.');

// integ's TIMING scenario (a grid of placements per wyrm attack) is about two thirds of that suite,
// so it runs beside the rest of integ, in TIMING_PARTS parts: integ.mjs takes every n-th attack of
// its own list (GCD_TM_SHARD), so an attack added there is covered without a change here.
const TIMING_PARTS = 3;
const INTEG = 'tests/integration/integ.mjs';
// The rest of integ is still the longest task, so these scenarios (the hero's model and the world:
// about half of it) run as a second process. `integ` runs `all` without them, so a new scenario
// lands there by itself, and it keeps the checks across scenarios (the event catalogue).
const INTEG_2 = ['hero', 'herolife', 'herolook', 'herohand', 'heroweight', 'heroarms', 'herorun', 'herostance', 'heroidles', 'heroref', 'looks', 'terrain', 'fire', 'bullets'];
// lord's longest scenarios, each a process of its own (`fxlooks` replays SPELLS and TERRAIN under four
// looks: about half the suite; `pace` plays every form for minutes per seed). `lord` runs the rest.
const LORD = 'tests/integration/lord.mjs';
const LORD_OWN = ['fxlooks', 'pace'];
// city's (Halcyon Plaza): the pace meter and the fencing bot's three fights, each a process of its own
const CITY = 'tests/integration/city.mjs';
const CITY_OWN = ['pace', 'win'];
// veil's (the Veiled Crossing): the pace meter, a process of its own (the later agents' scenarios run in `veil`)
const VEIL = 'tests/integration/veil.mjs';
const VEIL_OWN = ['pace'];
// fxlooks' TERRAIN check (TERRAIN under '0', then under one look) was nearly all of it: about 9 min,
// the whole CI run's wall. Each look is a process of its own (lord.mjs GCD_FX); the main fxlooks task
// leaves those out, so a part added there runs in it by itself.
const FX_TERRAIN = ['a', 'b', 'ship'].map((l) => `same-terrain@${l}`);
// life's files in three processes (GCD_SKIP leaves the first two groups out of `life`, so a new file
// lands there by itself); as one, it was the longest task after fxlooks (about 7 min)
const LIFE = 'tests/integration/life.mjs';
const LIFE_OWN = [['core', 'steps', 'answer', 'hang'], ['weather', 'creatures', 'lamps', 'tremor']];

// [name, node args, env, est]. est: seconds in a CI share (2026-11-24, PR #113's run, the split
// parts scaled from local timings; four tasks beside each other on a 4-core runner); it only deals the shares, a stale one costs balance,
// never coverage. Slowest first, so the long ones start at once when there are fewer cores than tasks.
const TASKS = [
  ['integ', [INTEG, '.', 'all'], { GCD_SKIP: ['timing', ...INTEG_2].join(',') }, 295],
  ['lord', [LORD, '.', 'all'], { GCD_SKIP: LORD_OWN.join(',') }, 255],
  ['woke', ['tests/integration/woke.mjs', '.', 'all'], {}, 245],
  ['asc', ['tests/integration/asc.mjs', '.', 'all'], {}, 225],
  ...Array.from({ length: TIMING_PARTS }, (_, i) => [`integ timing ${i + 1}/${TIMING_PARTS}`, [INTEG, '.', 'timing'], { GCD_TM_SHARD: `${i + 1}/${TIMING_PARTS}` }, [165, 220, 205][i] ?? 200]),
  ['duel', ['tests/integration/duel.mjs', '.', 'all'], {}, 217],
  ['fox', ['tests/integration/fox.mjs', '.', 'all'], {}, 194],
  ...FX_TERRAIN.map((k) => [`lord fxlooks ${k.split('@')[1]}`, [LORD, '.', 'fxlooks'], { GCD_FX: k }, 185]),
  ['life', [LIFE, '.', 'all'], { GCD_SKIP: LIFE_OWN.flat().join(',') }, 150],
  ...LIFE_OWN.map((g) => [`life ${g[0]} +`, [LIFE, '.', g.join(',')], {}, 150]),
  ['city', [CITY, '.', 'all'], { GCD_SKIP: CITY_OWN.join(',') }, 149],
  ['lord pace', [LORD, '.', 'pace'], {}, 142],
  ['world', ['tests/integration/world.mjs', '.', 'all'], { GCD_SKIP: 'budget' }, 110],
  ['city pace', [CITY, '.', 'pace'], {}, 108],
  ['integ hero + world', [INTEG, '.', INTEG_2.join(',')], {}, 150],
  ['sheath', ['tests/integration/sheath.mjs', '.', 'all'], {}, 102],
  ['lord fxlooks', [LORD, '.', 'fxlooks'], { GCD_FX: FX_TERRAIN.map((k) => `!${k}`).join(',') }, 80],
  ['city win', [CITY, '.', 'win'], {}, 69],
  ['veil', [VEIL, '.', 'all'], { GCD_SKIP: VEIL_OWN.join(',') }, 45],
  ['veil pace', [VEIL, '.', 'pace'], {}, 90],
  ['groundfx', ['tests/integration/groundfx.mjs', '.', 'all'], {}, 15],
  ['dragonProps', ['tests/integration/dragonProps.mjs', '.', 'all'], {}, 15],
  ['dggrass', ['tests/integration/dgGrass.mjs', '.'], {}, 15],
  ['dpfloor', ['tests/integration/dpfloor.mjs', '.', 'all'], {}, 15],
  ['records', ['tests/integration/records.mjs', '.', 'all'], {}, 1],
  ['autoq', ['tests/integration/autoq.mjs', '.', 'all'], {}, 1],
  ['cost', ['tests/integration/cost.mjs', '.', 'all'], {}, 12],
  ['glyphcheck', ['tests/glyphcheck.mjs', '.'], {}, 1],
  ['changelogcheck', ['tests/changelogcheck.mjs', '.'], {}, 1],
];
// Run on their own once the tasks above are done, one at a time: checks that read wall-clock time.
// world's `budget` times 3600 frames of the forest's destruction and reads the 99.9th percentile (the
// 4th slowest frame). Beside three other suites on a 4-core CI runner, the OS's scheduling decided it,
// not the code: the same tree read p99.9 0.3 - 0.6 ms alone and 1.65 / 2.53 ms on two CI runs (the
// budget is 1.5), with `destructibles.js` unchanged.
const ALONE = [
  ['world budget', ['tests/integration/world.mjs', '.', 'budget'], {}, 5],
];
// what a task must not inherit from the caller's shell: these narrow what a suite runs
const NARROWING = ['GCD_SKIP', 'GCD_TM', 'GCD_TM_SHARD', 'GCD_FX'];

// --shard I/N: deal every task (ALONE ones too) to N shares, longest first, each to the lightest share
function deal(n) {
  const shares = Array.from({ length: n }, () => ({ load: 0, tasks: [], alone: [] }));
  const all = [...TASKS.map((t) => [t, 'tasks']), ...ALONE.map((t) => [t, 'alone'])];
  const order = all.map((x, i) => [x, i]).sort((a, b) => (b[0][0][3] ?? 60) - (a[0][0][3] ?? 60) || a[1] - b[1]);
  for (const [[t, kind]] of order) {
    const s = shares.reduce((m, x) => (x.load < m.load ? x : m), shares[0]);
    s.load += t[3] ?? 60;
    s[kind].push(t);
  }
  return shares;
}
let tasks = TASKS, alone = ALONE, label = '';
const shardArg = valueOf('--shard');
if (shardArg !== undefined) {
  const m = /^(\d+)\/(\d+)$/.exec(shardArg);
  const [i, n] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
  if (!m || n < 1 || i < 1 || i > n) { process.stdout.write(`--shard wants I/N with 1 <= I <= N (got ${shardArg})\n`); process.exit(2); }
  const shares = deal(n);
  if (flag('--list')) {
    shares.forEach((s, k) => process.stdout.write(`shard ${k + 1}/${n} (~${s.load} s of tasks): ${[...s.tasks, ...s.alone].map((t) => t[0]).join(', ')}\n`));
    process.exit(0);
  }
  ({ tasks, alone } = shares[i - 1]);
  label = ` (shard ${i}/${n})`;
  process.stdout.write(`shard ${i}/${n}: ${[...tasks, ...alone].map((t) => t[0]).join(', ')}\n`);
} else if (flag('--list')) {
  process.stdout.write(`${[...TASKS, ...ALONE].map((t) => t[0]).join(', ')}\n`);
  process.exit(0);
}

const onlyArg = valueOf('--only');
if (onlyArg !== undefined) {
  const names = onlyArg.split(',').map((s) => s.trim()).filter(Boolean);
  const pick = (t) => names.some((w) => t[0] === w || t[0].startsWith(`${w} `));
  tasks = tasks.filter(pick);
  alone = alone.filter(pick);
  if (!tasks.length && !alone.length) { process.stdout.write(`--only ${onlyArg}: no task matches (see --list)\n`); process.exit(2); }
  label += ` (only ${names.join(', ')})`;
}

// the owner's machine (ADR-205): low priority and one pool of slots shared by every run; CI: as before
const LOCAL = !process.env.CI;
const POOL = Math.max(1, Math.floor(Number(process.env.ABYSS_JOBS)) || 8);
const SLOTS = join(tmpdir(), 'abyss-test-slots');
const asked = Number(valueOf('--jobs'));
const want = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : availableParallelism();
const jobs = flag('--serial') ? 1 : Math.max(1, Math.min(Math.max(1, tasks.length), LOCAL ? Math.min(want, POOL) : want));
if (LOCAL) {
  try { setPriority(constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed: run at normal */ }
  mkdirSync(SLOTS, { recursive: true });
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const held = new Set();
// remove a dead run's slot file, under a lock (mkdir is atomic): two waiting runs may both have read the
// same dead pid, so the owner is read again inside the lock, and a file a live run has just made is kept
function reclaim(f, deadPid) {
  const lock = `${f}.reclaim`;
  try { mkdirSync(lock); } catch {
    // a lock left by a run killed mid-reclaim: drop it once it is old
    try { if (Date.now() - statSync(lock).mtimeMs > 10000) rmdirSync(lock); } catch { /* gone */ }
    return false;
  }
  try {
    let pid = 0;
    try { pid = Number(readFileSync(f, 'utf8')); } catch { return true; } // already gone: free to take
    if (pid !== deadPid) return false;
    try { unlinkSync(f); } catch { /* gone */ }
    return true;
  } finally {
    try { rmdirSync(lock); } catch { /* gone */ }
  }
}
// take one of the machine's POOL slots: a slot file names its run's pid; a dead run's slot is taken over
async function acquire() {
  if (!LOCAL) return null;
  let waited = false;
  for (;;) {
    for (let i = 0; i < POOL; i++) {
      const f = join(SLOTS, `slot-${i}`);
      if (held.has(f)) continue;
      try {
        const fd = openSync(f, 'wx');
        writeSync(fd, String(process.pid));
        closeSync(fd);
        held.add(f);
        return f;
      } catch {
        let pid = 0;
        try { pid = Number(readFileSync(f, 'utf8')); } catch { continue; }
        if (pid && pid !== process.pid && !alive(pid) && reclaim(f, pid)) i--;
      }
    }
    if (!waited) { waited = true; process.stdout.write(`(all ${POOL} test slots on this machine are busy: waiting for another run)\n`); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
function release(f) {
  if (!f) return;
  held.delete(f);
  try { unlinkSync(f); } catch { /* already gone */ }
}
const children = new Set();
// a run that is stopped takes its workers and its slots with it, so nothing is left running
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    for (const f of [...held]) release(f);
    process.exit(130);
  });
}
process.on('exit', () => { for (const f of [...held]) release(f); });

async function run(task) {
  const slot = await acquire();
  try { return await runTask(task); } finally { release(slot); }
}

function runTask([name, argv, taskEnv]) {
  return new Promise((done) => {
    const t0 = Date.now();
    const chunks = [];
    const env = { ...process.env };
    for (const k of NARROWING) delete env[k];
    const child = spawn(process.execPath, argv, { cwd: root, env: { ...env, ...taskEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    if (LOCAL && child.pid) { try { setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed */ } }
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    const end = (code, note) => {
      children.delete(child);
      const secs = (Date.now() - t0) / 1000;
      process.stdout.write(`\n===== ${name} (${secs.toFixed(1)} s) ${code === 0 ? 'passed' : 'FAILED'}${note ? ` ${note}` : ''} =====\n`);
      process.stdout.write(Buffer.concat(chunks));
      done({ name, code, secs });
    };
    child.on('error', (e) => end(1, `(could not start: ${e.message})`));
    child.on('close', (code, signal) => end(code ?? 1, signal ? `(signal ${signal})` : ''));
  });
}

const t0 = Date.now();
const queue = tasks.slice();
const results = [];
await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) results.push(await run(queue.shift()));
}));
for (const task of alone) results.push(await run(task));

const wall = (Date.now() - t0) / 1000;
const failed = results.filter((r) => r.code !== 0);
process.stdout.write(`\n===== summary${label}: ${jobs} at a time, then ${alone.length} alone, ${wall.toFixed(1)} s =====\n`);
for (const [name] of [...tasks, ...alone]) {
  const r = results.find((x) => x.name === name);
  process.stdout.write(`  ${r.code === 0 ? 'ok  ' : 'FAIL'}  ${name.padEnd(18)} ${r.secs.toFixed(1).padStart(6)} s\n`);
}
process.stdout.write(failed.length ? `\n${failed.length} of ${results.length} FAILED: ${failed.map((r) => r.name).join(', ')}\n` : `\nALL ${results.length} PASSED\n`);
process.exit(failed.length ? 1 : 0);
