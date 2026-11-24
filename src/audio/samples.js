import { SFX_ROOT, SLOTS, slotFiles } from './sampleList.js';

// Runtime for the recorded / designed one-shots (the attack sounds, the blue / red cues and the combat
// core; sampleList.js): fetch +
// decode the files after the AudioContext exists, pick a slot's file per play (never the same one
// twice in a row), start it inside an engine Voice. Everything degrades to the synth: a slot with no
// file, one not loaded yet or failed, no fetch (file://, the headless tests) or `?sfx=old` gives
// pick() → null, and the caller plays its recipe from sfx.js.
//
// The picks and the rate jitter draw from the bank's own stream, never Math.random: the seeded sims
// replay the AI's Math.random, and an extra draw there moves unrelated timings.

const CONCURRENCY = 4;
const SILENT = 0.0025; // |sample| under which a file's head counts as encoder padding / silence

// ---- the recorded / designed sounds are OFF by default (ADR-176): the owner asked for every sound effect back
// to its first synth version ("start from baseline"). `?sfx=new` (or setSfxMode('new'): the Lab) plays the
// recordings and designed sounds of the attack-sound pass (ADR-165) and the combat-core round (ADR-172): cues
// only on blue / red, a boss's blade or fist through the air, steel on the parry and so on. The default plays
// exactly the sounds before them: a tick on every tell, the flash's ping on every blow, all synth, no sound of
// a boss's blade. The files are not fetched until the mode is switched on.
export const DEFAULT_SFX = 'old';
let mode = DEFAULT_SFX;
try {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('sfx') : null;
  if (q === 'new' || q === 'old') mode = q;
} catch {
  /* no location */
}
/** 'old' (the default: the original synth) | 'new' (the recorded / designed sounds of the sound passes). */
export const sfxMode = () => mode;
const BANKS = new Set();
/** Switch live (the Lab); returns the mode now. Switching to 'new' starts loading the files. */
export function setSfxMode(m) {
  mode = m === 'new' ? 'new' : 'old';
  if (mode === 'new') for (const bank of BANKS) bank.load();
  return mode;
}

// ---- the deflect chain's build on the recorded parry (parryChain.js PARRY_CHAIN): `?chain=a|b|c` (or
// setChainMode: the Lab's chain row); default 'a'. (`?sfx=old` / the synth fallback keep the synth chain.)
const CHAIN_MODES = ['a', 'b', 'c'];
let chain = 'a';
try {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('chain') : null;
  if (CHAIN_MODES.includes(q)) chain = q;
} catch {
  /* no location */
}
/** 'a' | 'b' | 'c': the deflect chain's variant on the recorded parry. */
export const chainMode = () => chain;
/** Switch live (the Lab); returns the mode now. */
export function setChainMode(m) {
  chain = CHAIN_MODES.includes(m) ? m : 'a';
  return chain;
}
export { CHAIN_MODES };

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
    BANKS.add(this);
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
    if (this.total || !canFetch() || mode === 'old') return;
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

  /**
   * Start file `r` in voice `v` at ctx time t (gain linear, rate playback rate). Returns its gain node.
   *   o (optional, may be reused by the caller): from (s into the clip past its head, file time),
   *   fadeIn (s, when `from` > 0), cut (s after t at which it fades out over fadeOut s and stops; 0: whole),
   *   dest (a node of `v` to feed instead of v.out)
   */
  start(v, t, r, gain, rate, o = null) {
    const src = v.ctx.createBufferSource();
    src.buffer = r.buf;
    const rt = Math.max(0.1, rate);
    src.playbackRate.value = rate;
    const g = v.gain(gain);
    src.connect(g).connect(o?.dest || v.out);
    const from = Math.min(r.buf.duration, r.off + Math.max(0, o?.from > 0 ? o.from : 0));
    let end = t + (r.buf.duration - from) / rt + 0.05;
    const fi = from > r.off && o?.fadeIn > 0 ? o.fadeIn : 0;
    if (fi > 0) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + fi);
    }
    if (o?.cut > 0 && t + o.cut < end) {
      const fo = Math.max(0.002, o.fadeOut > 0 ? o.fadeOut : 0.01);
      const c = Math.max(t + fi, t + o.cut);
      g.gain.setValueAtTime(gain, c);
      g.gain.linearRampToValueAtTime(0, c + fo);
      end = c + fo + 0.01;
    }
    src.start(t, from);
    src.stop(end);
    v.until(end);
    v.sources.push(src);
    v.nodes.push(src);
    return g;
  }
}
