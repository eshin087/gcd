// THE PERFORMANCE READOUT (`?perf`, ADR-209): what a frame costs on the device in hand, the phone first.
// The owner sees the frame rate dip in fights on their phone, where no profiler reaches; this is the
// profiler that does. With `?perf` in the address main.js times every part of each drawn frame and this
// keeps the last `frames` of them (~30 s), shows a small line at the foot of the screen (the frame rate,
// the frame's length, the script's share, the frames that missed) and, on a tap, a report to copy or share:
// the device, the render size and AUTO's step, the frames' lengths, each part's mean / p95 / max, and the
// longest frames with what the hero and the boss were doing. Without `?perf` nothing here is made and
// main.js times nothing.
//
//   game.perf                 the readout (null without ?perf)
//   perf.beginFrame()         a drawn frame starts (main.js frame)
//   perf.add(part, ms)        time spent in a part this frame (main.js: every `safe` call, the effects, the render)
//   perf.endFrame(interval, scriptMs)   the frame ends: `interval` s since the last drawn frame, `scriptMs` the
//                             frame's own script time
//   perf.report()             the report, as text (also window.__perfReport())
//   perf.stats()              the numbers behind it
//
// No allocation per frame: typed rings, one per part.

/** The parts a frame is cut into (main.js `safe` names and its own blocks); anything else is `other`. */
export const PERF_PARTS = ['flow', 'player', 'dragon', 'world', 'fx', 'camera', 'uniforms', 'hud', 'audio', 'render', 'touch', 'gamepad', 'lab', 'view', 'autoQuality', 'other'];
const INDEX = new Map(PERF_PARTS.map((p, i) => [p, i]));

/** Is the readout asked for in this address (`?perf`, `?perf=1`; `?perf=0` no)? */
export function perfFromSearch(search) {
  try {
    const v = new URLSearchParams(search ?? '').get('perf');
    return v !== null && v !== '0' && v !== 'off';
  } catch {
    return false;
  }
}

const q = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');

export class PerfReadout {
  /**
   * @param game  the game context (read for the device, the render size, AUTO, the fighters' states)
   * @param o     { frames: frames kept (default 1800), doc: the document to show the line in (null: none),
   *               longMs: a frame this long (its interval) is kept in the list of the longest (default 20) }
   */
  constructor(game, { frames = 1800, doc = globalThis.document ?? null, longMs = 20 } = {}) {
    this.game = game;
    this.N = frames;
    this.n = 0; // frames recorded in all
    this.interval = new Float32Array(frames); // ms between drawn frames
    this.script = new Float32Array(frames); // ms of the frame's own script
    this.parts = new Float32Array(frames * PERF_PARTS.length);
    this.cur = new Float32Array(PERF_PARTS.length);
    this.longMs = longMs;
    this.longest = []; // { t, interval, script, parts: {..}, hero, boss, steps } the 24 longest
    this.t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.el = null;
    this._shownAt = 0;
    if (doc?.createElement) this._mount(doc);
  }

  beginFrame() {
    this.cur.fill(0);
  }

  add(part, ms) {
    const i = INDEX.get(part) ?? INDEX.get('other');
    if (Number.isFinite(ms)) this.cur[i] += ms;
  }

  endFrame(intervalS, scriptMs) {
    const k = this.n % this.N;
    const iv = Number.isFinite(intervalS) ? intervalS * 1000 : 0;
    this.interval[k] = iv;
    this.script[k] = Number.isFinite(scriptMs) ? scriptMs : 0;
    this.parts.set(this.cur, k * PERF_PARTS.length);
    this.n++;
    // the longest frames (by their interval, the frame the eye sees), with what was happening
    if (iv >= this.longMs || this.script[k] >= this.longMs * 0.6) {
      const L = this.longest;
      const worst = L.length < 24 ? -1 : L.reduce((m, x, i) => (x.interval < L[m].interval ? i : m), 0);
      if (worst < 0 || iv > L[worst].interval) {
        const g = this.game, parts = {};
        for (let i = 0; i < PERF_PARTS.length; i++) if (this.cur[i] >= 0.5) parts[PERF_PARTS[i]] = +this.cur[i].toFixed(1);
        const rec = {
          t: +((performance.now() - this.t0) / 1000).toFixed(1),
          interval: +iv.toFixed(1),
          script: +this.script[k].toFixed(1),
          parts,
          hero: String(g?.player?.state ?? ''),
          boss: String(g?.dragon?.brain?.action?.name ?? g?.dragon?.brain?.action?.def?.name ?? g?.dragon?.brain?.act?.name ?? g?.dragon?.state ?? ''),
          steps: g?.simSteps ?? 1,
        };
        if (worst < 0) L.push(rec);
        else L[worst] = rec;
      }
    }
    if (this.el && performance.now() - this._shownAt > 500) this._show();
  }

  /** Forget what was recorded (the RESET button; a new fight). */
  reset() {
    this.n = 0;
    this.longest.length = 0;
    this.t0 = performance.now();
  }

  /** The numbers: frames, intervals' percentiles and buckets, script's, each part's mean / p95 / max. */
  stats() {
    const m = Math.min(this.n, this.N), P = PERF_PARTS.length;
    const iv = Array.from(this.interval.subarray(0, m)).sort((a, b) => a - b);
    const sc = Array.from(this.script.subarray(0, m)).sort((a, b) => a - b);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const parts = {};
    for (let i = 0; i < P; i++) {
      const a = new Float32Array(m);
      for (let k = 0; k < m; k++) a[k] = this.parts[k * P + i];
      const s = Array.from(a).sort((x, y) => x - y);
      const mean = m ? sum(s) / m : 0;
      if (s[m - 1] > 0.05 || mean > 0.01) parts[PERF_PARTS[i]] = { mean: +mean.toFixed(2), p95: +q(s, 0.95).toFixed(2), max: +(s[m - 1] ?? 0).toFixed(1) };
    }
    const secs = sum(iv) / 1000;
    const over = (ms) => iv.filter((x) => x > ms).length;
    return {
      frames: m,
      seconds: +secs.toFixed(1),
      fps: secs > 0 ? +(m / secs).toFixed(1) : 0,
      interval: { p50: +q(iv, 0.5).toFixed(1), p95: +q(iv, 0.95).toFixed(1), p99: +q(iv, 0.99).toFixed(1), max: +(iv[m - 1] ?? 0).toFixed(1) },
      script: { mean: +(m ? sum(sc) / m : 0).toFixed(2), p50: +q(sc, 0.5).toFixed(1), p95: +q(sc, 0.95).toFixed(1), p99: +q(sc, 0.99).toFixed(1), max: +(sc[m - 1] ?? 0).toFixed(1) },
      // frames that missed a 60 Hz beat (over 20 ms), two of them (over 34 ms), a long stall (over 100 ms)
      missed: { over20: over(20), over34: over(34), over100: over(100) },
      parts,
      longest: [...this.longest].sort((a, b) => b.interval - a.interval),
    };
  }

  /** The device and the render, as the report's head. */
  device() {
    const g = this.game, c = g?.renderer?.domElement, nav = globalThis.navigator;
    let gpu = '';
    try {
      const gl = g?.renderer?.getContext?.();
      const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) ?? '';
    } catch {
      gpu = '';
    }
    const aq = g?.autoQ;
    return {
      ua: nav?.userAgent ?? '',
      gpu: String(gpu ?? ''),
      dpr: globalThis.devicePixelRatio ?? 1,
      screen: `${globalThis.screen?.width ?? '?'}x${globalThis.screen?.height ?? '?'}`,
      window: `${globalThis.innerWidth ?? '?'}x${globalThis.innerHeight ?? '?'}`,
      canvas: c ? `${c.width}x${c.height}` : '?',
      level: g?.level?.id ?? '?',
      state: g?.state ?? '?',
      quality: g?.settings?.autoQuality ? `AUTO ${aq?.scale ?? '?'}x (step ${aq?.index ?? '?'})` : `preset ${g?.settings?.quality ?? '?'}`,
      cap: g?.pacer?.on ? `${g.pacer.fps ?? '?'} fps cap` : 'no cap',
      touch: !!g?.touch?.active,
    };
  }

  /** The report, as plain text (copy, share, paste into a message). */
  report() {
    const S = this.stats(), D = this.device();
    const L = [];
    L.push(`gcd perf report — ${new Date().toISOString()}`);
    L.push(`device: ${D.ua}`);
    L.push(`gpu: ${D.gpu || '?'}  dpr ${D.dpr}  screen ${D.screen}  window ${D.window}  canvas ${D.canvas}`);
    L.push(`level ${D.level} (${D.state})  ${D.quality}  ${D.cap}  touch ${D.touch}`);
    L.push(`${S.frames} frames in ${S.seconds} s: ${S.fps} fps`);
    L.push(`frame interval ms: p50 ${S.interval.p50}  p95 ${S.interval.p95}  p99 ${S.interval.p99}  max ${S.interval.max}`);
    L.push(`missed: ${S.missed.over20} frames over 20 ms, ${S.missed.over34} over 34 ms, ${S.missed.over100} over 100 ms`);
    L.push(`script ms: mean ${S.script.mean}  p50 ${S.script.p50}  p95 ${S.script.p95}  p99 ${S.script.p99}  max ${S.script.max}`);
    L.push('parts (ms a frame: mean / p95 / max):');
    for (const [k, v] of Object.entries(S.parts).sort((a, b) => b[1].mean - a[1].mean)) L.push(`  ${k.padEnd(12)} ${f1(v.mean).padStart(5)} / ${f1(v.p95).padStart(5)} / ${f1(v.max).padStart(6)}`);
    L.push('longest frames (s into the recording: interval, script, the parts over 0.5 ms; hero / boss; steps):');
    for (const x of S.longest.slice(0, 16)) L.push(`  ${x.t}s  ${x.interval} ms  script ${x.script}  ${JSON.stringify(x.parts)}  ${x.hero} / ${x.boss}  x${x.steps}`);
    return L.join('\n');
  }

  // ---------------------------------------------------------------- the line on screen
  _mount(doc) {
    const el = doc.createElement('div');
    el.id = 'gcd-perf';
    el.style.cssText = 'position:fixed;left:50%;bottom:max(4px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:60;' +
      'font:10px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#cfe8d6;background:rgba(4,8,6,0.72);padding:3px 6px;border-radius:3px;' +
      'white-space:pre;pointer-events:auto;user-select:none;-webkit-user-select:none;max-width:96vw;overflow:hidden';
    const line = doc.createElement('span');
    el.appendChild(line);
    const btn = (label, fn) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'margin-left:6px;font:inherit;color:#04140a;background:#8fdca8;border:0;border-radius:2px;padding:1px 5px';
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          fn(b);
        } catch {
          /* a readout's button never breaks the game */
        }
      });
      el.appendChild(b);
      return b;
    };
    btn('REPORT', (b) => this._share(b, doc));
    btn('RESET', () => this.reset());
    doc.body?.appendChild(el);
    this.el = el;
    this._line = line;
  }

  _show() {
    this._shownAt = performance.now();
    const m = Math.min(this.n, this.N);
    if (!m || !this._line) return;
    // the last ~2 s
    const k = Math.min(m, 120);
    let iv = 0, sc = 0, miss = 0;
    for (let j = 0; j < k; j++) {
      const i = (this.n - 1 - j) % this.N;
      iv += this.interval[i];
      sc += this.script[i];
      if (this.interval[i] > 20) miss++;
    }
    const aq = this.game?.autoQ;
    this._line.textContent = `${f1((k / iv) * 1000)} fps  ${f1(iv / k)} ms  script ${f1(sc / k)}  missed ${miss}/${k}` + (this.game?.settings?.autoQuality ? `  ${aq?.scale ?? '?'}x` : '');
  }

  /** Copy the report (or share it: the phone's share sheet), else show it to copy by hand. */
  _share(b, doc) {
    const text = this.report();
    const nav = globalThis.navigator;
    const done = (msg) => {
      b.textContent = msg;
      setTimeout(() => (b.textContent = 'REPORT'), 1600);
    };
    const show = () => {
      const t = doc.createElement('textarea');
      t.value = text;
      t.readOnly = true;
      t.style.cssText = 'position:fixed;inset:8% 6%;z-index:61;font:10px ui-monospace,Menlo,monospace;background:#050806;color:#cfe8d6';
      t.addEventListener('blur', () => t.remove());
      doc.body.appendChild(t);
      t.focus();
      t.select();
      done('SELECT + COPY');
    };
    if (nav?.share && this.game?.touch?.active) {
      nav.share({ title: 'gcd perf report', text }).then(() => done('SHARED'), () => show());
      return;
    }
    if (nav?.clipboard?.writeText) nav.clipboard.writeText(text).then(() => done('COPIED'), () => show());
    else show();
  }
}
