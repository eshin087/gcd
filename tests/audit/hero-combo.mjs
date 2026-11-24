// THE COMBO AUDIT (opt-in, not part of `npm test`; styles/COMBOS.md): the light combo of one style,
// measured with the suites' own harness (tests/integration/integ.mjs, scenario `comboaudit`).
//   node tests/audit/hero-combo.mjs . <styleId>        (today | flow | still | restless | showy)
// It prints, per hit: W / A / R, when the next hit may start, the damage and the hit windows; the mashed
// cadence and the damage per second against today's (target within ±6 %); every look of every hit,
// one press at a time, against the wyrm at 2.0 / 2.75 / 3.5 m (hit / miss); per look: where the blade
// crosses his front (inside the active frames?), the fastest frame of each arm segment, hand, the blade's
// point and the head, the elbows' range, the bearing feet's travel, the hips' lead, the blade vs his body;
// and the suites' lint on every clip the combo uses (diagonals, the whip, a thrust rising, anticipation
// and overshoot keys, a `line`). It exits 0 whatever it finds (the numbers are for the author).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const style = process.argv[3] || 'today';
const here = path.dirname(fileURLToPath(import.meta.url));
const integ = path.join(here, '..', 'integration', 'integ.mjs');
const r = spawnSync(process.execPath, [integ, root, 'comboaudit'], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ABYSS_COMBO: style }, maxBuffer: 64 * 1024 * 1024 });
const text = String(r.stdout ?? '').split('\n').filter((l) => !/^ok {3}flow\.debug\.toState/.test(l)).join('\n');
// (the harness's own tail, the event catalogue and the HUD log, is not the author's business)
const cut = text.indexOf('\nmax HUD log lines');
process.stdout.write(cut >= 0 ? text.slice(0, cut) + '\n' : text);
const errs = text.match(/console errors\/warnings: \d+[^\n]*/)?.[0];
if (errs) process.stdout.write(`(${errs})\n`);
if (/unknown style/.test(text)) process.exit(2);
process.exit(0);
