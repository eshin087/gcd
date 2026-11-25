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
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const VALUED = new Set(['--jobs', '--shard']);
const root = resolve(args.find((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1])) ?? '.');

// integ's TIMING scenario (a grid of placements per wyrm attack) is about two thirds of that suite,
// so it runs beside the rest of integ, in TIMING_PARTS parts: integ.mjs takes every n-th attack of
// its own list (ABYSS_TM_SHARD), so an attack added there is covered without a change here.
const TIMING_PARTS = 3;
const INTEG = 'tests/integration/integ.mjs';
// The rest of integ is still the longest task, so these scenarios (the hero's model and the world:
// about half of it) run as a second process. `integ` runs `all` without them, so a new scenario
// lands there by itself, and it keeps the checks across scenarios (the event catalogue).
const INTEG_2 = ['hero', 'herolife', 'herolook', 'herohand', 'heroweight', 'heroarms', 'herostance', 'looks', 'terrain', 'fire', 'bullets'];
// lord's longest scenarios, each a process of its own (`fxlooks` replays SPELLS and TERRAIN under four
// looks: about half the suite; `pace` plays every form for minutes per seed). `lord` runs the rest.
const LORD = 'tests/integration/lord.mjs';
const LORD_OWN = ['fxlooks', 'pace'];
// city's (Halcyon Plaza): the pace meter and the fencing bot's three fights, each a process of its own
const CITY = 'tests/integration/city.mjs';
const CITY_OWN = ['pace', 'win'];
// fxlooks' TERRAIN check (TERRAIN under '0', then under one look) was nearly all of it: about 9 min,
// the whole CI run's wall. Each look is a process of its own (lord.mjs ABYSS_FX); the main fxlooks task
// leaves those out, so a part added there runs in it by itself.
const FX_TERRAIN = ['a', 'b', 'ship'].map((l) => `same-terrain@${l}`);
// life's files in three processes (ABYSS_SKIP leaves the first two groups out of `life`, so a new file
// lands there by itself); as one, it was the longest task after fxlooks (about 7 min)
const LIFE = 'tests/integration/life.mjs';
const LIFE_OWN = [['core', 'steps', 'answer', 'hang'], ['weather', 'creatures', 'lamps', 'tremor']];

// [name, node args, env, est]. est: seconds in a CI share (2026-11-24, PR #113's run, the split
// parts scaled from local timings; four tasks beside each other on a 4-core runner); it only deals the shares, a stale one costs balance,
// never coverage. Slowest first, so the long ones start at once when there are fewer cores than tasks.
const TASKS = [
  ['integ', [INTEG, '.', 'all'], { ABYSS_SKIP: ['timing', ...INTEG_2].join(',') }, 295],
  ['lord', [LORD, '.', 'all'], { ABYSS_SKIP: LORD_OWN.join(',') }, 255],
  ['woke', ['tests/integration/woke.mjs', '.', 'all'], {}, 245],
  ['asc', ['tests/integration/asc.mjs', '.', 'all'], {}, 225],
  ...Array.from({ length: TIMING_PARTS }, (_, i) => [`integ timing ${i + 1}/${TIMING_PARTS}`, [INTEG, '.', 'timing'], { ABYSS_TM_SHARD: `${i + 1}/${TIMING_PARTS}` }, [165, 220, 205][i] ?? 200]),
  ['duel', ['tests/integration/duel.mjs', '.', 'all'], {}, 217],
  ['fox', ['tests/integration/fox.mjs', '.', 'all'], {}, 194],
  ...FX_TERRAIN.map((k) => [`lord fxlooks ${k.split('@')[1]}`, [LORD, '.', 'fxlooks'], { ABYSS_FX: k }, 185]),
  ['life', [LIFE, '.', 'all'], { ABYSS_SKIP: LIFE_OWN.flat().join(',') }, 150],
  ...LIFE_OWN.map((g) => [`life ${g[0]} +`, [LIFE, '.', g.join(',')], {}, 150]),
  ['city', [CITY, '.', 'all'], { ABYSS_SKIP: CITY_OWN.join(',') }, 149],
  ['lord pace', [LORD, '.', 'pace'], {}, 142],
  ['world', ['tests/integration/world.mjs', '.', 'all'], { ABYSS_SKIP: 'budget' }, 110],
  ['city pace', [CITY, '.', 'pace'], {}, 108],
  ['integ hero + world', [INTEG, '.', INTEG_2.join(',')], {}, 108],
  ['sheath', ['tests/integration/sheath.mjs', '.', 'all'], {}, 102],
  ['lord fxlooks', [LORD, '.', 'fxlooks'], { ABYSS_FX: FX_TERRAIN.map((k) => `!${k}`).join(',') }, 80],
  ['city win', [CITY, '.', 'win'], {}, 69],
  ['records', ['tests/integration/records.mjs', '.', 'all'], {}, 1],
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
const NARROWING = ['ABYSS_SKIP', 'ABYSS_TM', 'ABYSS_TM_SHARD', 'ABYSS_FX'];

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

const asked = Number(valueOf('--jobs'));
const jobs = flag('--serial') ? 1 : Math.max(1, Math.min(Math.max(1, tasks.length), Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : availableParallelism()));

function run([name, argv, taskEnv]) {
  return new Promise((done) => {
    const t0 = Date.now();
    const chunks = [];
    const env = { ...process.env };
    for (const k of NARROWING) delete env[k];
    const child = spawn(process.execPath, argv, { cwd: root, env: { ...env, ...taskEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    const end = (code, note) => {
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
