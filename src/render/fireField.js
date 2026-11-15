import * as THREE from 'three';
import { FIRE_PALETTES, FIRE_SMOKE, FIRE_KIND } from './firePalettes.js';

// The fire field (ADR-101): fire, void fire, sparks and smoke as ONE body of heat printed in the
// wyrm's small digits, instead of separate big glyph sprites.
//
//   game.fx.fire.spawn({ x, y, z, vx, vy, vz, life: 0.7, size: 1.2, sizeEnd: 3.0,
//                        heat: 0.8, heatEnd: 0.2, kind: 'fire', drag: 1, gravity: 2.5 });
//
// A blob is a soft round patch of heat, `size` metres across, that moves like a particle. Blobs are
// drawn additively into a small heat buffer with ONE texel per character cell; where they overlap
// the heat adds up, so a dense stream has a white-hot heart and a cool ragged rim with no work from
// the emitter. Then, per cell: noise that scrolls upward makes the heat climb and tear into tongues
// (the flame pass), and the print pass turns each cell's heat into one small letter: dim strokes at
// the rim, digits in the body, round bright digits in the heart, coloured by firePalettes.js.
//
// Frame order (pipeline.js): scene -> [blobs -> heat] -> [flame pass] -> ASCII pass -> FX pass, where
// the print quad draws first and the glyph particles (sparks, embers) on top.
//
// kinds (firePalettes.js FIRE_KIND): 'fire', 'void' (the Starless Lord's), 'steel' (crisp: sparks,
// glints, cuts; no turbulence, a thin line prints as the stroke that runs along it), 'smoke' (grey
// letters where there is no fire). Where kinds overlap in a cell the hottest one prints.

const FIELDS = 15;
// 0 x 1 y 2 z 3 vx 4 vy 5 vz 6 age 7 life 8 size 9 sizeEnd 10 heat 11 heatEnd 12 kind 13 drag 14 gravity
const HEAT_ENC = 0.4; // heat is stored scaled, so a byte target (no float buffers) still holds 2.5
const PALS = ['fire', 'void', 'steel'];

const NOISE = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.07 + 3.1) * 0.3 + vnoise(p * 4.3 + 7.7) * 0.15; }
`;
const FS_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FireField {
  constructor(U, { max = 6000 } = {}) {
    this.U = U;
    this.max = max;
    this.count = 0;
    this.data = new Float32Array(max * FIELDS);
    this.active = false; // the flame texture holds something this frame
    this._warm = 0;
    this._broken = false;
    this._clear = new THREE.Color();
    this.cells = new THREE.Vector2(4, 4);

    // --- blobs
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iData', this.iData);
    geo.instanceCount = 0;
    this.geometry = geo;
    this.blobMat = new THREE.ShaderMaterial({
      uniforms: {
        uCamRight: U.uCamRight, uCamUp: U.uCamUp, uDepth: { value: null },
        uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 1 }, uFar: { value: 200 }, uSoft: { value: 0.9 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec3 iData; // size (m), heat, kind
        uniform vec3 uCamRight;
        uniform vec3 uCamUp;
        varying vec2 vUv;
        varying vec4 vHeat;
        varying float vViewZ;
        void main() {
          vec3 wp = iPos + (uCamRight * position.x + uCamUp * position.y) * iData.x;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          float k = iData.z;
          vHeat = vec4(1.0 - step(0.5, k), step(0.5, k) - step(1.5, k), step(1.5, k) - step(2.5, k), step(2.5, k)) * iData.y;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uDepth;
        uniform vec2 uRes;
        uniform float uNear;
        uniform float uFar;
        uniform float uSoft;
        varying vec2 vUv;
        varying vec4 vHeat;
        varying float vViewZ;
        float linearDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          float w = exp(-3.2 * r2) * (1.0 - r2);
          float sceneZ = linearDepth(texture2D(uDepth, gl_FragCoord.xy / uRes).r);
          float fade = clamp((sceneZ - vViewZ) / uSoft, 0.0, 1.0);
          gl_FragColor = vHeat * (w * fade * ${HEAT_ENC.toFixed(2)});
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.blobs = new THREE.Mesh(geo, this.blobMat);
    this.blobs.frustumCulled = false;
    this.blobScene = new THREE.Scene();
    this.blobScene.add(this.blobs);

    // --- flame pass: one texel per cell. Out: r heat, g smoke, b the letter's roll, a kind + stroke
    const turb = PALS.map((k) => {
      const p = FIRE_PALETTES[k];
      return new THREE.Vector4(p.lick, p.erode, p.boil, p.warp);
    });
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: {
        tHeat: { value: null }, uCells: { value: this.cells }, uTime: U.uTime, uGain: { value: 1 }, uTurb: { value: turb },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tHeat;
        uniform vec2 uCells;
        uniform float uTime;
        uniform float uGain;
        uniform vec4 uTurb[3]; // per kind (fire, void, steel): lick, erode, boil, warp
        ${NOISE}
        vec4 field(vec2 c) { return texture2D(tHeat, (c + 0.5) / uCells) * ${(1 / HEAT_ENC).toFixed(2)}; }
        void main() {
          vec2 cell = floor(gl_FragCoord.xy);
          float t = uTime;
          // noise that scrolls upward: flames climb
          float n1 = fbm(cell * vec2(0.085, 0.05) + vec2(0.0, -t * 1.9));
          float n2 = fbm(cell * vec2(0.17, 0.09) + vec2(5.2, -t * 3.1));
          vec2 warp = vec2((n2 - 0.5) * 2.4, (n1 - 0.5) * 1.2);
          vec4 c0 = field(cell);
          vec4 fw = field(cell + warp);
          float hf = mix(c0.r, fw.r, min(uTurb[0].w, 1.0));
          float hv = mix(c0.b, fw.b, min(uTurb[1].w, 1.0));
          float sm = fw.g;
          // tongues: the heat of the cells below rises, leaning with the noise, thinning as it climbs
          float lf = 0.0, lv = 0.0, ls = 0.0;
          for (int k = 1; k <= 9; k++) {
            float fk = float(k);
            vec4 f = field(cell + warp + vec2((n2 - 0.5) * 1.7 * fk, -fk));
            float keep = pow(0.56 + 0.4 * n1, fk);
            lf = max(lf, f.r * keep);
            lv = max(lv, f.b * keep);
            ls = max(ls, f.g * pow(0.86, fk));
          }
          hf = max(hf, lf * uTurb[0].x);
          hv = max(hv, lv * uTurb[1].x);
          sm = max(sm, ls);
          // erosion: tears the cool rim into separate tongues, leaves the hot heart whole
          float er = fbm(cell * vec2(0.21, 0.12) + vec2(1.7, -t * 2.7));
          float clump = fbm(cell * vec2(0.045, 0.03) + vec2(9.1, -t * 1.1));
          float body = (0.4 + 1.2 * er) * (0.7 + 0.6 * clump);
          float cut = 0.12 * (1.0 - er);
          hf = mix(hf, hf * body - cut, uTurb[0].y);
          hv = mix(hv, hv * body - cut, uTurb[1].y);
          sm *= 0.55 + 0.9 * er;
          float hs = c0.a; // steel: crisp, no turbulence
          // the hottest kind prints
          float h = hf, kind = 0.0;
          if (hv > h) { h = hv; kind = 1.0; }
          float dir = -1.0;
          if (hs > h) {
            h = hs; kind = 2.0;
            // a thin line of steel prints as the stroke that runs along it: the brightest of the
            // four directions through this cell
            float d0 = field(cell + vec2(1.0, 0.0)).a + field(cell - vec2(1.0, 0.0)).a;
            float d1 = field(cell + vec2(1.0, 1.0)).a + field(cell - vec2(1.0, 1.0)).a;
            float d2 = field(cell + vec2(0.0, 1.0)).a + field(cell - vec2(0.0, 1.0)).a;
            float d3 = field(cell + vec2(-1.0, 1.0)).a + field(cell - vec2(-1.0, 1.0)).a;
            float best = max(max(d0, d1), max(d2, d3));
            float least = min(min(d0, d1), min(d2, d3));
            if (best - least > 0.25 * best) dir = best == d0 ? 0.0 : best == d1 ? 1.0 : best == d2 ? 2.0 : 3.0;
          }
          h *= uGain;
          // the letter: re-rolled a few times a second, each cell on its own beat (the fire boils)
          float boil = kind < 0.5 ? uTurb[0].z : kind < 1.5 ? uTurb[1].z : uTurb[2].z;
          float beat = floor(t * boil + hash12(cell * 0.73) * 7.0);
          float roll = hash12(cell * 1.37 + beat * 17.3);
          gl_FragColor = vec4(max(h, 0.0) * ${HEAT_ENC.toFixed(2)}, sm, roll, (kind + (dir + 1.0) * 0.125) * 0.25);
        }
      `,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });

    // --- print: one small letter per cell, drawn over the frame before the glyph particles
    const stops = [], pal = [];
    for (const k of PALS) {
      const p = FIRE_PALETTES[k];
      for (const s of p.stops) stops.push(new THREE.Vector3(s[0] * p.hdr, s[1] * p.hdr, s[2] * p.hdr));
      pal.push(new THREE.Vector4(p.fill, p.back[0], p.back[1], 0));
    }
    this.printMat = new THREE.ShaderMaterial({
      uniforms: {
        tFlame: { value: null }, tArt: { value: null }, uAtlas: { value: new THREE.Vector4(10, 20, 28, 32) },
        uCells: { value: this.cells }, uCell: { value: new THREE.Vector2(5, 8) }, uScreen: { value: new THREE.Vector2(1, 1) },
        uStops: { value: stops }, uPal: { value: pal },
        uSmoke: { value: new THREE.Vector4(...FIRE_SMOKE.color, FIRE_SMOKE.back) },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tFlame;
        uniform sampler2D tArt;
        uniform vec4 uAtlas;   // wyrm atlas columns: mid set start, bright set start, stroke start, total
        uniform vec2 uCells;
        uniform vec2 uCell;    // the art cell, px
        uniform vec2 uScreen;  // the frame, px
        uniform vec3 uStops[15];
        uniform vec4 uPal[3];  // per kind: fill, rim backing, body backing
        uniform vec4 uSmoke;
        vec3 ramp(int p, float h) {
          vec3 c = mix(uStops[p * 5], uStops[p * 5 + 1], smoothstep(0.08, 0.42, h));
          c = mix(c, uStops[p * 5 + 2], smoothstep(0.4, 0.9, h));
          c = mix(c, uStops[p * 5 + 3], smoothstep(0.85, 1.45, h));
          return mix(c, uStops[p * 5 + 4], smoothstep(1.4, 2.3, h));
        }
        void main() {
          vec2 px = gl_FragCoord.xy;
          vec2 cell = floor(px / uCell);
          vec2 local = (px - cell * uCell) / uCell;
          vec4 f = texture2D(tFlame, (cell + 0.5) * uCell / uScreen);
          float h = f.r * ${(1 / HEAT_ENC).toFixed(2)};
          float vis = smoothstep(0.05, 0.11, h);
          float sv = smoothstep(0.1, 0.5, f.g) * (1.0 - vis);
          if (vis + sv < 0.004) discard;
          float code = f.a * 4.0;
          float kind = floor(code + 0.01);
          float dir = floor(fract(code) * 8.0 + 0.5) - 1.0;
          int p = int(kind);
          float roll = f.b;
          float s0 = h < 0.45 ? 1.0 : h < 1.0 ? uAtlas.x : uAtlas.y;
          float s1 = h < 0.45 ? uAtlas.x : h < 1.0 ? uAtlas.y : uAtlas.z;
          float idx = s0 + min(floor(roll * (s1 - s0)), s1 - s0 - 1.0);
          // the cool rim: upright and leaning strokes (the tips of the tongues)
          if (h < 0.24) idx = uAtlas.z + (roll < 0.56 ? 2.0 : roll < 0.78 ? 1.0 : 3.0);
          // a thin line of steel: the stroke that runs along it
          if (dir >= 0.0 && h < 1.2) idx = uAtlas.z + dir;
          // smoke only: a dim letter
          if (vis < 0.004) idx = 1.0 + min(floor(fract(roll * 7.13) * (uAtlas.x - 1.0)), uAtlas.x - 2.0);
          float m = texture2D(tArt, vec2((idx + local.x) / uAtlas.w, local.y)).a;
          vec4 pl = uPal[p];
          float body = smoothstep(0.3, 1.2, h);
          float heart = smoothstep(1.1, 2.0, h);
          vec4 fire = vec4(ramp(p, h) * (m + (1.0 - m) * (pl.x * body + 0.3 * heart)), max(m, mix(pl.y, pl.z, body))) * vis;
          vec4 smoke = vec4(uSmoke.rgb * m, max(m * 0.9, uSmoke.a)) * sv;
          gl_FragColor = fire + smoke * (1.0 - fire.a);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    /** The print quad: the pipeline adds it to the FX scene (it draws before the glyph particles). */
    this.mesh = new THREE.Mesh(tri, this.printMat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.visible = false;
    this.heatRT = null;
    this.flameRT = null;
  }

  /** Pipeline: the targets (type = the frame targets' type) and the scene depth the blobs test against. */
  init(type, depthTexture) {
    const opts = { type, depthBuffer: false };
    this.heatRT = new THREE.WebGLRenderTarget(4, 4, { ...opts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.flameRT = new THREE.WebGLRenderTarget(4, 4, { ...opts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.blobMat.uniforms.uDepth.value = depthTexture;
    this.flameMat.uniforms.tHeat.value = this.heatRT.texture;
    this.printMat.uniforms.tFlame.value = this.flameRT.texture;
  }

  /** Pipeline: the frame is W x H px, the art cell `cell` px, `art` the wyrm's letter atlas. */
  setSize(W, H, cell, art) {
    if (!this.heatRT) return;
    const w = Math.max(1, Math.ceil(W / cell.x)), h = Math.max(1, Math.ceil(H / cell.y));
    this.cells.set(w, h);
    this.heatRT.setSize(w, h);
    this.flameRT.setSize(w, h);
    this.blobMat.uniforms.uRes.value.set(w, h);
    const u = this.printMat.uniforms;
    u.uCell.value.copy(cell);
    // the texel grid covers w * cell px: the print pass looks its cell up in that frame
    u.uScreen.value.set(w * cell.x, h * cell.y);
    u.tArt.value = art.texture;
    u.uAtlas.value.set(art.sets[0], art.sets[1], art.sets[2], art.total);
    this._stale = true;
  }

  /**
   * One blob of heat. `size` / `sizeEnd`: metres across at birth / death; `heat` / `heatEnd`: what it
   * adds at its centre (overlaps add up: ~0.4 a cool rim, ~1 the body, 2+ the white heart); `kind`:
   * 'fire' (default) | 'void' | 'steel' | 'smoke' (or a FIRE_KIND number); `gravity` > 0 rises.
   */
  spawn(o) {
    if (this.count >= this.max) return -1;
    const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
    if (!(x === x && y === y && z === z)) return -1; // NaN never reaches the buffer
    const d = this.data, k = this.count * FIELDS;
    const kind = o.kind;
    d[k] = x; d[k + 1] = y; d[k + 2] = z;
    d[k + 3] = o.vx ?? 0; d[k + 4] = o.vy ?? 0; d[k + 5] = o.vz ?? 0;
    d[k + 6] = 0; d[k + 7] = Math.max(0.01, o.life ?? 1);
    d[k + 8] = o.size ?? 1; d[k + 9] = o.sizeEnd ?? d[k + 8];
    d[k + 10] = o.heat ?? 0.6; d[k + 11] = o.heatEnd ?? d[k + 10] * 0.35;
    d[k + 12] = typeof kind === 'number' ? kind : FIRE_KIND[kind] ?? 0;
    d[k + 13] = o.drag ?? 0; d[k + 14] = o.gravity ?? 0;
    return this.count++;
  }

  clear() {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  update(dt) {
    const d = this.data;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const k = i * FIELDS;
      const age = d[k + 6] + dt;
      if (age >= d[k + 7]) continue;
      if (w !== i) d.copyWithin(w * FIELDS, k, k + FIELDS);
      const o = w * FIELDS;
      d[o + 6] = age;
      const drag = Math.exp(-d[o + 13] * dt);
      d[o + 3] *= drag;
      d[o + 4] = d[o + 4] * drag + d[o + 14] * dt;
      d[o + 5] *= drag;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      w++;
    }
    this.count = w;
    const P = this.iPos.array, D = this.iData.array;
    for (let i = 0; i < w; i++) {
      const k = i * FIELDS;
      const t = d[k + 6] / d[k + 7];
      P[i * 3] = d[k]; P[i * 3 + 1] = d[k + 1]; P[i * 3 + 2] = d[k + 2];
      D[i * 3] = d[k + 8] + (d[k + 9] - d[k + 8]) * t;
      // the last sixth of its life a blob fades out, so nothing pops
      D[i * 3 + 1] = (d[k + 10] + (d[k + 11] - d[k + 10]) * t) * Math.min(1, (1 - t) * 6);
      D[i * 3 + 2] = d[k + 12];
    }
    this.geometry.instanceCount = w;
    this.iPos.needsUpdate = this.iData.needsUpdate = true;
  }

  /** Pipeline, after the scene pass: blobs -> heat buffer -> flame texture. Cheap when nothing burns. */
  render(renderer, camera, fs) {
    if (!this.heatRT || this._broken) return;
    const live = this.count > 0;
    if (!live && this._warm <= 0) {
      if (this.active || this._stale) {
        // leave an empty flame texture behind (the ASCII pass may read it)
        renderer.getClearColor(this._clear);
        const a = renderer.getClearAlpha();
        renderer.setRenderTarget(this.flameRT);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.setClearColor(this._clear, a);
        this.active = false;
        this._stale = false;
        this.mesh.visible = false;
      }
      return;
    }
    try {
      const u = this.blobMat.uniforms;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      renderer.getClearColor(this._clear);
      const a = renderer.getClearAlpha(), ac = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(this.heatRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.blobScene, camera);
      renderer.setClearColor(this._clear, a);
      renderer.autoClear = ac;
      fs.render(renderer, this.flameMat, this.flameRT);
      this.active = true;
      this.mesh.visible = true;
      // two more frames after the last blob dies: the tongues above it finish
      this._warm = live ? 2 : this._warm - 1;
    } catch (e) {
      this._broken = true; // never freeze the frame: the fire goes dark instead
      this.mesh.visible = false;
      console.warn('fire field disabled:', e);
    }
  }
}
