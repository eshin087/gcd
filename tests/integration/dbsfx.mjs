// The deathblow's sound, headless (audio/deathblowSfx.js, ?dbsfx=0|a|b|c|d): the REAL AudioEngine on the shim's
// strict WebAudio mock. Each recipe builds its node graph for blows 1..7 and the finisher without throwing
// (the mock throws on a bad start / stop / non-finite value); '0' plays the old flurry path; the switch only
// acts on a deathblow (art 'deathblow'), never on the dodge flurry; nothing draws from Math.random.
// usage: node dbsfx.mjs <repoRoot>
import { pathToFileURL } from 'node:url';
import { AUDIO } from './shim.mjs';

const ROOT = process.argv[2];
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const { Events } = await imp('src/core/events.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const DS = await imp('src/audio/deathblowSfx.js');

let fails = 0;
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const warns = [];
console.warn = (...a) => warns.push(a.map(String).join(' '));
console.error = (...a) => warns.push(a.map(String).join(' '));

const game = { events: new Events(), time: 0, realTime: 0, timeScale: 1 };
const A = new AudioEngine(game);
A.unlock();
const ctx = AUDIO.ctx;
assert(ctx && A.ctx, 'the engine has a context');
const played = [];
const play = A.play.bind(A);
A.play = (n, o) => { const r = play(n, o); played.push([n, o, r]); return r; };
let cuts = 0;
A._flurryCut = () => { cuts++; };
const wait = (s) => { ctx.currentTime += s; A.update(Math.min(s, 0.1)); };
const ev = (n, d) => game.events.emit(n, d);
const combo = (art, N) => {
  ev('player:flurry', { art, strikes: N, planted: art === 'deathblow' });
  for (let i = 1; i <= N; i++) { ev('player:flurryHit', { n: i, of: N, last: i === N, damage: 20, planted: true }); wait(0.3); }
  ev('player:flurryEnd', { art, strikes: N });
  wait(0.5);
};
const rand0 = Math.random;
let drew = 0;
Math.random = () => { drew++; return rand0(); };

wait(1);
const names = () => played.map((p) => p[0]);
// 0 / the dodge flurry: the old sounds, no deathblow sound
DS.setDbSfx('0');
played.length = 0; cuts = 0;
combo('deathblow', 4);
assert(!names().some((n) => /^db/.test(n)) && cuts === 3 && names().includes('flurryBurst'), "'0': a deathblow plays today's flurry sounds (3 cuts + the burst)");
for (const m of ['a', 'b', 'c', 'd']) {
  DS.setDbSfx(m);
  played.length = 0; cuts = 0;
  combo('dodge', 4);
  assert(!names().some((n) => /^db/.test(n)) && cuts === 3, `${m}: the dodge flurry keeps its own sounds`);
  for (let N = 1; N <= 7; N++) {
    played.length = 0; cuts = 0;
    const w0 = warns.length;
    combo('deathblow', N);
    const hits = played.filter((p) => p[0] === 'dbHit'), fin = played.filter((p) => p[0] === 'dbLast');
    assert(hits.length === N - 1 && fin.length === 1 && played.filter((p) => p[0].startsWith('db')).every((p) => p[2]) && cuts === 0 && !names().includes('flurryBurst') && warns.length === w0,
      `${m} N=${N}: ${N - 1} blows + 1 finisher played, none of the flurry's, nothing warned`);
  }
}
// the swell reaches the next blow (c), the loudness grows with the blow
assert(DS.deathblowSound({ n: 2, of: 7, last: false }, 'c', 0.4).opts.swell > 0.2 && DS.deathblowSound({ n: 7, of: 7, last: true }, 'c').opts.swell === 0, 'c: a swell into the next blow, none after the finisher');
assert(DS.DB_SFX_DEFAULT === 'd' && DS.DB_SFX.mode === 'd', 'the default is d (Pierce)');
assert(DS.deathblowSound({ n: 1, of: 3 }, '0') === null, "'0' gives no sound");
assert(drew === 0, `no sound drew from Math.random (${drew})`);
Math.random = rand0;
// no context: nothing throws
const c = A.ctx; A.ctx = null; let threw = false;
try { DS.setDbSfx('b'); combo('deathblow', 3); } catch (e) { threw = e; }
A.ctx = c;
assert(!threw, `without a context nothing throws (${threw})`);
DS.setDbSfx('0');
out(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
