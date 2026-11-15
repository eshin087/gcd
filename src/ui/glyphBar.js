import { damp } from '../core/math.js';
import { el, num } from './dom.js';

// Meters drawn in characters ("HP [################.....]"): the ASCII HUD's bars (ADR-098).
// set(0..1) / snap(v) / update(dt); `root` takes the state classes (low, open, hot, hit, break).
// A bar is three runs of text: the fill, the piece just lost (it holds for `hold` s, then drains,
// like the souls-style chunk) and the empty rest. The DOM is written only when a run's length changes.

const clamp01 = (v) => Math.min(1, Math.max(0, num(v, 0)));

export class GlyphBar {
  constructor(parent, className, { cells = 24, hold = 0.6, drain = 2.4, rise = 6, full = '#', lost = '=', empty = '.' } = {}) {
    this.root = el('span', `ab-gbar ${className}`, null, parent);
    this.fillEl = el('span', 'f', '', this.root);
    this.chunkEl = el('span', 'c', '', this.root);
    this.emptyEl = el('span', 'e', '', this.root);
    this.cells = Math.max(1, Math.round(cells));
    this.ch = { full, lost, empty };
    this.hold = hold;
    this.drain = drain;
    this.rise = rise;
    this.target = 1;
    this.fill = 1;
    this.chunk = 1;
    this.timer = 0;
    this._nf = -1;
    this._nc = -1;
    this._write();
  }

  /** A mark over the bar at fraction f of its length (a phase gate). */
  mark(f, glyph = '|') {
    const m = el('i', 'tick', glyph, this.root);
    // (the bar's box is its cells plus a bracket at each end)
    m.style.left = `calc(1ch + (100% - 2ch) * ${clamp01(f).toFixed(4)})`;
    return m;
  }

  /** New value 0..1. */
  set(v) {
    v = clamp01(v);
    if (v < this.target - 1e-5) {
      this.timer = this.hold;
      if (this.fill > v) {
        this.chunk = Math.max(this.chunk, this.fill);
        this.fill = v;
      }
    }
    this.target = v;
  }

  /** Jump straight to a value (no lost piece, no rise). */
  snap(v) {
    this.target = this.fill = this.chunk = clamp01(v);
    this.timer = 0;
    this._write();
  }

  update(dt) {
    if (this.fill < this.target) {
      this.fill = damp(this.fill, this.target, this.rise, dt);
      if (this.target - this.fill < 0.002) this.fill = this.target;
    } else if (this.fill > this.target) this.fill = this.target;
    if (this.chunk < this.fill) this.chunk = this.fill;
    else if (this.chunk > this.fill) {
      if (this.timer > 0) this.timer -= dt;
      else {
        this.chunk -= dt * Math.max(0.12, (this.chunk - this.fill) * this.drain);
        if (this.chunk < this.fill) this.chunk = this.fill;
      }
    }
    this._write();
  }

  _write() {
    const n = this.cells;
    // anything left shows at least one cell; only a full bar shows every cell
    let nf = this.fill <= 0 ? 0 : Math.max(1, Math.round(this.fill * n));
    if (nf >= n && this.fill < 0.995) nf = n - 1;
    // (a lost piece only where something was lost: a meter held just short of full has none)
    const nc = this.chunk > this.fill + 1e-6 ? Math.max(0, Math.min(n, Math.round(this.chunk * n)) - nf) : 0;
    if (nf === this._nf && nc === this._nc) return;
    this._nf = nf;
    this._nc = nc;
    this.fillEl.textContent = this.ch.full.repeat(nf);
    this.chunkEl.textContent = this.ch.lost.repeat(nc);
    this.emptyEl.textContent = this.ch.empty.repeat(n - nf - nc);
  }
}

/**
 * Enemy posture in characters: it grows from the middle outward ("......========......") toward
 * a break. Rises snap in with a brief brighten ('hit'); `hot` near full. (bars.js PostureBar.)
 */
export class GlyphPosture {
  constructor(parent, { cells = 32, full = '=', empty = '-' } = {}) {
    this.root = el('span', 'ab-gbar post', null, parent);
    this.lEl = el('span', 'e', '', this.root);
    this.fillEl = el('span', 'f', '', this.root);
    this.rEl = el('span', 'e', '', this.root);
    this.half = Math.max(1, Math.round(cells / 2));
    this.ch = { full, empty };
    this.target = 0;
    this.fill = 0;
    this.hitT = 0;
    this._n = -1;
    this._hot = null;
    this._hit = null;
    this._write();
  }

  set(v) {
    v = clamp01(v);
    if (v > this.target + 0.003) this.hitT = 0.14;
    this.target = v;
  }

  snap(v) {
    this.target = this.fill = clamp01(v);
    this.hitT = 0;
    this._write();
  }

  update(dt) {
    if (this.fill < this.target) this.fill = Math.min(this.target, damp(this.fill, this.target, 22, dt) + 0.002);
    else if (this.fill > this.target) this.fill = Math.max(this.target, damp(this.fill, this.target, 5, dt) - 0.0005);
    if (this.hitT > 0) this.hitT -= dt;
    this._write();
    const hot = this.fill > 0.75;
    if (hot !== this._hot) {
      this._hot = hot;
      this.root.classList.toggle('hot', hot);
    }
    const hit = this.hitT > 0;
    if (hit !== this._hit) {
      this._hit = hit;
      this.root.classList.toggle('hit', hit);
    }
  }

  _write() {
    const h = this.half;
    const n = this.fill <= 0.004 ? 0 : Math.max(1, Math.round(this.fill * h));
    if (n === this._n) return;
    this._n = n;
    const pad = this.ch.empty.repeat(h - n);
    this.lEl.textContent = pad;
    this.fillEl.textContent = this.ch.full.repeat(n * 2);
    this.rEl.textContent = pad;
  }
}
