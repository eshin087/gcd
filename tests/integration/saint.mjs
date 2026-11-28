// The Last Foundry and Anselm, the False Saint, headless: the REAL Player, FalseSaint, Hud, GameFlow,
// AudioEngine and Lab (+ real LightPool, GlyphParticles, FireField, CameraRig, Events) wired like
// src/main.js for `?level=foundry`, on the level's real set (world/lastFoundry.js: its breakables, its
// hazard surface, its ambience). A bot drives the input. The harness is veil.mjs's (its build, bots, helpers).
// usage: node saint.mjs <repoRoot> [scenario[,scenario]]   (env: GCD_SEED=n reseeds the AI)
//   core's scenarios: levels | data | fight | phases | shell | molten | death | events | all
//   THE LATER AGENTS add theirs in `S` below, inside THEIR OWN marked block (// --- world, // --- body,
//   // --- fx, // --- melee, // --- boost, // --- arsenal, // --- terrain, // --- tuning), ONE ENTRY PER
//   LINE, so no two agents ever edit the same line. Each scenario is a function defined anywhere in the file
//   (put yours in a section of its own, headed with your name), or an inline async function in the entry.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ui, AUDIO, resetWindow } from './shim.mjs';
import { attachMarks, marksCheck } from './marks.mjs';

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
const { createLastFoundry, FOUNDRY } = await imp('src/world/lastFoundry.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
// (this suite measures the barrier, the pull and the domain, not the riposte: a parry here answers with the
// old riposte, as the other suites that parry for something else do; the deathblow has its own, `duel deathblow`)
const { setRiposteMode } = await imp('src/entities/player/riposteCut.js');
setRiposteMode('old');
const { FalseSaint } = await imp('src/entities/enemies/falseSaint/saint.js');
const { MOVES, MOVE_NAMES, CLIP, TRANSITIONS, realise, HANDLERS, COUNTERS, STREAKS } = await imp('src/entities/enemies/falseSaint/moves.js');
const { TUNING } = await imp('src/entities/enemies/falseSaint/tuning.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

// (the tuning pass: GCD_TUNE='{"hp":3000,"posture":{"max":[1,2,3]}}' deep-merges into TUNING before
// anything is built: a setting tried without editing tuning.js; arrays are replaced whole)
if (process.env.GCD_TUNE) {
  const merge = (o, v) => { for (const [k, x] of Object.entries(v)) { if (x && typeof x === 'object' && !Array.isArray(x) && o[k] && typeof o[k] === 'object') merge(o[k], x); else o[k] = x; } };
  merge(TUNING, JSON.parse(process.env.GCD_TUNE));
}
const LVL = getLevel('foundry');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.GCD_SEED ?? 4242);
const DT = 1 / 60;
const PHASES = TUNING.phaseAt.length;
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
/** The phases a move is used in (its weight; a counter or a hidden move: every phase; a transition: its own). */
const phasesOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase];
  if (def.counter || def.hidden) return [1, 2, 3, 4];
  return [1, 2, 3, 4].filter((f) => weightIn(def, f) > 0);
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
  const set = createLastFoundry(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

/** `real`: the set built anew with its breakables (world.destructibles, the scars, the ambience); without
 *  it the world is a mock on the set's colliders. */
function build(seed = SEED, real = true) {
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
  const set = real ? createLastFoundry(U, colliders) : null;
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
    // (world.js's: fire lands; the grass of this mock does not burn, the wood does)
    world.ignite = (x, z, r, k = 1) => world.destructibles.ignite(x, z, r, k);
    // (world.js's restore: the pieces, the marks, the set's scenes back to the first)
    world.restore = () => { world.destructibles.reset(); world.scars.reset(); set.scenes?.reset?.(); };
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
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('saint NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x].every(Number.isFinite)) throw new Error('saint blade NaN');
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

/** Title → the duel (the Lab's flow jump), in phase `form` (through its real transitions), the hero
 *  `dist` m in front of him, facing him. */
function duel(G, { dist = 4, ang = 0, ai = false, form = 1 } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
  for (let n = 2; n <= form; n++) {
    d.brain.forcePhase(n);
    run(G, 5, null, () => d.phase === n && d.mode !== 'act');
  }
  d.debug.tidy();
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
    /** Is a cue it means to answer due within `s` seconds? */
    dueWithin(s) {
      const t = G.game.time;
      return pend.some((e) => !e.done && e.at - t < s);
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

const quiet = (d) => d.mode === 'foot';
/** The hero's answer to the next flash of `name` (or any of his): 'parry' (ordinary), 'perfect' (a
 *  perfect parry), 'dodge' (a perfect dodge: the roll 0.08 s before the impact), 'early' (a roll too
 *  early: no perfect), 'guard' (a held guard), 'none'. Returns the step function for run(). */
function answer(G, how, name = null) {
  const { game, input } = G;
  G.ans = { at: 0, done: false };
  G.watch = (n, e) => {
    if (n !== 'combat:flash' || e?.source !== 'dragon' || (name && e.attack !== name) || G.ans.done || G.ans.at) return;
    const lead = { parry: 0.25, perfect: 0.04, dodge: 0.08, early: 0.45 }[how]; // (ADR-227: an ordinary parry is pressed 0.20 - 0.22 s before the impact; the press registers a frame later, the impact ~0.25 s after the flash)
    if (lead !== undefined) G.ans.at = game.time + TUNING.flashLead - lead;
  };
  return () => {
    const d = game.dragon, p = game.player;
    game.mouseGround.set(d.position.x, 0, d.position.z);
    if (how === 'guard') input.press(1);
    if (how === 'early' && G.ans.at && game.time + 0.5 >= G.ans.at + 0.45 && !G.ans.done) {
      // (an early roll: started 0.45 s before the impact)
    }
    if (G.ans.at && game.time >= G.ans.at && !G.ans.done) {
      G.ans.done = true;
      if (how === 'parry' || how === 'perfect') {
        input.up(1);
        input.click(1);
      } else if (how === 'dodge' || how === 'early') {
        const dx = p.position.x - d.position.x, dz = p.position.z - d.position.z, l = Math.hypot(dx, dz) || 1;
        input.axis = { x: -dz / l, y: -dx / l };
        input.tap('Space');
      }
    }
  };
}
/** Trigger `name` with the hero `dist` m before him and answer it `how`; run until he is back in footwork. */
function blowAnd(G, name, how, { dist = 2, god = true, max = 6 } = {}) {
  const d = G.game.dragon;
  place(G, dist);
  G.game.player.debug.god = god;
  const step = answer(G, how, name);
  const ok = d.brain.trigger(name);
  let acted = false;
  run(G, max, step, () => {
    if (d.mode === 'act') acted = true;
    return acted && d.mode === 'foot' && G.game.player.state !== 'roll';
  });
  G.watch = null;
  G.input.up(1);
  G.input.axis = { x: 0, y: 0 };
  return ok;
}

// ================================================================== helpers of this suite
const pieces = (G, kind) => G.game.world.destructibles.list.filter((b) => b.kind === kind);
/** One light swing of the hero's at him from `dist` m: the damage it dealt. */
function swing(G, dist = 1.6) {
  const { game, input } = G;
  const d = game.dragon;
  place(G, dist);
  const hp0 = d.hp;
  input.click(0);
  run(G, 0.9, () => game.mouseGround.set(d.position.x, 0, d.position.z));
  return hp0 - d.hp;
}
/** Damage him to just over a phase's gate and let its transition play out (n: the phase it opens). */
function throughGate(G, n) {
  const { game } = G;
  const d = game.dragon;
  const gate = d.maxHp * TUNING.phaseAt[n - 1];
  d.hp = gate + 20;
  d.mode = 'foot';
  d.brain.act = null;
  d.takeHit({ damage: 400, part: 'body', heavy: true, poise: 5, exact: true });
  const stopped = d.hp === gate && d.brain.pendingPhase === n;
  run(G, 1.5, null, () => d.brain.act?.name === TRANSITIONS[n]);
  const began = d.brain.act?.name === TRANSITIONS[n] && d.phase === n;
  run(G, 6, null, () => d.mode !== 'act');
  return { gate, stopped, began };
}

// ================================================================== core: levels
async function scenarioLevels() {
  out('\n== scenario LEVELS (the registry, the URL, the lines, no reward, the boss slot, the set\'s surface) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'foundry' && LEVELS.indexOf(LVL) === 9, `levels: ${LEVELS.map((l) => l.id).join(', ')} (the tenth)`);
  assert(['?level=foundry', '?lab&level=FOUNDRY', '?level=saint', '?level=falsesaint', '?level=anselm', '?level=mill', '?level=machine'].every((q) => levelFromSearch(q) === LVL), '?level=foundry / saint / falsesaint / anselm / mill / machine pick the level (case-insensitive)');
  const ids = new Set();
  for (const L of LEVELS) for (const a of [L.id, ...(L.aliases ?? [])]) { assert(!ids.has(a), `the URL id ${a} is one level's only`); ids.add(a); }
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'phase4', 'victory', 'fallen', 'restReset', 'again', 'rise']) assert(!!LVL.text[k], `the level has its ${k} line`);
  assert(LVL.name === 'The Last Foundry' && LVL.text.victory === 'THE FALSE SAINT FALLS' && LVL.text.phase2 === 'THE SKIN BREAKS' && LVL.text.phase3 === 'WEAPONS FREE' && LVL.text.phase4 === 'TRUE FRAME', `${LVL.name}: ${LVL.sub}`);
  assert(LVL.reward === undefined, 'no reward ships (the owner has not chosen one)');
  assert(CONFIG.world.arenaRadius === FOUNDRY.half && CONFIG.world.bossTriggerZ === FOUNDRY.entryZ - 0.6 && CONFIG.world.dragonBound === FOUNDRY.floor.r && CONFIG.world.playerBound === FOUNDRY.bound, 'applyLevel merged the foundry layout into CONFIG.world');
  const F0 = FOUNDRY;
  assert([F0.half, F0.cell, F0.entryZ, F0.bonfire.x, F0.bonfire.z, F0.floor.r, F0.wait.x, F0.wait.z, F0.wait.yaw, F0.bound, F0.press.x, F0.press.z, F0.line.x, F0.line.z0, F0.line.z1, F0.pour.x0, F0.pour.x1, F0.pour.z0, F0.pour.z1].every(Number.isFinite) && F0.ladles.length === 4 && F0.tanks.length > 0 && F0.columns.length > 0, 'FOUNDRY carries every field of the layout (BRIEF 4)');
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof FalseSaint && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'saint', `the boss is his own duelist: ${d.name}`);
  assert(d.maxHp === TUNING.hp && TUNING.phaseAt.length === 4 && TUNING.maxPhase === 4 && !d.lives, 'one health bar, four phases');
  assert(Object.keys(d.parts).join(',') === 'melee,boost,arsenal,terrain' && HANDLERS.length === 4, `the four move handlers are built (${Object.keys(d.parts).join(', ')})`);
  const set = G.game.world.forest, F = set.foundry;
  assert(!!F && F.ladles.length === 4 && typeof F.ladleNear === 'function' && typeof F.drop === 'function' && typeof F.molten?.add === 'function' && typeof F.molten.at === 'function' && Array.isArray(F.molten.pools) && typeof F.reset === 'function', 'the set\'s hazard surface: ladles, ladleNear, drop, molten.add / pools / at, reset');
  const kinds = new Set(G.game.world.destructibles.list.map((b) => b.kind));
  assert(['plate', 'ladle', 'press', 'frame', 'tank', 'column', 'furnace'].every((k) => kinds.has(k)), `the set's pieces stand (${[...kinds].join(', ')})`);
  assert(pieces(G, 'plate').length >= 300, `the casting floor is plates (${pieces(G, 'plate').length})`);
  run(G, 0.6);
  assert(d.mode === 'sleep' && Math.hypot(d.position.x - F0.wait.x, d.position.z - F0.wait.z) < 0.5, 'asleep he kneels at the edge of the pour');
  d.startIntro();
  run(G, 4, null, () => d.mode === 'foot');
  assert(G.counts['dragon:wake'] === 1 && G.counts['dragon:introDone'] === 1 && d.mode !== 'sleep', 'woken: the duel starts');
  const { SCORE, allTrackFiles } = await imp('src/audio/trackList.js');
  assert(!!SCORE.levels.foundry?.explore && SCORE.levels.foundry.phases.length === 4 && allTrackFiles().includes(SCORE.levels.foundry.explore.file), 'the level has its score (borrowed files)');
}

// ================================================================== core: data
async function scenarioData() {
  out('\n== scenario DATA (move data rules in every phase a move is used in; the fs prefix; the routing; the homage line) ==');
  let checked = 0;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const phases = phasesOf(name);
    if (!phases.length) assert(false, `${name}: used in at least one phase`);
    if (!def.transition && !(Array.isArray(def.weight) && def.weight.length === 4)) assert(false, `${name}: four-phase weights`);
    for (const f of phases) {
      for (const r of [0, 0.5, 0.999]) {
        const A = realise(name, f, () => r);
        const real = A.beats.filter((b) => !b.feint);
        const tag = `${name} P${f} r${r}`;
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        if (!A.beats.filter((b) => b.feint && !b.def.stance).every((b) => b.def.tell === undefined && !b.def.zone && !b.def.damage)) assert(false, `${tag}: a feint says nothing`);
        const first = real[0];
        if (!def.transition && first && !(first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first real windup ${(first.impact - first.tellAt).toFixed(3)} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TUNING.minHitGap}`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone, a release or a cast`);
        for (const b of real) if (b.def.tell === TELL.RED && b.def.zone?.kind === 'ring' && !b.def.ring) assert(false, `${tag}: a red ring has its ring`);
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        checked++;
      }
    }
  }
  assert(checked >= 12, `${checked} realisations obey the rules (a tell per hit, feints silent, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart)`);
  const { TUNING: ASC_T } = await imp('src/entities/enemies/ascendant/tuning.js');
  assert(TUNING.flashLead >= ASC_T.flashLead && TUNING.minFirstWindup >= Math.max(ASC_T.minFirstWindup, 0.42) && TUNING.minHitGap >= ASC_T.minHitGap, `his minimums are no lower than Tian Lei's, his first windup no lower than 0.42 (${TUNING.flashLead} / ${TUNING.minFirstWindup} / ${TUNING.minHitGap})`);
  // every new field is `fs`-prefixed (the engine's names: this list; add an engine field here only if the engine has it)
  const ENGINE = new Set(('tell flare feint windup hold cock active chance fixed pick damage knockback knockdown zone ring part track close travel dash lift leap air release cast sustain selfHit stance draw stopOn mikiri lock flit follow keys bolt pull grip noWorld groundMark blink dive hazard burn whoosh blockPush guardCost mo sweep '
    + 'label phase weight cooldown band recovery recoveryKeys counter transition manual hidden cat terrain gapCloser streak recoverOpen').split(' '));
  const bad = new Set();
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    for (const k of Object.keys(def)) if (k !== 'beats' && !ENGINE.has(k) && !/^fs[A-Z]/.test(k)) bad.add(`${name}.${k}`);
    for (const raw of def.beats) for (const b of Array.isArray(raw.pick) ? raw.pick : [raw]) for (const k of Object.keys(b)) if (!ENGINE.has(k) && !/^fs[A-Z]/.test(k)) bad.add(`${name}.beat.${k}`);
  }
  assert(bad.size === 0, `every new move / beat field is fs-prefixed (${[...bad].slice(0, 8).join(', ')})`);
  // the TUNING fields new to the engine are fs-prefixed too (the engine's: this list; the four merged blocks are free)
  const TENGINE = new Set('name hp phaseAt maxPhase radius scale bound flashLead minFirstWindup minHitGap windupScale recoveryScale close reach posture guard trade camera flinch hitStun parts execRange ghostepBehind execution move idleGap openingGap chain pressure punish fullDeflect lock mikiri cinematic damageScale airFall transition beam melee boost arsenal terrain world wakeRadius'.split(' '));
  const tbad = Object.keys(TUNING).filter((k) => !TENGINE.has(k) && !/^fs[A-Z]/.test(k));
  assert(tbad.length === 0, `every new TUNING field is fs-prefixed (${tbad.join(', ')})`);
  // the handlers' FIELDS: fs-prefixed and claimed by one file only; every beat routed to at most one
  const own = new Map();
  for (const H of HANDLERS) for (const f of H.fields) { if (!(/^fs[A-Z]/.test(f) && !own.has(f))) assert(false, `handler ${H.name}: its field ${f} is fs-prefixed and its own`); own.set(f, H.name); }
  assert(HANDLERS.map((H) => H.name).join(',') === 'melee,boost,arsenal,terrain' && own.size >= 4, `four handlers, ${own.size} fields, none claimed twice`);
  // the poses router: each file's names carry its prefix, none twice
  const { POSE_FILES } = await imp('src/entities/enemies/falseSaint/poses.js');
  const seen = new Set();
  let dup = 0, pre = 0;
  for (const [who, names] of Object.entries(POSE_FILES)) for (const n of names) { if (seen.has(n)) dup++; seen.add(n); if (who !== 'body' && !n.startsWith(who)) pre++; }
  assert(dup === 0 && pre === 0, `the pose files' names: none twice (${dup}), each moves file's with its prefix ml / bo / ar / tr (${pre} without)`);
  // the transitions, the flurries, the counters
  for (const [ph, mv] of Object.entries(TRANSITIONS)) assert(MOVES[mv]?.transition && MOVES[mv].phase === Number(ph) && MOVES[mv].beats.some((b) => b.fsMoment === Number(ph)), `phase ${ph} begins with ${mv} (its fsMoment)`);
  assert(STREAKS.length === 4 && STREAKS.every((n) => MOVES[n]?.streak) && COUNTERS.length === 4 && COUNTERS.every((n) => MOVES[n]?.counter), `his flurry by phase (${STREAKS.join(', ')}), his counter by phase (${COUNTERS.join(', ')})`);
  // the effects' surface: every method of the list exists (the moves call them from the first commit)
  const { FS_FX_METHODS } = await imp('src/entities/enemies/falseSaint/fx.js');
  const G = build();
  const fx = G.game.dragon.fx;
  const miss = FS_FX_METHODS.filter((m) => typeof fx[m] !== 'function');
  assert(miss.length === 0, `the ${FS_FX_METHODS.length} methods of FsFx's surface exist (${miss.join(', ')})`);
  const B = G.game.dragon;
  const v = new THREE.Vector3();
  const pts = ['palmR', 'elbowR', 'elbowL', 'shoulderR', 'shoulderL', 'back', 'calfR', 'calfL', 'core', 'mortar', 'eye', 'head', 'chest'].filter((n) => { B.partPoint(n, v); return !Number.isFinite(v.x + v.y + v.z); });
  assert(pts.length === 0 && Number.isFinite(B.eyePoint(v).y) && Number.isFinite(B.handPoint('L', v).y), `the body's points are finite (partPoint, eyePoint, handPoint; bad: ${pts.join(', ') || 'none'})`);
  // the homage line: none of the source's names in his data, the level's lines or the set's kinds
  const words = JSON.stringify([MOVES, LVL.text, LVL.name, LVL.sub, TUNING.name, Object.keys(MOVES), [...new Set(G.game.world.destructibles.list.map((b) => b.kind))]]).toLowerCase();
  const BAN = [['termi', 'nator'], ['sky', 'net'], ['cyber', 'dyne'], ['t-', '800'], ['t-', '1000'], ['con', 'nor'], ['ree', 'se'], ['hasta ', 'la'], ['be ', 'back'], ['ge', 'nos'], ['sai', 'tama'], ['one ', 'punch'], ['kuse', 'no'], ['incinera', 'tion cannon'], ['machine gun ', 'blow'], ['demon ', 'cyborg']].map((p) => p.join(''));
  const hits = BAN.filter((w) => new RegExp(`(^|[^a-z])${w.trim()}([^a-z]|$)`).test(words));
  assert(hits.length === 0, `no source name in his moves, his name, the level's lines or the set's kinds (${hits.join(', ')})`);
}

// ================================================================== core: fight
async function scenarioFight() {
  out('\n== scenario FIGHT (he wakes and fights 60 s against the fencing bot: no throw, no NaN, he attacks) ==');
  const SEEDS = (process.env.GCD_WSEEDS ?? '4242').split(',').map(Number);
  for (const seed of SEEDS) {
    const G = build(seed, true);
    const { game } = G;
    const d = game.dragon;
    duel(G, { dist: 3, ai: true });
    G.defend = makeDefender(G, { world: true });
    let flashes = 0;
    const moves = new Set();
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') { flashes++; if (e.attack) moves.add(e.attack); } };
    const hp0 = d.hp;
    run(G, Number(process.env.GCD_FSECS ?? 60), () => fencer(G), () => d.mode === 'dead');
    out(`     seed ${seed}: ${flashes} cues (${[...moves].join(', ')}), ${G.hits.length} blows reached the hero, his hp ${Math.round(hp0)} -> ${Math.round(d.hp)}, phase ${d.phase}`);
    assert(flashes >= 15 && moves.size >= 2, `seed ${seed}: he fights (${flashes} cues, ${moves.size} moves)`);
    assert(d.hp < hp0, `seed ${seed}: the bot's cuts reach him`);
    assert(G.payload.size === 0, `seed ${seed}: no NaN in any event (${[...G.payload].join(', ')})`);
  }
}

// ================================================================== core: phases
async function scenarioPhases() {
  out('\n== scenario PHASES (the three gates, the transitions and their banners, the shell and the dress by phase, the light) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, set = game.world.forest;
  duel(G, { dist: 4, ai: true });
  game.player.debug.god = true;
  const seen = { 2: 0, 3: 0, 4: 0 };
  G.watch = (n) => { const m = /^dragon:phase([234])$/.exec(n); if (m) seen[m[1]]++; };
  for (const n of [2, 3, 4]) {
    const r = throughGate(G, n);
    assert(r.stopped, `damage stops at the ${Math.round(TUNING.phaseAt[n - 1] * 100)} % gate (${r.gate})`);
    assert(r.began && seen[n] === 1, `${TRANSITIONS[n]}: phase ${n}, dragon:phase${n}`);
    const lim = TUNING.fsShell.limit[n - 1];
    assert(d.dressPhase === n && d.shell.phase === n && d.shell.exposure > TUNING.fsShell.limit[n - 2] * 0.5 && d.shell.exposure <= lim + 1e-6, `at its impact: dressPhase ${d.dressPhase}, the shell's phase ${d.shell.phase}, exposure ${d.shell.exposure.toFixed(2)} (limit ${lim})`);
    assert(game.flow._text(`phase${n}`) === LVL.text[`phase${n}`], `the level's phase-${n} banner: ${LVL.text[`phase${n}`]}`);
    run(G, 3);
    assert(set.ambience.state.phase === n && set.ambience.state.w[n - 1] > 0.5, `the light follows him into phase ${n} (${set.ambience.state.w.map((x) => x.toFixed(2)).join(' / ')})`);
  }
  const A1 = realise('benediction', 1, () => 0.5), A4 = realise('benediction', 4, () => 0.5);
  assert(A4.beats[0].W < A1.beats[0].W && A4.beats[0].W >= TUNING.minFirstWindup, `phase 4 is faster (windup ${A1.beats[0].W.toFixed(3)} -> ${A4.beats[0].W.toFixed(3)}), never under the minimum`);
  game.world.restore();
  d.reset();
  run(G, 0.2);
  assert(d.phase === 1 && d.dressPhase === 1 && d.shell.exposure === 0 && d.shell.phase === 1, 'his reset: phase 1, whole');
}

// ================================================================== core: shell
async function scenarioShell() {
  out('\n== scenario SHELL (a cut chips where it lands; the limits by phase; strip; reset; deterministic) ==');
  const { FsShell, PARTS, PART_NAMES, FLOORS } = await imp('src/entities/enemies/falseSaint/shell.js');
  const wsum = PARTS.reduce((s, p) => s + p.w, 0);
  assert(Math.abs(wsum - 1) < 1e-6 && PART_NAMES.length === 15, `15 parts, their weights sum to 1 (${wsum.toFixed(3)})`);
  const fake = { position: new THREE.Vector3(0, 0, 0), yaw: 0 };
  const S = new FsShell(fake);
  const H = TUNING.fsShell.height;
  // a cut at his right cheek (his right = -x at yaw 0)
  const v0 = S.version;
  const took = S.chip({ x: -0.06, y: 0.93 * H, z: 0.05 }, 0.5);
  assert(took > 0 && S.part('headR') > S.part('headL') && S.part('headR') > 0 && S.version > v0 && S.last.part === 'headR', `a cut at his right cheek chips headR first (${S.part('headR').toFixed(2)} vs headL ${S.part('headL').toFixed(2)}; took ${took.toFixed(3)})`);
  for (let i = 0; i < 60; i++) S.chip({ x: 0.1, y: 0.4 * H, z: 0 }, 0.5);
  assert(Math.abs(S.exposure - TUNING.fsShell.limit[0]) < 1e-6, `phase 1: cuts stop at the limit (${S.exposure.toFixed(3)} = ${TUNING.fsShell.limit[0]})`);
  assert(S.chip({ x: 0, y: 1, z: 0 }, 0.5) === 0, 'at the limit a cut takes nothing');
  const floors = [];
  for (const n of [2, 3, 4]) {
    S.setPhase(n);
    const lim = TUNING.fsShell.limit[n - 1];
    const fl = S.exposure;
    for (const [name, f] of Object.entries(FLOORS[n])) if (S.part(name) < f - 1e-6) assert(false, `phase ${n}: ${name} at least its floor ${f}`);
    for (let i = 0; i < 200; i++) S.chip({ x: (i % 5) * 0.1 - 0.2, y: ((i * 7) % 10) / 10 * H, z: 0 }, 0.3);
    floors.push(`P${n} ${fl.toFixed(2)} -> ${S.exposure.toFixed(2)} (limit ${lim})`);
    assert(fl < lim && S.exposure <= lim + 1e-6 && S.exposure > fl, `phase ${n}: starts at its floor ${fl.toFixed(2)}, cuts take it up to the limit ${lim} (${S.exposure.toFixed(3)})`);
  }
  out(`     ${floors.join(' · ')}`);
  S.reset();
  assert(S.exposure === 0 && S.phase === 1 && PART_NAMES.every((n) => S.part(n) === 0), 'reset: whole again, phase 1');
  // strip: a little everywhere (inside the limit)
  S.setPhase(2);
  const e2 = S.exposure, st = S.strip(0.2);
  assert(st > 0 && S.exposure <= TUNING.fsShell.limit[1] + 1e-6 && S.exposure > e2, `strip takes from every part, inside the limit (${e2.toFixed(3)} -> ${S.exposure.toFixed(3)})`);
  // deterministic: the same cuts, the same shell; the reveal order a fixed hash
  const A = new FsShell(fake), B = new FsShell(fake);
  for (const s of [A, B]) { s.setPhase(3); for (let i = 0; i < 9; i++) s.chip({ x: 0.1 * i - 0.4, y: 1.2, z: 0.1 }, 0.2); }
  assert(PART_NAMES.every((n) => A.part(n) === B.part(n)) && A.order('chestR', 3) === B.order('chestR', 3) && A.order('chestR', 3) !== A.order('chestR', 4), 'deterministic: the same cuts give the same shell; the reveal order is a fixed hash');
  // through the real fight: a landed cut of the hero's chips him
  const G = build();
  const d = G.game.dragon;
  duel(G, { dist: 1.6 });
  G.game.player.debug.god = true;
  // (a cut that lands: past his guard, at his left knee as the engine passes it: o.point)
  const knee = new THREE.Vector3().setFromMatrixPosition(d.rig.legs.L.shin.matrixWorld);
  const dealt = d.takeHit({ damage: 20, part: 'leg', point: knee, dir: { x: 1, z: 0 }, exact: true });
  assert(dealt > 0 && d.shell.exposure > 0 && d.shell.last.k > 0 && /L$/.test(d.shell.last.part), `a landed cut chips his shell where it lands (${dealt} damage, exposure ${d.shell.exposure.toFixed(3)}, at ${d.shell.last.part})`);
  // (and a real swing of the hero's on a broken boss: his guard cannot turn it)
  d.debug.postureBreak();
  run(G, 0.3);
  const e0 = d.shell.exposure;
  let sw = 0;
  for (let i = 0; i < 4 && d.shell.exposure === e0; i++) sw += swing(G, 1.4);
  assert(sw > 0 && d.shell.exposure > e0, `the hero's own swing chips it (${sw} damage, exposure ${e0.toFixed(3)} -> ${d.shell.exposure.toFixed(3)})`);
  assert(d.debug.shell(1) > 0.999 && d.shell.exposure > 0.999 && typeof d.debug.shell().exposure === 'number', 'debug.shell(k) forces a bare frame; debug.shell() reads the state');
  d.reset();
  assert(d.shell.exposure === 0, 'his reset restores him whole');
}

// ================================================================== core: molten
async function scenarioMolten() {
  out('\n== scenario MOLTEN (a pool is cued, then burns the hero; burns him; a broken ladle spills; reset) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, F = game.world.forest.foundry;
  duel(G, { dist: 6, ai: false });
  // a pool at the hero's feet: the red cue first (a hazard flash where it lies), the burn after `arm`
  place(G, 6);
  const t0 = game.time;
  let cueAt = NaN, tellAt = NaN, hitAt = NaN;
  G.watch = (n, e) => {
    if (n === 'combat:flash' && e?.attack === 'molten' && !Number.isFinite(cueAt)) cueAt = game.time;
    if (n === 'combat:tell' && e?.attack === 'molten' && !Number.isFinite(tellAt)) tellAt = game.time;
  };
  const hp0 = p.hp;
  const P = d.debug.pool(p.position.x, p.position.z, 2);
  assert(P?.alive && F.molten.at(p.position.x, p.position.z) === P, `debug.pool lays a pool (molten.add → { x, z, r, t, life, id }: r ${P?.r}, life ${P?.life})`);
  run(G, 2, null, () => { if (!Number.isFinite(hitAt) && p.hp < hp0) hitAt = game.time; return Number.isFinite(hitAt); });
  const M = TUNING.terrain.molten;
  out(`     cue ${(cueAt - t0).toFixed(2)} s, tell ${(tellAt - t0).toFixed(2)} s, the first burn ${(hitAt - t0).toFixed(2)} s after it was laid (arm ${M.arm} s)`);
  assert(Number.isFinite(cueAt) && Number.isFinite(tellAt) && cueAt - t0 < 0.1, 'the pool is cued red where it lies as it is laid (combat:tell, combat:flash with hazard)');
  assert(Number.isFinite(hitAt) && hitAt - cueAt >= M.arm - 0.05 && p.hp < hp0 && d.parts.terrain.stats.heroBurns >= 1, `then it burns the hero (${hp0} -> ${p.hp}), no sooner than ${M.arm} s after its cue`);
  G.watch = null;
  // a pool under him: onMolten (damage, posture, his shell stripped)
  p.debug.heal();
  p.debug.teleport(d.position.x + 6, d.position.z);
  run(G, 0.6);
  const dh = d.hp, dp = d.posture;
  d.debug.pool(d.position.x, d.position.z, 2);
  run(G, 1.4);
  assert(d.hp < dh && d.posture > dp && d.parts.terrain.stats.bossBurns >= 1, `a pool under him burns him (hp ${Math.round(dh)} -> ${Math.round(d.hp)}, posture ${Math.round(dp)} -> ${Math.round(d.posture)})`);
  assert(d.shell.exposure > 0 || d.shell.exposure === TUNING.fsShell.limit[0], `... and strips his shell (exposure ${d.shell.exposure.toFixed(3)})`);
  // a ladle broken by any blow spills; drop() cuts one down; ladleNear; the pools expire; reset
  const L = F.ladles[0];
  game.world.destructibles.strike(L.x, L.z, 0.6, 99, { kind: 'blunt', by: 'hero', y: L.h - 0.2 });
  run(G, 0.2);
  assert(!L.full && F.molten.pools.some((q) => q.alive && Math.hypot(q.x - L.x, q.z - L.z) < 0.1), 'a ladle broken by a blow spills a pool under it');
  const L2 = F.ladleNear(F.ladles[1].x + 1, F.ladles[1].z, 3);
  assert(L2 === F.ladles[1] && F.drop(L2, 'boss') && !L2.full && F.drop(L2, 'boss') === false, 'ladleNear finds a full ladle; drop cuts it down once');
  run(G, 20);
  assert(F.molten.pools.every((q) => !q.alive), 'the pools burn out');
  for (let i = 0; i < 12; i++) F.molten.add(i, 0, { r: 1 });
  assert(F.molten.pools.length === 8 && F.molten.pools.filter((q) => q.alive).length === 8, 'a fixed pool of records (the oldest reused)');
  game.world.restore();
  d.reset();
  run(G, 0.1);
  assert(F.ladles.every((x) => x.full) && F.molten.pools.every((q) => !q.alive), 'the reset: every ladle full again, no pool');
}

// ================================================================== core: death
async function scenarioDeath() {
  out('\n== scenario DEATH (he falls; the victory; the reset after it) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 4, ai: true });
  game.player.debug.god = true;
  d.debug.kill();
  run(G, 8, null, () => d.mode === 'dead');
  assert(d.mode === 'dead' && G.counts['dragon:death'] >= 1, `he falls (${d.mode})`);
  run(G, 4);
  assert(game.state === 'victory' || G.counts['dragon:dead'] >= 1, `the victory (${game.state})`);
  game.world.restore();
  d.reset();
  run(G, 0.5);
  assert(d.mode === 'sleep' && d.hp === d.maxHp && d.phase === 1 && d.shell.exposure === 0, `the reset: asleep at the pour, whole (${d.mode}, ${d.hp})`);
}

// ================================================================== core: events
async function scenarioEvents() {
  out('\n== scenario EVENTS (what this level emits is in the catalogue: checked at the end of every run) ==');
  assert(CATALOGUE.size > 20, `the catalogue is read (${CATALOGUE.size} names)`);
}

// ================================================================== melee (the melee agent's: moves/melee.js, links.js)
/** The melee moves, the phase each is tried in, the hero's distance in reach (a string's beats step in). */
const ML_MOVES = [['benediction', 1, 1.8], ['genuflect', 1, 1.8], ['longWalk', 1, 6], ['rebuke', 1, 1.6], ['interdict', 2, 1.8], ['castOut', 2, 1.9], ['penance', 2, 1.5], ['lauds', 3, 1.8], ['anathema', 3, 1.6], ['requiem', 4, 1.6]];
/** A build in phase `form` with his AI off, the hero `dist` m before him, and a counter on world.groundBlow. */
function mlDuel(form, dist = 3) {
  const G = build();
  duel(G, { dist, form });
  const w = G.game.world;
  G.ground = [];
  w.groundBlow = (x, z, o) => { if (!Number.isFinite(x + z)) throw new Error('NaN groundBlow'); G.ground.push(o?.kind); };
  return G;
}
/** The hero's results for attack `name` since index i0 of G.hits. */
const mlHits = (G, name, i0 = 0) => G.hits.slice(i0).filter((h) => h.attack === name);
const mlStanding = (G) => G.game.world.destructibles.list.filter((b) => !b.floor && b.state === 0 && b.hpMax < Infinity).length; // (destructibles.js STATE.INTACT)

async function scenarioMlReach() {
  out('\n== scenario MLREACH (each melee move: its beats land on a hero who stands still, none on one out of reach; tells as declared) ==');
  for (const [name, form, dist] of ML_MOVES) {
    const G = mlDuel(form, 4);
    const d = G.game.dragon, def = MOVES[name];
    const want = def.beats.filter((b) => !b.feint).map((b) => b.tell);
    const flashes = [];
    G.defend = { onEvent(n, e) { if (n === 'combat:flash' && e?.source === 'dragon' && e.attack === name) flashes.push(e.tell); } };
    const i0 = G.hits.length;
    const ok = blowAnd(G, name, 'none', { dist });
    const got = mlHits(G, name, i0);
    G.defend = null;
    const landed = got.filter((h) => h.r === RESULT.HIT || h.r === RESULT.BLOCKED).length;
    out(`     ${name} P${form}: ${landed}/${want.length} beats landed on a hero standing at ${dist} m; tells ${got.map((h) => h.tell).join(' ')} (declared ${want.join(' ')}; flashed ${flashes.join(' ')})`);
    assert(ok && landed === want.length, `${name} (phase ${form}): every beat lands on a hero who stands still (${landed}/${want.length})`);
    assert(flashes.join(',') === want.join(','), `${name}: each beat is cued with its declared tell (${flashes.join(' ')})`);
    // out of reach: 12 m away (the walk: 16 m), with his mind on (it breaks a string off at a beat that
    // cannot reach: brain.js "a string's next hit" and the reach watch), nothing lands
    settle(G);
    const far = name === 'longWalk' ? 16 : 12;
    const i1 = G.hits.length;
    d.debug.setAI(true);
    blowAnd(G, name, 'none', { dist: far });
    d.debug.setAI(false);
    const miss = mlHits(G, name, i1).filter((h) => h.r === RESULT.HIT || h.r === RESULT.BLOCKED).length;
    assert(miss === 0, `${name}: nothing lands on a hero ${far} m away (${miss})`);
  }
}

async function scenarioMlGrab() {
  out('\n== scenario MLGRAB (Laying On of Hands: caught, held, lifted, thrown through a standing piece, never the last HP; dodged: open) ==');
  const G = mlDuel(1, 3);
  const { game } = G;
  const d = game.dragon, p = game.player, M = d.parts.melee, DS = game.world.destructibles;
  // (him near the west line of unfinished frames, facing it: the nearest standing pieces are behind the hero)
  d.position.set(-11, 0, 0);
  d.yaw = -Math.PI / 2;
  run(G, 0.2);
  place(G, 1.8);
  p.debug.god = false;
  p.hp = 2;
  const pieces0 = mlStanding(G);
  const ok = d.brain.trigger('layHands');
  let caughtAt = NaN, thrownAt = NaN, freeAt = NaN, maxY = 0, minHp = p.hp, crashN = 0;
  run(G, 5, () => {
    if (M.grip && !Number.isFinite(caughtAt)) caughtAt = game.time;
    if (Number.isFinite(caughtAt)) maxY = Math.max(maxY, p.position.y);
    if (M.lastThrow && !Number.isFinite(thrownAt)) thrownAt = game.time;
    if (p.crash?.on) crashN = Math.max(crashN, p.crash.n);
    minHp = Math.min(minHp, p.hp);
    if (Number.isFinite(thrownAt) && !Number.isFinite(freeAt) && ['idle', 'run'].includes(p.state)) freeAt = game.time;
  }, () => Number.isFinite(freeAt) && d.mode === 'foot');
  const T = M.lastThrow;
  const tgt = T?.target;
  out(`     caught ${Number.isFinite(caughtAt)}, lifted ${maxY.toFixed(2)} m, thrown ${(thrownAt - caughtAt).toFixed(2)} s after the catch at ${tgt ? `${tgt.kind} ${Math.hypot(tgt.x - T.x, tgt.z - T.z).toFixed(1)} m off` : 'no piece'} (knockback ${T?.kb?.toFixed(1)} m), ${crashN} pieces met on the way, standing pieces ${pieces0} -> ${mlStanding(G)}; the hero ${minHp} hp at the least, his own again ${(freeAt - caughtAt).toFixed(2)} s after the catch`);
  assert(ok && Number.isFinite(caughtAt) && M.stats.caught === 1, 'the reach catches a hero who stands still (red: no guard holds it)');
  assert(maxY > 0.3 && Number.isFinite(thrownAt) && M.stats.throws === 1, `he lifts the hero (${maxY.toFixed(2)} m) and throws him`);
  assert(!!tgt && T.slammed && M.stats.thrownThrough === 1 && mlStanding(G) < pieces0, `the throw goes at the nearest standing piece and through it (${crashN} met on the way, ${pieces0 - mlStanding(G)} broken)`);
  assert(p.alive && minHp >= 1, `never the last HP (the hero at 2 hp: ${minHp} at the least)`);
  assert(freeAt - caughtAt <= TUNING.melee.layHands.cap + 0.35, `the hero's whole loss of control ${(freeAt - caughtAt).toFixed(2)} s <= cap ${TUNING.melee.layHands.cap} s (+ the get-up's blend)`);
  assert(p.position.y === 0, 'the hero is back on the floor');
  // dodged: no catch, he stands open the whole recovery
  p.debug.heal();
  p.debug.god = true;
  settle(G);
  d.position.set(0, 0, -2);
  d.yaw = 0;
  run(G, 0.3);
  d.brain.cooldowns.layHands = 0;
  const c0 = M.stats.caught;
  let open = 0;
  blowAnd(G, 'layHands', 'dodge', { dist: 1.8 });
  void open;
  assert(M.stats.caught === c0 && !M.grip && p.position.y === 0, 'a hero who rolls through the reach is not caught');
  // the grab is not picked at a hero who is down
  assert(d.weigh('layHands', MOVES.layHands, 1, 2) > 0, 'the grab is weighed at a hero on his feet');
  p.state = 'knockdown';
  assert(d.weigh('layHands', MOVES.layHands, 1, 2) === 0, '... and never at one who is down');
  p.state = 'idle';
}

async function scenarioMlWalk() {
  out('\n== scenario MLWALK (The Long Walk: light cuts land and do not stop him, a heavy cut does; the straight carries on into the scenery) ==');
  const G = mlDuel(1, 7);
  const { game } = G;
  const d = game.dragon, p = game.player, M = d.parts.melee;
  p.debug.god = true;
  place(G, 7);
  const d0 = Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z);
  d.brain.trigger('longWalk');
  const a = d.brain.act, b = a?.beats[0];
  // light cuts through the walk (one before u 0.55, where his guard would have turned it, one after)
  const hp0 = d.hp;
  const cut = (heavy) => d.takeHit({ damage: 20, part: 'body', swing: true, heavy, poise: heavy ? 30 : 8, point: new THREE.Vector3(d.position.x, 1.2, d.position.z), dir: { x: 0, z: -1 } });
  run(G, b.W * 0.3);
  const dealt1 = cut(false);
  run(G, b.W * 0.3);
  const dealt2 = cut(false);
  const still = d.mode === 'act' && d.brain.act === a;
  const walked = d0 - Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z);
  out(`     two light cuts through the walk: ${dealt1} + ${dealt2} damage (hp ${hp0} -> ${d.hp}), still walking ${still}, ${walked.toFixed(2)} m walked so far`);
  assert(dealt1 > 0 && dealt2 > 0 && still && M.stats.shrugs === 2, 'light cuts land through the walk (his guard does not turn them) and he walks on');
  run(G, 4, null, () => d.mode === 'foot');
  const hit = mlHits(G, 'longWalk').filter((h) => h.r === RESULT.HIT || h.r === RESULT.BLOCKED).length;
  assert(hit === 1 && M.stats.carries === 1, `then the straight lands (${hit}) and carries on into the scenery (${M.stats.carries})`);
  // a heavy cut stops him
  settle(G);
  d.brain.cooldowns.longWalk = 0;
  place(G, 7);
  d.brain.trigger('longWalk');
  run(G, d.brain.act.beats[0].W * 0.5);
  cut(true);
  assert(d.mode === 'react' && d.brain.react?.kind === 'stagger' && M.stats.walkStops === 1, `a heavy cut stops the walk: a stagger (${d.mode} ${d.brain.react?.kind})`);
  // the straight goes on through what stands behind the hero: a frame of the west line 3.5 m behind him
  settle(G);
  d.brain.cooldowns.longWalk = 0;
  const DS = game.world.destructibles;
  const fr = DS.list.filter((q) => q.kind === 'frame' && !q.floor && q.hpMax < Infinity).sort((x, y) => Math.abs(x.z) - Math.abs(y.z))[0];
  d.position.set(fr.x + 8.5, 0, fr.z);
  d.yaw = -Math.PI / 2; // (facing the line: blowAnd places the hero 4.6 m before him, 3.9 m short of the frame)
  const hpF = fr.hp, st0 = fr.state;
  const c0 = M.stats.carried;
  blowAnd(G, 'longWalk', 'none', { dist: 4.6 });
  out(`     a frame of the line 3.9 m behind where the hero stood: hp ${hpF} -> ${fr.hp}, state ${st0} -> ${fr.state}; the carry-on struck ${M.stats.carried - c0} pieces`);
  assert(fr.hp < hpF || fr.state !== st0, 'the straight (the throw and the carry-on) bites the piece behind the hero');
}

async function scenarioMlWorld() {
  out('\n== scenario MLWORLD (every melee blow strikes the world at its limb\'s height; the gavel craters; the double palm shoves through cover; floor marks) ==');
  const G = mlDuel(2, 3);
  const { game } = G;
  const d = game.dragon, M = d.parts.melee, DS = game.world.destructibles;
  game.player.debug.god = true;
  const ys = [];
  const strike = DS.strike.bind(DS), sweep = DS.sweep.bind(DS);
  DS.strike = (x, z, r, pw, o) => { if (o?.by === 'boss') ys.push(o.y); return strike(x, z, r, pw, o); };
  DS.sweep = (ax, az, bx, bz, r, pw, o) => { if (o?.by === 'boss') ys.push(o.y); return sweep(ax, az, bx, bz, r, pw, o); };
  for (const name of ['benediction', 'genuflect', 'interdict', 'castOut']) {
    settle(G);
    d.brain.cooldowns[name] = 0;
    blowAnd(G, name, 'none', { dist: 1.8 });
  }
  const real = ['benediction', 'genuflect', 'interdict', 'castOut'].reduce((s, n) => s + MOVES[n].beats.filter((b) => !b.feint).length, 0);
  const ylo = Math.min(...ys), yhi = Math.max(...ys);
  out(`     ${M.stats.blows} blows, ${M.stats.world} world blows (${M.stats.struck} pieces struck), heights ${ylo.toFixed(2)} .. ${yhi.toFixed(2)} m; craters ${M.stats.quakes}, shoves ${M.stats.shoves}; floor marks: ${G.ground.join(', ')}`);
  assert(M.stats.blows === real && M.stats.world === real, `every blow struck the world (${M.stats.world} of ${real})`);
  assert(ylo < 0.6 && yhi > 1.0, `at the limb's own height (the sweep low, the palms high: ${ylo.toFixed(2)} .. ${yhi.toFixed(2)})`);
  assert(M.stats.quakes === 1 && G.ground.includes('slam') && G.ground.includes('dash'), `the gavel craters (${M.stats.quakes}); the floor keeps the gavel's slam and the sweep's scuff (${G.ground.join(', ')})`);
  assert(M.stats.shoves === 1, 'the double palm sweeps the line ahead');
  // the crater breaks plates
  settle(G);
  const plates = DS.list.filter((q) => q.kind === 'plate');
  const s0 = plates.filter((q) => q.state === 0 && q.hp === q.hpMax).length;
  d.brain.cooldowns.interdict = 0;
  blowAnd(G, 'interdict', 'none', { dist: 1.8 });
  const s1 = plates.filter((q) => q.hp < q.hpMax || q.state !== 0).length - (plates.length - s0);
  out(`     plates struck by one more gavel: ${s1} (of ${s0} whole before the fight's blows)`);
  assert(s1 > 0, 'the gavel bites the plates');
}

async function scenarioMlLinks() {
  out('\n== scenario MLLINKS (the links of the whole table: a link to a move not built yet is passed over; he chains in every phase) ==');
  const { LINKS, LINK_TABLE } = await imp('src/entities/enemies/falseSaint/links.js');
  const all = new Set(Object.values(LINK_TABLE).flat().map((L) => L.to));
  const missing = [...all].filter((n) => !MOVES[n]);
  out(`     ${Object.keys(LINKS).length} moves with links, ${all.size} targets; not built (yet): ${missing.join(', ') || 'none'}`);
  assert(Object.values(LINKS).every((l) => l.every((L) => typeof L.to === 'string' && ['near', 'mid', 'far', 'away', 'guarding', 'any', 'front', 'side', 'behind'].includes(L.when) && (typeof L.chance === 'number' || L.chance.length === 4))), 'every link is { to, when, chance [P1..P4] }');
  assert(Object.keys(MOVES).filter((n) => !MOVES[n].transition && !MOVES[n].hidden && (MOVES[n].weight.some((w) => w > 0) || MOVES[n].counter) && TUNING.melee[n]).every((n) => n in LINK_TABLE), 'every melee move has its row');
  // a link to a move not built is passed over, the next usable one taken (the rolls all pass: Math.random 0)
  const { linkFor } = await imp('src/entities/enemies/duelist/director.js');
  {
    const G = build();
    const d = G.game.dragon;
    duel(G, { dist: 5, ai: false, form: 2 });
    place(G, 6);
    d.debug.setAI(true);
    const s = d.brain._sense();
    const R0 = Math.random;
    Math.random = () => 0;
    d.brain.cooldowns.longWalk = 0;
    let L = null, err = null;
    try { L = linkFor(d.brain, { name: 'castOut' }, s); } catch (e) { err = e; }
    Math.random = R0;
    assert(!err && LINKS.castOut[0].to === 'votiveFist' && L?.to === 'longWalk', `castOut's links at ${s.dist.toFixed(1)} m in phase 2: votiveFist (not built here) passed over, ${L?.to} taken${err ? ` (${err.message})` : ''}`);
  }
  // his flow in each phase with only these moves (a hero who never parries, god mode, the guard held every
  // other 5 s, walking back in when thrown off): no throw, and he goes on from move to move
  let total = 0;
  for (const form of [1, 2, 3, 4]) {
    const G = build();
    const d = G.game.dragon;
    duel(G, { dist: 3, ai: true, form });
    const p = G.game.player;
    p.debug.god = true;
    const st0 = { ...d.brain.stats };
    const names = new Set();
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') names.add(e.attack); };
    run(G, 40, () => {
      const g = G.game, dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, dist = Math.hypot(dx, dz);
      g.mouseGround.set(d.position.x, 0, d.position.z);
      G.input.axis = dist > 2.6 ? { x: dx / dist, y: -dz / dist } : { x: 0, y: 0 };
      if (Math.floor(g.time / 5) % 2) G.input.press(1); else G.input.up(1);
    }, () => d.mode === 'dead');
    G.watch = null;
    G.input.up(1);
    const k = (f) => d.brain.stats[f] - st0[f];
    total += k('links') + k('chains');
    out(`     phase ${form}: ${k('picks')} picks, ${k('links')} links, ${k('chains')} chains in 40 s (${k('rests')} breathers, ${k('stops')} break-offs: the hero thrown out of a string's reach), cued: ${[...names].join(', ')}`);
    assert(k('picks') >= 10 && names.size >= 4, `phase ${form}: he fights on (${k('picks')} picks, ${names.size} moves cued)`);
  }
  assert(total >= 4, `he goes from move to move without footwork (${total} links and chains in 160 s; with the boosters' gap closers built, more)`);
}

// ================================================================== THE SCENARIOS (one entry per line, each agent in its block)
const S = {
  // --- core
  levels: scenarioLevels,
  data: scenarioData,
  fight: scenarioFight,
  phases: scenarioPhases,
  shell: scenarioShell,
  molten: scenarioMolten,
  death: scenarioDeath,
  events: scenarioEvents,
  // --- world
  // --- body
  // --- fx
  // --- melee
  mlreach: scenarioMlReach,
  mlgrab: scenarioMlGrab,
  mlwalk: scenarioMlWalk,
  mlworld: scenarioMlWorld,
  mllinks: scenarioMlLinks,
  // --- boost
  // --- arsenal
  // --- terrain
  // --- tuning
};
// (opt-in scenarios: listed here, run only by name; tests/run.mjs may run one as a process of its own)
const OPT_IN = new Set([]);
const SKIP = new Set((process.env.GCD_SKIP ?? '').split(',').map((x) => x.trim()).filter(Boolean));
const list = SCEN === 'all' ? Object.keys(S).filter((k) => !OPT_IN.has(k) && !SKIP.has(k)) : SCEN.split(',');
for (const k of list) {
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\n\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nSAINT: ${fails} FAILED` : '\nSAINT: ALL PASSED');
process.exit(fails ? 1 : 0);
