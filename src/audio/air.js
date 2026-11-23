import { clamp } from '../core/math.js';
import { NodeBag } from './voice.js';
import { follow } from './ambience.js';
import { AIR_TUNE, airRecipe } from './airTuning.js';

// THE SOUND OF THE AIR (piece 'air'): a quiet synthesized bed per level that follows the living world:
// the wind rises with each gust that passes the hero (life.wind.level, wind.at(hero).k), rain is heard
// while it falls (life.weather.wet), a spell may colour it (the ember squall's hiss, the star's breath),
// far thunder follows the dry lightning (life.weather.flash, when the weather has one), and the night
// voices stop when the world holds its breath (life.hush) or the boss is up. No recorded samples.
// What it reads of the weather (world/life/weather.js): `wet`, `name` ('squall' colours the ash's air
// with embers; a spell's `read` field names a number to follow instead, the starless 'breath' reads
// `weather.breath` 0..1), and `bolt` (0..1, the far lightning's flash against its brightest; `flash`
// when a weather has no bolt) for the far thunder.
// The recipes and every number: airTuning.js.
//
//   new Air(audio)                 built with the audio engine (audio.js `_build`, next to the old bed)
//   air.update(now, dt, game)      once a frame after the engine is unlocked; reads game.world?.life
//   air.mix                        what it is playing now (numbers, for the tests and the audition page):
//                                  { out, wind, bright, gust, leaves, whistle, grit, rain, spell, drone,
//                                    voices, oldWind, oldVoices }
//   air.built                      true while its nodes exist
//
// With the piece off (`!game.world?.life?.on('air')`): it makes no node and draws nothing from any random
// stream, and today's bed (ForestAmbience) plays exactly as before. Switched on, it takes over the wind
// and the voices: it fades the old bed's wind and crickets (ForestAmbience.windDuck / .voiceDuck) while
// its own come in; the old bonfire stays. Switched off again, it fades out, gives the old bed back and
// drops its nodes. Its own random stream is a module LCG (the seeded fight sims replay Math.random).

const TENSE = new Set(['bossIntro', 'boss', 'dead']);
const LOOKAHEAD = 0.35;
const TAU = Math.PI * 2;
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** One step of a first-order follower (time constant tau). */
const ease = (cur, want, dt, tau) => cur + (want - cur) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));

export class Air {
  constructor(audio) {
    this.audio = audio;
    this.E = audio;
    this.bag = null;
    this.recipe = null;
    this.levelId = null;
    this._seed = 0x2a17c0de;
    this._w = { x: 0, z: 0, k: 0 };
    this._t = 0;
    this._offFor = 0;
    this.mix = { out: 0, wind: 0, bright: 0, gust: 0, leaves: 0, whistle: 0, grit: 0, rain: 0, spell: 0, drone: 0, voices: 0, oldWind: 1, oldVoices: 1 };
  }

  get built() {
    return !!this.bag;
  }

  rand() {
    this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.rand();
  }

  update(now, dt, game) {
    const life = game?.world?.life;
    // (a level with no recipe keeps the bed it has today: the quiet recipe would silence its voices)
    const on = !!life && typeof life.on === 'function' && life.on('air') === true && !!AIR_TUNE.levels[life.levelId];
    if (!on) {
      if (this.bag) this._fadeOut(now, dt);
      return;
    }
    if (!this.E?.ctx || !Number.isFinite(now)) return;
    const id = life.levelId ?? 'cinderwood';
    if (!this.bag || id !== this.levelId) {
      if (this.bag) this._dispose();
      this._build(now, id);
    }
    this._offFor = 0;
    this._drive(now, Number.isFinite(dt) ? Math.max(0, dt) : 0, game, life);
  }

  // --- the graph ------------------------------------------------------------------------------

  _build(now, id) {
    const E = this.E;
    const R = airRecipe(id);
    const b = new NodeBag(E);
    this.bag = b;
    this.recipe = R;
    this.levelId = id;
    const m = this.mix;
    for (const k in m) m[k] = 0;
    m.oldWind = m.oldVoices = 1;
    // at the page's first sound (the context is new and the old bed still fading in) there is nothing to
    // cross-fade from: start on the recipe, so the old wind is not heard for a moment first
    if (now < 3) {
      m.oldWind = R.old?.wind ?? 0;
      m.oldVoices = R.old?.voices ?? 0;
      this._old(now, m.oldWind, m.oldVoices, 0.05);
    }
    this._gust = this._lvl = this._hush = this._wet = 0;
    this._tense = 1;
    this._swayPh = this.range(0, TAU);
    this._flash = 0;
    this._thunderUntil = -1e9;

    this.out = b.gain(0);
    this.out.connect(E.ambientBus);

    // the living voices (crickets, a crow), with a little reverb for distance
    this.voiceBus = b.gain(0);
    this.voiceBus.connect(this.out);
    if (E.reverbIn) {
      const send = b.gain(R.crickets?.rev ?? AIR_TUNE.rev);
      this.voiceBus.connect(send);
      send.connect(E.reverbIn);
    }

    this.windGain = this.leavesGain = this.whistleGain = this.whistleBp = this.gritGain = null;
    this.rainGain = this.droneGain = this.spellGain = this.crackle = this.crackleBp = this.swellGain = null;
    this.thunderGain = this.crowGain = this.crowOsc = null;
    this.windLps = [];
    this.crickets = [];
    this.spells = [];

    const W = R.wind;
    if (W) {
      this.windGain = b.gain(0);
      let tail = this.windGain;
      if (W.hp > 0) {
        const hp = b.filter('highpass', W.hp, 0.5);
        tail.connect(hp);
        tail = hp;
      }
      tail.connect(this.out);
      for (const [pan, lvl] of [[-W.pan, 1], [W.pan, 0.85]]) {
        const n = b.noise('brown', now, null, this.range(W.rate[0], W.rate[1]), this.rand());
        const lp = b.filter('lowpass', W.lp[0], W.q);
        const g = b.gain(lvl);
        n.connect(lp).connect(g).connect(b.panner(pan)).connect(this.windGain);
        this.windLps.push(lp);
      }
    }
    if (R.leaves) {
      const n = b.noise('pink', now, null, 1, this.rand());
      const bp = b.filter('bandpass', R.leaves.bp, R.leaves.q);
      this.leavesGain = b.gain(0);
      n.connect(bp).connect(this.leavesGain).connect(b.panner(0.3)).connect(this.out);
    }
    if (R.whistle) {
      const n = b.noise('white', now, null, 1, this.rand());
      this.whistleBp = b.filter('bandpass', R.whistle.f, R.whistle.q);
      this.whistleGain = b.gain(0);
      n.connect(this.whistleBp).connect(this.whistleGain).connect(b.panner(-0.35)).connect(this.out);
    }
    if (R.grit) {
      const n = b.noise('white', now, null, 1, this.rand());
      const hp = b.filter('highpass', R.grit.hp, 0.6);
      this.gritGain = b.gain(0);
      n.connect(hp).connect(this.gritGain).connect(b.panner(0.45)).connect(this.out);
    }
    if (R.rain) {
      const n = b.noise('pink', now, null, 1, this.rand());
      const hp = b.filter('highpass', R.rain.hp, 0.5);
      const lp = b.filter('lowpass', R.rain.lp, 0.5);
      this.rainGain = b.gain(0);
      n.connect(hp).connect(lp).connect(this.rainGain).connect(this.out);
    }
    if (R.drone) {
      const D = R.drone;
      this.droneGain = b.gain(0);
      this.droneGain.connect(this.out);
      b.osc('sine', D.f, now).connect(this.droneGain);
      const o2 = b.osc('sine', D.fifth, now);
      o2.connect(b.gain(0.45)).connect(this.droneGain);
      // a faint third harmonic so small speakers carry something of it
      const o3 = b.osc('sine', D.f * 3, now, null, 4);
      o3.connect(b.gain(0.06)).connect(this.droneGain);
      const n = b.noise('brown', now, null, 0.7, this.rand());
      n.connect(b.filter('lowpass', 70, 0.7)).connect(b.gain(0.5)).connect(this.droneGain);
    }
    for (const [name, S] of Object.entries(R.spells ?? {})) {
      const sp = { name, S, k: 0 };
      if (S.kind === 'embers' && !this.spellGain) {
        this.spellGain = b.gain(0);
        this.spellGain.connect(b.panner(0.2)).connect(this.out);
        const h = b.noise('white', now, null, 1, this.rand());
        h.connect(b.filter('bandpass', 5200, 0.8)).connect(b.gain(0.35)).connect(this.spellGain);
        const c = b.noise('white', now, null, 1, this.rand());
        this.crackleBp = b.filter('bandpass', 2600, 0.9);
        this.crackle = b.gain(0);
        c.connect(this.crackleBp).connect(this.crackle).connect(this.spellGain);
        this.crackleNext = now + 0.1;
      } else if (S.kind === 'swell' && !this.swellGain) {
        this.swellGain = b.gain(0);
        const n = b.noise('brown', now, null, 0.55, this.rand());
        n.connect(b.filter('lowpass', 95, 0.8)).connect(this.swellGain).connect(this.out);
      }
      this.spells.push(sp);
    }
    if (R.thunder) {
      this.thunderGain = b.gain(0);
      const n = b.noise('brown', now, null, 0.5, this.rand());
      const lp = b.filter('lowpass', R.thunder.lp, 0.8);
      n.connect(lp).connect(this.thunderGain).connect(b.panner(this.range(-0.5, 0.5))).connect(this.out);
      if (E.reverbIn) {
        const send = b.gain(0.4);
        this.thunderGain.connect(send);
        send.connect(E.reverbIn);
      }
    }
    if (R.crickets) {
      const C = R.crickets;
      for (const [f, pan, amp] of C.voices) {
        const o1 = b.osc('sine', f, now);
        const o2 = b.osc('triangle', f * 1.004, now);
        const g = b.gain(0);
        o1.connect(g);
        o2.connect(b.gain(0.35)).connect(g);
        g.connect(b.panner(pan)).connect(this.voiceBus);
        this.crickets.push({
          g: g.gain, amp, on: true,
          next: now + this.range(0.3, 2.5),
          period: this.range(C.period[0], C.period[1]),
          until: now + this.range(C.on[0], C.on[1]),
        });
      }
    }
    if (R.crow) {
      const K = R.crow;
      const mixG = b.gain(1);
      this.crowOsc = b.osc('sawtooth', K.f, now);
      this.crowOsc.connect(mixG);
      const n = b.noise('white', now, null, 1, this.rand());
      n.connect(b.filter('bandpass', 1300, 3)).connect(b.gain(0.6)).connect(mixG);
      this.crowGain = b.gain(0);
      mixG.connect(b.filter('bandpass', 1050, 2.2)).connect(b.filter('lowpass', 1500, 0.6)).connect(this.crowGain);
      this.crowPan = b.panner(0);
      this.crowGain.connect(this.crowPan).connect(this.voiceBus);
      this.crowNext = now + this.range(K.every[0] * 0.4, K.every[1] * 0.6);
    }
  }

  _dispose() {
    try {
      this.bag?.dispose();
    } catch {
      /* ignore */
    }
    this.bag = null;
    this.crickets = [];
    this.spells = [];
    this.windLps = [];
  }

  /** The piece was switched off: fade out, give the old bed back, then drop the nodes. */
  _fadeOut(now, dt) {
    const T = AIR_TUNE, m = this.mix;
    const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    m.out = 0;
    m.oldWind = ease(m.oldWind, 1, d, T.fadeOut);
    m.oldVoices = ease(m.oldVoices, 1, d, T.fadeOut);
    if (Number.isFinite(now)) {
      follow(this.out?.gain, 0, now, T.fadeOut, 0.001);
      this._old(now, 1, 1, T.fadeOut);
    }
    this._offFor += d;
    if (this._offFor > T.fadeOut * 6) {
      if (Number.isFinite(now)) this._old(now, 1, 1, T.fadeOut);
      m.oldWind = m.oldVoices = 1;
      this._dispose();
    }
  }

  /** Today's bed's wind and voices (its bonfire is never touched). */
  _old(now, wind, voices, tau) {
    const amb = this.E?.ambience;
    follow(amb?.windDuck?.gain, wind, now, tau, 0.002);
    follow(amb?.voiceDuck?.gain, voices, now, tau, 0.002);
  }

  // --- per frame ----------------------------------------------------------------------------

  _drive(now, dt, game, life) {
    const T = AIR_TUNE, R = this.recipe, m = this.mix;
    this._t += dt;
    const st = game.state === 'paused' ? this.E._prePause : game.state;
    const tense = TENSE.has(st);
    const hushW = clamp(fin(life.hush), 0, 1);
    this._hush = ease(this._hush, hushW, dt, hushW > this._hush ? T.hushDown : T.hushUp);
    this._tense = ease(this._tense, tense ? 0 : 1, dt, tense ? T.tenseDown : T.tenseUp);
    const hush = this._hush;
    const hushWind = 1 - (R.hushWind ?? 0.4) * hush;

    // the whole bed thins while the boss is up; fades in when the piece comes on
    m.out = 1 - (1 - clamp(fin(life.calm, 1), 0, 1)) * T.calmThin;
    follow(this.out.gain, m.out, now, T.fadeIn, 0.002);

    // today's bed: its wind gives way to the air's, its voices stay where the recipe keeps them
    m.oldWind = ease(m.oldWind, R.old?.wind ?? 0, dt, T.fadeIn);
    m.oldVoices = ease(m.oldVoices, R.old?.voices ?? 0, dt, T.fadeIn);
    this._old(now, m.oldWind, m.oldVoices * (1 - hush), 0.05);

    // the wind at the hero
    const W = R.wind;
    let wl = W?.idle ?? 0, gk = 0;
    const wind = life.wind;
    if (wind && typeof life.on === 'function' && life.on('wind')) {
      wl = clamp(fin(wind.level), 0, 1);
      const h = life.hero;
      const r = typeof wind.at === 'function' ? wind.at(fin(h?.x), fin(h?.z), this._w) : null;
      gk = clamp(fin(r?.k), 0, 1);
    }
    this._gust = ease(this._gust, gk, dt, gk > this._gust ? T.attack : T.release);
    this._lvl = ease(this._lvl, wl, dt, wl > this._lvl ? T.attack * 2 : T.release);
    const g = this._gust, lvl = this._lvl;
    m.gust = g;
    if (W && this.windGain) {
      const sw = W.sway[0] > 0 ? 1 + W.sway[0] * 0.5 * (Math.sin((TAU * this._t) / W.sway[1] + this._swayPh) + Math.sin((TAU * this._t) / (W.sway[1] * 1.618) + 1.3 * this._swayPh)) : 1;
      const drive = Math.max(0, (W.base + W.level * lvl) * sw + W.gust * g) * hushWind;
      m.wind = clamp(W.gain * drive, 0, 1);
      m.bright = clamp(lvl * 0.35 + g, 0, 1);
      const hz = W.lp[0] * Math.pow(W.lp[1] / W.lp[0], m.bright);
      follow(this.windGain.gain, m.wind, now, 0.05, 0.0015);
      for (const lp of this.windLps) follow(lp.frequency, hz, now, 0.08, 4);
    }
    if (this.leavesGain) {
      m.leaves = clamp(R.leaves.gain * (g + 0.15 * lvl) * hushWind, 0, 1);
      follow(this.leavesGain.gain, m.leaves, now, 0.06, 0.0008);
    }
    if (this.whistleGain) {
      m.whistle = clamp(R.whistle.gain * Math.pow(g, 1.5) * hushWind, 0, 1);
      follow(this.whistleGain.gain, m.whistle, now, 0.08, 0.0004);
      follow(this.whistleBp.frequency, R.whistle.f * (1 + R.whistle.rise * g), now, 0.15, 6);
    }
    if (this.gritGain) {
      m.grit = clamp(R.grit.gain * (g + R.grit.level * lvl) * hushWind, 0, 1);
      follow(this.gritGain.gain, m.grit, now, 0.06, 0.0004);
    }

    // rain while it falls
    const weather = life.weather;
    const weatherOn = !!weather && typeof life.on === 'function' && life.on('weather');
    this._wet = ease(this._wet, weatherOn ? clamp(fin(weather.wet), 0, 1) : 0, dt, 1.2);
    if (this.rainGain) {
      m.rain = clamp(R.rain.gain * this._wet, 0, 1);
      follow(this.rainGain.gain, m.rain, now, 0.1, 0.0008);
    }

    // a spell's colour
    let swell = 0, swellK = 0, embers = 0;
    for (const sp of this.spells) {
      let want = 0;
      if (weatherOn) {
        const v = sp.S.read ? weather[sp.S.read] : undefined;
        want = typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : weather.name === sp.name ? 1 : 0;
      }
      sp.k = ease(sp.k, want, dt, want > sp.k ? T.spellIn : T.spellOut);
      if (sp.S.kind === 'swell') {
        swell = Math.max(swell, sp.k * sp.S.gain);
        swellK = Math.max(swellK, sp.k);
      }
      else if (sp.S.kind === 'embers') embers = Math.max(embers, sp.k * sp.S.gain);
    }
    m.spell = Math.max(swell, embers);
    if (this.spellGain) {
      follow(this.spellGain.gain, clamp(embers, 0, 1), now, 0.2, 0.0005);
      this._crackles(now, embers);
    }
    if (this.swellGain) follow(this.swellGain.gain, clamp(swell, 0, 1), now, 0.3, 0.0005);

    // the drone breathes (and swells with the star's breath)
    if (this.droneGain) {
      const D = R.drone;
      const sw = 1 + D.sway[0] * Math.sin((TAU * this._t) / D.sway[1] + this._swayPh);
      m.drone = clamp(D.gain * sw * (1 + 1.5 * swellK) * (1 - (R.hushWind ?? 0.4) * hush), 0, 1);
      follow(this.droneGain.gain, m.drone, now, 0.3, 0.0008);
    }

    // far thunder after the dry lightning (only where the weather says it flashed)
    if (this.thunderGain) {
      // (weather.bolt: the flash against its brightest, 0..1; weather.flash is the sky's own light, ~0.1)
      const flash = weatherOn ? clamp(fin(weather.bolt ?? weather.flash), 0, 1) : 0;
      if (flash > 0.35 && this._flash <= 0.35 && now > this._thunderUntil + R.thunder.gap) this._thunder(now);
      this._flash = flash;
    }

    // the living voices: gone in the fight and with the hush
    m.voices = clamp(this._tense * (1 - hush), 0, 1);
    follow(this.voiceBus.gain, m.voices, now, 0.04, 0.002);
    if (m.voices > 0.005) for (const c of this.crickets) this._cricket(c, now);
    if (this.crowGain) {
      if (m.voices < 0.6 || tense) {
        if (this.crowNext < now + 6) this.crowNext = now + 6;
      } else if (now > this.crowNext) {
        this.crowNext = now + this.range(R.crow.every[0], R.crow.every[1]);
        this._crow(now + 0.05);
      }
    }
  }

  _cricket(c, now) {
    const C = this.recipe.crickets;
    if (c.next < now) c.next = now + 0.02;
    const horizon = now + LOOKAHEAD;
    let guard = 0;
    while (c.next < horizon && guard++ < 24) {
      if (c.next >= c.until) {
        c.on = !c.on;
        c.until = c.next + (c.on ? this.range(C.on[0], C.on[1]) : this.range(C.off[0], C.off[1]));
      }
      if (!c.on) {
        c.next = c.until;
        continue;
      }
      for (let p = 0; p < C.pulses; p++) {
        const tp = c.next + p * 0.034;
        c.g.setValueAtTime(0, tp);
        c.g.linearRampToValueAtTime(c.amp, tp + 0.004);
        c.g.linearRampToValueAtTime(c.amp * 0.6, tp + 0.013);
        c.g.linearRampToValueAtTime(0, tp + 0.019);
      }
      c.next += c.period * this.range(0.9, 1.12);
    }
  }

  _crackles(now, k) {
    if (this.crackleNext < now) this.crackleNext = now + 0.02;
    if (k < 0.002) return;
    const rate = 2 + 10 * clamp(k / 0.03, 0, 1);
    let guard = 0;
    while (this.crackleNext < now + 0.25 && guard++ < 12) {
      const tt = this.crackleNext;
      const big = this.rand() < 0.06;
      this.crackleBp.frequency.setValueAtTime(big ? this.range(1100, 1900) : this.range(2200, 5200), tt);
      this.crackle.gain.setValueAtTime(big ? this.range(0.4, 0.7) : 0.3 * Math.pow(this.rand(), 1.6), tt);
      this.crackle.gain.setTargetAtTime(0, tt + 0.0008, big ? this.range(0.008, 0.02) : this.range(0.002, 0.007));
      this.crackleNext += -Math.log(1 - this.rand() * 0.999) / rate;
    }
  }

  /** A far, soft rumble (no crack), a few seconds after the flash. */
  _thunder(now) {
    const H = this.recipe.thunder;
    const t0 = now + this.range(H.delay[0], H.delay[1]);
    const len = this.range(H.len[0], H.len[1]);
    const pk = H.gain * this.range(0.6, 1);
    const p = this.thunderGain.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(pk * 0.45, t0 + 0.35);
    p.linearRampToValueAtTime(pk, t0 + 0.9 + 0.4 * this.rand());
    p.linearRampToValueAtTime(pk * 0.55, t0 + len * 0.45);
    p.linearRampToValueAtTime(pk * 0.7, t0 + len * 0.6);
    p.linearRampToValueAtTime(0, t0 + len);
    this._thunderUntil = t0 + len;
  }

  /** A far crow: one to three hoarse calls, low and dark, out past the walls. */
  _crow(t) {
    const K = this.recipe.crow;
    const n = Math.round(this.range(K.caws[0], K.caws[1]));
    const f = K.f * this.range(0.92, 1.06);
    const pk = K.gain * this.range(0.6, 1);
    follow(this.crowPan.pan, this.range(-0.8, 0.8), t, 0.01, 0.01);
    const fq = this.crowOsc.frequency, gp = this.crowGain.gain;
    let at = t;
    for (let i = 0; i < n; i++) {
      const len = this.range(0.26, 0.36);
      fq.setValueAtTime(f * 1.08, at);
      fq.linearRampToValueAtTime(f * 0.86, at + len);
      gp.setValueAtTime(0, at);
      gp.linearRampToValueAtTime(pk, at + 0.035);
      gp.linearRampToValueAtTime(pk * 0.7, at + len * 0.6);
      gp.linearRampToValueAtTime(0, at + len);
      at += len + this.range(0.25, 0.45);
    }
  }
}
