import * as THREE from 'three';
import { COMMON_GLSL, BASIC_VERT, FS_VERT, TRAIL_N, TRAIL_CH } from '../render/shaderLib.js';
import { gis } from '../render/glyphs.js';
import { DRAGON_PRINT_GLSL, DP_CELL, dragonPrintUniforms, dragonAllOn } from '../render/dragonPrint.js';
import { DRAGON_PRINT_FX_GLSL, DP_FX_U } from '../render/dragonPrintFx.js';
import { DG_GRASS_GLSL, dgGrassLook } from './dragonGrass.js';
import { DRAGON_STEP_GLSL, DP_STEP_U } from '../render/dragonStep.js';

/**
 * The ground's look (a prototype switch, `?ground=`): none = today's soil under the 3D grass;
 *   a  the letter meadow: the grass is printed IN the ground, one small upright letter per world cell
 *      (no 3D blades), picked by how thick the meadow is there;
 *   b  the dragon ground: a lit bumpy source printed in the wyrm's fine digits, every cell filled,
 *      a dark body with brighter digits only where the moon catches;
 *   c  tidy tufts: the 3D grass kept (wind, mowing, burning) but one blade per lattice cell, all the
 *      same size, upright, over a fine dot lattice of soil;
 *   d  wind-combed: strokes laid along a slow flow field (`- / | \ ~`), long faint streaks like grass
 *      combed by the wind, no 3D blades.
 */
export function groundLook() {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get('ground');
    if (v === 'a' || v === 'b' || v === 'c' || v === 'd') return v;
    if (v === '0') return null;
    // the dragon ground is the default (render/dragonPrint.js; ?dragon=0 today's)
    return dragonAllOn() ? 'b' : null;
  } catch {
    return null;
  }
}

const LOOK_ID = { a: 1, b: 2, c: 3, d: 4 };

/** The ground's place in the draw order: after every other solid thing (createGround). */
export const GROUND_ORDER = 100;
/** The ground plane's side (m). */
const GROUND_SIZE = 240;
/** The relief's step for its normal (m; GLSL). */
const RELIEF_E = '0.12';
// The dragon ground's relief (look b) in its two parts: the broad mounds (A) and the tussocks, which stand
// taller where the meadow is thick (B): groundRelief(p, d) = A + B x (0.3 + d). Shared by the ground's
// shader and the bake below, so both run the very same noise.
const RELIEF_GLSL = /* glsl */ `
      float reliefA(vec2 p) { return dpFbm(p * 0.3) * 0.9; }
      float reliefB(vec2 p) { return dpFbm(p * 1.6) * 0.3; }
      // the base relief: soft mounds, tussocks where the meadow is thick (height in m-ish units)
      float groundRelief(vec2 p, float d) { return reliefA(p) + reliefB(p) * (0.3 + d); }
`;
/** The cells the plane covers (dpLattice's ids): the first column and row, how many of each. One texel of
 *  the baked relief per cell. */
const BAKE = (() => {
  const h = GROUND_SIZE / 2;
  const i0 = Math.floor(-h / DP_CELL[0]), j0 = Math.floor(-h / DP_CELL[1]);
  // (a row is shifted by up to one cell: dpLattice)
  return Object.freeze({ i0, j0, cols: Math.floor(h / DP_CELL[0] + 1) - i0 + 1, rows: Math.floor(h / DP_CELL[1]) - j0 + 1 });
})();

/**
 * THE BAKED RELIEF (look b; ADR-199). The relief is fixed in the world and a cell prints ONE digit, lit at
 * its centre, yet the shader worked the relief out again for every pixel: eight times (three for the normal,
 * five for the crest outline), 48 value-noise lookups, about half of what the ground cost to draw. Here the
 * GPU works them out once per CELL, with the shader's own functions, into two float textures the ground
 * then reads (one texel a cell, no filtering; 1779 x 961 cells, 27 MB each as 32-bit floats):
 *   uReliefN   the two parts' steps toward +x and +z (A, B, A, B): the normal, the meadow's share still live
 *   uReliefR   the relief at the four neighbours less the cell's own, the meadow left out: the outline's
 * Differences, not heights, so a half float would still do. Returns the two render targets once drawn (the
 * ground's uniforms point at them); null, and the ground as it was, on a renderer that cannot draw into
 * float textures (or has no context: the headless tests). `targets`: the two render targets of an
 * earlier bake, drawn again (a restored context).
 */
function bakeRelief(renderer, mat, targets = null) {
  const gl = renderer?.getContext?.();
  const ext = renderer?.extensions;
  if (!gl || typeof gl.checkFramebufferStatus !== 'function' || typeof ext?.has !== 'function') return null;
  // (32-bit floats where the renderer can draw into them: the picture is then the unbaked one to the pixel;
  // half floats keep one part in 2000 of each step, and about 0.04 % of the ground's pixels print a
  // neighbouring digit)
  const full = ext.has('EXT_color_buffer_float');
  if (!full && !ext.has('EXT_color_buffer_half_float')) return null;
  const opts = { type: full ? THREE.FloatType : THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
  const rts = targets ?? [new THREE.WebGLRenderTarget(BAKE.cols, BAKE.rows, opts), new THREE.WebGLRenderTarget(BAKE.cols, BAKE.rows, opts)];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const bake = new THREE.ShaderMaterial({
    uniforms: { ...dragonPrintUniforms(), uPart: { value: 0 }, uBox: { value: new THREE.Vector2(BAKE.i0, BAKE.j0) } },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      ${DRAGON_PRINT_GLSL}
      ${RELIEF_GLSL}
      uniform float uPart;
      uniform vec2 uBox;
      void main() {
        vec2 size = vec2(${DP_CELL[0]}, ${DP_CELL[1]});
        vec2 c = dpCellCenter(floor(gl_FragCoord.xy) + uBox, size);
        float e = ${RELIEF_E};
        if (uPart < 0.5) {
          float a = reliefA(c), b = reliefB(c);
          gl_FragColor = vec4(reliefA(c + vec2(e, 0.0)) - a, reliefB(c + vec2(e, 0.0)) - b, reliefA(c + vec2(0.0, e)) - a, reliefB(c + vec2(0.0, e)) - b);
        } else {
          float hr = groundRelief(c, 0.0);
          gl_FragColor = vec4(groundRelief(c + vec2(size.x, 0.0), 0.0), groundRelief(c - vec2(size.x, 0.0), 0.0),
                              groundRelief(c - vec2(0.0, size.y), 0.0), groundRelief(c + vec2(0.0, size.y), 0.0)) - hr;
        }
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const quad = new THREE.Mesh(geo, bake);
  quad.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget?.() ?? null;
  let ok = true;
  try {
    for (let k = 0; k < 2 && ok; k++) {
      bake.uniforms.uPart.value = k;
      renderer.setRenderTarget(rts[k]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
      else renderer.render(quad, cam);
    }
  } catch {
    ok = false;
  } finally {
    renderer.setRenderTarget(prev);
    geo.dispose();
    bake.dispose();
  }
  if (!ok) {
    if (!targets) for (const rt of rts) rt.dispose();
    return null;
  }
  mat.uniforms.uReliefN.value = rts[0].texture;
  mat.uniforms.uReliefR.value = rts[1].texture;
  return rts;
}

// Near-black soil carrying a faint world-space field of dim glyphs, scorch marks and ash.
export function createGround(U, look = groundLook()) {
  const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const soil = gis(".,'`:-");
  const ash = gis(".,:;~");
  // a: the meadow's letters, thin to thick (4 levels x 4)
  const mead = gis(".,.'" + ",';." + "';\"," + "\"v';");
  // d: strokes by direction (0, 45, 90, 135 degrees) + the curl
  const comb = gis('-/|\\~');
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uMoonDir: U.uMoonDir, uMoonColor: U.uMoonColor, uAmbient: U.uAmbient,
      uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uFocus: U.uFocus,
      uCamPos: U.uCamPos, uPLPos: U.uPLPos, uPLCol: U.uPLCol, uPLRad: U.uPLRad,
      uShadowMap: U.uShadowMap, uShadowMatrix: U.uShadowMatrix, uShadowTexel: U.uShadowTexel,
      uGlyphAtlas: U.uGlyphAtlas, uScorch: U.uScorch, uScorchBounds: U.uScorchBounds,
      uSoil: { value: soil },
      uAsh: { value: ash },
      uMead: { value: mead },
      uComb: { value: comb },
      uMeadow: { value: null },
      uMeadowExt: { value: 150 },
      uMeadowOn: { value: 0 },
      uDry: { value: 0 },
      // look b: the dragon print (render/dragonPrint.js), its upgrades (dragonPrintFx.js, one shared object)
      // and the hero's wake (world/grassTrail.js) for the printed grass (world/dragonGrass.js)
      ...dragonPrintUniforms(),
      ...DP_FX_U,
      ...DP_STEP_U,
      uTrail: U.uTrail ?? { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4()) },
      uTrailBox: U.uTrailBox ?? { value: Array.from({ length: TRAIL_CH }, () => new THREE.Vector4()) },
      uBend: U.uBend ?? { value: new THREE.Vector4(0, 0, 0, 0) },
      uBendT: U.uBendT ?? { value: new THREE.Vector4(0, 1, 0, 0) },
      uBendS: U.uBendS ?? { value: new THREE.Vector4(0, 0, 0, 0) },
      uBendE: U.uBendE ?? { value: new THREE.Vector4(0, 1, 0, 0) },
      // look b: the relief's slopes, baked one texel a cell (bakeRelief below; DP_BAKE 1 once they are)
      uReliefN: { value: null },
      uReliefR: { value: null },
      uReliefBox: { value: new THREE.Vector4(BAKE.i0, BAKE.j0, BAKE.cols, BAKE.rows) },
    },
    defines: { DP_BAKE: 0, GROUND_LOOK: look ? LOOK_ID[look] : 0, DG_GRASS: look === 'b' ? { 0: 0, a: 1, b: 2 }[dgGrassLook()] : 0, TRAIL_N, TRAIL_CH },
    vertexShader: BASIC_VERT,
    fragmentShader: /* glsl */ `
      ${COMMON_GLSL}
      uniform float uSoil[6];
      uniform float uAsh[5];
      uniform float uMead[16];
      uniform float uComb[5];
      uniform sampler2D uMeadow;
      uniform float uMeadowExt, uMeadowOn, uDry;
      uniform vec4 uTrail[TRAIL_N];
      uniform vec4 uTrailBox[TRAIL_CH];
      uniform vec4 uBend, uBendT, uBendS, uBendE;
#if GROUND_LOOK == 2
      ${DRAGON_PRINT_GLSL}
      ${DRAGON_STEP_GLSL}
      ${RELIEF_GLSL}
      #define DP_RELIEF groundRelief
#if DP_BAKE == 1
      uniform sampler2D uReliefN, uReliefR;
      uniform vec4 uReliefBox;
#endif
      ${DRAGON_PRINT_FX_GLSL}
      ${DG_GRASS_GLSL}
#endif
      varying vec3 vW;
      varying vec3 vN;
      varying vec2 vUv;
      float pick6(float a[6], int i) { float r = a[0]; for (int k = 0; k < 6; k++) if (k == i) r = a[k]; return r; }
      float pick5(float a[5], int i) { float r = a[0]; for (int k = 0; k < 5; k++) if (k == i) r = a[k]; return r; }
      float pick16(float a[16], int i) { float r = a[0]; for (int k = 0; k < 16; k++) if (k == i) r = a[k]; return r; }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.15 * vnoise(p * 4.1 - 3.3); }
      // the meadow's thickness 0..1 (the grass's own density map; 1 in the clearing when none is given)
      float meadowAt(vec2 xz) {
        if (uMeadowOn < 0.5) return 1.0;
        vec2 uv = xz / uMeadowExt + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
        return texture2D(uMeadow, uv).r;
      }
      // a staggered world cell lattice: cell id, the cell's uv, the continuous coordinate
      vec2 lattice(vec2 xz, vec2 size, out vec2 f, out vec2 g) {
        g = vec2(xz.x, -xz.y) / size;
        g.x += hash12(vec2(floor(g.y), 3.7));
        f = fract(g);
        return floor(g);
      }
      vec3 cellWorld(vec2 cell, vec2 size) {
        float sx = hash12(vec2(cell.y, 3.7));
        return vec3((cell.x + 0.5 - sx) * size.x, 0.0, -(cell.y + 0.5) * size.y);
      }
      void main() {
        vec2 sc = scorchAt(vW.xz);
        float burn = sc.x, heat = sc.y;
        float sh = shadowAt(vW + vec3(0.0, 0.05, 0.0));
        vec3 L = ambientAt(vec3(0.0, 1.0, 0.0)) + uMoonColor * uMoonDir.y * sh * 0.85 + pointLights(vW + vec3(0.0, 0.05, 0.0), vec3(0.0, 1.0, 0.0), 0.0);
        // the grass's own light (world/grass.js): the printed meadow is as bright as the blades were
        vec3 Lg = uAmbient * 1.6 + uMoonColor * 0.62 * sh + pointLights(vW + vec3(0.0, 0.35, 0.0), vec3(0.0, 1.0, 0.0), 1.0);
        vec3 col;
        float m = 0.0;
        float h = 0.0;
#if GROUND_LOOK == 1
        // --- a: the letter meadow (cells ~6 x 9 px at 720p)
        vec2 size = vec2(0.16, 0.28);
        vec2 f, g;
        vec2 cell = lattice(vW.xz, size, f, g);
        h = hash12(cell);
        vec3 cw = cellWorld(cell, size);
        float d = meadowAt(cw.xz) * (1.0 - 0.8 * burn) * (1.0 - tornAt(cw.xz));
        // patches: a slow swell of thicker and thinner grass
        float patchK = fbm(cw.xz * 0.35);
        float dd = clamp(max(d, 0.18) * (0.55 + 0.9 * patchK), 0.0, 1.0);
        int lvl = int(clamp(dd * 3.999, 0.0, 3.0));
        float idx = pick16(uMead, lvl * 4 + int(fract(h * 13.7) * 4.0));
        if (burn > 0.35) idx = pick5(uAsh, int(fract(h * 7.1) * 5.0));
        float show = step(h, 0.3 + 0.6 * dd);
        m = glyphGrad(idx, f, dFdx(g), dFdy(g)) * show;
        vec3 soilC = vec3(0.009, 0.012, 0.011);
        vec3 tip = mix(vec3(0.09, 0.15, 0.07), vec3(0.125, 0.18, 0.08), fract(h * 5.3));
        tip = mix(tip, vec3(0.11, 0.105, 0.095), uDry);
        vec3 ink = mix(vec3(0.05, 0.065, 0.05), tip, smoothstep(0.1, 0.9, dd));
        ink = mix(ink, vec3(0.06, 0.055, 0.05), burn);
        // the moon's sheen rolls over the meadow in broad soft bands, never per cell
        float sheen = 0.8 + 0.35 * fbm(cw.xz * 0.12 + vec2(uTime * 0.03, 0.0));
        col = soilC * L + ink * Lg * m * 2.4 * sheen;
#elif GROUND_LOOK == 2
        // --- b: the dragon ground (render/dragonPrint.js: the wyrm's 5 x 8 px cell at 720p, every cell filled)
        vec2 size = vec2(${DP_CELL[0]}, ${DP_CELL[1]});
        vec2 f, g;
        vec2 cell = dpLattice(vW.xz, size, f, g);
        h = hash12(cell);
        vec2 cxz = dpCellCenter(cell, size);
        vec3 cw = vec3(cxz.x, 0.0, cxz.y);
        float d = meadowAt(cxz) * (1.0 - burn);
        float torn = tornAt(cxz);
        // a lit bumpy source: the relief's normal at the cell's centre
        float e = ${RELIEF_E};
#if DP_BAKE == 1
        // (baked: the two parts' steps to +x and +z, one texel a cell; the meadow's part scales with d)
        ivec2 rt = clamp(ivec2(cell) - ivec2(uReliefBox.xy), ivec2(0), ivec2(uReliefBox.zw) - 1);
        vec4 rn = texelFetch(uReliefN, rt, 0);
        vec2 rs = rn.xz + rn.yw * (0.3 + d);
        vec3 N = normalize(vec3(-rs.x / e * 1.4, 1.0, -rs.y / e * 1.4));
#else
        float hc = groundRelief(cxz, d);
        float hx = groundRelief(cxz + vec2(e, 0.0), d);
        float hz = groundRelief(cxz + vec2(0.0, e), d);
        vec3 N = normalize(vec3(-(hx - hc) / e * 1.4, 1.0, -(hz - hc) / e * 1.4));
#endif
        vec3 body = mix(vec3(0.06, 0.062, 0.058), vec3(0.07, 0.11, 0.06), d);
        body = mix(body, vec3(0.085, 0.08, 0.072), uDry);
        body = mix(body, vec3(0.05, 0.045, 0.04), burn);
        float idx = -1.0;
        // [grass] the printed tufts lean the normal, the wake lays them over, a cut mows them (world/dragonGrass.js)
        float tone0 = 0.0;
        dgGrass(cxz, h, d, burn, torn, N, body, tone0, idx);
        // [fx] drifting cloud shadows dim the moon; contact shadows darken the feet of things
        float cloud = dpCloud(cxz);
        float shc = shadowAt(cw + vec3(0.0, 0.05, 0.0)) * cloud;
        float lam = max(dot(N, uMoonDir), 0.0);
        vec3 PL = pointLights(cw + vec3(0.0, 0.05, 0.0), N, 0.0);
        // the tone: how the relief faces the moon (troughs dark, crests caught), the fire's light on top
        float t = smoothstep(uMoonDir.y - 0.3, uMoonDir.y + 0.25, lam) * shc;
        t = clamp(t * 0.85 + luma(PL) * 2.0 + tone0, 0.0, 1.0);
        t *= 1.0 - dpContact(cxz);
        // [fx] a ripple re-prints the cell (another digit, a flash brighter)
        float rip = dpRipple(cxz, h);
        float hh = rip > uDpRipK.w ? fract(h + 0.37) : h;
        if (idx < 0.0) idx = dpGlyph(clamp(t + rip * uDpRipP.x, 0.0, 1.0), hh);
        // [fx] a lit crest prints an outline stroke
        // (on the broad relief: the meadow's small tussocks would print a stroke round every one)
        if (uDpFxOn[3] > 0.5) {
#if DP_BAKE == 1
          vec4 nb = texelFetch(uReliefR, rt, 0);
#else
          float hr = groundRelief(cxz, 0.0);
          vec4 nb = vec4(groundRelief(cxz + vec2(size.x, 0.0), 0.0), groundRelief(cxz - vec2(size.x, 0.0), 0.0),
                         groundRelief(cxz - vec2(0.0, size.y), 0.0), groundRelief(cxz + vec2(0.0, size.y), 0.0)) - hr;
#endif
          float ridx, rg;
          if (dpRidge(cxz, N, t, nb, size, h, ridx, rg)) { idx = ridx; t += rg; }
        }
        if (burn > 0.35) idx = pick5(uAsh, int(fract(h * 7.1) * 5.0));
        m = glyphGrad(idx, f, dFdx(g), dFdy(g));
        col = vec3(0.008, 0.01, 0.01) * L + body * (0.2 + 1.5 * t + rip * uDpRipP.y) * L * m * 1.15;
        // [prints] a fresh footprint: the cells under the foot turn to code, flash and fade (render/dragonStep.js)
        vec3 st = dpStep(cxz, h);
        if (st.x > 0.0) {
          float sm = glyphGrad(st.z, f, dFdx(g), dFdy(g));
          vec3 code = mix(vec3(0.14, 0.5, 0.22), vec3(0.75, 1.35, 0.8), st.y);
          col = mix(col, vec3(0.008, 0.01, 0.01) * L + code * sm, st.x);
        }
#elif GROUND_LOOK == 3
        // --- c: tidy tufts: a fine soil dot lattice under the 3D blades (cells 0.16 x 0.28)
        vec2 size = vec2(0.16, 0.28);
        vec2 f, g;
        vec2 cell = lattice(vW.xz, size, f, g);
        h = hash12(cell);
        float idx = h > 0.5 ? pick6(uSoil, int(fract(h * 13.7) * 6.0)) : pick6(uSoil, 0);
        if (burn > 0.35) idx = pick5(uAsh, int(fract(h * 7.1) * 5.0));
        m = glyphGrad(idx, f, dFdx(g), dFdy(g)) * step(0.35, h);
        vec3 ink = mix(vec3(0.045, 0.06, 0.05), vec3(0.07, 0.065, 0.06), burn);
        col = vec3(0.010, 0.013, 0.012) * L + ink * L * m * 1.4;
#elif GROUND_LOOK == 4
        // --- d: wind-combed strokes (cells ~7 x 10 px at 720p)
        vec2 size = vec2(0.19, 0.31);
        vec2 f, g;
        vec2 cell = lattice(vW.xz, size, f, g);
        h = hash12(cell);
        vec3 cw = cellWorld(cell, size);
        float d = meadowAt(cw.xz) * (1.0 - 0.8 * burn) * (1.0 - tornAt(cw.xz));
        // the flow: the prevailing lean turned by a slow field (the grass lies in swathes)
        float ang = 0.6 + (fbm(cw.xz * 0.06) - 0.5) * 4.0;
        vec2 dir = vec2(cos(ang), sin(ang));
        // long streaks along the flow, broken across it
        float along = dot(cw.xz, dir), across = dot(cw.xz, vec2(-dir.y, dir.x));
        float streak = vnoise(vec2(along * 0.18, across * 2.4)) * 0.7 + vnoise(vec2(along * 0.5, across * 5.0)) * 0.3;
        streak = smoothstep(0.45, 0.8, streak);
        // the stroke for the screen direction of the flow (x right, -z up)
        float sa = atan(-dir.y, dir.x);
        float q = mod(sa / 3.14159265 * 4.0 + 0.5, 4.0);
        int k = int(q);
        float curl = abs(fbm(cw.xz * 0.09 + 0.07) - fbm(cw.xz * 0.09 - 0.07));
        float idx = pick5(uComb, curl > 0.03 ? 4 : k);
        if (burn > 0.35) idx = pick5(uAsh, int(fract(h * 7.1) * 5.0));
        float dk = max(d, 0.55);
        float show = step(h * 0.6 + 0.25, streak * dk + 0.12 * dk);
        m = glyphGrad(idx, f, dFdx(g), dFdy(g)) * show;
        vec3 tip = mix(vec3(0.085, 0.14, 0.065), vec3(0.12, 0.17, 0.075), streak);
        tip = mix(tip, vec3(0.11, 0.105, 0.095), uDry);
        tip = mix(tip, vec3(0.06, 0.055, 0.05), burn);
        // the soil between: a whisper of dots
        float dot0 = glyphGrad(uSoil[0], f, dFdx(g), dFdy(g)) * step(0.78, fract(h * 9.1)) * (1.0 - show);
        col = vec3(0.009, 0.012, 0.011) * L + tip * Lg * m * (1.4 + 1.1 * streak) + vec3(0.04, 0.05, 0.045) * L * dot0;
#else
        // glyph field: cells 0.34 x 0.5 m, upright on screen (north = glyph up)
        vec2 g = vec2(vW.x, -vW.z) / vec2(0.34, 0.5);
        g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
        vec2 cell = floor(g);
        vec2 f = fract(g);
        h = hash12(cell);
        if (h > 0.5) {
          int i = int(fract(h * 13.7) * 6.0);
          float idx = pick6(uSoil, i);
          if (burn > 0.35) idx = pick5(uAsh, int(fract(h * 7.1) * 5.0));
          m = glyphGrad(idx, f, dFdx(g), dFdy(g));
        }
        vec3 soil = vec3(0.010, 0.013, 0.012);
        vec3 ink = mix(vec3(0.045, 0.06, 0.05), vec3(0.07, 0.065, 0.06), burn);
        col = soil * L + ink * L * m * 1.6;
#endif
        col = mix(col, col * vec3(0.5, 0.45, 0.42), burn * 0.6);
        // embers glowing in the ash
        float flick = 0.65 + 0.35 * sin(uTime * 9.0 + h * 40.0);
        col += vec3(1.0, 0.28, 0.04) * heat * heat * (0.18 + 1.6 * m) * flick;
        col = applyFog(col, vW);
        gl_FragColor = vec4(col, 0.0);
      }
    `,
    blending: THREE.NoBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ground';
  mesh.userData.look = look;
  // The ground is drawn LAST of the solid things (ADR-199): it is the largest surface, its shader the
  // dearest, and the floors, the trees and the fighters cover much of it; drawn first (as its material's
  // low id had it) every one of those pixels was shaded and then painted over. Drawn last, the depth test
  // throws them out unshaded. A strict test keeps the picture as it was where something lies exactly in
  // the ground's plane: whatever else is there still wins, as it did when it was drawn over the ground.
  mesh.renderOrder = GROUND_ORDER;
  mat.depthFunc = THREE.LessDepth;
  /**
   * Bake the relief once on the GPU (look b; bakeRelief above) and have the ground read it. Call before the
   * ground's first draw (world.js; the renderer's context restored: again). True when the ground reads it.
   */
  let reliefTargets = null;
  mesh.userData.bakeRelief = (renderer) => {
    if (look !== 'b') return false;
    const rts = bakeRelief(renderer, mat, reliefTargets);
    if (!rts) return mat.defines.DP_BAKE === 1;
    reliefTargets = rts;
    if (mat.defines.DP_BAKE !== 1) {
      mat.defines.DP_BAKE = 1;
      mat.needsUpdate = true;
    }
    return true;
  };
  /** Bake the meadow's density (world/grass.js) into the ground (looks a, b, d print the grass). */
  mesh.userData.setMeadow = (density, extent = 150, dry = 0) => {
    if (!look || look === 'c') return;
    const N = 300;
    const data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -extent / 2 + ((i + 0.5) / N) * extent;
        const z = -extent / 2 + ((j + 0.5) / N) * extent;
        const v = Math.max(0, Math.min(1, density(x, z) || 0));
        data[(j * N + i) * 4] = Math.round(v * 255);
        data[(j * N + i) * 4 + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    mat.uniforms.uMeadow.value = tex;
    mat.uniforms.uMeadowExt.value = extent;
    mat.uniforms.uMeadowOn.value = 1;
    mat.uniforms.uDry.value = dry;
  };
  return mesh;
}
