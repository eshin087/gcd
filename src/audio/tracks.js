import { SCORE, TRACK_ROOT } from './trackList.js';

// Recorded background music (CC0, OpenGameArt; ADR-117): each level's exploring track and one track per
// boss phase (trackList.js). The synthesised score in music.js stays the fallback: a track that has not
// loaded, cannot load (a file:// build, offline, the headless tests) or is switched off (`?music=synth`)
// leaves the engine on its synth layer.
//
// Memory: the compressed bytes of the level's tracks are prefetched; at most KEEP tracks stay decoded
// (a 2-minute stereo track is ~45 MB decoded; the phone must not hold them all).

const KEEP = 3;
const SILENT = 0.0025; // |sample| under which a file's head / tail counts as encoder padding

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

export class TrackBank {
  constructor(E) {
    this.E = E;
    this.enabled = true;
    try {
      const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
      if (q.get('music') === 'synth') this.enabled = false;
    } catch {
      /* no location */
    }
    this.bytes = new Map(); // file -> Promise<ArrayBuffer>
    this.decoded = new Map(); // file -> { buf, off, end } (insertion order = LRU)
    this.decoding = new Map(); // file -> Promise
    this.failed = new Set();
    this.base = TRACK_ROOT;
  }

  _score() {
    return SCORE.levels[this.E.game?.level?.id] || SCORE.levels.cinderwood;
  }

  /** Prefetch the compressed bytes of this level's tracks (decoded only when they play). */
  load() {
    if (!this.enabled || !canFetch()) return;
    const L = this._score();
    for (const t of [L?.explore, ...(L?.phases || []), SCORE.victory, SCORE.death]) if (t) this._bytes(t.file);
  }

  /**
   * The track for a music mode, or null (the synth layer). 'boss' / 'boss2' play the boss's current
   * phase (`phase`, 1-based; past the level's last listed phase the last one keeps playing).
   */
  track(mode, phase = 1) {
    if (!this.enabled || !canFetch()) return null;
    let t = null;
    if (mode === 'victory' || mode === 'death') t = SCORE[mode];
    else if (mode === 'ambient') t = this._score()?.explore;
    else if (mode === 'boss' || mode === 'boss2') {
      const ph = this._score()?.phases || [];
      t = ph[Math.min(ph.length, Math.max(1, phase | 0)) - 1];
    }
    return t && !this.failed.has(t.file) ? t : null;
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

  _bytes(file) {
    let p = this.bytes.get(file);
    if (!p) {
      p = this._fetch(file);
      p.catch(() => this.failed.add(file));
      this.bytes.set(file, p);
    }
    return p;
  }

  /** Decoded track { buf, off, end } (Promise), keeping at most KEEP decoded. */
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
        while (this.decoded.size > KEEP) this.decoded.delete(this.decoded.keys().next().value);
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
 * A looping track with the MusicLayer contract the engine crossfades: fadeIn / fadeOut / schedule /
 * dispose, `kind`, `fading`, `deadAt`. It starts when its track has decoded (fading in from then); a
 * loop restarts at `loopFrom`, overlapping the end by `xfade`. `failed`: the engine swaps in the synth.
 */
export class TrackLoop {
  constructor(E, bank, spec, bus) {
    this.E = E;
    this.ctx = E.ctx;
    this.kind = 'track';
    this.spec = spec;
    this.fading = false;
    this.failed = false;
    this.started = false;
    this.deadAt = Infinity;
    this.track = null;
    this.segs = []; // { src, g, end }
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
