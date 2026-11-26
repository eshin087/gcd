// The bosses drawn like the hero (ADR-220, duelist/heroPrint.js, `?ashHero=` / `lordHero` / `ascHero` /
// `sheathHero` / `halHero`): every option of every boss builds, headless, on the real gear and the real
// shared uniforms. Checks: the table is whole (each boss's switch has its Lab row and its options); the
// picked option is the default and is drawn by heroPrint(); the art shader takes U.uBossHero and leaves the
// player alone (SG_HERO_SELF); a cloth option cuts the skirt the hero's way (the hem wider, torn strips, the
// geometry finite) and option '0' builds exactly today's panels; every option's rig builds without a throw.
// usage: node bosshero.mjs <repoRoot>
import { pathToFileURL } from 'node:url';
import './shim.mjs';

const ROOT = process.argv[2] || '.';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };

const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { buildHero } = await imp('src/entities/player/model.js');
const { HERO_PRINT, heroPrint, heroCloth, flared } = await imp('src/entities/enemies/duelist/heroPrint.js');
const { setLook, lookOf, PICKED, PENDING } = await imp('src/entities/enemies/duelist/lookSwitch.js');
const { LOOK_SWITCHES } = await imp('src/dev/labLooks.js');
const fs = await import('node:fs');

// each level's boss: his gear module (registers his items) and the loadout his kit builds
const BOSSES = {
  ash: ['src/entities/enemies/ashDisciple/gear.js', 'ASH_LOADOUT'],
  starless: ['src/entities/enemies/starlessLord/gear.js', 'LORD_LOADOUT'],
  ring: ['src/entities/enemies/ascendant/gear.js', 'ASC_LOADOUT'],
  grove: ['src/entities/enemies/sheathed/gear.js', 'SHEATH_LOADOUT'],
  city: ['src/entities/enemies/halcyon/gear.js', 'HAL_LOADOUT'],
};

out('\n== the table: one switch per boss, its Lab row, its pick ==');
assert(Object.keys(HERO_PRINT).sort().join() === Object.keys(BOSSES).sort().join(), `a switch for each of the five bosses (${Object.keys(HERO_PRINT).join(', ')})`);
for (const [id, e] of Object.entries(HERO_PRINT)) {
  const row = LOOK_SWITCHES.find((s) => s[0] === e.name);
  const opts = ['0', ...Object.keys(e.opts)];
  assert(!!row && row[1].join() === opts.join() && row[5].includes(id), `${e.name}: a Lab LOOKS row on ${id} with the options ${opts.join(' ')}`);
  const picked = PICKED[e.name] ?? null;
  assert(picked != null ? opts.includes(picked) && !PENDING.includes(e.name) : PENDING.includes(e.name), `${e.name}: ${picked != null ? `picked '${picked}'` : 'awaiting the owner (PENDING)'}`);
  setLook(e.name, null);
  const now = heroPrint(id);
  const want = picked != null && picked !== '0' ? e.opts[picked] : null;
  assert(want ? now.body === want.body && now.letters === want.letters : now.body === 0 && !now.letters, `${e.name}: the default draws ${want ? `option ${picked}` : 'the boss as he shipped'} (body ${now.body}, letters ${now.letters})`);
  for (const [k, o] of Object.entries(e.opts)) {
    const ok = [o.body, o.hem, o.fade, o.rim].every((v) => Number.isFinite(v ?? 0) && (v ?? 0) >= 0) && o.body <= 1 && (o.hem ?? 0) < 2 && (o.cloth == null || o.cloth === 'flare');
    assert(ok, `${e.name}=${k}: its numbers are sane (body ${o.body}, hem ${o.hem} m, fade ${o.fade} m, rim ${o.rim}, cloth ${o.cloth ?? 'none'})`);
  }
}

out('\n== the shader: U.uBossHero, never on the player ==');
{
  const U = createSharedUniforms();
  const src = fs.readFileSync(`${ROOT}/src/render/materials.js`, 'utf8');
  assert(!!U.uBossHero?.value?.isVector4 && U.uBossHero.value.toArray().every((v) => v === 0), 'U.uBossHero is a shared vec4, (0, 0, 0, 0) until main.js writes it');
  const at = src.indexOf('uBossHero.x');
  const guard = src.lastIndexOf('#ifndef SG_HERO_SELF', at);
  assert(at > 0 && guard > 0 && src.indexOf('#endif', guard) > at && /'uBossPrint', 'uBossHero'/.test(src), 'the dark body is read inside the bosses\' print (#ifndef SG_HERO_SELF), the uniform in HERO_ART_SHARED');
  const main = fs.readFileSync(`${ROOT}/src/main.js`, 'utf8');
  assert(/heroPrint\(level\.id\)/.test(main) && /uBossHero\.value\.set\(/.test(main) && /\|\| hp\.letters/.test(main), 'main.js writes it every frame from heroPrint(level.id), and his letters follow his size with it');
}

out('\n== flared(): the hero\'s cut ==');
{
  const P = [{ az: 0.4, w: [0.17, 0.22, 0.28], len: [0.34, 0.36], strips: [], fork: [], out: 0, flare: 0.08 }];
  const F = flared(P)[0];
  assert(F.w[2] > P[0].w[2] * 1.4 && F.w[0] === P[0].w[0] && F.len[1] > P[0].len[1] && F.flare > P[0].flare && F.strips.length >= 2 && F.strips.length === F.fork.length && P[0].strips.length === 0,
    `the hem ${P[0].w[2]} -> ${F.w[2].toFixed(3)} m, the waist kept, longer, flaring more, torn into ${F.strips.length} strips; the panels given are left as they were`);
}

out('\n== every option builds ==');
const U = createSharedUniforms();
for (const [id, [file, loName]] of Object.entries(BOSSES)) {
  const G = await imp(file);
  const name = HERO_PRINT[id].name;
  const hemOf = (rig) => rig.coat.reduce((a, c) => a + (c.def?.w?.[2] ?? 0), 0);
  const stripsOf = (rig) => rig.coat.reduce((a, c) => a + (c.strips?.length ?? 0), 0);
  let base = null;
  for (const k of ['0', ...Object.keys(HERO_PRINT[id].opts)]) {
    setLook(name, k);
    let rig = null, err = null;
    try {
      rig = buildHero(U, G[loName]);
    } catch (e) {
      err = e;
    }
    let finite = true, tris = 0;
    rig?.root.traverse((o) => {
      const p = o.isMesh ? o.geometry?.attributes?.position : null;
      if (!p) return;
      tris += p.count / 3;
      for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) { finite = false; break; }
    });
    assert(!!rig && finite, `${name}=${k}: his rig builds (${err ? err.message : `${Math.round(tris)} triangles, every vertex finite`})`);
    if (!rig) continue;
    if (k === '0') base = { hem: hemOf(rig), strips: stripsOf(rig), n: rig.coat.length, tris };
    else if (heroCloth(id) === 'flare') {
      const hem = hemOf(rig), strips = stripsOf(rig);
      assert((id === 'ring' || rig.coat.length === base.n) && hem > base.hem * 1.3 && strips > base.strips, `${name}=${k}: the skirt cut the hero's way (its hem ${base.hem.toFixed(2)} -> ${hem.toFixed(2)} m round, ${base.strips} -> ${strips} torn strips, ${base.n} -> ${rig.coat.length} panels${id === 'ring' ? ': the long gi skirt' : ''})`);
    } else if (base) {
      assert(Math.abs(hemOf(rig) - base.hem) < 1e-9 && stripsOf(rig) === base.strips, `${name}=${k}: the print only: the outfit as option 0 builds it`);
    }
    rig.root.traverse((o) => o.geometry?.dispose?.());
  }
  setLook(name, null);
  assert(lookOf(name, '0') === (PICKED[name] ?? '0'), `${name}: back to its default after the checks`);
}

out(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
