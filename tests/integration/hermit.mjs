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
  for (const n of ['reward:granted', 'player:oneBlowReady', 'player:oneBlow']) {
    if (!CATALOGUE.has(n) && EMITTED.delete(n)) out(`note: ${n} is not in the event catalogue yet`);
  }
  R.resetRewards();
}

//@@MORE@@

const SCENARIOS = {
  level: scenarioLevel,
  data: scenarioData,
  lethal: scenarioLethal,
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
