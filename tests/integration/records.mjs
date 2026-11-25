// Saved records, grades and the boss rush, headless (ADR-179): the REAL rank / records / rush /
// eligibility modules, the REAL GameFlow on a light game (a stub hero and boss: the flow's states, its
// stats and its recorder are what is tested, not a fight) and the REAL title screen / record panel on
// the DOM shim. Storage is a Map-backed mock (localStorage and sessionStorage: injectable everywhere).
// usage: node records.mjs <repoRoot> [scenario]
//   scenario: grade | store | rush | eligible | flow | screens | all
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ui, resetWindow } from './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { CONFIG } = await imp('src/core/config.js');
const { Events } = await imp('src/core/events.js');
const { CameraRig } = await imp('src/core/cameraRig.js');
const { rankRun, compareRank } = await imp('src/game/rank.js');
const { RANK } = await imp('src/game/rankTuning.js');
const { Records, buildRecord, formatTime, RECORDS_KEY, RECENT } = await imp('src/game/records.js');
const { Rush, RUSH_KEY, rushUrl, isRushPage } = await imp('src/game/rush.js');
const { Eligibility, gameplaySwitches } = await imp('src/game/eligibility.js');
const { GameFlow } = await imp('src/game/flow.js');
const { LEVELS, levelUrl } = await imp('src/levels/index.js');
const { TitleScreen, StatsPanel } = await imp('src/ui/screens.js');

const errors = [];
console.error = (...a) => errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' '));
console.warn = (...a) => errors.push('WARN ' + a.map(String).join(' '));
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => {
  if (!c) {
    fails++;
    out('FAIL', m);
  } else out('ok  ', m);
};
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A localStorage-like store; `full` makes every write throw (a quota), `blocked` every call. */
function store({ full = false, blocked = false } = {}) {
  const m = new Map();
  return {
    m,
    full,
    blocked,
    getItem(k) {
      if (this.blocked) throw new Error('SecurityError');
      return m.has(k) ? m.get(k) : null;
    },
    setItem(k, v) {
      if (this.blocked) throw new Error('SecurityError');
      if (this.full) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem(k) {
      if (this.blocked) throw new Error('SecurityError');
      m.delete(k);
    },
  };
}

const SCENARIOS = {};

// ---------------------------------------------------------------- the grade at every boundary
SCENARIOS.grade = () => {
  out('\n== scenario GRADE (rank.js: clean play; time never changes a grade) ==');
  const H = 160;
  const g = (deaths, dmg, flasks = 0) => rankRun({ deaths, damageTaken: dmg, maxHp: H, flasksUsed: flasks });
  assert(g(0, 0).grade === 'S', 'no deaths, no damage: S');
  assert(g(0, 0.15 * H).grade === 'S', 'no deaths, exactly 15 % of max HP: S');
  assert(g(0, 0.15 * H + 1).grade === 'A', 'no deaths, a point past 15 %: A');
  assert(g(0, H * 3).grade === 'A', 'no deaths, any damage: A');
  assert(g(1, 0.5 * H).grade === 'A', 'one death and exactly 50 %: A');
  assert(g(1, 0.5 * H + 1).grade === 'B', 'one death and a point past 50 %: B');
  assert(g(1, 0).grade === 'A', 'one death, a clean winning attempt: A (never S)');
  assert(g(2, 0).grade === 'B' && g(3, 0).grade === 'B' && g(3, H).grade === 'B', 'two or three deaths: B');
  assert(g(4, 0).grade === 'C' && g(40, 0).grade === 'C', 'four deaths or more: C');
  const m0 = g(0, 0).marks, m1 = g(0, 5, 2).marks, m2 = g(1, 0).marks;
  assert(m0.join() === 'UNTOUCHED,DEATHLESS,NO FLASK', `an untouched run carries all three marks (${m0})`);
  assert(m1.join() === 'DEATHLESS', `hurt and two flasks: DEATHLESS only (${m1})`);
  assert(m2.join() === 'NO FLASK', `a death: neither UNTOUCHED nor DEATHLESS (${m2})`);
  // garbage in: never throws, never NaN
  const bad = rankRun({ deaths: NaN, damageTaken: undefined, maxHp: 0, flasksUsed: 'x' });
  assert(bad.grade === 'S' && Number.isFinite(bad.hurt), 'non-finite inputs read as zero (and a max HP of at least 1)');
  // the order: grade first, then the faster time
  assert(compareRank({ grade: 'A', timeMs: 10 }, { grade: 'S', timeMs: 99999 }) > 0, 'a faster A ranks below a slow S');
  assert(compareRank({ grade: 'S', timeMs: 100 }, { grade: 'S', timeMs: 200 }) < 0, 'within a grade the faster run ranks higher');
  assert(RANK.order.join('') === 'SABC' && RANK.grades.length === 4, 'the thresholds are data (rankTuning.js)');
  // a rush: the same rule on its totals (summed winning damage over summed max HP)
  const rush = rankRun({ deaths: 0, damageTaken: 8 * 0.14 * H, maxHp: 8 * H, flasksUsed: 0 });
  assert(rush.grade === 'S', 'a rush whose eight fights averaged 14 % of max HP and no deaths: S');
};

// ---------------------------------------------------------------- the store
SCENARIOS.store = () => {
  out('\n== scenario STORE (records.js: fresh, corrupt, full, blocked, version bump) ==');
  const rec = (o) => buildRecord({ kind: 'boss', level: 'ash', maxHp: 160, gameVersion: 't', ...o });
  // fresh
  const S = store();
  let R = new Records(S);
  assert(R.best('ash') === null && R.rushBest() === null && R.recent().length === 0, 'a fresh store holds nothing');
  const a = R.add(rec({ timeMs: 90000, deaths: 2 }));
  assert(a.newBestTime && a.newBestGrade && a.prevTime === null, 'the first clear is a best time and a best grade');
  const b = R.add(rec({ timeMs: 120000, deaths: 0 }));
  assert(!b.newBestTime && b.newBestGrade && b.prevGrade.grade === 'B', 'a slower S: a new best grade, not a new best time');
  const c = R.add(rec({ timeMs: 60000, deaths: 5 }));
  assert(c.newBestTime && !c.newBestGrade, 'a faster C: a new best time, not a new best grade');
  const best = new Records(S).best('ash');
  assert(best.clears === 3 && best.bestTime.timeMs === 60000 && best.bestGrade.grade === 'S' && best.bestGrade.timeMs === 120000, 'the two bests come from different runs and survive a reload');
  // the record's shape
  const r0 = R.recent()[0];
  const keys = ['v', 'id', 'kind', 'level', 'gameVersion', 'at', 'timeMs', 'deaths', 'damageTaken', 'maxHp', 'flasksUsed', 'grade', 'marks', 'stats', 'device', 'techniques', 'style', 'rush'];
  assert(keys.every((k) => k in r0) && r0.v === 1 && !('name' in r0), `a run record carries its fields and no player name (${Object.keys(r0).join(', ')})`);
  assert(JSON.parse(JSON.stringify(r0)).timeMs === r0.timeMs, 'a run record is plain JSON');
  const ids = new Set(R.recent().map((x) => x.id));
  assert(ids.size === 3, 'every run has its own id');
  // the queue keeps the last RECENT
  for (let i = 0; i < RECENT + 5; i++) R.add(rec({ timeMs: 70000 + i }));
  assert(R.recent().length === RECENT && R.recent()[RECENT - 1].timeMs === 70000 + RECENT + 4, `the queue keeps the last ${RECENT} records, the newest last`);
  // corrupt
  const C = store();
  C.m.set(RECORDS_KEY, '{nope');
  R = new Records(C);
  assert(R.best('ash') === null, 'a corrupt store reads as empty');
  R.add(rec({ timeMs: 1000 }));
  assert(JSON.parse(C.m.get(RECORDS_KEY)).levels.ash.clears === 1, '... and is written over cleanly');
  C.m.set(RECORDS_KEY, JSON.stringify({ v: 1, levels: { ash: { clears: 'x', bestTime: { timeMs: 'y' } } }, recent: [null, 4, { v: 1, id: 'k' }] }));
  R = new Records(C);
  assert(R.best('ash').clears === 0 && R.best('ash').bestTime === null && R.recent().length === 1, 'broken entries inside a valid store are dropped');
  // version bump: another version in the key starts over (a later version migrates from its own key)
  const V = store();
  V.m.set(RECORDS_KEY, JSON.stringify({ v: 99, levels: { ash: { clears: 4 } } }));
  assert(new Records(V).best('ash') === null, 'a store of another version is not read as this one');
  // full
  const F = store();
  R = new Records(F);
  F.full = true;
  let threw = false;
  try {
    R.add(rec({ timeMs: 5000 }));
  } catch {
    threw = true;
  }
  assert(!threw && R.best('ash').clears === 1 && R.saved === false, 'a full storage never throws: the run is kept for this page load');
  // blocked
  const B = store({ blocked: true });
  threw = false;
  try {
    R = new Records(B);
    R.add(rec({ timeMs: 5000 }));
    R.best('ash');
  } catch {
    threw = true;
  }
  assert(!threw && R.best('ash').clears === 1, 'a blocked storage never throws');
  R = new Records(null);
  R.add(rec({ timeMs: 5000 }));
  assert(R.best('ash').clears === 1, 'no storage at all: kept in memory');
  assert(formatTime(83456) === '1:23.45' && formatTime(599) === '0:00.59' && formatTime(NaN) === '--:--.--', 'times read to the hundredth');
};

// ---------------------------------------------------------------- the rush across page loads
SCENARIOS.rush = () => {
  out('\n== scenario RUSH (rush.js across simulated page loads: a death, a reload, a quit, the last boss) ==');
  const ss = store();
  const order = LEVELS.map((L) => L.id);
  const page = (id) => new Rush(ss, `?level=${id}&rush=1`);
  assert(Rush.start(ss, order, 'rush-1'), 'a rush starts over every level in LEVELS order');
  let R = page(order[0]);
  assert(R.active && R.level === order[0] && R.count === LEVELS.length, `the first page plays ${order[0]} of ${R.count}`);
  assert(!R.arrive(), 'a fresh page is no death');
  for (let i = 0; i < 600; i++) R.tick(1 / 60, true); // 10 s fighting
  R.death();
  for (let i = 0; i < 300; i++) R.tick(1 / 60, false); // the death screen and the walk: no time
  for (let i = 0; i < 300; i++) R.tick(1 / 60, true); // 5 s
  assert(Math.abs(R.levelMs - 15000) < 1, `the clock counts only the fights, every attempt (${R.levelMs.toFixed(0)} ms of 15000)`);
  assert(R.deaths === 1, 'the death is counted');
  const last0 = R.win({ damageTaken: 30, maxHp: 160, flasksUsed: 1, grade: 'A' });
  assert(!last0 && R.index === 1 && R.splits[0].timeMs === 15000 && R.splits[0].deaths === 1, 'a win banks the split (its time and deaths) and moves on');
  // page 2: a reload mid-fight
  R = page(order[1]);
  R.arrive();
  for (let i = 0; i < 120; i++) R.tick(1 / 60, true); // 2 s: banked at 1 s and again live
  R.bank(); // pagehide
  R = page(order[1]); // the reload
  assert(R.arrive() === true && R.deaths === 1, 'a reload mid-fight counts as a death');
  assert(Math.abs(R.levelMs - 2000) < 1, `... and keeps the time banked on pagehide (${R.levelMs.toFixed(0)} ms)`);
  assert(Math.abs(R.totalMs - 17000) < 1, `the rush's time is every fight's time (${R.totalMs.toFixed(0)} ms)`);
  // a reload with no pagehide (a crash): the last bank's time, still a death
  for (let i = 0; i < 150; i++) R.tick(1 / 60, true); // 2.5 s; banked once at 1 s and at 2 s
  R = page(order[1]);
  R.arrive();
  assert(R.deaths === 2 && R.levelMs >= 3900 && R.levelMs <= 4500, `a crash loses at most a second of the clock (${R.levelMs.toFixed(0)} ms banked)`);
  // a reload out of the fight is no death
  R.tick(1 / 60, false);
  R = page(order[1]);
  assert(!R.arrive() && R.deaths === 2, 'a reload outside the fight is no death');
  // a page outside the rush ends it
  const keep = ss.m.get(RUSH_KEY);
  const off = new Rush(ss, `?level=${order[1]}`);
  assert(!off.active && !ss.m.has(RUSH_KEY), 'a page without ?rush ends the rush');
  ss.m.set(RUSH_KEY, keep);
  // the quit
  R = page(order[1]);
  R.abandon();
  assert(!ss.m.has(RUSH_KEY) && !page(order[1]).active, 'quitting ends the rush, nothing kept');
  // all the way to the last
  Rush.start(ss, order, 'rush-2');
  let done = false;
  for (let k = 0; k < order.length; k++) {
    R = page(order[k]);
    R.arrive();
    for (let i = 0; i < 60; i++) R.tick(1 / 60, true);
    done = R.win({ damageTaken: 0, maxHp: 160, flasksUsed: 0, grade: 'S' });
    assert(done === (k === order.length - 1), `fight ${k + 1} / ${order.length}: ${done ? 'the last' : 'on to the next'}`);
  }
  assert(R.splits.length === order.length && Math.abs(R.totalMs - order.length * 1000) < 2, `the finished rush holds ${R.splits.length} splits, ${R.totalMs.toFixed(0)} ms`);
  assert(!page(order[0]).active && !ss.m.has(RUSH_KEY), 'a finished rush is not resumed by the next page');
  // a void sticks
  Rush.start(ss, order, 'rush-3');
  R = page(order[0]);
  R.void('lab');
  assert(page(order[0]).voided === 'lab', 'a void rush stays void on its next pages');
  R.abandon();
  // URLs
  const u = rushUrl('ash', 'http://x/?heroLook=robe');
  assert(isRushPage(new URL(u).search) && u.includes('level=ash') && u.includes('heroLook=robe'), `a rush page's URL keeps the other switches (${u})`);
  assert(!levelUrl('ash', u).includes('rush'), "a level's own URL drops ?rush");
  // no session storage at all: no rush, no throw
  assert(Rush.start(store({ blocked: true }), order, 'x') === null && !new Rush(null, '?rush=1').active, 'no session storage: no rush, no throw');
};

// ---------------------------------------------------------------- eligibility
SCENARIOS.eligible = () => {
  out('\n== scenario ELIGIBLE (eligibility.js: what voids a run) ==');
  assert(new Eligibility('').eligible, 'a plain page counts');
  assert(new Eligibility('?level=ash&heroLook=robe&sfx=old&life=off&kindle=b&chip=0&touch').eligible, 'look switches, sounds, the living world and the device do not void a run');
  assert(new Eligibility('?perfect=sharp&cutStop=0&streakfx=all&wyrmLook=c').eligible, 'a gameplay switch at its shipped value does not void');
  for (const q of ['?stage=lab', '?tech=draw', '?tech=none', '?lab', '?cutStop=1', '?ring=b', '?perfect=cinema', '?streakfx=off', '?looks=old', '?apoc=c', '?outskirts=0']) {
    const E = new Eligibility(q);
    assert(!E.eligible && /NOT RECORDED/.test(E.note()), `${q} voids the run: "${E.note()}"`);
  }
  assert(gameplaySwitches('?ring=a&bamboo=b').map((x) => x[0]).join() === 'bamboo', 'only the switches away from the shipped value are listed');
  const E = new Eligibility('');
  const game = { player: { debug: { god: false, infiniteFlasks: false, attackSpeed: 1 } }, debugTimeScale: 1, lab: { open: false }, dragon: { debug: { aiEnabled: true } } };
  E.watch(game);
  assert(E.eligible, 'a game as it ships passes the watch');
  for (const [what, set, undo] of [
    ['god mode', () => (game.player.debug.god = true), () => (game.player.debug.god = false)],
    ['endless flasks', () => (game.player.debug.infiniteFlasks = true), () => (game.player.debug.infiniteFlasks = false)],
    ['the attack speed', () => (game.player.debug.attackSpeed = 1.5), () => (game.player.debug.attackSpeed = 1)],
    ['the time scale', () => (game.debugTimeScale = 0.25), () => (game.debugTimeScale = 1)],
    ['the Lab open', () => (game.lab.open = true), () => (game.lab.open = false)],
    ["the boss's AI off", () => (game.dragon.debug.aiEnabled = false), () => (game.dragon.debug.aiEnabled = true)],
  ]) {
    const e = new Eligibility('');
    set();
    e.watch(game);
    undo();
    e.watch(game);
    assert(!e.eligible, `${what}, even for a frame, voids the run (${e.note()})`);
  }
};

// ---------------------------------------------------------------- the flow: a real victory writes one record
function buildGame({ search = '', rush = null, lab = false, ls = store() } = {}) {
  resetWindow();
  Math.random = mulberry32(77);
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, CONFIG.camera.near, CONFIG.camera.far);
  const pressed = new Set();
  const input = {
    enabled: true, anyPressed: false, wheel: 0, mouse: { ndcX: 0, ndcY: 0 }, pressedKeys: pressed,
    pressed: (c) => pressed.has(c), down: () => false, mousePressed: () => false, actPressed: (a) => pressed.has(`@${a}`),
    endFrame() { pressed.clear(); this.anyPressed = false; },
  };
  const calls = { stats: [], title: 0, logs: [] };
  const hud = {
    showStats: (rows, head) => calls.stats.push({ rows, head }), showTitle: () => calls.title++, hideTitle() {},
    banner() {}, bannerHint() {}, bannerRecap() {}, clearBanner() {}, prompt: (t) => (calls.prompt = t), log: (t) => calls.logs.push(t),
    showBossBar() {}, hideBossBar() {}, showPause() {},
  };
  const player = { position: new THREE.Vector3(0, 0, 20), hp: 160, maxHp: 160, flasks: 5, maxFlasks: 5, alive: true, state: 'idle', debug: { god: false, infiniteFlasks: false, attackSpeed: 1 }, respawn(x, z) { this.position.set(x, 0, z); this.hp = this.maxHp; this.alive = true; this.state = 'idle'; } };
  const dragon = { state: 'combat', position: new THREE.Vector3(0, 0, 0), hp: 100, maxHp: 100, hurtSpheres: [], debug: { aiEnabled: true }, reset() {}, lockPoint(o) { return o.set(0, 0, 0); } };
  const game = {
    THREE, CONFIG, level: LEVELS[1], levels: LEVELS.map((L) => ({ id: L.id, name: L.name })), pickLevel: (id) => (calls.picked = id),
    camera, events: new Events(), input, cameraRig: new CameraRig(camera), hud, player, dragon, boss: dragon,
    pipeline: { finalMat: { uniforms: { uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 1 } } } },
    time: 0, realTime: 0, timeScale: 1, debugTimeScale: 1, state: 'title', settings: { quality: CONFIG.defaultQuality },
    records: new Records(ls), eligibility: new Eligibility(search), rush, unlocks: { all: () => ['oneBreath'] },
    lab: { open: lab }, fx: {}, world: {},
  };
  const saved = [];
  game.events.on('game:record', (d) => saved.push(d));
  game.flow = new GameFlow(game);
  const tick = (sec, step) => {
    for (let i = 0, n = Math.round(sec * 60); i < n; i++) {
      step?.();
      game.realTime += 1 / 60;
      game.flow.update(1 / 60, 1 / 60);
      input.endFrame();
    }
  };
  return { game, input, calls, saved, tick, ls };
}

/** Title → fight (the flow's own path: a key dismisses the title, the boss's fight starts it) → a win. */
function playWin(G, { fight = 30, hurt = 0, die = false } = {}) {
  const { game, input, tick } = G;
  if (game.state === 'title') {
    tick(0.7);
    input.pressedKeys.add('KeyJ');
    tick(1 / 60);
  }
  tick(0.6); // explore: the boss already fighting → the boss state
  if (die) {
    tick(5);
    game.player.alive = false;
    tick(1 / 60);
    tick(5);
    input.pressedKeys.add('KeyJ'); // rise again
    tick(1 / 60);
    tick(4);
    game.player.alive = true;
    tick(0.7);
  }
  if (hurt) game.events.emit('player:hurt', { damage: hurt, kind: 'blade', hp: game.player.hp - hurt });
  tick(fight);
  game.events.emit('dragon:dead');
  tick(3);
}

SCENARIOS.flow = () => {
  out('\n== scenario FLOW (the real GameFlow: a win writes one eligible record; a touched run none) ==');
  let G = buildGame();
  playWin(G, { fight: 30, hurt: 20 });
  const recs = G.game.records.recent();
  assert(G.game.state === 'victory', `the run reaches the victory (${G.game.state})`);
  assert(recs.length === 1 && G.saved.length === 1, `a real victory writes ONE record and emits game:record once (${recs.length}, ${G.saved.length})`);
  const r = recs[0];
  assert(r && r.kind === 'boss' && r.level === LEVELS[1].id && Math.abs(r.timeMs - 30000) < 100, `its time is the fight's real time in the boss state (${r?.timeMs} ms)`);
  assert(r && r.grade === 'S' && r.damageTaken === 20 && r.maxHp === 160 && r.deaths === 0, `20 of 160 HP and no deaths: S (${r?.grade})`);
  assert(r && r.techniques.includes('oneBreath') && r.device === 'keyboard', 'it carries the learned techniques and the device');
  const H = G.calls.stats.at(-1)?.head;
  assert(H?.grade === 'S' && H.time === formatTime(r.timeMs) && H.first && !H.note, `the record screen shows the grade, the time and FIRST CLEAR (${JSON.stringify(H)})`);
  // a pause does not count
  G = buildGame();
  {
    const { game, input, tick } = G;
    tick(0.7);
    input.pressedKeys.add('KeyJ');
    tick(1 / 60);
    tick(0.6);
    tick(10);
    game.flow.pause(true);
    tick(20);
    game.flow.pause(false);
    tick(10);
    game.events.emit('dragon:dead');
    tick(3);
    const t = game.records.recent()[0]?.timeMs;
    assert(Math.abs(t - 20000) < 100, `a pause does not count (${t} ms for 10 + 10 s around a 20 s pause)`);
  }
  // a death: the winning attempt's figures, the run's deaths
  G = buildGame();
  playWin(G, { fight: 12, die: true });
  const d = G.game.records.recent()[0];
  const at = G.game.flow.stats.attemptTime * 1000, all = G.game.flow.stats.bossTime * 1000;
  assert(d && d.deaths === 1 && d.grade === 'A' && Math.abs(d.timeMs - at) < 20 && d.timeMs < all - 4000, `one death then a clean win: A, only the winning attempt's time (${d?.grade}, ${d?.timeMs} of ${all.toFixed(0)} ms in the boss state)`);
  // a second, faster win: NEW BEST, the best before beside it
  G = buildGame({ ls: G.ls });
  playWin(G, { fight: 8 });
  const H2 = G.calls.stats.at(-1)?.head;
  assert(H2?.newBestTime && /^A 0:1[0-9][.][0-9][0-9]$/.test(H2.prev ?? ''), `a faster win shows NEW BEST and the best before (${H2?.prev})`);
  // the Lab touched: no record
  G = buildGame({ lab: true });
  playWin(G, { fight: 20 });
  const H3 = G.calls.stats.at(-1)?.head;
  assert(G.game.records.recent().length === 0 && G.saved.length === 0, 'a run with the Lab open writes no record');
  assert(/NOT RECORDED/.test(H3?.note ?? ''), `... and the record screen says so: "${H3?.note}"`);
  G = buildGame();
  G.tick(0.2);
  G.game.flow.debug.toState('victory');
  G.tick(3);
  assert(G.game.records.recent().length === 0 && G.saved.length === 0, "the Lab's jump to victory writes no record");
  G = buildGame({ search: '?tech=draw' });
  playWin(G, { fight: 5 });
  assert(G.game.records.recent().length === 0, '?tech= writes no record');
  G = buildGame();
  G.game.player.debug.god = true;
  playWin(G, { fight: 5 });
  assert(G.game.records.recent().length === 0, 'god mode writes no record');

  // the rush: one fight's page
  const ss = store();
  const order = LEVELS.map((L) => L.id);
  Rush.start(ss, order, 'rush-f');
  // (page 1 is won, page 2 is this one)
  let R = new Rush(ss, '?rush=1');
  R.arrive();
  for (let i = 0; i < 300; i++) R.tick(1 / 60, true);
  R.win({ damageTaken: 0, maxHp: 160, flasksUsed: 0, grade: 'S', eligible: true });
  R = new Rush(ss, '?rush=1');
  G = buildGame({ rush: R });
  assert(G.calls.title === 0, 'a rush page does not show the title');
  playWin(G, { fight: 20 });
  const V = G.game.flow.recordView;
  assert(V?.rush && V.rush.index === 2 && !V.rush.last && Math.abs(V.rush.totalMs - 5000 - G.game.flow.stats.bossTime * 1000) < 20, `the fight's record carries the rush's split and time (${V?.rush?.index}, ${V?.rush?.totalMs})`);
  assert(/Next boss/.test(G.calls.prompt ?? ''), `the record screen offers the next boss (${G.calls.prompt})`);
  assert(G.game.records.recent().length === 1 && G.game.records.recent()[0].rush === 'rush-f', "a rush's fight is also that boss's clear");
  // the rush's last fight → the rush record
  const st = JSON.parse(ss.m.get(RUSH_KEY));
  st.index = order.length - 1;
  st.splits = order.slice(0, -1).map((id) => ({ level: id, timeMs: 10000, deaths: 0, damageTaken: 0, maxHp: 160, flasksUsed: 0, grade: 'S', eligible: true }));
  ss.m.set(RUSH_KEY, JSON.stringify(st));
  G = buildGame({ rush: new Rush(ss, '?rush=1') });
  playWin(G, { fight: 10 });
  const RR = G.game.flow.recordView?.rush;
  const rushRec = G.game.records.recent().find((x) => x.kind === 'rush');
  assert(RR?.last && rushRec && rushRec.splits.length === order.length && Math.abs(rushRec.timeMs - (order.length - 1) * 10000 - G.game.flow.stats.bossTime * 1000) < 20, `after the last fight the rush's record is stored (${rushRec?.timeMs} ms, ${rushRec?.splits?.length} splits)`);
  assert(rushRec?.grade === 'S' && G.game.records.rushBest()?.bestTime, `the rush's grade comes from its totals (${rushRec?.grade}) and it is the rush's best`);
  assert(G.calls.stats.at(-1)?.head?.title === 'BOSS RUSH' && /title/.test(G.calls.prompt ?? ''), 'the record screen shows the rush record, then back to the title');
  G.input.pressedKeys.add('@interact');
  G.tick(1 / 60);
  assert(G.calls.picked === order[0] && !ss.m.has(RUSH_KEY), `the press ends the rush and loads the title (${G.calls.picked})`);
  // a void rush stores no rush record
  Rush.start(ss, order, 'rush-v');
  const sv = JSON.parse(ss.m.get(RUSH_KEY));
  sv.index = order.length - 1;
  sv.void = 'lab';
  sv.splits = st.splits;
  ss.m.set(RUSH_KEY, JSON.stringify(sv));
  G = buildGame({ rush: new Rush(ss, '?rush=1') });
  playWin(G, { fight: 10 });
  assert(G.game.records.recent().length === 0 && G.game.flow.recordView?.rush?.eligible === false, 'a rush the Lab touched on any page stores nothing');
  // the quit
  Rush.start(ss, order, 'rush-q');
  G = buildGame({ rush: new Rush(ss, '?rush=1') });
  G.tick(2);
  G.game.flow.pause(true);
  G.game.flow.quitToTitle();
  assert(!ss.m.has(RUSH_KEY) && G.game.records.recent().length === 0, 'quitting from the pause menu ends the rush with no record');
};

// ---------------------------------------------------------------- the screens: the title's bests, the grade
SCENARIOS.screens = async () => {
  out('\n== scenario SCREENS (the title shows each best and the rush; the record shows the grade) ==');
  const text = (n) => n.textContent;
  for (const look of ['a', 'b', 'c']) {
    ui.children.length = 0;
    const best = { ash: { grade: 'S', marks: ['DEATHLESS'], timeMs: 83456, clears: 2 }, rush: { grade: 'B', marks: [], timeMs: 1234567, clears: 1 } };
    let started = 0;
    const stage = { levels: LEVELS.map((L) => ({ id: L.id, name: L.name })), current: 'cinderwood', pick() {} };
    // (the option is read from the URL through lookOf; the tests set it live)
    const { setLook } = globalThis.__lookMod;
    setLook('recLook', look);
    const T = new TitleScreen(ui, true, stage, null, { bestFor: (id) => best[id] ?? null, startRush: () => started++ });
    const ashB = T.stageButtons.find((b) => b.dataset.level === 'ash');
    const rushB = T.stageButtons.find((b) => b.dataset.level === 'rush');
    assert(T.stageButtons.length === LEVELS.length + 1 && rushB, `look ${look}: every level and BOSS RUSH are pad-walkable buttons (${T.stageButtons.length})`);
    if (look === 'c') {
      T._share('ash');
      assert(/S/.test(text(T.sharedEl)) && text(T.sharedEl).includes('1:23.45'), `look c: the shared line shows the hovered stage's best (${text(T.sharedEl)})`);
      T._share('city');
      assert(/not yet beaten/.test(text(T.sharedEl)), 'look c: an unbeaten stage says so');
    } else {
      assert(text(ashB).includes('S') && text(ashB).includes('1:23.45'), `look ${look}: a beaten level shows its grade and best time (${text(ashB)})`);
      const halB = T.stageButtons.find((b) => b.dataset.level === 'city');
      assert(!/\d:\d\d/.test(text(halB)), `look ${look}: an unbeaten level shows no time (${text(halB).trim()})`);
    }
    rushB.click();
    assert(started === 1, `look ${look}: BOSS RUSH starts the rush`);
    setLook('recLook', null);
  }
  for (const look of ['a', 'b', 'c']) {
    const P = new StatsPanel(ui, look);
    P.show([['Fight time', '01:23']], { title: null, grade: 'A', marks: ['DEATHLESS', 'NO FLASK'], time: '1:23.45', newBestTime: true, prev: 'B 1:40.00', note: null });
    const t = text(P.root);
    assert(t.includes('█') || t.includes('#'), `grade look ${look}: the grade in block letters`);
    assert(t.includes('1:23.45') && t.includes('NEW BEST') && t.includes('DEATHLESS') && t.includes('B 1:40.00') && t.includes('Fight time'), `grade look ${look}: the time, NEW BEST, the marks, the best before and today's rows`);
  }
  // the owner's picks (2026-11-24) ship with no parameter: the grade a, the title b
  const { gradeLookNow, recLookNow } = await imp('src/ui/recordLooks.js');
  assert(gradeLookNow() === 'a' && recLookNow() === 'b', `the shipped looks are the owner's picks: grade ${gradeLookNow()}, title ${recLookNow()}`);
  const T0 = new TitleScreen(ui, true, { levels: LEVELS.map((L) => ({ id: L.id, name: L.name })), current: 'cinderwood', pick() {} }, null, { bestFor: (id) => (id === 'ash' ? { grade: 'S', marks: [], timeMs: 83456, clears: 1 } : null), startRush() {} });
  const ash0 = T0.stageButtons.find((b) => b.dataset.level === 'ash');
  assert(T0.recLook === 'b' && ash0.find((n) => n.classList?.contains('ab-stage-grade')) && text(ash0).includes('1:23.45'), `with no parameter the title draws look b: the grade in the button (${text(ash0)})`);
  // the record panel's overflow (2026-11-24, the owner's report: "Total time", "Flasks used" outside
  // the border at 852 x 393 and on narrower desktops; measured in a browser, 5 - 31 px out): its cause
  // was a panel at left: 50% (a box there may only grow to half the screen) whose two columns did not
  // fit. Layout cannot be measured headless, so this guards the fix's rule itself: the panel with a
  // grade is centred by margins at its rows' width (at most the screen's), and a label that does not
  // fit is cut with an ellipsis. (The browser check, every row inside the border at 1280 x 720,
  // 1024 x 640, 1600 x 900, 852 x 393 and 393 x 852 for every grade look: ADR-179.)
  const css = fs.readFileSync(`${ROOT}/src/ui/hudStyle.js`, 'utf8');
  const rule = (sel) => (css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm')) ?? [])[1] ?? '';
  const head = rule('.ab-stats.has-head');
  assert(/left: 0;/.test(head) && /transform: none;/.test(head) && /width: max-content;/.test(head) && /max-width: 94vw;/.test(head), `the record panel with a grade is centred by margins at its rows' width, at most the screen's (${head.trim().slice(0, 90)}...)`);
  assert(/minmax\(0, auto\)/.test(rule('.ab-stats.has-head .ab-stats-body')) && /text-overflow: ellipsis;/.test(rule('.ab-stats.has-head .row .k')), "its columns may shrink and a label that does not fit is cut short, never drawn past the border");
};

// ---------------------------------------------------------------- the title's new layouts (?menu=a|b|c)
SCENARIOS.menus = async () => {
  out('\n== scenario MENUS (?menu=a|b|c: every world, its keeper and best; pick, travel, begin, keys) ==');
  const { fireWin } = await import('./shim.mjs');
  const { setLook } = globalThis.__lookMod;
  const text = (n) => n.textContent;
  const levels = LEVELS.map((L) => ({ id: L.id, name: L.name, sub: L.sub, boss: L.boss }));
  assert(LEVELS.every((L) => typeof L.boss === 'string' && L.boss.includes(',') && typeof L.sub === 'string'), 'every level names its boss ("NAME, THE EPITHET") and its line (levels/*.js)');
  const best = { ash: { grade: 'S', marks: ['DEATHLESS'], timeMs: 83456, clears: 2 }, rush: { grade: 'B', marks: [], timeMs: 1234567, clears: 1 } };
  for (const look of ['a', 'b', 'c']) {
    ui.children.length = 0;
    resetWindow();
    setLook('menu', look);
    const picked = [], begun = [];
    let rushes = 0, opened = 0;
    const stage = { levels, current: 'cinderwood', pick: (id) => picked.push(id), begin: () => begun.push(1) };
    const news = { open: () => opened++, unseenCount: () => 2, onChange() {}, on: false };
    const T = new TitleScreen(ui, true, stage, news, { bestFor: (id) => best[id] ?? null, startRush: () => rushes++ });
    assert(T.menuLook === look && T.menu, `look ${look}: the new layout is built`);
    assert(T.stageButtons.length === LEVELS.length + 1 && T.navButtons.length === LEVELS.length + 3, `look ${look}: every world, BOSS RUSH, WHAT'S NEW and CONTROLS are walkable (${T.navButtons.length})`);
    const ash = T.navButtons.find((b) => b.dataset.level === 'ash');
    const city = T.navButtons.find((b) => b.dataset.level === 'city');
    const gradeOf = (b) => text(b.find((n) => n.classList?.contains('gm-g')) ?? { textContent: '?' });
    assert(gradeOf(ash) === 'S' && gradeOf(city) === '', `look ${look}: a beaten world shows its grade, an unbeaten one none (${gradeOf(ash)}|${gradeOf(city)})`);
    // the detail of the selection: the keeper's name and epithet, the line, the best
    T.menu.select('ash');
    const d = text(T.menu.detail);
    assert(d.includes('Shen Hui') && d.includes('the Ash Disciple') && d.includes('1:23.45') && /TRAVEL/.test(d), `look ${look}: the detail names the keeper and the best (${d.slice(0, 90)})`);
    // a tap on another world selects it; a second (or a click on the selected one) travels
    city.click();
    assert(picked.length === 0 && T.menu.sel === 'city', `look ${look}: the first tap on another world selects it`);
    city.click();
    assert(picked[0] === 'city', `look ${look}: the second travels there`);
    const here = T.navButtons.find((b) => b.dataset.level === 'cinderwood');
    T.menu.select('cinderwood');
    here.click();
    assert(begun.length === 1 && picked.length === 1, `look ${look}: the current world begins, never reloads`);
    T.menu.select('rush');
    T.navButtons.find((b) => b.dataset.level === 'rush').click();
    assert(rushes === 1, `look ${look}: BOSS RUSH starts the rush`);
    T.navButtons.find((b) => b.dataset.level === 'news').click();
    assert(opened === 1, `look ${look}: WHAT'S NEW opens the panel`);
    T.navButtons.find((b) => b.dataset.level === 'ctrl').click();
    assert(T.holdsStart() && text(T.menu.drawerEl).includes('ATTACK TELLS'), `look ${look}: CONTROLS opens the full list (and holds the start)`);
    fireWin('keydown', { code: 'Escape' });
    assert(!T.holdsStart(), `look ${look}: Escape closes it`);
    // the arrow keys walk and are not a "press any key"; Enter on the selection acts
    T.menu.select('cinderwood');
    fireWin('keydown', { code: 'ArrowDown' });
    assert(T.eatsKey('ArrowDown') && T.menu.sel === 'ash', `look ${look}: an arrow walks to the next world (${T.menu.sel}) and is eaten`);
    fireWin('keydown', { code: 'Enter' });
    assert(T.eatsKey('Enter') && picked[1] === 'ash', `look ${look}: Enter on another world travels`);
    T.update(0.1);
    assert(!T.eatsKey('ArrowDown'), `look ${look}: the eaten keys last one frame`);
    T.menu.select('cinderwood');
    fireWin('keydown', { code: 'Enter' });
    assert(!T.eatsKey('Enter'), `look ${look}: Enter on the current world is a "press any key" (it begins)`);
    for (let i = 0; i < 4; i++) T.update(0.25); // the fires step without throwing
    setLook('menu', null);
  }
  // ?menu=0: the title as before (no parameter: the owner's pick, c)
  ui.children.length = 0;
  setLook('menu', '0');
  const T0 = new TitleScreen(ui, true, { levels, current: 'cinderwood', pick() {} }, null, { bestFor: () => null, startRush() {} });
  assert(!T0.menu && !T0.navButtons && T0.stageButtons.length === LEVELS.length + 1, 'with ?menu=0 the title is the old one');
  setLook('menu', null);
  ui.children.length = 0;
  const T1 = new TitleScreen(ui, true, { levels, current: 'cinderwood', pick() {} }, null, { bestFor: () => null, startRush() {} });
  assert(T1.menuLook === 'c' && T1.menu, 'with no parameter the title is the sword's path (c, the owner's pick)');
};

globalThis.__lookMod = await imp('src/entities/enemies/duelist/lookSwitch.js');
const WANT = SCEN === 'all' ? Object.keys(SCENARIOS) : SCEN.split(',');
for (const name of WANT) {
  if (!SCENARIOS[name]) {
    out(`unknown scenario '${name}' (${Object.keys(SCENARIOS).join(' | ')} | all)`);
    process.exit(2);
  }
  await SCENARIOS[name]();
}
const uniq = [...new Set(errors)];
out(`\nconsole errors/warnings: ${errors.length} (${uniq.length} unique)`);
for (const e of uniq.slice(0, 20)) out('  ', e.slice(0, 400));
out(fails ? `\n${fails} FAILED` : '\nRECORDS: ALL PASSED');
process.exit(fails || uniq.length ? 1 : 0);
