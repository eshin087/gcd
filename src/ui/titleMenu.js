import { GAME_VERSION } from './changelog.js';
import { button, controlsGrid, el, fillKeyText, tellLegend, touchGrid } from './dom.js';
import { bossNames } from './bossName.js';
import { formatTime } from '../game/records.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { GCD_LOGO } from './gcdLogo.js';
import { injectTitleMenuStyle } from './titleMenuStyle.js';

// The title's new layouts (`?menu=a|b|c`; options for the owner, none is the default yet: with no
// parameter the title is drawn as before, ui/screens.js). The stage picker becomes the fires the
// sword can reach: every level is a world with its bonfire and its keeper (the boss).
//
//   a  the world list: a numbered list of worlds beside a detail panel for the one in focus
//   b  the campfire grid: one framed card per world, a strip under it for the one in focus
//   c  the sword's path: the worlds as fires along one line, the one in focus opened under it
//
// One selection drives all three: the mouse's hover, the pad's focus or the arrow keys pick the world
// shown in detail; a click / tap / A / Enter on the selected entry acts on it (travel there, or begin at
// the current fire). A click or a tap acts at once: only a mouse's hover (or a keyboard's focus)
// selects, never a touch, since iOS Safari takes a tap whose hover changes the page as a hover alone
// and wants a second tap for the click (the owner's two taps to begin; ADR-270).

const MENUS = ['a', 'b', 'c'];

/** The layout asked for by `?menu=` ('a' | 'b' | 'c'), or null: the title as before. */
export function menuNow() {
  const v = lookOf('menu', '0');
  return MENUS.includes(v) ? v : null;
}

// a small fire for each world: lit at the current world (three frames, stepped on the title's clock),
// cold embers elsewhere
const FIRE_LIT = [
  ['   (   ', '  ) )  ', ' ( ( ) ', ' ═╩═╩═ '],
  ['   )   ', '  ( (  ', ' ) ) ( ', ' ═╩═╩═ '],
  ['  (    ', '   ) ) ', ' ( ( ) ', ' ═╩═╩═ '],
];
const FIRE_COLD = ['       ', '       ', '   ·   ', ' ═╩═╩═ '];
const FIRE_HZ = 5;
const HEAD = 'FIRES THE SWORD CAN REACH';

const gradeClass = (g) => `gr-${String(g ?? '').toLowerCase()}`;
const two = (n) => String(n).padStart(2, '0');

export class TitleMenu {
  /** screen: the TitleScreen (its `stageButtons` / `navButtons` / `newsButton` are filled here).
   *  stage: { levels: [{ id, name, sub, boss }], current, pick(id), begin() }; news: the WHAT'S NEW
   *  panel; records: { bestFor(id), startRush() }. */
  constructor(screen, root, look, stage, news, records) {
    this.screen = screen;
    this.root = root;
    this.look = look;
    this.stage = stage;
    this.records = records;
    this.current = stage?.current ?? null;
    this.worlds = (stage?.levels ?? []).map((L, i) => ({ ...L, n: i + 1, names: bossNames(L.boss) }));
    this.entries = []; // { id, kind: 'world' | 'rush' | 'news' | 'ctrl', btn, ... }
    this.sel = null; // the id shown in detail
    this._ate = new Set(); // key codes this frame's menu used (not a "press any key")
    this.fireT = 0;
    this.fireF = 0;
    this._fires = []; // [pre, lit] the small fires to step
    injectTitleMenuStyle();

    const R = root;
    // the corner: WHAT'S NEW and CONTROLS (a: under the list instead)
    const top = el('div', 'gm-top', null, R);
    this.logo = el('pre', 'ab-logo gm-logo', GCD_LOGO.join('\n'), top);
    this.cornerEl = el('div', 'gm-corner', null, top);
    this.body = el('div', `gm-body gm-scroll`, null, R);
    if (look === 'a') this._buildList();
    else if (look === 'b') this._buildGrid();
    else this._buildPath();
    this._buildExtras(news);
    const foot = el('div', 'gm-foot', null, R);
    el('div', 'ab-press gm-press kb-only', 'PRESS ANY KEY', foot);
    el('div', 'ab-press gm-press tp-only', 'TAP TO BEGIN', foot);
    el('div', 'ab-press gm-press pad-only', 'PRESS ANY BUTTON', foot);
    el('div', 'ab-credit gm-credit', `prototype v${GAME_VERSION}`, R);
    this._buildDrawer();

    // the lists the gamepad and the old tests read (ui/gamepad.js): worlds then the rush, as before;
    // navButtons = every entry in reading order, walked in two dimensions (navigate)
    screen.stageButtons = this.entries.filter((e) => e.kind === 'world' || e.kind === 'rush').map((e) => e.btn);
    screen.navButtons = this.entries.map((e) => e.btn);
    screen.newsButton = null; // (in navButtons already)
    this.select(this.current, true);
    this.refresh();

    // the arrow keys walk, Enter acts; read here and marked eaten so the flow's "press any key" skips them
    this._onKey = (e) => this._key(e);
    globalThis.addEventListener?.('keydown', this._onKey);
  }

  // ------------------------------------------------------------------ build
  _entry(parent, kind, id, cls, act) {
    const b = button(parent, `gm-e gm-${kind} ${cls}`.trim(), () => this._click(id, act));
    b.dataset.level = id;
    b.addEventListener('pointerenter', (e) => {
      if (e?.pointerType === 'mouse') this.select(id);
    });
    b.addEventListener('focus', () => {
      if (b.matches?.(':focus-visible')) this.select(id);
    });
    const E = { id, kind, btn: b, act };
    this.entries.push(E);
    return E;
  }

  /** a: a numbered list of worlds; the detail panel beside it (under it, upright). */
  _buildList() {
    const wrap = el('div', 'gm-a-wrap', null, this.body);
    const col = el('div', 'gm-col', null, wrap);
    el('div', 'gm-head', HEAD, col);
    const list = el('div', 'gm-list', null, col);
    this.listEl = list;
    for (const W of this.worlds) {
      const E = this._entry(list, 'world', W.id, W.id === this.current ? 'on' : '', () => this._world(W.id));
      el('span', 'gm-n', two(W.n), E.btn);
      el('span', 'gm-name', String(W.name).toUpperCase(), E.btn);
      E.grade = el('span', 'gm-g', '', E.btn);
      E.here = W.id === this.current ? el('span', 'gm-here', '◆', E.btn) : null;
    }
    this.xList = el('div', 'gm-xlist', null, list);
    this.detail = el('div', 'gm-detail', null, wrap);
  }

  /** b: one framed card per world; the strip for the one in focus under the grid. */
  _buildGrid() {
    el('div', 'gm-head', HEAD, this.body);
    const grid = el('div', 'gm-grid', null, this.body);
    for (const W of this.worlds) {
      const lit = W.id === this.current;
      const E = this._entry(grid, 'world', W.id, `gm-card${lit ? ' on' : ''}`, () => this._world(W.id));
      const fire = el('pre', `gm-fire${lit ? ' lit' : ''}`, '', E.btn);
      this._fires.push([fire, lit]);
      const txt = el('span', 'gm-ctext', null, E.btn);
      const head = el('span', 'gm-chead', null, txt);
      el('span', 'gm-n', two(W.n), head);
      E.grade = el('span', 'gm-g', '', head);
      el('span', 'gm-name', String(W.name).toUpperCase(), txt);
      el('span', 'gm-boss', W.names.short, txt);
      E.time = el('span', 'gm-t', '', txt);
    }
    this.detail = el('div', 'gm-detail gm-strip', null, this.body);
    this.xList = el('div', 'gm-xlist', null, this.body);
  }

  /** c: the worlds as fires on one line (a column, upright); the one in focus opens under it. */
  _buildPath() {
    el('div', 'gm-head', HEAD, this.body);
    const path = el('div', 'gm-path', null, this.body);
    this.pathEl = path;
    for (const W of this.worlds) {
      const lit = W.id === this.current;
      const E = this._entry(path, 'world', W.id, `gm-node${lit ? ' on' : ''}`, () => this._world(W.id));
      const fire = el('pre', `gm-fire${lit ? ' lit' : ''}`, '', E.btn);
      this._fires.push([fire, lit]);
      el('span', 'gm-mark', lit ? '◆' : '◇', E.btn);
      const txt = el('span', 'gm-ntext', null, E.btn);
      el('span', 'gm-n', two(W.n), txt);
      el('span', 'gm-name', String(W.name).replace(/^The /, '').toUpperCase(), txt);
      E.grade = el('span', 'gm-g', '', txt);
    }
    // one panel (ADR-270, the owner's call): the world in focus on the left, its button and BOSS RUSH
    // stacked on the right (the rush is an entry of its own there, kept across re-draws)
    this.detail = el('div', 'gm-detail gm-open', null, this.body);
    this.infoEl = el('div', 'gm-info', null, this.detail);
    this.xList = el('div', 'gm-acts', null, this.detail);
    this.actSlot = el('div', 'gm-actslot', null, this.xList);
  }

  /** BOSS RUSH, WHAT'S NEW and CONTROLS: under the list (a), the rush under the grid / path and the
   *  other two in the top corner (b, c). */
  _buildExtras(news) {
    const R = this.records;
    if (R?.startRush) {
      const E = this._entry(this.xList, 'rush', 'rush', 'gm-x', () => R.startRush());
      el('span', 'gm-remb', '◆', E.btn);
      const tx = el('span', 'gm-rtx', null, E.btn);
      el('span', 'gm-name', 'BOSS RUSH', tx);
      el('span', 'gm-sub', 'every keeper, one clock', tx);
      E.grade = el('span', 'gm-g', '', E.btn);
      el('span', 'gm-chev', '›', E.btn);
      this.rushButton = E.btn;
      this.screen.rushButton = E.btn;
    }
    const host = this.look === 'a' ? el('div', 'gm-xrow', null, this.xList) : this.cornerEl;
    if (news) {
      const E = this._entry(host, 'news', 'news', 'gm-x gm-small', () => news.open());
      el('span', 'gm-name', "WHAT'S NEW", E.btn);
      this.newsBadge = el('span', 'ab-news-badge', '', E.btn);
      const sync = () => {
        const n = news.unseenCount();
        const on = Number.isFinite(n) && n > 0;
        this.newsBadge.textContent = on ? `${n} NEW` : '';
        this.newsBadge.classList.toggle('on', on);
      };
      news.onChange(sync);
      sync();
      this.news = news;
    }
    const C = this._entry(host, 'ctrl', 'ctrl', 'gm-x gm-small', () => this.drawer(!this.drawerOn));
    el('span', 'gm-name', 'CONTROLS', C.btn);
    this.ctrlButton = C.btn;
  }

  /** CONTROLS: every device's controls and the tell legend (the lists the old title showed, in full). */
  _buildDrawer() {
    const D = el('div', 'gm-drawer', null, this.root);
    D.addEventListener('click', (e) => {
      if (e.target === D) this.drawer(false);
    });
    const P = el('div', 'gm-dpanel ab-panel gm-scroll', null, D);
    const head = el('div', 'gm-dhead', null, P);
    el('span', '', 'CONTROLS', head);
    const close = button(head, 'gm-close', () => this.drawer(false));
    el('span', '', 'CLOSE', close);
    controlsGrid(P, 'kb').classList.add('kb-only');
    controlsGrid(P, 'pad').classList.add('pad-only');
    touchGrid(P).classList.add('tp-only');
    el('div', 'gm-dsub', 'ATTACK TELLS', P);
    tellLegend(P);
    this.drawerEl = D;
    this.drawerOn = false;
  }

  drawer(on) {
    this.drawerOn = !!on;
    this.drawerEl.classList.toggle('on', this.drawerOn);
  }

  // ------------------------------------------------------------------ records
  _best(id) {
    try {
      return this.records?.bestFor?.(id) ?? null;
    } catch {
      return null;
    }
  }

  /** Every entry's grade (and time on a card), then the detail; call again when a record is saved. */
  refresh() {
    for (const E of this.entries) {
      if (!E.grade) continue;
      const b = this._best(E.id);
      E.grade.textContent = b ? b.grade : '';
      E.grade.className = `gm-g ${b ? gradeClass(b.grade) : ''}`;
      E.btn.classList.toggle('has-best', !!b);
      if (E.time) E.time.textContent = b ? formatTime(b.timeMs) : '';
    }
    this._detail(true);
  }

  // ------------------------------------------------------------------ selection
  select(id, force = false) {
    if (id == null) return;
    if (id === this.sel && !force) return;
    if (!this.entries.some((E) => E.id === id)) return;
    this.sel = id;
    for (const E of this.entries) E.btn.classList.toggle('sel', E.id === id);
    this._detail(false);
  }

  /** The detail of the selection (the last world or the rush shown, if a news / controls entry is it). */
  _detail(force) {
    const id = this.sel === 'news' || this.sel === 'ctrl' ? this._shown ?? this.current : this.sel ?? this.current;
    if (id === this._shown && !force) return;
    this._shown = id;
    const D = this.infoEl ?? this.detail;
    if (!D) return;
    D.textContent = '';
    this._detailFire = null;
    if (id === 'rush') {
      const b = this._best('rush');
      const h = el('div', 'gm-dt', null, D);
      el('span', 'gm-dname', 'BOSS RUSH', h);
      el('div', 'gm-dsub2', `every keeper back to back, on one clock · ${this.worlds.length} fires`, D);
      this._recLine(D, b);
      if (this.actSlot) return; // (one panel: the rush's own button is beside the world's)
      const act = button(D, 'gm-act', () => this.records?.startRush?.());
      const row = el('span', 'gm-arow', null, act);
      el('span', 'gm-al', 'BEGIN THE RUSH', row);
      el('span', 'gm-chev', '›', row);
      return;
    }
    const W = this.worlds.find((w) => w.id === id);
    if (!W) return;
    const here = W.id === this.current;
    if (this.look === 'a') {
      this._detailFire = el('pre', `gm-fire big${here ? ' lit' : ''}`, '', D);
      this._paintFire(this._detailFire, here);
    }
    const h = el('div', 'gm-dt', null, D);
    el('span', 'gm-dn', two(W.n), h);
    el('span', 'gm-dname', String(W.name).toUpperCase(), h);
    if (here) el('span', 'gm-dhere', 'YOU ARE HERE', h);
    const k = el('div', 'gm-keeper', null, D);
    el('span', 'gm-kk', 'KEEPER ', k);
    el('span', 'gm-kn', W.names.short, k);
    el('span', 'gm-ke', `, ${W.names.title}`, k);
    el('div', 'gm-dsub2', W.sub ?? '', D);
    this._recLine(D, this._best(W.id));
    if (this.actSlot) this.actSlot.textContent = '';
    const act = button(this.actSlot ?? D, `gm-act${here ? '' : ' gm-travel'}`, () => this._world(W.id));
    const row = el('span', 'gm-arow', null, act);
    el('span', 'gm-al', here ? 'BEGIN HERE' : 'TRAVEL', row);
    el('span', 'gm-chev', '›', row);
    if (!here) el('span', 'gm-actsub', 'the sword opens the way', act);
  }

  _recLine(D, b) {
    const r = el('div', 'gm-rec', null, D);
    if (!b) {
      el('span', 'gm-ru', 'not yet beaten', r);
      return;
    }
    el('span', 'gm-rk', 'BEST ', r);
    el('span', `gm-rg ${gradeClass(b.grade)}`, b.grade, r);
    el('span', 'gm-rt', `  ${formatTime(b.timeMs)}`, r);
    if (b.marks?.length) el('span', 'gm-rm', `  ${b.marks.join(' · ')}`, r);
    if (b.clears) el('span', 'gm-rc', `  ·  ${b.clears} clear${b.clears === 1 ? '' : 's'}`, r);
  }

  // ------------------------------------------------------------------ acting
  /** A click acts at once: travel to that world, or begin at the current fire (the owner's call: no
   *  select-then-click-again, on a mouse or a touch). */
  _click(id, act) {
    this.select(id);
    act?.();
  }

  /** A world's action: begin at the current fire, else travel (the page reloads into it). */
  _world(id) {
    if (id === this.current) this.stage?.begin?.();
    else this.stage?.pick?.(id);
  }

  /** The entry from `el` in direction (dx, dy), by where the entries are drawn (reading order when
   *  nothing is laid out: the headless tests). */
  navigate(fromEl, dx, dy) {
    const list = this.entries.map((E) => E.btn).filter((b) => b && !b.closest?.('.gm-hide'));
    if (!list.length) return null;
    const i = list.indexOf(fromEl);
    if (i < 0) return list.find((b) => b.classList?.contains('sel')) ?? list[0];
    const rect = (b) => b.getBoundingClientRect?.() ?? null;
    const a = rect(fromEl);
    if (!a || !(a.width > 0)) return list[(i + (dx || dy) + list.length) % list.length];
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestD = Infinity, laidOut = false;
    for (const b of list) {
      if (b === fromEl) continue;
      const r = rect(b);
      if (!r || !(r.width > 0)) continue;
      const bx = r.left + r.width / 2, by = r.top + r.height / 2;
      if (Math.abs(bx - ax) + Math.abs(by - ay) > 1) laidOut = true;
      const along = dx ? (bx - ax) * dx : (by - ay) * dy;
      if (along <= 2) continue;
      const across = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
      // overlap on the cross axis (same row / column) is free; off it costs three times its distance,
      // and an entry far off to the side is not "that way" at all
      const ov = dx ? Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) : Math.min(a.right, r.right) - Math.max(a.left, r.left);
      if (ov <= 0 && across > along * 1.2) continue;
      const d = along + (ov > 0 ? 0 : across * 3);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best) return best;
    // down / up with nothing in line (the path's first fire over the rush): the nearest below / above
    if (dy && laidOut) {
      for (const b of list) {
        const r = b === fromEl ? null : rect(b);
        if (!r || !(r.width > 0)) continue;
        const along = (r.top + r.height / 2 - ay) * dy;
        if (along <= 2) continue;
        const d = along + Math.abs(r.left + r.width / 2 - ax);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) return best;
    }
    // nothing that way: stay; with nothing laid out (the headless tests) step along reading order
    return laidOut ? fromEl : list[(i + (dx || dy) + list.length) % list.length];
  }

  _key(e) {
    if (!e || !this.screen.visible) return;
    const code = e.code;
    if (this.news?.on) return;
    if (this.drawerOn) {
      if (code === 'Escape' || code === 'Enter' || code === 'Backspace') {
        this.drawer(false);
        this._ate.add(code);
      }
      return;
    }
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[code];
    if (dir) {
      const from = this.entries.find((E) => E.id === this.sel)?.btn ?? null;
      const to = this.navigate(from, dir[0], dir[1]);
      if (to) {
        this.select(to.dataset.level);
        to.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      this._ate.add(code);
      e.preventDefault?.();
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      // Enter on the current world (or nothing) is a "press any key": it begins
      if (!this.sel || this.sel === this.current) return;
      const E = this.entries.find((x) => x.id === this.sel);
      this._ate.add(code);
      E?.act?.();
    }
  }

  /** Did the menu use this key this frame (so it does not start the game)? */
  eats(code) {
    return this._ate.has(code);
  }

  // ------------------------------------------------------------------ per frame
  _paintFire(pre, lit) {
    if (!lit) {
      if (pre.dataset.cold !== '1') pre.textContent = FIRE_COLD.join('\n');
      pre.dataset.cold = '1';
      return;
    }
    // a lit fire: each row its own heat (the tips pale, the logs dark)
    const rows = FIRE_LIT[this.fireF % FIRE_LIT.length];
    pre.dataset.cold = '';
    if (pre.childNodes.length !== rows.length * 2 - 1) {
      pre.textContent = '';
      rows.forEach((r, i) => {
        if (i) pre.appendChild(document.createTextNode('\n'));
        el('span', `f${i}`, r, pre);
      });
      return;
    }
    for (let i = 0; i < rows.length; i++) pre.childNodes[i * 2].textContent = rows[i];
  }

  update(dt) {
    this._ate.clear();
    // the pad's focus is the selection
    const f = this.entries.find((E) => E.btn.classList?.contains('pad-focus'));
    if (f && f.id !== this.sel) {
      this.select(f.id);
      f.btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
    this.fireT += Number.isFinite(dt) ? dt : 0;
    if (this.fireT < 1 / FIRE_HZ && this._firesDrawn) return;
    this.fireT = 0;
    this.fireF++;
    this._firesDrawn = true;
    for (const [pre, lit] of this._fires) this._paintFire(pre, lit);
    if (this._detailFire) this._paintFire(this._detailFire, this._shown === this.current);
  }
}
