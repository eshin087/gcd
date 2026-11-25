import * as THREE from 'three';
import { COMMON_GLSL } from '../render/shaderLib.js';
import { gis } from '../render/glyphs.js';
import { GRASS } from './grassTuning.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';
import { GrassSpray, sprayLook } from './grassSpray.js';

// The cut tops (ADR: grass the sword cuts, round 2). When a tear (world/scorch.js: the sword's mow, a
// mark's blow) cuts a blade, the blade's stub stays in the meadow (grass.js: the lower part of its own
// letter) and its TOP, the very upper part of that letter, in its own colour, is handed here on the
// same frame: one instance of this batch, drawn exactly where the blade's top was, which then flies,
// topples or bursts (the look, `?mowLook=`), lands, lies a while and thins away. So a blade never pops
// from whole to stub: its top is seen leaving.
//   mowLook   'a' thrown (a spray of grass letters launched along the swing; the default)
//             'b' sliced (the tops topple off their stubs and lie; a few fly)
//             'c' shred  (each top bursts into a couple of the grass's own strokes, flung)
//             'r1'       round 1 (no tops: the stub appears at once, the shader lays a pale top beside it)
// Blades are found under a cut through a bucket grid of the grass's instances on the scorch map's cells
// (built once). A blade is cut when the bilinear torn value there x GRASS.blade.gain passes its own
// threshold: the test the grass shader makes, so the top leaves on the frame its stub shows.
// No Math.random (the module's own stream; the batch is built through a local stream for three's uuids).
// No allocation per frame: fixed typed arrays, the batch's buffers are rewritten up to the live count.

/** The cut's look (`?mowLook=a|b|c|r1`): read once when the world is built. */
export const mowLook = () => {
  const v = lookOf('mowLook', GRASS.fly.look);
  return v === 'b' || v === 'c' || v === 'r1' ? v : 'a';
};

let seed = 0x2b61d9a3;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + (b - a) * rnd();
const fract = (v) => v - Math.floor(v);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const FLY = 0, TOPPLE = 1, LIE = 2;

export class MowFx {
  /** `grass`: world.grass (createGrass's result, with `blades`); `scorch`: the map it reads. */
  constructor(game, grass, scorch) {
    this.game = game;
    this.grass = grass;
    this.sc = scorch;
    this.look = mowLook();
    const F = GRASS.fly;
    // the look's own lying, thinning and light (b, sliced: quieter: GRASS.fly.slice)
    // (a, thrown, round 4: quiet too: GRASS.fly.throw; c keeps round 2's)
    const SL = this.look === 'b' ? F.slice : this.look === 'a' ? F.throw : F;
    this._lieT = SL.lie;
    this._thin = SL.thin;
    this._lit = SL.lit;
    const M = (this.max = F.max);
    this.n = 0;
    // per piece (SoA): position of its base, velocity, screen-plane rotation and spin, quad, colour
    this.px = new Float32Array(M); this.py = new Float32Array(M); this.pz = new Float32Array(M);
    this.vx = new Float32Array(M); this.vy = new Float32Array(M); this.vz = new Float32Array(M);
    this.rot = new Float32Array(M); this.spin = new Float32Array(M); this.rot0 = new Float32Array(M);
    this.lieRot = new Float32Array(M); this.age = new Float32Array(M); this.lie = new Float32Array(M);
    this.w = new Float32Array(M); this.h = new Float32Array(M); this.v0 = new Float32Array(M); this.v1 = new Float32Array(M);
    // (a chip of the spray: its colour is the blade's top's throughout, `tipMin`, and its own light)
    this.tipMin = new Float32Array(M); this.lit0 = new Float32Array(M); this.lit1 = new Float32Array(M);
    this.grav = new Float32Array(M); // (m/s2: a top falls as GRASS.fly.gravity, a chip lighter, GRASS.spray.gravity)
    this.glyph = new Float32Array(M); this.colv = new Float32Array(M); this.fade = new Float32Array(M);
    this.state = new Uint8Array(M); this.t0 = new Float32Array(M); this.y0 = new Float32Array(M);
    this.born = new Float32Array(M); // (game time it was cut: the oldest lying piece gives way first)
    this._all = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.rot, this.spin, this.rot0, this.lieRot, this.age, this.lie, this.w, this.h, this.v0, this.v1, this.tipMin, this.lit0, this.lit1, this.grav, this.glyph, this.colv, this.fade, this.state, this.t0, this.y0, this.born];
    this.thrown = 0; // pieces spawned since the last read (mowStats)
    this.total = 0;
    this.dropped = 0;
    this.arcCut = 0; // blades the drawn arc cut (the tests', the Lab's)
    this._frag = gis(F.shred.glyphs);
    // the blades: a bucket grid of instance indices on the scorch map's cells (CSR)
    const B = grass.blades, S = scorch.size, N = B.n;
    // the blade's top has left (255; cleared with the map): also a texture the grass shader reads by its
    // instance (a blade the sword's arc cut is a stub, exactly the blades it crossed, not a cell's share)
    const TW = GRASS.arc.tex;
    this.cut = new Uint8Array(TW * Math.ceil(N / TW));
    this.cutTex = new THREE.DataTexture(this.cut, TW, this.cut.length / TW, THREE.RedFormat, THREE.UnsignedByteType);
    this.cutTex.magFilter = this.cutTex.minFilter = THREE.NearestFilter;
    this.cutTex.generateMipmaps = false;
    this.cutTex.needsUpdate = true;
    this._texDirty = false;
    const gu = grass.mesh.material.uniforms;
    if (gu.uCutTex) {
      gu.uCutTex.value = this.cutTex;
      gu.uCutOn.value = 1;
    }
    this._cutAny = false;
    const cnt = new Int32Array(S * S + 1);
    const cellOf = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const c = scorch._idx(B.root[i * 4], B.root[i * 4 + 1]);
      cellOf[i] = c;
      if (c >= 0) cnt[c + 1]++;
    }
    for (let c = 0; c < S * S; c++) cnt[c + 1] += cnt[c];
    this.start = cnt;
    this.idx = new Int32Array(N);
    const fill = Int32Array.from(cnt.subarray(0, S * S));
    for (let i = 0; i < N; i++) if (cellOf[i] >= 0) this.idx[fill[cellOf[i]]++] = i;
    this._seen = new Uint32Array(S * S);
    this._stamp = 0;
    // the batch: one quad per piece, billboarded as the blades are
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(M * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.InstancedBufferAttribute(new Float32Array(M * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(M * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aP', this.aP);
    geo.setAttribute('aS', this.aS);
    geo.setAttribute('aC', this.aC);
    this.aT = new THREE.InstancedBufferAttribute(new Float32Array(M), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aT', this.aT);
    geo.instanceCount = 0;
    this.geo = geo;
    const U = game.U;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime, uMoonDir: U.uMoonDir, uMoonColor: U.uMoonColor, uAmbient: U.uAmbient,
        uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uFocus: U.uFocus,
        uCamPos: U.uCamPos, uPLPos: U.uPLPos, uPLCol: U.uPLCol, uPLRad: U.uPLRad,
        uShadowMap: U.uShadowMap, uShadowMatrix: U.uShadowMatrix, uShadowTexel: U.uShadowTexel,
        uGlyphAtlas: U.uGlyphAtlas, uScorch: U.uScorch, uScorchBounds: U.uScorchBounds,
        uCamRight: U.uCamRight, uBladeUp: U.uBladeUp,
        uAsh: grass.mesh.material.uniforms.uAsh,
      },
      vertexShader: /* glsl */ `
        ${COMMON_GLSL}
        attribute vec4 aP; // base x, y, z, screen-plane rotation
        attribute vec4 aS; // the blade's quad w, h, the cut (share of the quad under it), glyph
        attribute vec4 aC; // colour var, thinning (0..1), the band's top (uv; 1 = the letter's top), brightness
        attribute float aT; // the lowest height on the blade its colour is taken from (a chip: the blade's top)
        uniform vec3 uCamRight;
        uniform vec3 uBladeUp;
        uniform float uAsh;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vGlyph;
        varying float vFade;
        void main() {
          float v0 = aS.z;
          // the upper part of the blade's letter: its quad from the cut up, its uv the same rows
          float span = aC.z - v0;
          vec2 q = vec2(position.x * aS.x, position.y * aS.y * span);
          float c = cos(aP.w), s = sin(aP.w);
          q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
          vec3 wp = aP.xyz + uCamRight * q.x + uBladeUp * q.y;
          // the grass's own colour at that height (grass.js), lit as the blades are
          float tip = max(aT, v0 + span * position.y);
          vec3 rootC = vec3(0.010, 0.018, 0.013);
          vec3 tipC = mix(vec3(0.1, 0.16, 0.072), vec3(0.132, 0.188, 0.08), aC.x);
          tipC = mix(tipC, vec3(0.12, 0.144, 0.104), step(0.82, aC.x));
          tipC = mix(tipC, mix(vec3(0.105, 0.1, 0.095), vec3(0.14, 0.13, 0.115), aC.x), uAsh);
          rootC = mix(rootC, vec3(0.012, 0.011, 0.011), uAsh);
          vec3 alb = mix(rootC, tipC, tip);
          vec3 at = vec3(aP.x, max(aP.y, 0.0) + 0.3, aP.z);
          float sh = shadowAtFast(at);
          vec3 L = uAmbient * 1.6 + uMoonColor * 0.62 * sh + pointLights(at, vec3(0.0, 1.0, 0.0), 1.0);
          vCol = applyFog(alb * L * aC.w, wp);
          vUv = vec2(uv.x, v0 + span * uv.y);
          vGlyph = aS.w;
          vFade = aC.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uGlyphAtlas;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vGlyph;
        varying float vFade;
        void main() {
          vec2 uv = clamp(vUv, 0.03, 0.97);
          float col = mod(vGlyph, 16.0);
          float row = floor(vGlyph / 16.0);
          float m = texture2D(uGlyphAtlas, vec2((col + uv.x) / 16.0, (7.0 - row + uv.y) / 8.0)).a;
          // (thinning away: the letter's thin parts go first, a letter to the end, never a smear)
          if (m < 0.42 + 0.55 * vFade) discard;
          gl_FragColor = vec4(vCol * (0.55 + 0.45 * m), 0.0);
        }
      `,
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grassTops';
    this._fling = { on: false, ux: 0, uz: 0, k: 1 };
    // the grass spray (round 5, `?grassSpray=`): letters thrown off what the arc cuts; c cuts a bolder line
    const sl = sprayLook();
    this.chips = (sl === 'a' || sl === 'a2') && this.look !== 'r1' ? GRASS.spray[sl] : null;
    this._chipAcc = 0;
    this.chipped = 0; // chips thrown (the tests', the Lab's)
    this.spray = sl === '0' || this.look === 'r1' || this.chips ? null : new GrassSpray(game, sl);
    this._wide = this.spray?.T.wide ?? 1;
    if (this.spray?.T.fresh2 != null && gu.uMowFresh2) gu.uMowFresh2.value = this.spray.T.fresh2;
  }

  /** The swing's way for the cuts that follow (grass.js mowSwing): unit (ux, uz), k its strength. */
  setFling(ux, uz, k = 1) {
    const f = this._fling;
    f.on = Number.isFinite(ux + uz);
    f.ux = ux;
    f.uz = uz;
    f.k = k;
  }

  clearFling() {
    this._fling.on = false;
  }

  /** The torn value the GPU samples at (x, z): the map's A, bilinear between cell centres. */
  _tornAt(x, z) {
    const sc = this.sc, S = sc.size;
    const fx = (x - sc.min) / sc.cellSize - 0.5, fz = (z - sc.min) / sc.cellSize - 0.5;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const a00 = this._a(ix, iz, S), a10 = this._a(ix + 1, iz, S), a01 = this._a(ix, iz + 1, S), a11 = this._a(ix + 1, iz + 1, S);
    const a = a00 + (a10 - a00) * tx, b = a01 + (a11 - a01) * tx;
    return a + (b - a) * tz;
  }

  _a(i, j, S) {
    return i < 0 || j < 0 || i >= S || j >= S ? 0 : this.sc.data[(j * S + i) * 4 + 3] / 255;
  }

  /**
   * A tear just wrote these cells (scorch.js, `n` cell indices): every blade the change reaches whose
   * cut threshold it passed loses its top now. (cx, cz): the tear's middle (the way a blow throws when
   * no swing gives one); `out`: a blow that tears the grass out (thrown harder, from the root).
   */
  cells(list, n, cx, cz) {
    if (!n || this.look === 'r1') return;
    const sc = this.sc, S = sc.size, B = this.grass.blades, G = GRASS.blade, BA = G.bare;
    const visible = Math.min(B.n, this.grass.mesh.geometry.instanceCount);
    const stamp = ++this._stamp;
    const seen = this._seen;
    let made = 0;
    const cap = Math.round(GRASS.fly.perTear * this._q());
    // (the cells in a strided order: when a big tear passes `cap`, the tops that fly are spread over all of
    // it, not the first rows)
    for (let k = 0; k < n; k++) {
      const c0 = list[(k * 7919) % n], ci = c0 % S, cj = (c0 - ci) / S;
      // (bilinear: a cell's value reaches the blades of the cells round it)
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i2 = ci + di, j2 = cj + dj;
          if (i2 < 0 || j2 < 0 || i2 >= S || j2 >= S) continue;
          const c = j2 * S + i2;
          if (seen[c] === stamp) continue;
          seen[c] = stamp;
          for (let p = this.start[c], e = this.start[c + 1]; p < e; p++) {
            const i = this.idx[p];
            if (this.cut[i] || i >= visible || B.data[i * 4 + 3] > 0.5) continue;
            const x = B.root[i * 4], z = B.root[i * 4 + 1], rw = B.root[i * 4 + 3];
            const torn = this._tornAt(x, z);
            if (!(torn > 0.004)) continue;
            // (grass.js: mown = step(r3 x 0.92 + 0.04, torn x gain))
            const r3 = fract(rw * 3.17 + 0.37);
            if (torn * G.gain < r3 * 0.92 + 0.04) continue;
            this.cut[i] = 255;
            this._cutAny = true;
            this._texDirty = true;
            if (sc.burnAt(x, z) > 0.55) continue; // (a burnt blade's top is ash: nothing flies)
            const r2 = fract(rw * 7.31);
            const bare = smooth(BA[0], BA[1], torn);
            const stubK = r2 < Math.max(G.low, bare * 0.85) ? 0.04 : G.stub * (1 - 0.5 * bare) + G.jitter * (r2 - 0.5) * 2;
            const v0 = G.ink[0] + (G.ink[1] - G.ink[0]) * stubK;
            if (made++ < cap) this._spawn(i, x, z, v0, cx, cz, bare);
            else this.dropped++; // (a big mark past the cap: this blade's top is not seen leaving)
          }
        }
      }
    }
  }

  _q() {
    const q = this.game.world?.quality;
    return Number.isFinite(q) ? Math.max(0.3, q) : 1;
  }

  /** A free slot: a new one, else the oldest piece already lying (it was going to thin away). */
  _slot() {
    if (this.n < Math.round(this.max * this._q())) return this.n++;
    let best = -1, bt = Infinity;
    for (let j = 0; j < this.n; j++) if (this.state[j] === LIE && this.born[j] < bt) { bt = this.born[j]; best = j; }
    return best;
  }

  /**
   * The grass spray in the grass's own letters (`?grassSpray=a|a2`; GRASS.spray[look]): the blade at
   * instance i, cut at (x, z) by a stroke going (ux, uz), throws `per` chips on average: small pieces of
   * ITS letter (its glyph, its colour field, lit as the grass is), a whole small letter or a band of its
   * strokes (`frag` of them), `size` x the blade, thrown along the swing and up, tumbling, landing to
   * lie a moment and thin away. A phone throws more a blade (GRASS.spray.lowQ).
   */
  _chip(i, x, z, ux, uz) {
    const T = this.chips, S = GRASS.spray, B = this.grass.blades, q = this._q();
    this._chipAcc += T.per * Math.pow(1 / Math.max(0.4, q), S.lowQ);
    const h = B.root[i * 4 + 2], G = GRASS.blade;
    while (this._chipAcc >= 1) {
      this._chipAcc -= 1;
      const j = this._slot();
      if (j < 0) return;
      this.total++;
      this.chipped++;
      const frag = rnd() < T.frag, k = R(T.size[0], T.size[1]);
      let v0 = 0, v1 = 1;
      if (frag) {
        // a band of the letter's strokes (its ink spans GRASS.blade.ink of the cell)
        const band = R(T.band[0], T.band[1]);
        v0 = R(G.ink[0], G.ink[1] - band);
        v1 = v0 + band;
      }
      this.px[j] = x + R(-0.1, 0.1);
      this.py[j] = h * R(0.35, 0.85);
      this.pz[j] = z + R(-0.1, 0.1);
      this.w[j] = h * 0.92 * k;
      this.h[j] = h * k; // (a band is drawn at the letter's own scale: its strokes, not stretched)
      this.v0[j] = v0;
      this.v1[j] = v1;
      this.tipMin[j] = T.tip;
      this.grav[j] = S.gravity;
      this.lit0[j] = T.lit[0];
      this.lit1[j] = T.lit[1];
      this.glyph[j] = B.data[i * 4];
      this.colv[j] = B.data[i * 4 + 2];
      this.fade[j] = 0;
      this.age[j] = 0;
      this.born[j] = this.game.time ?? 0;
      this.rot[j] = this.rot0[j] = B.data[i * 4 + 1] + R(-0.5, 0.5);
      this.y0[j] = this.py[j];
      this.lieRot[j] = (rnd() < 0.5 ? -1 : 1) * (Math.PI * 0.5 + R(-0.6, 0.6));
      const fl = R(S.fling[0], S.fling[1]), side = R(-1, 1) * S.side;
      this.state[j] = FLY;
      this.vx[j] = ux * fl - uz * side;
      this.vz[j] = uz * fl + ux * side;
      this.vy[j] = R(S.up[0], S.up[1]);
      this.spin[j] = R(T.spin[0], T.spin[1]) * (rnd() < 0.5 ? -1 : 1);
      this.lie[j] = R(S.lie[0], S.lie[1]);
    }
  }

  _spawn(i, x, z, v0, cx, cz, bare) {
    const B = this.grass.blades, U = this.game.U, F = GRASS.fly, look = this.look;
    const h = B.root[i * 4 + 2], tilt = B.data[i * 4 + 1];
    const rx = U.uCamRight.value, up = U.uBladeUp.value;
    // where the top was: the blade's base + its quad's cut height, along the blade's own lean
    const oy = v0 * h, qx = -Math.sin(tilt) * oy, qy = Math.cos(tilt) * oy;
    const pieces = look === 'c' ? 1 + (rnd() < F.shred.extra ? 2 : 1) : 1;
    // the way it goes: along the swing, else out from the tear's middle
    const f = this._fling;
    let ux, uz, k;
    if (f.on) { ux = f.ux; uz = f.uz; k = f.k; } else {
      const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz);
      ux = l > 1e-3 ? dx / l : 1; uz = l > 1e-3 ? dz / l : 0; k = 0.6 + 0.6 * bare;
    }
    for (let p = 0; p < pieces; p++) {
      const j = this._slot();
      if (j < 0) return;
      this.total++;
      this.thrown++;
      const frag = p > 0;
      this.px[j] = x + rx.x * qx + up.x * qy;
      this.py[j] = Math.max(0.02, rx.y * qx + up.y * qy);
      this.pz[j] = z + rx.z * qx + up.z * qy;
      this.rot[j] = this.rot0[j] = tilt;
      this.w[j] = h * 0.92 * (frag ? F.shred.size : 1);
      this.h[j] = h * (frag ? F.shred.size : 1);
      this.v0[j] = frag ? 0 : v0;
      this.v1[j] = 1;
      this.tipMin[j] = 0;
      this.grav[j] = F.gravity;
      this.lit0[j] = this._lit[0];
      this.lit1[j] = this._lit[1];
      this.glyph[j] = frag ? this._frag[Math.floor(rnd() * this._frag.length)] : B.data[i * 4];
      this.colv[j] = B.data[i * 4 + 2];
      this.fade[j] = 0;
      this.age[j] = 0;
      this.born[j] = this.game.time ?? 0;
      this.y0[j] = this.py[j];
      // (a sideways sign on screen: the way the swing crosses the view)
      const sx = Math.sign(ux * rx.x + uz * rx.z) || (rnd() < 0.5 ? -1 : 1);
      // (b: most tops topple off their stubs, F.slice.fly of them are thrown; a: F.throw.share are thrown,
      // the rest topple as in b)
      const topple = !frag && (look === 'b' ? rnd() > F.slice.fly : look === 'a' ? rnd() > F.throw.share : false);
      this.lieRot[j] = topple ? sx * R(F.slice.lean[0], F.slice.lean[1]) : sx * (Math.PI * 0.5 + R(-0.25, 0.25));
      const side = R(-1, 1);
      const T = look === 'c' ? F.shred : F.throw;
      if (topple) {
        // sliced: it topples off its stub to the side the blade went, and lies
        this.state[j] = TOPPLE;
        this.t0[j] = R(F.slice.time[0], F.slice.time[1]);
        this.vx[j] = ux * F.slice.drift * k; this.vz[j] = uz * F.slice.drift * k; this.vy[j] = 0;
        this.spin[j] = 0;
      } else {
        this.state[j] = FLY;
        const s = R(T.fling[0], T.fling[1]) * k;
        this.vx[j] = ux * s - uz * side * T.side;
        this.vz[j] = uz * s + ux * side * T.side;
        this.vy[j] = R(T.up[0], T.up[1]) * (0.7 + 0.3 * k);
        this.spin[j] = R(T.spin[0], T.spin[1]) * (rnd() < 0.5 ? -1 : 1);
      }
      this.lie[j] = R(this._lieT[0], this._lieT[1]);
    }
  }

  /** The fight's reset: every top is gone, every blade whole again (with the map). */
  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
    this.spray?.clear();
    if (this._cutAny) {
      this.cut.fill(0);
      this._texDirty = true;
    }
    this._cutAny = false;
  }

  /**
   * The sword's drawn arc crossed the grass this sub-step (player/fx.js trail: its EDGE stroke from
   * (ax, ay, az) to (bx, by, bz), the line the player watches): every blade the stroke passes over, as
   * the camera sees it, is cut now and its top leaves along the stroke's way. Only where the stroke is
   * low enough to be in the grass (GRASS.arc). Precise to the blade (its root within w/2 of the stroke's
   * footprint), not a map cell's share. Returns the blades it cut.
   */
  cutArc(ax, ay, az, bx, by, bz, heavy = false) {
    if (this.look === 'r1' || !Number.isFinite(ax + ay + az + bx + by + bz)) return 0;
    const A = GRASS.arc, B = this.grass.blades, G = GRASS.blade, S = this.sc.size, cs = this.sc.cellSize;
    const top = this.grass.heightAt((ax + bx) * 0.5, (az + bz) * 0.5) * A.top;
    if (!(top > 0.02)) return 0;
    const lim = top + A.above;
    if (ay >= lim && by >= lim) return 0;
    // the part of the stroke low enough to be in the grass
    if (ay > lim) {
      const c = (ay - lim) / (ay - by);
      ax += (bx - ax) * c; az += (bz - az) * c; ay = lim;
    } else if (by > lim) {
      const c = (by - lim) / (by - ay);
      bx += (ax - bx) * c; bz += (az - bz) * c; by = lim;
    }
    // where it sits on screen: along the camera's ray down to the blades' middle height
    const cam = this.game.camera?.position, hm = top * A.mid;
    if (cam && Number.isFinite(cam.y) && cam.y > lim + 1) {
      let t = (hm - cam.y) / (ay - cam.y);
      ax = cam.x + (ax - cam.x) * t; az = cam.z + (az - cam.z) * t;
      t = (hm - cam.y) / (by - cam.y);
      bx = cam.x + (bx - cam.x) * t; bz = cam.z + (bz - cam.z) * t;
    }
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez, el = Math.sqrt(l2);
    const hw = (heavy ? A.wHeavy : A.w) * 0.5 * this._wide;
    const f = this._fling;
    f.on = el > 1e-4;
    f.ux = f.on ? ex / el : 0;
    f.uz = f.on ? ez / el : 0;
    f.k = 1;
    const visible = Math.min(B.n, this.grass.mesh.geometry.instanceCount);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - this.sc.min) / cs)), i1 = Math.min(S - 1, Math.floor((Math.max(ax, bx) + hw - this.sc.min) / cs));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - hw - this.sc.min) / cs)), j1 = Math.min(S - 1, Math.floor((Math.max(az, bz) + hw - this.sc.min) / cs));
    let n = 0;
    const cap = Math.round(GRASS.fly.perTear * this._q());
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * S + i;
        for (let p = this.start[c], e = this.start[c + 1]; p < e; p++) {
          const k = this.idx[p];
          if (this.cut[k] || k >= visible || B.data[k * 4 + 3] > 0.5) continue;
          const x = B.root[k * 4], z = B.root[k * 4 + 1];
          const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
          const dx = ax + ex * t - x, dz = az + ez * t - z;
          if (dx * dx + dz * dz > hw * hw) continue;
          this.cut[k] = 255;
          this._cutAny = true;
          this._texDirty = true;
          if (this.sc.burnAt(x, z) > 0.55) continue;
          if (this.spray) this.spray.cut(x, B.root[k * 4 + 2], z, f.ux, f.uz);
          else if (this.chips) this._chip(k, x, z, f.ux, f.uz);
          const r2 = fract(B.root[k * 4 + 3] * 7.31);
          const stubK = r2 < G.low ? 0.04 : G.stub + G.jitter * (r2 - 0.5) * 2;
          if (n++ < cap) this._spawn(k, x, z, G.ink[0] + (G.ink[1] - G.ink[0]) * stubK, ax, az, 0);
        }
      }
    }
    f.on = false;
    this.arcCut += n;
    return n;
  }

  update(dt) {
    if (this._texDirty) {
      this.cutTex.needsUpdate = true;
      this._texDirty = false;
    }
    this.spray?.update(dt);
    if (!(dt > 0)) return;
    const F = GRASS.fly, g = F.gravity, drag = Math.exp(-F.drag * dt);
    const P = this.aP.array, Sa = this.aS.array, C = this.aC.array;
    let n = this.n;
    for (let j = 0; j < n; ) {
      this.age[j] += dt;
      const st = this.state[j];
      if (st === FLY) {
        this.vy[j] -= this.grav[j] * dt;
        this.vx[j] *= drag;
        this.vz[j] *= drag;
        this.px[j] += this.vx[j] * dt;
        this.py[j] += this.vy[j] * dt;
        this.pz[j] += this.vz[j] * dt;
        this.rot[j] += this.spin[j] * dt;
        if (this.py[j] <= 0.02 && this.vy[j] < 0) {
          // landed: it lies on its side where it fell
          this.py[j] = 0.02;
          this.state[j] = LIE;
          this.age[j] = 0;
          this.rot0[j] = this.rot[j];
        }
      } else if (st === TOPPLE) {
        // over t0 s it tips about its base to lie, its base sinking to the floor
        const u = Math.min(1, this.age[j] / this.t0[j]), e = u * u;
        this.rot[j] = this.rot0[j] + (this.lieRot[j] - this.rot0[j]) * e;
        this.py[j] = Math.max(0.02, this.y0[j] * (1 - e));
        this.px[j] += this.vx[j] * dt * (1 - u);
        this.pz[j] += this.vz[j] * dt * (1 - u);
        if (u >= 1) {
          this.state[j] = LIE;
          this.age[j] = 0;
          this.rot0[j] = this.rot[j];
        }
      } else {
        // lying: it settles flat over a moment, lies, then thins away
        const s = Math.min(1, this.age[j] / F.settle);
        this.rot[j] = this.rot0[j] + (this.lieRot[j] - this.rot0[j]) * (s * (2 - s));
        const t = this.age[j] - this.lie[j];
        this.fade[j] = t > 0 ? t / this._thin : 0;
        if (this.fade[j] >= 1) {
          // gone: the last live piece takes its slot
          n--;
          this._move(n, j);
          continue;
        }
      }
      const o = j * 4;
      P[o] = this.px[j]; P[o + 1] = this.py[j]; P[o + 2] = this.pz[j]; P[o + 3] = this.rot[j];
      Sa[o] = this.w[j]; Sa[o + 1] = this.h[j]; Sa[o + 2] = this.v0[j]; Sa[o + 3] = this.glyph[j];
      // (a top in the air catches the light; lying it calms to the grass's own tone over `calm` s)
      const lying = this.state[j] === LIE;
      C[o] = this.colv[j]; C[o + 1] = Math.min(1, this.fade[j]); C[o + 2] = this.v1[j];
      const L0 = this.lit0[j], L1 = this.lit1[j];
      C[o + 3] = lying ? L1 + (L0 - L1) * Math.max(0, 1 - this.age[j] / F.calm) : L0;
      this.aT.array[j] = this.tipMin[j];
      j++;
    }
    this.n = n;
    this.geo.instanceCount = n;
    if (n) {
      this._up(this.aP, n);
      this._up(this.aS, n);
      this._up(this.aC, n);
      this.aT.clearUpdateRanges();
      this.aT.addUpdateRange(0, n);
      this.aT.needsUpdate = true;
    }
  }

  _up(a, n) {
    a.clearUpdateRanges();
    a.addUpdateRange(0, n * 4);
    a.needsUpdate = true;
  }

  _move(from, to) {
    if (from === to) return;
    const L = this._all;
    for (let k = 0; k < L.length; k++) L[k][to] = L[k][from];
  }
}
