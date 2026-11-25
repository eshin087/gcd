import { GAME_VERSION, RELEASES, entryId } from './changelog.js';
import { button, el } from './dom.js';

// The WHAT'S NEW panel (contract: docs/ARCHITECTURE.md → HUD → What's new; ADR-115). Opened from the
// title screen and the pause menu; lists every release in ui/changelog.js, newest first, and tags the
// entries this browser has not seen with NEW. Closing it marks them all read (localStorage, key
// SEEN_KEY: the ids read so far). On a first visit only the newest day's entries count as new.
// Esc, the pad's B / Menu or BACK close it (Esc never reaches the pause toggle behind it). While it is
// open the title screen does not start the game. Badges elsewhere read unseenCount() and listen with
// onChange().

const SEEN_KEY = 'gcd.whatsnew.seen';

export class ChangelogPanel {
  constructor(game, parent, releases = RELEASES) {
    this.game = game;
    this.releases = Array.isArray(releases) ? releases : [];
    this.on = false;
    this._listeners = [];
    this.ids = [];
    for (const r of this.releases) for (const e of r.entries ?? []) this.ids.push(entryId(e));
    this.seen = this._load();

    this.root = el('div', 'ab-news', null, parent);
    const panel = el('div', 'ab-news-panel ab-panel', null, this.root);
    this.panel = panel;
    const head = el('div', 'ab-news-head', null, panel);
    el('div', 'ab-pause-title', "WHAT'S NEW", head);
    el('div', 'ab-news-ver', `gcd v${GAME_VERSION}`, head);
    this.list = el('div', 'ab-news-list', null, panel);
    this.rows = []; // { id, row }
    this._build();
    const foot = el('div', 'ab-news-foot', null, panel);
    this.btnBack = button(foot, 'primary', () => this.close());
    this.btnBack.textContent = 'BACK';

    if (typeof addEventListener === 'function') {
      addEventListener('keydown', (e) => this._guard(() => this._onKey(e)), true);
    }
  }

  _build() {
    for (const r of this.releases) {
      const sec = el('div', 'ab-news-rel', null, this.list);
      const h = el('div', 'ab-news-relhead', null, sec);
      el('span', 'v', r.version ? `v${r.version}` : String(r.label ?? 'LATEST'), h);
      if (r.date) el('span', 'd', String(r.date), h);
      if (r.summary) el('div', 'ab-news-sum', String(r.summary), sec);
      for (const e of r.entries ?? []) {
        const id = entryId(e);
        const row = el('div', 'ab-news-entry', null, sec);
        const t = el('div', 'ab-news-title', null, row);
        el('span', 'new', 'NEW', t);
        el('span', 'n', String(e.title ?? ''), t);
        if (e.date) el('span', 'd', String(e.date).slice(5), t);
        const ul = el('ul', 'ab-news-notes', null, row);
        for (const n of e.notes ?? []) el('li', '', String(n), ul);
        this.rows.push({ id, row });
      }
    }
    this._mark();
  }

  /** Entries this browser has not read yet. */
  unseenCount() {
    let n = 0;
    for (const id of this.ids) if (!this.seen.has(id)) n++;
    return n;
  }

  /** fn() runs whenever the unseen count may have changed (the panel was read). */
  onChange(fn) {
    if (typeof fn === 'function') this._listeners.push(fn);
  }

  open() {
    if (this.on) return;
    this.on = true;
    this._mark();
    this.root.classList.add('on');
    this.game?.hud?.pauseUi?.root?.classList?.add('news');
    this.list.scrollTop = 0;
  }

  /** Close and mark everything read. */
  close() {
    if (!this.on) return;
    this.on = false;
    this.root.classList.remove('on');
    this.game?.hud?.pauseUi?.root?.classList?.remove('news');
    this.markAllSeen();
  }

  toggle() {
    if (this.on) this.close();
    else this.open();
  }

  markAllSeen() {
    let changed = false;
    for (const id of this.ids) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      changed = true;
    }
    if (!changed) return;
    this._save();
    this._mark();
    for (const fn of this._listeners) this._guard(fn);
  }

  /** Scroll the list by `px` (the pad's stick / D-pad). */
  scroll(px) {
    if (!Number.isFinite(px)) return;
    this.list.scrollTop += px;
  }

  _mark() {
    for (const r of this.rows) r.row.classList.toggle('unseen', !this.seen.has(r.id));
  }

  _onKey(e) {
    if (!this.on) return;
    if (e?.code === 'Escape') {
      e.preventDefault?.();
      e.stopImmediatePropagation?.(); // Esc closes this panel, not the pause menu or the title
      e.stopPropagation?.();
      this.close();
    }
  }

  _load() {
    let ids = null;
    try {
      const v = JSON.parse(globalThis.localStorage?.getItem?.(SEEN_KEY) ?? 'null');
      if (Array.isArray(v)) ids = v.filter((s) => typeof s === 'string');
    } catch {
      /* no storage / a broken entry: a first visit */
    }
    if (ids) return new Set(ids);
    // first visit: everything is read except the newest day's work
    const newest = this.releases[0]?.entries?.[0]?.date;
    const seen = new Set();
    for (const r of this.releases) for (const e of r.entries ?? []) if (e.date !== newest) seen.add(entryId(e));
    return seen;
  }

  _save() {
    try {
      globalThis.localStorage?.setItem?.(SEEN_KEY, JSON.stringify([...this.seen]));
    } catch {
      /* private mode: read for this page only */
    }
  }

  _guard(fn) {
    try {
      fn();
    } catch (err) {
      console.error('[hud] changelog panel failed', err);
    }
  }
}
