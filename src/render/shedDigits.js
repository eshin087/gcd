import * as THREE from 'three';

// SHED DIGITS: a struck thing sheds its letters. A blow knocks a few characters loose from what it
// hit: they fly off the hit point, fall, lie on the ground a moment and fade. A dissolving body
// (the dying wyrm) streams them the same way.
//
// They are the BODY'S OWN letters: each is one cell of the wyrm's pixel-font atlas (the art pass's
// tArt: its digits and stroke glyphs), drawn exactly one art cell big on screen (5x8 px at 720p)
// whatever the distance, snapped to whole pixels, so a loose digit is the same crisp character as
// the ones still on the body. One letter size for everything in the dragon look (docs/STYLE.md).
//
//   game.fx.shed.burst(x, y, z, dx, dz, n, look)      a blow at (x, y, z); (dx, dz) = the way they fly
//   game.fx.shed.stream(dt, x, y, z, r, rate, look)   digits falling off a body point, `rate` per s
//   look = { ink: [r, g, b], rim: [r, g, b], ember: [r, g, b], embers: 0..1, rims: 0..1 }
//
// Who sheds: a boss that carries a `shed` look (the Cinder Wyrm, dragon/model.js SHED) sheds at
// every landed cut ('player:hitDragon' carries the hit point). No per-frame allocation.

const FIELDS = 14;
// 0 x 1 y 2 z 3 vx 4 vy 5 vz 6 age 7 life 8 glyph 9 r 10 g 11 b 12 rest (1 = lies on the ground) 13 glow
const GRAVITY = -10;
const DRAG = 0.9;
const GROUND = 0.07;

// cosmetic noise from this module's own stream: the seeded sims replay the AI's Math.random
let seed = 0x51ed270b;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const rr = (a, b) => a + (b - a) * rnd();

export class ShedDigits {
  constructor(game, { max = 900 } = {}) {
    this.game = game;
    this.max = max;
    this.count = 0;
    this.data = new Float32Array(max * FIELDS);
    const P = game.pipeline, U = game.U ?? {};
    const A = P?.asciiMat?.uniforms;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.iColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iData', this.iData);
    geo.setAttribute('iColor', this.iColor);
    geo.instanceCount = 0;
    this.geometry = geo;
    // the art pass's own atlas, cell and layout (the same uniform objects: they follow a resize)
    this.uniforms = {
      tArt: A?.tArt ?? { value: null },
      uArtCell: A?.uArtCell ?? { value: new THREE.Vector2(5, 8) },
      uWyrmAtlas: A?.uWyrmAtlas ?? { value: new THREE.Vector4(10, 20, 28, 32) },
      uRes: U.uResolution ?? { value: new THREE.Vector2(1280, 720) },
      uDepth: { value: null },
      uNear: { value: 1 },
      uFar: { value: 200 },
      uSoft: { value: 0.35 },
      uBack: { value: 0.45 }, // the dark backing behind a loose letter (it reads over lit grass)
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec2 iData;   // atlas column, glow (> 0: no backing, the letter is its own light)
        attribute vec4 iColor;  // rgb, alpha
        uniform vec2 uRes;
        uniform vec2 uArtCell;
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec2 vData;
        varying float vViewZ;
        void main() {
          vec4 clip = projectionMatrix * viewMatrix * vec4(iPos, 1.0);
          vViewZ = clip.w;
          vUv = uv;
          vColor = iColor;
          vData = iData;
          if (clip.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          // one art cell, its corner on a whole pixel: the letter is pixel-exact at any distance
          vec2 px = floor((clip.xy / clip.w * 0.5 + 0.5) * uRes - 0.5 * uArtCell + 0.5) + uv * uArtCell;
          gl_Position = vec4(px / uRes * 2.0 - 1.0, clip.z / clip.w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tArt;
        uniform sampler2D uDepth;
        uniform vec4 uWyrmAtlas;
        uniform vec2 uRes;
        uniform float uNear;
        uniform float uFar;
        uniform float uSoft;
        uniform float uBack;
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec2 vData;
        varying float vViewZ;
        float linearDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        void main() {
          float m = texture2D(tArt, vec2((vData.x + clamp(vUv.x, 0.0, 0.999)) / uWyrmAtlas.w, vUv.y)).a;
          float sceneZ = linearDepth(texture2D(uDepth, gl_FragCoord.xy / uRes).r);
          float fade = clamp((sceneZ - vViewZ) / uSoft, 0.0, 1.0) * vColor.a;
          float back = uBack * (1.0 - step(0.5, vData.y));
          float a = max(m, back) * fade;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor.rgb * m * fade, a);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5; // over the fire's letters, under the sparks
    P?.registerParticles?.(this);

    // a landed cut on a boss in the dragon look knocks its letters loose
    game.events?.on?.('player:hitDragon', (d) => {
      const look = this.game.dragon?.shed, p = d?.point;
      if (!look || !p || d.guarded || !Number.isFinite(p.x + p.y + p.z)) return;
      // they fly off the body where the eye can follow them: toward the side the blow came from
      // and toward the camera (a letter that flies into the body is lost among its letters)
      const h = this.game.player?.position, c = this.game.camera?.position;
      let dx = 0, dz = 0;
      if (h) {
        const l = Math.hypot(h.x - p.x, h.z - p.z) || 1;
        dx += (h.x - p.x) / l;
        dz += (h.z - p.z) / l;
      }
      if (c) {
        const l = Math.hypot(c.x - p.x, c.z - p.z) || 1;
        dx += ((c.x - p.x) / l) * 0.8;
        dz += ((c.z - p.z) / l) * 0.8;
      }
      const l = Math.hypot(dx, dz);
      if (l > 1e-4) {
        dx /= l;
        dz /= l;
      } else dx = dz = 0;
      const light = d.kind === 'flurry' && !d.heavy;
      this.burst(p.x, p.y, p.z, dx, dz, light ? 4 : d.heavy || d.crit ? 20 : 12, look);
    });
  }

  /** A random column of the art atlas: mostly digits, sometimes a stroke glyph. */
  _glyph() {
    const a = this.uniforms.uWyrmAtlas.value;
    if (rnd() < 0.16) return a.z + Math.floor(rnd() * Math.max(1, a.w - a.z));
    return 1 + Math.floor(rnd() * Math.max(1, a.z - 1));
  }

  _spawn(x, y, z, vx, vy, vz, life, look) {
    if (this.count >= this.max || !(x === x && y === y && z === z)) return;
    const d = this.data, k = this.count++ * FIELDS;
    d[k] = x; d[k + 1] = y; d[k + 2] = z;
    d[k + 3] = vx; d[k + 4] = vy; d[k + 5] = vz;
    d[k + 6] = 0; d[k + 7] = life;
    d[k + 8] = this._glyph();
    const t = rnd();
    const ember = t < (look.embers ?? 0.25), rim = !ember && t < (look.embers ?? 0.25) + (look.rims ?? 0.2);
    const c = ember ? look.ember : rim ? look.rim : look.ink;
    const v = ember ? 1 : rr(0.75, 1.1);
    d[k + 9] = c[0] * v; d[k + 10] = c[1] * v; d[k + 11] = c[2] * v;
    d[k + 12] = 0;
    d[k + 13] = ember ? 1 : 0;
  }

  /** A blow at (x, y, z) knocks n letters loose; (dx, dz) = the unit ground direction they fly. */
  burst(x, y, z, dx, dz, n, look) {
    if (!look) return;
    for (let i = 0; i < n; i++) {
      // (a paw is struck near the ground: they are thrown up and out far enough to clear the body)
      const sp = rr(2, 6.5);
      this._spawn(
        x + dx * 0.3 + rr(-0.25, 0.25), y + rr(-0.2, 0.3), z + dz * 0.3 + rr(-0.25, 0.25),
        dx * sp + rr(-2.2, 2.2), rr(2.2, 6.2), dz * sp + rr(-2.2, 2.2),
        rr(1.1, 1.7), look,
      );
    }
  }

  /** Letters falling off a body point of radius r (m), `rate` per second: a body that dissolves. */
  stream(dt, x, y, z, r, rate, look) {
    if (!look) return;
    let n = rate * dt;
    n = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0);
    while (n-- > 0) {
      this._spawn(
        x + rr(-r, r), Math.max(0.1, y + rr(-r, r) * 0.7), z + rr(-r, r),
        rr(-0.9, 0.9), rr(0.3, 2.4), rr(-0.9, 0.9),
        rr(0.9, 1.6), look,
      );
    }
  }

  clear() {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  update(dt) {
    const d = this.data;
    let w = 0;
    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < this.count; i++) {
      const k = i * FIELDS;
      const age = d[k + 6] + dt;
      if (age >= d[k + 7]) continue;
      if (w !== i) d.copyWithin(w * FIELDS, k, k + FIELDS);
      const o = w * FIELDS;
      d[o + 6] = age;
      if (d[o + 12] < 0.5) {
        d[o + 3] *= drag;
        d[o + 4] = d[o + 4] * drag + GRAVITY * dt;
        d[o + 5] *= drag;
        d[o] += d[o + 3] * dt;
        d[o + 1] += d[o + 4] * dt;
        d[o + 2] += d[o + 5] * dt;
        if (d[o + 1] <= GROUND && d[o + 4] < 0) {
          // it has landed: it lies where it fell and fades
          d[o + 1] = GROUND;
          d[o + 12] = 1;
          d[o + 7] = Math.min(d[o + 7], age + 0.55);
        }
      }
      w++;
    }
    this.count = w;
    const P = this.iPos.array, D = this.iData.array, C = this.iColor.array;
    for (let i = 0; i < w; i++) {
      const k = i * FIELDS;
      const left = d[k + 7] - d[k + 6];
      P[i * 3] = d[k]; P[i * 3 + 1] = d[k + 1]; P[i * 3 + 2] = d[k + 2];
      D[i * 2] = d[k + 8];
      D[i * 2 + 1] = d[k + 13];
      // struck loose in the flash of the blow: brighter for its first instant
      const lit = 1 + 0.7 * Math.exp(-d[k + 6] * 9);
      C[i * 4] = d[k + 9] * lit; C[i * 4 + 1] = d[k + 10] * lit; C[i * 4 + 2] = d[k + 11] * lit;
      C[i * 4 + 3] = left < 0.4 ? left / 0.4 : 1; // the last 0.4 s it fades
    }
    this.geometry.instanceCount = w;
    this.iPos.needsUpdate = this.iData.needsUpdate = this.iColor.needsUpdate = true;
  }
}
