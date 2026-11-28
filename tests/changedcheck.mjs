// Checks tests/changed.mjs, the rules `npm test -- --changed` picks tasks by (ADR-275):
//  - every task a rule names exists in tests/run.mjs (a renamed suite breaks no rule silently),
//  - every boss folder in src/entities/enemies and every level in src/levels has a rule of its own
//    (a new boss gets one; until then this check fails, and --changed would run everything for it),
//  - the files a rule names still exist,
//  - a few picks, as an agent would see them.
//   node tests/changedcheck.mjs [root]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ALL, BOSSES, RULES, pickTasks } from './changed.mjs';

const root = resolve(process.argv[2] ?? '.');
const tasks = JSON.parse(execFileSync(process.execPath, ['tests/run.mjs', '.', '--list', '--json'], { cwd: root, encoding: 'utf8' }));
const errors = [];
const fail = (m) => errors.push(m);
const known = (w) => tasks.some((t) => t.name === w || t.name.startsWith(`${w} `));
const pickOf = (files) => pickTasks(files, tasks, root);
const names = (p) => (p.all ? ALL : [...p.names].sort().join(','));

// 1. every task a rule names exists
for (const [re, ts] of RULES) {
  if (ts === ALL) continue;
  for (const w of ts) if (!known(w)) fail(`rule ${re} names task '${w}', which tests/run.mjs does not have`);
}

// 2. every boss and every level has a rule of its own
const enemies = readdirSync(join(root, 'src/entities/enemies'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'duelist').map((d) => d.name);
for (const e of enemies) {
  const p = pickOf([`src/entities/enemies/${e}/x.js`]);
  if (p.all) fail(`src/entities/enemies/${e}/ has no rule in tests/changed.mjs (add the boss to BOSSES)`);
}
for (const f of readdirSync(join(root, 'src/levels')).filter((f) => f.endsWith('.js') && f !== 'index.js')) {
  const p = pickOf([`src/levels/${f}`]);
  if (p.all) fail(`src/levels/${f} has no rule in tests/changed.mjs (add the level to BOSSES)`);
}

// 3. what BOSSES names is still there
for (const b of BOSSES) {
  if (!existsSync(join(root, 'src/entities/enemies', b.enemy))) fail(`BOSSES: src/entities/enemies/${b.enemy}/ is gone`);
  if (!existsSync(join(root, 'src/levels', `${b.level}.js`))) fail(`BOSSES: src/levels/${b.level}.js is gone`);
  for (const s of b.sets) if (!existsSync(join(root, 'src/world', `${s}.js`))) fail(`BOSSES: src/world/${s}.js is gone`);
  if (!known(b.suite)) fail(`BOSSES: ${b.enemy}'s suite '${b.suite}' is not a task`);
}

// 4. picks
const expect = (files, want) => {
  const got = names(pickOf(files));
  if (got !== want) fail(`pick for ${files.join(' + ')}: got ${got}, want ${want}`);
};
expect(['src/entities/enemies/halcyon/halcyon.js'], 'changelogcheck,city,cost,glyphcheck');
expect(['docs/DEVLOG.md', 'CHANGELOG.md'], 'changelogcheck');
expect(['src/levels/veil.js', 'tests/integration/veil.mjs'], 'changelogcheck,cost,glyphcheck,veil,veil pace,world');
expect(['src/world/life/wind.js'], 'changelogcheck,cost,glyphcheck,life');
expect(['src/combat/rules.js'], ALL);
expect(['src/entities/player/player.js'], ALL);
expect(['tests/run.mjs'], ALL);
expect(['tests/integration/swordAudit.mjs'], 'changelogcheck,duel,lord,lord fxlooks,lord fxlooks a,lord fxlooks b,lord fxlooks ship,lord pace');
expect(['src/levels/index.js'], ALL);
expect([], '');

if (errors.length) {
  for (const e of errors) process.stdout.write(`FAIL ${e}\n`);
  process.exit(1);
}
process.stdout.write(`changedcheck: ${RULES.length} rules, ${enemies.length} bosses, ${tasks.length} tasks: ok\n`);
