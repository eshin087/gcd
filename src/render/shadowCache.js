import * as THREE from 'three';
import { LAYER_CASTER, LAYER_CASTER_RIGID } from './shaderLib.js';
import { isRigidSource, rigidShadowSet } from './rigidBatch.js';

// THE STILL SHADOW MAP (ADR-201). The moon's shadow map was drawn whole every frame: on Cinderwood half a
// million triangles of trees, stumps and rocks that never move, on every level the breakables at rest. Here
// the map is drawn in two layers:
//
//   still    every caster that has not changed for `settle` frames, drawn into its own map (stillRT) only
//            when something in it changes: a still caster moves, is cut or hidden, one joins or leaves it,
//            the moon turns, the map's size changes, or the map's centre steps (pipeline.js
//            updateShadowCamera snaps it to a grid of `snap` texels while the cache is on, so walking does
//            not move it every frame)
//   moving   everything else (the hero, the boss, a falling tree, a wing membrane), drawn every frame
//            straight into the frame's map
//
// The frame's map keeps last frame's picture: the still map plus last frame's moving casters. Before the
// moving casters are drawn, what changed since is wiped back to the still map (a depth blit, no shading),
// rect by rect, at the place it was LAST frame: a moved bone of an actor (rigidBatch.js sync keeps the
// spheres of the bones it moved, at their old place), a plain moving mesh whose state changed. What did not
// change is drawn again on the very texels it covers already. The whole map is copied back after the still
// map was drawn again, when a moving caster leaves, and when a big mesh changed whose bounds are not cheap
// to know (a run of cut trees).
//
// The picture is the one a whole draw gives (each caster's depth lands in the frame's map exactly once per
// state, and a depth map does not depend on the order things are drawn in): at 1280 x 720 through a fight
// on three levels, 0 pixels differ.
//
// A caster is any object three's shadow passes would draw: visible (itself and its ancestors), on
// LAYER_CASTER (drawn with the plain depth material) or LAYER_CASTER_RIGID (a rigid batch's shadow mesh,
// drawn with the bone depth material). Its STATE is what the depth pass reads of it: its matrixWorld, its
// material's `visible`, its geometry (id, the position's and the index's versions, the draw range, the
// groups), an instanced mesh's matrices and count, and for a rigid shadow mesh its batch's stamp
// (rigidBatch.js sync: bumped when what it casts changes). A skinned or morphing mesh is always changing.
// The partition is made with each object's own layer mask (layers are not inherited), saved and put back
// within the frame.
//
// Off with `?shadowCache=0` (pipeline.js); off by itself where the renderer cannot blit depth.

const CASTER_BIT = 1 << LAYER_CASTER;
const RIGID_BIT = 1 << LAYER_CASTER_RIGID;
const BOTH = CASTER_BIT | RIGID_BIT;
const SIG = 28;
/** Rects wiped back at most per frame (more are merged into their bounds). */
const RECTS = 12;
/** A plain moving mesh with more vertices than this: its bounds are not worked out each change (the whole map is wiped). */
const BIG = 20000;
/** A position attribute whose changed ranges can be followed in a copy (a plain float array, more than BIG vertices). */
const bigCopyable = (p) => !!p && p.count > BIG && !p.isInterleavedBufferAttribute && p.array instanceof Float32Array;

export class ShadowCache {
  /**
   * @param renderer   the WebGLRenderer
   * @param target     the frame's shadow map (pipeline.shadowRT: its depth texture is what the scene reads)
   * @param o          { settle: frames a caster must stay unchanged to join the still map; settleBig: the same
   *                     for one of more than `big` triangles (drawing it moving costs about what drawing the
   *                     still map again does: a cut tree run joins it again almost at once) }
   */
  constructor(renderer, target, { settle = 20, settleBig = 3, big = 60000 } = {}) {
    this.renderer = renderer;
    this.target = target;
    this.settle = settle;
    this.settleBig = settleBig;
    this.bigTris = big;
    this.still = new THREE.WebGLRenderTarget(target.width, target.height, {
      depthTexture: new THREE.DepthTexture(target.width, target.height),
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.still.texture.name = 'shadowStill';
    // (a renderer that cannot blit depth: the map is drawn whole, as before; the headless tests' stand-in
    // renderers land here)
    const gl = typeof renderer?.getContext === 'function' ? renderer.getContext() : null;
    this.gl = gl && typeof gl.blitFramebuffer === 'function' && renderer.state && renderer.properties ? gl : null;
    this.off = !this.gl;
    /** object -> its record (see _record) */
    this.rec = new Map();
    this.dirty = true;
    this.key = new Float64Array(6).fill(NaN);
    this.frame = 0;
    this._list = [];
    this._sig = new Float64Array(SIG);
    this._rects = new Int32Array(RECTS * 4);
    this._n = 0;
    this._all = false;
    this._r = new Int32Array(4);
    this._vp = new THREE.Matrix4();
    this._c = new THREE.Vector3();
    this._sph = new THREE.Sphere();
    /** Counters for tests and the Lab: frames drawn, still redraws, moving / still casters and the reason
     *  for the last redraw, texels wiped back in all. */
    this.stats = { frames: 0, redraws: 0, moving: 0, still: 0, why: '', copied: 0, full: 0, fullBy: { redraw: 0, big: 0, left: 0, actor: 0 }, bigName: '' };
    this._lost = () => {
      this.dirty = true;
    };
    renderer?.domElement?.addEventListener?.('webglcontextrestored', this._lost);
  }

  /** The map's size changed (pipeline.setShadowSize). */
  setSize(w, h) {
    this.still.setSize(w, h);
    this.dirty = true;
  }

  /** Forget everything: the next frame draws the still map again. */
  reset() {
    this.dirty = true;
  }

  _record(s) {
    // sig: the state last seen; n: frames unchanged; still: in the still map; mask: a saved layer mask;
    // seen: the frame it was last gathered; rect: the texels it covered when last drawn moving (x0 x1 y0 y1;
    // x0 > x1 none, `big` unknown); sphereOf: the geometry state its own bounding sphere was made for
    // copy: a big mesh's positions as last seen (kept up to date on every change, still or moving: _bigSync)
    const R = { sig: new Float64Array(SIG), n: 0, still: false, mask: 0, seen: 0, rect: new Int32Array([1, 0, 1, 0]), big: false, sphereOf: NaN, copy: null, tris: 0, trisOf: NaN };
    R.sig.set(s);
    return R;
  }

  /** The triangles a caster draws (kept per geometry state). */
  _tris(o, R) {
    const g = o.geometry, k = R.sig[16] * 1e6 + R.sig[20];
    if (R.trisOf !== k) {
      const c = g?.index ? g.index.count : g?.attributes?.position?.count ?? 0;
      R.tris = (Math.min(c, Number.isFinite(g?.drawRange.count) ? g.drawRange.count : c) / 3) * (o.isInstancedMesh ? o.count : 1);
      R.trisOf = k;
    }
    return R.tris;
  }

  /** What a caster's state is now, into `s`. */
  _state(o, s) {
    const e = o.matrixWorld.elements;
    for (let k = 0; k < 16; k++) s[k] = e[k];
    const g = o.geometry;
    const p = g?.attributes?.position;
    s[16] = g?.id ?? -1;
    s[17] = p ? (p.isInterleavedBufferAttribute ? p.data.version : p.version) : -1;
    s[18] = g?.index ? g.index.version : -1;
    s[19] = g ? g.drawRange.start : 0;
    s[20] = g ? (Number.isFinite(g.drawRange.count) ? g.drawRange.count : -1) : 0;
    s[21] = g?.groups?.length ?? 0;
    s[22] = o.material?.visible === false ? 0 : 1;
    s[23] = o.isInstancedMesh ? o.count : -1;
    s[24] = o.isInstancedMesh ? o.instanceMatrix.version : -1;
    s[25] = g?.isInstancedBufferGeometry ? (Number.isFinite(g.instanceCount) ? g.instanceCount : -1) : -1;
    s[26] = o.userData.rigidStamp ?? 0;
    s[27] = o.layers.mask & BOTH;
  }

  /** Every caster the shadow passes would draw now (no allocation once warm). */
  _gather(scene) {
    const L = this._list;
    L.length = 0;
    const walk = (o) => {
      if (o.visible === false) return;
      // (a rigid batch's source keeps its mask but is never drawn: its batch's shadow mesh casts for it)
      if ((o.isMesh || o.isPoints || o.isLine) && o.layers.mask & BOTH && !isRigidSource(o)) L.push(o);
      const c = o.children;
      for (let i = 0; i < c.length; i++) walk(c[i]);
    };
    walk(scene);
    return L;
  }

  // ------------------------------------------------------------------ rects of the map (texels)

  /** A world sphere's rect into `out` (the shadow camera is orthographic: a circle of texels), grown into it. */
  _grow(out, cx, cy, cz, r) {
    const v = this._c.set(cx, cy, cz).applyMatrix4(this._vp);
    const W = this.target.width, H = this.target.height, k = this._k;
    const x = (v.x * 0.5 + 0.5) * W, y = (v.y * 0.5 + 0.5) * H, rx = r * k * W + 2, ry = r * k * H + 2;
    if (!Number.isFinite(x + y + rx + ry)) {
      out[0] = 0;
      out[1] = W;
      out[2] = 0;
      out[3] = H;
      return;
    }
    out[0] = Math.min(out[0], Math.max(0, Math.floor(x - rx)));
    out[1] = Math.max(out[1], Math.min(W, Math.ceil(x + rx)));
    out[2] = Math.min(out[2], Math.max(0, Math.floor(y - ry)));
    out[3] = Math.max(out[3], Math.min(H, Math.ceil(y + ry)));
  }

  _empty(out) {
    out[0] = this.target.width;
    out[1] = 0;
    out[2] = this.target.height;
    out[3] = 0;
    return out;
  }

  /** A whole-map wipe this frame, and why (stats). */
  _full(why, o) {
    this.stats.fullBy[why]++;
    if (why === 'big') this.stats.bigName = o.name || o.parent?.name || o.type;
    return true;
  }

  /** Wipe this rect back to the still map this frame. */
  _wipe(a) {
    if (!(a[1] > a[0] && a[3] > a[2])) return;
    const Q = this._rects;
    if (this._n === RECTS) {
      // (too many: the last slot takes the bounds of the rest)
      const j = (RECTS - 1) * 4;
      Q[j] = Math.min(Q[j], a[0]);
      Q[j + 1] = Math.max(Q[j + 1], a[1]);
      Q[j + 2] = Math.min(Q[j + 2], a[2]);
      Q[j + 3] = Math.max(Q[j + 3], a[3]);
      return;
    }
    Q.set(a, this._n * 4);
    this._n++;
  }

  /**
   * The rect a plain mesh covers now into R.rect. A big one (more than BIG vertices) whose geometry changed
   * is not measured (R.big): a copy of its positions as last drawn (R.copy) tells where the parts that
   * change next were (_bigSync), so only they are wiped.
   */
  _cover(o, R) {
    const g = o.geometry, p = g?.attributes?.position;
    this._empty(R.rect);
    R.big = false;
    if (!p) return;
    if (bigCopyable(p)) {
      R.big = true;
      // (made once; from then on _bigSync keeps it as the mesh changes, so starting to move costs no copy)
      if (R.copy?.length !== p.array.length) R.copy = new Float32Array(p.array);
      return;
    }
    // its own bounding sphere, made again when its geometry changed (three never remakes it after an edit)
    const gv = R.sig[16] * 1e12 + R.sig[17] * 1e6 + R.sig[18];
    if (!g.boundingSphere || R.sphereOf !== gv) {
      if (p.count > BIG) {
        R.big = true;
        R.copy = null;
        return;
      }
      g.computeBoundingSphere();
      R.sphereOf = gv;
    }
    let s;
    if (o.isInstancedMesh) {
      o.computeBoundingSphere();
      s = this._sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld);
    } else s = this._sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    this._grow(R.rect, s.center.x, s.center.y, s.center.z, s.radius);
  }

  /**
   * A big mesh changed: its copy takes the new positions of the ranges that changed, and (`wipe`: it is
   * moving, so the frame's map holds it) the place they had is wiped back. Only for an edit of some of its
   * positions in place (the position's `updateRanges`: destructibles.js queueRange; three empties them when
   * it uploads, after this), the rest of it as it was (matrix, index, draw range, the same geometry).
   * False: the caller copies it whole (and wipes the whole map when it is moving).
   */
  _bigSync(o, R, s, wipe) {
    const old = R.sig, C = R.copy;
    if (!C) return false;
    for (let k = 0; k < SIG; k++) if (k !== 17 && old[k] !== s[k]) return false;
    const p = o.geometry.attributes.position, A = p.array, U = p.updateRanges;
    if (!U?.length || A.length !== C.length) return false;
    const e = o.matrixWorld.elements;
    const sc = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
    for (let u = 0; u < U.length; u++) {
      const a = Math.max(0, Math.floor(U[u].start / 3) * 3), b = Math.min(A.length, U[u].start + U[u].count);
      if (!(b > a)) continue;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = a; i < b; i += 3) {
        const x = C[i], y = C[i + 1], z = C[i + 2];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      if (wipe && x1 >= x0) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
        const r = 0.5 * Math.hypot(x1 - x0, y1 - y0, z1 - z0) * sc;
        const wx = e[0] * cx + e[4] * cy + e[8] * cz + e[12], wy = e[1] * cx + e[5] * cy + e[9] * cz + e[13], wz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
        const q = this._empty(this._r);
        this._grow(q, wx, wy, wz, r);
        this._wipe(q);
      }
      C.set(A.subarray(a, b), a);
    }
    return true;
  }

  /** An actor's moved bones at their old place (rigidBatch.js sync: `set.vacated`, 4 floats a sphere). */
  _vacated(o) {
    const set = rigidShadowSet(o);
    if (!set) return false;
    const V = set.vacated, n = set.vacatedN | 0;
    if (!n) return true;
    const a = this._empty(this._r);
    for (let i = 0; i < n; i++) this._grow(a, V[i * 4], V[i * 4 + 1], V[i * 4 + 2], V[i * 4 + 3]);
    this._wipe(a);
    return true;
  }

  // ------------------------------------------------------------------ the frame

  /**
   * Draw the frame's shadow map into `target`. `draw()` is the pipeline's own two passes (the plain casters
   * with the depth material on LAYER_CASTER, then the rigid batches with the bone depth material on
   * LAYER_CASTER_RIGID), run with the render target already set and cleared as needed; `key` = [centre x,
   * centre z, moon x, moon y, moon z, map size]; `cam` the shadow camera. Returns false (and draws nothing)
   * when the cache cannot work here: the caller then draws the map whole, as before.
   */
  render(scene, key, draw, cam) {
    if (this.off) return false;
    const r = this.renderer;
    // the shadow camera's view-projection, and NDC per metre (orthographic: the same everywhere)
    this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._k = cam.projectionMatrix.elements[0] * 0.5;
    const L = this._gather(scene);
    const rec = this.rec, s = this._sig, settle = this.settle;
    this.frame++;
    this._n = 0;
    let all = false;
    let why = '';
    for (let k = 0; k < 6; k++) {
      if (this.key[k] !== key[k]) {
        why ||= 'view';
        this.key[k] = key[k];
      }
    }
    if (this.dirty) why ||= 'reset';
    let moving = 0, still = 0;
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      this._state(o, s);
      let R = rec.get(o);
      let changed = false;
      if (!R) {
        R = this._record(s);
        rec.set(o, R);
        const p = o.geometry?.attributes?.position;
        if (bigCopyable(p)) R.copy = new Float32Array(p.array); // (once, at its first sight: the level's build)
        changed = true; // (new: nothing of it to wipe; its cover is made below)
      } else {
        let same = !(o.isSkinnedMesh || (o.morphTargetInfluences && o.morphTargetInfluences.length));
        for (let k = 0; same && k < SIG; k++) if (R.sig[k] !== s[k]) same = false;
        if (same) R.n++;
        else {
          changed = true;
          R.n = 0;
          // a big mesh: its copy follows every change (only where it changed), still or moving
          let bigOk = true;
          if (R.copy) {
            bigOk = this._bigSync(o, R, s, !R.still);
            if (!bigOk) {
              const A = o.geometry?.attributes?.position?.array;
              if (A && A.length === R.copy.length) R.copy.set(A);
              else R.copy = null;
            }
          }
          if (R.still) {
            R.still = false; // it moved: out of the still map, which must be drawn again without it
            why ||= 'moved';
          } else if (o.userData.rigidBatch) {
            // an actor: its moved bones where they were
            if (!this._vacated(o)) all = this._full('actor', o);
          } else {
            // a plain mesh: where it was (a big one: where its changed parts were)
            if (R.big) {
              if (!bigOk || !R.copy) all = this._full('big', o);
            } else this._wipe(R.rect);
          }
          R.sig.set(s);
        }
        if (!R.still && R.n >= (this._tris(o, R) > this.bigTris ? this.settleBig : settle)) {
          R.still = true; // at rest long enough: into the still map
          why ||= 'settled';
        }
      }
      R.seen = this.frame;
      if (R.still) still++;
      else {
        moving++;
        if (changed && !o.userData.rigidBatch) this._cover(o, R);
      }
    }
    // one that left (hidden, off the layers, gone from the scene): out of the still map, or off the frame's
    for (const [o, R] of rec) {
      if (R.seen === this.frame) continue;
      if (R.still) why ||= 'left';
      else all = this._full('left', o);
      rec.delete(o);
    }
    try {
      if (why) {
        // the still map: the still casters alone
        this._mask(L, false);
        r.setRenderTarget(this.still);
        r.setClearColor(0xffffff, 1);
        r.clear();
        draw();
        this._restore(L);
        this.dirty = false;
        this.stats.redraws++;
      }
      // the frame's map: wiped back to the still map where it changed, then the moving casters over it (the
      // target is set first so its framebuffer exists and the scissor test is off; a blit binds its own
      // framebuffers, so it is set again after)
      r.setRenderTarget(this.target);
      if (why || all || this._all) {
        this._copyDepth(0, this.target.width, 0, this.target.height);
        this.stats.full++;
        if (why) this.stats.fullBy.redraw++;
      } else {
        const Q = this._rects;
        for (let i = 0; i < this._n; i++) this._copyDepth(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]);
      }
      this._all = false;
      r.setRenderTarget(this.target);
      if (moving) {
        this._mask(L, true);
        draw();
        this._restore(L);
      }
    } catch (err) {
      this._restore(L);
      this.off = true;
      console.warn('shadow cache: off, the shadow map is drawn whole every frame', err);
      return false;
    }
    const st = this.stats;
    st.frames++;
    st.moving = moving;
    st.still = still;
    st.why = why;
    return true;
  }

  /**
   * The still map's depth into the target's, in a rect (texels): one framebuffer blit. Not three's
   * copyTextureToTexture: it reads the GL's unpack state back (getParameter, a round trip to the GPU
   * process in Chrome), about 0.7 ms of the CPU a frame, more than the cache saves on most levels.
   */
  _copyDepth(x0, x1, y0, y1) {
    if (!(x1 > x0 && y1 > y0)) return;
    const gl = this.gl, r = this.renderer, st = r.state, P = r.properties;
    const src = P.get(this.still).__webglFramebuffer, dst = P.get(this.target).__webglFramebuffer;
    if (!src || !dst) throw new Error('shadow cache: a framebuffer is missing');
    st.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
    gl.blitFramebuffer(x0, y0, x1, y1, x0, y0, x1, y1, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    st.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    this.stats.copied += (x1 - x0) * (y1 - y0);
  }

  /** Leave on the shadow layers only the moving casters (`moving` true) or only the still ones. */
  _mask(L, moving) {
    for (let i = 0; i < L.length; i++) {
      const o = L[i], R = this.rec.get(o);
      R.mask = o.layers.mask;
      if (R.still === moving) o.layers.mask &= ~BOTH;
    }
  }

  _restore(L) {
    for (let i = 0; i < L.length; i++) {
      const R = this.rec.get(L[i]);
      if (R && R.mask) L[i].layers.mask = R.mask;
      if (R) R.mask = 0;
    }
  }

  dispose() {
    this.still.dispose();
    this.renderer?.domElement?.removeEventListener?.('webglcontextrestored', this._lost);
  }
}
