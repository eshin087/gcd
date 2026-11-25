import { CONFIG } from '../core/config.js';
import { TAU } from '../core/math.js';
import { el, num } from './dom.js';

// Top-right minimap (canvas 2D): a small see-through disc (72 px on desktop, 40 px on phones; the
// zone title and the coordinates are in the DOM but not shown: an arena with one boss needs neither). The static clearing (canopies, stone ring, boulders, nest) is
// baked once into an offscreen layer; the live layer (bonfire flicker, dragon, player arrow) is
// redrawn at ~30 Hz. North (world -Z) is up, +X is right — the same as the game camera.

const SIZE = 170; // CSS px
const RANGE = 40; // meters from map centre to edge
const DRAW_HZ = 30;
const SLEEPY = new Set(['sleeping', 'dying', 'dead']);

export class Minimap {
  constructor(game, parent) {
    this.game = game;
    this.root = el('div', 'ab-map ab-play', null, parent);
    el('div', 'ab-map-zone', String(game.level?.name ?? 'Cinderwood Hollow').toUpperCase(), this.root);
    this.canvas = el('canvas', '', null, this.root);
    this.dpr = Math.min(2, Math.max(1, num(window.devicePixelRatio, 1)));
    this.canvas.width = this.canvas.height = Math.round(SIZE * this.dpr);
    this.ctx = this.canvas.getContext('2d');
    this.coordEl = el('div', 'ab-map-line', '', this.root);
    this.fpsEl = el('div', 'ab-map-line fps', '', this.root);
    // the boss rush's line (ADR-179): the fight's number and the rush's time, small, under the disc
    this.rushEl = el('div', 'ab-map-line rush', '', this.root);
    this._rush = null;
    this.scale = (SIZE / 2 - 5) / RANGE; // px per meter
    this.layer = null;
    this.layerTried = false;
    this.t = 0;
    this.drawAcc = 1;
    this.textAcc = 1;
    this._coord = '';
    this._fps = '';
    this._fpsOn = null;
  }

  update(dt) {
    this.t += dt;
    this._rushLine();
    if (!this.layerTried) {
      this.layerTried = true;
      try {
        this.layer = this._bake();
      } catch (err) {
        console.warn('[hud] minimap bake failed', err);
      }
    }
    this.drawAcc += dt;
    if (this.drawAcc >= 1 / DRAW_HZ && this.ctx) {
      this.drawAcc = 0;
      // what stands has changed (a tree felled, a pillar down, the fight's reset: ADR-107): bake again
      // (... or the edge of the open ground has moved: world/edge.js, ADR-125)
      const cv = this.game.world?.colliders?.version, ev = this.game.world?.edge?.version;
      const ver = cv === undefined ? undefined : cv + (ev > 0 ? ev * 1e6 : 0);
      if (ver !== undefined && ver !== this._ver) {
        if (this._ver !== undefined) {
          try {
            this.layer = this._bake();
          } catch (err) {
            console.warn('[hud] minimap bake failed', err);
          }
        }
        this._ver = ver;
      }
      this._draw();
    }
    this.textAcc += dt;
    if (this.textAcc >= 0.12) {
      this.textAcc = 0;
      this._text();
    }
  }

  _text() {
    const g = this.game;
    const p = g.player?.position;
    if (p) {
      const s = `X ${num(p.x).toFixed(1)}  ·  Z ${num(p.z).toFixed(1)}`;
      if (s !== this._coord) {
        this._coord = s;
        this.coordEl.textContent = s;
      }
    }
    const on = !!g.settings?.showFps;
    if (on !== this._fpsOn) {
      this._fpsOn = on;
      this.fpsEl.classList.toggle('on', on);
    }
    if (on) {
      const q = CONFIG.quality[g.settings.quality]?.name ?? '';
      const s = `FPS ${Math.round(num(g.fps))}  ·  ${q}`;
      if (s !== this._fps) {
        this._fps = s;
        this.fpsEl.textContent = s;
      }
    }
  }

  /** '3 / 8  4:12.3': written only when it changes (a tenth of a second); hidden outside a rush. */
  _rushLine() {
    const c = this.game.flow?.recorder?.rushClock?.();
    let s = '';
    if (c) {
      const ds = Math.floor(num(c.ms) / 100);
      const t = ds % 10, sec = Math.floor(ds / 10) % 60, m = Math.floor(ds / 600);
      s = `${c.index} / ${c.count}  ${m}:${sec < 10 ? '0' : ''}${sec}.${t}`;
    }
    if (s === this._rush) return;
    if (!s !== !this._rush) this.rushEl.classList.toggle('on', !!s);
    this._rush = s;
    this.rushEl.textContent = s;
  }

  _bake() {
    const g = this.game;
    const cv = document.createElement('canvas');
    cv.width = cv.height = this.canvas.width;
    const c = cv.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const C = SIZE / 2, R = C - 1.5;
    const arena = CONFIG.world.arenaRadius;
    // the edge of the open ground (the forest's wall coming down: world/edge.js): the map draws back
    // as the ground opens, so the hero stays on it
    // (a walk-mode edge, ADR-197: the hero walks the whole forest; the map draws back to its end, the
    // ridge, while he stands out in it, and keeps the clearing's scale while he is in the clearing)
    const E0 = g.world?.edge ?? null;
    const E = E0?.walk ? (E0.out ? E0 : null) : E0?.open ? E0 : null;
    let far = 0;
    if (E) for (let i = 0; i < E.n; i++) far = Math.max(far, num(E.R[i], 0));
    const range = (this.range = Math.max(RANGE, far + 4));
    const s = (this.scale = (SIZE / 2 - 5) / range);

    c.save();
    c.beginPath();
    c.arc(C, C, R, 0, TAU);
    c.clip();
    // forest floor + clearing
    c.fillStyle = '#060b0c';
    c.fillRect(0, 0, SIZE, SIZE);
    const grd = c.createRadialGradient(C, C, 0, C, C, arena * s);
    grd.addColorStop(0, 'rgba(36, 54, 50, 0.95)');
    grd.addColorStop(1, 'rgba(22, 35, 33, 0.95)');
    c.fillStyle = grd;
    c.beginPath();
    c.arc(C, C, (arena + 0.8) * s, 0, TAU);
    c.fill();
    // southern path out of the clearing
    c.fillStyle = 'rgba(22, 35, 33, 0.95)';
    c.fillRect(C - 4.2 * s, C + (arena - 3) * s, 8.4 * s, 20 * s);
    // faint 10 m grid
    c.strokeStyle = 'rgba(207, 214, 230, 0.045)';
    c.lineWidth = 1;
    for (let m = -Math.ceil(range / 10) * 10; m <= range; m += 10) {
      const v = Math.round(C + m * s) + 0.5;
      c.beginPath();
      c.moveTo(v, 0);
      c.lineTo(v, SIZE);
      c.moveTo(0, v);
      c.lineTo(SIZE, v);
      c.stroke();
    }
    // canopies (overlapping translucent blobs read as a forest mass)
    const spots = g.world?.forest?.treeSpots;
    const circles = g.world?.colliders?.circles ?? [];
    if (Array.isArray(spots) && spots.length) {
      c.fillStyle = 'rgba(46, 78, 64, 0.42)';
      for (const t of spots) {
        if (Math.hypot(t.x, t.z) > range + 6) continue;
        c.beginPath();
        c.arc(C + t.x * s, C + t.z * s, Math.max(2, num(t.r, 2.5) * s * 0.8), 0, TAU);
        c.fill();
      }
    }
    // ground the fallen wall has opened: each open lane cleared out to where it ends
    const inset = E ? Math.max(0, E.base - arena) : 0;
    if (E && !E.walk) {
      c.fillStyle = 'rgba(22, 35, 33, 0.97)';
      for (let i = 0; i < E.n; i++) {
        if (!(E.R[i] > E.base + 0.05)) continue;
        const a0 = E.laneAngle(i) - E.step / 2 - 0.002, a1 = a0 + E.step + 0.004;
        c.beginPath();
        c.arc(C, C, (E.R[i] - inset + 0.8) * s, a0, a1);
        c.arc(C, C, arena * s, a1, a0, true);
        c.closePath();
        c.fill();
      }
    }
    // arena edge
    c.setLineDash([2, 3]);
    c.strokeStyle = 'rgba(207, 214, 230, 0.22)';
    c.beginPath();
    if (E0?.walk && !E) {
      // (in the clearing, a walk-mode edge: no line round it, he may walk on into the trees)
    } else if (E) {
      for (let i = 0; i < E.n; i++) {
        const a0 = E.laneAngle(i) - E.step / 2;
        c.arc(C, C, Math.max(arena, E.R[i] - inset) * s, a0, a0 + E.step);
      }
      c.closePath();
    } else c.arc(C, C, arena * s, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    // trunks, stones, boulders
    for (const k of circles) {
      const x = C + k.x * s, y = C + k.z * s;
      if (k.tag === 'trunk') {
        c.fillStyle = 'rgba(96, 128, 108, 0.75)';
        c.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      } else if (k.tag === 'stone') {
        c.fillStyle = '#b4bccb';
        c.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
      } else if (k.tag === 'boulder') {
        c.fillStyle = 'rgba(132, 142, 158, 0.85)';
        c.beginPath();
        c.arc(x, y, Math.max(1.2, num(k.r, 1) * s * 0.75), 0, TAU);
        c.fill();
      }
    }
    // the nest (bones)
    const nest = g.world?.nest;
    if (nest) {
      c.fillStyle = 'rgba(214, 200, 176, 0.6)';
      c.font = '700 10px "JetBrains Mono", monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('×', C + nest.x * s, C + nest.z * s);
    }
    c.restore();

    // rim + north marker
    c.strokeStyle = 'rgba(207, 214, 230, 0.38)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(C, C, R, 0, TAU);
    c.stroke();
    c.fillStyle = 'rgba(6, 9, 14, 0.9)';
    c.beginPath();
    c.arc(C, 8, 6.5, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#eef1f8';
    c.font = '700 9px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', C, 8.5);
    return cv;
  }

  _draw() {
    const g = this.game, c = this.ctx, s = this.scale, C = SIZE / 2;
    const maxR = (this.range ?? RANGE) - 1.5;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, SIZE, SIZE);
    if (this.layer) c.drawImage(this.layer, 0, 0, SIZE, SIZE);
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    // bonfire
    const bf = g.world?.bonfire;
    if (bf) {
      c.globalAlpha = 0.72 + 0.28 * Math.sin(this.t * 9.1) * Math.sin(this.t * 5.3);
      c.fillStyle = '#ff8a3d';
      c.font = '700 9px "JetBrains Mono", monospace';
      c.fillText('▲', C + bf.x * s, C + bf.z * s);
      c.globalAlpha = 1;
    }

    // dragon (only once awake)
    const d = g.dragon;
    if (d?.position && d.state && !SLEEPY.has(d.state)) {
      let x = num(d.position.x), z = num(d.position.z);
      const r = Math.hypot(x, z);
      if (r > maxR) {
        x *= maxR / r;
        z *= maxR / r;
      }
      const mx = C + x * s, my = C + z * s;
      const pulse = (this.t * 1.3) % 1;
      c.globalAlpha = 1 - pulse;
      c.strokeStyle = '#ff4a2e';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(mx, my, 3.5 + pulse * 8, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = d.phase >= 3 ? '#ffd08a' : d.phase === 2 ? '#ff8a3d' : '#ff4a2e';
      c.beginPath();
      c.arc(mx, my, 3.4, 0, TAU);
      c.fill();
    }

    // player arrow, pointing along yaw (facing = (sin yaw, cos yaw) in x/z = right/down on the map)
    const p = g.player;
    if (p?.position) {
      let x = num(p.position.x), z = num(p.position.z);
      const r = Math.hypot(x, z);
      if (r > maxR) {
        x *= maxR / r;
        z *= maxR / r;
      }
      const yaw = num(p.yaw, Math.PI);
      const dx = Math.sin(yaw), dy = Math.cos(yaw);
      const px = -dy, py = dx;
      const mx = C + x * s, my = C + z * s;
      c.beginPath();
      c.moveTo(mx + dx * 6.5, my + dy * 6.5);
      c.lineTo(mx - dx * 3.5 + px * 3.8, my - dy * 3.5 + py * 3.8);
      c.lineTo(mx - dx * 1.6, my - dy * 1.6);
      c.lineTo(mx - dx * 3.5 - px * 3.8, my - dy * 3.5 - py * 3.8);
      c.closePath();
      c.fillStyle = '#f2f5fb';
      c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      c.lineWidth = 1;
      c.fill();
      c.stroke();
    }
  }
}
