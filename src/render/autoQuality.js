// AUTO quality (ADR-200): the render resolution follows the measured frame time.
//
// `AutoQuality` is the decision alone (no DOM, no GL: tests feed it frame-time traces). main.js feeds
// it every drawn frame (`sample`), applies its step through `applyQuality` (pipeline.setSize: render
// targets and letter atlases rebuilt, ~1 dropped frame) and tells it when the moment is calm (no boss
// fight on screen). The rules:
//   - Frames are judged in windows of `window` s (their mean). A frame longer than `spike` (a hidden
//     tab, a load) restarts the window; the `settle` s after a step are not judged.
//   - DOWN: `downWindows` slow windows in a row (mean over target × `downAt`) while the GPU is the
//     limit step one down, at any moment (the fight is already stuttering). The GPU is the limit when
//     a GPU timer says it takes longer than the script, or (no timer) when the script takes under
//     `gpuShare` of the frame. The next window checks the step: if it took less than `minGain` off
//     the frame, the step is undone and nothing below it is tried again (a CPU-bound device, a
//     display or battery saver that holds the frame rate down).
//   - UP: only while calm. With a GPU timer, when the step above is predicted to fit (`upGpuAt`) for
//     `upGpuWindows` windows. Without one (vsync hides the headroom), a probe after `upWait` s of
//     holding the target. A slow window within `probeWatch` s of a step up sends it back down, and
//     that step waits `backoff` s (then longer; after the last, not again this page load).
//   - The first guess (`pick`) from a benchmark at one step: frame cost is `fixedShare` fixed and the
//     rest linear in the pixel count (ADR-199).
// `gpuTimer(gl)` reads the GPU's own time per frame where EXT_disjoint_timer_query_webgl2 exists.
// `FramePacer` is the frame-rate cap (every n-th refresh, so the pace stays even).
import { CONFIG } from '../core/config.js';

/** The ladder for a screen: the steps at or under `cap` (a step above is drawn at `cap`), at or over
 *  `floor`, one per scale. */
export function ladderFor(steps, cap, floor) {
  const out = [];
  for (const st of steps) {
    const scale = Math.min(st.scale, cap);
    if (scale < floor - 1e-6) continue;
    if (out.some((o) => Math.abs(o.scale - scale) < 1e-3)) continue;
    out.push({ ...st, scale });
  }
  if (!out.length) out.push({ ...steps[steps.length - 1], scale: Math.max(0.25, Math.min(cap, floor)) });
  return out;
}

export class AutoQuality {
  /** `cfg`: CONFIG.autoQuality. `cap`: the screen's pixel ratio (capped by maxPixelRatio). */
  constructor(cfg, { cap = 1, floor = cfg.floor } = {}) {
    this.cfg = cfg;
    this.floor = floor;
    this.t = 0; // the controller's own clock (s of frames sampled)
    this.log = []; // [{ t, from, to, why }] every step, for the Lab / tests
    this.last = null;
    this._failures = []; // per step index: failed step-ups into it
    this._blocked = []; // per step index: clock time before which no step up into it (Infinity = never)
    this.setCap(cap);
  }

  get step() { return this.steps[this.index]; }
  get scale() { return this.step.scale; }

  /** The screen's pixel ratio changed (another monitor, a zoom): a new ladder, the nearest step kept. */
  setCap(cap) {
    const c = Number.isFinite(cap) && cap > 0 ? cap : 1;
    if (this.steps && Math.abs(c - this.cap) < 1e-3) return false;
    const prev = this.steps ? this.scale : Infinity;
    this.cap = c;
    this.steps = ladderFor(this.cfg.steps, c, this.floor);
    let i = this.steps.findIndex((s) => s.scale <= prev + 1e-3);
    this.index = i < 0 ? this.steps.length - 1 : i;
    this._failures = [];
    this._blocked = [];
    this.lowest = this.steps.length - 1; // the lowest step DOWN may reach (raised when a step did not help)
    this.reset();
    return true;
  }

  /** Forget the window in progress (a level load, the tab hidden, AUTO switched back on). */
  reset() {
    this._n = 0;
    this._sum = 0;
    this._cpu = 0;
    this._gpu = 0;
    this._gpuN = 0;
    this._win = 0;
    this._slow = 0;
    this._hold = 0;
    this._gpuFit = 0;
    this._settle = this.t + this.cfg.settle;
    this._check = null;
    this._noGain = null;
    this._probe = null;
  }

  /** Predicted frame time at step `to` for `ms` measured at step `from`. */
  predict(ms, from, to) {
    const a = this.steps[from].scale, b = this.steps[to].scale;
    const f = this.cfg.fixedShare;
    return ms * (f + (1 - f) * (b * b) / (a * a));
  }

  /** The first guess: `ms` per frame measured at step `at` (default the current one). Sets and returns the index. */
  pick(ms, at = this.index) {
    if (!(ms > 0)) return this.index;
    const budget = (1 / this.cfg.target) * 1000 * this.cfg.bench.fit;
    let i = this.steps.length - 1;
    for (let k = 0; k < this.steps.length; k++) {
      if (this.predict(ms, at, k) <= budget) { i = k; break; }
    }
    if (i !== this.index) this._go(i, `bench ${ms.toFixed(1)} ms at ${this.steps[at].scale}x`);
    return this.index;
  }

  /** One drawn frame: `dt` s since the last, `cpuMs` the script's time in it, `gpuMs` the GPU's (null
   *  without a timer), `calm` no fight on screen. Returns true when the step changed. */
  sample(dt, cpuMs = 0, gpuMs = null, calm = false) {
    if (!(dt > 0)) return false;
    this.t += dt;
    if (dt > this.cfg.spike) {
      this._n = this._sum = this._cpu = this._gpu = this._gpuN = this._win = 0;
      this._settle = Math.max(this._settle, this.t + this.cfg.settle);
      return false;
    }
    if (this.t < this._settle) return false;
    this._n++;
    this._sum += dt;
    this._win += dt;
    this._cpu += Number.isFinite(cpuMs) ? cpuMs : 0;
    if (gpuMs != null && Number.isFinite(gpuMs)) {
      this._gpu += gpuMs;
      this._gpuN++;
    }
    if (this._win < this.cfg.window) return false;
    const mean = (this._sum / this._n) * 1000;
    const cpu = this._cpu / this._n;
    const gpu = this._gpuN >= this._n * 0.5 ? this._gpu / this._gpuN : null;
    this.last = { mean, cpu, gpu }; // the last window (the Lab, tests)
    this._n = this._sum = this._cpu = this._gpu = this._gpuN = this._win = 0;
    return this._decide(mean, cpu, gpu, !!calm);
  }

  _decide(mean, cpu, gpu, calm) {
    const C = this.cfg;
    const T = 1000 / C.target;
    const slow = mean > T * C.downAt;

    // a step up being watched: slow again soon after means it failed
    if (this._probe) {
      if (slow) {
        const into = this.index;
        const k = (this._failures[into] = (this._failures[into] ?? 0) + 1);
        const wait = C.backoff[k - 1];
        this._blocked[into] = wait == null ? Infinity : this.t + wait;
        this._probe = null;
        this._go(this.index + 1, `step up failed (${mean.toFixed(1)} ms)`);
        return true;
      }
      if (this.t - this._probe.t > C.probeWatch) this._probe = null;
    }

    // a step down being checked: did it help? (on the GPU's own time where it is read: on a vsynced
    // screen 33 ms and 23 ms of GPU both show as 30 fps). Without a timer, two steps in a row that
    // did not help are needed before giving up (the first may have been hidden by vsync)
    if (this._check) {
      const { before, gpuBefore } = this._check;
      this._check = null;
      const g = gpuBefore != null && gpu != null;
      const gain = g ? (gpuBefore - gpu) / gpuBefore : (before - mean) / before;
      if (gain >= C.minGain || !slow) this._noGain = null;
      else {
        const ng = (this._noGain ??= { from: this._check0, n: 0 });
        ng.n++;
        if (g || ng.n >= 2 || this.index >= this.lowest) {
          this._noGain = null;
          this.lowest = ng.from; // the resolution is not what holds this device back (coming back is no probe)
          this._go(ng.from, `step down did not help (${before.toFixed(1)} → ${mean.toFixed(1)} ms${g ? `, gpu ${gpuBefore.toFixed(1)} → ${gpu.toFixed(1)}` : ''})`);
          return true;
        }
      }
    }

    if (slow) {
      this._hold = 0;
      this._gpuFit = 0;
      this._slow++;
      // the GPU is the limit: by its timer, when it takes longer than the script and a good share of
      // the frame (a frame held down from outside shows a short GPU time); without one, when the
      // script takes under `gpuShare` of the frame
      const gpuBound = gpu != null ? gpu >= cpu && gpu >= mean * C.gpuShare * 0.75 : cpu < mean * C.gpuShare;
      if (this._slow >= C.downWindows && gpuBound && this.index < this.lowest) {
        this._slow = 0;
        const from = this.index;
        this._go(from + 1, `slow (${mean.toFixed(1)} ms, script ${cpu.toFixed(1)}${gpu != null ? `, gpu ${gpu.toFixed(1)}` : ''})`);
        this._check = { before: mean, gpuBefore: gpu };
        if (!this._noGain) this._check0 = from; // where a run of steps that did not help began
        return true;
      }
      return false;
    }
    this._slow = 0;

    const holding = mean <= T * C.upAt;
    this._hold = holding ? this._hold + C.window : 0;
    const up = this.index - 1;
    if (up < 0) return false;
    const blocked = (this._blocked[up] ?? -Infinity) > this.t;
    if (gpu != null) {
      this._gpuFit = holding && this.predict(gpu, this.index, up) <= T * C.upGpuAt ? this._gpuFit + 1 : 0;
      if (calm && !blocked && this._gpuFit >= C.upGpuWindows) {
        this._go(up, `gpu ${gpu.toFixed(1)} ms → ~${this.predict(gpu, this.index, up).toFixed(1)} above`);
        this._probe = { t: this.t };
        return true;
      }
      return false;
    }
    if (calm && !blocked && this._hold >= C.upWait) {
      this._go(up, `holding ${C.target} fps for ${this._hold.toFixed(0)} s`);
      this._probe = { t: this.t };
      return true;
    }
    return false;
  }

  _go(i, why) {
    const to = Math.max(0, Math.min(this.steps.length - 1, i));
    if (to === this.index) return;
    this.log.push({ t: +this.t.toFixed(2), from: this.steps[this.index].scale, to: this.steps[to].scale, why });
    if (this.log.length > 40) this.log.shift();
    this.index = to;
    this._slow = 0;
    this._hold = 0;
    this._gpuFit = 0;
    this._settle = this.t + this.cfg.settle;
    this._n = this._sum = this._cpu = this._gpu = this._gpuN = this._win = 0;
  }
}

/** The GPU's time per frame (ms), where EXT_disjoint_timer_query_webgl2 exists (null otherwise):
 *  `begin()` / `end()` round the frame's draws, `poll()` the latest finished reading. Any GL error
 *  turns it off for good. (On some drivers the reading includes the script's submit time: an upper
 *  bound, which keeps a step up careful.) */
export function gpuTimer(gl) {
  let ext = null;
  try {
    ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null;
  } catch {
    ext = null;
  }
  if (!ext || typeof gl.createQuery !== 'function') return null;
  const pending = [], pool = [];
  let active = null, last = null, dead = false;
  const off = () => { dead = true; active = null; };
  return {
    get ok() { return !dead; },
    begin() {
      if (dead || active || pending.length >= 6) return;
      try {
        active = pool.pop() ?? gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
      } catch {
        off();
      }
    },
    end() {
      if (dead || !active) return;
      try {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push(active);
      } catch {
        off();
      }
      active = null;
    },
    poll() {
      if (dead) return null;
      try {
        if (gl.isContextLost?.()) { pending.length = 0; pool.length = 0; return null; }
        while (pending.length) {
          const q = pending[0];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
          const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
          pending.shift();
          pool.push(q);
          last = disjoint ? null : ns / 1e6;
        }
      } catch {
        off();
        return null;
      }
      return last;
    },
  };
}

/** Draws every `n`-th display refresh so the pace stays even under `fps` (`on`): n from the median
 *  refresh interval of the last 30 callbacks (60 Hz: 1, 120: 2, 144: 2, 240: 4; under 105 Hz: 1). */
export class FramePacer {
  constructor(fps = 60) {
    this.fps = fps;
    this.on = false;
    this.n = 1;
    this._raw = [];
    this._lastNow = null;
    this._count = 0;
  }
  /** A rAF callback at `now` (ms): true when this refresh is drawn. */
  tick(now) {
    if (this._lastNow != null) {
      const d = now - this._lastNow;
      if (d > 0 && d < 100) {
        this._raw.push(d);
        if (this._raw.length > 30) this._raw.shift();
      }
    }
    this._lastNow = now;
    if (!this.on) {
      this.n = 1;
      return true;
    }
    if (this._raw.length >= 10 && (this._count % 30) === 0) {
      const s = [...this._raw].sort((a, b) => a - b);
      const refresh = s[s.length >> 1]; // ms
      const hz = 1000 / refresh;
      // 105 Hz and up: every n-th refresh, n the largest that keeps at least `fps`
      this.n = hz >= 105 ? Math.max(1, Math.floor(hz / this.fps + 0.08)) : 1;
    }
    const draw = this._count % this.n === 0;
    this._count++;
    return draw;
  }
}

/** Whether the frame-rate cap is on: the player's pick (settings.fpsCap true / false), else on a
 *  touch device (CONFIG.fpsCap.touch). */
export function fpsCapOn(game) {
  const v = game?.settings?.fpsCap;
  if (v === true || v === false) return v;
  return !!(CONFIG.fpsCap?.touch && game?.touch?.active);
}

/** The quality's name for the menus and the fps readout: 'AUTO 1.25x' or the preset's. */
export function qualityLabel(settings, auto, presets) {
  if (settings?.autoQuality && auto) return `AUTO ${+auto.scale.toFixed(2)}x`;
  return presets[settings?.quality]?.name ?? '—';
}

const param = (search, name) => {
  try {
    const q = new URLSearchParams(search ?? '');
    return q.has(name) ? (q.get(name) ?? '').toLowerCase() : null;
  } catch {
    return null;
  }
};
const OFF = new Set(['0', 'off', 'false', 'no']);

/** ?autoq=0|1: AUTO forced off / on at the start (A/B); otherwise CONFIG.autoQuality.on. */
export function autoFromSearch(search) {
  const v = param(search, 'autoq');
  if (v == null) return !!CONFIG.autoQuality.on;
  return !OFF.has(v);
}

/** ?fpscap=0|1: the frame-rate cap forced off / on; otherwise null (automatic: touch devices). */
export function capFromSearch(search) {
  const v = param(search, 'fpscap');
  if (v == null) return null;
  return !OFF.has(v);
}

/** ?autoqFloor=0.5: the lowest scale AUTO may use (look reviews); otherwise CONFIG.autoQuality.floor. */
export function floorFromSearch(search) {
  const v = Number(param(search, 'autoqfloor') ?? param(search, 'autoqFloor'));
  return Number.isFinite(v) && v >= 0.25 && v <= 4 ? v : CONFIG.autoQuality.floor;
}
