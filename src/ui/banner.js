import { el, num } from './dom.js';
import { blockText } from './blockText.js';

// The big words are BLOCK LETTERS built from characters, in the title logo's block face
// (ui/blockText.js; ADR-098): as large as fits the screen's width up to BLOCK_MAX px a character
// (by kind), stacked word by word on a narrow screen. BLOCK_MIN: below this the words stack instead.
const BLOCK_MAX = { death: 17, victory: 13, area: 9, bonfire: 11, phase: 6 };
const BLOCK_MIN = 5.5;
const CH = 0.602; // a character's advance in em (the block letters' monospace)

// Centre-screen souls banners ("YOU DIED", "WYRM VANQUISHED", area titles, ...).
// Timing per kind: fade in → hold → fade out, animated from update(realDt). A new banner replaces
// the current one. The text grows very slightly while shown, like the reference games.

const KINDS = {
  death: { in: 1.8, hold: Infinity, out: 1.0, grow: 0.012 },
  victory: { in: 1.4, hold: 6.0, out: 2.2, grow: 0.008 },
  area: { in: 1.2, hold: 2.6, out: 1.6, grow: 0 },
  bonfire: { in: 0.6, hold: 1.3, out: 1.1, grow: 0.01 },
  phase: { in: 0.35, hold: 2.2, out: 1.3, grow: 0.015 },
};

const smooth = (a) => a * a * (3 - 2 * a);

export class Banner {
  constructor(parent) {
    this.root = el('div', 'ab-banner', null, parent);
    el('div', 'band', null, this.root);
    this.txt = el('div', 'txt', null, this.root);
    this.txtInner = el('span', 't', null, this.txt); // the plain text (not shown: for readers and tests)
    this.block = el('pre', 'blk', null, this.txt);
    this.text = '';
    this.sub = el('div', 'sub', null, this.root);
    this.rec = el('div', 'recap', null, this.root); // a few small lines under the hint (recap())
    this.kind = KINDS.area;
    this.active = false;
    this.phase = 'in';
    this.alpha = 0;
    this.holdT = 0;
    this.hold = 0;
    this.t = 0;
    this._op = -1;
    this._sc = -1;
  }

  show(text, kind = 'area', opts = {}) {
    const k = KINDS[kind] ?? KINDS.area;
    this.kind = k;
    this.root.className = `ab-banner k-${KINDS[kind] ? kind : 'area'}`;
    this.txtInner.textContent = String(text ?? '');
    this.text = String(text ?? '');
    this.blockKind = KINDS[kind] ? kind : 'area';
    this._w = -1;
    this._fit();
    this.sub.textContent = opts.sub ?? '';
    this.sub.classList.remove('blink');
    this.recap(null);
    // opts.hold: seconds to hold (Infinity = until clear())
    this.hold = opts.hold !== undefined ? Math.max(0, num(opts.hold, Infinity)) : k.hold;
    this.phase = 'in';
    this.alpha = 0;
    this.holdT = 0;
    this.t = 0;
    this.active = true;
    this._op = -1;
    this._sc = -1;
    this.root.style.visibility = 'visible';
    this.root.style.opacity = '0';
  }

  /** Lay the block letters out for the screen's width (on show, and when the window is resized or turned). */
  _fit() {
    const W = num(globalThis.innerWidth, 1280);
    if (W === this._w) return;
    this._w = W;
    const { lines, cols } = blockText(this.text, { maxCols: Math.floor((0.92 * W) / (CH * BLOCK_MIN)) });
    this.block.textContent = lines.join('\n');
    this.block.style.fontSize = `${Math.max(4, Math.min(BLOCK_MAX[this.blockKind] ?? 10, (0.9 * W) / (cols * CH))).toFixed(1)}px`;
  }

  /** Blinking line under the banner (e.g. "press any key to rise again"); null clears it. */
  hint(text) {
    this.sub.textContent = text ?? '';
    this.sub.classList.toggle('blink', !!text);
  }

  /** Small lines under the hint (the death screen's killing move and what struck him): an array of
   *  strings, the first drawn brighter; null clears them. */
  recap(lines) {
    this.rec.textContent = '';
    const L = Array.isArray(lines) ? lines.filter((s) => typeof s === 'string' && s) : [];
    for (let i = 0; i < L.length; i++) el('div', i === 0 ? 'l first' : 'l', L[i], this.rec);
    this.rec.classList.toggle('on', L.length > 0);
  }

  clear(instant = false) {
    if (!this.active) return;
    if (instant) {
      this.recap(null);
      this.active = false;
      this.alpha = 0;
      this._op = 0;
      this.root.style.opacity = '0';
      this.root.style.visibility = 'hidden';
      return;
    }
    this.phase = 'out';
  }

  update(dt) {
    if (!this.active) return;
    this._fit();
    const k = this.kind;
    this.t += dt;
    if (this.phase === 'in') {
      this.alpha = Math.min(1, this.alpha + dt / k.in);
      if (this.alpha >= 1) {
        this.phase = 'hold';
        this.holdT = 0;
      }
    } else if (this.phase === 'hold') {
      this.holdT += dt;
      if (this.holdT >= this.hold) this.phase = 'out';
    } else {
      this.alpha -= dt / k.out;
      if (this.alpha <= 0) {
        this.clear(true);
        return;
      }
    }
    const op = smooth(Math.min(1, Math.max(0, this.alpha)));
    if (Math.abs(op - this._op) > 0.004) {
      this._op = op;
      this.root.style.opacity = op.toFixed(3);
    }
    if (k.grow > 0) {
      const sc = 0.97 + Math.min(0.07, k.grow * this.t + 0.03 * (1 - Math.exp(-this.t * 3)));
      if (Math.abs(sc - this._sc) > 0.0005) {
        this._sc = sc;
        this.txt.style.transform = `scale(${sc.toFixed(4)})`;
      }
    } else if (this._sc !== 1) {
      this._sc = 1;
      this.txt.style.transform = '';
    }
  }
}
