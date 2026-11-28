// The cinematic last blow (ADR-272, game/lastBlow.js, `?lastBlow=`), headless: every level in the registry
// with its REAL boss (L.createBoss), the REAL Player, GameFlow, Hud, Lab, CameraRig and Events, wired like
// src/main.js (the view override applied after the rig, as main.js does); the world is a light mock on the
// level's own colliders (its set built once). The hero is put in front of the boss, the Lab's 'Next blow
// kills' leaves him one blow from death, and the attack button kills him (a duelist broken first, so his guard does not turn it: the execution; the wyrm a light cut): with each mode the flow must reach the
// victory, the boss's own death beat and reward as with the switch off, the shot must hold no longer than
// its hold, the hero unhurt and his input given back, the camera given back, the clock back to 1.
// usage: node lastblow.mjs <repoRoot> [scenario]
//   scenario: levels | kinds | flow | data | all     (GCD_LB_LEVELS=ash,cinderwood: only those levels)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ui, AUDIO, resetWindow } from './shim.mjs';

const ROOT = process.argv[2] || '.';
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
const { RESULT } = await imp('src/combat/rules.js');
const { LEVELS, applyLevel } = await imp('src/levels/index.js');
const { Player } = await imp('src/entities/player/player.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');
const { Unlocks } = await imp('src/game/unlocks.js');
const { LAST_BLOW, setLastBlow } = await imp('src/game/lastBlow.js');
const { LAST_BLOW_MODES, LAST_BLOW_FRAMING, LAST_BLOW_DEFAULT } = await imp('src/game/lastBlowTuning.js');

const errors = [];
console.error = (...a) => errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' '));
console.warn = () => {};
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
const DT = 1 / 60;
const WORLD0 = JSON.parse(JSON.stringify(CONFIG.world));
const ONLY = (process.env.GCD_LB_LEVELS ?? '').split(',').filter(Boolean);
const LVLS = LEVELS.filter((L) => !ONLY.length || ONLY.includes(L.id));

// each level's colliders, from its set built once
const SETS = new Map();
function circlesOf(L) {
  if (!SETS.has(L.id)) {
    Math.random = mulberry32(777);
    const c = new Colliders();
    let bound = null;
    try {
      const set = L.buildSet(createSharedUniforms(), c);
      bound = Number.isFinite(set?.edge?.base) ? set.edge.base : null;
    } catch (err) {
      errors.push(`[${L.id}] buildSet ${err?.message}`);
    }
    SETS.set(L.id, { circles: c.circles.map((k) => ({ ...k })), bound });
  }
  return SETS.get(L.id);
}

function build(L, seed = 4242) {
  resetWindow();
  for (const k of Object.keys(CONFIG.world)) delete CONFIG.world[k];
  Object.assign(CONFIG.world, JSON.parse(JSON.stringify(WORLD0)));
  applyLevel(L);
  const S = circlesOf(L);
  Math.random = mulberry32(seed);
  ui.children.forEach((c) => (c.parentNode = null));
  ui.children.length = 0;
  const U = createSharedUniforms();
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
    click(b = 0) { if (btn[b]) return; btn[b] = true; pb[b] = true; tapBtn[b] = true; this.anyPressed = true; },
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
  for (const k of S.circles) colliders.add(k.x, k.z, k.r, k.tag);
  const bound = S.bound ?? CONFIG.world.playerBound ?? 30;
  const world = {
    colliders, bonfire: { ...CONFIG.world.bonfire }, nest: { x: 0, z: 0 },
    forest: { treeSpots: [], bonfire: { ...CONFIG.world.bonfire }, ambience: { update() {}, flare() {} } },
    setGrassQuality() {}, resolve: (pos, r, b) => colliders.resolve(pos, r, b),
    heroBound: () => bound,
    setPusher(slot, x, y, z, r) { if (![x, y, z, r].every(Number.isFinite)) throw new Error(`NaN pusher ${slot}`); },
    clearPushers() {}, gust() {}, impact() {}, ignite() {}, groundBlow() {},
    scorch: { burnCircle() {}, reset() {}, heatAt: () => 0, burnAt: () => 0 },
    atmosphere: { bonfireLit: true, setBonfireLit(v) { this.bonfireLit = !!v; } }, update() {}, restore() {},
  };
  const game = {
    THREE, CONFIG, level: L, levels: LEVELS.map((x) => ({ id: x.id, name: x.name })), pickLevel() {},
    renderer: null, scene: new THREE.Scene(), fxScene: new THREE.Scene(), camera,
    pipeline: { finalMat: { uniforms: { uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 1 } } } }, U,
    events: new Events(), input, cameraRig: new CameraRig(camera), lights: new LightPool(U),
    fx: { alpha: new GlyphParticles(U, { max: 3000, additive: false }), add: new GlyphParticles(U, { max: 7000, additive: true }), fire: new FireField(U, { max: 6000 }) },
    time: 0, realTime: 0, timeScale: 1, debugTimeScale: 1, hitstopTimer: 0, hitstopScale: 1, viewOverride: null,
    mouseGround: new THREE.Vector3(), state: 'title', settings: { quality: CONFIG.defaultQuality, showFps: false },
    hitstop(seconds, scale = 0.04) { this.hitstopTimer = Math.max(this.hitstopTimer, seconds); this.hitstopScale = Math.min(this.hitstopScale, scale); },
    shake(a) { this.cameraRig.addTrauma(a); }, punch(m) { this.cameraRig.punch(m); }, kick(x, y, z, m) { this.cameraRig.kick(x, y, z, m); },
  };
  game.world = world;
  game.unlocks = new Unlocks(null, '');
  const G = { game, input, counts: {}, hits: [], log: [], shotFrames: 0, maxShot: 0, badPose: 0, scaleMin: 1 };
  const emit = game.events.emit.bind(game.events);
  game.events.emit = (n, d) => {
    G.counts[n] = (G.counts[n] || 0) + 1;
    emit(n, d);
  };
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  const R0 = Math.random;
  Math.random = mulberry32(seed + 0x5eed);
  game.dragon = L.createBoss(game);
  Math.random = R0;
  game.boss = game.dragon;
  game.hud = new Hud(game);
  game.touch = new TouchControls(game);
  game.flow = new GameFlow(game);
  game.lab = new Lab(game);
  game.applyQuality = () => {};
  const flowLog = game.flow._log?.bind(game.flow);
  if (flowLog) game.flow._log = (t, k) => { G.log.push(String(t)); return flowLog(t, k); };
  const takeHit = game.player.takeHit.bind(game.player);
  game.player.takeHit = (h) => {
    const r = takeHit(h);
    G.hits.push({ t: game.realTime, r, shot: !!game.flow.lastBlow?.holding, damage: h?.damage });
    return r;
  };
  game.cameraRig.snap(game.player.position);
  const focus = new THREE.Vector3();
  G.tick = (realDt = DT) => {
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
    focus.copy(game.player.position);
    game.cameraRig.update(realDt, focus);
    // (main.js's view override, after the rig)
    const o = game.viewOverride;
    if (o) {
      const p = o.pos, t = o.target;
      if (![p.x, p.y, p.z, t.x, t.y, t.z].every(Number.isFinite)) G.badPose++;
      else {
        camera.position.set(p.x, p.y, p.z);
        camera.lookAt(t.x, t.y, t.z);
        // (the camera never stands in a collider while the shot holds)
        for (const c of game.world.colliders.circles) if (Math.hypot(p.x - c.x, p.z - c.z) < c.r) G.inCollider = (G.inCollider ?? 0) + 1;
        if (p.y < game.player.position.y + 0.5) G.underFloor = (G.underFloor ?? 0) + 1;
      }
    }
    game.lights.update(dt, game.player.position);
    game.fx.alpha.update(dt, game.time);
    game.fx.add.update(dt, game.time);
    game.fx.fire.update(dt);
    game.hud.update(realDt);
    game.audio.update(realDt);
    game.input.endFrame();
    const LB = game.flow.lastBlow;
    if (LB?.active) {
      G.shotFrames++;
      G.maxShot = Math.max(G.maxShot, LB.t);
      G.scaleMin = Math.min(G.scaleMin, game.timeScale);
      if (game.input.enabled) G.inputDuringShot = (G.inputDuringShot ?? 0) + (game.state === 'paused' ? 0 : 1);
    }
    const p = game.player, d = game.dragon;
    if (![p.position.x, p.position.z, p.hp].every(Number.isFinite)) throw new Error('player NaN');
    if (![d.position.x, d.position.y, d.position.z].every(Number.isFinite)) throw new Error('boss NaN');
  };
  G.run = (seconds, until = null, step = null) => {
    for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
      step?.(G);
      G.tick(DT);
      if (until?.(G)) return true;
    }
    return false;
  };
  return G;
}

/** Into the fight (the Lab's jump), his AI off, the hero `dist` m in front of him facing him, one blow from death. */
function stage(G, dist) {
  const { game } = G;
  G.run(0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug?.setAI?.(false);
  G.run(0.5);
  d.debug?.tidy?.();
  const D = dist ?? (game.level.id === 'cinderwood' ? 5.5 : 1.7);
  // the wyrm: in front of its chest; a duelist: in front of him
  const yaw = Number.isFinite(d.yaw) ? d.yaw : 0;
  const lp = new THREE.Vector3();
  d.lockPoint(lp);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const x = lp.x + fx * D, z = lp.z + fz * D;
  game.player.debug?.teleport?.(x, z);
  if (!game.player.debug?.teleport) game.player.position.set(x, 0, z);
  game.player.yaw = Math.atan2(lp.x - x, lp.z - z);
  game.mouseGround.set(lp.x, 0, lp.z);
  G.run(0.2);
  game.lab._lastHit();
  // (a duelist turns to face him and his guard turns every cut, even with his AI off: broken, he is open)
  if (d.kit) d.debug?.postureBreak?.();
}

/** Swing until he dies (a light cut, then again while he stands); true when he died. */
function killByCut(G, button = 0) {
  const { game } = G, d = game.dragon;
  const dying = () => d.state === 'dying' || d.mode === 'dying' || d.state === 'dead' || d.mode === 'dead';
  return G.run(6, dying, (g) => {
    const lp = new THREE.Vector3();
    d.lockPoint(lp);
    game.mouseGround.set(lp.x, 0, lp.z);
    if (Math.round(game.realTime / DT) % 30 === 0) g.input.click(button);
  });
}

const SCENARIOS = {};

// ---------------------------------------------------------------- the data: a mode per variant, a framing per level
SCENARIOS.data = () => {
  out('\n== the data: the modes, a framing for every level, the default off ==');
  assert(LAST_BLOW_DEFAULT === 'off' && LAST_BLOW.opts[0] === 'off', 'the default is off (today) until the owner picks');
  const M = LAST_BLOW_MODES;
  assert(M.a.push === 0 && M.b.push === 0 && M.a.hold < M.b.hold, 'a vs b: the hold alone (a cut both)');
  assert(M.b.hold === M.c.hold && M.c.push > 0, 'b vs c: the move alone (a cut / a push, the same hold)');
  assert(Object.values(M).every((m) => m.push * 2 < m.hold && m.slow[0] > 0 && m.slow[0] < m.slow[1] && m.slow[1] < 1), 'every mode: the push inside the hold, the time slowed most at the contact');
  for (const L of LEVELS) assert(!!LAST_BLOW_FRAMING[L.id], `${L.id}: a framing block`);
};

// ---------------------------------------------------------------- every level: the attack button kills him (the execution, the wyrm a light cut), every mode
SCENARIOS.levels = () => {
  for (const L of LVLS) {
    out(`\n== ${L.id}: the killing blow on ${L.name ?? L.id} ==`);
    const res = {};
    for (const mode of ['off', 'a', 'b', 'c']) {
      setLastBlow(mode);
      const G = build(L);
      const { game } = G;
      stage(G);
      const died = killByCut(G);
      const LB = game.flow.lastBlow;
      const won = G.run(20, () => game.state === 'victory');
      G.run(1.5);
      const shotHits = G.hits.filter((h) => h.shot && h.r !== RESULT.IGNORED).length;
      res[mode] = {
        died, won, taken: LB.taken, skipped: LB.skipped, last: LB.last, unlocks: game.unlocks.all().join(','),
        fallen: G.log.filter((t) => /fall|vanquish|learn/i.test(t)).length, maxShot: G.maxShot, scaleMin: G.scaleMin,
        view: game.viewOverride, input: game.input.enabled, scale: game.timeScale, shotHits, bad: G.badPose, inputOn: G.inputDuringShot ?? 0, inCollider: G.inCollider ?? 0, underFloor: G.underFloor ?? 0, from: LB.last?.from,
      };
      out(`     ${mode}: died ${died}, victory ${won}, shot ${LB.taken ? `taken (${LB.last?.kind}, side ${LB.last?.side}, ${LB.last?.d} m)` : `skipped: ${LB.skipped}`}, held ${G.maxShot.toFixed(2)} s, slowest x${G.scaleMin.toFixed(2)}`);
    }
    const off = res.off;
    assert(off.died && off.won && off.taken === 0 && off.skipped === 'off', `${L.id} off: he dies, the victory, no shot (today)`);
    for (const mode of ['a', 'b', 'c']) {
      const r = res[mode], hold = LAST_BLOW_MODES[mode].hold;
      const fallsBack = LAST_BLOW_FRAMING[L.id]?.skip;
      assert(r.died && r.won, `${L.id} ${mode}: he dies, the flow reaches the victory`);
      if (fallsBack) assert(r.taken === 0, `${L.id} ${mode}: falls back to today (${LAST_BLOW_FRAMING[L.id].why})`);
      else assert(r.taken === 1, `${L.id} ${mode}: the shot is taken (${r.taken ? r.last?.kind : r.skipped})`);
      assert(r.maxShot <= hold + DT * 1.5, `${L.id} ${mode}: the shot holds no longer than its hold (${r.maxShot.toFixed(3)} <= ${hold})`);
      assert(r.view === null && r.input === true && r.scale === 1, `${L.id} ${mode}: the camera, the input and the clock given back`);
      assert(r.inputOn === 0 && r.shotHits === 0 && r.bad === 0, `${L.id} ${mode}: the hero's input off and nothing lands on him while it holds, every pose finite`);
      assert(r.inCollider === 0 && r.underFloor === 0, `${L.id} ${mode}: the camera never in a collider nor under the floor (${r.inCollider}, ${r.underFloor})${mode === 'c' ? `; the push from ${r.from} x` : ''}`);
      assert(r.unlocks === off.unlocks && r.fallen === off.fallen, `${L.id} ${mode}: the reward and the boss's lines as with it off (${r.unlocks || 'none'}; ${r.fallen} lines)`);
    }
  }
};

// ---------------------------------------------------------------- whatever killed him (the blow's kind), and the Lab's kill
SCENARIOS.kinds = () => {
  out('\n== whatever killed him: a heavy, the flurry, a deathblow, a plunge, a returned bullet; the Lab kill takes none ==');
  const L = LEVELS.find((x) => x.id === 'ash') ?? LEVELS[0];
  setLastBlow('b');
  {
    // (the wyrm: a duelist must be broken first, and a heavy on a broken duelist is the execution again)
    const G = build(LEVELS.find((x) => x.id === 'cinderwood') ?? L);
    stage(G);
    const died = killByCut(G, 2);
    const LB = G.game.flow.lastBlow;
    G.run(20, () => G.game.state === 'victory');
    assert(died && LB.taken === 1 && LB.last?.kind !== 'execute' && G.game.state === 'victory', `a heavy (right button) kills the wyrm: the shot (${LB.last?.kind ?? LB.skipped}), the victory`);
  }
  // the other blows reach the shot the same way: their hit event with the death in the same frame
  for (const [kind, ev] of [['flurry', 'player:hitDragon'], ['plunge', 'player:hitDragon'], ['deathblow', 'player:hitDragon'], ['returned', 'dragon:returned']]) {
    const G = build(L);
    stage(G);
    const { game } = G, d = game.dragon, lp = new THREE.Vector3();
    d.lockPoint(lp);
    d.debug.kill();
    if (ev === 'dragon:returned') game.events.emit(ev, { kind: 1, damage: 30, x: lp.x, y: lp.y, z: lp.z });
    else game.events.emit(ev, { damage: 40, kind, part: 'body', point: { x: lp.x, y: lp.y, z: lp.z }, heavy: true });
    G.run(20, () => game.state === 'victory');
    const LB = game.flow.lastBlow;
    assert(LB.taken === 1 && LB.last?.kind === kind && game.state === 'victory' && game.viewOverride === null, `${kind}: the shot, then the victory (${LB.last?.kind ?? LB.skipped})`);
  }
  // the returned shot with no point (Xin Yi's, Halcyon's) still frames the pair
  {
    const G = build(L);
    stage(G);
    G.game.dragon.debug.kill();
    G.game.events.emit('dragon:returned', { attack: 'shot' });
    G.run(20, () => G.game.state === 'victory');
    assert(G.game.flow.lastBlow.taken === 1, 'a returned shot with no point: the shot');
  }
  // the Lab's Kill deals no blow of the hero's: today's behaviour
  for (const lvl of ['ash', 'cinderwood']) {
    const G = build(LEVELS.find((x) => x.id === lvl));
    stage(G);
    G.run(1);
    G.game.lab._fightAction('kill');
    const won = G.run(20, () => G.game.state === 'victory');
    const LB = G.game.flow.lastBlow;
    assert(won && LB.taken === 0 && /blow/.test(LB.skipped), `${lvl}: the Lab's Kill takes no shot (${LB.skipped}) and reaches the victory`);
  }
};

// ---------------------------------------------------------------- the flow round it: a pause, the restart, a blow while it holds
SCENARIOS.flow = () => {
  out('\n== the flow round it: a pause holds it, a blow while it holds does nothing, the restart after ==');
  const L = LEVELS.find((x) => x.id === 'ash') ?? LEVELS[0];
  setLastBlow('b');
  const G = build(L);
  const { game } = G;
  stage(G);
  killByCut(G);
  G.run(0.1);
  const LB = game.flow.lastBlow;
  assert(LB.active, 'the shot runs');
  // a blow on him while it holds: ignored, no damage
  const hp0 = game.player.hp;
  const r = game.player.takeHit({ damage: 50, kind: 'test', tell: 'normal', knockback: 3, from: { x: game.dragon.position.x, z: game.dragon.position.z } });
  game.player.burnT = 2;
  G.run(0.2);
  assert(r === RESULT.IGNORED && game.player.hp === hp0, `a blow while it holds is ignored (${r}), a burn ticks nothing (${hp0} → ${game.player.hp})`);
  // a pause (the page hidden): the shot's clock stops, the input comes back for the menu
  const t0 = LB.t;
  game.flow.pause(true);
  G.run(1);
  assert(game.state === 'paused' && LB.active && LB.t === t0 && game.input.enabled, 'paused: the shot waits, its clock stopped, the input back for the menu');
  game.flow.pause(false);
  G.run(0.1);
  assert(LB.active && LB.t > t0 && !game.input.enabled, 'resumed: the shot runs on, the input off again');
  G.run(20, () => game.state === 'victory');
  G.run(1.5);
  assert(game.state === 'victory' && !LB.active && game.viewOverride === null, 'the victory, the shot done');
  // the restart from the victory screen
  game.input.tap('KeyE');
  G.run(4, () => game.state === 'explore');
  G.run(0.5);
  assert(game.state === 'explore' && game.input.enabled && game.viewOverride === null && game.timeScale === 1, `the restart: explore, the input, the camera and the clock as before (${game.state})`);
  // a reset in the middle of the shot (the Lab's jump) lets go at once
  const H = build(L);
  stage(H);
  killByCut(H);
  H.run(0.1);
  const LB2 = H.game.flow.lastBlow;
  const was = LB2.active;
  H.game.flow.debug.toState('explore');
  H.run(0.1);
  assert(was && !LB2.active && H.game.viewOverride === null && H.game.input.enabled && LB2.taken === 0, 'a Lab jump mid-shot: it lets go at once (no shot counted)');
};

const list = SCEN === 'all' ? Object.keys(SCENARIOS) : SCEN.split(',');
for (const name of list) {
  if (!SCENARIOS[name]) {
    out(`unknown scenario ${name}`);
    fails++;
    continue;
  }
  try {
    SCENARIOS[name]();
  } catch (err) {
    fails++;
    out('FAIL', `${name} threw: ${err?.stack ?? err}`);
  }
}
const errs = errors.filter((e) => !/AudioContext|WebGL/i.test(e));
assert(errs.length === 0, `no console errors (${errs.length})${errs.length ? ': ' + errs.slice(0, 4).join(' || ') : ''}`);
out(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
