import * as THREE from 'three';
import { createWyrmLetterAtlas } from '../../render/wyrmGlyphs.js';

// THE AIR'S LETTERS: the living world's letters in the air (the wind's wisps, the weather's mist,
// devils, rain, snow, embers) printed in THE HOUSE LETTER: the wyrm's pixel font (render/wyrmGlyphs.js,
// 5 x 8 px at 720p, the cell the art pass prints at, following its font as the frame size changes),
// pixel-exact, one cell per letter, whatever the letter's distance. Each letter floats free: it is a
// point in the world projected to the screen and printed there, its cell's corner snapped to the
// pixel (or, `snap` 1, to the art grid itself). Soft depth test against the scene like the glyph
// particles, drawn in the FX pass.
//
//   const b = new LetterBatch(game, max, ".,'-~", { additive, spawned, snap, rand })   (made with a
//   seeded stream standing in for Math.random: three.js draws uuids; `rand` serves the atlas's later)
//   game.pipeline.registerParticles(b)
//   b.col(ch)                          the atlas column of a letter of `chars` (0: blank)
//   each frame: b.begin(); b.flow(dt, t) (the spawned ones age); b.put(...) (the written ones); b.end()
//   b.spawn({ x, y, z, vx, vy, vz, life, col, color, colorEnd, alpha, alphaEnd, drag, gravity, flicker })
//
// Two kinds of letters share the batch: WRITTEN ones (put: placed every frame by their owner, so a clump
// can stretch, curl and thin as one shape) and SPAWNED ones (spawn: a falling drop or flake that moves
// and fades by itself, aged by flow()). No allocation per frame; no Math.random.

const PF = 20;
// spawned: 0 x 1 y 2 z 3 vx 4 vy 5 vz 6 age 7 life 8 col 9 r 10 g 11 b 12 r1 13 g1 14 b1 15 a0 16 a1
//          17 drag 18 gravity 19 flicker

export class LetterBatch {
  constructor(game, max, chars, { additive = false, spawned = 0, snap = 0, rand = null } = {}) {
    const U = game.U;
    this.game = game;
    // (the stream three.js's uuid of a rebuilt atlas draws from: never Math.random)
    this._rand = rand;
    this.max = max;
    this.chars = chars;
    this.count = 0;
    this.n = 0;
    this._cols = new Map([...chars].map((c, i) => [c, i + 1]));
    // the spawned letters' own store (a share of `max`)
    this.maxP = Math.max(0, Math.min(max, spawned | 0));
    this.p = new Float32Array(Math.max(1, this.maxP) * PF);
    this.np = 0;
    this._font = '';
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iData', this.iData);
    geo.setAttribute('iColor', this.iColor);
    geo.instanceCount = 0;
    this.geometry = geo;
    this.uniforms = {
      tArt: { value: null },
      uCols: { value: chars.length + 1 },
      uCell: { value: new THREE.Vector2(5, 8) },
      uRes: U.uResolution,
      uSnap: { value: snap },
      uDepth: { value: null },
      uNear: { value: 1 },
      uFar: { value: 200 },
      uSoft: { value: 0.6 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iData;   // (unused), atlas column, (unused), (unused)
        attribute vec4 iColor;  // rgb, alpha
        uniform vec2 uCell;
        uniform vec2 uRes;
        uniform float uSnap;
        varying vec2 vUv;
        varying vec4 vColor;
        varying float vCol;
        varying float vViewZ;
        void main() {
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          vViewZ = -mv.z;
          vec4 c = projectionMatrix * mv;
          // the point on the screen (px), its letter's cell: corner on a whole pixel (or on the art grid)
          vec2 px = (c.xy / c.w * 0.5 + 0.5) * uRes;
          vec2 corner = uSnap > 0.5 ? floor(px / uCell) * uCell : floor(px - 0.5 * uCell + 0.5);
          vec2 q = corner + (position.xy + 0.5) * uCell;
          gl_Position = vec4((q / uRes * 2.0 - 1.0) * c.w, c.z, c.w);
          vUv = position.xy + 0.5;
          vColor = iColor;
          vCol = iData.y;
          // (behind the camera: nothing)
          if (c.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tArt;
        uniform float uCols;
        uniform sampler2D uDepth;
        uniform vec2 uRes;
        uniform float uNear;
        uniform float uFar;
        uniform float uSoft;
        varying vec2 vUv;
        varying vec4 vColor;
        varying float vCol;
        varying float vViewZ;
        float linearDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        void main() {
          float m = texture2D(tArt, vec2((vCol + clamp(vUv.x, 0.001, 0.999)) / uCols, clamp(vUv.y, 0.001, 0.999))).a;
          if (m < 0.02) discard;
          float sceneZ = linearDepth(texture2D(uDepth, gl_FragCoord.xy / uRes).r);
          float fade = clamp((sceneZ - vViewZ) / uSoft, 0.0, 1.0);
          float a = m * vColor.a * fade;
          gl_FragColor = vec4(vColor.rgb * a, a);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  /** The atlas column of a letter of this batch's `chars` (0: blank, a letter it does not have). */
  col(ch) {
    return this._cols.get(ch) ?? 0;
  }

  /** The art pass's font now (the frame size picks it): rebuild the letters when it changes. */
  _sync() {
    const P = this.game.pipeline, key = P?.artFont, cell = P?.artCell;
    if (cell?.x > 0 && cell?.y > 0) this.uniforms.uCell.value.set(cell.x, cell.y);
    if (!key || key === this._font || typeof document === 'undefined') return;
    const cut = key.lastIndexOf('x');
    const font = key.slice(0, cut), s = Number(key.slice(cut + 1)) || 1;
    const mr = Math.random;
    if (this._rand) Math.random = this._rand;
    try {
      const A = createWyrmLetterAtlas(font, s, this.chars);
      this.uniforms.tArt.value?.dispose?.();
      this.uniforms.tArt.value = A.texture;
      this.uniforms.uCols.value = A.total;
      this._font = key;
    } catch {
      this._font = key; // (no canvas: leave it blank rather than try every frame)
    } finally {
      Math.random = mr;
    }
  }

  begin() {
    this.n = 0;
    this._sync();
  }

  /** One written letter: world position, atlas column, linear colour, alpha. (`size` and `rot` are
   *  kept for the callers' shape: the house letter has one size and stands upright.) */
  put(x, y, z, size, col, rot, c, a) {
    const n = this.n;
    if (n >= this.max || !(a > 0.004) || !(x === x && y === y && z === z)) return;
    const P = this.iPos.array, D = this.iData.array, C = this.iColor.array;
    P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z;
    D[n * 4] = size; D[n * 4 + 1] = col; D[n * 4 + 2] = 0; D[n * 4 + 3] = 0;
    C[n * 4] = c[0]; C[n * 4 + 1] = c[1]; C[n * 4 + 2] = c[2]; C[n * 4 + 3] = a;
    this.n = n + 1;
  }

  /** A letter that moves and fades by itself (aged by flow). Returns false when the store is full. */
  spawn(o) {
    if (this.np >= this.maxP) return false;
    const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
    if (!(x === x && y === y && z === z)) return false;
    const d = this.p, k = this.np * PF, c0 = o.color ?? [1, 1, 1], c1 = o.colorEnd ?? c0;
    d[k] = x; d[k + 1] = y; d[k + 2] = z;
    d[k + 3] = o.vx ?? 0; d[k + 4] = o.vy ?? 0; d[k + 5] = o.vz ?? 0;
    d[k + 6] = 0; d[k + 7] = Math.max(0.01, o.life ?? 1);
    d[k + 8] = o.col ?? 0;
    d[k + 9] = c0[0]; d[k + 10] = c0[1]; d[k + 11] = c0[2];
    d[k + 12] = c1[0]; d[k + 13] = c1[1]; d[k + 14] = c1[2];
    d[k + 15] = o.alpha ?? 1; d[k + 16] = o.alphaEnd ?? 0;
    d[k + 17] = o.drag ?? 0; d[k + 18] = o.gravity ?? 0; d[k + 19] = o.flicker ?? 0;
    this.np++;
    return true;
  }

  /** Age and move the spawned letters, and write the living ones. */
  flow(dt, time = 0) {
    const d = this.p;
    let w = 0;
    for (let i = 0; i < this.np; i++) {
      const k = i * PF;
      const age = d[k + 6] + dt;
      if (age >= d[k + 7]) continue;
      if (w !== i) d.copyWithin(w * PF, k, k + PF);
      const o = w * PF;
      d[o + 6] = age;
      const drag = Math.exp(-d[o + 17] * dt);
      d[o + 3] *= drag;
      d[o + 4] = d[o + 4] * drag + d[o + 18] * dt;
      d[o + 5] *= drag;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      w++;
    }
    this.np = w;
    const P = this.iPos.array, D = this.iData.array, C = this.iColor.array;
    for (let i = 0; i < w && this.n < this.max; i++) {
      const k = i * PF, t = d[k + 6] / d[k + 7], n = this.n;
      let a = d[k + 15] + (d[k + 16] - d[k + 15]) * t;
      // (the first tenth of its life it fades in: nothing pops)
      a *= Math.min(1, t * 10);
      if (d[k + 19] > 0) a *= 1 - d[k + 19] * (0.5 + 0.5 * Math.sin(time * 23 + i * 1.7));
      if (!(a > 0.004)) continue;
      P[n * 3] = d[k]; P[n * 3 + 1] = d[k + 1]; P[n * 3 + 2] = d[k + 2];
      D[n * 4] = 0; D[n * 4 + 1] = d[k + 8]; D[n * 4 + 2] = 0; D[n * 4 + 3] = 0;
      C[n * 4] = d[k + 9] + (d[k + 12] - d[k + 9]) * t;
      C[n * 4 + 1] = d[k + 10] + (d[k + 13] - d[k + 10]) * t;
      C[n * 4 + 2] = d[k + 11] + (d[k + 14] - d[k + 11]) * t;
      C[n * 4 + 3] = a;
      this.n = n + 1;
    }
  }

  end() {
    this.count = this.n;
    this.geometry.instanceCount = this.n;
    this.iPos.needsUpdate = this.iData.needsUpdate = this.iColor.needsUpdate = true;
  }

  /** Nothing stays (the piece off, the world hidden, a reset). */
  empty() {
    this.n = this.count = this.np = 0;
    this.geometry.instanceCount = 0;
  }

  /** (the pipeline's particle frame does not age these: their owner writes them) */
  update() {}
}
