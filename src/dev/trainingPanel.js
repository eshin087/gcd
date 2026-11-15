import { el, setText, setClass, button } from './labDom.js';
import { CATEGORIES, ANSWERS } from './training.js';

// The Training panel (ADR-099): a fighting game's training menu over the game. Every situation of
// training.js for the boss loaded, by category; one click runs it (the runner plays the hero's side),
// the row shows ✓ / ✗ once it has played out. A banner over the fight names what is running.
// Keys while it is open: ↑ ↓ choose, Enter run, R replay, Esc stop (consumed: they never reach the
// game). Toggle: F4, the Lab's TRAINING button, or load with ?training. The stage and the boss are
// page reloads (`?stage=lab`, `?level=`), kept with ?training.

const styleId = 'abyss-training-style'; // (not an UPPER_CASE const: the glyph check reads those as glyph strings)
const CSS = `
.trn-root {
  position: absolute; right: 14px; top: 150px; z-index: 41; width: 340px; max-height: calc(100% - 170px);
  display: flex; flex-direction: column; pointer-events: auto; font: 11px/1.35 ui-monospace, Menlo, Consolas, monospace;
  color: #d6e4f0; background: linear-gradient(180deg, rgba(4, 12, 20, 0.92), rgba(4, 8, 14, 0.9));
  border: 1px solid rgba(110, 230, 255, 0.35); box-shadow: 0 0 24px rgba(40, 200, 255, 0.15), inset 0 0 0 1px rgba(0, 0, 0, 0.6);
  touch-action: pan-y; overscroll-behavior: contain;
}
.trn-root.trn-hidden { display: none; }
.trn-head { display: flex; align-items: baseline; gap: 8px; padding: 8px 10px 6px; border-bottom: 1px solid rgba(110, 230, 255, 0.25);
  background: repeating-linear-gradient(90deg, rgba(110, 230, 255, 0.07) 0 2px, transparent 2px 6px); }
.trn-title { font-size: 16px; font-weight: 800; letter-spacing: 0.3em; color: #8ff0ff; text-shadow: 0 0 10px rgba(110, 230, 255, 0.8); font-style: italic; }
.trn-sub { flex: 1; color: #7f93a8; font-size: 10px; letter-spacing: 0.08em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trn-x { background: none; border: 0; color: #7f93a8; font-size: 14px; cursor: pointer; padding: 0 2px; }
.trn-bar { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border-bottom: 1px solid rgba(110, 230, 255, 0.15); }
.trn-bar .lab-lbl, .trn-lbl { color: #6f8396; font-size: 9px; letter-spacing: 0.14em; align-self: center; margin-right: 2px; }
.trn-btn { flex: 0 0 auto; padding: 3px 7px; border: 1px solid rgba(110, 230, 255, 0.3); background: rgba(20, 40, 56, 0.6); color: #d6e4f0;
  font: inherit; font-size: 10px; cursor: pointer; border-radius: 2px; }
.trn-btn:hover { border-color: #8ff0ff; color: #fff; }
.trn-btn.on { background: rgba(110, 230, 255, 0.25); border-color: #8ff0ff; color: #fff; box-shadow: 0 0 8px rgba(110, 230, 255, 0.4); }
.trn-btn.big { padding: 4px 10px; font-weight: 700; }
.trn-list { flex: 1; overflow-y: auto; padding: 2px 0 6px; min-height: 120px; }
.trn-cat { padding: 7px 10px 3px; color: #ffd27a; font-size: 10px; font-weight: 800; letter-spacing: 0.22em; cursor: pointer; user-select: none; }
.trn-cat::before { content: '▾ '; color: #8a6d36; }
.trn-cat.shut::before { content: '▸ '; }
.trn-row { display: flex; gap: 6px; align-items: center; padding: 3px 10px 3px 16px; cursor: pointer; border-left: 2px solid transparent; }
.trn-row:hover { background: rgba(110, 230, 255, 0.08); }
.trn-row.sel { background: linear-gradient(90deg, rgba(110, 230, 255, 0.28), rgba(110, 230, 255, 0.04)); border-left-color: #8ff0ff; color: #fff; }
.trn-row.run .trn-n { color: #8ff0ff; animation: trn-pulse 0.5s ease-in-out infinite alternate; }
.trn-n { width: 22px; color: #5d7184; font-size: 10px; text-align: right; }
.trn-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trn-res { width: 12px; font-weight: 800; text-align: center; }
.trn-res.ok { color: #7dffa8; }
.trn-res.bad { color: #ff6a55; }
.trn-tell { width: 6px; height: 6px; border-radius: 50%; background: #f2ead8; opacity: 0.8; }
.trn-tell.blue { background: #5fb4ff; }
.trn-tell.red { background: #ff4a3a; }
.trn-desc { padding: 7px 10px; border-top: 1px solid rgba(110, 230, 255, 0.2); color: #b9c8d6; min-height: 44px; background: rgba(0, 0, 0, 0.25); }
.trn-desc b { color: #8ff0ff; font-weight: 700; }
.trn-banner { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); z-index: 39; pointer-events: none; text-align: center;
  font: 800 13px/1.2 ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.28em; color: #e8fbff; opacity: 0; transition: opacity 0.2s; }
.trn-banner.on { opacity: 1; }
.trn-banner .k { display: block; font-size: 9px; color: #ffd27a; letter-spacing: 0.34em; margin-bottom: 2px; }
.trn-banner .t { display: inline-block; padding: 4px 16px; background: linear-gradient(90deg, rgba(6, 30, 44, 0), rgba(6, 30, 44, 0.85) 20%, rgba(6, 30, 44, 0.85) 80%, rgba(6, 30, 44, 0));
  text-shadow: 0 0 10px rgba(110, 230, 255, 0.9); }
.trn-banner .r { display: block; margin-top: 3px; font-size: 10px; letter-spacing: 0.2em; }
.trn-banner .r.ok { color: #7dffa8; }
.trn-banner .r.bad { color: #ff8a70; }
.trn-open { position: absolute; right: 14px; top: 150px; z-index: 41; pointer-events: auto; padding: 4px 10px; border: 1px solid rgba(110, 230, 255, 0.5);
  background: rgba(4, 12, 20, 0.85); color: #8ff0ff; font: 800 10px ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.24em; cursor: pointer; }
@keyframes trn-pulse { from { opacity: 0.4; } to { opacity: 1; } }
@media (max-width: 700px) { .trn-root { width: min(330px, calc(100vw - 12px)); right: 6px; top: 90px; max-height: calc(100% - 100px); } }
`;

const SPEEDS = [1, 0.5, 0.25, 0.1];

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById?.(styleId)) return;
  const s = document.createElement('style');
  s.id = styleId;
  s.textContent = CSS;
  (document.head ?? document.body)?.appendChild(s);
}

function urlHas(key) {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').has(key);
  } catch {
    return false;
  }
}

/** The URL with `params` set (null deletes), `?training` kept. */
function urlWith(params) {
  const u = new URL(globalThis.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null) u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  u.searchParams.set('training', '');
  return u.toString().replace('training=&', 'training&').replace(/training=$/, 'training');
}

export class TrainingPanel {
  constructor(game, lab) {
    this.game = game;
    this.lab = lab;
    this.T = lab.training;
    this.open = false;
    this.root = null;
    this.sel = 0;
    this.rows = [];
    this.shut = new Set();
    this.results = new Map(); // id → ok
    this.T.onChange = () => this.refresh();
    this._onKey = (e) => {
      try {
        this._key(e);
      } catch (err) {
        console.error('[training] key handler failed', err);
      }
    };
    if (typeof addEventListener === 'function') addEventListener('keydown', this._onKey, true);
    if (urlHas('training')) this.setOpen(true);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(on) {
    on = !!on;
    if (on && !this.root) this._build();
    if (!this.root) return;
    this.open = on;
    setClass(this.root, 'trn-hidden', !on);
    setClass(this.pill, 'trn-hidden', on);
    if (on) this._fill();
  }

  // ---------------------------------------------------------------- build
  _build() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    try {
      injectStyle();
      const host = document.getElementById?.('ui') ?? document.body;
      if (!host) return;
      this.banner = el('div', 'trn-banner', null, host);
      this.bK = el('span', 'k', '', this.banner);
      this.bT = el('span', 't', '', this.banner);
      this.bR = el('span', 'r', '', this.banner);
      this.pill = el('button', 'trn-open trn-hidden', 'TRAINING', host);
      this.pill.addEventListener('click', () => this.setOpen(true));
      const root = el('div', 'trn-root trn-hidden', null, host);
      this.root = root;
      root.addEventListener('contextmenu', (e) => e.preventDefault?.());
      const head = el('div', 'trn-head', null, root);
      el('span', 'trn-title', 'TRAINING', head);
      this.sub = el('span', 'trn-sub', '', head);
      const x = el('button', 'trn-x', '×', head);
      x.addEventListener('click', () => this.setOpen(false));
      x.title = 'close (F4)';

      // play controls
      const bar = el('div', 'trn-bar', null, root);
      this._btn(bar, '◀', () => this._step(-1)).title = 'previous situation (↑)';
      this._btn(bar, '▶ PLAY', () => this._play(), 'big').title = 'run the selected situation (Enter)';
      this._btn(bar, '↻', () => this.T.replay()).title = 'replay (R)';
      this._btn(bar, '■', () => this.T.stop()).title = 'stop (Esc)';
      this._btn(bar, '▶', () => this._step(1)).title = 'next situation (↓)';
      this.loopBtn = this._btn(bar, 'LOOP', () => {
        this.T.loop = !this.T.loop;
        this.refresh();
      });
      this.loopBtn.title = 'replay the situation again and again';
      // speed
      const sp = el('div', 'trn-bar', null, root);
      el('span', 'trn-lbl', 'SPEED', sp);
      this.speedBtns = SPEEDS.map((v) => ({ v, b: this._btn(sp, v === 1 ? '×1' : `×${v}`, () => this.lab.setTimeScale(v)) }));
      // the answer to a boss move
      const an = el('div', 'trn-bar', null, root);
      el('span', 'trn-lbl', 'ANSWER', an);
      this.answerBtns = ['parry', 'perfect', 'block', 'dodge', 'roll', 'none'].map((k) => ({
        k, b: this._btn(an, ANSWERS[k].label.replace('Perfect parry', 'Perfect').replace('Perfect dodge', 'P.dodge').replace('Dodge (early)', 'Dodge'), () => {
          this.T.moveAnswer = k;
          this.refresh();
        }),
      }));
      // the stage and the boss (page reloads)
      const st = el('div', 'trn-bar', null, root);
      el('span', 'trn-lbl', 'STAGE', st);
      const stage = new URLSearchParams(globalThis.location?.search ?? '').get('stage');
      const room = this._btn(st, 'Training room', () => globalThis.location?.assign?.(urlWith({ stage: 'lab' })));
      room.title = 'this boss in the training room: a cyan measuring grid, rings at 3 / 6 / 9 / 12 m';
      setClass(room, 'on', stage === 'lab');
      const lv = this._btn(st, 'Level set', () => globalThis.location?.assign?.(urlWith({ stage: null })));
      setClass(lv, 'on', stage !== 'lab');
      const bs = el('div', 'trn-bar', null, root);
      el('span', 'trn-lbl', 'BOSS', bs);
      for (const L of this.game.levels ?? []) {
        const b = this._btn(bs, L.name.replace(/^The /, '').replace(' Courtyard', '').replace(' Hollow', ''), () => globalThis.location?.assign?.(urlWith({ level: L.id })));
        setClass(b, 'on', L.id === this.game.level?.id);
      }

      this.list = el('div', 'trn-list', null, root);
      this.desc = el('div', 'trn-desc', '', root);
    } catch (err) {
      console.error('[training] panel build failed', err);
      this.root?.remove?.();
      this.root = null;
    }
  }

  _btn(parent, label, fn, cls = '') {
    return button(parent, label, fn, `trn-btn ${cls}`.trim());
  }

  /** (Re)build the list for the boss loaded. */
  _fill() {
    const L = this.T.list();
    this.items = L;
    this.list.textContent = '';
    this.rows = [];
    const lvl = this.game.level;
    setText(this.sub, `${this.game.dragon?.name ?? lvl?.name ?? ''} · ${L.length} situations`);
    let n = 0;
    for (const cat of CATEGORIES) {
      const items = L.filter((s) => s.cat === cat);
      if (!items.length) continue;
      const h = el('div', 'trn-cat', `${cat}  (${items.length})`, this.list);
      setClass(h, 'shut', this.shut.has(cat));
      const box = el('div', '', null, this.list);
      box.style.display = this.shut.has(cat) ? 'none' : '';
      h.addEventListener('click', () => {
        if (this.shut.has(cat)) this.shut.delete(cat);
        else this.shut.add(cat);
        setClass(h, 'shut', this.shut.has(cat));
        box.style.display = this.shut.has(cat) ? 'none' : '';
      });
      for (const s of items) {
        const i = L.indexOf(s);
        const r = el('div', 'trn-row', null, box);
        el('span', 'trn-n', String(++n), r);
        if (s.tell) el('span', `trn-tell ${s.tell}`, null, r);
        el('span', 'trn-name', s.name, r);
        const res = el('span', 'trn-res', '', r);
        r.addEventListener('click', () => {
          this.sel = i;
          this._play();
        });
        r.addEventListener('mouseenter', () => this._describe(s));
        this.rows[i] = { r, res, s };
      }
    }
    this.sel = Math.min(this.sel, Math.max(0, L.length - 1));
    this.refresh();
  }

  _describe(s) {
    if (!this.desc || !s) return;
    this.desc.textContent = '';
    el('b', '', s.name, this.desc);
    el('div', '', s.desc ?? '', this.desc);
  }

  _play() {
    const s = this.items?.[this.sel];
    if (s) this.T.run(s.id);
  }

  _step(dir) {
    const n = this.items?.length ?? 0;
    if (!n) return;
    this.sel = (this.sel + dir + n) % n;
    this._play();
  }

  /** Rows, buttons and the banner, from the runner's state. */
  refresh() {
    const T = this.T, cur = T.cur;
    if (T.lastResult) this.results.set(T.lastResult.id, T.lastResult.ok);
    if (this.root && this.items) {
      if (cur) {
        const i = this.items.findIndex((s) => s.id === cur.id);
        if (i >= 0) this.sel = i;
      }
      for (const [i, row] of this.rows.entries()) {
        if (!row) continue;
        setClass(row.r, 'sel', i === this.sel);
        setClass(row.r, 'run', T.running && cur?.id === row.s.id);
        const ok = this.results.get(row.s.id);
        setText(row.res, ok === undefined ? '' : ok ? '✓' : '✗');
        setClass(row.res, 'ok', ok === true);
        setClass(row.res, 'bad', ok === false);
      }
      const selRow = this.rows[this.sel];
      if (selRow) {
        this._describe(selRow.s);
        selRow.r.scrollIntoView?.({ block: 'nearest' });
      }
      setClass(this.loopBtn, 'on', T.loop);
      const ts = this.game.debugTimeScale ?? 1;
      for (const { v, b } of this.speedBtns ?? []) setClass(b, 'on', Math.abs(ts - v) < 1e-3);
      for (const { k, b } of this.answerBtns ?? []) setClass(b, 'on', T.moveAnswer === k);
    }
    // the banner over the fight
    if (this.banner) {
      const show = !!cur && (T.running || T.ph === 'done');
      setClass(this.banner, 'on', show);
      if (show) {
        setText(this.bK, cur.cat);
        setText(this.bT, cur.name.toUpperCase());
        const r = T.ph === 'done' && T.lastResult?.id === cur.id ? T.lastResult : null;
        setText(this.bR, r ? (r.ok ? `✓ ${r.secs} s` : `✗ not seen: ${r.missing.join(', ')}`) : T.ph === 'run' ? '' : '· · ·');
        setClass(this.bR, 'ok', !!r?.ok);
        setClass(this.bR, 'bad', !!r && !r.ok);
      }
    }
  }

  _key(e) {
    if (e.code === 'F4') {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      this.toggle();
      return;
    }
    if (!this.open || e.repeat) return;
    let used = true;
    if (e.code === 'ArrowDown') {
      this.sel = (this.sel + 1) % Math.max(1, this.items?.length ?? 1);
      this.refresh();
    } else if (e.code === 'ArrowUp') {
      const n = Math.max(1, this.items?.length ?? 1);
      this.sel = (this.sel - 1 + n) % n;
      this.refresh();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') this._play();
    else if (e.code === 'KeyR') this.T.replay();
    else if (e.code === 'Escape' && this.T.running) this.T.stop();
    else used = false;
    if (used) {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
    }
  }
}
