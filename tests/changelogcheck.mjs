// Static check: the in-game changelog (src/ui/changelog.js, the WHAT'S NEW panel) keeps up with
// CHANGELOG.md. Every headline ("- **Title** (date ...)") in CHANGELOG.md → [Unreleased] above its
// first "###" section must have an entry with the same title in RELEASES, and every entry must be
// well formed. Usage: node tests/changelogcheck.mjs <repo root>
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? '.');
const { RELEASES, GAME_VERSION, entryId } = await import(pathToFileURL(join(root, 'src/ui/changelog.js')).href);
const errors = [];

// the version the game shows is the package's
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (GAME_VERSION !== pkg.version) errors.push(`GAME_VERSION ${GAME_VERSION} != package.json version ${pkg.version}`);

// well-formed entries, unique ids
const ids = new Set();
const titles = new Set();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!Array.isArray(RELEASES) || !RELEASES.length) errors.push('RELEASES is empty');
for (const r of RELEASES ?? []) {
  const where = r.version ? `v${r.version}` : String(r.label ?? 'latest');
  if (r.version != null && !/^\d+\.\d+\.\d+$/.test(r.version)) errors.push(`${where}: version is not x.y.z`);
  if (!Array.isArray(r.entries) || !r.entries.length) errors.push(`${where}: no entries`);
  for (const e of r.entries ?? []) {
    const t = String(e?.title ?? '');
    if (!t) errors.push(`${where}: an entry without a title`);
    if (!DATE.test(String(e?.date ?? ''))) errors.push(`${where} "${t}": date is not YYYY-MM-DD`);
    if (!Array.isArray(e?.notes) || !e.notes.length) errors.push(`${where} "${t}": no notes`);
    for (const n of e?.notes ?? []) {
      if (typeof n !== 'string' || !n.trim()) errors.push(`${where} "${t}": an empty note`);
      else if (/[`*]|ADR-\d|https?:/.test(n)) errors.push(`${where} "${t}": a note has markup, an ADR number or a URL: ${n}`);
    }
    const id = entryId(e);
    if (ids.has(id)) errors.push(`${where} "${t}": duplicate entry (same date and title)`);
    ids.add(id);
    if (r.version == null) titles.add(t);
  }
}
const latest = (RELEASES ?? []).filter((r) => r.version == null);
if (latest.length > 1) errors.push('more than one release without a version');

// CHANGELOG.md → [Unreleased] headlines
const md = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
const start = md.findIndex((l) => /^## \[Unreleased\]/.test(l));
let n = 0;
if (start < 0) errors.push('CHANGELOG.md has no [Unreleased] section');
else {
  for (let i = start + 1; i < md.length; i++) {
    const l = md[i];
    if (/^##+ /.test(l)) break; // the first "###" section (the detailed lists) or the next release
    const m = /^- \*\*(.+?)\*\*/.exec(l);
    if (!m) continue;
    n++;
    if (!titles.has(m[1])) errors.push(`CHANGELOG.md [Unreleased] "${m[1]}" has no entry in src/ui/changelog.js (the LATEST release)`);
  }
}

if (errors.length) {
  console.error(`changelog check: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`changelog check: ok (${ids.size} entries, ${n} CHANGELOG headlines matched)`);
