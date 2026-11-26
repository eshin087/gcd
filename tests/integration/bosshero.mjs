// The bosses drawn in the hero's style (ADR-220, duelist/heroPrint.js, `?ashHero=` / `lordHero` / `ascHero` /
// `sheathHero` / `halHero`, each 0 | a shading | b outline | c both). Headless checks on the real modules:
// the table is whole (a switch per boss, its Lab row with its options, picked or awaiting); the default
// draws the pick; heroPrint() allocates nothing; the shaders take the levers where they should and leave the
// player alone (SG_HERO_SELF), his head and hat and his colours untouched; main.js writes both every frame;
// and every boss's rig still builds with its ink-line materials sharing U.uBossHero.
// usage: node bosshero.mjs <repoRoot>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import './shim.mjs';

const ROOT = process.argv[2] || '.';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };

const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { buildHero } = await imp('src/entities/player/model.js');
const { HERO_PRINT, HERO_STYLE, heroPrint } = await imp('src/entities/enemies/duelist/heroPrint.js');
const { setLook, lookOf, PICKED, PENDING } = await imp('src/entities/enemies/duelist/lookSwitch.js');
const { LOOK_SWITCHES } = await imp('src/dev/labLooks.js');

// each level's boss: his gear module (registers his items) and the loadout his kit builds
const BOSSES = {
  ash: ['src/entities/enemies/ashDisciple/gear.js', 'ASH_LOADOUT'],
  starless: ['src/entities/enemies/starlessLord/gear.js', 'LORD_LOADOUT'],
  ring: ['src/entities/enemies/ascendant/gear.js', 'ASC_LOADOUT'],
  grove: ['src/entities/enemies/sheathed/gear.js', 'SHEATH_LOADOUT'],
  city: ['src/entities/enemies/halcyon/gear.js', 'HAL_LOADOUT'],
};
const OPTS = ['0', ...Object.keys(HERO_STYLE)];

out('\n== the table: one switch per boss, its Lab row, its pick ==');
assert(Object.keys(HERO_PRINT).sort().join() === Object.keys(BOSSES).sort().join(), `a switch for each of the five bosses (${Object.values(HERO_PRINT).join(', ')})`);
assert(OPTS.join() === '0,a,b,c' && HERO_STYLE.a.shade > 0 && !HERO_STYLE.a.lines && HERO_STYLE.b.shade === 0 && HERO_STYLE.b.lines && HERO_STYLE.c.shade > 0 && HERO_STYLE.c.lines, 'the options: a his shading, b his outline, c both');
for (const [id, name] of Object.entries(HERO_PRINT)) {
  const row = LOOK_SWITCHES.find((s) => s[0] === name);
  assert(!!row && row[1].join() === OPTS.join() && row[5].includes(id) && row[4] === false, `${name}: a Lab LOOKS row on ${id}, ${OPTS.join(' ')}, live (no reload)`);
  const picked = PICKED[name] ?? null;
  assert(picked != null ? OPTS.includes(picked) && !PENDING.includes(name) && row[7] !== 'awaiting' : PENDING.includes(name) && row[7] === 'awaiting', `${name}: ${picked != null ? `picked '${picked}'` : 'awaiting the owner (PENDING)'}`);
  setLook(name, null);
  const now = heroPrint(id), want = picked != null && picked !== '0' ? HERO_STYLE[picked] : null;
  assert(want ? now === want : now.shade === 0 && !now.lines, `${name}: the default draws ${want ? `option ${picked}` : 'the boss as he shipped'} (shade ${now.shade}, lines ${now.lines})`);
  for (const k of OPTS) {
    setLook(name, k);
    const a = heroPrint(id), b = heroPrint(id);
    assert(a === b && (k === '0' ? a.shade === 0 && !a.lines : a === HERO_STYLE[k]), `${name}=${k}: heroPrint gives the option's own frozen record (no allocation per frame)`);
  }
  setLook(name, null);
}
assert(heroPrint('cinderwood').shade === 0 && !heroPrint('fox').lines && !heroPrint('code').lines, 'the wyrm, Wen Yao and Xin Yi: no switch, nothing drawn differently');

out('\n== the shaders and main.js ==');
{
  const U = createSharedUniforms();
  assert(!!U.uBossHero?.value?.isVector4 && U.uBossHero.value.toArray().every((v) => v === 0), 'U.uBossHero is a shared vec4, (0, 0, 0, 0) until main.js writes it');
  const mat = fs.readFileSync(`${ROOT}/src/render/materials.js`, 'utf8');
  const at = mat.indexOf('uBossHero.x > 0.0');
  const guard = mat.lastIndexOf('#ifndef SG_HERO_SELF', at);
  assert(at > 0 && guard > 0 && mat.indexOf('#endif', guard) > at && /'uBossPrint', 'uBossHero'/.test(mat), 'the shading is read inside #ifndef SG_HERO_SELF (never the player), the uniform in HERO_ART_SHARED');
  const blk = mat.slice(mat.lastIndexOf('if (', at), mat.indexOf('#endif', at));
  assert(/fillC \*=/.test(blk) && !/artFill\s*=/.test(blk) && /shHead/.test(blk) && /hemK/.test(blk) && /bossCloth > 0\.5/.test(blk),
    'it scales the light (fillC), never his colour (artFill); his head and hat, the hem and his face / eyes / glow keep theirs');
  const pipe = fs.readFileSync(`${ROOT}/src/render/pipeline.js`, 'utf8');
  assert(/gLine = uBossLike\.z > 0\.5 \? max\(uHeroPx\.x, uSelfPx\) : uHeroPx\.x;/.test(pipe), "the outline: a boss's ink lines at the hero's line width (uSelfPx), his letter cell (gCell) his own");
  const main = fs.readFileSync(`${ROOT}/src/main.js`, 'utf8');
  assert(/heroPrint\(level\.id\)/.test(main) && /uBossLike\?\.value\.set\(on, on, on && hp\.lines \? 1 : 0, 0\)/.test(main) && /uBossHero\.value\.set\(on \? hp\.shade : 0/.test(main),
    'main.js writes both every frame from heroPrint(level.id), only with ?bossPrint on');
}

out('\n== every boss still builds, his materials sharing the lever ==');
const U = createSharedUniforms();
for (const [id, [file, lo]] of Object.entries(BOSSES)) {
  const G = await imp(file);
  let rig = null, err = null;
  try {
    rig = buildHero(U, G[lo]);
  } catch (e) {
    err = e;
  }
  let art = 0, shared = 0;
  rig?.root.traverse((o) => {
    const u = o.isMesh ? o.material?.uniforms : null;
    if (u?.uArtFill) { art++; if (u.uBossHero === U.uBossHero) shared++; }
  });
  assert(!!rig && art > 0 && shared === art, `${HERO_PRINT[id]}: his rig builds (${err ? err.message : `${shared} / ${art} ink-line meshes read U.uBossHero`})`);
  rig?.root.traverse((o) => o.geometry?.dispose?.());
}

out(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
