// The living world's 'air' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . air
//
// The real AudioEngine is built on the shim's strict WebAudio mock (it throws on a non-finite value, an
// exponential ramp to 0, a double start). The mock's setTargetAtTime does not move `.value`, so a
// param's level is read from where the engine last aimed it (`_target`, set by follow()) or `.value`.

const DT = 1 / 60;

/** A seeded Math.random that counts its calls (the fight sims replay Math.random: the old bed must
 *  draw from it exactly as often with the piece off as it did before the air existed). */
function seeded(seed) {
  let s = seed >>> 0;
  const f = () => {
    f.calls++;
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.calls = 0;
  return f;
}

/** A level with the audio engine on it, unlocked. `counter`: count Math.random inside the engine only. */
async function withAudio(T, id, spec, o = {}) {
  const { AudioEngine } = await T.imp('src/audio/audio.js');
  const w = T.build(id, spec, o);
  const prev = Math.random;
  let rnd = null;
  if (o.seed !== undefined) {
    rnd = seeded(o.seed);
    Math.random = rnd;
  }
  const game = w.game;
  game.audio = new AudioEngine(game);
  game.audio.unlock();
  const E = game.audio;
  const ctx = E.ctx;
  if (o.noAir) E.air = null; // the engine as it was before the air existed
  if (rnd) Math.random = prev;
  const frame = () => {
    ctx.currentTime += DT;
    w.step(DT);
    const p = Math.random;
    if (rnd) Math.random = rnd;
    try {
      E.update(DT);
    } finally {
      if (rnd) Math.random = p;
    }
  };
  return { ...w, E, ctx, rnd, frame, frames(n) { for (let i = 0; i < n; i++) frame(); } };
}

/** A scripted wind and weather on the living world (the real layers may still be stubs): a gust front
 *  passes the hero from `gustAt` for `gustLen` s; rain falls from `rainAt`. */
function script(w, s) {
  const t0 = w.life.t;
  const wind = {
    still: false, dirX: 1, dirZ: 0, speed: 2, level: 0.3,
    at(x, z, out) {
      const t = w.life.t - t0;
      const k = t > s.gustAt && t < s.gustAt + s.gustLen ? Math.sin((Math.PI * (t - s.gustAt)) / s.gustLen) : 0;
      out.x = 2; out.z = 0; out.k = k;
      return out;
    },
    front() {}, burst() {}, update() {}, clear() {}, setVisible() {}, takes: () => false,
  };
  const weather = {
    name: 'clear', wet: 0, mist: 0, windK: 1, flash: 0,
    update() {
      const t = w.life.t - t0;
      this.wet = t > s.rainAt ? Math.min(1, (t - s.rainAt) / 2) : 0;
      this.name = this.wet > 0 ? (s.rainName ?? 'drizzle') : 'clear';
    },
    clear() {}, setVisible() {}, takes: () => false,
  };
  // swap the layers in place (life.update walks life.layers)
  w.life.wind = wind;
  w.life.weather = weather;
  w.life.layers = w.life.layers.map(([n, l]) => [n, n === 'wind' ? wind : n === 'weather' ? weather : l]);
  return { wind, weather };
}

const level = (p) => (p ? (p._target !== undefined ? p._target : p.value) : NaN);

// ---- the living world's one-shot sounds (audio/lifeSfx.js) ---------------------------------------------

/** A level with the audio engine AND its breakables (the tremor shakes them), every life sound counted:
 *  `plays` [{ name, ok, o }] (o: a copy of the options), heard(name) how many played. */
async function lifeAudio(T, id, spec = 'all', o = {}) {
  const a = await withAudio(T, id, spec, o);
  const { Destructibles } = await T.imp('src/world/destructibles.js');
  const { Scars } = await T.imp('src/world/scars.js');
  const { LIFE_SFX } = await T.imp('src/audio/lifeSfx.js');
  a.world.scars = new Scars(a.game, a.set.scarInk);
  const D = new Destructibles(a.game, a.world, a.set);
  a.world.destructibles = D;
  a.D = D;
  a.plays = [];
  const play = a.E.play.bind(a.E);
  a.E.play = (name, opts) => {
    const ok = play(name, opts);
    if (LIFE_SFX[name]) a.plays.push({ name, ok, o: { ...opts } });
    return ok;
  };
  a.heard = (name) => a.plays.filter((p) => p.ok && (!name || p.name === name)).length;
  a.tick = (sec) => {
    for (let t = 0; t < sec - 1e-9; t += DT) {
      a.frame();
      D.update(DT);
    }
  };
  a.tick(0.5);
  a.plays.length = 0;
  return a;
}

/** The trees (wood, standing, leafy) within r of (x, z). */
const treesNear = (D, x, z, r) => D.list.filter((b) => b.state === 0 && b.mat === 'wood' && b.kind === 'tree' && Math.hypot(b.x - x, b.z - z) < r);

/** Every gain the air holds: finite and inside [0, 1]. */
function gainsOk(air) {
  const bad = [];
  for (const n of air.bag?.nodes ?? []) {
    if (!n.gain) continue;
    for (const v of [n.gain.value, n.gain._target]) {
      if (v === undefined) continue;
      if (!Number.isFinite(v) || v < 0 || v > 1) bad.push(v);
    }
  }
  for (const [k, v] of Object.entries(air.mix)) if (!Number.isFinite(v) || v < 0 || v > 1) bad.push(`${k}=${v}`);
  return bad;
}

export default {
  /** OFF IS FREE: with the piece off the air makes no node, leaves today's bed at full and the engine
   *  draws from Math.random exactly as often as the engine without the air. */
  async off(T) {
    for (const id of T.LEVEL_IDS) {
      for (const spec of ['off', 'wind,weather,litter,steps,creatures,answer,arrival']) {
        const a = await withAudio(T, id, spec, { seed: 0x5eed });
        a.frames(600);
        const b = await withAudio(T, id, spec, { seed: 0x5eed, noAir: true });
        b.frames(600);
        T.assert(a.E.air && !a.E.air.built && a.E.air.bag === null, `${id} [${spec}]: the air made no node`);
        const amb = a.E.ambience;
        T.assert(amb.windDuck.gain.value === 1 && amb.voiceDuck.gain.value === 1 && amb.windDuck.gain._target === undefined && amb.voiceDuck.gain._target === undefined,
          `${id} [${spec}]: today's bed untouched (its wind and voices at 1, never automated)`);
        T.assert(a.rnd.calls === b.rnd.calls && a.rnd.calls > 0, `${id} [${spec}]: the engine drew Math.random ${a.rnd.calls} times over 600 frames, as without the air (${b.rnd.calls})`);
      }
    }
  },

  /** With the piece on: a gust lifts and brightens the wind, rain is heard, the hush silences the voices;
   *  every gain finite and inside [0, 1]; nothing drawn from Math.random; on every level. */
  async on(T) {
    const { AIR_TUNE } = await T.imp('src/audio/airTuning.js');
    // (a level with no recipe keeps today's bed even with the piece on: checked in `newBed`)
    for (const id of T.LEVEL_IDS.filter((x) => !!AIR_TUNE.levels[x])) {
      const a = await withAudio(T, id, 'all', { seed: 0x5eed });
      script(a, { gustAt: 4, gustLen: 2.5, rainAt: 4.5 });
      const air = a.E.air;
      const b = await withAudio(T, id, 'all', { seed: 0x5eed, noAir: true });
      script(b, { gustAt: 4, gustLen: 2.5, rainAt: 4.5 });
      a.frames(4 * 60 - 6);
      b.frames(4 * 60 - 6);
      const before = { ...air.mix };
      a.frames(80); // into the gust (its peak at 1.25 s)
      b.frames(80);
      const gust = { ...air.mix };
      a.frames(150); // rain in (from 4.5 s, full at 6.5 s), gust gone
      b.frames(150);
      const rain = { ...air.mix };
      a.life.hushFor(1.5, 1);
      b.life.hushFor(1.5, 1);
      a.frames(60);
      b.frames(60);
      const hush = { ...air.mix };
      const voices = level(air.voiceBus?.gain);
      const oldVoices = level(a.E.ambience.voiceDuck.gain);
      a.frames(600 - 4 * 60 + 6 - 80 - 150 - 60);
      b.frames(600 - 4 * 60 + 6 - 80 - 150 - 60);
      const R = air.recipe;
      T.assert(air.built, `${id}: the air built its bed`);
      const bad = gainsOk(air);
      T.assert(bad.length === 0, `${id}: every gain finite and inside [0, 1]${bad.length ? ` (${bad.slice(0, 4).join(', ')})` : ''}`);
      T.assert(a.rnd.calls === b.rnd.calls,
        `${id}: the air draws nothing from Math.random (${a.rnd.calls} calls with it, ${b.rnd.calls} without)`);
      if (R.wind) {
        T.assert(gust.wind > before.wind * 1.25 && gust.bright > before.bright + 0.3,
          `${id}: the gust lifts the wind (${before.wind.toFixed(4)} → ${gust.wind.toFixed(4)}) and opens it (bright ${before.bright.toFixed(2)} → ${gust.bright.toFixed(2)})`);
      } else T.assert(gust.wind === 0 && !air.windGain, `${id}: no wind sound at all (${gust.wind})`);
      if (R.rain) T.assert(rain.rain > R.rain.gain * 0.6 && before.rain < 1e-4, `${id}: the rain is heard while it falls (${before.rain.toFixed(4)} → ${rain.rain.toFixed(4)})`);
      else T.assert(rain.rain === 0, `${id}: no rain layer`);
      T.assert(hush.voices < 0.05 && voices < 0.05 && rain.voices > 0.9, `${id}: the hush silences the voices (${rain.voices.toFixed(2)} → ${hush.voices.toFixed(3)}, param ${voices.toFixed(3)})`);
      if (R.old?.voices) T.assert(oldVoices < 0.05, `${id}: today's crickets and owl hush too (${oldVoices.toFixed(3)})`);
      T.assert(level(a.E.ambience.windDuck.gain) <= (R.old?.wind ?? 0) + 0.02, `${id}: today's wind has given way (${level(a.E.ambience.windDuck.gain).toFixed(3)})`);
    }
  },

  /** The grove: no wind of its own (only a blow's air is heard), the starless crater: none at all; the
   *  fight silences the air's voices and thins the bed. */
  async levels(T) {
    const g = await withAudio(T, 'grove', 'all');
    g.frames(240);
    T.assert(g.E.air.mix.wind < 1e-6, `grove: the windless grove has no wind sound (${g.E.air.mix.wind})`);
    T.assert(g.E.air.crickets.length === 1, `grove: one cricket (${g.E.air.crickets.length})`);
    const s = await withAudio(T, 'starless', 'all');
    s.frames(240);
    T.assert(!s.E.air.windGain && s.E.air.crickets.length === 0 && s.E.air.mix.drone > 0, `starless: no wind, no insects, a drone (${s.E.air.mix.drone.toFixed(3)})`);
    const c = await withAudio(T, 'fox', 'all');
    c.frames(240);
    const calm = { ...c.E.air.mix };
    c.game.state = 'boss';
    c.frames(8 * 60);
    T.assert(c.E.air.mix.voices < 0.05 && calm.voices > 0.9, `fox: the boss silences the air's crickets (${calm.voices.toFixed(2)} → ${c.E.air.mix.voices.toFixed(3)})`);
    T.assert(c.E.air.mix.out < 0.8 && calm.out > 0.98, `fox: the fight thins the bed (${calm.out.toFixed(2)} → ${c.E.air.mix.out.toFixed(2)})`);
  },

  /** The air hears the REAL weather: the ash's squall colours it with embers, the star's breath swells
   *  the drone (weather.breath), the Ring's dry lightning is followed by far thunder (weather.bolt). */
  async weather(T) {
    const a = await withAudio(T, 'ash', 'weather,air');
    a.frames(120);
    const calm = a.E.air.mix.spell;
    a.life.weather.force('squall', 2);
    a.frames(60 * 8);
    T.assert(a.life.weather.name === 'squall' && calm < 1e-3 && a.E.air.mix.spell > 0.02, `ash: the squall is heard (weather '${a.life.weather.name}', spell ${calm.toFixed(3)} → ${a.E.air.mix.spell.toFixed(3)})`);
    const s = await withAudio(T, 'starless', 'weather,air');
    s.frames(120);
    const d0 = s.E.air.mix.drone;
    s.life.weather.force('breath', 1);
    let br = 0, sw = 0;
    for (let i = 0; i < 60 * 4; i++) {
      s.frame();
      br = Math.max(br, s.life.weather.breath);
      sw = Math.max(sw, s.E.air.mix.spell);
    }
    T.assert(br > 0.9 && sw > 0.01 && s.E.air.mix.drone > d0, `starless: the star's breath (weather.breath up to ${br.toFixed(2)}) swells the air (spell ${sw.toFixed(3)}, drone ${d0.toFixed(3)} → ${s.E.air.mix.drone.toFixed(3)})`);
    const r = await withAudio(T, 'ring', 'weather,air');
    r.life.weather.force('gathering', 1);
    let bolts = 0, thunders = 0, prev = 0, until = r.E.air._thunderUntil, top = 0;
    for (let i = 0; i < 60 * 90; i++) {
      r.frame();
      const b = r.life.weather.bolt;
      if (b > 0.35 && prev <= 0.35) bolts++;
      prev = b;
      top = Math.max(top, r.life.weather.flash);
      if (r.E.air._thunderUntil !== until) { thunders++; until = r.E.air._thunderUntil; }
    }
    T.assert(bolts >= 2 && thunders >= 1 && thunders <= bolts, `ring: dry lightning (${bolts} bolts in 90 s, flash up to ${top.toFixed(3)}) is followed by far thunder (${thunders})`);
  },

  /** Switching the piece in the Lab cross-fades both ways and drops the nodes once silent. */
  async switches(T) {
    const a = await withAudio(T, 'cinderwood', 'all');
    a.frames(300);
    const amb = a.E.ambience;
    T.assert(a.E.air.built && level(amb.windDuck.gain) < 0.05 && level(amb.voiceDuck.gain) > 0.9, `on: the air plays, today's wind gives way, its crickets stay (wind ${level(amb.windDuck.gain).toFixed(3)}, voices ${level(amb.voiceDuck.gain).toFixed(2)})`);
    T.setLife('off');
    a.frames(30);
    T.assert(a.E.air.built && level(a.E.air.out.gain) === 0, 'off: the air fades out (target 0) before it lets go');
    a.frames(600);
    T.assert(!a.E.air.built && level(amb.windDuck.gain) === 1 && level(amb.voiceDuck.gain) === 1, `off: its nodes are gone and today's bed is whole again (${level(amb.windDuck.gain)}, ${level(amb.voiceDuck.gain)})`);
    T.setLife('all');
    a.frames(60);
    T.assert(a.E.air.built, 'on again: rebuilt');
  },

  /** A level with no recipe of its own (added after the air was tuned) keeps the bed it has today with
   *  the piece on: the air makes no node and the old bed's wind and voices stay at 1. */
  async newBed(T) {
    const { AIR_TUNE } = await T.imp('src/audio/airTuning.js');
    const ids = T.LEVEL_IDS.filter((x) => !AIR_TUNE.levels[x]);
    if (!ids.length) {
      T.out('ok   every level has its own recipe');
      return;
    }
    for (const id of ids) {
      const a = await withAudio(T, id, 'all', { seed: 0x5eed });
      a.frames(600);
      const amb = a.E.ambience;
      T.assert(a.E.air && !a.E.air.built && amb.windDuck.gain.value === 1 && amb.voiceDuck.gain.value === 1, `${id}: no recipe → the air stands down, today's bed plays`);
    }
  },

  /** Every life sound, every variant, ten times each, through the real engine on the strict mock: none
   *  throws, every gain it sets is finite and inside [0, 1] (a modulator's depth, a gain into a param,
   *  aside), it draws nothing from Math.random, it ends within 2.5 s, and no two calls are the same. */
  async sounds(T) {
    const { LIFE_SFX, LIFE_SOUNDS } = await T.imp('src/audio/lifeSfx.js');
    const { LIFE_SFX_TUNE } = await T.imp('src/audio/lifeSfxTuning.js');
    const a = await withAudio(T, 'cinderwood', 'all');
    const E = a.E, ctx = a.ctx;
    // every value a gain param is given, per gain node
    const made = [];
    const cg = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const g = cg(), p = g.gain, seen = [], at = [];
      for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) {
        const f = p[m].bind(p);
        p[m] = (v, t, ...r) => { seen.push(v); at.push(t - ctx.currentTime); return f(v, t, ...r); };
      }
      made.push({ g, seen, at });
      return g;
    };
    const VARS = {
      flockBurst: Object.keys(LIFE_SFX_TUNE.sound.flockBurst.kinds).flatMap((kind) => [4, 24, 48].map((n) => ({ kind, n }))),
      animalBolt: ['rabbit', 'deer', 'rat', 'lizard', 'fox'].map((kind) => ({ kind })),
      treeShudder: ['leaf', 'dead', 'cane'].flatMap((kind) => [0.1, 1, 2.5].map((k) => ({ kind, k }))),
      pebbles: ['stone', 'glass', 'sand', 'earth'].flatMap((mat) => [0.2, 1, 3].map((k) => ({ mat, k }))),
    };
    let bad = [], played = 0, rnd = 0, long = 0, same = 0;
    for (const name of LIFE_SOUNDS) {
      for (const o of VARS[name] ?? [{ k: 0.1 }, { k: 1 }, { k: 2 }, {}]) {
        const sig = new Set();
        for (let i = 0; i < 10; i++) {
          made.length = 0;
          E._last.clear();
          // (an empty pool: each call gets its own voice, none is stolen or dropped)
          for (const v of E.pools.sfx) v.dispose();
          E.pools.sfx.length = 0;
          const mr = Math.random;
          Math.random = () => { rnd++; return mr(); };
          let ok = false;
          try {
            ok = E.play(name, { ...o, x: 3, z: 2 });
          } finally {
            Math.random = mr;
          }
          if (ok) played++;
          const v = E.pools.sfx[E.pools.sfx.length - 1];
          if (v && v.end - ctx.currentTime > 2.5) long++;
          for (const { g, seen } of made) {
            // (a modulator's depth: a gain feeding a param, not a level)
            if ([...g.outs].some((d) => !d.connect)) continue;
            for (const x of [g.gain.value, ...seen]) if (!Number.isFinite(x) || x < 0 || x > 1) bad.push(`${name} ${JSON.stringify(o)}: ${x}`);
          }
          // its shape this time: the levels it set and when, rounded (two the same: no variation)
          sig.add(made.map(({ seen, at }) => seen.slice(0, 8).map((x, j) => `${x.toFixed(5)}@${at[j].toFixed(4)}`).join(',')).join('|'));
          a.frames(3);
        }
        if (sig.size < 10) { same++; T.out(`     ${name} ${JSON.stringify(o)}: ${sig.size} of 10 different`); }
      }
    }
    ctx.createGain = cg;
    T.assert(played > 300 && bad.length === 0, `every life sound plays (${played} calls) and every gain it sets is finite and inside [0, 1]${bad.length ? ` (${bad.slice(0, 3).join('; ')})` : ''}`);
    T.assert(rnd === 0, `the life sounds draw nothing from Math.random (${rnd} calls)`);
    T.assert(long === 0, `every life sound ends within 2.5 s (${long} longer)`);
    T.assert(same === 0, `ten calls of one sound are ten different sounds (${same} variants repeated)`);
    // (the names the LAMPS agent calls exist)
    T.assert(['lampCatch', 'lampGutter', 'lampOut'].every((n) => !!LIFE_SFX[n]), 'the lamps\' three sounds are there (lampCatch, lampGutter, lampOut)');
  },

  /** A heavy blow beside a stand of trees: what stands shakes, and it is heard as ONE or TWO shudders,
   *  never one per tree; one patter of pebbles at most, one sift of dust at most. */
  async shudders(T) {
    const a = await lifeAudio(T, 'cinderwood', 'all');
    const D = a.D, Tr = a.life.tremor;
    // the densest spot of the tree wall the blow can reach
    let best = null, bn = 0;
    for (const b of D.list) {
      if (b.kind !== 'tree' || b.state !== 0) continue;
      const r = Math.hypot(b.x, b.z) || 1, x = b.x - (b.x / r) * 3, z = b.z - (b.z / r) * 3;
      const n = treesNear(D, x, z, 13).length;
      if (n > bn) { bn = n; best = { x, z }; }
    }
    T.assert(bn >= 12, `cinderwood: a spot with ${bn} trees within 13 m of a blow`);
    if (!best) return;
    a.place(best.x + 6, best.z + 6);
    a.tick(0.3);
    a.plays.length = 0;
    const t0 = Tr.stat.trees;
    a.world.impact(best.x, best.z, 2.5, 2, { kind: 'blunt', by: 'boss' });
    a.tick(0.6);
    const shook = Tr.stat.trees - t0, sh = a.heard('treeShudder');
    T.assert(shook >= 3 && sh >= 1 && sh <= 2, `a blow that shakes ${shook} trees (of ${bn} near) plays ${sh} shudders`);
    T.assert(a.heard('pebbles') <= 1 && a.heard('dustSift') <= 1, `one patter of pebbles (${a.heard('pebbles')}), one sift of dust at most (${a.heard('dustSift')})`);
    // a rain of blows there: still a handful, not one per tree per blow
    a.plays.length = 0;
    for (let i = 0; i < 10; i++) {
      a.world.impact(best.x + (i % 3) - 1, best.z + ((i * 7) % 3) - 1, 2.5, 2, { kind: 'blunt', by: 'boss' });
      a.tick(0.1);
    }
    const rain = a.heard('treeShudder');
    T.assert(rain <= 8, `ten blows in a second there play ${rain} shudders (two at most per shake, 0.3 s apart)`);
    // the grove: a blow among the canes is the bamboo's faintest shiver, nothing else
    const g = await lifeAudio(T, 'grove', 'all');
    const cane = g.D.list.find((b) => b.kind === 'bamboo' && b.state === 0 && Math.hypot(b.x, b.z) < 30);
    if (cane) {
      g.place(cane.x + 6, cane.z + 6);
      g.tick(0.3);
      g.plays.length = 0;
      g.world.impact(cane.x + 1, cane.z + 1, 2, 2, { kind: 'blunt', by: 'boss' });
      g.tick(0.6);
      const names = [...new Set(g.plays.filter((p) => p.ok).map((p) => p.name))];
      T.assert(names.every((n) => n === 'treeShudder') && g.plays.filter((p) => p.ok).every((p) => p.o.kind === 'cane'),
        `grove: a heavy blow among the canes is heard only as their shiver (${names.join(', ') || 'nothing'}; kinds ${[...new Set(g.plays.map((p) => p.o.kind))].join(', ')})`);
    } else T.assert(false, 'grove: a bamboo cane near the clearing');
  },

  /** A flock that goes is ONE wing burst at its roost, sized by its birds and of the level's kind; an
   *  animal that bolts is one sound of its kind. */
  async creatures(T) {
    for (const [id, kind] of [['cinderwood', 'small'], ['ash', 'crow']]) {
      const a = await lifeAudio(T, id, 'all');
      const n = a.life.creatures.flockFlees();
      a.tick(1.5);
      const b = a.plays.filter((p) => p.ok && p.name === 'flockBurst');
      T.assert(n > 0 && b.length === 1 && b[0].o.n === n && b[0].o.kind === kind && Number.isFinite(b[0].o.x),
        `${id}: a flock of ${n} birds leaves: ${b.length} burst (n ${b[0]?.o.n}, ${b[0]?.o.kind}) at its roost`);
      // the fire's flight and a heavy blow at the same roost in the same moment: still one
      a.life.creatures.flocks._last = -1e9;
      const R = a.life.creatures.flocks.roosts.find((o) => o.birds > 0);
      if (R) {
        a.plays.length = 0;
        a.world.ignite(R.tx, R.tz, 2, 1);
        a.world.impact(R.tx, R.tz, 2, 1.5, { kind: 'blunt', by: 'boss' });
        a.tick(0.5);
        T.assert(a.heard('flockBurst') <= 1, `${id}: fire and a blow at one roost together: ${a.heard('flockBurst')} burst`);
      }
    }
    const c = await lifeAudio(T, 'cinderwood', 'all');
    c.life.creatures._ready();
    const h = c.life.hero, bolted = c.life.creatures.animals.alarm(h.x, h.z, 80, 'test');
    c.tick(2);
    const bolts = c.plays.filter((p) => p.ok && p.name === 'animalBolt');
    T.assert(bolted > 0 && bolts.length >= 1 && bolts.length <= bolted && bolts.every((p) => p.o.kind === 'rabbit' || p.o.kind === 'deer'),
      `cinderwood: ${bolted} animals bolt, ${bolts.length} heard (${[...new Set(bolts.map((p) => p.o.kind))].join(', ')})`);
  },

  /** A tree reaching its last stage leans over: it creaks once (world:impact 'wear', stage 3, wood). */
  async creak(T) {
    const a = await lifeAudio(T, 'cinderwood', 'all');
    const tree = a.D.list.find((b) => b.kind === 'tree' && b.state === 0 && b.topples);
    T.assert(!!tree, 'cinderwood: a tree that topples');
    if (!tree) return;
    const ev = { kind: 'wear', mat: 'wood', x: tree.x, y: 3, z: tree.z, power: 3, by: 'boss', id: tree.id };
    a.emit('world:impact', ev);
    a.emit('world:impact', { ...ev, power: 2 });
    a.tick(0.3);
    a.emit('world:impact', ev);
    a.tick(0.3);
    T.assert(a.heard('treeCreak') === 1, `the lean creaks once (${a.heard('treeCreak')}; a stage 2 and a second lean within 0.8 s: none)`);
  },

  /** With the piece 'air' off nothing of it is heard; while the world holds its breath, nothing either. */
  async quiet(T) {
    const a = await lifeAudio(T, 'cinderwood', 'wind,weather,litter,steps,creatures,answer');
    a.life.creatures.flockFlees();
    a.life.tremor.shake(a.life.hero.x + 3, a.life.hero.z - 2, 2.5, 2);
    a.tick(1.5);
    T.assert(a.plays.length === 0, `air off: a flock and a heavy shake play nothing (${a.plays.length} calls)`);
    const b = await lifeAudio(T, 'cinderwood', 'all');
    b.life.hushFor(3, 1);
    b.tick(0.8);
    const n = b.life.creatures.flockFlees();
    b.life.tremor.shake(b.life.hero.x + 3, b.life.hero.z - 2, 2.5, 2);
    b.tick(0.5);
    T.assert(b.life.hush > 0.6 && n > 0 && b.plays.length === 0, `hush ${b.life.hush.toFixed(2)}: a flock of ${n} and a heavy shake play nothing (${b.plays.length} calls)`);
    b.tick(6);
    b.life.creatures.flocks._last = -1e9;
    b.life.creatures.flockFlees();
    b.tick(0.5);
    T.assert(b.heard('flockBurst') === 1, `the breath let go (hush ${b.life.hush.toFixed(2)}): the next flock is heard (${b.heard('flockBurst')})`);
  },
};

