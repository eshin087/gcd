import { BANKS, CUES, MUSIC, BEDS, SAMPLE_ROOT } from './sampleBank.js';

// Runtime for the recorded sounds (ADR-117): fetch + decode the files after the AudioContext exists,
// pick a bank's variant per play, start a buffer inside an engine Voice, and stream the level's
// score / ambience bed as looping buffer layers. Everything degrades to the synth: a bank that has not
// loaded (or failed, or `?sound=synth`) resolves to null and the recipe in sfx.js plays instead.
//
// Memory: one-shots stay decoded (~130 short mono files). Music keeps its compressed bytes and at most
// MUSIC_KEEP decoded tracks (a 2-minute stereo track is ~45 MB decoded; the phone must not hold 9).

const SFX_CONCURRENCY = 6;
const MUSIC_KEEP = 3;
const SILENT = 0.0025; // |sample| under which a file's head counts as encoder padding / silence

let lcg = 0x2545f491;
const rand = () => (lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0) / 4294967296;

/** First audible sample (s): MP3 decoders differ in how much encoder delay they leave at the head. */
function headOffset(buf) {
  const d = buf.getChannelData(0);
  const n = Math.min(d.length, Math.floor(buf.sampleRate * 0.25));
  for (let i = 0; i < n; i++) {
    if (d[i] > SILENT || d[i] < -SILENT) return Math.max(0, i - 32) / buf.sampleRate;
  }
  return 0;
}

/** Last audible sample (s) of a track (the decoder may pad the tail with silence). */
function tailEnd(buf) {
  const d = buf.getChannelData(0);
  const stop = Math.max(0, d.length - Math.floor(buf.sampleRate * 0.5));
  for (let i = d.length - 1; i > stop; i--) {
    if (d[i] > SILENT || d[i] < -SILENT) return (i + 1) / buf.sampleRate;
  }
  return buf.duration;
}

function canFetch() {
  return typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '');
}

export class SampleBank {
  constructor(E) {
    this.E = E;
    this.enabled = true;
    try {
      const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
      if (q.get('sound') === 'synth') this.enabled = false;
    } catch {
      /* no location */
    }
    this.sfx = new Map(); // file -> { buf, off } | null (failed)
    this.last = new Map(); // bank -> last variant index
    this.bytes = new Map(); // music file -> Promise<ArrayBuffer>
    this.decoded = new Map(); // music file -> { buf, off, end } (insertion order = LRU)
    this.decoding = new Map(); // music file -> Promise
    this.failed = new Set();
    this.loaded = 0;
    this.total = 0;
    this.base = SAMPLE_ROOT;
  }

  /** Start loading every one-shot, and prefetch this level's score. Safe to call once per context. */
  load() {
    if (!this.enabled || !canFetch() || this.total) return;
    const files = [...new Set(Object.values(BANKS).flat())];
    this.total = files.length;
    let i = 0;
    const next = () => {
      if (i >= files.length) return null;
      const f = files[i++];
      return this._fetch(f)
        .then((ab) => this._decode(ab))
        .then((buf) => {
          this.sfx.set(f, { buf, off: headOffset(buf) });
          this.loaded++;
        })
        .catch(() => this.sfx.set(f, null))
        .then(next);
    };
    for (let k = 0; k < SFX_CONCURRENCY; k++) next();
    const lv = this._levelMusic();
    for (const m of [lv?.ambient, lv?.boss, lv?.boss2, MUSIC.victory, MUSIC.death, this.bed()]) if (m) this._bytes(m.file);
  }

  _fetch(file) {
    return fetch(this.base + file).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${file}`);
      return r.arrayBuffer();
    });
  }

  _decode(ab) {
    const ctx = this.E.ctx;
    if (!ctx) return Promise.reject(new Error('no context'));
    // Safari < 14.1 only has the callback form
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && typeof p.then === 'function') p.then(res, rej);
    });
  }

  /** Bank spec for a cue (the shared result object from sampleBank.js) or null: play the synth. */
  resolve(name, o) {
    if (!this.enabled || !this.loaded) return null;
    const fn = CUES[name];
    if (!fn) return null;
    const spec = fn(o, this.E);
    if (!spec || !this._pick(spec.bank, true)) return null;
    return spec;
  }

  /** A loaded variant of `bank` (avoids repeating the last one), or null. */
  _pick(bank, peek = false) {
    const list = BANKS[bank];
    if (!list) return null;
    const n = list.length;
    const prev = this.last.get(bank) ?? -1;
    let k = n > 1 ? Math.floor(rand() * (n - 1)) : 0;
    if (n > 1 && k >= prev && prev >= 0) k++;
    for (let tries = 0; tries < n; tries++) {
      const s = this.sfx.get(list[(k + tries) % n]);
      if (s) {
        if (!peek) this.last.set(bank, (k + tries) % n);
        return s;
      }
    }
    return null;
  }

  /** Start the spec's sample (and its extra) inside voice `v` at time t. */
  start(v, t, spec) {
    const s = this._pick(spec.bank);
    if (!s) return false;
    // a small random detune keeps repeats from sounding stamped (±2.5 %)
    this._play(v, t, s, spec.gain, spec.rate * (0.975 + rand() * 0.05));
    if (spec.extra) {
      const x = this._pick(spec.extra);
      if (x) this._play(v, t + (spec.extraDelay || 0), x, spec.extraGain || 1, 0.97 + rand() * 0.06);
    }
    return true;
  }

  _play(v, t, s, gain, rate) {
    const src = v.ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = rate;
    const g = v.gain(gain);
    src.connect(g).connect(v.out);
    src.start(t, s.off);
    const end = t + (s.buf.duration - s.off) / Math.max(0.1, rate) + 0.05;
    src.stop(end);
    v.until(end);
    v.sources.push(src);
    v.nodes.push(src);
  }

  // --- music + beds -------------------------------------------------------------------------------

  _levelMusic() {
    const id = this.E.game?.level?.id;
    return MUSIC[id] || MUSIC.cinderwood;
  }

  /** The track spec for a music mode in this level, or null (synth / silence). */
  track(mode) {
    if (!this.enabled || !canFetch()) return null;
    const m = mode === 'victory' || mode === 'death' ? MUSIC[mode] : this._levelMusic()?.[mode];
    if (!m || this.failed.has(m.file)) return null;
    return m;
  }

  bed() {
    if (!this.enabled || !canFetch()) return null;
    const b = BEDS[this.E.game?.level?.id] || null;
    return b && !this.failed.has(b.file) ? b : null;
  }

  _bytes(file) {
    let p = this.bytes.get(file);
    if (!p) {
      p = this._fetch(file);
      p.catch(() => this.failed.add(file));
      this.bytes.set(file, p);
    }
    return p;
  }

  /** Decoded track { buf, off, end } (Promise), keeping at most MUSIC_KEEP decoded. */
  decodeTrack(file) {
    const hit = this.decoded.get(file);
    if (hit) {
      this.decoded.delete(file);
      this.decoded.set(file, hit);
      return Promise.resolve(hit);
    }
    let p = this.decoding.get(file);
    if (p) return p;
    // decodeAudioData detaches its input: hand it a copy, keep the compressed bytes for later
    p = this._bytes(file)
      .then((ab) => this._decode(ab.slice(0)))
      .then((buf) => {
        const t = { buf, off: headOffset(buf), end: tailEnd(buf) };
        this.decoded.set(file, t);
        while (this.decoded.size > MUSIC_KEEP) this.decoded.delete(this.decoded.keys().next().value);
        return t;
      })
      .catch((err) => {
        this.failed.add(file);
        throw err;
      })
      .finally(() => this.decoding.delete(file));
    this.decoding.set(file, p);
    return p;
  }
}

/**
 * A looping buffer layer (a music track or an ambience bed) with the MusicLayer contract the engine
 * crossfades: fadeIn / fadeOut / schedule / dispose, `kind`, `fading`, `deadAt`. It starts when its
 * track has decoded (fading in from then); a loop restarts at `loopFrom`, overlapping by `xfade`.
 */
export class SampleLoop {
  constructor(E, bank, spec, bus) {
    this.E = E;
    this.ctx = E.ctx;
    this.kind = 'sample';
    this.spec = spec;
    this.fading = false;
    this.failed = false;
    this.deadAt = Infinity;
    this.track = null;
    this.segs = []; // { src, g, end }
    this.started = false;
    this.nextAt = Infinity;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus);
    this.level = spec.gain ?? 1;
    this._fadeIn = 1.5;
    bank
      .decodeTrack(spec.file)
      .then((t) => {
        this.track = t;
      })
      .catch(() => {
        this.failed = true;
      });
  }

  fadeIn(now, dur) {
    this._fadeIn = dur;
  }

  fadeOut(now, dur) {
    this.fading = true;
    const g = this.out.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + dur);
    } catch {
      /* ignore */
    }
    this.deadAt = now + dur + 0.2;
  }

  /** Bring the level to `v` (linear) over `tau` s. */
  setLevel(v, now, tau = 0.5) {
    if (this.fading || !this.started) return;
    this.out.gain.setTargetAtTime(this.level * v, now, tau);
  }

  schedule(now) {
    if (this.fading || !this.track) return;
    const t = this.track;
    if (!this.started) {
      this.started = true;
      const g = this.out.gain;
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(this.level, now + Math.max(0.05, this._fadeIn));
      this._segment(now + 0.03, t.off, 0.005);
      return;
    }
    // loop: start the next pass `xfade` before this one ends
    if (this.spec.loop && now + 0.25 >= this.nextAt) this._segment(this.nextAt, t.off + (this.spec.loopFrom || 0), this.spec.xfade || 0.04);
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (now > s.end + 0.1) {
        try {
          s.src.disconnect();
          s.g.disconnect();
        } catch {
          /* ignore */
        }
        this.segs.splice(i, 1);
      }
    }
  }

  _segment(at, from, xf) {
    const t = this.track;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = t.buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, at + xf);
    const len = Math.max(0.5, t.end - from);
    const end = at + len;
    const x = this.spec.xfade || 0.04;
    if (this.spec.loop) {
      g.gain.setValueAtTime(1, end - x);
      g.gain.linearRampToValueAtTime(0, end);
      this.nextAt = end - x;
    } else {
      this.nextAt = Infinity;
    }
    src.connect(g).connect(this.out);
    src.start(at, from);
    src.stop(end + 0.05);
    this.segs.push({ src, g, end });
  }

  dispose() {
    for (const s of this.segs) {
      try {
        s.src.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.src.disconnect();
        s.g.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.segs.length = 0;
    try {
      this.out.disconnect();
    } catch {
      /* ignore */
    }
  }
}
