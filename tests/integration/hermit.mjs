// The Lone Peak Hermitage and Gu Shan, the One-Blow Hermit, headless (ADR-138 - 140): the REAL Player, Hermit,
// Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles, CameraRig, Events) wired like
// src/main.js for `?level=peak`; the world is a light mock on the real Colliders, filled by the level's
// set (world/lonePeak.js), or the real set with its breakables. A bot drives the input. Copied from
// asc.mjs (its build, bots, helpers).
// usage: node hermit.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI)
//   scenario: see SCENARIOS at the end (all: every one)
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
const { TELL, RESULT, POSTURE } = await imp('src/combat/rules.js');
const { LEVELS, getLevel, levelFromSearch, applyLevel } = await imp('src/levels/index.js');
const { createLonePeak, PEAK } = await imp('src/world/lonePeak.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { Hermit } = await imp('src/entities/enemies/hermit/hermit.js');
const { MOVES, MOVE_NAMES, CLIPS_BY_PHASE, COUNTER, TRANSITIONS, realise } = await imp('src/entities/enemies/hermit/moves.js');
const { TUNING } = await imp('src/entities/enemies/hermit/tuning.js');
const { LETHAL, GUARD, DEFENSE } = await imp('src/combat/rules.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

// (the tuning pass: ABYSS_TUNE='{"hp":3000,"posture":{"max":[1,2,3]}}' deep-merges into TUNING before
// anything is built: a setting tried without editing tuning.js; arrays are replaced whole)
if (process.env.ABYSS_TUNE) {
  const merge = (o, v) => { for (const [k, x] of Object.entries(v)) { if (x && typeof x === 'object' && !Array.isArray(x) && o[k] && typeof o[k] === 'object') merge(o[k], x); else o[k] = x; } };
  merge(TUNING, JSON.parse(process.env.ABYSS_TUNE));
}
const LVL = getLevel('peak');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 4242);
const DT = 1 / 60;
const PHASES = 3;
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
/** The phases a move is used in (its weight; the counter: every phase; a transition: the one before it). */
const phasesOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase - 1];
  if (def.counter) return [1, 2, 3];
  return [1, 2, 3].filter((f) => weightIn(def, f) > 0);
};

// the event catalogue (docs/ARCHITECTURE.md → "Event catalogue"): what this level emits must be in it
const CATALOGUE = (() => {
  const md = fs.readFileSync(`${ROOT}/docs/ARCHITECTURE.md`, 'utf8');
  const sec = md.split(/^## /m).find((s) => s.startsWith('Event catalogue')) ?? '';
  const names = new Set();
  for (const m of sec.matchAll(/`([a-zA-Z]+(?::[a-zA-Z0-9]+)?)[ `]/g)) names.add(m[1]);
  return names;
})();
const EMITTED = new Set();

applyLevel(LVL);
// the set's colliders, built once (the set is the world agent's: whatever it is, its circles)
const SET = (() => {
  const c = new Colliders();
  const set = createLonePeak(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

/** `real`: the set built anew with its breakables (world.destructibles, the scars, the ambience); without
 *  it the world is a mock on the set's colliders. */
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
  const set = real ? createLonePeak(U, colliders) : null;
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
  const mkParticles = (opts) => {
    const p = new GlyphParticles(U, opts);
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'rot', 'stretch']) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN particle ${k}`);
      counters.spawns++;
      return spawn(o);
    };
    return p;
  };
  const mkFire = () => {
    const p = new FireField(U, { max: 6000 });
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'sizeEnd', 'heat', 'heatEnd']) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN fire blob ${k}`);
      counters.spawns++;
      return spawn(o);
    };
    return p;
  };
  const game = {
    THREE, CONFIG, level: LVL, levels: LEVELS.map((L) => ({ id: L.id, name: L.name })), pickLevel() {},
    renderer: null, scene, fxScene: new THREE.Scene(), camera, pipeline: { finalMat: { uniforms: { uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 1 } } } }, U,
    events: new Events(), input, cameraRig: new CameraRig(camera), lights: new LightPool(U),
    fx: { alpha: mkParticles({ max: 3000, additive: false }), add: mkParticles({ max: 7000, additive: true }), fire: mkFire() },
    time: 0, realTime: 0, timeScale: 1, debugTimeScale: 1, hitstopTimer: 0, hitstopScale: 1,
    mouseGround: new THREE.Vector3(), state: 'title', settings: { quality: CONFIG.defaultQuality, showFps: false },
    hitstop(seconds, scale = 0.04) { this.hitstopTimer = Math.max(this.hitstopTimer, seconds); this.hitstopScale = Math.min(this.hitstopScale, scale); },
    shake(a) { if (!Number.isFinite(a)) throw new Error('NaN shake'); this.cameraRig.addTrauma(a); },
    punch(m) { if (!Number.isFinite(m)) throw new Error('NaN punch'); this.cameraRig.punch(m); },
    kick(x, y, z, m) { if (!Number.isFinite(x + y + z + m)) throw new Error('NaN kick'); this.cameraRig.kick(x, y, z, m); },
  };
  const G = { game, input, counts: {}, counters, watch: null, hits: [], payload: new Set(), peakAdd: 0 };
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
    world.update = (dt) => { world.destructibles.update(dt); world.scars.update?.(dt); set.ambience?.update?.(dt, game); };
    set.ambience?.setup?.(game);
  }
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  // (his rig is built on a stream of its own: three's uuids draw Math.random, and the body agent's gear
  // must not shift the AI's seeded stream: lord.mjs's note)
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
    const r = takeHit(h);
    G.hits.push({ t: game.time, r, attack: h?.attack, tell: h?.tell, damage: h?.damage, kind: h?.kind, around: !!h?.around });
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
    G.peakAdd = Math.max(G.peakAdd, game.fx.add.count);
    game.hud.update(realDt);
    game.audio.update(realDt);
    game.input.endFrame();
    const p = game.player, d = game.dragon;
    if (![p.position.x, p.position.z, p.hp, p.yaw].every(Number.isFinite)) throw new Error('player NaN');
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('hermit NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x].every(Number.isFinite)) throw new Error('hermit limb NaN');
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


/** Title → the duel (the Lab's flow jump), in phase `phase`, the hero `dist` m in front of him, facing him. */
function duel(G, { dist = 4, ang = 0, ai = false, phase = 1 } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
  if (phase > 1) d.debug.setPhase(phase);
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

const quiet = (d) => d.mode === 'foot' && !d.fx.crescentsAlive;

// ================================================================== scenario: level
async function scenarioLevel() {
  out('\n== scenario LEVEL (the registry, the set, the boss slot: he waits, his palm on the stone) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'peak', `levels: ${LEVELS.map((l) => l.id).join(', ')}`);
  assert(['?level=peak', '?lab&level=HERMIT', '?level=hermitage', '?level=lonepeak', '?level=oneblow'].every((q) => levelFromSearch(q) === LVL), '?level=peak / hermit / hermitage / lonepeak / oneblow pick the level (case-insensitive)');
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'victory', 'fallen', 'restReset', 'again', 'rise']) if (!LVL.text[k]) assert(false, `the level has its ${k} line`);
  assert(CONFIG.world.arenaRadius === PEAK.r && CONFIG.world.dragonSleep.z === PEAK.wait.z && CONFIG.world.bonfire.z === PEAK.bonfire.z, 'applyLevel merged the ledge layout into CONFIG.world');
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof Hermit && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'hermit' && d.object3d.name === 'hermit', `the boss is his own duelist: ${d.name}`);
  assert(Math.abs(d.drawScale / G.game.player.drawScale - 1.1) < 0.02, `drawn 1.1 x the hero (${d.drawScale.toFixed(3)} vs ${G.game.player.drawScale})`);
  assert(d.mode === 'sleep' && d.brain.clip === d.brain.C.meditate && d.phase === 1 && d.maxHp === TUNING.hp, 'he waits at his stone (meditate), one bar');
  assert(!d.rig.root.getObjectByName('weapon'), 'bare-handed');
  run(G, 0.3);
  G.game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(d.mode === 'sleep', 'exploring, far off: he does not stir');
  const y0 = d.yaw;
  d.startIntro();
  run(G, 4, null, () => d.mode === 'foot');
  const p = G.game.player.position, face = Math.atan2(p.x - d.position.x, p.z - d.position.z);
  assert(G.counts['dragon:wake'] === 1 && G.counts['dragon:introDone'] === 1 && d.mode === 'foot', 'woken: he takes his palm from the stone and turns round');
  assert(Math.abs(Math.atan2(Math.sin(face - d.yaw), Math.cos(face - d.yaw))) < 0.5 && Math.abs(Math.atan2(Math.sin(y0 - d.yaw), Math.cos(y0 - d.yaw))) > 1.5, `he turned round to the hero (yaw ${y0.toFixed(2)} → ${d.yaw.toFixed(2)})`);
}

// ================================================================== scenario: data (the move rules)
async function scenarioData() {
  out('\n== scenario DATA (every blow kills; a tell on every hit, long windups, impacts apart, both ends of every roll) ==');
  let checked = 0;
  const count = [0, 0, 0, 0];
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const phases = phasesOf(name);
    if (!phases.length) assert(false, `${name}: used in at least one phase`);
    if (!def.transition && !def.counter && !(Array.isArray(def.weight) && def.weight.length === PHASES)) assert(false, `${name}: a weight per phase`);
    for (const f of phases) {
      if (!def.transition && !def.counter) count[f]++;
      for (const r of [0, 0.35, 0.7, 0.999]) {
        const A = realise(name, f, () => r);
        const real = A.beats.filter((b) => !b.feint);
        const tag = `${name} phase ${f} r${r}`;
        if (!real.length) assert(false, `${tag}: a real hit`);
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        if (!(real[0].impact - real[0].tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first windup ${(real[0].impact - real[0].tellAt).toFixed(3)} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TUNING.minHitGap}`);
        for (const b of real) if (!(b.flash >= b.tellAt - 1e-6)) assert(false, `${tag}: hit ${b.hit} flashes after its tell`);
        for (let i = 1; i < real.length; i++) if (!(real[i].flash >= real[i - 1].impact - 1e-6)) assert(false, `${tag}: hit ${i} flash comes after hit ${i - 1} lands`);
        for (const b of real) if (!(b.def.zone || b.def.release)) assert(false, `${tag}: hit ${b.hit} has a zone or a release`);
        for (const b of real) if (b.def.damage !== 160) assert(false, `${tag}: hit ${b.hit} deals the bar (160): ${b.def.damage}`);
        for (const b of real) if (b.def.zone && !b.def.part) assert(false, `${tag}: hit ${b.hit} says which hand strikes (part)`);
        for (const b of real) if (b.def.lock || b.def.mikiri || b.def.flit) assert(false, `${tag}: no lock, mikiri or flurry blow`);
        for (const b of A.beats) if (b.feint && b.def.flare) assert(false, `${tag}: a feint never flashes`);
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        if (!(A.clip.kit === CLIPS_BY_PHASE[(def.transition ? def.phase : f) - 1].clash.kit)) assert(false, `${tag}: compiled round its phase stance`);
        checked++;
      }
    }
  }
  assert(checked > 40, `${checked} realisations obey the rules (a tell and a hand per hit, a first windup >= ${TUNING.minFirstWindup} s, impacts >= ${TUNING.minHitGap} s apart, each flash after the hit before it, 160 a blow)`);
  assert(count[1] === 4 && count[2] >= 6 && count[3] >= 8, `phase 1: four reads (${count[1]}); phase 2: ${count[2]} moves; phase 3: ${count[3]}`);
  const black = MOVE_NAMES.filter((n) => MOVES[n].beats.some((b) => b.tell === TELL.BLACK));
  assert(black.length === 1 && black[0] === 'oneBlow', `exactly one black move: ${black.join(', ')}`);
  const holds = MOVE_NAMES.filter((n) => !MOVES[n].transition && !MOVES[n].counter).filter((n) => MOVES[n].beats[0].hold);
  assert(holds.length >= 6, `the first blow of ${holds.length} moves holds a varying beat at its cock (${holds.join(', ')})`);
  for (const [ph, mv] of Object.entries(TRANSITIONS)) assert(MOVES[mv]?.transition && MOVES[mv].phase === Number(ph), `phase ${ph} begins with ${mv}`);
  assert(MOVES[COUNTER]?.counter && !MOVE_NAMES.some((n) => MOVES[n].streak), 'his counter is Reproach; he has no flurry (no `streak` move)');
  assert(TUNING.flashLead === 0.4 && TUNING.flashLead < TUNING.minHitGap, `the flare ${TUNING.flashLead} s before every impact (a roll or parry on it is in time)`);
  assert(TUNING.guard.windupOpen === 0 && TUNING.guard.recoverOpen === 1 && TUNING.guard.evade === 0, 'greedy: no guard in a windup or a recovery, no evade');
}

// ================================================================== scenario: lethal (ADR-139)
/** A blow of his at the hero now (his own hitPlayer: it carries `lethal`). */
const blowNow = (G, tell, attack = 'mountainPalm') => G.game.dragon.hitPlayer({ damage: 160, tell, knockback: 2.5, knockdown: true, attack });

async function scenarioLethal() {
  out('\n== scenario LETHAL (every blow kills: the table of ADR-139, the flask arithmetic, god mode) ==');
  const L = TUNING.lethal;
  assert(L.whole === LETHAL.whole && L.leave === 1 && L.throw === 10 && L.guardNeed === 0.5 && L.guardPush === 5, 'his lethal numbers are the rule (whole 0.5, leave 1, throw 10, guard 0.5, push 5)');
  const fresh = (hp = null) => {
    const G = build();
    duel(G, { dist: 2.2 });
    const p = G.game.player;
    if (hp != null) p.hp = hp;
    return { G, p, d: G.game.dragon };
  };
  // 1. nothing, at full health: LAST BREATH
  {
    const { G, p } = fresh();
    const x0 = p.position.x, z0 = p.position.z;
    const r = blowNow(G, TELL.NORMAL);
    assert(r === RESULT.HIT && p.hp === L.leave && p.alive && G.counts['player:lastBreath'] === 1, `unanswered at full health: ${r}, health ${p.hp} (LAST BREATH)`);
    run(G, 0.1);
    assert(p.state === 'knockdown', `knocked down (${p.state})`);
    run(G, 2.5);
    const slid = Math.hypot(p.position.x - x0, p.position.z - z0);
    assert(slid > 6, `thrown ${slid.toFixed(1)} m (throw ${L.throw} m; a stone may stop him short)`);
  }
  // 2. nothing, below the line: dead
  {
    const { G, p } = fresh(Math.floor(160 * L.whole) - 1);
    const r = blowNow(G, TELL.RED, 'fallingPeak');
    assert(r === RESULT.HIT && !p.alive && p.hp === 0 && !G.counts['player:lastBreath'], `unanswered below ${160 * L.whole}: dead (${r}, alive ${p.alive})`);
    run(G, 0.5);
    assert(G.counts['player:died'] === 1, 'the death is announced (the death screen names the move)');
  }
  // 2b. at exactly the line: a Last Breath
  {
    const { G, p } = fresh(160 * L.whole);
    blowNow(G, TELL.NORMAL);
    assert(p.alive && p.hp === L.leave, `at exactly ${160 * L.whole}: a Last Breath (${p.hp})`);
  }
  // 3. a held guard with the meter full: shattered, no health lost
  const holdGuard = (G, secs = 0.45) => { G.input.press(1); run(G, secs); };
  for (const tell of [TELL.NORMAL, TELL.BLUE, TELL.BLACK]) {
    const { G, p } = fresh();
    holdGuard(G);
    assert(p.blocking && p.guard === p.maxGuard, `${tell}: the guard is held, the meter full (${p.state})`);
    const r = blowNow(G, tell, tell === TELL.BLACK ? 'oneBlow' : 'mountainPalm');
    assert(r === RESULT.BLOCKED && p.hp === p.maxHp && p.guard === 0 && p.lethalLast?.kind === 'shatter', `${tell} on a full guard: SHATTERED (${r}, health ${p.hp}, meter ${p.guard})`);
    run(G, 0.05);
    assert(p.state === 'stagger' && Math.abs(p.staggerLen - GUARD.black.openDur) < 1e-6, `knocked open ${p.staggerLen} s (${p.state})`);
    G.input.up(1);
    run(G, 1.25);
    assert(p.guard >= p.maxGuard * 0.5 - 1, `the meter is back at half ~1.2 s after (${p.guard.toFixed(0)})`);
  }
  // 4. a held guard with less than half the meter: as no answer
  {
    const { G, p } = fresh();
    holdGuard(G);
    p.guard = p.maxGuard * L.guardNeed - 1;
    const r = blowNow(G, TELL.NORMAL);
    assert(r === RESULT.HIT && p.hp === L.leave, `a guard at ${p.maxGuard * L.guardNeed - 1}: no answer (${r}, health ${p.hp})`);
  }
  // 5. a guard or a parry against a red blow: as no answer
  {
    const { G, p } = fresh();
    holdGuard(G);
    const r = blowNow(G, TELL.RED, 'fallingPeak');
    assert(r === RESULT.HIT && p.hp === L.leave, `a red blow on a full guard: no answer (${r}, health ${p.hp})`);
  }
  {
    const { G, p } = fresh();
    G.input.press(1);
    run(G, 0.05);
    const r = blowNow(G, TELL.RED, 'fallingPeak');
    assert(r === RESULT.HIT && p.hp === L.leave, `a red blow parried: no answer (${r}, health ${p.hp})`);
  }
  // 6. a parry of a white or a blue blow: full negate
  for (const tell of [TELL.NORMAL, TELL.BLUE]) {
    const { G, p } = fresh();
    G.input.press(1);
    run(G, 0.05);
    const r = blowNow(G, tell);
    assert(r === RESULT.PARRIED && p.hp === p.maxHp && p.guard > 0, `${tell} parried: nothing lost (${r}, health ${p.hp})`);
  }
  // 7. a roll through it, a perfect dodge
  {
    const { G, p } = fresh();
    G.input.axis = { x: 1, y: 0 };
    G.input.tap('Space');
    run(G, 0.3 * 0.5);
    const r = blowNow(G, TELL.RED, 'fallingPeak');
    assert((r === RESULT.DODGED || r === RESULT.PERFECT) && p.hp === p.maxHp, `rolled through: ${r}, health ${p.hp}`);
  }
  {
    const { G, p } = fresh();
    G.input.axis = { x: 1, y: 0 };
    G.input.tap('Space');
    run(G, 2 / 60);
    const r = blowNow(G, TELL.BLACK, 'oneBlow');
    assert(r === RESULT.PERFECT && p.hp === p.maxHp, `the black blow perfect-dodged: ${r}`);
  }
  // 8. the flask arithmetic: 1 → 71 → 141; three unanswered blows forgiven, the fourth kills
  {
    const { G, p } = fresh();
    let deaths = 0, breaths = 0;
    for (let i = 0; i < 4 && p.alive; i++) {
      blowNow(G, TELL.NORMAL);
      if (!p.alive) { deaths++; break; }
      breaths++;
      run(G, 2.6, null, () => ['idle', 'run'].includes(p.state));
      for (let k = 0; k < 2 && p.flasks > 0 && i < 3; k++) {
        G.input.tap('KeyF');
        run(G, 1.2, null, () => p.state === 'heal');
        run(G, 1.2, null, () => p.state !== 'heal');
      }
      if (i < 2) assert(p.hp >= 160 * L.whole, `two flasks carry him back over the line: ${p.hp}`);
    }
    assert(breaths === 3 && deaths === 1 && p.flasks === 0, `five flasks: ${breaths} Last Breaths forgiven, the fourth blow kills (${deaths}), flasks left ${p.flasks}`);
  }
  // 9. god mode: nothing lost, nothing announced; he is still thrown
  {
    const { G, p } = fresh();
    p.debug.god = true;
    const r = blowNow(G, TELL.NORMAL);
    assert(r === RESULT.HIT && p.hp === p.maxHp && !G.counts['player:lastBreath'] && p.lethalLast?.kind === 'god', `god mode: ${r}, health ${p.hp}, no Last Breath`);
  }
  // 10. the other bosses' blows are not lethal (no `lethal`: the engine and player.js as before)
  {
    const { G, p } = fresh();
    const r = p.takeHit({ damage: 20, tell: TELL.NORMAL, knockback: 1, attack: 'x', from: { x: G.game.dragon.position.x, z: G.game.dragon.position.z } });
    assert(r === RESULT.HIT && p.hp === p.maxHp - 20 && p.lethalLast === null, `a blow without \`lethal\`: 20 damage as before (${p.hp})`);
  }
}

// ================================================================== scenario: timing (flash → contact)
async function scenarioTiming() {
  out('\n== scenario TIMING (every move from inside its band, every phase: each flare is a blow, on time) ==');
  let worst = 0, moves = 0;
  const only = process.env.ABYSS_TMOVE;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    if (def.transition || def.hidden) continue;
    if (only && name !== only) continue;
    for (const f of phasesOf(name)) {
      const G = build();
      const d = G.game.dragon;
      const [lo, hi] = def.band;
      const at = def.counter ? 2.0 : Math.max(1.8, Math.min(hi - 0.6, lo + (Math.min(hi, 12) - lo) * 0.4));
      duel(G, { dist: at, phase: f });
      G.game.player.debug.god = true;
      const flashes = [], contacts = [];
      G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') { flashes.push(G.game.time); if (only) out(`       ${G.game.time.toFixed(3)} flash ${e.attack} ${e.tell}`); } };
      const h0 = G.hits.length;
      const ok = def.counter ? d.brain.startAct(name) : d.debug.trigger(name);
      if (!ok) { assert(false, `${name} phase ${f}: starts`); continue; }
      run(G, 9, null, () => quiet(d));
      for (const h of G.hits.slice(h0)) if (h.r !== RESULT.IGNORED) { contacts.push(h.t); if (only) out(`       ${h.t.toFixed(3)} contact ${h.attack} ${h.kind} ${h.r}`); }
      let w = 0;
      for (const c of contacts) {
        const fl = flashes.filter((t) => t <= c + 1e-6).pop();
        w = Math.max(w, fl === undefined ? Infinity : Math.abs(c - fl - TUNING.flashLead));
      }
      worst = Math.max(worst, Number.isFinite(w) ? w : 9);
      moves++;
      if (!(contacts.length >= 1) || !(w <= 0.09)) assert(false, `${name} phase ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
      else out(`     ${name.padEnd(17)} phase ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
    }
  }
  if (only) return;
  assert(moves >= 18 && worst <= 0.09, `${moves} move x phase runs: every contact within ${(worst * 1000).toFixed(0)} ms of its flare + ${TUNING.flashLead} s, and every move's first blow lands`);
}

// ================================================================== scenario: cover (the line blows and the stones)
async function scenarioCover() {
  out('\n== scenario COVER (a striking stone between him and the hero takes a line blow; the hero is untouched) ==');
  for (const [name, ph] of [['oneBlow', 1], ['idleFinger', 1], ['splitEarth', 2]]) {
    const G = build(SEED, true);
    const { game } = G;
    duel(G, { dist: 4, phase: ph });
    const d = game.dragon, p = game.player, W = game.world.destructibles;
    p.debug.god = true;
    const post = W.list.find((b) => b.kind === 'post' && b.def?.inner);
    assert(!!post && post.cover, `${name}: an inner striking stone is cover (${post?.kind})`);
    const l = Math.hypot(post.x, post.z) || 1, ux = post.x / l, uz = post.z / l;
    const back = name === 'idleFinger' ? 8.5 : 6;
    d.position.set(post.x - ux * back, 0, post.z - uz * back);
    d.yaw = Math.atan2(ux, uz);
    p.debug.teleport(post.x + ux * 1.4, post.z + uz * 1.4);
    p.yaw = Math.atan2(-ux, -uz);
    run(G, 0.05);
    const h0 = G.hits.length, s0 = post.state;
    assert(d.debug.trigger(name), `${name}: starts`);
    run(G, 6, () => { d.position.y = 0; }, () => quiet(d));
    const took = G.hits.slice(h0).filter((h) => h.r !== RESULT.IGNORED);
    if (process.env.ABYSS_TRACE) out(JSON.stringify(took), JSON.stringify({ post: [post.x, post.z, post.state], d: [d.position.x, d.position.z, d.yaw], p: [p.position.x, p.position.z] }));
    assert(took.length === 0 && post.state !== s0, `${name}: the stone took it (state ${s0} → ${post.state}); the hero behind it untouched (${took.length} blows reached him)`);
  }
  // in the open the same blow reaches him
  {
    const G = build(SEED, true);
    duel(G, { dist: 8 });
    G.game.player.debug.god = true;
    const h0 = G.hits.length;
    G.game.dragon.debug.trigger('oneBlow');
    run(G, 5, null, () => quiet(G.game.dragon));
    assert(G.hits.slice(h0).some((h) => h.r === RESULT.HIT && h.attack === 'oneBlow'), 'with nothing between them The One Blow reaches him 8 m off');
  }
  // other bosses' beats do not carry `wind`
  const { MOVES: AM } = await imp('src/entities/enemies/ascendant/moves.js');
  const { MOVES: DM } = await imp('src/entities/enemies/ashDisciple/moves.js');
  const flat = (M) => Object.values(M).flatMap((m) => m.beats.flatMap((b) => (Array.isArray(b.pick) ? b.pick : [b])));
  assert(![...flat(AM), ...flat(DM)].some((b) => b.wind), 'no other boss\'s beat carries `wind`');
}

// ================================================================== scenario: bare (his hand is the blade)
async function scenarioBare() {
  out('\n== scenario BARE (bare hands: the striking hand is his "blade"; a parry meets it there) ==');
  const G = build();
  duel(G, { dist: 2.6 });
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  const hand = new THREE.Vector3();
  d.rig.sword.getWorldPosition(hand);
  assert(d._tipOk && d._tip.distanceTo(hand) < 0.25, `in his guard the "blade" ends at his right hand (${d._tip.distanceTo(hand).toFixed(2)} m)`);
  // the left hand behind his back (phases 1 - 2), out in phase 3
  const lh = new THREE.Vector3(), ch = new THREE.Vector3(), fw = () => new THREE.Vector3(Math.sin(d.yaw), 0, Math.cos(d.yaw));
  d._limbSeg('fistL', new THREE.Vector3(), lh);
  d.rig.chest.getWorldPosition(ch);
  const behind1 = (lh.x - ch.x) * fw().x + (lh.z - ch.z) * fw().z;
  assert(behind1 < -0.02, `phases 1 - 2: the left hand is behind his back (${behind1.toFixed(2)} m along his facing)`);
  d.debug.setPhase(3);
  run(G, 1.2);
  d._limbSeg('fistL', new THREE.Vector3(), lh);
  d.rig.chest.getWorldPosition(ch);
  const front3 = (lh.x - ch.x) * fw().x + (lh.z - ch.z) * fw().z;
  assert(front3 > 0.1, `phase 3 (BOTH HANDS): the left hand is out before him (${front3.toFixed(2)} m)`);
  // a parried palm: the contact is on his hand, his string ends, the counter answers
  const G2 = build();
  duel(G2, { dist: 2.8 });
  const d2 = G2.game.dragon, p2 = G2.game.player;
  p2.debug.god = true;
  let parried = 0, counters = 0;
  G2.watch = (n, e) => { if (n === 'dragon:parried') parried++; if (n === 'player:flareCounter') counters++; };
  d2.debug.trigger('mountainPalm');
  run(G2, 4, () => {
    const a = d2.brain.act, b = a?.beats?.[0];
    if (b && !b.done && b.impact - a.t <= 0.1 && b.impact - a.t > 0.08) { G2.input.up(1); G2.input.click(1); }
  }, () => parried > 0);
  run(G2, 1.5);
  assert(parried === 1 && d2.brain.react?.kind !== 'deflect', `the palm parried (${parried}): he recoils`);
  assert(counters >= 0, `the flare's counter answers (${counters})`);
}

// ================================================================== scenario: guard (his palm ward, greed, no flurry)
async function scenarioGuard() {
  out('\n== scenario GUARD (his palm turns cuts in his footwork, Reproach after a few; greedy: nothing cancels a windup) ==');
  const G = build();
  duel(G, { dist: 2.0, ai: true });
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  p.debug.god = true;
  d.brain.gapT = 99; // (he keeps to his footwork: the hero cuts into his guard)
  let guards = 0, reproach = 0, flurry = 0;
  G.watch = (n, e) => {
    if (n === 'dragon:guard') guards++;
    if (n === 'dragon:windup' && e?.name === 'reproach') reproach++;
    if (n === 'dragon:flurry') flurry++;
  };
  run(G, 8, () => {
    d.brain.gapT = Math.max(d.brain.gapT, 50);
    game.mouseGround.set(d.position.x, 0, d.position.z);
    if (((game.realTime * 60) | 0) % 24 === 0) input.click(0);
  }, () => reproach > 0);
  assert(guards >= 2 && reproach >= 1, `his palm turned ${guards} cuts and Reproach answered (${reproach})`);
  assert(flurry === 0 && d.brain.startStreak(4) === false, 'no flurry of his (no `streak` move): his guard never answers with one');
  // greed: a cut in his windup lands at half (his skin), and the windup goes on
  const G2 = build();
  duel(G2, { dist: 2.2 });
  const d2 = G2.game.dragon;
  d2.debug.trigger('fallingPeak');
  run(G2, 0.5);
  const a = d2.brain.act, hp0 = d2.hp;
  assert(!d2.guarding, 'in a windup his guard is down');
  const dealt = d2.takeHit({ damage: 20, part: 'body', swing: true, heavy: false, dir: { x: 0, z: -1 } });
  run(G2, 0.05);
  assert(Math.abs(dealt - 10) <= 1 && d2.brain.act === a && d2.mode === 'act', `a cut in his windup: ${dealt} of 20 (skin x${TUNING.skin.windup}), the blow still coming (${d2.mode})`);
  const heavy = d2.takeHit({ damage: 40, part: 'body', swing: true, heavy: true, poise: 200, dir: { x: 0, z: -1 } });
  run(G2, 0.05);
  assert(d2.brain.act === a && heavy > 0, `a crushing heavy in his windup lands (${heavy}) and does not cancel it`);
  run(G2, 3, null, () => d2.mode !== 'act' || d2.brain.act !== a || a.t > a.recoveryStart + 0.05);
  const hp1 = d2.hp;
  const full = d2.takeHit({ damage: 20, part: 'body', swing: true, dir: { x: 0, z: -1 } });
  assert(Math.abs(full - 20) <= 1 && hp1 - d2.hp === full, `a cut in his recovery lands in full (${full})`);
  assert(hp0 - d2.hp > 0, 'his bar went down');
  // no lock, no mikiri, no flurry blow in his kit (DATA checks the beats); the transition's blow is red
  assert(TRANSITIONS[2] && MOVES[TRANSITIONS[2]].beats[0].tell === TELL.RED, 'his transitions are red (dodge them)');
}

// ================================================================== scenario: phase (one bar, three phases)
async function scenarioPhase() {
  out('\n== scenario PHASE (one bar: 66 % THE MOUNTAIN ANSWERS, 33 % BOTH HANDS) ==');
  const G = build();
  duel(G, { dist: 6, ai: true });
  const { game } = G;
  const d = game.dragon, p = game.player;
  p.debug.god = true;
  d.takeHit({ damage: d.maxHp * 0.4, exact: true });
  assert(Math.abs(d.hp - d.maxHp * 0.66) < 1, `a heavy blow is held at the phase gate (${Math.round(d.hp)} = 66 %)`);
  run(G, 4, null, () => d.brain.act?.name === 'mountainAnswers');
  assert(d.brain.act?.name === 'mountainAnswers' && d.phase === 2 && G.counts['dragon:phase2'] === 1, `phase 2 begins with The Mountain Answers (${d.brain.act?.name})`);
  run(G, 4, null, () => d.mode === 'foot');
  d.takeHit({ damage: d.maxHp * 0.5, exact: true });
  run(G, 4, null, () => d.brain.act?.name === 'bothHands');
  assert(d.brain.act?.name === 'bothHands' && d.phase === 3 && G.counts['dragon:phase3'] === 1, `phase 3 begins with Both Hands (${d.brain.act?.name})`);
  run(G, 4, null, () => d.mode === 'foot');
  assert(d.brain.C === CLIPS_BY_PHASE[2], 'phase 3 reacts with its own clips (both hands)');
  d.takeHit({ damage: d.maxHp, exact: true });
  run(G, 6, null, () => d.mode === 'dead');
  assert(d.mode === 'dead' && G.counts['dragon:death'] === 1, 'the third phase emptied: he dies');
}

// ================================================================== scenario: flow (title → the ledge → the duel; death and victory)
async function scenarioFlow() {
  out('\n== scenario FLOW (the ledge → he turns from his stone → the duel; a death sends him back; the victory) ==');
  const G = build();
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  run(G, 0.3);
  input.tap('Enter');
  run(G, 0.5);
  if (game.state !== 'explore') game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(game.state === 'explore' && d.mode === 'sleep', 'exploring; he waits at his stone');
  p.debug.teleport(0, CONFIG.world.bossTriggerZ + 2.5);
  run(G, 0.2);
  run(G, 4, () => { input.axis = { x: 0, y: 1 }; }, () => d.mode !== 'sleep');
  input.axis = { x: 0, y: 0 };
  assert(d.mode === 'intro' && game.state === 'bossIntro', `over the ledge's lip: he stirs (hero at z ${p.position.z.toFixed(1)}, ${game.state})`);
  run(G, 8, null, () => d.mode === 'foot' || d.mode === 'act');
  run(G, 0.2);
  assert(G.counts['dragon:introDone'] === 1 && game.state === 'boss', `the intro ends in the duel (${game.state})`);
  p.debug.god = false;
  p.hp = 1;
  d.debug.setAI(true);
  run(G, 30, () => { game.mouseGround.set(d.position.x, 0, d.position.z); }, () => game.state === 'dead');
  assert(game.state === 'dead', 'one blow of his kills a hero at one health');
  run(G, 12, () => { if (((game.realTime * 60) | 0) % 30 === 0) input.tap('Enter'); }, () => game.state === 'explore');
  assert(game.state === 'explore' && d.mode === 'sleep' && d.phase === 1, `after the death he waits at his stone again (${game.state}, ${d.mode})`);
  // a reset in the middle of a move (the Lab, a rest at the bonfire): he is back at his stone, nothing left in flight
  for (const mv of ['oneBlow', 'splitEarth']) {
    const G3 = build();
    duel(G3, { dist: 6, phase: mv === 'splitEarth' ? 2 : 1 });
    const d3 = G3.game.dragon;
    d3.debug.trigger(mv);
    run(G3, mv === 'oneBlow' ? 1.2 : 1.6);
    d3.debug.reset();
    run(G3, 1);
    assert(d3.mode === 'sleep' && !d3.fx.crescentsAlive && d3.warn === 0 && Math.hypot(d3.position.x - PEAK.wait.x, d3.position.z - PEAK.wait.z) < 0.5, `a reset in the middle of ${mv}: he is back at his stone, nothing in flight (${d3.mode})`);
  }
  // the victory
  const G2 = build();
  duel(G2, { dist: 4 });
  G2.game.dragon.debug.kill();
  run(G2, 8, null, () => G2.game.state === 'victory');
  assert(G2.game.state === 'victory', `his death ends the duel (${G2.game.state})`);
}

// ================================================================== the bots
const stat = (xs) => ({ min: Math.min(...xs), max: Math.max(...xs), mean: xs.reduce((a, x) => a + x, 0) / (xs.length || 1) });

/**
 * The reader: answers his flares from the flare (blue: parry; white: parry or, `style` 'block', a held
 * guard; red / black: a roll, early enough to be a perfect dodge most of the time). `skill` < 1: that
 * share of his cues answered, the rest let through (a Last Breath, or death). World cues (a stone
 * falling) are rolled from.
 */
function makeReader(G, { skill = 1, style = 'mixed', rng = null } = {}) {
  const pend = [];
  const stats = { flashes: 0, skipped: [], parryTry: 0, dodgeTry: 0, blockTry: 0 };
  let guardUntil = -1;
  return {
    stats,
    onEvent(n, d) {
      if (n !== 'combat:flash' || (d?.source !== 'dragon' && d?.source !== 'world')) return;
      stats.flashes++;
      if (skill < 1 && (rng ?? Math.random)() > skill) { stats.skipped.push([G.game.time, d.attack]); return; }
      pend.push({ tell: d.tell, at: G.game.time + (d.source === 'world' ? 0.3 : TUNING.flashLead), x: d.x, z: d.z, hazard: d.source === 'world' || (!!d.hazard && !d.bullet), done: false });
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.4) pend.splice(i, 1);
      let busy = false;
      for (const e of pend) {
        if (e.done) continue;
        const left = e.at - t - DT;
        const roll = e.tell === TELL.RED || e.tell === TELL.BLACK || e.hazard || style === 'roll';
        if (roll) {
          if (left <= 0.1) {
            e.done = true;
            input.up(1);
            guardUntil = -1;
            const c = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
            const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
            let wx = -dz / l, wz = dx / l;
            const B = (CONFIG.world.dragonBound ?? 12) + 1;
            if (Math.hypot(p.x + wx * 3, p.z + wz * 3) > B) { wx = -wx; wz = -wz; }
            input.axis = e.hazard ? { x: dx / l, y: -dz / l } : { x: wx, y: -wz };
            input.tap('Space');
            stats.dodgeTry++;
          }
        } else if (style === 'block' && e.tell !== TELL.BLUE) {
          e.done = true;
          guardUntil = Math.max(guardUntil, e.at + 0.15);
          stats.blockTry++;
        } else if (left <= 0.12) {
          e.done = true;
          input.up(1);
          input.click(1);
          stats.parryTry++;
        }
        if (!e.done && left < 0.7) busy = true;
      }
      if (guardUntil > t) { input.press(1); busy = true; } else if (guardUntil > 0) { guardUntil = -1; input.up(1); }
      return busy;
    },
    dueWithin(s) {
      const t = G.game.time;
      return pend.some((e) => !e.done && e.at - t < s);
    },
  };
}

/** Fence: stay in reach, answer every flare, cut in his recovery (and, `greedy`, in his windups while
 *  the blow is far off), execute him when he breaks, drink when he is open and the hero is under the
 *  line. `god`: the hero's health is kept full. */
function fence(G, { god = false, greedy = true, drinkAt = 80 } = {}) {
  const { game, input } = G;
  const p = game.player, d = game.dragon;
  input.axis = { x: 0, y: 0 };
  if (!p.alive || game.state !== 'boss') return;
  if (god) p.hp = p.maxHp;
  const tgt = new THREE.Vector3();
  d.lockPoint(tgt);
  game.mouseGround.set(tgt.x, 0, tgt.z);
  const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z, dist = Math.hypot(dx, dz);
  const busy = G.defend.act();
  const tick = (game.realTime * 60) | 0;
  const a = d.brain.act;
  const cur = a?.beats?.find((b) => a.t < b.end);
  const opening = d.broken || d.mode === 'react' || (d.mode === 'act' && !!a && a.t > a.recoveryStart + 0.1);
  // (under the line he drinks as soon as no blow of his is coming within 1.2 s: he waits while the hero drinks)
  const calm = !(d.mode === 'act' && cur && !cur.feint && a.t < cur.impact && cur.impact - a.t < 1.2) && !d.fx.crescentsAlive;
  if (!god && p.hp < drinkAt && p.flasks > 0) {
    // under the line he does not fight: he keeps his distance and drinks the moment it is calm
    if (calm && !G.defend.dueWithin(1.0) && ['idle', 'run', 'block'].includes(p.state) && tick % 6 === 0) { input.up(1); input.tap('KeyF'); return; }
    if (!busy && dist < 6) input.axis = { x: -dx / dist, y: dz / dist };
    return;
  }
  if (dist > 2.4 && !busy) input.axis = { x: dx / dist, y: -dz / dist };
  // (he reads the windup, not only the flare: no cut is started with one of his blows under 0.8 s off;
  // greedy, he cuts while it is still far)
  const coming = d.mode === 'act' && cur && !cur.feint && a.t < cur.impact && cur.impact - a.t < 0.8;
  const windupFar = greedy && d.mode === 'act' && cur && !cur.feint && cur.impact - a.t > 0.9 && !a.def.transition;
  const open = opening || p.critTimer > 0;
  if (!busy && !coming && dist < 3.0 && (open ? tick % 18 === 0 : windupFar ? tick % 26 === 0 : tick % 80 === 0)) input.click(0);
}

/** A whole fight. → what it measured. */
function fight(seed, { skill = 1, god = false, style = 'mixed', greedy = true, secs = 420, real = true } = {}) {
  const G = build(seed, real);
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 3.5, ai: true });
  p.debug.god = false;
  G.defend = makeReader(G, { skill, style, rng: mulberry32(seed * 977 + Math.round(skill * 100)) });
  const phaseAt = [game.time];
  const n = { parries: 0, dodges: 0, breaths: 0, shatters: 0, heals: 0, breaks: 0, execs: 0 };
  const lands = [], flashT = [];
  const th = p.takeHit.bind(p);
  p.takeHit = (h) => {
    const st0 = `${p.state}${p.atk?.def?.name ? ':' + p.atk.def.name : ''}`;
    const r = th(h);
    if (r === RESULT.HIT && !h?.lethal && process.env.ABYSS_TRACE) lands.push(`(${h?.attack} ${h?.damage?.toFixed?.(0)} at ${st0} hp ${p.hp.toFixed(0)} @${(game.time - t0).toFixed(1)})`);
    if (r === RESULT.HIT && h?.lethal) {
      const t = game.time, atk = h.attack;
      const why = G.defend?.stats.skipped.some((x) => x[0] > t - 1.5 && x[1] === atk) ? 'missed' : flashT.some((x) => x[0] > t - 1.5 && x[1] === atk) ? `ANSWERED(${st0})` : 'uncued';
      lands.push(`${atk} ${why} @${(t - t0).toFixed(1)}`);
    }
    return r;
  };
  G.watch = (ev, e) => {
    if (ev === 'combat:flash') flashT.push([game.time, e?.attack]);
    if (ev === 'player:parry') n.parries++;
    if (ev === 'player:perfectDodge') n.dodges++;
    if (ev === 'player:lastBreath') n.breaths++;
    if (ev === 'player:guardOpen' && e?.black) n.shatters++;
    if (ev === 'player:heal') n.heals++;
    if (ev === 'dragon:postureBreak') n.breaks++;
    if (ev === 'dragon:plunged') n.execs++;
    if (/^dragon:phase[23]$/.test(ev)) phaseAt.push(game.time);
    if (ev === 'dragon:hurt' && process.env.ABYSS_DMG) {
      const k = p.state === 'flurry' ? 'flurry' : e?.crit && d.broken ? 'broken' : e?.crit ? 'crit/exec' : d.mode === 'act' && d.brain.act && d.brain.act.t < (d.brain.act.recoveryStart ?? 0) ? 'windup' : d.mode === 'act' ? 'recovery' : d.mode;
      dmg[k] = (dmg[k] || 0) + (e?.damage ?? 0);
    }
  };
  const dmg = {};
  const t0 = game.time;
  let outcome = 'time';
  run(G, secs, () => fence(G, { god, greedy }), () => {
    if (d.mode === 'dead' || d.mode === 'dying') { outcome = 'won'; return true; }
    if (!p.alive) { outcome = 'died'; return true; }
    return false;
  });
  G.watch = null;
  G.defend = null;
  if (process.env.ABYSS_TRACE) out(`        landed: ${lands.join(' · ')}`);
  if (process.env.ABYSS_DMG) out(`        damage by: ${Object.entries(dmg).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')}`);
  const T = game.time - t0;
  const perPhase = phaseAt.map((t, i) => (phaseAt[i + 1] ?? game.time) - t);
  return { G, seed, skill, outcome, T, perPhase, phase: d.phase, bar: d.hp / d.maxHp, hp: p.hp, flasks: p.flasks, killer: outcome === 'died' ? p.lethalLast?.attack ?? '?' : null, ...n };
}

// ================================================================== scenario: pace (the pressure meter)
async function scenarioPace() {
  out('\n== scenario PACE (a steady defender in god mode vs his AI, per phase: cues a minute, gaps, conflicts, lethal impacts apart) ==');
  const SECS = Number(process.env.ABYSS_PSECS ?? 120);
  const SEEDS = (process.env.ABYSS_PSEEDS ?? '4242,7,99').split(',').map(Number).filter(Number.isFinite);
  const answer = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? 'dodge' : 'guard');
  const rows = [];
  const B = (CONFIG.world.dragonBound ?? 12) - 1;
  const sep = TUNING.pressure.guard.sep + TUNING.pressure.guard.margin;
  for (const seed of SEEDS) {
    for (let ph = 1; ph <= PHASES; ph++) {
      if (process.env.ABYSS_PPH && !process.env.ABYSS_PPH.split(',').includes(String(ph))) continue;
      const G = build(seed, true);
      const { game } = G;
      const d = game.dragon, p = game.player;
      duel(G, { dist: 3, ai: true, phase: ph });
      p.debug.god = true;
      G.defend = makeReader(G, { skill: 1 });
      const modes = [];
      Math.random = mulberry32(seed * 7 + ph);
      const flashes = [], impacts = [], busyT = [];
      G.watch = (n, e) => {
        if (n === 'combat:flash' && e?.source === 'dragon') flashes.push([game.time, e.tell, e.attack]);
        if (n === 'combat:charge' && Number.isFinite(e?.dur)) for (let k = 0; k < e.dur; k += 0.1) busyT.push(game.time + k);
      };
      const th = p.takeHit.bind(p);
      p.takeHit = (h) => { if (h?.lethal) impacts.push(game.time); return th(h); };
      const roam = mulberry32(seed * 31 + ph), goal = { r: 3, a: 0, until: -1 };
      const t0 = game.time;
      for (let i = 0; i < Math.round(SECS / DT); i++) {
        const busy = G.defend.act();
        if (game.time > goal.until) {
          goal.r = [2.5, 5, 10][Math.floor(roam() * 3)];
          goal.a = Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z) + (roam() - 0.5) * 1.6;
          goal.until = game.time + 4;
        }
        if (!busy && p.state !== 'roll') {
          const gx = d.position.x + Math.sin(goal.a) * goal.r, gz = d.position.z + Math.cos(goal.a) * goal.r;
          const k = Math.hypot(gx, gz) > B ? B / Math.hypot(gx, gz) : 1;
          const dx = gx * k - p.position.x, dz = gz * k - p.position.z, l = Math.hypot(dx, dz);
          G.input.axis = l > 0.6 ? { x: dx / l, y: -dz / l } : { x: 0, y: 0 };
        }
        game.mouseGround.set(d.position.x, 0, d.position.z);
        G.tick(DT);
        if (d.brain.pendingPhase > ph) d.brain.pendingPhase = 0;
        if (d.mode === 'broken' && i % 6 === 0) busyT.push(game.time);
        if (i % 30 === 0) modes.push([game.time, `${d.mode}:${d.brain.act?.name ?? d.brain.react?.kind ?? ''}@${Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z).toFixed(1)}`]);
      }
      G.watch = null;
      G.defend = null;
      const T = game.time - t0;
      const ts = [t0, ...flashes.map((f) => f[0]), ...busyT.filter((x) => x > t0 && x < t0 + T), t0 + T].sort((x, y) => x - y);
      let gapMax = 0, gapAt = '';
      for (let i = 1; i < ts.length; i++) {
        if (ts[i] - ts[i - 1] <= gapMax) continue;
        gapMax = ts[i] - ts[i - 1];
        gapAt = `@${(ts[i - 1] - t0).toFixed(1)} ${modes.filter((m) => m[0] >= ts[i - 1] && m[0] <= ts[i]).map((m) => m[1]).join(' ')}`;
      }
      let conflicts = 0;
      const conflictAt = [];
      for (let i = 0; i < flashes.length; i++) {
        for (let j = i + 1; j < flashes.length && flashes[j][0] - flashes[i][0] < sep; j++) {
          if (answer(flashes[i][1]) === answer(flashes[j][1])) continue;
          conflicts++;
          conflictAt.push(`${flashes[i][2]}/${flashes[j][2]} @${(flashes[i][0] - t0).toFixed(1)}`);
        }
      }
      let closest = Infinity;
      const imp = [...new Set(impacts.map((x) => Math.round(x * 1000)))].sort((x, y) => x - y).map((x) => x / 1000);
      for (let i = 1; i < imp.length; i++) closest = Math.min(closest, imp[i] - imp[i - 1]);
      const dodge = flashes.filter((f) => answer(f[1]) === 'dodge').length / (flashes.length || 1);
      rows.push({ seed, ph, perMin: (flashes.length * 60) / T, dodge, gapMax, gapAt, conflicts, conflictAt, closest, impacts: imp.length });
    }
  }
  out(`   ${SECS} s per phase, seeds ${SEEDS.join(', ')}`);
  out('   seed ph cue/min dodge% gapMax impacts closest conflicts');
  for (const r of rows) out(`   ${String(r.seed).padStart(4)}  ${r.ph} ${r.perMin.toFixed(1).padStart(7)} ${(r.dodge * 100).toFixed(0).padStart(6)} ${r.gapMax.toFixed(2).padStart(6)} ${String(r.impacts).padStart(7)} ${(Number.isFinite(r.closest) ? r.closest.toFixed(2) : '-').padStart(7)} ${String(r.conflicts).padStart(9)}${r.conflicts ? `  ${r.conflictAt.slice(0, 3).join(' · ')}` : ''}${process.env.ABYSS_TRACE ? `
        gap ${r.gapAt}` : ''}`);
  const mean = (ph, k) => { const rs = rows.filter((r) => r.ph === ph); return rs.reduce((a, r) => a + r[k], 0) / (rs.length || 1); };
  for (let ph = 1; ph <= PHASES; ph++) out(`   mean P${ph}: ${mean(ph, 'perMin').toFixed(1)} cues/min, ${(mean(ph, 'dodge') * 100).toFixed(0)} % to dodge, longest gap ${Math.max(...rows.filter((r) => r.ph === ph).map((r) => r.gapMax)).toFixed(2)} s`);
  if (process.env.ABYSS_PREPORT) return;
  const MT = TUNING.pressure.meter, pf = (v, ph) => v[Math.min(v.length, ph) - 1];
  for (let ph = 2; ph <= PHASES; ph++) {
    const a0 = mean(ph - 1, 'perMin'), a1 = mean(ph, 'perMin');
    assert(a1 >= a0 * pf(MT.rampMean, ph), `the seeds' mean: P${ph} at least x${pf(MT.rampMean, ph)} P${ph - 1}'s cues a minute (${a0.toFixed(1)} → ${a1.toFixed(1)})`);
  }
  for (const r of rows) {
    assert(r.perMin >= pf(MT.minRate, r.ph) && r.gapMax <= pf(MT.maxGap, r.ph), `seed ${r.seed} P${r.ph}: ${r.perMin.toFixed(1)} cues a minute (>= ${pf(MT.minRate, r.ph)}), longest gap ${r.gapMax.toFixed(2)} s (<= ${pf(MT.maxGap, r.ph)})`);
    assert(r.conflicts === 0, `seed ${r.seed} P${r.ph}: no two cues needing different answers within ${sep.toFixed(1)} s (${r.conflicts}: ${r.conflictAt.slice(0, 3).join(' · ')})`);
    assert(!(r.closest < TUNING.lethal.minApart - 1e-3), `seed ${r.seed} P${r.ph}: no two lethal impacts closer than ${TUNING.lethal.minApart} s (closest ${Number.isFinite(r.closest) ? r.closest.toFixed(2) : '-'})`);
  }
}

// ================================================================== scenario: win (god mode)
async function scenarioWin() {
  out('\n== scenario WIN (the mixed reader in god mode: parries, rolls, cuts greedily, executes) ==');
  const SEEDS = (process.env.ABYSS_WSEEDS ?? '4242,7,99').split(',').map(Number);
  const rs = [];
  for (const seed of SEEDS) {
    const r = fight(seed, { god: true });
    rs.push(r);
    out(`     seed ${String(seed).padEnd(5)} ${r.outcome} in ${r.T.toFixed(0)} s · phases ${r.perPhase.map((x) => x.toFixed(0)).join(' / ')} s · parries ${r.parries}, perfect dodges ${r.dodges}, breaks ${r.breaks}, executions ${r.execs}`);
  }
  const T = stat(rs.map((r) => r.T));
  assert(rs.every((r) => r.outcome === 'won'), `the god-mode reader wins every seed (${rs.map((r) => r.outcome).join(', ')})`);
  assert(T.min >= 100 && T.max <= 150, `the fight takes ${T.min.toFixed(0)} - ${T.max.toFixed(0)} s (mean ${T.mean.toFixed(0)}; target 100 - 150)`);
  assert(rs.every((r) => r.perPhase.length === 3 && Math.min(...r.perPhase) >= 25), `each phase at least 25 s (${rs.map((r) => r.perPhase.map((x) => x.toFixed(0)).join('/')).join(' · ')})`);
}

// ================================================================== scenario: bots (mortal readers)
async function scenarioBots() {
  out('\n== scenario BOTS (mortal readers: 95 / 85 / 70 % of his cues answered, whole fights) ==');
  const SEEDS = (process.env.ABYSS_BSEEDS ?? '4242,7,99').split(',').map(Number);
  const SKILLS = (process.env.ABYSS_BSKILLS ?? '0.95,0.85,0.7').split(',').map(Number);
  const by = {};
  for (const skill of SKILLS) {
    for (const seed of SEEDS) {
      const r = fight(seed, { skill });
      (by[skill] ??= []).push(r);
      out(`     ${skill} seed ${String(seed).padEnd(5)} ${r.outcome.padEnd(4)} ${r.T.toFixed(0).padStart(4)} s · phase ${r.phase} bar ${(r.bar * 100).toFixed(0)} % · Last Breaths ${r.breaths} · shattered ${r.shatters} · flasks left ${r.flasks} · parries ${r.parries} · dodges ${r.dodges}${r.killer ? ` · killed by ${r.killer}` : ''}`);
    }
  }
  for (const skill of SKILLS) out(`   ${skill}: won ${by[skill].filter((r) => r.outcome === 'won').length} / ${by[skill].length}`);
  if (process.env.ABYSS_BREPORT) return;
  const won = (k) => (by[k] ?? []).filter((r) => r.outcome === 'won').length / Math.max(1, (by[k] ?? []).length);
  if (by[0.95]) assert(won(0.95) >= 0.66, `the 95 % reader wins most fights (${(won(0.95) * 100).toFixed(0)} %; ten seeds: COMBAT.md)`);
  if (by[0.85] && by[0.7]) assert(won(0.85) >= won(0.7), `the 85 % reader does at least as well as the 70 % one (${(won(0.85) * 100).toFixed(0)} % vs ${(won(0.7) * 100).toFixed(0)} %)`);
  if (by[0.7]) assert(won(0.7) <= 0.34, `the 70 % reader rarely wins (${(won(0.7) * 100).toFixed(0)} %)`);
}

// ================================================================== scenario: strategy (how each answer fares)
async function scenarioStrategy() {
  out('\n== scenario STRATEGY (god mode: parry-first, roll-everything, guard-first; no greed) ==');
  for (const style of ['mixed', 'roll', 'block']) {
    const r = fight(4242, { god: true, style, greedy: false, secs: 240 });
    out(`     ${style.padEnd(6)} ${r.outcome} in ${r.T.toFixed(0)} s · bar ${(r.bar * 100).toFixed(0)} % · parries ${r.parries}, perfect dodges ${r.dodges}, shattered guards ${r.shatters}, breaks ${r.breaks}`);
    if (style === 'block') assert(r.shatters > 0, 'a held guard is shattered, never broken through with health lost (god mode: no health anyway)');
  }
  // the guard rule on its own: a mortal hero who blocks a lone blow with a full meter loses nothing
  const G = build();
  duel(G, { dist: 2.4 });
  const p = G.game.player, d = G.game.dragon;
  G.input.press(1);
  run(G, 0.5);
  d.debug.trigger('mountainPalm');
  run(G, 4, null, () => d.mode === 'foot');
  assert(p.hp === p.maxHp && p.alive, `a held guard against the palm: no health lost (${p.hp})`);
}

// ================================================================== scenario: wreckage (the arena is the clock)
async function scenarioWreckage() {
  out('\n== scenario WRECKAGE (after a whole fight the ring of stones is rubble; nothing threw, no NaN) ==');
  const r = fight(4242, { god: true });
  const W = r.G.game.world.destructibles;
  const posts = W.list.filter((b) => b.kind === 'post'), down = posts.filter((b) => b.state !== 0);
  const inner = posts.filter((b) => b.def?.inner), innerDown = inner.filter((b) => b.state !== 0);
  const floor = W.list.filter((b) => b.floor), broken = floor.filter((b) => b.state !== 0);
  const share = down.length / Math.max(1, posts.length), fshare = broken.length / Math.max(1, floor.length);
  out(`     ${r.outcome} in ${r.T.toFixed(0)} s: striking stones down ${down.length} / ${posts.length} (inner ${innerDown.length} / ${inner.length}); floor touched ${broken.length} / ${floor.length}`);
  assert(share >= TUNING.world.meter.posts, `at least ${TUNING.world.meter.posts * 100} % of the striking stones are down (${(share * 100).toFixed(0)} %)`);
  assert(fshare > 0.05 && fshare < 0.9, `the floor is scarred, not gone (${(fshare * 100).toFixed(0)} % of its plates touched)`);
  if (r.G.payload.size) assert(false, `finite event payloads (${[...r.G.payload].join(', ')})`);
}

// ================================================================== scenario: training
async function scenarioTraining() {
  out('\n== scenario TRAINING (every situation of the Training catalogue for this boss plays out and shows what it promises) ==');
  const G = build(SEED, true);
  const { game } = G;
  duel(G, { dist: 4 });
  const T = game.lab.training;
  const { bossKinds } = await imp('src/dev/training.js');
  const kinds = bossKinds(game);
  assert(kinds.has('hermit') && !kinds.has('duel') && !kinds.has('ash') && !kinds.has('lord'), `his own boss kind (${[...kinds].join(', ')})`);
  const only = process.env.ABYSS_TONLY?.split(',');
  const L = only ? only.map((id) => T.find(id)).filter(Boolean) : T.list();
  const bad = [];
  for (const s of L) {
    T.run(s.id);
    let frames = 0;
    while (T.ph !== 'done' && frames < Math.round(40 / DT)) { G.tick(DT); frames++; }
    const r = T.lastResult;
    const ok = T.ph === 'done' && r?.id === s.id && r.ok;
    if (!ok || process.env.ABYSS_TRACE) out(`   ${ok ? 'ok ' : 'BAD'} ${s.cat} · ${s.name}: ${T.ph} in ${(frames * DT).toFixed(1)} s · missing ${JSON.stringify(r?.missing ?? '?')} · hero ${game.player.state} · boss ${game.dragon.state}`);
    if (!ok) bad.push(s.id);
  }
  T.stop();
  const own = L.filter((s) => s.cat === 'THE HERMIT').length;
  assert((only || (L.length >= 20 && own === 6)) && !bad.length, `every situation plays out and shows what it promises (${L.length - bad.length} of ${L.length}, ${own} of his own${bad.length ? `; not: ${bad.join(', ')}` : ''})`);
}

// ================================================================== scenario: reward (ADR-140)
async function scenarioReward() {
  out('\n== scenario REWARD (ONE BLOW: the registry, the grant on his victory, the turn at PUNCH.at, the punch, off without it) ==');
  const R = await imp('src/game/rewards.js');
  const { PUNCH, CHARGE } = await imp('src/entities/player/combat.js');
  // 1. the registry
  R.resetRewards();
  assert(typeof globalThis.localStorage === 'undefined' && !R.has('oneBlow') && R.list().length === 1 && R.list()[0].on === false, 'headless (no localStorage): nothing learned, the registry in memory');
  assert(R.grant('oneBlow') === true && R.has('oneBlow') && R.grant('oneBlow') === false, 'grant: learned, once (a second grant is not new)');
  assert(R.revoke('oneBlow') === true && !R.has('oneBlow') && R.revoke('oneBlow') === false, 'revoke: forgotten');
  assert(R.grant('nope') === false && !R.has('nope'), 'an unknown id is never learned');
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  R.resetRewards({ storage: store });
  R.grant('oneBlow');
  R.resetRewards({ storage: store }); // the next page load
  assert(R.has('oneBlow') && JSON.parse(mem.get(R.REWARD_KEY)).includes('oneBlow'), `kept in localStorage ${R.REWARD_KEY} across page loads`);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  R.resetRewards({ storage: blocked });
  assert(!R.has('oneBlow') && R.grant('oneBlow') && R.has('oneBlow'), 'a storage that throws: nothing read, the grant holds for the page load');
  R.resetRewards({ storage: store, search: '?level=peak&rewards=none' });
  assert(!R.has('oneBlow') && R.list()[0].kept, '?rewards=none: off for the page load (though kept)');
  R.resetRewards({ search: '?rewards=ALL' });
  assert(R.has('oneBlow') && !R.list()[0].kept, '?rewards=all: on for the page load (nothing kept)');
  R.set('oneBlow', false);
  assert(!R.has('oneBlow'), 'the Lab toggle (set) wins over the URL');
  assert(R.readRewardUrl('?rewards=maybe') === null && R.forLevel('peak') === 'oneBlow' && R.forLevel('ash') === null && R.line('oneBlow') === 'TECHNIQUE LEARNED: ONE BLOW', 'forLevel(peak) = oneBlow, no other level; the banner line');

  // 2. the grant: his victory (the flow) teaches it; another level's does not
  R.resetRewards();
  {
    const G = build();
    duel(G, { dist: 4 });
    const evs = [];
    G.watch = (n, e) => { if (n === 'reward:granted') evs.push(e); };
    G.game.flow.debug.toState('victory');
    run(G, 13, null, () => G.game.state === 'victory');
    run(G, 0.2);
    const sub = G.game.hud.bannerUi?.sub?.textContent;
    assert(G.game.state === 'victory' && R.has('oneBlow') && evs.length === 1 && evs[0].id === 'oneBlow' && evs[0].first === true, `beating him grants ONE BLOW (reward:granted ${JSON.stringify(evs[0] ?? null)})`);
    assert(sub === 'TECHNIQUE LEARNED: ONE BLOW', `the victory banner says it under his line: "${sub}"`);
  }
  R.resetRewards();
  {
    const G = build();
    G.game.level = { ...LVL, id: 'ash' };
    duel(G, { dist: 4 });
    G.game.flow.debug.toState('victory');
    run(G, 13, null, () => G.game.state === 'victory');
    assert(G.game.state === 'victory' && !R.has('oneBlow') && !G.counts['reward:granted'] && !G.game.hud.bannerUi?.sub?.textContent, 'another level\'s victory grants nothing, says nothing');
  }

  // 3. the hold: a frame log of (hold time, state, the attack) until `until` s of hold, then a release
  const hold = (G, until, relAt = Infinity, step = null) => {
    const p = G.game.player, log = [];
    G.input.press(2);
    let released = false;
    run(G, until + 1.6, (g) => {
      step?.(g);
      if (!released && p.hb.t >= relAt) { G.input.up(2); released = true; }
      log.push({ t: G.game.time, h: p.hb.t, held: p.hb.held, st: p.state, kind: p.atk?.def?.kind ?? null, pend: !!p.atk?.pending });
    });
    if (!released) G.input.up(2);
    return log;
  };
  const firstOf = (log, f) => log.find(f) ?? null;
  // 3a. learned: the turn comes at PUNCH.at, not before; released, the punch lands on him
  R.resetRewards({ search: '?rewards=all' });
  const T = TUNING;
  {
    const G = build();
    duel(G, { dist: 2.0 });
    const p = G.game.player, d = G.game.dragon;
    p.debug.god = true;
    let at = null;
    const evs = [];
    G.watch = (n, e) => {
      evs.push(n);
      if (n === 'player:hitDragon' && e.kind === 'punch') at = { ...e, posture: d.posture, guarding: d.guarding };
    };
    const hp0 = d.hp, post0 = d.posture;
    const log = hold(G, 2.3, 2.3);
    const turn = firstOf(log, (r) => r.kind === 'punch');
    const before = log.filter((r) => r.h >= 0.5 && r.h < PUNCH.at - 1e-6);
    assert(PUNCH.on && PUNCH.at === 1.9 && CHARGE.full < PUNCH.at && PUNCH.at < CHARGE.maxHold, `PUNCH.at ${PUNCH.at} s: past the full charge (${CHARGE.full}), before the auto-release (${CHARGE.maxHold})`);
    assert(before.length > 60 && before.every((r) => r.st === 'charge'), `below ${PUNCH.at} s of hold: the charge, as ever (${before.length} frames)`);
    assert(turn && turn.h >= PUNCH.at - 1e-6 && turn.h < PUNCH.at + 2 * DT && turn.st === 'attack' && turn.pend, `the turn at ${turn?.h.toFixed(3)} s of hold: the punch's coil, waiting while held`);
    assert(evs.includes('player:oneBlowReady') && evs.filter((n) => n === 'player:oneBlowReady').length === 1, 'the turn is announced once (player:oneBlowReady: its sound)');
    const fired = firstOf(log, (r) => r.kind === 'punch' && !r.pend);
    assert(fired && fired.h >= 2.3 - 1e-6 && fired.h < 2.3 + 2 * DT, `released at ${fired?.h.toFixed(2)} s: the punch goes`);
    const want = Math.round(PUNCH.damage * (T.parts[at?.part] ?? 1));
    assert(at && at.damage === want && hp0 - d.hp === want && !at.guarded, `ONE BLOW lands: ${at?.damage} damage on his ${at?.part} (${PUNCH.damage} x ${T.parts[at?.part]}), hp ${hp0} -> ${d.hp}`);
    assert(at && Math.abs(at.posture - post0 - PUNCH.posture) < 1e-6, `posture + ${PUNCH.posture} exactly (${post0.toFixed(1)} -> ${at?.posture.toFixed(1)})`);
    assert(d.hp > 0 && d.mode !== 'dying' && p.alive, 'not lethal: he stands');
    assert(!evs.includes('combat:clash') && !evs.includes('dragon:guard'), 'no blade in it: no trade, no clash');
  }
  // 3b. into his raised guard: crushed, he staggers
  {
    const G = build();
    duel(G, { dist: 2.0 });
    const p = G.game.player, d = G.game.dragon;
    p.debug.god = true;
    let at = null;
    const evs = [];
    G.watch = (n, e) => {
      evs.push(n);
      if (n === 'player:hitDragon' && e.kind === 'punch') at = e;
    };
    const hp0 = d.hp;
    let guardUp = false;
    hold(G, 2.2, 2.2, () => {
      if (!at) d.brain.raiseT = 0;
      if (p.atk?.def?.kind === 'punch' && !p.atk.pending && !at) guardUp = guardUp || d.guarding;
    });
    assert(guardUp && PUNCH.poise >= T.guard.crushPoise, `his guard was up as the fist came (poise ${PUNCH.poise} vs crushPoise ${T.guard.crushPoise})`);
    assert(at && at.damage > 0 && d.hp < hp0 && evs.includes('dragon:stagger') && !evs.includes('dragon:guard'), `the guard is crushed: ${at?.damage} damage, he staggers (${evs.filter((n) => n.startsWith('dragon:')).join(', ')})`);
  }
  // 3c. held on: it goes by itself at CHARGE.maxHold; the world behind him takes the force (the real set)
  {
    const G = build(SEED, true);
    duel(G, { dist: 2.0 });
    const p = G.game.player, d = G.game.dragon, W = G.game.world, D = W.destructibles;
    p.debug.god = true;
    // a striking stone 3.4 m behind him along the line, the hero 2 m before him
    const post = D.list.find((b) => b.kind === 'post' && b.state === 0);
    const ux = -post.x / Math.hypot(post.x, post.z), uz = -post.z / Math.hypot(post.x, post.z);
    d.position.set(post.x + ux * 3.4, 0, post.z + uz * 3.4);
    d.yaw = Math.atan2(ux, uz);
    run(G, 0.1);
    place(G, 2.0);
    run(G, 0.1);
    const calls = [];
    const imp0 = W.impact, sw0 = D.sweep.bind(D);
    W.impact = (x, z, r, power, o) => { calls.push({ f: 'impact', x, z, r, power }); return imp0(x, z, r, power, o); };
    D.sweep = (ax, az, bx, bz, r, power, o) => { if (p.atk?.def?.kind === 'punch') calls.push({ f: 'sweep', ax, az, bx, bz, r, power }); return sw0(ax, az, bx, bz, r, power, o); };
    const hp0 = post.hp;
    const log = hold(G, 3.0);
    const fired = firstOf(log, (r) => r.kind === 'punch' && !r.pend);
    assert(fired && Math.abs(fired.h - CHARGE.maxHold) < 2 * DT, `held on, it goes by itself at ${fired?.h.toFixed(2)} s (CHARGE.maxHold ${CHARGE.maxHold})`);
    const ic = calls.find((c) => c.f === 'impact'), sc = calls.find((c) => c.f === 'sweep');
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const carry = sc ? Math.hypot(sc.bx - sc.ax, sc.bz - sc.az) : 0, along = sc ? ((sc.bx - sc.ax) * fx + (sc.bz - sc.az) * fz) / (carry || 1) : 0;
    assert(ic && ic.power === PUNCH.world.power && ic.r === PUNCH.world.radius, `world.impact ${ic?.power} over ${ic?.r} m at the contact`);
    assert(sc && Math.abs(carry - PUNCH.world.carry) < 1e-6 && along > 0.99 && Math.abs(sc.ax - ic.x) < 1e-6, `the force goes on ${carry.toFixed(1)} m behind him along the line (destructibles.sweep, ${sc?.power})`);
    assert(post.hp < hp0 || post.state !== 0, `the striking stone 3.4 m behind him takes it (structure ${hp0.toFixed(2)} -> ${post.hp.toFixed(2)}, state ${post.state})`);
  }
  // 3d. released before the turn: the cleave as ever; PUNCH.on false: the cleave
  {
    const G = build();
    duel(G, { dist: 6 });
    const log = hold(G, 1.5, 1.5);
    assert(!log.some((r) => r.kind === 'punch') && firstOf(log, (r) => r.kind === 'cleave'), 'learned, released at 1.5 s: the cleave');
  }
  {
    PUNCH.on = false;
    try {
      const G = build();
      duel(G, { dist: 6 });
      const log = hold(G, 2.2);
      assert(!log.some((r) => r.kind === 'punch') && firstOf(log, (r) => r.kind === 'cleave'), 'PUNCH.on false: the hold is the cleave');
    } finally {
      PUNCH.on = true;
    }
  }
  // 4. OFF without the reward: the hold is today's: the charge to CHARGE.maxHold, then the cleave
  R.resetRewards();
  {
    const G = build();
    duel(G, { dist: 6 });
    const p = G.game.player;
    let late = null;
    const log = hold(G, 3.0, Infinity, () => { if (p.hb.t >= 2.2 && p.hb.t < 2.3 && !late) late = p.state; });
    const cl = firstOf(log, (r) => r.kind === 'cleave');
    assert(!log.some((r) => r.kind === 'punch') && !G.counts['player:oneBlowReady'] && late === 'charge', `not learned: still the charge at 2.2 s of hold (${late}), never the punch`);
    assert(cl && Math.abs(cl.h - CHARGE.maxHold) < 2 * DT, `... and the cleave lets go by itself at ${cl?.h.toFixed(2)} s, as today`);
  }
  // (the events this scenario adds: the lead puts them in ARCHITECTURE's catalogue; until then they
  // are noted, not failed)
  R.resetRewards();
}

//@@MORE@@

const SCENARIOS = {
  level: scenarioLevel,
  data: scenarioData,
  lethal: scenarioLethal,
  timing: scenarioTiming,
  cover: scenarioCover,
  bare: scenarioBare,
  guard: scenarioGuard,
  phase: scenarioPhase,
  flow: scenarioFlow,
  pace: scenarioPace,
  win: scenarioWin,
  bots: scenarioBots,
  strategy: scenarioStrategy,
  wreckage: scenarioWreckage,
  training: scenarioTraining,
  reward: scenarioReward,
  //@@LIST@@
};

const skip = new Set((process.env.ABYSS_SKIP ?? '').split(',').filter(Boolean));
const list = SCEN === 'all' ? Object.keys(SCENARIOS).filter((k) => !skip.has(k)) : SCEN.split(',');
for (const name of list) {
  const f = SCENARIOS[name];
  if (!f) { assert(false, `no scenario ${name}`); continue; }
  try { await f(); } catch (e) { fails++; out('FAIL', `${name} threw: ${e?.stack?.split('\n').slice(0, 4).join(' | ')}`); }
}
if (SCEN === 'all') {
  const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
  assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
}
out(`\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nHERMIT: ${fails} FAILED` : '\nHERMIT: ALL PASSED');
process.exit(fails ? 1 : 0);
