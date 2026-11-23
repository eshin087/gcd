import { el, num } from './dom.js';
import { streakK, streakTier } from '../combat/streak.js';

// THE STREAK COUNTER (the streak pass, piece `counter`; combat/streak.js): a small number beside the
// hero that ticks up on every perfect defence of a streak (player:streak with a count of 2 or more
// that went up), pops in over about four frames, holds a moment and fades within a second. It is not
// a lasting HUD icon: the STREAK pips under the HP bar stay the record. The next perfect defence
// replaces it in place, on the same side. It sits at the hero's chest, on the side of him that is
// clear of the boss (else of his sword), and its style steps up with streakTier(n): plain and dim,
// then a thin underline, then two thin strokes either side; never a glow, never a shake.
// A streak LOST at 2 or more shows its number once more, struck through, the digits parting as they
// fall. When a flurry starts the number lets go of the hero and fades: the flurry's own cut count
// over its target takes over (ui/callouts.js `count`).
// The piece `tiers`: the first time a streak reaches a tier (3, 5, 7, 10, 15) the number carries one
// short word under it, once: the name of the flurry the streak has now earned.
// Animated from update(realDt) on real time (readable through slow motion), like the call-outs; only
// transform / opacity are written per frame and only when they change. The DOM is built on the first
// number shown: with the piece off nothing is added to the page.

/** Timing and placement (seconds; px are CSS pixels). */
export const COUNTER = {
  min: 2, // the first count shown (a streak of one is just the perfect defence itself)
  pop: 0.066, // the scale-in: about four frames at 60 fps, eased out, no overshoot
  popScale: 1.4, // ... from this size down to 1
  popFrom: 0.45, // ... and from this opacity up to 1
  hold: 0.5, // shown whole this long after the pop ...
  holdTier: 0.04, // ... plus this per tier
  holdWord: 0.3, // ... plus this when it carries a tier's word
  fade: 0.36, // then fades out over this
  handoff: 0.22, // a flurry began: let go of the hero and fade within this
  lostLife: 0.8, // a lost streak's number: struck through, then falls for this long
  lostStrike: 0.07, // the strike line draws across in this
  lostFall: 30, // px it falls by the end
  lostPart: 7, // px each digit drifts from the other
  chestUp: 1.2, // m above the hero's feet: about his chest
  side: 0.046, // the gap from his middle, as a share of the screen's height ...
  sideMin: 20, // ... never less than this (a phone)
  bossClear: 0.05, // the boss counts as off to one side when this far from him (share of the height)
  edge: 14, // px kept from the screen's sides
};

/** The word under the number the first time a streak reaches each tier (index = tier). */
export const TIER_WORDS = Object.freeze(['', 'TRIPLE', 'FIVEFOLD', 'SEVENFOLD', 'HUNDREDFOLD', 'THOUSANDFOLD']);

/** The counter's looks (?streakCount=lines | brackets | ticks; the owner picks; `lines` is drawn). */
export const COUNTER_LOOKS = Object.freeze(['lines', 'brackets', 'ticks']);
const lookFromUrl = () => {
  try {
    const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('streakCount') : null;
    return COUNTER_LOOKS.includes(v) ? v : 'lines';
  } catch {
    return 'lines';
  }
};
// the side strokes of the `brackets` look by tier (ASCII, in the HUD's own font)
const BRACKETS = ['', '', '-', '-', '=', '≡'];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class StreakCounter {
  constructor(game, parent, projector) {
    this.game = game;
    this.parent = parent;
    this.proj = projector;
    this.look = lookFromUrl();
    this.node = null; // built on first use
    this.active = false;
    this.lost = false;
    this.detached = false;
    this.n = 0;
    this.tier = 0;
    this.word = '';
    this.age = 0;
    this.life = 1;
    this.side = -1; // -1: on the hero's left on screen, 1: his right
    this.x = 0;
    this.y = 0;
    this.top = 0; // the highest tier reached in this streak (its word is shown once)
    this.prev = 0; // the last count seen
    this.p = { x: 0, y: 0, on: false, front: false };
    this.q = { x: 0, y: 0, on: false, front: false };
    this._tr = '';
    this._op = -1;
    this._dl = '';
    this._dr = '';
    this._sk = '';
    /** The last number shown ({ n, tier, word, lost }) - the tests read it. */
    this.shown = null;
    const ev = game.events;
    ev?.on?.('player:streak', (d) => this.onStreak(d));
    ev?.on?.('player:flurry', () => this.handoff());
  }

  /** player:streak { count, lost } */
  onStreak(d) {
    const n = Math.max(0, Math.round(num(d?.count, 0)));
    const lost = Math.max(0, Math.round(num(d?.lost, 0)));
    const prev = this.prev;
    this.prev = n;
    if (n === 0) {
      const top = this.top;
      this.top = 0;
      if (lost >= COUNTER.min && streakK('counter') > 0) this._showLost(lost, top);
      return;
    }
    if (!(n > prev)) return;
    // a tier first reached in this streak (STREAK_TIERS): its word, once
    const tier = streakTier(n);
    let word = '';
    if (tier > this.top) {
      this.top = tier;
      if (streakK('tiers') > 0) word = TIER_WORDS[tier] ?? '';
    }
    if (n < COUNTER.min || !(streakK('counter') > 0)) return;
    this._show(n, tier, word);
  }

  /** A flurry began: the number stops following the hero and fades (the cut count takes over). */
  handoff() {
    if (!this.active || this.lost) return;
    this.detached = true;
    this.life = Math.min(this.life, this.age + COUNTER.handoff);
  }

  clear() {
    if (!this.active) return;
    this.active = false;
    this.node?.classList.remove('on');
    this._op = -1;
    this._tr = '';
  }

  _build() {
    const n = el('div', `ab-sc ab-sc-${this.look}`, null, this.parent);
    this.node = n;
    this.box = el('div', 'b', null, n);
    const row = el('div', 'row', null, this.box);
    this.decoL = el('span', 'd l', '', row);
    this.num = el('span', 'n', null, row);
    this.digL = el('span', 'g', '', this.num);
    this.digR = el('span', 'g', '', this.num);
    this.decoR = el('span', 'd r', '', row);
    this.strike = el('div', 'k', null, this.box);
    this.under = el('div', 'u', null, this.box);
    this.wordEl = el('div', 'w', '', this.box);
  }

  _show(n, tier, word) {
    if (!this.node) this._build();
    // a fresh number picks its side; one that ticks up stays where it is
    const fresh = !this.active || this.lost || this.detached;
    if (fresh) this.side = this._pickSide();
    this.active = true;
    this.lost = false;
    this.detached = false;
    this.n = n;
    this.tier = tier;
    this.word = word;
    this.age = 0;
    this.life = COUNTER.pop + COUNTER.hold + COUNTER.holdTier * tier + (word ? COUNTER.holdWord : 0) + COUNTER.fade;
    this._text(String(n), '');
    const deco = this.look === 'brackets' ? BRACKETS[tier] ?? '' : '';
    this.decoL.textContent = deco;
    this.decoR.textContent = deco;
    this.under.textContent = this.look === 'ticks' ? '·'.repeat(tier) : '';
    this.wordEl.textContent = word;
    this.node.className = `ab-sc ab-sc-${this.look} on t${tier}${word ? ' word' : ''} ${this.side < 0 ? 'sl' : 'sr'}`;
    this._reset();
    this.shown = { n, tier, word, lost: false };
  }

  _showLost(n, top) {
    if (!this.node) this._build();
    // it breaks where it was; with nothing shown, beside the hero
    if (!this.active || this.detached) {
      this.side = this._pickSide();
      if (!this._anchor(this.p)) return;
      this.x = this.p.x;
      this.y = this.p.y;
    }
    this.active = true;
    this.lost = true;
    this.detached = true;
    this.n = n;
    this.tier = streakTier(n);
    this.word = '';
    this.age = 0;
    this.life = COUNTER.lostLife;
    const s = String(n), h = Math.ceil(s.length / 2);
    this._text(s.slice(0, h), s.slice(h));
    this.decoL.textContent = '';
    this.decoR.textContent = '';
    this.under.textContent = '';
    this.wordEl.textContent = '';
    this.node.className = `ab-sc ab-sc-${this.look} on lost t${Math.min(this.tier, Math.max(0, top))} ${this.side < 0 ? 'sl' : 'sr'}`;
    this._reset();
    this.shown = { n, tier: this.tier, word: '', lost: true };
  }

  _text(a, b) {
    this.digL.textContent = a;
    this.digR.textContent = b;
  }

  _reset() {
    this._tr = '';
    this._op = -1;
    this._dl = '';
    this._dr = '';
    this._sk = '';
    this.digL.style.transform = '';
    this.digR.style.transform = '';
    this.strike.style.transform = '';
  }

  /** The hero's chest on the screen, plus the side gap (into `out`); false when it cannot be seen. */
  _anchor(out) {
    const pp = this.game.player?.position;
    if (!pp || !this.proj) return false;
    if (!this.proj.project(num(pp.x), num(pp.y) + COUNTER.chestUp, num(pp.z), out) || !out.front) return false;
    const h = num(this.proj.h, 720), w = num(this.proj.w, 1280);
    const gap = Math.max(COUNTER.sideMin, COUNTER.side * h);
    out.x = Math.min(w - COUNTER.edge, Math.max(COUNTER.edge, out.x + this.side * gap));
    return true;
  }

  /** The side of the hero clear of the boss; with the boss above or below him, the side away from his
   *  sword. -1 = left on screen. */
  _pickSide() {
    const g = this.game, pp = g.player?.position, P = this.p, Q = this.q;
    if (!pp || !this.proj?.project(num(pp.x), num(pp.y) + COUNTER.chestUp, num(pp.z), P) || !P.front) return this.side;
    const h = num(this.proj.h, 720);
    const d = g.dragon?.position;
    if (d && g.dragon?.alive !== false && this.proj.project(num(d.x), num(d.y) + 1.5, num(d.z), Q) && Q.front) {
      const dx = Q.x - P.x;
      if (Math.abs(dx) > COUNTER.bossClear * h) return dx > 0 ? -1 : 1;
    }
    const m = g.player?.rig?.sword?.matrixWorld?.elements;
    if (m && this.proj.project(num(m[12]), num(m[13]), num(m[14]), Q)) {
      const dx = Q.x - P.x;
      if (Math.abs(dx) > 2) return dx > 0 ? -1 : 1;
    }
    return -1;
  }

  update(dt) {
    if (!this.active) return;
    this.age += dt;
    if (this.age >= this.life) {
      this.clear();
      return;
    }
    if (!this.detached) {
      if (!this._anchor(this.p)) {
        this.clear();
        return;
      }
      this.x = this.p.x;
      this.y = this.p.y;
    }
    const C = COUNTER, a = this.age;
    let s = 1, op = 1, fall = 0;
    if (this.lost) {
      // struck through at once, a held beat, then the digits part and fall
      const k = clamp01(a / C.pop);
      s = 1.12 - 0.12 * (1 - (1 - k) * (1 - k));
      const u = clamp01((a - 0.12) / (this.life - 0.12));
      fall = C.lostFall * u * u;
      op = a < 0.12 ? 1 : 1 - u * u;
      const part = C.lostPart * (1 - (1 - u) * (1 - u));
      const dl = part > 0.05 ? `translate(${(-part).toFixed(1)}px, ${(part * 0.6).toFixed(1)}px) rotate(${(-part * 1.6).toFixed(0)}deg)` : '';
      const dr = part > 0.05 ? `translate(${part.toFixed(1)}px, ${(part * 1.2).toFixed(1)}px) rotate(${(part * 2.2).toFixed(0)}deg)` : '';
      if (dl !== this._dl) {
        this._dl = dl;
        this.digL.style.transform = dl;
      }
      if (dr !== this._dr) {
        this._dr = dr;
        this.digR.style.transform = dr;
      }
      const sk = `scaleX(${clamp01(a / C.lostStrike).toFixed(2)})`;
      if (sk !== this._sk) {
        this._sk = sk;
        this.strike.style.transform = sk;
      }
    } else if (a < C.pop) {
      const k = a / C.pop, e = 1 - (1 - k) * (1 - k);
      s = C.popScale + (1 - C.popScale) * e;
      op = C.popFrom + (1 - C.popFrom) * e;
    } else if (a > this.life - C.fade) {
      op = clamp01((this.life - a) / C.fade);
    }
    if (this.detached && !this.lost) op = Math.min(op, clamp01((this.life - a) / C.handoff));
    const tr = `translate3d(${this.x.toFixed(1)}px, ${(this.y + fall).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    if (tr !== this._tr) {
      this._tr = tr;
      this.node.style.transform = tr;
    }
    const o = Math.round(op * 100) / 100;
    if (o !== this._op) {
      this._op = o;
      this.node.style.opacity = String(o);
    }
  }
}

