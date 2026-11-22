// Drownwatch Cliff and the Tide Colossus, headless (COMBAT.md → "The Tide Colossus"; ADR-141 – ADR-143):
// the REAL Player, TideColossus, Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles,
// FireField, CameraRig, Events, Destructibles, Scars) wired like src/main.js for `?level=tide`; the world
// is a light mock on the real Colliders, filled by the real set (world/tideShelf.js). Bots drive the input.
// usage: node tide.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI)
//   scenario: level | data | timing | answers | breath | surge | grip | phases | bounds | frame | budget |
//             flow | win | reward | all   (opt-in: pace, strategy)
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
const { FIRE_PALETTES, FIRE_KIND } = await imp('src/render/firePalettes.js');
const { Colliders } = await imp('src/world/colliders.js');
const { TELL, RESULT, POSTURE, DEFENSE } = await imp('src/combat/rules.js');
const { LEVELS, getLevel, levelFromSearch, applyLevel } = await imp('src/levels/index.js');
const { createTideShelf, SHELF, rimZ } = await imp('src/world/tideShelf.js');
const { Destructibles, STATE } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { TideColossus } = await imp('src/entities/colossus/colossus.js');
const { ATTACKS, TUNING, POSE, BODY } = await imp('src/entities/colossus/tuning.js');
const { buildColossus } = await imp('src/entities/colossus/model.js');
const { setTideLook, TIDE_LOOKS } = await imp('src/entities/colossus/looks.js');
const { TIDE_BREATH } = await imp('src/entities/player/techniques/tideBreath.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

const LVL = getLevel('tide');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 4242);
const DT = 1 / 60;
const LEAD = TUNING.flashLead;

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

/** The game wired like main.js on the real set (its breakables, scars, ambience). */
function build(seed = SEED) {
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
  const set = createTideShelf(U, colliders);
  const counters = { spawns: 0, burns: 0, peakBlobs: 0 };
  const world = {
    colliders, bonfire: { ...CONFIG.world.bonfire }, nest: set.nest, forest: set,
    setGrassQuality() {}, resolve: (pos, r, b) => colliders.resolve(pos, r, b), heroBound: () => CONFIG.world.playerBound,
    setPusher(slot, x, y, z, r) { if (![x, y, z, r].every(Number.isFinite)) throw new Error(`NaN pusher ${slot}`); },
    clearPushers() {}, gust(x, z, s, r) { if (![x, z, s, r].every(Number.isFinite)) throw new Error('NaN gust'); },
    scorch: { burnCircle(x, z, r) { if (![x, z, r].every(Number.isFinite)) throw new Error('NaN scorch'); counters.burns++; }, reset() {}, heatAt: () => 0, burnAt: () => 0 },
    atmosphere: { bonfireLit: true, setBonfireLit(v) { this.bonfireLit = !!v; } },
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
      // (brine, the void slot's kind on this level, stays at least 0.7 m up: fx.js)
      if ((o.kind === 'void' || o.kind === FIRE_KIND.void) && (o.y ?? 0) < 0.69) counters.lowBlobs = (counters.lowBlobs ?? 0) + 1;
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
  world.scars = new Scars(game, set.scarInk);
  world.destructibles = new Destructibles(game, world, set);
  world.impact = (x, z, r, power, o) => world.destructibles.strike(x, z, r, power, { kind: 'blunt', by: 'world', ...(o ?? {}) });
  world.restore = () => { world.destructibles.reset(); world.scars.reset(); };
  world.update = (dt) => { world.destructibles.update(dt); world.scars.update?.(dt); set.ambience.update(dt, game); };
  set.ambience.setup(game);
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  // (the boss is built on a stream of its own: every THREE object draws Math.random for its uuid)
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
    game.fxDt = dt;
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
    counters.peakBlobs = Math.max(counters.peakBlobs, game.fx.fire.count);
    game.hud.update(realDt);
    game.audio.update(realDt);
    game.input.endFrame();
    const p = game.player, d = game.dragon;
    if (![p.position.x, p.position.z, p.hp, p.yaw].every(Number.isFinite)) throw new Error('player NaN');
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.posture, d.maxPosture, d.object3d.position.x, d.object3d.position.y, d.object3d.position.z].every(Number.isFinite)) throw new Error('colossus NaN');
    for (const h of d.hurtSpheres) if (![h.x, h.y, h.z, h.r].every(Number.isFinite)) throw new Error('hurtSphere NaN');
    for (const h of d.frameSpheres) if (![h.x, h.y, h.z, h.r].every(Number.isFinite)) throw new Error('frameSphere NaN');
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

/** Title → the fight (the Lab's flow jump), the AI as asked, the hero at (x, z) facing north. */
function fight(G, { x = 0, z = -2, ai = false } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
  run(G, 0.4);
  place(G, x, z);
  run(G, 0.6);
}

/** The hero at (x, z), facing north (toward the creature), healed. */
function place(G, x, z, yaw = Math.PI) {
  const { game } = G;
  const p = game.player;
  p.debug.teleport(x, z);
  p.yaw = yaw;
  p.debug.heal();
  game.mouseGround.set(x, 0, z - 4);
}

// ---- the defender bot: answers the cues from the flash (parry normal / blue, roll through red / black)
function makeDefender(G, { skill = 1, early = 0.12, style = 'mixed', rng = null } = {}) {
  const pend = [];
  const stats = { flashes: 0, parryTry: 0, dodgeTry: 0 };
  return {
    stats,
    onEvent(n, d) {
      if (n === 'combat:flash' && d?.source === 'dragon') {
        stats.flashes++;
        if (skill < 1 && (rng ?? Math.random)() > skill) return;
        pend.push({ tell: d.tell, at: G.game.time + LEAD, x: d.x, z: d.z, hazard: !!d.hazard, attack: d.attack, done: false });
      }
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.4) pend.splice(i, 1);
      for (const e of pend) {
        const left = e.at - t - DT;
        const dodge = e.tell === TELL.RED || e.tell === TELL.BLACK || style === 'dodge' || e.attack === 'breath';
        if (dodge) {
          if (left <= (style === 'parry' ? 0.3 : 0.1)) {
            e.done = true;
            // roll south, away from the creature (and across a sweep's or the breath's line)
            input.axis = e.attack === 'sweep' || e.attack === 'crossSweep' ? { x: 0, y: -1 } : { x: 0.7, y: -0.7 };
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
    dueWithin(s) {
      const t = G.game.time;
      return pend.some((e) => !e.done && e.at - t < s);
    },
  };
}

/** Fight: stay on the shelf near the nearer hand, answer every cue, cut the hands and the head. */
function fighter(G, { god = true } = {}) {
  const { game, input } = G;
  const p = game.player, d = game.dragon;
  input.axis = { x: 0, y: 0 };
  if (!p.alive || game.state !== 'boss') return;
  if (god) p.hp = p.maxHp;
  const tgt = new THREE.Vector3();
  d.lockPoint(tgt);
  // a cutting spot just south of the target, never past the rim
  const gx = tgt.x, gz = Math.max(tgt.z + 1.2, rimZ(tgt.x) + 1.0);
  game.mouseGround.set(tgt.x, 0, tgt.z);
  const dx = gx - p.position.x, dz = gz - p.position.z, dist = Math.hypot(dx, dz);
  const busy = G.defend.act();
  if (dist > 1.6 && !busy) input.axis = { x: dx / dist, y: -dz / dist };
  const tick = (game.realTime * 60) | 0;
  if (d.broken && Math.hypot(tgt.x - p.position.x, tgt.z - p.position.z) < 8 && tick % 10 === 0) input.click(0);
  else if (!busy && dist < 2.4 && tick % 18 === 0) input.click(0);
}

// ================================================================== scenario: level
async function scenarioLevel() {
  out('\n== scenario LEVEL (the level, the set, the shelf\'s limits) ==');
  assert(getLevel('tide') === LVL && ['colossus', 'cliff', 'shore', 'sea', 'drownwatch'].every((a) => getLevel(a) === LVL), '?level=tide and its aliases resolve');
  assert(levelFromSearch('?level=tide') === LVL && LEVELS.includes(LVL), 'levelFromSearch finds it; it is in LEVELS (the title screen and the Lab list it)');
  const G = build();
  const { game, set } = G;
  const D = game.world.destructibles, kinds = {};
  for (const b of set.breakables) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
  out(`     breakables ${set.breakables.length}: ${JSON.stringify(kinds)}`);
  assert(set.breakables.length >= 80 && set.breakables.length <= 140, `about 100 breakables (${set.breakables.length})`);
  assert(kinds.menhir === 12 && kinds.towerTop === 1 && kinds.tower === 1 && kinds.stack === 2 && kinds.stackTop === 2 && kinds.hullRib === 10 && kinds.keel === 1, 'the menhirs, the tower\'s two stages, the stacks\' two stages, the hull\'s ribs and keel');
  const bones = D.batch?.bones ?? 0;
  out(`     the breakables\' rigid batch: ${bones} bones (with the wreckage pools; the crater's is 299)`);
  assert(bones > 0 && bones <= 300, `the breakables' rigid batch inside the arenas' (${bones} <= 300; their own bones: scenario budget)`);
  assert(set.groundGeometry?.isBufferGeometry, 'the set gives the ground plane its own shape (it ends at the rim)');
  // the hero walked north for 10 s never passes the rim
  fight(G, { x: 0, z: -2 });
  game.dragon.debug.setAI(false);
  let north = Infinity;
  for (const x of [-20, -9, 0, 6, 14, 24]) {
    place(G, x, 0);
    run(G, 10 / 6, () => { G.input.axis = { x: 0, y: 1 }; game.player.hp = game.player.maxHp; });
    north = Math.min(north, game.player.position.z - rimZ(game.player.position.x));
  }
  assert(north > -0.05, `walked north, the hero never passes the rim (nearest ${north.toFixed(2)} m from it)`);
  const W = CONFIG.world;
  const onGround = (x, z) => z > rimZ(x) + 1 && Math.hypot(x, z) < W.playerBound;
  assert(onGround(W.playerSpawn.x, W.playerSpawn.z) && onGround(W.bonfire.x, W.bonfire.z), 'the spawn and the bonfire stand on the ground');
  assert(Math.abs(game.dragon.position.z - SHELF.edgeZ) < 1e-6 && game.dragon.position.x === 0, 'the boss slot\'s position is the rim\'s centre');
  // the sea colliders do not reach the minimap or the meadow as stones
  assert(game.world.colliders.circles.filter((c) => c.tag === 'sea').length === 5, 'five sea circles, tagged sea');
}

// ================================================================== scenario: smoke
async function scenarioSmoke() {
  out('\n== scenario SMOKE (60 s of the AI against a fighting bot) ==');
  const G = build();
  const { game } = G;
  fight(G, { x: 4, z: -3, ai: true });
  G.defend = makeDefender(G);
  const seen = {};
  G.watch = (n, d) => { if (n === 'combat:tell') seen[d.attack] = (seen[d.attack] ?? 0) + 1; };
  run(G, 60, () => fighter(G));
  out(`     moves: ${JSON.stringify(seen)}; hp ${game.dragon.hp}; phase ${game.dragon.phase}; hits ${G.hits.length}`);
  assert(Object.keys(seen).length >= 3, 'the AI uses several moves');
}

// ================================================================== scenario: data
async function scenarioData() {
  out('\n== scenario DATA (every hit declares its tell; fairness in the numbers) ==');
  const WK = { slam: 'slam', hammer: 'hammer', sweep: 'sweep', crossSweep: 'sweep', flick: 'flick', breath: 'breath', breaker: 'clap', surge: 'surge', blackFathom: 'blackFathom', grasp: 'grasp' };
  let black = 0;
  for (const [name, d] of Object.entries(ATTACKS)) {
    if (name === 'bellow') continue;
    const hits = d.hits ?? [{ tell: d.tell, windup: d.windup, flare: d.flare }];
    assert(hits.every((h) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(h.tell)), `${name}: every hit declares a tell (${hits.map((h) => h.tell).join(', ')})`);
    const first = hits[0].windup ?? d.windup;
    assert(first >= TUNING.fair.minWindup, `${name}: its first windup is at least ${TUNING.fair.minWindup} s in phase 1 (${first})`);
    if (d.hits && name === 'breaker') {
      const gaps = d.hits.slice(1).map((h) => h.windup * TUNING.phaseTimeScale[2]);
      assert(gaps.every((g) => g >= TUNING.fair.stringGap - 1e-9), `${name}: impacts in the string at least ${TUNING.fair.stringGap} s apart in phase 3 (${gaps.map((g) => g.toFixed(2)).join(', ')})`);
    }
    if (name === 'crossSweep') assert(d.ret * TUNING.phaseTimeScale[2] >= TUNING.fair.stringGap, `crossSweep: the return at least ${TUNING.fair.stringGap} s after the first front starts`);
    for (const h of hits) {
      if (h.tell === TELL.RED || h.tell === TELL.BLACK) assert(d.parryable !== true && d.blockable !== true, `${name}: a ${h.tell} hit is neither parryable nor blockable`);
      if (h.tell === TELL.BLACK) black++;
    }
    assert(typeof d.label === 'string' && d.label.length > 2, `${name}: a label ("${d.label}")`);
    const pw = name === 'breath' ? TUNING.world.breath.ground : TUNING.world[WK[name]];
    assert(Number.isFinite(pw) && pw > 0, `${name}: a TUNING.world power (${WK[name]} ${pw})`);
  }
  assert(black === 1, `exactly one black blow (${black})`);
  assert(ATTACKS.breath.parryable === false && ATTACKS.breath.blockable === false, 'the breath: not parryable, not blockable');
  assert(TUNING.world.ignite.breath === 0, 'brine does not set alight (TUNING.world.ignite.breath 0)');
  assert(POSE.lift <= 3.5 && POSE.near <= 6, `the phone rule as data: lift ${POSE.lift} m, near ${POSE.near} m`);
}

// ================================================================== scenario: timing
/** Where the hero must stand for a move to reach him (standing still). */
const SPOT = { slam: [6, -3], hammer: [6, -3], grasp: [-6, -3], blackFathom: [6, -3], sweep: [8, -4], crossSweep: [4, -4], flick: [9.2, -5.5], breaker: [2, -3], breath: [8, -1], surge: [3, 0] };
async function scenarioTiming() {
  out('\n== scenario TIMING (the tell at the windup\'s start, the contact flashLead after the flash) ==');
  for (const name of (process.env.TIDE_ONLY ? [process.env.TIDE_ONLY] : Object.keys(SPOT))) {
    const G = build();
    const { game } = G;
    fight(G, { x: SPOT[name][0], z: SPOT[name][1] });
    const d = game.dragon, p = game.player;
    const [x, z] = SPOT[name];
    // (timing only: no piece of cover may stand between the blow and him; `breath` checks cover)
    for (const q of game.world.destructibles.list) q.cover = false;
    const ev = [];
    G.watch = (n, e) => { if ((n === 'combat:tell' || n === 'combat:flash') && e.attack === name) ev.push({ n, t: game.time }); };
    G.hits.length = 0;
    const t0 = game.time;
    d.debug.trigger(name);
    run(G, 7, () => { p.position.x = x; p.position.z = z; p.hp = p.maxHp; p.yaw = Math.PI; }, () => !d.act && game.time - t0 > 0.5);
    const tells = ev.filter((e) => e.n === 'combat:tell'), flashes = ev.filter((e) => e.n === 'combat:flash');
    const contacts = G.hits.filter((h) => h.attack === name && h.r !== RESULT.IGNORED);
    assert(tells.length >= 1 && tells[0].t - t0 <= 2 * DT, `${name}: combat:tell at the windup's start (+${((tells[0]?.t ?? 99) - t0).toFixed(3)} s)`);
    const pairs = Math.min(flashes.length, contacts.length);
    let worst = 0;
    for (let k = 0; k < pairs; k++) worst = Math.max(worst, Math.abs(contacts[k].t - (flashes[k].t + LEAD)));
    assert(pairs >= 1 && worst <= 0.085, `${name}: ${pairs} contact(s) within ±85 ms of flash + ${LEAD} s (worst ${(worst * 1000).toFixed(0)} ms; ${flashes.length} flashes, ${contacts.length} contacts)`);
  }
}

// ================================================================== scenario: answers
/** Trigger `name` with the hero at (x, z) and answer its first cue with `how` ('parry' | 'block' | 'roll' | 'stand'). */
function answer(G, name, x, z, how, { secs = 5 } = {}) {
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  place(G, x, z);
  run(G, 0.3);
  let flashAt = -1, pressed = false;
  const W = G.watch;
  G.watch = (n, e) => { W?.(n, e); if (n === 'combat:flash' && e.attack === name && flashAt < 0) flashAt = game.time; };
  G.hits.length = 0;
  d.debug.trigger(name);
  if (how === 'block') input.press(1);
  run(G, secs, () => {
    if (how !== 'roll' && !pressed) { p.position.x = x; p.position.z = z; p.yaw = Math.PI; }
    if (flashAt < 0 || pressed) return;
    const left = flashAt + LEAD - game.time;
    if (how === 'parry' && left <= 0.12) { pressed = true; input.up(1); input.click(1); }
    if (how === 'roll' && left <= 0.1) { pressed = true; input.axis = { x: 1, y: -0.3 }; input.tap('Space'); }
  }, () => !d.act && game.time > 1);
  input.up(1);
  input.axis = { x: 0, y: 0 };
  G.watch = W;
  return G.hits.filter((h) => h.attack === name);
}

async function scenarioAnswers() {
  out('\n== scenario ANSWERS (parry, block, red on a guard, the perfect dodge, Black Fathom, the deflect chain) ==');
  {
    const G = build();
    fight(G, { x: 8, z: -4 });
    const d = G.game.dragon;
    let counter = 0, parried = null;
    G.watch = (n, e) => { if (n === 'player:flurry') counter++; if (n === 'dragon:parried') parried = e; };
    const post0 = d.posture;
    const r = answer(G, 'hammer', 8, -4, 'parry');
    assert(r[0]?.r === RESULT.PARRIED, `a parried knuckle hammer (${r[0]?.r})`);
    assert(d.posture > post0 && parried?.last === true && parried?.flare === true, `it costs posture (${post0.toFixed(0)} -> ${d.posture.toFixed(0)}) and is a parry moment that ends the move`);
    const head = new THREE.Vector3();
    d.plungePoint(head);
    const reach = Math.hypot(head.x - 8, head.z + 4);
    out(`     the head ${reach.toFixed(1)} m from the hero (the riposte's range ${DEFENSE.flurry.riposteRange.air} m): counter ${counter ? 'came' : 'did not come'}`);
    assert(reach > DEFENSE.flurry.riposteRange.air || counter > 0, 'within the riposte\'s range of the head, the counter follows the parry');
  }
  {
    const G = build();
    fight(G, { x: 6, z: -3 });
    const p = G.game.player, g0 = p.guard;
    const r = answer(G, 'hammer', 6, -3, 'block');
    assert(r[0]?.r === RESULT.BLOCKED && p.guard < g0 && p.hp === p.maxHp, `a blocked hammer costs guard, not health (${r[0]?.r}, guard ${g0} -> ${Math.round(p.guard)})`);
  }
  {
    const G = build();
    fight(G, { x: 6, z: -3 });
    const p = G.game.player;
    const r = answer(G, 'slam', 6, -3, 'block');
    assert(r[0]?.r === RESULT.HIT && p.hp < p.maxHp, `a red palm slam on a guard: the guard fails (${r[0]?.r})`);
  }
  {
    const G = build();
    fight(G, { x: 6, z: -3 });
    const { game } = G;
    const p = game.player;
    let plunge = false;
    G.watch = (n) => { if (n === 'player:perfectDodge' || n === 'player:plunge' || n === 'player:flurry') plunge = true; };
    const r = answer(G, 'slam', 6, -3, 'roll', { secs: 6 });
    run(G, 3);
    const off = p.position.z - rimZ(p.position.x);
    assert(r[0]?.r === RESULT.PERFECT && plunge, `a perfect dodge of the slam: the plunge / flurry (${r[0]?.r})`);
    assert(off > 0 && Math.hypot(p.position.x, p.position.z) < CONFIG.world.playerBound && !['plunge', 'flurry'].includes(p.state), `... and it ends with the hero on the shelf (${off.toFixed(1)} m from the rim, ${p.state})`);
  }
  {
    const G = build();
    fight(G, { x: 6, z: -3 });
    const p = G.game.player;
    let open = null;
    G.watch = (n, e) => { if (n === 'player:guardOpen') open = { black: !!e?.black, guard: p.guard }; };
    const r = answer(G, 'blackFathom', 6, -3, 'block', { secs: 6 });
    assert(r[0]?.r === RESULT.BLOCKED && p.hp === p.maxHp && open?.black && open.guard < 5, `Black Fathom on a guard: the guard emptied, no damage (${r[0]?.r}, guard ${Math.round(open?.guard ?? -1)} at the blow, hp ${p.hp})`);
  }
  {
    const G = build();
    fight(G, { x: 2, z: -3 });
    const { game, input } = G;
    const d = game.dragon, p = game.player;
    let chain = 0;
    const flashes = [];
    G.watch = (n, e) => { if (n === 'combat:deflectChain') chain = Math.max(chain, e.count); if (n === 'combat:flash' && e.attack === 'breaker') flashes.push(game.time + LEAD); };
    G.hits.length = 0;
    d.debug.trigger('breaker');
    run(G, 4, () => {
      p.position.x = 2; p.position.z = -3; p.yaw = Math.PI; p.hp = p.maxHp;
      for (let k = flashes.length - 1; k >= 0; k--) if (flashes[k] - game.time <= 0.12) { flashes.splice(k, 1); input.up(1); input.click(1); }
    }, () => !d.act && game.time > 1);
    const res = G.hits.filter((h) => h.attack === 'breaker').map((h) => h.r);
    assert(res.filter((r) => r === RESULT.PARRIED).length >= 2 && chain >= 2, `the breaker parried blow for blow: the deflect chain (${res.join(', ')}; chain ${chain})`);
  }
}

/** No piece of cover stands anywhere (a check of the blow itself, in the open). */
const bare = (G) => { for (const q of G.game.world.destructibles.list) q.cover = false; };

// ================================================================== scenario: breath
async function scenarioBreath() {
  out('\n== scenario BREATH (cover, one blow a pass, a roll through it, the spent head) ==');
  {
    const G = build();
    fight(G, { x: 0.2, z: -2.2 });
    const D = G.game.world.destructibles;
    const m = D.list.find((q) => q.kind === 'menhir' && Math.abs(q.x - 0.2) < 0.5);
    const hp0 = m?.hp;
    const r = answer(G, 'breath', m.x, m.z + 2.0, 'stand', { secs: 8 });
    assert(!r.some((h) => h.r === RESULT.HIT), `behind a standing menhir the hero is not struck (${r.map((h) => h.r).join(', ') || 'no contact'})`);
    assert(m && m.hp < hp0, `... and the menhir loses structure (${hp0?.toFixed(2)} -> ${m?.hp?.toFixed(2)})`);
  }
  {
    const G = build();
    fight(G, { x: 8, z: -1 });
    const d = G.game.dragon, p = G.game.player;
    bare(G);
    let spent = null;
    const W = G.watch;
    G.watch = (n) => {
      if (n !== 'dragon:breathEnd') return;
      spent = { down: d.headDownT, head: false };
    };
    const r = answer(G, 'breath', 8, -1, 'stand', { secs: 8 });
    G.watch = W;
    assert(r.filter((h) => h.r === RESULT.HIT).length === 1, `in the open he is struck once a pass (${r.map((h) => h.r).join(', ')})`);
    assert(spent && spent.down >= ATTACKS.breath.spent[0] - 0.1, `afterwards the head lies on the rim, spent, ${spent?.down?.toFixed(2)} s`);
    // ... and takes damage there: again, cut it while it lies
    d.debug.trigger('breath');
    run(G, 8, () => { p.position.x = 30; p.position.z = 5; }, () => d.act?.phase === 'recover');
    run(G, 0.4);
    const hasHead = d.hurtSpheres.some((h) => h.part === 'head');
    const hp0 = d.hp;
    d.takeHit({ damage: 40, part: 'head', point: d.rig.pt.head });
    assert(hasHead && d.hp < hp0, `... and it can be cut there (${hp0} -> ${d.hp}, x${TUNING.partMult.head})`);
  }
  {
    const G = build();
    fight(G, { x: 8, z: -1 });
    bare(G);
    const r = answer(G, 'breath', 8, -1, 'roll', { secs: 8 });
    assert(r.length >= 1 && r.every((h) => h.r === RESULT.DODGED || h.r === RESULT.PERFECT), `a roll through it dodges (${r.map((h) => h.r).join(', ')})`);
  }
  {
    // phase 2: there and back, a cue each
    const G = build();
    fight(G, { x: 8, z: -1 });
    bare(G);
    G.game.dragon.enterPhase(2);
    let fl = 0;
    G.watch = (n, e) => { if (n === 'combat:flash' && e.attack === 'breath') fl++; };
    const r = answer(G, 'breath', 8, -1, 'stand', { secs: 9 });
    assert(fl === 2 && r.filter((h) => h.r === RESULT.HIT).length === 2, `phase 2: two passes, a cue and a blow each (${fl} cues, ${r.length} contacts)`);
  }
  {
    // phase 3: each pass leaves its line glowing; contact ticks, never while rolling
    const G = build();
    fight(G, { x: 8, z: -1 });
    const d = G.game.dragon;
    d.enterPhase(3);
    answer(G, 'breath', 14, 4, 'stand', { secs: 7 });
    const lines = d.hazards.lines.filter((L) => L.on && L.n > 2);
    assert(lines.length >= 1, `phase 3: the passes leave their lines (${lines.length})`);
    if (lines[0]) {
      const L = lines[0], k = Math.floor(L.n / 2);
      G.hits.length = 0;
      place(G, L.pts[k * 2], L.pts[k * 2 + 1]);
      run(G, 1.0, () => { G.game.player.position.x = L.pts[k * 2]; G.game.player.position.z = L.pts[k * 2 + 1]; });
      const ticks = G.hits.filter((h) => h.kind === 'brine' && h.damage === ATTACKS.breath.tickDamage);
      assert(ticks.length >= 2 && ticks.length <= 4, `standing on a line: contact ticks every ${ATTACKS.breath.tick} s (${ticks.length} in 1 s)`);
    }
  }
}

// ================================================================== scenario: surge
async function scenarioSurge() {
  out('\n== scenario SURGE (the ground mark first; one blow; a pocket behind cover) ==');
  {
    const G = build();
    fight(G, { x: 3, z: 1 });
    const d = G.game.dragon;
    let wet = 0, frontAt = -1;
    const w0 = d.fx.wetSpeck.bind(d.fx);
    d.fx.wetSpeck = (...a) => { if (frontAt < 0) wet++; return w0(...a); };
    const W = d.hazards.startSurge.bind(d.hazards);
    d.hazards.startSurge = (...a) => { frontAt = G.game.time; return W(...a); };
    const r = answer(G, 'surge', 3, 1, 'stand', { secs: 5 });
    assert(wet > 10 && frontAt > 0, `the stone wets before the front leaves the rim (${wet} specks)`);
    assert(r.filter((h) => h.r === RESULT.HIT).length === 1, `one blow (${r.map((h) => h.r).join(', ')})`);
  }
  {
    const G = build();
    fight(G, { x: 8.8, z: -2.2 });
    const D = G.game.world.destructibles;
    const m = D.list.find((q) => q.kind === 'menhir' && Math.abs(q.x - 8.8) < 0.5);
    const r = answer(G, 'surge', m.x, m.z + 1.8, 'stand', { secs: 5 });
    assert(!r.some((h) => h.r === RESULT.HIT), `a pocket behind a standing menhir (${r.map((h) => h.r).join(', ') || 'no contact'})`);
    const racks = D.list.filter((q) => q.kind === 'rack');
    out(`     racks standing after it: ${racks.filter((q) => q.state === STATE.INTACT).length} of ${racks.length}`);
  }
}

// ================================================================== scenario: grip
async function scenarioGrip() {
  out('\n== scenario GRIP (a hand that takes TUNING.grip.hp inside its window lets go; the head drops) ==');
  const G = build();
  fight(G, { x: 9, z: -5 });
  const d = G.game.dragon;
  run(G, 0.5);
  const tips = d.rig.pt.tips[1];
  let n = 0;
  while (d.hands[1].reelT <= 0 && n < 40) {
    d.takeHit({ damage: 60, part: 'finger', point: { x: tips[1].x, y: tips[1].y, z: tips[1].z } });
    run(G, 0.1);
    n++;
  }
  const dealt = n * Math.round(60 * TUNING.partMult.finger);
  assert(d.hands[1].reelT > 0 && Math.abs(dealt - TUNING.grip.hp) <= 40, `the right hand let go after ${dealt} damage on its fingers (${TUNING.grip.hp})`);
  run(G, 0.6);
  assert(d.headDownT > 0 && d.hurtSpheres.some((h) => h.part === 'head'), 'the head drops onto the rim (it can be cut)');
  assert(d.hands[1].mode === 'reel', 'the hand is pulled back off the cliff');
}

// ================================================================== scenario: phases
async function scenarioPhases() {
  out('\n== scenario PHASES (the gates with the AI on; the phase events; the break and the execution) ==');
  const G = build();
  const { game, input } = G;
  fight(G, { x: 6, z: 2, ai: true });
  const d = game.dragon, p = game.player;
  const ph = [];
  G.watch = (n) => { if (/^dragon:phase[23]$/.test(n)) ph.push(n); };
  // one huge blow at full health: the gate holds it at 66 %
  d.takeHit({ damage: 99999, exact: true, part: 'hand' });
  assert(Math.abs(d.hp - d.maxHp * 0.66) < 2, `the phase gate holds at 66 % (${d.hp})`);
  run(G, 4, () => { p.hp = p.maxHp; });
  assert(d.phase === 2 && ph.includes('dragon:phase2'), `phase 2 begins (${d.phase}; ${ph.join(', ')})`);
  d.takeHit({ damage: 99999, exact: true, part: 'hand' });
  assert(Math.abs(d.hp - d.maxHp * 0.33) < 2, `... and at 33 % (${d.hp})`);
  run(G, 4, () => { p.hp = p.maxHp; });
  assert(d.phase === 3 && ph.includes('dragon:phase3'), `phase 3 begins (${d.phase})`);
  // the break and the execution
  d.debug.setAI(false);
  run(G, 2, () => { p.hp = p.maxHp; });
  let exec = false, broke = false;
  G.watch = (n, e) => { if (n === 'dragon:plunged' && e?.execution) exec = true; if (n === 'dragon:postureBreak') broke = true; };
  d.debug.postureBreak();
  run(G, 0.6);
  const head = new THREE.Vector3();
  d.plungePoint(head);
  place(G, head.x, rimZ(head.x) + 3.5);
  const hp0 = d.hp;
  run(G, 3, () => { if (((game.realTime * 60) | 0) % 10 === 0 && d.broken) input.click(0); });
  assert(broke && exec && d.hp < hp0, `a posture break offers the execution on the head (${broke}, ${exec}, ${hp0} -> ${d.hp})`);
  run(G, 4);
  assert(p.position.z > rimZ(p.position.x) - 0.05, 'the execution ends with the hero on the shelf');
}

// ================================================================== scenario: bounds
async function scenarioBounds() {
  out('\n== scenario BOUNDS (120 s of the AI against a wandering hero: the limits, fairness, the pace) ==');
  const G = build(SEED + 7);
  const { game, input } = G;
  fight(G, { x: 2, z: 0, ai: true });
  const d = game.dragon, p = game.player;
  G.defend = makeDefender(G, { skill: 0.7, rng: mulberry32(99) });
  const wr = mulberry32(5);
  let goal = { x: 0, z: 0 }, north = Infinity, offShelf = 0, planted = 0;
  const cues = { 1: 0, 2: 0, 3: 0 }, secs = { 1: 0, 2: 0, 3: 0 };
  // (each phase's steady pace: its first 8 s, the bellow and the move it opens with, are not counted)
  let since = 0;
  G.watch = (n, e) => { if (n === 'combat:flash' && e.source === 'dragon' && since > 8) cues[d.phase]++; if (/^dragon:phase[23]$/.test(n)) since = 0; };
  const t0 = game.time;
  run(G, 120, () => {
    const t = game.time - t0;
    if (t > 40 && d.phase === 1) d.debug.phase2();
    if (t > 80 && d.phase === 2) d.debug.phase3();
    since += DT;
    if (since > 8) secs[d.phase] += DT;
    p.hp = p.maxHp;
    if (Math.hypot(goal.x - p.position.x, goal.z - p.position.z) < 1 || wr() < 0.004) goal = { x: (wr() - 0.5) * 50, z: rimZ(0) + 1 + wr() * 13 };
    const busy = G.defend.act();
    if (!busy) {
      const dx = goal.x - p.position.x, dz = goal.z - p.position.z, l = Math.hypot(dx, dz) || 1;
      input.axis = { x: dx / l, y: -dz / l };
    }
    // (on the ground: the plunge and the flurry ride the head out over the water and come back)
    if (!['plunge', 'flurry'].includes(p.state) && p.position.y < 0.05) north = Math.min(north, p.position.z - rimZ(p.position.x));
    for (const h of d.hands) {
      if (h.mode !== 'planted') continue;
      planted++;
      const P = d.rig.pt.palm[h.i];
      if (P.z < rimZ(P.x) + 0.3 || P.z > SHELF.scarpZ + 1 || Math.abs(P.x) > SHELF.half + 2) offShelf++;
    }
  });
  assert(north > -0.05, `the hero never passes the rim (nearest ${north.toFixed(2)} m)`);
  assert(offShelf === 0, `no hand planted off the shelf (${offShelf} of ${planted} planted frames)`);
  // two cues that need different answers never within TUNING.fair.apart
  const T = d.stats.cueTimes;
  let clash = 0;
  for (let i = 2; i < T.length; i += 2) if (T[i] - T[i - 2] < TUNING.fair.apart && T[i + 1] !== T[i - 1]) clash++;
  assert(clash === 0, `no two cues that need different answers within ${TUNING.fair.apart} s (${clash})`);
  const pm = [1, 2, 3].map((k) => (cues[k] / Math.max(1, secs[k])) * 60);
  out(`     cues a minute by phase: ${pm.map((v) => v.toFixed(0)).join(' / ')}`);
  // (40 s a phase against a wandering bot is noisy: phase 3 measured 19 - 25 against phase 2's 17 - 24 over three seeds)
  assert(pm[1] >= pm[0] && pm[2] >= pm[0] && pm[2] >= pm[1] * 0.75, 'cues a minute rise from phase 1; phase 3 at least three quarters of phase 2');
  assert(!G.payload.size, `no non-finite number in an event's payload ${JSON.stringify([...G.payload])}`);
}

// ================================================================== scenario: frame
/** The camera as main.js drives it (the flow's boss framing, its zoom, keep()), at w x h. */
function camSetup(G, w, h) {
  const { game } = G, cam = game.camera, rig = game.cameraRig;
  cam.aspect = w / h;
  cam.fov = fovFor(cam.aspect);
  cam.updateProjectionMatrix();
  const phone = Math.min(w, h) <= CONFIG.camera.mobileMaxSide;
  rig.setMobile(phone, h > w);
  const focus = new THREE.Vector3();
  G.tickCam = (dt) => {
    const p = game.player.position;
    focus.copy(p);
    let zoom = 0;
    const o = game.flow.cameraOverride;
    if (o) { focus.lerp(o.focus, o.weight); zoom = Math.max(zoom, o.zoom ?? 0); }
    rig.extraZoom += (zoom - rig.extraZoom) * (1 - Math.exp(-2.5 * dt));
    rig.update(dt, focus);
  };
}
const { fovFor } = await imp('src/core/cameraRig.js');

async function scenarioFrame() {
  out('\n== scenario FRAME (at every cue of the body the striking part is on screen: 1280x720, 852x393, 393x852) ==');
  const SIZES = [[1280, 720], [852, 393], [393, 852]];
  const SPOTS = [[0, -3], [-12, -4], [12, 0], [-6, 3], [8, 4]];
  const MOVES = ['slam', 'hammer', 'sweep', 'breath', 'blackFathom', 'grasp', 'breaker'];
  for (const [w, h] of SIZES) {
    let bad = 0, n = 0;
    const misses = [];
    for (const [x, z] of SPOTS) {
      const G = build();
      camSetup(G, w, h);
      const { game } = G;
      fight(G, { x, z });
      const d = game.dragon, p = game.player, v = new THREE.Vector3();
      game.flow.cameraOverride = game.flow._ov;
      G.watch = (n2, e) => {
        if (n2 !== 'combat:flash' || e.source !== 'dragon' || e.hazard) return;
        n++;
        v.set(e.x, e.y, e.z).project(game.camera);
        const ok = Math.abs(v.x) <= 1.0 && Math.abs(v.y) <= 1.0;
        if (!ok) { bad++; misses.push(`${e.attack}@${x},${z}:(${v.x.toFixed(2)},${v.y.toFixed(2)})`); }
      };
      for (const m of MOVES) {
        d.debug.trigger(m);
        run(G, 6, (g) => { g.tickCam(DT); p.position.x = x; p.position.z = z; p.hp = p.maxHp; }, () => !d.act);
        run(G, 0.5, (g) => g.tickCam(DT));
      }
    }
    assert(n > 20 && bad === 0, `${w}x${h}: ${n - bad} of ${n} cues with the striking part on screen ${misses.slice(0, 6).join(' ')}`);
  }
}

// ================================================================== scenario: budget
async function scenarioBudget() {
  out('\n== scenario BUDGET (triangles, bones, draws, peak blobs) ==');
  const U = createSharedUniforms();
  const M = buildColossus(U);
  let tris = 0, meshes = 0;
  const mats = new Set();
  M.root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    mats.add(o.material);
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  out(`     the colossus: ${Math.round(tris)} triangles, ${meshes} meshes (bones of its rigid batch), ${mats.size} materials (draws) + 1 shadow`);
  assert(tris <= 110000, `at most 110 k triangles (${Math.round(tris)})`);
  assert(meshes <= 160, `at most 160 bones (${meshes})`);
  assert(mats.size <= 12, `at most 12 world draws (${mats.size})`);
  for (const k of TIDE_LOOKS) {
    setTideLook(k);
    const L = buildColossus(createSharedUniforms());
    let t = 0, m = 0;
    L.root.traverse((o) => { if (o.isMesh) { m++; t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    out(`     look ${k}: ${Math.round(t)} triangles, ${m} meshes`);
    assert(t <= 110000 && m <= 160, `look ${k} inside the budget`);
  }
  setTideLook('b');
  // the sea
  const G = build();
  const sea = G.set.seaMesh.geometry;
  const seaTris = sea.attributes.position.count / 3;
  assert(seaTris <= 800, `the sea: at most 800 triangles (${seaTris})`);
  // the breakables' own bones (the wreckage pools every set builds come on top)
  const D = G.game.world.destructibles;
  // (a set of one chain only: the pools every set builds; its own one or two bones counted with them)
  const one = G.set.breakables.filter((b) => b.kind === 'chain').slice(0, 1);
  const base = new Destructibles(G.game, { colliders: new Colliders(), scorch: G.game.world.scorch, scars: G.game.world.scars }, { ...G.set, breakables: one });
  const own = (D.batch?.bones ?? 0) - (base.batch?.bones ?? 0) + 1;
  out(`     breakables: ${own} bones of their own (+ ${(base.batch?.bones ?? 0) - 1} of the wreckage pools every set builds)`);
  assert(own <= 200, `the breakables: at most 200 bones (${own})`);
  // the fire field's peak in phase 3 (breath + lingering lines + surge)
  fight(G, { x: 6, z: 0 });
  const d = G.game.dragon;
  d.enterPhase(3);
  G.counters.peakBlobs = 0;
  for (const m of ['breath', 'surge', 'breath']) {
    d.debug.trigger(m);
    run(G, 7, () => { G.game.player.hp = G.game.player.maxHp; }, () => !d.act);
  }
  out(`     fire field peak: ${G.counters.peakBlobs} blobs (of 6000)`);
  assert(G.counters.peakBlobs <= 1800, `peak blobs in phase 3 at most 1800 (${G.counters.peakBlobs})`);
  assert(!(G.counters.lowBlobs > 0), `no brine blob under 0.7 m (${G.counters.lowBlobs ?? 0})`);
}

// ================================================================== scenario: flow
async function scenarioFlow() {
  out('\n== scenario FLOW (the wake line, the intro, the kill to victory, rest to a full reset) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player;
  run(G, 0.3);
  game.flow.debug.toState('explore');
  run(G, 0.5);
  const lines = [];
  G.watch = (n) => lines.push(n);
  p.debug.teleport(0, CONFIG.world.bossTriggerZ - 0.5);
  run(G, 7);
  assert(lines.includes('dragon:wake') && lines.includes('dragon:introDone') && game.state === 'boss' && d.state === 'combat', `walking up wakes it; the intro ends in the fight (${game.state}, ${d.state})`);
  // the world breaks during a fight, then rest restores everything
  d.debug.trigger('slam');
  run(G, 3, () => { p.hp = p.maxHp; });
  const D = game.world.destructibles;
  D.strike(0, -4, 6, 5, { kind: 'blunt', by: 'boss' });
  run(G, 1);
  const broken = D.list.filter((q) => q.state !== STATE.INTACT).length;
  d.debug.kill();
  run(G, 9);
  assert(d.state === 'dead' && game.state === 'victory', `the kill ends in victory (${d.state}, ${game.state})`);
  game.flow.debug.toState('explore');
  run(G, 0.5);
  p.debug.teleport(CONFIG.world.bonfire.x, CONFIG.world.bonfire.z + 1);
  run(G, 0.3);
  game.flow._rest?.();
  run(G, 1);
  const still = D.list.filter((q) => q.state !== STATE.INTACT).length;
  assert(broken > 0 && still === 0, `rest: the world restored (${broken} broken -> ${still})`);
  assert(d.state === 'sleeping' && !d.hazards.active && d.hp === d.maxHp, 'rest: the colossus asleep, no hazards, full health');
  // a reset mid-fight puts the hands back on the rim once it wakes
  d.debug.setAI(false);
  d.debug.startFight();
  run(G, 2);
  assert(d.hands.every((h) => h.mode === 'grip'), `awake again: both hands on the rim (${d.hands.map((h) => h.mode).join(', ')})`);
}

// ================================================================== scenario: win
async function scenarioWin() {
  out('\n== scenario WIN (a fighting bot in god mode: answers every cue, cuts what it can reach) ==');
  for (const seed of [SEED, SEED + 11]) {
    const G = build(seed);
    const { game } = G;
    fight(G, { x: 4, z: -3, ai: true });
    const d = game.dragon;
    G.defend = makeDefender(G);
    const at = [0];
    G.watch = (n) => { if (/^dragon:phase[23]$/.test(n)) at.push(game.time); };
    const t0 = game.time;
    const won = run(G, 600, () => fighter(G), () => d.state === 'dead' || d.state === 'dying');
    const T = game.time - t0;
    out(`     seed ${seed}: ${won ? 'won' : 'NOT won'} in ${T.toFixed(0)} s (phases at ${at.map((t) => (t > 0 ? (t - t0).toFixed(0) : '0')).join(' / ')} s; hp ${d.hp})`);
    assert(won, `the bot wins on seed ${seed}`);
  }
}

// ================================================================== scenario: reward
async function scenarioReward() {
  out('\n== scenario REWARD (Tidebreath, from the Lab: it damages the boss and chips a piece) ==');
  const G = build();
  const { game } = G;
  fight(G, { x: 9, z: -2 });
  const d = game.dragon, p = game.player;
  d.debug.exposeHead(6);
  run(G, 1.0);
  const head = d.rig.pt.head;
  p.yaw = Math.atan2(head.x - p.position.x, head.z - p.position.z);
  const hp0 = d.hp;
  const ok = d.debug.tidebreath();
  run(G, TIDE_BREATH.windup + TIDE_BREATH.beam + 0.3, () => { p.yaw = Math.atan2(head.x - p.position.x, head.z - p.position.z); });
  assert(ok && d.hp < hp0 && d.reward.hits >= 3, `Tidebreath damages the colossus (${hp0} -> ${d.hp}, ${d.reward?.hits} ticks landed)`);
  const D = game.world.destructibles;
  const m = D.list.find((q) => q.kind === 'menhir' && q.state === STATE.INTACT);
  place(G, m.x, m.z + 4);
  p.yaw = Math.PI;
  const mh = m.hp;
  d.debug.tidebreath();
  run(G, TIDE_BREATH.windup + TIDE_BREATH.beam + 0.3);
  assert(m.hp < mh, `... and chips the piece in its way (${mh.toFixed(2)} -> ${m.hp.toFixed(2)})`);
}

const S = {
  level: scenarioLevel,
  data: scenarioData,
  timing: scenarioTiming,
  answers: scenarioAnswers,
  breath: scenarioBreath,
  surge: scenarioSurge,
  grip: scenarioGrip,
  phases: scenarioPhases,
  bounds: scenarioBounds,
  frame: scenarioFrame,
  budget: scenarioBudget,
  flow: scenarioFlow,
  win: scenarioWin,
  reward: scenarioReward,
};
const OPT_IN = { smoke: scenarioSmoke };
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
out(fails ? `\nTIDE: ${fails} FAILED` : '\nTIDE: ALL PASSED');
process.exit(fails ? 1 : 0);
