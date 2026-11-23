import { SFX_ROOT, SLOTS, slotFiles } from './sampleList.js';

// Runtime for the recorded one-shots (the attack sounds and the blue / red cues; sampleList.js): fetch +
// decode the files after the AudioContext exists, pick a slot's file per play (never the same one
// twice in a row), start it inside an engine Voice. Everything degrades to the synth: a slot with no
// file, one not loaded yet or failed, no fetch (file://, the headless tests) or `?sfx=old` gives
// pick() → null, and the caller plays its recipe from sfx.js.
//
// The picks and the rate jitter draw from the bank's own stream, never Math.random: the seeded sims
// replay the AI's Math.random, and an extra draw there moves unrelated timings.

const CONCURRENCY = 4;
const SILENT = 0.0025; // |sample| under which a file's head counts as encoder padding / silence

// ---- the switch back: `?sfx=old` (or setSfxMode('old'): the Lab) plays exactly the sounds before this
// pass: a tick on every tell, the flash's ping on every blow, all synth, no sound of a boss's blade
let mode = 'new';
try {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('sfx') : null;
  if (q === 'old') mode = 'old';
} catch {
  /* no location */
}
/** 'new' (the default) | 'old' (the sounds before the attack-sound pass). */
export const sfxMode = () => mode;
/** Switch live (the Lab); returns the mode now. */
export function setSfxMode(m) {
  mode = m === 'old' ? 'old' : 'new';
  return mode;
}

/** First audible sample (s): MP3 decoders differ in how much encoder delay they leave at the head. */
function headOffset(buf) {
  const d = buf.getChannelData(0);
  const n = Math.min(d.length, Math.floor(buf.sampleRate * 0.25));
  for (let i = 0; i < n; i++) {
    if (d[i] > SILENT || d[i] < -SILENT) return Math.max(0, i - 32) / buf.sampleRate;
  }
  return 0;
}

function canFetch() {
  return typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '');
}

export class SampleBank {
  constructor(E) {
    this.E = E;
    this.recs = new Map(); // file -> { buf, off, peak (s) } | null (failed)
    this.last = new Map(); // slot -> the index played last
    this.loaded = 0;
    this.failed = 0;
    this.total = 0;
    this.base = SFX_ROOT;
    this._seed = 0x6a09e667;
  }

  /** 0..1 from the bank's own stream. */
  rand() {
    this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  /** Start loading every slot's files (once per context; a no-op without fetch). */
  load() {
    if (this.total || !canFetch()) return;
    const jobs = [];
    for (const slot of SLOTS) for (const f of slotFiles(slot)) if (f && typeof f.file === 'string') jobs.push(f);
    this.total = jobs.length;
    let i = 0;
    const next = () => {
      if (i >= jobs.length) return null;
      const f = jobs[i++];
      return fetch(this.base + f.file)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${f.file}`);
          return r.arrayBuffer();
        })
        .then((ab) => this._decode(ab))
        .then((buf) => {
          const off = headOffset(buf);
          const p = Number(f.peak_ms);
          this.recs.set(f.file, { buf, off, peak: Number.isFinite(p) && p > 0 ? p / 1000 : 0 });
          this.loaded++;
        })
        .catch(() => {
          this.recs.set(f.file, null);
          this.failed++;
        })
        .then(next);
    };
    for (let k = 0; k < CONCURRENCY; k++) next();
  }

  _decode(ab) {
    const ctx = this.E.ctx;
    if (!ctx) return Promise.reject(new Error('no context'));
    // (Safari < 14.1 only has the callback form)
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && typeof p.then === 'function') p.then(res, rej);
    });
  }

  /** Is any file of `slot` ready (and the new sounds on)? */
  has(slot) {
    if (mode === 'old' || !this.loaded) return false;
    for (const f of slotFiles(slot)) if (this.recs.get(f.file)) return true;
    return false;
  }

  /** A loaded file of `slot` ({ buf, off, peak }), not the one played last when it has another; or null.
   *  `commit` false: look only (the caller may still not play it). */
  pick(slot, commit = true) {
    if (mode === 'old' || !this.loaded) return null;
    const list = slotFiles(slot);
    const n = list.length;
    if (!n) return null;
    const prev = this.last.get(slot) ?? -1;
    let k = n > 1 ? Math.floor(this.rand() * (n - 1)) : 0;
    if (n > 1 && prev >= 0 && k >= prev) k++;
    for (let tries = 0; tries < n; tries++) {
      const j = (k + tries) % n;
      const r = this.recs.get(list[j].file);
      if (r) {
        if (commit) this.last.set(slot, j);
        return r;
      }
    }
    return null;
  }

  /** Start file `r` in voice `v` at ctx time t (gain linear, rate playback rate). */
  start(v, t, r, gain, rate) {
    const src = v.ctx.createBufferSource();
    src.buffer = r.buf;
    src.playbackRate.value = rate;
    const g = v.gain(gain);
    src.connect(g).connect(v.out);
    src.start(t, r.off);
    const end = t + (r.buf.duration - r.off) / Math.max(0.1, rate) + 0.05;
    src.stop(end);
    v.until(end);
    v.sources.push(src);
    v.nodes.push(src);
  }
}
