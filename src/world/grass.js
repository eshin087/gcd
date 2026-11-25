import * as THREE from 'three';
import { COMMON_GLSL, WIND_GLSL, WIND_FRONTS_LEN } from '../render/shaderLib.js';
import { gi, gis } from '../render/glyphs.js';
import { mulberry32, pickWeighted, fbm2 } from '../core/rng.js';
import { GRASS } from './grassTuning.js';
import { mowOn } from './scorch.js';
import { mowLook } from './mowFx.js';

// Hundreds of thousands of grass blades, each ONE glyph stroke ( | / \ ' Y V ... ) standing
// on the ground, leaning with the wind, pushed aside by feet, flattened by wing gusts and
// burnt to ash glyphs by dragon fire, mown by the sword and torn out under a blow's mark (the scorch
// map's A: a cut blade keeps the stub of its own letter, pale at the cut; grassTuning.js). Instances are generated in random order, so drawing
// only the first N (quality setting) thins the field evenly.

const BLADES = [
  ['|', 22], ['/', 16], ['\\', 16], ['l', 7], ['!', 3], ['i', 5], ['V', 5], ['Y', 5],
  ['v', 4], ["'", 5], ['(', 2], [')', 2], ['1', 1], ['j', 2], ['t', 1],
];
const FLOWERS = [['o', 4], ['*', 3], ['·', 5], ['°', 2], ['.', 3]];

/**
 * density(x, z) -> 0..1 acceptance, height(x, z, rng) -> blade height in meters.
 * ash 0..1: how far the blades are dried to ash grey (0 = the green meadow; the Ashfall level: ~0.85).
 */
export function createGrass(U, { count = 260000, extent = 150, density, height, seed = 7, ash = 0, lattice = null } = {}) {
  const rng = mulberry32(seed);
  // `?ground=c` (world/ground.js): one blade per lattice cell, all one size, upright (a prototype look)
  if (lattice) count = Math.ceil(extent / lattice[0]) * Math.ceil(extent / lattice[1]);
  const root = new Float32Array(count * 4);
  const data = new Float32Array(count * 4);
  const blades = BLADES.map(([c, w]) => [gi(c), w]);
  const flowers = FLOWERS.map(([c, w]) => [gi(c), w]);
  let n = 0;
  let guard = 0;
  const lcols = lattice ? Math.ceil(extent / lattice[0]) : 0;
  let li = -1;
  while (n < count && guard++ < count * 12) {
    let x, z;
    if (lattice) {
      if (++li >= count) break;
      const row = Math.floor(li / lcols);
      x = -extent / 2 + ((li % lcols) + 0.5 + (row % 2) * 0.5) * lattice[0];
      z = -extent / 2 + (row + 0.5) * lattice[1];
      // thinner where the meadow is thin, and a cell or two bare in the thick of it
      if (rng() > Math.min(1, density(x, z) * 1.15)) continue;
    } else {
      x = (rng() - 0.5) * extent;
      z = (rng() - 0.5) * extent;
      if (rng() > density(x, z)) continue;
    }
    const flower = rng() < (lattice ? 0.012 : 0.028);
    const h = lattice ? lattice[2] * (0.92 + 0.08 * rng()) : height(x, z, rng);
    root[n * 4] = x;
    root[n * 4 + 1] = z;
    root[n * 4 + 2] = h;
    root[n * 4 + 3] = rng();
    data[n * 4] = flower ? pickWeighted(rng, flowers) : pickWeighted(rng, blades);
    data[n * 4 + 1] = lattice ? 0 : (rng() - 0.5) * 0.55; // in-plane tilt
    data[n * 4 + 2] = rng(); // colour variation
    data[n * 4 + 3] = flower ? 1 : 0;
    n++;
  }

  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setAttribute('iRoot', new THREE.InstancedBufferAttribute(root, 4));
  geo.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 4));
  geo.instanceCount = n;

  const burnt = gis(".,'");
  const B = GRASS.blade;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uMoonDir: U.uMoonDir, uMoonColor: U.uMoonColor, uAmbient: U.uAmbient,
      uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uFocus: U.uFocus,
      uCamPos: U.uCamPos, uPLPos: U.uPLPos, uPLCol: U.uPLCol, uPLRad: U.uPLRad,
      uShadowMap: U.uShadowMap, uShadowMatrix: U.uShadowMatrix, uShadowTexel: U.uShadowTexel,
      uGlyphAtlas: U.uGlyphAtlas, uScorch: U.uScorch, uScorchBounds: U.uScorchBounds,
      uCamRight: U.uCamRight, uBladeUp: U.uBladeUp, uPushers: U.uPushers, uGust: U.uGust,
      uCullDist: U.uCullDist,
      // the living world's wind (an older uniforms object without it: the wind is off)
      uWind: U.uWind ?? { value: new THREE.Vector4(0, 0, 0, 0) },
      uWindFronts: U.uWindFronts ?? { value: Array.from({ length: WIND_FRONTS_LEN }, () => new THREE.Vector4()) },
      uBurnt: { value: new THREE.Vector3(...burnt) },
      uAsh: { value: Math.min(1, Math.max(0, Number(ash) || 0)) },
      uMow: { value: new THREE.Vector3(B.stub, B.jitter, B.low) },
      uMowInk: { value: new THREE.Vector2(B.ink[0], B.ink[1]) },
      uMowGain: { value: B.gain },
      uMowFresh: { value: B.freshK },
      uMowBare: { value: new THREE.Vector2(B.bare[0], B.bare[1]) },
      uMowLie: { value: new THREE.Vector3(B.lie[0], B.lie[1], B.lie[2]) },
      uMowMode: { value: mowLook() === 'r1' ? 0 : 1 },
      uCutTex: { value: null },
      uCutOn: { value: 0 },
      uMowFresh2: { value: B.fresh2 },
      uFlat: { value: lattice ? 1 : 0 },
      uFresh: { value: new THREE.Vector3(...B.fresh) },
      uFreshAsh: { value: new THREE.Vector3(...B.freshAsh) },
    },
    vertexShader: /* glsl */ `
      ${COMMON_GLSL}
      ${WIND_GLSL}
      attribute vec4 iRoot;  // x, z, height, rand
      attribute vec4 iData;  // glyph, tilt, colour var, kind (1 = flower)
      uniform vec3 uCamRight;
      uniform vec3 uBladeUp;
      uniform vec4 uPushers[MAX_PUSH];
      uniform vec4 uGust;
      uniform float uCullDist;
      uniform vec3 uBurnt;
      uniform float uAsh;
      uniform vec3 uMow;     // the mown blade: stub (share of the ink kept), jitter, share cut to the root
      uniform vec2 uMowInk;  // the letter's ink spans this share of its quad
      uniform float uMowGain, uMowFresh;
      uniform vec2 uMowBare; // torn past x .. y: torn out (a blow's mark), not mown
      uniform vec3 uMowLie;
      uniform float uMowMode, uMowFresh2;
      uniform float uFlat; // ?ground=c: the letter's ink one tone, not dark at the root
      uniform sampler2D uCutTex;
      uniform float uCutOn; // 1: round 2 (the tops leave as letters, world/mowFx.js); its paleness share  // the cut tops lying: share of the mown blades, their size, their paleness
      uniform vec3 uFresh, uFreshAsh;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vGlyph;
      void main() {
        vec3 root = vec3(iRoot.x, 0.0, iRoot.y);
        vec2 rel = root.xz - uFocus.xz;
        // cheap cull: outside the visible ellipse around the focus
        if (length(rel * vec2(0.75, 1.0)) > uCullDist) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

        vec4 sc4 = scorch4At(root.xz);
        vec2 sc = sc4.xy;
        float burn = sc.x, heat = sc.y;
        float trample = sc4.z;
        float torn = sc4.w;
        float flower = iData.w;
        float h = iRoot.z * mix(1.0, 0.32, burn);
        float w = h * 0.92; // square-ish quads keep glyphs at their natural proportions
        float baseY = 0.0;
        // mown (the scorch map's a: world/scorch.js tear, grassTuning.js GRASS.blade): the blade's letter
        // is CUT, its lower part left standing (the quad and its uv clipped at the same height, so the
        // stub is the letter's own stroke, not a squashed one); each blade's cut a little different
        float cutV = 1.0, mown = 0.0, lying = 0.0, bare = 0.0;
        float tilt = iData.y;
        // the blades the sword's drawn arc cut (world/mowFx.js cutArc: one byte per instance, exact to the blade)
        float fc = 0.0;
        if (uCutOn > 0.5 && flower < 0.5) fc = texelFetch(uCutTex, ivec2(gl_InstanceID % ${GRASS.arc.tex}, gl_InstanceID / ${GRASS.arc.tex}), 0).r;
        if ((torn > 0.004 || fc > 0.5) && flower < 0.5) {
          float r2 = fract(iRoot.w * 7.31), r3 = fract(iRoot.w * 3.17 + 0.37), r4 = fract(iRoot.w * 5.71 + 0.11);
          // (torn is the share of the blades here that were cut: each blade is cut or it stands, so a
          // light tear thins the meadow to a scatter of stubs and a swath's edge is a ragged line of them)
          float cutP = torn * uMowGain;
          // (round 2: cut or standing, on the very frame world/mowFx.js sends its top away: the same test)
          mown = uMowMode > 0.5 ? step(r3 * 0.92 + 0.04, cutP) : smoothstep(r3 * 0.92, r3 * 0.92 + 0.08, cutP);
          mown = max(mown, step(0.5, fc));
          // torn OUT (a blow's mark, torn past uMowBare.x): the stubs go to the root, nothing lies, the floor
          // shows bare under the mark; mown (the sword, up to GRASS.mow.maxK): pale stubble and cut tops
          bare = smoothstep(uMowBare.x, uMowBare.y, torn);
          if (uMowMode < 0.5 && mown > 0.55 && r4 < uMowLie.x * (1.0 - bare)) {
            // a cut top lying where it fell: the blade's whole letter, small, laid over (no wind)
            lying = 1.0;
            h *= uMowLie.y;
            w = h * 0.92;
            tilt = (r2 < 0.5 ? -1.0 : 1.0) * (1.25 + 0.5 * r3);
            baseY = 0.03;
          } else {
            float stubK = r2 < max(uMow.z, bare * 0.85) ? 0.04 : uMow.x * (1.0 - 0.5 * bare) + uMow.y * (r2 - 0.5) * 2.0;
            float cv = uMowInk.x + (uMowInk.y - uMowInk.x) * stubK;
            cutV = mix(1.0, cv, mown);
          }
        }
        if (flower > 0.5) {
          w = h = 0.13 + iData.z * 0.09;
          baseY = iRoot.z * 0.55;
          if (burn > 0.3 || torn > 0.4) { w = h = 0.0; }
        }

        vec2 q = vec2(position.x * w, position.y * h * cutV);
        q = vec2(cos(tilt) * q.x - sin(tilt) * q.y, sin(tilt) * q.x + cos(tilt) * q.y);
        vec3 wp = root + vec3(0.0, baseY, 0.0) + uCamRight * q.x + uBladeUp * q.y;
        // (the share of the full blade's height this vertex stands at: a stub sways and lies as the
        // lower part of the blade does, stiff)
        float tip = lying > 0.5 ? 0.3 : position.y * cutV;

        // wind
        vec3 off;
        if (!windOn()) {
          // (the living world's wind off: exactly the old sway)
          // gentle: big slow swells, small amplitude (a busy, fast sway reads as the ground swimming)
          float wv = sin(uTime * 1.05 + root.x * 0.22 + root.z * 0.14) + 0.35 * sin(uTime * 1.9 + root.x * 0.6 - root.z * 0.4);
          off = uCamRight * wv * 0.04 * h + vec3(0.0, 0.0, -0.025 * h);
        } else {
          // the shared wind (world/life/wind.js): the blade leans along it by the prevailing speed, in
          // patches that travel downwind with the air; a passing front stirs it in loose patches
          vec4 G = uWindFronts[WIND_SLOTS * 2 + 2]; // lean, wave, front, patch
          vec2 wd = windDirAt(root.xz);
          float spN = uWind.z / (uWind.z + 2.5);
          vec2 p = root.xz - uWindFronts[WIND_SLOTS * 2 + 1].xy;
          vec2 perp = vec2(-wd.y, wd.x);
          float ps = dot(p, wd), pc = dot(p, perp);
          float g = 0.5 + 0.3 * sin(ps * 0.23 + 1.7 * sin(pc * 0.071)) + 0.2 * sin(ps * 0.61 - pc * 0.19 + 0.8 * sin(ps * 0.11));
          vec2 fd;
          float edge;
          float fk = windFronts(root.xz, fd, edge);
          // a gust stirs the meadow in loose local patches (G.w: how far), never as a band across the
          // view: an uneven pattern that rides the field's travel, so a patch comes and goes as it passes
          float pt = (0.5 + 0.5 * sin(ps * 0.83 + 2.1 * sin(pc * 0.37 + ps * 0.11))) * (0.5 + 0.5 * sin(pc * 0.61 - ps * 0.29 + 1.3 * sin(ps * 0.17)));
          fk *= mix(1.0, smoothstep(0.25, 0.75, pt), G.w);
          vec2 bend = wd * (spN * (G.x + G.y * (g - 0.5) * 2.0)) + fd * (fk * G.z);
          // inside a stirred patch the blades flutter, neighbours together (short waves running downwind)
          float flutter = sin(uTime * 6.0 - ps * 1.3 + 0.6 * sin(pc * 0.9)) * 0.06 * fk;
          bend += wd * flutter;
          float b = min(length(bend), 0.9);
          off = vec3(bend.x, -0.5 * b * b, bend.y) * h;
        }
        // trodden (the scorch map's b: world/life/steps.js): it lies flatter, every way
        if (trample > 0.004) {
          float a = iRoot.w * 6.2832;
          off.xz += vec2(cos(a), sin(a)) * trample * h * 0.6;
          off.y -= trample * h * 0.72;
        }
        // trample / pushers (ignore airborne ones: y > 1.5)
        for (int i = 0; i < MAX_PUSH; i++) {
          vec4 P = uPushers[i];
          if (P.w <= 0.0 || P.y > 1.5) continue;
          vec2 d = root.xz - P.xz;
          float dist = length(d);
          if (dist < P.w) {
            float k = 1.0 - dist / P.w;
            vec2 dir = d / max(dist, 1e-3);
            off.xz += dir * k * h * 1.1;
            off.y -= k * h * 0.55;
          }
        }
        // radial gust from wing beats / landings
        if (uGust.z > 0.0) {
          vec2 d = root.xz - uGust.xy;
          float dist = length(d);
          float k = clamp(1.0 - dist / uGust.w, 0.0, 1.0);
          float wave = 0.55 + 0.45 * sin(dist * 0.8 - uTime * 13.0);
          off.xz += (d / max(dist, 1e-3)) * k * wave * uGust.z * h * 1.4;
          off.y -= k * uGust.z * h * 0.3;
        }
        wp += off * tip * tip;

        vec3 rootC = vec3(0.010, 0.018, 0.013);
        // calmer than v0.1: ~20 % darker so the hero and the wyrm stay the brightest things on screen
        vec3 tipC = mix(vec3(0.1, 0.16, 0.072), vec3(0.132, 0.188, 0.08), iData.z);
        tipC = mix(tipC, vec3(0.12, 0.144, 0.104), step(0.82, iData.z));
        // dried to ash (uAsh, the Ashfall level): grey-brown blades, darker roots
        tipC = mix(tipC, mix(vec3(0.105, 0.1, 0.095), vec3(0.14, 0.13, 0.115), iData.z), uAsh);
        rootC = mix(rootC, vec3(0.012, 0.011, 0.011), uAsh);
        vec3 alb = mix(rootC, tipC, mix(tip, 0.75 + 0.25 * tip, uFlat));
        alb = mix(alb, vec3(0.014, 0.012, 0.011) * (0.6 + tip), burn);
        // trodden blades a little darker
        if (trample > 0.004) alb *= 1.0 - 0.7 * trample;
        // a mown stub is paler at its cut (fresh: never the burnt grass's black)
        if (mown > 0.0) alb = mix(alb, mix(uFresh, uFreshAsh, uAsh), uMowFresh * mix(1.0, uMowFresh2, uMowMode) * mown * (1.0 - burn) * (1.0 - 0.75 * bare) * (lying > 0.5 ? uMowLie.z : 0.45 + 0.55 * position.y));
        float sh = shadowAtFast(vec3(root.x, 0.3, root.z));
        vec3 L = uAmbient * 1.6 + uMoonColor * 0.62 * sh + pointLights(root + vec3(0.0, 0.35, 0.0), vec3(0.0, 1.0, 0.0), 1.0);
        vec3 col = alb * L;
        if (flower > 0.5) {
          col = mix(vec3(0.55, 0.58, 0.52), vec3(0.62, 0.56, 0.42), iData.z) * (uAmbient * 4.0 + uMoonColor * 0.9 * sh + pointLights(root + vec3(0.0, 0.4, 0.0), vec3(0.0, 1.0, 0.0), 1.0));
        }
        float flick = 0.6 + 0.4 * sin(uTime * 8.0 + iRoot.w * 60.0);
        col += vec3(1.0, 0.3, 0.05) * heat * heat * tip * 1.6 * flick;
        col = applyFog(col, wp);
        vCol = col;
        vUv = vec2(uv.x, uv.y * cutV);
        vGlyph = iData.x;
        if (burn > 0.55 && flower < 0.5) {
          float r = fract(iRoot.w * 13.1);
          vGlyph = r < 0.4 ? uBurnt.x : r < 0.75 ? uBurnt.y : uBurnt.z;
        }
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uGlyphAtlas;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vGlyph;
      void main() {
        vec2 uv = clamp(vUv, 0.03, 0.97);
        float col = mod(vGlyph, 16.0);
        float row = floor(vGlyph / 16.0);
        float m = texture2D(uGlyphAtlas, vec2((col + uv.x) / 16.0, (7.0 - row + uv.y) / 8.0)).a;
        if (m < 0.42) discard;
        gl_FragColor = vec4(vCol * (0.55 + 0.45 * m), 0.0);
      }
    `,
    blending: THREE.NoBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  const mid = () => 0.5; // (the height's random draw at its middle: the meadow's typical blade there)
  return {
    mesh,
    total: n,
    /** the blades' instance data on the CPU (world/mowFx.js finds the ones a cut reaches): iRoot, iData */
    blades: { root, data, n },
    /** The grass's density (0..1) and its typical blade height (m) at (x, z): the mow reads them. */
    densityAt: (x, z) => density(x, z),
    heightAt: (x, z) => height(x, z, mid),
    setCount(c) {
      geo.instanceCount = lattice ? n : Math.max(0, Math.min(n, c));
    },
  };
}

/**
 * Default meadow: dense in the clearing, thinner under the forest, none on stones / bare spots.
 * Baked into a 0.5 m grid so per-sample lookups are O(1).
 * bare: [{x, z, r}] circles with no grass (bonfire ash, nest dirt).
 * slabs: [{x, z, r, outline: [[x, z], ...]}] half-sunk flagstones. Grass grows right up to their
 *   edges (blades rooted just outside lean over the slab on screen) and a few blades push up
 *   through the slab near its rim; the middle stays almost bare. Evaluated exactly per sample.
 */
export function meadowDensity(colliders, treeSpots, bare = [], extent = 150, slabs = []) {
  const res = 0.5;
  const N = Math.ceil(extent / res);
  const half = extent / 2;
  const grid = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + (i + 0.5) * res;
      const z = -half + (j + 0.5) * res;
      const r = Math.hypot(x, z);
      let d = r > 74 ? 0 : r < 29 ? 1 : r < 35 ? 1 - ((r - 29) / 6) * 0.55 : 0.45 * (1 - Math.max(0, (r - 60) / 14));
      grid[j * N + i] = d * (0.55 + 0.45 * fbm2(x * 0.09 + 3.1, z * 0.09 - 1.7));
    }
  }
  const stamp = (cx, cz, radius, fn) => {
    const i0 = Math.max(0, Math.floor((cx - radius + half) / res));
    const i1 = Math.min(N - 1, Math.floor((cx + radius + half) / res));
    const j0 = Math.max(0, Math.floor((cz - radius + half) / res));
    const j1 = Math.min(N - 1, Math.floor((cz + radius + half) / res));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -half + (i + 0.5) * res, z = -half + (j + 0.5) * res;
        const dd = Math.hypot(x - cx, z - cz);
        if (dd <= radius) grid[j * N + i] *= fn(dd);
      }
    }
  };
  for (const c of colliders.circles) {
    // stones and boulders: grass grows up against the rock (their colliders are a little wider
    // than the stone); trunks and the bonfire keep a trodden ring
    if (c.tag === 'stone' || c.tag === 'boulder') stamp(c.x, c.z, c.r + 0.4, (dd) => (dd < c.r * 0.8 ? 0 : 0.7));
    else stamp(c.x, c.z, c.r + 0.8, (dd) => (dd < c.r + 0.1 ? 0 : 0.4));
  }
  for (const t of treeSpots) stamp(t.x, t.z, t.r, (dd) => 0.5 + 0.5 * (dd / t.r));
  for (const b of bare) stamp(b.x, b.z, b.r, (dd) => Math.min(1, Math.max(0, (dd - b.r * 0.75) / (b.r * 0.25))));
  // bounding box of all slabs: most samples skip the exact test
  let sx0 = Infinity, sx1 = -Infinity, sz0 = Infinity, sz1 = -Infinity;
  for (const s of slabs) {
    sx0 = Math.min(sx0, s.x - s.r);
    sx1 = Math.max(sx1, s.x + s.r);
    sz0 = Math.min(sz0, s.z - s.r);
    sz1 = Math.max(sz1, s.z + s.r);
  }
  const slabFactor = (x, z) => {
    if (x < sx0 || x > sx1 || z < sz0 || z > sz1) return 1;
    for (const s of slabs) {
      if (Math.abs(x - s.x) > s.r || Math.abs(z - s.z) > s.r) continue;
      const e = insideDist(s.outline, x, z);
      if (e > 0) return e < 0.1 ? 0.45 : e < 0.22 ? 0.14 : 0.03;
    }
    return 1;
  };
  return (x, z) => {
    const i = Math.floor((x + half) / res), j = Math.floor((z + half) / res);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    return grid[j * N + i] * slabFactor(x, z);
  };
}

// ------------------------------------------------------------------ the sword mows
const MOW = { atk: null, acc: 0, bits: 0, torn: 0, swings: 0 };
const _H = { x: 0, y: 0, z: 0 }, _T = { x: 0, y: 0, z: 0 }, _P = new THREE.Vector3();
const MID = () => 0.5;
const meadowTop = (x, z) => meadowHeight(x, z, MID);
const lerp3 = (o, a, b, t) => { o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t; return o; };
/** What the mow did (the tests', the Lab's): the swing it last cut for, its torn total, bits thrown. */
export const mowStats = MOW;

/**
 * The hero's swing through the grass (player.js, beside `_cutWorld`, each frame of the active window;
 * GRASS.mow): the drawn steel, swept from last frame's pose to this one, tears a strip of the scorch
 * map's A wherever it passes under the grass's top, as deep as it went under; the cut tops fly
 * (fx.mowBits, a handful a swing). `sw`: the SwordSweep (a, b this frame, pa, pb last; point(f)).
 * Reads the world, writes only A; no Math.random. Returns the tear it added.
 */
export function mowSwing(game, a, sw, fx = null) {
  const w = game?.world, sc = w?.scorch;
  if (!a || !sc?.tearLine || !sw?.valid || !mowOn()) return 0;
  // (round 2 on, the cut follows the DRAWN arc: player/fx.js trail -> world/mowFx.js cutArc; the steel's
  // strip into the scorch map is round 1's, `?mowLook=r1`)
  if (mowLook() !== 'r1') return 0;
  const M = GRASS.mow, d = a.def;
  // (from the active window to a little past it: the follow-through still cuts what it passes)
  const W = Number(d?.windup), E = W + Number(d?.active) + M.after;
  if (!(a.t >= W) || !(a.t <= E) || a.exec) return 0;
  if (MOW.atk !== a) {
    MOW.atk = a;
    MOW.acc = 0;
    MOW.bits = 0;
    MOW.swings++;
  }
  const hAt = typeof w.grass?.heightAt === 'function' ? w.grass.heightAt : meadowTop;
  // the drawn steel's share of the gameplay segment (sw.point(1) is the steel's point), out to `reach`
  const ex = sw.b.x - sw.a.x, ey = sw.b.y - sw.a.y, ez = sw.b.z - sw.a.z, L = Math.hypot(ex, ey, ez);
  if (!(L > 1e-4)) return 0;
  sw.point(1, _P);
  const f1 = Math.min(1, (Math.hypot(_P.x - sw.a.x, _P.y - sw.a.y, _P.z - sw.a.z) / L) * M.reach);
  // the point's travel this frame: as many sub-steps as keep each under M.sub m
  const tx = sw.b.x - sw.pb.x, tz = sw.b.z - sw.pb.z, ty = sw.b.y - sw.pb.y;
  const travel = Math.hypot(tx, ty, tz) * f1;
  if (!Number.isFinite(travel)) return 0;
  // (a blade at rest, or held in a freeze, cuts nothing)
  const dt = Number(game.dt) > 0 ? game.dt : 1 / 60;
  if (travel / dt < M.speed) return 0;
  const n = Math.max(1, Math.min(M.maxSub, Math.ceil(travel / M.sub)));
  const tl = Math.hypot(tx, tz);
  const ux = tl > 1e-5 ? tx / tl : 0, uz = tl > 1e-5 ? tz / tl : 0;
  let add = 0;
  // (the tops this swing cuts go along the steel's way: world/mowFx.js)
  const tops = sc.tops;
  tops?.setFling(ux, uz, Math.min(1.3, Math.max(0.5, travel / dt / 9)));
  for (let s = 1; s <= n; s++) {
    const t = s / n;
    lerp3(_H, sw.pa, sw.a, t);
    lerp3(_T, sw.pb, sw.b, t);
    // (the point on the steel's own arc: its length kept, not the chord's)
    let dx = _T.x - _H.x, dy = _T.y - _H.y, dz = _T.z - _H.z;
    const dl = Math.hypot(dx, dy, dz);
    if (!(dl > 1e-5)) continue;
    const k = (L * f1) / dl;
    _T.x = _H.x + dx * k; _T.y = _H.y + dy * k; _T.z = _H.z + dz * k;
    add += tearUnder(sc, hAt, _H, _T, M);
  }
  tops?.clearFling();
  // (round 1's bits: only when no cut tops fly, `?mowLook=r1`)
  if (add > 0 && !tops) {
    MOW.torn += add;
    // the cut tops fly: a handful a swing (x the quality), along the steel's ground path
    const q = Number.isFinite(w.quality) ? w.quality : 1;
    const cap = Math.round(M.bits.max * q);
    MOW.acc += add * M.bits.per;
    let nb = Math.min(Math.floor(MOW.acc), cap - MOW.bits);
    if (nb > 0 && fx?.mowBits) {
      MOW.acc -= nb;
      MOW.bits += nb;
      const top = hAt(_H.x, _H.z);
      fx.mowBits(sw.a.x, sw.a.z, _T.x, _T.z, nb, ux, uz, top, M.bits);
    } else if (nb <= 0) MOW.acc = Math.min(MOW.acc, 1);
  }
  return add;
}

/** How deep (0..1) an edge at height y tears grass whose top is `top` m (GRASS.mow: skims over the
 *  tops, mows to stubble at stubY x the top and under). */
function mowDepth(y, top, M) {
  if (y >= top + M.above) return 0;
  if (y >= top) return (M.skim * (top + M.above - y)) / M.above;
  const lo = top * M.stubY;
  return y <= lo ? 1 : M.skim + ((1 - M.skim) * (top - y)) / (top - lo);
}

/** The part of the steel H -> T (3D) low enough to meet the grass, torn into A as deep as it went. */
function tearUnder(sc, hAt, H, T, M) {
  const top = hAt((H.x + T.x) * 0.5, (H.z + T.z) * 0.5) * M.top;
  if (!(top > 0.02)) return 0;
  const lim = top + M.above;
  if (H.y >= lim && T.y >= lim) return 0;
  // clip to the part under lim
  let ax = H.x, ay = H.y, az = H.z, bx = T.x, by = T.y, bz = T.z;
  if (ay > lim) {
    const c = (ay - lim) / (ay - by);
    ax += (bx - ax) * c; az += (bz - az) * c; ay = lim;
  } else if (by > lim) {
    const c = (by - lim) / (by - ay);
    bx += (ax - bx) * c; bz += (az - bz) * c; by = lim;
  }
  const ka = mowDepth(ay, top, M) * M.maxK, kb = mowDepth(by, top, M) * M.maxK;
  if (Math.max(ka, kb) < M.min * M.maxK) return 0;
  return sc.tearLine(ax, az, bx, bz, M.w, ka, kb);
}

/** Distance from (x, z) to the nearest edge of polygon `poly` if inside it, else 0. */
function insideDist(poly, x, z) {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const ex = xj - xi, ez = zj - zi;
    const t = Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(x - xi - ex * t, z - zi - ez * t));
  }
  return inside ? best : 0;
}

export function meadowHeight(x, z, rng) {
  const r = Math.hypot(x, z);
  const n = fbm2(x * 0.06 - 7.3, z * 0.06 + 2.2);
  const base = r < 30 ? 0.34 + 0.3 * n : 0.26 + 0.22 * n;
  return base * (0.75 + rng() * 0.5);
}
