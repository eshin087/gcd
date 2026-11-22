// Runs the whole test set (`npm test`): the four headless integration suites and the two static
// checks, side by side, one process each. They share nothing (no files written, no ports), so the
// wall time is the slowest task instead of the sum. The same checks run as before; none is dropped.
//
//   node tests/run.mjs [root] [--serial] [--jobs N]
//
// Each task's output is held and printed whole when the task ends, so two suites never interleave.
// Exit code: 0 when every task passed, 1 otherwise. One suite on its own is still
// `node tests/integration/<suite>.mjs . <scenario>`.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const jobsAt = args.indexOf('--jobs');
const root = resolve(args.find((a, i) => !a.startsWith('--') && (jobsAt < 0 || i !== jobsAt + 1)) ?? '.');

// integ's TIMING scenario (a grid of placements per wyrm attack) is about two thirds of that suite,
// so it runs beside the rest of integ, in TIMING_PARTS parts: integ.mjs takes every n-th attack of
// its own list (ABYSS_TM_SHARD), so an attack added there is covered without a change here.
const TIMING_PARTS = 3;
const INTEG = 'tests/integration/integ.mjs';
// The rest of integ is still the longest task, so these scenarios (the hero's model and the world:
// about half of it) run as a second process. `integ` runs `all` without them, so a new scenario
// lands there by itself, and it keeps the checks across scenarios (the event catalogue).
const INTEG_2 = ['hero', 'herolife', 'herolook', 'herohand', 'heroweight', 'heroarms', 'herostance', 'looks', 'terrain', 'fire', 'bullets'];

// [name, node args, env]. Slowest first, so the long ones start at once when there are fewer cores
// than tasks.
const TASKS = [
  ['integ', [INTEG, '.', 'all'], { ABYSS_SKIP: ['timing', ...INTEG_2].join(',') }],
  ['integ hero + world', [INTEG, '.', INTEG_2.join(',')], {}],
  ...Array.from({ length: TIMING_PARTS }, (_, i) => [`integ timing ${i + 1}/${TIMING_PARTS}`, [INTEG, '.', 'timing'], { ABYSS_TM_SHARD: `${i + 1}/${TIMING_PARTS}` }]),
  ['lord', ['tests/integration/lord.mjs', '.', 'all'], {}],
  ['asc', ['tests/integration/asc.mjs', '.', 'all'], {}],
  ['fallen', ['tests/integration/fallen.mjs', '.', 'all'], {}],
  ['duel', ['tests/integration/duel.mjs', '.', 'all'], {}],
  ['world', ['tests/integration/world.mjs', '.', 'all'], { ABYSS_SKIP: 'budget' }],
  ['glyphcheck', ['tests/glyphcheck.mjs', '.'], {}],
  ['changelogcheck', ['tests/changelogcheck.mjs', '.'], {}],
];
// Run on their own once the tasks above are done, one at a time: checks that read wall-clock time.
// world's `budget` times 3600 frames of the forest's destruction and reads the 99.9th percentile (the
// 4th slowest frame). Beside three other suites on a 4-core CI runner, the OS's scheduling decided it,
// not the code: the same tree read p99.9 0.3 - 0.6 ms alone and 1.65 / 2.53 ms on two CI runs (the
// budget is 1.5), with `destructibles.js` unchanged.
const ALONE = [
  ['world budget', ['tests/integration/world.mjs', '.', 'budget'], {}],
];
// what a task must not inherit from the caller's shell: these narrow what a suite runs
const NARROWING = ['ABYSS_SKIP', 'ABYSS_TM', 'ABYSS_TM_SHARD'];

const asked = jobsAt >= 0 ? Number(args[jobsAt + 1]) : NaN;
const jobs = flag('--serial') ? 1 : Math.max(1, Math.min(TASKS.length, Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : availableParallelism()));

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
const queue = TASKS.slice();
const results = [];
await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) results.push(await run(queue.shift()));
}));
for (const task of ALONE) results.push(await run(task));

const wall = (Date.now() - t0) / 1000;
const failed = results.filter((r) => r.code !== 0);
process.stdout.write(`\n===== summary: ${jobs} at a time, then ${ALONE.length} alone, ${wall.toFixed(1)} s =====\n`);
for (const [name] of [...TASKS, ...ALONE]) {
  const r = results.find((x) => x.name === name);
  process.stdout.write(`  ${r.code === 0 ? 'ok  ' : 'FAIL'}  ${name.padEnd(18)} ${r.secs.toFixed(1).padStart(6)} s\n`);
}
process.stdout.write(failed.length ? `\n${failed.length} of ${results.length} FAILED: ${failed.map((r) => r.name).join(', ')}\n` : `\nALL ${results.length} PASSED\n`);
process.exit(failed.length ? 1 : 0);
