// The Skybreak Ring and Tian Lei, the Last Ascendant, headless (MOVES.md): the REAL Player, Ascendant,
// Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles, CameraRig, Events) wired like
// src/main.js for `?level=ring`; the world is a light mock on the real Colliders, filled by the level's
// set (world/skybreakRing.js). A bot drives the input. Copied from lord.mjs (its build, bots, helpers).
// usage: node asc.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI)
//   scenario: level | data | timing | forms | flare | bare | engine | pace | bounds | flow | win | training | all
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
const { createSkybreakRing, RING } = await imp('src/world/skybreakRing.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { Ascendant } = await imp('src/entities/enemies/ascendant/ascendant.js');
const { MOVES, MOVE_NAMES, CLIPS_BY_FORM, COUNTERS, STREAKS, TRANSITIONS, realise } = await imp('src/entities/enemies/ascendant/moves.js');
const { TUNING } = await imp('src/entities/enemies/ascendant/tuning.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

const LVL = getLevel('ring');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 4242);
const DT = 1 / 60;
const FORMS = TUNING.forms;
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
/** The forms a move is used in (its weight; a counter: its own form; a transition: the form before it). */
const formsOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase - 1];
  if (def.counter) return [COUNTERS.indexOf(name) + 1, STREAKS.indexOf(name) + 1].filter((f) => f > 0);
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
  const set = createSkybreakRing(createSharedUniforms(), c);
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
  const set = real ? createSkybreakRing(U, colliders) : null;
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
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('ascendant NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x].every(Number.isFinite)) throw new Error('ascendant limb NaN');
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

/** Title → the duel (the Lab's flow jump), in form `form`, the hero `dist` m in front of him, facing him. */
function duel(G, { dist = 4, ang = 0, ai = false, form = 1 } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
  if (form > 1) d.debug.setForm(form);
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

const settle = (G, max = 8) => run(G, max, null, () => G.game.dragon.mode === 'foot' && ['idle', 'run'].includes(G.game.player.state) && G.game.hitstopTimer <= 0);
const quiet = (d) => d.mode === 'foot' && !d.fx.shotsAlive && !d.fx.crescentsAlive && !d.fx.strikesAlive && !d.ki?.busy && !d.terrain?.busy;

// ---- the defender bot: answers his tells from the flash (parry normal / blue, roll through red)
function makeDefender(G, { skill = 1, early = 0.12, style = 'mixed', rng = null, world = false } = {}) {
  const pend = [];
  const stats = { flashes: 0, parryTry: 0, dodgeTry: 0, skipped: [] };
  return {
    stats,
    onEvent(n, d) {
      if (n === 'combat:flash' && (d?.source === 'dragon' || (world && d?.source === 'world'))) {
        stats.flashes++;
        if (skill < 1 && (rng ?? Math.random)() > skill) { stats.skipped?.push([G.game.time, d.attack]); return; }
        pend.push({ tell: d.tell, at: G.game.time + (d.source === 'world' ? 0.3 : TUNING.flashLead), x: d.x, z: d.z, hazard: !!d.hazard && !d.bullet, done: false });
      }
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.4) pend.splice(i, 1);
      for (const e of pend) {
        const left = e.at - t - DT;
        if (e.tell === TELL.RED || e.tell === TELL.BLACK || style === 'dodge') {
          if (left <= (style === 'parry' ? 0.3 : 0.1)) {
            e.done = true;
            const d = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
            const dx = p.x - d.x, dz = p.z - d.z, l = Math.hypot(dx, dz) || 1;
            input.axis = e.hazard ? { x: dx / l, y: -dz / l } : { x: dz / l, y: dx / l };
            input.tap('Space');
            stats.dodgeTry++;
          }
        } else if (left <= early) {
          e.done = true;
          input.up(1);
          input.click(1);
          stats.parryTry++;
        }
      }
      return pend.some((e) => !e.done && e.at - t < 0.7);
    },
  };
}

/** Fence: keep close, answer every tell, cut in his openings, give the deathblow to a broken boss. */
function fencer(G) {
  const { game, input } = G;
  const p = game.player, d = game.dragon;
  input.axis = { x: 0, y: 0 };
  if (!p.alive || game.state !== 'boss') return;
  p.hp = p.maxHp; // god mode for the win run
  const tgt = new THREE.Vector3();
  d.lockPoint(tgt);
  game.mouseGround.set(tgt.x, 0, tgt.z);
  const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z, dist = Math.hypot(dx, dz);
  if (p.state === 'lock') {
    if (((game.realTime * 60) | 0) % 5 === 0) input.click(0);
    return;
  }
  const busy = G.defend.act();
  if (dist > 2.6 && !busy) input.axis = { x: dx / dist, y: -dz / dist };
  const a = d.brain.act;
  const open = d.broken || (d.mode === 'react' && ['recoil', 'stagger', 'flinch', 'reeling', 'trampled'].includes(d.brain.react?.kind)) || (a && a.t > a.recoveryStart) || p.critTimer > 0;
  const tick = (game.realTime * 60) | 0;
  if (!busy && dist < 3.2 && (open ? tick % 20 === 0 : tick % 70 === 0)) input.click(0);
}

/** Break him and give the deathblow with the hero's own attack press. Returns the form after it. */
function deathblow(G, how = 'posture') {
  const { game, input } = G;
  const d = game.dragon;
  if (how === 'posture') d.debug.postureBreak();
  else d.takeHit({ damage: 99999, exact: true });
  run(G, 0.3);
  place(G, 2.0);
  const was = d.phase;
  run(G, 4, () => { if (((game.realTime * 60) | 0) % 12 === 0 && d.broken) input.click(0); }, () => d.phase !== was || d.mode === 'dying');
  return d.phase;
}

// ================================================================== scenario: level
async function scenarioLevel() {
  out('\n== scenario LEVEL (the registry, the set, the boss slot: he waits, arms folded) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'ring', `levels: ${LEVELS.map((l) => l.id).join(', ')}`);
  assert(['?level=ring', '?lab&level=SKYBREAK', '?level=ascendant', '?level=tianlei'].every((q) => levelFromSearch(q) === LVL), '?level=ring / skybreak / ascendant / tianlei pick the level (case-insensitive)');
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'victory', 'fallen', 'restReset', 'again', 'rise']) if (!LVL.text[k]) assert(false, `the level has its ${k} line`);
  assert(CONFIG.world.dragonBound === RING.floor.r && CONFIG.world.dragonSleep.z === RING.wait.z, 'applyLevel merged the ring\'s layout into CONFIG.world');
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof Ascendant && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'ascendant' && d.object3d.name === 'ascendant', `the boss is his own duelist: ${d.name}`);
  assert(Math.abs(d.drawScale - TUNING.scale) < 1e-9 && Math.abs(d.drawScale / G.game.player.drawScale - 1.12) < 0.02, `drawn 1.12 x the hero (${d.drawScale.toFixed(3)} vs ${G.game.player.drawScale})`);
  assert(d.mode === 'sleep' && d.brain.clip === d.brain.C.meditate && d.lives.total === 3 && d.lives.left === 3 && d.phase === 1, 'he waits standing, arms folded (meditate), three bars');
  assert(!d.rig.root.getObjectByName('weapon') && typeof d.ki?.reset === 'function' && typeof d.terrain?.reset === 'function', 'bare-handed; his ki and terrain objects exist (stubs for the second wave)');
  run(G, 0.3);
  G.game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(d.mode === 'sleep', 'exploring, far off: he does not stir');
  d.startIntro();
  run(G, 3, null, () => d.mode === 'foot');
  assert(G.counts['dragon:wake'] === 1 && G.counts['dragon:introDone'] === 1 && d.mode === 'foot', 'woken: he opens his eyes, unfolds his arms and drops into his stance');
}

// ================================================================== scenario: data (the move rules)
async function scenarioData() {
  out('\n== scenario DATA (move data rules in every form a move is used in, both ends of every random roll) ==');
  let checked = 0;
  // (MOVES.md: no white blow above 26, black 36; a red blow as the Lord's Crushing Dark, 30 at most)
  const CAP = { [TELL.NORMAL]: 26, [TELL.BLUE]: 26, [TELL.RED]: 30, [TELL.BLACK]: 36 };
  const strings = [0, 0, 0, 0], count = [0, 0, 0, 0];
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const forms = formsOf(name);
    if (!forms.length) assert(false, `${name}: used in at least one form`);
    if (!def.transition && !def.counter && !(Array.isArray(def.weight) && def.weight.length === FORMS)) assert(false, `${name}: a weight per form`);
    for (const f of forms) {
      if (!def.transition && !def.counter) count[f]++;
      let most = 0;
      for (const r of [0, 0.35, 0.7, 0.999]) {
        const A = realise(name, f, () => r);
        const real = A.beats.filter((b) => !b.feint);
        most = Math.max(most, real.length);
        const tag = `${name} form ${f} r${r}`;
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        const first = real[0];
        if (!def.transition && !(first && first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first real windup ${first ? (first.impact - first.tellAt).toFixed(3) : '-'} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TUNING.minHitGap}`);
        for (const b of real) if (!(b.flash >= b.tellAt - 1e-6)) assert(false, `${tag}: hit ${b.hit} flashes after its tell`);
        for (let i = 1; i < real.length; i++) if (!(real[i].flash >= real[i - 1].impact - 1e-6)) assert(false, `${tag}: hit ${i}'s flash comes after hit ${i - 1} lands`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone, a release or a cast`);
        for (const b of real) if (b.def.tell === TELL.RED && b.def.zone?.kind === 'ring' && !b.def.ring) assert(false, `${tag}: a red ring has its \`ring\``);
        for (const b of real) if (b.def.zone && !b.def.part) assert(false, `${tag}: hit ${b.hit} says which limb strikes (part)`);
        for (const b of real) if (!def.transition && b.def.damage > CAP[b.def.tell]) assert(false, `${tag}: hit ${b.hit} ${b.def.damage} damage (white / blue ≤ 26, red ≤ 30, black ≤ 36)`);
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        if (!(A.clip.kit === CLIPS_BY_FORM[(def.transition ? def.phase : f) - 1].clash.kit)) assert(false, `${tag}: compiled round its form's stance`);
        checked++;
      }
      if (most >= 5) strings[f]++;
    }
  }
  assert(checked > 80, `${checked} realisations obey the rules (a tell and a limb per hit, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart, each flash after the hit before it, white / blue ≤ 26, red ≤ 30, black ≤ 36)`);
  for (let f = 1; f <= FORMS; f++) assert(count[f] >= 6 && strings[f] >= 2, `form ${f}: ${count[f]} moves, ${strings[f]} strings of five hits or more`);
  for (let f = 1; f <= FORMS; f++) {
    const six = MOVE_NAMES.filter((n) => weightIn(MOVES[n], f) > 0 && realise(n, f, () => 0.2).beats.filter((b) => !b.feint).length >= 6);
    const varied = six.filter((n) => MOVES[n].beats.some((b) => Array.isArray(b.pick) || b.chance < 1));
    assert(six.length >= 1 && varied.length >= 1, `form ${f} has a six-hit string that varies (${six.join(', ')})`);
  }
  for (const [ph, mv] of Object.entries(TRANSITIONS)) assert(MOVES[mv]?.transition && MOVES[mv].phase === Number(ph) && Math.abs(realise(mv, Number(ph) - 1, () => 0.5).beats[0].impact - TUNING.transform.windup) < 1e-6, `form ${ph} begins with ${mv} (${TUNING.transform.windup} s, then the ring)`);
  assert(COUNTERS.length === FORMS && COUNTERS.every((n, i) => MOVES[n]?.counter && realise(n, i + 1, () => 0.5)) && STREAKS.every((n) => MOVES[n]?.streak), 'every form has its counter and its flurry');
  assert(TUNING.flashLead <= TUNING.minHitGap + 1e-9, `the glint (${TUNING.flashLead} s) fits inside the tightest gap (${TUNING.minHitGap} s)`);
  const gap = (f) => { const A = realise(f === 1 ? 'gates' : f === 2 ? 'goldenGates' : 'thousand', f, () => 0.2); const h = A.beats.filter((b) => !b.feint); return h[1].impact - h[0].impact; };
  const gaps = [1, 2, 3].map(gap);
  assert(gaps[0] > gaps[1] && gaps[1] > gaps[2] && gaps[2] >= TUNING.minHitGap, `a string's hits come faster form by form: ${gaps.map((g) => g.toFixed(3)).join(' > ')} s`);
  // harder forms: more pressure, not more damage (the windups shorten; no move hits harder in a later form)
  assert(TUNING.windupScale.every((w, i) => i === 0 || w < TUNING.windupScale[i - 1]) && TUNING.recoveryScale.every((w, i) => i === 0 || w < TUNING.recoveryScale[i - 1]), 'windups and recoveries shorten form by form');
  // a mikiri and a lock in every form
  const flat = (n) => MOVES[n].beats.flatMap((b) => (Array.isArray(b.pick) ? b.pick : [b]));
  for (let f = 1; f <= FORMS; f++) {
    const inF = MOVE_NAMES.filter((n) => weightIn(MOVES[n], f) > 0 && MOVES[n].phase <= f);
    const mik = inF.filter((n) => flat(n).some((b) => b.mikiri)), lock = inF.filter((n) => flat(n).some((b) => b.lock));
    assert(mik.length >= 1 && lock.length >= 1, `form ${f}: a perilous thrust (${mik.join(', ')}) and a lock (${lock.join(', ')})`);
  }
}

// ================================================================== scenario: timing (flash → contact)
async function scenarioTiming() {
  out('\n== scenario TIMING (every move from inside its band: each glint is a blow, on time) ==');
  let worst = 0, moves = 0;
  const only = process.env.ABYSS_TMOVE;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    if (def.transition || def.terrain || def.ki || def.hidden) continue;
    if (only && name !== only) continue;
    for (const f of formsOf(name)) {
      const G = build();
      const d = G.game.dragon;
      const [lo, hi] = def.band;
      const at = def.counter ? 2.2 : Math.max(1.6, Math.min(hi - 0.4, lo + (Math.min(hi, 12) - lo) * 0.4));
      duel(G, { dist: at, form: f });
      G.game.player.debug.god = true;
      const flashes = [], contacts = [];
      G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') { flashes.push(G.game.time); if (only) out(`       ${G.game.time.toFixed(3)} flash ${e.attack} ${e.tell}`); } };
      const h0 = G.hits.length;
      if (!d.debug.trigger(name)) { assert(false, `${name} form ${f}: starts`); continue; }
      run(G, 9, null, () => quiet(d));
      for (const h of G.hits.slice(h0)) if (h.r !== RESULT.IGNORED) { contacts.push(h.t); if (only) out(`       ${h.t.toFixed(3)} contact ${h.attack} ${h.kind} ${h.r}`); }
      let w = 0;
      for (const c of contacts) {
        const fl = flashes.filter((t) => t <= c + 1e-6).pop();
        w = Math.max(w, fl === undefined ? Infinity : Math.abs(c - fl - TUNING.flashLead));
      }
      worst = Math.max(worst, Number.isFinite(w) ? w : 9);
      moves++;
      if (!(contacts.length >= 1) || !(w <= 0.09)) assert(false, `${name} form ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
      else out(`     ${name.padEnd(13)} form ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
    }
  }
  if (only) return;
  assert(moves >= 20 && worst <= 0.09, `${moves} move × form runs: every contact within ${(worst * 1000).toFixed(0)} ms of its flash + ${TUNING.flashLead} s, and every move's first hit lands`);
}

// ================================================================== scenario: forms (three bars, a deathblow each)
async function scenarioForms() {
  out('\n== scenario FORMS (three bars: a bar emptied or posture broken → the deathblow → the transformation) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 2.2 });
  game.player.debug.god = true;
  d.posture = 0;
  d.addPosture(POSTURE.parry.normal);
  const full = d.posture;
  d.posture = 0;
  d.hp = d.maxHp * 0.1;
  d.addPosture(POSTURE.parry.normal);
  const low = d.posture;
  d.posture = 0;
  d.hp = d.maxHp;
  assert(Math.abs(full - POSTURE.parry.normal * TUNING.posture.gainByHp[0]) < 1e-6 && low > full * 2, `the Sekiro rule: a parry moves his posture ${full.toFixed(1)} on a full bar, ${low.toFixed(1)} on a bar nearly empty`);
  const dealt = d.takeHit({ damage: 99999, exact: true });
  assert(dealt > 0 && d.hp === 0 && d.broken && d.mode === 'broken' && d.state === 'staggered' && !G.counts['dragon:death'], 'an empty bar breaks him (no death): on one knee');
  run(G, TUNING.posture.breakTime + 0.3);
  assert(!d.broken && Math.abs(d.hp - d.maxHp * TUNING.posture.spared.hp) < 1e-6 && d.posture > 0 && d.phase === 1, `a break left alone: he rises with ${Math.round(d.hp)} HP and half the meter`);
  // the deathblow, with the hero's own attack press
  let f = deathblow(G, 'hp');
  assert(f === 2 && G.counts['dragon:plunged'] === 1 && G.counts['dragon:phase2'] === 1 && d.lives.left === 2 && d.hp === d.maxHp, `the deathblow ends form 1: form ${f}, ${d.lives.left} pips left, a full bar`);
  assert(d._changing && d.brain.act?.name === 'ascend2' && d.takeHit({ damage: 50 }) === 0 && d.hp === d.maxHp, 'through the transformation nothing lands on him');
  const tAsc = game.time;
  let ringAt = -1;
  G.watch = (n, e) => { if (n === 'combat:flash' && e?.attack === 'ascend2') ringAt = game.time + TUNING.flashLead; };
  run(G, 5, null, () => d.mode === 'foot');
  G.watch = null;
  assert(!d._changing && d.mode === 'foot' && G.counters.flares >= 1 && ringAt - tAsc > TUNING.transform.windup - 0.3, `the transformation's ring goes out ${(ringAt - tAsc).toFixed(2)} s in (the light flared), then he can be struck again`);
  assert(d.maxPosture === TUNING.posture.max[1] && d.posture === 0 && d.pilot.form === 2, 'form 2 has its own posture meter and stance');
  run(G, 0.2);
  assert(game.hud.lifeEls.filter((e) => e.classList.contains('gone')).length === 1, 'the boss bar spent one pip');
  f = deathblow(G, 'posture');
  run(G, 5, null, () => d.mode === 'foot');
  assert(f === 3 && d.lives.left === 1 && G.counts['dragon:phase3'] === 1 && d.maxPosture === TUNING.posture.max[2], 'a posture break and the deathblow: form 3 (Thunder Ascension)');
  deathblow(G, 'posture');
  assert(d.mode === 'dying' && G.counts['dragon:death'] === 1, 'the third deathblow kills him');
  run(G, 7, null, () => d.mode === 'dead');
  assert(d.mode === 'dead' && d.lives.left === 0 && G.counts['dragon:dead'] === 1 && d.hurtSpheres.length === 0, 'he falls and is gone');
  run(G, 4);
  assert(game.state === 'victory', `the flow ends in victory (${game.state})`);
  d.reset();
  assert(d.phase === 1 && d.lives.left === 3 && d.hp === d.maxHp && d.mode === 'sleep' && !d._changing, 'reset: waiting again, form 1');
  // the Lab's jumps
  const G2 = build();
  duel(G2, { dist: 6 });
  const d2 = G2.game.dragon;
  assert(d2.debug.phase2() && d2.phase === 2 && !d2.debug.phase4(), 'Lab: Phase 2 starts the next transformation; there is no fourth');
  run(G2, 5, null, () => d2.mode === 'foot');
  assert(d2.debug.setForm(3) && d2.phase === 3 && d2.debug.form === 3 && d2.debug.setForm(1) && d2.phase === 1, 'Lab: setForm jumps to any form');
}

// ================================================================== scenario: flare (his moments)
async function scenarioFlare() {
  out('\n== scenario FLARE (parry moments, exactly one charged blow per form, red blows) ==');
  const flat = (n) => MOVES[n].beats.flatMap((b) => (Array.isArray(b.pick) ? b.pick : [b]));
  const inForm = (n, f) => weightIn(MOVES[n], f) > 0 && MOVES[n].phase <= f;
  const BLACK = { 1: 'splitFist', 2: 'sunbreaker', 3: 'sunbreaker' };
  for (const f of [1, 2, 3]) {
    const parry = MOVE_NAMES.filter((n) => inForm(n, f) && flat(n).some((b) => b.flare && b.tell === TELL.BLUE));
    const black = MOVE_NAMES.filter((n) => inForm(n, f) && flat(n).some((b) => b.tell === TELL.BLACK));
    const red = MOVE_NAMES.filter((n) => inForm(n, f) && flat(n).some((b) => b.tell === TELL.RED && b.zone && !b.cast));
    assert(parry.length >= 1 && black.length === 1 && black[0] === BLACK[f] && red.length >= 2, `form ${f}: parry moments ${parry.join(', ')}; charged ${black.join(', ')}; ${red.length} moves with a red blow`);
  }
  const G = build();
  duel(G, { dist: 3.0 });
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  const play = (name, dist, act = null, max = 6, form = 1, hold = 1.6) => {
    settle(G);
    if (d.phase !== form) d.debug.setForm(form);
    run(G, 0.3);
    d.position.set(0, 0, -2);
    d.yaw = 0;
    place(G, dist);
    run(G, 0.3);
    p.guard = p.maxGuard;
    p.streak = 0;
    const ev = [];
    let flashT = null, warnPre = 0, charges = 0;
    const fx = d.fx, ch = fx.charge;
    fx.charge = (...a) => { charges++; return ch.apply(fx, a); };
    const h0 = G.hits.length, hp0 = p.hp;
    G.watch = (n, e) => { ev.push([n, e ? { ...e } : e]); if (n === 'combat:flash' && e?.attack === name && flashT === null) flashT = game.time; };
    d.debug.trigger(name);
    run(G, max, () => {
      game.mouseGround.set(d.position.x, 0, d.position.z);
      if (flashT === null && d.mode === 'act') warnPre = Math.max(warnPre, d.warn);
      act?.(flashT);
    }, () => flashT !== null && game.time > flashT + hold && p.state !== 'flurry' && game.hitstopTimer <= 0);
    G.watch = null;
    fx.charge = ch;
    input.up(1);
    return { ev, flashT, warnPre, charges, hits: G.hits.slice(h0), lost: hp0 - p.hp, has: (n) => ev.some((x) => x[0] === n), get: (n) => ev.find((x) => x[0] === n)?.[1], all: (n) => ev.filter((x) => x[0] === n).map((x) => x[1]) };
  };
  const at = (fT, lead) => fT !== null && game.time >= fT + TUNING.flashLead - lead - DT;
  // (Piercing Palm, a red perilous thrust, flares red; Mountain-Splitting Fist charges black)
  p.debug.god = true;
  const pp = play('piercingPalm', 3.4);
  const pf = pp.all('combat:flash').filter((e) => e.attack === 'piercingPalm');
  assert(pf.length === 1 && pf[0].tell === TELL.RED && pf[0].perilous === true, `Piercing Palm: one red flare, perilous (a mikiri answers it): ${pf.length}`);
  p.debug.god = false;
  let g0 = null;
  const split = play('splitFist', 3.0, () => { input.press(1); if (g0 === null && G.hits.some((h) => h.attack === 'splitFist')) g0 = p.guard; });
  const sh = split.hits.find((h) => h.attack === 'splitFist');
  assert(split.get('combat:tell')?.tell === TELL.BLACK && split.has('combat:charge') && split.charges > 20 && split.warnPre > 0.5, `Mountain-Splitting Fist: tell black, the charge drawn through its windup (${split.charges} frames), his body darkening (${split.warnPre.toFixed(2)})`);
  assert(sh?.r === RESULT.BLOCKED && split.lost === 0 && g0 === 0 && split.get('player:guardOpen')?.black === true, `on a held guard it is stopped (${sh?.r}), no HP lost, the guard meter gone (${g0}) and the guard knocked open`);
  const bare = play('splitFist', 3.0);
  assert(bare.hits.find((h) => h.attack === 'splitFist')?.r === RESULT.HIT && bare.lost > 25, `unanswered it lands: ${bare.lost.toFixed(0)} HP`);
  // a parry moment: Hundred Hands parried blow for blow; its palm thrust (a blue flare) ends his string
  // and the hero counters
  p.debug.god = true;
  G.defend = makeDefender(G);
  const hun = play('hundred', 2.2, () => G.defend.act(), 9, 1, 5);
  G.defend = null;
  const pal = hun.all('combat:flash').filter((x) => x.attack === 'hundred' && x.flare);
  const cnt = hun.get('player:flareCounter');
  assert(pal.length === 1 && pal[0].tell === TELL.BLUE && hun.all('dragon:parried').some((x) => x.flare && x.last) && !!cnt, `Hundred Hands: the palm thrust is a blue flare (${pal.length}); parried, his string ends and the hero counters (${cnt ? `${cnt.strikes} blow(s)` : 'no counter'})`);
  void at;
}

// ================================================================== scenario: bare (no blade assumption misfires)
async function scenarioBare() {
  out('\n== scenario BARE (bare hands: his limbs, the parry, the guard clash, the trade, the lock, the mikiri, the full deflect) ==');
  const G = build();
  duel(G, { dist: 2.4 });
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  p.debug.god = true;
  // tellPoint: each part is the end of that limb, on his body (within a body's reach of his root)
  run(G, 0.2);
  const parts = ['fistR', 'fistL', 'footR', 'footL', 'kneeR', 'kneeL', 'elbowR', 'elbowL', 'palms', 'shoulder', 'feet'];
  const v = new THREE.Vector3();
  const near = parts.every((k) => { d.tellPoint(k, v); return Number.isFinite(v.x + v.y + v.z) && Math.hypot(v.x - d.position.x, v.z - d.position.z) < 1.4 && v.y > 0 && v.y < 2.6; });
  d.tellPoint('footR', v);
  const footY = v.y;
  d.tellPoint('fistR', v);
  assert(near && footY < v.y, `tellPoint for ${parts.length} parts: each a point of his body (a foot ${footY.toFixed(2)} m, the right fist ${v.y.toFixed(2)} m)`);
  // through a kick his "blade" is the shin; through a punch the forearm
  d.debug.trigger('meteorStep');
  let kickSeg = 0, partSeen = '';
  run(G, 2, () => { if (d.mode === 'act' && d._part === 'footR') { kickSeg = Math.max(kickSeg, d._tip.distanceTo(d._hilt)); partSeen = d._part; } }, () => quiet(d));
  assert(partSeen === 'footR' && kickSeg > 0.3 && kickSeg < 0.8, `through a kick his blade is the shin (${kickSeg.toFixed(2)} m)`);
  // the parry of a punch: the contact shown on the fist, his string goes on (a deflect), the last recoils him
  const parryRun = (name, dist, mode = 'parry') => {
    settle(G);
    d.position.set(0, 0, -2);
    d.yaw = 0;
    place(G, dist);
    run(G, 0.3);
    const ev = [];
    const pend = [];
    G.watch = (n, e) => { ev.push(n); if (n === 'combat:flash' && e?.source === 'dragon') pend.push({ t: game.time + TUNING.flashLead, tell: e.tell, done: false }); };
    const h0 = G.hits.length;
    d.debug.trigger(name);
    run(G, 8, () => {
      game.mouseGround.set(d.position.x, 0, d.position.z);
      if (p.state === 'lock') { if (((game.realTime * 60) | 0) % 4 === 0) input.click(0); return; }
      for (const e of pend) {
        if (e.done) continue;
        const left = e.t - game.time;
        const lead = mode === 'perfect' ? 0.05 : mode === 'trade' ? 0.12 : mode === 'mikiri' ? 0.15 : 0.12;
        if (left <= lead) {
          e.done = true;
          if (mode === 'trade') input.click(0);
          else if (mode === 'mikiri') { const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz) || 1; input.axis = { x: dx / l, y: -dz / l }; input.tap('Space'); }
          else { input.up(1); input.click(1); }
        }
      }
    }, () => quiet(d) && game.hitstopTimer <= 0 && !['lock', 'flurry', 'roll', 'attack', 'riposte'].includes(p.state));
    G.watch = null;
    input.up(1);
    input.axis = { x: 0, y: 0 };
    return { ev, hits: G.hits.slice(h0), has: (n) => ev.includes(n), count: (n) => ev.filter((x) => x === n).length };
  };
  const par = parryRun('ironMountain', 2.6);
  const parried = par.hits.filter((h) => h.r === RESULT.PARRIED).length;
  assert(parried >= 2 && par.has('dragon:parried') && (par.has('combat:deflectChain') || parried >= 2) && !G.payload.size, `Iron Mountain parried blow for blow: ${parried} parried (the shoulder deflected, the palm recoils him)`);
  // a full deflect of a long string (Hundred Hands: eight blows)
  const fd = parryRun('hundred', 2.2);
  assert(fd.has('dragon:deflected') || fd.has('player:flareCounter'), `Hundred Hands parried whole: ${fd.hits.filter((h) => h.r === RESULT.PARRIED).length} parried → ${fd.has('dragon:deflected') ? 'the full deflect' : 'the moment\'s counter'}`);
  // the guard clash on his forearm: the hero cuts into his raised guard
  settle(G);
  d.position.set(0, 0, -2);
  d.yaw = 0;
  place(G, 1.9);
  run(G, 0.4);
  let guardAt = null;
  const fxg = d.fx.guard;
  d.fx.guard = (x, y, z, o) => { guardAt ??= { x, y, z, part: d._part }; return fxg.call(d.fx, x, y, z, o); };
  run(G, 2, () => { if (((game.realTime * 60) | 0) % 25 === 0) input.click(0); }, () => !!guardAt);
  d.fx.guard = fxg;
  const fore = guardAt ? Math.hypot(guardAt.x - d.position.x, guardAt.z - d.position.z) : 9;
  assert(!!guardAt && (guardAt.part === 'fistL' || guardAt.part === 'fistR') && fore < 1.3 && guardAt.y > 0.6 && guardAt.y < 2.2, `his guard turns the cut on a forearm (${guardAt?.part}, ${fore.toFixed(2)} m from his root, ${guardAt?.y?.toFixed(2)} m up)`);
  // a trade: the hero's cut meets his blow
  const tr = parryRun('gates', 2.2, 'trade');
  assert(tr.hits.some((h) => h.r === RESULT.CLASHED) || G.counts['player:trade'] > 0 || tr.has('dragon:guard'), `a trade against his fists ends sanely (${tr.hits.map((h) => h.r).join(' ')})`);
  // the lock: a perfect parry of a lock blow, the hero mashes and wins
  d.debug.setForm(2);
  run(G, 0.4);
  const lk = parryRun('vanishStep', 2.2, 'perfect');
  assert(lk.has('player:lock') && (lk.has('dragon:windup')) && d.mode !== 'act', `Vanishing Step's last blow perfect-parried: the lock (${lk.count('player:lock')} lock events), it ends (${d.mode} ${d.brain.react?.kind ?? ''})`);
  // the mikiri: a roll INTO the Piercing Palm
  d.debug.setForm(1);
  run(G, 0.4);
  const mk = parryRun('piercingPalm', 3.4, 'mikiri');
  assert(mk.has('player:mikiri') && G.counts['dragon:stagger'] > 0, `a roll into Piercing Palm is the mikiri (${mk.has('player:mikiri')})`);
  assert(!G.payload.size, `no non-finite payload in his events (${[...G.payload].join(', ')})`);
}

// ================================================================== scenario: engine (the four patches)
async function scenarioEngine() {
  out('\n== scenario ENGINE (a zone off his root, hits from the air, a sustained beat, the lock at range) ==');
  const { X } = await imp('src/entities/enemies/ascendant/moves.js');
  const { N, B, R } = X.TELL;
  const G = build();
  duel(G, { dist: 2.0 });
  const { game, input } = G;
  const d = game.dragon, p = game.player, br = d.brain;
  p.debug.god = true;
  // 1. zone.fwd / zone.side: a ring 1 m round a point 3 m ahead of him
  d.position.set(0, 0, 0);
  d.yaw = 0;
  const sense = (x, z) => ({ dx: x, dz: z, dist: Math.hypot(x, z), ang: Math.atan2(x, z), p: { x, z } });
  const Z = { kind: 'ring', r: 0.6, fwd: 3 };
  const zr = [br._inZone(Z, sense(0, 3)), br._inZone(Z, sense(0, 0.3)), br._inZone({ ...Z, side: 2 }, sense(2, 3)), br._inZone({ ...Z, side: 2 }, sense(-2, 3))];
  const line = br._inZone({ kind: 'line', r: 1, w: 0.4, fwd: 2 }, sense(0, 2.6)) && !br._inZone({ kind: 'line', r: 1, w: 0.4, fwd: 2 }, sense(0, 0.4));
  assert(zr[0] && !zr[1] && zr[2] && !zr[3] && line && br._ideal(Z) > 3 && br._reach({ def: { zone: Z }, close: 0 }) > 4, `a zone ahead of him / to his left is tested round its own centre (${zr.join(' ')}, line ${line})`);
  // 2. hits from the air: a move that lifts him 3 m, a blow up there marked `air`, one not marked, down again
  MOVES.__air = {
    label: 'test: air', phase: 1, weight: 0, manual: true, hidden: true, cooldown: 0, band: [0, 9], recovery: 0.4,
    beats: [
      { tell: N, windup: 0.5, active: 0.1, damage: 5, knockback: 0, zone: { kind: 'ring', r: 3.6 }, part: 'feet', close: 0, lift: [[0, 0], [0.9, 3]], air: true, keys: [] },
      { tell: N, windup: 0.4, active: 0.1, damage: 5, knockback: 0, zone: { kind: 'ring', r: 3.6 }, part: 'feet', close: 0, keys: [] },
      { tell: B, windup: 0.4, active: 0.1, damage: 5, knockback: 0, zone: { kind: 'ring', r: 3.6 }, part: 'feet', close: 0, air: true, keys: [] },
      { tell: N, windup: 0.5, active: 0.1, damage: 5, knockback: 0, zone: { kind: 'ring', r: 3.6 }, part: 'feet', close: 0, lift: [[0, 3], [1, 0]], keys: [] },
    ],
  };
  settle(G);
  place(G, 2.0);
  const h0 = G.hits.length;
  let topBetween = 0;
  d.debug.trigger('__air');
  run(G, 4, () => { const a = br.act; if (a && a.t > a.beats[1].start && a.t < a.beats[2].end) topBetween = Math.max(topBetween, d.position.y); }, () => d.mode === 'foot');
  const air = G.hits.slice(h0).filter((h) => h.attack === '__air' && h.r !== RESULT.IGNORED);
  assert(air.length === 3 && topBetween > 2.9 && d.position.y === 0, `held 3 m up between beats (${topBetween.toFixed(2)} m), the two \`air\` blows and the landing reach the hero, the unmarked one up there does not (${air.length} contacts)`);
  // a stagger in the air drops him (T.airFall), it does not snap him to the floor
  d.debug.trigger('__air');
  run(G, 0.55);
  const y0 = d.position.y;
  d.brain.startReact('stagger');
  run(G, 2 * DT);
  const y1 = d.position.y;
  run(G, 1);
  assert(y0 > 2 && y1 > 1 && y1 < y0 && d.position.y === 0, `a stagger at ${y0.toFixed(2)} m drops him (${y1.toFixed(2)} m two frames on), then he is on the floor`);
  // 3. a sustained beat: lit 1.2 s, a tick every 0.2 s; the ledger's interval holds the other answer off
  MOVES.__beam = {
    label: 'test: sustain', phase: 1, weight: 0, manual: true, hidden: true, cooldown: 0, band: [0, 20], recovery: 0.4,
    beats: [
      { tell: R, windup: 0.6, fixed: true, active: 0.1, damage: 5, knockback: 0, zone: { kind: 'line', r: 12, w: 1.6 }, part: 'palms', close: 0, track: 0.85, sustain: { dur: 1.2, tick: 0.2 }, keys: [] },
      { tell: N, windup: 0.4, active: 0.1, damage: 5, knockback: 0, zone: { kind: 'sector', r: 3, ang: 1 }, part: 'fistR', close: 0, keys: [] },
    ],
  };
  settle(G);
  place(G, 5);
  const ticks = [];
  d.onSustain = (b, s, a, k) => ticks.push([game.time, k]);
  let conflictIn = null, conflictOut = null, endedAt = 0, startT = 0;
  const A = realise('__beam', 1, () => 0.5);
  d.debug.trigger('__beam');
  startT = game.time;
  run(G, 4, () => {
    const a = br.act;
    if (a?.name === '__beam' && conflictIn === null && a.t > a.beats[0].impact + 0.5) conflictIn = br.ledger.conflict(game.time + 0.2, 1, 0.3);
    if (a?.name === '__beam' && conflictOut === null && a.t > a.beats[0].impact + 0.5) conflictOut = br.ledger.conflict(game.time + 1.4, 1, 0.3);
    if (a?.name === '__beam') endedAt = game.time;
  }, () => d.mode === 'foot');
  delete d.onSustain;
  const span = ticks.length ? ticks[ticks.length - 1][0] - ticks[0][0] : 0;
  assert(Math.abs(A.beats[0].end - A.beats[0].impact - 1.3) < 1e-6 && A.beats[1].start >= A.beats[0].end - 1e-9, `realise: the lit beat ends 1.3 s after its impact (active + dur) and the next waits (${(A.beats[0].end - A.beats[0].impact).toFixed(2)})`);
  assert(ticks.length >= 5 && ticks.length <= 7 && span > 0.9 && ticks.every(([, k], i) => i === 0 || k > ticks[i - 1][1]), `d.onSustain ticks every 0.2 s through the lit window (${ticks.length} ticks over ${span.toFixed(2)} s, k ${ticks.map((x) => x[1].toFixed(2)).join(' ')})`);
  assert(conflictIn === true && conflictOut === false, `the ledger knows the whole lit window: a guard-answer impact inside it conflicts (${conflictIn}), one past it does not (${conflictOut})`);
  assert(endedAt - startT > 0.6 + 1.3 + 0.4, `the string after it waited for it (the move ran ${(endedAt - startT).toFixed(2)} s)`);
  // 4. the lock at range: startBladeLock takes L.dist and the pair settles there
  settle(G);
  place(G, 6);
  run(G, 0.2);
  const okLock = br.startLock({ dist: 6 });
  let dmax = 0, dmin = 99;
  run(G, 1.0, () => { const dd = Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z); dmax = Math.max(dmax, dd); dmin = Math.min(dmin, dd); });
  assert(okLock && p.state === 'lock' && p.bladeLock?.dist === 6 && dmin > 4.5, `a lock at 6 m: the hero is held there, not drawn in to 1.3 m (${dmin.toFixed(2)} - ${dmax.toFixed(2)} m)`);
  run(G, 4, () => { if (((game.realTime * 60) | 0) % 4 === 0) input.click(0); }, () => p.state !== 'lock');
  delete MOVES.__air;
  delete MOVES.__beam;
  assert(p.state !== 'lock', 'and it ends');
}

// ================================================================== scenario: pace (the director's meter)
function paceDefender(G) {
  const pend = [];
  let guardUntil = -1;
  const leadOf = (src) => (src === 'world' ? 0.3 : TUNING.flashLead);
  return {
    onEvent(n, e) {
      if (n !== 'combat:flash' || (e?.source !== 'dragon' && e?.source !== 'world')) return;
      pend.push({ tell: e.tell, at: G.game.time + leadOf(e.source), x: e.x, z: e.z, hazard: !!e.hazard && !e.bullet, done: false });
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.5) pend.splice(i, 1);
      let rolled = false;
      for (const e of pend) {
        if (e.done) continue;
        const left = e.at - t - DT;
        if (e.tell === TELL.RED || e.tell === TELL.BLACK) {
          if (left <= 0.28) {
            e.done = true;
            input.up(1);
            guardUntil = -1;
            const c = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
            const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
            let wx = e.hazard ? dx / l : -dz / l, wz = e.hazard ? dz / l : dx / l;
            const B = (CONFIG.world.dragonBound ?? 12) - 1;
            if (Math.hypot(p.x + wx * 3, p.z + wz * 3) > B) { wx = -wx; wz = -wz; }
            input.axis = { x: wx, y: -wz };
            input.tap('Space');
            rolled = true;
          }
        } else {
          e.done = true;
          guardUntil = Math.max(guardUntil, e.at + 0.2);
        }
      }
      if (guardUntil > t) input.press(1);
      else if (guardUntil > 0) { guardUntil = -1; input.up(1); }
      return rolled;
    },
  };
}

async function scenarioPace() {
  out('\n== scenario PACE (a steady defender in god mode vs his AI, per form: cues, gaps, mix, chains, conflicts) ==');
  const DIR = await imp('src/entities/enemies/duelist/director.js');
  const SECS = Number(process.env.ABYSS_PSECS ?? 120);
  const SEEDS = (process.env.ABYSS_PSEEDS ?? '4242,7,99').split(',').map(Number).filter(Number.isFinite);
  const answer = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? 'dodge' : 'guard');
  const skip = (name) => !MOVES[name] || MOVES[name].transition || MOVES[name].counter;
  const rows = [];
  const B = (CONFIG.world.dragonBound ?? 12) - 1;
  for (const seed of SEEDS) {
    for (let ph = 1; ph <= FORMS; ph++) {
      const G = build(seed, true);
      const { game } = G;
      const d = game.dragon, p = game.player;
      duel(G, { dist: 3, ai: true, form: ph });
      p.debug.god = true;
      p.debug.noRiposte = true;
      G.defend = paceDefender(G);
      Math.random = mulberry32(seed * 7 + ph);
      const flashes = [], acts = [], cats = {}, busyT = [];
      let chained = 0, prevAct = null, prevMode = d.mode;
      const s0 = { ...(d.brain.stats ?? {}) };
      G.watch = (n, e) => {
        if (n === 'combat:flash' && (e?.source === 'dragon' || e?.source === 'world')) flashes.push([game.time, e.tell, e.attack]);
        if (n === 'combat:charge' && Number.isFinite(e?.dur)) for (let k = 0; k < e.dur; k += 0.1) busyT.push(game.time + k);
        if (n === 'dragon:windup' && !skip(e?.name)) { acts.push([game.time, e.name]); const c = DIR.categoryOf(MOVES[e.name]); cats[c] = (cats[c] || 0) + 1; }
      };
      const roam = mulberry32(seed * 31 + ph), goal = { r: 2.5, a: 0, until: -1 };
      const t0 = game.time;
      for (let i = 0; i < Math.round(SECS / DT); i++) {
        const rolled = G.defend.act();
        if (game.time > goal.until) {
          goal.r = [2.5, 5, 9][Math.floor(roam() * 3)];
          goal.a = Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z) + (roam() - 0.5) * 1.6;
          goal.until = game.time + 4;
        }
        if (!rolled && p.state !== 'roll') {
          const gx = d.position.x + Math.sin(goal.a) * goal.r, gz = d.position.z + Math.cos(goal.a) * goal.r;
          const k = Math.hypot(gx, gz) > B ? B / Math.hypot(gx, gz) : 1;
          const dx = gx * k - p.position.x, dz = gz * k - p.position.z, l = Math.hypot(dx, dz);
          G.input.axis = l > 0.6 ? { x: dx / l, y: -dz / l } : { x: 0, y: 0 };
        }
        game.mouseGround.set(d.position.x, 0, d.position.z);
        G.tick(DT);
        if (d.brain.pendingPhase > ph) d.brain.pendingPhase = 0;
        const a = d.brain.act;
        if (d.mode === 'act' && a && a !== prevAct && !a.def.transition && !a.def.counter && prevMode === 'act' && prevAct) chained++;
        prevAct = d.mode === 'act' ? a : null;
        prevMode = d.mode;
      }
      G.watch = null;
      G.defend = null;
      const T = game.time - t0;
      const hurt = G.hits.filter((h) => h.t > t0 && h.r === RESULT.HIT).length;
      const ts = [t0, ...flashes.map((f) => f[0]), ...busyT.filter((x) => x > t0 && x < t0 + T), t0 + T].sort((x, y) => x - y);
      let gapMax = 0;
      for (let i = 1; i < ts.length; i++) gapMax = Math.max(gapMax, ts[i] - ts[i - 1]);
      let conflicts = 0;
      const conflictAt = [];
      for (let i = 0; i < flashes.length; i++) {
        for (let j = i + 1; j < flashes.length && flashes[j][0] - flashes[i][0] < 0.3; j++) {
          if (answer(flashes[i][1]) === answer(flashes[j][1]) || flashes[i][2] === flashes[j][2]) continue;
          conflicts++;
          conflictAt.push(`${flashes[i][2]}/${flashes[j][2]} @${(flashes[i][0] - t0).toFixed(1)}`);
        }
      }
      const st = d.brain.stats ?? {};
      const dlt = (k) => (st[k] ?? 0) - (s0[k] ?? 0);
      const dodge = flashes.filter((f) => answer(f[1]) === 'dodge').length / (flashes.length || 1);
      rows.push({ seed, ph, perMin: (flashes.length * 60) / T, dodge, gapMax, picks: acts.length, chained, conflicts, conflictAt, holds: dlt('holds'), feints: dlt('feints'), links: dlt('links'), hurt, cats });
    }
  }
  const CATS = DIR.CATEGORIES;
  out(`   ${SECS} s per form, seeds ${SEEDS.join(', ')}`);
  out(`   seed ph cue/min dodge% gapMax moves chain links hold/f clash hurt  ${CATS.map((c) => c.slice(0, 7).padStart(8)).join('')}`);
  for (const r of rows) out(`   ${String(r.seed).padStart(4)}  ${r.ph} ${r.perMin.toFixed(1).padStart(7)} ${(r.dodge * 100).toFixed(0).padStart(6)} ${r.gapMax.toFixed(2).padStart(6)} ${String(r.picks).padStart(5)} ${String(r.chained).padStart(5)} ${String(r.links).padStart(5)} ${`${r.holds}/${r.feints}`.padStart(6)} ${String(r.conflicts).padStart(5)} ${String(r.hurt).padStart(4)}  ${CATS.map((c) => (((r.cats[c] || 0) * 100) / (r.picks || 1)).toFixed(0).padStart(8)).join('')}${r.conflicts ? `  CONFLICTS ${r.conflictAt.slice(0, 4).join(' · ')}` : ''}`);
  const mean = (ph, k) => { const rs = rows.filter((r) => r.ph === ph); return rs.reduce((a, r) => a + r[k], 0) / (rs.length || 1); };
  for (let ph = 1; ph <= FORMS; ph++) out(`   mean F${ph}: ${mean(ph, 'perMin').toFixed(1)} cues/min, ${(mean(ph, 'dodge') * 100).toFixed(0)} % to dodge, longest gap ${Math.max(...rows.filter((r) => r.ph === ph).map((r) => r.gapMax)).toFixed(2)} s, ${mean(ph, 'chained').toFixed(1)} chained of ${mean(ph, 'picks').toFixed(1)} moves`);
  if (process.env.ABYSS_PFORMS) return;
  for (let ph = 2; ph <= FORMS; ph++) {
    const a0 = mean(ph - 1, 'perMin'), a1 = mean(ph, 'perMin');
    assert(a1 >= a0 * 0.95, `the seeds' mean: F${ph} at least x0.95 F${ph - 1}'s cues a minute (${a0.toFixed(1)} → ${a1.toFixed(1)}, x${(a1 / a0).toFixed(3)})`);
  }
  for (const r of rows) assert(r.conflicts === 0, `seed ${r.seed} F${r.ph}: no two cues of different sources needing different answers within 0.3 s (${r.conflicts}: ${r.conflictAt.slice(0, 4).join(' · ')})`);
}

// ================================================================== scenario: bounds
async function scenarioBounds() {
  out('\n== scenario BOUNDS (he keeps to the ring, and a hero at its edge is still in his reach) ==');
  const B = Math.min(CONFIG.world.dragonBound ?? TUNING.bound, TUNING.bound);
  let peak = 0;
  for (let f = 1; f <= FORMS; f++) {
    const G = build();
    duel(G, { dist: 3, ai: true, form: f });
    const { game } = G;
    const d = game.dragon, p = game.player;
    p.debug.god = true;
    let outside = 0, melee = 0;
    const h0 = G.hits.length;
    const ex = B * 0.72;
    run(G, 30, () => {
      p.debug.teleport(ex, ex * 0.5);
      if (Math.hypot(d.position.x, d.position.z) > B + 1e-6) outside++;
    });
    for (const h of G.hits.slice(h0)) if (h.r === RESULT.HIT) melee++;
    peak = Math.max(peak, G.peakAdd);
    assert(outside === 0 && melee >= 3, `form ${f}: 30 s against a hero near the ring's edge: never off his floor (${outside} frames out), ${melee} blows landed`);
    if (G.payload.size) assert(false, `form ${f}: finite event payloads (${[...G.payload].join(', ')})`);
  }
  assert(peak < 6500, `every form with the AI on: the additive particle pool peaks at ${peak} of 7000`);
}

// ================================================================== scenario: flow
async function scenarioFlow() {
  out('\n== scenario FLOW (title → the ring → he opens his eyes → the duel; a death sends him back) ==');
  const G = build();
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  run(G, 0.3);
  input.tap('Enter');
  run(G, 0.5);
  if (game.state !== 'explore') game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(game.state === 'explore' && d.mode === 'sleep', 'exploring; he waits, arms folded');
  p.debug.teleport(0, CONFIG.world.bossTriggerZ + 2.5);
  run(G, 0.2);
  run(G, 4, () => { input.axis = { x: 0, y: 1 }; }, () => d.mode !== 'sleep');
  input.axis = { x: 0, y: 0 };
  assert(d.mode === 'intro' && game.state === 'bossIntro', `onto the ring: he stirs (hero at z ${p.position.z.toFixed(1)}, ${game.state})`);
  run(G, 8, null, () => d.mode === 'foot' || d.mode === 'act');
  run(G, 0.2);
  assert(G.counts['dragon:introDone'] === 1 && game.state === 'boss', `the intro ends in the duel (${game.state})`);
  p.debug.god = false;
  p.hp = 1;
  d.debug.setAI(true);
  run(G, 25, null, () => game.state === 'dead');
  assert(game.state === 'dead', 'he can kill the hero');
  run(G, 12, () => { if (((game.realTime * 60) | 0) % 30 === 0) input.tap('Enter'); }, () => game.state === 'explore');
  assert(game.state === 'explore' && d.mode === 'sleep' && d.phase === 1, `after the death he waits again (${game.state}, ${d.mode})`);
}

// ================================================================== scenario: win
async function scenarioWin() {
  out('\n== scenario WIN (a fencing bot in god mode: parries, rolls, cuts in his openings, gives the deathblows) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 3, ai: true });
  G.defend = makeDefender(G);
  const formAt = [0];
  let blows = 0;
  G.watch = (n) => {
    if (n === 'dragon:plunged') blows++;
    if (/^dragon:phase[23]$/.test(n)) formAt.push(game.time);
  };
  const t0 = game.time;
  const won = run(G, 420, () => fencer(G), () => d.mode === 'dead');
  const T = game.time - t0;
  const taken = G.hits.filter((h) => h.r === RESULT.HIT).length;
  const parries = G.hits.filter((h) => h.r === RESULT.PARRIED).length;
  out(`     ${won ? 'won' : 'NOT won'} in ${T.toFixed(0)} s: ${blows} deathblows, ${parries} parries, ${taken} hits taken (god mode), forms at ${formAt.map((t) => (t - t0 > 0 ? (t - t0).toFixed(0) : '0')).join(' / ')} s; form ${d.phase}, bar ${Math.round(d.hp)}`);
  assert(won && blows === 3, `the bot beats all three forms (${blows} deathblows)`);
  assert(T > 30 && T < 300, `the fight takes a bot that answers every tell ${T.toFixed(0)} s`);
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
  assert(kinds.has('asc') && !kinds.has('lord') && !kinds.has('ash') && kinds.has('duel'), `his own boss kind (${[...kinds].join(', ')})`);
  const L = T.list();
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
  assert(L.length >= 20 && !bad.length, `every situation plays out and shows what it promises (${L.length - bad.length} of ${L.length}${bad.length ? `; not: ${bad.join(', ')}` : ''})`);
  // the Lab's form buttons: Phase 2 from form 1, then the next
  const G2 = build();
  duel(G2, { dist: 5 });
  const d2 = G2.game.dragon;
  const ok2 = d2.debug.phase2();
  run(G2, 5, null, () => d2.mode === 'foot');
  const ok3 = d2.debug.phase3();
  run(G2, 5, null, () => d2.mode === 'foot');
  assert(ok2 && ok3 && d2.phase === 3 && G2.counts['dragon:phase2'] === 1 && G2.counts['dragon:phase3'] === 1, 'the Lab\'s form buttons: Phase 2, then Phase 3, each its transformation');
}

// ================================================================== run
const S = {
  level: scenarioLevel,
  data: scenarioData,
  timing: scenarioTiming,
  forms: scenarioForms,
  flare: scenarioFlare,
  bare: scenarioBare,
  engine: scenarioEngine,
  pace: scenarioPace,
  bounds: scenarioBounds,
  flow: scenarioFlow,
  win: scenarioWin,
  training: scenarioTraining,
};
const list = SCEN === 'all' ? Object.keys(S) : SCEN.split(',');
for (const k of list) {
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nASC: ${fails} FAILED` : '\nASC: ALL PASSED');
process.exit(fails ? 1 : 0);
