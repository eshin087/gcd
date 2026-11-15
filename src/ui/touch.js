import { CONFIG } from '../core/config.js';
import { el } from './dom.js';
import { injectTouchStyle } from './touchStyle.js';
import { aimWithoutCursor } from './aim.js';

// Touch controls for phones / tablets (contract: docs/ARCHITECTURE.md → Touch controls).
// A thin layer ON TOP of core/input.js: the left-thumb stick feeds input.setVirtualAxis(), the
// right-thumb buttons feed input.setVirtual(code, down) with the actions' virtual codes ('@attack',
// core/bindings.js: a keyboard remap never moves a touch button), so the player and flow keep
// reading the same actions and every edge (tap / hold / release) is the real device's:
//   stick → move (analog; pushed to the rim = @sprint)   ATTACK → @attack (tap light, hold the charged cleave)
//   BLOCK → @block (hold block, tap parry)   DODGE → @dodge   FLASK → @flask   LOCK → @lockOn   || → @pause
// ATTACK, BLOCK and DODGE are one cluster of three tiles that all touch (the pad, CONFIG.touch.pad):
// a touch on or near it goes to the nearest tile, and a thumb that slides from one tile onto another
// releases the first and presses the second without lifting. The player moves and sizes the cluster
// in the pause menu (PAD POSITION / PAD SIZE, kept in localStorage).
// Aim: in a fight with the dragon targetable (and within CONFIG.touch.autoAimRange) game.mouseGround
// is put on its lock point (auto-aim); otherwise it sits CONFIG.touch.aimDistance m ahead of the hero
// along the last stick direction. Taps on the bare screen dismiss "press any key" screens (title,
// death) as a virtual click; the HUD prompt ("[@interact] Rest", "... Fight again") is tappable. Two fingers
// on the bare screen pinch-zoom through cameraRig.zoom. Held upright (portrait) the game plays on:
// the stick and the pad sit in the lower part of the screen and the camera opens (ADR-097).
// Inert (no DOM, no state) until activated: `pointer: coarse` at boot, ?touch in the URL, or the
// first touch. ?touch=0 keeps it off. Desktop mouse + keyboard play never sees it.

const PLAY = new Set(['explore', 'bossIntro', 'boss']);
const TAP_DISMISS = new Set(['title', 'dead']);
const RING = 12; // glyphs around the stick: an ASCII-drawn circle, arrows at the four cardinals
const RING_R = 62; // px
const TAU = Math.PI * 2;
const CHARGE_CELLS = 6;
const SPRINT_OFF = 0.08; // hysteresis below sprintAt before the sprint drops

const BUTTONS = [
  { id: 'attack', code: '@attack', glyph: '†', label: 'ATTACK', tile: true },
  { id: 'block', code: '@block', glyph: '[#]', label: 'BLOCK', sub: 'tap: parry', tile: true },
  { id: 'dodge', code: '@dodge', glyph: '»', label: 'DODGE', tile: true },
  { id: 'flask', code: '@flask', glyph: '◆', label: 'FLASK' },
  { id: 'lock', code: '@lockOn', glyph: '◎', label: 'LOCK' },
  { id: 'pause', code: '@pause', glyph: '||', label: '' },
];

/** The stroke an ASCII artist draws a circle with at angle a (screen space, y down): its tangent. */
function ringGlyph(a) {
  const t = ((((Math.atan2(Math.cos(a), -Math.sin(a)) * 180) / Math.PI) % 180) + 180) % 180;
  return '-\\|/'[Math.round(t / 45) % 4];
}

function urlTouch() {
  try {
    const s = globalThis.location?.search;
    if (typeof s !== 'string') return null;
    const q = new URLSearchParams(s);
    if (!q.has('touch')) return null;
    const v = (q.get('touch') || '').toLowerCase();
    return !(v === '0' || v === 'false' || v === 'off');
  } catch {
    return null;
  }
}

function media(query) {
  try {
    return !!globalThis.matchMedia?.(query)?.matches;
  } catch {
    return false;
  }
}

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A CSS custom property on an element (a plain style object where there is no CSSOM: headless). */
const setVar = (node, name, v) => {
  const s = node?.style;
  if (!s) return;
  if (typeof s.setProperty === 'function') s.setProperty(name, v);
  else s[name] = v;
};

export const PAD_POS = ['low', 'mid', 'high'];
export const PAD_SIZE = ['s', 'm', 'l'];
const PAD_KEY = 'abyss.touchPad';
const GUARD_STEPS = 25; // the BLOCK tile's guard gauge is written in this many steps

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.forced = urlTouch(); // true / false from ?touch, null = automatic
    this.phone = false; // active and the short screen side ≤ CONFIG.camera.mobileMaxSide
    this.portrait = false;
    this.autoAim = false; // this frame's aim is on the dragon
    this.ui = null;
    this.buttons = [];
    this.stick = { id: null, ox: 0, oy: 0, mag: 0, sprint: false, lit: -2, on: false };
    this.aim = { x: 0, z: -1, set: false };
    this.pinch = new Map(); // pointerId → { x, y } (bare-screen fingers during play)
    this.pinchD0 = 0;
    this.pinchZ0 = 0;
    this.taps = new Map(); // pointerId → virtual code pressed by a bare-screen / prompt tap
    this._shown = null;
    this._w = -1;
    this._h = -1;
    this._qualitySet = false;
    this._v = game.THREE ? new game.THREE.Vector3() : { x: 0, y: 0, z: 0, copy() { return this; }, set() { return this; } };
    this._keys = { charge: -1, flask: -1, lock: null, guard: -1, low: null };
    // the pad: which tile each finger holds, where the cluster is, the player's placement
    this.padHeld = new Map(); // pointerId → button record
    this.padGeo = null; // { k, cx, cy, reach, stick, tiles: { id: [u0, v0, u1, v1] } } (px, client)
    this.padPos = 'mid';
    this.padSize = 'm';
    this._peek = false;
    this._loadPad();
    this._errors = 0;

    const on = (target, name, fn, opts) => target?.addEventListener?.(name, (e) => this._guard(name, fn, e), opts);
    if (typeof addEventListener === 'function') {
      on(globalThis, 'pointerdown', (e) => this._onDown(e));
      on(globalThis, 'pointermove', (e) => this._onMove(e));
      on(globalThis, 'pointerup', (e) => this._onUp(e));
      on(globalThis, 'pointercancel', (e) => this._onUp(e));
      on(globalThis, 'blur', () => this._releaseAll());
      // long-press menus / page pinch-zoom / scroll-bounce while the touch UI is on
      on(globalThis, 'contextmenu', (e) => this.active && e.preventDefault?.(), true);
    }
    on(globalThis.document, 'gesturestart', (e) => this.active && e.preventDefault?.());
    on(
      globalThis.document,
      'touchmove',
      (e) => {
        if (!this.active || e.target?.closest?.('.lab-root, .ab-pause-panel')) return; // scrollable panels
        if (e.cancelable !== false) e.preventDefault?.();
      },
      { passive: false },
    );

    if (this.forced ?? media('(pointer: coarse)')) this.setActive(true);
  }

  // ---------------------------------------------------------------- public
  /** Show / hide the touch UI (Lab button, tests, first touch). */
  setActive(on) {
    on = !!on;
    if (on === this.active) return;
    this.active = on;
    if (on) this._build();
    globalThis.document?.documentElement?.classList?.toggle('abyss-touch', on);
    this.game.hud?.root?.classList?.toggle('ab-touch', on);
    if (this.ui) this.ui.root.style.display = on ? '' : 'none';
    const s = this.game.settings;
    if (on && s && !this._qualitySet && s.quality === CONFIG.defaultQuality) {
      // touch devices start on the light preset (unless the player already picked one)
      s.quality = CONFIG.defaultQualityTouch;
      this._qualitySet = true;
      this._try(() => this.game.applyQuality?.(), 'applyQuality');
    } else if (!on && this._qualitySet && s?.quality === CONFIG.defaultQualityTouch) {
      s.quality = CONFIG.defaultQuality;
      this._qualitySet = false;
      this._try(() => this.game.applyQuality?.(), 'applyQuality');
    }
    if (!on) {
      this._releaseAll();
      this.portrait = false;
      this.phone = false;
      this.autoAim = false;
      this.game.cameraRig?.setMobile?.(false);
    }
    this._shown = null;
    this._layout(true);
  }

  /** Per frame (main.js, right after the mouse ray and before the Lab / flow / player). */
  update() {
    if (!this.active) return;
    const g = this.game;
    this._layout(false);
    const st = g.state;
    const play = PLAY.has(st);
    const live = play && !g.lab?.viewer?.active;
    if (live !== this._shown) {
      this._shown = live;
      this.ui?.root.classList.toggle('off', !live);
      if (!live) this._releaseControls();
    }
    // paused: the controls show through, inert, so PAD POSITION / PAD SIZE are seen as they change
    const peek = st === 'paused';
    if (peek !== this._peek) {
      this._peek = peek;
      this.ui?.root.classList.toggle('peek', peek);
    }
    if (play) this._aimUpdate();
    else this.autoAim = false;
    if (live) this._syncButtons();
  }

  /** Step the cluster's placement ('pos': low / mid / high) or its size ('size': s / m / l); kept. */
  cyclePad(what) {
    if (what === 'size') this.padSize = PAD_SIZE[(PAD_SIZE.indexOf(this.padSize) + 1) % PAD_SIZE.length];
    else this.padPos = PAD_POS[(PAD_POS.indexOf(this.padPos) + 1) % PAD_POS.length];
    try {
      globalThis.localStorage?.setItem?.(PAD_KEY, JSON.stringify({ pos: this.padPos, size: this.padSize }));
    } catch {
      /* private mode: the choice lasts for this page */
    }
    this._padLayout();
    if (this.stick.id === null) this._restStick();
    return what === 'size' ? this.padSize : this.padPos;
  }

  /** The screen point (client px) at the middle of a pad tile ('attack' / 'block' / 'dodge'), or null. */
  padPoint(id) {
    const G = this.padGeo, r = G?.tiles?.[id];
    return r ? { x: G.cx - (r[0] + r[2]) / 2, y: G.cy - (r[1] + r[3]) / 2 } : null;
  }

  _loadPad() {
    try {
      const o = JSON.parse(globalThis.localStorage?.getItem?.(PAD_KEY) ?? 'null');
      if (PAD_POS.includes(o?.pos)) this.padPos = o.pos;
      if (PAD_SIZE.includes(o?.size)) this.padSize = o.size;
    } catch {
      /* no storage / a broken entry: the defaults */
    }
  }

  // ---------------------------------------------------------------- aim
  _aimUpdate() {
    const T = CONFIG.touch;
    this.autoAim = aimWithoutCursor(this.game, this.aim, T.autoAimRange, T.aimDistance, this._v);
  }

  // ---------------------------------------------------------------- layout / visibility
  _layout(force) {
    const w = fin(globalThis.innerWidth, 1), h = fin(globalThis.innerHeight, 1);
    if (!force && w === this._w && h === this._h) return;
    this._w = w;
    this._h = h;
    if (!this.active) return;
    this.phone = Math.min(w, h) <= CONFIG.camera.mobileMaxSide;
    const portrait = h > w;
    this.game.cameraRig?.setMobile?.(this.phone, portrait);
    if (portrait !== this.portrait) {
      // the phone was turned: every control is somewhere else now, so nothing stays held
      this.portrait = portrait;
      this._releaseAll();
    }
    this._padLayout();
    if (this.stick.id === null) this._restStick();
  }

  /**
   * Place the cluster (CONFIG.touch.pad, the player's position and size) and keep its geometry for
   * the hit test: tiles as [u0, v0, u1, v1], u = px left of the cluster's right edge, v = px above
   * its bottom edge; (cx, cy) = that corner on screen.
   */
  _padLayout() {
    const P = CONFIG.touch.pad, u = this.ui;
    const w = fin(globalThis.innerWidth, 1), h = fin(globalThis.innerHeight, 1);
    const tall = h > 560 ? fin(P.tall, 1) : 1;
    const k = fin(P.size[this.padSize], 1) * tall;
    const places = (h > w && P.posPortrait) || P.pos;
    const pos = places[this.padPos] ?? places.mid;
    const px = pos[0] * tall, py = pos[1] * tall, reach = P.reach * k;
    const tiles = {};
    let W = 0, H = 0;
    for (const id in P.tiles) {
      const t = P.tiles[id];
      tiles[id] = [t.x * k, t.y * k, (t.x + t.w) * k, (t.y + t.h) * k];
      W = Math.max(W, tiles[id][2]);
      H = Math.max(H, tiles[id][3]);
    }
    this.padGeo = { k, cx: w - px, cy: h - py, reach, stick: P.stick * k, tiles };
    if (!u?.pad) return;
    const px2 = (v) => `${v.toFixed(1)}px`;
    const S = u.pad.style;
    S.right = px2(px - reach);
    S.bottom = px2(py - reach);
    S.width = px2(W + reach * 2);
    S.height = px2(H + reach * 2);
    setVar(u.root, '--tc-k', k.toFixed(3));
    for (const id in tiles) {
      const r = tiles[id], s = this.btn?.[id]?.el.style;
      if (!s) continue;
      s.right = px2(reach + r[0]);
      s.bottom = px2(reach + r[1]);
      s.width = px2(r[2] - r[0]);
      s.height = px2(r[3] - r[1]);
    }
    const f = P.flask, fs = this.btn?.flask?.el.style;
    if (f && fs) {
      fs.right = px2(px + f.x * k);
      fs.bottom = px2(py + f.y * k);
      fs.width = px2(f.w * k);
      fs.height = px2(f.h * k);
    }
  }

  /** The cluster's corner on screen from the laid-out element (safe areas, a host that is not the
   *  whole window); the computed one stands where there is no layout to ask (headless). */
  _padOrigin() {
    const G = this.padGeo, r = this._try(() => this.ui?.pad?.getBoundingClientRect?.(), 'padRect');
    if (!G || !r || !(r.width > 0) || !Number.isFinite(r.right) || !Number.isFinite(r.bottom)) return;
    G.cx = r.right - G.reach;
    G.cy = r.bottom - G.reach;
  }

  /**
   * The tile a finger at screen (x, y) is on. A finger that already holds `cur` keeps it until it
   * has left that tile by `stick` px; then, and for a new touch, the nearest tile takes it (a slide
   * that wanders further than `reach` from every tile keeps the one it holds).
   */
  _padPick(x, y, cur) {
    const G = this.padGeo;
    if (!G || !Number.isFinite(x) || !Number.isFinite(y)) return cur;
    const u = G.cx - x, v = G.cy - y;
    let best = null, bd = Infinity;
    for (const id in G.tiles) {
      const r = G.tiles[id], rec = this.btn?.[id];
      if (!rec) continue;
      const d = Math.hypot(Math.max(r[0] - u, 0, u - r[2]), Math.max(r[1] - v, 0, v - r[3]));
      if (rec === cur && d <= G.stick) return cur;
      if (d < bd) {
        bd = d;
        best = rec;
      }
    }
    return cur && bd > G.reach ? cur : best;
  }

  // ---------------------------------------------------------------- DOM
  _build() {
    if (this.ui || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    try {
      injectTouchStyle();
      const host = document.getElementById?.('ui') ?? document.body;
      if (!host) return;
      const root = el('div', 'tc-root off', null, host);
      root.addEventListener('contextmenu', (e) => e.preventDefault?.());

      // left thumb: capture zone + the floating ASCII stick
      const zone = el('div', 'tc-zone', null, root);
      const stick = el('div', 'tc-stick', null, root);
      el('div', 'tc-disc', null, stick);
      const ring = el('div', 'tc-ring', null, stick);
      const dots = [];
      for (let i = 0; i < RING; i++) {
        const a = (i / RING) * TAU;
        const card = (i * 4) % RING === 0 ? '>v<^'[(i * 4) / RING] : null;
        const d = el('span', card ? 'c' : '', card ?? ringGlyph(a), ring);
        d.style.left = `${(Math.cos(a) * RING_R).toFixed(1)}px`;
        d.style.top = `${(Math.sin(a) * RING_R).toFixed(1)}px`;
        dots.push(d);
      }
      el('div', 'tc-centre', '+', stick);
      const knob = el('div', 'tc-knob', '@', stick);
      const tag = el('div', 'tc-tag', 'MOVE', stick);

      // right thumb: the pad (one pointer surface under the three tiles) and the small buttons
      const pad = el('div', 'tc-pad', null, root);
      this.ui = { root, zone, stick, knob, tag, dots, pad };
      this._bindStick(zone);
      this.buttons = BUTTONS.map((def) => this._button(def.tile ? pad : root, def));
      this.btn = Object.fromEntries(this.buttons.map((b) => [b.def.id, b]));
      this._bindPad(pad);

      // the HUD prompt ("[@interact] Rest at bonfire") is a tap target on touch
      const prompt = this.game.hud?.promptEl;
      if (prompt?.addEventListener) {
        prompt.addEventListener('pointerdown', (e) => this._guard('prompt', () => this._promptDown(e), e));
        prompt.addEventListener('pointerup', (e) => this._guard('prompt', () => this._tapUp(e), e));
        prompt.addEventListener('pointercancel', (e) => this._guard('prompt', () => this._tapUp(e), e));
      }

      this._restStick();
    } catch (err) {
      this._report('build', err);
      this.ui?.root?.remove?.();
      this.ui = null;
    }
  }

  _button(root, def) {
    const b = el(def.tile ? 'div' : 'button', `tc-btn tc-${def.id}${def.tile ? ' tc-tile' : ''}`, null, root);
    if (!def.tile) {
      b.type = 'button';
      b.tabIndex = -1;
    }
    const g = el('span', 'g', def.glyph, b);
    const t = def.label ? el('span', 't', def.label, b) : null;
    if (def.sub) el('span', 's', def.sub, b);
    const rec = { def, el: b, g, t, ids: new Set() };
    if (def.tile) return rec; // the pad owns its tiles' pointers (_bindPad)
    const down = (e) => {
      e.preventDefault?.(); // no compatibility mouse events, no focus, no text selection
      if (!this._live() || rec.ids.has(e.pointerId)) return;
      try {
        b.setPointerCapture?.(e.pointerId);
      } catch {
        /* synthetic pointer: capture is a nicety */
      }
      this._press(rec, e.pointerId);
    };
    const up = (e) => this._release(rec, e.pointerId);
    b.addEventListener('pointerdown', (e) => this._guard(def.id, down, e));
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(n, (e) => this._guard(def.id, up, e));
    b.addEventListener('contextmenu', (e) => e.preventDefault?.());
    b.addEventListener('click', (e) => e.preventDefault?.());
    return rec;
  }

  /** A finger takes a button: lit, and its action goes down with the first finger on it. */
  _press(rec, id) {
    if (rec.ids.has(id)) return;
    rec.ids.add(id);
    if (rec.ids.size !== 1) return;
    rec.el.classList.add('on');
    this.game.input?.setVirtual?.(rec.def.code, true);
  }

  /** A finger leaves a button: its action goes up with the last finger off it. */
  _release(rec, id) {
    if (!rec.ids.delete(id) || rec.ids.size) return;
    rec.el.classList.remove('on');
    this.game.input?.setVirtual?.(rec.def.code, false);
  }

  /** The pad: every touch on it holds the nearest tile, and follows the thumb from tile to tile. */
  _bindPad(pad) {
    const held = this.padHeld;
    pad.addEventListener('pointerdown', (e) =>
      this._guard('pad', () => {
        e.preventDefault?.();
        if (!this._live() || held.has(e.pointerId)) return;
        try {
          pad.setPointerCapture?.(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        this._padOrigin();
        const rec = this._padPick(fin(e.clientX, NaN), fin(e.clientY, NaN), null);
        if (!rec) return;
        held.set(e.pointerId, rec);
        this._press(rec, e.pointerId);
      }, e),
    );
    pad.addEventListener('pointermove', (e) =>
      this._guard('pad', () => {
        const cur = held.get(e.pointerId);
        if (!cur || !CONFIG.touch.pad.slide) return;
        const next = this._padPick(fin(e.clientX, NaN), fin(e.clientY, NaN), cur);
        if (!next || next === cur) return;
        this._release(cur, e.pointerId); // the old tile's release edge first, then the new one's press
        held.set(e.pointerId, next);
        this._press(next, e.pointerId);
      }, e),
    );
    const end = (e) => {
      const cur = held.get(e.pointerId);
      if (!cur) return;
      held.delete(e.pointerId);
      this._release(cur, e.pointerId);
    };
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(n, (e) => this._guard('pad', end, e));
    pad.addEventListener('contextmenu', (e) => e.preventDefault?.());
  }

  _bindStick(zone) {
    const S = this.stick;
    zone.addEventListener('pointerdown', (e) =>
      this._guard('stick', () => {
        e.preventDefault?.();
        if (!this._live() || S.id !== null) return;
        try {
          zone.setPointerCapture?.(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        S.id = e.pointerId;
        // floating stick: it centres under the thumb (kept fully on screen)
        const m = RING_R + 14;
        S.ox = Math.min(Math.max(fin(e.clientX), m), Math.max(m, fin(globalThis.innerWidth, 800) * 0.5));
        S.oy = Math.min(Math.max(fin(e.clientY), m), Math.max(m, fin(globalThis.innerHeight, 400) - m));
        this._stickTo(fin(e.clientX, S.ox), fin(e.clientY, S.oy));
      }, e),
    );
    zone.addEventListener('pointermove', (e) =>
      this._guard('stick', () => {
        if (e.pointerId !== S.id) return;
        this._stickTo(fin(e.clientX, S.ox), fin(e.clientY, S.oy));
      }, e),
    );
    const end = (e) => {
      if (e.pointerId !== S.id) return;
      this._stickRelease();
    };
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(n, (e) => this._guard('stick', end, e));
  }

  /** Stick at screen point (x, y): virtual axis, sprint, aim direction, knob + ring. */
  _stickTo(x, y) {
    const S = this.stick, T = CONFIG.touch, R = T.stickRadius;
    const dx = x - S.ox, dy = y - S.oy;
    const len = Math.hypot(dx, dy);
    const m = Math.min(1, len / R);
    S.mag = m;
    let ax = 0, ay = 0;
    if (m > T.deadZone && len > 0) {
      const k = Math.min(1, (m - T.deadZone) / Math.max(0.01, T.runAt - T.deadZone));
      ax = (dx / len) * k;
      ay = (-dy / len) * k; // screen down = south
      this.aim.x = dx / len; // world +X = screen right, world +Z = screen down
      this.aim.z = dy / len;
      this.aim.set = true;
    }
    const input = this.game.input;
    input?.setVirtualAxis?.(ax, ay);
    const sprint = m >= T.sprintAt || (S.sprint && m >= T.sprintAt - SPRINT_OFF);
    if (sprint !== S.sprint) {
      S.sprint = sprint;
      input?.setVirtual?.('@sprint', sprint);
    }
    // visuals
    const u = this.ui;
    if (!u) return;
    const kl = Math.min(len, R), kx = len > 0 ? (dx / len) * kl : 0, ky = len > 0 ? (dy / len) * kl : 0;
    u.stick.style.transform = `translate3d(${S.ox.toFixed(1)}px, ${S.oy.toFixed(1)}px, 0)`;
    u.knob.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0)`;
    this._stickClass(true, sprint);
    const lit = m > T.deadZone ? ((Math.round((Math.atan2(dy, dx) / TAU) * RING) % RING) + RING) % RING : -1;
    this._ring(lit);
  }

  _stickRelease() {
    const S = this.stick;
    S.id = null;
    S.mag = 0;
    const input = this.game.input;
    input?.setVirtualAxis?.(0, 0);
    if (S.sprint) {
      S.sprint = false;
      input?.setVirtual?.('@sprint', false);
    }
    this._restStick();
  }

  _restStick() {
    const u = this.ui, S = this.stick;
    if (!u) return;
    // at rest: the bottom left corner; held upright, level with the pad (the thumbs come up from below)
    const R = RING_R + 22, G = this.padGeo;
    const lift = this.portrait && G ? fin(globalThis.innerHeight, 400) - G.cy + 24 * G.k : 14;
    S.ox = R + (this.portrait ? 8 : 18);
    S.oy = Math.max(R, fin(globalThis.innerHeight, 400) - R - lift);
    u.stick.style.transform = `translate3d(${S.ox}px, ${S.oy}px, 0)`;
    u.knob.style.transform = 'translate3d(0px, 0px, 0)';
    this._stickClass(false, false);
    this._ring(-1);
  }

  _stickClass(on, sprint) {
    const S = this.stick, u = this.ui;
    if (!u || (S.on === on && S._sp === sprint)) return;
    S.on = on;
    S._sp = sprint;
    u.stick.classList.toggle('on', on);
    u.stick.classList.toggle('sprint', sprint);
    u.tag.textContent = sprint ? 'SPRINT' : 'MOVE';
  }

  _ring(lit) {
    const S = this.stick, u = this.ui;
    if (!u || S.lit === lit) return;
    S.lit = lit;
    for (let i = 0; i < RING; i++) {
      const d = lit < 0 ? RING : Math.min((i - lit + RING) % RING, (lit - i + RING) % RING);
      const c = u.dots[i];
      c.classList.toggle('l2', d === 0);
      c.classList.toggle('l1', d === 1);
    }
  }

  _syncButtons() {
    const p = this.game.player, B = this.btn, K = this._keys;
    if (!p || !B) return;
    // ATTACK: ASCII charge meter while the cleave charges
    const charging = p.state === 'charge';
    const cells = charging ? Math.max(0, Math.min(CHARGE_CELLS, Math.round(fin(p.chargeK) * CHARGE_CELLS))) : -1;
    if (cells !== K.charge) {
      K.charge = cells;
      const a = B.attack;
      a.el.classList.toggle('charge', charging);
      a.el.classList.toggle('full', cells === CHARGE_CELLS);
      if (a.t) a.t.textContent = charging ? `[${'#'.repeat(cells)}${'.'.repeat(CHARGE_CELLS - cells)}]` : 'ATTACK';
    }
    // FLASK: count, dim when empty
    const inf = !!p.debug?.infiniteFlasks;
    const n = inf ? 99 : Math.max(0, Math.round(fin(p.flasks)));
    if (n !== K.flask) {
      K.flask = n;
      const f = B.flask;
      if (f.t) f.t.textContent = inf ? 'FLASK ∞' : `FLASK ${n}`;
      f.el.classList.toggle('dim', n <= 0);
    }
    // BLOCK: the guard meter as a gauge along the tile's foot, warm when it runs low
    const gMax = Math.max(1, fin(p.maxGuard, 100));
    const gd = Math.max(0, Math.min(GUARD_STEPS, Math.round((fin(p.guard, gMax) / gMax) * GUARD_STEPS)));
    if (gd !== K.guard) {
      K.guard = gd;
      setVar(B.block.el, '--tc-gd', (gd / GUARD_STEPS).toFixed(2));
      const low = gd / GUARD_STEPS < 0.3;
      if (low !== K.low) {
        K.low = low;
        B.block.el.classList.toggle('low', low);
      }
    }
    // LOCK: lit while locked on
    const lock = !!p.lockOn;
    if (lock !== K.lock) {
      K.lock = lock;
      B.lock.el.classList.toggle('lit', lock);
    }
  }

  // ---------------------------------------------------------------- window pointers
  /** Controls accept presses: active, landscape, in play, not hidden by the model viewer. */
  _live() {
    return this.active && this._shown === true;
  }

  _canvas() {
    return this.game.renderer?.domElement ?? globalThis.document?.getElementById?.('game') ?? null;
  }

  _onDown(e) {
    if (e?.pointerType !== 'touch') return;
    if (!this.active) {
      if (this.forced === false) return;
      this.setActive(true); // first touch on a device that did not report a coarse pointer
    }
    if (e.target !== this._canvas()) return; // controls / menus / Lab handle their own
    e.preventDefault?.();
    const st = this.game.state;
    if (TAP_DISMISS.has(st)) {
      // "press any key": the tap is a click on the game canvas
      this.taps.set(e.pointerId, 'Mouse0');
      this.game.input?.setVirtual?.('Mouse0', true);
    } else if (PLAY.has(st)) {
      this.pinch.set(e.pointerId, { x: fin(e.clientX), y: fin(e.clientY) });
      this.pinchD0 = 0;
    }
  }

  _onMove(e) {
    const p = this.pinch.get(e?.pointerId);
    if (!p) return;
    p.x = fin(e.clientX, p.x);
    p.y = fin(e.clientY, p.y);
    if (this.pinch.size !== 2) return;
    const [a, b] = this.pinch.values();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const rig = this.game.cameraRig;
    if (!rig || !(d > 0)) return;
    if (!this.pinchD0) {
      this.pinchD0 = d;
      this.pinchZ0 = fin(rig.targetDistance, CONFIG.camera.distance);
      return;
    }
    // fingers apart = closer; the distance scales with the pinch ratio, clamped by the rig
    const want = this.pinchZ0 * (this.pinchD0 / Math.max(24, d));
    rig.zoom((want - rig.targetDistance) / 2.5);
  }

  _onUp(e) {
    const id = e?.pointerId;
    if (this.pinch.delete(id)) this.pinchD0 = 0;
    this._tapUp(e);
  }

  _promptDown(e) {
    if (!this.active) return;
    e.preventDefault?.();
    // the prompt's action chip ("[@interact] Rest at bonfire") is the action the tap presses
    const m = /\[@([A-Za-z]+)\]/.exec(String(this.game.hud?.promptText ?? ''));
    if (!m) return;
    const code = `@${m[1]}`;
    this.taps.set(e.pointerId, code);
    this.game.input?.setVirtual?.(code, true);
  }

  _tapUp(e) {
    const code = this.taps.get(e?.pointerId);
    if (code === undefined) return;
    this.taps.delete(e.pointerId);
    for (const c of this.taps.values()) if (c === code) return; // another finger still holds it
    this.game.input?.setVirtual?.(code, false);
  }

  // ---------------------------------------------------------------- release
  /** Buttons + stick up (with their release edges). */
  _releaseControls() {
    for (const b of this.buttons) {
      if (!b.ids.size) continue;
      b.ids.clear();
      b.el.classList.remove('on');
      this.game.input?.setVirtual?.(b.def.code, false);
    }
    this.padHeld.clear();
    if (this.stick.id !== null || this.stick.sprint) this._stickRelease();
    this.pinch.clear();
    this.pinchD0 = 0;
  }

  _releaseAll() {
    this._releaseControls();
    this.taps.clear();
    this.game.input?.releaseVirtual?.();
  }

  // ---------------------------------------------------------------- errors
  _guard(label, fn, e) {
    try {
      fn(e);
    } catch (err) {
      this._report(label, err);
    }
  }

  _try(fn, label) {
    try {
      return fn();
    } catch (err) {
      this._report(label, err);
      return undefined;
    }
  }

  _report(label, err) {
    if (++this._errors > 5) return;
    console.error(`[touch] ${label} failed`, err);
  }
}
