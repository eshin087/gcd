import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { DP_FX_U, DP_RIP_N, DP_FIGHTERS } from '../render/dragonPrintFx.js';
import { dragonLook } from '../render/dragonPrint.js';
import { STATE } from './destructibles.js';
import { GFX } from './groundFxTuning.js';

// THE DRAGON PRINT'S UPGRADES, CPU side (render/dragonPrintFx.js has the GLSL; groundFxTuning.js every
// number). world.js builds one and calls update(dt) once a frame, after the scorch map and the hero's wake.
// Writes DP_FX_U only (one shared uniforms object: every dragon-printed material reads the same values);
// reads the game (the fighters' positions, the world's pieces and colliders, the level's wind); never
// Math.random, no allocation per frame, no new event.
//
//   new GroundFx(game, world)
//   fx.update(dt)        once a frame: the switches, the cloud's drift, the fighters' rings, the ripples,
//                        and the contact texture baked again when a piece fell / stood again
//   fx.blow(x, z, power) a blow met the ground (world.groundBlow calls it): a re-print ring from there
//                        (none under GFX.ripple.minPower)
//   fx.clear()           the fight's reset: the rings gone, the contact baked again next frame
//   fx.on                { cloud, contact, ripple, ridge }: each '0' | 'a' | 'b' (this frame's switches)
//   fx.rings             how many re-print rings are live (the tests)
//   fx.bakes             how many times the contact texture was baked (the tests)
//   fx.contactAt(x, z)   the baked ring's depth there, 0..1 (the tests; reads the CPU copy)
//
// The switches (each its own, '0' = off; ?dragon=1 turns them all to 'a'): ?dpCloud= ?dpContact= ?dpRipple=
// ?dpRidge= (a | b). They are read every frame (a Map lookup), so the Lab and the tests flip them live.

const KEYS = ['dpCloud', 'dpContact', 'dpRipple', 'dpRidge'];
const opt = (v) => (v === 'a' || v === 'b' ? v : '0');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const DEG = Math.PI / 180;

export class GroundFx {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.U = DP_FX_U;
    this.on = { cloud: '0', contact: '0', ripple: '0', ridge: '0' };
    // the cloud's drift (m)
    this._cx = 0;
    this._cz = 0;
    // the rings: where, how old, how strong (a fixed pool; none is allocated a frame)
    this._rx = new Float32Array(DP_RIP_N);
    this._rz = new Float32Array(DP_RIP_N);
    this._ra = new Float32Array(DP_RIP_N); // age, s
    this._rp = new Float32Array(DP_RIP_N); // power (0: the slot is free)
    this._rT = new Float32Array(DP_RIP_N); // its life, s
    this._rR = new Float32Array(DP_RIP_N); // its reach, m
    this.rings = 0;
    // the contact texture (made on the first frame with the piece on)
    this._tex = null;
    this._data = null;
    this._N = 0;
    this._min = 0;
    this._size = 0;
    this._colV = -1;
    this._seen = null; // each piece's state as last baked (Uint8Array, one a piece)
    this._dirty = true;
    this._since = 1e9;
    this._bakedOpt = '';
    this.bakes = 0;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    dt = Math.min(dt, 0.1);
    const U = this.U, on = this.on;
    on.cloud = opt(dragonLook(KEYS[0]));
    on.contact = opt(dragonLook(KEYS[1]));
    on.ripple = opt(dragonLook(KEYS[2]));
    on.ridge = opt(dragonLook(KEYS[3]));
    const F = U.uDpFxOn.value;
    F[0] = on.cloud === '0' ? 0 : on.cloud === 'a' ? 1 : 2;
    F[1] = on.contact === '0' ? 0 : on.contact === 'a' ? 1 : 2;
    F[2] = on.ripple === '0' ? 0 : on.ripple === 'a' ? 1 : 2;
    F[3] = on.ridge === '0' ? 0 : on.ridge === 'a' ? 1 : 2;
    if (on.cloud !== '0') this._cloud(dt, GFX.cloud[on.cloud]);
    if (on.contact !== '0') this._contact(dt, GFX.contact[on.contact], on.contact);
    if (on.ripple !== '0') this._ripples(dt, GFX.ripple[on.ripple]);
    else if (this.rings) this._clearRings();
    if (on.ridge !== '0') {
      const R = GFX.ridge[on.ridge];
      U.uDpRidge.value.set(R.edge, R.tone, R.sharp, R.edge2);
      U.uDpRidgeK.value.set(R.gain, R.steep, 0, 0);
    }
  }

  /** A blow met the ground at (x, z) with `power` (POWER scale): a re-print ring from there. */
  blow(x, z, power) {
    if (!Number.isFinite(x + z + power)) return;
    const o = this.on.ripple === '0' ? opt(dragonLook(KEYS[2])) : this.on.ripple;
    if (o === '0' || !(power >= GFX.ripple.minPower)) return;
    const T = GFX.ripple[o];
    // a free slot, else the oldest ring's
    let s = -1, old = -1;
    for (let i = 0; i < DP_RIP_N; i++) {
      if (this._rp[i] <= 0) {
        s = i;
        break;
      }
      if (old < 0 || this._ra[i] > this._ra[old]) old = i;
    }
    if (s < 0) s = old;
    const reach = Math.min(T.reachMax, T.reach[0] + T.reach[1] * power);
    this._rx[s] = x;
    this._rz[s] = z;
    this._ra[s] = 0;
    this._rp[s] = power;
    this._rR[s] = reach;
    // (it eases out: about 1.6 x the time it would take at its full speed)
    this._rT[s] = (reach / T.speed) * 1.6;
    this._countRings();
  }

  /** The fight's reset. */
  clear() {
    this._clearRings();
    this._dirty = true;
    this._since = 1e9;
  }

  /** The baked contact ring's depth at (x, z), 0..1 (the CPU copy; 0 before the first bake). */
  contactAt(x, z) {
    if (!this._data || !Number.isFinite(x + z)) return 0;
    const t = this._size / this._N;
    const i = Math.floor((x - this._min) / t), j = Math.floor((z - this._min) / t);
    if (i < 0 || j < 0 || i >= this._N || j >= this._N) return 0;
    return this._data[j * this._N + i] / 255;
  }

  // ---------------------------------------------------------------- the cloud
  _cloud(dt, C) {
    const W = this.world?.life?.wind;
    const S = GFX.cloud.still;
    let dx, dz, v;
    if (W && !W.still && W.speed > 0.05 && Number.isFinite(W.dirX + W.dirZ + W.speed)) {
      dx = W.dirX;
      dz = W.dirZ;
      v = clamp(W.speed * C.k, C.min, C.max);
    } else {
      // (no wind of its own: the grove, ?life=off; the prevailing direction if there is one)
      dx = W && Number.isFinite(W.dirX + W.dirZ) && Math.abs(W.dirX) + Math.abs(W.dirZ) > 0.5 ? W.dirX : Math.cos(S.dir * DEG);
      dz = W && Number.isFinite(W.dirX + W.dirZ) && Math.abs(W.dirX) + Math.abs(W.dirZ) > 0.5 ? W.dirZ : Math.sin(S.dir * DEG);
      v = S.speed;
    }
    this._cx += dx * v * dt;
    this._cz += dz * v * dt;
    // (kept small for the GPU's floats: the field repeats nothing, but an hour of drift is ~10 km)
    if (Math.abs(this._cx) > 2e4 || Math.abs(this._cz) > 2e4 || !Number.isFinite(this._cx + this._cz)) this._cx = this._cz = 0;
    this.U.uDpCloud.value.set(this._cx, this._cz, C.scale, C.cover);
    this.U.uDpCloudK.value.set(C.soft, C.depth, C.warp, 0);
  }

  // ---------------------------------------------------------------- contact shadows
  _contact(dt, C, o) {
    const U = this.U;
    this._since += dt;
    if (!this._tex) this._make();
    // what stands: the colliders' version, and each piece's state (a piece with no collider falls too)
    const W = this.world;
    const cv = W?.colliders?.version ?? 0;
    if (cv !== this._colV) this._dirty = true;
    const L = W?.destructibles?.list;
    if (L) {
      if (!this._seen || this._seen.length !== L.length) {
        this._seen = new Uint8Array(L.length);
        this._dirty = true;
      }
      const seen = this._seen;
      for (let i = 0; i < L.length; i++) {
        const s = this._standing(L[i]);
        if (s !== seen[i]) {
          seen[i] = s;
          this._dirty = true;
        }
      }
    }
    if (this._bakedOpt !== o) this._dirty = true;
    if (this._dirty && this._since >= GFX.contact.rebake) this._bake(C, o);
    U.uDpContactBox.value.set(this._min, this._min, this._size, C.lean);
    // the fighters: the hero, then the boss's body circles (its footprint on the ground)
    const Fs = U.uDpFighters.value, H = GFX.contact.hero, B = GFX.contact.boss, lift = GFX.contact.lift;
    U.uDpContactK.value.set(GFX.contact.spread[0], GFX.contact.spread[1], 0, 0);
    let n = 0;
    const p = this.game?.player?.position;
    if (p && Number.isFinite(p.x + p.z)) {
      const up = clamp(1 - fin(p.y) / lift, 0, 1);
      if (up > 0) Fs[n++].set(p.x, p.z, H.r, H.depth * up * (C.depth / GFX.contact.a.depth));
    }
    const boss = this.game?.boss ?? this.game?.dragon;
    const bc = boss?.bodyCircles;
    if (Array.isArray(bc)) {
      for (let i = 0; i < bc.length && n < DP_FIGHTERS; i++) {
        const c = bc[i];
        if (!c || !Number.isFinite(c.x + c.z)) continue;
        Fs[n++].set(c.x, c.z, Number.isFinite(c.r) && c.r > 0 ? c.r : B.r, B.depth * (C.depth / GFX.contact.a.depth));
      }
    }
    for (; n < DP_FIGHTERS; n++) Fs[n].w = 0;
  }

  /** 1 standing whole, 2 its stump, 0 gone (or not a thing that rings: a slab, a piece out of the scene). */
  _standing(b) {
    if (!b || b.absent || b.floor) return 0;
    if (b.state === STATE.INTACT) return fin(b.h) >= GFX.contact.minH ? 1 : 0;
    if (b.state === STATE.BROKEN && b.stubR > 0) return 2;
    return 0;
  }

  _make() {
    const ext = fin(this.world?.scorch?.extent, CONFIG.world.worldExtent ?? 160);
    const N = Math.max(16, Math.min(GFX.contact.maxSize, Math.ceil(ext / GFX.contact.texel)));
    this._N = N;
    this._size = ext;
    this._min = Number.isFinite(this.world?.scorch?.min) ? this.world.scorch.min : -ext / 2;
    this._data = new Uint8Array(N * N);
    const t = new THREE.DataTexture(this._data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.needsUpdate = true;
    this._tex = t;
    this.U.uDpContactTex.value = t;
  }

  /** Bake every standing piece's ring and every collider's into the texture (rare: a piece falls). */
  _bake(C, o) {
    const data = this._data;
    if (!data) return;
    data.fill(0);
    const K = GFX.contact;
    const W = this.world;
    // the colliders (everything that stands in the way: stones, trunks, the bonfire, landmarks' feet)
    const cs = W?.colliders?.circles;
    if (Array.isArray(cs)) for (const c of cs) if (c && Number.isFinite(c.x + c.z + c.r)) this._splat(c.x, c.z, c.r, C.depth, C.spread + C.spreadR * c.r);
    // the pieces (also those with no collider: a bone, a small stone, a wall tree), and the stumps
    const L = W?.destructibles?.list;
    if (L) {
      for (const b of L) {
        const s = this._standing(b);
        if (s === 0 || !Number.isFinite(b.x + b.z)) continue;
        const r = s === 1 ? fin(b.r, 0.4) : b.stubR;
        const k = s === 1 ? C.depth * clamp(fin(b.h) / K.hRef, 0.35, 1) : C.depth * K.stub;
        this._splat(b.x, b.z, r, k, C.spread + C.spreadR * r);
      }
    }
    this._tex.needsUpdate = true;
    this._colV = W?.colliders?.version ?? 0;
    this._dirty = false;
    this._since = 0;
    this._bakedOpt = o;
    this.bakes++;
  }

  _splat(x, z, r, k, spread) {
    if (!(k > 0) || !(r >= 0)) return;
    const N = this._N, t = this._size / N, m = this._min, data = this._data;
    const R = r + spread;
    const i0 = Math.max(0, Math.floor((x - R - m) / t)), i1 = Math.min(N - 1, Math.ceil((x + R - m) / t));
    const j0 = Math.max(0, Math.floor((z - R - m) / t)), j1 = Math.min(N - 1, Math.ceil((z + R - m) / t));
    const k255 = k * 255, inv = 1 / Math.max(spread, 1e-3);
    for (let j = j0; j <= j1; j++) {
      const dz = m + (j + 0.5) * t - z;
      const row = j * N;
      for (let i = i0; i <= i1; i++) {
        const dx = m + (i + 0.5) * t - x;
        const d = Math.sqrt(dx * dx + dz * dz) - r;
        if (d >= spread) continue;
        const f = d <= 0 ? 1 : 1 - d * inv;
        const v = (k255 * f * f) | 0;
        if (v > data[row + i]) data[row + i] = v;
      }
    }
  }

  // ---------------------------------------------------------------- the re-print rings
  _ripples(dt, T) {
    const Rs = this.U.uDpRip.value;
    this.U.uDpRipK.value.set(T.front, T.back, T.jitter, T.flip);
    this.U.uDpRipP.value.set(T.tone, T.light, 0, 0);
    for (let i = 0; i < DP_RIP_N; i++) {
      const p = this._rp[i];
      if (!(p > 0)) {
        Rs[i].w = 0;
        continue;
      }
      const a = (this._ra[i] += dt) / this._rT[i];
      if (a >= 1) {
        this._rp[i] = 0;
        Rs[i].w = 0;
        continue;
      }
      // the edge runs out and slows (ease out), the ring fades as it goes
      const R = this._rR[i] * (1 - (1 - a) * (1 - a));
      const k = Math.min(1, T.amp[0] + T.amp[1] * p) * (1 - a) * (1 - a * 0.4);
      Rs[i].set(this._rx[i], this._rz[i], R, k);
    }
    this._countRings();
  }

  _countRings() {
    let n = 0;
    for (let i = 0; i < DP_RIP_N; i++) if (this._rp[i] > 0) n++;
    this.rings = n;
  }

  _clearRings() {
    this._rp.fill(0);
    for (const v of this.U.uDpRip.value) v.w = 0;
    this.rings = 0;
  }
}
