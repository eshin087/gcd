import * as THREE from 'three';
import { el, num } from './dom.js';
import { bossNames } from './bossName.js';

// World-anchored overlays: small white name tags above the player and the (awake) dragon, plus the
// rotating lock-on reticle. Projected with the game camera each frame and moved with transforms only.

const AWAKE_HIDDEN = new Set(['sleeping', 'dying', 'dead']);
// The lock-on marker is a hint, not a fixture (owner, 2026-11-14: "subtle and slowly fades away"):
// taking the lock shows it faintly (`peak` opacity) for `hold` s, then it fades over `fade` s and
// stays gone until the lock is taken again. Real seconds.
export const LOCK_MARK = Object.freeze({ peak: 0.55, hold: 0.5, fade: 2.4 });
// The hero's tag rides his head (owner, 2026-11-25: the name "not too far away from the character"):
// `over` m above the head bone, which sits about 0.4 m under the top of his hair, so the letters stand
// just clear of it; it follows a roll, a crouch or a lean down instead of hanging at a fixed height.
// `follow` /s eases the bob of a step out of it. Without a rig (tests): `fallback` m over his feet.
export const HERO_TAG = Object.freeze({ over: 0.55, follow: 16, fallback: 2.2 });

class Tag {
  constructor(layer, className, text) {
    this.node = el('div', className, null, layer);
    this.label = el('span', '', text, this.node);
    this.on = false;
    this.x = -1e4;
    this.y = -1e4;
  }
  show(on) {
    if (on === this.on) return;
    this.on = on;
    this.node.classList.toggle('on', on);
  }
  moveTo(x, y) {
    if (Math.abs(x - this.x) < 0.3 && Math.abs(y - this.y) < 0.3) return;
    this.x = x;
    this.y = y;
    this.node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}

export class NameTags {
  constructor(game, parent) {
    this.game = game;
    this.layer = el('div', 'ab-tags ab-play', null, parent);
    this.player = new Tag(this.layer, 'ab-tag', String(game.player?.name || 'gcd'));
    this.dragon = new Tag(this.layer, 'ab-tag foe', bossNames(game.dragon?.name).short);
    this.reticle = new Tag(this.layer, 'ab-tag ab-reticle', '◇');
    this.v = new THREE.Vector3();
    this.pv = new THREE.Vector3();
    this.lock = new THREE.Vector3();
    this.lockT = Infinity; // s since the lock was taken
    this._locked = false;
    this._lockA = -1;
    this.w = window.innerWidth || 1;
    this.h = window.innerHeight || 1;
    addEventListener('resize', () => {
      this.w = window.innerWidth || 1;
      this.h = window.innerHeight || 1;
    });
  }

  /** Project world (x,y,z) into the tag; hides it when behind the camera or off-screen. */
  _place(tag, x, y, z) {
    const cam = this.game.camera;
    if (!cam || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return tag.show(false);
    const v = this.v.set(x, y, z).project(cam);
    if (!(v.z > -1 && v.z < 1) || v.x < -1.08 || v.x > 1.08 || v.y < -1.08 || v.y > 1.12) return tag.show(false);
    tag.moveTo((v.x * 0.5 + 0.5) * this.w, (0.5 - v.y * 0.5) * this.h);
    tag.show(true);
  }

  update(dt) {
    const g = this.game;
    const st = g.state;
    const visible = st !== 'title';

    const p = g.player;
    if (visible && p?.position) {
      // over his drawn head (HERO_TAG): the head bone's world point carries his lean and his size
      const v = this.pv;
      const head = p.rig?.head;
      if (typeof head?.getWorldPosition === 'function') {
        head.getWorldPosition(v);
        v.y += HERO_TAG.over;
      } else {
        v.set(num(p.position.x), num(p.position.y) + HERO_TAG.fallback, num(p.position.z));
        if (typeof p.leanPoint === 'function') p.leanPoint(v);
      }
      if (Number.isFinite(v.y)) {
        const k = Number.isFinite(this.tagY) ? Math.min(1, num(dt, 0) * HERO_TAG.follow) : 1;
        this.tagY = Number.isFinite(this.tagY) ? this.tagY + (v.y - this.tagY) * k : v.y;
        v.y = this.tagY;
      }
      this._place(this.player, v.x, v.y, v.z);
    } else {
      this.player.show(false);
      this.tagY = NaN;
    }

    const d = g.dragon;
    const awake = !!(d?.state && !AWAKE_HIDDEN.has(d.state));
    let lockOk = false;
    if (visible && d && (awake || p?.lockOn)) {
      if (typeof d.lockPoint === 'function') {
        try {
          d.lockPoint(this.lock);
          lockOk = Number.isFinite(this.lock.x) && Number.isFinite(this.lock.y) && Number.isFinite(this.lock.z);
        } catch {
          lockOk = false;
        }
      }
      if (!lockOk && d.position) {
        this.lock.copy(d.position);
        this.lock.y += 2;
        lockOk = true;
      }
    }

    if (visible && awake && lockOk) this._place(this.dragon, this.lock.x, this.lock.y + 2, this.lock.z);
    else this.dragon.show(false);

    const targetable = typeof d?.isTargetable === 'function' ? !!d.isTargetable() : awake;
    const locked = !!p?.lockOn;
    if (locked && !this._locked) this.lockT = 0;
    else if (locked) this.lockT += num(dt, 0);
    this._locked = locked;
    const M = LOCK_MARK;
    const a = locked ? M.peak * Math.min(1, Math.max(0, 1 - (this.lockT - M.hold) / M.fade)) : 0;
    if (visible && a > 0.004 && targetable && lockOk) {
      this._place(this.reticle, this.lock.x, this.lock.y, this.lock.z);
      if (Math.abs(a - this._lockA) > 0.008) {
        this._lockA = a;
        this.reticle.node.style.opacity = a.toFixed(3);
      }
    } else this.reticle.show(false);
  }
}
