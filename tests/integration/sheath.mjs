// The Windless Grove and Lu Wusheng, the Sheathed, headless (ADR-144 - ADR-146): the REAL Player,
// Sheathed, Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles, FireField, CameraRig,
// Events) wired like src/main.js for `?level=grove`; the world is a light mock on the real Colliders, or
// (`real`) the set built anew with its breakables. A bot drives the input. Modelled on asc.mjs.
// usage: node sheath.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI; ABYSS_PSEEDS /
//   ABYSS_PSECS for PACE; ABYSS_TUNE='{...}' deep-merges into TUNING)
//   scenario: level | rules | draw | honor | sheath | world | phases | late | pace | win | strategy | reward | all
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ui, AUDIO, resetWindow } from './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { CONFIG } = await imp('src/core/config.js');
const { Events } = await imp('src/core/events.js');
const { CameraRig } = await imp('src/core/cameraRig.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { LightPool } = await imp('src/render/lights.js');
const { GlyphParticles } = await imp('src/render/particles.js');
const { FireField } = await imp('src/render/fireField.js');
const { Colliders } = await imp('src/world/colliders.js');
const { TELL, RESULT } = await imp('src/combat/rules.js');
const { LEVELS, getLevel, levelFromSearch, applyLevel } = await imp('src/levels/index.js');
const { createWindlessGrove, GROVE } = await imp('src/world/windlessGrove.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { Sheathed } = await imp('src/entities/enemies/sheathed/sheathed.js');
const { MOVES, MOVE_NAMES, realise } = await imp('src/entities/enemies/sheathed/moves.js');
const { TUNING } = await imp('src/entities/enemies/sheathed/tuning.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

if (process.env.ABYSS_TUNE) {
  const merge = (o, v) => { for (const [k, x] of Object.entries(v)) { if (x && typeof x === 'object' && !Array.isArray(x) && o[k] && typeof o[k] === 'object') merge(o[k], x); else o[k] = x; } };
  merge(TUNING, JSON.parse(process.env.ABYSS_TUNE));
}
const LVL = getLevel('grove');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 4242);
const DT = 1 / 60;
const NPH = TUNING.phaseAt.length;
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
const flat = (n) => MOVES[n].beats.flatMap((b) => (Array.isArray(b.pick) ? b.pick : [b]));
/** The phases a move is used in (its weight; a counter or a manual move: its own phase on; a transition: the phase before it). */
const phasesOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase - 1];
  if (def.counter || def.manual) return [1, 2, 3].filter((f) => f >= def.phase);
  return [1, 2, 3].filter((f) => weightIn(def, f) > 0);
};

const CATALOGUE = (() => {
  const md = fs.readFileSync(`${ROOT}/docs/ARCHITECTURE.md`, 'utf8');
  const sec = md.split(/^## /m).find((s) => s.startsWith('Event catalogue')) ?? '';
  const names = new Set();
  for (const m of sec.matchAll(/`([a-zA-Z]+(?::[a-zA-Z0-9]+)?)[ `]/g)) names.add(m[1]);
  return names;
})();
const EMITTED = new Set();

applyLevel(LVL);
const SET = (() => {
  const c = new Colliders();
  const set = createWindlessGrove(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

function build(seed = SEED, real = false) {
  resetWindow();
  Math.random = mulberry32(seed);
  ui.children.forEach((c) => (c.parentNode = null));
  ui.children.length = 0;
  const U = createSharedUniforms();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, CONFIG.camera.near, CONFIG.camera.far);
  const keys = new Set(), pk = new Set(), rk = new Set(), tapKeys = new Set();
  const btn = [false, false, false], pb = [false, false, false], rb = [false, false, false], tapBtn = [false, false, false];
  const input = {
    enabled: true, anyPressed: false, wheel: 0, mouse: { ndcX: 0, ndcY: 0 },
    keys, pressedKeys: pk, releasedKeys: rk, buttons: btn, pressedButtons: pb, releasedButtons: rb, axis: { x: 0, y: 0 },
    down(c) { return this.enabled && keys.has(c); }, pressed(c) { return this.enabled && pk.has(c); }, released(c) { return this.enabled && rk.has(c); },
    mouseDown(b) { return this.enabled && btn[b]; }, mousePressed(b) { return this.enabled && pb[b]; }, mouseReleased(b) { return this.enabled && rb[b]; },
    moveAxis() { return this.enabled ? this.axis : { x: 0, y: 0 }; },
    tap(code) { if (keys.has(code)) return; keys.add(code); pk.add(code); tapKeys.add(code); this.anyPressed = true; },
    hold(code) { if (keys.has(code)) return; keys.add(code); pk.add(code); this.anyPressed = true; },
    release(code) { if (!keys.delete(code)) return; rk.add(code); },
    press(b) { if (btn[b]) return; btn[b] = true; pb[b] = true; this.anyPressed = true; },
    click(b = 0) { if (btn[b]) return; btn[b] = true; pb[b] = true; tapBtn[b] = true; this.anyPressed = true; },
    up(b) { if (!btn[b]) return; btn[b] = false; rb[b] = true; },
    endFrame() {
      pk.clear(); rk.clear(); pb.fill(false); rb.fill(false);
      for (const c of tapKeys) { keys.delete(c); rk.add(c); }
      tapKeys.clear();
      for (let b = 0; b < 3; b++) if (tapBtn[b]) { tapBtn[b] = false; btn[b] = false; rb[b] = true; }
      this.anyPressed = false; this.wheel = 0;
    },
  };
  installActions(input, new Bindings(null));
  const colliders = new Colliders();
  const set = real ? createWindlessGrove(U, colliders) : null;
  if (!set) for (const k of SET.circles) colliders.add(k.x, k.z, k.r, k.tag);
  const counters = { spawns: 0, flares: 0, burns: 0 };
  const world = {
    colliders, bonfire: { ...CONFIG.world.bonfire }, nest: { x: 0, z: 0 },
    forest: { treeSpots: [], bonfire: { ...CONFIG.world.bonfire }, ambience: { update() {}, flare() { counters.flares++; } } },
    setGrassQuality() {}, resolve: (pos, r, b) => colliders.resolve(pos, r, b),
    setPusher(slot, x, y, z, r) { if (![x, y, z, r].every(Number.isFinite)) throw new Error(`NaN pusher ${slot}`); },
    clearPushers() {}, gust(x, z, s, r) { if (![x, z, s, r].every(Number.isFinite)) throw new Error('NaN gust'); },
    scorch: { burnCircle(x, z, r) { if (![x, z, r].every(Number.isFinite)) throw new Error('NaN scorch'); counters.burns++; }, reset() {}, heatAt: () => 0, burnAt: () => 0 },
    atmosphere: { bonfireLit: true, setBonfireLit(v) { this.bonfireLit = !!v; } }, update() {},
  };
  const mk = (Cls, opts, keysToCheck) => {
    const p = new Cls(U, opts);
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of keysToCheck) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN spawn ${k}`);
      counters.spawns++;
      return spawn(o);
    };
    return p;
  };
  const PK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'rot', 'stretch'];
  const game = {
    THREE, CONFIG, level: LVL, levels: LEVELS.map((L) => ({ id: L.id, name: L.name })), pickLevel() {},
    renderer: null, scene, fxScene: new THREE.Scene(), camera, pipeline: { finalMat: { uniforms: { uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 1 } } } }, U,
    events: new Events(), input, cameraRig: new CameraRig(camera), lights: new LightPool(U),
    fx: { alpha: mk(GlyphParticles, { max: 3000, additive: false }, PK), add: mk(GlyphParticles, { max: 7000, additive: true }, PK), fire: mk(FireField, { max: 6000 }, ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'sizeEnd', 'heat', 'heatEnd']) },
    time: 0, realTime: 0, timeScale: 1, debugTimeScale: 1, hitstopTimer: 0, hitstopScale: 1,
    mouseGround: new THREE.Vector3(), state: 'title', settings: { quality: CONFIG.defaultQuality, showFps: false },
    hitstop(seconds, scale = 0.04) { this.hitstopTimer = Math.max(this.hitstopTimer, seconds); this.hitstopScale = Math.min(this.hitstopScale, scale); },
    shake(a) { if (!Number.isFinite(a)) throw new Error('NaN shake'); this.cameraRig.addTrauma(a); },
    punch(m) { if (!Number.isFinite(m)) throw new Error('NaN punch'); this.cameraRig.punch(m); },
    kick(x, y, z, m) { if (!Number.isFinite(x + y + z + m)) throw new Error('NaN kick'); this.cameraRig.kick(x, y, z, m); },
  };
  const G = { game, input, counts: {}, counters, watch: null, hits: [], payload: new Set(), set };
  const emit = game.events.emit.bind(game.events);
  game.events.emit = (n, d) => {
    G.counts[n] = (G.counts[n] || 0) + 1;
    EMITTED.add(n);
    if (n.startsWith('combat:') || n.startsWith('dragon:')) for (const [k, v] of Object.entries(d ?? {})) if (typeof v === 'number' && !Number.isFinite(v)) G.payload.add(`${n}.${k}`);
    G.watch?.(n, d);
    G.defend?.onEvent(n, d);
    emit(n, d);
  };
  game.world = world;
  if (set) {
    world.forest = set;
    world.scars = new Scars(game, set.scarInk);
    world.destructibles = new Destructibles(game, world, set);
    world.impact = (x, z, r, power, o) => world.destructibles.strike(x, z, r, power, { kind: 'blunt', by: 'world', ...(o ?? {}) });
    world.restore = () => { world.destructibles.reset(); world.scars.reset(); };
    world.update = (dt) => { world.destructibles.update(dt); world.scars.update?.(dt); };
  }
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  const R0 = Math.random;
  Math.random = mulberry32(seed + 0x5eed);
  game.dragon = LVL.createBoss(game);
  Math.random = R0;
  game.boss = game.dragon;
  game.hud = new Hud(game);
  game.touch = new TouchControls(game);
  game.flow = new GameFlow(game);
  game.lab = new Lab(game);
  game.applyQuality = () => {};
  const takeHit = game.player.takeHit.bind(game.player);
  game.player.takeHit = (h) => {
    const hp0 = game.player.hp;
    const r = takeHit(h);
    G.hits.push({ t: game.time, r, attack: h?.attack, tell: h?.tell, damage: h?.damage, kind: h?.kind, lost: hp0 - game.player.hp, breaks: !!h?.breaksGuard });
    return r;
  };
  game.cameraRig.snap(game.player.position);
  G.tick = (realDt) => {
    let scale = game.timeScale;
    if (game.hitstopTimer > 0) { game.hitstopTimer -= realDt; scale *= game.hitstopScale; if (game.hitstopTimer <= 0) game.hitstopScale = 1; }
    const dt = realDt * scale * (game.debugTimeScale ?? 1);
    game.realTime += realDt;
    game.time += dt;
    game.dt = dt;
    game.realDt = realDt;
    if (AUDIO.ctx) AUDIO.ctx.currentTime += realDt;
    game.touch.update(realDt);
    game.lab.update(realDt);
    game.flow.update(dt, realDt);
    game.player.update(dt);
    game.dragon.update(dt);
    game.world.update(dt);
    game.cameraRig.update(realDt, game.player.position);
    game.lights.update(dt, game.player.position);
    game.fx.alpha.update(dt, game.time);
    game.fx.add.update(dt, game.time);
    game.fx.fire.update(dt);
    game.hud.update(realDt);
    game.audio.update(realDt);
    game.input.endFrame();
    const p = game.player, d = game.dragon;
    if (![p.position.x, p.position.z, p.hp, p.yaw].every(Number.isFinite)) throw new Error('player NaN');
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('sheathed NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x, d._mouth.x, d._mouth.y].every(Number.isFinite)) throw new Error('sheathed blade NaN');
    for (const h of d.hurtSpheres) if (![h.x, h.y, h.z, h.r].every(Number.isFinite)) throw new Error('hurtSphere NaN');
  };
  return G;
}

const run = (G, seconds, step = null, until = null) => {
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    step?.(G);
    G.tick(DT);
    if (until?.()) return true;
  }
  return false;
};

function duel(G, { dist = 4, ang = 0, ai = false } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
  d.position.set(0, 0, -2);
  d.yaw = 0;
  run(G, 0.4);
  place(G, dist, ang);
  run(G, 0.3);
}

function place(G, dist, ang = 0) {
  const { game } = G;
  const d = game.dragon, p = game.player;
  const a = d.yaw + ang;
  p.debug.teleport(d.position.x + Math.sin(a) * dist, d.position.z + Math.cos(a) * dist);
  p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z);
  p.debug.heal();
  game.mouseGround.set(d.position.x, 0, d.position.z);
}

const quiet = (d) => d.mode === 'foot' && !d.late.busy && !d.fx.crescentsAlive;

/** Trigger `name` on a hero `dist` m off and answer its draw beats with `how` at the click:
 *  'parry' (pressed `early` s before the impact), 'guard' (held from the cue), 'dodge' (a roll `early`
 *  s before), 'perfect' (a roll inside the perfect window), 'none'. Returns what happened. */
function answerDraw(G, name, how, { dist = 4, phase = 1, early = 0.12, lethal = true, god = false } = {}) {
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist });
  if (phase > 1) {
    d.enterPhase(phase);
    d.phase = phase;
  }
  d.debug.lethal(lethal);
  p.debug.god = god;
  const hp0 = p.hp, g0 = p.guard;
  const R = { flashes: [], tells: [], parried: 0, guardOpen: 0, perfect: 0, deflected: 0, counter: 0, hp0, g0, react: null, reactT: 0, stateAt: null, hits: [] };
  let due = -1, holding = false;
  G.watch = (n, e) => {
    if (n === 'combat:flash' && e?.source === 'dragon') { R.flashes.push({ t: game.time, tell: e.tell, flare: e.flare, attack: e.attack }); if (e.flare && e.tell === TELL.BLUE) due = game.time + TUNING.flashLead; }
    if (n === 'combat:tell' && e?.source === 'dragon') R.tells.push({ t: game.time, tell: e.tell, attack: e.attack, impactIn: e.impactIn });
    if (n === 'player:parry') R.parried++;
    if (n === 'player:guardOpen') R.guardOpen++;
    if (n === 'player:perfectDodge') R.perfect++;
  };
  const h0 = G.hits.length;
  if (!d.debug.trigger(name)) return null;
  const ok = run(G, 6, (GG) => {
    const t = game.time;
    if (how === 'guard' && due > 0 && t >= due - 0.3 && !holding) { holding = true; input.press(1); }
    if (how === 'parry' && due > 0 && t >= due - early - DT) { input.up(1); input.click(1); due = -1; }
    if ((how === 'dodge' || how === 'perfect') && due > 0 && t >= due - (how === 'perfect' ? 0.06 : early) - DT) {
      input.axis = { x: 1, y: 0 };
      input.tap('Space');
      due = -1;
    }
    if (d.mode === 'react' && !R.react) { R.react = d.brain.react?.kind; R.reactAt = t; }
  }, () => d.mode === 'foot' && d.sheath === 'carry' && game.time > 1);
  if (holding) input.up(1);
  input.axis = { x: 0, y: 0 };
  R.hits = G.hits.slice(h0);
  R.hp = p.hp;
  R.alive = p.alive;
  R.ok = ok;
  return R;
}

// ================================================================== scenario: level
async function scenarioLevel() {
  out('\n== scenario LEVEL (the registry, the set, the boss slot: he kneels before the grave) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'grove', `levels: ${LEVELS.map((l) => l.id).join(', ')}`);
  assert(['?level=grove', '?lab&level=SHEATHED', '?level=windless', '?level=bamboo', '?level=wusheng'].every((q) => levelFromSearch(q) === LVL), '?level=grove / sheathed / windless / bamboo / wusheng pick the level (case-insensitive)');
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'victory', 'fallen', 'restReset', 'again', 'rise']) if (!LVL.text[k]) assert(false, `the level has its ${k} line`);
  assert(CONFIG.world.dragonBound === GROVE.floor.r && CONFIG.world.dragonSleep.z === GROVE.wait.z, "applyLevel merged the grove's layout into CONFIG.world");
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof Sheathed && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'sheathed', `the boss is his own duelist: ${d.name}`);
  assert(d.mode === 'sleep' && d.brain.clip === d.brain.C.meditate && d.sheath === 'carry' && Math.abs(d.yaw - GROVE.wait.yaw) < 1e-6, 'he waits kneeling (meditate) facing the grave, the sword sheathed');
  const B = SET.set.breakables, kinds = (k) => B.filter((b) => b.kind === k);
  assert(kinds('bamboo').length >= 200 && kinds('bamboo').length <= 400 && kinds('bamboo').every((b) => b.light && b.look === 'range'), `the bamboo: ${kinds('bamboo').length} light range pieces (<= 400)`);
  assert(kinds('graveSword').length >= 30 && kinds('graveSword').every((b) => b.light), `the Sword Grave: ${kinds('graveSword').length} light planted swords`);
  assert(kinds('paving').length >= 80 && kinds('stele').length === 1 && kinds('lantern').length === 2 && kinds('boulder').length >= 4 && kinds('post').length === 4, `the paving (${kinds('paving').length} slabs), the stele, two lanterns, ${kinds('boulder').length} boulders, the pavilion's four posts`);
  run(G, 0.3);
  G.game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(d.mode === 'sleep', 'exploring, far off: he does not stir');
  d.startIntro();
  run(G, 3.5, null, () => d.mode === 'foot');
  assert(G.counts['dragon:wake'] === 1 && G.counts['dragon:introDone'] === 1 && d.mode === 'foot' && d.sheath === 'carry', 'woken: he rises, the sword hanging sheathed in his hand');
}

// ================================================================== scenario: rules (the move data)
async function scenarioRules() {
  out('\n== scenario RULES (every move, every phase it is used in, both ends of every roll) ==');
  let checked = 0;
  // his own bands (the addendum): white 9 - 15, blue 18 - 26, red 22 - 30, one black; the lethal draws exempt
  const BAND = { [TELL.NORMAL]: [9, 15], [TELL.BLUE]: [18, 26], [TELL.RED]: [22, 30], [TELL.BLACK]: [30, 40] };
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const phases = phasesOf(name);
    if (!phases.length) assert(false, `${name}: used in at least one phase`);
    for (const ph of phases) {
      for (const r of [0, 0.35, 0.7, 0.999]) {
        const A = realise(name, ph, () => r);
        const real = A.beats.filter((b) => !b.feint);
        const tag = `${name} P${ph} r${r}`;
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        const first = real[0];
        if (!def.transition && first && !(first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first windup ${(first.impact - first.tellAt).toFixed(3)} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart`);
        for (let i = 1; i < real.length; i++) if (!(real[i].flash >= real[i - 1].impact - 1e-6)) assert(false, `${tag}: hit ${i}'s flash after hit ${i - 1} lands`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone or a cast`);
        for (const b of real) {
          const D = b.def;
          if (D.draw) {
            const prevDraw = real.slice(0, real.indexOf(b)).some((x) => x.def.draw);
            // (a draw that follows another in the same move, Three Autumns': past a dodge, at least 0.78 s)
            if (!(D.tell === TELL.BLUE && D.flare && D.fixed && b.W >= (prevDraw ? 0.78 : 0.9) - 1e-9 && Math.abs(b.impact - b.flash - TUNING.flashLead) < 1e-9 && D.part === 'hilt' && D.stopOn?.includes('blocked'))) assert(false, `${tag}: a draw is blue with the flare, fixed, wound up >= 0.9 s (${b.W}), cued flashLead before it lands at the hilt, stops on a block`);
          } else if (!def.transition && !D.cast) {
            const [lo, hi] = BAND[D.tell];
            if (!(D.damage >= lo && D.damage <= hi)) assert(false, `${tag}: hit ${b.hit} (${D.tell}) ${D.damage} damage in ${lo}..${hi}`);
          }
          if (D.flare && !(D.tell === TELL.BLUE && D.zone)) assert(false, `${tag}: a flare only on a blue blow with a zone`);
          if (D.lock) assert(false, `${tag}: no blade lock (a scabbard does not lock)`);
        }
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        checked++;
      }
    }
    // a feint never flashes: a feint beat has no tell
    for (const b of flat(name)) if (b.feint && b.tell) assert(false, `${name}: a feint carries no tell`);
  }
  assert(checked > 80, `${checked} realisations obey the rules (a tell per hit, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart, each draw blue / flared / fixed / >= 0.9 s, damage in his bands)`);
  const blacks = MOVE_NAMES.filter((n) => flat(n).some((b) => b.tell === TELL.BLACK));
  assert(blacks.length === 1 && blacks[0] === 'lightless', `exactly one black move (${blacks.join(', ')})`);
  assert(MOVE_NAMES.every((n) => flat(n).every((b) => !(b.draw && (b.tell === TELL.RED || b.tell === TELL.BLACK)))), 'no red or black beat is a draw (never lethal)');
  for (let ph = 1; ph <= NPH; ph++) {
    const draws = MOVE_NAMES.filter((n) => weightIn(MOVES[n], ph) > 0 && flat(n).some((b) => b.draw));
    assert(draws.length >= ph, `phase ${ph}: ${draws.length} kinds of draw (${draws.join(', ')}): more kinds as it goes`);
  }
  assert(TUNING.windupScale.every((w, i) => i === 0 || w <= TUNING.windupScale[i - 1]) && TUNING.damageScale === 1, 'harder means more pressure, never more damage');
  // a mikiri in phase 1
  assert(MOVE_NAMES.some((n) => weightIn(MOVES[n], 1) > 0 && flat(n).some((b) => b.mikiri)), 'phase 1 has a perilous thrust (Tapping Stone)');
}

const S = { level: scenarioLevel, rules: scenarioRules };
const OPT_IN = {};
const list = SCEN === 'all' ? Object.keys(S) : SCEN.split(',');
for (const k of list) {
  if (OPT_IN[k]) S[k] = OPT_IN[k];
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nSHEATH: ${fails} FAILED` : '\nSHEATH: ALL PASSED');
process.exit(fails ? 1 : 0);
