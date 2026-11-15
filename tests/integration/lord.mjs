// The Starless level and the Starless Lord, headless (COMBAT.md → "The Starless Lord"): the REAL
// Player, StarlessLord, Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles,
// CameraRig, Events) wired like src/main.js for `?level=starless`; the world is a light mock on the
// real Colliders, filled by the real set (the crater: world/throneHall.js). A bot drives the input.
// usage: node lord.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI)
//   scenario: level | data | timing | forms | spells | bounds | flow | win | all
// (the spells scenario also covers the Crushing Dark, the Rift, the Dark Star, Parting Light and the glide)
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
const { createThroneHall, THRONE } = await imp('src/world/throneHall.js');
const { Destructibles, STATE } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { StarlessLord } = await imp('src/entities/enemies/starlessLord/lord.js');
const { Duelist } = await imp('src/entities/enemies/duelist/duelist.js');
const { MOVES, MOVE_NAMES, CLIPS_BY_FORM, COUNTERS, STREAKS, TRANSITIONS, realise } = await imp('src/entities/enemies/starlessLord/moves.js');
const { TUNING } = await imp('src/entities/enemies/starlessLord/tuning.js');
const { LORD_ITEMS, LORD_LOADOUT, LORD_CAPE, LORD_PANELS } = await imp('src/entities/enemies/starlessLord/gear.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

const LVL = getLevel('starless');
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
/** The forms a move is used in (its weight; a counter: its own form; a transition: the form it begins). */
const formsOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase - 1];
  if (def.counter) return [COUNTERS.indexOf(name) + 1, STREAKS.indexOf(name) + 1].filter((f) => f > 0); // (a form's counter / its flurry)
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
// the crater's real colliders (the shards, the rim's slabs, the star, the dais's edge), built once
const HALL_SET = (() => {
  const c = new Colliders();
  const set = createThroneHall(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

/** `real`: the crater built anew with its breakables (world.destructibles, the scars, the set's
 *  ambience), for the moves that use them (ADR-109); without it the world is the mock the older
 *  scenarios were written on (the set's colliders, no pieces). */
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
  const set = real ? createThroneHall(U, colliders) : null;
  if (!set) for (const k of HALL_SET.circles) colliders.add(k.x, k.z, k.r, k.tag);
  const counters = { spawns: 0, flares: 0, burns: 0 };
  const world = {
    colliders, bonfire: { ...CONFIG.world.bonfire }, nest: { x: 0, z: THRONE.throne.z },
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
  // the fire field (render/fireField.js): the same NaN guard and spawn count as the glyph pools
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
    world.update = (dt) => { world.destructibles.update(dt); world.scars.update?.(dt); set.ambience.update(dt, game); };
    set.ambience.setup(game);
  }
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  game.dragon = LVL.createBoss(game);
  game.boss = game.dragon;
  game.hud = new Hud(game);
  game.touch = new TouchControls(game);
  game.flow = new GameFlow(game);
  game.lab = new Lab(game);
  game.applyQuality = () => {};
  const takeHit = game.player.takeHit.bind(game.player);
  game.player.takeHit = (h) => {
    const r = takeHit(h);
    G.hits.push({ t: game.time, r, attack: h?.attack, tell: h?.tell, damage: h?.damage, kind: h?.kind });
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
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture, d.lit].every(Number.isFinite)) throw new Error('lord NaN');
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
const dist2 = (G) => Math.hypot(G.game.player.position.x - G.game.dragon.position.x, G.game.player.position.z - G.game.dragon.position.z);

// ---- the defender bot: answers his tells from the flash (parry normal / blue, roll through red)
// style (the STRATEGY measurement): 'mixed' = the above; 'dodge' = a perfect dodge of every tell, never a
// parry; 'parry' = parries, and a red blow rolled early (i-frames, outside the perfect window)
function makeDefender(G, { skill = 1, early = 0.12, style = 'mixed' } = {}) {
  const pend = [];
  const stats = { flashes: 0, parryTry: 0, dodgeTry: 0 };
  return {
    stats,
    onEvent(n, d) {
      if (n === 'combat:flash' && d?.source === 'dragon') {
        stats.flashes++;
        if (skill < 1 && Math.random() > skill) return;
        pend.push({ tell: d.tell, at: G.game.time + TUNING.flashLead, x: d.x, z: d.z, hazard: !!d.hazard && !d.bullet, done: false });
      }
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.4) pend.splice(i, 1);
      for (const e of pend) {
        const left = e.at - t - DT;
        if (e.tell === TELL.RED || style === 'dodge') {
          if (left <= (style === 'parry' ? 0.3 : 0.1)) {
            e.done = true;
            const d = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
            const dx = p.x - d.x, dz = p.z - d.z, l = Math.hypot(dx, dz) || 1;
            // across his blade; out of a marked circle: straight away from its centre
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

/** Fence: keep close, answer every tell, cut in his openings, give the deathblow to a broken lord. */
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
  out('\n== scenario LEVEL (registry, the crater set, the boss slot) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'starless', `levels: ${LEVELS.map((l) => l.id).join(', ')}`);
  assert(levelFromSearch('?level=starless') === LVL && levelFromSearch('?lab&level=LORD') === LVL && levelFromSearch('?level=throne') === LVL, '?level=starless / lord / throne pick the level (case-insensitive)');
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'phase4', 'victory', 'fallen', 'restReset', 'again', 'rise']) if (!LVL.text[k]) assert(false, `the level has its ${k} line`);
  assert(CONFIG.world.bonfire.z === THRONE.bonfire.z && CONFIG.world.dragonSleep.z === THRONE.throne.z + 0.5 && CONFIG.world.bossTriggerZ < THRONE.entryZ && CONFIG.world.dragonBound === THRONE.floor.r && CONFIG.world.bossFloor.zN === THRONE.floor.zN && TUNING.bound === THRONE.floor.r, 'applyLevel merged the crater layout into CONFIG.world (the bonfire, the throne, the lip, his floor)');
  const S = HALL_SET.set;
  assert(S.group?.isObject3D && Array.isArray(S.slabs) && S.slabs.length > 100 && S.bonfire && S.nest && S.sky && typeof S.ambience?.update === 'function' && typeof S.ambience?.flare === 'function', `the set has the forest's shape, a sky and its ambience (${S.slabs.length} floor slabs)`);
  let bad = 0;
  S.group.traverse((m) => { const pos = m.geometry?.attributes?.position; if (pos) for (const v of pos.array) if (!Number.isFinite(v)) bad++; });
  for (const b of S.breakables ?? []) for (const g of [...b.geos, ...(b.broken?.geos ?? [])]) for (const v of g.attributes.position.array) if (!Number.isFinite(v)) bad++;
  assert(bad === 0, `the crater has no NaN vertices (${bad})`);
  // what can be broken, lifted and thrown is listed for the destruction system, not merged into the set
  const B = S.breakables, kinds = (k) => B.filter((b) => b.kind === k).length;
  assert(Array.isArray(B) && B.length >= 30 && B.length <= 120 && kinds('shard') >= 12 && kinds('slab') >= 8 && kinds('hover') === 6, `its breakables: ${B?.length} (shard ${kinds('shard')}, slab ${kinds('slab')}, hover ${kinds('hover')})`);
  assert(B.every((b) => b.mat === 'stone' && b.look === 'prop' && b.geos.length > 0 && Array.isArray(b.colliders) && [b.x, b.z, b.r, b.h].every(Number.isFinite) && b.r > 0 && b.h > 0), 'each in the contract\'s shape (ARCHITECTURE.md Destruction)');
  assert(B.filter((b) => b.kind === 'hover').every((b) => b.colliders.length === 0 && b.cover === false && b.hp === Infinity && b.lift === 2) && B.filter((b) => b.kind !== 'hover').every((b) => b.colliders.length === 1 && b.lift === 2 && b.broken?.geos?.length), 'a hanging stone has no collider and gives no cover; a standing piece has its circle and leaves rubble; the Void may lift all of them');
  // open: nothing tall on the near side (south of the seal's rim), no wall anywhere
  const south = B.filter((b) => b.z > 6 && b.kind !== 'hover'), tallS = Math.max(...south.map((b) => b.h));
  assert(south.length >= 4 && tallS < 3.2, `nothing tall stands south of the duel (${south.length} pieces there, the tallest ${tallS.toFixed(1)} m)`);
  assert(S.scarInk?.length === 3 && S.scarInk[0] > S.scarInk[2] * 4, 'cracks in its floor are ember red');
  assert(HALL_SET.circles.length > 100 && HALL_SET.circles.every((k) => [k.x, k.z, k.r].every(Number.isFinite)), `its colliders are finite (${HALL_SET.circles.length})`);
  // the seal is the origin and clear of colliders; the way in is open; the dais and the star are closed
  const c = new Colliders();
  for (const k of HALL_SET.circles) c.add(k.x, k.z, k.r, k.tag);
  const free = (x, z) => { const p = { x, z }; c.resolve(p, 0.45, 40); return Math.hypot(p.x - x, p.z - z) < 1e-6; };
  assert(free(0, 0) && free(6, 6) && free(-9, -9) && free(0, THRONE.entryZ + 1.2) && free(0, THRONE.entryZ - 1) && free(0, THRONE.bonfire.z - 2), 'the floor, the south lip and the path are walkable');
  assert(!free(0, THRONE.daisZ - 0.8) && !free(7.6, -4.4) && !free(THRONE.star.x, THRONE.star.z + 1.2), 'the dais, a shard and the star are not');
  // no wall: the hero can walk out of the crater between the rim's slabs, east and west as well as south
  const walk = (dx, dz) => { const p = { x: 0, z: 0 }; for (let i = 0; i < 260; i++) { p.x += dx * 0.1; p.z += dz * 0.1; c.resolve(p, 0.45, 40); } return Math.hypot(p.x, p.z); };
  assert(walk(1, 0.12) > 20 && walk(-1, 0.12) > 20 && walk(0, 1) > 20, `the crater is open: walking east, west and south from the seal leaves it (${walk(1, 0.12).toFixed(0)} / ${walk(-1, 0.12).toFixed(0)} / ${walk(0, 1).toFixed(0)} m out)`);
  // the ambience runs headless (no pipeline): setup, a flare, a few frames
  const U = createSharedUniforms();
  const g = { U, time: 0, lights: new LightPool(U), fx: { add: new GlyphParticles(U, { max: 2000 }), alpha: new GlyphParticles(U, { max: 2000, additive: false }), fire: new FireField(U, { max: 2000 }) }, pipeline: null };
  const amb = createThroneHall(U, new Colliders()).ambience;
  amb.setup(g);
  amb.flare(1);
  for (let i = 0; i < 30; i++) amb.update(DT, g);
  // (the vents' flames are heat in the fire field, the wisps and motes glyph particles)
  assert(g.fx.fire.count > 5 && g.fx.add.count + g.fx.fire.count > 20 && g.lights.lights.length === 4, `the vents burn headless (${g.fx.fire.count} blobs, ${g.fx.add.count} particles, ${g.lights.lights.length} lights)`);

  const G = build();
  const d = G.game.dragon;
  assert(d instanceof StarlessLord && d instanceof Duelist && G.game.boss === d && d.state === 'sleeping' && d.mode === 'sleep', 'the boss slot holds the Starless Lord, enthroned');
  assert(Math.hypot(d.position.x - CONFIG.world.dragonSleep.x, d.position.z - CONFIG.world.dragonSleep.z) < 1e-6 && Math.abs(d.position.y - TUNING.intro.seatY) < 1e-6, 'he sits on the throne (the root at the seat)');
  // seated, not standing in his guard on the seat: the animator plays the throne clip (the hips low)
  {
    const v = new THREE.Vector3();
    d.rig.pelvis.getWorldPosition(v);
    assert(d.anim.key === 'duel' && d.brain.clip?.name === 'meditate' && v.y - d.position.y < 0.85, `he waits in the throne clip, seated (hips ${(v.y - d.position.y).toFixed(2)} m over the root)`);
  }
  assert(d.lives.total === 4 && d.lives.left === 4 && d.hp === TUNING.hp && d.phase === 1, 'four forms, a full bar each');
  // the harness: black plate, the hood, the yoke, the war-skirt and the cape, drawn a head taller
  {
    const L = d.rig.loadout;
    assert(L.head === 'lord.hood' && L.chest === 'lord.plate' && L.shoulders === 'lord.yoke' && L.arms === 'lord.arms' && L.legs === 'lord.legs' && L.waist === 'lord.skirt' && L.back === 'lord.cape' && L.weapon === 'lord.saber', `he wears his own harness (${Object.values(L).join(', ')})`);
    assert(d.rig.streamers.length === LORD_CAPE.length && d.rig.coat.length === LORD_PANELS.length && d.rig.offHand?.open && d.rig.offHand?.grip, `the cape hangs on ${d.rig.streamers.length} springs, the war-skirt on ${d.rig.coat.length}`);
    assert(d.drawScale === TUNING.scale && d.anim.drawScale === TUNING.scale && TUNING.scale > 1.2, `he is drawn at ${TUNING.scale} (the animator's gait with it)`);
    // one head: the hood over the faceplate (the owner's pick of three; the two helms are gone)
    const heads = LORD_ITEMS.filter((it) => it.slot === 'head');
    assert(heads.length === 1 && heads[0].id === 'lord.hood' && heads[0].hidesHair && heads[0].shadowsFace && LORD_LOADOUT.head === 'lord.hood', `one head item: ${heads.map((h) => `${h.id} "${h.name}"`).join(', ')}`);
  }
  // the hero's outfit switch (gear/looks.js) rebuilds his rig, which rewrites the shared per-part ink:
  // the Lord's red part-19 line (his blades) is put back
  {
    const U = G.game.U, pl = G.game.player, snap = () => ['uHeroPartInk', 'uHeroPartFill', 'uHeroPartRim'].map((k) => U[k].value[19].toArray().join());
    const s0 = snap();
    pl.setLook('robe');
    pl.setLook('shroud');
    assert(snap().join('|') === s0.join('|') && U.uHeroPartInk.value[19].x > 1.5 && pl.look === 'shroud', "a hero outfit switch keeps the Lord's red part-19 line");
  }
  bad = 0;
  d.object3d.traverse((m) => { const pos = m.geometry?.attributes?.position; if (pos) for (const v of pos.array) if (!Number.isFinite(v)) bad++; });
  assert(bad === 0, `his gear has no NaN vertices (${bad})`);
  assert(d.batch.meshes.length > 0 && d.batch.meshes.length < 28, `he draws through rigid batches (${d.batch.meshes.length} meshes)`);
  assert(d.blades.A && d.blades.B && d.blades.Q && d.blades.L && d.blades.off && !d.blades.A.visible && d.lit === 0, 'every form\'s blades are built; dark while he sits');
  assert(G.game.hud.lifeEls.length === 4, 'the boss bar shows four pips');
  return G;
}

// ================================================================== scenario: data (the move rules)
async function scenarioData() {
  out('\n== scenario DATA (move data rules, every form a move is used in, both ends of every random roll) ==');
  let checked = 0;
  const strings = [0, 0, 0, 0, 0];
  const count = [0, 0, 0, 0, 0];
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
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        const first = real[0];
        if (!def.transition && !(first && first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first real windup ${first ? (first.impact - first.tellAt).toFixed(3) : '-'} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TUNING.minHitGap}`);
        for (const b of real) if (!(b.flash >= b.tellAt - 1e-6)) assert(false, `${tag}: hit ${b.hit} flashes after its tell`);
        for (let i = 1; i < real.length; i++) if (!(real[i].flash >= real[i - 1].impact - 1e-6)) assert(false, `${tag}: hit ${i}'s flash comes after hit ${i - 1} lands`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone, a release or a cast`);
        for (const b of real) if (b.def.tell === TELL.RED && b.def.zone?.kind === 'ring' && !b.def.ring) assert(false, `${tag}: a red ring marks the ground`);
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        if (!(A.clip.kit === CLIPS_BY_FORM[(def.transition ? def.phase : f) - 1].clash.kit)) assert(false, `${tag}: compiled round its form's stance`);
        checked++;
      }
      if (most >= 5) strings[f]++;
    }
  }
  assert(checked > 100, `${checked} realisations obey the rules (a tell per hit, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart, each flash after the hit before it)`);
  for (let f = 1; f <= FORMS; f++) assert(count[f] >= 6 && strings[f] >= 2, `form ${f}: ${count[f]} moves, ${strings[f]} strings of five hits or more`);
  // strings of six: at least one per form, with a drawn alternative (a `pick`) somewhere in it
  for (let f = 1; f <= FORMS; f++) {
    const six = MOVE_NAMES.filter((n) => weightIn(MOVES[n], f) > 0 && realise(n, f, () => 0.2).beats.filter((b) => !b.feint).length >= 6);
    const varied = six.filter((n) => MOVES[n].beats.some((b) => Array.isArray(b.pick) || b.chance < 1));
    assert(six.length >= 1 && varied.length >= 1, `form ${f} has a six-hit string that varies (${six.join(', ')})`);
  }
  for (const [ph, mv] of Object.entries(TRANSITIONS)) assert(MOVES[mv]?.transition && MOVES[mv].phase === Number(ph), `form ${ph} begins with ${mv}`);
  assert(COUNTERS.length === FORMS && COUNTERS.every((n, i) => MOVES[n]?.counter && realise(n, i + 1, () => 0.5)), 'every form has its counter');
  assert(TUNING.flashLead <= TUNING.minHitGap + 1e-9, `the glint (${TUNING.flashLead} s) fits inside the tightest gap (${TUNING.minHitGap} s)`);
  // the gaps really tighten form by form
  const gap = (f) => { const A = realise(f === 1 ? 'litany' : f === 2 ? 'tempest' : f === 3 ? 'cyclone' : 'judgment', f, () => 0.2); const h = A.beats.filter((b) => !b.feint); return h[1].impact - h[0].impact; };
  const gaps = [1, 2, 3, 4].map(gap);
  assert(gaps[0] > gaps[1] && gaps[1] > gaps[2] && gaps[2] > gaps[3] && gaps[3] >= TUNING.minHitGap, `a string's hits come faster form by form: ${gaps.map((g) => g.toFixed(3)).join(' > ')} s`);
}

// ================================================================== scenario: timing (flash → contact)
async function scenarioTiming() {
  out('\n== scenario TIMING (every move from inside its band: each glint is a blow, on time) ==');
  let worst = 0, moves = 0;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    if (def.transition) continue;
    if (def.terrain) continue; // (a move on the crater's pieces needs them: scenario TERRAIN, on the real set)
    for (const f of formsOf(name)) {
      const G = build();
      const d = G.game.dragon;
      const [lo, hi] = def.band;
      const at = def.counter ? 2.2 : Math.max(1.6, Math.min(hi - 0.4, lo + (Math.min(hi, 12) - lo) * 0.4));
      duel(G, { dist: at, form: f });
      G.game.player.debug.god = true;
      const flashes = [], contacts = [];
      G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') flashes.push(G.game.time); };
      const h0 = G.hits.length;
      if (!d.debug.trigger(name)) { assert(false, `${name} form ${f}: starts`); continue; }
      run(G, 9, null, () => d.mode === 'foot' && !d.fx.shotsAlive && !d.fx.crescentsAlive && !d.fx.strikesAlive && d._storm.left === 0);
      for (const h of G.hits.slice(h0)) if (h.r !== RESULT.IGNORED) contacts.push(h.t);
      // every contact was cued flashLead before it (± a frame and the hit-stop of the blow before)
      let w = 0;
      for (const c of contacts) {
        const fl = flashes.filter((t) => t <= c + 1e-6).pop();
        const lead = fl === undefined ? Infinity : Math.abs(c - fl - TUNING.flashLead);
        w = Math.max(w, lead);
      }
      worst = Math.max(worst, Number.isFinite(w) ? w : 9);
      moves++;
      const firstLands = contacts.length >= 1;
      if (!firstLands || !(w <= 0.09)) assert(false, `${name} form ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
      else out(`     ${name.padEnd(10)} form ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
    }
  }
  assert(moves >= 30 && worst <= 0.09, `${moves} move × form runs: every contact within ${(worst * 1000).toFixed(0)} ms of its flash + ${TUNING.flashLead} s, and every move's first hit lands`);
}

// ================================================================== scenario: forms (four bars, a deathblow each)
async function scenarioForms() {
  out('\n== scenario FORMS (four bars: a bar emptied or posture broken → the deathblow → the next form) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 2.2 });
  game.player.debug.god = true;
  assert(d.lit > 0.99 && d.blades.A.visible && !d.blades.off.visible && !d.blades.B.visible && !d.blades.Q.visible, 'form 1: one blade lit');
  // the Sekiro rule: posture is hard to move on a full bar
  d.posture = 0;
  d.addPosture(POSTURE.parry.normal);
  const full = d.posture;
  d.posture = 0;
  d.hp = d.maxHp * 0.1;
  d.addPosture(POSTURE.parry.normal);
  const low = d.posture;
  d.posture = 0;
  d.hp = d.maxHp;
  assert(Math.abs(full - POSTURE.parry.normal * TUNING.posture.gainByHp[0]) < 1e-6 && low > full * 2, `a parry moves his posture ${full.toFixed(1)} on a full bar, ${low.toFixed(1)} on a bar nearly empty`);
  // the bar emptied: he breaks, he does not die
  const dealt = d.takeHit({ damage: 99999, exact: true });
  assert(dealt > 0 && d.hp === 0 && d.broken && d.mode === 'broken' && d.state === 'staggered' && !G.counts['dragon:death'], 'an empty bar breaks him (no death): on one knee');
  // nobody answers: he rises with a little back
  run(G, TUNING.posture.breakTime + 0.3);
  assert(!d.broken && Math.abs(d.hp - d.maxHp * TUNING.posture.spared.hp) < 1e-6 && d.posture > 0 && d.phase === 1, `a break left alone: he rises with ${Math.round(d.hp)} HP and half the meter`);
  // the deathblow, with the hero's own attack press
  let f = deathblow(G, 'hp');
  assert(f === 2 && G.counts['dragon:plunged'] === 1 && G.counts['dragon:phase2'] === 1 && d.lives.left === 3 && d.hp === d.maxHp, `the deathblow ends form 1: form ${f}, ${d.lives.left} pips left, a full bar`);
  assert(d._changing && d.brain.act?.def?.transition && d.takeHit({ damage: 50 }) === 0, 'through the ignition nothing lands on him');
  run(G, 5, null, () => d.mode === 'foot');
  assert(!d._changing && d.lit > 0.9 && d.blades.off.visible && d.blades.L.visible && d.blades.A.visible && G.counters.flares >= 1, 'form 2: both blades lit, the seal flared');
  assert(d.maxPosture === TUNING.posture.max[1] && d.posture === 0, 'form 2 has its own posture meter');
  const hud = game.hud;
  run(G, 0.2);
  assert(hud.lifeEls.filter((e) => e.classList.contains('gone')).length === 1, 'the boss bar spent one pip');
  f = deathblow(G, 'posture');
  run(G, 5, null, () => d.mode === 'foot');
  assert(f === 3 && d.blades.B.visible && d.blades.hiltB.visible && !d.blades.off.visible && d.lives.left === 2, 'a posture break and the deathblow: form 3, the staff lit at both ends');
  f = deathblow(G, 'hp');
  run(G, 5, null, () => d.mode === 'foot');
  assert(f === 4 && d.blades.Q.visible && !d.blades.B.visible && d.lives.left === 1 && G.counts['dragon:phase4'] === 1, 'form 4: the cross-hilted blade');
  deathblow(G, 'posture');
  assert(d.mode === 'dying' && G.counts['dragon:death'] === 1, 'the fourth deathblow kills him');
  run(G, 7, null, () => d.mode === 'dead');
  assert(d.mode === 'dead' && d.lives.left === 0 && G.counts['dragon:dead'] === 1 && d.hurtSpheres.length === 0, 'he falls and is gone');
  run(G, 4);
  assert(game.state === 'victory', `the flow ends in victory (${game.state})`);
  // a reset puts him back on the throne, form 1
  d.reset();
  assert(d.phase === 1 && d.lives.left === 4 && d.hp === d.maxHp && d.mode === 'sleep' && d.lit === 0 && Math.abs(d.position.y - TUNING.intro.seatY) < 1e-6, 'reset: enthroned again, form 1, blades dark');
  // the Lab's jumps
  const G2 = build();
  duel(G2, { dist: 6 });
  const d2 = G2.game.dragon;
  assert(d2.debug.phase2() && d2.phase === 2 && !d2.debug.phase4(), 'Lab: Phase 2 starts the next ignition; Phase 4 waits its turn');
  run(G2, 5, null, () => d2.mode === 'foot');
  assert(d2.debug.setForm(4) && d2.phase === 4 && d2.debug.form === 4, 'Lab: setForm jumps to any form');
}

// ================================================================== scenario: spells
async function scenarioSpells() {
  out('\n== scenario SPELLS (the Void: lightning, push, pull, the thrown blade, torn stone, the storm, the blink) ==');
  const stage = (form, dist, opts = {}) => {
    const G = build();
    duel(G, { dist, form });
    if (opts.god) G.game.player.debug.god = true;
    return G;
  };
  const cast = (G, name, secs = 6, step = null) => {
    const d = G.game.dragon;
    const h0 = G.hits.length;
    const ok = d.debug.trigger(name);
    run(G, secs, step, () => d.mode === 'foot' && !d.fx.shotsAlive && !d.fx.crescentsAlive && !d.fx.strikesAlive && d._storm.left === 0);
    return { ok, hits: G.hits.slice(h0) };
  };
  // ---- Void lightning
  {
    const G = stage(1, 8);
    Math.random = () => 0.9; // (the second bolt's 50 % chance: not this time)
    const hp0 = G.game.player.hp;
    const r = cast(G, 'voidBolt');
    assert(r.ok && r.hits.length === 1 && r.hits[0].r === RESULT.HIT && r.hits[0].kind === 'lightning' && G.game.player.hp < hp0, `unanswered, the bolt lands (${(hp0 - G.game.player.hp).toFixed(1)} damage from 8 m)`);
  }
  {
    const G = stage(1, 8);
    Math.random = () => 0.9;
    G.defend = makeDefender(G);
    const d = G.game.dragon;
    const p0 = d.posture, hp0 = d.hp;
    const r = cast(G, 'voidBolt', 6, () => G.defend.act());
    assert(r.hits.some((h) => h.r === RESULT.PARRIED) && d.posture > p0 && d.hp === hp0, `a parry deflects it: posture ${p0.toFixed(0)} → ${d.posture.toFixed(0)}, no damage to him`);
  }
  {
    const G = stage(1, 8);
    Math.random = () => 0.9;
    G.defend = makeDefender(G, { early: 0.05 }); // inside the perfect window
    const d = G.game.dragon;
    const hp0 = d.hp;
    const r = cast(G, 'voidBolt', 6, () => G.defend.act());
    assert(r.hits.some((h) => h.r === RESULT.PARRIED) && Math.abs(hp0 - d.hp - TUNING.bolt.returnDamage) < 1e-6, `a perfect parry sends it back: ${hp0 - d.hp} damage to him`);
  }
  // ---- the push
  {
    const G = stage(1, 6);
    const d0 = dist2(G);
    const r = cast(G, 'voidPush');
    run(G, 0.8);
    assert(r.hits.length === 1 && r.hits[0].r === RESULT.HIT && dist2(G) > d0 + 3, `the push throws the hero back (${d0.toFixed(1)} → ${dist2(G).toFixed(1)} m)`);
    const G2 = stage(1, 6);
    G2.defend = makeDefender(G2);
    const e0 = dist2(G2);
    const r2 = cast(G2, 'voidPush', 6, () => G2.defend.act());
    assert(r2.hits.some((h) => h.r === RESULT.PARRIED) && dist2(G2) < e0 + 1.2 && !G2.game.dragon.fx.crescentsAlive, 'a parry cuts the wall of force: the hero holds his ground');
  }
  // ---- the pull
  {
    const G = stage(1, 8, { god: true });
    const d0 = dist2(G);
    const d = G.game.dragon;
    let near = d0;
    d.debug.trigger('grasp');
    run(G, 1.4, () => { near = Math.min(near, dist2(G)); });
    assert(G.hits.some((h) => h.kind === 'pull' && h.r === RESULT.HIT) && near < d0 - 3, `the pull drags the hero to him (${d0.toFixed(1)} → ${near.toFixed(1)} m)`);
    const G2 = stage(1, 8);
    G2.defend = makeDefender(G2);
    const r2 = cast(G2, 'grasp', 6, () => G2.defend.act());
    const pulled = r2.hits.find((h) => h.kind === 'pull');
    assert(pulled && (pulled.r === RESULT.DODGED || pulled.r === RESULT.PERFECT), `a roll slips the pull (${pulled?.r})`);
  }
  // ---- the thrown blade
  {
    const G = stage(2, 8, { god: true });
    const d = G.game.dragon;
    let out0 = false, flashes = 0;
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.attack === 'glaive') flashes++; };
    d.debug.trigger('glaive');
    run(G, 5, () => { out0 = out0 || d.glaiveOut; }, () => out0 && !d.glaiveOut && d.mode === 'foot');
    run(G, 0.1);
    const passes = G.hits.filter((h) => h.attack === 'glaive' && h.r !== RESULT.IGNORED).length;
    assert(out0 && !d.glaiveOut && d.blades.A.visible && flashes === 2 && passes === 2, `the blade leaves his hand, passes the hero twice (${flashes} cues, ${passes} contacts) and comes home`);
  }
  // ---- torn stone
  {
    const G = stage(3, 9, { god: true });
    const tells = [];
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.attack === 'debris') tells.push(e.tell); };
    const r = cast(G, 'debris', 8);
    const red = tells.filter((t) => t === TELL.RED).length;
    assert(tells.length === 4 && red === 1 && r.hits.filter((h) => h.attack === 'debris').length === 4, `four stones fly, each cued: three to parry, one great red one (${tells.join(', ')})`);
  }
  // ---- the storm
  {
    const G = stage(4, 6, { god: true });
    let marks = 0;
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.attack === 'storm' && e.hazard) marks++; };
    const r = cast(G, 'storm', 9);
    const struck = r.hits.filter((h) => h.attack === 'storm' && h.r === RESULT.HIT).length;
    assert(marks === 6 && struck >= 2 && G.counters.burns >= 6, `six strikes are called and cued; a hero who stands still is struck (${struck} of 6)`);
    const G2 = stage(4, 6);
    G2.defend = makeDefender(G2);
    G2.game.dragon.debug.trigger('storm');
    run(G2, 7, () => G2.defend.act());
    const took = G2.hits.filter((h) => h.attack === 'storm' && h.r === RESULT.HIT).length;
    assert(took <= 1, `a hero who rolls out of each mark is struck at most once (${took})`);
  }
  // ---- the blink
  {
    const G = stage(4, 5, { god: true });
    const d = G.game.dragon, p = G.game.player;
    const before = { x: d.position.x, z: d.position.z };
    d.debug.trigger('rend');
    run(G, 0.25);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const rel = (d.position.x - p.position.x) * fx + (d.position.z - p.position.z) * fz;
    assert(Math.hypot(d.position.x - before.x, d.position.z - before.z) > 3 && rel < -1 && dist2(G) < 2.8, `he is gone and behind the hero (${rel.toFixed(1)} m along the hero's facing, ${dist2(G).toFixed(1)} m off)`);
  }
  // ---- the Crushing Dark
  {
    const G = stage(1, 6);
    const d = G.game.dragon, p = G.game.player, hp0 = p.hp;
    let down = false, crush = false;
    const ok = d.debug.trigger('grip');
    run(G, 3.5, () => { down = down || p.state === 'knockdown'; crush = crush || d.fx.crushes.some((c) => c.alive); });
    const hit = G.hits.find((h) => h.kind === 'grip');
    assert(ok && hit?.r === RESULT.HIT && hit.tell === TELL.RED && down && crush && p.hp < hp0, `unanswered, the grip closes: the hero is thrown down and crushed (${(hp0 - p.hp).toFixed(1)} damage)`);
    const G2 = stage(1, 6);
    G2.defend = makeDefender(G2);
    const r2 = cast(G2, 'grip', 5, () => G2.defend.act());
    assert(!r2.hits.some((h) => h.kind === 'grip' && h.r === RESULT.HIT) && G2.game.player.state !== 'knockdown', `a roll slips it (${r2.hits.filter((h) => h.kind === 'grip').map((h) => h.r).join(', ') || 'out of its line'})`);
  }
  // ---- the Rift
  {
    const G = stage(3, 8, { god: true });
    const styles = [];
    const fx = G.game.dragon.fx, thrown = fx.throwCrescent.bind(fx);
    fx.throwCrescent = (...a) => { styles.push(a[4]?.style); return thrown(...a); };
    const r = cast(G, 'rift', 6);
    assert(styles.length === 3 && styles.every((s) => s === 'rift') && r.hits.filter((h) => h.attack === 'rift' && h.r === RESULT.HIT).length === 1, `the Rift throws three fissures; the one at the hero lands (${styles.length})`);
    const G2 = stage(3, 8);
    G2.defend = makeDefender(G2);
    const r2 = cast(G2, 'rift', 6, () => G2.defend.act());
    assert(r2.hits.some((h) => h.attack === 'rift' && h.r === RESULT.PARRIED) && !r2.hits.some((h) => h.attack === 'rift' && h.r === RESULT.HIT), 'a parry breaks the fissure');
  }
  // ---- the Dark Star
  {
    const G = stage(4, 6, { god: true });
    let marks = 0;
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.attack === 'star' && e.hazard) marks++; };
    const d = G.game.dragon, p = G.game.player;
    let follow = 0;
    d.debug.trigger('star');
    // (the hero walks off: the star goes after him until its cue)
    run(G, 0.9);
    const star = () => d.fx.strikes.find((s) => s.alive && s.style === 'star');
    const s0 = star();
    const at0 = s0 ? Math.hypot(s0.x - p.position.x, s0.z - p.position.z) : 99;
    run(G, 1.0);
    const s1 = star();
    follow = s1 ? at0 - Math.hypot(s1.x - p.position.x, s1.z - p.position.z) : 0;
    run(G, 3, null, () => d.mode === 'foot' && !d.fx.strikesAlive);
    const hit = G.hits.find((h) => h.attack === 'star');
    assert(!!s0 && follow > 1 && marks === 1 && hit?.r === RESULT.HIT && hit.kind === 'void', `the Dark Star drifts onto the hero (${follow.toFixed(1)} m closer), cues once and bursts on him`);
    const G2 = stage(4, 6);
    G2.defend = makeDefender(G2);
    G2.game.dragon.debug.trigger('star');
    run(G2, 5, () => G2.defend.act());
    assert(!G2.hits.some((h) => h.attack === 'star' && h.r === RESULT.HIT), 'a roll at its cue slips the burst');
  }
  // ---- Parting Light
  {
    const G = stage(2, 2, { god: true });
    const d = G.game.dragon, d0 = dist2(G);
    let n = 0, top = 0;
    const fx = d.fx, thrown = fx.throwCrescent.bind(fx);
    fx.throwCrescent = (...a) => { n++; return thrown(...a); };
    const r = cast(G, 'parting', 6, () => { top = Math.max(top, d.position.y); });
    assert(r.ok && n === 2 && top > 1 && dist2(G) > d0 + 3 && r.hits.some((h) => h.attack === 'parting' && h.r === RESULT.HIT), `a backflip out of reach (${d0.toFixed(1)} → ${dist2(G).toFixed(1)} m, ${top.toFixed(1)} m up) and two crescents, cued and landing`);
  }
  // ---- the glide
  {
    const G = stage(1, 15, { god: true });
    const d = G.game.dragon;
    d.debug.setAI(true);
    let glided = false, top = 0, fast = 0;
    const hold = () => { d.brain.gapT = 5; };
    run(G, 4, () => {
      hold();
      if (d.anim.key === 'glide') {
        glided = true;
        top = Math.max(top, d.position.y);
        fast = Math.max(fast, Math.hypot(d.pilot.groundVel.x, d.pilot.groundVel.z));
      }
    }, () => dist2(G) < 3.2);
    run(G, 1.5, hold);
    assert(glided && top > TUNING.glide.hover * 0.8 && fast > TUNING.glide.on && d.position.y < 0.02 && d.anim.key === 'loco' && d.mode === 'foot', `across the crater he is carried (${top.toFixed(2)} m off the floor at ${fast.toFixed(1)} m/s); in reach he comes down and walks`);
  }
  // ---- the red tide
  {
    const G = stage(4, 9, { god: true });
    let n = 0;
    const fx = G.game.dragon.fx, thrown = fx.throwCrescent.bind(fx);
    fx.throwCrescent = (...a) => { n++; return thrown(...a); };
    cast(G, 'tide', 8);
    assert(n === 5, `Red Tide throws five crescents (${n})`);
  }
}

// ================================================================== scenario: bounds
async function scenarioBounds() {
  out('\n== scenario BOUNDS (he keeps to the crater\'s floor, and a hero backed against the rim is still in his reach) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, B = THRONE.floor.r, zN = THRONE.floor.zN;
  duel(G, { dist: 4, ai: true, form: 3 });
  p.debug.god = true;
  let outside = 0, melee = 0;
  const h0 = G.hits.length;
  run(G, 45, () => {
    p.debug.teleport(10.3, 10.4); // against the south-east rim, a metre past his floor
    if (d.mode !== 'intro' && d.position.y < 0.5 && (Math.hypot(d.position.x, d.position.z) > B + 1e-6 || d.position.z < zN - 1e-6)) outside++;
  });
  for (const h of G.hits.slice(h0)) if (h.r === RESULT.HIT && h.kind === 'slash') melee++;
  assert(d.bound === B && outside === 0, `45 s of form 3 against a hero at the rim: never off his floor, a circle of ${B} m south of the dais (${outside} frames outside)`);
  assert(melee >= 3, `his blade reaches the rim (${melee} blows landed there)`);
  // every form, AI on, a hero who stands in the middle: no errors, no NaN (G.tick throws), the particle pool holds
  // (and his free hand stays the duelists': rigid on the forearm, no wrist turn, no sword fingers;
  // the hero's alone has them, anim.js opts.freeHand)
  let peak = 0, wMin = 1, plain = true;
  for (let f = 1; f <= FORMS; f++) {
    const Gf = build();
    duel(Gf, { dist: 3, ai: true, form: f });
    Gf.game.player.debug.god = true;
    const df = Gf.game.dragon;
    run(Gf, 30, () => { wMin = Math.min(wMin, Math.abs(df.rig.arms.L.wrist.quaternion.w)); });
    plain &&= df.anim.freeHand === false && df.rig.offHand?.fingers === undefined && Gf.game.player.anim.freeHand === true;
    peak = Math.max(peak, Gf.peakAdd);
    if (Gf.payload.size) assert(false, `form ${f}: finite event payloads (${[...Gf.payload].join(', ')})`);
  }
  assert(peak < 6500, `30 s of every form with the AI on: the additive particle pool peaks at ${peak} of 7000`);
  assert(plain && wMin > 0.99999, `his free hand is a duelist's: no free-hand animator, no sword fingers, the wrist never turns (|w| ≥ ${wMin.toFixed(6)})`);
}

// ================================================================== scenario: flow
async function scenarioFlow() {
  out('\n== scenario FLOW (title → the south lip → the throne intro → the duel) ==');
  const G = build();
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  run(G, 0.3);
  input.tap('Enter');
  run(G, 0.5);
  if (game.state !== 'explore') game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(game.state === 'explore' && d.mode === 'sleep', 'exploring; he sits');
  p.debug.teleport(0, THRONE.entryZ + 0.6);
  run(G, 0.2);
  assert(d.mode === 'sleep', 'outside the crater he does not stir');
  run(G, 3, () => { input.axis = { x: 0, y: 1 }; }, () => d.mode !== 'sleep');
  input.axis = { x: 0, y: 0 };
  assert(d.mode === 'intro' && game.state === 'bossIntro' && p.position.z < CONFIG.world.bossTriggerZ + 0.5, `over the lip, on the crater's floor, he lifts his head (hero at z ${p.position.z.toFixed(1)})`);
  let top = 0, lit = false, air = false;
  run(G, 6, () => { top = Math.max(top, d.position.y); lit = lit || d.lit > 0.9; air = air || d.state === 'airborne'; }, () => d.mode === 'foot' || d.mode === 'act');
  run(G, 0.2);
  assert(G.counts['dragon:introDone'] === 1 && game.state === 'boss', `the intro ends in the duel (${game.state})`);
  assert(lit && air && top > TUNING.intro.apex * 0.9 && G.counts['dragon:land'] >= 1, `the blade ignites and he leaps from the dais (apex ${top.toFixed(1)} m)`);
  // (on the floor, or carried a hand's breadth over it: he glides after a hero who keeps his distance)
  assert(d.position.y >= 0 && d.position.y <= TUNING.glide.hover + 1e-6 && Math.hypot(d.position.x - TUNING.intro.land.x, d.position.z - TUNING.intro.land.z) < 6 && d.position.z > THRONE.floor.zN - 1e-6, `he lands on the crater's floor by the seal (${d.position.x.toFixed(1)}, ${d.position.z.toFixed(1)})`);
  // the hero dies; resting resets him to the throne
  p.debug.god = false;
  p.hp = 1;
  d.debug.setAI(true);
  run(G, 25, null, () => game.state === 'dead');
  assert(game.state === 'dead', 'the lord can kill the hero');
  run(G, 12, () => { if (((game.realTime * 60) | 0) % 30 === 0) input.tap('Enter'); }, () => game.state === 'explore');
  assert(game.state === 'explore' && d.mode === 'sleep' && d.phase === 1 && Math.abs(d.position.y - TUNING.intro.seatY) < 1e-6, `after the death he is back on the throne (${game.state}, ${d.mode})`);
}

// ================================================================== scenario: win
// ================================================================== scenario: training (ADR-099)
// Every situation of the Training catalogue that applies to this boss, run by the runner itself
// (src/dev/training.js): each must play out (done, within its time) and show what it promises.
async function scenarioTraining() {
  out('\n== scenario TRAINING (every situation of the Training catalogue for this boss plays out and shows what it promises) ==');
  const G = build(SEED, true); // (the real crater: the TERRAIN situations and his terrain moves need its pieces)
  const { game } = G;
  duel(G, { dist: 4 });
  const T = game.lab.training;
  const L = T.list();
  const cats = new Set(L.map((s) => s.cat));
  out(`   ${L.length} situations in ${cats.size} categories: ${[...cats].join(', ')}`);
  const bad = [];
  for (const s of L) {
    if (s.cat === 'BOSS MOVES' && !true) continue;
    T.run(s.id);
    let frames = 0;
    while (T.ph !== 'done' && frames < Math.round(40 / DT)) { G.tick(DT); frames++;}
    const r = T.lastResult;
    const ok = T.ph === 'done' && r?.id === s.id && r.ok;
    if (!ok || process.env.ABYSS_TRACE) out(`   ${ok ? 'ok ' : 'BAD'} ${s.cat} · ${s.name}: ${T.ph} in ${(frames * DT).toFixed(1)} s · missing ${JSON.stringify(r?.missing ?? '?')} · hero ${game.player.state} streak ${game.player.streak} · boss ${game.dragon.state}`);
    if (!ok) bad.push(s.id);
  }
  T.stop();
  assert(L.length >= 20 && !bad.length, `every situation plays out and shows what it promises (${L.length - bad.length} of ${L.length}${bad.length ? `; not: ${bad.join(', ')}` : ''})`);
  return G;
}

// ================================================================== scenario: terrain (ADR-109)
// The crater's pieces in his grip, on the real set with its real breakables (build(seed, true)).
async function scenarioTerrain() {
  out('\n== scenario TERRAIN (the crater\'s pieces in his grip: Void Hurl, Glass Rain, Crown Fall) ==');
  const names = ['voidHurl', 'glassRain', 'crownFall'];
  // ---- a world without pieces: the lab stage, the other scenarios' mock
  {
    const G = build();
    duel(G, { dist: 8, form: 3 });
    const d = G.game.dragon;
    assert(names.every((n) => MOVES[n]?.terrain && d.weigh(n, MOVES[n], 1, 8) === 0 && d.debug.trigger(n) === false) && d.mode === 'foot', 'in a world without pieces his AI gives the three moves no weight and none can start');
    assert(names.every((n) => d.debug.abilities().some((a) => a.name === n)), 'they are in his abilities (the Lab, Training\'s BOSS MOVES)');
  }
  /** The real crater, the duel on, form `form`: him at (bx, bz), the hero at (hx, hz). */
  const stage = (form, hx, hz, bx = 0, bz = -4) => {
    const G = build(SEED, true);
    duel(G, { dist: 8, form });
    const d = G.game.dragon, p = G.game.player;
    p.debug.god = true;
    d.position.set(bx, 0, bz);
    p.debug.teleport(hx, hz);
    d.yaw = Math.atan2(hx - bx, hz - bz);
    run(G, 0.2);
    G.flashes = [];
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon' && e.hazard) G.flashes.push(G.game.time); };
    return G;
  };
  const settled = (G) => () => {
    const d = G.game.dragon;
    return d.mode === 'foot' && !d.terrain.busy && !G.game.world.destructibles.active.some((b) => b.state === STATE.FALLING || b.state === STATE.FLYING);
  };
  /** Run his move to the end; what he held on the way. */
  const play = (G, name, step = null) => {
    const D = G.game.world.destructibles, seen = new Set();
    let top = 0;
    const ok = G.game.dragon.debug.trigger(name);
    run(G, 8, () => {
      for (const b of D.list) if (b.state === STATE.HELD) { seen.add(b); top = Math.max(top, b.py); }
      step?.(G);
    }, settled(G));
    return { ok, held: [...seen], top };
  };

  // ---- the stones in the air hang by their bodies' offset (the set's ambience keeps them there)
  {
    const G = stage(1, 0, 4.5);
    const hov = G.game.world.destructibles.list.filter((b) => b.kind === 'hover');
    assert(hov.length === 6 && hov.every((b) => b.def.hover > 1 && Math.abs(b.body.position.y - b.def.hover) <= 0.15 && b.state === STATE.INTACT), `six stones hang whole, ${hov.map((b) => (b.def.hover + b.h * 0.5).toFixed(1)).join(' / ')} m up`);

    // ---- Void Hurl on a hero who stands still
    const d = G.game.dragon;
    assert(d.weigh('voidHurl', MOVES.voidHurl, 1, 8.5) > 0, 'Void Hurl: with pieces in reach his AI may pick it');
    const h0 = G.hits.length;
    const r = play(G, 'voidHurl');
    const hit = G.hits.slice(h0).filter((h) => h.attack === 'voidHurl');
    assert(r.ok && r.held.length === 1 && r.held[0].kind === 'hover' && r.top > 2.2, `Void Hurl takes ONE piece, a stone already in the air, and hangs it beside him (${r.top.toFixed(1)} m)`);
    assert(hit.length === 1 && hit[0].r === RESULT.HIT && hit[0].tell === TELL.RED && hit[0].kind === 'crush' && G.flashes.length === 1 && Math.abs(hit[0].t - G.flashes[0] - TUNING.flashLead) < 0.06, `it lands on a hero who stands still: red, cued ${(hit[0] ? hit[0].t - G.flashes[0] : NaN).toFixed(3)} s before (flashLead ${TUNING.flashLead})`);
    assert(r.held[0].state === STATE.GONE && r.held[0].body.position.y === 0 && !d.terrain.busy, 'the stone is gone where it landed; nothing of his is left in the air');
    // ---- the reset puts it back in the air
    G.game.world.restore();
    run(G, 0.1);
    assert(hov.every((b) => b.state === STATE.INTACT && Math.abs(b.body.position.y - b.def.hover) <= 0.15), 'after the reset every stone hangs again');
  }
  // ---- out of the ring: no blow
  {
    const G = stage(1, 0, 4.5);
    const D = G.game.world.destructibles, p = G.game.player;
    const h0 = G.hits.length;
    let moved = false;
    const r = play(G, 'voidHurl', () => { if (!moved && D.list.some((b) => b.state === STATE.FLYING)) { moved = true; p.debug.teleport(7, 9); } });
    assert(r.ok && moved && G.flashes.length === 1 && !G.hits.slice(h0).some((h) => h.attack === 'voidHurl'), 'a hero who leaves the ring while the stone is in the air is not hit (the ring still glints)');
  }
  // ---- cut short before the throw: what he holds drops
  {
    const G = stage(1, 0, 4.5);
    const d = G.game.dragon, D = G.game.world.destructibles;
    const h0 = G.hits.length;
    d.debug.trigger('voidHurl');
    run(G, 0.5);
    const held = D.list.find((b) => b.state === STATE.HELD);
    d.debug.stagger();
    run(G, 4, null, settled(G));
    assert(held && held.state === STATE.GONE && !d.terrain.busy && G.flashes.length === 0 && !G.hits.slice(h0).some((h) => h.attack === 'voidHurl'), 'staggered in the windup, the stone drops where it hung: no ring, no blow');
  }
  // ---- with the stones gone he tears shards out of the floor
  {
    const G = stage(1, 0, 4.5);
    const D = G.game.world.destructibles;
    for (const b of D.list) if (b.kind === 'hover') { D.take(b); D.drop(b); }
    run(G, 1.5);
    const r = play(G, 'voidHurl');
    assert(r.ok && r.held.length === 1 && r.held[0].kind !== 'hover' && r.held[0].colliders.length === 1 && !G.game.world.colliders.circles.includes(r.held[0].colliders[0]), `with no stone left in the air he tears a ${r.held[0]?.kind} out of the floor (its collider goes with it)`);
  }
  // ---- Glass Rain
  {
    const G = stage(3, 0, 4.5);
    const d = G.game.dragon;
    assert(d.weigh('glassRain', MOVES.glassRain, 1, 8.5) > 0, 'Glass Rain: his AI may pick it in form 3');
    const h0 = G.hits.length;
    const r = play(G, 'glassRain');
    const hits = G.hits.slice(h0).filter((h) => h.attack === 'glassRain');
    const gaps = G.flashes.slice(1).map((t, i) => t - G.flashes[i]);
    assert(r.ok && r.held.length === 3 && r.held.every((b) => b.state === STATE.GONE), 'Glass Rain takes three pieces and throws them all');
    assert(G.flashes.length === 3 && gaps.every((g) => g >= TUNING.minHitGap - 0.02) && hits.length >= 1 && hits.every((h) => h.tell === TELL.RED), `three rings, each cued, ${gaps.map((g) => g.toFixed(2)).join(' and ')} s apart (>= ${TUNING.minHitGap}); ${hits.length} land on a hero who stands still`);
  }
  // ---- Crown Fall: the tall shard beside the hero comes down on him; the fall is the world's
  {
    const G = stage(2, 8.6, 4.4, 2, -2);
    const d = G.game.dragon, D = G.game.world.destructibles;
    const shard = D.list.filter((b) => b.kind === 'shard').sort((a, b) => Math.hypot(a.x - 10.2, a.z - 3.3) - Math.hypot(b.x - 10.2, b.z - 3.3))[0];
    assert(shard.topples && shard.h > 3 && d.weigh('crownFall', MOVES.crownFall, 1, 9) > 0 && d.terrain.fall.piece === shard, `Crown Fall: the hero 2 m from a ${shard.h.toFixed(1)} m shard: his AI may pick it, for that shard`);
    const h0 = G.hits.length;
    const tells = [];
    const w = G.watch;
    G.watch = (n, e) => { w(n, e); if (n === 'combat:tell' && e?.source === 'world') tells.push(G.game.time); };
    const t0 = G.game.time;
    const r = play(G, 'crownFall');
    const hit = G.hits.slice(h0).find((h) => h.attack === 'fallingDebris');
    assert(r.ok && shard.state === STATE.BROKEN && tells.length >= 1 && hit && hit.r === RESULT.HIT && hit.tell === TELL.RED, `he wrenches it down: the world tells it (red) and it lands on a hero who stays, ${(hit ? hit.t - t0 : NaN).toFixed(2)} s after the move began`);
    assert(hit.t - tells[0] > 0.5, `the strip is marked ${(hit.t - tells[0]).toFixed(2)} s before it lands`);
    // far from every tall piece: not his move
    const G2 = stage(2, 0, 2, 0, -5);
    assert(G2.game.dragon.weigh('crownFall', MOVES.crownFall, 1, 7) === 0 && G2.game.dragon.debug.trigger('crownFall') === false, 'with the hero in the open (no tall piece within its own height of him) Crown Fall weighs nothing and does not start');
  }
  // ---- his AI uses them in a fight, and nothing breaks
  {
    const G = stage(3, 0, 5);
    const d = G.game.dragon;
    d.debug.setAI(true);
    const used = {};
    let moves = 0;
    const w = G.watch;
    G.watch = (n, e) => { w(n, e); if (n === 'dragon:windup' && e?.name) { moves++; if (MOVES[e.name]?.terrain) used[e.name] = (used[e.name] || 0) + 1; } };
    run(G, 90, () => { if (Math.hypot(G.game.player.position.x, G.game.player.position.z) > 9) G.game.player.debug.teleport(0, 5); });
    const n = Object.values(used).reduce((a, b) => a + b, 0);
    assert(moves >= 20 && n >= 2 && n <= moves * 0.4, `90 s of form 3 with the AI on: ${moves} moves, ${n} of them on the crater's pieces (${Object.entries(used).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    if (G.payload.size) assert(false, `finite event payloads (${[...G.payload].join(', ')})`);
  }
  // ---- every answer works, standing still does not: a roll at the glint (or as the ring appears),
  // running out of the ring a quarter second after it appears, running one way the whole time
  const rows = terrainAnswers();
  for (const r of rows) out(`     ${r.name}: ` + Object.entries(r).filter(([k]) => k !== 'name').map(([k, v]) => `${k} ${v}`).join(' · '));
  assert(rows.every((r) => r.stand >= 1), 'a hero who stands still is hit by each of them');
  assert(rows.every((r) => Object.entries(r).every(([k, v]) => k === 'name' || k === 'stand' || v === 0)), 'and escapes each of them with any answer: roll, run out of the ring or strip, keep running');
}

/** The terrain moves against heroes who answer them (scenario TERRAIN): hits taken per answer. */
function terrainAnswers() {
  /** answer: 'stand' | 'roll' (at the glint) | 'run' (out of the ring when it appears, after `react` s) |
   *  'line' (running east the whole time) | 'rollRing' (a roll away from the ring when it appears) */
  const trial = (move, form, hx, hz, bx, bz, answer, react = 0.25) => {
    const G = build(SEED, true);
    duel(G, { dist: 8, form });
    const d = G.game.dragon, p = G.game.player, inp = G.input;
    p.debug.god = true;
    d.position.set(bx, 0, bz);
    p.debug.teleport(hx, hz);
    d.yaw = Math.atan2(hx - bx, hz - bz);
    run(G, 0.2);
    const h0 = G.hits.length;
    let ringT = -1, ringX = 0, ringZ = 0, glints = 0, rolled = 0;
    const seenMarks = new Set();
    let wantRoll = false;
    G.watch = (n, e) => {
      if (n === 'combat:flash' && e?.source === 'dragon' && e.hazard && answer === 'roll') { glints++; wantRoll = true; }
    };
    let T0 = G.game.time;
    if (!d.debug.trigger(move)) return { ok: false };
    T0 = G.game.time;
    run(G, 8, () => {
      const t = G.game.time;
      if (wantRoll) {
        // (a roll away from the ring, sideways when he stands at its centre; a tap with no direction is a backstep)
        const m = d.terrain.marks.find((k) => k.alive && k.flashed) ?? { x: p.position.x - 1, z: p.position.z };
        const ex = p.position.x - m.x, ez = p.position.z - m.z, el = Math.hypot(ex, ez);
        inp.axis = el < 0.05 ? { x: 1, y: 0 } : { x: ex / el, y: -ez / el };
        wantRoll = false;
        inp.tap('Space');
        rolled++;
      }
      // a new ring
      for (const m of d.terrain.marks) {
        if (m.alive && !seenMarks.has(m) ) { seenMarks.add(m); m._seenAt = t; ringT = t; ringX = m.x; ringZ = m.z; }
        if (!m.alive) seenMarks.delete(m);
      }
      if (answer === 'line') inp.axis = { x: 1, y: 0 };
      else if ((answer === 'run' || answer === 'rollRing') && ringT >= 0 && t - ringT >= react) {
        const dx = p.position.x - ringX, dz = p.position.z - ringZ, l = Math.hypot(dx, dz);
        const ax = l < 0.05 ? 1 : dx / l, az = l < 0.05 ? 0 : dz / l;
        inp.axis = { x: ax, y: -az };
        if (answer === 'rollRing' && t - ringT < react + 0.02) { inp.tap('Space'); rolled++; }
      }
    }, () => G.game.time - T0 > 1 && d.mode === 'foot' && !d.terrain.busy && !G.game.world.destructibles.active.some((b) => b.state === STATE.FALLING || b.state === STATE.FLYING));
    inp.axis = { x: 0, y: 0 };
    const hits = G.hits.slice(h0).filter((h) => h.attack === move || h.attack === 'fallingDebris');
    return { ok: true, hits: hits.filter((h) => h.r === RESULT.HIT).length, rolled };
  };
  const rows = [];
  for (const [move, form, hx, hz, bx, bz] of [['voidHurl', 1, 0, 4.5, 0, -4], ['voidHurl', 1, 0, 2, 0, -2], ['voidHurl', 1, 4, 8, -2, -6], ['glassRain', 3, 0, 4.5, 0, -4], ['glassRain', 3, 0, 8, 0, -6]]) {
    const r = {};
    for (const a of ['stand', 'roll', 'run', 'rollRing', 'line']) r[a] = trial(move, form, hx, hz, bx, bz, a).hits;
    rows.push({ name: `${move} hero (${hx}, ${hz}) lord (${bx}, ${bz})`, ...r });
  }
  // Crown Fall: stand / run sideways out of the strip when the fall starts
  {
    const r = {};
    for (const a of ['stand', 'roll', 'run']) {
      const G = build(SEED, true);
      duel(G, { dist: 8, form: 2 });
      const d = G.game.dragon, p = G.game.player, inp = G.input;
      p.debug.god = true;
      d.position.set(2, 0, -2);
      p.debug.teleport(8.6, 4.4);
      run(G, 0.2);
      const h0 = G.hits.length;
      let tellT = -1, dirx = 0, dirz = 0;
      G.watch = (n, e) => {
        if (n === 'combat:tell' && e?.source === 'world' && tellT < 0) { tellT = G.game.time; const F = d.terrain; dirx = -F.fall.dz || 1; dirz = F.fall.dx || 0; }
        if (n === 'combat:flash' && e?.source === 'world' && a === 'roll') G._rollNow = true;
      };
      d.debug.trigger('crownFall');
      const T0 = G.game.time;
      let fdx = 0, fdz = 0;
      const F0 = { ...d.terrain.fall };
      run(G, 6, () => {
        if (d.terrain.fall.piece) { fdx = d.terrain.fall.dx; fdz = d.terrain.fall.dz; }
        if (a === 'run' && tellT >= 0 && G.game.time - tellT > 0.25) inp.axis = { x: -F0.dz, y: -F0.dx };
        if (G._rollNow) { G._rollNow = false; inp.axis = { x: -F0.dz, y: -F0.dx }; inp.tap('Space'); }
      }, () => G.game.time - T0 > 1 && d.mode === 'foot' && !G.game.world.destructibles.active.some((b) => b.state === STATE.FALLING));
      inp.axis = { x: 0, y: 0 };
      r[a] = G.hits.slice(h0).filter((h) => h.r === RESULT.HIT).length;
    }
    rows.push({ name: 'crownFall hero beside a 3.6 m shard', ...r });
  }
  return rows;
}

async function scenarioWin() {
  out('\n== scenario WIN (a fencing bot in god mode: parries, rolls, cuts in his openings, gives the deathblows) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 3, ai: true });
  // (env LORD_SKILL=0.8: a probe: the bot answers that share of his tells; only reported)
  const skill = Number(process.env.LORD_SKILL ?? 1);
  G.defend = makeDefender(G, { skill });
  const formAt = [0];
  let blows = 0;
  G.watch = (n, e) => {
    if (n === 'dragon:plunged') blows++;
    if (/^dragon:phase[234]$/.test(n)) formAt.push(game.time);
  };
  const t0 = game.time;
  const won = run(G, 420, () => fencer(G), () => d.mode === 'dead');
  const T = game.time - t0;
  const taken = G.hits.filter((h) => h.r === RESULT.HIT).length;
  const parries = G.hits.filter((h) => h.r === RESULT.PARRIED).length;
  out(`     ${won ? 'won' : 'NOT won'} in ${T.toFixed(0)} s: ${blows} deathblows, ${parries} parries, ${taken} hits taken (god mode), form starts at ${formAt.map((t) => (t - t0 > 0 ? (t - t0).toFixed(0) : '0')).join(' / ')} s; form ${d.phase}, bar ${Math.round(d.hp)}`);
  const dmg = G.hits.filter((h) => h.r === RESULT.HIT).reduce((a, h) => a + (h.damage ?? 0), 0);
  if (skill < 1) {
    out(`     probe (skill ${skill}): ${taken} hits for ${dmg.toFixed(0)} damage in ${T.toFixed(0)} s (the hero has 160 HP and 5 flasks of 70)`);
    return;
  }
  assert(won && blows === 4, `the bot beats all four forms (${blows} deathblows)`);
  assert(T > 55 && T < 300, `the fight takes a bot that answers every tell ${T.toFixed(0)} s`);
}

// ================================================================== scenario: strategy (opt-in)
/** Which defence wins? Three god-mode fencers that differ only in how they answer a tell. Not a
 *  pass / fail check: node lord.mjs . strategy */
async function scenarioStrategy() {
  out('\n== scenario STRATEGY (mixed / parry-only / dodge-only, god mode) ==');
  for (const style of ['mixed', 'parry', 'dodge']) {
    for (const seed of [4242, 7]) {
      const G = build(seed);
      const { game } = G;
      const d = game.dragon;
      duel(G, { dist: 3, ai: true });
      G.defend = makeDefender(G, { style });
      const n = { perfect: 0, parries: 0 };
      G.watch = (ev) => {
        if (ev === 'player:perfectDodge') n.perfect++;
        if (ev === 'player:parry') n.parries++;
      };
      const t0 = game.time;
      const won = run(G, 420, () => fencer(G), () => d.mode === 'dead');
      G.watch = null;
      const taken = G.hits.filter((h) => h.r === RESULT.HIT);
      out(`     ${style.padEnd(5)} seed ${String(seed).padEnd(4)} ${won ? 'WON ' : 'time'} ${(game.time - t0).toFixed(0).padStart(3)} s  form ${d.phase}  hits taken ${String(taken.length).padStart(2)} (${Math.round(taken.reduce((a, h) => a + (h.damage || 0), 0))} dmg)  parries ${String(n.parries).padStart(3)}  perfect dodges ${String(n.perfect).padStart(2)}`);
      G.defend = null;
    }
  }
}

// ================================================================== run
const S = {
  level: scenarioLevel, data: scenarioData, timing: scenarioTiming, forms: scenarioForms, spells: scenarioSpells,
  bounds: scenarioBounds, flow: scenarioFlow, terrain: scenarioTerrain, win: scenarioWin, training: scenarioTraining,
};
const OPT_IN = { strategy: scenarioStrategy }; // run only when named
if (OPT_IN[SCEN]) S[SCEN] = OPT_IN[SCEN];
const list = SCEN === 'all' ? Object.keys(S) : [SCEN];
for (const k of list) {
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nLORD: ${fails} FAILED` : '\nLORD: ALL PASSED');
process.exit(fails ? 1 : 0);
