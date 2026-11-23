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
    for (const id of T.LEVEL_IDS) {
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
};
